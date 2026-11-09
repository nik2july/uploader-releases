import React from 'react';
import { LayoutTemplate, getTemplatesForCount } from './engine/smartLayoutEngine';
import { LayoutGrid, Sparkles } from 'lucide-react';

interface LayoutPickerProps {
  currentPhotoCount: number;
  currentLayoutId: string;
  onSelectLayout: (template: LayoutTemplate) => void;
}

export const LayoutPicker: React.FC<LayoutPickerProps> = ({
  currentPhotoCount,
  currentLayoutId,
  onSelectLayout
}) => {
  const count = Math.max(1, currentPhotoCount);
  const templates = getTemplatesForCount(count);

  return (
    <div className="bg-[#ffffff] border-b border-[#e8dfd8] px-4 py-2 flex items-center space-x-3 overflow-x-auto select-none shadow-[0_1px_2px_rgba(17,20,23,0.02)]">
      <div className="flex items-center space-x-1.5 text-xs text-[#6b6660] flex-shrink-0 pr-3 border-r border-[#e8dfd8]">
        <LayoutGrid className="w-3.5 h-3.5 text-[#7a2e33]" />
        <span className="font-medium text-[#111417]">Smart Layouts ({templates.length})</span>
      </div>

      <div className="flex items-center space-x-2">
        {templates.map((tpl) => {
          const isSelected = tpl.id === currentLayoutId;
          const sampleFrames = tpl.getFrames(4, 3);

          return (
            <button
              key={tpl.id}
              onClick={() => onSelectLayout(tpl)}
              title={`${tpl.name} — ${tpl.description}`}
              className={`flex-shrink-0 flex flex-col items-center p-1.5 rounded-xl border transition-all ${
                isSelected
                  ? 'border-[#7a2e33] bg-[#fbf4f4] shadow-xs ring-1 ring-[#7a2e33]'
                  : 'border-[#e8dfd8] bg-[#fdfcfb] hover:border-[#d4c1a3] hover:bg-[#ffffff]'
              }`}
            >
              {/* Mini Spread Wireframe Preview */}
              <div className="w-20 h-8 bg-[#ffffff] relative rounded-[3px] border border-[#d4c1a3] overflow-hidden flex items-center justify-center shadow-2xs">
                {/* Center gutter line */}
                <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-[#d4c1a3]/70 z-10" />

                {/* Frames */}
                {sampleFrames.map((f, i) => (
                  <div
                    key={i}
                    style={{
                      left: `${f.x}%`,
                      top: `${f.y}%`,
                      width: `${f.width}%`,
                      height: `${f.height}%`
                    }}
                    className={`absolute rounded-[1px] ${
                      isSelected ? 'bg-[#7a2e33]' : 'bg-[#d4c1a3]'
                    }`}
                  />
                ))}
              </div>

              <span className={`text-[10px] mt-1 font-sans truncate max-w-[80px] ${
                isSelected ? 'font-semibold text-[#7a2e33]' : 'text-[#6b6660]'
              }`}>
                {tpl.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
