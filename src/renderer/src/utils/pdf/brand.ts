/**
 * Every visual decision for the studio's PDFs, in one place.
 *
 * Direction A — "Marigold Index". A light, warm-paper document.
 *
 * Section colour is sindoor throughout. The edge index originally changed hue per
 * section as well as position, which read as decoration rather than navigation —
 * position alone carries where you are, and one colour holds the document together.
 * Marigold survives as the single accent on the cover rule and the schedule numerals.
 *
 * Change a value here and every document follows. Layout code reads these tokens and
 * never hard-codes a colour, a size or a millimetre.
 */

export type RGB = [number, number, number];

/* ---------------------------------------------------------------- geometry --
 * 105 × 187 mm is 9:16 — the proportion of the screen this is read on. At a phone's
 * fit-to-width that is 3.71 px/mm, so 12 pt body text lands at ~15.7 px and the
 * 85 mm column holds ~40 characters. On A4 the same 10 pt body renders at 6.5 px,
 * which is the actual reason the old documents were unreadable on a phone.
 */
export const PAGE = {
  width: 105,
  height: 187,
  margin: 10,
  /** Text column: width − 2 × margin. */
  get column() {
    return this.width - this.margin * 2;
  },
  /** Baseline the running footer sits on. */
  get footerY() {
    return this.height - 6;
  },
} as const;

/* -------------------------------------------------------------------- type --
 * 9 pt is the floor — below it text stops being legible at fit-width. The total
 * investment figure is the largest type in any document, by design.
 */
export const TYPE = {
  hero: 30,
  title: 23,
  heading: 17,
  subheading: 15,
  body: 12,
  small: 10,
  floor: 9,
  /**
   * The section title at the top of every page, set in the wordmark face so it
   * belongs to the same system as BAAWARAY on the cover. Long titles are fitted
   * down to the column width; this is the ceiling a short one may reach.
   */
  sectionTitle: 18,
  /**
   * Small tracked caps for sub-labels inside a page — "YOUR CREW", "TOTAL".
   *
   * Kept separate from `floor` so the running footer and page numbers stay at the
   * 9 pt minimum while the page's own heading reads as a heading — at 9 pt it was
   * the same size as the footer it was competing with.
   */
  label: 11,
  /** Multiplied by point size to get leading in mm. 1.55 × pt × 0.3528. */
  leading: 1.55,
  /** Tracking for the small uppercase labels that mark each section. */
  labelTracking: 1.1,
} as const;

/** Point size to line height in millimetres. */
export function lineHeight(points: number, multiple: number = TYPE.leading): number {
  return points * 0.3528 * multiple;
}

/* ------------------------------------------------------------------ colour --
 * Paper rather than cream: cooler and less yellow than the template beige, so it
 * reads as stock. Section hues are drawn from the ceremonies themselves.
 */
export const COLOR = {
  paper: [251, 250, 247] as RGB,
  ink: [26, 24, 20] as RGB,
  muted: [107, 101, 92] as RGB,
  rule: [214, 208, 198] as RGB,

  marigold: [232, 163, 23] as RGB,
  mehendi: [74, 103, 65] as RGB,
  sindoor: [155, 34, 38] as RGB,
} as const;

/**
 * The section a page belongs to, and the colour that marks it.
 *
 * The order is the reading order — `indexPosition` derives from it, so adding a
 * section here moves the edge index automatically rather than needing new numbers.
 *
 * Only sections that are actually a page belong here. Several ids once held a slot
 * without ever being one, which squeezed every real bar into the top of the track
 * and made the index read as if the document ended early. 'approach' went the same
 * way when About us and Our approach were folded onto the cover.
 */
export const SECTIONS = [
  { id: 'cover', label: 'Cover', color: COLOR.sindoor },
  { id: 'celebration', label: 'Events', color: COLOR.sindoor },
  { id: 'receive', label: 'Deliverables', color: COLOR.sindoor },
  { id: 'investment', label: 'Investment', color: COLOR.sindoor },
  { id: 'confirm', label: 'Confirming your date', color: COLOR.sindoor },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];

/**
 * The edge index — the signature of this direction.
 *
 * A short colour bar on the outer edge whose vertical position advances with the
 * section, like a thumb index cut into a book. It survives WhatsApp's ~200 px
 * thumbnail and the abrupt page transitions of its viewer, so flicking through
 * gives a physical sense of position without reading a word. It costs no vertical
 * space, which on a 187 mm page matters.
 */
export const INDEX_BAR = {
  /**
   * Visibly thicker than the frame it sits on, or it stops being a position marker
   * and just reads as part of the border — which is what happened when the two were
   * the same width in the same colour.
   */
  width: 2.4,
  length: 14,
  /** Top and bottom of the travel range the bar moves through. */
  trackTop: 24,
  trackBottom: PAGE.height - 38,
} as const;

export function indexBarY(section: SectionId): number {
  const i = SECTIONS.findIndex(s => s.id === section);
  const last = SECTIONS.length - 1;
  const t = last <= 0 ? 0 : Math.max(0, i) / last;
  return INDEX_BAR.trackTop + t * (INDEX_BAR.trackBottom - INDEX_BAR.trackTop - INDEX_BAR.length);
}

export function sectionColor(section: SectionId): RGB {
  return (SECTIONS.find(s => s.id === section)?.color ?? COLOR.muted) as RGB;
}

/* ----------------------------------------------------------------- border --
 * A sindoor rule framing every page, replacing the band that used to sit across
 * the top of the cover alone. A frame reads as the document's edge on every page
 * rather than as a header on one, and it survives the WhatsApp thumbnail.
 */
export const BORDER = {
  inset: 5,
  /** Millimetres. Thin enough to read as a refined frame, not a painted band. */
  weight: 0.5,
} as const;

/* ------------------------------------------------------------------ rules --
 * The brief's floor: below 1 pt a rule aliases or vanishes on a phone screen.
 * 1 pt = 0.353 mm.
 */
export const RULE_WEIGHT = 0.4;

/* --------------------------------------------------------------- currency --
 * "Rs. ", not the rupee sign.
 *
 * This used to be '₹' on the claim that the embedded fonts carried U+20B9. They
 * do not — checking the cmap of all ten shows the glyph is in none of them, so
 * jsPDF dropped it silently and every figure in every proposal printed with no
 * currency marker at all: "7,50,000", never "₹7,50,000".
 *
 * `pdfExport`'s `pdfINR` had already reached the same conclusion independently
 * and rewrites ₹ to "Rs. " for the A4 documents; this makes the proposal agree,
 * so one form is used across everything the studio sends.
 *
 * Restoring '₹' means first embedding a face that actually has the glyph.
 */
export const CURRENCY_SYMBOL = 'Rs. ';

/* ------------------------------------------------------------------- meta --*/
export const STUDIO = {
  name: 'BAAWARAY FILMS',
  /** Shown as the wordmark itself — the lockup spells this, not the full name. */
  wordmark: 'BAAWARAY',
  /**
   * The studio's own introduction, carried on the cover.
   *
   * Brand copy rather than a per-quotation field: it is the same on every proposal,
   * and it moved here when the About us and Our approach pages were folded into the
   * cover. The `aboutUs` / `ourApproach` fields in Studio Settings no longer feed
   * the proposal — this constant does.
   */
  about: [
    'Baawaray Films is a storytelling-driven wedding photography and filmmaking studio built to capture celebrations with honesty, emotion, and timeless craft. Founded in 2018 by Nikhil Sabharwal (Founder & Creative Director), BAAWARAY was created with a clear vision—to elevate wedding documentation from simple coverage to meaningful visual storytelling.',
    'Today, we work as a dedicated team of photographers, filmmakers, and editors, aligned by one signature style: natural moments, real emotions, and cinematic composition. Every wedding we take on is approached with planning, creative direction, and consistent post-production standards—so the final photographs and films feel authentic, artistic, and deeply personal.',
    'At BAAWARAY, we don\u2019t just capture events\u2014we preserve stories you can relive for a lifetime.',
  ],
} as const;
