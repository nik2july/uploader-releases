import { CrewRoleConfig, RoleGroupKind, StudioRoleGroup } from '../types';
import { DEFAULT_ROLE_GROUPS } from '../data/seedData';

/**
 * Roles, services, and the migration from the old tier-category model.
 *
 * The quotation builder used to file every role under a Pre/Production/Post
 * "tier category", and made the studio tick a checkbox to decide which tiers
 * showed up in Events and again in Deliverables. That coupled two lists that
 * have nothing to do with each other.
 *
 * Now a role group ("Photographer", "Video Editor") is either an `event` group
 * or a `deliverable` group, and the priced services live beneath it. The two
 * sides never see each other's groups.
 *
 * Studios that saved settings under the old model still have roles with only a
 * `category`, plus two Pre-Production roles that are no longer offered. The
 * helpers below repair those records on read, so nothing has to be re-entered.
 */

/** Role ids that were Pre-Production only — dropped when that tier was retired. */
const RETIRED_ROLE_IDS = new Set(['role-preprod-producer', 'role-preprod-intake']);

/** Where each seeded role landed, so pre-group saves migrate to the same place. */
const LEGACY_ROLE_TO_GROUP: Record<string, string> = {
  'role-candid-photographer': 'grp-photographer',
  'role-traditional-photographer': 'grp-photographer',
  'role-cinematographer': 'grp-cinematographer',
  'role-drone-pilot': 'grp-drone',
  'role-assistant': 'grp-support',
  'role-full-coverage': 'grp-video-editor',
  'role-album': 'grp-album',
  'role-video-editor': 'grp-video-editor',
  'role-photo-editor': 'grp-photo-editor',
  'role-album-designer': 'grp-album',
};

/** Catch-all groups for custom roles the studio added under the old model. */
const FALLBACK_GROUP: Record<RoleGroupKind, string> = {
  event: 'grp-support',
  deliverable: 'grp-video-editor',
};

/** A saved role's tier decides which side of the builder it belongs to. */
export function kindFromCategory(category?: string): RoleGroupKind {
  return (category || '').toLowerCase().includes('post') ? 'deliverable' : 'event';
}

/** Tier written back onto a service, so Team and Post-Production keep working. */
export function categoryForKind(kind: RoleGroupKind): string {
  return kind === 'deliverable' ? 'post-production' : 'production';
}

/** Role groups from settings, falling back to the seeded set. */
export function resolveRoleGroups(saved?: StudioRoleGroup[]): StudioRoleGroup[] {
  if (!saved || saved.length === 0) return DEFAULT_ROLE_GROUPS;

  // A save from before either side existed would strand that whole tab, so
  // top up any missing seeded group rather than showing an empty list.
  const byId = new Map(saved.map(g => [g.id, g]));
  const merged = [...saved];
  (['event', 'deliverable'] as RoleGroupKind[]).forEach(kind => {
    if (saved.some(g => g.kind === kind && g.active !== false)) return;
    DEFAULT_ROLE_GROUPS.filter(g => g.kind === kind).forEach(g => {
      if (!byId.has(g.id)) merged.push(g);
    });
  });
  return merged;
}

/**
 * Services with a parent group guaranteed, and retired roles removed.
 *
 * Anything saved before groups existed is placed by its old role id when that is
 * known, otherwise by its tier category.
 */
export function normaliseServices(
  roles: CrewRoleConfig[],
  groups: StudioRoleGroup[]
): CrewRoleConfig[] {
  const groupIds = new Set(groups.map(g => g.id));

  return roles
    .filter(r => !RETIRED_ROLE_IDS.has(r.id))
    .map(role => {
      if (role.groupId && groupIds.has(role.groupId)) return role;

      const mapped = LEGACY_ROLE_TO_GROUP[role.id];
      if (mapped && groupIds.has(mapped)) return { ...role, groupId: mapped };

      const kind = kindFromCategory(role.category);
      const fallback = groups.find(g => g.id === FALLBACK_GROUP[kind] && g.kind === kind)
        || groups.find(g => g.kind === kind);
      return fallback ? { ...role, groupId: fallback.id } : role;
    });
}

/** Services belonging to one group, alphabetical. */
export function servicesInGroup(
  services: CrewRoleConfig[],
  groupId: string
): CrewRoleConfig[] {
  return services
    .filter(s => s.groupId === groupId && s.active !== false)
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
}

/** What a service bills the client. */
export function servicePrice(service: CrewRoleConfig): number {
  return service.clientBillingRate ?? service.defaultRate ?? 0;
}

/**
 * What the service costs the studio in crew payout.
 *
 * Vestigial, and kept only for the callers that still read it. Crew cost is not a
 * property of a service on this roster: it is a property of the person allotted to
 * it — `rolePayoutRates` on the member, keyed by service id — and the same Wedding
 * Photographer code costs ₹3,000 with one crew member and ₹9,600 with another.
 * `calculateMemberEventFee` never consults this field, so a figure derived from it
 * is not what anybody is paid.
 */
export function serviceCost(service: CrewRoleConfig): number {
  return service.defaultRate ?? 0;
}

/**
 * The role groups that can be staffed on an event, dropping any with no service.
 *
 * The event form grouped services by tier category instead, which put all thirty
 * of them under "Production" — every album, trailer and edited-photo tier
 * alongside the actual crew — and listed each priced variant as its own top-level
 * entry, so four services all named "Photographer" appeared side by side, told
 * apart only by a small code chip.
 */
export function staffableGroups(
  groups: StudioRoleGroup[],
  services: CrewRoleConfig[]
): StudioRoleGroup[] {
  return groups.filter(
    g => g.kind === 'event' && g.active !== false && servicesInGroup(services, g.id).length > 0
  );
}

/**
 * The service a freshly-added role group should start on.
 *
 * The first one listed, deliberately, and not the cheapest that could price the
 * event — which is what this did first, until a test pointed out that the cheapest
 * Photographer on this roster is the `complimentary` one at zero. A picker that
 * quietly opens every photographer at "free" is a worse failure than one that
 * opens on the wrong tier: the wrong tier is visible in the total, and free is
 * easy to send. The operator picks the code either way; the default only has to be
 * predictable.
 */
export function defaultServiceForGroup(
  services: CrewRoleConfig[],
  groupId: string
): CrewRoleConfig | undefined {
  return servicesInGroup(services, groupId)[0];
}

/** True for the fixed team-requirement keys that predate per-service role ids. */
function isLegacyTeamKey(key: string): boolean {
  return key in LEGACY_TEAM_KEYS || key === 'assistant';
}

export interface SelectedService {
  /** The group this entry belongs to, or null when the service is no longer on the roster. */
  groupId: string | null;
  roleId: string;
  count: number;
  /** The roster entry, absent when the saved event refers to a service since deleted. */
  service?: CrewRoleConfig;
}

/**
 * The services allocated on an event, one entry per stored role id.
 *
 * A role id with no roster entry is returned rather than dropped. The previous
 * rendering filtered the roster by what the event asked for, so a service the
 * studio had since deleted or renamed vanished from the event completely — not
 * displayed, not priced, not flagged. Three saved quotations here are in that
 * state, referring to ids like `photographer (de)` that no longer exist. Whether
 * such a row can still be priced is a different question from whether the studio
 * is allowed to see that it is there.
 */
export function selectedServices(
  teamRequired: Record<string, number | undefined>,
  services: CrewRoleConfig[]
): SelectedService[] {
  const byId = new Map(services.map(s => [s.id, s]));
  return Object.entries(teamRequired || {})
    // The generic keys below are written on every event whether or not anything is
    // allocated to them, so they are not evidence that a service was chosen and
    // must not become entries of their own. `normaliseTeamRequired` folds any real
    // counts they carry onto proper role ids before this runs.
    .filter(([key, count]) => Number(count) > 0 && !isLegacyTeamKey(key))
    .map(([roleId, count]) => {
      const service = byId.get(roleId);
      return { roleId, count: Number(count), service, groupId: service?.groupId ?? null };
    });
}

/**
 * Swap one service for another within `teamRequired`, keeping the headcount.
 *
 * Changing the code on a card is this operation: the count belongs to the role,
 * not to the variant currently priced, so moving from "Single Event" to "Wedding"
 * must not reset a crew of three back to one. The outgoing key is deleted rather
 * than zeroed so no code reading a stale non-zero value can resurrect it.
 */
export function swapService(
  teamRequired: Record<string, number | undefined>,
  fromRoleId: string,
  toRoleId: string
): Record<string, number | undefined> {
  if (fromRoleId === toRoleId) return teamRequired;
  const next = { ...teamRequired };
  const count = Number(next[fromRoleId]) || 0;
  delete next[fromRoleId];
  next[toRoleId] = (Number(next[toRoleId]) || 0) + count;
  return next;
}

/** Whether this group already has a service on the event — one code per role, per event. */
export function groupIsStaffed(
  teamRequired: Record<string, number | undefined>,
  services: CrewRoleConfig[],
  groupId: string
): boolean {
  return selectedServices(teamRequired, services).some(s => s.groupId === groupId);
}

/**
 * Which tier a team member belongs to, worked out from the services they perform.
 *
 * Members used to pick a Pre/Production/Post tier by hand, then only saw roles
 * inside it. Roles are the model now, so the tier is derived instead: someone
 * ticked for an event service is production crew, someone ticked for a
 * deliverable service is post-production, and doing both means both. The Team and
 * Post-Production screens still read these values, so they keep working untouched.
 */
export function categoriesFromAssignments(
  assignedRoleIds: string[],
  services: CrewRoleConfig[],
  groups: StudioRoleGroup[]
): string[] {
  const groupKindById = new Map(groups.map(g => [g.id, g.kind]));
  const kinds = new Set<RoleGroupKind>();

  assignedRoleIds.forEach(id => {
    const svc = services.find(s => s.id === id);
    if (!svc) return;
    const kind = (svc.groupId && groupKindById.get(svc.groupId)) || kindFromCategory(svc.category);
    kinds.add(kind);
  });

  const out = Array.from(kinds).map(categoryForKind);
  // Never leave a member with no tier — the roster filters would hide them.
  return out.length > 0 ? out : ['production'];
}

/**
 * Which side of the studio a member works: events, deliverables, or both.
 *
 * The quotation builder already splits every role group into `event` (crew staffed
 * on the day) and `deliverable` (work produced after). A member's side is simply
 * the kinds of services they are ticked for, so the two lists can never drift out
 * of step with what the builder offers.
 *
 * Returns an EMPTY array for a member with nothing ticked. That is deliberate:
 * guessing a side from a free-text role name is what let a post-production editor
 * tagged "Production" get staffed on weddings and charged a fabricated shoot fee.
 * An unclassified member should be shown as unclassified and fixed, not guessed at.
 */
export function crewKindsForMember(
  member: { assignedRoleIds?: string[]; categories?: string[]; category?: string },
  services: CrewRoleConfig[],
  groups: StudioRoleGroup[]
): RoleGroupKind[] {
  const groupKindById = new Map(groups.map(g => [g.id, g.kind]));
  const kinds = new Set<RoleGroupKind>();

  // The services they perform are the authority.
  (member.assignedRoleIds || []).forEach(id => {
    const svc = services.find(s => s.id === id);
    if (!svc) return;
    kinds.add((svc.groupId && groupKindById.get(svc.groupId)) || kindFromCategory(svc.category));
  });
  if (kinds.size > 0) return Array.from(kinds);

  // Records saved before services were assignable still carry a derived tier.
  const legacy = member.categories && member.categories.length > 0
    ? member.categories
    : member.category
    ? [member.category]
    : [];
  legacy.forEach(c => kinds.add(kindFromCategory(c)));

  return Array.from(kinds);
}

/** Human label for a member's side of the studio. */
export function crewKindLabel(kinds: RoleGroupKind[]): string {
  const hasEvent = kinds.includes('event');
  const hasDeliverable = kinds.includes('deliverable');
  if (hasEvent && hasDeliverable) return 'Events + Deliverables';
  if (hasEvent) return 'Events Crew';
  if (hasDeliverable) return 'Deliverables Crew';
  return 'Unclassified';
}

/**
 * What one member costs on a single job.
 *
 * `undefined` means "no rate on file" and must be surfaced, never silently
 * replaced with a guess. Salaried staff return 0 — a real, known zero, because
 * their wage is a fixed monthly overhead rather than a per-job cost.
 */
export function isSalaried(member: { payType?: string } | undefined): boolean {
  return member?.payType === 'salaried';
}

/** Tier ids retired with the roles model — kept out of every picker and filter. */
const RETIRED_TIER_IDS = new Set(['pre-production']);

/**
 * Tier categories still in use, dropping any retired by the roles migration.
 *
 * Studios that saved settings before the change still carry `pre-production` in
 * `studioSettings.tierCategories`, which would otherwise keep showing up as an
 * empty filter on the Team roster.
 */
export function activeTierCategories<T extends { id: string; active?: boolean }>(saved: T[]): T[] {
  return saved.filter(c => !RETIRED_TIER_IDS.has(c.id) && c.active !== false);
}

/**
 * Crew counts on an event, keyed by role id.
 *
 * Quotations written before roles had ids stored counts under generic names
 * (`photographer`, `cinematographer`, `drone`). Readers used to cope by falling
 * back to those keys whenever a role had no explicit entry — matching on the
 * role's *name*, so every role whose name contained "photo" inherited the same
 * `photographer` count and added its own rate to the total. A roster with
 * "Photographer", "Photographer (DE)", "Photographer (W)" and "Edited Photos"
 * therefore billed four roles for one photographer, and the inflation reappeared
 * whenever a service was removed and re-added, because removal cleared the role
 * id's entry but left the generic key behind.
 *
 * The fallback is now a one-time migration instead of a read-time guess: each
 * legacy key maps to exactly one seeded role, an explicit per-role count always
 * wins (including an explicit zero, which is what "I removed this" looks like),
 * and every non-role key is dropped so it can never be counted again.
 */
const LEGACY_TEAM_KEYS: Record<string, string> = {
  // Most specific first — `photographer` is the catch-all and must not win over
  // an explicit candid/traditional split.
  candidPhotographer: 'role-candid-photographer',
  traditionalPhotographer: 'role-traditional-photographer',
  photographer: 'role-candid-photographer',
  cinematographer: 'role-cinematographer',
  drone: 'role-drone-pilot',
};

export function normaliseTeamRequired(
  teamRequired: Record<string, number | undefined> | undefined,
  roles: CrewRoleConfig[]
): Record<string, number> {
  const source = teamRequired || {};
  const roleIds = new Set(roles.map(r => r.id));
  const out: Record<string, number> = {};

  // Explicit per-role counts, including zeros — a zero is a deliberate removal.
  Object.entries(source).forEach(([key, value]) => {
    if (roleIds.has(key)) out[key] = Number(value) || 0;
  });

  // Fold the legacy generic keys in, but never over an explicit count.
  Object.entries(LEGACY_TEAM_KEYS).forEach(([legacyKey, roleId]) => {
    const count = Number(source[legacyKey]) || 0;
    if (count <= 0) return;
    if (!roleIds.has(roleId)) return;
    if (out[roleId] !== undefined) return;
    out[roleId] = count;
  });

  return out;
}

/** The crew count for one role — role ids only, no name guessing. */
export function roleCountFor(
  teamRequired: Record<string, number | undefined> | undefined,
  roleId: string
): number {
  return Number((teamRequired || {})[roleId]) || 0;
}

/**
 * The role group a service belongs to — "Photo Editor", "Album", "Cinematographer".
 *
 * This is the axis deliverables are organised along now. They used to carry a
 * tier "category" (`post-production`), which survived two migrations without ever
 * saying anything useful: every deliverable was post-production by definition.
 * The role is what a studio actually assigns and chases work by.
 */
export function roleGroupNameFor(
  roleId: string | undefined,
  services: CrewRoleConfig[],
  groups: StudioRoleGroup[]
): string | undefined {
  if (!roleId) return undefined;
  const service = services.find(s => s.id === roleId);
  if (!service) return undefined;
  const groupId = service.groupId || service.category;
  return groups.find(g => g.id === groupId)?.name;
}

/**
 * What a team member is paid for one role.
 *
 * Maintained per member in the Team panel, which is the one place a payout is
 * meant to be set — the Deliverables panel used to accept a typed cost per item,
 * so the same editor could be on two different rates for the same work depending
 * on who filled the form. `undefined` means no rate is on file, which the caller
 * should surface rather than paper over with a zero.
 */
export function payoutForRole(
  member: { rolePayoutRates?: Record<string, number>; payType?: string } | undefined,
  roleId: string | undefined
): number | undefined {
  if (!member || !roleId) return undefined;
  // A salaried editor's deliverable costs nothing extra — their wage already covers
  // it. This is a known zero, not a missing rate, so it must not read as "unset".
  if (member.payType === 'salaried') return 0;
  const rate = member.rolePayoutRates?.[roleId];
  return typeof rate === 'number' ? rate : undefined;
}
