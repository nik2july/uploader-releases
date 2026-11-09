import { Dropbox } from 'dropbox';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { whatsappService } from './whatsappNotifier';
import { computeProjectRootFolderName, formatEventSubfolderName } from '../shared/naming';
import { autoDetectTranscodedFolder } from './folderScanner';
import type {
  DropboxDeliverableConfig,
  DropboxUploadStatus,
  DropboxRawClipsConfig,
  DropboxFolderUploadStatus
} from '../shared/contracts';

const VIDEO_CLIP_EXTS = new Set(['mp4', 'mov', 'mxf', 'm4v', 'avi', 'mkv']);
// Dropbox filesUpload API supports files up to 150 MB. We use 140 MB for safety threshold.
const DIRECT_UPLOAD_MAX = 140 * 1024 * 1024;
const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB chunks (multiple of 4MB required by Dropbox)

export function extractDropboxError(err: any): {
  message: string;
  isScopeError: boolean;
  missingScopes: string[];
  actionableAdvice?: string;
} {
  if (!err) {
    return { message: 'Unknown error', isScopeError: false, missingScopes: [] };
  }

  let raw = '';
  const requiredScope = err?.error?.error?.required_scope || err?.error?.required_scope;

  if (err?.error?.user_message?.text) {
    raw = err.error.user_message.text;
  } else if (requiredScope || err?.error?.error_summary?.includes('missing_scope') || err?.error?.['.tag'] === 'missing_scope') {
    const scopeName = requiredScope || 'files.content.write';
    raw = `Your current token was created before permissions were updated and is missing scope "${scopeName}". Please generate a fresh token from the Settings tab in Dropbox Console.`;
  } else if (typeof err?.error === 'string') {
    raw = err.error;
  } else if (err?.error?.error_summary) {
    raw = err.error.error_summary;
  } else if (err?.message) {
    raw = err.message;
  }

  const isScopeError =
    raw.includes('not have the required scope') ||
    raw.includes('scope') ||
    raw.includes('files.content.write') ||
    raw.includes('files.metadata.write') ||
    raw.includes('sharing.write') ||
    (err?.status === 400 && raw.includes('other'));

  if (isScopeError) {
    const missing: string[] = [];
    if (raw.includes('files.content.write') || !raw.includes('required scope')) {
      missing.push('files.content.write', 'files.metadata.write', 'sharing.write');
    }
    const advice =
      'Your Dropbox App is missing write permissions. In the Dropbox App Console (Permissions tab), check: files.content.write, files.metadata.write, and sharing.write. Click "Submit", then generate a new Access Token in the Settings tab.';
    return {
      message: `Permission Error: ${raw || 'Missing files.content.write scope'}`,
      isScopeError: true,
      missingScopes: missing.length > 0 ? missing : ['files.content.write'],
      actionableAdvice: advice
    };
  }

  return {
    message: raw || 'Dropbox request failed',
    isScopeError: false,
    missingScopes: []
  };
}

async function findVideoFilesInFolder(
  dir: string
): Promise<Array<{ fullPath: string; relativePath: string; size: number }>> {
  const results: Array<{ fullPath: string; relativePath: string; size: number }> = [];
  async function scan(currentDir: string, rel: string) {
    let entries;
    try {
      entries = await fsp.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith('.')) continue;
      const full = path.join(currentDir, ent.name);
      const subRel = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        await scan(full, subRel);
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).slice(1).toLowerCase();
        if (VIDEO_CLIP_EXTS.has(ext)) {
          try {
            const st = await fsp.stat(full);
            results.push({ fullPath: full, relativePath: subRel, size: st.size });
          } catch {}
        }
      }
    }
  }
  await scan(dir, '');
  return results;
}

function safeSegment(value: string, fallback: string): string {
  const cleaned = value.trim().replace(/[\/\\\u0000-\u001f\u007f]/g, '-');
  return cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned : fallback;
}

export interface DropboxConfig {
  appKey?: string;
  appSecret?: string;
  refreshToken?: string;
  accessToken?: string;
}

export class DropboxDeliverablesManager {
  private dbx: Dropbox | null = null;
  private configPath: string = '';
  private config: DropboxConfig = {};
  private status: DropboxUploadStatus = {
    state: 'idle',
    percent: 0,
    bytesUploaded: 0,
    totalBytes: 0
  };

  private rawClipsPaused = false;
  private rawClipsCancelled = false;
  private pauseResolvers: Array<() => void> = [];

  private rawClipsStatus: DropboxFolderUploadStatus = {
    state: 'idle',
    currentFileIndex: 0,
    totalFiles: 0,
    currentFileName: '',
    currentFilePercent: 0,
    overallPercent: 0,
    bytesUploaded: 0,
    totalBytes: 0,
    logs: []
  };

  async init(storageDir: string): Promise<void> {
    this.configPath = path.join(storageDir, 'dropbox_config.json');
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = await fsp.readFile(this.configPath, 'utf8');
        this.config = JSON.parse(raw);
        this.configure(this.config);
      }
    } catch (err: any) {
      console.warn('[DropboxManager] Could not load saved config:', err?.message);
    }
  }

  getConfig(): DropboxConfig {
    return { ...this.config };
  }

  async saveConfig(config: DropboxConfig): Promise<{ ok: boolean; email?: string; error?: string; missingScopes?: string[] }> {
    this.config = { ...this.config, ...config };
    this.configure(this.config);
    if (this.configPath) {
      try {
        await fsp.mkdir(path.dirname(this.configPath), { recursive: true });
        await fsp.writeFile(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
      } catch (err: any) {
        console.warn('[DropboxManager] Could not persist config:', err?.message);
      }
    }
    return this.testConnection();
  }

  configure(config: DropboxConfig): void {
    if (config.refreshToken && config.appKey && config.appSecret) {
      this.dbx = new Dropbox({
        clientId: config.appKey,
        clientSecret: config.appSecret,
        refreshToken: config.refreshToken
      });
    } else if (config.accessToken || config.refreshToken) {
      this.dbx = new Dropbox({
        accessToken: config.accessToken || config.refreshToken
      });
    } else {
      this.dbx = null;
    }
  }

  isConfigured(): boolean {
    return Boolean(this.dbx);
  }

  getStatus(): DropboxUploadStatus {
    return { ...this.status };
  }

  async testConnection(): Promise<{ ok: boolean; email?: string; error?: string; missingScopes?: string[] }> {
    if (!this.dbx) return { ok: false, error: 'Dropbox is not configured yet.' };
    let email = '';
    try {
      const acc = await this.dbx.usersGetCurrentAccount();
      email = acc.result.email;
    } catch (err: any) {
      const parsed = extractDropboxError(err);
      return { ok: false, error: parsed.message, missingScopes: parsed.missingScopes };
    }

    // Proactively verify write permission so the user gets notified immediately if files.content.write is missing
    try {
      const testPath = '/.studio_token_verify.tmp';
      await this.dbx.filesUpload({
        path: testPath,
        contents: Buffer.from('baawaray_scope_check'),
        mode: { '.tag': 'overwrite' },
        mute: true
      });
      // Clean up test file immediately
      await this.dbx.filesDeleteV2({ path: testPath }).catch(() => {});
      return { ok: true, email };
    } catch (writeErr: any) {
      const parsed = extractDropboxError(writeErr);
      return {
        ok: false,
        email,
        error: parsed.message,
        missingScopes: parsed.missingScopes
      };
    }
  }

  async createDeliverableFolder(clientName: string, deliverableTitle: string): Promise<string> {
    const safeClient = safeSegment(clientName, 'Client');
    const safeTitle = safeSegment(deliverableTitle, 'Deliverables');
    const destFolder = `/Deliverables/${safeClient}/${safeTitle}`;

    if (this.dbx) {
      try {
        await this.dbx.filesCreateFolderV2({ path: destFolder, autorename: false });
      } catch (err: any) {
        // Path conflict is fine if folder already exists
        if (err?.error?.error?.['.tag'] !== 'path' || err?.error?.error?.path?.['.tag'] !== 'conflict') {
          console.warn('[Dropbox] Folder creation notice:', err?.message);
        }
      }
    }
    return destFolder;
  }

  // --- Upload and Share Deliverable ---
  async uploadAndShareDeliverable(
    config: DropboxDeliverableConfig,
    onProgress: (s: DropboxUploadStatus) => void
  ): Promise<{ shareUrl?: string; whatsappSent?: boolean; error?: string }> {
    if (!fs.existsSync(config.renderFilePath)) {
      const err = `File does not exist: ${config.renderFilePath}`;
      onProgress({ state: 'error', percent: 0, bytesUploaded: 0, totalBytes: 0, error: err });
      return { error: err };
    }

    const safeClient = safeSegment(config.clientName, 'Client');
    const safeTitle = safeSegment(config.deliverableTitle, 'Review');
    const fileName = safeSegment(path.basename(config.renderFilePath), 'video.mp4');
    const destPath = `/Deliverables/${safeClient}/${safeTitle}/${fileName}`;

    const stat = await fsp.stat(config.renderFilePath);
    const totalBytes = stat.size;

    onProgress({
      state: 'uploading',
      percent: 0,
      bytesUploaded: 0,
      totalBytes
    });

    let shareUrl = '';

    if (this.dbx) {
      try {
        if (totalBytes <= DIRECT_UPLOAD_MAX) {
          const contents = await fsp.readFile(config.renderFilePath);
          await this.dbx.filesUpload({
            path: destPath,
            contents,
            mode: { '.tag': 'overwrite' }
          });
          onProgress({ state: 'generating_link', percent: 100, bytesUploaded: totalBytes, totalBytes });
        } else {
          const fd = await fsp.open(config.renderFilePath, 'r');
          try {
            let offset = 0;
            const firstBuf = Buffer.alloc(CHUNK_SIZE);
            const { bytesRead: firstRead } = await fd.read(firstBuf, 0, CHUNK_SIZE, 0);
            const startRes = await this.dbx.filesUploadSessionStart({
              close: false,
              contents: firstBuf.subarray(0, firstRead)
            });
            const sessionId = startRes.result.session_id;
            offset += firstRead;

            onProgress({
              state: 'uploading',
              percent: Math.round((offset / totalBytes) * 100),
              bytesUploaded: offset,
              totalBytes
            });

            while (offset < totalBytes) {
              const rem = totalBytes - offset;
              const curChunk = Math.min(rem, CHUNK_SIZE);
              const buf = Buffer.alloc(curChunk);
              const { bytesRead } = await fd.read(buf, 0, curChunk, offset);

              if (offset + bytesRead >= totalBytes) {
                await this.dbx.filesUploadSessionFinish({
                  cursor: { session_id: sessionId, offset },
                  commit: { path: destPath, mode: { '.tag': 'overwrite' }, mute: true },
                  contents: buf.subarray(0, bytesRead)
                });
                offset += bytesRead;
                break;
              } else {
                await this.dbx.filesUploadSessionAppendV2({
                  cursor: { session_id: sessionId, offset },
                  close: false,
                  contents: buf.subarray(0, bytesRead)
                });
                offset += bytesRead;
                onProgress({
                  state: 'uploading',
                  percent: Math.round((offset / totalBytes) * 100),
                  bytesUploaded: offset,
                  totalBytes
                });
              }
            }
          } finally {
            await fd.close();
          }
        }

        onProgress({ state: 'generating_link', percent: 100, bytesUploaded: totalBytes, totalBytes });

        try {
          const linkRes = await this.dbx.sharingCreateSharedLinkWithSettings({ path: destPath });
          shareUrl = linkRes.result.url;
        } catch (linkErr: any) {
          const existing = await this.dbx.sharingListSharedLinks({ path: destPath }).catch(() => null);
          if (existing?.result?.links && existing.result.links.length > 0) {
            shareUrl = existing.result.links[0].url;
          }
        }
      } catch (err: any) {
        const parsed = extractDropboxError(err);
        onProgress({ state: 'error', percent: 0, bytesUploaded: 0, totalBytes, error: parsed.message });
        return { error: parsed.message };
      }
    } else {
      const errMsg = 'Studio Dropbox is not connected. Please open Settings (⚙) and connect your Dropbox token.';
      onProgress({ state: 'error', percent: 0, bytesUploaded: 0, totalBytes, error: errMsg });
      return { error: errMsg };
    }

    let whatsappSent = false;
    let whatsappMessageId = '';

    if (config.sendWhatsApp && config.clientPhone) {
      onProgress({
        state: 'sending_whatsapp',
        percent: 100,
        bytesUploaded: totalBytes,
        totalBytes,
        shareUrl
      });

      const waRes = await whatsappService.sendClientReviewLink({
        clientName: config.clientName,
        clientPhone: config.clientPhone,
        deliverableTitle: config.deliverableTitle,
        dropboxUrl: shareUrl,
        postProductionPhone: '+91 88945 62004'
      });

      whatsappSent = waRes.ok;
      whatsappMessageId = waRes.messageId || '';
    }

    const finalStatus: DropboxUploadStatus = {
      state: 'completed',
      percent: 100,
      bytesUploaded: totalBytes,
      totalBytes,
      shareUrl,
      whatsappSent,
      whatsappMessageId
    };
    onProgress(finalStatus);

    return { shareUrl, whatsappSent };
  }

  // --- Pause, Resume & Cancel Controls ---
  pauseRawClipsUpload(): void {
    if (this.rawClipsStatus.state === 'uploading' || this.rawClipsStatus.state === 'scanning') {
      this.rawClipsPaused = true;
      this.rawClipsStatus = {
        ...this.rawClipsStatus,
        state: 'paused',
        logs: [...this.rawClipsStatus.logs, '⏸ Upload paused by user.'].slice(-250)
      };
    }
  }

  resumeRawClipsUpload(): void {
    if (this.rawClipsPaused) {
      this.rawClipsPaused = false;
      while (this.pauseResolvers.length > 0) {
        const res = this.pauseResolvers.shift();
        if (res) res();
      }
      this.rawClipsStatus = {
        ...this.rawClipsStatus,
        state: 'uploading',
        logs: [...this.rawClipsStatus.logs, '▶ Upload resumed.'].slice(-250)
      };
    }
  }

  cancelRawClipsUpload(): void {
    this.rawClipsCancelled = true;
    this.rawClipsPaused = false;
    while (this.pauseResolvers.length > 0) {
      const res = this.pauseResolvers.shift();
      if (res) res();
    }
    this.rawClipsStatus = {
      ...this.rawClipsStatus,
      state: 'cancelled',
      logs: [...this.rawClipsStatus.logs, '⏹ Upload cancelled by user.'].slice(-250)
    };
  }

  private async waitIfPaused(): Promise<void> {
    while (this.rawClipsPaused && !this.rawClipsCancelled) {
      await new Promise<void>(resolve => {
        this.pauseResolvers.push(resolve);
      });
    }
  }

  getRawClipsStatus(): DropboxFolderUploadStatus {
    return { ...this.rawClipsStatus, logs: [...this.rawClipsStatus.logs] };
  }

  // --- Upload Raw Clips Folder ---
  async uploadRawClipsFolder(
    config: DropboxRawClipsConfig,
    onProgress: (s: DropboxFolderUploadStatus) => void
  ): Promise<{ ok: boolean; shareUrl?: string; totalUploaded: number; whatsappSent?: boolean; error?: string }> {
    this.rawClipsCancelled = false;
    this.rawClipsPaused = false;
    this.pauseResolvers = [];

    const emit = (patch: Partial<DropboxFolderUploadStatus>, logLine?: string) => {
      const logs = logLine ? [...this.rawClipsStatus.logs, logLine].slice(-250) : this.rawClipsStatus.logs;
      this.rawClipsStatus = { ...this.rawClipsStatus, ...patch, logs };
      onProgress(this.getRawClipsStatus());
    };

    emit({ state: 'scanning', logs: [] }, `🔍 Scanning for transcoded clips: ${config.clientName || ''}`);

    let folderToScan = config.folderPath;
    let clips: { fullPath: string; relativePath: string; size: number }[] = [];

    if (fs.existsSync(folderToScan)) {
      clips = await findVideoFilesInFolder(folderToScan);
    }

    if (clips.length === 0) {
      try {
        const detected = await autoDetectTranscodedFolder(config.folderPath, config.clientName);
        if (detected.found && detected.folderPath && fs.existsSync(detected.folderPath)) {
          folderToScan = detected.folderPath;
          clips = await findVideoFilesInFolder(folderToScan);
          if (clips.length > 0) {
            emit({}, `⚡ Auto-resolved actual transcoded clips path: ${folderToScan}`);
          }
        }
      } catch {}
    }

    if (clips.length === 0) {
      const err = fs.existsSync(config.folderPath)
        ? `No video clips found in ${config.folderPath}`
        : `Folder does not exist and no transcoded clips found: ${config.folderPath}`;
      emit({ state: 'error', error: err }, `⚠ ${err}`);
      return { ok: false, totalUploaded: 0, error: err };
    }

    const totalBytes = clips.reduce((acc, c) => acc + c.size, 0);

    const clientFolderName = computeProjectRootFolderName(
      config.clientName,
      undefined,
      config.eventDate,
      config.eventName
    );
    const safeClient = safeSegment(clientFolderName, 'Client');
    const folderLabel = config.deliverableTitle ? safeSegment(config.deliverableTitle, 'Raw Clips') : 'Raw Clips';

    let resolvedEventName = config.eventName || 'Wedding';
    const eventInPathMatch = folderToScan.match(/(\d{4}\.\d{2}\.\d{2}\s*-\s*[^/]+)/);
    if (eventInPathMatch) {
      resolvedEventName = eventInPathMatch[1];
    }
    const eventSubName = formatEventSubfolderName(resolvedEventName, config.eventDate, config.clientName);
    const safeEventSub = eventSubName ? safeSegment(eventSubName, '') : '';

    const destFolder = safeEventSub
      ? `/Deliverables/${safeClient}/${safeEventSub}/${folderLabel}`
      : `/Deliverables/${safeClient}/${folderLabel}`;

    emit(
      {
        state: 'uploading',
        totalFiles: clips.length,
        currentFileIndex: 0,
        totalBytes,
        bytesUploaded: 0,
        overallPercent: 0
      },
      `📁 Found ${clips.length} transcoded clips (${(totalBytes / (1024 ** 3)).toFixed(1)} GB). Preparing Dropbox folder: ${destFolder}`
    );

    let uploadedBytesTotal = 0;
    let completedClipsCount = 0;
    let shareUrl = '';
    let lastTime = Date.now();

    if (this.dbx) {
      try {
        // Ensure remote folder exists
        try {
          await this.dbx.filesCreateFolderV2({ path: destFolder, autorename: false });
        } catch (e: any) {
          // Path conflict is normal if folder exists
        }

        for (let i = 0; i < clips.length; i++) {
          await this.waitIfPaused();
          if (this.rawClipsCancelled) {
            emit({ state: 'cancelled' }, '⚠ Dropbox raw clips upload cancelled by user.');
            return { ok: false, totalUploaded: completedClipsCount, error: 'Cancelled by user' };
          }

          const clip = clips[i];
          const fileName = safeSegment(path.basename(clip.fullPath), `clip_${i + 1}.mp4`);
          const relPathClean = clip.relativePath
            ? clip.relativePath.split('/').map(s => safeSegment(s, 'clip')).join('/')
            : fileName;
          const destClipPath = `${destFolder}/${relPathClean}`;
          const fileSize = clip.size;

          emit({
            currentFileIndex: i + 1,
            currentFileName: fileName,
            currentFilePercent: 0
          }, `⬆ Uploading [${i + 1}/${clips.length}]: ${fileName} (${(fileSize / (1024 * 1024)).toFixed(1)} MB)`);

          // Direct upload for files up to DIRECT_UPLOAD_MAX (140MB)
          if (fileSize <= DIRECT_UPLOAD_MAX) {
            await this.waitIfPaused();
            if (this.rawClipsCancelled) break;

            const contents = await fsp.readFile(clip.fullPath);
            await this.dbx.filesUpload({
              path: destClipPath,
              contents,
              mode: { '.tag': 'overwrite' }
            });
            uploadedBytesTotal += fileSize;
            completedClipsCount++;

            const now = Date.now();
            const elapsedMs = Math.max(1, now - lastTime);
            const speed = `${((fileSize / (elapsedMs / 1000)) / (1024 * 1024)).toFixed(1)} MB/s`;
            lastTime = now;

            const pct = Math.round((uploadedBytesTotal / totalBytes) * 100);
            emit({
              bytesUploaded: uploadedBytesTotal,
              overallPercent: Math.min(pct, 99),
              currentFilePercent: 100,
              speed
            }, `✓ [${i + 1}/${clips.length}] Uploaded: ${fileName}`);
          } else {
            // Chunked session upload for large files (> 140MB)
            const fd = await fsp.open(clip.fullPath, 'r');
            try {
              let offset = 0;
              const firstBuf = Buffer.alloc(CHUNK_SIZE);
              const { bytesRead: firstRead } = await fd.read(firstBuf, 0, CHUNK_SIZE, 0);

              await this.waitIfPaused();
              if (this.rawClipsCancelled) break;

              const startRes = await this.dbx.filesUploadSessionStart({
                close: false,
                contents: firstBuf.subarray(0, firstRead)
              });
              const sessionId = startRes.result.session_id;
              offset += firstRead;
              uploadedBytesTotal += firstRead;

              let filePct = Math.round((offset / fileSize) * 100);
              let totalPct = Math.round((uploadedBytesTotal / totalBytes) * 100);
              emit({
                bytesUploaded: uploadedBytesTotal,
                overallPercent: Math.min(totalPct, 99),
                currentFilePercent: filePct
              });

              while (offset < fileSize) {
                await this.waitIfPaused();
                if (this.rawClipsCancelled) break;

                const rem = fileSize - offset;
                const curChunk = Math.min(rem, CHUNK_SIZE);
                const buf = Buffer.alloc(curChunk);
                const { bytesRead } = await fd.read(buf, 0, curChunk, offset);

                if (offset + bytesRead >= fileSize) {
                  await this.dbx.filesUploadSessionFinish({
                    cursor: { session_id: sessionId, offset },
                    commit: { path: destClipPath, mode: { '.tag': 'overwrite' }, mute: true },
                    contents: buf.subarray(0, bytesRead)
                  });
                  offset += bytesRead;
                  uploadedBytesTotal += bytesRead;
                  completedClipsCount++;
                  break;
                } else {
                  await this.dbx.filesUploadSessionAppendV2({
                    cursor: { session_id: sessionId, offset },
                    close: false,
                    contents: buf.subarray(0, bytesRead)
                  });
                  offset += bytesRead;
                  uploadedBytesTotal += bytesRead;
                  filePct = Math.round((offset / fileSize) * 100);
                  totalPct = Math.round((uploadedBytesTotal / totalBytes) * 100);
                  emit({
                    bytesUploaded: uploadedBytesTotal,
                    overallPercent: Math.min(totalPct, 99),
                    currentFilePercent: filePct
                  });
                }
              }

              if (this.rawClipsCancelled) {
                emit({ state: 'cancelled' }, '⚠ Dropbox raw clips upload cancelled by user.');
                return { ok: false, totalUploaded: completedClipsCount, error: 'Cancelled by user' };
              }

              emit({}, `✓ [${i + 1}/${clips.length}] Uploaded: ${fileName}`);
            } finally {
              await fd.close();
            }
          }
        }

        if (this.rawClipsCancelled) {
          emit({ state: 'cancelled' }, '⚠ Dropbox raw clips upload cancelled by user.');
          return { ok: false, totalUploaded: completedClipsCount, error: 'Cancelled by user' };
        }

        // Generate shared link for the entire folder
        emit({ state: 'generating_link', currentFilePercent: 100, overallPercent: 100 }, '🔗 Generating Dropbox shared folder link…');

        try {
          const linkRes = await this.dbx.sharingCreateSharedLinkWithSettings({ path: destFolder });
          shareUrl = linkRes.result.url;
        } catch (linkErr: any) {
          const existing = await this.dbx.sharingListSharedLinks({ path: destFolder }).catch(() => null);
          if (existing?.result?.links && existing.result.links.length > 0) {
            shareUrl = existing.result.links[0].url;
          } else {
            shareUrl = `https://www.dropbox.com/home${encodeURI(destFolder)}`;
          }
        }
      } catch (err: any) {
        const parsed = extractDropboxError(err);
        const adviceMsg = parsed.actionableAdvice ? `\n💡 Fix: ${parsed.actionableAdvice}` : '';
        emit(
          {
            state: 'error',
            error: parsed.message,
            missingScopes: parsed.missingScopes,
            actionableAdvice: parsed.actionableAdvice
          },
          `⚠ Dropbox error: ${parsed.message}${adviceMsg}`
        );
        return { ok: false, totalUploaded: completedClipsCount, error: parsed.message };
      }
    } else {
      const errMsg = 'Studio Dropbox is not connected. Please open Settings (⚙) and connect your Dropbox token.';
      emit({ state: 'error', error: errMsg }, `⚠ ${errMsg}`);
      return { ok: false, totalUploaded: 0, error: errMsg };
    }

    // Optional WhatsApp dispatch
    let whatsappSent = false;
    let whatsappMessageId = '';
    if (config.sendWhatsApp && config.clientPhone) {
      emit({ state: 'sending_whatsapp', shareUrl }, '📱 Sending WhatsApp notification with Dropbox review link to client…');
      const waRes = await whatsappService.sendClientRawClipsLink({
        clientName: config.clientName,
        clientPhone: config.clientPhone,
        clipCount: completedClipsCount,
        totalGb: (totalBytes / (1024 ** 3)).toFixed(1),
        dropboxUrl: shareUrl,
        postProductionPhone: '+91 88945 62004'
      });
      whatsappSent = waRes.ok;
      whatsappMessageId = waRes.messageId || '';
      emit({}, whatsappSent ? `✓ WhatsApp dispatched to ${config.clientPhone}` : `⚠ WhatsApp dispatch failed: ${waRes.error || 'Check credentials'}`);
    }

    emit({
      state: 'completed',
      overallPercent: 100,
      currentFilePercent: 100,
      bytesUploaded: totalBytes,
      totalBytes,
      shareUrl,
      whatsappSent,
      whatsappMessageId
    }, `🎉 All ${completedClipsCount} transcoded raw clips uploaded successfully to Dropbox!`);

    return {
      ok: true,
      shareUrl,
      totalUploaded: completedClipsCount,
      whatsappSent
    };
  }
}

export const dropboxManager = new DropboxDeliverablesManager();
