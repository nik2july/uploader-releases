import type { MediaBillingResult } from '../../../WEB APP/src/utils/mediaPricing';
export type { MediaBillingInput, MediaBillingResult, MediaMeasurement } from '../../../WEB APP/src/utils/mediaPricing';

export type TransferStatus = 'scanning' | 'ready' | 'queued' | 'uploading' | 'verifying' | 'paused' | 'waiting_network' | 'waiting_quota' | 'needs_attention' | 'completed';
export interface ScanOptions { excludedBillingFolders: string[]; countPhotoPairsOnce: boolean }
export interface MissingClips { label: string; folder: string; missing: string[]; missingCount: number; received: number }
export interface ScanSummary {
  totalPhotos: number; billablePhotos: number; totalVideos: number; totalDurationSeconds: number;
  unknownVideoCount: number; totalBytes: number; fileCount: number; folderCount: number;
  pairedPhotos: number; excludedBillingFiles: number; warnings: string[]; readErrors: number;
  /** Gaps in the camera's numbering — files that never made it off the card. */
  missingClips: MissingClips[]; missingClipCount: number;
  /** Files present but unreadable: an empty file, or a clip with no duration in its header. */
  unreadableFiles: { path: string; reason: string }[];
}
export interface WorkTarget {
  kind: 'freelance' | 'deliverable'; id: string; clientId?: string; title: string; clientName: string;
  serviceType: string; purpose: 'raw' | 'delivery'; jobCode?: string; dueDate?: string;
  recipientName?: string; recipientPhone?: string; recipientEmail?: string; brief?: string;
}
export interface InvoiceSnapshot {
  id: string; number: string; createdAt: string; status: 'draft' | 'issued';
  studioName: string; clientName: string; title: string; currency: string;
  quantity: number; unit: string; rate: number; subtotal: number; taxPercent: number; tax: number; total: number;
  calculation?: MediaBillingResult; note?: string;
}
export interface Transfer {
  id: string; ownerUid: string; rootPath: string; rootName: string; status: TransferStatus;
  /** Relative files explicitly selected by the owner. Omitted for a whole-folder scan. */
  sourceFiles?: string[];
  target?: WorkTarget; scan?: ScanSummary; options: ScanOptions; createdAt: string; updatedAt: string;
  folderId?: string; driveAccount?: string; link?: string; error?: string; retryAt?: number;
  invoice?: InvoiceSnapshot; synced?: boolean; shared?: boolean; sharing?: 'restricted' | 'anyone';
  /** When the recipient's WhatsApp message was last opened. Preparing a message is not sending it. */
  messagePreparedAt?: string;
  completedFiles: number; uploadedBytes: number; currentFile?: string;
}
export interface ManifestFile {
  id: number; jobId: string; relativePath: string; size: number; mtimeMs: number;
  kind: 'photo' | 'video' | 'other'; billingIncluded: boolean; durationSeconds?: number;
  driveId?: string; session?: string; offset: number; md5?: string;
  state: 'pending' | 'uploading' | 'verified'; error?: string;
}
export interface UpdateInfo { version: string; url: string; notes: string; publishedAt: string }
/** Where raw-footage transfers land. Chosen once in Uploader settings, shared by the studio. */
export type UploadDestination = 'drive' | 'b2';
export interface DriveStatus { configured: boolean; connected: boolean; email?: string; clientId: string; error?: string }
export interface DesktopAPI {
  login(phone: string, password: string): Promise<{ customToken: string; accountType: string }>;
  authorize(idToken: string): Promise<{ uid: string; isOwner: boolean }>;
  signOut(): Promise<void>;
  scan(options: ScanOptions, target?: WorkTarget): Promise<string | null>;
  scanFiles(options: ScanOptions, target?: WorkTarget): Promise<string | null>;
  cancelScan(id: string): Promise<void>;
  list(): Promise<Transfer[]>;
  inspect(id: string): Promise<{ files: { path: string; error: string }[] }>;
  refreshDriveConfiguration(): Promise<DriveStatus>;
  connectDrive(idToken: string): Promise<DriveStatus>;
  driveStatus(): Promise<DriveStatus>;
  disconnectDrive(): Promise<DriveStatus>;
  setUploadDestination(destination: UploadDestination): Promise<void>;
  dropboxStatus(): Promise<DropboxStatus>;
  connectDropbox(token: string | { appKey?: string; appSecret?: string; refreshToken?: string; accessToken?: string }): Promise<DropboxStatus>;
  disconnectDropbox(): Promise<DropboxStatus>;
  b2Status(): Promise<B2Status>;
  connectB2(config: B2ConfigInput): Promise<B2Status>;
  disconnectB2(): Promise<B2Status>;
  deleteB2Folder(prefix: string): Promise<number>;
  chooseDeliverableFile(): Promise<{ filePath: string; fileName: string; fileSize: number } | null>;
  uploadDeliverable(jobId: string, filePath: string, targetFolder: string, fileName: string): Promise<string>;
  onUploadProgress(callback: (progress: { jobId: string; percent: number; uploadedBytes: number; totalBytes: number }) => void): () => void;
  chooseDownloadDirectory(): Promise<string | null>;
  downloadRawData(jobId: string, rawDataLink: string, destDir: string): Promise<{ success: boolean; downloadedBytes: number; totalBytes: number; fileCount: number; path: string }>;
  cancelDownload(jobId: string): Promise<void>;
  onDownloadProgress(callback: (progress: DownloadProgress) => void): () => void;
  verifyLocalFolder(jobId: string, folderPath: string): Promise<{ valid: boolean; fileCount: number; totalBytes: number }>;
  openDownloadedFolder(jobId: string): Promise<void>;
  forgetDownloadedFolder(jobId: string): Promise<void>;
  checkDiskSpace(targetPath: string): Promise<DiskSpaceInfo>;
  getDownloadSize(rawDataLink: string): Promise<number>;
  deleteDriveFolder(folderId: string): Promise<void>;
  deleteDropboxFile(dropboxPath: string): Promise<void>;
  downloadDropboxFile(dropboxPath: string, localPath: string): Promise<void>;
  chooseSaveLocation(defaultFileName: string): Promise<string | null>;
  enqueue(id: string, target: WorkTarget, invoice?: InvoiceSnapshot): Promise<void>;
  pause(id: string): Promise<void>;
  resume(id: string): Promise<void>;
  relocate(id: string): Promise<void>;
  /** Re-scan a transfer's folder and queue anything that is not already verified. */
  rescan(id: string): Promise<boolean>;
  share(id: string, mode: 'restricted' | 'anyone', email: string): Promise<string>;
  markSynced(id: string): Promise<void>;
  markMessagePrepared(id: string): Promise<void>;
  saveInvoice(id: string, invoice: InvoiceSnapshot): Promise<void>;
  savePdf(bytes: Uint8Array, filename: string): Promise<boolean>;
  openExternal(url: string): Promise<void>;
  setKeepAwake(on: boolean): Promise<void>;
  checkForUpdate(): Promise<UpdateInfo | null>;
  appVersion(): Promise<string>;
  diagnostics(): Promise<string>;
  onChange(callback: () => void): () => void;
}

export interface DiskSpaceInfo {
  freeBytes: number;
  totalBytes: number;
  path: string;
}

export interface DownloadProgress {
  jobId: string;
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
  fileName?: string;
  status: 'downloading' | 'completed' | 'error';
  error?: string;
}

export interface DropboxStatus { configured: boolean; connected: boolean; email?: string; error?: string }

export interface B2Status {
  connected: boolean;
  bucketName?: string;
  accountId?: string;
  error?: string;
}

export interface B2ConfigInput {
  keyId: string;
  applicationKey: string;
  bucketName: string;
  endpoint?: string;
  region?: string;
}
