import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { app } from 'electron';
import { ffmpegPath, ffprobePath, run } from './ffTools';
import type { ClipDeliveryRunState, ClipDeliverySettings } from '../shared/contracts';

const CLIP_EXTENSIONS = new Set(['mp4', 'mov', 'mxf', 'm4v', 'avi', 'mkv']);

export const QUALITY_BITRATES = {
  archive: 90_000_000,
  balanced: 65_000_000,
  compact: 40_000_000
};
const HD_RATIO = 0.28;

interface ScannedClip {
  path: string;
  relativePath: string;
  category: 'raw' | 'edited';
  width: number;
  height: number;
  fps: number;
  duration: number;
  bytes: number;
  transfer: string;
  primaries: string;
}

export class ClipDeliveryEngine {
  private child: ChildProcess | null = null;
  private cancelled = false;
  private isPaused = false;
  private pauseResolvers: Array<() => void> = [];
  private state: ClipDeliveryRunState = {
    state: 'idle',
    rawClipsCount: 0,
    rawClipsDone: 0,
    editedVideosCount: 0,
    editedVideosDone: 0,
    totalCount: 0,
    completedCount: 0,
    totalDuration: 0,
    completedDuration: 0,
    currentFile: '',
    currentType: '',
    percent: 0,
    logs: []
  };

  constructor(private onPublish: (s: ClipDeliveryRunState) => void) {}

  getState(): ClipDeliveryRunState {
    return { ...this.state, logs: [...this.state.logs] };
  }

  pause(): void {
    if (this.state.state === 'running' || this.state.state === 'scanning') {
      this.isPaused = true;
      if (this.child) {
        try {
          this.child.kill('SIGSTOP');
        } catch {}
      }
      this.emit({ state: 'paused' }, '⏸ Encoding paused by user.');
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
      this.emit({ state: 'running' }, '▶ Encoding resumed.');
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
    this.emit({ state: 'cancelled' }, 'Delivery export cancelled by user.');
  }

  private async waitIfPaused(): Promise<void> {
    while (this.isPaused && !this.cancelled) {
      await new Promise<void>(resolve => {
        this.pauseResolvers.push(resolve);
      });
    }
  }

  private emit(patch: Partial<ClipDeliveryRunState>, logLine?: string): void {
    const logs = logLine ? [...this.state.logs, logLine].slice(-300) : this.state.logs;
    this.state = { ...this.state, ...patch, logs };
    this.onPublish(this.getState());
  }

  private async findFiles(dir: string): Promise<string[]> {
    if (!dir || !existsSync(dir)) return [];
    const stat = await fs.stat(dir).catch(() => null);
    if (!stat) return [];
    if (stat.isFile()) {
      const ext = path.extname(dir).slice(1).toLowerCase();
      return CLIP_EXTENSIONS.has(ext) ? [dir] : [];
    }

    const out: string[] = [];
    async function visit(folder: string): Promise<void> {
      let entries;
      try {
        entries = await fs.readdir(folder, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const full = path.join(folder, entry.name);
        if (entry.isDirectory()) {
          await visit(full);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).slice(1).toLowerCase();
          if (CLIP_EXTENSIONS.has(ext)) out.push(full);
        }
      }
    }
    await visit(dir);
    return out.sort();
  }

  /**
   * Resolves the exact output path for a delivered clip.
   * Ensures:
   * 1. Output follows the Studio Smart Folder structure:
   *    [Destination]/[YYYY.MM.DD - EventName]/Raw Clips/[CrewMember]/[Clip].mp4
   *    [Destination]/[YYYY.MM.DD - EventName]/Edited Videos/[Deliverable]/[File].mp4
   * 2. If [Destination] is already the event folder (e.g. ".../2026.10.28 - Wedding"),
   *    it places files in [Destination]/Raw Clips/[CrewMember]/[Clip].mp4 without repeating the event folder.
   * 3. Prevents duplicate event or "Raw Clips" subfolders.
   */
  resolveClipOutputPath(
    targetDestPath: string,
    clip: ScannedClip,
    rawDir: string,
    editedDir: string,
    fallbackEvent?: string
  ): string {
    const cleanDest = targetDestPath.replace(/\\/g, '/').replace(/\/+$/, '');
    const destBasename = cleanDest.split('/').pop() || '';
    const norm = (s: string) => s.trim().toLowerCase().replace(/[\s–—_-]+/g, '-');

    const categorySubfolder = clip.category === 'raw' ? 'Raw Clips' : 'Edited Videos';

    // Parse clip relativePath
    // Examples:
    // "2026.10.28 - Wedding/Kishan/C8292.MP4"
    // "Kishan/C8292.MP4"
    // "01_Teaser/Teaser.mp4"
    const relSegments = clip.relativePath.split('/');
    let eventName = '';
    let remainderSegments: string[] = [];

    // Check if the first segment of relativePath is an event name (starts with date or has event keywords)
    const firstSegment = relSegments[0] || '';
    const isFirstSegmentEvent =
      relSegments.length > 1 &&
      (/^\d{4}\.\d{2}\.\d{2}/.test(firstSegment) ||
        /wedding|reception|haldi|sangeet|mehendi|engagement|cocktail|ring\s*ceremony/i.test(firstSegment));

    if (isFirstSegmentEvent) {
      eventName = firstSegment;
      remainderSegments = relSegments.slice(1);
    } else {
      // Check if source folder basename itself is an event folder
      const srcDir = clip.category === 'raw' ? rawDir : editedDir;
      const cleanSrc = srcDir.replace(/\\/g, '/').replace(/\/+$/, '');
      const srcBasename = cleanSrc.split('/').pop() || '';
      if (
        /^\d{4}\.\d{2}\.\d{2}/.test(srcBasename) ||
        /wedding|reception|haldi|sangeet|mehendi|engagement|cocktail|ring\s*ceremony/i.test(srcBasename)
      ) {
        eventName = srcBasename;
      } else if (fallbackEvent) {
        eventName = fallbackEvent;
      }
      remainderSegments = relSegments;
    }

    // Strip any redundant leading "Raw Clips", "raw", "Edited Videos", "edited" from remainder
    if (
      remainderSegments.length > 1 &&
      /^(raw clips|raw rushes|raw footage|raw|edited videos|edited)$/i.test(remainderSegments[0])
    ) {
      remainderSegments = remainderSegments.slice(1);
    }

    const remainderRelative = remainderSegments.join('/').replace(/\.[^.]+$/, '.mp4');

    // Check if cleanDest already ends with eventName
    const destAlreadyEndsWithEvent = eventName && norm(destBasename) === norm(eventName);

    if (destAlreadyEndsWithEvent) {
      // Destination is already e.g. ".../05_CLIENT_CLIPS_DELIVERY/2026.10.28 - Wedding"
      return path.join(cleanDest, categorySubfolder, remainderRelative);
    }

    if (eventName) {
      // Destination is root e.g. ".../05_CLIENT_CLIPS_DELIVERY"
      return path.join(cleanDest, eventName, categorySubfolder, remainderRelative);
    }

    return path.join(cleanDest, categorySubfolder, remainderRelative);
  }

  private async probeClip(file: string, root: string, category: 'raw' | 'edited'): Promise<ScannedClip | null> {
    const { stdout, code } = await run(ffprobePath(), [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,r_frame_rate,color_transfer,color_primaries',
      '-show_entries', 'format=duration,size',
      '-of', 'default=nw=1',
      file
    ], { timeout: 30_000 });

    if (code !== 0) return null;

    const clip: ScannedClip = {
      path: file,
      relativePath: path.relative(root, file).split(path.sep).join('/'),
      category,
      width: 0,
      height: 0,
      fps: 0,
      duration: 0,
      bytes: 0,
      transfer: '',
      primaries: ''
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
        if (num && den && den > 0) clip.fps = num / den;
      }
    }

    return clip.width > 0 && clip.duration > 0 ? clip : null;
  }

  async startDelivery(settings: ClipDeliverySettings): Promise<void> {
    this.cancelled = false;
    this.emit({
      state: 'scanning',
      rawClipsCount: 0,
      rawClipsDone: 0,
      editedVideosCount: 0,
      editedVideosDone: 0,
      totalCount: 0,
      completedCount: 0,
      totalDuration: 0,
      completedDuration: 0,
      currentFile: '',
      currentType: '',
      percent: 0,
      logs: []
    }, 'Scanning footage package for client delivery (Raw Clips & Edited Videos)…');

    // Resolve default Sony S-Log3 LUT path if not specified
    const resourcesDir = app?.isPackaged ? process.resourcesPath : path.join(app ? app.getAppPath() : process.cwd(), 'resources');
    const defaultSonyLut = path.join(resourcesDir, 'luts', 'BaseLUTs - Sony S-Log3.cube');
    const effectiveLutPath = settings.lutPath || (existsSync(defaultSonyLut) ? defaultSonyLut : '');

    // Determine raw and edited paths
    let rawDir = settings.rawSourcePath || '';
    let editedDir = settings.editedSourcePath || '';

    // If only unified sourcePath was provided, auto-detect standard folders
    if (settings.sourcePath) {
      if (!rawDir) {
        const candidateRaw = path.join(settings.sourcePath, '01_RAW_FOOTAGE');
        if (existsSync(candidateRaw)) rawDir = candidateRaw;
      }
      if (!editedDir) {
        const candidateEdited = existsSync(path.join(settings.sourcePath, '04_RENDER_DELIVERABLES'))
          ? path.join(settings.sourcePath, '04_RENDER_DELIVERABLES')
          : path.join(settings.sourcePath, '05_RENDER_DELIVERABLES');
        if (existsSync(candidateEdited)) editedDir = candidateEdited;
      }
      // If neither folder was found by convention, use sourcePath directly
      if (!rawDir && !editedDir) {
        if (settings.deliveryMode === 'edited_only') editedDir = settings.sourcePath;
        else rawDir = settings.sourcePath;
      }
    }

    // Auto-detect standard smart subfolders if project root was provided directly
    if (rawDir && existsSync(rawDir)) {
      const subRaw = path.join(rawDir, '01_RAW_FOOTAGE');
      if (existsSync(subRaw)) rawDir = subRaw;
    }
    if (editedDir && existsSync(editedDir)) {
      const subEdited4 = path.join(editedDir, '04_RENDER_DELIVERABLES');
      const subEdited5 = path.join(editedDir, '05_RENDER_DELIVERABLES');
      if (existsSync(subEdited4)) editedDir = subEdited4;
      else if (existsSync(subEdited5)) editedDir = subEdited5;
    }
    let targetDestPath = settings.destinationPath;
    if (targetDestPath && existsSync(targetDestPath)) {
      const subDest5 = path.join(targetDestPath, '05_CLIENT_CLIPS_DELIVERY');
      const subDest3 = path.join(targetDestPath, '03_CLIENT_CLIPS_DELIVERY');
      if (existsSync(subDest5)) targetDestPath = subDest5;
      else if (existsSync(subDest3)) targetDestPath = subDest3;
    }

    const allClips: ScannedClip[] = [];
    const window = Math.max(2, Math.min(8, os.cpus().length || 4));

    // 1. Scan Raw Clips if requested
    if ((settings.deliveryMode === 'both' || settings.deliveryMode === 'raw_only') && rawDir && existsSync(rawDir)) {
      this.emit({}, `Scanning Raw Clips in: ${rawDir}`);
      const rawFiles = await this.findFiles(rawDir);
      let next = 0;
      await Promise.all(
        Array.from({ length: Math.min(window, rawFiles.length) }, async () => {
          for (;;) {
            const idx = next++;
            if (idx >= rawFiles.length) return;
            const c = await this.probeClip(rawFiles[idx], rawDir, 'raw');
            if (c) allClips.push(c);
          }
        })
      );
    }

    // 2. Scan Edited Videos if requested
    if ((settings.deliveryMode === 'both' || settings.deliveryMode === 'edited_only') && editedDir && existsSync(editedDir)) {
      this.emit({}, `Scanning Edited Videos in: ${editedDir}`);
      const editedFiles = await this.findFiles(editedDir);
      let next = 0;
      await Promise.all(
        Array.from({ length: Math.min(window, editedFiles.length) }, async () => {
          for (;;) {
            const idx = next++;
            if (idx >= editedFiles.length) return;
            const c = await this.probeClip(editedFiles[idx], editedDir, 'edited');
            if (c) allClips.push(c);
          }
        })
      );
    }

    if (allClips.length === 0) {
      this.emit({ state: 'error', error: 'No video files found in selected source folders.' }, 'Scan found 0 clips.');
      return;
    }

    const rawClipsTotal = allClips.filter(c => c.category === 'raw').length;
    const editedVideosTotal = allClips.filter(c => c.category === 'edited').length;
    const totalDur = allClips.reduce((acc, c) => acc + c.duration, 0);

    // Detect event name if present across scanned clips or source paths
    let detectedEvent = '';
    for (const c of allClips) {
      const segs = c.relativePath.split('/');
      if (
        segs.length > 1 &&
        (/^\d{4}\.\d{2}\.\d{2}/.test(segs[0]) ||
          /wedding|reception|haldi|sangeet|mehendi|engagement|cocktail|ring\s*ceremony/i.test(segs[0]))
      ) {
        detectedEvent = segs[0];
        break;
      }
    }
    if (!detectedEvent && rawDir) {
      const rawBase = path.basename(rawDir);
      if (
        /^\d{4}\.\d{2}\.\d{2}/.test(rawBase) ||
        /wedding|reception|haldi|sangeet|mehendi|engagement|cocktail|ring\s*ceremony/i.test(rawBase)
      ) {
        detectedEvent = rawBase;
      }
    }

    await fs.mkdir(targetDestPath, { recursive: true });
    const logDir = path.join(targetDestPath, '_logs');
    await fs.mkdir(logDir, { recursive: true });
    const doneLogPath = path.join(logDir, 'done.txt');

    // Read existing done.txt to allow resuming
    const completedSet = new Set<string>();
    const candidateLogPaths = [
      doneLogPath,
      detectedEvent ? path.join(targetDestPath, detectedEvent, '_logs', 'done.txt') : ''
    ].filter(Boolean);

    for (const lp of candidateLogPaths) {
      if (existsSync(lp)) {
        try {
          const content = await fs.readFile(lp, 'utf8');
          for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (trimmed) completedSet.add(trimmed);
          }
        } catch {}
      }
    }

    this.cancelled = false;
    this.isPaused = false;
    this.pauseResolvers = [];

    const baseUhd = QUALITY_BITRATES[settings.quality] || QUALITY_BITRATES.balanced;
    const baseHd = baseUhd * HD_RATIO;

    this.emit({
      state: 'running',
      rawClipsCount: rawClipsTotal,
      rawClipsDone: 0,
      editedVideosCount: editedVideosTotal,
      editedVideosDone: 0,
      totalCount: allClips.length,
      completedCount: completedSet.size,
      totalDuration: totalDur,
      percent: allClips.length > 0 ? Math.round((completedSet.size / allClips.length) * 100) : 0
    }, `Starting client delivery: ${rawClipsTotal} Raw Clips + ${editedVideosTotal} Edited Videos (${(totalDur / 3600).toFixed(1)} hrs)`);

    const ffmpegBin = ffmpegPath();
    let completedDuration = 0;
    let rawDone = 0;
    let editedDone = 0;

    for (let i = 0; i < allClips.length; i++) {
      await this.waitIfPaused();
      if (this.cancelled) break;
      const clip = allClips[i];
      const clipKey = `${clip.category}:${clip.relativePath}`;

      // Calculate clean destination path for this clip
      const outPath = this.resolveClipOutputPath(targetDestPath, clip, rawDir, editedDir, detectedEvent);
      await fs.mkdir(path.dirname(outPath), { recursive: true });

      // Check if output file already exists on disk with non-zero size
      let outExists = false;
      if (existsSync(outPath)) {
        try {
          const stat = await fs.stat(outPath);
          outExists = stat.size > 1024;
        } catch {}
      }

      if (completedSet.has(clipKey) || outExists) {
        completedDuration += clip.duration;
        if (clip.category === 'raw') rawDone++; else editedDone++;
        completedSet.add(clipKey);
        continue;
      }

      this.emit({
        currentFile: path.basename(clip.path),
        currentType: clip.category,
        completedCount: i,
        rawClipsDone: rawDone,
        editedVideosDone: editedDone,
        completedDuration
      }, `[${i + 1}/${allClips.length}] [${clip.category.toUpperCase()}] Delivering: ${clip.relativePath}`);

      // Target bitrate
      const sourceBitrate = clip.duration > 0 ? (clip.bytes * 8) / clip.duration : 0;
      const targetBitrate = !settings.fullHD && clip.width > 2000 ? baseUhd : baseHd;
      const cap = sourceBitrate * 0.9;
      const rate = Math.round(cap > 0 && cap < targetBitrate ? cap : targetBitrate);

      // Build Filter Chain
      const chain: string[] = [];

      // FPS Capping
      if (settings.fpsCap !== 'original') {
        const targetFps = Number(settings.fpsCap);
        if (targetFps > 0 && clip.fps > targetFps + 0.1) {
          chain.push(`fps=${targetFps}`);
        }
      }

      // If Raw Clip: Apply Sony S-Log3 Rec.709 LUT or HLG tonemapping
      if (clip.category === 'raw') {
        if (settings.applyRawLut && effectiveLutPath && existsSync(effectiveLutPath)) {
          const escapedLut = effectiveLutPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
          chain.push(`lut3d=file='${escapedLut}':interp=tetrahedral`);
        } else if (settings.autoHLG && clip.transfer === 'arib-std-b67') {
          if (!clip.primaries || ['unknown', 'unspecified', ''].includes(clip.primaries)) {
            chain.push('setparams=color_primaries=bt2020:color_trc=arib-std-b67:colorspace=bt2020nc');
          }
          chain.push('zscale=t=linear:npl=100', 'tonemap=hable:desat=0', 'zscale=t=bt709:m=bt709:r=tv');
        }
      }

      // Full HD 1080p downscale if requested
      if (settings.fullHD && clip.width > 1920) {
        chain.push("scale=w='min(iw,1920)':h='min(ih,1080)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1");
      }
      chain.push('format=yuv420p');

      const codecArg = process.platform === 'darwin' ? 'h264_videotoolbox' : 'libx264';
      const args = [
        '-nostdin',
        '-v', 'error',
        '-y',
        '-progress', 'pipe:1',
        '-stats_period', '1',
        '-i', clip.path,
        '-map', '0:v:0',
        '-map', '0:a:0?',
        '-vf', chain.join(','),
        '-c:v', codecArg,
        '-profile:v', 'high',
        '-b:v', String(rate),
        '-maxrate', String(Math.round((rate * 5) / 4)),
        '-bufsize', String(rate * 2),
        '-color_primaries', 'bt709',
        '-color_trc', 'bt709',
        '-colorspace', 'bt709',
        '-c:a', 'aac',
        '-b:a', '256k',
        '-ac', '2',
        '-movflags', '+faststart',
        '-map_metadata', '0',
        outPath
      ];

      try {
        await new Promise<void>((resolve, reject) => {
          this.child = spawn(ffmpegBin, args);
          this.child.on('close', code => {
            this.child = null;
            if (code === 0) resolve();
            else if (this.cancelled) resolve();
            else reject(new Error(`Exit code ${code}`));
          });
          this.child.on('error', err => {
            this.child = null;
            reject(err);
          });
        });

        // Mark done in log
        await fs.appendFile(doneLogPath, `${clipKey}\n`, 'utf8');
        completedSet.add(clipKey);
        completedDuration += clip.duration;
        if (clip.category === 'raw') rawDone++; else editedDone++;

        const currentPct = Math.round(((i + 1) / allClips.length) * 100);
        this.emit({
          completedCount: i + 1,
          rawClipsDone: rawDone,
          editedVideosDone: editedDone,
          completedDuration,
          percent: currentPct
        }, `✓ Exported: [${clip.category.toUpperCase()}] ${path.basename(outPath)}`);
      } catch (err: any) {
        if (this.cancelled) break;
        this.emit({}, `⚠ Error exporting ${clip.relativePath}: ${err?.message}`);
      }
    }

    if (!this.cancelled) {
      // Write delivery manifest info
      const lutLabel = effectiveLutPath ? path.basename(effectiveLutPath, '.cube') : 'Sony S-Log3';
      const summaryText = `Baawaray Films — Client Clips Delivery Package
Date: ${new Date().toISOString()}
Raw Clips Delivered: ${rawDone} (${lutLabel} -> Rec.709 Converted)
Edited Videos Delivered: ${editedDone} (Master Final Cuts)
Quality Preset: ${settings.quality}
Destination: ${targetDestPath}
Post-Production Hotline: +91 88945 62004
`;
      await fs.writeFile(path.join(targetDestPath, 'DELIVERY_SUMMARY.txt'), summaryText, 'utf8').catch(() => {});

      this.emit({
        state: 'completed',
        rawClipsDone: rawDone,
        editedVideosDone: editedDone,
        percent: 100
      }, `✓ Client clips delivery complete! Delivered ${rawDone} Raw Clips and ${editedDone} Edited Videos.`);
    }
  }
}
