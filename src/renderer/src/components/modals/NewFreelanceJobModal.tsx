import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { isDeliverablesTeamMember, isSalariedMember } from '../../utils/freelance';
import { DEFAULT_DAILY_CAPACITY_HOURS } from '../../utils/scheduling';
import { calculateEditorWorkloads } from '../../utils/editorCapacity';
import { useStudioSchedules } from '../../hooks/useStudioSchedules';
import {
  FREELANCE_SERVICES,
  computeBillableUnits,
  computePricingTotal,
  describeBilling,
  isMinimumApplied,
  serviceDefinition,
} from '../../utils/freelancePricing';
import { resolvePostProductionServices } from '../../utils/postProductionServices';
import {
  FreelanceJob,
  FreelanceJobStage,
  FreelancePricing,
  FreelanceServiceType,
} from '../../types';
import { addDaysToDate, formatDate } from '../../utils/formatters';
import { formatInternational } from '../../utils/phone';
import {
  X,
  Briefcase,
  User,
  Phone,
  Link as LinkIcon,
  Calendar,
  CalendarClock,
  IndianRupee,
  FileText,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Film,
} from 'lucide-react';

interface NewFreelanceJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialJob?: FreelanceJob | null;
  /**
   * Start a new job already pointed at this studio — set when the form is opened from
   * that studio's own page, where who the work is for is the one thing already known.
   * Ignored while editing, which takes its studio from the job itself.
   */
  presetClientId?: string;
}

export const NewFreelanceJobModal: React.FC<NewFreelanceJobModalProps> = ({
  isOpen,
  onClose,
  initialJob,
  presetClientId,
}) => {
  const { addFreelanceJob, updateFreelanceJob, team, freelanceClients, freelanceJobs, studioSettings } = useApp();

  const todayStr = new Date().toISOString().split('T')[0];

  const presetClient = presetClientId
    ? freelanceClients.find(c => c.id === presetClientId)
    : undefined;

  const [title, setTitle] = useState(initialJob?.title || '');
  const [freelanceClientId, setFreelanceClientId] = useState<string | undefined>(
    initialJob?.freelanceClientId || presetClient?.id
  );
  const [clientName, setClientName] = useState(initialJob?.clientName || presetClient?.name || '');
  const [clientPhone, setClientPhone] = useState(
    initialJob?.clientPhone || presetClient?.phone || ''
  );
  // Blank on a new job so the category has to be chosen: it is not a label here, it
  // decides how the job is billed, and a pre-selected one would quietly price work
  // by whichever service happened to sit first in the list.
  const [serviceType, setServiceType] = useState<FreelanceServiceType | ''>(
    initialJob?.serviceType || ''
  );

  // Editor Assignment
  // Whether the editor is someone outside the team roster. There is no in-house /
  // freelancer toggle any more: that distinction is a fact about the person, already
  // recorded on their team record as how they are paid, and asking for it again here
  // only created a second answer that could contradict the first.
  const [editorError, setEditorError] = useState('');
  /**
   * Why Save did nothing, said next to Save.
   *
   * The button sits in the footer, outside the scrolling form, so a complaint
   * rendered beside the field it concerns can be scrolled out of sight while the
   * button stays put — which looks exactly like a button that does not work.
   */
  const [formError, setFormError] = useState('');
  const [useManualEditor, setUseManualEditor] = useState(
    Boolean(initialJob && !initialJob.editorMemberId && initialJob.editorName)
  );
  const [editorName, setEditorName] = useState(initialJob?.editorName || '');
  const [editorPhone, setEditorPhone] = useState(initialJob?.editorPhone || '');
  const [editorMemberId, setEditorMemberId] = useState<number | undefined>(
    initialJob?.editorMemberId
  );

  // Commercials — a unit rate and how much of that unit this job carries. The total
  // is derived from the two and never typed, so it can always be checked back.
  const [rate, setRate] = useState<number | ''>(
    initialJob?.pricing?.rate !== undefined ? initialJob.pricing.rate : ''
  );
  /** Whether the rate in the box is the studio's default rather than one typed here. */
  const [rateCameFromCard, setRateCameFromCard] = useState(false);
  const [outputMinutes, setOutputMinutes] = useState<number | ''>(
    initialJob?.pricing?.durationMinutes !== undefined ? initialJob.pricing.durationMinutes : ''
  );
  const [outputSeconds, setOutputSeconds] = useState<number | ''>(
    initialJob?.pricing?.durationSeconds !== undefined ? initialJob.pricing.durationSeconds : ''
  );
  const [rawHours, setRawHours] = useState<number | ''>(
    initialJob?.pricing?.durationHours !== undefined ? initialJob.pricing.durationHours : ''
  );
  const [quantity, setQuantity] = useState<number | ''>(
    initialJob?.pricing?.quantity !== undefined ? initialJob.pricing.quantity : ''
  );
  /**
   * The charge on a job logged under one of the old free-text categories, which has
   * no rate or quantity behind it. Kept editable so opening such a job to fix one
   * field cannot blank the figure it was billed at.
   */
  const [manualCharge, setManualCharge] = useState<number | ''>(
    initialJob && !initialJob.pricing && initialJob.clientCharge !== undefined
      ? initialJob.clientCharge
      : ''
  );

  // Dates & Turnaround
  // Effort is judged by eye from the raw data, and the studio thinks in hours for a
  // quick retouch and days for a full film — so both are accepted and hours stored.
  const [effortUnit, setEffortUnit] = useState<'hours' | 'days'>(
    initialJob?.estimatedEffortHours && initialJob.estimatedEffortHours % 8 === 0 ? 'days' : 'hours'
  );
  const [effortValue, setEffortValue] = useState<number | ''>(() => {
    const hrs = initialJob?.estimatedEffortHours;
    if (typeof hrs !== 'number') return '';
    return hrs % 8 === 0 ? hrs / 8 : hrs;
  });

  const [dataReceivedDate, setDataReceivedDate] = useState(
    initialJob?.dataReceivedDate || todayStr
  );
  const [dueDate, setDueDate] = useState(initialJob?.dueDate || addDaysToDate(todayStr, 7));
  /**
   * Whether the studio has overridden the forecast date.
   *
   * A job already has a date it promised someone, so editing one never quietly moves
   * it; a new one follows the editor's queue until somebody types over it.
   */
  const [dueDateOverridden, setDueDateOverridden] = useState(Boolean(initialJob));

  // Links — only the raw data, which is what exists at this point. Where the edit
  // will be watched is not known until the editor has something to show.
  const [rawDataLink, setRawDataLink] = useState(initialJob?.rawDataLink || '');

  // Notes
  const [description, setDescription] = useState(initialJob?.description || '');
  const [editingInstructions, setEditingInstructions] = useState(
    initialJob?.editingInstructions || ''
  );

  // Left undefined rather than 0 when unset: the scheduler reports unestimated work
  // instead of treating it as taking no time, which would make every date behind it
  // confidently wrong.
  const effortHours =
    effortValue === '' || Number(effortValue) <= 0
      ? undefined
      : effortUnit === 'days'
      ? Number(effortValue) * DEFAULT_DAILY_CAPACITY_HOURS
      : Number(effortValue);

  /**
   * This job laid on top of the work its editor is already holding.
   *
   * The forecast has to include the job being written, not just the saved ones —
   * otherwise it answers "when is the editor free" when the question is "when will
   * this be done". While editing, the saved copy is swapped out for the draft so the
   * job is never queued behind itself.
   */
  /** The studio this job belongs to, when it belongs to one. */
  const selectedStudio = freelanceClientId
    ? freelanceClients.find(c => c.id === freelanceClientId)
    : undefined;

  const scheduleJobId = initialJob?.id || '__draft__';
  const scheduleJobs = useMemo<FreelanceJob[] | undefined>(() => {
    if (useManualEditor || editorMemberId === undefined) return undefined;
    // Only what the forecast actually reads is copied across — the title and client
    // are cosmetic here, and rebuilding every editor's queue on each keystroke of
    // them would be work nobody sees.
    const draft = {
      ...(initialJob || {}),
      id: scheduleJobId,
      editorMemberId,
      estimatedEffortHours: effortHours,
      dataReceivedDate: dataReceivedDate || todayStr,
      stage: (initialJob?.stage || 'data_received') as FreelanceJobStage,
    } as FreelanceJob;
    return [...(freelanceJobs || []).filter(j => j.id !== scheduleJobId), draft];
  }, [
    freelanceJobs,
    initialJob,
    scheduleJobId,
    useManualEditor,
    editorMemberId,
    effortHours,
    dataReceivedDate,
    todayStr,
  ]);

  const schedules = useStudioSchedules({ freelanceJobs: scheduleJobs });

  /** When the editor can start on this and when they would finish, given their queue. */
  const projection = useMemo(() => {
    if (!scheduleJobs || editorMemberId === undefined || effortHours === undefined) return undefined;
    const item = schedules
      .find(s => s.memberId === editorMemberId)
      ?.items.find(i => i.id === `fl:${scheduleJobId}`);
    if (!item?.finishDate) return undefined;
    return { startDate: item.startDate, finishDate: item.finishDate };
  }, [schedules, scheduleJobs, editorMemberId, effortHours, scheduleJobId]);

  /**
   * The date to promise: what the editor's queue says, and a plain week out until
   * there is enough on the job to forecast from.
   */
  const suggestedDueDate =
    projection?.finishDate || addDaysToDate(dataReceivedDate || todayStr, 7);

  useEffect(() => {
    if (!dueDateOverridden && suggestedDueDate) setDueDate(suggestedDueDate);
  }, [suggestedDueDate, dueDateOverridden]);

  /**
   * The rate this studio is normally charged, filled in for them.
   *
   * A figure the studio typed is a decision about this job — a discount, a rush, a
   * renegotiation — so it is never overwritten, and nothing here writes back to the
   * card. But a rate that was only ever filled in from the card is not a decision, and
   * has to follow the service: switching from Long Form to Short Form while an
   * hourly rate sat in the box would have priced minutes at the hourly figure.
   */
  const cardRate = selectedStudio?.rateCard?.[String(serviceType)];
  useEffect(() => {
    if (rate !== '' && !rateCameFromCard) return;
    if (typeof cardRate === 'number' && cardRate > 0) {
      setRate(cardRate);
      setRateCameFromCard(true);
    } else if (rateCameFromCard) {
      // The new service has no agreed rate; clearing is honest, and leaving the old
      // service's number would not be.
      setRate('');
      setRateCameFromCard(false);
    }
  }, [cardRate, rate, rateCameFromCard]);

  if (!isOpen) return null;

  /**
   * Picking a registered studio fills its details in rather than making them be
   * retyped. The name and phone are still written onto the job itself: the job is a
   * financial record that has to stay readable if the studio is later removed from
   * the roster.
   */
  const handleSelectFreelanceClient = (id: string) => {
    if (!id) {
      setFreelanceClientId(undefined);
      return;
    }
    const client = freelanceClients.find(c => c.id === id);
    if (!client) return;
    setFreelanceClientId(id);
    setClientName(client.name);
    setClientPhone(client.phone || '');
  };

  // In-house team selection helper
  const handleSelectEditor = (value: string) => {
    if (value === 'manual') {
      setUseManualEditor(true);
      setEditorMemberId(undefined);
      setEditorName('');
      setEditorPhone('');
      return;
    }
    setUseManualEditor(false);
    if (!value) {
      setEditorMemberId(undefined);
      setEditorName('');
      setEditorPhone('');
      return;
    }
    const member = team.find(m => m.id === Number(value));
    if (!member) return;
    setEditorMemberId(member.id);
    setEditorName(member.name);
    setEditorPhone(member.phone || '');
  };

  const selectedMember =
    !useManualEditor && editorMemberId !== undefined
      ? team.find(m => m.id === editorMemberId)
      : undefined;

  /**
   * How this person is paid decides whether the job carries a cost at all.
   *
   * A member on monthly salary is in-house: the work is already paid for, so nothing
   * is ever remitted against this job. Anyone on per-event or per-deliverable terms
   * is a freelancer for this purpose and gets paid for this job specifically — after
   * it is done, through Payments, which is where the figure is finally settled.
   *
   * A member with no pay basis recorded counts as a freelancer, deliberately. The
   * two ways of being wrong here are not equal: treating an unrecorded person as
   * in-house would silently book their work as free and overstate the margin.
   */
  const costIsCoveredBySalary = isSalariedMember(selectedMember);
  const assignedType: 'in_house' | 'freelancer' = costIsCoveredBySalary ? 'in_house' : 'freelancer';
  const editorAssigned = useManualEditor ? Boolean(editorName.trim()) : selectedMember !== undefined;

  /**
   * Only the deliverables side of the roster can take freelance work — it is
   * post-production by definition, so the shoot crew has no part in it.
   *
   * A member already assigned to this job is kept in the list even if they would
   * not qualify now (their services changed, or the job predates this rule), so
   * opening an old job to edit one field cannot silently drop its editor.
   */
  const assignableEditors = team.filter(
    m => m.active !== false && (isDeliverablesTeamMember(m) || m.id === editorMemberId)
  );

  const workloads = useMemo(
    () => calculateEditorWorkloads(freelanceJobs, team),
    [freelanceJobs, team]
  );
  const workloadMap = useMemo(
    () => new Map(workloads.map(w => [w.memberId, w])),
    [workloads]
  );

  const availableServices = useMemo(() => {
    const resolved = resolvePostProductionServices(studioSettings?.crewRoles);
    return resolved.map(s => ({
      name: s.name,
      basis: s.basis,
      rateSuffix: s.rateSuffix,
      measureLabel: s.measureLabel,
      note: s.note,
      minimumNote: s.minimumNote,
      defaultSellingRate: s.clientBillingRate,
      defaultCostRate: s.defaultCostRate,
      defaultQuantity: s.defaultQuantity,
    }));
  }, [studioSettings?.crewRoles]);

  const serviceOptions = availableServices.map(s => s.name);
  const legacyServiceType =
    serviceType && !serviceOptions.includes(String(serviceType)) ? String(serviceType) : undefined;

  const service = availableServices.find(s => s.name === serviceType) || serviceDefinition(serviceType);

  const handleServiceChange = (newService: string) => {
    setServiceType(newService as FreelanceServiceType);
    const selectedSvc = availableServices.find(s => s.name === newService);
    if (selectedSvc) {
      if (selectedSvc.defaultQuantity !== undefined) {
        if (selectedSvc.basis === 'per_output_minute') {
          setOutputMinutes(selectedSvc.defaultQuantity);
          setOutputSeconds('');
        } else if (selectedSvc.basis === 'per_raw_hour') {
          setRawHours('');
          setOutputMinutes('');
        } else {
          setQuantity(selectedSvc.defaultQuantity);
        }
      }
      if (!selectedStudio?.rateCard?.[newService] && typeof selectedSvc.defaultSellingRate === 'number' && selectedSvc.defaultSellingRate > 0) {
        setRate(selectedSvc.defaultSellingRate);
      }
    }
  };

  const pricingDraft = service
    ? {
        basis: service.basis,
        rate: Number(rate) || 0,
        durationHours: service.basis === 'per_raw_hour' ? Number(rawHours) || 0 : undefined,
        // Long form counts its trailing minutes in the same field short form counts
        // its whole ones — both are "minutes", read against that service's basis.
        durationMinutes: Number(outputMinutes) || 0,
        durationSeconds:
          service.basis === 'per_output_minute' ? Number(outputSeconds) || 0 : undefined,
        quantity:
          service.basis === 'per_photo' || service.basis === 'per_sheet' || service.basis === 'per_item' || service.basis === 'per_raw_photo'
            ? Number(quantity) || 0
            : undefined,
      }
    : undefined;

  const billableUnits = pricingDraft ? computeBillableUnits(pricingDraft) : 0;
  const clientCharge = pricingDraft
    ? computePricingTotal(pricingDraft)
    : Number(manualCharge) || 0;
  const billingLine = pricingDraft ? describeBilling(pricingDraft) : '';
  // Worth saying out loud when it happens, since the client is being charged for
  // more than the job actually measured.
  const minimumApplied = Boolean(pricingDraft && isMinimumApplied(pricingDraft));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setFormError('Give the project a title.');
      return;
    }
    // A studio answers for the name; only a one-off client has to type one.
    if (!selectedStudio && !clientName.trim()) {
      setFormError('Choose a registered studio, or type who this work is billed to.');
      return;
    }
    if (!serviceType) {
      setFormError('Choose a service category — it sets how the job is priced.');
      return;
    }
    // Without an editor there is nobody the work is queued against, so neither the
    // delivery date nor the payout it eventually costs has anything to hang on.
    if (!editorAssigned) {
      setEditorError('Choose who is doing this work.');
      setFormError('Choose who is doing this work, under Editor Execution.');
      return;
    }
    setEditorError('');
    setFormError('');

    const pricing: FreelancePricing | undefined = pricingDraft
      ? { ...pricingDraft, billableUnits }
      : undefined;

    const jobPayload = {
      title: title.trim(),
      // Copied from the studio each time it is saved: the job keeps a readable name
      // and number of its own — it is a financial record that has to survive the
      // studio being removed — but the studio record is what they are copied from.
      clientName: (selectedStudio?.name || clientName).trim(),
      freelanceClientId,
      clientPhone: (selectedStudio?.phone || clientPhone).trim(),
      clientEmail: initialJob?.clientEmail,
      serviceType: serviceType as FreelanceServiceType,
      stage: (initialJob?.stage || 'data_received') as FreelanceJobStage,
      assignedType,
      editorName: editorName.trim() || (assignedType === 'in_house' ? 'In-House Editor' : 'External Freelancer'),
      editorPhone: editorPhone.trim(),
      editorEmail: initialJob?.editorEmail,
      editorMemberId: useManualEditor ? undefined : editorMemberId,
      clientCharge,
      pricing,
      /**
       * What the editor is owed is not decided here. Freelance editors are paid once
       * the job is done, and that payout is logged in Payments against this job —
       * which is also what sets this figure. Asking for it up front only produced a
       * number nobody had agreed yet, that then had to be corrected to match what was
       * actually remitted.
       */
      editorPay: costIsCoveredBySalary ? 0 : initialJob?.editorPay ?? 0,
      estimatedEffortHours: effortHours,
      dataReceivedDate: dataReceivedDate || todayStr,
      dueDate: dueDate || suggestedDueDate,
      rawDataLink: rawDataLink.trim(),
      // Carried through untouched: these are filled in later in the job's life, and
      // this form has no business blanking them.
      deliveryLink: initialJob?.deliveryLink,
      referenceLink: initialJob?.referenceLink,
      draftVideoLink: initialJob?.draftVideoLink,
      finalDeliveryLink: initialJob?.finalDeliveryLink,
      description: description.trim(),
      editingInstructions: editingInstructions.trim(),
      clientPaidAmount: initialJob?.clientPaidAmount || 0,
      clientPaymentStatus: initialJob?.clientPaymentStatus || 'unpaid',
      editorPaidAmount: initialJob?.editorPaidAmount || 0,
      editorPaymentStatus: initialJob?.editorPaymentStatus || 'unpaid',
      clientPayments: initialJob?.clientPayments || [],
      editorPayouts: initialJob?.editorPayouts || [],
    };

    if (initialJob) {
      updateFreelanceJob(initialJob.id, jobPayload, 'Freelance Job Details Updated');
    } else {
      addFreelanceJob(jobPayload);
    }

    onClose();
  };

  const numberFieldClass =
    'w-full px-3.5 py-2.5 bg-[#f9f8f6]/50 border border-[#d4c1a3] rounded-xl text-sm font-bold text-[#111417] focus:outline-none focus:border-[#7a2e33] focus:bg-white transition-all';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-[#f9f8f6] border border-[#d4c1a3] rounded-2xl shadow-2xl overflow-hidden my-8 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4.5 bg-[#7a2e33] text-[#f9f8f6]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <Briefcase className="w-5 h-5 text-[#f9f8f6]" />
            </div>
            <div>
              <h2 className="text-base font-bold font-serif tracking-wide text-white">
                {initialJob ? `Edit Freelance Project #${initialJob.jobCode}` : 'Log New Freelance Work'}
              </h2>
              <p className="text-xs text-[#d4c1a3]">
                Track custom editing projects, what the client is charged, and progress
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Section 1: Project & Client Essentials */}
          <div className="bg-white rounded-xl p-5 border border-[#d4c1a3]/70 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-[#d4c1a3]/40">
              <Sparkles className="w-4 h-4 text-[#7a2e33]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#7a2e33]">
                1. Project & Client Profile
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-[#111417] mb-1">
                  Project Title / Work Identifier *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Aman & Priya - 4K Cinematic Teaser Edit"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#f9f8f6]/50 border border-[#d4c1a3] rounded-xl text-sm font-medium text-[#111417] focus:outline-none focus:border-[#7a2e33] focus:bg-white transition-all"
                />
              </div>

              {freelanceClients.length > 0 && (
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-[#111417] mb-1">
                    Registered Studio
                  </label>
                  <select
                    value={freelanceClientId || ''}
                    onChange={e => handleSelectFreelanceClient(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#f9f8f6]/50 border border-[#d4c1a3] rounded-xl text-sm font-medium text-[#111417] focus:outline-none focus:border-[#7a2e33] focus:bg-white transition-all"
                  >
                    <option value="">-- One-off client (type details below) --</option>
                    {freelanceClients
                      .filter(c => c.active !== false || c.id === freelanceClientId)
                      .map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.city ? ` · ${c.city}` : ''}
                        </option>
                      ))}
                  </select>
                  <p className="text-[10px] text-[#6b6660] mt-1">
                    Linking a studio keeps all their jobs, billing and outstanding balance together.
                  </p>
                </div>
              )}

              {/*
                Only asked for when there is no studio to ask.
                A registered studio already holds the name, the number and the country
                it dials, and that record is what the account, the balance and the bill
                are built on. Repeating it on the job invited an edit here that changed
                nothing anywhere else — two versions of the same studio, and the wrong
                one on the statement.
              */}
              {selectedStudio ? (
                <div className="md:col-span-2 flex flex-wrap items-center gap-x-2 gap-y-1 px-3.5 py-2.5 rounded-xl bg-[#f9f8f6] border border-[#d4c1a3]">
                  <User className="w-4 h-4 text-[#6b6660]" />
                  <span className="text-xs font-bold text-[#111417]">{selectedStudio.name}</span>
                  {selectedStudio.phone && (
                    <span className="text-[11px] text-[#6b6660]">
                      · {formatInternational(selectedStudio.phone, selectedStudio.dialCode)}
                    </span>
                  )}
                  <span className="text-[10px] text-[#6b6660] basis-full">
                    Billed to this studio's account. Change their name or number on their own page.
                  </span>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-[#111417] mb-1">
                      Client / Studio Name *
                    </label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-3 w-4 h-4 text-[#6b6660]" />
                      <input
                        type="text"
                        required
                        placeholder="Client or Partner Studio Name"
                        value={clientName}
                        onChange={e => setClientName(e.target.value)}
                        className="w-full pl-10 pr-3.5 py-2.5 bg-[#f9f8f6]/50 border border-[#d4c1a3] rounded-xl text-sm font-medium text-[#111417] focus:outline-none focus:border-[#7a2e33] focus:bg-white transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#111417] mb-1">
                      Client WhatsApp Phone
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3.5 top-3 w-4 h-4 text-[#6b6660]" />
                      <input
                        type="tel"
                        placeholder="With country code, e.g. +1 514 500 4962"
                        value={clientPhone}
                        onChange={e => setClientPhone(e.target.value)}
                        className="w-full pl-10 pr-3.5 py-2.5 bg-[#f9f8f6]/50 border border-[#d4c1a3] rounded-xl text-sm font-medium text-[#111417] focus:outline-none focus:border-[#7a2e33] focus:bg-white transition-all"
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-[#111417] mb-1">
                  Service Category *
                </label>
                <select
                  required
                  value={serviceType}
                  onChange={e => handleServiceChange(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#f9f8f6]/50 border border-[#d4c1a3] rounded-xl text-sm font-medium text-[#111417] focus:outline-none focus:border-[#7a2e33] focus:bg-white transition-all"
                >
                  <option value="">-- What kind of work is this? --</option>
                  {availableServices.map(s => (
                    <option key={s.name} value={s.name}>
                      {s.name} — charged {s.rateSuffix}
                    </option>
                  ))}
                  {legacyServiceType && (
                    <option value={legacyServiceType}>{legacyServiceType} (old category)</option>
                  )}
                </select>
                <p className="text-[10px] text-[#6b6660] mt-1">
                  This also sets how the job is priced — each service is charged by its own unit.
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Editor Assignment */}
          <div className="bg-white rounded-xl p-5 border border-[#d4c1a3]/70 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#d4c1a3]/40">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#7a2e33]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#7a2e33]">
                  2. Editor Execution & Assignment
                </h3>
              </div>
              {/* The in-house / freelancer split is derived from the selected person's
                  pay basis, not chosen here — see the note on assignedType. */}
              <span className="text-[11px] text-[#6b6660] italic">
                Set by how the person is paid in Team
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-[#111417] mb-1">
                  Assign Editor *
                </label>
                <select
                  value={useManualEditor ? 'manual' : editorMemberId || ''}
                  onChange={e => handleSelectEditor(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#f9f8f6]/50 border border-[#d4c1a3] rounded-xl text-sm font-medium text-[#111417] focus:outline-none focus:border-[#7a2e33] focus:bg-white transition-all"
                >
                  <option value="">-- Choose from your team --</option>
                  {assignableEditors.map(m => {
                    const w = workloadMap.get(m.id);
                    const payType = isSalariedMember(m) ? 'In-House' : 'Freelancer';
                    const capText = w ? ` · ${w.statusLabel}` : '';
                    return (
                      <option key={m.id} value={m.id}>
                        {m.name} ({payType}){capText}
                      </option>
                    );
                  })}
                  <option value="manual">Someone not in my team…</option>
                </select>
                {selectedMember && (
                  <div className="mt-2 p-2.5 bg-[#f9f8f6] border border-[#e5dcd3] rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[#111417]">Capacity:</span>
                      <span className="text-xs font-medium text-[#111417]">
                        {workloadMap.get(selectedMember.id)?.statusLabel || '🟢 Available now'}
                      </span>
                    </div>
                    {workloadMap.get(selectedMember.id)?.tone !== 'available' && (
                      <span className="text-[11px] text-[#6b6660]">
                        Next free: <strong>{workloadMap.get(selectedMember.id)?.nextAvailableDate}</strong>
                      </span>
                    )}
                  </div>
                )}
                {assignableEditors.length === 0 && (
                  <p className="text-[10px] text-[#6b6660] mt-1">
                    Nobody on your deliverables team yet. Freelance work is post-production, so this
                    list only shows crew assigned to editing, grading or album services — set those in
                    Team, or enter a one-off person above.
                  </p>
                )}
                {editorError && !editorAssigned && (
                  <p className="text-[10px] font-semibold text-rose-700 mt-1">{editorError}</p>
                )}
                {selectedMember && (
                  <p className="text-[10px] text-[#6b6660] mt-1">
                    {costIsCoveredBySalary
                      ? `${selectedMember.name} is on monthly salary — treated as in-house, so this job carries no editor cost.`
                      : `${selectedMember.name} is paid per event / deliverable — log what you pay them in Payments once the job is delivered.`}
                  </p>
                )}
              </div>

              {useManualEditor && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-[#111417] mb-1">
                      Freelancer Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Rahul Sharma"
                      value={editorName}
                      onChange={e => setEditorName(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#f9f8f6]/50 border border-[#d4c1a3] rounded-xl text-sm font-medium text-[#111417] focus:outline-none focus:border-[#7a2e33] focus:bg-white transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#111417] mb-1">
                      Freelancer WhatsApp Phone
                    </label>
                    <input
                      type="tel"
                      placeholder="e.g. 9811223344"
                      value={editorPhone}
                      onChange={e => setEditorPhone(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#f9f8f6]/50 border border-[#d4c1a3] rounded-xl text-sm font-medium text-[#111417] focus:outline-none focus:border-[#7a2e33] focus:bg-white transition-all"
                    />
                  </div>

                  <p className="md:col-span-2 text-[10px] text-[#6b6660] -mt-1">
                    Anyone you work with regularly is worth adding to Team instead — then their
                    pay basis, rates, schedule and job history stay in one place.
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Section 3: What the client is charged */}
          <div className="bg-white rounded-xl p-5 border border-[#d4c1a3]/70 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#d4c1a3]/40">
              <div className="flex items-center gap-2">
                <IndianRupee className="w-4 h-4 text-[#7a2e33]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#7a2e33]">
                  3. Client Charge
                </h3>
              </div>
              <span className="text-[11px] text-[#6b6660] italic">
                {service ? `Rate ${service.rateSuffix}` : 'Set by the service category'}
              </span>
            </div>

            {!serviceType && (
              <p className="text-xs text-[#6b6660]">
                Choose a service category above and the right rate boxes appear here.
              </p>
            )}

            {serviceType && !service && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#111417] mb-1">
                    Client Charge (Revenue) ₹ *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-sm font-bold text-[#6b6660]">₹</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="e.g. 25000"
                      value={manualCharge}
                      onChange={e => setManualCharge(e.target.value === '' ? '' : Number(e.target.value))}
                      className={`${numberFieldClass} pl-8`}
                    />
                  </div>
                </div>
                <p className="md:col-span-2 text-[10px] text-[#6b6660] self-center leading-snug">
                  This job was logged under an older category, which has no rate behind it — so the
                  charge stays a single figure. Switch it to one of the four services above to price
                  it by the unit instead.
                </p>
              </div>
            )}

            {service && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#111417] mb-1">
                    Rate ₹ — {service.rateSuffix} *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-sm font-bold text-[#6b6660]">₹</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="e.g. 2000"
                      value={rate}
                      onChange={e => {
                        setRate(e.target.value === '' ? '' : Number(e.target.value));
                        setRateCameFromCard(false);
                      }}
                      className={`${numberFieldClass} pl-8`}
                    />
                  </div>
                  {typeof cardRate === 'number' && cardRate > 0 && (
                    <p className="text-[10px] text-[#6b6660] mt-1">
                      {Number(rate) === cardRate
                        ? `${selectedStudio?.name}'s usual rate`
                        : `Usually ₹${cardRate.toLocaleString('en-IN')} for this studio`}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#111417] mb-1">
                    {service.measureLabel} *
                  </label>

                  {service.basis === 'per_output_minute' && (
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <input
                          type="number"
                          min="0"
                          placeholder="Min"
                          value={outputMinutes}
                          onChange={e =>
                            setOutputMinutes(e.target.value === '' ? '' : Number(e.target.value))
                          }
                          className={numberFieldClass}
                        />
                        <span className="block text-[10px] text-[#6b6660] mt-0.5 text-center">minutes</span>
                      </div>
                      <div className="flex-1">
                        <input
                          type="number"
                          min="0"
                          max="59"
                          placeholder="Sec"
                          value={outputSeconds}
                          onChange={e =>
                            setOutputSeconds(e.target.value === '' ? '' : Number(e.target.value))
                          }
                          className={numberFieldClass}
                        />
                        <span className="block text-[10px] text-[#6b6660] mt-0.5 text-center">seconds</span>
                      </div>
                    </div>
                  )}

                  {service.basis === 'per_raw_hour' && (
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <input
                          type="number"
                          min="0"
                          placeholder="Hrs"
                          value={rawHours}
                          onChange={e => setRawHours(e.target.value === '' ? '' : Number(e.target.value))}
                          className={numberFieldClass}
                        />
                        <span className="block text-[10px] text-[#6b6660] mt-0.5 text-center">hours</span>
                      </div>
                      <div className="flex-1">
                        <input
                          type="number"
                          min="0"
                          max="59"
                          placeholder="Min"
                          value={outputMinutes}
                          onChange={e =>
                            setOutputMinutes(e.target.value === '' ? '' : Number(e.target.value))
                          }
                          className={numberFieldClass}
                        />
                        <span className="block text-[10px] text-[#6b6660] mt-0.5 text-center">minutes</span>
                      </div>
                    </div>
                  )}

                  {(service.basis === 'per_photo' || service.basis === 'per_sheet' || service.basis === 'per_item' || service.basis === 'per_raw_photo') && (
                    <>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder={
                          service.basis === 'per_photo' ? 'e.g. 120'
                          : service.basis === 'per_sheet' ? 'e.g. 30'
                          : service.basis === 'per_raw_photo' ? 'e.g. 3000'
                          : 'e.g. 3'
                        }
                        value={quantity}
                        onChange={e => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                        className={numberFieldClass}
                      />
                      <span className="block text-[10px] text-[#6b6660] mt-0.5">
                        {service.basis === 'per_photo' ? 'photos'
                        : service.basis === 'per_sheet' ? 'sheets'
                        : service.basis === 'per_raw_photo' ? 'raw clicks'
                        : 'items'}
                      </span>
                    </>
                  )}
                </div>

                <div className="bg-[#f9f8f6] border border-[#d4c1a3] rounded-xl p-3 flex flex-col justify-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#6b6660]">
                    Client Charge
                  </span>
                  <span className="text-lg font-extrabold text-[#111417] mt-0.5">
                    ₹{clientCharge.toLocaleString('en-IN')}
                  </span>
                  {billingLine ? (
                    <span className="text-[10px] text-[#6b6660] mt-0.5">{billingLine}</span>
                  ) : (
                    <span className="text-[10px] text-[#6b6660] mt-0.5">
                      Fill the rate and the {service.measureLabel.toLowerCase()}.
                    </span>
                  )}
                </div>

                {service.note && (
                  <p className="md:col-span-3 text-[10px] text-[#6b6660] leading-snug -mt-1">
                    {service.note}
                  </p>
                )}

                {minimumApplied && service.minimumNote && (
                  <p className="md:col-span-3 text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 leading-snug">
                    {service.minimumNote}
                  </p>
                )}
              </div>
            )}

            <p className="text-[10px] text-[#6b6660] leading-snug border-t border-[#d4c1a3]/40 pt-3">
              Nothing about the editor's pay is set here. Freelance editors are paid once the work is
              done — log that payout in Payments against this project, and the job's cost and margin
              follow from what was actually remitted.
            </p>
          </div>

          {/* Section 4: Timeline & Turnaround */}
          <div className="bg-white rounded-xl p-5 border border-[#d4c1a3]/70 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-[#d4c1a3]/40">
              <Calendar className="w-4 h-4 text-[#7a2e33]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#7a2e33]">
                4. Timeline & Turnaround Schedule
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-[#111417] mb-1">
                  Editing Effort — how long will this take?
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    placeholder="e.g. 4"
                    value={effortValue}
                    onChange={e => setEffortValue(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-28 px-3.5 py-2 bg-[#f9f8f6]/50 border border-[#d4c1a3] rounded-xl text-sm font-bold text-[#111417] focus:outline-none focus:border-[#7a2e33] focus:bg-white transition-all"
                  />
                  <div className="flex items-center bg-[#f9f8f6] p-1 rounded-xl border border-[#d4c1a3]">
                    {(['hours', 'days'] as const).map(u => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setEffortUnit(u)}
                        className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                          effortUnit === u ? 'bg-[#7a2e33] text-white shadow-xs' : 'text-[#6b6660] hover:text-[#111417]'
                        }`}
                      >
                        {u === 'hours' ? 'Hours' : 'Days'}
                      </button>
                    ))}
                  </div>
                  {effortHours !== undefined && (
                    <span className="text-[11px] text-[#6b6660]">
                      = {effortHours} working hours
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-[#6b6660] mt-1">
                  Judge this from the raw data. It is what lets the studio work out when the editor
                  can actually start, given everything already queued for them — leave it blank and
                  this job stays out of the forecast rather than being counted as instant.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#111417] mb-1">
                  Data Received Date *
                </label>
                <input
                  type="date"
                  required
                  value={dataReceivedDate}
                  onChange={e => setDataReceivedDate(e.target.value)}
                  className="w-full px-3.5 py-2 bg-[#f9f8f6]/50 border border-[#d4c1a3] rounded-xl text-sm font-medium text-[#111417] focus:outline-none focus:border-[#7a2e33] focus:bg-white transition-all"
                />
                <p className="text-[10px] text-[#6b6660] mt-1">
                  The job is only real once the footage is in hand — nothing can be queued before it.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#111417] mb-1">
                  Final Due Date (Draft Delivery) *
                </label>
                <input
                  type="date"
                  required
                  value={dueDate}
                  onChange={e => {
                    setDueDate(e.target.value);
                    setDueDateOverridden(true);
                  }}
                  className="w-full px-3.5 py-2 bg-[#f9f8f6]/50 border border-[#d4c1a3] rounded-xl text-sm font-medium text-[#111417] focus:outline-none focus:border-[#7a2e33] focus:bg-white transition-all"
                />
                {!projection && (
                  <p className="text-[10px] text-[#6b6660] mt-1">
                    Estimate the effort and assign a team editor, and this fills itself in from their
                    queue. Until then it defaults to a week after the data arrived.
                  </p>
                )}
              </div>

              {/*
                What the editor's queue actually says, in place of the old fixed
                3/7/14-day presets. Those were a guess made before anyone looked at
                the workload: picking "7 Days" said nothing about whether the editor
                had three films already waiting, so the date it wrote down was one the
                studio had no reason to believe.
              */}
              {projection && (
                <div className="md:col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 p-3 rounded-xl bg-[#f9f8f6] border border-[#d4c1a3]">
                  <CalendarClock className="w-4 h-4 text-[#7a2e33] shrink-0" />
                  <p className="text-[11px] text-[#111417] leading-snug">
                    Given everything {selectedMember?.name || 'this editor'} is already holding, this
                    starts{' '}
                    <strong>{projection.startDate ? formatDate(projection.startDate, 'short') : '—'}</strong>{' '}
                    and finishes <strong>{formatDate(projection.finishDate, 'short')}</strong>.
                  </p>
                  {dueDate !== projection.finishDate && (
                    <button
                      type="button"
                      onClick={() => {
                        setDueDate(projection.finishDate);
                        setDueDateOverridden(true);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-[#7a2e33] text-white text-[11px] font-bold hover:bg-[#5a2226] cursor-pointer"
                    >
                      Use this date
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Section 5: Raw Data */}
          {/* Section 5: Raw Data & Cloud Storage */}
          <div className="bg-white rounded-xl p-5 border border-[#d4c1a3]/70 shadow-2xs space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-[#d4c1a3]/40">
              <Film className="w-4 h-4 text-[#7a2e33]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#7a2e33]">
                5. Raw Footage & Cloud Delivery
              </h3>
            </div>

            <div className="p-3 bg-[#fbf9f5] border border-[#d4c1a3]/60 rounded-xl text-xs space-y-1">
              <p className="font-semibold text-[#111417]">
                Direct Desktop App Pipeline Active
              </p>
              <p className="text-[11px] text-[#6b6660] leading-relaxed">
                Raw footage packages are uploaded directly from your computer via the <strong>Baawaray Studio Desktop App</strong> to Backblaze B2. Assigned editors download raw footage and submit deliverables straight through the desktop app without manual link copy-pasting.
              </p>
            </div>
          </div>

          {/* Section 6: Creative Brief & Instructions */}
          <div className="bg-white rounded-xl p-5 border border-[#d4c1a3]/70 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-[#d4c1a3]/40">
              <FileText className="w-4 h-4 text-[#7a2e33]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#7a2e33]">
                6. Editing Brief & Special Instructions
              </h3>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#111417] mb-1">
                Editing Instructions for Editor (References, music taste, colour grade, key moments)
              </label>
              <textarea
                rows={4}
                placeholder="e.g. Reference: youtube.com/watch?v=… — keep that pacing for the first 30s, emotional dialogue during vows at 01:15, warm vintage LUT..."
                value={editingInstructions}
                onChange={e => setEditingInstructions(e.target.value)}
                className="w-full px-3.5 py-2 bg-[#f9f8f6]/50 border border-[#d4c1a3] rounded-xl text-xs text-[#111417] focus:outline-none focus:border-[#7a2e33] focus:bg-white transition-all"
              />
              <p className="text-[10px] text-[#6b6660] mt-1">
                Reference films, moodboards and audio tracks go in here — they travel with the brief
                when it is sent to the editor.
              </p>
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#f9f8f6] border-t border-[#d4c1a3]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-[#6b6660] hover:text-[#111417] hover:bg-[#d4c1a3]/40 rounded-xl transition-all"
          >
            Cancel
          </button>
          {formError && (
            <p role="alert" className="flex-1 px-4 text-[11px] font-semibold text-rose-700">
              {formError}
            </p>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            className="flex items-center gap-2 px-6 py-2.5 bg-[#7a2e33] hover:bg-[#5a2226] text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{initialJob ? 'Save Changes' : 'Create Freelance Project'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
