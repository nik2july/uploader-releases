import { contextBridge, ipcRenderer } from 'electron';
import type {
  ActiveStudioProject,
  ClipDeliveryRunState,
  ClipDeliverySettings,
  ConversionProgress,
  DataHandoffRecord,
  DetectedTranscodedFolder,
  DropboxDeliverableConfig,
  DropboxRawClipsConfig,
  DropboxUploadStatus,
  DropboxFolderUploadStatus,
  EditorDeliverable,
  EditorTask,
  EventFolderPlan,
  FolderCreationResult,
  FolderScanResult,
  FootageFolderStats,
  GDriveSyncConfig,
  GDriveSyncStatus,
  LutConversionOptions,
  LutPreset,
  ResolvedProjectContext,
  ClientRevisionItem,
  StudioClientData,
  StudioDeliverableItem,
  TransferTask
} from '../shared/contracts';

export const clipsApi = {
  // Dialogs
  openDirectory: (defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openDirectory', defaultPath),
  openFile: (options?: { extensions?: string[] }): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openFile', options),

  // Feature 1: LUT Converter
  getLutPresets: (): Promise<LutPreset[]> => ipcRenderer.invoke('lut:getPresets'),
  startLutConversion: (options: LutConversionOptions): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('lut:start', options),
  cancelLutConversion: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('lut:cancel'),
  getLutProgress: (): Promise<ConversionProgress> => ipcRenderer.invoke('lut:getProgress'),
  onLutProgress: (callback: (p: ConversionProgress) => void): (() => void) => {
    const subscription = (_: any, p: ConversionProgress) => callback(p);
    ipcRenderer.on('lut:progress', subscription);
    return () => ipcRenderer.removeListener('lut:progress', subscription);
  },

  // Feature 2: Folder Structure Creator
  getStudioClients: (): Promise<StudioClientData[]> => ipcRenderer.invoke('studio:getClients'),
  syncStudioClients: (): Promise<{ ok: boolean; count: number; error?: string }> =>
    ipcRenderer.invoke('studio:syncLive'),
  getClientDeliverables: (
    clientName: string
  ): Promise<{ videoDeliverables: StudioDeliverableItem[]; photoDeliverables: StudioDeliverableItem[] }> =>
    ipcRenderer.invoke('studio:getClientDeliverables', clientName),
  saveClientDeliverables: (
    clientName: string,
    videoDeliverables: StudioDeliverableItem[],
    photoDeliverables: StudioDeliverableItem[]
  ): Promise<boolean> =>
    ipcRenderer.invoke('studio:saveClientDeliverables', clientName, videoDeliverables, photoDeliverables),
  createFolderStructure: (plan: EventFolderPlan): Promise<FolderCreationResult> =>
    ipcRenderer.invoke('folder:create', plan),
  revealFolder: (folderPath: string): Promise<boolean> => ipcRenderer.invoke('folder:reveal', folderPath),
  downloadUniversalQR: (variant?: string): Promise<{ success: boolean; path?: string; fileName?: string; error?: string }> =>
    ipcRenderer.invoke('qr:downloadUniversal', variant),
  resolveProjectContext: (inputPath: string): Promise<ResolvedProjectContext | null> =>
    ipcRenderer.invoke('project:resolveContext', inputPath),
  getActiveProject: (): Promise<ActiveStudioProject | null> => ipcRenderer.invoke('project:getActive'),
  setActiveProject: (proj: ActiveStudioProject): Promise<boolean> =>
    ipcRenderer.invoke('project:setActive', proj),
  getFootageStats: (folderPath: string): Promise<FootageFolderStats> =>
    ipcRenderer.invoke('footage:getStats', folderPath),

  // Feature 3: Data Handoff & WhatsApp API
  scanFootageFolder: (targetPath: string): Promise<FolderScanResult> =>
    ipcRenderer.invoke('handoff:scanFolder', targetPath),
  logDataHandoff: (record: DataHandoffRecord): Promise<DataHandoffRecord> =>
    ipcRenderer.invoke('handoff:logData', record),
  getWhatsAppConfig: (): Promise<any> => ipcRenderer.invoke('whatsapp:getConfig'),
  updateWhatsAppConfig: (cfg: any): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('whatsapp:updateConfig', cfg),

  // Feature 4: Google Drive Daily Sync
  getGDriveConfig: (): Promise<GDriveSyncConfig> => ipcRenderer.invoke('gdrive:getConfig'),
  updateGDriveConfig: (patch: Partial<GDriveSyncConfig>): Promise<GDriveSyncConfig> =>
    ipcRenderer.invoke('gdrive:updateConfig', patch),
  getGDriveStatus: (): Promise<GDriveSyncStatus> => ipcRenderer.invoke('gdrive:getStatus'),
  startGDriveSync: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('gdrive:startSync'),
  onGDriveStatus: (callback: (s: GDriveSyncStatus) => void): (() => void) => {
    const subscription = (_: any, s: GDriveSyncStatus) => callback(s);
    ipcRenderer.on('gdrive:status', subscription);
    return () => ipcRenderer.removeListener('gdrive:status', subscription);
  },

  // Feature 5: Client Clips Delivery
  startClipsDelivery: (settings: ClipDeliverySettings): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('clips:start', settings),
  pauseDelivery: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('clips:pause'),
  resumeDelivery: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('clips:resume'),
  cancelClipsDelivery: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('clips:cancel'),
  getClipsDeliveryState: (): Promise<ClipDeliveryRunState> => ipcRenderer.invoke('clips:getState'),
  onClipsDeliveryState: (callback: (s: ClipDeliveryRunState) => void): (() => void) => {
    const subscription = (_: any, s: ClipDeliveryRunState) => callback(s);
    ipcRenderer.on('clips:state', subscription);
    return () => ipcRenderer.removeListener('clips:state', subscription);
  },

  // Feature 6: Dropbox Deliverables & Client Revisions
  createDropboxFolder: (clientName: string, deliverableTitle: string): Promise<string> =>
    ipcRenderer.invoke('dropbox:createFolder', clientName, deliverableTitle),
  uploadDropboxDeliverable: (
    config: DropboxDeliverableConfig
  ): Promise<{ shareUrl?: string; whatsappSent?: boolean; error?: string }> =>
    ipcRenderer.invoke('dropbox:uploadAndShare', config),
  getDropboxConfig: (): Promise<{ appKey?: string; appSecret?: string; refreshToken?: string; accessToken?: string }> =>
    ipcRenderer.invoke('dropbox:getConfig'),
  testDropboxConnection: (): Promise<{ ok: boolean; email?: string; error?: string; missingScopes?: string[] }> =>
    ipcRenderer.invoke('dropbox:testConnection'),
  configureDropbox: (cfg: any): Promise<{ ok: boolean; email?: string; error?: string; missingScopes?: string[] }> =>
    ipcRenderer.invoke('dropbox:configure', cfg),
  onDropboxStatus: (callback: (s: DropboxUploadStatus) => void): (() => void) => {
    const subscription = (_: any, s: DropboxUploadStatus) => callback(s);
    ipcRenderer.on('dropbox:status', subscription);
    return () => ipcRenderer.removeListener('dropbox:status', subscription);
  },
  uploadDropboxRawClips: (
    config: DropboxRawClipsConfig
  ): Promise<{ ok: boolean; shareUrl?: string; totalUploaded: number; whatsappSent?: boolean; error?: string }> =>
    ipcRenderer.invoke('dropbox:uploadRawClipsFolder', config),
  pauseDropboxRawClips: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('dropbox:pauseRawClipsUpload'),
  resumeDropboxRawClips: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('dropbox:resumeRawClipsUpload'),
  cancelDropboxRawClips: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('dropbox:cancelRawClipsUpload'),
  getDropboxRawClipsStatus: (): Promise<DropboxFolderUploadStatus> =>
    ipcRenderer.invoke('dropbox:getRawClipsStatus'),
  onDropboxRawClipsStatus: (callback: (s: DropboxFolderUploadStatus) => void): (() => void) => {
    const subscription = (_: any, s: DropboxFolderUploadStatus) => callback(s);
    ipcRenderer.on('dropbox:rawClipsStatus', subscription);
    return () => ipcRenderer.removeListener('dropbox:rawClipsStatus', subscription);
  },
  autoDetectTranscodedFolder: (
    searchHint?: string,
    clientName?: string
  ): Promise<DetectedTranscodedFolder> =>
    ipcRenderer.invoke('dropbox:autoDetectTranscodedFolder', searchHint, clientName),

  // Feature 6.5: Unified Background Transfers & Queue Manager
  getTransfers: (): Promise<TransferTask[]> => ipcRenderer.invoke('transfers:getAll'),
  pauseTransfer: (id: string): Promise<boolean> => ipcRenderer.invoke('transfers:pause', id),
  resumeTransfer: (id: string): Promise<boolean> => ipcRenderer.invoke('transfers:resume', id),
  cancelTransfer: (id: string): Promise<boolean> => ipcRenderer.invoke('transfers:cancel', id),
  retryTransfer: (id: string): Promise<boolean> => ipcRenderer.invoke('transfers:retry', id),
  clearCompletedTransfers: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('transfers:clearCompleted'),
  removeTransfer: (id: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('transfers:remove', id),
  onTransfersUpdated: (callback: (tasks: TransferTask[]) => void): (() => void) => {
    const subscription = (_: any, tasks: TransferTask[]) => callback(tasks);
    ipcRenderer.on('transfers:updated', subscription);
    return () => ipcRenderer.removeListener('transfers:updated', subscription);
  },

  getRevisions: (): Promise<ClientRevisionItem[]> => ipcRenderer.invoke('revisions:getAll'),
  addRevision: (
    item: Omit<ClientRevisionItem, 'id' | 'timestamp' | 'updatedAt'>
  ): Promise<ClientRevisionItem> => ipcRenderer.invoke('revisions:add', item),
  updateRevisionStatus: (
    id: string,
    status: ClientRevisionItem['status']
  ): Promise<ClientRevisionItem | null> => ipcRenderer.invoke('revisions:updateStatus', id, status),
  aiParseNotes: (text: string): Promise<{ points: string; timecodes: string; summary: string }> =>
    ipcRenderer.invoke('revisions:aiParse', text),

  // Feature 7: Editor Deliverables & Tasks
  getEditorDeliverables: (memberId?: number): Promise<EditorDeliverable[]> =>
    ipcRenderer.invoke('editor:getDeliverables', memberId),
  getEditorTasks: (assigneeId?: string | number): Promise<EditorTask[]> =>
    ipcRenderer.invoke('editor:getTasks', assigneeId),
  toggleEditorTask: (taskId: string): Promise<EditorTask | null> =>
    ipcRenderer.invoke('editor:toggleTask', taskId),
  updateDeliverableStatus: (
    id: string,
    status: EditorDeliverable['status']
  ): Promise<EditorDeliverable | null> =>
    ipcRenderer.invoke('editor:updateDeliverableStatus', id, status),
  updateDeliverableRender: (
    id: string,
    renderPath: string,
    dropboxUrl?: string
  ): Promise<EditorDeliverable | null> =>
    ipcRenderer.invoke('editor:updateDeliverableRender', id, renderPath, dropboxUrl),

  // Feature 8: Backblaze B2 Storage
  getB2Config: (): Promise<{ keyId: string; applicationKey: string; bucketId: string; bucketName: string; isConfigured: boolean }> =>
    ipcRenderer.invoke('b2:getConfig'),
  saveB2Config: (cfg: { keyId: string; applicationKey: string; bucketId?: string; bucketName?: string }): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('b2:saveConfig', cfg),
  testB2Connection: (): Promise<{ ok: boolean; message: string; accountId?: string }> =>
    ipcRenderer.invoke('b2:testConnection'),

  // Feature 9: App Profile
  getStartupProfile: (): Promise<string> => ipcRenderer.invoke('app:getStartupProfile')
};

contextBridge.exposeInMainWorld('clipsApi', clipsApi);
