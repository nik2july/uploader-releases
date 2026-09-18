import type { FreelanceEditorPayout } from './freelance';
export type AccountType = 'owner' | 'team' | 'client' | 'partner';

export type TeamTierCategory = 'pre-production' | 'production' | 'post-production' | string;

export interface TierCategoryConfig {
  id: string; // e.g. 'pre-production', 'production', 'post-production', or custom slug
  name: string; // e.g. 'Pre-Production', 'Production', 'Post-Production'
  subtitle?: string; // e.g. 'Client Intake, Sales & Scheduling'
  description?: string;
  colorTheme?: 'amber' | 'emerald' | 'sky' | 'rose' | 'purple' | 'indigo' | 'teal' | 'stone' | string;
  badgeBg?: string;
  badgeText?: string;
  isSystem?: boolean;
  active?: boolean;
}

export interface UserAccount {
  id: number | string;
  name: string;
  role: string;
  phone: string;
  email?: string;
  accountType: AccountType;
  password?: string;
  active?: boolean;
  mustChangePassword?: boolean;
  whatsappGroupLink?: string;
}

export interface ClientPaymentLog {
  id: string;
  amount: number;
  date: string; // YYYY-MM-DD
  /**
   * Marks the booking advance — the payment that confirms the booking.
   * Exactly one per client; every later payment is a balance instalment.
   */
  isAdvance?: boolean;
  mode?: 'Bank Transfer' | 'UPI' | 'Cheque' | 'Cash' | 'Card' | string;
  accountId?: string;
  reference?: string;
  notes?: string;
  whatsappGroupLink?: string;
  createdAt: string;
  assigneeId?: string;
}

export interface ClientDeliverable {
  id: string;
  title: string;
  category: 'Photo' | 'Video' | 'Album' | 'Storage' | 'Raw' | string;
  status: DeliverableStatus;
  assignedMemberId?: number;
  format?: string;
  notes?: string;
  dueDate?: string;
  deliveredDate?: string;
  costPrice?: number;
  sellingPrice?: number;
  /**
   * How much of this there is, in the unit its service bills by — minutes of
   * output, sheets, photos. Agreed when the quote is built and carried here at
   * booking; Post Production prices its own work from it, and what it quotes
   * lands in costPrice above as what BAAWARAY FILMS was charged.
   *
   * Long Form is the exception and needs none: it is priced on the raw data
   * handed over, which is measured when the footage arrives.
   */
  billableQuantity?: number;
  paidToEditor?: boolean;
  paidAt?: string;
  link?: string;
  /**
   * Where the raw data for this deliverable sits — uploaded by the studio, or
   * pasted in when whoever holds the footage sent a link instead.
   */
  rawDataLink?: string;
  rawDataSource?: 'upload' | 'hard_drive' | 'link';
  rawDurationHours?: number;
  rawDurationMinutes?: number;
  rawPhotoCount?: number;
  hardDriveNotes?: string;
  /** Linked Post Production project ids created from this BAAWARAY FILMS deliverable. */
  postProductionJobIds?: string[];
  /**
   * If this deliverable reused raw footage from another deliverable for the same client,
   * the ID and title of the source deliverable.
   */
  reusedFromDeliverableId?: string;
  reusedFromTitle?: string;
  /**
   * Every batch of raw data recorded against this deliverable, keyed by the
   * transfer that brought it. A shoot arrives in more than one go often enough
   * that the headline rawDataLink is only the first of them, and footage handed
   * over on a drive is recorded here too — as received_offline, with nothing
   * uploaded — so what arrived is visible however it came.
   */
  desktopTransfers?: Record<string, {
    id: string; link?: string; purpose?: string; createdAt?: string;
    fileCount?: number; bytes?: number; status?: string; rootName?: string;
  }>;
  linkExpiry?: string;

  /**
   * Where this came from.
   *
   * A deliverable is sold on a quotation and then produced, and those used to be two
   * unrelated records — booking copied the titles across under fresh ids and dropped
   * the price, so nothing downstream knew what a delivery had been sold for. These
   * carry the link, so a production item can always be traced to the line it was
   * quoted as.
   */
  sourceQuotationId?: string;
  sourceDeliverableId?: string;
  /** The deliverable service in Quotation Settings, which is where price lives. */
  linkedRoleId?: string;

  /**
   * Hours of editing this specific deliverable needs, overriding the estimate on its
   * linked service. Undefined falls back to the service, and if that is unset too the
   * scheduler treats the item as unestimated rather than free.
   */
  estimatedEffortHours?: number;

  /**
   * Added after booking, beyond what the quotation covered.
   *
   * Extras never write back to the quotation — that document is already agreed and its
   * payment milestones are derived from its total. They bill on their own Additional
   * Services document instead, and `extraInvoiceId` is stamped once that is paid.
   */
  isExtra?: boolean;
  addedAt?: string;
  extraInvoiceId?: string;
}

export interface Client {
  /** Summarised phone calls, carried over when the enquiry converted. */
  callLogs?: CallLog[];
  id: number;
  name: string;
  couple?: string;
  groomName?: string;
  brideName?: string;
  phone: string;
  // Optional in practice: the client forms leave these blank, and every reader
  // already guards them. They were declared required, which hid that from tsc.
  email?: string;
  city?: string;
  address?: string;
  status: 'booked' | 'shoot done' | 'new lead' | 'inquiry' | 'completed' | string;
  source?: string;
  notes?: string;
  whatsappGroupLink?: string;
  createdAt?: string;
  password?: string;
  mustChangePassword?: boolean;
  // Overall deliveries & payment history
  deliverables?: ClientDeliverable[];
  paymentLogs?: ClientPaymentLog[];
  customTotalAmount?: number; // Optional override/custom contract total amount
  paymentMilestones?: QuotationPaymentMilestone[];
}

/**
 * Sales pipeline stages.
 *
 * A booking is confirmed ONLY when the advance payment is received — there is no
 * contract-signing step. `booked` therefore requires `advanceAmount` and
 * `advancePaidAt` to be set; nothing else may put a lead into that stage.
 *
 * Legacy values ('contacted', 'proposal', 'won') are still accepted on read and
 * normalised by `normaliseLeadStage`, so records written before this model shipped
 * keep working.
 */
export type SalesStage = 'new_enquiry' | 'quote_sent' | 'follow_up' | 'on_hold' | 'advance_pending' | 'booked' | 'lost' | 'needs_time' | string;

/** Retained so pre-existing data and imports keep type-checking. */
export type LeadStage = SalesStage | 'contacted' | 'proposal' | 'won' | 'lost';

export type LostReason =
  | 'price'
  | 'date_unavailable'
  | 'chose_competitor'
  | 'went_silent'
  | 'other';

/** Whether the couple's requested date is actually shootable. */
export type DateAvailability = 'available' | 'taken' | 'tentative_hold';

export type ActivityType =
  | 'note'
  | 'call'
  | 'whatsapp'
  | 'quote_sent'
  | 'stage_change'
  | 'payment';

export interface ActivityEntry {
  id: string;
  at: string; // ISO timestamp
  type: ActivityType;
  body: string;
}

export interface LeadAdvancePayment {
  id: string;
  amount: number;
  date: string;
  mode?: string;
  accountId?: string;
}

/** A bank account, UPI ID, or similar the studio receives client money into. */
export interface PaymentAccountConfig {
  id: string;
  label: string;
  details?: string; // e.g. account number / UPI ID, shown on receipts
  active?: boolean;
}

/** Where a task sits right now. `done` on the record stays the wire format so
 * records written before this model shipped keep reading correctly. */
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done';

export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export type TaskRecurrence = 'none' | 'daily' | 'weekly' | 'monthly';

/** What kind of change in the studio should raise a task. */
export type TaskTriggerKind =
  | 'client_status'
  | 'deliverable_status'
  | 'freelance_stage'
  | 'event_days_before'
  | 'footage_missing';

/**
 * A standing rule: when something in the studio reaches a given state, make sure a
 * task exists for it.
 *
 * Deliberately expressed as a state to be in rather than a transition to detect.
 * Nothing here has to watch for the moment a client turns Booked — a rule simply
 * describes what must be true, and the app reconciles reality against it. That means
 * a rule written today applies to bookings made last month, and no task is ever
 * missed because the app happened not to be open when the change occurred.
 *
 * Tasks are created once and never withdrawn automatically. A rule fires because
 * work genuinely became due; if the client later moves on, the work was still owed,
 * and silently deleting a task somebody may be part-way through is worse than
 * leaving one they can dismiss.
 */
export interface TaskRule {
  id: string;
  name: string;
  active: boolean;
  trigger: {
    kind: TaskTriggerKind;
    /** The status/stage that must be reached, for the state-based kinds. */
    value?: string;
    /** Days before an event, or days after it with no footage logged. */
    days?: number;
  };
  /** The task to raise. `text` may use {client}, {event}, {deliverable} and {job}. */
  task: {
    text: string;
    description?: string;
    dueInDays?: number;
    dueTime?: string;
    priority?: TaskPriority;
    assigneeId?: string;
    category?: string;
  };
}

export interface TaskChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface TaskComment {
  id: string;
  authorName: string;
  text: string;
  createdAt: string;
}

/**
 * A studio to-do — "call the caterer back", "chase the venue for the floor plan",
 * "cull Sharma sangeet selects by Friday".
 *
 * Not derived from a lead or booking: this is the work people carry in their heads.
 * A task may *reference* a client or an event, but it never requires one — most
 * studio work ("renew the drone insurance") belongs to nobody's wedding.
 *
 * `text` and `done` keep their v1 names and meaning so older records, and the
 * compact task list on the Sales Overview, keep working untouched.
 */
export interface SalesTask {
  id: string;
  /** The task title. */
  text: string;
  /** Mirrors `status === 'done'` — kept as the flag older readers check. */
  done: boolean;
  createdAt: string;
  /** Team member id, stored as a string. */
  assigneeId?: string;

  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  /** YYYY-MM-DD. Optional: plenty of real tasks have no deadline. */
  dueDate?: string;
  /**
   * HH:MM on `dueDate`, when the deadline is an hour rather than a day — a gallery
   * owed 24 hours after a 4 PM wedding is due at 4 PM, not merely "that day". Absent
   * on the many tasks where the day is the whole of the deadline, and ignored
   * entirely when there is no dueDate.
   */
  dueTime?: string;
  /** Optional link to a client — only set when the task is actually about one. */
  clientId?: number;
  /** Optional link to a specific event of that client. */
  eventId?: number;
  /** Which side of the studio the work belongs to, e.g. 'post'. */
  category?: string;
  tags?: string[];
  checklist?: TaskChecklistItem[];
  comments?: TaskComment[];
  recurrence?: TaskRecurrence;
  /** Reference URL — a shared drive folder, a WeTransfer link, a doc. */
  link?: string;
  /** Display name of whoever created it. */
  createdBy?: string;
  updatedAt?: string;
  completedAt?: string;
}

/** What a caller supplies to create a task; the store fills in the rest. */
export type TaskDraft = Partial<Omit<SalesTask, 'id' | 'createdAt'>> & { text: string };

export interface Lead {
  /** Summarised phone calls, newest last. See CallLog. */
  callLogs?: CallLog[];
  id: number;
  couple: string;
  phone: string;
  date: string;
  venue: string;
  source: string;
  package: string;
  value: number;
  stage: LeadStage;
  followUp: string;
  notes?: string;
  email?: string;
  specialNotes?: string;
  noteToCouple?: string;

  /**
   * Lost is a terminal flag, not a stage — keeping it orthogonal preserves which
   * stage the lead died at, which is what makes season-end loss analysis useful
   * ("we lose most deals at Quote Sent" beats "we lost 12 deals").
   */
  isLost?: boolean;
  lostReason?: LostReason;
  lostNotes?: string;
  lostAt?: string;

  // Timing — drives first-response time, days-in-stage, and the follow-up queue.
  inquiredAt?: string;
  respondedAt?: string;
  stageEnteredAt?: string;
  nextFollowUpAt?: string;

  // The gate. A lead cannot reach `booked` without both of these.
  advanceAmount?: number;
  advancePaidAt?: string;

  /** Partial advances collected before the full booking advance is in hand — the
   * date is held (not yet confirmed booked) until these sum to the required amount. */
  advancePayments?: LeadAdvancePayment[];

  // Date safety.
  dateAvailability?: DateAvailability;
  holdExpiresAt?: string;

  // Linkage.
  quotationId?: string;
  convertedClientId?: number;
  referredByClientId?: number;
  activity?: ActivityEntry[];
}

export interface MemberRateCard {
  // For Photographer / Cinematographer (Events <= 6 hrs vs > 6 hrs)
  rateUnder6Hours?: number;
  rateOver6Hours?: number;
  // For Drone operator (one flat price per event)
  flatEventRate?: number;
  // For Video Editor (flat price per video film / project)
  flatVideoRate?: number;
  // For Photo Editor (based on per photo)
  perPhotoRate?: number;
  // For Full Coverage raw data duration (cost per hour of raw footage)
  hourlyRawDataRate?: number;
  // For Album Designer (cost per sheet designed)
  albumDesignPerSheetRate?: number;
}

export interface ProductionCatalogItem {
  id: string;
  name: string;
  category: 'Photo' | 'Video' | 'Drone' | 'Service' | 'Live' | 'Album' | string;
  linkedRoleIds: string[];
  sellingPrice: number; // Base client billing rate
  defaultCost?: number; // Base reference internal crew payout rate
  description?: string;
  unit?: 'per_event' | 'per_day' | 'per_slot' | 'per_item' | string;
  active?: boolean;
}

export interface TeamMember {
  id: number;
  /**
   * Firebase uid for this person, stamped the first time they sign in (see
   * AppContext.linkShadowAuth). It is what firestore.rules' isSelf() matches on, so
   * a member with no uid yet is simply not recognised as themselves anywhere.
   * Written by the app long before it was declared here.
   */
  authUid?: string;
  /**
   * Working hours this person can give the studio in a day, for turning an effort
   * estimate into calendar dates. Falls back to the studio-wide default.
   */
  dailyCapacityHours?: number;
  /**
   * This record is the studio owner working as crew.
   *
   * The owner is stored apart from the roster (see `ownerConfig`), so they never
   * appeared in the crew, deliverable or freelance-editor pickers and could not be
   * put on their own shoots. This gives them a place in the roster without pretending
   * they are an employee: their time is not a per-job cost — it is the studio's own
   * margin — so the record is salaried, and bulk account-linking skips it because
   * the owner already has a cloud identity of their own.
   */
  isOwnerRecord?: boolean;
  /**
   * Dates this person is not working — leave, an outside commitment, anything. The
   * scheduler skips them entirely, so booking a holiday pushes every downstream
   * delivery date out rather than quietly compressing the work.
   */
  unavailablePeriods?: { id: string; from: string; to: string; reason?: string }[];
  name: string;
  role: 'Photographer' | 'Cinematographer' | 'Drone' | 'Video Editor' | 'Photo Editor' | string;
  assignedRoleIds?: string[];
  category?: TeamTierCategory;
  categories?: TeamTierCategory[];
  phone: string;
  email?: string;
  password: string;
  active: boolean;
  /**
   * What this person has been paid for freelance work, and which jobs each payment
   * covered. Held here rather than on the jobs because one transfer routinely settles
   * several — see FreelanceEditorPayout.
   */
  freelancePayouts?: FreelanceEditorPayout[];
  ratePerDay?: number;
  rateCard?: MemberRateCard;
  rolePayoutRates?: Record<string, number>; // roleId -> internal cost / payout rate for that team member
  itemPayoutRates?: Record<string, number>; // itemId -> internal cost / payout rate for that team member
  hourlyRawDataCostRate?: number; // Specific cost price per hour for Full Coverage raw data duration
  albumDesignCostPerSheet?: number; // Specific cost price per sheet for Album design
  bio?: string;
  mustChangePassword?: boolean;

  /**
   * How this person is paid.
   *
   * `per_event` (the default, and what every pre-existing record means) bills the
   * studio per shoot or per deliverable off the rate card. `salaried` means a
   * fixed monthly wage: their per-unit cost is genuinely zero, because the salary
   * is already paid whether or not they work a given wedding.
   *
   * This distinction has to be explicit. Left to inference, a member with no rates
   * on file falls through `calculateMemberEventFee` to a hardcoded guess — ₹10,000
   * for an unrecognised role — which silently books a payable that nobody owes.
   */
  payType?: 'per_event' | 'salaried';
  /** Fixed monthly wage. Only meaningful when `payType === 'salaried'`. */
  monthlySalary?: number;
}

export interface TeamRequirement {
  photographer: number;
  cinematographer: number;
  drone: number;
  [roleKey: string]: number | undefined;
}

export interface MemberDataLog {
  teamMemberId: number;
  dataGb: string | number;
  fileCount: string | number;
  copied: boolean;
  receivedAt?: string | null;
}

export interface MemberPaymentRecord {
  teamMemberId: number;
  amount: number | string;
  dueDate?: string;
  status: 'pending' | 'paid';
  paidAt?: string;
  /**
   * Where `amount` came from. 'auto' was priced from the member's role rate when
   * they were allocated, and may be re-priced when that rate changes; 'manual' was
   * typed in for this one job and is never recomputed. Absent on records written
   * before this distinction existed — those are treated as 'auto', since the Team
   * panel rate is the figure the studio actually agreed.
   */
  amountSource?: 'auto' | 'manual';
  /**
   * The crew role this member was seated in for this event, recorded when they were
   * allocated. The event only stores a flat `assignments` list of member ids, so
   * without this there is nothing anywhere saying WHAT someone was hired to do on a
   * given job — every screen had to guess by intersecting the event's requirements
   * with the member's approved services, which is ambiguous for anyone approved for
   * two roles the same event needs. Absent on records written before it was stored;
   * those still fall back to that reconstruction.
   */
  roleId?: string;
}

export type DeliverableStatus = 'pending' | 'in-progress' | 'review' | 'sent' | 'changes' | 'delivered';

export interface Deliverable {
  id: string;
  title: string;
  category: 'Video' | 'Photo' | 'Album' | 'Storage' | 'Raw';
  status: DeliverableStatus;
  format?: string;
  notes?: string;
  assignedMemberId?: number;
}

export type ProjectStatus = 'planning' | 'confirmed' | 'shooting' | 'post-production' | 'delivered';

export interface ProjectEvent {
  id: number;
  clientId?: number;
  couple: string;
  eventName: string;
  date: string; // YYYY-MM-DD
  durationHours?: number; // Duration in hours (1 to 12, default 6)
  time: string; // e.g. "4:00 PM"
  endTime?: string; // Optional calculated end time
  venue: string;
  address?: string;
  mapLink: string;
  guests: number;
  teamRequired: TeamRequirement;
  assignments: number[]; // team member IDs
  clientLocation?: string;
  package: string;
  status: ProjectStatus;
  progress: number;
  total: number;
  paid: number;
  due: string | null;
  // Deliverables
  deliverables?: Deliverable[];
  // Legacy / Direct properties
  dataCopied?: boolean;
  dataReceived?: boolean;
  dataReceivedAt?: string;
  dataGb?: string | number;
  fileCount?: string | number;
  paymentAmount?: string | number;
  paymentDueDate?: string;
  paymentReceived?: boolean;
  // Per-member handoff records
  dataLogs?: MemberDataLog[];
  teamPayments?: MemberPaymentRecord[];
}

export interface StudioTermsConfig {
  teamTerms: string[];
  editorTerms: string[];
  clientQuotationTerms: string[];
  invoiceReceiptTerms: string[];
}

/**
 * Whether a role group is quoted on an event (crew on the day) or delivered
 * afterwards (editing, albums). The two lists are deliberately independent —
 * enabling a Photographer role must never touch the Deliverables side.
 */
export type RoleGroupKind = 'event' | 'deliverable';

/**
 * A role the studio staffs or bills for — "Photographer", "Video Editor".
 *
 * A group carries no price of its own. It exists to gather the priced services
 * beneath it (CrewRoleConfig rows pointing at it via `groupId`), so the studio
 * can offer "Photographer · Full Day" and "Photographer · Outstation" at
 * different rates without duplicating the role itself.
 */
export interface StudioRoleGroup {
  id: string;
  name: string;
  kind: RoleGroupKind;
  description?: string;
  isSystem?: boolean;
  active?: boolean;
}

/**
 * One priced service offered under a role group.
 *
 * Named CrewRoleConfig for historical reasons — every existing record, team
 * assignment (`assignedRoleIds`) and saved quotation already points at these ids,
 * so the shape stayed put when roles gained a parent group.
 */
export interface CrewRoleConfig {
  id: string;
  name: string;
  /**
   * How long this service takes an editor, in working hours.
   *
   * Set once per service in Quotation Settings and inherited by every deliverable
   * sold as that service, so the studio does not re-estimate the same work on every
   * booking. A deliverable may still override it — see
   * ClientDeliverable.estimatedEffortHours — because one wedding's photo set is not
   * another's. Undefined means "not estimated yet", which the forecast reports as a
   * gap rather than silently treating as zero work.
   */
  estimatedEffortHours?: number;
  /**
   * Effort in working hours per measurement unit (e.g. per hour of raw video, per finished minute, per sheet, per 100 photos).
   */
  editingEffortHoursPerUnit?: number;
  /**
   * How Post Production measures this service, when it is one they sell.
   *
   * Setting it is what makes a deliverable service into work Post Production
   * prices — by the hour of raw data, the minute of finished cut, the photo,
   * the sheet, or simply how many. Left unset, the service is something the
   * studio delivers itself and Post Production never sees.
   */
  postProductionBasis?: import('./freelance').FreelancePricingBasis;
  /**
   * Preset default quantity or duration for this deliverable.
   * e.g. 5 for a 5-minute trailer, 40 for a 40-sheet album, 3 for 3 reels, 300 for 300 photos.
   */
  defaultQuantity?: number;
  /**
   * Default editor cost / payout rate per unit (or flat) for post-production.
   */
  defaultCostRate?: number;
  /**
   * Whether client price is charged per unit or as a flat package. Defaults to 'per_unit'.
   */
  pricingType?: 'per_unit' | 'flat';
  /**
   * Hours after EACH event by which this must be done — a same-day photo upload,
   * a face-recognition gallery, anything with a clock on it rather than a place in
   * a queue.
   *
   * Setting this changes what the deliverable is, not just when it is due. It stops
   * being editing work that waits its turn behind a highlight film and becomes a
   * dated obligation that recurs after every function, so a four-function wedding
   * owes it four times. It holds no editor slot, because it is absorbed the same way
   * a round of revisions is, and it surfaces as a task rather than in an editing
   * queue. `estimatedEffortHours` is ignored when this is set.
   *
   * Internal only — the quotation PDF shows the deliverable's name and price and
   * nothing else, so the client still just sees the line they are paying for.
   */
  fixedTurnaroundHours?: number;
  /** Parent role group. Falls back to `category` for records saved before groups existed. */
  groupId?: string;
  category?: TeamTierCategory | string;
  defaultRate?: number;
  rateUnder6Hours?: number;
  rateOver6Hours?: number;
  flatEventRate?: number;
  flatVideoRate?: number;
  perPhotoRate?: number;
  hourlyRawDataSellingRate?: number; // Hourly raw data rate for Full Coverage (₹/hr)
  hourlyRawDataCostRate?: number; // Cost / editor payout per hour of raw data
  clientBillingRate?: number;
  /**
   * Studio-side reference code for this service — a SKU, a shorthand, whatever the
   * studio files it under.
   *
   * Internal only. It is deliberately kept off every client-facing surface: the
   * quotation PDF, the additional-services bill, and the WhatsApp messages that
   * carry them. Anything a couple can see uses `name`.
   */
  internalCode?: string;
  unit?: 'per_day' | 'per_event' | 'per_slot' | 'per_hour' | 'per_sheet' | string;
  description?: string;
  active?: boolean;
  isSystem?: boolean; // System roles (Full Coverage, Album) cannot be deleted
  permanent?: boolean;
}

export interface AlbumSheetType {
  id: string;
  name: string; // e.g. "Lustre Archival Paper", "Silk / Metallic Matte", "Velvet Ultra Touch", "HD Gloss Non-Tearable"
  printingSellingRatePerSheet: number; // Client selling price per sheet (₹)
  printingCostRatePerSheet?: number; // Lab printing cost per sheet (₹)
  description?: string;
}

export interface AlbumCoverBagType {
  id: string;
  name: string; // e.g. "Standard Leatherette Cover + Hard Box", "Acrylic Glass Cover + Velvet Trunk", "Wooden Box + Leather Spine"
  sellingPrice: number; // Client price for cover + bag (₹)
  costPrice?: number; // Fabrication cost price for cover + bag (₹)
  description?: string;
}

export interface AlbumDesignRateOption {
  id: string;
  name: string; // e.g. "Standard Studio Layout", "Magazine Editorial Story", "Bespoke Minimalist Layout"
  designSellingRatePerSheet: number; // Design charge per sheet to client (₹)
  designCostRatePerSheet?: number; // Designer payout per sheet (₹)
  description?: string;
}

export interface AlbumPricingConfig {
  defaultSheetCount: number; // e.g. 40 sheets (80 pages)
  sheetTypes: AlbumSheetType[];
  coverBagTypes: AlbumCoverBagType[];
  designRates: AlbumDesignRateOption[];
}

export interface FullCoverageRawRateConfig {
  hourlySellingRate: number; // Client hourly selling rate for raw footage duration (₹/hr) e.g. 2500
  hourlyCostRate?: number; // Base reference internal editor cost rate (₹/hr) e.g. 1200
  defaultDurationHours?: number; // Default duration (hours) e.g. 4
  description?: string;
}

export interface AddOnItem {
  id: string;
  title: string;
  category: 'Album' | 'Video' | 'Photo' | 'Storage' | 'Service';
  description: string;
  defaultPrice: number;
}

export interface StudioPriceList {
  candidPhotographerRate: number;
  traditionalPhotographerRate: number;
  cinematographerRate: number;
  droneRate: number;
  assistantRate: number;
  crewRoles?: CrewRoleConfig[];
  productionCatalog?: ProductionCatalogItem[];
  standardDeliverables: string[];
  addOnCatalog: AddOnItem[];
}

export interface QuotationEventItem {
  id: string;
  itemId: string;
  name: string;
  category?: string;
  linkedRoleIds?: string[];
  quantity: number;
  sellingPrice: number;
  customSellingPrice?: number;
  internalCost?: number;
  assignedMemberId?: number;
  notes?: string;
}

export interface QuotationEvent {
  id: string;
  eventName: string;
  date: string;
  durationHours?: number;
  time: string;
  endTime: string;
  venue: string;
  address?: string;
  mapLink?: string;
  city?: string;
  guestCount: number;
  teamRequired: {
    candidPhotographer?: number;
    traditionalPhotographer?: number;
    cinematographer?: number;
    drone?: number;
    assistant?: number;
    photographer?: number;
    [roleKey: string]: number | undefined;
  };
  catalogItems?: QuotationEventItem[];
  customCost?: number | null;
  notes?: string;
}

export interface QuotationDeliverable {
  id: string;
  title: string;
  billableQuantity?: number;
  category: 'Photo' | 'Video' | 'Album' | 'Storage' | 'Service' | string;
  tierCategory?: string; // Linked Tier Category ID e.g. 'post-production', 'production'
  linkedRoleId?: string; // Optional linked Studio Crew Role ID (from CrewRoleConfig)
  isStandard: boolean;
  included: boolean;
  price: number;
  description?: string;
}

/**
 * One phone call, summarised.
 *
 * Written by the call-upload endpoints under api/calls; the studio reads it on a
 * lead before the booking and on the client after it, which is why it hangs off
 * both rather than living in its own collection keyed one way or the other.
 */
export interface CallLog {
  id: string;
  /** ISO timestamp of the call itself, not of the summary. */
  date: string;
  summary: string;
  /** How the couple sounded, when the model was confident enough to say. */
  mood?: string;
  nextSteps?: string[];
  areasOfImprovement?: string[];
  durationSec?: number;
  recordingPath?: string;
  transcriptionSnippet?: string;
}

export interface QuotationPaymentMilestone {
  milestone?: string;
  name?: string;
  percentage: number;
  amount?: number;
  description?: string;
}

export interface QuotationOtherCharge {
  id: string;
  label: string; // e.g. "Team Travel", "Stay", "Food"
  amount: number;
}

export interface Quotation {
  id: string;
  quoteNumber: string;
  clientName: string;
  phone: string;
  email?: string;
  city?: string;
  createdAt: string;
  assigneeId?: string;
  validUntil: string;
  status: 'draft' | 'sent' | 'approved' | 'converted' | 'expired';
  events: QuotationEvent[];
  deliverables: QuotationDeliverable[];
  /** Logistics costs billed separately from deliverables — travel, stay, food. */
  otherCharges?: QuotationOtherCharge[];
  subtotal: number;
  discountType: 'percentage' | 'amount';
  discountValue: number;
  taxPercent: number;
  totalAmount: number;
  paymentSchedule: QuotationPaymentMilestone[];
  specialNotes?: string;
  customTerms?: string[];
  /**
   * "A note to you" — a short personal note printed near the front of the proposal.
   *
   * Written per couple, unlike `aboutUs` and `ourApproach`, which are the studio's
   * standing copy. Left blank the page is simply not printed, rather than printing
   * an empty one.
   */
  noteToCouple?: string;
}

/** A saved quotation template the studio can reuse to start a new quote faster. */
export interface QuotationPreset {
  id: string;
  name: string;
  createdAt: string;
  assigneeId?: string;
  events: QuotationEvent[];
  deliverables: QuotationDeliverable[];
  otherCharges?: QuotationOtherCharge[];
  discountType: 'percentage' | 'amount';
  discountValue: number;
  taxPercent: number;
}

export interface StandardDeliverableTemplate {
  id: string;
  title: string;
  category: string; // Subcategory or display label
  tierCategory?: string; // Linked Tier Category ID e.g. 'post-production', 'production'
  linkedRoleId?: string; // Optional linked Studio Crew Role ID (from CrewRoleConfig)
  defaultPrice: number;
  isStandard: boolean;
  includedByDefault: boolean;
  description?: string;
}

export interface QuotationBuilderSettingsConfig {
  serviceCategories?: string[]; // Tier Category IDs for Services & Production Crew (Step 2)
  deliverableCategories?: string[]; // Tier Category IDs for Deliverables & Standard Package (Step 3)
  deliverableTierCategories?: string[]; // Explicit alias for Tier Category IDs
  /** Retired: a preset now carries the whole quotation shape instead. Left on the
   *  type so saved settings keep parsing; nothing reads it. */
  standardDeliverables?: StandardDeliverableTemplate[];
  /** The WhatsApp message sent alongside the quotation PDF. Supports the
   *  placeholders listed in DEFAULT_WHATSAPP_QUOTATION_MESSAGE. */
  whatsappMessageTemplate?: string;

  /** "About us" — who the studio is. Printed on the proposal, same for every couple. */
  aboutUs?: string;
  /** "Our approach" — how the studio works. Printed on the proposal, same for every couple. */
  ourApproach?: string;
}

/** A column on the Sales pipeline board. The five shipped with the app are `core`
 * — their ids drive the advance-payment gate and follow-up automation, so they can
 * be relabelled but never deleted. Anything else is a studio-added tracking stage. */
export interface PipelineStageConfig {
  id: string;
  label: string;
  color: string;
  bg: string;
  core?: boolean;
}

export interface StudioSettingsConfig {
  studioName: string;
  studioTagline: string;
  logoUrl: string;
  taxGstPercent: number;
  /** Ceiling on any discount a quotation may carry, as a percentage of subtotal.
   *  Applies to fixed-amount discounts too — the cap is on what the studio gives
   *  away, not on how it was typed. */
  maxDiscountPercent?: number;
  quotationValidityDays: number;
  currency: string;
  watermarkText: string;
  leadSources: string[];
  clientStatuses?: string[];
  dropbox?: {
    appKey?: string;
    appSecret?: string;
    refreshToken?: string;
  };
  tierCategories?: TierCategoryConfig[];
  /** Role groups behind the Events / Deliverables tabs of the quotation builder. */
  roleGroups?: StudioRoleGroup[];
  crewRoles?: CrewRoleConfig[];
  productionCatalog?: ProductionCatalogItem[];
  deliverableCategories: string[];
  /** Standing rules that raise tasks automatically. See TaskRule. */
  taskRules?: TaskRule[];
  /**
   * @deprecated Freelance categories are no longer studio-editable.
   *
   * The category now also decides how a job is billed — short form by the output
   * minute, long form by the raw hour, photos and album sheets by the piece — so a
   * name typed in here would have no way to price the work logged under it. See
   * FREELANCE_SERVICES. Kept on the type so settings saved by older builds still
   * parse; nothing reads it.
   */
  freelanceServiceTypes?: string[];
  postProductionTierCategories?: string[]; // Selected Tier Category IDs to display in Post-Production Hub
  postProductionCategories?: string[]; // Selected Deliverable categories in Post-Production Hub
  paymentMilestones: QuotationPaymentMilestone[];
  quotationBuilderSettings?: QuotationBuilderSettingsConfig;
  quotationPresets?: QuotationPreset[];
  pipelineStages?: PipelineStageConfig[];
  paymentModes?: string[];
  paymentAccounts?: PaymentAccountConfig[];
  rawCoverageRates?: FullCoverageRawRateConfig; // Hourly rates for Full Coverage raw footage duration
  albumPricing?: AlbumPricingConfig; // Multi-component Album Pricing (Sheets, Bag & Cover, Design)
}

export * from './album';
export * from './freelance';

export type OwnerView = 
  | 'overview' 
  | 'inquiries'
  | 'clients' 
  | 'clientDetail'
  | 'leads' 
  | 'sales'
  | 'projects' 
  | 'postProduction'
  | 'albums'
  | 'freelance'
  | 'freelanceStudio'
  | 'freelanceEditor'
  | 'dataLog' 
  | 'payments' 
  | 'team' 
  | 'teamMember' 
  | 'terms'
  | 'tasks'
  | 'portal';

export type TeamView = 
  | 'overview' 
  | 'projects' 
  | 'data' 
  | 'teamPayments'
  | 'teamMyOverview'
  | 'teamMyEvents'
  | 'teamMyDeliverables'
  | 'postProduction'
  | 'albums'
  | 'freelance'
  | 'teamDataCopied'
  | 'teamMyPayments'
  | 'terms'
  | 'tasks'
  | 'portal';

export type PartnerView = 'partner_dashboard';
export type ActiveView = OwnerView | TeamView | PartnerView;
