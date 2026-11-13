import { describe, expect, it } from 'vitest';
import { buildIndex, type CatalogProduct } from './index.js';

// Hand-copied subset of the Demo_Shop seed (packages/local-data/src/seed/demo-shop.json).
// catalog-matcher must not import local-data, so the products are inlined as plain data.
// Expectations below are hand-authored from the seed, not derived from the matcher.
const SHOP = '00000000-0000-4000-8000-000000000000';
const ID = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const prod = (
  n: number,
  name: string,
  unit: CatalogProduct['unit'],
  aliases: string[],
  brand?: string,
): CatalogProduct => ({
  id: ID(n),
  shopId: SHOP,
  name,
  unit,
  pricePaise: 1000 * n,
  aliases,
  ...(brand === undefined ? {} : { brand }),
  active: true,
  deletedAt: null,
});

const catalog: CatalogProduct[] = [
  prod(
    1,
    'Aashirvaad Atta',
    'kg',
    ['atta', 'aata', 'आटा', 'wheat flour', 'gehu ka atta'],
    'Aashirvaad',
  ),
  prod(2, 'Fortune Sunflower Oil', 'litre', ['tel', 'tail', 'तेल', 'cooking oil'], 'Fortune'),
  prod(
    3,
    'India Gate Basmati Rice',
    'kg',
    ['chawal', 'chaawal', 'चावल', 'rice', 'basmati'],
    'India Gate',
  ),
  prod(4, 'Amul Gold Milk', 'litre', ['Amul Gold', 'amul gold milk', 'doodh', 'milk'], 'Amul'),
  prod(5, 'Sugar', 'kg', ['chini', 'cheeni', 'चीनी', 'shakkar', 'sugar']),
  prod(
    6,
    'Tata Tea Gold',
    'kg',
    ['chai patti', 'chai pati', 'चाय पत्ती', 'tea', 'tata chai'],
    'Tata',
  ),
  prod(7, 'Toor Dal', 'kg', ['arhar dal', 'tuvar dal', 'toor dal', 'dal']),
  prod(14, 'Amul Butter', 'piece', ['makhan', 'butter', 'amul butter'], 'Amul'),
  prod(15, 'Amul Ghee', 'litre', ['ghee', 'desi ghee', 'amul ghee'], 'Amul'),
];

const index = buildIndex(SHOP, catalog);

describe('Demo_Shop matching examples', () => {
  // Validates: Requirements 9.1, 9.2
  it.each([
    ['aata', 1],
    ['atta', 1],
    ['ata', 1],
    ['AATA', 1],
    ['आटा', 1],
    ['tel', 2],
    ['chawal', 3],
    ['chaawal', 3],
    ['Amul Gold', 4],
    ['chini', 5],
    ['cheeni', 5],
    ['chai patti', 6],
    ['chai pati', 6],
  ])('"%s" resolves exactly to product %i', (phrase, n) => {
    const r = index.match(phrase);
    expect(r.kind).toBe('exact');
    if (r.kind === 'exact') expect(r.product.id).toBe(ID(n));
  });

  // Validates: Requirements 9.1
  it('reports product-name matches via name and alias matches via alias', () => {
    expect(index.match('Aashirvaad Atta')).toMatchObject({ kind: 'exact', via: 'name' });
    expect(index.match('aata')).toMatchObject({ kind: 'exact', via: 'alias' });
  });

  // Validates: Requirements 9.3
  it('suggests with unit and brand information when there is no exact match', () => {
    const r = index.match('basmti');
    expect(r.kind).toBe('suggestions');
    if (r.kind === 'suggestions') {
      expect(r.candidates.length).toBeLessThanOrEqual(3);
      expect(r.candidates[0]).toMatchObject({ id: ID(3), unit: 'kg', brand: 'India Gate' });
    }
  });

  // Validates: Requirements 9.4
  it('never picks one Amul product when only the brand is spoken', () => {
    const r = index.match('Amul');
    expect(r.kind === 'ambiguous' || r.kind === 'suggestions').toBe(true);
    if (r.kind === 'ambiguous' || r.kind === 'suggestions') {
      const ids = r.candidates.map((c) => c.id);
      expect(ids.length).toBeGreaterThanOrEqual(2);
      expect(ids.length).toBeLessThanOrEqual(3);
      for (const id of ids) expect([ID(4), ID(14), ID(15)]).toContain(id);
    }
    expect(r.kind).not.toBe('exact');
  });

  // Validates: Requirements 9.4
  it('returns every candidate when two products share an alias', () => {
    const shared = buildIndex(SHOP, [
      ...catalog,
      { ...catalog[0]!, id: 'dup', name: 'Local Atta', aliases: ['aata'] },
    ]);
    const r = shared.match('aata');
    expect(r.kind).toBe('ambiguous');
    if (r.kind === 'ambiguous') {
      expect(r.candidates.map((c) => c.id).sort()).toEqual([ID(1), 'dup'].sort());
    }
  });

  // Validates: Requirements 9.5
  it.each(['laptop', 'xyzzy qwerty', ''])('"%s" is unmatched', (phrase) => {
    expect(index.match(phrase)).toEqual({ kind: 'unmatched' });
  });
});
