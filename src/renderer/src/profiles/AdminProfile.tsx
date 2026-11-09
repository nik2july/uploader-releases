import React, { useState, useEffect } from 'react';
import {
  FolderPlus,
  FolderTree,
  HardDrive,
  CloudUpload,
  Users,
  CheckCircle2,
  Clock,
  Send,
  AlertTriangle,
  QrCode,
  ExternalLink,
  ShieldCheck,
  FolderOpen,
  ArrowRight,
  Key,
  Database,
  Lock,
  Save,
  RefreshCw,
  Server,
  Download,
  Check
} from 'lucide-react';
import { FolderCreatorView } from '../modules/clips/FolderCreatorView';
import { DataHandoffView } from '../modules/clips/DataHandoffView';
import { UnifiedFolderIntakeView } from '../modules/clips/UnifiedFolderIntakeView';
import { GDriveSyncView } from '../modules/clips/GDriveSyncView';
import { ManualRawDataModal } from '../modules/handoff/ManualRawDataModal';

type AdminTab = 'folder_intake' | 'assignments' | 'b2_settings';

export const AdminProfile: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminTab>('folder_intake');
  const [showManualModal, setShowManualModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrDownloadMessage, setQrDownloadMessage] = useState<string | null>(null);
  const [isDownloadingQR, setIsDownloadingQR] = useState(false);
  const [selectedJob, setSelectedJob] = useState<{ id: string; title: string; clientName: string } | null>(null);

  // Backblaze B2 Settings State
  const [b2KeyId, setB2KeyId] = useState('');
  const [b2ApplicationKey, setB2ApplicationKey] = useState('');
  const [b2BucketId, setB2BucketId] = useState('');
  const [b2BucketName, setB2BucketName] = useState('baawaray-raw-footage');
  const [isB2Configured, setIsB2Configured] = useState(false);

  const [isTestingB2, setIsTestingB2] = useState(false);
  const [b2TestResult, setB2TestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isSavingB2, setIsSavingB2] = useState(false);
  const [b2SaveMessage, setB2SaveMessage] = useState<string | null>(null);

  // Load existing B2 configuration on mount
  useEffect(() => {
    let isMounted = true;
    async function loadB2Config() {
      try {
        const config = await (window as any).clipsApi?.getB2Config?.();
        if (isMounted && config) {
          if (config.keyId) setB2KeyId(config.keyId);
          if (config.bucketId) setB2BucketId(config.bucketId);
          if (config.bucketName) setB2BucketName(config.bucketName);
          setIsB2Configured(Boolean(config.isConfigured));
        }
      } catch (err) {
        console.warn('Failed to load B2 config:', err);
      }
    }
    loadB2Config();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleTestB2Connection = async () => {
    setIsTestingB2(true);
    setB2TestResult(null);
    try {
      // First save current inputs in memory
      if (b2KeyId && b2ApplicationKey) {
        await (window as any).clipsApi?.saveB2Config?.({
          keyId: b2KeyId.trim(),
          applicationKey: b2ApplicationKey.trim(),
          bucketId: b2BucketId.trim(),
          bucketName: b2BucketName.trim()
        });
      }
      const res = await (window as any).clipsApi?.testB2Connection?.();
      setB2TestResult(res || { ok: false, message: 'No response from B2 client' });
      if (res?.ok) setIsB2Configured(true);
    } catch (err: any) {
      setB2TestResult({ ok: false, message: err.message || 'Connection test failed' });
    } finally {
      setIsTestingB2(false);
    }
  };

  const handleSaveB2Config = async () => {
    if (!b2KeyId.trim() || !b2ApplicationKey.trim()) {
      alert('Please enter both Key ID and Application Key.');
      return;
    }
    setIsSavingB2(true);
    setB2SaveMessage(null);
    try {
      const res = await (window as any).clipsApi?.saveB2Config?.({
        keyId: b2KeyId.trim(),
        applicationKey: b2ApplicationKey.trim(),
        bucketId: b2BucketId.trim(),
        bucketName: b2BucketName.trim()
      });
      if (res?.ok) {
        setIsB2Configured(true);
        setB2SaveMessage('Backblaze B2 credentials saved successfully!');
        setTimeout(() => setB2SaveMessage(null), 4000);
      } else {
        alert(res?.error || 'Failed to save Backblaze credentials');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to save Backblaze credentials');
    } finally {
      setIsSavingB2(false);
    }
  };

  const handleDownloadQR = async (variant: string = 'ivory') => {
    setIsDownloadingQR(true);
    setQrDownloadMessage(null);
    try {
      const res = await (window as any).clipsApi?.downloadUniversalQR?.(variant);
      if (res?.success) {
        setQrDownloadMessage(`✓ Saved ${res.fileName} to Downloads & revealed in Finder!`);
        setTimeout(() => setQrDownloadMessage(null), 6000);
      } else {
        setQrDownloadMessage(`⚠️ ${res?.error || 'Download failed'}`);
      }
    } catch (err: any) {
      setQrDownloadMessage(`⚠️ ${err.message || err}`);
    } finally {
      setIsDownloadingQR(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#FBFAF7] text-[#1A1814] overflow-hidden">
      {/* Sub-Header Tabs */}
      <div className="h-13 border-b border-[#E5DFD7] bg-[#F7F5F0] px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('folder_intake')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 transition-all cursor-pointer ${
              activeTab === 'folder_intake'
                ? 'bg-[#9B2226] text-[#FBFAF7] shadow-sm shadow-[#9B2226]/25'
                : 'text-[#6B655C] hover:text-[#1A1814] hover:bg-[#EAE4DB]'
            }`}
          >
            <FolderTree size={14} />
            <span>Smart Folder Generator &amp; Data Intake</span>
          </button>

          <button
            onClick={() => setActiveTab('assignments')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 transition-all cursor-pointer ${
              activeTab === 'assignments'
                ? 'bg-[#9B2226] text-[#FBFAF7] shadow-sm shadow-[#9B2226]/25'
                : 'text-[#6B655C] hover:text-[#1A1814] hover:bg-[#EAE4DB]'
            }`}
          >
            <Users size={14} />
            <span>Editor Assignments (Desk vs Cloud)</span>
          </button>

          <button
            onClick={() => setActiveTab('b2_settings')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 transition-all cursor-pointer ${
              activeTab === 'b2_settings'
                ? 'bg-[#9B2226] text-[#FBFAF7] shadow-sm shadow-[#9B2226]/25'
                : 'text-[#6B655C] hover:text-[#1A1814] hover:bg-[#EAE4DB]'
            }`}
          >
            <Database size={14} />
            <span>Backblaze B2 Storage Settings</span>
          </button>

          <button
            onClick={() => {
              handleDownloadQR('ivory');
              setShowQRModal(true);
            }}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 transition-all cursor-pointer bg-[#FFFFFF] hover:bg-[#F3EFEA] border border-[#D6D0C6] text-[#1A1814] shadow-xs hover:border-[#9B2226]"
            title="Download Universal QR Standee (5x7) for Wedding Tables"
          >
            <QrCode size={15} className="text-[#9B2226]" />
            <span>Universal QR</span>
            <Download size={13} className="text-[#C8860B]" />
          </button>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-[#6B655C] bg-[#FFFFFF] border border-[#E5DFD7] px-3 py-1.5 rounded-full shadow-xs shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
          <span className="font-medium">Studio OS Live Connected</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {activeTab === 'folder_intake' && (
          <div className="max-w-7xl mx-auto">
            <UnifiedFolderIntakeView />
          </div>
        )}

        {activeTab === 'assignments' && (
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="bg-[#FFFFFF] border border-[#E5DFD7] shadow-sm p-5 rounded-2xl">
              <h3 className="text-lg font-serif font-bold text-[#1A1814] tracking-wide">In-House vs. Freelance Editor Routing</h3>
              <p className="text-xs text-[#6B655C] mt-1 font-sans">
                Assign tasks with explicit media transfer routing. In-house editors receive data directly on physical external hard drives / SSDs (bypassing cloud upload), while freelance editors receive online cloud transfers.
              </p>

              <div className="grid grid-cols-2 gap-4 mt-5">
                <div className="bg-[#FAF8F5] border border-[#E5DFD7] p-4 rounded-xl">
                  <div className="flex items-center gap-2 text-[#C8860B] font-semibold text-sm">
                    <HardDrive size={16} />
                    <span>In-House Editors (Studio Desk)</span>
                  </div>
                  <p className="text-xs text-[#6B655C] mt-2 leading-relaxed font-sans">
                    Media is transferred via physical SSD (SanDisk Extreme, Samsung T7). <strong>Upload is bypassed</strong>, allowing immediate start with zero internet delay.
                  </p>
                  <div className="mt-4 pt-3 border-t border-[#E5DFD7] flex items-center justify-between text-xs text-[#6B655C]">
                    <span>Status: Instant Desk Transfer</span>
                    <button
                      onClick={() => {
                        setSelectedJob({ id: 'job_inhouse_demo', title: 'Wedding Highlight Cut', clientName: 'Dikshant & Moreen' });
                        setShowManualModal(true);
                      }}
                      className="px-3.5 py-1.5 bg-[#FFFFFF] hover:bg-[#F3EFEA] text-[#1A1814] border border-[#D6D0C6] rounded-lg text-xs font-semibold shadow-xs cursor-pointer"
                    >
                      Assign via Physical SSD →
                    </button>
                  </div>
                </div>

                <div className="bg-[#FAF8F5] border border-[#E5DFD7] p-4 rounded-xl">
                  <div className="flex items-center gap-2 text-[#2563EB] font-semibold text-sm">
                    <CloudUpload size={16} />
                    <span>Freelance Editors (Remote / Backblaze B2)</span>
                  </div>
                  <p className="text-xs text-[#6B655C] mt-2 leading-relaxed font-sans">
                    Media is uploaded exclusively via <strong>Backblaze B2</strong> multipart chunked engine with byte-level verification. Zero daily upload limits (Google Drive quota bypassed).
                  </p>
                  <div className="mt-4 pt-3 border-t border-[#E5DFD7] flex items-center justify-between text-xs text-[#6B655C]">
                    <span>Status: Backblaze B2 Resumable Transfer</span>
                    <span className="text-[#2563EB] font-semibold">B2 Bucket Active</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'b2_settings' && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Header Card */}
            <div className="bg-[#FFFFFF] border border-[#E5DFD7] shadow-sm p-5 rounded-2xl flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-serif font-bold text-[#1A1814] tracking-wide">Backblaze B2 Cloud Storage Configuration</h3>
                  {isB2Configured ? (
                    <span className="text-[10px] bg-emerald-50 border border-emerald-200 text-emerald-800 px-2 py-0.5 rounded font-mono font-semibold">
                      Configured &amp; Active
                    </span>
                  ) : (
                    <span className="text-[10px] bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 rounded font-mono font-semibold">
                      Credentials Required
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#6B655C] mt-1 font-sans">
                  Exclusive platform for remote freelance raw data transfers. Eliminates Google Drive daily upload limits permanently.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTestB2Connection}
                  disabled={isTestingB2 || !b2KeyId || !b2ApplicationKey}
                  className="px-3.5 py-2 rounded-xl bg-[#FAF8F5] hover:bg-[#F3EFEA] border border-[#D6D0C6] text-[#1A1814] text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-40 shadow-xs"
                >
                  <RefreshCw size={14} className={isTestingB2 ? 'animate-spin' : ''} />
                  <span>{isTestingB2 ? 'Testing Connection...' : 'Test Connection'}</span>
                </button>
              </div>
            </div>

            {/* Test Connection Banner */}
            {b2TestResult && (
              <div
                className={`p-4 rounded-xl border text-xs flex items-center justify-between ${
                  b2TestResult.ok
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                <div className="flex items-center gap-2 font-medium">
                  {b2TestResult.ok ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertTriangle size={16} className="text-red-600" />}
                  <span>{b2TestResult.message}</span>
                </div>
                <button
                  onClick={() => setB2TestResult(null)}
                  className="text-xs opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Save Success Banner */}
            {b2SaveMessage && (
              <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs flex items-center gap-2 font-medium">
                <CheckCircle2 size={16} className="text-emerald-600" />
                <span>{b2SaveMessage}</span>
              </div>
            )}

            {/* Credentials Form */}
            <div className="bg-[#FFFFFF] border border-[#E5DFD7] shadow-sm p-6 rounded-2xl space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-[#6B655C] mb-1.5 font-semibold">
                    Backblaze Key ID (keyID)
                  </label>
                  <div className="relative">
                    <Key size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8C857B]" />
                    <input
                      type="text"
                      placeholder="e.g. 0043c8b418a002..."
                      value={b2KeyId}
                      onChange={(e) => setB2KeyId(e.target.value)}
                      className="w-full bg-[#FAF8F5] border border-[#D6D0C6] rounded-xl pl-9 pr-3 py-2.5 text-xs text-[#1A1814] font-mono placeholder:text-[#8C857B] focus:outline-none focus:border-[#9B2226]"
                    />
                  </div>
                  <p className="text-[10px] text-[#8C857B] mt-1 font-sans">Found in Backblaze B2 Console &gt; Application Keys</p>
                </div>

                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-[#6B655C] mb-1.5 font-semibold">
                    Application Key Secret (applicationKey)
                  </label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8C857B]" />
                    <input
                      type="password"
                      placeholder="e.g. K0042..."
                      value={b2ApplicationKey}
                      onChange={(e) => setB2ApplicationKey(e.target.value)}
                      className="w-full bg-[#FAF8F5] border border-[#D6D0C6] rounded-xl pl-9 pr-3 py-2.5 text-xs text-[#1A1814] font-mono placeholder:text-[#8C857B] focus:outline-none focus:border-[#9B2226]"
                    />
                  </div>
                  <p className="text-[10px] text-[#8C857B] mt-1 font-sans">Generated when creating an Application Key in Backblaze</p>
                </div>

                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-[#6B655C] mb-1.5 font-semibold">
                    Target Bucket Name
                  </label>
                  <div className="relative">
                    <Database size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8C857B]" />
                    <input
                      type="text"
                      placeholder="e.g. baawaray-raw-footage"
                      value={b2BucketName}
                      onChange={(e) => setB2BucketName(e.target.value)}
                      className="w-full bg-[#FAF8F5] border border-[#D6D0C6] rounded-xl pl-9 pr-3 py-2.5 text-xs text-[#1A1814] font-mono placeholder:text-[#8C857B] focus:outline-none focus:border-[#9B2226]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-[#6B655C] mb-1.5 font-semibold">
                    Optional Bucket ID
                  </label>
                  <div className="relative">
                    <Server size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8C857B]" />
                    <input
                      type="text"
                      placeholder="Optional bucket ID (auto-resolved if empty)"
                      value={b2BucketId}
                      onChange={(e) => setB2BucketId(e.target.value)}
                      className="w-full bg-[#FAF8F5] border border-[#D6D0C6] rounded-xl pl-9 pr-3 py-2.5 text-xs text-[#1A1814] font-mono placeholder:text-[#8C857B] focus:outline-none focus:border-[#9B2226]"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-[#E5DFD7] flex items-center justify-between">
                <div className="text-[11px] text-[#6B655C] font-sans">
                  Credentials are encrypted and saved locally to the studio admin workstation.
                </div>
                <button
                  type="button"
                  onClick={handleSaveB2Config}
                  disabled={isSavingB2 || !b2KeyId || !b2ApplicationKey}
                  className="px-5 py-2.5 rounded-xl bg-[#9B2226] hover:bg-[#B0282C] text-white text-xs font-semibold flex items-center gap-2 shadow-md shadow-[#9B2226]/20 transition-all cursor-pointer disabled:opacity-40"
                >
                  <Save size={14} />
                  <span>{isSavingB2 ? 'Saving...' : 'Save B2 Credentials'}</span>
                </button>
              </div>
            </div>

            {/* Architecture Highlights */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-[#FFFFFF] border border-[#E5DFD7] shadow-sm space-y-1.5">
                <div className="text-[#2563EB] font-semibold text-xs flex items-center gap-1.5">
                  <ShieldCheck size={14} />
                  <span>Zero Daily Limits</span>
                </div>
                <p className="text-[11px] text-[#6B655C] leading-relaxed font-sans">
                  Upload full 1–2 TB weddings continuously without hitting Google Workspace's 750 GB daily limit.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#FFFFFF] border border-[#E5DFD7] shadow-sm space-y-1.5">
                <div className="text-[#C8860B] font-semibold text-xs flex items-center gap-1.5">
                  <RefreshCw size={14} />
                  <span>S3 Multipart Concurrency</span>
                </div>
                <p className="text-[11px] text-[#6B655C] leading-relaxed font-sans">
                  Files split into 16 MB chunks with 4 parallel streams and SQLite resume journals.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#FFFFFF] border border-[#E5DFD7] shadow-sm space-y-1.5">
                <div className="text-emerald-700 font-semibold text-xs flex items-center gap-1.5">
                  <CheckCircle2 size={14} />
                  <span>HTTP Range Resumable</span>
                </div>
                <p className="text-[11px] text-[#6B655C] leading-relaxed font-sans">
                  Freelance editors download via presigned URLs and resume interrupted transfers from the exact byte offset.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ============================================================= */}
      {/* UNIVERSAL QR STANDEE DOWNLOAD MODAL                           */}
      {/* ============================================================= */}
      {showQRModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-[#FFFFFF] border border-[#E5DFD7] rounded-3xl max-w-xl w-full p-6 shadow-2xl flex flex-col gap-5">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-[#E5DFD7] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#9B2226]/10 border border-[#9B2226]/20 flex items-center justify-center text-[#9B2226]">
                  <QrCode size={22} />
                </div>
                <div>
                  <h3 className="text-base font-serif font-bold text-[#1A1814]">
                    Universal QR Table Standee
                  </h3>
                  <p className="text-xs text-[#6B655C]">
                    Print once for tabletop easels. Automatically detects and opens today's live wedding from Studio OS.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowQRModal(false)}
                className="text-[#8C857B] hover:text-[#1A1814] text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Frame & Table Recommendation Box */}
            <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-amber-200 flex flex-col gap-2.5 text-xs">
              <span className="font-bold text-amber-900 uppercase tracking-wider font-mono flex items-center gap-1.5 text-[11px]">
                <Sparkles size={13} className="text-[#C8860B]" />
                Frame Selection &amp; Table Size Recommendation
              </span>
              <div className="grid grid-cols-2 gap-3 text-[11px] font-sans">
                <div className="bg-white p-3 rounded-xl border border-[#E5DFD7]">
                  <span className="font-bold text-[#1A1814] block">Recommended Table Size:</span>
                  <span className="text-[#9B2226] font-semibold text-sm">5 × 7 inches (13 × 18 cm)</span>
                  <p className="text-[10px] text-[#6B655C] mt-1 leading-relaxed">
                    Golden ratio for guest tables. Scannable from 2–4 feet without crowding centerpieces or dinnerware.
                  </p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-[#E5DFD7]">
                  <span className="font-bold text-[#1A1814] block">Top Frame Pick from Board:</span>
                  <span className="text-amber-800 font-semibold text-sm">NS 30 (1" Width)</span>
                  <p className="text-[10px] text-[#6B655C] mt-1 leading-relaxed">
                    Warm antique royal gold with beaded relief. Alternative: <strong>NS 17</strong> (1" walnut wood with gold bead).
                  </p>
                </div>
              </div>
            </div>

            {/* Status Message */}
            {qrDownloadMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-950 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <span>{qrDownloadMessage}</span>
              </div>
            )}

            {/* Download Buttons */}
            <div className="flex flex-col gap-2.5">
              <span className="text-[10px] font-bold text-[#6B655C] uppercase tracking-wider font-mono">
                Download Print-Ready Files (300 DPI)
              </span>

              <div className="grid grid-cols-3 gap-2.5">
                <button
                  type="button"
                  disabled={isDownloadingQR}
                  onClick={() => handleDownloadQR('ivory')}
                  className="px-3.5 py-3 rounded-xl bg-[#FAF8F5] hover:bg-[#F3EFEA] border border-[#D6D0C6] text-xs font-semibold text-[#1A1814] flex flex-col items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                >
                  <Download size={16} className="text-[#C8860B]" />
                  <span>Ivory Edition</span>
                  <span className="text-[10px] text-[#8C857B] font-mono">300 DPI PNG</span>
                </button>

                <button
                  type="button"
                  disabled={isDownloadingQR}
                  onClick={() => handleDownloadQR('sindoor')}
                  className="px-3.5 py-3 rounded-xl bg-[#FAF8F5] hover:bg-[#F3EFEA] border border-[#D6D0C6] text-xs font-semibold text-[#1A1814] flex flex-col items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                >
                  <Download size={16} className="text-[#9B2226]" />
                  <span>Sindoor Edition</span>
                  <span className="text-[10px] text-[#8C857B] font-mono">300 DPI PNG</span>
                </button>

                <button
                  type="button"
                  disabled={isDownloadingQR}
                  onClick={() => handleDownloadQR('pdf')}
                  className="px-3.5 py-3 rounded-xl bg-[#FAF8F5] hover:bg-[#F3EFEA] border border-[#D6D0C6] text-xs font-semibold text-[#1A1814] flex flex-col items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                >
                  <Download size={16} className="text-emerald-700" />
                  <span>Print PDF</span>
                  <span className="text-[10px] text-[#8C857B] font-mono">Vector 5x7</span>
                </button>
              </div>
            </div>

            {/* Footer Links */}
            <div className="pt-3 border-t border-[#E5DFD7] flex items-center justify-between text-xs text-[#6B655C]">
              <span>Direct URL: <strong className="font-mono text-[#1A1814]">photos.baawaray.com</strong></span>
              <a
                href="https://photos.baawaray.com"
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-[#FFFFFF] hover:bg-[#FAF8F5] border border-[#D6D0C6] text-[#9B2226] font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <span>Open Universal Portal</span>
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </div>
      )}

      {showManualModal && selectedJob && (
        <ManualRawDataModal
          target={{
            kind: 'freelance',
            id: selectedJob.id,
            title: selectedJob.title,
            clientName: selectedJob.clientName,
            serviceType: 'video_editing',
            purpose: 'raw'
          }}
          title={selectedJob.title}
          onClose={() => setShowManualModal(false)}
          onSaved={() => setShowManualModal(false)}
        />
      )}
    </div>
  );
};
