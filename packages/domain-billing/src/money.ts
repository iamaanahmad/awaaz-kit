/**
 * Money arithmetic for bills.
 *
 * All money is integer paise. All quantities are integer milli-units
 * (1000 = one kg, litre or piece).
 *
 * Rounding rule (the only one in this package): a line total is
 * `round_half_up(unitPricePaise * qtyMilli / 1000)`, computed exactly with
 * BigInt as `(price * qty + 500) / 1000` using truncating division on
 * non-negative values. Exact halves round up.
 *
 * Invalid inputs (negative, fractional, non-finite or unsafe integers, or
 * results beyond the safe integer range) are reported as issues, never thrown.
 */

export interface MoneyIssue {
  code: string;
  /** Index of the offending line, when the issue belongs to one. */
  lineIndex?: number;
  field?: string;
  message: string;
}

export type LineTotalResult = { ok: true; paise: number } | { ok: false; issue: MoneyIssue };

export interface PricedLine {
  unitPricePaise: number;
  qtyMilli: number;
}

export interface Totals {
  /** One entry per input line; 0 for lines that had an issue. */
  lineTotals: number[];
  subtotalPaise: number;
  totalPaise: number;
  /** False when the discount exceeds the subtotal. */
  discountValid: boolean;
  /** Empty when every input is valid. Totals are only trustworthy then. */
  issues: MoneyIssue[];
}

const isNonNegativeSafeInt = (n: unknown): n is number =>
  typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;

/** Checked line total. Returns an issue instead of throwing. */
export function checkedLineTotalPaise(unitPricePaise: number, qtyMilli: number): LineTotalResult {
  if (!isNonNegativeSafeInt(unitPricePaise)) {
    return {
      ok: false,
      issue: {
        code: 'invalid_price',
        field: 'unitPricePaise',
        message: 'Price must be a non-negative whole number of paise.',
      },
    };
  }
  if (!isNonNegativeSafeInt(qtyMilli)) {
    return {
      ok: false,
      issue: {
        code: 'invalid_quantity',
        field: 'qtyMilli',
        message: 'Quantity must be a non-negative whole number of milli-units.',
      },
    };
  }
  const total = (BigInt(unitPricePaise) * BigInt(qtyMilli) + 500n) / 1000n;
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    return {
      ok: false,
      issue: {
        code: 'amount_too_large',
        field: 'lineTotalPaise',
        message: 'Line total is too large.',
      },
    };
  }
  return { ok: true, paise: Number(total) };
}

/**
 * Line total in paise using the half-up rule. Returns `NaN` for invalid
 * input; use `checkedLineTotalPaise` or `computeTotals` to get the reason.
 */
export function lineTotalPaise(unitPricePaise: number, qtyMilli: number): number {
  const r = checkedLineTotalPaise(unitPricePaise, qtyMilli);
  return r.ok ? r.paise : Number.NaN;
}

/** Subtotal, final total and discount validity for a set of lines. */
export function computeTotals(
  lines: readonly PricedLine[],
  discountPaise: number,
  taxPaise: number,
): Totals {
  const issues: MoneyIssue[] = [];
  const lineTotals: number[] = [];
  let subtotal = 0n;

  lines.forEach((line, lineIndex) => {
    const r = checkedLineTotalPaise(line.unitPricePaise, line.qtyMilli);
    if (r.ok) {
      lineTotals.push(r.paise);
      subtotal += BigInt(r.paise);
    } else {
      lineTotals.push(0);
      issues.push({ ...r.issue, lineIndex });
    }
  });

  if (!isNonNegativeSafeInt(discountPaise)) {
    issues.push({
      code: 'invalid_discount',
      field: 'discountPaise',
      message: 'Discount must be a non-negative whole number of paise.',
    });
  }
  if (!isNonNegativeSafeInt(taxPaise)) {
    issues.push({
      code: 'invalid_tax',
      field: 'taxPaise',
      message: 'Tax must be a non-negative whole number of paise.',
    });
  }

  const discount = isNonNegativeSafeInt(discountPaise) ? BigInt(discountPaise) : 0n;
  const tax = isNonNegativeSafeInt(taxPaise) ? BigInt(taxPaise) : 0n;
  const discountValid = discount <= subtotal;
  if (!discountValid) {
    issues.push({
      code: 'discount_exceeds_subtotal',
      field: 'discountPaise',
      message: 'Discount cannot be more than the subtotal.',
    });
  }

  const total = discountValid ? subtotal - discount + tax : subtotal + tax;
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (subtotal > max || total > max) {
    issues.push({
      code: 'amount_too_large',
      message: 'Bill total is too large.',
    });
    return { lineTotals, subtotalPaise: 0, totalPaise: 0, discountValid, issues };
  }

  return {
    lineTotals,
    subtotalPaise: Number(subtotal),
    totalPaise: Number(total),
    discountValid,
    issues,
  };
}

function groupIndian(intPart: string): string {
  if (intPart.length <= 3) return intPart;
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

/**
 * Display string like `₹1,23,456.50` (Indian digit grouping, always two
 * decimals). Display only. Invalid input yields `₹–`.
 */
export function formatRupees(paise: number): string {
  if (!isNonNegativeSafeInt(paise)) return '₹–';
  const rupees = Math.floor(paise / 100);
  const rem = paise % 100;
  return `₹${groupIndian(String(rupees))}.${String(rem).padStart(2, '0')}`;
}

/**
 * Parses text produced by `formatRupees` (also plain `1234.5`, `₹ 1,234`)
 * back to paise. Returns `null` when the text is not a valid amount.
 */
export function parseRupees(text: string): number | null {
  const cleaned = text.replace(/[₹\s,]/g, '');
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!m) return null;
  const rupees = BigInt(m[1] as string);
  const frac = (m[2] ?? '').padEnd(2, '0');
  const paise = rupees * 100n + BigInt(frac);
  if (paise > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(paise);
}
