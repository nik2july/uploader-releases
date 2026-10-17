import { useEffect, useState } from 'react';
import { Cloud, CheckCircle, AlertTriangle } from 'lucide-react';

export function EditorSettings(): React.JSX.Element {
  const [appKey, setAppKey] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [status, setStatus] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Load existing settings
    window.api.dropboxStatus().then(setStatus);
  }, []);

  async function handleConnect() {
    setBusy(true);
    setMessage('');
    try {
      const res = await window.api.connectDropbox(refreshToken);
      setStatus(res);
      if (res.connected) {
        setMessage('Successfully connected to Dropbox!');
      } else {
        setMessage('Failed to connect: ' + res.error);
      }
    } catch (err: any) {
      setMessage('Error: ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-grid">
      <section className="panel">
        <span className="eyebrow">DROPBOX INTEGRATION</span>
        <h2>Studio Dropbox</h2>
        <p>Connect to the studio's Dropbox account to upload deliverables directly.</p>
        
        {status?.connected ? (
          <p className="success"><CheckCircle size={14} /> Connected as {status.email}</p>
        ) : (
          <p className="notice"><AlertTriangle size={14} /> Not connected to Dropbox</p>
        )}

        <div className="field">
          <label>Dropbox Refresh Token</label>
          <input 
            type="password" 
            value={refreshToken} 
            onChange={e => setRefreshToken(e.target.value)}
            placeholder="Provided by Studio Owner"
          />
        </div>
        
        <div className="actions">
          <button className="primary" disabled={busy || !refreshToken} onClick={handleConnect}>
            {busy ? 'Connecting...' : 'Connect to Dropbox'}
          </button>
        </div>
        {message && <p>{message}</p>}
      </section>
    </div>
  );
}
