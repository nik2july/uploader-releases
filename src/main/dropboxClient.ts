import { Dropbox } from 'dropbox';
import fs from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename } from 'node:path';

function safeDropboxSegment(value: string, fallback: string): string {
  // Dropbox supports Unicode and spaces. Only remove actual path separators,
  // control characters, and the two traversal-only names.
  const cleaned = value.trim().replace(/[\/\\\u0000-\u001f\u007f]/g, '-');
  return cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned : fallback;
}

export function buildDropboxDestination(filePath: string, targetFolder: string): string {
  const folder = safeDropboxSegment(targetFolder, 'Untitled project');
  const fileName = safeDropboxSegment(basename(filePath), 'deliverable');
  return `/Deliverables/${folder}/${fileName}`;
}

export class DropboxManager {
  private dbx: Dropbox | null = null;

  configure(config: { appKey?: string; appSecret?: string; refreshToken?: string; accessToken?: string }): void {
    if (config.refreshToken && config.appKey && config.appSecret) {
      this.dbx = new Dropbox({
        clientId: config.appKey,
        clientSecret: config.appSecret,
        refreshToken: config.refreshToken,
      });
    } else if (config.accessToken || config.refreshToken) {
      this.dbx = new Dropbox({
        accessToken: config.accessToken || config.refreshToken,
      });
    } else {
      this.dbx = null;
    }
  }

  isConfigured(): boolean {
    return Boolean(this.dbx);
  }

  async status(): Promise<{ configured: boolean; connected: boolean; email?: string; error?: string }> {
    if (!this.dbx) return { configured: false, connected: false };
    try {
      const acc = await this.dbx.usersGetCurrentAccount();
      return { configured: true, connected: true, email: acc.result.email };
    } catch (err: any) {
      return { configured: true, connected: false, error: err?.message || 'Dropbox connection failed' };
    }
  }

  async uploadDeliverable(
    filePath: string,
    targetFolder: string,
    fileName: string,
    onProgress?: (percent: number, uploadedBytes: number, totalBytes: number) => void
  ): Promise<string> {
    if (!this.dbx) throw new Error('Studio Dropbox is not configured or connected.');

    // The native file path is the source of truth. Renderer-provided labels
    // must never rename a Unicode filename or smuggle another path segment in.
    void fileName;
    const destPath = buildDropboxDestination(filePath, targetFolder);

    const fileStat = await stat(filePath);
    const totalBytes = fileStat.size;
    const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB

    if (totalBytes <= CHUNK_SIZE) {
      const contents = await fs.promises.readFile(filePath);
      await this.dbx.filesUpload({
        path: destPath,
        contents,
        mode: { '.tag': 'overwrite' },
      });
      if (onProgress) onProgress(100, totalBytes, totalBytes);
    } else {
      const fd = await fs.promises.open(filePath, 'r');
      try {
        let offset = 0;
        const firstBuffer = Buffer.alloc(CHUNK_SIZE);
        const { bytesRead: firstBytes } = await fd.read(firstBuffer, 0, CHUNK_SIZE, 0);
        const firstChunk = firstBuffer.subarray(0, firstBytes);

        const startRes = await this.dbx.filesUploadSessionStart({
          close: false,
          contents: firstChunk,
        });
        const sessionId = startRes.result.session_id;
        offset += firstBytes;
        if (onProgress) onProgress(Math.round((offset / totalBytes) * 100), offset, totalBytes);

        while (offset < totalBytes) {
          const remaining = totalBytes - offset;
          const chunkSize = Math.min(remaining, CHUNK_SIZE);
          const buf = Buffer.alloc(chunkSize);
          const { bytesRead } = await fd.read(buf, 0, chunkSize, offset);
          const chunk = buf.subarray(0, bytesRead);

          if (offset + bytesRead >= totalBytes) {
            await this.dbx.filesUploadSessionFinish({
              cursor: { session_id: sessionId, offset },
              commit: { path: destPath, mode: { '.tag': 'overwrite' }, autorename: false, mute: true },
              contents: chunk,
            });
            offset += bytesRead;
            if (onProgress) onProgress(100, totalBytes, totalBytes);
            break;
          } else {
            await this.dbx.filesUploadSessionAppendV2({
              cursor: { session_id: sessionId, offset },
              close: false,
              contents: chunk,
            });
            offset += bytesRead;
            if (onProgress) onProgress(Math.round((offset / totalBytes) * 100), offset, totalBytes);
          }
        }
      } finally {
        await fd.close();
      }
    }

    // Retrieve or create public shared link
    try {
      const linkRes = await this.dbx.sharingCreateSharedLinkWithSettings({ path: destPath });
      return linkRes.result.url;
    } catch (err: any) {
      if (err?.error?.error?.['.tag'] === 'shared_link_already_exists') {
        const existing = await this.dbx.sharingListSharedLinks({ path: destPath });
        if (existing.result.links.length > 0) {
          return existing.result.links[0].url;
        }
      }
      throw err;
    }
  }

  async deleteDeliverable(targetPath: string): Promise<void> {
    if (!this.dbx) throw new Error('Studio Dropbox is not configured or connected.');
    try {
      await this.dbx.filesDeleteV2({ path: targetPath });
    } catch (err: any) {
      if (err?.error?.error?.['.tag'] === 'path_lookup' && err?.error?.error?.path_lookup?.['.tag'] === 'not_found') {
        return;
      }
      throw err;
    }
  }

  async downloadDeliverable(dropboxPath: string, localFilePath: string): Promise<void> {
    if (!this.dbx) throw new Error('Studio Dropbox is not configured or connected.');
    const response = await this.dbx.filesDownload({ path: dropboxPath });
    const fileData = (response.result as any).fileBinary;
    if (fileData) {
      await fs.promises.writeFile(localFilePath, fileData);
    }
  }
}

export const dropbox = new DropboxManager();
