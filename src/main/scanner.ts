import fs from 'node:fs/promises';
import type { Dir } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffprobe from 'ffprobe-static';
import type { ScanSummary, OfflineScanResult } from '../shared/contracts';
import { findSequences } from './sequences';
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
    excludedBillingFiles: 0, warnings: [], readErrors: 0, missingClips: [], missingClipCount: 0,
    unreadableFiles: [] };
  const serviceType = job.target?.serviceType;
  const isShortForm = serviceType === 'Short Form';
  const isPhotoOnlyService = serviceType === 'Edited Photos' || serviceType === 'Album';
  const isLongForm = serviceType === 'Long Form';
  const probeVideoDuration = !isShortForm && !isPhotoOnlyService;

  const photoPairs = new Map<string, Set<string>>();
  const seenPaths: { relativePath: string }[] = [];
  const excluded = new Set(job.options.excludedBillingFolders.map(s => s.trim().toLowerCase()).filter(Boolean));
  const selected = job.sourceFiles ? new Set(job.sourceFiles) : undefined;
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
      // File-picker scans share one parent folder. Only inventory the files the
      // owner explicitly selected; a folder scan continues to recurse normally.
      if (selected && !selected.has(relativePath)) continue;
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
          if (billingIncluded && !isShortForm && !isLongForm) {
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
        // A file with no bytes in it is a copy that failed, whatever its type.
        if (stat.size === 0 && result.unreadableFiles.length < 500) {
          result.unreadableFiles.push({ path: relativePath, reason: 'The file is empty — 0 bytes.' });
          error = 'This file is empty. It almost certainly failed to copy.';
        }

        if (kind === 'video') {
          result.totalVideos++;
          // For Short Form and Photo/Album services, video duration measurement is skipped.
          // For Long Form (or untyped work), every clip is probed for duration.
          if (probeVideoDuration) {
            try {
              const binary = ffprobe.path.replace(/\.asar\//, '.asar.unpacked/');
              const { stdout } = await exec(binary, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', full], { timeout: 30000, maxBuffer: 1024 * 1024, signal });
              durationSeconds = Number(JSON.parse(stdout).format?.duration);
              if (!Number.isFinite(durationSeconds) || durationSeconds! <= 0) throw new Error('Unknown duration');
              if (billingIncluded) result.totalDurationSeconds += durationSeconds!;
            } catch {
              signal.throwIfAborted();
              durationSeconds = undefined;
              if (billingIncluded) result.unknownVideoCount++;
              if (stat.size > 0 && result.unreadableFiles.length < 500) {
                result.unreadableFiles.push({ path: relativePath, reason: 'No duration in the file — the clip may be truncated or corrupt.' });
              }
              error = 'This clip could not be read. It may be truncated or corrupt.';
              warn(`${relativePath}: ${error}`);
            }
          }
        }
        store.addFile(jobId, { relativePath, size: stat.size, mtimeMs: stat.mtimeMs, kind, billingIncluded, durationSeconds, error });
        if (kind !== 'other') seenPaths.push({ relativePath });
        if (result.fileCount % 5 === 0) publish();
      } catch (err) {
        signal.throwIfAborted(); result.readErrors++;
        warn(`Cannot inventory ${relativePath}: ${err instanceof Error ? err.message : 'Read error'}`);
      }
    }
  }
  await walk(root, true);

  // Cameras number what they record, so a gap is a file that did not arrive.
  // Worth knowing before a terabyte goes up rather than a week later.
  result.missingClips = findSequences(seenPaths, new Set([...PHOTO, ...VIDEO]));
  result.missingClipCount = result.missingClips.reduce((total, s) => total + s.missingCount, 0);
  if (result.missingClipCount > 0) {
    warn(`${result.missingClipCount} files appear to be missing from the camera numbering.`);
  }
  if (result.unreadableFiles.length > 0) {
    warn(`${result.unreadableFiles.length} files are present but could not be read.`);
  }

  store.patch(jobId, { rootPath: root, scan: result, status: result.readErrors ? 'needs_attention' : 'ready',
    error: result.readErrors ? 'Some folders or files could not be inventoried. Resolve permissions and scan again before uploading.' : undefined });
  changed();
}

/**
 * Scans a folder on an external hard drive or local disk for offline sharing / hard drive handover.
 * Calculates exact billable photo counts (with RAW+JPEG deduplication) or video duration,
 * file sizes, and extracts volume information so users don't have to enter them manually.
 */
export async function scanOfflineDirectory(
  rootPath: string,
  serviceType?: string,
  countPhotoPairsOnce: boolean = true
): Promise<OfflineScanResult> {
  const root = await fs.realpath(rootPath);
  const isShortForm = serviceType === 'Short Form';
  const isPhotoOnlyService = serviceType === 'Edited Photos' || serviceType === 'Album';
  const isLongForm = serviceType === 'Long Form';
  const probeVideoDuration = !isShortForm && !isPhotoOnlyService;

  let totalPhotos = 0;
  let billablePhotos = 0;
  let totalVideos = 0;
  let totalDurationSeconds = 0;
  let totalBytes = 0;
  let fileCount = 0;

  const photoPairs = new Map<string, Set<string>>();

  async function walk(dir: string): Promise<void> {
    let entries: Dir;
    try {
      entries = await fs.opendir(dir);
    } catch {
      return;
    }
    for await (const entry of entries) {
      if (entry.name === '.DS_Store' || entry.name.startsWith('._')) continue;
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const lower = entry.name.toLowerCase();
        if (lower === 'proxies' || lower === 'proxy' || lower === 'exports') continue;
        await walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        const stat = await fs.stat(full);
        const ext = path.extname(entry.name).toLowerCase();
        const kind = PHOTO.has(ext) ? 'photo' : VIDEO.has(ext) ? 'video' : 'other';
        fileCount++;
        totalBytes += stat.size;

        if (kind === 'photo') {
          totalPhotos++;
          if (!isShortForm && !isLongForm) {
            billablePhotos++;
            const relativePath = path.relative(root, full).split(path.sep).join('/');
            const key = relativePath.slice(0, -ext.length);
            const pair = photoPairs.get(key) ?? new Set<string>();
            const wasPair = pair.has('raw') && pair.has('jpeg');
            pair.add(RAW.has(ext) ? 'raw' : ['.jpg', '.jpeg'].includes(ext) ? 'jpeg' : ext);
            if (!wasPair && pair.has('raw') && pair.has('jpeg')) {
              if (countPhotoPairsOnce) billablePhotos--;
            }
            photoPairs.set(key, pair);
          }
        } else if (kind === 'video') {
          totalVideos++;
          if (probeVideoDuration) {
            try {
              const binary = ffprobe.path.replace(/\.asar\//, '.asar.unpacked/');
              const { stdout } = await exec(binary, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', full], { timeout: 15000, maxBuffer: 1024 * 1024 });
              const duration = Number(JSON.parse(stdout).format?.duration);
              if (Number.isFinite(duration) && duration > 0) {
                totalDurationSeconds += duration;
              }
            } catch {
              // Ignore ffprobe failures on individual clips
            }
          }
        }
      } catch {
        // Skip unreadable files
      }
    }
  }

  await walk(root);

  // Extract drive volume label if under /Volumes/<VolumeName>
  const folderName = path.basename(root);
  let driveLabel = folderName;
  const match = root.match(/^\/Volumes\/([^/]+)/);
  if (match && match[1]) {
    driveLabel = `${match[1]} · ${folderName}`;
  } else {
    driveLabel = `Local Drive · ${folderName}`;
  }

  const hours = Math.floor(totalDurationSeconds / 3600);
  const minutes = Math.floor((totalDurationSeconds % 3600) / 60);

  // Format bytes
  const gb = totalBytes / (1024 * 1024 * 1024);
  const formattedSize = gb >= 1 ? `${gb.toFixed(1)} GB` : `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;

  return {
    folderPath: root,
    folderName,
    driveLabel,
    photoCount: billablePhotos > 0 ? billablePhotos : totalPhotos,
    totalPhotos,
    videoCount: totalVideos,
    totalDurationSeconds,
    hours,
    minutes,
    totalBytes,
    formattedSize,
    fileCount
  };
}
