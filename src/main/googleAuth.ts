import { safeStorage, shell } from 'electron';
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import { join } from 'node:path';
import type { DriveStatus } from '../shared/contracts';
import { DriveError } from './drive';

interface Credentials { clientId: string; clientSecret?: string; refreshToken?: string; accessToken?: string; expiresAt?: number; email?: string }
export class GoogleAuth {
  private credentials: Credentials = { clientId: '' };
  private filename = '';
  private connecting = false;
  constructor(private directory: string) {}
  async load(owner: string): Promise<void> {
    this.credentials = { clientId: '' };
    this.filename = join(this.directory, `drive-${createHash('sha256').update(owner).digest('hex')}.bin`);
    try {
      const data = await fs.readFile(this.filename);
      this.credentials = JSON.parse(safeStorage.decryptString(data));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Cannot unlock saved Drive credentials with this Mac account.');
    }
  }
  clear(): void { this.credentials = { clientId: '' }; this.filename = ''; }
  status(): DriveStatus { return { configured: !!this.credentials.clientId, connected: !!this.credentials.refreshToken,
    clientId: this.credentials.clientId, email: this.credentials.email }; }
  private async save(): Promise<void> {
    if (!this.filename || !safeStorage.isEncryptionAvailable()) throw new Error('Secure credential storage is unavailable.');
    await fs.writeFile(this.filename + '.tmp', safeStorage.encryptString(JSON.stringify(this.credentials)), { mode: 0o600 });
    await fs.rename(this.filename + '.tmp', this.filename);
  }
  async configure(clientId: string, clientSecret: string): Promise<DriveStatus> {
    if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId.trim())) throw new Error('Enter a Google OAuth Desktop app client ID.');
    if (this.connecting) throw new Error('Finish the current Google sign-in first.');
    this.credentials = { clientId: clientId.trim(), clientSecret: clientSecret.trim() };
    await this.save(); return this.status();
  }
  async disconnect(): Promise<DriveStatus> {
    if (this.connecting) throw new Error('Finish the current Google sign-in first.');
    // Local disconnect only; do not revoke other devices using this OAuth client.
    this.credentials = { clientId: this.credentials.clientId, clientSecret: this.credentials.clientSecret };
    await this.save(); return this.status();
  }
  private async exchange(params: Record<string, string>): Promise<void> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', signal: AbortSignal.timeout(30000),
      body: new URLSearchParams({ client_id: this.credentials.clientId,
        ...(this.credentials.clientSecret ? { client_secret: this.credentials.clientSecret } : {}), ...params }) });
    const body = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!response.ok || !body.access_token) throw new DriveError('Google sign-in expired or the OAuth client is not configured correctly. Reconnect Drive.', 'auth', response.status);
    this.credentials.accessToken = body.access_token;
    this.credentials.refreshToken = body.refresh_token ?? this.credentials.refreshToken;
    this.credentials.expiresAt = Date.now() + (body.expires_in || 3600) * 1000;
    await this.save();
  }
  async token(force = false): Promise<string> {
    if (!force && this.credentials.accessToken && (this.credentials.expiresAt || 0) > Date.now() + 60000) return this.credentials.accessToken;
    if (!this.credentials.refreshToken) throw new DriveError('Connect Google Drive in Settings.', 'auth', 401);
    await this.exchange({ grant_type: 'refresh_token', refresh_token: this.credentials.refreshToken });
    return this.credentials.accessToken!;
  }
  async connect(): Promise<DriveStatus> {
    if (!this.credentials.clientId) throw new Error('Configure a Google OAuth Desktop app client first.');
    if (this.connecting) throw new Error('Google sign-in is already open.');
    this.connecting = true;
    const verifier = randomBytes(48).toString('base64url');
    const state = randomBytes(32).toString('base64url');
    const server = createServer();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Cannot start Google sign-in callback.');
      const redirect = `http://127.0.0.1:${address.port}`;
      const codePromise = new Promise<string>((resolve, reject) => {
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
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({ client_id: this.credentials.clientId, redirect_uri: redirect,
        response_type: 'code', scope: 'https://www.googleapis.com/auth/drive.file', access_type: 'offline', prompt: 'consent',
        state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
      await shell.openExternal(url.toString()).catch(() => { throw new Error('Could not open the Google sign-in browser.'); });
      const code = await codePromise;
      await this.exchange({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirect });
      const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', {
        headers: { Authorization: `Bearer ${await this.token()}` }, signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error('Drive API is unavailable. Check that it is enabled for this OAuth project.');
      const about = await response.json() as { user: { emailAddress: string } };
      this.credentials.email = about.user.emailAddress;
      if (!this.credentials.refreshToken || !this.credentials.email) throw new Error('Google did not grant offline Drive access.');
      await this.save(); return this.status();
    } finally {
      if (timeout) clearTimeout(timeout);
      server.close(); this.connecting = false;
    }
  }
}
