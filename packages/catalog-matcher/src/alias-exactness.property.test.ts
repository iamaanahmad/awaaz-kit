import { describe, it, expect } from 'vitest';
import { assertProperty, fc } from '../../../tests/setup/fast-check';
import { catalogArb } from '../../../tests/property/arbitraries/catalog';
import { buildIndex } from './index';

// Independent oracle: ownership is counted on raw lower-cased, trimmed strings, never by
// calling the matcher's own folding.
const raw = (s: string): string => s.trim().toLowerCase();

describe('catalog-matcher alias exactness', () => {
  // Feature: awaaz-kit, Property 9: Catalog aliases match their product exactly
  // **Validates: Requirements 9.1, 9.2, 9.8**
  it('Property 9: Catalog aliases match their product exactly', () =>
    assertProperty(
      fc.property(
        catalogArb,
        fc.constantFrom('as-is', 'upper', 'padded'),
        (catalog, variant) => {
          const index = buildIndex(catalog.shopId, catalog.products);
          for (const product of catalog.products) {
            const spellings = [product.name, ...product.aliases];
            for (const spelling of spellings) {
              const owners = catalog.products.filter((p) =>
                [p.name, ...p.aliases].some((s) => raw(s) === raw(spelling)),
              );
              if (owners.length !== 1) continue; // only uniquely owned spellings
              const query =
                variant === 'upper'
                  ? spelling.toUpperCase()
                  : variant === 'padded'
                    ? `  ${spelling}  `
                    : spelling;
              const result = index.match(query);
              expect(result.kind).toBe('exact');
              if (result.kind === 'exact') {
                expect(result.product.id).toBe(product.id);
                expect(result).not.toHaveProperty('candidates');
                expect(result).not.toHaveProperty('suggestions');
              }
            }
          }
        },
      ),
    ));
});
