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
  Upload,
  X
} from 'lucide-react';
import longLogo from '../assets/baawaray-long.svg';
import { EditorPaymentsScreen } from './screens/EditorPaymentsScreen';
import { LeaveCalendarModal } from './LeaveCalendarModal';
import { OnTimeReportModal } from './OnTimeReportModal';
import { formatINR, getFreelanceStageMeta } from '../utils/formatters';
import type { FreelanceJobStage } from '../types/freelance';
import { formatBytes } from '../utils/uploadFormat';
import { batchFolder, rawBatches, type RawBatch } from '../utils/rawBatches';
import { submitEditorDelivery, markJobDownloaded, resetJobDownloaded } from '../lib/studioRepository';
import {
  calculateDynamicDueDates,
  calculateOnTimeReport,
  getEditorWorkflowStage,
  type EditorWorkflowStage
} from '../utils/dynamicScheduling';
import type { FreelanceJob, TeamMember } from '../types';

type View = 'work' | 'payments';
type StageFilter = 'all' | EditorWorkflowStage;

const STAGE_TONE: Record<string, string> = {
  pending_assignment: 'idle',
  data_received: 'warn',
  sent_to_editor: 'busy',
  draft_received: 'busy',
  sent_to_client: 'busy',
  changes_received: 'stop',
  changes_sent_to_editor: 'warn',
  final_delivered: 'done',
  completed: 'done',
};

export function EditorDashboard(): React.JSX.Element {
  const studio = useApp();
  const [view, setView] = useState<View>('work');
  const [stageFilter, setStageFilter] = useState<StageFilter>('in_process');
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [changesJob, setChangesJob] = useState<FreelanceJob | null>(null);
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
  const [downloadState, setDownloadState] = useState<{
    percent: number;
    fileName: string;
    downloadedBytes: number;
    totalBytes: number;
    status: 'downloading' | 'completed' | 'error';
    error?: string;
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
  useEffect(() => {
    return window.api.onDownloadProgress(data => {
      if (downloadingJobId === data.jobId) {
        setDownloadState({
          percent: data.percent,
          fileName: data.fileName || '',
          downloadedBytes: data.downloadedBytes,
          totalBytes: data.totalBytes,
          status: data.status,
          error: data.error
        });
      }
    });
  }, [downloadingJobId]);

  const myJobs = studio.freelanceJobs;

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

  // Stage counts for navigation pills
  const stageCounts = useMemo(() => {
    let downloadPending = 0;
    let inProcess = 0;
    let sentForReview = 0;
    let finalized = 0;

    for (const job of myJobs) {
      const st = getEditorWorkflowStage(job);
      if (st === 'download_pending') downloadPending++;
      else if (st === 'in_process') inProcess++;
      else if (st === 'sent_for_review') sentForReview++;
      else if (st === 'finalized') finalized++;
    }
    return { downloadPending, inProcess, sentForReview, finalized, all: myJobs.length };
  }, [myJobs]);

  const filteredJobs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let jobs = myJobs;

    if (stageFilter !== 'all') {
      jobs = jobs.filter(job => getEditorWorkflowStage(job) === stageFilter);
    }

    if (!needle) return jobs;
    return jobs.filter(job =>
      `${job.title} ${job.serviceType || ''} ${job.jobCode || ''}`.toLowerCase().includes(needle)
    );
  }, [myJobs, stageFilter, query]);

  function copy(key: string, value: string): void {
    void navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(''), 2200);
  }

  /** Warns before filling a disk, and returns whether the editor still wants to go on. */
  async function diskSpaceAllows(destDir: string, expectedBytes: number): Promise<boolean> {
    try {
      const disk = await window.api.checkDiskSpace(destDir);
      if (expectedBytes > 0) {
        const safetyHeadroom = 1024 * 1024 * 1024; // 1 GB working headroom
        if (disk.freeBytes < expectedBytes + safetyHeadroom) {
          return window.confirm(
            `\u26a0\ufe0f Low Disk Space Warning!\n\n` +
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
          `\u26a0\ufe0f Low Disk Space Warning!\n\n` +
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
   *
   * Each batch lands in its own subfolder when there is more than one, because
   * two batches of the same shoot routinely contain the same camera filenames
   * and would otherwise overwrite each other. The job only advances to
   * In-Process once the editor holds every batch, not merely the first.
   */
  async function handleStartDownload(job: FreelanceJob, batches?: RawBatch[]): Promise<void> {
    const all = rawBatches(job);
    const list = batches?.length ? batches : all;
    if (!list.length) return;
    setError('');
    setNote('');

    const destDir = await window.api.chooseDownloadDirectory();
    if (!destDir) return; // User canceled dialog

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
    if (!(await diskSpaceAllows(destDir, expectedBytes))) return;

    const multi = list.length > 1;
    cancelBatches.current = false;
    setDownloadingJobId(job.id);
    setDownloadState({
      percent: 0,
      fileName: 'Connecting\u2026',
      downloadedBytes: 0,
      totalBytes: 0,
      status: 'downloading'
    });

    try {
      for (const [index, batch] of list.entries()) {
        if (cancelBatches.current) return;
        setDownloadBatch(multi ? { index: index + 1, total: list.length, label: `${batch.label} \u00b7 ${batch.cloud}` } : null);
        await window.api.downloadRawData(job.id, batch.link, multi ? `${destDir}/${batchFolder(batch)}` : destDir);
      }
      if (cancelBatches.current) return;
      // Open Folder should land on the folder holding every batch, not the last one.
      if (multi) await window.api.verifyLocalFolder(job.id, destDir).catch(() => {});
      if (list.length === all.length) {
        // Automatically advance to in_process once the whole job is on disk.
        await markJobDownloaded(job.id);
        setNote(`\u2713 Raw data download complete for "${job.title}"${multi ? ` (${list.length} batches)` : ''}. Job moved to In-Process.`);
      } else {
        const left = all.length - list.length;
        setNote(`\u2713 ${list.map(b => b.label).join(', ')} downloaded. ${left} more ${left === 1 ? 'batch' : 'batches'} still to fetch before this job starts.`);
      }
    } catch (err: any) {
      if (err?.message !== 'Download cancelled.') {
        setError(err?.message || 'Failed to download raw data.');
      }
    } finally {
      setDownloadingJobId(null);
      setDownloadBatch(null);
    }
  }

  async function handleCancelDownload(jobId: string): Promise<void> {
    cancelBatches.current = true;
    await window.api.cancelDownload(jobId);
    setDownloadingJobId(null);
    setDownloadBatch(null);
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

  async function handleChooseAndUpload(job: FreelanceJob): Promise<void> {
    setError('');
    setNote('');

    // Step 1: Open native OS file picker. If user cancels, return immediately without uploading!
    const file = await window.api.chooseDeliverableFile();
    if (!file) return;

    // Step 2: Verify Dropbox connection
    let dbxStatus = await window.api.dropboxStatus();
    if (!dbxStatus.connected && studio.studioSettings?.dropbox?.refreshToken) {
      dbxStatus = await window.api.connectDropbox(studio.studioSettings.dropbox);
    }

    if (!dbxStatus.connected) {
      setError('Studio Dropbox is not connected yet. Please ask the studio owner to connect Dropbox in Settings.');
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
      await submitEditorDelivery(job.id, deliveryUrl, true);
      setNote('Deliverable uploaded to Studio Dropbox and submitted for review!');
    } catch (err: any) {
      setError(err?.message || 'Upload to Studio Dropbox failed.');
    } finally {
      setUploadingJobId(null);
    }
  }

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="wordmark"><img src={longLogo} alt="Baawaray" /></div>
        <div className="who">{studio.currentUser.name} (Editor)</div>

        <button className="nav-item" aria-current={view === 'work' && stageFilter === 'download_pending'} onClick={() => { setView('work'); setStageFilter('download_pending'); }}>
          <Download size={16} /> Download
          {stageCounts.downloadPending > 0 && <span className="count">{stageCounts.downloadPending}</span>}
        </button>
        <button className="nav-item" aria-current={view === 'work' && stageFilter === 'in_process'} onClick={() => { setView('work'); setStageFilter('in_process'); }}>
          <Play size={16} /> In Process
          {stageCounts.inProcess > 0 && <span className="count">{stageCounts.inProcess}</span>}
        </button>
        <button className="nav-item" aria-current={view === 'work' && stageFilter === 'sent_for_review'} onClick={() => { setView('work'); setStageFilter('sent_for_review'); }}>
          <Clock size={16} /> Sent for Review
          {stageCounts.sentForReview > 0 && <span className="count">{stageCounts.sentForReview}</span>}
        </button>
        <button className="nav-item" aria-current={view === 'work' && stageFilter === 'finalized'} onClick={() => { setView('work'); setStageFilter('finalized'); }}>
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
        <button className="nav-item" aria-current={view === 'payments'} onClick={() => setView('payments')}>
          <IndianRupee size={16} /> Payments
          {stageCounts.finalized > 0 && <span className="count">{stageCounts.finalized}</span>}
        </button>

        <div className="spacer" />
        <button className="nav-item" onClick={() => { void signOut(auth); }}>
          <LogOut size={16} /> Sign out
        </button>
      </nav>

      <main className="main-area">
        {view === 'work' ? (
          <div className="screen">
            <header>
              <div>
                <span className="eyebrow">ASSIGNED WORKFLOW</span>
                <h2>My assigned projects</h2>
                <p>Download footage, follow your editing queue, and submit deliverables for review.</p>
              </div>
              <div className="actions" style={{ margin: 0 }}>
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search projects…"
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

            {studio.error && <p className="error" role="alert">{studio.error}</p>}
            {error && <p className="error" role="alert">{error}</p>}
            {note && <p className="success" role="status">{note}</p>}

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
                const workflowStage = getEditorWorkflowStage(job);
                const scheduleRes = scheduleResults.get(job.id);
                const batches = rawBatches(job);

                return (
                  <article key={job.id} className="panel job-card">
                    <div className="job-head">
                      <div>
                        <div className="job-title">{job.title}</div>
                        <div className="sub">
                          {job.serviceType || 'Editing'}
                          {scheduleRes?.calculatedDueDate ? (
                            <span style={{ marginLeft: 6 }}>
                              · due <strong>{scheduleRes.calculatedDueDate}</strong>
                              {scheduleRes.daysRemaining >= 0
                                ? ` (${scheduleRes.daysRemaining}d left)`
                                : ` (Overdue by ${Math.abs(scheduleRes.daysRemaining)}d)`}
                            </span>
                          ) : job.dueDate ? (
                            <span style={{ marginLeft: 6 }}> · due {job.dueDate}</span>
                          ) : null}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                        {workflowStage === 'download_pending' ? (
                          <span className="status-pill warn">
                            {job.rawDataSource === 'hard_drive' ? <HardDrive size={12} /> : <Download size={12} />}
                            {job.rawDataSource === 'hard_drive' ? 'Drive Handover Pending' : 'Download Pending'}
                          </span>
                        ) : workflowStage === 'in_process' ? (
                          scheduleRes?.isChanges ? (
                            <span className="status-pill stop">
                              <AlertTriangle size={12} />
                              Client Changes (2d Turnaround)
                            </span>
                          ) : (
                            <span className="status-pill busy">
                              <Play size={12} />
                              In-Process (Queue #{scheduleRes?.queuePosition || 1} of {scheduleRes?.totalInQueue || 1})
                            </span>
                          )
                        ) : workflowStage === 'sent_for_review' ? (
                          <span className="status-pill busy">
                            <CheckCircle2 size={12} />
                            Sent for Review
                          </span>
                        ) : (
                          <span className="status-pill done">
                            <Check size={12} />
                            Finalized
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="stage-row">
                      <span className="muted">
                        {workflowStage === 'download_pending'
                          ? job.rawDataSource === 'hard_drive'
                            ? 'Physical hard drive handover pending. Confirm receipt or locate folder to begin cutting.'
                            : 'Raw footage awaiting download. Download to local disk to begin cutting.'
                          : workflowStage === 'in_process'
                          ? scheduleRes?.isChanges
                            ? 'Client requested revisions. Turnaround is 2 working days (capacity excluded).'
                            : `Queue position #${scheduleRes?.queuePosition || 1} · Allocated editing: ${scheduleRes?.requiredDays || job.requiredDays || 2} working days.`
                          : workflowStage === 'sent_for_review'
                          ? 'Deliverable submitted to studio. Waiting for client feedback and approval.'
                          : 'Cut finalized and approved. View financial breakdown under the Payments tab.'}
                      </span>
                      <span style={{ flex: 1 }} />
                      {hasRevisions && (
                        <button onClick={() => setChangesJob(job)}>
                          <MessageSquarePlus size={13} style={{ verticalAlign: -2, marginRight: 5 }} />
                          View client changes ({revisions.length})
                        </button>
                      )}
                    </div>

                    <div className="job-grid">
                      {/* ------------------------------------------------- Assignment & Details */}
                      <div className="job-cell">
                        <div className="cell-label">Assignment</div>
                        <div className="cell-value">
                          <div style={{ fontWeight: 600 }}>{job.serviceType || 'Video Editing'}</div>
                          <div className="sub" style={{ marginTop: 2 }}>
                            Job Code: {job.jobCode || job.id.slice(-6).toUpperCase()}
                          </div>
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
                                {job.rawDataLink.startsWith('b2://') || job.rawDataLink.includes('backblazeb2.com')
                                  ? 'Direct cloud package on Backblaze B2'
                                  : 'Client shared cloud link (Drive / Dropbox / External)'}
                              </div>
                            )}

                            {job.downloadedAt ? (
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
                                  {batches.length === 1 && /^https?:\/\//.test(batches[0].link) && (
                                    <button
                                      className="text-button"
                                      style={{ fontSize: 11, padding: 0 }}
                                      onClick={() => copy(`${job.id}:done`, batches[0].link)}
                                    >
                                      {copied === `${job.id}:done` ? (
                                        <><Check size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Copied</>
                                      ) : (
                                        <><Copy size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Copy link</>
                                      )}
                                    </button>
                                  )}
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
                            ) : downloadingJobId === job.id ? (
                              <div style={{ marginTop: 8, padding: 8, background: 'var(--panel)', borderRadius: 8, border: '1px solid var(--line)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                                  <span style={{ fontWeight: 600 }}>
                                    {downloadBatch
                                      ? `${downloadBatch.label} — ${downloadBatch.index} of ${downloadBatch.total}…`
                                      : 'Downloading raw footage…'}
                                  </span>
                                  <span className="mono" style={{ fontWeight: 600 }}>{downloadState.percent}%</span>
                                </div>
                                <div style={{ width: '100%', height: 6, background: 'var(--line)', borderRadius: 3, overflow: 'hidden' }}>
                                  <div style={{ width: `${downloadState.percent}%`, height: '100%', background: 'var(--blue)', transition: 'width 0.2s ease' }} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 5, fontSize: 11.5 }}>
                                  <span className="muted">
                                    {formatBytes(downloadState.downloadedBytes)} {downloadState.totalBytes > 0 ? `/ ${formatBytes(downloadState.totalBytes)}` : ''}
                                  </span>
                                  <button
                                    className="text-button"
                                    style={{ color: 'var(--warn)', padding: 0, fontSize: 11 }}
                                    onClick={() => void handleCancelDownload(job.id)}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <button
                                  className="primary"
                                  disabled={busy === `${job.id}:locate`}
                                  onClick={() => void handleStartDownload(job, batches)}
                                  style={{ width: '100%', justifyContent: 'center' }}
                                >
                                  <Download size={13} style={{ verticalAlign: -2, marginRight: 5 }} />
                                  {batches.length > 1 ? `Download all ${batches.length} batches` : 'Download Raw Footage'}
                                </button>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  {job.rawDataLink.startsWith('http://') || job.rawDataLink.startsWith('https://') ? (
                                    <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                      <button
                                        className="text-button"
                                        style={{ fontSize: 11, padding: 0 }}
                                        onClick={() => void window.api.openExternal(job.rawDataLink!)}
                                      >
                                        <ExternalLink size={11} style={{ verticalAlign: -2, marginRight: 3 }} />Open in browser
                                      </button>
                                      <button
                                        className="text-button"
                                        style={{ fontSize: 11, padding: 0 }}
                                        onClick={() => copy(`${job.id}:link`, job.rawDataLink!)}
                                      >
                                        {copied === `${job.id}:link` ? (
                                          <><Check size={11} style={{ verticalAlign: -2, marginRight: 3 }} />Copied</>
                                        ) : (
                                          <><Copy size={11} style={{ verticalAlign: -2, marginRight: 3 }} />Copy link</>
                                        )}
                                      </button>
                                    </span>
                                  ) : (
                                    <span className="muted" style={{ fontSize: 11 }}>
                                      Due date runs continuously.
                                    </span>
                                  )}
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

                      {/* ----------------------------------------- Final delivery */}
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
                              Deliverable Uploaded
                            </div>
                            <div className="sub" style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                              Saved directly in Studio Dropbox
                            </div>
                            {workflowStage !== 'finalized' && (
                              <div className="link-row" style={{ marginTop: 8 }}>
                                <button
                                  className="primary"
                                  disabled={busy === `${job.id}:upload`}
                                  onClick={() => void handleChooseAndUpload(job)}
                                >
                                  <Upload size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Replace Deliverable
                                </button>
                              </div>
                            )}
                            <span className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                              {workflowStage === 'finalized'
                                ? 'Finalized work approved. Reflects in Payments.'
                                : 'Work submitted to studio. Replacing overwrites the file in Dropbox keeping version history.'}
                            </span>
                          </>
                        ) : (
                          <>
                            <div className="cell-value muted" style={{ fontSize: 12 }}>
                              Upload your finished video directly from your computer. It streams directly to Studio Dropbox.
                            </div>
                            <div className="link-row" style={{ marginTop: 8 }}>
                              <button
                                className="primary"
                                disabled={busy === `${job.id}:upload`}
                                onClick={() => void handleChooseAndUpload(job)}
                              >
                                <Upload size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Upload Deliverable
                              </button>
                            </div>
                            <span className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                              Uploads send directly to the studio's 2TB Dropbox.
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        ) : view === 'payments' ? (
          <EditorPaymentsScreen jobs={myJobs} />
        ) : null}

        {/* Changes Modal */}
        {changesJob && (
          <div className="modal-shade">
            <section className="work-modal" role="dialog" aria-modal="true" aria-labelledby="changes-title">
              <header>
                <div>
                  <span className="eyebrow">CLIENT FEEDBACK</span>
                  <h2 id="changes-title">Changes requested</h2>
                </div>
                <button className="icon-button" aria-label="Close" onClick={() => setChangesJob(null)}>
                  <X size={20} />
                </button>
              </header>

              <p className="muted" style={{ marginTop: 0 }}>{changesJob.title}</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '16px 0', maxHeight: '55vh', overflowY: 'auto' }}>
                {(changesJob.revisions || []).map((rev, idx) => (
                  <div
                    key={rev.id || idx}
                    style={{
                      padding: '14px',
                      borderRadius: '10px',
                      background: rev.status !== 'resolved' ? 'color-mix(in srgb, var(--burgundy) 6%, var(--paper))' : 'var(--paper)',
                      border: `1px solid ${rev.status !== 'resolved' ? 'color-mix(in srgb, var(--burgundy) 30%, transparent)' : 'color-mix(in srgb, var(--line) 30%, transparent)'}`
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>Round {rev.roundNumber}</span>
                      <span className="muted" style={{ fontSize: 12 }}>{rev.receivedDate}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{rev.feedbackNotes}</p>
                    {rev.timecodes && (
                      <p className="sub" style={{ marginTop: 6, fontSize: 12 }}>
                        <strong>Timecodes:</strong> {rev.timecodes}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <div className="actions">
                <button className="primary" onClick={() => setChangesJob(null)}>Close</button>
              </div>
            </section>
          </div>
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
      </main>
    </div>
  );
}
