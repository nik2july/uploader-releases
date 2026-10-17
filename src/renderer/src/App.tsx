import { useEffect, useState } from 'react';
import { onAuthStateChanged, onIdTokenChanged, signOut } from 'firebase/auth';
import { Film, LogIn, PanelLeftClose, PanelLeftOpen, Wrench } from 'lucide-react';
import { auth } from './lib/auth';
import { AppProvider } from './context/AppContext';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { UtilitiesScreen } from './components/screens/utilities/UtilitiesScreen';
import { GalleryUploaderScreen } from './components/screens/GalleryUploaderScreen';
import longLogo from './assets/baawaray-long.svg';
import './assets/uploader.css';

type GuestTab = 'utilities' | 'gallery-uploader' | 'login';

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
      if (saved === 'utilities' || saved === 'gallery-uploader' || saved === 'login') return saved;
    } catch {}
    return 'utilities';
  });

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
          // If we already have a session, preserve it rather than auto-logging out on network blips
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
          <button onClick={() => { setLoading(false); setGuestTab('utilities'); }}>
            Open Utilities Without Waiting
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
          <button onClick={() => { setError(''); setGuestTab('utilities'); }}>
            Work Offline / Open Utilities
          </button>
          <button onClick={() => void signOut(auth)}>Sign out</button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className={`app-shell ${!sidebarOpen ? 'sidebar-collapsed' : ''}`}>
        {sidebarOpen && (
          <nav className="sidebar">
            <div className="wordmark">
              <img src={longLogo} alt="Baawaray Films" />
            </div>
            <div className="who">
              <span>Offline &amp; Studio Tools</span>
            </div>
            <div className="flex items-center justify-between px-2.5 py-1 mb-1">
              <span className="text-[10px] tracking-wider uppercase text-[var(--muted)] font-semibold">Local Tools</span>
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
              aria-current={guestTab === 'utilities'}
              onClick={() => setGuestTab('utilities')}
            >
              <Wrench size={16} /> Utilities
            </button>
            <button
              className="nav-item"
              aria-current={guestTab === 'gallery-uploader'}
              onClick={() => setGuestTab('gallery-uploader')}
            >
              <Film size={16} /> Gallery Uploader
            </button>
            <div className="spacer" />
            <div className="p-2 mb-2 bg-[var(--paper)] rounded-xl border border-[var(--line)] text-xs text-[var(--muted)]">
              <p className="font-semibold text-[var(--ink)] mb-0.5">Standalone Mode</p>
              <p className="text-[11px] leading-tight">These tools work completely offline without studio login.</p>
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
            <button
              type="button"
              onClick={toggleSidebar}
              className="fixed top-3 left-3 z-40 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#141310]/95 hover:bg-[#201D17] border border-[#E8A317]/50 text-[#FBFAF7] text-xs font-semibold shadow-2xl backdrop-blur-md transition-all hover:scale-105 active:scale-95 cursor-pointer"
              title="Open sidebar (⌘B)"
            >
              <PanelLeftOpen size={15} className="text-[#E8A317]" />
              <span>Sidebar</span>
            </button>
          )}
          {guestTab === 'utilities' ? (
            <UtilitiesScreen />
          ) : guestTab === 'gallery-uploader' ? (
            <div className="board-area min-h-screen bg-[var(--paper)]">
              <GalleryUploaderScreen />
            </div>
          ) : (
            <Login
              onLogin={() => {}}
              onContinueToUtilities={() => setGuestTab('utilities')}
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
