import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { FreelanceJob } from '../types';
import { addDays, buildStudioSchedule, MemberSchedule } from '../utils/scheduling';
import { normaliseServices, resolveRoleGroups } from '../utils/studioRoles';
import { DEFAULT_CREW_ROLES } from '../data/seedData';

/**
 * How long footage takes to reach an editor after the last event, when the crew have
 * not logged the handover themselves. A day, in practice.
 */
const DATA_HANDOVER_DAYS = 1;

/**
 * Every editor's queue laid on the calendar.
 *
 * Lives in a hook rather than in the panel that first drew it because the forecast is
 * needed wherever a date gets promised — the schedule panel reports it, and the
 * freelance job form quotes from it. Two copies of this wiring would eventually
 * disagree about when someone is free, and the studio would have no way to tell which
 * screen was lying.
 *
 * Pass `freelanceJobs` to forecast against a queue that is not the saved one — a job
 * being drafted, say, laid on top of the work its editor already holds.
 */
export function useStudioSchedules(options?: { freelanceJobs?: FreelanceJob[] }): MemberSchedule[] {
  const { team, clients, projects, freelanceJobs, studioSettings, studioPriceList } = useApp();
  const jobs = options?.freelanceJobs ?? freelanceJobs;

  const services = useMemo(() => {
    const groups = resolveRoleGroups(studioSettings?.roleGroups);
    const raw =
      studioSettings?.crewRoles?.length
        ? studioSettings.crewRoles
        : studioPriceList?.crewRoles?.length
        ? studioPriceList.crewRoles
        : DEFAULT_CREW_ROLES;
    return normaliseServices(raw, groups);
  }, [studioSettings?.crewRoles, studioSettings?.roleGroups, studioPriceList?.crewRoles]);

  return useMemo(() => {
    /**
     * When this client's footage is actually editable.
     *
     * Not the wedding date: the cards are still in the field then. The edit covers
     * the whole wedding, so the LAST event governs, and the work opens up once that
     * event's footage has been handed in — the real handover date when the crew have
     * logged it, otherwise a day later, which is how long the transfer takes in
     * practice. Booking a slot from the event date itself would promise the client a
     * date built on a day nobody could have worked.
     */
    const workAvailableFrom = (clientId: number): string | undefined => {
      const clientEvents = projects.filter(p => p.clientId === clientId && p.date);
      if (clientEvents.length === 0) return undefined;
      const lastEvent = clientEvents.reduce((a, b) => (a.date > b.date ? a : b));

      const logs = lastEvent.dataLogs || [];
      const handedIn = logs.filter(l => l.receivedAt).map(l => String(l.receivedAt).slice(0, 10));
      const everyoneHandedIn =
        (lastEvent.assignments || []).length > 0 && handedIn.length >= (lastEvent.assignments || []).length;

      if (everyoneHandedIn) return handedIn.sort()[handedIn.length - 1];
      return addDays(lastEvent.date, DATA_HANDOVER_DAYS);
    };

    return buildStudioSchedule({
      team,
      clients,
      freelanceJobs: jobs || [],
      services,
      workAvailableFromForClient: workAvailableFrom,
    });
  }, [team, clients, projects, jobs, services]);
}
