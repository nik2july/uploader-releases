import type { jsPDF } from 'jspdf';
import {
  BORDER, COLOR, INDEX_BAR, PAGE, RULE_WEIGHT, SECTIONS, STUDIO, TYPE,
  indexBarY, lineHeight, sectionColor, type RGB, type SectionId,
} from './brand';
import { BODY, DISPLAY, UI, WORDMARK } from './registerFonts';


/**
 * Drawing primitives for the studio's documents.
 *
 * Everything is measured before it is drawn. jsPDF has no notion of flow, so a
 * "page-break-inside: avoid" is expressed here as: ask how tall this block will be,
 * and start a new page if it will not fit. That is what keeps a single thought from
 * splitting across the abrupt page transitions of a phone PDF viewer.
 */

export interface Ctx {
  doc: jsPDF;
  /** Vertical cursor, in millimetres from the top of the page. */
  y: number;
  section: SectionId;
  /** Footer strings — reference and validity, per the brief. */
  reference: string;
  validity: string;
}

export function setInk(doc: jsPDF, c: RGB) { doc.setTextColor(c[0], c[1], c[2]); }
export function setFill(doc: jsPDF, c: RGB) { doc.setFillColor(c[0], c[1], c[2]); }
export function setStroke(doc: jsPDF, c: RGB) { doc.setDrawColor(c[0], c[1], c[2]); }

/** Paint the page ground. A white default would flash against the paper tone. */
export function paintGround(doc: jsPDF, colour: RGB = COLOR.paper): void {
  setFill(doc, colour);
  doc.rect(0, 0, PAGE.width, PAGE.height, 'F');
  drawBorder(doc);
}

/** The sindoor frame. Lives in `paintGround` so no page can be drawn without it. */
export function drawBorder(doc: jsPDF): void {
  doc.setDrawColor(COLOR.sindoor[0], COLOR.sindoor[1], COLOR.sindoor[2]);
  doc.setLineWidth(BORDER.weight);
  // Square corners: a mitred join keeps the frame reading as one band rather than
  // four strokes that happen to meet.
  doc.setLineJoin('miter');
  doc.rect(
    BORDER.inset,
    BORDER.inset,
    PAGE.width - BORDER.inset * 2,
    PAGE.height - BORDER.inset * 2,
    'S'
  );
}

/**
 * The edge index — this document's signature.
 *
 * A short bar on the outer edge that advances down the page as the reader moves
 * through the sections, like a thumb index cut into a book. It is the one element
 * that still reads at WhatsApp's ~200 px thumbnail.
 */
export function drawIndexBar(doc: jsPDF, section: SectionId): void {
  setFill(doc, sectionColor(section));
  // Centred on the frame's right edge, so it reads as the border thickening at
  // this section rather than as a bar floating outside the page's own boundary.
  doc.rect(
    PAGE.width - BORDER.inset - INDEX_BAR.width / 2,
    indexBarY(section),
    INDEX_BAR.width,
    INDEX_BAR.length,
    'F'
  );
}

/**
 * Reference and validity together on the left, page number on the right.
 *
 * These were three separately positioned items — left, centre, right — and a full
 * validity date is wide enough that it ran into the centred page number. Two items
 * cannot collide.
 */
export function drawFooter(ctx: Ctx): void {
  const { doc } = ctx;
  doc.setFont(BODY, 'normal');
  doc.setFontSize(TYPE.floor);
  setInk(doc, COLOR.muted);
  const left = [ctx.reference, ctx.validity].filter(Boolean).join('   ·   ');
  doc.text(left, PAGE.margin, PAGE.footerY);
}

/** Start a page in a section. Ground, index bar and footer come with it. */
export function newPage(ctx: Ctx, section: SectionId, opts?: { chrome?: boolean }): void {
  ctx.doc.addPage([PAGE.width, PAGE.height], 'portrait');
  ctx.section = section;
  paintGround(ctx.doc);
  if (opts?.chrome !== false) {
    drawIndexBar(ctx.doc, section);
    drawFooter(ctx);
  }
  ctx.y = PAGE.margin + 8;
}

/** Room left before the footer would be crowded. */
export function remaining(ctx: Ctx): number {
  return PAGE.footerY - 8 - ctx.y;
}

/** Start a new page if `height` will not fit — the flow equivalent of avoiding a break. */
export function ensure(ctx: Ctx, height: number, section?: SectionId): void {
  if (remaining(ctx) < height) newPage(ctx, section ?? ctx.section);
}

/**
 * Measure wrapped text without drawing it.
 *
 * The font family matters as much as the size: `splitTextToSize` wraps using
 * whatever face is currently set, so measuring body copy while the display face is
 * still active returns the wrong line count — and blocks then get pushed onto pages
 * they would have fitted on.
 */
export function measure(
  doc: jsPDF,
  text: string,
  points: number,
  width: number = PAGE.column,
  family: string = BODY
): number {
  const prev = doc.getFont();
  doc.setFont(family, 'normal');
  doc.setFontSize(points);
  const lines = doc.splitTextToSize(text, width) as string[];
  doc.setFont(prev.fontName, prev.fontStyle);
  return lines.length * lineHeight(points);
}

/** The small tracked capital that names a section. */
export function sectionLabel(ctx: Ctx, label: string): void {
  const { doc } = ctx;
  /* Set in the display serif at the scale of the cover wordmark.
   *
   * Not in Tan Meringue: that face is the wordmark's alone, and using it for
   * section titles too made BAAWARAY one heading among five rather than the
   * studio's mark. The display serif is already the couple's name and every event
   * title, so the sections sit inside a family the document has established.
   *
   * Sized to the page rather than fixed: "EVENTS" and "CONFIRMING YOUR DATE" want
   * very different point sizes to carry the same visual weight, so each is fitted
   * to the column and capped so a short word cannot balloon. */
  doc.setFont(DISPLAY, 'normal');
  doc.setFontSize(TYPE.sectionTitle);
  const text = label.toUpperCase();
  // Fit to slightly inside the column: at full column width the longest titles
  // ran right up against the frame, which read as clipped rather than as set.
  const maxWidth = PAGE.column - 5;
  const natural = doc.getTextWidth(text);
  const fitted =
    natural > maxWidth ? (TYPE.sectionTitle * maxWidth) / natural : TYPE.sectionTitle;
  doc.setFontSize(fitted);
  setInk(doc, sectionColor(ctx.section));
  doc.text(text, PAGE.margin, ctx.y);
  ctx.y += lineHeight(fitted, 1.1) + 4;
}

export function heading(ctx: Ctx, text: string, points: number = TYPE.title): void {
  const { doc } = ctx;
  doc.setFont(DISPLAY, 'normal');
  doc.setFontSize(points);
  setInk(doc, COLOR.ink);
  const lines = doc.splitTextToSize(text, PAGE.column) as string[];
  doc.text(lines, PAGE.margin, ctx.y);
  ctx.y += lines.length * lineHeight(points, 1.2) + 2;
}

export function body(
  ctx: Ctx,
  text: string,
  opts?: { points?: number; colour?: RGB; gap?: number; width?: number }
): void {
  const { doc } = ctx;
  const points = opts?.points ?? TYPE.body;
  doc.setFont(BODY, 'normal');
  doc.setFontSize(points);
  setInk(doc, opts?.colour ?? COLOR.ink);
  const lines = doc.splitTextToSize(text, opts?.width ?? PAGE.column) as string[];
  doc.text(lines, PAGE.margin, ctx.y);
  ctx.y += lines.length * lineHeight(points) + (opts?.gap ?? 3);
}

/** Body copy split on blank lines, so studio-written prose keeps its paragraphs. */
export function paragraphs(ctx: Ctx, text: string, points: number = TYPE.body): void {
  text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean)
    .forEach(p => {
      ensure(ctx, measure(ctx.doc, p, points) + 4);
      body(ctx, p.replace(/\s*\n\s*/g, ' '), { points, gap: 4 });
    });
}

/** A label/value row, value right-aligned. Never a grid — the brief's two-column cap. */
export function row(
  ctx: Ctx,
  label: string,
  value: string,
  opts?: { bold?: boolean; colour?: RGB; points?: number }
): void {
  const { doc } = ctx;
  const points = opts?.points ?? TYPE.body;
  doc.setFontSize(points);
  doc.setFont(BODY, opts?.bold ? 'bold' : 'normal');
  setInk(doc, COLOR.muted);
  doc.text(label, PAGE.margin, ctx.y);
  setInk(doc, opts?.colour ?? COLOR.ink);
  doc.setFont(BODY, 'bold');
  doc.text(value, PAGE.width - PAGE.margin - INDEX_BAR.width - 1, ctx.y, { align: 'right' });
  ctx.y += lineHeight(points);
}

export function rule(ctx: Ctx, colour: RGB = COLOR.rule): void {
  setStroke(ctx.doc, colour);
  ctx.doc.setLineWidth(RULE_WEIGHT);
  ctx.doc.line(
    PAGE.margin,
    ctx.y,
    PAGE.width - PAGE.margin - INDEX_BAR.width - 1,
    ctx.y
  );
  ctx.y += 4;
}

export function space(ctx: Ctx, mm: number): void {
  ctx.y += mm;
}

/** The studio wordmark, used on the cover and back cover. */
/** Footprint the wordmark has always occupied, in mm. */
const WORDMARK_WIDTH = 28;

/**
 * The studio wordmark on the cover and back page.
 *
 * Set in Tan Meringue — the face the logo lockup is drawn from, and which is
 * already embedded. It used to go in through `doc.addSvgAsImage`, which returns
 * a Promise; this generator is synchronous, so `doc.output()` fired before the
 * SVG was ever rasterised and the logo appeared on no proposal ever sent.
 *
 * Type rather than an image is the better repair anyway: it stays sharp at any
 * zoom, costs nothing on top of a font already in the file, and takes a colour
 * again — a raster would have had to be re-exported per colour, and jsPDF stores
 * an alpha PNG as raw RGBA, which pushed the document from 100 KB to 2.9 MB and
 * out of WhatsApp's comfortable range.
 */
export function wordmark(
  doc: jsPDF,
  y: number,
  opts: { colour?: RGB; width?: number; centred?: boolean } = {}
): void {
  const { colour = COLOR.ink, width = WORDMARK_WIDTH, centred = false } = opts;
  doc.setFont(WORDMARK, 'normal');
  // Fit to a target width rather than trusting a fixed point size, so the mark
  // keeps its proportions if the face is ever swapped.
  doc.setFontSize(12);
  const widthAt12 = doc.getTextWidth(STUDIO.wordmark);
  doc.setFontSize(widthAt12 > 0 ? (12 * width) / widthAt12 : 12);
  setInk(doc, colour);
  if (centred) {
    doc.text(STUDIO.wordmark, PAGE.width / 2, y, { align: 'center' });
  } else {
    doc.text(STUDIO.wordmark, PAGE.margin, y);
  }
}

/** Page N of M, stamped once every page exists. */
export function stampPageNumbers(doc: jsPDF, skipFirst: boolean, skipLast: boolean): void {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    if ((skipFirst && i === 1) || (skipLast && i === total)) continue;
    doc.setPage(i);
    doc.setFont(BODY, 'normal');
    doc.setFontSize(TYPE.floor);
    setInk(doc, COLOR.muted);
    doc.text(`${i} / ${total}`, PAGE.width - PAGE.margin - INDEX_BAR.width - 1, PAGE.footerY, {
      align: 'right',
    });
  }
}

export const SECTION_LABELS: Record<string, string> = Object.fromEntries(
  SECTIONS.map(s => [s.id, s.label])
);
