import type { Transfer, TransferStatus } from '../../../shared/contracts';

/** Sizes are shown the way Finder shows them — decimal units, not 1024s. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log10(bytes) / 3));
  const value = bytes / 1000 ** index;
  if (index === 0) return `${Math.round(value)} B`;
  const formatted = value.toFixed(1);
  return `${formatted.endsWith('.0') ? formatted.slice(0, -2) : formatted} ${units[index]}`;
}

/** Raw footage totals run to hours, so hours lead and seconds still show. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = Math.floor(seconds % 60);
  return [hours ? `${hours}h` : '', hours || minutes ? `${minutes}m` : '', `${rest}s`].filter(Boolean).join(' ');
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat('en-IN').format(Math.round(value || 0));
}

/**
 * Wording matters here. A transfer that is waiting on Google's daily allowance
 * has not failed and needs nothing from you, so it must not read like an error;
 * one that needs attention must not read like it is still making progress.
 */
const LABELS: Record<TransferStatus, { text: string; tone: 'idle' | 'busy' | 'done' | 'warn' | 'stop' }> = {
  scanning: { text: 'Scanning', tone: 'busy' },
  ready: { text: 'Ready to review', tone: 'idle' },
  queued: { text: 'Queued', tone: 'busy' },
  uploading: { text: 'Uploading', tone: 'busy' },
  verifying: { text: 'Verifying', tone: 'busy' },
  paused: { text: 'Paused', tone: 'idle' },
  waiting_network: { text: 'Waiting to retry', tone: 'warn' },
  waiting_quota: { text: 'Waiting for Google limit', tone: 'warn' },
  needs_attention: { text: 'Needs attention', tone: 'stop' },
  completed: { text: 'Verified', tone: 'done' },
};

export function statusLabel(status: TransferStatus): { text: string; tone: string } {
  return LABELS[status] ?? { text: status, tone: 'idle' };
}

export const ACTIVE_STATUSES: TransferStatus[] = ['queued', 'uploading', 'verifying', 'waiting_network', 'waiting_quota'];

/** Bytes acknowledged by Drive over bytes in the manifest — not files over files. */
export function progressFraction(job: Transfer): number {
  const total = job.scan?.totalBytes || 0;
  if (!total) return 0;
  return Math.max(0, Math.min(1, job.uploadedBytes / total));
}

export function remainingSummary(job: Transfer): string {
  const files = (job.scan?.fileCount || 0) - job.completedFiles;
  const bytes = (job.scan?.totalBytes || 0) - job.uploadedBytes;
  if (files <= 0) return 'All files sent';
  return `${formatCount(files)} files left · ${formatBytes(Math.max(0, bytes))}`;
}

/** Google's retry windows are long; a bare timestamp reads better as a wait. */
export function formatRetryWait(retryAt?: number): string {
  if (!retryAt) return '';
  const minutes = Math.round((retryAt - Date.now()) / 60000);
  if (minutes <= 0) return 'retrying shortly';
  if (minutes < 60) return `retrying in about ${minutes} min`;
  return `retrying in about ${Math.round(minutes / 60)} h`;
}
