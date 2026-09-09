import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DriveClient, DriveError, acknowledgedOffset } from '../src/main/drive';
import { FakeDrive, driveError, json } from './helpers';

/**
 * The protocol layer. Everything here is about not trusting what comes back:
 * Drive answers a resumable upload with a byte count, and believing a wrong one
 * is how a file ends up truncated with nothing to show for it.
 */
describe('acknowledgedOffset', () => {
  test('reads the byte count Drive actually confirmed', () => {
    assert.equal(acknowledgedOffset('bytes=0-999', 5000), 1000);
    assert.equal(acknowledgedOffset('bytes=0-0', 5000), 1);
  });

  test('no range header means nothing was stored', () => {
    assert.equal(acknowledgedOffset(null, 5000), 0);
  });

  test('a range covering the whole file reads as complete', () => {
    // 0-4999 inclusive is all 5000 bytes. The engine's loop then sees
    // offset === size and moves on to verification.
    assert.equal(acknowledgedOffset('bytes=0-4999', 5000), 5000);
  });

  test('refuses a range that claims more than the file holds', () => {
    for (const value of ['bytes=0-5000', 'bytes=0-99999']) {
      assert.throws(() => acknowledgedOffset(value, 5000), /Invalid acknowledged upload range/, `accepted ${value}`);
    }
  });

  test('refuses ranges it cannot parse rather than guessing at zero', () => {
    for (const value of ['bytes=1-999', 'bytes=0-abc', '0-999', 'bytes=0-1e3', 'bytes=0--1']) {
      assert.throws(() => acknowledgedOffset(value, 5000), /Invalid acknowledged upload range/, `accepted ${value}`);
    }
  });
});

describe('DriveClient endpoint allow-list', () => {
  const client = new DriveClient(async () => 'token', async () => json({}));

  test('refuses any host but Drive, and refuses plain http', async () => {
    for (const url of [
      'https://evil.example.com/drive/v3/files',
      'http://www.googleapis.com/drive/v3/files',
      'https://www.googleapis.com.evil.example/drive/v3/files',
      'https://www.googleapis.com/oauth2/v1/tokeninfo',
      'https://www.googleapis.com/storage/v1/b',
    ]) {
      await assert.rejects(client.request(url), /Untrusted Drive endpoint/, `allowed ${url}`);
    }
  });

  test('refuses an upload session hosted somewhere else', async () => {
    // Drive returns the session URL in a header; following one that points off
    // Drive would stream the studio's footage to whoever supplied it.
    const drive = new DriveClient(async () => 'token',
      async () => new Response(null, { status: 200, headers: { location: 'https://evil.example.com/upload' } }));
    await assert.rejects(drive.start('id', 'clip.mov', 10, 'parent'), /Untrusted upload session/);
  });
});

describe('DriveClient error classification', () => {
  async function kindOf(response: Response): Promise<string> {
    const client = new DriveClient(async () => 'token', async () => response.clone());
    try {
      await client.request('https://www.googleapis.com/drive/v3/files/x?fields=id');
      return 'no-error';
    } catch (error) {
      return error instanceof DriveError ? error.kind : 'not-a-drive-error';
    }
  }

  test('a full Drive is fatal, not something to retry forever', async () => {
    assert.equal(await kindOf(driveError('Quota exceeded', 'storageQuotaExceeded', 403)), 'fatal');
  });

  test("the 750 GB daily allowance is a wait, not a failure", async () => {
    assert.equal(await kindOf(driveError('Daily limit exceeded', 'dailyLimitExceeded', 403)), 'quota');
    assert.equal(await kindOf(driveError('The upload limit has been exceeded', 'uploadLimitExceeded', 403)), 'quota');
  });

  test('rate limits and server faults are retried', async () => {
    assert.equal(await kindOf(driveError('Rate limit', 'rateLimitExceeded', 429)), 'retry');
    assert.equal(await kindOf(driveError('Backend error', 'backendError', 503)), 'retry');
  });

  test('a dropped connection is a retry, and says progress was kept', async () => {
    const client = new DriveClient(async () => 'token', async () => { throw new TypeError('fetch failed'); });
    await assert.rejects(client.request('https://www.googleapis.com/drive/v3/files/x?fields=id'), (error: unknown) => {
      assert.ok(error instanceof DriveError);
      assert.equal(error.kind, 'retry');
      assert.match(error.message, /Progress is saved/);
      return true;
    });
  });

  test('an expired token is refreshed once, then given up on', async () => {
    const forced: boolean[] = [];
    let attempts = 0;
    const client = new DriveClient(
      async (refresh = false) => { forced.push(refresh); return 'token'; },
      async () => (++attempts === 1 ? new Response('{}', { status: 401 }) : json({ id: 'ok' })),
    );
    const response = await client.request('https://www.googleapis.com/drive/v3/files/x?fields=id');
    assert.equal((await response.json() as { id: string }).id, 'ok');
    assert.deepEqual(forced, [false, true], 'the retry must force a token refresh, not reuse the stale one');

    const always401 = new DriveClient(async () => 'token', async () => new Response('{}', { status: 401 }));
    await assert.rejects(always401.request('https://www.googleapis.com/drive/v3/files/x?fields=id'),
      (error: unknown) => error instanceof DriveError && error.kind === 'auth');
  });
});

describe('resumable session state', () => {
  test('a probe reports how much Drive kept', async () => {
    const drive = new FakeDrive();
    const client = drive.client();
    const session = await client.start('file-1', 'clip.mov', 1000, 'parent');
    await client.chunk(session, Buffer.alloc(400, 7), 0, 1000);

    const progress = await client.probe(session, 1000);
    assert.deepEqual(progress, { expired: false, done: false, offset: 400 });
  });

  test('a session Drive has forgotten reports expired, not zero progress', async () => {
    const drive = new FakeDrive();
    const client = drive.client();
    const session = await client.start('file-1', 'clip.mov', 1000, 'parent');
    drive.expiredSessions.add(session);

    const progress = await client.probe(session, 1000);
    assert.equal(progress.expired, true, 'a 410 must be distinguishable from "nothing uploaded yet"');
  });

  test('a completed upload probes as done', async () => {
    const drive = new FakeDrive();
    const client = drive.client();
    const session = await client.start('file-1', 'clip.mov', 8, 'parent');
    await client.chunk(session, Buffer.from('12345678'), 0, 8);
    assert.deepEqual(await client.probe(session, 8), { expired: false, done: true, offset: 8 });
  });
});

describe('sharing', () => {
  test('never quietly narrows a folder that is already open to anyone', async () => {
    const drive = new FakeDrive();
    drive.permissions.set('folder-1', [{ type: 'anyone', role: 'reader' }]);
    await assert.rejects(drive.client().share('folder-1', 'restricted', 'editor@example.com'),
      /already has broader access/);
  });

  test('granting access twice does not stack duplicate permissions', async () => {
    const drive = new FakeDrive();
    const client = drive.client();
    await client.share('folder-1', 'restricted', 'editor@example.com');
    await client.share('folder-1', 'restricted', 'EDITOR@example.com');
    assert.equal(drive.permissions.get('folder-1')!.length, 1, 'email comparison must be case-insensitive');
  });
});
