import { describe, expect, it } from 'vitest';
import { assertProperty, fc } from '../../../tests/setup/fast-check.js';
import { normalize } from './normalize.js';

/**
 * Independent fragment pool written by hand (not read from tables.ts) so the
 * generator covers recognized words, unrecognized words, digits in both
 * scripts, fractions, units, punctuation and odd whitespace.
 */
const FRAGMENTS = [
  'ek', 'do', 'teen', 'paanch', 'das', 'bees', 'tees', 'sau', 'one', 'two', 'twenty', 'twenty-one',
  'twenty one', 'ninety nine', 'hundred', 'एक', 'दो', 'पाँच', 'सौ', 'aadha', 'dedh', 'dhai', 'sava',
  'sadhe', 'paun', 'half', 'quarter', 'half a', 'one and a half', 'आधा', 'सवा', 'साढ़े', 'kilo',
  'kg', 'KG', 'gram', 'gm', 'litre', 'ltr', 'ml', 'piece', 'pcs', 'किलो', 'लीटर', 'ग्राम', 'नग',
  'aata', 'atta', 'chawal', 'tel', 'doodh', 'cheeni', 'maggi', 'चावल', 'आटा', 'Rahul', 'x-ray',
  '1', '5', '12', '007', '2.5', '0.250', '3.', '.5', '1.23456', '123456789012', '१', '२५', '३.५',
  ',', '.', '..', '!', '?', '-', '/', '(', ')', '₹', 'और', 'aur', 'and',
] as const;

const SEPARATORS = [' ', '  ', '\t', '\n', '', '\u200b', '\ufeff', ' \u00a0 '] as const;

const utteranceArb = fc
  .array(
    fc.tuple(fc.constantFrom(...FRAGMENTS), fc.constantFrom(...SEPARATORS)),
    { maxLength: 12 },
  )
  .map((parts) => parts.map(([f, s]) => f + s).join(''));

// Arbitrary text, including lone surrogates, combining marks and zero-width joiners.
const noiseArb = fc.oneof(fc.string({ unit: 'binary' }), fc.string({ unit: 'grapheme' }));

const inputArb = fc.oneof(
  { arbitrary: utteranceArb, weight: 4 },
  { arbitrary: noiseArb, weight: 2 },
  {
    arbitrary: fc
      .tuple(utteranceArb, noiseArb, utteranceArb)
      .map(([a, b, c]) => a + b + c),
    weight: 2,
  },
);

describe('normalize properties', () => {
  // Feature: awaaz-kit, Property 1: Normalization is idempotent and preserves the raw transcript
  it('Property 1: idempotent and preserves raw. **Validates: Requirements 7.8, 7.9**', () =>
    assertProperty(
      fc.property(inputArb, (input) => {
        const first = normalize(input);
        const second = normalize(first.text);
        // Idempotence: normalizing the normalized text yields the same text.
        expect(second.text).toBe(first.text);
        // Raw preservation: raw equals the input unchanged, at both stages.
        expect(first.raw).toBe(input);
        expect(second.raw).toBe(first.text);
      }),
    ));
});

describe('normalize table-driven oracle (independent expected values)', () => {
  const CASES: readonly (readonly [string, string])[] = [
    ['ek kilo', '1 kg'],
    ['दो लीटर', '2 litre'],
    ['twenty-one pcs', '21 piece'],
    ['dedh kilo', '1.5 kg'],
    ['sava kilo', '1.25 kg'],
    ['paun kilo', '0.75 kg'],
    ['sadhe teen kilo', '3.5 kg'],
    ['३.५ KG', '3.5 kg'],
    ['aata, 2 kg!!', 'aata , 2 kg !'],
  ];
  it.each(CASES)('normalizes %j to %j', (input, expected) => {
    expect(normalize(input).text).toBe(expected);
    expect(normalize(expected).text).toBe(expected);
  });
});
