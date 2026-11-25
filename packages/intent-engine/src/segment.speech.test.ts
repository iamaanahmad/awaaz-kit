import { normalize } from '@awaaz-kit/language-normalizer';
import { describe, expect, it } from 'vitest';
import { extract } from './customer.js';

/**
 * Speech transcripts have no commas and often no "aur" between items. These regressions come
 * from a real spoken order on the preview build, where two items merged into one unmatched line.
 * **Validates: Requirements 8.1**
 */
const ctx = { locale: 'en-IN' } as const;
const lines = (s: string) =>
  extract(normalize(s), ctx).lines.map((l) => [
    l.productPhrase.value,
    l.quantityMilli.value,
    l.unit.value,
  ]);

describe('item segmentation for spoken orders', () => {
  it('splits items with no separator (Devanagari, as Shruti writes it)', () => {
    expect(lines('दो किलो आटा 1 litre तेल और पांच किलो चावल')).toEqual([
      ['आटा', 2000, 'kg'],
      ['तेल', 1000, 'litre'],
      ['चावल', 5000, 'kg'],
    ]);
  });

  it('splits items with no separator (romanized)', () => {
    expect(lines('2 kilo aata 1 ltr tel aur 5 kg chawal')).toEqual([
      ['aata', 2000, 'kg'],
      ['tel', 1000, 'litre'],
      ['chawal', 5000, 'kg'],
    ]);
  });

  it('treats "or" and "ओर" as the spoken "aur"', () => {
    expect(lines('2 kilo aata 1 ltr tel or 5 kg chawal')).toEqual([
      ['aata', 2000, 'kg'],
      ['tel', 1000, 'litre'],
      ['chawal', 5000, 'kg'],
    ]);
    expect(lines('एक लीटर तेल ओर पांच किलो चावल')).toEqual([
      ['तेल', 1000, 'litre'],
      ['चावल', 5000, 'kg'],
    ]);
  });

  it('splits product-first items', () => {
    expect(lines('aata do kilo tel ek litre')).toEqual([
      ['aata', 2000, 'kg'],
      ['tel', 1000, 'litre'],
    ]);
  });

  it('keeps a multi-word product together and does not split on "de do"', () => {
    expect(lines('2 kilo basmati chawal de do')).toEqual([['basmati chawal', 2000, 'kg']]);
  });
});
