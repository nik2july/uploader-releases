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
import {
  X,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  Clock,
  Layers,
  Save,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';

import { saveCrewRolesSettings } from '../../lib/studioRepository';

interface DeliverablesEffortSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

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

export const DeliverablesEffortSidePanel: React.FC<DeliverablesEffortSidePanelProps> = ({
  isOpen,
  onClose,
}) => {
  const { studioSettings } = useApp();

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

  // Local draft state of services
  const [servicesDraft, setServicesDraft] = useState<CrewRoleConfig[]>(initialServices);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(deliverableGroups.map(g => [g.id, true]))
  );
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Sync draft when initialServices changes if not modified
  React.useEffect(() => {
    setServicesDraft(initialServices);
  }, [initialServices]);

  if (!isOpen) return null;

  const handleUpdateServiceField = (
    serviceId: string,
    field: keyof CrewRoleConfig,
    value: any
  ) => {
    setServicesDraft(prev =>
      prev.map(s => {
        if (s.id !== serviceId) return s;
        const updated = { ...s, [field]: value };
        
        // If updating effort per unit or quantity, compute estimatedEffortHours
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
    setSavedSuccess(false);
  };

  const handleSaveAll = async () => {
    try {
      setIsSaving(true);
      await saveCrewRolesSettings(servicesDraft);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err) {
      console.error('Failed to save deliverables effort settings:', err);
      alert('Failed to save settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-[#ffffff] w-full max-w-2xl h-full shadow-2xl flex flex-col border-l border-[#d4c1a3]">
        {/* Header */}
        <div className="px-6 py-4 bg-[#f9f8f6] border-b border-[#d4c1a3] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#7a2e33] text-white flex items-center justify-center shadow-xs">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold font-serif text-[#111417]">
                Deliverables & Editing Effort
              </h3>
              <p className="text-[11px] text-[#6b6660]">
                Linked directly to Quotation Builder deliverables. Configure editing effort in hours with respect to measurements.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[#6b6660] hover:text-[#7a2e33] rounded-xl hover:bg-stone-100 transition-colors cursor-pointer"
            title="Close Panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Informative Banner */}
        <div className="px-6 py-3 bg-amber-50/70 border-b border-amber-200/60 text-xs text-amber-900 flex items-start gap-2">
          <HelpCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed">
            These effort standards determine realistic editor due dates and capacity forecasts when assigning jobs. Selling prices are hidden here so you can focus strictly on production workload and turnaround.
          </p>
        </div>

        {/* Body: Deliverable Groups and Items */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {deliverableGroups.length === 0 ? (
            <div className="p-8 text-center bg-[#f9f8f6] border border-dashed border-[#d4c1a3] rounded-2xl text-xs text-[#6b6660]">
              No deliverable groups found in Quotation Settings.
            </div>
          ) : (
            deliverableGroups.map(group => {
              const services = servicesInGroup(servicesDraft, group.id);
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
                    className="flex items-center justify-between px-4 py-3 bg-[#f9f8f6] border-b border-[#d4c1a3]/60 cursor-pointer select-none hover:bg-[#f2efe9] transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[#6b6660]">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </span>
                      <span className="text-xs font-bold text-[#111417] tracking-tight">
                        {group.name}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#d4c1a3]/50 text-[#7a2e33] font-semibold">
                        {services.length} deliverable{services.length === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>

                  {/* Group Items */}
                  {isExpanded && (
                    <div className="p-4 space-y-4 divide-y divide-[#d4c1a3]/40">
                      {services.length === 0 ? (
                        <p className="text-xs text-[#6b6660] italic py-2">
                          No services added under this group yet.
                        </p>
                      ) : (
                        services.map(service => {
                          const currentBasis = service.postProductionBasis || 'per_output_minute';
                          const basisMeta = MEASUREMENT_OPTIONS.find(o => o.value === currentBasis) || MEASUREMENT_OPTIONS[0];

                          return (
                            <div key={service.id} className="pt-3 first:pt-0 space-y-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <span className="text-xs font-bold text-[#111417]">
                                    {service.name}
                                  </span>
                                  {service.internalCode && (
                                    <span className="ml-2 font-mono text-[9px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">
                                      {service.internalCode}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Measurement & Effort Configuration Grid */}
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[#f9f8f6]/70 p-3 rounded-xl border border-[#d4c1a3]/60 text-xs">
                                {/* Measurement Basis */}
                                <div>
                                  <label className="block text-[10px] font-bold text-[#6b6660] uppercase mb-1">
                                    Measurement Basis
                                  </label>
                                  <select
                                    value={currentBasis}
                                    onChange={e =>
                                      handleUpdateServiceField(
                                        service.id,
                                        'postProductionBasis',
                                        e.target.value as FreelancePricingBasis
                                      )
                                    }
                                    className="w-full px-2.5 py-1.5 bg-white border border-[#d4c1a3] rounded-lg text-xs font-medium text-[#111417] focus:outline-none focus:border-[#7a2e33]"
                                  >
                                    {MEASUREMENT_OPTIONS.map(opt => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                {/* Effort Hours per Measurement Unit */}
                                <div>
                                  <label className="block text-[10px] font-bold text-[#6b6660] uppercase mb-1">
                                    Effort (Hrs / Unit)
                                  </label>
                                  <div className="relative">
                                    <input
                                      type="number"
                                      step="0.25"
                                      min="0"
                                      placeholder="e.g. 1.5"
                                      value={
                                        service.editingEffortHoursPerUnit !== undefined
                                          ? service.editingEffortHoursPerUnit
                                          : ''
                                      }
                                      onChange={e =>
                                        handleUpdateServiceField(
                                          service.id,
                                          'editingEffortHoursPerUnit',
                                          e.target.value === '' ? undefined : Number(e.target.value)
                                        )
                                      }
                                      className="w-full px-2.5 py-1.5 bg-white border border-[#d4c1a3] rounded-lg text-xs font-bold text-[#111417] focus:outline-none focus:border-[#7a2e33]"
                                    />
                                  </div>
                                  <span className="block text-[9px] text-[#6b6660] mt-0.5 truncate">
                                    {basisMeta.unitSuffix}
                                  </span>
                                </div>

                                {/* Default Quantity / Units */}
                                <div>
                                  <label className="block text-[10px] font-bold text-[#6b6660] uppercase mb-1">
                                    Default Quantity
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    placeholder={currentBasis === 'per_output_minute' ? 'e.g. 5 min' : 'e.g. 40 sheets'}
                                    value={
                                      service.defaultQuantity !== undefined
                                        ? service.defaultQuantity
                                        : ''
                                    }
                                    onChange={e =>
                                      handleUpdateServiceField(
                                        service.id,
                                        'defaultQuantity',
                                        e.target.value === '' ? undefined : Number(e.target.value)
                                      )
                                    }
                                    className="w-full px-2.5 py-1.5 bg-white border border-[#d4c1a3] rounded-lg text-xs font-semibold text-[#111417] focus:outline-none focus:border-[#7a2e33]"
                                  />
                                  <span className="block text-[9px] text-[#6b6660] mt-0.5 truncate">
                                    standard deliverable size
                                  </span>
                                </div>
                              </div>

                              {/* Secondary details: Total Effort Hours & Turnaround */}
                              <div className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-[#d4c1a3]/40 text-xs">
                                <div className="flex items-center gap-1.5 text-[#6b6660]">
                                  <Clock className="w-3.5 h-3.5 text-[#7a2e33]" />
                                  <span className="text-[11px]">
                                    Estimated Project Effort:{' '}
                                    <strong className="text-[#111417]">
                                      {service.estimatedEffortHours !== undefined
                                        ? `${service.estimatedEffortHours} hrs`
                                        : 'Not estimated'}
                                    </strong>
                                  </span>
                                </div>

                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-[#6b6660] font-bold uppercase">
                                    Editor Cost Rate:
                                  </span>
                                  <input
                                    type="number"
                                    min="0"
                                    placeholder="₹ / unit"
                                    value={
                                      service.defaultCostRate !== undefined
                                        ? service.defaultCostRate
                                        : ''
                                    }
                                    onChange={e =>
                                      handleUpdateServiceField(
                                        service.id,
                                        'defaultCostRate',
                                        e.target.value === '' ? undefined : Number(e.target.value)
                                      )
                                    }
                                    className="w-24 px-2 py-1 bg-[#f9f8f6] border border-[#d4c1a3] rounded text-xs font-bold text-[#111417] text-right focus:outline-none focus:border-[#7a2e33]"
                                  />
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
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#f9f8f6] border-t border-[#d4c1a3] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {savedSuccess && (
              <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4" />
                Effort settings saved & synced
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white border border-[#d4c1a3] hover:bg-stone-50 text-[#111417] text-xs font-bold rounded-xl transition-all cursor-pointer"
            >
              Close
            </button>
            <button
              onClick={handleSaveAll}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-5 py-2 bg-[#7a2e33] hover:bg-[#5a2226] text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
