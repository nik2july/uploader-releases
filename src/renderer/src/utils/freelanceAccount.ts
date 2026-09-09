import { FreelanceEditorPayout, FreelanceJob, FreelanceLedgerPayment } from '../types/freelance';
import { formatDate } from './formatters';
import { unitNoun } from './freelancePricing';

/**
 * What a partner studio owes, and which jobs their money has covered.
 *
 * The studio pays into an account, not into projects: one transfer covers three jobs,
 * or arrives before the work does. So "is this job paid" is not something the job can
 * answer on its own — it is a question about the account, settled by walking the work
 * in the order it was billed and letting the money reach as far as it reaches.
 *
 * Oldest first, deliberately. It matches what both sides assume when nobody says
 * otherwise — money clears the longest-standing debt — and it means an advance shows
 * up as credit rather than being silently spread across work not yet done.
 */

export interface JobAllocation {
  jobId: string;
  charged: number;
  /** Paid straight onto the job, before payments moved to the account. */
  directPaid: number;
  /** Covered by money sitting in the studio's account. */
  fromAccount: number;
  paid: number;
  balance: number;
}

export interface StudioAccount {
  /** Everything ever billed to this studio. */
  billed: number;
  /** Received into the account. */
  accountPaid: number;
  /** Recorded against individual jobs, before the account existed. */
  directPaid: number;
  received: number;
  /** Still owed on work already billed. */
  outstanding: number;
  /** Paid ahead — money in hand that no job has been raised against yet. */
  credit: number;
  allocations: Map<string, JobAllocation>;
}

/** Billing order: when the work arrived, then the job code, so it is stable. */
function billingOrder(a: FreelanceJob, b: FreelanceJob): number {
  const aKey = a.dataReceivedDate || a.createdAt || '';
  const bKey = b.dataReceivedDate || b.createdAt || '';
  if (aKey !== bKey) return aKey.localeCompare(bKey);
  return String(a.jobCode || a.id).localeCompare(String(b.jobCode || b.id));
}

export function buildStudioAccount(
  jobs: FreelanceJob[],
  payments: FreelanceLedgerPayment[] = []
): StudioAccount {
  const accountPaid = payments.reduce((a, p) => a + (Number(p.amount) || 0), 0);

  const ordered = [...jobs].sort(billingOrder);
  const allocations = new Map<string, JobAllocation>();

  let billed = 0;
  let directPaid = 0;
  let pool = accountPaid;

  ordered.forEach(job => {
    const charged = Number(job.clientCharge) || 0;
    // What was recorded straight onto the job still counts, so history logged before
    // the account existed is never double-counted or lost.
    const direct = Number(job.clientPaidAmount) || 0;
    const applied = Math.min(charged, direct);
    // More was paid onto this job than it was ever billed. That surplus is still the
    // studio's money — it moves into the account and covers the work that follows,
    // rather than evaporating and making the statement disagree with the receipts.
    pool += direct - applied;

    const owed = Math.max(0, charged - applied);
    const fromAccount = Math.min(owed, pool);
    pool -= fromAccount;

    billed += charged;
    directPaid += direct;

    allocations.set(job.id, {
      jobId: job.id,
      charged,
      directPaid: applied,
      fromAccount,
      paid: applied + fromAccount,
      balance: Math.max(0, charged - applied - fromAccount),
    });
  });

  const received = accountPaid + directPaid;

  return {
    billed,
    accountPaid,
    directPaid,
    received,
    // Only what is actually still owed on billed work; an advance is not negative debt.
    outstanding: [...allocations.values()].reduce((a, x) => a + x.balance, 0),
    credit: pool,
    allocations,
  };
}

/** An empty account, for a studio with no jobs and no payments yet. */
export const EMPTY_STUDIO_ACCOUNT: StudioAccount = {
  billed: 0,
  accountPaid: 0,
  directPaid: 0,
  received: 0,
  outstanding: 0,
  credit: 0,
  allocations: new Map(),
};

/**
 * What one editor has been paid for freelance work, and what each job cost.
 *
 * The mirror of the studio account, with one difference that matters: a studio's money
 * clears the oldest debt on its own, because every job has a price the moment it is
 * logged. An editor's fee has no such figure — it is agreed when they are paid — so
 * nothing can be worked out automatically. The split recorded on each payout is the
 * only statement of what a job cost, and money left unsplit is an advance against work
 * still to come.
 */
export interface EditorAccount {
  /** Everything remitted to this person for freelance work. */
  paid: number;
  /** Attributed to specific jobs. */
  allocated: number;
  /** Paid but not yet against any job. */
  advance: number;
  /** What each job cost, by job id. */
  costByJob: Map<string, number>;
}

export function buildEditorAccount(payouts: FreelanceEditorPayout[] = []): EditorAccount {
  const costByJob = new Map<string, number>();
  let paid = 0;
  let allocated = 0;

  payouts.forEach(payout => {
    paid += Number(payout.amount) || 0;
    (payout.allocations || []).forEach(split => {
      const amount = Number(split.amount) || 0;
      if (amount <= 0) return;
      allocated += amount;
      costByJob.set(split.jobId, (costByJob.get(split.jobId) || 0) + amount);
    });
  });

  return { paid, allocated, advance: Math.max(0, paid - allocated), costByJob };
}

export const EMPTY_EDITOR_ACCOUNT: EditorAccount = {
  paid: 0,
  allocated: 0,
  advance: 0,
  costByJob: new Map(),
};



export function buildStatementText(
  studioName: string,
  client: any,
  jobs: FreelanceJob[],
  ledger: { amount: number; date: string; mode: string; reference?: string }[],
  account: StudioAccount
): string {
  const today = new Date().toISOString().split('T')[0];
  
  const workLines = [...jobs]
    .sort((a, b) =>
      String(a.dataReceivedDate || a.createdAt || '').localeCompare(
        String(b.dataReceivedDate || b.createdAt || '')
      )
    )
    .map((job, index) => {
      const charge = Number(job.clientCharge) || 0;
      const pricing = job.pricing;
      const breakdown = pricing
        ? `${pricing.billableUnits} ${unitNoun(pricing.basis, pricing.billableUnits)} × ₹${pricing.rate.toLocaleString('en-IN')} = ₹${charge.toLocaleString('en-IN')}`
        : `₹${charge.toLocaleString('en-IN')}`;
      return `${index + 1}. ${job.title}\n   ${breakdown}`;
    })
    .join('\n');

  const paymentLines = ledger
    .slice(0, 10)
    .map(
      entry =>
        `• ${formatDate(entry.date, 'medium')} — ₹${entry.amount.toLocaleString('en-IN')} (${entry.mode}${
          entry.reference ? `, ${entry.reference}` : ''
        })`
    )
    .join('\n');

  return (
    `*${studioName} — Account Statement*\n` +
    `${client?.name || 'Studio'}${client?.contactPerson ? ` (${client.contactPerson})` : ''}\n` +
    `As on ${formatDate(today, 'medium')}\n\n` +
    (workLines
      ? `*WORK BILLED*\n${workLines}\n\nTotal billed: ₹${account.billed.toLocaleString('en-IN')}\n\n`
      : '') +
    (paymentLines
      ? `*PAYMENTS RECEIVED*\n${paymentLines}\n\nTotal received: ₹${account.received.toLocaleString('en-IN')}\n\n`
      : '') +
    `———————————————\n` +
    (account.credit > 0
      ? `*In credit: ₹${account.credit.toLocaleString('en-IN')}* — applied to your next job\n`
      : `*Balance due: ₹${account.outstanding.toLocaleString('en-IN')}*\n`) +
    `\nThank you for working with us!`
  );
}
