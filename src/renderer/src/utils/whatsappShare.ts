import { Quotation, CrewRoleConfig, StudioSettingsConfig, PaymentAccountConfig } from '../types';
import { generateProposalPdf } from './pdf/proposal';
import { formatINR } from './formatters';
import { DEFAULT_WHATSAPP_QUOTATION_MESSAGE } from '../data/seedData';

/**
 * WhatsApp has no URL parameter for attachments — `wa.me?text=` carries text and
 * nothing else. So there are only two honest ways to put the quotation PDF in a
 * client's chat, and which one is available depends on the device:
 *
 *  - Phones and tablets expose the Web Share API with file support. That opens
 *    the system share sheet with the real PDF attached; picking WhatsApp sends it
 *    as a proper document, exactly as if it had been attached by hand.
 *  - Desktop browsers don't share files. There we download the PDF and open the
 *    client's WhatsApp Web chat with the message already written, leaving a
 *    single paperclip tap.
 */

export type ShareOutcome = 'shared' | 'download-and-chat' | 'cancelled';

/** WhatsApp wants a bare international number — no +, spaces, or punctuation. */
export function normalisePhone(phone: string): string {
  let digits = (phone || '').replace(/\D/g, '');
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  // A plain 10-digit Indian mobile needs the country code prepended.
  return digits.length === 10 ? `91${digits}` : digits;
}

/** Safe encoding to prevent double URL encoding */
function safeEncode(text: string): string {
  try {
    const decoded = decodeURIComponent(text);
    return encodeURIComponent(decoded);
  } catch {
    return encodeURIComponent(text);
  }
}

/**
 * Build a WhatsApp chat URL.
 * On desktop browsers, opens WhatsApp Web (https://web.whatsapp.com/send/?phone=...&text=...)
 * directly with the target chat open and message pre-filled.
 * On mobile devices, uses https://wa.me/... to open the native WhatsApp application.
 */
export function getWhatsAppUrl(phone?: string | null, message?: string): string {
  const target = normalisePhone(phone || '');
  const isMobile = typeof navigator !== 'undefined' && (
    /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  );

  const encodedText = message ? safeEncode(message) : '';

  if (!target) {
    return encodedText ? `https://web.whatsapp.com/send/?text=${encodedText}` : 'https://web.whatsapp.com';
  }

  if (isMobile) {
    return `https://wa.me/${target}${encodedText ? `?text=${encodedText}` : ''}`;
  }

  return `https://web.whatsapp.com/send/?phone=${target}${encodedText ? `&text=${encodedText}` : ''}`;
}

/** Substitute the studio's template placeholders with this quotation's values. */
export function quotationWhatsappMessage(
  quotation: Quotation,
  studioName = 'Baawaray Films',
  template?: string,
  validityDays = 7
): string {
  const source = (template || '').trim() || DEFAULT_WHATSAPP_QUOTATION_MESSAGE;

  const values: Record<string, string> = {
    client_name: quotation.clientName || 'there',
    studio_name: studioName,
    quote_number: quotation.quoteNumber || '',
    total: quotation.totalAmount ? formatINR(quotation.totalAmount) : '',
    validity_days: String(validityDays),
  };

  // An unknown placeholder is left visible rather than silently blanked — a typo
  // in the template should be obvious in the preview, not vanish at send time.
  return source.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) =>
    key in values ? values[key] : match
  );
}

export interface ProposalContext {
  crewRoles?: CrewRoleConfig[];
  settings?: StudioSettingsConfig;
  terms?: string[];
  accounts?: PaymentAccountConfig[];
  ownerPhone?: string;
}

export async function shareQuotationOnWhatsapp(
  quotation: Quotation,
  customTerms?: string[],
  crewRoles?: CrewRoleConfig[],
  studioName?: string,
  messageTemplate?: string,
  validityDays?: number,
  context?: ProposalContext
): Promise<ShareOutcome> {
  const proposalOpts = {
    crewRoles: context?.crewRoles ?? crewRoles,
    settings: context?.settings,
    terms: context?.terms ?? customTerms,
    accounts: context?.accounts,
    ownerPhone: context?.ownerPhone,
  };
  const message = quotationWhatsappMessage(quotation, studioName, messageTemplate, validityDays);
  const phone = normalisePhone(quotation.phone || '');
  const chatUrl = getWhatsAppUrl(phone, message);

  const isMobile = typeof navigator !== 'undefined' && (
    /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  );

  // Mobile: hand the actual PDF to the share sheet if supported.
  if (isMobile) {
    const file = generateProposalPdf(quotation, { ...proposalOpts, returnFile: true }) as File;
    if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: message });
        return 'shared';
      } catch (err) {
        // The user backing out of the share sheet is a normal outcome, not a failure.
        if ((err as Error)?.name === 'AbortError') return 'cancelled';
        // Anything else falls through to the direct URL path
      }
    }
    // Fallback on mobile if share sheet is not supported or failed
    window.location.href = chatUrl;
    return 'download-and-chat';
  }

  // Desktop: open WhatsApp Web directly with the message already typed, and download the PDF.
  // Open the WhatsApp Web tab immediately in the user gesture to prevent popup blockers from blocking it.
  const opened = window.open(chatUrl, '_blank', 'noopener,noreferrer');
  if (!opened) {
    window.location.href = chatUrl;
  }
  generateProposalPdf(quotation, proposalOpts);
  return 'download-and-chat';
}

