export function cloudErrorMessage(error: unknown, fallback = 'That did not complete.'): string {
  const message = error instanceof Error ? error.message : String(error || '');
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';
  const dailyQuotaExceeded = /(?:daily|free daily).*(?:quota|limit)|quota (?:limit )?exceeded|free daily (?:read|write|delete) units/i.test(message);
  const resourceExhausted = code.includes('resource-exhausted');

  if (dailyQuotaExceeded) {
    return 'Firestore’s daily free quota is exhausted, so this change was not saved. The quota resets around midnight Pacific time. A Firebase budget does not upgrade the project; the project must be on the Blaze billing plan to continue beyond the free daily allowance.';
  }

  if (resourceExhausted) {
    return 'Firestore temporarily rejected this change because a resource limit was reached. This can be a short-rate limit or another project limit, not necessarily the daily quota. Try again shortly; if it continues, check the Firebase console and the app log for the original Firebase error.';
  }

  return message || fallback;
}
