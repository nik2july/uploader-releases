import { Client, ProjectEvent, SalesTask, TaskRule } from '../types';
import { FreelanceJob } from '../types/freelance';

/**
 * Turning standing rules into the tasks they call for.
 *
 * Each rule says what must be true — a client is Booked, a deliverable is with the
 * couple for review, an event is three days out with nobody rostered — and this
 * works out which tasks should therefore exist. Nothing watches for the instant a
 * change happens: reality is compared against the rules, so a rule written today
 * catches bookings made weeks ago, and no task goes missing because the app was
 * closed when the status changed.
 *
 * Every task carries an id derived from its rule and subject, which is what makes
 * running this repeatedly safe.
 */

export interface DesiredTask {
  id: string;
  text: string;
  description?: string;
  dueDate?: string;
  dueTime?: string;
  priority?: SalesTask['priority'];
  assigneeId?: string;
  category?: string;
  clientId?: number;
  eventId?: number;
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.UTC(...(fromIso.slice(0, 10).split('-').map(Number) as [number, number, number]));
  const b = Date.UTC(...(toIso.slice(0, 10).split('-').map(Number) as [number, number, number]));
  return Math.round((b - a) / 86400000);
}

/** Case-insensitive, because studio-defined statuses are typed by hand and
 * "Booked" and "booked" are plainly the same thing to the person who wrote them. */
function matches(actual: string | undefined, wanted: string | undefined): boolean {
  if (!wanted) return false;
  return String(actual || '').trim().toLowerCase() === wanted.trim().toLowerCase();
}

function fill(template: string, values: Record<string, string | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '').replace(/\s+/g, ' ').trim();
}

export function evaluateTaskRules(params: {
  rules: TaskRule[];
  clients: Client[];
  projects: ProjectEvent[];
  freelanceJobs: FreelanceJob[];
  today: string;
}): DesiredTask[] {
  const { rules, clients, projects, freelanceJobs, today } = params;
  const out: DesiredTask[] = [];

  const push = (rule: TaskRule, subjectId: string, extra: Partial<DesiredTask>, values: Record<string, string | undefined>) => {
    const text = fill(rule.task.text, values);
    if (!text) return;
    out.push({
      id: `auto:rule:${rule.id}:${subjectId}`,
      text,
      description: rule.task.description,
      dueDate: rule.task.dueInDays !== undefined ? addDays(today, rule.task.dueInDays) : undefined,
      dueTime: rule.task.dueTime,
      priority: rule.task.priority,
      assigneeId: rule.task.assigneeId,
      category: rule.task.category,
      ...extra,
    });
  };

  rules.filter(r => r.active !== false).forEach(rule => {
    switch (rule.trigger.kind) {
      case 'client_status':
        clients.forEach(client => {
          if (!matches(client.status, rule.trigger.value)) return;
          push(rule, `client:${client.id}`, { clientId: client.id }, { client: client.name });
        });
        break;

      case 'deliverable_status':
        clients.forEach(client => {
          (client.deliverables || []).forEach(d => {
            if (!matches(d.status, rule.trigger.value)) return;
            push(
              rule,
              `deliv:${client.id}:${d.id}`,
              { clientId: client.id },
              { client: client.name, deliverable: d.title }
            );
          });
        });
        break;

      case 'freelance_stage':
        freelanceJobs.forEach(job => {
          if (!matches(job.stage, rule.trigger.value)) return;
          push(rule, `fl:${job.id}`, {}, { job: job.title, client: job.clientName });
        });
        break;

      case 'event_days_before': {
        const window = rule.trigger.days ?? 3;
        projects.forEach(evt => {
          if (!evt.date) return;
          const away = daysBetween(today, evt.date);
          // Only while it is genuinely approaching. Raising it for an event that has
          // already happened would be noise nobody can act on.
          if (away < 0 || away > window) return;
          const client = clients.find(c => c.id === evt.clientId);
          push(
            rule,
            `evt:${evt.id}`,
            { clientId: evt.clientId, eventId: evt.id },
            { client: client?.name || evt.couple, event: evt.eventName }
          );
        });
        break;
      }

      case 'footage_missing': {
        const grace = rule.trigger.days ?? 2;
        projects.forEach(evt => {
          if (!evt.date) return;
          if (daysBetween(evt.date, today) < grace) return;
          const assigned = evt.assignments || [];
          if (assigned.length === 0) return;
          const logs = evt.dataLogs || [];
          const allIn = assigned.every(id => logs.some(l => l.teamMemberId === id && l.receivedAt));
          if (allIn) return;
          const client = clients.find(c => c.id === evt.clientId);
          push(
            rule,
            `footage:${evt.id}`,
            { clientId: evt.clientId, eventId: evt.id },
            { client: client?.name || evt.couple, event: evt.eventName }
          );
        });
        break;
      }
    }
  });

  return out;
}

/** Human wording for a rule, for the list in the rules screen. */
export function describeRule(rule: TaskRule): string {
  const t = rule.trigger;
  switch (t.kind) {
    case 'client_status':
      return `When a client becomes “${t.value || '…'}”`;
    case 'deliverable_status':
      return `When a deliverable becomes “${t.value || '…'}”`;
    case 'freelance_stage':
      return `When a freelance job reaches “${t.value || '…'}”`;
    case 'event_days_before':
      return `${t.days ?? 3} days before an event`;
    case 'footage_missing':
      return `${t.days ?? 2} days after an event with footage still not logged`;
    default:
      return 'Custom rule';
  }
}
