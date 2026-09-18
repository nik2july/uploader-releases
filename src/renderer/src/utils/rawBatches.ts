import type { FreelanceJob } from '../types';

/**
 * What `attachVerifiedTransfer` files against a job for each completed transfer.
 * It is written by the desktop app rather than declared on FreelanceJob, so the
 * shape is stated here and every field is treated as possibly absent.
 */
interface TransferRecord {
  id?: string; link?: string; purpose?: string; createdAt?: string; fileCount?: number; bytes?: number;
}

/** One verified raw-footage package recorded against a job. */
export interface RawBatch { id: string; link: string; label: string; cloud: string; bytes: number; fileCount: number }

export function cloudName(link: string): string {
  if (link.includes('drive.google.com') || link.includes('googleusercontent.com')) return 'Google Drive';
  if (link.includes('dropbox.com')) return 'Dropbox';
  return 'Shared link';
}

/** A folder name per batch, so two batches never write over each other. */
export function batchFolder(batch: RawBatch): string {
  return `${batch.label} - ${batch.cloud}`.replace(/[^\w .-]+/g, '_');
}

/**
 * Every raw package the studio has sent for this job, oldest first.
 *
 * A project can be uploaded in more than one batch, and a later batch may have
 * gone to a different cloud entirely, so the job's own rawDataLink is only the
 * first of them. Jobs recorded before per-transfer history existed, and links
 * pasted in by hand, still yield the one batch that link stands for.
 */
export function rawBatches(job: FreelanceJob): RawBatch[] {
  const history = (job as unknown as { desktopTransfers?: Record<string, TransferRecord> }).desktopTransfers;
  const recorded = Object.values(history || {})
    .filter(t => t && typeof t.link === 'string' && t.link && (!t.purpose || t.purpose === 'raw'))
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  const sources: { id: string; link: string; bytes: number; fileCount: number }[] = [];
  const seen = new Set<string>();
  const add = (id: string, link: string, bytes: number, fileCount: number): void => {
    const key = link.trim().replace(/\/+$/, '');
    if (!key || seen.has(key)) return;
    seen.add(key);
    sources.push({ id, link: link.trim(), bytes, fileCount });
  };
  for (const t of recorded) add(String(t.id), String(t.link), Number(t.bytes) || 0, Number(t.fileCount) || 0);
  if (job.rawDataLink) add(`${job.id}:link`, job.rawDataLink, 0, 0);
  return sources.map((source, index) => ({
    ...source,
    label: sources.length > 1 ? `Batch ${index + 1}` : 'Raw footage',
    cloud: cloudName(source.link)
  }));
}
