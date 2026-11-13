import { describe, expect, it } from 'vitest';
import { buildIndex, type CatalogProduct } from '@awaaz-kit/catalog-matcher';
import type { CandidateLine, ExtractionResult } from '@awaaz-kit/intent-engine';
import type { CanonicalUnit } from '@awaaz-kit/language-normalizer';
import { applyUserValue } from './clarify.js';
import { MAX_CANDIDATES, resolveLines } from './resolve.js';

// Example tests: one per row of the design.md "Status rules" table.
// **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5**

const prod = (over: Partial<CatalogProduct> & { id: string }): CatalogProduct => ({
  shopId: 's1',
  name: 'Item',
  aliases: [],
  unit: 'kg',
  pricePaise: 1000,
  active: true,
  deletedAt: null,
  ...over,
});

const index = buildIndex('s1', [
  prod({ id: 'atta', name: 'Wheat Flour', aliases: ['aata', 'atta'], unit: 'kg' }),
  prod({ id: 'tel', name: 'Cooking Oil', aliases: ['tel'], unit: 'litre' }),
  prod({ id: 'amul', name: 'Amul Butter', aliases: ['makhan'], unit: 'g' }),
  prod({ id: 'other', name: 'Other Butter', aliases: ['makhan'], unit: 'g' }),
  prod({ id: 'chawal', name: 'Basmati Rice', aliases: ['chawal basmati'], unit: 'kg' }),
]);

const line = (
  phrase: string,
  qtyMilli: number | null,
  unit: CanonicalUnit | null,
): CandidateLine => ({
  index: 0,
  productPhrase: { value: phrase, status: 'confirmed', sourceText: phrase },
  quantityMilli:
    qtyMilli === null
      ? { value: null, status: 'missing' }
      : { value: qtyMilli, status: 'confirmed' },
  unit: unit === null ? { value: null, status: 'missing' } : { value: unit, status: 'confirmed' },
});

const resolveOne = (l: CandidateLine) => {
  const extraction: ExtractionResult = { lines: [l] };
  const [r] = resolveLines(extraction, index, () => 'line-1');
  return r!;
};

describe('status table rows', () => {
  it('row 1: quantity absent -> missing, null, never defaulted to 1', () => {
    const r = resolveOne(line('aata', null, 'kg'));
    expect(r.quantityMilli.status).toBe('missing');
    expect(r.quantityMilli.value).toBeNull();
  });

  it('row 2: unit absent -> needs_review with null value', () => {
    const r = resolveOne(line('aata', 1000, null));
    expect(r.unit.status).toBe('needs_review');
    expect(r.unit.value).toBeNull();
  });

  it('row 3: unit differs from catalog unit -> needs_review, no conversion', () => {
    const r = resolveOne(line('aata', 2000, 'g'));
    expect(r.unit.status).toBe('needs_review');
    expect(r.unit.value).toBe('g');
    expect(r.quantityMilli.value).toBe(2000);
    expect(r.quantityMilli.status).toBe('confirmed');
  });

  it('row 4: exact match, quantity and unit consistent', () => {
    // CONFLICT in design.md: the table row says product / quantity / unit are
    // `needs_review` until the user reviews, but the "Review semantics" paragraph
    // says an exact match with explicit quantity and consistent unit is `confirmed`
    // (also task 8.1 and Req 10.1). Implemented behaviour follows the paragraph,
    // so we assert `confirmed`. The Review_Card remains the explicit save step.
    const r = resolveOne(line('aata', 2000, 'kg'));
    expect(r.product.status).toBe('confirmed');
    expect(r.product.value).toEqual({ productId: 'atta', name: 'Wheat Flour' });
    expect(r.quantityMilli.status).toBe('confirmed');
    expect(r.unit.status).toBe('confirmed');
    expect(r.candidates).toEqual([]);
  });

  it('row 4 (weaker variants): exact match with a missing quantity or unit is not confirmed', () => {
    expect(resolveOne(line('aata', null, 'kg')).product.status).toBe('needs_review');
    expect(resolveOne(line('aata', 1000, null)).product.status).toBe('needs_review');
    expect(resolveOne(line('aata', 1000, 'g')).product.status).toBe('needs_review');
  });

  it('row 5a: ambiguous match -> needs_review product, 2 to 3 candidates', () => {
    const r = resolveOne(line('makhan', 1000, 'g'));
    expect(r.product.status).toBe('needs_review');
    expect(r.product.value).toBeNull();
    expect(r.candidates.map((c) => c.id).sort()).toEqual(['amul', 'other']);
  });

  it('row 5b: fuzzy suggestions -> needs_review product, at most 3 candidates', () => {
    const r = resolveOne(line('chaval basmti', 1000, 'kg'));
    expect(r.product.status).toBe('needs_review');
    expect(r.product.value).toBeNull();
    expect(r.candidates.length).toBeGreaterThan(0);
    expect(r.candidates.length).toBeLessThanOrEqual(MAX_CANDIDATES);
  });

  it('row 6: unmatched -> unmatched product with "Not in catalog" reason', () => {
    const r = resolveOne(line('laptop', 1000, 'piece'));
    expect(r.product.status).toBe('unmatched');
    expect(r.product.value).toBeNull();
    expect(r.product.reason).toBe('Not in catalog');
    expect(r.candidates).toEqual([]);
  });

  it('row 7: user selects or types a value -> that field is confirmed', () => {
    const r = resolveOne(line('aata', null, null));
    const withQty = applyUserValue(r, 'quantityMilli', 3000);
    expect(withQty.quantityMilli).toMatchObject({ value: 3000, status: 'confirmed' });
    const withUnit = applyUserValue(withQty, 'unit', 'kg');
    expect(withUnit.unit).toMatchObject({ value: 'kg', status: 'confirmed' });

    const amb = resolveOne(line('makhan', 1000, 'g'));
    const picked = applyUserValue(amb, 'product', { productId: 'amul', name: 'Amul Butter' });
    expect(picked.product).toMatchObject({
      value: { productId: 'amul', name: 'Amul Butter' },
      status: 'confirmed',
    });
  });
});
