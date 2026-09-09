import { useEffect, useState } from 'react';
import type { DriveStatus } from '../../../shared/contracts';
import { useApp } from '../context/AppContext';
import { saveUploaderSettings, saveUploaderOAuth, loadUploaderOAuth } from '../lib/studioRepository';
export function UploaderSettings({ drive, refresh }: { drive: DriveStatus; refresh: () => Promise<void> }) {
  const { studioSettings } = useApp();
  const defaults = studioSettings?.uploader;
  const [clientId, setClientId] = useState(drive.clientId), [secret, setSecret] = useState('');
  const [keep, setKeep] = useState(defaults?.keepPercentDefault ?? 20), [sheets, setSheets] = useState(defaults?.photosPerSheet ?? 5);
  const [exclusions, setExclusions] = useState((defaults?.excludedBillingFolders ?? ['Proxies', 'Proxy']).join(', '));
  const [pairs, setPairs] = useState(defaults?.countPhotoPairsOnce ?? true);
  const [awake, setAwake] = useState(defaults?.keepAwake ?? false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  // Whether the studio copy exists at all. Without this the sharing is
  // invisible: there is no way to tell "every Mac will get this" from "this one
  // knows it and no other ever will".
  const [shared, setShared] = useState<boolean | null>(null);
  useEffect(() => { void loadUploaderOAuth().then(found => setShared(Boolean(found))); }, [message]);
  async function run(fn: () => Promise<unknown>, success: string): Promise<void> {
    setBusy(true); setError(''); setMessage('');
    try { await fn(); await refresh(); setMessage(success); } catch (err) { setError(err instanceof Error ? err.message : 'Settings could not be saved.'); } finally { setBusy(false); }
  }
  return <div className="settings-grid"><section className="panel"><span className="eyebrow">GOOGLE DRIVE</span><h2>One secure connection</h2>
    <p>{drive.connected ? `Connected as ${drive.email}` : 'Connect the Drive account that should own your uploads.'}</p>
    <p className="muted">Use a Google OAuth client of type Desktop app with the Drive API enabled. Enter it once: it is stored where only the studio owner can read it, so any other Mac signing in picks it up by itself and nobody has to be sent the secret. On each Mac it is then kept encrypted locally. Access is limited to files this app creates.</p>
    {shared === true && <p className="success" style={{ marginTop: 0 }}>Shared with your other Macs. A new one signing in will configure itself.</p>}
    {shared === false && <p className="warning" style={{ marginTop: 0 }}>Not shared yet — every Mac will keep asking for these until you save them once here. Saving stores the client for the studio, readable only by you.</p>}
    <label>Desktop OAuth client ID<input value={clientId} onChange={e => setClientId(e.target.value)} placeholder="….apps.googleusercontent.com" autoComplete="off"/></label>
    <label>Client secret, if supplied by Google<input type="password" value={secret} onChange={e => setSecret(e.target.value)} autoComplete="new-password" placeholder="Stored securely; never sent to the web app"/></label>
    <div className="actions"><button disabled={busy || !clientId} onClick={() => void run(async () => { await window.api.configureDrive(clientId, secret); await saveUploaderOAuth(clientId, secret); setSecret(''); }, 'Saved on this Mac and shared with your other Macs. Connect Google Drive next.')}>Save OAuth client</button><button className="primary" disabled={busy || !drive.configured} onClick={() => void run(() => window.api.connectDrive(), 'Google Drive connected.')}>{busy ? 'Working…' : 'Connect Google Drive'}</button></div>
    <div className="actions"><button className="text-button" onClick={() => void window.api.openExternal('https://console.cloud.google.com/apis/credentials')}>Open Google credentials</button>{drive.connected && <button disabled={busy} onClick={() => void run(() => window.api.disconnectDrive(), 'Disconnected on this Mac. Uploads are paused.')}>Disconnect</button>}</div>
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
  </section>{message && <p className="success" role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}</div>;
}
