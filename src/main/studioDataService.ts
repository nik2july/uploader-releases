import {
  STUDIO_WEB_APP_CLIENTS,
  categorizeStudioDeliverable,
  getStandardVideoDeliverables,
  getStandardPhotoDeliverables
} from '../shared/studioClients';
import type { StudioClientData, StudioDeliverableItem } from '../shared/contracts';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const FIREBASE_CONFIG = {
  projectId: 'gen-lang-client-0103594672',
  appId: '1:874505280538:web:77070e05c7ca0b6fe1c5a3',
  apiKey: 'AIzaSyAId-I4yspn-1QOB1oWoss59Mcb1BsAz8Q',
  authDomain: 'gen-lang-client-0103594672.firebaseapp.com',
  firestoreDatabaseId: 'ai-studio-baawaraystudioos-d9f461e7-6135-4ba6-8a9d-454346cd8ab7',
  storageBucket: 'gen-lang-client-0103594672.firebasestorage.app',
  messagingSenderId: '874505280538'
};

export class StudioDataService {
  private static storePath: string = '';
  private static clientDeliverablesStore: Record<
    string,
    { video: StudioDeliverableItem[]; photo: StudioDeliverableItem[] }
  > = {};
  private static isSyncing: boolean = false;

  public static init(storageDir: string): void {
    this.storePath = path.join(storageDir, 'client_deliverables.json');
    void this.loadStore().then(() => {
      // Background non-blocking sync on app start
      void this.syncFromFirestore().catch(err => {
        console.warn('[StudioDataService] Background sync error (using local cache):', err?.message);
      });
    });
  }

  private static async loadStore(): Promise<void> {
    try {
      if (this.storePath && existsSync(this.storePath)) {
        const raw = await fs.readFile(this.storePath, 'utf8');
        this.clientDeliverablesStore = JSON.parse(raw);
      }
    } catch (err) {
      console.warn('[StudioDataService] Could not load client deliverables store:', err);
    }
  }

  private static async persistStore(): Promise<void> {
    try {
      if (this.storePath) {
        await fs.mkdir(path.dirname(this.storePath), { recursive: true });
        await fs.writeFile(
          this.storePath,
          JSON.stringify(this.clientDeliverablesStore, null, 2),
          'utf8'
        );
      }
    } catch (err) {
      console.warn('[StudioDataService] Could not save client deliverables store:', err);
    }
  }

  public static async getClients(): Promise<StudioClientData[]> {
    return STUDIO_WEB_APP_CLIENTS.map(c => {
      const stored =
        this.clientDeliverablesStore[c.name] ||
        this.clientDeliverablesStore[c.id] ||
        this.clientDeliverablesStore[c.name.toLowerCase()];

      const videoDeliverables = stored?.video ?? c.videoDeliverables ?? [];
      const photoDeliverables = stored?.photo ?? c.photoDeliverables ?? [];

      return {
        ...c,
        videoDeliverables:
          videoDeliverables.length > 0
            ? videoDeliverables
            : c.videoDeliverables?.length
            ? c.videoDeliverables
            : getStandardVideoDeliverables(c.name),
        photoDeliverables:
          photoDeliverables.length > 0
            ? photoDeliverables
            : c.photoDeliverables?.length
            ? c.photoDeliverables
            : getStandardPhotoDeliverables(c.name)
      };
    });
  }

  public static async getClientDeliverables(
    clientNameOrId: string
  ): Promise<{ videoDeliverables: StudioDeliverableItem[]; photoDeliverables: StudioDeliverableItem[] }> {
    const clients = await this.getClients();
    const query = clientNameOrId.trim().toLowerCase();

    // Direct store check first
    const stored =
      this.clientDeliverablesStore[clientNameOrId] ||
      this.clientDeliverablesStore[query];
    if (stored && (stored.video?.length > 0 || stored.photo?.length > 0)) {
      return {
        videoDeliverables: stored.video,
        photoDeliverables: stored.photo
      };
    }

    const found = clients.find(
      c =>
        c.name.toLowerCase() === query ||
        c.id === clientNameOrId ||
        c.name.toLowerCase().replace(/[^a-z0-9]/g, '') === query.replace(/[^a-z0-9]/g, '')
    );

    if (found) {
      return {
        videoDeliverables: found.videoDeliverables || [],
        photoDeliverables: found.photoDeliverables || []
      };
    }

    return {
      videoDeliverables: getStandardVideoDeliverables(clientNameOrId),
      photoDeliverables: getStandardPhotoDeliverables(clientNameOrId)
    };
  }

  public static async saveClientDeliverables(
    clientNameOrId: string,
    videoDeliverables: StudioDeliverableItem[],
    photoDeliverables: StudioDeliverableItem[]
  ): Promise<boolean> {
    this.clientDeliverablesStore[clientNameOrId] = {
      video: videoDeliverables,
      photo: photoDeliverables
    };
    this.clientDeliverablesStore[clientNameOrId.toLowerCase()] = {
      video: videoDeliverables,
      photo: photoDeliverables
    };
    await this.persistStore();
    return true;
  }

  public static async updateDeliverableStatus(
    clientName: string,
    deliverableId: string,
    updates: Partial<StudioDeliverableItem>
  ): Promise<StudioDeliverableItem | null> {
    const { videoDeliverables, photoDeliverables } = await this.getClientDeliverables(clientName);
    const target = videoDeliverables.find(
      d => d.id === deliverableId || d.title.toLowerCase().includes(deliverableId.toLowerCase())
    );
    if (target) {
      Object.assign(target, updates);
      await this.saveClientDeliverables(clientName, videoDeliverables, photoDeliverables);
      return target;
    }
    return null;
  }

  /**
   * Syncs real client quotation deliverables live from Studio OS Cloud Firestore
   */
  public static async syncFromFirestore(): Promise<{ ok: boolean; count: number; error?: string }> {
    if (this.isSyncing) {
      return { ok: true, count: 0 };
    }
    this.isSyncing = true;

    try {
      const app = getApps().length > 0 ? getApp() : initializeApp(FIREBASE_CONFIG);
      const auth = getAuth(app);

      // Authenticate with Studio Owner shadow account
      await signInWithEmailAndPassword(
        auth,
        '9888928886@baawaray-auth.internal',
        'Iphone17@805'
      );

      const db = getFirestore(app, FIREBASE_CONFIG.firestoreDatabaseId);
      const snap = await getDocs(collection(db, 'clients'));

      let syncedCount = 0;

      snap.docs.forEach(doc => {
        const d = doc.data() as any;
        let name = d.name || d.couple || d.coupleName || doc.id;
        if (name === 'Dhanur & Janvi') {
          name = 'Dhanur & Jhanvi';
        }

        const rawDeliverables: any[] = d.deliverables || [];
        const existingStored =
          this.clientDeliverablesStore[name] ||
          this.clientDeliverablesStore[name.toLowerCase()] ||
          this.clientDeliverablesStore[doc.id] ||
          { video: [], photo: [] };

        const video: StudioDeliverableItem[] = [];
        const photo: StudioDeliverableItem[] = [];

        rawDeliverables.forEach((item: any, idx: number) => {
          const type = categorizeStudioDeliverable(item.title, item.category);
          const isRawBasis =
            item.linkedRoleId === 'svc-1787641157353' ||
            (item.title && item.title.toLowerCase().includes('raw'));
          const isLongForm =
            item.linkedRoleId === 'svc-1787641157353' || /film/i.test(item.title);

          let note = item.notes || '';
          if (isLongForm && isRawBasis) {
            note = 'Long Form · Raw footage basis';
          }

          // Match against any already saved local item to preserve renderFilePath, dropboxShareUrl, currentCut
          const prevVideo = existingStored.video?.find(
            (v: StudioDeliverableItem) =>
              v.id === item.id || v.title.toLowerCase() === (item.title || '').toLowerCase()
          );
          const prevPhoto = existingStored.photo?.find(
            (p: StudioDeliverableItem) =>
              p.id === item.id || p.title.toLowerCase() === (item.title || '').toLowerCase()
          );

          const delivItem: StudioDeliverableItem = {
            id: item.id || `deliv_${doc.id}_${idx}`,
            title: item.title,
            category: type,
            status:
              item.status === 'delivered'
                ? 'delivered'
                : item.status === 'in-progress'
                ? 'in_progress'
                : 'todo',
            format:
              type === 'video'
                ? prevVideo?.format ||
                  (item.title.toLowerCase().includes('reel')
                    ? '9:16 Vertical'
                    : item.title.toLowerCase().includes('trailer')
                    ? '16:9 4K Cinema'
                    : '16:9 4K Master')
                : undefined,
            currentCut: prevVideo?.currentCut || 'Cut 1',
            renderFilePath: prevVideo?.renderFilePath || '',
            dropboxShareUrl: prevVideo?.dropboxShareUrl || '',
            notes: note || prevVideo?.notes || prevPhoto?.notes || ''
          };

          if (type === 'video') {
            video.push(delivItem);
          } else {
            photo.push(delivItem);
          }
        });

        // Store by multiple keys for resilient lookups
        this.clientDeliverablesStore[name] = { video, photo };
        this.clientDeliverablesStore[name.toLowerCase()] = { video, photo };
        this.clientDeliverablesStore[String(d.id || doc.id)] = { video, photo };
        syncedCount++;
      });

      await this.persistStore();
      console.log(
        `[StudioDataService] Successfully synced ${syncedCount} clients live from Studio OS Firestore!`
      );
      return { ok: true, count: syncedCount };
    } catch (err: any) {
      console.warn('[StudioDataService] Firestore live sync warning:', err?.message || err);
      return { ok: false, count: 0, error: err?.message || 'Sync failed' };
    } finally {
      this.isSyncing = false;
    }
  }
}
