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

/**
 * Filters and deduplicates reusable client raw data packages so that only
 * ONE option is presented per unique raw footage package, prioritizing the
 * original root source deliverable over derivative edits (reels, teasers, etc.).
 */
export function getUniqueReusableDeliverables(
  deliverables: any[],
  currentDeliverableId: string
): any[] {
  const candidates = (deliverables || []).filter(
    d =>
      d &&
      d.id !== currentDeliverableId &&
      (Boolean(d.rawDataLink) ||
        d.rawDataSource === 'hard_drive' ||
        Object.keys(d.desktopTransfers || {}).length > 0)
  );

  if (candidates.length <= 1) return candidates;

  const isDerivative = (title: string = '') => {
    const t = title.toLowerCase();
    return (
      t.includes('reel') ||
      t.includes('teaser') ||
      t.includes('story') ||
      t.includes('stories') ||
      t.includes('post') ||
      t.includes('short') ||
      t.includes('promo')
    );
  };

  // Sort candidates so the root original source is evaluated before derivative edits:
  candidates.sort((a, b) => {
    // 1. Deliverables that were NOT reused from another deliverable come first
    const aReused = Boolean(a.reusedFromDeliverableId);
    const bReused = Boolean(b.reusedFromDeliverableId);
    if (aReused !== bReused) return aReused ? 1 : -1;

    // 2. Deliverables with actual physical desktop uploads come first
    const aTransfers = Object.keys(a.desktopTransfers || {}).length;
    const bTransfers = Object.keys(b.desktopTransfers || {}).length;
    if (aTransfers !== bTransfers) return bTransfers - aTransfers;

    // 3. Primary formats (Edited Film, Full Coverage, Photos) come before derivatives
    const aDeriv = isDerivative(a.title);
    const bDeriv = isDerivative(b.title);
    if (aDeriv !== bDeriv) return aDeriv ? 1 : -1;

    return 0;
  });

  const seenKeys = new Set<string>();
  const seenIds = new Set<string>();
  const unique: any[] = [];

  for (const d of candidates) {
    const rawLink = (d.rawDataLink || '').trim().toLowerCase();
    const hardDriveNotes = (d.hardDriveNotes || '').trim().toLowerCase();
    const transferKeys = Object.keys(d.desktopTransfers || {}).sort().join(',');
    const rootId = d.reusedFromDeliverableId;

    // Check if this deliverable references a root deliverable we already accepted
    if (rootId && (seenIds.has(rootId) || seenKeys.has(`root:${rootId}`))) {
      continue;
    }

    let key = '';
    if (rawLink) {
      key = `link:${rawLink}`;
    } else if (transferKeys) {
      key = `tx:${transferKeys}`;
    } else if (rootId) {
      key = `root:${rootId}`;
    } else if (d.rawDataSource === 'hard_drive' && hardDriveNotes) {
      key = `hd:${hardDriveNotes}`;
    } else {
      key = `id:${d.id}`;
    }

    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      seenIds.add(d.id);
      if (rootId) seenKeys.add(`root:${rootId}`);
      unique.push(d);
    }
  }

  return unique;
}


