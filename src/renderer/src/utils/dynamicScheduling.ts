import { FreelanceJob } from '../types/freelance';
import { TeamMember } from '../types';

export type EditorWorkflowStage = 'download_pending' | 'in_process' | 'sent_for_review' | 'finalized';

export interface UnavailablePeriod {
  id: string;
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  reason?: string;
}

export interface DynamicScheduleResult {
  jobId: string;
  calculatedDueDate: string; // YYYY-MM-DD
  queuePosition: number;      // 1-based order in active queue
  totalInQueue: number;
  isChanges: boolean;
  requiredDays: number;
  daysRemaining: number;      // can be negative if overdue
  isOverdue: boolean;
  isAvailableToday: boolean;
}

export interface OnTimeDeliveryRecord {
  jobId: string;
  jobCode: string;
  title: string;
  clientName: string;
  deliveredDate: string;
  expectedDueDate: string;
  isOnTime: boolean;
  daysVariance: number; // 0 or negative = early/on time, positive = delayed days
  turnaroundDays: number; // days from download to delivery
}

export interface OnTimeDeliveryReport {
  totalDelivered: number;
  onTimeCount: number;
  delayedCount: number;
  onTimeScore: number; // 0 to 100 percentage
  averageTurnaroundDays: number;
  currentStreak: number; // consecutive on-time deliveries
  records: OnTimeDeliveryRecord[];
}

const DAY_MS = 86400000;

/** Parse YYYY-MM-DD to UTC Date to avoid timezone shift */
export function parseDate(iso: string): Date {
  const clean = iso.slice(0, 10);
  const [y, m, d] = clean.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

/** Format Date to YYYY-MM-DD */
export function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Add calendar days to YYYY-MM-DD */
export function addCalendarDays(iso: string, days: number): string {
  return formatIsoDate(new Date(parseDate(iso).getTime() + days * DAY_MS));
}

/** Check if a date falls on an editor off-day / leave */
export function isDayUnavailable(iso: string, unavailablePeriods?: UnavailablePeriod[]): boolean {
  if (!unavailablePeriods || unavailablePeriods.length === 0) return false;
  const dateOnly = iso.slice(0, 10);
  return unavailablePeriods.some(p => dateOnly >= p.from && dateOnly <= p.to);
}

/** Get the next working day (skipping off days) */
export function advanceToNextWorkingDay(iso: string, unavailablePeriods?: UnavailablePeriod[]): string {
  let curr = iso.slice(0, 10);
  let guard = 0;
  while (isDayUnavailable(curr, unavailablePeriods) && guard < 365) {
    curr = addCalendarDays(curr, 1);
    guard++;
  }
  return curr;
}

/**
/**
 * Categorize a job into editor workflow stages:
 * - 'in_process': Actively assigned to editor (due date runs continuously, downloads can happen anytime)
 * - 'sent_for_review': Deliverable uploaded/submitted to Dropbox, awaiting review
 * - 'finalized': Approved, final delivered or completed (shows in Payments)
 */
export function getEditorWorkflowStage(job: FreelanceJob): EditorWorkflowStage {
  if (job.stage === 'final_delivered' || job.stage === 'completed') {
    return 'finalized';
  }
  if (job.stage === 'draft_received' || job.stage === 'sent_to_client') {
    return 'sent_for_review';
  }
  if (job.stage === 'changes_received' || job.stage === 'changes_sent_to_editor') {
    return 'in_process';
  }
  if (!job.downloadedAt) {
    return 'download_pending';
  }
  return 'in_process';
}

/**
 * Add N working days starting after the given start day, skipping any off days / leaves.
 */
export function addWorkingDays(
  startIso: string,
  daysNeeded: number,
  unavailablePeriods?: UnavailablePeriod[]
): string {
  let curr = startIso.slice(0, 10);
  let daysAdded = 0;
  let guard = 0;

  while (daysAdded < daysNeeded && guard < 730) {
    curr = addCalendarDays(curr, 1);
    guard++;
    if (!isDayUnavailable(curr, unavailablePeriods)) {
      daysAdded++;
    }
  }

  return curr;
}

/**
 * Calculate dynamic due dates for all assigned jobs of an editor.
 *
 * Rules:
 * 1. For client revisions (changes_received / changes_sent_to_editor):
 *    - Always given exactly 2 working days turnaround from changesReceivedDate (skipping off days).
 *    - Never consumes or delays the regular project queue capacity!
 *
 * 2. For regular in-process cuts:
 *    - Clock starts upon assignment/receipt (downloading does not hold up the clock, can download in advance).
 *    - Admin sets requiredDays (default 2).
 *    - Sequential Queueing: Job 1 gets assignmentDate + requiredDays (skipping off days).
 *      Job 2 queues behind Job 1: starts when Job 1 completes, taking + requiredDays!
 *    - Any date marked as leave in unavailablePeriods is skipped forward.
 */
export function calculateDynamicDueDates(
  jobs: FreelanceJob[],
  member?: TeamMember | null,
  todayIso: string = formatIsoDate(new Date())
): Map<string, DynamicScheduleResult> {
  const results = new Map<string, DynamicScheduleResult>();
  const unavailablePeriods: UnavailablePeriod[] = member?.unavailablePeriods || [];
  const isAvailableToday = !isDayUnavailable(todayIso, unavailablePeriods);

  // 1. First, handle all jobs undergoing client changes (independent 2-day turnaround)
  const changeJobs = jobs.filter(
    j => j.stage === 'changes_received' || j.stage === 'changes_sent_to_editor'
  );

  for (const job of changeJobs) {
    const changesStart = (job.changesSentToEditorDate || job.changesReceivedDate || todayIso).slice(0, 10);
    // 2 working days for revisions
    const calculatedDueDate = addWorkingDays(changesStart, 2, unavailablePeriods);
    const daysRemaining = Math.round((parseDate(calculatedDueDate).getTime() - parseDate(todayIso).getTime()) / DAY_MS);

    results.set(job.id, {
      jobId: job.id,
      calculatedDueDate,
      queuePosition: 1,
      totalInQueue: 1,
      isChanges: true,
      requiredDays: 2,
      daysRemaining,
      isOverdue: daysRemaining < 0,
      isAvailableToday
    });
  }

  // 2. Filter all active in-process cutting jobs assigned to this editor
  const inProcessCuttingJobs = jobs.filter(
    j => j.stage === 'sent_to_editor'
  );

  // Sort them: Priority first (urgent -> high -> normal), then earliest assignment/start date, then createdAt
  const priorityScore = (p?: string) => (p === 'urgent' ? 0 : p === 'high' ? 1 : 2);
  const sortedJobs = [...inProcessCuttingJobs].sort((a, b) => {
    const pDiff = priorityScore(a.priority) - priorityScore(b.priority);
    if (pDiff !== 0) return pDiff;
    const aStart = (a.sentToEditorDate || a.dataReceivedDate || a.createdAt || '').slice(0, 10);
    const bStart = (b.sentToEditorDate || b.dataReceivedDate || b.createdAt || '').slice(0, 10);
    const startDiff = aStart.localeCompare(bStart);
    if (startDiff !== 0) return startDiff;
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  });

  // 3. Sequentially allocate working days
  let queueCursorDate: string | null = null;
  const totalInQueue = sortedJobs.length;

  sortedJobs.forEach((job, index) => {
    const queuePosition = index + 1;
    const requiredDays = typeof job.requiredDays === 'number' && job.requiredDays > 0 ? job.requiredDays : 2;
    const jobStartDate = (job.sentToEditorDate || job.dataReceivedDate || job.createdAt || todayIso).slice(0, 10);

    let startDate: string;
    if (!queueCursorDate) {
      // First in queue starts from its assignment/received date
      startDate = jobStartDate;
    } else {
      // Subsequent jobs start after previous job completes, or on its start date if that date is later
      startDate = jobStartDate > queueCursorDate ? jobStartDate : queueCursorDate;
    }

    const calculatedDueDate = addWorkingDays(startDate, requiredDays, unavailablePeriods);
    // The next job queues starting from this due date
    queueCursorDate = calculatedDueDate;

    const daysRemaining = Math.round((parseDate(calculatedDueDate).getTime() - parseDate(todayIso).getTime()) / DAY_MS);

    results.set(job.id, {
      jobId: job.id,
      calculatedDueDate,
      queuePosition,
      totalInQueue,
      isChanges: false,
      requiredDays,
      daysRemaining,
      isOverdue: daysRemaining < 0,
      isAvailableToday
    });
  });

  return results;
}

/**
 * Calculate the On-Time Delivery Report for an editor.
 *
 * Formula:
 *   On-Time Delivery Rate (%) = (On-Time Deliveries / Total Deliveries) * 100
 *
 * A delivery is considered on time if deliveredDate <= expectedDueDate.
 */
export function calculateOnTimeReport(
  jobs: FreelanceJob[],
  member?: TeamMember | null
): OnTimeDeliveryReport {
  const dynamicMap = calculateDynamicDueDates(jobs, member);

  const records: OnTimeDeliveryRecord[] = [];

  // Filter delivered / finalized jobs
  const deliveredJobs = jobs.filter(j => {
    return (
      !!j.draftReceivedDate ||
      !!j.finalDeliveredDate ||
      !!j.completedDate ||
      j.stage === 'draft_received' ||
      j.stage === 'sent_to_client' ||
      j.stage === 'final_delivered' ||
      j.stage === 'completed'
    );
  });

  // Sort by delivery date descending to compute current streak accurately
  const sortedDelivered = [...deliveredJobs].sort((a, b) => {
    const aDate = a.finalDeliveredDate || a.draftReceivedDate || a.completedDate || a.createdAt;
    const bDate = b.finalDeliveredDate || b.draftReceivedDate || b.completedDate || b.createdAt;
    return bDate.localeCompare(aDate);
  });

  let onTimeCount = 0;
  let delayedCount = 0;
  let totalTurnaround = 0;
  let turnaroundCount = 0;

  for (const job of sortedDelivered) {
    const deliveredDate = (job.finalDeliveredDate || job.draftReceivedDate || job.completedDate || '').slice(0, 10);
    const dynamicRes = dynamicMap.get(job.id);
    const expectedDueDate = (dynamicRes?.calculatedDueDate || job.changesDueDate || job.dynamicDueDate || job.dueDate || '').slice(0, 10);

    let isOnTime = true;
    let daysVariance = 0;

    if (deliveredDate && expectedDueDate) {
      const delTime = parseDate(deliveredDate).getTime();
      const expTime = parseDate(expectedDueDate).getTime();
      daysVariance = Math.round((delTime - expTime) / DAY_MS);
      isOnTime = daysVariance <= 0;
    }

    if (isOnTime) {
      onTimeCount++;
    } else {
      delayedCount++;
    }

    // Turnaround time: from download (or data received / created) to delivered
    const startIso = (job.downloadedAt || job.dataReceivedDate || job.sentToEditorDate || job.createdAt).slice(0, 10);
    let turnaroundDays = 0;
    if (deliveredDate && startIso) {
      turnaroundDays = Math.max(0, Math.round((parseDate(deliveredDate).getTime() - parseDate(startIso).getTime()) / DAY_MS));
      totalTurnaround += turnaroundDays;
      turnaroundCount++;
    }

    records.push({
      jobId: job.id,
      jobCode: job.jobCode,
      title: job.title,
      clientName: job.clientName,
      deliveredDate,
      expectedDueDate,
      isOnTime,
      daysVariance,
      turnaroundDays
    });
  }

  const totalDelivered = deliveredJobs.length;
  const onTimeScore = totalDelivered > 0 ? Math.round((onTimeCount / totalDelivered) * 100) : 100;
  const averageTurnaroundDays = turnaroundCount > 0 ? Math.round((totalTurnaround / turnaroundCount) * 10) / 10 : 0;

  // Streak is consecutive on-time deliveries from most recent
  let currentStreak = 0;
  for (const rec of records) {
    if (rec.isOnTime) {
      currentStreak++;
    } else {
      break;
    }
  }

  return {
    totalDelivered,
    onTimeCount,
    delayedCount,
    onTimeScore,
    averageTurnaroundDays,
    currentStreak,
    records
  };
}

export interface EditorWorkload {
  memberId: number;
  name: string;
  role?: string;
  phone?: string;
  activeJobsCount: number;
  activeJobs: { id: string; title: string; requiredDays: number; dueDate?: string; stage: string }[];
  totalAllocatedDays: number;
  onLeaveToday: boolean;
  leaveEnd?: string;
  nextAvailableDate: string;
  statusLabel: string;
  tone: 'available' | 'light' | 'busy' | 'heavy' | 'on_leave';
}

/**
 * Calculate real-time workload and capacity radar for all studio editors.
 */
export function calculateEditorWorkloads(
  jobs: FreelanceJob[],
  team: TeamMember[],
  referenceDate?: string
): EditorWorkload[] {
  const today = (referenceDate || new Date().toISOString()).slice(0, 10);
  const workloads: EditorWorkload[] = [];

  // Filter team to those in post-production / editing or with assigned jobs
  const postMembers = team.filter(m => {
    const role = (m.role || '').toLowerCase();
    const department = ((m as any).department || '').toLowerCase();
    return (
      role.includes('editor') ||
      role.includes('post') ||
      department.includes('post') ||
      department.includes('edit') ||
      jobs.some(j => j.editorMemberId === m.id)
    );
  });

  const membersToEvaluate = postMembers.length > 0 ? postMembers : team;

  for (const member of membersToEvaluate) {
    const memberId = Number(member.id);
    const periods = member.unavailablePeriods || [];

    // Check if on leave today
    let onLeaveToday = false;
    let leaveEnd: string | undefined;

    for (const p of periods) {
      if (p.from && p.to && today >= p.from && today <= p.to) {
        onLeaveToday = true;
        leaveEnd = p.to;
        break;
      }
    }

    // Active jobs (not completed and not final delivered)
    const active = jobs.filter(
      j =>
        (j.editorMemberId === memberId || (j as any).editor?.id === memberId) &&
        j.stage !== 'completed' &&
        j.stage !== 'final_delivered'
    );

    const activeJobs = active.map(j => ({
      id: j.id,
      title: j.title,
      requiredDays: Number(j.requiredDays) || 2,
      dueDate: j.dueDate,
      stage: j.stage || 'in_process'
    }));

    const totalAllocatedDays = activeJobs.reduce((sum, j) => sum + j.requiredDays, 0);

    // Calculate when this editor will next be free
    let nextAvailableDate = today;
    if (onLeaveToday && leaveEnd) {
      nextAvailableDate = addCalendarDays(leaveEnd, 1);
    }

    if (totalAllocatedDays > 0) {
      nextAvailableDate = addWorkingDays(nextAvailableDate, totalAllocatedDays, periods);
    }

    // Tone and status label
    let tone: EditorWorkload['tone'] = 'available';
    let statusLabel = '🟢 Available now';

    if (onLeaveToday && leaveEnd) {
      tone = 'on_leave';
      statusLabel = `🏖️ On leave until ${leaveEnd}`;
    } else if (activeJobs.length === 0) {
      tone = 'available';
      statusLabel = '🟢 Available now (0 cuts)';
    } else if (activeJobs.length === 1) {
      tone = 'light';
      statusLabel = `🟡 1 cut · Free ${nextAvailableDate}`;
    } else if (activeJobs.length === 2) {
      tone = 'busy';
      statusLabel = `🟠 2 cuts · Free ${nextAvailableDate}`;
    } else {
      tone = 'heavy';
      statusLabel = `🔴 High load (${activeJobs.length} cuts · Free ${nextAvailableDate})`;
    }

    workloads.push({
      memberId,
      name: member.name,
      role: member.role,
      phone: member.phone,
      activeJobsCount: activeJobs.length,
      activeJobs,
      totalAllocatedDays,
      onLeaveToday,
      leaveEnd,
      nextAvailableDate,
      statusLabel,
      tone
    });
  }

  // Sort by availability: available first, then light, then busy, then heavy, then on_leave
  const priorityOrder = { available: 0, light: 1, busy: 2, heavy: 3, on_leave: 4 };
  workloads.sort((a, b) => priorityOrder[a.tone] - priorityOrder[b.tone]);

  return workloads;
}
