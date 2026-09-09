import { jsPDF } from 'jspdf';
import { Client, ProjectEvent, Quotation, TeamMember, CrewRoleConfig, ClientPaymentLog, PaymentAccountConfig, ClientDeliverable } from '../types';
import { formatDate, formatINR } from './formatters';
import { generateReceiptPdf } from './pdf/receipt';
import { registerStudioFonts, WORDMARK } from './pdf/registerFonts';

/**
 * Currency for PDF output.
 *
 * jsPDF's built-in Helvetica is WinAnsi-encoded and has no glyph for the rupee
 * sign, so `formatINR` renders "₹2,07,680" as "¹2,07,680" in the exported file.
 * Swap in the ASCII "Rs." prefix, which every standard PDF font can draw.
 */
function pdfINR(amount: number | string | undefined | null): string {
  return formatINR(amount).replace(/\u20B9\s?/g, 'Rs. ');
}

/**
 * Shared luxury-minimal header for every exported document.
 *
 * No brand mark, no colour-fill band \u2014 just the studio name set quietly in small
 * caps, the document title, and a hairline. Kept deliberately plain so the content
 * underneath carries the document, and large enough to read without pinch-zooming
 * on a phone.
 */
const INK: [number, number, number] = [36, 34, 31];
const MUTED: [number, number, number] = [129, 123, 115];
const ACCENT: [number, number, number] = [123, 17, 39];
const HAIRLINE: [number, number, number] = [225, 219, 209];

/** Warm paper tone used behind the figures that matter. */
const SOFT: [number, number, number] = [249, 246, 239];

function drawHairline(doc: jsPDF, x1: number, y: number, x2: number): void {
  doc.setDrawColor(...HAIRLINE);
  doc.setLineWidth(0.2);
  doc.line(x1, y, x2, y);
}

/**
 * Letter-spaced section label over a short accent rule.
 *
 * Tracking the capitals out and cutting the rule short of the margin is what
 * separates a document that looks typeset from one that looks printed off a
 * form — the same restraint the studio's own stationery uses.
 */
function drawSectionLabel(doc: jsPDF, label: string, y: number): number {
  doc.setFont('times', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...ACCENT);
  doc.setCharSpace(1.6);
  doc.text(label.toUpperCase(), 20, y);
  doc.setCharSpace(0);

  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.5);
  doc.line(20, y + 2.8, 34, y + 2.8);
  drawHairline(doc, 36, y + 2.8, 190);

  return y + 10;
}

/** Quiet studio line and page number on every page, added once at the end. */
function drawFooters(doc: jsPDF): void {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i);
    drawHairline(doc, 20, 283, 190);
    doc.setFont(WORDMARK, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.setCharSpace(1.1);
    
    drawWordmark(doc, 20, 287.5, 20, MUTED);

    doc.setCharSpace(0);
    doc.text(`${i} / ${total}`, 190, 288, { align: 'right' });
  }
}

/**
 * The studio wordmark, set in Tan Meringue — the face the logo lockup is drawn
 * from. It went in through `doc.addSvgAsImage` before, which returns a Promise
 * while every generator here is synchronous, so `doc.save()` fired first and the
 * logo reached none of these documents. Type is drawn immediately, stays sharp,
 * and takes a colour.
 */
function drawWordmark(
  doc: jsPDF,
  x: number,
  baselineY: number,
  widthMm: number,
  colour: readonly [number, number, number]
): void {
  const previousSpace = 0;
  doc.setCharSpace(previousSpace);
  doc.setFont(WORDMARK, 'normal');
  doc.setFontSize(12);
  const widthAt12 = doc.getTextWidth('BAAWARAY');
  doc.setFontSize(widthAt12 > 0 ? (12 * widthMm) / widthAt12 : 12);
  doc.setTextColor(colour[0], colour[1], colour[2]);
  doc.text('BAAWARAY', x, baselineY);
}

function drawDocumentHeader(
  doc: jsPDF,
  title: string,
  metaLines: string[] = []
): number {
  // Studio name tracked out like an engraved letterhead.
  doc.setFont(WORDMARK, 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.setCharSpace(2.4);
  
  drawWordmark(doc, 20, 18, 28, INK);

  doc.setCharSpace(0);

  doc.setFont('times', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text('Wedding Photography & Cinema', 20, 22);

  doc.setFont('times', 'normal');
  doc.setFontSize(17);
  doc.setTextColor(...ACCENT);
  doc.setCharSpace(1.4);
  doc.text(title.toUpperCase(), 190, 17, { align: 'right' });
  doc.setCharSpace(0);

  let metaY = 23;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  metaLines.forEach(line => {
    doc.text(line, 190, metaY, { align: 'right' });
    metaY += 4.2;
  });

  // Double rule — a heavier accent line over a hairline.
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.6);
  doc.line(20, 28, 190, 28);
  drawHairline(doc, 20, 29.6, 190);
  return 38;
}

export function generateClientEventsItineraryPdf(
  client: Client,
  events: ProjectEvent[],
  allTeam: TeamMember[],
  customTerms?: string[]
): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  registerStudioFonts(doc);
  drawDocumentHeader(doc, 'SHOOT ITINERARY', [
    `Generated ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`,
    `${events.length} event${events.length === 1 ? '' : 's'}`,
  ]);

  // Client Details Box
  doc.setDrawColor(...HAIRLINE);
  doc.setFillColor(251, 250, 248);
  doc.roundedRect(20, 44, 170, 26, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(36, 34, 31);
  doc.text(client.name, 25, 53);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(129, 123, 115);
  doc.text(`Phone: ${client.phone}`, 25, 60);

  doc.text(`Lead Source: ${client.source || 'Studio Direct'}`, 110, 60);
  doc.text(`Status: ${client.status.toUpperCase()}`, 110, 65);

  let y = 76;

  if (events.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(129, 123, 115);
    doc.text('No scheduled events recorded for this client.', 20, y + 10);
  } else {
    events.forEach((evt, idx) => {
      // Check page capacity before rendering event card
      if (y > 220) {
        doc.addPage();
        y = 20;
      }

      // Event Card Container
      const appointedCrew = (evt.assignments || [])
        .map(id => allTeam.find(t => t.id === id))
        .filter(Boolean) as TeamMember[];

      // Event Header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...ACCENT);
      doc.text(evt.eventName, 20, y + 5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      doc.text(evt.package || 'Custom Package', 190, y + 5, { align: 'right' });

      y += 8;
      drawHairline(doc, 20, y, 190);
      y += 2;

      // Event Body Box
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(233, 228, 220);

      // Date & Timing
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(142, 73, 56);
      doc.text(`Date: ${formatDate(evt.date, 'long')}`, 24, y + 6);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(36, 34, 31);
      doc.text(`Time: ${evt.time} to ${evt.endTime}`, 24, y + 11);
      doc.text(`Guests Expected: ${evt.guests || 250}`, 24, y + 16);

      // Venue & Coordinates
      doc.setFont('helvetica', 'bold');
      doc.text(`Venue / Location:`, 105, y + 6);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(129, 123, 115);
      const splitVenue = doc.splitTextToSize(evt.venue || 'TBA', 80);
      doc.text(splitVenue, 105, y + 11);

      if (evt.address) {
        const splitAddr = doc.splitTextToSize(`Address: ${evt.address}`, 80);
        doc.text(splitAddr, 105, y + 16);
      }

      y += 24;

      // Appointed Crew Roster
      doc.setFillColor(248, 246, 242);
      doc.rect(24, y, 162, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(36, 34, 31);
      doc.text(`APPOINTED CREW ROSTER (${appointedCrew.length} Members)`, 28, y + 4.5);

      y += 9;

      if (appointedCrew.length === 0) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(129, 123, 115);
        doc.text('No crew members assigned yet.', 28, y + 3);
        y += 7;
      } else {
        appointedCrew.forEach(member => {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(36, 34, 31);
          doc.text(`• ${member.name}`, 28, y + 3);

          doc.setFont('helvetica', 'normal');
          doc.setTextColor(129, 123, 115);
          doc.text(`(${member.role}) · Phone: ${member.phone}`, 75, y + 3);

          y += 5.5;
        });
      }

      // Deliverables / Deliveries
      if (evt.deliverables && evt.deliverables.length > 0) {
        y += 2;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(142, 73, 56);
        doc.text('CONTRACTED DELIVERABLES:', 28, y + 3);
        y += 5;

        evt.deliverables.slice(0, 5).forEach(deliv => {
          const assignedM = deliv.assignedMemberId ? allTeam.find(t => t.id === deliv.assignedMemberId) : null;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(36, 34, 31);
          doc.text(`- ${deliv.title}`, 28, y + 2.5);

          doc.setFont('helvetica', 'bold');
          doc.setTextColor(129, 123, 115);
          doc.text(
            `[${deliv.status.toUpperCase()}]${assignedM ? ` (Assigned: ${assignedM.name})` : ''}`,
            140,
            y + 2.5
          );

          y += 4.5;
        });
      }

      y += 4;
      drawHairline(doc, 20, y, 190);
      y += 10;
    });
  }

  // Footer Guidelines
  if (y > 255) {
    doc.addPage();
    y = 20;
  }

  doc.setDrawColor(233, 228, 220);
  doc.line(20, y, 190, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(36, 34, 31);
  doc.text('PRODUCTION NOTES & CLIENT GUIDELINES:', 20, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(129, 123, 115);
  doc.text('1. Crew arrives 45-60 minutes prior to call time for lighting & audio calibration.', 20, y + 4.5);
  doc.text('2. Please share any last-minute venue or ritual timing updates directly on the client portal or via phone.', 20, y + 8.5);
  doc.text('3. All master footage is backed up onto redundant NVMe storage immediately post-event.', 20, y + 12.5);

  const filename = `Baawaray_Wedding_Itinerary_${client.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}

export function generateMemberSchedulePdf(
  member: TeamMember,
  events: ProjectEvent[],
  customTerms?: string[],
  allTeam?: TeamMember[]
): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  registerStudioFonts(doc);
  drawDocumentHeader(doc, 'CREW CALL SHEET', [
    `Generated ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`,
  ]);

  // Member Information Box
  doc.setDrawColor(...HAIRLINE);
  doc.setFillColor(251, 250, 248);
  doc.roundedRect(20, 45, 170, 25, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(36, 34, 31);
  doc.text(member.name, 26, 54);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(129, 123, 115); // #817b73
  doc.text(`Role: ${member.role}`, 26, 60);
  doc.text(`Phone: ${member.phone}`, 26, 66);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`, 115, 60);
  doc.text(`Total Assigned Shoots: ${events.length}`, 115, 66);

  // Sort events in ASCENDING order (upcoming / earliest shoot on top, last shoot down)
  const sortedEvents = [...events].sort((a, b) => {
    const timeA = new Date(a.date).getTime();
    const timeB = new Date(b.date).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return (a.time || '').localeCompare(b.time || '');
  });

  // Schedule Table Header
  let y = 76;
  doc.setFillColor(36, 34, 31);
  doc.rect(20, y, 170, 8, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text('DATE & TIMING', 23, y + 5.5);
  doc.text('EVENT & COUPLE', 60, y + 5.5);
  doc.text('CREW ON EVENT', 98, y + 5.5);
  doc.text('LOCATION / VENUE (TAP MAP)', 142, y + 5.5);

  y += 8;

  if (sortedEvents.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(129, 123, 115);
    doc.text('No upcoming shoots scheduled for this crew member.', 24, y + 12);
    y += 20;
  } else {
    sortedEvents.forEach((evt, idx) => {
      // 1. Crew on Event List with Member at Top position #1 (Clean names only, no roles)
      const assignedIds = Array.isArray(evt.assignments) ? evt.assignments : [];
      const teamPool = allTeam || [];
      
      const otherMembers: string[] = [];
      assignedIds.forEach(id => {
        if (id !== member.id) {
          const found = teamPool.find(t => t.id === id);
          if (found && found.name) {
            otherMembers.push(found.name.trim());
          }
        }
      });

      // Target member always listed first, followed by other members
      const crewList: string[] = [
        member.name.trim(),
        ...otherMembers
      ];

      // 2. Venue & Google Maps link
      const venueText = evt.venue ? (evt.address ? `${evt.venue}, ${evt.address}` : evt.venue) : 'Venue to be confirmed';
      const splitVenue = doc.splitTextToSize(venueText, 45);

      // Event & Couple text
      const splitEventName = doc.splitTextToSize(evt.eventName, 35);
      const splitCouple = doc.splitTextToSize(evt.couple, 35);

      // Calculate dynamic row height
      const contentHeight = Math.max(
        splitVenue.length * 3.8 + 6,
        crewList.length * 3.8 + 6,
        splitEventName.length * 3.8 + splitCouple.length * 3.5 + 6,
        22
      );
      const rowHeight = Math.max(22, contentHeight);

      // Check page break
      if (y + rowHeight > 242) {
        doc.addPage();
        y = 20;

        // Re-print table header on new page
        doc.setFillColor(36, 34, 31);
        doc.rect(20, y, 170, 7, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        doc.text('DATE & TIMING', 23, y + 5);
        doc.text('EVENT & COUPLE', 60, y + 5);
        doc.text('CREW ON EVENT', 98, y + 5);
        doc.text('LOCATION / VENUE (TAP MAP)', 142, y + 5);
        y += 7;
      }

      // Row alternating background
      if (idx % 2 === 0) {
        doc.setFillColor(248, 246, 242);
      } else {
        doc.setFillColor(255, 255, 255);
      }
      doc.rect(20, y, 170, rowHeight, 'F');

      // Border line
      doc.setDrawColor(233, 228, 220);
      doc.line(20, y + rowHeight, 190, y + rowHeight);

      // --- COLUMN 1: DATE & TIMING (Clean, Visible & Equal Sizing) ---
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(36, 34, 31);
      doc.text(formatDate(evt.date, 'short'), 23, y + 6);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(36, 34, 31);
      doc.text(`${evt.time || 'TBD'} – ${evt.endTime || 'Wrap'}`, 23, y + 11.5);

      // Guests expected
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(129, 123, 115);
      doc.text(`${evt.guests || 0} Guests Expected`, 23, y + 16.5);

      // --- COLUMN 2: EVENT & COUPLE ---
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(123, 17, 39); // #7a2e33
      doc.text(splitEventName, 60, y + 6);

      const coupleStartY = y + 6 + (splitEventName.length * 3.8);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(36, 34, 31);
      doc.text(splitCouple, 60, coupleStartY);

      // --- COLUMN 3: CREW ON EVENT (Target member first, uniform clean formatting without roles) ---
      let crewY = y + 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(36, 34, 31);

      crewList.forEach((crewMemberName) => {
        const lineText = `• ${crewMemberName}`;
        const splitCrewLine = doc.splitTextToSize(lineText, 40);
        doc.text(splitCrewLine, 98, crewY);
        crewY += splitCrewLine.length * 3.8;
      });

      // --- COLUMN 4: LOCATION / VENUE (Direct Clickable Link) ---
      const searchQuery = (evt.venue || '').trim() ? `${evt.venue} ${evt.address || ''}`.trim() : 'Wedding Venue';
      const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery)}`;
      
      const venueX = 142;
      const startVenueY = y + 6;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(123, 17, 39); // #7a2e33 distinct link color

      splitVenue.forEach((lineText: string, lineIndex: number) => {
        const curLineY = startVenueY + (lineIndex * 3.8);
        doc.textWithLink(lineText, venueX, curLineY, { url: mapUrl });
      });

      // Overlay bounding box hyperlink annotation for seamless one-click touch/desktop navigation
      const blockHeight = Math.max(6, splitVenue.length * 3.8);
      doc.link(venueX - 1, startVenueY - 3, 46, blockHeight + 1, { url: mapUrl });

      y += rowHeight;
    });
  }

  // Active Terms & Conditions
  const teamGuidelines = (customTerms && customTerms.length > 0)
    ? customTerms
    : [
        'Crew must arrive 45 min prior in all black at the location for equipment calibration, lighting check, and ritual briefing.',
        'Dual-slot redundant backup recording is strictly mandatory on all primary camera bodies at all times.',
        'Audio redundancy: Primary cinematographers must mic the groom/pandit with dedicated wireless transmitters and keep ambient recorders active.',
        'Maintain respectful decorum, discreet movement during solemn ceremony rituals, and prompt coordination with the client family.',
        'Data handoff: All original camera memory cards must be cloned to master NVMe drives with file-hash verification within 24 hours of shoot wrap.',
        'Strict non-disclosure: No unreleased raw footage, unedited photos, or backstage client media may be posted on personal social media without prior studio authorization.'
      ];

  const estimatedTermsHeight = 16 + (teamGuidelines.length * 7);
  if (y + estimatedTermsHeight > 280) {
    doc.addPage();
    y = 20;
  } else {
    y += 8;
  }

  // Guidelines Header Box
  doc.setFillColor(242, 238, 231);
  doc.rect(20, y, 170, 7, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(123, 17, 39);
  doc.text('IMPORTANT CREW TERMS & PRODUCTION PROTOCOLS:', 24, y + 4.8);

  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(50, 48, 44);

  teamGuidelines.forEach((rule, rIdx) => {
    const ruleText = `${rIdx + 1}. ${rule}`;
    const splitRule = doc.splitTextToSize(ruleText, 166);
    
    if (y + (splitRule.length * 3.5) > 282) {
      doc.addPage();
      y = 20;
    }

    doc.text(splitRule, 22, y);
    y += splitRule.length * 3.6 + 1.5;
  });

  // Save PDF
  const filename = `Baawaray_Call_Sheet_${member.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}

export function generateInvoicePdf(event: ProjectEvent, clientName: string): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  registerStudioFonts(doc);
  drawDocumentHeader(doc, 'CLIENT STATEMENT', [
    `Ref: BAA-${event.id}`,
    `Date: ${formatDate(new Date().toISOString(), 'short')}`,
  ]);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text('BILLED TO:', 20, 48);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text(event.couple || clientName, 20, 55);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('EVENT DETAILS:', 110, 48);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(129, 123, 115);
  doc.text(`${event.eventName} · ${formatDate(event.date)}`, 110, 55);
  doc.text(`Venue: ${event.venue}`, 110, 60);

  // Items Table
  let y = 75;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...ACCENT);
  doc.text('PACKAGE', 20, y);
  doc.text('AMOUNT', 160, y);
  drawHairline(doc, 20, y + 2.5, 190);

  y += 10;
  doc.setDrawColor(...HAIRLINE);
  doc.line(20, y + 24, 190, y + 24);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text(event.package || 'Custom Wedding Package', 20, y + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(129, 123, 115);
  doc.text(`Comprehensive coverage including candid photography, 4K film & highlights teaser.`, 25, y + 14);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(36, 34, 31);
  doc.text(pdfINR(event.total), 160, y + 10);

  // Financial Breakdown
  y += 35;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(129, 123, 115);
  doc.text('Total Agreed Value:', 120, y);
  doc.setTextColor(36, 34, 31);
  doc.text(pdfINR(event.total), 165, y);

  doc.setTextColor(129, 123, 115);
  doc.text('Amount Paid / Retainer:', 120, y + 7);
  doc.setTextColor(95, 120, 108); // Sage green
  doc.text(pdfINR(event.paid), 165, y + 7);

  doc.setDrawColor(233, 228, 220);
  doc.line(120, y + 11, 190, y + 11);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(185, 111, 86); // Clay
  doc.text('Outstanding Balance:', 120, y + 18);
  doc.text(pdfINR(Math.max(0, event.total - event.paid)), 165, y + 18);

  // Save PDF
  doc.save(`Baawaray_Statement_${event.couple.replace(/\s+/g, '_')}_${event.id}.pdf`);
}

export function generateQuotationPdf(
  quotation: Quotation,
  customTerms?: string[],
  /** Studio roster, used to name crew added through the quotation builder. */
  crewRoles?: CrewRoleConfig[],
  /** Hand the file back instead of saving it — used when sharing to WhatsApp. */
  options?: { returnFile?: boolean }
): File | void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  registerStudioFonts(doc);
  drawDocumentHeader(doc, 'QUOTATION', [
    `Ref: ${quotation.quoteNumber}`,
    `Date: ${formatDate(quotation.createdAt, 'short')}`,
    `Valid until ${formatDate(quotation.validUntil, 'short')}`,
  ]);

  // Client block — the couple's name is the largest thing on the page after the
  // title, set in the display face so the document opens like an invitation.
  doc.setFont('times', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.setCharSpace(1.2);
  doc.text('PREPARED FOR', 20, 42);
  doc.setCharSpace(0);

  doc.setFont('times', 'normal');
  doc.setFontSize(21);
  doc.setTextColor(...INK);
  doc.text(quotation.clientName, 20, 52);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(
    `${quotation.phone}   ·   ${quotation.events.length} event${quotation.events.length === 1 ? '' : 's'}`,
    20,
    58
  );

  let y = 70;

  // SECTION 1: EVENTS & CREW — one stacked block per event. Skipped entirely
  // when there are none, rather than printing a heading over empty space.
  if (quotation.events.length > 0) {
    y = drawSectionLabel(doc, 'Events & Crew', y);
  }

  quotation.events.forEach(evt => {
    // Crew allocation. The builder stores counts against studio role ids, so read the
    // roster first and only fall back to the legacy fixed keys for older quotations.
    const crewLines: string[] = [];
    const tr = evt.teamRequired || {};
    const crewCount = (n?: unknown) => (typeof n === 'number' ? n : 0);

    const namedFromRoster = (crewRoles || [])
      .map(role => ({ name: role.name, qty: crewCount(tr[role.id]) }))
      .filter(r => r.qty > 0)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    if (namedFromRoster.length > 0) {
      namedFromRoster.forEach(r => crewLines.push(`${r.qty} x ${r.name}`));
    } else {
      if (crewCount(tr.candidPhotographer) > 0) crewLines.push(`${tr.candidPhotographer} x Candid Photographer`);
      if (crewCount(tr.traditionalPhotographer) > 0) crewLines.push(`${tr.traditionalPhotographer} x Traditional Photographer`);
      if (crewCount(tr.photographer) > 0) crewLines.push(`${tr.photographer} x Photographer`);
      if (crewCount(tr.cinematographer) > 0) crewLines.push(`${tr.cinematographer} x Cinematographer`);
      if (crewCount(tr.drone) > 0) crewLines.push(`${tr.drone} x Drone Operator`);
      if (crewCount(tr.assistant) > 0) crewLines.push(`${tr.assistant} x Assistant`);
    }
    if (crewLines.length === 0) crewLines.push('Standard Studio Crew');

    const crewText = crewLines.join(' · ');
    doc.setFontSize(9);
    const crewWrapped = doc.splitTextToSize(crewText, 170) as string[];
    const venueWrapped = doc.splitTextToSize(evt.venue || 'Venue to be finalized', 170) as string[];

    const cardHeight = 6 + 5 + venueWrapped.length * 4.2 + crewWrapped.length * 4.2 + 6;

    // Page-break check before drawing so a card is never split across pages.
    if (y + cardHeight > 265) {
      doc.addPage();
      y = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...ACCENT);
    doc.text(evt.eventName, 20, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(formatDate(evt.date, 'long'), 190, y, { align: 'right' });
    y += 6;

    doc.setTextColor(...INK);
    doc.text(
      `${evt.time || 'Time TBD'} – ${evt.endTime || 'Wrap'} · ${evt.guestCount || 0} guests`,
      20,
      y
    );
    y += 5;

    doc.setTextColor(...MUTED);
    doc.text(venueWrapped, 20, y);
    y += venueWrapped.length * 4.2;

    doc.setTextColor(...INK);
    doc.text(crewWrapped, 20, y);
    y += crewWrapped.length * 4.2;

    y += 4;
    drawHairline(doc, 20, y, 190);
    y += 8;
  });

  y += 2;

  // Check page capacity before Section 2
  if (y > 210) {
    doc.addPage();
    y = 20;
  }

  // SECTION 2: DELIVERABLES — printed in the order set in the builder.
  const includedDeliverables = (quotation.deliverables || []).filter(d => d.included);

  if (includedDeliverables.length > 0) {
    y = drawSectionLabel(doc, 'Deliverables', y);
  }

  includedDeliverables.forEach((d, i) => {
    if (y > 268) {
      doc.addPage();
      y = 24;
    }

    // Index in the studio's chosen order, so the client reads the package the
    // way it was arranged in the builder.
    doc.setFont('times', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(String(i + 1).padStart(2, '0'), 20, y);

    const priceLabel = d.price > 0 ? `+ ${pdfINR(d.price)}` : 'Included';
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    const titleLines = doc.splitTextToSize(d.title, 132) as string[];
    doc.text(titleLines, 28, y);

    doc.setFont('helvetica', d.price > 0 ? 'bold' : 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...(d.price > 0 ? ACCENT : MUTED));
    doc.text(priceLabel, 190, y, { align: 'right' });

    y += titleLines.length * 4.6 + 2.6;
  });

  y += 4;

  // Check page capacity before Section 3
  if (y > 210) {
    doc.addPage();
    y = 20;
  }

  // Page-break check — the summary below reads badly split across pages.
  if (y > 200) {
    doc.addPage();
    y = 20;
  }

  // SECTION 3: INVESTMENT SUMMARY — one full-width column, stacked, so every
  // figure is readable at a glance on a phone without zooming.
  y = drawSectionLabel(doc, 'Investment Summary', y);

  const summaryRow = (label: string, value: string, opts?: { bold?: boolean; color?: [number, number, number] }) => {
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...(opts?.color || MUTED));
    doc.text(label, 20, y);
    doc.setTextColor(...(opts?.color || INK));
    doc.text(value, 190, y, { align: 'right' });
    y += 6;
  };

  // Mirror the on-screen breakdown rather than collapsing everything into one
  // "Subtotal" — the client should see what the events cost and what the
  // deliverables cost as separate figures, the same way the studio quoted them.
  const deliverablesTotal = (quotation.deliverables || [])
    .filter(d => d.included)
    .reduce((sum, d) => sum + (Number(d.price) || 0), 0);
  const otherChargesTotal = (quotation.otherCharges || [])
    .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  const eventsTotal = Math.max(0, (quotation.subtotal || 0) - deliverablesTotal - otherChargesTotal);

  if (eventsTotal > 0) {
    const eventCount = (quotation.events || []).length;
    summaryRow(`Events & Crew${eventCount ? ` (${eventCount} Event${eventCount === 1 ? '' : 's'})` : ''}`, pdfINR(eventsTotal));
  }
  if (deliverablesTotal > 0) {
    summaryRow('Deliverables Total', pdfINR(deliverablesTotal));
  }

  // Each charge is listed under the label the studio actually typed ("Travel",
  // "Stay"), rather than collapsed into one generic line — the client should be
  // able to see what they are being billed for, not just that there is an extra.
  (quotation.otherCharges || [])
    .filter(c => (c.amount || 0) !== 0)
    .forEach(c => {
      const label = (c.label || '').trim() || 'Other Charge';
      summaryRow(label, `+ ${pdfINR(c.amount || 0)}`);
    });
  if (quotation.discountValue > 0) {
    summaryRow('Discount', `- ${pdfINR(quotation.discountValue)}`, { color: ACCENT });
  }

  // The total is the one figure the client looks for — give it a panel of its
  // own rather than another row in the same rhythm.
  y += 2;
  doc.setFillColor(...SOFT);
  doc.roundedRect(20, y, 170, 16, 1.5, 1.5, 'F');
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.6);
  doc.line(20, y, 20, y + 16);

  doc.setFont('times', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.setCharSpace(1.2);
  doc.text('TOTAL INVESTMENT', 26, y + 6.5);
  doc.setCharSpace(0);

  doc.setFont('times', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...ACCENT);
  doc.text(pdfINR(quotation.totalAmount), 184, y + 10.5, { align: 'right' });

  y += 24;

  // Payment schedule — same full-width row treatment.
  const milestones = quotation.paymentSchedule || [];
  if (milestones.length > 0) {
    y = drawSectionLabel(doc, 'Payment Schedule', y);

    milestones.forEach(m => {
      // The amount is what the client pays; the percentage it was derived from is
      // studio bookkeeping and only invites arithmetic arguments on a proposal.
      const labelLines = doc.splitTextToSize(m.milestone || m.name || "", 130) as string[];
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(...INK);
      doc.text(labelLines, 20, y);
      doc.setFont('helvetica', 'bold');
      doc.text(pdfINR(m.amount), 190, y, { align: 'right' });
      y += labelLines.length * 4.6 + 2;
    });
  }

  y += 4;

  // SECTION 4: TERMS — the studio's own clauses from Quotation Settings, in the
  // order set there. The hardcoded list below is only a fallback for a studio
  // that has cleared its terms entirely.
  const terms = (customTerms && customTerms.length > 0)
    ? customTerms
    : [
        `Valid until ${formatDate(quotation.validUntil, 'long')}. The date is held once the booking advance is received.`,
        'For destination shoots outside the base studio city, round-trip travel and stay for the allocated crew are arranged by the client.',
        'Complete master footage is archived on redundant storage immediately after every event wraps.',
      ];
  const termLines = terms.map(t => doc.splitTextToSize(t, 163) as string[]);
  const termsHeight = 12 + termLines.reduce((sum, lines) => sum + lines.length * 4.2 + 1.5, 0);

  if (y + termsHeight > 275) {
    doc.addPage();
    y = 20;
  }

  drawHairline(doc, 20, y, 190);
  y += 6;

  y = drawSectionLabel(doc, 'Terms', y);

  termLines.forEach((lines, i) => {
    if (y > 272) {
      doc.addPage();
      y = 24;
    }
    doc.setFont('times', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...ACCENT);
    doc.text(String(i + 1).padStart(2, '0'), 20, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(lines, 27, y);
    y += lines.length * 4.2 + 2.4;
  });

  if (quotation.specialNotes) {
    y += 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...INK);
    const noteLines = doc.splitTextToSize(`Special Inclusions: ${quotation.specialNotes}`, 170) as string[];
    doc.text(noteLines, 20, y);
  }

  drawFooters(doc);

  const filename = `Baawaray_Quotation_${quotation.quoteNumber}_${quotation.clientName.replace(/\s+/g, '_')}.pdf`;

  if (options?.returnFile) {
    return new File([doc.output('blob')], filename, { type: 'application/pdf' });
  }

  doc.save(filename);
}

/**
 * Kept as the entry point every call site already uses; the document itself is drawn
 * by `pdf/receipt.ts` on the studio's brand system — the same 105 x 187 page, paper
 * ground and sindoor frame as the proposal.
 *
 * This file's A4 layout was the older generation of studio documents. A receipt drawn
 * in that shape arrived in the same WhatsApp thread as the proposal looking like it
 * came from somewhere else, which is precisely what a booking confirmation must not do.
 */
export function generatePaymentReceiptPdf(
  client: Client,
  log: ClientPaymentLog,
  accounts: PaymentAccountConfig[] = [],
  opts: { events?: ProjectEvent[]; terms?: string[]; ownerPhone?: string } = {}
): void {
  generateReceiptPdf(client, log, accounts, opts);
}



/**
 * A bill for work added after the booking.
 *
 * Deliverables the couple asks for later — a second album, an extra edit — are not
 * part of the quotation they already agreed and part-paid against, and folding them
 * into it would rewrite that document and shift every payment milestone derived from
 * its total. They are billed here instead, on their own numbered document, so the
 * original quotation stays exactly as it was sent.
 *
 * Set `returnFile` to hand the PDF back for a WhatsApp share instead of saving it.
 */
export function generateAdditionalServicesPdf(
  client: Client,
  extras: ClientDeliverable[],
  options?: { reference?: string; notes?: string; returnFile?: boolean }
): File | void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  registerStudioFonts(doc);
  const reference = options?.reference || `ADD-${Date.now().toString().slice(-6)}`;

  registerStudioFonts(doc);
  drawDocumentHeader(doc, 'ADDITIONAL SERVICES', [
    `Ref: ${reference}`,
    `Date: ${formatDate(new Date().toISOString(), 'short')}`,
  ]);

  let y = 46;

  doc.setFont('times', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.setCharSpace(2.4);
  doc.text('PREPARED FOR', 20, y);
  doc.setCharSpace(0);
  y += 9;

  doc.setFont('times', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...INK);
  doc.text(client.name || 'Client', 20, y);
  y += 7;

  if (client.phone) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(client.phone, 20, y);
    y += 6;
  }
  y += 6;

  y = drawSectionLabel(doc, 'Requested In Addition', y);

  let total = 0;
  extras.forEach((item, i) => {
    const price = Number(item.sellingPrice) || 0;
    total += price;

    doc.setFont('times', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(String(i + 1).padStart(2, '0'), 20, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    const titleLines = doc.splitTextToSize(item.title, 120) as string[];
    doc.text(titleLines, 30, y);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...ACCENT);
    doc.text(price > 0 ? pdfINR(price) : 'Included', 190, y, { align: 'right' });

    y += titleLines.length * 4.6 + 2;

    if (item.notes) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      const noteLines = doc.splitTextToSize(item.notes, 120) as string[];
      doc.text(noteLines, 30, y);
      y += noteLines.length * 4 + 1;
    }

    y += 3;
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
  });

  y += 4;
  doc.setFillColor(...SOFT);
  doc.roundedRect(20, y, 170, 16, 1.5, 1.5, 'F');
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.6);
  doc.line(20, y, 20, y + 16);

  doc.setFont('times', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.setCharSpace(1.2);
  doc.text('AMOUNT DUE', 26, y + 6.5);
  doc.setCharSpace(0);

  doc.setFont('times', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...ACCENT);
  doc.text(pdfINR(total), 184, y + 10.5, { align: 'right' });
  y += 24;

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  const closing =
    options?.notes ||
    'These items are in addition to your original quotation, which remains unchanged.';
  const closingLines = doc.splitTextToSize(closing, 170) as string[];
  doc.text(closingLines, 20, y);

  drawFooters(doc);

  const filename = `Baawaray_Additional_Services_${(client.name || 'Client').replace(/\s+/g, '_')}_${reference}.pdf`;

  if (options?.returnFile) {
    return new File([doc.output('blob')], filename, { type: 'application/pdf' });
  }

  doc.save(filename);
}
