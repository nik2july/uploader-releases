import { ProjectEvent, TeamMember, Client, TeamTierCategory, CrewRoleConfig, TierCategoryConfig } from '../types';

export function getTeamMemberCategories(member: TeamMember): TeamTierCategory[] {
  if (member.categories && Array.isArray(member.categories) && member.categories.length > 0) {
    return member.categories;
  }
  if (member.category) {
    return [member.category];
  }
  return [getTeamMemberCategory(member)];
}

export function getTeamMemberCategory(member: TeamMember): TeamTierCategory {
  if (member.categories && Array.isArray(member.categories) && member.categories.length > 0) {
    return member.categories[0];
  }
  if (member.category) return member.category;
  const roleLower = (member.role || '').toLowerCase();
  if (
    roleLower.includes('intake') ||
    roleLower.includes('lead') ||
    roleLower.includes('sales') ||
    roleLower.includes('producer') ||
    roleLower.includes('coordinator') ||
    roleLower.includes('client relation') ||
    roleLower.includes('schedule') ||
    roleLower.includes('pre-production')
  ) {
    return 'pre-production';
  }
  if (
    roleLower.includes('editor') ||
    roleLower.includes('post-production') ||
    roleLower.includes('colorist') ||
    roleLower.includes('retouch') ||
    roleLower.includes('album') ||
    roleLower.includes('designer')
  ) {
    return 'post-production';
  }
  return 'production';
}

export function getTeamMemberDisplayTitle(member: TeamMember, tierCategories?: TierCategoryConfig[]): string {
  const cats = getTeamMemberCategories(member);
  if (cats.length === 0) return member.role || 'Production';
  return cats
    .map(catKey => {
      const meta = getCategoryMeta(catKey, tierCategories);
      return meta.label;
    })
    .join(' • ');
}

export function getCategoryMeta(category?: TeamTierCategory | string, tierCategories?: TierCategoryConfig[]) {
  const catKey = (category || 'production').trim();
  const catLower = catKey.toLowerCase();

  // If a dynamic tierCategories list is provided, check if it matches
  if (tierCategories && tierCategories.length > 0) {
    const matched = tierCategories.find(
      c => c.id === catKey || c.id.toLowerCase() === catLower || c.name.toLowerCase() === catLower
    );
    if (matched) {
      const theme = matched.colorTheme || 'stone';
      let badgeColor = 'bg-stone-50 text-stone-900 border-stone-200';
      let activeColor = 'text-stone-800';
      let pillBg = 'bg-stone-900';

      if (theme === 'amber' || matched.id === 'pre-production') {
        badgeColor = 'bg-amber-50 text-amber-900 border-amber-200';
        activeColor = 'text-amber-800';
        pillBg = 'bg-amber-900';
      } else if (theme === 'emerald' || matched.id === 'production') {
        badgeColor = 'bg-emerald-50 text-emerald-900 border-emerald-200';
        activeColor = 'text-emerald-800';
        pillBg = 'bg-emerald-900';
      } else if (theme === 'sky' || matched.id === 'post-production') {
        badgeColor = 'bg-sky-50 text-sky-900 border-sky-200';
        activeColor = 'text-sky-800';
        pillBg = 'bg-sky-900';
      } else if (theme === 'rose') {
        badgeColor = 'bg-rose-50 text-rose-900 border-rose-200';
        activeColor = 'text-rose-800';
        pillBg = 'bg-rose-900';
      } else if (theme === 'purple') {
        badgeColor = 'bg-purple-50 text-purple-900 border-purple-200';
        activeColor = 'text-purple-800';
        pillBg = 'bg-purple-900';
      } else if (theme === 'indigo') {
        badgeColor = 'bg-indigo-50 text-indigo-900 border-indigo-200';
        activeColor = 'text-indigo-800';
        pillBg = 'bg-indigo-900';
      } else if (theme === 'teal') {
        badgeColor = 'bg-teal-50 text-teal-900 border-teal-200';
        activeColor = 'text-teal-800';
        pillBg = 'bg-teal-900';
      }

      return {
        label: matched.name,
        shortLabel: matched.name.replace(' Team', '').replace('-Team', ''),
        badgeColor: matched.badgeBg || badgeColor,
        activeColor: matched.badgeText || activeColor,
        pillBg,
        description: matched.description || matched.subtitle || 'Operational functional tier for studio team and roles',
      };
    }
  }

  if (catLower.includes('pre')) {
    return {
      label: 'Pre-Production Team',
      shortLabel: 'Pre-Prod',
      badgeColor: 'bg-amber-50 text-amber-900 border-amber-200',
      activeColor: 'text-amber-800',
      pillBg: 'bg-amber-900',
      description: 'Lead handling, client intake, inquiry consultation & shoot scheduling',
    };
  }
  if (catLower.includes('post')) {
    return {
      label: 'Post-Production Team',
      shortLabel: 'Post-Prod',
      badgeColor: 'bg-sky-50 text-sky-900 border-sky-200',
      activeColor: 'text-sky-800',
      pillBg: 'bg-sky-900',
      description: 'Deliverables tracking, video editing, color grading & luxury album master',
    };
  }
  if (catLower.includes('prod')) {
    return {
      label: 'Production Team',
      shortLabel: 'Production',
      badgeColor: 'bg-emerald-50 text-emerald-900 border-emerald-200',
      activeColor: 'text-emerald-800',
      pillBg: 'bg-emerald-900',
      description: 'On-site shoot execution, candid portraiture, 4K cinematography & aerial drone',
    };
  }

  if (catLower.includes('photo')) {
    return {
      label: 'Photo Deliverables',
      shortLabel: 'Photo',
      badgeColor: 'bg-emerald-50 text-emerald-900 border-emerald-200',
      activeColor: 'text-emerald-800',
      pillBg: 'bg-emerald-900',
      description: 'RAW photo archives, color-graded highlights, and retouched master albums',
    };
  }
  if (catLower.includes('video') || catLower.includes('film') || catLower.includes('cinema')) {
    return {
      label: 'Video Deliverables',
      shortLabel: 'Video',
      badgeColor: 'bg-purple-50 text-purple-900 border-purple-200',
      activeColor: 'text-purple-800',
      pillBg: 'bg-purple-900',
      description: 'Cinematic wedding films, teasers, reels, and traditional uncut rituals',
    };
  }
  if (catLower.includes('album') || catLower.includes('print')) {
    return {
      label: 'Albums & Fine Art Prints',
      shortLabel: 'Album',
      badgeColor: 'bg-rose-50 text-rose-900 border-rose-200',
      activeColor: 'text-rose-800',
      pillBg: 'bg-rose-900',
      description: 'Handcrafted luxury heirloom flush-mount photobooks & parent albums',
    };
  }
  if (catLower.includes('storage') || catLower.includes('hard drive') || catLower.includes('ssd') || catLower.includes('drive')) {
    return {
      label: 'Storage & RAW Archive',
      shortLabel: 'Storage',
      badgeColor: 'bg-cyan-50 text-cyan-900 border-cyan-200',
      activeColor: 'text-cyan-800',
      pillBg: 'bg-cyan-900',
      description: 'High-speed encrypted NVMe SSDs and perpetual cloud archives',
    };
  }
  if (catLower.includes('service') || catLower.includes('live') || catLower.includes('drone')) {
    return {
      label: 'Special Services & Add-ons',
      shortLabel: 'Service',
      badgeColor: 'bg-amber-50 text-amber-900 border-amber-200',
      activeColor: 'text-amber-800',
      pillBg: 'bg-amber-900',
      description: 'Live multicam webcasts, aerial sweeps, and dedicated audio rigging',
    };
  }

  return {
    label: catKey ? catKey.charAt(0).toUpperCase() + catKey.slice(1) : 'General Tier',
    shortLabel: catKey ? catKey.charAt(0).toUpperCase() + catKey.slice(1) : 'General',
    badgeColor: 'bg-stone-50 text-stone-900 border-stone-200',
    activeColor: 'text-stone-800',
    pillBg: 'bg-[#7a2e33]',
    description: 'Operational functional tier for studio team and roles',
  };
}

/**
 * Indian-grouped digits with no currency symbol, for markup that writes its own ₹.
 *
 * A freelance job with no agreed charge yet leaves the field undefined, and
 * `undefined.toLocaleString()` does not fail quietly — it takes down the whole
 * screen it was rendered in. A missing amount is nothing, not a crash.
 */
export function inrDigits(amount: number | string | undefined | null): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return typeof num === 'number' && Number.isFinite(num) ? num.toLocaleString('en-IN') : '0';
}

export function formatINR(amount: number | string | undefined | null): string {
  if (amount === undefined || amount === null || amount === '') return '₹ 0';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '₹ 0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatDate(dateStr: string | null | undefined, style: 'short' | 'medium' | 'long' = 'medium'): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
    if (isNaN(d.getTime())) return dateStr;
    
    if (style === 'short') {
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    }
    if (style === 'long') {
      return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export function getInitials(name: string): string {
  if (!name) return 'B';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Calculates milliseconds timestamp for when the event officially starts,
 * taking both event date (YYYY-MM-DD) and start time into account.
 */
export function getEventStartTimestamp(event: ProjectEvent): number {
  try {
    const datePart = event.date; // e.g. "2026-09-15"
    const timeStr = event.time || '10:00 AM';

    let hours = 10;
    let minutes = 0;

    if (timeStr.includes('AM') || timeStr.includes('PM')) {
      const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (match) {
        let h = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        const meridian = match[3].toUpperCase();
        if (meridian === 'PM' && h < 12) h += 12;
        if (meridian === 'AM' && h === 12) h = 0;
        hours = h;
        minutes = m;
      }
    } else {
      const match = timeStr.match(/(\d+):(\d+)/);
      if (match) {
        hours = parseInt(match[1], 10);
        minutes = parseInt(match[2], 10);
      }
    }

    const d = new Date(`${datePart}T00:00:00`);
    d.setHours(hours, minutes, 0, 0);
    return d.getTime();
  } catch {
    return new Date(event.date).getTime();
  }
}

/**
 * Calculates milliseconds timestamp for when the event officially ends,
 * taking into account event.endDate (if cross-day/next-day) or event.date and endTime.
 */
export function getEventEndTimestamp(event: ProjectEvent): number {
  try {
    const startMs = getEventStartTimestamp(event);
    const duration = event.durationHours || 6;
    return startMs + duration * 3600000;
  } catch {
    return new Date(event.date).getTime() + 21600000;
  }
}

/**
 * Calculates end time formatted string (e.g. "04:00 PM") based on start time and duration in hours.
 */
export function calculateEndTime(startTimeStr: string, durationHours: number = 6): string {
  try {
    let hours = 10;
    let minutes = 0;
    let meridian = 'AM';

    const match = startTimeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (match) {
      hours = parseInt(match[1], 10);
      minutes = parseInt(match[2], 10);
      meridian = match[3].toUpperCase();
      if (meridian === 'PM' && hours < 12) hours += 12;
      if (meridian === 'AM' && hours === 12) hours = 0;
    }

    const totalMinutes = hours * 60 + minutes + durationHours * 60;
    const endTotalHours = Math.floor(totalMinutes / 60) % 24;
    const endMins = totalMinutes % 60;

    const endMeridian = endTotalHours >= 12 ? 'PM' : 'AM';
    let displayHour = endTotalHours % 12;
    if (displayHour === 0) displayHour = 12;

    const minStr = endMins < 10 ? `0${endMins}` : `${endMins}`;
    return `${displayHour}:${minStr} ${endMeridian}`;
  } catch {
    return '04:00 PM';
  }
}

export function isEventEnded(event: ProjectEvent, now: number = Date.now()): boolean {
  return getEventEndTimestamp(event) < now;
}

export function isEventUpcoming(event: ProjectEvent, now: number = Date.now()): boolean {
  return getEventEndTimestamp(event) >= now;
}

/**
 * Checks if a team member role is in the post-production / editing team (Photo Editor, Video Editor, etc.)
 */
export function isEditorRole(role?: string | null): boolean {
  if (!role) return false;
  const lower = role.toLowerCase();
  return (
    lower.includes('editor') ||
    lower.includes('post-production') ||
    lower.includes('colorist') ||
    lower.includes('album') ||
    lower.includes('designer') ||
    lower.includes('retouch')
  );
}

/**
 * Checks if a team member role is for on-ground / field shoots (Photographer, Cinematographer, Drone Operator, etc.)
 */
export function isShootCrewRole(role?: string | null): boolean {
  if (!role) return false;
  return !isEditorRole(role);
}

/**
 * Checks if a role is specifically for Photo editing / retouching / albums
 */
export function isPhotoEditorRole(role?: string | null): boolean {
  if (!role) return false;
  const lower = role.toLowerCase();
  return (
    lower.includes('photo edit') ||
    lower.includes('album') ||
    lower.includes('retouch') ||
    lower === 'photo editor'
  );
}

/**
 * Checks if a role is specifically for Video editing / trailers / films
 */
export function isVideoEditorRole(role?: string | null): boolean {
  if (!role) return false;
  const lower = role.toLowerCase();
  return (
    lower.includes('video edit') ||
    lower.includes('film edit') ||
    lower.includes('colorist') ||
    lower === 'video editor'
  );
}

/**
 * Removes all whitespace characters from a phone number automatically
 */
export function sanitizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  return phone.replace(/\s+/g, '');
}

/**
 * Generates an alphanumeric temporary password for user/client registration
 */
export function generateUniquePassword(prefix = 'BFW'): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let rand = '';
  for (let i = 0; i < 6; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}-${rand}`;
}

/**
 * Formats a member's rate card into a concise display string based on their item payouts and role
 */
export function formatMemberRateCard(member: TeamMember): string {
  if (member.payType === 'salaried') {
    return member.monthlySalary
      ? `₹${member.monthlySalary.toLocaleString('en-IN')} / month (salaried)`
      : 'Salaried';
  }

  // If member has item-level payouts configured, summarize them
  if (member.itemPayoutRates && Object.keys(member.itemPayoutRates).length > 0) {
    const keys = Object.keys(member.itemPayoutRates);
    if (keys.length === 1) {
      const amt = member.itemPayoutRates[keys[0]];
      return `₹${amt.toLocaleString('en-IN')} / event`;
    }
    const minVal = Math.min(...Object.values(member.itemPayoutRates));
    const maxVal = Math.max(...Object.values(member.itemPayoutRates));
    if (minVal === maxVal) {
      return `₹${minVal.toLocaleString('en-IN')} / event`;
    }
    return `₹${minVal.toLocaleString('en-IN')} - ₹${maxVal.toLocaleString('en-IN')} (${keys.length} Items)`;
  }

  const roleLower = (member.role || '').toLowerCase();
  const rc = member.rateCard;

  if (roleLower.includes('drone')) {
    const flat = rc?.flatEventRate ?? member.ratePerDay ?? 10000;
    return `₹${flat.toLocaleString('en-IN')} (Flat / Event)`;
  }

  if (roleLower.includes('video edit') || roleLower.includes('film edit') || roleLower === 'video editor') {
    const flat = rc?.flatVideoRate ?? member.ratePerDay ?? 15000;
    return `₹${flat.toLocaleString('en-IN')} (Flat / Film)`;
  }

  if (roleLower.includes('photo edit') || roleLower === 'photo editor') {
    const perPhoto = rc?.perPhotoRate ?? 35;
    return `₹${perPhoto.toLocaleString('en-IN')} / photo`;
  }

  // Photographer / Cinematographer / General Shoot Crew
  if (member.ratePerDay) {
    return `₹${member.ratePerDay.toLocaleString('en-IN')} / event`;
  }
  return `₹15,000 / event`;
}

/**
 * The roles a member could be filling on an event, best answer first.
 *
 * The role someone is seated in is recorded on their payment record when they are
 * allocated (`MemberPaymentRecord.roleId`), and that stored value is authoritative:
 * it is what the studio actually hired them for on this job, and it stays correct
 * even if their approved-services list or the event's requirements change later.
 *
 * Everything after it is reconstruction, kept only for records written before the
 * role was stored. Reconstruction cannot always be right — a member approved for
 * two roles the same event needs is genuinely ambiguous — which is why the stored
 * value exists. Returning candidates in order lets the fee lookup skip a role the
 * member happens to have no rate for rather than giving up at the first guess.
 */
function memberEventRoleCandidates(member: TeamMember, event?: ProjectEvent): string[] {
  const candidates: string[] = [];
  const push = (id: string | undefined) => {
    if (id && !candidates.includes(id)) candidates.push(id);
  };

  // Recorded at allocation — the real answer, not a guess.
  push(event?.teamPayments?.find(r => r.teamMemberId === member.id)?.roleId);

  const required = (event?.teamRequired || {}) as Record<string, number | undefined>;
  const requiredRoleIds = Object.keys(required).filter(id => Number(required[id]) > 0);

  // A role this event actually needs, that this member is approved to do — the same
  // rule `CrewAllocationModal` seats people by, so the two agree.
  requiredRoleIds.filter(id => member.assignedRoleIds?.includes(id)).forEach(push);

  // Allocated before the member's approved-services list existed: fall back to a
  // required role they have a rate on file for.
  requiredRoleIds.filter(id => member.rolePayoutRates?.[id] !== undefined).forEach(push);

  // Nothing on the event to match against, but a member who does exactly one job
  // is unambiguous anyway.
  if (member.assignedRoleIds?.length === 1) push(member.assignedRoleIds[0]);

  return candidates;
}

/** Which role a member is filling on a given event: the role stored on their
 * payment record, or the best reconstruction for records predating it. */
export function resolveMemberEventRoleId(
  member: TeamMember,
  event?: ProjectEvent
): string | undefined {
  return memberEventRoleCandidates(member, event)[0];
}

/**
 * What a member is owed for one event — the figure every payment screen should show.
 *
 * Prefers the rate on file for the role they are filling, because the Team panel is
 * where a payout is meant to be set and it is the only figure the studio actually
 * agreed. The amount stored on the event is NOT authoritative on its own: it is
 * written once, when the person is first allocated, and never revisited, so a rate
 * corrected afterwards in the Team panel would otherwise never reach the event.
 *
 * Two things are never recomputed: a payment already settled, which is history, and
 * an amount typed in by hand, which is a deliberate decision about this one job.
 */
export function resolveMemberEventFee(
  member: TeamMember,
  event: ProjectEvent,
  configuredRoles?: CrewRoleConfig[]
): number {
  // A salaried member's wage already covers the job; billing the event again would
  // pay them twice.
  if (member.payType === 'salaried') return 0;

  const record = event.teamPayments?.find(r => r.teamMemberId === member.id);
  const rawStored = record?.amount;
  const stored =
    rawStored !== undefined && rawStored !== null && String(rawStored).trim() !== ''
      ? Number(rawStored)
      : undefined;
  const hasStored = stored !== undefined && !Number.isNaN(stored);

  if ((record?.status === 'paid' || record?.amountSource === 'manual') && hasStored) {
    return stored as number;
  }

  // The role recorded at allocation is tried first; the reconstructions behind it
  // only matter for records written before the role was stored, and are skipped
  // when the member has no rate on file for them.
  const candidates = memberEventRoleCandidates(member, event);
  for (const candidate of candidates) {
    const roleRate = member.rolePayoutRates?.[candidate];
    if (typeof roleRate === 'number') return roleRate;
  }

  if (hasStored) return stored as number;
  return calculateMemberEventFee(member, event, configuredRoles, undefined, candidates[0]);
}

/**
 * Calculates payment fee for a team member on an event based on their individual item-level internal cost
 */
export function calculateMemberEventFee(
  member: TeamMember,
  _event?: ProjectEvent,
  _configuredRoles?: CrewRoleConfig[],
  catalogItemId?: string,
  roleId?: string
): number {
  // Salaried staff cost nothing per job — the wage is paid whether or not this
  // wedding happens. Checked before everything else so no rate-card leftover or
  // role-name fallback can bill them a second time on top of their salary.
  if (member.payType === 'salaried') return 0;

  // 0. Direct role payout lookup (from TeamRoleRatesPanel)
  if (roleId && member.rolePayoutRates?.[roleId] !== undefined) {
    return member.rolePayoutRates[roleId];
  }

  // 1. Direct item ID payout lookup
  if (catalogItemId && member.itemPayoutRates?.[catalogItemId] !== undefined) {
    return member.itemPayoutRates[catalogItemId];
  }

  // 2. Role-to-Catalog item payout mapping if member has configured item payouts
  if (member.itemPayoutRates && Object.keys(member.itemPayoutRates).length > 0) {
    const roleLower = (member.role || '').toLowerCase();
    
    // Check known item id mappings
    if (roleLower.includes('candid') && member.itemPayoutRates['cat-candid-photo'] !== undefined) {
      return member.itemPayoutRates['cat-candid-photo'];
    }
    if ((roleLower.includes('trad') || roleLower.includes('stage')) && member.itemPayoutRates['cat-trad-photo'] !== undefined) {
      return member.itemPayoutRates['cat-trad-photo'];
    }
    if ((roleLower.includes('cine') || roleLower.includes('film')) && member.itemPayoutRates['cat-cine-film'] !== undefined) {
      return member.itemPayoutRates['cat-cine-film'];
    }
    if (roleLower.includes('drone') && member.itemPayoutRates['cat-drone-aerial'] !== undefined) {
      return member.itemPayoutRates['cat-drone-aerial'];
    }
    if (roleLower.includes('pre-wedding') && member.itemPayoutRates['cat-pre-wedding'] !== undefined) {
      return member.itemPayoutRates['cat-pre-wedding'];
    }
    if (roleLower.includes('assist') && member.itemPayoutRates['cat-assistant'] !== undefined) {
      return member.itemPayoutRates['cat-assistant'];
    }
    if (roleLower.includes('video edit') && member.itemPayoutRates['cat-trailer-edit'] !== undefined) {
      return member.itemPayoutRates['cat-trailer-edit'];
    }
    if (roleLower.includes('photo edit') && member.itemPayoutRates['cat-photo-curation'] !== undefined) {
      return member.itemPayoutRates['cat-photo-curation'];
    }
    if (roleLower.includes('album') && member.itemPayoutRates['cat-album-design'] !== undefined) {
      return member.itemPayoutRates['cat-album-design'];
    }

    // Use the first configured payout rate as member standard rate
    const firstKey = Object.keys(member.itemPayoutRates)[0];
    if (member.itemPayoutRates[firstKey]) {
      return member.itemPayoutRates[firstKey];
    }
  }

  const roleLower = (member.role || '').toLowerCase();

  // Drone operator: flat event rate
  if (roleLower.includes('drone')) {
    return member.rateCard?.flatEventRate || member.ratePerDay || 10000;
  }

  // Video Editor: flat video rate
  if (roleLower.includes('video edit') || roleLower.includes('film edit') || roleLower === 'video editor') {
    return member.rateCard?.flatVideoRate || member.ratePerDay || 15000;
  }

  // Photo Editor: per photo rate (batch estimate)
  if (roleLower.includes('photo edit') || roleLower === 'photo editor') {
    if (member.rateCard?.perPhotoRate) return member.rateCard.perPhotoRate * 200;
    return member.ratePerDay || 8000;
  }

  // Photographer or Cinematographer
  if (
    roleLower.includes('photo') ||
    roleLower.includes('cine') ||
    roleLower.includes('candid') ||
    roleLower.includes('traditional')
  ) {
    return member.ratePerDay || (roleLower.includes('cine') ? 16000 : (roleLower.includes('candid') ? 15000 : 12000));
  }

  // General fallback
  return member.ratePerDay || 10000;
}

/**
 * Checks if a client's shoot events have all concluded (or client has no events = post-production only).
 */
export function isClientShootDone(
  _client: Client,
  clientEvents: ProjectEvent[],
  now: number = Date.now()
): boolean {
  if (!clientEvents || clientEvents.length === 0) {
    return true; // Hired for post-production only
  }
  return clientEvents.every(event => isEventEnded(event, now));
}

/**
 * Checks if all deliverables for a client are completed and delivered.
 */
export function isClientDeliverablesCompleted(client: Client): boolean {
  if (!client.deliverables || client.deliverables.length === 0) return false;
  return client.deliverables.every(d => d.status === 'delivered');
}

/**
 * Checks if a client's deliverables are eligible to appear in the Post-Production panel.
 * - Excludes active inquiries, new leads, or lost clients.
 * - If client has shoot events, checks whether any shoot event has already occurred (past or today).
 *   Clients whose events are all in the future are excluded because their footage/data has not been created yet.
 * - If a client already has raw footage linked/uploaded on any deliverable, they are considered eligible.
 */
export function isClientPostProductionEligible(
  client: Client,
  clientEvents?: ProjectEvent[],
  now: number = Date.now()
): boolean {
  const s = (client.status || '').toLowerCase();
  if (s === 'new_enquiry' || s === 'new lead' || s === 'lost') return false;

  // If client already has raw rushes data linked or uploaded on any deliverable, they are eligible
  const hasRawData = (client.deliverables || []).some(
    d => Boolean(d.rawDataLink) || d.rawDataSource === 'hard_drive' || Object.keys(d.desktopTransfers || {}).length > 0
  );
  if (hasRawData) return true;

  // If client status is marked 'shoot done' or 'completed', shoot is definitely done
  if (s === 'shoot done' || s === 'completed') return true;

  // If client has scheduled shoot events, verify that at least one event has occurred
  if (clientEvents && clientEvents.length > 0) {
    const todayStr = new Date(now).toISOString().slice(0, 10);
    const hasPastOrTodayEvent = clientEvents.some(event => {
      if (isEventEnded(event, now)) return true;
      if (event.date && event.date <= todayStr) return true;
      return false;
    });
    // If all events are in the future, data cannot exist yet
    if (!hasPastOrTodayEvent) {
      return false;
    }
  }

  return true;
}

/**
 * Calculates a future date by adding N days to an ISO/YYYY-MM-DD date string.
 */
export function addDaysToDate(dateStr?: string, days: number = 7): string {
  try {
    const base = dateStr ? new Date(dateStr) : new Date();
    if (isNaN(base.getTime())) {
      const now = new Date();
      now.setDate(now.getDate() + days);
      return now.toISOString().split('T')[0];
    }
    base.setDate(base.getDate() + days);
    return base.toISOString().split('T')[0];
  } catch {
    const now = new Date();
    now.setDate(now.getDate() + days);
    return now.toISOString().split('T')[0];
  }
}

/**
 * Freelance stage metadata with friendly labels, colors, and progression steps.
 */
export function getFreelanceStageMeta(stage: import('../types').FreelanceJobStage) {
  switch (stage) {
    case 'pending_assignment':
      return {
        label: 'Awaiting Assignment',
        step: 0,
        color: 'stone',
        badgeBg: 'bg-stone-50 border-stone-200 text-stone-900',
        badgeClass: 'bg-stone-100 text-stone-800 border border-stone-300',
        badgeText: 'text-stone-800',
        dotColor: 'bg-stone-500',
        nextStage: 'data_received' as const,
        nextLabel: 'Mark Data Received',
        description: 'Work logged. Awaiting editor assignment or verified raw data.',
      };
    case 'data_received':
      return {
        label: 'Data Received',
        step: 1,
        color: 'amber',
        badgeBg: 'bg-amber-50 border-amber-200 text-amber-900',
        badgeClass: 'bg-amber-100 text-amber-800 border border-amber-300',
        badgeText: 'text-amber-800',
        dotColor: 'bg-amber-500',
        nextStage: null,
        nextLabel: 'Assign Editor',
        description: 'Raw footage/files received. Assign an editor as the next step.',
      };
    case 'editor_assigned':
      return {
        label: 'Editor Assigned',
        step: 2,
        color: 'sky',
        badgeBg: 'bg-sky-50 border-sky-200 text-sky-900',
        badgeClass: 'bg-sky-100 text-sky-800 border border-sky-300',
        badgeText: 'text-sky-800',
        dotColor: 'bg-sky-500',
        nextStage: null,
        nextLabel: 'Notify Editor',
        description: 'Editor assigned. Notify them so work can begin.',
      };
    case 'sent_to_editor':
      return {
        label: 'With Editor',
        step: 3,
        color: 'sky',
        badgeBg: 'bg-sky-50 border-sky-200 text-sky-900',
        badgeClass: 'bg-sky-100 text-sky-800 border border-sky-300',
        badgeText: 'text-sky-800',
        dotColor: 'bg-sky-500',
        nextStage: 'draft_received' as const,
        nextLabel: 'Draft In Review',
        description: 'Editor has been notified and is working on the project.',
      };
    case 'internal_review':
    case 'draft_received':
      return {
        label: 'Studio Review',
        step: 4,
        color: 'indigo',
        badgeBg: 'bg-indigo-50 border-indigo-200 text-indigo-900',
        badgeClass: 'bg-indigo-100 text-indigo-800 border border-indigo-300',
        badgeText: 'text-indigo-800',
        dotColor: 'bg-indigo-500',
        nextStage: 'sent_to_client' as const,
        nextLabel: 'Send to Client',
        description: 'Cut received. Review the video internally before sharing with the client.',
      };
    case 'internal_changes':
      return {
        label: 'Internal Changes',
        step: 4,
        color: 'amber',
        badgeBg: 'bg-amber-50 border-amber-200 text-amber-900',
        badgeClass: 'bg-amber-100 text-amber-800 border border-amber-300',
        badgeText: 'text-amber-800',
        dotColor: 'bg-amber-500',
        nextStage: 'internal_review' as const,
        nextLabel: 'Back to Review',
        description: 'Internal changes requested by Studio Owner. Editor is revising cut.',
      };
    case 'sent_to_client':
      return {
        label: 'Client Review',
        step: 5,
        color: 'purple',
        badgeBg: 'bg-purple-50 border-purple-200 text-purple-900',
        badgeClass: 'bg-purple-100 text-purple-800 border border-purple-300',
        badgeText: 'text-purple-800',
        dotColor: 'bg-purple-500',
        nextStage: null,
        nextLabel: 'Await Client Decision',
        description: 'Preview link shared with client. Awaiting feedback or approval.',
      };
    case 'changes_received':
      return {
        label: 'Changes Received',
        step: 6,
        color: 'rose',
        badgeBg: 'bg-rose-50 border-rose-200 text-rose-900',
        badgeClass: 'bg-rose-100 text-rose-800 border border-rose-300',
        badgeText: 'text-rose-800',
        dotColor: 'bg-rose-500',
        nextStage: 'changes_sent_to_editor' as const,
        nextLabel: 'Share Changes with Editor',
        description: 'Client revision notes logged. 48h turnaround timer active.',
      };
    case 'changes_sent_to_editor':
      return {
        label: 'Changes with Editor',
        step: 7,
        color: 'orange',
        badgeBg: 'bg-orange-50 border-orange-200 text-orange-900',
        badgeClass: 'bg-orange-100 text-orange-800 border border-orange-300',
        badgeText: 'text-orange-800',
        dotColor: 'bg-orange-500',
        nextStage: 'sent_to_client' as const,
        nextLabel: 'Re-send to Client',
        description: 'Editor revising project based on client change request.',
      };
    case 'final_delivered':
      return {
        label: 'Client Approved',
        step: 8,
        color: 'emerald',
        badgeBg: 'bg-emerald-50 border-emerald-200 text-emerald-900',
        badgeClass: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
        badgeText: 'text-emerald-800',
        dotColor: 'bg-emerald-500',
        nextStage: 'completed' as const,
        nextLabel: 'Mark Completed',
        description: 'Client approved the final. Complete the project; payment status remains tracked separately.',
      };
    case 'completed':
      return {
        label: 'Completed',
        step: 9,
        color: 'teal',
        badgeBg: 'bg-teal-50 border-teal-200 text-teal-900',
        badgeClass: 'bg-teal-100 text-teal-800 border border-teal-300',
        badgeText: 'text-teal-800',
        dotColor: 'bg-teal-600',
        nextStage: null,
        nextLabel: 'Completed',
        description: 'Project work is complete. It appears under Payment Received once the client balance is paid.',
      };
    default:
      return {
        label: 'Active',
        step: 1,
        color: 'stone',
        badgeBg: 'bg-stone-50 border-stone-200 text-stone-900',
        badgeClass: 'bg-stone-100 text-stone-800 border border-stone-300',
        badgeText: 'text-stone-800',
        dotColor: 'bg-stone-500',
        nextStage: null,
        nextLabel: 'Next',
        description: '',
      };
  }
}

/**
 * Calculates due date status: days remaining or days overdue.
 */
export function getDueDateStatus(targetDateStr?: string) {
  if (!targetDateStr) {
    return {
      text: 'No due date',
      label: 'No due date',
      status: 'normal' as const,
      color: 'text-stone-500',
      days: null,
      daysRemaining: 999,
      isOverdue: false,
    };
  }
  const target = new Date(targetDateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  const diffTime = target.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays);
    return {
      text: `${overdueDays} day${overdueDays > 1 ? 's' : ''} overdue`,
      label: `${overdueDays}d overdue`,
      status: 'overdue' as const,
      color: 'text-rose-600 font-bold',
      days: diffDays,
      daysRemaining: diffDays,
      isOverdue: true,
    };
  }
  if (diffDays === 0) {
    return {
      text: 'Due Today',
      label: 'Due Today',
      status: 'today' as const,
      color: 'text-amber-700 font-bold',
      days: 0,
      daysRemaining: 0,
      isOverdue: false,
    };
  }
  if (diffDays === 1) {
    return {
      text: 'Due Tomorrow',
      label: 'Due Tomorrow',
      status: 'tomorrow' as const,
      color: 'text-amber-600 font-semibold',
      days: 1,
      daysRemaining: 1,
      isOverdue: false,
    };
  }
  return {
    text: `Due in ${diffDays} days`,
    label: `In ${diffDays} days`,
    status: diffDays <= 2 ? ('urgent' as const) : ('normal' as const),
    color: diffDays <= 2 ? 'text-amber-600 font-medium' : 'text-stone-600 font-medium',
    days: diffDays,
    daysRemaining: diffDays,
    isOverdue: false,
  };
}


/**
 * Whether a shoot still needs people put on it.
 *
 * Compares who is rostered against what the event actually calls for, rather than
 * only asking whether anyone at all is assigned: a wedding needing three
 * photographers with one booked is still short two, and treating that as covered is
 * how a shoot arrives understaffed.
 *
 * A shoot with nobody on it counts as needing crew whether or not anyone got round
 * to recording what it required.
 */
export function eventNeedsCrew(event: ProjectEvent): boolean {
  const assigned = (event.assignments || []).length;
  
  // Keep exactly in sync with SharedEventCard to avoid UI drift
  const requiredCount =
    (event.teamRequired?.photographer || 0) +
    (event.teamRequired?.cinematographer || 0) +
    (event.teamRequired?.drone || 0) ||
    Object.values(event.teamRequired || {}).reduce<number>((s, v) => (s || 0) + (typeof v === 'number' ? v : 0), 0) ||
    2;

  return assigned < requiredCount;
}

/**
 * An event's span as the studio says it aloud: "6:00 PM – 12:00 AM · 6 hrs".
 *
 * The end is taken from `endTime` where the event carries one and otherwise derived
 * from the duration, because a client reading a confirmation needs to know when the
 * crew leaves as much as when they arrive — a six-hour booking and a twelve-hour one
 * look identical if only the start is printed.
 */
/**
 * One clock format for both ends of a range.
 *
 * Stored times come from a time input and arrive zero-padded ("01:00 PM"), while a
 * computed end time was built from `Date` parts and did not, so a printed range read
 * "01:00 PM – 9:00 PM" — padded on one side of the dash and not the other. Both ends
 * go through here, so whichever way each was produced they agree.
 */
function unpadClock(value: string): string {
  return value.replace(/\b0(\d:)/, '$1');
}

export function formatEventTimeRange(event: ProjectEvent): string {
  const start = event.time ? unpadClock(event.time) : 'Time TBD';
  const hours = event.durationHours || 6;

  let end = event.endTime ? unpadClock(event.endTime) : event.endTime;
  if (!end) {
    const endMs = getEventEndTimestamp(event);
    if (Number.isFinite(endMs)) {
      const d = new Date(endMs);
      const h = d.getHours();
      const m = d.getMinutes();
      const suffix = h < 12 ? 'AM' : 'PM';
      const h12 = h % 12 === 0 ? 12 : h % 12;
      end = `${h12}:${`${m}`.padStart(2, '0')} ${suffix}`;
    }
  }

  const span = end ? `${start} – ${end}` : start;
  return `${span} · ${hours} hrs`;
}
