import { describe, expect, it } from 'vitest';
import { computeTotals, lineTotalPaise } from '../../packages/domain-billing/src/index';
import { assertProperty } from '../setup/fast-check';
import {
  billArb,
  fc,
  halfBoundaryLineArb,
  oracleLineTotal,
  oracleTotals,
  pricedLineArb,
} from './arbitraries';

// Feature: awaaz-kit, Property 24: Bill arithmetic is exact and consistent
describe('Property 24: Bill arithmetic is exact and consistent', () => {
  it('Property 24: totals match the independent BigInt half-up oracle. **Validates: Requirements 13.7, 14.1, 14.2, 14.3, 14.4, 14.5, 14.8**', () => {
    assertProperty(
      fc.property(billArb, (bill) => {
        const oracle = oracleTotals(bill);
        const totals = computeTotals(bill.lines, bill.discountPaise, bill.taxPaise);

        bill.lines.forEach((line, i) => {
          const expected = Number(oracle.lineTotals[i]);
          expect(lineTotalPaise(line.unitPricePaise, line.qtyMilli)).toBe(expected);
          expect(totals.lineTotals[i]).toBe(expected);
          expect(Number.isInteger(totals.lineTotals[i])).toBe(true);
          expect(totals.lineTotals[i]).toBeGreaterThanOrEqual(0);
        });

        expect(totals.subtotalPaise).toBe(Number(oracle.subtotal));
        expect(totals.subtotalPaise).toBe(totals.lineTotals.reduce((a, b) => a + b, 0));

        if (oracle.total === null) {
          // Discount above the subtotal: flagged, never silently clamped.
          expect(totals.discountValid).toBe(false);
        } else {
          expect(totals.discountValid).toBe(true);
          expect(totals.issues).toEqual([]);
          expect(totals.totalPaise).toBe(Number(oracle.total));
          expect(totals.totalPaise).toBe(
            totals.subtotalPaise - bill.discountPaise + bill.taxPaise,
          );
          expect(Number.isInteger(totals.totalPaise)).toBe(true);
          expect(totals.totalPaise).toBeGreaterThanOrEqual(0);
        }
      }),
    );
  });

  it('Property 24: exact .5 boundaries round up. **Validates: Requirements 14.2, 14.3**', () => {
    assertProperty(
      fc.property(halfBoundaryLineArb, (line) => {
        const product = BigInt(line.unitPricePaise) * BigInt(line.qtyMilli);
        const actual = lineTotalPaise(line.unitPricePaise, line.qtyMilli);
        expect(BigInt(actual)).toBe(oracleLineTotal(line));
        // Odd price * 500*odd leaves remainder 500: must round up, not to even or down.
        if (product % 1000n === 500n) {
          expect(BigInt(actual)).toBe(product / 1000n + 1n);
        } else {
          expect(BigInt(actual)).toBe(product / 1000n);
        }
      }),
    );
  });

  it('Property 24: changing one quantity yields exactly the recomputed totals. **Validates: Requirements 14.4, 14.5**', () => {
    assertProperty(
      fc.property(
        fc.array(pricedLineArb, { minLength: 1, maxLength: 8 }),
        fc.nat({ max: 100 }),
        fc.integer({ min: 0, max: 100_000 }),
        (lines, rawIdx, newQty) => {
          const idx = rawIdx % lines.length;
          const edited = lines.map((l, i) => (i === idx ? { ...l, qtyMilli: newQty } : l));
          const totals = computeTotals(edited, 0, 0);
          const oracle = oracleTotals({ lines: edited, discountPaise: 0, taxPaise: 0 });
          expect(totals.subtotalPaise).toBe(Number(oracle.subtotal));
          expect(totals.totalPaise).toBe(Number(oracle.total));
          expect(totals.lineTotals[idx]).toBe(Number(oracleLineTotal(edited[idx]!)));
        },
      ),
    );
  });

  it('example: 1.5 kg at Rs 0.01 (exact half) rounds up to 2 paise', () => {
    expect(lineTotalPaise(1, 1500)).toBe(2);
    expect(lineTotalPaise(1, 500)).toBe(1);
    expect(lineTotalPaise(1, 499)).toBe(0);
  });
});
