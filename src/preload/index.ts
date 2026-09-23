import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { ClipRunState, DesktopAPI, PhotoRunState } from '../shared/contracts';
const api: DesktopAPI = {
  login: (phone, password) => ipcRenderer.invoke('studio:login', phone, password),
  authorize: token => ipcRenderer.invoke('studio:authorize', token), signOut: () => ipcRenderer.invoke('studio:signOut'),
  scan: (options, target) => ipcRenderer.invoke('scanner:start', options, target), cancelScan: id => ipcRenderer.invoke('scanner:cancel', id),
  scanFiles: (options, target) => ipcRenderer.invoke('scanner:startFiles', options, target),
  scanOfflineFolder: target => ipcRenderer.invoke('scanner:scanOfflineFolder', target),
  list: () => ipcRenderer.invoke('transfers:list'), inspect: id => ipcRenderer.invoke('transfers:inspect', id),
  refreshDriveConfiguration: () => ipcRenderer.invoke('drive:configuration'),
  connectDrive: idToken => ipcRenderer.invoke('drive:connect', idToken), driveStatus: () => ipcRenderer.invoke('drive:status'),
  disconnectDrive: () => ipcRenderer.invoke('drive:disconnect'),
  setUploadDestination: destination => ipcRenderer.invoke('transfers:destination', destination),
  setSharedDriveId: driveId => ipcRenderer.invoke('transfers:sharedDriveId', driveId),
  removeTransfer: (id, keepUploaded) => ipcRenderer.invoke('transfers:remove', id, keepUploaded),
  downloadUpdate: info => ipcRenderer.invoke('updates:download', info),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  logRendererError: (message, stack) => ipcRenderer.invoke('log:rendererError', message, stack),
  onUpdateProgress: callback => {
    const listener = (_: unknown, data: { received: number; total: number }): void => callback(data);
    ipcRenderer.on('update:progress', listener);
    return () => { ipcRenderer.removeListener('update:progress', listener); };
  },
  dropboxStatus: () => ipcRenderer.invoke('studio:dropboxStatus'),
  connectDropbox: (token) => ipcRenderer.invoke('studio:connectDropbox', token),
  disconnectDropbox: () => ipcRenderer.invoke('studio:disconnectDropbox'),
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
  pauseDownload: jobId => ipcRenderer.invoke('studio:pauseDownload', jobId),
  getActiveDownload: jobId => ipcRenderer.invoke('studio:getActiveDownload', jobId),
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
  getDownloadDetails: rawDataLink => ipcRenderer.invoke('studio:getDownloadDetails', rawDataLink),
  deleteDriveFolder: folderId => ipcRenderer.invoke('studio:deleteDriveFolder', folderId),
  deleteDropboxFile: dropboxPath => ipcRenderer.invoke('studio:deleteDropboxFile', dropboxPath),
  downloadDropboxFile: (dropboxPath, localPath) => ipcRenderer.invoke('studio:downloadDropboxFile', dropboxPath, localPath),
  chooseSaveLocation: defaultFileName => ipcRenderer.invoke('studio:chooseSaveLocation', defaultFileName),
  enqueue: (id, target, invoice) => ipcRenderer.invoke('transfers:enqueue', id, target, invoice),
  pause: id => ipcRenderer.invoke('transfers:pause', id), resume: id => ipcRenderer.invoke('transfers:resume', id),
  relocate: id => ipcRenderer.invoke('transfers:relocate', id), rescan: id => ipcRenderer.invoke('transfers:rescan', id),
  skipUnreadableFiles: id => ipcRenderer.invoke('transfers:skipUnreadable', id),
  share: (id, mode, email) => ipcRenderer.invoke('transfers:share', id, mode, email),
  markSynced: id => ipcRenderer.invoke('transfers:synced', id),
  markMessagePrepared: id => ipcRenderer.invoke('transfers:prepared', id), saveInvoice: (id, invoice) => ipcRenderer.invoke('invoice:save', id, invoice),
  savePdf: (bytes, filename) => ipcRenderer.invoke('invoice:pdf', bytes, filename),
  openExternal: url => ipcRenderer.invoke('external:open', url),
  setKeepAwake: on => ipcRenderer.invoke('power:keepAwake', on),
  autoResumeTransfers: () => ipcRenderer.invoke('transfers:autoResume'),
  getAutoStart: () => ipcRenderer.invoke('app:getAutoStart'),
  setAutoStart: enable => ipcRenderer.invoke('app:setAutoStart', enable),
  checkForUpdate: () => ipcRenderer.invoke('updates:check'),
  appVersion: () => ipcRenderer.invoke('app:version'),
  diagnostics: () => ipcRenderer.invoke('app:diagnostics'),
  copyToClipboard: (text: string) => ipcRenderer.invoke('clipboard:writeText', text),
  createClientFolderStructure: tree => ipcRenderer.invoke('utility:createClientFolderStructure', tree),
  onChange: callback => { const listener = (): void => callback(); ipcRenderer.on('transfers:changed', listener); return () => { ipcRenderer.removeListener('transfers:changed', listener); }; },
  // Utilities — Duration, Missing Clips, Clip Delivery, Photo Delivery.
  utilityStatus: () => ipcRenderer.invoke('utility:status'),
  chooseUtilityFolder: (title, buttonLabel) => ipcRenderer.invoke('utility:chooseFolder', title, buttonLabel),
  folderOfPath: path => ipcRenderer.invoke('utility:folderOf', path),
  // Electron no longer puts a path on the File object; this is the way to read it.
  pathForFile: file => webUtils.getPathForFile(file),
  revealInFinder: path => ipcRenderer.invoke('utility:reveal', path),
  openPath: path => ipcRenderer.invoke('utility:open', path),
  saveTextFile: (defaultName, text) => ipcRenderer.invoke('utility:saveText', defaultName, text),
  scanDurations: (rootPath, kinds) => ipcRenderer.invoke('utility:duration:scan', rootPath, kinds),
  cancelDurationScan: () => ipcRenderer.invoke('utility:duration:cancel'),
  onDurationProgress: callback => {
    const listener = (_: unknown, data: { done: number; total: number }): void => callback(data);
    ipcRenderer.on('utility:duration:progress', listener);
    return () => { ipcRenderer.removeListener('utility:duration:progress', listener); };
  },
  scanSequences: (rootPath, options) => ipcRenderer.invoke('utility:sequences:scan', rootPath, options),
  cancelSequenceScan: () => ipcRenderer.invoke('utility:sequences:cancel'),
  onSequenceProgress: callback => {
    const listener = (_: unknown, data: { seen: number }): void => callback(data);
    ipcRenderer.on('utility:sequences:progress', listener);
    return () => { ipcRenderer.removeListener('utility:sequences:progress', listener); };
  },
  clipState: () => ipcRenderer.invoke('utility:clip:state'),
  clipScan: sourcePath => ipcRenderer.invoke('utility:clip:scan', sourcePath),
  clipSetDestination: destinationPath => ipcRenderer.invoke('utility:clip:destination', destinationPath),
  clipStart: (destinationPath, choice) => ipcRenderer.invoke('utility:clip:start', destinationPath, choice),
  clipCancel: () => ipcRenderer.invoke('utility:clip:cancel'),
  onClipState: callback => {
    const listener = (_: unknown, state: ClipRunState): void => callback(state);
    ipcRenderer.on('utility:clip', listener);
    return () => { ipcRenderer.removeListener('utility:clip', listener); };
  },
  photoState: () => ipcRenderer.invoke('utility:photo:state'),
  photoScan: sourcePath => ipcRenderer.invoke('utility:photo:scan', sourcePath),
  photoSetPresets: presetIds => ipcRenderer.invoke('utility:photo:presets', presetIds),
  photoSetOutputRoot: outputRoot => ipcRenderer.invoke('utility:photo:outputRoot', outputRoot),
  photoStart: () => ipcRenderer.invoke('utility:photo:start'),
  photoCancel: () => ipcRenderer.invoke('utility:photo:cancel'),
  onPhotoState: callback => {
    const listener = (_: unknown, state: PhotoRunState): void => callback(state);
    ipcRenderer.on('utility:photo', listener);
    return () => { ipcRenderer.removeListener('utility:photo', listener); };
  }
};
contextBridge.exposeInMainWorld('api', api);
