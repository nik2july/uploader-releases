import React, { useEffect, useState, useRef } from 'react';
import {
  Upload,
  FolderOpen,
  Film,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Play,
  Pause,
  X,
  RotateCcw,
  RotateCw,
  Zap,
  Cpu,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  RefreshCw,
  Plus,
  Trash2,
  Share2,
  ExternalLink,
  Eye,
  Music,
  GripVertical,
  ArrowLeft,
  ArrowRight,
  Star,
  Grid,
  Check,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
  SlidersHorizontal,
  LayoutGrid,
  Download,
  Maximize2,
  Minimize2,
  Edit2,
  Edit3,
  AlertTriangle,
} from 'lucide-react';
import type {
  GallerySummary,
  GalleryUploadSessionState,
  GalleryMediaItem,
  GallerySongItem,
} from '../../../../shared/contracts';

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 MB/s';
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

function formatETA(seconds: number): string {
  if (!seconds || seconds <= 0 || !Number.isFinite(seconds)) return '--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')} remaining`;
}

function generateSlug(clientName: string, title: string): string {
  const combined = `${clientName} ${title}`.trim();
  if (!combined) return '';
  return combined
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function GalleryUploaderScreen(): React.JSX.Element {
  const [galleries, setGalleries] = useState<GallerySummary[]>([]);
  const [selectedGalleryId, setSelectedGalleryId] = useState<string>('');
  const [selectedSceneId, setSelectedSceneId] = useState<string>('highlights');
  const [newSceneName, setNewSceneName] = useState('');
  const [showAddScene, setShowAddScene] = useState(false);
  const [autoTranscode, setAutoTranscode] = useState(true);
  const [autoplayLoop, setAutoplayLoop] = useState(true);
  const [loadingGalleries, setLoadingGalleries] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [isPreparingUpload, setIsPreparingUpload] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [copiedShareLink, setCopiedShareLink] = useState(false);

  // Edit & Delete Gallery Modal State
  const [showEditGalleryModal, setShowEditGalleryModal] = useState(false);
  const [editClientName, setEditClientName] = useState('');
  const [editGalleryTitle, setEditGalleryTitle] = useState('');
  const [editEventDate, setEditEventDate] = useState('');
  const [editCategory, setEditCategory] = useState('Weddings');
  const [editDescription, setEditDescription] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [isEditSlugCustomized, setIsEditSlugCustomized] = useState(false);
  const [isSavingGallery, setIsSavingGallery] = useState(false);

  // Add Gallery Modal State
  const [showAddGalleryModal, setShowAddGalleryModal] = useState(false);
  const [addClientName, setAddClientName] = useState('');
  const [addGalleryTitle, setAddGalleryTitle] = useState('');
  const [addEventDate, setAddEventDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [addCategory, setAddCategory] = useState('Weddings');
  const [addSlug, setAddSlug] = useState('');
  const [isAddSlugCustomized, setIsAddSlugCustomized] = useState(false);
  const [addDescription, setAddDescription] = useState('');
  const [isCreatingGallery, setIsCreatingGallery] = useState(false);

  const [showDeleteGalleryModal, setShowDeleteGalleryModal] = useState(false);
  const [isDeletingGallery, setIsDeletingGallery] = useState(false);

  // Edit & Delete Event / Scene State
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [editingSceneName, setEditingSceneName] = useState<string>('');
  const [isSavingSceneRename, setIsSavingSceneRename] = useState(false);

  const [sceneToDelete, setSceneToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingScene, setIsDeletingScene] = useState(false);

  // Media Curation & Rearrange State
  const [mediaItems, setMediaItems] = useState<GalleryMediaItem[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [curationSceneFilter, setCurationSceneFilter] = useState<string>('all');
  const [draggedMediaId, setDraggedMediaId] = useState<string | null>(null);
  const [draggedMediaIds, setDraggedMediaIds] = useState<string[]>([]);
  const [dragOverMediaId, setDragOverMediaId] = useState<string | null>(null);
  const [dragOverSceneId, setDragOverSceneId] = useState<string | null>(null);
  const [previewMediaItem, setPreviewMediaItem] = useState<GalleryMediaItem | null>(null);
  const [showEmbeddedPreview, setShowEmbeddedPreview] = useState(false);
  const [selectedMediaIds, setSelectedMediaIds] = useState<Set<string>>(new Set());
  const [lastSelectedMediaId, setLastSelectedMediaId] = useState<string | null>(null);

  // Rearrange Undo & Redo History State (Cmd + Z support)
  const [undoStack, setUndoStack] = useState<GalleryMediaItem[][]>([]);
  const [redoStack, setRedoStack] = useState<GalleryMediaItem[][]>([]);
  const [isUndoing, setIsUndoing] = useState<boolean>(false);
  const undoStackRef = useRef<GalleryMediaItem[][]>([]);
  const redoStackRef = useRef<GalleryMediaItem[][]>([]);
  const mediaItemsRef = useRef<GalleryMediaItem[]>([]);
  const isUndoingRef = useRef<boolean>(false);

  useEffect(() => {
    undoStackRef.current = undoStack;
  }, [undoStack]);

  useEffect(() => {
    redoStackRef.current = redoStack;
  }, [redoStack]);

  useEffect(() => {
    mediaItemsRef.current = mediaItems;
  }, [mediaItems]);

  useEffect(() => {
    isUndoingRef.current = isUndoing;
  }, [isUndoing]);

  // Top-Level Screen Tab State: 'upload' | 'rearrange'
  const [activeTab, setActiveTab] = useState<'upload' | 'rearrange'>(() => {
    return (localStorage.getItem('baawaray_gallery_active_tab') as 'upload' | 'rearrange') || 'upload';
  });

  const handleTabChange = (tab: 'upload' | 'rearrange'): void => {
    setActiveTab(tab);
    localStorage.setItem('baawaray_gallery_active_tab', tab);
  };

  // Clean Rearrange Mode, Zoom Slider & Live Loop Playback State
  const [cleanRearrangeMode, setCleanRearrangeMode] = useState<boolean>(() => {
    return localStorage.getItem('baawaray_gallery_clean_mode') !== 'false';
  });
  const [thumbnailZoom, setThumbnailZoom] = useState<number>(() => {
    const saved = localStorage.getItem('baawaray_gallery_zoom');
    return saved ? Math.min(320, Math.max(48, Number(saved))) : 120;
  });
  const updateThumbnailZoom = (val: number): void => {
    const clamped = Math.min(320, Math.max(48, val));
    setThumbnailZoom(clamped);
    localStorage.setItem('baawaray_gallery_zoom', String(clamped));
  };
  const [autoplayLoops, setAutoplayLoops] = useState<boolean>(true);
  const isDraggingCardRef = useRef(false);
  const [isFullScreenRearrange, setIsFullScreenRearrange] = useState<boolean>(false);
  const rearrangeContainerRef = useRef<HTMLDivElement | null>(null);
  const fullScreenContainerRef = useRef<HTMLDivElement | null>(null);

  // Background Music / Song Library State
  const [songsLibrary, setSongsLibrary] = useState<GallerySongItem[]>([]);
  const [selectedSongUrl, setSelectedSongUrl] = useState<string>('');
  const [selectedSongTitle, setSelectedSongTitle] = useState<string>('');
  const [isUploadingSong, setIsUploadingSong] = useState(false);
  const [isSavingSong, setIsSavingSong] = useState(false);
  const [isPreviewingAudio, setIsPreviewingAudio] = useState(false);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  const [session, setSession] = useState<GalleryUploadSessionState>({
    status: 'idle',
    galleryId: '',
    galleryTitle: '',
    sceneId: 'highlights',
    sceneName: 'Highlights',
    items: [],
    totalBytes: 0,
    uploadedBytes: 0,
    overallProgress: 0,
    speedBytesPerSec: 0,
    etaSeconds: 0,
    autoTranscode: true,
  });

  const dropRef = useRef<HTMLDivElement>(null);
  const prevSessionStatusRef = useRef<string>('idle');

  const showToast = (msg: string): void => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  // Load galleries and songs on mount
  const loadGalleries = async (): Promise<void> => {
    setLoadingGalleries(true);
    try {
      const [list, songs] = await Promise.all([
        window.api.galleryFetchGalleries(),
        window.api.galleryFetchSongs(),
      ]);
      setGalleries(list);
      setSongsLibrary(songs);
      if (list.length > 0 && !selectedGalleryId) {
        const first = list[0];
        setSelectedGalleryId(first.id);
        setSelectedSongUrl(first.backgroundMusicUrl || '');
        setSelectedSongTitle(first.backgroundMusicTitle || '');
        if (first.scenes && first.scenes.length > 0) {
          setSelectedSceneId(first.scenes[0].id);
        }
      } else if (selectedGalleryId) {
        const current = list.find((g) => g.id === selectedGalleryId);
        if (current) {
          setSelectedSongUrl(current.backgroundMusicUrl || '');
          setSelectedSongTitle(current.backgroundMusicTitle || '');
        }
      }
    } catch (err) {
      console.error('Failed to load galleries:', err);
    } finally {
      setLoadingGalleries(false);
    }
  };

  // Load media items for the selected gallery
  const loadGalleryMedia = async (galleryId: string): Promise<void> => {
    if (!galleryId) {
      setMediaItems([]);
      setUndoStack([]);
      setRedoStack([]);
      return;
    }
    setLoadingMedia(true);
    try {
      const items = await window.api.galleryFetchMedia(galleryId);
      setMediaItems(items);
      setUndoStack([]);
      setRedoStack([]);
    } catch (err) {
      console.error('Failed to load gallery media:', err);
    } finally {
      setLoadingMedia(false);
    }
  };

  useEffect(() => {
    void loadGalleries();
    void window.api.galleryGetState().then(setSession);

    const unsubscribe = window.api.onGalleryUploadState((state) => {
      setSession(state);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Whenever selectedGalleryId changes, sync song fields & load gallery media
  useEffect(() => {
    if (!selectedGalleryId) return;
    const g = galleries.find((x) => x.id === selectedGalleryId);
    if (g) {
      setSelectedSongUrl(g.backgroundMusicUrl || '');
      setSelectedSongTitle(g.backgroundMusicTitle || '');
    }
    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
      setIsPreviewingAudio(false);
    }
    void loadGalleryMedia(selectedGalleryId);
  }, [selectedGalleryId]);

  // Automatically refresh media grid when an upload session finishes
  useEffect(() => {
    if (prevSessionStatusRef.current === 'running' && session.status === 'completed') {
      if (selectedGalleryId) {
        void loadGalleryMedia(selectedGalleryId);
      }
    }
    prevSessionStatusRef.current = session.status;
  }, [session.status, selectedGalleryId]);

  const currentGallery = galleries.find((g) => g.id === selectedGalleryId);
  const scenes =
    currentGallery?.scenes && currentGallery.scenes.length > 0
      ? currentGallery.scenes
      : [
          { id: 'highlights', name: 'Highlights', order: 0 },
          { id: 'ceremony', name: 'Ceremony', order: 1 },
          { id: 'reception', name: 'Reception', order: 2 },
        ];

  const publicGalleryUrl = currentGallery
    ? `https://galleries.baawaray.com/gallery/${currentGallery.slug || currentGallery.id}`
    : '';

  // Share Link & Preview Gallery Actions
  const handleCopyShareLink = async (): Promise<void> => {
    if (!publicGalleryUrl) return;
    await window.api.copyToClipboard(publicGalleryUrl);
    setCopiedShareLink(true);
    showToast(`Copied share link: ${publicGalleryUrl}`);
    setTimeout(() => setCopiedShareLink(false), 2500);
  };

  const handlePreviewInBrowser = async (): Promise<void> => {
    if (!publicGalleryUrl) return;
    try {
      await window.api.openExternal(publicGalleryUrl);
    } catch (err) {
      console.error('Failed to open external preview:', err);
    }
  };

  // Open Edit Gallery Modal with pre-filled fields
  const handleOpenEditGalleryModal = (): void => {
    if (!currentGallery) return;
    setEditClientName(currentGallery.clientName || '');
    setEditGalleryTitle(currentGallery.title || '');
    setEditEventDate(currentGallery.eventDate || '');
    setEditCategory(currentGallery.category || 'Weddings');
    setEditDescription(currentGallery.description || '');
    setEditSlug(currentGallery.slug || generateSlug(currentGallery.clientName || '', currentGallery.title || ''));
    setIsEditSlugCustomized(false);
    setShowEditGalleryModal(true);
  };

  const handleEditClientNameChange = (val: string): void => {
    setEditClientName(val);
    if (!isEditSlugCustomized) {
      setEditSlug(generateSlug(val, editGalleryTitle));
    }
  };

  const handleEditGalleryTitleChange = (val: string): void => {
    setEditGalleryTitle(val);
    if (!isEditSlugCustomized) {
      setEditSlug(generateSlug(editClientName, val));
    }
  };

  // Save Gallery Edits
  const handleSaveGalleryDetails = async (e?: React.FormEvent): Promise<void> => {
    if (e) e.preventDefault();
    if (!selectedGalleryId || !editClientName.trim() || !editGalleryTitle.trim()) return;

    setIsSavingGallery(true);
    try {
      const cleanSlug = editSlug
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '');

      const updates = {
        clientName: editClientName.trim(),
        title: editGalleryTitle.trim(),
        eventDate: editEventDate,
        category: editCategory,
        description: editDescription.trim(),
        slug: cleanSlug || undefined,
      };
      const updated = await window.api.galleryUpdateGallery(selectedGalleryId, updates);
      if (updated) {
        setGalleries((prev) =>
          prev.map((g) =>
            g.id === selectedGalleryId
              ? { ...g, ...updated, slug: updated.slug || cleanSlug || g.slug }
              : g
          )
        );
        showToast(`Updated gallery: "${editClientName.trim()}"`);
        setShowEditGalleryModal(false);
      } else {
        alert('Failed to update gallery details. Please try again.');
      }
    } catch (err: any) {
      console.error('Failed to update gallery:', err);
      alert(err?.message || 'Error updating gallery');
    } finally {
      setIsSavingGallery(false);
    }
  };

  // Add Gallery Handlers
  const handleOpenAddGalleryModal = (): void => {
    setAddClientName('');
    setAddGalleryTitle('');
    setAddEventDate(new Date().toISOString().split('T')[0]);
    setAddCategory('Weddings');
    setAddSlug('');
    setIsAddSlugCustomized(false);
    setAddDescription('');
    setShowAddGalleryModal(true);
  };

  const handleAddClientNameChange = (val: string): void => {
    setAddClientName(val);
    if (!isAddSlugCustomized) {
      setAddSlug(generateSlug(val, addGalleryTitle));
    }
  };

  const handleAddGalleryTitleChange = (val: string): void => {
    setAddGalleryTitle(val);
    if (!isAddSlugCustomized) {
      setAddSlug(generateSlug(addClientName, val));
    }
  };

  const handleCreateGallerySubmit = async (e?: React.FormEvent): Promise<void> => {
    if (e) e.preventDefault();
    const trimmedClient = addClientName.trim();
    const trimmedTitle = addGalleryTitle.trim();
    if (!trimmedClient || !trimmedTitle) return;

    setIsCreatingGallery(true);
    try {
      const cleanSlug = (addSlug.trim() || generateSlug(trimmedClient, trimmedTitle))
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '');

      const newGallery = await window.api.galleryCreateGallery({
        clientName: trimmedClient,
        title: trimmedTitle,
        eventDate: addEventDate,
        category: addCategory,
        slug: cleanSlug,
        description: addDescription.trim(),
        isPublished: true,
        scenes: [
          { id: 'highlights', name: 'Highlights', order: 0 },
          { id: 'ceremony', name: 'Ceremony', order: 1 },
          { id: 'reception', name: 'Reception', order: 2 },
        ],
      });

      if (newGallery) {
        setGalleries((prev) => [newGallery, ...prev]);
        setSelectedGalleryId(newGallery.id);
        setSelectedSongUrl(newGallery.backgroundMusicUrl || '');
        setSelectedSongTitle(newGallery.backgroundMusicTitle || '');
        if (newGallery.scenes && newGallery.scenes.length > 0) {
          setSelectedSceneId(newGallery.scenes[0].id);
        }
        setMediaItems([]);
        setShowAddGalleryModal(false);
        showToast(`Created client gallery: "${trimmedClient} — ${trimmedTitle}"`);
      } else {
        alert('Failed to create gallery. Please try again.');
      }
    } catch (err: any) {
      console.error('Failed to create gallery:', err);
      alert(err?.message || 'Error creating gallery');
    } finally {
      setIsCreatingGallery(false);
    }
  };

  // Confirm and Execute Gallery Deletion
  const handleConfirmDeleteGallery = async (): Promise<void> => {
    if (!selectedGalleryId || !currentGallery) return;
    setIsDeletingGallery(true);
    const targetName = currentGallery.clientName;
    try {
      const success = await window.api.galleryDeleteGallery(selectedGalleryId);
      if (success) {
        const remaining = galleries.filter((g) => g.id !== selectedGalleryId);
        setGalleries(remaining);
        if (remaining.length > 0) {
          const nextGallery = remaining[0];
          setSelectedGalleryId(nextGallery.id);
          setSelectedSongUrl(nextGallery.backgroundMusicUrl || '');
          setSelectedSongTitle(nextGallery.backgroundMusicTitle || '');
          if (nextGallery.scenes && nextGallery.scenes.length > 0) {
            setSelectedSceneId(nextGallery.scenes[0].id);
          }
        } else {
          setSelectedGalleryId('');
          setMediaItems([]);
        }
        setShowDeleteGalleryModal(false);
        showToast(`Permanently deleted gallery "${targetName}"`);
      } else {
        alert('Failed to delete gallery. Please try again.');
      }
    } catch (err: any) {
      console.error('Failed to delete gallery:', err);
      alert(err?.message || 'Error deleting gallery');
    } finally {
      setIsDeletingGallery(false);
    }
  };

  // Rename Event / Scene Handlers
  const handleStartRenameScene = (s: { id: string; name: string }): void => {
    setEditingSceneId(s.id);
    setEditingSceneName(s.name);
  };

  const handleSaveSceneRename = async (sceneId: string): Promise<void> => {
    const trimmed = editingSceneName.trim();
    if (!trimmed || !selectedGalleryId) {
      setEditingSceneId(null);
      return;
    }

    setIsSavingSceneRename(true);
    try {
      const updated = await window.api.galleryUpdateScene(selectedGalleryId, sceneId, trimmed);
      if (updated && updated.scenes) {
        setGalleries((prev) =>
          prev.map((g) => (g.id === selectedGalleryId ? { ...g, scenes: updated.scenes } : g))
        );
        showToast(`Renamed event to "${trimmed}"`);
      } else {
        // Optimistically update locally
        setGalleries((prev) =>
          prev.map((g) => {
            if (g.id !== selectedGalleryId) return g;
            const updatedScenes = (g.scenes || []).map((s) =>
              s.id === sceneId ? { ...s, name: trimmed } : s
            );
            return { ...g, scenes: updatedScenes };
          })
        );
        showToast(`Renamed event to "${trimmed}"`);
      }
    } catch (err: any) {
      console.error('Failed to rename scene:', err);
      alert(err?.message || 'Error renaming scene');
    } finally {
      setIsSavingSceneRename(false);
      setEditingSceneId(null);
    }
  };

  // Delete Event / Scene Handlers
  const handlePromptDeleteScene = (s: { id: string; name: string }): void => {
    if (scenes.length <= 1) {
      alert('Galleries must keep at least one event. Cannot delete the only remaining event.');
      return;
    }
    setSceneToDelete(s);
  };

  const handleConfirmDeleteScene = async (): Promise<void> => {
    if (!sceneToDelete || !selectedGalleryId) return;
    setIsDeletingScene(true);
    const sceneId = sceneToDelete.id;
    const sceneName = sceneToDelete.name;
    const remainingScenes = scenes.filter((s) => s.id !== sceneId);
    const fallbackSceneId = remainingScenes[0]?.id || 'highlights';

    try {
      const updated = await window.api.galleryDeleteScene(selectedGalleryId, sceneId);
      const nextScenes = updated?.scenes && updated.scenes.length > 0 ? updated.scenes : remainingScenes;

      setGalleries((prev) =>
        prev.map((g) => (g.id === selectedGalleryId ? { ...g, scenes: nextScenes } : g))
      );

      // Reassign active selected scene if deleted
      if (selectedSceneId === sceneId) {
        setSelectedSceneId(fallbackSceneId);
      }
      if (curationSceneFilter === sceneId) {
        setCurationSceneFilter('all');
      }

      // Reassign local mediaItems that belonged to the deleted scene
      setMediaItems((prev) =>
        prev.map((m) =>
          (m.sceneId || scenes[0]?.id || 'highlights') === sceneId
            ? { ...m, sceneId: fallbackSceneId }
            : m
        )
      );

      showToast(`Deleted event "${sceneName}". Media moved to ${remainingScenes[0]?.name || 'Highlights'}.`);
      setSceneToDelete(null);
    } catch (err: any) {
      console.error('Failed to delete scene:', err);
      alert(err?.message || 'Error deleting scene');
    } finally {
      setIsDeletingScene(false);
    }
  };

  // Background Song Actions
  const handleAssignSong = async (url: string, title: string): Promise<void> => {
    if (!selectedGalleryId) return;
    setIsSavingSong(true);
    try {
      const updated = await window.api.gallerySetSong(selectedGalleryId, url, title);
      if (updated) {
        setGalleries((prev) =>
          prev.map((g) =>
            g.id === selectedGalleryId
              ? { ...g, backgroundMusicUrl: url, backgroundMusicTitle: title }
              : g
          )
        );
        showToast(url ? `Assigned soundtrack: "${title || 'Gallery Song'}"` : 'Removed gallery soundtrack');
      }
    } catch (err) {
      console.error('Failed to assign song:', err);
      setUploadError('Failed to update gallery background song');
    } finally {
      setIsSavingSong(false);
    }
  };

  const handleUploadNewSong = async (): Promise<void> => {
    if (!selectedGalleryId) return;
    setIsUploadingSong(true);
    setUploadError(null);
    try {
      const res = await window.api.galleryChooseAndUploadSong(selectedGalleryId);
      if (res && res.song) {
        setSongsLibrary((prev) => [res.song, ...prev.filter((s) => s.url !== res.song.url)]);
        setSelectedSongUrl(res.song.url);
        setSelectedSongTitle(res.song.title);
        setGalleries((prev) =>
          prev.map((g) =>
            g.id === selectedGalleryId
              ? {
                  ...g,
                  backgroundMusicUrl: res.song.url,
                  backgroundMusicTitle: res.song.title,
                }
              : g
          )
        );
        showToast(`Uploaded & set "${res.song.title}" for autoplay!`);
      }
    } catch (err: any) {
      console.error('Song upload failed:', err);
      setUploadError(err?.message || 'Failed to upload background song');
    } finally {
      setIsUploadingSong(false);
    }
  };

  const toggleAudioPreview = (): void => {
    const audio = audioPreviewRef.current;
    if (!audio || !selectedSongUrl) return;
    if (isPreviewingAudio) {
      audio.pause();
      setIsPreviewingAudio(false);
    } else {
      audio
        .play()
        .then(() => setIsPreviewingAudio(true))
        .catch((err) => console.warn('Audio preview failed:', err));
    }
  };

  // Media Curation & Rearranging Handlers
  const handleMoveMediaStep = async (indexInFull: number, direction: 'left' | 'right'): Promise<void> => {
    const targetIndex = direction === 'left' ? indexInFull - 1 : indexInFull + 1;
    if (targetIndex < 0 || targetIndex >= mediaItems.length || !selectedGalleryId) return;

    // Save previous state to undo stack
    setUndoStack((prev) => [...prev.slice(-30), mediaItems.map((m) => ({ ...m }))]);
    undoStackRef.current = [...undoStackRef.current.slice(-30), mediaItems.map((m) => ({ ...m }))];
    setRedoStack([]);
    redoStackRef.current = [];

    const reordered = [...mediaItems];
    const [moved] = reordered.splice(indexInFull, 1);
    reordered.splice(targetIndex, 0, moved);
    setMediaItems(reordered);
    mediaItemsRef.current = reordered;

    const ok = await window.api.galleryReorderMedia(
      selectedGalleryId,
      reordered.map((m) => m.id)
    );
    if (ok) {
      showToast('Gallery order saved (⌘Z to undo)');
    }
  };

  // Multi-Selection and Multi-Drag Handlers
  const handleThumbnailClick = (e: React.MouseEvent, item: GalleryMediaItem): void => {
    if (isDraggingCardRef.current) return;
    const itemId = item.id;
    const isMetaOrCtrl = e.metaKey || e.ctrlKey;
    const isShift = e.shiftKey;

    if (isShift && lastSelectedMediaId) {
      // Shift Click: select range between lastSelectedMediaId and current item
      const lastIdx = filteredMediaItems.findIndex((m) => m.id === lastSelectedMediaId);
      const currIdx = filteredMediaItems.findIndex((m) => m.id === itemId);
      if (lastIdx !== -1 && currIdx !== -1) {
        const start = Math.min(lastIdx, currIdx);
        const end = Math.max(lastIdx, currIdx);
        const rangeIds = filteredMediaItems.slice(start, end + 1).map((m) => m.id);
        setSelectedMediaIds((prev) => {
          const next = new Set(prev);
          rangeIds.forEach((id) => next.add(id));
          return next;
        });
        return;
      }
    }

    if (isMetaOrCtrl) {
      // Command / Ctrl Click: Select / deselect multiple items
      setSelectedMediaIds((prev) => {
        const next = new Set(prev);
        if (next.has(itemId)) {
          next.delete(itemId);
        } else {
          next.add(itemId);
        }
        return next;
      });
      setLastSelectedMediaId(itemId);
      return;
    }

    // Plain Click: Open Preview with Delete & Download Icons
    setPreviewMediaItem(item);
  };

  const handleDownloadMediaItem = (item: GalleryMediaItem): void => {
    const url =
      item.urls.full ||
      item.urls.video ||
      item.urls.grid ||
      item.urls.poster ||
      item.urls.thumbnail;
    if (!url) {
      showToast('No download link available for this item');
      return;
    }

    const a = document.createElement('a');
    a.href = url;
    a.download = item.originalFilename || 'gallery-item';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast(`Downloading "${item.originalFilename}"`);
  };

  const handleMediaDragStart = (e: React.DragEvent, itemId: string): void => {
    isDraggingCardRef.current = true;
    let toDrag: string[];
    if (selectedMediaIds.has(itemId)) {
      toDrag = mediaItems.filter((m) => selectedMediaIds.has(m.id)).map((m) => m.id);
    } else {
      toDrag = [itemId];
      setSelectedMediaIds(new Set([itemId]));
      setLastSelectedMediaId(itemId);
    }
    setDraggedMediaIds(toDrag);
    setDraggedMediaId(itemId);
    e.dataTransfer.setData('text/plain', JSON.stringify(toDrag));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleAutoScrollOnDrag = (e: React.DragEvent): void => {
    const container = isFullScreenRearrange
      ? fullScreenContainerRef.current
      : rearrangeContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseY = e.clientY;
    const topZone = rect.top + 110;
    const bottomZone = rect.bottom - 110;

    if (mouseY < topZone) {
      const distance = Math.max(0, topZone - mouseY);
      const speed = Math.round((distance / 110) * 32 + 6);
      container.scrollTop -= speed;
    } else if (mouseY > bottomZone) {
      const distance = Math.max(0, mouseY - bottomZone);
      const speed = Math.round((distance / 110) * 32 + 6);
      container.scrollTop += speed;
    }
  };

  const handleMediaDragOver = (e: React.DragEvent, targetItemId: string): void => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!draggedMediaIds.includes(targetItemId) && draggedMediaId !== targetItemId) {
      setDragOverMediaId(targetItemId);
    }
    handleAutoScrollOnDrag(e);
  };

  const handleMediaDragEnd = (): void => {
    setDraggedMediaId(null);
    setDraggedMediaIds([]);
    setDragOverMediaId(null);
    setDragOverSceneId(null);
    setTimeout(() => {
      isDraggingCardRef.current = false;
    }, 150);
  };

  const handleMediaDrop = async (e: React.DragEvent, targetItemId: string): Promise<void> => {
    e.preventDefault();
    e.stopPropagation();

    let sourceIds: string[] = [];
    const rawData = e.dataTransfer.getData('text/plain');
    try {
      const parsed = JSON.parse(rawData);
      if (Array.isArray(parsed)) sourceIds = parsed;
    } catch {
      if (rawData) sourceIds = [rawData];
    }
    if (sourceIds.length === 0 && draggedMediaIds.length > 0) {
      sourceIds = draggedMediaIds;
    } else if (sourceIds.length === 0 && draggedMediaId) {
      sourceIds = [draggedMediaId];
    }

    setDraggedMediaId(null);
    setDraggedMediaIds([]);
    setDragOverMediaId(null);
    setTimeout(() => {
      isDraggingCardRef.current = false;
    }, 150);

    if (!sourceIds.length || sourceIds.includes(targetItemId) || !selectedGalleryId) return;

    const movedItems = mediaItems.filter((m) => sourceIds.includes(m.id));
    const remainingItems = mediaItems.filter((m) => !sourceIds.includes(m.id));
    const targetIdx = remainingItems.findIndex((m) => m.id === targetItemId);
    if (targetIdx === -1) return;

    // Save snapshot to undo stack before reordering
    setUndoStack((prev) => [...prev.slice(-30), mediaItems.map((m) => ({ ...m }))]);
    undoStackRef.current = [...undoStackRef.current.slice(-30), mediaItems.map((m) => ({ ...m }))];
    setRedoStack([]);
    redoStackRef.current = [];

    remainingItems.splice(targetIdx, 0, ...movedItems);
    const reorderedItems = remainingItems.map((m, idx) => ({ ...m, order: idx }));
    setMediaItems(reorderedItems);
    mediaItemsRef.current = reorderedItems;
    showToast(`Rearranged ${movedItems.length} ${movedItems.length === 1 ? 'item' : 'items'} (⌘Z to undo)`);

    const ok = await window.api.galleryReorderMedia(
      selectedGalleryId,
      reorderedItems.map((m) => m.id)
    );
    if (ok) {
      showToast('Gallery order saved to cloud');
    }
  };

  const handleSceneTabDrop = async (e: React.DragEvent, targetSceneId: string): Promise<void> => {
    e.preventDefault();
    e.stopPropagation();

    let sourceIds: string[] = [];
    const rawData = e.dataTransfer.getData('text/plain');
    try {
      const parsed = JSON.parse(rawData);
      if (Array.isArray(parsed)) sourceIds = parsed;
    } catch {
      if (rawData) sourceIds = [rawData];
    }
    if (sourceIds.length === 0 && draggedMediaIds.length > 0) {
      sourceIds = draggedMediaIds;
    } else if (sourceIds.length === 0 && draggedMediaId) {
      sourceIds = [draggedMediaId];
    }

    setDraggedMediaId(null);
    setDraggedMediaIds([]);
    setDragOverSceneId(null);
    if (!sourceIds.length) return;

    // Save snapshot to undo stack before moving to scene
    setUndoStack((prev) => [...prev.slice(-30), mediaItems.map((m) => ({ ...m }))]);
    undoStackRef.current = [...undoStackRef.current.slice(-30), mediaItems.map((m) => ({ ...m }))];
    setRedoStack([]);
    redoStackRef.current = [];

    const updatedItems = mediaItems.map((m) => (sourceIds.includes(m.id) ? { ...m, sceneId: targetSceneId } : m));
    setMediaItems(updatedItems);
    mediaItemsRef.current = updatedItems;

    await Promise.all(
      sourceIds.map((id) => window.api.galleryUpdateMedia(id, { sceneId: targetSceneId }))
    );

    const sceneName = scenes.find((s) => s.id === targetSceneId)?.name || targetSceneId;
    showToast(`Moved ${sourceIds.length} ${sourceIds.length === 1 ? 'item' : 'items'} to "${sceneName}" (⌘Z to undo)`);
    setSelectedMediaIds(new Set());
  };

  const handleBulkMoveToScene = async (targetSceneId: string): Promise<void> => {
    if (selectedMediaIds.size === 0 || !selectedGalleryId) return;
    const idsToMove = Array.from(selectedMediaIds);

    // Save snapshot to undo stack before bulk moving to scene
    setUndoStack((prev) => [...prev.slice(-30), mediaItems.map((m) => ({ ...m }))]);
    undoStackRef.current = [...undoStackRef.current.slice(-30), mediaItems.map((m) => ({ ...m }))];
    setRedoStack([]);
    redoStackRef.current = [];

    const updatedItems = mediaItems.map((m) => (selectedMediaIds.has(m.id) ? { ...m, sceneId: targetSceneId } : m));
    setMediaItems(updatedItems);
    mediaItemsRef.current = updatedItems;

    await Promise.all(
      idsToMove.map((id) => window.api.galleryUpdateMedia(id, { sceneId: targetSceneId }))
    );
    const sceneName = scenes.find((s) => s.id === targetSceneId)?.name || targetSceneId;
    showToast(`Moved ${idsToMove.length} ${idsToMove.length === 1 ? 'item' : 'items'} to "${sceneName}" (⌘Z to undo)`);
    setSelectedMediaIds(new Set());
  };

  // Undo & Redo Handlers for Rearranging Photos & Scenes
  const handleUndoRearrange = async (): Promise<void> => {
    const currentUndoStack = undoStackRef.current;
    const currentMediaItems = mediaItemsRef.current;
    if (currentUndoStack.length === 0 || !selectedGalleryId || isUndoingRef.current) {
      if (currentUndoStack.length === 0) {
        showToast('Nothing to undo');
      }
      return;
    }

    setIsUndoing(true);
    isUndoingRef.current = true;

    const prevSnapshot = currentUndoStack[currentUndoStack.length - 1];
    const nextUndoStack = currentUndoStack.slice(0, -1);

    // Save current items to redo stack before applying undo
    setRedoStack((prev) => [...prev.slice(-30), currentMediaItems.map((m) => ({ ...m }))]);
    redoStackRef.current = [...redoStackRef.current.slice(-30), currentMediaItems.map((m) => ({ ...m }))];
    setUndoStack(nextUndoStack);
    undoStackRef.current = nextUndoStack;

    setMediaItems(prevSnapshot);
    mediaItemsRef.current = prevSnapshot;

    try {
      // 1. Re-sync order to server if order changed
      const orderChanged = prevSnapshot.some((item, idx) => item.id !== currentMediaItems[idx]?.id);
      if (orderChanged) {
        await window.api.galleryReorderMedia(
          selectedGalleryId,
          prevSnapshot.map((m) => m.id)
        );
      }

      // 2. Re-sync sceneId if any items changed scenes
      const sceneChangedItems = prevSnapshot.filter((prevItem) => {
        const currItem = currentMediaItems.find((m) => m.id === prevItem.id);
        return currItem && currItem.sceneId !== prevItem.sceneId;
      });
      if (sceneChangedItems.length > 0) {
        await Promise.all(
          sceneChangedItems.map((item) =>
            window.api.galleryUpdateMedia(item.id, { sceneId: item.sceneId })
          )
        );
      }

      showToast('Undid rearrangement (⌘Z)');
    } catch (err) {
      console.error('[GalleryUploader] Undo failed:', err);
      showToast('Failed to save undone order to cloud');
    } finally {
      setIsUndoing(false);
      isUndoingRef.current = false;
    }
  };

  const handleRedoRearrange = async (): Promise<void> => {
    const currentRedoStack = redoStackRef.current;
    const currentMediaItems = mediaItemsRef.current;
    if (currentRedoStack.length === 0 || !selectedGalleryId || isUndoingRef.current) return;

    setIsUndoing(true);
    isUndoingRef.current = true;

    const nextSnapshot = currentRedoStack[currentRedoStack.length - 1];
    const nextRedoStack = currentRedoStack.slice(0, -1);

    // Save current items to undo stack
    setUndoStack((prev) => [...prev.slice(-30), currentMediaItems.map((m) => ({ ...m }))]);
    undoStackRef.current = [...undoStackRef.current.slice(-30), currentMediaItems.map((m) => ({ ...m }))];
    setRedoStack(nextRedoStack);
    redoStackRef.current = nextRedoStack;

    setMediaItems(nextSnapshot);
    mediaItemsRef.current = nextSnapshot;

    try {
      const orderChanged = nextSnapshot.some((item, idx) => item.id !== currentMediaItems[idx]?.id);
      if (orderChanged) {
        await window.api.galleryReorderMedia(
          selectedGalleryId,
          nextSnapshot.map((m) => m.id)
        );
      }

      const sceneChangedItems = nextSnapshot.filter((nextItem) => {
        const currItem = currentMediaItems.find((m) => m.id === nextItem.id);
        return currItem && currItem.sceneId !== nextItem.sceneId;
      });
      if (sceneChangedItems.length > 0) {
        await Promise.all(
          sceneChangedItems.map((item) =>
            window.api.galleryUpdateMedia(item.id, { sceneId: item.sceneId })
          )
        );
      }

      showToast('Redid rearrangement (⌘⇧Z)');
    } catch (err) {
      console.error('[GalleryUploader] Redo failed:', err);
      showToast('Failed to save redone order to cloud');
    } finally {
      setIsUndoing(false);
      isUndoingRef.current = false;
    }
  };

  const handleBulkDelete = async (): Promise<void> => {
    if (selectedMediaIds.size === 0) return;
    const count = selectedMediaIds.size;
    if (!window.confirm(`Delete ${count} selected ${count === 1 ? 'item' : 'items'} from the gallery?`)) return;
    const idsToDelete = Array.from(selectedMediaIds);
    const deletedItems = mediaItems.filter((m) => selectedMediaIds.has(m.id));
    setMediaItems((prev) => prev.filter((m) => !selectedMediaIds.has(m.id)));
    setSelectedMediaIds(new Set());
    try {
      if (selectedGalleryId && window.api.galleryBatchDeleteMedia) {
        await window.api.galleryBatchDeleteMedia(selectedGalleryId, idsToDelete);
      } else {
        await Promise.all(idsToDelete.map((id) => window.api.galleryDeleteMedia(id)));
      }
      showToast(`Deleted ${count} ${count === 1 ? 'item' : 'items'}`);
      if (selectedGalleryId && deletedItems.length > 0) {
        const deletedPhotos = deletedItems.filter((m) => m.type === 'photo').length;
        const deletedVideos = deletedItems.filter((m) => m.type === 'video').length;
        const deletedLoops = deletedItems.filter((m) => m.type === 'video' && m.isAutoplayLoop).length;
        setGalleries((prev) =>
          prev.map((g) => {
            if (g.id !== selectedGalleryId) return g;
            return {
              ...g,
              mediaCount: {
                photos: Math.max(0, (g.mediaCount?.photos || 0) - deletedPhotos),
                videos: Math.max(0, (g.mediaCount?.videos || 0) - deletedVideos),
                loops: Math.max(0, (g.mediaCount?.loops || 0) - deletedLoops),
              },
            };
          })
        );
      }
    } catch (err) {
      console.error('[GalleryUploader] Bulk delete error:', err);
      showToast('Error deleting items from server');
      if (selectedGalleryId) {
        void loadGalleryMedia(selectedGalleryId);
      }
    }
  };

  const handleUpdateMediaItem = async (
    mediaId: string,
    updates: Partial<GalleryMediaItem>
  ): Promise<void> => {
    setMediaItems((prev) => prev.map((m) => (m.id === mediaId ? { ...m, ...updates } : m)));
    const updated = await window.api.galleryUpdateMedia(mediaId, updates);
    if (!updated && selectedGalleryId) {
      void loadGalleryMedia(selectedGalleryId);
    }
  };

  const handleDeleteMediaItem = async (mediaId: string): Promise<boolean> => {
    if (!window.confirm('Remove this photo/video from the client gallery?')) return false;
    const itemToDelete = mediaItems.find((m) => m.id === mediaId);
    setMediaItems((prev) => prev.filter((m) => m.id !== mediaId));
    setSelectedMediaIds((prev) => {
      if (!prev.has(mediaId)) return prev;
      const next = new Set(prev);
      next.delete(mediaId);
      return next;
    });
    try {
      let ok = false;
      if (window.api.galleryDeleteMedia) {
        ok = await window.api.galleryDeleteMedia(mediaId);
      }
      if (!ok && selectedGalleryId && window.api.galleryBatchDeleteMedia) {
        ok = await window.api.galleryBatchDeleteMedia(selectedGalleryId, [mediaId]);
      }
      if (ok) {
        showToast('Media item deleted');
        if (selectedGalleryId && itemToDelete) {
          const isPhoto = itemToDelete.type === 'photo';
          const isLoop = itemToDelete.type === 'video' && itemToDelete.isAutoplayLoop;
          setGalleries((prev) =>
            prev.map((g) => {
              if (g.id !== selectedGalleryId) return g;
              return {
                ...g,
                mediaCount: {
                  photos: Math.max(0, (g.mediaCount?.photos || 0) - (isPhoto ? 1 : 0)),
                  videos: Math.max(0, (g.mediaCount?.videos || 0) - (isPhoto ? 0 : 1)),
                  loops: Math.max(0, (g.mediaCount?.loops || 0) - (isLoop ? 1 : 0)),
                },
              };
            })
          );
        }
        return true;
      } else {
        showToast('Failed to delete media item from server');
        if (selectedGalleryId) {
          void loadGalleryMedia(selectedGalleryId);
        }
        return false;
      }
    } catch (err) {
      console.error('[GalleryUploader] Delete error:', err);
      showToast('Error deleting media item');
      if (selectedGalleryId) {
        void loadGalleryMedia(selectedGalleryId);
      }
      return false;
    }
  };

  const handleSetCover = async (item: GalleryMediaItem, asVideoCover: boolean): Promise<void> => {
    if (!selectedGalleryId) return;
    if (item.type === 'video') {
      const coverVideoUrl = item.urls.video;
      const coverUrl = item.urls.poster || item.urls.thumbnail || item.urls.grid;
      const updated = await window.api.gallerySetCover(selectedGalleryId, coverUrl, coverVideoUrl);
      if (updated) {
        setGalleries((prev) =>
          prev.map((g) =>
            g.id === selectedGalleryId
              ? { ...g, coverImage: coverUrl, coverVideo: coverVideoUrl }
              : g
          )
        );
        showToast('Assigned ambient cover video & poster');
      }
      return;
    }

    const coverUrl = item.urls.grid || item.urls.full || item.urls.poster || item.urls.thumbnail;
    if (!coverUrl) return;
    const updated = await window.api.gallerySetCover(selectedGalleryId, coverUrl, undefined);
    if (updated) {
      setGalleries((prev) =>
        prev.map((g) => (g.id === selectedGalleryId ? { ...g, coverImage: coverUrl } : g))
      );
      showToast('Assigned as gallery cover photo');
    }
  };

  const handleRemoveCover = async (asVideoCover: boolean): Promise<void> => {
    if (!selectedGalleryId) return;
    if (asVideoCover) {
      const updated = await window.api.gallerySetCover(selectedGalleryId, undefined, '');
      if (updated) {
        setGalleries((prev) =>
          prev.map((g) => (g.id === selectedGalleryId ? { ...g, coverVideo: undefined } : g))
        );
        showToast('Removed ambient cover video');
      }
    } else {
      const updated = await window.api.gallerySetCover(selectedGalleryId, '', undefined);
      if (updated) {
        setGalleries((prev) =>
          prev.map((g) => (g.id === selectedGalleryId ? { ...g, coverImage: undefined } : g))
        );
        showToast('Removed gallery cover photo');
      }
    }
  };

  // Handle adding a new scene or event
  const handleCreateScene = async (): Promise<void> => {
    if (!newSceneName.trim() || !selectedGalleryId) return;
    try {
      const res = await window.api.galleryCreateScene(selectedGalleryId, newSceneName.trim());
      const createdSceneId = res?.scene?.id || newSceneName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
      setNewSceneName('');
      setShowAddScene(false);
      await loadGalleries();
      if (createdSceneId) {
        setSelectedSceneId(createdSceneId);
      }
      showToast(`Created event/scene "${newSceneName.trim()}"`);
    } catch (err) {
      console.error('Failed to create scene:', err);
    }
  };

  // Choose file dialogs (photos, videos, folder, files)
  const handleChooseFiles = async (mode: 'files' | 'folder' | 'photos' | 'videos'): Promise<void> => {
    if (!selectedGalleryId) {
      alert('Please select a target gallery first.');
      return;
    }
    setUploadError(null);
    try {
      const paths = await window.api.galleryChooseFiles(mode);
      if (paths && paths.length > 0) {
        setIsPreparingUpload(true);
        await window.api.galleryStartUpload(
          selectedGalleryId,
          selectedSceneId,
          paths,
          autoTranscode,
          autoplayLoop
        );
      }
    } catch (err: any) {
      console.error('Failed to start upload:', err);
      setUploadError(err?.message || 'Failed to start upload session');
    } finally {
      setIsPreparingUpload(false);
    }
  };

  // Drag and drop handlers for file upload box
  const handleDragOver = (e: React.DragEvent): void => {
    if (draggedMediaId) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent): void => {
    if (draggedMediaId) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent): Promise<void> => {
    if (draggedMediaId) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (!selectedGalleryId) {
      alert('Please select a target gallery first.');
      return;
    }

    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;

    setUploadError(null);
    setIsPreparingUpload(true);

    try {
      const paths: string[] = [];
      for (const file of files) {
        let p = '';
        try {
          if (typeof window.api?.pathForFile === 'function') {
            p = window.api.pathForFile(file);
          }
        } catch {}
        if (!p && (file as any).path) {
          p = (file as any).path;
        }
        if (p) paths.push(p);
      }

      if (paths.length > 0) {
        await window.api.galleryStartUpload(
          selectedGalleryId,
          selectedSceneId,
          paths,
          autoTranscode,
          autoplayLoop
        );
      } else {
        setUploadError(
          'Could not read file paths from dragged items. Please click "Select Folders" or "Select Individual Files".'
        );
      }
    } catch (err: any) {
      console.error('Drop upload error:', err);
      setUploadError(err?.message || 'Could not start upload session');
    } finally {
      setIsPreparingUpload(false);
    }
  };

  const isUploading = session.status === 'running';
  const isPaused = session.status === 'paused';
  const hasItems = session.items.length > 0;

  const filteredMediaItems = mediaItems.filter((item) => {
    if (curationSceneFilter === 'all') return true;
    const itemScene = item.sceneId || scenes[0]?.id || 'highlights';
    return itemScene === curationSceneFilter;
  });

  // Active list of media items for lightbox preview navigation
  const previewMediaList =
    previewMediaItem && filteredMediaItems.some((m) => m.id === previewMediaItem.id)
      ? filteredMediaItems
      : mediaItems;

  const previewMediaIndex = previewMediaItem
    ? previewMediaList.findIndex((m) => m.id === previewMediaItem.id)
    : -1;

  const hasPrevPreviewMedia = previewMediaIndex > 0;
  const hasNextPreviewMedia =
    previewMediaIndex >= 0 && previewMediaIndex < previewMediaList.length - 1;

  const handlePrevPreviewMedia = (): void => {
    if (hasPrevPreviewMedia) {
      setPreviewMediaItem(previewMediaList[previewMediaIndex - 1]);
    }
  };

  const handleNextPreviewMedia = (): void => {
    if (hasNextPreviewMedia) {
      setPreviewMediaItem(previewMediaList[previewMediaIndex + 1]);
    }
  };

  // Keyboard Shortcuts for Rearrange Selection & Lightbox Navigation (Esc to close/deselect, ←/→ to navigate, ⌘A to select all, Space to preview)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Lightbox preview navigation has highest priority when open
      if (previewMediaItem) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setPreviewMediaItem(null);
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          if (hasPrevPreviewMedia) {
            setPreviewMediaItem(previewMediaList[previewMediaIndex - 1]);
          }
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          if (hasNextPreviewMedia) {
            setPreviewMediaItem(previewMediaList[previewMediaIndex + 1]);
          }
          return;
        }
        return;
      }

      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;

      // Undo Rearrangement Shortcut: Cmd + Z (macOS) or Ctrl + Z (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (activeTab === 'rearrange' || isFullScreenRearrange || undoStackRef.current.length > 0) {
          e.preventDefault();
          void handleUndoRearrange();
          return;
        }
      }

      // Redo Rearrangement Shortcut: Cmd + Shift + Z or Ctrl + Shift + Z or Cmd/Ctrl + Y
      if (
        (e.metaKey || e.ctrlKey) &&
        ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y')
      ) {
        if (activeTab === 'rearrange' || isFullScreenRearrange || redoStackRef.current.length > 0) {
          e.preventDefault();
          void handleRedoRearrange();
          return;
        }
      }

      if (activeTab !== 'rearrange' && !isFullScreenRearrange) return;

      if (e.key === 'Escape') {
        if (selectedMediaIds.size > 0) {
          setSelectedMediaIds(new Set());
        } else if (isFullScreenRearrange) {
          setIsFullScreenRearrange(false);
        }
      } else if (e.key.toLowerCase() === 'f' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setIsFullScreenRearrange((prev) => !prev);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelectedMediaIds(new Set(filteredMediaItems.map((m) => m.id)));
      } else if (e.key === ' ' && selectedMediaIds.size === 1) {
        e.preventDefault();
        const singleId = Array.from(selectedMediaIds)[0];
        const item = mediaItems.find((m) => m.id === singleId);
        if (item) setPreviewMediaItem(item);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeTab,
    filteredMediaItems,
    selectedMediaIds,
    mediaItems,
    previewMediaItem,
    previewMediaIndex,
    previewMediaList,
    hasPrevPreviewMedia,
    hasNextPreviewMedia,
    isFullScreenRearrange,
    undoStack,
    redoStack,
  ]);

  const renderRearrangeGrid = (): React.ReactNode => {
    if (loadingMedia) {
      return (
        <div className="py-20 flex items-center justify-center text-xs text-[#FBFAF7]/50 gap-2">
          <RefreshCw size={16} className="animate-spin text-[#E8A317]" />
          <span>Loading photos...</span>
        </div>
      );
    }

    if (filteredMediaItems.length === 0) {
      return (
        <div className="py-16 text-center border border-dashed border-[#D6D0C6]/15 rounded-xl space-y-3">
          <p className="text-xs text-[#FBFAF7]/50 uppercase tracking-wider">
            No photos in this scene yet.
          </p>
          <button
            type="button"
            onClick={() => handleTabChange('upload')}
            className="px-4 py-2 bg-[#E8A317] text-black font-semibold text-xs rounded-lg shadow"
          >
            Go to Upload & Media
          </button>
        </div>
      );
    }

    return (
      <div
        className="grid transition-all select-none"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setSelectedMediaIds(new Set());
          }
        }}
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(${thumbnailZoom}px, 1fr))`,
          gap: thumbnailZoom < 75 ? '4px' : thumbnailZoom < 130 ? '8px' : '12px',
        }}
      >
        {filteredMediaItems.map((item) => {
          const isSelected = selectedMediaIds.has(item.id);
          const isBeingDragged =
            draggedMediaIds.includes(item.id) || draggedMediaId === item.id;
          const isDragTarget =
            dragOverMediaId === item.id && !isBeingDragged;
          const thumbSrc =
            item.urls.thumbnail || item.urls.poster || item.urls.grid || item.urls.full;

          return (
            <div
              key={item.id}
              draggable
              onDragStart={(e) => handleMediaDragStart(e, item.id)}
              onDragOver={(e) => handleMediaDragOver(e, item.id)}
              onDrop={(e) => void handleMediaDrop(e, item.id)}
              onDragEnd={handleMediaDragEnd}
              onClick={(e) => handleThumbnailClick(e, item)}
              onDoubleClick={() => setPreviewMediaItem(item)}
              title={`${item.originalFilename}\n• Click to preview\n• ⌘-click to multi-select\n• Shift-click to select range\n• Drag to reorder or move to scene`}
              className={`group relative aspect-square bg-[#1A1814] rounded-lg overflow-hidden cursor-pointer transition-all select-none shadow-sm ${
                isBeingDragged
                  ? 'opacity-30 scale-95 ring-2 ring-[#9B2226]'
                  : isDragTarget
                  ? 'ring-4 ring-[#E8A317] border-[#E8A317] scale-110 shadow-2xl z-30'
                  : isSelected
                  ? 'ring-4 ring-[#E8A317] border-[#E8A317] shadow-xl z-20 scale-[1.02]'
                  : 'border border-[#D6D0C6]/15 hover:border-[#E8A317]/60 hover:scale-[1.02]'
              }`}
            >
              {/* Selection Checkmark Indicator in Top-Right */}
              {isSelected && (
                <div className="absolute top-1.5 right-1.5 z-20 w-5 h-5 rounded-full bg-[#E8A317] text-black flex items-center justify-center font-bold text-xs shadow-md pointer-events-none">
                  <Check size={12} strokeWidth={3} />
                </div>
              )}

              {/* Multi-drag count badge */}
              {isBeingDragged && draggedMediaIds.length > 1 && draggedMediaId === item.id && (
                <div className="absolute inset-0 z-30 bg-black/80 flex flex-col items-center justify-center text-center p-1 pointer-events-none">
                  <span className="text-xs font-bold text-[#E8A317]">Moving</span>
                  <span className="text-[11px] text-white font-mono">{draggedMediaIds.length} items</span>
                </div>
              )}

              {/* Thumbnail: photo or auto-playing video */}
              {item.type === 'video' && item.urls.video ? (
                <video
                  src={item.urls.video}
                  poster={thumbSrc}
                  muted
                  loop
                  autoPlay
                  playsInline
                  preload="auto"
                  onLoadedData={(e) => {
                    e.currentTarget.play().catch(() => {});
                  }}
                  className="w-full h-full object-cover pointer-events-none select-none"
                />
              ) : (
                <img
                  src={thumbSrc}
                  alt={item.originalFilename}
                  className="w-full h-full object-cover pointer-events-none select-none"
                  draggable={false}
                  loading="lazy"
                />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="gallery-uploader-screen w-full min-h-screen bg-[#0D0C0A] p-6 max-w-7xl mx-auto space-y-6 text-[#FBFAF7]">
      {/* Hidden Audio Element for In-App Song Preview */}
      {selectedSongUrl && (
        <audio
          ref={audioPreviewRef}
          src={selectedSongUrl}
          onEnded={() => setIsPreviewingAudio(false)}
          onPause={() => setIsPreviewingAudio(false)}
          onPlay={() => setIsPreviewingAudio(true)}
          className="hidden"
        />
      )}

      {/* Floating Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 bg-[#141310] border border-[#E8A317] text-[#FBFAF7] px-4 py-3 rounded-xl shadow-2xl">
          <CheckCircle2 size={16} className="text-[#E8A317] shrink-0" />
          <span className="text-xs font-medium">{toastMsg}</span>
        </div>
      )}

      {/* Error Banner */}
      {uploadError && (
        <div className="p-4 bg-[#9B2226]/20 border border-[#9B2226] rounded-xl flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-[#E8A317] shrink-0" />
            <p className="text-sm font-medium">{uploadError}</p>
          </div>
          <button
            onClick={() => setUploadError(null)}
            className="p-1 hover:bg-white/10 rounded-lg text-white/70 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Preparing Indicator */}
      {isPreparingUpload && (
        <div className="p-4 bg-[#E8A317]/10 border border-[#E8A317]/40 rounded-xl flex items-center gap-3 text-[#E8A317] animate-pulse">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <p className="text-sm font-medium">
            Scanning folders & preparing upload queue with Apple Silicon hardware acceleration...
          </p>
        </div>
      )}

      {/* Header Banner with Share Link & Preview Gallery Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#D6D0C6]/20">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-serif text-[#FBFAF7] tracking-tight">
              Client Gallery Uploader & Studio Curator
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#9B2226]/30 text-[#E8A317] border border-[#9B2226]/50">
              <Cpu size={13} className="text-[#E8A317]" />
              Apple Silicon M-Series Turbo
            </span>
          </div>
          <p className="text-sm text-[#FBFAF7]/60 mt-1">
            Hardware-accelerated 4K transcoding, background soundtrack autoplay, and live photo/loop curation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {currentGallery && (
            <>
              <button
                onClick={() => void handleCopyShareLink()}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-black bg-[#E8A317] hover:bg-[#F4BA38] rounded-lg shadow-lg shadow-[#E8A317]/20 transition-all"
                title={publicGalleryUrl}
              >
                {copiedShareLink ? <Check size={14} /> : <Share2 size={14} />}
                <span>{copiedShareLink ? 'Link Copied!' : 'Share Gallery Link'}</span>
              </button>

              <button
                onClick={() => setShowEmbeddedPreview(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#FBFAF7] bg-[#9B2226] hover:bg-[#B82B30] rounded-lg shadow-lg shadow-[#9B2226]/20 transition-all"
              >
                <Eye size={14} />
                <span>Preview in App</span>
              </button>

              <button
                onClick={() => void handlePreviewInBrowser()}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#FBFAF7]/90 hover:text-[#FBFAF7] bg-[#1A1814] hover:bg-[#2A2620] border border-[#D6D0C6]/30 rounded-lg transition-colors"
                title="Open public client gallery in browser"
              >
                <ExternalLink size={14} className="text-[#E8A317]" />
                <span>Open Website</span>
              </button>
            </>
          )}

          <button
            onClick={() => {
              void loadGalleries();
              if (selectedGalleryId) void loadGalleryMedia(selectedGalleryId);
            }}
            disabled={loadingGalleries}
            className="flex items-center gap-2 px-3 py-2 text-xs text-[#FBFAF7]/70 hover:text-[#FBFAF7] bg-[#1A1814] hover:bg-[#2A2620] border border-[#D6D0C6]/20 rounded-lg transition-colors"
          >
            <RefreshCw size={13} className={loadingGalleries ? 'animate-spin' : ''} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Target Gallery Selector Card */}
      <div className="bg-[#141310] border border-[#D6D0C6]/20 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex-1 max-w-xl space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-[#FBFAF7]/70">
            Select Client Gallery
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <select
                value={selectedGalleryId}
                onChange={(e) => {
                  if (e.target.value === '__NEW_GALLERY__') {
                    handleOpenAddGalleryModal();
                    return;
                  }
                  setSelectedGalleryId(e.target.value);
                  const selected = galleries.find((x) => x.id === e.target.value);
                  if (selected?.scenes && selected.scenes.length > 0) {
                    setSelectedSceneId(selected.scenes[0].id);
                  }
                }}
                disabled={isUploading}
                className="w-full bg-[#1A1814] border border-[#D6D0C6]/30 rounded-lg px-4 py-2.5 text-sm text-[#FBFAF7] focus:outline-none focus:border-[#E8A317] appearance-none cursor-pointer"
              >
                {galleries.length === 0 ? (
                  <option value="">No active galleries found</option>
                ) : (
                  galleries.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.clientName} — {g.title}
                    </option>
                  ))
                )}
                <option value="__NEW_GALLERY__">+ Add New Client Gallery...</option>
              </select>
              <ChevronDown
                size={16}
                className="absolute right-3.5 top-3.5 text-[#FBFAF7]/40 pointer-events-none"
              />
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleOpenAddGalleryModal}
                disabled={isUploading}
                className="flex items-center gap-1.5 px-3 py-2.5 bg-[#E8A317] hover:bg-[#F4BA38] text-black rounded-lg text-xs font-semibold shadow-md shadow-[#E8A317]/20 transition-all cursor-pointer"
                title="Create a new client gallery"
              >
                <Plus size={14} />
                <span>New Gallery</span>
              </button>

              {currentGallery && (
                <>
                  <button
                    type="button"
                    onClick={handleOpenEditGalleryModal}
                    disabled={isUploading}
                    className="flex items-center gap-1.5 px-3 py-2.5 bg-[#1A1814] hover:bg-[#25221B] text-[#E8A317] hover:text-[#F4BA38] border border-[#E8A317]/30 hover:border-[#E8A317]/60 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                    title="Edit Client Gallery Name, Details & Link"
                  >
                    <Edit3 size={14} />
                    <span className="hidden sm:inline">Edit Gallery</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowDeleteGalleryModal(true)}
                    disabled={isUploading}
                    className="flex items-center gap-1.5 px-3 py-2.5 bg-[#1A1814] hover:bg-rose-500/15 text-[#FBFAF7]/60 hover:text-rose-400 border border-[#D6D0C6]/20 hover:border-rose-500/40 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                    title="Delete Client Gallery"
                  >
                    <Trash2 size={14} />
                    <span className="hidden sm:inline">Delete</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {currentGallery && (
          <div className="flex flex-col md:items-end gap-1.5 text-xs text-[#FBFAF7]/60">
            <div className="flex items-center gap-2 font-mono text-[11px] bg-[#1A1814] px-3 py-1.5 rounded-lg border border-[#D6D0C6]/15">
              <span className="text-[#FBFAF7]/70 truncate max-w-xs">{publicGalleryUrl}</span>
              <button
                onClick={() => void handleCopyShareLink()}
                className="text-[#E8A317] hover:underline font-medium flex items-center gap-1 shrink-0"
              >
                {copiedShareLink ? <Check size={12} /> : <Share2 size={12} />}
                <span>{copiedShareLink ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-[#E8A317] font-semibold">{currentGallery.clientName}</span>
              <span>•</span>
              <span className="text-[#FBFAF7]/70 truncate max-w-xs">{currentGallery.title}</span>
              <span>•</span>
              <span className="text-emerald-400 font-mono font-medium">{mediaItems.length} photos</span>
            </div>
          </div>
        )}
      </div>

      {/* Main Mode Tabs Switcher */}
      <div className="flex items-center gap-3 border-b border-[#D6D0C6]/20 pb-3">
        <button
          type="button"
          onClick={() => handleTabChange('upload')}
          className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all ${
            activeTab === 'upload'
              ? 'bg-[#E8A317] text-black font-bold shadow-lg shadow-[#E8A317]/20 ring-1 ring-[#E8A317]'
              : 'bg-[#141310] text-[#FBFAF7]/70 hover:text-white border border-[#D6D0C6]/20 hover:border-[#D6D0C6]/40'
          }`}
        >
          <Upload size={15} />
          <span>Upload & Media</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('rearrange')}
          className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all ${
            activeTab === 'rearrange'
              ? 'bg-[#E8A317] text-black font-bold shadow-lg shadow-[#E8A317]/20 ring-1 ring-[#E8A317]'
              : 'bg-[#141310] text-[#FBFAF7]/70 hover:text-white border border-[#D6D0C6]/20 hover:border-[#D6D0C6]/40'
          }`}
        >
          <LayoutGrid size={15} />
          <span>Rearrange Photos</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-mono ${
              activeTab === 'rearrange'
                ? 'bg-black/25 text-black font-bold'
                : 'bg-[#E8A317]/15 text-[#E8A317]'
            }`}
          >
            {mediaItems.length}
          </span>
        </button>

        {/* Dedicated Full Screen Rearrangement Button */}
        <button
          type="button"
          onClick={() => {
            handleTabChange('rearrange');
            setIsFullScreenRearrange(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#E8A317] to-[#F4BA38] text-black font-bold text-xs uppercase tracking-wider shadow-lg shadow-[#E8A317]/25 hover:brightness-110 active:scale-95 ml-auto transition-all cursor-pointer"
          title="Open Rearrange in Full Screen Mode (F)"
        >
          <Maximize2 size={15} />
          <span>Rearrange Full Screen</span>
        </button>
      </div>

      {activeTab === 'upload' && (
        <>
          {/* Target Gallery, Scene & Background Music Configuration Card */}
          <div className="bg-[#141310] border border-[#D6D0C6]/20 rounded-xl p-5 space-y-5">
            {/* Upload Presets & Hardware Options */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#FBFAF7]/70 mb-2">
                1. Apple Silicon Acceleration
              </label>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-3 p-2 bg-[#1A1814] border border-[#D6D0C6]/20 rounded-lg cursor-pointer hover:border-[#E8A317]/50 transition-colors">
                <input
                  type="checkbox"
                  checked={autoTranscode}
                  onChange={(e) => setAutoTranscode(e.target.checked)}
                  disabled={isUploading}
                  className="w-4 h-4 accent-[#E8A317] rounded"
                />
                <div className="flex-1">
                  <span className="text-xs font-medium text-[#FBFAF7] flex items-center gap-1.5">
                    <Zap size={13} className="text-[#E8A317]" />
                    Apple Silicon VideoToolbox Turbo (50x Faster Upload)
                  </span>
                  <span className="text-[11px] text-[#FBFAF7]/50 block">
                    Converts 1–2 GB 4K video to ultra-crisp ~15 MB 1080p web loop in ~2 seconds.
                  </span>
                </div>
              </label>

              <label className="flex items-center gap-3 p-2 bg-[#1A1814] border border-[#D6D0C6]/20 rounded-lg cursor-pointer hover:border-[#E8A317]/50 transition-colors">
                <input
                  type="checkbox"
                  checked={autoplayLoop}
                  onChange={(e) => setAutoplayLoop(e.target.checked)}
                  disabled={isUploading}
                  className="w-4 h-4 accent-[#E8A317] rounded"
                />
                <div className="flex-1">
                  <span className="text-xs font-medium text-[#FBFAF7] flex items-center gap-1.5">
                    <Sparkles size={13} className="text-[#E8A317]" />
                    Autoplay Loop Mode
                  </span>
                  <span className="text-[11px] text-[#FBFAF7]/50 block">
                    Flag short clips (5s–10s) to loop seamlessly without audio on client devices.
                  </span>
                </div>
              </label>
            </div>
          </div>

        {/* Scene / Event Selection Pills */}
        <div className="pt-2 border-t border-[#D6D0C6]/10">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#FBFAF7]/70">
              3. Target Scene / Event (Select where photos & videos will upload)
            </label>
            <span className="text-[11px] text-[#FBFAF7]/50 hidden sm:inline">
              Hover over an event to rename or delete
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {scenes.map((s) => {
              const isSelected = selectedSceneId === s.id;
              const isEditingThis = editingSceneId === s.id;
              const isOnlyScene = scenes.length <= 1;

              if (isEditingThis) {
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-1.5 bg-[#1A1814] border border-[#E8A317] rounded-full px-3 py-1 shadow-md"
                  >
                    <input
                      type="text"
                      value={editingSceneName}
                      onChange={(e) => setEditingSceneName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleSaveSceneRename(s.id);
                        if (e.key === 'Escape') setEditingSceneId(null);
                      }}
                      className="bg-transparent text-xs text-white focus:outline-none w-28"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => void handleSaveSceneRename(s.id)}
                      disabled={isSavingSceneRename}
                      className="p-0.5 text-emerald-400 hover:text-emerald-300 cursor-pointer"
                      title="Save Event Name (Enter)"
                    >
                      <Check size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingSceneId(null)}
                      className="p-0.5 text-[#FBFAF7]/50 hover:text-white cursor-pointer"
                      title="Cancel (Esc)"
                    >
                      <X size={13} />
                    </button>
                  </div>
                );
              }

              return (
                <div
                  key={s.id}
                  className={`group relative flex items-center rounded-full transition-all ${
                    isSelected
                      ? 'bg-[#9B2226] text-[#FBFAF7] shadow-lg shadow-[#9B2226]/30 border border-[#9B2226]'
                      : 'bg-[#1A1814] text-[#FBFAF7]/70 hover:text-[#FBFAF7] hover:bg-[#25221B] border border-[#D6D0C6]/20'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedSceneId(s.id)}
                    disabled={isUploading}
                    className="px-3.5 py-1.5 text-xs font-medium cursor-pointer"
                  >
                    {s.name}
                  </button>

                  <div className="flex items-center pr-2 gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartRenameScene(s);
                      }}
                      disabled={isUploading}
                      className="p-1 hover:text-[#E8A317] transition-colors rounded cursor-pointer"
                      title={`Rename "${s.name}"`}
                    >
                      <Edit2 size={11} />
                    </button>

                    {!isOnlyScene && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePromptDeleteScene(s);
                        }}
                        disabled={isUploading}
                        className="p-1 hover:text-rose-400 transition-colors rounded cursor-pointer"
                        title={`Delete event "${s.name}"`}
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {showAddScene ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="Scene name..."
                  value={newSceneName}
                  onChange={(e) => setNewSceneName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleCreateScene();
                    if (e.key === 'Escape') setShowAddScene(false);
                  }}
                  className="bg-[#1A1814] border border-[#E8A317] px-3 py-1 text-xs text-[#FBFAF7] rounded-full focus:outline-none w-32"
                  autoFocus
                />
                <button
                  onClick={() => void handleCreateScene()}
                  className="px-2 py-1 bg-[#E8A317] text-black text-xs font-bold rounded-full"
                >
                  Add
                </button>
                <button
                  onClick={() => setShowAddScene(false)}
                  className="p-1 text-[#FBFAF7]/50 hover:text-[#FBFAF7]"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAddScene(true)}
                disabled={isUploading}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs text-[#E8A317] bg-[#E8A317]/10 hover:bg-[#E8A317]/20 border border-[#E8A317]/30 transition-colors"
              >
                <Plus size={13} />
                New Scene
              </button>
            )}
          </div>
        </div>

        {/* 4. Background Music / Soundtrack Selector & Uploader */}
        <div className="pt-4 border-t border-[#D6D0C6]/15 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#E8A317]">
              <Music size={14} className="text-[#E8A317]" />
              <span>4. Gallery Background Song (Autoplays on Website Opening)</span>
            </label>

            {selectedSongUrl && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleAudioPreview}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-[#E8A317]/15 text-[#E8A317] border border-[#E8A317]/30 hover:bg-[#E8A317]/25 transition-colors"
                >
                  {isPreviewingAudio ? <VolumeX size={13} /> : <Volume2 size={13} />}
                  <span>{isPreviewingAudio ? 'Stop Preview' : 'Test Play Song'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedSongUrl('');
                    setSelectedSongTitle('');
                    void handleAssignSong('', '');
                  }}
                  className="text-xs text-red-400 hover:text-red-300 px-2 py-1"
                >
                  Remove Song
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
            {/* Select Previously Uploaded Song */}
            <div className="md:col-span-5 relative">
              <select
                value={selectedSongUrl}
                onChange={(e) => {
                  const newUrl = e.target.value;
                  setSelectedSongUrl(newUrl);
                  const found = songsLibrary.find((s) => s.url === newUrl);
                  const newTitle = found ? found.title : newUrl ? selectedSongTitle : '';
                  setSelectedSongTitle(newTitle);
                  void handleAssignSong(newUrl, newTitle);
                }}
                disabled={!selectedGalleryId || isUploadingSong || isSavingSong}
                className="w-full bg-[#1A1814] border border-[#D6D0C6]/30 rounded-lg px-3.5 py-2 text-xs text-[#FBFAF7] focus:outline-none focus:border-[#E8A317] appearance-none cursor-pointer"
              >
                <option value="">— No Background Song (Select from Library) —</option>
                {songsLibrary.map((song) => (
                  <option key={song.id} value={song.url}>
                    🎵 {song.title} ({formatBytes(song.size)})
                  </option>
                ))}
                {selectedSongUrl && !songsLibrary.some((s) => s.url === selectedSongUrl) && (
                  <option value={selectedSongUrl}>
                    🎵 {selectedSongTitle || 'Assigned Gallery Song'}
                  </option>
                )}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-3 top-2.5 text-[#FBFAF7]/40 pointer-events-none"
              />
            </div>

            {/* Song Display Title Input */}
            <div className="md:col-span-4 flex items-center gap-2">
              <input
                type="text"
                value={selectedSongTitle}
                onChange={(e) => setSelectedSongTitle(e.target.value)}
                onBlur={() => {
                  if (selectedSongUrl && selectedSongTitle !== (currentGallery?.backgroundMusicTitle || '')) {
                    void handleAssignSong(selectedSongUrl, selectedSongTitle);
                  }
                }}
                placeholder="Song display title..."
                disabled={!selectedGalleryId}
                className="w-full bg-[#1A1814] border border-[#D6D0C6]/30 rounded-lg px-3 py-2 text-xs text-[#FBFAF7] focus:outline-none focus:border-[#E8A317]"
              />
            </div>

            {/* Upload New Song Button */}
            <div className="md:col-span-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleUploadNewSong()}
                disabled={!selectedGalleryId || isUploadingSong}
                className="w-full flex items-center justify-center gap-1.5 px-3.5 py-2 bg-[#E8A317]/15 hover:bg-[#E8A317]/25 border border-[#E8A317]/40 text-[#E8A317] rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
              >
                <Music size={14} />
                <span>{isUploadingSong ? 'Uploading Audio...' : '+ Upload New Song'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Drag & Drop Upload Zone */}
      <div
        ref={dropRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
          isDragging
            ? 'border-[#E8A317] bg-[#E8A317]/10 scale-[1.01]'
            : 'border-[#D6D0C6]/20 bg-[#141310]/60 hover:border-[#D6D0C6]/40 hover:bg-[#141310]'
        }`}
      >
        <div className="max-w-md mx-auto space-y-3">
          <div className="w-14 h-14 mx-auto rounded-full bg-[#1A1814] border border-[#D6D0C6]/20 flex items-center justify-center text-[#E8A317] shadow-xl">
            <Upload size={24} className={isDragging ? 'animate-bounce' : ''} />
          </div>

          <div>
            <h3 className="text-lg font-serif text-[#FBFAF7]">
              Drag & Drop Shoot Folders or Files Here
            </h3>
            <p className="text-xs text-[#FBFAF7]/60 mt-1">
              Supports 4K/UHD camera clips (MP4, MOV, MXF) and high-res master photos (RAW, JPG,
              PNG, TIFF).
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={() => void handleChooseFiles('photos')}
              disabled={isUploading}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#9B2226] hover:bg-[#B82B30] text-[#FBFAF7] text-xs font-semibold rounded-lg shadow-lg shadow-[#9B2226]/30 transition-all disabled:opacity-50 hover:scale-105 active:scale-95"
            >
              <ImageIcon size={15} />
              Select Photos
            </button>
            <button
              onClick={() => void handleChooseFiles('videos')}
              disabled={isUploading}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#1A1814] hover:bg-[#25221B] border border-[#E8A317]/50 text-[#E8A317] text-xs font-semibold rounded-lg transition-all disabled:opacity-50 hover:scale-105 active:scale-95"
            >
              <Film size={15} />
              Select Videos
            </button>
            <button
              onClick={() => void handleChooseFiles('folder')}
              disabled={isUploading}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#1A1814] hover:bg-[#25221B] border border-[#D6D0C6]/30 text-[#FBFAF7] text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              <FolderOpen size={15} />
              Select Shoot Folders
            </button>
            <button
              onClick={() => void handleChooseFiles('files')}
              disabled={isUploading}
              className="flex items-center gap-2 px-3.5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-[#FBFAF7]/80 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
              title="Select all media types"
            >
              <Upload size={14} />
              All Files
            </button>
          </div>
        </div>
      </div>

      {/* Active Session & Progress Dashboard */}
      {hasItems && (
        <div className="bg-[#141310] border border-[#D6D0C6]/20 rounded-xl p-5 space-y-4">
          {/* Top Session Stats Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    isUploading
                      ? 'bg-[#E8A317] animate-pulse'
                      : isPaused
                      ? 'bg-amber-500'
                      : session.status === 'completed'
                      ? 'bg-emerald-500'
                      : 'bg-zinc-500'
                  }`}
                />
                <h4 className="text-sm font-semibold text-[#FBFAF7]">
                  {session.galleryTitle} • {session.sceneName}
                </h4>
              </div>
              <p className="text-xs text-[#FBFAF7]/60 mt-0.5">
                {formatBytes(session.uploadedBytes)} of {formatBytes(session.totalBytes)} uploaded (
                {session.overallProgress}%) • {formatSpeed(session.speedBytesPerSec)} •{' '}
                {formatETA(session.etaSeconds)}
              </p>
            </div>

            {/* Session Action Controls */}
            <div className="flex items-center gap-2">
              {isUploading ? (
                <button
                  onClick={() => void window.api.galleryPauseUpload()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1A1814] hover:bg-[#25221B] border border-[#D6D0C6]/20 rounded-lg text-xs font-medium text-[#FBFAF7] transition-colors"
                >
                  <Pause size={13} />
                  Pause
                </button>
              ) : isPaused ? (
                <button
                  onClick={() => void window.api.galleryResumeUpload()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#E8A317] hover:bg-[#F4BA38] text-black font-semibold rounded-lg text-xs transition-colors"
                >
                  <Play size={13} />
                  Resume
                </button>
              ) : null}

              {session.items.some((x) => x.status === 'failed') && (
                <button
                  onClick={() => void window.api.galleryRetryFailed()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#9B2226] hover:bg-[#B82B30] text-[#FBFAF7] rounded-lg text-xs font-medium transition-colors"
                >
                  <RotateCcw size={13} />
                  Retry Failed
                </button>
              )}

              <button
                onClick={() => void window.api.galleryClearCompleted()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1A1814] hover:bg-[#25221B] border border-[#D6D0C6]/20 text-[#FBFAF7]/80 rounded-lg text-xs transition-colors"
              >
                Clear Completed
              </button>

              <button
                onClick={() => void window.api.galleryCancelUpload()}
                className="p-1.5 text-[#FBFAF7]/50 hover:text-red-400 transition-colors"
                title="Cancel Session"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Overall Progress Bar */}
          <div className="w-full bg-[#1A1814] h-2 rounded-full overflow-hidden border border-[#D6D0C6]/10">
            <div
              className="bg-gradient-to-r from-[#9B2226] via-[#E8A317] to-[#4A6741] h-full transition-all duration-300 rounded-full"
              style={{ width: `${session.overallProgress}%` }}
            />
          </div>

          {/* Queue Item Cards */}
          <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
            {session.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 bg-[#1A1814]/80 border border-[#D6D0C6]/10 rounded-lg gap-4"
              >
                {/* File Icon & Info */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded bg-[#25221B] flex items-center justify-center text-[#E8A317] flex-shrink-0">
                    {item.mediaType === 'video' ? <Film size={15} /> : <ImageIcon size={15} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-[#FBFAF7] truncate">{item.fileName}</p>
                    <div className="flex items-center gap-2 text-[11px] text-[#FBFAF7]/50 mt-0.5 flex-wrap">
                      <span>{formatBytes(item.fileSize)}</span>
                      {item.optimizedSize && item.optimizedSize !== item.fileSize && (
                        <>
                          <span>•</span>
                          <span className="text-[#4A6741] font-medium">
                            {formatBytes(item.optimizedSize)} (
                            {Math.round((1 - item.optimizedSize / item.fileSize) * 100)}% saved)
                          </span>
                        </>
                      )}
                      {item.isAutoplayLoop && (
                        <>
                          <span>•</span>
                          <span className="text-[#E8A317]">Autoplay Loop</span>
                        </>
                      )}
                      {item.status === 'failed' && item.error && (
                        <>
                          <span>•</span>
                          <span className="text-red-400 truncate max-w-md" title={item.error}>
                            {item.error}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status & Progress */}
                <div className="flex items-center gap-4 flex-shrink-0">
                  {item.status === 'transcoding' && (
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-black/40 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-[#E8A317] h-full transition-all duration-150"
                          style={{ width: `${item.transcodeProgress}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-[#E8A317] font-medium min-w-16">
                        Turbo {item.transcodeProgress}%
                      </span>
                    </div>
                  )}

                  {item.status === 'uploading' && (
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-black/40 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-[#9B2226] h-full transition-all duration-150"
                          style={{ width: `${item.uploadProgress}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-[#FBFAF7] font-medium min-w-16">
                        {item.uploadProgress}%
                      </span>
                    </div>
                  )}

                  {item.status === 'completed' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-[#4A6741]/20 text-[#4A6741] border border-[#4A6741]/40">
                      <CheckCircle2 size={12} />
                      Completed
                    </span>
                  )}

                  {item.status === 'failed' && (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-red-950/40 text-red-400 border border-red-800/40"
                      title={item.error}
                    >
                      <AlertCircle size={12} />
                      Failed
                    </span>
                  )}

                  {item.status === 'queued' && (
                    <span className="text-[11px] text-[#FBFAF7]/40">Queued</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* REARRANGE & CURATE GALLERY PHOTOS / VIDEO LOOPS IN APP            */}
      {/* ================================================================= */}
      <div className="bg-[#141310] border border-[#D6D0C6]/20 rounded-xl p-5 space-y-5">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-[#D6D0C6]/15 pb-4">
          <div>
            <h2 className="text-xl font-serif text-[#FBFAF7] flex items-center gap-2">
              <span>Uploaded Media & Curation</span>
              <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-[#1A1814] border border-[#D6D0C6]/20 text-[#E8A317]">
                {filteredMediaItems.length} of {mediaItems.length} items
              </span>
            </h2>
            <p className="text-xs text-[#FBFAF7]/60 mt-0.5">
              Inspect uploaded photos and video loops, change scenes, set covers, or jump to Rearrange Tab.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Quick Switch to Dedicated Rearrange Tab */}
            <button
              type="button"
              onClick={() => handleTabChange('rearrange')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#E8A317] hover:bg-[#F4BA38] text-black font-semibold text-xs transition-all shadow"
              title="Switch to dedicated photo rearrangement workspace"
            >
              <LayoutGrid size={13} />
              <span>Go to Rearrange Photos Tab →</span>
            </button>
            {/* View Mode Switcher: Clean Preview vs Detailed Controls */}
            <div className="flex items-center bg-[#1A1814] p-1 rounded-lg border border-[#D6D0C6]/20">
              <button
                type="button"
                onClick={() => {
                  setCleanRearrangeMode(true);
                  localStorage.setItem('baawaray_gallery_clean_mode', 'true');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  cleanRearrangeMode
                    ? 'bg-[#E8A317] text-black font-semibold shadow'
                    : 'text-[#FBFAF7]/70 hover:text-white'
                }`}
                title="Preview only: removes all buttons and labels so you can easily rearrange"
              >
                <LayoutGrid size={13} />
                <span>Preview Only (Clean)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCleanRearrangeMode(false);
                  localStorage.setItem('baawaray_gallery_clean_mode', 'false');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  !cleanRearrangeMode
                    ? 'bg-[#9B2226] text-white font-semibold shadow'
                    : 'text-[#FBFAF7]/70 hover:text-white'
                }`}
                title="Detailed curation mode: show scene dropdowns, buttons, and filenames"
              >
                <SlidersHorizontal size={13} />
                <span>Detailed Controls</span>
              </button>
            </div>

            {/* Thumbnail Zoom In / Zoom Out Slider */}
            <div className="flex items-center gap-2 bg-[#1A1814] border border-[#D6D0C6]/20 px-3 py-1.5 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  const val = Math.max(100, thumbnailZoom - 20);
                  setThumbnailZoom(val);
                  localStorage.setItem('baawaray_gallery_zoom', String(val));
                }}
                disabled={thumbnailZoom <= 100}
                className="text-[#FBFAF7]/60 hover:text-white disabled:opacity-30 transition-colors"
                title="Zoom Out Thumbnails"
              >
                <ZoomOut size={13} />
              </button>

              <input
                type="range"
                min={100}
                max={360}
                step={10}
                value={thumbnailZoom}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setThumbnailZoom(val);
                  localStorage.setItem('baawaray_gallery_zoom', String(val));
                }}
                className="w-20 sm:w-28 accent-[#E8A317] h-1.5 bg-black/60 rounded-lg cursor-pointer"
                title={`Thumbnail Size: ${thumbnailZoom}px`}
              />

              <button
                type="button"
                onClick={() => {
                  const val = Math.min(360, thumbnailZoom + 20);
                  setThumbnailZoom(val);
                  localStorage.setItem('baawaray_gallery_zoom', String(val));
                }}
                disabled={thumbnailZoom >= 360}
                className="text-[#FBFAF7]/60 hover:text-white disabled:opacity-30 transition-colors"
                title="Zoom In Thumbnails"
              >
                <ZoomIn size={13} />
              </button>

              <span className="text-[11px] font-mono text-[#E8A317] min-w-10 text-right">
                {thumbnailZoom}px
              </span>
            </div>

            {/* Autoplay Loop Toggle */}
            <button
              type="button"
              onClick={() => setAutoplayLoops((prev) => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                autoplayLoops
                  ? 'bg-[#E8A317]/15 border-[#E8A317]/40 text-[#E8A317]'
                  : 'bg-[#1A1814] border-[#D6D0C6]/20 text-[#FBFAF7]/50 hover:text-white'
              }`}
              title="Toggle automatic video loops playback"
            >
              <Sparkles size={13} />
              <span>{autoplayLoops ? 'Loops Playing' : 'Loops Paused'}</span>
            </button>

            {/* Refresh Grid */}
            <button
              onClick={() => selectedGalleryId && void loadGalleryMedia(selectedGalleryId)}
              disabled={loadingMedia}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#1A1814] hover:bg-[#25221B] border border-[#D6D0C6]/20 rounded-lg text-[#FBFAF7]/80 transition-colors"
              title="Refresh grid"
            >
              <RefreshCw size={12} className={loadingMedia ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Scene Filter & Drop Target Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setCurationSceneFilter('all')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
              curationSceneFilter === 'all'
                ? 'bg-[#E8A317] text-black font-semibold shadow'
                : 'bg-[#1A1814] text-[#FBFAF7]/70 hover:text-white border border-[#D6D0C6]/20'
            }`}
          >
            All Scenes ({mediaItems.length})
          </button>

          {scenes.map((scene) => {
            const count = mediaItems.filter(
              (m) => (m.sceneId || scenes[0]?.id || 'highlights') === scene.id
            ).length;
            const isSelected = curationSceneFilter === scene.id;
            const isDropTarget = dragOverSceneId === scene.id;
            const isEditingThis = editingSceneId === scene.id;
            const isOnlyScene = scenes.length <= 1;

            if (isEditingThis) {
              return (
                <div
                  key={scene.id}
                  className="flex items-center gap-1.5 bg-[#1A1814] border border-[#E8A317] rounded-full px-3 py-1 shadow-md"
                >
                  <input
                    type="text"
                    value={editingSceneName}
                    onChange={(e) => setEditingSceneName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleSaveSceneRename(scene.id);
                      if (e.key === 'Escape') setEditingSceneId(null);
                    }}
                    className="bg-transparent text-xs text-white focus:outline-none w-28"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => void handleSaveSceneRename(scene.id)}
                    disabled={isSavingSceneRename}
                    className="p-0.5 text-emerald-400 hover:text-emerald-300 cursor-pointer"
                    title="Save"
                  >
                    <Check size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingSceneId(null)}
                    className="p-0.5 text-[#FBFAF7]/50 hover:text-white cursor-pointer"
                    title="Cancel"
                  >
                    <X size={13} />
                  </button>
                </div>
              );
            }

            return (
              <div
                key={scene.id}
                onDragOver={(e) => {
                  if (!draggedMediaId) return;
                  e.preventDefault();
                  setDragOverSceneId(scene.id);
                }}
                onDragLeave={() => {
                  if (dragOverSceneId === scene.id) setDragOverSceneId(null);
                }}
                onDrop={(e) => void handleSceneTabDrop(e, scene.id)}
                className={`group flex items-center rounded-full text-xs font-medium transition-all ${
                  isDropTarget
                    ? 'bg-[#E8A317] text-black scale-105 ring-2 ring-[#E8A317]'
                    : isSelected
                    ? 'bg-[#9B2226] text-white border border-[#9B2226]'
                    : 'bg-[#1A1814] text-[#FBFAF7]/70 hover:text-white border border-[#D6D0C6]/20'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setCurationSceneFilter(scene.id)}
                  className="px-3 py-1.5 flex items-center gap-1.5 cursor-pointer"
                >
                  <span>{scene.name}</span>
                  <span className={`text-[10px] font-mono ${isSelected ? 'text-white/80' : 'text-[#FBFAF7]/40'}`}>
                    ({count})
                  </span>
                </button>

                <div className="flex items-center pr-2 gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartRenameScene(scene);
                    }}
                    className={`p-1 rounded transition-colors ${isSelected ? 'hover:text-amber-200 text-white/70' : 'hover:text-[#E8A317] text-[#FBFAF7]/40'}`}
                    title={`Rename "${scene.name}"`}
                  >
                    <Edit2 size={11} />
                  </button>

                  {!isOnlyScene && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePromptDeleteScene(scene);
                      }}
                      className={`p-1 rounded transition-colors ${isSelected ? 'hover:text-red-200 text-white/70' : 'hover:text-rose-400 text-[#FBFAF7]/40'}`}
                      title={`Delete event "${scene.name}"`}
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Media Curation Grid */}
        {loadingMedia ? (
          <div className="py-16 flex items-center justify-center text-xs text-[#FBFAF7]/50 gap-2">
            <RefreshCw size={16} className="animate-spin text-[#E8A317]" />
            <span>Loading gallery photos & video loops...</span>
          </div>
        ) : filteredMediaItems.length === 0 ? (
          <div className="py-14 text-center border border-dashed border-[#D6D0C6]/15 rounded-xl">
            <p className="text-xs text-[#FBFAF7]/50 uppercase tracking-wider">
              No uploaded photos or loops in this scene yet.
            </p>
          </div>
        ) : (
          <div
            className="grid gap-3 transition-all"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(${thumbnailZoom}px, 1fr))`,
            }}
          >
            {filteredMediaItems.map((item) => {
              const fullIndex = mediaItems.findIndex((m) => m.id === item.id);
              const isBeingDragged = draggedMediaId === item.id;
              const isDragTarget = dragOverMediaId === item.id;
              const isCoverImage =
                currentGallery?.coverImage &&
                (currentGallery.coverImage === item.urls.grid ||
                  currentGallery.coverImage === item.urls.full ||
                  currentGallery.coverImage === item.urls.poster ||
                  currentGallery.coverImage === item.urls.thumbnail);
              const isCoverVideo =
                currentGallery?.coverVideo &&
                item.urls.video &&
                currentGallery.coverVideo === item.urls.video;

              const thumbSrc =
                item.urls.thumbnail || item.urls.poster || item.urls.grid || item.urls.full;

              if (cleanRearrangeMode) {
                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => handleMediaDragStart(e, item.id)}
                    onDragOver={(e) => handleMediaDragOver(e, item.id)}
                    onDrop={(e) => void handleMediaDrop(e, item.id)}
                    onDragEnd={handleMediaDragEnd}
                    onClick={() => {
                      if (!isDraggingCardRef.current) {
                        setPreviewMediaItem(item);
                      }
                    }}
                    className={`group relative aspect-video bg-[#1A1814] border rounded-xl overflow-hidden cursor-grab active:cursor-grabbing transition-all select-none shadow-md ${
                      isBeingDragged
                        ? 'opacity-25 scale-95 ring-2 ring-[#9B2226]'
                        : isDragTarget
                        ? 'ring-2 ring-[#E8A317] border-[#E8A317] scale-105 shadow-2xl z-20'
                        : 'border-[#D6D0C6]/15 hover:border-[#E8A317] hover:shadow-lg'
                    }`}
                  >
                    {/* Media Preview: continuous live video loops & photos */}
                    {item.type === 'video' && item.urls.video ? (
                      <video
                        src={item.urls.video}
                        poster={thumbSrc}
                        muted
                        loop
                        autoPlay={autoplayLoops}
                        playsInline
                        preload="metadata"
                        onLoadedData={(e) => {
                          if (autoplayLoops) e.currentTarget.play().catch(() => {});
                        }}
                        onMouseEnter={(e) => {
                          if (!autoplayLoops) e.currentTarget.play().catch(() => {});
                        }}
                        onMouseLeave={(e) => {
                          if (!autoplayLoops) {
                            e.currentTarget.pause();
                            e.currentTarget.currentTime = 0;
                          }
                        }}
                        className="w-full h-full object-cover pointer-events-none select-none"
                      />
                    ) : (
                      <img
                        src={thumbSrc}
                        alt={item.originalFilename}
                        className="w-full h-full object-cover pointer-events-none select-none"
                        draggable={false}
                        loading="lazy"
                      />
                    )}

                    {/* Subtle Index Pill in Top-Left */}
                    <div className="absolute top-1.5 left-1.5 pointer-events-none px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-sm text-[10px] font-mono text-white/90 font-semibold border border-white/10 shadow">
                      #{fullIndex + 1}
                    </div>

                    {/* Subtle Media Type pill in Top-Right */}
                    <div className="absolute top-1.5 right-1.5 pointer-events-none px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-sm text-[10px] font-mono uppercase text-[#E8A317] border border-white/10 flex items-center gap-1 shadow">
                      {item.type === 'photo' ? (
                        <ImageIcon size={10} />
                      ) : (
                        <Sparkles size={10} />
                      )}
                    </div>

                    {/* Cover badge if designated */}
                    {(isCoverImage || isCoverVideo) && (
                      <div className="absolute bottom-1.5 left-1.5 pointer-events-none bg-[#9B2226] text-white px-1.5 py-0.5 rounded text-[9px] font-mono uppercase font-bold flex items-center gap-1 shadow">
                        <Star size={9} className="fill-current text-[#E8A317]" />
                        <span>{isCoverVideo ? 'Video Cover' : 'Cover'}</span>
                      </div>
                    )}

                    {/* Clean Hover Overlay with Quick Actions (takes 0 layout space) */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 pointer-events-none">
                      <div className="pointer-events-auto flex items-center gap-1 bg-black/85 backdrop-blur-md px-2 py-1 rounded-lg border border-white/20 shadow-xl">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewMediaItem(item);
                          }}
                          className="p-1 hover:text-[#E8A317] text-white/80 transition-colors"
                          title="Preview in full size"
                        >
                          <Eye size={13} />
                        </button>
                        {!isCoverImage ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleSetCover(item, false);
                            }}
                            className="p-1 hover:text-[#E8A317] text-white/80 transition-colors"
                            title="Set as Cover Photo"
                          >
                            <Star size={13} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleRemoveCover(false);
                            }}
                            className="p-1 text-[#E8A317] hover:text-red-400 transition-colors"
                            title="Remove as Cover Photo"
                          >
                            <Star size={13} className="fill-[#E8A317]" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDeleteMediaItem(item.id);
                          }}
                          className="p-1 hover:text-red-400 text-white/80 transition-colors"
                          title="Delete item"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => handleMediaDragStart(e, item.id)}
                  onDragOver={(e) => handleMediaDragOver(e, item.id)}
                  onDrop={(e) => void handleMediaDrop(e, item.id)}
                  onDragEnd={handleMediaDragEnd}
                  style={item.gridSpan === 'wide' ? { gridColumn: 'span 2' } : undefined}
                  className={`bg-[#1A1814] border rounded-xl overflow-hidden flex flex-col justify-between group transition-all ${
                    isBeingDragged
                      ? 'opacity-35 scale-95 ring-2 ring-[#9B2226]'
                      : isDragTarget
                      ? 'ring-2 ring-[#E8A317] border-[#E8A317] scale-[1.02]'
                      : item.gridSpan === 'wide'
                      ? 'border-[#E8A317]/60'
                      : 'border-[#D6D0C6]/15 hover:border-[#D6D0C6]/40'
                  }`}
                >
                  {/* Visual Preview */}
                  <div className="relative aspect-video bg-black overflow-hidden">
                    {item.type === 'video' && item.urls.video ? (
                      <video
                        src={item.urls.video}
                        poster={thumbSrc}
                        muted
                        loop
                        autoPlay={autoplayLoops}
                        playsInline
                        preload="metadata"
                        onLoadedData={(e) => {
                          if (autoplayLoops) e.currentTarget.play().catch(() => {});
                        }}
                        onMouseEnter={(e) => {
                          if (!autoplayLoops) e.currentTarget.play().catch(() => {});
                        }}
                        onMouseLeave={(e) => {
                          if (!autoplayLoops) {
                            e.currentTarget.pause();
                            e.currentTarget.currentTime = 0;
                          }
                        }}
                        onClick={() => setPreviewMediaItem(item)}
                        className="w-full h-full object-cover cursor-pointer"
                      />
                    ) : (
                      <img
                        src={thumbSrc}
                        alt={item.originalFilename}
                        onClick={() => setPreviewMediaItem(item)}
                        className="w-full h-full object-cover cursor-pointer"
                        draggable={false}
                      />
                    )}

                    {/* Drag Handle */}
                    <div
                      className="absolute top-2 right-2 bg-black/75 hover:bg-[#E8A317] hover:text-black text-white/80 p-1 rounded cursor-grab active:cursor-grabbing z-10"
                      title="Drag to rearrange"
                    >
                      <GripVertical size={14} />
                    </div>

                    {/* Type Badge */}
                    <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/80 px-2 py-0.5 rounded text-[10px] font-mono uppercase text-[#E8A317]">
                      {item.type === 'photo' ? (
                        <>
                          <ImageIcon size={11} /> Photo
                        </>
                      ) : item.isAutoplayLoop ? (
                        <>
                          <Sparkles size={11} /> Loop
                        </>
                      ) : (
                        <>
                          <Film size={11} /> Film
                        </>
                      )}
                    </div>

                    {/* Cover Badges */}
                    {(isCoverImage || isCoverVideo) && (
                      <div className="absolute bottom-2 left-2 bg-[#9B2226] text-white px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold flex items-center gap-1 shadow">
                        <Star size={10} className="fill-current text-[#E8A317]" />
                        <span>{isCoverVideo ? 'Cover Video' : 'Cover Photo'}</span>
                      </div>
                    )}

                    {item.gridSpan === 'wide' && (
                      <div className="absolute bottom-2 right-2 bg-[#E8A317] text-black px-1.5 py-0.5 rounded text-[9px] font-mono uppercase font-bold">
                        2x Wide
                      </div>
                    )}
                  </div>

                  {/* Card Controls */}
                  <div className="p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <p
                        className="font-mono text-[11px] text-[#FBFAF7]/90 truncate"
                        title={item.originalFilename}
                      >
                        {item.originalFilename}
                      </p>
                      <button
                        onClick={() => setPreviewMediaItem(item)}
                        className="text-[#FBFAF7]/50 hover:text-[#E8A317]"
                        title="Preview item"
                      >
                        <Eye size={13} />
                      </button>
                    </div>

                    {/* Scene & Span Row */}
                    <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-white/5">
                      <select
                        value={item.sceneId || scenes[0]?.id || 'highlights'}
                        onChange={(e) =>
                          void handleUpdateMediaItem(item.id, { sceneId: e.target.value })
                        }
                        className="bg-black/50 border border-white/15 rounded px-2 py-1 text-[11px] text-white/80 focus:outline-none max-w-[125px] truncate"
                      >
                        {scenes.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>

                      <div className="flex items-center gap-1">
                        {item.type === 'video' && (
                          <button
                            onClick={() =>
                              void handleUpdateMediaItem(item.id, {
                                isAutoplayLoop: !item.isAutoplayLoop,
                              })
                            }
                            className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                              item.isAutoplayLoop
                                ? 'bg-[#E8A317]/20 text-[#E8A317] border border-[#E8A317]/40'
                                : 'bg-white/5 text-white/50'
                            }`}
                            title="Toggle Autoplay Loop vs Film"
                          >
                            {item.isAutoplayLoop ? 'Loop' : 'Film'}
                          </button>
                        )}

                        <button
                          onClick={() =>
                            void handleUpdateMediaItem(item.id, {
                              gridSpan: item.gridSpan === 'wide' ? 'normal' : 'wide',
                            })
                          }
                          className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase flex items-center gap-1 ${
                            item.gridSpan === 'wide'
                              ? 'bg-[#E8A317] text-black font-semibold'
                              : 'bg-white/5 text-white/60 hover:text-white'
                          }`}
                          title="Toggle 2-column wide span"
                        >
                          <Grid size={10} />
                          <span>{item.gridSpan === 'wide' ? '2x' : '1x'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Reorder Arrows + Set Cover + Delete */}
                    <div className="flex items-center justify-between pt-1.5 border-t border-white/5">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => void handleMoveMediaStep(fullIndex, 'left')}
                          disabled={fullIndex <= 0}
                          className="p-1 rounded bg-white/5 text-white/60 hover:text-white disabled:opacity-25"
                          title="Move earlier"
                        >
                          <ArrowLeft size={12} />
                        </button>
                        <button
                          onClick={() => void handleMoveMediaStep(fullIndex, 'right')}
                          disabled={fullIndex === -1 || fullIndex >= mediaItems.length - 1}
                          className="p-1 rounded bg-white/5 text-white/60 hover:text-white disabled:opacity-25"
                          title="Move later"
                        >
                          <ArrowRight size={12} />
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        {!isCoverImage ? (
                          <button
                            onClick={() => void handleSetCover(item, false)}
                            className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-[#E8A317]/20 text-[10px] font-mono text-white/70 hover:text-[#E8A317] transition-colors"
                            title="Set as Cover Photo"
                          >
                            Cover Img
                          </button>
                        ) : (
                          <button
                            onClick={() => void handleRemoveCover(false)}
                            className="px-1.5 py-0.5 rounded bg-[#9B2226]/40 border border-[#9B2226] text-[10px] font-mono text-[#E8A317] hover:text-white transition-colors"
                            title="Remove as Cover Photo"
                          >
                            Unset Img
                          </button>
                        )}
                        {item.type === 'video' && (
                          !isCoverVideo ? (
                            <button
                              onClick={() => void handleSetCover(item, true)}
                              className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-[#E8A317]/20 text-[10px] font-mono text-white/70 hover:text-[#E8A317] transition-colors"
                              title="Set as Ambient Cover Video"
                            >
                              Cover Vid
                            </button>
                          ) : (
                            <button
                              onClick={() => void handleRemoveCover(true)}
                              className="px-1.5 py-0.5 rounded bg-[#9B2226]/40 border border-[#9B2226] text-[10px] font-mono text-[#E8A317] hover:text-white transition-colors"
                              title="Remove Ambient Cover Video"
                            >
                              Unset Vid
                            </button>
                          )
                        )}
                        <button
                          onClick={() => void handleDeleteMediaItem(item.id)}
                          className="p-1 text-white/40 hover:text-red-400"
                          title="Delete item"
                        >
                          <Trash2 size={13} />
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
    </>
  )}

  {/* ================================================================= */}
  {/* SEPARATE REARRANGE PHOTOS TAB (PURE THUMBNAILS + ZOOM SLIDER)     */}
  {/* ================================================================= */}
  {activeTab === 'rearrange' && (
    <div
      ref={rearrangeContainerRef}
      onDragOver={handleAutoScrollOnDrag}
      className="bg-[#141310] border border-[#D6D0C6]/20 rounded-xl p-5 space-y-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setSelectedMediaIds(new Set());
        }
      }}
    >
      {/* Sticky Header with Toolbar, Scene Tabs & Selection Actions */}
      <div className="sticky top-0 z-30 bg-[#141310]/95 backdrop-blur-md pb-4 pt-1 border-b border-[#D6D0C6]/15 space-y-3.5">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-serif text-[#FBFAF7] flex items-center gap-2.5">
              <span>Rearrange Gallery Photos</span>
              <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-[#1A1814] border border-[#D6D0C6]/20 text-[#E8A317] font-semibold">
                {filteredMediaItems.length} of {mediaItems.length} items
              </span>
            </h2>
            <p className="text-xs text-[#FBFAF7]/60 mt-0.5">
              Click to select • ⌘/Ctrl+Click for multi • Shift+Click for range • Drag to reorder • ⌘Z to undo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Smooth Zoom In / Zoom Out Slider */}
            <div className="flex items-center gap-2.5 bg-[#1A1814] border border-[#D6D0C6]/20 px-3.5 py-1.5 rounded-lg">
              <button
                type="button"
                onClick={() => updateThumbnailZoom(thumbnailZoom - 20)}
                disabled={thumbnailZoom <= 40}
                className="text-[#FBFAF7]/60 hover:text-white disabled:opacity-30 transition-colors"
                title="Zoom Out (fit more photos)"
              >
                <ZoomOut size={14} />
              </button>

              <input
                type="range"
                min={40}
                max={320}
                step={4}
                value={thumbnailZoom}
                onChange={(e) => updateThumbnailZoom(Number(e.target.value))}
                className="w-32 sm:w-48 accent-[#E8A317] h-1.5 bg-black/60 rounded-lg cursor-pointer"
                title={`Thumbnail Size: ${thumbnailZoom}px`}
              />

              <button
                type="button"
                onClick={() => updateThumbnailZoom(thumbnailZoom + 20)}
                disabled={thumbnailZoom >= 320}
                className="text-[#FBFAF7]/60 hover:text-white disabled:opacity-30 transition-colors"
                title="Zoom In (larger photos)"
              >
                <ZoomIn size={14} />
              </button>

              <span className="text-[11px] font-mono text-[#E8A317] min-w-10 text-right font-medium">
                {thumbnailZoom}px
              </span>
            </div>

            {/* Undo Rearrange Button */}
            <button
              type="button"
              onClick={() => void handleUndoRearrange()}
              disabled={undoStack.length === 0 || isUndoing}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all ${
                undoStack.length > 0
                  ? 'bg-[#1A1814] hover:bg-[#25221B] border-[#E8A317]/50 text-[#E8A317] hover:text-white cursor-pointer shadow-sm hover:scale-105 active:scale-95'
                  : 'bg-[#1A1814]/40 border-white/5 text-white/20 cursor-not-allowed opacity-40'
              }`}
              title={undoStack.length > 0 ? 'Undo last rearrangement (⌘Z)' : 'Undo (⌘Z) - No recent changes to undo'}
            >
              <RotateCcw size={13} className={isUndoing ? 'animate-spin' : ''} />
              <span>Undo (⌘Z)</span>
              {undoStack.length > 0 && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 bg-[#E8A317]/20 text-[#E8A317] rounded-full font-bold">
                  {undoStack.length}
                </span>
              )}
            </button>

            {/* Redo Rearrange Button */}
            {redoStack.length > 0 && (
              <button
                type="button"
                onClick={() => void handleRedoRearrange()}
                disabled={isUndoing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border bg-[#1A1814] hover:bg-[#25221B] border-[#D6D0C6]/20 text-[#FBFAF7]/80 hover:text-white cursor-pointer shadow-sm transition-all hover:scale-105 active:scale-95"
                title="Redo rearrangement (⌘⇧Z)"
              >
                <RotateCw size={13} />
                <span>Redo</span>
              </button>
            )}

            {/* Refresh Button */}
            <button
              onClick={() => selectedGalleryId && void loadGalleryMedia(selectedGalleryId)}
              disabled={loadingMedia}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#1A1814] hover:bg-[#25221B] border border-[#D6D0C6]/20 rounded-lg text-[#FBFAF7]/80 transition-colors"
              title="Refresh photos"
            >
              <RefreshCw size={12} className={loadingMedia ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>

            {/* Full Screen Mode Button */}
            <button
              type="button"
              onClick={() => setIsFullScreenRearrange(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs bg-[#E8A317] hover:bg-[#F4BA38] text-black font-semibold rounded-lg shadow-md transition-all hover:scale-105 active:scale-95 cursor-pointer"
              title="Open Rearrange in Full Screen Mode (F)"
            >
              <Maximize2 size={13} />
              <span>Full Screen</span>
            </button>
          </div>
        </div>

        {/* Scene Filter & Drop Target Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setCurationSceneFilter('all')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
              curationSceneFilter === 'all'
                ? 'bg-[#E8A317] text-black font-semibold shadow'
                : 'bg-[#1A1814] text-[#FBFAF7]/70 hover:text-white border border-[#D6D0C6]/20'
            }`}
          >
            All Scenes ({mediaItems.length})
          </button>

          {scenes.map((scene) => {
            const count = mediaItems.filter(
              (m) => (m.sceneId || scenes[0]?.id || 'highlights') === scene.id
            ).length;
            const isSelected = curationSceneFilter === scene.id;
            const isDropTarget = dragOverSceneId === scene.id;
            return (
              <button
                key={scene.id}
                onClick={() => setCurationSceneFilter(scene.id)}
                onDragOver={(e) => {
                  if (!draggedMediaId && draggedMediaIds.length === 0) return;
                  e.preventDefault();
                  setDragOverSceneId(scene.id);
                }}
                onDragLeave={() => {
                  if (dragOverSceneId === scene.id) setDragOverSceneId(null);
                }}
                onDrop={(e) => void handleSceneTabDrop(e, scene.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                  isDropTarget
                    ? 'bg-[#E8A317] text-black scale-105 ring-2 ring-[#E8A317] shadow-lg'
                    : isSelected
                    ? 'bg-[#9B2226] text-white border border-[#9B2226]'
                    : 'bg-[#1A1814] text-[#FBFAF7]/70 hover:text-white border border-[#D6D0C6]/20'
                }`}
                title={`Drop selected photos/videos here to move to ${scene.name}`}
              >
                {scene.name} ({count})
              </button>
            );
          })}
        </div>

        {/* Floating Multi-Selection Action Bar (appears whenever items are selected) */}
        {selectedMediaIds.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#E8A317]/10 border border-[#E8A317]/50 px-4 py-2.5 rounded-xl shadow-xl animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="flex items-center gap-2.5">
              <div className="w-5 h-5 rounded-full bg-[#E8A317] text-black flex items-center justify-center font-bold text-xs">
                ✓
              </div>
              <span className="text-xs font-bold text-[#E8A317]">
                {selectedMediaIds.size} {selectedMediaIds.size === 1 ? 'item' : 'items'} selected
              </span>
              <span className="text-[11px] text-[#FBFAF7]/60 hidden md:inline">
                • Drag to reorder, drag onto scene tab to move, or choose action below:
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Quick Move to Scene Dropdown */}
              <select
                onChange={(e) => {
                  if (!e.target.value) return;
                  void handleBulkMoveToScene(e.target.value);
                  e.target.value = '';
                }}
                defaultValue=""
                className="bg-[#141310] border border-[#E8A317]/50 text-xs text-[#FBFAF7] rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#E8A317]"
              >
                <option value="" disabled>
                  Move to Scene...
                </option>
                {scenes.map((s) => (
                  <option key={s.id} value={s.id} className="bg-[#141310]">
                    {s.name}
                  </option>
                ))}
              </select>

              {selectedMediaIds.size === 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const id = Array.from(selectedMediaIds)[0];
                    const item = mediaItems.find((m) => m.id === id);
                    if (item) setPreviewMediaItem(item);
                  }}
                  className="px-2.5 py-1.5 bg-[#1A1814] hover:bg-[#25221B] border border-[#D6D0C6]/20 rounded-lg text-xs text-[#FBFAF7]/80 hover:text-white transition-colors"
                  title="Preview in full size (or press Space)"
                >
                  Preview
                </button>
              )}

              <button
                type="button"
                onClick={() => setSelectedMediaIds(new Set(filteredMediaItems.map((m) => m.id)))}
                className="px-2.5 py-1.5 bg-[#1A1814] hover:bg-[#25221B] border border-[#D6D0C6]/20 rounded-lg text-xs text-[#FBFAF7]/80 hover:text-white transition-colors"
                title="Select all items in this scene (⌘A)"
              >
                Select All
              </button>

              <button
                type="button"
                onClick={() => setSelectedMediaIds(new Set())}
                className="px-2.5 py-1.5 bg-[#1A1814] hover:bg-[#25221B] border border-[#D6D0C6]/20 rounded-lg text-xs text-[#FBFAF7]/80 hover:text-white transition-colors"
                title="Deselect all (Esc)"
              >
                Deselect (Esc)
              </button>

              <button
                type="button"
                onClick={() => void handleBulkDelete()}
                className="px-2.5 py-1.5 bg-red-950/40 hover:bg-red-900/60 border border-red-500/30 rounded-lg text-xs text-red-300 hover:text-red-100 transition-colors"
                title="Delete selected items"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Pure Rearrangement Grid (thumbnails only, auto-scroll support) */}
      {renderRearrangeGrid()}
    </div>
  )}

  {/* ================================================================= */}
  {/* FULL SCREEN REARRANGEMENT WORKSPACE (EDGE-TO-EDGE VIEW)           */}
  {/* ================================================================= */}
  {isFullScreenRearrange && (
    <div
      className="fixed inset-0 z-50 bg-[#0D0C0A] flex flex-col w-screen h-screen overflow-hidden text-[#FBFAF7] select-none animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setSelectedMediaIds(new Set());
        }
      }}
    >
      {/* Full Screen Top Toolbar */}
      <div className="shrink-0 bg-[#141310] border-b border-[#D6D0C6]/20 px-6 py-3 flex flex-wrap items-center justify-between gap-4 shadow-2xl z-20">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold uppercase tracking-wider text-[#E8A317] font-mono">
              Rearrange Mode
            </span>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#1A1814] border border-[#E8A317]/30 text-[#E8A317]/90 font-medium">
              ⌘Z to Undo
            </span>
            <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-[#1A1814] border border-[#D6D0C6]/20 text-[#FBFAF7]/80 font-medium">
              {filteredMediaItems.length} of {mediaItems.length} items
            </span>
          </div>

          {/* Scene Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 ml-2">
            <button
              type="button"
              onClick={() => setCurationSceneFilter('all')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                curationSceneFilter === 'all'
                  ? 'bg-[#E8A317] text-black font-semibold shadow'
                  : 'bg-[#1A1814] text-[#FBFAF7]/70 hover:text-white border border-[#D6D0C6]/20'
              }`}
            >
              All ({mediaItems.length})
            </button>
            {scenes.map((scene) => {
              const count = mediaItems.filter(
                (m) => (m.sceneId || scenes[0]?.id || 'highlights') === scene.id
              ).length;
              const isSelected = curationSceneFilter === scene.id;
              const isDropTarget = dragOverSceneId === scene.id;
              return (
                <button
                  key={scene.id}
                  type="button"
                  onClick={() => setCurationSceneFilter(scene.id)}
                  onDragOver={(e) => {
                    if (!draggedMediaId && draggedMediaIds.length === 0) return;
                    e.preventDefault();
                    setDragOverSceneId(scene.id);
                  }}
                  onDragLeave={() => {
                    if (dragOverSceneId === scene.id) setDragOverSceneId(null);
                  }}
                  onDrop={(e) => void handleSceneTabDrop(e, scene.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                    isDropTarget
                      ? 'bg-[#E8A317] text-black scale-105 ring-2 ring-[#E8A317] shadow-lg'
                      : isSelected
                      ? 'bg-[#9B2226] text-white border border-[#9B2226]'
                      : 'bg-[#1A1814] text-[#FBFAF7]/70 hover:text-white border border-[#D6D0C6]/20'
                  }`}
                  title={`Drop selected photos/videos here to move to ${scene.name}`}
                >
                  {scene.name} ({count})
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Smooth Zoom Slider */}
          <div className="flex items-center gap-2 bg-[#1A1814] border border-[#D6D0C6]/20 px-3 py-1.5 rounded-lg">
            <button
              type="button"
              onClick={() => updateThumbnailZoom(thumbnailZoom - 20)}
              disabled={thumbnailZoom <= 40}
              className="text-[#FBFAF7]/60 hover:text-white disabled:opacity-30"
              title="Zoom Out"
            >
              <ZoomOut size={13} />
            </button>
            <input
              type="range"
              min={40}
              max={320}
              step={4}
              value={thumbnailZoom}
              onChange={(e) => updateThumbnailZoom(Number(e.target.value))}
              className="w-24 sm:w-36 accent-[#E8A317] h-1.5 bg-black/60 rounded-lg cursor-pointer"
              title={`Thumbnail Size: ${thumbnailZoom}px`}
            />
            <button
              type="button"
              onClick={() => updateThumbnailZoom(thumbnailZoom + 20)}
              disabled={thumbnailZoom >= 320}
              className="text-[#FBFAF7]/60 hover:text-white disabled:opacity-30"
              title="Zoom In"
            >
              <ZoomIn size={13} />
            </button>
            <span className="text-[11px] font-mono text-[#E8A317] min-w-9 text-right font-medium">
              {thumbnailZoom}px
            </span>
          </div>

          {/* Undo Button in Full Screen Mode */}
          <button
            type="button"
            onClick={() => void handleUndoRearrange()}
            disabled={undoStack.length === 0 || isUndoing}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all ${
              undoStack.length > 0
                ? 'bg-[#1A1814] hover:bg-[#25221B] border-[#E8A317]/50 text-[#E8A317] hover:text-white cursor-pointer shadow-sm hover:scale-105 active:scale-95'
                : 'bg-[#1A1814]/40 border-white/5 text-white/20 cursor-not-allowed opacity-40'
            }`}
            title={undoStack.length > 0 ? 'Undo last rearrangement (⌘Z)' : 'Undo (⌘Z) - No recent changes to undo'}
          >
            <RotateCcw size={13} className={isUndoing ? 'animate-spin' : ''} />
            <span>Undo (⌘Z)</span>
            {undoStack.length > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 bg-[#E8A317]/20 text-[#E8A317] rounded-full font-bold">
                {undoStack.length}
              </span>
            )}
          </button>

          {/* Redo Button in Full Screen Mode */}
          {redoStack.length > 0 && (
            <button
              type="button"
              onClick={() => void handleRedoRearrange()}
              disabled={isUndoing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border bg-[#1A1814] hover:bg-[#25221B] border-[#D6D0C6]/20 text-[#FBFAF7]/80 hover:text-white cursor-pointer shadow-sm transition-all hover:scale-105 active:scale-95"
              title="Redo rearrangement (⌘⇧Z)"
            >
              <RotateCw size={13} />
              <span>Redo</span>
            </button>
          )}

          {/* Multi-Selection Counter & Actions */}
          {selectedMediaIds.size > 0 && (
            <div className="flex items-center gap-2 bg-[#E8A317]/15 border border-[#E8A317]/40 px-3 py-1.5 rounded-lg">
              <span className="text-xs font-semibold text-[#E8A317]">
                {selectedMediaIds.size} selected
              </span>
              <select
                onChange={(e) => {
                  if (!e.target.value) return;
                  void handleBulkMoveToScene(e.target.value);
                  e.target.value = '';
                }}
                defaultValue=""
                className="bg-[#141310] border border-[#E8A317]/50 text-xs text-[#FBFAF7] rounded px-2 py-0.5"
              >
                <option value="" disabled>
                  Move to...
                </option>
                {scenes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setSelectedMediaIds(new Set())}
                className="text-xs text-[#FBFAF7]/70 hover:text-white underline ml-1 cursor-pointer"
              >
                Deselect
              </button>
              <button
                type="button"
                onClick={() => void handleBulkDelete()}
                className="text-xs px-2 py-0.5 bg-red-950/60 hover:bg-red-900 border border-red-500/30 text-red-200 rounded cursor-pointer"
              >
                Delete
              </button>
            </div>
          )}

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => selectedGalleryId && void loadGalleryMedia(selectedGalleryId)}
            disabled={loadingMedia}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#1A1814] hover:bg-[#25221B] border border-[#D6D0C6]/20 rounded-lg text-[#FBFAF7]/80 transition-colors"
            title="Refresh photos"
          >
            <RefreshCw size={12} className={loadingMedia ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>

          {/* Exit Full Screen Button */}
          <button
            type="button"
            onClick={() => setIsFullScreenRearrange(false)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs bg-white/10 hover:bg-white/20 text-white font-semibold rounded-lg border border-white/20 transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-md"
            title="Exit Full Screen (Esc)"
          >
            <Minimize2 size={14} />
            <span>Exit Full Screen</span>
          </button>
        </div>
      </div>

      {/* Full Screen Grid Body with Auto-Scroll on Drag */}
      <div
        ref={fullScreenContainerRef}
        onDragOver={handleAutoScrollOnDrag}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setSelectedMediaIds(new Set());
          }
        }}
        className="flex-1 w-full overflow-y-auto p-6 select-none bg-[#0D0C0A]"
      >
        {renderRearrangeGrid()}
      </div>
    </div>
  )}

      {/* Single Media Item Lightbox Modal with Delete, Download & Prev/Next Navigation */}
      {previewMediaItem && (
        <div
          className="fixed inset-0 z-50 bg-black/92 backdrop-blur-md flex items-center justify-center p-4 sm:p-6"
          onClick={() => setPreviewMediaItem(null)}
        >
          <div
            className="relative max-w-5xl w-full max-h-[92vh] flex flex-col items-center bg-[#141310] border border-[#D6D0C6]/20 rounded-2xl p-4 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Toolbar in Preview Modal: Filename & index counter on left, Prev/Next, Delete, Download & Close on right */}
            <div className="w-full flex items-center justify-between pb-3 mb-2 border-b border-white/10 gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-mono text-white/90 truncate max-w-md font-medium">
                  {previewMediaItem.originalFilename}
                </span>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-black/50 text-[#E8A317] border border-[#E8A317]/30">
                  {previewMediaItem.type}
                </span>
                {previewMediaIndex !== -1 && (
                  <span className="text-xs font-mono text-white/50 px-2 py-0.5 rounded bg-white/5 border border-white/10 shrink-0">
                    {previewMediaIndex + 1} / {previewMediaList.length}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Header Prev & Next Mini Chevrons */}
                <div className="flex items-center gap-1 mr-1 border-r border-white/10 pr-2">
                  <button
                    type="button"
                    onClick={handlePrevPreviewMedia}
                    disabled={!hasPrevPreviewMedia}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-white/5 disabled:cursor-not-allowed text-white/80 hover:text-white transition-colors"
                    title="Previous item (← Left Arrow)"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={handleNextPreviewMedia}
                    disabled={!hasNextPreviewMedia}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-white/5 disabled:cursor-not-allowed text-white/80 hover:text-white transition-colors"
                    title="Next item (→ Right Arrow)"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                {/* Download Icon Button */}
                <button
                  type="button"
                  onClick={() => handleDownloadMediaItem(previewMediaItem)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#E8A317] hover:bg-[#F4BA38] text-black text-xs font-semibold shadow transition-colors"
                  title="Download photo/video"
                >
                  <Download size={14} />
                  <span>Download</span>
                </button>

                {/* Delete Icon Button */}
                <button
                  type="button"
                  onClick={async () => {
                    const id = previewMediaItem.id;
                    const nextItem = hasNextPreviewMedia
                      ? previewMediaList[previewMediaIndex + 1]
                      : hasPrevPreviewMedia
                      ? previewMediaList[previewMediaIndex - 1]
                      : null;
                    const deleted = await handleDeleteMediaItem(id);
                    if (deleted) {
                      setPreviewMediaItem(nextItem);
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900 border border-red-500/40 text-red-200 hover:text-white text-xs font-medium transition-colors"
                  title="Delete from gallery"
                >
                  <Trash2 size={14} />
                  <span>Delete</span>
                </button>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => setPreviewMediaItem(null)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white text-xs transition-colors"
                  title="Close Preview (Esc)"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Media Content with Left and Right Floating Nav Arrows */}
            <div className="relative w-full flex items-center justify-center overflow-hidden flex-1 max-h-[78vh]">
              {/* Floating Left Arrow */}
              {hasPrevPreviewMedia && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePrevPreviewMedia();
                  }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-black/80 hover:bg-[#E8A317] text-white hover:text-black border border-white/20 hover:border-[#E8A317] flex items-center justify-center shadow-2xl transition-all hover:scale-110 active:scale-95 group cursor-pointer"
                  title="Previous item (← Left Arrow)"
                >
                  <ChevronLeft size={24} className="group-hover:-translate-x-0.5 transition-transform" />
                </button>
              )}

              {/* Floating Right Arrow */}
              {hasNextPreviewMedia && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNextPreviewMedia();
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-black/80 hover:bg-[#E8A317] text-white hover:text-black border border-white/20 hover:border-[#E8A317] flex items-center justify-center shadow-2xl transition-all hover:scale-110 active:scale-95 group cursor-pointer"
                  title="Next item (→ Right Arrow)"
                >
                  <ChevronRight size={24} className="group-hover:translate-x-0.5 transition-transform" />
                </button>
              )}

              {previewMediaItem.type === 'video' ? (
                <video
                  key={previewMediaItem.id}
                  src={previewMediaItem.urls.video}
                  poster={previewMediaItem.urls.poster}
                  controls
                  autoPlay
                  loop
                  className="max-h-[76vh] w-auto max-w-full rounded-xl border border-white/15 shadow-2xl"
                />
              ) : (
                <img
                  key={previewMediaItem.id}
                  src={
                    previewMediaItem.urls.full ||
                    previewMediaItem.urls.grid ||
                    previewMediaItem.urls.thumbnail
                  }
                  alt={previewMediaItem.originalFilename}
                  className="max-h-[76vh] w-auto max-w-full rounded-xl border border-white/15 shadow-2xl object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Embedded Live Client Gallery Preview Modal */}
      {showEmbeddedPreview && currentGallery && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col p-4 sm:p-6">
          <div className="flex items-center justify-between bg-[#141310] border border-[#D6D0C6]/20 px-4 py-3 rounded-t-xl">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#E8A317]">
                Live Client Gallery Preview
              </span>
              <span className="text-xs font-mono text-white/50 truncate max-w-md">
                {publicGalleryUrl}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void handleCopyShareLink()}
                className="flex items-center gap-1 px-3 py-1 rounded bg-[#E8A317] text-black text-xs font-semibold"
              >
                <Share2 size={12} />
                <span>{copiedShareLink ? 'Copied!' : 'Copy Share Link'}</span>
              </button>
              <button
                onClick={() => void handlePreviewInBrowser()}
                className="flex items-center gap-1 px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-xs"
              >
                <ExternalLink size={12} />
                <span>Open in Browser</span>
              </button>
              <button
                onClick={() => setShowEmbeddedPreview(false)}
                className="p-1.5 text-white/60 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <iframe
            src={publicGalleryUrl}
            title="Client Gallery Preview"
            allow="autoplay; fullscreen"
            className="flex-1 w-full bg-[#0D0C0A] border-x border-b border-[#D6D0C6]/20 rounded-b-xl"
          />
        </div>
      )}

      {/* Edit Client Gallery Modal */}
      {showEditGalleryModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141310] border border-[#D6D0C6]/20 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-[#D6D0C6]/15 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#E8A317]/15 flex items-center justify-center text-[#E8A317]">
                  <Edit3 size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                    Edit Client Gallery
                  </h3>
                  <p className="text-[11px] text-[#FBFAF7]/60">
                    Update client name, title, share link, event date, and category
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEditGalleryModal(false)}
                className="p-1 text-[#FBFAF7]/50 hover:text-white rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveGalleryDetails} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#FBFAF7]/70 mb-1.5">
                  Client Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={editClientName}
                  onChange={(e) => handleEditClientNameChange(e.target.value)}
                  placeholder="e.g. Vikram & Simran"
                  required
                  className="w-full bg-[#1A1814] border border-[#D6D0C6]/30 focus:border-[#E8A317] rounded-lg px-4 py-2.5 text-sm text-[#FBFAF7] focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#FBFAF7]/70 mb-1.5">
                  Gallery / Event Title <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={editGalleryTitle}
                  onChange={(e) => handleEditGalleryTitleChange(e.target.value)}
                  placeholder="e.g. Echoes of the Valley — Ladakh Pre-Wedding"
                  required
                  className="w-full bg-[#1A1814] border border-[#D6D0C6]/30 focus:border-[#E8A317] rounded-lg px-4 py-2.5 text-sm text-[#FBFAF7] focus:outline-none transition-colors"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#FBFAF7]/70">
                    Gallery Share Link (Slug) <span className="text-[#E8A317]">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const generated = generateSlug(editClientName, editGalleryTitle);
                      setEditSlug(generated);
                      setIsEditSlugCustomized(false);
                    }}
                    className="text-[11px] text-[#E8A317] hover:underline flex items-center gap-1 cursor-pointer transition-colors"
                    title="Auto-generate link from client name and title"
                  >
                    <RefreshCw size={11} />
                    <span>Auto-generate from name</span>
                  </button>
                </div>
                <div className="flex items-center bg-[#1A1814] border border-[#D6D0C6]/30 focus-within:border-[#E8A317] rounded-lg overflow-hidden transition-colors">
                  <span className="px-3 py-2 text-xs text-[#FBFAF7]/50 select-none bg-black/40 border-r border-[#D6D0C6]/20 font-mono">
                    galleries.baawaray.com/gallery/
                  </span>
                  <input
                    type="text"
                    value={editSlug}
                    onChange={(e) => {
                      setEditSlug(e.target.value);
                      setIsEditSlugCustomized(true);
                    }}
                    placeholder="e.g. nandini-anubhav-naldhera"
                    required
                    className="flex-1 bg-transparent px-3 py-2.5 text-xs text-[#FBFAF7] font-mono focus:outline-none"
                  />
                </div>
                <p className="text-[11px] text-[#FBFAF7]/50 mt-1">
                  Public URL for clients and portfolio. Updates automatically as you edit names unless manually customized.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#FBFAF7]/70 mb-1.5">
                    Event Date
                  </label>
                  <input
                    type="date"
                    value={editEventDate}
                    onChange={(e) => setEditEventDate(e.target.value)}
                    className="w-full bg-[#1A1814] border border-[#D6D0C6]/30 focus:border-[#E8A317] rounded-lg px-4 py-2.5 text-sm text-[#FBFAF7] focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#FBFAF7]/70 mb-1.5">
                    Category
                  </label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full bg-[#1A1814] border border-[#D6D0C6]/30 focus:border-[#E8A317] rounded-lg px-4 py-2.5 text-sm text-[#FBFAF7] focus:outline-none transition-colors cursor-pointer"
                  >
                    <option value="Weddings">Weddings</option>
                    <option value="Pre-Wedding">Pre-Wedding</option>
                    <option value="Editorial">Editorial</option>
                    <option value="Commercial">Commercial</option>
                    <option value="Events">Events</option>
                    <option value="Portraits">Portraits</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#FBFAF7]/70 mb-1.5">
                  Description / Story Note
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Optional brief notes or story description..."
                  rows={2}
                  className="w-full bg-[#1A1814] border border-[#D6D0C6]/30 focus:border-[#E8A317] rounded-lg px-4 py-2 text-xs text-[#FBFAF7] focus:outline-none resize-none transition-colors"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#D6D0C6]/15">
                <button
                  type="button"
                  onClick={() => setShowEditGalleryModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider text-[#FBFAF7]/70 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingGallery || !editClientName.trim() || !editGalleryTitle.trim()}
                  className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-[#E8A317] to-[#F4BA38] text-black text-xs font-bold uppercase tracking-wider shadow-lg shadow-[#E8A317]/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSavingGallery ? 'Saving...' : 'Save Gallery Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create New Client Gallery Modal */}
      {showAddGalleryModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141310] border border-[#D6D0C6]/20 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-[#D6D0C6]/15 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#E8A317]/15 flex items-center justify-center text-[#E8A317]">
                  <Plus size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                    Create New Client Gallery
                  </h3>
                  <p className="text-[11px] text-[#FBFAF7]/60">
                    Set up client name, title, event date, category and share link
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddGalleryModal(false)}
                className="p-1 text-[#FBFAF7]/50 hover:text-white rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateGallerySubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#FBFAF7]/70 mb-1.5">
                  Client Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={addClientName}
                  onChange={(e) => handleAddClientNameChange(e.target.value)}
                  placeholder="e.g. Nandini & Anubhav"
                  required
                  autoFocus
                  className="w-full bg-[#1A1814] border border-[#D6D0C6]/30 focus:border-[#E8A317] rounded-lg px-4 py-2.5 text-sm text-[#FBFAF7] focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#FBFAF7]/70 mb-1.5">
                  Gallery / Event Title <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={addGalleryTitle}
                  onChange={(e) => handleAddGalleryTitleChange(e.target.value)}
                  placeholder="e.g. Naldhera"
                  required
                  className="w-full bg-[#1A1814] border border-[#D6D0C6]/30 focus:border-[#E8A317] rounded-lg px-4 py-2.5 text-sm text-[#FBFAF7] focus:outline-none transition-colors"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#FBFAF7]/70">
                    Gallery Share Link (Slug) <span className="text-[#E8A317]">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const generated = generateSlug(addClientName, addGalleryTitle);
                      setAddSlug(generated);
                      setIsAddSlugCustomized(false);
                    }}
                    className="text-[11px] text-[#E8A317] hover:underline flex items-center gap-1 cursor-pointer transition-colors"
                    title="Re-generate link based on client name and title"
                  >
                    <RefreshCw size={11} />
                    <span>Auto-generate from name</span>
                  </button>
                </div>
                <div className="flex items-center bg-[#1A1814] border border-[#D6D0C6]/30 focus-within:border-[#E8A317] rounded-lg overflow-hidden transition-colors">
                  <span className="px-3 py-2 text-xs text-[#FBFAF7]/50 select-none bg-black/40 border-r border-[#D6D0C6]/20 font-mono">
                    galleries.baawaray.com/gallery/
                  </span>
                  <input
                    type="text"
                    value={addSlug}
                    onChange={(e) => {
                      setAddSlug(e.target.value);
                      setIsAddSlugCustomized(true);
                    }}
                    placeholder="e.g. nandini-anubhav-naldhera"
                    required
                    className="flex-1 bg-transparent px-3 py-2.5 text-xs text-[#FBFAF7] font-mono focus:outline-none"
                  />
                </div>
                <p className="text-[11px] text-[#FBFAF7]/50 mt-1">
                  Public URL for clients and portfolio. Auto-fills as you type the client name and title.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#FBFAF7]/70 mb-1.5">
                    Event Date
                  </label>
                  <input
                    type="date"
                    value={addEventDate}
                    onChange={(e) => setAddEventDate(e.target.value)}
                    className="w-full bg-[#1A1814] border border-[#D6D0C6]/30 focus:border-[#E8A317] rounded-lg px-4 py-2.5 text-sm text-[#FBFAF7] focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#FBFAF7]/70 mb-1.5">
                    Category
                  </label>
                  <select
                    value={addCategory}
                    onChange={(e) => setAddCategory(e.target.value)}
                    className="w-full bg-[#1A1814] border border-[#D6D0C6]/30 focus:border-[#E8A317] rounded-lg px-4 py-2.5 text-sm text-[#FBFAF7] focus:outline-none transition-colors cursor-pointer"
                  >
                    <option value="Weddings">Weddings</option>
                    <option value="Pre-Wedding">Pre-Wedding</option>
                    <option value="Editorial">Editorial</option>
                    <option value="Commercial">Commercial</option>
                    <option value="Events">Events</option>
                    <option value="Portraits">Portraits</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#FBFAF7]/70 mb-1.5">
                  Description / Story Note
                </label>
                <textarea
                  value={addDescription}
                  onChange={(e) => setAddDescription(e.target.value)}
                  placeholder="Optional brief notes or story description..."
                  rows={2}
                  className="w-full bg-[#1A1814] border border-[#D6D0C6]/30 focus:border-[#E8A317] rounded-lg px-4 py-2 text-xs text-[#FBFAF7] focus:outline-none resize-none transition-colors"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#D6D0C6]/15">
                <button
                  type="button"
                  onClick={() => setShowAddGalleryModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider text-[#FBFAF7]/70 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingGallery || !addClientName.trim() || !addGalleryTitle.trim()}
                  className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-[#E8A317] to-[#F4BA38] text-black text-xs font-bold uppercase tracking-wider shadow-lg shadow-[#E8A317]/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  <Plus size={14} />
                  <span>{isCreatingGallery ? 'Creating...' : 'Create Client Gallery'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Client Gallery Modal */}
      {showDeleteGalleryModal && currentGallery && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141310] border border-rose-500/30 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 bg-rose-500/10 border-b border-rose-500/20 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
                <Trash2 size={18} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                  Delete Client Gallery
                </h3>
                <p className="text-[11px] text-rose-300/80">
                  Permanent action — cannot be undone
                </p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-[#FBFAF7]/80 leading-relaxed">
                Are you sure you want to delete{' '}
                <strong className="text-white font-semibold">
                  {currentGallery.clientName} — {currentGallery.title}
                </strong>
                ?
              </p>

              <div className="bg-[#1A1814] border border-[#D6D0C6]/15 rounded-xl p-3.5 space-y-1.5 text-xs text-[#FBFAF7]/70">
                <div className="flex justify-between">
                  <span>Client Name:</span>
                  <span className="font-semibold text-white">{currentGallery.clientName}</span>
                </div>
                <div className="flex justify-between">
                  <span>Gallery Title:</span>
                  <span className="font-semibold text-white">{currentGallery.title}</span>
                </div>
                <div className="flex justify-between">
                  <span>Uploaded Media:</span>
                  <span className="font-mono text-emerald-400 font-semibold">{mediaItems.length} items</span>
                </div>
                <div className="flex justify-between">
                  <span>Events / Scenes:</span>
                  <span className="font-mono text-[#E8A317] font-semibold">{scenes.length}</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-300 flex items-start gap-2">
                <AlertCircle size={15} className="shrink-0 mt-0.5 text-rose-400" />
                <span>
                  This will permanently delete the client gallery, all events, and all media from cloud storage. Client links will immediately stop working.
                </span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#D6D0C6]/15">
                <button
                  type="button"
                  onClick={() => setShowDeleteGalleryModal(false)}
                  disabled={isDeletingGallery}
                  className="px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider text-[#FBFAF7]/70 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmDeleteGallery()}
                  disabled={isDeletingGallery}
                  className="px-5 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold uppercase tracking-wider shadow-lg shadow-rose-600/30 active:scale-95 transition-all disabled:opacity-50 cursor-pointer flex items-center gap-2"
                >
                  <Trash2 size={14} />
                  <span>{isDeletingGallery ? 'Deleting...' : 'Delete Gallery Permanently'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Event Modal */}
      {sceneToDelete && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141310] border border-rose-500/30 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col">
            <div className="px-5 py-3.5 bg-rose-500/10 border-b border-rose-500/20 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
                <Trash2 size={15} />
              </div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                Delete Event / Scene
              </h3>
            </div>

            <div className="p-5 space-y-3.5">
              <p className="text-xs text-[#FBFAF7]/80 leading-relaxed">
                Are you sure you want to delete event{' '}
                <strong className="text-white font-semibold">"{sceneToDelete.name}"</strong>?
              </p>

              <div className="p-2.5 rounded-lg bg-[#1A1814] border border-[#D6D0C6]/15 text-[11px] text-[#FBFAF7]/70">
                All media currently in this event will automatically move to{' '}
                <span className="text-[#E8A317] font-semibold">
                  {scenes.find((s) => s.id !== sceneToDelete.id)?.name || 'Highlights'}
                </span>
                .
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#D6D0C6]/15">
                <button
                  type="button"
                  onClick={() => setSceneToDelete(null)}
                  disabled={isDeletingScene}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-[#FBFAF7]/70 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmDeleteScene()}
                  disabled={isDeletingScene}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold uppercase tracking-wider active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isDeletingScene ? 'Deleting...' : 'Delete Event'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
