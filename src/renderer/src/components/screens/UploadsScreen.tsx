import { useState } from 'react';
import { AlertTriangle, Pause, Play, Trash2 } from 'lucide-react';
import type { DriveStatus, Transfer } from '../../../../shared/contracts';
import {
  ACTIVE_STATUSES, formatBytes, formatRetryWait, progressFraction, remainingSummary, statusLabel,
} from '../../utils/uploadFormat';
import { formatEta, formatSpeed, useTransferSpeed } from '../../utils/uploadSpeed';

/**
 * Take a transfer off the queue, having asked what should happen to the part of
 * it that already reached the cloud.
 *
 * Those bytes cost real money and real hours to send, and a folder abandoned
 * without a record is worse than one deliberately deleted, so keeping them is
 * the default and deleting is the answer the studio has to choose.
 */
async function remove(job: Transfer): Promise<void> {
  const sent = job.uploadedBytes > 0 && Boolean(job.link);
  if (!sent) {
    if (!window.confirm(`Remove "${job.target?.title || job.rootName}" from the queue?\n\nNothing has been uploaded yet, so nothing in the cloud changes. The folder on disk is untouched.`)) return;
    await window.api.removeTransfer(job.id, true);
    return;
  }
  const keep = window.confirm(
    `Remove "${job.target?.title || job.rootName}" from the queue?\n\n` +
    `${formatBytes(job.uploadedBytes)} has already been uploaded.\n\n` +
    `OK — keep those files in the cloud and copy their link.\n` +
    `Cancel — choose whether to delete them instead.`
  );
  if (!keep) {
    const del = window.confirm(
      `Delete the ${formatBytes(job.uploadedBytes)} already uploaded for "${job.target?.title || job.rootName}"?\n\n` +
      `This permanently removes that partial folder from the cloud and cannot be undone.\n\n` +
      `Cancel here leaves the transfer exactly as it is.`
    );
    if (!del) return;
    await window.api.removeTransfer(job.id, false);
    return;
  }
  const result = await window.api.removeTransfer(job.id, true);
  if (result.keptLink) void navigator.clipboard.writeText(result.keptLink).catch(() => {});
}

function TransferCard({ job, busy, drive, onOpen, onRun }: {
  job: Transfer; busy: string; drive: DriveStatus | null;
  onOpen: (id: string) => void; onRun: (id: string, fn: () => Promise<void>) => void;
}) {
  const label = statusLabel(job.status);
  const fraction = progressFraction(job);
  const scanning = job.status === 'scanning';
  const moving = ['uploading', 'verifying'].includes(job.status);
  const bytesPerSecond = useTransferSpeed(job.uploadedBytes, moving);
  const remaining = Math.max(0, (job.scan?.totalBytes || 0) - job.uploadedBytes);

  return (
    <article className="panel transfer-card">
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
      {!scanning && moving && bytesPerSecond > 0 && (
        <p className="mono" style={{ fontSize: 12.5, color: 'var(--burgundy)', margin: '4px 0 0' }}>
          {formatSpeed(bytesPerSecond)} · {formatEta(remaining, bytesPerSecond)}
        </p>
      )}
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
        <button
          className="text-button"
          disabled={busy === job.id || ACTIVE_STATUSES.includes(job.status)}
          style={{ color: 'var(--warn)' }}
          title={ACTIVE_STATUSES.includes(job.status) ? 'Pause this transfer before removing it.' : undefined}
          onClick={() => void onRun(job.id, () => remove(job))}
        >
          <Trash2 size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Remove
        </button>
        {ACTIVE_STATUSES.includes(job.status) && (
          <button disabled={busy === job.id} onClick={() => void onRun(job.id, () => window.api.pause(job.id))}>
            <Pause size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Pause
          </button>
        )}
        {['paused', 'needs_attention'].includes(job.status) && job.target && (
          <button disabled={busy === job.id}
            onClick={() => void onRun(job.id, () => window.api.resume(job.id))}>
            <Play size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Resume
          </button>
        )}
        {job.status === 'scanning' && (
          <button disabled={busy === job.id} onClick={() => void onRun(job.id, () => window.api.cancelScan(job.id))}>Cancel scan</button>
        )}
        {job.status === 'needs_attention' && (
          <button disabled={busy === job.id} onClick={() => void onRun(job.id, () => window.api.relocate(job.id))}>Locate folder</button>
        )}
      </div>
    </article>
  );
}

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

      {error && <p className="error" role="alert">{error}</p>}
      {actionError && <p className="error" role="alert">{actionError}</p>}

      {loading ? <p className="muted">Reading the transfer queue…</p>
        : live.length === 0 ? (
          <div className="panel empty">
            <h3>Nothing is uploading</h3>
            <p>Pick a partner studio job or a client deliverable, choose its folder, and it will
              appear here with progress you can pause and resume.</p>
          </div>
        ) : live.map(job => (
          <TransferCard key={job.id} job={job} busy={busy} drive={drive} onOpen={onOpen} onRun={run} />
        ))}
    </div>
  );
}
