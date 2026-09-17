import React, { useMemo, useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { CrewRoleConfig, StudioRoleGroup } from '../../types';
import { DEFAULT_CREW_ROLES } from '../../data/seedData';
import { formatINR } from '../../utils/formatters';
import { normaliseServices, resolveRoleGroups, servicesInGroup } from '../../utils/studioRoles';
import { Layers } from 'lucide-react';

interface TeamRoleRatesPanelProps {
  /** Prefix for input ids so Add and Edit modals don't collide on the page. */
  idPrefix: string;
  assignedRoleIds: string[];
  rolePayoutRates: Record<string, number>;
  onToggleRole: (roleId: string) => void;
  onChangeRate: (roleId: string, value: string) => void;
  /** Salaried members have no per-service cost, so the rate inputs are pointless. */
  hideRates?: boolean;
}

/**
 * Every service the studio offers, grouped under its role, with this member's
 * own cost for each.
 *
 * Services used to be gated behind a Pre/Production/Post "tier category" the
 * studio had to tick first — which meant a member on a tier with no roles saw an
 * empty list and had nowhere to enter a rate. Roles are the model now, so the
 * full list is always shown and ticking a service is the only step.
 */
export const TeamRoleRatesPanel: React.FC<TeamRoleRatesPanelProps> = ({
  idPrefix,
  assignedRoleIds,
  rolePayoutRates,
  onToggleRole,
  onChangeRate,
  hideRates = false,
}) => {
  const { studioSettings } = useApp();

  const groups: StudioRoleGroup[] = useMemo(
    () => resolveRoleGroups(studioSettings?.roleGroups).filter(g => g.active !== false),
    [studioSettings?.roleGroups]
  );

  const services: CrewRoleConfig[] = useMemo(() => {
    const saved =
      studioSettings?.crewRoles && studioSettings.crewRoles.length > 0
        ? studioSettings.crewRoles
        : DEFAULT_CREW_ROLES;
    return normaliseServices(saved, groups);
  }, [studioSettings?.crewRoles, groups]);

  // Events roles first, then Deliverables — matches the order of the builder tabs.
  const sections = useMemo(() => {
    const ordered = [
      ...groups.filter(g => g.kind === 'event'),
      ...groups.filter(g => g.kind === 'deliverable'),
    ];
    return ordered
      .map(group => ({ group, rows: servicesInGroup(services, group.id) }))
      .filter(s => s.rows.length > 0);
  }, [groups, services]);

  const totalServices = sections.reduce((n, s) => n + s.rows.length, 0);

  const [activeTab, setActiveTab] = useState<string>('');
  useEffect(() => {
    if (!activeTab && sections.length > 0) setActiveTab(sections[0].group.id);
  }, [sections, activeTab]);

  return (
    <div className="p-4 rounded-xl bg-[#f9f8f6] border border-[#d4c1a3] space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
        <div>
          <h4 className="text-xs font-bold text-[#7a2e33] flex items-center gap-1.5">
            <Layers className="w-4 h-4" /> Services & Member Cost/Pay Rates
          </h4>
          <p className="text-[11px] text-[#6b6660]">
            Tick the services this member performs and enter what you pay them for each.
          </p>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#7a2e33]/10 text-[#7a2e33] shrink-0 self-start sm:self-auto">
          {assignedRoleIds.length} of {totalServices} Assigned
        </span>
      </div>

      {sections.length === 0 ? (
        <div className="p-4 text-center bg-white rounded-xl border border-dashed border-[#d4c1a3] text-xs text-[#6b6660]">
          No services configured yet. Add them under Quotation Settings → Events / Deliverables.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-[#d4c1a3]/50">
            {sections.map(({ group }) => (
              <button
                key={group.id}
                type="button"
                onClick={() => setActiveTab(group.id)}
                className={`px-3 py-1.5 text-[10px] font-bold rounded-lg whitespace-nowrap transition-colors ${
                  activeTab === group.id
                    ? group.kind === 'event'
                      ? 'bg-emerald-50 text-emerald-900 border border-emerald-200 shadow-xs'
                      : 'bg-sky-50 text-sky-900 border border-sky-200 shadow-xs'
                    : 'bg-white border border-[#d4c1a3] text-[#6b6660] hover:border-[#7a2e33]'
                }`}
              >
                {group.name}
              </button>
            ))}
          </div>

          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {sections.map(({ group, rows }) => (
              <div key={group.id} className={activeTab === group.id ? "space-y-2 block" : "hidden"}>

              {rows.map(roleObj => {
                const isAssigned = assignedRoleIds.includes(roleObj.id);
                const clientRate = roleObj.clientBillingRate || 0;
                // Only a starting suggestion — the studio overwrites it with what
                // this person is actually paid.
                const suggested =
                  roleObj.defaultRate || (clientRate ? Math.round(clientRate * 0.6) : 0);
                const memberPayout =
                  rolePayoutRates[roleObj.id] !== undefined ? rolePayoutRates[roleObj.id] : suggested;
                const margin = clientRate - memberPayout;
                const marginPct = clientRate > 0 ? Math.round((margin / clientRate) * 100) : 0;

                const isPerHour = roleObj.unit === 'per_hour' || roleObj.id === 'role-full-coverage';
                const isPerSheet = roleObj.unit === 'per_sheet' || roleObj.id === 'role-album-designer';
                const isPerPhoto = roleObj.unit === 'per_photo' || roleObj.id === 'role-photo-editor';
                const unitLabel = isPerHour
                  ? '/ hr raw'
                  : isPerSheet
                  ? '/ sheet'
                  : isPerPhoto
                  ? '/ photo'
                  : '/ event';

                return (
                  <div
                    key={roleObj.id}
                    className={`p-3 rounded-xl border transition-all ${
                      isAssigned
                        ? 'bg-white border-[#7a2e33]/40 shadow-xs'
                        : 'bg-stone-50/60 border-stone-200 opacity-75 hover:opacity-100'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-[200px] flex-1">
                        <input
                          type="checkbox"
                          id={`${idPrefix}-role-check-${roleObj.id}`}
                          checked={isAssigned}
                          onChange={() => onToggleRole(roleObj.id)}
                          className="mt-0.5 rounded text-[#7a2e33] focus:ring-[#7a2e33] cursor-pointer"
                        />
                        <label
                          htmlFor={`${idPrefix}-role-check-${roleObj.id}`}
                          className="cursor-pointer space-y-0.5"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-[#111417]">{roleObj.name}</span>
                            {isPerHour && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200">
                                Raw Footage Rate
                              </span>
                            )}
                          </div>
                          {roleObj.description && (
                            <p className="text-[10px] text-[#6b6660] line-clamp-1">
                              {roleObj.description}
                            </p>
                          )}
                          <div className="text-[10px] text-[#6b6660] flex items-center gap-1 pt-0.5">
                            <span className="text-stone-500">Client Selling Rate:</span>
                            <strong className="text-[#0b1f3b] font-mono">
                              {clientRate ? `${formatINR(clientRate)} ${unitLabel}` : 'Not set in settings'}
                            </strong>
                          </div>
                        </label>
                      </div>

                      {isAssigned && hideRates && (
                        <span className="self-end sm:self-center shrink-0 text-[10px] font-bold px-2 py-1 rounded-md bg-[#0b1f3b]/10 text-[#0b1f3b] border border-[#0b1f3b]/20">
                          Covered by salary — ₹0
                        </span>
                      )}

                      {isAssigned && !hideRates && (
                      <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                        <div className="flex items-center gap-1.5">
                          <label className="text-[10px] font-bold text-[#6b6660] shrink-0">
                            {isPerHour
                              ? 'Pay (₹ / Hour):'
                              : isPerSheet
                              ? 'Pay (₹ / Sheet):'
                              : isPerPhoto
                              ? 'Pay (₹ / Photo):'
                              : 'Member Cost / Pay:'}
                          </label>
                          <div className="relative w-28">
                            <span className="absolute left-2.5 top-1.5 text-xs font-bold text-stone-400">₹</span>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={memberPayout}
                              onChange={e => onChangeRate(roleObj.id, e.target.value)}
                              className="w-full pl-6 pr-2 py-1 rounded-lg border border-[#d4c1a3] text-xs font-bold text-[#7a2e33] focus:outline-none focus:border-[#7a2e33] bg-[#f9f8f6]/50"
                              placeholder="0"
                            />
                          </div>
                        </div>

                        {clientRate > 0 && (
                          <div className="text-right shrink-0 min-w-[80px]">
                            <span className="text-[9px] text-[#6b6660] block">Studio Margin</span>
                            <span
                              className={`text-[11px] font-bold ${
                                margin >= 0 ? 'text-emerald-700' : 'text-rose-600'
                              }`}
                            >
                              {formatINR(margin)} ({marginPct}%)
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        </>
      )}
    </div>
  );
};
