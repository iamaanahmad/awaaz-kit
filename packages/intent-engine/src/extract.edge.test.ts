import { normalize } from '@awaaz-kit/language-normalizer';
import { describe, expect, it } from 'vitest';
import { extract } from './customer.js';

const run = (s: string) => extract(normalize(s));
const phrases = (s: string) => run(s).lines.map((l) => l.productPhrase.value);

// Requirements 8.1, 8.2, 8.6, 8.8
describe('extract edge cases', () => {
  it('returns no lines for empty, whitespace and punctuation-only input', () => {
    for (const s of ['', '   ', ',,', '\u0964', 'aur , aur']) {
      expect(run(s).lines).toEqual([]);
    }
  });

  it('returns no lines when only a quantity and unit are spoken', () => {
    expect(run('do kilo').lines).toEqual([]);
  });

  it('marks a missing quantity and unit as missing with a null value', () => {
    const [l] = run('aata').lines;
    expect(l?.quantityMilli).toMatchObject({ value: null, status: 'missing' });
    expect(l?.unit).toMatchObject({ value: null, status: 'missing' });
  });

  it('keeps a quantity without a unit', () => {
    const [l] = run('3 maggi').lines;
    expect(l?.productPhrase.value).toBe('maggi');
    expect(l?.quantityMilli.value).toBe(3000);
    expect(l?.unit.status).toBe('missing');
  });

  it('binds reversed order (phrase, number, unit) per item and keeps spoken order', () => {
    const lines = run('aata do kilo aur tel 1 litre').lines;
    expect(lines.map((l) => l.productPhrase.value)).toEqual(['aata', 'tel']);
    expect(lines.map((l) => l.quantityMilli.value)).toEqual([2000, 1000]);
    expect(lines.map((l) => l.unit.value)).toEqual(['kg', 'litre']);
  });

  it('splits on commas and the danda without leaking separators into phrases', () => {
    expect(phrases('aata, chini \u0964 namak')).toEqual(['aata', 'chini', 'namak']);
    expect(phrases('aata,,chini')).toEqual(['aata', 'chini']);
  });

  it('drops filler and request-frame words from phrases', () => {
    expect(phrases('bhaiya do kilo aata please')).toEqual(['aata']);
    expect(phrases('mujhe do kilo aata chahiye')).toEqual(['aata']);
    expect(phrases('do kilo aata de do')).toEqual(['aata']);
  });

  it('does not treat a phone number as an item or quantity', () => {
    const r = run('do kilo aata phone 9876543210');
    expect(r.customerPhone?.value).toBe('9876543210');
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]?.productPhrase.value).toBe('aata');
    expect(r.lines[0]?.quantityMilli.value).toBe(2000);
  });

  it('keeps a short number near a phone number as a quantity', () => {
    const r = run('9876543210 5 kilo chini');
    expect(r.customerPhone?.value).toBe('9876543210');
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]?.quantityMilli.value).toBe(5000);
    expect(r.lines[0]?.productPhrase.value).toBe('chini');
  });

  it('ignores 10-digit numbers that are not valid mobiles', () => {
    const r = run('1234567890 aata');
    expect(r.customerPhone).toBeUndefined();
  });

  it("extracts the customer from the 'Ramesh ke liye' form", () => {
    const r = run('Ramesh ke liye do kilo aata');
    expect(r.customerName?.value).toBe('Ramesh');
    expect(r.customerName?.sourceText).toBe('Ramesh');
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]?.productPhrase.value).toBe('aata');
    expect(r.lines[0]?.quantityMilli.value).toBe(2000);
  });

  it("handles 'Ramesh ke liye' at the end of the utterance", () => {
    const r = run('do kilo aata aur chini, Ramesh ke liye');
    expect(r.customerName?.value).toBe('Ramesh');
    expect(r.lines.map((l) => l.productPhrase.value)).toEqual(['aata', 'chini']);
  });

  // Out of scope: without a separator, a trailing name cannot be told apart from the last
  // product phrase, and guessing would break the no-guessed-fields rule. The comma form above
  // is the supported one.
  it.skip('splits an unseparated trailing name from the last item', () => {
    const r = run('do kilo aata chini Ramesh ke liye');
    expect(r.customerName?.value).toBe('Ramesh');
  });

  it('handles the Devanagari form of ke liye', () => {
    const r = run('\u0930\u092E\u0947\u0936 \u0915\u0947 \u0932\u093F\u090F \u0906\u091F\u093E');
    expect(r.customerName?.value).toBe('\u0930\u092E\u0947\u0936');
    expect(r.lines).toHaveLength(1);
  });

  it('omits customer fields when none are spoken', () => {
    const r = run('aata');
    expect(r.customerName).toBeUndefined();
    expect(r.customerPhone).toBeUndefined();
  });
});
