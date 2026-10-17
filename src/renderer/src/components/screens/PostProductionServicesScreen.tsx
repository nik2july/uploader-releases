import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { CrewRoleConfig, StudioRoleGroup } from '../../types';
import { FreelancePricingBasis } from '../../types/freelance';
import { DEFAULT_CREW_ROLES, DEFAULT_ROLE_GROUPS } from '../../data/seedData';
import {
  resolveRoleGroups,
  normaliseServices,
  servicesInGroup,
} from '../../utils/studioRoles';
import { saveCrewRolesSettings } from '../../lib/studioRepository';
import { formatINR } from '../../utils/formatters';
import {
  SlidersHorizontal,
  Search,
  ChevronDown,
  ChevronRight,
  Clock,
  Layers,
  Save,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Film,
  Sparkles,
} from 'lucide-react';

const MEASUREMENT_OPTIONS: { value: FreelancePricingBasis; label: string; unitSuffix: string; effortPrompt: string }[] = [
  {
    value: 'per_raw_hour',
    label: 'Raw Footage Hours (Video)',
    unitSuffix: 'per hour of raw footage',
    effortPrompt: 'Effort hrs per 1 hour of raw data',
  },
  {
    value: 'per_output_minute',
    label: 'Finished Cut Minutes (Trailer/Reel)',
    unitSuffix: 'per minute of finished cut',
    effortPrompt: 'Effort hrs per 1 min of finished cut',
  },
  {
    value: 'per_photo',
    label: 'Curated Photos (Graded/Retouched)',
    unitSuffix: 'per 100 photos',
    effortPrompt: 'Effort hrs per 100 edited photos',
  },
  {
    value: 'per_sheet',
    label: 'Album Sheets (Album Design)',
    unitSuffix: 'per album sheet',
    effortPrompt: 'Effort hrs per sheet',
  },
  {
    value: 'per_item',
    label: 'Per Deliverable Item / Reel',
    unitSuffix: 'per item',
    effortPrompt: 'Effort hrs per item',
  },
  {
    value: 'per_raw_photo',
    label: 'Raw Photos Culling',
    unitSuffix: 'per 1,000 raw clicks',
    effortPrompt: 'Effort hrs per 1,000 raw clicks',
  },
];

export function PostProductionServicesScreen(): React.JSX.Element {
  const { studioSettings, freelanceJobs } = useApp();
  const [searchQuery, setSearchQuery] = useState('');

  const allGroups = useMemo(
    () => resolveRoleGroups(studioSettings?.roleGroups || DEFAULT_ROLE_GROUPS),
    [studioSettings?.roleGroups]
  );

  const deliverableGroups = useMemo(
    () => allGroups.filter(g => g.kind === 'deliverable' && g.active !== false),
    [allGroups]
  );

  const initialServices = useMemo(() => {
    const saved =
      studioSettings?.crewRoles && studioSettings.crewRoles.length > 0
        ? studioSettings.crewRoles
        : DEFAULT_CREW_ROLES;
    return normaliseServices(saved, allGroups);
  }, [studioSettings?.crewRoles, allGroups]);

  const [servicesDraft, setServicesDraft] = useState<CrewRoleConfig[]>(initialServices);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(deliverableGroups.map(g => [g.id, true]))
  );
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  React.useEffect(() => {
    setServicesDraft(initialServices);
    setIsDirty(false);
  }, [initialServices]);

  const handleUpdateField = (
    serviceId: string,
    field: keyof CrewRoleConfig,
    value: any
  ) => {
    setServicesDraft(prev =>
      prev.map(s => {
        if (s.id !== serviceId) return s;
        const updated = { ...s, [field]: value };

        if (field === 'editingEffortHoursPerUnit' || field === 'defaultQuantity') {
          const effortPerUnit = field === 'editingEffortHoursPerUnit' ? Number(value) || 0 : Number(updated.editingEffortHoursPerUnit) || 0;
          const qty = field === 'defaultQuantity' ? Number(value) || 0 : Number(updated.defaultQuantity) || 0;
          if (effortPerUnit > 0) {
            const multiplier = updated.postProductionBasis === 'per_photo' ? (qty / 100) : updated.postProductionBasis === 'per_raw_photo' ? (qty / 1000) : qty || 1;
            updated.estimatedEffortHours = Math.round(effortPerUnit * (multiplier > 0 ? multiplier : 1) * 10) / 10;
          }
        }
        return updated;
      })
    );
    setIsDirty(true);
    setSavedSuccess(false);
  };

  const handleSaveAll = async () => {
    try {
      setIsSaving(true);
      await saveCrewRolesSettings(servicesDraft);
      setSavedSuccess(true);
      setIsDirty(false);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save deliverables effort settings:', err);
      alert('Failed to save settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const totalServicesCount = servicesDraft.length;
  const activeJobsTotal = freelanceJobs.filter(j => j.stage !== 'completed').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold font-serif text-[#111417]">Services & Deliverables</h2>
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-full bg-[#d4c1a3]/40 text-[#7a2e33] border border-[#d4c1a3]">
              {totalServicesCount} Deliverables
            </span>
          </div>
          <p className="text-xs text-[#6b6660] mt-0.5">
            Configure post-production deliverable categories, measurement units, turnaround effort standards, and rates.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {savedSuccess && (
            <div className="flex items-center gap-1 text-xs text-emerald-700 font-bold bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
              <CheckCircle2 className="w-4 h-4" />
              <span>Saved Successfully</span>
            </div>
          )}

          <button
            type="button"
            disabled={isSaving || !isDirty}
            onClick={handleSaveAll}
            className="flex items-center gap-2 px-4 py-2 bg-[#7a2e33] hover:bg-[#5a2226] text-white text-xs font-bold rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Saving Changes...' : 'Save Deliverables'}</span>
          </button>
        </div>
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#d4c1a3] shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#6b6660]">
              Configured Deliverables
            </span>
            <Film className="w-4 h-4 text-[#7a2e33]" />
          </div>
          <div className="text-2xl font-extrabold text-[#111417] mt-1">
            {totalServicesCount}
          </div>
          <div className="text-[11px] text-[#6b6660] mt-0.5">
            Across {deliverableGroups.length} categories
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#d4c1a3] shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#6b6660]">
              Active Work In Progress
            </span>
            <Clock className="w-4 h-4 text-amber-700" />
          </div>
          <div className="text-2xl font-extrabold text-[#111417] mt-1">
            {activeJobsTotal}
          </div>
          <div className="text-[11px] text-[#6b6660] mt-0.5">
            Deliverables currently assigned or in edit
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#d4c1a3] shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#6b6660]">
              Effort Forecasting
            </span>
            <Sparkles className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-800 mt-1">
            Active
          </div>
          <div className="text-[11px] text-[#6b6660] mt-0.5">
            Automated queue turnaround calculator
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-xl p-3 border border-[#d4c1a3] shadow-2xs flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-[#6b6660]" />
          <input
            type="text"
            placeholder="Search deliverable service by name or code..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 bg-[#f9f8f6] border border-[#d4c1a3] rounded-xl text-xs font-medium text-[#111417] placeholder:text-[#6b6660]/70 focus:outline-none focus:border-[#7a2e33] focus:bg-white transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-xs text-[#6b6660] hover:text-[#111417]"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Deliverable Groups Accordions */}
      <div className="space-y-4">
        {deliverableGroups.map(group => {
          let services = servicesInGroup(servicesDraft, group.id);
          if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            services = services.filter(
              s => s.name.toLowerCase().includes(q) || (s.internalCode || '').toLowerCase().includes(q)
            );
          }
          if (services.length === 0 && searchQuery.trim()) return null;

          const isExpanded = Boolean(expandedGroups[group.id]);

          return (
            <div
              key={group.id}
              className="bg-white border border-[#d4c1a3] rounded-2xl shadow-2xs overflow-hidden"
            >
              {/* Group Header */}
              <div
                onClick={() =>
                  setExpandedGroups(prev => ({ ...prev, [group.id]: !isExpanded }))
                }
                className="flex items-center justify-between px-5 py-3.5 bg-[#f9f8f6] border-b border-[#d4c1a3]/60 cursor-pointer select-none hover:bg-[#f2efe9] transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-[#6b6660]">
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </span>
                  <span className="text-sm font-bold text-[#111417]">
                    {group.name}
                  </span>
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-[#d4c1a3]/50 text-[#7a2e33] font-bold">
                    {services.length} deliverable{services.length === 1 ? '' : 's'}
                  </span>
                </div>
              </div>

              {/* Group Services List */}
              {isExpanded && (
                <div className="p-5 space-y-4 divide-y divide-[#d4c1a3]/40">
                  {services.length === 0 ? (
                    <p className="text-xs text-[#6b6660] italic py-2">
                      No services under this category.
                    </p>
                  ) : (
                    services.map(service => {
                      const currentBasis = service.postProductionBasis || 'per_output_minute';
                      const basisMeta = MEASUREMENT_OPTIONS.find(o => o.value === currentBasis) || MEASUREMENT_OPTIONS[0];
                      const activeJobCount = freelanceJobs.filter(
                        j => j.serviceType === service.name && j.stage !== 'completed'
                      ).length;

                      return (
                        <div key={service.id} className="pt-4 first:pt-0 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-[#111417]">
                                {service.name}
                              </span>
                              {service.internalCode && (
                                <span className="font-mono text-[9px] px-2 py-0.5 rounded bg-stone-100 text-stone-700 font-bold border border-stone-200">
                                  {service.internalCode}
                                </span>
                              )}
                              {activeJobCount > 0 && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                                  {activeJobCount} active work{activeJobCount === 1 ? '' : 's'}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Controls Grid */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[#f9f8f6]/70 p-3.5 rounded-xl border border-[#d4c1a3]/60 text-xs">
                            {/* Measurement Basis */}
                            <div>
                              <label className="block text-[10px] font-bold text-[#6b6660] uppercase mb-1">
                                Measurement Basis
                              </label>
                              <select
                                value={currentBasis}
                                onChange={e =>
                                  handleUpdateField(
                                    service.id,
                                    'postProductionBasis',
                                    e.target.value as FreelancePricingBasis
                                  )
                                }
                                className="w-full px-2.5 py-1.5 bg-white border border-[#d4c1a3] rounded-lg text-xs font-semibold text-[#111417] focus:outline-none focus:border-[#7a2e33]"
                              >
                                {MEASUREMENT_OPTIONS.map(opt => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                              <span className="text-[10px] text-[#6b6660] mt-1 block">
                                Measured {basisMeta.unitSuffix}
                              </span>
                            </div>

                            {/* Effort Standard Input */}
                            <div>
                              <label className="block text-[10px] font-bold text-[#6b6660] uppercase mb-1">
                                Standard Effort (Hours)
                              </label>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.5"
                                  placeholder="e.g. 16"
                                  value={service.editingEffortHoursPerUnit ?? ''}
                                  onChange={e =>
                                    handleUpdateField(
                                      service.id,
                                      'editingEffortHoursPerUnit',
                                      e.target.value === '' ? '' : Number(e.target.value)
                                    )
                                  }
                                  className="w-full px-2.5 py-1.5 bg-white border border-[#d4c1a3] rounded-lg text-xs font-bold text-[#111417] focus:outline-none focus:border-[#7a2e33]"
                                />
                                <span className="text-xs font-bold text-[#6b6660]">hrs</span>
                              </div>
                              <span className="text-[10px] text-[#6b6660] mt-1 block">
                                {basisMeta.effortPrompt}
                              </span>
                            </div>

                            {/* Default Quantity & Total Workload */}
                            <div>
                              <label className="block text-[10px] font-bold text-[#6b6660] uppercase mb-1">
                                Default Qty & Total Effort
                              </label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min="1"
                                  placeholder="e.g. 1"
                                  value={service.defaultQuantity ?? 1}
                                  onChange={e =>
                                    handleUpdateField(
                                      service.id,
                                      'defaultQuantity',
                                      e.target.value === '' ? '' : Number(e.target.value)
                                    )
                                  }
                                  className="w-20 px-2.5 py-1.5 bg-white border border-[#d4c1a3] rounded-lg text-xs font-bold text-[#111417] focus:outline-none focus:border-[#7a2e33]"
                                />
                                <div className="text-[11px] text-[#111417]">
                                  = <strong>{service.estimatedEffortHours ?? 0} hrs</strong> work
                                </div>
                              </div>
                              <span className="text-[10px] text-[#6b6660] mt-1 block">
                                Used for queue forecasting
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
