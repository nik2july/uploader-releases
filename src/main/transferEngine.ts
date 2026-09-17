import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { ManifestFile, Transfer, UploadDestination } from '../shared/contracts';
import { DriveClient, DriveError } from './drive';
import type { B2Client } from './b2Client';
import { b2ObjectName } from './b2Paths';
import { TransferStore } from './store';

const CHUNK_SIZE = 8 * 1024 * 1024; // Drive requires multiples of 256 KiB.
export class TransferEngine {
  private owner = '';
  private busy = false;
  private active?: { id: string; controller: AbortController };
  private failures = new Map<string, number>();
  private timer: ReturnType<typeof setInterval>;
  constructor(
    readonly store: TransferStore,
    readonly drive: DriveClient,
    private account: () => string | undefined,
    private changed: () => void,
    private completed: (job: Transfer) => void = () => {},
    private b2?: B2Client
  ) {
    this.timer = setInterval(() => { void this.pump(); }, 5000); this.timer.unref();
  }
  setB2Client(b2: B2Client): void { this.b2 = b2; }
  /**
   * Which cloud the studio wants raw footage to land in. B2 stays the default so
   * an install that never picks one keeps behaving exactly as it did; choosing
   * Drive routes to Drive even while B2 credentials are still configured.
   */
  private destination: UploadDestination = 'b2';
  setDestination(destination: UploadDestination): void {
    const wanted: UploadDestination = destination === 'drive' ? 'drive' : 'b2';
    if (wanted === this.destination) return;
    this.destination = wanted;
    for (const job of this.store.all(this.owner)) {
      if (['queued', 'uploading', 'verifying', 'waiting_network', 'waiting_quota'].includes(job.status)) {
        const started = this.startedOn(job);
        if (!started || started !== wanted) {
          this.pause(job.id);
        }
      }
    }
    this.changed();
  }
  getDestination(): UploadDestination { return this.destination; }
  private isB2(): boolean { return this.destination === 'b2' && Boolean(this.b2 && this.b2.isConnected()); }
  /**
   * The cloud a transfer has already put bytes into, recorded on its first run.
   * A half-sent folder cannot change cloud: verified files are never sent again,
   * so finishing it elsewhere would leave each cloud holding part of it while
   * reconciliation — which counts files, not destinations — still called it done.
   */
  private startedOn(job: Transfer): UploadDestination | undefined {
    return job.driveAccount ? (job.driveAccount.startsWith('B2:') ? 'b2' : 'drive') : undefined;
  }
  private wrongCloud(job: Transfer): string | undefined {
    const started = this.startedOn(job);
    const now: UploadDestination = this.isB2() ? 'b2' : 'drive';
    if (!started || started === now) return undefined;
    const name = (where: UploadDestination): string => where === 'b2' ? 'Backblaze B2' : 'Google Drive';
    return `This folder already started uploading to ${name(started)}. Switch the destination back to ${name(started)} to finish it, or scan it again as a new transfer to send it to ${name(now)}.`;
  }
  setOwner(owner: string): void { this.owner = owner; }
  pause(id: string): void {
    const job = this.store.get(id);
    if (job.status === 'completed') return;
    this.store.patch(id, { status: 'paused', error: undefined });
    if (this.active?.id === id) this.active.controller.abort();
    this.changed();
  }
  pauseAll(): void {
    for (const job of this.store.all(this.owner)) if (['queued', 'uploading', 'verifying', 'waiting_network', 'waiting_quota'].includes(job.status)) this.pause(job.id);
  }
  shutdown(): void { this.pauseAll(); this.owner = ''; clearInterval(this.timer); }
  autoResumeAll(): number {
    if (!this.owner) return 0;
    let count = 0;
    for (const job of this.store.all(this.owner)) {
      if (
        ['paused', 'queued', 'waiting_network', 'waiting_quota'].includes(job.status) &&
        job.target &&
        job.scan &&
        !job.scan.readErrors
      ) {
        try {
          const started = this.startedOn(job);
          // If this job was started on Drive, and Drive is connected, but engine is currently set to b2 without b2 connected:
          if (started === 'drive' && this.destination === 'b2' && (!this.b2 || !this.b2.isConnected()) && this.account()) {
            this.destination = 'drive';
          }
          if (!this.wrongCloud(job)) {
            this.failures.delete(job.id);
            this.store.patch(job.id, { status: 'queued', error: undefined, retryAt: undefined });
            count++;
          }
        } catch (err) {
          console.warn('[autoResumeAll] Skipping job:', job.id, err);
        }
      }
    }
    if (count > 0) {
      this.changed();
      void this.pump();
    }
    return count;
  }
  resume(id: string): void {
    const job = this.store.get(id);
    if (!job.target || !job.scan || job.scan.readErrors) throw new Error('Finish reviewing a complete scan before uploading.');
    if (!this.isB2() && !this.account()) throw new Error(this.destination === 'b2' && this.b2
      ? 'Connect Backblaze B2 in Uploader settings first, or switch the destination to Google Drive.'
      : 'Connect Google Drive in Uploader settings first.');
    const mismatch = this.wrongCloud(job);
    if (mismatch) throw new Error(mismatch);
    if (!this.isB2() && job.driveAccount && job.driveAccount !== this.account()) throw new Error('Reconnect the original Drive account for this transfer.');
    if (job.status === 'completed') return;
    this.failures.delete(id);
    this.store.patch(id, { status: 'queued', error: undefined, retryAt: undefined }); this.changed(); void this.pump();
  }
  async pump(): Promise<void> {
    if (this.busy || !this.owner || (!this.isB2() && !this.account())) return;
    const job = this.store.all(this.owner).reverse().find(j => j.status === 'queued'
      || (['waiting_network', 'waiting_quota'].includes(j.status) && (j.retryAt || 0) <= Date.now()));
    if (!job) return;
    this.busy = true;
    const controller = new AbortController(); this.active = { id: job.id, controller };
    try {
      const mismatch = this.wrongCloud(job);
      if (mismatch) throw new Error(mismatch);
      if (!this.isB2() && job.driveAccount && job.driveAccount !== this.account()) throw new Error('This transfer belongs to a different Google Drive account.');
      const activeAccount = this.isB2() ? `B2: ${this.b2?.credentials?.bucketName || 'active'}` : this.account();
      this.store.patch(job.id, { status: 'uploading', driveAccount: activeAccount, error: undefined, retryAt: undefined }); this.changed();
      if (this.isB2()) {
        await this.uploadB2(job.id, controller.signal);
      } else {
        await this.upload(job.id, controller.signal);
      }
      controller.signal.throwIfAborted();
      const done = this.store.patch(job.id, { status: 'completed', error: undefined, currentFile: undefined, ...this.store.stats(job.id) });
      this.completed(done);
    } catch (error) {
      if (!controller.signal.aborted) {
        const failure = (this.failures.get(job.id) || 0) + 1; this.failures.set(job.id, failure);
        const kind = error instanceof DriveError ? error.kind : 'fatal';
        const status = kind === 'quota' ? 'waiting_quota' : kind === 'retry' ? 'waiting_network' : 'needs_attention';
        const delay = kind === 'quota' ? 60 * 60 * 1000 : Math.min(5 * 60000, 2000 * 2 ** Math.min(failure, 8)) + Math.random() * 1000;
        this.store.patch(job.id, { status, error: error instanceof Error ? error.message : 'Upload stopped.', retryAt: Date.now() + delay, ...this.store.stats(job.id) });
      }
    } finally { this.active = undefined; this.busy = false; this.changed(); }
  }
  private async uploadB2(id: string, signal: AbortSignal): Promise<void> {
    if (!this.b2 || !this.b2.isConnected()) throw new Error('Backblaze B2 is not connected.');
    const job = this.store.get(id);
    const root = await fs.realpath(job.rootPath).catch(() => {
      throw new Error('Source drive is unavailable. Reconnect it or choose Locate folder.');
    });

    const bucketName = this.b2.credentials?.bucketName || '';
    const folderSlug = (job.target?.jobCode || job.target?.title || job.rootName || 'package')
      .replace(/[^a-zA-Z0-9_-]+/g, '_');
    const prefix = `raw/${folderSlug}`;

    this.store.patch(id, {
      folderId: prefix,
      link: `b2://${bucketName}/${prefix}`
    });

    let file: ManifestFile | undefined;
    while ((file = this.store.next(id))) {
      signal.throwIfAborted();
      this.store.patch(id, { currentFile: file.relativePath, status: 'uploading', ...this.store.stats(id) });
      this.changed();

      const full = await this.localFile(root, file);
      const b2FileName = b2ObjectName(prefix, file.relativePath);

      try {
        await this.b2.uploadFile(full, b2FileName, signal, chunkDownloaded => {
          file!.offset = chunkDownloaded;
          this.store.saveFile(file!);
          this.store.patch(id, this.store.stats(id));
          this.changed();
        });

        file.offset = file.size;
        file.state = 'verified';
        file.error = undefined;
        this.store.saveFile(file);
      } catch (err) {
        if (!signal.aborted) {
          file.error = err instanceof Error ? err.message : 'Upload error';
          this.store.saveFile(file);
        }
        throw err;
      }
    }

    const stats = this.store.stats(id);
    if (stats.completedFiles !== job.scan?.fileCount || stats.uploadedBytes !== job.scan?.totalBytes) {
      throw new Error('Manifest reconciliation failed. The folder is not marked complete.');
    }
  }
  private async upload(id: string, signal: AbortSignal): Promise<void> {
    const job = this.store.get(id);
    const root = await fs.realpath(job.rootPath).catch(() => { throw new Error('Source drive is unavailable. Reconnect it or choose Locate folder.'); });
    for (const folder of this.store.folders(id)) {
      signal.throwIfAborted();
      const driveId = folder.driveId || await this.drive.generateId(signal);
      this.store.saveFolder(id, folder.path, driveId); // Persist reserved ID before creation: crash-safe, duplicate-safe.
      const parentPath = path.posix.dirname(folder.path);
      const parent = folder.path ? this.store.folderId(id, parentPath === '.' ? '' : parentPath) : undefined;
      const name = folder.path ? path.posix.basename(folder.path) : `${job.target?.jobCode || job.target?.title || 'Baawaray'} - ${job.rootName}`;
      await this.drive.ensureFolder(driveId, name, parent, signal);
      if (!folder.path) this.store.patch(id, { folderId: driveId, link: `https://drive.google.com/drive/folders/${driveId}` });
    }
    let file: ManifestFile | undefined;
    while ((file = this.store.next(id))) {
      signal.throwIfAborted();
      this.store.patch(id, { currentFile: file.relativePath, status: 'uploading', ...this.store.stats(id) }); this.changed();
      try { await this.uploadFile(root, file, signal); }
      catch (error) { if (!signal.aborted) { file.error = error instanceof Error ? error.message : 'Upload error'; this.store.saveFile(file); } throw error; }
    }
    const stats = this.store.stats(id);
    if (stats.completedFiles !== job.scan?.fileCount || stats.uploadedBytes !== job.scan?.totalBytes) throw new Error('Manifest reconciliation failed. The folder is not marked complete.');
  }
  private async localFile(root: string, file: ManifestFile): Promise<string> {
    const full = path.resolve(root, file.relativePath);
    if (!full.startsWith(root + path.sep)) throw new Error('Invalid manifest path.');
    const actual = await fs.realpath(full).catch(() => { throw new Error(`Source file missing: ${file.relativePath}`); });
    if (actual !== full) throw new Error(`Source path now contains a symbolic link: ${file.relativePath}`);
    const stat = await fs.stat(full);
    if (!stat.isFile() || stat.size !== file.size || Math.abs(stat.mtimeMs - file.mtimeMs) > 1) throw new Error(`Source file changed after scanning: ${file.relativePath}. Create a fresh scan; the existing upload is preserved.`);
    return full;
  }
  private async uploadFile(root: string, file: ManifestFile, signal: AbortSignal): Promise<void> {
    const full = await this.localFile(root, file);
    if (!file.md5) {
      this.store.patch(file.jobId, { status: 'verifying', currentFile: `Reading checksum: ${file.relativePath}` }); this.changed();
      const hash = createHash('md5');
      for await (const buffer of createReadStream(full, { highWaterMark: 4 * 1024 * 1024, signal })) { signal.throwIfAborted(); hash.update(buffer); }
      await this.localFile(root, file);
      file.md5 = hash.digest('hex'); this.store.saveFile(file);
    }
    if (!file.driveId) { file.driveId = await this.drive.generateId(signal); this.store.saveFile(file); }
    const existing = await this.drive.metadata(file.driveId, signal);
    if (existing) {
      if (existing.trashed || Number(existing.size) !== file.size || existing.md5Checksum !== file.md5) throw new Error(`Drive verification failed for ${file.relativePath}. No files were deleted or overwritten.`);
      file.offset = file.size; file.state = 'verified'; file.error = undefined; this.store.saveFile(file); return;
    }
    if (file.session) {
      const progress = await this.drive.probe(file.session, file.size, signal);
      file.offset = progress.offset;
      if (progress.expired) { file.session = undefined; file.offset = 0; }
      this.store.saveFile(file);
    }
    if (!file.session) {
      const parentPath = path.posix.dirname(file.relativePath);
      const parent = this.store.folderId(file.jobId, parentPath === '.' ? '' : parentPath);
      if (!parent) throw new Error('Destination folder was not created.');
      file.session = await this.drive.start(file.driveId, path.posix.basename(file.relativePath), file.size, parent, signal);
      file.offset = 0; file.state = 'uploading'; this.store.saveFile(file);
    }
    this.store.patch(file.jobId, { status: 'uploading', currentFile: file.relativePath }); this.changed();
    const handle = await fs.open(full, 'r');
    try {
      if (file.size === 0) await this.drive.chunk(file.session!, new Uint8Array(), 0, 0, signal);
      while (file.offset < file.size) {
        signal.throwIfAborted(); await this.localFile(root, file);
        const size = Math.min(CHUNK_SIZE, file.size - file.offset);
        const buffer = Buffer.allocUnsafe(size);
        const { bytesRead } = await handle.read(buffer, 0, size, file.offset);
        if (bytesRead !== size) throw new Error(`Source read was incomplete: ${file.relativePath}`);
        const progress = await this.drive.chunk(file.session!, buffer, file.offset, file.size, signal);
        if (progress.offset <= file.offset || progress.offset > file.offset + size) throw new Error('Drive returned inconsistent progress. Resume to reconcile.');
        file.offset = progress.offset; this.store.saveFile(file);
        this.store.patch(file.jobId, this.store.stats(file.jobId)); this.changed();
      }
    } finally { await handle.close(); }
    await this.localFile(root, file);
    this.store.patch(file.jobId, { status: 'verifying' }); this.changed();
    const remote = await this.drive.metadata(file.driveId, signal);
    if (!remote || remote.trashed || Number(remote.size) !== file.size || remote.md5Checksum !== file.md5) throw new Error(`Checksum verification failed: ${file.relativePath}. Review before sharing.`);
    file.state = 'verified'; file.error = undefined; file.session = undefined; this.store.saveFile(file);
  }
}
