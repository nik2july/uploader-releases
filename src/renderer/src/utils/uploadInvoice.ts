import { jsPDF } from 'jspdf';
import type { InvoiceSnapshot } from '../../../shared/contracts';

export async function downloadInvoice(invoice: InvoiceSnapshot): Promise<void> {
  const pdf = new jsPDF();
  let y = 24;
  const line = (text: string, size = 11): void => {
    pdf.setFontSize(size);
    const rows = pdf.splitTextToSize(text, 170) as string[];
    for (const row of rows) { if (y > 270) { pdf.addPage(); y = 24; } pdf.text(row, 20, y); y += size * 0.55 + 2; }
  };
  line(invoice.studioName, 23); line(invoice.status === 'issued' ? 'INVOICE' : 'DRAFT - NOT ISSUED', 15);
  line(invoice.number); line(`Date: ${invoice.createdAt.slice(0, 10)}`); y += 7;
  line(`Bill to: ${invoice.clientName}`, 13); line(invoice.title); y += 7;
  line(`${invoice.quantity} ${invoice.unit} x ${invoice.currency} ${invoice.rate.toLocaleString('en-IN')}`);
  line(`Subtotal: ${invoice.currency} ${invoice.subtotal.toLocaleString('en-IN')}`);
  if (invoice.taxPercent) line(`Tax (${invoice.taxPercent}%): ${invoice.currency} ${invoice.tax.toLocaleString('en-IN')}`);
  line(`Total: ${invoice.currency} ${invoice.total.toLocaleString('en-IN')}`, 15);
  if (invoice.calculation) {
    const c = invoice.calculation; y += 8;
    if (c.pricing.basis === 'per_photo') line(`${c.measurement.photoCount} source photos; ${c.input.keepPercent}% kept; ${c.pricing.quantity} billable. Source files are unchanged.`);
    if (c.pricing.basis === 'per_sheet') line(`${c.measurement.photoCount} photos / ${c.input.photosPerSheet} per sheet, rounded up. Agreed billable sheets: ${c.pricing.quantity}.`);
    if (c.pricing.basis === 'per_raw_hour') line(`Raw clip duration: ${c.measurement.rawDurationSeconds.toFixed(1)} seconds. One-hour minimum; billable hours rounded to two decimals.`);
  }
  if (invoice.note) { y += 6; line(invoice.note); }
  y += 8; line('This document does not record a payment. Payments and account balances are maintained in Studio OS.', 9);
  await window.api.savePdf(new Uint8Array(pdf.output('arraybuffer')), `${invoice.number}${invoice.status === 'draft' ? '-draft' : ''}.pdf`);
}
