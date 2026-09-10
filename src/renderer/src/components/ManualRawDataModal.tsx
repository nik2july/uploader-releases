import { useState } from 'react';
import { Film, HardDrive, X } from 'lucide-react';
import type { WorkTarget } from '../../../shared/contracts';
import { saveManualRawData } from '../lib/studioRepository';

export function ManualRawDataModal({ target, title, onClose, onSaved }: { target: WorkTarget; title: string; onClose: () => void; onSaved: () => void }): React.JSX.Element {
  const [source, setSource] = useState<'hard_drive' | 'link'>('hard_drive');
  const [link, setLink] = useState('');
  const [driveNotes, setDriveNotes] = useState('');
  const [hours, setHours] = useState('0');
  const [minutes, setMinutes] = useState('0');
  const [photos, setPhotos] = useState('0');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await saveManualRawData(target, {
        source,
        link,
        notes: driveNotes,
        hours: Number(hours) || 0,
        minutes: Number(minutes) || 0,
        photoCount: Number(photos) || 0
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save raw-data details.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-shade">
      <section className="work-modal" role="dialog" aria-modal="true" aria-labelledby="manual-raw-title">
        <header>
          <div>
            <h2 id="manual-raw-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {source === 'hard_drive' ? <HardDrive size={18} style={{ color: 'var(--burgundy)' }} /> : <Film size={18} style={{ color: 'var(--burgundy)' }} />}
              Manual Raw-Data Intake
            </h2>
            <p>{title} · Log physical hard drive handover or client shared cloud link</p>
          </div>
          <button className="icon-button" onClick={onClose} disabled={busy} aria-label="Close">
            <X size={20} />
          </button>
        </header>

        <form onSubmit={event => void save(event)}>
          <label>
            Intake Source
            <select value={source} onChange={e => setSource(e.target.value as 'hard_drive' | 'link')}>
              <option value="hard_drive">Physical hard drive handover (In-house / local SSD)</option>
              <option value="link">Shared cloud link (Google Drive, Dropbox, WeTransfer)</option>
            </select>
          </label>

          {source === 'link' && (
            <label>
              Raw-data Link
              <input
                required
                value={link}
                onChange={event => setLink(event.target.value)}
                placeholder="Google Drive, Dropbox, WeTransfer, NAS link…"
                autoFocus
              />
            </label>
          )}

          {source === 'hard_drive' && (
            <>
              <label>
                Drive label / storage reference
                <input
                  value={driveNotes}
                  onChange={event => setDriveNotes(event.target.value)}
                  placeholder="e.g. Samsung T7 2TB (Red) - In-House Desk #2"
                  autoFocus
                />
              </label>

          {target.serviceType === 'Long Form' ? (
            <div className="field-row">
              <label>
                Raw video hours
                <input type="number" min="0" value={hours} onChange={event => setHours(event.target.value)} />
              </label>
              <label>
                Raw video minutes
                <input type="number" min="0" max="59" value={minutes} onChange={event => setMinutes(event.target.value)} />
              </label>
            </div>
          ) : (target.serviceType === 'Edited Photos' || target.serviceType === 'Album') ? (
            <label>
              Photo count
              <input type="number" min="0" value={photos} onChange={event => setPhotos(event.target.value)} />
            </label>
          ) : target.serviceType === 'Short Form' ? (
            <p className="muted" style={{ fontSize: 12.5, margin: '8px 0' }}>
              Short Form is measured on the finished video cut, so raw clip duration and photo count are not needed. Physical drive hand-off is logged.
            </p>
          ) : (
            <>
              <div className="field-row">
                <label>
                  Raw video hours
                  <input type="number" min="0" value={hours} onChange={event => setHours(event.target.value)} />
                </label>
                <label>
                  Raw video minutes
                  <input type="number" min="0" max="59" value={minutes} onChange={event => setMinutes(event.target.value)} />
                </label>
              </div>
              <label>
                Photo count
                <input type="number" min="0" value={photos} onChange={event => setPhotos(event.target.value)} />
              </label>
              </>
            )}
          </>
        )}

          {error && <p className="error">{error}</p>}
          <div className="actions">
            <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="primary" disabled={busy}>
              {busy ? 'Saving…' : source === 'hard_drive' ? 'Save Hard Drive Details' : 'Save Raw-Data Link'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
