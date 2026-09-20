/**
 * Missing Clips — the gap check, with the full picture.
 *
 * `sequences.ts` answers one question for the uploader: which clips never made
 * it off the card. This is the tool's own scanner, ported from the utility
 * app's SequenceScanner: it keeps every sequence including the complete ones,
 * remembers the first and last clip of each, and records which folders a
 * sequence spans, because the report has to read like something you can send
 * to the person who copied the cards.
 *
 * The counter-finding is the same reasoning as `sequences.ts` and shares its
 * parsing helpers.
 */
import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { digitRuns, maskRun, tokenize } from '../sequences';
import type { DigitRun } from '../sequences';
import type { ClipSequence, MediaKind, SequenceScanOptions, SequenceScanResult } from '../../shared/contracts';

export const MEDIA_EXTENSIONS: Record<MediaKind, string[]> = {
  video: ['mp4', 'mov', 'mxf', 'mts', 'm2ts', 'm2t', 'avi', 'mkv', 'm4v', 'avchd', 'braw', 'r3d',
    'insv', 'insp', '360', 'wmv', 'dv', 'mpg', 'mpeg', 'vob', 'webm', 'ari'],
  photo: ['jpg', 'jpeg', 'png', 'heic', 'heif', 'tif', 'tiff', 'bmp', 'webp', 'gpr',
    'arw', 'cr2', 'cr3', 'crw', 'nef', 'nrw', 'raf', 'dng', 'orf', 'rw2', 'raw',
    'srw', 'pef', '3fr', 'fff', 'iiq', 'x3f', 'erf', 'mos', 'kdc', 'dcr'],
  audio: ['wav', 'mp3', 'aac', 'aif', 'aiff', 'flac', 'm4a', 'ogg', 'wma', 'caf', 'bwf'],
};

/** Proxy and sidecar companions cameras drop next to the real clips. */
export const SIDECAR_EXTENSIONS = new Set(['lrf', 'lrv', 'thm', 'xml', 'cpi', 'bim', 'sec', 'modd',
  'moff', 'bdm', 'mpl', 'ifo', 'xmp', 'aae', 'pek', 'cfa', 'dat', 'bin', 'log', 'ind', 'inp', 'idx',
  'sub', 'txt', 'md5', 'sha', 'json', 'plist']);

export interface FileRecord {
  name: string; displayExt: string; lowerExt: string; folder: string;
  tokens: string[]; seps: string[]; runs: DigitRun[][];
}

/** Lexicographic tuple comparison — the first component that differs decides. */
function outranks(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

/**
 * Stands in for a per-clip id inside a sequence's identity. `null` rather than
 * a rare character, because a filename may contain any character at all and a
 * sentinel that can collide is a sentinel that eventually will.
 */
const MASK = null;

/**
 * Groups the files, works out which digits are the clip counter, and builds
 * one sequence per naming pattern. Pure: the walking is done by the caller, so
 * this can be tested with a list of names.
 */
export function analyzeSequences(
  records: FileRecord[],
  options: SequenceScanOptions,
  rootName: string,
): { sequences: ClipSequence[]; unnumberedCount: number } {
  interface Bucket {
    numbers: Set<number>; namesByNumber: Map<number, string>; widths: Map<number, number>;
    displayExt: string; template: string; folders: Set<string>; folder: string; identity: string; ext: string;
  }

  const populations = new Map<string, number[]>();
  records.forEach((record, index) => {
    const folder = options.combineAcrossSubfolders ? '' : record.folder;
    const key = JSON.stringify([folder, record.lowerExt, record.tokens.length, record.seps]);
    const bucket = populations.get(key);
    if (bucket) bucket.push(index); else populations.set(key, [index]);
  });

  const buckets = new Map<string, Bucket>();

  for (const [key, indexes] of populations) {
    const folderOfPopulation = JSON.parse(key)[0] as string;
    const n = indexes.length;
    const tokenCount = records[indexes[0]].tokens.length;

    const distinct: Set<string>[] = Array.from({ length: tokenCount }, () => new Set<string>());
    for (const index of indexes) {
      for (let k = 0; k < tokenCount; k++) distinct[k].add(records[index].tokens[k]);
    }

    // The counter is a digit run present in every file of the population.
    // Prefer a consistent digit width, then the most distinct values, then a
    // densely packed range, then fewer digits — which is what separates a clip
    // counter from a shoot date or a random per-clip id.
    let chosen: { token: number; run: number } | null = null;
    let best: [number, number, number, number] = [-1, -1, -1, -10];
    for (let k = 0; k < tokenCount; k++) {
      const runCounts = new Set(indexes.map(i => records[i].runs[k].length));
      if (runCounts.size !== 1) continue;
      const runCount = [...runCounts][0];
      if (!runCount) continue;
      for (let j = 0; j < runCount; j++) {
        const values = new Set<number>();
        const widths = new Set<number>();
        for (const index of indexes) {
          const run = records[index].runs[k][j];
          values.add(run.value); widths.add(run.width);
        }
        if (values.size <= 1) continue;
        const lo = Math.min(...values), hi = Math.max(...values);
        const density = values.size / (hi - lo + 1);
        const score: [number, number, number, number] =
          [widths.size === 1 ? 1 : 0, values.size, density, -Math.min(...widths)];
        if (outranks(score, best)) { best = score; chosen = { token: k, run: j }; }
      }
    }

    // A token that is near-unique per file is a per-clip id — Canon's
    // `2607254Y`, an ARRI reel hash. Mask it so it stops splitting the
    // sequence. A token with only a few values is usually a shoot date and is
    // kept, because numbering normally restarts with it.
    const masked = Array.from({ length: tokenCount }, () => false);
    if (n >= 4) {
      for (let k = 0; k < tokenCount; k++) {
        if (chosen && k === chosen.token) continue;
        masked[k] = distinct[k].size / n >= 0.8;
      }
    }

    for (const index of indexes) {
      const record = records[index];
      let counter: DigitRun | undefined;
      let counterToken = 0;

      if (chosen) {
        counterToken = chosen.token;
        counter = record.runs[chosen.token][chosen.run];
      } else {
        // Nothing varies (a lone file): fall back to its last number.
        for (let k = tokenCount - 1; k >= 0; k--) {
          if (record.runs[k].length) { counterToken = k; counter = record.runs[k][record.runs[k].length - 1]; break; }
        }
      }
      if (!counter) continue;

      const identityParts: (string | null)[] = [];
      for (let k = 0; k < tokenCount; k++) {
        if (k === counterToken) identityParts.push(maskRun(record.tokens[k], counter));
        else if (masked[k]) identityParts.push(MASK);
        else identityParts.push(record.tokens[k]);
      }

      // The short name shown for a missing clip: everything up to and
      // including the counter, minus the masked noise.
      const parts: string[] = [];
      const joins: string[] = [];
      for (let k = 0; k <= counterToken; k++) {
        const piece = k === counterToken ? maskRun(record.tokens[k], counter) : (masked[k] ? null : record.tokens[k]);
        if (piece === null) continue;
        if (parts.length) joins.push(k > 0 ? record.seps[k - 1] : '');
        parts.push(piece);
      }
      let template = parts[0] ?? '#';
      parts.slice(1).forEach((piece, m) => { template += joins[m] + piece; });

      const bucketKey = JSON.stringify([folderOfPopulation, identityParts, record.seps, record.lowerExt]);
      let bucket = buckets.get(bucketKey);
      if (!bucket) {
        bucket = {
          numbers: new Set(), namesByNumber: new Map(), widths: new Map(), displayExt: record.displayExt,
          template, folders: new Set(), folder: folderOfPopulation,
          identity: identityParts.map(part => part ?? '#id').join('·'), ext: record.lowerExt,
        };
        buckets.set(bucketKey, bucket);
      }
      bucket.numbers.add(counter.value);
      bucket.namesByNumber.set(counter.value, record.name);
      bucket.widths.set(counter.width, (bucket.widths.get(counter.width) || 0) + 1);
      bucket.folders.add(record.folder);
    }
  }

  const sequences: ClipSequence[] = [];
  // A bucket with nothing in it can only come from a name whose counter could
  // not be read; those files are reported rather than silently dropped.
  let unnumberedCount = 0;
  for (const bucket of buckets.values()) {
    const numbers = [...bucket.numbers].sort((a, b) => a - b);
    if (!numbers.length) { unnumberedCount++; continue; }

    // The commonest digit width wins; a tie goes to the shorter one.
    let width = 4, seen = -1;
    for (const [w, count] of bucket.widths) if (count > seen || (count === seen && w < width)) { width = w; seen = count; }

    const pad = (value: number): string => String(value).padStart(width, '0');
    const nameFor = (value: number): string => `${bucket.template.replace('#', pad(value))}.${bucket.displayExt}`;

    sequences.push({
      id: `${bucket.folder}|${bucket.identity}|${bucket.ext}`,
      folder: bucket.folder,
      identity: bucket.identity,
      ext: bucket.ext,
      displayExt: bucket.displayExt,
      width,
      template: bucket.template,
      numbers,
      folders: [...bucket.folders],
      rootName,
      firstName: bucket.namesByNumber.get(numbers[0]) ?? nameFor(numbers[0]),
      lastName: bucket.namesByNumber.get(numbers[numbers.length - 1]) ?? nameFor(numbers[numbers.length - 1]),
    });
  }

  const compare = (a: string, b: string): number => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  sequences.sort((a, b) => compare(a.folder, b.folder) || compare(a.template, b.template) || (a.ext < b.ext ? -1 : a.ext > b.ext ? 1 : 0));

  return { sequences, unnumberedCount };
}

/** Walks the folder, then hands what it found to `analyzeSequences`. */
export async function scanSequences(
  rootPath: string,
  options: SequenceScanOptions,
  signal: AbortSignal,
  progress: (seen: number) => void,
): Promise<SequenceScanResult> {
  const root = await fs.realpath(rootPath);
  const rootName = path.basename(root);
  const kinds: MediaKind[] = [];
  if (options.includeVideo) kinds.push('video');
  if (options.includePhoto) kinds.push('photo');
  if (options.includeAudio) kinds.push('audio');
  const allowed = new Set<string>((kinds.length ? kinds : (['video', 'photo', 'audio'] as MediaKind[]))
    .flatMap(kind => MEDIA_EXTENSIONS[kind]));

  const records: FileRecord[] = [];
  let totalFiles = 0;
  let skippedCount = 0;
  let unnumberedCount = 0;
  let seen = 0;

  async function visit(folder: string): Promise<void> {
    signal.throwIfAborted();
    let entries: Dirent[];
    try { entries = await fs.readdir(folder, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) { await visit(full); continue; }
      if (!entry.isFile()) continue;

      seen++;
      if (seen % 250 === 0) progress(seen);
      totalFiles++;

      const dot = entry.name.lastIndexOf('.');
      const displayExt = dot > 0 ? entry.name.slice(dot + 1) : '';
      const lowerExt = displayExt.toLowerCase();
      if (options.ignoreSidecars && SIDECAR_EXTENSIONS.has(lowerExt)) { skippedCount++; continue; }
      if (options.mediaOnly && !allowed.has(lowerExt)) { skippedCount++; continue; }

      const stem = dot > 0 ? entry.name.slice(0, dot) : entry.name;
      const { tokens, seps } = tokenize(stem);
      const runs = tokens.map(digitRuns);
      if (!runs.some(r => r.length > 0)) { unnumberedCount++; continue; }

      const relativeFolder = path.relative(root, folder).split(path.sep).join('/');
      records.push({
        name: entry.name, displayExt, lowerExt,
        folder: relativeFolder === '.' ? '' : relativeFolder,
        tokens, seps, runs,
      });
    }
  }
  await visit(root);
  progress(seen);

  const analyzed = analyzeSequences(records, options, rootName);
  return {
    rootPath: root,
    rootName,
    sequences: analyzed.sequences,
    unnumberedCount: unnumberedCount + analyzed.unnumberedCount,
    skippedCount,
    totalFiles,
    scannedAt: new Date().toISOString(),
  };
}
