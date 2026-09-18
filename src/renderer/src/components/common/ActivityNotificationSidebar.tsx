import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  X,
  CheckCheck,
  Download,
  Upload,
  MessageSquare,
  AlertTriangle,
  HelpCircle,
  IndianRupee,
  Play,
  CheckCircle2,
  Briefcase,
  ChevronRight,
  Sparkles,
  Calendar,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { FreelanceJob } from '../../types';

export interface ActivityNotificationSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectJob?: (jobId: string) => void;
}

export interface ActivityItem {
  id: string;
  jobId?: string;
  jobTitle?: string;
  jobCode?: string;
  coupleName?: string;
  serviceType?: string;
  timestamp: string; // ISO string
  action: string;
  details?: string;
  actor?: string;
  category: 'projects' | 'feedback' | 'payments';
  iconType: 'upload' | 'download' | 'revision' | 'doubt' | 'payment' | 'stage' | 'done';
}

export function formatTimeAgo(isoString: string): string {
  try {
    const time = new Date(isoString).getTime();
    if (isNaN(time)) return isoString;
    const now = Date.now();
    const diffSec = Math.floor((now - time) / 1000);

    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay === 1) return 'Yesterday';
    if (diffDay < 7) return `${diffDay}d ago`;

    const d = new Date(time);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return isoString;
  }
}

export function ActivityNotificationSidebar({
  isOpen,
  onClose,
  onSelectJob,
}: ActivityNotificationSidebarProps) {
  const { currentUser, freelanceJobs, projects } = useApp();
  const [filter, setFilter] = useState<'all' | 'projects' | 'feedback' | 'payments'>('all');
  const storageKey = `baawaray_activity_last_read_${currentUser.accountType}_${currentUser.id}`;

  const [lastReadTimestamp, setLastReadTimestamp] = useState<string>(() => {
    try {
      return localStorage.getItem(storageKey) || '';
    } catch {
      return '';
    }
  });

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Aggregate all activities based on role
  const allActivities = useMemo<ActivityItem[]>(() => {
    const isOwner = currentUser.accountType === 'owner';
    const isEditor = currentUser.accountType === 'team';

    // 1. Filter jobs based on role
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
            details: rev.feedbackNotes ? `"${rev.feedbackNotes.slice(0, 140)}${rev.feedbackNotes.length > 140 ? '…' : ''}"` : undefined,
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

  // Filtered items
  const filteredActivities = useMemo(() => {
    if (filter === 'all') return allActivities;
    return allActivities.filter(item => item.category === filter);
  }, [allActivities, filter]);

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

    for (const item of filteredActivities) {
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
  }, [filteredActivities]);

  if (!isOpen) return null;

  return (
    <div className="activity-drawer-overlay" onClick={onClose}>
      <aside className="activity-drawer" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="activity-drawer-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="activity-icon-badge">
              <Bell size={16} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Recent Activity</h3>
                {unreadCount > 0 && (
                  <span className="activity-unread-pill">{unreadCount} new</span>
                )}
              </div>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--muted)' }}>
                {currentUser.accountType === 'owner' ? 'Studio-wide updates & deliverables' : 'Updates on your assigned projects'}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {unreadCount > 0 && (
              <button
                type="button"
                className="activity-mark-read-btn"
                onClick={handleMarkAllRead}
                title="Mark all as read"
              >
                <CheckCheck size={14} />
                <span>Mark read</span>
              </button>
            )}
            <button
              type="button"
              className="icon-button"
              onClick={onClose}
              aria-label="Close notification sidebar"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="activity-filter-bar">
          <button
            type="button"
            className={`activity-filter-pill ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({allActivities.length})
          </button>
          <button
            type="button"
            className={`activity-filter-pill ${filter === 'projects' ? 'active' : ''}`}
            onClick={() => setFilter('projects')}
          >
            Projects & Cuts
          </button>
          <button
            type="button"
            className={`activity-filter-pill ${filter === 'feedback' ? 'active' : ''}`}
            onClick={() => setFilter('feedback')}
          >
            Feedback & Queries
          </button>
          <button
            type="button"
            className={`activity-filter-pill ${filter === 'payments' ? 'active' : ''}`}
            onClick={() => setFilter('payments')}
          >
            Payments
          </button>
        </div>

        {/* Activity Stream */}
        <div className="activity-stream-body">
          {groupedActivities.length === 0 ? (
            <div className="activity-empty-state">
              <Sparkles size={32} style={{ opacity: 0.35, marginBottom: 8 }} />
              <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>No recent activity</p>
              <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--muted)' }}>
                {filter === 'all'
                  ? "You're completely caught up! New updates will appear here in real-time."
                  : `No updates found under ${filter}.`}
              </p>
            </div>
          ) : (
            groupedActivities.map(group => (
              <div key={group.label} className="activity-group">
                <div className="activity-group-label">{group.label}</div>
                <div className="activity-list">
                  {group.items.map(item => {
                    const isUnread =
                      !lastReadTimestamp ||
                      new Date(item.timestamp).getTime() > new Date(lastReadTimestamp).getTime();

                    return (
                      <div
                        key={item.id}
                        className={`activity-card ${isUnread ? 'unread' : ''}`}
                        onClick={() => {
                          if (item.jobId && onSelectJob) {
                            onSelectJob(item.jobId);
                            onClose();
                          }
                        }}
                        style={{ cursor: item.jobId ? 'pointer' : 'default' }}
                      >
                        <div className={`activity-card-icon ${item.iconType}`}>
                          {item.iconType === 'upload' ? (
                            <Upload size={14} />
                          ) : item.iconType === 'download' ? (
                            <Download size={14} />
                          ) : item.iconType === 'revision' ? (
                            <AlertTriangle size={14} />
                          ) : item.iconType === 'doubt' ? (
                            <HelpCircle size={14} />
                          ) : item.iconType === 'payment' ? (
                            <IndianRupee size={14} />
                          ) : item.iconType === 'done' ? (
                            <CheckCircle2 size={14} />
                          ) : (
                            <Play size={14} />
                          )}
                        </div>

                        <div className="activity-card-content">
                          <div className="activity-card-top">
                            <span className="activity-card-title">
                              {item.coupleName ? `${item.coupleName} · ` : ''}
                              {item.jobTitle || 'Studio Task'}
                            </span>
                            <span className="activity-card-time">
                              {formatTimeAgo(item.timestamp)}
                            </span>
                          </div>

                          <p className="activity-card-action">{item.action}</p>

                          {item.details && (
                            <p className="activity-card-details">{item.details}</p>
                          )}

                          <div className="activity-card-footer">
                            {item.jobCode && (
                              <span className="activity-card-code">{item.jobCode}</span>
                            )}
                            {item.serviceType && (
                              <span className="activity-card-tag">{item.serviceType}</span>
                            )}
                            {item.actor && (
                              <span className="activity-card-actor">by {item.actor}</span>
                            )}
                          </div>
                        </div>

                        {item.jobId && onSelectJob && (
                          <ChevronRight size={14} className="activity-card-arrow" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}

/**
 * Reusable Bell Trigger Button with dynamic unread counter badge.
 */
export function ActivityNotificationTrigger({
  onClick,
}: {
  onClick: () => void;
}) {
  const { currentUser, freelanceJobs } = useApp();
  const storageKey = `baawaray_activity_last_read_${currentUser.accountType}_${currentUser.id}`;

  const unreadCount = useMemo(() => {
    try {
      const lastRead = localStorage.getItem(storageKey) || '';
      const readTime = lastRead ? new Date(lastRead).getTime() : 0;
      const isOwner = currentUser.accountType === 'owner';
      const isEditor = currentUser.accountType === 'team';

      let count = 0;
      for (const job of freelanceJobs) {
        if (!isOwner && isEditor) {
          const isMyJob =
            job.editorAuthUid === currentUser.id ||
            String(job.editorMemberId) === String(currentUser.id) ||
            (job.editorName && job.editorName.toLowerCase() === currentUser.name.toLowerCase());
          if (!isMyJob) continue;
        }

        for (const log of job.activityLogs || []) {
          if (log.timestamp && new Date(log.timestamp).getTime() > readTime) {
            count++;
          }
        }
      }
      return count;
    } catch {
      return 0;
    }
  }, [currentUser, freelanceJobs, storageKey]);

  return (
    <button
      type="button"
      className="activity-bell-trigger"
      onClick={onClick}
      title="Recent Activity & Updates"
      aria-label="View recent activity and notifications"
    >
      <Bell size={16} />
      {unreadCount > 0 && (
        <span className="activity-bell-badge">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}
