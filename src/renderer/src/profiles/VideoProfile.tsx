import React, { useState } from 'react';
import {
  Film,
  SlidersHorizontal,
  Upload,
  MessageSquare,
  HardDrive,
  Download,
  FolderOpen,
  CheckCircle2,
  Clock,
  Play,
  RotateCcw,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { LogConverterView } from '../modules/clips/LogConverterView';
import { ClipsDeliveryView } from '../modules/clips/ClipsDeliveryView';
import { ReviewManagerView } from '../modules/review/ReviewManagerView';

type VideoTab = 'tasks' | 'lut' | 'delivery' | 'review';

export const VideoProfile: React.FC = () => {
  const [activeTab, setActiveTab] = useState<VideoTab>('tasks');

  // Demo active deliverable state
  const [currentDeliverable] = useState({
    title: 'Wedding Highlight Film (Cinematic 4K)',
    clientName: 'Dikshant & Moreen',
    stage: 'in_process',
    sourceType: 'hard_drive' as 'hard_drive' | 'cloud',
    driveLabel: 'SanDisk Extreme 2TB #1',
    localFootagePath: '/Volumes/SanDisk_2TB/261028_Dikshant_Moreen/01_RAW_FOOTAGE',
    durationHours: 6,
    durationMinutes: 45,
    dueDate: '2026-11-15',
    currentVersion: 'V001',
    openRevisionsCount: 2
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
            <Film size={14} />
            <span>Assigned Deliverables</span>
          </button>

          <button
            onClick={() => setActiveTab('lut')}
            className={`whitespace-nowrap shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'lut'
                ? 'bg-[#9B2226] text-[#FBFAF7] shadow-sm shadow-[#9B2226]/25'
                : 'text-[#6B655C] hover:text-[#1A1814] hover:bg-[#EAE4DB]'
            }`}
          >
            <SlidersHorizontal size={14} />
            <span>Log to Rec.709 LUT Converter</span>
          </button>

          <button
            onClick={() => setActiveTab('delivery')}
            className={`whitespace-nowrap shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'delivery'
                ? 'bg-[#9B2226] text-[#FBFAF7] shadow-sm shadow-[#9B2226]/25'
                : 'text-[#6B655C] hover:text-[#1A1814] hover:bg-[#EAE4DB]'
            }`}
          >
            <Sparkles size={14} />
            <span>Clips Delivery &amp; Faststart</span>
          </button>

          <button
            onClick={() => setActiveTab('review')}
            className={`whitespace-nowrap shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'review'
                ? 'bg-[#9B2226] text-[#FBFAF7] shadow-sm shadow-[#9B2226]/25'
                : 'text-[#6B655C] hover:text-[#1A1814] hover:bg-[#EAE4DB]'
            }`}
          >
            <MessageSquare size={14} />
            <span>Private Client Review &amp; Revisions</span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-[11px] font-medium text-[#6B655C] bg-[#FAF8F5] px-3 py-1 rounded-md border border-[#E5DFD7] shrink-0 whitespace-nowrap">
          <span>Role: Video Editor</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {activeTab === 'tasks' && (
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="bg-[#FFFFFF] border border-[#E5DFD7] shadow-sm p-5 rounded-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] tracking-wider uppercase font-semibold text-[#9B2226]">Active Wedding Deliverable</span>
                  <h3 className="text-xl font-serif font-bold text-[#1A1814] mt-0.5">{currentDeliverable.title}</h3>
                  <p className="text-xs text-[#6B655C]">Client: {currentDeliverable.clientName} • Raw Duration: {currentDeliverable.durationHours}h {currentDeliverable.durationMinutes}m</p>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-[#6B655C] block">Dynamic Due Date</span>
                  <span className="text-sm font-semibold text-emerald-700">{currentDeliverable.dueDate}</span>
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
                    <p className="text-[11px] text-[#6B655C] mt-0.5 font-mono">{currentDeliverable.driveLabel} • {currentDeliverable.localFootagePath}</p>
                  </div>
                </div>

                <button
                  onClick={() => alert(`Opening ${currentDeliverable.localFootagePath} in Finder`)}
                  className="px-3.5 py-2 bg-[#FFFFFF] hover:bg-[#FAF8F5] text-xs font-semibold text-[#1A1814] border border-[#D6D0C6] rounded-xl flex items-center gap-2 transition-all cursor-pointer shadow-xs"
                >
                  <FolderOpen size={14} className="text-[#C8860B]" />
                  <span>Reveal RAW Footage</span>
                </button>
              </div>

              {/* Quick Actions */}
              <div className="mt-4 pt-4 border-t border-[#E5DFD7] flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-[#6B655C]">
                  <Clock size={14} />
                  <span>Current Version: <strong className="text-[#1A1814]">{currentDeliverable.currentVersion}</strong></span>
                  <span className="mx-2">•</span>
                  <span>Open Revisions: <strong className="text-[#C8860B]">{currentDeliverable.openRevisionsCount}</strong></span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setActiveTab('lut')}
                    className="px-3.5 py-1.5 bg-[#FFFFFF] hover:bg-[#FAF8F5] text-xs font-semibold text-[#1A1814] border border-[#D6D0C6] rounded-lg cursor-pointer shadow-xs"
                  >
                    Run LUT Converter →
                  </button>
                  <button
                    onClick={() => setActiveTab('review')}
                    className="px-3.5 py-1.5 bg-[#9B2226] hover:bg-[#B82B30] text-xs font-semibold text-white rounded-lg cursor-pointer shadow-xs"
                  >
                    Upload Cut for Review →
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'lut' && (
          <div className="max-w-6xl mx-auto space-y-6">
            <LogConverterView />
          </div>
        )}

        {activeTab === 'delivery' && (
          <div className="max-w-6xl mx-auto space-y-6">
            <ClipsDeliveryView />
          </div>
        )}

        {activeTab === 'review' && (
          <div className="max-w-6xl mx-auto space-y-6">
            <ReviewManagerView />
          </div>
        )}
      </div>
    </div>
  );
};
