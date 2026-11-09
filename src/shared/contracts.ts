// ==============================================================================
// Baawaray Films • Unified Post-Production Powerhouse Contracts
// ==============================================================================

export type EditorProfileType = 'admin' | 'photo' | 'video';

export type RawHandoffMode = 'hard_drive' | 'cloud_transfer';

export interface InHouseHandoffRecord {
  jobId: string;
  clientId: string;
  clientName: string;
  handoffMode: 'hard_drive';
  driveLabel: string; // e.g. "SanDisk Extreme 2TB #1"
  mountPath: string; // e.g. "/Volumes/T7_Shield/261028_Dikshant_Moreen"
  rawPhotoCount?: number;
  rawDurationHours?: number;
  rawDurationMinutes?: number;
  handedToEditorId: string;
  handedToEditorName: string;
  handedAt: string;
  status: 'assigned' | 'drive_connected' | 'in_process' | 'completed';
}

export interface FreelanceHandoffRecord {
  jobId: string;
  clientId: string;
  clientName: string;
  handoffMode: 'cloud_transfer';
  cloudFolderId?: string;
  cloudUrl?: string;
  transferJobId?: string;
  bytesTotal?: number;
  bytesUploaded?: number;
  isVerified: boolean;
  assignedToEditorId: string;
  assignedToEditorName: string;
  status: 'upload_pending' | 'uploading' | 'ready_for_editor' | 'downloading' | 'in_process';
}

// Re-export / merge existing contracts
export interface LutPreset {
  id: string;
  name: string;
  description: string;
  path: string;
  isBuiltIn: boolean;
}

export type VideoQualityPreset = 'archive' | 'balanced' | 'compact' | 'proxy';
export type VideoCodecChoice = 'h264_videotoolbox' | 'hevc_videotoolbox' | 'prores_videotoolbox' | 'libx264';
export type FpsCapChoice = 'original' | 24 | 25 | 30 | 50 | 60 | 100 | 120;

export interface LutConversionOptions {
  sourcePath: string;
  destinationPath: string;
  lutPath: string;
  lutName: string;
  quality: VideoQualityPreset;
  codec: VideoCodecChoice;
  fullHD: boolean;
  fpsCap: FpsCapChoice;
  skipExisting?: boolean;
}

export interface ConversionProgress {
  state: 'idle' | 'scanning' | 'converting' | 'paused' | 'completed' | 'cancelled' | 'error';
  totalClips: number;
  currentClipIndex: number;
  currentClipName: string;
  percent: number;
  fps: number;
  speed: string;
  elapsedSeconds: number;
  remainingSeconds: number;
  logs: string[];
  error?: string;
}

export interface EventConfigItem {
  eventName: string;
  eventDate: string; // YYYY-MM-DD
  photographers: string[];
  cinematographers: string[];
  droneOperators?: string[];
}

export interface EventFolderPlan {
  clientName: string;
  coupleName?: string;
  projectCode?: string;
  eventName: string;
  eventDate: string; // YYYY-MM-DD
  cinematographers: string[];
  droneOperators: string[];
  photographers: string[];
  targetDirectory: string;
  createRawCameras?: boolean;
  customRootFolderName?: string;
  mainEventDate?: string;
  events?: EventConfigItem[];
  deliverables?: string[];
  includeDeliveryFolders?: boolean;
}

export interface FolderCreationResult {
  success: boolean;
  rootPath: string;
  createdPaths: string[];
  error?: string;
}

export interface DataHandoffRecord {
  id: string;
  timestamp: string;
  crewName: string;
  crewRole: 'cinematographer' | 'photographer' | 'drone';
  clientName: string;
  eventName: string;
  eventDate: string;
  cardCount: number;
  totalSizeGB: number;
  clipOrPhotoCount: number;
  destinationFolder: string;
  notes: string;
  verifiedBy: string;
  whatsappConfirmationSent: boolean;
  sourceDriveLabel?: string;
}

export interface ClipDeliverySettings {
  sourceDirectory: string;
  destinationDirectory: string;
  mode: 'all' | 'raw_only' | 'edited_only';
  preset: 'archive' | 'balanced' | 'compact' | 'target_gb';
  targetSizeGB?: number;
  applyTonemap: boolean; // HLG to Rec.709
  hardwareAccelerate: boolean;
}

export interface ClipDeliveryRunState {
  state: 'idle' | 'scanning' | 'running' | 'paused' | 'completed' | 'cancelled' | 'error';
  rawClipsCount: number;
  rawClipsDone: number;
  editedVideosCount: number;
  editedVideosDone: number;
  totalCount: number;
  completedCount: number;
  totalDuration: number;
  completedDuration: number;
  currentFile: string;
  currentType: string;
  percent: number;
  fps: number;
  speed: string;
  etaSeconds: number;
  logs: string[];
  error?: string;
}

export interface DropboxDeliverableConfig {
  clientId: string;
  clientName: string;
  deliverableTitle: string;
  cutVersion: string; // "V001", "V002", "V003"
  filePath: string;
  notes?: string;
  contactNumber?: string;
}

export interface DropboxUploadStatus {
  state: 'idle' | 'uploading' | 'completed' | 'error';
  percent: number;
  bytesUploaded: number;
  totalBytes: number;
  speedBytesPerSec: number;
  currentFile: string;
  shareableUrl?: string;
  versionPath?: string;
  error?: string;
}

export interface ClientRevisionItem {
  id: string;
  deliverableId: string;
  deliverableTitle: string;
  clientId: string;
  clientName: string;
  cutVersion: string;
  timestamp: string;
  timecodes: string;
  points: string;
  rawNotes: string;
  audioNoteUrl?: string;
  source: 'whatsapp' | 'call' | 'in_person' | 'email';
  status: 'open' | 'in_progress' | 'resolved';
  postProductionContact: string;
  updatedAt: string;
}

export interface OfflineScanResult {
  folderPath: string;
  folderName: string;
  driveLabel: string;
  photoCount: number;
  totalPhotos: number;
  videoCount: number;
  totalDurationSeconds: number;
  hours: number;
  minutes: number;
  totalBytes: number;
  formattedSize: string;
  fileCount: number;
}

export interface WorkTarget {
  kind: 'freelance' | 'deliverable' | 'team';
  id: string;
  clientId?: string;
  title: string;
  clientName: string;
  serviceType: string;
  purpose: 'raw' | 'delivery';
  jobCode?: string;
  dueDate?: string;
  recipientName?: string;
  recipientPhone?: string;
  recipientEmail?: string;
  brief?: string;
  isInternal?: boolean;
}
