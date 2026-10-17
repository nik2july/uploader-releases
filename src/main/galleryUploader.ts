import { app, BrowserWindow, dialog, powerSaveBlocker } from 'electron';
import fs from 'node:fs/promises';
import { createReadStream, statSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import sharp from 'sharp';
import { ffmpegPath, ffprobePath } from './utilities/ffTools';
import type {
  GalleryItemProgress,
  GalleryUploadSessionState,
  GallerySummary,
  GalleryMediaItem,
  GallerySongItem,
} from '../shared/contracts';

const VIDEO_EXTS = new Set(['mp4', 'mov', 'm4v', 'mkv', 'avi', 'mxf']);
const PHOTO_EXTS = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'heic', 'tif', 'tiff', 'raw', 'arw', 'cr2', 'cr3', 'nef', 'dng',
]);

const STUDIO_SECRET = 'baawaray_studio_internal_secret_2026';
const CLOUD_API_BASE = 'https://baawaray-gallery-portal-874505280538.asia-south1.run.app/api';
const LOCAL_API_BASE = 'http://localhost:5050/api';

export class GalleryUploaderEngine {
  private state: GalleryUploadSessionState = {
    status: 'idle',
    galleryId: '',
    galleryTitle: '',
    sceneId: 'highlights',
    sceneName: 'Highlights',
    items: [],
    totalBytes: 0,
    uploadedBytes: 0,
    overallProgress: 0,
    speedBytesPerSec: 0,
    etaSeconds: 0,
    autoTranscode: true,
  };

  private cancelled = false;
  private paused = false;
  private isProcessingQueue = false;
  private powerBlockerId: number | null = null;
  private activeUploadController: AbortController | null = null;
  private tempDir: string;

  constructor() {
    this.tempDir = path.join(app.getPath('temp'), 'baawaray-gallery-transcode');
    if (!existsSync(this.tempDir)) {
      mkdirSync(this.tempDir, { recursive: true });
    }
  }

  public getState(): GalleryUploadSessionState {
    return { ...this.state, items: [...this.state.items] };
  }

  private broadcast(): void {
    const state = this.getState();
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('gallery:state', state);
      }
    }
  }

  private managePower(running: boolean): void {
    if (running && this.powerBlockerId === null) {
      this.powerBlockerId = powerSaveBlocker.start('prevent-app-suspension');
    } else if (!running && this.powerBlockerId !== null) {
      if (powerSaveBlocker.isStarted(this.powerBlockerId)) {
        powerSaveBlocker.stop(this.powerBlockerId);
      }
      this.powerBlockerId = null;
    }
  }

  // ---------------------------------------------------------------------------
  // API Calls to Gallery Portal
  // ---------------------------------------------------------------------------

  private async fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers = {
      'x-studio-secret': STUDIO_SECRET,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    // Try Cloud Run first, fall back to localhost if testing offline
    try {
      const res = await fetch(`${CLOUD_API_BASE}${endpoint}`, { ...options, headers });
      if (res.ok) {
        return (await res.json()) as T;
      }
      throw new Error(`Cloud Run returned ${res.status}: ${await res.text()}`);
    } catch (cloudErr) {
      console.warn(`[GalleryUploader] Cloud Run fetch failed, trying local fallback:`, cloudErr);
      const res = await fetch(`${LOCAL_API_BASE}${endpoint}`, { ...options, headers });
      if (!res.ok) {
        throw new Error(`API error ${res.status}: ${await res.text()}`);
      }
      return (await res.json()) as T;
    }
  }

  private mapGallerySummary(g: any): GallerySummary {
    return {
      id: g.id,
      title: g.title,
      clientName: g.clientName || 'Untitled Client',
      slug: g.slug,
      scenes: g.scenes || [],
      coverImage: g.coverImage,
      coverVideo: g.coverVideo,
      backgroundMusicUrl: g.backgroundMusicUrl,
      backgroundMusicTitle: g.backgroundMusicTitle,
      isPublished: g.isPublished,
      mediaCount: g.mediaCount,
      eventDate: g.eventDate,
      category: g.category,
      description: g.description,
    };
  }

  public async fetchGalleries(): Promise<GallerySummary[]> {
    try {
      const data = await this.fetchApi<{ galleries: any[] }>('/admin/galleries');
      return (data.galleries || []).map((g) => this.mapGallerySummary(g));
    } catch (err: any) {
      console.error('[GalleryUploader] fetchGalleries failed:', err);
      return [];
    }
  }

  public async createGallery(payload: {
    title: string;
    clientName: string;
    eventDate?: string;
    category?: string;
    slug?: string;
    description?: string;
    isPublished?: boolean;
    scenes?: { id: string; name: string; order: number }[];
  }): Promise<GallerySummary | null> {
    try {
      const data = await this.fetchApi<{ gallery: any }>('/admin/galleries', {
        method: 'POST',
        body: JSON.stringify({
          title: payload.title.trim(),
          clientName: payload.clientName.trim(),
          eventDate: payload.eventDate,
          category: payload.category || 'Weddings',
          slug: payload.slug?.trim() || undefined,
          description: payload.description?.trim() || '',
          isPublished: payload.isPublished ?? true,
          scenes: payload.scenes && payload.scenes.length > 0 ? payload.scenes : undefined,
        }),
      });

      if (!data?.gallery) return null;

      // Ensure custom slug was applied
      const desiredSlug = payload.slug?.trim();
      if (desiredSlug && data.gallery.slug !== desiredSlug) {
        const updated = await this.updateGallery(data.gallery.id, { slug: desiredSlug });
        return updated || this.mapGallerySummary(data.gallery);
      }

      return this.mapGallerySummary(data.gallery);
    } catch (err) {
      console.error('[GalleryUploader] createGallery failed:', err);
      return null;
    }
  }

  public async updateGallery(
    galleryId: string,
    updates: Partial<GallerySummary>
  ): Promise<GallerySummary | null> {
    try {
      const data = await this.fetchApi<{ gallery: any }>(`/admin/galleries/${galleryId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      return data.gallery ? this.mapGallerySummary(data.gallery) : null;
    } catch (err) {
      console.error('[GalleryUploader] updateGallery failed:', err);
      return null;
    }
  }

  public async deleteGallery(galleryId: string): Promise<boolean> {
    try {
      const res = await this.fetchApi<{ success: boolean }>(`/admin/galleries/${galleryId}`, {
        method: 'DELETE',
      });
      return Boolean(res && res.success);
    } catch (err) {
      console.error('[GalleryUploader] deleteGallery failed:', err);
      return false;
    }
  }

  public async createScene(galleryId: string, name: string): Promise<any> {
    return this.fetchApi(`/admin/galleries/${galleryId}/scenes`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  public async updateScene(
    galleryId: string,
    sceneId: string,
    name: string
  ): Promise<GallerySummary | null> {
    try {
      const trimmedName = name.trim();
      if (!trimmedName) throw new Error('Scene name cannot be empty');

      // First try dedicated single-scene endpoint if available
      try {
        const direct = await this.fetchApi<{ gallery: any }>(
          `/admin/galleries/${galleryId}/scenes/${sceneId}`,
          {
            method: 'PUT',
            body: JSON.stringify({ name: trimmedName }),
          }
        );
        if (direct && direct.gallery) {
          return this.mapGallerySummary(direct.gallery);
        }
      } catch {
        // Fall back to scenes array update below
      }

      const galleries = await this.fetchGalleries();
      const current = galleries.find((g) => g.id === galleryId);
      const existingScenes = current?.scenes || [];
      const updatedScenes = existingScenes.map((s) =>
        s.id === sceneId ? { ...s, name: trimmedName } : s
      );

      const res = await this.fetchApi<{ gallery: any }>(`/admin/galleries/${galleryId}/scenes`, {
        method: 'PUT',
        body: JSON.stringify({ scenes: updatedScenes }),
      });
      return res.gallery ? this.mapGallerySummary(res.gallery) : null;
    } catch (err) {
      console.error('[GalleryUploader] updateScene failed:', err);
      return null;
    }
  }

  public async deleteScene(galleryId: string, sceneId: string): Promise<GallerySummary | null> {
    try {
      const res = await this.fetchApi<{ gallery: any }>(
        `/admin/galleries/${galleryId}/scenes/${sceneId}`,
        {
          method: 'DELETE',
        }
      );
      return res.gallery ? this.mapGallerySummary(res.gallery) : null;
    } catch (err) {
      console.error('[GalleryUploader] deleteScene failed:', err);
      return null;
    }
  }

  public async fetchGalleryMedia(galleryId: string): Promise<GalleryMediaItem[]> {
    try {
      const data = await this.fetchApi<{ gallery?: any; media?: GalleryMediaItem[] }>(
        `/admin/galleries/${galleryId}`
      );
      return (data.media || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    } catch (err) {
      console.error('[GalleryUploader] fetchGalleryMedia failed:', err);
      return [];
    }
  }

  public async reorderMedia(galleryId: string, itemIds: string[]): Promise<boolean> {
    try {
      try {
        await this.fetchApi(`/admin/galleries/${galleryId}/reorder`, {
          method: 'PUT',
          body: JSON.stringify({ itemIds }),
        });
        return true;
      } catch {
        await this.fetchApi('/admin/media/reorder', {
          method: 'PUT',
          body: JSON.stringify({ galleryId, itemIds }),
        });
        return true;
      }
    } catch (err) {
      console.error('[GalleryUploader] reorderMedia failed:', err);
      return false;
    }
  }

  public async updateMedia(
    mediaId: string,
    updates: Partial<GalleryMediaItem>
  ): Promise<GalleryMediaItem | null> {
    try {
      const data = await this.fetchApi<{ item: GalleryMediaItem }>(`/admin/media/${mediaId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      return data.item || null;
    } catch (err) {
      console.error('[GalleryUploader] updateMedia failed:', err);
      return null;
    }
  }

  public async deleteMedia(mediaId: string): Promise<boolean> {
    try {
      await this.fetchApi(`/admin/media/${mediaId}`, {
        method: 'DELETE',
      });
      return true;
    } catch (err) {
      console.warn('[GalleryUploader] deleteMedia single endpoint failed, trying batch-delete fallback:', err);
      try {
        await this.fetchApi('/admin/media/batch-delete', {
          method: 'POST',
          body: JSON.stringify({ itemIds: [mediaId] }),
        });
        return true;
      } catch (batchErr) {
        console.error('[GalleryUploader] deleteMedia fallback failed:', batchErr);
        return false;
      }
    }
  }

  public async batchDeleteMedia(galleryId: string, itemIds: string[]): Promise<boolean> {
    if (!itemIds || itemIds.length === 0) return true;
    try {
      try {
        await this.fetchApi('/admin/media/batch-delete', {
          method: 'POST',
          body: JSON.stringify({ galleryId, itemIds }),
        });
        return true;
      } catch {
        await this.fetchApi('/admin/media/batch', {
          method: 'DELETE',
          body: JSON.stringify({ galleryId, itemIds }),
        });
        return true;
      }
    } catch (err) {
      console.warn('[GalleryUploader] batchDeleteMedia endpoint failed, falling back to sequential delete:', err);
      try {
        await Promise.all(itemIds.map((id) => this.deleteMedia(id)));
        return true;
      } catch (fallbackErr) {
        console.error('[GalleryUploader] sequential delete fallback failed:', fallbackErr);
        return false;
      }
    }
  }

  public async setGalleryCover(
    galleryId: string,
    coverUrl?: string,
    coverVideoUrl?: string
  ): Promise<GallerySummary | null> {
    try {
      const data = await this.fetchApi<{ gallery: any }>(`/admin/galleries/${galleryId}/cover`, {
        method: 'PUT',
        body: JSON.stringify({ coverUrl, coverVideoUrl }),
      });
      return data.gallery ? this.mapGallerySummary(data.gallery) : null;
    } catch (err) {
      console.error('[GalleryUploader] setGalleryCover failed:', err);
      return null;
    }
  }

  public async fetchSongs(): Promise<GallerySongItem[]> {
    try {
      const data = await this.fetchApi<{ songs: GallerySongItem[] }>('/admin/songs');
      return data.songs || [];
    } catch (err) {
      console.error('[GalleryUploader] fetchSongs failed:', err);
      return [];
    }
  }

  public async setGallerySong(
    galleryId: string,
    backgroundMusicUrl: string,
    backgroundMusicTitle: string
  ): Promise<GallerySummary | null> {
    try {
      const data = await this.fetchApi<{ gallery: any }>(`/admin/galleries/${galleryId}`, {
        method: 'PUT',
        body: JSON.stringify({ backgroundMusicUrl, backgroundMusicTitle }),
      });
      return data.gallery ? this.mapGallerySummary(data.gallery) : null;
    } catch (err) {
      console.error('[GalleryUploader] setGallerySong failed:', err);
      return null;
    }
  }

  public async chooseAndUploadSong(
    galleryId: string
  ): Promise<{ song: GallerySongItem; gallery: GallerySummary | null } | null> {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const res = await dialog.showOpenDialog(win, {
      title: 'Select Background Music / Song for Gallery',
      properties: ['openFile'],
      filters: [
        {
          name: 'Audio Files',
          extensions: ['mp3', 'm4a', 'wav', 'aac', 'ogg', 'flac'],
        },
      ],
    });

    if (res.canceled || !res.filePaths.length) return null;
    const filePath = res.filePaths[0];
    const originalFilename = path.basename(filePath);
    const title = path.parse(originalFilename).name.replace(/[-_]+/g, ' ').trim();
    const totalBytes = statSync(filePath).size;

    const ext = path.extname(originalFilename).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.m4a': 'audio/mp4',
      '.wav': 'audio/wav',
      '.aac': 'audio/aac',
      '.ogg': 'audio/ogg',
      '.flac': 'audio/flac',
    };
    const mimeType = mimeMap[ext] || 'audio/mpeg';

    const boundary = `----BaawaraySongUpload${randomUUID().replace(/-/g, '')}`;
    const crlf = '\r\n';
    const fieldGallery =
      `--${boundary}${crlf}` +
      `Content-Disposition: form-data; name="galleryId"${crlf}${crlf}` +
      `${galleryId}${crlf}`;
    const fieldTitle =
      `--${boundary}${crlf}` +
      `Content-Disposition: form-data; name="title"${crlf}${crlf}` +
      `${title}${crlf}`;
    const fileHeader =
      `--${boundary}${crlf}` +
      `Content-Disposition: form-data; name="song"; filename="${originalFilename}"${crlf}` +
      `Content-Type: ${mimeType}${crlf}${crlf}`;
    const footer = `${crlf}--${boundary}--${crlf}`;

    const preamble = fieldGallery + fieldTitle + fileHeader;
    const contentLength = Buffer.byteLength(preamble) + totalBytes + Buffer.byteLength(footer);

    const postSongToBase = (baseUrl: string): Promise<any> => {
      const targetUrl = new URL(`${baseUrl}/admin/songs/upload`);
      const requestModule = targetUrl.protocol === 'https:' ? https : http;
      return new Promise((resolve, reject) => {
        const req = requestModule.request(
          targetUrl,
          {
            method: 'POST',
            headers: {
              'x-studio-secret': STUDIO_SECRET,
              'Content-Type': `multipart/form-data; boundary=${boundary}`,
              'Content-Length': String(contentLength),
            },
            timeout: 120_000,
          },
          (resp) => {
            let body = '';
            resp.on('data', (chunk) => { body += chunk; });
            resp.on('end', () => {
              if (resp.statusCode && resp.statusCode >= 200 && resp.statusCode < 300) {
                try {
                  resolve(JSON.parse(body));
                } catch {
                  reject(new Error('Invalid JSON response from song upload'));
                }
              } else {
                reject(new Error(`Song upload failed (${resp.statusCode}): ${body}`));
              }
            });
          }
        );
        req.on('error', reject);
        req.write(preamble);
        const stream = createReadStream(filePath);
        stream.on('data', (chunk) => req.write(chunk));
        stream.on('end', () => {
          req.write(footer);
          req.end();
        });
        stream.on('error', (err) => {
          req.destroy();
          reject(err);
        });
      });
    };

    let responseData: any;
    try {
      responseData = await postSongToBase(CLOUD_API_BASE);
    } catch (cloudErr) {
      console.warn('[GalleryUploader] Cloud song upload failed, trying local fallback:', cloudErr);
      responseData = await postSongToBase(LOCAL_API_BASE);
    }

    return {
      song: responseData.song,
      gallery: responseData.gallery ? this.mapGallerySummary(responseData.gallery) : null,
    };
  }


  // ---------------------------------------------------------------------------
  // Native File and Directory Selection
  // ---------------------------------------------------------------------------

  public async chooseFiles(mode: 'files' | 'folder' | 'photos' | 'videos'): Promise<string[] | null> {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const properties: ('openFile' | 'openDirectory' | 'multiSelections')[] =
      mode === 'folder'
        ? ['openDirectory', 'multiSelections']
        : ['openFile', 'multiSelections'];

    let title = 'Select Photos and Videos';
    let filters: Electron.FileFilter[] | undefined;

    if (mode === 'photos') {
      title = 'Select Photos';
      filters = [
        {
          name: 'Photo Files',
          extensions: [
            'jpg', 'jpeg', 'png', 'webp', 'heic', 'tif', 'tiff', 'cr2', 'cr3', 'nef', 'arw', 'dng', 'rw2', 'orf', 'raw'
          ],
        },
        { name: 'All Files', extensions: ['*'] },
      ];
    } else if (mode === 'videos') {
      title = 'Select Videos';
      filters = [
        {
          name: 'Video Files',
          extensions: ['mp4', 'mov', 'm4v', 'mkv', 'avi', 'webm'],
        },
        { name: 'All Files', extensions: ['*'] },
      ];
    } else if (mode === 'files') {
      title = 'Select Media Files';
      filters = [
        {
          name: 'Media Files',
          extensions: [
            'mp4', 'mov', 'm4v', 'mkv', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'tif', 'tiff', 'cr2', 'cr3', 'nef', 'arw', 'dng'
          ],
        },
        { name: 'All Files', extensions: ['*'] },
      ];
    }

    const res = await dialog.showOpenDialog(win, {
      title,
      properties,
      filters,
    });

    if (res.canceled || !res.filePaths.length) return null;
    return this.resolveAllMediaPaths(res.filePaths);
  }

  public async resolveAllMediaPaths(inputPaths: string[]): Promise<string[]> {
    const results: string[] = [];

    async function walk(target: string): Promise<void> {
      try {
        const stat = await fs.stat(target);
        if (stat.isDirectory()) {
          const entries = await fs.readdir(target, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === '_logs') continue;
            await walk(path.join(target, entry.name));
          }
        } else if (stat.isFile()) {
          const ext = path.extname(target).slice(1).toLowerCase();
          if (VIDEO_EXTS.has(ext) || PHOTO_EXTS.has(ext)) {
            results.push(target);
          }
        }
      } catch (err) {
        console.warn(`[GalleryUploader] Error walking path ${target}:`, err);
      }
    }

    for (const p of inputPaths) {
      await walk(p);
    }

    return Array.from(new Set(results)).sort();
  }

  // ---------------------------------------------------------------------------
  // Transcoding with Apple Silicon VideoToolbox
  // ---------------------------------------------------------------------------

  private async probeVideoDuration(filePath: string): Promise<number> {
    const probe = ffprobePath();
    const probeViaFfprobe = await new Promise<number>((resolve) => {
      try {
        const proc = spawn(probe, [
          '-v', 'error',
          '-show_entries', 'format=duration',
          '-of', 'default=noprint_wrappers=1:nokey=1',
          filePath,
        ]);

        let out = '';
        proc.stdout.on('data', (d) => { out += d.toString(); });
        proc.on('close', (code) => {
          if (code === 0 && out.trim()) {
            resolve(parseFloat(out.trim()) || 0);
          } else {
            resolve(0);
          }
        });
        proc.on('error', () => resolve(0));
      } catch {
        resolve(0);
      }
    });

    if (probeViaFfprobe > 0) return probeViaFfprobe;

    // Fallback: parse duration from ffmpeg -i stderr
    const ffmpeg = ffmpegPath();
    if (!ffmpeg) return 0;

    return new Promise<number>((resolve) => {
      try {
        const proc = spawn(ffmpeg, ['-hide_banner', '-i', filePath]);
        let errOut = '';
        proc.stderr.on('data', (d) => { errOut += d.toString(); });
        proc.on('close', () => {
          const match = errOut.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}\.\d+)/);
          if (match) {
            const secs =
              parseInt(match[1], 10) * 3600 +
              parseInt(match[2], 10) * 60 +
              parseFloat(match[3]);
            resolve(secs || 0);
          } else {
            resolve(0);
          }
        });
        proc.on('error', () => resolve(0));
      } catch {
        resolve(0);
      }
    });
  }

  private async probeVideoDimensions(filePath: string): Promise<{ width: number; height: number; isLandscape: boolean }> {
    const probe = ffprobePath();
    if (!probe) return { width: 1280, height: 720, isLandscape: true };

    return new Promise((resolve) => {
      try {
        const proc = spawn(probe, [
          '-v', 'error',
          '-select_streams', 'v:0',
          '-show_entries', 'stream=width,height',
          '-of', 'json',
          filePath,
        ]);
        let out = '';
        proc.stdout.on('data', (d) => { out += d.toString(); });
        proc.on('close', () => {
          try {
            const j = JSON.parse(out);
            const w = j.streams?.[0]?.width || 1280;
            const h = j.streams?.[0]?.height || 720;
            resolve({ width: w, height: h, isLandscape: w >= h });
          } catch {
            resolve({ width: 1280, height: 720, isLandscape: true });
          }
        });
        proc.on('error', () => resolve({ width: 1280, height: 720, isLandscape: true }));
      } catch {
        resolve({ width: 1280, height: 720, isLandscape: true });
      }
    });
  }

  private async runFfmpegEncode(
    ffmpeg: string,
    inputPath: string,
    outputPath: string,
    encoderArgs: string[],
    initialDuration: number,
    onProgress: (pct: number) => void,
    isAutoplayLoop = true,
    isCoverVideo = false,
    isLandscape = true
  ): Promise<void> {
    // iPhone 18 Pro Max specs:
    // Cover: 1920p
    // Autoplay loop landscape: 1280p (720p HD)
    // Autoplay loop vertical: 640p
    const targetMaxDim = isCoverVideo ? 1920 : (isAutoplayLoop ? (isLandscape ? 1280 : 640) : 1920);
    const gop = isCoverVideo ? ['-g', '60'] : (isAutoplayLoop ? ['-g', '30'] : ['-g', '60']);
    const audioArgs = (isAutoplayLoop || isCoverVideo) ? ['-an'] : ['-c:a', 'aac', '-b:a', '128k'];

    // Enforce max 10 seconds length (auto-trim if longer)
    const MAX_VIDEO_SECS = 10;
    const trimArgs = ['-t', String(MAX_VIDEO_SECS)];

    // Enforce max 30 FPS (downsamples >30fps like 60fps/120fps, preserves 24fps/25fps)
    const vfFilter = `scale='trunc(min(${targetMaxDim},iw)/2)*2':-2,fps=fps='min(30,source_fps)':round=near`;

    const args = [
      '-y',
      '-i', inputPath,
      ...trimArgs,
      '-map', '0:v:0',
      ...((isAutoplayLoop || isCoverVideo) ? [] : ['-map', '0:a:0?']),
      ...encoderArgs,
      '-vf', vfFilter,
      '-pix_fmt', 'yuv420p',
      ...audioArgs,
      ...gop,
      '-movflags', '+faststart',
      outputPath,
    ];

    return new Promise((resolve, reject) => {
      try {
        const proc = spawn(ffmpeg, args);
        let effectiveDuration = initialDuration > 0 ? Math.min(initialDuration, MAX_VIDEO_SECS) : MAX_VIDEO_SECS;
        let stderrTail = '';

        proc.stderr.on('data', (data) => {
          const str = data.toString();
          stderrTail = (stderrTail + str).slice(-1500);

          if (effectiveDuration <= 0) {
            const durMatch = str.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}\.\d+)/);
            if (durMatch) {
              effectiveDuration =
                parseInt(durMatch[1], 10) * 3600 +
                parseInt(durMatch[2], 10) * 60 +
                parseFloat(durMatch[3]);
            }
          }

          const match = str.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d+)/);
          if (match && effectiveDuration > 0) {
            const secs =
              parseInt(match[1], 10) * 3600 +
              parseInt(match[2], 10) * 60 +
              parseFloat(match[3]);
            const pct = Math.min(100, Math.round((secs / effectiveDuration) * 100));
            onProgress(pct);
          }
        });

        proc.on('close', (code) => {
          if (code === 0) {
            onProgress(100);
            resolve();
          } else {
            const lastLine = stderrTail.trim().split('\n').pop() || `exit code ${code}`;
            reject(new Error(`Transcode failed (${lastLine})`));
          }
        });

        proc.on('error', reject);
      } catch (err) {
        reject(err);
      }
    });
  }

  private async transcodeVideoAppleSilicon(
    inputPath: string,
    outputPath: string,
    duration: number,
    onProgress: (pct: number) => void,
    isAutoplayLoop = true,
    isCoverVideo = false,
    isLandscape = true
  ): Promise<void> {
    const ffmpeg = ffmpegPath();
    if (!ffmpeg) throw new Error('FFmpeg binary not found on Mac');

    const isMac = process.platform === 'darwin';
    const vtArgs = isCoverVideo
      ? ['-c:v', 'h264_videotoolbox', '-b:v', '5500k', '-maxrate', '6500k', '-profile:v', 'high']
      : (isAutoplayLoop
        ? (isLandscape
          ? ['-c:v', 'h264_videotoolbox', '-b:v', '2200k', '-maxrate', '2600k']
          : ['-c:v', 'h264_videotoolbox', '-b:v', '1200k', '-maxrate', '1400k'])
        : ['-c:v', 'h264_videotoolbox', '-b:v', '2600k', '-maxrate', '3200k']);
    const cpuArgs = isCoverVideo
      ? ['-c:v', 'libx264', '-preset', 'fast', '-crf', '21']
      : (isAutoplayLoop
        ? (isLandscape
          ? ['-c:v', 'libx264', '-preset', 'fast', '-crf', '26', '-maxrate', '2200k', '-bufsize', '4400k']
          : ['-c:v', 'libx264', '-preset', 'fast', '-crf', '28', '-maxrate', '1200k', '-bufsize', '2400k'])
        : ['-c:v', 'libx264', '-preset', 'fast', '-crf', '24']);

    if (isMac) {
      try {
        await this.runFfmpegEncode(
          ffmpeg,
          inputPath,
          outputPath,
          vtArgs,
          duration,
          onProgress,
          isAutoplayLoop,
          isCoverVideo,
          isLandscape
        );
        return;
      } catch (vtErr) {
        console.warn('[GalleryUploader] VideoToolbox failed, falling back to libx264:', vtErr);
      }
    }

    await this.runFfmpegEncode(
      ffmpeg,
      inputPath,
      outputPath,
      cpuArgs,
      duration,
      onProgress,
      isAutoplayLoop,
      isCoverVideo,
      isLandscape
    );
  }

  // ---------------------------------------------------------------------------
  // Upload Streamer with Real-Time Progress
  // ---------------------------------------------------------------------------

  private async uploadFileWithProgress(
    galleryId: string,
    sceneId: string,
    filePath: string,
    originalName: string,
    originalFileSize: number,
    preOptimized: boolean,
    isAutoplayLoop: boolean,
    onProgress: (pct: number, bytesTransferred: number, speed: number) => void,
    signal: AbortSignal
  ): Promise<any> {
    const stats = statSync(filePath);
    const totalBytes = stats.size;

    // Build standard multipart body boundary
    const boundary = `----BaawarayMacUploadBoundary${randomUUID().replace(/-/g, '')}`;
    const crlf = '\r\n';

    const ext = path.extname(originalName).slice(1).toLowerCase();
    const isVideo = VIDEO_EXTS.has(ext);
    const mimeType = isVideo
      ? (ext === 'mov' && !preOptimized ? 'video/quicktime' : 'video/mp4')
      : (ext === 'png' && !preOptimized ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg');

    // Field headers
    const fieldScene =
      `--${boundary}${crlf}Content-Disposition: form-data; name="sceneId"${crlf}${crlf}${sceneId}${crlf}`;
    const fieldLoop =
      `--${boundary}${crlf}Content-Disposition: form-data; name="isAutoplayLoop"${crlf}${crlf}${isAutoplayLoop}${crlf}`;
    const fieldPreOpt =
      `--${boundary}${crlf}Content-Disposition: form-data; name="preOptimized"${crlf}${crlf}${preOptimized}${crlf}`;
    const fieldOrigSize =
      `--${boundary}${crlf}Content-Disposition: form-data; name="originalSize"${crlf}${crlf}${originalFileSize}${crlf}`;
    const fileHeader =
      `--${boundary}${crlf}Content-Disposition: form-data; name="files"; filename="${path.basename(originalName)}"${crlf}Content-Type: ${mimeType}${crlf}${crlf}`;
    const footer = `${crlf}--${boundary}--${crlf}`;

    const preamble = fieldScene + fieldLoop + fieldPreOpt + fieldOrigSize + fileHeader;
    const preambleBytes = Buffer.byteLength(preamble);
    const footerBytes = Buffer.byteLength(footer);
    const contentLength = preambleBytes + totalBytes + footerBytes;

    const targetUrl = new URL(`${CLOUD_API_BASE}/admin/galleries/${galleryId}/upload`);
    const isHttps = targetUrl.protocol === 'https:';
    const requestModule = isHttps ? https : http;

    return new Promise((resolve, reject) => {
      let uploadedBytes = 0;
      let lastReport = Date.now();
      let lastBytes = 0;

      const req = requestModule.request(
        targetUrl,
        {
          method: 'POST',
          headers: {
            'x-studio-secret': STUDIO_SECRET,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': String(contentLength),
          },
          signal,
          timeout: 180_000,
        },
        (res) => {
          let responseBody = '';
          res.on('data', (d) => { responseBody += d; });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              onProgress(100, totalBytes, 0);
              try {
                resolve(JSON.parse(responseBody));
              } catch {
                resolve({ success: true });
              }
            } else {
              let errMsg = responseBody;
              try {
                const parsed = JSON.parse(responseBody);
                if (parsed?.error) errMsg = parsed.error;
              } catch {}
              reject(new Error(`Upload failed (${res.statusCode}): ${errMsg}`));
            }
          });
        }
      );

      req.on('timeout', () => {
        req.destroy(new Error('Upload request timed out after 180s'));
      });
      req.on('error', (err) => reject(err));

      // Write multipart preamble
      req.write(preamble);

      // Stream file bytes with real-time network backpressure & speed measurement
      const stream = createReadStream(filePath);
      stream.on('data', (chunk: Buffer | string) => {
        const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
        const canContinue = req.write(buf);
        uploadedBytes += buf.length;
        const now = Date.now();
        if (now - lastReport >= 120) {
          const deltaBytes = uploadedBytes - lastBytes;
          const deltaSec = (now - lastReport) / 1000;
          const speed = deltaSec > 0 ? deltaBytes / deltaSec : 0;
          const pct = Math.min(96, Math.round((uploadedBytes / Math.max(1, totalBytes)) * 96));
          onProgress(pct, uploadedBytes, speed);
          lastReport = now;
          lastBytes = uploadedBytes;
        }
        if (!canContinue) {
          stream.pause();
          req.once('drain', () => {
            stream.resume();
          });
        }
      });

      stream.on('end', () => {
        req.write(footer);
        req.end();
        onProgress(98, totalBytes, 0);
      });

      stream.on('error', (err) => {
        req.destroy();
        reject(err);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Master Upload Queue Orchestrator
  // ---------------------------------------------------------------------------

  public async startUpload(
    galleryId: string,
    sceneId: string,
    filePaths: string[],
    autoTranscode = true,
    isAutoplayLoop = true
  ): Promise<void> {
    console.log(`[GalleryUploader] startUpload called for gallery=${galleryId}, scene=${sceneId}, inputs=${filePaths.length}`);

    // If an upload is currently processing active items, prevent collision
    const isActivelyWorking =
      this.isProcessingQueue &&
      this.state.status === 'running' &&
      this.state.items.some((x) => x.status === 'transcoding' || x.status === 'uploading');
    if (isActivelyWorking) {
      throw new Error('An upload session is currently running. Please wait for it to finish or click Cancel.');
    }

    // Step 1: Recursively resolve all files (handling folders, subfolders, and single files)
    const resolvedPaths = await this.resolveAllMediaPaths(filePaths);
    console.log(`[GalleryUploader] Resolved ${resolvedPaths.length} media files.`);
    if (resolvedPaths.length === 0) {
      throw new Error('No supported media files (videos or photos) were found in the selected files/folders.');
    }

    const galleries = await this.fetchGalleries();
    const g = galleries.find((x) => x.id === galleryId);
    const scene = g?.scenes?.find((s) => s.id === sceneId);

    // Fetch already uploaded items in this gallery to auto-skip duplicates
    let existingFilenames = new Set<string>();
    try {
      const details = await this.fetchApi<{ media?: Array<{ originalFilename?: string }> }>(
        `/admin/galleries/${galleryId}`
      );
      if (details.media && Array.isArray(details.media)) {
        existingFilenames = new Set(
          details.media.map((m) => m.originalFilename).filter(Boolean) as string[]
        );
      }
    } catch (e) {
      console.warn('[GalleryUploader] Could not fetch existing gallery media for skip check:', e);
    }

    const items: GalleryItemProgress[] = resolvedPaths.map((fp) => {
      const ext = path.extname(fp).slice(1).toLowerCase();
      const isVideo = VIDEO_EXTS.has(ext);
      const fileName = path.basename(fp);
      const isAlreadyUploaded = existingFilenames.has(fileName);
      let size = 0;
      try { size = statSync(fp).size; } catch {}

      return {
        id: randomUUID(),
        filePath: fp,
        fileName,
        fileSize: size,
        mediaType: isVideo ? 'video' : 'photo',
        status: isAlreadyUploaded ? 'completed' : 'queued',
        transcodeProgress: isAlreadyUploaded ? 100 : 0,
        uploadProgress: isAlreadyUploaded ? 100 : 0,
        isAutoplayLoop: isVideo ? (isAutoplayLoop ?? true) : undefined,
      };
    });

    const totalBytes = items.reduce((sum, item) => sum + item.fileSize, 0);
    const alreadyCompletedBytes = items
      .filter((it) => it.status === 'completed')
      .reduce((sum, it) => sum + it.fileSize, 0);

    this.state = {
      status: 'running',
      galleryId,
      galleryTitle: g?.title || 'Selected Gallery',
      sceneId: sceneId || 'highlights',
      sceneName: scene?.name || 'Highlights',
      items,
      totalBytes,
      uploadedBytes: alreadyCompletedBytes,
      overallProgress: totalBytes > 0 ? Math.round((alreadyCompletedBytes / totalBytes) * 100) : 0,
      speedBytesPerSec: 0,
      etaSeconds: 0,
      autoTranscode,
    };

    this.cancelled = false;
    this.paused = false;
    this.managePower(true);
    this.broadcast();

    // Run queue in background
    void this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    try {
      const queue = this.state.items;
      let completedBytes = 0;

      for (let i = 0; i < queue.length; i++) {
        if (this.cancelled) break;
        const item = queue[i];
        if (item.status === 'completed') {
          completedBytes += item.fileSize;
          continue;
        }
        if (item.status === 'failed') {
          continue;
        }

        // Handle pause
        while (this.paused && !this.cancelled) {
          await new Promise((r) => setTimeout(r, 500));
        }
        if (this.cancelled) break;

        let uploadTargetFile = item.filePath;
        let tempTranscodedPath: string | null = null;
        let finalSize = item.fileSize;
        let preOptimized = false;

        try {
          // Step 1A: Transcode if it's a video and autoTranscode is enabled
          if (item.mediaType === 'video' && this.state.autoTranscode) {
            item.status = 'transcoding';
            item.error = undefined;
            this.broadcast();

            const duration = await this.probeVideoDuration(item.filePath);
            const { isLandscape } = await this.probeVideoDimensions(item.filePath);
            const isCover = Boolean((item as any).isCoverVideo || (item as any).isCover);
            const loopFlag = item.isAutoplayLoop !== undefined
              ? item.isAutoplayLoop
              : true;
            item.isAutoplayLoop = loopFlag;

            tempTranscodedPath = path.join(
              this.tempDir,
              `${item.id}-web-${path.basename(item.filePath, path.extname(item.filePath))}.mp4`
            );

            await this.transcodeVideoAppleSilicon(
              item.filePath,
              tempTranscodedPath,
              duration,
              (pct) => {
                item.transcodeProgress = pct;
                this.broadcast();
              },
              loopFlag,
              isCover,
              isLandscape
            );

            uploadTargetFile = tempTranscodedPath;
            preOptimized = true;
            try {
              finalSize = statSync(tempTranscodedPath).size;
              item.optimizedSize = finalSize;
            } catch {}
          } else if (item.mediaType === 'photo' && this.state.autoTranscode && item.fileSize > 1000 * 1024) {
            // Step 1B: Local Apple Silicon Sharp optimization for high-res photos (>1MB -> ~250KB, 1920px safe ceiling)
            item.status = 'transcoding';
            item.error = undefined;
            item.transcodeProgress = 40;
            this.broadcast();
            try {
              const tempPhotoPath = path.join(this.tempDir, `${item.id}-opt.jpg`);
              await sharp(item.filePath, { failOn: 'none' })
                .rotate()
                .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
                .withMetadata()
                .jpeg({ quality: 82, mozjpeg: true })
                .toFile(tempPhotoPath);
              tempTranscodedPath = tempPhotoPath;
              uploadTargetFile = tempPhotoPath;
              preOptimized = true;
              finalSize = statSync(tempPhotoPath).size;
              item.optimizedSize = finalSize;
              item.transcodeProgress = 100;
              this.broadcast();
            } catch (sharpErr) {
              console.warn('[GalleryUploader] Local photo pre-compression skipped, uploading original:', sharpErr);
            }
          }

          // Step 2: Upload to Cloud Run
          item.status = 'uploading';
          this.broadcast();

          this.activeUploadController = new AbortController();

          await this.uploadFileWithProgress(
            this.state.galleryId,
            this.state.sceneId,
            uploadTargetFile,
            item.fileName,
            item.fileSize,
            preOptimized,
            item.isAutoplayLoop ?? true,
            (pct, _bytes, speed) => {
              item.uploadProgress = pct;
              item.speedBytesPerSec = speed;
              this.state.speedBytesPerSec = speed;

              const scaledItemBytes = Math.round((pct / 100) * item.fileSize);
              const currentTotalUploaded = completedBytes + scaledItemBytes;
              this.state.uploadedBytes = currentTotalUploaded;
              this.state.overallProgress = Math.min(
                100,
                Math.round((currentTotalUploaded / Math.max(1, this.state.totalBytes)) * 100)
              );

              if (speed > 0) {
                const remainingBytes = Math.max(0, this.state.totalBytes - currentTotalUploaded);
                const sizeRatio = finalSize > 0 ? item.fileSize / finalSize : 1;
                const effectiveSpeed = speed * sizeRatio;
                this.state.etaSeconds = Math.round(remainingBytes / Math.max(1, effectiveSpeed));
              }
              this.broadcast();
            },
            this.activeUploadController.signal
          );

          item.uploadProgress = 100;
          item.status = 'completed';
          item.error = undefined;
          completedBytes += item.fileSize;
          this.state.uploadedBytes = completedBytes;
          this.state.overallProgress = Math.min(
            100,
            Math.round((completedBytes / Math.max(1, this.state.totalBytes)) * 100)
          );
        } catch (err: any) {
          if (this.cancelled) {
            item.status = 'queued';
          } else {
            item.status = 'failed';
            item.error = err?.message || 'Upload error';
            console.error(`[GalleryUploader] Item ${item.fileName} failed:`, err);
          }
        } finally {
          this.activeUploadController = null;
          // Clean up temp file
          if (tempTranscodedPath && existsSync(tempTranscodedPath)) {
            try { await fs.unlink(tempTranscodedPath); } catch {}
          }
          this.broadcast();
        }
      }

      const hasFailures = this.state.items.some((x) => x.status === 'failed');
      this.state.status = this.cancelled ? 'idle' : hasFailures ? 'paused' : 'completed';
      this.state.speedBytesPerSec = 0;
      this.state.etaSeconds = 0;
      this.managePower(false);
      this.broadcast();
    } finally {
      this.isProcessingQueue = false;
    }
  }

  public pauseUpload(): void {
    if (this.state.status === 'running') {
      this.paused = true;
      this.state.status = 'paused';
      this.broadcast();
    }
  }

  public resumeUpload(): void {
    if (this.state.status === 'paused') {
      this.paused = false;
      // If the queue already finished with failures and the user clicks Resume, re-queue failed items and start processing
      if (!this.isProcessingQueue) {
        this.retryFailed();
        return;
      }
      this.state.status = 'running';
      this.broadcast();
    }
  }

  public cancelUpload(): void {
    this.cancelled = true;
    this.paused = false;
    if (this.activeUploadController) {
      this.activeUploadController.abort();
    }
    this.state.status = 'idle';
    this.managePower(false);
    this.broadcast();
  }

  public retryFailed(): void {
    for (const item of this.state.items) {
      if (item.status === 'failed') {
        item.status = 'queued';
        item.error = undefined;
        item.uploadProgress = 0;
        item.transcodeProgress = 0;
      }
    }
    this.state.status = 'running';
    this.cancelled = false;
    this.paused = false;
    this.managePower(true);
    this.broadcast();
    if (!this.isProcessingQueue) {
      void this.processQueue();
    }
  }

  public clearCompleted(): void {
    this.state.items = this.state.items.filter((x) => x.status !== 'completed');
    if (this.state.items.length === 0) {
      this.state.status = 'idle';
      this.state.totalBytes = 0;
      this.state.uploadedBytes = 0;
      this.state.overallProgress = 0;
    } else {
      const totalBytes = this.state.items.reduce((sum, it) => sum + it.fileSize, 0);
      const uploadedBytes = this.state.items
        .filter((it) => it.status === 'completed')
        .reduce((sum, it) => sum + it.fileSize, 0);
      this.state.totalBytes = totalBytes;
      this.state.uploadedBytes = uploadedBytes;
      this.state.overallProgress = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;
    }
    this.broadcast();
  }
}
