import { AlbumProject, PhotoItem, AlbumSizePreset } from '../album';
import { createInitialSampleProject } from './sampleData';

const META_LIST_KEY = 'bawaray_album_projects_meta_list';
const PROJECT_PREFIX = 'bawaray_album_proj_';
const ACTIVE_ID_KEY = 'bawaray_album_active_proj_id';
const LEGACY_STORAGE_KEY = 'bavari_album_current_project';

export interface ProjectMeta {
  id: string;
  title: string;
  clientNames: string;
  eventType: string;
  eventDate: string;
  sizePreset: AlbumSizePreset;
  targetDpi: number;
  spreadCount: number;
  photoCount: number;
  bindingStyle?: string;
  updatedAt: string;
  createdAt: string;
  coverThumbnail?: string;
}

/**
 * Migrate any legacy single project in localStorage
 */
function checkMigration(): void {
  try {
    const listRaw = localStorage.getItem(META_LIST_KEY);
    if (!listRaw) {
      // Check for legacy project
      const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacyRaw) {
        try {
          const legacyProject = JSON.parse(legacyRaw) as AlbumProject;
          if (legacyProject && legacyProject.id) {
            saveProjectToStorage(legacyProject);
            setActiveProjectId(legacyProject.id);
            return;
          }
        } catch {
          // Ignore parse errors
        }
      }

      // Initialize with sample demo project if no projects exist
      const sample = createInitialSampleProject();
      saveProjectToStorage(sample);
      setActiveProjectId(sample.id);
    }
  } catch (err) {
    console.error('Storage migration error:', err);
  }
}

// Run migration check once
checkMigration();

/**
 * Returns list of metadata for all saved album projects
 */
export function getProjectsList(): ProjectMeta[] {
  try {
    const raw = localStorage.getItem(META_LIST_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ProjectMeta[];
  } catch (err) {
    console.error('Failed to load projects list', err);
    return [];
  }
}

/**
 * Returns currently active project ID
 */
export function getActiveProjectId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_ID_KEY);
  } catch {
    return null;
  }
}

/**
 * Sets active project ID
 */
export function setActiveProjectId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_ID_KEY, id);
  } catch (err) {
    console.error('Failed to set active project id', err);
  }
}

/**
 * Saves a full AlbumProject into storage and updates project metadata list
 */
export function saveProjectToStorage(project: AlbumProject): void {
  try {
    // 1. Save full project
    const key = `${PROJECT_PREFIX}${project.id}`;
    localStorage.setItem(key, JSON.stringify(project));

    // Also mirror to legacy key for backwards compatibility
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(project));

    // 2. Find thumbnail from front cover or first spread
    let coverThumb: string | undefined = undefined;
    const coverSpread = project.spreads.find(s => s.sheetType === 'front_cover') || project.spreads[0];
    if (coverSpread) {
      const firstPhotoId = coverSpread.frames.find(f => f.photoId)?.photoId;
      if (firstPhotoId) {
        const photo = project.photos.find(p => p.id === firstPhotoId);
        if (photo) coverThumb = photo.url;
      }
    }

    // 3. Update metadata list
    const meta: ProjectMeta = {
      id: project.id,
      title: project.title,
      clientNames: project.clientNames,
      eventType: project.eventType,
      eventDate: project.eventDate,
      sizePreset: project.sizePreset,
      targetDpi: project.targetDpi || 300,
      spreadCount: project.spreads.length,
      photoCount: project.photos.length,
      bindingStyle: project.bindingStyle,
      updatedAt: new Date().toISOString(),
      createdAt: project.createdAt || new Date().toISOString(),
      coverThumbnail: coverThumb
    };

    const currentList = getProjectsList();
    const existingIndex = currentList.findIndex(p => p.id === project.id);
    let updatedList: ProjectMeta[];

    if (existingIndex >= 0) {
      updatedList = [...currentList];
      updatedList[existingIndex] = { ...updatedList[existingIndex], ...meta };
    } else {
      updatedList = [meta, ...currentList];
    }

    localStorage.setItem(META_LIST_KEY, JSON.stringify(updatedList));
  } catch (err) {
    console.error('Failed to save project to localStorage', err);
  }
}

/**
 * Loads a project by ID, or loads active project, or returns null
 */
export function loadProjectFromStorage(projectId?: string): AlbumProject | null {
  try {
    const idToLoad = projectId || getActiveProjectId();
    if (idToLoad) {
      const saved = localStorage.getItem(`${PROJECT_PREFIX}${idToLoad}`);
      if (saved) return JSON.parse(saved) as AlbumProject;
    }

    // Fallback to legacy key
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) return JSON.parse(legacy) as AlbumProject;

    return null;
  } catch (err) {
    console.error('Failed to load project from localStorage', err);
    return null;
  }
}

/**
 * Deletes an album project from storage
 */
export function deleteProject(id: string): void {
  try {
    localStorage.removeItem(`${PROJECT_PREFIX}${id}`);
    const list = getProjectsList().filter(p => p.id !== id);
    localStorage.setItem(META_LIST_KEY, JSON.stringify(list));

    if (getActiveProjectId() === id) {
      if (list.length > 0) {
        setActiveProjectId(list[0].id);
      } else {
        localStorage.removeItem(ACTIVE_ID_KEY);
      }
    }
  } catch (err) {
    console.error('Failed to delete project', err);
  }
}

/**
 * Duplicates an existing album project
 */
export function duplicateProject(id: string): AlbumProject | null {
  try {
    const source = loadProjectFromStorage(id);
    if (!source) return null;

    const newId = `proj-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const copy: AlbumProject = {
      ...source,
      id: newId,
      title: `${source.title} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    saveProjectToStorage(copy);
    return copy;
  } catch (err) {
    console.error('Failed to duplicate project', err);
    return null;
  }
}

/**
 * Downloads the current project as a `.bavari` JSON file to the user's computer
 */
export function exportProjectFile(project: AlbumProject): void {
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.title.replace(/\s+/g, '_')}_${Date.now()}.bavari`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Imports a `.bavari` project file from disk
 */
export async function importProjectFromFile(file: File): Promise<AlbumProject> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const project = JSON.parse(text) as AlbumProject;
        if (!project || !project.id || !project.spreads) {
          throw new Error('Invalid .bavari album file format');
        }
        // Give new ID if necessary or keep
        if (!project.targetDpi) project.targetDpi = 300;
        saveProjectToStorage(project);
        setActiveProjectId(project.id);
        resolve(project);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsText(file);
  });
}

/**
 * Reads local photo files selected by the user and generates PhotoItems
 */
export async function processImportedPhotoFiles(files: FileList | File[]): Promise<PhotoItem[]> {
  const photos: PhotoItem[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file.type.startsWith('image/')) continue;

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const dimensions = await getImageDimensions(dataUrl);

      photos.push({
        id: `photo-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 7)}`,
        fileName: file.name,
        url: dataUrl,
        width: dimensions.width,
        height: dimensions.height,
        aspectRatio: dimensions.width / dimensions.height,
        rating: 0,
        colorLabel: 'none',
        usedCount: 0
      });
    } catch (err) {
      console.warn(`Could not process file ${file.name}`, err);
    }
  }

  return photos;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

function getImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth || 2000, height: img.naturalHeight || 2000 });
    };
    img.onerror = () => {
      resolve({ width: 2000, height: 2000 });
    };
    img.src = url;
  });
}
