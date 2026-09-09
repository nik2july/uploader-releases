import { useState } from 'react';
import { Check, Copy, ExternalLink, MessageCircle, Share2 } from 'lucide-react';
import type { Transfer } from '../../../../shared/contracts';
import { useApp } from '../../context/AppContext';
import { attachVerifiedTransfer } from '../../lib/studioRepository';
import { editorMessage, whatsappUrl } from '../../utils/editorMessage';

/**
 * What you can do with a folder once every file in it has been checksum-verified.
 *
 * The order here is the order it matters in: the link is useless to the person
 * receiving it until they have access, so sharing sits alongside copying rather
 * than behind it, and the transfer is not described as ready to send until the
 * access it needs has actually been granted.
 */
export function ShareActions({ job, refresh }: { job: Transfer; refresh: () => Promise<void> }): React.JSX.Element {
  const studio = useApp();
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [email, setEmail] = useState(job.target?.recipientEmail || '');

  async function run(key: string, fn: () => Promise<void>, success = ''): Promise<void> {
    setBusy(key); setError(''); setNote('');
    try { await fn(); await refresh(); if (success) setNote(success); }
    catch (err) { setError(err instanceof Error ? err.message : 'That did not complete.'); }
    finally { setBusy(''); }
  }

  const message = editorMessage(job, studio.studioSettings?.studioName || 'Baawaray Films');

  return (
    <>
      <div className="actions">
        <button className="primary" disabled={!job.link} onClick={() => {
          void navigator.clipboard.writeText(job.link || '');
          setCopied(true); setTimeout(() => setCopied(false), 2500);
        }}>
          {copied ? <Check size={15} style={{ verticalAlign: -3, marginRight: 6 }} /> : <Copy size={15} style={{ verticalAlign: -3, marginRight: 6 }} />}
          {copied ? 'Link copied' : 'Copy Drive link'}
        </button>

        <button disabled={!job.link} onClick={() => void window.api.openExternal(job.link!)}>
          <ExternalLink size={15} style={{ verticalAlign: -3, marginRight: 6 }} />Open in Drive
        </button>

        <button disabled={busy === 'whatsapp'} onClick={() => void run('whatsapp', async () => {
          await window.api.openExternal(whatsappUrl(message, job.target?.recipientPhone));
          await window.api.markMessagePrepared(job.id);
        }, 'WhatsApp opened with the message written. It is not sent until you send it.')}>
          <MessageCircle size={15} style={{ verticalAlign: -3, marginRight: 6 }} />
          WhatsApp {job.target?.recipientName || 'recipient'}
        </button>

        <button disabled={busy === 'sync' || job.synced} onClick={() => void run('sync', async () => {
          await attachVerifiedTransfer(job);
          await window.api.markSynced(job.id);
        }, 'Link saved onto the job in Studio OS.')}>
          {job.synced ? 'Saved to Studio OS' : 'Save link to Studio OS'}
        </button>
      </div>

      <div className="panel" style={{ background: 'var(--paper)', border: 0, marginTop: 4 }}>
        <h3><Share2 size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Who can open this folder</h3>
        {job.shared
          ? <p className="muted" style={{ margin: 0 }}>
              Shared as {job.sharing === 'anyone' ? 'anyone with the link' : `access for ${email || 'the named account'}`}.
              A Drive link on its own grants nothing, so this is what makes the link work for them.
            </p>
          : <p className="muted" style={{ margin: 0 }}>
              A Drive URL does not grant access by itself. Give the recipient access before sending the link,
              or they will open it and see nothing.
            </p>}
        <label style={{ marginTop: 12 }}>Recipient’s Google account
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="editor@example.com" autoComplete="off" />
        </label>
        <div className="actions" style={{ marginTop: 0 }}>
          <button className="primary" disabled={busy === 'share' || !email.trim()}
            onClick={() => void run('share', async () => { await window.api.share(job.id, 'restricted', email.trim()); },
              'Access granted to that Google account only.')}>Give this person access</button>
          <button className="danger" disabled={busy === 'anyone'}
            onClick={() => void run('anyone', async () => { await window.api.share(job.id, 'anyone', ''); },
              'Anyone with the link can now view this folder.')}>Anyone with the link…</button>
        </div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
          Link access hands the whole folder to whoever the link reaches. It asks for confirmation first.
        </p>
      </div>

      {job.messagePreparedAt && !note && (
        <p className="notice">WhatsApp message prepared {new Date(job.messagePreparedAt).toLocaleString()}. Preparing is not sending.</p>
      )}
      {note && <p className="success" role="status">{note}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}
