import { doc, getDoc, collection, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface WhatsAppConfig {
  graphApiVersion: string;
  phoneNumberId: string;
  wabaId: string;
  accessToken: string;
  languageCode: string;
}

export const DEFAULT_WHATSAPP_CONFIG: WhatsAppConfig = {
  graphApiVersion: 'v21.0',
  phoneNumberId: '1360722940461893', // Baawaray Films (+91 88474 42301)
  wabaId: '2366953800810670',
  accessToken:
    typeof atob === 'function'
      ? atob('RUFBVVdwWGI1RHRVQlN6eVpCSHhyZ0duOWY3RFBMYzVaQXJaQkx4SHJvbVEzWTJCTEFVR2duNlE5WVpDSkVTakpZVkxMVW1nQ3g1R3lCTGh3bGhpVGw0M0dYYjNQMHdLcllkRTdWWHFyZW9VcnlOTHBNU0JuMjl1WGRYUzhGWkNiRTVpSE1ndDNVWkFuQ3ZHeE1GZHA4eGFtWUtaQUF3QWY4aGFBZFZneHpaQVVzazI4THMxTHp0UlpCYXAwaGplcTlvN3lLY1FaRFpE')
      : '',
  languageCode: 'en_US',
};

let cachedConfig: WhatsAppConfig | null = null;

export async function getActiveWhatsAppConfig(): Promise<WhatsAppConfig> {
  if (cachedConfig) return cachedConfig;
  try {
    const configSnap = await getDoc(doc(db, 'studio_config', 'main'));
    if (configSnap.exists()) {
      const data = configSnap.data();
      cachedConfig = {
        graphApiVersion: DEFAULT_WHATSAPP_CONFIG.graphApiVersion,
        phoneNumberId: data.whatsappPhoneNumberId || DEFAULT_WHATSAPP_CONFIG.phoneNumberId,
        wabaId: data.whatsappWabaId || DEFAULT_WHATSAPP_CONFIG.wabaId,
        accessToken: data.whatsappAccessToken || DEFAULT_WHATSAPP_CONFIG.accessToken,
        languageCode: DEFAULT_WHATSAPP_CONFIG.languageCode,
      };
      return cachedConfig;
    }
  } catch (err) {
    console.warn('[WhatsAppCloud] Failed to fetch studio_config, falling back to default:', err);
  }
  cachedConfig = { ...DEFAULT_WHATSAPP_CONFIG };
  return cachedConfig;
}

export function normalizeMetaPhone(rawPhone?: string | null): string {
  let clean = (rawPhone || '').replace(/[^0-9]/g, '');
  if (clean.length === 10) clean = '91' + clean;
  if (!clean.startsWith('+')) clean = '+' + clean;
  return clean;
}

export function sanitizeParam(text?: string | null): string {
  if (!text) return '';
  return text.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  usedFallback?: boolean;
}

export interface LogWhatsAppRecord {
  recipientPhone: string;
  recipientName: string;
  recipientRole?: 'client' | 'bride' | 'groom' | 'inquirer' | 'crew' | 'lead';
  direction?: 'outbound' | 'inbound';
  type: 'template' | 'text';
  templateName?: string;
  body: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  metaMessageId?: string;
  errorMessage?: string;
  clientId?: string;
  clientName?: string;
}

export async function logDispatchedMessage(record: LogWhatsAppRecord): Promise<void> {
  try {
    const id = record.metaMessageId || `wa_msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const colRef = collection(db, 'whatsapp_messages');
    await setDoc(
      doc(colRef, id),
      {
        ...record,
        id,
        timestamp: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('[WhatsAppCloud] Could not log message to Firestore:', err);
  }
}

export async function sendCloudDirectText(
  phone: string,
  messageText: string,
  meta?: Partial<LogWhatsAppRecord>
): Promise<SendResult> {
  const cleanPhone = normalizeMetaPhone(phone);
  if (!cleanPhone || cleanPhone.length < 10) {
    return { ok: false, error: 'Invalid recipient phone number' };
  }

  const config = await getActiveWhatsAppConfig();
  const endpoint = `https://graph.facebook.com/${config.graphApiVersion}/${config.phoneNumberId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanPhone,
    type: 'text',
    text: {
      preview_url: true,
      body: messageText,
    },
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      const errMsg = data.error?.message || `HTTP ${res.status}`;
      await logDispatchedMessage({
        recipientPhone: cleanPhone,
        recipientName: meta?.recipientName || 'Team Member',
        recipientRole: meta?.recipientRole || 'crew',
        type: 'text',
        body: messageText,
        status: 'failed',
        errorMessage: errMsg,
        ...meta,
      });
      return { ok: false, error: errMsg };
    }

    const messageId = data.messages?.[0]?.id;
    await logDispatchedMessage({
      recipientPhone: cleanPhone,
      recipientName: meta?.recipientName || 'Team Member',
      recipientRole: meta?.recipientRole || 'crew',
      type: 'text',
      body: messageText,
      status: 'sent',
      metaMessageId: messageId,
      ...meta,
    });

    return { ok: true, messageId };
  } catch (err: any) {
    const errorMsg = err?.message || 'Network error sending WhatsApp text';
    return { ok: false, error: errorMsg };
  }
}

/**
 * Automatically sends a Data Logged & Verified confirmation via WhatsApp Cloud API
 * to the locked team member (photographer / crew) when their shoot data is logged.
 */
export async function sendCrewDataLoggedConfirmation(options: {
  memberPhone: string;
  memberName: string;
  clientName: string;
  eventName: string;
  eventDate?: string;
  dataGb: string | number;
  fileCount: string | number;
  clientId?: string | number;
}): Promise<SendResult> {
  const { memberPhone, memberName, clientName, eventName, eventDate, dataGb, fileCount, clientId } = options;
  const cleanPhone = normalizeMetaPhone(memberPhone);
  if (!cleanPhone || cleanPhone.length < 10) {
    return { ok: false, error: 'Team member has no valid phone number' };
  }

  const safeMember = sanitizeParam(memberName) || 'Team Member';
  const safeClient = sanitizeParam(clientName) || 'Client';
  const safeEvent = sanitizeParam(eventName) || 'Event';
  const safeDate = sanitizeParam(eventDate) || 'Completed Shoot';
  const safeGb = String(dataGb ?? '0').replace(/\s*gb$/i, '').trim();
  const safeFiles = String(fileCount ?? '0').replace(/\s*files?$/i, '').trim();

  const config = await getActiveWhatsAppConfig();
  const endpoint = `https://graph.facebook.com/${config.graphApiVersion}/${config.phoneNumberId}/messages`;

  // 1. Try Meta Template `crew_data_logged_confirmation` first if configured on WABA
  const templatePayload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanPhone,
    type: 'template',
    template: {
      name: 'crew_data_logged_confirmation',
      language: { code: 'en_US' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: safeMember },
            { type: 'text', text: safeClient },
            { type: 'text', text: safeEvent },
            { type: 'text', text: `${safeGb} GB` },
            { type: 'text', text: `${safeFiles} files` },
          ],
        },
      ],
    },
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(templatePayload),
    });
    const data = await res.json();
    if (res.ok && data.messages?.[0]?.id) {
      const messageId = data.messages[0].id;
      await logDispatchedMessage({
        recipientPhone: cleanPhone,
        recipientName: safeMember,
        recipientRole: 'crew',
        type: 'template',
        templateName: 'crew_data_logged_confirmation',
        body: `Data logged for ${safeClient} — ${safeEvent}: ${safeGb} GB, ${safeFiles} files`,
        status: 'sent',
        metaMessageId: messageId,
        clientId: clientId !== undefined ? String(clientId) : undefined,
        clientName: safeClient,
      });
      return { ok: true, messageId };
    }
  } catch {
    // Fall back to direct text below
  }

  // 2. Direct Text Message via WhatsApp Cloud API
  const textMsg =
    `✅ *DATA LOGGED & VERIFIED — BAAWARAY FILMS*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `Hi *${safeMember}*,\n\n` +
    `Your shoot data has been received and logged into Studio OS:\n\n` +
    `• 💍 *Client:* ${safeClient}\n` +
    `• 🎬 *Event:* ${safeEvent}\n` +
    `• 📅 *Date:* ${safeDate}\n` +
    `• 💾 *Total Data Size:* ${safeGb} GB\n` +
    `• 📂 *Total Files:* ${safeFiles} files\n\n` +
    `🔒 *Status:* Verified & Queued in Crew Payments Panel\n` +
    `Thank you for your work on this celebration!\n\n` +
    `*Baawaray Films Studio*`;

  const fallbackRes = await sendCloudDirectText(cleanPhone, textMsg, {
    recipientName: safeMember,
    recipientRole: 'crew',
    clientId: clientId !== undefined ? String(clientId) : undefined,
    clientName: safeClient,
  });

  return { ...fallbackRes, usedFallback: true };
}
