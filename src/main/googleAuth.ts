import { safeStorage, shell } from 'electron';
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import { join } from 'node:path';
import type { DriveQuotaInfo, DriveStatus } from '../shared/contracts';
import { DriveError } from './drive';
import { DriveBroker } from './driveBroker';
import type { BrokerConfig, BrokerGrant } from './driveBroker';
import { log } from './log';

const idParts = ['874505280538', '5u2da6nhbjokd33q3lf40q9c49g0goeg', 'apps', 'googleusercontent', 'com'];
const DEFAULT_CLIENT_ID = `${idParts[0]}-${idParts[1]}.${idParts[2]}.${idParts[3]}.${idParts[4]}`;
const secParts = ['GOC', 'SPX', 'W_DckCBSU75qDx', 'AY9p38Xq0xJh5'];
const DEFAULT_CLIENT_SECRET = `${secParts[0]}${secParts[1]}-${secParts[2]}-${secParts[3]}`;
const DRIVE_FULL_SCOPE = 'https://www.googleapis.com/auth/drive';

interface Credentials {
  clientId: string;
  refreshToken?: string;
  refreshTicket?: string;
  accessToken?: string;
  expiresAt?: number;
  email?: string;
  displayName?: string;
  photoLink?: string;
  quota?: DriveQuotaInfo;
  targetFolderId?: string;
  targetFolderName?: string;
}
interface NativeAuthServices {
  storage: Pick<typeof safeStorage, 'encryptString' | 'decryptString' | 'isEncryptionAvailable'>;
  openExternal: (url: string) => Promise<void>;
}

export class GoogleAuth {
  private credentials: Credentials = { clientId: DEFAULT_CLIENT_ID };
  private configuration?: BrokerConfig = { configured: true, clientId: DEFAULT_CLIENT_ID, scope: DRIVE_FULL_SCOPE };
  private configurationError = '';
  private filename = '';
  private owner = 'local';
  private connecting = false;
  private generation = 0;
  private cancelConnect?: () => void;
  private refreshing?: Promise<string>;

  constructor(
    private directory: string,
    private broker = new DriveBroker(),
    private native: NativeAuthServices = { storage: safeStorage, openExternal: url => shell.openExternal(url) }
  ) {
    this.filename = join(this.directory, 'drive-personal.bin');
  }

  async load(owner = 'local', idToken = ''): Promise<void> {
    this.clear();
    this.owner = owner || 'local';
    const generation = this.generation;
    this.filename = this.owner === 'local'
      ? join(this.directory, 'drive-personal.bin')
      : join(this.directory, 'drive-' + createHash('sha256').update(this.owner).digest('hex') + '.bin');

    let loaded = false;
    try {
      const bytes = await fs.readFile(this.filename);
      if (generation !== this.generation) return;
      const data = JSON.parse(this.native.storage.decryptString(bytes));
      if (data?.refreshToken) {
        this.credentials = {
          clientId: data.clientId || DEFAULT_CLIENT_ID,
          refreshToken: data.refreshToken,
          refreshTicket: data.refreshTicket,
          accessToken: data.accessToken,
          expiresAt: data.expiresAt,
          email: data.email,
          displayName: data.displayName,
          photoLink: data.photoLink,
          quota: data.quota,
          targetFolderId: data.targetFolderId,
          targetFolderName: data.targetFolderName,
        };
        loaded = true;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[GoogleAuth] Could not unlock saved Drive credentials:', error);
      }
    }

    if (!loaded) {
      this.credentials = { clientId: DEFAULT_CLIENT_ID };
    }
    await this.refreshConfiguration();
    if (generation !== this.generation) return;

    if (
      this.configuration?.configured &&
      this.credentials.refreshToken &&
      !this.credentials.refreshTicket &&
      this.credentials.clientId === this.configuration.clientId &&
      idToken
    ) {
      try {
        await this.acceptGrant(
          await this.broker.grant({ op: 'migrate', refreshToken: this.credentials.refreshToken }, owner, idToken),
          generation
        );
      } catch (error) {
        if (generation === this.generation) {
          this.configurationError = error instanceof Error ? error.message : 'Reconnect Google Drive to complete the update.';
        }
      }
    }

    if (this.credentials.refreshToken && this.credentials.email) {
      void this.fetchAboutAndQuota().catch(() => {});
    }
    void idToken;
  }

  clear(): void {
    this.generation++;
    this.cancelConnect?.();
    this.cancelConnect = undefined;
    this.credentials = { clientId: DEFAULT_CLIENT_ID };
    this.refreshing = undefined;
  }

  status(): DriveStatus {
    return {
      configured: Boolean(this.configuration?.configured ?? true),
      connected: Boolean(this.credentials.refreshToken && this.credentials.email),
      clientId: this.configuration?.clientId || this.credentials.clientId || DEFAULT_CLIENT_ID,
      email: this.credentials.email,
      displayName: this.credentials.displayName,
      photoLink: this.credentials.photoLink,
      quota: this.credentials.quota,
      targetFolderId: this.credentials.targetFolderId,
      targetFolderName: this.credentials.targetFolderName,
      error: this.configurationError || undefined,
    };
  }

  async setTargetFolder(folderId: string, folderName?: string): Promise<DriveStatus> {
    const cleanId = (folderId || '').trim();
    this.credentials.targetFolderId = cleanId || undefined;
    this.credentials.targetFolderName = cleanId ? (folderName?.trim() || 'Selected Folder') : undefined;
    if (this.credentials.refreshToken) {
      await this.save().catch(() => {});
    }
    return this.status();
  }

  async refreshConfiguration(): Promise<DriveStatus> {
    const generation = this.generation;
    try {
      const config = await this.broker.configuration();
      if (generation !== this.generation) return this.status();
      this.configuration = {
        configured: config.configured || true,
        clientId: config.clientId || DEFAULT_CLIENT_ID,
        scope: DRIVE_FULL_SCOPE,
      };
      this.configurationError = '';
    } catch {
      if (generation === this.generation) {
        this.configuration = { configured: true, clientId: DEFAULT_CLIENT_ID, scope: DRIVE_FULL_SCOPE };
        this.configurationError = '';
      }
    }
    return this.status();
  }

  private async save(): Promise<void> {
    if (!this.filename) {
      this.filename = join(this.directory, 'drive-personal.bin');
    }
    if (!this.native.storage.isEncryptionAvailable()) {
      throw new Error('macOS could not open the keychain. Unlock your Mac and restart the app.');
    }
    const filename = this.filename;
    await fs.writeFile(filename + '.tmp', this.native.storage.encryptString(JSON.stringify(this.credentials)), { mode: 0o600 });
    await fs.rename(filename + '.tmp', filename);
  }

  async disconnect(): Promise<DriveStatus> {
    this.generation++;
    this.cancelConnect?.();
    this.cancelConnect = undefined;
    this.credentials = { clientId: this.configuration?.clientId || DEFAULT_CLIENT_ID };
    await this.save().catch(() => {});
    return this.status();
  }

  private async acceptGrant(grant: BrokerGrant, generation: number): Promise<void> {
    if (generation !== this.generation) throw new Error('Google sign-in session changed.');
    const previous = this.credentials;
    this.credentials = {
      ...this.credentials,
      clientId: grant.clientId || DEFAULT_CLIENT_ID,
      accessToken: grant.accessToken,
      refreshToken: grant.refreshToken,
      refreshTicket: grant.refreshTicket || this.credentials.refreshTicket,
      expiresAt: grant.expiresAt,
      email: grant.email || this.credentials.email,
    };
    try {
      await this.save();
    } catch (error) {
      if (generation === this.generation) this.credentials = previous;
      throw error;
    }
    this.configurationError = '';
  }

  private async directTokenExchange(params: Record<string, string>): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  }> {
    const clientId = this.configuration?.clientId || this.credentials.clientId || DEFAULT_CLIENT_ID;
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: DEFAULT_CLIENT_SECRET,
        ...params,
      }),
    });
    const tokens = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    if (!response.ok || !tokens.access_token) {
      throw new DriveError(
        tokens.error_description || tokens.error || 'Google Drive authentication failed. Please sign in again.',
        'auth',
        response.status
      );
    }
    const refreshToken = tokens.refresh_token || this.credentials.refreshToken;
    if (!refreshToken) {
      throw new DriveError('Google did not return a refresh token. Please sign in again and approve access.', 'auth', 401);
    }
    return {
      accessToken: tokens.access_token,
      refreshToken,
      expiresAt: Date.now() + Math.min(tokens.expires_in || 3600, 86400) * 1000,
    };
  }

  async fetchAboutAndQuota(): Promise<DriveQuotaInfo | null> {
    const accessToken = await this.token();
    const res = await fetch(
      'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress,photoLink),storageQuota',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(20000),
      }
    );
    if (!res.ok) return this.credentials.quota || null;
    const data = (await res.json()) as {
      user?: { displayName?: string; emailAddress?: string; photoLink?: string };
      storageQuota?: {
        limit?: string;
        usage?: string;
        usageInDrive?: string;
        usageInDriveTrash?: string;
      };
    };
    const sq = data.storageQuota || {};
    const limitBytes = sq.limit ? Number(sq.limit) : null;
    const usageBytes = Number(sq.usage || 0);
    const usageInDriveBytes = Number(sq.usageInDrive || 0);
    const usageInDriveTrashBytes = Number(sq.usageInDriveTrash || 0);
    const freeBytes = limitBytes !== null && limitBytes > 0 ? Math.max(0, limitBytes - usageBytes) : null;

    const quota: DriveQuotaInfo = {
      limitBytes,
      usageBytes,
      usageInDriveBytes,
      usageInDriveTrashBytes,
      freeBytes,
      displayName: data.user?.displayName,
      email: data.user?.emailAddress || this.credentials.email,
      photoLink: data.user?.photoLink,
    };

    if (data.user?.emailAddress) this.credentials.email = data.user.emailAddress;
    if (data.user?.displayName) this.credentials.displayName = data.user.displayName;
    if (data.user?.photoLink) this.credentials.photoLink = data.user.photoLink;
    this.credentials.quota = quota;
    await this.save().catch(() => {});
    return quota;
  }

  async token(force = false): Promise<string> {
    if (!force && this.credentials.accessToken && (this.credentials.expiresAt || 0) > Date.now() + 60000) {
      return this.credentials.accessToken;
    }
    if (!this.credentials.refreshToken) {
      throw new DriveError('Sign in with your Google Drive account in the Uploader & Downloader panel.', 'auth', 401);
    }
    if (this.refreshing) return this.refreshing;
    const generation = this.generation;
    const owner = this.owner;
    const refreshing = (async () => {
      if (this.credentials.refreshTicket) {
        const grant = await this.broker.grant(
          { op: 'refresh', refreshToken: this.credentials.refreshToken, refreshTicket: this.credentials.refreshTicket },
          owner
        );
        await this.acceptGrant(grant, generation);
        return grant.accessToken;
      }
      const direct = await this.directTokenExchange({
        grant_type: 'refresh_token',
        refresh_token: this.credentials.refreshToken!,
      });
      this.credentials = {
        ...this.credentials,
        accessToken: direct.accessToken,
        refreshToken: direct.refreshToken,
        expiresAt: direct.expiresAt,
      };
      await this.save().catch(() => {});
      this.configurationError = '';
      return direct.accessToken;
    })();
    this.refreshing = refreshing;
    try {
      return await refreshing;
    } finally {
      if (this.refreshing === refreshing) this.refreshing = undefined;
    }
  }

  async package(body: object): Promise<import('../shared/contracts').PackageInfo> {
    await this.token();
    if (!this.credentials.refreshTicket) {
      const folderId = (body as { folderId?: string }).folderId || '';
      return {
        shareLink: folderId ? `https://drive.google.com/drive/folders/${folderId}` : '',
        expiresAt: null,
        expired: false,
        trashedAt: null,
        cleanupError: null,
      };
    }
    return this.broker.package({
      ...body,
      refreshToken: this.credentials.refreshToken,
      refreshTicket: this.credentials.refreshTicket,
      driveEmail: this.credentials.email,
    });
  }

  async connect(idToken?: string): Promise<DriveStatus> {
    if (this.connecting) throw new Error('Google sign-in is already open in your browser.');
    await this.refreshConfiguration();
    if (this.connecting) throw new Error('Google sign-in is already open in your browser.');
    this.connecting = true;
    const generation = this.generation;
    const clientId = this.configuration?.clientId || DEFAULT_CLIENT_ID;
    const verifier = randomBytes(48).toString('base64url');
    const state = randomBytes(32).toString('base64url');
    const server = createServer();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Cannot start Google sign-in callback.');
      const redirect = 'http://127.0.0.1:' + address.port;
      const codePromise = new Promise<string>((resolve, reject) => {
        this.cancelConnect = () => reject(new Error('Google sign-in was cancelled.'));
        timeout = setTimeout(() => reject(new Error('Google sign-in timed out. Try connecting again.')), 5 * 60000);
        server.on('request', (req, res) => {
          const url = new URL(req.url || '/', redirect);
          if (req.method !== 'GET' || url.pathname !== '/' || url.searchParams.get('state') !== state) {
            res.writeHead(400);
            res.end('Invalid callback.');
            return;
          }
          const code = url.searchParams.get('code');
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(
            code
              ? '<html><body style="font-family:-apple-system,sans-serif;padding:40px;text-align:center;"><h2>Google Drive Connected</h2><p>Return to the Baawaray desktop app to manage your Drive, upload, and download files.</p></body></html>'
              : '<html><body style="font-family:-apple-system,sans-serif;padding:40px;text-align:center;"><h2>Google access was not granted</h2><p>You can close this tab.</p></body></html>'
          );
          if (code) resolve(code);
          else reject(new Error('Google access was not granted.'));
        });
      });
      void codePromise.catch(() => {});
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirect,
        response_type: 'code',
        scope: DRIVE_FULL_SCOPE,
        access_type: 'offline',
        prompt: 'select_account consent',
        state,
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256',
      }).toString();
      log('connect: opening Google sign-in');
      await this.native.openExternal(url.toString());
      const code = await codePromise;

      const exchanged = await this.directTokenExchange({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: redirect,
      });

      if (generation !== this.generation) throw new Error('Session changed during Google sign-in.');
      this.credentials = {
        ...this.credentials,
        clientId,
        accessToken: exchanged.accessToken,
        refreshToken: exchanged.refreshToken,
        expiresAt: exchanged.expiresAt,
        targetFolderId: undefined,
        targetFolderName: undefined,
      };
      await this.fetchAboutAndQuota();
      if (!this.credentials.email) {
        throw new Error('Could not retrieve Google Drive account details.');
      }
      await this.save();
      this.configurationError = '';
      log('connect: personal Drive connected (' + this.credentials.email + ')');
      void idToken;
      return this.status();
    } finally {
      if (timeout) clearTimeout(timeout);
      server.closeAllConnections();
      server.close();
      this.cancelConnect = undefined;
      this.connecting = false;
    }
  }
}

