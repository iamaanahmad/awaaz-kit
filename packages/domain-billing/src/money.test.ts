import { describe, expect, it } from 'vitest';
import {
  checkedLineTotalPaise,
  computeTotals,
  formatRupees,
  lineTotalPaise,
  parseRupees,
} from './money.js';

describe('lineTotalPaise', () => {
  it('rounds exact halves up', () => {
    expect(lineTotalPaise(1, 500)).toBe(1); // 0.5 -> 1
    expect(lineTotalPaise(1, 499)).toBe(0); // 0.499 -> 0
    expect(lineTotalPaise(3, 500)).toBe(2); // 1.5 -> 2
    expect(lineTotalPaise(4500, 2500)).toBe(11250); // 2.5 kg at 45.00
  });

  it('is exact beyond double precision', () => {
    const max = Number.MAX_SAFE_INTEGER;
    expect(lineTotalPaise(max, 1000)).toBe(max);
  });

  it('reports invalid inputs without throwing', () => {
    expect(lineTotalPaise(-1, 1000)).toBeNaN();
    expect(lineTotalPaise(1.5, 1000)).toBeNaN();
    expect(lineTotalPaise(100, Number.NaN)).toBeNaN();
    const r = checkedLineTotalPaise(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
    expect(r.ok).toBe(false);
  });
});

describe('computeTotals', () => {
  it('sums lines and applies discount and tax', () => {
    const t = computeTotals(
      [
        { unitPricePaise: 4500, qtyMilli: 2000 },
        { unitPricePaise: 15000, qtyMilli: 1500 },
      ],
      1000,
      500,
    );
    expect(t.lineTotals).toEqual([9000, 22500]);
    expect(t.subtotalPaise).toBe(31500);
    expect(t.totalPaise).toBe(31000);
    expect(t.discountValid).toBe(true);
    expect(t.issues).toEqual([]);
  });

  it('flags a discount above the subtotal', () => {
    const t = computeTotals([{ unitPricePaise: 100, qtyMilli: 1000 }], 101, 0);
    expect(t.discountValid).toBe(false);
    expect(t.issues.map((i) => i.code)).toContain('discount_exceeds_subtotal');
  });

  it('flags invalid lines with their index', () => {
    const t = computeTotals([{ unitPricePaise: 100, qtyMilli: -1 }], 0, 0);
    expect(t.issues[0]).toMatchObject({ code: 'invalid_quantity', lineIndex: 0 });
  });
});

describe('formatRupees / parseRupees', () => {
  it('formats with Indian grouping', () => {
    expect(formatRupees(0)).toBe('₹0.00');
    expect(formatRupees(5)).toBe('₹0.05');
    expect(formatRupees(12345650)).toBe('₹1,23,456.50');
  });

  it('round-trips', () => {
    for (const p of [0, 1, 99, 100, 123456, 12345650, Number.MAX_SAFE_INTEGER]) {
      expect(parseRupees(formatRupees(p))).toBe(p);
    }
  });

  it('rejects bad text', () => {
    expect(parseRupees('abc')).toBeNull();
    expect(parseRupees('1.234')).toBeNull();
  });
});
