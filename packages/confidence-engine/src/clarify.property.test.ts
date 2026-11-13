import { describe, it, expect } from 'vitest';
import { assertProperty, fc } from '../../../tests/setup/fast-check';
import type { CatalogProduct } from '@awaaz-kit/catalog-matcher';
import type { CanonicalUnit } from '@awaaz-kit/language-normalizer';
import { nextClarification } from './clarify';
import type { ResolvedLine } from './resolve';

const STATUSES = ['confirmed', 'needs_review', 'missing', 'unmatched'] as const;
const statusArb = fc.constantFrom(...STATUSES);
const UNITS: CanonicalUnit[] = ['piece', 'kg', 'g', 'litre', 'ml'];

const productArb: fc.Arbitrary<CatalogProduct> = fc.record({
  id: fc.uuid(),
  shopId: fc.constant('shop-1'),
  name: fc.string({ minLength: 1, maxLength: 8 }),
  aliases: fc.constant([] as string[]),
  unit: fc.constantFrom(...UNITS),
  pricePaise: fc.integer({ min: 0, max: 100_000 }),
  active: fc.constant(true),
  deletedAt: fc.constant(null),
});

// Weighted towards `confirmed` so that all-confirmed lists occur often.
const fieldStatusArb = fc.oneof(
  { weight: 3, arbitrary: fc.constant('confirmed' as const) },
  { weight: 2, arbitrary: statusArb },
);

const lineArb: fc.Arbitrary<ResolvedLine> = fc
  .record({
    lineId: fc.uuid(),
    spokenName: fc.string({ maxLength: 10 }),
    pStatus: fieldStatusArb,
    qStatus: fieldStatusArb,
    uStatus: fieldStatusArb,
    candidates: fc.array(productArb, { maxLength: 6 }),
    productId: fc.uuid(),
    qty: fc.integer({ min: 1, max: 100_000 }),
    unit: fc.constantFrom(...UNITS),
  })
  .map((r) => ({
    lineId: r.lineId,
    spokenName: r.spokenName,
    candidates: r.candidates,
    product: {
      value: r.pStatus === 'confirmed' ? { productId: r.productId, name: 'x' } : null,
      status: r.pStatus,
    },
    quantityMilli: { value: r.qStatus === 'confirmed' ? r.qty : null, status: r.qStatus },
    unit: { value: r.uStatus === 'confirmed' ? r.unit : null, status: r.uStatus },
  }));

const linesArb = fc.array(lineArb, { maxLength: 6 });

describe('Property 14: Exactly one clarification at a time', () => {
  // Feature: awaaz-kit, Property 14: Exactly one clarification at a time
  // **Validates: Requirements 10.7**
  it('Property 14', () =>
    assertProperty(
      fc.property(linesArb, (lines) => {
        // Oracle: flatten to (line, field) pairs in line-major, product/qty/unit order.
        const flat: { i: number; field: string; status: string }[] = [];
        lines.forEach((l, i) => {
          flat.push({ i, field: 'product', status: l.product.status });
          flat.push({ i, field: 'quantityMilli', status: l.quantityMilli.status });
          flat.push({ i, field: 'unit', status: l.unit.status });
        });
        const expected = flat.find((f) => f.status !== 'confirmed');

        const result = nextClarification(lines);
        if (expected === undefined) {
          expect(result).toBeNull();
        } else {
          expect(result).not.toBeNull();
          expect(result!.lineIndex).toBe(expected.i);
          expect(result!.lineId).toBe(lines[expected.i]!.lineId);
          expect(result!.field).toBe(expected.field);
          expect(result!.prompt.length).toBeGreaterThan(0);
          expect(result!.candidates.length).toBeLessThanOrEqual(3);
          if (expected.field !== 'product') expect(result!.candidates).toEqual([]);
        }
      }),
    ));
});
