import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DriveBroker } from '../src/main/driveBroker';
import { DriveError } from '../src/main/drive';
import { createDesktopDriveHandler } from '../../WEB APP/api/desktop-drive';
import { brokerSigningKey, issueRefreshTicket, verifyRefreshTicket, isLoopbackRedirect, isPkceVerifier } from '../../WEB APP/api/_lib/desktopDriveProtocol';

const CLIENT = 'studio.apps.googleusercontent.com';
const SECRET = 'server-only-google-secret';
const SIGNING = 'independent-server-signing-key';
const response = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });

function fixture(role: 'owner' | 'partner' | 'editor' | 'stranger' = 'owner') {
  const uid = role + '-uid';
  let active = true;
  const googleCalls: { url: string; body?: URLSearchParams }[] = [];
  const db = { collection: (name: string) => ({
    doc: () => ({ get: async () => ({ data: () => name === 'studio_secrets' ? { clientId: CLIENT, clientSecret: SECRET } : { ownerUid: 'owner-uid' } }) }),
    where: (_field: string, _op: string, value: string) => ({ limit: () => ({ get: async () => ({
      empty: value !== uid || !((role === 'partner' && name === 'freelance_clients') || (role === 'editor' && name === 'team')),
      docs: [{ data: () => ({ active }) }],
    }) }) }),
  }) };
  const handler = createDesktopDriveHandler({
    getDb: (() => db) as any, verifyCallerIdToken: async token => token === 'valid-firebase-token' ? uid : null,
    env: { GOOGLE_DRIVE_BROKER_SIGNING_KEY: SIGNING },
    fetch: async (url, init) => {
      googleCalls.push({ url: String(url), body: init?.body instanceof URLSearchParams ? init.body : undefined });
      return String(url).includes('/token') ? response({ access_token: 'access-' + uid, refresh_token: 'refresh-' + uid, expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/drive.file' }) : response({ user: { emailAddress: role + '@example.com' } });
    },
  });
  async function call(body?: object, token = 'valid-firebase-token', method = body ? 'POST' : 'GET') {
    const output = { status: 200, body: {} as any, headers: {} as Record<string, string> };
    const res = { setHeader: (name: string, value: string) => { output.headers[name] = value; }, status: (code: number) => { output.status = code; return res; }, json: (value: unknown) => { output.body = value; return res; } };
    await handler({ method, body, headers: token ? { authorization: 'Bearer ' + token } : {} } as any, res as any);
    return output;
  }
  return { call, googleCalls, uid, deactivate: () => { active = false; } };
}
const EXCHANGE = { op: 'exchange', code: 'single-use-code', codeVerifier: 'a'.repeat(64), redirectUri: 'http://127.0.0.1:54123' };

test('public app configuration never returns the Google secret', async () => {
  const result = await fixture().call(undefined, '');
  assert.equal(result.status, 200); assert.equal(result.body.clientId, CLIENT);
  assert.equal(JSON.stringify(result.body).includes(SECRET), false);
  assert.equal(result.headers['Cache-Control'], 'no-store');
});
for (const role of ['owner', 'partner', 'editor'] as const) test(role + ' connects an independent Google grant without receiving app credentials', async () => {
  const f = fixture(role); const result = await f.call(EXCHANGE);
  assert.equal(result.status, 200); assert.equal(result.body.uid, f.uid); assert.equal(result.body.email, role + '@example.com');
  assert.equal(result.body.refreshToken, 'refresh-' + f.uid); assert.equal(JSON.stringify(result.body).includes(SECRET), false);
  assert.equal(f.googleCalls[0].body?.get('client_secret'), SECRET);
  assert.equal(f.googleCalls[0].body?.get('code_verifier'), EXCHANGE.codeVerifier);
});
test('anonymous and unrelated studio accounts cannot exchange tokens', async () => {
  for (const token of ['', 'bad-token']) assert.equal((await fixture().call(EXCHANGE, token)).status, 401);
  const f = fixture('stranger'); assert.equal((await f.call(EXCHANGE)).status, 403); assert.equal(f.googleCalls.length, 0);
});
test('refresh works after the Firebase session expires, but only for its bound grant', async () => {
  const f = fixture('partner'); const connected = (await f.call(EXCHANGE)).body;
  const body = { op: 'refresh', refreshToken: connected.refreshToken, refreshTicket: connected.refreshTicket };
  assert.equal((await f.call(body, '')).status, 200);
  assert.equal((await f.call({ ...body, refreshToken: 'someone-elses-token' }, '')).status, 401);
  f.deactivate(); assert.equal((await f.call(body, '')).status, 403);
});
test('legacy admin grants migrate once without distributing the client secret', async () => {
  const f = fixture(); const result = await f.call({ op: 'migrate', refreshToken: 'legacy-grant' });
  assert.equal(result.status, 200); assert.ok(result.body.refreshTicket);
  assert.equal(f.googleCalls[0].body?.get('grant_type'), 'refresh_token');
});
test('redirects and PKCE are constrained before contacting Google', async () => {
  const f = fixture();
  for (const redirectUri of ['https://evil.example', 'http://localhost:5500', 'http://127.0.0.1:5500/evil', 'http://127.0.0.1:5500?x=y', 'http://127.0.0.1.evil.example:5500']) {
    assert.equal((await f.call({ ...EXCHANGE, redirectUri })).status, 400);
  }
  assert.equal((await f.call({ ...EXCHANGE, codeVerifier: 'short' })).status, 400); assert.equal(f.googleCalls.length, 0);
  assert.equal(isLoopbackRedirect(EXCHANGE.redirectUri), true); assert.equal(isPkceVerifier(EXCHANGE.codeVerifier), true);
});
test('refresh tickets reject tampering, other clients, old expiry and OAuth-secret forgery', () => {
  const now = 1700000000000;
  const ticket = issueRefreshTicket('user', CLIENT, 'refresh', SIGNING, now);
  assert.equal(verifyRefreshTicket(ticket, CLIENT, 'refresh', SIGNING, now), 'user');
  assert.equal(verifyRefreshTicket(ticket + 'x', CLIENT, 'refresh', SIGNING, now), null);
  assert.equal(verifyRefreshTicket(ticket, 'other-client', 'refresh', SIGNING, now), null);
  assert.equal(verifyRefreshTicket(ticket, CLIENT, 'refresh', SIGNING, now + 181 * 86400000), null);
  assert.equal(verifyRefreshTicket(issueRefreshTicket('user', CLIENT, 'refresh', SECRET, now), CLIENT, 'refresh', SIGNING, now), null);
  assert.notEqual(brokerSigningKey({ FIREBASE_PRIVATE_KEY: 'server-key' }), SECRET);
});
test('native broker sends no client secret and rejects account mixups', async () => {
  const requests: RequestInit[] = [];
  const broker = new DriveBroker(async (_url, init) => { requests.push(init!); return response({ uid: 'owner', clientId: CLIENT, accessToken: 'a', refreshToken: 'r', refreshTicket: 't', expiresAt: Date.now() + 3600000 }); });
  await broker.grant({ op: 'exchange', code: 'c', codeVerifier: 'v' }, 'owner', 'firebase');
  assert.equal(JSON.stringify(requests).includes('client_secret'), false); assert.equal(JSON.stringify(requests).includes(SECRET), false);
  await assert.rejects(() => broker.grant({ op: 'refresh' }, 'another-owner'), /does not match/);
});
test('native broker distinguishes deployment, connectivity and revoked grants', async () => {
  const missing = new DriveBroker(async () => new Response('<html>not deployed</html>', { status: 404 }));
  await assert.rejects(() => missing.configuration(), /not been deployed/);
  const offline = new DriveBroker(async () => { throw new Error('offline'); });
  await assert.rejects(() => offline.configuration(), (error: any) => error instanceof DriveError && error.kind === 'retry');
  const revoked = new DriveBroker(async () => response({ error: 'Reconnect' }, 401));
  await assert.rejects(() => revoked.grant({ op: 'refresh' }, 'owner'), (error: any) => error.kind === 'auth');
});
