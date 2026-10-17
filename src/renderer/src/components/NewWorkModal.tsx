import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Calendar,
  Camera,
  Clock,
  Film,
  FolderPlus,
  HardDrive,
  UserCheck,
  X,
} from 'lucide-react';
import type { ScanOptions, WorkTarget } from '../../../shared/contracts';
import { useApp } from '../context/AppContext';
import { createExtra } from '../lib/studioRepository';
import { GoogleDriveRequiredModal } from './common/GoogleDriveRequiredModal';
import type { TeamMember } from '../types';
import type { FreelanceJob, FreelanceServiceType } from '../types/freelance';
import { calculateDynamicDueDates } from '../utils/dynamicScheduling';
import { isDeliverablesTeamMember } from '../utils/freelance';
import { FREELANCE_SERVICES, serviceDefinition } from '../utils/freelancePricing';
import { normaliseServices, resolveRoleGroups, servicePrice } from '../utils/studioRoles';

const scanGuidance: Record<string, { title: string; desc: string; icon: typeof Film }> = {
  'Short Form': {
    title: 'Missing Files & Sequence Check Only',
    desc: 'Clip duration is NOT scanned or measured. Short Form is billed on the finished deliverable duration. Only missing camera clips and numbering gaps are detected.',
    icon: Film,
  },
  'Long Form': {
    title: 'Raw Video Duration & Missing Files',
    desc: 'Raw video footage is probed for total duration (hours & minutes) and missing sequence clips. Photos are not counted or displayed.',
    icon: Film,
  },
  'Edited Photos': {
    title: 'Photo Count & Missing Files',
    desc: 'Counts total photos, billable photos, and RAW+JPEG pairs. Video duration is NOT measured or displayed.',
    icon: Camera,
  },
  Album: {
    title: 'Photo Count (Album Sheets) & Missing Files',
    desc: 'Counts photos to calculate album sheets and checks for missing camera files. Video duration is NOT measured or displayed.',
    icon: BookOpen,
  },
};

export function NewWorkModal({
  kind,
  onClose,
  onScanStarted,
  options,
}: {
  kind: 'freelance' | 'deliverables';
  onClose: () => void;
  onScanStarted?: (id: string | null) => void;
  options?: ScanOptions;
}): React.JSX.Element {
  const studio = useApp();
  const freelance = kind === 'freelance';

  // Basic info
  const [clientId, setClientId] = useState('');
  const [title, setTitle] = useState('');
  const [service, setService] = useState('');
  const [brief, setBrief] = useState('');
  const [price, setPrice] = useState('');
  const [rate, setRate] = useState('');
  const [rateFromCard, setRateFromCard] = useState(false);

  // Editor Assignment & Dynamic Schedule
  const [editorMemberId, setEditorMemberId] = useState('');
  const [requiredDays, setRequiredDays] = useState(2);

  // Raw data intake
  const [rawDataSource, setRawDataSource] = useState<'later' | 'scan_folder' | 'hard_drive' | 'link'>('later');
  const [rawDataLink, setRawDataLink] = useState('');
  const [hardDriveNotes, setHardDriveNotes] = useState('');
  const [rawDurationHours, setRawDurationHours] = useState('0');
  const [rawDurationMinutes, setRawDurationMinutes] = useState('0');
  const [rawPhotoCount, setRawPhotoCount] = useState('0');

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<WorkTarget | null>(null);

  // Deliverables roles (when adding deliverable to an internal client)
  const roles = useMemo(() => {
    const groups = resolveRoleGroups(studio.studioSettings?.roleGroups);
    return normaliseServices(
      studio.studioSettings?.crewRoles || studio.studioPriceList?.crewRoles || [],
      groups
    ).filter(role => groups.find(group => group.id === role.groupId)?.kind === 'deliverable');
  }, [studio.studioSettings, studio.studioPriceList]);

  // Deliverables team editors
  const editors = useMemo(
    () => studio.team.filter((m: TeamMember) => m.active !== false && isDeliverablesTeamMember(m)),
    [studio.team]
  );

  const selectedEditor = useMemo(
    () => editors.find(m => String(m.id) === editorMemberId),
    [editors, editorMemberId]
  );

  const partner = useMemo(
    () => studio.freelanceClients.find(c => String(c.id) === clientId),
    [studio.freelanceClients, clientId]
  );

  // Auto-fill rate from Partner Studio rate card when service changes
  useEffect(() => {
    if (!freelance || !partner || !service) return;
    const cardRate = partner.rateCard?.[service];
    if (typeof cardRate === 'number' && cardRate > 0) {
      setRate(String(cardRate));
      setRateFromCard(true);
    } else {
      setRate('');
      setRateFromCard(false);
    }
  }, [freelance, partner, service]);

  // Dynamic schedule calculation based on editor's queue
  const dynamicSchedule = useMemo(() => {
    if (!selectedEditor) return null;
    const activeJobs = studio.freelanceJobs.filter(
      j =>
        j.editorMemberId === selectedEditor.id &&
        j.stage !== 'completed' &&
        j.stage !== 'final_delivered'
    );
    const draftJob: FreelanceJob = {
      id: '__draft_new__',
      title: title.trim() || 'New Freelance Project',
      serviceType: service as FreelanceServiceType,
      editorMemberId: selectedEditor.id,
      stage: 'sent_to_editor',
      requiredDays: Number(requiredDays) || 2,
      createdAt: new Date().toISOString(),
      sentToEditorDate: new Date().toISOString(),
    } as FreelanceJob;

    const scheduleMap = calculateDynamicDueDates([...activeJobs, draftJob], selectedEditor);
    return scheduleMap.get('__draft_new__') || null;
  }, [selectedEditor, studio.freelanceJobs, service, title, requiredDays]);

  // Check if editor has leaves during the scheduled period
  const editorLeaves = useMemo(() => {
    if (!selectedEditor?.unavailablePeriods?.length || !dynamicSchedule?.calculatedDueDate) return [];
    const today = new Date().toISOString().slice(0, 10);
    const due = dynamicSchedule.calculatedDueDate;
    return selectedEditor.unavailablePeriods.filter(
      p => (p.from <= due && p.to >= today)
    );
  }, [selectedEditor, dynamicSchedule]);

  async function save(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      if (freelance) {
        if (!partner) throw new Error('Select a partner studio.');
        if (!service) throw new Error('Select a service.');
        if (!title.trim()) throw new Error('Enter a project title.');

        const calculatedDue = dynamicSchedule?.calculatedDueDate || '';

        const createdId = await studio.addFreelanceJob({
          title: title.trim(),
          serviceType: service,
          freelanceClientId: partner.id,
          clientName: partner.name,
          clientPhone: partner.phone || '',
          clientEmail: partner.email || '',
          clientAuthUid: partner.authUid,
          description: brief.trim(),
          editorMemberId: selectedEditor ? selectedEditor.id : undefined,
          editorName: selectedEditor ? selectedEditor.name : undefined,
          editorPhone: selectedEditor ? selectedEditor.phone : undefined,
          editorEmail: selectedEditor ? selectedEditor.email : undefined,
          editorAuthUid: selectedEditor ? selectedEditor.authUid : undefined,
          requiredDays: selectedEditor ? (Number(requiredDays) || 2) : 2,
          dueDate: calculatedDue,
          stage: selectedEditor
            ? 'editor_assigned'
            : rawDataSource !== 'later'
            ? 'data_received'
            : 'pending_assignment',
          pricing: rate
            ? {
                rate: Number(rate),
                basis: serviceDefinition(service as never)?.basis || 'per_output_minute',
                billableUnits: 1,
              }
            : undefined,
          clientCharge: rate ? Number(rate) : 0,
          rawDataSource:
            rawDataSource === 'hard_drive'
              ? 'hard_drive'
              : rawDataSource === 'link'
              ? 'link'
              : rawDataSource === 'scan_folder'
              ? 'upload'
              : undefined,
          rawDataLink: rawDataSource === 'link' ? rawDataLink.trim() : undefined,
          hardDriveNotes: rawDataSource === 'hard_drive' ? hardDriveNotes.trim() || undefined : undefined,
          rawDurationHours:
            service === 'Long Form' && rawDataSource === 'hard_drive'
              ? Number(rawDurationHours) || 0
              : undefined,
          rawDurationMinutes:
            service === 'Long Form' && rawDataSource === 'hard_drive'
              ? Number(rawDurationMinutes) || 0
              : undefined,
          rawPhotoCount:
            (service === 'Edited Photos' || service === 'Album') &&
            rawDataSource === 'hard_drive'
              ? Number(rawPhotoCount) || 0
              : undefined,
        });

        // If folder scan was chosen and scanner callback is available, trigger scan
        if (rawDataSource === 'scan_folder' && onScanStarted) {
          const target: WorkTarget = {
            kind: 'freelance',
            id: createdId,
            clientId: partner.id,
            title: title.trim(),
            clientName: partner.name,
            serviceType: service,
            purpose: 'raw',
            brief: brief.trim(),
            dueDate: calculatedDue,
            recipientName: selectedEditor?.name,
            recipientPhone: selectedEditor?.phone,
            recipientEmail: selectedEditor?.email,
          };

          const driveStatus = await window.api.driveStatus();
          if (!driveStatus?.connected) {
            setPendingTarget(target);
            setShowDriveModal(true);
            return;
          }

          const scanId = await window.api.scan(
            options || { excludedBillingFolders: [], countPhotoPairsOnce: true },
            target
          );
          if (scanId) onScanStarted(scanId);
        }
      } else {
        await createExtra(clientId, {
          title: title.trim(),
          linkedRoleId: service,
          sellingPrice: Number(price),
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save work.');
    } finally {
      setBusy(false);
    }
  }

  const GuidanceIcon = service && scanGuidance[service] ? scanGuidance[service].icon : Film;

  return (
    <div className="drawer-shade" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <section
        className="work-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-work-title"
      >
        <header>
          <div>
            <span className="eyebrow">
              {freelance ? 'POST PRODUCTION · PARTNER STUDIO WORK' : 'CLIENT DELIVERABLE'}
            </span>
            <h2 id="new-work-title">
              {freelance ? 'New freelance work' : 'Add a deliverable'}
            </h2>
            <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
              {freelance
                ? 'Configure partner studio, service, dynamic editor schedule, and raw-data scanning.'
                : 'Add an extra deliverable to this client.'}
            </p>
          </div>
          <button
            className="icon-button"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>

        <form onSubmit={event => void save(event)} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div className="work-drawer-body">
            {/* -------------------------------- Section 1: Partner & Title */}
            <div className="drawer-section">
              <div className="drawer-section-title">1. Project &amp; Studio Details</div>

              <label style={{ margin: 0 }}>
                {freelance ? 'Partner studio' : 'Client'}
                <select
                  required
                  value={clientId}
                  onChange={event => setClientId(event.target.value)}
                >
                  <option value="">Choose partner studio…</option>
                  {(freelance ? studio.freelanceClients : studio.clients).map(client => (
                    <option key={client.id} value={String(client.id)}>
                      {client.name} {client.city ? `(${client.city})` : ''}
                    </option>
                  ))}
                </select>
              </label>

              {partner && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: -4, paddingLeft: 2 }}>
                  Contact: {partner.contactPerson || partner.name}
                  {partner.phone ? ` · ${partner.phone}` : ''}
                  {partner.email ? ` · ${partner.email}` : ''}
                </div>
              )}

              <label style={{ margin: 0 }}>
                Project / Deliverable Title
                <input
                  required
                  value={title}
                  onChange={event => setTitle(event.target.value)}
                  placeholder="e.g. Rohan &amp; Sneha · Wedding Highlights"
                />
              </label>
            </div>

            {/* -------------------------------- Section 2: Service & Pricing */}
            <div className="drawer-section">
              <div className="drawer-section-title">2. Service &amp; Rate</div>

              <label style={{ margin: 0 }}>
                Service Type
                <select
                  required
                  value={service}
                  onChange={event => {
                    const val = event.target.value;
                    setService(val);
                    if (!freelance) {
                      const role = roles.find(item => item.id === val);
                      setTitle(role?.name || '');
                      setPrice(String(role ? servicePrice(role) : ''));
                    }
                  }}
                >
                  <option value="">Choose service…</option>
                  {freelance
                    ? FREELANCE_SERVICES.map(item => (
                        <option key={item.name} value={item.name}>
                          {item.name} ({item.rateSuffix})
                        </option>
                      ))
                    : roles.map(role => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                </select>
              </label>

              {freelance && service && (
                <div className="drawer-card">
                  <div className="drawer-card-header">
                    <span className="drawer-card-title">
                      <GuidanceIcon size={16} style={{ color: 'var(--burgundy)' }} />
                      {service} Commercials
                    </span>
                    {rateFromCard && (
                      <span className="drawer-meta-badge done">Agreed Rate Card Rate</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <label style={{ margin: 0, flex: 1 }}>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                        Agreed Rate ({studio.studioSettings?.currency || 'INR'})
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={rate}
                        onChange={e => {
                          setRate(e.target.value);
                          setRateFromCard(false);
                        }}
                        placeholder="Rate per unit"
                      />
                    </label>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 18, flex: 1.2 }}>
                      {serviceDefinition(service as never)?.note || serviceDefinition(service as never)?.rateSuffix}
                    </div>
                  </div>
                </div>
              )}

              {!freelance && (
                <>
                  <label style={{ margin: 0 }}>
                    Extra price ({studio.studioSettings?.currency || 'INR'})
                    <input
                      type="number"
                      min="0"
                      step="1"
                      required
                      value={price}
                      onChange={event => setPrice(event.target.value)}
                    />
                  </label>
                  <p className="notice" style={{ margin: 0 }}>
                    This is an additional deliverable. The original quotation stays unchanged.
                  </p>
                </>
              )}
            </div>

            {/* -------------------------------- Section 3: Editor & Dynamic Schedule */}
            {freelance && (
              <div className="drawer-section">
                <div className="drawer-section-title">3. Editor Assignment &amp; Dynamic Schedule</div>

                <label style={{ margin: 0 }}>
                  Assign Editor
                  <select
                    value={editorMemberId}
                    onChange={e => setEditorMemberId(e.target.value)}
                  >
                    <option value="">Assign later (Awaiting assignment)</option>
                    {editors.map(m => {
                      const activeCount = studio.freelanceJobs.filter(
                        j => j.editorMemberId === m.id && j.stage !== 'completed' && j.stage !== 'final_delivered'
                      ).length;
                      return (
                        <option key={m.id} value={String(m.id)}>
                          {m.name} {activeCount > 0 ? `(${activeCount} in queue)` : '(Queue free)'}
                        </option>
                      );
                    })}
                  </select>
                </label>

                {selectedEditor ? (
                  <div className="drawer-card highlight">
                    <div className="drawer-card-header">
                      <span className="drawer-card-title">
                        <UserCheck size={16} style={{ color: 'var(--burgundy)' }} />
                        {selectedEditor.name}&apos;s Dynamic Schedule
                      </span>
                      <span className="drawer-meta-badge active">
                        Queue #{dynamicSchedule?.queuePosition || 1} of {dynamicSchedule?.totalInQueue || 1}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                      <label style={{ margin: 0, flex: 1 }}>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                          Allocated Editing Turnaround
                        </span>
                        <select
                          value={requiredDays}
                          onChange={e => setRequiredDays(Number(e.target.value))}
                          style={{ padding: '6px 8px', fontSize: 13, borderRadius: 8 }}
                        >
                          <option value={1}>1 Working Day</option>
                          <option value={2}>2 Working Days (Default)</option>
                          <option value={3}>3 Working Days</option>
                          <option value={4}>4 Working Days</option>
                          <option value={5}>5 Working Days</option>
                          <option value={7}>7 Working Days (1 Week)</option>
                          <option value={10}>10 Working Days</option>
                        </select>
                      </label>
                      <div style={{ flex: 1.2, marginTop: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Calendar size={15} style={{ color: 'var(--burgundy)' }} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                            Due: {dynamicSchedule?.calculatedDueDate || 'Recalculating…'}
                          </span>
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                          {dynamicSchedule && dynamicSchedule.daysRemaining >= 0
                            ? `${dynamicSchedule.daysRemaining} days turnaround from queue start`
                            : 'Dynamic queue calculated'}
                        </div>
                      </div>
                    </div>

                    {editorLeaves.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#b45309', marginTop: 4 }}>
                        <AlertCircle size={14} />
                        <span>
                          Editor has scheduled leave ({editorLeaves.map(l => `${l.from} to ${l.to}`).join(', ')}). Automatically skipped forward in schedule!
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="drawer-card">
                    <div className="drawer-card-header">
                      <span className="drawer-card-title">
                        <Clock size={15} style={{ color: 'var(--muted)' }} />
                        Due Date: To be decided
                      </span>
                      <span className="drawer-meta-badge neutral">Pending Editor Assignment</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.45 }}>
                      Due date cannot be decided yet. Once an editor is assigned and their schedule is loaded,
                      the dynamic scheduler will compute the exact due date based on their active queue and editing days.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* -------------------------------- Section 4: Service-Aware Raw Data Handling */}
            {freelance && (
              <div className="drawer-section">
                <div className="drawer-section-title">4. Raw Data Handling &amp; Scan Reference</div>

                {service && scanGuidance[service] ? (
                  <div className="drawer-card">
                    <div className="drawer-card-header">
                      <span className="drawer-card-title">
                        <GuidanceIcon size={16} style={{ color: 'var(--burgundy)' }} />
                        {scanGuidance[service].title}
                      </span>
                      <span className="drawer-meta-badge active">{service}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.45 }}>
                      {scanGuidance[service].desc}
                    </p>
                  </div>
                ) : (
                  <div className="drawer-card">
                    <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>
                      Select a service above to see exactly what will be checked when the raw source data is loaded.
                    </p>
                  </div>
                )}

                {/* Raw data intake choice */}
                <label style={{ margin: '6px 0 0' }}>
                  Raw Data Intake Method
                  <select
                    value={rawDataSource}
                    onChange={e => setRawDataSource(e.target.value as typeof rawDataSource)}
                  >
                    <option value="later">Provide / upload raw data later (from project row)</option>
                    <option value="scan_folder">Upload folder or files now via Google Drive (Desktop App)</option>
                    <option value="hard_drive">Physical Hard Drive Handover (In-house / local SSD)</option>
                    <option value="link">Shared Cloud Link (Google Drive, Dropbox, WeTransfer, NAS)</option>
                  </select>
                </label>

                {rawDataSource === 'scan_folder' && (
                  <div className="drawer-card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
                      <FolderPlus size={15} style={{ color: 'var(--burgundy)' }} />
                      Google Drive Direct Cloud Upload
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
                      After project creation, the Desktop App file scanner will immediately open to select the folder.
                      {service === 'Short Form' && ' Only missing clips will be checked; clip duration is not measured.'}
                      {service === 'Long Form' && ' Raw video duration will be scanned. Photo count is ignored.'}
                      {(service === 'Edited Photos' || service === 'Album') && ' Photo count will be measured. Video duration is ignored.'}
                    </p>
                  </div>
                )}

                {rawDataSource === 'hard_drive' && (
                  <div className="drawer-card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
                      <HardDrive size={15} style={{ color: 'var(--burgundy)' }} />
                      Physical Hard Drive Handover (In-House / Local)
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
                      Physical drive intake for in-house Baawaray Films editors or local hand-offs. Direct to SSD without cloud upload.
                    </p>

                    <label style={{ margin: '4px 0 0' }}>
                      Hard drive label / storage reference
                      <input
                        value={hardDriveNotes}
                        onChange={e => setHardDriveNotes(e.target.value)}
                        placeholder="e.g. Samsung T7 2TB (Red) - Desk 3"
                      />
                    </label>

                    {service === 'Long Form' && (
                      <div className="field-row" style={{ margin: '4px 0 0' }}>
                        <label style={{ margin: 0 }}>
                          Raw video hours
                          <input
                            type="number"
                            min="0"
                            value={rawDurationHours}
                            onChange={e => setRawDurationHours(e.target.value)}
                          />
                        </label>
                        <label style={{ margin: 0 }}>
                          Raw video minutes
                          <input
                            type="number"
                            min="0"
                            max="59"
                            value={rawDurationMinutes}
                            onChange={e => setRawDurationMinutes(e.target.value)}
                          />
                        </label>
                      </div>
                    )}

                    {(service === 'Edited Photos' || service === 'Album') && (
                      <label style={{ margin: '4px 0 0' }}>
                        Photo count
                        <input
                          type="number"
                          min="0"
                          value={rawPhotoCount}
                          onChange={e => setRawPhotoCount(e.target.value)}
                        />
                      </label>
                    )}

                    {service === 'Short Form' && (
                      <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                        Short Form is measured on the finished cut. Raw footage hand-off is logged.
                      </p>
                    )}
                  </div>
                )}

                {rawDataSource === 'link' && (
                  <label style={{ margin: 0 }}>
                    Raw-data Link
                    <input
                      required
                      value={rawDataLink}
                      onChange={e => setRawDataLink(e.target.value)}
                      placeholder="Google Drive, Dropbox, WeTransfer, NAS link…"
                    />
                  </label>
                )}
              </div>
            )}

            {/* -------------------------------- Section 5: Brief & Instructions */}
            {freelance && (
              <div className="drawer-section">
                <div className="drawer-section-title">5. Editing Brief &amp; Creative Notes</div>
                <label style={{ margin: 0 }}>
                  Editing Brief
                  <textarea
                    rows={3}
                    value={brief}
                    onChange={event => setBrief(event.target.value)}
                    placeholder="Style reference, soundtrack notes, important moments to highlight, client delivery requirements…"
                  />
                </label>
              </div>
            )}

            {error && (
              <p className="error" role="alert" style={{ margin: 0 }}>
                {error}
              </p>
            )}
          </div>

          <div className="work-drawer-footer">
            <button type="button" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button className="primary" disabled={busy || studio.loading}>
              {busy
                ? 'Creating…'
                : freelance
                ? rawDataSource === 'scan_folder'
                  ? 'Create Project & Open Scanner'
                  : rawDataSource === 'hard_drive'
                  ? 'Create Project (Hard Drive Handover)'
                  : 'Create Project'
                : 'Add Deliverable'}
            </button>
          </div>
        </form>
      </section>
      <GoogleDriveRequiredModal
        isOpen={showDriveModal}
        onClose={() => {
          setShowDriveModal(false);
          setPendingTarget(null);
          onClose();
        }}
        onConnected={async () => {
          if (pendingTarget && onScanStarted) {
            const scanId = await window.api.scan(
              options || { excludedBillingFolders: [], countPhotoPairsOnce: true },
              pendingTarget
            );
            if (scanId) onScanStarted(scanId);
          }
          setShowDriveModal(false);
          onClose();
        }}
      />
    </div>
  );
}

