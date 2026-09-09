import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import type { DriveStatus, ScanOptions, Transfer, WorkTarget } from '../../../../shared/contracts';
import { useApp } from '../../context/AppContext';
import { NewWorkModal } from '../NewWorkModal';
import { normaliseServices, resolveRoleGroups } from '../../utils/studioRoles';
import { statusLabel } from '../../utils/uploadFormat';
import type { ClientDeliverable, TeamMember } from '../../types';

interface Row { key: string; title: string; sub: string; when: string; targets: { raw: WorkTarget; delivery: WorkTarget } }

/** Both work lists behave identically; only where the rows come from differs. */
export function WorkScreen({ kind, transfers, drive, onScanStarted, onSettings }: {
  kind: 'freelance' | 'deliverables';
  transfers: Transfer[]; drive: DriveStatus | null;
  onScanStarted: (id: string | null) => void; onSettings: () => void;
}): React.JSX.Element {
  const studio = useApp();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const options: ScanOptions = useMemo(() => ({
    excludedBillingFolders: studio.studioSettings?.uploader?.excludedBillingFolders ?? ['Proxies', 'Proxy', 'Exports'],
    countPhotoPairsOnce: studio.studioSettings?.uploader?.countPhotoPairsOnce ?? true,
  }), [studio.studioSettings]);

  const roles = useMemo(() => {
    const groups = resolveRoleGroups(studio.studioSettings?.roleGroups);
    return normaliseServices(studio.studioSettings?.crewRoles || studio.studioPriceList?.crewRoles || [], groups);
  }, [studio.studioSettings, studio.studioPriceList]);

  const rows = useMemo<Row[]>(() => {
    if (kind === 'freelance') {
      return studio.freelanceJobs.map(job => {
        const partner = studio.freelanceClients.find(c => String(c.id) === String(job.freelanceClientId));
        const shared = { kind: 'freelance' as const, id: String(job.id), title: job.title, clientName: job.clientName,
          serviceType: String(job.serviceType || ''), jobCode: job.jobCode, dueDate: job.dueDate, brief: job.description };
        return {
          key: String(job.id),
          title: job.title,
          sub: `${job.clientName}${job.serviceType ? ` · ${job.serviceType}` : ''}${job.editorName ? ` · editor ${job.editorName}` : ' · editor unassigned'}`,
          when: job.dueDate || '—',
          targets: {
            // Raw footage goes to whoever is editing it; the finished film goes
            // back to the partner studio that commissioned it.
            raw: { ...shared, purpose: 'raw', recipientName: job.editorName, recipientPhone: job.editorPhone, recipientEmail: job.editorEmail },
            delivery: { ...shared, purpose: 'delivery', recipientName: partner?.contactPerson || job.clientName, recipientPhone: job.clientPhone || partner?.phone, recipientEmail: job.clientEmail || partner?.email },
          },
        };
      });
    }
    return studio.clients.flatMap(client => (client.deliverables || []).map((item: ClientDeliverable) => {
      const role = roles.find(r => r.id === item.linkedRoleId);
      const member = studio.team.find((m: TeamMember) => m.id === item.assignedMemberId);
      const shared = { kind: 'deliverable' as const, id: item.id, clientId: String(client.id), title: item.title,
        clientName: client.name, serviceType: role?.name || item.category || '', dueDate: item.dueDate, brief: item.notes };
      return {
        key: `${client.id}:${item.id}`,
        title: item.title,
        sub: `${client.name} · ${role?.name || item.category || 'Deliverable'}${item.isExtra ? ' · extra' : ''} · ${item.status}`,
        when: item.dueDate || '—',
        targets: {
          raw: { ...shared, purpose: 'raw' as const, recipientName: member?.name, recipientPhone: member?.phone, recipientEmail: member?.email },
          delivery: { ...shared, purpose: 'delivery' as const, recipientName: client.name, recipientPhone: client.phone, recipientEmail: client.email },
        },
      };
    }));
  }, [kind, studio.freelanceJobs, studio.freelanceClients, studio.clients, studio.team, roles]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(row => `${row.title} ${row.sub}`.toLowerCase().includes(needle));
  }, [rows, query]);

  async function startScan(row: Row, purpose: 'raw' | 'delivery'): Promise<void> {
    setBusy(row.key + purpose); setError('');
    try { onScanStarted(await window.api.scan(options, row.targets[purpose])); }
    catch (err) { setError(err instanceof Error ? err.message : 'The folder could not be opened.'); }
    finally { setBusy(''); }
  }

  /** Anything already uploading or verified for this job, so it is not sent twice. */
  function existing(row: Row): Transfer[] {
    return transfers.filter(job => job.target && `${job.target.kind === 'freelance' ? job.target.id : `${job.target.clientId}:${job.target.id}`}` === row.key);
  }

  return (
    <div className="screen">
      <header>
        <div>
          <span className="eyebrow">{kind === 'freelance' ? 'PARTNER STUDIOS' : 'OUR CLIENTS'}</span>
          <h2>{kind === 'freelance' ? 'Partner studio work' : 'Client deliverables'}</h2>
          <p>{kind === 'freelance'
            ? 'Freelance jobs read live from Studio OS. Choose a job, then the folder on this Mac or an external drive.'
            : 'Deliverables from your booked clients. Raw footage for an editor and the finished delivery are kept as separate links.'}</p>
        </div>
        <div className="actions" style={{ margin: 0 }}>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search…"
            style={{ font: 'inherit', fontSize: 14, padding: '9px 11px', borderRadius: 10, background: 'var(--panel)', border: '1px solid color-mix(in srgb, var(--line) 50%, transparent)' }} />
          <button className="primary" onClick={() => setCreating(true)}>
            <Plus size={15} style={{ verticalAlign: -3, marginRight: 6 }} />
            {kind === 'freelance' ? 'New freelance work' : 'Add a deliverable'}
          </button>
        </div>
      </header>

      {!drive?.connected && (
        <p className="warning">Scanning works without Drive, but nothing sends until Drive is connected. {' '}
          <button className="text-button" onClick={onSettings}>Open settings</button></p>
      )}
      {studio.error && <p className="error" role="alert">{studio.error}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      <div className="panel" style={{ padding: '18px 8px 8px' }}>
        {studio.loading && rows.length === 0 ? <p className="muted" style={{ padding: '20px 14px' }}>Loading from Studio OS…</p>
          : filtered.length === 0 ? (
            <div className="empty">
              <h3>Nothing here yet</h3>
              <p>{query ? 'No work matches that search.' : 'Create the work first, then come back to upload its folder.'}</p>
            </div>
          ) : (
            <table className="work-table">
              <thead><tr>
                <th>{kind === 'freelance' ? 'Job' : 'Deliverable'}</th>
                <th>Due</th>
                <th>Uploads</th>
                <th className="right">Choose folder</th>
              </tr></thead>
              <tbody>
                {filtered.map(row => {
                  const linked = existing(row);
                  return (
                    <tr key={row.key}>
                      <td>
                        <div className="title">{row.title}</div>
                        <div className="sub">{row.sub}</div>
                      </td>
                      <td className="mono muted" style={{ fontSize: 13 }}>{row.when}</td>
                      <td>
                        {linked.length === 0 ? <span className="muted" style={{ fontSize: 13 }}>None</span>
                          : linked.map(job => {
                            const label = statusLabel(job.status);
                            return <span key={job.id} className={`status-pill ${label.tone}`} style={{ marginRight: 6 }}>
                              {job.target?.purpose === 'raw' ? 'Raw' : 'Delivery'} · {label.text}
                            </span>;
                          })}
                      </td>
                      <td className="right">
                        <button disabled={busy === row.key + 'raw'} onClick={() => void startScan(row, 'raw')}>Raw footage</button>{' '}
                        <button disabled={busy === row.key + 'delivery'} onClick={() => void startScan(row, 'delivery')}>Final delivery</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
      </div>

      {creating && <NewWorkModal kind={kind} onClose={() => setCreating(false)} />}
    </div>
  );
}
