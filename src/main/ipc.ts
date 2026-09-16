import { app, BrowserWindow, dialog, ipcMain, Notification, powerSaveBlocker, shell, net } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import fs from 'node:fs/promises';
import { join, basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { scanDirectory } from './scanner';
import { TransferStore } from './store';
import { GoogleAuth } from './googleAuth';
import { DriveClient } from './drive';
import { TransferEngine } from './transferEngine';
import { checkForUpdate, downloadUpdate, installUpdate } from './updater';
import { log, recentLog } from './log';
import { dropbox } from './dropboxClient';
import { DriveDownloader } from './driveDownloader';
import { B2Client } from './b2Client';
import type { InvoiceSnapshot, ScanOptions, UpdateInfo, WorkTarget } from '../shared/contracts';
import firebaseConfig from '../renderer/src/lib/firebase-applet-config.json';

export function allowedExternal(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      ([
        'app.baawaray.com',
        'baawaray.com',
        'drive.google.com',
        'wa.me',
        'web.whatsapp.com',
        'console.cloud.google.com',
        'developers.google.com',
        'github.com',
        'objects.githubusercontent.com',
        'dropbox.com',
        'www.dropbox.com',
        'backblaze.com',
        'www.backblaze.com',
        'secure.backblaze.com'
      ].includes(u.hostname) ||
        u.hostname.endsWith('.backblazeb2.com'))
    );
  } catch {
    return false;
  }
}

export async function setupIpcHandlers(): Promise<() => void> {
  const directory = join(app.getPath('userData'), 'transfers');
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const store = new TransferStore(join(directory, 'queue.sqlite'));
  const google = new GoogleAuth(directory);
  const b2 = new B2Client();
  let owner = '';
  let sessionIsOwner = false;
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
  const downloader = new DriveDownloader(google, b2);
  const engine = new TransferEngine(
    store,
    drive,
    () => (google.status().connected ? google.status().email : undefined),
    changed,
    job => {
      void (async () => {
        try {
          if (job.folderId && !job.shared && !job.link?.startsWith('b2://')) {
            await drive.share(job.folderId, 'anyone', '');
            store.patch(job.id, { shared: true, sharing: 'anyone' });
            changed();
          }
        } catch {
          /* the studio can still share by hand from the job */
        }
      })();
      if (Notification.isSupported()) {
        new Notification({
          title: 'Upload verified',
          body: `${job.target?.title || job.rootName} is ready to send.`
        }).show();
      }
    },
    b2
  );
  const scans = new Map<string, AbortController>();
  /** Path to the unpacked update waiting to replace this app, once downloaded. */
  let staged = '';
  function trusted(event: IpcMainInvokeEvent): void {
    if (!event.senderFrame || event.senderFrame !== event.sender.mainFrame) throw new Error('Untrusted IPC frame.');
    const url = new URL(event.senderFrame.url);
    const dev = process.env.ELECTRON_RENDERER_URL;
    const ok = !app.isPackaged && dev ? url.origin === new URL(dev).origin
      : url.protocol === 'file:' && resolve(fileURLToPath(url)) === resolve(__dirname, '../renderer/index.html');
    if (!ok) throw new Error('Untrusted IPC origin.');
  }
  function handle(channel: string, fn: (...args: any[]) => unknown, requiresOwner = true): void {
    ipcMain.handle(channel, (event, ...args) => { trusted(event); if (requiresOwner && (!owner || !sessionIsOwner)) throw new Error('Sign in with the studio owner account first.'); return fn(...args); });
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
  let authorizationGeneration = 0;
  const signOut = (invalidate = true): void => { if (invalidate) authorizationGeneration++; engine.pauseAll(); engine.setOwner(''); owner = ''; sessionIsOwner = false; google.clear(); for (const controller of scans.values()) controller.abort(); changed(); };
  handle('studio:login', async (phone: string, password: string) => {
    if (typeof phone !== 'string' || typeof password !== 'string' || phone.length > 40 || password.length > 256) throw new Error('Invalid login fields.');
    console.log('[studio:login] Attempting studio login');
    const start = Date.now();

    const response = await net.fetch('https://app.baawaray.com/api/login', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }) });
    console.log(`[studio:login] Got response with status ${response.status} in ${Date.now() - start}ms`);

    const body = await response.json() as { ok?: boolean; accountType?: string; customToken?: string; error?: string };
    if (!response.ok || !body.ok || !body.customToken) throw new Error(body.error || 'Studio sign-in failed.');
    if (body.accountType !== 'owner' && body.accountType !== 'team' && body.accountType !== 'partner') throw new Error('This desktop app requires a studio, team, or partner account.');
    return { customToken: body.customToken, accountType: body.accountType };
  }, false);
  handle('studio:authorize', async (idToken: string) => {
    const attempt = ++authorizationGeneration;
    if (typeof idToken !== 'string' || idToken.length > 20000) throw new Error('Invalid studio session.');
    const database = firebaseConfig.firestoreDatabaseId || '(default)';
    const response = await net.fetch(`https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${database}/documents/studio_config/main`,
      { headers: { Authorization: `Bearer ${idToken}` } });
    if (!response.ok) throw new Error('Cannot verify the studio session. Check your connection and sign in again.');
    const config = await response.json() as { fields: { ownerUid?: { stringValue?: string } } };
    // Firestore verified the token above; compare its subject with the protected owner record.
    const subject = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString()).sub;
    const isOwner = subject === config.fields.ownerUid?.stringValue;
    if (attempt !== authorizationGeneration) throw new Error('Studio session changed during sign-in.');
    if (subject !== owner) {
      signOut(false); await google.load(subject, idToken);
      if (attempt !== authorizationGeneration) throw new Error('Studio session changed during sign-in.');
      owner = subject; engine.setOwner(owner);
    }
    sessionIsOwner = isOwner;
    return { uid: owner, isOwner };
  }, false);
  handle('studio:signOut', () => signOut(), false);
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
  handle('scanner:startFiles', async (options: ScanOptions, target?: WorkTarget) => {
    if (scans.size) throw new Error('Finish or cancel the current scan first.');
    if (!options || !Array.isArray(options.excludedBillingFolders) || options.excludedBillingFolders.length > 50
      || options.excludedBillingFolders.some(s => typeof s !== 'string' || s.length > 200)) throw new Error('Invalid scan options.');
    const result = await dialog.showOpenDialog({
      title: 'Choose files to upload',
      properties: ['openFile', 'multiSelections']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const rootPath = dirname(result.filePaths[0]);
    if (result.filePaths.some(filePath => dirname(filePath) !== rootPath)) {
      throw new Error('Choose files from one folder at a time so their original names and structure stay unambiguous.');
    }
    const sourceFiles = [...new Set(result.filePaths.map(filePath => basename(filePath)))];
    const id = randomUUID(); const now = new Date().toISOString();
    store.save({ id, ownerUid: owner, rootPath, rootName: sourceFiles.length === 1 ? sourceFiles[0] : `${sourceFiles.length} selected files`,
      sourceFiles, status: 'scanning', options, target, createdAt: now, updatedAt: now, completedFiles: 0, uploadedBytes: 0 });
    const controller = new AbortController(); scans.set(id, controller); changed();
    void scanDirectory(store, id, controller.signal, changed).catch(error => {
      store.patch(id, { status: 'needs_attention', error: controller.signal.aborted ? 'Scan cancelled. Select the files again when ready.' : String(error.message || error) });
    }).finally(() => { scans.delete(id); changed(); });
    return id;
  });
  handle('scanner:cancel', (id: string) => { owned(id); scans.get(id)?.abort(); });
  handle('drive:status', () => google.status());
  handle('drive:configuration', () => google.refreshConfiguration());
  handle('drive:connect', async (idToken: string) => {
    engine.pauseAll();
    try { const status = await google.connect(idToken); changed(); return status; }
    catch (error) { log('drive:connect failed', error); throw error; }
  });
  handle('drive:disconnect', async () => { engine.pauseAll(); return google.disconnect(); });
  // Shared studio preference, held by the queue because only the queue can act on it.
  handle('transfers:destination', (destination: string) => {
    engine.setDestination(destination === 'drive' ? 'drive' : 'b2');
  }, false);
  handle('transfers:enqueue', (id: string, target: WorkTarget, invoice?: InvoiceSnapshot) => {
    const job = owned(id);
    if (!['ready', 'paused'].includes(job.status) || !job.scan || job.scan.readErrors) throw new Error('A complete scan is required.');
    if (!target || !['freelance', 'deliverable'].includes(target.kind) || !['raw', 'delivery'].includes(target.purpose)
      || !target.id || !target.title || (target.kind === 'deliverable' && !target.clientId)) throw new Error('Select the work this folder belongs to.');
    if (job.driveAccount && job.target && (job.target.kind !== target.kind || job.target.id !== target.id || job.target.clientId !== target.clientId || job.target.purpose !== target.purpose)) throw new Error('A started transfer cannot be reassigned to another job.');
    if (invoice) invoiceValid(invoice);
    store.patch(id, { target, invoice: job.invoice?.status === 'issued' ? job.invoice : invoice ?? job.invoice }); engine.resume(id);
  });
  /**
   * Take a transfer out of the queue.
   *
   * `keepUploaded` is the difference between abandoning a folder and cleaning
   * it up: kept, whatever already reached the cloud stays where it is and its
   * link is returned so the studio can still reach it; otherwise the partial
   * folder is deleted first, and a failure to delete stops the removal rather
   * than leaving bytes behind that nothing on this Mac remembers.
   */
  handle('transfers:remove', async (id: string, keepUploaded = true) => {
    const job = owned(id);
    engine.pause(id);
    const partial = job.link && job.uploadedBytes > 0 ? job.link : undefined;
    if (!keepUploaded && job.folderId) {
      if (job.link?.startsWith('b2://')) {
        if (!b2.isConnected()) throw new Error('Connect Backblaze B2 to delete what was already uploaded, or keep it instead.');
        await b2.deletePrefix(job.folderId);
      } else {
        await drive.delete(job.folderId);
      }
    }
    store.remove(id);
    changed();
    return { removed: true, keptLink: keepUploaded ? partial : undefined };
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
    store.patch(id, { rootPath: result.filePaths[0], sourceFiles: undefined, status: 'scanning', error: undefined });
    const controller = new AbortController(); scans.set(id, controller); changed();
    void scanDirectory(store, id, controller.signal, changed).catch(error => {
      store.patch(id, { status: 'needs_attention', error: controller.signal.aborted ? 'Scan cancelled.' : String(error.message || error) });
    }).finally(() => { scans.delete(id); changed(); });
    return true;
  });
  handle('transfers:share', async (id: string, mode: 'restricted' | 'anyone', email: string) => {
    const job = owned(id);
    if (job.status !== 'completed' || !job.link) throw new Error('Finish verification before sharing.');
    if (job.link.startsWith('b2://') || job.driveAccount?.startsWith('B2:')) {
      store.patch(id, { shared: true, sharing: 'anyone' });
      changed();
      return job.link;
    }
    if (job.driveAccount !== google.status().email) throw new Error('Reconnect this transfer’s original Drive account.');
    if (!['restricted', 'anyone'].includes(mode) || (mode === 'restricted' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error('Enter the recipient’s Google account email.');
    if (mode === 'anyone') {
      const confirmation = await dialog.showMessageBox({ type: 'warning', message: 'Allow anyone with this link to view and download the entire folder?', detail: job.target?.title || job.rootName, buttons: ['Keep private', 'Allow link access'], defaultId: 0, cancelId: 0 });
      if (confirmation.response !== 1) throw new Error('Sharing cancelled. The folder remains unchanged.');
    }
    if (job.folderId) await drive.share(job.folderId, mode, email.trim());
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
  handle('app:diagnostics', () => recentLog(), false);
  handle('log:rendererError', (message: string, stack: string) => {
    log('renderer crash', `${String(message).slice(0, 500)}\n${String(stack).slice(0, 2000)}`);
  }, false);
  handle('updates:check', () => checkForUpdate(), false);
  handle('updates:download', async (info: UpdateInfo) => {
    if (!info || typeof info.version !== 'string') throw new Error('No update to download.');
    const window = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    let lastSent = 0;
    staged = await downloadUpdate(info, (received, total) => {
      // The renderer only needs enough to move a bar; a send per chunk would
      // flood it on a 226 MB download.
      if (Date.now() - lastSent < 200 && received !== total) return;
      lastSent = Date.now();
      window?.webContents.send('update:progress', { received, total });
    });
    return { ready: true, version: info.version };
  }, false);
  handle('updates:install', async () => {
    if (!staged) throw new Error('Download the update before installing it.');
    // A transfer killed mid-flight resumes from its journal, but pausing first
    // means the queue is written down deliberately rather than recovered.
    engine.pauseAll();
    await installUpdate(staged);
    app.quit();
  }, false);
  handle('power:keepAwake', (on: boolean) => { keepAwake = on === true; evaluatePower(); }, false);
  handle('external:open', async (url: string) => { if (!allowedExternal(url)) throw new Error('This link is not allowed.'); await shell.openExternal(url); }, false);
  handle('dialog:openVideoFile', async () => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const result = await dialog.showOpenDialog(win, {
      title: 'Select Finished Deliverable Video',
      properties: ['openFile'],
      filters: [
        { name: 'Video Files', extensions: ['mp4', 'mov', 'mkv', 'avi', 'm4v', 'webm'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const stat = await fs.stat(filePath);
    return {
      filePath,
      fileName: basename(filePath),
      fileSize: stat.size
    };
  }, false);
  handle('studio:dropboxStatus', async () => dropbox.status(), false);
  handle('studio:connectDropbox', async (cfg: any) => {
    if (typeof cfg === 'string') {
      dropbox.configure({ refreshToken: cfg });
    } else {
      dropbox.configure(cfg);
    }
    return dropbox.status();
  }, false);
  handle('studio:disconnectDropbox', async () => {
    dropbox.configure({});
    return { configured: false, connected: false };
  }, false);
  handle('studio:b2Status', async () => {
    const creds = b2.credentials;
    if (!creds || !b2.isConnected()) {
      return { connected: false };
    }
    try {
      const auth = await b2.authorize();
      return {
        connected: true,
        bucketName: creds.bucketName,
        accountId: auth.accountId
      };
    } catch (err: any) {
      return {
        connected: false,
        bucketName: creds.bucketName,
        error: err?.message || 'Failed to authenticate with Backblaze B2'
      };
    }
  }, false);
  handle('studio:connectB2', async (config: any) => {
    if (!config || !config.keyId || !config.applicationKey) {
      throw new Error('Key ID and Application Key are required.');
    }
    b2.setCredentials({
      keyId: config.keyId.trim(),
      applicationKey: config.applicationKey.trim(),
      bucketName: (config.bucketName || '').trim(),
      endpoint: config.endpoint?.trim(),
      region: config.region?.trim()
    });
    const auth = await b2.authorize(true);
    await b2.getBucketId();
    const resolvedBucket = b2.credentials?.bucketName || auth.allowed?.bucketName || (config.bucketName || '').trim();
    return {
      connected: true,
      bucketName: resolvedBucket,
      accountId: auth.accountId
    };
  }, false);
  handle('studio:disconnectB2', async () => {
    b2.setCredentials({ keyId: '', applicationKey: '', bucketName: '' });
    return { connected: false };
  }, false);
  handle('studio:deleteB2Folder', async (prefix: string) => {
    if (!b2.isConnected()) throw new Error('Backblaze B2 is not connected.');
    return await b2.deletePrefix(prefix);
  });
  handle('studio:uploadDeliverable', async (jobId: string, filePath: string, targetFolder: string, fileName: string) => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    return await dropbox.uploadDeliverable(filePath, targetFolder, fileName, (percent, uploadedBytes, totalBytes) => {
      win?.webContents.send('upload:progress', { jobId, percent, uploadedBytes, totalBytes });
    });
  }, false);
  handle('studio:chooseDownloadDirectory', async () => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const result = await dialog.showOpenDialog(win, {
      title: 'Select Destination Folder for Raw Footage',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  }, false);
  handle('studio:downloadRawData', async (jobId: string, rawDataLink: string, destDir: string) => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const result = await downloader.download(jobId, rawDataLink, destDir, progress => {
      win?.webContents.send('download:progress', progress);
    });
    store.rememberDownload(owner, jobId, destDir);
    return result;
  }, false);
  handle('studio:cancelDownload', async (jobId: string) => {
    downloader.cancel(jobId);
  }, false);
  handle('studio:getDownloadSize', async (rawDataLink: string) => {
    return await downloader.getDownloadSize(rawDataLink);
  }, false);
  handle('studio:verifyLocalFolder', async (jobId: string, folderPath: string) => {
    const stats = await downloader.scanLocalDirectory(folderPath);
    if (stats.fileCount > 0) {
      store.rememberDownload(owner, jobId, folderPath);
      const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
      win?.webContents.send('download:progress', {
        jobId,
        percent: 100,
        downloadedBytes: stats.totalBytes,
        totalBytes: stats.totalBytes,
        fileName: 'Verified',
        status: 'completed'
      });
      return { valid: true, fileCount: stats.fileCount, totalBytes: stats.totalBytes };
    }
    return { valid: false, fileCount: 0, totalBytes: 0 };
  }, false);
  handle('studio:openDownloadedFolder', async (jobId: string) => {
    const folderPath = store.downloadPath(owner, jobId);
    if (!folderPath) throw new Error('This Mac has no saved folder for this project. Use Locate folder first.');
    try {
      const stat = await fs.stat(folderPath);
      if (!stat.isDirectory()) throw new Error('Not a directory');
    } catch {
      store.forgetDownload(owner, jobId);
      throw new Error('The downloaded folder was moved, renamed, or its drive is disconnected. Use Locate folder to reconnect it.');
    }
    const error = await shell.openPath(folderPath);
    if (error) throw new Error(error);
  }, false);
  handle('studio:forgetDownloadedFolder', async (jobId: string) => {
    store.forgetDownload(owner, jobId);
  }, false);
  handle('studio:checkDiskSpace', async (targetPath: string) => {
    try {
      const stats = await fs.statfs(targetPath);
      const freeBytes = Number(stats.bavail) * Number(stats.bsize);
      const totalBytes = Number(stats.blocks) * Number(stats.bsize);
      return { freeBytes, totalBytes, path: targetPath };
    } catch {
      return { freeBytes: 100 * 1024 * 1024 * 1024, totalBytes: 500 * 1024 * 1024 * 1024, path: targetPath };
    }
  }, false);
  handle('studio:deleteDriveFolder', async (folderIdOrUrl: string) => {
    let id = (folderIdOrUrl || '').trim();
    const folderMatch = id.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch) id = folderMatch[1];
    const fileMatch = id.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (fileMatch) id = fileMatch[1];
    const idParam = id.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idParam) id = idParam[1];
    await drive.delete(id);
  });
  handle('studio:deleteDropboxFile', async (dropboxPath: string) => {
    await dropbox.deleteDeliverable(dropboxPath);
  });
  handle('studio:downloadDropboxFile', async (dropboxPath: string, localPath: string) => {
    await dropbox.downloadDeliverable(dropboxPath, localPath);
  });
  handle('studio:chooseSaveLocation', async (defaultFileName: string) => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const result = await dialog.showSaveDialog(win, {
      title: 'Save Master Deliverable to Local Hard Drive',
      defaultPath: defaultFileName
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  }, false);
  return () => {
    engine.shutdown();
    for (const c of scans.values()) c.abort();
    if (blocker !== null && powerSaveBlocker.isStarted(blocker)) powerSaveBlocker.stop(blocker);
    store.close();
  };
}
