import { normalize } from '@awaaz-kit/language-normalizer';
import { describe, expect, it } from 'vitest';
import { catalogArb } from '../../../tests/property/arbitraries/catalog.js';
import { utteranceArb } from '../../../tests/property/arbitraries/utterances.js';
import { assertProperty, fc } from '../../../tests/setup/fast-check.js';
import { extract } from './customer.js';

const ctx = { locale: 'en-IN' as const };
const canon = (s: string): string => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

describe('extraction order property', () => {
  // Feature: awaaz-kit, Property 6: Extraction preserves item count, order and values
  // **Validates: Requirements 8.1, 8.6**
  it('Property 6: one Candidate_Line per item, in spoken order, with generated quantity, unit and phrase', () =>
    assertProperty(
      fc.property(
        catalogArb.chain((catalog) =>
          fc.record({ catalog: fc.constant(catalog), utt: utteranceArb(catalog, undefined, { maxLines: 6 }) }),
        ),
        ({ catalog, utt }) => {
          const result = extract(normalize(utt.text), ctx);
          // Oracle: built from the generator inputs only.
          expect(result.lines).toHaveLength(utt.lines.length);
          utt.lines.forEach((expected, k) => {
            const line = result.lines[k]!;
            const alias = catalog.entries[expected.productIndex]!;
            const spoken = utt.lang === 'hi' ? alias.hi : utt.lang === 'hinglish' ? alias.hinglish : alias.name;
            expect(line.index).toBe(k);
            expect(line.quantityMilli.value).toBe(expected.qtyMilli);
            expect(line.unit.value).toBe(expected.unit);
            expect(canon(line.productPhrase.value ?? '')).toBe(canon(spoken));
          });
        },
      ),
    ));
});
