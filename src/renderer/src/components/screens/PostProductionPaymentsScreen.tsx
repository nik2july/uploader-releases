import { useMemo } from 'react';
import { useApp } from '../../context/AppContext';

const money = (amount: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);

export function PostProductionPaymentsScreen({ clientName, title = 'Post Production payments' }: { clientName?: string; title?: string }): React.JSX.Element {
  const studio = useApp();
  const jobs = useMemo(() => studio.freelanceJobs
    .filter(job => !clientName || job.clientName === clientName)
    .slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')), [studio.freelanceJobs, clientName]);
  const totals = useMemo(() => jobs.reduce((sum, job) => ({
    billed: sum.billed + (Number(job.clientCharge) || 0),
    received: sum.received + (Number(job.clientPaidAmount) || 0),
  }), { billed: 0, received: 0 }), [jobs]);
  const outstanding = Math.max(0, totals.billed - totals.received);

  return <div className="screen">
    <header><div><h2>{title}</h2></div></header>
    <div className="job-grid" style={{ marginBottom: 14 }}>
      <div className="panel"><div className="cell-label">Billed</div><div className="job-title">{money(totals.billed)}</div></div>
      <div className="panel"><div className="cell-label">Received</div><div className="job-title" style={{ color: '#2f6b34' }}>{money(totals.received)}</div></div>
      <div className="panel"><div className="cell-label">Outstanding</div><div className="job-title" style={{ color: 'var(--burgundy)' }}>{money(outstanding)}</div></div>
    </div>
    <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
      {jobs.length === 0 ? <div className="empty"><h3>No invoices yet</h3><p>{clientName ? 'BAAWARAY FILMS payments to Post Production will appear here.' : 'Payments for BAAWARAY FILMS and other partner studios will appear here.'}</p></div>
        : jobs.map(job => {
          const paid = Number(job.clientPaidAmount) || 0;
          const charge = Number(job.clientCharge) || 0;
          return <div key={job.id} style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: 18, alignItems: 'center' }}>
            <div><div className="job-title">{job.title}</div><div className="sub">{job.clientName}</div></div>
            <div className="muted" style={{ fontSize: 13 }}>Billed {money(charge)} · Received {money(paid)}</div>
            <span className={`status-pill ${job.clientPaymentStatus === 'paid' ? 'done' : job.clientPaymentStatus === 'partial' ? 'warn' : 'idle'}`}>{job.clientPaymentStatus === 'paid' ? 'Paid' : job.clientPaymentStatus === 'partial' ? 'Part paid' : 'Payment pending'}</span>
          </div>;
        })}
    </div>
  </div>;
}
