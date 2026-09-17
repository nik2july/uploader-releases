import React, { useState, useEffect, useMemo } from 'react';
import { TeamMember, TeamTierCategory, CrewRoleConfig, ProductionCatalogItem } from '../../types';
import { X, UserCheck, Phone, KeyRound, RefreshCw, Copy, Check, Layers, CheckCircle2, Circle, Wallet, CalendarOff } from 'lucide-react';
import { generateUniquePassword, sanitizePhone, getTeamMemberCategory, getTeamMemberCategories, getTeamMemberDisplayTitle, getCategoryMeta, formatINR } from '../../utils/formatters';
import { useApp } from '../../context/AppContext';
import { TeamRoleRatesPanel } from './TeamRoleRatesPanel';
import { categoriesFromAssignments, normaliseServices, resolveRoleGroups } from '../../utils/studioRoles';
import { DEFAULT_CREW_ROLES, DEFAULT_PRODUCTION_CATALOG, DEFAULT_TIER_CATEGORIES } from '../../data/seedData';

interface EditTeamMemberModalProps {
  member: TeamMember;
  onClose: () => void;
  onSave: (updated: TeamMember) => void;
}

export const EditTeamMemberModal: React.FC<EditTeamMemberModalProps> = ({
  member,
  onClose,
  onSave,
}) => {
  const { studioSettings, studioPriceList } = useApp();

  const allTierCategories = useMemo(() => {
    if (studioSettings?.tierCategories && studioSettings.tierCategories.length > 0) {
      return studioSettings.tierCategories.filter(c => c.active !== false);
    }
    return DEFAULT_TIER_CATEGORIES;
  }, [studioSettings?.tierCategories]);

  const validCategoryIds = useMemo(() => {
    return allTierCategories.map(c => c.id);
  }, [allTierCategories]);

  const roleGroups = useMemo(
    () => resolveRoleGroups(studioSettings?.roleGroups).filter(g => g.active !== false),
    [studioSettings?.roleGroups]
  );

  // Every service the studio offers — no tier gate, so a rate can always be set.
  const availableRoles: CrewRoleConfig[] = useMemo(() => {
    const rawRoles =
      (studioSettings?.crewRoles && studioSettings.crewRoles.length > 0)
        ? studioSettings.crewRoles
        : (studioPriceList?.crewRoles && studioPriceList.crewRoles.length > 0)
        ? studioPriceList.crewRoles
        : DEFAULT_CREW_ROLES;
    return normaliseServices(rawRoles, roleGroups);
  }, [studioSettings?.crewRoles, studioPriceList?.crewRoles, roleGroups]);

  const catalogItems: ProductionCatalogItem[] = useMemo(() => {
    return (studioSettings?.productionCatalog && studioSettings.productionCatalog.length > 0)
      ? studioSettings.productionCatalog
      : (studioPriceList?.productionCatalog && studioPriceList.productionCatalog.length > 0)
      ? studioPriceList.productionCatalog
      : DEFAULT_PRODUCTION_CATALOG;
  }, [studioSettings?.productionCatalog, studioPriceList?.productionCatalog]);

  // Multiple Functional Tier Categories Assignment
  const [categories, setCategories] = useState<TeamTierCategory[]>(() => {
    const rawCats = getTeamMemberCategories(member);
    const valid = rawCats.filter(c => validCategoryIds.includes(c));
    return valid.length > 0 ? valid : [validCategoryIds[0] || 'production'];
  });

  const [name, setName] = useState(member.name);
  const [phone, setPhone] = useState(sanitizePhone(member.phone));
  const [password, setPassword] = useState(member.password || generateUniquePassword('TM'));
  const [mustChangePassword, setMustChangePassword] = useState(member.mustChangePassword ?? false);
  const [copiedPass, setCopiedPass] = useState(false);
  const [bio, setBio] = useState(member.bio || '');
  // Days this person is not working. The forecast skips them entirely, so recording a
  // holiday here is what stops the studio quoting a delivery date across it.
  const [unavailablePeriods, setUnavailablePeriods] = useState(member.unavailablePeriods || []);
  const [leaveFrom, setLeaveFrom] = useState('');
  const [leaveTo, setLeaveTo] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [active, setActive] = useState(member.active);

  // Multi-role assignment state across selected categories
  const [assignedRoleIds, setAssignedRoleIds] = useState<string[]>(() => {
    if (member.assignedRoleIds && member.assignedRoleIds.length > 0) {
      return member.assignedRoleIds;
    }
    const matched = availableRoles.find(r => r.name.toLowerCase() === member.role.toLowerCase());
    return matched ? [matched.id] : (availableRoles[0] ? [availableRoles[0].id] : []);
  });

  // Role-Level Cost & Payout Rates: roleId -> member's custom cost/pay rate
  const [payType, setPayType] = useState<'per_event' | 'salaried'>(member.payType || 'per_event');
  const [monthlySalary, setMonthlySalary] = useState<number>(member.monthlySalary ?? 0);

  const [rolePayoutRates, setRolePayoutRates] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = { ...(member.rolePayoutRates || {}) };
    availableRoles.forEach(r => {
      if (initial[r.id] === undefined) {
        if (member.ratePerDay && r.name.toLowerCase() === member.role.toLowerCase()) {
          initial[r.id] = member.ratePerDay;
        } else if (r.defaultRate) {
          initial[r.id] = r.defaultRate;
        } else if (r.clientBillingRate) {
          initial[r.id] = Math.round(r.clientBillingRate * 0.6);
        } else {
          initial[r.id] = 12000;
        }
      }
    });
    return initial;
  });

  useEffect(() => {
    const memCats = getTeamMemberCategories(member);
    setCategories(memCats);
    setName(member.name);
    setPhone(sanitizePhone(member.phone));
    setPassword(member.password || generateUniquePassword('TM'));
    setMustChangePassword(member.mustChangePassword ?? false);
    setBio(member.bio || '');
    setUnavailablePeriods(member.unavailablePeriods || []);
    setActive(member.active);

    if (member.assignedRoleIds && member.assignedRoleIds.length > 0) {
      setAssignedRoleIds(member.assignedRoleIds);
    } else {
      const matched = availableRoles.find(r => r.name.toLowerCase() === member.role.toLowerCase());
      setAssignedRoleIds(matched ? [matched.id] : []);
    }

    setPayType(member.payType || 'per_event');
    setMonthlySalary(member.monthlySalary ?? 0);

    const salaried = member.payType === 'salaried';
    const rates: Record<string, number> = { ...(member.rolePayoutRates || {}) };
    availableRoles.forEach(r => {
      if (rates[r.id] !== undefined) return;
      // A salaried member costs nothing per job, so every unset rate is a real
      // zero. Filling them with the usual guesses would double-charge the studio:
      // once in the monthly wage, again on every event and deliverable.
      if (salaried) {
        rates[r.id] = 0;
      } else if (member.ratePerDay && r.name.toLowerCase() === member.role.toLowerCase()) {
        rates[r.id] = member.ratePerDay;
      } else if (r.defaultRate) {
        rates[r.id] = r.defaultRate;
      } else if (r.clientBillingRate) {
        rates[r.id] = Math.round(r.clientBillingRate * 0.6);
      } else {
        rates[r.id] = 12000;
      }
    });
    setRolePayoutRates(rates);
  }, [member, availableRoles]);



  const handleToggleRoleAssignment = (roleId: string) => {
    setAssignedRoleIds(prev => {
      if (prev.includes(roleId)) {
        return prev.filter(id => id !== roleId);
      } else {
        return [...prev, roleId];
      }
    });
  };

  const handleRolePayoutChange = (roleId: string, val: string) => {
    const num = Number(val);
    setRolePayoutRates(prev => ({
      ...prev,
      [roleId]: isNaN(num) ? 0 : num,
    }));
  };

  const handleResetPassword = () => {
    const newPass = generateUniquePassword('TM');
    setPassword(newPass);
    setMustChangePassword(true);
  };

  const handleCopyPassword = () => {
    navigator.clipboard.writeText(password);
    setCopiedPass(true);
    setTimeout(() => setCopiedPass(false), 2000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = sanitizePhone(phone);
    if (!name.trim() || !cleanPhone) return;

    // Tier is derived from the services ticked rather than picked by hand — the
    // roster and Post-Production screens still read it.
    // Drop ids pointing at services that no longer exist (e.g. roles retired in
    // Settings), so the assignment count and derived tier stay honest.
    const liveRoleIds = assignedRoleIds.filter(id => availableRoles.some(r => r.id === id));
    const derivedCategories = categoriesFromAssignments(liveRoleIds, availableRoles, roleGroups);

    // Display title is automatically the functional tier category / categories
    const displayRole = getTeamMemberDisplayTitle(
      { ...member, categories: derivedCategories, category: derivedCategories[0] },
      studioSettings?.tierCategories
    );

    // Determine representative daily rate from assigned roles or first selected category role
    // A salaried member's per-job rate is a known zero, never the 15,000 fallback.
    // A salaried member's per-job rate is a known zero, and no leftover rate-card
    // figure may override it — that is the double-charge this whole flag prevents.
    let representativeRate = payType === 'salaried' ? 0 : member.ratePerDay || 15000;
    if (payType !== 'salaried') {
      if (liveRoleIds.length > 0 && rolePayoutRates[liveRoleIds[0]] !== undefined) {
        representativeRate = rolePayoutRates[liveRoleIds[0]];
      } else if (availableRoles.length > 0 && rolePayoutRates[availableRoles[0].id] !== undefined) {
        representativeRate = rolePayoutRates[availableRoles[0].id];
      }
    }

    // Build synchronized itemPayoutRates for catalog items linked to these roles
    const syncedItemPayouts: Record<string, number> = { ...(member.itemPayoutRates || {}) };
    catalogItems.forEach(item => {
      if (item.linkedRoleIds && item.linkedRoleIds.length > 0) {
        const matchingRoleId = item.linkedRoleIds.find(rId => rolePayoutRates[rId] !== undefined);
        if (matchingRoleId) {
          syncedItemPayouts[item.id] = payType === 'salaried' ? 0 : rolePayoutRates[matchingRoleId];
        }
      }
    });

    const isFullCoverage = rolePayoutRates['role-full-coverage'] !== undefined;
    const isAlbumDesigner = rolePayoutRates['role-album-designer'] !== undefined;

    onSave({
      ...member,
      name: name.trim(),
      role: displayRole,
      assignedRoleIds: liveRoleIds.length > 0 ? liveRoleIds : undefined,
      category: derivedCategories[0],
      categories: derivedCategories,
      phone: cleanPhone,
      password: password.trim() || member.password,
      unavailablePeriods,
      mustChangePassword,
      ratePerDay: representativeRate,
      rateCard: {
        ...member.rateCard,
        rateOver6Hours: representativeRate,
        rateUnder6Hours: Math.round(representativeRate * 0.6),
        flatEventRate: representativeRate,
        flatVideoRate: representativeRate,
        hourlyRawDataRate: isFullCoverage ? rolePayoutRates['role-full-coverage'] : member.rateCard?.hourlyRawDataRate,
        albumDesignPerSheetRate: isAlbumDesigner ? rolePayoutRates['role-album-designer'] : member.rateCard?.albumDesignPerSheetRate,
      },
      hourlyRawDataCostRate: isFullCoverage ? rolePayoutRates['role-full-coverage'] : member.hourlyRawDataCostRate,
      albumDesignCostPerSheet: isAlbumDesigner ? rolePayoutRates['role-album-designer'] : member.albumDesignCostPerSheet,
      rolePayoutRates: payType === 'salaried'
        ? Object.fromEntries(Object.keys(rolePayoutRates).map(k => [k, 0]))
        : rolePayoutRates,
      itemPayoutRates: Object.keys(syncedItemPayouts).length > 0 ? syncedItemPayouts : undefined,
      payType,
      monthlySalary: payType === 'salaried' ? monthlySalary || undefined : undefined,
      bio: bio.trim() || '',
      active,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div
        id="modal-edit-team-member"
        className="w-full max-w-2xl bg-white border border-[#d4c1a3] rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#d4c1a3] bg-[#f9f8f6]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#d4c1a3] text-[#7a2e33] flex items-center justify-center font-bold">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-bold text-[#111417]">Edit Team Member</h3>
              <p className="text-xs text-[#6b6660]">Assign the services {member.name} performs and their pay rate for each</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#6b6660] hover:text-[#111417] hover:bg-[#d4c1a3]/50 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[78vh] overflow-y-auto">
          {/* Member Basic Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#111417] mb-1">
                Full Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#d4c1a3] bg-[#f9f8f6]/50 text-xs font-semibold text-[#111417] focus:outline-none focus:border-[#7a2e33]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#111417] mb-1">
                Phone Number (WhatsApp Login) *
              </label>
              <input
                type="text"
                required
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#d4c1a3] bg-[#f9f8f6]/50 text-xs font-mono font-semibold text-[#111417] focus:outline-none focus:border-[#7a2e33]"
              />
            </div>
          </div>

          {/* How this person is paid. Salaried staff have no per-job cost — the
              wage is already spent — so the rate card below is switched off for
              them rather than left showing figures nobody will ever be paid. */}
          <div className="p-3.5 bg-[#f9f8f6] rounded-xl border border-[#d4c1a3] space-y-3">
            <label className="text-xs font-bold text-[#111417] flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-[#7a2e33]" />
              How is {name.trim() || 'this member'} paid?
            </label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { id: 'per_event' as const, label: 'Per event / deliverable', blurb: 'Paid from the rate card below' },
                { id: 'salaried' as const, label: 'Monthly salary', blurb: 'Fixed wage, no per-job payout' },
              ]).map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPayType(opt.id)}
                  className={`px-3 py-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    payType === opt.id
                      ? 'bg-[#7a2e33] border-[#7a2e33] text-[#f9f8f6]'
                      : 'bg-white border-[#d4c1a3] hover:border-[#7a2e33]'
                  }`}
                >
                  <span className={`block text-[11px] font-bold ${payType === opt.id ? 'text-[#f9f8f6]' : 'text-[#111417]'}`}>
                    {opt.label}
                  </span>
                  <span className={`block text-[10px] mt-0.5 ${payType === opt.id ? 'text-[#d4c1a3]' : 'text-[#6b6660]'}`}>
                    {opt.blurb}
                  </span>
                </button>
              ))}
            </div>
            {payType === 'salaried' && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[#6b6660]">
                  Monthly salary
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#7a2e33]">₹</span>
                  <input
                    type="number"
                    min={0}
                    value={monthlySalary || ''}
                    onChange={e => setMonthlySalary(Number(e.target.value) || 0)}
                    placeholder="e.g. 35000"
                    className="w-full pl-7 pr-3 py-2 rounded-xl border border-[#d4c1a3] bg-white text-xs font-semibold text-[#111417] focus:outline-none focus:border-[#7a2e33]"
                  />
                </div>
                <p className="text-[10px] text-[#6b6660]">
                  Every event and deliverable they touch is costed at ₹0, so their pay is
                  never counted twice. Tick the services they perform below — that is what
                  puts them on the Events or Deliverables roster.
                </p>
              </div>
            )}
          </div>

          {/* Services this member performs, and what they are paid for each. */}
          <TeamRoleRatesPanel
            idPrefix="edit"
            assignedRoleIds={assignedRoleIds}
            rolePayoutRates={rolePayoutRates}
            onToggleRole={handleToggleRoleAssignment}
            onChangeRate={handleRolePayoutChange}
            hideRates={payType === 'salaried'}
          />

          {/* Unavailable dates — leave, outside commitments, anything that stops work */}
          <div className="p-3.5 bg-[#f9f8f6] rounded-xl border border-[#d4c1a3] space-y-2.5">
            <label className="text-xs font-bold text-[#111417] flex items-center gap-1.5">
              <CalendarOff className="w-3.5 h-3.5 text-[#7a2e33]" />
              Unavailable Dates
            </label>
            <p className="text-[10px] text-[#6b6660] leading-snug">
              Days this person is not working. Delivery forecasts skip them, so recording leave here
              pushes their dates out instead of quietly assuming the work still fits.
            </p>

            {unavailablePeriods.length > 0 && (
              <div className="space-y-1.5">
                {unavailablePeriods.map(p => (
                  <div key={p.id} className="flex items-center justify-between gap-2 bg-white border border-[#d4c1a3] rounded-lg px-2.5 py-1.5">
                    <div className="text-[11px] text-[#111417]">
                      <span className="font-bold">{p.from}</span> to <span className="font-bold">{p.to}</span>
                      {p.reason && <span className="text-[#6b6660]"> · {p.reason}</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => setUnavailablePeriods(list => list.filter(x => x.id !== p.id))}
                      className="text-rose-700 hover:text-rose-900 cursor-pointer"
                      aria-label="Remove this period"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <input
                type="date"
                value={leaveFrom}
                onChange={e => setLeaveFrom(e.target.value)}
                className="px-2.5 py-1.5 bg-white rounded-lg border border-[#d4c1a3] text-[11px] text-[#111417] focus:outline-none focus:border-[#7a2e33]"
              />
              <input
                type="date"
                value={leaveTo}
                onChange={e => setLeaveTo(e.target.value)}
                className="px-2.5 py-1.5 bg-white rounded-lg border border-[#d4c1a3] text-[11px] text-[#111417] focus:outline-none focus:border-[#7a2e33]"
              />
              <input
                type="text"
                placeholder="Reason (optional)"
                value={leaveReason}
                onChange={e => setLeaveReason(e.target.value)}
                className="px-2.5 py-1.5 bg-white rounded-lg border border-[#d4c1a3] text-[11px] text-[#111417] focus:outline-none focus:border-[#7a2e33]"
              />
              <button
                type="button"
                disabled={!leaveFrom || !leaveTo || leaveTo < leaveFrom}
                onClick={() => {
                  setUnavailablePeriods(list => [
                    ...list,
                    { id: `ua-${Date.now()}`, from: leaveFrom, to: leaveTo, reason: leaveReason.trim() || undefined },
                  ]);
                  setLeaveFrom('');
                  setLeaveTo('');
                  setLeaveReason('');
                }}
                className="px-2.5 py-1.5 rounded-lg bg-[#7a2e33] text-[#f9f8f6] text-[11px] font-bold hover:bg-[#5a2226] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Add Period
              </button>
            </div>
            {leaveFrom && leaveTo && leaveTo < leaveFrom && (
              <p className="text-[10px] font-semibold text-rose-700">End date is before the start date.</p>
            )}
          </div>

          {/* Access Password & Status */}
          <div className="p-3.5 bg-[#f9f8f6] rounded-xl border border-[#d4c1a3] space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#111417] flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-[#7a2e33]" />
                Access Password
              </label>
              <button
                type="button"
                onClick={handleResetPassword}
                className="text-[11px] font-bold text-[#7a2e33] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                Reset Key
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="flex-1 px-3 py-2 bg-white rounded-lg border border-[#d4c1a3] font-mono text-xs font-bold text-[#111417] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCopyPassword}
                className="px-3 py-2 bg-[#7a2e33] hover:bg-[#5a2226] text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
              >
                {copiedPass ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedPass ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Bio / Gear Summary */}
          <div>
            <label className="block text-xs font-bold text-[#111417] mb-1">
              Bio / Gear Summary (Optional)
            </label>
            <textarea
              rows={2}
              value={bio}
              onChange={e => setBio(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-[#d4c1a3] bg-[#f9f8f6]/50 text-xs text-[#111417] focus:outline-none focus:border-[#7a2e33]"
              placeholder="e.g. Sony FX3 + A7S III, G Master primes, DJI Ronin RS3..."
            />
          </div>

          {/* Active / Inactive Switch */}
          <div className="flex items-center justify-between p-3 rounded-xl border border-[#d4c1a3] bg-[#f9f8f6]/40">
            <div>
              <span className="text-xs font-bold text-[#111417] block">Member Active Status</span>
              <span className="text-[11px] text-[#6b6660]">Inactive members are hidden from active project crew assignment pickers</span>
            </div>
            <button
              type="button"
              onClick={() => setActive(!active)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                active
                  ? 'bg-[#0b1f3b] text-white'
                  : 'bg-stone-200 text-stone-700'
              }`}
            >
              {active ? 'Active' : 'Inactive'}
            </button>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#d4c1a3]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-[#6b6660] hover:text-[#111417] hover:bg-[#d4c1a3]/30 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 text-xs font-bold text-[#f9f8f6] bg-[#7a2e33] hover:bg-[#5a2226] rounded-xl transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
