const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
  'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function underThousand(n: number): string {
  if (n === 0) return '';
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = TENS[Math.floor(n / 10)];
    const o = ONES[n % 10];
    return o ? `${t}-${o}` : t;
  }
  const rest = underThousand(n % 100);
  return `${ONES[Math.floor(n / 100)]} Hundred${rest ? ` ${rest}` : ''}`;
}

/**
 * A rupee amount written out, in the Indian system.
 *
 * Crore and lakh rather than million — "Three Lakh Thirty-One Thousand Rupees" is
 * what a couple in India reads without converting. Printed under the total so the
 * figure cannot be misread by a digit.
 */
export function amountInWords(amount: number): string {
  const n = Math.round(Math.abs(Number(amount) || 0));
  if (n === 0) return 'Zero Rupees';

  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${underThousand(crore)} Crore`);
  if (lakh) parts.push(`${underThousand(lakh)} Lakh`);
  if (thousand) parts.push(`${underThousand(thousand)} Thousand`);
  if (rest) parts.push(underThousand(rest));

  return `${parts.join(' ')} Rupees`;
}
