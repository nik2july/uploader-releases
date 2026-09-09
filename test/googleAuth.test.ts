import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { GoogleAuth } from '../src/main/googleAuth';
import { DriveBroker } from '../src/main/driveBroker';

test('personal credentials migrate, survive restart, refresh once and stay isolated', async () => {
  const dir = await fs.mkdtemp(join(tmpdir(), 'baawaray-auth-test-'));
  const file = join(dir, 'drive-' + createHash('sha256').update('owner').digest('hex') + '.bin');
  const calls: any[] = [];
  const broker = new DriveBroker(async (_url, init) => {
    if (!init?.body) return new Response(JSON.stringify({ configured: true, clientId: 'client.apps.googleusercontent.com', scope: 'https://www.googleapis.com/auth/drive.file' }));
    const body = JSON.parse(String(init.body)); calls.push({ body, headers: init.headers });
    return new Response(JSON.stringify({ uid: 'owner', clientId: 'client.apps.googleusercontent.com', accessToken: 'fresh', refreshToken: 'personal', refreshTicket: 'ticket', expiresAt: Date.now() + 3600000, email: 'owner@example.com' }));
  });
  const native = { storage: { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() }, openExternal: async () => {} };
  try {
    await fs.writeFile(file, JSON.stringify({ clientId: 'client.apps.googleusercontent.com', clientSecret: 'legacy-app-secret', refreshToken: 'personal', email: 'owner@example.com' }));
    const auth = new GoogleAuth(dir, broker, native);
    await auth.load('owner', 'firebase');
    assert.equal(calls[0].body.op, 'migrate');
    assert.equal((await fs.readFile(file, 'utf8')).includes('legacy-app-secret'), false);
    const restarted = new GoogleAuth(dir, broker, native);
    await restarted.load('owner', 'firebase');
    assert.equal(restarted.status().connected, true);
    await Promise.all([restarted.token(true), restarted.token(true)]);
    assert.equal(calls.filter(c => c.body.op === 'refresh').length, 1);
    assert.equal(new Headers(calls.at(-1).headers).has('Authorization'), false);
    await restarted.load('other-owner', 'other-firebase');
    assert.equal(restarted.status().connected, false);
    assert.equal(restarted.status().email, undefined);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
