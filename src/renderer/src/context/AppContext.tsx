import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { collection, collectionGroup, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  createFreelanceJob,
  updateFreelanceJob,
  deleteFreelanceJob,
  createPartnerStudio,
  updatePartnerStudio,
  deleteFreelanceClient,
  advanceStage,
  logRevision,
  markRevisionShared,
  addFreelanceClientPayment,
  addFreelanceEditorPayout,
  addFreelanceAccountPayment,
  deleteFreelanceAccountPayment,
  addFreelanceEditorPayoutRecord,
  deleteFreelanceEditorPayoutRecord,
  createTeamMember,
  updateTeamMember,
} from '../lib/studioRepository';
import { cloudErrorMessage } from '../utils/cloudErrors';
import { buildStudioAccount, buildEditorAccount, StudioAccount, EditorAccount } from '../utils/freelanceAccount';
import { detectDialCode, DEFAULT_DIAL_CODE } from '../utils/phone';
import type {
  Client,
  FreelanceClient,
  FreelanceJob,
  FreelanceJobStage,
  FreelancePaymentRecord,
  FreelanceLedgerPayment,
  FreelanceEditorPayout,
  FreelanceJobRequest,
  ProjectEvent,
  TeamMember,
  StudioSettingsConfig,
  StudioPriceList,
} from '../types';

interface UploaderSettings {
  keepPercentDefault?: number;
  photosPerSheet?: number;
  excludedBillingFolders?: string[];
  countPhotoPairsOnce?: boolean;
  keepAwake?: boolean;
  /** Which cloud raw footage uploads to. Hardened to Google Drive. */
  destination?: 'drive';
  sharedDriveId?: string;
  sharedDriveLink?: string;
}

export interface AppContextType {
  currentUser: { id: string; name: string; accountType: 'owner' | 'team' };
  clients: Client[];
  freelanceClients: FreelanceClient[];
  freelanceJobs: FreelanceJob[];
  freelanceJobRequests: FreelanceJobRequest[];
  team: TeamMember[];
  projects: ProjectEvent[];
  studioSettings: (Partial<StudioSettingsConfig> & { uploader?: UploaderSettings }) | null;
  studioPriceList: Partial<StudioPriceList> | null;
  projectCodes: Array<{ key: string; code: string; name?: string; phone?: string; clientIds?: string[]; leadIds?: string[] }>;
  updateProjectDataLog: (projectId: number, memberId: number, dataGb: string | number, fileCount: string | number) => Promise<void>;
  loading: boolean;
  error: string;

  // Freelance mutations
  addFreelanceJob: typeof createFreelanceJob;
  updateFreelanceJob: (id: string, updates: Partial<FreelanceJob>, logAction?: string) => Promise<void>;
  deleteFreelanceJob: (id: string) => Promise<void>;
  advanceFreelanceJobStage: (jobId: string, stage: FreelanceJobStage, detail?: string) => Promise<void>;
  addFreelanceRevision: (
    jobId: string,
    revisionData: { feedbackNotes: string; timecodes?: string; sharedWithEditor?: boolean; revisionType?: 'internal' | 'client' }
  ) => Promise<void>;
  addFreelanceClientPayment: (
    jobId: string,
    payment: Omit<FreelancePaymentRecord, 'id' | 'createdAt'>
  ) => Promise<void>;
  addFreelanceEditorPayout: (
    jobId: string,
    payout: Omit<FreelancePaymentRecord, 'id' | 'createdAt'>
  ) => Promise<void>;

  // Partner studio mutations
  addFreelanceClient: (client: Omit<FreelanceClient, 'id' | 'createdAt'>) => FreelanceClient;
  updateFreelanceClient: (id: string, updates: Partial<FreelanceClient>) => void;
  deleteFreelanceClient: (id: string) => Promise<void>;
  addFreelanceAccountPayment: (
    clientId: string,
    payment: Omit<FreelanceLedgerPayment, 'id' | 'createdAt'>
  ) => Promise<void>;
  deleteFreelanceAccountPayment: (clientId: string, paymentId: string) => Promise<void>;

  // Editor payout records
  addFreelanceEditorPayoutRecord: (
    memberId: number | string,
    payout: Omit<FreelanceEditorPayout, 'id' | 'createdAt'>
  ) => Promise<void>;
  deleteFreelanceEditorPayoutRecord: (memberId: number | string, payoutId: string) => Promise<void>;

  // Team member mutations
  addTeamMember: (data: Omit<TeamMember, 'id'>) => Promise<TeamMember>;
  updateTeamMember: (id: number, data: Partial<TeamMember>) => Promise<void>;

  // Accounting helpers
  freelanceJobPayment: (job: FreelanceJob) => { paid: number; balance: number };
  freelanceJobEditorCost: (job: FreelanceJob) => number;
  freelanceAccounts: Map<string, StudioAccount>;
  freelanceEditorAccounts: Map<number, EditorAccount>;
  pushFreelanceJobRequest: (request: Partial<FreelanceJobRequest>) => void;

  // Selected state / navigation
  selectedFreelanceJobId: string | null;
  setSelectedFreelanceJobId: (id: string | null) => void;
  selectedFreelanceClientId: string | null;
  setSelectedFreelanceClientId: (id: string | null) => void;
  selectedFreelanceEditorId: number | null;
  setSelectedFreelanceEditorId: (id: number | null) => void;
  activeView: string;
  setActiveView: (view: string) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children, uid, isOwner }: { children: ReactNode; uid: string; isOwner: boolean }) {
  const [tables, setTables] = useState<Record<string, any[]>>({});
  const [config, setConfig] = useState<any>(null);
  const [error, setError] = useState('');

  // Selected navigation state
  const [selectedFreelanceJobId, setSelectedFreelanceJobId] = useState<string | null>(null);
  const [selectedFreelanceClientId, setSelectedFreelanceClientId] = useState<string | null>(null);
  const [selectedFreelanceEditorId, setSelectedFreelanceEditorId] = useState<number | null>(null);
  const [activeView, setActiveView] = useState<string>('freelance');

  useEffect(() => {
    setTables({});
    setConfig(null);
    setError('');
    const fail = (err: Error): void => setError(`Studio sync: ${cloudErrorMessage(err)}`);
    const unsubs: (() => void)[] = [];

    // Team and Projects are globally readable by any signed-in team member
    unsubs.push(
      onSnapshot(
        collection(db, 'team'),
        snapshot => {
          setTables(old => ({
            ...old,
            team: snapshot.docs.map(d => ({ ...d.data(), id: d.data().id ?? d.id, _documentId: d.id })),
          }));
        },
        fail
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'projects'),
        snapshot => {
          setTables(old => ({
            ...old,
            projects: snapshot.docs.map(d => ({ ...d.data(), id: d.data().id ?? d.id, _documentId: d.id })),
          }));
        },
        fail
      )
    );

    if (isOwner) {
      unsubs.push(
        onSnapshot(
          collection(db, 'clients'),
          snapshot => {
            setTables(old => ({
              ...old,
              clients: snapshot.docs.map(d => ({ ...d.data(), id: d.data().id ?? d.id, _documentId: d.id })),
            }));
          },
          fail
        )
      );

      unsubs.push(
        onSnapshot(
          collection(db, 'freelance_clients'),
          snapshot => {
            setTables(old => ({
              ...old,
              freelance_clients: snapshot.docs.map(d => ({ ...d.data(), id: d.data().id ?? d.id, _documentId: d.id })),
            }));
          },
          fail
        )
      );

      unsubs.push(
        onSnapshot(
          collection(db, 'freelance_jobs'),
          snapshot => {
            setTables(old => ({
              ...old,
              freelance_jobs: snapshot.docs.map(d => ({ ...d.data(), id: d.data().id ?? d.id, _documentId: d.id })),
            }));
          },
          fail
        )
      );

      unsubs.push(
        onSnapshot(
          collection(db, 'project_codes'),
          snapshot => setTables(old => ({
            ...old,
            project_codes: snapshot.docs.map(d => ({ ...d.data(), key: d.id })),
          })),
          fail
        )
      );

      for (const name of ['billing', 'editor', 'private']) {
        unsubs.push(
          onSnapshot(
            collectionGroup(db, name),
            snapshot => {
              setTables(old => ({
                ...old,
                [name]: snapshot.docs.filter(d => d.id === 'main').map(d => ({
                  ...d.data(),
                  _parentId: d.ref.parent.parent?.id,
                })),
              }));
            },
            err => console.warn(`Owner sync warning for ${name}:`, err)
          )
        );
      }
    } else {
      // Editor / Team account: Query freelance_jobs scoped by editorAuthUid matching firestore.rules
      const jobsQuery = query(collection(db, 'freelance_jobs'), where('editorAuthUid', '==', uid));
      unsubs.push(
        onSnapshot(
          jobsQuery,
          snapshot => {
            setTables(old => ({
              ...old,
              freelance_jobs: snapshot.docs.map(d => ({ ...d.data(), id: d.data().id ?? d.id, _documentId: d.id })),
            }));
          },
          fail
        )
      );

      const editorQuery = query(collectionGroup(db, 'editor'), where('editorAuthUid', '==', uid));
      unsubs.push(
        onSnapshot(
          editorQuery,
          snapshot => {
            setTables(old => ({
              ...old,
              editor: snapshot.docs.filter(d => d.id === 'main').map(d => ({
                ...d.data(),
                _parentId: d.ref.parent.parent?.id,
              })),
            }));
          },
          err => console.warn('Editor sync warning:', err)
        )
      );
    }

    unsubs.push(
      onSnapshot(
        doc(db, 'studio_config', 'main'),
        snapshot => {
          const data = snapshot.data() || {};
          setConfig(data);
          const dbx = data.studioSettings?.dropbox;
          if (dbx?.refreshToken || dbx?.accessToken) {
            void window.api.connectDropbox(dbx).catch(err => console.warn('Dropbox connect error:', err));
          }
        },
        fail
      )
    );

    return () => unsubs.forEach(unsubscribe => unsubscribe());
  }, [uid, isOwner]);

  const value = useMemo<AppContextType>(() => {
    const merge = (rows: any[], halves: any[][]): any[] =>
      rows.map(row =>
        Object.assign(
          {},
          row,
          ...halves.map(half => half.find(h => h._parentId === (row._documentId || row.id)) || {})
        )
      );

    const mergedJobs: FreelanceJob[] = merge(tables.freelance_jobs || [], [tables.billing || [], tables.editor || []]);
    const mergedTeam: TeamMember[] = merge(tables.team || [], [tables.private || []]);
    const clientsList: Client[] = tables.clients || [];
    const freelanceClientsList: FreelanceClient[] = (tables.freelance_clients || []).map(c => {
      const det = detectDialCode(c.phone, c.dialCode);
      return { ...c, dialCode: det.dialCode || c.dialCode || DEFAULT_DIAL_CODE, phone: det.nationalNumber || c.phone };
    });
    const projectsList: ProjectEvent[] = tables.projects || [];
    const projectCodesList = (tables.project_codes || []) as AppContextType['projectCodes'];

    const updateProjectDataLog = async (projectId: number, memberId: number, dataGb: string | number, fileCount: string | number): Promise<void> => {
      const existing = projectsList.find(project => Number(project.id) === Number(projectId));
      if (!existing) throw new Error('Event not found. Refresh the client tools and try again.');
      const logs = [...(existing.dataLogs || [])];
      const nextLog = {
        teamMemberId: memberId,
        dataGb,
        fileCount,
        copied: true,
        receivedAt: new Date().toISOString(),
      };
      const index = logs.findIndex(log => Number(log.teamMemberId) === Number(memberId));
      if (index >= 0) logs[index] = { ...logs[index], ...nextLog };
      else logs.push(nextLog);
      const assigned = existing.assignments || [];
      const allReceived = assigned.length === 0 || assigned.every(id => logs.some(log => Number(log.teamMemberId) === Number(id) && Boolean(log.receivedAt)));
      await setDoc(doc(db, 'projects', String(existing.id)), {
        ...existing,
        dataLogs: logs,
        dataCopied: true,
        dataReceived: allReceived,
        dataReceivedAt: allReceived ? new Date().toISOString() : existing.dataReceivedAt || null,
      }, { merge: true });
    };

    const isReady = isOwner
      ? Object.keys(tables).length >= 8 && config !== null
      : Boolean(tables.team && tables.freelance_jobs && config !== null);

    // Studio Accounts ledger map
    const freelanceAccounts = new Map<string, StudioAccount>();
    freelanceClientsList.forEach(client => {
      freelanceAccounts.set(
        client.id,
        buildStudioAccount(
          mergedJobs.filter(j => j.freelanceClientId === client.id),
          client.payments || []
        )
      );
    });

    const freelanceJobPayment = (job: FreelanceJob): { paid: number; balance: number } => {
      const allocation = job.freelanceClientId
        ? freelanceAccounts.get(job.freelanceClientId)?.allocations.get(job.id)
        : undefined;
      if (allocation) return { paid: allocation.paid, balance: allocation.balance };
      const paid = Number(job.clientPaidAmount) || 0;
      return { paid, balance: Math.max(0, (Number(job.clientCharge) || 0) - paid) };
    };

    // Editor Accounts ledger map
    const freelanceEditorAccounts = new Map<number, EditorAccount>();
    mergedTeam.forEach(member => {
      freelanceEditorAccounts.set(Number(member.id), buildEditorAccount(member.freelancePayouts || []));
    });

    const freelanceJobEditorCost = (job: FreelanceJob): number => {
      if (job.editorMemberId === undefined) return Number(job.editorPay) || 0;
      const account = freelanceEditorAccounts.get(Number(job.editorMemberId));
      if (!account) return Number(job.editorPay) || 0;
      return account.costByJob.get(job.id) || 0;
    };

    const advanceFreelanceJobStage = async (
      jobId: string,
      stage: FreelanceJobStage,
      detail?: string
    ): Promise<void> => {
      await advanceStage(jobId, stage, detail || `Stage moved to ${stage}`);
    };

    const addFreelanceRevision = async (
      jobId: string,
      revisionData: { feedbackNotes: string; timecodes?: string; sharedWithEditor?: boolean; revisionType?: 'internal' | 'client' }
    ): Promise<void> => {
      await logRevision(jobId, revisionData.feedbackNotes, revisionData.timecodes, revisionData.revisionType);
      if (revisionData.sharedWithEditor) {
        await markRevisionShared(jobId);
      }
    };

    const addFreelanceClient = (client: Omit<FreelanceClient, 'id' | 'createdAt'>): FreelanceClient => {
      const ref = doc(collection(db, 'freelance_clients'));
      const newClient: FreelanceClient = {
        ...client,
        id: ref.id,
        name: client.name?.trim() || '',
        contactPerson: client.contactPerson?.trim() || '',
        phone: client.phone?.trim() || '',
        email: client.email?.trim() || '',
        city: client.city?.trim() || '',
        active: client.active !== false,
        createdAt: new Date().toISOString().slice(0, 10),
      };
      void setDoc(ref, newClient).catch(err => console.error('Failed to create partner studio:', err));
      return newClient;
    };

    const updateFreelanceClientWrapper = (id: string, updates: Partial<FreelanceClient>): void => {
      if (!id) return;
      void updatePartnerStudio(id, updates).catch(err => console.error('Failed to update partner studio:', err));
    };

    const pushFreelanceJobRequest = (request: Partial<FreelanceJobRequest>): void => {
      console.log('Freelance job request received:', request);
    };

    const updateTeamMemberWrapper = async (id: number, data: Partial<TeamMember>): Promise<void> => {
      setTables(old => ({
        ...old,
        team: (old.team || []).map((m: any) => (m.id === id ? { ...m, ...data } : m)),
      }));
      await updateTeamMember(id, data);
    };

    return {
      currentUser: {
        id: uid,
        name: isOwner
          ? config?.ownerConfig?.name || 'Studio Owner'
          : tables.team?.find((t: any) => t.authUid === uid)?.name || 'Team Member',
        accountType: isOwner ? 'owner' : ('team' as const),
      },
      clients: clientsList,
      freelanceClients: freelanceClientsList,
      freelanceJobs: mergedJobs,
      freelanceJobRequests: [],
      team: mergedTeam,
      projects: projectsList,
      studioSettings: config?.studioSettings || null,
      studioPriceList: config?.studioPriceList || null,
      projectCodes: projectCodesList,
      updateProjectDataLog,
      loading: !isReady,
      error,

      // Actions
      addFreelanceJob: createFreelanceJob,
      updateFreelanceJob,
      deleteFreelanceJob,
      advanceFreelanceJobStage,
      addFreelanceRevision,
      addFreelanceClientPayment,
      addFreelanceEditorPayout,
      addFreelanceClient,
      updateFreelanceClient: updateFreelanceClientWrapper,
      deleteFreelanceClient,
      addFreelanceAccountPayment,
      deleteFreelanceAccountPayment,
      addFreelanceEditorPayoutRecord,
      deleteFreelanceEditorPayoutRecord,
      addTeamMember: createTeamMember,
      updateTeamMember: updateTeamMemberWrapper,

      freelanceJobPayment,
      freelanceJobEditorCost,
      freelanceAccounts,
      freelanceEditorAccounts,
      pushFreelanceJobRequest,

      selectedFreelanceJobId,
      setSelectedFreelanceJobId,
      selectedFreelanceClientId,
      setSelectedFreelanceClientId,
      selectedFreelanceEditorId,
      setSelectedFreelanceEditorId,
      activeView,
      setActiveView,
    };
  }, [
    tables,
    config,
    uid,
    error,
    isOwner,
    selectedFreelanceJobId,
    selectedFreelanceClientId,
    selectedFreelanceEditorId,
    activeView,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('Studio provider is missing.');
  return ctx;
}
