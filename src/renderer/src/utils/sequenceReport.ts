/**
 * Writing the message you actually send.
 *
 * Two shapes, both ported from the utility app: the short one a client can
 * read at a glance, and the fuller WhatsApp-style report with the counts and
 * the request at the end.
 */
import type { ClipSequence, SequenceScanResult } from '../../../shared/contracts';

export interface ReportOptions {
  projectName: string;
  /** Also list the folders where nothing is missing. */
  includeComplete: boolean;
  showDate: boolean;
  /** Keep the message readable rather than listing 400 names. */
  maxMissingListed: number;
  useEmoji: boolean;
  /** false = the short client message. */
  detailed: boolean;
}

export const defaultReportOptions: ReportOptions = {
  projectName: '', includeComplete: true, showDate: true,
  maxMissingListed: 40, useEmoji: true, detailed: false,
};

export function expected(sequence: ClipSequence): number {
  if (!sequence.numbers.length) return 0;
  return sequence.numbers[sequence.numbers.length - 1] - sequence.numbers[0] + 1;
}

export function missingNumbers(sequence: ClipSequence): number[] {
  if (!sequence.numbers.length || expected(sequence) <= sequence.numbers.length) return [];
  const present = new Set(sequence.numbers);
  const out: number[] = [];
  for (let n = sequence.numbers[0]; n <= sequence.numbers[sequence.numbers.length - 1]; n++) {
    if (!present.has(n)) out.push(n);
  }
  return out;
}

export const isComplete = (sequence: ClipSequence): boolean => missingNumbers(sequence).length === 0;
export const totalMissing = (result: SequenceScanResult): number =>
  result.sequences.reduce((sum, sequence) => sum + missingNumbers(sequence).length, 0);

export function shortName(sequence: ClipSequence, value: number): string {
  return sequence.template.replace('#', String(value).padStart(sequence.width, '0'));
}

/** [1,2,3,7,9,10] → [[1,3],[7,7],[9,10]], so gaps read as ranges. */
export function ranges(numbers: number[]): [number, number][] {
  const out: [number, number][] = [];
  let i = 0;
  while (i < numbers.length) {
    let end = i;
    while (end + 1 < numbers.length && numbers[end + 1] === numbers[end] + 1) end++;
    out.push([numbers[i], numbers[end]]);
    i = end + 1;
  }
  return out;
}

/** "C0012, C0100 to C0101" — consecutive gaps collapse into a range. */
export function missingSummary(sequence: ClipSequence, limit: number): string {
  const parts: string[] = [];
  let listed = 0, truncated = 0;
  for (const [lo, hi] of ranges(missingNumbers(sequence))) {
    const count = hi - lo + 1;
    if (listed >= limit) { truncated += count; continue; }
    parts.push(lo === hi ? shortName(sequence, lo) : `${shortName(sequence, lo)} to ${shortName(sequence, hi)}`);
    listed += count;
  }
  let out = parts.join(', ');
  if (truncated > 0) out += ` …+${truncated} more`;
  return out;
}

/** The naming pattern without the counter — "CAM_20250904_#" → "CAM_20250904". */
export function patternLabel(sequence: ClipSequence): string {
  return sequence.template.replace('#', '').replace(/^[_\-. ]+|[_\-. ]+$/g, '');
}

/** Where the sequence lives, written the way the studio would say it aloud. */
export function locationLabel(sequence: ClipSequence): string {
  if (sequence.folder) return sequence.folder;
  const fallback = sequence.rootName || 'Main folder';
  const named = [...sequence.folders]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .map(folder => folder || fallback);
  if (named.length === 0) return fallback;
  if (named.length === 1) return named[0];
  if (named.length <= 3) return named.join(' + ');
  return `${named[0]} + ${named.length - 1} more folders`;
}

/** Everything sits in the folder that was picked. */
export function allAtRoot(result: SequenceScanResult): boolean {
  return result.sequences.every(sequence => !sequence.folder && sequence.folders.every(folder => !folder));
}

export function buildMessage(result: SequenceScanResult, options: ReportOptions): string {
  return options.detailed ? whatsAppMessage(result, options) : compactMessage(result, options);
}

/**
 * The short client message:
 *
 *     Day 1 Haldi/Cam A
 *     First: C0001.MP4
 *     Last: C0250.MP4
 *     Missing (3): C0012, C0100 to C0101
 */
export function compactMessage(result: SequenceScanResult, options: ReportOptions): string {
  const lines: string[] = [];
  const title = options.projectName.trim();
  const headerName = title || result.rootName;

  // When everything sits in the folder the user picked, that folder's name is
  // the only heading needed — no separate title line above it.
  const flat = allAtRoot(result) && result.sequences.length > 0;
  if (!flat && headerName) { lines.push(`*${headerName}*`); lines.push(''); }

  const shown = options.includeComplete ? result.sequences : result.sequences.filter(s => !isComplete(s));
  if (!shown.length) {
    lines.push(result.sequences.length === 0
      ? 'No numbered clips found in this folder.'
      : 'All folders complete — nothing missing.');
    return lines.join('\n');
  }

  // A folder holding several sequences needs each block labelled. Use the file
  // type when that tells them apart, otherwise the name pattern itself.
  const perFolder = new Map<string, ClipSequence[]>();
  for (const sequence of result.sequences) {
    const key = locationLabel(sequence);
    const bucket = perFolder.get(key);
    if (bucket) bucket.push(sequence); else perFolder.set(key, [sequence]);
  }
  const extIsEnough = new Map<string, boolean>();
  for (const [folder, sequences] of perFolder) {
    extIsEnough.set(folder, new Set(sequences.map(s => s.displayExt.toUpperCase())).size === sequences.length);
  }

  for (const sequence of shown) {
    const where = locationLabel(sequence);
    const base = flat ? headerName : where;
    let label = base;
    if ((perFolder.get(where)?.length ?? 1) > 1) {
      const qualifier = (extIsEnough.get(where) ?? true) ? sequence.displayExt.toUpperCase() : patternLabel(sequence);
      if (qualifier) label = `${base} (${qualifier})`;
    }
    lines.push(`*${label}*`);

    if (sequence.numbers.length === 1) {
      lines.push(`Only clip: ${sequence.firstName}`);
    } else {
      lines.push(`First: ${sequence.firstName}`);
      lines.push(`Last: ${sequence.lastName}`);
    }

    const missing = missingNumbers(sequence);
    lines.push(missing.length
      ? `Missing (${missing.length}): ${missingSummary(sequence, options.maxMissingListed)}`
      : 'Missing: None');
    lines.push('');
  }
  return lines.join('\n').trim();
}

export function whatsAppMessage(result: SequenceScanResult, options: ReportOptions): string {
  const lines: string[] = [];
  const e = options.useEmoji;
  const title = options.projectName.trim();

  lines.push('*CLIP CHECK REPORT*');
  lines.push(`${e ? '📁 ' : 'Folder: '}${title || result.rootName}`);
  if (options.showDate) {
    const when = new Date(result.scannedAt);
    const date = when.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const time = when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    lines.push(`${e ? '🗓 ' : 'Date: '}${date}, ${time}`);
  }
  lines.push('');

  const received = result.sequences.reduce((sum, sequence) => sum + sequence.numbers.length, 0);
  const missing = totalMissing(result);
  const hasClips = result.sequences.length > 0;

  if (hasClips) {
    lines.push(`${e ? '🎞 ' : ''}Files received: *${received}*`);
    lines.push(missing === 0
      ? `${e ? '✅ ' : ''}*Nothing missing — the numbering is continuous.*`
      : `${e ? '❌ ' : ''}Missing: *${missing}* clip${missing === 1 ? '' : 's'}`);
    lines.push('');
  }

  const shown = options.includeComplete ? result.sequences : result.sequences.filter(s => !isComplete(s));
  if (!shown.length) {
    lines.push(hasClips
      ? `${e ? '✅ ' : ''}Every folder is complete.`
      : 'No numbered clips were found in this folder.');
    lines.push('');
  }

  let lastFolder: string | null = null;
  for (const sequence of shown) {
    const folder = locationLabel(sequence);
    if (folder !== lastFolder) {
      lines.push('──────────────');
      lines.push(`${e ? '📂 ' : ''}*${folder}*`);
      lastFolder = folder;
    }
    const count = sequence.numbers.length;
    lines.push(`${e ? '🎬 ' : ''}${sequence.displayExt.toUpperCase()} — ${count} file${count === 1 ? '' : 's'}`);
    if (count === 1) {
      lines.push(`${e ? '▶️ ' : ''}Only clip: ${sequence.firstName}`);
    } else {
      lines.push(`${e ? '▶️ ' : ''}First clip: ${sequence.firstName}`);
      lines.push(`${e ? '⏹ ' : ''}Last clip:  ${sequence.lastName}`);
    }
    const gaps = missingNumbers(sequence);
    lines.push(gaps.length
      ? `${e ? '❌ ' : ''}Missing ${gaps.length}: ${missingSummary(sequence, options.maxMissingListed)}`
      : `${e ? '✅ ' : ''}All clips present`);
    lines.push('');
  }

  if (result.unnumberedCount > 0) {
    lines.push(`${e ? 'ℹ️ ' : ''}${result.unnumberedCount} file${result.unnumberedCount === 1 ? '' : 's'} had no clip number and were not checked.`);
    lines.push('');
  }

  if (missing > 0) {
    lines.push(`Please share the missing clip${missing === 1 ? '' : 's'} at your earliest. Thank you!`);
  } else if (hasClips) {
    lines.push('Everything is received in full. Thank you!');
  }

  // Tidy repeated blank lines.
  const out: string[] = [];
  for (const line of lines) {
    if (!line && out[out.length - 1] === '') continue;
    out.push(line);
  }
  return out.join('\n').trim();
}

/** A fuller plain-text version for saving to a file. */
export function detailedReport(result: SequenceScanResult, options: ReportOptions): string {
  const full: ReportOptions = {
    projectName: options.projectName, includeComplete: true, useEmoji: false,
    detailed: true, showDate: true, maxMissingListed: Number.MAX_SAFE_INTEGER,
  };
  let text = whatsAppMessage(result, full).replace(/\*/g, '');
  text += `\n\nScanned ${result.totalFiles} file(s) in total; ${result.skippedCount} ignored (sidecars / other types).`;
  return text;
}
