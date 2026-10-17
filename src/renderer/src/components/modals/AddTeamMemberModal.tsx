import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { TeamRoleRatesPanel } from './TeamRoleRatesPanel';
import { categoriesFromAssignments, normaliseServices, resolveRoleGroups } from '../../utils/studioRoles';
import { TeamMember, TeamTierCategory, CrewRoleConfig, ProductionCatalogItem } from '../../types';
import { X, UserPlus, KeyRound, RefreshCw, Copy, Check, Layers, CheckCircle2, Circle, Wallet } from 'lucide-react';
import { generateUniquePassword, sanitizePhone, getTeamMemberDisplayTitle, getCategoryMeta, formatINR } from '../../utils/formatters';
import { DEFAULT_CREW_ROLES, DEFAULT_PRODUCTION_CATALOG, DEFAULT_TIER_CATEGORIES } from '../../data/seedData';

interface AddTeamMemberModalProps {
  onClose: () => void;
  onSuccess?: (newMember: TeamMember) => void;
  defaultRole?: string;
  defaultCategory?: TeamTierCategory;
}

export const AddTeamMemberModal: React.FC<AddTeamMemberModalProps> = ({
  onClose,
  onSuccess,
  defaultRole = 'Lead Candid Photographer',
  defaultCategory = 'production',
}) => {
  const { addTeamMember, studioSettings, studioPriceList } = useApp();

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

  // Multiple Functional Tier Categories Selection (ensure initial category is valid)
  const initialValidCategory = validCategoryIds.includes(defaultCategory)
    ? defaultCategory
    : (validCategoryIds[0] || 'production');

  const [categories, setCategories] = useState<TeamTierCategory[]>([initialValidCategory]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState(() => generateUniquePassword('TM'));
  const [copiedPass, setCopiedPass] = useState(false);
  const [bio, setBio] = useState('');
  const [payType, setPayType] = useState<'per_event' | 'salaried'>('per_event');
  const [monthlySalary, setMonthlySalary] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Multi-role assignment state across selected categories
  const [assignedRoleIds, setAssignedRoleIds] = useState<string[]>(() => {
    const matched = availableRoles.find(r => r.name.toLowerCase() === defaultRole.toLowerCase() && r.category === initialValidCategory);
    if (matched) return [matched.id];
    const firstCatRole = availableRoles.find(r => r.category === initialValidCategory);
    return firstCatRole ? [firstCatRole.id] : (availableRoles[0] ? [availableRoles[0].id] : []);
  });

  // Role-Level Cost & Payout Rates: roleId -> member's custom cost/pay rate
  const [rolePayoutRates, setRolePayoutRates] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    availableRoles.forEach(r => {
      if (r.defaultRate) {
        initial[r.id] = r.defaultRate;
      } else if (r.clientBillingRate) {
        initial[r.id] = Math.round(r.clientBillingRate * 0.6);
      } else {
        initial[r.id] = 12000;
      }
    });
    return initial;
  });



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

  const handleRegeneratePassword = () => {
    setPassword(generateUniquePassword('TM'));
  };

  const handleCopyPassword = () => {
    navigator.clipboard.writeText(password);
    setCopiedPass(true);
    setTimeout(() => setCopiedPass(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = sanitizePhone(phone);
    if (!name.trim() || !cleanPhone) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Tier is derived from the services ticked rather than picked by hand — the
      // roster and Post-Production screens still read it.
      // Drop ids pointing at services that no longer exist (e.g. roles retired in
      // Settings), so the assignment count and derived tier stay honest.
      const liveRoleIds = assignedRoleIds.filter(id => availableRoles.some(r => r.id === id));
      const derivedCategories = categoriesFromAssignments(liveRoleIds, availableRoles, roleGroups);

      // Display title is automatically the functional tier category / categories
      const displayRole = getTeamMemberDisplayTitle(
        { id: 0, name, phone, password, active: true, categories: derivedCategories, category: derivedCategories[0], role: '' },
        studioSettings?.tierCategories
      );

      // Determine representative daily rate
      // Salaried staff cost nothing per job; no rate-card leftover may override it.
      let representativeRate = payType === 'salaried' ? 0 : 15000;
      if (payType !== 'salaried') {
        if (liveRoleIds.length > 0 && rolePayoutRates[liveRoleIds[0]] !== undefined) {
          representativeRate = rolePayoutRates[liveRoleIds[0]];
        } else if (availableRoles.length > 0 && rolePayoutRates[availableRoles[0].id] !== undefined) {
          representativeRate = rolePayoutRates[availableRoles[0].id];
        }
      }

      // Build synchronized itemPayoutRates for catalog items
      const syncedItemPayouts: Record<string, number> = {};
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

      const created = await addTeamMember({
        name: name.trim(),
        role: displayRole,
        assignedRoleIds: liveRoleIds.length > 0 ? liveRoleIds : undefined,
        category: derivedCategories[0],
        categories: derivedCategories,
        phone: cleanPhone,
        payType,
        monthlySalary: payType === 'salaried' ? monthlySalary || undefined : undefined,
        ratePerDay: representativeRate,
        rateCard: {
          rateOver6Hours: representativeRate,
          rateUnder6Hours: Math.round(representativeRate * 0.6),
          flatEventRate: representativeRate,
          flatVideoRate: representativeRate,
          hourlyRawDataRate: isFullCoverage ? rolePayoutRates['role-full-coverage'] : undefined,
          albumDesignPerSheetRate: isAlbumDesigner ? rolePayoutRates['role-album-designer'] : undefined,
        },
        hourlyRawDataCostRate: isFullCoverage ? rolePayoutRates['role-full-coverage'] : undefined,
        albumDesignCostPerSheet: isAlbumDesigner ? rolePayoutRates['role-album-designer'] : undefined,
        rolePayoutRates: payType === 'salaried'
          ? Object.fromEntries(Object.keys(rolePayoutRates).map(k => [k, 0]))
          : rolePayoutRates,
        itemPayoutRates: Object.keys(syncedItemPayouts).length > 0 ? syncedItemPayouts : undefined,
        bio: bio.trim() || undefined,
        password: password.trim() || generateUniquePassword('TM'),
        mustChangePassword: true,
        active: true,
      });

      if (onSuccess) {
        onSuccess(created);
      }
      onClose();
    } catch (err: any) {
      console.error('Failed to add team member:', err);
      setSubmitError(err?.message || 'Failed to add team member');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div
        id="modal-add-team-member"
        className="w-full max-w-2xl bg-white border border-[#d4c1a3] rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#d4c1a3] bg-[#f9f8f6]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#d4c1a3] text-[#7a2e33] flex items-center justify-center font-bold">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-bold text-[#111417]">Add Team Member</h3>
              <p className="text-xs text-[#6b6660]">Assign the services this member performs and their pay rate for each</p>
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
                placeholder="e.g. Kabir Mehta"
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
                placeholder="+919876543210"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#d4c1a3] bg-[#f9f8f6]/50 text-xs font-mono font-semibold text-[#111417] focus:outline-none focus:border-[#7a2e33]"
              />
            </div>
          </div>

          {/* Services this member performs, and what they are paid for each. */}
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

          <TeamRoleRatesPanel
            idPrefix="add"
            assignedRoleIds={assignedRoleIds}
            rolePayoutRates={rolePayoutRates}
            onToggleRole={handleToggleRoleAssignment}
            onChangeRate={handleRolePayoutChange}
            hideRates={payType === 'salaried'}
          />

          {/* Access Password */}
          <div className="p-3.5 bg-[#f9f8f6] rounded-xl border border-[#d4c1a3] space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#111417] flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-[#7a2e33]" />
                Auto-Generated WhatsApp Access Key
              </label>
              <button
                type="button"
                onClick={handleRegeneratePassword}
                className="text-[11px] font-bold text-[#7a2e33] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                Generate New
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
              placeholder="e.g. Sony A7IV + FX3, 24-70mm f/2.8 GM II, DJI RS3 Pro gimbal..."
            />
          </div>

          {submitError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
              {submitError}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#d4c1a3]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-[#6b6660] hover:text-[#111417] hover:bg-[#d4c1a3]/30 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 text-xs font-bold text-[#f9f8f6] bg-[#7a2e33] hover:bg-[#5a2226] rounded-xl transition-colors shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{isSubmitting ? 'Adding...' : 'Add Team Member'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
