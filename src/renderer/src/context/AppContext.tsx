import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { collection, collectionGroup, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { createFreelanceJob } from '../lib/studioRepository';
import { cloudErrorMessage } from '../utils/cloudErrors';
import type { Client, FreelanceClient, FreelanceJob, ProjectEvent, TeamMember, StudioSettingsConfig, StudioPriceList } from '../types';

interface UploaderSettings { keepPercentDefault?: number; photosPerSheet?: number; excludedBillingFolders?: string[]; countPhotoPairsOnce?: boolean; keepAwake?: boolean }
interface AppContextType {
  currentUser: { id: string; name: string; accountType: 'owner' | 'team' };
  clients: Client[]; freelanceClients: FreelanceClient[]; freelanceJobs: FreelanceJob[]; team: TeamMember[]; projects: ProjectEvent[];
  studioSettings: (Partial<StudioSettingsConfig> & { uploader?: UploaderSettings }) | null;
  studioPriceList: Partial<StudioPriceList> | null; loading: boolean; error: string;
  addFreelanceJob: typeof createFreelanceJob;
}
const AppContext = createContext<AppContextType | null>(null);
export function AppProvider({ children, uid, isOwner }: { children: ReactNode; uid: string; isOwner: boolean }) {
  const [tables, setTables] = useState<Record<string, any[]>>({});
  const [config, setConfig] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setTables({}); setConfig(null); setError('');
    const fail = (err: Error): void => setError(`Studio sync: ${cloudErrorMessage(err)}`);
    const unsubs: (() => void)[] = [];

    // Team and Projects are globally readable by any signed-in team member
    unsubs.push(onSnapshot(collection(db, 'team'), snapshot => {
      setTables(old => ({ ...old, team: snapshot.docs.map(d => ({ ...d.data(), id: d.data().id ?? d.id, _documentId: d.id })) }));
    }, fail));

    unsubs.push(onSnapshot(collection(db, 'projects'), snapshot => {
      setTables(old => ({ ...old, projects: snapshot.docs.map(d => ({ ...d.data(), id: d.data().id ?? d.id, _documentId: d.id })) }));
    }, fail));

    if (isOwner) {
      unsubs.push(onSnapshot(collection(db, 'clients'), snapshot => {
        setTables(old => ({ ...old, clients: snapshot.docs.map(d => ({ ...d.data(), id: d.data().id ?? d.id, _documentId: d.id })) }));
      }, fail));

      unsubs.push(onSnapshot(collection(db, 'freelance_clients'), snapshot => {
        setTables(old => ({ ...old, freelance_clients: snapshot.docs.map(d => ({ ...d.data(), id: d.data().id ?? d.id, _documentId: d.id })) }));
      }, fail));

      unsubs.push(onSnapshot(collection(db, 'freelance_jobs'), snapshot => {
        setTables(old => ({ ...old, freelance_jobs: snapshot.docs.map(d => ({ ...d.data(), id: d.data().id ?? d.id, _documentId: d.id })) }));
      }, fail));

      for (const name of ['billing', 'editor', 'private']) {
        unsubs.push(onSnapshot(collectionGroup(db, name), snapshot => {
          setTables(old => ({ ...old, [name]: snapshot.docs.filter(d => d.id === 'main').map(d => ({ ...d.data(), _parentId: d.ref.parent.parent?.id })) }));
        }, err => console.warn(`Owner sync warning for ${name}:`, err)));
      }
    } else {
      // Editor / Team account: Query freelance_jobs scoped by editorAuthUid matching firestore.rules
      const jobsQuery = query(collection(db, 'freelance_jobs'), where('editorAuthUid', '==', uid));
      unsubs.push(onSnapshot(jobsQuery, snapshot => {
        setTables(old => ({ ...old, freelance_jobs: snapshot.docs.map(d => ({ ...d.data(), id: d.data().id ?? d.id, _documentId: d.id })) }));
      }, fail));

      const editorQuery = query(collectionGroup(db, 'editor'), where('editorAuthUid', '==', uid));
      unsubs.push(onSnapshot(editorQuery, snapshot => {
        setTables(old => ({ ...old, editor: snapshot.docs.filter(d => d.id === 'main').map(d => ({ ...d.data(), _parentId: d.ref.parent.parent?.id })) }));
      }, err => console.warn('Editor sync warning:', err)));
    }

    unsubs.push(onSnapshot(doc(db, 'studio_config', 'main'), snapshot => {
      const data = snapshot.data() || {};
      setConfig(data);
      const dbx = data.studioSettings?.dropbox;
      if (dbx?.refreshToken || dbx?.accessToken) {
        void window.api.connectDropbox(dbx).catch(err => console.warn('Dropbox connect error:', err));
      }
      const b2 = data.studioSettings?.b2;
      if (b2?.keyId && b2?.applicationKey && b2?.bucketName) {
        void window.api.connectB2(b2).catch(err => console.warn('B2 connect error:', err));
      }
    }, fail));
    return () => unsubs.forEach(unsubscribe => unsubscribe());
  }, [uid, isOwner]);
  const value = useMemo<AppContextType>(() => {
    const merge = (rows: any[], halves: any[][]): any[] => rows.map(row => Object.assign({}, row, ...halves.map(half => half.find(h => h._parentId === row._documentId) || {})));
    const isReady = isOwner ? (Object.keys(tables).length >= 8 && config !== null) : (tables.team && tables.freelance_jobs && config !== null);
    return { currentUser: { id: uid, name: isOwner ? (config?.ownerConfig?.name || 'Studio Owner') : (tables.team?.find((t: any) => t.authUid === uid)?.name || 'Team Member'), accountType: isOwner ? 'owner' : 'team' as const },
      clients: tables.clients || [], freelanceClients: tables.freelance_clients || [],
      freelanceJobs: merge(tables.freelance_jobs || [], [tables.billing || [], tables.editor || []]),
      team: merge(tables.team || [], [tables.private || []]), projects: tables.projects || [],
      studioSettings: config?.studioSettings || null, studioPriceList: config?.studioPriceList || null,
      loading: !isReady, error, addFreelanceJob: createFreelanceJob };
  }, [tables, config, uid, error, isOwner]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
export function useApp(): AppContextType { const ctx = useContext(AppContext); if (!ctx) throw new Error('Studio provider is missing.'); return ctx; }
