import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { useApp } from '../../context/AppContext';
import { db } from '../../lib/firebase';
import type { SalesTask, TaskStatus } from '../../types';

const statuses: { id: TaskStatus; label: string }[] = [
  { id: 'todo', label: 'To Do' }, { id: 'in_progress', label: 'In Progress' },
  { id: 'blocked', label: 'Blocked' }, { id: 'done', label: 'Done' },
];

export function PostProductionTasksScreen(): React.JSX.Element {
  const { currentUser, clients, team } = useApp();
  const owner = currentUser.accountType === 'owner';
  const member = team.find(person => person.authUid === currentUser.id);
  const memberId = member ? String(member.id) : null;
  const [tasks, setTasks] = useState<SalesTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<SalesTask | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [text, setText] = useState('');
  const [description, setDescription] = useState('');
  const [clientId, setClientId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('normal');
  const [search, setSearch] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SalesTask | null>(null);

  useEffect(() => {
    setTasks([]); setError(''); setLoading(true);
    if (!owner && !memberId) { setLoading(false); return; }
    const source = collection(db, 'sales_tasks');
    const scoped = owner ? source : query(source, where('assigneeId', '==', memberId));
    return onSnapshot(scoped, snapshot => {
      setTasks(snapshot.docs.map(record => ({ ...record.data(), id: record.id }) as SalesTask).filter(task => task.category === 'post'));
      setLoading(false);
    }, err => { setError(err.message); setLoading(false); });
  }, [owner, memberId, currentUser.id]);

  const clientName = (task: SalesTask): string => task.clientId == null ? 'General task' :
    clients.find(client => client.id === task.clientId)?.name || `Client #${task.clientId}`;
  const assigneeName = (task: SalesTask): string => task.assigneeId === 'owner' ? 'Studio Owner' :
    team.find(person => String(person.id) === task.assigneeId)?.name || (task.assigneeId ? 'Assigned member' : 'Unassigned');
  const visible = tasks.filter(task => (showDone || !(task.done || task.status === 'done')) &&
    `${task.text} ${task.description || ''} ${clientName(task)} ${assigneeName(task)}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));

  async function perform(action: () => Promise<void>): Promise<void> {
    setBusy(true); setError('');
    try { await action(); } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }
  function openForm(task: SalesTask | null): void {
    setEditing(task); setText(task?.text || ''); setDescription(task?.description || '');
    setClientId(task?.clientId == null ? '' : String(task.clientId)); setAssigneeId(task?.assigneeId || '');
    setDueDate(task?.dueDate || ''); setPriority(task?.priority || 'normal'); setFormOpen(true);
  }
  async function save(): Promise<void> {
    if (!text.trim() || !owner) return;
    await perform(async () => {
      const now = new Date().toISOString();
      const reference = editing ? doc(db, 'sales_tasks', editing.id) : doc(collection(db, 'sales_tasks'));
      await setDoc(reference, {
        text: text.trim(), description: description.trim(), clientId: clientId ? Number(clientId) : null,
        assigneeId: assigneeId || null, dueDate: dueDate || null, priority, category: 'post', updatedAt: now,
        ...(!editing ? { id: reference.id, createdAt: now, createdBy: currentUser.name, status: 'todo', done: false } : {}),
      }, { merge: true });
      setFormOpen(false);
    });
  }
  async function changeStatus(task: SalesTask, status: TaskStatus): Promise<void> {
    await perform(() => updateDoc(doc(db, 'sales_tasks', task.id), {
      status, done: status === 'done', completedAt: status === 'done' ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    }));
  }

  return <div className="panel" style={{ padding: 24 }}>
    <div className="actions" style={{ justifyContent: 'space-between' }}>
      <div><h1>Post Production Tasks</h1><p className="muted">General work and client tasks, shared with the web app.</p></div>
      {owner && <button className="primary" onClick={() => openForm(null)}>Add task</button>}
    </div>
    <div className="actions" style={{ margin: '20px 0' }}>
      <input aria-label="Search tasks" placeholder="Search tasks, clients or people" value={search} onChange={event => setSearch(event.target.value)} />
      <label><input type="checkbox" checked={showDone} onChange={event => setShowDone(event.target.checked)} /> Show completed</label>
    </div>
    {error && <p role="alert" className="error">{error}</p>}
    {!owner && !memberId && <p>Your login is not linked to a team member yet.</p>}
    {loading ? <p>Loading tasks…</p> : !visible.length ? <p className="muted">No tasks to show.</p> : visible.map(task => <div key={task.id} className="panel" style={{ padding: 16, marginBottom: 12 }}>
      <div className="actions" style={{ justifyContent: 'space-between' }}>
        <div><h3>{task.text}</h3><p className="muted">{clientName(task)} · {assigneeName(task)} · {task.priority || 'normal'} priority{task.dueDate ? ` · Due ${task.dueDate}` : ''}</p></div>
        <select aria-label={`Status for ${task.text}`} disabled={busy} value={task.status || (task.done ? 'done' : 'todo')} onChange={event => void changeStatus(task, event.target.value as TaskStatus)}>
          {statuses.map(status => <option key={status.id} value={status.id}>{status.label}</option>)}
        </select>
        {owner && <><button disabled={busy} onClick={() => openForm(task)}>Edit</button><button disabled={busy} onClick={() => setPendingDelete(task)}>Delete</button></>}
      </div>
      {task.description && <p style={{ whiteSpace: 'pre-wrap' }}>{task.description}</p>}
    </div>)}
    {formOpen && owner && <div className="panel" style={{ padding: 20, marginTop: 20 }}>
      <h2>{editing ? 'Edit task' : 'New task'}</h2>
      <form onSubmit={event => { event.preventDefault(); void save(); }} style={{ display: 'grid', gap: 12 }}>
        <label>Task title<input required value={text} onChange={event => setText(event.target.value)} /></label>
        <label>Notes<textarea value={description} onChange={event => setDescription(event.target.value)} /></label>
        <label>Client<select value={clientId} onChange={event => setClientId(event.target.value)}><option value="">General task — no client</option>{clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}{clientId && !clients.some(client => String(client.id) === clientId) && <option value={clientId}>Client #{clientId}</option>}</select></label>
        <label>Assigned to<select value={assigneeId} onChange={event => setAssigneeId(event.target.value)}><option value="">Unassigned</option><option value="owner">Studio Owner</option>{team.filter(person => person.active !== false || String(person.id) === assigneeId).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
        <label>Due date<input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} /></label>
        <label>Priority<select value={priority} onChange={event => setPriority(event.target.value)}>{['low', 'normal', 'high', 'urgent'].map(value => <option key={value}>{value}</option>)}</select></label>
        <div className="actions"><button className="primary" disabled={busy || !text.trim()} type="submit">{busy ? 'Saving…' : 'Save task'}</button><button type="button" disabled={busy} onClick={() => setFormOpen(false)}>Cancel</button></div>
      </form>
    </div>}
    {pendingDelete && <div className="panel" role="alertdialog" aria-label="Delete task" style={{ padding: 20 }}><p>Delete “{pendingDelete.text}”?</p><div className="actions"><button disabled={busy} onClick={() => void perform(async () => { await deleteDoc(doc(db, 'sales_tasks', pendingDelete.id)); setPendingDelete(null); })}>Delete task</button><button disabled={busy} onClick={() => setPendingDelete(null)}>Cancel</button></div></div>}
  </div>;
}
