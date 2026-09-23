import { useMemo, useState } from 'react';
import { Check, Clipboard, FolderPlus, Search } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { copyToClipboard } from '../../utils/clipboard';
import type { Client, ProjectEvent, TeamMember } from '../../types';

type SelectedClient = Client & { code?: string };

function normalise(value: unknown): string {
  return String(value ?? '').toLowerCase();
}

function safeName(value: string, fallback: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '-').trim() || fallback;
}

function memberRole(member: TeamMember): 'photo' | 'clips' | 'other' {
  const role = normalise(member.role);
  if (role.includes('cinema') || role.includes('video') || role.includes('film')) return 'clips';
  if (role.includes('photo') || role.includes('candid') || role.includes('traditional')) return 'photo';
  return 'other';
}

function eventsFor(client: Client, projects: ProjectEvent[]): ProjectEvent[] {
  return projects.filter(project =>
    (project.clientId && Number(project.clientId) === Number(client.id)) ||
    normalise(project.couple) === normalise(client.couple || client.name) ||
    normalise(project.couple) === normalise(client.name)
  );
}

export function ClientToolsScreen(): React.JSX.Element {
  const studio = useApp();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [logEventId, setLogEventId] = useState<number | null>(null);
  const [logMemberId, setLogMemberId] = useState<number | null>(null);
  const [dataGb, setDataGb] = useState('');
  const [fileCount, setFileCount] = useState('');

  const clients = useMemo<SelectedClient[]>(() => {
    const codes = studio.projectCodes;
    return studio.clients.map(client => {
      const digits = normalise(client.phone).replace(/\D/g, '');
      const byPhone = digits.length >= 10 ? codes.find(code => code.key === digits.slice(-10)) : undefined;
      const byId = codes.find(code => (code.clientIds || []).map(String).includes(String(client.id)));
      return { ...client, code: (byPhone || byId)?.code };
    }).filter(client => {
      const q = normalise(search).trim();
      if (!q) return true;
      const events = eventsFor(client, studio.projects);
      return [client.code, client.name, client.couple, client.groomName, client.brideName, client.phone, client.email, client.city, client.status, client.notes,
        ...events.flatMap(event => [event.eventName, event.venue, event.date, event.couple])].some(value => normalise(value).includes(q));
    }).sort((a, b) => normalise(a.name).localeCompare(normalise(b.name)));
  }, [studio.clients, studio.projectCodes, studio.projects, search]);

  const selected = clients.find(client => client.id === selectedId) || clients[0];
  const events = selected ? eventsFor(selected, studio.projects) : [];

  function structureFor(client: SelectedClient): { rootName: string; folders: string[] } {
    const rootName = safeName(`${client.code || 'NO-CODE'} ${client.couple || client.name}`, 'Client');
    const folders = new Set<string>();
    const members = new Map(studio.team.map(member => [Number(member.id), member]));
    eventsFor(client, studio.projects).forEach((event, index) => {
      const eventName = safeName(event.eventName || `Event ${index + 1}`, `Event ${index + 1}`);
      const assigned = (event.assignments || []).map(id => members.get(Number(id))).filter(Boolean) as TeamMember[];
      const photos = assigned.filter(member => memberRole(member) === 'photo');
      const clips = assigned.filter(member => memberRole(member) === 'clips');
      (photos.length ? photos : [{ name: 'Photographer' } as TeamMember]).forEach(member => folders.add(`Photos/${eventName}/${safeName(member.name, 'Photographer')}`));
      (clips.length ? clips : [{ name: 'Cinematographer' } as TeamMember]).forEach(member => folders.add(`Clips/${eventName}/${safeName(member.name, 'Cinematographer')}`));
    });
    return { rootName, folders: [...folders] };
  }

  async function copyCode(client: SelectedClient): Promise<void> {
    const value = `${client.code || ''} ${client.couple || client.name}`.trim();
    if (await copyToClipboard(value)) {
      setNotice(`Copied “${value}”`);
      setTimeout(() => setNotice(''), 2200);
    }
  }

  async function createFolders(): Promise<void> {
    if (!selected) return;
    setBusy(true); setNotice('');
    try {
      const result = await window.api.createClientFolderStructure(structureFor(selected));
      if (result) setNotice(`Created ${result.created} folders in ${result.rootPath}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not create folders.');
    } finally { setBusy(false); }
  }

  async function saveLog(): Promise<void> {
    if (!logEventId || !logMemberId) return;
    setBusy(true);
    try {
      await studio.updateProjectDataLog(logEventId, logMemberId, dataGb.trim(), fileCount.trim());
      setNotice('Data log saved to the shared web app record.');
      setLogEventId(null); setLogMemberId(null); setDataGb(''); setFileCount('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not save the data log.');
    } finally { setBusy(false); }
  }

  return <div className="screen client-tools-screen">
    <header><div><span className="eyebrow">CLIENT TOOLS</span><h2>Client codes & folder setup</h2><p>Find a client, copy the same code used by the mobile app, and create the event folders in one click.</p></div></header>
    <div className="client-tools-grid">
      <section className="client-tools-list">
        <label className="client-search"><Search size={16} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, code, phone, event, venue…" /></label>
        <div className="client-results">
          {clients.map(client => <button key={client.id} className={`client-result ${selected?.id === client.id ? 'selected' : ''}`} onClick={() => setSelectedId(client.id)}>
            <span className="client-result-name">{client.code ? `#${client.code} ` : ''}{client.couple || client.name}</span>
            <span className="client-result-meta">{client.phone || client.email || client.status}</span>
          </button>)}
          {clients.length === 0 && <p className="muted">No matching clients.</p>}
        </div>
      </section>
      <section className="client-tools-detail">
        {selected ? <>
          <div className="client-tool-heading"><div><span className="eyebrow">SELECTED CLIENT</span><h3>{selected.couple || selected.name}</h3><p>{selected.code ? `Client code #${selected.code}` : 'No project code found yet'} · {events.length} event{events.length === 1 ? '' : 's'}</p></div><button className="button secondary" onClick={() => void copyCode(selected)}><Clipboard size={15} /> Copy code & name</button></div>
          <div className="client-tool-actions"><button className="button primary" disabled={busy} onClick={() => void createFolders()}><FolderPlus size={16} /> {busy ? 'Working…' : 'Create folder structure'}</button><span className="muted">Choose the parent folder after clicking.</span></div>
          <div className="folder-preview"><strong>Preview</strong><code>{structureFor(selected).rootName}/</code>{structureFor(selected).folders.map(folder => <code key={folder}>├─ {folder}</code>)}</div>
          <div className="client-log-panel"><div><span className="eyebrow">SHARED DATA LOG</span><h3>Log received footage</h3><p>Saved directly to the event record used by the web app.</p></div>
            {events.length === 0 ? <p className="muted">No events are linked to this client.</p> : events.map((event, index) => <div className="event-log-row" key={event.id}><div><strong>{event.eventName || `Event ${index + 1}`}</strong><span>{event.date} · {(event.assignments || []).length} crew</span></div><button className="button secondary" onClick={() => { setLogEventId(event.id); setLogMemberId(event.assignments?.[0] ?? null); }}>Log data</button></div>)}
          </div>
        </> : <p className="muted">Select a client to begin.</p>}
      </section>
    </div>
    {logEventId && <div className="modal-backdrop"><div className="modal-card client-log-modal"><button className="modal-close" onClick={() => setLogEventId(null)}>×</button><span className="eyebrow">DATA RECEIVED</span><h3>Log footage received</h3><label>Team member<select value={logMemberId ?? ''} onChange={event => setLogMemberId(Number(event.target.value))}>{(events.find(item => item.id === logEventId)?.assignments || []).map(id => <option key={id} value={id}>{studio.team.find(member => Number(member.id) === Number(id))?.name || `Member ${id}`}</option>)}</select></label><label>Data size <input value={dataGb} onChange={event => setDataGb(event.target.value)} placeholder="e.g. 128 GB" /></label><label>File count <input value={fileCount} onChange={event => setFileCount(event.target.value)} placeholder="e.g. 4,820" /></label><button className="button primary" disabled={busy || !logMemberId} onClick={() => void saveLog()}><Check size={16} /> Save to web app</button></div></div>}
    {notice && <div className="toast">{notice}</div>}
  </div>;
}
