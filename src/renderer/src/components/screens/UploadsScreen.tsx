import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  DriveItem,
  DriveStatus,
  Transfer,
  WorkTarget
} from '../../../../shared/contracts';
import {
  formatBytes,
  formatCount,
  formatDuration,
  progressFraction,
  remainingSummary,
  statusLabel
} from '../../utils/uploadFormat';
import { formatEta, formatSpeed, useTransferSpeed } from '../../utils/uploadSpeed';
import { ShareActions } from './ShareActions';
import { auth } from '../../lib/auth';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Cloud,
  Download,
  ExternalLink,
  File,
  FileText,
  Film,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Image as ImageIcon,
  Loader2,
  LogIn,
  LogOut,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Search,
  Share2,
  Trash2,
  Upload
} from 'lucide-react';

interface UploadsScreenProps {
  jobs: Transfer[];
  onOpen: (id: string) => void;
  refresh?: () => Promise<void>;
}

type PanelMode = 'transfers' | 'drive-manager';

interface LinkInspectResult {
  id?: string;
  folderName?: string;
  name?: string;
  sizeBytes: number;
  fileCount: number;
  isFolder: boolean;
}

interface LinkDownloadEntry {
  id: string;
  title: string;
  rawDataLink: string;
  destPath: string;
  totalBytes: number;
  downloadedBytes: number;
  totalFiles: number;
  percent: number;
  currentFileName?: string;
  bytesPerSecond: number;
  etaSeconds?: number;
  status: 'downloading' | 'paused' | 'completed' | 'error' | 'cancelled';
  error?: string;
}

const STORAGE_KEY_DOWNLOADS = 'baawaray_link_downloads_v1';

export function UploadsScreen({ jobs, onOpen, refresh }: UploadsScreenProps): React.ReactElement {
  const [panelMode, setPanelMode] = useState<PanelMode>('transfers');

  // --- Google Drive Auth & Quota State ---
  const [driveStatus, setDriveStatus] = useState<DriveStatus | null>(null);
  const [driveBusy, setDriveBusy] = useState<string>('');
  const [driveError, setDriveError] = useState<string>('');
  const [driveNotice, setDriveNotice] = useState<string>('');

  // --- Upload Controls State ---
  const [uploadTitle, setUploadTitle] = useState<string>('');
  const [autoStartUpload, setAutoStartUpload] = useState<boolean>(true);
  const [uploadBusy, setUploadBusy] = useState<string>('');

  // --- Link Downloader State ---
  const [downloadLink, setDownloadLink] = useState<string>('');
  const [downloadDestPath, setDownloadDestPath] = useState<string>('');
  const [inspectBusy, setInspectBusy] = useState<boolean>(false);
  const [inspectResult, setInspectResult] = useState<LinkInspectResult | null>(null);
  const [inspectError, setInspectError] = useState<string>('');
  const [localFreeBytes, setLocalFreeBytes] = useState<number | null>(null);
  const [downloads, setDownloads] = useState<LinkDownloadEntry[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_DOWNLOADS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [downloadBusy, setDownloadBusy] = useState<string>('');

  // --- Google Drive Manager State ---
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string; name: string }>>([
    { id: 'root', name: 'My Drive' }
  ]);
  const [driveItems, setDriveItems] = useState<DriveItem[]>([]);
  const [driveLoading, setDriveLoading] = useState<boolean>(false);
  const [driveSearch, setDriveSearch] = useState<string>('');
  const [driveFilter, setDriveFilter] = useState<'all' | 'folders' | 'video' | 'image'>('all');
  const [newFolderModal, setNewFolderModal] = useState<boolean>(false);
  const [newFolderName, setNewFolderName] = useState<string>('');
  const [renameTarget, setRenameTarget] = useState<DriveItem | null>(null);
  const [renameValue, setRenameValue] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string>('');

  const currentFolder = breadcrumbs[breadcrumbs.length - 1] || { id: 'root', name: 'My Drive' };

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_DOWNLOADS, JSON.stringify(downloads));
    } catch {}
  }, [downloads]);

  // Load Drive status & active downloads on mount
  const loadDriveStatus = async (fetchFreshQuota = false): Promise<DriveStatus | null> => {
    try {
      const st = await window.api.driveStatus();
      if (fetchFreshQuota || (!st.quota && st.connected)) {
        try {
          const q = await window.api.driveQuota();
          if (q) st.quota = q;
        } catch {}
      }
      setDriveStatus(st);
      return st;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    void loadDriveStatus(false);
    if (window.api.onDownloadProgress) {
      return window.api.onDownloadProgress((data) => {
        setDownloads((prev) => {
          const idx = prev.findIndex((d) => d.id === data.jobId);
          if (idx < 0) return prev;
          const copy = [...prev];
          copy[idx] = {
            ...copy[idx],
            percent: data.percent,
            currentFileName: data.fileName,
            downloadedBytes: data.downloadedBytes,
            totalBytes: data.totalBytes || copy[idx].totalBytes,
            bytesPerSecond: data.speedBytesPerSec || 0,
            etaSeconds: data.estimatedRemainingSec,
            status: data.status,
            error: data.error
          };
          return copy;
        });
      });
    }
    return undefined;
  }, []);

  // Load Drive files when in Drive Manager or when currentFolder changes
  const fetchDriveDirectory = async (folderId: string, query?: string): Promise<void> => {
    if (!driveStatus?.connected) return;
    setDriveLoading(true);
    setDriveError('');
    try {
      const res = await window.api.driveListFiles(folderId, query);
      setDriveItems(res.files || []);
    } catch (err: any) {
      setDriveError(err?.message || 'Failed to load Google Drive files.');
    } finally {
      setDriveLoading(false);
    }
  };

  useEffect(() => {
    if (panelMode === 'drive-manager' && driveStatus?.connected) {
      void fetchDriveDirectory(currentFolder.id, driveSearch.trim() || undefined);
    }
  }, [panelMode, currentFolder.id, driveStatus?.connected]);

  // Check local disk space when download destination changes
  useEffect(() => {
    if (!downloadDestPath) {
      setLocalFreeBytes(null);
      return;
    }
    void window.api
      .checkDiskSpace(downloadDestPath)
      .then((res) => setLocalFreeBytes(res.freeBytes))
      .catch(() => setLocalFreeBytes(null));
  }, [downloadDestPath]);

  // --- Google Drive Auth Actions ---
  const handleConnectDrive = async (): Promise<void> => {
    setDriveBusy('connect');
    setDriveError('');
    setDriveNotice('');
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : undefined;
      const st = await window.api.connectDrive(token);
      setDriveStatus(st);
      if (st.connected) {
        setDriveNotice(`Signed in to Google Drive as ${st.email || st.displayName || 'User'}.`);
      } else if (st.error) {
        setDriveError(st.error);
      }
      if (refresh) await refresh();
    } catch (err: any) {
      setDriveError(err?.message || 'Google Drive sign-in did not complete.');
    } finally {
      setDriveBusy('');
    }
  };

  const handleDisconnectDrive = async (): Promise<void> => {
    setDriveBusy('disconnect');
    setDriveError('');
    setDriveNotice('');
    try {
      const st = await window.api.disconnectDrive();
      setDriveStatus(st);
      setDriveItems([]);
      setDriveNotice('Disconnected Google Drive account.');
      if (refresh) await refresh();
    } catch (err: any) {
      setDriveError(err?.message || 'Could not disconnect Google Drive.');
    } finally {
      setDriveBusy('');
    }
  };

  const handleRefreshQuota = async (): Promise<void> => {
    setDriveBusy('quota');
    setDriveError('');
    try {
      const q = await window.api.driveQuota();
      if (q) {
        setDriveStatus((prev) => (prev ? { ...prev, quota: q } : null));
      }
      if (panelMode === 'drive-manager') {
        await fetchDriveDirectory(currentFolder.id, driveSearch.trim() || undefined);
      }
    } catch (err: any) {
      setDriveError(err?.message || 'Could not refresh Google Drive quota.');
    } finally {
      setDriveBusy('');
    }
  };

  const handleSetUploadDestination = async (folderId: string, folderName: string): Promise<void> => {
    setDriveBusy('target');
    setDriveError('');
    try {
      const st = await window.api.setTargetDriveFolder(
        folderId === 'root' ? '' : folderId,
        folderId === 'root' ? 'My Drive (Root)' : folderName
      );
      setDriveStatus(st);
      setDriveNotice(`Upload destination set to "${folderId === 'root' ? 'My Drive (Root)' : folderName}".`);
    } catch (err: any) {
      setDriveError(err?.message || 'Failed to update upload destination folder.');
    } finally {
      setDriveBusy('');
    }
  };

  // --- Upload Queue Actions ---
  const buildPersonalUploadTarget = (): WorkTarget => {
    const cleanTitle = uploadTitle.trim() || 'Drive Upload';
    const destFolder = driveStatus?.targetFolderName || 'My Drive';
    return {
      kind: 'team',
      id: `drive:${Date.now()}`,
      purpose: 'raw',
      title: cleanTitle,
      clientName: driveStatus?.displayName || 'Google Drive',
      serviceType: 'Raw Data Transfer',
      subtitle: `Google Drive · ${destFolder} (${driveStatus?.email || 'Personal Drive'})`
    };
  };

  const handlePickUpload = async (mode: 'folder' | 'files'): Promise<void> => {
    if (!driveStatus?.connected) {
      setDriveError('Please sign in with Google Drive first before starting an upload.');
      return;
    }
    setUploadBusy(mode);
    setDriveError('');
    setDriveNotice('');
    try {
      const options = {
        excludedBillingFolders: ['Proxies', 'Proxy'],
        countPhotoPairsOnce: true
      };
      const target = buildPersonalUploadTarget();
      const jobId =
        mode === 'folder'
          ? await window.api.scan(options, target)
          : await window.api.scanFiles(options, target);
      if (!jobId) return;
      setUploadTitle('');
      if (refresh) await refresh();
      if (!autoStartUpload) {
        onOpen(jobId);
      } else {
        setDriveNotice(`Measuring selection for upload to ${driveStatus.targetFolderName || 'My Drive'}…`);
      }
    } catch (err: any) {
      setDriveError(err?.message || 'Failed to add upload to queue.');
    } finally {
      setUploadBusy('');
    }
  };

  // Auto-enqueue scanned personal jobs if autoStartUpload is enabled
  const autoEnqueuedIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!autoStartUpload || !driveStatus?.connected) return;
    for (const job of jobs) {
      if (
        job.status === 'ready' &&
        job.completedFiles === 0 &&
        job.target?.id?.startsWith('drive:') &&
        job.scan &&
        !job.scan.readErrors &&
        !autoEnqueuedIds.current.has(job.id)
      ) {
        autoEnqueuedIds.current.add(job.id);
        void window.api.enqueue(job.id, job.target).then(() => refresh?.()).catch(() => {});
      }
    }
  }, [jobs, autoStartUpload, driveStatus?.connected, refresh]);

  // --- Link Downloader Actions ---
  const handleInspectLink = async (linkToInspect?: string): Promise<LinkInspectResult | null> => {
    const raw = (linkToInspect ?? downloadLink).trim();
    if (!raw) return null;
    if (!driveStatus?.connected) {
      setInspectError('Sign in with Google Drive above so the downloader can inspect and download links.');
      return null;
    }
    setInspectBusy(true);
    setInspectError('');
    try {
      const info = await window.api.getDownloadDetails(raw);
      const totalBytes = Number((info as any)?.totalBytes ?? (info as any)?.sizeBytes ?? 0) || 0;
      if (!info || (!totalBytes && !info.fileCount && !info.folderName)) {
        setInspectError('Could not inspect link details. Verify the Google Drive link is shared with your account.');
        setInspectResult(null);
        return null;
      }
      const mapped: LinkInspectResult = {
        name: info.folderName,
        folderName: info.folderName,
        sizeBytes: totalBytes,
        fileCount: info.fileCount || 1,
        isFolder: (info.fileCount || 0) > 1 || raw.includes('/folders/')
      };
      setInspectResult(mapped);
      return mapped;
    } catch (err: any) {
      setInspectError(err?.message || 'Failed to inspect link.');
      setInspectResult(null);
      return null;
    } finally {
      setInspectBusy(false);
    }
  };

  const handlePickDownloadFolder = async (): Promise<string> => {
    const dir = await window.api.chooseDownloadDirectory();
    if (dir) {
      setDownloadDestPath(dir);
      return dir;
    }
    return downloadDestPath;
  };

  const runLinkDownload = async (entry: LinkDownloadEntry): Promise<void> => {
    setDownloads((prev) =>
      prev.map((d) => (d.id === entry.id ? { ...d, status: 'downloading', error: undefined } : d))
    );
    try {
      const res = await window.api.downloadRawData(entry.id, entry.rawDataLink, entry.destPath);
      if (res && res.success) {
        setDownloads((prev) =>
          prev.map((d) =>
            d.id === entry.id
              ? { ...d, status: 'completed', percent: 100, downloadedBytes: d.totalBytes || d.downloadedBytes }
              : d
          )
        );
      }
    } catch (err: any) {
      const msg = String(err?.message || 'Download failed.');
      setDownloads((prev) =>
        prev.map((d) => (d.id === entry.id ? { ...d, status: 'error', error: msg } : d))
      );
    }
  };

  const handleStartLinkDownload = async (): Promise<void> => {
    if (!driveStatus?.connected) {
      setInspectError('Please sign in with your Google Drive account first.');
      return;
    }
    const raw = downloadLink.trim();
    if (!raw) {
      setInspectError('Paste a Google Drive file or folder link first.');
      return;
    }
    setDownloadBusy('start');
    setInspectError('');
    try {
      let info = inspectResult;
      if (!info) {
        info = await handleInspectLink(raw);
      }
      let dest = downloadDestPath;
      if (!dest) {
        dest = await handlePickDownloadFolder();
      }
      if (!dest) {
        setDownloadBusy('');
        return;
      }
      const space = await window.api.checkDiskSpace(dest);
      setLocalFreeBytes(space.freeBytes);
      if (info && info.sizeBytes > 0 && space.freeBytes > 0 && info.sizeBytes > space.freeBytes) {
        throw new Error(
          `Not enough free disk space on Mac. Link requires ${formatBytes(info.sizeBytes)}, but only ${formatBytes(space.freeBytes)} is available.`
        );
      }

      const dlId = `dl-${Date.now()}`;
      const title = info?.name || info?.folderName || (raw.includes('/folders/') ? 'Google Drive Folder' : 'Google Drive Download');
      const targetDest = info?.folderName ? `${dest.replace(/\/+$/, '')}/${info.folderName}` : dest;
      const newEntry: LinkDownloadEntry = {
        id: dlId,
        title,
        rawDataLink: raw,
        destPath: targetDest,
        totalBytes: info?.sizeBytes || 0,
        downloadedBytes: 0,
        totalFiles: info?.fileCount || 1,
        percent: 0,
        bytesPerSecond: 0,
        status: 'downloading'
      };
      setDownloads((prev) => [newEntry, ...prev]);
      setDownloadLink('');
      setInspectResult(null);
      setDriveNotice(`Started downloading "${title}" to ${targetDest}`);
      void runLinkDownload(newEntry);
    } catch (err: any) {
      setInspectError(err?.message || 'Failed to start download.');
    } finally {
      setDownloadBusy('');
    }
  };

  // --- Drive Manager Actions ---
  const handleNavigateFolder = (folder: { id: string; name: string }, index?: number): void => {
    setDriveSearch('');
    if (typeof index === 'number') {
      setBreadcrumbs((prev) => prev.slice(0, index + 1));
    } else {
      setBreadcrumbs((prev) => [...prev, folder]);
    }
  };

  const handleCreateFolder = async (): Promise<void> => {
    if (!newFolderName.trim()) return;
    setDriveBusy('mkdir');
    setDriveError('');
    try {
      const created = await window.api.driveCreateFolder(newFolderName.trim(), currentFolder.id);
      setNewFolderName('');
      setNewFolderModal(false);
      setDriveNotice(`Created folder "${created.name}".`);
      await fetchDriveDirectory(currentFolder.id, driveSearch.trim() || undefined);
    } catch (err: any) {
      setDriveError(err?.message || 'Failed to create folder.');
    } finally {
      setDriveBusy('');
    }
  };

  const handleRenameItem = async (): Promise<void> => {
    if (!renameTarget || !renameValue.trim()) return;
    setDriveBusy(`rename-${renameTarget.id}`);
    setDriveError('');
    try {
      await window.api.driveRenameFile(renameTarget.id, renameValue.trim());
      setDriveNotice(`Renamed to "${renameValue.trim()}".`);
      setRenameTarget(null);
      setRenameValue('');
      await fetchDriveDirectory(currentFolder.id, driveSearch.trim() || undefined);
    } catch (err: any) {
      setDriveError(err?.message || 'Failed to rename item.');
    } finally {
      setDriveBusy('');
    }
  };

  const handleTrashItem = async (item: DriveItem): Promise<void> => {
    if (!window.confirm(`Move "${item.name}" to Google Drive trash?`)) return;
    setDriveBusy(`trash-${item.id}`);
    setDriveError('');
    try {
      await window.api.driveTrashFile(item.id, false);
      setDriveNotice(`Moved "${item.name}" to trash.`);
      await fetchDriveDirectory(currentFolder.id, driveSearch.trim() || undefined);
      void loadDriveStatus(true);
    } catch (err: any) {
      setDriveError(err?.message || 'Failed to move item to trash.');
    } finally {
      setDriveBusy('');
    }
  };

  const handleEmptyTrash = async (): Promise<void> => {
    if (!window.confirm('Permanently delete all items in your Google Drive Trash to free up quota?')) return;
    setDriveBusy('empty-trash');
    setDriveError('');
    try {
      await window.api.driveEmptyTrash();
      setDriveNotice('Google Drive Trash emptied.');
      await loadDriveStatus(true);
    } catch (err: any) {
      setDriveError(err?.message || 'Failed to empty Google Drive trash.');
    } finally {
      setDriveBusy('');
    }
  };

  const handleShareDriveItem = async (item: DriveItem): Promise<void> => {
    setDriveBusy(`share-${item.id}`);
    setDriveError('');
    try {
      const link = await window.api.driveShareItem(item.id, 'anyone');
      await window.api.copyToClipboard(link);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(''), 2500);
      setDriveNotice(`Share link copied for "${item.name}".`);
    } catch (err: any) {
      setDriveError(err?.message || 'Failed to generate share link.');
    } finally {
      setDriveBusy('');
    }
  };

  const handleDownloadDriveItem = async (item: DriveItem): Promise<void> => {
    setDriveBusy(`dl-${item.id}`);
    setDriveError('');
    try {
      const dest = downloadDestPath || (await window.api.chooseDownloadDirectory());
      if (!dest) return;
      setDownloadDestPath(dest);
      const link = item.isFolder
        ? `https://drive.google.com/drive/folders/${item.id}`
        : `https://drive.google.com/file/d/${item.id}/view`;
      const targetDest = item.isFolder ? `${dest.replace(/\/+$/, '')}/${item.name}` : dest;
      const newEntry: LinkDownloadEntry = {
        id: `dl-${Date.now()}`,
        title: item.name,
        rawDataLink: link,
        destPath: targetDest,
        totalBytes: item.size || 0,
        downloadedBytes: 0,
        totalFiles: 1,
        percent: 0,
        bytesPerSecond: 0,
        status: 'downloading'
      };
      setDownloads((prev) => [newEntry, ...prev]);
      setDriveNotice(`Downloading "${item.name}" to ${targetDest}`);
      setPanelMode('transfers');
      void runLinkDownload(newEntry);
    } catch (err: any) {
      setDriveError(err?.message || 'Failed to start download.');
    } finally {
      setDriveBusy('');
    }
  };

  // --- Computed Maths for Uploader, Downloader & Drive Quota ---
  const uploadMaths = useMemo(() => {
    let totalBytes = 0;
    let uploadedBytes = 0;
    let totalFiles = 0;
    let completedFiles = 0;
    let activeCount = 0;

    for (const j of jobs) {
      const jobTotal = j.scan?.totalBytes || 0;
      totalBytes += jobTotal;
      uploadedBytes += Math.min(jobTotal, j.uploadedBytes || 0);
      totalFiles += j.scan?.fileCount || 0;
      completedFiles += j.completedFiles || 0;
      if (['scanning', 'queued', 'uploading', 'verifying', 'waiting_network', 'waiting_quota'].includes(j.status)) {
        activeCount++;
      }
    }
    const remainingBytes = Math.max(0, totalBytes - uploadedBytes);
    const pct = totalBytes > 0 ? Math.min(100, (uploadedBytes / totalBytes) * 100) : 0;
    return { totalBytes, uploadedBytes, remainingBytes, totalFiles, completedFiles, activeCount, pct };
  }, [jobs]);

  const downloadMaths = useMemo(() => {
    let totalBytes = 0;
    let downloadedBytes = 0;
    let totalFiles = 0;
    let completedFiles = 0;
    let activeSpeed = 0;
    let activeCount = 0;

    for (const d of downloads) {
      if (d.status === 'cancelled') continue;
      totalBytes += d.totalBytes || 0;
      downloadedBytes += d.downloadedBytes || 0;
      totalFiles += d.totalFiles || 1;
      if (d.status === 'completed') completedFiles += d.totalFiles || 1;
      if (d.status === 'downloading') {
        activeCount++;
        activeSpeed += d.bytesPerSecond || 0;
      }
    }
    const remainingBytes = Math.max(0, totalBytes - downloadedBytes);
    const pct = totalBytes > 0 ? Math.min(100, (downloadedBytes / totalBytes) * 100) : 0;
    return { totalBytes, downloadedBytes, remainingBytes, totalFiles, completedFiles, activeSpeed, activeCount, pct };
  }, [downloads]);

  const quota = driveStatus?.quota;
  const quotaLimit = quota?.limitBytes ?? null;
  const quotaFree = quota?.freeBytes ?? null;
  const quotaPct =
    quota && quotaLimit != null && quotaLimit > 0
      ? Math.min(100, (quota.usageBytes / quotaLimit) * 100)
      : 0;
  const uploadExceedsQuota =
    quota && quotaFree != null && quotaFree > 0 && uploadMaths.remainingBytes > quotaFree;

  const activeUploadJobs = jobs.filter((j) => j.status !== 'completed');
  const completedUploadJobs = jobs.filter((j) => j.status === 'completed');

  const filteredDriveItems = useMemo(() => {
    return driveItems.filter((item) => {
      if (driveFilter === 'folders') return item.isFolder;
      if (driveFilter === 'video') return !item.isFolder && item.mimeType.startsWith('video/');
      if (driveFilter === 'image') return !item.isFolder && item.mimeType.startsWith('image/');
      return true;
    });
  }, [driveItems, driveFilter]);

  return (
    <div className="screen">
      <header style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <span className="eyebrow">GOOGLE DRIVE TRANSFER HUB &amp; MANAGER</span>
          <h2>Uploader, Link Downloader &amp; Drive Manager</h2>
          <p className="muted" style={{ margin: '4px 0 0', maxWidth: 680 }}>
            Sign in with your Google Drive account to upload folders or files directly to your Drive, download files
            from any shared Google Drive link, and manage your Google Drive storage &amp; folders.
          </p>
        </div>

        {/* Mode Switcher Tabs */}
        <div
          style={{
            display: 'inline-flex',
            background: 'var(--bg-inset, #efe8dc)',
            padding: 4,
            borderRadius: 10,
            border: '1px solid var(--line)',
            gap: 4
          }}
        >
          <button
            type="button"
            onClick={() => setPanelMode('transfers')}
            style={{
              padding: '8px 14px',
              borderRadius: 7,
              border: 'none',
              background: panelMode === 'transfers' ? 'var(--panel, #fff)' : 'transparent',
              color: panelMode === 'transfers' ? 'var(--ink)' : 'var(--muted)',
              fontWeight: panelMode === 'transfers' ? 600 : 500,
              fontSize: 13,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: panelMode === 'transfers' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
            }}
          >
            <Upload size={14} /> Upload &amp; Download Queue
          </button>
          <button
            type="button"
            onClick={() => setPanelMode('drive-manager')}
            style={{
              padding: '8px 14px',
              borderRadius: 7,
              border: 'none',
              background: panelMode === 'drive-manager' ? 'var(--panel, #fff)' : 'transparent',
              color: panelMode === 'drive-manager' ? 'var(--ink)' : 'var(--muted)',
              fontWeight: panelMode === 'drive-manager' ? 600 : 500,
              fontSize: 13,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: panelMode === 'drive-manager' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
            }}
          >
            <HardDrive size={14} /> Manage My Google Drive
          </button>
        </div>
      </header>

      {driveError && (
        <p className="error" role="alert" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{driveError}</span>
          <button className="text-button" onClick={() => setDriveError('')}>Dismiss</button>
        </p>
      )}
      {driveNotice && (
        <p className="success" role="status" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{driveNotice}</span>
          <button className="text-button" onClick={() => setDriveNotice('')}>Dismiss</button>
        </p>
      )}

      {/* =====================================================================
          1. GOOGLE DRIVE ACCOUNT & STORAGE QUOTA MATHS BAR
         ===================================================================== */}
      <section className="panel" style={{ marginBottom: 18 }}>
        {!driveStatus?.connected ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 16
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 12,
                  background: 'rgba(122, 28, 36, 0.08)',
                  color: 'var(--burgundy)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <Cloud size={24} />
              </div>
              <div>
                <span className="eyebrow">GOOGLE DRIVE SIGN-IN REQUIRED</span>
                <h3 style={{ margin: '2px 0 4px', fontSize: 18 }}>Connect Google Drive for Uploads &amp; Downloads</h3>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  Sign in with the Google account where your files will be uploaded, managed, and downloaded from shared links.
                </p>
              </div>
            </div>
            <button
              className="primary"
              disabled={driveBusy === 'connect'}
              onClick={() => void handleConnectDrive()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', fontSize: 13.5 }}
            >
              {driveBusy === 'connect' ? <Loader2 size={15} className="spin" /> : <LogIn size={15} />}
              {driveBusy === 'connect' ? 'Opening Google Sign-In…' : 'Sign in with Google Drive'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {driveStatus.photoLink ? (
                  <img
                    src={driveStatus.photoLink}
                    alt=""
                    style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--line)' }}
                  />
                ) : (
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: '50%',
                      background: 'var(--burgundy)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: 15
                    }}
                  >
                    {(driveStatus.displayName || driveStatus.email || 'G').charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 15 }}>{driveStatus.displayName || 'Google Drive Account'}</strong>
                    <span className="status-pill ok" style={{ fontSize: 11, padding: '2px 8px' }}>Connected</span>
                  </div>
                  <div className="muted mono" style={{ fontSize: 12.5 }}>
                    {driveStatus.email} · Upload Target:{' '}
                    <strong style={{ color: 'var(--ink)' }}>{driveStatus.targetFolderName || 'My Drive (Root)'}</strong>
                  </div>
                </div>
              </div>

              <div className="actions" style={{ margin: 0 }}>
                <button
                  type="button"
                  disabled={driveBusy === 'quota'}
                  onClick={() => void handleRefreshQuota()}
                  title="Refresh Google Drive Storage Maths"
                >
                  <RefreshCw size={13} className={driveBusy === 'quota' ? 'spin' : ''} style={{ marginRight: 5, verticalAlign: -2 }} />
                  Refresh Maths
                </button>
                <button
                  type="button"
                  onClick={() => setPanelMode(panelMode === 'drive-manager' ? 'transfers' : 'drive-manager')}
                >
                  <FolderOpen size={13} style={{ marginRight: 5, verticalAlign: -2 }} />
                  {panelMode === 'drive-manager' ? 'Back to Transfers' : 'Browse & Manage Drive'}
                </button>
                <button
                  type="button"
                  onClick={() => void window.api.openExternal('https://drive.google.com/drive/my-drive')}
                >
                  <ExternalLink size={13} style={{ marginRight: 5, verticalAlign: -2 }} />
                  Open in Browser
                </button>
                <button
                  type="button"
                  disabled={driveBusy === 'connect'}
                  onClick={() => void handleConnectDrive()}
                >
                  Switch Account
                </button>
                <button
                  type="button"
                  disabled={driveBusy === 'disconnect'}
                  onClick={() => void handleDisconnectDrive()}
                  style={{ color: 'var(--danger, #b42318)' }}
                >
                  <LogOut size={13} style={{ marginRight: 5, verticalAlign: -2 }} />
                  Sign Out
                </button>
              </div>
            </div>

            {/* Storage & Transfer Maths Grid */}
            <div className="stat-grid" style={{ marginTop: 2 }}>
              <div className="stat">
                <div className="label">Google Drive Used</div>
                <div className="value">{quota ? formatBytes(quota.usageBytes) : '—'}</div>
                <div className="foot">
                  {quota && quotaLimit != null && quotaLimit > 0
                    ? `${quotaPct.toFixed(1)}% of ${formatBytes(quotaLimit)} total`
                    : quota
                    ? 'Unlimited / Workspace storage'
                    : 'Reading storage quota…'}
                </div>
              </div>
              <div className="stat">
                <div className="label">Available Drive Space</div>
                <div className="value" style={{ color: uploadExceedsQuota ? 'var(--danger, #b42318)' : undefined }}>
                  {quota ? (quotaLimit != null && quotaLimit > 0 ? formatBytes(quotaFree ?? 0) : 'Unlimited') : '—'}
                </div>
                <div className="foot">
                  {quota ? `${formatBytes(quota.usageInDriveTrashBytes)} in Drive Trash` : 'Free space for uploads'}
                </div>
              </div>
              <div className="stat">
                <div className="label">Upload Queue Maths</div>
                <div className="value">
                  {formatBytes(uploadMaths.uploadedBytes)} <span className="muted" style={{ fontSize: 13 }}>/ {formatBytes(uploadMaths.totalBytes)}</span>
                </div>
                <div className="foot">
                  {uploadMaths.remainingBytes > 0
                    ? `${formatBytes(uploadMaths.remainingBytes)} remaining (${formatCount(uploadMaths.completedFiles)}/${formatCount(uploadMaths.totalFiles)} files)`
                    : `${formatCount(uploadMaths.totalFiles)} files in queue`}
                </div>
              </div>
              <div className="stat">
                <div className="label">Download Queue Maths</div>
                <div className="value">
                  {formatBytes(downloadMaths.downloadedBytes)} <span className="muted" style={{ fontSize: 13 }}>/ {formatBytes(downloadMaths.totalBytes)}</span>
                </div>
                <div className="foot">
                  {downloadMaths.activeCount > 0
                    ? `${formatSpeed(downloadMaths.activeSpeed)} · ${formatBytes(downloadMaths.remainingBytes)} left`
                    : `${formatCount(downloadMaths.completedFiles)}/${formatCount(downloadMaths.totalFiles)} files downloaded`}
                </div>
              </div>
            </div>

            {quota && quotaLimit != null && quotaLimit > 0 && (
              <div>
                <div className="bar" style={{ height: 7 }}>
                  <span
                    style={{
                      width: `${quotaPct.toFixed(1)}%`,
                      background: quotaPct > 90 ? 'var(--danger, #b42318)' : 'var(--burgundy)'
                    }}
                  />
                </div>
                {uploadExceedsQuota && (
                  <p className="warning" style={{ marginTop: 8, marginBottom: 0, fontSize: 12.5 }}>
                    <AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
                    Your queued uploads require <strong>{formatBytes(uploadMaths.remainingBytes)}</strong>, which exceeds
                    your remaining Google Drive space (<strong>{formatBytes(quotaFree ?? 0)}</strong>). Empty your Drive
                    Trash or free up space in the Drive Manager tab.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* =====================================================================
          2A. TRANSFERS VIEW: UPLOAD TO GOOGLE DRIVE + DOWNLOAD FROM LINK
         ===================================================================== */}
      {panelMode === 'transfers' && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
              gap: 18,
              marginBottom: 22
            }}
          >
            {/* ---------------- UPLOAD TO GOOGLE DRIVE CARD ---------------- */}
            <section className="panel" style={{ margin: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 14 }}>
              <div>
                <span className="eyebrow">UPLOAD TO SIGNED-IN GOOGLE DRIVE</span>
                <h3 style={{ margin: '4px 0 6px', fontSize: 18 }}>Upload Folder or Files</h3>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  Files are checksum-verified and uploaded directly into{' '}
                  <strong>{driveStatus?.targetFolderName || 'My Drive (Root)'}</strong> on{' '}
                  <strong>{driveStatus?.email || 'your Google Drive'}</strong>.
                </p>

                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label style={{ fontSize: 12.5 }}>
                    Optional Folder / Package Label in Google Drive
                    <input
                      type="text"
                      value={uploadTitle}
                      onChange={(e) => setUploadTitle(e.target.value)}
                      placeholder="Leave blank to keep original folder/file name"
                      disabled={!driveStatus?.connected}
                    />
                  </label>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      fontSize: 12.5,
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: 'var(--bg-inset, #f6f2ea)',
                      border: '1px solid var(--line)'
                    }}
                  >
                    <span>
                      Destination: <strong>{driveStatus?.targetFolderName || 'My Drive (Root)'}</strong>
                    </span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {driveStatus?.targetFolderId && (
                        <button
                          type="button"
                          className="text-button"
                          style={{ fontSize: 12 }}
                          onClick={() => void handleSetUploadDestination('root', 'My Drive (Root)')}
                        >
                          Reset to Root
                        </button>
                      )}
                      <button
                        type="button"
                        className="text-button"
                        style={{ fontSize: 12, fontWeight: 600 }}
                        disabled={!driveStatus?.connected}
                        onClick={() => setPanelMode('drive-manager')}
                      >
                        Choose Drive Folder →
                      </button>
                    </div>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={autoStartUpload}
                      onChange={(e) => setAutoStartUpload(e.target.checked)}
                    />
                    Auto-start upload immediately after folder measurement finishes
                  </label>
                </div>
              </div>

              <div className="actions" style={{ marginTop: 6 }}>
                <button
                  className="primary"
                  disabled={!driveStatus?.connected || Boolean(uploadBusy)}
                  onClick={() => void handlePickUpload('folder')}
                >
                  <Folder size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                  {uploadBusy === 'folder' ? 'Selecting Folder…' : 'Upload Folder to Drive'}
                </button>
                <button
                  disabled={!driveStatus?.connected || Boolean(uploadBusy)}
                  onClick={() => void handlePickUpload('files')}
                >
                  <FileText size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                  {uploadBusy === 'files' ? 'Selecting Files…' : 'Upload Files to Drive'}
                </button>
              </div>
            </section>

            {/* ---------------- DOWNLOAD FROM LINK CARD ---------------- */}
            <section className="panel" style={{ margin: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 14 }}>
              <div>
                <span className="eyebrow">DOWNLOAD FROM GOOGLE DRIVE LINK</span>
                <h3 style={{ margin: '4px 0 6px', fontSize: 18 }}>Download Files or Folders from Link</h3>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  Paste any Google Drive folder link, file link, or shared URL. The downloader calculates total size and
                  downloads with automatic resume.
                </p>

                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label style={{ fontSize: 12.5 }}>
                    Google Drive Link (Folder or File URL)
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="text"
                        value={downloadLink}
                        onChange={(e) => {
                          setDownloadLink(e.target.value);
                          setInspectResult(null);
                          setInspectError('');
                        }}
                        placeholder="https://drive.google.com/drive/folders/... or /file/d/..."
                        disabled={!driveStatus?.connected}
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        disabled={!driveStatus?.connected || !downloadLink.trim() || inspectBusy}
                        onClick={() => void handleInspectLink()}
                        style={{ whiteSpace: 'nowrap' }}
                      >
                        {inspectBusy ? <Loader2 size={14} className="spin" /> : 'Calculate Maths'}
                      </button>
                    </div>
                  </label>

                  {/* Destination Folder Picker */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      fontSize: 12.5,
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: 'var(--bg-inset, #f6f2ea)',
                      border: '1px solid var(--line)'
                    }}
                  >
                    <span className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Save to: <strong>{downloadDestPath || 'Choose local Mac folder…'}</strong>
                      {localFreeBytes !== null && ` (${formatBytes(localFreeBytes)} free)`}
                    </span>
                    <button
                      type="button"
                      className="text-button"
                      style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}
                      onClick={() => void handlePickDownloadFolder()}
                    >
                      Browse Mac…
                    </button>
                  </div>

                  {/* Link Inspection Maths Box */}
                  {inspectResult && (
                    <div
                      style={{
                        padding: '10px 12px',
                        borderRadius: 8,
                        background: 'rgba(22, 101, 52, 0.06)',
                        border: '1px solid rgba(22, 101, 52, 0.2)',
                        fontSize: 12.5,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 8
                      }}
                    >
                      <div>
                        <strong>{inspectResult.name || (inspectResult.isFolder ? 'Drive Folder' : 'Drive File')}</strong>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {inspectResult.isFolder ? 'Folder' : 'Single File'} · {formatCount(inspectResult.fileCount)} file
                          {inspectResult.fileCount === 1 ? '' : 's'} · Total Size:{' '}
                          <strong>{inspectResult.sizeBytes > 0 ? formatBytes(inspectResult.sizeBytes) : 'Streamed'}</strong>
                        </div>
                      </div>
                      {localFreeBytes !== null && inspectResult.sizeBytes > 0 && (
                        <span
                          className={`status-pill ${localFreeBytes >= inspectResult.sizeBytes ? 'ok' : 'error'}`}
                          style={{ fontSize: 11 }}
                        >
                          {localFreeBytes >= inspectResult.sizeBytes
                            ? `Fits on disk (${formatBytes(localFreeBytes - inspectResult.sizeBytes)} left after)`
                            : 'Insufficient disk space'}
                        </span>
                      )}
                    </div>
                  )}

                  {inspectError && (
                    <p className="error" style={{ margin: 0, fontSize: 12.5 }}>
                      {inspectError}
                    </p>
                  )}
                </div>
              </div>

              <div className="actions" style={{ marginTop: 6 }}>
                <button
                  className="primary"
                  disabled={!driveStatus?.connected || !downloadLink.trim() || downloadBusy === 'start'}
                  onClick={() => void handleStartLinkDownload()}
                >
                  <Download size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                  {downloadBusy === 'start' ? 'Starting Download…' : 'Download from Link'}
                </button>
              </div>
            </section>
          </div>

          {/* ---------------- ACTIVE & COMPLETED DOWNLOADS QUEUE ---------------- */}
          {downloads.filter((d) => d.status !== 'cancelled').length > 0 && (
            <section className="panel" style={{ marginBottom: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <span className="eyebrow">LINK DOWNLOAD QUEUE</span>
                  <h3 style={{ margin: '2px 0 0', fontSize: 18 }}>
                    Downloads ({downloads.filter((d) => d.status !== 'cancelled').length})
                  </h3>
                </div>
                {downloads.some((d) => d.status === 'completed' || d.status === 'error') && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      setDownloads((prev) => prev.filter((d) => d.status === 'downloading' || d.status === 'paused'))
                    }
                  >
                    Clear finished
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {downloads
                  .filter((d) => d.status !== 'cancelled')
                  .map((dl) => {
                    const pct =
                      dl.totalBytes > 0
                        ? Math.min(100, (dl.downloadedBytes / dl.totalBytes) * 100)
                        : dl.percent || 0;
                    return (
                      <div
                        key={dl.id}
                        style={{
                          padding: '12px 14px',
                          borderRadius: 10,
                          border: '1px solid var(--line)',
                          background: 'var(--bg-inset, #faf8f5)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                          <div>
                            <strong style={{ fontSize: 14.5 }}>{dl.title}</strong>
                            <div className="mono muted" style={{ fontSize: 12 }}>
                              {dl.destPath}
                            </div>
                          </div>
                          <span
                            className={`status-pill ${
                              dl.status === 'completed'
                                ? 'ok'
                                : dl.status === 'error'
                                ? 'error'
                                : dl.status === 'paused'
                                ? 'warn'
                                : 'active'
                            }`}
                          >
                            {dl.status === 'downloading'
                              ? 'Downloading'
                              : dl.status === 'completed'
                              ? 'Completed'
                              : dl.status === 'paused'
                              ? 'Paused'
                              : dl.status}
                          </span>
                        </div>

                        <div className="bar">
                          <span style={{ width: `${pct.toFixed(1)}%` }} />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontSize: 12.5 }}>
                          <span className="muted">
                            {formatBytes(dl.downloadedBytes)} of {dl.totalBytes > 0 ? formatBytes(dl.totalBytes) : '—'} ({pct.toFixed(1)}%)
                            {dl.currentFileName ? ` · ${dl.currentFileName}` : ''}
                          </span>
                          {dl.status === 'downloading' && dl.bytesPerSecond > 0 && (
                            <span className="mono" style={{ color: 'var(--burgundy)', fontWeight: 600 }}>
                              {formatSpeed(dl.bytesPerSecond)}
                              {dl.etaSeconds ? ` · ${formatDuration(dl.etaSeconds)} left` : ''}
                            </span>
                          )}
                        </div>

                        {dl.error && (
                          <p className="error" style={{ margin: 0, fontSize: 12 }}>
                            {dl.error}
                          </p>
                        )}

                        <div className="actions" style={{ marginTop: 2 }}>
                          {dl.status === 'downloading' && (
                            <button
                              type="button"
                              onClick={() => {
                                void window.api.pauseDownload(dl.id);
                                setDownloads((prev) =>
                                  prev.map((d) => (d.id === dl.id ? { ...d, status: 'paused' } : d))
                                );
                              }}
                            >
                              <Pause size={13} style={{ marginRight: 5, verticalAlign: -2 }} /> Pause
                            </button>
                          )}
                          {(dl.status === 'paused' || dl.status === 'error') && (
                            <button
                              type="button"
                              className="primary"
                              onClick={() => void runLinkDownload(dl)}
                            >
                              <Play size={13} style={{ marginRight: 5, verticalAlign: -2 }} /> Resume
                            </button>
                          )}
                          <button type="button" onClick={() => void window.api.revealInFinder(dl.destPath)}>
                            <FolderOpen size={13} style={{ marginRight: 5, verticalAlign: -2 }} /> Show in Finder
                          </button>
                          {dl.status !== 'completed' && (
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => {
                                void window.api.cancelDownload(dl.id);
                                setDownloads((prev) => prev.filter((d) => d.id !== dl.id));
                              }}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </section>
          )}

          {/* ---------------- UPLOAD QUEUE CARDS ---------------- */}
          {jobs.length === 0 ? (
            <div className="empty">
              <p>No uploads in queue yet.</p>
              <p className="muted" style={{ fontSize: 13 }}>
                Use <strong>Upload Folder to Drive</strong> or <strong>Upload Files to Drive</strong> above to scan and upload
                files to your signed-in Google Drive.
              </p>
            </div>
          ) : (
            <>
              {activeUploadJobs.map((j) => (
                <TransferCard
                  key={j.id}
                  job={j}
                  driveConnected={Boolean(driveStatus?.connected)}
                  onOpen={() => onOpen(j.id)}
                  refresh={refresh}
                />
              ))}
              {completedUploadJobs.length > 0 && (
                <>
                  <h2 style={{ fontSize: 18, marginTop: 28 }}>Completed Uploads ({completedUploadJobs.length})</h2>
                  {completedUploadJobs.map((j) => (
                    <TransferCard
                      key={j.id}
                      job={j}
                      driveConnected={Boolean(driveStatus?.connected)}
                      onOpen={() => onOpen(j.id)}
                      refresh={refresh}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </>
      )}

      {/* =====================================================================
          2B. GOOGLE DRIVE MANAGER VIEW: BROWSE, SHARE, DOWNLOAD, ORGANIZE
         ===================================================================== */}
      {panelMode === 'drive-manager' && (
        <section className="panel">
          {!driveStatus?.connected ? (
            <div className="empty" style={{ padding: '32px 16px' }}>
              <p>Sign in with your Google Drive account above to browse and manage your Google Drive files.</p>
              <button className="primary" onClick={() => void handleConnectDrive()}>
                Sign in with Google Drive
              </button>
            </div>
          ) : (
            <>
              {/* Top Toolbar: Breadcrumbs + Actions */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 12,
                  marginBottom: 14
                }}
              >
                {/* Breadcrumb trail */}
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, fontSize: 13.5 }}>
                  {breadcrumbs.map((crumb, idx) => (
                    <React.Fragment key={`${crumb.id}-${idx}`}>
                      {idx > 0 && <ChevronRight size={14} className="muted" />}
                      <button
                        type="button"
                        className="text-button"
                        style={{
                          fontWeight: idx === breadcrumbs.length - 1 ? 700 : 500,
                          color: idx === breadcrumbs.length - 1 ? 'var(--ink)' : 'var(--muted)',
                          padding: '4px 6px'
                        }}
                        onClick={() => handleNavigateFolder(crumb, idx)}
                      >
                        {crumb.name}
                      </button>
                    </React.Fragment>
                  ))}
                </div>

                <div className="actions" style={{ margin: 0 }}>
                  <button
                    type="button"
                    className="primary"
                    disabled={driveBusy === 'target'}
                    onClick={() => void handleSetUploadDestination(currentFolder.id, currentFolder.name)}
                    title="Route new uploads into this folder"
                  >
                    <FolderInput size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                    Use "{currentFolder.name}" for Uploads
                  </button>
                  <button type="button" onClick={() => setNewFolderModal(true)}>
                    <FolderPlus size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                    New Folder
                  </button>
                  <button
                    type="button"
                    disabled={driveLoading}
                    onClick={() => void fetchDriveDirectory(currentFolder.id, driveSearch.trim() || undefined)}
                  >
                    <RefreshCw size={14} className={driveLoading ? 'spin' : ''} style={{ marginRight: 5, verticalAlign: -2 }} />
                    Refresh
                  </button>
                  {quota && quota.usageInDriveTrashBytes > 0 && (
                    <button
                      type="button"
                      disabled={driveBusy === 'empty-trash'}
                      onClick={() => void handleEmptyTrash()}
                      style={{ color: 'var(--danger, #b42318)' }}
                    >
                      <Trash2 size={14} style={{ marginRight: 5, verticalAlign: -2 }} />
                      Empty Trash ({formatBytes(quota.usageInDriveTrashBytes)})
                    </button>
                  )}
                </div>
              </div>

              {/* Search & Filter Row */}
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  marginBottom: 14
                }}
              >
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void fetchDriveDirectory(currentFolder.id, driveSearch.trim() || undefined);
                  }}
                  style={{ display: 'flex', gap: 8, flex: 1, minWidth: 240 }}
                >
                  <input
                    type="text"
                    value={driveSearch}
                    onChange={(e) => setDriveSearch(e.target.value)}
                    placeholder="Search files & folders across your Google Drive…"
                    style={{ flex: 1 }}
                  />
                  <button type="submit" disabled={driveLoading}>
                    <Search size={14} style={{ marginRight: 5, verticalAlign: -2 }} />
                    Search
                  </button>
                  {driveSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setDriveSearch('');
                        void fetchDriveDirectory(currentFolder.id, undefined);
                      }}
                    >
                      Clear
                    </button>
                  )}
                </form>

                <div style={{ display: 'flex', gap: 6 }}>
                  {(['all', 'folders', 'video', 'image'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setDriveFilter(f)}
                      style={{
                        padding: '6px 11px',
                        fontSize: 12,
                        borderRadius: 6,
                        background: driveFilter === f ? 'var(--burgundy)' : undefined,
                        color: driveFilter === f ? '#fff' : undefined,
                        borderColor: driveFilter === f ? 'var(--burgundy)' : undefined
                      }}
                    >
                      {f === 'all' ? 'All Items' : f === 'folders' ? 'Folders' : f === 'video' ? 'Videos' : 'Photos'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Drive Items Table / List */}
              {driveLoading ? (
                <div style={{ padding: '36px 16px', textAlign: 'center' }} className="muted">
                  <Loader2 size={22} className="spin" style={{ marginBottom: 8 }} />
                  <div>Loading Google Drive items…</div>
                </div>
              ) : filteredDriveItems.length === 0 ? (
                <div className="empty" style={{ padding: '32px 16px' }}>
                  <p>No files or folders found in this location.</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="ledger" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--line)', fontSize: 12, color: 'var(--muted)' }}>
                        <th style={{ padding: '8px 10px' }}>NAME</th>
                        <th style={{ padding: '8px 10px' }}>TYPE</th>
                        <th style={{ padding: '8px 10px' }}>SIZE</th>
                        <th style={{ padding: '8px 10px' }}>MODIFIED</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDriveItems.map((item) => {
                        const isTarget = driveStatus.targetFolderId === item.id;
                        return (
                          <tr key={item.id} style={{ borderBottom: '1px solid var(--line)' }}>
                            <td style={{ padding: '10px', maxWidth: 320 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {item.isFolder ? (
                                  <Folder size={16} style={{ color: 'var(--burgundy)', flexShrink: 0 }} />
                                ) : item.mimeType.startsWith('video/') ? (
                                  <Film size={16} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                                ) : item.mimeType.startsWith('image/') ? (
                                  <ImageIcon size={16} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                                ) : (
                                  <File size={16} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                                )}
                                {item.isFolder ? (
                                  <button
                                    type="button"
                                    className="text-button"
                                    style={{ fontWeight: 600, textAlign: 'left', fontSize: 13.5 }}
                                    onClick={() => handleNavigateFolder({ id: item.id, name: item.name })}
                                  >
                                    {item.name}
                                  </button>
                                ) : (
                                  <span style={{ fontWeight: 500, fontSize: 13.5 }}>{item.name}</span>
                                )}
                                {isTarget && (
                                  <span className="status-pill ok" style={{ fontSize: 10.5, padding: '1px 6px' }}>
                                    Upload Target
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="muted" style={{ padding: '10px', fontSize: 12.5 }}>
                              {item.isFolder
                                ? 'Folder'
                                : item.mimeType.startsWith('video/')
                                ? 'Video'
                                : item.mimeType.startsWith('image/')
                                ? 'Photo'
                                : 'File'}
                            </td>
                            <td className="mono muted" style={{ padding: '10px', fontSize: 12.5 }}>
                              {item.isFolder ? '—' : (item.size && item.size > 0 ? formatBytes(item.size) : '—')}
                            </td>
                            <td className="muted" style={{ padding: '10px', fontSize: 12.5 }}>
                              {item.modifiedTime ? new Date(item.modifiedTime).toLocaleDateString() : '—'}
                            </td>
                            <td style={{ padding: '10px', textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                {item.isFolder && (
                                  <button
                                    type="button"
                                    style={{ padding: '4px 8px', fontSize: 11.5 }}
                                    onClick={() => void handleSetUploadDestination(item.id, item.name)}
                                    title="Set this folder as the Upload Destination"
                                  >
                                    Set Upload Target
                                  </button>
                                )}
                                <button
                                  type="button"
                                  style={{ padding: '4px 8px', fontSize: 11.5 }}
                                  disabled={driveBusy === `dl-${item.id}`}
                                  onClick={() => void handleDownloadDriveItem(item)}
                                  title="Download to Mac"
                                >
                                  <Download size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
                                  Download
                                </button>
                                <button
                                  type="button"
                                  style={{ padding: '4px 8px', fontSize: 11.5 }}
                                  disabled={driveBusy === `share-${item.id}`}
                                  onClick={() => void handleShareDriveItem(item)}
                                  title="Create & copy shareable Google Drive link"
                                >
                                  {copiedId === item.id ? (
                                    <>
                                      <Check size={12} style={{ marginRight: 4, verticalAlign: -1 }} /> Copied
                                    </>
                                  ) : (
                                    <>
                                      <Share2 size={12} style={{ marginRight: 4, verticalAlign: -1 }} /> Share Link
                                    </>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  style={{ padding: '4px 8px', fontSize: 11.5 }}
                                  onClick={() => {
                                    setRenameTarget(item);
                                    setRenameValue(item.name);
                                  }}
                                  title="Rename"
                                >
                                  <Pencil size={12} />
                                </button>
                                <button
                                  type="button"
                                  style={{ padding: '4px 8px', fontSize: 11.5, color: 'var(--danger, #b42318)' }}
                                  disabled={driveBusy === `trash-${item.id}`}
                                  onClick={() => void handleTrashItem(item)}
                                  title="Move to Trash"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* New Folder Modal */}
      {newFolderModal && (
        <div className="modal-shade" onClick={() => setNewFolderModal(false)}>
          <section className="work-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <header>
              <div>
                <span className="eyebrow">GOOGLE DRIVE</span>
                <h2>Create New Folder in "{currentFolder.name}"</h2>
              </div>
            </header>
            <label>
              Folder Name
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="e.g., Wedding Raw Footage"
                autoFocus
              />
            </label>
            <div className="actions">
              <button type="button" onClick={() => setNewFolderModal(false)}>Cancel</button>
              <button
                type="button"
                className="primary"
                disabled={!newFolderName.trim() || driveBusy === 'mkdir'}
                onClick={() => void handleCreateFolder()}
              >
                {driveBusy === 'mkdir' ? 'Creating…' : 'Create Folder'}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Rename Modal */}
      {renameTarget && (
        <div className="modal-shade" onClick={() => setRenameTarget(null)}>
          <section className="work-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <header>
              <div>
                <span className="eyebrow">RENAME ITEM</span>
                <h2>Rename "{renameTarget.name}"</h2>
              </div>
            </header>
            <label>
              New Name
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                autoFocus
              />
            </label>
            <div className="actions">
              <button type="button" onClick={() => setRenameTarget(null)}>Cancel</button>
              <button
                type="button"
                className="primary"
                disabled={!renameValue.trim() || driveBusy === `rename-${renameTarget.id}`}
                onClick={() => void handleRenameItem()}
              >
                Save Name
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function TransferCard({
  job: j,
  driveConnected,
  onOpen,
  refresh
}: {
  job: Transfer;
  driveConnected: boolean;
  onOpen: () => void;
  refresh?: () => Promise<void>;
}): React.ReactElement {
  const s = statusLabel(j.status);
  const pct = (progressFraction(j) * 100).toFixed(1);
  const moving = ['uploading', 'verifying'].includes(j.status);
  const bytesPerSecond = useTransferSpeed(j.uploadedBytes, moving);
  const remaining = Math.max(0, (j.scan?.totalBytes || 0) - j.uploadedBytes);
  const [busy, setBusy] = useState(false);

  const canQuickStart =
    driveConnected &&
    ['ready', 'paused'].includes(j.status) &&
    j.scan &&
    !j.scan.readErrors &&
    j.target;

  const handleQuickStart = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation();
    if (!j.target) {
      onOpen();
      return;
    }
    setBusy(true);
    try {
      await window.api.enqueue(j.id, j.target, j.invoice);
      if (refresh) await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleQuickPause = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation();
    setBusy(true);
    try {
      await window.api.pause(j.id);
      if (refresh) await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="transfer-card" onClick={onOpen}>
      <div className="transfer-card-head">
        <div>
          <h3>{j.target?.title || j.rootName}</h3>
          <div className="sub">
            {j.target ? `${j.target.subtitle} · ` : ''}
            {j.scan
              ? `${formatBytes(j.scan.totalBytes)} · ${formatCount(j.scan.fileCount)} files`
              : j.rootPath}
          </div>
        </div>
        <span className={`status-pill ${s.tone}`}>{s.text}</span>
      </div>
      <div className="bar">
        <span style={{ width: `${pct}%` }} />
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 8,
          gap: 12,
          flexWrap: 'wrap'
        }}
      >
        <div>
          <span className="muted" style={{ fontSize: 12.5 }}>
            {j.scan
              ? `${formatBytes(j.uploadedBytes)} of ${formatBytes(j.scan.totalBytes)} (${pct}%) · ${remainingSummary(j)}`
              : 'Measuring folder…'}
          </span>
          {moving && bytesPerSecond > 0 && (
            <div className="mono" style={{ fontSize: 12, color: 'var(--burgundy)', marginTop: 2 }}>
              {formatSpeed(bytesPerSecond)} · {formatEta(remaining, bytesPerSecond)}
            </div>
          )}
        </div>

        <div className="actions" style={{ margin: 0 }} onClick={(e) => e.stopPropagation()}>
          {canQuickStart && (
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={(e) => void handleQuickStart(e)}
              style={{ padding: '6px 12px', fontSize: 12 }}
            >
              <Play size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
              {j.completedFiles > 0 ? 'Resume Upload' : 'Start Upload'}
            </button>
          )}
          {['queued', 'uploading', 'verifying', 'waiting_network', 'waiting_quota'].includes(j.status) && (
            <button
              type="button"
              disabled={busy}
              onClick={(e) => void handleQuickPause(e)}
              style={{ padding: '6px 12px', fontSize: 12 }}
            >
              <Pause size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
              Pause
            </button>
          )}
          <button
            type="button"
            className="text-button"
            onClick={() => void window.api.removeTransfer(j.id, j.status === 'completed').then(() => refresh?.())}
            style={{ fontSize: 12 }}
          >
            {j.status === 'completed' ? 'Clear' : 'Remove'}
          </button>
        </div>
      </div>
      {j.status === 'completed' && j.link && (
        <div style={{ marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
          <ShareActions job={j} refresh={refresh || (async () => {})} />
        </div>
      )}
    </div>
  );
}
