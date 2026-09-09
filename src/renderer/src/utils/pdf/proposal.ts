import { jsPDF } from 'jspdf';
import type {
  ClientDeliverable, CrewRoleConfig, PaymentAccountConfig, Quotation,
  QuotationEvent, StudioSettingsConfig,
} from '../../types';
import { formatDate } from '../formatters';
import { CURRENCY_SYMBOL, COLOR, PAGE, STUDIO, TYPE, lineHeight } from './brand';
import { registerStudioFonts, BODY, DISPLAY, UI } from './registerFonts';
import { amountInWords } from './amountInWords';
import { INDEX_BAR } from './brand';
import {
  Ctx, body, drawFooter, drawIndexBar, ensure, heading, measure, newPage,
  paintGround, paragraphs, remaining, row, rule, sectionLabel, setInk, space,
  stampPageNumbers, wordmark,
} from './layout';

/**
 * The client proposal.
 *
 * Built to be read on a phone, because that is where it is read — usually inside
 * WhatsApp's viewer. The page is 105 × 187 mm (9:16), which at a phone's fit-to-width
 * puts 12 pt body text at roughly 15 px across a 40-character measure. The same copy
 * on A4 at 10 pt lands under 7 px, which is why the previous version could not be
 * read without pinching.
 *
 * One idea per page, single column throughout, nothing below 9 pt.
 */

/** Rupees with Indian digit grouping, using the one symbol the whole document uses. */
function money(amount: number | undefined | null): string {
  const n = Math.round(Number(amount) || 0);
  return CURRENCY_SYMBOL + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * A crew count that survives real service names.
 *
 * Appending an "s" works for "Photographer" and produces "Cinematographer (W)s" for
 * anything ending in a bracket, a digit or an abbreviation — which is most of a real
 * studio's roster. Those get a multiplication sign instead, which reads correctly
 * whatever the name is.
 */
function crewCount(n: number, name: string): string {
  if (n === 1) return `1 ${name}`;
  return /[A-Za-z]$/.test(name) ? `${n} ${name}s` : `${n} × ${name}`;
}

/** Crew on an event, named and counted, from the studio's own roster. */
function crewLines(evt: QuotationEvent, roles: CrewRoleConfig[]): string[] {
  const tr = evt.teamRequired || {};
  return roles
    .map(r => ({ name: r.name, qty: Number(tr[r.id]) || 0 }))
    .filter(r => r.qty > 0)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .map(r => crewCount(r.qty, r.name));
}

interface ProposalOptions {
  crewRoles?: CrewRoleConfig[];
  settings?: StudioSettingsConfig;
  terms?: string[];
  accounts?: PaymentAccountConfig[];
  ownerPhone?: string;
  /** Pinned so the same input produces the same bytes. Defaults to the quote's date. */
  issuedOn?: string;
  returnFile?: boolean;
}

export function generateProposalPdf(
  quotation: Quotation,
  options: ProposalOptions = {}
): File | void {
  const roles = options.crewRoles || [];
  const settings = options.settings;
  const copy = settings?.quotationBuilderSettings;
  const issued = options.issuedOn || quotation.createdAt || '';

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [PAGE.width, PAGE.height] });
  registerStudioFonts(doc);

  /* Draw text at the same leading the layout reserves for it.
   *
   * Every advance in this document is computed with `lineHeight()`, which uses
   * TYPE.leading (1.55). jsPDF, told nothing, drew multi-line text at its own
   * default of 1.15 — so a block was always painted tighter than the space booked
   * for it, and the leftover opened as a gap underneath. The error compounded with
   * length: the seven-line opening paragraph on the cover reserved ~10 mm more
   * than it used, which is the "too much space between paragraphs". */
  doc.setLineHeightFactor(TYPE.leading);

  const ctx: Ctx = {
    doc,
    y: PAGE.margin,
    section: 'cover',
    reference: quotation.quoteNumber || '',
    // Full date, no weekday. "Valid to 10 Sept" was the only abbreviated, year-less
    // date in the document, and it sat on every interior page.
    validity: quotation.validUntil
      ? `Valid to ${new Date(`${quotation.validUntil}T00:00:00`).toLocaleDateString('en-IN', {
          day: 'numeric', month: 'long', year: 'numeric',
        })}`
      : '',
  };

  /* ---------------------------------------------------------------- totals --
   * Recomputed from the line items at render time. A stored total can drift from
   * what it is made of; the document should never be the place that shows it.
   */
  const events = [...(quotation.events || [])].sort((a, b) =>
    (a.date || '').localeCompare(b.date || '')
  );
  /* Everything marked included is bought and is inside the total, whether or not it
   * carries a separate line price. Splitting the list into "included" and "available
   * as an addition" put the album under a heading that said optional while the
   * investment page charged for it — the couple was reading a contradiction. */
  const included = (quotation.deliverables || []).filter(d => d.included);

  const deliverablesTotal = included.reduce((s, d) => s + (Number(d.price) || 0), 0);
  const otherCharges = (quotation.otherCharges || []).filter(c => (Number(c.amount) || 0) !== 0);
  const otherTotal = otherCharges.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const eventsTotal = Math.max(0, (quotation.subtotal || 0) - deliverablesTotal - otherTotal);
  const subtotal = eventsTotal + deliverablesTotal + otherTotal;
  const discount =
    quotation.discountType === 'percentage'
      ? Math.round((subtotal * (quotation.discountValue || 0)) / 100)
      : Math.round(quotation.discountValue || 0);
  const afterDiscount = Math.max(0, subtotal - discount);
  const tax = Math.round((afterDiscount * (quotation.taxPercent || 0)) / 100);
  const total = afterDiscount + tax;

  /* ----------------------------------------------------------------- cover --
   * The whole introduction, on one page: the wordmark, who the studio is, and
   * whose wedding this is for. The About us and Our approach pages that used to
   * carry the middle part are gone — a couple opening this in WhatsApp met two
   * screens of studio copy before their own name appeared.
   *
   * Page 1 is also WhatsApp's ~200 px thumbnail, so the wordmark is set large
   * enough to be legible at that size and the couple's name sits below it.
   */
  paintGround(doc);

  /* Who is quoting, and for whom — the two labels the cover was missing. Set in
   * the small tracked caps used for every other label in the document, so they
   * introduce the names beneath them without competing with them. */
  const coverLabel = (text: string, y: number, centred: boolean) => {
    doc.setFont(UI, 'bold');
    doc.setFontSize(TYPE.floor);
    setInk(doc, COLOR.muted);
    doc.setCharSpace(TYPE.labelTracking);
    if (centred) {
      doc.text(text.toUpperCase(), PAGE.width / 2, y, { align: 'center' });
    } else {
      doc.text(text.toUpperCase(), PAGE.margin, y);
    }
    doc.setCharSpace(0);
  };

  coverLabel('Quotation by', 24, true);
  wordmark(doc, 38, { width: 74, centred: true, colour: COLOR.sindoor });

  /* The studio introduction, at 10 pt.
   *
   * A step down from the 12 pt body used elsewhere, and deliberately: at 12 pt this
   * copy runs 133 mm and there is only 167 mm on the page for it, the name, the
   * dates and the venue. 10 pt brings it to 95 mm and still clears the 9 pt floor
   * the document sets for phone reading. */
  let coverY = 46;
  doc.setFont(BODY, 'normal');
  doc.setFontSize(TYPE.small);
  setInk(doc, COLOR.muted);
  STUDIO.about.forEach(para => {
    const lines = doc.splitTextToSize(para, PAGE.column) as string[];
    doc.text(lines, PAGE.margin, coverY);
    coverY += lines.length * lineHeight(TYPE.small) + 2;
  });

  /* The couple's block, centred to answer the studio's block at the top of the
   * page: label, name, when, where. Left-aligned it read as one more paragraph
   * after the studio copy; centred and set large, the name becomes the thing the
   * cover is actually about.
   */
  /* Sized to the name in hand. "Anushka" at a fixed size left the line half empty,
   * while "Priyanka & Chandrashekhar" overflowed it — so the point size is fitted
   * to the column and floored, and only wraps once even that will not hold it.
   *
   * Measured before the label is placed, because the gap between them depends on
   * how tall the name turns out to be. */
  const coupleName = quotation.clientName || 'Your Wedding';
  doc.setFont(DISPLAY, 'normal');
  doc.setFontSize(TYPE.hero);
  const naturalName = doc.getTextWidth(coupleName);
  /* Floor at 18 pt, not 23.
   *
   * Measured against the real face: "Priyanka & Chandrashekhar" fits one line at
   * 20.8 pt and "Shivangi & Purushottam Reddy" at 18.9 pt. A 23 pt floor forced
   * both onto two lines, and the second line pushed the venue off the page. Any
   * realistic name now holds one line, so the block keeps a constant height. */
  const nameSize =
    naturalName > PAGE.column
      ? Math.max(18, (TYPE.hero * PAGE.column) / naturalName)
      : TYPE.hero;
  doc.setFontSize(nameSize);

  /* Clear the name's own ascent before placing its baseline.
   *
   * jsPDF draws from the baseline, so advancing only by the label's line height
   * left the name's capitals rising back up into "PRESENTED TO" — at 30 pt the two
   * overlapped outright. The gap has to include how far the name reaches above its
   * baseline, which is why the size is settled first. */
  const nameAscent = nameSize * 0.3528 * 0.72;
  coverY += 4;
  coverLabel('Presented to', coverY, true);
  coverY += lineHeight(TYPE.floor) + nameAscent + 1;

  // `coverLabel` leaves the UI face at label size behind it, and both the wrap
  // measurement and the drawing below depend on the face actually being set.
  doc.setFont(DISPLAY, 'normal');
  doc.setFontSize(nameSize);
  setInk(doc, COLOR.ink);
  const nameLines = doc.splitTextToSize(coupleName, PAGE.column) as string[];
  nameLines.forEach((line, i) => {
    doc.text(line, PAGE.width / 2, coverY + i * lineHeight(nameSize, 1.05), { align: 'center' });
  });
  coverY += nameLines.length * lineHeight(nameSize, 1.05) + 3;

  /* The cover carries the whole celebration, not just its first day. Printing only
   * events[0] labelled a four-day wedding with the date of the haldi. */
  const firstDate = events[0]?.date;
  const lastDate = events[events.length - 1]?.date;
  if (firstDate) {
    doc.setFont(BODY, 'normal');
    doc.setFontSize(TYPE.subheading);
    setInk(doc, COLOR.ink);
    // A single day gets its weekday; a range does not — "31 Jan — Wednesday,
    // 4 February" reads as though only the last day has one.
    const sameDay = !lastDate || lastDate === firstDate;
    const dayMonth = (iso: string) =>
      new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });
    const dateText = sameDay
      ? formatDate(firstDate, 'long')
      : `${dayMonth(firstDate)} — ${dayMonth(lastDate)} ${new Date(`${lastDate}T00:00:00`).getFullYear()}`;
    const dateLines = doc.splitTextToSize(dateText, PAGE.column) as string[];
    dateLines.forEach((line, i) => {
      doc.text(line, PAGE.width / 2, coverY + i * lineHeight(TYPE.subheading), { align: 'center' });
    });
    coverY += dateLines.length * lineHeight(TYPE.subheading) + 1;
  }
  if (events[0]?.city || events[0]?.venue) {
    doc.setFont(BODY, 'normal');
    doc.setFontSize(TYPE.body);
    setInk(doc, COLOR.muted);
    doc.text(events[0].city || events[0].venue, PAGE.width / 2, coverY, { align: 'center' });
  }

  /* A note written for this couple is the one piece of cover-adjacent copy that
   * is not the same on every proposal, so it gets its own page when present. */
  if (quotation.noteToCouple?.trim()) {
    newPage(ctx, 'cover');
    sectionLabel(ctx, 'A note to you');
    space(ctx, 2);
    paragraphs(ctx, quotation.noteToCouple.trim(), TYPE.body);
  }

  /* ---------------------------------------------------------- celebration --
   * Grouped by date. An event block is measured before it is drawn so it never
   * splits, and the section title repeats as "continued" on a spill page.
   */
  if (events.length > 0) {
    newPage(ctx, 'celebration');
    sectionLabel(ctx, 'Events');
    space(ctx, 1);
    body(ctx, `${plural(events.length, 'event')} across your wedding.`, {
      colour: COLOR.muted, points: TYPE.small, gap: 5,
    });

    let lastDate = '';
    let continued = false;

    events.forEach(evt => {
      const lines: string[] = [];
      const time = [evt.time, evt.endTime].filter(Boolean).join(' — ');
      if (time) lines.push(time);
      if (evt.venue) lines.push(evt.venue);
      if (evt.city && evt.city !== evt.venue) lines.push(evt.city);
      if (evt.guestCount) lines.push(plural(evt.guestCount, 'guest'));

      const crew = crewLines(evt, roles);
      /* Titles are often typed as "Haldi/Mehndi ( 100 pax)". The guest count is
       * already a line of its own below, so the parenthetical is dropped rather
       * than printed twice. */
      const title = (evt.eventName || 'Celebration')
        .replace(/\s*\(\s*\d+\s*(?:pax|guests?|ppl|people)\s*\)\s*$/i, '')
        .trim() || 'Celebration';

      let blockH = measure(doc, title, TYPE.subheading, PAGE.column, DISPLAY) + 2;
      lines.forEach(l => { blockH += measure(doc, l, TYPE.body); });
      if (crew.length) {
        blockH += lineHeight(TYPE.floor) + 2;
        crew.forEach(c => { blockH += measure(doc, c, TYPE.body); });
      }
      blockH += 4;

      const dateChanged = evt.date !== lastDate;
      const dateH = dateChanged ? lineHeight(TYPE.floor) + 6 : 0;

      if (remaining(ctx) < blockH + dateH) {
        newPage(ctx, 'celebration');
        sectionLabel(ctx, 'Events, continued');
        continued = true;
        space(ctx, 1);
        lastDate = '';
      }

      if (evt.date !== lastDate) {
        lastDate = evt.date;
        space(ctx, 2);
        doc.setFont(BODY, 'bold');
        doc.setFontSize(TYPE.floor);
        setInk(doc, COLOR.sindoor);
        doc.setCharSpace(TYPE.labelTracking);
        doc.text(formatDate(evt.date, 'long').toUpperCase(), PAGE.margin, ctx.y);
        doc.setCharSpace(0);
        ctx.y += lineHeight(TYPE.floor) + 3;
      }

      doc.setFont(DISPLAY, 'normal');
      doc.setFontSize(TYPE.subheading);
      setInk(doc, COLOR.ink);
      doc.text(title, PAGE.margin, ctx.y);
      ctx.y += lineHeight(TYPE.subheading, 1.2) + 1;

      lines.forEach(l => body(ctx, l, { colour: COLOR.muted, gap: 0 }));

      if (crew.length) {
        space(ctx, 3);
        doc.setFont(BODY, 'bold');
        doc.setFontSize(TYPE.floor);
        setInk(doc, COLOR.muted);
        doc.text('YOUR CREW', PAGE.margin, ctx.y);
        ctx.y += lineHeight(TYPE.floor) + 1;
        crew.forEach(c => body(ctx, c, { gap: 0 }));
      }

      space(ctx, 5);
    });
  }

  /* ------------------------------------------------------------- receive --
   * Two sets, not a sequence — so no numbering. Deliverables are things you get,
   * not steps you take.
   */
  if (included.length > 0) {
    newPage(ctx, 'receive');
    sectionLabel(ctx, 'Deliverables');
    space(ctx, 2);

    /* Room reserved on the right for the price.
     *
     * Measured rather than guessed: the old fixed 24 mm was cut for "₹1,45,000"
     * and a lakh-plus album ran its title straight into the figure once the
     * currency became "Rs. ". The widest amount actually on the page decides. */
    const priceGutter = (() => {
      doc.setFont(BODY, 'bold');
      doc.setFontSize(TYPE.body);
      const widest = included.reduce((w, d) => {
        const price = Number(d.price) || 0;
        const label = price > 0 ? money(price) : 'Included';
        return Math.max(w, doc.getTextWidth(label));
      }, 0);
      return widest + 5; // 5 mm of air between title and amount
    })();

    const listSet = (items: typeof included, showPrice: boolean) => {
      if (items.length === 0) return;
      items.forEach(d => {
        const h = measure(doc, d.title, TYPE.body, PAGE.column - priceGutter) + 4;
        ensure(ctx, h);
        doc.setFont(BODY, 'normal');
        doc.setFontSize(TYPE.body);
        setInk(doc, COLOR.ink);
        const wrapped = doc.splitTextToSize(d.title, PAGE.column - priceGutter) as string[];
        doc.text(wrapped, PAGE.margin, ctx.y);
        // Everything here is in the total. A line carries its price when it has one
        // of its own, and reads "Included" when it is part of the collection —
        // never a zero amount, which looks like an error.
        if (showPrice) {
          const price = Number(d.price) || 0;
          doc.setFont(BODY, price > 0 ? 'bold' : 'normal');
          setInk(doc, price > 0 ? COLOR.sindoor : COLOR.muted);
          doc.text(
            price > 0 ? money(price) : 'Included',
            PAGE.width - PAGE.margin - INDEX_BAR.width - 1,
            ctx.y,
            { align: 'right' }
          );
        }
        ctx.y += wrapped.length * lineHeight(TYPE.body) + 2.5;
      });
      space(ctx, 5);
    };

    listSet(included, true);
  }

  /* ---------------------------------------------------------- investment --
   * One page, stacked label/value rows. The total is the largest type in the
   * document, with the amount in words beneath it so a digit cannot be misread.
   */
  newPage(ctx, 'investment');
  sectionLabel(ctx, 'Investment');
  space(ctx, 3);

  /* No per-category cost breakdown.
   *
   * Splitting the price into "Events & crew", "Deliverables" and each other charge
   * invited the couple to price-shop the parts rather than judge the whole — and
   * every line was another number to argue with. What is being bought is already
   * set out in full on the Events and Deliverables pages; this page answers only
   * what it costs.
   *
   * A discount still shows, with the subtotal above it, because "− Rs 30,000"
   * on its own gives no sense of what came off. */
  if (discount > 0 || tax > 0) {
    row(ctx, 'Subtotal', money(subtotal));
    if (discount > 0) row(ctx, 'Discount', `− ${money(discount)}`, { colour: COLOR.mehendi });
    if (tax > 0) row(ctx, `Tax (${quotation.taxPercent}%)`, money(tax));
    space(ctx, 2);
    rule(ctx);
  }

  space(ctx, 5);
  doc.setFont(BODY, 'bold');
  doc.setFontSize(TYPE.floor);
  setInk(doc, COLOR.muted);
  doc.setCharSpace(TYPE.labelTracking);
  doc.text('TOTAL', PAGE.margin, ctx.y);
  doc.setCharSpace(0);
  ctx.y += lineHeight(TYPE.floor) + 4;

  doc.setFont(DISPLAY, 'normal');
  doc.setFontSize(TYPE.hero);
  setInk(doc, COLOR.sindoor);
  doc.text(money(total), PAGE.margin, ctx.y);
  ctx.y += lineHeight(TYPE.hero, 1.1) + 2;

  body(ctx, amountInWords(total), { points: TYPE.small, colour: COLOR.muted });

  /* ------------------------------------------------------------- schedule --
   * A real sequence, so this is the one place numbering belongs.
   */
  const schedule = quotation.paymentSchedule || [];
  if (schedule.length > 0) {
    /* Same page as the total, deliberately. The figure and how it is paid are one
     * question, and a couple reading "Rs 15,50,000" should see the instalment that
     * actually blocks their date in the same glance, not a page later. It only
     * breaks to a new page if the schedule genuinely will not fit. */
    space(ctx, 6);
    // Keep the heading with at least its first instalment; the loop below breaks
    // per item after that, so a long schedule spills rather than orphaning a label.
    ensure(ctx, lineHeight(TYPE.label) + lineHeight(TYPE.subheading, 1.2) + 14);
    sectionLabel(ctx, 'Payment schedule');
    space(ctx, 3);

    schedule.forEach((m, i) => {
      const label = (m.milestone || '').replace(/\s*\([^)]*\)\s*$/, '').trim() || `Instalment ${i + 1}`;
      const detail = (m.milestone || '').match(/\(([^)]*)\)\s*$/)?.[1];
      let h = lineHeight(TYPE.subheading, 1.2) + 6;
      if (detail) h += measure(doc, detail, TYPE.small);
      ensure(ctx, h + 6);

      doc.setFont(BODY, 'bold');
      doc.setFontSize(TYPE.floor);
      setInk(doc, COLOR.marigold);
      doc.text(String(i + 1), PAGE.margin, ctx.y);

      doc.setFont(DISPLAY, 'normal');
      doc.setFontSize(TYPE.subheading);
      setInk(doc, COLOR.ink);
      const lines = doc.splitTextToSize(label, PAGE.column - 30) as string[];
      doc.text(lines, PAGE.margin + 7, ctx.y);

      doc.setFont(BODY, 'bold');
      doc.setFontSize(TYPE.body);
      setInk(doc, COLOR.sindoor);
      doc.text(money(m.amount), PAGE.width - PAGE.margin - 3, ctx.y, { align: 'right' });

      ctx.y += lines.length * lineHeight(TYPE.subheading, 1.2) + 1;
      if (detail) {
        body(ctx, detail, { points: TYPE.small, colour: COLOR.muted, gap: 0, width: PAGE.column - 10 });
      }
      space(ctx, 3.5);
    });
  }

  

  /* ------------------------------------------------------------- confirm --
   * No signature block: the booking is confirmed when the advance arrives. Payment
   * details are live text so they can be copied on the same phone this is read on.
   */
  newPage(ctx, 'confirm');
  sectionLabel(ctx, 'Confirming your date');
  space(ctx, 2);
  heading(ctx, 'Your date is held when the advance reaches us.', TYPE.subheading);
  space(ctx, 2);
  body(ctx, 'Once the first instalment is received we block your dates, and no one else can take them.', { colour: COLOR.muted, points: TYPE.small, gap: 6 });

  if (schedule[0]) {
    doc.setFont(BODY, 'bold');
    doc.setFontSize(TYPE.floor);
    setInk(doc, COLOR.muted);
    doc.setCharSpace(TYPE.labelTracking);
    doc.text('TO CONFIRM', PAGE.margin, ctx.y);
    doc.setCharSpace(0);
    ctx.y += lineHeight(TYPE.floor) + 3;

    doc.setFont(DISPLAY, 'normal');
    doc.setFontSize(TYPE.title);
    setInk(doc, COLOR.sindoor);
    doc.text(money(schedule[0].amount), PAGE.margin, ctx.y);
    ctx.y += lineHeight(TYPE.title, 1.15) + 6;
  }

  const accounts = (options.accounts || []).filter(a => a.active !== false);
  if (accounts.length > 0) {
    rule(ctx);
    doc.setFont(BODY, 'bold');
    doc.setFontSize(TYPE.floor);
    setInk(doc, COLOR.muted);
    doc.setCharSpace(TYPE.labelTracking);
    doc.text('WHERE TO SEND IT', PAGE.margin, ctx.y);
    doc.setCharSpace(0);
    ctx.y += lineHeight(TYPE.floor) + 3;

    accounts.forEach(a => {
      body(ctx, a.label, { points: TYPE.body, gap: 0 });
      if (a.details) body(ctx, a.details, { points: TYPE.body, colour: COLOR.muted, gap: 4 });
    });
    space(ctx, 3);
  }

  if (options.ownerPhone) {
    rule(ctx);
    doc.setFont(BODY, 'bold');
    doc.setFontSize(TYPE.floor);
    setInk(doc, COLOR.muted);
    doc.setCharSpace(TYPE.labelTracking);
    doc.text('ANY QUESTIONS', PAGE.margin, ctx.y);
    doc.setCharSpace(0);
    ctx.y += lineHeight(TYPE.floor) + 3;

    doc.setFont(BODY, 'normal');
    doc.setFontSize(TYPE.body);
    setInk(doc, COLOR.ink);
    const phoneY = ctx.y;
    doc.text(options.ownerPhone, PAGE.margin, phoneY);
    // A 12 mm tappable target, per the brief's minimum.
    doc.link(PAGE.margin, phoneY - 5, PAGE.column, 12, {
      url: `tel:${options.ownerPhone.replace(/[^\d+]/g, '')}`,
    });
    ctx.y += lineHeight(TYPE.body) + 2;
    body(ctx, 'Call or message any time — we would rather answer a question now than have you wonder.', { points: TYPE.small, colour: COLOR.muted });
  }

  /* The document ends on "Confirming your date". A back cover carrying only the
     wordmark and a phone number repeated what the page before it already said,
     and left the couple's last impression on a near-empty page rather than on the
     one telling them how to book. Its page number is now stamped like any other. */
  stampPageNumbers(doc, true, false);

  /* ----------------------------------------------------------- metadata --*/
  /* Reproducibility: the same quotation must produce the same bytes.
   *
   * Two things otherwise vary per render — jsPDF stamps the wall clock as the
   * creation date, and it seeds the trailer's file identifier randomly. Both are
   * derived from the quotation instead, so a proposal regenerated next month is
   * identical to the one the couple already has.
   */
  if (issued) {
    const pinned = new Date(`${issued}T00:00:00Z`);
    if (!Number.isNaN(pinned.valueOf())) doc.setCreationDate(pinned);
  }
  const seed = `${quotation.id || ''}|${quotation.quoteNumber || ''}|${issued}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const fileId = Array.from({ length: 4 }, (_, i) => {
    hash = Math.imul(hash ^ (i + 1), 0x01000193) >>> 0;
    return hash.toString(16).padStart(8, '0');
  }).join('').slice(0, 32).toUpperCase();
  (doc as unknown as { setFileId: (v: string) => void }).setFileId(fileId);

  doc.setProperties({
    title: `Wedding Proposal — ${quotation.clientName || ''}`,
    author: STUDIO.name,
    subject: `Proposal ${quotation.quoteNumber || ''}`,
    creator: STUDIO.name,
  });

  // WhatsApp shows the filename, so it has to read well on its own.
  const safeName = (quotation.clientName || 'Client').replace(/[\\/:*?"<>|]/g, '').trim();
  const filename = `Baawaray Films - Wedding Proposal - ${safeName} - ${quotation.quoteNumber || 'Draft'}.pdf`;

  if (options.returnFile) {
    return new File([doc.output('blob')], filename, { type: 'application/pdf' });
  }
  doc.save(filename);
}
