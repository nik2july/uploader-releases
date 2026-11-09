export interface WhatsAppConfig {
  graphApiVersion: string;
  phoneNumberId: string;
  wabaId: string;
  accessToken: string;
}

export const DEFAULT_WHATSAPP_CONFIG: WhatsAppConfig = {
  graphApiVersion: 'v21.0',
  phoneNumberId: '1360722940461893', // Baawaray Films (+91 88474 42301)
  wabaId: '2366953800810670',
  accessToken:
    'EAAUWpXb5DtUBSzyZBHxrgGn9f7DPLc5ZArZBLxHronQ3Y2BLAUGgn6Q9YZCJESjYVLLUmgCx5GyBLhwlhiTl43GXb3P08wKrYdE7VXqreoUryNLpMSBn29uXdXS8FZCbE5iHMgt3UZAnCvGxMFdp8xamYKZAAwAf8haAdVgxzZAUsk28Ls1LztRZBap0hjeq9o7yKcQZDZD'
};

export const POST_PRODUCTION_PHONE = '+91 88945 62004';

export function normalizeMetaPhone(rawPhone?: string | null): string {
  let clean = (rawPhone || '').replace(/[^0-9]/g, '');
  if (clean.length === 10) clean = '91' + clean;
  if (!clean.startsWith('+')) clean = '+' + clean;
  return clean;
}

export interface SendWhatsAppResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export class WhatsAppService {
  private config: WhatsAppConfig = { ...DEFAULT_WHATSAPP_CONFIG };

  configure(custom?: Partial<WhatsAppConfig>): void {
    if (custom) {
      this.config = {
        ...this.config,
        ...custom
      };
    }
  }

  getConfig(): WhatsAppConfig {
    return { ...this.config };
  }

  async sendDirectText(phone: string, textBody: string): Promise<SendWhatsAppResult> {
    const cleanPhone = normalizeMetaPhone(phone);
    if (!cleanPhone || cleanPhone.length < 11) {
      return { ok: false, error: 'Invalid phone number (must include country code)' };
    }

    const endpoint = `https://graph.facebook.com/${this.config.graphApiVersion}/${this.config.phoneNumberId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanPhone,
      type: 'text',
      text: {
        preview_url: true,
        body: textBody
      }
    };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = (await res.json()) as any;
      if (!res.ok) {
        const errMsg = data?.error?.message || `WhatsApp API error (${res.status})`;
        return { ok: false, error: errMsg };
      }

      const messageId = data?.messages?.[0]?.id;
      return { ok: true, messageId };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Network error reaching Meta WhatsApp API' };
    }
  }

  async sendFootageReceivedAlert(params: {
    crewName: string;
    phone: string;
    role: string;
    clientName: string;
    eventName: string;
    dataGb: number;
    fileCount: number;
  }): Promise<SendWhatsAppResult> {
    const message = `Hello *${params.crewName}*,

Baawaray Films has received and verified your footage:
📁 *Project:* ${params.clientName} - ${params.eventName}
🎥 *Role:* ${params.role}
📊 *Data Received:* ${params.dataGb} GB (${params.fileCount} clips)
✅ *Status:* Successfully copied & verified on studio offline storage.

Thank you for your timely delivery!
— Baawaray Films Studio`;

    return this.sendDirectText(params.phone, message);
  }

  async sendClientReviewLink(params: {
    clientName: string;
    clientPhone: string;
    deliverableTitle: string;
    dropboxUrl: string;
    postProductionPhone?: string;
  }): Promise<SendWhatsAppResult> {
    const hotLine = params.postProductionPhone || POST_PRODUCTION_PHONE;
    const message = `Dear *${params.clientName}*,

Your *${params.deliverableTitle}* is ready for your private review! 🎬

🔗 *Review Link:*
${params.dropboxUrl}

📝 *How to request changes:*
Please watch the cut and reply with any notes specifying the exact timecodes (e.g. 01:23 - change background song / trim shot).

📞 *Post-Production Hotline:*
For direct discussion or a call with our video editors, call us at: *${hotLine}*.

Warm regards,
Baawaray Films Post-Production Team`;

    return this.sendDirectText(params.clientPhone, message);
  }

  async sendClientRawClipsLink(params: {
    clientName: string;
    clientPhone: string;
    clipCount: number;
    totalGb?: string;
    dropboxUrl: string;
    postProductionPhone?: string;
  }): Promise<SendWhatsAppResult> {
    const hotLine = params.postProductionPhone || POST_PRODUCTION_PHONE;
    const gbText = params.totalGb ? ` (${params.totalGb} GB)` : '';
    const message = `Dear *${params.clientName}*,

Your color-graded raw video rushes (Rec.709) are ready for viewing & download! 🎥✨

📁 *Delivered:* ${params.clipCount} Raw Clips${gbText}
🔗 *Dropbox Shareable Link:*
${params.dropboxUrl}

💡 *Note:*
All clips have been converted from flat Sony S-Log3 into vivid, ready-to-watch Rec.709 High Definition MP4 video. You can stream them directly or download the full archive to your device.

📞 *Post-Production Hotline:*
If you need any raw cuts re-graded or have questions: *${hotLine}*.

Warm regards,
Baawaray Films Post-Production Team`;

    return this.sendDirectText(params.clientPhone, message);
  }
}

export const whatsappService = new WhatsAppService();
