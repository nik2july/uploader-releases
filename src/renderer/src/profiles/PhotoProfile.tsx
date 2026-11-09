import React, { useState } from 'react';
import {
  Camera,
  BookOpen,
  Sparkles,
  Upload,
  HardDrive,
  Download,
  FolderOpen,
  CheckCircle2,
  Clock,
  Layers,
  FileDown,
  Eye
} from 'lucide-react';
import { SpreadCanvas } from '../modules/album/SpreadCanvas';
import { BottomFilmstrip } from '../modules/album/BottomFilmstrip';
import { InspectorSidebar } from '../modules/album/InspectorSidebar';
import { LayoutPicker } from '../modules/album/LayoutPicker';
import { ClientProofingModal } from '../modules/album/ClientProofingModal';
import { ExportModal } from '../modules/album/ExportModal';

type PhotoTab = 'tasks' | 'album' | 'optimizer';

export const PhotoProfile: React.FC = () => {
  const [activeTab, setActiveTab] = useState<PhotoTab>('tasks');
  const [showProofing, setShowProofing] = useState(false);
  const [showExport, setShowExport] = useState(false);

  // Demo active shoot state
  const [currentShoot] = useState({
    clientName: 'Dikshant & Moreen',
    eventTitle: 'Grand Wedding & Reception',
    sourceType: 'hard_drive' as 'hard_drive' | 'cloud',
    driveLabel: 'SanDisk Extreme 2TB #1',
    localPath: '/Volumes/SanDisk_2TB/261028_Dikshant_Moreen/01_RAW_PHOTOS',
    photoCount: 4250,
    dueDate: '2026-11-14',
    stage: 'culling_in_process'
  });

  return (
    <div className="flex-1 flex flex-col bg-[#FBFAF7] text-[#1A1814] overflow-hidden">
      {/* Sub-Header Tabs */}
      <div className="h-13 border-b border-[#E5DFD7] bg-[#F7F5F0] px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('tasks')}
            className={`whitespace-nowrap shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'tasks'
                ? 'bg-[#9B2226] text-[#FBFAF7] shadow-sm shadow-[#9B2226]/25'
                : 'text-[#6B655C] hover:text-[#1A1814] hover:bg-[#EAE4DB]'
            }`}
          >
            <Camera size={14} />
            <span>Assigned Shoots &amp; RAWs</span>
          </button>

          <button
            onClick={() => setActiveTab('album')}
            className={`whitespace-nowrap shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'album'
                ? 'bg-[#9B2226] text-[#FBFAF7] shadow-sm shadow-[#9B2226]/25'
                : 'text-[#6B655C] hover:text-[#1A1814] hover:bg-[#EAE4DB]'
            }`}
          >
            <BookOpen size={14} />
            <span>Album Maker (Smart Layouts)</span>
          </button>

          <button
            onClick={() => setActiveTab('optimizer')}
            className={`whitespace-nowrap shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'optimizer'
                ? 'bg-[#9B2226] text-[#FBFAF7] shadow-sm shadow-[#9B2226]/25'
                : 'text-[#6B655C] hover:text-[#1A1814] hover:bg-[#EAE4DB]'
            }`}
          >
            <Sparkles size={14} />
            <span>4K WebP &amp; ArcFace AI</span>
          </button>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {activeTab === 'album' && (
            <>
              <button
                onClick={() => setShowProofing(true)}
                className="whitespace-nowrap shrink-0 px-3 py-1 bg-[#FAF8F5] hover:bg-[#F3EFEA] border border-[#D6D0C6] text-xs font-semibold rounded-lg flex items-center gap-1.5 text-[#C8860B] cursor-pointer shadow-xs"
              >
                <Eye size={13} />
                <span>3D Flipbook Proof</span>
              </button>
              <button
                onClick={() => setShowExport(true)}
                className="whitespace-nowrap shrink-0 px-3 py-1 bg-[#9B2226] hover:bg-[#B82B30] text-xs font-semibold rounded-lg flex items-center gap-1.5 text-white cursor-pointer shadow-xs"
              >
                <FileDown size={13} />
                <span>Export Print PDF</span>
              </button>
            </>
          )}
          <span className="text-[11px] font-medium text-[#6B655C] bg-[#FAF8F5] px-3 py-1 rounded-md border border-[#E5DFD7] whitespace-nowrap">
            Role: Photo Editor
          </span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {activeTab === 'tasks' && (
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="bg-[#FFFFFF] border border-[#E5DFD7] shadow-sm p-5 rounded-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] tracking-wider uppercase font-semibold text-[#9B2226]">Active Wedding Shoot</span>
                  <h3 className="text-xl font-serif font-bold text-[#1A1814] mt-0.5">{currentShoot.clientName}</h3>
                  <p className="text-xs text-[#6B655C]">{currentShoot.eventTitle} • {currentShoot.photoCount} clicks</p>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-[#6B655C] block">Dynamic Due Date</span>
                  <span className="text-sm font-semibold text-emerald-700">{currentShoot.dueDate}</span>
                </div>
              </div>

              {/* Media Intake Route Info */}
              <div className="mt-5 p-4 rounded-xl bg-[#FAF8F5] border border-[#E5DFD7] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#E8A317]/10 border border-[#E8A317]/30 flex items-center justify-center text-[#C8860B]">
                    <HardDrive size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[#1A1814]">Physical Hard Drive / SSD Handover</span>
                      <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold">In-House Desk Route</span>
                    </div>
                    <p className="text-[11px] text-[#6B655C] mt-0.5 font-mono">{currentShoot.driveLabel} • {currentShoot.localPath}</p>
                  </div>
                </div>

                <button
                  onClick={() => alert(`Opening ${currentShoot.localPath} in Finder`)}
                  className="px-3.5 py-2 bg-[#FFFFFF] hover:bg-[#FAF8F5] text-xs font-semibold text-[#1A1814] border border-[#D6D0C6] rounded-xl flex items-center gap-2 transition-all cursor-pointer shadow-xs"
                >
                  <FolderOpen size={14} className="text-[#C8860B]" />
                  <span>Reveal RAW Photos</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'album' && (
          <div className="flex-1 flex flex-col h-[calc(100vh-140px)]">
            <div className="p-3 bg-[#FFFFFF] border border-[#E5DFD7] shadow-sm rounded-xl mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-[#1A1814]">Spread 01 of 24</span>
                <span className="text-[#D6D0C6]">|</span>
                <span className="text-[#6B655C]">Preset: 12 × 36 in (Royal Indian Panoramic)</span>
              </div>
              <div className="text-[11px] text-[#6B655C]">
                Press <kbd className="px-1.5 py-0.5 bg-[#FAF8F5] border border-[#D6D0C6] rounded text-[#1A1814]">Space</kbd> or <kbd className="px-1.5 py-0.5 bg-[#FAF8F5] border border-[#D6D0C6] rounded text-[#1A1814]">L</kbd> to cycle Smart Layouts
              </div>
            </div>
            <div className="flex-1 bg-[#FFFFFF] border border-[#E5DFD7] shadow-sm rounded-2xl p-6 flex items-center justify-center relative overflow-hidden">
              <div className="w-[850px] h-[320px] bg-[#FAF8F5] rounded-xl border border-[#E5DFD7] shadow-md flex items-center justify-center text-center p-8">
                <div>
                  <BookOpen size={48} className="mx-auto text-[#9B2226] mb-3" />
                  <h4 className="text-base font-serif font-bold text-[#1A1814]">Baawaray Album Design Engine</h4>
                  <p className="text-xs text-[#6B655C] max-w-md mx-auto mt-1 font-sans">
                    Mathematical auto-spread layout engine with 1-click Gaussian background blur, layflat safe creases, and lab print presets.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'optimizer' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-[#FFFFFF] border border-[#E5DFD7] shadow-sm p-5 rounded-2xl">
              <h3 className="text-base font-serif font-bold text-[#1A1814]">Batch 4K WebP &amp; ArcFace Face Extraction</h3>
              <p className="text-xs text-[#6B655C] mt-1 font-sans">
                Converts full-resolution camera JPEGs into compressed 4K WebP and generates 512-D ArcFace vectors for the Universal Standee guest delivery.
              </p>
              <div className="mt-5 p-6 border-2 border-dashed border-[#D6D0C6] rounded-xl text-center bg-[#FAF8F5]">
                <Sparkles size={32} className="mx-auto text-[#C8860B] mb-2" />
                <p className="text-xs font-semibold text-[#1A1814]">Drag &amp; Drop Edited Photos Folder</p>
                <p className="text-[11px] text-[#6B655C] mt-0.5 font-sans">Sharp will strip EXIF, apply studio watermark, and compress 80%</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {showProofing && <ClientProofingModal isOpen={showProofing} onClose={() => setShowProofing(false)} />}
      {showExport && <ExportModal isOpen={showExport} onClose={() => setShowExport(false)} />}
    </div>
  );
};
