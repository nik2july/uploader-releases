import React, { useState, useEffect } from 'react';
import {
  FolderTree,
  FolderOpen,
  CheckCircle2,
  Plus,
  Trash2,
  ExternalLink,
  Video,
  FolderCheck,
  Film,
  Sparkles
} from 'lucide-react';
import type { EventFolderPlan, FolderCreationResult, StudioClientData, ActiveStudioProject } from '@shared/contracts';
import { STUDIO_WEB_APP_CLIENTS } from '@shared/studioClients';
import { computeProjectRootFolderName, resolveMainEvent } from '@shared/naming';
import { saveActiveStudioProject } from '@shared/smartPathResolver';
import type { TabId } from './Sidebar';

const PRESET_EVENTS = ['Wedding', 'Sangeet', 'Mehendi', 'Haldi', 'Reception', 'Cocktail', 'Pre-Wedding'];

interface FolderCreatorViewProps {
  onTabChange?: (tab: TabId) => void;
}

export const FolderCreatorView: React.FC<FolderCreatorViewProps> = ({ onTabChange }) => {
  const [studioClients, setStudioClients] = useState<StudioClientData[]>(STUDIO_WEB_APP_CLIENTS);
  const [selectedClient, setSelectedClient] = useState<StudioClientData | null>(() => {
    return STUDIO_WEB_APP_CLIENTS.find(c => c.name.includes('Dhanur')) || STUDIO_WEB_APP_CLIENTS[0];
  });

  const defaultClient = STUDIO_WEB_APP_CLIENTS.find(c => c.name.includes('Dhanur')) || STUDIO_WEB_APP_CLIENTS[0];
  const initialEvent = defaultClient?.events[0];

  const [clientName, setClientName] = useState(defaultClient?.name || 'Dhanur & Jhanvi');
  const [eventName, setEventName] = useState(initialEvent?.eventName || 'Wedding');
  const [eventDate, setEventDate] = useState(initialEvent?.date || '2026-10-28');
  const [targetDirectory, setTargetDirectory] = useState('/Volumes/40');
  const [createRawCameras, setCreateRawCameras] = useState(false);

  const [cinematographers, setCinematographers] = useState<string[]>(
    initialEvent?.cinematographers?.length ? initialEvent.cinematographers : ['Kishan']
  );
  const [newCinema, setNewCinema] = useState('');

  const [droneOperators, setDroneOperators] = useState<string[]>(
    initialEvent?.droneOperators?.length ? initialEvent.droneOperators : []
  );
  const [newDrone, setNewDrone] = useState('');

  const [createdResult, setCreatedResult] = useState<FolderCreationResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (window.clipsApi?.getStudioClients) {
      window.clipsApi.getStudioClients().then(list => {
        if (list && list.length > 0) {
          setStudioClients(list);
          const matched = list.find(c => c.name.includes('Dhanur'));
          if (matched && (!selectedClient || selectedClient.id !== matched.id)) {
            setSelectedClient(matched);
          }
        }
      }).catch(() => {});
    }
  }, []);

  const handleSelectClient = (client: StudioClientData) => {
    setSelectedClient(client);
    setClientName(client.name);
    if (client.events && client.events.length > 0) {
      const firstEv = client.events[0];
      setEventName(firstEv.eventName);
      setEventDate(firstEv.date);
      setCinematographers(firstEv.cinematographers?.length ? firstEv.cinematographers : ['Kishan']);
      setDroneOperators(firstEv.droneOperators?.length ? firstEv.droneOperators : []);
    }
  };

  const handleSelectEvent = (evName: string) => {
    setEventName(evName);
    const matchedEv = selectedClient?.events?.find(e => e.eventName === evName);
    if (matchedEv) {
      setEventDate(matchedEv.date);
      if (matchedEv.cinematographers?.length) setCinematographers(matchedEv.cinematographers);
      if (matchedEv.droneOperators?.length) setDroneOperators(matchedEv.droneOperators);
    }
  };

  const handleSelectTargetDir = async () => {
    const dir = await window.clipsApi.openDirectory(targetDirectory);
    if (dir) setTargetDirectory(dir);
  };

  const addCinematographer = () => {
    if (newCinema.trim() && !cinematographers.includes(newCinema.trim())) {
      setCinematographers([...cinematographers, newCinema.trim()]);
      setNewCinema('');
    }
  };

  const removeCinematographer = (name: string) => {
    setCinematographers(cinematographers.filter(c => c !== name));
  };

  const addDrone = () => {
    if (newDrone.trim() && !droneOperators.includes(newDrone.trim())) {
      setDroneOperators([...droneOperators, newDrone.trim()]);
      setNewDrone('');
    }
  };

  const removeDrone = (name: string) => {
    setDroneOperators(droneOperators.filter(d => d !== name));
  };

  // Determine main event (Priority 1: Wedding, Priority 2: Max Cinematographers in YYMMDD format)
  const mainEvent = resolveMainEvent(selectedClient?.events, eventName, eventDate, cinematographers);
  const rootFolderName = computeProjectRootFolderName(
    clientName,
    selectedClient?.events,
    eventDate,
    eventName,
    cinematographers
  );

  const handleCreate = async () => {
    if (!clientName || !eventName || !targetDirectory) return;
    setBusy(true);
    setCreatedResult(null);

    const plan: EventFolderPlan = {
      clientName,
      coupleName: clientName,
      eventName,
      eventDate,
      cinematographers,
      droneOperators,
      photographers: [],
      targetDirectory,
      createRawCameras,
      customRootFolderName: rootFolderName,
      mainEventDate: mainEvent.date
    };

    const res = await window.clipsApi.createFolderStructure(plan);
    setCreatedResult(res);
    setBusy(false);

    if (res.success && res.rootPath) {
      const dFormatted = plan.eventDate ? plan.eventDate.replace(/-/g, '.') : '2026.10.28';
      const eventSub = `${dFormatted} - ${plan.eventName}`;
      const eventRawFolder = `${res.rootPath}/01_RAW_FOOTAGE/${eventSub}`;

      const activeProj: ActiveStudioProject = {
        projectName: res.rootPath.split('/').pop() || rootFolderName,
        clientName: plan.clientName,
        eventName: plan.eventName,
        eventDate: plan.eventDate,
        rootPath: res.rootPath,
        rawSourcePath: eventRawFolder,
        rec709DestinationPath: `${res.rootPath}/05_CLIENT_CLIPS_DELIVERY`,
        clientDeliveryDestinationPath: `${res.rootPath}/05_CLIENT_CLIPS_DELIVERY`,
        editedSourcePath: `${res.rootPath}/04_RENDER_DELIVERABLES`,
        cinematographers: plan.cinematographers,
        updatedAt: new Date().toISOString()
      };

      saveActiveStudioProject(activeProj);
      if (window.clipsApi?.setActiveProject) {
        window.clipsApi.setActiveProject(activeProj).catch(() => {});
      }
    }
  };

  const handleReveal = async () => {
    if (createdResult?.rootPath) {
      await window.clipsApi.revealFolder(createdResult.rootPath);
    }
  };

  const dateFormatted = eventDate ? eventDate.replace(/-/g, '.') : '2026.11.25';

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-6 gap-6 bg-[#FBFAF7] text-[#1A1814]">
      {/* Title */}
      <div className="flex items-center justify-between pb-4 border-b border-[#E5DFD7]">
        <div>
          <h1 className="text-xl font-bold font-serif flex items-center gap-2.5 text-[#1A1814]">
            <FolderTree className="w-5 h-5 text-[#C8860B]" />
            Generate Studio Project Folder Structure
          </h1>
          <p className="text-xs text-[#6B655C] mt-1 font-sans">
            Builds multi-cam raw folders, Rec.709 lut directories, and edit deliverable trees for Cinematographers &amp; Drones.
          </p>
        </div>

        <button
          onClick={handleCreate}
          disabled={busy || !clientName || !targetDirectory}
          className="sindoor-gradient-btn flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold shadow-md disabled:opacity-40 cursor-pointer"
        >
          <FolderCheck className="w-4 h-4 text-[#FBFAF7]" />
          {busy ? 'Creating Folders…' : 'Create Folder Structure'}
        </button>
      </div>

      {/* Main Form & Tree Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Input Form */}
        <div className="flex flex-col gap-5">
          {/* Client & Event Info */}
          <div className="bg-[#FFFFFF] border border-[#E5DFD7] shadow-sm rounded-2xl p-5 flex flex-col gap-4">
            <h3 className="text-xs font-bold text-[#1A1814] uppercase tracking-wider font-mono">
              Client &amp; Event Details
            </h3>

            {/* Client Picker */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs text-[#6B655C] font-medium">Client / Couple Name</label>
                <span className="text-[10px] text-[#2A9D8F] flex items-center gap-1 font-mono font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2A9D8F] inline-block animate-pulse"></span>
                  Studio OS Synced ({studioClients.length} Clients)
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={clientName}
                  onChange={e => {
                    setClientName(e.target.value);
                    const matched = studioClients.find(c => c.name.toLowerCase() === e.target.value.toLowerCase());
                    if (matched) setSelectedClient(matched);
                  }}
                  placeholder="e.g. Dhanur & Jhanvi"
                  className="flex-1 bg-[#FFFFFF] border border-[#D6D0C6] rounded-lg px-3 py-2 text-xs text-[#1A1814] focus:outline-none focus:border-[#9B2226]"
                />
                <select
                  value={selectedClient?.name || ''}
                  onChange={e => {
                    const client = studioClients.find(c => c.name === e.target.value);
                    if (client) handleSelectClient(client);
                  }}
                  className="bg-[#FFFFFF] border border-[#D6D0C6] rounded-lg px-2.5 py-2 text-xs text-[#1A1814] focus:outline-none focus:border-[#9B2226] max-w-[210px]"
                >
                  <option value="" disabled>Select Studio Client…</option>
                  {studioClients.map(c => (
                    <option key={c.id || c.name} value={c.name}>
                      {c.name} {c.name.includes('Dhanur') ? '★ (Active)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Computed Project Root Folder */}
            <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#FAF8F5] border border-[#E5DFD7] text-xs font-mono">
              <span className="text-[#6B655C] flex items-center gap-1.5 font-sans font-medium">
                <FolderTree className="w-3.5 h-3.5 text-[#C8860B]" />
                Main Event Date Prefix:
              </span>
              <span className="text-[#9B2226] font-bold">
                📁 {rootFolderName}
              </span>
            </div>

            {/* Event Name & Date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-[#6B655C] font-medium">Event Name</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={eventName}
                    onChange={e => setEventName(e.target.value)}
                    placeholder="e.g. Wedding"
                    className="flex-1 bg-[#FFFFFF] border border-[#D6D0C6] rounded-lg px-3 py-2 text-xs text-[#1A1814] focus:outline-none focus:border-[#9B2226]"
                  />
                  <select
                    onChange={e => handleSelectEvent(e.target.value)}
                    value={eventName}
                    className="bg-[#FFFFFF] border border-[#D6D0C6] rounded-lg px-2 py-2 text-xs text-[#1A1814] focus:outline-none focus:border-[#9B2226]"
                  >
                    {selectedClient?.events && selectedClient.events.length > 0 ? (
                      <optgroup label={`${selectedClient.name} Events`}>
                        {selectedClient.events.map(ev => (
                          <option key={ev.eventName} value={ev.eventName}>
                            {ev.eventName} ({ev.date})
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    <optgroup label="Standard Types">
                      {PRESET_EVENTS.map(ev => (
                        <option key={ev} value={ev}>
                          {ev}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-[#6B655C] font-medium">Event Date</label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={e => setEventDate(e.target.value)}
                  className="bg-[#FFFFFF] border border-[#D6D0C6] rounded-lg px-3 py-2 text-xs text-[#1A1814] focus:outline-none focus:border-[#9B2226]"
                />
              </div>
            </div>

            {/* Target Storage Location */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-[#6B655C] font-medium">Target Drive / Storage Root</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={targetDirectory}
                  className="flex-1 bg-[#FAF8F5] border border-[#D6D0C6] rounded-lg px-3 py-2 text-xs text-[#1A1814] font-mono focus:outline-none"
                />
                <button
                  onClick={handleSelectTargetDir}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FFFFFF] hover:bg-[#FAF8F5] border border-[#D6D0C6] text-xs font-semibold text-[#1A1814] cursor-pointer shadow-xs"
                >
                  <FolderOpen className="w-4 h-4 text-[#C8860B]" />
                  Select Root…
                </button>
              </div>
            </div>
          </div>

          {/* Crew Allocation Inputs */}
          <div className="bg-[#FFFFFF] border border-[#E5DFD7] shadow-sm rounded-2xl p-5 flex flex-col gap-4">
            <h3 className="text-xs font-bold text-[#1A1814] uppercase tracking-wider font-mono">
              Assigned Crew
            </h3>

            {/* Cinematographers */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-[#1A1814] flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5 text-[#C8860B]" />
                Cinematographers (Camera A / B)
              </label>
              <div className="flex flex-wrap gap-2">
                {cinematographers.map(c => (
                  <span
                    key={c}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FAF8F5] border border-[#D6D0C6] text-xs text-[#1A1814]"
                  >
                    {c}
                    <button onClick={() => removeCinematographer(c)} className="text-[#6B655C] hover:text-[#9B2226] cursor-pointer">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2 mt-1">
                <input
                  type="text"
                  value={newCinema}
                  onChange={e => setNewCinema(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCinematographer()}
                  placeholder="Add Cinematographer name…"
                  className="flex-1 bg-[#FFFFFF] border border-[#D6D0C6] rounded-lg px-3 py-1.5 text-xs text-[#1A1814] focus:outline-none focus:border-[#9B2226]"
                />
                <button
                  onClick={addCinematographer}
                  className="px-3 py-1.5 rounded-lg bg-[#FAF8F5] hover:bg-[#F3EFEA] border border-[#D6D0C6] text-xs font-semibold text-[#1A1814] flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
            </div>

            {/* Drone Operators */}
            <div className="flex flex-col gap-2 pt-3 border-t border-[#E5DFD7]">
              <label className="text-xs font-semibold text-[#1A1814] flex items-center gap-1.5">
                <span className="text-xs">🚁</span>
                Drone Operators (Aerial SD Cards)
              </label>
              <div className="flex flex-wrap gap-2">
                {droneOperators.map(d => (
                  <span
                    key={d}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FAF8F5] border border-[#D6D0C6] text-xs text-[#1A1814]"
                  >
                    {d}
                    <button onClick={() => removeDrone(d)} className="text-[#6B655C] hover:text-[#9B2226] cursor-pointer">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2 mt-1">
                <input
                  type="text"
                  value={newDrone}
                  onChange={e => setNewDrone(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addDrone()}
                  placeholder="Add Drone operator name…"
                  className="flex-1 bg-[#FFFFFF] border border-[#D6D0C6] rounded-lg px-3 py-1.5 text-xs text-[#1A1814] focus:outline-none focus:border-[#9B2226]"
                />
                <button
                  onClick={addDrone}
                  className="px-3 py-1.5 rounded-lg bg-[#FAF8F5] hover:bg-[#F3EFEA] border border-[#D6D0C6] text-xs font-semibold text-[#1A1814] flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Structure Tree Preview */}
        <div className="flex flex-col gap-5">
          <div className="bg-[#FFFFFF] border border-[#E5DFD7] shadow-sm rounded-2xl p-5 flex flex-col gap-3 h-full">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-[#1A1814] uppercase tracking-wider font-mono">
                Generated Folder Structure Preview
              </h3>
            </div>

            {/* Tree Mockup */}
            <div className="flex-1 bg-[#FAF8F5] border border-[#E5DFD7] rounded-xl p-4 font-mono text-xs text-[#1A1814] overflow-y-auto leading-relaxed">
              <div className="text-[#9B2226] font-bold flex items-center justify-between pb-1 border-b border-[#E5DFD7]">
                <span>📁 {rootFolderName}</span>
                <span className="text-[10px] font-sans font-normal px-2 py-0.5 rounded bg-[#9B2226]/10 text-[#9B2226] border border-[#9B2226]/20 font-semibold">
                  Main Event: {mainEvent.eventName}
                </span>
              </div>

              {/* 01 RAW */}
              <div className="pl-4 border-l border-[#D6D0C6] ml-2 mt-1">
                <div className="text-[#1A1814] font-semibold">
                  📁 01_RAW_FOOTAGE
                </div>
                <div className="pl-4 border-l border-[#D6D0C6] ml-2 text-[#6B655C]">
                  📁 {dateFormatted} - {eventName}
                  {/* Cinematographers: clean crew name directly */}
                  {cinematographers.map(c => (
                    <div key={c} className="pl-4 border-l border-[#D6D0C6] ml-2 text-[#1A1814]">
                      📁 {c}
                    </div>
                  ))}
                  {/* Drone: only rendered if appointed */}
                  {droneOperators.map(d => {
                    const droneLabel = /drone/i.test(d) ? d : `Drone - ${d}`;
                    return (
                      <div key={d} className="pl-4 border-l border-[#D6D0C6] ml-2 text-[#1A1814]">
                        📁 {droneLabel}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 02 AUDIO */}
              <div className="pl-4 border-l border-[#D6D0C6] ml-2 mt-1">
                <div className="text-[#6B655C]">📁 02_AUDIO</div>
                <div className="pl-4 border-l border-[#D6D0C6] ml-2 text-[#8C857B]">
                  <div>📁 External_Mics</div>
                  <div>📁 DJ_Console</div>
                </div>
              </div>

              {/* 03 PROJECTS */}
              <div className="pl-4 border-l border-[#D6D0C6] ml-2 mt-1">
                <div className="text-[#1A1814] font-semibold">📁 03_PROJECTS</div>
                <div className="pl-4 border-l border-[#D6D0C6] ml-2 text-[#8C857B]">
                  <div>📁 Premiere Pro</div>
                  <div>📁 DaVinci Resolve</div>
                </div>
              </div>

              {/* 04 RENDER DELIVERABLES */}
              <div className="pl-4 border-l border-[#D6D0C6] ml-2 mt-1">
                <div className="text-[#9B2226] font-semibold">📁 04_RENDER_DELIVERABLES</div>
                <div className="pl-4 border-l border-[#D6D0C6] ml-2 text-[#8C857B]">
                  <div>📁 01_Teaser</div>
                  <div>📁 02_Highlight_Film</div>
                  <div>📁 03_Reels</div>
                  <div>📁 04_Full_Length_Feature</div>
                </div>
              </div>

              {/* 05 CLIENT CLIPS DELIVERY */}
              <div className="pl-4 border-l border-[#D6D0C6] ml-2 mt-1">
                <div className="text-[#C8860B] font-semibold">📁 05_CLIENT_CLIPS_DELIVERY</div>
                <div className="pl-4 border-l border-[#D6D0C6] ml-2 text-[#8C857B]">
                  <div>📁 {dateFormatted} - {eventName}</div>
                  <div className="pl-4 border-l border-[#D6D0C6] ml-2 text-[#8C857B]">
                    <div>📁 Raw Clips</div>
                    <div>📁 Edited Videos</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Success Banner */}
            {createdResult && createdResult.success && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex flex-col gap-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 text-xs text-emerald-900 font-semibold">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                    <div>
                      <span>Folder structure created &amp; linked as Active Project!</span>
                      <span className="block text-[11px] text-[#6B655C] font-mono mt-0.5">
                        📁 {createdResult.rootPath}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={handleReveal}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FFFFFF] hover:bg-[#FAF8F5] border border-[#D6D0C6] text-[#1A1814] text-xs font-semibold cursor-pointer transition-all shadow-xs"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-[#C8860B]" /> Reveal in Finder
                  </button>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-emerald-200 flex-wrap">
                  <span className="text-[11px] text-[#6B655C] font-medium mr-1 font-sans">Instant Next Action:</span>
                  <button
                    onClick={() => onTabChange?.('delivery')}
                    className="sindoor-gradient-btn flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-[#FBFAF7] cursor-pointer shadow-sm"
                  >
                    <Film className="w-3.5 h-3.5 text-[#FBFAF7]" />
                    Deliver Client Clips (Raw &amp; Edited) →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
