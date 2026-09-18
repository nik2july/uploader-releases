import { useState } from 'react';
import { Film, HardDrive, X, FolderSearch, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import type { WorkTarget, OfflineScanResult } from '../../../shared/contracts';
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
  const [isScanning, setIsScanning] = useState(false);
  const [scannedSummary, setScannedSummary] = useState<OfflineScanResult | null>(null);

  async function handleScanFolder(): Promise<void> {
    setIsScanning(true);
    setError('');
    try {
      const res = await window.api.scanOfflineFolder(target);
      if (!res) {
        // User cancelled dialog
        return;
      }
      setScannedSummary(res);
      setDriveNotes(res.driveLabel);
      if (res.photoCount > 0) {
        setPhotos(String(res.photoCount));
      }
      if (res.hours > 0 || res.minutes > 0) {
        setHours(String(res.hours));
        setMinutes(String(res.minutes));
      }
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Could not scan folder.');
    } finally {
      setIsScanning(false);
    }
  }

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
              {source === 'hard_drive' ? 'Share Offline' : 'Raw-Data Link'}
            </h2>
            <p>{title} · {source === 'hard_drive' ? 'Scan hard drive folder or log offline handover' : 'Log shared cloud link'}</p>
          </div>
          <button className="icon-button" onClick={onClose} disabled={busy || isScanning} aria-label="Close">
            <X size={20} />
          </button>
        </header>

        <form onSubmit={event => void save(event)}>
          <label>
            Intake Source
            <select value={source} onChange={e => setSource(e.target.value as 'hard_drive' | 'link')}>
              <option value="hard_drive">Share Offline (External Hard Drive / SSD Handover)</option>
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
              {/* Scan Folder Action */}
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: '12px',
                  border: scannedSummary ? '1.5px solid #10b981' : '1.5px dashed var(--burgundy, #7a2e33)',
                  backgroundColor: scannedSummary ? '#f0fdf4' : '#fdfaf6',
                  marginBottom: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {scannedSummary ? (
                      <CheckCircle2 size={22} style={{ color: '#10b981', flexShrink: 0 }} />
                    ) : (
                      <FolderSearch size={22} style={{ color: 'var(--burgundy, #7a2e33)', flexShrink: 0 }} />
                    )}
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: scannedSummary ? '#065f46' : '#111417' }}>
                        {scannedSummary ? 'Folder Scanned' : 'Scan Hard Drive Folder'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#6b6660' }}>
                        {scannedSummary
                          ? scannedSummary.folderPath
                          : 'Select the raw folder on your external drive/SSD to auto-calculate photos & videos'}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleScanFolder()}
                    disabled={isScanning || busy}
                    style={{
                      padding: '8px 16px',
                      fontSize: '12px',
                      fontWeight: '700',
                      borderRadius: '8px',
                      backgroundColor: scannedSummary ? '#ffffff' : 'var(--burgundy, #7a2e33)',
                      color: scannedSummary ? '#111417' : '#ffffff',
                      border: scannedSummary ? '1px solid #d4c1a3' : 'none',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.06)'
                    }}
                  >
                    {isScanning ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        <span>Scanning folder…</span>
                      </>
                    ) : scannedSummary ? (
                      <>
                        <RefreshCw size={14} />
                        <span>Scan Different Folder</span>
                      </>
                    ) : (
                      <>
                        <HardDrive size={14} />
                        <span>Select & Scan Folder</span>
                      </>
                    )}
                  </button>
                </div>

                {scannedSummary && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                      gap: '8px',
                      paddingTop: '8px',
                      borderTop: '1px solid #bbf7d0'
                    }}
                  >
                    {scannedSummary.photoCount > 0 && (
                      <div style={{ fontSize: '12px', color: '#047857', fontWeight: '600' }}>
                        📸 <strong>{scannedSummary.photoCount}</strong> photos
                      </div>
                    )}
                    {(scannedSummary.hours > 0 || scannedSummary.minutes > 0 || scannedSummary.videoCount > 0) && (
                      <div style={{ fontSize: '12px', color: '#047857', fontWeight: '600' }}>
                        🎬 <strong>{scannedSummary.hours}h {scannedSummary.minutes}m</strong> ({scannedSummary.videoCount} clips)
                      </div>
                    )}
                    <div style={{ fontSize: '12px', color: '#047857', fontWeight: '600' }}>
                      💾 <strong>{scannedSummary.formattedSize}</strong> ({scannedSummary.fileCount} files)
                    </div>
                    <div style={{ fontSize: '12px', color: '#047857', fontWeight: '600', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={scannedSummary.driveLabel}>
                      🏷️ {scannedSummary.driveLabel}
                    </div>
                  </div>
                )}
              </div>

              <label>
                Drive label / storage reference
                <input
                  value={driveNotes}
                  onChange={event => setDriveNotes(event.target.value)}
                  placeholder="e.g. Samsung T7 2TB (Red) - In-House Desk #2"
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
            <button type="button" onClick={onClose} disabled={busy || isScanning}>Cancel</button>
            <button className="primary" disabled={busy || isScanning}>
              {busy ? 'Saving…' : source === 'hard_drive' ? (scannedSummary ? 'Confirm & Move to Post Production' : 'Save Offline Share') : 'Save Raw-Data Link'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
