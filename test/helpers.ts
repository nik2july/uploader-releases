import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { TransferStore } from '../src/main/store';
import { DriveClient } from '../src/main/drive';
import type { Transfer, WorkTarget } from '../src/shared/contracts';

/**
 * A Drive that never leaves the process.
 *
 * `DriveClient` takes its `fetch` as a constructor argument, so the real
 * protocol code — the endpoint allow-list, the error classification, the
 * Content-Range arithmetic — runs against this exactly as it runs against
 * Google. That is the point: these tests exercise the client, not a mock of it.
 */
export interface FakeFile { id: string; name: string; parents: string[]; bytes: Buffer; done: boolean }

export class FakeDrive {
  readonly files = new Map<string, FakeFile>();
  readonly sessions = new Map<string, { id: string; size: number }>();
  readonly permissions = new Map<string, { type: string; role: string; emailAddress?: string }[]>();
  /** Requests seen, in order — asserted on to prove work was *not* repeated. */
  readonly calls: string[] = [];
  private counter = 0;

  /**
   * How this Drive misbehaves. Returning a Response or an Error replaces the
   * real answer; returning undefined lets it through. `index` counts every
   * request, so a test can say "fail from the fourth call on".
   */
  failWhen: (request: { url: string; method: string; hasBody: boolean; index: number }) => Response | Error | undefined
    = () => undefined;
  /** Sessions the server has forgotten, as Drive does after a week. */
  expiredSessions = new Set<string>();

  readonly fetch: typeof fetch = async (input, init: RequestInit = {}) => {
    const url = String(input);
    const method = (init.method || 'GET').toUpperCase();
    this.calls.push(`${method} ${url.split('?')[0]}`);

    const outcome = this.failWhen({ url, method, hasBody: Boolean(init.body), index: this.calls.length - 1 });
    if (outcome instanceof Error) throw outcome;
    if (outcome) return outcome;

    if (url.includes('/files/generateIds')) return json({ ids: [`id-${++this.counter}`] });

    // Resumable upload session: PUT to the session URL.
    if (this.sessions.has(url)) return this.uploadChunk(url, init);
    // A session URL this Drive has no record of. Google answers a resumable
    // session it has forgotten — they last a week — with 410, not a 404 page.
    if (url.includes('uploadType=resumable') && method === 'PUT') return new Response(null, { status: 410 });

    // Create a resumable session.
    if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files') && method === 'POST') {
      const body = JSON.parse(String(init.body)) as { id: string; name: string; parents: string[] };
      const session = `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=s${++this.counter}`;
      this.sessions.set(session, { id: body.id, size: Number(headerOf(init, 'X-Upload-Content-Length')) });
      this.files.set(body.id, { id: body.id, name: body.name, parents: body.parents, bytes: Buffer.alloc(0), done: false });
      return new Response(null, { status: 200, headers: { location: session } });
    }

    // Create a folder, or any other metadata POST.
    if (url.startsWith('https://www.googleapis.com/drive/v3/files?') && method === 'POST') {
      const body = JSON.parse(String(init.body)) as { id: string; name: string; parents?: string[]; mimeType: string };
      this.files.set(body.id, { id: body.id, name: body.name, parents: body.parents || [], bytes: Buffer.alloc(0), done: true });
      return json({ id: body.id });
    }

    // Permissions.
    const permissionMatch = /\/drive\/v3\/files\/([^/?]+)\/permissions/.exec(url);
    if (permissionMatch) {
      const id = decodeURIComponent(permissionMatch[1]);
      if (method === 'POST') {
        const body = JSON.parse(String(init.body)) as { type: string; role: string; emailAddress?: string };
        this.permissions.set(id, [...(this.permissions.get(id) || []), body]);
        return json({ id: 'perm' });
      }
      return json({ permissions: this.permissions.get(id) || [] });
    }

    // Metadata read.
    const fileMatch = /\/drive\/v3\/files\/([^/?]+)\?/.exec(url);
    if (fileMatch && method === 'GET') {
      const file = this.files.get(decodeURIComponent(fileMatch[1]));
      if (!file || !file.done) return new Response('{}', { status: 404 });
      return json({
        id: file.id, name: file.name, parents: file.parents,
        size: String(file.bytes.length), md5Checksum: md5(file.bytes),
        mimeType: file.name.includes('.') ? 'application/octet-stream' : 'application/vnd.google-apps.folder',
        trashed: false,
      });
    }

    return new Response('{"error":{"message":"unrouted"}}', { status: 500 });
  };

  private uploadChunk(url: string, init: RequestInit): Response {
    if (this.expiredSessions.has(url)) return new Response(null, { status: 410 });
    const session = this.sessions.get(url)!;
    const file = this.files.get(session.id)!;
    const range = headerOf(init, 'Content-Range') || '';

    // A probe carries no body and asks how much arrived.
    if (/^bytes \*\//.test(range)) {
      if (file.bytes.length >= session.size && session.size > 0) return json({ id: file.id });
      return new Response(null, { status: 308, headers: rangeHeader(file.bytes.length) });
    }

    const body = init.body ? Buffer.from(init.body as Uint8Array) : Buffer.alloc(0);
    const start = Number(/^bytes (\d+)-/.exec(range)?.[1] ?? 0);
    if (start !== file.bytes.length) return new Response('{"error":{"message":"bad offset"}}', { status: 400 });
    file.bytes = Buffer.concat([file.bytes, body]);

    if (file.bytes.length >= session.size) {
      file.done = true;
      return json({ id: file.id, size: String(file.bytes.length), md5Checksum: md5(file.bytes) });
    }
    return new Response(null, { status: 308, headers: rangeHeader(file.bytes.length) });
  }

  client(): DriveClient {
    return new DriveClient(async () => 'token', this.fetch);
  }
}

function headerOf(init: RequestInit, name: string): string | undefined {
  const headers = init.headers as Record<string, string> | undefined;
  if (!headers) return undefined;
  const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}

function rangeHeader(length: number): Record<string, string> {
  return length > 0 ? { range: `bytes=0-${length - 1}` } : {};
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export function driveError(message: string, reason: string, status: number): Response {
  return new Response(JSON.stringify({ error: { message, errors: [{ reason }] } }), { status });
}

export function md5(bytes: Buffer): string {
  return createHash('md5').update(bytes).digest('hex');
}

/* --------------------------------------------------------------- fixtures -- */

export async function tempDir(): Promise<string> {
  return fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'baawaray-test-')));
}

export const TARGET: WorkTarget = {
  kind: 'freelance', id: 'job-1', title: 'Simran & Arjun', clientName: 'Lightbox Studios',
  serviceType: 'Long Form', purpose: 'raw', jobCode: 'FL-2026-D0001',
};

/**
 * A job whose manifest is written straight into the journal, skipping the
 * scanner — the queue's job is to move a manifest, and how that manifest was
 * measured is a separate question with its own tests.
 */
export async function seedJob(store: TransferStore, root: string,
  files: Record<string, string>, folders: string[] = ['']): Promise<Transfer> {
  const now = new Date().toISOString();
  const job: Transfer = {
    id: 'transfer-1', ownerUid: 'owner', rootPath: root, rootName: path.basename(root),
    status: 'ready', target: TARGET, options: { excludedBillingFolders: [], countPhotoPairsOnce: true },
    createdAt: now, updatedAt: now, completedFiles: 0, uploadedBytes: 0,
    scan: {
      totalPhotos: 0, billablePhotos: 0, totalVideos: 0, totalDurationSeconds: 0, unknownVideoCount: 0,
      totalBytes: Object.values(files).reduce((sum, body) => sum + Buffer.byteLength(body), 0),
      fileCount: Object.keys(files).length, folderCount: folders.length,
      pairedPhotos: 0, excludedBillingFiles: 0, warnings: [], readErrors: 0,
    },
  };
  store.save(job);
  for (const folder of folders) store.addFolder(job.id, folder);
  for (const [relativePath, body] of Object.entries(files)) {
    const full = path.join(root, relativePath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body);
    const stat = await fs.stat(full);
    store.addFile(job.id, { relativePath, size: stat.size, mtimeMs: stat.mtimeMs, kind: 'video', billingIncluded: true });
  }
  return store.get(job.id);
}

const IN_FLIGHT = ['scanning', 'queued', 'uploading', 'verifying'];

/**
 * Wait for the queue to come to rest.
 *
 * `resume()` starts a pump of its own and a second concurrent one is refused,
 * so a test cannot drive the engine by calling `pump()` in a loop — it has to
 * wait for the run already under way. The timeout is what turns a queue that
 * never finishes into a failed test rather than a hung one.
 */
export async function settle(store: TransferStore, id: string, timeoutMs = 20000): Promise<Transfer> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const job = store.get(id);
    if (!IN_FLIGHT.includes(job.status)) return job;
    if (Date.now() > deadline) throw new Error(`transfer stayed "${job.status}" for ${timeoutMs}ms (${job.currentFile ?? 'no current file'})`);
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}
