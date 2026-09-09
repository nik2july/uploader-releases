import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { collection, collectionGroup, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { createFreelanceJob } from '../lib/studioRepository';
import type { Client, FreelanceClient, FreelanceJob, ProjectEvent, TeamMember, StudioSettingsConfig, StudioPriceList } from '../types';

interface UploaderSettings { keepPercentDefault?: number; photosPerSheet?: number; excludedBillingFolders?: string[]; countPhotoPairsOnce?: boolean; keepAwake?: boolean }
interface AppContextType {
  currentUser: { id: string; name: string; accountType: 'owner' };
  clients: Client[]; freelanceClients: FreelanceClient[]; freelanceJobs: FreelanceJob[]; team: TeamMember[]; projects: ProjectEvent[];
  studioSettings: (Partial<StudioSettingsConfig> & { uploader?: UploaderSettings }) | null;
  studioPriceList: Partial<StudioPriceList> | null; loading: boolean; error: string;
  addFreelanceJob: typeof createFreelanceJob;
}
const AppContext = createContext<AppContextType | null>(null);
export function AppProvider({ children, ownerUid }: { children: ReactNode; ownerUid: string }) {
  const [tables, setTables] = useState<Record<string, any[]>>({});
  const [config, setConfig] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setTables({}); setConfig(null); setError('');
    const fail = (err: Error): void => setError(`Studio sync: ${err.message}`);
    const listeners = ['clients', 'freelance_clients', 'freelance_jobs', 'team', 'projects'].map(name => onSnapshot(collection(db, name), snapshot => {
      setTables(old => ({ ...old, [name]: snapshot.docs.map(d => ({ ...d.data(), id: d.data().id ?? d.id, _documentId: d.id })) }));
    }, fail));
    for (const name of ['billing', 'editor', 'private']) listeners.push(onSnapshot(collectionGroup(db, name), snapshot => {
      setTables(old => ({ ...old, [name]: snapshot.docs.filter(d => d.id === 'main').map(d => ({ ...d.data(), _parentId: d.ref.parent.parent?.id })) }));
    }, fail));
    listeners.push(onSnapshot(doc(db, 'studio_config', 'main'), snapshot => setConfig(snapshot.data() || {}), fail));
    return () => listeners.forEach(unsubscribe => unsubscribe());
  }, [ownerUid]);
  const value = useMemo<AppContextType>(() => {
    const merge = (rows: any[], halves: any[][]): any[] => rows.map(row => Object.assign({}, row, ...halves.map(half => half.find(h => h._parentId === row._documentId) || {})));
    return { currentUser: { id: ownerUid, name: config?.ownerConfig?.name || 'Studio Owner', accountType: 'owner' },
      clients: tables.clients || [], freelanceClients: tables.freelance_clients || [],
      freelanceJobs: merge(tables.freelance_jobs || [], [tables.billing || [], tables.editor || []]),
      team: merge(tables.team || [], [tables.private || []]), projects: tables.projects || [],
      studioSettings: config?.studioSettings || null, studioPriceList: config?.studioPriceList || null,
      loading: Object.keys(tables).length < 8 || config === null, error, addFreelanceJob: createFreelanceJob };
  }, [tables, config, ownerUid, error]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
export function useApp(): AppContextType { const ctx = useContext(AppContext); if (!ctx) throw new Error('Studio provider is missing.'); return ctx; }
