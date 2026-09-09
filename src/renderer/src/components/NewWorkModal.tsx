import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { createExtra } from '../lib/studioRepository';
import { FREELANCE_SERVICES } from '../utils/freelancePricing';
import { normaliseServices, resolveRoleGroups, servicePrice } from '../utils/studioRoles';
import { isDeliverablesTeamMember } from '../utils/freelance';

export function NewWorkModal({ kind, onClose }: { kind: 'freelance' | 'deliverables'; onClose: () => void }) {
  const studio = useApp();
  const [clientId, setClientId] = useState(''), [title, setTitle] = useState('');
  const [service, setService] = useState(''), [editor, setEditor] = useState('');
  const [dueDate, setDueDate] = useState(''), [brief, setBrief] = useState('');
  const [price, setPrice] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const roles = useMemo(() => {
    const groups = resolveRoleGroups(studio.studioSettings?.roleGroups);
    return normaliseServices(studio.studioSettings?.crewRoles || studio.studioPriceList?.crewRoles || [], groups)
      .filter(role => groups.find(g => g.id === role.groupId)?.kind === 'deliverable');
  }, [studio.studioSettings, studio.studioPriceList]);
  async function save(event: React.FormEvent): Promise<void> {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (kind === 'freelance') {
        const partner = studio.freelanceClients.find(c => String(c.id) === clientId);
        if (!partner) throw new Error('Select a partner studio.');
        const member = studio.team.find(m => String(m.id) === editor);
        await studio.addFreelanceJob({ title: title.trim(), serviceType: service, freelanceClientId: partner.id,
          clientName: partner.name, clientPhone: partner.phone || '', clientEmail: partner.email || '', clientAuthUid: partner.authUid,
          editorName: member?.name || '', editorPhone: member?.phone || '', editorEmail: member?.email || '',
          editorMemberId: member?.id, editorAuthUid: member?.authUid, description: brief,
          dueDate: dueDate || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) });
      } else {
        await createExtra(clientId, { title: title.trim(), linkedRoleId: service, sellingPrice: Number(price) });
      }
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save work.'); }
    finally { setBusy(false); }
  }
  return <div className="modal-shade"><section className="work-modal" role="dialog" aria-modal="true" aria-labelledby="new-work-title">
    <header><div><span className="eyebrow">STUDIO WORK</span><h2 id="new-work-title">{kind === 'freelance' ? 'New freelance work' : 'Add a client deliverable'}</h2></div><button className="icon-button" aria-label="Close" disabled={busy} onClick={onClose}><X size={20}/></button></header>
    <form onSubmit={event => void save(event)}>
      <label>{kind === 'freelance' ? 'Partner studio' : 'Client'}<select required value={clientId} onChange={e => setClientId(e.target.value)}><option value="">Choose…</option>{(kind === 'freelance' ? studio.freelanceClients : studio.clients).map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}</select></label>
      <label>Service<select required value={service} onChange={e => { setService(e.target.value); if (kind === 'deliverables') { const role = roles.find(r => r.id === e.target.value); setTitle(role?.name || ''); setPrice(String(role ? servicePrice(role) : '')); } }}><option value="">Choose…</option>{kind === 'freelance' ? FREELANCE_SERVICES.map(s => <option key={s.name}>{s.name}</option>) : roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      <label>Project / deliverable title<input required value={title} onChange={e => setTitle(e.target.value)} placeholder="Couple name · wedding film"/></label>
      {kind === 'freelance' ? <><div className="field-row"><label>Editor<select value={editor} onChange={e => setEditor(e.target.value)}><option value="">Assign later</option>{studio.team.filter(m => m.active !== false && isDeliverablesTeamMember(m)).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label>Due date<input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}/></label></div><label>Editing brief<textarea value={brief} onChange={e => setBrief(e.target.value)}/></label><p className="muted">Pricing will use this partner’s rate card after you scan the source folder. Unassigned jobs remain pending assignment.</p></> : <><label>Extra price ({studio.studioSettings?.currency || 'INR'})<input type="number" min="0" step="1" required value={price} onChange={e => setPrice(e.target.value)}/></label><p className="notice">This is an additional service. The original quotation stays unchanged. Editor assignment and scheduling follow your existing payment workflow.</p></>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy || studio.loading}>{busy ? 'Saving…' : 'Create work'}</button></div>
    </form>
  </section></div>;
}
