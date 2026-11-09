import type { BrowserWindow } from 'electron';
import type {
  TransferTask,
  TaskType,
  TaskStatus,
  ClipDeliveryRunState,
  DropboxFolderUploadStatus,
  ConversionProgress,
  ClipDeliverySettings,
  DropboxRawClipsConfig
} from '../shared/contracts';
import { clipDeliveryEngineRef, dropboxManagerRef, lutEngineRef } from './engineReferences';

class TransferManagerClass {
  private tasks: Map<string, TransferTask> = new Map();
  private mainWindow: BrowserWindow | null = null;
  private activeTranscodeTaskId: string | null = null;
  private activeDropboxTaskId: string | null = null;
  private activeLutTaskId: string | null = null;

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  private broadcast(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('transfers:updated', this.getAllTasks());
    }
  }

  getAllTasks(): TransferTask[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  getTask(id: string): TransferTask | undefined {
    return this.tasks.get(id);
  }

  createTask(params: {
    type: TaskType;
    title: string;
    subtitle?: string;
    clientName?: string;
    eventName?: string;
    totalFiles?: number;
    totalBytes?: number;
    payload?: any;
  }): TransferTask {
    const id = `${params.type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const task: TransferTask = {
      id,
      type: params.type,
      title: params.title,
      subtitle: params.subtitle,
      clientName: params.clientName,
      eventName: params.eventName,
      status: 'running',
      progress: 0,
      currentFile: '',
      currentFileIndex: 0,
      totalFiles: params.totalFiles || 0,
      bytesDone: 0,
      totalBytes: params.totalBytes || 0,
      logs: [`Started ${params.title}`],
      createdAt: Date.now(),
      startedAt: Date.now(),
      payload: params.payload
    };

    if (params.type === 'transcode') {
      this.activeTranscodeTaskId = id;
    } else if (params.type === 'dropbox_upload') {
      this.activeDropboxTaskId = id;
    }

    this.tasks.set(id, task);
    this.broadcast();
    return task;
  }

  updateTask(id: string, patch: Partial<TransferTask>, logLine?: string): void {
    const task = this.tasks.get(id);
    if (!task) return;

    const logs = logLine ? [...task.logs, logLine].slice(-250) : task.logs;
    const updated: TransferTask = {
      ...task,
      ...patch,
      logs
    };

    if (patch.status === 'completed' || patch.status === 'cancelled' || patch.status === 'error') {
      updated.completedAt = Date.now();
      if (this.activeTranscodeTaskId === id) this.activeTranscodeTaskId = null;
      if (this.activeDropboxTaskId === id) this.activeDropboxTaskId = null;
      if (this.activeLutTaskId === id) this.activeLutTaskId = null;
    }

    this.tasks.set(id, updated);
    this.broadcast();
  }

  // --- Controls: Pause, Resume, Stop/Cancel, Retry ---
  pauseTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;

    if (task.type === 'transcode') {
      if (clipDeliveryEngineRef.current) {
        clipDeliveryEngineRef.current.pause();
      }
      if (lutEngineRef.current) {
        lutEngineRef.current.pause();
      }
    } else if (task.type === 'dropbox_upload') {
      if (dropboxManagerRef.current) {
        dropboxManagerRef.current.pauseRawClipsUpload();
      }
    }

    this.updateTask(id, { status: 'paused' }, '⏸ Task paused by user');
    return true;
  }

  resumeTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;

    if (task.type === 'transcode') {
      if (clipDeliveryEngineRef.current) {
        clipDeliveryEngineRef.current.resume();
      }
      if (lutEngineRef.current) {
        lutEngineRef.current.resume();
      }
    } else if (task.type === 'dropbox_upload') {
      if (dropboxManagerRef.current) {
        dropboxManagerRef.current.resumeRawClipsUpload();
      }
    }

    this.updateTask(id, { status: 'running' }, '▶ Task resumed by user');
    return true;
  }

  cancelTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;

    if (task.type === 'transcode') {
      if (clipDeliveryEngineRef.current) {
        clipDeliveryEngineRef.current.cancel();
      }
      if (lutEngineRef.current) {
        lutEngineRef.current.cancel();
      }
    } else if (task.type === 'dropbox_upload') {
      if (dropboxManagerRef.current) {
        dropboxManagerRef.current.cancelRawClipsUpload();
      }
    }

    this.updateTask(id, { status: 'cancelled' }, '⏹ Task cancelled by user');
    return true;
  }

  retryTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task || !task.payload) return false;

    if (task.type === 'dropbox_upload' && task.payload.config) {
      this.cancelTask(id);
      const cfg: DropboxRawClipsConfig = task.payload.config;
      this.createTask({
        type: 'dropbox_upload',
        title: task.title,
        subtitle: task.subtitle,
        clientName: task.clientName,
        eventName: task.eventName,
        payload: task.payload
      });
      if (dropboxManagerRef.current) {
        void dropboxManagerRef.current.uploadRawClipsFolder(cfg, s => {
          this.syncDropboxRawClips(s);
          if (this.mainWindow) {
            this.mainWindow.webContents.send('dropbox:rawClipsStatus', s);
          }
        });
      }
      return true;
    }

    if (task.type === 'transcode' && task.payload.settings) {
      this.cancelTask(id);
      const settings: ClipDeliverySettings = task.payload.settings;
      this.createTask({
        type: 'transcode',
        title: task.title,
        subtitle: task.subtitle,
        clientName: task.clientName,
        eventName: task.eventName,
        payload: task.payload
      });
      if (clipDeliveryEngineRef.current) {
        void clipDeliveryEngineRef.current.startDelivery(settings);
      }
      return true;
    }

    return false;
  }

  clearCompleted(): void {
    for (const [id, task] of this.tasks.entries()) {
      if (task.status === 'completed' || task.status === 'cancelled') {
        this.tasks.delete(id);
      }
    }
    this.broadcast();
  }

  removeTask(id: string): void {
    const task = this.tasks.get(id);
    if (task && (task.status === 'running' || task.status === 'paused')) {
      this.cancelTask(id);
    }
    this.tasks.delete(id);
    this.broadcast();
  }

  // --- Engine State Synchronizers ---
  syncClipDelivery(state: ClipDeliveryRunState, clientName?: string, eventName?: string): void {
    let task: TransferTask | undefined;
    if (this.activeTranscodeTaskId) {
      task = this.tasks.get(this.activeTranscodeTaskId);
    }

    if (!task && state.state === 'running') {
      task = this.createTask({
        type: 'transcode',
        title: `${clientName || 'Client'} — Clips Delivery Export`,
        subtitle: `Transcoding ${state.totalCount || 'raw'} clips to Rec.709`,
        clientName,
        eventName,
        totalFiles: state.totalCount
      });
      this.activeTranscodeTaskId = task.id;
    }

    if (!task) return;

    let mappedStatus: TaskStatus = 'running';
    if (state.state === 'paused') mappedStatus = 'paused';
    else if (state.state === 'completed') mappedStatus = 'completed';
    else if (state.state === 'cancelled') mappedStatus = 'cancelled';
    else if (state.state === 'error') mappedStatus = 'error';

    this.updateTask(task.id, {
      status: mappedStatus,
      progress: state.percent,
      currentFile: state.currentFile,
      currentFileIndex: state.completedCount,
      totalFiles: state.totalCount,
      logs: state.logs,
      error: state.error
    });
  }

  syncDropboxRawClips(status: DropboxFolderUploadStatus, clientName?: string, eventName?: string): void {
    let task: TransferTask | undefined;
    if (this.activeDropboxTaskId) {
      task = this.tasks.get(this.activeDropboxTaskId);
    }

    if (!task && (status.state === 'uploading' || status.state === 'scanning')) {
      task = this.createTask({
        type: 'dropbox_upload',
        title: `${clientName || 'Client'} — Dropbox Raw Clips Upload`,
        subtitle: `${status.totalFiles || 'All'} transcoded clips to Cloud`,
        clientName,
        eventName,
        totalFiles: status.totalFiles,
        totalBytes: status.totalBytes
      });
      this.activeDropboxTaskId = task.id;
    }

    if (!task) return;

    let mappedStatus: TaskStatus = 'running';
    if (status.state === 'paused') mappedStatus = 'paused';
    else if (status.state === 'completed') mappedStatus = 'completed';
    else if (status.state === 'cancelled') mappedStatus = 'cancelled';
    else if (status.state === 'error') mappedStatus = 'error';

    this.updateTask(task.id, {
      status: mappedStatus,
      progress: status.overallPercent,
      currentFile: status.currentFileName,
      currentFileIndex: status.currentFileIndex,
      totalFiles: status.totalFiles,
      bytesDone: status.bytesUploaded,
      totalBytes: status.totalBytes,
      speed: status.speed,
      shareUrl: status.shareUrl,
      logs: status.logs,
      error: status.error
    });
  }

  syncLutConversion(progress: ConversionProgress): void {
    let task: TransferTask | undefined;
    if (this.activeLutTaskId) {
      task = this.tasks.get(this.activeLutTaskId);
    }

    if (!task && progress.state === 'converting') {
      task = this.createTask({
        type: 'transcode',
        title: 'Batch LUT Rec.709 Conversion',
        subtitle: `${progress.totalClips} video clips`,
        totalFiles: progress.totalClips
      });
      this.activeLutTaskId = task.id;
    }

    if (!task) return;

    let mappedStatus: TaskStatus = 'running';
    if (progress.state === 'paused') mappedStatus = 'paused';
    else if (progress.state === 'completed') mappedStatus = 'completed';
    else if (progress.state === 'cancelled') mappedStatus = 'cancelled';
    else if (progress.state === 'error') mappedStatus = 'error';

    this.updateTask(task.id, {
      status: mappedStatus,
      progress: progress.percent,
      currentFile: progress.currentClipName,
      currentFileIndex: progress.currentClipIndex,
      totalFiles: progress.totalClips,
      speed: progress.speed,
      logs: progress.logs,
      error: progress.error
    });
  }
}

export const transferManager = new TransferManagerClass();
