import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { join, basename, dirname, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type { GoogleAuth } from './googleAuth';
import type { B2Client } from './b2Client';
import { b2ListingPrefix, b2RelativeName } from './b2Paths';
import type { DownloadProgress } from '../shared/contracts';

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

export function parseB2Link(link: string): { bucket?: string; prefix: string } | null {
  try {
    const trimmed = link.trim();
    if (trimmed.startsWith('b2://')) {
      const pathPart = trimmed.slice(5);
      const slashIdx = pathPart.indexOf('/');
      if (slashIdx === -1) {
        return { prefix: pathPart };
      }
      return {
        bucket: pathPart.slice(0, slashIdx),
        prefix: pathPart.slice(slashIdx + 1)
      };
    }

    const u = new URL(trimmed);
    if (u.hostname.includes('backblazeb2.com')) {
      const match = u.pathname.match(/^\/file\/([^/]+)\/(.+)$/);
      if (match) {
        return {
          bucket: decodeURIComponent(match[1]),
          prefix: decodeURIComponent(match[2])
        };
      }
    }
    return null;
  } catch {
    return null;
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

export class DriveDownloader {
  private activeDownloads = new Map<string, AbortController>();

  constructor(private google?: GoogleAuth, private b2?: B2Client) {}

  setB2Client(b2: B2Client): void {
    this.b2 = b2;
  }

  cancel(jobId: string): void {
    const controller = this.activeDownloads.get(jobId);
    if (controller) {
      controller.abort();
      this.activeDownloads.delete(jobId);
    }
  }

  isDownloading(jobId: string): boolean {
    return this.activeDownloads.has(jobId);
  }

  /**
   * Pre-flight inspect the total byte size of a download package from Backblaze B2 or Drive.
   */
  async getDownloadSize(rawDataLink: string): Promise<number> {
    if (!rawDataLink) return 0;
    try {
      const b2Info = parseB2Link(rawDataLink);
      if (b2Info || rawDataLink.trim().startsWith('b2://')) {
        if (this.b2 && this.b2.isConnected()) {
          const prefix =
            b2Info?.prefix || rawDataLink.replace(/^b2:\/\/[^/]+\/?/, '').replace(/^b2:\/\//, '');
          const files = await this.b2.listFiles(b2ListingPrefix(prefix));
          return files.reduce((sum, f) => sum + f.contentLength, 0);
        }
      }

      const parsed = parseDriveLink(rawDataLink);
      if (parsed) {
        const pageRes = await fetch(
          `https://drive.google.com/drive/folders/${encodeURIComponent(parsed.id)}`,
          {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
          }
        );
        if (pageRes.ok) {
          const text = await pageRes.text();
          const match =
            text.match(/window\[\x27_DRIVE_ivd\x27\]\s*=\s*(\x27.*?\x27);/s) ||
            text.match(/window\["_DRIVE_ivd"\]\s*=\s*"(.*?)";/s);
          if (match) {
            try {
              const p = safeParseDrivePayload(match[1]);
              if (Array.isArray(p) && Array.isArray(p[0])) {
                let total = 0;
                for (const f of p[0]) {
                  if (Array.isArray(f) && typeof f[13] === 'number') total += f[13];
                }
                return total;
              }
            } catch {
              // Ignore parse error
            }
          }
        }
      }
    } catch {
      return 0;
    }
    return 0;
  }

  /**
   * Download raw data from a Google Drive, Backblaze B2, or external URL to a local destination directory.
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

    if (this.activeDownloads.has(jobId)) {
      throw new Error('A download is already in progress for this job.');
    }

    const controller = new AbortController();
    this.activeDownloads.set(jobId, controller);
    const signal = controller.signal;

    try {
      await fs.mkdir(destDir, { recursive: true });

      const parsed = parseDriveLink(rawDataLink);
      const b2Info = parseB2Link(rawDataLink);
      let result: DownloadResult;

      if (b2Info || rawDataLink.trim().startsWith('b2://')) {
        result = await this.downloadB2Data(jobId, rawDataLink, destDir, signal, onProgress);
      } else if (parsed && parsed.type === 'file') {
        result = await this.downloadDriveFile(jobId, parsed.id, destDir, signal, onProgress);
      } else if (parsed && parsed.type === 'folder') {
        result = await this.downloadDriveFolder(jobId, parsed.id, destDir, signal, onProgress);
      } else if (parsed && parsed.type === 'unknown') {
        // Try as file first, fallback to folder
        try {
          result = await this.downloadDriveFile(jobId, parsed.id, destDir, signal, onProgress);
        } catch {
          result = await this.downloadDriveFolder(jobId, parsed.id, destDir, signal, onProgress);
        }
      } else {
        // Generic direct HTTP / archive download
        result = await this.downloadDirectUrl(jobId, rawDataLink, destDir, signal, onProgress);
      }

      onProgress({
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
        onProgress({
          jobId,
          percent: 0,
          downloadedBytes: 0,
          totalBytes: 0,
          status: 'error',
          error: 'Download cancelled by user.'
        });
        throw new Error('Download cancelled.');
      }
      const message = err?.message || 'Download failed.';
      onProgress({
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
    }
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

    const downloadUrl = token
      ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`
      : `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`;

    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(downloadUrl, { headers, signal });

    if (!res.ok) {
      // Try fallback public endpoint
      const fallbackUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}&confirm=t`;
      const fallbackRes = await fetch(fallbackUrl, { signal });
      if (!fallbackRes.ok) {
        throw new Error(`Google Drive download failed with status ${res.status}`);
      }
      fileName = safeFileName(contentDispositionName(fallbackRes) || fileName, fallbackName);
      const targetPath = safeDownloadTarget(destDir, fileName);
      return await this.streamResponseToFile(jobId, fallbackRes, targetPath, totalBytes, fileName, signal, onProgress);
    }

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
      await listFolder(folderId, '');
      for (const folder of foldersToCreate) await fs.mkdir(safeDownloadTarget(destDir, folder), { recursive: true });

      if (files.length > 0) {
        const grandTotal = files.reduce((acc, f) => acc + f.size, 0);
        let cumulativeDownloaded = 0;

        for (let i = 0; i < files.length; i++) {
          signal.throwIfAborted();
          const file = files[i];
          const outPath = safeDownloadTarget(destDir, file.relativePath);
          await fs.mkdir(dirname(outPath), { recursive: true });

          const fileUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`;
          const fileRes = await fetch(fileUrl, { headers: { Authorization: `Bearer ${token}` }, signal });

          if (!fileRes.ok) {
            throw new Error(`Failed to download ${file.name} (status ${fileRes.status})`);
          }

          const fileBytes = await this.streamToFileWithOffset(
            jobId,
            fileRes,
            outPath,
            cumulativeDownloaded,
            grandTotal,
            file.relativePath,
            signal,
            onProgress
          );

          cumulativeDownloaded += fileBytes;
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

    // Fallback: If no token (e.g. editor without Google account), extract files from public Drive folder page
    const publicFiles: { id: string; name: string; size: number }[] = [];
    try {
      const pageRes = await fetch(`https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
        signal
      });
      if (pageRes.ok) {
        const text = await pageRes.text();
        const match =
          text.match(/window\[\x27_DRIVE_ivd\x27\]\s*=\s*(\x27.*?\x27);/s) ||
          text.match(/window\["_DRIVE_ivd"\]\s*=\s*"(.*?)";/s);
        if (match) {
          try {
            const parsed = safeParseDrivePayload(match[1]);
            if (Array.isArray(parsed) && Array.isArray(parsed[0])) {
              for (const f of parsed[0]) {
                if (Array.isArray(f) && typeof f[0] === 'string' && typeof f[2] === 'string') {
                  const size = typeof f[13] === 'number' ? f[13] : parseInt(f[13] || '0', 10);
                  publicFiles.push({ id: f[0], name: f[2], size: isNaN(size) ? 0 : size });
                }
              }
            }
          } catch {
            // Parsing error, proceed to next fallback
          }
        }
      }
    } catch {
      // Network error, proceed to next fallback
    }

    if (publicFiles.length > 0) {
      const grandTotal = publicFiles.reduce((acc, f) => acc + f.size, 0);
      let cumulativeDownloaded = 0;

      for (let i = 0; i < publicFiles.length; i++) {
        signal.throwIfAborted();
        const file = publicFiles[i];

        const fileResult = await this.downloadDriveFile(jobId, file.id, destDir, signal, p => {
          const currentTotal = cumulativeDownloaded + p.downloadedBytes;
          const percent =
            grandTotal > 0 ? Math.min(99, Math.round((currentTotal / grandTotal) * 100)) : 50;
          onProgress({
            jobId,
            percent,
            downloadedBytes: currentTotal,
            totalBytes: grandTotal,
            fileName: `[${i + 1}/${publicFiles.length}] ${file.name}`,
            status: 'downloading'
          });
        }, file.name);

        cumulativeDownloaded += fileResult.downloadedBytes;
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
   * Download raw data from Backblaze B2 (either single file or folder prefix).
   */
  private async downloadB2Data(
    jobId: string,
    rawDataLink: string,
    destDir: string,
    signal: AbortSignal,
    onProgress: (progress: DownloadProgress) => void
  ): Promise<DownloadResult> {
    const parsed = parseB2Link(rawDataLink);

    if (this.b2 && this.b2.isConnected()) {
      const prefix = parsed?.prefix || rawDataLink.replace(/^b2:\/\//, '');
      const files = await this.b2.listFiles(b2ListingPrefix(prefix));

      if (files.length > 0) {
        const grandTotal = files.reduce((sum, f) => sum + f.contentLength, 0);
        let cumulativeBytes = 0;

        for (let i = 0; i < files.length; i++) {
          signal.throwIfAborted();
          const file = files[i];

          const relativeName = b2RelativeName(prefix, file.fileName);

          const targetPath = safeDownloadTarget(destDir, relativeName);
          await fs.mkdir(dirname(targetPath), { recursive: true });

          const fileDownloaded = await this.b2.downloadFile(
            file.fileName,
            targetPath,
            signal,
            chunkDownloaded => {
              const currentTotal = cumulativeBytes + chunkDownloaded;
              const percent = grandTotal > 0 ? Math.min(99, Math.round((currentTotal / grandTotal) * 100)) : 50;
              onProgress({
                jobId,
                percent,
                downloadedBytes: currentTotal,
                totalBytes: grandTotal,
                fileName: `[${i + 1}/${files.length}] ${basename(file.fileName)}`,
                status: 'downloading'
              });
            }
          );
          cumulativeBytes += fileDownloaded;
        }

        return {
          success: true,
          downloadedBytes: cumulativeBytes,
          totalBytes: grandTotal,
          fileCount: files.length,
          path: destDir
        };
      }
    }

    // If it is a direct HTTP(S) Backblaze URL:
    if (rawDataLink.startsWith('http://') || rawDataLink.startsWith('https://')) {
      return await this.downloadDirectUrl(jobId, rawDataLink, destDir, signal, onProgress);
    }

    throw new Error(
      'Unable to download from Backblaze B2. Please ensure Backblaze B2 is configured in Settings or provide a direct download URL.'
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

    const fileStream = createWriteStream(targetPath);
    let downloadedBytes = 0;
    const size = totalBytes || parseInt(response.headers.get('content-length') || '0', 10);

    const nodeStream = Readable.fromWeb(response.body as any);

    nodeStream.on('data', (chunk: Buffer) => {
      downloadedBytes += chunk.length;
      const percent = size > 0 ? Math.min(99, Math.round((downloadedBytes / size) * 100)) : 50;
      onProgress({
        jobId,
        percent,
        downloadedBytes,
        totalBytes: size || downloadedBytes,
        fileName,
        status: 'downloading'
      });
    });

    await pipeline(nodeStream, fileStream, { signal });

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
    onProgress: (progress: DownloadProgress) => void
  ): Promise<number> {
    if (!response.body) {
      throw new Error(`Empty response body for ${fileName}`);
    }

    const fileStream = createWriteStream(targetPath);
    let fileBytes = 0;
    const nodeStream = Readable.fromWeb(response.body as any);

    nodeStream.on('data', (chunk: Buffer) => {
      fileBytes += chunk.length;
      const cumulative = offset + fileBytes;
      const percent = grandTotal > 0 ? Math.min(99, Math.round((cumulative / grandTotal) * 100)) : 50;
      onProgress({
        jobId,
        percent,
        downloadedBytes: cumulative,
        totalBytes: grandTotal,
        fileName,
        status: 'downloading'
      });
    });

    await pipeline(nodeStream, fileStream, { signal });
    return fileBytes;
  }

  /**
   * Scan an existing local directory to verify files and calculate totals.
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
