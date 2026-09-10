import { FreelanceJob } from '../types/freelance';
import { TeamMember } from '../types';

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

const DAY_MS = 86400000;

export function parseDate(iso: string): Date {
  const clean = iso.slice(0, 10);
  const [y, m, d] = clean.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addCalendarDays(iso: string, days: number): string {
  return formatIsoDate(new Date(parseDate(iso).getTime() + days * DAY_MS));
}

export function isDayUnavailable(iso: string, leaves?: { from: string; to: string }[]): boolean {
  if (!leaves || leaves.length === 0) return false;
  const dateOnly = iso.slice(0, 10);
  return leaves.some(p => dateOnly >= p.from && dateOnly <= p.to);
}

export function addWorkingDays(
  startDateIso: string,
  workingDays: number,
  leaves?: { from: string; to: string }[]
): string {
  let currentDate = startDateIso.slice(0, 10);
  let daysAllocated = 0;
  let safetyLoop = 0;

  while (daysAllocated < workingDays && safetyLoop < 365) {
    safetyLoop++;
    currentDate = addCalendarDays(currentDate, 1);
    if (!isDayUnavailable(currentDate, leaves)) {
      daysAllocated++;
    }
  }

  return currentDate;
}

/**
 * Calculate real-time workload, active queues and capacity radar for studio editors.
 */
export function calculateEditorWorkloads(
  jobs: FreelanceJob[],
  team: TeamMember[],
  referenceDate?: string
): EditorWorkload[] {
  const today = (referenceDate || new Date().toISOString()).slice(0, 10);
  const workloads: EditorWorkload[] = [];

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

    let onLeaveToday = false;
    let leaveEnd: string | undefined;

    for (const p of periods) {
      if (p.from && p.to && today >= p.from && today <= p.to) {
        onLeaveToday = true;
        leaveEnd = p.to;
        break;
      }
    }

    // Active cuts (excluding completed and final delivered)
    const active = jobs.filter(
      j =>
        (j.editorMemberId === memberId || (j as any).editor?.id === memberId) &&
        j.stage !== 'completed' &&
        j.stage !== 'final_delivered'
    );

    const activeJobs = active.map(j => ({
      id: j.id,
      title: j.title,
      requiredDays: Number((j as any).requiredDays) || 2,
      dueDate: j.dueDate,
      stage: j.stage || 'in_process'
    }));

    const totalAllocatedDays = activeJobs.reduce((sum, j) => sum + j.requiredDays, 0);

    let nextAvailableDate = today;
    if (onLeaveToday && leaveEnd) {
      nextAvailableDate = addCalendarDays(leaveEnd, 1);
    }

    if (totalAllocatedDays > 0) {
      nextAvailableDate = addWorkingDays(nextAvailableDate, totalAllocatedDays, periods);
    }

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

  const priorityOrder = { available: 0, light: 1, busy: 2, heavy: 3, on_leave: 4 };
  workloads.sort((a, b) => priorityOrder[a.tone] - priorityOrder[b.tone]);

  return workloads;
}
