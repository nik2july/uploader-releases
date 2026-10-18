import { useEffect, useMemo, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import { Archive, ArrowUpDown, BarChart3, Bell, Briefcase, Building2, Film, FolderPlus, PanelLeftClose, PanelLeftOpen, Settings, SlidersHorizontal, Upload, Users, Wrench } from 'lucide-react';
import { auth } from '../lib/auth';
import { useApp } from '../context/AppContext';
import longLogo from '../assets/baawaray-long.svg';
import { useTransfers } from '../hooks/useTransfers';
import { ACTIVE_STATUSES } from '../utils/uploadFormat';
import { attachVerifiedTransfer } from '../lib/studioRepository';
import { UploadsScreen } from './screens/UploadsScreen';
import { TransferDetail } from './screens/TransferDetail';
import { UploaderSettings } from './UploaderSettings';
import { UpdateBanner } from './UpdateBanner';
import { PostProductionTasksScreen } from './screens/PostProductionTasksScreen';
import { EditorDashboard } from './EditorDashboard';
import { CloudArchivalScreen } from './screens/CloudArchivalScreen';
import { PostProductionPaymentsScreen } from './screens/PostProductionPaymentsScreen';
import { PostProductionTeamScreen } from './screens/PostProductionTeamScreen';
import { PostProductionServicesScreen } from './screens/PostProductionServicesScreen';
import { DeliverablesScreen } from './screens/DeliverablesScreen';
import { FreelanceEditorView } from './freelance/FreelanceEditorView';
import { FreelanceStatsScreen } from './screens/FreelanceStatsScreen';
import { RecentActivityScreen } from './common/RecentActivityScreen';
import { UtilitiesScreen } from './screens/utilities/UtilitiesScreen';
import { GoogleDriveRequiredModal } from './common/GoogleDriveRequiredModal';
import { GoogleDriveConnectBanner } from './common/GoogleDriveConnectBanner';
import { ClientToolsScreen } from './screens/ClientToolsScreen';
import { GalleryUploaderScreen } from './screens/GalleryUploaderScreen';
import type { WorkTarget } from '../../../shared/contracts';

type View = 'deliverables' | 'tasks' | 'uploads' | 'team' | 'payments' | 'stats' | 'settings' | 'services' | 'archival' | 'activity' | 'utilities' | 'client-tools' | 'gallery-uploader';

export function OwnerDashboard(): React.JSX.Element {
  const studio = useApp();
  const { transfers, drive, error, loading, refresh } = useTransfers();
  const [view, setView] = useState<View>('deliverables');
  const [openId, setOpenId] = useState<string | null>(null);
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [pendingScanTarget, setPendingScanTarget] = useState<WorkTarget | null>(null);
  const rawLinkSyncAttempts = useRef(new Set<string>());

  // Sidebar toggle state (open by default, persisted across sessions)
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('baawaray_sidebar_open') !== 'false';
    } catch {
      return true;
    }
  });

  const toggleSidebar = (): void => {
    setSidebarOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('baawaray_sidebar_open', String(next));
      } catch {}
      return next;
    });
  };

  // Keyboard shortcut: ⌘B / Ctrl+B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // The keep-awake preference is stored with the studio's shared settings but
  // enforced by the queue, so it is pushed down whenever it changes.
  const keepAwake = studio.studioSettings?.uploader?.keepAwake;
  useEffect(() => { void window.api.setKeepAwake(Boolean(keepAwake)); }, [keepAwake]);

  const destination = studio.studioSettings?.uploader?.destination;
  const sharedDriveId = studio.studioSettings?.uploader?.sharedDriveId;
  const autoResumedRef = useRef(false);

  useEffect(() => {
    if (loading) return;
    const targetDest: 'drive' = 'drive';

    if (sharedDriveId && window.api.setSharedDriveId) {
      void window.api.setSharedDriveId(sharedDriveId);
    }

    void window.api.setUploadDestination(targetDest).then(() => {
      if (!autoResumedRef.current) {
        autoResumedRef.current = true;
        void window.api.autoResumeTransfers?.().catch(err =>
          console.warn('[Dashboard] autoResumeTransfers error:', err)
        );
      }
    });
  }, [sharedDriveId, drive?.connected, loading]);

  /**
   * Record every verified transfer against its work so the assigned editor can
   * download it, whichever cloud it went to.
   *
   * A project can hold more than one transfer — a second batch of raw footage
   * may be sent to the other cloud entirely — so each one is filed under its own
   * id and the job's headline rawDataLink is only filled while it is still
   * empty. Overwriting it would point the editor at the newest batch and lose
   * the earlier one, which still exists and is still theirs to download.
   */
  useEffect(() => {
    if (!studio.currentUser || studio.currentUser.accountType !== 'owner') return;
    for (const t of transfers) {
      if (t.status === 'completed' && t.link && t.target) {
        if (t.target.kind === 'freelance') {
          const job = studio.freelanceJobs.find(j =>
            String(j.id) === t.target?.id ||
            (j as any)._documentId === t.target?.id ||
            (t.target?.jobCode && j.jobCode === t.target.jobCode) ||
            (t.target?.title && j.title?.trim().toLowerCase() === t.target.title.trim().toLowerCase())
          );
          if (job && !(job as any).desktopTransfers?.[t.id] && !rawLinkSyncAttempts.current.has(t.id)) {
            rawLinkSyncAttempts.current.add(t.id);
            const docId = (job as any)._documentId || String(job.id);
            void attachVerifiedTransfer({ ...t, target: { ...t.target, id: docId } }).catch(err =>
              console.warn('[Auto-Sync] Failed to record transfer on the job:', err)
            );
          }
        } else if (t.target.kind === 'deliverable') {
          const clientId = t.target.clientId;
          if (clientId) {
            const client = studio.clients.find(c => String(c.id) === String(clientId));
            const del = client?.deliverables?.find(d => d.id === t.target?.id);
            if (del && !(del as any).desktopTransfers?.[t.id] && !rawLinkSyncAttempts.current.has(t.id)) {
              rawLinkSyncAttempts.current.add(t.id);
              void attachVerifiedTransfer(t).catch(err =>
                console.warn('[Auto-Sync] Failed to record deliverable transfer:', err)
              );
            }
          }
        }
      }
    }
  }, [transfers, studio.freelanceJobs, studio.clients, studio.currentUser]);

  const open = openId ? transfers.find(job => job.id === openId) : undefined;
  const active = useMemo(() => transfers.filter(job => ACTIVE_STATUSES.includes(job.status)).length, [transfers]);
  const attention = useMemo(() => transfers.filter(job => job.status === 'needs_attention').length, [transfers]);

  // Activity unread count for sidebar badge
  const activityStorageKey = `baawaray_activity_last_read_${studio.currentUser?.accountType}_${studio.currentUser?.id}`;
  const activityUnreadCount = useMemo(() => {
    try {
      const lastRead = localStorage.getItem(activityStorageKey) || '';
      const readTime = lastRead ? new Date(lastRead).getTime() : 0;
      let count = 0;
      for (const job of studio.freelanceJobs || []) {
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
  }, [studio.freelanceJobs, studio.currentUser, activityStorageKey]);

  // A scan is started from a job row; the folder dialog lives in the main
  // process, so the renderer only learns the new transfer's id once a folder was
  // actually chosen. Cancelling the dialog returns null and changes nothing.
  function opened(id: string | null): void {
    if (id) { setOpenId(id); setView('uploads'); }
  }

  function go(next: View): void { setOpenId(null); setView(next); }

  return (
    <div className={`app-shell ${!sidebarOpen ? 'sidebar-collapsed' : ''}`}>
      {sidebarOpen && (
        <nav className="sidebar">
          <div className="wordmark flex items-center justify-between gap-2">
            <img src={longLogo} alt="Baawaray" className="max-w-[145px]" />
            <button
              type="button"
              onClick={toggleSidebar}
              className="p-1 rounded-md hover:bg-stone-200 dark:hover:bg-white/10 text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white transition-colors cursor-pointer"
              title="Close sidebar (⌘B)"
            >
              <PanelLeftClose size={16} />
            </button>
          </div>
          <button className="nav-item" aria-current={view === 'deliverables'} onClick={() => { studio.setActiveView('deliverables'); go('deliverables'); }}>
            <Film size={16} /> Deliverables
          </button>
          <button className="nav-item" aria-current={view === 'tasks'} onClick={() => go('tasks')}>Tasks</button>
          <button
            className="nav-item"
            aria-current={view === 'activity'}
            onClick={() => go('activity')}
          >
            <Bell size={16} /> Recent Activity
            {activityUnreadCount > 0 && (
              <span className="count" style={{ background: 'var(--burgundy)', color: '#fff' }}>
                {activityUnreadCount > 99 ? '99+' : activityUnreadCount}
              </span>
            )}
          </button>
          <button className="nav-item" aria-current={view === 'uploads' && !openId} onClick={() => go('uploads')}>
            <ArrowUpDown size={16} /> Up Down Queue
            {active + attention > 0 && <span className="count">{active + attention}</span>}
          </button>
          <button className="nav-item" aria-current={view === 'payments'} onClick={() => go('payments')}>
            <span style={{ width: 16, textAlign: 'center' }}>₹</span> Payments
          </button>
          <button className="nav-item" aria-current={view === 'stats'} onClick={() => go('stats')}>
            <BarChart3 size={16} /> Stats
          </button>
          <button className="nav-item" aria-current={view === 'archival'} onClick={() => go('archival')}>
            <Archive size={16} /> Cloud Archival
          </button>
          <button className="nav-item" aria-current={view === 'team'} onClick={() => { studio.setSelectedFreelanceEditorId(null); go('team'); }}>
            <Users size={16} /> Team
          </button>
          <button className="nav-item" aria-current={view === 'client-tools'} onClick={() => go('client-tools')}>
            <FolderPlus size={16} /> Client Tools
          </button>
          <button className="nav-item" aria-current={view === 'gallery-uploader'} onClick={() => go('gallery-uploader')}>
            <Film size={16} /> Gallery Uploader
          </button>
          <button className="nav-item" aria-current={view === 'services'} onClick={() => go('services')}>
            <SlidersHorizontal size={16} /> Services
          </button>
          <button className="nav-item" aria-current={view === 'utilities'} onClick={() => go('utilities')}>
            <Wrench size={16} /> Utilities
          </button>
          <div className="spacer" />
          <button className="nav-item" aria-current={view === 'settings'} onClick={() => go('settings')}>
            <Settings size={16} /> Settings
          </button>
          <button className="nav-item" onClick={() => { void signOut(auth); }}>Sign out</button>
        </nav>
      )}

      <main className="main-area relative">
        {!sidebarOpen && (
          <div className="sidebar-collapsed-bar">
            <button
              type="button"
              onClick={toggleSidebar}
              className="sidebar-toggle-btn"
              title="Open sidebar (⌘B)"
            >
              <PanelLeftOpen size={15} className="text-[#E8A317]" />
              <span>Sidebar</span>
            </button>
            <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--muted)]">
              Baawaray Films • Press ⌘B to expand sidebar
            </div>
          </div>
        )}
        <UpdateBanner />
        <GoogleDriveConnectBanner
          connected={Boolean(drive?.connected)}
          onConnect={() => setShowDriveModal(true)}
        />
        {open ? (
          <TransferDetail job={open} onBack={() => setOpenId(null)} refresh={refresh} />
        ) : view === 'tasks' ? (
          <PostProductionTasksScreen />
        ) : view === 'activity' ? (
          <RecentActivityScreen
            onSelectJob={() => {
              studio.setActiveView('deliverables');
              go('deliverables');
            }}
          />
        ) : view === 'uploads' ? (
          <UploadsScreen transfers={transfers} loading={loading} error={error} drive={drive}
            onOpen={setOpenId} onSettings={() => go('settings')} />
        ) : view === 'deliverables' ? (
          <div className="board-area">
            {studio.activeView === 'freelanceEditor' && studio.selectedFreelanceEditorId ? (
              <FreelanceEditorView />
            ) : (
              <DeliverablesScreen
                onUploadForDeliverable={async target => {
                  if (!drive?.connected) {
                    setPendingScanTarget(target);
                    setShowDriveModal(true);
                    return;
                  }
                  const options = {
                    excludedBillingFolders: studio.studioSettings?.uploader?.excludedBillingFolders ?? ['Proxies', 'Proxy'],
                    countPhotoPairsOnce: studio.studioSettings?.uploader?.countPhotoPairsOnce ?? true,
                  };
                  opened(await window.api.scan(options, target));
                }}
                onGoToQueue={() => {
                  go('uploads');
                }}
              />
            )}
          </div>
        ) : view === 'stats' ? (
          <div className="board-area">
            <FreelanceStatsScreen />
          </div>
        ) : view === 'archival' ? (
          <div className="board-area">
            <CloudArchivalScreen
              jobs={studio.freelanceJobs}
              onRefresh={refresh}
            />
          </div>
        ) : view === 'team' ? (
          <div className="board-area">
            {studio.activeView === 'freelanceEditor' && studio.selectedFreelanceEditorId ? (
              <FreelanceEditorView />
            ) : (
              <PostProductionTeamScreen onOpenEditor={(id) => {
                studio.setSelectedFreelanceEditorId(id);
                studio.setActiveView('freelanceEditor');
              }} />
            )}
          </div>
        ) : view === 'utilities' ? (
          <UtilitiesScreen />
        ) : view === 'services' ? (
          <div className="board-area">
            <PostProductionServicesScreen />
          </div>
        ) : view === 'payments' ? (
          <PostProductionPaymentsScreen />
        ) : view === 'client-tools' ? (
          <ClientToolsScreen />
        ) : view === 'gallery-uploader' ? (
          <div className="board-area min-h-screen bg-[var(--paper)]">
            <GalleryUploaderScreen />
          </div>
        ) : (
          <div className="screen">
            <header><div><span className="eyebrow">SETTINGS</span><h2>Uploader settings</h2>
              <p>The Google Drive, Dropbox, and measurement defaults this Mac uploads with.</p></div></header>
            <UploaderSettings drive={drive ?? undefined} refresh={refresh} />
          </div>
        )}
        <GoogleDriveRequiredModal
          isOpen={showDriveModal}
          onClose={() => {
            setShowDriveModal(false);
            setPendingScanTarget(null);
          }}
          onConnected={async () => {
            await refresh();
            if (pendingScanTarget) {
              const target = pendingScanTarget;
              setPendingScanTarget(null);
              const options = {
                excludedBillingFolders: studio.studioSettings?.uploader?.excludedBillingFolders ?? ['Proxies', 'Proxy'],
                countPhotoPairsOnce: studio.studioSettings?.uploader?.countPhotoPairsOnce ?? true,
              };
              opened(await window.api.scan(options, target));
            }
          }}
        />
      </main>
    </div>
  );
}

export function Dashboard(): React.JSX.Element {
  const studio = useApp();
  if (studio.currentUser.accountType === 'team') {
    return <EditorDashboard />;
  }
  return <OwnerDashboard />;
}
