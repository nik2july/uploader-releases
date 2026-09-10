import type { FreelanceJob } from '../../types';
import { formatINR } from '../../utils/formatters';

export function EditorPaymentsScreen({ jobs }: { jobs: FreelanceJob[] }): React.JSX.Element {
  let totalEarned = 0;
  let totalPaid = 0;

  const paymentHistory: { date: string; amount: number; jobTitle: string; mode: string }[] = [];

  for (const job of jobs) {
    totalEarned += Number(job.editorPay) || 0;
    totalPaid += Number(job.editorPaidAmount) || 0;

    if (job.editorPayouts) {
      for (const payout of job.editorPayouts) {
        paymentHistory.push({
          date: payout.date,
          amount: payout.amount,
          jobTitle: job.title,
          mode: payout.mode || 'Transfer'
        });
      }
    }
  }

  // Sort by date descending
  paymentHistory.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const pending = Math.max(0, totalEarned - totalPaid);

  const finalizedJobs = jobs.filter(
    j => j.stage === 'final_delivered' || j.stage === 'completed'
  );

  return (
    <div className="screen">
      <header>
        <div>
          <span className="eyebrow">FINANCIALS</span>
          <h2>My Earnings & Finalized Work</h2>
          <p>Track your completed projects and payouts from the studio.</p>
        </div>
      </header>

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat">
          <div className="label">Total Earned</div>
          <div className="value">{formatINR(totalEarned)}</div>
          <div className="foot">Across {jobs.length} assigned project{jobs.length === 1 ? '' : 's'}</div>
        </div>
        <div className="stat">
          <div className="label">Total Received</div>
          <div className="value" style={{ color: '#2f6b34' }}>{formatINR(totalPaid)}</div>
          <div className="foot">Disbursed by studio</div>
        </div>
        <div className="stat">
          <div className="label">Pending Payment</div>
          <div className="value" style={{ color: pending > 0 ? '#b25e00' : 'var(--ink)' }}>{formatINR(pending)}</div>
          <div className="foot">{pending > 0 ? 'Awaiting settlement' : 'All clear'}</div>
        </div>
      </div>

      {/* Finalized & Completed Work */}
      <section className="panel" style={{ marginBottom: 20 }}>
        <span className="eyebrow">FINALIZED WORK</span>
        <h3 style={{ margin: '4px 0 12px' }}>Approved & Completed Projects ({finalizedJobs.length})</h3>
        {finalizedJobs.length === 0 ? (
          <p className="muted">No finalized projects yet. Once your delivered work is approved by the studio, it appears here.</p>
        ) : (
          <table className="work-table">
            <thead>
              <tr>
                <th>Job Code</th>
                <th>Project Title</th>
                <th>Delivered Date</th>
                <th>Payment Status</th>
                <th className="right">Your Pay</th>
              </tr>
            </thead>
            <tbody>
              {finalizedJobs.map(job => {
                const owed = Math.max(0, (Number(job.editorPay) || 0) - (Number(job.editorPaidAmount) || 0));
                const delDate = job.finalDeliveredDate || job.draftReceivedDate || job.completedDate || job.createdAt;
                return (
                  <tr key={job.id}>
                    <td className="mono" style={{ fontSize: 12 }}>{job.jobCode || job.id.slice(-6).toUpperCase()}</td>
                    <td className="title" style={{ fontWeight: 600 }}>{job.title}</td>
                    <td>{delDate ? new Date(delDate).toLocaleDateString() : '—'}</td>
                    <td>
                      {owed === 0 ? (
                        <span style={{ color: '#2f6b34', fontWeight: 600 }}>Paid</span>
                      ) : (
                        <span style={{ color: '#b25e00', fontWeight: 600 }}>Pending ({formatINR(owed)})</span>
                      )}
                    </td>
                    <td className="right" style={{ fontWeight: 600 }}>{formatINR(Number(job.editorPay) || 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <span className="eyebrow">PAYOUT JOURNAL</span>
        <h3 style={{ margin: '4px 0 12px' }}>Disbursement History</h3>
        {paymentHistory.length === 0 ? (
          <p className="muted">No payouts have been recorded yet for your projects.</p>
        ) : (
          <table className="work-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Project</th>
                <th>Payment Mode</th>
                <th className="right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {paymentHistory.map((p, i) => (
                <tr key={i}>
                  <td>{new Date(p.date).toLocaleDateString()}</td>
                  <td className="title">{p.jobTitle}</td>
                  <td>{p.mode}</td>
                  <td className="right" style={{ fontWeight: 600 }}>{formatINR(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
