import { useEffect, useMemo, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/auth';
import { useApp } from '../context/AppContext';
import {
  AlertTriangle,
  Award,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FolderOpen,
  HardDrive,
  IndianRupee,
  LogOut,
  MessageSquarePlus,
  Play,
  Pause,
  Upload,
  X,
  HelpCircle,
  Link2,
  Music,
  RotateCcw,
  Link as LinkIcon,
  Bell,
} from 'lucide-react';
import longLogo from '../assets/baawaray-long.svg';
import { EditorPaymentsScreen } from './screens/EditorPaymentsScreen';
import { LeaveCalendarModal } from './LeaveCalendarModal';
import { OnTimeReportModal } from './OnTimeReportModal';
import { EditorDoubtsModal } from './EditorDoubtsModal';
import { formatINR } from '../utils/formatters';
import { formatBytes } from '../utils/uploadFormat';
import { batchFolder, rawBatches, cloudName, type RawBatch } from '../utils/rawBatches';
import { copyToClipboard } from '../utils/clipboard';
import { useTransfers } from '../hooks/useTransfers';
import { GoogleDriveRequiredModal } from './common/GoogleDriveRequiredModal';
import { GoogleDriveConnectBanner } from './common/GoogleDriveConnectBanner';
import { GoogleDriveQuotaModal } from './common/GoogleDriveQuotaModal';
import {
  submitEditorDelivery,
  markJobDownloaded,
  resetJobDownloaded,
  submitEditorRevisionFeedback,
} from '../lib/studioRepository';
import {
  calculateDynamicDueDates,
  calculateOnTimeReport,
  getEditorWorkflowStage,
  type EditorWorkflowStage
} from '../utils/dynamicScheduling';
import type { FreelanceJob, TeamMember } from '../types';
import { RecentActivityScreen } from './common/RecentActivityScreen';
import { UtilitiesScreen } from './screens/utilities/UtilitiesScreen';
import { Wrench } from 'lucide-react';

type View = 'work' | 'payments' | 'activity' | 'utilities';
type StageFilter = 'all' | EditorWorkflowStage | 'changes_needed';

export function EditorDashboard(): React.JSX.Element {
  const studio = useApp();
  const { drive, refresh: refreshDrive } = useTransfers();
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [pendingDownloadAction, setPendingDownloadAction] = useState<(() => void) | null>(null);
  const [view, setView] = useState<View>('work');
  const [stageFilter, setStageFilter] = useState<StageFilter>('in_process');
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [changesJob, setChangesJob] = useState<FreelanceJob | null>(null);
  const [doubtsJob, setDoubtsJob] = useState<FreelanceJob | null>(null);
  const [deliverModalJob, setDeliverModalJob] = useState<FreelanceJob | null>(null);
  const [deliverMode, setDeliverMode] = useState<'dropbox' | 'link'>('link');
  const [deliverUrl, setDeliverUrl] = useState('');
  const [deliverVersionNote, setDeliverVersionNote] = useState('');
  const [deliverRevisionId, setDeliverRevisionId] = useState<string | null>(null);
  const [deliverSubmitting, setDeliverSubmitting] = useState(false);
  const [revisionFeedbackMap, setRevisionFeedbackMap] = useState<Record<string, string>>({});
  const [savingRevisionId, setSavingRevisionId] = useState<string | null>(null);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  const [uploadingJobId, setUploadingJobId] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<{
    percent: number;
    fileName: string;
    uploadedBytes: number;
    totalBytes: number;
  }>({
    percent: 0,
    fileName: '',
    uploadedBytes: 0,
    totalBytes: 0,
  });

  const [downloadingJobId, setDownloadingJobId] = useState<string | null>(null);
  // Which batch of how many is moving right now, when a job has more than one.
  const [downloadBatch, setDownloadBatch] = useState<{ index: number; total: number; label: string } | null>(null);
  // Cancelling stops the batch in flight; this stops the queue behind it too.
  const cancelBatches = useRef(false);
  const [quotaModalJob, setQuotaModalJob] = useState<FreelanceJob | null>(null);
  const [downloadDestDir, setDownloadDestDir] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('baawaray_active_download');
      return saved ? JSON.parse(saved).destDir || '' : '';
    } catch {
      return '';
    }
  });
  const [downloadState, setDownloadState] = useState<{
    percent: number;
    fileName?: string;
    downloadedBytes: number;
    totalBytes: number;
    status: 'downloading' | 'completed' | 'error' | 'paused';
    error?: string;
    speedBytesPerSec?: number;
    estimatedRemainingSec?: number;
  }>({
    percent: 0,
    fileName: '',
    downloadedBytes: 0,
    totalBytes: 0,
    status: 'downloading'
  });

  // Listen for real-time chunk upload progress from main process
  useEffect(() => {
    return window.api.onUploadProgress(data => {
      if (uploadingJobId === data.jobId) {
        setUploadState(prev => ({
          ...prev,
          percent: data.percent,
          uploadedBytes: data.uploadedBytes,
          totalBytes: data.totalBytes,
        }));
      }
    });
  }, [uploadingJobId]);

  // Listen for real-time raw data download progress from main process
  // Listen for real-time raw data download progress from main process
  useEffect(() => {
    return window.api.onDownloadProgress(data => {
      if (!downloadingJobId || downloadingJobId === data.jobId) {
        if (downloadingJobId !== data.jobId) {
          setDownloadingJobId(data.jobId);
        }
        setDownloadState({
          percent: data.percent,
          fileName: data.fileName || '',
          downloadedBytes: data.downloadedBytes,
          totalBytes: data.totalBytes,
          status: data.status,
          error: data.error,
          speedBytesPerSec: data.speedBytesPerSec,
          estimatedRemainingSec: data.estimatedRemainingSec
        });
        if (data.status === 'completed' && data.percent === 100) {
          void markJobDownloaded(data.jobId).catch(() => {});
          localStorage.removeItem('baawaray_active_download');
          setDownloadingJobId(null);
          setDownloadBatch(null);
        }
        // Cache progress in localStorage so if app quits, percentage/bytes are preserved
        try {
          const saved = localStorage.getItem('baawaray_active_download');
          const parsed = saved ? JSON.parse(saved) : {};
          if (parsed.jobId === data.jobId || !parsed.jobId) {
            localStorage.setItem(
              'baawaray_active_download',
              JSON.stringify({
                ...parsed,
                jobId: data.jobId,
                percent: data.percent,
                downloadedBytes: data.downloadedBytes,
                totalBytes: data.totalBytes,
                isPaused: data.status === 'paused'
              })
            );
          }
        } catch {}
      }
    });
  }, [downloadingJobId]);

  // Check on mount if a download is already running in the background in the main process
  useEffect(() => {
    if (!window.api.getActiveDownload) return;
    void (async () => {
      try {
        const active = await window.api.getActiveDownload();
        if (active?.isDownloading && active.jobId) {
          setDownloadingJobId(active.jobId);
          if (active.destDir) setDownloadDestDir(active.destDir);
          if (active.progress) {
            setDownloadState(active.progress);
          } else {
            setDownloadState({
              percent: 0,
              fileName: 'Active in background…',
              downloadedBytes: 0,
              totalBytes: 0,
              status: active.isPaused ? 'paused' : 'downloading'
            });
          }
          // If this active download is still ongoing (< 100%), ensure it is not falsely marked completed
          const activeJob = studio.freelanceJobs.find((j: FreelanceJob) => j.id === active.jobId);
          if (activeJob && activeJob.downloadedAt && (active.progress ? active.progress.percent < 100 : true)) {
            void resetJobDownloaded(active.jobId).catch(() => {});
          }
        }
      } catch {}
    })();
  }, [studio.freelanceJobs]);

  const myJobs = studio.freelanceJobs;

  // Auto-resume active download on app open
  const autoResumedDownloadRef = useRef(false);
  useEffect(() => {
    if (autoResumedDownloadRef.current || !myJobs.length || downloadingJobId) return;
    try {
      const saved = localStorage.getItem('baawaray_active_download');
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (!parsed?.jobId || !parsed?.destDir) return;
      const job = myJobs.find(j => j.id === parsed.jobId);
      if (job && job.stage !== 'completed' && job.stage !== 'final_delivered') {
        autoResumedDownloadRef.current = true;
        setDownloadDestDir(parsed.destDir);
        if (parsed.isPaused) {
          // Keep in paused state so the editor can see where they were and choose when to resume
          setDownloadingJobId(job.id);
          setDownloadState({
            percent: parsed.percent || 0,
            fileName: 'Paused',
            downloadedBytes: parsed.downloadedBytes || 0,
            totalBytes: parsed.totalBytes || 0,
            status: 'paused'
          });
        } else {
          // If already actively downloading in background, just attach and do not trigger duplicate download!
          void (async () => {
            if (window.api.getActiveDownload) {
              try {
                const active = await window.api.getActiveDownload(job.id);
                if (active?.isDownloading) {
                  setDownloadingJobId(job.id);
                  if (active.progress) setDownloadState(active.progress);
                  return;
                }
              } catch {}
            }
            void runDownloadBatches(job, parsed.destDir);
          })();
        }
      } else {
        localStorage.removeItem('baawaray_active_download');
      }
    } catch {
      localStorage.removeItem('baawaray_active_download');
    }
  }, [myJobs, downloadingJobId]);

  const currentMember = useMemo<TeamMember | undefined>(() => {
    return studio.team.find((m: TeamMember) => m.authUid === studio.currentUser.id);
  }, [studio.team, studio.currentUser]);

  // Sequential dynamic scheduling & on-time calculation
  const scheduleResults = useMemo(() => {
    return calculateDynamicDueDates(myJobs, currentMember);
  }, [myJobs, currentMember]);

  const onTimeReport = useMemo(() => {
    return calculateOnTimeReport(myJobs, currentMember);
  }, [myJobs, currentMember]);

  // Activity unread count for sidebar badge
  const activityStorageKey = `baawaray_activity_last_read_${studio.currentUser.accountType}_${studio.currentUser.id}`;
  const activityUnreadCount = useMemo(() => {
    try {
      const lastRead = localStorage.getItem(activityStorageKey) || '';
      const readTime = lastRead ? new Date(lastRead).getTime() : 0;
      let count = 0;
      for (const job of myJobs) {
        for (const log of job.activityLogs || []) {
          if (log.timestamp && new Date(log.timestamp).getTime() > readTime) count++;
        }
        for (const rev of job.revisions || []) {
          const revDate = (rev as any).receivedDate || (rev as any).requestedDate || (rev as any).sharedWithEditorDate;
          if (revDate && new Date(revDate.includes('T') ? revDate : `${revDate}T12:00:00Z`).getTime() > readTime) {
            count++;
          }
        }
        for (const d of job.doubts || []) {
          if (d.resolvedAt && new Date(d.resolvedAt).getTime() > readTime) count++;
        }
      }
      return count;
    } catch {
      return 0;
    }
  }, [myJobs, studio.currentUser, activityStorageKey]);

  // Stage counts for navigation pills
  const stageCounts = useMemo(() => {
    let downloadPending = 0;
    let inProcess = 0;
    let sentForReview = 0;
    let finalized = 0;
    let changesNeeded = 0;

    for (const job of myJobs) {
      const st = getEditorWorkflowStage(job);
      if (st === 'download_pending') downloadPending++;
      else if (st === 'changes_needed') changesNeeded++;
      else if (st === 'in_process') inProcess++;
      else if (st === 'sent_for_review') sentForReview++;
      else if (st === 'finalized') finalized++;
    }
    return { downloadPending, inProcess, sentForReview, finalized, changesNeeded, all: myJobs.length };
  }, [myJobs]);

  // If no jobs in process but jobs are awaiting download, show download tab automatically
  const autoSwitchedTabRef = useRef(false);
  useEffect(() => {
    if (!autoSwitchedTabRef.current && stageCounts.inProcess === 0 && stageCounts.changesNeeded === 0 && stageCounts.downloadPending > 0 && stageFilter === 'in_process') {
      autoSwitchedTabRef.current = true;
      setStageFilter('download_pending');
    }
  }, [stageCounts, stageFilter]);

  const filteredJobs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let jobs = myJobs;

    if (stageFilter === 'changes_needed') {
      jobs = jobs.filter(
        job =>
          job.stage === 'changes_sent_to_editor' ||
          job.stage === 'internal_changes' ||
          job.stage === 'changes_received' ||
          getEditorWorkflowStage(job) === 'changes_needed'
      );
    } else if (stageFilter !== 'all') {
      jobs = jobs.filter(job => getEditorWorkflowStage(job) === stageFilter);
    }

    if (!needle) return jobs;
    return jobs.filter(job =>
      `${job.title} ${job.coupleName || ''} ${(job as any).couple || ''} ${job.serviceType || ''} ${job.jobCode || ''}`.toLowerCase().includes(needle)
    );
  }, [myJobs, stageFilter, query]);

  async function copy(key: string, value: string): Promise<void> {
    if (!value) return;
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopied(key);
      setTimeout(() => setCopied(''), 2200);
    }
  }

  function sanitizeFolderName(name: string): string {
    return name.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
  }

  function formatETA(seconds?: number): string {
    if (!seconds || seconds <= 0 || !isFinite(seconds)) return '';
    if (seconds < 60) return `${seconds}s remaining`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return `${mins}m ${secs > 0 ? `${secs}s ` : ''}remaining`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins > 0 ? `${remMins}m ` : ''}remaining`;
  }

  async function resolveProjectDestDir(job: FreelanceJob, baseDir: string): Promise<string> {
    let folderName = sanitizeFolderName(`${job.jobCode ? `${job.jobCode} - ` : ''}${job.title || 'Raw Footage'}`);
    try {
      if (window.api.getDownloadDetails && job.rawDataLink) {
        const details = await window.api.getDownloadDetails(job.rawDataLink);
        if (details?.folderName) {
          folderName = sanitizeFolderName(details.folderName);
        }
      }
    } catch {
      // fallback to project folderName
    }
    const cleanBase = baseDir.replace(/\/+$/, '');
    if (cleanBase.endsWith(`/${folderName}`) || cleanBase === folderName) {
      return cleanBase;
    }
    return `${cleanBase}/${folderName}`;
  }

  /** Warns before filling a disk, and returns whether the editor still wants to go on. */
  async function diskSpaceAllows(destDir: string, expectedBytes: number): Promise<boolean> {
    try {
      const disk = await window.api.checkDiskSpace(destDir);
      if (expectedBytes > 0) {
        const safetyHeadroom = 1024 * 1024 * 1024; // 1 GB working headroom
        if (disk.freeBytes < expectedBytes + safetyHeadroom) {
          return window.confirm(
            `⚠️ Low Disk Space Warning!\n\n` +
            `Package size to download: ${formatBytes(expectedBytes)}\n` +
            `Available space on drive: ${formatBytes(disk.freeBytes)}\n\n` +
            `Destination: ${destDir}\n\n` +
            `This drive does not have enough free space to safely complete this download.\n` +
            `We recommend selecting an external SSD or freeing up space. Do you want to proceed anyway?`
          );
        }
      } else if (disk.freeBytes < 5 * 1024 * 1024 * 1024) {
        // Size could not be pre-determined, so only a critically low disk is worth stopping for.
        return window.confirm(
          `⚠️ Low Disk Space Warning!\n\n` +
          `Selected drive has only ${formatBytes(disk.freeBytes)} free.\n\n` +
          `Destination: ${destDir}\n\n` +
          `We recommend selecting an external SSD or freeing up space. Do you want to proceed anyway?`
        );
      }
    } catch {
      // Continue if the disk space check is inconclusive.
    }
    return true;
  }

  /**
   * Fetches the given batches into one chosen folder, one after another.
   */
  async function runDownloadBatches(job: FreelanceJob, destDir: string, batches?: RawBatch[]): Promise<void> {
    const all = rawBatches(job);
    const list = batches?.length ? batches : all;
    if (!list.length) return;

    const hasDrive = list.some(b => b.cloud === 'Google Drive' || cloudName(b.link) === 'Google Drive');
    if (hasDrive && !drive?.connected) {
      setPendingDownloadAction(() => () => { void runDownloadBatches(job, destDir, batches); });
      setShowDriveModal(true);
      setError('Please connect your Google account to download raw footage from the Baawaray Films Shared Drive.');
      return;
    }

    setError('');
    setNote('');

    setDownloadDestDir(destDir);
    try {
      localStorage.setItem('baawaray_active_download', JSON.stringify({ jobId: job.id, destDir, isPaused: false }));
    } catch {
      /* ignore storage quota */
    }

    let expectedBytes = list.reduce((sum, batch) => sum + batch.bytes, 0)
      || (list.length === all.length ? Number((job as any).rawDataSizeBytes) || 0 : 0);
    if (!expectedBytes && window.api.getDownloadSize) {
      try {
        let total = 0;
        for (const batch of list) total += await window.api.getDownloadSize(batch.link);
        expectedBytes = total;
      } catch {
        // Leave the size unknown; the guard below falls back to a low-disk check.
      }
    }
    if (!(await diskSpaceAllows(destDir, expectedBytes))) {
      localStorage.removeItem('baawaray_active_download');
      return;
    }

    const multi = list.length > 1;
    cancelBatches.current = false;
    setDownloadingJobId(job.id);
    setDownloadState({
      percent: 0,
      fileName: 'Connecting…',
      downloadedBytes: 0,
      totalBytes: expectedBytes || 0,
      status: 'downloading'
    });

    try {
      for (const [index, batch] of list.entries()) {
        if (cancelBatches.current) {
          return;
        }
        setDownloadBatch(multi ? { index: index + 1, total: list.length, label: `${batch.label} · ${batch.cloud}` } : null);
        const res = await window.api.downloadRawData(job.id, batch.link, multi ? `${destDir}/${batchFolder(batch)}` : destDir);
        if (res && res.success === false) {
          const saved = localStorage.getItem('baawaray_active_download');
          if (saved) {
            const parsed = JSON.parse(saved);
            if (!parsed.isPaused) {
              localStorage.removeItem('baawaray_active_download');
            }
          }
          return;
        }
      }
      if (cancelBatches.current) {
        return;
      }
      // Open Folder should land on the folder holding every batch, not the last one.
      if (multi) await window.api.verifyLocalFolder(job.id, destDir).catch(() => {});
      localStorage.removeItem('baawaray_active_download');
      if (list.length === all.length) {
        // Automatically advance to in_process once the whole job is on disk.
        await markJobDownloaded(job.id);
        setNote(`✓ Raw data download complete for "${job.title}"${multi ? ` (${list.length} batches)` : ''}. Job moved to In-Process.`);
        setDownloadingJobId(null);
        setDownloadBatch(null);
      } else {
        const left = all.length - list.length;
        setNote(`✓ ${list.map(b => b.label).join(', ')} downloaded. ${left} more ${left === 1 ? 'batch' : 'batches'} still to fetch before this job starts.`);
        setDownloadingJobId(null);
        setDownloadBatch(null);
      }
    } catch (err: any) {
      const msg = String(err?.message || '');
      const isAlreadyRunning = msg.toLowerCase().includes('already in progress');
      if (isAlreadyRunning) {
        // Main process is already actively downloading this job! Keep card visible and attach!
        setDownloadingJobId(job.id);
        setError('');
        if (window.api.getActiveDownload) {
          try {
            const active = await window.api.getActiveDownload(job.id);
            if (active?.progress) setDownloadState(active.progress);
            if (active?.destDir) setDownloadDestDir(active.destDir);
          } catch {}
        }
        return;
      }
      const isCancelled =
        msg.toLowerCase().includes('cancel') ||
        msg.toLowerCase().includes('abort') ||
        msg.toLowerCase().includes('closed');
      if (!isCancelled) {
        const cleanMsg = msg
          .replace(/^Error invoking remote method '[^']+': Error: /, '')
          .replace(/^Error: /, '');
        setError(cleanMsg || 'Failed to download raw data.');
        setDownloadState(prev => ({ ...prev, status: 'error', error: cleanMsg }));
        if (cleanMsg.toLowerCase().includes('quota exceeded') || cleanMsg.toLowerCase().includes('daily limit reached')) {
          setQuotaModalJob(job);
        }
      }
    } finally {
      let isStillRunning = false;
      if (window.api.getActiveDownload) {
        try {
          const check = await window.api.getActiveDownload(job.id);
          isStillRunning = check.isDownloading;
        } catch {}
      }
      const saved = localStorage.getItem('baawaray_active_download');
      const isPaused = saved ? JSON.parse(saved).isPaused : false;
      if (!isPaused && !isStillRunning) {
        setDownloadingJobId(null);
        setDownloadBatch(null);
      }
    }
  }

  async function handleStartDownload(job: FreelanceJob, batches?: RawBatch[]): Promise<void> {
    setError('');
    const all = rawBatches(job);
    const list = batches?.length ? batches : all;
    const hasDrive = list.some(b => b.cloud === 'Google Drive' || cloudName(b.link) === 'Google Drive');
    if (hasDrive && !drive?.connected) {
      setPendingDownloadAction(() => () => { void handleStartDownload(job, batches); });
      setShowDriveModal(true);
      return;
    }

    try {
      const chosen = await window.api.chooseDownloadDirectory();
      if (!chosen) return; // User canceled dialog
      const targetDestDir = await resolveProjectDestDir(job, chosen);
      await runDownloadBatches(job, targetDestDir, batches);
    } catch (err: any) {
      const msg = String(err?.message || '');
      const isCancelled =
        msg.toLowerCase().includes('cancel') ||
        msg.toLowerCase().includes('abort') ||
        msg.toLowerCase().includes('closed');
      if (!isCancelled) {
        const cleanMsg = msg
          .replace(/^Error invoking remote method '[^']+': Error: /, '')
          .replace(/^Error: /, '');
        setError(cleanMsg || 'Failed to start download.');
      }
    }
  }

  async function handlePauseDownload(jobId: string): Promise<void> {
    cancelBatches.current = true;
    try {
      const saved = localStorage.getItem('baawaray_active_download');
      if (saved) {
        const parsed = JSON.parse(saved);
        localStorage.setItem('baawaray_active_download', JSON.stringify({ ...parsed, isPaused: true }));
      }
    } catch {}
    await window.api.pauseDownload(jobId);
    setDownloadState(prev => ({
      ...prev,
      status: 'paused',
      fileName: 'Download paused'
    }));
  }

  async function handleResumeDownload(job: FreelanceJob, batches?: RawBatch[]): Promise<void> {
    setError('');
    const all = rawBatches(job);
    const list = batches?.length ? batches : all;
    const hasDrive = list.some(b => b.cloud === 'Google Drive' || cloudName(b.link) === 'Google Drive');
    if (hasDrive && !drive?.connected) {
      setPendingDownloadAction(() => () => { void handleResumeDownload(job, batches); });
      setShowDriveModal(true);
      return;
    }

    let dest = downloadDestDir;
    if (!dest) {
      try {
        const saved = localStorage.getItem('baawaray_active_download');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.destDir) dest = parsed.destDir;
        }
      } catch {}
    }
    if (!dest) {
      return handleStartDownload(job, batches);
    }
    await runDownloadBatches(job, dest, batches);
  }

  async function handleChangeDestination(job: FreelanceJob, batches?: RawBatch[]): Promise<void> {
    setError('');
    const newBase = await window.api.chooseDownloadDirectory();
    if (!newBase) return;
    const newDest = await resolveProjectDestDir(job, newBase);
    setDownloadDestDir(newDest);
    try {
      const saved = localStorage.getItem('baawaray_active_download');
      const parsed = saved ? JSON.parse(saved) : {};
      localStorage.setItem('baawaray_active_download', JSON.stringify({ ...parsed, jobId: job.id, destDir: newDest }));
    } catch {}
    setNote(`Destination changed to: ${newDest}. Click Resume to start downloading.`);
  }

  async function handleCancelDownload(jobId: string): Promise<void> {
    cancelBatches.current = true;
    localStorage.removeItem('baawaray_active_download');
    await window.api.cancelDownload(jobId);
    setDownloadingJobId(null);
    setDownloadBatch(null);
    setError('');
  }

  async function handleResetDownloaded(jobId: string): Promise<void> {
    setError('');
    setNote('');
    try {
      await resetJobDownloaded(jobId);
      await window.api.forgetDownloadedFolder(jobId);
      setNote('Job reset to Download Pending.');
    } catch (err: any) {
      setError(err?.message || 'Failed to reset download status.');
    }
  }

  async function handleOpenDownloadedFolder(jobId: string): Promise<void> {
    setError('');
    try {
      await window.api.openDownloadedFolder(jobId);
    } catch (err: any) {
      setError(err?.message || 'Could not open the downloaded folder. Use Locate folder to reconnect it.');
    }
  }

  async function handleConfirmHardDriveReceived(job: FreelanceJob): Promise<void> {
    setError('');
    setNote('');
    setBusy(`${job.id}:hard_drive`);
    try {
      await markJobDownloaded(job.id);
      setNote(`✓ Physical hard drive received for "${job.title}". Job moved to In-Process.`);
    } catch (err: any) {
      setError(err?.message || 'Failed to update hard drive status.');
    } finally {
      setBusy('');
    }
  }

  async function handleLocateDownloadedFolder(job: FreelanceJob): Promise<void> {
    setError('');
    setNote('');
    const folderPath = await window.api.chooseDownloadDirectory();
    if (!folderPath) return;

    setBusy(`${job.id}:locate`);
    try {
      const verifyRes = await window.api.verifyLocalFolder(job.id, folderPath);
      if (!verifyRes.valid) {
        setError('Selected folder does not contain any files. Please select the folder with footage.');
        return;
      }
      await markJobDownloaded(job.id);
      setNote(`✓ Verified ${verifyRes.fileCount} local files (${formatBytes(verifyRes.totalBytes)}). Job moved to In-Process.`);
    } catch (err: any) {
      setError(err?.message || 'Could not verify local folder.');
    } finally {
      setBusy('');
    }
  }

  async function handleDeliverViaLink(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!deliverModalJob || !deliverUrl.trim()) return;
    setError('');
    setNote('');
    setDeliverSubmitting(true);

    try {
      await submitEditorDelivery(
        deliverModalJob.id,
        deliverUrl.trim(),
        true,
        {
          revisionId: deliverRevisionId || undefined,
          editorNotes: deliverVersionNote.trim() || undefined,
          actor: studio.currentUser.name,
        }
      );
      setNote(`✓ Deliverable submitted for "${deliverModalJob.title}". Moved to Sent for Review.`);
      setDeliverModalJob(null);
      setDeliverUrl('');
      setDeliverVersionNote('');
      setDeliverRevisionId(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to submit deliverable link.');
    } finally {
      setDeliverSubmitting(false);
    }
  }

  async function handleChooseAndUpload(job: FreelanceJob): Promise<void> {
    setError('');
    setNote('');

    // Step 1: Open native OS file picker
    const file = await window.api.chooseDeliverableFile();
    if (!file) return;

    // Step 2: Verify Dropbox connection
    let dbxStatus = await window.api.dropboxStatus();
    if (!dbxStatus.connected && studio.studioSettings?.dropbox?.refreshToken) {
      dbxStatus = await window.api.connectDropbox(studio.studioSettings.dropbox);
    }

    if (!dbxStatus.connected) {
      setError('Studio Dropbox is not connected yet. You can still submit a Google Drive, Vimeo, or external review link using "Submit Cloud / Share Link".');
      return;
    }

    // Step 3: Start chunked upload
    setUploadingJobId(job.id);
    setUploadState({
      percent: 0,
      fileName: file.fileName,
      uploadedBytes: 0,
      totalBytes: file.fileSize,
    });

    try {
      const deliveryUrl = await window.api.uploadDeliverable(
        job.id,
        file.filePath,
        job.title || `Job_${job.id}`,
        file.fileName
      );

      // Submit delivery link to Firestore and advance stage to draft_received
      await submitEditorDelivery(job.id, deliveryUrl, true, {
        revisionId: deliverRevisionId || undefined,
        editorNotes: deliverVersionNote.trim() || undefined,
        actor: studio.currentUser.name,
      });
      setNote('✓ Deliverable uploaded to Studio Dropbox and submitted for review!');
      setDeliverModalJob(null);
      setDeliverVersionNote('');
      setDeliverRevisionId(null);
    } catch (err: any) {
      setError(err?.message || 'Upload to Studio Dropbox failed.');
    } finally {
      setUploadingJobId(null);
    }
  }

  const navigateToStage = (stage: typeof stageFilter) => {
    setView('work');
    setStageFilter(stage);
    setError('');
  };

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="wordmark"><img src={longLogo} alt="Baawaray" /></div>
        <div className="who">{studio.currentUser.name} (Editor)</div>

        <button
          className="nav-item"
          aria-current={view === 'activity'}
          onClick={() => {
            setView('activity');
            setError('');
          }}
        >
          <Bell size={16} /> Recent Activity
          {activityUnreadCount > 0 && (
            <span className="count" style={{ background: 'var(--burgundy)', color: '#fff' }}>
              {activityUnreadCount > 99 ? '99+' : activityUnreadCount}
            </span>
          )}
        </button>

        <button className="nav-item" aria-current={view === 'work' && stageFilter === 'download_pending'} onClick={() => navigateToStage('download_pending')}>
          <Download size={16} /> Download
          {stageCounts.downloadPending > 0 && <span className="count">{stageCounts.downloadPending}</span>}
        </button>
        <button className="nav-item" aria-current={view === 'work' && stageFilter === 'in_process'} onClick={() => navigateToStage('in_process')}>
          <Play size={16} /> In Process
          {stageCounts.inProcess > 0 && <span className="count">{stageCounts.inProcess}</span>}
        </button>
        <button
          className="nav-item"
          aria-current={view === 'work' && stageFilter === 'changes_needed'}
          onClick={() => navigateToStage('changes_needed')}
          style={stageCounts.changesNeeded > 0 ? { color: '#dc2626', fontWeight: 600 } : undefined}
        >
          <RotateCcw size={16} /> Changes & Revisions
          {stageCounts.changesNeeded > 0 && (
            <span className="count" style={{ background: '#ef4444', color: '#fff' }}>{stageCounts.changesNeeded}</span>
          )}
        </button>
        <button className="nav-item" aria-current={view === 'work' && stageFilter === 'sent_for_review'} onClick={() => navigateToStage('sent_for_review')}>
          <Clock size={16} /> Sent for Review
          {stageCounts.sentForReview > 0 && <span className="count">{stageCounts.sentForReview}</span>}
        </button>
        <button className="nav-item" aria-current={view === 'work' && stageFilter === 'finalized'} onClick={() => navigateToStage('finalized')}>
          <CheckCircle2 size={16} /> Finalization
          {stageCounts.finalized > 0 && <span className="count">{stageCounts.finalized}</span>}
        </button>
        <button className="nav-item" disabled={!currentMember} title={!currentMember ? 'Your team login is not linked to a crew record yet.' : 'Manage leave and off days'} onClick={() => setShowLeaveModal(true)}>
          <Calendar size={16} /> My Day Off
          {(currentMember?.unavailablePeriods?.length || 0) > 0 && <span className="count">{currentMember?.unavailablePeriods?.length}</span>}
        </button>
        <button className="nav-item" onClick={() => setShowReportModal(true)}>
          <Award size={16} /> On Time
          <span className="count">{onTimeReport.onTimeScore}%</span>
        </button>
        <button className="nav-item" aria-current={view === 'payments'} onClick={() => { setView('payments'); setError(''); }}>
          <IndianRupee size={16} /> Payments
          {stageCounts.finalized > 0 && <span className="count">{stageCounts.finalized}</span>}
        </button>

        <button className="nav-item" aria-current={view === 'utilities'} onClick={() => { setView('utilities'); setError(''); }}>
          <Wrench size={16} /> Utilities
        </button>

        <div className="spacer" />
        <button className="nav-item" onClick={() => { void signOut(auth); }}>
          <LogOut size={16} /> Sign out
        </button>
      </nav>

      <main className="main-area">
        <GoogleDriveConnectBanner
          connected={Boolean(drive?.connected)}
          onConnect={() => setShowDriveModal(true)}
        />
        {view === 'utilities' ? (
          <UtilitiesScreen />
        ) : view === 'activity' ? (
          <RecentActivityScreen
            onSelectJob={(jobId) => {
              const target = myJobs.find(j => j.id === jobId);
              if (target) {
                const st = getEditorWorkflowStage(target);
                navigateToStage(st as any);
                setQuery(target.jobCode || target.title);
              }
            }}
          />
        ) : view === 'work' ? (
          <div className="screen">
            <header>
              <div>
                <span className="eyebrow">ASSIGNED WORKFLOW</span>
                <h2>My assigned projects</h2>
                <p>Download footage, follow your editing queue, resolve queries, and submit deliverables for review.</p>
              </div>
              <div className="actions" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search projects or couple…"
                  style={{
                    font: 'inherit',
                    fontSize: 14,
                    padding: '9px 11px',
                    borderRadius: 10,
                    minWidth: 230,
                    background: 'var(--panel)',
                    border: '1px solid color-mix(in srgb, var(--line) 50%, transparent)'
                  }}
                />
              </div>
            </header>

            {studio.error && (
              <p className="error" role="alert" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{studio.error}</span>
              </p>
            )}
            {error && (
              <p className="error" role="alert" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{error}</span>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setError('')}
                  style={{ padding: '0 6px', fontSize: 13, color: 'inherit', fontWeight: 'bold', cursor: 'pointer' }}
                  aria-label="Dismiss error"
                >
                  ✕
                </button>
              </p>
            )}
            {note && (
              <p className="success" role="status" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{note}</span>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setNote('')}
                  style={{ padding: '0 6px', fontSize: 13, color: 'inherit', fontWeight: 'bold', cursor: 'pointer' }}
                  aria-label="Dismiss note"
                >
                  ✕
                </button>
              </p>
            )}

            {studio.loading && myJobs.length === 0 ? (
              <p className="muted">Loading assigned projects from Studio OS…</p>
            ) : filteredJobs.length === 0 ? (
              <div className="panel empty">
                <h3>Nothing in this stage</h3>
                <p>
                  {query
                    ? 'No projects match that search.'
                    : stageFilter === 'download_pending'
                    ? 'No projects awaiting download.'
                    : stageFilter === 'in_process'
                    ? 'No projects currently in editing.'
                    : stageFilter === 'changes_needed'
                    ? 'No projects currently have client revision requests.'
                    : stageFilter === 'sent_for_review'
                    ? 'No deliverables currently awaiting client review.'
                    : stageFilter === 'finalized'
                    ? 'No finalized projects yet.'
                    : 'You have no assigned projects right now.'}
                </p>
              </div>
            ) : (
              filteredJobs.map(job => {
                const isUploading = uploadingJobId === job.id;
                const owed = Math.max(0, (Number(job.editorPay) || 0) - (Number(job.editorPaidAmount) || 0));
                const revisions = job.revisions || [];
                const hasRevisions = revisions.length > 0;
                const openRevisions = revisions.filter(r => r.status !== 'resolved');
                const workflowStage = getEditorWorkflowStage(job);
                const scheduleRes = scheduleResults.get(job.id);
                const batches = rawBatches(job);
                const coupleTitle = job.coupleName || (job as any).couple;
                const doubts = job.doubts || [];
                const openDoubts = doubts.filter(d => d.status !== 'resolved');

                return (
                  <article key={job.id} className="panel job-card">
                    <div className="job-head">
                      <div>
                        <div className="job-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {coupleTitle && (
                            <span style={{ color: 'var(--burgundy)', fontWeight: 700 }}>
                              {coupleTitle}
                              <span style={{ margin: '0 4px', opacity: 0.6 }}>·</span>
                            </span>
                          )}
                          <span>{job.title}</span>
                          {job.serviceType && (
                            <span
                              style={{
                                fontSize: 11.5,
                                fontWeight: 600,
                                color: 'var(--burgundy)',
                                background: 'color-mix(in srgb, var(--burgundy) 8%, transparent)',
                                border: '1px solid color-mix(in srgb, var(--burgundy) 20%, transparent)',
                                padding: '2px 8px',
                                borderRadius: 6,
                                letterSpacing: '0.01em'
                              }}
                            >
                              {job.serviceType}
                            </span>
                          )}
                        </div>
                        <div className="sub" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 3 }}>
                          <span className="mono" style={{ fontWeight: 600, color: 'var(--ink)' }}>
                            Job Code: {job.jobCode || job.id.slice(-6).toUpperCase()}
                          </span>
                          {scheduleRes?.calculatedDueDate ? (
                            <span>
                              · due <strong>{scheduleRes.calculatedDueDate}</strong>
                              {scheduleRes.daysRemaining >= 0
                                ? ` (${scheduleRes.daysRemaining}d left)`
                                : ` (Overdue by ${Math.abs(scheduleRes.daysRemaining)}d)`}
                            </span>
                          ) : job.dueDate ? (
                            <span> · due {job.dueDate}</span>
                          ) : null}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                        {workflowStage === 'download_pending' ? (
                          <span className="status-pill warn">
                            {job.rawDataSource === 'hard_drive' ? <HardDrive size={12} /> : <Download size={12} />}
                            {job.rawDataSource === 'hard_drive' ? 'Drive Handover Pending' : 'Download Pending'}
                          </span>
                        ) : workflowStage === 'changes_needed' || scheduleRes?.isChanges ? (
                          <span className="status-pill stop" style={{ background: '#fee2e2', color: '#b91c1c', borderColor: '#fca5a5' }}>
                            <AlertTriangle size={12} />
                            {job.stage === 'internal_changes' ? 'Internal Studio Changes (2d)' : 'Client Changes (2d)'}
                          </span>
                        ) : workflowStage === 'in_process' ? (
                          <span className="status-pill busy">
                            <Play size={12} />
                            In-Process (Queue #{scheduleRes?.queuePosition || 1} of {scheduleRes?.totalInQueue || 1})
                          </span>
                        ) : workflowStage === 'sent_for_review' ? (
                          <span className="status-pill busy">
                            <Clock size={12} />
                            {job.stage === 'internal_review' ? 'Under Internal Review' : 'Sent for Review'}
                          </span>
                        ) : (
                          <span className="status-pill done">
                            <Check size={12} />
                            Finalized
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="stage-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                      <span className="muted" style={{ minWidth: 200, flex: 1 }}>
                        {workflowStage === 'download_pending'
                          ? job.rawDataSource === 'hard_drive'
                            ? 'Physical hard drive handover pending. Confirm receipt or locate folder to begin cutting.'
                            : 'Raw footage awaiting download. Download to local disk to begin cutting.'
                          : workflowStage === 'changes_needed' || scheduleRes?.isChanges
                          ? job.stage === 'internal_changes'
                            ? 'Studio owner requested internal changes. Turnaround is 2 working days.'
                            : 'Client requested revisions. Turnaround is 2 working days.'
                          : workflowStage === 'in_process'
                          ? `Queue position #${scheduleRes?.queuePosition || 1} · Allocated editing: ${scheduleRes?.requiredDays || job.requiredDays || 2} working days.`
                          : workflowStage === 'sent_for_review'
                          ? job.stage === 'internal_review'
                            ? 'Deliverable under review by studio owner before sending to client.'
                            : 'Deliverable submitted to studio. Waiting for client feedback and approval.'
                          : 'Cut finalized and approved. View financial breakdown under the Payments tab.'}
                      </span>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {/* Doubts & Queries Button */}
                        <button
                          onClick={() => setDoubtsJob(job)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            fontSize: 12,
                            fontWeight: 600,
                            padding: '4px 9px',
                            borderRadius: 8,
                            background: openDoubts.length > 0 ? '#fef3c7' : 'var(--panel)',
                            color: openDoubts.length > 0 ? '#92400e' : 'var(--ink)',
                            border: openDoubts.length > 0 ? '1px solid #fde68a' : '1px solid var(--line)',
                            cursor: 'pointer',
                          }}
                        >
                          <HelpCircle size={13} />
                          {doubts.length > 0 ? (
                            <>
                              Queries ({doubts.length})
                              {openDoubts.length > 0 && (
                                <span style={{ fontSize: 10, background: '#d97706', color: '#fff', padding: '1px 5px', borderRadius: 10 }}>
                                  {openDoubts.length} open
                                </span>
                              )}
                            </>
                          ) : (
                            '+ Ask Query'
                          )}
                        </button>

                        {hasRevisions && (
                          <button
                            onClick={() => setChangesJob(job)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              fontSize: 12,
                              fontWeight: 600,
                              padding: '4px 9px',
                              borderRadius: 8,
                              background: (job.stage === 'changes_sent_to_editor' || job.stage === 'internal_changes') ? '#fee2e2' : 'var(--panel)',
                              color: (job.stage === 'changes_sent_to_editor' || job.stage === 'internal_changes') ? '#991b1b' : 'var(--ink)',
                              border: (job.stage === 'changes_sent_to_editor' || job.stage === 'internal_changes') ? '1px solid #fecaca' : '1px solid var(--line)',
                              cursor: 'pointer',
                            }}
                          >
                            <MessageSquarePlus size={13} />
                            {job.stage === 'internal_changes' || openRevisions.some(r => r.revisionType === 'internal' || r.feedbackNotes?.startsWith('[Internal'))
                              ? `Internal Changes (${revisions.length})`
                              : `Client Changes (${revisions.length})`}
                            {openRevisions.length > 0 && (job.stage === 'changes_sent_to_editor' || job.stage === 'internal_changes') && (
                              <span style={{ fontSize: 10, background: '#dc2626', color: '#fff', padding: '1px 5px', borderRadius: 10 }}>
                                Urgent
                              </span>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="job-grid">
                      {/* ------------------------------------------------- Specifications & Brief */}
                      {Boolean(
                        (job as any).outputDurationMinutes ||
                        (job as any).rawPhotoCount ||
                        (job as any).aspectRatio ||
                        (job as any).deliveryFormat ||
                        job.referenceLink ||
                        (job as any).musicPreference ||
                        job.editorPay !== undefined ||
                        job.editingInstructions
                      ) && (
                        <div className="job-cell">
                          <div className="cell-label">Specifications & Brief</div>
                          <div className="cell-value">
                            {/* Technical & Creative Specs */}
                            {((job as any).outputDurationMinutes || (job as any).rawPhotoCount || (job as any).aspectRatio || (job as any).deliveryFormat) ? (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {(job as any).outputDurationMinutes ? (
                                  <span style={{ fontSize: 11, background: 'var(--panel)', border: '1px solid var(--line)', padding: '2px 6px', borderRadius: 4, fontWeight: 500 }}>
                                    ⏱️ {(job as any).outputDurationMinutes} min target
                                  </span>
                                ) : null}
                                {(job as any).rawPhotoCount ? (
                                  <span style={{ fontSize: 11, background: 'var(--panel)', border: '1px solid var(--line)', padding: '2px 6px', borderRadius: 4, fontWeight: 500 }}>
                                    📷 {(job as any).rawPhotoCount} photos
                                  </span>
                                ) : null}
                                {(job as any).aspectRatio ? (
                                  <span style={{ fontSize: 11, background: 'var(--panel)', border: '1px solid var(--line)', padding: '2px 6px', borderRadius: 4, fontWeight: 500 }}>
                                    📐 {(job as any).aspectRatio}
                                  </span>
                                ) : null}
                                {(job as any).deliveryFormat ? (
                                  <span style={{ fontSize: 11, background: 'var(--panel)', border: '1px solid var(--line)', padding: '2px 6px', borderRadius: 4, fontWeight: 500 }}>
                                    📦 {(job as any).deliveryFormat}
                                  </span>
                                ) : null}
                              </div>
                            ) : null}

                            {/* Creative references and music */}
                            {(job.referenceLink || (job as any).musicPreference) && (
                              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11.5 }}>
                                {job.referenceLink && (
                                  <a
                                    href={job.referenceLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: 'var(--burgundy)', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600 }}
                                  >
                                    <Link2 size={12} /> Reference Link
                                  </a>
                                )}
                                {(job as any).musicPreference && (
                                  <span style={{ color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    <Music size={12} /> {(job as any).musicPreference}
                                  </span>
                                )}
                              </div>
                            )}

                            {job.editorPay !== undefined && (
                              <div style={{ marginTop: 6, fontSize: 13 }}>
                                <span style={{ fontWeight: 600 }}>Pay: {formatINR(Number(job.editorPay) || 0)}</span>
                                {owed > 0 ? (
                                  <span style={{ color: 'var(--warn)', fontSize: 12, marginLeft: 6 }}>({formatINR(owed)} due)</span>
                                ) : (
                                  <span style={{ color: '#2f6b34', fontSize: 12, marginLeft: 6 }}>(Paid)</span>
                                )}
                              </div>
                            )}
                            {job.editingInstructions && (
                              <div className="sub" style={{ marginTop: 6, fontSize: 12 }}>
                                <strong>Brief:</strong> {job.editingInstructions}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* ----------------------------------------------- Raw data */}
                      <div className="job-cell">
                        <div className="cell-label">Raw data</div>
                        {job.rawDataLink ? (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                              <Download size={15} style={{ color: 'var(--burgundy)' }} />
                              Raw Footage Available
                              {batches.length > 1 && (
                                <span className="muted" style={{ fontWeight: 500, fontSize: 11.5 }}>
                                  · {batches.length} batches
                                </span>
                              )}
                            </div>
                            {batches.length > 1 ? (
                              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {batches.map(batch => (
                                  <div
                                    key={batch.id}
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 11.5,
                                      padding: '4px 7px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 6 }}
                                  >
                                    <span className="muted">
                                      <strong style={{ color: 'var(--ink)' }}>{batch.label}</strong> · {batch.cloud}
                                      {batch.bytes > 0 ? ` · ${formatBytes(batch.bytes)}` : ''}
                                      {batch.fileCount > 0 ? ` · ${batch.fileCount} files` : ''}
                                    </span>
                                    <span style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                                      <button
                                        className="text-button"
                                        style={{ fontSize: 11, padding: 0 }}
                                        disabled={downloadingJobId === job.id}
                                        onClick={() => void handleStartDownload(job, [batch])}
                                      >
                                        Download
                                      </button>
                                      {/^https?:\/\//.test(batch.link) && (
                                        <button
                                          className="text-button"
                                          style={{ fontSize: 11, padding: 0 }}
                                          onClick={() => copy(batch.id, batch.link)}
                                        >
                                          {copied === batch.id ? (
                                            <><Check size={11} style={{ verticalAlign: -2, marginRight: 3 }} />Copied</>
                                          ) : (
                                            <><Copy size={11} style={{ verticalAlign: -2, marginRight: 3 }} />Copy link</>
                                          )}
                                        </button>
                                      )}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="sub" style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                                Shared cloud package (Google Drive / Cloud)
                              </div>
                            )}

                            {downloadingJobId === job.id ? (
                              <div
                                style={{
                                  marginTop: 8,
                                  padding: '10px 12px',
                                  background: 'var(--panel)',
                                  borderRadius: 8,
                                  border: '1px solid var(--line)',
                                  width: '100%',
                                  maxWidth: '100%',
                                  boxSizing: 'border-box',
                                  overflow: 'hidden'
                                }}
                              >
                                {/* Header: Status and Percent */}
                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: 6,
                                    width: '100%',
                                    boxSizing: 'border-box'
                                  }}
                                >
                                  <span style={{ fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {downloadState.status === 'paused' ? (
                                      <span style={{ color: '#d97706', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700 }}>
                                        <Pause size={13} /> Paused
                                      </span>
                                    ) : downloadBatch ? (
                                      `${downloadBatch.label} (${downloadBatch.index}/${downloadBatch.total})`
                                    ) : (
                                      'Downloading raw footage…'
                                    )}
                                  </span>
                                  <span className="mono" style={{ fontWeight: 700, fontSize: 12.5, flexShrink: 0 }}>
                                    {downloadState.percent}%
                                  </span>
                                </div>

                                {/* Active File Name */}
                                {downloadState.fileName && downloadState.status !== 'paused' && (
                                  <div
                                    style={{
                                      fontSize: 11,
                                      color: 'var(--muted)',
                                      marginBottom: 6,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      width: '100%'
                                    }}
                                    title={downloadState.fileName}
                                  >
                                    {downloadState.fileName}
                                  </div>
                                )}

                                {/* Progress Bar */}
                                <div style={{ width: '100%', height: 6, background: 'var(--line)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                                  <div
                                    style={{
                                      width: `${downloadState.percent}%`,
                                      height: '100%',
                                      background: downloadState.status === 'paused' ? '#f59e0b' : 'var(--blue)',
                                      transition: 'width 0.2s ease'
                                    }}
                                  />
                                </div>

                                {/* Speed, ETA & Data Size Stats */}
                                <div
                                  style={{
                                    fontSize: 11,
                                    color: 'var(--ink)',
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: '3px 6px',
                                    alignItems: 'center',
                                    lineHeight: 1.4,
                                    width: '100%',
                                    boxSizing: 'border-box'
                                  }}
                                >
                                  <span style={{ fontWeight: 600 }}>
                                    {formatBytes(downloadState.downloadedBytes)} {downloadState.totalBytes > 0 ? `/ ${formatBytes(downloadState.totalBytes)}` : ''}
                                  </span>
                                  {downloadState.status !== 'paused' && downloadState.speedBytesPerSec ? (
                                    <span className="muted">· {formatBytes(downloadState.speedBytesPerSec)}/s</span>
                                  ) : null}
                                  {downloadState.status !== 'paused' && downloadState.estimatedRemainingSec ? (
                                    <span className="muted">· {formatETA(downloadState.estimatedRemainingSec)}</span>
                                  ) : null}
                                </div>

                                {/* Destination Path */}
                                {downloadDestDir && (
                                  <div
                                    style={{
                                      fontSize: 10.5,
                                      color: 'var(--muted)',
                                      marginTop: 5,
                                      fontFamily: 'monospace',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      width: '100%',
                                      boxSizing: 'border-box'
                                    }}
                                    title={downloadDestDir}
                                  >
                                    Destination: {downloadDestDir}
                                  </div>
                                )}

                                {/* Action Buttons Toolbar */}
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 8,
                                    marginTop: 8,
                                    paddingTop: 8,
                                    borderTop: '1px solid var(--line)',
                                    width: '100%',
                                    boxSizing: 'border-box'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    {downloadState.status === 'paused' ? (
                                      <>
                                        <button
                                          className="primary"
                                          style={{ padding: '3px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                          onClick={() => void handleResumeDownload(job, batches)}
                                        >
                                          <Play size={11} /> Resume
                                        </button>
                                        <button
                                          style={{ padding: '3px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                          onClick={() => void handleChangeDestination(job, batches)}
                                        >
                                          <FolderOpen size={11} /> Change Dest
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        style={{ padding: '3px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                        onClick={() => void handlePauseDownload(job.id)}
                                      >
                                        <Pause size={11} /> Pause
                                      </button>
                                    )}
                                    {(error?.toLowerCase().includes('quota') || downloadState.error?.toLowerCase().includes('quota')) && (
                                      <button
                                        type="button"
                                        className="primary"
                                        style={{
                                          padding: '3px 8px',
                                          fontSize: 11,
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 4,
                                          backgroundColor: '#b45309'
                                        }}
                                        onClick={() => setQuotaModalJob(job)}
                                      >
                                        <AlertTriangle size={11} /> Quota Solutions
                                      </button>
                                    )}
                                  </div>
                                  <button
                                    className="text-button"
                                    style={{ color: 'var(--warn)', padding: 0, fontSize: 11 }}
                                    onClick={() => void handleCancelDownload(job.id)}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : job.downloadedAt ? (
                              <div style={{ marginTop: 6, fontSize: 12 }}>
                                <span style={{ color: 'var(--accent, #3b82f6)', fontWeight: 500 }}>
                                  ✓ Raw data downloaded on {new Date(job.downloadedAt).toLocaleDateString()}
                                </span>
                                <div style={{ marginTop: 6, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                  <button
                                    className="text-button"
                                    style={{ fontSize: 11, padding: 0 }}
                                    onClick={() => void handleOpenDownloadedFolder(job.id)}
                                  >
                                    <FolderOpen size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Open Folder
                                  </button>
                                  {(() => {
                                    const primaryLink = batches[0]?.link || job.rawDataLink || '';
                                    const isHttp = /^https?:\/\//.test(primaryLink);
                                    return (
                                      <>
                                        {isHttp && (
                                          <>
                                            <button
                                              className="text-button"
                                              style={{ fontSize: 11, padding: 0 }}
                                              onClick={() => void copy(`${job.id}:done`, primaryLink)}
                                            >
                                              {copied === `${job.id}:done` ? (
                                                <><Check size={12} style={{ verticalAlign: -2, marginRight: 4, color: '#2f6b34' }} />Copied</>
                                              ) : (
                                                <><Copy size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Copy link</>
                                              )}
                                            </button>
                                            <button
                                              className="text-button"
                                              style={{ fontSize: 11, padding: 0, color: 'var(--burgundy)' }}
                                              onClick={() => void window.api.openExternal(primaryLink)}
                                              title="Open raw footage in browser"
                                            >
                                              <ExternalLink size={12} style={{ verticalAlign: -2, marginRight: 3 }} />Open in browser
                                            </button>
                                          </>
                                        )}
                                        {batches.length > 1 && (
                                          <button
                                            className="text-button"
                                            style={{ fontSize: 11, padding: 0 }}
                                            onClick={() => void copy(`${job.id}:all_batches`, batches.map(b => b.link).join('\n'))}
                                          >
                                            {copied === `${job.id}:all_batches` ? (
                                              <><Check size={12} style={{ verticalAlign: -2, marginRight: 4, color: '#2f6b34' }} />Copied All</>
                                            ) : (
                                              <><Copy size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Copy all links ({batches.length})</>
                                            )}
                                          </button>
                                        )}
                                      </>
                                    );
                                  })()}
                                  <button
                                    className="text-button"
                                    style={{ fontSize: 11, padding: 0 }}
                                    onClick={() => void handleLocateDownloadedFolder(job)}
                                  >
                                    Locate Folder
                                  </button>
                                  <button
                                    className="text-button"
                                    style={{ fontSize: 11, padding: 0 }}
                                    onClick={() => void handleStartDownload(job, batches)}
                                  >
                                    {batches.length > 1 ? 'Re-download all batches' : 'Re-download footage'}
                                  </button>
                                  <button
                                    className="text-button"
                                    style={{ fontSize: 11, padding: 0, color: 'var(--warn)' }}
                                    onClick={() => void handleResetDownloaded(job.id)}
                                  >
                                    Reset to Download Pending
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <button
                                  className="primary"
                                  disabled={busy === `${job.id}:locate`}
                                  onClick={() => void handleStartDownload(job, batches)}
                                  style={{ width: '100%', justifyContent: 'center', padding: '9px 12px', fontSize: 12.5 }}
                                >
                                  <Download size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
                                  {batches.length > 1 ? `Download all ${batches.length} batches` : 'Download Raw Footage'}
                                </button>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingTop: 2 }}>
                                  {job.rawDataLink.startsWith('http://') || job.rawDataLink.startsWith('https://') ? (
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                      <button
                                        className="text-button"
                                        style={{ fontSize: 11.5, padding: 0, color: 'var(--burgundy)', fontWeight: 500 }}
                                        onClick={() => void window.api.openExternal(job.rawDataLink!)}
                                      >
                                        <ExternalLink size={12} style={{ verticalAlign: -2, marginRight: 3 }} />Open in browser
                                      </button>
                                      <span style={{ color: 'var(--line)' }}>•</span>
                                      <button
                                        className="text-button"
                                        style={{ fontSize: 11.5, padding: 0 }}
                                        onClick={() => copy(`${job.id}:link`, job.rawDataLink!)}
                                      >
                                        {copied === `${job.id}:link` ? (
                                          <><Check size={12} style={{ verticalAlign: -2, marginRight: 3, color: '#2f6b34' }} />Copied</>
                                        ) : (
                                          <><Copy size={12} style={{ verticalAlign: -2, marginRight: 3 }} />Copy link</>
                                        )}
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="muted" style={{ fontSize: 11 }}>
                                      Due date runs continuously.
                                    </span>
                                  )}
                                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <button
                                      className="text-button"
                                      disabled={busy === `${job.id}:locate`}
                                      style={{ fontSize: 11.5, padding: 0 }}
                                      onClick={() => void handleLocateDownloadedFolder(job)}
                                    >
                                      <FolderOpen size={12} style={{ verticalAlign: -2, marginRight: 3 }} />
                                      {busy === `${job.id}:locate` ? 'Scanning…' : 'Locate folder on disk'}
                                    </button>
                                    <span style={{ color: 'var(--line)' }}>•</span>
                                    <button
                                      className="text-button"
                                      style={{ fontSize: 11.5, padding: 0, color: '#2563eb', fontWeight: 600 }}
                                      onClick={async () => {
                                        try {
                                          await markJobDownloaded(job.id);
                                          setNote(`✓ Marked as downloaded for "${job.title}". Job moved to In-Process.`);
                                        } catch (err: any) {
                                          setError(err?.message || 'Failed to mark as downloaded.');
                                        }
                                      }}
                                    >
                                      <Check size={12} style={{ verticalAlign: -2, marginRight: 3 }} />Mark Downloaded
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </>
                        ) : job.rawDataSource === 'hard_drive' ? (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                              <HardDrive size={15} style={{ color: 'var(--burgundy)' }} />
                              Physical Hard Drive Handover
                            </div>
                            <div className="sub" style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                              {job.hardDriveNotes ? `Drive: ${job.hardDriveNotes}` : 'Physical drive provided by studio (In-House / Local)'}
                            </div>
                            {(job.rawDurationHours || job.rawDurationMinutes || job.rawPhotoCount) ? (
                              <div className="sub" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                                {job.serviceType === 'Long Form'
                                  ? `${job.rawDurationHours || 0}h ${job.rawDurationMinutes || 0}m raw video logged`
                                  : (job.serviceType === 'Edited Photos' || job.serviceType === 'Album')
                                  ? `${job.rawPhotoCount || 0} photos logged`
                                  : ''}
                              </div>
                            ) : null}

                            {job.downloadedAt ? (
                              <div style={{ marginTop: 6, fontSize: 12 }}>
                                <span style={{ color: 'var(--accent, #3b82f6)', fontWeight: 500 }}>
                                  ✓ Hard drive received on {new Date(job.downloadedAt).toLocaleDateString()}
                                </span>
                                <div style={{ marginTop: 6, display: 'flex', gap: 10 }}>
                                  <button
                                    className="text-button"
                                    style={{ fontSize: 11, padding: 0 }}
                                    onClick={() => void handleOpenDownloadedFolder(job.id)}
                                  >
                                    <FolderOpen size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Open Folder
                                  </button>
                                  <button
                                    className="text-button"
                                    style={{ fontSize: 11, padding: 0 }}
                                    onClick={() => void handleLocateDownloadedFolder(job)}
                                  >
                                    Locate Folder
                                  </button>
                                  <button
                                    className="text-button"
                                    style={{ fontSize: 11, padding: 0, color: 'var(--warn)' }}
                                    onClick={() => void handleResetDownloaded(job.id)}
                                  >
                                    Reset Status
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <button
                                  className="primary"
                                  disabled={busy === `${job.id}:hard_drive`}
                                  onClick={() => void handleConfirmHardDriveReceived(job)}
                                  style={{ width: '100%', justifyContent: 'center' }}
                                >
                                  <HardDrive size={13} style={{ verticalAlign: -2, marginRight: 5 }} />
                                  Confirm Hard Drive Received
                                </button>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span className="muted" style={{ fontSize: 11 }}>
                                    Plug in drive to start cutting.
                                  </span>
                                  <button
                                    className="text-button"
                                    disabled={busy === `${job.id}:locate`}
                                    style={{ fontSize: 11, padding: 0 }}
                                    onClick={() => void handleLocateDownloadedFolder(job)}
                                  >
                                    {busy === `${job.id}:locate` ? 'Scanning…' : 'Locate folder on disk'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="cell-value muted">
                            Awaiting raw footage upload from studio.
                          </div>
                        )}
                      </div>

                      {/* ----------------------------------------- Stage 3: Final delivery */}
                      {workflowStage !== 'download_pending' && (
                        <div className="job-cell">
                          <div className="cell-label">Final delivery</div>
                          {isUploading ? (
                          <>
                            <div className="bar">
                              <span style={{ width: `${uploadState.percent}%` }} />
                            </div>
                            <div className="cell-value muted" style={{ marginTop: 6, fontSize: 12 }}>
                              Uploading to Studio Dropbox: {uploadState.fileName} ({uploadState.percent}%)
                            </div>
                            <span className="muted" style={{ fontSize: 11 }}>
                              {formatBytes(uploadState.uploadedBytes)} of {formatBytes(uploadState.totalBytes)}
                            </span>
                          </>
                        ) : job.deliveryLink ? (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#2f6b34' }}>
                              <CheckCircle2 size={15} />
                              Deliverable Submitted
                            </div>
                            <div className="sub" style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2, wordBreak: 'break-all' }}>
                              {job.deliveryLink.includes('dropbox.com') ? 'Saved directly in Studio Dropbox' : 'Review link shared with studio'}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                              <a
                                href={job.deliveryLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ fontSize: 11.5, color: 'var(--burgundy)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}
                              >
                                <ExternalLink size={12} /> Open Submitted Work
                              </a>
                              <button
                                className="text-button"
                                style={{ fontSize: 11, padding: 0 }}
                                onClick={() => copy(`${job.id}:delivery`, job.deliveryLink!)}
                              >
                                {copied === `${job.id}:delivery` ? (
                                  <><Check size={11} style={{ verticalAlign: -2, marginRight: 2 }} />Copied</>
                                ) : (
                                  <><Copy size={11} style={{ verticalAlign: -2, marginRight: 2 }} />Copy</>
                                )}
                              </button>
                            </div>
                            {workflowStage !== 'finalized' && (
                              <div className="link-row" style={{ marginTop: 8 }}>
                                <button
                                  className="primary"
                                  disabled={busy === `${job.id}:upload`}
                                  onClick={() => {
                                    setDeliverModalJob(job);
                                    setDeliverUrl(job.deliveryLink || '');
                                  }}
                                >
                                  <Upload size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Update / Replace Deliverable
                                </button>
                              </div>
                            )}
                            <span className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                              {workflowStage === 'finalized'
                                ? 'Finalized work approved. Reflects in Payments.'
                                : 'Work submitted to studio. You can update or replace the delivery link anytime.'}
                            </span>
                          </>
                        ) : (
                          <>
                            <div className="cell-value muted" style={{ fontSize: 12 }}>
                              Upload your export to Studio Dropbox or submit a Google Drive / Vimeo / Frame.io review link.
                            </div>
                            <div className="link-row" style={{ marginTop: 8 }}>
                              <button
                                className="primary"
                                disabled={busy === `${job.id}:upload`}
                                onClick={() => {
                                  setDeliverModalJob(job);
                                  setDeliverUrl('');
                                }}
                              >
                                <Upload size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Submit Deliverable
                              </button>
                            </div>
                            <span className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                              Direct Dropbox upload or external cloud review link.
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </article>
                );
              })
            )}
          </div>
        ) : view === 'payments' ? (
          <EditorPaymentsScreen jobs={myJobs} />
        ) : null}

        {/* Deliverable Submission Modal */}
        {deliverModalJob && (
          <div className="modal-shade">
            <section className="work-modal" style={{ width: 'min(640px, 100%)' }} role="dialog" aria-modal="true" aria-labelledby="deliver-modal-title">
              <header>
                <div>
                  <span className="eyebrow">SUBMIT DELIVERABLE</span>
                  <h2 id="deliver-modal-title">Hand in Finished Work</h2>
                  <p className="sub" style={{ marginTop: 2 }}>
                    {deliverModalJob.coupleName || (deliverModalJob as any).couple ? `${deliverModalJob.coupleName || (deliverModalJob as any).couple} · ` : ''}{deliverModalJob.title}
                  </p>
                </div>
                <button className="icon-button" aria-label="Close" onClick={() => setDeliverModalJob(null)}>
                  <X size={20} />
                </button>
              </header>

              <div style={{ display: 'flex', gap: 8, margin: '14px 0', borderBottom: '1px solid var(--line)', paddingBottom: 10 }}>
                <button
                  type="button"
                  onClick={() => setDeliverMode('link')}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    background: deliverMode === 'link' ? 'var(--burgundy)' : 'var(--panel)',
                    color: deliverMode === 'link' ? '#fff' : 'var(--ink)',
                    border: '1px solid var(--line)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <LinkIcon size={14} />
                  <span>Submit Cloud / Share Link</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeliverMode('dropbox')}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    background: deliverMode === 'dropbox' ? 'var(--burgundy)' : 'var(--panel)',
                    color: deliverMode === 'dropbox' ? '#fff' : 'var(--ink)',
                    border: '1px solid var(--line)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Upload size={14} />
                  <span>Direct Dropbox Upload</span>
                </button>
              </div>

              {deliverMode === 'link' ? (
                <form onSubmit={handleDeliverViaLink} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>
                      Deliverable Review / Download Link *
                    </label>
                    <input
                      type="url"
                      required
                      value={deliverUrl}
                      onChange={e => setDeliverUrl(e.target.value)}
                      placeholder="https://drive.google.com/... or Vimeo, Frame.io, Dropbox, WeTransfer"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        fontSize: 13,
                        borderRadius: 8,
                        background: 'var(--paper)',
                        border: '1px solid var(--line)',
                        color: 'var(--ink)',
                      }}
                    />
                    <p className="muted" style={{ margin: '4px 0 0', fontSize: 11.5 }}>
                      Ensure share permissions are set to "Anyone with the link can view" so the studio and client can preview.
                    </p>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>
                      Version Label / Cut Description
                    </label>
                    <input
                      type="text"
                      value={deliverVersionNote}
                      onChange={e => setDeliverVersionNote(e.target.value)}
                      placeholder="e.g. V1 Draft Review Cut, V2 Client Changes Applied, 4K Master"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        fontSize: 13,
                        borderRadius: 8,
                        background: 'var(--paper)',
                        border: '1px solid var(--line)',
                        color: 'var(--ink)',
                      }}
                    />
                  </div>

                  {/* If the job has revisions, link this delivery to the revision round */}
                  {(deliverModalJob.revisions || []).length > 0 && (
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>
                        Applying to Revision Round
                      </label>
                      <select
                        value={deliverRevisionId || ''}
                        onChange={e => setDeliverRevisionId(e.target.value || null)}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          fontSize: 13,
                          borderRadius: 8,
                          background: 'var(--paper)',
                          border: '1px solid var(--line)',
                          color: 'var(--ink)',
                        }}
                      >
                        <option value="">-- General Draft / Cut --</option>
                        {(deliverModalJob.revisions || []).map(r => (
                          <option key={r.id} value={r.id}>
                            Round {r.roundNumber} ({r.receivedDate}) {r.status === 'resolved' ? '(Resolved)' : '(Open Changes)'}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="actions" style={{ marginTop: 12 }}>
                    <button type="button" onClick={() => setDeliverModalJob(null)}>Cancel</button>
                    <button type="submit" className="primary" disabled={deliverSubmitting || !deliverUrl.trim()}>
                      {deliverSubmitting ? 'Saving…' : 'Submit for Studio Review'}
                    </button>
                  </div>
                </form>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
                    Pick an export file from your Mac (MP4, MOV, ZIP). It will be streamed directly in chunks into the studio's cloud Dropbox account.
                  </p>
                  <div>
                    <button
                      className="primary"
                      disabled={uploadingJobId === deliverModalJob.id}
                      onClick={() => void handleChooseAndUpload(deliverModalJob)}
                      style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
                    >
                      <Upload size={15} style={{ verticalAlign: -2, marginRight: 6 }} />
                      Choose File & Upload to Studio Dropbox
                    </button>
                  </div>
                  {uploadingJobId === deliverModalJob.id && (
                    <div style={{ padding: 12, background: 'var(--panel)', borderRadius: 8, border: '1px solid var(--line)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ fontWeight: 600 }}>{uploadState.fileName}</span>
                        <span className="mono" style={{ fontWeight: 600 }}>{uploadState.percent}%</span>
                      </div>
                      <div className="bar">
                        <span style={{ width: `${uploadState.percent}%` }} />
                      </div>
                      <span className="muted" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                        {formatBytes(uploadState.uploadedBytes)} of {formatBytes(uploadState.totalBytes)}
                      </span>
                    </div>
                  )}
                  <div className="actions" style={{ marginTop: 6 }}>
                    <button type="button" onClick={() => setDeliverModalJob(null)}>Close</button>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {/* Changes Modal */}
        {changesJob && (
          <div className="modal-shade">
            <section className="work-modal" style={{ width: 'min(720px, 100%)' }} role="dialog" aria-modal="true" aria-labelledby="changes-title">
              <header>
                <div>
                  <span className="eyebrow">
                    {changesJob.stage === 'internal_changes' || (changesJob.revisions || []).some(r => r.revisionType === 'internal' || r.feedbackNotes?.startsWith('[Internal'))
                      ? 'INTERNAL STUDIO REVIEW'
                      : 'CLIENT FEEDBACK'}
                  </span>
                  <h2 id="changes-title">
                    {changesJob.stage === 'internal_changes' || (changesJob.revisions || []).some(r => r.revisionType === 'internal' || r.feedbackNotes?.startsWith('[Internal'))
                      ? 'Internal Changes Requested'
                      : 'Changes requested'}
                  </h2>
                  <p className="sub" style={{ marginTop: 2 }}>
                    {changesJob.coupleName || (changesJob as any).couple ? `${changesJob.coupleName || (changesJob as any).couple} · ` : ''}{changesJob.title}
                  </p>
                </div>
                <button className="icon-button" aria-label="Close" onClick={() => setChangesJob(null)}>
                  <X size={20} />
                </button>
              </header>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '16px 0', maxHeight: '55vh', overflowY: 'auto' }}>
                {(changesJob.revisions || []).map((rev, idx) => {
                  const isOpen = rev.status !== 'resolved';
                  const feedbackVal = revisionFeedbackMap[rev.id] !== undefined ? revisionFeedbackMap[rev.id] : (rev.editorNotes || '');
                  const isInternalRev = rev.revisionType === 'internal' || rev.feedbackNotes?.startsWith('[Internal');

                  return (
                    <div
                      key={rev.id || idx}
                      style={{
                        padding: '14px',
                        borderRadius: '10px',
                        background: isOpen ? 'color-mix(in srgb, var(--burgundy) 6%, var(--paper))' : 'var(--paper)',
                        border: `1px solid ${isOpen ? 'color-mix(in srgb, var(--burgundy) 30%, transparent)' : 'color-mix(in srgb, var(--line) 30%, transparent)'}`
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: 13 }}>Round {rev.roundNumber}</span>
                          <span
                            style={{
                              fontSize: 11,
                              padding: '1px 6px',
                              borderRadius: 4,
                              fontWeight: 600,
                              background: isInternalRev ? '#f3e8ff' : '#eff6ff',
                              color: isInternalRev ? '#7e22ce' : '#1d4ed8',
                            }}
                          >
                            {isInternalRev ? 'Internal Studio Review' : 'Client Feedback'}
                          </span>
                        </div>
                        <span className="muted" style={{ fontSize: 12 }}>{rev.receivedDate}</span>
                      </div>

                      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{rev.feedbackNotes}</p>
                      
                      {rev.timecodes && (
                        <p className="sub" style={{ marginTop: 6, fontSize: 12, color: 'var(--burgundy)', fontWeight: 600 }}>
                          Timecodes: {rev.timecodes}
                        </p>
                      )}

                      {/* Editor Response section */}
                      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid color-mix(in srgb, var(--line) 40%, transparent)' }}>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: 4 }}>
                          Your Response & Changes Applied
                        </label>
                        <textarea
                          rows={2}
                          value={feedbackVal}
                          onChange={e => setRevisionFeedbackMap({ ...revisionFeedbackMap, [rev.id]: e.target.value })}
                          placeholder="e.g. 'Updated timecode 02:15 as requested, replaced music track at outro.'"
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            fontSize: 12.5,
                            borderRadius: 6,
                            background: 'var(--panel)',
                            border: '1px solid var(--line)',
                            color: 'var(--ink)',
                            fontFamily: 'inherit',
                            resize: 'vertical',
                          }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 6 }}>
                          <button
                            type="button"
                            className="text-button"
                            style={{ fontSize: 11.5, fontWeight: 600 }}
                            disabled={savingRevisionId === rev.id || !feedbackVal.trim()}
                            onClick={async () => {
                              setSavingRevisionId(rev.id);
                              try {
                                await submitEditorRevisionFeedback(changesJob.id, rev.id, feedbackVal.trim(), studio.currentUser.name);
                                setNote('✓ Notes saved for revision round ' + rev.roundNumber);
                              } catch (err: any) {
                                setError(err?.message || 'Failed to save notes.');
                              } finally {
                                setSavingRevisionId(null);
                              }
                            }}
                          >
                            {savingRevisionId === rev.id ? 'Saving…' : 'Save Notes'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="actions" style={{ justifyContent: 'space-between' }}>
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    const targetJob = changesJob;
                    setChangesJob(null);
                    setDeliverModalJob(targetJob);
                    setDeliverUrl(targetJob.deliveryLink || '');
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Upload size={14} />
                  <span>Submit Revision Deliverable</span>
                </button>
                <button onClick={() => setChangesJob(null)}>Close</button>
              </div>
            </section>
          </div>
        )}

        {/* Doubts Modal */}
        {doubtsJob && (
          <EditorDoubtsModal
            job={doubtsJob}
            editorName={studio.currentUser.name}
            onClose={() => setDoubtsJob(null)}
          />
        )}

        {/* Leaves / Off Days Modal */}
        {showLeaveModal && currentMember && (
          <LeaveCalendarModal
            member={currentMember}
            onClose={() => setShowLeaveModal(false)}
            onSaved={() => {
              setNote('Off-day schedule updated. Dynamic due dates recalculated.');
            }}
          />
        )}

        {/* On-Time Delivery Report Modal */}
        {showReportModal && (
          <OnTimeReportModal
            report={onTimeReport}
            editorName={studio.currentUser.name}
            onClose={() => setShowReportModal(false)}
          />
        )}

        {/* Google Drive Connection Modal */}
        <GoogleDriveRequiredModal
          isOpen={showDriveModal}
          onClose={() => {
            setShowDriveModal(false);
            setPendingDownloadAction(null);
          }}
          onConnected={async () => {
            await refreshDrive();
            if (pendingDownloadAction) {
              const act = pendingDownloadAction;
              setPendingDownloadAction(null);
              act();
            }
          }}
          actionTitle="Google Account Required for Downloads"
          actionDescription="To download project raw footage directly from the Baawaray Films Shared Drive, please connect your Google account. Zero personal Drive storage is used."
        />

        {/* Google Drive Quota Exceeded Modal */}
        <GoogleDriveQuotaModal
          isOpen={!!quotaModalJob}
          job={quotaModalJob}
          downloadedBytes={downloadState.downloadedBytes}
          totalBytes={downloadState.totalBytes}
          onClose={() => setQuotaModalJob(null)}
          onOpenBrowser={() => {
            if (quotaModalJob?.rawDataLink) {
              void window.api.openExternal(quotaModalJob.rawDataLink);
            }
          }}
          onLocateFolder={() => {
            if (quotaModalJob) {
              const j = quotaModalJob;
              setQuotaModalJob(null);
              void handleLocateDownloadedFolder(j);
            }
          }}
          onResume={() => {
            if (quotaModalJob) {
              const j = quotaModalJob;
              setQuotaModalJob(null);
              void handleResumeDownload(j, rawBatches(j));
            }
          }}
        />
      </main>
    </div>
  );
}
