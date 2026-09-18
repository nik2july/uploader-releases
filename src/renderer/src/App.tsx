import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './lib/auth';
import { AppProvider } from './context/AppContext';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import './assets/uploader.css';

export default function App() {
  const [session, setSession] = useState<{uid: string, isOwner: boolean} | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let generation = 0;
    const unsubscribe = onAuthStateChanged(auth, async user => {
      const current = ++generation;
      setSession(null); setError(''); setLoading(true);
      try {
        if (user) {
          const authRes = await window.api.authorize(await user.getIdToken());
          if (current === generation) setSession(authRes);
        } else await window.api.signOut();
      } catch (err) { if (current === generation) setError(err instanceof Error ? err.message : 'Studio session verification failed.'); }
      finally { if (current === generation) setLoading(false); }
    });
    return () => { generation++; unsubscribe(); };
  }, [retry]);
  if (loading) return <div className="session-screen"><h1 className="brand-title font-tan-aegean">BAAWARAY</h1><p>Verifying your studio session…</p></div>;
  if (error) return <div className="session-screen"><h1>Studio connection</h1><p role="alert">{error}</p><div className="actions"><button onClick={() => setRetry(n => n + 1)}>Retry connection</button><button onClick={() => void signOut(auth)}>Sign out</button></div></div>;
  if (!session) return <Login onLogin={() => {}} />;
  return <AppProvider uid={session.uid} isOwner={session.isOwner}><Dashboard /></AppProvider>;
}
