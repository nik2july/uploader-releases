import type { jsPDF } from 'jspdf';
import {
  EDITORS_NOTE_BOLD,
  EDITORS_NOTE_REGULAR,
  EDITORS_NOTE_ITALIC,
  SATOSHI_REGULAR,
  SATOSHI_MEDIUM,
  MADA_REGULAR,
  MADA_BOLD,
  MADA_LIGHT,
  TAN_MERINGUE,
  THE_SEASONS_REGULAR
} from './fonts';

export const DISPLAY = 'The Seasons';
export const HEADING = 'The Seasons';
export const SUBTITLE = 'Satoshi';
export const BODY = 'Mada';
export const WORDMARK = 'Tan Meringue';

export function registerStudioFonts(doc: jsPDF): void {
  doc.addFileToVFS('TheSeasons-Regular.otf', THE_SEASONS_REGULAR);
  doc.addFont('TheSeasons-Regular.otf', 'The Seasons', 'normal');
  // Editor's Note
  doc.addFileToVFS('EditorsNote-Regular.otf', EDITORS_NOTE_REGULAR);
  doc.addFont('EditorsNote-Regular.otf', DISPLAY, 'normal');
  doc.addFileToVFS('EditorsNote-Bold.otf', EDITORS_NOTE_BOLD);
  doc.addFont('EditorsNote-Bold.otf', DISPLAY, 'bold');
  doc.addFileToVFS('EditorsNote-Italic.otf', EDITORS_NOTE_ITALIC);
  doc.addFont('EditorsNote-Italic.otf', DISPLAY, 'italic');

  // Satoshi
  doc.addFileToVFS('Satoshi-Regular.ttf', SATOSHI_REGULAR);
  doc.addFont('Satoshi-Regular.ttf', SUBTITLE, 'normal');
  doc.addFileToVFS('Satoshi-Medium.ttf', SATOSHI_MEDIUM);
  doc.addFont('Satoshi-Medium.ttf', SUBTITLE, 'bold'); // Mapping medium to bold for subtitle logic

  // Mada
  doc.addFileToVFS('Mada-Regular.ttf', MADA_REGULAR);
  doc.addFont('Mada-Regular.ttf', BODY, 'normal');
  doc.addFileToVFS('Mada-Bold.ttf', MADA_BOLD);
  doc.addFont('Mada-Bold.ttf', BODY, 'bold');
  doc.addFileToVFS('Mada-Light.ttf', MADA_LIGHT);
  doc.addFont('Mada-Light.ttf', BODY, 'light'); // some versions of jsPDF accept light, otherwise italic is fallback. Wait, let's use 'italic' for light to hack it, or just register it as a different family?

  // Tan Meringue
  doc.addFileToVFS('TanMeringue.ttf', TAN_MERINGUE);
  doc.addFont('TanMeringue.ttf', WORDMARK, 'normal');
}
export const UI = 'Mada';
