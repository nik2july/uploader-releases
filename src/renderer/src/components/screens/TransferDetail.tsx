import { useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { InvoiceSnapshot, Transfer } from '../../../../shared/contracts';
import { useApp } from '../../context/AppContext';
import { saveBilling } from '../../lib/studioRepository';
import { calculateMediaBilling } from '../../utils/mediaPricing';
import type { MediaBillingResult } from '../../utils/mediaPricing';
import { describeBilling, isMinimumApplied, serviceDefinition, unitNoun } from '../../utils/freelancePricing';
import { downloadInvoice } from '../../utils/uploadInvoice';
import { formatBytes, formatCount, formatDuration, progressFraction, remainingSummary, statusLabel } from '../../utils/uploadFormat';
import { formatEta, formatSpeed, useTransferSpeed } from '../../utils/uploadSpeed';
import { ShareActions } from './ShareActions';
import type { ClientDeliverable } from '../../types';

export function TransferDetail({ job, onBack, refresh }: {
  job: Transfer; onBack: () => void; refresh: () => Promise<void>;
}): React.JSX.Element {
  const studio = useApp();
  const target = job.target;
  const scan = job.scan;
  const label = statusLabel(job.status);
  const currency = studio.studioSettings?.currency || 'INR';

  // ---------------------------------------------------------------- the work
  const freelanceJob = useMemo(
    () => target?.kind === 'freelance' ? studio.freelanceJobs.find(j => String(j.id) === target.id) : undefined,
    [studio.freelanceJobs, target]);
  const partner = useMemo(
    () => freelanceJob ? studio.freelanceClients.find(c => String(c.id) === String(freelanceJob.freelanceClientId)) : undefined,
    [studio.freelanceClients, freelanceJob]);
  const deliverable = useMemo<ClientDeliverable | undefined>(() => {
    if (target?.kind !== 'deliverable') return undefined;
    const client = studio.clients.find(c => String(c.id) === String(target.clientId));
    return (client?.deliverables || []).find(d => d.id === target.id);
  }, [studio.clients, target]);

  const service = serviceDefinition(target?.serviceType as never);
  // Short Form and Long Form are billed on video, so photo counts and the
  // billing exclusions that go with them are noise on those jobs.
  const countsPhotos = !service || service.basis === 'per_photo' || service.basis === 'per_sheet';
  /**
   * A booked package was agreed on a quotation and an already-invoiced extra has
   * been paid; measuring a folder afterwards must not silently change either
   * figure. Only freelance work and a not-yet-invoiced extra are priced here.
   */
  const repriceable = target?.kind === 'freelance' || Boolean(deliverable?.isExtra && !deliverable.extraInvoiceId);
  const agreedCharge = target?.kind === 'freelance'
    ? Number((freelanceJob as { clientCharge?: number } | undefined)?.clientCharge) || 0
    : Number(deliverable?.sellingPrice) || 0;

  // ------------------------------------------------------------- measurement
  const defaults = studio.studioSettings?.uploader;
  // null means "not typed in yet", so the rate card can still fill it once
  // Firestore answers — and clearing the box stays cleared.
  const [typedRate, setTypedRate] = useState<string | null>(null);
  const [keepPercent, setKeepPercent] = useState(defaults?.keepPercentDefault ?? 20);
  const [photosPerSheet, setPhotosPerSheet] = useState(defaults?.photosPerSheet ?? 5);
  const [outputMinutes, setOutputMinutes] = useState(0);
  const [outputSeconds, setOutputSeconds] = useState(0);
  const [override, setOverride] = useState('');
  const [problems, setProblems] = useState<{ path: string; error: string }[]>([]);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  // The rate card is what this partner is normally charged; a job that already
  // carries a rate keeps it, so re-scanning never quietly reprices past work.
  const cardRate = target?.serviceType ? partner?.rateCard?.[target.serviceType] : undefined;
  const suggestedRate = job.invoice?.rate
    ?? (freelanceJob as { pricing?: { rate?: number } } | undefined)?.pricing?.rate
    ?? cardRate;
  const rate = typedRate ?? (suggestedRate ? String(suggestedRate) : '');

  useEffect(() => { void window.api.inspect(job.id).then(r => setProblems(r.files)).catch(() => setProblems([])); },
    [job.id, job.status, job.completedFiles]);

  const billing = useMemo<{ result?: MediaBillingResult; error?: string }>(() => {
    if (!scan || !service || !repriceable) return {};
    try {
      return {
        result: calculateMediaBilling(
          { rawDurationSeconds: scan.totalDurationSeconds, photoCount: scan.billablePhotos, unknownVideoCount: scan.unknownVideoCount },
          { serviceType: target!.serviceType, rate: Number(rate) || 0, outputMinutes, outputSeconds,
            keepPercent, photosPerSheet, quantityOverride: override === '' ? undefined : Number(override) }),
      };
    } catch (err) { return { error: err instanceof Error ? err.message : 'This cannot be priced yet.' }; }
  }, [scan, service, repriceable, target, rate, outputMinutes, outputSeconds, keepPercent, photosPerSheet, override]);

  const amount = repriceable ? (billing.result?.amount ?? 0) : agreedCharge;

  function snapshot(status: 'draft' | 'issued'): InvoiceSnapshot {
    const created = job.invoice?.createdAt ?? new Date().toISOString();
    return {
      id: job.invoice?.id ?? crypto.randomUUID(),
      number: job.invoice?.number ?? `DU-${created.slice(0, 10).replace(/-/g, '')}-${job.id.slice(0, 6).toUpperCase()}`,
      createdAt: created, status,
      studioName: studio.studioSettings?.studioName || 'Baawaray Films',
      clientName: target?.clientName || '', title: target?.title || job.rootName, currency,
      quantity: billing.result?.pricing.billableUnits ?? 1,
      unit: billing.result ? unitNoun(billing.result.pricing.basis, billing.result.pricing.billableUnits) : 'agreed',
      rate: billing.result?.pricing.rate ?? amount,
      // Tax is applied on the Studio OS invoice, where the studio's GST settings
      // live. Keeping this snapshot pre-tax is what lets it be compared against
      // the job's own charge without one of the two carrying a hidden addition.
      subtotal: amount, taxPercent: 0, tax: 0, total: amount,
      calculation: billing.result,
      note: repriceable ? undefined : 'Agreed price, unchanged. The measurement above is recorded for reference only.',
    };
  }

  async function run(key: string, fn: () => Promise<void>, success = ''): Promise<void> {
    setBusy(key); setError(''); setNote('');
    try { await fn(); await refresh(); if (success) setNote(success); }
    catch (err) { setError(err instanceof Error ? err.message : 'That did not complete.'); }
    finally { setBusy(''); }
  }

  const moving = ['uploading', 'verifying'].includes(job.status);
  const bytesPerSecond = useTransferSpeed(job.uploadedBytes, moving);
  const remaining = Math.max(0, (scan?.totalBytes || 0) - job.uploadedBytes);

  const canUpload = ['ready', 'paused'].includes(job.status) && scan && !scan.readErrors && target;
  const [confirmingProblems, setConfirmingProblems] = useState(false);
  const problemCount = (scan?.missingClipCount || 0) + (scan?.unreadableFiles?.length || 0);
  const needsConfirming = problemCount > 0;

  return (
    <div className="screen">
      <div className="breadcrumb">
        <button onClick={onBack}>Uploads</button><ChevronRight size={13} />
        <span style={{ color: 'var(--ink)' }}>{target?.title || job.rootName}</span>
      </div>

      <header>
        <div>
          <span className="eyebrow">
            {target ? `${target.kind === 'freelance' ? 'PARTNER STUDIO' : 'CLIENT'} · ${target.purpose === 'raw' ? 'RAW DATA' : 'FINAL DELIVERY'}` : 'FOLDER'}
          </span>
          <h2>{target?.title || job.rootName}</h2>
          <p className="mono" style={{ fontSize: 12.5 }}>{job.rootPath}</p>
        </div>
        <span className={`status-pill ${label.tone}`}>{label.text}</span>
      </header>

      {job.error && <p className={job.status === 'needs_attention' ? 'error' : 'warning'}>{job.error}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {note && <p className="success" role="status">{note}</p>}

      {/* ------------------------------------------------------- measurement */}
      <section className="panel">
        <span className="eyebrow">WHAT THE FOLDER CONTAINS</span>
        <h2 style={{ fontSize: 20 }}>Measurement</h2>
        {!scan ? <p className="muted">Scanning has not produced a summary yet.</p> : (
          <>
            <div className="stat-grid">
              <div className="stat"><div className="label">Total size</div><div className="value">{formatBytes(scan.totalBytes)}</div>
                <div className="foot">{formatCount(scan.fileCount)} files in {formatCount(scan.folderCount)} folders</div></div>
              {(!service || service.basis === 'per_raw_hour' || scan.totalVideos > 0) && (
                <div className="stat"><div className="label">Raw video</div><div className="value">{formatDuration(scan.totalDurationSeconds)}</div>
                  <div className="foot">{formatCount(scan.totalVideos)} clips, all cameras added together</div></div>
              )}
              {countsPhotos && (
                <div className="stat"><div className="label">Photos</div><div className="value">{formatCount(scan.totalPhotos)}</div>
                  <div className="foot">{formatCount(scan.billablePhotos)} counted for billing{scan.pairedPhotos ? ` · ${formatCount(scan.pairedPhotos)} RAW+JPEG pairs` : ''}</div></div>
              )}
              {countsPhotos && scan.excludedBillingFiles > 0 && (
                <div className="stat"><div className="label">Excluded from billing</div><div className="value">{formatCount(scan.excludedBillingFiles)}</div>
                  <div className="foot">Still uploaded in full</div></div>
              )}
            </div>

            {(scan.unreadableFiles?.length || 0) > 0 && (
              <div className="warning" style={{ marginTop: 14 }}>
                <b style={{ display: 'block', marginBottom: 4 }}>
                  {formatCount(scan.unreadableFiles?.length || 0)} files are here but could not be read.
                </b>
                <p style={{ margin: '0 0 8px' }}>
                  An empty file, or a clip with no duration in its header. Usually a copy that stopped
                  part way. They will still upload — but they will upload broken.
                </p>
                <ul className="file-problems" style={{ maxHeight: 180 }}>
                  {(scan.unreadableFiles || []).slice(0, 60).map(file => (
                    <li key={file.path}><span className="mono">{file.path}</span>{file.reason}</li>
                  ))}
                </ul>
              </div>
            )}

            {scan.missingClipCount > 0 && (
              <div className="warning" style={{ marginTop: 14 }}>
                <b style={{ display: 'block', marginBottom: 4 }}>
                  {formatCount(scan.missingClipCount)} files are missing from the camera numbering.
                </b>
                <p style={{ margin: '0 0 8px' }}>
                  The cameras number what they record, so a gap usually means a file did not copy off
                  the card. Worth checking now — far cheaper than finding out after the upload.
                </p>
                <ul className="file-problems" style={{ maxHeight: 180 }}>
                  {(scan.missingClips || []).map(gap => (
                    <li key={`${gap.folder}:${gap.label}`}>
                      <span className="mono">{gap.folder ? `${gap.folder}/` : ''}{gap.label}</span>
                      {formatCount(gap.received)} arrived, {formatCount(gap.missingCount)} missing: {gap.missing.join(', ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {scan.unknownVideoCount > 0 && (
              <p className="warning">{formatCount(scan.unknownVideoCount)} clips could not be measured, so the raw duration above is
                incomplete. Long form cannot be priced until they are resolved or excluded — they still upload either way.</p>
            )}
            {scan.readErrors > 0 && (
              <p className="error">{formatCount(scan.readErrors)} items could not be inventoried. Fix the permissions or the
                drive connection and scan the folder again; nothing is uploaded from an incomplete inventory.</p>
            )}
            {scan.warnings.length > 0 && (
              <details style={{ marginTop: 12 }}>
                <summary className="muted" style={{ cursor: 'pointer', fontSize: 13 }}>{scan.warnings.length} scan notes</summary>
                <ul className="file-problems">{scan.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </details>
            )}
            {problems.length > 0 && (
              <details style={{ marginTop: 12 }} open={job.status === 'needs_attention'}>
                <summary className="muted" style={{ cursor: 'pointer', fontSize: 13 }}>{problems.length} files needing attention</summary>
                <ul className="file-problems">{problems.map(p => (
                  <li key={p.path}><span className="mono">{p.path}</span>{p.error}</li>
                ))}</ul>
              </details>
            )}
          </>
        )}
      </section>

      {/* ----------------------------------------------------------- billing */}
      {scan && target && (
        <section className="panel">
          <span className="eyebrow">BILLING PREVIEW</span>
          <h2 style={{ fontSize: 20 }}>{service ? service.name : target.serviceType || 'This deliverable'}</h2>

          {!repriceable ? (
            <>
              <p className="notice" style={{ marginTop: 0 }}>
                {deliverable?.extraInvoiceId
                  ? 'This extra has already been invoiced, so its price is fixed.'
                  : 'This is part of an agreed package. Measuring the folder records the workload; it does not reprice what was quoted.'}
              </p>
              <table className="ledger"><tbody>
                <tr><td>Agreed price</td><td>{currency} {agreedCharge.toLocaleString('en-IN')}</td></tr>
              </tbody></table>
            </>
          ) : !service ? (
            <p className="notice" style={{ marginTop: 0 }}>
              “{target.serviceType || 'This service'}” is not one of the four services priced by measurement
              (Short Form, Long Form, Edited Photos, Album), so it is billed in Studio OS as usual.
            </p>
          ) : (
            <>
              <p className="muted" style={{ marginTop: 0 }}>{service.note}</p>
              <div className="field-row">
                <label>Rate ({currency} {service.rateSuffix})
                  <input type="number" min="0" step="1" value={rate} onChange={e => setTypedRate(e.target.value)}
                    placeholder={cardRate ? String(cardRate) : 'Enter the agreed rate'} />
                </label>
                {service.basis === 'per_output_minute' ? (
                  <label>Finished length
                    <span style={{ display: 'flex', gap: 8 }}>
                      <input type="number" min="0" step="1" value={outputMinutes} onChange={e => setOutputMinutes(Number(e.target.value))} aria-label="Output minutes" />
                      <input type="number" min="0" max="59" step="1" value={outputSeconds} onChange={e => setOutputSeconds(Number(e.target.value))} aria-label="Output seconds" />
                    </span>
                  </label>
                ) : service.basis === 'per_photo' ? (
                  <label>Keep / selected percentage
                    <input type="number" min="0" max="100" step="1" value={keepPercent} onChange={e => setKeepPercent(Number(e.target.value))} />
                  </label>
                ) : service.basis === 'per_sheet' ? (
                  <label>Photos per sheet
                    <input type="number" min="1" max="100" step="1" value={photosPerSheet} onChange={e => setPhotosPerSheet(Number(e.target.value))} />
                  </label>
                ) : <label>Measured from the folder<input value={formatDuration(scan.totalDurationSeconds)} readOnly /></label>}
              </div>

              {['per_photo', 'per_sheet'].includes(service.basis) && (
                <label>Billable {service.basis === 'per_photo' ? 'photos' : 'sheets'} — override the calculation
                  <input type="number" min="0" step="1" value={override} onChange={e => setOverride(e.target.value)}
                    placeholder={String(billing.result?.pricing.quantity ?? '')} />
                </label>
              )}

              {billing.error ? <p className="warning">{billing.error}</p> : billing.result && (
                <table className="ledger"><tbody>
                  {service.basis === 'per_photo' && (
                    <tr><td>{formatCount(scan.billablePhotos)} photos counted, {keepPercent}% kept</td>
                      <td>{formatCount(billing.result.keptPhotos)} billable · {formatCount(billing.result.excludedPhotos)} excluded</td></tr>
                  )}
                  {service.basis === 'per_sheet' && (
                    <tr><td>{formatCount(scan.billablePhotos)} photos ÷ {photosPerSheet}, rounded up</td>
                      <td>{formatCount(billing.result.estimatedSheets)} sheets</td></tr>
                  )}
                  {service.basis === 'per_raw_hour' && (
                    <tr><td>Raw footage across all cameras</td><td>{formatDuration(scan.totalDurationSeconds)}</td></tr>
                  )}
                  <tr><td>{describeBilling(billing.result.pricing) || 'Enter a rate to price this'}</td>
                    <td>{isMinimumApplied(billing.result.pricing) ? service.minimumNote ? 'minimum applied' : '' : ''}</td></tr>
                  <tr className="total"><td>Total, before tax</td><td>{currency} {amount.toLocaleString('en-IN')}</td></tr>
                </tbody></table>
              )}
              <p className="muted" style={{ fontSize: 12.5 }}>
                The percentage sets what is expected to be edited. It never chooses or deletes photos —
                every source file still uploads for the editor to select from. Tax is added on the Studio OS invoice.
              </p>
            </>
          )}

          <div className="actions">
            <button disabled={busy === 'billing' || (repriceable && !!service && (!billing.result || amount <= 0))}
              onClick={() => void run('billing', async () => {
                const invoice = await saveBilling(target, snapshot('draft'), agreedCharge);
                await window.api.saveInvoice(job.id, invoice);
              }, 'Billing saved onto the job in Studio OS.')}>Save billing to Studio OS</button>
            <button disabled={busy === 'issue' || amount <= 0 || job.invoice?.status === 'issued'}
              onClick={() => void run('issue', async () => {
                const invoice = await saveBilling(target, snapshot('issued'), agreedCharge);
                await window.api.saveInvoice(job.id, invoice);
              }, 'Invoice issued. Issued invoices cannot be changed — adjust with a separate document.')}>
              {job.invoice?.status === 'issued' ? 'Invoice issued' : 'Issue invoice'}
            </button>
            <button className="text-button" disabled={amount <= 0}
              onClick={() => void run('pdf', () => downloadInvoice(job.invoice ?? snapshot('draft')))}>Download PDF</button>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------ upload */}
      <section className="panel">
        <span className="eyebrow">TRANSFER</span>
        <h2 style={{ fontSize: 20 }}>
          {job.status === 'completed' ? 'Verified and ready to share' : 'Send to Google Drive'}
        </h2>

        {job.status !== 'scanning' && (
          <>
            <div className="bar"><span style={{ width: `${(progressFraction(job) * 100).toFixed(1)}%` }} /></div>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              {formatBytes(job.uploadedBytes)} of {formatBytes(scan?.totalBytes || 0)} · {remainingSummary(job)}
              {job.driveAccount ? ` · ${job.driveAccount}` : ''}
            </p>
            {moving && bytesPerSecond > 0 && (
              <p className="mono" style={{ fontSize: 12.5, color: 'var(--burgundy)', margin: '4px 0 0' }}>
                {formatSpeed(bytesPerSecond)} · {formatEta(remaining, bytesPerSecond)}
              </p>
            )}
          </>
        )}
        {job.currentFile && <p className="mono muted" style={{ fontSize: 12.5 }}>{job.currentFile}</p>}

        {job.status === 'completed' ? <ShareActions job={job} refresh={refresh} /> : (
          <>
            <p className="muted" style={{ fontSize: 13 }}>
              Every file is checked against Drive by size and checksum after it lands. The folder is only
              called ready when all of them pass, and re-running it sends nothing that is already verified.
            </p>
            <div className="actions">
              {canUpload && !needsConfirming && (
                <button className="primary" disabled={busy === 'start'}
                  onClick={() => void run('start', () => window.api.enqueue(job.id, target!, job.invoice ?? (amount > 0 ? snapshot('draft') : undefined)),
                    'Queued. It keeps going with this window closed.')}>
                  {job.completedFiles > 0 ? 'Resume upload' : 'Start upload'}
                </button>
              )}
              {canUpload && needsConfirming && (
                <button className="primary" onClick={() => setConfirmingProblems(true)}>Start upload…</button>
              )}
              {['queued', 'uploading', 'verifying', 'waiting_network', 'waiting_quota'].includes(job.status) && (
                <button disabled={busy === 'pause'} onClick={() => void run('pause', () => window.api.pause(job.id))}>Pause</button>
              )}
              {job.status === 'needs_attention' && (
                <button disabled={busy === 'relocate'} onClick={() => void run('relocate', () => window.api.relocate(job.id))}>Locate folder</button>
              )}
              {job.status === 'scanning' && (
                <button disabled={busy === 'cancel'} onClick={() => void run('cancel', () => window.api.cancelScan(job.id))}>Cancel scan</button>
              )}
            </div>
          </>
        )}
      </section>

      {confirmingProblems && canUpload && (
        <div className="modal-shade">
          <section className="work-modal" role="dialog" aria-modal="true" aria-labelledby="gaps-title">
            <header>
              <div>
                <span className="eyebrow">BEFORE YOU SEND</span>
                <h2 id="gaps-title">
                  {scan!.missingClipCount > 0 && (scan!.unreadableFiles?.length || 0) > 0
                    ? `${formatCount(scan!.missingClipCount)} files missing, ${formatCount(scan!.unreadableFiles?.length || 0)} unreadable`
                    : scan!.missingClipCount > 0
                      ? `${formatCount(scan!.missingClipCount)} files look missing`
                      : `${formatCount(scan!.unreadableFiles?.length || 0)} files could not be read`}
                </h2>
              </div>
            </header>
            <p className="muted" style={{ marginTop: 0 }}>
              Fixing this now costs minutes. Finding out afterwards costs the upload — and, if nobody
              notices, costs the wedding.
            </p>
            {scan!.missingClipCount > 0 && (
              <>
                <p style={{ marginBottom: 4, fontWeight: 600, fontSize: 14 }}>Missing from the numbering</p>
                <ul className="file-problems" style={{ maxHeight: 170 }}>
                  {scan!.missingClips.map(gap => (
                    <li key={`${gap.folder}:${gap.label}`}>
                      <span className="mono">{gap.folder ? `${gap.folder}/` : ''}{gap.label}</span>
                      {formatCount(gap.missingCount)} missing: {gap.missing.join(', ')}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {(scan!.unreadableFiles?.length || 0) > 0 && (
              <>
                <p style={{ margin: '12px 0 4px', fontWeight: 600, fontSize: 14 }}>Here but unreadable</p>
                <ul className="file-problems" style={{ maxHeight: 170 }}>
                  {(scan!.unreadableFiles || []).slice(0, 60).map(file => (
                    <li key={file.path}><span className="mono">{file.path}</span>{file.reason}</li>
                  ))}
                </ul>
              </>
            )}
            {error && <p className="error" role="alert">{error}</p>}
            <p className="notice">
              Some cameras skip numbers legitimately — deleted takes, a card formatted mid-shoot — so this
              asks rather than refuses. But note that a readable header is not proof a clip is whole: a
              file can be truncated part way and still report a duration. Checksum verification catches
              damage in transit, not damage that was already on the card.
            </p>
            <div className="actions">
              <button disabled={busy === 'start'} onClick={() => setConfirmingProblems(false)}>Go back and check</button>
              <button className="primary" disabled={busy === 'start'}
                onClick={() => void run('start', async () => {
                  await window.api.enqueue(job.id, target!, job.invoice ?? (amount > 0 ? snapshot('draft') : undefined));
                  setConfirmingProblems(false);
                }, 'Queued. It keeps going with this window closed.')}>
                Upload anyway
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
