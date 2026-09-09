import { useState } from 'react';
import { X } from 'lucide-react';
import { logRevision } from '../lib/studioRepository';

/**
 * A round of client changes, written down while it is still fresh.
 *
 * Feedback arrives as a voice note or a phone call and then lives in someone's
 * memory until the editor asks. Writing it against the job is what makes a
 * third round of changes visible as a third round, rather than as a job that
 * mysteriously took a month.
 */
export function ChangesModal({ jobId, jobTitle, editorName, onClose, onSaved }: {
  jobId: string; jobTitle: string; editorName?: string;
  onClose: () => void; onSaved: (round: number, notes: string) => void;
}): React.JSX.Element {
  const [notes, setNotes] = useState('');
  const [timecodes, setTimecodes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const round = await logRevision(jobId, notes, timecodes);
      onSaved(round, notes.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save these changes.');
      setBusy(false);
    }
  }

  return (
    <div className="modal-shade">
      <section className="work-modal" role="dialog" aria-modal="true" aria-labelledby="changes-title">
        <header>
          <div>
            <span className="eyebrow">CLIENT FEEDBACK</span>
            <h2 id="changes-title">Log changes</h2>
          </div>
          <button className="icon-button" aria-label="Close" disabled={busy} onClick={onClose}><X size={20} /></button>
        </header>

        <p className="muted" style={{ marginTop: 0 }}>{jobTitle}</p>

        <form onSubmit={event => void save(event)}>
          <label>What needs changing
            <textarea required autoFocus value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Colour on the ceremony is too warm. Swap the second song. Cut the speech at the end." />
          </label>
          <label>Timecodes, if any
            <input value={timecodes} onChange={e => setTimecodes(e.target.value)} placeholder="02:14, 04:50–05:10" />
          </label>

          <p className="notice">
            Saving records this as the next round and moves the job to <strong>Changes Received</strong>.
            You can then send it {editorName ? `to ${editorName}` : 'to the editor'} on WhatsApp, which moves
            it to <strong>Changes with Editor</strong>.
          </p>

          {error && <p className="error" role="alert">{error}</p>}
          <div className="actions">
            <button type="button" disabled={busy} onClick={onClose}>Cancel</button>
            <button className="primary" disabled={busy || !notes.trim()}>{busy ? 'Saving…' : 'Log changes'}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
