import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, FolderPlus, Link as LinkIcon, MessageCircle, MessageSquarePlus, Plus } from 'lucide-react';
import type { DriveStatus, ScanOptions, Transfer, WorkTarget } from '../../../../shared/contracts';
import { useApp } from '../../context/AppContext';
import { NewWorkModal } from '../NewWorkModal';
import { assignEditor, advanceStage, markRevisionShared, saveRawDataLink } from '../../lib/studioRepository';
import { ChangesModal } from '../ChangesModal';
import { getFreelanceStageMeta } from '../../utils/formatters';
import type { FreelanceJobStage } from '../../types/freelance';
import { normaliseServices, resolveRoleGroups } from '../../utils/studioRoles';
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
  service: string;
  due: string;
  stage?: string;
  editorMemberId?: number;
  editorName?: string;
  editorPhone?: string;
  /** What the editor delivered back. They supply it; the studio does not upload it. */
  deliveryLink?: string;
  /** Raw data that arrived as a link — a partner studio's Drive, WeTransfer, a NAS. */
  rawDataLink?: string;
  target: WorkTarget;
}

const STAGE_TONE: Record<string, string> = {
  pending_assignment: 'idle', data_received: 'warn', sent_to_editor: 'busy',
  draft_received: 'busy', sent_to_client: 'busy', changes_received: 'stop',
  changes_sent_to_editor: 'warn', final_delivered: 'done', completed: 'done',
};

export function WorkScreen({ kind, transfers, drive, onScanStarted, onSettings, onOpen }: {
  kind: 'freelance' | 'deliverables';
  transfers: Transfer[]; drive: DriveStatus | null;
  onScanStarted: (id: string | null) => void; onSettings: () => void; onOpen: (id: string) => void;
}): React.JSX.Element {
  const studio = useApp();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [changesFor, setChangesFor] = useState<Row | null>(null);
  const [editingLink, setEditingLink] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState('');

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
          client: job.clientName, service: String(job.serviceType || ''), due: job.dueDate || '—',
          stage: record.stage, editorMemberId: job.editorMemberId,
          editorName: job.editorName, editorPhone: job.editorPhone,
          deliveryLink: record.deliveryLink || record.finalDeliveryLink,
          rawDataLink: record.rawDataLink,
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
    if (!needle) return rows;
    return rows.filter(row => `${row.title} ${row.client} ${row.service} ${row.editorName || ''}`.toLowerCase().includes(needle));
  }, [rows, query]);

  /**
   * The one stage move this app can make on its own without being told.
   *
   * A verified folder means the raw data is in hand, so a job still sitting at
   * "pending assignment" is simply out of date. Every other move needs a person
   * — only they know whether a draft is good enough to send a client.
   */
  const reconciled = useRef(new Set<string>());
  useEffect(() => {
    if (kind !== 'freelance') return;
    for (const row of rows) {
      if (row.stage !== 'pending_assignment' || reconciled.current.has(row.jobId)) continue;
      const transfer = transfers.find(job => job.target?.kind === 'freelance'
        && job.target.id === row.jobId && job.status === 'completed');
      if (!transfer) continue;
      reconciled.current.add(row.jobId);
      void advanceStage(row.jobId, 'data_received', 'Raw data uploaded and verified').catch(() => {
        reconciled.current.delete(row.jobId);
      });
    }
  }, [kind, rows, transfers]);

  /** The raw-data transfer for this job, if one has been started. */
  function transferFor(row: Row): Transfer | undefined {
    return transfers.find(job => job.target && row.key ===
      (job.target.kind === 'freelance' ? job.target.id : `${job.target.clientId}:${job.target.id}`));
  }

  async function run(key: string, fn: () => Promise<unknown>, success = ''): Promise<void> {
    setBusy(key); setError(''); setNote('');
    try { await fn(); if (success) setNote(success); }
    catch (err) { setError(err instanceof Error ? err.message : 'That did not complete.'); }
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

  function copy(key: string, value: string): void {
    void navigator.clipboard.writeText(value);
    setCopied(key); setTimeout(() => setCopied(''), 2200);
  }

  return (
    <div className="screen">
      <header>
        <div>
          <span className="eyebrow">{kind === 'freelance' ? 'PARTNER STUDIOS' : 'OUR CLIENTS'}</span>
          <h2>{kind === 'freelance' ? 'Partner studio work' : 'Client deliverables'}</h2>
          <p>{kind === 'freelance'
            ? 'Live from Studio OS. Assign an editor, send them the raw data, and keep the link they send back — all on the job itself.'
            : 'Deliverables from your booked clients, with the raw data you sent and the finished link kept together.'}</p>
        </div>
        <div className="actions" style={{ margin: 0 }}>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search jobs, studios, editors…"
            style={{ font: 'inherit', fontSize: 14, padding: '9px 11px', borderRadius: 10, minWidth: 230,
              background: 'var(--panel)', border: '1px solid color-mix(in srgb, var(--line) 50%, transparent)' }} />
          <button className="primary" onClick={() => setCreating(true)}>
            <Plus size={15} style={{ verticalAlign: -3, marginRight: 6 }} />
            {kind === 'freelance' ? 'New freelance work' : 'Add a deliverable'}
          </button>
        </div>
      </header>

      {!drive?.connected && (
        <p className="warning">Scanning works without Drive, but nothing sends until Drive is connected.{' '}
          <button className="text-button" onClick={onSettings}>Open settings</button></p>
      )}
      {studio.error && <p className="error" role="alert">{studio.error}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {note && <p className="success" role="status">{note}</p>}

      {studio.loading && rows.length === 0 ? <p className="muted">Loading from Studio OS…</p>
        : filtered.length === 0 ? (
          <div className="panel empty">
            <h3>Nothing here yet</h3>
            <p>{query ? 'No work matches that search.' : 'Create the work first, then come back to send its raw data.'}</p>
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
                  {nextOf(row) && (
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
                  ) : (
                    <div className="cell-value">{row.editorName || 'Not assigned'}</div>
                  )}
                  {row.editorPhone && (
                    <button className="text-button" style={{ paddingLeft: 0 }}
                      onClick={() => void window.api.openExternal(whatsappUrl(
                        message || `Hi ${row.editorName || ''}, about ${row.title}.`, row.editorPhone))}>
                      <MessageCircle size={13} style={{ verticalAlign: -2, marginRight: 5 }} />
                      WhatsApp {row.editorName?.split(' ')[0]}
                    </button>
                  )}
                </div>

                {/* ----------------------------------------------- raw data */}
                <div className="job-cell">
                  <div className="cell-label">Raw data</div>
                  {editingLink === row.key ? (
                    <>
                      <input value={linkDraft} autoFocus onChange={e => setLinkDraft(e.target.value)}
                        placeholder="https://drive.google.com/…"
                        style={{ width: '100%', font: 'inherit', fontSize: 13, padding: '7px 9px', borderRadius: 8,
                          background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--line) 55%, transparent)' }} />
                      <div className="link-row">
                        <button className="primary" disabled={busy === `${row.key}:link`}
                          onClick={() => void run(`${row.key}:link`, async () => {
                            await saveRawDataLink(row.target, linkDraft);
                            if (kind === 'freelance' && linkDraft.trim() && row.stage === 'pending_assignment') {
                              await advanceStage(row.jobId, 'data_received', 'Raw data link recorded');
                            }
                            setEditingLink(null);
                          }, 'Raw data link saved.')}>Save link</button>
                        <button disabled={busy === `${row.key}:link`} onClick={() => setEditingLink(null)}>Cancel</button>
                      </div>
                    </>
                  ) : !transfer && row.rawDataLink ? (
                    <>
                      <div className="cell-value mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>{row.rawDataLink}</div>
                      <div className="link-row">
                        <button onClick={() => copy(`${row.key}:raw`, row.rawDataLink!)}>
                          {copied === `${row.key}:raw`
                            ? <><Check size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Copied</>
                            : <><Copy size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Copy link</>}
                        </button>
                        {row.editorPhone && (
                          <button className="primary" disabled={busy === `${row.key}:send`}
                            onClick={() => void run(`${row.key}:send`, async () => {
                              await window.api.openExternal(whatsappUrl(linkMessage({
                                title: row.title, link: row.rawDataLink!, jobCode: row.target.jobCode,
                                serviceType: row.service, dueDate: row.due === '—' ? undefined : row.due,
                                brief: row.target.brief, recipientName: row.editorName,
                              }, studio.studioSettings?.studioName || 'Baawaray Films'), row.editorPhone));
                              if (kind === 'freelance') await advanceStage(row.jobId, 'sent_to_editor', 'Raw data link prepared for the editor');
                            }, 'WhatsApp opened. Press send yourself — the app never sends for you.')}>
                            <MessageCircle size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Send
                          </button>
                        )}
                        <button onClick={() => { setLinkDraft(row.rawDataLink || ''); setEditingLink(row.key); }}>Edit</button>
                      </div>
                      <span className="muted" style={{ fontSize: 12 }}>
                        Sent as a link. Upload a folder instead if you would rather hold it in your own Drive.
                      </span>
                    </>
                  ) : !transfer ? (
                    <>
                      <div className="cell-value muted">Not sent yet</div>
                      <div className="link-row">
                        <button disabled={busy === row.key} onClick={() => void run(row.key, async () => {
                          onScanStarted(await window.api.scan(options, row.target));
                        })}>Choose folder</button>
                        <button onClick={() => { setLinkDraft(''); setEditingLink(row.key); }}>
                          <LinkIcon size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Paste link
                        </button>
                      </div>
                      <span className="muted" style={{ fontSize: 12 }}>
                        Upload the folder, or paste the link if the partner studio sent one.
                      </span>
                    </>
                  ) : done ? (
                    <>
                      <div className="cell-value">
                        {formatCount(transfer.scan?.fileCount || 0)} files · {formatBytes(transfer.scan?.totalBytes || 0)}
                        {transfer.sharing === 'anyone' && <span className="muted"> · anyone with the link</span>}
                      </div>
                      <div className="link-row">
                        <button onClick={() => copy(`${row.key}:raw`, transfer.link || '')}>
                          {copied === `${row.key}:raw`
                            ? <><Check size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Copied</>
                            : <><Copy size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Copy link</>}
                        </button>
                        <button onClick={() => void window.api.openExternal(transfer.link!)}>
                          <ExternalLink size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Drive
                        </button>
                        {row.editorPhone && (
                          <button className="primary" disabled={busy === `${row.key}:send`}
                            onClick={() => void run(`${row.key}:send`, async () => {
                              await window.api.openExternal(whatsappUrl(message, row.editorPhone));
                              await window.api.markMessagePrepared(transfer.id);
                              if (kind === 'freelance') await advanceStage(row.jobId, 'sent_to_editor', 'Raw data link prepared for the editor');
                            }, 'WhatsApp opened. Press send yourself — the app never sends for you.')}>
                            <MessageCircle size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Send
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
                  ) : (
                    <>
                      <div className="bar"><span style={{ width: `${(progressFraction(transfer) * 100).toFixed(1)}%` }} /></div>
                      <div className="cell-value muted" style={{ marginTop: 6 }}>
                        {formatBytes(transfer.uploadedBytes)} of {formatBytes(transfer.scan?.totalBytes || 0)}
                      </div>
                      <button onClick={() => onOpen(transfer.id)}>Open transfer</button>
                    </>
                  )}
                  {transfer?.error && <p className="warning" style={{ fontSize: 12.5 }}>{transfer.error}</p>}
                </div>

                {/* ----------------------------------------- final delivery */}
                <div className="job-cell">
                  <div className="cell-label">Final delivery</div>
                  {row.deliveryLink ? (
                    <>
                      <div className="cell-value mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>{row.deliveryLink}</div>
                      <div className="link-row">
                        <button onClick={() => copy(`${row.key}:final`, row.deliveryLink!)}>
                          {copied === `${row.key}:final`
                            ? <><Check size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Copied</>
                            : <><Copy size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Copy link</>}
                        </button>
                        <button onClick={() => void window.api.openExternal(row.deliveryLink!)}>Open</button>
                      </div>
                    </>
                  ) : (
                    <div className="cell-value muted">
                      Waiting for the editor. They add the finished link from their own portal — it can be
                      Drive, Google Photos, or wherever they worked.
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}

      {creating && <NewWorkModal kind={kind} onClose={() => setCreating(false)} />}
      {changesFor && (
        <ChangesModal jobId={changesFor.jobId} jobTitle={changesFor.title} editorName={changesFor.editorName}
          onClose={() => setChangesFor(null)}
          onSaved={round => { setChangesFor(null); setNote(`Round ${round} logged. Send it to the editor when ready.`); }} />
      )}
    </div>
  );
}
