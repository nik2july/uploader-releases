import React, { useMemo, useState } from 'react';
import {
  Archive,
  Cloud,
  HardDrive,
  Trash2,
  Download,
  CheckCircle2,
  Clock,
  ExternalLink,
  X,
  RefreshCw,
  ShieldCheck,
  Search,
  Filter,
  AlertTriangle
} from 'lucide-react';
import type { FreelanceJob } from '../../types/freelance';
import {
  calculateCloudArchivalSummary,
  RawDataArchiveGroup,
  DropboxDeliverableArchive
} from '../../utils/cloudArchival';

interface CloudArchivalScreenProps {
  jobs: FreelanceJob[];
  onRefresh?: () => void;
  onDeliverableArchived?: (jobId: string, archivePath: string) => Promise<void>;
}

export function CloudArchivalScreen({
  jobs,
  onRefresh,
  onDeliverableArchived
}: CloudArchivalScreenProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<'drive' | 'dropbox'>('drive');
  const [searchQuery, setSearchQuery] = useState('');
  const [rawStatusFilter, setRawStatusFilter] = useState<'all' | 'ready_for_purge' | 'archived_countdown' | 'awaiting_downloads'>('all');
  const [dropboxStatusFilter, setDropboxStatusFilter] = useState<'all' | 'eligible' | 'retaining'>('all');

  const [purgedLinks, setPurgedLinks] = useState<Set<string>>(new Set());
  const [savedDeliverables, setSavedDeliverables] = useState<Set<string>>(new Set());
  const [purgedDeliverables, setPurgedDeliverables] = useState<Set<string>>(new Set());
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const summary = useMemo(() => calculateCloudArchivalSummary(jobs), [jobs]);

  // Filtered Raw Data groups
  const filteredRawGroups = useMemo(() => {
    return summary.rawDataGroups.filter(group => {
      if (rawStatusFilter !== 'all' && group.status !== rawStatusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesProject = group.projectTitles.some(t => t.toLowerCase().includes(q));
        const matchesClient = group.clientNames.some(c => c.toLowerCase().includes(q));
        const matchesEditor = group.editors.some(e => e.editorName.toLowerCase().includes(q));
        return matchesProject || matchesClient || matchesEditor;
      }
      return true;
    });
  }, [summary.rawDataGroups, rawStatusFilter, searchQuery]);

  // Filtered Dropbox deliverables
  const filteredDropboxDeliverables = useMemo(() => {
    return summary.dropboxDeliverables.filter(item => {
      if (dropboxStatusFilter !== 'all' && item.status !== dropboxStatusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchClient = item.clientName.toLowerCase().includes(q);
        const matchEditor = item.editorName.toLowerCase().includes(q);
        const matchCode = item.jobCode.toLowerCase().includes(q);
        if (!matchTitle && !matchClient && !matchEditor && !matchCode) return false;
      }
      return true;
    });
  }, [summary.dropboxDeliverables, dropboxStatusFilter, searchQuery]);

  async function handlePurgeDrive(group: RawDataArchiveGroup): Promise<void> {
    const cloudName = 'Google Drive';

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
      if (window.api?.deleteDriveFolder) {
        await window.api.deleteDriveFolder(group.rawDataLink);
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

      if (!window.api?.downloadDropboxFile) {
        throw new Error('Final-delivery downloads are unavailable in this version of the desktop app.');
      }
      await window.api.downloadDropboxFile(item.deliveryLink, targetPath);
      await onDeliverableArchived?.(item.jobId, targetPath);
      setSavedDeliverables(prev => new Set(prev).add(item.jobId));
      setFeedbackMessage({
        type: 'success',
        text: `Master deliverable for "${item.title}" downloaded and archived to: ${targetPath}`
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
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#7a2e33]/10 flex items-center justify-center text-[#7a2e33]">
              <Archive className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#6b6660]">
                STORAGE & RETENTION MANAGEMENT
              </span>
              <h2 className="text-xl font-bold font-serif text-[#111417] leading-tight">
                Cloud Archival
              </h2>
            </div>
          </div>
          <p className="text-xs text-[#6b6660] mt-1">
            Automated 30-day cloud archival monitoring, hard-drive safe preservation, and cloud quota reclaim.
          </p>
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#d4c1a3] text-xs font-semibold text-[#111417] hover:bg-[#d4c1a3]/20 transition-colors self-start sm:self-auto"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        )}
      </div>

      {/* Global Storage Safety Banner */}
      <div className="bg-[#2f6b34]/10 border border-[#2f6b34]/30 rounded-xl p-3.5 flex items-start sm:items-center gap-3 text-xs text-[#111417]">
        <ShieldCheck className="w-5 h-5 text-[#2f6b34] shrink-0 mt-0.5 sm:mt-0" />
        <div className="flex-1 leading-relaxed">
          <strong className="text-[#2f6b34]">Offline Hard Drive Protection Active:</strong> Original raw footage uploaded to Google Drive exists strictly for editor downloads. Once downloaded by all assigned editors, cloud copies can be safely purged after the 30-day archival window because master raw files remain safe on studio offline hard drives.
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#d4c1a3] shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#6b6660]">
              Raw Packages Tracked
            </span>
            <Cloud className="w-4 h-4 text-[#7a2e33]" />
          </div>
          <div className="text-2xl font-extrabold text-[#111417] mt-1">
            {summary.stats.totalRawPackages}
          </div>
          <div className="text-[11px] text-[#6b6660] mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span className="text-[#2f6b34] font-bold">
              {summary.stats.rawIn30DayCountdown} in 30d Archival
            </span>
            <span>·</span>
            <span className={summary.stats.rawReadyForPurge > 0 ? 'text-[#8c2b2b] font-bold' : 'text-[#6b6660]'}>
              {summary.stats.rawReadyForPurge} Ready for Purge
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#d4c1a3] shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#6b6660]">
              Awaiting Editor Downloads
            </span>
            <Clock className="w-4 h-4 text-amber-700" />
          </div>
          <div className={`text-2xl font-extrabold mt-1 ${summary.stats.rawAwaitingDownloads > 0 ? 'text-amber-700' : 'text-[#111417]'}`}>
            {summary.stats.rawAwaitingDownloads}
          </div>
          <div className="text-[11px] text-[#6b6660] mt-0.5">
            Cloud files locked until all cuts are downloaded
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#d4c1a3] shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#6b6660]">
              Dropbox Master Deliverables
            </span>
            <HardDrive className="w-4 h-4 text-[#7a2e33]" />
          </div>
          <div className="text-2xl font-extrabold text-[#111417] mt-1">
            {summary.stats.totalDeliverables}
          </div>
          <div className="text-[11px] mt-0.5">
            <span className={summary.stats.deliverablesEligible30Days > 0 ? 'text-amber-700 font-semibold' : 'text-[#2f6b34] font-medium'}>
              {summary.stats.deliverablesEligible30Days} eligible for 30d hard drive archival
            </span>
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedbackMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            feedbackMessage.type === 'success'
              ? 'bg-[#2f6b34]/10 border-[#2f6b34]/40 text-[#2f6b34]'
              : 'bg-[#8c2b2b]/10 border-[#8c2b2b]/40 text-[#8c2b2b]'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span className="font-medium">{feedbackMessage.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="p-1 hover:opacity-75 transition-opacity"
            aria-label="Dismiss message"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Tabs and Controls */}
      <div className="bg-white rounded-xl border border-[#d4c1a3] shadow-2xs p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#d4c1a3]/60 pb-3">
          {/* Tab Selector */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('drive')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'drive'
                  ? 'bg-[#7a2e33] text-white shadow-xs'
                  : 'text-[#111417] hover:bg-[#d4c1a3]/20'
              }`}
            >
              <Cloud className="w-3.5 h-3.5" />
              Google Drive Raw Data
              <span
                className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  activeTab === 'drive' ? 'bg-white/20 text-white' : 'bg-[#d4c1a3]/50 text-[#111417]'
                }`}
              >
                {summary.rawDataGroups.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('dropbox')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'dropbox'
                  ? 'bg-[#7a2e33] text-white shadow-xs'
                  : 'text-[#111417] hover:bg-[#d4c1a3]/20'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              Dropbox Deliverables
              <span
                className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  activeTab === 'dropbox' ? 'bg-white/20 text-white' : 'bg-[#d4c1a3]/50 text-[#111417]'
                }`}
              >
                {summary.dropboxDeliverables.length}
              </span>
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative w-full md:w-64">
            <Search className="w-3.5 h-3.5 text-[#6b6660] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search projects, editors, clients..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-[#d4c1a3] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#7a2e33] placeholder:text-[#6b6660]/60"
            />
          </div>
        </div>

        {/* Filter Pills for active tab */}
        {activeTab === 'drive' && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <span className="text-[11px] font-bold text-[#6b6660] uppercase tracking-wider mr-1 flex items-center gap-1">
              <Filter className="w-3 h-3" /> Filter:
            </span>
            {(
              [
                { key: 'all', label: 'All Packages' },
                { key: 'ready_for_purge', label: '🚨 Ready to Purge' },
                { key: 'archived_countdown', label: '⏳ In 30d Countdown' },
                { key: 'awaiting_downloads', label: '⏸️ Awaiting Downloads' }
              ] as const
            ).map(tab => (
              <button
                key={tab.key}
                onClick={() => setRawStatusFilter(tab.key)}
                className={`px-2.5 py-1 rounded-full font-medium transition-colors ${
                  rawStatusFilter === tab.key
                    ? 'bg-[#7a2e33] text-white'
                    : 'bg-[#d4c1a3]/30 text-[#111417] hover:bg-[#d4c1a3]/50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {activeTab === 'dropbox' && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <span className="text-[11px] font-bold text-[#6b6660] uppercase tracking-wider mr-1 flex items-center gap-1">
              <Filter className="w-3 h-3" /> Filter:
            </span>
            {(
              [
                { key: 'all', label: 'All Deliverables' },
                { key: 'eligible', label: 'Eligible for Archival (30d+)' },
                { key: 'retaining', label: 'In Retention (<30d)' }
              ] as const
            ).map(tab => (
              <button
                key={tab.key}
                onClick={() => setDropboxStatusFilter(tab.key)}
                className={`px-2.5 py-1 rounded-full font-medium transition-colors ${
                  dropboxStatusFilter === tab.key
                    ? 'bg-[#7a2e33] text-white'
                    : 'bg-[#d4c1a3]/30 text-[#111417] hover:bg-[#d4c1a3]/50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Tab 1: Google Drive Raw Data Groups */}
        {activeTab === 'drive' && (
          <div className="space-y-4 pt-1">
            {filteredRawGroups.length === 0 ? (
              <div className="text-center py-12 text-[#6b6660]">
                <Cloud className="w-8 h-8 mx-auto mb-2 opacity-40 text-[#7a2e33]" />
                <p className="font-medium text-xs">No raw footage packages match your filters.</p>
              </div>
            ) : (
              filteredRawGroups.map((group, idx) => {
                const isPurged = purgedLinks.has(group.rawDataLink);
                const isBusy = busyAction === `drive-${group.rawDataLink}`;

                let badgeClass = 'bg-[#6c757d]/10 text-[#6c757d] border-[#6c757d]/30';
                let badgeText = 'Awaiting Downloads';

                if (group.status === 'ready_for_purge') {
                  badgeClass = 'bg-[#8c2b2b]/10 text-[#8c2b2b] border-[#8c2b2b]/30';
                  badgeText = '🚨 30-Day Expired · Ready to Purge';
                } else if (group.status === 'archived_countdown') {
                  badgeClass = 'bg-[#2f6b34]/10 text-[#2f6b34] border-[#2f6b34]/30';
                  badgeText = `⏳ 30d Archival: ${group.daysRemaining} days remaining`;
                } else {
                  badgeClass = 'bg-amber-500/10 text-amber-800 border-amber-500/30';
                  badgeText = `⏸️ Active · Downloaded by ${group.downloadedCount}/${group.totalEditors} editors`;
                }

                return (
                  <div
                    key={idx}
                    className={`rounded-xl border border-[#d4c1a3] p-4 bg-[#fbf9f6] transition-all ${
                      isPurged ? 'opacity-60 border-dashed' : 'hover:border-[#7a2e33]/50'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-[#111417] text-sm font-serif">
                            {group.projectTitles.join(' + ') || 'Raw Footage Package'}
                          </h3>

                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeClass}`}>
                            {badgeText}
                          </span>

                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-blue-500/10 text-blue-700 border-blue-500/30">
                            Google Drive
                          </span>

                          {isPurged && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#2f6b34]/10 text-[#2f6b34] border border-[#2f6b34]/30">
                              ✓ Purged from Google Drive
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-[#6b6660] mt-1 flex items-center gap-2 flex-wrap">
                          <span>Client(s): <strong className="text-[#111417]">{group.clientNames.join(', ') || 'Various'}</strong></span>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            Raw Link:
                            <a
                              href={group.rawDataLink}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#7a2e33] font-medium hover:underline inline-flex items-center gap-1"
                            >
                              Open folder <ExternalLink className="w-3 h-3" />
                            </a>
                          </span>
                        </div>
                      </div>

                      {!isPurged && (
                        <button
                          onClick={() => handlePurgeDrive(group)}
                          disabled={isBusy}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
                            group.status === 'ready_for_purge'
                              ? 'bg-[#8c2b2b] text-white hover:bg-[#8c2b2b]/90 shadow-xs'
                              : 'border border-[#8c2b2b] text-[#8c2b2b] hover:bg-[#8c2b2b]/10'
                          } ${isBusy ? 'opacity-60 cursor-wait' : ''}`}
                          title="Purge folder from cloud storage to reclaim storage quota. Offline hard drive copy is protected."
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {isBusy ? 'Purging...' : group.allDownloaded ? 'Purge from Google Drive Now' : 'Purge Anyway (Offline Safe)'}
                        </button>
                      )}
                    </div>

                    {/* Editors Download Status Grid */}
                    <div className="mt-3.5 pt-3 border-t border-[#d4c1a3]/60 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {group.editors.map((ed, eIdx) => (
                        <div
                          key={eIdx}
                          className={`text-xs flex items-center justify-between p-2 rounded-lg border ${
                            ed.downloaded
                              ? 'bg-[#2f6b34]/5 border-[#2f6b34]/30'
                              : 'bg-amber-500/5 border-amber-500/30'
                          }`}
                        >
                          <div className="min-w-0 mr-2">
                            <div className="font-semibold text-[#111417] truncate">
                              {ed.editorName}
                            </div>
                            <div className="text-[11px] text-[#6b6660] truncate">
                              {ed.cutTitle} ({ed.jobCode})
                            </div>
                          </div>

                          <span
                            className={`shrink-0 text-[10px] font-bold flex items-center gap-1 ${
                              ed.downloaded ? 'text-[#2f6b34]' : 'text-amber-800'
                            }`}
                          >
                            {ed.downloaded ? (
                              <>
                                <CheckCircle2 className="w-3 h-3" />
                                {ed.downloadedAt ? ed.downloadedAt.slice(0, 10) : 'Downloaded'}
                              </>
                            ) : (
                              <>
                                <Clock className="w-3 h-3" />
                                Pending
                              </>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>

                    {group.allDownloaded && (
                      <div className="text-[11px] text-[#6b6660] mt-2.5 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[#2f6b34] shrink-0" />
                        <span>
                          All editors downloaded. 30-Day retention countdown active since {group.latestDownloadedAt}.
                          Purge target: <strong className="text-[#111417]">{group.archivalDueDate}</strong> ({group.daysRemaining} days remaining).
                        </span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Tab 2: Dropbox Master Deliverables */}
        {activeTab === 'dropbox' && (
          <div className="space-y-4 pt-1">
            {filteredDropboxDeliverables.length === 0 ? (
              <div className="text-center py-12 text-[#6b6660]">
                <HardDrive className="w-8 h-8 mx-auto mb-2 opacity-40 text-[#7a2e33]" />
                <p className="font-medium text-xs">No Dropbox deliverables match your filters.</p>
              </div>
            ) : (
              filteredDropboxDeliverables.map((item, idx) => {
                const isSaved = savedDeliverables.has(item.jobId);
                const isPurged = purgedDeliverables.has(item.jobId);
                const isSaving = busyAction === `save-${item.jobId}`;
                const isPurging = busyAction === `purge-${item.jobId}`;

                return (
                  <div
                    key={idx}
                    className={`rounded-xl border border-[#d4c1a3] p-4 bg-[#fbf9f6] transition-all ${
                      isPurged ? 'opacity-60 border-dashed' : 'hover:border-[#7a2e33]/50'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-[#7a2e33] px-1.5 py-0.5 rounded-md bg-[#7a2e33]/10">
                            {item.jobCode}
                          </span>
                          <h3 className="font-bold text-[#111417] text-sm font-serif">
                            {item.title}
                          </h3>

                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              item.status === 'eligible'
                                ? 'bg-amber-500/10 text-amber-800 border-amber-500/30'
                                : 'bg-[#2f6b34]/10 text-[#2f6b34] border-[#2f6b34]/30'
                            }`}
                          >
                            {item.status === 'eligible'
                              ? `Delivered ${item.daysSinceCompletion}d ago · Ready for Archival`
                              : `Delivered ${item.daysSinceCompletion}d ago (${item.daysRemaining}d to 30d threshold)`}
                          </span>

                          {isSaved && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#2f6b34]/10 text-[#2f6b34] border border-[#2f6b34]/30">
                              ✓ Saved to Local Drive
                            </span>
                          )}

                          {isPurged && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#8c2b2b]/10 text-[#8c2b2b] border border-[#8c2b2b]/30">
                              ✓ Purged from Dropbox
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-[#6b6660] mt-1 flex items-center gap-2 flex-wrap">
                          <span>Client: <strong className="text-[#111417]">{item.clientName}</strong></span>
                          <span>·</span>
                          <span>Editor: <strong className="text-[#111417]">{item.editorName}</strong></span>
                          <span>·</span>
                          <span>Completed Date: <strong className="text-[#111417]">{item.completedDate}</strong></span>
                        </div>
                      </div>

                      {!isPurged && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleSaveDropboxDeliverable(item)}
                            disabled={isSaving || isPurging}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                              isSaved
                                ? 'bg-white border border-[#d4c1a3] text-[#111417] hover:bg-[#d4c1a3]/20'
                                : 'bg-[#7a2e33] text-white hover:bg-[#7a2e33]/90 shadow-xs'
                            } ${isSaving ? 'opacity-60 cursor-wait' : ''}`}
                            title="Save master cut directly to your local studio hard drive"
                          >
                            <Download className="w-3.5 h-3.5" />
                            {isSaving ? 'Saving...' : isSaved ? 'Save Again to Disk' : '1. Save to Local Hard Drive'}
                          </button>

                          <button
                            onClick={() => handlePurgeDropboxDeliverable(item)}
                            disabled={isSaving || isPurging}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#8c2b2b] text-[#8c2b2b] hover:bg-[#8c2b2b]/10 transition-colors ${
                              isPurging ? 'opacity-60 cursor-wait' : ''
                            }`}
                            title="Purge master deliverable from Dropbox after saving locally"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            {isPurging ? 'Purging...' : '2. Purge from Dropbox'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
