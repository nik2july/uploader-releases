import { useEffect, useState } from 'react';
import type { B2Status, DriveStatus } from '../../../shared/contracts';
import { useApp } from '../context/AppContext';
import { saveUploaderSettings, saveDropboxSettings, saveB2Settings } from '../lib/studioRepository';
import { auth } from '../lib/auth';
export function UploaderSettings({ drive, refresh }: { drive?: DriveStatus; refresh: () => Promise<void> }) {
  const { studioSettings, currentUser } = useApp();
  const defaults = studioSettings?.uploader;
  const dbxConfig = studioSettings?.dropbox;
  const b2Config = studioSettings?.b2;
  const [dbxKey, setDbxKey] = useState(dbxConfig?.appKey ?? '');
  const [dbxSecret, setDbxSecret] = useState(dbxConfig?.appSecret ?? '');
  const [dbxToken, setDbxToken] = useState(dbxConfig?.refreshToken ?? '');
  const [b2KeyId, setB2KeyId] = useState(b2Config?.keyId ?? '');
  const [b2AppKey, setB2AppKey] = useState(b2Config?.applicationKey ?? '');
  const [b2BucketName, setB2BucketName] = useState(b2Config?.bucketName ?? '');
  const [b2Endpoint, setB2Endpoint] = useState(b2Config?.endpoint ?? '');
  const [b2Status, setB2Status] = useState<B2Status | null>(null);
  const [keep, setKeep] = useState(defaults?.keepPercentDefault ?? 20), [sheets, setSheets] = useState(defaults?.photosPerSheet ?? 5);
  const [exclusions, setExclusions] = useState((defaults?.excludedBillingFolders ?? ['Proxies', 'Proxy']).join(', '));
  const [pairs, setPairs] = useState(defaults?.countPhotoPairsOnce ?? true);
  const [awake, setAwake] = useState(defaults?.keepAwake ?? false);
  const [dest, setDest] = useState<'drive' | 'b2'>(defaults?.destination ?? 'b2');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  useEffect(() => {
    if (dbxConfig) {
      if (dbxConfig.appKey) setDbxKey(dbxConfig.appKey);
      if (dbxConfig.appSecret) setDbxSecret(dbxConfig.appSecret);
      if (dbxConfig.refreshToken) setDbxToken(dbxConfig.refreshToken);
    }
  }, [dbxConfig]);
  useEffect(() => {
    if (b2Config) {
      if (b2Config.keyId) setB2KeyId(b2Config.keyId);
      if (b2Config.applicationKey) setB2AppKey(b2Config.applicationKey);
      if (b2Config.bucketName) setB2BucketName(b2Config.bucketName);
      if (b2Config.endpoint) setB2Endpoint(b2Config.endpoint);
    }
    if (window.api?.b2Status) {
      void window.api.b2Status().then(setB2Status).catch(() => {});
    }
  }, [b2Config]);
  useEffect(() => { if (defaults?.destination) setDest(defaults.destination); }, [defaults?.destination]);
  /** The uploader document is written whole, so every save carries the current defaults. */
  function uploaderPayload(overrides: Partial<{ destination: 'drive' | 'b2' }> = {}) {
    return {
      keepPercentDefault: keep, photosPerSheet: sheets,
      excludedBillingFolders: exclusions.split(',').map(t => t.trim()).filter(Boolean),
      countPhotoPairsOnce: pairs, keepAwake: awake, destination: dest, ...overrides
    };
  }
  async function run(fn: () => Promise<unknown>, success: string): Promise<void> {
    setBusy(true); setError(''); setMessage('');
    try { await fn(); await refresh(); setMessage(success); } catch (err) { setError(err instanceof Error ? err.message : 'Settings could not be saved.'); } finally { setBusy(false); }
  }
  return (
    <div className="settings-grid">
      <section className="panel">
        <span className="eyebrow">RAW FOOTAGE DESTINATION</span>
        <h2>Where raw footage uploads</h2>
        <p className="muted">
          Every raw-footage transfer from this app goes to the cloud you pick here. Transfers already
          finished keep their existing links and stay downloadable; only new and resumed uploads move.
          Changing this pauses anything currently uploading so nothing is split across two clouds.
        </p>
        <label className="check-label">
          <input type="radio" name="upload-destination" checked={dest === 'drive'} onChange={() => setDest('drive')}/>
          Google Drive {drive?.connected ? `— connected as ${drive.email}` : '— not connected yet'}
        </label>
        <label className="check-label">
          <input type="radio" name="upload-destination" checked={dest === 'b2'} onChange={() => setDest('b2')}/>
          Backblaze B2 {b2Status?.connected || b2Config?.keyId ? `— bucket ${b2Config?.bucketName || b2Status?.bucketName}` : '— not connected yet'}
        </label>
        {dest === 'drive' && !drive?.connected && (
          <p className="notice">Connect a Google account below before starting a transfer.</p>
        )}
        {dest === 'drive' && drive?.connected && (
          <p className="success">New raw-footage uploads will go to Google Drive.</p>
        )}
        <div className="actions">
          <button className="primary" disabled={busy || dest === (defaults?.destination ?? 'b2')} onClick={() => void run(async () => {
            await saveUploaderSettings(uploaderPayload({ destination: dest }));
            await window.api.setUploadDestination(dest);
          }, dest === 'drive' ? 'Raw footage now uploads to Google Drive.' : 'Raw footage now uploads to Backblaze B2.')}>
            {busy ? 'Saving…' : 'Save destination'}
          </button>
        </div>
      </section>

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

      <section className="panel">
        <span className="eyebrow">BACKBLAZE B2 STORAGE</span>
        <h2>Backblaze B2 Cloud Storage (Raw Footage)</h2>
        <p>
          {b2Status?.connected || b2Config?.keyId
            ? `Connected to B2 Bucket "${b2Config?.bucketName || b2Status?.bucketName}".`
            : 'Connect Backblaze B2 for unlimited fast raw footage sharing.'}
        </p>
        <p className="muted">
          Backblaze B2 provides direct, high-speed raw footage downloads. Freelance editors can download raw footage straight through the desktop app without needing any Google sign-in or Backblaze accounts.
        </p>
        {b2Status?.connected ? (
          <p className="success">Backblaze B2 is connected and active. Direct high-speed raw downloads are enabled.</p>
        ) : (
          <p className="notice">One-time studio setup: Enter your Backblaze B2 Application Key ID, Application Key, and Bucket Name.</p>
        )}
        <details style={{ margin: '14px 0', fontSize: 13 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--burgundy)' }}>Step-by-step: How to connect Backblaze B2 in 2 minutes</summary>
          <ol style={{ paddingLeft: 20, lineHeight: 1.6, margin: '8px 0', color: 'var(--ink)' }}>
            <li>Sign in to your Backblaze account at <code>backblaze.com</code>.</li>
            <li>Under <strong>B2 Cloud Storage</strong>, click <strong>Buckets</strong> and copy your bucket name (e.g. <code>baawaray.raw</code>).</li>
            <li>Go to <strong>Application Keys</strong> on the left menu and click <strong>Add a New Application Key</strong>.</li>
            <li>Name your key (e.g. <code>BaawarayStudioApp</code>), select access to your bucket, and ensure <strong>Read and Write</strong> access is enabled.</li>
            <li>Copy the <strong>keyID</strong> and <strong>applicationKey</strong> (shown once upon creation) and paste them below along with your <strong>Bucket Name</strong>.</li>
            <li>Click <strong>Connect Backblaze B2</strong>. The app will verify connection instantly.</li>
          </ol>
        </details>
        <div className="field-row">
          <label>Key ID (keyID)<input value={b2KeyId} onChange={e => setB2KeyId(e.target.value)} placeholder="e.g. 005a1b2c3d4e..." autoComplete="off"/></label>
          <label>Bucket Name<input value={b2BucketName} onChange={e => setB2BucketName(e.target.value)} placeholder="e.g. baawaray.raw (from Buckets page)" autoComplete="off"/></label>
        </div>
        <label>Application Key (applicationKey)<input type="password" value={b2AppKey} onChange={e => setB2AppKey(e.target.value)} placeholder="Paste application key here" autoComplete="new-password"/></label>
        <div className="actions">
          <button className="primary" disabled={busy || !b2KeyId || !b2AppKey} onClick={() => void run(async () => {
            const payload = { keyId: b2KeyId.trim(), applicationKey: b2AppKey.trim(), bucketName: b2BucketName.trim(), endpoint: b2Endpoint.trim() };
            const res = window.api?.connectB2
              ? await window.api.connectB2(payload)
              : { connected: true, bucketName: payload.bucketName };
            const savedPayload = { ...payload, bucketName: res.bucketName || payload.bucketName };
            await saveB2Settings(savedPayload);
            if (res.bucketName) setB2BucketName(res.bucketName);
            setB2Status(res);
          }, 'Backblaze B2 connected successfully!')}>{busy ? 'Saving…' : (b2Status?.connected || b2Config?.keyId) ? 'Update B2 Connection' : 'Connect Backblaze B2'}</button>
          <button className="text-button" onClick={() => void window.api.openExternal('https://secure.backblaze.com/b2_buckets.htm')}>Open Backblaze Console</button>
          {(b2Status?.connected || b2Config?.keyId) && <button disabled={busy} onClick={() => void run(async () => {
            await saveB2Settings({ keyId: '', applicationKey: '', bucketName: '' });
            if (window.api?.disconnectB2) {
              await window.api.disconnectB2();
            }
            setB2KeyId('');
            setB2AppKey('');
            setB2BucketName('');
            setB2Status({ connected: false });
          }, 'Backblaze B2 disconnected.')}>Disconnect</button>}
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
    <hr/><p>Studio: {studioSettings?.studioName || 'Baawaray'}<br/>Currency: {studioSettings?.currency || 'INR'}<br/>Configured tax: {studioSettings?.taxGstPercent || 0}%</p>
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
