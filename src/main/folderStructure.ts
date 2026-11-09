import fs from 'node:fs/promises';
import path from 'node:path';
import { shell } from 'electron';
import type { EventFolderPlan, FolderCreationResult } from '../shared/contracts';
import { computeProjectRootFolderName } from '../shared/naming';

function sanitizeName(name: string): string {
  return name.trim().replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ');
}

export async function createProjectFolderStructure(plan: EventFolderPlan): Promise<FolderCreationResult> {
  try {
    const safeClient = sanitizeName(plan.coupleName || plan.clientName || 'Untitled Client');
    
    // Resolve Project Root: [Project Code] [Project Name]
    let rootFolderName = '';
    if (plan.customRootFolderName?.trim()) {
      rootFolderName = sanitizeName(plan.customRootFolderName);
    } else if (plan.projectCode?.trim()) {
      rootFolderName = `${sanitizeName(plan.projectCode)} ${safeClient}`;
    } else {
      rootFolderName = computeProjectRootFolderName(
        safeClient,
        undefined,
        plan.mainEventDate || plan.eventDate,
        plan.eventName,
        plan.cinematographers
      );
    }

    const rootPath = path.join(plan.targetDirectory, rootFolderName);

    // Collect all events (either array of events or single event fallback)
    const eventList = (plan.events && plan.events.length > 0)
      ? plan.events
      : [
          {
            eventName: plan.eventName || 'Wedding',
            eventDate: plan.eventDate || new Date().toISOString().slice(0, 10),
            photographers: plan.photographers || [],
            cinematographers: plan.cinematographers || [],
            droneOperators: plan.droneOperators || []
          }
        ];

    const pathsToCreate: string[] = [
      rootPath,
      path.join(rootPath, '01_RAW_FOOTAGE'),
      // 02 Audio
      path.join(rootPath, '02_AUDIO', 'External_Mics'),
      path.join(rootPath, '02_AUDIO', 'DJ_Console'),
      // 03 Projects (for later on)
      path.join(rootPath, '03_PROJECTS', 'Premiere Pro'),
      path.join(rootPath, '03_PROJECTS', 'DaVinci Resolve'),
      path.join(rootPath, '03_PROJECTS', 'Lightroom'),
      path.join(rootPath, '03_PROJECTS', 'Photoshop & Album'),
      // 04 Outputs
      path.join(rootPath, '04_OUTPUTS'),
      // 05 Delivery
      path.join(rootPath, '05_DELIVERY', '01_Pen_Drive_Delivery'),
      path.join(rootPath, '05_DELIVERY', '02_Hard_Drive_Delivery')
    ];

    // 1. Build 01_RAW_FOOTAGE for each event
    for (const ev of eventList) {
      const datePrefix = ev.eventDate ? ev.eventDate.replace(/-/g, '.') : new Date().toISOString().slice(0, 10).replace(/-/g, '.');
      const safeEvName = sanitizeName(ev.eventName || 'Event');
      const eventSubfolder = `${datePrefix} - ${safeEvName}`;
      const eventRootDir = path.join(rootPath, '01_RAW_FOOTAGE', eventSubfolder);

      pathsToCreate.push(eventRootDir);

      // Photos folder & individual photographer folders
      const photosDir = path.join(eventRootDir, 'Photos');
      pathsToCreate.push(photosDir);
      if (ev.photographers && ev.photographers.length > 0) {
        for (const photoName of ev.photographers) {
          const pSafe = sanitizeName(photoName);
          if (pSafe) {
            pathsToCreate.push(path.join(photosDir, pSafe));
          }
        }
      } else {
        pathsToCreate.push(path.join(photosDir, 'Photographer 1'));
      }

      // Videos folder & individual cinematographer & drone folders
      const videosDir = path.join(eventRootDir, 'Videos');
      pathsToCreate.push(videosDir);
      if (ev.cinematographers && ev.cinematographers.length > 0) {
        for (const cinemaName of ev.cinematographers) {
          const cSafe = sanitizeName(cinemaName);
          if (cSafe) {
            const cDir = path.join(videosDir, cSafe);
            pathsToCreate.push(cDir);
            if (plan.createRawCameras) {
              pathsToCreate.push(path.join(cDir, 'CAM_A'));
              pathsToCreate.push(path.join(cDir, 'CAM_B'));
            }
          }
        }
      } else {
        pathsToCreate.push(path.join(videosDir, 'Cinematographer 1'));
      }

      if (ev.droneOperators && ev.droneOperators.length > 0) {
        for (const droneName of ev.droneOperators) {
          const dSafe = sanitizeName(droneName);
          if (dSafe) {
            const droneFolder = /drone/i.test(dSafe) ? dSafe : `Drone - ${dSafe}`;
            pathsToCreate.push(path.join(videosDir, droneFolder));
          }
        }
      }
    }

    // 2. Build 04_OUTPUTS based on deliverables
    const defaultDeliverables = [
      '01_Teaser',
      '02_Highlight_Film',
      '03_Reels',
      '04_Full_Length_Feature',
      '05_Edited_Photos',
      '06_Photo_Album'
    ];

    const deliverablesToUse = (plan.deliverables && plan.deliverables.length > 0)
      ? plan.deliverables
      : defaultDeliverables;

    for (const deliv of deliverablesToUse) {
      const dSafe = sanitizeName(deliv);
      if (dSafe) {
        pathsToCreate.push(path.join(rootPath, '04_OUTPUTS', dSafe));
      }
    }

    // Create all directories recursively
    for (const dir of pathsToCreate) {
      await fs.mkdir(dir, { recursive: true });
    }

    // Write metadata project-info.txt
    const eventsSummary = eventList.map(e => `
- Event: ${e.eventName} (${e.eventDate})
  Photographers: ${e.photographers?.join(', ') || 'None'}
  Cinematographers: ${e.cinematographers?.join(', ') || 'None'}
  Drone: ${e.droneOperators?.join(', ') || 'None'}`).join('\n');

    const deliverablesSummary = deliverablesToUse.map(d => `  - ${d}`).join('\n');

    const metaText = `Baawaray Films • Unified Post-Production Studio OS
Project Code: ${plan.projectCode || 'Auto'}
Client Name: ${safeClient}
Root Directory: ${rootPath}
Created At: ${new Date().toISOString()}

========================================
EVENTS & CREW ALLOCATION
========================================
${eventsSummary}

========================================
CLIENT DELIVERABLES (OUTPUTS)
========================================
${deliverablesSummary}

========================================
DELIVERY CHANNELS
========================================
- 01_Pen_Drive_Delivery
- 02_Hard_Drive_Delivery

Post-Production Hotline: +91 88945 62004
Studio OS Live Connected
`;
    await fs.writeFile(path.join(rootPath, 'project-info.txt'), metaText, 'utf8');

    return {
      success: true,
      rootPath,
      createdPaths: pathsToCreate
    };
  } catch (err: any) {
    return {
      success: false,
      rootPath: '',
      createdPaths: [],
      error: err?.message || 'Failed to create folder structure'
    };
  }
}

export async function revealFolderInFinder(folderPath: string): Promise<boolean> {
  try {
    await shell.openPath(folderPath);
    return true;
  } catch {
    return false;
  }
}
