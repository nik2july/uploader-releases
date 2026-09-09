import type { MediaBillingResult } from '../../../WEB APP/src/utils/mediaPricing';
export type { MediaBillingInput, MediaBillingResult, MediaMeasurement } from '../../../WEB APP/src/utils/mediaPricing';

export type TransferStatus = 'scanning' | 'ready' | 'queued' | 'uploading' | 'verifying' | 'paused' | 'waiting_network' | 'waiting_quota' | 'needs_attention' | 'completed';
export interface ScanOptions { excludedBillingFolders: string[]; countPhotoPairsOnce: boolean }
export interface ScanSummary {
  totalPhotos: number; billablePhotos: number; totalVideos: number; totalDurationSeconds: number;
  unknownVideoCount: number; totalBytes: number; fileCount: number; folderCount: number;
  pairedPhotos: number; excludedBillingFiles: number; warnings: string[]; readErrors: number;
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
export interface DriveStatus { configured: boolean; connected: boolean; email?: string; clientId: string; error?: string }
export interface DesktopAPI {
  login(phone: string, password: string): Promise<{ customToken: string }>;
  authorize(idToken: string): Promise<string>;
  signOut(): Promise<void>;
  scan(options: ScanOptions, target?: WorkTarget): Promise<string | null>;
  cancelScan(id: string): Promise<void>;
  list(): Promise<Transfer[]>;
  inspect(id: string): Promise<{ files: { path: string; error: string }[] }>;
  configureDrive(clientId: string, clientSecret: string): Promise<DriveStatus>;
  connectDrive(): Promise<DriveStatus>;
  driveStatus(): Promise<DriveStatus>;
  disconnectDrive(): Promise<DriveStatus>;
  enqueue(id: string, target: WorkTarget, invoice?: InvoiceSnapshot): Promise<void>;
  pause(id: string): Promise<void>;
  resume(id: string): Promise<void>;
  relocate(id: string): Promise<void>;
  share(id: string, mode: 'restricted' | 'anyone', email: string): Promise<string>;
  markSynced(id: string): Promise<void>;
  markMessagePrepared(id: string): Promise<void>;
  saveInvoice(id: string, invoice: InvoiceSnapshot): Promise<void>;
  savePdf(bytes: Uint8Array, filename: string): Promise<boolean>;
  openExternal(url: string): Promise<void>;
  setKeepAwake(on: boolean): Promise<void>;
  onChange(callback: () => void): () => void;
}
