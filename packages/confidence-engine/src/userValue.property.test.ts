import { describe, it, expect } from 'vitest';
import { assertProperty, fc } from '../../../tests/setup/fast-check';
import type { CatalogProduct } from '@awaaz-kit/catalog-matcher';
import type { CanonicalUnit } from '@awaaz-kit/language-normalizer';
import { applyUserValue } from './clarify';
import type { ExtractedField, FieldStatus, ResolvedLine, ResolvedProduct } from './resolve';

const UNITS: CanonicalUnit[] = ['piece', 'kg', 'g', 'litre', 'ml'];
const unitArb = fc.constantFrom(...UNITS);
const statusArb = fc.constantFrom<FieldStatus>('confirmed', 'needs_review', 'missing', 'unmatched');

function fieldArb<T>(valueArb: fc.Arbitrary<T>): fc.Arbitrary<ExtractedField<T>> {
  return fc.record(
    {
      value: fc.option(valueArb, { nil: null }),
      status: statusArb,
      sourceText: fc.string({ maxLength: 10 }),
      confidence: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: null }),
      reason: fc.string({ maxLength: 10 }),
    },
    { requiredKeys: ['value', 'status'] },
  ) as fc.Arbitrary<ExtractedField<T>>;
}

const resolvedProductArb: fc.Arbitrary<ResolvedProduct> = fc.record({
  productId: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 12 }),
});

const catalogProductArb: fc.Arbitrary<CatalogProduct> = fc.record({
  id: fc.uuid(),
  shopId: fc.constant('shop-1'),
  name: fc.string({ minLength: 1, maxLength: 12 }),
  aliases: fc.constant([] as string[]),
  unit: unitArb,
  pricePaise: fc.integer({ min: 0, max: 1_000_000 }),
  active: fc.constant(true),
  deletedAt: fc.constant(null),
});

const lineArb: fc.Arbitrary<ResolvedLine> = fc.record({
  lineId: fc.uuid(),
  product: fieldArb(resolvedProductArb),
  quantityMilli: fieldArb(fc.integer({ min: 1, max: 1_000_000 })),
  unit: fieldArb(unitArb),
  candidates: fc.array(catalogProductArb, { maxLength: 3 }),
  spokenName: fc.string({ maxLength: 12 }),
});

type Case =
  | { field: 'product'; value: ResolvedProduct }
  | { field: 'quantityMilli'; value: number }
  | { field: 'unit'; value: CanonicalUnit };

const caseArb: fc.Arbitrary<Case> = fc.oneof(
  resolvedProductArb.map((value): Case => ({ field: 'product', value })),
  fc.integer({ min: 1, max: 1_000_000 }).map((value): Case => ({ field: 'quantityMilli', value })),
  unitArb.map((value): Case => ({ field: 'unit', value })),
);

const scenarioArb = fc
  .tuple(fc.array(lineArb, { minLength: 1, maxLength: 5 }), caseArb)
  .chain(([lines, c]) =>
    fc.nat({ max: lines.length - 1 }).map((target) => ({ lines, target, c })),
  );

const FIELDS = ['product', 'quantityMilli', 'unit'] as const;

describe('Property 13: a user-supplied value confirms the field', () => {
  // Feature: awaaz-kit, Property 13: A user-supplied value confirms the field
  // **Validates: Requirements 10.6**
  it('Property 13', () =>
    assertProperty(
      fc.property(scenarioArb, ({ lines, target, c }) => {
        const snapshot = structuredClone(lines);
        const original = lines[target]!;

        // Apply to one line of the list; the rest of the list is carried through as-is.
        const updatedLine =
          c.field === 'product'
            ? applyUserValue(original, 'product', c.value)
            : c.field === 'quantityMilli'
              ? applyUserValue(original, 'quantityMilli', c.value)
              : applyUserValue(original, 'unit', c.value);
        const result = lines.map((l, i) => (i === target ? updatedLine : l));

        // The chosen field carries exactly the supplied value, confirmed.
        expect(updatedLine[c.field].value).toEqual(c.value);
        expect(updatedLine[c.field].status).toBe('confirmed');

        // Every other field of that line is unchanged.
        for (const f of FIELDS) {
          if (f !== c.field) expect(updatedLine[f]).toEqual(original[f]);
        }
        expect(updatedLine.lineId).toBe(original.lineId);
        expect(updatedLine.candidates).toEqual(original.candidates);
        expect(updatedLine.spokenName).toBe(original.spokenName);

        // Every other line is unchanged, and the input was not mutated.
        result.forEach((l, i) => {
          if (i !== target) expect(l).toEqual(snapshot[i]);
        });
        expect(lines).toEqual(snapshot);
      }),
    ));
});
