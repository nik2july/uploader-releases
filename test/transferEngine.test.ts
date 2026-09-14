import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { TransferStore } from '../src/main/store';
import { TransferEngine } from '../src/main/transferEngine';
import { DriveClient, DriveError } from '../src/main/drive';
import type { Transfer } from '../src/shared/contracts';
import { FakeDrive, TARGET, driveError, md5, seedJob, settle, tempDir } from './helpers';
import type { B2Client } from '../src/main/b2Client';

/**
 * The queue, driven against an in-process Drive.
 *
 * Every scenario here is one the studio has actually hit: the laptop sleeps,
 * the wifi drops, the external drive is unplugged, Google says "that is enough
 * for today". What matters in each is not that it recovers, but that it never
 * reports a folder as ready to send when it is not.
 */
const cleanups: (() => void)[] = [];
afterEach(() => { for (const done of cleanups.splice(0).reverse()) done(); });

function harness(fetcher?: typeof fetch): { store: TransferStore; drive: FakeDrive; engine: TransferEngine } {
  const store = new TransferStore(':memory:');
  const drive = new FakeDrive();
  const client = fetcher ? new DriveClient(async () => 'token', fetcher) : drive.client();
  const engine = new TransferEngine(store, client, () => 'studio@baawaray.com', () => {});
  cleanups.push(() => { engine.shutdown(); store.close(); });
  engine.setOwner('owner');
  return { store, drive, engine };
}

const FILES = {
  'DAY01/A.mov': 'a'.repeat(3000),
  'DAY01/B.mov': 'b'.repeat(1500),
  'C.mov': 'c'.repeat(500),
};
const FOLDERS = ['', 'DAY01'];
const TOTAL_BYTES = 5000;

describe('a clean run', () => {
  test('uploads every file, verifies each one, and only then says ready', async () => {
    const { store, drive, engine } = harness();
    const job = await seedJob(store, await tempDir(), FILES, FOLDERS);

    engine.resume(job.id);
    const done = await settle(store, job.id);

    assert.equal(done.status, 'completed');
    assert.equal(done.completedFiles, 3);
    assert.equal(done.uploadedBytes, TOTAL_BYTES);
    assert.match(done.link!, /^https:\/\/drive\.google\.com\/drive\/folders\//);

    // The bytes in Drive are the bytes on disk, compared by content not by count.
    for (const [relativePath, body] of Object.entries(FILES)) {
      const uploaded = [...drive.files.values()].find(f => f.name === path.basename(relativePath));
      assert.ok(uploaded, `${relativePath} never reached Drive`);
      assert.equal(md5(uploaded.bytes), md5(Buffer.from(body)));
    }
  });

  test('keeps the folder structure rather than flattening the cards together', async () => {
    const { store, drive, engine } = harness();
    const job = await seedJob(store, await tempDir(), FILES, FOLDERS);
    engine.resume(job.id);
    await settle(store, job.id);

    const day01 = [...drive.files.values()].find(f => f.name === 'DAY01');
    assert.ok(day01, 'the DAY01 card folder was never created in Drive');
    const inside = [...drive.files.values()].filter(f => f.parents.includes(day01.id)).map(f => f.name).sort();
    assert.deepEqual(inside, ['A.mov', 'B.mov']);
  });
});

describe('interruption', () => {
  test('a dropped connection mid-file resumes from the byte Drive kept', async () => {
    const drive = new FakeDrive();
    const store = new TransferStore(':memory:');
    cleanups.push(() => store.close());

    // One file larger than the 8 MiB chunk, so a failure lands mid-transfer.
    const body = 'x'.repeat(20 * 1024 * 1024);
    const root = await tempDir();
    const job = await seedJob(store, root, { 'BIG.mov': body }, ['']);

    // Drop the connection on the second chunk: the first is acknowledged, the
    // rest is not. This is a flaky hotel wifi, not a broken file.
    let chunks = 0;
    drive.failWhen = ({ method, hasBody }) =>
      (method === 'PUT' && hasBody && ++chunks === 2 ? new TypeError('fetch failed') : undefined);

    const flaky = new TransferEngine(store, drive.client(), () => 'studio@baawaray.com', () => {});
    cleanups.push(() => flaky.shutdown());
    flaky.setOwner('owner');
    flaky.resume(job.id);
    const stalled = await settle(store, job.id);

    assert.equal(stalled.status, 'waiting_network', 'a dropped connection is a wait, not a failure');
    assert.ok(stalled.uploadedBytes > 0 && stalled.uploadedBytes < body.length,
      `expected partial progress, got ${stalled.uploadedBytes} of ${body.length}`);
    const keptAcrossTheDrop = stalled.uploadedBytes;

    // Resume on a working connection. It must send the remainder, not the file.
    drive.failWhen = () => undefined;
    drive.calls.length = 0;
    const good = new TransferEngine(store, drive.client(), () => 'studio@baawaray.com', () => {});
    cleanups.push(() => good.shutdown());
    good.setOwner('owner');
    good.resume(job.id);
    const finished = await settle(store, job.id);

    assert.equal(finished.status, 'completed');
    assert.equal(finished.uploadedBytes, body.length);
    assert.equal(md5([...drive.files.values()].find(f => f.name === 'BIG.mov')!.bytes), md5(Buffer.from(body)));

    const chunksOnResume = drive.calls.filter(c => c.startsWith('PUT')).length;
    const chunksFromScratch = Math.ceil(body.length / (8 * 1024 * 1024));
    assert.ok(chunksOnResume <= chunksFromScratch,
      `resume sent ${chunksOnResume} chunks; starting over would have been ${chunksFromScratch}`);
    assert.ok(keptAcrossTheDrop >= 8 * 1024 * 1024, 'the acknowledged first chunk should have been kept');
  });

  test('files already verified are not sent a second time', async () => {
    const { store, drive, engine } = harness();
    const job = await seedJob(store, await tempDir(), FILES, FOLDERS);
    engine.resume(job.id);
    await settle(store, job.id);
    assert.ok(drive.calls.filter(c => c.startsWith('PUT')).length > 0);

    // Re-running a finished job is a no-op. This is what makes reusing one
    // wedding's footage across its trailer, film and reels cheap.
    drive.calls.length = 0;
    engine.resume(job.id);
    await settle(store, job.id);
    assert.deepEqual(drive.calls.filter(c => c.startsWith('PUT')), []);
  });

  test('a session Drive has forgotten restarts that file, keeping the rest', async () => {
    const { store, drive, engine } = harness();
    const root = await tempDir();
    const job = await seedJob(store, root, FILES, FOLDERS);

    // Stand in for a resumable session opened over a week ago: the journal
    // still has it, Google no longer does.
    const stale = store.next(job.id)!;
    stale.session = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=forgotten';
    stale.offset = 900;
    stale.state = 'uploading';
    store.saveFile(stale);

    engine.resume(job.id);
    const done = await settle(store, job.id);

    assert.equal(done.status, 'completed', `expected recovery, got ${done.status}: ${done.error}`);
    assert.equal(done.uploadedBytes, TOTAL_BYTES, 'the restarted file must be re-sent whole, not from its stale offset');
    for (const [relativePath, body] of Object.entries(FILES)) {
      const uploaded = [...drive.files.values()].find(f => f.name === path.basename(relativePath))!;
      assert.equal(md5(uploaded.bytes), md5(Buffer.from(body)), `${relativePath} is corrupt`);
    }
  });

  test('pausing mid-transfer stops it and keeps what was sent', async () => {
    const { store, drive, engine } = harness();
    const body = 'y'.repeat(30 * 1024 * 1024);
    const job = await seedJob(store, await tempDir(), { 'BIG.mov': body }, ['']);

    // Pause once Drive has acknowledged a chunk, the way a person would.
    let paused = false;
    drive.failWhen = ({ method, hasBody }) => {
      if (method === 'PUT' && hasBody && !paused) { paused = true; engine.pause(job.id); }
      return undefined;
    };

    engine.resume(job.id);
    const stopped = await settle(store, job.id);

    assert.equal(stopped.status, 'paused');
    assert.equal(stopped.error, undefined, 'a deliberate pause is not an error to report');
    assert.ok(store.next(job.id), 'the manifest must survive a pause');
  });
});

describe('Google saying no', () => {
  test('the daily upload limit parks the job and keeps the queue', async () => {
    const { store, drive, engine } = harness();
    const job = await seedJob(store, await tempDir(), FILES, FOLDERS);

    drive.failWhen = ({ method, hasBody }) =>
      (method === 'PUT' && hasBody ? driveError('Daily limit exceeded', 'dailyLimitExceeded', 403) : undefined);

    engine.resume(job.id);
    const parked = await settle(store, job.id);

    assert.equal(parked.status, 'waiting_quota');
    assert.ok(parked.retryAt! > Date.now() + 30 * 60 * 1000,
      'a quota wait should be measured in hours — retrying sooner just burns requests against the same limit');
    assert.ok(store.next(job.id), 'the manifest must survive so the queue resumes when the allowance resets');
  });

  test('a full Drive stops and asks for a person', async () => {
    const { store, drive, engine } = harness();
    const job = await seedJob(store, await tempDir(), FILES, FOLDERS);

    drive.failWhen = ({ method, hasBody }) =>
      (method === 'PUT' && hasBody ? driveError('Quota exceeded', 'storageQuotaExceeded', 403) : undefined);

    engine.resume(job.id);
    const stopped = await settle(store, job.id);

    assert.equal(stopped.status, 'needs_attention', 'no amount of retrying frees up storage');
    assert.match(stopped.error!, /Quota exceeded/);
  });
});

describe('refusing to lie about what arrived', () => {
  test('a size mismatch stops the job and touches nothing', async () => {
    const drive = new FakeDrive();
    // Drive reports a file smaller than what was sent — a truncated upload that
    // returned 200. Believing it would mark a broken folder ready to share.
    const lying: typeof fetch = async (input, init) => {
      const response = await drive.fetch(input, init);
      const url = String(input);
      if (/\/drive\/v3\/files\/[^/?]+\?/.test(url) && (init?.method || 'GET') === 'GET' && response.ok) {
        const body = await response.json() as Record<string, unknown>;
        if (body.md5Checksum && body.mimeType !== 'application/vnd.google-apps.folder') {
          return new Response(JSON.stringify({ ...body, size: '17' }), { status: 200 });
        }
        return new Response(JSON.stringify(body), { status: 200 });
      }
      return response;
    };
    const { store, engine } = harness(lying);
    const root = await tempDir();
    const job = await seedJob(store, root, { 'A.mov': 'a'.repeat(3000) }, ['']);

    engine.resume(job.id);
    const stopped = await settle(store, job.id);

    assert.notEqual(stopped.status, 'completed', 'a mismatched file must never be reported as ready to share');
    assert.match(stopped.error!, /verification failed/i);
    assert.equal(await fs.readFile(path.join(root, 'A.mov'), 'utf8'), 'a'.repeat(3000), 'the source must be untouched');
  });

  test('a source file edited after the scan is refused, not silently re-measured', async () => {
    const { store, engine } = harness();
    const root = await tempDir();
    const job = await seedJob(store, root, { 'A.mov': 'a'.repeat(3000) }, ['']);

    await fs.writeFile(path.join(root, 'A.mov'), 'different content entirely');
    engine.resume(job.id);
    const stopped = await settle(store, job.id);

    assert.equal(stopped.status, 'needs_attention');
    assert.match(stopped.error!, /changed after scanning/);
  });

  test('an unplugged drive says so rather than blaming the upload', async () => {
    const { store, engine } = harness();
    const root = await tempDir();
    const job = await seedJob(store, root, { 'A.mov': 'a'.repeat(3000) }, ['']);
    await fs.rm(root, { recursive: true, force: true });

    engine.resume(job.id);
    const stopped = await settle(store, job.id);
    assert.match(stopped.error!, /Source drive is unavailable/);
  });

  test('a manifest that does not reconcile is not called complete', async () => {
    const { store, engine } = harness();
    const job = await seedJob(store, await tempDir(), FILES, FOLDERS);
    // The scan claims a file the manifest does not have — the shape of a
    // partial inventory. Sending what is there must not read as "all of it".
    store.patch(job.id, { scan: { ...job.scan!, fileCount: 4, totalBytes: TOTAL_BYTES + 10 } });

    engine.resume(job.id);
    const stopped = await settle(store, job.id);

    assert.notEqual(stopped.status, 'completed');
    assert.match(stopped.error!, /reconciliation failed/i);
  });
});

describe('surviving a restart', () => {
  test('a job that was uploading when the app died comes back paused, not lost', async () => {
    const file = path.join(await tempDir(), 'queue.sqlite');
    const first = new TransferStore(file);
    const job = await seedJob(first, await tempDir(), FILES, FOLDERS);
    first.patch(job.id, { status: 'uploading', currentFile: 'DAY01/A.mov' });
    first.close();

    const second = new TransferStore(file); // what the app does on launch
    cleanups.push(() => second.close());
    const recovered = second.get(job.id);

    assert.equal(recovered.status, 'paused');
    assert.match(recovered.error!, /Recovered after restart/);
    assert.ok(second.next(job.id), 'the manifest must still be there to resume from');
  });

  test('a scan that was interrupted is not treated as a complete manifest', async () => {
    const file = path.join(await tempDir(), 'queue.sqlite');
    const first = new TransferStore(file);
    const job = await seedJob(first, await tempDir(), FILES, FOLDERS);
    first.patch(job.id, { status: 'scanning' });
    first.close();

    const second = new TransferStore(file);
    cleanups.push(() => second.close());
    const recovered = second.get(job.id);

    assert.equal(recovered.status, 'needs_attention');
    assert.match(recovered.error!, /scan a fresh manifest/);
  });

  test('a half-finished job resumes rather than starting the terabytes again', async () => {
    const file = path.join(await tempDir(), 'queue.sqlite');
    const drive = new FakeDrive();

    const first = new TransferStore(file);
    const job = await seedJob(first, await tempDir(), FILES, FOLDERS);
    const engineA = new TransferEngine(first, drive.client(), () => 'studio@baawaray.com', () => {});
    engineA.setOwner('owner');
    // Die once the first file is verified — asked of the journal rather than
    // counted in requests, so the test does not depend on how many calls a
    // folder or a checksum happens to take.
    drive.failWhen = () => (first.stats(job.id).completedFiles >= 1
      ? driveError('Backend error', 'backendError', 503)
      : undefined);
    engineA.resume(job.id);
    await settle(first, job.id);
    engineA.shutdown();
    const partial = first.stats(job.id);
    first.close();

    assert.ok(partial.completedFiles >= 1 && partial.completedFiles < 3,
      `expected a partial run, got ${partial.completedFiles} of 3 files`);

    // A fresh process, a fresh engine, the same journal on disk.
    drive.failWhen = () => undefined;
    drive.calls.length = 0;
    const second = new TransferStore(file);
    const engineB = new TransferEngine(second, drive.client(), () => 'studio@baawaray.com', () => {});
    cleanups.push(() => { engineB.shutdown(); second.close(); });
    engineB.setOwner('owner');
    engineB.resume(job.id);
    const finished = await settle(second, job.id);

    assert.equal(finished.status, 'completed');
    assert.equal(finished.completedFiles, 3);
    assert.equal(finished.uploadedBytes, TOTAL_BYTES);
  });
});

describe('records written by an older build', () => {
  test('a scan from before a field existed comes back whole', async () => {
    // The journal holds JSON, so a folder scanned by an earlier version has an
    // earlier shape. A screen reading scan.unreadableFiles.length on one of
    // those throws and blanks the window, which is what happened.
    const file = path.join(await tempDir(), 'queue.sqlite');
    const store = new TransferStore(file);
    const job = await seedJob(store, await tempDir(), FILES, FOLDERS);

    // Write the record back the way an older build would have left it.
    const older = store.get(job.id);
    const stripped = { ...older.scan } as Record<string, unknown>;
    delete stripped.unreadableFiles;
    delete stripped.missingClips;
    delete stripped.missingClipCount;
    store.save({ ...older, scan: stripped as unknown as Transfer['scan'] });

    const reopened = new TransferStore(file);
    cleanups.push(() => { reopened.close(); store.close(); });
    const scan = reopened.get(job.id).scan!;

    assert.deepEqual(scan.unreadableFiles, [], 'every reader must get an array, not undefined');
    assert.deepEqual(scan.missingClips, []);
    assert.equal(scan.missingClipCount, 0);
    assert.equal(scan.fileCount, 3, 'and the fields it did have are untouched');
  });
});

describe('guards before anything moves', () => {
  test('refuses to upload a scan that could not read every file', async () => {
    const { store, engine } = harness();
    const job = await seedJob(store, await tempDir(), FILES, FOLDERS);
    store.patch(job.id, { scan: { ...job.scan!, readErrors: 2 } });
    assert.throws(() => engine.resume(job.id), /complete scan/);
  });

  test('refuses to upload a folder not yet attached to any work', async () => {
    const { store, engine } = harness();
    const job = await seedJob(store, await tempDir(), FILES, FOLDERS);
    store.patch(job.id, { target: undefined });
    assert.throws(() => engine.resume(job.id), /complete scan/);
  });

  test('refuses to continue a transfer under a different Drive account', async () => {
    const store = new TransferStore(':memory:');
    const drive = new FakeDrive();
    const engine = new TransferEngine(store, drive.client(), () => 'someone-else@baawaray.com', () => {});
    cleanups.push(() => { engine.shutdown(); store.close(); });
    engine.setOwner('owner');

    const job = await seedJob(store, await tempDir(), FILES, FOLDERS);
    store.patch(job.id, { driveAccount: 'studio@baawaray.com' });
    assert.throws(() => engine.resume(job.id), /Reconnect the original Drive account/);
  });

  test('refuses to upload with no Drive connected', async () => {
    const store = new TransferStore(':memory:');
    const engine = new TransferEngine(store, new FakeDrive().client(), () => undefined, () => {});
    cleanups.push(() => { engine.shutdown(); store.close(); });
    engine.setOwner('owner');

    const job = await seedJob(store, await tempDir(), FILES, FOLDERS);
    assert.throws(() => engine.resume(job.id), /Connect Google Drive/);
  });
});

describe('what a finished transfer records', () => {
  test('the job, the purpose and the account it went to', async () => {
    const { store, engine } = harness();
    const job = await seedJob(store, await tempDir(), FILES, FOLDERS);
    engine.resume(job.id);
    const done = await settle(store, job.id);

    assert.equal(done.target!.id, TARGET.id);
    assert.equal(done.target!.purpose, 'raw');
    assert.equal(done.driveAccount, 'studio@baawaray.com');
  });

  test('a DriveError carries the kind the queue routes on', () => {
    const error = new DriveError('nope', 'quota', 403);
    assert.equal(error.kind, 'quota');
    assert.equal(error.status, 403);
  });
});

/**
 * The studio keeps both clouds configured and picks one. Before the choice
 * existed, connected B2 credentials silently won every transfer — so what is
 * tested here is that the preference, not the presence of credentials, decides.
 */
describe('choosing where raw footage lands', () => {
  function fakeB2(): { client: B2Client; uploaded: string[] } {
    const uploaded: string[] = [];
    return {
      uploaded,
      client: {
        isConnected: () => true,
        credentials: { bucketName: 'baawaray.raw' },
        async uploadFile(_local: string, name: string, _signal: AbortSignal, onProgress: (bytes: number) => void) {
          uploaded.push(name);
          onProgress(0);
        },
      } as unknown as B2Client,
    };
  }

  test('B2 takes the transfer while B2 is the chosen destination', async () => {
    const { store, engine } = harness();
    const b2 = fakeB2();
    engine.setB2Client(b2.client);
    const job = await seedJob(store, await tempDir(), FILES, FOLDERS);

    engine.resume(job.id);
    const done = await settle(store, job.id);

    assert.equal(done.status, 'completed');
    assert.match(done.link!, /^b2:\/\/baawaray\.raw\//);
    assert.equal(b2.uploaded.length, 3);
  });

  test('choosing Drive routes to Drive even with B2 still connected', async () => {
    const { store, drive, engine } = harness();
    const b2 = fakeB2();
    engine.setB2Client(b2.client);
    engine.setDestination('drive');
    const job = await seedJob(store, await tempDir(), FILES, FOLDERS);

    engine.resume(job.id);
    const done = await settle(store, job.id);

    assert.equal(done.status, 'completed');
    assert.match(done.link!, /^https:\/\/drive\.google\.com\/drive\/folders\//);
    assert.equal(done.driveAccount, 'studio@baawaray.com');
    assert.equal(b2.uploaded.length, 0);
    for (const relativePath of Object.keys(FILES)) {
      assert.ok([...drive.files.values()].some(f => f.name === path.basename(relativePath)), `${relativePath} never reached Drive`);
    }
  });

  test('a folder half-sent to Drive will not finish into B2', async () => {
    const { store, engine } = harness();
    engine.setB2Client(fakeB2().client);
    engine.setDestination('drive');
    const job = await seedJob(store, await tempDir(), FILES, FOLDERS);

    // One run to Drive, then the studio switches the studio-wide destination.
    engine.resume(job.id);
    await settle(store, job.id);
    store.patch(job.id, { status: 'paused' });
    engine.setDestination('b2');

    assert.throws(() => engine.resume(job.id), /already started uploading to Google Drive/);
  });

  test('a folder half-sent to B2 will not finish into Drive', async () => {
    const { store, engine } = harness();
    engine.setB2Client(fakeB2().client);
    const job = await seedJob(store, await tempDir(), FILES, FOLDERS);
    store.patch(job.id, { driveAccount: 'B2: baawaray.raw' });

    engine.setDestination('drive');

    assert.throws(() => engine.resume(job.id), /already started uploading to Backblaze B2/);
  });

  test('switching destination stops anything mid-flight rather than splitting a folder', async () => {
    const { store, engine } = harness();
    engine.setB2Client(fakeB2().client);
    const job = await seedJob(store, await tempDir(), FILES, FOLDERS);

    store.patch(job.id, { status: 'uploading' });
    engine.setDestination('drive');

    assert.equal(store.get(job.id).status, 'paused');
  });
});
