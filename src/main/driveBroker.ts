import { DriveError } from './drive';
const ENDPOINT = 'https://app.baawaray.com/api/desktop-drive';
export interface BrokerConfig { configured: boolean; clientId: string; scope: string }
export interface BrokerGrant { uid: string; clientId: string; accessToken: string; refreshToken: string; refreshTicket: string; expiresAt: number; email?: string }

export class DriveBroker {
  constructor(private fetcher: typeof fetch = fetch) {}
  private async request(body?: object, idToken?: string): Promise<any> {
    let response: Response;
    try { response = await this.fetcher(ENDPOINT, { method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(60000),
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) }); }
    catch { throw new DriveError('Cannot reach the studio Google connection service. Your upload will retry when the connection returns.', 'retry', 0); }
    const json = await response.json().catch(() => null);
    if (!json || response.status === 404) throw new DriveError('The updated Google sign-in service has not been deployed to the studio website yet.', 'fatal', response.status);
    if (!response.ok) throw new DriveError(typeof json.error === 'string' ? json.error : 'The studio Google connection service refused the request.',
      response.status === 401 || response.status === 403 ? 'auth' : response.status >= 500 || response.status === 429 ? 'retry' : 'fatal', response.status);
    return json;
  }
  async configuration(): Promise<BrokerConfig> {
    const result = await this.request();
    if (typeof result.configured !== 'boolean' || typeof result.clientId !== 'string'
      || (result.configured && !/^[\w.-]+\.apps\.googleusercontent\.com$/.test(result.clientId))) throw new Error('Invalid studio Google configuration.');
    return { configured: result.configured, clientId: result.clientId, scope: 'https://www.googleapis.com/auth/drive.file' };
  }
  async grant(body: object, owner: string, idToken?: string): Promise<BrokerGrant> {
    const result = await this.request(body, idToken) as BrokerGrant;
    if (result.uid !== owner || !result.accessToken || !result.refreshToken || !result.refreshTicket || !Number.isFinite(result.expiresAt)) throw new Error('Google connection does not match the signed-in studio account.');
    return result;
  }
}
