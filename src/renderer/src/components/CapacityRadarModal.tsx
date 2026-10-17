import { useState } from 'react';
import {
  Users,
  Calendar,
  Clock,
  Briefcase,
  CheckCircle2,
  AlertCircle,
  X,
  Palmtree,
  Zap,
  ChevronRight
} from 'lucide-react';
import type { TeamMember } from '../types';
import type { FreelanceJob } from '../types/freelance';
import { calculateEditorWorkloads, EditorWorkload } from '../utils/dynamicScheduling';

export function CapacityRadarModal({
  team,
  jobs,
  onClose,
  onSelectEditor
}: {
  team: TeamMember[];
  jobs: FreelanceJob[];
  onClose: () => void;
  onSelectEditor?: (memberId: number) => void;
}): React.JSX.Element {
  const [filterTone, setFilterTone] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const workloads = calculateEditorWorkloads(jobs, team);

  const availableCount = workloads.filter(w => w.tone === 'available').length;
  const lightCount = workloads.filter(w => w.tone === 'light').length;
  const busyCount = workloads.filter(w => w.tone === 'busy' || w.tone === 'heavy').length;
  const leaveCount = workloads.filter(w => w.tone === 'on_leave').length;

  const filteredWorkloads = workloads.filter(w => {
    if (filterTone !== 'all') {
      if (filterTone === 'available' && w.tone !== 'available') return false;
      if (filterTone === 'light' && w.tone !== 'light') return false;
      if (filterTone === 'busy' && (w.tone !== 'busy' && w.tone !== 'heavy')) return false;
      if (filterTone === 'on_leave' && w.tone !== 'on_leave') return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return w.name.toLowerCase().includes(q) || (w.role || '').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="modal-shade" style={{ zIndex: 1100 }}>
      <section
        className="work-modal"
        style={{ width: 'min(980px, 95vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="radar-title"
      >
        <header style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: 'color-mix(in srgb, var(--burgundy) 12%, transparent)',
                display: 'grid',
                placeItems: 'center',
                color: 'var(--burgundy)'
              }}
            >
              <Zap size={20} />
            </div>
            <div>
              <span className="eyebrow">WORKLOAD & AVAILABILITY INTELLIGENCE</span>
              <h2 id="radar-title" style={{ fontSize: 22, margin: '2px 0 0' }}>
                Editor Capacity Radar
              </h2>
            </div>
          </div>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        {/* Quick Stats Grid */}
        <div className="stat-grid" style={{ marginBottom: 16, flexShrink: 0 }}>
          <div
            className="stat"
            style={{ cursor: 'pointer', borderLeft: filterTone === 'available' ? '4px solid #2f6b34' : undefined }}
            onClick={() => setFilterTone(filterTone === 'available' ? 'all' : 'available')}
          >
            <div className="label">🟢 Available Now</div>
            <div className="value" style={{ color: '#2f6b34' }}>{availableCount}</div>
            <div className="foot">0 active cuts · Ready for assignment</div>
          </div>

          <div
            className="stat"
            style={{ cursor: 'pointer', borderLeft: filterTone === 'light' ? '4px solid #7a5a15' : undefined }}
            onClick={() => setFilterTone(filterTone === 'light' ? 'all' : 'light')}
          >
            <div className="label">🟡 Light Load</div>
            <div className="value" style={{ color: '#7a5a15' }}>{lightCount}</div>
            <div className="foot">1 cut in queue</div>
          </div>

          <div
            className="stat"
            style={{ cursor: 'pointer', borderLeft: filterTone === 'busy' ? '4px solid #8c2b2b' : undefined }}
            onClick={() => setFilterTone(filterTone === 'busy' ? 'all' : 'busy')}
          >
            <div className="label">🔴 Busy / High Load</div>
            <div className="value" style={{ color: '#8c2b2b' }}>{busyCount}</div>
            <div className="foot">2+ cuts queued</div>
          </div>

          <div
            className="stat"
            style={{ cursor: 'pointer', borderLeft: filterTone === 'on_leave' ? '4px solid #1a73e8' : undefined }}
            onClick={() => setFilterTone(filterTone === 'on_leave' ? 'all' : 'on_leave')}
          >
            <div className="label">🏖️ On Leave Today</div>
            <div className="value" style={{ color: '#1a73e8' }}>{leaveCount}</div>
            <div className="foot">Unavailable for edits</div>
          </div>
        </div>

        {/* Filter / Search Bar */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexShrink: 0 }}>
          <input
            type="search"
            placeholder="Search editor name or role..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              padding: '7px 12px',
              borderRadius: 8,
              border: '1px solid var(--line)',
              background: 'var(--paper)',
              fontSize: 13,
              flex: 1
            }}
          />
          {filterTone !== 'all' && (
            <button
              onClick={() => setFilterTone('all')}
              style={{
                fontSize: 12,
                padding: '6px 12px',
                borderRadius: 8,
                background: 'var(--panel)',
                border: '1px solid var(--line)'
              }}
            >
              Clear Filter ({filterTone})
            </button>
          )}
        </div>

        {/* Editor Workload List */}
        <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>
          {filteredWorkloads.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
              <Users size={36} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
              <p style={{ margin: 0 }}>No editors matching the selected filter criteria.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filteredWorkloads.map(item => {
                let badgeBg = 'color-mix(in srgb, #2f6b34 10%, transparent)';
                let badgeBorder = 'color-mix(in srgb, #2f6b34 25%, transparent)';
                let badgeColor = '#2f6b34';

                if (item.tone === 'light') {
                  badgeBg = 'color-mix(in srgb, #7a5a15 10%, transparent)';
                  badgeBorder = 'color-mix(in srgb, #7a5a15 25%, transparent)';
                  badgeColor = '#7a5a15';
                } else if (item.tone === 'busy' || item.tone === 'heavy') {
                  badgeBg = 'color-mix(in srgb, #8c2b2b 10%, transparent)';
                  badgeBorder = 'color-mix(in srgb, #8c2b2b 25%, transparent)';
                  badgeColor = '#8c2b2b';
                } else if (item.tone === 'on_leave') {
                  badgeBg = 'color-mix(in srgb, #1a73e8 10%, transparent)';
                  badgeBorder = 'color-mix(in srgb, #1a73e8 25%, transparent)';
                  badgeColor = '#1a73e8';
                }

                return (
                  <div
                    key={item.memberId}
                    className="panel"
                    style={{
                      margin: 0,
                      padding: 14,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <h3 style={{ margin: 0, fontSize: 16 }}>{item.name}</h3>
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>({item.role || 'Video Editor'})</span>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: badgeColor,
                              background: badgeBg,
                              border: `1px solid ${badgeBorder}`,
                              padding: '2px 10px',
                              borderRadius: 999
                            }}
                          >
                            {item.statusLabel}
                          </span>
                        </div>
                        {item.phone && (
                          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                            Contact: {item.phone}
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Next Free Date</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                            {item.nextAvailableDate}
                          </div>
                        </div>

                        {onSelectEditor && (
                          <button
                            className="primary"
                            style={{ fontSize: 12, padding: '6px 12px' }}
                            onClick={() => {
                              onSelectEditor(item.memberId);
                              onClose();
                            }}
                          >
                            Assign to {item.name.split(' ')[0]}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Active Queue Details */}
                    {item.activeJobs.length > 0 ? (
                      <div
                        style={{
                          background: 'var(--paper)',
                          borderRadius: 8,
                          padding: '8px 12px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6
                        }}
                      >
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
                          Active Queue ({item.activeJobs.length} cut{item.activeJobs.length > 1 ? 's' : ''} · {item.totalAllocatedDays} total days):
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {item.activeJobs.map((job, jIdx) => (
                            <div
                              key={jIdx}
                              style={{
                                fontSize: 12,
                                background: 'var(--panel)',
                                border: '1px solid var(--line)',
                                borderRadius: 6,
                                padding: '4px 8px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6
                              }}
                            >
                              <Briefcase size={12} style={{ color: 'var(--muted)' }} />
                              <span style={{ fontWeight: 500 }}>{job.title}</span>
                              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                                ({job.requiredDays}d required · Due {job.dueDate ? job.dueDate.slice(0, 10) : 'TBD'})
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: '#2f6b34', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CheckCircle2 size={14} />
                        Queue is completely empty. Immediate turnaround available.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <footer style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
          <button className="primary" onClick={onClose}>
            Close
          </button>
        </footer>
      </section>
    </div>
  );
}
