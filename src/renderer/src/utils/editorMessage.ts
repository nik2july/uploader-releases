import type { Transfer } from '../../../shared/contracts';
import { formatBytes, formatCount, formatDuration } from './uploadFormat';

/** WhatsApp wants a bare international number — no +, spaces, or punctuation. */
function normalisePhone(phone: string, dialCode?: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  // A plain ten-digit Indian mobile needs its country code prepended; partner
  // studios abroad already carry theirs.
  if (digits.length === 10) return `${(dialCode || '91').replace(/\D/g, '') || '91'}${digits}`;
  return digits;
}

/**
 * What the editor is sent.
 *
 * Deliberately excludes every figure on the billing side. The person receiving
 * this is being told what to edit and where the footage is; what the studio
 * charges for it, and what they are being paid, are separate conversations that
 * belong in Studio OS, not in a message that is one forward away from anyone.
 */
export function editorMessage(job: Transfer, studioName = 'Baawaray Films'): string {
  const target = job.target;
  const scan = job.scan;
  const lines: string[] = [];
  lines.push(`Hi${target?.recipientName ? ` ${target.recipientName}` : ''}, the footage for ${target?.title || job.rootName} is uploaded and verified.`);
  lines.push('');
  if (target?.jobCode) lines.push(`Job: ${target.jobCode}`);
  if (target?.serviceType) lines.push(`Service: ${target.serviceType}`);
  if (target?.dueDate) lines.push(`Deadline: ${target.dueDate}`);
  if (scan) {
    lines.push(`Files: ${formatCount(scan.fileCount)} · ${formatBytes(scan.totalBytes)}`);
    if (scan.totalDurationSeconds > 0) lines.push(`Raw footage: ${formatDuration(scan.totalDurationSeconds)}`);
    if (scan.totalPhotos > 0) lines.push(`Photos: ${formatCount(scan.totalPhotos)}`);
  }
  lines.push('');
  lines.push(`Drive link: ${job.link || ''}`);
  if (target?.brief?.trim()) { lines.push(''); lines.push('Editing brief:'); lines.push(target.brief.trim()); }
  lines.push('');
  lines.push(`— ${studioName}`);
  return lines.join('\n');
}

/**
 * A chat with the message already written. WhatsApp has no way to attach a file
 * from a link, and nothing here sends anything: the message is composed and the
 * chat opened, and pressing send is still yours to do.
 */
export function whatsappUrl(message: string, phone?: string, dialCode?: string): string {
  const number = normalisePhone(phone || '', dialCode);
  const text = encodeURIComponent(message);
  return number ? `https://wa.me/${number}?text=${text}` : `https://web.whatsapp.com/send?text=${text}`;
}
