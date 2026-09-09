import { jsPDF } from 'jspdf';
import type { Client, ClientPaymentLog, PaymentAccountConfig, ProjectEvent } from '../../types';
import { formatDate, formatEventTimeRange } from '../formatters';
import { amountInWords } from './amountInWords';
import { COLOR, CURRENCY_SYMBOL, INDEX_BAR, PAGE, STUDIO, TYPE, lineHeight } from './brand';
import { registerStudioFonts, BODY, DISPLAY } from './registerFonts';
import {
  Ctx, body, drawBorder, drawFooter, drawIndexBar, ensure, heading, measure, newPage,
  paintGround, remaining, row, rule, sectionLabel, setFill, setInk, setStroke, space,
  stampPageNumbers, wordmark,
} from './layout';

/**
 * The document a couple receives when their advance clears.
 *
 * Built on the same page as the proposal — 105 × 187 mm, paper ground, sindoor
 * frame, edge index — because it is the second thing the studio sends and the two
 * arrive in the same WhatsApp thread. A receipt drawn on A4 in a different typeface
 * reads as coming from somewhere else, which is the opposite of what a booking
 * confirmation is for.
 *
 * It does two jobs: it proves the money arrived, and it confirms the booking now
 * exists. So it carries the dates being held, what the studio will deliver, what is
 * still to be paid, and the terms all of that sits under.
 */

const money = (n: number) => `${CURRENCY_SYMBOL}${Math.round(n).toLocaleString('en-IN')}`;

/** Right edge of the text column, clear of the index bar. */
const RIGHT = PAGE.width - PAGE.margin - INDEX_BAR.width - 1;

/**
 * Where an event is, or nothing at all.
 *
 * `venue` is a required field on an event but is filled long before the venue is
 * actually booked, so it routinely holds a placeholder. Printing "TBD" to a couple
 * on the document that confirms their booking reads as an unfinished form, and it
 * is worse than silence — the address or the town they gave is real information,
 * and where there is none the line simply should not exist.
 */
const PLACEHOLDER = /^(tbd|tba|t\.b\.d\.?|to be decided|to be confirmed|n\/?a|none|-+|\?+)$/i;

function placeOf(evt: ProjectEvent): string {
  for (const candidate of [evt.venue, evt.address, evt.clientLocation]) {
    const value = String(candidate || '').trim();
    if (value && !PLACEHOLDER.test(value)) return value;
  }
  return '';
}

export function generateReceiptPdf(
  client: Client,
  log: ClientPaymentLog,
  accounts: PaymentAccountConfig[] = [],
  opts: { events?: ProjectEvent[]; terms?: string[]; ownerPhone?: string } = {}
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [PAGE.width, PAGE.height] });
  registerStudioFonts(doc);
  doc.setLineHeightFactor(TYPE.leading);

  const isAdvance = Boolean(log.isAdvance);
  const events = [...(opts.events || [])].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const terms = (opts.terms || []).map(t => String(t || '').trim()).filter(Boolean);
  const account = accounts.find(a => a.id === log.accountId);

  /* The footer is one short line with the page number right-aligned beside it, so
   * both strings have to stay brief. The raw log id ("pay_1788286042973_advance") is
   * a machine key: printed in full it ran past the frame and straight through the
   * page number. A receipt number derived from it is short, stable and is what a
   * client would actually quote back.
   *
   * Six digits, not four. The id's digits are a millisecond timestamp, so the tail is
   * effectively random — and at four digits a studio issuing fifty receipts a year has
   * better than a one-in-ten chance of printing the same receipt number on two of
   * them. Six makes that vanishingly unlikely while staying short enough to read out
   * over the phone. */
  const digits = String(log.id).replace(/\D/g, '');
  const paidOn = log.date || '';
  const receiptNo = `BAA-RC-${new Date(paidOn || Date.now()).getFullYear()}-${
    digits ? digits.slice(-6).padStart(6, '0') : '000001'
  }`;

  /* Issued on the day the money arrived — not today.
   *
   * This was `new Date()`, so the same receipt for the same payment printed a
   * different date every time it was downloaded, and a payment received on the 1st
   * carried whatever date the couple happened to ask for a copy. A receipt is a
   * record of something that already happened; its own date cannot drift. */
  const issued = formatDate(paidOn || new Date().toISOString().slice(0, 10), 'medium');

  const ctx: Ctx = {
    doc,
    y: PAGE.margin,
    section: 'cover',
    reference: receiptNo,
    validity: `Issued ${issued}`,
  };

  /* ------------------------------------------------------------------ cover --
   * The wordmark, what happened, and the figure. Nothing else competes with it.
   */
  paintGround(doc);
  drawBorder(doc);
  drawIndexBar(doc, 'cover');
  drawFooter(ctx);

  ctx.y = PAGE.margin + 14;
  wordmark(doc, ctx.y, { centred: true, width: 46 });
  ctx.y += 12;

  doc.setFont(BODY, 'bold');
  doc.setFontSize(TYPE.floor);
  setInk(doc, COLOR.sindoor);
  doc.setCharSpace(TYPE.labelTracking);
  doc.text(
    (isAdvance ? 'Booking Confirmed' : 'Payment Received').toUpperCase(),
    PAGE.width / 2,
    ctx.y,
    { align: 'center' }
  );
  doc.setCharSpace(0);
  ctx.y += lineHeight(TYPE.floor) + 8;

  doc.setFont(DISPLAY, 'normal');
  doc.setFontSize(TYPE.title);
  setInk(doc, COLOR.ink);
  const nameLines = doc.splitTextToSize(client.name, PAGE.column) as string[];
  doc.text(nameLines, PAGE.width / 2, ctx.y, { align: 'center' });
  ctx.y += nameLines.length * lineHeight(TYPE.title, 1.2) + 8;

  // The figure, in the largest type the document uses — and again in words, which
  // cannot be altered by adding a digit.
  doc.setFont(DISPLAY, 'normal');
  doc.setFontSize(TYPE.hero);
  setInk(doc, COLOR.sindoor);
  doc.text(money(Number(log.amount) || 0), PAGE.width / 2, ctx.y, { align: 'center' });
  ctx.y += lineHeight(TYPE.hero, 1.1) + 2;

  doc.setFont(BODY, 'normal');
  doc.setFontSize(TYPE.small);
  setInk(doc, COLOR.muted);
  const words = doc.splitTextToSize(amountInWords(Number(log.amount) || 0), PAGE.column) as string[];
  doc.text(words, PAGE.width / 2, ctx.y, { align: 'center' });
  ctx.y += words.length * lineHeight(TYPE.small) + 6;

  setStroke(doc, COLOR.marigold);
  doc.setLineWidth(0.6);
  doc.line(PAGE.width / 2 - 12, ctx.y, PAGE.width / 2 + 12, ctx.y);
  ctx.y += 8;

  // How it arrived. `Received in` is only shown when the account genuinely adds
  // something the mode has not already said, so the couple is not told "UPI" twice.
  const modeLabel = log.mode || 'Not specified';
  // "Date" alone was ambiguous on a document that also carries event dates and an
  // issue date in the footer; this row is about when the money arrived.
  row(ctx, 'Received on', formatDate(log.date, 'long'), { points: TYPE.small });
  row(ctx, 'Mode', modeLabel, { points: TYPE.small });
  if (account?.label && account.label.trim().toLowerCase() !== modeLabel.trim().toLowerCase()) {
    row(ctx, 'Received in', account.label, { points: TYPE.small });
  }
  // A reference is a transaction number. Where the field merely repeats what the
  // document already says, printing it adds a line and no information.
  const reference = String(log.reference || '').trim();
  const referenceIsMeaningful =
    reference &&
    !['booking advance', 'advance', 'payment', modeLabel.toLowerCase()].includes(reference.toLowerCase());
  if (referenceIsMeaningful) row(ctx, 'Reference', reference, { points: TYPE.small });

  if (isAdvance) {
    space(ctx, 4);
    body(
      ctx,
      events.length
        ? 'This advance confirms your booking. The dates that follow are now held for you.'
        : 'This advance confirms your booking.',
      { points: TYPE.small, colour: COLOR.muted }
    );
  }

  /* ------------------------------------------------------------------ dates --*/
  if (events.length > 0) {
    newPage(ctx, 'celebration');
    sectionLabel(ctx, 'Dates Held');
    space(ctx, 2);

    let lastDate = '';
    events.forEach(evt => {
      const lines = [formatEventTimeRange(evt), placeOf(evt), evt.guests ? `${evt.guests} guests` : '']
        .filter(Boolean) as string[];
      const title =
        (evt.eventName || 'Celebration')
          .replace(/\s*\(\s*\d+\s*(?:pax|guests?|ppl|people)\s*\)\s*$/i, '')
          .trim() || 'Celebration';

      let blockH = measure(doc, title, TYPE.subheading, PAGE.column, DISPLAY) + 2;
      lines.forEach(l => { blockH += measure(doc, l, TYPE.small); });
      blockH += 5;
      const dateChanged = evt.date !== lastDate;
      const dateH = dateChanged ? lineHeight(TYPE.floor) + 6 : 0;

      if (remaining(ctx) < blockH + dateH) {
        newPage(ctx, 'celebration');
        sectionLabel(ctx, 'Dates held, continued');
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

      lines.forEach(l => body(ctx, l, { points: TYPE.small, colour: COLOR.muted, gap: 0 }));
      space(ctx, 5);
    });
  }

  /* ----------------------------------------------------------- deliverables --
   * Names only. A receipt confirms scope; it should not re-open the pricing of a
   * contract already agreed.
   */
  const deliverables = (client.deliverables || []).filter(d => d.title);
  if (deliverables.length > 0) {
    ensure(ctx, 40, 'receive');
    if (remaining(ctx) < 40) newPage(ctx, 'receive');
    sectionLabel(ctx, 'What You Receive');
    space(ctx, 2);
    deliverables.forEach(d => {
      ensure(ctx, measure(doc, d.title, TYPE.small) + 3);
      body(ctx, d.title, { points: TYPE.small, gap: 2 });
    });
  }

  /* --------------------------------------------------------------- the money --*/
  const contracted =
    client.customTotalAmount ?? events.reduce((sum, e) => sum + (Number(e.total) || 0), 0);
  const received = (client.paymentLogs || []).reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  const balance = Math.max(0, contracted - received);
  const milestones = (client.paymentMilestones || []).filter(m => m.percentage || m.amount);

  if (contracted > 0) {
    newPage(ctx, 'investment');
    sectionLabel(ctx, 'Your Investment');
    space(ctx, 2);

    row(ctx, 'Total contracted', money(contracted), { points: TYPE.small });
    row(ctx, 'Received to date', money(received), { points: TYPE.small });
    space(ctx, 2);
    rule(ctx);

    /* The balance gets the panel, because it is the figure that still needs action —
     * and when there is none left to take, the panel says so rather than announcing
     * "BALANCE OUTSTANDING Rs. 0", which reads as a system talking to itself. */
    const settledInFull = balance <= 0;
    const accent = settledInFull ? COLOR.mehendi : COLOR.sindoor;
    setFill(doc, [246, 243, 236]);
    doc.roundedRect(PAGE.margin, ctx.y, RIGHT - PAGE.margin, 18, 1, 1, 'F');
    setStroke(doc, accent);
    doc.setLineWidth(0.6);
    doc.line(PAGE.margin, ctx.y, PAGE.margin, ctx.y + 18);

    if (settledInFull) {
      doc.setFont(DISPLAY, 'normal');
      doc.setFontSize(TYPE.subheading);
      setInk(doc, COLOR.mehendi);
      doc.text('Paid in full', PAGE.margin + 4, ctx.y + 11.5);
    } else {
      /* Label above figure, not beside it. A tracked "BALANCE OUTSTANDING" is ~57 mm
       * and a five-figure sum in the display face is ~26 mm, against 74 mm of panel:
       * put on one baseline they overlap, and a seven-figure wedding overlaps by more.
       * Stacking is what makes the panel hold any amount the studio might print. */
      doc.setFont(BODY, 'bold');
      doc.setFontSize(TYPE.floor);
      setInk(doc, COLOR.muted);
      doc.setCharSpace(TYPE.labelTracking);
      doc.text('BALANCE OUTSTANDING', PAGE.margin + 4, ctx.y + 6);
      doc.setCharSpace(0);

      doc.setFont(DISPLAY, 'normal');
      doc.setFontSize(TYPE.subheading);
      setInk(doc, COLOR.sindoor);
      doc.text(money(balance), RIGHT - 4, ctx.y + 13.5, { align: 'right' });
    }
    ctx.y += 24;

    if (milestones.length > 0) {
      doc.setFont(BODY, 'bold');
      doc.setFontSize(TYPE.floor);
      setInk(doc, COLOR.muted);
      doc.setCharSpace(TYPE.labelTracking);
      doc.text('PAYMENT SCHEDULE', PAGE.margin, ctx.y);
      doc.setCharSpace(0);
      ctx.y += lineHeight(TYPE.floor) + 3;

      let running = 0;
      milestones.forEach(m => {
        const amount = m.amount ?? Math.round((contracted * (m.percentage || 0)) / 100);
        running += amount;
        const settled = received >= running;
        const when = (m.description || '').trim();
        // An instalment nobody has described and nobody has paid has nothing to say
        // on a second line; it used to draw an empty string and take the space anyway.
        const note = settled ? (when ? `${when} — received` : 'Received') : when;
        ensure(ctx, lineHeight(TYPE.small) + (note ? lineHeight(TYPE.floor) : 0) + 4, 'investment');

        doc.setFont(BODY, settled ? 'normal' : 'bold');
        doc.setFontSize(TYPE.small);
        setInk(doc, settled ? COLOR.muted : COLOR.ink);
        doc.text(m.name || m.milestone || 'Instalment', PAGE.margin, ctx.y);
        doc.text(money(amount), RIGHT, ctx.y, { align: 'right' });
        ctx.y += lineHeight(TYPE.small);

        if (note) {
          doc.setFont(BODY, 'normal');
          doc.setFontSize(TYPE.floor);
          setInk(doc, settled ? COLOR.mehendi : COLOR.muted);
          doc.text(note, PAGE.margin, ctx.y);
          ctx.y += lineHeight(TYPE.floor);
        }
        ctx.y += 3;
      });
    }
  }

  /* ------------------------------------------------------- settling the rest --
   * The document named a balance and then gave no way to pay it. The proposal closes
   * on WHERE TO SEND IT and ANY QUESTIONS — and the receipt is the one of the two a
   * couple keeps and comes back to, so it is the document that most needs them. Both
   * are live text, copyable and tappable on the phone this is read on, as there.
   */
  const payable = accounts.filter(a => a.active !== false);
  const ownerPhone = String(opts.ownerPhone || '').trim();
  const showBalance = balance > 0 && (payable.length > 0 || Boolean(ownerPhone));

  const smallLabel = (text: string) => {
    doc.setFont(BODY, 'bold');
    doc.setFontSize(TYPE.floor);
    setInk(doc, COLOR.muted);
    doc.setCharSpace(TYPE.labelTracking);
    doc.text(text, PAGE.margin, ctx.y);
    doc.setCharSpace(0);
    ctx.y += lineHeight(TYPE.floor) + 3;
  };

  /* ------------------------------------------------------------------ terms --
   * The fine print, then the page that asks for something. Putting the balance first
   * pushed the terms onto a page of their own anyway and left the couple's last
   * impression on a trailing clause; this way the document closes on how to pay and
   * who to call, which is how the proposal closes too.
   */
  if (terms.length > 0) {
    newPage(ctx, 'confirm');
    sectionLabel(ctx, 'Terms');
    space(ctx, 2);
    terms.forEach(term => {
      ensure(ctx, measure(doc, term, TYPE.small) + 4, 'confirm');
      body(ctx, term, { points: TYPE.small, colour: COLOR.muted, gap: 3 });
    });
  }

  if (showBalance) {
    newPage(ctx, 'confirm');
    sectionLabel(ctx, 'The balance');
    space(ctx, 2);

    smallLabel('STILL TO PAY');
    doc.setFont(DISPLAY, 'normal');
    doc.setFontSize(TYPE.title);
    setInk(doc, COLOR.sindoor);
    doc.text(money(balance), PAGE.margin, ctx.y);
    ctx.y += lineHeight(TYPE.title, 1.15) + 6;

    if (payable.length > 0) {
      rule(ctx);
      smallLabel('WHERE TO SEND IT');
      payable.forEach(a => {
        ensure(ctx, measure(doc, a.details || a.label, TYPE.small) + 8, 'confirm');
        body(ctx, a.label, { points: TYPE.small, gap: 0 });
        if (a.details) body(ctx, a.details, { points: TYPE.small, colour: COLOR.muted, gap: 4 });
      });
      space(ctx, 2);
    }

    if (ownerPhone) {
      rule(ctx);
      smallLabel('ANY QUESTIONS');
      doc.setFont(BODY, 'normal');
      doc.setFontSize(TYPE.small);
      setInk(doc, COLOR.ink);
      const phoneY = ctx.y;
      doc.text(ownerPhone, PAGE.margin, phoneY);
      // A 12 mm tappable target, the same minimum the proposal uses.
      doc.link(PAGE.margin, phoneY - 5, PAGE.column, 12, {
        url: `tel:${ownerPhone.replace(/[^\d+]/g, '')}`,
      });
      ctx.y += lineHeight(TYPE.small) + 4;
    }
  }

  space(ctx, 4);
  ensure(ctx, 10);
  doc.setFont(BODY, 'normal');
  doc.setFontSize(TYPE.floor);
  setInk(doc, COLOR.muted);
  doc.text('Computer-generated receipt — no signature required.', PAGE.margin, ctx.y);

  // The cover carries the wordmark; a number under it would compete with the figure.
  stampPageNumbers(doc, true, false);

  /* ---------------------------------------------------------------- metadata --
   * Reproducibility, for the same reason the proposal pins it: a receipt is a record
   * of a payment that has already happened, so re-downloading it must produce the
   * document the couple already has. jsPDF otherwise stamps the wall clock as the
   * creation date and seeds the file identifier randomly, which made every copy a
   * different file.
   */
  const pinned = new Date(`${paidOn || '1970-01-01'}T00:00:00Z`);
  if (!Number.isNaN(pinned.valueOf())) doc.setCreationDate(pinned);

  let hash = 0x811c9dc5;
  const seed = `${log.id}|${client.id}|${receiptNo}`;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const fileId = Array.from({ length: 4 }, (_, i) => {
    hash = Math.imul(hash ^ (i + 1), 0x01000193) >>> 0;
    return hash.toString(16).padStart(8, '0');
  }).join('').slice(0, 32).toUpperCase();
  (doc as unknown as { setFileId: (v: string) => void }).setFileId(fileId);

  const label = isAdvance ? 'Booking Confirmation' : 'Payment Receipt';
  doc.setProperties({
    title: `${label} — ${client.name}`,
    author: STUDIO.name,
    subject: receiptNo,
    creator: STUDIO.name,
  });

  /* WhatsApp shows the filename, so it has to read as a document rather than as a
   * database key — it used to end in the raw log id, "…_pay_1788286042973_advance". */
  const safeName = client.name.replace(/[\\/:*?"<>|]/g, '').trim() || 'Client';
  doc.save(`Baawaray Films - ${label} - ${safeName} - ${receiptNo}.pdf`);
}
