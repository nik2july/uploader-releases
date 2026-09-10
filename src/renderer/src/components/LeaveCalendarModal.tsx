import { useState } from 'react';
import { Calendar, Trash2, X, Plus } from 'lucide-react';
import { updateEditorUnavailablePeriods } from '../lib/studioRepository';
import type { TeamMember } from '../types';

export function LeaveCalendarModal({
  member,
  onClose,
  onSaved
}: {
  member: TeamMember;
  onClose: () => void;
  onSaved: (periods: { id: string; from: string; to: string; reason?: string }[]) => void;
}): React.JSX.Element {
  const [periods, setPeriods] = useState<{ id: string; from: string; to: string; reason?: string }[]>(
    member.unavailablePeriods || []
  );
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleAdd(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!fromDate) {
      setError('Select a start date.');
      return;
    }
    const end = toDate || fromDate;
    if (end < fromDate) {
      setError('End date cannot be before start date.');
      return;
    }

    const newPeriod = {
      id: crypto.randomUUID(),
      from: fromDate,
      to: end,
      reason: reason.trim() || 'Off Day'
    };

    const nextPeriods = [...periods, newPeriod].sort((a, b) => a.from.localeCompare(b.from));

    setBusy(true);
    setError('');
    try {
      await updateEditorUnavailablePeriods(member.id, nextPeriods);
      setPeriods(nextPeriods);
      setFromDate('');
      setToDate('');
      setReason('');
      onSaved(nextPeriods);
    } catch (err: any) {
      setError(err?.message || 'Failed to save off day.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string): Promise<void> {
    const nextPeriods = periods.filter(p => p.id !== id);
    setBusy(true);
    setError('');
    try {
      await updateEditorUnavailablePeriods(member.id, nextPeriods);
      setPeriods(nextPeriods);
      onSaved(nextPeriods);
    } catch (err: any) {
      setError(err?.message || 'Failed to remove off day.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-shade">
      <section className="work-modal" role="dialog" aria-modal="true" aria-labelledby="leaves-title">
        <header>
          <div>
            <span className="eyebrow">EDITOR SCHEDULE</span>
            <h2 id="leaves-title">My Off Days & Leaves</h2>
          </div>
          <button className="icon-button" aria-label="Close" disabled={busy} onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <p className="notice" style={{ marginTop: 0 }}>
          Logged leaves automatically adjust the project countdown. When you take a day off, the dynamic due date skips it and pushes forward so you never lose editing time.
        </p>

        {error && <p className="error" role="alert">{error}</p>}

        <form onSubmit={handleAdd} style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label>
              From Date
              <input
                type="date"
                required
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                style={{ width: '100%' }}
              />
            </label>
            <label>
              To Date (optional)
              <input
                type="date"
                value={toDate}
                min={fromDate}
                onChange={e => setToDate(e.target.value)}
                style={{ width: '100%' }}
              />
            </label>
          </div>
          <label style={{ marginTop: 8 }}>
            Reason / Note
            <input
              type="text"
              value={reason}
              placeholder="e.g. Family function, personal leave, Sunday off"
              onChange={e => setReason(e.target.value)}
              style={{ width: '100%' }}
            />
          </label>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <button className="primary" disabled={busy || !fromDate}>
              <Plus size={14} style={{ verticalAlign: -2, marginRight: 5 }} />
              {busy ? 'Saving…' : 'Add Off Day'}
            </button>
          </div>
        </form>

        <div style={{ marginTop: 24, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
          <span className="eyebrow" style={{ fontSize: 11 }}>LOGGED OFF DAYS ({periods.length})</span>
          {periods.length === 0 ? (
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              No leaves logged yet. You are marked available for editing all upcoming working days.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {periods.map(p => (
                <li
                  key={p.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'var(--paper)',
                    border: '1px solid color-mix(in srgb, var(--line) 30%, transparent)'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                      <Calendar size={13} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--accent, #3b82f6)' }} />
                      {p.from === p.to || !p.to ? p.from : `${p.from} → ${p.to}`}
                    </div>
                    {p.reason && (
                      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                        {p.reason}
                      </div>
                    )}
                  </div>
                  <button
                    className="icon-button"
                    title="Remove off day"
                    disabled={busy}
                    onClick={() => handleDelete(p.id)}
                    style={{ color: 'var(--stop, #8c2b2b)', padding: 6 }}
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="actions" style={{ marginTop: 24 }}>
          <button type="button" onClick={onClose}>Done</button>
        </div>
      </section>
    </div>
  );
}
