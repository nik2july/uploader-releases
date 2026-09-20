/**
 * The four jobs that bookend every delivery — measuring a shoot, checking the
 * camera numbering, re-encoding masters, and optimising photos.
 *
 * A port of the Baawaray Utility app (macOS/SwiftUI) into this Electron app, so
 * the studio has one window instead of two. The engines live in the main
 * process; these are the shapes they hand the renderer.
 */

// MARK: Duration

export type DurationKind = 'video' | 'audio';

export const DURATION_EXTENSIONS: Record<DurationKind, string[]> = {
  video: ['mp4', 'mov', 'm4v', 'mxf', 'mts', 'm2ts', 'm2t', 'avi', 'mkv', 'wmv', 'webm',
    'mpg', 'mpeg', 'vob', 'dv', 'braw', 'r3d', 'insv', 'ari', 'avchd', '3gp', 'flv', 'ts'],
  audio: ['wav', 'bwf', 'mp3', 'aac', 'aif', 'aiff', 'flac', 'm4a', 'caf', 'ogg', 'wma'],
};

/** One measured file. A duration of 0 means no reader could open it. */
export interface DurationFile {
  /** Path from the folder that was picked, e.g. "Day 2/Cam A/C0001.MP4". */
  relativePath: string;
  /** The folder it sits in, relative to the one picked. "" = the picked folder. */
  folderPath: string;
  name: string;
  /** Lowercased, without the dot. */
  ext: string;
  kind: DurationKind;
  duration: number;
  bytes: number;
}

export interface DurationScanResult {
  rootPath: string;
  rootName: string;
  files: DurationFile[];
  scannedAt: string;
  /** True when the scan was stopped early; the files measured so far are kept. */
  cancelled: boolean;
}

export interface DurationProgress { done: number; total: number }

// MARK: Missing Clips

export type MediaKind = 'video' | 'photo' | 'audio';

export interface SequenceScanOptions {
  mediaOnly: boolean;
  ignoreSidecars: boolean;
  /** Treat a card rollover (100MEDIA → 101MEDIA) as one run. */
  combineAcrossSubfolders: boolean;
  includeVideo: boolean;
  includePhoto: boolean;
  includeAudio: boolean;
}

export interface ClipSequence {
  id: string;
  /** Path relative to the folder picked; "" = that folder itself. */
  folder: string;
  /** The naming pattern with the counter and any per-clip IDs masked. */
  identity: string;
  /** Lowercased extension. */
  ext: string;
  /** The extension as it reads on disk, e.g. "MXF". */
  displayExt: string;
  /** Digits in the counter. */
  width: number;
  /** Short name with the counter as "#", e.g. "A025C#". */
  template: string;
  /** Sorted, unique counter values that arrived. */
  numbers: number[];
  firstName: string;
  lastName: string;
  /** Every folder this sequence's files came from — more than one when merged. */
  folders: string[];
  rootName: string;
}

export interface SequenceScanResult {
  rootPath: string;
  rootName: string;
  sequences: ClipSequence[];
  unnumberedCount: number;
  skippedCount: number;
  totalFiles: number;
  scannedAt: string;
}

// MARK: Clip Delivery

export interface Clip {
  path: string;
  relativePath: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  bytes: number;
  /** ffprobe's color_transfer. "arib-std-b67" is HLG. */
  transfer: string;
  /** ffprobe's color_primaries. Cameras sometimes leave it unwritten. */
  primaries: string;
}

export interface ClipScanResult {
  sourcePath: string;
  clips: Clip[];
  totalDuration: number;
  totalBytes: number;
  hlgCount: number;
  highFPSCount: number;
}

export type ClipQuality = 'archive' | 'balanced' | 'compact';
export type ClipSizeMode = 'quality' | 'size';

export interface ClipPlan { uhdBitrate: number; hdBitrate: number; estimatedBytes: number }

export type ClipEngineState = 'idle' | 'scanning' | 'ready' | 'running' | 'paused' | 'finished';

export interface ClipRunState {
  state: ClipEngineState;
  sourcePath: string | null;
  destinationPath: string | null;
  scan: ClipScanResult | null;
  scanProgress: number;
  completedCount: number;
  totalCount: number;
  completedDuration: number;
  totalDuration: number;
  bytesWritten: number;
  currentFile: string;
  failures: string[];
  log: string[];
  startedAt: number | null;
}

// MARK: Photo Delivery

export interface PhotoPreset {
  id: string;
  name: string;
  subtitle: string;
  detail: string;
  folderSuffix: string;
  /** 0 = never resize. */
  maxLongEdge: number;
  /** 0–1, as CoreGraphics took it. */
  quality: number;
  dpi: number;
  /** Long edge below which this preset's stated purpose cannot be met. */
  minUsefulLongEdge: number;
}

export const PHOTO_PRESETS: PhotoPreset[] = [
  {
    id: '4k',
    name: '4K Viewing',
    subtitle: 'For TVs, phones and laptops',
    detail: '3840 px long edge · ~1.6 MB each',
    folderSuffix: '4K Viewing',
    maxLongEdge: 3840,
    quality: 0.8,
    dpi: 72,
    minUsefulLongEdge: 1920,
  },
  {
    // 16 x 24 inches at 300 DPI = 4800 x 7200 px.
    id: 'print',
    name: '16×24 Print',
    subtitle: 'Full print quality, up to 16×24 in',
    detail: '7200 px long edge (300 DPI) · ~5.6 MB each',
    folderSuffix: '16x24 Print',
    maxLongEdge: 7200,
    quality: 0.82,
    dpi: 300,
    // 24 in x 240 DPI = 5760 px, the lab floor for photo quality.
    minUsefulLongEdge: 5760,
  },
];

export interface PhotoWarning { path: string; longEdge: number; dpiAt24in: number }

export interface PhotoRunState {
  state: 'idle' | 'scanning' | 'ready' | 'running' | 'finished';
  sourcePath: string | null;
  outputRoot: string | null;
  presetIds: string[];
  fileCount: number;
  totalUnits: number;
  completed: number;
  failed: number;
  skipped: number;
  keptOriginal: number;
  bytesIn: number;
  bytesOut: number;
  currentLabel: string;
  warnings: PhotoWarning[];
  errors: string[];
  startedAt: number | null;
  elapsed: number;
}

// MARK: Tools

export interface UtilityToolsStatus {
  ffprobe: boolean;
  ffmpeg: boolean;
  ffmpegPath: string | null;
  /** Where the app looked, so the interface can say what to install. */
  searched: string[];
}
