import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export interface B2AuthContext {
  accountId: string;
  authorizationToken: string;
  apiUrl: string;
  downloadUrl: string;
  recommendedPartSize: number;
  absoluteMinimumPartSize: number;
  allowed: {
    bucketId?: string;
    bucketName?: string;
    capabilities: string[];
    namePrefix?: string;
  };
}

export interface B2UploadProgress {
  bytesUploaded: number;
  totalBytes: number;
  percent: number;
  currentFile: string;
  speedBytesPerSec: number;
  partNumber?: number;
  totalParts?: number;
}

export class BackblazeB2Client {
  private keyId: string = '';
  private applicationKey: string = '';
  private bucketId: string = '';
  private bucketName: string = '';
  private authContext: B2AuthContext | null = null;
  private authExpiresAt: number = 0;

  constructor(config?: { keyId?: string; applicationKey?: string; bucketId?: string; bucketName?: string }) {
    if (config) {
      this.keyId = config.keyId || '';
      this.applicationKey = config.applicationKey || '';
      this.bucketId = config.bucketId || '';
      this.bucketName = config.bucketName || '';
    }
  }

  configure(config: { keyId: string; applicationKey: string; bucketId?: string; bucketName?: string }): void {
    this.keyId = config.keyId.trim();
    this.applicationKey = config.applicationKey.trim();
    if (config.bucketId) this.bucketId = config.bucketId.trim();
    if (config.bucketName) this.bucketName = config.bucketName.trim();
    this.authContext = null;
    this.authExpiresAt = 0;
  }

  isConfigured(): boolean {
    return Boolean(this.keyId && this.applicationKey);
  }

  getConfig(): { keyId: string; applicationKey: string; bucketId: string; bucketName: string; isConfigured: boolean } {
    return {
      keyId: this.keyId,
      applicationKey: this.applicationKey ? `${this.applicationKey.slice(0, 4)}••••••••${this.applicationKey.slice(-4)}` : '',
      bucketId: this.bucketId,
      bucketName: this.bucketName,
      isConfigured: this.isConfigured()
    };
  }

  async testConnection(): Promise<{ ok: boolean; message: string; accountId?: string }> {
    try {
      const auth = await this.authorize();
      return {
        ok: true,
        message: `Connected successfully to Backblaze B2 (Account ID: ${auth.accountId})`,
        accountId: auth.accountId
      };
    } catch (err: any) {
      return {
        ok: false,
        message: err.message || 'Failed to authenticate with Backblaze B2'
      };
    }
  }

  /**
   * Authenticate with Backblaze B2 API (token valid for 24 hours)
   */
  async authorize(): Promise<B2AuthContext> {
    if (this.authContext && Date.now() < this.authExpiresAt) {
      return this.authContext;
    }

    if (!this.keyId || !this.applicationKey) {
      throw new Error('Backblaze B2 credentials missing. Please set Key ID and Application Key in Studio Settings.');
    }

    const credentials = Buffer.from(`${this.keyId}:${this.applicationKey}`).toString('base64');
    const res = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
      headers: {
        Authorization: `Basic ${credentials}`
      }
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Backblaze B2 authorization failed (${res.status}): ${errText}`);
    }

    const data = (await res.json()) as B2AuthContext;
    this.authContext = data;
    // Cache for 23 hours (B2 tokens are valid for 24h)
    this.authExpiresAt = Date.now() + 23 * 3600 * 1000;
    if (!this.bucketId && data.allowed?.bucketId) {
      this.bucketId = data.allowed.bucketId;
    }
    if (!this.bucketName && data.allowed?.bucketName) {
      this.bucketName = data.allowed.bucketName;
    }
    return data;
  }

  /**
   * Upload small file (< 100 MB)
   */
  async uploadSmallFile(
    filePath: string,
    b2DestinationPath: string,
    onProgress?: (bytes: number) => void
  ): Promise<{ fileId: string; fileName: string; contentSha1: string }> {
    const auth = await this.authorize();
    const stats = await fsp.stat(filePath);
    const fileBytes = stats.size;
    const fileBuffer = await fsp.readFile(filePath);
    const sha1 = crypto.createHash('sha1').update(fileBuffer).digest('hex');

    // Get upload URL
    const uploadUrlRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_upload_url`, {
      method: 'POST',
      headers: {
        Authorization: auth.authorizationToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ bucketId: this.bucketId })
    });

    if (!uploadUrlRes.ok) {
      throw new Error(`Failed to get B2 upload URL: ${await uploadUrlRes.text()}`);
    }

    const uploadUrlData = (await uploadUrlRes.json()) as { uploadUrl: string; authorizationToken: string };

    const encodedFileName = encodeURIComponent(b2DestinationPath.replace(/\\/g, '/')).replace(/%2F/g, '/');
    const uploadRes = await fetch(uploadUrlData.uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: uploadUrlData.authorizationToken,
        'X-Bz-File-Name': encodedFileName,
        'Content-Type': 'b2/x-auto',
        'Content-Length': String(fileBytes),
        'X-Bz-Content-Sha1': sha1
      },
      body: fileBuffer
    });

    if (!uploadRes.ok) {
      throw new Error(`B2 small file upload failed: ${await uploadRes.text()}`);
    }

    onProgress?.(fileBytes);
    return (await uploadRes.json()) as any;
  }

  /**
   * Upload large file (> 100 MB) using B2 Large File API with multipart chunks
   */
  async uploadLargeFile(
    filePath: string,
    b2DestinationPath: string,
    onProgress?: (progress: B2UploadProgress) => void
  ): Promise<{ fileId: string; fileName: string; contentSha1: string }> {
    const auth = await this.authorize();
    const stats = await fsp.stat(filePath);
    const totalBytes = stats.size;
    const partSize = Math.max(auth.recommendedPartSize || 100 * 1024 * 1024, 10 * 1024 * 1024);
    const totalParts = Math.ceil(totalBytes / partSize);

    const encodedFileName = encodeURIComponent(b2DestinationPath.replace(/\\/g, '/')).replace(/%2F/g, '/');

    // 1. Start large file
    const startRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_start_large_file`, {
      method: 'POST',
      headers: {
        Authorization: auth.authorizationToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        bucketId: this.bucketId,
        fileName: encodedFileName,
        contentType: 'b2/x-auto'
      })
    });

    if (!startRes.ok) {
      throw new Error(`Failed to start B2 large file: ${await startRes.text()}`);
    }

    const { fileId } = (await startRes.json()) as { fileId: string };
    const partSha1List: string[] = [];
    let bytesUploaded = 0;
    const startTime = Date.now();

    const fd = await fsp.open(filePath, 'r');
    try {
      for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
        const offset = (partNumber - 1) * partSize;
        const currentPartLength = Math.min(partSize, totalBytes - offset);
        const buffer = Buffer.alloc(currentPartLength);
        await fd.read(buffer, 0, currentPartLength, offset);
        const partSha1 = crypto.createHash('sha1').update(buffer).digest('hex');

        // Get part upload URL
        const partUrlRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_upload_part_url`, {
          method: 'POST',
          headers: {
            Authorization: auth.authorizationToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ fileId })
        });

        if (!partUrlRes.ok) {
          throw new Error(`Failed to get B2 upload part URL: ${await partUrlRes.text()}`);
        }

        const { uploadUrl, authorizationToken: partToken } = (await partUrlRes.json()) as {
          uploadUrl: string;
          authorizationToken: string;
        };

        const uploadPartRes = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            Authorization: partToken,
            'X-Bz-Part-Number': String(partNumber),
            'Content-Length': String(currentPartLength),
            'X-Bz-Content-Sha1': partSha1
          },
          body: buffer
        });

        if (!uploadPartRes.ok) {
          throw new Error(`Failed to upload B2 part ${partNumber}: ${await uploadPartRes.text()}`);
        }

        partSha1List.push(partSha1);
        bytesUploaded += currentPartLength;

        const elapsedSec = (Date.now() - startTime) / 1000;
        const speed = elapsedSec > 0 ? bytesUploaded / elapsedSec : 0;
        onProgress?.({
          bytesUploaded,
          totalBytes,
          percent: Math.round((bytesUploaded / totalBytes) * 100),
          currentFile: path.basename(filePath),
          speedBytesPerSec: speed,
          partNumber,
          totalParts
        });
      }
    } finally {
      await fd.close();
    }

    // 2. Finish large file
    const finishRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_finish_large_file`, {
      method: 'POST',
      headers: {
        Authorization: auth.authorizationToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fileId,
        partSha1Array: partSha1List
      })
    });

    if (!finishRes.ok) {
      throw new Error(`Failed to finish B2 large file: ${await finishRes.text()}`);
    }

    return (await finishRes.json()) as any;
  }

  /**
   * Resumable Download with HTTP Range requests
   */
  async downloadFile(
    b2FilePath: string,
    localDestinationPath: string,
    onProgress?: (downloadedBytes: number, totalBytes: number) => void
  ): Promise<void> {
    const auth = await this.authorize();
    const encodedPath = encodeURIComponent(b2FilePath.replace(/\\/g, '/')).replace(/%2F/g, '/');
    const downloadUrl = `${auth.downloadUrl}/file/${this.bucketName}/${encodedPath}`;

    await fsp.mkdir(path.dirname(localDestinationPath), { recursive: true });

    let existingBytes = 0;
    if (fs.existsSync(localDestinationPath)) {
      const stats = await fsp.stat(localDestinationPath);
      existingBytes = stats.size;
    }

    const headers: Record<string, string> = {
      Authorization: auth.authorizationToken
    };
    if (existingBytes > 0) {
      headers['Range'] = `bytes=${existingBytes}-`;
    }

    const res = await fetch(downloadUrl, { headers });
    if (!res.ok && res.status !== 206) {
      throw new Error(`B2 download failed (${res.status}): ${await res.text()}`);
    }

    const totalBytes = existingBytes + Number(res.headers.get('content-length') || 0);
    const fileStream = fs.createWriteStream(localDestinationPath, { flags: existingBytes > 0 ? 'a' : 'w' });

    if (!res.body) throw new Error('Response body empty');

    const reader = (res.body as any).getReader();
    let downloaded = existingBytes;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fileStream.write(Buffer.from(value));
      downloaded += value.length;
      onProgress?.(downloaded, totalBytes);
    }

    fileStream.end();
  }
}

export const b2Client = new BackblazeB2Client();
