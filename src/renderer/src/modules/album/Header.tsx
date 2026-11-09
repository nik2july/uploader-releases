import React from 'react';
import { 
  BookOpen, 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  Eye, 
  FlipHorizontal2, 
  Maximize2, 
  RotateCcw, 
  Save, 
  Shuffle, 
  AlertTriangle,
  PlusCircle,
  FolderOpen,
  Printer
} from 'lucide-react';
import { AlbumProject, AlbumSizePreset } from './album';
import { LAB_PRESETS } from './engine/labPresets';

interface HeaderProps {
  project: AlbumProject;
  activeSpreadIndex: number;
  totalSpreads: number;
  onPrevSpread: () => void;
  onNextSpread: () => void;
  onCycleLayout: (direction: 1 | -1) => void;
  onFlipSpread: () => void;
  onOpenProofing: () => void;
  onOpenExport: () => void;
  onSaveProject: () => void;
  onNewProject: () => void;
  onOpenProjectHub: () => void;
  onPresetChange: (preset: AlbumSizePreset) => void;
  onDpiChange?: (dpi: number) => void;
  zoomLevel: number;
  onZoomChange: (zoom: number) => void;
}

export const Header: React.FC<HeaderProps> = ({
  project,
  activeSpreadIndex,
  totalSpreads,
  onPrevSpread,
  onNextSpread,
  onCycleLayout,
  onFlipSpread,
  onOpenProofing,
  onOpenExport,
  onSaveProject,
  onNewProject,
  onOpenProjectHub,
  onPresetChange,
  onDpiChange,
  zoomLevel,
  onZoomChange
}) => {
  const currentSpread = project.spreads[activeSpreadIndex];
  const hasGutterWarning = currentSpread?.hasGutterWarning;

  return (
    <header className="h-14 bg-[#ffffff] border-b border-[#e8dfd8] px-4 flex items-center justify-between z-30 select-none shadow-[0_1px_4px_rgba(17,20,23,0.04)]">
      {/* Left: Bavare Branding & Project Switcher */}
      <div className="flex items-center space-x-3.5">
        <div 
          onClick={onOpenProjectHub}
          className="flex items-center space-x-2.5 cursor-pointer group hover:opacity-90 transition-opacity"
          title="Open Album Projects Hub"
        >
          <div className="w-8 h-8 rounded-lg bg-[#7a2e33] p-0.5 shadow-sm flex items-center justify-center">
            <div className="w-full h-full border border-[#d4c1a3]/40 rounded-[6px] flex items-center justify-center bg-[#7a2e33]">
              <BookOpen className="w-4 h-4 text-[#d4c1a3]" />
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-serif font-semibold text-sm tracking-wide text-[#111417]">
                Bavare <span className="text-[#7a2e33] font-normal italic">Album Design</span>
              </span>
              <span className="text-[10px] bg-[#f2ede4] text-[#7a2e33] px-1.5 py-0.5 rounded border border-[#d4c1a3] font-mono font-medium">
                Studio
              </span>
            </div>
            
            <div className="flex items-center space-x-2 text-xs text-[#6b6660]">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenProjectHub();
                }}
                className="truncate max-w-[170px] text-[#111417] font-medium hover:text-[#7a2e33] flex items-center space-x-1"
                title="Switch Album Project"
              >
                <span>{project.title}</span>
                <span className="text-[10px] text-[#7a2e33] underline ml-1">switch</span>
              </button>
              
              <span className="text-[#d4c1a3]">•</span>
              
              {/* Size preset dropdown */}
              <select
                value={project.sizePreset.id}
                onChange={(e) => {
                  const found = LAB_PRESETS.find(p => p.id === e.target.value);
                  if (found) onPresetChange(found);
                }}
                title="Change Album Size Preset (All sheets update together)"
                className="bg-transparent text-[#7a2e33] hover:text-[#5a2226] font-medium cursor-pointer text-xs focus:outline-none"
              >
                {LAB_PRESETS.map(preset => (
                  <option key={preset.id} value={preset.id} className="bg-[#ffffff] text-[#111417]">
                    {preset.spreadWidth}" × {preset.spreadHeight}" ({preset.category})
                  </option>
                ))}
              </select>

              <span className="text-[#d4c1a3]">•</span>

              {/* Target DPI badge / selector */}
              <span className="font-mono text-[11px] bg-[#f2ede4] text-[#7a2e33] px-1.5 py-0.5 rounded border border-[#d4c1a3] flex items-center space-x-1">
                <Printer className="w-2.5 h-2.5" />
                <span>{project.targetDpi || 300} DPI</span>
              </span>
            </div>
          </div>
        </div>

        <div className="h-6 w-px bg-[#e8dfd8] mx-1" />

        {/* Project Hub button & New button */}
        <div className="flex items-center space-x-1">
          <button
            onClick={onOpenProjectHub}
            className="flex items-center space-x-1.5 text-xs text-[#111417] hover:text-[#7a2e33] hover:bg-[#f2ede4] px-2.5 py-1.5 rounded-lg transition-colors border border-[#e8dfd8]"
            title="Open Projects Hub (Each project is a separate album)"
          >
            <FolderOpen className="w-3.5 h-3.5 text-[#7a2e33]" />
            <span className="font-medium">Albums</span>
          </button>

          <button
            onClick={onNewProject}
            className="flex items-center space-x-1.5 text-xs text-[#111417] hover:text-[#7a2e33] hover:bg-[#f2ede4] px-2.5 py-1.5 rounded-lg transition-colors border border-[#e8dfd8]"
            title="Create New Album Project"
          >
            <PlusCircle className="w-3.5 h-3.5 text-[#7a2e33]" />
            <span>New</span>
          </button>

          <button
            onClick={onSaveProject}
            className="flex items-center space-x-1.5 text-xs text-[#111417] hover:text-[#7a2e33] hover:bg-[#f2ede4] px-2.5 py-1.5 rounded-lg transition-colors border border-[#e8dfd8]"
            title="Save Project (Cmd/Ctrl + S)"
          >
            <Save className="w-3.5 h-3.5 text-[#6b6660]" />
            <span>Save</span>
          </button>
        </div>
      </div>

      {/* Center: Spread Navigation & Quick Layout Cycling */}
      <div className="flex items-center space-x-2">
        <div className="flex items-center bg-[#f9f8f6] border border-[#e8dfd8] rounded-xl p-0.5 shadow-sm">
          <button
            onClick={onPrevSpread}
            disabled={activeSpreadIndex <= 0}
            className={`p-1.5 rounded-lg transition-colors ${
              activeSpreadIndex > 0
                ? 'hover:bg-[#ffffff] text-[#111417] shadow-sm'
                : 'text-[#c5beb5] cursor-not-allowed'
            }`}
            title="Previous Sheet (Arrow Left)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="px-3 py-0.5 text-center">
            <div className="text-xs font-semibold text-[#111417] font-mono">
              Sheet {activeSpreadIndex + 1} <span className="text-[#8c867e] font-normal">/ {totalSpreads}</span>
            </div>
            {currentSpread?.sheetType && currentSpread.sheetType !== 'full_spread' && (
              <div className="text-[9px] text-[#7a2e33] font-medium tracking-tight">
                {currentSpread.sheetType.replace('_', ' ').toUpperCase()}
              </div>
            )}
          </div>

          <button
            onClick={onNextSpread}
            disabled={activeSpreadIndex >= totalSpreads - 1}
            className={`p-1.5 rounded-lg transition-colors ${
              activeSpreadIndex < totalSpreads - 1
                ? 'hover:bg-[#ffffff] text-[#111417] shadow-sm'
                : 'text-[#c5beb5] cursor-not-allowed'
            }`}
            title="Next Sheet (Arrow Right)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="h-6 w-px bg-[#e8dfd8] mx-1" />

        {/* Layout quick action buttons */}
        <div className="flex items-center space-x-1 bg-[#f9f8f6] border border-[#e8dfd8] rounded-xl p-0.5 shadow-sm">
          <button
            onClick={() => onCycleLayout(1)}
            className="flex items-center space-x-1.5 px-2.5 py-1 text-xs text-[#111417] hover:text-[#7a2e33] hover:bg-[#ffffff] rounded-lg transition-colors shadow-sm"
            title="Cycle Smart Layout (Spacebar / L)"
          >
            <Shuffle className="w-3.5 h-3.5 text-[#7a2e33]" />
            <span className="font-medium">Shuffle Layout</span>
          </button>

          <button
            onClick={onFlipSpread}
            className="p-1.5 text-[#111417] hover:text-[#7a2e33] hover:bg-[#ffffff] rounded-lg transition-colors"
            title="Flip Spread Horizontally (F)"
          >
            <FlipHorizontal2 className="w-3.5 h-3.5 text-[#6b6660]" />
          </button>
        </div>

        {hasGutterWarning && (
          <div className="flex items-center space-x-1 text-amber-700 bg-amber-50 border border-amber-300 px-2.5 py-1 rounded-full text-xs font-medium animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span>Gutter Warning</span>
          </div>
        )}
      </div>

      {/* Right: Zoom + Proofing + Export */}
      <div className="flex items-center space-x-3">
        {/* Zoom Slider */}
        <div className="hidden lg:flex items-center space-x-2 bg-[#f9f8f6] border border-[#e8dfd8] px-2.5 py-1 rounded-xl text-xs text-[#6b6660]">
          <span className="text-[11px] font-mono w-10 text-right">{zoomLevel}%</span>
          <input
            type="range"
            min="50"
            max="180"
            value={zoomLevel}
            onChange={(e) => onZoomChange(Number(e.target.value))}
            className="w-16 accent-[#7a2e33] h-1.5 cursor-pointer"
          />
          <button
            onClick={() => onZoomChange(100)}
            className="text-[10px] text-[#7a2e33] hover:underline"
            title="Reset Zoom to 100%"
          >
            100%
          </button>
        </div>

        {/* Client Proofing Button */}
        <button
          onClick={onOpenProofing}
          className="flex items-center space-x-1.5 bg-[#ffffff] hover:bg-[#f2ede4] text-[#111417] border border-[#d4c1a3] px-3 py-1.5 rounded-xl text-xs font-medium transition-colors shadow-sm"
          title="Open Client Approval & Commenting Portal"
        >
          <Eye className="w-3.5 h-3.5 text-[#7a2e33]" />
          <span>Client Proofing</span>
        </button>

        {/* Export Ready Button */}
        <button
          onClick={onOpenExport}
          className="flex items-center space-x-1.5 bg-[#7a2e33] hover:bg-[#5a2226] text-white px-4 py-1.5 rounded-xl text-xs font-semibold shadow-sm transition-all hover:shadow"
          title="Export 300 DPI Print Spreads & PDFs"
        >
          <Download className="w-3.5 h-3.5 text-[#d4c1a3]" />
          <span>Export Print</span>
        </button>
      </div>
    </header>
  );
};
