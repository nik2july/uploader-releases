import { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { createPartnerStudio, updatePartnerStudio } from '../../lib/studioRepository';
import type { FreelanceClient } from '../../types';

const services = ['Short Form', 'Long Form', 'Edited Photos', 'Album'];
const internalPartner: FreelanceClient = {
  id: 'internal_baawaray_films', name: 'BAAWARAY FILMS', contactPerson: '', phone: '', email: '', city: '',
  active: true, createdAt: '', rateCard: {},
};
const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value || 0);

export function PartnerStudiosScreen(): React.JSX.Element {
  const studio = useApp();
  const [adding, setAdding] = useState(false); const [editing, setEditing] = useState<FreelanceClient | null>(null);
  const [name, setName] = useState(''); const [contact, setContact] = useState(''); const [phone, setPhone] = useState(''); const [email, setEmail] = useState(''); const [city, setCity] = useState(''); const [rates, setRates] = useState<Record<string, string>>({}); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const partners = useMemo(() => {
    const current = studio.freelanceClients.slice().sort((a, b) => a.name.localeCompare(b.name));
    return current.some(client => client.id === internalPartner.id) ? current : [internalPartner, ...current];
  }, [studio.freelanceClients]);
  function resetForm(): void { setEditing(null); setName(''); setContact(''); setPhone(''); setEmail(''); setCity(''); setRates({}); setError(''); }
  function openProfile(client?: FreelanceClient): void {
    setEditing(client || null); setName(client?.name || ''); setContact(client?.contactPerson || ''); setPhone(client?.phone || ''); setEmail(client?.email || ''); setCity(client?.city || '');
    setRates(Object.fromEntries(services.map(service => [service, String(client?.rateCard?.[service] || '')]))); setError(''); setAdding(true);
  }
  function close(): void { setAdding(false); resetForm(); }
  async function save(event: React.FormEvent): Promise<void> {
    event.preventDefault(); setBusy(true); setError('');
    const input = { name, contactPerson: contact, phone, email, city, rateCard: Object.fromEntries(services.map(service => [service, Number(rates[service]) || 0])) };
    try { if (editing) await updatePartnerStudio(editing.id, input); else await createPartnerStudio(input); close(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save partner studio.'); } finally { setBusy(false); }
  }
  return <div className="screen"><header><div><h2>Partner studios</h2></div><div className="actions" style={{ margin: 0 }}><button className="primary" onClick={() => openProfile()}>Add partner studio</button></div></header>
    <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>{partners.map(client => { const jobs = studio.freelanceJobs.filter(job => job.freelanceClientId === client.id); const billed = jobs.reduce((sum, job) => sum + (Number(job.clientCharge) || 0), 0); const paid = jobs.reduce((sum, job) => sum + (Number(job.clientPaidAmount) || 0), 0); return <div key={client.id} style={{ padding: '16px 18px', borderBottom: '1px solid var(--line)' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}><div><div className="job-title">{client.name}</div><div className="sub">{client.contactPerson || client.phone || 'Partner studio'}</div></div><div className="actions" style={{ margin: 0, alignItems: 'center' }}><div className="muted">{jobs.length} project{jobs.length === 1 ? '' : 's'} · {money(Math.max(0, billed - paid))} due</div><button onClick={() => openProfile(client)}>Edit profile</button></div></div><div className="sub" style={{ marginTop: 7 }}>{services.map(service => `${service}: ${money(client.rateCard?.[service] || 0)}`).join(' · ')}</div></div>; })}</div>
    {adding && <div className="modal-shade"><section className="work-modal"><header><div><h2>{editing ? `Edit ${editing.name}` : 'Add partner studio'}</h2></div></header><form onSubmit={event => void save(event)}><div className="field-row"><label>Studio name<input required value={name} onChange={event => setName(event.target.value)} /></label><label>Contact person<input value={contact} onChange={event => setContact(event.target.value)} /></label></div><div className="field-row"><label>Phone<input value={phone} onChange={event => setPhone(event.target.value)} /></label><label>Email<input type="email" value={email} onChange={event => setEmail(event.target.value)} /></label></div><label>City<input value={city} onChange={event => setCity(event.target.value)} /></label><div className="field-row">{services.map(service => <label key={service}>{service} rate<input type="number" min="0" value={rates[service] || ''} onChange={event => setRates(old => ({ ...old, [service]: event.target.value }))} /></label>)}</div>{error && <p className="error">{error}</p>}<div className="actions"><button type="button" onClick={close}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save partner profile' : 'Create partner studio'}</button></div></form></section></div>}
  </div>;
}
