import { useEffect, useMemo, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import { Archive, Briefcase, Film, HardDrive, Settings, Upload, Users } from 'lucide-react';
import { auth } from '../lib/auth';
import { useApp } from '../context/AppContext';
import longLogo from '../assets/baawaray-long.svg';
import { useTransfers } from '../hooks/useTransfers';
import { ACTIVE_STATUSES } from '../utils/uploadFormat';
import { attachVerifiedTransfer } from '../lib/studioRepository';
import { UploadsScreen } from './screens/UploadsScreen';
import { WorkScreen } from './screens/WorkScreen';
import { TransferDetail } from './screens/TransferDetail';
import { UploaderSettings } from './UploaderSettings';
import { UpdateBanner } from './UpdateBanner';
import { EditorDashboard } from './EditorDashboard';
import { CloudArchivalModal } from './CloudArchivalModal';
import { PostProductionPaymentsScreen } from './screens/PostProductionPaymentsScreen';
import { PostProductionTeamScreen } from './screens/PostProductionTeamScreen';
import { PartnerStudiosScreen } from './screens/PartnerStudiosScreen';
import { FreelanceDepartmentView } from './freelance/FreelanceDepartmentView';
import { FreelanceStudioView } from './freelance/FreelanceStudioView';
import { FreelanceEditorView } from './freelance/FreelanceEditorView';

type View = 'uploads' | 'freelance' | 'deliverables' | 'partners' | 'team' | 'payments' | 'settings' | 'scanner';

export function OwnerDashboard(): React.JSX.Element {
  const studio = useApp();
  const { transfers, drive, error, loading, refresh } = useTransfers();
  const [view, setView] = useState<View>('uploads');
  const [openId, setOpenId] = useState<string | null>(null);
  const [showArchivalModal, setShowArchivalModal] = useState(false);
  const rawLinkSyncAttempts = useRef(new Set<string>());

  // The keep-awake preference is stored with the studio's shared settings but
  // enforced by the queue, so it is pushed down whenever it changes.
  const keepAwake = studio.studioSettings?.uploader?.keepAwake;
  useEffect(() => { void window.api.setKeepAwake(Boolean(keepAwake)); }, [keepAwake]);

  // Same for the upload destination: stored with the studio, enforced by the queue.
  const destination = studio.studioSettings?.uploader?.destination;
  useEffect(() => {
    void window.api.setUploadDestination(destination === 'drive' ? 'drive' : 'b2');
  }, [destination]);

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

  // A scan is started from a job row; the folder dialog lives in the main
  // process, so the renderer only learns the new transfer's id once a folder was
  // actually chosen. Cancelling the dialog returns null and changes nothing.
  function opened(id: string | null): void {
    if (id) { setOpenId(id); setView('uploads'); }
  }

  function go(next: View): void { setOpenId(null); setView(next); }

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="wordmark"><img src={longLogo} alt="Baawaray" /></div>
        <button className="nav-item" aria-current={view === 'freelance'} onClick={() => { studio.setActiveView('freelance'); go('freelance'); }}>
          <Briefcase size={16} /> Freelance Department
        </button>
        <button className="nav-item" aria-current={view === 'deliverables'} onClick={() => go('deliverables')}>
          <Film size={16} /> Deliverables
        </button>
        <button className="nav-item" aria-current={view === 'uploads' && !openId} onClick={() => go('uploads')}>
          <Upload size={16} /> Upload Queue
          {active + attention > 0 && <span className="count">{active + attention}</span>}
        </button>
        <button className="nav-item" aria-current={view === 'scanner'} onClick={() => go('scanner')}>
          <HardDrive size={16} /> Raw Folder Scanner
        </button>
        <button className="nav-item" aria-current={view === 'payments'} onClick={() => go('payments')}>
          <span style={{ width: 16, textAlign: 'center' }}>₹</span> Payments
        </button>
        <button className="nav-item" onClick={() => setShowArchivalModal(true)}>
          <Archive size={16} /> Cloud Archival
        </button>
        <div className="spacer" />
        <button className="nav-item" aria-current={view === 'settings'} onClick={() => go('settings')}>
          <Settings size={16} /> Settings
        </button>
        <button className="nav-item" onClick={() => { void signOut(auth); }}>Sign out</button>
      </nav>

      <main className="main-area">
        <UpdateBanner />
        {open ? (
          <TransferDetail job={open} onBack={() => setOpenId(null)} refresh={refresh} />
        ) : view === 'uploads' ? (
          <UploadsScreen transfers={transfers} loading={loading} error={error} drive={drive}
            onOpen={setOpenId} onSettings={() => go('settings')} />
        ) : view === 'freelance' ? (
          studio.activeView === 'freelanceStudio' && studio.selectedFreelanceClientId ? (
            <FreelanceStudioView />
          ) : studio.activeView === 'freelanceEditor' && studio.selectedFreelanceEditorId ? (
            <FreelanceEditorView />
          ) : (
            <FreelanceDepartmentView />
          )
        ) : view === 'scanner' || view === 'deliverables' ? (
          <WorkScreen kind={view === 'scanner' ? 'freelance' : view} transfers={transfers} drive={drive} onScanStarted={opened} onSettings={() => go('settings')} onOpen={setOpenId} />
        ) : view === 'team' ? (
          <PostProductionTeamScreen />
        ) : view === 'partners' ? (
          <PartnerStudiosScreen />
        ) : view === 'payments' ? (
          <PostProductionPaymentsScreen />
        ) : (
          <div className="screen">
            <header><div><span className="eyebrow">SETTINGS</span><h2>Uploader settings</h2>
              <p>The Backblaze B2, Dropbox, and measurement defaults this Mac uploads with.</p></div></header>
            <UploaderSettings drive={drive ?? undefined} refresh={refresh} />
          </div>
        )}
      </main>

      {showArchivalModal && (
        <CloudArchivalModal
          jobs={studio.freelanceJobs}
          onClose={() => setShowArchivalModal(false)}
        />
      )}
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
