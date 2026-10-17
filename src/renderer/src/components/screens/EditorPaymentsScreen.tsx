import { useMemo } from 'react';
import type { FreelanceJob, TeamMember } from '../../types';
import { useApp } from '../../context/AppContext';
import { formatINR, formatDate } from '../../utils/formatters';
import { IndianRupee, Wallet, CheckCircle2, AlertCircle, Info } from 'lucide-react';

export function EditorPaymentsScreen({ jobs }: { jobs: FreelanceJob[] }): React.JSX.Element {
  const studio = useApp();

  const currentMember = useMemo<TeamMember | undefined>(() => {
    return studio.team.find((m: TeamMember) => m.authUid === studio.currentUser.id);
  }, [studio.team, studio.currentUser]);

  const isSalaried = currentMember?.payType === 'salaried';

  // Financial totals
  const totalEarned = useMemo(() => {
    return jobs.reduce((sum, j) => sum + (Number(j.editorPay) || 0), 0);
  }, [jobs]);

  const payouts = useMemo(() => {
    const list = currentMember?.freelancePayouts || [];
    return [...list].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }, [currentMember]);

  const totalPaid = useMemo(() => {
    return payouts.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }, [payouts]);

  const pending = Math.max(0, totalEarned - totalPaid);

  const finalizedJobs = useMemo(() => {
    return jobs.filter(
      j => j.stage === 'final_delivered' || j.stage === 'completed'
    );
  }, [jobs]);

  return (
    <div className="screen">
      <header>
        <div>
          <span className="eyebrow">FINANCIALS</span>
          <h2>My Earnings & Payout Journal</h2>
          <p>Track your completed assignments, studio disbursements, and payment history.</p>
        </div>
      </header>

      {isSalaried && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '12px 16px',
            marginBottom: 20,
            borderRadius: 10,
            background: 'color-mix(in srgb, var(--blue, #3b82f6) 10%, var(--paper))',
            border: '1px solid color-mix(in srgb, var(--blue, #3b82f6) 30%, transparent)',
            fontSize: 13,
            color: 'var(--ink)',
          }}
        >
          <Info size={18} style={{ color: 'var(--blue, #3b82f6)', marginTop: 1, flexShrink: 0 }} />
          <div>
            <strong>Salaried Team Member:</strong> You receive a fixed monthly salary from the studio. Post-production assignments are tracked here for delivery milestones, while your pay is processed on your regular monthly payroll.
          </div>
        </div>
      )}

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat">
          <div className="label">Total Project Value</div>
          <div className="value">{formatINR(totalEarned)}</div>
          <div className="foot">Across {jobs.length} assigned project{jobs.length === 1 ? '' : 's'}</div>
        </div>
        <div className="stat">
          <div className="label">Total Received</div>
          <div className="value" style={{ color: '#2f6b34' }}>{formatINR(totalPaid)}</div>
          <div className="foot">{payouts.length} payout record{payouts.length === 1 ? '' : 's'} on file</div>
        </div>
        <div className="stat">
          <div className="label">Pending Payment</div>
          <div className="value" style={{ color: isSalaried ? 'var(--ink)' : pending > 0 ? '#b25e00' : '#2f6b34' }}>
            {isSalaried ? 'Salaried' : formatINR(pending)}
          </div>
          <div className="foot">{isSalaried ? 'Covered by monthly salary' : pending > 0 ? 'Awaiting settlement' : 'All clear'}</div>
        </div>
      </div>

      {/* Payout History Section */}
      <section className="panel" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <span className="eyebrow">DISBURSEMENT JOURNAL</span>
            <h3 style={{ margin: '4px 0 0' }}>Studio Payout History ({payouts.length})</h3>
          </div>
          {totalPaid > 0 && (
            <span style={{ fontSize: 13, fontWeight: 700, color: '#2f6b34' }}>
              {formatINR(totalPaid)} total disbursed
            </span>
          )}
        </div>

        {payouts.length === 0 ? (
          <p className="muted">No payouts recorded by the studio yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {payouts.map(payout => {
              const splits = payout.allocations || [];
              const splitSum = splits.reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
              const advance = Math.max(0, (Number(payout.amount) || 0) - splitSum);

              return (
                <div
                  key={payout.id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    background: 'var(--panel)',
                    border: '1px solid var(--line)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 13.5 }}>{formatDate(payout.date, 'medium')}</span>
                      <span className="muted" style={{ fontSize: 11.5, marginLeft: 8 }}>
                        {payout.mode} {payout.reference ? `· Ref: ${payout.reference}` : ''}
                      </span>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#2f6b34' }}>
                      +{formatINR(payout.amount)}
                    </span>
                  </div>

                  {/* Allocations breakdown */}
                  {splits.length > 0 && (
                    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12 }}>
                      {splits.map((s, idx) => {
                        const targetJob = studio.freelanceJobs.find(j => j.id === s.jobId);
                        return (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                              ↳ For: <strong>{targetJob ? `${targetJob.jobCode || ''} ${targetJob.title}` : 'Assigned Project'}</strong>
                            </span>
                            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{formatINR(s.amount)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {advance > 0 && (
                    <div style={{ marginTop: 4, fontSize: 11.5, color: '#2563eb', fontWeight: 500 }}>
                      ↳ Advance allocation: {formatINR(advance)}
                    </div>
                  )}

                  {payout.notes && (
                    <div className="muted" style={{ marginTop: 4, fontSize: 11.5, fontStyle: 'italic' }}>
                      Note: {payout.notes}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Finalized & Completed Work */}
      <section className="panel">
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
                    <td className="title" style={{ fontWeight: 600 }}>
                      {job.coupleName ? `${job.coupleName} · ` : ''}{job.title}
                    </td>
                    <td>{delDate ? new Date(delDate).toLocaleDateString() : '—'}</td>
                    <td>
                      {isSalaried ? (
                        <span style={{ color: 'var(--muted)', fontWeight: 500 }}>Salaried</span>
                      ) : owed === 0 ? (
                        <span style={{ color: '#2f6b34', fontWeight: 600 }}>Paid</span>
                      ) : (
                        <span style={{ color: '#b25e00', fontWeight: 600 }}>Pending ({formatINR(owed)})</span>
                      )}
                    </td>
                    <td className="right" style={{ fontWeight: 600 }}>
                      {isSalaried ? '—' : formatINR(Number(job.editorPay) || 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
