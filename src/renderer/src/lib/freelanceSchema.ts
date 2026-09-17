/** Shared security boundary for web and desktop writes. */
export const FREELANCE_BILLING_FIELDS = [
  'clientCharge', 'pricing', 'quotedPricing', 'keepPercent', 'cullPercent', 'pricingRevisedAt', 'priorCharge',
  'clientPaidAmount', 'clientPaymentStatus', 'clientPayments',
  'mediaBilling', 'desktopInvoices',
] as const;

export const FREELANCE_EDITOR_FIELDS = [
  'editorPay', 'editorPaidAmount', 'editorPaymentStatus', 'editorPayouts',
] as const;

export function splitFreelanceRecord(record: Record<string, unknown>): Record<'publicHalf' | 'billingHalf' | 'editorHalf', Record<string, unknown>> {
  const publicHalf: Record<string, unknown> = {}, billingHalf: Record<string, unknown> = {}, editorHalf: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if ((FREELANCE_BILLING_FIELDS as readonly string[]).includes(key)) {
      billingHalf[key] = value;
    } else if ((FREELANCE_EDITOR_FIELDS as readonly string[]).includes(key)) {
      editorHalf[key] = value;
    } else {
      publicHalf[key] = value;
    }
  }

  // Denormalise / mirror operational identity fields onto subcollections
  // so security rules and scoped listeners work seamlessly.
  if (record.clientAuthUid !== undefined) billingHalf.clientAuthUid = record.clientAuthUid;
  if (record.editorAuthUid !== undefined) editorHalf.editorAuthUid = record.editorAuthUid;
  if (record.editorName !== undefined) editorHalf.editorName = record.editorName;
  if (record.editorPhone !== undefined) editorHalf.editorPhone = record.editorPhone;
  if (record.editorEmail !== undefined) editorHalf.editorEmail = record.editorEmail;
  if (record.editorMemberId !== undefined) editorHalf.editorMemberId = record.editorMemberId;
  if (record.assignedType !== undefined) editorHalf.assignedType = record.assignedType;
  if (record.workerType !== undefined) editorHalf.workerType = record.workerType;
  if (record.editingInstructions !== undefined) editorHalf.editingInstructions = record.editingInstructions;

  if (record.clientName !== undefined) billingHalf.clientName = record.clientName;
  if (record.clientPhone !== undefined) billingHalf.clientPhone = record.clientPhone;
  if (record.clientEmail !== undefined) billingHalf.clientEmail = record.clientEmail;
  if (record.clientOrganization !== undefined) billingHalf.clientOrganization = record.clientOrganization;
  if (record.freelanceClientId !== undefined) billingHalf.freelanceClientId = record.freelanceClientId;

  return { publicHalf, billingHalf, editorHalf };
}
