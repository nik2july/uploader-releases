import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI } from '../shared/contracts';
const api: DesktopAPI = {
  login: (phone, password) => ipcRenderer.invoke('studio:login', phone, password),
  authorize: token => ipcRenderer.invoke('studio:authorize', token), signOut: () => ipcRenderer.invoke('studio:signOut'),
  scan: (options, target) => ipcRenderer.invoke('scanner:start', options, target), cancelScan: id => ipcRenderer.invoke('scanner:cancel', id),
  list: () => ipcRenderer.invoke('transfers:list'), inspect: id => ipcRenderer.invoke('transfers:inspect', id),
  refreshDriveConfiguration: () => ipcRenderer.invoke('drive:configuration'),
  connectDrive: idToken => ipcRenderer.invoke('drive:connect', idToken), driveStatus: () => ipcRenderer.invoke('drive:status'),
  disconnectDrive: () => ipcRenderer.invoke('drive:disconnect'),
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
