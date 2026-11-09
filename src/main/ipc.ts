import { dialog, ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { app } from 'electron';
import { LutConverterEngine } from './lutConverter';
import { createProjectFolderStructure, revealFolderInFinder } from './folderStructure';
import { scanFootageFolder, getFootageFolderStats, autoDetectTranscodedFolder } from './folderScanner';
import { whatsappService } from './whatsappNotifier';
import { GDriveSyncManager } from './gdriveSync';
import { ClipDeliveryEngine } from './clipDelivery';
import { dropboxManager } from './dropboxManager';
import { RevisionsManager } from './revisionsManager';
import { EditorManager } from './editorManager';
import { StudioDataService } from './studioDataService';
import { resolveSmartProjectContext } from '../shared/smartPathResolver';
import { transferManager } from './transferManager';
import { b2Client } from './b2Client';
import { clipDeliveryEngineRef, dropboxManagerRef, lutEngineRef } from './engineReferences';
import type {
  ActiveStudioProject,
  ClipDeliverySettings,
  DataHandoffRecord,
  DropboxDeliverableConfig,
  DropboxRawClipsConfig,
  EventFolderPlan,
  GDriveSyncConfig,
  LutConversionOptions,
  ResolvedProjectContext
} from '../shared/contracts';

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  const userDataDir = app.getPath('userData');
  const resourcesDir = app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'resources');
  const b2ConfigFile = path.join(userDataDir, 'b2_config.json');

  // Load B2 config if available
  (async () => {
    try {
      if (existsSync(b2ConfigFile)) {
        const raw = await fs.readFile(b2ConfigFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.keyId && parsed.applicationKey) {
          b2Client.configure(parsed);
        }
      }
    } catch (e) {
      console.warn('[B2] Failed to read cached b2_config.json:', e);
    }
  })();

  transferManager.setMainWindow(mainWindow);

  const lutEngine = new LutConverterEngine(progress => {
    mainWindow.webContents.send('lut:progress', progress);
    transferManager.syncLutConversion(progress);
  });
  lutEngineRef.current = lutEngine;

  const gdriveSync = new GDriveSyncManager(
    status => mainWindow.webContents.send('gdrive:status', status),
    config => mainWindow.webContents.send('gdrive:config', config)
  );

  const clipDelivery = new ClipDeliveryEngine(state => {
    mainWindow.webContents.send('clips:state', state);
    transferManager.syncClipDelivery(state);
  });
  clipDeliveryEngineRef.current = clipDelivery;

  const revisionsManager = new RevisionsManager(userDataDir);
  const editorManager = new EditorManager(userDataDir);
  StudioDataService.init(userDataDir);
  void dropboxManager.init(userDataDir);
  dropboxManagerRef.current = dropboxManager;

  // --- Dialog Helpers ---
  ipcMain.handle('dialog:openDirectory', async (_, defaultPath?: string) => {
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      defaultPath
    });
    return res.canceled ? null : res.filePaths[0];
  });

  ipcMain.handle('dialog:openFile', async (_, options?: { extensions?: string[] }) => {
    const filters = options?.extensions
      ? [{ name: 'Allowed Files', extensions: options.extensions }]
      : undefined;
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters
    });
    return res.canceled ? null : res.filePaths[0];
  });

  // --- Feature 1: LUT Converter ---
  ipcMain.handle('lut:getPresets', async () => {
    return LutConverterEngine.getAvailableLuts(resourcesDir);
  });

  ipcMain.handle('lut:start', async (_, options: LutConversionOptions) => {
    void lutEngine.startConversion(options);
    return { ok: true };
  });

  ipcMain.handle('lut:cancel', async () => {
    lutEngine.cancel();
    return { ok: true };
  });

  ipcMain.handle('lut:getProgress', async () => {
    return lutEngine.getProgress();
  });

  // --- Feature 2: Folder Structure Creator ---
  ipcMain.handle('studio:getClients', async () => {
    return StudioDataService.getClients();
  });

  ipcMain.handle('studio:getClientDeliverables', async (_, clientName: string) => {
    return StudioDataService.getClientDeliverables(clientName);
  });

  ipcMain.handle('studio:saveClientDeliverables', async (_, clientName: string, video, photo) => {
    return StudioDataService.saveClientDeliverables(clientName, video, photo);
  });

  ipcMain.handle('studio:syncLive', async () => {
    return StudioDataService.syncFromFirestore();
  });

  ipcMain.handle('folder:create', async (_, plan: EventFolderPlan) => {
    return createProjectFolderStructure(plan);
  });

  ipcMain.handle('folder:reveal', async (_, folderPath: string) => {
    return revealFolderInFinder(folderPath);
  });

  ipcMain.handle('qr:downloadUniversal', async (_, variant: string = 'ivory') => {
    try {
      const sourceDir = '/Volumes/40/Antigravitty Projects/Marketing/Table_QR_5x7';
      const fileMap: Record<string, string> = {
        ivory: 'Table_QR_Ivory_300DPI.png',
        sindoor: 'Table_QR_Sindoor_300DPI.png',
        obsidian: 'Table_QR_Obsidian_300DPI.png',
        pdf: 'Table_QR_Ivory_Print.pdf',
        pdf_sindoor: 'Table_QR_Sindoor_Print.pdf'
      };
      const fileName = fileMap[variant] || 'Table_QR_Ivory_300DPI.png';
      const srcPath = path.join(sourceDir, fileName);

      const downloadsDir = app.getPath('downloads');
      const destPath = path.join(downloadsDir, `Baawaray_Universal_Table_QR_5x7_${variant.toUpperCase()}${path.extname(fileName)}`);

      if (existsSync(srcPath)) {
        await fs.copyFile(srcPath, destPath);
        shell.showItemInFolder(destPath);
        return { success: true, path: destPath, fileName: path.basename(destPath) };
      } else {
        shell.showItemInFolder(sourceDir);
        return { success: true, path: sourceDir, fileName: 'Table_QR_5x7' };
      }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to download QR standee' };
    }
  });

  // --- Feature 2b: Smart Project Context & Active Project ---
  const activeProjectFile = path.join(userDataDir, 'active-studio-project.json');

  ipcMain.handle('project:resolveContext', async (_, inputPath: string): Promise<ResolvedProjectContext | null> => {
    if (!inputPath) return null;
    const ctx = resolveSmartProjectContext(inputPath);
    if (!ctx) return null;

    try {
      // 1. If eventSubfolder not determined, check 01_RAW_FOOTAGE on disk
      const rawDir = path.join(ctx.rootPath, '01_RAW_FOOTAGE');
      if (existsSync(rawDir)) {
        const entries = await fs.readdir(rawDir, { withFileTypes: true });
        const eventDirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'));
        ctx.availableEvents = eventDirs.map(e => e.name);

        if (!ctx.eventSubfolder && eventDirs.length > 0) {
          const firstEvent = eventDirs[0].name;
          ctx.eventSubfolder = firstEvent;

          // Check if there are crew folders inside firstEvent
          const firstEventPath = path.join(rawDir, firstEvent);
          const crewEntries = await fs.readdir(firstEventPath, { withFileTypes: true });
          const crewDirs = crewEntries.filter(e => e.isDirectory() && !e.name.startsWith('.'));
          if (crewDirs.length > 0) {
            ctx.crewSubfolder = crewDirs[0].name;
          }
        }
        if (!ctx.rawSourcePath || ctx.rawSourcePath === ctx.rootPath) {
          ctx.rawSourcePath = rawDir;
        }
      }

      // 2. Set client delivery destination to 05_CLIENT_CLIPS_DELIVERY root (never auto-append event subfolder)
      const deliveryBase = existsSync(path.join(ctx.rootPath, '05_CLIENT_CLIPS_DELIVERY'))
        ? path.join(ctx.rootPath, '05_CLIENT_CLIPS_DELIVERY')
        : path.join(ctx.rootPath, '03_CLIENT_CLIPS_DELIVERY');
      ctx.clientDeliveryDestinationPath = deliveryBase;

      // Match edited source in 04_RENDER_DELIVERABLES (or legacy 05_RENDER_DELIVERABLES)
      const renderBase = existsSync(path.join(ctx.rootPath, '04_RENDER_DELIVERABLES'))
        ? path.join(ctx.rootPath, '04_RENDER_DELIVERABLES')
        : path.join(ctx.rootPath, '05_RENDER_DELIVERABLES');
      if (existsSync(renderBase)) {
        ctx.editedSourcePath = renderBase;
      }
    } catch (err) {
      console.warn('[IPC] project:resolveContext disk check warning:', err);
    }

    return ctx;
  });

  ipcMain.handle('project:getActive', async (): Promise<ActiveStudioProject | null> => {
    try {
      if (existsSync(activeProjectFile)) {
        const raw = await fs.readFile(activeProjectFile, 'utf8');
        return JSON.parse(raw);
      }
    } catch {}
    return null;
  });

  ipcMain.handle('project:setActive', async (_, proj: ActiveStudioProject): Promise<boolean> => {
    try {
      await fs.writeFile(activeProjectFile, JSON.stringify(proj, null, 2), 'utf8');
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('footage:getStats', async (_, folderPath: string) => {
    return getFootageFolderStats(folderPath);
  });

  // --- Feature 3: Data Handoff & WhatsApp ---
  ipcMain.handle('handoff:scanFolder', async (_, targetPath: string) => {
    return scanFootageFolder(targetPath);
  });

  ipcMain.handle('handoff:logData', async (_, record: DataHandoffRecord) => {
    if (record.notifyWhatsApp && record.teamMemberPhone) {
      const waRes = await whatsappService.sendFootageReceivedAlert({
        crewName: record.teamMemberName,
        phone: record.teamMemberPhone,
        role: record.role,
        clientName: record.clientName,
        eventName: record.eventName,
        dataGb: record.dataGb,
        fileCount: record.fileCount
      });
      record.whatsappStatus = waRes.ok ? 'sent' : 'failed';
      record.whatsappMessageId = waRes.messageId;
    }
    return record;
  });

  ipcMain.handle('whatsapp:sendReviewLink', async (_, params) => {
    return whatsappService.sendClientReviewLink(params);
  });

  ipcMain.handle('whatsapp:getConfig', async () => {
    return whatsappService.getConfig();
  });

  ipcMain.handle('whatsapp:updateConfig', async (_, cfg) => {
    whatsappService.configure(cfg);
    return { ok: true };
  });

  // --- Feature 4: Google Drive Daily Sync ---
  ipcMain.handle('gdrive:getConfig', async () => {
    return gdriveSync.getConfig();
  });

  ipcMain.handle('gdrive:updateConfig', async (_, patch: Partial<GDriveSyncConfig>) => {
    gdriveSync.updateConfig(patch);
    return gdriveSync.getConfig();
  });

  ipcMain.handle('gdrive:getStatus', async () => {
    return gdriveSync.getStatus();
  });

  ipcMain.handle('gdrive:startSync', async () => {
    void gdriveSync.startSync();
    return { ok: true };
  });

  // --- Feature 5: Client Clips Delivery Engine ---
  ipcMain.handle('clips:start', async (_, settings: ClipDeliverySettings) => {
    void clipDelivery.startDelivery(settings);
    return { ok: true };
  });

  ipcMain.handle('clips:pause', async () => {
    clipDelivery.pause();
    return { ok: true };
  });

  ipcMain.handle('clips:resume', async () => {
    clipDelivery.resume();
    return { ok: true };
  });

  ipcMain.handle('clips:cancel', async () => {
    clipDelivery.cancel();
    return { ok: true };
  });

  ipcMain.handle('clips:getState', async () => {
    return clipDelivery.getState();
  });

  // --- Feature 6: Dropbox Deliverables & Client Revisions ---
  ipcMain.handle('dropbox:createFolder', async (_, clientName: string, deliverableTitle: string) => {
    return dropboxManager.createDeliverableFolder(clientName, deliverableTitle);
  });

  ipcMain.handle('dropbox:uploadAndShare', async (_, config: DropboxDeliverableConfig) => {
    const res = await dropboxManager.uploadAndShareDeliverable(config, status => {
      mainWindow.webContents.send('dropbox:status', status);
    });
    if (res && res.shareUrl) {
      void StudioDataService.updateDeliverableStatus(config.clientName, config.deliverableId, {
        status: 'review',
        currentCut: config.cutVersion || 'Cut 1',
        renderFilePath: config.renderFilePath,
        dropboxShareUrl: res.shareUrl
      });
    }
    return res;
  });

  ipcMain.handle('dropbox:uploadRawClipsFolder', async (_, config: DropboxRawClipsConfig) => {
    const res = await dropboxManager.uploadRawClipsFolder(config, status => {
      mainWindow.webContents.send('dropbox:rawClipsStatus', status);
      transferManager.syncDropboxRawClips(status, config.clientName, config.eventName);
    });
    if (res && res.shareUrl) {
      void StudioDataService.updateDeliverableStatus(config.clientName, 'Raw Clips', {
        status: 'delivered',
        renderFilePath: config.folderPath,
        dropboxShareUrl: res.shareUrl
      });
    }
    return res;
  });

  ipcMain.handle('dropbox:pauseRawClipsUpload', async () => {
    dropboxManager.pauseRawClipsUpload();
    return { ok: true };
  });

  ipcMain.handle('dropbox:resumeRawClipsUpload', async () => {
    dropboxManager.resumeRawClipsUpload();
    return { ok: true };
  });

  ipcMain.handle('dropbox:cancelRawClipsUpload', async () => {
    dropboxManager.cancelRawClipsUpload();
    return { ok: true };
  });

  ipcMain.handle('dropbox:getRawClipsStatus', async () => {
    return dropboxManager.getRawClipsStatus();
  });

  // --- Unified Background Transfers & Queue Manager ---
  ipcMain.handle('transfers:getAll', async () => {
    return transferManager.getAllTasks();
  });

  ipcMain.handle('transfers:pause', async (_, taskId: string) => {
    return transferManager.pauseTask(taskId);
  });

  ipcMain.handle('transfers:resume', async (_, taskId: string) => {
    return transferManager.resumeTask(taskId);
  });

  ipcMain.handle('transfers:cancel', async (_, taskId: string) => {
    return transferManager.cancelTask(taskId);
  });

  ipcMain.handle('transfers:retry', async (_, taskId: string) => {
    return transferManager.retryTask(taskId);
  });

  ipcMain.handle('transfers:clearCompleted', async () => {
    transferManager.clearCompleted();
    return { ok: true };
  });

  ipcMain.handle('transfers:remove', async (_, taskId: string) => {
    transferManager.removeTask(taskId);
    return { ok: true };
  });

  ipcMain.handle('dropbox:autoDetectTranscodedFolder', async (_, searchHint?: string, clientName?: string) => {
    return autoDetectTranscodedFolder(searchHint, clientName);
  });

  ipcMain.handle('dropbox:getConfig', async () => {
    return dropboxManager.getConfig();
  });

  ipcMain.handle('dropbox:testConnection', async () => {
    return dropboxManager.testConnection();
  });

  ipcMain.handle('dropbox:configure', async (_, cfg) => {
    return dropboxManager.saveConfig(cfg);
  });

  ipcMain.handle('revisions:getAll', async () => {
    return revisionsManager.getAll();
  });

  ipcMain.handle('revisions:add', async (_, item) => {
    return revisionsManager.addRevision(item);
  });

  ipcMain.handle('revisions:updateStatus', async (_, id, status) => {
    return revisionsManager.updateStatus(id, status);
  });

  ipcMain.handle('revisions:aiParse', async (_, text: string) => {
    return revisionsManager.parseNotesWithAI(text);
  });

  // --- Feature 7: Editor Tasks & Deliverables ---
  ipcMain.handle('editor:getDeliverables', async (_, memberId?: number) => {
    return editorManager.getDeliverables(memberId);
  });

  ipcMain.handle('editor:getTasks', async (_, assigneeId?: string | number) => {
    return editorManager.getTasks(assigneeId);
  });

  ipcMain.handle('editor:toggleTask', async (_, taskId: string) => {
    return editorManager.toggleTaskDone(taskId);
  });

  ipcMain.handle('editor:updateDeliverableStatus', async (_, id, status) => {
    return editorManager.updateDeliverableStatus(id, status);
  });

  ipcMain.handle('editor:updateDeliverableRender', async (_, id, renderPath, dropboxUrl) => {
    return editorManager.updateDeliverableRender(id, renderPath, dropboxUrl);
  });

  // --- Feature 8: Backblaze B2 Storage Handlers ---
  ipcMain.handle('b2:getConfig', async () => {
    return b2Client.getConfig();
  });

  ipcMain.handle('b2:saveConfig', async (_, cfg: { keyId: string; applicationKey: string; bucketId?: string; bucketName?: string }) => {
    try {
      b2Client.configure(cfg);
      await fs.writeFile(b2ConfigFile, JSON.stringify(cfg, null, 2), 'utf-8');
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message || 'Failed to save Backblaze B2 config' };
    }
  });

  ipcMain.handle('b2:testConnection', async () => {
    return b2Client.testConnection();
  });
}
