import React from 'react';
import { Cloud, HardDrive, MessageCircle, Phone, Sliders } from 'lucide-react';

interface HeaderProps {
  onOpenSettings: () => void;
  gdriveConnected?: boolean;
  dropboxConnected?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onOpenSettings, gdriveConnected, dropboxConnected }) => {
  return (
    <header className="titlebar-drag-region h-14 bg-[#141110] border-b border-[#2D2824] flex items-center justify-between px-4 pl-20 select-none z-30">
      {/* Brand Title & Monogram */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#9B2226] border border-[#E8A317] flex items-center justify-center shadow-md">
          <span className="font-serif text-[#FBFAF7] font-bold text-sm tracking-tighter">BW</span>
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-serif text-base font-bold tracking-wider text-[#FBFAF7]">BAAWARAY</span>
            <span className="text-xs px-2 py-0.5 rounded font-mono font-bold bg-[#E8A317]/15 text-[#E8A317] border border-[#E8A317]/30">
              CLIPS
            </span>
          </div>
          <span className="text-[10px] text-[#8C857B] tracking-wide -mt-0.5">
            macOS Studio Footage &amp; Rec.709 Hub
          </span>
        </div>
      </div>

      {/* Status Badges & Hotline */}
      <div className="no-drag flex items-center gap-3 text-xs">
        {/* Post Production Hotline Pill */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1F1B18] border border-[#3D3630] text-[#8C857B]">
          <Phone className="w-3.5 h-3.5 text-[#E8A317]" />
          <span>Post-Production Hotline:</span>
          <span className="font-mono text-[#FBFAF7] font-semibold">+91 88945 62004</span>
        </div>

        {/* WhatsApp Cloud API Pill */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#2A9D8F]/10 border border-[#2A9D8F]/30 text-[#2A9D8F]">
          <MessageCircle className="w-3 h-3" />
          <span className="font-medium">WhatsApp Cloud API</span>
        </div>

        {/* Dropbox Status Pill */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${
            dropboxConnected
              ? 'bg-[#0061FF]/10 border-[#0061FF]/40 text-[#60A5FA]'
              : 'bg-[#1F1B18] border-[#3D3630] text-[#8C857B]'
          }`}
        >
          <HardDrive className="w-3 h-3" />
          <span>Dropbox</span>
        </div>

        {/* Google Drive Status Pill */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${
            gdriveConnected
              ? 'bg-[#E8A317]/10 border-[#E8A317]/40 text-[#E8A317]'
              : 'bg-[#1F1B18] border-[#3D3630] text-[#8C857B]'
          }`}
        >
          <Cloud className="w-3 h-3" />
          <span>Drive (1-Way)</span>
        </div>

        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded-lg bg-[#1F1B18] hover:bg-[#2D2824] border border-[#3D3630] text-[#8C857B] hover:text-[#FBFAF7] transition-colors"
          title="Studio Credentials & Configuration"
        >
          <Sliders className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
