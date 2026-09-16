import {
  findPostProductionService,
  resolvePostProductionServices,
  type PostProductionService,
} from './postProductionServices';

/**
 * The built-in services, for callers with no studio settings to hand.
 *
 * A deliverable filed under anything that is not a Post Production service —
 * storage, a raw handover, a category from before these existed — is not its
 * work. Nothing is created for those, and Send to Post Production stays the way
 * to file one by hand: guessing which service an old "Video" deliverable meant
 * would be worse than asking.
 */
export const POST_PRODUCTION_SERVICES = resolvePostProductionServices(undefined).map(s => s.name);

/**
 * Whether raw data arriving on a deliverable should open a Post Production job.
 *
 * BAAWARAY FILMS is a partner studio like any other now, so its deliverables
 * become jobs on the freelance board rather than being re-entered by hand. This
 * is the whole rule for that, kept in one place because it decides whether a job
 * appears in a live studio's board: the work has to be Post Production's, it has
 * to be the raw footage rather than a final delivery going back out, and it must
 * not already have a job — filing the same deliverable twice would have two
 * editors quietly working the same footage.
 */
export function shouldFileIntoPostProduction(
  target: { kind?: string; purpose?: string; serviceType?: string } | undefined,
  deliverable: { postProductionJobIds?: string[] } | undefined,
  services?: PostProductionService[]
): boolean {
  if (!target || !deliverable) return false;
  return target.kind === 'deliverable'
    && target.purpose === 'raw'
    && isPostProductionService(target.serviceType, services)
    && !(deliverable.postProductionJobIds || []).length;
}

/**
 * Whether a service name is one of Post Production's, however it was typed.
 *
 * The name comes from a category someone typed into studio settings, and an
 * exact comparison would have "Short form" or a trailing space quietly stop
 * every deliverable filing itself — a failure that looks like the feature was
 * never built rather than like a typo. Case and surrounding space are ignored;
 * nothing else is, so an unrelated service still files nothing.
 */
export function isPostProductionService(
  name: string | undefined,
  services: PostProductionService[] = resolvePostProductionServices(undefined)
): boolean {
  return Boolean(findPostProductionService(name, services));
}

