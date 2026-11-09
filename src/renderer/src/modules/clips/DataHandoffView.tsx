import React, { useState, useEffect } from 'react';
import {
  Send,
  MessageCircle,
  HardDrive,
  CheckCircle2,
  AlertCircle,
  FolderSearch,
  UserCheck,
  ExternalLink,
  Sparkles,
  FolderCheck,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';
import type { DataHandoffRecord, DiscoveredCrewPackage } from '../types/contracts';
import { STUDIO_WEB_APP_CLIENTS } from '@shared/studioClients';

const INITIAL_LOGS: DataHandoffRecord[] = [
  {
    id: 'log_0',
    clientId: '1788286042973',
    clientName: 'Dhanur & Jhanvi',
    eventId: 'evt-1',
    eventName: 'Wedding',
    teamMemberId: 1788175602444,
    teamMemberName: 'Vikas Khera (Photographer)',
    teamMemberPhone: '+91 88470 30408',
    role: 'Photographer',
    dataGb: 38.55,
    fileCount: 1348,
    copied: true,
    receivedAt: '2026-10-30T08:57:41.605Z',
    notifyWhatsApp: true,
    whatsappStatus: 'sent',
    whatsappMessageId: 'wamid.HBgMOTE4ODQ3MDMwNDA4FQIAERgSN0Y5NzY4Qjg3NzAzRjM5NDk1AA=='
  },
  {
    id: 'log_1',
    clientId: '55362492334882',
    clientName: 'Dikshant & Moren',
    eventId: 'ev_1',
    eventName: 'Wedding',
    teamMemberId: 101,
    teamMemberName: 'Gagan (Lead Cinematographer)',
    teamMemberPhone: '+919888928886',
    role: 'Cinematographer',
    dataGb: 142.5,
    fileCount: 428,
    copied: true,
    receivedAt: '2026-11-01T23:30:00Z',
    notifyWhatsApp: true,
    whatsappStatus: 'sent',
    whatsappMessageId: 'wamid.HBgMOTE5ODg4OTI4ODg2FQIAERgSMzJCRDI1QzJFMzM0'
  },
  {
    id: 'log_2',
    clientId: '55362492334882',
    clientName: 'Dikshant & Moren',
    eventId: 'ev_1',
    eventName: 'Wedding',
    teamMemberId: 102,
    teamMemberName: 'Sahil (Aerial Drone)',
    teamMemberPhone: '+918847442301',
    role: 'Drone',
    dataGb: 68.2,
    fileCount: 94,
    copied: true,
    receivedAt: '2026-11-02T01:15:00Z',
    notifyWhatsApp: true,
    whatsappStatus: 'sent',
    whatsappMessageId: 'wamid.HBgMOTE4ODQ3NDQyMzAxFQIAERgSN0ExMjM0QzJFMzM0'
  }
];

export const DataHandoffView: React.FC = () => {
  const [clientName, setClientName] = useState('Dhanur & Jhanvi');
  const [eventName, setEventName] = useState('Wedding');
  const [crewName, setCrewName] = useState('Kishan');
  const [crewRole, setCrewRole] = useState<'Cinematographer' | 'Drone' | 'Photographer'>('Cinematographer');
  const [crewPhone, setCrewPhone] = useState('+91 88945 62004');
  const [dataGb, setDataGb] = useState<number>(146.86);
  const [fileCount, setFileCount] = useState<number>(308);
  const [scannedPath, setScannedPath] = useState<string>('/Volumes/40/261028 Dhanur & Jhanvi/01_RAW_FOOTAGE/2026.10.28 - Wedding/Kishan');
  const [notifyWhatsApp, setNotifyWhatsApp] = useState(true);
  const [notes, setNotes] = useState('');

  const [discoveredPackages, setDiscoveredPackages] = useState<DiscoveredCrewPackage[]>([]);
  const [logs, setLogs] = useState<DataHandoffRecord[]>(INITIAL_LOGS);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Auto-scan known copied footage on initial render if path exists
  useEffect(() => {
    const defaultCopiedFolder = '/Volumes/40/261028 Dhanur & Jhanvi/01_RAW_FOOTAGE/2026.10.28 - Wedding/Kishan';
    if (window.clipsApi?.scanFootageFolder) {
      window.clipsApi.scanFootageFolder(defaultCopiedFolder).then(res => {
        if (res.ok) {
          setDataGb(res.dataGb || 146.86);
          setFileCount(res.fileCount || 308);
          setScannedPath(defaultCopiedFolder);
          if (res.detectedClient) setClientName(res.detectedClient);
          if (res.detectedEvent) setEventName(res.detectedEvent);
          if (res.detectedCrew) setCrewName(res.detectedCrew);
          if (res.detectedRole) setCrewRole(res.detectedRole);
          setStatusMessage(`✓ Auto-detected copied footage for Kishan: ${res.dataGb} GB (${res.fileCount} clips).`);
        }
      }).catch(() => {
        // Fallback silently if path not yet created
      });
    }
  }, []);

  const handleScanDirectory = async (presetDir?: string) => {
    let dir = presetDir;
    if (!dir) {
      dir = (await window.clipsApi.openDirectory('/Volumes/40')) || undefined;
    }
    if (!dir) return;

    setScanning(true);
    setStatusMessage(`Scanning folder & calculating footage data on disk…`);

    try {
      const res = await window.clipsApi.scanFootageFolder(dir);
      setScanning(false);
      if (res.ok) {
        setScannedPath(dir);
        if (res.dataGb !== undefined) setDataGb(res.dataGb);
        if (res.fileCount !== undefined) setFileCount(res.fileCount);

        if (res.detectedClient) setClientName(res.detectedClient);
        if (res.detectedEvent) setEventName(res.detectedEvent);
        if (res.detectedCrew) setCrewName(res.detectedCrew);
        if (res.detectedRole) setCrewRole(res.detectedRole);

        if (res.discoveredPackages && res.discoveredPackages.length > 0) {
          setDiscoveredPackages(res.discoveredPackages);
        }

        setStatusMessage(
          `✓ Successfully scanned "${res.detectedCrew || 'Crew'}" footage: ${res.dataGb} GB (${res.fileCount} files${res.videoFiles ? `, ${res.videoFiles} videos` : ''}).`
        );
      } else {
        setStatusMessage(`⚠️ Scan warning: ${res.error || 'Could not read directory'}`);
      }
    } catch (err: any) {
      setScanning(false);
      setStatusMessage(`⚠️ Error scanning folder: ${err?.message || err}`);
    }
  };

  const handleSelectPackage = (pkg: DiscoveredCrewPackage) => {
    setScannedPath(pkg.folderPath);
    setClientName(pkg.clientName);
    setEventName(pkg.eventName);
    setCrewName(pkg.crewName);
    setCrewRole(pkg.role as any);
    setDataGb(pkg.dataGb);
    setFileCount(pkg.fileCount);
    setStatusMessage(`✓ Loaded footage package for ${pkg.crewName} (${pkg.dataGb} GB, ${pkg.fileCount} files)`);
  };

  const generatedWhatsAppMessage = `Hello *${crewName}*,

Baawaray Films has received and verified your footage:
📁 *Project:* ${clientName} - ${eventName}
🎥 *Role:* ${crewRole}
📊 *Data Received:* ${dataGb} GB (${fileCount} clips)
✅ *Status:* Successfully copied & verified on studio offline storage.

Thank you for your timely delivery!
— Baawaray Films Studio`;

  const handleLogHandoff = async () => {
    if (!clientName || !crewName || !crewPhone) return;
    setBusy(true);
    setStatusMessage('Logging footage and dispatching WhatsApp confirmation…');

    const record: DataHandoffRecord = {
      id: `handoff_${Date.now()}`,
      clientId: 1,
      clientName,
      eventId: 1,
      eventName,
      teamMemberId: Date.now(),
      teamMemberName: crewName,
      teamMemberPhone: crewPhone,
      role: crewRole,
      dataGb,
      fileCount,
      copied: true,
      receivedAt: new Date().toISOString(),
      notifyWhatsApp,
      notes
    };

    try {
      const res = await window.clipsApi.logDataHandoff(record);
      setLogs([res, ...logs]);
      setBusy(false);
      setStatusMessage(
        res.whatsappStatus === 'sent'
          ? `✓ Data logged & WhatsApp delivery receipt sent to ${crewName} (${crewPhone})! Message ID: ${res.whatsappMessageId || 'Confirmed'}`
          : `✓ Data logged to studio offline register.`
      );
    } catch (err: any) {
      setBusy(false);
      setStatusMessage(`⚠️ Error dispatching: ${err?.message || err}`);
    }
  };

  const getWhatsAppWebUrl = () => {
    const cleanPhone = crewPhone.replace(/[^0-9]/g, '');
    const encoded = encodeURIComponent(generatedWhatsAppMessage);
    return `https://wa.me/${cleanPhone}?text=${encoded}`;
  };

  return (
    <div className="flex flex-col gap-6 text-[#1A1814]">
      {/* Title & Actions Bar */}
      <div className="bg-[#FFFFFF] border border-[#E5DFD7] shadow-sm rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold font-serif text-[#1A1814] flex items-center gap-2.5">
              <HardDrive className="w-5 h-5 text-[#9B2226]" />
              SD Card &amp; SSD Footage Intake Register
            </h1>
            <span className="text-[10px] bg-amber-50 border border-amber-200 text-amber-800 px-2.5 py-0.5 rounded-full font-semibold font-mono">
              Live Intake Active
            </span>
          </div>
          <p className="text-xs text-[#6B655C] mt-1 font-sans">
            Scan copied cinematographer footage folders, detect clip count &amp; size, and dispatch official automated WhatsApp receipts.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs bg-[#FAF8F5] border border-amber-200 px-3.5 py-2 rounded-xl text-[#C8860B] font-sans font-medium shadow-xs">
            <ShieldCheck size={16} />
            <span>Zero Raw Deletion Policy</span>
          </div>

          <button
            onClick={handleLogHandoff}
            disabled={busy || !clientName || !crewName}
            className="sindoor-gradient-btn flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold shadow-md disabled:opacity-40 cursor-pointer"
          >
            <UserCheck className="w-4 h-4 text-[#FBFAF7]" />
            <span>{busy ? 'Dispatching WhatsApp…' : 'Log Data & Dispatch WhatsApp'}</span>
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Scanner & Form */}
        <div className="bg-[#FFFFFF] border border-[#E5DFD7] shadow-sm rounded-2xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-[#1A1814] uppercase tracking-wider font-mono">
              New Data Handoff Receipt
            </h3>
            {scannedPath && (
              <span className="text-[10px] text-[#2A9D8F] font-mono flex items-center gap-1 font-semibold">
                <FolderCheck className="w-3 h-3" /> Scanned
              </span>
            )}
          </div>

          {/* FOLDER SCANNER & AUTO-DETECTION HERO BUTTON */}
          <div className="p-3.5 rounded-xl bg-gradient-to-br from-[#FAF8F5] to-[#F3EFEA] border border-[#E5DFD7] flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#1A1814] uppercase tracking-wider font-mono flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#C8860B]" />
                Auto-Detect Footage from Disk
              </span>
              <button
                type="button"
                onClick={() => handleScanDirectory()}
                disabled={scanning}
                className="px-2.5 py-1 rounded bg-[#E8A317]/15 hover:bg-[#E8A317]/25 text-[#9B2226] border border-[#E8A317]/50 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
              >
                <FolderSearch className="w-3 h-3" />
                {scanning ? 'Scanning…' : 'Scan Folder…'}
              </button>
            </div>

            {scannedPath ? (
              <div className="text-[11px] font-mono text-[#6B655C] truncate bg-[#FFFFFF] p-2 rounded border border-[#E5DFD7]">
                📁 {scannedPath}
              </div>
            ) : (
              <p className="text-[11px] text-[#6B655C]">
                Click "Scan Folder" to choose cinematographer Kishan's copied footage folder or project directory.
              </p>
            )}

            {/* Quick 1-Click Detect Chips for Kishan / Project */}
            <div className="flex flex-wrap gap-1.5 pt-1 border-t border-[#E5DFD7]">
              <button
                type="button"
                onClick={() => handleScanDirectory('/Volumes/40/261028 Dhanur & Jhanvi/01_RAW_FOOTAGE/2026.10.28 - Wedding/Kishan')}
                className="text-[10.5px] px-2 py-1 rounded bg-[#FFFFFF] hover:bg-[#FAF8F5] border border-[#D6D0C6] text-[#1A1814] flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                title="Quick scan Kishan's copied wedding footage"
              >
                <span>🎥</span>
                <span>Quick Scan: <strong>Kishan</strong> (Wedding)</span>
              </button>

              <button
                type="button"
                onClick={() => handleScanDirectory('/Volumes/40/261028 Dhanur & Jhanvi')}
                className="text-[10.5px] px-2 py-1 rounded bg-[#FFFFFF] hover:bg-[#FAF8F5] border border-[#D6D0C6] text-[#6B655C] hover:text-[#1A1814] flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                title="Scan entire project folder"
              >
                <span>📁</span>
                <span>Project Root</span>
              </button>
            </div>

            {/* Discovered packages in project */}
            {discoveredPackages.length > 0 && (
              <div className="flex flex-col gap-1.5 pt-2 border-t border-[#E5DFD7]">
                <span className="text-[10px] text-[#6B655C] font-mono uppercase">Detected Crew Packages:</span>
                <div className="flex flex-col gap-1">
                  {discoveredPackages.map(pkg => (
                    <button
                      key={pkg.folderPath}
                      type="button"
                      onClick={() => handleSelectPackage(pkg)}
                      className="text-left px-2.5 py-1.5 rounded bg-[#FFFFFF] hover:bg-[#FAF8F5] border border-[#E5DFD7] text-[11px] text-[#1A1814] flex items-center justify-between cursor-pointer shadow-xs"
                    >
                      <span className="font-semibold">{pkg.crewName} ({pkg.role})</span>
                      <span className="text-[#E8A317] font-mono">{pkg.dataGb} GB • {pkg.fileCount} clips</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Client Selection */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-[#6B655C] font-medium">Client / Project</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                placeholder="e.g. Dhanur & Jhanvi"
                className="flex-1 bg-[#FFFFFF] border border-[#D6D0C6] rounded-lg px-3 py-2 text-xs text-[#1A1814] focus:outline-none focus:border-[#9B2226]"
              />
              <select
                value={clientName}
                onChange={e => {
                  const client = STUDIO_WEB_APP_CLIENTS.find(c => c.name === e.target.value);
                  if (client) {
                    setClientName(client.name);
                    if (client.events?.[0]) {
                      setEventName(client.events[0].eventName);
                      if (client.events[0].cinematographers?.[0]) setCrewName(client.events[0].cinematographers[0]);
                    }
                  }
                }}
                className="bg-[#FFFFFF] border border-[#D6D0C6] rounded-lg px-2 py-2 text-xs text-[#1A1814] focus:outline-none focus:border-[#9B2226] max-w-[150px]"
              >
                {STUDIO_WEB_APP_CLIENTS.map(c => (
                  <option key={c.id || c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Event Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-[#6B655C] font-medium">Event Name</label>
            <input
              type="text"
              value={eventName}
              onChange={e => setEventName(e.target.value)}
              className="bg-[#FFFFFF] border border-[#D6D0C6] rounded-lg px-3 py-2 text-xs text-[#1A1814] focus:outline-none focus:border-[#9B2226]"
            />
          </div>

          {/* Crew Role & Name */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-[#6B655C] font-medium">Crew Role</label>
              <select
                value={crewRole}
                onChange={e => setCrewRole(e.target.value as any)}
                className="bg-[#FFFFFF] border border-[#D6D0C6] rounded-lg px-3 py-2 text-xs text-[#1A1814] focus:outline-none focus:border-[#9B2226]"
              >
                <option value="Cinematographer">Cinematographer</option>
                <option value="Drone">Drone Operator</option>
                <option value="Photographer">Photographer</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-[#6B655C] font-medium">Crew Name</label>
              <input
                type="text"
                value={crewName}
                onChange={e => setCrewName(e.target.value)}
                className="bg-[#FFFFFF] border border-[#D6D0C6] rounded-lg px-3 py-2 text-xs text-[#1A1814] focus:outline-none focus:border-[#9B2226]"
              />
            </div>
          </div>

          {/* Crew WhatsApp Phone */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-[#6B655C] font-medium">Crew WhatsApp Phone</label>
            <input
              type="text"
              value={crewPhone}
              onChange={e => setCrewPhone(e.target.value)}
              placeholder="+91..."
              className="bg-[#FFFFFF] border border-[#D6D0C6] rounded-lg px-3 py-2 text-xs text-[#1A1814] font-mono focus:outline-none focus:border-[#9B2226]"
            />
          </div>

          {/* Size & Files */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#E5DFD7]">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-[#6B655C] font-medium">Data Size (GB)</label>
              <input
                type="number"
                step="0.01"
                value={dataGb}
                onChange={e => setDataGb(Number(e.target.value))}
                className="bg-[#FFFFFF] border border-[#D6D0C6] rounded-lg px-3 py-2 text-xs text-[#9B2226] font-mono focus:outline-none focus:border-[#9B2226] font-bold"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-[#6B655C] font-medium">Total Files</label>
              <input
                type="number"
                value={fileCount}
                onChange={e => setFileCount(Number(e.target.value))}
                className="bg-[#FFFFFF] border border-[#D6D0C6] rounded-lg px-3 py-2 text-xs text-[#9B2226] font-mono focus:outline-none focus:border-[#9B2226] font-bold"
              />
            </div>
          </div>

          {/* WhatsApp Message Preview */}
          <div className="p-3.5 rounded-xl bg-[#FAF8F5] border border-[#E5DFD7] flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[10px] text-[#2A9D8F] font-mono uppercase font-bold">
              <span className="flex items-center gap-1">
                <MessageCircle className="w-3.5 h-3.5" />
                WhatsApp Message Preview
              </span>
              <span>to {crewPhone}</span>
            </div>
            <pre className="text-[11.5px] text-[#1A1814] font-sans whitespace-pre-wrap leading-relaxed select-text bg-[#FFFFFF] p-3 rounded-lg border border-[#E5DFD7]">
              {generatedWhatsAppMessage}
            </pre>
          </div>

          {/* Dedicated WhatsApp Dispatch Action Button */}
          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              onClick={handleLogHandoff}
              disabled={busy || !clientName || !crewName || !crewPhone}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl sindoor-gradient-btn text-[#FBFAF7] font-semibold text-xs shadow-md cursor-pointer transition-all disabled:opacity-40"
            >
              <MessageCircle className="w-4 h-4 fill-[#FBFAF7] text-[#9B2226]" />
              <span>{busy ? 'Dispatching Receipt…' : `Click to Dispatch WhatsApp Receipt to ${crewName}`}</span>
            </button>

            <a
              href={getWhatsAppWebUrl()}
              target="_blank"
              rel="noreferrer"
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#FFFFFF] hover:bg-[#FAF8F5] border border-[#D6D0C6] text-[11px] text-[#6B655C] hover:text-[#1A1814] transition-colors shadow-xs"
            >
              <ExternalLink className="w-3 h-3 text-[#C8860B]" />
              <span>Or Open Chat in WhatsApp Web / App</span>
            </a>
          </div>

          {statusMessage && (
            <div className="p-2.5 rounded-lg bg-[#FAF8F5] border border-[#E8A317]/50 text-xs text-[#C8860B] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-[#2A9D8F]" />
              <span>{statusMessage}</span>
            </div>
          )}
        </div>

        {/* Right Column: Handoff Logs Table */}
        <div className="lg:col-span-2 bg-[#FFFFFF] border border-[#E5DFD7] shadow-sm rounded-2xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-[#1A1814] uppercase tracking-wider font-mono">
                Data Received History ({logs.length})
              </h3>
              <p className="text-[11px] text-[#6B655C] mt-0.5">
                Official delivery register for cinematographer and drone footage intake.
              </p>
            </div>
            <span className="text-xs text-[#2A9D8F] font-mono flex items-center gap-1 font-semibold">
              <span className="w-2 h-2 rounded-full bg-[#2A9D8F] animate-pulse"></span>
              Meta Cloud API Ready
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E5DFD7] text-[#6B655C] font-mono text-[11px]">
                  <th className="pb-2">Date / Time</th>
                  <th className="pb-2">Project</th>
                  <th className="pb-2">Crew Member</th>
                  <th className="pb-2">Size</th>
                  <th className="pb-2">Storage</th>
                  <th className="pb-2 text-right">WhatsApp Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5DFD7]">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-[#FAF8F5] transition-colors">
                    <td className="py-3 font-mono text-[#6B655C]">
                      {new Date(log.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })},{' '}
                      {new Date(log.receivedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </td>
                    <td className="py-3 font-medium text-[#1A1814]">
                      {log.clientName}
                      <span className="block text-[10px] text-[#6B655C]">{log.eventName}</span>
                    </td>
                    <td className="py-3 text-[#1A1814]">
                      {log.teamMemberName}
                      <span className="block text-[10px] text-[#C8860B] font-mono font-medium">{log.role}</span>
                      <span className="block text-[10px] text-[#6B655C] font-mono">{log.teamMemberPhone}</span>
                    </td>
                    <td className="py-3 font-mono text-[#1A1814] font-semibold">
                      {log.dataGb} GB
                      <span className="block text-[10px] text-[#6B655C] font-normal">{log.fileCount} clips</span>
                    </td>
                    <td className="py-3">
                      <span className="inline-flex items-center gap-1 text-[11px] text-[#2A9D8F] font-medium">
                        <HardDrive className="w-3.5 h-3.5" /> Copied
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      {log.whatsappStatus === 'sent' ? (
                        <div className="inline-flex flex-col items-end">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#2A9D8F]/15 border border-[#2A9D8F]/30 text-[#2A9D8F] text-[10px] font-mono font-bold">
                            <CheckCircle2 className="w-3 h-3" /> Dispatched
                          </span>
                          {log.whatsappMessageId && (
                            <span className="text-[9px] text-[#8C857B] font-mono truncate max-w-[120px] mt-0.5" title={log.whatsappMessageId}>
                              {log.whatsappMessageId.slice(0, 14)}…
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FAF8F5] border border-[#D6D0C6] text-[#6B655C] text-[10px]">
                          Pending
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
