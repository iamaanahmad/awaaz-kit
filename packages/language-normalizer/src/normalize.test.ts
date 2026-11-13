import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { foldForMatching, normalize } from './normalize.js';

describe('normalize', () => {
  it("treats 'do kilo aata' and '2 kg atta' the same shape", () => {
    const a = normalize('do kilo aata');
    const b = normalize('2 kg atta');
    expect(a.tokens.slice(0, 2).map((t) => t.text)).toEqual(['2', 'kg']);
    expect(b.tokens.slice(0, 2).map((t) => t.text)).toEqual(['2', 'kg']);
    expect(foldForMatching('aata')).toBe(foldForMatching('atta'));
  });

  it('converts fractions to milli-units', () => {
    const v = (s: string) => normalize(s).tokens[0]?.numberValueMilli;
    expect(v('dedh')).toBe(1500);
    expect(v('sava kilo')).toBe(1250);
    expect(v('paun kilo')).toBe(750);
    expect(v('sava do')).toBe(2250);
    expect(v('one and a half')).toBe(1500);
    expect(v('twenty one')).toBe(21000);
    expect(v('आधा')).toBe(500);
  });

  it('maps Devanagari digits and units, with spans into raw', () => {
    const n = normalize('  ५ किलो  चीनी, ');
    expect(n.text).toBe('5 kg चीनी ,');
    expect(n.tokens[1]).toMatchObject({ kind: 'unit', canonicalUnit: 'kg' });
    const t = n.tokens[0]!;
    expect(n.raw.slice(t.span.start, t.span.end)).toBe('५');
  });

  it('preserves unknown tokens and never mutates raw', () => {
    const raw = 'Maggi Noodles 12345678901';
    const n = normalize(raw);
    expect(n.raw).toBe(raw);
    expect(n.text).toBe(raw);
  });

  it('is idempotent for arbitrary text', () => {
    const words = [
      'do',
      'kilo',
      'sava',
      'paun',
      'half',
      'a',
      'one',
      'and',
      'twenty',
      'kg',
      'aata',
      '५',
      '1.5',
      ',',
      '।',
      'x-y',
      'ml',
    ];
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string({ unit: 'grapheme' }),
          fc.array(fc.constantFrom(...words), { maxLength: 12 }).map((w) => w.join(' ')),
        ),
        (s) => {
          const once = normalize(s).text;
          expect(normalize(once).text).toBe(once);
          expect(normalize(s).raw).toBe(s);
        },
      ),
    );
  });
});

describe('foldForMatching', () => {
  it('lowercases, strips diacritics and applies phonetic folds', () => {
    expect(foldForMatching('Āta')).toBe('ata');
    expect(foldForMatching('Chawal')).toBe(foldForMatching('chaval'));
  });

  it('is idempotent', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme' }), (s) => {
        const once = foldForMatching(s);
        expect(foldForMatching(once)).toBe(once);
      }),
    );
  });
});
