import { collection, doc, getDoc, runTransaction, setDoc, writeBatch, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { splitFreelanceRecord } from '../../../../../WEB APP/src/lib/freelanceSchema';
import type { FreelanceJob, ClientDeliverable, TeamMember } from '../types';
import type { InvoiceSnapshot, Transfer, WorkTarget } from '../../../shared/contracts';

const clean = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
export async function createFreelanceJob(job: Partial<FreelanceJob>): Promise<string> {
  if (!job.title?.trim() || !job.serviceType || !job.freelanceClientId) throw new Error('Choose a partner studio, service and title.');
  const ref = doc(collection(db, 'freelance_jobs'));
  const now = new Date();
  const data = { ...job, id: ref.id, jobCode: `FL-${now.getFullYear()}-D${ref.id.slice(0, 8).toUpperCase()}`,
    createdAt: now.toISOString().slice(0, 10), stage: 'pending_assignment',
    clientCharge: job.clientCharge || 0, clientPaidAmount: 0, clientPaymentStatus: 'unpaid', clientPayments: [],
    editorPay: 0, editorPaidAmount: 0, editorPaymentStatus: 'unpaid', editorPayouts: [], revisions: [],
    activityLogs: [{ id: crypto.randomUUID(), timestamp: now.toISOString(), action: 'Created in desktop uploader', actor: 'Studio Owner' }] };
  const halves = splitFreelanceRecord(clean(data));
  const batch = writeBatch(db);
  batch.set(ref, halves.publicHalf); batch.set(doc(ref, 'billing', 'main'), halves.billingHalf); batch.set(doc(ref, 'editor', 'main'), halves.editorHalf);
  await batch.commit(); return ref.id;
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
  const entry = { id: job.id, link: job.link, purpose: target.purpose, createdAt: job.createdAt,
    fileCount: job.scan?.fileCount || 0, bytes: job.scan?.totalBytes || 0, status: 'verified' };
  await runTransaction(db, async tx => {
    const ref = target.kind === 'freelance' ? doc(db, 'freelance_jobs', target.id) : doc(db, 'clients', target.clientId!);
    const snap = await tx.get(ref); if (!snap.exists()) throw new Error('The linked work no longer exists.');
    const record = snap.data();
    if (target.kind === 'freelance') {
      const field = target.purpose === 'raw' ? 'rawDataLink' : 'deliveryLink';
      tx.update(ref, { desktopTransfers: { ...(record.desktopTransfers || {}), [job.id]: entry }, ...(!record[field] ? { [field]: job.link } : {}) });
    } else {
      const items = record.deliverables || [];
      if (!items.some((d: ClientDeliverable) => d.id === target.id)) throw new Error('Deliverable no longer exists.');
      const field = target.purpose === 'raw' ? 'rawDataLink' : 'link';
      tx.update(ref, { deliverables: items.map((d: any) => d.id === target.id ? { ...d,
        desktopTransfers: { ...(d.desktopTransfers || {}), [job.id]: entry }, ...(!d[field] ? { [field]: job.link } : {}) } : d) });
    }
  });
}

export async function saveUploaderSettings(settings: { keepPercentDefault: number; photosPerSheet: number; excludedBillingFolders: string[]; countPhotoPairsOnce: boolean; keepAwake: boolean }): Promise<void> {
  if (settings.keepPercentDefault < 0 || settings.keepPercentDefault > 100 || !Number.isInteger(settings.photosPerSheet) || settings.photosPerSheet < 1 || settings.photosPerSheet > 100) throw new Error('Invalid uploader defaults.');
  await updateDoc(doc(db, 'studio_config', 'main'), { 'studioSettings.uploader': settings });
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
  await setDoc(doc(db, 'freelance_jobs', jobId, 'editor', 'main'), clean({
    editorMemberId: member?.id ?? null,
    editorName: member?.name ?? '',
    editorPhone: member?.phone ?? '',
    editorEmail: member?.email ?? '',
    editorAuthUid: member?.authUid ?? null,
  }), { merge: true });
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
    if (snap.data().stage === stage) return;
    tx.update(ref, {
      stage,
      ...(stage === 'sent_to_editor' ? { sentToEditorDate: now.toISOString().slice(0, 10) } : {}),
      activityLogs: [...(snap.data().activityLogs || []), {
        id: crypto.randomUUID(), timestamp: now.toISOString(), action: detail, actor: 'Studio Owner',
      }],
    });
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
export async function logRevision(jobId: string, feedbackNotes: string, timecodes?: string): Promise<number> {
  if (!feedbackNotes.trim()) throw new Error('Write down what needs changing.');
  const now = new Date();
  return runTransaction(db, async tx => {
    const ref = doc(db, 'freelance_jobs', jobId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('That job no longer exists.');
    const existing = (snap.data().revisions || []) as { roundNumber?: number }[];
    const roundNumber = existing.reduce((highest, r) => Math.max(highest, Number(r.roundNumber) || 0), 0) + 1;
    tx.update(ref, clean({
      revisions: [...existing, {
        id: crypto.randomUUID(), roundNumber, receivedDate: now.toISOString().slice(0, 10),
        feedbackNotes: feedbackNotes.trim(), timecodes: timecodes?.trim() || '', status: 'pending',
      }],
      stage: 'changes_received',
      activityLogs: [...(snap.data().activityLogs || []), {
        id: crypto.randomUUID(), timestamp: now.toISOString(),
        action: `Changes received — round ${roundNumber}`, details: feedbackNotes.trim().slice(0, 300), actor: 'Studio Owner',
      }],
    }));
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
    const revisions = (snap.data().revisions || []) as Record<string, unknown>[];
    const open = [...revisions].reverse().find(r => r.status === 'pending');
    tx.update(ref, clean({
      revisions: revisions.map(r => r === open
        ? { ...r, status: 'in_progress', sharedWithEditorDate: now.toISOString().slice(0, 10) } : r),
      stage: 'changes_sent_to_editor',
      activityLogs: [...(snap.data().activityLogs || []), {
        id: crypto.randomUUID(), timestamp: now.toISOString(),
        action: `Changes shared with the editor${open ? ` — round ${open.roundNumber}` : ''}`, actor: 'Studio Owner',
      }],
    }));
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
    await updateDoc(doc(db, 'freelance_jobs', target.id), { rawDataLink: value || null });
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

/**
 * The studio's Google OAuth client, shared between the Macs that run this app.
 *
 * Every installation used to need the client id and secret typed in by hand,
 * which meant passing a credential around by message for each new admin — the
 * least safe way to move a secret and the easiest to leave lying in a chat.
 *
 * It is not baked into the app either: the installer is published on a public
 * releases page, so anything inside it is public. It lives in Firestore under
 * `studio_secrets`, which only the studio owner can read, and each Mac fetches
 * it once after signing in and then keeps it encrypted locally.
 *
 * Connecting Drive is still done per person. This shares the app's identity
 * with Google, never anyone's access to a Drive account.
 */
export interface UploaderOAuth { clientId: string; clientSecret: string }

export async function loadUploaderOAuth(): Promise<UploaderOAuth | null> {
  try {
    const snap = await getDoc(doc(db, 'studio_secrets', 'uploader_oauth'));
    if (!snap.exists()) return null;
    const data = snap.data() as Partial<UploaderOAuth>;
    return data.clientId ? { clientId: data.clientId, clientSecret: data.clientSecret || '' } : null;
  } catch {
    // Offline, or an account that may not read it. The settings screen still
    // lets the owner enter it by hand.
    return null;
  }
}

export async function saveUploaderOAuth(clientId: string, clientSecret: string): Promise<void> {
  if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId.trim())) {
    throw new Error('Enter a Google OAuth Desktop app client ID.');
  }
  await setDoc(doc(db, 'studio_secrets', 'uploader_oauth'),
    { clientId: clientId.trim(), clientSecret: clientSecret.trim(), updatedAt: new Date().toISOString() },
    { merge: true });
}
