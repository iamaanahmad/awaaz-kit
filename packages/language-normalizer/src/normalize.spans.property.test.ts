import { describe, expect, it } from 'vitest';
import { assertProperty, fc } from '../../../tests/setup/fast-check.js';
import { normalize } from './normalize.js';

const pieceArb = fc.oneof(
  fc.constantFrom(
    'do', 'teen', 'paanch', 'dedh', 'dhai', 'aadha', 'sava', 'paun', 'sadhe', 'kilo', 'kg', 'gram',
    'litre', 'packet', 'dozen', 'aata', 'atta', 'cheeni', 'one and a half', 'twenty one', 'two',
    'half', 'आधा', 'किलो', 'चीनी', 'पाँच', 'सवा', 'Maggi', 'Noodles', 'chawal-dal', ',', '.', '₹',
  ),
  fc.integer({ min: 0, max: 99999 }).map(String),
  fc.tuple(fc.nat(99), fc.integer({ min: 0, max: 999 })).map(([a, b]) => `${a}.${b}`),
  fc.stringMatching(/^[०-९]{1,6}$/),
  fc.string({ unit: 'binary', maxLength: 6 }),
);
const sepArb = fc.constantFrom(' ', '  ', '\t', '\n', ' , ', '\u200b', '');
const utteranceArb = fc
  .array(fc.tuple(pieceArb, sepArb), { maxLength: 12 })
  .map((parts) => parts.map(([p, s]) => p + s).join(''));
const inputArb = fc.oneof(utteranceArb, fc.string({ unit: 'binary', maxLength: 40 }));

/** Independent oracle for a slice made only of digits: exact BigInt milli-units. */
const DEV = '०१२३४५६७८९';
function digitsOracleMilli(slice: string): bigint | null {
  const ascii = [...slice].map((c) => (DEV.includes(c) ? String(DEV.indexOf(c)) : c)).join('');
  if (!/^[0-9]+(\.[0-9]+)?$/.test(ascii)) return null;
  const [i = '', f = ''] = ascii.split('.');
  return BigInt(i) * 1000n + BigInt(f.padEnd(3, '0').slice(0, 3));
}

describe('normalizer spans', () => {
  // Feature: awaaz-kit, Property 2: Normalizer spans map back to the raw transcript
  // **Validates: Requirements 7.1**
  it('Property 2: spans are in range, ordered, and number/unit slices renormalize to their value', () =>
    assertProperty(
      fc.property(inputArb, (raw) => {
        const result = normalize(raw);
        let prevEnd = 0;
        for (const t of result.tokens) {
          const { start, end } = t.span;
          expect(start).toBeGreaterThanOrEqual(0);
          expect(start).toBeLessThanOrEqual(end);
          expect(end).toBeLessThanOrEqual(raw.length);
          expect(start).toBeGreaterThanOrEqual(prevEnd);
          prevEnd = end;

          if (t.kind !== 'number' && t.kind !== 'unit') continue;
          const slice = raw.slice(start, end);
          const again = normalize(slice).tokens;
          expect(again).toHaveLength(1);
          const a = again[0]!;
          expect(a.kind).toBe(t.kind);
          expect(a.text).toBe(t.text);
          expect(a.numberValueMilli).toBe(t.numberValueMilli);
          expect(a.canonicalUnit).toBe(t.canonicalUnit);

          const expected = digitsOracleMilli(slice);
          if (t.kind === 'number' && expected !== null) {
            expect(BigInt(t.numberValueMilli!)).toBe(expected);
          }
        }
      }),
    ));
});
