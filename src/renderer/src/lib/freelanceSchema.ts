/** Shared security boundary for web and desktop writes. */
export const FREELANCE_BILLING_FIELDS = [
  'clientCharge', 'pricing', 'quotedPricing', 'keepPercent', 'cullPercent', 'pricingRevisedAt', 'priorCharge',
  'clientPaidAmount', 'clientPaymentStatus', 'clientPayments', 'clientName', 'clientPhone',
  'clientEmail', 'clientOrganization', 'freelanceClientId', 'notes', 'activityLogs',
  'mediaBilling', 'desktopInvoices',
] as const;
export const FREELANCE_EDITOR_FIELDS = [
  'editorPay', 'editorPaidAmount', 'editorPaymentStatus', 'editorPayouts', 'editorName',
  'editorPhone', 'editorEmail', 'editorMemberId', 'assignedType', 'workerType', 'editingInstructions',
] as const;
export function splitFreelanceRecord(record: Record<string, unknown>): Record<'publicHalf' | 'billingHalf' | 'editorHalf', Record<string, unknown>> {
  const publicHalf: Record<string, unknown> = {}, billingHalf: Record<string, unknown> = {}, editorHalf: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if ((FREELANCE_BILLING_FIELDS as readonly string[]).includes(key)) billingHalf[key] = value;
    else if ((FREELANCE_EDITOR_FIELDS as readonly string[]).includes(key)) editorHalf[key] = value;
    else publicHalf[key] = value;
  }
  if (record.clientAuthUid) billingHalf.clientAuthUid = record.clientAuthUid;
  if (record.editorAuthUid) editorHalf.editorAuthUid = record.editorAuthUid;
  return { publicHalf, billingHalf, editorHalf };
}
