import { FreelanceJob, FreelanceJobStage, FreelancePaymentStatus } from '../types/freelance';
import { TeamMember } from '../types';
import { getTeamMemberCategories } from './formatters';

/**
 * Settlement state of one side of a freelance job.
 *
 * A job with nothing owed is SETTLED, not unpaid. The three call sites that used
 * to derive this inline all guarded with `total > 0`, so a zero-value side could
 * never reach 'paid' and sat in 'unpaid' forever — which is exactly the state an
 * in-house salaried job is supposed to be in, since the salary already covers the
 * work. Those jobs then stuck permanently in the "Editor Due" filter and inflated
 * the pending-payout figure with money that is not owed to anyone.
 */
export function derivePaymentStatus(paid: number, total: number): FreelancePaymentStatus {
  const owed = Number(total) || 0;
  const settled = Number(paid) || 0;
  if (owed <= 0) return 'paid';
  if (settled >= owed) return 'paid';
  if (settled > 0) return 'partial';
  return 'unpaid';
}

/**
 * Whether assigning this member to a freelance job costs the studio anything.
 *
 * A salaried member is already being paid whether or not this job exists, so
 * billing a payout against it would count the same person twice and understate the
 * profit the department exists to measure. The rest of the app already treats
 * salaried staff this way (`calculateMemberEventFee` returns 0 for them before any
 * other rule); the freelance department was the one place that did not.
 */
export function isSalariedMember(member: TeamMember | undefined): boolean {
  return member?.payType === 'salaried';
}

/**
 * The next job code for a given year, e.g. "FL-2026-004".
 *
 * Derived from the highest code already issued that year rather than from how many
 * jobs currently exist: a count reuses a live code as soon as any job is deleted,
 * which would put two different jobs under one reference on invoices and in
 * conversations with the studio you are billing. Numbering also restarts each year,
 * which the FL-YYYY-NNN format implies but a running total never did.
 */
export function nextFreelanceJobCode(existing: FreelanceJob[], year = new Date().getFullYear()): string {
  const prefix = `FL-${year}-`;
  const highest = existing.reduce((max, job) => {
    const code = job.jobCode || '';
    if (!code.startsWith(prefix)) return max;
    const n = parseInt(code.slice(prefix.length), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(3, '0')}`;
}

/**
 * Whether this member is on the deliverables side of the roster.
 *
 * The team is split into an events side (on-site shoot crew) and a deliverables
 * side (editing, grading, albums) — `categoriesFromAssignments` derives that from
 * the kind of service each person is approved for, mapping 'deliverable' to the
 * 'post-production' tier. Freelance work is post-production only: it arrives as
 * footage from another studio and leaves as an edit, so nobody is ever on set for
 * it. Offering the shoot crew in the editor picker only invites mis-assignment.
 *
 * Matched loosely rather than against the exact 'post-production' id, because the
 * tier list is editable in Studio Settings and a studio that renamed its tiers
 * (to "Deliverables", say) would otherwise find its editors quietly missing from
 * the picker with nothing explaining why.
 */
export function isDeliverablesTeamMember(member: TeamMember): boolean {
  return getTeamMemberCategories(member).some(category => {
    const value = String(category).toLowerCase();
    return value.includes('post') || value.includes('deliver');
  });
}

/**
 * The one link a job is delivered through.
 *
 * Jobs logged before the link was made singular carry a separate draft link, a final
 * link, or both. The most finished of those stands in until a delivery link is saved,
 * so an old job still shares something rather than nothing.
 */
export function deliveryLinkOf(job: {
  deliveryLink?: string;
  finalDeliveryLink?: string;
  draftVideoLink?: string;
}): string {
  return job.deliveryLink || job.finalDeliveryLink || job.draftVideoLink || '';
}

/**
 * Stages where a round of changes is outstanding, and its own deadline governs.
 *
 * Only these two. Once the master is delivered, or the job is moved back to an earlier
 * stage, whatever changes deadline it once carried is history.
 */
const CHANGE_STAGES: FreelanceJobStage[] = ['changes_received', 'changes_sent_to_editor'];

/**
 * The date this job is actually due.
 *
 * Changes carry their own two-day clock, which outranks the delivery date while they
 * are outstanding — but only while. Reading `changesDueDate || dueDate` regardless of
 * stage meant a job that had been through a round of changes, or was moved back a
 * stage, kept quoting a deadline from a round that was over: the list said one date
 * and the job's own form said another, and neither could be trusted after that.
 */
export function freelanceDueDate(job: {
  stage: FreelanceJobStage;
  dueDate?: string;
  changesDueDate?: string;
}): string {
  if (CHANGE_STAGES.includes(job.stage) && job.changesDueDate) return job.changesDueDate;
  return job.dueDate || '';
}
