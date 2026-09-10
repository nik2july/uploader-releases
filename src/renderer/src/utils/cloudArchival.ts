import { FreelanceJob } from '../types/freelance';
import { parseDate, addCalendarDays } from './dynamicScheduling';

export interface RawDataArchiveGroup {
  rawDataLink: string;
  driveFolderId?: string;
  jobs: FreelanceJob[];
  projectTitles: string[];
  clientNames: string[];
  editors: {
    jobId: string;
    jobCode: string;
    cutTitle: string;
    editorName: string;
    downloaded: boolean;
    downloadedAt?: string;
    stage: string;
  }[];
  totalEditors: number;
  downloadedCount: number;
  allDownloaded: boolean;
  latestDownloadedAt?: string;
  archivalDueDate?: string;
  daysRemaining?: number;
  status: 'awaiting_downloads' | 'archived_countdown' | 'ready_for_purge';
}

export interface DropboxDeliverableArchive {
  jobId: string;
  jobCode: string;
  title: string;
  clientName: string;
  editorName: string;
  deliveryLink: string;
  completedDate: string;
  daysSinceCompletion: number;
  daysRemaining: number;
  status: 'eligible' | 'retaining';
}

export interface CloudArchivalSummary {
  rawDataGroups: RawDataArchiveGroup[];
  dropboxDeliverables: DropboxDeliverableArchive[];
  stats: {
    totalRawPackages: number;
    rawAwaitingDownloads: number;
    rawIn30DayCountdown: number;
    rawReadyForPurge: number;
    totalDeliverables: number;
    deliverablesEligible30Days: number;
  };
}

const DAY_MS = 86400000;

export function extractDriveFolderId(link: string): string | undefined {
  if (!link) return undefined;
  const folderMatch = link.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];
  const fileMatch = link.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return fileMatch[1];
  const idParam = link.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParam) return idParam[1];
  if (!link.startsWith('http') && link.length >= 10 && !link.includes('/')) return link;
  return undefined;
}

/**
 * Categorizes and calculates 30-day cloud archival lifecycles for:
 * 1. Backblaze B2 Raw Footage (multi-editor download check + 30 day countdown)
 * 2. Dropbox Deliverables (completed >= 30 days retention check)
 */
export function calculateCloudArchivalSummary(
  jobs: FreelanceJob[],
  referenceDate?: string
): CloudArchivalSummary {
  const todayIso = (referenceDate || new Date().toISOString()).slice(0, 10);
  const todayTime = parseDate(todayIso).getTime();

  // --- 1. BACKBLAZE B2 RAW DATA LIFECYCLE ---
  const rawGroupsMap = new Map<string, FreelanceJob[]>();

  for (const job of jobs) {
    const rawLink = (job.rawDataLink || '').trim();
    if (!rawLink) continue;
    // Normalize trailing slash
    const key = rawLink.replace(/\/+$/, '');
    const list = rawGroupsMap.get(key) || [];
    list.push(job);
    rawGroupsMap.set(key, list);
  }

  const rawDataGroups: RawDataArchiveGroup[] = [];

  for (const [rawLink, groupJobs] of rawGroupsMap.entries()) {
    const projectTitles = Array.from(new Set(groupJobs.map(j => j.title).filter(Boolean)));
    const clientNames = Array.from(new Set(groupJobs.map(j => j.clientName).filter(Boolean)));

    const editors = groupJobs.map(j => {
      const isDownloaded = Boolean(j.downloadedAt) || [
        'in_process',
        'sent_for_review',
        'draft_received',
        'sent_to_client',
        'changes_received',
        'changes_sent_to_editor',
        'completed',
        'final_delivered'
      ].includes(j.stage);

      return {
        jobId: j.id,
        jobCode: j.jobCode,
        cutTitle: j.title,
        editorName: j.editorName || 'Unassigned',
        downloaded: isDownloaded,
        downloadedAt: j.downloadedAt,
        stage: j.stage
      };
    });

    const totalEditors = editors.length;
    const downloadedCount = editors.filter(e => e.downloaded).length;
    const allDownloaded = totalEditors > 0 && downloadedCount === totalEditors;

    let latestDownloadedAt: string | undefined;
    let archivalDueDate: string | undefined;
    let daysRemaining: number | undefined;
    let status: RawDataArchiveGroup['status'] = 'awaiting_downloads';

    if (allDownloaded) {
      // Find latest downloaded date among the group
      const dates = groupJobs
        .map(j => (j.downloadedAt || j.dataReceivedDate || j.createdAt || '').slice(0, 10))
        .filter(Boolean);
      dates.sort((a, b) => b.localeCompare(a));
      latestDownloadedAt = dates[0] || todayIso;

      archivalDueDate = addCalendarDays(latestDownloadedAt, 30);
      const dueTime = parseDate(archivalDueDate).getTime();
      daysRemaining = Math.round((dueTime - todayTime) / DAY_MS);

      if (daysRemaining <= 0) {
        status = 'ready_for_purge';
      } else {
        status = 'archived_countdown';
      }
    } else {
      status = 'awaiting_downloads';
    }

    rawDataGroups.push({
      rawDataLink: rawLink,
      driveFolderId: extractDriveFolderId(rawLink),
      jobs: groupJobs,
      projectTitles,
      clientNames,
      editors,
      totalEditors,
      downloadedCount,
      allDownloaded,
      latestDownloadedAt,
      archivalDueDate,
      daysRemaining,
      status
    });
  }

  // Sort raw data groups: ready for purge first, then countdown, then awaiting downloads
  const statusWeight: Record<RawDataArchiveGroup['status'], number> = {
    ready_for_purge: 0,
    archived_countdown: 1,
    awaiting_downloads: 2
  };
  rawDataGroups.sort((a, b) => {
    const wDiff = statusWeight[a.status] - statusWeight[b.status];
    if (wDiff !== 0) return wDiff;
    if (a.daysRemaining !== undefined && b.daysRemaining !== undefined) {
      return a.daysRemaining - b.daysRemaining;
    }
    return 0;
  });

  // --- 2. DROPBOX DELIVERABLES LIFECYCLE (30 DAYS POST-COMPLETION) ---
  const dropboxDeliverables: DropboxDeliverableArchive[] = [];

  for (const job of jobs) {
    const deliveryLink = (job.deliveryLink || '').trim();
    const isFinished = job.stage === 'completed' || job.stage === 'final_delivered';
    if (!deliveryLink || !isFinished) continue;

    const completedDate = (job.completedDate || job.finalDeliveredDate || (job as any).updatedAt || job.createdAt || todayIso).slice(0, 10);
    const compTime = parseDate(completedDate).getTime();
    const daysSinceCompletion = Math.max(0, Math.floor((todayTime - compTime) / DAY_MS));
    const daysRemaining = Math.max(0, 30 - daysSinceCompletion);
    const status: DropboxDeliverableArchive['status'] = daysSinceCompletion >= 30 ? 'eligible' : 'retaining';

    dropboxDeliverables.push({
      jobId: job.id,
      jobCode: job.jobCode,
      title: job.title,
      clientName: job.clientName,
      editorName: job.editorName || 'Editor',
      deliveryLink,
      completedDate,
      daysSinceCompletion,
      daysRemaining,
      status
    });
  }

  // Sort deliverables: eligible (30+ days) first
  dropboxDeliverables.sort((a, b) => {
    if (a.status === 'eligible' && b.status !== 'eligible') return -1;
    if (b.status === 'eligible' && a.status !== 'eligible') return 1;
    return b.daysSinceCompletion - a.daysSinceCompletion;
  });

  const stats = {
    totalRawPackages: rawDataGroups.length,
    rawAwaitingDownloads: rawDataGroups.filter(g => g.status === 'awaiting_downloads').length,
    rawIn30DayCountdown: rawDataGroups.filter(g => g.status === 'archived_countdown').length,
    rawReadyForPurge: rawDataGroups.filter(g => g.status === 'ready_for_purge').length,
    totalDeliverables: dropboxDeliverables.length,
    deliverablesEligible30Days: dropboxDeliverables.filter(d => d.status === 'eligible').length
  };

  return {
    rawDataGroups,
    dropboxDeliverables,
    stats
  };
}
