import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { join, basename, dirname, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type { GoogleAuth } from './googleAuth';
import type { DownloadProgress, DownloadLinkDetails } from '../shared/contracts';

export interface DownloadResult {
  success: boolean;
  downloadedBytes: number;
  totalBytes: number;
  fileCount: number;
  path: string;
}

function safeFileName(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const leaf = value.split('/').pop()!.replace(/\u0000/g, '');
  return leaf && leaf !== '.' && leaf !== '..' ? leaf : fallback;
}

function contentDispositionName(response: Response): string | undefined {
  const value = response.headers.get('content-disposition');
  if (!value) return undefined;
  const utf8 = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf8) {
    try { return decodeURIComponent(utf8); } catch { /* fall through */ }
  }
  return value.match(/filename=["']?([^"';]+)["']?/i)?.[1];
}

export function safeDownloadTarget(destDir: string, relativeName: string): string {
  const parts = relativeName.split('/').filter(Boolean);
  if (!parts.length || parts.some(part => part === '.' || part === '..')) throw new Error('Cloud file has an unsafe path.');
  const target = resolve(destDir, ...parts.map((part, index) => safeFileName(part, `file_${index + 1}`)));
  const root = resolve(destDir);
  if (target !== root && !target.startsWith(`${root}${sep}`)) throw new Error('Cloud file escaped the selected destination folder.');
  return target;
}

export function parseDriveLink(link: string): { id: string; type: 'folder' | 'file' | 'unknown' } | null {
  try {
    const trimmed = link.trim();
    const u = new URL(trimmed);
    if (!u.hostname.includes('google.com')) return null;

    const folderMatch = u.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch) return { id: folderMatch[1], type: 'folder' };

    const fileMatch = u.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileMatch) return { id: fileMatch[1], type: 'file' };

    const idParam = u.searchParams.get('id');
    if (idParam) return { id: idParam, type: 'unknown' };

    return null;
  } catch {
    return null;
  }
}


function unescapeDriveHtml(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export class SpeedTracker {
  private lastTime = Date.now();
  private lastBytes: number;
  private currentSpeed = 0;

  constructor(initialBytes = 0) {
    this.lastBytes = initialBytes;
  }

  update(downloadedBytes: number, totalBytes: number): { speedBytesPerSec?: number; estimatedRemainingSec?: number } {
    const now = Date.now();
    const elapsed = (now - this.lastTime) / 1000;
    if (elapsed >= 0.5) {
      const delta = Math.max(0, downloadedBytes - this.lastBytes);
      const instantSpeed = delta / elapsed;
      this.currentSpeed = this.currentSpeed === 0 ? instantSpeed : this.currentSpeed * 0.7 + instantSpeed * 0.3;
      this.lastTime = now;
      this.lastBytes = downloadedBytes;
    }
    const speed = Math.round(this.currentSpeed);
    const remainingBytes = Math.max(0, totalBytes - downloadedBytes);
    const eta = speed > 0 ? Math.round(remainingBytes / speed) : undefined;
    return { speedBytesPerSec: speed, estimatedRemainingSec: eta };
  }
}

function safeParseDrivePayload(literalStr: string): any {
  try {
    if (literalStr.startsWith('"') && literalStr.endsWith('"')) {
      const unescaped = JSON.parse(literalStr);
      return typeof unescaped === 'string' ? JSON.parse(unescaped) : unescaped;
    }
    const unescaped = new Function(`return ${literalStr}`)();
    return typeof unescaped === 'string' ? JSON.parse(unescaped) : unescaped;
  } catch {
    return null;
  }
}

export class GoogleDriveQuotaExceededError extends Error {
  constructor(message: string, public readonly downloadedBytes = 0, public readonly downloadedFiles = 0) {
    super(message);
    this.name = 'GoogleDriveQuotaExceededError';
  }
}

function extractCookieHeader(res: Response): string {
  if (typeof (res.headers as any).getSetCookie === 'function') {
    const cookies = (res.headers as any).getSetCookie() as string[];
    if (Array.isArray(cookies) && cookies.length > 0) {
      return cookies.map(c => c.split(';')[0].trim()).join('; ');
    }
  }
  const raw = res.headers.get('set-cookie');
  if (!raw) return '';
  return raw.split(',').map(c => c.split(';')[0].trim()).join('; ');
}

function parseDriveConfirmLink(html: string, fileId: string): string | null {
  // Check form action
  const formMatch = html.match(/<form[^>]*id="download-form"[^>]*action="([^"]+)"/i) || html.match(/<form[^>]*action="([^"]+)"/i);
  const confirmMatch = html.match(/name="confirm"\s+value="([^"]+)"/i) || html.match(/value="([^"]+)"\s+name="confirm"/i);
  if (formMatch && confirmMatch) {
    const actionUrl = formMatch[1].replace(/&amp;/g, '&');
    const token = confirmMatch[1];
    const u = new URL(actionUrl, 'https://drive.usercontent.google.com');
    u.searchParams.set('id', fileId);
    u.searchParams.set('export', 'download');
    u.searchParams.set('confirm', token);
    return u.toString();
  }

  // Check <a> download link
  const linkMatch = html.match(/id="uc-download-link"[^>]*href="([^"]+)"/i) || html.match(/href="([^"]*confirm=[^"&]+[^"]*)"/i);
  if (linkMatch) {
    const rawHref = linkMatch[1].replace(/&amp;/g, '&');
    return new URL(rawHref, 'https://drive.google.com').toString();
  }

  return null;
}

export function isDriveQuotaExceeded(html: string): boolean {
  const lower = html.toLowerCase();
  return (
    lower.includes('quota exceeded') ||
    lower.includes('too many users have viewed or downloaded this file recently') ||
    lower.includes('uc-error-caption') ||
    lower.includes('download quota for this file') ||
    lower.includes('quota has been exceeded')
  );
}

function parseSizeFromHeaders(res: Response): number | undefined {
  const cr = res.headers.get('content-range');
  const cl = res.headers.get('content-length');
  if (cr) {
    const total = parseInt(cr.split('/')[1], 10);
    if (!isNaN(total) && total > 0) return total;
  } else if (cl && res.status === 200) {
    const total = parseInt(cl, 10);
    if (!isNaN(total) && total > 0) return total;
  }
  return undefined;
}

export class DriveDownloader {
  private static driveFileSizeCache = new Map<string, number>();
  private activeDownloads = new Map<string, AbortController>();
  private pausedJobs = new Set<string>();
  private activeProgress = new Map<string, DownloadProgress>();
  private activeDestDirs = new Map<string, string>();
  private activePromises = new Map<string, Promise<DownloadResult>>();
  private progressListeners = new Map<string, Set<(progress: DownloadProgress) => void>>();

  constructor(private google?: GoogleAuth) {}

  cancel(jobId: string): void {
    this.pausedJobs.delete(jobId);
    this.activeProgress.delete(jobId);
    this.activeDestDirs.delete(jobId);
    this.activePromises.delete(jobId);
    this.progressListeners.delete(jobId);
    const controller = this.activeDownloads.get(jobId);
    if (controller) {
      controller.abort();
      this.activeDownloads.delete(jobId);
    }
  }

  pause(jobId: string): void {
    this.pausedJobs.add(jobId);
    this.activePromises.delete(jobId);
    this.progressListeners.delete(jobId);
    const controller = this.activeDownloads.get(jobId);
    if (controller) {
      controller.abort();
      this.activeDownloads.delete(jobId);
    }
  }

  isPaused(jobId: string): boolean {
    return this.pausedJobs.has(jobId);
  }

  isDownloading(jobId: string): boolean {
    return this.activeDownloads.has(jobId);
  }

  getActiveDownload(jobId?: string): { isDownloading: boolean; jobId?: string; progress?: DownloadProgress; destDir?: string; isPaused: boolean } {
    if (jobId) {
      return {
        isDownloading: this.activeDownloads.has(jobId),
        jobId,
        progress: this.activeProgress.get(jobId),
        destDir: this.activeDestDirs.get(jobId),
        isPaused: this.pausedJobs.has(jobId)
      };
    }
    const firstActiveJobId = this.activeDownloads.keys().next().value;
    if (firstActiveJobId) {
      return {
        isDownloading: true,
        jobId: firstActiveJobId,
        progress: this.activeProgress.get(firstActiveJobId),
        destDir: this.activeDestDirs.get(firstActiveJobId),
        isPaused: this.pausedJobs.has(firstActiveJobId)
      };
    }
    return { isDownloading: false, isPaused: false };
  }

  /**
   * Probe exact file size from Google Drive public download endpoint using HTTP Range: bytes=0-0.
   */
  private async probeDriveFileSize(fileId: string, signal?: AbortSignal): Promise<number> {
    if (DriveDownloader.driveFileSizeCache.has(fileId)) {
      return DriveDownloader.driveFileSizeCache.get(fileId)!;
    }
    const urls = [
      `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`,
      `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}&confirm=t`
    ];
    for (const url of urls) {
      if (signal?.aborted) break;
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
            'Range': 'bytes=0-0'
          },
          signal
        });
        const cr = res.headers.get('content-range');
        const cl = res.headers.get('content-length');
        try {
          await res.arrayBuffer();
        } catch {
          // Ignore stream discard error
        }
        if (cr) {
          const parts = cr.split('/');
          const total = parseInt(parts[1], 10);
          if (!isNaN(total) && total > 0) {
            DriveDownloader.driveFileSizeCache.set(fileId, total);
            return total;
          }
        }
        if (res.status === 200 && cl) {
          const total = parseInt(cl, 10);
          if (!isNaN(total) && total > 0) {
            DriveDownloader.driveFileSizeCache.set(fileId, total);
            return total;
          }
        }
      } catch {
        // Try next endpoint
      }
    }
    return 0;
  }

  /**
   * Recursively list all files and subfolders in a public Google Drive folder.
   * Uses embeddedfolderview to overcome the 50-item pagination limit of _DRIVE_ivd,
   * while merging known file sizes from _DRIVE_ivd.
   */
  async listPublicDriveFolderRecursive(
    folderId: string,
    signal?: AbortSignal,
    relativePrefix = ''
  ): Promise<{ files: { id: string; name: string; relativePath: string; size: number }[]; folderTitle?: string; totalBytes: number }> {
    const files: { id: string; name: string; relativePath: string; size: number }[] = [];
    const folders: { id: string; name: string }[] = [];
    let folderTitle: string | undefined;

    // 1. Fetch embeddedfolderview for complete file and folder enumeration
    try {
      const embedUrl = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#list`;
      const res = await fetch(embedUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
        signal
      });
      if (res.ok) {
        const text = await res.text();
        const titleMatch = text.match(/<title>(.*?)<\/title>/);
        if (titleMatch) {
          folderTitle = unescapeDriveHtml(titleMatch[1].replace(/ - Google Drive$/, '').trim());
        }

        const regex = /<div class="flip-entry"[^>]*id="entry-([^"]+)"[\s\S]*?<a href="([^"]+)"[\s\S]*?<div class="flip-entry-title">([^<]+)<\/div>/g;
        let m: RegExpExecArray | null;
        while ((m = regex.exec(text)) !== null) {
          const id = m[1];
          const href = m[2];
          const name = unescapeDriveHtml(m[3].trim());
          const isFolder = href.includes('/folders/') || href.includes('drive.google.com/drive/folders');
          if (isFolder) {
            folders.push({ id, name });
          } else {
            const relativePath = relativePrefix ? `${relativePrefix}/${name}` : name;
            files.push({ id, name, relativePath, size: 0 });
          }
        }
      }
    } catch {
      // Ignore network / parse issues and fallback to _DRIVE_ivd below
    }

    // 2. Fetch standard folder page to retrieve exact sizes from _DRIVE_ivd (for initial batch)
    const knownSizes = new Map<string, number>();
    try {
      const pageRes = await fetch(`https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
        signal
      });
      if (pageRes.ok) {
        const pageText = await pageRes.text();
        if (!folderTitle) {
          const tMatch = pageText.match(/<title>(.*?)<\/title>/);
          if (tMatch) {
            folderTitle = unescapeDriveHtml(tMatch[1].replace(/ - Google Drive$/, '').trim());
          }
        }
        const match =
          pageText.match(/window\[\x27_DRIVE_ivd\x27\]\s*=\s*(\x27.*?\x27);/s) ||
          pageText.match(/window\["_DRIVE_ivd"\]\s*=\s*"(.*?)";/s);
        if (match) {
          const p = safeParseDrivePayload(match[1]);
          if (Array.isArray(p) && Array.isArray(p[0])) {
            for (const f of p[0]) {
              if (Array.isArray(f) && typeof f[0] === 'string') {
                const size = typeof f[13] === 'number' ? f[13] : parseInt(f[13] || '0', 10);
                if (!isNaN(size) && size > 0) knownSizes.set(f[0], size);
                // If embeddedfolderview found no files, fallback to _DRIVE_ivd files
                if (files.length === 0 && typeof f[2] === 'string') {
                  const name = unescapeDriveHtml(f[2].trim());
                  const relativePath = relativePrefix ? `${relativePrefix}/${name}` : name;
                  files.push({ id: f[0], name, relativePath, size: isNaN(size) ? 0 : size });
                }
              }
            }
          }
        }
      }
    } catch {
      // Ignore
    }

    // 3. Populate known sizes from cache and ivd payload
    for (const f of files) {
      if (DriveDownloader.driveFileSizeCache.has(f.id)) {
        f.size = DriveDownloader.driveFileSizeCache.get(f.id)!;
      } else if (knownSizes.has(f.id)) {
        f.size = knownSizes.get(f.id)!;
        DriveDownloader.driveFileSizeCache.set(f.id, f.size);
      }
    }

    // 4. Concurrently probe exact sizes for uncached files
    const uncached = files.filter(f => !f.size);
    if (uncached.length > 0 && !signal?.aborted) {
      const concurrency = 20;
      let index = 0;
      const worker = async (): Promise<void> => {
        while (index < uncached.length) {
          if (signal?.aborted) break;
          const target = uncached[index++];
          if (!target) break;
          const size = await this.probeDriveFileSize(target.id, signal);
          if (size > 0) target.size = size;
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(concurrency, uncached.length) }, () => worker())
      );
    }

    // 5. Fallback estimate for any files where probe failed or was aborted
    const knownList = files.filter(f => f.size > 0);
    const avgSize = knownList.length > 0 ? Math.round(knownList.reduce((s, f) => s + f.size, 0) / knownList.length) : 0;
    for (const f of files) {
      if (!f.size) f.size = avgSize;
    }

    // 5. Recursively crawl subfolders
    for (const sub of folders) {
      if (signal?.aborted) break;
      const subPrefix = relativePrefix ? `${relativePrefix}/${sub.name}` : sub.name;
      const subRes = await this.listPublicDriveFolderRecursive(sub.id, signal, subPrefix);
      files.push(...subRes.files);
    }

    const totalBytes = files.reduce((s, f) => s + f.size, 0);
    return { files, folderTitle, totalBytes };
  }

  /**
   * Pre-flight inspect details (total size, file count, folder name) of a download link.
   */
  async getDownloadDetails(rawDataLink: string): Promise<DownloadLinkDetails> {
    if (!rawDataLink) return { totalBytes: 0, fileCount: 0 };
    try {
      const parsed = parseDriveLink(rawDataLink);
      if (parsed) {
        if (parsed.type === 'file') {
          return { totalBytes: 0, fileCount: 1 };
        }
        const publicData = await this.listPublicDriveFolderRecursive(parsed.id);
        return {
          totalBytes: publicData.totalBytes,
          fileCount: publicData.files.length,
          folderName: publicData.folderTitle
        };
      }
    } catch {
      return { totalBytes: 0, fileCount: 0 };
    }
    return { totalBytes: 0, fileCount: 0 };
  }

  /**
   * Pre-flight inspect the total byte size of a download package from Google Drive or external URL.
   */
  async getDownloadSize(rawDataLink: string): Promise<number> {
    const details = await this.getDownloadDetails(rawDataLink);
    return details.totalBytes;
  }

  /**
   * Download raw data from a Google Drive or external URL to a local destination directory.
   */
  async download(
    jobId: string,
    rawDataLink: string,
    destDir: string,
    onProgress: (progress: DownloadProgress) => void
  ): Promise<DownloadResult> {
    if (!rawDataLink || !destDir) {
      throw new Error('Raw data link and destination directory are required.');
    }

    if (this.activePromises.has(jobId)) {
      if (onProgress) {
        let listeners = this.progressListeners.get(jobId);
        if (!listeners) {
          listeners = new Set();
          this.progressListeners.set(jobId, listeners);
        }
        listeners.add(onProgress);
        const current = this.activeProgress.get(jobId);
        if (current) {
          try {
            onProgress(current);
          } catch {}
        }
      }
      return this.activePromises.get(jobId)!;
    }

    let listeners = this.progressListeners.get(jobId);
    if (!listeners) {
      listeners = new Set();
      this.progressListeners.set(jobId, listeners);
    }
    listeners.add(onProgress);

    const promise = this.executeDownload(jobId, rawDataLink, destDir);
    this.activePromises.set(jobId, promise);
    return promise;
  }

  private async executeDownload(
    jobId: string,
    rawDataLink: string,
    destDir: string
  ): Promise<DownloadResult> {
    this.pausedJobs.delete(jobId);
    this.activeDestDirs.set(jobId, destDir);
    const controller = new AbortController();
    this.activeDownloads.set(jobId, controller);
    const signal = controller.signal;

    const wrappedProgress = (progress: DownloadProgress): void => {
      this.activeProgress.set(jobId, progress);
      const set = this.progressListeners.get(jobId);
      if (set) {
        for (const listener of set) {
          try {
            listener(progress);
          } catch {}
        }
      }
    };

    try {
      await fs.mkdir(destDir, { recursive: true });

      const parsed = parseDriveLink(rawDataLink);
      let result: DownloadResult;

      if (parsed && parsed.type === 'file') {
        result = await this.downloadDriveFile(jobId, parsed.id, destDir, signal, wrappedProgress);
      } else if (parsed && parsed.type === 'folder') {
        result = await this.downloadDriveFolder(jobId, parsed.id, destDir, signal, wrappedProgress);
      } else if (parsed && parsed.type === 'unknown') {
        // Try as file first, fallback to folder
        try {
          result = await this.downloadDriveFile(jobId, parsed.id, destDir, signal, wrappedProgress);
        } catch {
          result = await this.downloadDriveFolder(jobId, parsed.id, destDir, signal, wrappedProgress);
        }
      } else {
        // Generic direct HTTP / archive download
        result = await this.downloadDirectUrl(jobId, rawDataLink, destDir, signal, wrappedProgress);
      }

      wrappedProgress({
        jobId,
        percent: 100,
        downloadedBytes: result.downloadedBytes,
        totalBytes: result.totalBytes || result.downloadedBytes,
        fileName: 'Complete',
        status: 'completed'
      });

      return result;
    } catch (err: any) {
      if (signal.aborted) {
        if (this.pausedJobs.has(jobId)) {
          this.pausedJobs.delete(jobId);
          wrappedProgress({
            jobId,
            percent: 0,
            downloadedBytes: 0,
            totalBytes: 0,
            fileName: 'Paused',
            status: 'paused'
          });
        }
        return {
          success: false,
          downloadedBytes: 0,
          totalBytes: 0,
          fileCount: 0,
          path: destDir
        };
      }
      const message = err?.message || 'Download failed.';
      wrappedProgress({
        jobId,
        percent: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        status: 'error',
        error: message
      });
      throw err;
    } finally {
      this.activeDownloads.delete(jobId);
      this.activeProgress.delete(jobId);
      this.activeDestDirs.delete(jobId);
      this.activePromises.delete(jobId);
      this.progressListeners.delete(jobId);
    }
  }

  /**
   * Fetches a Google Drive file, intercepting quota exceeded errors and auto-resolving
   * virus scan confirmation pages (>100 MB files) with session cookies.
   */
  private async fetchDriveFileDownload(
    fileId: string,
    fileName: string,
    token: string | undefined,
    resumeFrom: number,
    signal: AbortSignal
  ): Promise<{ response: Response; actualSize?: number }> {
    const buildHeaders = (extra?: Record<string, string>): Record<string, string> => {
      const h: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        ...extra
      };
      if (resumeFrom > 0) {
        h['Range'] = `bytes=${resumeFrom}-`;
      }
      return h;
    };

    // 1. If OAuth token exists, try authenticated endpoint first
    if (token) {
      try {
        const fileUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;
        const res = await fetch(fileUrl, {
          headers: buildHeaders({ Authorization: `Bearer ${token}` }),
          signal
        });
        if (res.ok && (res.status === 200 || res.status === 206)) {
          const ct = res.headers.get('content-type') || '';
          if (!ct.includes('text/html') && !ct.includes('application/xhtml+xml')) {
            return { response: res, actualSize: parseSizeFromHeaders(res) };
          }
        }
      } catch {
        // Fall back to public endpoint
      }
    }

    // 2. Try primary public usercontent endpoint
    let cookieHeader = '';
    const initialUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`;
    let res = await fetch(initialUrl, {
      headers: buildHeaders(),
      signal
    });

    cookieHeader = extractCookieHeader(res);
    let contentType = res.headers.get('content-type') || '';

    // If Google returned an HTML page (such as virus scan warning or quota exceeded):
    if (contentType.includes('text/html') || contentType.includes('application/xhtml+xml')) {
      const htmlText = await res.text();

      if (isDriveQuotaExceeded(htmlText)) {
        throw new GoogleDriveQuotaExceededError('Google Drive anonymous download quota exceeded (~15 GB daily limit reached).');
      }

      // Check if it's a virus scan confirmation page (>100 MB files)
      const confirmLink = parseDriveConfirmLink(htmlText, fileId);
      if (confirmLink) {
        res = await fetch(confirmLink, {
          headers: buildHeaders(cookieHeader ? { Cookie: cookieHeader } : undefined),
          signal
        });
        cookieHeader = extractCookieHeader(res) || cookieHeader;
        contentType = res.headers.get('content-type') || '';
        if (res.ok && !contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
          return { response: res, actualSize: parseSizeFromHeaders(res) };
        }
      }

      // If still HTML or virus confirm failed, try the secondary fallback endpoint
      const fallbackUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}&confirm=t`;
      const fallbackRes = await fetch(fallbackUrl, {
        headers: buildHeaders(cookieHeader ? { Cookie: cookieHeader } : undefined),
        signal
      });

      const fallbackCt = fallbackRes.headers.get('content-type') || '';
      if (fallbackCt.includes('text/html')) {
        const fallbackText = await fallbackRes.text();
        if (isDriveQuotaExceeded(fallbackText)) {
          throw new GoogleDriveQuotaExceededError('Google Drive anonymous download quota exceeded (~15 GB daily limit reached).');
        }
        const confirmLink2 = parseDriveConfirmLink(fallbackText, fileId);
        if (confirmLink2) {
          const cookie2 = extractCookieHeader(fallbackRes) || cookieHeader;
          const retryRes = await fetch(confirmLink2, {
            headers: buildHeaders(cookie2 ? { Cookie: cookie2 } : undefined),
            signal
          });
          const retryCt = retryRes.headers.get('content-type') || '';
          if (retryRes.ok && !retryCt.includes('text/html')) {
            return { response: retryRes, actualSize: parseSizeFromHeaders(retryRes) };
          }
        }
        const titleMatch = fallbackText.match(/<title>(.*?)<\/title>/);
        throw new Error(`Google Drive returned an HTML page (${titleMatch ? titleMatch[1] : 'Error'}) instead of media file for ${fileName}`);
      }

      if (!fallbackRes.ok) {
        throw new Error(`Failed to download ${fileName} (status ${fallbackRes.status})`);
      }
      return { response: fallbackRes, actualSize: parseSizeFromHeaders(fallbackRes) };
    }

    if (!res.ok) {
      // Try fallback URL
      const fallbackUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}&confirm=t`;
      res = await fetch(fallbackUrl, {
        headers: buildHeaders(cookieHeader ? { Cookie: cookieHeader } : undefined),
        signal
      });
      if (!res.ok) {
        throw new Error(`Failed to download ${fileName} (status ${res.status})`);
      }
      const ct2 = res.headers.get('content-type') || '';
      if (ct2.includes('text/html')) {
        const t2 = await res.text();
        if (isDriveQuotaExceeded(t2)) {
          throw new GoogleDriveQuotaExceededError('Google Drive anonymous download quota exceeded (~15 GB daily limit reached).');
        }
        throw new Error(`Google Drive returned an HTML page instead of media file for ${fileName}`);
      }
    }

    return { response: res, actualSize: parseSizeFromHeaders(res) };
  }

  /**
   * Download a single file from Google Drive.
   */
  private async downloadDriveFile(
    jobId: string,
    fileId: string,
    destDir: string,
    signal: AbortSignal,
    onProgress: (progress: DownloadProgress) => void,
    preferredName?: string
  ): Promise<DownloadResult> {
    let token: string | undefined;
    if (this.google && this.google.status().connected) {
      try {
        token = await this.google.token();
      } catch {
        // Fall back to public download
      }
    }

    const fallbackName = `drive_file_${fileId}`;
    let fileName = safeFileName(preferredName, fallbackName);
    let totalBytes = 0;

    // Fetch metadata if token available
    if (token) {
      try {
        const metaRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=name,size,mimeType&supportsAllDrives=true`,
          { headers: { Authorization: `Bearer ${token}` }, signal }
        );
        if (metaRes.ok) {
          const meta = (await metaRes.json()) as { name?: string; size?: string };
          if (meta.name) fileName = safeFileName(meta.name, fallbackName);
          if (meta.size) totalBytes = parseInt(meta.size, 10);
        }
      } catch {
        // Continue with default filename
      }
    }

    const { response: res, actualSize } = await this.fetchDriveFileDownload(fileId, fileName, token, 0, signal);
    if (actualSize && actualSize > 0) totalBytes = actualSize;
    fileName = safeFileName(contentDispositionName(res) || fileName, fallbackName);
    const targetPath = safeDownloadTarget(destDir, fileName);
    return await this.streamResponseToFile(jobId, res, targetPath, totalBytes, fileName, signal, onProgress);
  }

  /**
   * Download a folder of files from Google Drive.
   */
  private async downloadDriveFolder(
    jobId: string,
    folderId: string,
    destDir: string,
    signal: AbortSignal,
    onProgress: (progress: DownloadProgress) => void
  ): Promise<DownloadResult> {
    let token: string | undefined;
    if (this.google && this.google.status().connected) {
      try {
        token = await this.google.token();
      } catch {
        // Token retrieval failed
      }
    }

    // If we have an authenticated token, query the Google Drive API for all files in the folder
    if (token) {
      const files: { id: string; name: string; relativePath: string; size: number; mimeType: string }[] = [];
      const foldersToCreate = new Set<string>();
      const listFolder = async (parentId: string, relativeFolder: string): Promise<void> => {
        let pageToken: string | undefined;
        do {
          const query = encodeURIComponent(`'${parentId}' in parents and trashed = false`);
          let url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=nextPageToken,files(id,name,size,mimeType)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`;
          if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
          const listRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal });
          if (!listRes.ok) throw new Error(`Google Drive could not list a folder (status ${listRes.status}).`);
          const data = (await listRes.json()) as { nextPageToken?: string; files?: any[] };
          for (const f of data.files || []) {
            const name = safeFileName(f.name, `file_${f.id}`);
            const relativePath = relativeFolder ? `${relativeFolder}/${name}` : name;
            if (f.mimeType === 'application/vnd.google-apps.folder') {
              foldersToCreate.add(relativePath);
              await listFolder(f.id, relativePath);
            } else {
              files.push({ id: f.id, name, relativePath, size: parseInt(f.size || '0', 10), mimeType: f.mimeType });
            }
          }
          pageToken = data.nextPageToken;
        } while (pageToken && !signal.aborted);
      };
      try {
        await listFolder(folderId, '');
        for (const folder of foldersToCreate) await fs.mkdir(safeDownloadTarget(destDir, folder), { recursive: true });
      } catch {
        // Lacked list permissions for this folder via token; fall through to public list
        files.length = 0;
      }

      if (files.length > 0) {
        const grandTotal = files.reduce((acc, f) => acc + f.size, 0);
        let cumulativeDownloaded = 0;
        const speedTracker = new SpeedTracker();

        for (let i = 0; i < files.length; i++) {
          signal.throwIfAborted();
          const file = files[i];
          const outPath = safeDownloadTarget(destDir, file.relativePath);
          await fs.mkdir(dirname(outPath), { recursive: true });

          const local = await this.localProgress(outPath, file.size);
          if (local.done) {
            cumulativeDownloaded += local.have;
            const { speedBytesPerSec, estimatedRemainingSec } = speedTracker.update(cumulativeDownloaded, grandTotal);
            onProgress({
              jobId,
              percent: grandTotal > 0 ? Math.min(99, Math.round((cumulativeDownloaded / grandTotal) * 100)) : 50,
              downloadedBytes: cumulativeDownloaded,
              totalBytes: grandTotal,
              fileName: `[${i + 1}/${files.length}] ${basename(file.relativePath)} — already downloaded`,
              status: 'downloading',
              speedBytesPerSec,
              estimatedRemainingSec
            });
            continue;
          }

          try {
            const { response: fileRes, actualSize } = await this.fetchDriveFileDownload(
              file.id,
              file.name,
              token,
              local.have,
              signal
            );

            if (actualSize && actualSize !== file.size) {
              file.size = actualSize;
            }

            const fileBytes = await this.streamToFileWithOffset(
              jobId,
              fileRes,
              outPath,
              cumulativeDownloaded,
              grandTotal,
              `[${i + 1}/${files.length}] ${basename(file.relativePath)}`,
              signal,
              onProgress,
              fileRes.status === 206 ? local.have : 0,
              speedTracker
            );

            if (file.size > 0 && fileBytes < Math.min(file.size * 0.95, file.size - 2048)) {
              await fs.unlink(outPath).catch(() => {});
              throw new Error(`Download for ${file.name} was truncated (${fileBytes} of ${file.size} bytes).`);
            }

            cumulativeDownloaded += fileBytes;
          } catch (err: any) {
            if (
              err instanceof GoogleDriveQuotaExceededError ||
              err?.name === 'GoogleDriveQuotaExceededError' ||
              err?.message?.includes('quota exceeded')
            ) {
              throw new GoogleDriveQuotaExceededError(
                `Google Drive anonymous download quota exceeded (~15 GB daily limit reached). Downloaded ${i} of ${files.length} files. Remaining files require opening in browser or syncing via Google Drive for Desktop.`,
                cumulativeDownloaded,
                i
              );
            }
            throw err;
          }
        }

        return {
          success: true,
          downloadedBytes: cumulativeDownloaded,
          totalBytes: grandTotal,
          fileCount: files.length,
          path: destDir
        };
      }
    }

    // Fallback: If no token (e.g. editor without Google account), extract all files via recursive embeddedfolderview
    const publicData = await this.listPublicDriveFolderRecursive(folderId, signal);
    const publicFiles = publicData.files;

    if (publicFiles.length > 0) {
      let grandTotal = publicData.totalBytes;
      let cumulativeDownloaded = 0;
      const speedTracker = new SpeedTracker();

      for (let i = 0; i < publicFiles.length; i++) {
        signal.throwIfAborted();
        const file = publicFiles[i];
        const outPath = safeDownloadTarget(destDir, file.relativePath);
        await fs.mkdir(dirname(outPath), { recursive: true });

        const local = await this.localProgress(outPath, file.size);
        if (local.done) {
          cumulativeDownloaded += local.have;
          const { speedBytesPerSec, estimatedRemainingSec } = speedTracker.update(cumulativeDownloaded, grandTotal);
          onProgress({
            jobId,
            percent: grandTotal > 0 ? Math.min(99, Math.round((cumulativeDownloaded / grandTotal) * 100)) : 50,
            downloadedBytes: cumulativeDownloaded,
            totalBytes: grandTotal,
            fileName: `[${i + 1}/${publicFiles.length}] ${basename(file.relativePath)} — already downloaded`,
            status: 'downloading',
            speedBytesPerSec,
            estimatedRemainingSec
          });
          continue;
        }

        try {
          const { response: fileRes, actualSize } = await this.fetchDriveFileDownload(
            file.id,
            file.name,
            token,
            local.have,
            signal
          );

          if (actualSize && actualSize !== file.size) {
            grandTotal = Math.max(cumulativeDownloaded, grandTotal - file.size + actualSize);
            file.size = actualSize;
            DriveDownloader.driveFileSizeCache.set(file.id, actualSize);
          }

          const fileBytes = await this.streamToFileWithOffset(
            jobId,
            fileRes,
            outPath,
            cumulativeDownloaded,
            grandTotal,
            `[${i + 1}/${publicFiles.length}] ${basename(file.relativePath)}`,
            signal,
            onProgress,
            fileRes.status === 206 ? local.have : 0,
            speedTracker
          );

          if (file.size > 0 && fileBytes < Math.min(file.size * 0.95, file.size - 2048)) {
            await fs.unlink(outPath).catch(() => {});
            throw new Error(`Download for ${file.name} was truncated (${fileBytes} of ${file.size} bytes).`);
          }

          cumulativeDownloaded += fileBytes;
        } catch (err: any) {
          if (
            err instanceof GoogleDriveQuotaExceededError ||
            err?.name === 'GoogleDriveQuotaExceededError' ||
            err?.message?.includes('quota exceeded')
          ) {
            throw new GoogleDriveQuotaExceededError(
              `Google Drive anonymous download quota exceeded (~15 GB daily limit reached). Downloaded ${i} of ${publicFiles.length} files. Remaining files require opening in browser or syncing via Google Drive for Desktop.`,
              cumulativeDownloaded,
              i
            );
          }
          throw err;
        }
      }

      return {
        success: true,
        downloadedBytes: cumulativeDownloaded,
        totalBytes: grandTotal,
        fileCount: publicFiles.length,
        path: destDir
      };
    }

    // Fallback: If folder is public or direct zip
    const directRes = await fetch(
      `https://drive.usercontent.google.com/download?id=${encodeURIComponent(folderId)}&export=download&confirm=t`,
      { signal }
    );

    if (directRes.ok && directRes.headers.get('content-type')?.includes('zip')) {
      const zipPath = join(destDir, `raw_footage_${folderId}.zip`);
      return await this.streamResponseToFile(jobId, directRes, zipPath, 0, `raw_footage_${folderId}.zip`, signal, onProgress);
    }

    throw new Error(
      'Google Drive requires browser authentication to download entire folders. Please click "Open" to download via browser, then click "Locate folder on disk" once downloaded.'
    );
  }



  /**
   * Generic direct download from HTTP/HTTPS URL.
   */
  private async downloadDirectUrl(
    jobId: string,
    url: string,
    destDir: string,
    signal: AbortSignal,
    onProgress: (progress: DownloadProgress) => void
  ): Promise<DownloadResult> {
    let cleanUrl = url.trim();
    if (cleanUrl.includes('dropbox.com') && cleanUrl.includes('dl=0')) {
      cleanUrl = cleanUrl.replace('dl=0', 'dl=1');
    }

    const res = await fetch(cleanUrl, { signal });
    if (!res.ok) {
      throw new Error(`Download failed with status ${res.status}: ${res.statusText}`);
    }

    let fileName = 'raw_footage.zip';
    const responseName = contentDispositionName(res);
    if (responseName) {
      fileName = safeFileName(responseName, fileName);
    } else {
      try {
        const u = new URL(cleanUrl);
        const lastPart = basename(u.pathname);
        if (lastPart && lastPart.includes('.')) fileName = safeFileName(lastPart, fileName);
      } catch {
        // Ignore
      }
    }

    const totalBytes = parseInt(res.headers.get('content-length') || '0', 10);
    const targetPath = safeDownloadTarget(destDir, fileName);

    return await this.streamResponseToFile(jobId, res, targetPath, totalBytes, fileName, signal, onProgress);
  }

  /**
   * Streams a fetch Response body directly to a local file, dispatching progress updates.
   */
  private async streamResponseToFile(
    jobId: string,
    response: Response,
    targetPath: string,
    totalBytes: number,
    fileName: string,
    signal: AbortSignal,
    onProgress: (progress: DownloadProgress) => void
  ): Promise<DownloadResult> {
    if (!response.body) {
      throw new Error('Response has no body to stream.');
    }

    const ct = response.headers.get('content-type') || '';
    if (ct.includes('text/html') || ct.includes('application/xhtml+xml')) {
      const text = await response.text();
      if (isDriveQuotaExceeded(text)) {
        throw new GoogleDriveQuotaExceededError('Google Drive anonymous download quota exceeded (~15 GB daily limit reached).');
      }
      throw new Error(`Google Drive returned an HTML page instead of media content for ${fileName}`);
    }

    const fileStream = createWriteStream(targetPath);
    let downloadedBytes = 0;
    const size = totalBytes || parseInt(response.headers.get('content-length') || '0', 10);
    const speedTracker = new SpeedTracker(0);
    let isFirstChunk = true;

    const nodeStream = Readable.fromWeb(response.body as any);

    nodeStream.on('data', (chunk: Buffer) => {
      if (isFirstChunk) {
        isFirstChunk = false;
        const head = chunk.subarray(0, 120).toString('utf8').trim();
        if (head.startsWith('<!DOCTYPE') || head.startsWith('<html') || head.includes('<title>Google Drive')) {
          nodeStream.destroy(
            head.includes('Quota exceeded')
              ? new GoogleDriveQuotaExceededError('Google Drive anonymous download quota exceeded (~15 GB daily limit reached).')
              : new Error(`Google Drive returned HTML error page instead of media content for ${fileName}`)
          );
          return;
        }
      }

      downloadedBytes += chunk.length;
      const percent = size > 0 ? Math.min(99, Math.round((downloadedBytes / size) * 100)) : 50;
      const { speedBytesPerSec, estimatedRemainingSec } = speedTracker.update(downloadedBytes, size || downloadedBytes);
      onProgress({
        jobId,
        percent,
        downloadedBytes,
        totalBytes: size || downloadedBytes,
        fileName,
        status: 'downloading',
        speedBytesPerSec,
        estimatedRemainingSec
      });
    });

    try {
      await pipeline(nodeStream, fileStream, { signal });
    } catch (err) {
      fileStream.destroy();
      try {
        const stat = await fs.stat(targetPath);
        if (stat.size < 100 * 1024) {
          await fs.unlink(targetPath).catch(() => {});
        }
      } catch {}
      throw err;
    }

    return {
      success: true,
      downloadedBytes,
      totalBytes: size || downloadedBytes,
      fileCount: 1,
      path: targetPath
    };
  }

  /**
   * Streams a fetch Response body for a multi-file batch, tracking cumulative offset.
   */
  private async streamToFileWithOffset(
    jobId: string,
    response: Response,
    targetPath: string,
    offset: number,
    grandTotal: number,
    fileName: string,
    signal: AbortSignal,
    onProgress: (progress: DownloadProgress) => void,
    resumeFrom = 0,
    speedTracker?: SpeedTracker
  ): Promise<number> {
    if (!response.body) {
      throw new Error(`Empty response body for ${fileName}`);
    }

    const ct = response.headers.get('content-type') || '';
    if (ct.includes('text/html') || ct.includes('application/xhtml+xml')) {
      const text = await response.text();
      if (isDriveQuotaExceeded(text)) {
        throw new GoogleDriveQuotaExceededError('Google Drive anonymous download quota exceeded (~15 GB daily limit reached).');
      }
      throw new Error(`Google Drive returned an HTML page instead of media content for ${fileName}`);
    }

    // Returns what the file holds in total, not what this attempt fetched, so a
    // resumed file still counts once towards the job.
    const fileStream = createWriteStream(targetPath, resumeFrom > 0 ? { flags: 'a' } : undefined);
    let fileBytes = resumeFrom;
    const nodeStream = Readable.fromWeb(response.body as any);
    const tracker = speedTracker || new SpeedTracker(offset + resumeFrom);
    let isFirstChunk = true;

    nodeStream.on('data', (chunk: Buffer) => {
      if (isFirstChunk) {
        isFirstChunk = false;
        const head = chunk.subarray(0, 120).toString('utf8').trim();
        if (head.startsWith('<!DOCTYPE') || head.startsWith('<html') || head.includes('<title>Google Drive')) {
          nodeStream.destroy(
            head.includes('Quota exceeded')
              ? new GoogleDriveQuotaExceededError('Google Drive anonymous download quota exceeded (~15 GB daily limit reached).')
              : new Error(`Google Drive returned HTML error page instead of media content for ${fileName}`)
          );
          return;
        }
      }

      fileBytes += chunk.length;
      const cumulative = offset + fileBytes;
      const percent = grandTotal > 0 ? Math.min(99, Math.round((cumulative / grandTotal) * 100)) : 50;
      const { speedBytesPerSec, estimatedRemainingSec } = tracker.update(cumulative, grandTotal);
      onProgress({
        jobId,
        percent,
        downloadedBytes: cumulative,
        totalBytes: grandTotal,
        fileName,
        status: 'downloading',
        speedBytesPerSec,
        estimatedRemainingSec
      });
    });

    try {
      await pipeline(nodeStream, fileStream, { signal });
    } catch (err) {
      fileStream.destroy();
      try {
        const stat = await fs.stat(targetPath);
        if (stat.size < 100 * 1024) {
          await fs.unlink(targetPath).catch(() => {});
        }
      } catch {}
      throw err;
    }
    return fileBytes;
  }

  /**
   * How much of a file is already on disk, and whether it is finished.
   *
   * A 385 GB folder that drops at 80% used to be re-fetched in full, because
   * nothing checked what had already landed. A file whose size matches the
   * cloud's is taken as done; a shorter one is resumed from where it stops; a
   * longer one cannot be a prefix of the real file, so it is replaced outright
   * rather than appended to.
   *
   * Automatically purges 2 KB HTML error files left behind from previous quota failures.
   */
  private async localProgress(targetPath: string, expected: number): Promise<{ done: boolean; have: number }> {
    if (!(expected > 0)) return { done: false, have: 0 };
    try {
      const stat = await fs.stat(targetPath);
      if (!stat.isFile()) return { done: false, have: 0 };

      // If file exists and is small (< 50 KB), check if it's an HTML error page left over from quota failure
      if (stat.size > 0 && (stat.size < 50 * 1024 || (expected > 10 * 1024 * 1024 && stat.size < 1024 * 1024))) {
        try {
          const fd = await fs.open(targetPath, 'r');
          const buf = Buffer.alloc(Math.min(stat.size, 128));
          await fd.read(buf, 0, buf.length, 0);
          await fd.close();
          const head = buf.toString('utf8').trim();
          if (head.startsWith('<!DOCTYPE') || head.startsWith('<html') || head.includes('<title>Google Drive')) {
            // Leftover corrupted HTML error page! Delete it!
            await fs.unlink(targetPath).catch(() => {});
            return { done: false, have: 0 };
          }
        } catch {}

        // If expected is a large video file (> 10 MB) but local file is < 10 KB, it's corrupt junk
        if (expected > 10 * 1024 * 1024 && stat.size < 10 * 1024) {
          await fs.unlink(targetPath).catch(() => {});
          return { done: false, have: 0 };
        }
      }

      if (stat.size === expected) {
        // Quick verify first bytes are not HTML
        if (stat.size < 50 * 1024) {
          try {
            const fd = await fs.open(targetPath, 'r');
            const buf = Buffer.alloc(Math.min(stat.size, 128));
            await fd.read(buf, 0, buf.length, 0);
            await fd.close();
            const head = buf.toString('utf8').trim();
            if (head.startsWith('<!DOCTYPE') || head.startsWith('<html') || head.includes('<title>Google Drive')) {
              await fs.unlink(targetPath).catch(() => {});
              return { done: false, have: 0 };
            }
          } catch {}
        }
        return { done: true, have: stat.size };
      }
      if (stat.size > expected) return { done: false, have: 0 };
      return { done: false, have: stat.size };
    } catch {
      return { done: false, have: 0 };
    }
  }

  /**
   * Scan an existing local directory to verify files and calculate totals.
   * Skips any corrupted 2 KB HTML files left behind by Google Drive quota limits.
   */
  async scanLocalDirectory(dirPath: string): Promise<{ fileCount: number; totalBytes: number }> {
    let fileCount = 0;
    let totalBytes = 0;

    async function walk(current: string): Promise<void> {
      const entries = await fs.readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const fullPath = join(current, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile()) {
          const stat = await fs.stat(fullPath);
          // Check if small file is actually an HTML error page
          if (stat.size > 0 && stat.size < 50 * 1024) {
            try {
              const fd = await fs.open(fullPath, 'r');
              const buf = Buffer.alloc(Math.min(stat.size, 128));
              await fd.read(buf, 0, buf.length, 0);
              await fd.close();
              const head = buf.toString('utf8').trim();
              if (head.startsWith('<!DOCTYPE') || head.startsWith('<html') || head.includes('<title>Google Drive')) {
                // Ignore corrupt HTML file
                continue;
              }
            } catch {}
          }
          fileCount++;
          totalBytes += stat.size;
        }
      }
    }

    try {
      await walk(dirPath);
    } catch {
      return { fileCount: 0, totalBytes: 0 };
    }

    return { fileCount, totalBytes };
  }
}
