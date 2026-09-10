import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';

export interface B2Credentials {
  keyId: string;
  applicationKey: string;
  bucketName: string;
  bucketId?: string;
  endpoint?: string;
  region?: string;
}

export interface B2AuthData {
  apiUrl: string;
  downloadUrl: string;
  authorizationToken: string;
  accountId: string;
  allowed: {
    capabilities: string[];
    bucketId?: string;
    bucketName?: string;
  };
}

export interface B2FileInfo {
  fileId: string;
  fileName: string;
  contentLength: number;
  contentSha1: string;
  uploadTimestamp: number;
}

export class B2Client {
  private authData?: B2AuthData;
  private bucketIdCache?: string;

  constructor(private creds?: B2Credentials) {}

  setCredentials(creds: B2Credentials): void {
    this.creds = creds;
    this.authData = undefined;
    this.bucketIdCache = creds.bucketId;
  }

  get credentials(): B2Credentials | undefined {
    return this.creds;
  }

  isConnected(): boolean {
    return Boolean(this.creds?.keyId && this.creds?.applicationKey && this.creds?.bucketName);
  }

  /**
   * Authorize with Backblaze B2 using Key ID and Application Key.
   */
  async authorize(force = false): Promise<B2AuthData> {
    if (this.authData && !force) return this.authData;
    if (!this.creds?.keyId || !this.creds?.applicationKey) {
      throw new Error('Backblaze B2 Key ID and Application Key are required.');
    }

    const authString = Buffer.from(`${this.creds.keyId.trim()}:${this.creds.applicationKey.trim()}`).toString('base64');
    const response = await fetch('https://api.backblazeb2.com/b2api/v3/b2_authorize_account', {
      headers: {
        Authorization: `Basic ${authString}`
      }
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.message || `B2 Authorization failed with status ${response.status}`);
    }

    const raw = (await response.json()) as any;
    const storageApi = raw.apiInfo?.storageApi;
    const apiUrl = storageApi?.apiUrl || raw.apiUrl || 'https://api.backblazeb2.com';
    const downloadUrl = storageApi?.downloadUrl || raw.downloadUrl || 'https://f000.backblazeb2.com';
    const authorizationToken = raw.authorizationToken;
    const accountId = raw.accountId;
    const allowed = raw.allowed || storageApi?.allowed || { capabilities: [] };

    const data: B2AuthData = {
      apiUrl,
      downloadUrl,
      authorizationToken,
      accountId,
      allowed
    };
    this.authData = data;
    return data;
  }

  /**
   * Resolves the B2 Bucket ID for the configured bucketName.
   */
  async getBucketId(): Promise<string> {
    if (this.bucketIdCache) return this.bucketIdCache;
    if (this.creds?.bucketId) {
      this.bucketIdCache = this.creds.bucketId;
      return this.creds.bucketId;
    }

    const auth = await this.authorize();

    // If key is scoped to a specific bucket, Backblaze returns bucketId and bucketName in allowed
    if (auth.allowed?.bucketId) {
      this.bucketIdCache = auth.allowed.bucketId;
      if (this.creds && !this.creds.bucketName && auth.allowed.bucketName) {
        this.creds.bucketName = auth.allowed.bucketName;
      }
      return auth.allowed.bucketId;
    }

    const bucketName = this.creds?.bucketName?.trim();

    const res = await fetch(`${auth.apiUrl}/b2api/v3/b2_list_buckets`, {
      method: 'POST',
      headers: {
        Authorization: auth.authorizationToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        accountId: auth.accountId
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Could not list B2 buckets: HTTP ${res.status}`);
    }

    const data = (await res.json()) as { buckets: { bucketId: string; bucketName: string }[] };
    const buckets = data.buckets || [];

    if (buckets.length === 0) {
      throw new Error('No B2 buckets found in your Backblaze account. Please create a bucket first.');
    }

    // Try finding exact match
    let match = bucketName ? buckets.find(b => b.bucketName.toLowerCase() === bucketName.toLowerCase()) : undefined;

    // If only 1 bucket exists in the account, automatically select it (even if user entered key name)
    if (!match && buckets.length === 1) {
      match = buckets[0];
      if (this.creds) {
        this.creds.bucketName = match.bucketName;
      }
    }

    if (!match) {
      const available = buckets.map(b => `"${b.bucketName}"`).join(', ');
      throw new Error(
        `Bucket "${bucketName || ''}" not found in your Backblaze account. Available buckets: ${available}. Please enter one of these bucket names.`
      );
    }

    this.bucketIdCache = match.bucketId;
    if (this.creds) {
      this.creds.bucketName = match.bucketName;
    }
    return match.bucketId;
  }

  /**
   * Generates a download authorization token valid for the given prefix for up to 7 days.
   */
  async getDownloadAuthorization(prefix: string, validDurationSeconds = 604800): Promise<string> {
    const auth = await this.authorize();
    const bucketId = await this.getBucketId();

    const res = await fetch(`${auth.apiUrl}/b2api/v3/b2_get_download_authorization`, {
      method: 'POST',
      headers: {
        Authorization: auth.authorizationToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        bucketId,
        fileNamePrefix: prefix,
        validDurationInSeconds: Math.min(validDurationSeconds, 604800)
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to generate B2 download authorization.');
    }

    const data = (await res.json()) as { authorizationToken: string };
    return data.authorizationToken;
  }

  /**
   * Constructs a direct download URL for a file in the configured bucket.
   */
  async getDownloadUrl(fileName: string, withToken = true): Promise<string> {
    const auth = await this.authorize();
    const bucketName = this.creds?.bucketName;
    const base = `${auth.downloadUrl}/file/${encodeURIComponent(bucketName || '')}/${fileName.split('/').map(encodeURIComponent).join('/')}`;
    if (!withToken) return base;

    const token = await this.getDownloadAuthorization(fileName);
    return `${base}?Authorization=${encodeURIComponent(token)}`;
  }

  /**
   * Lists all files under a given prefix in the configured bucket.
   */
  async listFiles(prefix = ''): Promise<B2FileInfo[]> {
    const auth = await this.authorize();
    const bucketId = await this.getBucketId();

    const files: B2FileInfo[] = [];
    let startFileName: string | undefined;

    do {
      const body: Record<string, unknown> = {
        bucketId,
        maxFileCount: 1000,
        prefix
      };
      if (startFileName) body.startFileName = startFileName;

      const res = await fetch(`${auth.apiUrl}/b2api/v3/b2_list_file_names`, {
        method: 'POST',
        headers: {
          Authorization: auth.authorizationToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to list B2 files.');
      }

      const data = (await res.json()) as { files: B2FileInfo[]; nextFileName?: string };
      if (data.files) files.push(...data.files);
      startFileName = data.nextFileName;
    } while (startFileName);

    return files;
  }

  /**
   * Upload a single file to B2. Uses standard single-upload for <= 50 MB,
   * and multi-part upload for files > 50 MB.
   */
  async uploadFile(
    localPath: string,
    b2FileName: string,
    signal?: AbortSignal,
    onProgress?: (uploadedBytes: number, totalBytes: number) => void
  ): Promise<B2FileInfo> {
    const stat = await fs.stat(localPath);
    const fileSize = stat.size;

    if (fileSize > 50 * 1024 * 1024) {
      return await this.uploadLargeFile(localPath, b2FileName, fileSize, signal, onProgress);
    }

    const auth = await this.authorize();
    const bucketId = await this.getBucketId();

    // Get upload URL
    const uploadUrlRes = await fetch(`${auth.apiUrl}/b2api/v3/b2_get_upload_url`, {
      method: 'POST',
      headers: {
        Authorization: auth.authorizationToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ bucketId })
    });

    if (!uploadUrlRes.ok) {
      throw new Error('Could not obtain B2 upload URL.');
    }

    const { uploadUrl, authorizationToken: uploadToken } = (await uploadUrlRes.json()) as {
      uploadUrl: string;
      authorizationToken: string;
    };

    // Read buffer and calculate SHA1
    const fileBuffer = await fs.readFile(localPath);
    const sha1 = createHash('sha1').update(fileBuffer).digest('hex');

    signal?.throwIfAborted();

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: uploadToken,
        'X-Bz-File-Name': encodeURIComponent(b2FileName),
        'Content-Type': 'b2/x-auto',
        'Content-Length': String(fileSize),
        'X-Bz-Content-Sha1': sha1
      },
      body: fileBuffer,
      signal
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.json().catch(() => ({}));
      throw new Error(err.message || `B2 upload failed (${uploadRes.status})`);
    }

    onProgress?.(fileSize, fileSize);
    return (await uploadRes.json()) as B2FileInfo;
  }

  /**
   * Multi-part upload for large raw video files (> 50 MB) with 10 MB chunks.
   */
  private async uploadLargeFile(
    localPath: string,
    b2FileName: string,
    fileSize: number,
    signal?: AbortSignal,
    onProgress?: (uploadedBytes: number, totalBytes: number) => void
  ): Promise<B2FileInfo> {
    const auth = await this.authorize();
    const bucketId = await this.getBucketId();

    // Start large file
    const startRes = await fetch(`${auth.apiUrl}/b2api/v3/b2_start_large_file`, {
      method: 'POST',
      headers: {
        Authorization: auth.authorizationToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        bucketId,
        fileName: b2FileName,
        contentType: 'b2/x-auto'
      })
    });

    if (!startRes.ok) {
      const err = await startRes.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to initialize large file upload in B2.');
    }

    const { fileId } = (await startRes.json()) as { fileId: string };

    const PART_SIZE = 10 * 1024 * 1024; // 10 MB per part (B2 minimum is 5 MB)
    const partCount = Math.ceil(fileSize / PART_SIZE);
    const partSha1Array: string[] = [];
    let uploadedBytes = 0;

    const fileHandle = await fs.open(localPath, 'r');

    try {
      for (let partNumber = 1; partNumber <= partCount; partNumber++) {
        signal?.throwIfAborted();

        // Get upload part URL
        const partUrlRes = await fetch(`${auth.apiUrl}/b2api/v3/b2_get_upload_part_url`, {
          method: 'POST',
          headers: {
            Authorization: auth.authorizationToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ fileId })
        });

        if (!partUrlRes.ok) {
          throw new Error(`Failed to obtain B2 part URL for part ${partNumber}`);
        }

        const { uploadUrl, authorizationToken: partToken } = (await partUrlRes.json()) as {
          uploadUrl: string;
          authorizationToken: string;
        };

        const offset = (partNumber - 1) * PART_SIZE;
        const currentPartSize = Math.min(PART_SIZE, fileSize - offset);
        const buffer = Buffer.alloc(currentPartSize);
        await fileHandle.read(buffer, 0, currentPartSize, offset);

        const partSha1 = createHash('sha1').update(buffer).digest('hex');
        partSha1Array.push(partSha1);

        const partRes = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            Authorization: partToken,
            'X-Bz-Part-Number': String(partNumber),
            'Content-Length': String(currentPartSize),
            'X-Bz-Content-Sha1': partSha1
          },
          body: buffer,
          signal
        });

        if (!partRes.ok) {
          throw new Error(`Failed to upload B2 part ${partNumber} (${partRes.status})`);
        }

        uploadedBytes += currentPartSize;
        onProgress?.(uploadedBytes, fileSize);
      }
    } finally {
      await fileHandle.close();
    }

    // Finish large file
    const finishRes = await fetch(`${auth.apiUrl}/b2api/v3/b2_finish_large_file`, {
      method: 'POST',
      headers: {
        Authorization: auth.authorizationToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fileId,
        partSha1Array
      })
    });

    if (!finishRes.ok) {
      const err = await finishRes.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to finalize large file upload in B2.');
    }

    return (await finishRes.json()) as B2FileInfo;
  }

  /**
   * Download a file from B2 directly to local destination path with progress.
   */
  async downloadFile(
    b2FileName: string,
    destPath: string,
    signal?: AbortSignal,
    onProgress?: (downloadedBytes: number, totalBytes: number) => void
  ): Promise<number> {
    const auth = await this.authorize();
    const bucketName = this.creds?.bucketName;
    const downloadUrl = `${auth.downloadUrl}/file/${encodeURIComponent(bucketName || '')}/${b2FileName.split('/').map(encodeURIComponent).join('/')}`;

    const res = await fetch(downloadUrl, {
      headers: {
        Authorization: auth.authorizationToken
      },
      signal
    });

    if (!res.ok) {
      throw new Error(`Failed to download B2 file "${b2FileName}" (status ${res.status})`);
    }

    const totalBytes = parseInt(res.headers.get('content-length') || '0', 10);
    let downloadedBytes = 0;

    await fs.mkdir(path.dirname(destPath), { recursive: true });
    const fileStream = createWriteStream(destPath);

    if (!res.body) throw new Error('Response body is null.');

    // @ts-ignore Node stream pipeline
    for await (const chunk of res.body) {
      signal?.throwIfAborted();
      fileStream.write(chunk);
      downloadedBytes += chunk.length;
      onProgress?.(downloadedBytes, totalBytes);
    }

    await new Promise<void>((resolve, reject) => {
      fileStream.end(() => resolve());
      fileStream.on('error', reject);
    });

    return downloadedBytes;
  }

  /**
   * Delete all file versions matching a given prefix (for 30-day archival).
   */
  async deletePrefix(prefix: string): Promise<number> {
    const auth = await this.authorize();
    const bucketId = await this.getBucketId();
    let deletedCount = 0;

    let nextFileName: string | undefined;
    let nextFileId: string | undefined;

    do {
      const body: Record<string, unknown> = {
        bucketId,
        maxFileCount: 1000,
        prefix
      };
      if (nextFileName) body.startFileName = nextFileName;
      if (nextFileId) body.startFileId = nextFileId;

      const res = await fetch(`${auth.apiUrl}/b2api/v3/b2_list_file_versions`, {
        method: 'POST',
        headers: {
          Authorization: auth.authorizationToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) break;
      const data = (await res.json()) as {
        files?: { fileName: string; fileId: string }[];
        nextFileName?: string;
        nextFileId?: string;
      };

      if (data.files && data.files.length > 0) {
        for (const file of data.files) {
          if (file.fileName.startsWith(prefix)) {
            await fetch(`${auth.apiUrl}/b2api/v3/b2_delete_file_version`, {
              method: 'POST',
              headers: {
                Authorization: auth.authorizationToken,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                fileName: file.fileName,
                fileId: file.fileId
              })
            });
            deletedCount++;
          }
        }
      }

      nextFileName = data.nextFileName;
      nextFileId = data.nextFileId;
    } while (nextFileName);

    return deletedCount;
  }
}
