import { Award, CheckCircle2, AlertCircle, Clock, X, Zap } from 'lucide-react';
import type { OnTimeDeliveryReport } from '../utils/dynamicScheduling';

export function OnTimeReportModal({
  report,
  editorName,
  onClose
}: {
  report: OnTimeDeliveryReport;
  editorName: string;
  onClose: () => void;
}): React.JSX.Element {
  const isGreat = report.onTimeScore >= 90;
  const isGood = report.onTimeScore >= 75 && report.onTimeScore < 90;

  const scoreColor = isGreat ? '#2f6b34' : isGood ? '#7a5a15' : '#8c2b2b';

  return (
    <div className="modal-shade">
      <section className="work-modal" style={{ width: 'min(720px, 100%)' }} role="dialog" aria-modal="true" aria-labelledby="ontime-title">
        <header>
          <div>
            <span className="eyebrow">PERFORMANCE REPORT</span>
            <h2 id="ontime-title">On-Time Delivery Metrics</h2>
            <p className="sub" style={{ marginTop: 2 }}>{editorName}'s track record across all completed and delivered projects</p>
          </div>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <div className="stat-grid" style={{ marginBottom: 20 }}>
          <div className="stat" style={{ borderLeft: `4px solid ${scoreColor}` }}>
            <div className="label">On-Time Delivery Score</div>
            <div className="value" style={{ color: scoreColor, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Award size={24} />
              {report.onTimeScore}%
            </div>
            <div className="foot">
              Formula: (On-Time / Total) × 100
            </div>
          </div>

          <div className="stat">
            <div className="label">Total Delivered</div>
            <div className="value">{report.totalDelivered}</div>
            <div className="foot">
              <span style={{ color: '#2f6b34', fontWeight: 600 }}>{report.onTimeCount} On-Time</span> ·{' '}
              <span style={{ color: report.delayedCount > 0 ? '#8c2b2b' : 'var(--muted)', fontWeight: 600 }}>
                {report.delayedCount} Delayed
              </span>
            </div>
          </div>

          <div className="stat">
            <div className="label">Average Turnaround</div>
            <div className="value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={20} />
              {report.averageTurnaroundDays} <span style={{ fontSize: 15, fontWeight: 400 }}>days</span>
            </div>
            <div className="foot">From download to delivery</div>
          </div>

          <div className="stat">
            <div className="label">On-Time Streak</div>
            <div className="value" style={{ color: '#2f6b34', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={20} />
              {report.currentStreak}
            </div>
            <div className="foot">Consecutive on-time cuts</div>
          </div>
        </div>

        <section className="panel" style={{ padding: 16 }}>
          <span className="eyebrow">DELIVERY BREAKDOWN</span>
          <h3 style={{ margin: '4px 0 12px' }}>Project Audit Log ({report.records.length})</h3>

          {report.records.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>
              No delivered cuts recorded yet. As soon as you upload deliverables to review, their on-time records will be logged here.
            </p>
          ) : (
            <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
              <table className="work-table">
                <thead>
                  <tr>
                    <th>Job Code & Title</th>
                    <th>Client</th>
                    <th>Due Date</th>
                    <th>Delivered Date</th>
                    <th>Turnaround</th>
                    <th className="right">Performance</th>
                  </tr>
                </thead>
                <tbody>
                  {report.records.map(rec => (
                    <tr key={rec.jobId}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{rec.title}</div>
                        <div className="sub mono" style={{ fontSize: 11 }}>{rec.jobCode}</div>
                      </td>
                      <td>{rec.clientName}</td>
                      <td>{rec.expectedDueDate || '—'}</td>
                      <td>{rec.deliveredDate || '—'}</td>
                      <td>{rec.turnaroundDays}d</td>
                      <td className="right">
                        {rec.isOnTime ? (
                          <span className="status-pill done" style={{ fontSize: 10, padding: '2px 8px' }}>
                            <CheckCircle2 size={12} />
                            {rec.daysVariance < 0 ? `${Math.abs(rec.daysVariance)}d Early` : 'On Time'}
                          </span>
                        ) : (
                          <span className="status-pill stop" style={{ fontSize: 10, padding: '2px 8px' }}>
                            <AlertCircle size={12} />
                            {rec.daysVariance}d Late
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="actions" style={{ marginTop: 20 }}>
          <button type="button" className="primary" onClick={onClose}>
            Close Report
          </button>
        </div>
      </section>
    </div>
  );
}
