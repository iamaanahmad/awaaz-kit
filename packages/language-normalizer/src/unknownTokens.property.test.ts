import { describe, expect, it } from 'vitest';
import { assertProperty, fc } from '../../../tests/setup/fast-check.js';
import { normalize } from './normalize.js';
import {
  FRACTION_MODIFIERS,
  FRACTION_WORDS,
  NUMBER_WORDS,
  UNIT_WORDS,
} from './tables.js';

/** Oracle: a word is "known" if any lookup table has it, or it starts a fraction phrase. */
const PHRASE_WORDS = new Set([
  'one',
  'and',
  'a',
  'half',
  'two',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
]);
function isKnown(word: string): boolean {
  const k = word.normalize('NFC').toLowerCase();
  return (
    NUMBER_WORDS.has(k) ||
    UNIT_WORDS.has(k) ||
    FRACTION_WORDS.has(k) ||
    FRACTION_MODIFIERS.has(k) ||
    PHRASE_WORDS.has(k)
  );
}

// Latin words in mixed case plus Devanagari words that are not in any table.
const latinWordArb = fc
  .stringMatching(/^[a-zA-Z]{2,9}$/)
  .filter((w) => !isKnown(w));
const devanagariWordArb = fc.constantFrom('चावल', 'आटा', 'दाल', 'नमक', 'शक्कर', 'तेल', 'साबुन', 'मैगी');
const unknownArb = fc.oneof(
  { arbitrary: latinWordArb, weight: 4 },
  { arbitrary: devanagariWordArb, weight: 1 },
);

// Known context pieces that surround the unknown token.
const contextArb = fc.constantFrom('2', 'do', 'kilo', 'kg', 'dedh', '१२', ',', 'sava', 'ek', 'aur');

describe('Property 4: Unknown tokens are preserved', () => {
  // Feature: awaaz-kit, Property 4: Unknown tokens are preserved
  // **Validates: Requirements 7.5, 7.6, 7.7**
  it('Property 4: unknown tokens pass through unchanged, with a span back to the raw text', () => {
    assertProperty(
      fc.property(
        fc.array(contextArb, { maxLength: 3 }),
        unknownArb,
        fc.array(contextArb, { maxLength: 3 }),
        (before, token, after) => {
          fc.pre(!isKnown(token));
          const raw = [...before, token, ...after].join(' ');
          const start = [...before].join(' ').length + (before.length > 0 ? 1 : 0);
          const result = normalize(raw);

          // The token appears unchanged as a whitespace-delimited word in the output text.
          expect(result.text.split(' ')).toContain(token);

          // It is a word token (not number or unit) with the same text, and its span covers it.
          const match = result.tokens.find(
            (t) => t.span.start === start && t.span.end === start + token.length,
          );
          expect(match).toBeDefined();
          expect(match?.kind).toBe('word');
          expect(match?.text).toBe(token);
          expect(raw.slice(match!.span.start, match!.span.end)).toBe(token);

          // Raw is never mutated.
          expect(result.raw).toBe(raw);
        },
      ),
    );
  });
});
