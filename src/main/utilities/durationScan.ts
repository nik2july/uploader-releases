/**
 * How long is this shoot?
 *
 * Walks a folder and every folder beneath it, measures each clip, and hands
 * back one flat list. Nothing is written and nothing is re-encoded. The
 * rolling-up into a tree, and the arithmetic of leaving folders out, happens
 * in the renderer, so ticking a folder off is instant — every clip was
 * measured either way.
 */
import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { probeDuration } from './ffTools';
import { DURATION_EXTENSIONS } from '../../shared/contracts';
import type { DurationFile, DurationKind, DurationScanResult } from '../../shared/contracts';

interface Found { full: string; relativePath: string; folderPath: string; name: string; ext: string; bytes: number }

async function walk(root: string, allowed: Map<string, DurationKind>, signal: AbortSignal): Promise<Found[]> {
  const found: Found[] = [];
  async function visit(folder: string): Promise<void> {
    signal.throwIfAborted();
    let entries: Dirent[];
    try { entries = await fs.readdir(folder, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name.startsWith('._')) continue;
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) { await visit(full); continue; }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).slice(1).toLowerCase();
      if (!allowed.has(ext)) continue;
      let bytes = 0;
      try { bytes = (await fs.stat(full)).size; } catch { /* counted as zero bytes */ }
      const relativePath = path.relative(root, full).split(path.sep).join('/');
      found.push({
        full, relativePath, name: entry.name, ext, bytes,
        folderPath: path.dirname(relativePath) === '.' ? '' : path.dirname(relativePath),
      });
    }
  }
  await visit(root);
  return found;
}

/**
 * Measures every clip under `rootPath`.
 *
 * `progress` is called after each file so the interface can show how far in it
 * is; a scan of a 600-clip delivery takes a while and silence would read as a
 * hang. Aborting keeps whatever was measured — a partial answer beats none.
 */
export async function scanDurations(
  rootPath: string,
  kinds: DurationKind[],
  signal: AbortSignal,
  progress: (done: number, total: number) => void,
): Promise<DurationScanResult> {
  const wanted: DurationKind[] = kinds.length ? kinds : ['video'];
  const allowed = new Map<string, DurationKind>();
  for (const kind of wanted) for (const ext of DURATION_EXTENSIONS[kind]) allowed.set(ext, kind);

  const root = await fs.realpath(rootPath);
  const found = await walk(root, allowed, signal);
  found.sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true, sensitivity: 'base' }));
  progress(0, found.length);

  const files: DurationFile[] = new Array(found.length);
  let done = 0;
  let cancelled = false;
  // ffprobe is a separate process per clip; more than a dozen at once buys
  // nothing and starves the rest of the app.
  const window = Math.max(4, Math.min(12, os.cpus().length || 4));
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      if (signal.aborted) { cancelled = true; return; }
      const index = next++;
      if (index >= found.length) return;
      const item = found[index];
      let duration = 0;
      try { duration = await probeDuration(item.full, signal); }
      catch { cancelled = true; return; }
      files[index] = {
        relativePath: item.relativePath, folderPath: item.folderPath, name: item.name,
        ext: item.ext, kind: allowed.get(item.ext) ?? 'video', duration, bytes: item.bytes,
      };
      progress(++done, found.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(window, found.length) }, worker));

  return {
    rootPath: root,
    rootName: path.basename(root),
    files: files.filter(Boolean),
    scannedAt: new Date().toISOString(),
    cancelled: cancelled || signal.aborted,
  };
}
