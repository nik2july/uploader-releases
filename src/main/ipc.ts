import { app, BrowserWindow, dialog, ipcMain, Notification, powerSaveBlocker, shell } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import fs from 'node:fs/promises';
import { join, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { scanDirectory } from './scanner';
import { TransferStore } from './store';
import { GoogleAuth } from './googleAuth';
import { DriveClient } from './drive';
import { TransferEngine } from './transferEngine';
import { checkForUpdate } from './updater';
import type { InvoiceSnapshot, ScanOptions, WorkTarget } from '../shared/contracts';
import firebaseConfig from '../renderer/src/lib/firebase-applet-config.json';

export function allowedExternal(url: string): boolean {
  try { const u = new URL(url); return u.protocol === 'https:' && !u.username && !u.password
    && ['app.baawaray.com', 'baawaray.com', 'drive.google.com', 'wa.me', 'web.whatsapp.com', 'console.cloud.google.com', 'developers.google.com',
      'github.com', 'objects.githubusercontent.com'].includes(u.hostname); }
  catch { return false; }
}

export async function setupIpcHandlers(): Promise<() => void> {
  const directory = join(app.getPath('userData'), 'transfers');
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const store = new TransferStore(join(directory, 'queue.sqlite'));
  const google = new GoogleAuth(directory);
  let owner = '';
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * A 1-2 TB folder outlives any amount of time the Mac is left alone, and macOS
   * will suspend a backgrounded app long before that. So the queue holds a power
   * blocker for exactly as long as something is actually moving, and drops it the
   * moment nothing is — a transfer left paused overnight must not keep the machine
   * from sleeping. 'prevent-app-suspension' is the quiet default: it stops App Nap
   * and system sleep without keeping the screen lit. The studio can opt into
   * 'prevent-display-sleep' when the Mac is set to sleep aggressively.
   */
  let keepAwake = false;
  let blocker: number | null = null;
  let holding: 'prevent-app-suspension' | 'prevent-display-sleep' | null = null;
  const evaluatePower = (): void => {
    const busy = owner && store.all(owner).some(job => ['queued', 'uploading', 'verifying'].includes(job.status));
    const wanted = busy ? (keepAwake ? 'prevent-display-sleep' : 'prevent-app-suspension') : null;
    if (wanted === holding) return;
    if (blocker !== null && powerSaveBlocker.isStarted(blocker)) powerSaveBlocker.stop(blocker);
    blocker = null; holding = wanted;
    if (wanted) blocker = powerSaveBlocker.start(wanted);
  };

  const changed = (): void => {
    evaluatePower();
    if (noticeTimer) return;
    noticeTimer = setTimeout(() => { noticeTimer = undefined; for (const window of BrowserWindow.getAllWindows()) window.webContents.send('transfers:changed'); }, 150);
  };
  const drive = new DriveClient(force => google.token(force));
  const engine = new TransferEngine(store, drive, () => google.status().connected ? google.status().email : undefined, changed,
    job => {
      // Make it openable the moment it is verified. Editors are freelancers on
      // whatever account they happen to have, and a link that needs a Google
      // sign-in they do not possess is a link that does not work. This is a
      // deliberate default: the folder is readable by anyone holding the link.
      void (async () => {
        try {
          if (job.folderId && !job.shared) { await drive.share(job.folderId, 'anyone', ''); store.patch(job.id, { shared: true, sharing: 'anyone' }); changed(); }
        } catch { /* the studio can still share by hand from the job */ }
      })();
      if (Notification.isSupported()) new Notification({ title: 'Upload verified', body: `${job.target?.title || job.rootName} is ready to send.` }).show();
    });
  const scans = new Map<string, AbortController>();
  function trusted(event: IpcMainInvokeEvent): void {
    if (!event.senderFrame || event.senderFrame !== event.sender.mainFrame) throw new Error('Untrusted IPC frame.');
    const url = new URL(event.senderFrame.url);
    const dev = process.env.ELECTRON_RENDERER_URL;
    const ok = !app.isPackaged && dev ? url.origin === new URL(dev).origin
      : url.protocol === 'file:' && resolve(fileURLToPath(url)) === resolve(__dirname, '../renderer/index.html');
    if (!ok) throw new Error('Untrusted IPC origin.');
  }
  function handle(channel: string, fn: (...args: any[]) => unknown, requiresOwner = true): void {
    ipcMain.handle(channel, (event, ...args) => { trusted(event); if (requiresOwner && !owner) throw new Error('Sign in with the studio owner account first.'); return fn(...args); });
  }
  function owned(id: string): ReturnType<TransferStore['get']> {
    if (typeof id !== 'string') throw new Error('Invalid transfer ID.');
    const job = store.get(id); if (job.ownerUid !== owner) throw new Error('Transfer belongs to another studio account.'); return job;
  }
  function invoiceValid(invoice: InvoiceSnapshot): void {
    if (!invoice || !invoice.id || !['draft', 'issued'].includes(invoice.status)
      || ![invoice.quantity, invoice.rate, invoice.subtotal, invoice.tax, invoice.total, invoice.taxPercent].every(n => Number.isFinite(n) && n >= 0)
      || invoice.taxPercent > 100) throw new Error('Invalid invoice.');
  }
  const signOut = (): void => { engine.pauseAll(); engine.setOwner(''); owner = ''; google.clear(); for (const controller of scans.values()) controller.abort(); changed(); };
  handle('studio:login', async (phone: string, password: string) => {
    if (typeof phone !== 'string' || typeof password !== 'string' || phone.length > 40 || password.length > 256) throw new Error('Invalid login fields.');
    const response = await fetch('https://app.baawaray.com/api/login', { method: 'POST', signal: AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }) });
    const body = await response.json() as { ok?: boolean; accountType?: string; customToken?: string; error?: string };
    if (!response.ok || !body.ok || !body.customToken) throw new Error(body.error || 'Studio sign-in failed.');
    if (body.accountType !== 'owner') throw new Error('This desktop uploader requires the studio owner account.');
    return { customToken: body.customToken };
  }, false);
  handle('studio:authorize', async (idToken: string) => {
    if (typeof idToken !== 'string' || idToken.length > 20000) throw new Error('Invalid studio session.');
    const database = firebaseConfig.firestoreDatabaseId || '(default)';
    const response = await fetch(`https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${database}/documents/studio_config/main`,
      { headers: { Authorization: `Bearer ${idToken}` }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('Cannot verify the studio session. Check your connection and sign in again.');
    const config = await response.json() as { fields: { ownerUid?: { stringValue?: string } } };
    // Firestore verified the token above; compare its subject with the protected owner record.
    const subject = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString()).sub;
    if (!subject || subject !== config.fields.ownerUid?.stringValue) throw new Error('Only the studio owner can use this uploader.');
    if (subject !== owner) { signOut(); await google.load(subject); owner = subject; engine.setOwner(owner); }
    return owner;
  }, false);
  handle('studio:signOut', signOut, false);
  handle('transfers:list', () => store.all(owner));
  handle('transfers:inspect', (id: string) => { owned(id); return { files: store.problems(id) }; });
  handle('scanner:start', async (options: ScanOptions, target?: WorkTarget) => {
    if (scans.size) throw new Error('Finish or cancel the current scan first.');
    if (!options || !Array.isArray(options.excludedBillingFolders) || options.excludedBillingFolders.length > 50
      || options.excludedBillingFolders.some(s => typeof s !== 'string' || s.length > 200)) throw new Error('Invalid scan options.');
    const result = await dialog.showOpenDialog({ title: 'Choose the project folder to upload', properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths[0]) return null;
    const rootPath = result.filePaths[0]; const id = randomUUID(); const now = new Date().toISOString();
    store.save({ id, ownerUid: owner, rootPath, rootName: basename(rootPath), status: 'scanning', options, target,
      createdAt: now, updatedAt: now, completedFiles: 0, uploadedBytes: 0 });
    const controller = new AbortController(); scans.set(id, controller); changed();
    void scanDirectory(store, id, controller.signal, changed).catch(error => {
      store.patch(id, { status: 'needs_attention', error: controller.signal.aborted ? 'Scan cancelled. Select the folder again when ready.' : String(error.message || error) });
    }).finally(() => { scans.delete(id); changed(); });
    return id;
  });
  handle('scanner:cancel', (id: string) => { owned(id); scans.get(id)?.abort(); });
  handle('drive:status', () => google.status());
  handle('drive:configure', async (clientId: string, secret: string) => { engine.pauseAll(); return google.configure(clientId, secret); });
  handle('drive:connect', async () => { engine.pauseAll(); const status = await google.connect(); changed(); return status; });
  handle('drive:disconnect', async () => { engine.pauseAll(); return google.disconnect(); });
  handle('transfers:enqueue', (id: string, target: WorkTarget, invoice?: InvoiceSnapshot) => {
    const job = owned(id);
    if (!['ready', 'paused'].includes(job.status) || !job.scan || job.scan.readErrors) throw new Error('A complete scan is required.');
    if (!target || !['freelance', 'deliverable'].includes(target.kind) || !['raw', 'delivery'].includes(target.purpose)
      || !target.id || !target.title || (target.kind === 'deliverable' && !target.clientId)) throw new Error('Select the work this folder belongs to.');
    if (job.driveAccount && job.target && (job.target.kind !== target.kind || job.target.id !== target.id || job.target.clientId !== target.clientId || job.target.purpose !== target.purpose)) throw new Error('A started transfer cannot be reassigned to another job.');
    if (invoice) invoiceValid(invoice);
    store.patch(id, { target, invoice: job.invoice?.status === 'issued' ? job.invoice : invoice ?? job.invoice }); engine.resume(id);
  });
  handle('transfers:pause', (id: string) => { owned(id); engine.pause(id); });
  handle('transfers:resume', (id: string) => { owned(id); engine.resume(id); });
  handle('transfers:relocate', async (id: string) => {
    const job = owned(id); engine.pause(id);
    const result = await dialog.showOpenDialog({ title: `Locate the original ${job.rootName} folder`, properties: ['openDirectory'] });
    if (!result.canceled && result.filePaths[0]) { store.patch(id, { rootPath: result.filePaths[0], error: 'Folder location updated. Resume will check source files before sending.' }); changed(); }
  });
  handle('transfers:rescan', async (id: string) => {
    const job = owned(id);
    if (scans.size) throw new Error('Finish or cancel the current scan first.');
    if (['scanning', 'queued', 'uploading', 'verifying'].includes(job.status)) throw new Error('Wait for this transfer to stop before adding files.');
    const result = await dialog.showOpenDialog({ title: `Add files to ${job.target?.title || job.rootName}`, defaultPath: job.rootPath, properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths[0]) return false;
    // Files already verified keep their rows and are not sent again; the fresh
    // summary counts the folder as it stands now, so reconciliation still holds.
    store.patch(id, { rootPath: result.filePaths[0], status: 'scanning', error: undefined });
    const controller = new AbortController(); scans.set(id, controller); changed();
    void scanDirectory(store, id, controller.signal, changed).catch(error => {
      store.patch(id, { status: 'needs_attention', error: controller.signal.aborted ? 'Scan cancelled.' : String(error.message || error) });
    }).finally(() => { scans.delete(id); changed(); });
    return true;
  });
  handle('transfers:share', async (id: string, mode: 'restricted' | 'anyone', email: string) => {
    const job = owned(id);
    if (job.status !== 'completed' || !job.folderId || !job.link) throw new Error('Finish verification before sharing.');
    if (job.driveAccount !== google.status().email) throw new Error('Reconnect this transfer’s original Drive account.');
    if (!['restricted', 'anyone'].includes(mode) || (mode === 'restricted' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error('Enter the recipient’s Google account email.');
    if (mode === 'anyone') {
      const confirmation = await dialog.showMessageBox({ type: 'warning', message: 'Allow anyone with this link to view and download the entire folder?', detail: job.target?.title || job.rootName, buttons: ['Keep private', 'Allow link access'], defaultId: 0, cancelId: 0 });
      if (confirmation.response !== 1) throw new Error('Sharing cancelled. The folder remains unchanged.');
    }
    await drive.share(job.folderId, mode, email.trim());
    store.patch(id, { shared: true, sharing: mode }); changed(); return job.link;
  });
  handle('transfers:synced', (id: string) => { const job = owned(id); if (job.status !== 'completed') throw new Error('Upload is incomplete.'); store.patch(id, { synced: true }); changed(); });
  handle('transfers:prepared', (id: string) => { const job = owned(id); if (job.status !== 'completed') throw new Error('Upload is incomplete.'); store.patch(id, { messagePreparedAt: new Date().toISOString() }); changed(); });
  handle('invoice:save', (id: string, invoice: InvoiceSnapshot) => {
    const job = owned(id); invoiceValid(invoice);
    if (job.invoice?.status === 'issued' && JSON.stringify(job.invoice) !== JSON.stringify(invoice)) throw new Error('Issued invoices are immutable. Create a separate adjustment.');
    store.patch(id, { invoice }); changed();
  });
  handle('invoice:pdf', async (bytes: Uint8Array, filename: string) => {
    if (!(bytes instanceof Uint8Array) || bytes.length > 20 * 1024 * 1024 || Buffer.from(bytes.subarray(0, 5)).toString() !== '%PDF-') throw new Error('Invalid PDF.');
    const result = await dialog.showSaveDialog({ defaultPath: basename(filename), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (result.canceled || !result.filePath) return false;
    await fs.writeFile(result.filePath, bytes); return true;
  });
  // Neither needs a signed-in owner: one is this app's own version, the other
  // is a public release feed. Both are useful before anyone has signed in.
  handle('app:version', () => app.getVersion(), false);
  handle('updates:check', () => checkForUpdate(), false);
  handle('power:keepAwake', (on: boolean) => { keepAwake = on === true; evaluatePower(); }, false);
  handle('external:open', async (url: string) => { if (!allowedExternal(url)) throw new Error('This link is not allowed.'); await shell.openExternal(url); });
  return () => {
    engine.shutdown();
    for (const c of scans.values()) c.abort();
    if (blocker !== null && powerSaveBlocker.isStarted(blocker)) powerSaveBlocker.stop(blocker);
    store.close();
  };
}
