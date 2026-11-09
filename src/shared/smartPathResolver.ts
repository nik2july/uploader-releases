import type { ActiveStudioProject, ResolvedProjectContext } from './contracts';

export const SMART_FOLDER_NAMES = [
  '01_RAW_FOOTAGE',
  '02_AUDIO',
  '03_PROJECTS',
  '04_RENDER_DELIVERABLES',
  '05_CLIENT_CLIPS_DELIVERY',
  // Legacy aliases for backward compatibility:
  '02_REC709_CONVERTED_CLIPS',
  '03_CLIENT_CLIPS_DELIVERY',
  '05_RENDER_DELIVERABLES',
  '06_AUDIO'
] as const;

export const ACTIVE_PROJECT_KEY = 'baawaray_active_studio_project';
export const RECENT_PROJECTS_KEY = 'baawaray_recent_studio_projects';

/**
 * Normalizes slashes and strips trailing slashes.
 */
export function normalizePath(p: string): string {
  if (!p) return '';
  return p.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * Resolves a smart project context given ANY folder path inside or at the root of a project.
 * Handles paths like:
 * - "/Volumes/40/261028 Dhanur & Jhanvi/01_RAW_FOOTAGE/2026.10.28 – Wedding/Kishan"
 * - "/Volumes/40/261028 Dhanur & Jhanvi/01_RAW_FOOTAGE/2026.10.28 - Wedding"
 * - "/Volumes/40/261028 Dhanur & Jhanvi/01_RAW_FOOTAGE"
 * - "/Volumes/40/261028 Dhanur & Jhanvi"
 */
export function resolveSmartProjectContext(inputPath: string): ResolvedProjectContext | null {
  if (!inputPath || typeof inputPath !== 'string') return null;

  const normalized = normalizePath(inputPath.trim());
  if (!normalized) return null;

  // 1. Check if the path is inside one of the recognized studio folders
  for (const folderName of SMART_FOLDER_NAMES) {
    const pattern = `/${folderName}`;
    const idx = normalized.indexOf(pattern);
    if (idx !== -1) {
      const rootPath = normalized.slice(0, idx);
      const afterFolder = normalized.slice(idx + pattern.length).replace(/^\/+/, '');
      const segments = afterFolder ? afterFolder.split('/') : [];

      const eventSubfolder = segments[0] || '';
      const crewSubfolder = segments[1] || '';

      const rootName = rootPath.split('/').pop() || 'Studio Project';
      const clientName = rootName.replace(/^\d{6}\s+/, '');
      const eventSuffix = eventSubfolder ? `/${eventSubfolder}` : '';

      return {
        isSmartProject: true,
        rootPath,
        projectName: rootName,
        clientName,
        eventSubfolder: eventSubfolder || undefined,
        crewSubfolder: crewSubfolder || undefined,
        rawSourcePath:
          folderName === '01_RAW_FOOTAGE'
            ? normalized
            : `${rootPath}/01_RAW_FOOTAGE${eventSuffix}`,
        rec709DestinationPath: `${rootPath}/05_CLIENT_CLIPS_DELIVERY`,
        clientDeliveryDestinationPath: `${rootPath}/05_CLIENT_CLIPS_DELIVERY`,
        editedSourcePath: `${rootPath}/04_RENDER_DELIVERABLES`
      };
    }
  }

  // 2. Check if the path itself is a studio project root (e.g. starts with YYMMDD e.g. "261028 Dhanur & Jhanvi")
  const baseName = normalized.split('/').pop() || '';
  if (/^\d{6}\s+/.test(baseName)) {
    const clientName = baseName.replace(/^\d{6}\s+/, '');
    return {
      isSmartProject: true,
      rootPath: normalized,
      projectName: baseName,
      clientName,
      rawSourcePath: `${normalized}/01_RAW_FOOTAGE`,
      rec709DestinationPath: `${normalized}/05_CLIENT_CLIPS_DELIVERY`,
      clientDeliveryDestinationPath: `${normalized}/05_CLIENT_CLIPS_DELIVERY`,
      editedSourcePath: `${normalized}/04_RENDER_DELIVERABLES`
    };
  }

  return null;
}

/**
 * Sanitizes project paths to conform to standard 5-folder structure
 * and ensures client delivery destination never has an event subfolder appended.
 */
export function sanitizeProjectPaths(p: ActiveStudioProject): ActiveStudioProject {
  if (!p) return p;
  let dest = p.clientDeliveryDestinationPath || '';
  dest = dest.replace('/03_CLIENT_CLIPS_DELIVERY', '/05_CLIENT_CLIPS_DELIVERY');
  if (p.rootPath && dest.startsWith(p.rootPath)) {
    dest = `${p.rootPath}/05_CLIENT_CLIPS_DELIVERY`;
  }
  let edited = p.editedSourcePath || '';
  edited = edited.replace('/05_RENDER_DELIVERABLES', '/04_RENDER_DELIVERABLES');
  return {
    ...p,
    clientDeliveryDestinationPath: dest,
    editedSourcePath: edited
  };
}

/**
 * Reads the active project from LocalStorage
 */
export function getActiveStudioProject(): ActiveStudioProject | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(ACTIVE_PROJECT_KEY);
    if (!raw) return null;
    return sanitizeProjectPaths(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Saves the active project to LocalStorage and adds to recent history.
 * Emits a window event for reactive UI updates across all components.
 */
export function saveActiveStudioProject(project: ActiveStudioProject): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const sanitized = sanitizeProjectPaths(project);
    window.localStorage.setItem(ACTIVE_PROJECT_KEY, JSON.stringify(sanitized));

    // Save into recents list without duplicates
    const recents = getRecentStudioProjects().filter(p => p.rootPath !== sanitized.rootPath);
    recents.unshift(sanitized);
    window.localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(recents.slice(0, 10)));

    // Emit event so open views react immediately
    window.dispatchEvent(new CustomEvent('baawaray:active-project-changed', { detail: sanitized }));
  } catch (err) {
    console.error('[smartPathResolver] Failed to save active studio project:', err);
  }
}

/**
 * Returns recent studio projects
 */
export function getRecentStudioProjects(): ActiveStudioProject[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(RECENT_PROJECTS_KEY);
    if (!raw) return [];
    const list: ActiveStudioProject[] = JSON.parse(raw);
    return list.map(sanitizeProjectPaths);
  } catch {
    return [];
  }
}

/**
 * Subscribes to active project changes across the app
 */
export function subscribeActiveStudioProject(callback: (p: ActiveStudioProject | null) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = (e: any) => {
    callback(e.detail || getActiveStudioProject());
  };

  window.addEventListener('baawaray:active-project-changed', handler);
  window.addEventListener('storage', handler);

  return () => {
    window.removeEventListener('baawaray:active-project-changed', handler);
    window.removeEventListener('storage', handler);
  };
}
