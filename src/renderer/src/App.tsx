import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, onIdTokenChanged, signOut } from 'firebase/auth';
import { LogIn, PanelLeftClose, PanelLeftOpen, Upload, Wrench } from 'lucide-react';
import { auth } from './lib/auth';
import { AppProvider } from './context/AppContext';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { UtilitiesScreen } from './components/screens/utilities/UtilitiesScreen';
import { UploadsScreen } from './components/screens/UploadsScreen';
import { TransferDetail } from './components/screens/TransferDetail';
import type { Transfer } from '../../shared/contracts';
import longLogo from './assets/baawaray-long.svg';
import './assets/uploader.css';

type GuestTab = 'uploads' | 'utilities' | 'login';

export default function App() {
  const [session, setSession] = useState<{ uid: string; isOwner: boolean } | null>(() => {
    try {
      const saved = localStorage.getItem('baawaray_cached_session');
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [guestTab, setGuestTab] = useState<GuestTab>(() => {
    try {
      const saved = localStorage.getItem('baawaray_guest_tab') as GuestTab;
      if (saved === 'uploads' || saved === 'utilities' || saved === 'login') return saved;
    } catch {}
    return 'uploads';
  });

  const [guestJobs, setGuestJobs] = useState<Transfer[]>([]);
  const [guestOpenJobId, setGuestOpenJobId] = useState<string | null>(null);

  const refreshGuestTransfers = useCallback(async () => {
    try {
      const list = await window.api.list();
      setGuestJobs(list);
    } catch {}
  }, []);

  useEffect(() => {
    if (session) return;
    void refreshGuestTransfers();
    return window.api.onChange(() => {
      void refreshGuestTransfers();
    });
  }, [session, refreshGuestTransfers]);

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('baawaray_sidebar_open') !== 'false';
    } catch {
      return true;
    }
  });

  const toggleSidebar = (): void => {
    setSidebarOpen(prev => {
      const next = !prev;
      try {
        localStorage.setItem('baawaray_sidebar_open', String(next));
      } catch {}
      return next;
    });
  };

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

  useEffect(() => {
    try {
      localStorage.setItem('baawaray_guest_tab', guestTab);
    } catch {}
  }, [guestTab]);

  useEffect(() => {
    let generation = 0;
    const unsubscribe = onAuthStateChanged(auth, async user => {
      const current = ++generation;
      if (!user) {
        if (current === generation) {
          setSession(null);
          try {
            localStorage.removeItem('baawaray_cached_session');
          } catch {}
          setLoading(false);
        }
        await window.api.signOut().catch(() => {});
        return;
      }

      if (!session) setLoading(true);
      setError('');

      try {
        const idToken = await user.getIdToken();
        const authRes = await window.api.authorize(idToken);
        if (current === generation) {
          setSession(authRes);
          try {
            localStorage.setItem('baawaray_cached_session', JSON.stringify(authRes));
          } catch {}
        }
      } catch (err) {
        console.warn('[App] Session authorization note:', err);
        if (current === generation) {
          setSession(prev => {
            if (prev) return prev;
            setError(err instanceof Error ? err.message : 'Studio session verification failed.');
            return null;
          });
        }
      } finally {
        if (current === generation) setLoading(false);
      }
    });

    const unsubscribeToken = onIdTokenChanged(auth, async user => {
      if (user) {
        try {
          const idToken = await user.getIdToken();
          const authRes = await window.api.authorize(idToken);
          setSession(authRes);
          try {
            localStorage.setItem('baawaray_cached_session', JSON.stringify(authRes));
          } catch {}
        } catch (err) {
          console.warn('[App] Token auto-refresh background note:', err);
        }
      }
    });

    return () => {
      generation++;
      unsubscribe();
      unsubscribeToken();
    };
  }, [retry]);

  if (loading && !session) {
    return (
      <div className="session-screen">
        <h1 className="brand-title font-tan-aegean">BAAWARAY</h1>
        <p>Verifying your studio session…</p>
        <div className="actions" style={{ marginTop: 16 }}>
          <button onClick={() => { setLoading(false); setGuestTab('uploads'); }}>
            Open Uploader &amp; Utilities Without Waiting
          </button>
        </div>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="session-screen">
        <h1>Studio connection</h1>
        <p role="alert">{error}</p>
        <div className="actions">
          <button onClick={() => setRetry(n => n + 1)}>Retry connection</button>
          <button onClick={() => { setError(''); setGuestTab('uploads'); }}>
            Work Standalone / Open Uploader &amp; Utilities
          </button>
          <button onClick={() => void signOut(auth)}>Sign out</button>
        </div>
      </div>
    );
  }

  if (!session) {
    const activeGuestCount = guestJobs.filter(j =>
      ['scanning', 'queued', 'uploading', 'verifying', 'waiting_network', 'waiting_quota'].includes(j.status)
    ).length;
    const openGuestJob = guestJobs.find(j => j.id === guestOpenJobId) || null;

    return (
      <div className={`app-shell ${!sidebarOpen ? 'sidebar-collapsed' : ''}`}>
        {sidebarOpen && (
          <nav className="sidebar">
            <div className="wordmark">
              <img src={longLogo} alt="Baawaray Films" />
            </div>
            <div className="who">
              <span>Google Drive &amp; Local Tools</span>
            </div>
            <div className="flex items-center justify-between px-2.5 py-1 mb-1">
              <span className="text-[10px] tracking-wider uppercase text-[var(--muted)] font-semibold">Tools</span>
              <button
                type="button"
                onClick={toggleSidebar}
                className="text-[var(--muted)] hover:text-[var(--ink)] p-0.5 rounded cursor-pointer"
                title="Close sidebar (⌘B)"
              >
                <PanelLeftClose size={16} />
              </button>
            </div>
            <button
              className="nav-item"
              aria-current={guestTab === 'uploads'}
              onClick={() => { setGuestTab('uploads'); setGuestOpenJobId(null); }}
            >
              <Upload size={16} /> Up Down Queue
              {activeGuestCount > 0 ? <span className="badge">{activeGuestCount}</span> : null}
            </button>
            <button
              className="nav-item"
              aria-current={guestTab === 'utilities'}
              onClick={() => { setGuestTab('utilities'); setGuestOpenJobId(null); }}
            >
              <Wrench size={16} /> Utilities
            </button>
            <div className="spacer" />
            <div className="p-2 mb-2 bg-[var(--paper)] rounded-xl border border-[var(--line)] text-xs text-[var(--muted)]">
              <p className="font-semibold text-[var(--ink)] mb-0.5">Gallery Uploader Restricted</p>
              <p className="text-[11px] leading-tight">Sign in with your Studio account below to access Gallery Uploader &amp; Studio OS.</p>
            </div>
            <button
              className="nav-item bg-[color-mix(in_srgb,var(--burgundy)_10%,transparent)] font-semibold text-[var(--burgundy)] hover:bg-[color-mix(in_srgb,var(--burgundy)_18%,transparent)]"
              aria-current={guestTab === 'login'}
              onClick={() => setGuestTab('login')}
            >
              <LogIn size={16} /> Studio Sign In
            </button>
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
                Uploader &amp; Utilities • Press ⌘B to expand sidebar
              </div>
            </div>
          )}
          {guestTab === 'uploads' ? (
            openGuestJob ? (
              <TransferDetail
                job={openGuestJob}
                onBack={() => setGuestOpenJobId(null)}
                refresh={refreshGuestTransfers}
              />
            ) : (
              <UploadsScreen
                jobs={guestJobs}
                onOpen={id => setGuestOpenJobId(id)}
                refresh={refreshGuestTransfers}
              />
            )
          ) : guestTab === 'utilities' ? (
            <UtilitiesScreen />
          ) : (
            <Login
              onLogin={() => {}}
              onContinueToUtilities={() => setGuestTab('uploads')}
            />
          )}
        </main>
      </div>
    );
  }

  return (
    <AppProvider uid={session.uid} isOwner={session.isOwner}>
      <Dashboard />
    </AppProvider>
  );
}
