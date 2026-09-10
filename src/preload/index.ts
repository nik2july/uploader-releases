import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI } from '../shared/contracts';
const api: DesktopAPI = {
  login: (phone, password) => ipcRenderer.invoke('studio:login', phone, password),
  authorize: token => ipcRenderer.invoke('studio:authorize', token), signOut: () => ipcRenderer.invoke('studio:signOut'),
  scan: (options, target) => ipcRenderer.invoke('scanner:start', options, target), cancelScan: id => ipcRenderer.invoke('scanner:cancel', id),
  scanFiles: (options, target) => ipcRenderer.invoke('scanner:startFiles', options, target),
  list: () => ipcRenderer.invoke('transfers:list'), inspect: id => ipcRenderer.invoke('transfers:inspect', id),
  refreshDriveConfiguration: () => ipcRenderer.invoke('drive:configuration'),
  connectDrive: idToken => ipcRenderer.invoke('drive:connect', idToken), driveStatus: () => ipcRenderer.invoke('drive:status'),
  disconnectDrive: () => ipcRenderer.invoke('drive:disconnect'),
  dropboxStatus: () => ipcRenderer.invoke('studio:dropboxStatus'),
  connectDropbox: (token) => ipcRenderer.invoke('studio:connectDropbox', token),
  disconnectDropbox: () => ipcRenderer.invoke('studio:disconnectDropbox'),
  b2Status: () => ipcRenderer.invoke('studio:b2Status'),
  connectB2: (config) => ipcRenderer.invoke('studio:connectB2', config),
  disconnectB2: () => ipcRenderer.invoke('studio:disconnectB2'),
  deleteB2Folder: (prefix) => ipcRenderer.invoke('studio:deleteB2Folder', prefix),
  chooseDeliverableFile: () => ipcRenderer.invoke('dialog:openVideoFile'),
  uploadDeliverable: (jobId, filePath, targetFolder, fileName) => ipcRenderer.invoke('studio:uploadDeliverable', jobId, filePath, targetFolder, fileName),
  onUploadProgress: callback => {
    const listener = (_: any, data: any): void => callback(data);
    ipcRenderer.on('upload:progress', listener);
    return () => { ipcRenderer.removeListener('upload:progress', listener); };
  },
  chooseDownloadDirectory: () => ipcRenderer.invoke('studio:chooseDownloadDirectory'),
  downloadRawData: (jobId, rawDataLink, destDir) => ipcRenderer.invoke('studio:downloadRawData', jobId, rawDataLink, destDir),
  cancelDownload: jobId => ipcRenderer.invoke('studio:cancelDownload', jobId),
  onDownloadProgress: callback => {
    const listener = (_: any, data: any): void => callback(data);
    ipcRenderer.on('download:progress', listener);
    return () => { ipcRenderer.removeListener('download:progress', listener); };
  },
  verifyLocalFolder: (jobId, folderPath) => ipcRenderer.invoke('studio:verifyLocalFolder', jobId, folderPath),
  openDownloadedFolder: jobId => ipcRenderer.invoke('studio:openDownloadedFolder', jobId),
  forgetDownloadedFolder: jobId => ipcRenderer.invoke('studio:forgetDownloadedFolder', jobId),
  checkDiskSpace: targetPath => ipcRenderer.invoke('studio:checkDiskSpace', targetPath),
  getDownloadSize: rawDataLink => ipcRenderer.invoke('studio:getDownloadSize', rawDataLink),
  deleteDriveFolder: folderId => ipcRenderer.invoke('studio:deleteDriveFolder', folderId),
  deleteDropboxFile: dropboxPath => ipcRenderer.invoke('studio:deleteDropboxFile', dropboxPath),
  downloadDropboxFile: (dropboxPath, localPath) => ipcRenderer.invoke('studio:downloadDropboxFile', dropboxPath, localPath),
  chooseSaveLocation: defaultFileName => ipcRenderer.invoke('studio:chooseSaveLocation', defaultFileName),
  enqueue: (id, target, invoice) => ipcRenderer.invoke('transfers:enqueue', id, target, invoice),
  pause: id => ipcRenderer.invoke('transfers:pause', id), resume: id => ipcRenderer.invoke('transfers:resume', id),
  relocate: id => ipcRenderer.invoke('transfers:relocate', id), rescan: id => ipcRenderer.invoke('transfers:rescan', id), share: (id, mode, email) => ipcRenderer.invoke('transfers:share', id, mode, email),
  markSynced: id => ipcRenderer.invoke('transfers:synced', id),
  markMessagePrepared: id => ipcRenderer.invoke('transfers:prepared', id), saveInvoice: (id, invoice) => ipcRenderer.invoke('invoice:save', id, invoice),
  savePdf: (bytes, filename) => ipcRenderer.invoke('invoice:pdf', bytes, filename),
  openExternal: url => ipcRenderer.invoke('external:open', url),
  setKeepAwake: on => ipcRenderer.invoke('power:keepAwake', on),
  checkForUpdate: () => ipcRenderer.invoke('updates:check'), appVersion: () => ipcRenderer.invoke('app:version'), diagnostics: () => ipcRenderer.invoke('app:diagnostics'),
  onChange: callback => { const listener = (): void => callback(); ipcRenderer.on('transfers:changed', listener); return () => { ipcRenderer.removeListener('transfers:changed', listener); }; }
};
contextBridge.exposeInMainWorld('api', api);
