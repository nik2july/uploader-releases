import { collection, doc, runTransaction, setDoc, writeBatch, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { shouldFileIntoPostProduction } from '../utils/postProduction';
import { chargeForDeliverable, pricingForDeliverable } from '../utils/deliverablePricing';
import { measurementsFromScan } from '../utils/rawDataLog';
import { resolvePostProductionServices, type PostProductionService } from '../utils/postProductionServices';
import { db } from './firebase';
import { splitFreelanceRecord } from './freelanceSchema';
import { derivePaymentStatus } from '../utils/freelance';
import type {
  FreelanceJob,
  FreelanceClient,
  ClientDeliverable,
  TeamMember,
  FreelancePaymentRecord,
  FreelanceLedgerPayment,
  FreelanceEditorPayout,
  FreelanceActivityLog,
  CrewRoleConfig,
} from '../types';
import type { FreelanceDoubt } from '../types/freelance';
import type { InvoiceSnapshot, Transfer, WorkTarget } from '../../../shared/contracts';

const clean = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
export async function createFreelanceJob(job: Partial<FreelanceJob>): Promise<string> {
  if (!job.title?.trim() || !job.serviceType || (!job.freelanceClientId && !job.clientName?.trim())) {
    throw new Error('Choose a partner studio or client, service and title.');
  }
  const ref = doc(collection(db, 'freelance_jobs'));
  const now = new Date();
  const data = { ...job, id: ref.id, jobCode: `FL-${now.getFullYear()}-D${ref.id.slice(0, 8).toUpperCase()}`,
    createdAt: now.toISOString().slice(0, 10), dataReceivedDate: now.toISOString().slice(0, 10), stage: 'data_received',
    clientCharge: job.clientCharge || 0, clientPaidAmount: 0, clientPaymentStatus: 'unpaid', clientPayments: [],
    editorPay: 0, editorPaidAmount: 0, editorPaymentStatus: 'unpaid', editorPayouts: [], revisions: [],
    activityLogs: [{ id: crypto.randomUUID(), timestamp: now.toISOString(), action: 'Created in desktop uploader', actor: 'Studio Owner' }] };
  const halves = splitFreelanceRecord(clean(data));
  const batch = writeBatch(db);
  batch.set(ref, halves.publicHalf); batch.set(doc(ref, 'billing', 'main'), halves.billingHalf); batch.set(doc(ref, 'editor', 'main'), halves.editorHalf);
  await batch.commit(); return ref.id;
}

export async function createPartnerStudio(input: { name: string; contactPerson?: string; phone: string; email?: string; city?: string; rateCard: Record<string, number> }): Promise<string> {
  if (!input.name.trim()) throw new Error('Enter the partner studio name.');
  const ref = doc(collection(db, 'freelance_clients'));
  await setDoc(ref, clean({ id: ref.id, name: input.name.trim(), contactPerson: input.contactPerson?.trim() || '', phone: input.phone.trim(), email: input.email?.trim() || '', city: input.city?.trim() || '', rateCard: input.rateCard, active: true, createdAt: new Date().toISOString().slice(0, 10) }));
  return ref.id;
}

export async function updatePartnerStudio(id: string, input: Partial<FreelanceClient>): Promise<void> {
  if (!id) throw new Error('Client ID is required.');
  await setDoc(doc(db, 'freelance_clients', id), clean(input), { merge: true });
}

/**
 * The studio's own work, as a partner studio of Post Production.
 *
 * Post Production treats BAAWARAY FILMS like any other studio it takes work
 * from, so it needs a record on the roster. The id is fixed rather than
 * generated: a second one added by hand from Add Studio would split the same
 * studio's jobs across two rows that never add up.
 *
 * Idempotent — a merge of the same three fields — so calling it on every open
 * costs one small write and keeps the roster right even on a fresh install.
 */
export const BAAWARAY_FILMS_STUDIO_ID = 'internal_baawaray_films';

/**
 * What Post Production sells, as this studio has configured it.
 *
 * Read here rather than threaded in, because the functions that file work are
 * called from uploads, drive handovers and scans alike, and none of those has the
 * studio's settings to hand. One document read per filing, which is rare enough
 * to be free — and reading it fresh means a service added a minute ago is sold.
 */
async function studioPostProductionServices(): Promise<PostProductionService[]> {
  const settings = (await getDoc(doc(db, 'studio_config', 'main'))).data()?.studioSettings;
  return resolvePostProductionServices(settings?.crewRoles);
}

export async function ensureBaawarayFilmsStudio(): Promise<string> {
  await setDoc(doc(db, 'freelance_clients', BAAWARAY_FILMS_STUDIO_ID), clean({
    id: BAAWARAY_FILMS_STUDIO_ID, name: 'BAAWARAY FILMS', phone: '', active: true,
    createdAt: new Date().toISOString().slice(0, 10),
    notes: 'The studio\'s own work. Deliverables filed here become Post Production jobs.',
  }), { merge: true });
  return BAAWARAY_FILMS_STUDIO_ID;
}

/** Creates linked Post Production projects from a BAAWARAY FILMS deliverable. */
export async function sendBaawarayDeliverableToPostProduction(
  clientId: string,
  deliverable: ClientDeliverable,
  services: string[]
): Promise<string[]> {
  if (!clientId || !deliverable?.id || (!deliverable.rawDataLink && deliverable.rawDataSource !== 'hard_drive' && deliverable.rawDataSource !== 'upload')) {
    throw new Error('Upload raw footage to Google Drive or log hard drive handover before sending this deliverable to Post Production.');
  }
  if (services.length === 0) throw new Error('Choose at least one Post Production service.');
  const partnerId = await ensureBaawarayFilmsStudio();

  // Fetch client details to use Couple Name as project title
  const clientSnap = await getDoc(doc(db, 'clients', clientId));
  const clientData = clientSnap.exists() ? clientSnap.data() : null;
  const coupleTitle = clientData?.couple || clientData?.name || deliverable.title;
  const clientName = clientData?.name || clientData?.couple || 'BAAWARAY FILMS';
  const clientPhone = clientData?.phone || '';

  // What BAAWARAY FILMS is charged per unit. Read once: a job records the rate it
  // was billed at, so editing the card later never rewrites work already sent.
  const rateCard = ((await getDoc(doc(db, 'freelance_clients', partnerId))).data()?.rateCard || {}) as Record<string, number>;
  const measurements = {
    billableQuantity: deliverable.billableQuantity,
    rawDurationHours: deliverable.rawDurationHours,
    rawDurationMinutes: deliverable.rawDurationMinutes,
    rawPhotoCount: deliverable.rawPhotoCount,
  };

  const configured = await studioPostProductionServices();
  const ids: string[] = [];
  let charged = 0;
  for (const serviceType of services) {
    const pricing = pricingForDeliverable(serviceType, rateCard[serviceType], measurements, configured);
    const clientCharge = chargeForDeliverable(serviceType, rateCard[serviceType], measurements, configured);
    charged += clientCharge;
    ids.push(await createFreelanceJob({
      title: coupleTitle, serviceType, freelanceClientId: partnerId,
      clientName: clientName, clientPhone: clientPhone, rawDataLink: deliverable.rawDataLink,
      rawDataSource: deliverable.rawDataSource, rawDurationHours: deliverable.rawDurationHours,
      rawDurationMinutes: deliverable.rawDurationMinutes, rawPhotoCount: deliverable.rawPhotoCount,
      hardDriveNotes: deliverable.hardDriveNotes,
      hddStatus: deliverable.rawDataSource === 'hard_drive' ? 'sent_to_editor' : 'none',
      clientCharge, pricing,
      sourceCompany: 'baawaray-films', sourceClientId: String(clientId), sourceDeliverableId: deliverable.id,
      editorName: '', editorPhone: '', dueDate: deliverable.dueDate || '',
    }));
  }
  await runTransaction(db, async tx => {
    const ref = doc(db, 'clients', clientId);
    const snap = await tx.get(ref); if (!snap.exists()) throw new Error('The source client no longer exists.');
    const items = snap.data().deliverables || [];
    tx.update(ref, { deliverables: items.map((item: ClientDeliverable) => item.id === deliverable.id
      ? {
          ...item,
          postProductionJobIds: Array.from(new Set([...(item.postProductionJobIds || []), ...ids])),
          /*
           * What Post Production quoted for this work, recorded as what BAAWARAY
           * FILMS was charged for it.
           *
           * This is the only figure that crosses between the two: what the couple
           * pays BAAWARAY FILMS is its own business and Post Production never sees
           * it. Only written when something was actually priced — an unpriced job
           * leaves the figure alone rather than writing a zero that would read as
           * work done for nothing.
           */
          ...(charged > 0 ? { costPrice: (Number(item.costPrice) || 0) + charged } : {}),
        }
      : item) });
  });
  return ids;
}

/**
 * Reuse raw data (upload link, hard drive, duration measurements) from an existing
 * client deliverable onto another deliverable for the same client, and send it to
 * Post Production if appropriate.
 */
export async function reuseDeliverableRawData(
  clientId: string,
  targetDeliverableId: string,
  sourceDeliverableId: string,
  targetServiceType?: string
): Promise<string[]> {
  if (!clientId || !targetDeliverableId || !sourceDeliverableId) {
    throw new Error('Client ID and deliverable IDs are required.');
  }
  const ref = doc(db, 'clients', clientId);
  let targetDeliverable: ClientDeliverable | null = null;
  let serviceToCreate = '';
  let existingJobIds: string[] = [];

  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Client no longer exists.');
    const items = (snap.data().deliverables || []) as ClientDeliverable[];
    const source = items.find(d => d.id === sourceDeliverableId);
    const target = items.find(d => d.id === targetDeliverableId);
    if (!source) throw new Error('Source deliverable with raw data was not found.');
    if (!target) throw new Error('Target deliverable was not found.');

    const rootDeliverableId = source.reusedFromDeliverableId || source.id;
    const rootDeliverableTitle = source.reusedFromTitle || source.title;
    const rawDataLink =
      source.rawDataLink ||
      Object.values(source.desktopTransfers || {}).find((t: any) => t.link)?.link ||
      '';

    const copiedData = {
      rawDataLink,
      rawDataSource: source.rawDataSource || 'upload',
      hardDriveNotes: source.hardDriveNotes || '',
      rawDurationHours: source.rawDurationHours || 0,
      rawDurationMinutes: source.rawDurationMinutes || 0,
      rawPhotoCount: source.rawPhotoCount || 0,
      desktopTransfers: source.desktopTransfers || {},
      reusedFromDeliverableId: rootDeliverableId,
      reusedFromTitle: rootDeliverableTitle,
    };

    targetDeliverable = {
      ...target,
      ...copiedData,
    };

    serviceToCreate = (targetServiceType || target.category || target.title || '').trim();

    if ((target.postProductionJobIds || []).length > 0) {
      existingJobIds = target.postProductionJobIds!;
      tx.update(ref, {
        deliverables: items.map(d => (d.id === targetDeliverableId ? targetDeliverable : d)),
      });
      for (const jId of existingJobIds) {
        const jobRef = doc(db, 'freelance_jobs', jId);
        tx.update(jobRef, {
          rawDataLink,
          rawDataSource: source.rawDataSource || 'upload',
          rawDurationHours: source.rawDurationHours || 0,
          rawDurationMinutes: source.rawDurationMinutes || 0,
          rawPhotoCount: source.rawPhotoCount || 0,
        });
      }
      return;
    }

    tx.update(ref, {
      deliverables: items.map(d => (d.id === targetDeliverableId ? targetDeliverable : d)),
    });
  });

  if (existingJobIds.length > 0) {
    return existingJobIds;
  }

  if (targetDeliverable) {
    const service = serviceToCreate || (targetDeliverable as ClientDeliverable).title;
    return await sendBaawarayDeliverableToPostProduction(
      clientId,
      targetDeliverable,
      [service]
    );
  }
  return [];
}

export async function createExtra(clientId: string, extra: Pick<ClientDeliverable, 'title' | 'linkedRoleId' | 'sellingPrice'>): Promise<string> {
  if (!clientId || !extra.title.trim() || !extra.linkedRoleId || !Number.isFinite(extra.sellingPrice) || extra.sellingPrice! < 0) throw new Error('Choose a client and priced deliverable.');
  const id = `deliv_${crypto.randomUUID()}`;
  const ref = doc(db, 'clients', clientId);
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref); if (!snap.exists()) throw new Error('Client no longer exists.');
    tx.update(ref, { deliverables: [...(snap.data().deliverables || []), { ...extra, id, category: '', status: 'pending', isExtra: true, addedAt: new Date().toISOString() }] });
  });
  return id;
}

export async function updateClientDeliverable(
  clientId: string,
  deliverableId: string,
  updates: Partial<ClientDeliverable>
): Promise<void> {
  if (!clientId || !deliverableId) throw new Error('Client ID and deliverable ID are required.');
  const ref = doc(db, 'clients', clientId);
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Client no longer exists.');
    const items = (snap.data().deliverables || []) as ClientDeliverable[];
    const idx = items.findIndex(d => d.id === deliverableId);
    if (idx === -1) throw new Error('Deliverable was not found.');

    const updated = clean({
      ...items[idx],
      ...updates,
    });
    items[idx] = updated;
    tx.update(ref, { deliverables: items });

    // If there are linked post-production jobs, keep due date and notes synced
    if (updated.postProductionJobIds && updated.postProductionJobIds.length > 0) {
      for (const jId of updated.postProductionJobIds) {
        const jobRef = doc(db, 'freelance_jobs', jId);
        const jobUpdates: any = {};
        if (updates.dueDate !== undefined) jobUpdates.dueDate = updates.dueDate;
        if (updates.notes !== undefined) jobUpdates.editingInstructions = updates.notes;
        if (updates.title !== undefined) jobUpdates.description = updates.title;
        if (Object.keys(jobUpdates).length > 0) {
          tx.update(jobRef, clean(jobUpdates));
        }
      }
    }
  });
}

export async function deleteClientDeliverable(
  clientId: string,
  deliverableId: string
): Promise<void> {
  if (!clientId || !deliverableId) throw new Error('Client ID and deliverable ID are required.');
  const ref = doc(db, 'clients', clientId);
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Client no longer exists.');
    const items = (snap.data().deliverables || []) as ClientDeliverable[];
    const target = items.find(d => d.id === deliverableId);
    if (!target) return;

    tx.update(ref, { deliverables: items.filter(d => d.id !== deliverableId) });

    if (target.postProductionJobIds && target.postProductionJobIds.length > 0) {
      for (const jId of target.postProductionJobIds) {
        const jobRef = doc(db, 'freelance_jobs', jId);
        tx.delete(jobRef);
      }
    }
  });
}

/** Apply an explicitly reviewed billing snapshot. Upload retries never call this. */
export async function saveBilling(target: WorkTarget, invoice: InvoiceSnapshot, expectedCharge: number): Promise<InvoiceSnapshot> {
  const now = new Date().toISOString();
  return runTransaction(db, async tx => {
    if (target.kind === 'freelance') {
      const ref = doc(db, 'freelance_jobs', target.id, 'billing', 'main');
      const parent = await tx.get(doc(db, 'freelance_jobs', target.id));
      const snap = await tx.get(ref);
      if (!parent.exists()) throw new Error('Freelance job no longer exists.');
      const existing = { ...parent.data(), ...snap.data() };
      const saved = existing.desktopInvoices?.[invoice.id] as InvoiceSnapshot | undefined;
      if (saved?.status === 'issued') return saved;
      const priorCharge = Number(existing.clientCharge) || 0;
      if (priorCharge !== expectedCharge && priorCharge !== invoice.total) throw new Error('The job price changed in the web app. Refresh and review before saving.');
      if (Object.values(existing.desktopInvoices || {}).some((i: any) => i.status === 'issued')) throw new Error('This job already has an issued desktop invoice. Use a separate adjustment in the web app.');
      const pricing = invoice.calculation?.pricing;
      const paid = Number(existing.clientPaidAmount) || 0;
      tx.set(ref, clean({ clientCharge: invoice.total, ...(pricing ? { pricing, mediaBilling: invoice.calculation, keepPercent: invoice.calculation?.input.keepPercent } : {}),
        priorCharge, pricingRevisedAt: now, clientPaymentStatus: paid >= invoice.total && invoice.total > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
        desktopInvoices: { ...(existing.desktopInvoices || {}), [invoice.id]: invoice },
        activityLogs: [...(existing.activityLogs || []), { id: crypto.randomUUID(), timestamp: now, action: invoice.status === 'issued' ? 'Desktop invoice issued' : 'Desktop billing measured', details: `${invoice.number}: ${invoice.total}`, actor: 'Studio Owner' }],
      }), { merge: true });
    } else {
      const ref = doc(db, 'clients', target.clientId!); const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Client no longer exists.');
      const items = snap.data().deliverables || [];
      const item = items.find((d: ClientDeliverable) => d.id === target.id);
      if (!item) throw new Error('Deliverable no longer exists.');
      const saved = item.desktopInvoices?.[invoice.id] as InvoiceSnapshot | undefined;
      if (saved?.status === 'issued') return saved;
      const original = Number(item.sellingPrice) || 0;
      if (original !== expectedCharge && original !== invoice.total) throw new Error('The deliverable price changed. Refresh and review.');
      if ((!item.isExtra || item.extraInvoiceId) && invoice.total !== original) throw new Error('An agreed package or paid extra cannot be repriced by scanning.');
      if (Object.values(item.desktopInvoices || {}).some((i: any) => i.status === 'issued')) throw new Error('This deliverable already has an issued desktop invoice.');
      const next = { ...item, sellingPrice: invoice.total, desktopInvoices: { ...(item.desktopInvoices || {}), [invoice.id]: invoice } };
      tx.update(ref, { deliverables: clean(items.map((d: ClientDeliverable) => d.id === target.id ? next : d)) });
    }
    return invoice;
  });
}

export async function attachVerifiedTransfer(job: Transfer): Promise<void> {
  if (job.status !== 'completed' || !job.link || !job.target) throw new Error('Only verified transfers can be attached.');
  const target = job.target;
  /** Set inside the transaction, acted on after it commits. */
  let fileIntoPostProduction = false;
  const configuredServices = await studioPostProductionServices();
  const entry = { id: job.id, link: job.link, purpose: target.purpose, createdAt: job.createdAt,
    fileCount: job.scan?.fileCount || 0, bytes: job.scan?.totalBytes || 0, status: 'verified' };
  await runTransaction(db, async tx => {
    const ref = target.kind === 'freelance' ? doc(db, 'freelance_jobs', target.id) : doc(db, 'clients', target.clientId!);
    const snap = await tx.get(ref); if (!snap.exists()) throw new Error('The linked work no longer exists.');
    const record = snap.data();
    const scan = job.scan;
    const totalSec = scan?.totalDurationSeconds || 0;
    const rawDurationHours = Math.floor(totalSec / 3600);
    const rawDurationMinutes = Math.floor((totalSec % 3600) / 60);
    const rawPhotoCount = scan?.billablePhotos || scan?.totalPhotos || 0;

    if (target.kind === 'freelance') {
      const field = target.purpose === 'raw' ? 'rawDataLink' : 'deliveryLink';
      const updates: any = {
        desktopTransfers: { ...(record.desktopTransfers || {}), [job.id]: entry },
        ...(!record[field] ? { [field]: job.link } : {}),
      };
      if (target.purpose === 'raw' && scan) {
        if (rawDurationHours > 0 || rawDurationMinutes > 0) {
          updates.rawDurationHours = rawDurationHours;
          updates.rawDurationMinutes = rawDurationMinutes;
        }
        if (rawPhotoCount > 0) {
          updates.rawPhotoCount = rawPhotoCount;
        }
      }
      tx.update(ref, updates);
    } else {
      const items = record.deliverables || [];
      const deliverable = items.find((d: ClientDeliverable) => d.id === target.id);
      if (!deliverable) throw new Error('Deliverable no longer exists.');
      // Raw footage arriving is the moment this becomes Post Production's work.
      // Deciding here, rather than by sweeping the collection later, is what
      // keeps it to deliverables filed from now on: nothing existing is touched.
      fileIntoPostProduction = shouldFileIntoPostProduction(target, deliverable, configuredServices);
      const field = target.purpose === 'raw' ? 'rawDataLink' : 'link';
      const deliverableUpdates: any = {
        desktopTransfers: { ...(deliverable.desktopTransfers || {}), [job.id]: entry },
        ...(!deliverable[field] ? { [field]: job.link } : {}),
      };
      if (target.purpose === 'raw' && scan) {
        if (rawDurationHours > 0 || rawDurationMinutes > 0) {
          deliverableUpdates.rawDurationHours = rawDurationHours;
          deliverableUpdates.rawDurationMinutes = rawDurationMinutes;
        }
        if (rawPhotoCount > 0) {
          deliverableUpdates.rawPhotoCount = rawPhotoCount;
        }
      }
      tx.update(ref, { deliverables: items.map((d: any) => d.id === target.id ? { ...d, ...deliverableUpdates } : d) });
    }
  });

  if (fileIntoPostProduction) {
    // Its own step, after the transfer is safely recorded: a studio that has the
    // footage and no linked job can file it by hand, but a job that exists for
    // footage nothing recorded would be a job pointing at nothing.
    const scan = job.scan;
    const totalSec = scan?.totalDurationSeconds || 0;
    const rawDurationHours = Math.floor(totalSec / 3600);
    const rawDurationMinutes = Math.floor((totalSec % 3600) / 60);
    const rawPhotoCount = scan?.billablePhotos || scan?.totalPhotos || 0;

    await sendBaawarayDeliverableToPostProduction(target.clientId!, {
      id: target.id, title: target.title, category: target.serviceType,
      status: 'pending', rawDataLink: job.link, dueDate: target.dueDate || '',
      rawDurationHours: rawDurationHours > 0 ? rawDurationHours : undefined,
      rawDurationMinutes: rawDurationMinutes > 0 ? rawDurationMinutes : undefined,
      rawPhotoCount: rawPhotoCount > 0 ? rawPhotoCount : undefined,
    } as ClientDeliverable, [target.serviceType]);
  }
}

export async function saveUploaderSettings(settings: {
  keepPercentDefault: number;
  photosPerSheet: number;
  excludedBillingFolders: string[];
  countPhotoPairsOnce: boolean;
  keepAwake: boolean;
  destination?: 'drive';
  sharedDriveId?: string;
  sharedDriveLink?: string;
}): Promise<void> {
  if (settings.keepPercentDefault < 0 || settings.keepPercentDefault > 100 || !Number.isInteger(settings.photosPerSheet) || settings.photosPerSheet < 1 || settings.photosPerSheet > 100) throw new Error('Invalid uploader defaults.');
  await updateDoc(doc(db, 'studio_config', 'main'), { 'studioSettings.uploader': clean(settings) });
}

export async function saveDropboxSettings(config: { appKey?: string; appSecret?: string; refreshToken?: string }): Promise<void> {
  await updateDoc(doc(db, 'studio_config', 'main'), { 'studioSettings.dropbox': config });
}

export async function saveCrewRolesSettings(crewRoles: CrewRoleConfig[]): Promise<void> {
  await updateDoc(doc(db, 'studio_config', 'main'), { 'studioSettings.crewRoles': clean(crewRoles) });
}

/**
 * Assign, reassign or clear the editor on a freelance job.
 *
 * Editor identity lives in the job's `editor` half, which is where the security
 * rules let an editor read their own assignment and nowhere else — writing it
 * onto the parent document would put every editor's details in front of every
 * signed-in person. `editorAuthUid` is copied across so the rules can match a
 * listen against the job alone; it exists only once that editor has signed in.
 */
export async function assignEditor(jobId: string, member: TeamMember | null): Promise<void> {
  if (!jobId) throw new Error('No job to assign.');
  const data = clean({
    editorMemberId: member?.id ?? null,
    editorName: member?.name ?? '',
    editorPhone: member?.phone ?? '',
    editorEmail: member?.email ?? '',
    editorAuthUid: member?.authUid ?? null,
  });
  await setDoc(doc(db, 'freelance_jobs', jobId, 'editor', 'main'), data, { merge: true });
  await updateDoc(doc(db, 'freelance_jobs', jobId), {
    editorAuthUid: member?.authUid ?? null,
    editorMemberId: member?.id ?? null,
    editorName: member?.name ?? '',
    editorPhone: member?.phone ?? '',
  });
  if (member) {
    await runTransaction(db, async tx => {
      const ref = doc(db, 'freelance_jobs', jobId);
      const snap = await tx.get(ref);
      if (snap.exists() && ['pending_assignment', 'data_received'].includes(snap.data().stage)) {
        tx.update(ref, { stage: 'editor_assigned' });
      }
    });
  }
}

export async function syncEditorAuthUid(jobId: string, member: TeamMember): Promise<void> {
  if (!jobId || !member?.authUid) return;
  await updateDoc(doc(db, 'freelance_jobs', jobId), {
    editorAuthUid: member.authUid,
    editorMemberId: member.id,
    editorName: member.name || '',
    editorPhone: member.phone || '',
  });
}

export async function submitEditorDelivery(
  jobId: string,
  link: string,
  advance: boolean,
  options?: {
    revisionId?: string;
    editorNotes?: string;
    actor?: string;
  }
): Promise<void> {
  const value = link.trim();
  if (!value) throw new Error('Paste the link to your finished work.');
  if (!/^https?:\/\/\S+$/i.test(value)) throw new Error('That does not look like a link. It should start with https://');
  if (value.length > 1900) throw new Error('That link is too long to save.');

  try {
    const now = new Date();
    const snap = await getDoc(doc(db, 'freelance_jobs', jobId));
    const job = snap.exists() ? (snap.data() as FreelanceJob) : null;

    const updates: Record<string, any> = {
      deliveryLink: value,
    };

    if (advance) {
      updates.stage = 'draft_received';
      updates.draftReceivedDate = now.toISOString().slice(0, 10);
    }

    if (job && options?.revisionId && options?.editorNotes) {
      updates.revisions = (job.revisions || []).map(r =>
        r.id === options.revisionId
          ? { ...r, editorNotes: options.editorNotes!.trim(), editorFeedbackDate: now.toISOString().slice(0, 10) }
          : r
      );
    }

    if (job) {
      const newLog: FreelanceActivityLog = {
        id: `log_${Date.now()}`,
        timestamp: now.toISOString(),
        action: advance ? 'Editor delivered work for review' : 'Editor updated delivery link',
        actor: options?.actor || 'Editor',
      };
      updates.activityLogs = clean([...(job.activityLogs || []), newLog]);
    }

    await updateDoc(doc(db, 'freelance_jobs', jobId), clean(updates));
  } catch (error) {
    const code = (error as { code?: string })?.code || '';
    if (code === 'permission-denied') {
      throw new Error('The studio\'s permissions refused this. It usually means the job is no longer assigned to you, or has been settled. (permission-denied)');
    }
    if (code === 'not-found') {
      throw new Error('That job no longer exists. Refresh the page. (not-found)');
    }
    if (code === 'unavailable') {
      throw new Error('Could not reach the studio. Check your connection and try again. (unavailable)');
    }
    throw new Error(`${(error as Error)?.message || 'That could not be saved.'}${code ? ` (${code})` : ''}`);
  }
}

export async function submitEditorDoubt(
  jobId: string,
  doubt: {
    question: string;
    category?: FreelanceDoubt['category'];
    askedBy?: string;
  }
): Promise<FreelanceDoubt> {
  const q = doubt.question.trim();
  if (!q) throw new Error('Enter your question or doubt.');

  const snap = await getDoc(doc(db, 'freelance_jobs', jobId));
  if (!snap.exists()) throw new Error('That job no longer exists.');
  const job = snap.data() as FreelanceJob;

  const now = new Date();
  const newDoubt: FreelanceDoubt = {
    id: `dbt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    question: q,
    category: doubt.category || 'general',
    askedBy: doubt.askedBy || 'Editor',
    askedAt: now.toISOString().slice(0, 10),
    status: 'open',
  };

  const updatedDoubts = [...(job.doubts || []), newDoubt];
  const newLog: FreelanceActivityLog = {
    id: `log_${Date.now()}`,
    timestamp: now.toISOString(),
    action: `Editor asked query (${newDoubt.category}): ${q.slice(0, 60)}`,
    actor: doubt.askedBy || 'Editor',
  };
  const updatedLogs = [...(job.activityLogs || []), newLog];

  await updateDoc(doc(db, 'freelance_jobs', jobId), {
    doubts: clean(updatedDoubts),
    activityLogs: clean(updatedLogs),
  });

  return newDoubt;
}

export async function resolveEditorDoubt(
  jobId: string,
  doubtId: string,
  resolvedBy?: string
): Promise<void> {
  const snap = await getDoc(doc(db, 'freelance_jobs', jobId));
  if (!snap.exists()) throw new Error('That job no longer exists.');
  const job = snap.data() as FreelanceJob;

  const now = new Date();
  const updatedDoubts = (job.doubts || []).map(d =>
    d.id === doubtId ? { ...d, status: 'resolved' as const, resolvedAt: now.toISOString().slice(0, 10) } : d
  );

  const newLog: FreelanceActivityLog = {
    id: `log_${Date.now()}`,
    timestamp: now.toISOString(),
    action: `Editor marked query resolved (${doubtId})`,
    actor: resolvedBy || 'Editor',
  };
  const updatedLogs = [...(job.activityLogs || []), newLog];

  await updateDoc(doc(db, 'freelance_jobs', jobId), {
    doubts: clean(updatedDoubts),
    activityLogs: clean(updatedLogs),
  });
}

export async function submitEditorRevisionFeedback(
  jobId: string,
  revisionId: string,
  editorNotes: string,
  actor?: string
): Promise<void> {
  const snap = await getDoc(doc(db, 'freelance_jobs', jobId));
  if (!snap.exists()) throw new Error('That job no longer exists.');
  const job = snap.data() as FreelanceJob;

  const now = new Date();
  const updatedRevisions = (job.revisions || []).map(r =>
    r.id === revisionId
      ? { ...r, editorNotes: editorNotes.trim(), editorFeedbackDate: now.toISOString().slice(0, 10) }
      : r
  );

  const newLog: FreelanceActivityLog = {
    id: `log_${Date.now()}`,
    timestamp: now.toISOString(),
    action: 'Editor responded to client revision',
    actor: actor || 'Editor',
  };
  const updatedLogs = [...(job.activityLogs || []), newLog];

  await updateDoc(doc(db, 'freelance_jobs', jobId), {
    revisions: clean(updatedRevisions),
    activityLogs: clean(updatedLogs),
  });
}

/**
 * Move a job along and leave a trail. The stage is on the public half because
 * everyone working the job needs to see where it has got to.
 */
export async function advanceStage(jobId: string, stage: string, detail: string): Promise<void> {
  const now = new Date();
  await runTransaction(db, async tx => {
    const ref = doc(db, 'freelance_jobs', jobId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('That job no longer exists.');
    const billingRef = doc(ref, 'billing', 'main');
    const billing = await tx.get(billingRef);
    if (snap.data().stage === stage) return;
    const date = now.toISOString().slice(0, 10);
    const stageDates: Record<string, Record<string, string>> = {
      data_received: { dataReceivedDate: date },
      sent_to_editor: { sentToEditorDate: date },
      draft_received: { draftReceivedDate: date },
      internal_review: { draftReceivedDate: date },
      internal_changes: { changesSentToEditorDate: date },
      sent_to_client: { sentToClientDate: date },
      changes_received: { changesReceivedDate: date },
      changes_sent_to_editor: { changesSentToEditorDate: date },
      final_delivered: { finalDeliveredDate: date },
      completed: {
        completedDate: date,
        ...(snap.data().finalDeliveredDate ? {} : { finalDeliveredDate: date }),
      },
    };

    const isPublicAction = !detail.toLowerCase().includes('invoice') &&
      !detail.toLowerCase().includes('₹') &&
      !detail.toLowerCase().includes('payout');
    
    const jobUpdate: Record<string, any> = { stage, ...(stageDates[stage] || {}) };
    if (isPublicAction) {
      const existingLogs = (snap.data().activityLogs || []) as FreelanceActivityLog[];
      jobUpdate.activityLogs = clean([...existingLogs, {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: now.toISOString(),
        action: detail,
        actor: 'Studio Owner',
      }]);
    }

    tx.update(ref, clean(jobUpdate));
    // The log belongs in the billing half. Entries elsewhere in the app carry
    // figures — "Desktop invoice issued: DU-… 45,000" — and the parent document
    // is readable by the assigned editor and the partner studio. Writing a log
    // onto it would put those in front of both, today or the first time someone
    // adds an entry with a number in it.
    tx.set(billingRef, { activityLogs: [...(billing.data()?.activityLogs || []), {
      id: crypto.randomUUID(), timestamp: now.toISOString(), action: detail, actor: 'Studio Owner',
    }] }, { merge: true });
  });
}

/**
 * A final master is only considered archived after the desktop app has finished
 * writing the Dropbox download to the studio's chosen local archive location.
 * Keep the path on the private billing half: assigned editors and partner
 * studios can read the parent job document.
 */
export async function archiveFinalDelivery(jobId: string, archivePath: string): Promise<void> {
  if (!jobId || !archivePath.trim()) throw new Error('Choose an archive location for the final delivery.');
  const now = new Date().toISOString();
  await runTransaction(db, async tx => {
    const ref = doc(db, 'freelance_jobs', jobId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('That job no longer exists.');
    const billingRef = doc(ref, 'billing', 'main');
    const billing = await tx.get(billingRef);
    tx.set(billingRef, {
      finalDeliveryArchivedAt: now,
      finalDeliveryArchivePath: archivePath,
      activityLogs: [...(billing.data()?.activityLogs || []), {
        id: crypto.randomUUID(), timestamp: now, action: 'Final delivery downloaded and archived', actor: 'Studio Owner',
      }],
    }, { merge: true });
  });
}

/** Record the client handoff before the studio saves its own archival copy. */
export async function confirmClientFinalDownload(jobId: string): Promise<void> {
  if (!jobId) throw new Error('No project was selected.');
  const now = new Date().toISOString();
  await runTransaction(db, async tx => {
    const ref = doc(db, 'freelance_jobs', jobId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('That job no longer exists.');
    if (snap.data().stage !== 'completed') throw new Error('Complete the project before confirming the client download.');
    const billingRef = doc(ref, 'billing', 'main');
    const billing = await tx.get(billingRef);
    if (billing.data()?.clientPaymentStatus !== 'paid') throw new Error('Record the client payment before confirming their final download.');
    tx.set(billingRef, {
      clientFinalDownloadConfirmedAt: now,
      activityLogs: [...(billing.data()?.activityLogs || []), {
        id: crypto.randomUUID(), timestamp: now, action: 'Client final download confirmed', actor: 'Studio Owner',
      }],
    }, { merge: true });
  });
}

/**
 * Record a round of client changes against a job.
 *
 * Rounds are numbered from what is already on the job rather than from a
 * counter held anywhere else, so a job that came back three times reads as
 * three rounds however the notes were entered. Written in a transaction
 * because two people logging changes at once would otherwise both write
 * "round 2" and one would silently replace the other.
 */
export async function logRevision(
  jobId: string,
  feedbackNotes: string,
  timecodes?: string,
  revisionType?: 'internal' | 'client'
): Promise<number> {
  if (!feedbackNotes.trim()) throw new Error('Write down what needs changing.');
  const now = new Date();
  return runTransaction(db, async tx => {
    const ref = doc(db, 'freelance_jobs', jobId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('That job no longer exists.');
    const billingRef = doc(ref, 'billing', 'main');
    const billing = await tx.get(billingRef);
    const existing = (snap.data().revisions || []) as { roundNumber?: number }[];
    const roundNumber = existing.reduce((highest, r) => Math.max(highest, Number(r.roundNumber) || 0), 0) + 1;
    const isInternal = revisionType === 'internal' || feedbackNotes.startsWith('[Internal');
    const actionLabel = isInternal ? 'Internal studio changes requested' : `Changes received — round ${roundNumber}`;
    const newRev = {
      id: crypto.randomUUID(),
      roundNumber,
      receivedDate: now.toISOString().slice(0, 10),
      feedbackNotes: feedbackNotes.trim(),
      timecodes: timecodes?.trim() || '',
      status: 'pending',
      revisionType: isInternal ? 'internal' : 'client',
    };
    const existingLogs = (snap.data().activityLogs || []) as FreelanceActivityLog[];
    const jobLogs = [...existingLogs, {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: now.toISOString(),
      action: actionLabel,
      details: feedbackNotes.trim().slice(0, 300),
      actor: 'Studio Owner',
    }];
    tx.update(ref, clean({
      revisions: [...existing, newRev],
      stage: isInternal ? 'internal_changes' : 'changes_received',
      changesReceivedDate: now.toISOString().slice(0, 10),
      changesSentToEditorDate: now.toISOString().slice(0, 10),
      activityLogs: jobLogs,
    }));
    tx.set(billingRef, { activityLogs: [...(billing.data()?.activityLogs || []), {
      id: crypto.randomUUID(), timestamp: now.toISOString(),
      action: actionLabel, details: feedbackNotes.trim().slice(0, 300), actor: 'Studio Owner',
    }] }, { merge: true });
    return roundNumber;
  });
}

/** Mark the newest outstanding round as passed to the editor. */
export async function markRevisionShared(jobId: string): Promise<void> {
  const now = new Date();
  await runTransaction(db, async tx => {
    const ref = doc(db, 'freelance_jobs', jobId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('That job no longer exists.');
    const billingRef = doc(ref, 'billing', 'main');
    const billing = await tx.get(billingRef);
    const revisions = (snap.data().revisions || []) as Record<string, unknown>[];
    const open = [...revisions].reverse().find(r => r.status === 'pending');
    const existingLogs = (snap.data().activityLogs || []) as FreelanceActivityLog[];
    const isInternal = (open as any)?.revisionType === 'internal' || (open as any)?.feedbackNotes?.startsWith('[Internal');
    const shareAction = isInternal
      ? `Internal changes shared with editor${open ? ` — round ${open.roundNumber}` : ''}`
      : `Changes shared with the editor${open ? ` — round ${open.roundNumber}` : ''}`;
    tx.update(ref, clean({
      revisions: revisions.map(r => r === open
        ? { ...r, status: 'in_progress', sharedWithEditorDate: now.toISOString().slice(0, 10) } : r),
      stage: isInternal ? 'internal_changes' : 'changes_sent_to_editor',
      changesSentToEditorDate: now.toISOString().slice(0, 10),
      activityLogs: [...existingLogs, {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: now.toISOString(),
        action: shareAction,
        actor: 'Studio Owner',
      }],
    }));
    tx.set(billingRef, { activityLogs: [...(billing.data()?.activityLogs || []), {
      id: crypto.randomUUID(), timestamp: now.toISOString(),
      action: shareAction, actor: 'Studio Owner',
    }] }, { merge: true });
  });
}

/**
 * Record where the raw data is, when it was not uploaded from this Mac.
 *
 * Partner studios often hand over a Drive or WeTransfer link rather than
 * shipping a drive, and that link is the raw data as far as the job is
 * concerned. It lives on the public half so the editor assigned to the job can
 * actually open it.
 */
export async function saveRawDataLink(target: WorkTarget, link: string): Promise<void> {
  const value = link.trim();
  if (value && !/^https?:\/\/\S+$/i.test(value)) throw new Error('Paste a full link, starting with https://');
  if (target.kind === 'freelance') {
    const docId = (target as any)._documentId || target.id;
    await setDoc(doc(db, 'freelance_jobs', docId), { rawDataLink: value || null }, { merge: true });
    return;
  }
  await runTransaction(db, async tx => {
    const ref = doc(db, 'clients', target.clientId!);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Client no longer exists.');
    const items = (snap.data().deliverables || []) as ClientDeliverable[];
    if (!items.some(d => d.id === target.id)) throw new Error('Deliverable no longer exists.');
    tx.update(ref, { deliverables: clean(items.map(d => d.id === target.id ? { ...d, rawDataLink: value } : d)) });
  });
}

export async function saveManualRawData(target: WorkTarget, input: {
  source: 'hard_drive' | 'link'; link?: string; notes?: string; hours: number; minutes: number; photoCount: number;
}): Promise<void> {
  if (input.minutes < 0 || input.minutes > 59 || input.hours < 0 || input.photoCount < 0) throw new Error('Enter valid raw-data measurements.');
  if (input.source === 'link' && !input.link?.trim()) throw new Error('Paste the shared raw-data link.');
  const data = clean({ rawDataSource: input.source, rawDataLink: input.link?.trim() || '', hardDriveNotes: input.notes?.trim() || undefined, rawDurationHours: input.hours,
    rawDurationMinutes: input.minutes, rawPhotoCount: input.photoCount });
  if (target.kind === 'freelance') {
    await updateDoc(doc(db, 'freelance_jobs', target.id), data);
  } else {
    const ref = doc(db, 'clients', target.clientId!);
    let fileIntoPostProduction = false;
    const configuredServices = await studioPostProductionServices();
    await runTransaction(db, async tx => {
      const snap = await tx.get(ref); if (!snap.exists()) throw new Error('The client no longer exists.');
      const items = snap.data().deliverables || [];
      const deliverable = items.find((item: ClientDeliverable) => item.id === target.id);
      // A drive handed over is raw data arriving just as much as an upload is,
      // so it files the same job rather than leaving this one intake manual.
      fileIntoPostProduction = shouldFileIntoPostProduction(target, deliverable, configuredServices);
      tx.update(ref, { deliverables: items.map((item: ClientDeliverable) => item.id === target.id ? { ...item, ...data } : item) });
    });
    if (fileIntoPostProduction) {
      await sendBaawarayDeliverableToPostProduction(target.clientId!, {
        id: target.id, title: target.title, category: target.serviceType, status: 'pending',
        rawDataLink: data.rawDataLink, rawDataSource: input.source, dueDate: target.dueDate,
        rawDurationHours: input.hours, rawDurationMinutes: input.minutes, rawPhotoCount: input.photoCount,
        hardDriveNotes: data.hardDriveNotes,
      } as ClientDeliverable, [target.serviceType]);
    }
  }
}

/**
 * The studio's Google OAuth client, shared between the Macs that run this app.
 *
 * Owner-only provisioning. The backend reads the secret to exchange tokens;
 * normal desktop sign-in never fetches this document or copies the secret.
 * Google grants remain separate for each person's studio account and Mac.
 */
export async function saveUploaderOAuth(clientId: string, clientSecret: string): Promise<void> {
  if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId.trim())) {
    throw new Error('Enter a Google OAuth Desktop app client ID.');
  }
  const ref = doc(db, 'studio_secrets', 'uploader_oauth');
  await runTransaction(db, async tx => {
    const previous = (await tx.get(ref)).data();
    if (!clientSecret.trim() && (previous?.clientId !== clientId.trim() || !previous?.clientSecret)) {
      throw new Error('Enter the matching client secret for a new OAuth client.');
    }
    tx.set(ref, { clientId: clientId.trim(), ...(clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}),
      updatedAt: new Date().toISOString() }, { merge: true });
  });
}

/**
 * Mark a freelance job's raw footage as downloaded by the editor.
 * This triggers the dynamic scheduling clock and moves the job from 'download_pending' to 'in_process'.
 */
export async function markJobDownloaded(jobId: string, timestamp?: string): Promise<void> {
  if (!jobId) throw new Error('Job ID is required.');
  const downloadedAt = timestamp || new Date().toISOString();
  try {
    await updateDoc(doc(db, 'freelance_jobs', jobId), { downloadedAt });
  } catch (error) {
    const code = (error as { code?: string })?.code || '';
    if (code === 'permission-denied') {
      throw new Error('Permissions refused marking download complete. (permission-denied)');
    }
    throw new Error(`${(error as Error)?.message || 'Could not mark download complete.'}${code ? ` (${code})` : ''}`);
  }
}

export async function resetJobDownloaded(jobId: string): Promise<void> {
  if (!jobId) throw new Error('Job ID is required.');
  try {
    await updateDoc(doc(db, 'freelance_jobs', jobId), { downloadedAt: null });
  } catch (error) {
    const code = (error as { code?: string })?.code || '';
    throw new Error(`${(error as Error)?.message || 'Could not reset download status.'}${code ? ` (${code})` : ''}`);
  }
}

/**
 * Update the required editing days allocated to a job (studio owner/admin).
 */
export async function updateJobRequiredDays(jobId: string, requiredDays: number): Promise<void> {
  if (!jobId) throw new Error('Job ID is required.');
  if (typeof requiredDays !== 'number' || requiredDays <= 0) {
    throw new Error('Required days must be a positive number.');
  }
  await updateDoc(doc(db, 'freelance_jobs', jobId), { requiredDays });
}

/**
 * Save / update an editor's unavailable periods (leaves and off-days).
 */
export async function updateEditorUnavailablePeriods(
  memberId: number | string,
  unavailablePeriods: { id: string; from: string; to: string; reason?: string }[]
): Promise<void> {
  if (!memberId) throw new Error('Member ID is required.');
  await updateDoc(doc(db, 'team', String(memberId)), {
    unavailablePeriods: clean(unavailablePeriods)
  });
}

/**
 * Update a freelance job record with new details and partition fields correctly.
 */
export async function updateFreelanceJob(
  id: string,
  updates: Partial<FreelanceJob>,
  logAction?: string
): Promise<void> {
  if (!id) throw new Error('Job ID is required.');
  const ref = doc(db, 'freelance_jobs', id);
  const billingRef = doc(ref, 'billing', 'main');
  const editorRef = doc(ref, 'editor', 'main');

  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('That job no longer exists.');
    const bSnap = await tx.get(billingRef);
    const eSnap = await tx.get(editorRef);

    const current = {
      ...snap.data(),
      ...(bSnap.exists() ? bSnap.data() : {}),
      ...(eSnap.exists() ? eSnap.data() : {}),
    } as FreelanceJob;

    // Recalculate client payment status if amounts updated
    let clientPaid = updates.clientPaidAmount !== undefined ? updates.clientPaidAmount : current.clientPaidAmount;
    if (updates.clientPayments) {
      clientPaid = updates.clientPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
    }
    const clientCharge = updates.clientCharge !== undefined ? updates.clientCharge : current.clientCharge;
    const clientPaymentStatus = derivePaymentStatus(clientPaid, clientCharge);

    // Recalculate editor payment status if amounts updated
    let editorPaid = updates.editorPaidAmount !== undefined ? updates.editorPaidAmount : current.editorPaidAmount;
    if (updates.editorPayouts) {
      editorPaid = updates.editorPayouts.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
    }
    const editorPay = updates.editorPay !== undefined ? updates.editorPay : current.editorPay;
    const editorPaymentStatus = derivePaymentStatus(editorPaid, editorPay);

    const updatedLogs: FreelanceActivityLog[] = [...(current.activityLogs || [])];
    if (logAction) {
      updatedLogs.push({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        action: logAction,
        details: updates.notes || '',
        actor: 'Studio Owner',
      });
    }

    const merged: FreelanceJob = {
      ...current,
      ...updates,
      clientPaidAmount: clientPaid,
      clientPaymentStatus,
      editorPaidAmount: editorPaid,
      editorPaymentStatus,
      activityLogs: updatedLogs,
    };

    const halves = splitFreelanceRecord(clean(merged) as unknown as Record<string, unknown>);
    tx.set(ref, halves.publicHalf, { merge: true });
    tx.set(billingRef, halves.billingHalf, { merge: true });
    tx.set(editorRef, halves.editorHalf, { merge: true });
  });
}

/**
 * Permanently delete a freelance job and its subcollections.
 */
export async function deleteFreelanceJob(id: string): Promise<void> {
  if (!id) throw new Error('Job ID is required.');
  const ref = doc(db, 'freelance_jobs', id);
  const billingRef = doc(ref, 'billing', 'main');
  const editorRef = doc(ref, 'editor', 'main');

  const batch = writeBatch(db);
  batch.delete(billingRef);
  batch.delete(editorRef);
  batch.delete(ref);
  await batch.commit();
}

/**
 * Delete a partner studio client record.
 */
export async function deleteFreelanceClient(id: string): Promise<void> {
  if (!id) throw new Error('Client ID is required.');
  await deleteDoc(doc(db, 'freelance_clients', id));
}

/**
 * Record a client payment against a specific freelance job.
 */
export async function addFreelanceClientPayment(
  jobId: string,
  payment: Omit<FreelancePaymentRecord, 'id' | 'createdAt'>
): Promise<void> {
  if (!jobId) throw new Error('Job ID is required.');
  const ref = doc(db, 'freelance_jobs', jobId);
  const billingRef = doc(ref, 'billing', 'main');

  await runTransaction(db, async tx => {
    const parentSnap = await tx.get(ref);
    if (!parentSnap.exists()) throw new Error('That job no longer exists.');
    const bSnap = await tx.get(billingRef);
    const billingData = bSnap.exists() ? bSnap.data() : {};
    const existingPayments = (billingData.clientPayments || []) as FreelancePaymentRecord[];

    const newRecord: FreelancePaymentRecord = {
      ...payment,
      amount: Number(payment.amount) || 0,
      id: `fcp-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    const updatedPayments = [...existingPayments, newRecord];
    const newTotalPaid = updatedPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
    const charge = Number(billingData.clientCharge || parentSnap.data().clientCharge) || 0;
    const newStatus = derivePaymentStatus(newTotalPaid, charge);

    const logEntry: FreelanceActivityLog = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action: `Client Payment Received: ₹${newRecord.amount.toLocaleString('en-IN')}`,
      details: `Mode: ${payment.mode || 'UPI'}${payment.reference ? ` | Ref: ${payment.reference}` : ''}`,
      actor: 'Studio Owner',
    };

    tx.set(billingRef, {
      clientPayments: updatedPayments,
      clientPaidAmount: newTotalPaid,
      clientPaymentStatus: newStatus,
      activityLogs: [...(billingData.activityLogs || []), logEntry],
    }, { merge: true });

    tx.update(ref, {
      clientPaymentStatus: newStatus,
    });
  });
}

/**
 * Record an editor payout against a specific freelance job.
 */
export async function addFreelanceEditorPayout(
  jobId: string,
  payout: Omit<FreelancePaymentRecord, 'id' | 'createdAt'>
): Promise<void> {
  if (!jobId) throw new Error('Job ID is required.');
  const ref = doc(db, 'freelance_jobs', jobId);
  const editorRef = doc(ref, 'editor', 'main');
  const billingRef = doc(ref, 'billing', 'main');

  await runTransaction(db, async tx => {
    const parentSnap = await tx.get(ref);
    if (!parentSnap.exists()) throw new Error('That job no longer exists.');
    const eSnap = await tx.get(editorRef);
    const editorData = eSnap.exists() ? eSnap.data() : {};
    const bSnap = await tx.get(billingRef);
    const billingData = bSnap.exists() ? bSnap.data() : {};

    const existingPayouts = (editorData.editorPayouts || []) as FreelancePaymentRecord[];
    const newRecord: FreelancePaymentRecord = {
      ...payout,
      amount: Number(payout.amount) || 0,
      id: `fep-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    const updatedPayouts = [...existingPayouts, newRecord];
    const newTotalPaid = updatedPayouts.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
    const agreedPay = Number(editorData.editorPay || parentSnap.data().editorPay) || 0;
    const finalEditorPay = Math.max(agreedPay, newTotalPaid);
    const newStatus = derivePaymentStatus(newTotalPaid, finalEditorPay);

    const logEntry: FreelanceActivityLog = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action: `Editor Payout Remitted: ₹${newRecord.amount.toLocaleString('en-IN')}`,
      details: `Mode: ${payout.mode || 'Bank Transfer'}${payout.reference ? ` | Ref: ${payout.reference}` : ''}`,
      actor: 'Studio Owner',
    };

    tx.set(editorRef, {
      editorPayouts: updatedPayouts,
      editorPaidAmount: newTotalPaid,
      editorPay: finalEditorPay,
      editorPaymentStatus: newStatus,
    }, { merge: true });

    tx.set(billingRef, {
      activityLogs: [...(billingData.activityLogs || []), logEntry],
    }, { merge: true });

    tx.update(ref, {
      editorPaymentStatus: newStatus,
    });
  });
}

/**
 * Record a partner studio account payment (lump sum ledger payment).
 */
export async function addFreelanceAccountPayment(
  clientId: string,
  payment: Omit<FreelanceLedgerPayment, 'id' | 'createdAt'>
): Promise<void> {
  if (!clientId) throw new Error('Partner Studio ID is required.');
  const ref = doc(db, 'freelance_clients', clientId);

  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Partner studio no longer exists.');
    const record: FreelanceLedgerPayment = {
      ...payment,
      amount: Number(payment.amount) || 0,
      id: `flp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
    };
    const existing = (snap.data().payments || []) as FreelanceLedgerPayment[];
    tx.update(ref, {
      payments: clean([...existing, record]),
    });
  });
}

/**
 * Remove an account payment from a partner studio's ledger.
 */
export async function deleteFreelanceAccountPayment(clientId: string, paymentId: string): Promise<void> {
  if (!clientId || !paymentId) throw new Error('Client ID and Payment ID are required.');
  const ref = doc(db, 'freelance_clients', clientId);

  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Partner studio no longer exists.');
    const existing = (snap.data().payments || []) as FreelanceLedgerPayment[];
    tx.update(ref, {
      payments: clean(existing.filter(p => p.id !== paymentId)),
    });
  });
}

/**
 * Record an editor payout record on the team member document.
 */
export async function addFreelanceEditorPayoutRecord(
  memberId: number | string,
  payout: Omit<FreelanceEditorPayout, 'id' | 'createdAt'>
): Promise<void> {
  if (!memberId) throw new Error('Team member ID is required.');
  const ref = doc(db, 'team', String(memberId));

  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Team member no longer exists.');
    const record: FreelanceEditorPayout = {
      ...payout,
      amount: Number(payout.amount) || 0,
      allocations: (payout.allocations || []).filter(a => (Number(a.amount) || 0) > 0),
      id: `flep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
    };
    const existing = (snap.data().freelancePayouts || []) as FreelanceEditorPayout[];
    tx.update(ref, {
      freelancePayouts: clean([...existing, record]),
    });
  });
}

/**
 * Remove an editor payout record from the team member document.
 */
export async function deleteFreelanceEditorPayoutRecord(
  memberId: number | string,
  payoutId: string
): Promise<void> {
  if (!memberId || !payoutId) throw new Error('Team member ID and Payout ID are required.');
  const ref = doc(db, 'team', String(memberId));

  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Team member no longer exists.');
    const existing = (snap.data().freelancePayouts || []) as FreelanceEditorPayout[];
    tx.update(ref, {
      freelancePayouts: clean(existing.filter(p => p.id !== payoutId)),
    });
  });
}

/**
 * Record a scanned folder as raw data received, without sending it anywhere.
 *
 * Footage arrives on a drive as often as it arrives over a wire — from another
 * studio, or from the studio's own shooters — and the measurements that decides
 * the price are the same either way. They were being typed in by hand off the
 * Finder's info panel, which is both tedious and the easiest place in the app to
 * fat-finger an hour.
 *
 * The scan has already counted every photo and read every clip's duration, so
 * this writes what it found and stops. Nothing uploads. The entry it leaves on
 * the work is the same shape an upload leaves, marked as received on a drive, so
 * a partner studio sees how much arrived whichever way it came.
 */
export async function logScannedRawData(job: Transfer, notes?: string): Promise<void> {
  const target = job.target;
  if (!target) throw new Error('Attach this scan to a job or deliverable first.');
  if (!job.scan || job.scan.readErrors) throw new Error('Finish a clean scan before logging what was received.');

  const measurements = clean({
    rawDataSource: 'hard_drive',
    hardDriveNotes: notes?.trim() || undefined,
    ...measurementsFromScan(job.scan),
  });
  const entry = {
    id: job.id, purpose: target.purpose, createdAt: job.createdAt,
    fileCount: job.scan.fileCount || 0, bytes: job.scan.totalBytes || 0,
    status: 'received_offline', rootName: job.rootName,
  };

  if (target.kind === 'freelance') {
    const ref = doc(db, 'freelance_jobs', target.id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('The linked work no longer exists.');
    await setDoc(ref, { ...measurements, desktopTransfers: { ...(snap.data().desktopTransfers || {}), [job.id]: entry } }, { merge: true });
    return;
  }

  let fileIntoPostProduction = false;
  const configuredServices = await studioPostProductionServices();
  await runTransaction(db, async tx => {
    const ref = doc(db, 'clients', target.clientId!);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('The client no longer exists.');
    const items = snap.data().deliverables || [];
    const deliverable = items.find((item: ClientDeliverable) => item.id === target.id);
    if (!deliverable) throw new Error('Deliverable no longer exists.');
    // Footage on a drive is footage arriving, so it becomes Post Production's
    // work exactly as an upload would.
    fileIntoPostProduction = shouldFileIntoPostProduction(target, deliverable, configuredServices);
    tx.update(ref, {
      deliverables: items.map((item: ClientDeliverable) => item.id === target.id
        ? { ...item, ...measurements, desktopTransfers: { ...(item.desktopTransfers || {}), [job.id]: entry } }
        : item),
    });
  });

  if (fileIntoPostProduction) {
    await sendBaawarayDeliverableToPostProduction(target.clientId!, {
      id: target.id, title: target.title, category: target.serviceType, status: 'pending',
      dueDate: target.dueDate, ...measurements,
    } as ClientDeliverable, [target.serviceType]);
  }
}

export async function createTeamMember(data: Omit<TeamMember, 'id'>): Promise<TeamMember> {
  if (!data.name?.trim()) throw new Error('Enter the team member name.');
  const id = Date.now();
  const docId = String(id);
  const ref = doc(db, 'team', docId);
  const newMember: TeamMember = {
    ...data,
    id,
    name: data.name.trim(),
    role: data.role || 'Video Editor',
    phone: data.phone ? data.phone.trim() : '',
    email: data.email ? data.email.trim() : '',
    password: data.password ? data.password.trim() : `TM${Math.floor(1000 + Math.random() * 9000)}`,
    mustChangePassword: data.mustChangePassword ?? true,
    active: data.active ?? true,
    bio: data.bio ? data.bio.trim() : '',
  };

  const publicHalf: Record<string, any> = {};
  const privateHalf: Record<string, any> = {};
  const privateFields = [
    'password', 'mustChangePassword', 'ratePerDay', 'rateCard',
    'rolePayoutRates', 'itemPayoutRates', 'hourlyRawDataCostRate',
    'albumDesignCostPerSheet', 'monthlySalary', 'freelancePayouts',
  ];

  for (const [k, v] of Object.entries(newMember)) {
    if (v === undefined) continue;
    if (privateFields.includes(k)) privateHalf[k] = v;
    else publicHalf[k] = v;
  }
  privateHalf.id = id;
  if (newMember.authUid) privateHalf.authUid = newMember.authUid;

  const batch = writeBatch(db);
  batch.set(ref, clean(publicHalf));
  batch.set(doc(ref, 'private', 'main'), clean(privateHalf));
  await batch.commit();
  return newMember;
}

export async function updateTeamMember(id: number, data: Partial<TeamMember>): Promise<void> {
  const docId = String(id);
  const ref = doc(db, 'team', docId);
  const privateFields = [
    'password', 'mustChangePassword', 'ratePerDay', 'rateCard',
    'rolePayoutRates', 'itemPayoutRates', 'hourlyRawDataCostRate',
    'albumDesignCostPerSheet', 'monthlySalary', 'freelancePayouts',
  ];
  const publicUpdates: Record<string, any> = {};
  const privateUpdates: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    if (privateFields.includes(k)) privateUpdates[k] = v;
    else publicUpdates[k] = v;
  }
  const batch = writeBatch(db);
  if (Object.keys(publicUpdates).length > 0) {
    batch.set(ref, clean(publicUpdates), { merge: true });
  }
  if (Object.keys(privateUpdates).length > 0) {
    batch.set(doc(ref, 'private', 'main'), clean(privateUpdates), { merge: true });
  }
  await batch.commit();
}
