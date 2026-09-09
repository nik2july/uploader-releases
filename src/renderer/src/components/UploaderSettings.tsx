import { useEffect, useState } from 'react';
import type { DriveStatus } from '../../../shared/contracts';
import { useApp } from '../context/AppContext';
import { saveUploaderSettings, saveUploaderOAuth } from '../lib/studioRepository';
import { auth } from '../lib/auth';
export function UploaderSettings({ drive, refresh }: { drive: DriveStatus; refresh: () => Promise<void> }) {
  const { studioSettings, currentUser } = useApp();
  const defaults = studioSettings?.uploader;
  const [clientId, setClientId] = useState(drive.clientId), [secret, setSecret] = useState('');
  const [keep, setKeep] = useState(defaults?.keepPercentDefault ?? 20), [sheets, setSheets] = useState(defaults?.photosPerSheet ?? 5);
  const [exclusions, setExclusions] = useState((defaults?.excludedBillingFolders ?? ['Proxies', 'Proxy']).join(', '));
  const [pairs, setPairs] = useState(defaults?.countPhotoPairsOnce ?? true);
  const [awake, setAwake] = useState(defaults?.keepAwake ?? false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  useEffect(() => { if (drive.clientId) setClientId(drive.clientId); }, [drive.clientId]);
  async function run(fn: () => Promise<unknown>, success: string): Promise<void> {
    setBusy(true); setError(''); setMessage('');
    try { await fn(); await refresh(); setMessage(success); } catch (err) { setError(err instanceof Error ? err.message : 'Settings could not be saved.'); } finally { setBusy(false); }
  }
  return <div className="settings-grid"><section className="panel"><span className="eyebrow">GOOGLE DRIVE</span><h2>Your Google Drive</h2>
    <p>{drive.connected ? `Connected as ${drive.email}` : 'Connect the Drive account that should own your uploads.'}</p>
    <p className="muted">Sign in with your own Google account. The studio configures the app once; you never need to enter or receive its OAuth credentials. Your personal Drive connection is encrypted on this Mac, and your files upload directly to Google.</p>
    {drive.configured && <p className="success">Studio Google sign-in is ready.</p>}
    {drive.error && <p className="warning" role="status">{drive.error}</p>}
    {!drive.configured && !drive.error && <p className="notice">The studio administrator needs to complete the one-time Google setup.</p>}
    <div className="actions"><button className="primary" disabled={busy || !drive.configured} onClick={() => void run(async () => {
      if (!auth.currentUser) throw new Error('Sign in to the studio first.');
      await window.api.connectDrive(await auth.currentUser.getIdToken());
    }, 'Your Google Drive is connected. This Mac will remember it.')}>{busy ? 'Working…' : drive.connected ? 'Reconnect / change Google account' : 'Connect Google Drive'}</button>
    <button disabled={busy} onClick={() => void run(() => window.api.refreshDriveConfiguration(), 'Studio connection settings refreshed.')}>Refresh connection settings</button>
    {drive.connected && <button disabled={busy} onClick={() => void run(() => window.api.disconnectDrive(), 'Disconnected on this Mac. Uploads are paused.')}>Disconnect</button>}</div>
    <p className="muted">Google access renews automatically while you use the app. If you revoke access or Google expires the grant, reconnect here; the upload journal stays intact.</p>
    {currentUser.accountType === 'owner' && <details style={{ marginTop: 20 }}><summary>Administrator setup · once for the app</summary>
      <p className="muted">Your saved studio OAuth client is reused by the web backend. The secret is never downloaded to partner or editor Macs. Changing the client requires users to reconnect.</p>
      <label>Desktop OAuth client ID<input value={clientId} onChange={e => setClientId(e.target.value)} placeholder="….apps.googleusercontent.com" autoComplete="off"/></label>
      <label>Client secret<input type="password" value={secret} onChange={e => setSecret(e.target.value)} autoComplete="new-password" placeholder="Leave blank to keep the existing server-side secret"/></label>
      <div className="actions"><button disabled={busy || !clientId} onClick={() => void run(async () => { await saveUploaderOAuth(clientId, secret); setSecret(''); await window.api.refreshDriveConfiguration(); }, 'Studio OAuth setup saved. Users only need Connect Google Drive.')}>Save studio setup</button>
      <button className="text-button" onClick={() => void window.api.openExternal('https://console.cloud.google.com/apis/credentials')}>Open Google credentials</button></div>
    </details>}
  </section><section className="panel"><span className="eyebrow">SHARED STUDIO DEFAULTS</span><h2>Measurements & billing</h2>
    <div className="field-row"><label>Default keep percentage<input type="number" min="0" max="100" value={keep} onChange={e => setKeep(Number(e.target.value))}/></label><label>Photos per album sheet<input type="number" min="1" max="100" value={sheets} onChange={e => setSheets(Number(e.target.value))}/></label></div>
    <label>Folder names excluded from billing<input value={exclusions} onChange={e => setExclusions(e.target.value)} placeholder="Proxies, Exports"/></label>
    <label className="check-label"><input type="checkbox" checked={pairs} onChange={e => setPairs(e.target.checked)}/>Count matching RAW + JPEG pairs as one photo</label>
    <label className="check-label"><input type="checkbox" checked={awake} onChange={e => setAwake(e.target.checked)}/>Keep this Mac awake while uploading</label>
    <p className="muted">Transfers already stop the Mac suspending them. Turn this on as well if your Mac is set to sleep quickly and you want the screen kept on too. Uploads pause on sleep and resume on waking either way.</p>
    <p className="muted">All these files still upload. Only measurement totals change. The invoice records the policy used. Album sheets round up; selected photos round to the nearest whole photo.</p>
    <button disabled={busy} className="primary" onClick={() => void run(() => saveUploaderSettings({ keepPercentDefault: keep, photosPerSheet: sheets, excludedBillingFolders: exclusions.split(',').map(s => s.trim()).filter(Boolean), countPhotoPairsOnce: pairs, keepAwake: awake }), 'Defaults saved to your shared studio settings.')}>Save shared defaults</button>
    <hr/><p>Studio: {studioSettings?.studioName || 'Baawaray'}<br/>Currency: {studioSettings?.currency || 'INR'}<br/>Configured tax: {studioSettings?.taxGstPercent || 0}%</p>
    <p className="muted">Partner rates, deliverable prices and editor details are read from your existing web settings. Time billing keeps the one-minute / one-hour minimum.</p>
    <button onClick={() => void window.api.openExternal('https://app.baawaray.com')}>Open studio web app</button>
    <hr/>
    <p className="muted">If something will not connect, copy this and send it. It records what the app
      did and where it stopped, and contains no passwords or tokens.</p>
    <button onClick={() => void window.api.diagnostics().then(text => {
      void navigator.clipboard.writeText(text); setMessage('Diagnostics copied. Paste them into a message.');
    })}>Copy diagnostics</button>
  </section>{message && <p className="success" role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}</div>;
}
