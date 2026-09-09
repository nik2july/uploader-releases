import fs from 'node:fs/promises';
import type { Dir } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffprobe from 'ffprobe-static';
import type { ScanSummary } from '../shared/contracts';
import type { TransferStore } from './store';

const exec = promisify(execFile);
const RAW = new Set(['.raw', '.arw', '.cr2', '.cr3', '.nef', '.dng', '.raf', '.orf', '.rw2']);
const PHOTO = new Set([...RAW, '.jpg', '.jpeg', '.png', '.tif', '.tiff', '.heic', '.webp']);
const VIDEO = new Set(['.mp4', '.mov', '.mxf', '.braw', '.r3d', '.m4v', '.mts', '.m2ts', '.avi', '.mkv', '.insv', '.webm']);

export async function scanDirectory(store: TransferStore, jobId: string, signal: AbortSignal, changed: () => void): Promise<void> {
  const job = store.get(jobId);
  const root = await fs.realpath(job.rootPath);
  const result: ScanSummary = { totalPhotos: 0, billablePhotos: 0, totalVideos: 0, totalDurationSeconds: 0,
    unknownVideoCount: 0, totalBytes: 0, fileCount: 0, folderCount: 0, pairedPhotos: 0,
    excludedBillingFiles: 0, warnings: [], readErrors: 0 };
  const photoPairs = new Map<string, Set<string>>();
  const excluded = new Set(job.options.excludedBillingFolders.map(s => s.trim().toLowerCase()).filter(Boolean));
  const warn = (message: string): void => { if (result.warnings.length < 200) result.warnings.push(message); };
  const publish = (): void => { store.patch(jobId, { scan: { ...result } }); changed(); };
  async function walk(folder: string, billingIncluded: boolean): Promise<void> {
    signal.throwIfAborted();
    const relativeFolder = path.relative(root, folder).split(path.sep).join('/');
    store.addFolder(jobId, relativeFolder); result.folderCount++;
    let entries: Dir;
    try { entries = await fs.opendir(folder); }
    catch { result.readErrors++; warn(`Cannot read folder: ${relativeFolder || job.rootName}`); return; }
    for await (const entry of entries) {
      signal.throwIfAborted();
      const full = path.join(folder, entry.name);
      const relativePath = path.relative(root, full).split(path.sep).join('/');
      if (entry.isSymbolicLink()) { warn(`Symbolic link excluded from upload: ${relativePath}`); continue; }
      if (entry.name === '.DS_Store' || entry.name.startsWith('._')) continue;
      if (entry.isDirectory()) { await walk(full, billingIncluded && !excluded.has(entry.name.toLowerCase())); continue; }
      if (!entry.isFile()) { warn(`Unsupported file entry: ${relativePath}`); continue; }
      try {
        const stat = await fs.stat(full);
        const ext = path.extname(entry.name).toLowerCase();
        const kind = PHOTO.has(ext) ? 'photo' : VIDEO.has(ext) ? 'video' : 'other';
        let durationSeconds: number | undefined;
        let error: string | undefined;
        result.fileCount++; result.totalBytes += stat.size;
        if (!billingIncluded) result.excludedBillingFiles++;
        if (kind === 'photo') {
          result.totalPhotos++;
          if (billingIncluded) {
            result.billablePhotos++;
            const key = relativePath.slice(0, -ext.length);
            const pair = photoPairs.get(key) ?? new Set<string>();
            const wasPair = pair.has('raw') && pair.has('jpeg');
            pair.add(RAW.has(ext) ? 'raw' : ['.jpg', '.jpeg'].includes(ext) ? 'jpeg' : ext);
            if (!wasPair && pair.has('raw') && pair.has('jpeg')) {
              result.pairedPhotos++;
              if (job.options.countPhotoPairsOnce) result.billablePhotos--;
            }
            photoPairs.set(key, pair);
          }
        }
        if (kind === 'video') {
          result.totalVideos++;
          if (billingIncluded) {
            try {
              const binary = ffprobe.path.replace(/\.asar\//, '.asar.unpacked/');
              const { stdout } = await exec(binary, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', full], { timeout: 30000, maxBuffer: 1024 * 1024, signal });
              durationSeconds = Number(JSON.parse(stdout).format?.duration);
              if (!Number.isFinite(durationSeconds) || durationSeconds! <= 0) throw new Error('Unknown duration');
              result.totalDurationSeconds += durationSeconds!;
            } catch {
              signal.throwIfAborted();
              durationSeconds = undefined; result.unknownVideoCount++;
              error = 'Duration could not be measured. Upload is allowed; long-form billing needs review.';
              warn(`${relativePath}: ${error}`);
            }
          }
        }
        store.addFile(jobId, { relativePath, size: stat.size, mtimeMs: stat.mtimeMs, kind, billingIncluded, durationSeconds, error });
        if (result.fileCount % 20 === 0) publish();
      } catch (err) {
        signal.throwIfAborted(); result.readErrors++;
        warn(`Cannot inventory ${relativePath}: ${err instanceof Error ? err.message : 'Read error'}`);
      }
    }
  }
  await walk(root, true);
  store.patch(jobId, { rootPath: root, scan: result, status: result.readErrors ? 'needs_attention' : 'ready',
    error: result.readErrors ? 'Some folders or files could not be inventoried. Resolve permissions and scan again before uploading.' : undefined });
  changed();
}
