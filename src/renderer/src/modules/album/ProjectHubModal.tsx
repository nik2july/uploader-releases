import React, { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, 
  Plus, 
  Upload, 
  Calendar, 
  User, 
  Layers, 
  Sparkles, 
  Trash2, 
  Copy, 
  Download, 
  Search, 
  X,
  Clock,
  Printer,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import { AlbumProject } from './album';
import { 
  getProjectsList, 
  loadProjectFromStorage, 
  deleteProject, 
  duplicateProject, 
  setActiveProjectId, 
  importProjectFromFile,
  exportProjectFile,
  ProjectMeta 
} from './engine/projectStorage';
import { createInitialSampleProject } from './engine/sampleData';

interface ProjectHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProject: (project: AlbumProject) => void;
  onOpenNewProjectModal: () => void;
  activeProjectId?: string;
}

export const ProjectHubModal: React.FC<ProjectHubModalProps> = ({
  isOpen,
  onClose,
  onSelectProject,
  onOpenNewProjectModal,
  activeProjectId
}) => {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshList = () => {
    setProjects(getProjectsList());
  };

  useEffect(() => {
    if (isOpen) {
      refreshList();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOpenProject = (id: string) => {
    const loaded = loadProjectFromStorage(id);
    if (loaded) {
      setActiveProjectId(id);
      onSelectProject(loaded);
      onClose();
    }
  };

  const handleOpenSample = () => {
    const sample = createInitialSampleProject();
    onSelectProject(sample);
    onClose();
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this album project? This cannot be undone.')) {
      deleteProject(id);
      refreshList();
    }
  };

  const handleDuplicate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const duplicated = duplicateProject(id);
    if (duplicated) {
      refreshList();
    }
  };

  const handleExport = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const proj = loadProjectFromStorage(id);
    if (proj) {
      exportProjectFile(proj);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const imported = await importProjectFromFile(file);
        refreshList();
        onSelectProject(imported);
        onClose();
      } catch (err) {
        alert('Could not open file: ' + (err as Error).message);
      }
    }
  };

  const filteredProjects = projects.filter(p => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return p.title.toLowerCase().includes(q) || 
           p.clientNames.toLowerCase().includes(q) ||
           p.eventType.toLowerCase().includes(q);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111417]/60 backdrop-blur-sm p-6 overflow-y-auto">
      <div className="bg-[#ffffff] border border-[#d4c1a3] rounded-2xl w-full max-w-5xl shadow-[0_25px_70px_rgba(17,20,23,0.18)] overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in duration-200">
        
        {/* Header Bar */}
        <div className="px-8 pt-7 pb-6 border-b border-[#e8dfd8] bg-[#fdfcfb] flex items-start justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-xl bg-[#7a2e33] p-0.5 shadow-md flex items-center justify-center">
              <div className="w-full h-full border border-[#d4c1a3]/40 rounded-[10px] flex items-center justify-center bg-[#7a2e33]">
                <BookOpen className="w-6 h-6 text-[#d4c1a3]" />
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-2.5">
                <h1 className="font-serif text-2xl font-semibold tracking-wide text-[#111417]">
                  Bavare <span className="text-[#7a2e33] font-normal italic">Album Projects</span>
                </h1>
                <span className="text-[11px] bg-[#f2ede4] text-[#7a2e33] px-2 py-0.5 rounded-full font-mono font-medium border border-[#d4c1a3]">
                  Studio OS
                </span>
              </div>
              <p className="text-xs text-[#6b6660] mt-1 font-sans">
                Each project represents a distinct album with customized size, print DPI, and sheet layout.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {activeProjectId && (
              <button
                onClick={onClose}
                className="text-[#6b6660] hover:text-[#111417] p-2 rounded-full hover:bg-[#f2ede4] transition-colors"
                title="Close Project Hub"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="px-8 py-4 bg-[#f9f8f6] border-b border-[#e8dfd8] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => {
                onClose();
                onOpenNewProjectModal();
              }}
              className="flex items-center space-x-2 bg-[#7a2e33] hover:bg-[#5a2226] text-[#ffffff] px-4 py-2 rounded-xl text-sm font-medium shadow-sm transition-all hover:shadow"
            >
              <Plus className="w-4 h-4 text-[#d4c1a3]" />
              <span>Create New Album</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center space-x-2 bg-[#ffffff] hover:bg-[#f2ede4] text-[#111417] border border-[#d4c1a3] px-3.5 py-2 rounded-xl text-sm font-medium transition-colors"
            >
              <Upload className="w-4 h-4 text-[#7a2e33]" />
              <span>Open .bavari File</span>
            </button>
            <input 
              ref={fileInputRef}
              type="file" 
              accept=".bavari,.json"
              onChange={handleFileInputChange}
              className="hidden" 
            />

            <button
              onClick={handleOpenSample}
              className="flex items-center space-x-1.5 text-xs text-[#7a2e33] hover:text-[#5a2226] font-medium px-3 py-2 rounded-lg hover:bg-[#f2ede4] transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#c5a059]" />
              <span>Open Sample Demo</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8c867e]" />
            <input
              type="text"
              placeholder="Search albums..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-[#ffffff] border border-[#e8dfd8] rounded-xl text-xs text-[#111417] placeholder-[#8c867e] focus:outline-none focus:border-[#7a2e33] transition-colors"
            />
          </div>
        </div>

        {/* Projects Grid / List */}
        <div className="p-8 overflow-y-auto flex-1 bg-[#ffffff]">
          {filteredProjects.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#f2ede4] text-[#7a2e33] flex items-center justify-center mx-auto mb-4 border border-[#d4c1a3]">
                <BookOpen className="w-8 h-8" />
              </div>
              <h3 className="font-serif text-lg font-medium text-[#111417]">No Album Projects Found</h3>
              <p className="text-xs text-[#6b6660] mt-1 max-w-sm mx-auto">
                {searchQuery ? 'No albums match your search query.' : 'Get started by creating your first fine-art bespoke album.'}
              </p>
              <button
                onClick={() => {
                  onClose();
                  onOpenNewProjectModal();
                }}
                className="mt-5 inline-flex items-center space-x-2 bg-[#7a2e33] hover:bg-[#5a2226] text-white px-5 py-2.5 rounded-xl text-xs font-medium shadow-sm transition-all"
              >
                <Plus className="w-4 h-4 text-[#d4c1a3]" />
                <span>Create New Album</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProjects.map((proj) => {
                const isCurrent = proj.id === activeProjectId;
                const dateStr = proj.updatedAt 
                  ? new Date(proj.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : 'Recent';

                return (
                  <div
                    key={proj.id}
                    onClick={() => handleOpenProject(proj.id)}
                    className={`group relative bg-[#ffffff] rounded-2xl border transition-all duration-200 cursor-pointer overflow-hidden flex flex-col hover:shadow-lg ${
                      isCurrent
                        ? 'border-[#7a2e33] ring-2 ring-[#7a2e33]/20 shadow-md'
                        : 'border-[#e8dfd8] hover:border-[#d4c1a3]'
                    }`}
                  >
                    {/* Visual Preview / Thumbnail Banner */}
                    <div className="h-36 bg-[#f2ede4] relative overflow-hidden flex items-center justify-center border-b border-[#e8dfd8]">
                      {proj.coverThumbnail ? (
                        <img 
                          src={proj.coverThumbnail} 
                          alt={proj.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                        />
                      ) : (
                        <div className="text-center p-4">
                          <BookOpen className="w-10 h-10 text-[#d4c1a3] mx-auto mb-1 stroke-1" />
                          <span className="text-[10px] text-[#8c867e] font-serif tracking-widest uppercase">
                            Bavare Fine Art
                          </span>
                        </div>
                      )}

                      {/* Top Badges */}
                      <div className="absolute top-2.5 left-2.5 flex items-center space-x-1.5">
                        <span className="bg-[#111417]/80 backdrop-blur-sm text-[#ffffff] text-[10px] font-mono px-2 py-0.5 rounded-md">
                          {proj.sizePreset?.spreadWidth || 36}" × {proj.sizePreset?.spreadHeight || 12}"
                        </span>
                        <span className="bg-[#7a2e33]/90 backdrop-blur-sm text-[#d4c1a3] text-[10px] font-mono font-medium px-2 py-0.5 rounded-md">
                          {proj.targetDpi || 300} DPI
                        </span>
                      </div>

                      {isCurrent && (
                        <div className="absolute top-2.5 right-2.5 bg-emerald-600 text-white text-[10px] font-medium px-2 py-0.5 rounded-md shadow flex items-center space-x-1">
                          <ShieldCheck className="w-3 h-3" />
                          <span>Active</span>
                        </div>
                      )}
                    </div>

                    {/* Content Section */}
                    <div className="p-4 flex-1 flex flex-col justify-between">
                      <div>
                        <h2 className="font-serif font-medium text-base text-[#111417] group-hover:text-[#7a2e33] transition-colors line-clamp-1">
                          {proj.title}
                        </h2>
                        <div className="flex items-center space-x-1.5 text-xs text-[#6b6660] mt-1">
                          <User className="w-3 h-3 text-[#8c867e]" />
                          <span className="truncate">{proj.clientNames || 'Private Client'}</span>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-[#f2ede4] flex items-center justify-between text-[11px] text-[#8c867e]">
                        <div className="flex items-center space-x-2 font-mono">
                          <span className="flex items-center space-x-1">
                            <Layers className="w-3 h-3 text-[#7a2e33]" />
                            <span>{proj.spreadCount || 0} sheets</span>
                          </span>
                          <span>•</span>
                          <span>{proj.photoCount || 0} photos</span>
                        </div>

                        <div className="flex items-center space-x-1 text-[10px]">
                          <Clock className="w-3 h-3" />
                          <span>{dateStr}</span>
                        </div>
                      </div>

                      {/* Card Footer Actions */}
                      <div className="mt-3 pt-2.5 flex items-center justify-between">
                        <button
                          onClick={() => handleOpenProject(proj.id)}
                          className="flex items-center space-x-1.5 text-xs font-medium text-[#7a2e33] group-hover:text-[#5a2226]"
                        >
                          <span>Open Album</span>
                          <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </button>

                        <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => handleDuplicate(proj.id, e)}
                            title="Duplicate Album"
                            className="p-1.5 text-[#8c867e] hover:text-[#111417] hover:bg-[#f2ede4] rounded-lg transition-colors"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleExport(proj.id, e)}
                            title="Export .bavari File"
                            className="p-1.5 text-[#8c867e] hover:text-[#111417] hover:bg-[#f2ede4] rounded-lg transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleDelete(proj.id, e)}
                            title="Delete Album"
                            className="p-1.5 text-[#8c867e] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info note */}
        <div className="px-8 py-3.5 bg-[#fdfcfb] border-t border-[#e8dfd8] flex items-center justify-between text-xs text-[#6b6660]">
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Automatic cloud & local autosave active</span>
          </span>
          <span className="font-mono text-[11px] text-[#8c867e]">
            Bavare Studio Edition • 300 DPI Fine-Art Master
          </span>
        </div>
      </div>
    </div>
  );
};
