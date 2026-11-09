import React, { useState, useEffect } from 'react';
import {
  Film,
  FolderTree,
  Send,
  CloudSync,
  Share2,
  CheckSquare,
  Layers
} from 'lucide-react';

export type TabId =
  | 'delivery'
  | 'transfers'
  | 'folders'
  | 'handoff'
  | 'gdrive'
  | 'review'
  | 'editor';

interface SidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  pendingRevisionsCount?: number;
  pendingTasksCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  pendingRevisionsCount = 2,
  pendingTasksCount = 3
}) => {
  const [activeTransferCount, setActiveTransferCount] = useState(0);

  useEffect(() => {
    window.clipsApi.getTransfers().then(tasks => {
      const active = (tasks || []).filter(t => t.status === 'running' || t.status === 'paused').length;
      setActiveTransferCount(active);
    });

    const unsubscribe = window.clipsApi.onTransfersUpdated(tasks => {
      const active = (tasks || []).filter(t => t.status === 'running' || t.status === 'paused').length;
      setActiveTransferCount(active);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const items: { id: TabId; label: string; icon: React.ReactNode; badge?: number; hot?: boolean; activeDot?: boolean }[] = [
    {
      id: 'delivery',
      label: 'Client Clips Delivery',
      icon: <Film className="w-4 h-4 text-[#E8A317]" />,
      hot: true
    },
    {
      id: 'transfers',
      label: 'Transfers & Queue',
      icon: <Layers className="w-4 h-4 text-[#2A9D8F]" />,
      badge: activeTransferCount,
      activeDot: activeTransferCount > 0
    },
    {
      id: 'folders',
      label: 'Smart Folders',
      icon: <FolderTree className="w-4 h-4" />
    },
    {
      id: 'handoff',
      label: 'Data Handoff & WhatsApp',
      icon: <Send className="w-4 h-4" />
    },
    {
      id: 'gdrive',
      label: 'Daily Google Drive Sync',
      icon: <CloudSync className="w-4 h-4" />
    },
    {
      id: 'review',
      label: 'Dropbox Review & Revisions',
      icon: <Share2 className="w-4 h-4" />,
      badge: pendingRevisionsCount
    },
    {
      id: 'editor',
      label: 'Editor Workspace',
      icon: <CheckSquare className="w-4 h-4" />,
      badge: pendingTasksCount
    }
  ];

  return (
    <aside className="w-64 bg-[#110E0D] border-r border-[#2D2824] flex flex-col justify-between p-3 select-none shrink-0">
      <div className="flex flex-col gap-1.5">
        <div className="px-3 py-2 text-[11px] font-mono uppercase tracking-wider text-[#8C857B]">
          Studio Modules
        </div>

        {items.map(item => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                active
                  ? 'bg-[#9B2226] text-[#FBFAF7] shadow-sm'
                  : 'text-[#8C857B] hover:text-[#FBFAF7] hover:bg-[#1A1814]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className={active ? 'text-[#E8A317]' : 'text-[#8C857B]'}>{item.icon}</span>
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && item.badge > 0 && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold flex items-center gap-1.5 ${
                    item.activeDot
                      ? 'bg-[#2A9D8F]/20 text-[#2A9D8F] border border-[#2A9D8F]/40'
                      : active
                      ? 'bg-[#141110] text-[#E8A317]'
                      : 'bg-[#9B2226]/30 text-[#E8A317]'
                  }`}
                >
                  {item.activeDot && <span className="w-1.5 h-1.5 rounded-full bg-[#2A9D8F] animate-pulse" />}
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="p-3 rounded-lg bg-[#181512] border border-[#2D2824] text-[11px] text-[#8C857B] flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-[#FBFAF7]">Baawaray Clips</span>
          <span className="font-mono text-[10px] text-[#E8A317]">v1.0 Mac</span>
        </div>
        <p className="text-[10px] leading-relaxed">
          Engineered for Apple Silicon VideoToolbox hardware acceleration.
        </p>
      </div>
    </aside>
  );
};
