import { SalesTask, TaskPriority, TaskRecurrence, TaskStatus } from '../types';

/**
 * Task vocabulary and derived state.
 *
 * Every reader goes through the normalisers here rather than touching
 * `task.status` / `task.priority` directly: records written by v1 of the tasks
 * panel carry only `text`/`done`/`assigneeId`, and Firestore turns any absent
 * field into `null` on the round trip. Both shapes have to read as a valid task.
 */

export interface StatusMeta {
  id: TaskStatus;
  label: string;
  /** Short form for narrow chips. */
  short: string;
  dot: string;
  chip: string;
  /** Column tint on the board. */
  columnAccent: string;
}

export const TASK_STATUSES: StatusMeta[] = [
  {
    id: 'todo',
    label: 'To Do',
    short: 'To Do',
    dot: 'bg-[#6b6660]',
    chip: 'bg-[#eee9e0] text-[#4a4640] border-[#d4c1a3]',
    columnAccent: 'bg-[#6b6660]',
  },
  {
    id: 'in_progress',
    label: 'In Progress',
    short: 'Doing',
    dot: 'bg-sky-500',
    chip: 'bg-sky-50 text-sky-800 border-sky-200',
    columnAccent: 'bg-sky-500',
  },
  {
    id: 'blocked',
    label: 'Blocked',
    short: 'Blocked',
    dot: 'bg-rose-500',
    chip: 'bg-rose-50 text-rose-800 border-rose-200',
    columnAccent: 'bg-rose-500',
  },
  {
    id: 'done',
    label: 'Done',
    short: 'Done',
    dot: 'bg-emerald-500',
    chip: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    columnAccent: 'bg-emerald-500',
  },
];

export function statusMeta(status: TaskStatus): StatusMeta {
  return TASK_STATUSES.find(s => s.id === status) || TASK_STATUSES[0];
}

export interface PriorityMeta {
  id: TaskPriority;
  label: string;
  /** Higher sorts first. */
  weight: number;
  dot: string;
  chip: string;
  bar: string;
}

export const TASK_PRIORITIES: PriorityMeta[] = [
  {
    id: 'urgent',
    label: 'Urgent',
    weight: 3,
    dot: 'bg-rose-600',
    chip: 'bg-rose-50 text-rose-800 border-rose-200',
    bar: 'bg-rose-500',
  },
  {
    id: 'high',
    label: 'High',
    weight: 2,
    dot: 'bg-amber-500',
    chip: 'bg-amber-50 text-amber-900 border-amber-200',
    bar: 'bg-amber-500',
  },
  {
    id: 'normal',
    label: 'Normal',
    weight: 1,
    dot: 'bg-[#7a2e33]',
    chip: 'bg-[#7a2e33]/10 text-[#7a2e33] border-[#7a2e33]/20',
    bar: 'bg-[#d4c1a3]',
  },
  {
    id: 'low',
    label: 'Low',
    weight: 0,
    dot: 'bg-[#b8b2a8]',
    chip: 'bg-[#f2efe9] text-[#6b6660] border-[#e2dbd0]',
    bar: 'bg-[#e6e0d6]',
  },
];

export function priorityMeta(priority: TaskPriority): PriorityMeta {
  return TASK_PRIORITIES.find(p => p.id === priority) || TASK_PRIORITIES[2];
}

export interface CategoryMeta {
  id: string;
  label: string;
  chip: string;
}

/** The departments the studio actually splits work across. */
export const TASK_CATEGORIES: CategoryMeta[] = [
  { id: 'sales', label: 'Sales & Inquiries', chip: 'bg-amber-50 text-amber-900 border-amber-200' },
  { id: 'client', label: 'Client Care', chip: 'bg-purple-50 text-purple-900 border-purple-200' },
  { id: 'shoot', label: 'Shoot / Production', chip: 'bg-emerald-50 text-emerald-900 border-emerald-200' },
  { id: 'post', label: 'Post-Production', chip: 'bg-sky-50 text-sky-900 border-sky-200' },
  { id: 'album', label: 'Albums & Prints', chip: 'bg-rose-50 text-rose-900 border-rose-200' },
  { id: 'payment', label: 'Payments', chip: 'bg-teal-50 text-teal-900 border-teal-200' },
  { id: 'admin', label: 'Studio Admin', chip: 'bg-stone-100 text-stone-800 border-stone-300' },
  { id: 'marketing', label: 'Marketing', chip: 'bg-indigo-50 text-indigo-900 border-indigo-200' },
];

export function categoryMeta(id?: string | null): CategoryMeta | null {
  if (!id) return null;
  return (
    TASK_CATEGORIES.find(c => c.id === id) || {
      id,
      label: id.charAt(0).toUpperCase() + id.slice(1),
      chip: 'bg-stone-100 text-stone-800 border-stone-300',
    }
  );
}

export const TASK_RECURRENCES: { id: TaskRecurrence; label: string }[] = [
  { id: 'none', label: 'Does not repeat' },
  { id: 'daily', label: 'Every day' },
  { id: 'weekly', label: 'Every week' },
  { id: 'monthly', label: 'Every month' },
];

/* ── Derived state ───────────────────────────────────────────────────────── */

export function taskStatus(task: SalesTask): TaskStatus {
  if (task.done || task.status === 'done') return 'done';
  if (task.status === 'in_progress' || task.status === 'blocked') return task.status;
  return 'todo';
}

export function isTaskDone(task: SalesTask): boolean {
  return taskStatus(task) === 'done';
}

export function taskPriority(task: SalesTask): TaskPriority {
  const p = task.priority;
  if (p === 'urgent' || p === 'high' || p === 'low' || p === 'normal') return p;
  return 'normal';
}

/** Today as YYYY-MM-DD in the studio's own timezone, not UTC. */
export function todayKey(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export type DueTone = 'overdue' | 'today' | 'tomorrow' | 'soon' | 'later' | 'none';

export interface DueMeta {
  tone: DueTone;
  label: string;
  /** Negative when the date has passed. Null when there is no due date. */
  days: number | null;
  chip: string;
  text: string;
}

const DUE_CHIPS: Record<DueTone, { chip: string; text: string }> = {
  overdue: { chip: 'bg-rose-50 text-rose-800 border-rose-200', text: 'text-rose-700' },
  today: { chip: 'bg-amber-100 text-amber-900 border-amber-300', text: 'text-amber-800' },
  tomorrow: { chip: 'bg-amber-50 text-amber-900 border-amber-200', text: 'text-amber-800' },
  soon: { chip: 'bg-[#f2efe9] text-[#4a4640] border-[#e2dbd0]', text: 'text-[#4a4640]' },
  later: { chip: 'bg-[#f9f8f6] text-[#6b6660] border-[#e2dbd0]', text: 'text-[#6b6660]' },
  none: { chip: 'bg-[#f9f8f6] text-[#6b6660] border-[#e2dbd0]', text: 'text-[#6b6660]' },
};

/** Whole days between two YYYY-MM-DD keys, calendar days rather than 24h blocks. */
export function daysBetween(fromKey: string, toKey: string): number {
  const a = new Date(`${fromKey}T00:00:00`).getTime();
  const b = new Date(`${toKey}T00:00:00`).getTime();
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

export function dueMeta(
  dueDate?: string | null,
  today: string = todayKey(),
  dueTime?: string
): DueMeta {
  if (!dueDate) {
    return { tone: 'none', label: 'No due date', days: null, ...DUE_CHIPS.none };
  }
  const key = dueDate.slice(0, 10);
  const days = daysBetween(today, key);
  let tone: DueTone;
  let label: string;

  if (days < 0) {
    tone = 'overdue';
    const n = Math.abs(days);
    label = n === 1 ? '1 day overdue' : `${n} days overdue`;
  } else if (days === 0) {
    tone = 'today';
    label = 'Due today';
  } else if (days === 1) {
    tone = 'tomorrow';
    label = 'Due tomorrow';
  } else if (days <= 7) {
    tone = 'soon';
    label = `In ${days} days`;
  } else {
    tone = 'later';
    label = new Date(`${key}T00:00:00`).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    });
  }
  // An hour is only worth showing while it can still be acted on; on something weeks
  // out it is noise.
  if (dueTime && (tone === 'today' || tone === 'tomorrow' || tone === 'overdue')) {
    label = `${label} · ${formatDueTime(dueTime)}`;
  }
  return { tone, label, days, ...DUE_CHIPS[tone] };
}

/** Current local time as HH:MM, for comparing against a task's due time. */
function nowHhMm(): string {
  const d = new Date();
  return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`;
}

/** Open and past its due date — the only thing that should ever shout in red. */
export function isOverdue(task: SalesTask, today: string = todayKey()): boolean {
  if (isTaskDone(task) || !task.dueDate) return false;
  const key = task.dueDate.slice(0, 10);
  if (key < today) return true;
  // A deadline with an hour on it passes at that hour, not at midnight — a gallery
  // owed by 4 PM is late at 4:01, and saying otherwise would hide the miss for the
  // rest of the day, which is exactly when it still might be recoverable.
  if (key === today && task.dueTime) return nowHhMm() > task.dueTime;
  return false;
}

/** A deadline as text: the date's own wording, with the hour when one is set. */
export function formatDueTime(dueTime?: string): string {
  if (!dueTime) return '';
  const [h, m] = dueTime.split(':').map(Number);
  if (Number.isNaN(h)) return '';
  const suffix = h < 12 ? 'AM' : 'PM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${`${m || 0}`.padStart(2, '0')} ${suffix}`;
}

export function isDueToday(task: SalesTask, today: string = todayKey()): boolean {
  if (isTaskDone(task) || !task.dueDate) return false;
  return task.dueDate.slice(0, 10) === today;
}

export function checklistProgress(task: SalesTask): { done: number; total: number } {
  const items = Array.isArray(task.checklist) ? task.checklist : [];
  return { done: items.filter(i => i.done).length, total: items.length };
}

/* ── Sorting ─────────────────────────────────────────────────────────────── */

export type TaskSort = 'smart' | 'due' | 'priority' | 'created' | 'title';

export const TASK_SORTS: { id: TaskSort; label: string }[] = [
  { id: 'smart', label: 'Smart order' },
  { id: 'due', label: 'Due date' },
  { id: 'priority', label: 'Priority' },
  { id: 'created', label: 'Newest first' },
  { id: 'title', label: 'A → Z' },
];

const FAR_FUTURE = '9999-12-31';

export function sortTasks(tasks: SalesTask[], sort: TaskSort): SalesTask[] {
  const list = [...tasks];
  switch (sort) {
    case 'due':
      return list.sort(
        (a, b) =>
          (a.dueDate || FAR_FUTURE).localeCompare(b.dueDate || FAR_FUTURE) ||
          priorityMeta(taskPriority(b)).weight - priorityMeta(taskPriority(a)).weight
      );
    case 'priority':
      return list.sort(
        (a, b) =>
          priorityMeta(taskPriority(b)).weight - priorityMeta(taskPriority(a)).weight ||
          (a.dueDate || FAR_FUTURE).localeCompare(b.dueDate || FAR_FUTURE)
      );
    case 'created':
      return list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    case 'title':
      return list.sort((a, b) => (a.text || '').localeCompare(b.text || ''));
    case 'smart':
    default:
      // What a person would work down: anything still open before anything closed,
      // then by deadline, and priority only breaks ties. Priority-first ordering
      // buries an overdue "normal" under a "high" that isn't due for three weeks.
      return list.sort((a, b) => {
        const doneA = isTaskDone(a) ? 1 : 0;
        const doneB = isTaskDone(b) ? 1 : 0;
        if (doneA !== doneB) return doneA - doneB;
        const dueDiff = (a.dueDate || FAR_FUTURE).localeCompare(b.dueDate || FAR_FUTURE);
        if (dueDiff !== 0) return dueDiff;
        const prioDiff =
          priorityMeta(taskPriority(b)).weight - priorityMeta(taskPriority(a)).weight;
        if (prioDiff !== 0) return prioDiff;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
  }
}

/** The next occurrence's due date after completing a repeating task. */
export function nextRecurrenceDate(
  dueDate: string | undefined,
  recurrence: TaskRecurrence,
  today: string = todayKey()
): string | undefined {
  if (!recurrence || recurrence === 'none') return undefined;
  // Anchor on the due date when there is one so a weekly task keeps its weekday
  // even if it was ticked off late; otherwise count from today.
  const base = new Date(`${(dueDate || today).slice(0, 10)}T00:00:00`);
  if (isNaN(base.getTime())) return undefined;

  const step = () => {
    if (recurrence === 'daily') base.setDate(base.getDate() + 1);
    else if (recurrence === 'weekly') base.setDate(base.getDate() + 7);
    else base.setMonth(base.getMonth() + 1);
  };

  step();
  // A task completed weeks late shouldn't respawn already overdue.
  let guard = 0;
  while (base.toISOString().slice(0, 10) < today && guard < 400) {
    step();
    guard += 1;
  }

  const m = `${base.getMonth() + 1}`.padStart(2, '0');
  const d = `${base.getDate()}`.padStart(2, '0');
  return `${base.getFullYear()}-${m}-${d}`;
}

/**
 * A deadline expressed as so many hours after an event begins.
 *
 * Events store their start as display text ("4:00 PM"), which is fine to read and
 * useless to compute with, so it is parsed here. An unparseable or missing time
 * falls back to midday rather than midnight: guessing early would quietly make a
 * deadline stricter than the studio agreed, and a wedding has never started at
 * 00:00 anyway.
 */
export function addHoursToEvent(
  eventDate: string,
  eventTime: string | undefined,
  hours: number
): { date: string; time: string } {
  const parsed = parseDisplayTime(eventTime);
  const base = new Date(`${eventDate.slice(0, 10)}T00:00:00`);
  base.setHours(parsed.hour, parsed.minute, 0, 0);
  base.setTime(base.getTime() + hours * 3600000);

  const m = `${base.getMonth() + 1}`.padStart(2, '0');
  const d = `${base.getDate()}`.padStart(2, '0');
  const hh = `${base.getHours()}`.padStart(2, '0');
  const mm = `${base.getMinutes()}`.padStart(2, '0');
  return { date: `${base.getFullYear()}-${m}-${d}`, time: `${hh}:${mm}` };
}

/** "4:00 PM" / "16:00" / "4 PM" into 24-hour parts. */
function parseDisplayTime(value: string | undefined): { hour: number; minute: number } {
  const fallback = { hour: 12, minute: 0 };
  if (!value) return fallback;
  const m = String(value).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!m) return fallback;
  let hour = Number(m[1]);
  const minute = Number(m[2] || 0);
  const meridiem = m[3]?.toUpperCase();
  if (Number.isNaN(hour) || hour > 23 || minute > 59) return fallback;
  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  return { hour, minute };
}
