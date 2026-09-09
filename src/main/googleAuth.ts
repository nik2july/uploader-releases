import { safeStorage, shell } from 'electron';
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import { join } from 'node:path';
import type { DriveStatus } from '../shared/contracts';
import { DriveError } from './drive';
import { DriveBroker } from './driveBroker';
import type { BrokerConfig, BrokerGrant } from './driveBroker';
import { log } from './log';

interface Credentials { clientId: string; refreshToken?: string; refreshTicket?: string; accessToken?: string; expiresAt?: number; email?: string }
interface NativeAuthServices { storage: Pick<typeof safeStorage, 'encryptString' | 'decryptString' | 'isEncryptionAvailable'>; openExternal: (url: string) => Promise<void> }
export class GoogleAuth {
  private credentials: Credentials = { clientId: '' };
  private configuration?: BrokerConfig;
  private configurationError = '';
  private filename = '';
  private owner = '';
  private connecting = false;
  private generation = 0;
  private cancelConnect?: () => void;
  private refreshing?: Promise<string>;
  constructor(private directory: string, private broker = new DriveBroker(), private native: NativeAuthServices = { storage: safeStorage, openExternal: url => shell.openExternal(url) }) {}
  async load(owner: string, idToken: string): Promise<void> {
    this.clear(); this.owner = owner;
    const generation = this.generation;
    this.filename = join(this.directory, 'drive-' + createHash('sha256').update(owner).digest('hex') + '.bin');
    try {
      const bytes = await fs.readFile(this.filename);
      if (generation !== this.generation) return;
      const data = JSON.parse(this.native.storage.decryptString(bytes));
      // Never copy the app secret retained by old versions into the new store.
      this.credentials = { clientId: data.clientId || '', refreshToken: data.refreshToken, refreshTicket: data.refreshTicket,
        accessToken: data.accessToken, expiresAt: data.expiresAt, email: data.email };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Cannot unlock saved Drive credentials with this Mac account.');
    }
    await this.refreshConfiguration();
    if (generation !== this.generation) return;
    if (this.configuration?.configured && this.credentials.refreshToken && !this.credentials.refreshTicket
      && this.credentials.clientId === this.configuration.clientId) {
      try { await this.acceptGrant(await this.broker.grant({ op: 'migrate', refreshToken: this.credentials.refreshToken }, owner, idToken), generation); }
      catch (error) { if (generation === this.generation) this.configurationError = error instanceof Error ? error.message : 'Reconnect Google Drive to complete the update.'; }
    }
  }
  clear(): void {
    this.generation++; this.cancelConnect?.(); this.cancelConnect = undefined;
    this.credentials = { clientId: '' }; this.configuration = undefined; this.configurationError = '';
    this.filename = ''; this.owner = ''; this.refreshing = undefined;
  }
  status(): DriveStatus {
    return { configured: Boolean(this.configuration?.configured), connected: Boolean(this.credentials.refreshToken && this.credentials.email),
      clientId: this.configuration?.clientId || this.credentials.clientId, email: this.credentials.email, error: this.configurationError || undefined };
  }
  async refreshConfiguration(): Promise<DriveStatus> {
    const generation = this.generation;
    try {
      const config = await this.broker.configuration();
      if (generation !== this.generation) return this.status();
      this.configuration = config; this.configurationError = '';
      if (this.credentials.refreshToken && this.credentials.clientId !== config.clientId && config.configured)
        this.configurationError = 'The studio Google client changed. Reconnect your Drive account; saved uploads are preserved.';
    } catch (error) { if (generation === this.generation) this.configurationError = error instanceof Error ? error.message : 'Cannot load studio Google configuration.'; }
    return this.status();
  }
  private async save(): Promise<void> {
    if (!this.filename) throw new Error('Sign in to the studio before connecting Drive.');
    if (!this.native.storage.isEncryptionAvailable()) throw new Error('macOS could not open the keychain. Unlock your Mac and restart the app.');
    const filename = this.filename;
    await fs.writeFile(filename + '.tmp', this.native.storage.encryptString(JSON.stringify(this.credentials)), { mode: 0o600 });
    await fs.rename(filename + '.tmp', filename);
  }
  async disconnect(): Promise<DriveStatus> {
    this.generation++; this.cancelConnect?.(); this.cancelConnect = undefined;
    this.credentials = { clientId: this.configuration?.clientId || '' };
    await this.save(); return this.status();
  }
  private async acceptGrant(grant: BrokerGrant, generation: number): Promise<void> {
    if (generation !== this.generation || grant.uid !== this.owner) throw new Error('Studio account changed during Google sign-in.');
    const previous = this.credentials;
    this.credentials = { clientId: grant.clientId, accessToken: grant.accessToken, refreshToken: grant.refreshToken,
      refreshTicket: grant.refreshTicket, expiresAt: grant.expiresAt, email: grant.email || this.credentials.email };
    try { await this.save(); }
    catch (error) { if (generation === this.generation) this.credentials = previous; throw error; }
    if (generation !== this.generation) throw new Error('Studio account changed during Google sign-in.');
    this.configurationError = '';
  }
  async token(force = false): Promise<string> {
    if (!force && this.credentials.accessToken && (this.credentials.expiresAt || 0) > Date.now() + 60000) return this.credentials.accessToken;
    if (!this.credentials.refreshToken || !this.credentials.refreshTicket) throw new DriveError('Connect Google Drive to finish the one-time sign-in update.', 'auth', 401);
    if (this.refreshing) return this.refreshing;
    const generation = this.generation;
    const owner = this.owner;
    const refreshing = (async () => {
      const grant = await this.broker.grant({ op: 'refresh', refreshToken: this.credentials.refreshToken, refreshTicket: this.credentials.refreshTicket }, owner);
      await this.acceptGrant(grant, generation); return grant.accessToken;
    })();
    this.refreshing = refreshing;
    try { return await refreshing; } finally { if (this.refreshing === refreshing) this.refreshing = undefined; }
  }
  async connect(idToken: string): Promise<DriveStatus> {
    if (this.connecting) throw new Error('Google sign-in is already open.');
    if (!this.owner || typeof idToken !== 'string' || !idToken) throw new Error('Sign in to the studio first.');
    await this.refreshConfiguration();
    if (this.connecting) throw new Error('Google sign-in is already open.');
    if (!this.configuration?.configured) throw new Error(this.configurationError || 'The studio administrator needs to complete Google Drive setup once.');
    this.connecting = true;
    const generation = this.generation;
    const owner = this.owner;
    const clientId = this.configuration.clientId;
    const verifier = randomBytes(48).toString('base64url');
    const state = randomBytes(32).toString('base64url');
    const server = createServer();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Cannot start Google sign-in callback.');
      const redirect = 'http://127.0.0.1:' + address.port;
      const codePromise = new Promise<string>((resolve, reject) => {
        this.cancelConnect = () => reject(new Error('Google sign-in cancelled because the studio session changed.'));
        timeout = setTimeout(() => reject(new Error('Google sign-in timed out. Try connecting again.')), 5 * 60000);
        server.on('request', (req, res) => {
          const url = new URL(req.url || '/', redirect);
          if (req.method !== 'GET' || url.pathname !== '/' || url.searchParams.get('state') !== state) { res.writeHead(400); res.end('Invalid callback.'); return; }
          const code = url.searchParams.get('code');
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(code ? 'Google sign-in received. Return to Baawaray to finish connecting.' : 'Google access was not granted. You can close this tab.');
          if (code) resolve(code); else reject(new Error('Google access was not granted.'));
        });
      });
      void codePromise.catch(() => {});
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code',
        scope: 'https://www.googleapis.com/auth/drive.file', access_type: 'offline', prompt: 'consent', state,
        code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
      log('connect: opening Google sign-in');
      await this.native.openExternal(url.toString());
      const code = await codePromise;
      const grant = await this.broker.grant({ op: 'exchange', code, codeVerifier: verifier, redirectUri: redirect }, owner, idToken);
      await this.acceptGrant(grant, generation);
      log('connect: personal Drive connected'); return this.status();
    } finally {
      if (timeout) clearTimeout(timeout);
      server.closeAllConnections(); server.close(); this.cancelConnect = undefined; this.connecting = false;
    }
  }
}
