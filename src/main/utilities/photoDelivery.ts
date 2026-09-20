/**
 * Photo Delivery — a shoot into a viewing set and a print set.
 *
 * Two presets, runnable together. Never upscales, never crops, bakes EXIF
 * rotation into the pixels, forces sRGB, writes baseline JPEG, keeps capture
 * metadata and drops maker notes, thumbnails and GPS.
 *
 * After a print run it lists any photo whose *source* is below 5760 px on the
 * long edge — under 240 DPI at 24 in, the lab floor — because those frames
 * cannot make a full-quality 16×24 however they are processed. Existing
 * non-empty outputs are skipped, so an interrupted run picks up where it
 * stopped.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { scrubExif } from './exifScrub';
import { PHOTO_PRESETS } from '../../shared/contracts';
import type { PhotoPreset, PhotoRunState, PhotoWarning } from '../../shared/contracts';

const PHOTO_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'heic', 'tif', 'tiff']);

export async function findImages(root: string): Promise<string[]> {
  const out: string[] = [];
  async function visit(folder: string): Promise<void> {
    let entries;
    try { entries = await fs.readdir(folder, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) { await visit(full); continue; }
      if (!entry.isFile()) continue;
      if (PHOTO_EXTENSIONS.has(path.extname(entry.name).slice(1).toLowerCase())) out.push(full);
    }
  }
  await visit(root);
  return out.sort();
}

export interface ConvertOutcome { bytesIn: number; bytesOut: number; keptOriginal: boolean; warning: PhotoWarning | null }

/** Re-encodes one file for one preset. */
export async function convertPhoto(source: string, destination: string, preset: PhotoPreset): Promise<ConvertOutcome> {
  const image = sharp(source, { failOn: 'none' });
  const metadata = await image.metadata();
  const sourceLongEdge = Math.max(metadata.width ?? 0, metadata.height ?? 0);

  // Flag frames that cannot honour the preset's promise (a source-side limit).
  const warning: PhotoWarning | null = sourceLongEdge > 0 && sourceLongEdge < preset.minUsefulLongEdge
    ? { path: source, longEdge: sourceLongEdge, dpiAt24in: Math.round(sourceLongEdge / 24) }
    : null;

  const willResize = preset.maxLongEdge > 0 && sourceLongEdge > preset.maxLongEdge;
  let pipeline = image.rotate().toColourspace('srgb');
  if (willResize) {
    pipeline = pipeline.resize({
      width: preset.maxLongEdge, height: preset.maxLongEdge,
      fit: 'inside', withoutEnlargement: true,
    });
  }
  const encoded = await pipeline
    .jpeg({ quality: Math.round(preset.quality * 100), progressive: false, chromaSubsampling: '4:2:0' })
    .withMetadata({ density: preset.dpi, orientation: 1, icc: 'srgb' })
    .toBuffer();

  const scrubbed = scrubExif(encoded, preset.dpi);
  const bytesIn = (await fs.stat(source)).size;

  await fs.mkdir(path.dirname(destination), { recursive: true });

  // A source that is already more compressed than our target would grow on
  // re-encode. Keep the original bytes instead — but only when it needs no
  // resize, no rotation and no colour conversion, so the delivery guarantees
  // still hold.
  const sourceIsJPEG = ['jpg', 'jpeg'].includes(path.extname(source).slice(1).toLowerCase());
  const untouched = sourceIsJPEG && !willResize && (metadata.orientation ?? 1) === 1
    && (!metadata.icc || metadata.space === 'srgb');
  if (scrubbed.length > bytesIn && bytesIn > 0 && untouched) {
    await fs.copyFile(source, destination);
    return { bytesIn, bytesOut: bytesIn, keptOriginal: true, warning };
  }

  await fs.writeFile(destination, scrubbed);
  return { bytesIn, bytesOut: scrubbed.length, keptOriginal: false, warning };
}

function emptyState(): PhotoRunState {
  return {
    state: 'idle', sourcePath: null, outputRoot: null, presetIds: PHOTO_PRESETS.map(p => p.id),
    fileCount: 0, totalUnits: 0, completed: 0, failed: 0, skipped: 0, keptOriginal: 0,
    bytesIn: 0, bytesOut: 0, currentLabel: '', warnings: [], errors: [], startedAt: null, elapsed: 0,
  };
}

export class PhotoDeliveryRunner {
  private state: PhotoRunState = emptyState();
  private files: string[] = [];
  private cancelled = false;
  private running: Promise<void> | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly publish: (state: PhotoRunState) => void) {}

  snapshot(): PhotoRunState {
    return { ...this.state, presetIds: [...this.state.presetIds], warnings: [...this.state.warnings], errors: [...this.state.errors] };
  }

  private update(patch: Partial<PhotoRunState>): void {
    this.state = { ...this.state, ...patch };
    this.publish(this.snapshot());
  }

  setPresets(presetIds: string[]): void {
    this.update({ presetIds: PHOTO_PRESETS.filter(p => presetIds.includes(p.id)).map(p => p.id) });
  }

  setOutputRoot(outputRoot: string): void { this.update({ outputRoot }); }

  /** Counts what is in the folder. The output folders sit beside it by default. */
  async scan(source: string): Promise<PhotoRunState> {
    if (this.state.state === 'running') throw new Error('A run is already going.');
    this.update({ state: 'scanning', sourcePath: source, outputRoot: path.dirname(source), warnings: [], errors: [] });
    this.files = await findImages(source);
    this.update({
      state: 'ready', fileCount: this.files.length, completed: 0, failed: 0, skipped: 0,
      keptOriginal: 0, bytesIn: 0, bytesOut: 0, totalUnits: 0, elapsed: 0, startedAt: null,
    });
    return this.snapshot();
  }

  start(): void {
    const { sourcePath, outputRoot } = this.state;
    const presets = PHOTO_PRESETS.filter(preset => this.state.presetIds.includes(preset.id));
    if (!sourcePath || !outputRoot) throw new Error('Choose a folder of photos first.');
    if (!presets.length) throw new Error('Choose at least one preset.');
    if (!this.files.length) throw new Error('No photos were found in that folder.');
    if (this.state.state === 'running') throw new Error('A run is already going.');

    this.cancelled = false;
    this.update({
      state: 'running', totalUnits: this.files.length * presets.length, completed: 0, failed: 0,
      skipped: 0, keptOriginal: 0, bytesIn: 0, bytesOut: 0, warnings: [], errors: [],
      startedAt: Date.now(), elapsed: 0,
    });
    this.ticker = setInterval(() => {
      if (this.state.startedAt) this.update({ elapsed: (Date.now() - this.state.startedAt) / 1000 });
    }, 500);
    this.running = this.run(sourcePath, outputRoot, presets).finally(() => {
      if (this.ticker) { clearInterval(this.ticker); this.ticker = null; }
      this.update({ state: 'finished', currentLabel: '' });
    });
  }

  cancel(): void { this.cancelled = true; }

  private async run(source: string, outputRoot: string, presets: PhotoPreset[]): Promise<void> {
    const base = path.basename(source);
    const cores = Math.max(2, os.cpus().length || 4);

    for (const preset of presets) {
      if (this.cancelled) break;
      const destinationRoot = path.join(outputRoot, `${base} — ${preset.folderSuffix}`);
      this.update({ currentLabel: preset.name });

      let next = 0;
      await Promise.all(Array.from({ length: Math.min(cores, this.files.length) }, async () => {
        for (;;) {
          if (this.cancelled) return;
          const index = next++;
          if (index >= this.files.length) return;
          const file = this.files[index];
          const relative = path.relative(source, file);
          const destination = path.join(destinationRoot, relative.replace(/\.[^./]+$/, '') + '.jpg');

          // Resume-safe: leave completed, non-empty outputs alone.
          try {
            const existing = await fs.stat(destination);
            if (existing.size > 0) { this.update({ skipped: this.state.skipped + 1, completed: this.state.completed + 1 }); continue; }
          } catch { /* not written yet */ }

          try {
            const outcome = await convertPhoto(file, destination, preset);
            this.update({
              completed: this.state.completed + 1,
              bytesIn: this.state.bytesIn + outcome.bytesIn,
              bytesOut: this.state.bytesOut + outcome.bytesOut,
              keptOriginal: this.state.keptOriginal + (outcome.keptOriginal ? 1 : 0),
              warnings: outcome.warning && this.state.warnings.length < 5000
                ? [...this.state.warnings, outcome.warning] : this.state.warnings,
            });
          } catch (error) {
            const message = `${relative}: ${error instanceof Error ? error.message : String(error)}`;
            this.update({
              completed: this.state.completed + 1,
              failed: this.state.failed + 1,
              errors: this.state.errors.length < 50 ? [...this.state.errors, message] : this.state.errors,
            });
          }
        }
      }));
    }
    if (this.state.startedAt) this.update({ elapsed: (Date.now() - this.state.startedAt) / 1000 });
  }

  async shutdown(): Promise<void> {
    this.cancel();
    await this.running?.catch(() => undefined);
    if (this.ticker) { clearInterval(this.ticker); this.ticker = null; }
  }
}
