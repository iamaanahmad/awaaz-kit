import { describe, it, expect } from 'vitest';
import { assertProperty, fc } from '../../../tests/setup/fast-check';
import { catalogArb } from '../../../tests/property/arbitraries/catalog';
import { uuidArb } from '../../../tests/property/arbitraries/common';
import { buildIndex, type CatalogProduct, type MatchResult } from './index';

type Ineligible = 'inactive' | 'deleted' | 'foreign';

const idsIn = (result: MatchResult): string[] => {
  switch (result.kind) {
    case 'exact':
      return [result.product.id];
    case 'ambiguous':
    case 'suggestions':
      return result.candidates.map((c) => c.id);
    case 'unmatched':
      return [];
  }
};

describe('catalog-matcher catalog filtering', () => {
  // Feature: awaaz-kit, Property 10: Matcher ignores inactive, deleted and foreign-shop products
  // **Validates: Requirements 9.6, 9.7**
  it('Property 10: Matcher ignores inactive, deleted and foreign-shop products', () =>
    assertProperty(
      fc.property(
        catalogArb,
        uuidArb,
        fc.array(fc.constantFrom<Ineligible>('inactive', 'deleted', 'foreign'), {
          minLength: 12,
          maxLength: 12,
        }),
        fc.uniqueArray(uuidArb, { minLength: 12, maxLength: 12 }),
        fc.array(fc.boolean(), { minLength: 12, maxLength: 12 }),
        (catalog, otherShop, kinds, decoyIds, tweak) => {
          const realIds = new Set(catalog.products.map((p) => p.id));
          fc.pre(!realIds.has(otherShop) && decoyIds.every((id) => !realIds.has(id)));
          const foreignShop = otherShop === catalog.shopId ? `${otherShop}-x` : otherShop;

          // Decoys reuse the spellings of real products (exact collisions) or near-miss
          // spellings (fuzzy collisions), in every ineligible flavour.
          const decoys: CatalogProduct[] = catalog.products.map((p, i) => {
            const kind = kinds[i % kinds.length] as Ineligible;
            const near = tweak[i % tweak.length] === true;
            return {
              ...p,
              id: decoyIds[i % decoyIds.length] as string,
              name: near ? `${p.name}s` : p.name,
              aliases: near ? p.aliases.map((a) => `${a}a`) : [...p.aliases],
              shopId: kind === 'foreign' ? foreignShop : p.shopId,
              active: kind === 'inactive' ? false : true,
              deletedAt: kind === 'deleted' ? '2025-01-01T00:00:00.000Z' : null,
            };
          });
          fc.pre(new Set(decoys.map((d) => d.id)).size === decoys.length);
          const decoyIdSet = new Set(decoys.map((d) => d.id));

          const mixed = buildIndex(catalog.shopId, [...decoys, ...catalog.products]);
          const clean = buildIndex(catalog.shopId, catalog.products);

          const queries = new Set<string>();
          for (const p of [...catalog.products, ...decoys]) {
            for (const s of [p.name, ...p.aliases]) {
              queries.add(s);
              queries.add(s.slice(0, Math.max(2, s.length - 1)));
            }
          }
          queries.add('zzzz qqqq');

          for (const q of queries) {
            const result = mixed.match(q);
            for (const id of idsIn(result)) {
              expect(decoyIdSet.has(id)).toBe(false);
              expect(realIds.has(id)).toBe(true);
            }
            // Decoys must not change the outcome at all for the eligible catalog.
            expect(idsIn(result)).toEqual(idsIn(clean.match(q)));
            expect(result.kind).toBe(clean.match(q).kind);
          }
        },
      ),
    ));
});
