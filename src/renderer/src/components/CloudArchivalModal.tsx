import { useState } from 'react';
import {
  Archive,
  Cloud,
  HardDrive,
  Trash2,
  Download,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
  X,
  Users,
  Film,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';
import type { FreelanceJob } from '../types/freelance';
import {
  calculateCloudArchivalSummary,
  RawDataArchiveGroup,
  DropboxDeliverableArchive
} from '../utils/cloudArchival';

export function CloudArchivalModal({
  jobs,
  onClose,
  onRefresh,
  onDeliverableArchived
}: {
  jobs: FreelanceJob[];
  onClose: () => void;
  onRefresh?: () => void;
  onDeliverableArchived?: (jobId: string, archivePath: string) => Promise<void>;
}): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<'drive' | 'dropbox'>('drive');
  const [purgedLinks, setPurgedLinks] = useState<Set<string>>(new Set());
  const [savedDeliverables, setSavedDeliverables] = useState<Set<string>>(new Set());
  const [purgedDeliverables, setPurgedDeliverables] = useState<Set<string>>(new Set());
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const summary = calculateCloudArchivalSummary(jobs);

  async function handlePurgeDrive(group: RawDataArchiveGroup): Promise<void> {
    const isB2 = group.rawDataLink.startsWith('b2://') || group.rawDataLink.includes('backblazeb2.com');
    const cloudName = isB2 ? 'Backblaze B2' : 'Google Drive';

    const confirm = window.confirm(
      `Purge raw footage from ${cloudName}?\n\n` +
      `Projects: ${group.projectTitles.join(', ')}\n` +
      `Shared across ${group.totalEditors} editor cut(s).\n\n` +
      `Note: Raw data is already safely stored offline on your studio hard drive. ` +
      `This will immediately reclaim cloud quota on ${cloudName}.`
    );
    if (!confirm) return;

    setBusyAction(`drive-${group.rawDataLink}`);
    setFeedbackMessage(null);
    try {
      if (isB2) {
        if (window.api?.deleteB2Folder) {
          await window.api.deleteB2Folder(group.rawDataLink);
        }
      } else {
        if (window.api?.deleteDriveFolder) {
          await window.api.deleteDriveFolder(group.rawDataLink);
        }
      }
      setPurgedLinks(prev => new Set(prev).add(group.rawDataLink));
      setFeedbackMessage({
        type: 'success',
        text: `Raw footage for "${group.projectTitles[0] || 'project'}" was purged from ${cloudName}.`
      });
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err?.message || `Failed to purge raw folder from ${cloudName}.`
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSaveDropboxDeliverable(item: DropboxDeliverableArchive): Promise<void> {
    setBusyAction(`save-${item.jobId}`);
    setFeedbackMessage(null);
    try {
      const defaultFileName = `${item.jobCode}_${item.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_Master.mp4`;
      let targetPath: string | null = null;
      if (window.api?.chooseSaveLocation) {
        targetPath = await window.api.chooseSaveLocation(defaultFileName);
      }
      if (!targetPath) {
        setBusyAction(null);
        return;
      }

      if (!window.api?.downloadDropboxFile) throw new Error('Final-delivery downloads are unavailable in this version of the desktop app.');
      await window.api.downloadDropboxFile(item.deliveryLink, targetPath);
      await onDeliverableArchived?.(item.jobId, targetPath);
      setSavedDeliverables(prev => new Set(prev).add(item.jobId));
      setFeedbackMessage({
        type: 'success',
        text: `Master deliverable for "${item.title}" downloaded and sent to the local archive: ${targetPath}`
      });
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err?.message || 'Failed to download deliverable from Dropbox.'
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handlePurgeDropboxDeliverable(item: DropboxDeliverableArchive): Promise<void> {
    const isSaved = savedDeliverables.has(item.jobId);
    const confirm = window.confirm(
      `Purge deliverable from Dropbox?\n\n` +
      `Project: ${item.jobCode} - ${item.title}\n` +
      `Delivered: ${item.completedDate} (${item.daysSinceCompletion} days ago)\n\n` +
      (isSaved
        ? `✓ Master cut is already saved locally on your hard drive.`
        : `⚠️ Warning: You have not saved this master to your local hard drive yet!`) +
      `\n\nAre you sure you want to delete this file from Dropbox?`
    );
    if (!confirm) return;

    setBusyAction(`purge-${item.jobId}`);
    setFeedbackMessage(null);
    try {
      if (window.api?.deleteDropboxFile) {
        await window.api.deleteDropboxFile(item.deliveryLink);
      }
      setPurgedDeliverables(prev => new Set(prev).add(item.jobId));
      setFeedbackMessage({
        type: 'success',
        text: `Deliverable for "${item.title}" was purged from Dropbox.`
      });
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err?.message || 'Failed to purge deliverable from Dropbox.'
      });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="modal-shade" style={{ zIndex: 1100 }}>
      <section
        className="work-modal"
        style={{ width: 'min(980px, 95vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="archival-title"
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
              <Archive size={20} />
            </div>
            <div>
              <span className="eyebrow">STUDIO STORAGE MANAGEMENT</span>
              <h2 id="archival-title" style={{ fontSize: 22, margin: '2px 0 0' }}>
                Automated 30-Day Cloud Archival Assistant
              </h2>
            </div>
          </div>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        {/* Global Storage Safety Banner */}
        <div
          style={{
            background: 'color-mix(in srgb, #2f6b34 8%, var(--panel))',
            border: '1px solid color-mix(in srgb, #2f6b34 25%, transparent)',
            borderRadius: 12,
            padding: '10px 14px',
            margin: '0 0 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 13,
            color: 'var(--ink)'
          }}
        >
          <ShieldCheck size={20} style={{ color: '#2f6b34', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <strong>Offline Hard Drive Protection Active:</strong> Original raw footage uploaded to Backblaze B2 exists only for editor downloads. Once downloaded, cloud copies can be purged after the 30-day archival window because master raw data is preserved offline on studio hard drives.
          </div>
        </div>

        {/* Metrics Row */}
        <div className="stat-grid" style={{ marginBottom: 16, flexShrink: 0 }}>
          <div className="stat">
            <div className="label">Raw Packages Tracked</div>
            <div className="value">{summary.stats.totalRawPackages}</div>
            <div className="foot">
              <span style={{ color: '#2f6b34', fontWeight: 600 }}>{summary.stats.rawIn30DayCountdown} In 30d Archive</span> ·{' '}
              <span style={{ color: summary.stats.rawReadyForPurge > 0 ? '#8c2b2b' : 'var(--muted)', fontWeight: 600 }}>
                {summary.stats.rawReadyForPurge} Overdue
              </span>
            </div>
          </div>

          <div className="stat">
            <div className="label">Awaiting Editor Downloads</div>
            <div className="value" style={{ color: summary.stats.rawAwaitingDownloads > 0 ? '#7a5a15' : 'var(--ink)' }}>
              {summary.stats.rawAwaitingDownloads}
            </div>
            <div className="foot">Cannot purge until all editors download</div>
          </div>

          <div className="stat">
            <div className="label">Dropbox Master Cuts</div>
            <div className="value">{summary.stats.totalDeliverables}</div>
            <div className="foot">
              <span style={{ color: summary.stats.deliverablesEligible30Days > 0 ? '#7a5a15' : '#2f6b34', fontWeight: 600 }}>
                {summary.stats.deliverablesEligible30Days} Eligible for 30d Archival
              </span>
            </div>
          </div>
        </div>

        {feedbackMessage && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              fontSize: 13,
              marginBottom: 14,
              background:
                feedbackMessage.type === 'success'
                  ? 'color-mix(in srgb, #2f6b34 12%, var(--panel))'
                  : 'color-mix(in srgb, #8c2b2b 12%, var(--panel))',
              color: feedbackMessage.type === 'success' ? '#2f6b34' : '#8c2b2b',
              border: `1px solid ${feedbackMessage.type === 'success' ? '#2f6b34' : '#8c2b2b'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <span>{feedbackMessage.text}</span>
            <button
              onClick={() => setFeedbackMessage(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid var(--line)', paddingBottom: 10, marginBottom: 16 }}>
          <button
            onClick={() => setActiveTab('drive')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: activeTab === 'drive' ? 'var(--burgundy)' : 'transparent',
              color: activeTab === 'drive' ? '#fff' : 'var(--ink)',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Cloud size={16} />
            Backblaze B2 Raw Data ({summary.rawDataGroups.length})
          </button>
          <button
            onClick={() => setActiveTab('dropbox')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: activeTab === 'dropbox' ? 'var(--burgundy)' : 'transparent',
              color: activeTab === 'dropbox' ? '#fff' : 'var(--ink)',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <HardDrive size={16} />
            Dropbox Deliverables ({summary.dropboxDeliverables.length})
          </button>
        </div>

        {/* Tab Content */}
        <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>
          {activeTab === 'drive' && (
            <div>
              {summary.rawDataGroups.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
                  <Cloud size={36} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
                  <p style={{ margin: 0 }}>No raw footage cloud links attached to active freelance jobs.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {summary.rawDataGroups.map((group, idx) => {
                    const isPurged = purgedLinks.has(group.rawDataLink);
                    const isBusy = busyAction === `drive-${group.rawDataLink}`;
                    const isB2 = group.rawDataLink.startsWith('b2://') || group.rawDataLink.includes('backblazeb2.com');

                    let badgeColor = '#6c757d';
                    let badgeBg = 'color-mix(in srgb, #6c757d 12%, transparent)';
                    let badgeText = 'Awaiting Downloads';

                    if (group.status === 'ready_for_purge') {
                      badgeColor = '#8c2b2b';
                      badgeBg = 'color-mix(in srgb, #8c2b2b 12%, transparent)';
                      badgeText = '🚨 30-Day Period Expired · Ready to Purge';
                    } else if (group.status === 'archived_countdown') {
                      badgeColor = '#2f6b34';
                      badgeBg = 'color-mix(in srgb, #2f6b34 12%, transparent)';
                      badgeText = `⏳ 30d Archival: ${group.daysRemaining} days remaining`;
                    } else {
                      badgeColor = '#7a5a15';
                      badgeBg = 'color-mix(in srgb, #7a5a15 12%, transparent)';
                      badgeText = `⏸️ Active · Downloaded by ${group.downloadedCount}/${group.totalEditors} editors`;
                    }

                    return (
                      <div
                        key={idx}
                        className="panel"
                        style={{
                          margin: 0,
                          padding: 16,
                          opacity: isPurged ? 0.6 : 1,
                          border: isPurged ? '1px dashed var(--line)' : undefined
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <h3 style={{ margin: 0, fontSize: 16 }}>
                                {group.projectTitles.join(' + ') || 'Raw Footage Package'}
                              </h3>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: badgeColor,
                                  background: badgeBg,
                                  padding: '2px 8px',
                                  borderRadius: 999
                                }}
                              >
                                {badgeText}
                              </span>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: isB2 ? '#c43d2e' : '#1a73e8',
                                  background: isB2 ? 'color-mix(in srgb, #c43d2e 12%, transparent)' : 'color-mix(in srgb, #1a73e8 12%, transparent)',
                                  padding: '2px 8px',
                                  borderRadius: 999
                                }}
                              >
                                {isB2 ? 'Backblaze B2' : 'Google Drive'}
                              </span>
                              {isPurged && (
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: '#2f6b34',
                                    background: 'color-mix(in srgb, #2f6b34 12%, transparent)',
                                    padding: '2px 8px',
                                    borderRadius: 999
                                  }}
                                >
                                  ✓ Purged from {isB2 ? 'Backblaze B2' : 'Cloud'}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                              Client(s): {group.clientNames.join(', ') || 'Various'} · Raw Link:{' '}
                              <a
                                href={group.rawDataLink}
                                target="_blank"
                                rel="noreferrer"
                                style={{ color: 'var(--burgundy)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                              >
                                View link <ExternalLink size={11} />
                              </a>
                            </div>
                          </div>

                          {!isPurged && (
                            <button
                              onClick={() => handlePurgeDrive(group)}
                              disabled={isBusy}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '6px 12px',
                                fontSize: 12,
                                borderRadius: 8,
                                background: group.status === 'ready_for_purge' ? '#8c2b2b' : 'transparent',
                                color: group.status === 'ready_for_purge' ? '#fff' : '#8c2b2b',
                                border: '1px solid #8c2b2b',
                                cursor: isBusy ? 'wait' : 'pointer'
                              }}
                              title="Delete folder from cloud storage to reclaim quota. (Offline hard drive copy remains safe)"
                            >
                              <Trash2 size={14} />
                              {isBusy ? 'Purging...' : group.allDownloaded ? `Purge from ${isB2 ? 'Backblaze B2' : 'Cloud'} Now` : 'Purge Anyway (Offline Safe)'}
                            </button>
                          )}
                        </div>

                        {/* Editors Download Status Bar */}
                        <div
                          style={{
                            marginTop: 12,
                            paddingTop: 10,
                            borderTop: '1px solid color-mix(in srgb, var(--line) 40%, transparent)',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                            gap: 8
                          }}
                        >
                          {group.editors.map((ed, eIdx) => (
                            <div
                              key={eIdx}
                              style={{
                                fontSize: 12,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '6px 10px',
                                borderRadius: 6,
                                background: ed.downloaded
                                  ? 'color-mix(in srgb, #2f6b34 6%, var(--paper))'
                                  : 'color-mix(in srgb, #7a5a15 6%, var(--paper))',
                                border: `1px solid ${
                                  ed.downloaded
                                    ? 'color-mix(in srgb, #2f6b34 20%, transparent)'
                                    : 'color-mix(in srgb, #7a5a15 20%, transparent)'
                                }`
                            }}
                          >
                            <div style={{ minWidth: 0, marginRight: 6 }}>
                              <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {ed.editorName}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {ed.cutTitle} ({ed.jobCode})
                              </div>
                            </div>
                            <span
                              style={{
                                flexShrink: 0,
                                fontSize: 11,
                                fontWeight: 600,
                                color: ed.downloaded ? '#2f6b34' : '#7a5a15',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 3
                              }}
                            >
                              {ed.downloaded ? (
                                <>
                                  <CheckCircle2 size={13} />
                                  {ed.downloadedAt ? ed.downloadedAt.slice(0, 10) : 'Downloaded'}
                                </>
                              ) : (
                                <>
                                  <Clock size={13} />
                                  Pending
                                </>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>

                      {group.allDownloaded && (
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Clock size={13} />
                          All editors completed downloading. Retention countdown active from {group.latestDownloadedAt}.
                          Purge deadline: {group.archivalDueDate} ({group.daysRemaining} days left).
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'dropbox' && (
          <div>
            {summary.dropboxDeliverables.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
                <HardDrive size={36} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
                <p style={{ margin: 0 }}>No finalized/completed deliverables in Dropbox found.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {summary.dropboxDeliverables.map((item, idx) => {
                  const isSaved = savedDeliverables.has(item.jobId);
                  const isPurged = purgedDeliverables.has(item.jobId);
                  const isSaving = busyAction === `save-${item.jobId}`;
                  const isPurging = busyAction === `purge-${item.jobId}`;

                  return (
                    <div
                      key={idx}
                      className="panel"
                      style={{
                        margin: 0,
                        padding: 16,
                        opacity: isPurged ? 0.6 : 1,
                        border: isPurged ? '1px dashed var(--line)' : undefined
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontFamily: 'var(--font-caption)', fontWeight: 600, color: 'var(--burgundy)' }}>
                              {item.jobCode}
                            </span>
                            <h3 style={{ margin: 0, fontSize: 16 }}>{item.title}</h3>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: item.status === 'eligible' ? '#7a5a15' : '#2f6b34',
                                background:
                                  item.status === 'eligible'
                                    ? 'color-mix(in srgb, #7a5a15 12%, transparent)'
                                    : 'color-mix(in srgb, #2f6b34 12%, transparent)',
                                padding: '2px 8px',
                                borderRadius: 999
                              }}
                            >
                              {item.status === 'eligible'
                                ? `Delivered ${item.daysSinceCompletion}d ago · Ready for Archival`
                                : `Delivered ${item.daysSinceCompletion}d ago (${item.daysRemaining}d to 30d threshold)`}
                            </span>
                            {isSaved && (
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: '#2f6b34',
                                  background: 'color-mix(in srgb, #2f6b34 12%, transparent)',
                                  padding: '2px 8px',
                                  borderRadius: 999
                                }}
                              >
                                ✓ Saved to Local Drive
                              </span>
                            )}
                            {isPurged && (
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: '#8c2b2b',
                                  background: 'color-mix(in srgb, #8c2b2b 12%, transparent)',
                                  padding: '2px 8px',
                                  borderRadius: 999
                                }}
                              >
                                ✓ Purged from Dropbox
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                            Client: {item.clientName} · Editor: {item.editorName} · Completed: {item.completedDate}
                          </div>
                        </div>

                        {!isPurged && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button
                              onClick={() => handleSaveDropboxDeliverable(item)}
                              disabled={isSaving || isPurging}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '6px 12px',
                                fontSize: 12,
                                borderRadius: 8,
                                background: isSaved ? 'var(--panel)' : 'var(--burgundy)',
                                color: isSaved ? 'var(--ink)' : '#fff',
                                border: '1px solid var(--line)',
                                cursor: isSaving ? 'wait' : 'pointer'
                              }}
                              title="Save master deliverable directly to your local studio hard drive"
                            >
                              <Download size={14} />
                              {isSaving ? 'Saving...' : isSaved ? 'Save Again to Disk' : '1. Save to Local Hard Drive'}
                            </button>

                            <button
                              onClick={() => handlePurgeDropboxDeliverable(item)}
                              disabled={isSaving || isPurging}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '6px 12px',
                                fontSize: 12,
                                borderRadius: 8,
                                background: 'transparent',
                                color: '#8c2b2b',
                                border: '1px solid #8c2b2b',
                                cursor: isPurging ? 'wait' : 'pointer'
                              }}
                              title="Purge deliverable from Dropbox to reclaim 2TB quota"
                            >
                              <Trash2 size={14} />
                              {isPurging ? 'Purging...' : '2. Purge from Dropbox'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <footer style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
        <button className="primary" onClick={onClose}>
          Done
        </button>
      </footer>
    </section>
  </div>
);
}
