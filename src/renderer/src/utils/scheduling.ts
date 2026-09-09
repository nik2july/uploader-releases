import { Client, ClientDeliverable, CrewRoleConfig, TeamMember } from '../types';
import { FreelanceJob } from '../types/freelance';
import { freelanceDueDate } from './freelance';

/**
 * Forecasting when an editor will actually finish what they have been given.
 *
 * The studio takes two kinds of post-production work and they arrive on completely
 * different clocks. Wedding deliverables are known months ahead — the date is booked,
 * so the editing load is foreseeable long before it lands, but none of it can start
 * until the wedding has happened. Freelance jobs from other studios arrive with no
 * warning and are only real once the raw-data link shows up.
 *
 * Quoting a delivery date by eye therefore means holding both queues in your head at
 * once. This walks them instead: every unfinished item an editor holds, in the order
 * they will actually do it, consuming their working hours day by day, so each item
 * gets a predicted start and finish and the studio can promise a date it can keep.
 *
 * Effort that has never been estimated is reported, never guessed. An unestimated
 * item silently counted as zero would make the forecast confidently wrong, which is
 * worse than admitting the gap.
 */

export const DEFAULT_DAILY_CAPACITY_HOURS = 8;

export type WorkSource = 'studio' | 'freelance';

export interface ScheduleInput {
  id: string;
  source: WorkSource;
  title: string;
  /** Who it is for — the couple, or the partner studio. */
  forName: string;
  memberId: number;
  /** Hours of work, or undefined when nobody has estimated it yet. */
  effortHours?: number;
  /**
   * The earliest this work could possibly begin, because its input does not exist
   * before then: the wedding date for studio work, the day the raw data arrived for
   * freelance.
   */
  availableFrom: string; // YYYY-MM-DD
  /** Already underway, so it keeps its place instead of being pushed back. */
  inProgress: boolean;
  /**
   * Whether this still needs a block of the editor's time booked out.
   *
   * False once the main edit is done and only revisions remain. Those are small and
   * get absorbed between jobs or after hours, so reserving a second full slot for
   * them would book the same work twice and push everything behind it back for time
   * nobody is actually going to spend. The item is still listed, with its date, so
   * it is not forgotten -- it just does not consume the calendar.
   */
  reservesCapacity: boolean;
  /** What the studio has already promised, if anything. */
  promisedDate?: string;
}

export interface ScheduledItem extends ScheduleInput {
  startDate?: string;
  finishDate?: string;
  /** Set when the item cannot be scheduled because no one estimated the work. */
  unestimated: boolean;
  /** Finishing after a date already promised to someone. */
  late: boolean;
}

export interface MemberSchedule {
  memberId: number;
  memberName: string;
  items: ScheduledItem[];
  /** Total unfinished hours on this person's plate. */
  backlogHours: number;
  /** The first day they have nothing queued — when new work could start. */
  freeFrom?: string;
  unestimatedCount: number;
}

const DAY_MS = 86400000;

function toDate(iso: string): Date {
  // Parsed as UTC midnight deliberately: a local-time parse shifts the day backwards
  // for anyone east of UTC, so a deadline could render as the day before it is.
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return toIso(new Date(toDate(iso).getTime() + days * DAY_MS));
}

function maxIso(a: string, b: string): string {
  return a > b ? a : b;
}

/** Whether this person is working on a given date. */
export function isAvailableOn(member: TeamMember, iso: string): boolean {
  return !(member.unavailablePeriods || []).some(p => iso >= p.from && iso <= p.to);
}

export function dailyCapacityOf(member: TeamMember, studioDefault = DEFAULT_DAILY_CAPACITY_HOURS): number {
  const own = member.dailyCapacityHours;
  return typeof own === 'number' && own > 0 ? own : studioDefault;
}

/**
 * Lay one editor's queue onto the calendar.
 *
 * Order is decided before anything is placed: work already underway first, so a job
 * the editor has opened is never shuffled beneath something newer; then studio
 * deliverables, which are the promises with a client's wedding behind them; then
 * freelance, which is what fills the gaps between them. Within each band the earliest
 * available work goes first.
 */
export function scheduleMember(
  member: TeamMember,
  inputs: ScheduleInput[],
  today: string,
  studioDefaultCapacity = DEFAULT_DAILY_CAPACITY_HOURS
): MemberSchedule {
  const capacity = dailyCapacityOf(member, studioDefaultCapacity);

  const rank = (i: ScheduleInput) => (i.inProgress ? 0 : i.source === 'studio' ? 1 : 2);
  const ordered = [...inputs].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    const av = a.availableFrom.localeCompare(b.availableFrom);
    if (av !== 0) return av;
    return a.id.localeCompare(b.id);
  });

  const items: ScheduledItem[] = [];
  let cursor = today;
  let backlogHours = 0;

  for (const input of ordered) {
    if (!input.reservesCapacity) {
      // Listed but not laid on the calendar: the editor fits it around what is
      // already booked, so it neither delays the queue nor counts as backlog.
      items.push({ ...input, unestimated: false, late: false });
      continue;
    }
    if (typeof input.effortHours !== 'number' || input.effortHours <= 0) {
      // Placed nowhere on the calendar: pretending it takes no time would let
      // everything behind it inherit a start date that cannot be met.
      items.push({ ...input, unestimated: true, late: false });
      continue;
    }

    backlogHours += input.effortHours;

    let day = maxIso(cursor, input.availableFrom);
    let remaining = input.effortHours;
    let startDate: string | undefined;
    let guard = 0;

    while (remaining > 0) {
      // A queue longer than several years means bad data, not a real plan; stop
      // rather than spin.
      if (++guard > 3650) break;
      if (!isAvailableOn(member, day)) {
        day = addDays(day, 1);
        continue;
      }
      if (!startDate) startDate = day;
      remaining -= capacity;
      if (remaining > 0) day = addDays(day, 1);
    }

    const finishDate = day;
    // The next item starts the day after this one ends. Splitting a day between two
    // jobs would model an editor context-switching mid-task, which is not how the
    // work actually happens.
    cursor = addDays(finishDate, 1);

    items.push({
      ...input,
      startDate,
      finishDate,
      unestimated: false,
      late: Boolean(input.promisedDate && finishDate > input.promisedDate),
    });
  }

  const scheduled = items.filter(i => !i.unestimated && i.reservesCapacity);
  return {
    memberId: member.id,
    memberName: member.name,
    items,
    backlogHours,
    freeFrom: scheduled.length > 0 ? cursor : today,
    unestimatedCount: items.filter(i => i.unestimated && i.reservesCapacity).length,
  };
}

/** Whether this deliverable is clock-driven work owed after each event, rather than
 * editing that waits its turn in a queue. */
export function isFixedTurnaround(
  deliverable: ClientDeliverable,
  services: CrewRoleConfig[]
): boolean {
  const service = deliverable.linkedRoleId
    ? services.find(r => r.id === deliverable.linkedRoleId)
    : undefined;
  return typeof service?.fixedTurnaroundHours === 'number' && service.fixedTurnaroundHours > 0;
}

/** Effort for a deliverable: its own estimate, else the service it was sold as. */
export function effortForDeliverable(
  deliverable: ClientDeliverable,
  services: CrewRoleConfig[]
): number | undefined {
  if (typeof deliverable.estimatedEffortHours === 'number') return deliverable.estimatedEffortHours;
  const service = deliverable.linkedRoleId
    ? services.find(r => r.id === deliverable.linkedRoleId)
    : undefined;
  return service?.estimatedEffortHours;
}

/**
 * Everything currently on the studio's editors, forecast onto the calendar.
 *
 * Studio work is dated from the wedding rather than from today, because an editor
 * cannot start on footage that has not been shot; freelance work is dated from when
 * its raw data actually arrived, which is the only moment the job becomes real.
 */
export function buildStudioSchedule(params: {
  team: TeamMember[];
  clients: Client[];
  freelanceJobs: FreelanceJob[];
  services: CrewRoleConfig[];
  /**
   * When this client's footage is actually in an editor's hands — not the wedding
   * date. Nothing can be cut while the cards are still in the field, so the handover
   * is what releases the work.
   */
  workAvailableFromForClient: (clientId: number) => string | undefined;
  today?: string;
  defaultCapacityHours?: number;
}): MemberSchedule[] {
  const {
    team,
    clients,
    freelanceJobs,
    services,
    workAvailableFromForClient,
    today = new Date().toISOString().slice(0, 10),
    defaultCapacityHours = DEFAULT_DAILY_CAPACITY_HOURS,
  } = params;

  const byMember = new Map<number, ScheduleInput[]>();
  const add = (memberId: number, input: ScheduleInput) => {
    if (!byMember.has(memberId)) byMember.set(memberId, []);
    byMember.get(memberId)!.push(input);
  };

  clients.forEach(client => {
    (client.deliverables || []).forEach(d => {
      if (d.status === 'delivered') return;
      // Fixed-turnaround deliverables are dated obligations after each event, not
      // editing that queues behind other work — they become tasks instead and must
      // never consume an editor's hours. See CrewRoleConfig.fixedTurnaroundHours.
      if (isFixedTurnaround(d, services)) return;
      if (!d.assignedMemberId) return;
      add(d.assignedMemberId, {
        id: `deliv:${client.id}:${d.id}`,
        source: 'studio',
        title: d.title,
        forName: client.name,
        memberId: d.assignedMemberId,
        effortHours: effortForDeliverable(d, services),
        // Falling back to today for a deliverable with no traceable event keeps it in
        // the queue instead of dropping it silently.
        availableFrom: workAvailableFromForClient(client.id) || today,
        inProgress: d.status === 'in-progress',
        // Once a draft is out for review the cutting is done; what is left is
        // revisions, which the editor absorbs rather than blocking out days for.
        reservesCapacity: d.status === 'pending' || d.status === 'in-progress',
        promisedDate: d.dueDate,
      });
    });
  });

  freelanceJobs.forEach(job => {
    if (!job.editorMemberId || job.stage === 'completed') return;
    add(job.editorMemberId, {
      id: `fl:${job.id}`,
      source: 'freelance',
      title: job.title,
      forName: job.clientName,
      memberId: job.editorMemberId,
      effortHours: job.estimatedEffortHours,
      // The job is only real once the footage is in hand.
      availableFrom: job.dataReceivedDate || job.createdAt || today,
      inProgress: job.stage === 'sent_to_editor',
      // Only the stages before a draft exists hold editor time. Everything from
      // 'draft_received' onwards is either with the client or a round of changes,
      // and changes are minor by nature -- they carry their own two-day deadline and
      // get fitted around whatever else is booked.
      reservesCapacity: job.stage === 'data_received' || job.stage === 'sent_to_editor',
      promisedDate: freelanceDueDate(job),
    });
  });

  return team
    .filter(m => m.active !== false && byMember.has(m.id))
    .map(m => scheduleMember(m, byMember.get(m.id) || [], today, defaultCapacityHours))
    .sort((a, b) => b.backlogHours - a.backlogHours);
}
