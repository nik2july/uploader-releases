/**
 * Rolling a measured shoot up into a tree, and the arithmetic of leaving
 * folders out of the total.
 *
 * Proxy folders double-count a delivery — in one real shoot they added 1:21:02
 * to a 7:21:46 total — so a folder can be ticked off in the tree or skipped by
 * name. Nothing is rescanned when that happens: every clip was measured either
 * way, and only the totals change.
 *
 * Excluded folders stay visible with their runtime in brackets, so the total
 * says what it left out rather than quietly dropping it.
 */
import type { DurationFile, DurationScanResult } from '../../../shared/contracts';
import { fmtBytes, fmtClock, fmtClockPadded, fmtInt } from './utilityFormat';

export interface DurationFolderNode {
  /** Relative to the folder that was picked; "" = that folder. */
  path: string;
  name: string;
  depth: number;
  subfolders: DurationFolderNode[];
  files: DurationFile[];

  /** Left out of the totals, by a tick or by the skip list. */
  isExcluded: boolean;

  /** This folder and everything beneath it, counting only what is included. */
  totalDuration: number;
  totalBytes: number;
  totalCount: number;
  unreadableCount: number;

  /** The same totals ignoring every exclusion, so the app can say what it left out. */
  rawDuration: number;
  rawBytes: number;
  rawCount: number;

  /** Files sitting directly in this folder only, before exclusions. */
  ownDuration: number;
  ownCount: number;
}

const compare = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

function node(path: string, depth: number): DurationFolderNode {
  return {
    path, depth, name: path ? path.slice(path.lastIndexOf('/') + 1) : '',
    subfolders: [], files: [], isExcluded: false,
    totalDuration: 0, totalBytes: 0, totalCount: 0, unreadableCount: 0,
    rawDuration: 0, rawBytes: 0, rawCount: 0, ownDuration: 0, ownCount: 0,
  };
}

/** Builds the folder tree from a flat scan. Totals are filled by `applyExclusions`. */
export function buildTree(result: DurationScanResult): DurationFolderNode {
  const root = node('', 0);
  root.name = result.rootName;
  const nodes = new Map<string, DurationFolderNode>([['', root]]);

  function folder(path: string): DurationFolderNode {
    const existing = nodes.get(path);
    if (existing) return existing;
    const slash = path.lastIndexOf('/');
    const parent = folder(slash < 0 ? '' : path.slice(0, slash));
    const created = node(path, parent.depth + 1);
    parent.subfolders.push(created);
    nodes.set(path, created);
    return created;
  }

  for (const file of result.files) {
    const owner = folder(file.folderPath);
    owner.files.push(file);
    owner.ownDuration += file.duration;
    owner.ownCount += 1;
  }

  (function sort(current: DurationFolderNode): void {
    current.subfolders.sort((a, b) => compare(a.name, b.name));
    current.files.sort((a, b) => compare(a.name, b.name));
    current.subfolders.forEach(sort);
  })(root);

  applyExclusions(root, new Set());
  return root;
}

/**
 * Recomputes every total in place. A folder under an excluded one is excluded
 * whatever the set says.
 */
export function applyExclusions(root: DurationFolderNode, excluded: Set<string>): void {
  (function walk(current: DurationFolderNode, inherited: boolean): void {
    current.isExcluded = inherited || (current.path !== '' && excluded.has(current.path));

    current.rawDuration = current.ownDuration;
    current.rawBytes = current.files.reduce((total, file) => total + file.bytes, 0);
    current.rawCount = current.files.length;

    let duration = current.isExcluded ? 0 : current.ownDuration;
    let bytes = current.isExcluded ? 0 : current.rawBytes;
    let count = current.isExcluded ? 0 : current.rawCount;
    let unreadable = current.isExcluded ? 0 : current.files.filter(file => file.duration <= 0).length;

    for (const child of current.subfolders) {
      walk(child, current.isExcluded);
      duration += child.totalDuration;
      bytes += child.totalBytes;
      count += child.totalCount;
      unreadable += child.unreadableCount;
      current.rawDuration += child.rawDuration;
      current.rawBytes += child.rawBytes;
      current.rawCount += child.rawCount;
    }

    current.totalDuration = duration;
    current.totalBytes = bytes;
    current.totalCount = count;
    current.unreadableCount = unreadable;
  })(root, false);
}

/** Depth-first list of every folder, parents before children. */
export function flatten(root: DurationFolderNode): DurationFolderNode[] {
  const out: DurationFolderNode[] = [root];
  for (const child of root.subfolders) out.push(...flatten(child));
  return out;
}

/** Every file at or below a folder that is not excluded, in path order. */
export function includedFiles(root: DurationFolderNode): DurationFile[] {
  if (root.isExcluded) return [];
  const out = [...root.files];
  for (const child of root.subfolders) out.push(...includedFiles(child));
  return out.sort((a, b) => compare(a.relativePath, b.relativePath));
}

/** The outermost excluded folders — the ones worth naming. */
export function excludedFolders(root: DurationFolderNode): DurationFolderNode[] {
  const out: DurationFolderNode[] = [];
  (function walk(current: DurationFolderNode): void {
    if (current.isExcluded) { out.push(current); return; }  // don't list its children too
    current.subfolders.forEach(walk);
  })(root);
  return out;
}

export interface DurationTotals {
  duration: number; bytes: number; count: number; average: number;
  excludedDuration: number; excludedCount: number; unreadable: DurationFile[];
}

export function totalsFor(root: DurationFolderNode, files: DurationFile[]): DurationTotals {
  return {
    duration: root.totalDuration,
    bytes: root.totalBytes,
    count: root.totalCount,
    average: root.totalCount > 0 ? root.totalDuration / root.totalCount : 0,
    excludedDuration: root.rawDuration - root.totalDuration,
    excludedCount: root.rawCount - root.totalCount,
    unreadable: files.filter(file => file.duration <= 0),
  };
}

/** Duration and count per file extension, biggest first. */
export function byExtension(files: DurationFile[]): { ext: string; count: number; duration: number; bytes: number }[] {
  const map = new Map<string, { count: number; duration: number; bytes: number }>();
  for (const file of files) {
    const entry = map.get(file.ext) ?? { count: 0, duration: 0, bytes: 0 };
    entry.count += 1; entry.duration += file.duration; entry.bytes += file.bytes;
    map.set(file.ext, entry);
  }
  return [...map.entries()]
    .map(([ext, entry]) => ({ ext: ext.toUpperCase(), ...entry }))
    .sort((a, b) => b.duration - a.duration);
}

/**
 * The folder's path relative to the one picked — unambiguous in a way the
 * indented row name is not, since five folders can all be called "01 Cam" —
 * followed by its runtime. An excluded folder still copies its own runtime,
 * marked as not counted.
 */
export function folderLine(folder: DurationFolderNode, rootName: string): string {
  const name = folder.path === '' ? rootName : folder.path;
  return folder.isExcluded
    ? `${name} — ${fmtClockPadded(folder.rawDuration)} (not counted)`
    : `${name} — ${fmtClockPadded(folder.totalDuration)}`;
}

/** A short block you can paste straight into a chat or an email. */
export function summaryText(rootName: string, root: DurationFolderNode, files: DurationFile[]): string {
  const totals = totalsFor(root, files);
  const lines: string[] = [];
  lines.push(`*${rootName}*`);
  lines.push(`Total runtime: ${fmtClockPadded(totals.duration)}  (${(totals.duration / 3600).toFixed(2)} hours)`);
  lines.push(`Clips: ${fmtInt(totals.count)}   Size: ${fmtBytes(totals.bytes)}   Average: ${fmtClock(totals.average)}`);
  lines.push('');

  for (const folder of flatten(root)) {
    if (folder.isExcluded || folder.totalCount === 0) continue;
    const label = folder.path === '' ? rootName : folder.path;
    lines.push(`${label} — ${fmtInt(folder.totalCount)} clips, ${fmtClockPadded(folder.totalDuration)}`);
  }

  if (totals.excludedDuration > 0) {
    lines.push('');
    const names = excludedFolders(root).map(folder => folder.path).sort(compare).join(', ');
    lines.push(`Not counted: ${names} — ${fmtInt(totals.excludedCount)} clips, ${fmtClockPadded(totals.excludedDuration)}`);
  }

  if (totals.unreadable.length) {
    lines.push('');
    lines.push(`Could not be read (counted as 0): ${totals.unreadable.length}`);
    for (const file of totals.unreadable.slice(0, 25)) lines.push(`  ${file.relativePath}`);
    if (totals.unreadable.length > 25) lines.push(`  …and ${totals.unreadable.length - 25} more`);
  }
  return lines.join('\n');
}

/** The unreadable list on its own, for the message asking for those clips again. */
export function unreadableList(rootName: string, unreadable: DurationFile[]): string {
  const lines = [`${rootName} — ${unreadable.length} file(s) could not be read:`];
  for (const file of unreadable) lines.push(`${file.relativePath}  (${fmtBytes(file.bytes)})`);
  return lines.join('\n');
}

/** One row per file, plus a header naming whatever was left out. */
export function csvText(rootName: string, root: DurationFolderNode, files: DurationFile[]): string {
  const totals = totalsFor(root, files);
  const escape = (value: string): string => `"${value.replace(/"/g, '""')}"`;
  const rows: string[] = [];
  if (totals.excludedDuration > 0) {
    rows.push(escape('Excluded: ' + excludedFolders(root).map(folder => folder.path).sort(compare).join('; ')));
  }
  rows.push('Folder,File,Type,Seconds,Duration,Bytes,Size');
  for (const file of files) {
    rows.push([
      escape(file.folderPath === '' ? rootName : file.folderPath),
      escape(file.name),
      escape(file.ext.toUpperCase()),
      file.duration.toFixed(3),
      escape(fmtClockPadded(file.duration)),
      String(file.bytes),
      escape(fmtBytes(file.bytes)),
    ].join(','));
  }
  rows.push('');
  rows.push([escape('TOTAL'), '', '', totals.duration.toFixed(3), escape(fmtClockPadded(totals.duration)),
    String(totals.bytes), escape(fmtBytes(totals.bytes))].join(','));
  return rows.join('\n');
}

/** Names the unreadable files at or below a folder, for the row's tooltip. */
export function unreadableNames(folder: DurationFolderNode, limit = 12): string {
  const bad: DurationFile[] = [];
  (function walk(current: DurationFolderNode): void {
    if (current.isExcluded) return;
    bad.push(...current.files.filter(file => file.duration <= 0));
    current.subfolders.forEach(walk);
  })(folder);
  const lines = [`${bad.length} file(s) here could not be read:`];
  lines.push(...bad.slice(0, limit).map(file => '  ' + file.name));
  if (bad.length > limit) lines.push(`  …and ${bad.length - limit} more`);
  return lines.join('\n');
}
