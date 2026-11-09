import { app, BrowserWindow, shell, ipcMain } from 'electron';
import { join } from 'node:path';
import fs from 'node:fs';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { registerIpcHandlers } from './ipc';

const LOG_FILE = '/tmp/baawaray_post_production.log';
function log(msg: string): void {
  try {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

process.on('uncaughtException', err => {
  log(`Uncaught exception: ${err?.stack || err}`);
});

process.on('unhandledRejection', reason => {
  log(`Unhandled rejection: ${reason}`);
});

function createWindow(): BrowserWindow {
  log('createWindow called');

  const profileArg = process.argv.find(arg => arg.startsWith('--profile='));
  let profile = profileArg ? profileArg.split('=')[1] : '';
  if (!profile) {
    const lifecycle = process.env.npm_lifecycle_event || '';
    if (lifecycle.includes('admin')) profile = 'admin';
    else if (lifecycle.includes('photo')) profile = 'photo';
    else if (lifecycle.includes('video')) profile = 'video';
  }
  if (!profile) profile = 'admin';

  ipcMain.removeHandler('app:getStartupProfile');
  ipcMain.handle('app:getStartupProfile', () => profile);

  const titleMap: Record<string, string> = {
    admin: 'Baawaray Films • Post-Production Studio Lead & Command Center',
    photo: 'Baawaray Films • Photo Editor Studio & Album Maker',
    video: 'Baawaray Films • Video Editor Studio & Clips Engine'
  };

  const mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 1040,
    minHeight: 700,
    title: titleMap[profile] || titleMap.admin,
    show: true,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#FBFAF7',
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on('ready-to-show', () => {
    log('mainWindow ready-to-show');
    mainWindow.show();
  });

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log(`did-fail-load: ${code} ${desc} ${url}`);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    log('did-finish-load');
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    log(`[RENDERER-CONSOLE lvl:${level}] ${message} (${sourceId}:${line})`);
  });

  mainWindow.webContents.setWindowOpenHandler(details => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  try {
    log('registering IPC handlers...');
    registerIpcHandlers(mainWindow);
    log('IPC handlers registered successfully');
  } catch (err: any) {
    log(`Error in registerIpcHandlers: ${err?.stack || err}`);
  }

  const rendererHtml = join(__dirname, '../renderer/index.html');
  log(`renderer HTML path: ${rendererHtml}, exists: ${fs.existsSync(rendererHtml)}`);

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    log(`loading dev URL: ${process.env['ELECTRON_RENDERER_URL']}?profile=${profile}`);
    mainWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?profile=${profile}`);
  } else {
    log(`loading file: ${rendererHtml} with profile=${profile}`);
    mainWindow.loadFile(rendererHtml, { query: { profile } });
  }

  return mainWindow;
}

app.whenReady().then(() => {
  log('app.whenReady');
  electronApp.setAppUserModelId('com.baawaray.postproduction');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  log('window-all-closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
