import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { ffmpegPath, ffprobePath, run } from './ffTools';
import type {
  ConversionProgress,
  LutConversionOptions,
  LutPreset,
  VideoQualityPreset
} from '../shared/contracts';

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'mxf', 'm4v', 'avi', 'mkv']);

const QUALITY_BITRATE_MAP: Record<VideoQualityPreset, { uhd: number; hd: number }> = {
  archive: { uhd: 90_000_000, hd: 28_000_000 },
  balanced: { uhd: 65_000_000, hd: 18_000_000 },
  compact: { uhd: 35_000_000, hd: 10_000_000 },
  proxy: { uhd: 18_000_000, hd: 6_000_000 }
};

export class LutConverterEngine {
  private child: ChildProcess | null = null;
  private cancelled = false;
  private isPaused = false;
  private pauseResolvers: Array<() => void> = [];
  private progress: ConversionProgress = {
    state: 'idle',
    totalClips: 0,
    currentClipIndex: 0,
    currentClipName: '',
    percent: 0,
    fps: 0,
    speed: '0x',
    elapsedSeconds: 0,
    remainingSeconds: 0,
    logs: []
  };

  constructor(private onProgressUpdate: (p: ConversionProgress) => void) {}

  getProgress(): ConversionProgress {
    return { ...this.progress, logs: [...this.progress.logs] };
  }

  pause(): void {
    if (this.progress.state === 'converting' || this.progress.state === 'scanning') {
      this.isPaused = true;
      if (this.child) {
        try {
          this.child.kill('SIGSTOP');
        } catch {}
      }
      this.updateProgress({ state: 'paused' }, '⏸ Conversion paused by user.');
    }
  }

  resume(): void {
    if (this.isPaused) {
      this.isPaused = false;
      if (this.child) {
        try {
          this.child.kill('SIGCONT');
        } catch {}
      }
      while (this.pauseResolvers.length > 0) {
        const res = this.pauseResolvers.shift();
        if (res) res();
      }
      this.updateProgress({ state: 'converting' }, '▶ Conversion resumed.');
    }
  }

  cancel(): void {
    this.cancelled = true;
    this.isPaused = false;
    if (this.child) {
      try {
        this.child.kill('SIGCONT');
      } catch {}
      try {
        this.child.kill('SIGTERM');
      } catch {}
      this.child = null;
    }
    while (this.pauseResolvers.length > 0) {
      const res = this.pauseResolvers.shift();
      if (res) res();
    }
    this.updateProgress({ state: 'cancelled' }, 'Batch conversion cancelled by user.');
  }

  private async waitIfPaused(): Promise<void> {
    while (this.isPaused && !this.cancelled) {
      await new Promise<void>(resolve => {
        this.pauseResolvers.push(resolve);
      });
    }
  }

  private updateProgress(patch: Partial<ConversionProgress>, logMsg?: string): void {
    const logs = logMsg ? [...this.progress.logs, logMsg].slice(-200) : this.progress.logs;
    this.progress = { ...this.progress, ...patch, logs };
    this.onProgressUpdate(this.getProgress());
  }

  static async getAvailableLuts(resourcesDir: string): Promise<LutPreset[]> {
    const lutsDir = path.join(resourcesDir, 'luts');
    const presets: LutPreset[] = [];

    if (existsSync(lutsDir)) {
      try {
        const files = await fs.readdir(lutsDir);
        for (const file of files) {
          if (file.toLowerCase().endsWith('.cube')) {
            const fullPath = path.join(lutsDir, file);
            const base = path.basename(file, '.cube');
            
            let description = `Studio Preset: ${base}`;
            if (base.includes('Sony S-Log3')) {
              description = 'Official Sony S-Gamut3.Cine / S-Log3 to Rec.709 Conversion LUT by Gamut (Recommended)';
            } else if (base.includes('Sony S-Log2')) {
              description = 'Official Sony S-Log2 to Rec.709 Conversion LUT by Gamut';
            } else if (base.includes('Baawaray')) {
              description = 'Official Baawaray Studio Rec.709 Master Creative LUT';
            }

            presets.push({
              id: base.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
              name: base,
              description,
              path: fullPath,
              isBuiltIn: true
            });
          }
        }
      } catch (err) {
        console.warn('[LutConverter] Error reading LUT directory:', err);
      }
    }

    // Default fallback if directory empty
    if (presets.length === 0) {
      presets.push({
        id: 'baseluts-sony-s-log3',
        name: 'BaseLUTs - Sony S-Log3',
        description: 'Official Sony S-Gamut3.Cine / S-Log3 to Rec.709 Conversion LUT by Gamut (Recommended)',
        path: path.join(resourcesDir, 'luts', 'BaseLUTs - Sony S-Log3.cube'),
        isBuiltIn: true
      });
    }

    // Sort BaseLUTs - Sony S-Log3 to absolute top
    presets.sort((a, b) => {
      if (a.name.includes('Sony S-Log3')) return -1;
      if (b.name.includes('Sony S-Log3')) return 1;
      return a.name.localeCompare(b.name);
    });

    return presets;
  }

  private async findVideoFiles(dirOrFile: string): Promise<string[]> {
    const stat = await fs.stat(dirOrFile);
    if (stat.isFile()) {
      const ext = path.extname(dirOrFile).slice(1).toLowerCase();
      return VIDEO_EXTENSIONS.has(ext) ? [dirOrFile] : [];
    }

    const results: string[] = [];
    async function traverse(currentDir: string): Promise<void> {
      let entries;
      try {
        entries = await fs.readdir(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await traverse(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).slice(1).toLowerCase();
          if (VIDEO_EXTENSIONS.has(ext)) {
            results.push(fullPath);
          }
        }
      }
    }

    await traverse(dirOrFile);
    return results.sort();
  }

  private async probe(file: string): Promise<{ width: number; height: number; duration: number; fps: number }> {
    const { stdout, code } = await run(ffprobePath(), [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,r_frame_rate:format=duration',
      '-of', 'default=nw=1',
      file
    ], { timeout: 30_000 });

    let width = 1920;
    let height = 1080;
    let duration = 0;
    let fps = 25;

    if (code === 0 && stdout) {
      for (const line of stdout.split('\n')) {
        const [k, v] = line.split('=');
        if (!k || !v) continue;
        if (k.trim() === 'width') width = Number(v.trim()) || 1920;
        if (k.trim() === 'height') height = Number(v.trim()) || 1080;
        if (k.trim() === 'duration') duration = Number(v.trim()) || 0;
        if (k.trim() === 'r_frame_rate') {
          const [num, den] = v.trim().split('/').map(Number);
          if (num && den) fps = Math.round(num / den);
        }
      }
    }
    return { width, height, duration, fps };
  }

  async startConversion(options: LutConversionOptions): Promise<void> {
    this.cancelled = false;
    this.updateProgress({
      state: 'scanning',
      totalClips: 0,
      currentClipIndex: 0,
      currentClipName: '',
      percent: 0,
      logs: []
    }, `Scanning footage in: ${options.sourcePath}`);

    const files = await this.findVideoFiles(options.sourcePath);
    if (files.length === 0) {
      this.updateProgress({ state: 'error', error: 'No video files found in source folder.' }, 'Scan found 0 clips.');
      return;
    }

    await fs.mkdir(options.destinationPath, { recursive: true });

    this.updateProgress({
      state: 'converting',
      totalClips: files.length,
      currentClipIndex: 0,
      percent: 0
    }, `Found ${files.length} video clips. Applying LUT "${options.lutName}" to Rec.709…`);

    this.cancelled = false;
    this.isPaused = false;
    this.pauseResolvers = [];

    const ffmpegBin = ffmpegPath();
    const rates = QUALITY_BITRATE_MAP[options.quality] || QUALITY_BITRATE_MAP.balanced;
    const startTime = Date.now();

    for (let i = 0; i < files.length; i++) {
      await this.waitIfPaused();
      if (this.cancelled) break;

      const file = files[i];
      const baseName = path.basename(file, path.extname(file));
      const outFileName = `${baseName}_Rec709.mp4`;
      const outFilePath = path.join(options.destinationPath, outFileName);

      // Skip already converted clips if enabled (default true)
      if (options.skipExisting !== false && existsSync(outFilePath)) {
        try {
          const outStat = await fs.stat(outFilePath);
          if (outStat.size > 64 * 1024) {
            const overallPct = Math.round(((i + 1) / files.length) * 100);
            const elapsedSec = Math.round((Date.now() - startTime) / 1000);
            const remainingSec = overallPct > 0 ? Math.round((elapsedSec / overallPct) * (100 - overallPct)) : 0;
            this.updateProgress({
              currentClipIndex: i + 1,
              currentClipName: path.basename(file),
              percent: overallPct,
              elapsedSeconds: elapsedSec,
              remainingSeconds: remainingSec
            }, `⏭ Skipped (Already converted): ${outFileName} (${(outStat.size / (1024 * 1024)).toFixed(1)} MB)`);
            continue;
          }
        } catch {
          // Proceed with conversion if stat fails
        }
      }

      this.updateProgress({
        currentClipIndex: i + 1,
        currentClipName: path.basename(file)
      }, `[${i + 1}/${files.length}] Converting: ${path.basename(file)}`);

      const probeInfo = await this.probe(file);
      const isUHD = probeInfo.width > 2000;
      const targetBitrate = options.fullHD || !isUHD ? rates.hd : rates.uhd;

      // Build video filter chain:
      // 1. Optional FPS cap
      // 2. LUT3D application
      // 3. Optional 1080p scale
      // 4. Pixel format yuv420p
      const vfChain: string[] = [];
      if (options.fpsCap !== 'original') {
        const targetFps = Number(options.fpsCap);
        if (targetFps > 0 && probeInfo.fps > targetFps + 0.1) {
          vfChain.push(`fps=${targetFps}`);
        }
      }

      // Escape LUT path for ffmpeg vf syntax
      const escapedLut = options.lutPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
      vfChain.push(`lut3d=file='${escapedLut}':interp=tetrahedral`);

      if (options.fullHD && isUHD) {
        vfChain.push("scale=w='min(iw,1920)':h='min(ih,1080)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1");
      }
      vfChain.push('format=yuv420p');

      const codecArg = process.platform === 'darwin' ? options.codec : 'libx264';
      const args = [
        '-nostdin',
        '-v', 'error',
        '-y',
        '-progress', 'pipe:1',
        '-stats_period', '1',
        '-i', file,
        '-map', '0:v:0',
        '-map', '0:a:0?',
        '-vf', vfChain.join(','),
        '-c:v', codecArg,
        '-b:v', String(targetBitrate),
        '-color_primaries', 'bt709',
        '-color_trc', 'bt709',
        '-colorspace', 'bt709',
        '-c:a', 'aac',
        '-b:a', '256k',
        '-ac', '2',
        '-movflags', '+faststart',
        outFilePath
      ];

      try {
        await new Promise<void>((resolve, reject) => {
          this.child = spawn(ffmpegBin, args);

          this.child.stdout?.on('data', (data: Buffer) => {
            const text = data.toString();
            let outTimeSec = 0;
            let currentFps = 0;
            let speed = '1x';

            for (const line of text.split('\n')) {
              const [k, v] = line.split('=');
              if (k === 'out_time_us') {
                outTimeSec = (Number(v) || 0) / 1_000_000;
              } else if (k === 'fps') {
                currentFps = Number(v) || 0;
              } else if (k === 'speed') {
                speed = v?.trim() || '1x';
              }
            }

            if (probeInfo.duration > 0 && outTimeSec > 0) {
              const clipPct = Math.min(100, (outTimeSec / probeInfo.duration) * 100);
              const overallPct = Math.round(((i + clipPct / 100) / files.length) * 100);
              const elapsedSec = Math.round((Date.now() - startTime) / 1000);
              const remainingSec = overallPct > 0 ? Math.round((elapsedSec / overallPct) * (100 - overallPct)) : 0;

              this.updateProgress({
                percent: overallPct,
                fps: currentFps,
                speed,
                elapsedSeconds: elapsedSec,
                remainingSeconds: remainingSec
              });
            }
          });

          this.child.on('close', code => {
            this.child = null;
            if (code === 0) resolve();
            else if (this.cancelled) resolve();
            else reject(new Error(`ffmpeg exited with code ${code}`));
          });

          this.child.on('error', err => {
            this.child = null;
            reject(err);
          });
        });

        this.updateProgress({}, `✓ Converted: ${outFileName}`);
      } catch (err: any) {
        if (this.cancelled) break;
        this.updateProgress({}, `⚠ Failed converting ${path.basename(file)}: ${err?.message}`);
      }
    }

    if (!this.cancelled) {
      this.updateProgress({
        state: 'completed',
        percent: 100,
        remainingSeconds: 0
      }, `✓ All ${files.length} clips successfully converted to Rec.709 with LUT "${options.lutName}"!`);
    }
  }
}
