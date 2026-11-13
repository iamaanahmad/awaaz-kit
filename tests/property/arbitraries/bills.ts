import { fc, MAX_PRICE_PAISE, MAX_QTY_MILLI } from './common';

/**
 * Bill arithmetic inputs plus an independent BigInt oracle.
 * The oracle shares no code with `domain-billing`: it uses exact rational arithmetic with an
 * explicit half-up comparison instead of the production `(p*q + 500) / 1000` shortcut.
 */

export interface PricedLineInput {
  unitPricePaise: number;
  qtyMilli: number;
}

export interface BillInput {
  lines: PricedLineInput[];
  discountPaise: number;
  taxPaise: number;
}

export const pricedLineArb: fc.Arbitrary<PricedLineInput> = fc.record({
  unitPricePaise: fc.integer({ min: 0, max: MAX_PRICE_PAISE }),
  qtyMilli: fc.integer({ min: 0, max: MAX_QTY_MILLI }),
});

/**
 * Lines that hit exact rounding halves: price*qty modulo 1000 is 500 or 0. Useful for
 * half-up rounding properties.
 */
export const halfBoundaryLineArb: fc.Arbitrary<PricedLineInput> = fc
  .tuple(fc.integer({ min: 0, max: 100 }), fc.integer({ min: 0, max: 100_000 }))
  .map(([j, price]) => ({
    // qty = 500 * odd, so price*qty mod 1000 is 500 for odd prices and 0 for even prices
    qtyMilli: 500 * (2 * j + 1),
    unitPricePaise: price,
  }));

/** Oracle: line total in paise, round half up, via BigInt division with explicit remainder. */
export function oracleLineTotal(line: PricedLineInput): bigint {
  const product = BigInt(line.unitPricePaise) * BigInt(line.qtyMilli);
  const quotient = product / 1000n;
  const remainder = product % 1000n;
  return remainder >= 500n ? quotient + 1n : quotient;
}

export interface OracleTotals {
  lineTotals: bigint[];
  subtotal: bigint;
  /** Final total, or null when the discount exceeds the subtotal. */
  total: bigint | null;
}

export function oracleTotals(bill: BillInput): OracleTotals {
  const lineTotals = bill.lines.map(oracleLineTotal);
  const subtotal = lineTotals.reduce((a, b) => a + b, 0n);
  const discount = BigInt(bill.discountPaise);
  const total = discount > subtotal ? null : subtotal - discount + BigInt(bill.taxPaise);
  return { lineTotals, subtotal, total };
}

/** A bill whose discount never exceeds its subtotal (valid), with optional tax. */
export const validBillArb: fc.Arbitrary<BillInput> = fc
  .tuple(
    fc.array(pricedLineArb, { minLength: 1, maxLength: 12 }),
    fc.double({ min: 0, max: 1, noNaN: true }),
    fc.boolean(),
    fc.nat({ max: 1_000_000 }),
  )
  .map(([lines, fraction, taxOn, tax]) => {
    const subtotal = lines.reduce((a, l) => a + oracleLineTotal(l), 0n);
    const discountPaise = Number((subtotal * BigInt(Math.floor(fraction * 1000))) / 1000n);
    return { lines, discountPaise, taxPaise: taxOn ? tax : 0 };
  });

/** A bill whose discount is strictly greater than its subtotal (must block finalization). */
export const excessDiscountBillArb: fc.Arbitrary<BillInput> = fc
  .tuple(fc.array(pricedLineArb, { minLength: 0, maxLength: 8 }), fc.integer({ min: 1, max: 100_000 }))
  .map(([lines, extra]) => {
    const subtotal = lines.reduce((a, l) => a + oracleLineTotal(l), 0n);
    return { lines, discountPaise: Number(subtotal) + extra, taxPaise: 0 };
  });

/** Any bill: valid or not, with half-boundary lines mixed in. */
export const billArb: fc.Arbitrary<BillInput> = fc.oneof(
  { weight: 3, arbitrary: validBillArb },
  { weight: 1, arbitrary: excessDiscountBillArb },
  {
    weight: 1,
    arbitrary: fc
      .array(halfBoundaryLineArb, { minLength: 1, maxLength: 6 })
      .map((lines) => ({ lines, discountPaise: 0, taxPaise: 0 })),
  },
);

/** Whole-rupee and fractional paise amounts for display and parse round-trip properties. */
export const paiseAmountArb: fc.Arbitrary<number> = fc.oneof(
  fc.integer({ min: 0, max: 99 }),
  fc.integer({ min: 0, max: 100_000_000 }),
  fc.integer({ min: 0, max: 1_000_000 }).map((r) => r * 100),
);
