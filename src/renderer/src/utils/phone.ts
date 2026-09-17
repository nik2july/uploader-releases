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
  { code: '1', country: 'Canada / USA', flag: '🇨🇦/🇺🇸' },
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
 * Automatically extracts the dial code and cleans the national number if the phone
 * input contains a country prefix (e.g. +49 1514 500 4962, +91 9876543210).
 */
export function detectDialCode(
  phone: string | null | undefined,
  currentDialCode?: string | null
): { dialCode: string; nationalNumber: string } {
  if (!phone) return { dialCode: currentDialCode || DEFAULT_DIAL_CODE, nationalNumber: '' };
  const trimmed = String(phone).trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return { dialCode: currentDialCode || DEFAULT_DIAL_CODE, nationalNumber: trimmed };

  // 1. Explicit + notation or 00 international prefix:
  if (trimmed.startsWith('+') || digits.startsWith('00')) {
    const raw = trimmed.startsWith('+') ? digits : digits.slice(2);
    const sorted = [...DIAL_CODES].sort((a, b) => b.code.length - a.code.length);
    const matched = sorted.find(d => raw.startsWith(d.code));
    if (matched) {
      let national = raw.slice(matched.code.length);
      // Only for +1 (Canada/USA): if 11 digits starting with 1, strip redundant leading 1
      if (matched.code === '1' && national.length === 11 && national.startsWith('1')) {
        national = national.slice(1);
      }
      return { dialCode: matched.code, nationalNumber: national };
    }
  }

  // 2. If currentDialCode is set, respect the user-selected country!
  if (currentDialCode) {
    const code = currentDialCode.replace(/\D/g, '');
    // If digits already starts with the dial code (e.g. 4915145004962), strip it for the national number input
    if (code && digits.startsWith(code) && digits.length > code.length + 5) {
      return { dialCode: code, nationalNumber: digits.slice(code.length) };
    }
    // Only for +1: if user typed 11 digits starting with 1, strip leading 1
    if (code === '1' && digits.length === 11 && digits.startsWith('1')) {
      return { dialCode: '1', nationalNumber: digits.slice(1) };
    }
    return { dialCode: code, nationalNumber: digits };
  }

  // 3. Fallback: check if digits starts with any known dial code
  const sorted = [...DIAL_CODES].sort((a, b) => b.code.length - a.code.length);
  const matched = sorted.find(d => digits.startsWith(d.code) && digits.length > d.code.length + 5);
  if (matched) {
    return { dialCode: matched.code, nationalNumber: digits.slice(matched.code.length) };
  }

  return { dialCode: DEFAULT_DIAL_CODE, nationalNumber: digits };
}

/**
 * The number WhatsApp wants, or null when there is nothing usable.
 */
export function toWhatsAppNumber(
  phone: string | null | undefined,
  dialCode?: string | null
): string | null {
  if (!phone) return null;
  const trimmed = String(phone).trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  // Written internationally already: +49…, 0049…
  if (trimmed.startsWith('+')) return digits;
  if (digits.startsWith('00')) return digits.slice(2);

  const code = (dialCode || DEFAULT_DIAL_CODE).replace(/\D/g, '');

  // If already carries the country code with no plus in front of it:
  if (code && digits.startsWith(code) && digits.length > code.length + 5) {
    return digits;
  }

  // If dialCode is 1 (USA / Canada) and user entered 11 digits starting with 1 (e.g. 1514...):
  if (code === '1' && digits.length === 11 && digits.startsWith('1')) {
    return digits;
  }

  return `${code}${digits}`;
}

/** The same number written for a human to read back: +49 15145004962. */
export function formatInternational(
  phone: string | null | undefined,
  dialCode?: string | null
): string {
  const full = toWhatsAppNumber(phone, dialCode);
  if (!full) return '';
  const code = [...DIAL_CODES]
    .sort((a, b) => b.code.length - a.code.length)
    .find(c => full.startsWith(c.code));
  return code ? `+${code.code} ${full.slice(code.code.length)}` : `+${full}`;
}

/** A WhatsApp chat link with the message already written, or null without a usable number.
 * On desktop, routes directly to WhatsApp Web with the chat open and prefilled message.
 */
export function whatsAppLink(
  phone: string | null | undefined,
  dialCode: string | null | undefined,
  message?: string
): string | null {
  const number = toWhatsAppNumber(phone, dialCode);
  if (!number) return null;
  const isMobile = typeof navigator !== 'undefined' && (
    /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  );
  const encodedText = message ? encodeURIComponent(message) : '';
  if (isMobile) {
    return `https://wa.me/${number}${encodedText ? `?text=${encodedText}` : ''}`;
  }
  return `https://web.whatsapp.com/send/?phone=${number}${encodedText ? `&text=${encodedText}` : ''}`;
}
