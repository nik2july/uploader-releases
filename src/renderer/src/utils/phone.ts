/**
 * Turning a phone number as the studio typed it into one WhatsApp will accept.
 *
 * wa.me needs a full international number and nothing else — no plus, no spaces, no
 * brackets. A bare ten-digit number opens a chat with nobody, silently, which is how a
 * message to a studio in Dubai or Toronto quietly went nowhere. The country is
 * therefore recorded alongside the number rather than assumed from the digits, because
 * the digits genuinely cannot tell you: ten of them are an Indian mobile, a US line
 * with the area code, and half of Europe.
 */

export interface DialCode {
  code: string;
  country: string;
  flag: string;
}

/**
 * The countries the studio actually works with, India first. Not a complete list on
 * purpose — a picker of two hundred entries is slower to use than typing the number
 * with a + in front of it, which is always accepted below.
 */
export const DIAL_CODES: DialCode[] = [
  { code: '91', country: 'India', flag: '🇮🇳' },
  { code: '1', country: 'USA / Canada', flag: '🇺🇸' },
  { code: '971', country: 'UAE', flag: '🇦🇪' },
  { code: '44', country: 'United Kingdom', flag: '🇬🇧' },
  { code: '49', country: 'Germany', flag: '🇩🇪' },
  { code: '61', country: 'Australia', flag: '🇦🇺' },
  { code: '64', country: 'New Zealand', flag: '🇳🇿' },
  { code: '65', country: 'Singapore', flag: '🇸🇬' },
  { code: '60', country: 'Malaysia', flag: '🇲🇾' },
  { code: '966', country: 'Saudi Arabia', flag: '🇸🇦' },
  { code: '974', country: 'Qatar', flag: '🇶🇦' },
  { code: '968', country: 'Oman', flag: '🇴🇲' },
  { code: '39', country: 'Italy', flag: '🇮🇹' },
  { code: '33', country: 'France', flag: '🇫🇷' },
  { code: '41', country: 'Switzerland', flag: '🇨🇭' },
  { code: '31', country: 'Netherlands', flag: '🇳🇱' },
  { code: '353', country: 'Ireland', flag: '🇮🇪' },
  { code: '27', country: 'South Africa', flag: '🇿🇦' },
  { code: '254', country: 'Kenya', flag: '🇰🇪' },
  { code: '977', country: 'Nepal', flag: '🇳🇵' },
];

/** What a number is assumed to be when nothing says otherwise. */
export const DEFAULT_DIAL_CODE = '91';

/**
 * The number WhatsApp wants, or null when there is nothing usable.
 *
 * A number typed with its own country code wins over the recorded country — someone
 * who took the trouble to write +1 meant it, whatever the record says.
 */
export function toWhatsAppNumber(
  phone: string | null | undefined,
  dialCode?: string | null
): string | null {
  if (!phone) return null;
  const trimmed = String(phone).trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  // Written internationally already: +971…, 00971…, or a number that simply begins
  // with its country code.
  if (trimmed.startsWith('+')) return digits;
  if (digits.startsWith('00')) return digits.slice(2);

  const code = (dialCode || DEFAULT_DIAL_CODE).replace(/\D/g, '');
  // Already carries the country code with no plus in front of it.
  if (code && digits.startsWith(code) && digits.length > code.length + 5) return digits;

  return `${code}${digits}`;
}

/** The same number written for a human to read back: +971 501234567. */
export function formatInternational(
  phone: string | null | undefined,
  dialCode?: string | null
): string {
  const full = toWhatsAppNumber(phone, dialCode);
  if (!full) return '';
  const code = DIAL_CODES.map(d => d.code)
    .sort((a, b) => b.length - a.length)
    .find(c => full.startsWith(c));
  return code ? `+${code} ${full.slice(code.length)}` : `+${full}`;
}

/** A wa.me link with the message already written, or null without a usable number. */
export function whatsAppLink(
  phone: string | null | undefined,
  dialCode: string | null | undefined,
  message?: string
): string | null {
  const number = toWhatsAppNumber(phone, dialCode);
  if (!number) return null;
  return `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}
