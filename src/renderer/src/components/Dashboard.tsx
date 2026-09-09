import { useEffect, useMemo, useState } from 'react';
import { signOut } from 'firebase/auth';
import { Cloud, CloudOff, Film, Settings, Upload, Users } from 'lucide-react';
import { auth } from '../lib/auth';
import { useApp } from '../context/AppContext';
import { loadUploaderOAuth } from '../lib/studioRepository';
import { useTransfers } from '../hooks/useTransfers';
import { ACTIVE_STATUSES } from '../utils/uploadFormat';
import { UploadsScreen } from './screens/UploadsScreen';
import { WorkScreen } from './screens/WorkScreen';
import { TransferDetail } from './screens/TransferDetail';
import { UploaderSettings } from './UploaderSettings';
import { UpdateBanner } from './UpdateBanner';

type View = 'uploads' | 'freelance' | 'deliverables' | 'settings';

export function Dashboard(): React.JSX.Element {
  const studio = useApp();
  const { transfers, drive, error, loading, refresh } = useTransfers();
  const [view, setView] = useState<View>('uploads');
  const [openId, setOpenId] = useState<string | null>(null);

  // The keep-awake preference is stored with the studio's shared settings but
  // enforced by the queue, so it is pushed down whenever it changes.
  const keepAwake = studio.studioSettings?.uploader?.keepAwake;
  useEffect(() => { void window.api.setKeepAwake(Boolean(keepAwake)); }, [keepAwake]);

  /**
   * A Mac that has never been set up collects the studio's Google client from
   * Firestore rather than waiting for someone to be sent it. Only the studio
   * owner can read it, and it is written to this Mac's encrypted store, never
   * shown. Connecting Drive is still done by the person sitting here.
   */
  const configured = drive?.configured;
  useEffect(() => {
    if (configured !== false) return;
    let cancelled = false;
    void loadUploaderOAuth().then(async saved => {
      if (cancelled || !saved) return;
      try { await window.api.configureDrive(saved.clientId, saved.clientSecret); await refresh(); }
      catch { /* the settings screen still takes it by hand */ }
    });
    return () => { cancelled = true; };
  }, [configured, refresh]);

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
        <div className="wordmark">Baawaray</div>
        <div className="who">{studio.currentUser.name}</div>
        <button className="nav-item" aria-current={view === 'uploads' && !openId} onClick={() => go('uploads')}>
          <Upload size={16} /> Uploads
          {active + attention > 0 && <span className="count">{active + attention}</span>}
        </button>
        <button className="nav-item" aria-current={view === 'freelance'} onClick={() => go('freelance')}>
          <Users size={16} /> Partner studio work
        </button>
        <button className="nav-item" aria-current={view === 'deliverables'} onClick={() => go('deliverables')}>
          <Film size={16} /> Client deliverables
        </button>
        <div className="spacer" />
        <button className="nav-item" aria-current={view === 'settings'} onClick={() => go('settings')}>
          <Settings size={16} /> Settings
        </button>
        <button className="nav-item" onClick={() => { void signOut(auth); }}>Sign out</button>
        <div className="who" style={{ padding: '14px 10px 0' }}>
          {drive?.connected
            ? <><Cloud size={12} /> {drive.email}</>
            : <><CloudOff size={12} /> Drive not connected</>}
        </div>
      </nav>

      <main className="main-area">
        <UpdateBanner />
        {open ? (
          <TransferDetail job={open} onBack={() => setOpenId(null)} refresh={refresh} />
        ) : view === 'uploads' ? (
          <UploadsScreen transfers={transfers} loading={loading} error={error} drive={drive}
            onOpen={setOpenId} onSettings={() => go('settings')} />
        ) : view === 'freelance' || view === 'deliverables' ? (
          <WorkScreen kind={view} transfers={transfers} drive={drive} onScanStarted={opened} onSettings={() => go('settings')} onOpen={setOpenId} />
        ) : (
          <div className="screen">
            <header><div><span className="eyebrow">SETTINGS</span><h2>Uploader settings</h2>
              <p>The Drive account and the measurement defaults this Mac uploads with.</p></div></header>
            {drive && <UploaderSettings drive={drive} refresh={refresh} />}
          </div>
        )}
      </main>
    </div>
  );
}
