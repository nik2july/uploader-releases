import React, { useMemo, useState } from 'react';
import {
  Bell,
  CheckCheck,
  Download,
  Upload,
  RotateCcw,
  HelpCircle,
  IndianRupee,
  Play,
  CheckCircle2,
  Calendar,
  Search,
  ArrowRight,
  Sparkles,
  Clock,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { FreelanceJob } from '../../types';
import { formatTimeAgo, ActivityItem } from './ActivityNotificationSidebar';

export interface RecentActivityScreenProps {
  onSelectJob?: (jobId: string, category?: string) => void;
}

export function RecentActivityScreen({ onSelectJob }: RecentActivityScreenProps) {
  const { currentUser, freelanceJobs, projects } = useApp();
  const [filter, setFilter] = useState<'all' | 'projects' | 'feedback' | 'payments'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const storageKey = `baawaray_activity_last_read_${currentUser.accountType}_${currentUser.id}`;
  const [lastReadTimestamp, setLastReadTimestamp] = useState<string>(() => {
    try {
      return localStorage.getItem(storageKey) || '';
    } catch {
      return '';
    }
  });

  // Aggregate all activities based on role
  const allActivities = useMemo<ActivityItem[]>(() => {
    const isOwner = currentUser.accountType === 'owner';
    const isEditor = currentUser.accountType === 'team';

    const relevantJobs: FreelanceJob[] = freelanceJobs.filter(job => {
      if (isOwner) return true;
      if (isEditor) {
        return (
          job.editorAuthUid === currentUser.id ||
          String(job.editorMemberId) === String(currentUser.id) ||
          (job.editorName && job.editorName.toLowerCase() === currentUser.name.toLowerCase())
        );
      }
      return false;
    });

    const items: ActivityItem[] = [];
    const seenIds = new Set<string>();

    for (const job of relevantJobs) {
      const couple = job.coupleName || (job as any).couple;

      // A. Process job.activityLogs
      for (const log of job.activityLogs || []) {
        if (!log.timestamp || seenIds.has(log.id)) continue;
        seenIds.add(log.id);

        const text = `${log.action} ${log.details || ''}`.toLowerCase();
        let category: ActivityItem['category'] = 'projects';
        let iconType: ActivityItem['iconType'] = 'stage';

        if (text.includes('deliver') || text.includes('cut') || text.includes('export')) {
          category = 'projects';
          iconType = 'upload';
        } else if (text.includes('download') || text.includes('footage') || text.includes('raw data')) {
          category = 'projects';
          iconType = 'download';
        } else if (text.includes('change') || text.includes('revision') || text.includes('feedback')) {
          category = 'feedback';
          iconType = 'revision';
        } else if (text.includes('doubt') || text.includes('quer') || text.includes('question')) {
          category = 'feedback';
          iconType = 'doubt';
        } else if (text.includes('invoice') || text.includes('payment') || text.includes('paid') || text.includes('settle')) {
          category = 'payments';
          iconType = 'payment';
        } else if (text.includes('complet') || text.includes('final')) {
          category = 'projects';
          iconType = 'done';
        }

        items.push({
          id: log.id,
          jobId: job.id,
          jobTitle: job.title,
          jobCode: job.jobCode,
          coupleName: couple,
          serviceType: job.serviceType,
          timestamp: log.timestamp,
          action: log.action,
          details: log.details,
          actor: log.actor,
          category,
          iconType,
        });
      }

      // B. Process Doubts
      for (const doubt of job.doubts || []) {
        const doubtAskId = `doubt_ask_${doubt.id}`;
        if (doubt.askedAt && !seenIds.has(doubtAskId)) {
          seenIds.add(doubtAskId);
          items.push({
            id: doubtAskId,
            jobId: job.id,
            jobTitle: job.title,
            jobCode: job.jobCode,
            coupleName: couple,
            serviceType: job.serviceType,
            timestamp: doubt.askedAt,
            action: `Query posted: "${doubt.question}"`,
            actor: doubt.askedBy || 'Editor',
            category: 'feedback',
            iconType: 'doubt',
          });
        }
        const doubtResId = `doubt_res_${doubt.id}`;
        if (doubt.resolvedAt && !seenIds.has(doubtResId)) {
          seenIds.add(doubtResId);
          items.push({
            id: doubtResId,
            jobId: job.id,
            jobTitle: job.title,
            jobCode: job.jobCode,
            coupleName: couple,
            serviceType: job.serviceType,
            timestamp: doubt.resolvedAt,
            action: `Query answered: "${doubt.clientResponse || 'Resolved'}"`,
            actor: 'Studio',
            category: 'feedback',
            iconType: 'doubt',
          });
        }
      }

      // C. Process Revisions
      for (const rev of job.revisions || []) {
        const revDate = (rev as any).receivedDate || (rev as any).requestedDate || (rev as any).sharedWithEditorDate;
        const isInternal = (rev as any).revisionType === 'internal' || rev.feedbackNotes?.startsWith('[Internal');
        const revId = `rev_${rev.id || `${job.id}_${rev.roundNumber || 1}_${revDate || ''}`}`;
        if (revDate && !seenIds.has(revId)) {
          seenIds.add(revId);
          items.push({
            id: revId,
            jobId: job.id,
            jobTitle: job.title,
            jobCode: job.jobCode,
            coupleName: couple,
            serviceType: job.serviceType,
            timestamp: revDate.includes('T') ? revDate : `${revDate}T12:00:00Z`,
            action: isInternal
              ? `Internal studio changes requested (Round ${rev.roundNumber || 1})`
              : `Revision round ${rev.roundNumber || 1} requested`,
            details: rev.feedbackNotes,
            actor: isInternal ? 'Studio Owner' : 'Client',
            category: 'feedback',
            iconType: 'revision',
          });
        }
      }

      // D. Raw footage marked downloaded event
      if (job.downloadedAt) {
        const dlId = `dl_${job.id}_${job.downloadedAt}`;
        if (!seenIds.has(dlId)) {
          seenIds.add(dlId);
          items.push({
            id: dlId,
            jobId: job.id,
            jobTitle: job.title,
            jobCode: job.jobCode,
            coupleName: couple,
            serviceType: job.serviceType,
            timestamp: job.downloadedAt,
            action: 'Raw footage downloaded · In-Process started',
            actor: job.editorName || 'Editor',
            category: 'projects',
            iconType: 'download',
          });
        }
      }
    }

    // Sort descending by timestamp (newest first)
    return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [currentUser, freelanceJobs, projects]);

  // Category counts
  const categoryCounts = useMemo(() => {
    let projectsCount = 0;
    let feedbackCount = 0;
    let paymentsCount = 0;
    for (const item of allActivities) {
      if (item.category === 'projects') projectsCount++;
      else if (item.category === 'feedback') feedbackCount++;
      else if (item.category === 'payments') paymentsCount++;
    }
    return { all: allActivities.length, projects: projectsCount, feedback: feedbackCount, payments: paymentsCount };
  }, [allActivities]);

  // Filtered and searched items
  const displayedActivities = useMemo(() => {
    let items = allActivities;
    if (filter !== 'all') {
      items = items.filter(item => item.category === filter);
    }
    const needle = searchQuery.trim().toLowerCase();
    if (needle) {
      items = items.filter(
        item =>
          (item.jobTitle && item.jobTitle.toLowerCase().includes(needle)) ||
          (item.coupleName && item.coupleName.toLowerCase().includes(needle)) ||
          (item.jobCode && item.jobCode.toLowerCase().includes(needle)) ||
          (item.action && item.action.toLowerCase().includes(needle)) ||
          (item.details && item.details.toLowerCase().includes(needle)) ||
          (item.actor && item.actor.toLowerCase().includes(needle))
      );
    }
    return items;
  }, [allActivities, filter, searchQuery]);

  // Unread count
  const unreadCount = useMemo(() => {
    if (!lastReadTimestamp) return allActivities.length;
    const readTime = new Date(lastReadTimestamp).getTime();
    return allActivities.filter(a => new Date(a.timestamp).getTime() > readTime).length;
  }, [allActivities, lastReadTimestamp]);

  const handleMarkAllRead = () => {
    const now = new Date().toISOString();
    setLastReadTimestamp(now);
    try {
      localStorage.setItem(storageKey, now);
    } catch {}
  };

  // Group activities chronologically
  const groupedActivities = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);

    const groups: { label: string; items: ActivityItem[] }[] = [
      { label: 'Today', items: [] },
      { label: 'Yesterday', items: [] },
      { label: 'This Week', items: [] },
      { label: 'Earlier', items: [] },
    ];

    for (const item of displayedActivities) {
      const itemTime = new Date(item.timestamp).getTime();
      if (itemTime >= today.getTime()) {
        groups[0].items.push(item);
      } else if (itemTime >= yesterday.getTime()) {
        groups[1].items.push(item);
      } else if (itemTime >= thisWeek.getTime()) {
        groups[2].items.push(item);
      } else {
        groups[3].items.push(item);
      }
    }

    return groups.filter(g => g.items.length > 0);
  }, [displayedActivities]);

  const renderIcon = (type: ActivityItem['iconType'], category: ActivityItem['category']) => {
    switch (type) {
      case 'upload':
        return <Upload size={16} className="text-purple-600" />;
      case 'download':
        return <Download size={16} className="text-blue-600" />;
      case 'revision':
        return <RotateCcw size={16} className="text-rose-600" />;
      case 'doubt':
        return <HelpCircle size={16} className="text-amber-600" />;
      case 'payment':
        return <IndianRupee size={16} className="text-emerald-600" />;
      case 'done':
        return <CheckCircle2 size={16} className="text-emerald-600" />;
      default:
        return <Play size={16} className="text-burgundy" />;
    }
  };

  const getIconBackground = (type: ActivityItem['iconType']) => {
    switch (type) {
      case 'upload':
        return '#f3e8ff';
      case 'download':
        return '#eff6ff';
      case 'revision':
        return '#ffe4e6';
      case 'doubt':
        return '#fef3c7';
      case 'payment':
      case 'done':
        return '#dcfce7';
      default:
        return 'color-mix(in srgb, var(--burgundy) 10%, transparent)';
    }
  };

  return (
    <div className="screen">
      {/* Header */}
      <header>
        <div>
          <span className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Bell size={13} />
            ACTIVITY & UPDATES
          </span>
          <h2>Recent Activity</h2>
          <p>
            Live stream of updates across your assigned projects, revision requests, queries, and payments.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-button"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--burgundy)',
                padding: '7px 12px',
                borderRadius: 8,
                background: 'color-mix(in srgb, var(--burgundy) 8%, transparent)',
                border: '1px solid color-mix(in srgb, var(--burgundy) 20%, transparent)',
                cursor: 'pointer',
              }}
            >
              <CheckCheck size={15} />
              Mark all read ({unreadCount})
            </button>
          )}
        </div>
      </header>

      {/* Filter and Search Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 20,
          paddingBottom: 16,
          borderBottom: '1px solid color-mix(in srgb, var(--line) 40%, transparent)',
        }}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`activity-filter-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
            style={{
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 20,
              border: filter === 'all' ? '1px solid var(--burgundy)' : '1px solid var(--line)',
              background: filter === 'all' ? 'var(--burgundy)' : 'var(--panel)',
              color: filter === 'all' ? '#ffffff' : 'var(--ink)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            All ({categoryCounts.all})
          </button>
          <button
            type="button"
            className={`activity-filter-tab ${filter === 'projects' ? 'active' : ''}`}
            onClick={() => setFilter('projects')}
            style={{
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 20,
              border: filter === 'projects' ? '1px solid var(--burgundy)' : '1px solid var(--line)',
              background: filter === 'projects' ? 'var(--burgundy)' : 'var(--panel)',
              color: filter === 'projects' ? '#ffffff' : 'var(--ink)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Projects & Cuts ({categoryCounts.projects})
          </button>
          <button
            type="button"
            className={`activity-filter-tab ${filter === 'feedback' ? 'active' : ''}`}
            onClick={() => setFilter('feedback')}
            style={{
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 20,
              border: filter === 'feedback' ? '1px solid var(--burgundy)' : '1px solid var(--line)',
              background: filter === 'feedback' ? 'var(--burgundy)' : 'var(--panel)',
              color: filter === 'feedback' ? '#ffffff' : 'var(--ink)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Feedback & Changes ({categoryCounts.feedback})
          </button>
          <button
            type="button"
            className={`activity-filter-tab ${filter === 'payments' ? 'active' : ''}`}
            onClick={() => setFilter('payments')}
            style={{
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 20,
              border: filter === 'payments' ? '1px solid var(--burgundy)' : '1px solid var(--line)',
              background: filter === 'payments' ? 'var(--burgundy)' : 'var(--panel)',
              color: filter === 'payments' ? '#ffffff' : 'var(--ink)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Payments ({categoryCounts.payments})
          </button>
        </div>

        <div style={{ position: 'relative', minWidth: 260 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input
            type="text"
            placeholder="Search activities, couples, codes…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 32px',
              fontSize: 13,
              borderRadius: 8,
              border: '1px solid color-mix(in srgb, var(--line) 60%, transparent)',
              background: 'var(--panel)',
              fontFamily: 'inherit',
              color: 'var(--ink)',
            }}
          />
        </div>
      </div>

      {/* Activity Content Groups */}
      {groupedActivities.length === 0 ? (
        <div className="panel empty" style={{ padding: '60px 20px', textAlign: 'center' }}>
          <Sparkles size={36} style={{ margin: '0 auto 12px auto', opacity: 0.3, color: 'var(--burgundy)' }} />
          <h3 style={{ fontSize: 18, margin: '0 0 6px 0', color: 'var(--ink)' }}>No activities found</h3>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            {searchQuery
              ? `No activity matches "${searchQuery}".`
              : filter !== 'all'
              ? `No activity in category "${filter}".`
              : 'You have no recent updates at this time.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {groupedActivities.map(group => (
            <div key={group.label}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--muted)',
                  marginBottom: 12,
                }}
              >
                <span>{group.label}</span>
                <div style={{ flex: 1, height: 1, background: 'color-mix(in srgb, var(--line) 40%, transparent)' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {group.items.map(item => {
                  const isUnread = lastReadTimestamp ? new Date(item.timestamp).getTime() > new Date(lastReadTimestamp).getTime() : false;

                  return (
                    <article
                      key={item.id}
                      className="panel"
                      onClick={() => item.jobId && onSelectJob && onSelectJob(item.jobId, item.category)}
                      style={{
                        padding: '16px 20px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 16,
                        borderRadius: 12,
                        border: isUnread
                          ? '1px solid color-mix(in srgb, var(--burgundy) 35%, transparent)'
                          : '1px solid color-mix(in srgb, var(--line) 45%, transparent)',
                        background: isUnread
                          ? 'color-mix(in srgb, var(--burgundy) 2%, var(--panel))'
                          : 'var(--panel)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                        cursor: item.jobId ? 'pointer' : 'default',
                        transition: 'transform 0.1s ease, box-shadow 0.1s ease, border-color 0.1s ease',
                      }}
                      onMouseEnter={e => {
                        if (item.jobId) {
                          e.currentTarget.style.borderColor = 'var(--burgundy)';
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(122,46,51,0.08)';
                        }
                      }}
                      onMouseLeave={e => {
                        if (item.jobId) {
                          e.currentTarget.style.borderColor = isUnread
                            ? 'color-mix(in srgb, var(--burgundy) 35%, transparent)'
                            : 'color-mix(in srgb, var(--line) 45%, transparent)';
                          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)';
                        }
                      }}
                    >
                      {/* Icon */}
                      <div
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 10,
                          background: getIconBackground(item.iconType),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      >
                        {renderIcon(item.iconType, item.category)}
                      </div>

                      {/* Details */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            {item.jobTitle && (
                              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>
                                {item.coupleName ? `${item.coupleName} · ` : ''}{item.jobTitle}
                              </span>
                            )}
                            {item.jobCode && (
                              <span
                                className="mono"
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  background: 'var(--paper)',
                                  border: '1px solid var(--line)',
                                  color: 'var(--muted)',
                                }}
                              >
                                {item.jobCode}
                              </span>
                            )}
                            {item.serviceType && (
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  background: 'color-mix(in srgb, var(--burgundy) 8%, transparent)',
                                  color: 'var(--burgundy)',
                                }}
                              >
                                {item.serviceType}
                              </span>
                            )}
                            {isUnread && (
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  padding: '1px 6px',
                                  borderRadius: 10,
                                  background: '#ef4444',
                                  color: '#ffffff',
                                  letterSpacing: '0.04em',
                                }}
                              >
                                NEW
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: 12, flexShrink: 0 }}>
                            <Clock size={13} />
                            <span>{formatTimeAgo(item.timestamp)}</span>
                          </div>
                        </div>

                        {/* Action title */}
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: item.details ? 6 : 4 }}>
                          {item.action}
                        </div>

                        {/* Detail text or feedback note */}
                        {item.details && (
                          <div
                            style={{
                              fontSize: 13,
                              color: 'var(--muted)',
                              lineHeight: 1.5,
                              padding: '8px 12px',
                              borderRadius: 6,
                              background: 'var(--paper)',
                              borderLeft: '3px solid var(--burgundy)',
                              marginBottom: 8,
                              whiteSpace: 'pre-wrap',
                            }}
                          >
                            {item.details}
                          </div>
                        )}

                        {/* Footer Actor & Link */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                          {item.actor ? (
                            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                              by <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{item.actor}</strong>
                            </span>
                          ) : (
                            <span />
                          )}

                          {item.jobId && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: 12,
                                fontWeight: 600,
                                color: 'var(--burgundy)',
                              }}
                            >
                              <span>View project</span>
                              <ArrowRight size={13} />
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
