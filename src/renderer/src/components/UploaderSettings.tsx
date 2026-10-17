import { useEffect, useState } from 'react';
import type { DriveStatus } from '../../../shared/contracts';
import { useApp } from '../context/AppContext';
import { saveUploaderSettings, saveDropboxSettings } from '../lib/studioRepository';
import { auth } from '../lib/auth';
import { extractDriveFolderId } from '../utils/cloudArchival';
export function UploaderSettings({ drive, refresh }: { drive?: DriveStatus; refresh: () => Promise<void> }) {
  const { studioSettings, currentUser } = useApp();
  const defaults = studioSettings?.uploader;
  const dbxConfig = studioSettings?.dropbox;
  const [dbxKey, setDbxKey] = useState(dbxConfig?.appKey ?? '');
  const [dbxSecret, setDbxSecret] = useState(dbxConfig?.appSecret ?? '');
  const [dbxToken, setDbxToken] = useState(dbxConfig?.refreshToken ?? '');
  const [sharedDriveInput, setSharedDriveInput] = useState(defaults?.sharedDriveLink || defaults?.sharedDriveId || '');
  const [keep, setKeep] = useState(defaults?.keepPercentDefault ?? 20), [sheets, setSheets] = useState(defaults?.photosPerSheet ?? 5);
  const [exclusions, setExclusions] = useState((defaults?.excludedBillingFolders ?? ['Proxies', 'Proxy']).join(', '));
  const [pairs, setPairs] = useState(defaults?.countPhotoPairsOnce ?? true);
  const [awake, setAwake] = useState(defaults?.keepAwake ?? false);
  // Which build this Mac is actually running. The main process is the only
  // thing that knows, and "am I on the new one yet?" is otherwise a trip
  // through the About panel.
  const [version, setVersion] = useState('');
  useEffect(() => { void window.api.appVersion().then(setVersion).catch(() => {}); }, []);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  useEffect(() => {
    if (dbxConfig) {
      if (dbxConfig.appKey) setDbxKey(dbxConfig.appKey);
      if (dbxConfig.appSecret) setDbxSecret(dbxConfig.appSecret);
      if (dbxConfig.refreshToken) setDbxToken(dbxConfig.refreshToken);
    }
  }, [dbxConfig]);
  useEffect(() => {
    if (defaults?.sharedDriveLink || defaults?.sharedDriveId) {
      setSharedDriveInput(defaults.sharedDriveLink || defaults.sharedDriveId || '');
    }
  }, [defaults?.sharedDriveLink, defaults?.sharedDriveId]);

  const activeSharedDriveId = extractDriveFolderId(sharedDriveInput.trim()) || (sharedDriveInput.trim().startsWith('0A') ? sharedDriveInput.trim() : undefined);

  /** The uploader document is written whole, so every save carries the current defaults. */
  function uploaderPayload(overrides: Partial<{ destination?: 'drive'; sharedDriveId?: string; sharedDriveLink?: string }> = {}) {
    const rawInput = sharedDriveInput.trim();
    const driveId = extractDriveFolderId(rawInput) || (rawInput.startsWith('0A') ? rawInput : undefined);
    return {
      keepPercentDefault: keep, photosPerSheet: sheets,
      excludedBillingFolders: exclusions.split(',').map(t => t.trim()).filter(Boolean),
      countPhotoPairsOnce: pairs, keepAwake: awake, destination: 'drive' as const,
      sharedDriveId: driveId || undefined,
      sharedDriveLink: rawInput || undefined,
      ...overrides
    };
  }
  async function run(fn: () => Promise<unknown>, success: string): Promise<void> {
    setBusy(true); setError(''); setMessage('');
    try { await fn(); await refresh(); setMessage(success); } catch (err) { setError(err instanceof Error ? err.message : 'Settings could not be saved.'); } finally { setBusy(false); }
  }
  return (
    <div className="settings-grid">

      <section className="panel">
        <span className="eyebrow">GOOGLE DRIVE STORAGE</span>
        <h2>Google Drive (Raw Footage)</h2>
        <p>
          {drive?.connected
            ? `Connected as ${drive.email}.`
            : 'Connect the Google account that should hold raw footage.'}
        </p>
        <p className="muted">
          Uploads are resumable and checksum-verified file by file, so a dropped connection picks up
          where it stopped rather than starting the folder again. Each finished folder is link-shared
          automatically, and editors download it straight through this app without a Google sign-in.
        </p>
        {drive?.connected ? (
          <p className="success">Google Drive is connected. Select it above to make it the destination.</p>
        ) : drive?.configured === false ? (
          <p className="error">Google Drive sign-in is not set up on the studio website yet.</p>
        ) : (
          <p className="notice">One-time per Mac: sign in with the studio Google account in your browser.</p>
        )}
        {drive?.error && <p className="error">{drive.error}</p>}
        <div style={{ margin: '16px 0', padding: '14px', background: 'rgba(255, 255, 255, 0.04)', borderRadius: 8, border: '1px solid var(--line)' }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 13, color: 'var(--ink)' }}>
            Google Workspace Shared Drive (Shoot Ingest Destination)
          </label>
          <input
            value={sharedDriveInput}
            onChange={e => setSharedDriveInput(e.target.value)}
            placeholder="Paste Shared Drive link or folder ID (e.g. https://drive.google.com/drive/folders/0AB...)"
            style={{ width: '100%', boxSizing: 'border-box', marginBottom: 8 }}
          />
          {activeSharedDriveId ? (
            <p className="success" style={{ margin: '4px 0 8px 0', fontSize: 12 }}>
              Active Shared Drive: <strong>{activeSharedDriveId}</strong> (All raw-footage uploads will route directly here)
            </p>
          ) : (
            <p className="muted" style={{ margin: '4px 0 8px 0', fontSize: 12 }}>
              Paste your Google Workspace Shared Drive link above so raw-footage uploads land inside your team Shared Drive instead of personal My Drive.
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void run(async () => {
                const payload = uploaderPayload();
                await saveUploaderSettings(payload);
                if (payload.sharedDriveId && window.api?.setSharedDriveId) {
                  await window.api.setSharedDriveId(payload.sharedDriveId);
                }
              }, 'Shared Drive settings saved.')}
            >
              {busy ? 'Saving…' : 'Save Shared Drive'}
            </button>
            {activeSharedDriveId && (
              <button
                className="text-button"
                onClick={() => void window.api.openExternal(sharedDriveInput.startsWith('http') ? sharedDriveInput : `https://drive.google.com/drive/folders/${activeSharedDriveId}`)}
              >
                Open Shared Drive
              </button>
            )}
          </div>
        </div>
        <details style={{ margin: '14px 0', fontSize: 13 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--burgundy)' }}>Before you switch: Drive storage and daily limits</summary>
          <ul style={{ paddingLeft: 20, lineHeight: 1.6, margin: '8px 0', color: 'var(--ink)' }}>
            <li>The connected Google account needs enough storage for the raw footage — a free account holds 15 GB, so a Workspace plan with pooled storage is what a wedding shoot needs.</li>
            <li>Google caps uploads at roughly 750 GB per account per day. The queue notices the cap, waits, and continues by itself — an over-cap folder simply finishes the next day.</li>
            <li>The app can only see folders and files it creates itself. It never reads the rest of that Drive.</li>
          </ul>
        </details>
        <div className="actions">
          <button className="primary" disabled={busy} onClick={() => void run(async () => {
            const user = auth.currentUser;
            if (!user) throw new Error('Sign in to the studio first.');
            await window.api.connectDrive(await user.getIdToken());
          }, 'Google Drive connected.')}>{busy ? 'Connecting…' : drive?.connected ? 'Reconnect Google Drive' : 'Connect Google Drive'}</button>
          <button className="text-button" onClick={() => void window.api.openExternal('https://drive.google.com/drive/my-drive')}>Open Google Drive</button>
          {drive?.connected && <button disabled={busy} onClick={() => void run(async () => {
            await window.api.disconnectDrive();
          }, 'Google Drive disconnected. Uploads in progress were paused.')}>Disconnect</button>}
        </div>
      </section>

      <section className="panel"><span className="eyebrow">DROPBOX DELIVERABLES</span><h2>Studio Dropbox (2TB)</h2>
    <p>{dbxConfig?.refreshToken ? 'Studio Dropbox is connected and active.' : 'Connect your Studio 2TB Dropbox account.'}</p>
    <p className="muted">Your video editors will upload final deliverables directly to your 2TB Dropbox. They do not need their own storage—all video deliverables route securely to this studio account, overwriting previous cuts and keeping version history automatically.</p>
    {dbxConfig?.refreshToken ? (
      <p className="success">Connected to Studio Dropbox. Editors can now deliver video projects directly.</p>
    ) : (
      <p className="notice">One-time studio setup: Enter your Dropbox App credentials or Refresh Token.</p>
    )}
    <details style={{ margin: '14px 0', fontSize: 13 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--burgundy)' }}>Step-by-step: How to connect your Dropbox in 2 minutes</summary>
      <ol style={{ paddingLeft: 20, lineHeight: 1.6, margin: '8px 0', color: 'var(--ink)' }}>
        <li>Click <strong>Open Dropbox App Console</strong> below (or visit <code>dropbox.com/developers/apps</code>).</li>
        <li>Click <strong>Create app</strong>, choose <strong>Scoped access</strong>, and select <strong>Full Dropbox</strong>.</li>
        <li>Name your app (e.g. <code>Baawaray Studio Storage</code>) and click <strong>Create app</strong>.</li>
        <li>Go to the <strong>Permissions</strong> tab, check <code>files.content.write</code>, <code>files.content.read</code>, and <code>sharing.write</code>, then click <strong>Submit</strong>.</li>
        <li>Go to the <strong>Settings</strong> tab, copy your <strong>App key</strong> and <strong>App secret</strong> and paste them below.</li>
        <li>Under the <strong>OAuth 2</strong> section on the Settings tab, click <strong>Generate</strong> next to <em>Generated access token</em> (or generate a refresh token) and paste it below.</li>
        <li>Click <strong>Connect Studio Dropbox</strong>. Done!</li>
      </ol>
    </details>
    <div className="field-row">
      <label>Dropbox App Key<input value={dbxKey} onChange={e => setDbxKey(e.target.value)} placeholder="App Key" autoComplete="off"/></label>
      <label>Dropbox App Secret<input type="password" value={dbxSecret} onChange={e => setDbxSecret(e.target.value)} placeholder="App Secret" autoComplete="new-password"/></label>
    </div>
    <label>Dropbox Refresh Token / Access Token<input type="password" value={dbxToken} onChange={e => setDbxToken(e.target.value)} placeholder="Paste token generated from Dropbox Developers App Console" autoComplete="new-password"/></label>
    <div className="actions">
      <button className="primary" disabled={busy || (!dbxToken && !dbxKey)} onClick={() => void run(async () => {
        const payload = { appKey: dbxKey.trim(), appSecret: dbxSecret.trim(), refreshToken: dbxToken.trim() };
        await saveDropboxSettings(payload);
        await window.api.connectDropbox(payload);
      }, 'Studio Dropbox credentials saved. Editors can now upload directly.')}>{busy ? 'Saving…' : dbxConfig?.refreshToken ? 'Update Dropbox Connection' : 'Connect Studio Dropbox'}</button>
      <button className="text-button" onClick={() => void window.api.openExternal('https://www.dropbox.com/developers/apps')}>Open Dropbox App Console</button>
      {dbxConfig?.refreshToken && <button disabled={busy} onClick={() => void run(async () => {
        await saveDropboxSettings({});
        await window.api.disconnectDropbox();
        setDbxToken('');
      }, 'Studio Dropbox disconnected.')}>Disconnect</button>}
    </div>
  </section><section className="panel"><span className="eyebrow">SHARED STUDIO DEFAULTS</span><h2>Measurements & billing</h2>
    <div className="field-row"><label>Default keep percentage<input type="number" min="0" max="100" value={keep} onChange={e => setKeep(Number(e.target.value))}/></label><label>Photos per album sheet<input type="number" min="1" max="100" value={sheets} onChange={e => setSheets(Number(e.target.value))}/></label></div>
    <label>Folder names excluded from billing<input value={exclusions} onChange={e => setExclusions(e.target.value)} placeholder="Proxies, Exports"/></label>
    <label className="check-label"><input type="checkbox" checked={pairs} onChange={e => setPairs(e.target.checked)}/>Count matching RAW + JPEG pairs as one photo</label>
    <label className="check-label"><input type="checkbox" checked={awake} onChange={e => setAwake(e.target.checked)}/>Keep this Mac awake while uploading</label>
    <p className="muted">Transfers already stop the Mac suspending them. Turn this on as well if your Mac is set to sleep quickly and you want the screen kept on too. Uploads pause on sleep and resume on waking either way.</p>
    <p className="muted">All these files still upload. Only measurement totals change. The invoice records the policy used. Album sheets round up; selected photos round to the nearest whole photo.</p>
    <button disabled={busy} className="primary" onClick={() => void run(() => saveUploaderSettings(uploaderPayload()), 'Defaults saved to your shared studio settings.')}>Save shared defaults</button>
    <hr/><p>App version: {version || '—'}<br/>Studio: {studioSettings?.studioName || 'Baawaray'}<br/>Currency: {studioSettings?.currency || 'INR'}<br/>Configured tax: {studioSettings?.taxGstPercent || 0}%</p>
    <p className="muted">Partner rates, deliverable prices and editor details are read from your existing web settings. Time billing keeps the one-minute / one-hour minimum.</p>
    <button onClick={() => void window.api.openExternal('https://app.baawaray.com')}>Open studio web app</button>
    <hr/>
    <p className="muted">If something will not connect, copy this and send it. It records what the app
      did and where it stopped, and contains no passwords or tokens.</p>
    <button onClick={() => void window.api.diagnostics().then(text => {
      void navigator.clipboard.writeText(text); setMessage('Diagnostics copied. Paste them into a message.');
    })}>Copy diagnostics</button>
  </section>
      {message && <p className="success" role="status">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
