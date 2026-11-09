import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ffprobePath, run } from './ffTools';
import type {
  FolderScanResult,
  DiscoveredCrewPackage,
  FootageFolderStats,
  DetectedTranscodedFolder
} from '../shared/contracts';

const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mov',
  '.mxf',
  '.crm',
  '.braw',
  '.avi',
  '.mkv'
]);

async function measureDirectory(dirPath: string): Promise<{ totalBytes: number; fileCount: number; videoFiles: number }> {
  let totalBytes = 0;
  let fileCount = 0;
  let videoFiles = 0;

  async function walk(current: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const ent of entries) {
      if (ent.name.startsWith('.') || ent.name === '$RECYCLE.BIN' || ent.name === 'System Volume Information') {
        continue;
      }
      const full = path.join(current, ent.name);
      if (ent.isDirectory()) {
        await walk(full);
      } else if (ent.isFile()) {
        try {
          const st = await fs.stat(full);
          totalBytes += st.size;
          fileCount += 1;
          const ext = path.extname(ent.name).toLowerCase();
          if (VIDEO_EXTENSIONS.has(ext)) {
            videoFiles += 1;
          }
        } catch {
          // Ignore unreadable file
        }
      }
    }
  }

  await walk(dirPath);
  return { totalBytes, fileCount, videoFiles };
}

export async function scanFootageFolder(targetPath: string): Promise<FolderScanResult> {
  try {
    const stat = await fs.stat(targetPath);
    if (!stat.isDirectory()) {
      return { ok: false, error: 'Target path is not a directory' };
    }

    // Check if the user selected a root project folder that contains 01_RAW_FOOTAGE
    const rawFootageCandidate = path.join(targetPath, '01_RAW_FOOTAGE');
    let hasRawFootageSubdir = false;
    try {
      const rfStat = await fs.stat(rawFootageCandidate);
      hasRawFootageSubdir = rfStat.isDirectory();
    } catch {
      hasRawFootageSubdir = false;
    }

    const discoveredPackages: DiscoveredCrewPackage[] = [];

    if (hasRawFootageSubdir) {
      // Traverse events under 01_RAW_FOOTAGE
      const eventDirs = await fs.readdir(rawFootageCandidate, { withFileTypes: true });
      for (const ev of eventDirs) {
        if (!ev.isDirectory() || ev.name.startsWith('.')) continue;
        const evPath = path.join(rawFootageCandidate, ev.name);
        const evName = ev.name.replace(/^\d{4}\.\d{2}\.\d{2}\s*-\s*/, '');

        const crewDirs = await fs.readdir(evPath, { withFileTypes: true });
        for (const cr of crewDirs) {
          if (!cr.isDirectory() || cr.name.startsWith('.')) continue;

          // Check if this is a category folder (Photos or Videos)
          if (/^photos?$/i.test(cr.name)) {
            const photoSubdirs = await fs.readdir(path.join(evPath, cr.name), { withFileTypes: true });
            for (const pSub of photoSubdirs) {
              if (!pSub.isDirectory() || pSub.name.startsWith('.')) continue;
              const pPath = path.join(evPath, cr.name, pSub.name);
              const measured = await measureDirectory(pPath);
              if (measured.fileCount > 0) {
                const rootBase = path.basename(targetPath).replace(/^\d{6}\s+/, '');
                discoveredPackages.push({
                  folderPath: pPath,
                  clientName: rootBase,
                  eventName: evName,
                  crewName: pSub.name,
                  role: 'Photographer',
                  dataGb: Number((measured.totalBytes / (1024 * 1024 * 1024)).toFixed(2)),
                  fileCount: measured.fileCount,
                  videoFiles: measured.videoFiles
                });
              }
            }
            continue;
          }

          if (/^videos?$/i.test(cr.name)) {
            const videoSubdirs = await fs.readdir(path.join(evPath, cr.name), { withFileTypes: true });
            for (const vSub of videoSubdirs) {
              if (!vSub.isDirectory() || vSub.name.startsWith('.')) continue;
              const vPath = path.join(evPath, cr.name, vSub.name);
              const vRole: 'Cinematographer' | 'Drone' = /drone/i.test(vSub.name) ? 'Drone' : 'Cinematographer';
              const measured = await measureDirectory(vPath);
              if (measured.fileCount > 0) {
                const rootBase = path.basename(targetPath).replace(/^\d{6}\s+/, '');
                discoveredPackages.push({
                  folderPath: vPath,
                  clientName: rootBase,
                  eventName: evName,
                  crewName: vSub.name.replace(/^(Drone)\s*-\s*/i, ''),
                  role: vRole,
                  dataGb: Number((measured.totalBytes / (1024 * 1024 * 1024)).toFixed(2)),
                  fileCount: measured.fileCount,
                  videoFiles: measured.videoFiles
                });
              }
            }
            continue;
          }

          const crPath = path.join(evPath, cr.name);
          const crRole: 'Cinematographer' | 'Drone' | 'Photographer' = /drone/i.test(cr.name)
            ? 'Drone'
            : /photo/i.test(cr.name)
            ? 'Photographer'
            : 'Cinematographer';

          const measured = await measureDirectory(crPath);
          if (measured.fileCount > 0) {
            const rootBase = path.basename(targetPath).replace(/^\d{6}\s+/, '');
            discoveredPackages.push({
              folderPath: crPath,
              clientName: rootBase,
              eventName: evName,
              crewName: cr.name.replace(/^(Cinematographer|Drone|Photographer)\s*-\s*/i, ''),
              role: crRole,
              dataGb: Number((measured.totalBytes / (1024 * 1024 * 1024)).toFixed(2)),
              fileCount: measured.fileCount,
              videoFiles: measured.videoFiles
            });
          }
        }
      }
    }

    // Direct measurement of selected folder
    const directMeasured = await measureDirectory(targetPath);
    const dataGb = Number((directMeasured.totalBytes / (1024 * 1024 * 1024)).toFixed(2));

    // Path pattern detection for direct targetPath
    const parts = targetPath.split(path.sep).filter(Boolean);
    const rawIdx = parts.findIndex(x => x.includes('01_RAW_FOOTAGE'));

    let detectedClient = '';
    let detectedEvent = '';
    let detectedCrew = '';
    let detectedRole: 'Cinematographer' | 'Drone' | 'Photographer' = 'Cinematographer';

    if (rawIdx > 0) {
      detectedClient = parts[rawIdx - 1].replace(/^\d{6}\s+/, '');
    } else if (hasRawFootageSubdir) {
      detectedClient = path.basename(targetPath).replace(/^\d{6}\s+/, '');
    }
    if (rawIdx >= 0 && parts.length > rawIdx + 1) {
      detectedEvent = parts[rawIdx + 1].replace(/^\d{4}\.\d{2}\.\d{2}\s*-\s*/, '');
    }
    if (rawIdx >= 0 && parts.length > rawIdx + 2) {
      const rawCrew = parts[rawIdx + 2];
      detectedCrew = rawCrew.replace(/^(Cinematographer|Drone|Photographer)\s*-\s*/i, '');
      if (/drone/i.test(rawCrew)) detectedRole = 'Drone';
      else if (/photo/i.test(rawCrew)) detectedRole = 'Photographer';
      else detectedRole = 'Cinematographer';
    } else if (parts.length > 0) {
      const last = parts[parts.length - 1];
      if (/drone/i.test(last)) {
        detectedRole = 'Drone';
        detectedCrew = last.replace(/^(Drone)\s*-\s*/i, '');
      } else if (!last.includes('01_RAW_FOOTAGE') && !/^\d{4}\./.test(last)) {
        detectedCrew = last.replace(/^(Cinematographer)\s*-\s*/i, '');
      }
    }

    return {
      ok: true,
      folderPath: targetPath,
      dataGb,
      fileCount: directMeasured.fileCount,
      videoFiles: directMeasured.videoFiles,
      detectedClient,
      detectedEvent,
      detectedCrew,
      detectedRole,
      discoveredPackages
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Failed to scan folder'
    };
  }
}

const statsCache = new Map<string, { stats: FootageFolderStats; timestamp: number }>();

export async function getFootageFolderStats(folderPath: string): Promise<FootageFolderStats> {
  const cached = statsCache.get(folderPath);
  if (cached && Date.now() - cached.timestamp < 60_000) {
    return cached.stats;
  }

  const videoFiles: string[] = [];
  let totalBytes = 0;

  async function walk(current: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith('.') || ent.name === '$RECYCLE.BIN' || ent.name === 'System Volume Information') {
        continue;
      }
      const full = path.join(current, ent.name);
      if (ent.isDirectory()) {
        await walk(full);
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();
        if (VIDEO_EXTENSIONS.has(ext)) {
          videoFiles.push(full);
          try {
            const st = await fs.stat(full);
            totalBytes += st.size;
          } catch {}
        }
      }
    }
  }

  await walk(folderPath);

  if (videoFiles.length === 0) {
    const res = { fileCount: 0, totalBytes: 0, durationSeconds: 0 };
    statsCache.set(folderPath, { stats: res, timestamp: Date.now() });
    return res;
  }

  const probeBin = ffprobePath();
  const pool = Math.max(4, Math.min(10, os.cpus().length || 8));
  let durationSeconds = 0;
  let next = 0;

  await Promise.all(
    Array.from({ length: Math.min(pool, videoFiles.length) }, async () => {
      while (next < videoFiles.length) {
        const idx = next++;
        const file = videoFiles[idx];
        const { stdout, code } = await run(
          probeBin,
          ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
          { timeout: 10_000 }
        );
        if (code === 0 && stdout) {
          const d = parseFloat(stdout.trim());
          if (!isNaN(d)) durationSeconds += d;
        }
      }
    })
  );

  const stats: FootageFolderStats = {
    fileCount: videoFiles.length,
    totalBytes,
    durationSeconds
  };
  statsCache.set(folderPath, { stats, timestamp: Date.now() });
  return stats;
}

export async function autoDetectTranscodedFolder(
  searchHint?: string,
  clientName?: string
): Promise<DetectedTranscodedFolder> {
  const candidateDirs: string[] = [];

  // 1. Check explicit search hint
  if (searchHint && typeof searchHint === 'string' && searchHint.trim()) {
    const clean = searchHint.replace(/\\/g, '/').replace(/\/+$/, '');
    candidateDirs.push(clean);
    if (!clean.endsWith('/Raw Clips')) {
      candidateDirs.push(`${clean}/Raw Clips`);
    }
  }

  // 2. Discover client folders on local volumes
  const targetClient = (clientName || (searchHint ? path.basename(searchHint).replace(/^\d{6}\s+/, '') : '')).trim();
  const searchVolumes = ['/Volumes/40', '/Volumes/40/Antigravitty Projects'];

  for (const vol of searchVolumes) {
    try {
      const volEntries = await fs.readdir(vol, { withFileTypes: true });
      for (const ent of volEntries) {
        if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
        const normName = ent.name.toLowerCase();
        const clientLower = targetClient.toLowerCase();

        if (clientLower && (normName.includes(clientLower) || clientLower.includes(normName.replace(/^\d{6}\s+/, '')))) {
          const clientRoot = path.join(vol, ent.name);
          candidateDirs.push(path.join(clientRoot, '05_CLIENT_CLIPS_DELIVERY'));
          candidateDirs.push(path.join(clientRoot, '02_REC709_CONVERTED_CLIPS'));
        }
      }
    } catch {}
  }

  // De-duplicate candidate paths
  const uniqueCandidates = Array.from(new Set(candidateDirs));

  for (const cDir of uniqueCandidates) {
    try {
      const st = await fs.stat(cDir);
      if (!st.isDirectory()) continue;

      const subEntries = await fs.readdir(cDir, { withFileTypes: true });

      // Check direct folder if named "Raw Clips"
      if (path.basename(cDir).toLowerCase() === 'raw clips') {
        const measured = await measureDirectory(cDir);
        if (measured.videoFiles > 0) {
          return {
            found: true,
            folderPath: cDir,
            clipCount: measured.videoFiles,
            totalBytes: measured.totalBytes,
            dataGb: parseFloat((measured.totalBytes / (1024 ** 3)).toFixed(1)),
            label: `${measured.videoFiles} transcoded clips (${(measured.totalBytes / (1024 ** 3)).toFixed(1)} GB)`
          };
        }
      }

      // Check child "Raw Clips"
      const rawClipsChild = subEntries.find(e => e.isDirectory() && e.name.toLowerCase() === 'raw clips');
      if (rawClipsChild) {
        const rawClipsPath = path.join(cDir, rawClipsChild.name);
        const measured = await measureDirectory(rawClipsPath);
        if (measured.videoFiles > 0) {
          return {
            found: true,
            folderPath: rawClipsPath,
            clipCount: measured.videoFiles,
            totalBytes: measured.totalBytes,
            dataGb: parseFloat((measured.totalBytes / (1024 ** 3)).toFixed(1)),
            label: `${measured.videoFiles} transcoded clips (${(measured.totalBytes / (1024 ** 3)).toFixed(1)} GB)`
          };
        }
      }

      // Check event subfolders (e.g. 2026.10.28 - Wedding / Raw Clips)
      for (const sub of subEntries) {
        if (!sub.isDirectory() || sub.name.startsWith('.') || sub.name.startsWith('_')) continue;
        const subPath = path.join(cDir, sub.name);
        try {
          const nestedEntries = await fs.readdir(subPath, { withFileTypes: true });
          const nestedRaw = nestedEntries.find(e => e.isDirectory() && e.name.toLowerCase() === 'raw clips');
          if (nestedRaw) {
            const nestedRawPath = path.join(subPath, nestedRaw.name);
            const measured = await measureDirectory(nestedRawPath);
            if (measured.videoFiles > 0) {
              return {
                found: true,
                folderPath: nestedRawPath,
                clipCount: measured.videoFiles,
                totalBytes: measured.totalBytes,
                dataGb: parseFloat((measured.totalBytes / (1024 ** 3)).toFixed(1)),
                eventName: sub.name,
                label: `${sub.name}: ${measured.videoFiles} transcoded clips (${(measured.totalBytes / (1024 ** 3)).toFixed(1)} GB)`
              };
            }
          }
        } catch {}
      }

      // Fallback: Check if cDir itself contains video files directly
      const measured = await measureDirectory(cDir);
      if (measured.videoFiles > 0) {
        return {
          found: true,
          folderPath: cDir,
          clipCount: measured.videoFiles,
          totalBytes: measured.totalBytes,
          dataGb: parseFloat((measured.totalBytes / (1024 ** 3)).toFixed(1)),
          label: `${measured.videoFiles} transcoded clips (${(measured.totalBytes / (1024 ** 3)).toFixed(1)} GB)`
        };
      }
    } catch {}
  }

  return { found: false };
}
