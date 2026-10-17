import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  MessageSquare,
  RotateCcw,
  Save,
  Check,
  Search,
  User,
  Film,
  Sparkles,
  Info,
  CheckCircle2,
} from 'lucide-react';
import {
  WHATSAPP_TEMPLATE_DEFINITIONS,
  WhatsAppTemplateDefinition,
  WhatsAppTemplateId,
  getWhatsAppTemplates,
  saveWhatsAppTemplates,
  resetWhatsAppTemplate,
  resetAllWhatsAppTemplates,
} from '../../utils/whatsappTemplates';

interface WhatsAppTemplatesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onTemplatesUpdated?: () => void;
}

export const WhatsAppTemplatesDrawer: React.FC<WhatsAppTemplatesDrawerProps> = ({
  isOpen,
  onClose,
  onTemplatesUpdated,
}) => {
  const [templates, setTemplates] = useState<Record<WhatsAppTemplateId, string>>({} as any);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'client' | 'editor'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [activeTextareaId, setActiveTextareaId] = useState<WhatsAppTemplateId | null>(null);
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  useEffect(() => {
    if (isOpen) {
      setTemplates(getWhatsAppTemplates());
      setSavedSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTextChange = (id: WhatsAppTemplateId, value: string) => {
    setTemplates(prev => ({ ...prev, [id]: value }));
    setSavedSuccess(false);
  };

  const handleResetSingle = (id: WhatsAppTemplateId) => {
    if (confirm('Reset this message format to default?')) {
      const def = WHATSAPP_TEMPLATE_DEFINITIONS.find(d => d.id === id);
      if (def) {
        setTemplates(prev => ({ ...prev, [id]: def.defaultTemplate }));
        resetWhatsAppTemplate(id);
        onTemplatesUpdated?.();
      }
    }
  };

  const handleResetAll = () => {
    if (confirm('Reset ALL message formats to factory defaults? Any custom edits will be reverted.')) {
      const defaults = resetAllWhatsAppTemplates();
      setTemplates(defaults);
      onTemplatesUpdated?.();
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    }
  };

  const handleSaveAll = () => {
    saveWhatsAppTemplates(templates);
    onTemplatesUpdated?.();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleInsertVariable = (id: WhatsAppTemplateId, varKey: string) => {
    const textarea = textareaRefs.current[id];
    const insertion = `{${varKey}}`;
    const currentText = templates[id] || '';

    if (!textarea) {
      handleTextChange(id, currentText + (currentText.endsWith('\n') ? '' : '\n') + insertion);
      return;
    }

    const start = textarea.selectionStart ?? currentText.length;
    const end = textarea.selectionEnd ?? currentText.length;
    const updated = currentText.slice(0, start) + insertion + currentText.slice(end);

    handleTextChange(id, updated);

    // Restore focus and cursor position after insertion
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + insertion.length, start + insertion.length);
    }, 50);
  };

  const filteredDefinitions = WHATSAPP_TEMPLATE_DEFINITIONS.filter(def => {
    if (selectedCategory !== 'all' && def.category !== selectedCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = def.name.toLowerCase().includes(q);
      const matchDesc = def.description.toLowerCase().includes(q);
      const matchVars = def.variables.some(v => v.key.toLowerCase().includes(q) || v.label.toLowerCase().includes(q));
      return matchName || matchDesc || matchVars;
    }
    return true;
  });

  const clientCount = WHATSAPP_TEMPLATE_DEFINITIONS.filter(d => d.category === 'client').length;
  const editorCount = WHATSAPP_TEMPLATE_DEFINITIONS.filter(d => d.category === 'editor').length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-[#fcfbf9] w-full max-w-2xl h-full shadow-2xl flex flex-col border-l border-[#d4c1a3] text-[#111417]">
        {/* Header */}
        <div className="px-6 py-4 bg-[#7a2e33] text-white flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                WhatsApp Message Formats
                <span className="text-[11px] font-semibold px-2 py-0.5 bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 rounded-full">
                  Customizable
                </span>
              </h2>
              <p className="text-xs text-white/80">
                Customize pre-filled message templates sent across the studio workflow
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar: Category Tabs & Search */}
        <div className="px-6 py-3.5 bg-white border-b border-[#d4c1a3] shrink-0 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            {/* Category Pills */}
            <div className="flex items-center gap-1.5 bg-[#f5f3ef] p-1 rounded-xl border border-[#d4c1a3]/60">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  selectedCategory === 'all'
                    ? 'bg-white text-[#7a2e33] shadow-2xs'
                    : 'text-[#6b6660] hover:text-[#111417]'
                }`}
              >
                All ({WHATSAPP_TEMPLATE_DEFINITIONS.length})
              </button>
              <button
                onClick={() => setSelectedCategory('client')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  selectedCategory === 'client'
                    ? 'bg-sky-50 text-sky-900 border border-sky-200 shadow-2xs'
                    : 'text-[#6b6660] hover:text-sky-800'
                }`}
              >
                <User className="w-3 h-3 text-sky-600" />
                <span>Client ({clientCount})</span>
              </button>
              <button
                onClick={() => setSelectedCategory('editor')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  selectedCategory === 'editor'
                    ? 'bg-indigo-50 text-indigo-900 border border-indigo-200 shadow-2xs'
                    : 'text-[#6b6660] hover:text-indigo-800'
                }`}
              >
                <Film className="w-3 h-3 text-indigo-600" />
                <span>Editor ({editorCount})</span>
              </button>
            </div>

            {/* Quick Search */}
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#6b6660]" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search templates or variables..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#f9f8f6] border border-[#d4c1a3] rounded-xl focus:outline-hidden focus:border-[#7a2e33] focus:bg-white"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[#6b6660] bg-amber-50/70 border border-amber-200/80 px-3 py-1.5 rounded-lg">
            <Info className="w-3.5 h-3.5 text-amber-700 shrink-0" />
            <span>
              Variables inside <strong>{`{brackets}`}</strong> are automatically replaced with real job details before opening WhatsApp.
            </span>
          </div>
        </div>

        {/* Scrollable Templates List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {filteredDefinitions.map(def => {
            const currentVal = templates[def.id] ?? def.defaultTemplate;
            const isCustomized = currentVal.trim() !== def.defaultTemplate.trim();

            return (
              <div
                key={def.id}
                className="bg-white rounded-2xl border border-[#d4c1a3] p-4 shadow-2xs hover:border-[#7a2e33]/50 transition-all flex flex-col space-y-3"
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-[#111417] flex items-center gap-1.5">
                        {def.name}
                      </h3>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                          def.category === 'client'
                            ? 'bg-sky-50 text-sky-800 border-sky-200'
                            : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                        }`}
                      >
                        {def.category === 'client' ? 'Client Message' : 'Editor Message'}
                      </span>
                      {isCustomized && (
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5 text-emerald-600" />
                          Customized
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#6b6660] mt-0.5">{def.description}</p>
                  </div>

                  {isCustomized && (
                    <button
                      type="button"
                      onClick={() => handleResetSingle(def.id)}
                      className="p-1.5 text-xs text-[#6b6660] hover:text-[#7a2e33] hover:bg-[#f9f8f6] rounded-lg transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
                      title="Reset to default text"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span className="text-[11px] font-semibold">Reset</span>
                    </button>
                  )}
                </div>

                {/* Variable Insertion Chips */}
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#6b6660] mb-1.5 flex items-center gap-1">
                    <span>Insert dynamic variable:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {def.variables.map(v => (
                      <button
                        key={v.key}
                        type="button"
                        onClick={() => handleInsertVariable(def.id, v.key)}
                        title={`${v.description} (Click to insert)`}
                        className="px-2 py-0.5 bg-[#f5f3ef] hover:bg-[#eae6df] text-[#4a4640] border border-[#d4c1a3]/70 hover:border-[#7a2e33] text-[10.5px] font-mono rounded-md transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <span>{`{${v.key}}`}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Textarea editor */}
                <div className="relative">
                  <textarea
                    ref={el => {
                      textareaRefs.current[def.id] = el;
                    }}
                    value={currentVal}
                    onChange={e => handleTextChange(def.id, e.target.value)}
                    onFocus={() => setActiveTextareaId(def.id)}
                    rows={6}
                    className="w-full p-3 text-xs font-mono leading-relaxed bg-[#fbfaf8] border border-[#d4c1a3] rounded-xl focus:outline-hidden focus:border-[#7a2e33] focus:bg-white text-[#111417] shadow-inner transition-colors resize-y"
                    placeholder="Enter message template..."
                  />
                  <div className="flex items-center justify-between text-[10px] text-[#6b6660] mt-1 px-1">
                    <span>Formatting: *bold*, _italic_, ~strikethrough~ supported</span>
                    <span>{currentVal.length} characters</span>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredDefinitions.length === 0 && (
            <div className="text-center py-12 text-[#6b6660] bg-white rounded-2xl border border-dashed border-[#d4c1a3]">
              <MessageSquare className="w-8 h-8 mx-auto text-gray-300 mb-2" />
              <p className="text-sm font-semibold">No message templates match your search</p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                }}
                className="mt-2 text-xs text-[#7a2e33] font-bold hover:underline"
              >
                Clear search filters
              </button>
            </div>
          )}
        </div>

        {/* Footer with Actions */}
        <div className="px-6 py-4 bg-white border-t border-[#d4c1a3] shrink-0 flex items-center justify-between gap-3 shadow-sm">
          <button
            type="button"
            onClick={handleResetAll}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-xl transition-colors cursor-pointer"
            title="Reset all message formats to defaults"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset All to Defaults</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-[#6b6660] hover:text-[#111417] hover:bg-[#f5f3ef] border border-[#d4c1a3] rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md"
            >
              {savedSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 text-white" />
                  <span>Save All Formats</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
