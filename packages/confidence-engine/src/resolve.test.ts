import { describe, expect, it } from 'vitest';
import { buildIndex, type CatalogProduct } from '@awaaz-kit/catalog-matcher';
import type { CandidateLine, ExtractionResult } from '@awaaz-kit/intent-engine';
import type { CanonicalUnit } from '@awaaz-kit/language-normalizer';
import { resolveLines } from './resolve.js';

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

const catalog = [
  prod({ id: 'atta', name: 'Wheat Flour', aliases: ['aata', 'atta'], unit: 'kg' }),
  prod({ id: 'tel', name: 'Cooking Oil', aliases: ['tel'], unit: 'litre' }),
  prod({ id: 'amul-butter', name: 'Amul Butter', aliases: ['makhan'], unit: 'g' }),
  prod({ id: 'other-butter', name: 'Other Butter', aliases: ['makhan'], unit: 'g' }),
];
const index = buildIndex('s1', catalog);

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
  let n = 0;
  const [r] = resolveLines(extraction, index, () => `id-${++n}`);
  return r!;
};

describe('resolveLines status table', () => {
  it('exact match with explicit quantity and consistent unit is confirmed', () => {
    const r = resolveOne(line('aata', 2000, 'kg'));
    expect(r.product).toMatchObject({ status: 'confirmed', value: { productId: 'atta' } });
    expect(r.quantityMilli).toMatchObject({ status: 'confirmed', value: 2000 });
    expect(r.unit).toMatchObject({ status: 'confirmed', value: 'kg' });
    expect(r.lineId).toBe('id-1');
  });

  it('missing quantity is never defaulted to 1', () => {
    const r = resolveOne(line('aata', null, 'kg'));
    expect(r.quantityMilli).toMatchObject({ status: 'missing', value: null });
    expect(r.product.status).toBe('needs_review');
  });

  it('absent unit is needs_review with no value', () => {
    const r = resolveOne(line('aata', 2000, null));
    expect(r.unit).toMatchObject({ status: 'needs_review', value: null });
  });

  it('unit different from catalog unit is needs_review without conversion', () => {
    const r = resolveOne(line('aata', 2000, 'g'));
    expect(r.unit).toMatchObject({ status: 'needs_review', value: 'g' });
    expect(r.quantityMilli.value).toBe(2000);
  });

  it('ambiguous match gives needs_review with at most three candidates', () => {
    const r = resolveOne(line('makhan', 1000, 'g'));
    expect(r.product).toMatchObject({ status: 'needs_review', value: null });
    expect(r.candidates.length).toBeGreaterThan(1);
    expect(r.candidates.length).toBeLessThanOrEqual(3);
  });

  it('unmatched phrase gives unmatched product', () => {
    const r = resolveOne(line('laptop', 1000, 'piece'));
    expect(r.product).toMatchObject({ status: 'unmatched', value: null });
    expect(r.candidates).toEqual([]);
    expect(r.spokenName).toBe('laptop');
  });

  it('keeps spoken order and gives each line its own id', () => {
    const extraction: ExtractionResult = {
      lines: [line('aata', 1000, 'kg'), line('tel', 1000, 'litre')],
    };
    let n = 0;
    const out = resolveLines(extraction, index, () => `id-${++n}`);
    expect(out.map((l) => l.lineId)).toEqual(['id-1', 'id-2']);
    expect(out.map((l) => l.product.value?.productId)).toEqual(['atta', 'tel']);
  });
});
