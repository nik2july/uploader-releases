import React, { useEffect, useMemo, useState } from 'react';
import {
  FolderPlus,
  FolderSearch,
  FolderOpen,
  UserCheck,
  CheckCircle2,
  Sparkles,
  Upload,
  HardDrive,
  Send,
  ShieldCheck,
  Calendar,
  Camera,
  ChevronRight,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  Layers,
  Image as ImageIcon,
} from 'lucide-react';
import {
  GallerySummary,
  IngestScanResult,
  GalleryBatchUploadGroup,
} from '../../../../shared/contracts';
import { useOptionalApp } from '../../context/AppContext';
import { Client, ProjectEvent, TeamMember } from '../../types';
import { getClientEvents, resolveMemberEventRoleId, formatDate } from '../../utils/formatters';

interface SmartPhotographerIngestPanelProps {
  galleries: GallerySummary[];
  selectedGalleryId: string;
  onSelectGallery: (galleryId: string) => void;
  onSelectScene: (sceneId: string) => void;
  onGalleriesUpdated: () => Promise<void>;
  autoTranscode: boolean;
  autoplayLoop: boolean;
  isUploading: boolean;
  showToast: (msg: string) => void;
}

type IngestScenarioId = 'scenario_1' | 'scenario_2' | 'scenario_3' | 'scenario_4';

interface MappedPhotographerScan {
  folderName: string;
  folderPath: string;
  matchedPhotographerId: number;
  matchedPhotographerName: string;
  photoCount: number;
  videoCount: number;
  totalFiles: number;
  totalBytes: number;
  dataGb: number;
  filePaths: string[];
  include: boolean;
}

interface MappedEventScan {
  eventFolderName: string;
  eventFolderPath: string;
  matchedEventId: number;
  matchedEventName: string;
  photographers: MappedPhotographerScan[];
}

function normalizeName(str?: string): string {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isPhotographerRole(roleStr?: string): boolean {
  const r = (roleStr || '').toLowerCase();
  if (!r) return false;
  if (
    r.includes('video') ||
    r.includes('cinema') ||
    r.includes('film') ||
    r.includes('drone') ||
    r.includes('edit') ||
    r.includes('album') ||
    r.includes('coordinator')
  ) {
    return false;
  }
  return (
    r.includes('photo') ||
    r.includes('candid') ||
    r.includes('trad') ||
    r.includes('portrait') ||
    r.includes('shoot')
  );
}

export function SmartPhotographerIngestPanel({
  galleries,
  selectedGalleryId,
  onSelectGallery,
  onSelectScene,
  onGalleriesUpdated,
  autoTranscode,
  autoplayLoop,
  isUploading,
  showToast,
}: SmartPhotographerIngestPanelProps): React.ReactElement | null {
  const studio = useOptionalApp();

  const [activeScenario, setActiveScenario] = useState<IngestScenarioId>('scenario_1');
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [selectedPhotographerId, setSelectedPhotographerId] = useState<number | null>(null);

  // Scenario 1 saved root path per client
  const [createdTreePath, setCreatedTreePath] = useState<string>('');
  const [isWorking, setIsWorking] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Scanned preview state (used by Scenarios 1, 2, 3 before or during execution)
  const [mappedEventsScan, setMappedEventsScan] = useState<MappedEventScan[]>([]);
  const [scannedRootPath, setScannedRootPath] = useState<string>('');

  // Booked clients from Studio OS (clients with booked status or scheduled events)
  const bookedClients = useMemo<Client[]>(() => {
    if (!studio?.clients) return [];
    return studio.clients.filter((c) => {
      const evs = getClientEvents(c, studio.projects || []);
      const st = (c.status || '').toLowerCase();
      return evs.length > 0 || st === 'booked' || st === 'completed' || st === 'in progress';
    });
  }, [studio?.clients, studio?.projects]);

  // Selected Booked Client object
  const selectedClient = useMemo<Client | null>(() => {
    if (!bookedClients.length) return null;
    if (selectedClientId !== null) {
      const found = bookedClients.find((c) => c.id === selectedClientId);
      if (found) return found;
    }
    return bookedClients[0] || null;
  }, [bookedClients, selectedClientId]);

  // Scheduled events for the selected Booked Client
  const clientEvents = useMemo<ProjectEvent[]>(() => {
    if (!selectedClient || !studio?.projects) return [];
    const evs = getClientEvents(selectedClient, studio.projects);
    return [...evs].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }, [selectedClient, studio?.projects]);

  // All studio photographers (fallback pool)
  const allStudioPhotographers = useMemo<TeamMember[]>(() => {
    if (!studio?.team) return [];
    const photoTeam = studio.team.filter((m) => {
      if (isPhotographerRole(m.role)) return true;
      return (m.assignedRoleIds || []).some((r) => isPhotographerRole(r));
    });
    return photoTeam.length > 0 ? photoTeam : studio.team;
  }, [studio?.team]);

  // Helper: Get locked photographers for a specific event
  const getEventLockedPhotographers = (event?: ProjectEvent | null): TeamMember[] => {
    if (!event || !studio?.team) return [];
    const allottedIds = event.assignments || [];
    const allottedMembers = allottedIds
      .map((id) => studio.team.find((m) => Number(m.id) === Number(id)))
      .filter((m): m is TeamMember => Boolean(m));

    const allottedPhotographers = allottedMembers.filter((member) => {
      const eventRole = resolveMemberEventRoleId(member, event) || member.role;
      return isPhotographerRole(eventRole) || isPhotographerRole(member.role);
    });

    if (allottedPhotographers.length > 0) {
      return allottedPhotographers;
    }
    if (allottedMembers.length > 0) {
      return allottedMembers;
    }
    return allStudioPhotographers;
  };

  // Auto-match selectedClient when selectedGalleryId changes
  useEffect(() => {
    if (!bookedClients.length) return;
    const currentGallery = galleries.find((g) => g.id === selectedGalleryId);
    if (currentGallery) {
      if (currentGallery.studioClientId) {
        const byId = bookedClients.find((c) => c.id === currentGallery.studioClientId);
        if (byId && byId.id !== selectedClientId) {
          setSelectedClientId(byId.id);
          return;
        }
      }
      const gClientNorm = normalizeName(currentGallery.clientName || currentGallery.title);
      if (gClientNorm) {
        const matched = bookedClients.find((c) => {
          const cNorm = normalizeName(c.couple || c.name);
          return (
            cNorm &&
            (cNorm === gClientNorm || cNorm.includes(gClientNorm) || gClientNorm.includes(cNorm))
          );
        });
        if (matched && matched.id !== selectedClientId) {
          setSelectedClientId(matched.id);
          return;
        }
      }
    }
    if (selectedClientId === null && bookedClients[0]) {
      setSelectedClientId(bookedClients[0].id);
    }
  }, [selectedGalleryId, galleries, bookedClients]);

  // Keep selectedEventId & selectedPhotographerId valid when selectedClient changes
  useEffect(() => {
    if (!selectedClient) return;
    const savedPath = localStorage.getItem(`baawaray_ingest_root_${selectedClient.id}`) || '';
    setCreatedTreePath(savedPath);
    setMappedEventsScan([]);
    setScannedRootPath('');

    const firstEvent = clientEvents[0] || null;
    setSelectedEventId(firstEvent ? firstEvent.id : null);
    if (firstEvent) {
      const locked = getEventLockedPhotographers(firstEvent);
      setSelectedPhotographerId(locked[0]?.id ?? allStudioPhotographers[0]?.id ?? null);
    } else {
      setSelectedPhotographerId(allStudioPhotographers[0]?.id ?? null);
    }
  }, [selectedClient?.id, clientEvents.length]);

  // Update selectedPhotographerId when selectedEventId changes
  useEffect(() => {
    const ev = clientEvents.find((e) => e.id === selectedEventId) || null;
    const locked = getEventLockedPhotographers(ev);
    if (locked.length > 0 && !locked.some((m) => m.id === selectedPhotographerId)) {
      setSelectedPhotographerId(locked[0].id);
    }
  }, [selectedEventId]);

  if (!studio || bookedClients.length === 0) {
    return null;
  }

  const activeEvent = clientEvents.find((e) => e.id === selectedEventId) || clientEvents[0] || null;
  const activeEventPhotographers = getEventLockedPhotographers(activeEvent);

  /**
   * Ensures a Client Gallery exists for `selectedClient` AND creates/matches
   * an Event Scene tab for every booked ProjectEvent (so the client only sees Event folders).
   */
  const ensureClientGalleryAndEventScenes = async (
    client: Client,
    events: ProjectEvent[]
  ): Promise<{ gallery: GallerySummary; eventSceneMap: Map<number, { id: string; name: string }> }> => {
    const clientDisplayName = (client.couple || client.name || 'Client').trim();
    const cNorm = normalizeName(clientDisplayName);

    let foundGallery =
      galleries.find((g) => g.studioClientId === client.id) ||
      galleries.find((g) => {
        const gNorm = normalizeName(g.clientName || g.title);
        return gNorm && (gNorm === cNorm || gNorm.includes(cNorm) || cNorm.includes(gNorm));
      });

    if (!foundGallery) {
      const earliestEvent = events[0];
      const created = await window.api.galleryCreateGallery({
        title: `${clientDisplayName} Wedding Gallery`,
        clientName: clientDisplayName,
        studioClientId: client.id,
        eventDate: earliestEvent?.date || new Date().toISOString().slice(0, 10),
        isPublished: true,
      });
      if (!created) {
        throw new Error('Failed to create client gallery on server.');
      }
      foundGallery = created;
    }

    const existingScenes = [...(foundGallery.scenes || [])];
    const eventSceneMap = new Map<number, { id: string; name: string }>();

    for (const ev of events) {
      const evName = (ev.eventName || ev.couple || `Event ${ev.id}`).trim();
      const evNorm = normalizeName(evName);

      let matchedScene = existingScenes.find(
        (s) => s.studioEventId === ev.id || normalizeName(s.name) === evNorm
      );

      if (!matchedScene) {
        const createdScene = await window.api.galleryCreateScene(foundGallery.id, evName);
        if (createdScene && createdScene.id) {
          matchedScene = {
            id: String(createdScene.id),
            name: String(createdScene.name || evName),
            order: existingScenes.length,
            studioEventId: ev.id,
          };
          existingScenes.push(matchedScene);
        }
      }

      if (matchedScene) {
        eventSceneMap.set(ev.id, { id: matchedScene.id, name: matchedScene.name });
      }
    }

    const updatedGallery: GallerySummary = {
      ...foundGallery,
      scenes: existingScenes,
    };

    await onGalleriesUpdated();
    onSelectGallery(updatedGallery.id);

    return { gallery: updatedGallery, eventSceneMap };
  };

  /**
   * Maps raw IngestScanResult into MappedEventScan[] by matching against the client's Booked Events
   * and each event's Locked Photographers.
   */
  const mapScanResultToClient = (
    scan: IngestScanResult,
    mode: 'client_tree' | 'event_folder',
    forcedEvent?: ProjectEvent | null
  ): MappedEventScan[] => {
    return scan.events.map((scannedEv, evIdx) => {
      let matchedEvent: ProjectEvent | undefined = forcedEvent || undefined;

      if (!matchedEvent && scannedEv.matchedEventId) {
        matchedEvent = clientEvents.find((e) => e.id === scannedEv.matchedEventId);
      }
      if (!matchedEvent) {
        const folderNorm = normalizeName(scannedEv.folderName);
        matchedEvent = clientEvents.find((e) => {
          const eNorm = normalizeName(e.eventName);
          return (
            eNorm && (eNorm === folderNorm || folderNorm.includes(eNorm) || eNorm.includes(folderNorm))
          );
        });
      }
      if (!matchedEvent) {
        matchedEvent = clientEvents[evIdx] || clientEvents[0];
      }

      const candidatePhotographers = getEventLockedPhotographers(matchedEvent);

      const sourcePhotographerFolders =
        scannedEv.photographers.length > 0
          ? scannedEv.photographers
          : scannedEv.directFiles
          ? [scannedEv.directFiles]
          : [];

      const mappedPhotographers: MappedPhotographerScan[] = sourcePhotographerFolders.map(
        (pFolder, pIdx) => {
          let matchedMember: TeamMember | undefined;

          if (pFolder.matchedMemberId) {
            matchedMember =
              candidatePhotographers.find((m) => m.id === pFolder.matchedMemberId) ||
              allStudioPhotographers.find((m) => m.id === pFolder.matchedMemberId);
          }

          if (!matchedMember) {
            const pNorm = normalizeName(pFolder.folderName);
            matchedMember =
              candidatePhotographers.find((m) => {
                const mNorm = normalizeName(m.name);
                return mNorm && (mNorm === pNorm || pNorm.includes(mNorm) || mNorm.includes(pNorm));
              }) ||
              allStudioPhotographers.find((m) => {
                const mNorm = normalizeName(m.name);
                return mNorm && (mNorm === pNorm || pNorm.includes(mNorm) || mNorm.includes(pNorm));
              });
          }

          if (!matchedMember) {
            matchedMember =
              candidatePhotographers[pIdx] ||
              candidatePhotographers[0] ||
              allStudioPhotographers[0];
          }

          const numericGb = parseFloat(String(pFolder.dataGb)) || 0;

          return {
            folderName: pFolder.folderName,
            folderPath: pFolder.folderPath,
            matchedPhotographerId: matchedMember?.id || 0,
            matchedPhotographerName: matchedMember?.name || pFolder.folderName,
            photoCount: pFolder.photoCount,
            videoCount: pFolder.videoCount,
            totalFiles: pFolder.totalFiles,
            totalBytes: pFolder.totalBytes,
            dataGb: numericGb,
            filePaths: pFolder.filePaths,
            include: pFolder.totalFiles > 0,
          };
        }
      );

      return {
        eventFolderName:
          mode === 'event_folder' && forcedEvent
            ? forcedEvent.eventName || scannedEv.folderName
            : scannedEv.folderName,
        eventFolderPath: scannedEv.folderPath,
        matchedEventId: matchedEvent?.id || 0,
        matchedEventName: matchedEvent?.eventName || scannedEv.folderName,
        photographers: mappedPhotographers,
      };
    });
  };

  /**
   * SCENARIO 1 — Step 1: Create `<Client>/<Event>/<Locked Photographer>` Folder Tree on Disk
   */
  const handleCreateScenario1FolderTree = async (): Promise<void> => {
    if (!selectedClient) return;
    setErrorBanner(null);
    setStatusBanner(null);
    setIsWorking(true);

    try {
      const clientDisplayName = (selectedClient.couple || selectedClient.name || 'Client').trim();
      const clientCode = (selectedClient as any).code || (studio as any)?.projectCodes?.find?.((p: any) => p.clientIds?.includes(String(selectedClient.id)) || p.last10 === String(selectedClient.phone || '').slice(-10))?.code || '';
      const rootFolderName = clientCode ? `${clientDisplayName} (${clientCode})` : clientDisplayName;

      const eventsPayload = (clientEvents.length > 0
        ? clientEvents
        : [
            {
              id: 0,
              eventName: 'Main Event',
              date: new Date().toISOString().slice(0, 10),
              assignments: [],
            } as unknown as ProjectEvent,
          ]
      ).map((ev) => {
        const locked = getEventLockedPhotographers(ev);
        return {
          eventId: ev.id,
          eventName: (ev.eventName || 'Event').trim(),
          eventDate: ev.date,
          photographers: locked.map((m) => ({
            memberId: m.id,
            memberName: m.name,
            roleLabel: resolveMemberEventRoleId(m, ev) || m.role,
          })),
        };
      });

      const res = await window.api.galleryCreateIngestFolderTree({
        rootName: rootFolderName,
        clientId: selectedClient.id,
        clientName: clientDisplayName,
        clientCode,
        events: eventsPayload,
      });

      if (!res || !res.rootPath) {
        return;
      }

      localStorage.setItem(`baawaray_ingest_root_${selectedClient.id}`, res.rootPath);
      setCreatedTreePath(res.rootPath);
      setStatusBanner(
        `Created ${res.createdFoldersCount} folders at "${res.rootPath}". Copy each photographer's data into their folder, then click "2. Data Copied — Scan, Log & Upload".`
      );
      showToast(`Folder structure created for ${clientDisplayName}`);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to create folder tree.');
    } finally {
      setIsWorking(false);
    }
  };

  /**
   * SCENARIO 1 (Step 2) & SCENARIO 2: Scan Client Tree (`<Client>/<Event>/<Photographer>`)
   */
  const handleScanClientTree = async (useSavedPath: boolean): Promise<void> => {
    if (!selectedClient) return;
    setErrorBanner(null);
    setStatusBanner(null);
    setIsWorking(true);

    try {
      const pathToScan = useSavedPath && createdTreePath ? createdTreePath : undefined;
      const scan = await window.api.galleryScanIngestPath('client_tree', pathToScan);
      if (!scan || !scan.rootPath || scan.events.length === 0) {
        if (scan?.rootPath) {
          setErrorBanner('No event or photographer subfolders found in the selected folder.');
        }
        return;
      }

      localStorage.setItem(`baawaray_ingest_root_${selectedClient.id}`, scan.rootPath);
      setCreatedTreePath(scan.rootPath);
      setScannedRootPath(scan.rootPath);

      const mapped = mapScanResultToClient(scan, 'client_tree');
      setMappedEventsScan(mapped);

      const totalFilesFound = mapped.reduce(
        (sum, e) => sum + e.photographers.reduce((s, p) => s + p.totalFiles, 0),
        0
      );
      if (totalFilesFound === 0) {
        setStatusBanner(
          `Scanned "${scan.rootPath}" — folders are ready, but 0 media files were found inside the photographer folders yet.`
        );
      } else {
        setStatusBanner(
          `Scanned ${mapped.length} event folder(s) (${totalFilesFound.toLocaleString()} files, ${scan.totalGb} GB). Review mapping below and click "Log All Photographers (WhatsApp) & Start AI Upload".`
        );
      }
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : 'Failed to scan client folder structure.'
      );
    } finally {
      setIsWorking(false);
    }
  };

  /**
   * SCENARIO 3: Scan Single Event Folder containing Multiple Photographer Subfolders
   */
  const handleScanScenario3EventFolder = async (): Promise<void> => {
    if (!selectedClient || !activeEvent) return;
    setErrorBanner(null);
    setStatusBanner(null);
    setIsWorking(true);

    try {
      const scan = await window.api.galleryScanIngestPath('event_folder');
      if (!scan || !scan.rootPath || scan.events.length === 0) return;

      setScannedRootPath(scan.rootPath);
      const mapped = mapScanResultToClient(scan, 'event_folder', activeEvent);
      setMappedEventsScan(mapped);

      const totalFilesFound = mapped.reduce(
        (sum, e) => sum + e.photographers.reduce((s, p) => s + p.totalFiles, 0),
        0
      );
      setStatusBanner(
        `Scanned "${scan.rootPath}" for ${activeEvent.eventName}: ${
          mapped[0]?.photographers.length || 0
        } photographer subfolder(s) (${totalFilesFound.toLocaleString()} files, ${scan.totalGb} GB).`
      );
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to scan event folder.');
    } finally {
      setIsWorking(false);
    }
  };

  /**
   * Executes Data Logging + WhatsApp Confirmation + Multi-Event Batch Upload
   * for all included rows in `mappedEventsScan`.
   */
  const handleExecuteBatchLogAndUpload = async (): Promise<void> => {
    if (!selectedClient) return;
    setErrorBanner(null);
    setIsWorking(true);

    try {
      const { gallery, eventSceneMap } = await ensureClientGalleryAndEventScenes(
        selectedClient,
        clientEvents
      );

      const groups: GalleryBatchUploadGroup[] = [];
      let loggedCount = 0;

      for (const evScan of mappedEventsScan) {
        const studioEvent = clientEvents.find((e) => e.id === evScan.matchedEventId);
        let targetScene = eventSceneMap.get(evScan.matchedEventId);

        if (!targetScene) {
          const fallbackName =
            studioEvent?.eventName || evScan.matchedEventName || evScan.eventFolderName;
          const existing = (gallery.scenes || []).find(
            (s) => normalizeName(s.name) === normalizeName(fallbackName)
          );
          if (existing) {
            targetScene = { id: existing.id, name: existing.name };
          } else {
            const created = await window.api.galleryCreateScene(gallery.id, fallbackName);
            targetScene = { id: String(created.id), name: String(created.name || fallbackName) };
          }
        }

        for (const pScan of evScan.photographers) {
          if (!pScan.include || pScan.totalFiles === 0) continue;

          // 1. Immediately log data to Studio OS (which also dispatches the WhatsApp Cloud API confirmation)
          if (evScan.matchedEventId && pScan.matchedPhotographerId) {
            await studio.updateProjectDataLog(
              evScan.matchedEventId,
              pScan.matchedPhotographerId,
              Math.max(0.01, pScan.dataGb),
              pScan.totalFiles
            );
            loggedCount++;
          }

          // 2. Queue files into the Event Scene tab (merged for client view; photographer kept internal)
          groups.push({
            sceneId: targetScene.id,
            sceneName: targetScene.name,
            studioEventId: evScan.matchedEventId || undefined,
            photographerId: pScan.matchedPhotographerId || undefined,
            photographerName: pScan.matchedPhotographerName || undefined,
            filePaths: pScan.filePaths,
          });
        }
      }

      if (groups.length === 0) {
        setErrorBanner('No photographer folders with media files are selected to upload.');
        return;
      }

      onSelectScene(groups[0].sceneId);

      await window.api.galleryStartBatchUpload({
        galleryId: gallery.id,
        groups,
        autoTranscode,
        isAutoplayLoop: autoplayLoop,
      });

      setMappedEventsScan([]);
      setStatusBanner(
        `Logged data & sent WhatsApp confirmation to ${loggedCount} locked photographer(s). Uploading all photos into ${groups.length} event stream(s)!`
      );
      showToast(`Logged ${loggedCount} photographer(s) & started AI Gallery Upload!`);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to log data and start upload.');
    } finally {
      setIsWorking(false);
    }
  };

  /**
   * SCENARIO 4: Instant 1-Photographer Direct Upload (Folder or Files)
   * Immediately logs data to Studio OS, sends WhatsApp to locked photographer, and uploads to Event tab.
   */
  const handleInstantSinglePhotographerUpload = async (
    pickMode: 'single_photographer' | 'single_files',
    overrideEvent?: ProjectEvent,
    overridePhotographer?: TeamMember
  ): Promise<void> => {
    const targetClient = selectedClient;
    const targetEvent = overrideEvent || activeEvent;
    const targetPhotographer =
      overridePhotographer ||
      activeEventPhotographers.find((m) => m.id === selectedPhotographerId) ||
      allStudioPhotographers.find((m) => m.id === selectedPhotographerId) ||
      activeEventPhotographers[0];

    if (!targetClient || !targetEvent || !targetPhotographer) {
      setErrorBanner('Please select a Booked Client, Event, and Locked Photographer first.');
      return;
    }

    setErrorBanner(null);
    setStatusBanner(null);
    setIsWorking(true);

    try {
      const scan = await window.api.galleryScanIngestPath(pickMode);
      const scannedGroup = scan?.singlePhotographer || scan?.events[0]?.photographers[0];
      if (!scan || !scannedGroup || scannedGroup.totalFiles === 0) {
        if (scan?.rootPath) {
          setErrorBanner('No supported photo or video files were found in your selection.');
        }
        return;
      }

      const { gallery, eventSceneMap } = await ensureClientGalleryAndEventScenes(
        targetClient,
        clientEvents
      );

      let targetScene = eventSceneMap.get(targetEvent.id);
      if (!targetScene) {
        const created = await window.api.galleryCreateScene(
          gallery.id,
          targetEvent.eventName || 'Main Event'
        );
        targetScene = {
          id: String(created.id),
          name: String(created.name || targetEvent.eventName || 'Main Event'),
        };
      }

      const numericGb = Math.max(0.01, parseFloat(String(scannedGroup.dataGb)) || 0.01);

      // 1. Immediately log photographer's data & send WhatsApp confirmation
      await studio.updateProjectDataLog(
        targetEvent.id,
        targetPhotographer.id,
        numericGb,
        scannedGroup.totalFiles
      );

      onSelectScene(targetScene.id);

      // 2. Start upload directly into the Event Scene tab
      await window.api.galleryStartBatchUpload({
        galleryId: gallery.id,
        groups: [
          {
            sceneId: targetScene.id,
            sceneName: targetScene.name,
            studioEventId: targetEvent.id,
            photographerId: targetPhotographer.id,
            photographerName: targetPhotographer.name,
            filePaths: scannedGroup.filePaths,
          },
        ],
        autoTranscode,
        isAutoplayLoop: autoplayLoop,
      });

      setStatusBanner(
        `Logged ${scannedGroup.dataGb} GB (${scannedGroup.totalFiles.toLocaleString()} files) for ${
          targetPhotographer.name
        } on ${targetEvent.eventName}, dispatched WhatsApp confirmation, and started uploading to "${
          targetScene.name
        }"!`
      );
      showToast(`Logged ${scannedGroup.dataGb} GB for ${targetPhotographer.name} & started upload!`);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Instant photographer upload failed.');
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="bg-[#141310] border border-[#E8A317]/35 rounded-2xl p-5 space-y-5 shadow-xl">
      {/* Header Row: Booked Client Sync & Client View Privacy Guarantee */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#D6D0C6]/15">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-[#E8A317] text-black">
              <Sparkles size={12} />
              Studio OS Smart Ingest & Data Logger
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              <ShieldCheck size={12} />
              Client View: Event Tabs Only (Photographer Folders Hidden)
            </span>
          </div>
          <p className="text-xs text-[#FBFAF7]/65">
            Automatically detects booked clients, events & locked photographers — logs GB + file counts to Studio OS, sends WhatsApp confirmation to the photographer, and merges photos into client Event tabs.
          </p>
        </div>

        {/* Booked Client Selector + Auto-Sync Gallery Tabs Button */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 bg-[#1A1814] border border-[#D6D0C6]/30 rounded-xl px-3 py-1.5">
            <Calendar size={14} className="text-[#E8A317] shrink-0" />
            <div className="text-[10px] uppercase tracking-wider text-[#FBFAF7]/50 font-semibold">
              Booked Client
            </div>
            <select
              value={selectedClient?.id ?? ''}
              onChange={(e) => {
                const nextId = Number(e.target.value);
                setSelectedClientId(nextId);
                const c = bookedClients.find((x) => x.id === nextId);
                if (c) {
                  const cNorm = normalizeName(c.couple || c.name);
                  const matchingGallery =
                    galleries.find((g) => g.studioClientId === c.id) ||
                    galleries.find((g) => {
                      const gNorm = normalizeName(g.clientName || g.title);
                      return (
                        gNorm &&
                        (gNorm === cNorm || gNorm.includes(cNorm) || cNorm.includes(gNorm))
                      );
                    });
                  if (matchingGallery) {
                    onSelectGallery(matchingGallery.id);
                  }
                }
              }}
              disabled={isUploading || isWorking}
              className="bg-transparent text-xs font-semibold text-[#FBFAF7] focus:outline-none cursor-pointer pr-2"
            >
              {bookedClients.map((c) => {
                const evCount = getClientEvents(c, studio.projects || []).length;
                return (
                  <option key={c.id} value={c.id} className="bg-[#1A1814] text-[#FBFAF7]">
                    {c.couple || c.name} ({evCount} {evCount === 1 ? 'Event' : 'Events'})
                  </option>
                );
              })}
            </select>
          </div>

          {selectedClient && (
            <button
              type="button"
              onClick={async () => {
                setIsWorking(true);
                try {
                  const { gallery } = await ensureClientGalleryAndEventScenes(
                    selectedClient,
                    clientEvents
                  );
                  showToast(
                    `Synced "${gallery.clientName}" gallery with ${clientEvents.length} event tab(s)!`
                  );
                } catch (err) {
                  setErrorBanner(
                    err instanceof Error ? err.message : 'Failed to sync client gallery tabs.'
                  );
                } finally {
                  setIsWorking(false);
                }
              }}
              disabled={isUploading || isWorking}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#1A1814] hover:bg-[#25221B] text-[#E8A317] border border-[#E8A317]/40 transition-colors cursor-pointer"
              title="Ensure Client Gallery & Event Scene Tabs exist for this Booked Client"
            >
              <Layers size={13} />
              <span>Sync Event Tabs</span>
            </button>
          )}
        </div>
      </div>

      {/* Live Booked Events & Locked Photographers Data Log Status Strip */}
      {selectedClient && clientEvents.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#FBFAF7]/60">
              Booked Events & Locked Photographers ({selectedClient.couple || selectedClient.name})
            </span>
            <span className="text-[11px] text-[#FBFAF7]/45">
              Click any photographer to instant-upload & log their data
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {clientEvents.map((ev) => {
              const lockedPhotographers = getEventLockedPhotographers(ev);
              return (
                <div
                  key={ev.id}
                  className="bg-[#1A1814] border border-[#D6D0C6]/15 rounded-xl p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-bold text-[#FBFAF7]">{ev.eventName}</span>
                      <span className="text-[11px] text-[#FBFAF7]/50 ml-2">
                        {formatDate(ev.date, 'short')}
                      </span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#E8A317]/15 text-[#E8A317] font-medium">
                      {lockedPhotographers.length}{' '}
                      {lockedPhotographers.length === 1 ? 'Photographer' : 'Photographers'}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {lockedPhotographers.map((member) => {
                      const logEntry = (ev.dataLogs || []).find(
                        (l) => Number(l.teamMemberId) === Number(member.id)
                      );
                      const isLogged = Boolean(logEntry?.copied);
                      return (
                        <div
                          key={member.id}
                          className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-xs ${
                            isLogged
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                              : 'bg-[#141310] border-[#D6D0C6]/15 text-[#FBFAF7]/85'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold truncate flex items-center gap-1.5">
                              <Camera size={12} className="text-[#E8A317] shrink-0" />
                              <span className="truncate">{member.name}</span>
                            </div>
                            {isLogged && logEntry ? (
                              <div className="text-[10px] text-emerald-300/90 flex items-center gap-1 mt-0.5">
                                <CheckCircle2 size={10} />
                                <span>
                                  {logEntry.dataGb} GB •{' '}
                                  {Number(logEntry.fileCount || 0).toLocaleString()} files • WhatsApp Sent
                                </span>
                              </div>
                            ) : (
                              <div className="text-[10px] text-amber-300/80 mt-0.5">
                                Awaiting Data Log & Upload
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setActiveScenario('scenario_4');
                              setSelectedEventId(ev.id);
                              setSelectedPhotographerId(member.id);
                              void handleInstantSinglePhotographerUpload(
                                'single_photographer',
                                ev,
                                member
                              );
                            }}
                            disabled={isUploading || isWorking}
                            className="px-2.5 py-1 rounded-md bg-[#E8A317] hover:bg-[#F4BA38] text-black font-bold text-[10px] shrink-0 transition-colors cursor-pointer"
                            title={`Select folder to upload & log data for ${member.name} on ${ev.eventName}`}
                          >
                            {isLogged ? 'Add / Re-Upload' : 'Upload & Log'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4 Scenario Selector Tabs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-1">
        <button
          type="button"
          onClick={() => {
            setActiveScenario('scenario_1');
            setMappedEventsScan([]);
            setErrorBanner(null);
          }}
          className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
            activeScenario === 'scenario_1'
              ? 'bg-[#E8A317]/15 border-[#E8A317] text-[#FBFAF7] shadow-md'
              : 'bg-[#1A1814] border-[#D6D0C6]/20 text-[#FBFAF7]/70 hover:text-[#FBFAF7] hover:border-[#D6D0C6]/40'
          }`}
        >
          <div className="flex items-center gap-2 font-bold text-xs text-[#E8A317]">
            <FolderPlus size={14} />
            <span>Scenario 1: App Creates Folders</span>
          </div>
          <p className="text-[11px] text-[#FBFAF7]/60 mt-1">
            App creates <code className="text-[#E8A317]">Client/Event/Photographer</code> folders → you copy data → click to log & upload.
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveScenario('scenario_2');
            setMappedEventsScan([]);
            setErrorBanner(null);
          }}
          className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
            activeScenario === 'scenario_2'
              ? 'bg-[#E8A317]/15 border-[#E8A317] text-[#FBFAF7] shadow-md'
              : 'bg-[#1A1814] border-[#D6D0C6]/20 text-[#FBFAF7]/70 hover:text-[#FBFAF7] hover:border-[#D6D0C6]/40'
          }`}
        >
          <div className="flex items-center gap-2 font-bold text-xs text-[#E8A317]">
            <FolderSearch size={14} />
            <span>Scenario 2: Existing Client Tree</span>
          </div>
          <p className="text-[11px] text-[#FBFAF7]/60 mt-1">
            Guide app to an existing <code className="text-[#E8A317]">Client/Event/Photographer</code> folder on disk.
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveScenario('scenario_3');
            setMappedEventsScan([]);
            setErrorBanner(null);
          }}
          className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
            activeScenario === 'scenario_3'
              ? 'bg-[#E8A317]/15 border-[#E8A317] text-[#FBFAF7] shadow-md'
              : 'bg-[#1A1814] border-[#D6D0C6]/20 text-[#FBFAF7]/70 hover:text-[#FBFAF7] hover:border-[#D6D0C6]/40'
          }`}
        >
          <div className="flex items-center gap-2 font-bold text-xs text-[#E8A317]">
            <FolderOpen size={14} />
            <span>Scenario 3: Single Event Folder</span>
          </div>
          <p className="text-[11px] text-[#FBFAF7]/60 mt-1">
            Select an <code className="text-[#E8A317]">Event</code> folder containing Photographer 1 & Photographer 2 subfolders.
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveScenario('scenario_4');
            setMappedEventsScan([]);
            setErrorBanner(null);
          }}
          className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
            activeScenario === 'scenario_4'
              ? 'bg-[#E8A317]/15 border-[#E8A317] text-[#FBFAF7] shadow-md'
              : 'bg-[#1A1814] border-[#D6D0C6]/20 text-[#FBFAF7]/70 hover:text-[#FBFAF7] hover:border-[#D6D0C6]/40'
          }`}
        >
          <div className="flex items-center gap-2 font-bold text-xs text-[#E8A317]">
            <UserCheck size={14} />
            <span>Scenario 4: 1-Photographer Instant</span>
          </div>
          <p className="text-[11px] text-[#FBFAF7]/60 mt-1">
            Pick Event + Locked Photographer and upload 1 photographer’s data directly.
          </p>
        </button>
      </div>

      {/* Status / Error Alerts */}
      {errorBanner && (
        <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle size={15} className="text-rose-400 shrink-0" />
            <span>{errorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="text-rose-300 hover:text-white text-xs font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {statusBanner && (
        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
            <span>{statusBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-emerald-300 hover:text-white text-xs font-semibold"
          >
            OK
          </button>
        </div>
      )}

      {/* Active Scenario Action Box */}
      <div className="bg-[#1A1814] border border-[#D6D0C6]/20 rounded-xl p-4 space-y-4">
        {activeScenario === 'scenario_1' && selectedClient && (
          <div className="space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-[#FBFAF7]">
                  Scenario 1: App-Generated Folder Structure ({selectedClient.couple || selectedClient.name})
                </h4>
                <p className="text-xs text-[#FBFAF7]/60">
                  Step 1 creates <code className="text-[#E8A317]">{selectedClient.couple || selectedClient.name} / &lt;Event Name&gt; / &lt;Photographer Name&gt;</code> on your Mac. Copy each photographer’s memory card into their folder, then click Step 2.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCreateScenario1FolderTree()}
                  disabled={isUploading || isWorking}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#E8A317] hover:bg-[#F4BA38] text-black font-bold text-xs shadow-lg shadow-[#E8A317]/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  <FolderPlus size={15} />
                  <span>1. Create Folder Structure on Mac</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleScanClientTree(true)}
                  disabled={isUploading || isWorking}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#9B2226] hover:bg-[#B82B30] text-white font-bold text-xs shadow-lg shadow-[#9B2226]/30 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isWorking ? <RefreshCw size={15} className="animate-spin" /> : <Upload size={15} />}
                  <span>2. Data Copied — Scan, Log & Upload</span>
                </button>
              </div>
            </div>

            {createdTreePath && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#141310] border border-[#D6D0C6]/15 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <HardDrive size={14} className="text-[#E8A317] shrink-0" />
                  <span className="text-[#FBFAF7]/60">Active Client Folder:</span>
                  <code className="text-[#E8A317] truncate">{createdTreePath}</code>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void window.api.openPath(createdTreePath)}
                    className="flex items-center gap-1 text-[#E8A317] hover:underline font-semibold"
                  >
                    <ExternalLink size={12} />
                    <span>Open in Finder</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleScanClientTree(false)}
                    className="text-[#FBFAF7]/60 hover:text-white underline"
                  >
                    Change Folder...
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeScenario === 'scenario_2' && selectedClient && (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-[#FBFAF7]">
                Scenario 2: Guide App to Pre-Existing Client Folder Structure
              </h4>
              <p className="text-xs text-[#FBFAF7]/60">
                Select your existing <code className="text-[#E8A317]">&lt;Client&gt; / &lt;Event&gt; / &lt;Photographer&gt;</code> root folder. The app will auto-match events and locked photographers, log GB & file counts, and upload.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void handleScanClientTree(false)}
              disabled={isUploading || isWorking}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#E8A317] hover:bg-[#F4BA38] text-black font-bold text-xs shadow-lg shadow-[#E8A317]/20 transition-all cursor-pointer shrink-0 disabled:opacity-50"
            >
              <FolderSearch size={15} />
              <span>Locate Existing Client Folder...</span>
            </button>
          </div>
        )}

        {activeScenario === 'scenario_3' && selectedClient && (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-[#FBFAF7]">
                Scenario 3: Upload Single Event Folder Containing Photographer Subfolders
              </h4>
              <p className="text-xs text-[#FBFAF7]/60">
                Pick which Booked Event this folder belongs to, then select the Event folder containing <code className="text-[#E8A317]">Photographer 1</code>, <code className="text-[#E8A317]">Photographer 2</code> subfolders.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <select
                value={activeEvent?.id ?? ''}
                onChange={(e) => setSelectedEventId(Number(e.target.value))}
                disabled={isUploading || isWorking}
                className="bg-[#141310] border border-[#D6D0C6]/30 rounded-xl px-3 py-2 text-xs text-[#FBFAF7] font-semibold focus:outline-none focus:border-[#E8A317]"
              >
                {clientEvents.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    Event: {ev.eventName} ({formatDate(ev.date, 'short')})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => void handleScanScenario3EventFolder()}
                disabled={isUploading || isWorking || !activeEvent}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#E8A317] hover:bg-[#F4BA38] text-black font-bold text-xs shadow-lg shadow-[#E8A317]/20 transition-all cursor-pointer disabled:opacity-50"
              >
                <FolderOpen size={15} />
                <span>Select &ldquo;{activeEvent?.eventName || 'Event'}&rdquo; Folder...</span>
              </button>
            </div>
          </div>
        )}

        {activeScenario === 'scenario_4' && selectedClient && (
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-[#FBFAF7]">
                Scenario 4: Instant 1-Photographer Direct Upload & Data Log
              </h4>
              <p className="text-xs text-[#FBFAF7]/60">
                Select the Booked Event and Locked Photographer below, then pick their folder or photos to immediately log data (WhatsApp sent automatically) and upload into the Event tab.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Event Selector */}
              <select
                value={activeEvent?.id ?? ''}
                onChange={(e) => setSelectedEventId(Number(e.target.value))}
                disabled={isUploading || isWorking}
                className="bg-[#141310] border border-[#D6D0C6]/30 rounded-xl px-3 py-2 text-xs text-[#FBFAF7] font-semibold focus:outline-none focus:border-[#E8A317]"
              >
                {clientEvents.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    Event: {ev.eventName} ({formatDate(ev.date, 'short')})
                  </option>
                ))}
              </select>

              {/* Locked Photographer Selector */}
              <select
                value={selectedPhotographerId ?? ''}
                onChange={(e) => setSelectedPhotographerId(Number(e.target.value))}
                disabled={isUploading || isWorking}
                className="bg-[#141310] border border-[#E8A317]/50 rounded-xl px-3 py-2 text-xs text-[#E8A317] font-semibold focus:outline-none focus:border-[#E8A317]"
              >
                <optgroup label={`Locked Photographers (${activeEvent?.eventName || 'Event'})`}>
                  {activeEventPhotographers.map((m) => (
                    <option key={m.id} value={m.id}>
                      📸 {m.name} ({resolveMemberEventRoleId(m, activeEvent || undefined) || m.role})
                    </option>
                  ))}
                </optgroup>
                {allStudioPhotographers.length > activeEventPhotographers.length && (
                  <optgroup label="All Studio Photographers">
                    {allStudioPhotographers
                      .filter((m) => !activeEventPhotographers.some((lp) => lp.id === m.id))
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.role})
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>

              <button
                type="button"
                onClick={() => void handleInstantSinglePhotographerUpload('single_photographer')}
                disabled={isUploading || isWorking || !activeEvent}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#E8A317] hover:bg-[#F4BA38] text-black font-bold text-xs shadow-lg shadow-[#E8A317]/20 transition-all cursor-pointer disabled:opacity-50"
              >
                <FolderOpen size={14} />
                <span>Select Photographer Folder & Upload</span>
              </button>

              <button
                type="button"
                onClick={() => void handleInstantSinglePhotographerUpload('single_files')}
                disabled={isUploading || isWorking || !activeEvent}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#9B2226] hover:bg-[#B82B30] text-white font-bold text-xs shadow-lg shadow-[#9B2226]/25 transition-all cursor-pointer disabled:opacity-50"
              >
                <ImageIcon size={14} />
                <span>Select Photos & Upload</span>
              </button>
            </div>
          </div>
        )}

        {/* Scanned Folder Mapping Preview Table (for Scenarios 1, 2, 3) */}
        {mappedEventsScan.length > 0 && (
          <div className="pt-3 border-t border-[#D6D0C6]/15 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-[#FBFAF7] flex items-center gap-2">
                <span>Scanned Folder Mapping Preview</span>
                <span className="text-[11px] font-normal text-[#FBFAF7]/50">
                  ({scannedRootPath})
                </span>
              </div>

              <button
                type="button"
                onClick={() => void handleExecuteBatchLogAndUpload()}
                disabled={isUploading || isWorking}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#E8A317] to-[#F4BA38] text-black font-bold text-xs shadow-lg shadow-[#E8A317]/25 hover:brightness-110 transition-all cursor-pointer disabled:opacity-50"
              >
                <Send size={14} />
                <span>Log All Photographers (WhatsApp) & Start AI Upload</span>
              </button>
            </div>

            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {mappedEventsScan.map((evScan, evIdx) => {
                const matchedEvObj = clientEvents.find((e) => e.id === evScan.matchedEventId);
                const eventCandidates = getEventLockedPhotographers(matchedEvObj);

                return (
                  <div
                    key={`${evScan.eventFolderPath}-${evIdx}`}
                    className="bg-[#141310] border border-[#D6D0C6]/20 rounded-xl p-3 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#D6D0C6]/10">
                      <div className="flex items-center gap-2 text-xs">
                        <FolderOpen size={14} className="text-[#E8A317]" />
                        <span className="font-mono text-[#FBFAF7]/80">{evScan.eventFolderName}</span>
                        <ChevronRight size={13} className="text-[#FBFAF7]/40" />
                        <span className="text-[11px] text-[#FBFAF7]/50">Maps to Client Event Tab:</span>
                        <select
                          value={evScan.matchedEventId}
                          onChange={(e) => {
                            const nextEvId = Number(e.target.value);
                            const nextEv = clientEvents.find((x) => x.id === nextEvId);
                            setMappedEventsScan((prev) =>
                              prev.map((item, idx) =>
                                idx === evIdx
                                  ? {
                                      ...item,
                                      matchedEventId: nextEvId,
                                      matchedEventName: nextEv?.eventName || item.eventFolderName,
                                    }
                                  : item
                              )
                            );
                          }}
                          className="bg-[#1A1814] border border-[#E8A317]/40 rounded-lg px-2.5 py-1 text-xs text-[#E8A317] font-semibold"
                        >
                          {clientEvents.map((ce) => (
                            <option key={ce.id} value={ce.id}>
                              {ce.eventName} ({formatDate(ce.date, 'short')})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {evScan.photographers.map((pScan, pIdx) => (
                        <div
                          key={`${pScan.folderPath}-${pIdx}`}
                          className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#1A1814] border border-[#D6D0C6]/15 text-xs"
                        >
                          <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={pScan.include}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setMappedEventsScan((prev) =>
                                  prev.map((item, idx) =>
                                    idx === evIdx
                                      ? {
                                          ...item,
                                          photographers: item.photographers.map((p, pi) =>
                                            pi === pIdx ? { ...p, include: checked } : p
                                          ),
                                        }
                                      : item
                                  )
                                );
                              }}
                              className="w-3.5 h-3.5 accent-[#E8A317] rounded"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="font-mono text-[11px] text-[#FBFAF7]/80 truncate">
                                📁 {pScan.folderName}
                              </div>
                              <div className="text-[10px] text-emerald-400 font-semibold">
                                {pScan.totalFiles.toLocaleString()} files • {pScan.dataGb} GB
                              </div>
                            </div>
                          </label>

                          <select
                            value={pScan.matchedPhotographerId}
                            onChange={(e) => {
                              const nextPid = Number(e.target.value);
                              const nextMember =
                                eventCandidates.find((m) => m.id === nextPid) ||
                                allStudioPhotographers.find((m) => m.id === nextPid);
                              setMappedEventsScan((prev) =>
                                prev.map((item, idx) =>
                                  idx === evIdx
                                    ? {
                                        ...item,
                                        photographers: item.photographers.map((p, pi) =>
                                          pi === pIdx
                                            ? {
                                                ...p,
                                                matchedPhotographerId: nextPid,
                                                matchedPhotographerName:
                                                  nextMember?.name || p.folderName,
                                              }
                                            : p
                                        ),
                                      }
                                    : item
                                )
                              );
                            }}
                            className="bg-[#141310] border border-[#D6D0C6]/30 rounded-lg px-2 py-1 text-[11px] text-[#FBFAF7] max-w-[180px]"
                          >
                            <optgroup label="Locked on Event">
                              {eventCandidates.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="All Photographers">
                              {allStudioPhotographers
                                .filter((m) => !eventCandidates.some((ec) => ec.id === m.id))
                                .map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.name}
                                  </option>
                                ))}
                            </optgroup>
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
