/**
 * Clip Delivery — camera masters into files clients can actually play.
 *
 * H.264 High / 8-bit 4:2:0 / Rec.709 / AAC in an MP4. Clips at 90fps or faster
 * are halved; HLG is tonemapped to Rec.709 so it does not look washed out on an
 * ordinary screen. Every output is length-verified against its source before it
 * is accepted, and a `_logs/done.txt` in the destination makes the run
 * resumable. Originals are never modified.
 *
 * The engine lives in the main process and keeps running while the studio uses
 * another tool — switching away from the page must not stop a four-hour batch.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { ffmpegPath, ffprobePath, run } from './ffTools';
import type { Clip, ClipPlan, ClipQuality, ClipRunState, ClipScanResult } from '../../shared/contracts';

const CLIP_EXTENSIONS = new Set(['mp4', 'mov', 'mxf', 'm4v']);

/** Target bitrate for UHD material, bits/sec. HD scales down from this. */
export const QUALITY_BITRATE: Record<ClipQuality, number> = {
  archive: 90_000_000,
  balanced: 65_000_000,
  compact: 40_000_000,
};
const HD_RATIO = 0.28;

export function bitrateFor(clip: Clip, uhd: number, hd: number): number {
  const target = clip.width > 2000 ? uhd : hd;
  // Never spend more than 90% of the source bitrate — that would inflate clips
  // which are already light.
  const sourceBitrate = clip.duration > 0 ? (clip.bytes * 8) / clip.duration : 0;
  const cap = sourceBitrate * 0.9;
  return cap > 0 && cap < target ? cap : target;
}

export function estimateBytes(clips: Clip[], uhd: number, hd: number): number {
  let total = 0;
  for (const clip of clips) total += ((bitrateFor(clip, uhd, hd) + 256_000) * clip.duration) / 8;  // + AAC audio
  return total;
}

export function planForQuality(quality: ClipQuality, clips: Clip[]): ClipPlan {
  const uhd = QUALITY_BITRATE[quality];
  const hd = uhd * HD_RATIO;
  return { uhdBitrate: uhd, hdBitrate: hd, estimatedBytes: estimateBytes(clips, uhd, hd) };
}

/** Solves for the bitrate pair that lands closest to `targetGB`. */
export function planForTargetSize(targetGB: number, clips: Clip[]): ClipPlan {
  const target = targetGB * 1e9;
  let lo = 2_000_000, hi = 300_000_000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (estimateBytes(clips, mid, mid * HD_RATIO) > target) hi = mid; else lo = mid;
  }
  const uhd = (lo + hi) / 2;
  return { uhdBitrate: uhd, hdBitrate: uhd * HD_RATIO, estimatedBytes: estimateBytes(clips, uhd, uhd * HD_RATIO) };
}

const needsFPSHalving = (clip: Clip): boolean => clip.fps >= 90;
const isHLG = (clip: Clip): boolean => clip.transfer === 'arib-std-b67';

async function findClips(root: string): Promise<string[]> {
  const out: string[] = [];
  async function visit(folder: string): Promise<void> {
    let entries;
    try { entries = await fs.readdir(folder, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) { await visit(full); continue; }
      if (!entry.isFile()) continue;
      if (CLIP_EXTENSIONS.has(path.extname(entry.name).slice(1).toLowerCase())) out.push(full);
    }
  }
  await visit(root);
  return out.sort();
}

/**
 * Reads one clip's shape. Fields are parsed BY NAME — ffprobe does not honour
 * the order they are requested in.
 */
async function probeClip(file: string, root: string): Promise<Clip | null> {
  const { stdout, code } = await run(ffprobePath(), [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate,color_transfer,color_primaries',
    '-show_entries', 'format=duration,size',
    '-of', 'default=nw=1', file,
  ], { timeout: 30_000 });
  if (code !== 0) return null;

  const clip: Clip = {
    path: file,
    relativePath: path.relative(root, file).split(path.sep).join('/'),
    width: 0, height: 0, fps: 0, duration: 0, bytes: 0, transfer: '', primaries: '',
  };
  for (const line of stdout.split('\n')) {
    const split = line.indexOf('=');
    if (split < 0) continue;
    const key = line.slice(0, split).trim();
    const value = line.slice(split + 1).trim();
    if (key === 'width') clip.width = Number(value) || 0;
    else if (key === 'height') clip.height = Number(value) || 0;
    else if (key === 'duration') clip.duration = Number(value) || 0;
    else if (key === 'size') clip.bytes = Number(value) || 0;
    else if (key === 'color_transfer') clip.transfer = value;
    else if (key === 'color_primaries') clip.primaries = value;
    else if (key === 'r_frame_rate') {
      const [num, den] = value.split('/').map(Number);
      if (Number.isFinite(num) && Number.isFinite(den) && den > 0) clip.fps = num / den;
    }
  }
  return clip.width > 0 && clip.duration > 0 ? clip : null;
}

/**
 * Per-clip decisions: halve high frame rates, tonemap HLG to Rec.709, and
 * deliver H.264 High / 8-bit 4:2:0 / AAC so it plays anywhere.
 */
export function ffmpegArgs(clip: Clip, out: string, bitrate: number): string[] {
  const chain: string[] = [];
  if (needsFPSHalving(clip)) chain.push(`fps=${(clip.fps / 2).toFixed(3)}`);
  if (isHLG(clip)) {
    // Some cameras write the HLG transfer but leave the primaries unwritten.
    // zscale then refuses the clip outright — "no path between colorspaces" —
    // and a clip is lost to a missing tag rather than to anything wrong with
    // the picture. Stamping HLG's own BT.2020 onto the frames first is enough;
    // a properly tagged clip is left to speak for itself, so the settings our
    // past deliveries were made with are unchanged.
    if (!clip.primaries || ['unknown', 'unspecified', 'reserved', ''].includes(clip.primaries)) {
      chain.push('setparams=color_primaries=bt2020:color_trc=arib-std-b67:colorspace=bt2020nc');
    }
    chain.push('zscale=t=linear:npl=100', 'tonemap=hable:desat=0', 'zscale=t=bt709:m=bt709:r=tv');
  }
  chain.push('format=yuv420p');

  const rate = Math.round(bitrate);
  return [
    '-nostdin', '-v', 'error', '-y',
    '-i', clip.path,
    '-map', '0:v:0', '-map', '0:a:0?',
    '-vf', chain.join(','),
    '-c:v', process.platform === 'darwin' ? 'h264_videotoolbox' : 'libx264',
    '-profile:v', 'high',
    '-b:v', String(rate),
    '-maxrate', String(Math.round((rate * 5) / 4)),
    '-bufsize', String(rate * 2),
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-c:a', 'aac', '-b:a', '256k', '-ac', '2',
    '-movflags', '+faststart',
    '-map_metadata', '0',
    out,
  ];
}

function emptyState(): ClipRunState {
  return {
    state: 'idle', sourcePath: null, destinationPath: null, scan: null, scanProgress: 0,
    completedCount: 0, totalCount: 0, completedDuration: 0, totalDuration: 0, bytesWritten: 0,
    currentFile: '', failures: [], log: [], startedAt: null,
  };
}

export class ClipDeliveryEngine {
  private state: ClipRunState = emptyState();
  private cancelled = false;
  private child: ChildProcess | null = null;
  private running: Promise<void> | null = null;

  constructor(private readonly publish: (state: ClipRunState) => void) {}

  snapshot(): ClipRunState { return { ...this.state, failures: [...this.state.failures], log: [...this.state.log] }; }

  private update(patch: Partial<ClipRunState>): void {
    this.state = { ...this.state, ...patch };
    this.publish(this.snapshot());
  }

  private say(line: string): void {
    const log = [...this.state.log, line];
    this.update({ log: log.length > 500 ? log.slice(log.length - 500) : log });
  }

  setDestination(destination: string | null): void { this.update({ destinationPath: destination }); }

  /** Point the tool at a folder and read what is in it. */
  async scan(source: string): Promise<ClipScanResult> {
    if (this.state.state === 'running') throw new Error('A conversion is already running.');
    this.update({ state: 'scanning', sourcePath: source, scan: null, scanProgress: 0, log: [], failures: [] });

    const files = await findClips(source);
    this.say(`Found ${files.length} video files. Reading properties…`);

    const result: ClipScanResult = { sourcePath: source, clips: [], totalDuration: 0, totalBytes: 0, hlgCount: 0, highFPSCount: 0 };
    const window = Math.max(2, Math.min(8, os.cpus().length || 4));
    let next = 0, done = 0;
    await Promise.all(Array.from({ length: Math.min(window, files.length) }, async () => {
      for (;;) {
        const index = next++;
        if (index >= files.length) return;
        const clip = await probeClip(files[index], source);
        if (clip) {
          result.clips.push(clip);
          result.totalDuration += clip.duration;
          result.totalBytes += clip.bytes;
          if (isHLG(clip)) result.hlgCount++;
          if (needsFPSHalving(clip)) result.highFPSCount++;
        }
        this.update({ scanProgress: ++done / Math.max(files.length, 1) });
      }
    }));
    result.clips.sort((a, b) => (a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0));

    this.say(`${(result.totalDuration / 3600).toFixed(2)} hours of footage, ${(result.totalBytes / 1e9).toFixed(1)} GB.`);
    if (result.hlgCount > 0) {
      this.say(`${result.hlgCount} clips are HLG (HDR) — these will be converted to Rec.709 so they look correct on normal screens.`);
    }
    if (result.highFPSCount > 0) {
      this.say(`${result.highFPSCount} clips are 90fps or higher — frame rate will be halved so they play on ordinary devices.`);
    }
    this.update({ state: 'ready', scan: result, totalCount: result.clips.length, totalDuration: result.totalDuration, scanProgress: 1 });
    return result;
  }

  start(destination: string, plan: ClipPlan): void {
    const scan = this.state.scan;
    if (!scan || !scan.clips.length) throw new Error('Scan a source folder first.');
    if (this.state.state === 'running') throw new Error('A conversion is already running.');
    const ffmpeg = ffmpegPath();
    if (!ffmpeg) throw new Error('ffmpeg was not found on this Mac. Install it with “brew install ffmpeg” and try again.');

    this.cancelled = false;
    this.update({
      state: 'running', destinationPath: destination, completedCount: 0, completedDuration: 0,
      bytesWritten: 0, failures: [], startedAt: Date.now(),
    });
    this.running = this.runLoop(ffmpeg, scan.clips, destination, plan).catch(error => {
      this.say(`Stopped: ${error instanceof Error ? error.message : String(error)}`);
      this.update({ state: 'paused', currentFile: '' });
    });
  }

  cancel(): void {
    if (this.state.state !== 'running') return;
    this.cancelled = true;
    this.child?.kill('SIGTERM');
  }

  private async append(file: string, line: string): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.appendFile(file, line, 'utf8');
  }

  private async runLoop(ffmpeg: string, clips: Clip[], destination: string, plan: ClipPlan): Promise<void> {
    const logsDir = path.join(destination, '_logs');
    await fs.mkdir(logsDir, { recursive: true });
    const doneFile = path.join(logsDir, 'done.txt');

    // Resume: everything already recorded is skipped.
    let alreadyDone = new Set<string>();
    try {
      const text = await fs.readFile(doneFile, 'utf8');
      alreadyDone = new Set(text.split('\n').map(line => line.trim()).filter(Boolean));
    } catch { /* first run */ }

    if (alreadyDone.size) {
      this.say(`Resuming — ${alreadyDone.size} clips were already finished.`);
      let duration = 0;
      for (const clip of clips) if (alreadyDone.has(clip.relativePath)) duration += clip.duration;
      // Don't let skipped work distort the rate.
      this.update({ completedCount: alreadyDone.size, completedDuration: duration, startedAt: Date.now() });
    }

    for (const clip of clips) {
      if (this.cancelled) break;
      if (alreadyDone.has(clip.relativePath)) continue;
      this.update({ currentFile: path.basename(clip.path) });

      const out = path.join(destination, clip.relativePath.replace(/\.[^./]+$/, '') + '.mp4');
      await fs.mkdir(path.dirname(out), { recursive: true });

      const bitrate = bitrateFor(clip, plan.uhdBitrate, plan.hdBitrate);
      const result = await this.encode(ffmpeg, ffmpegArgs(clip, out, bitrate));

      if (this.cancelled) { await fs.rm(out, { force: true }); break; }

      if (result.code !== 0) {
        await fs.rm(out, { force: true });
        const reason = result.stderr.trim().split('\n').pop() || 'encode failed';
        await this.fail(clip, reason, logsDir);
        continue;
      }

      // Verify the output really is the right length before trusting it.
      const probe = await run(ffprobePath(), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], { timeout: 30_000 });
      const written = Number(probe.stdout.trim());
      if (!Number.isFinite(written) || written <= 0 || Math.abs(written - clip.duration) >= 1) {
        await fs.rm(out, { force: true });
        await this.fail(clip, `length mismatch (expected ${clip.duration.toFixed(2)}s, got ${Number.isFinite(written) ? written.toFixed(2) : 0}s)`, logsDir);
        continue;
      }

      // Commit.
      await this.append(doneFile, clip.relativePath + '\n');
      let outBytes = 0;
      try { outBytes = (await fs.stat(out)).size; } catch { /* just the log line */ }
      this.update({
        completedCount: this.state.completedCount + 1,
        completedDuration: this.state.completedDuration + clip.duration,
        bytesWritten: this.state.bytesWritten + outBytes,
      });
      this.say(`${path.basename(clip.path)}  ${Math.round(clip.bytes / 1_048_576)} MB → ${Math.round(outBytes / 1_048_576)} MB`);
    }

    this.update({ currentFile: '', state: this.cancelled ? 'paused' : 'finished' });
    if (!this.cancelled) this.say('Finished.');
  }

  private encode(ffmpeg: string, args: string[]): Promise<{ code: number; stderr: string }> {
    return new Promise(resolve => {
      const child = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      this.child = child;
      let stderr = '';
      child.stderr?.on('data', chunk => { stderr += String(chunk); if (stderr.length > 8000) stderr = stderr.slice(-8000); });
      child.on('error', error => { this.child = null; resolve({ code: 1, stderr: String(error.message) }); });
      child.on('close', code => { this.child = null; resolve({ code: code ?? 1, stderr }); });
    });
  }

  private async fail(clip: Clip, reason: string, logsDir: string): Promise<void> {
    await this.append(path.join(logsDir, 'failed.txt'), `${clip.relativePath} | ${reason}\n`);
    this.update({ failures: [...this.state.failures, `${path.basename(clip.path)}: ${reason}`] });
    this.say(`FAILED  ${path.basename(clip.path)} — ${reason}`);
  }

  /** Stops a run when the app is quitting. */
  async shutdown(): Promise<void> {
    this.cancel();
    await this.running?.catch(() => undefined);
  }
}
