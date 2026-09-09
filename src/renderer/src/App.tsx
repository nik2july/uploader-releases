import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './lib/auth';
import { AppProvider } from './context/AppContext';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import './assets/uploader.css';

export default function App() {
  const [owner, setOwner] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let generation = 0;
    const unsubscribe = onAuthStateChanged(auth, async user => {
      const current = ++generation;
      setOwner(''); setError(''); setLoading(true);
      try {
        if (user) {
          const uid = await window.api.authorize(await user.getIdToken());
          if (current === generation) setOwner(uid);
        } else await window.api.signOut();
      } catch (err) { if (current === generation) setError(err instanceof Error ? err.message : 'Studio session verification failed.'); }
      finally { if (current === generation) setLoading(false); }
    });
    return () => { generation++; unsubscribe(); };
  }, [retry]);
  if (loading) return <div className="session-screen"><h1>Baawaray</h1><p>Verifying your studio session…</p></div>;
  if (error) return <div className="session-screen"><h1>Studio connection</h1><p role="alert">{error}</p><div className="actions"><button onClick={() => setRetry(n => n + 1)}>Retry connection</button><button onClick={() => void signOut(auth)}>Sign out</button></div></div>;
  if (!owner) return <Login onLogin={() => {}} />;
  return <AppProvider ownerUid={owner}><Dashboard /></AppProvider>;
}
