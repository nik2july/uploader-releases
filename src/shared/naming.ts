import type { StudioClientEvent } from './contracts';
import { STUDIO_WEB_APP_CLIENTS } from './studioClients';

/**
 * Converts a date string (e.g. "2026-10-28", "2026.10.28", "2026/10/28", or Date object)
 * into a 6-digit "yymmdd" string (e.g. "261028").
 */
export function formatYymmdd(dateInput?: string | Date): string {
  if (!dateInput) return '';

  let dateStr = '';
  if (dateInput instanceof Date) {
    const y = String(dateInput.getFullYear());
    const m = String(dateInput.getMonth() + 1).padStart(2, '0');
    const d = String(dateInput.getDate()).padStart(2, '0');
    dateStr = `${y}${m}${d}`;
  } else {
    dateStr = String(dateInput).trim();
  }

  // Strip all non-numeric characters
  const digits = dateStr.replace(/\D/g, '');

  // If 8 digits (YYYYMMDD): take last 2 digits of year + month + day
  if (digits.length >= 8) {
    const yyyy = digits.slice(0, 4);
    const mm = digits.slice(4, 6);
    const dd = digits.slice(6, 8);
    return `${yyyy.slice(2)}${mm}${dd}`;
  }

  // If already 6 digits (YYMMDD)
  if (digits.length === 6) {
    return digits;
  }

  return digits;
}

/**
 * Determines the main event based on studio priority:
 * 1. Priority 1: Event named "Wedding" (or containing "wedding" case-insensitively).
 * 2. Priority 2: Event with maximum number of cinematographers.
 * 3. Priority 3: Fallback to the first event or current event.
 */
export function resolveMainEvent(
  events?: StudioClientEvent[],
  currentEventName?: string,
  currentEventDate?: string,
  currentCinematographers?: string[]
): { eventName: string; date: string; cinematographers: string[] } {
  const allEvents = events && events.length > 0 ? [...events] : [];

  if (allEvents.length === 0) {
    return {
      eventName: currentEventName || 'Wedding',
      date: currentEventDate || '',
      cinematographers: currentCinematographers || []
    };
  }

  // Priority 1: Look for "Wedding"
  const weddingEvent = allEvents.find(e =>
    e.eventName && e.eventName.toLowerCase().includes('wedding')
  );
  if (weddingEvent) {
    return {
      eventName: weddingEvent.eventName,
      date: weddingEvent.date,
      cinematographers: weddingEvent.cinematographers || []
    };
  }

  // Priority 2: Event with maximum number of cinematographers
  let topEvent = allEvents[0];
  let topCines = (topEvent.cinematographers || []).length;

  for (let i = 1; i < allEvents.length; i++) {
    const cinesCount = (allEvents[i].cinematographers || []).length;
    if (cinesCount > topCines) {
      topCines = cinesCount;
      topEvent = allEvents[i];
    }
  }

  return {
    eventName: topEvent.eventName,
    date: topEvent.date,
    cinematographers: topEvent.cinematographers || []
  };
}

/**
 * Formats a date into YYYY.MM.DD (e.g. "2026.10.28")
 */
export function formatYyyyMmDd(dateInput?: string | Date): string {
  if (!dateInput) return '';
  if (dateInput instanceof Date) {
    const y = String(dateInput.getFullYear());
    const m = String(dateInput.getMonth() + 1).padStart(2, '0');
    const d = String(dateInput.getDate()).padStart(2, '0');
    return `${y}.${m}.${d}`;
  }
  const clean = String(dateInput).trim();
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(clean)) return clean;
  const m = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    return `${m[1]}.${m[2].padStart(2, '0')}.${m[3].padStart(2, '0')}`;
  }
  const digits = clean.replace(/\D/g, '');
  if (digits.length >= 8) {
    return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`;
  }
  return clean.replace(/-/g, '.');
}

/**
 * Formats event folder name with date format before the event name:
 * `<YYYY.MM.DD> - <Event Name>` (e.g. "2026.10.28 - Wedding")
 */
export function formatEventSubfolderName(
  eventName: string,
  eventDate?: string | Date,
  clientName?: string
): string {
  const safeEvent = (eventName || 'Wedding').trim().replace(/[/\\?%*:|"<>]/g, '-');
  if (/^\d{4}\.\d{2}\.\d{2}\s*-\s*/.test(safeEvent)) {
    return safeEvent;
  }
  let dateToFormat = eventDate;
  if (!dateToFormat && clientName) {
    const rawClient = clientName.trim();
    const cleanClient = rawClient.replace(/^(\d{6})\s+/, '');
    const prefixMatch = rawClient.match(/^(\d{2})(\d{2})(\d{2})\s+/);

    const match = STUDIO_WEB_APP_CLIENTS.find(
      c => c.name.toLowerCase() === rawClient.toLowerCase() ||
           c.name.toLowerCase() === cleanClient.toLowerCase()
    );
    if (match) {
      const mainEv = resolveMainEvent(match.events, safeEvent);
      dateToFormat = mainEv.date;
    } else if (prefixMatch) {
      // Derive YYYY-MM-DD from YYMMDD
      dateToFormat = `20${prefixMatch[1]}-${prefixMatch[2]}-${prefixMatch[3]}`;
    }
  }
  const dateFormatted = formatYyyyMmDd(dateToFormat);
  if (dateFormatted) {
    return `${dateFormatted} - ${safeEvent}`;
  }
  return safeEvent;
}

/**
 * Computes the standardized root project folder name:
 * `<yymmdd> <Client Name>` e.g. "261028 Dhanur & Jhanvi"
 */
export function computeProjectRootFolderName(
  clientName: string,
  events?: StudioClientEvent[],
  fallbackDate?: string,
  fallbackEventName?: string,
  fallbackCinematographers?: string[]
): string {
  const cleanClient = (clientName || '').trim().replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ');
  if (!cleanClient) return 'Untitled Project';

  // Check if clientName already begins with a 6-digit date prefix (e.g. "261028 ")
  const existingPrefixMatch = cleanClient.match(/^(\d{6})\s+(.*)$/);
  if (existingPrefixMatch) {
    return cleanClient;
  }

  // If events not provided, look up in studio web app clients database
  let resolvedEvents = events;
  if (!resolvedEvents || resolvedEvents.length === 0) {
    const match = STUDIO_WEB_APP_CLIENTS.find(
      c => c.name.toLowerCase() === cleanClient.toLowerCase()
    );
    if (match?.events && match.events.length > 0) {
      resolvedEvents = match.events;
    }
  }

  const mainEv = resolveMainEvent(resolvedEvents, fallbackEventName, fallbackDate, fallbackCinematographers);
  const dateToUse = mainEv.date || fallbackDate || '';
  const yymmdd = formatYymmdd(dateToUse);

  if (yymmdd) {
    return `${yymmdd} ${cleanClient}`;
  }

  return cleanClient;
}
