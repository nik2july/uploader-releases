import React, { useState, useEffect } from 'react';
import { Crown, Camera, Film, Sparkles, RefreshCw } from 'lucide-react';
import { AdminProfile } from './profiles/AdminProfile';
import { PhotoProfile } from './profiles/PhotoProfile';
import { VideoProfile } from './profiles/VideoProfile';
import type { EditorProfileType } from '../../shared/contracts';
import sindoorLogo from '../public/logos/logo-2026-square-sindoor.svg';

export default function App(): React.JSX.Element {
  const [profile, setProfile] = useState<EditorProfileType>(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const p = urlParams.get('profile') as EditorProfileType;
      if (p === 'admin' || p === 'photo' || p === 'video') return p;
      const saved = localStorage.getItem('baawaray_active_profile') as EditorProfileType;
      if (saved === 'admin' || saved === 'photo' || saved === 'video') return saved;
    } catch {}
    return 'admin';
  });

  useEffect(() => {
    (window as any).clipsApi?.getStartupProfile?.().then((p: string) => {
      if (p === 'admin' || p === 'photo' || p === 'video') {
        setProfile(p as EditorProfileType);
      }
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('baawaray_active_profile', profile);
    } catch {}
  }, [profile]);

  return (
    <div className="w-screen h-screen flex flex-col bg-[#FBFAF7] text-[#1A1814] font-sans select-none overflow-hidden">
      {/* Studio Top Master Navigation */}
      <header className="h-14 bg-[#FFFFFF] border-b border-[#E5DFD7] px-6 flex items-center justify-between z-30 titlebar-drag-region">
        {/* Left Side: macOS Traffic Light Clearance + Logo & Title */}
        <div className="flex items-center gap-3 no-drag">
          {/* Dedicated macOS Traffic Light Spacer (clears close/minimize/zoom buttons) */}
          <div className="w-18 shrink-0 select-none pointer-events-none" style={{ width: 72, minWidth: 72 }} />

          <img
            src={sindoorLogo}
            alt="Baawaray Logo"
            className="w-8 h-8 rounded-lg shadow-sm shadow-[#9B2226]/20 object-contain shrink-0"
          />
          <div className="flex flex-col justify-center">
            <h1 className="text-base font-serif font-bold tracking-wide text-[#1A1814] leading-tight whitespace-nowrap">
              Baawaray Films
            </h1>
            <p className="text-[9.5px] font-sans font-semibold text-[#6B655C] tracking-widest uppercase leading-tight whitespace-nowrap">
              Unified Post-Production Studio OS
            </p>
          </div>
        </div>

        {/* Profile Switcher Hub */}
        <div className="flex items-center bg-[#F3EFEA] border border-[#E5DFD7] p-1 rounded-xl gap-1 no-drag shadow-xs">
          <button
            onClick={() => setProfile('admin')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 transition-all cursor-pointer ${
              profile === 'admin'
                ? 'bg-[#9B2226] text-[#FBFAF7] shadow-sm shadow-[#9B2226]/25'
                : 'text-[#6B655C] hover:text-[#1A1814] hover:bg-[#EAE4DB]'
            }`}
          >
            <Crown size={14} className={profile === 'admin' ? 'text-[#E8A317]' : ''} />
            <span className="font-sans">Studio Lead &amp; Admin</span>
          </button>

          <button
            onClick={() => setProfile('photo')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 transition-all cursor-pointer ${
              profile === 'photo'
                ? 'bg-[#9B2226] text-[#FBFAF7] shadow-sm shadow-[#9B2226]/25'
                : 'text-[#6B655C] hover:text-[#1A1814] hover:bg-[#EAE4DB]'
            }`}
          >
            <Camera size={14} />
            <span className="font-sans">Photo Editor Studio</span>
          </button>

          <button
            onClick={() => setProfile('video')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 transition-all cursor-pointer ${
              profile === 'video'
                ? 'bg-[#9B2226] text-[#FBFAF7] shadow-sm shadow-[#9B2226]/25'
                : 'text-[#6B655C] hover:text-[#1A1814] hover:bg-[#EAE4DB]'
            }`}
          >
            <Film size={14} />
            <span className="font-sans">Video Editor Studio</span>
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs text-[#6B655C] no-drag">
          <span className="text-[11px] font-mono text-[#6B655C] whitespace-nowrap">Post-Production Hotline: +91 88945 62004</span>
        </div>
      </header>

      {/* Profile Body */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {profile === 'admin' && <AdminProfile />}
        {profile === 'photo' && <PhotoProfile />}
        {profile === 'video' && <VideoProfile />}
      </main>
    </div>
  );
}
