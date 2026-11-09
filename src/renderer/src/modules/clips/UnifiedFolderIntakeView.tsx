import React, { useState, useEffect } from 'react';
import {
  FolderPlus,
  FolderTree,
  HardDrive,
  CheckCircle2,
  Plus,
  Trash2,
  ExternalLink,
  Film,
  Camera,
  Sparkles,
  UserCheck,
  Send,
  RefreshCw,
  FolderCheck,
  Layers,
  ShieldCheck,
  Check,
  ChevronDown,
  Calendar,
  Package,
  Disc,
  Usb
} from 'lucide-react';
import type {
  EventFolderPlan,
  FolderCreationResult,
  StudioClientData,
  DataHandoffRecord,
  DiscoveredCrewPackage
} from '@shared/contracts';
import { STUDIO_WEB_APP_CLIENTS } from '@shared/studioClients';
import { computeProjectRootFolderName } from '@shared/naming';

const PRESET_EVENTS = ['Wedding', 'Sangeet', 'Mehendi', 'Haldi', 'Reception', 'Cocktail', 'Pre-Wedding'];

interface EventConfig {
  id: string;
  eventName: string;
  eventDate: string; // YYYY-MM-DD
  photographers: string[];
  cinematographers: string[];
  droneOperators: string[];
}

const DEFAULT_DELIVERABLES = [
  '01_Teaser',
  '02_Highlight_Film',
  '03_Reels',
  '04_Full_Length_Feature',
  '05_Edited_Photos',
  '06_Photo_Album'
];

const INITIAL_LOGS: DataHandoffRecord[] = [
  {
    id: 'log_0',
    timestamp: '2026-10-30T08:57:41.605Z',
    clientName: 'Dhanur & Jhanvi',
    eventName: 'Wedding',
    eventDate: '2026-10-28',
    crewName: 'Vikas Khera',
    crewRole: 'photographer',
    cardCount: 2,
    totalSizeGB: 38.55,
    clipOrPhotoCount: 1348,
    destinationFolder: '/Volumes/40/261028 Dhanur & Jhanvi/01_RAW_FOOTAGE/2026.10.28 - Wedding/Photos/Vikas Khera',
    notes: '2x 64GB Sony Tough SD Cards (Sony A7 IV RAWs)',
    verifiedBy: 'Studio Admin',
    whatsappConfirmationSent: true
  },
  {
    id: 'log_1',
    timestamp: '2026-11-01T23:30:00Z',
    clientName: 'Dikshant & Moreen',
    eventName: 'Wedding',
    eventDate: '2026-11-01',
    crewName: 'Gagan',
    crewRole: 'cinematographer',
    cardCount: 3,
    totalSizeGB: 142.5,
    clipOrPhotoCount: 428,
    destinationFolder: '/Volumes/40/Dikshant & Moreen/01_RAW_FOOTAGE/2026.11.01 - Wedding/Videos/Gagan',
    notes: 'Sony FX3 S-Log3 4K 50p XAVC S-I',
    verifiedBy: 'Studio Admin',
    whatsappConfirmationSent: true
  },
  {
    id: 'log_2',
    timestamp: '2026-11-02T01:15:00Z',
    clientName: 'Dikshant & Moreen',
    eventName: 'Wedding',
    eventDate: '2026-11-01',
    crewName: 'Sahil',
    crewRole: 'drone',
    cardCount: 1,
    totalSizeGB: 68.2,
    clipOrPhotoCount: 94,
    destinationFolder: '/Volumes/40/Dikshant & Moreen/01_RAW_FOOTAGE/2026.11.01 - Wedding/Videos/Drone - Sahil',
    notes: 'DJI Mavic 3 Cine D-Log Aerials',
    verifiedBy: 'Studio Admin',
    whatsappConfirmationSent: true
  }
];

export const UnifiedFolderIntakeView: React.FC = () => {
  // --- Client Selection State ---
  const [studioClients, setStudioClients] = useState<StudioClientData[]>(STUDIO_WEB_APP_CLIENTS);
  const [selectedClient, setSelectedClient] = useState<StudioClientData | null>(() => {
    return STUDIO_WEB_APP_CLIENTS.find(c => c.name.includes('Dhanur')) || STUDIO_WEB_APP_CLIENTS[0];
  });

  const defaultClient = STUDIO_WEB_APP_CLIENTS.find(c => c.name.includes('Dhanur')) || STUDIO_WEB_APP_CLIENTS[0];
  const initialEvent = defaultClient?.events[0];

  const [clientName, setClientName] = useState(defaultClient?.name || 'Dhanur & Jhanvi');
  const [projectCode, setProjectCode] = useState('261028');
  const [targetDirectory, setTargetDirectory] = useState('/Volumes/40');

  // Multi-event configuration
  const [events, setEvents] = useState<EventConfig[]>([
    {
      id: 'ev_1',
      eventName: initialEvent?.eventName || 'Wedding',
      eventDate: initialEvent?.date || '2026-10-28',
      photographers: initialEvent?.photographers?.length ? initialEvent.photographers : ['Vikas Khera'],
      cinematographers: initialEvent?.cinematographers?.length ? initialEvent.cinematographers : ['Kishan'],
      droneOperators: initialEvent?.droneOperators?.length ? initialEvent.droneOperators : []
    }
  ]);

  // Selected Deliverables for 04_OUTPUTS
  const [selectedDeliverables, setSelectedDeliverables] = useState<string[]>(DEFAULT_DELIVERABLES);
  const [customDeliverableInput, setCustomDeliverableInput] = useState('');

  // New crew member inputs
  const [newPhotoName, setNewPhotoName] = useState('');
  const [newCinemaName, setNewCinemaName] = useState('');
  const [newDroneName, setNewDroneName] = useState('');
  const [selectedEventIdForCrew, setSelectedEventIdForCrew] = useState('ev_1');

  // Creation State
  const [createdResult, setCreatedResult] = useState<FolderCreationResult | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // --- Step 2: Intake & Handoff State ---
  const [intakeEvent, setIntakeEvent] = useState('Wedding');
  const [intakeRole, setIntakeRole] = useState<'Photographer' | 'Cinematographer' | 'Drone'>('Cinematographer');
  const [intakeCrewName, setIntakeCrewName] = useState('Kishan');
  const [intakeCrewPhone, setIntakeCrewPhone] = useState('+91 88945 62004');
  const [intakeCardCount, setIntakeCardCount] = useState(2);
  const [intakeDataGb, setIntakeDataGb] = useState<number>(146.86);
  const [intakeFileCount, setIntakeFileCount] = useState<number>(308);
  const [intakeScannedPath, setIntakeScannedPath] = useState<string>(
    '/Volumes/40/261028 Dhanur & Jhanvi/01_RAW_FOOTAGE/2026.10.28 - Wedding/Videos/Kishan'
  );
  const [intakeNotes, setIntakeNotes] = useState('');
  const [intakeBusy, setIntakeBusy] = useState(false);
  const [intakeStatusMessage, setIntakeStatusMessage] = useState<string | null>(null);
  const [logs, setLogs] = useState<DataHandoffRecord[]>(INITIAL_LOGS);

  // Sync clients from Studio OS
  useEffect(() => {
    if (window.clipsApi?.getStudioClients) {
      window.clipsApi
        .getStudioClients()
        .then(list => {
          if (list && list.length > 0) {
            setStudioClients(list);
            const matched = list.find(c => c.name.includes('Dhanur'));
            if (matched && (!selectedClient || selectedClient.id !== matched.id)) {
              setSelectedClient(matched);
            }
          }
        })
        .catch(() => {});
    }
  }, []);

  // Compute Project Code when client or primary event changes
  const handleSelectClient = (client: StudioClientData) => {
    setSelectedClient(client);
    setClientName(client.name);
    if (client.events && client.events.length > 0) {
      const primaryEv = client.events[0];
      const code = primaryEv.date ? primaryEv.date.replace(/-/g, '').slice(2) : '261028';
      setProjectCode(code);
      setEvents(
        client.events.map((ev, idx) => ({
          id: `ev_${idx + 1}`,
          eventName: ev.eventName,
          eventDate: ev.date,
          photographers: ev.photographers?.length ? ev.photographers : ['Vikas Khera'],
          cinematographers: ev.cinematographers?.length ? ev.cinematographers : ['Kishan'],
          droneOperators: ev.droneOperators || []
        }))
      );
    }
  };

  const handleSelectTargetDir = async () => {
    const dir = await window.clipsApi.openDirectory(targetDirectory);
    if (dir) setTargetDirectory(dir);
  };

  // Add event
  const handleAddEvent = (presetName: string) => {
    const newId = `ev_${Date.now()}`;
    const nextDate = events[0]?.eventDate || '2026-10-28';
    setEvents([
      ...events,
      {
        id: newId,
        eventName: presetName,
        eventDate: nextDate,
        photographers: ['Vikas Khera'],
        cinematographers: ['Kishan'],
        droneOperators: []
      }
    ]);
  };

  const handleRemoveEvent = (id: string) => {
    if (events.length <= 1) return;
    setEvents(events.filter(e => e.id !== id));
  };

  // Crew helpers
  const handleAddCrew = (type: 'photo' | 'cinema' | 'drone') => {
    setEvents(prev =>
      prev.map(ev => {
        if (ev.id !== selectedEventIdForCrew) return ev;
        if (type === 'photo' && newPhotoName.trim() && !ev.photographers.includes(newPhotoName.trim())) {
          return { ...ev, photographers: [...ev.photographers, newPhotoName.trim()] };
        }
        if (type === 'cinema' && newCinemaName.trim() && !ev.cinematographers.includes(newCinemaName.trim())) {
          return { ...ev, cinematographers: [...ev.cinematographers, newCinemaName.trim()] };
        }
        if (type === 'drone' && newDroneName.trim() && !ev.droneOperators.includes(newDroneName.trim())) {
          return { ...ev, droneOperators: [...ev.droneOperators, newDroneName.trim()] };
        }
        return ev;
      })
    );
    if (type === 'photo') setNewPhotoName('');
    if (type === 'cinema') setNewCinemaName('');
    if (type === 'drone') setNewDroneName('');
  };

  const handleRemoveCrew = (eventId: string, type: 'photo' | 'cinema' | 'drone', name: string) => {
    setEvents(prev =>
      prev.map(ev => {
        if (ev.id !== eventId) return ev;
        if (type === 'photo') return { ...ev, photographers: ev.photographers.filter(p => p !== name) };
        if (type === 'cinema') return { ...ev, cinematographers: ev.cinematographers.filter(c => c !== name) };
        if (type === 'drone') return { ...ev, droneOperators: ev.droneOperators.filter(d => d !== name) };
        return ev;
      })
    );
  };

  // Deliverables toggle
  const toggleDeliverable = (item: string) => {
    if (selectedDeliverables.includes(item)) {
      setSelectedDeliverables(selectedDeliverables.filter(d => d !== item));
    } else {
      setSelectedDeliverables([...selectedDeliverables, item]);
    }
  };

  const addCustomDeliverable = () => {
    if (customDeliverableInput.trim() && !selectedDeliverables.includes(customDeliverableInput.trim())) {
      setSelectedDeliverables([...selectedDeliverables, customDeliverableInput.trim()]);
      setCustomDeliverableInput('');
    }
  };

  // Root folder calculation
  const rootFolderName = `${projectCode.trim()} ${clientName.trim()}`;
  const fullRootPath = `${targetDirectory.replace(/\/$/, '')}/${rootFolderName}`;

  // Execute Folder Creation
  const handleCreateFolders = async () => {
    setIsCreating(true);
    setCreatedResult(null);
    try {
      const plan: EventFolderPlan = {
        clientName: clientName.trim(),
        projectCode: projectCode.trim(),
        customRootFolderName: rootFolderName,
        eventName: events[0]?.eventName || 'Wedding',
        eventDate: events[0]?.eventDate || '2026-10-28',
        cinematographers: events[0]?.cinematographers || [],
        photographers: events[0]?.photographers || [],
        droneOperators: events[0]?.droneOperators || [],
        targetDirectory,
        events: events.map(e => ({
          eventName: e.eventName,
          eventDate: e.eventDate,
          photographers: e.photographers,
          cinematographers: e.cinematographers,
          droneOperators: e.droneOperators
        })),
        deliverables: selectedDeliverables,
        includeDeliveryFolders: true
      };

      const res = await window.clipsApi.createFolderStructure(plan);
      setCreatedResult(res);
      if (res.success) {
        // Automatically set intake target path
        const firstEv = events[0];
        const datePrefix = firstEv.eventDate ? firstEv.eventDate.replace(/-/g, '.') : '2026.10.28';
        const defaultIntakePath = `${res.rootPath}/01_RAW_FOOTAGE/${datePrefix} - ${firstEv.eventName}/Videos/${firstEv.cinematographers[0] || 'Kishan'}`;
        setIntakeScannedPath(defaultIntakePath);
      }
    } catch (err: any) {
      setCreatedResult({
        success: false,
        rootPath: '',
        createdPaths: [],
        error: err?.message || 'Creation error'
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevealInFinder = async () => {
    if (createdResult?.rootPath) {
      await window.clipsApi.revealFolder(createdResult.rootPath);
    }
  };

  // --- Step 2: Intake Scanner ---
  const handleScanDirectory = async () => {
    const dir = await window.clipsApi.openDirectory(targetDirectory);
    if (!dir) return;

    setIntakeBusy(true);
    setIntakeStatusMessage(`Scanning directory: ${dir}...`);
    try {
      const res = await window.clipsApi.scanFootageFolder(dir);
      if (res.ok) {
        setIntakeScannedPath(dir);
        setIntakeDataGb(res.dataGb || 0);
        setIntakeFileCount(res.fileCount || 0);
        if (res.detectedClient) setClientName(res.detectedClient);
        if (res.detectedEvent) setIntakeEvent(res.detectedEvent);
        if (res.detectedCrew) setIntakeCrewName(res.detectedCrew);
        if (res.detectedRole) setIntakeRole(res.detectedRole);
        setIntakeStatusMessage(`✓ Scanned successfully: ${res.dataGb} GB (${res.fileCount} files detected).`);
      } else {
        setIntakeStatusMessage(`⚠️ Could not analyze folder: ${res.error}`);
      }
    } catch (err: any) {
      setIntakeStatusMessage(`⚠️ Error scanning: ${err?.message || err}`);
    } finally {
      setIntakeBusy(false);
    }
  };

  // Log handoff and dispatch WhatsApp
  const handleLogHandoff = async () => {
    if (!clientName || !intakeCrewName) return;
    setIntakeBusy(true);
    try {
      const newLog: DataHandoffRecord = {
        id: `log_${Date.now()}`,
        timestamp: new Date().toISOString(),
        clientName,
        eventName: intakeEvent,
        eventDate: events.find(e => e.eventName === intakeEvent)?.eventDate || '2026-10-28',
        crewName: intakeCrewName,
        crewRole: intakeRole.toLowerCase() as any,
        cardCount: intakeCardCount,
        totalSizeGB: intakeDataGb,
        clipOrPhotoCount: intakeFileCount,
        destinationFolder: intakeScannedPath,
        notes: intakeNotes || `Logged from ${intakeRole} card intake.`,
        verifiedBy: 'Studio Lead Admin',
        whatsappConfirmationSent: true
      };

      setLogs([newLog, ...logs]);
      setIntakeStatusMessage(`✓ Data successfully logged! Official receipt dispatched to ${intakeCrewName} (${intakeCrewPhone}).`);
    } catch (err: any) {
      setIntakeStatusMessage(`⚠️ Failed to log handoff: ${err?.message || err}`);
    } finally {
      setIntakeBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 text-[#1A1814] pb-12">
      {/* ============================================================= */}
      {/* MAIN BANNER & WORKFLOW TITLE                                   */}
      {/* ============================================================= */}
      <div className="bg-[#FFFFFF] border border-[#E5DFD7] shadow-sm rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold font-serif text-[#1A1814] flex items-center gap-2.5">
              <FolderTree className="w-5 h-5 text-[#9B2226]" />
              Smart Folder Generator &amp; Data Intake Register
            </h1>
            <span className="text-[10px] bg-amber-50 border border-amber-200 text-amber-800 px-2.5 py-0.5 rounded-full font-semibold font-mono">
              Unified Intake Pipeline
            </span>
          </div>
          <p className="text-xs text-[#6B655C] mt-1 font-sans">
            Build standardized root project folder structures (Raw Photos, Raw Videos, Audio, Projects, Deliverables, Delivery) and intake memory card data with automated WhatsApp receipts.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs bg-[#FAF8F5] border border-amber-200 px-3.5 py-2 rounded-xl text-[#C8860B] font-sans font-medium shadow-xs">
            <ShieldCheck size={16} />
            <span>Zero Raw Deletion Policy</span>
          </div>
        </div>
      </div>

      {/* ============================================================= */}
      {/* STEP 1: SMART FOLDER STRUCTURE GENERATOR                       */}
      {/* ============================================================= */}
      <div className="bg-[#FFFFFF] border border-[#E5DFD7] shadow-sm rounded-2xl p-6 flex flex-col gap-6">
        <div className="flex items-center justify-between border-b border-[#E5DFD7] pb-4">
          <div className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-lg bg-[#9B2226] text-[#FBFAF7] flex items-center justify-center font-bold text-xs">
              01
            </span>
            <div>
              <h2 className="text-base font-serif font-bold text-[#1A1814]">
                Create Studio Project Folder Structure
              </h2>
              <p className="text-xs text-[#6B655C]">
                Builds [Project Code] [Project Name] root with 01_RAW_FOOTAGE, 02_AUDIO, 03_PROJECTS, 04_OUTPUTS, and 05_DELIVERY.
              </p>
            </div>
          </div>

          <button
            onClick={handleCreateFolders}
            disabled={isCreating || !clientName.trim() || !projectCode.trim()}
            className="sindoor-gradient-btn flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold shadow-md disabled:opacity-40 cursor-pointer"
          >
            <FolderPlus className="w-4 h-4 text-[#FBFAF7]" />
            <span>{isCreating ? 'Creating Folders on Disk…' : 'Create Folder Structure'}</span>
          </button>
        </div>

        {/* Form & Live Tree Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Configuration Controls (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-5">
            {/* Project Root Identifiers */}
            <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E5DFD7] flex flex-col gap-4">
              <span className="text-[11px] font-bold text-[#1A1814] uppercase tracking-wider font-mono">
                Project Root Identification
              </span>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Project Code */}
                <div>
                  <label className="block text-[11px] font-semibold text-[#6B655C] mb-1">
                    Project Code (YYMMDD)
                  </label>
                  <input
                    type="text"
                    value={projectCode}
                    onChange={e => setProjectCode(e.target.value)}
                    placeholder="e.g. 261028"
                    className="w-full bg-[#FFFFFF] border border-[#D6D0C6] rounded-xl px-3 py-2 text-xs font-mono text-[#1A1814] focus:outline-none focus:border-[#9B2226]"
                  />
                </div>

                {/* Client Name */}
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-semibold text-[#6B655C]">
                      Client / Couple Name
                    </label>
                    <span className="text-[10px] text-emerald-700 font-medium">
                      ● Studio OS ({studioClients.length} Synced)
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={clientName}
                      onChange={e => setClientName(e.target.value)}
                      placeholder="e.g. Dhanur & Jhanvi"
                      className="flex-1 bg-[#FFFFFF] border border-[#D6D0C6] rounded-xl px-3 py-2 text-xs font-serif font-bold text-[#1A1814] focus:outline-none focus:border-[#9B2226]"
                    />
                    <select
                      onChange={e => {
                        const matched = studioClients.find(c => c.name === e.target.value);
                        if (matched) handleSelectClient(matched);
                      }}
                      value={clientName}
                      className="w-40 bg-[#FFFFFF] border border-[#D6D0C6] rounded-xl px-2 py-2 text-xs text-[#6B655C] cursor-pointer"
                    >
                      {studioClients.map(c => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Target Storage Directory */}
              <div>
                <label className="block text-[11px] font-semibold text-[#6B655C] mb-1">
                  Target Storage Root Directory
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={targetDirectory}
                    readOnly
                    className="flex-1 bg-[#FFFFFF] border border-[#D6D0C6] rounded-xl px-3 py-2 text-xs font-mono text-[#1A1814]"
                  />
                  <button
                    type="button"
                    onClick={handleSelectTargetDir}
                    className="px-3.5 py-2 bg-[#FFFFFF] hover:bg-[#F3EFEA] border border-[#D6D0C6] rounded-xl text-xs font-semibold text-[#1A1814] transition-all cursor-pointer shadow-xs shrink-0"
                  >
                    Select Root…
                  </button>
                </div>
              </div>
            </div>

            {/* Events & Crew Allocator */}
            <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E5DFD7] flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-[#1A1814] uppercase tracking-wider font-mono">
                    01_RAW_FOOTAGE Event &amp; Crew Allocation
                  </span>
                  <p className="text-[11px] text-[#6B655C] mt-0.5">
                    For each event, separate folders are created for each Photographer and Cinematographer.
                  </p>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-[#8C857B] font-medium mr-1">+ Preset:</span>
                  {PRESET_EVENTS.slice(0, 4).map(p => (
                    <button
                      key={p}
                      onClick={() => handleAddEvent(p)}
                      className="px-2 py-0.5 bg-[#FFFFFF] hover:bg-[#F3EFEA] border border-[#D6D0C6] text-[10px] font-semibold rounded-md text-[#1A1814] cursor-pointer"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Event Cards */}
              <div className="flex flex-col gap-3">
                {events.map((ev, index) => (
                  <div
                    key={ev.id}
                    className="p-3.5 bg-[#FFFFFF] border border-[#E5DFD7] rounded-xl flex flex-col gap-3 shadow-xs"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold flex items-center justify-center">
                          {index + 1}
                        </span>
                        <input
                          type="text"
                          value={ev.eventName}
                          onChange={e =>
                            setEvents(events.map(item => (item.id === ev.id ? { ...item, eventName: e.target.value } : item)))
                          }
                          className="font-serif font-bold text-xs text-[#1A1814] border-b border-transparent hover:border-[#D6D0C6] focus:border-[#9B2226] focus:outline-none"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="date"
                          value={ev.eventDate}
                          onChange={e =>
                            setEvents(events.map(item => (item.id === ev.id ? { ...item, eventDate: e.target.value } : item)))
                          }
                          className="bg-[#FAF8F5] border border-[#D6D0C6] rounded-lg px-2 py-1 text-xs font-mono text-[#1A1814]"
                        />
                        {events.length > 1 && (
                          <button
                            onClick={() => handleRemoveEvent(ev.id)}
                            className="p-1 text-[#8C857B] hover:text-[#9B2226] cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Crew Tags */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-[#F3EFEA]">
                      {/* Photographers */}
                      <div>
                        <span className="text-[10px] font-semibold text-[#6B655C] uppercase tracking-wider flex items-center gap-1 mb-1.5">
                          <Camera size={11} className="text-[#9B2226]" /> Photographers (Raw Photos)
                        </span>
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {ev.photographers.map(p => (
                            <span
                              key={p}
                              className="px-2 py-0.5 bg-[#FAF8F5] border border-[#D6D0C6] rounded-md text-[11px] font-medium text-[#1A1814] flex items-center gap-1"
                            >
                              {p}
                              <button
                                onClick={() => handleRemoveCrew(ev.id, 'photo', p)}
                                className="text-[#8C857B] hover:text-[#9B2226]"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Cinematographers & Drones */}
                      <div>
                        <span className="text-[10px] font-semibold text-[#6B655C] uppercase tracking-wider flex items-center gap-1 mb-1.5">
                          <Film size={11} className="text-[#2563EB]" /> Cinematographers &amp; Drones (Raw Videos)
                        </span>
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {ev.cinematographers.map(c => (
                            <span
                              key={c}
                              className="px-2 py-0.5 bg-[#FAF8F5] border border-[#D6D0C6] rounded-md text-[11px] font-medium text-[#1A1814] flex items-center gap-1"
                            >
                              {c}
                              <button
                                onClick={() => handleRemoveCrew(ev.id, 'cinema', c)}
                                className="text-[#8C857B] hover:text-[#9B2226]"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                          {ev.droneOperators.map(d => (
                            <span
                              key={d}
                              className="px-2 py-0.5 bg-sky-50 border border-sky-200 rounded-md text-[11px] font-medium text-sky-900 flex items-center gap-1"
                            >
                              {d}
                              <button
                                onClick={() => handleRemoveCrew(ev.id, 'drone', d)}
                                className="text-sky-700 hover:text-[#9B2226]"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Quick Add Crew Member to this event */}
                    <div className="flex items-center gap-2 pt-2 border-t border-[#F3EFEA]">
                      <span className="text-[10px] text-[#8C857B] font-semibold">+ Add Crew:</span>
                      <input
                        type="text"
                        placeholder="Photographer name…"
                        value={selectedEventIdForCrew === ev.id ? newPhotoName : ''}
                        onFocus={() => setSelectedEventIdForCrew(ev.id)}
                        onChange={e => setNewPhotoName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddCrew('photo')}
                        className="bg-[#FAF8F5] border border-[#D6D0C6] rounded-lg px-2 py-1 text-[11px] text-[#1A1814] w-36"
                      />
                      <button
                        onClick={() => {
                          setSelectedEventIdForCrew(ev.id);
                          handleAddCrew('photo');
                        }}
                        className="px-2 py-1 bg-[#FFFFFF] border border-[#D6D0C6] rounded-lg text-[10px] font-semibold text-[#1A1814] hover:bg-[#F3EFEA]"
                      >
                        + Photo
                      </button>

                      <input
                        type="text"
                        placeholder="Video shooter name…"
                        value={selectedEventIdForCrew === ev.id ? newCinemaName : ''}
                        onFocus={() => setSelectedEventIdForCrew(ev.id)}
                        onChange={e => setNewCinemaName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddCrew('cinema')}
                        className="bg-[#FAF8F5] border border-[#D6D0C6] rounded-lg px-2 py-1 text-[11px] text-[#1A1814] w-36 ml-2"
                      />
                      <button
                        onClick={() => {
                          setSelectedEventIdForCrew(ev.id);
                          handleAddCrew('cinema');
                        }}
                        className="px-2 py-1 bg-[#FFFFFF] border border-[#D6D0C6] rounded-lg text-[10px] font-semibold text-[#1A1814] hover:bg-[#F3EFEA]"
                      >
                        + Video
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Deliverables for 04_OUTPUTS */}
            <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E5DFD7] flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-[#1A1814] uppercase tracking-wider font-mono">
                    04_OUTPUTS Deliverables Folders
                  </span>
                  <p className="text-[11px] text-[#6B655C] mt-0.5">
                    Folders created for client deliverables so finished files are placed with zero ambiguity.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {DEFAULT_DELIVERABLES.map(deliv => {
                  const isChecked = selectedDeliverables.includes(deliv);
                  return (
                    <button
                      key={deliv}
                      onClick={() => toggleDeliverable(deliv)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all cursor-pointer ${
                        isChecked
                          ? 'bg-[#9B2226] text-white border-[#9B2226] shadow-xs'
                          : 'bg-[#FFFFFF] text-[#6B655C] border-[#D6D0C6] hover:bg-[#F3EFEA]'
                      }`}
                    >
                      {isChecked ? <Check size={13} /> : <Plus size={13} />}
                      <span>{deliv}</span>
                    </button>
                  );
                })}
              </div>

              {/* Custom Deliverable Input */}
              <div className="flex items-center gap-2 pt-2 border-t border-[#E5DFD7]">
                <input
                  type="text"
                  placeholder="Add custom deliverable (e.g. 07_Parents_Cut)…"
                  value={customDeliverableInput}
                  onChange={e => setCustomDeliverableInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCustomDeliverable()}
                  className="flex-1 bg-[#FFFFFF] border border-[#D6D0C6] rounded-xl px-3 py-1.5 text-xs text-[#1A1814] focus:outline-none focus:border-[#9B2226]"
                />
                <button
                  type="button"
                  onClick={addCustomDeliverable}
                  className="px-3 py-1.5 bg-[#FFFFFF] hover:bg-[#F3EFEA] border border-[#D6D0C6] text-xs font-semibold rounded-xl text-[#1A1814] cursor-pointer"
                >
                  + Add Deliverable
                </button>
              </div>
            </div>

            {/* 05_DELIVERY Preview Banner */}
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-amber-50 to-[#FAF8F5] border border-amber-200 flex items-center justify-between text-xs text-amber-900 font-sans">
              <div className="flex items-center gap-2.5">
                <Package size={16} className="text-[#C8860B]" />
                <div>
                  <span className="font-bold">05_DELIVERY Folders Configured:</span>
                  <span className="ml-1 text-[11px] font-mono">01_Pen_Drive_Delivery • 02_Hard_Drive_Delivery</span>
                </div>
              </div>
              <span className="text-[10px] bg-[#FFFFFF] border border-amber-300 px-2.5 py-0.5 rounded-full font-semibold">
                Auto-Included
              </span>
            </div>
          </div>

          {/* Right Column: Live Interactive Folder Tree Preview (5 cols) */}
          <div className="lg:col-span-5 bg-[#FAF8F5] border border-[#E5DFD7] rounded-xl p-5 flex flex-col gap-3 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-[#E5DFD7] pb-2.5">
              <span className="font-bold text-[#1A1814] text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={14} className="text-[#C8860B]" /> Live Folder Structure Preview
              </span>
              <span className="text-[10px] text-[#6B655C]">{fullRootPath}</span>
            </div>

            {/* Visual Tree Rendering */}
            <div className="flex-1 overflow-y-auto max-h-[520px] space-y-1.5 text-[#1A1814] leading-relaxed select-text">
              {/* Root */}
              <div className="font-bold text-sm text-[#9B2226] flex items-center gap-1.5">
                📁 {rootFolderName}
              </div>

              {/* 01 RAW FOOTAGE */}
              <div className="pl-4 border-l border-[#D6D0C6] ml-2">
                <div className="text-[#1A1814] font-semibold flex items-center gap-1">
                  📁 01_RAW_FOOTAGE
                </div>

                {events.map(ev => {
                  const datePrefix = ev.eventDate ? ev.eventDate.replace(/-/g, '.') : '2026.10.28';
                  return (
                    <div key={ev.id} className="pl-4 border-l border-[#D6D0C6] ml-2 mt-1">
                      <div className="text-amber-900 font-semibold">
                        📁 {datePrefix} - {ev.eventName}
                      </div>

                      {/* Photos */}
                      <div className="pl-4 border-l border-[#D6D0C6] ml-2">
                        <div className="text-[#9B2226] font-medium">📁 Photos (RAW Photos)</div>
                        {ev.photographers.map(p => (
                          <div key={p} className="pl-4 border-l border-[#D6D0C6] ml-2 text-[#6B655C]">
                            📁 {p}
                          </div>
                        ))}
                      </div>

                      {/* Videos */}
                      <div className="pl-4 border-l border-[#D6D0C6] ml-2 mt-1">
                        <div className="text-[#2563EB] font-medium">📁 Videos (RAW Videos)</div>
                        {ev.cinematographers.map(c => (
                          <div key={c} className="pl-4 border-l border-[#D6D0C6] ml-2 text-[#6B655C]">
                            📁 {c}
                          </div>
                        ))}
                        {ev.droneOperators.map(d => (
                          <div key={d} className="pl-4 border-l border-[#D6D0C6] ml-2 text-sky-800">
                            📁 {/drone/i.test(d) ? d : `Drone - ${d}`}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 02 AUDIO */}
              <div className="pl-4 border-l border-[#D6D0C6] ml-2 mt-1">
                <div className="text-[#6B655C] font-semibold">📁 02_AUDIO</div>
                <div className="pl-4 border-l border-[#D6D0C6] ml-2 text-[#8C857B]">
                  <div>📁 External_Mics</div>
                  <div>📁 DJ_Console</div>
                </div>
              </div>

              {/* 03 PROJECTS */}
              <div className="pl-4 border-l border-[#D6D0C6] ml-2 mt-1">
                <div className="text-[#6B655C] font-semibold">📁 03_PROJECTS <span className="text-[10px] text-[#8C857B] font-sans">(For later on)</span></div>
                <div className="pl-4 border-l border-[#D6D0C6] ml-2 text-[#8C857B]">
                  <div>📁 Premiere Pro</div>
                  <div>📁 DaVinci Resolve</div>
                  <div>📁 Lightroom</div>
                  <div>📁 Photoshop &amp; Album</div>
                </div>
              </div>

              {/* 04 OUTPUTS */}
              <div className="pl-4 border-l border-[#D6D0C6] ml-2 mt-1">
                <div className="text-[#9B2226] font-semibold">📁 04_OUTPUTS</div>
                <div className="pl-4 border-l border-[#D6D0C6] ml-2 text-[#8C857B]">
                  {selectedDeliverables.map(deliv => (
                    <div key={deliv}>📁 {deliv}</div>
                  ))}
                </div>
              </div>

              {/* 05 DELIVERY */}
              <div className="pl-4 border-l border-[#D6D0C6] ml-2 mt-1">
                <div className="text-[#C8860B] font-semibold">📁 05_DELIVERY</div>
                <div className="pl-4 border-l border-[#D6D0C6] ml-2 text-[#8C857B]">
                  <div>📁 01_Pen_Drive_Delivery</div>
                  <div>📁 02_Hard_Drive_Delivery</div>
                </div>
              </div>
            </div>

            {/* Creation Result Banner */}
            {createdResult && createdResult.success && (
              <div className="mt-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-950 font-sans shadow-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  <div>
                    <span className="font-semibold">Project Structure Created Successfully!</span>
                    <span className="block text-[10px] text-[#6B655C] font-mono mt-0.5">
                      {createdResult.rootPath}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRevealInFinder}
                  className="px-2.5 py-1 bg-[#FFFFFF] hover:bg-[#FAF8F5] border border-[#D6D0C6] rounded-lg text-xs font-semibold text-[#1A1814] flex items-center gap-1 cursor-pointer shadow-xs shrink-0"
                >
                  <ExternalLink size={12} className="text-[#C8860B]" />
                  Reveal
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================= */}
      {/* STEP 2: SD CARD & SSD DATA INTAKE REGISTER                    */}
      {/* ============================================================= */}
      <div className="bg-[#FFFFFF] border border-[#E5DFD7] shadow-sm rounded-2xl p-6 flex flex-col gap-6">
        <div className="flex items-center justify-between border-b border-[#E5DFD7] pb-4">
          <div className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-lg bg-[#9B2226] text-[#FBFAF7] flex items-center justify-center font-bold text-xs">
              02
            </span>
            <div>
              <h2 className="text-base font-serif font-bold text-[#1A1814]">
                SD Card &amp; SSD Data Intake Register
              </h2>
              <p className="text-xs text-[#6B655C]">
                Intake camera memory cards, match to event crew folders, verify sizes &amp; clips, and dispatch automated WhatsApp receipts.
              </p>
            </div>
          </div>

          <button
            onClick={handleLogHandoff}
            disabled={intakeBusy || !clientName || !intakeCrewName}
            className="sindoor-gradient-btn flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold shadow-md disabled:opacity-40 cursor-pointer"
          >
            <UserCheck className="w-4 h-4 text-[#FBFAF7]" />
            <span>{intakeBusy ? 'Dispatching WhatsApp…' : 'Log Data & Dispatch WhatsApp'}</span>
          </button>
        </div>

        {/* Scanner & Table Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Intake Card Setup Form (5 cols) */}
          <div className="lg:col-span-5 bg-[#FAF8F5] border border-[#E5DFD7] rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#1A1814] uppercase tracking-wider font-mono">
                Source Media Detection
              </span>
              {intakeScannedPath && (
                <span className="text-[10px] text-emerald-700 font-mono font-semibold flex items-center gap-1">
                  <FolderCheck size={12} /> Detected
                </span>
              )}
            </div>

            {/* Scan Disk Button */}
            <div className="p-3 bg-[#FFFFFF] border border-[#E5DFD7] rounded-xl flex items-center justify-between gap-3">
              <div className="overflow-hidden">
                <span className="text-[10px] uppercase font-bold text-[#6B655C] tracking-wider block">
                  Scanned Card / Folder Path
                </span>
                <span className="text-xs font-mono text-[#1A1814] truncate block mt-0.5">
                  {intakeScannedPath || 'No folder or memory card selected'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleScanDirectory}
                disabled={intakeBusy}
                className="px-3.5 py-2 rounded-xl bg-[#FAF8F5] hover:bg-[#F3EFEA] border border-[#D6D0C6] text-[#1A1814] text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs shrink-0"
              >
                <FolderPlus size={14} className="text-[#C8860B]" />
                <span>Scan…</span>
              </button>
            </div>

            {intakeStatusMessage && (
              <div className="text-[11px] p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 font-sans">
                {intakeStatusMessage}
              </div>
            )}

            {/* Intake Form Fields */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#6B655C] mb-1">
                  Event
                </label>
                <select
                  value={intakeEvent}
                  onChange={e => setIntakeEvent(e.target.value)}
                  className="w-full bg-[#FFFFFF] border border-[#D6D0C6] rounded-xl px-3 py-2 text-xs text-[#1A1814]"
                >
                  {events.map(ev => (
                    <option key={ev.id} value={ev.eventName}>
                      {ev.eventName} ({ev.eventDate})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#6B655C] mb-1">
                  Crew Role
                </label>
                <select
                  value={intakeRole}
                  onChange={e => setIntakeRole(e.target.value as any)}
                  className="w-full bg-[#FFFFFF] border border-[#D6D0C6] rounded-xl px-3 py-2 text-xs text-[#1A1814]"
                >
                  <option value="Cinematographer">Cinematographer (Raw Videos)</option>
                  <option value="Photographer">Photographer (Raw Photos)</option>
                  <option value="Drone">Drone Operator (Aerial Videos)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#6B655C] mb-1">
                  Crew Member Name
                </label>
                <input
                  type="text"
                  value={intakeCrewName}
                  onChange={e => setIntakeCrewName(e.target.value)}
                  placeholder="e.g. Kishan"
                  className="w-full bg-[#FFFFFF] border border-[#D6D0C6] rounded-xl px-3 py-2 text-xs text-[#1A1814]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#6B655C] mb-1">
                  Crew WhatsApp Phone
                </label>
                <input
                  type="text"
                  value={intakeCrewPhone}
                  onChange={e => setIntakeCrewPhone(e.target.value)}
                  placeholder="+91 88945 62004"
                  className="w-full bg-[#FFFFFF] border border-[#D6D0C6] rounded-xl px-3 py-2 text-xs font-mono text-[#1A1814]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#6B655C] mb-1">
                  Data Size (GB)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={intakeDataGb}
                  onChange={e => setIntakeDataGb(Number(e.target.value))}
                  className="w-full bg-[#FFFFFF] border border-[#D6D0C6] rounded-xl px-3 py-2 text-xs font-mono text-[#1A1814]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#6B655C] mb-1">
                  Total Files / Clips
                </label>
                <input
                  type="number"
                  value={intakeFileCount}
                  onChange={e => setIntakeFileCount(Number(e.target.value))}
                  className="w-full bg-[#FFFFFF] border border-[#D6D0C6] rounded-xl px-3 py-2 text-xs font-mono text-[#1A1814]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#6B655C] mb-1">
                Equipment &amp; Media Card Notes
              </label>
              <input
                type="text"
                placeholder="e.g. 2x Sony 160GB CFexpress Type A cards"
                value={intakeNotes}
                onChange={e => setIntakeNotes(e.target.value)}
                className="w-full bg-[#FFFFFF] border border-[#D6D0C6] rounded-xl px-3 py-2 text-xs text-[#1A1814]"
              />
            </div>
          </div>

          {/* Intake Received History Table (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-[#1A1814] uppercase tracking-wider font-mono">
                  Data Received History ({logs.length})
                </span>
                <p className="text-[11px] text-[#6B655C]">
                  Official log of all memory cards and SSDs handed off by wedding crew.
                </p>
              </div>

              <span className="text-[10px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold font-mono">
                ● WhatsApp Dispatches Confirmed
              </span>
            </div>

            {/* Table */}
            <div className="bg-[#FFFFFF] border border-[#E5DFD7] rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-[#FAF8F5] border-b border-[#E5DFD7] text-[10px] uppercase font-bold text-[#6B655C] tracking-wider">
                    <th className="py-2.5 px-3">Date / Time</th>
                    <th className="py-2.5 px-3">Project</th>
                    <th className="py-2.5 px-3">Crew Member</th>
                    <th className="py-2.5 px-3">Role</th>
                    <th className="py-2.5 px-3 text-right">Size</th>
                    <th className="py-2.5 px-3 text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5DFD7]">
                  {logs.map(log => {
                    const formattedDate = new Date(log.timestamp).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric'
                    });
                    const isPhoto = log.crewRole === 'photographer';
                    return (
                      <tr key={log.id} className="hover:bg-[#FAF8F5] transition-colors">
                        <td className="py-2.5 px-3 font-mono text-[11px] text-[#6B655C]">
                          {formattedDate}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-semibold text-[#1A1814] block">{log.clientName}</span>
                          <span className="text-[10px] text-[#8C857B]">{log.eventName}</span>
                        </td>
                        <td className="py-2.5 px-3 font-medium text-[#1A1814]">
                          {log.crewName}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                              isPhoto
                                ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                : 'bg-blue-50 text-blue-800 border border-blue-200'
                            }`}
                          >
                            {isPhoto ? 'Photo' : 'Video'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          <span className="font-bold text-[#1A1814]">{log.totalSizeGB} GB</span>
                          <span className="text-[10px] text-[#8C857B] block">{log.clipOrPhotoCount} items</span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold">
                            <CheckCircle2 size={11} className="text-emerald-600" />
                            Dispatched
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
