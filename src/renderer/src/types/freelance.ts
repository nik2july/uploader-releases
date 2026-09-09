export type FreelanceJobStage =
  | 'pending_assignment'
  | 'data_received'
  | 'sent_to_editor'
  | 'draft_received'
  | 'sent_to_client'
  | 'changes_received'
  | 'changes_sent_to_editor'
  | 'final_delivered'
  | 'completed';

export type FreelancePaymentStatus = 'unpaid' | 'partial' | 'paid' | 'overdue';

export interface FreelancePaymentRecord {
  id: string;
  amount: number;
  date: string; // YYYY-MM-DD
  mode: 'Bank Transfer' | 'UPI' | 'GPay' | 'PhonePe' | 'Cheque' | 'Cash' | 'Card' | string;
  reference?: string;
  notes?: string;
  createdAt: string;
}

/**
 * Money received from a partner studio, against their account rather than one job.
 *
 * Studios do not pay per project. One transfer covers three jobs, or arrives before
 * the work does, or lands weeks after the last film went out. Recording payments on
 * the job forced every one of those into a shape it did not have — you had to open a
 * job, then decide by hand which part of the transfer belonged to it. The account is
 * the honest unit: money in, work billed, and the difference either owed or in credit.
 */
export interface FreelanceLedgerPayment {
  id: string;
  amount: number;
  date: string; // YYYY-MM-DD
  mode: 'Bank Transfer' | 'UPI' | 'GPay' | 'PhonePe' | 'Cheque' | 'Cash' | 'Card' | string;
  reference?: string;
  notes?: string;
  createdAt: string;
}

/**
 * One payment out to a freelance editor, and how it was split across their work.
 *
 * Editors are settled the way partner studios pay: an advance before the work, or one
 * transfer after two or three jobs are done. What each job cost is therefore not known
 * when the job is created — it is decided at the moment of paying, which is why the
 * split lives on the payout rather than on the job. Amounts not attributed to a job
 * are an advance, sitting against work still to come.
 */
export interface FreelanceEditorPayout {
  id: string;
  /** The whole transfer, however it was divided. */
  amount: number;
  date: string; // YYYY-MM-DD
  mode: 'Bank Transfer' | 'UPI' | 'GPay' | 'PhonePe' | 'Cheque' | 'Cash' | 'Card' | string;
  reference?: string;
  notes?: string;
  /** What each job cost, out of this payout. The remainder is an advance. */
  allocations: { jobId: string; amount: number }[];
  createdAt: string;
}

export interface FreelanceRevision {
  id: string;
  roundNumber: number;
  receivedDate: string; // YYYY-MM-DD
  feedbackNotes: string;
  timecodes?: string;
  sharedWithEditorDate?: string;
  status: 'pending' | 'in_progress' | 'resolved';
  resolvedDate?: string;
}

export interface FreelanceActivityLog {
  id: string;
  timestamp: string; // ISO string
  action: string;
  details?: string;
  actor?: string;
}

/**
 * What the studio sells freelance.
 *
 * A fixed list rather than a studio-editable one, because the category is also the
 * billing basis: each of the four is charged on a different unit, so a category
 * invented on the fly would have no way to price its own job.
 *
 * `string` stays in the union for jobs logged under the older free-text categories,
 * which keep the wording they were created with.
 */
export type FreelanceServiceType =
  | 'Short Form'
  | 'Long Form'
  | 'Edited Photos'
  | 'Album'
  | string;

/** The unit a service is charged by. One per service type. */
export type FreelancePricingBasis =
  | 'per_output_minute' // Short Form — the delivered cut
  | 'per_raw_hour'      // Long Form — the footage handed over
  | 'per_photo'
  | 'per_sheet';

/**
 * How a job's client charge was worked out.
 *
 * Kept alongside the total rather than replaced by it: the total on its own cannot
 * be checked or renegotiated later, and "₹18,000" tells nobody whether that was
 * twelve minutes at fifteen hundred or a figure someone remembered wrong.
 */
export interface FreelancePricing {
  basis: FreelancePricingBasis;
  /** Rupees per billable unit — per output minute, raw hour, photo or sheet. */
  rate: number;

  /** per_raw_hour: hours of raw data handed over. */
  durationHours?: number;
  /** per_output_minute: minutes of finished cut. per_raw_hour: the trailing minutes. */
  durationMinutes?: number;
  /** per_output_minute: the trailing seconds of the finished cut. */
  durationSeconds?: number;
  /** per_photo / per_sheet: how many. */
  quantity?: number;

  /**
   * What the rate was actually multiplied by, after the one-minute floor short form
   * carries. Stored rather than recomputed on read so a job still reconciles to the
   * figure it was billed at even if the rounding rules are changed later.
   */
  billableUnits: number;
}

export interface FreelanceJob {
  id: string;
  jobCode: string; // e.g. "FL-2026-001"
  title: string;
  serviceType: FreelanceServiceType;
  projectCategory?: string;
  description?: string;
  priority?: 'normal' | 'high' | 'urgent';

  // Client Details
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  clientOrganization?: string;
  /** The registry record this job belongs to. Absent on jobs created before the
   * registry existed — those still carry only the typed clientName/clientPhone,
   * which stay populated on every job so a deleted client never blanks its history. */
  freelanceClientId?: string;

  // Worker / Editor Assignment
  assignedType?: 'in_house' | 'freelancer';
  workerType?: 'in_house' | 'freelancer';
  editorName: string;
  editorPhone: string;
  editorEmail?: string;
  editorMemberId?: number;
  workerName?: string;
  workerPhone?: string;
  workerEmail?: string;
  teamMemberId?: number; // Linked in-house team member ID
  /**
   * Firebase uid of the assigned editor, copied from their team record.
   *
   * Denormalised onto the job because firestore.rules has to be able to decide
   * "is this yours" from the job document alone: rules are evaluated against a
   * QUERY, so a rule that looked the uid up on the team record could not be
   * satisfied by any listen. Absent until the editor has signed in at least once
   * (that is when their uid first exists); AppContext backfills it on the owner's
   * device once it does.
   */
  editorAuthUid?: string;
  clientAuthUid?: string;

  /**
   * Hours of editing this job needs, judged by the studio after looking at the raw
   * data — freelance work has no quotation behind it to inherit an estimate from, and
   * two jobs of the same service type can differ wildly. Undefined means not yet
   * assessed; the scheduler reports that rather than assuming the job is free.
   */
  estimatedEffortHours?: number;
  workerSpecialization?: string;

  // Financials & Manual Billing
  clientCharge: number; // Quoted charge to client
  /**
   * The rate and quantity behind clientCharge. Absent on jobs logged before the
   * calculator existed, whose charge was typed in as a single figure.
   */
  pricing?: FreelancePricing;
  quotedPricing?: FreelancePricing;
  /**
   * The share of the photos handed over that are actually edited and billed —
   * 20 means 200 of 1,000.
   *
   * Read `cullPercent` as a fallback and nothing more. That field held this same
   * kept-share all along, under a name that says the opposite of what it stores,
   * and the request form's label ("Cull Percentage") said the opposite again.
   * Values written before this rename mean what `keepPercent` means; only the
   * name and the label were wrong.
   */
  keepPercent?: number;
  /** @deprecated Misnamed. Holds a kept share, not a culled one — use keepPercent. */
  cullPercent?: number;
  pricingRevisedAt?: string;
  priorCharge?: number;
  clientPaidAmount: number; // Total collected from client
  clientPaymentStatus: FreelancePaymentStatus;
  clientPayments: FreelancePaymentRecord[];

  /**
   * What this job costs in editor pay.
   *
   * Not agreed when the job is logged — freelance editors are paid once the work is
   * delivered — so this starts at zero and is set by the payouts recorded against the
   * job, unless a figure was agreed up front, in which case that stands. Always zero
   * for a salaried editor, whose time the job does not pay for.
   */
  editorPay: number;
  editorPaidAmount: number; // Total remitted to editor
  editorPaymentStatus: FreelancePaymentStatus;
  editorPayouts: FreelancePaymentRecord[];

  // Links
  rawDataLink?: string; // Raw footage / files link (GDrive, Dropbox, WeTransfer, NAS)
  /**
   * Where the editor's work is watched — the one link the job delivers through.
   *
   * Deliberately singular. In practice the editor uploads once and keeps updating
   * that same file, so a draft link and a separate final link were two names for one
   * place: the studio had to remember to copy the value across at delivery, and a
   * job that skipped that step looked undelivered. It is empty until there is
   * something to watch, and can be replaced if the editor moves the file.
   */
  deliveryLink?: string;
  /** @deprecated Superseded by deliveryLink; still read so older jobs keep theirs. */
  referenceLink?: string;
  projectBriefLink?: string;
  /** @deprecated Superseded by deliveryLink. */
  draftVideoLink?: string;
  editorDraftLink?: string;
  /** @deprecated Superseded by deliveryLink. */
  finalDeliveryLink?: string;
  editingInstructions?: string;

  // Workflow Stages & Dates
  stage: FreelanceJobStage;
  createdAt: string; // YYYY-MM-DD
  dataReceivedDate?: string; // YYYY-MM-DD
  sentToEditorDate?: string; // YYYY-MM-DD
  draftReceivedDate?: string; // YYYY-MM-DD
  sentToClientDate?: string; // YYYY-MM-DD
  changesReceivedDate?: string; // YYYY-MM-DD
  changesSentToEditorDate?: string; // YYYY-MM-DD
  finalDeliveredDate?: string; // YYYY-MM-DD
  completedDate?: string; // YYYY-MM-DD

  // Due Dates (Automated rules: 1 week from data received, 2 days from changes received)
  dueDate: string; // YYYY-MM-DD (Default: 7 days after dataReceivedDate)
  changesDueDate?: string; // YYYY-MM-DD (Default: 2 days after changesReceivedDate)

  // Revisions & Activity History
  revisions: FreelanceRevision[];
  activityLogs: FreelanceActivityLog[];
  notes?: string;
}

/**
 * A studio you do freelance work FOR.
 *
 * Deliberately its own collection rather than a row in `clients`: those are wedding
 * couples with portal logins, a linked shoot and a payment schedule, and mixing
 * repeat B2B studios into that list would put them in the client portal and the
 * couple-facing pickers where they do not belong. The two share almost no fields.
 *
 * Jobs referenced a client only by typed-in name and phone before this existed, so
 * the same studio was re-entered on every job and nothing could total what one of
 * them owed across their work.
 */
export interface FreelanceClient {
  id: string;
  name: string;                 // studio / company name
  authUid?: string;
  password?: string;
  mustChangePassword?: boolean;
  contactPerson?: string;
  phone: string;
  /**
   * Country dial code for `phone`, digits only — '91', '1', '971'.
   *
   * Recorded rather than guessed: partner studios are in Dubai, Toronto and Berlin as
   * well as Punjab, and ten digits look the same wherever they are from. Without it a
   * WhatsApp link opens a chat with nobody. Absent on studios added before this
   * existed, which are treated as Indian — see DEFAULT_DIAL_CODE.
   */
  dialCode?: string;
  email?: string;
  city?: string;
  gstin?: string;
  /**
   * @deprecated A single lump sum, from before work was priced by the unit. Superseded
   * by `rateCard`; kept so studios that still carry one do not lose the figure.
   */
  defaultRate?: number;
  /**
   * What this studio is normally charged, per service, in rupees per unit — per minute
   * of output, per hour of raw data, per photo, per sheet. Keyed by service name.
   *
   * Rates are agreed with a studio once and then hold for months, so retyping them on
   * every job was both tedious and the easiest place in the app to make a quiet
   * mistake: one mistyped digit reads as a discount nobody agreed. A job still stores
   * the rate it was actually billed at, so changing the card never rewrites past work.
   */
  rateCard?: Record<string, number>;
  /**
   * Everything this studio has paid, in the order it arrived. Held on the studio
   * rather than spread across their jobs — see FreelanceLedgerPayment.
   */
  payments?: FreelanceLedgerPayment[];
  notes?: string;
  active?: boolean;
  createdAt: string;            // YYYY-MM-DD
}


export type FreelanceJobRequestStatus = 'submitted' | 'accepted' | 'declined';

export interface FreelanceJobRequest {
  id: string;
  clientAuthUid: string;
  freelanceClientId: string;
  serviceType: FreelanceServiceType;
  title: string;
  rawDataLink?: string;
  notes?: string;
  
  // Measured units from the Utility
  durationHours?: number;
  durationMinutes?: number;
  durationSeconds?: number;
  quantity?: number;
  
  /** Share of photos kept and billed. See FreelanceJob.keepPercent. */
  keepPercent?: number;
  /** @deprecated Misnamed. Holds a kept share, not a culled one — use keepPercent. */
  cullPercent?: number;
  quotedRate?: number;
  quotedCharge?: number;
  /**
   * The quote worked out under the shared billing rules, stored as submitted.
   *
   * Kept on the request so accepting it does not have to reconstruct the units
   * by dividing the charge by the rate — a division that reproduced whatever the
   * form had computed, correct or not. Absent on requests submitted before this
   * existed, which still fall back to that reconstruction.
   */
  pricing?: FreelancePricing;
  
  status: FreelanceJobRequestStatus;
  createdAt: string; // YYYY-MM-DD
}
