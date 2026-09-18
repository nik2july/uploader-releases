export interface DriveFile { id: string; size?: string; md5Checksum?: string; name?: string; trashed?: boolean; mimeType?: string; parents?: string[] }
export class DriveError extends Error {
  constructor(message: string, readonly kind: 'auth' | 'quota' | 'retry' | 'fatal', readonly status: number) { super(message); }
}

export function acknowledgedOffset(range: string | null, size: number): number {
  if (!range) return 0;
  const match = /^bytes=0-(\d+)$/.exec(range);
  const end = match ? Number(match[1]) : NaN;
  if (!Number.isSafeInteger(end) || end < 0 || end >= size) throw new Error('Invalid acknowledged upload range.');
  return end + 1;
}

export class DriveClient {
  constructor(private token: (refresh?: boolean) => Promise<string>, private fetcher: typeof fetch = fetch) {}
  async request(url: string, init: RequestInit = {}, accept: number[] = []): Promise<Response> {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'www.googleapis.com' || !/^\/(upload\/)?drive\/v3\//.test(parsed.pathname)) throw new Error('Untrusted Drive endpoint.');
    for (let attempt = 0; attempt < 2; attempt++) {
      let response: Response;
      try {
        const token = await this.token(attempt > 0);
        response = await this.fetcher(url, { ...init, redirect: 'manual',
          signal: AbortSignal.any([AbortSignal.timeout(120000), ...(init.signal ? [init.signal] : [])]),
          headers: { ...init.headers, Authorization: `Bearer ${token}` } });
      } catch (error) {
        if (init.signal?.aborted) throw error;
        if (error instanceof DriveError) throw error;
        throw new DriveError('Connection interrupted. Progress is saved; the upload will retry.', 'retry', 0);
      }
      if (response.ok || accept.includes(response.status)) return response;
      if (response.status === 401 && attempt === 0) continue;
      const body = await response.json().catch(() => ({})) as { error?: { message?: string; errors?: { reason: string }[] } };
      const reason = body.error?.errors?.map(e => e.reason).join(' ') || '';
      const message = body.error?.message || `Drive request failed (${response.status}).`;
      const kind = response.status === 401 ? 'auth'
        : /storageQuotaExceeded/.test(reason) ? 'fatal'
        : /dailyLimitExceeded|uploadLimitExceeded/i.test(reason) || /daily.*limit|upload.*limit.*exceeded/i.test(message) ? 'quota'
        : response.status === 429 || response.status >= 500 || /rateLimitExceeded|userRateLimitExceeded/i.test(reason) ? 'retry' : 'fatal';
      throw new DriveError(message, kind, response.status);
    }
    throw new DriveError('Reconnect Google Drive.', 'auth', 401);
  }
  async generateId(signal?: AbortSignal): Promise<string> {
    const response = await this.request('https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files', { signal });
    return (await response.json() as { ids: string[] }).ids[0];
  }
  async metadata(id: string, signal?: AbortSignal): Promise<DriveFile | null> {
    const response = await this.request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,size,md5Checksum,name,trashed,mimeType,parents&supportsAllDrives=true`, { signal }, [404]);
    return response.status === 404 ? null : await response.json() as DriveFile;
  }
  async ensureFolder(id: string, name: string, parent: string | undefined, signal?: AbortSignal): Promise<void> {
    const existing = await this.metadata(id, signal);
    if (existing) {
      if (existing.mimeType !== 'application/vnd.google-apps.folder') {
        throw new Error('A destination folder was moved or removed. Review it before continuing.');
      }
      if (existing.trashed) {
        await this.request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?supportsAllDrives=true`, {
          method: 'PATCH', signal, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trashed: false })
        }, [200]).catch(() => {
          throw new Error('A destination folder was moved or removed. Review it before continuing.');
        });
      }
      return;
    }
    await this.request('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', { method: 'POST', signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, name, mimeType: 'application/vnd.google-apps.folder', ...(parent ? { parents: [parent] } : {}) }) }, [409]);
  }
  async start(id: string, name: string, size: number, parent: string, signal?: AbortSignal): Promise<string> {
    const response = await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,size,md5Checksum&supportsAllDrives=true', {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'X-Upload-Content-Type': 'application/octet-stream', 'X-Upload-Content-Length': String(size) },
      body: JSON.stringify({ id, name, parents: [parent] }) });
    const session = response.headers.get('location');
    if (!session) throw new Error('Drive did not return a resumable upload session.');
    const url = new URL(session);
    if (url.protocol !== 'https:' || url.hostname !== 'www.googleapis.com' || !url.pathname.startsWith('/upload/drive/v3/')) throw new Error('Untrusted upload session.');
    return session;
  }
  async probe(session: string, size: number, signal?: AbortSignal): Promise<{ expired: boolean; done: boolean; offset: number }> {
    const res = await this.request(session, { method: 'PUT', signal, headers: { 'Content-Length': '0', 'Content-Range': `bytes */${size}` } }, [308, 404, 410]);
    return { expired: [404, 410].includes(res.status), done: res.ok, offset: res.status === 308 ? acknowledgedOffset(res.headers.get('range'), size) : res.ok ? size : 0 };
  }
  async chunk(session: string, buffer: Uint8Array, offset: number, size: number, signal?: AbortSignal): Promise<{ done: boolean; offset: number }> {
    const res = await this.request(session, { method: 'PUT', signal, headers: { 'Content-Type': 'application/octet-stream',
      'Content-Length': String(buffer.length), 'Content-Range': size === 0 ? 'bytes */0' : `bytes ${offset}-${offset + buffer.length - 1}/${size}` }, body: buffer as BodyInit }, [308]);
    return { done: res.ok, offset: res.ok ? size : acknowledgedOffset(res.headers.get('range'), size) };
  }
  async share(id: string, mode: 'restricted' | 'anyone', email: string): Promise<void> {
    const existing = await this.request(`https://www.googleapis.com/drive/v3/files/${id}/permissions?fields=permissions(id,type,role,emailAddress)&supportsAllDrives=true`);
    const permissions = (await existing.json() as { permissions: { type: string; role: string; emailAddress?: string }[] }).permissions;
    if (mode === 'restricted' && permissions.some(p => p.type === 'anyone' || p.type === 'domain')) throw new Error('This folder already has broader access. Review its permissions in Drive before sharing as restricted.');
    if (permissions.some(p => mode === 'anyone' ? p.type === 'anyone' : p.type === 'user' && p.emailAddress?.toLowerCase() === email.toLowerCase())) return;
    await this.request(`https://www.googleapis.com/drive/v3/files/${id}/permissions?supportsAllDrives=true&sendNotificationEmail=false`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: mode === 'anyone' ? 'anyone' : 'user', ...(mode === 'restricted' ? { emailAddress: email } : {}) }) });
  }
  async delete(id: string, signal?: AbortSignal): Promise<void> {
    await this.request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?supportsAllDrives=true`, { method: 'DELETE', signal }, [204, 404]);
  }
}
