import { useEffect, useState } from 'react';
import { Copy, ExternalLink, MessageCircle, Share2 } from 'lucide-react';
import type { PackageInfo, Transfer } from '../../../../shared/contracts';
import { useApp } from '../../context/AppContext';
import { attachVerifiedTransfer } from '../../lib/studioRepository';
import { editorMessage, whatsappUrl } from '../../utils/editorMessage';

function localDate(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function ShareActions({ job, refresh }: { job: Transfer; refresh: () => Promise<void> }): React.JSX.Element {
  const studio = useApp();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [email, setEmail] = useState(job.target?.recipientEmail || '');
  const [expiry, setExpiry] = useState(localDate(job.expiresAt));
  const [info, setInfo] = useState<PackageInfo | null>(null);
  const [now, setNow] = useState(Date.now());
  const savedExpiry = info ? info.expiresAt : job.expiresAt;
  const expired = Boolean(info?.expired || job.trashedAt || (savedExpiry && Date.parse(savedExpiry) <= now));
  useEffect(() => {
    let disposed = false;
    const check = async (): Promise<void> => {
      setNow(Date.now());
      try {
        const current = await window.api.packageInfo(job.id);
        if (!disposed) { setInfo(current); setError(''); }
      } catch (err) { if (!disposed) setError(err instanceof Error ? err.message : 'Could not refresh the package link.'); }
    };
    void check();
    const timer = setInterval(() => void check(), 60000);
    return () => { disposed = true; clearInterval(timer); };
  }, [job.id]);
  useEffect(() => { setExpiry(localDate(info ? info.expiresAt : job.expiresAt)); }, [info?.expiresAt, job.expiresAt]);
  async function run(fn: () => Promise<void>, success: string): Promise<void> {
    setBusy(true); setError(''); setNote('');
    try { await fn(); await refresh(); setNote(success); }
    catch (err) { setError(err instanceof Error ? err.message : 'That did not complete.'); }
    finally { setBusy(false); }
  }
  async function copy(link: string): Promise<void> {
    if (!await window.api.copyToClipboard(link)) throw new Error('Could not copy the link.');
  }
  async function currentLink(): Promise<string> {
    const current = await window.api.packageInfo(job.id); setInfo(current);
    if (current.expired) throw new Error('This package link has expired.');
    return current.shareLink;
  }
  return <>
    <div className="actions">
      <button className="primary" disabled={busy || expired || !job.link} onClick={() => void run(async () => copy(await currentLink()), job.shared ? 'Link copied.' : 'Private link copied. Grant your editor access before sending it.')}><Copy size={15} />Copy link</button>
      <button disabled={busy || expired || !job.link} onClick={() => void run(async () => {
        await copy(await window.api.share(job.id, 'anyone', ''));
      }, 'Anyone with this link can view and download until its expiry. Link copied.')}><Share2 size={15} />Create share link & copy</button>
      <button disabled={busy || expired || !job.link} onClick={() => void run(async () => window.api.openExternal(await currentLink()), '')}><ExternalLink size={15} />Open link</button>
      <button disabled={busy || expired || !job.shared} onClick={() => void run(async () => {
        const link = await currentLink();
        const message = editorMessage({ ...job, shareLink: link, expiresAt: info ? info.expiresAt : job.expiresAt }, studio.studioSettings?.studioName || 'Baawaray Films');
        await window.api.openExternal(whatsappUrl(message, job.target?.recipientPhone));
        await window.api.markMessagePrepared(job.id);
      }, 'WhatsApp message prepared. Press Send in WhatsApp to send it.')}><MessageCircle size={15} />Share with team / editor</button>
      {job.target && job.target.kind !== 'team' && <button disabled={busy || expired || job.synced} onClick={() => void run(async () => {
        await attachVerifiedTransfer(job); await window.api.markSynced(job.id);
      }, 'Link saved onto the job in Studio OS.')}>{job.synced ? 'Saved to Studio OS' : 'Save link to Studio OS'}</button>}
    </div>
    <p className="muted">{job.sharing === 'anyone' ? 'Anyone with the link can view and download.' : job.shared ? 'Access granted to a Google account. Other team members need their own access.' : 'Private package. Create a share link or grant your editor access below.'}</p>
    <div className="actions">
      <input type="email" aria-label="Recipient Google email" placeholder="Team member’s Google email" value={email} onChange={e => setEmail(e.target.value)} />
      <button disabled={busy || expired || !email.trim()} onClick={() => void run(async () => {
        await copy(await window.api.share(job.id, 'restricted', email.trim()));
      }, 'Team member granted access. Link copied; send it to notify them.')}>Grant team access & copy link</button>
    </div>
    <div className="panel" style={{ marginTop: 14, background: 'var(--paper)' }}>
      <h3>Link expiry (optional)</h3>
      <p className="muted">{info?.trashedAt || job.trashedAt ? 'Expired · package moved to Google Drive Trash.' : expired ? 'Link expired · cloud cleanup is pending.' : savedExpiry ? `Expires ${new Date(savedExpiry).toLocaleString()}` : 'No expiry · package remains available until you remove it.'}</p>
      <div className="actions">
        <input type="datetime-local" aria-label="Link expiry date and time" value={expiry} min={localDate(new Date(Date.now() + 60000).toISOString())} onChange={e => setExpiry(e.target.value)} />
        <button disabled={busy || !expiry || Boolean(info?.trashedAt || job.trashedAt)} onClick={() => void run(async () => {
          const date = new Date(expiry);
          if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) throw new Error('Choose a future expiry date and time.');
          setInfo(await window.api.setPackageExpiry(job.id, date.toISOString()));
        }, 'Expiry saved. The link stops working at that time; cloud cleanup moves the uploaded package to Trash.')}>
          Save expiry
        </button>
        <button disabled={busy || !savedExpiry || Boolean(info?.trashedAt || job.trashedAt)} onClick={() => void run(async () => {
          setInfo(await window.api.setPackageExpiry(job.id, null));
        }, 'Expiry removed. Automatic cleanup cancelled.')}>Remove expiry</button>
      </div>
      <p className="muted">Time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Cloud cleanup checks every 5 minutes, even with the app closed. Only the uploaded package is moved to Drive Trash; files on your computer stay untouched.</p>
      {(info?.cleanupError || job.cleanupError) && <p className="warning">{info?.cleanupError || job.cleanupError}</p>}
    </div>
    {note && <p className="success" role="status">{note}</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </>;
}
