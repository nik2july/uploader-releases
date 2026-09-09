import { DatabaseSync } from 'node:sqlite';
import type { ManifestFile, Transfer } from '../shared/contracts';

/** Durable per-file journal. Sessions never cross the renderer boundary. */
export class TransferStore {
  readonly db: DatabaseSync;
  constructor(filename: string) {
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, owner TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS files (id INTEGER PRIMARY KEY, job TEXT NOT NULL REFERENCES jobs(id),
        path TEXT NOT NULL, data TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', offset INTEGER NOT NULL DEFAULT 0,
        UNIQUE(job,path));
      CREATE INDEX IF NOT EXISTS files_queue ON files(job,state,id);
      CREATE TABLE IF NOT EXISTS folders (job TEXT NOT NULL REFERENCES jobs(id), path TEXT NOT NULL, drive_id TEXT,
        PRIMARY KEY(job,path));`);
    for (const job of this.all()) {
      if (job.status === 'scanning') this.save({ ...job, status: 'needs_attention', error: 'Scanning was interrupted. Select the folder again to scan a fresh manifest.' });
      else if (['uploading', 'verifying', 'queued'].includes(job.status)) this.save({ ...job, status: 'paused', error: 'Recovered after restart. Resume to reconcile progress with Drive.' });
    }
  }
  close(): void { this.db.close(); }
  all(owner?: string): Transfer[] {
    const rows = owner ? this.db.prepare('SELECT data FROM jobs WHERE owner=? ORDER BY rowid DESC').all(owner)
      : this.db.prepare('SELECT data FROM jobs ORDER BY rowid DESC').all();
    return rows.map(r => JSON.parse(String(r.data)));
  }
  get(id: string): Transfer {
    const row = this.db.prepare('SELECT data FROM jobs WHERE id=?').get(id);
    if (!row) throw new Error('Transfer not found.');
    return JSON.parse(String(row.data));
  }
  save(job: Transfer): void {
    job.updatedAt = new Date().toISOString();
    this.db.prepare('INSERT INTO jobs(id,owner,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(job.id, job.ownerUid, JSON.stringify(job));
  }
  patch(id: string, values: Partial<Transfer>): Transfer {
    const job = { ...this.get(id), ...values }; this.save(job); return job;
  }
  /**
   * OR IGNORE, so re-scanning a folder that has already been sent leaves the
   * rows for files Drive has confirmed exactly as they were — with their Drive
   * ids and verified state — and only the newly arrived files are added.
   */
  addFile(job: string, file: Omit<ManifestFile, 'id' | 'jobId' | 'offset' | 'state'>): void {
    this.db.prepare('INSERT OR IGNORE INTO files(job,path,data) VALUES(?,?,?)').run(job, file.relativePath, JSON.stringify(file));
  }
  private file(row: Record<string, unknown>): ManifestFile {
    return { ...JSON.parse(String(row.data)), id: Number(row.id), jobId: String(row.job), state: row.state, offset: Number(row.offset) };
  }
  next(job: string): ManifestFile | undefined {
    const row = this.db.prepare("SELECT * FROM files WHERE job=? AND state!='verified' ORDER BY id LIMIT 1").get(job);
    return row ? this.file(row) : undefined;
  }
  saveFile(file: ManifestFile): void {
    this.db.prepare('UPDATE files SET data=?, state=?, offset=? WHERE id=?').run(JSON.stringify(file), file.state, file.offset, file.id);
  }
  stats(job: string): { completedFiles: number; uploadedBytes: number } {
    const row = this.db.prepare("SELECT SUM(CASE WHEN state='verified' THEN 1 ELSE 0 END) done, SUM(offset) bytes FROM files WHERE job=?").get(job)!;
    return { completedFiles: Number(row.done || 0), uploadedBytes: Number(row.bytes || 0) };
  }
  problems(job: string): { path: string; error: string }[] {
    return this.db.prepare("SELECT path,json_extract(data,'$.error') error FROM files WHERE job=? AND json_extract(data,'$.error') IS NOT NULL LIMIT 200").all(job)
      .map(row => ({ path: String(row.path), error: String(row.error) }));
  }
  addFolder(job: string, path: string): void {
    this.db.prepare('INSERT OR IGNORE INTO folders(job,path) VALUES(?,?)').run(job, path);
  }
  folders(job: string): { path: string; driveId?: string }[] {
    return this.db.prepare('SELECT path,drive_id FROM folders WHERE job=? ORDER BY length(path),path').all(job)
      .map(r => ({ path: String(r.path), driveId: r.drive_id ? String(r.drive_id) : undefined }));
  }
  folderId(job: string, path: string): string | undefined {
    return this.db.prepare('SELECT drive_id FROM folders WHERE job=? AND path=?').get(job, path)?.drive_id as string | undefined;
  }
  saveFolder(job: string, path: string, driveId: string): void {
    this.db.prepare('UPDATE folders SET drive_id=? WHERE job=? AND path=?').run(driveId, job, path);
  }
}
