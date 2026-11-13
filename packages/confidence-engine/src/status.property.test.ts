import { describe, it, expect } from 'vitest';
import { assertProperty, fc } from '../../../tests/setup/fast-check';
import type { CatalogIndex, CatalogProduct, MatchResult } from '@awaaz-kit/catalog-matcher';
import type { CandidateLine, ExtractionResult } from '@awaaz-kit/intent-engine';
import type { CanonicalUnit } from '@awaaz-kit/language-normalizer';
import { resolveLines } from './resolve';

const UNITS: CanonicalUnit[] = ['piece', 'kg', 'g', 'litre', 'ml'];
const unitArb = fc.constantFrom(...UNITS);

const productArb: fc.Arbitrary<CatalogProduct> = fc.record({
  id: fc.uuid(),
  shopId: fc.constant('shop-1'),
  name: fc.string({ minLength: 1, maxLength: 12 }),
  aliases: fc.constant([] as string[]),
  unit: unitArb,
  pricePaise: fc.integer({ min: 0, max: 1_000_000 }),
  active: fc.constant(true),
  deletedAt: fc.constant(null),
});

// Matcher results are generated directly (the input space of resolveLines), including >3 candidates.
const matchArb: fc.Arbitrary<MatchResult> = fc.oneof(
  productArb.map((product): MatchResult => ({ kind: 'exact', product, via: 'alias' })),
  fc
    .array(productArb, { minLength: 2, maxLength: 6 })
    .map((candidates): MatchResult => ({ kind: 'ambiguous', candidates })),
  fc
    .array(productArb, { minLength: 1, maxLength: 6 })
    .map((candidates): MatchResult => ({ kind: 'suggestions', candidates })),
  fc.constant<MatchResult>({ kind: 'unmatched' }),
);

const caseArb = fc.record({
  match: matchArb,
  qty: fc.option(fc.integer({ min: 1, max: 1_000_000 }), { nil: null }),
  unit: fc.option(unitArb, { nil: null }),
});

function candidateLine(qty: number | null, unit: CanonicalUnit | null): CandidateLine {
  return {
    index: 0,
    productPhrase: { value: 'phrase', status: 'confirmed', sourceText: 'phrase' },
    quantityMilli:
      qty === null ? { value: null, status: 'missing' } : { value: qty, status: 'confirmed' },
    unit: unit === null ? { value: null, status: 'missing' } : { value: unit, status: 'confirmed' },
  };
}

describe('Property 12: field statuses follow the uncertainty rules', () => {
  // Feature: awaaz-kit, Property 12: Field statuses follow the uncertainty rules
  // **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5**
  it('Property 12', () =>
    assertProperty(
      fc.property(caseArb, ({ match, qty, unit }) => {
        const index: CatalogIndex = { match: () => match };
        const extraction: ExtractionResult = { lines: [candidateLine(qty, unit)] };
        const [r] = resolveLines(extraction, index, () => 'line-1');
        expect(r).toBeDefined();
        const line = r!;

        // Quantity rule (table-driven): absent -> missing + null, never 1; present -> kept as given.
        if (qty === null) {
          expect(line.quantityMilli.status).toBe('missing');
          expect(line.quantityMilli.value).toBeNull();
        } else {
          expect(line.quantityMilli.value).toBe(qty);
        }

        // Unit rule: absent -> needs_review; differs from catalog unit -> needs_review, no conversion.
        if (unit === null) {
          expect(line.unit.status).toBe('needs_review');
          expect(line.unit.value).toBeNull();
        } else {
          expect(line.unit.value).toBe(unit); // never converted
          if (match.kind === 'exact' && match.product.unit !== unit) {
            expect(line.unit.status).toBe('needs_review');
          }
        }

        // Product rule by matcher kind.
        switch (match.kind) {
          case 'unmatched':
            expect(line.product.status).toBe('unmatched');
            expect(line.product.value).toBeNull();
            expect(line.candidates).toEqual([]);
            break;
          case 'ambiguous':
          case 'suggestions':
            expect(line.product.status).toBe('needs_review');
            expect(line.product.value).toBeNull();
            expect(line.candidates.length).toBe(Math.min(3, match.candidates.length));
            expect(line.candidates.length).toBeLessThanOrEqual(3);
            for (const c of line.candidates) {
              expect(match.candidates.map((m) => m.id)).toContain(c.id);
            }
            break;
          case 'exact':
            expect(line.product.value).toEqual({
              productId: match.product.id,
              name: match.product.name,
            });
            // An uncertain quantity or unit must never leave the product looking confirmed.
            if (qty === null || unit === null || unit !== match.product.unit) {
              expect(line.product.status).not.toBe('confirmed');
            }
            break;
        }
      }),
    ));
});
