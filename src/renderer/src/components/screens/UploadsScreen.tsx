import { useState } from 'react';
import { AlertTriangle, Pause, Play } from 'lucide-react';
import type { DriveStatus, Transfer } from '../../../../shared/contracts';
import {
  ACTIVE_STATUSES, formatBytes, formatRetryWait, progressFraction, remainingSummary, statusLabel,
} from '../../utils/uploadFormat';

export function UploadsScreen({ transfers, loading, error, drive, onOpen, onSettings }: {
  transfers: Transfer[]; loading: boolean; error: string; drive: DriveStatus | null;
  onOpen: (id: string) => void; onSettings: () => void;
}): React.JSX.Element {
  const [busy, setBusy] = useState('');
  const [actionError, setActionError] = useState('');
  const live = transfers.filter(job => job.status !== 'completed');

  async function run(id: string, fn: () => Promise<void>): Promise<void> {
    setBusy(id); setActionError('');
    try { await fn(); } catch (err) { setActionError(err instanceof Error ? err.message : 'That action did not complete.'); }
    finally { setBusy(''); }
  }

  return (
    <div className="screen">
      <header>
        <div>
          <span className="eyebrow">TRANSFERS</span>
          <h2>Uploads</h2>
          <p>Everything in flight. Transfers keep running with this window closed, and pick up
            where they stopped after a quit, a crash, or a dropped connection.</p>
        </div>
        <div className="actions" style={{ margin: 0 }}>
          {live.some(job => ACTIVE_STATUSES.includes(job.status)) && (
            <button onClick={() => void run('all', async () => {
              for (const job of live.filter(j => ACTIVE_STATUSES.includes(j.status))) await window.api.pause(job.id);
            })}>Pause all</button>
          )}
        </div>
      </header>

      {!drive?.connected && (
        <p className="warning">
          Google Drive is not connected on this Mac, so nothing will send. {' '}
          <button className="text-button" onClick={onSettings}>Open settings</button>
        </p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {actionError && <p className="error" role="alert">{actionError}</p>}

      {loading ? <p className="muted">Reading the transfer queue…</p>
        : live.length === 0 ? (
          <div className="panel empty">
            <h3>Nothing is uploading</h3>
            <p>Pick a partner studio job or a client deliverable, choose its folder, and it will
              appear here with progress you can pause and resume.</p>
          </div>
        ) : live.map(job => {
          const label = statusLabel(job.status);
          const fraction = progressFraction(job);
          const scanning = job.status === 'scanning';
          return (
            <article key={job.id} className="panel transfer-card">
              <div className="row">
                <div>
                  <div className="title" style={{ fontSize: 17, fontWeight: 600 }}>
                    {job.target?.title || job.rootName}
                  </div>
                  <div className="path">{job.rootPath}</div>
                  {job.target && (
                    <div className="sub muted" style={{ marginTop: 4, fontSize: 13 }}>
                      {job.target.kind === 'freelance' ? 'Partner studio' : 'Client'} · {job.target.clientName}
                      {job.target.serviceType ? ` · ${job.target.serviceType}` : ''}
                      {job.target.purpose === 'raw' ? ' · raw data' : ' · final delivery'}
                    </div>
                  )}
                </div>
                <span className={`status-pill ${label.tone}`}>{label.text}</span>
              </div>

              <div className={`bar${scanning ? ' indeterminate' : ''}`}>
                <span style={scanning ? undefined : { width: `${(fraction * 100).toFixed(1)}%` }} />
              </div>
              <div className="row" style={{ marginTop: 8, fontSize: 13 }}>
                <span className="muted">
                  {scanning
                    ? `Measuring ${job.scan?.fileCount ?? 0} files so far`
                    : `${formatBytes(job.uploadedBytes)} of ${formatBytes(job.scan?.totalBytes || 0)} · ${remainingSummary(job)}`}
                </span>
                <span className="mono muted">{scanning ? '' : `${Math.round(fraction * 100)}%`}</span>
              </div>
              {job.currentFile && <div className="current">{job.currentFile}</div>}

              {job.error && (
                <p className={job.status === 'needs_attention' ? 'error' : 'warning'} role={job.status === 'needs_attention' ? 'alert' : undefined}>
                  {job.status === 'needs_attention' && <AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />}
                  {job.error}
                  {['waiting_quota', 'waiting_network'].includes(job.status) && job.retryAt ? ` — ${formatRetryWait(job.retryAt)}.` : ''}
                </p>
              )}

              <div className="actions">
                <button className="primary" onClick={() => onOpen(job.id)}>Open</button>
                {ACTIVE_STATUSES.includes(job.status) && (
                  <button disabled={busy === job.id} onClick={() => void run(job.id, () => window.api.pause(job.id))}>
                    <Pause size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Pause
                  </button>
                )}
                {['paused', 'needs_attention'].includes(job.status) && job.target && (
                  <button disabled={busy === job.id || !drive?.connected}
                    onClick={() => void run(job.id, () => window.api.resume(job.id))}>
                    <Play size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Resume
                  </button>
                )}
                {job.status === 'scanning' && (
                  <button disabled={busy === job.id} onClick={() => void run(job.id, () => window.api.cancelScan(job.id))}>Cancel scan</button>
                )}
                {job.status === 'needs_attention' && (
                  <button disabled={busy === job.id} onClick={() => void run(job.id, () => window.api.relocate(job.id))}>Locate folder</button>
                )}
              </div>
            </article>
          );
        })}
    </div>
  );
}
