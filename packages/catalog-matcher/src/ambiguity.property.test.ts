import { describe, it, expect } from 'vitest';
import { assertProperty, fc } from '../../../tests/setup/fast-check';
import { catalogArb } from '../../../tests/property/arbitraries/catalog';
import { buildIndex } from './index';

// Independent oracle: sharing is decided on raw lower-cased, trimmed strings, never by calling
// the matcher's own folding. The shared spellings below never occur in the generated pool.
const SHARED = ['amul', 'taaza', 'mother dairy', 'डबल'] as const;

describe('catalog-matcher ambiguity', () => {
  // Feature: awaaz-kit, Property 11: Ambiguity is never silently resolved
  // **Validates: Requirements 9.3, 9.4**
  it('Property 11: Ambiguity is never silently resolved', () =>
    assertProperty(
      fc.property(
        catalogArb,
        fc.constantFrom(...SHARED),
        fc.integer({ min: 2, max: 5 }),
        fc.constantFrom('as-is', 'upper', 'padded'),
        fc.array(fc.string({ maxLength: 12 }), { maxLength: 8 }),
        (catalog, shared, wanted, variant, noise) => {
          const k = Math.min(wanted, catalog.products.length);
          const sharers = catalog.products.slice(0, k);
          const sharerIds = new Set(sharers.map((p) => p.id));
          const products = catalog.products.map((p) =>
            sharerIds.has(p.id) ? { ...p, aliases: [...p.aliases, shared] } : p,
          );
          const index = buildIndex(catalog.shopId, products);

          const query =
            variant === 'upper'
              ? shared.toUpperCase()
              : variant === 'padded'
                ? `  ${shared}  `
                : shared;
          const result = index.match(query);

          // Never auto-picked.
          expect(result.kind).toBe('ambiguous');
          if (result.kind === 'ambiguous') {
            const ids = result.candidates.map((c) => c.id);
            expect(new Set(ids).size).toBe(ids.length);
            expect(ids.length).toBe(Math.min(k, 3));
            for (const id of ids) expect(sharerIds.has(id)).toBe(true);
          }

          // Any suggestions result, for arbitrary and near-miss phrases, lists at most three.
          const phrases = [
            ...noise,
            ...products.flatMap((p) => p.aliases.map((a) => a.slice(0, Math.max(2, a.length - 1)))),
          ];
          for (const phrase of phrases) {
            const r = index.match(phrase);
            if (r.kind === 'suggestions' || r.kind === 'ambiguous') {
              expect(r.candidates.length).toBeGreaterThanOrEqual(1);
              expect(r.candidates.length).toBeLessThanOrEqual(3);
            }
          }
        },
      ),
    ));
});
