import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Download, ExternalLink, FilePlus2, Film, FolderPlus, HardDrive, MessageCircle, MessageSquarePlus, Plus, Upload } from 'lucide-react';
import type { DriveStatus, ScanOptions, Transfer, WorkTarget } from '../../../../shared/contracts';
import { useApp } from '../../context/AppContext';
import { NewWorkModal } from '../NewWorkModal';
import { ManualRawDataModal } from '../ManualRawDataModal';
import { archiveFinalDelivery, assignEditor, advanceStage, confirmClientFinalDownload, markRevisionShared, saveRawDataLink, sendBaawarayDeliverableToPostProduction, syncEditorAuthUid, updateJobRequiredDays } from '../../lib/studioRepository';
import { ChangesModal } from '../ChangesModal';
import { getFreelanceStageMeta } from '../../utils/formatters';
import type { FreelanceJobStage } from '../../types/freelance';
import { normaliseServices, resolveRoleGroups } from '../../utils/studioRoles';
import { cloudErrorMessage } from '../../utils/cloudErrors';
import { isDeliverablesTeamMember } from '../../utils/freelance';
import { editorMessage, linkMessage, whatsappUrl } from '../../utils/editorMessage';
import { formatBytes, formatCount, progressFraction, statusLabel } from '../../utils/uploadFormat';
import type { ClientDeliverable, TeamMember } from '../../types';

/**
 * One row per job, holding everything that job needs.
 *
 * Raw data and the finished delivery used to live on separate screens from the
 * work they belonged to, so tracking a job meant looking in two places and
 * matching titles by eye. Everything a job has — who is editing it, where its
 * footage went, the link to send them, the link they sent back — is here.
 */
interface Row {
  key: string;
  jobId: string;
  title: string;
  client: string;
  partnerId?: string;
  service: string;
  due: string;
  stage?: string;
  editorMemberId?: number;
  editorName?: string;
  editorPhone?: string;
  downloadedAt?: string;
  requiredDays?: number;
  /** What the editor delivered back. They supply it; the studio does not upload it. */
  deliveryLink?: string;
  /** Raw data that arrived as a link — a partner studio's Drive, WeTransfer, a NAS. */
  rawDataLink?: string;
  rawDataSource?: 'upload' | 'hard_drive' | 'link';
  rawDurationHours?: number;
  rawDurationMinutes?: number;
  rawPhotoCount?: number;
  postProductionJobIds?: string[];
  clientFinalDownloadConfirmedAt?: string;
  target: WorkTarget;
}

type PartnerWorkView = 'active' | 'completed' | 'payment_received' | 'archive';
type PartnerStageFilter = 'all' | FreelanceJobStage;

const PARTNER_STAGE_OPTIONS: { value: PartnerStageFilter; label: string }[] = [
  { value: 'all', label: 'All project stages' },
  { value: 'pending_assignment', label: 'Awaiting Assignment' },
  { value: 'data_received', label: 'Data Received' },
  { value: 'editor_assigned', label: 'Editor Assigned' },
  { value: 'sent_to_editor', label: 'With Editor' },
  { value: 'draft_received', label: 'Draft in Review' },
  { value: 'sent_to_client', label: 'Client Review' },
  { value: 'changes_received', label: 'Changes Received' },
  { value: 'changes_sent_to_editor', label: 'Changes with Editor' },
  { value: 'final_delivered', label: 'Final Delivered' },
  { value: 'completed', label: 'Completed' },
];

const STAGE_TONE: Record<string, string> = {
  pending_assignment: 'idle', data_received: 'warn', editor_assigned: 'busy', sent_to_editor: 'busy',
  draft_received: 'busy', sent_to_client: 'busy', changes_received: 'stop',
  changes_sent_to_editor: 'warn', final_delivered: 'done', completed: 'done',
};

export function WorkScreen({ kind, transfers, drive, onScanStarted, onSettings, onOpen }: {
  kind: 'freelance' | 'deliverables';
  transfers: Transfer[]; drive: DriveStatus | null;
  onScanStarted: (id: string | null) => void; onSettings: () => void; onOpen: (id: string) => void;
}): React.JSX.Element {
  const studio = useApp();
  const destName = studio.studioSettings?.uploader?.destination === 'b2' ? 'Backblaze B2' : 'Google Drive';
  const [query, setQuery] = useState('');
  const [partnerFilter, setPartnerFilter] = useState('all');
  const [editorFilter, setEditorFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState<PartnerStageFilter>('all');
  const [workView, setWorkView] = useState<PartnerWorkView>('active');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [changesFor, setChangesFor] = useState<Row | null>(null);
  const [manualRawFor, setManualRawFor] = useState<Row | null>(null);

  const options: ScanOptions = useMemo(() => ({
    excludedBillingFolders: studio.studioSettings?.uploader?.excludedBillingFolders ?? ['Proxies', 'Proxy', 'Exports'],
    countPhotoPairsOnce: studio.studioSettings?.uploader?.countPhotoPairsOnce ?? true,
  }), [studio.studioSettings]);

  const roles = useMemo(() => {
    const groups = resolveRoleGroups(studio.studioSettings?.roleGroups);
    return normaliseServices(studio.studioSettings?.crewRoles || studio.studioPriceList?.crewRoles || [], groups);
  }, [studio.studioSettings, studio.studioPriceList]);

  const editors = useMemo(
    () => studio.team.filter((m: TeamMember) => m.active !== false && isDeliverablesTeamMember(m)),
    [studio.team]);

  const rows = useMemo<Row[]>(() => {
    if (kind === 'freelance') {
      return studio.freelanceJobs.map(job => {
        const record = job as typeof job & { stage?: string; deliveryLink?: string; finalDeliveryLink?: string; rawDataLink?: string };
        return {
          key: String(job.id), jobId: String(job.id), title: job.title,
          client: job.clientName, partnerId: job.freelanceClientId, service: String(job.serviceType || ''), due: job.dueDate || '—',
          stage: record.stage, editorMemberId: job.editorMemberId,
          editorName: job.editorName, editorPhone: job.editorPhone,
          deliveryLink: record.deliveryLink || record.finalDeliveryLink,
          rawDataLink: record.rawDataLink,
          clientFinalDownloadConfirmedAt: record.clientFinalDownloadConfirmedAt,
          downloadedAt: job.downloadedAt,
          requiredDays: job.requiredDays ?? 2,
          target: {
            kind: 'freelance', id: String(job.id), title: job.title, clientName: job.clientName,
            serviceType: String(job.serviceType || ''), purpose: 'raw', jobCode: job.jobCode,
            dueDate: job.dueDate, brief: job.description,
            recipientName: job.editorName, recipientPhone: job.editorPhone, recipientEmail: job.editorEmail,
          },
        };
      });
    }
    return studio.clients.flatMap(client => (client.deliverables || []).map((item: ClientDeliverable) => {
      const role = roles.find(r => r.id === item.linkedRoleId);
      const member = studio.team.find((m: TeamMember) => m.id === item.assignedMemberId);
      return {
        key: `${client.id}:${item.id}`, jobId: item.id, title: item.title,
        client: client.name, service: role?.name || item.category || 'Deliverable',
        due: item.dueDate || '—', stage: item.status,
        editorMemberId: item.assignedMemberId, editorName: member?.name, editorPhone: member?.phone,
        deliveryLink: item.link,
        rawDataLink: item.rawDataLink,
        rawDataSource: item.rawDataSource,
        rawDurationHours: item.rawDurationHours,
        rawDurationMinutes: item.rawDurationMinutes,
        rawPhotoCount: item.rawPhotoCount,
        postProductionJobIds: item.postProductionJobIds,
        target: {
          kind: 'deliverable', id: item.id, clientId: String(client.id), title: item.title,
          clientName: client.name, serviceType: role?.name || item.category || '', purpose: 'raw',
          dueDate: item.dueDate, brief: item.notes,
          recipientName: member?.name, recipientPhone: member?.phone, recipientEmail: member?.email,
        },
      };
    }));
  }, [kind, studio.freelanceJobs, studio.clients, studio.team, roles]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const selectedPartner = partnerFilter === 'all'
      ? undefined
      : studio.freelanceClients.find(client => String(client.id) === partnerFilter);
    return rows.filter(row => {
      if (needle && !`${row.title} ${row.client} ${row.service} ${row.editorName || ''}`.toLowerCase().includes(needle)) return false;
      if (kind === 'freelance' && partnerFilter !== 'all') {
        const linked = row.partnerId && String(row.partnerId) === partnerFilter;
        const legacyNameMatch = !row.partnerId && selectedPartner
          && row.client.trim().toLowerCase() === selectedPartner.name.trim().toLowerCase();
        if (!linked && !legacyNameMatch) return false;
      }
      if (kind === 'freelance') {
        if (editorFilter !== 'all' && String(row.editorMemberId ?? '') !== editorFilter) return false;
        if (stageFilter !== 'all' && row.stage !== stageFilter) return false;
        const job = studio.freelanceJobs.find(item => String(item.id) === row.jobId);
        const fullyPaid = job?.clientPaymentStatus === 'paid';
        const archived = Boolean(job?.finalDeliveryArchivedAt);
        if (workView === 'active' && row.stage === 'completed') return false;
        if (workView === 'completed' && (row.stage !== 'completed' || fullyPaid)) return false;
        if (workView === 'payment_received' && (row.stage !== 'completed' || !fullyPaid)) return false;
        if (workView === 'archive' && !archived) return false;
      }
      return true;
    });
  }, [rows, query, kind, partnerFilter, editorFilter, stageFilter, workView, studio.freelanceClients, studio.freelanceJobs]);

  /**
   * The one stage move this app can make on its own without being told.
   *
   * A verified folder means the raw data is in hand, so a job still sitting at
   * "pending assignment" is simply out of date. Every other move needs a person
   * — only they know whether a draft is good enough to send a client.
   */
  const reconciled = useRef(new Set<string>());
  const editorBackfillAttempts = useRef(new Set<string>());
  useEffect(() => {
    if (kind !== 'freelance') return;
    for (const row of rows) {
      const transfer = transfers.find(job => job.target?.kind === 'freelance'
        && (String(job.target.id) === String(row.jobId) || (job.target.jobCode && job.target.jobCode === row.target.jobCode))
        && job.status === 'completed');

      if (row.stage !== 'pending_assignment' || reconciled.current.has(row.jobId)) continue;
      if (!transfer) continue;
      reconciled.current.add(row.jobId);
      // Do not retry automatically in this app session when Firestore rejects a
      // write. Retrying on every transfer/context update can exhaust quota even
      // faster during an outage. A restart or an explicit action can retry.
      void advanceStage(row.jobId, 'data_received', 'Raw data uploaded and verified').catch(err => {
        console.warn('Automatic data-received reconciliation failed:', err);
      });
    }

    // Ensure assigned editor's authUid is stamped on freelance_jobs parent document
    for (const job of studio.freelanceJobs) {
      if (!job.editorMemberId) continue;
      const member = studio.team.find(m => m.id === job.editorMemberId);
      const attemptKey = `${job.id}:${member?.authUid || ''}`;
      if (member?.authUid && (job as any).editorAuthUid !== member.authUid && !editorBackfillAttempts.current.has(attemptKey)) {
        editorBackfillAttempts.current.add(attemptKey);
        void syncEditorAuthUid(String(job.id), member).catch(err => console.warn('syncEditorAuthUid failed:', err));
      }
    }
  }, [kind, rows, transfers, studio.freelanceJobs, studio.team]);

  /** The raw-data transfer for this job, if one has been started. */
  function transferFor(row: Row): Transfer | undefined {
    return transfers.find(job => job.target && (
      job.target.kind === 'freelance'
        ? (String(job.target.id) === row.key || (job.target.jobCode && job.target.jobCode === row.target.jobCode))
        : `${job.target.clientId}:${job.target.id}` === row.key
    ));
  }

  async function run(key: string, fn: () => Promise<unknown>, success = ''): Promise<void> {
    setBusy(key); setError(''); setNote('');
    try { await fn(); if (success) setNote(success); }
    catch (err) { setError(cloudErrorMessage(err)); }
    finally { setBusy(''); }
  }

  /** The next stage the studio would normally move to, from the shared chain. */
  function nextOf(row: Row): { stage: string; label: string } | null {
    if (!row.stage) return null;
    const meta = getFreelanceStageMeta(row.stage as FreelanceJobStage);
    return meta.nextStage ? { stage: meta.nextStage, label: meta.nextLabel } : null;
  }

  /** The newest round of feedback, for the message to the editor. */
  function latestChanges(row: Row): string {
    const job = studio.freelanceJobs.find(j => String(j.id) === row.jobId) as { revisions?: { feedbackNotes?: string }[] } | undefined;
    return job?.revisions?.[job.revisions.length - 1]?.feedbackNotes || '';
  }

  async function downloadAndArchiveFinal(row: Row): Promise<void> {
    if (!row.deliveryLink) throw new Error('There is no final delivery to download yet.');
    const safeTitle = row.title.replace(/[^a-zA-Z0-9_-]/g, '_');
    const targetPath = await window.api.chooseSaveLocation(`${row.jobId}_${safeTitle}_Master.mp4`);
    if (!targetPath) return;
    if (!window.api.downloadDropboxFile) throw new Error('Final-delivery downloads are unavailable in this version of the desktop app.');
    await window.api.downloadDropboxFile(row.deliveryLink, targetPath);
    await archiveFinalDelivery(row.jobId, targetPath);
  }

  return (
    <div className="screen">
      <header>
        <div>
          <h2>{kind === 'freelance' ? 'Partner studio work' : 'Client deliverables'}</h2>
        </div>
        <div className="actions" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search jobs, studios, editors…"
            style={{ height: 40, boxSizing: 'border-box', font: 'inherit', fontSize: 14, padding: '9px 11px', borderRadius: 10, minWidth: 230,
              background: 'var(--panel)', border: '1px solid color-mix(in srgb, var(--line) 50%, transparent)' }} />
          <button className="primary" onClick={() => setCreating(true)} style={{ height: 40, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
            <Plus size={15} style={{ verticalAlign: -3, marginRight: 6 }} />
            {kind === 'freelance' ? 'New freelance work' : 'Add a deliverable'}
          </button>
        </div>
      </header>

      {kind === 'freelance' && (
        <div className="panel" style={{ padding: 12, marginBottom: 14, display: 'flex', alignItems: 'end', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ minWidth: 220, margin: 0 }}>
            <span className="cell-label">Partner Studio</span>
            <select value={partnerFilter} onChange={event => setPartnerFilter(event.target.value)}>
              <option value="all">All Partner Studios</option>
              {studio.freelanceClients
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(client => <option key={client.id} value={String(client.id)}>{client.name}</option>)}
            </select>
          </label>
          <label style={{ minWidth: 220, margin: 0 }}>
            <span className="cell-label">Editor Allotted</span>
            <select value={editorFilter} onChange={event => setEditorFilter(event.target.value)}>
              <option value="all">All Editors</option>
              {editors.slice().sort((a, b) => a.name.localeCompare(b.name)).map(editor => (
                <option key={editor.id} value={String(editor.id)}>{editor.name}</option>
              ))}
            </select>
          </label>
          <label style={{ minWidth: 220, margin: 0 }}>
            <span className="cell-label">Status</span>
            <select value={stageFilter} onChange={event => setStageFilter(event.target.value as PartnerStageFilter)}>
              {PARTNER_STAGE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          {(partnerFilter !== 'all' || editorFilter !== 'all' || stageFilter !== 'all' || workView !== 'active') && (
            <button type="button" onClick={() => { setPartnerFilter('all'); setEditorFilter('all'); setStageFilter('all'); setWorkView('active'); }}>Clear filters</button>
          )}
          <label style={{ minWidth: 220, margin: 0 }}>
            <span className="cell-label">Project View</span>
            <select value={workView} onChange={event => setWorkView(event.target.value as PartnerWorkView)}>
              <option value="active">Active Projects</option>
              <option value="completed">Completed — Payment Pending</option>
              <option value="payment_received">Payment Received</option>
              <option value="archive">Archive</option>
            </select>
          </label>
        </div>
      )}

      {studio.error && <p className="error" role="alert">{studio.error}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {note && <p className="success" role="status">{note}</p>}

      {studio.loading && rows.length === 0 ? <p className="muted">Loading from Studio OS…</p>
        : filtered.length === 0 ? (
          <div className="panel empty">
            <h3>Nothing here yet</h3>
            <p>{query || partnerFilter !== 'all' || editorFilter !== 'all' || stageFilter !== 'all' || workView !== 'active' ? 'No work matches the selected filters.' : 'Create the work first, then come back to send its raw data.'}</p>
          </div>
        ) : filtered.map(row => {
          const transfer = transferFor(row);
          const label = transfer ? statusLabel(transfer.status) : null;
          const done = transfer?.status === 'completed';
          const message = transfer && done ? editorMessage(transfer, studio.studioSettings?.studioName || 'Baawaray Films') : '';

          return (
            <article key={row.key} className="panel job-card">
              <div className="job-head">
                <div>
                  <div className="job-title">{row.title}</div>
                  <div className="sub">
                    {row.client}{row.service ? ` · ${row.service}` : ''} · due {row.due}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                  {kind === 'freelance' && row.stage && (
                    <span className={`status-pill ${STAGE_TONE[row.stage] || 'idle'}`}>
                      {getFreelanceStageMeta(row.stage as FreelanceJobStage).label}
                    </span>
                  )}
                  {label && <span className={`status-pill ${label.tone}`}>{label.text}</span>}
                </div>
              </div>

              {kind === 'freelance' && row.stage && (
                <div className="stage-row">
                  <span className="muted">{getFreelanceStageMeta(row.stage as FreelanceJobStage).description}</span>
                  <span style={{ flex: 1 }} />
                  <button disabled={busy === `${row.key}:changes`} onClick={() => setChangesFor(row)}>
                    <MessageSquarePlus size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Log changes
                  </button>
                  {row.stage === 'changes_received' && row.editorPhone && (
                    <button className="primary" disabled={busy === `${row.key}:sendchanges`}
                      onClick={() => void run(`${row.key}:sendchanges`, async () => {
                        await window.api.openExternal(whatsappUrl(
                          `Changes on ${row.title}:\n\n${latestChanges(row) || 'See the notes on the job.'}`, row.editorPhone));
                        await markRevisionShared(row.jobId);
                      }, 'WhatsApp opened, and the job moved to Changes with Editor.')}>
                      Send changes to editor
                    </button>
                  )}
                  {['sent_to_client', 'final_delivered'].includes(row.stage) && row.stage !== 'completed' && (
                    <button
                      className="primary"
                      style={{ background: '#2f6b34', borderColor: '#2f6b34' }}
                      disabled={busy === `${row.key}:final`}
                      onClick={() => void run(`${row.key}:final`, () =>
                        advanceStage(row.jobId, row.stage === 'sent_to_client' ? 'final_delivered' : 'completed',
                          row.stage === 'sent_to_client' ? 'Client approved final deliverable' : 'Project work completed'),
                        row.stage === 'sent_to_client'
                          ? 'Client approval recorded. Complete the project when ready.'
                          : 'Project completed. Payment status remains tracked separately.')}
                    >
                      <Check size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{row.stage === 'sent_to_client' ? 'Mark as Final' : 'Mark Completed'}
                    </button>
                  )}
                  {row.stage === 'completed' && studio.freelanceJobs.find(job => String(job.id) === row.jobId)?.clientPaymentStatus === 'paid' && (
                    row.clientFinalDownloadConfirmedAt ? (
                      <span className="muted" style={{ fontSize: 12 }}>Client download confirmed</span>
                    ) : (
                      <button disabled={busy === `${row.key}:client-download`}
                        onClick={() => void run(`${row.key}:client-download`, () => confirmClientFinalDownload(row.jobId),
                          'Client final download confirmed. You can now download and archive the studio master.')}>
                        <Check size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Confirm client download
                      </button>
                    )
                  )}
                  {nextOf(row) && nextOf(row)!.stage !== 'completed' && (
                    <button disabled={busy === `${row.key}:stage`}
                      onClick={() => void run(`${row.key}:stage`, () =>
                        advanceStage(row.jobId, nextOf(row)!.stage, nextOf(row)!.label),
                        `Moved to ${nextOf(row)!.label}.`)}>
                      {nextOf(row)!.label}
                    </button>
                  )}
                </div>
              )}

              <div className="job-grid">
                {/* ------------------------------------------------- editor */}
                <div className="job-cell">
                  <div className="cell-label">Editor</div>
                  {kind === 'freelance' ? (
                    <>
                      <select
                        value={row.editorMemberId ?? ''}
                        disabled={busy === `${row.key}:editor`}
                        onChange={e => {
                          const member = editors.find(m => String(m.id) === e.target.value) || null;
                          void run(`${row.key}:editor`, () => assignEditor(row.jobId, member),
                            member ? `${member.name} assigned.` : 'Editor cleared.');
                        }}>
                        <option value="">Assign later</option>
                        {editors.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="muted" style={{ fontSize: 11.5 }}>Allocated Editing:</span>
                        <select
                          value={row.requiredDays ?? 2}
                          disabled={busy === `${row.key}:days`}
                          style={{ padding: '2px 6px', fontSize: 12, borderRadius: 6, background: 'var(--paper)', border: '1px solid var(--line)' }}
                          onChange={e => {
                            const days = parseInt(e.target.value, 10);
                            void run(`${row.key}:days`, () => updateJobRequiredDays(row.jobId, days), `${days} days allocated to this edit.`);
                          }}>
                          <option value={1}>1 Day</option>
                          <option value={2}>2 Days (Default)</option>
                          <option value={3}>3 Days</option>
                          <option value={4}>4 Days</option>
                          <option value={5}>5 Days</option>
                          <option value={7}>7 Days (1 Week)</option>
                          <option value={10}>10 Days</option>
                        </select>
                      </div>
                      <div style={{ marginTop: 5, fontSize: 11.5 }}>
                        {row.downloadedAt ? (
                          <span style={{ color: 'var(--accent, #3b82f6)', fontWeight: 500 }}>
                            ✓ Downloaded: {new Date(row.downloadedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                        ) : (
                          <span className="muted" title="Raw data can be downloaded by editor anytime">
                            ⏳ Download pending
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="cell-value">{row.editorName || 'Not assigned'}</div>
                  )}
                  {row.editorPhone && (
                    <button className="text-button" style={{ paddingLeft: 0, marginTop: 4 }}
                      onClick={() => void window.api.openExternal(whatsappUrl(
                        message || `Hi ${row.editorName || ''}, about ${row.title}.`, row.editorPhone))}>
                      <MessageCircle size={13} style={{ verticalAlign: -2, marginRight: 5 }} />
                      WhatsApp {row.editorName?.split(' ')[0]}
                    </button>
                  )}
                </div>

                {kind === 'deliverables' && (
                  <div className="job-cell">
                    <div className="cell-label">Post Production</div>
                    {row.postProductionJobIds?.length ? (
                      <div className="cell-value">{row.postProductionJobIds.length} linked project{row.postProductionJobIds.length === 1 ? '' : 's'}</div>
                    ) : (row.rawDataLink || row.rawDataSource === 'hard_drive') ? (
                      <button className="primary" disabled={busy === `${row.key}:post-production`}
                        onClick={() => void run(`${row.key}:post-production`, async () => {
                          const requested = window.prompt('Services for Post Production (comma-separated):\nShort Form, Long Form, Edited Photos, Album');
                          if (!requested) return;
                          const services = requested.split(',').map(service => service.trim()).filter(Boolean);
                          const allowed = ['Short Form', 'Long Form', 'Edited Photos', 'Album'];
                          if (services.some(service => !allowed.includes(service))) throw new Error(`Use only: ${allowed.join(', ')}.`);
                          await sendBaawarayDeliverableToPostProduction(row.target.clientId!, {
                            id: row.jobId, title: row.title, category: row.service, status: 'pending', rawDataLink: row.rawDataLink, dueDate: row.due,
                            rawDataSource: row.rawDataSource, rawDurationHours: row.rawDurationHours,
                            rawDurationMinutes: row.rawDurationMinutes, rawPhotoCount: row.rawPhotoCount,
                          }, services);
                        }, 'Linked Post Production project created.')}>Send to Post Production</button>
                    ) : <div className="muted">Upload raw data to {destName} or log hard drive handover before sending to Post Production.</div>}
                  </div>
                )}

                {/* ----------------------------------------------- raw data */}
                <div className="job-cell">
                  <div className="cell-label">Raw data</div>
                  {done ? (
                    <>
                      <div className="cell-value" style={{ fontWeight: 600 }}>
                        {formatCount(transfer.scan?.fileCount || 0)} files · {formatBytes(transfer.scan?.totalBytes || 0)}
                      </div>
                      <div className="sub" style={{ fontSize: 11.5, color: '#2f6b34', marginTop: 2 }}>
                        ✓ Uploaded to {destName}
                      </div>
                      <div className="link-row" style={{ marginTop: 6 }}>
                        {row.editorPhone && (
                          <button className="primary" disabled={busy === `${row.key}:send`}
                            onClick={() => void run(`${row.key}:send`, async () => {
                              if (transfer.link) await saveRawDataLink(row.target, transfer.link);
                              await window.api.openExternal(whatsappUrl(
                                `Hi ${row.editorName || ''}, raw footage for "${row.title}" is uploaded to ${destName} and ready for direct download in the Desktop App.`,
                                row.editorPhone
                              ));
                              await window.api.markMessagePrepared(transfer.id);
                              if (kind === 'freelance') await advanceStage(row.jobId, 'sent_to_editor', 'Raw data ready for editor');
                            }, 'WhatsApp opened.')}>
                            <MessageCircle size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Notify Editor
                          </button>
                        )}
                        <button disabled={busy === `${row.key}:more`}
                          onClick={() => void run(`${row.key}:more`, async () => {
                            if (await window.api.rescan(transfer.id)) onOpen(transfer.id);
                          })}>
                          <FolderPlus size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Add more files
                        </button>
                      </div>
                    </>
                  ) : transfer ? (
                    <>
                      <div className="bar"><span style={{ width: `${(progressFraction(transfer) * 100).toFixed(1)}%` }} /></div>
                      <div className="cell-value muted" style={{ marginTop: 6 }}>
                        {formatBytes(transfer.uploadedBytes)} of {formatBytes(transfer.scan?.totalBytes || 0)}
                      </div>
                      <button onClick={() => onOpen(transfer.id)}>Open transfer</button>
                    </>
                  ) : row.rawDataSource === 'hard_drive' ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                        <HardDrive size={15} style={{ color: 'var(--burgundy)' }} />
                        Physical Hard Drive Handed Over
                      </div>
                      <div className="sub" style={{ fontSize: 11.5, marginTop: 2 }}>
                        {row.service === 'Long Form'
                          ? `${row.rawDurationHours || 0}h ${row.rawDurationMinutes || 0}m raw video`
                          : (row.service === 'Edited Photos' || row.service === 'Album')
                          ? `${row.rawPhotoCount || 0} photos`
                          : row.service === 'Short Form'
                          ? 'Source footage logged'
                          : `${row.rawDurationHours || 0}h ${row.rawDurationMinutes || 0}m raw video · ${row.rawPhotoCount || 0} photos`}
                      </div>
                      <div className="link-row" style={{ marginTop: 6 }}>
                        <button onClick={() => setManualRawFor(row)}>
                          <HardDrive size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Edit drive details
                        </button>
                        <button disabled={busy === row.key} onClick={() => void run(row.key, async () => {
                          onScanStarted(await window.api.scan(options, row.target));
                        })}>
                          <Upload size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Upload to {destName}
                        </button>
                      </div>
                    </>
                  ) : row.rawDataLink ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                        <Film size={15} style={{ color: 'var(--burgundy)' }} />
                        Raw Footage Uploaded
                      </div>
                      <div className="sub" style={{ fontSize: 11.5, color: '#2f6b34', marginTop: 2 }}>
                        {row.rawDataLink.startsWith('b2://') || row.rawDataLink.includes('backblazeb2.com')
                          ? '✓ Backblaze B2 · Available for editor direct download'
                          : '✓ Shared Cloud Link · Available for editor download'}
                      </div>
                      <div className="link-row" style={{ marginTop: 6 }}>
                        {row.editorPhone && (
                          <button className="primary" disabled={busy === `${row.key}:send`}
                            onClick={() => void run(`${row.key}:send`, async () => {
                              await window.api.openExternal(whatsappUrl(
                                `Hi ${row.editorName || ''}, raw footage for "${row.title}" is uploaded to ${destName} and ready for direct download in the Desktop App.`,
                                row.editorPhone
                              ));
                              if (kind === 'freelance') await advanceStage(row.jobId, 'sent_to_editor', 'Raw data ready for editor');
                            }, 'WhatsApp opened.')}>
                            <MessageCircle size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Notify Editor
                          </button>
                        )}
                        <button disabled={busy === row.key} onClick={() => void run(row.key, async () => {
                          onScanStarted(await window.api.scan(options, row.target));
                        })}>
                          <Upload size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Replace folder
                        </button>
                        <button disabled={busy === `${row.key}:files`} onClick={() => void run(`${row.key}:files`, async () => {
                          onScanStarted(await window.api.scanFiles(options, row.target));
                        })}>
                          <FilePlus2 size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Upload files
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="cell-value muted" style={{ fontSize: 12 }}>
                        No raw footage uploaded or logged yet.
                      </div>
                      <div className="link-row" style={{ marginTop: 6 }}>
                        <button className="primary" disabled={busy === row.key} onClick={() => void run(row.key, async () => {
                          onScanStarted(await window.api.scan(options, row.target));
                        })}>
                          <Upload size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Upload folder ({destName})
                        </button>
                        <button disabled={busy === `${row.key}:files`} onClick={() => void run(`${row.key}:files`, async () => {
                          onScanStarted(await window.api.scanFiles(options, row.target));
                        })}>
                          <FilePlus2 size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Upload files ({destName})
                        </button>
                        <button onClick={() => setManualRawFor(row)}>
                          <HardDrive size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Enter hard drive / link details
                        </button>
                      </div>
                    </>
                  )}
                  {transfer?.error && <p className="warning" style={{ fontSize: 12.5 }}>{transfer.error}</p>}
                </div>

                {/* ----------------------------------------- final delivery */}
                <div className="job-cell">
                  <div className="cell-label">Final delivery</div>
                  {row.deliveryLink ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#2f6b34' }}>
                        <Check size={14} />
                        Deliverable Ready
                      </div>
                      <div className="sub" style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                        Uploaded directly to Studio Dropbox
                      </div>
                      <div className="link-row" style={{ marginTop: 8 }}>
                        <button onClick={() => void window.api.openExternal(row.deliveryLink!)}>
                          <ExternalLink size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Preview Cut
                        </button>
                        {kind === 'freelance' && (
                          <button disabled={busy === `${row.key}:archive`}
                            onClick={() => void run(`${row.key}:archive`, () => downloadAndArchiveFinal(row),
                              'Final delivery downloaded and sent to the local archive.')}>
                            <Download size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Download &amp; archive
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="cell-value muted" style={{ fontSize: 12 }}>
                      Waiting for editor deliverable. Editor uploads directly through the Desktop App to Studio Dropbox.
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}

      {creating && (
        <NewWorkModal
          kind={kind}
          onClose={() => setCreating(false)}
          onScanStarted={onScanStarted}
          options={options}
        />
      )}
      {changesFor && (
        <ChangesModal jobId={changesFor.jobId} jobTitle={changesFor.title} editorName={changesFor.editorName}
          onClose={() => setChangesFor(null)}
          onSaved={round => { setChangesFor(null); setNote(`Round ${round} logged. Send it to the editor when ready.`); }} />
      )}
      {manualRawFor && <ManualRawDataModal target={manualRawFor.target} title={manualRawFor.title} onClose={() => setManualRawFor(null)} onSaved={() => { setManualRawFor(null); setNote('Physical hard drive details saved.'); }} />}
    </div>
  );
}
