import { describe, expect, it } from 'vitest';
import { normalize } from './normalize.js';

// Unit tests for number and unit parsing. Expected values are hand-authored.
// **Validates: Requirements 7.2, 7.3, 7.4**

const firstMilli = (s: string) => normalize(s).tokens[0]?.numberValueMilli;

describe('Hindi fraction words', () => {
  it.each([
    ['dedh kilo', 1500],
    ['derh', 1500],
    ['डेढ़ किलो', 1500],
    ['dhai kilo', 2500],
    ['ढाई', 2500],
    ['aadha kilo', 500],
    ['adha', 500],
    ['आधा किलो', 500],
    ['sava kilo', 1250],
    ['सवा किलो', 1250],
    ['paun kilo', 750],
    ['पौन किलो', 750],
    ['pav', 250],
  ])('%s -> %d milli', (input, milli) => {
    expect(firstMilli(input)).toBe(milli);
  });

  it('combines sava, paun and sadhe with a following whole number', () => {
    expect(firstMilli('sava do')).toBe(2250);
    expect(firstMilli('sava 5')).toBe(5250);
    expect(firstMilli('paun do')).toBe(1750);
    expect(firstMilli('sadhe teen')).toBe(3500);
    expect(firstMilli('sava sau')).toBe(100250);
    expect(normalize('sadhe teen kilo').text).toBe('3.5 kg');
  });

  it('renders the whole phrase as one token spanning the raw words', () => {
    const raw = 'sadhe teen kilo';
    const n = normalize(raw);
    expect(n.tokens).toHaveLength(2);
    expect(raw.slice(n.tokens[0]!.span.start, n.tokens[0]!.span.end)).toBe('sadhe teen');
  });
});

describe('number words', () => {
  it.each([
    ['ek', 1000],
    ['do', 2000],
    ['teen', 3000],
    ['paanch', 5000],
    ['das', 10000],
    ['bees', 20000],
    ['pachas', 50000],
    ['sau', 100000],
    ['seven', 7000],
    ['twenty one', 21000],
    ['twenty-one', 21000],
    ['पाँच', 5000],
    ['one and a half', 1500],
    ['two and a half', 2500],
  ])('%s -> %d milli', (input, milli) => {
    expect(firstMilli(input)).toBe(milli);
  });
});

describe('digits and decimals', () => {
  it('maps Devanagari digits to ASCII', () => {
    expect(normalize('५').text).toBe('5');
    expect(normalize('१२').text).toBe('12');
    expect(normalize('१०५ ग्राम').text).toBe('105 g');
    expect(firstMilli('१२')).toBe(12000);
  });

  it('parses decimals into milli-units', () => {
    expect(firstMilli('1.5')).toBe(1500);
    expect(firstMilli('0.25')).toBe(250);
    expect(firstMilli('2.050')).toBe(2050);
    expect(firstMilli('१.५')).toBe(1500);
    expect(normalize('2.50 kg').text).toBe('2.5 kg');
    expect(normalize('१.५ किलो').text).toBe('1.5 kg');
  });

  it('keeps over-precise decimals as plain text', () => {
    const t = normalize('1.2345').tokens[0]!;
    expect(t.kind).toBe('word');
    expect(t.text).toBe('1.2345');
  });
});

describe('unit spellings', () => {
  it.each([
    ['kg', 'kg'],
    ['Kilo', 'kg'],
    ['kilograms', 'kg'],
    ['किलो', 'kg'],
    ['gm', 'g'],
    ['gram', 'g'],
    ['ग्राम', 'g'],
    ['ltr', 'litre'],
    ['liters', 'litre'],
    ['लीटर', 'litre'],
    ['ml', 'ml'],
    ['मिलीलीटर', 'ml'],
    ['pcs', 'piece'],
    ['nag', 'piece'],
    ['पीस', 'piece'],
  ])('%s -> %s', (input, unit) => {
    const t = normalize(input).tokens[0]!;
    expect(t.kind).toBe('unit');
    expect(t.canonicalUnit).toBe(unit);
    expect(t.text).toBe(unit);
  });
});

describe('whole utterances', () => {
  it("'do kilo aata' has the same quantity and unit as '2 kg atta'", () => {
    const a = normalize('do kilo aata');
    const b = normalize('2 kg atta');
    expect(a.tokens.slice(0, 2).map((t) => t.text)).toEqual(['2', 'kg']);
    expect(b.tokens.slice(0, 2).map((t) => t.text)).toEqual(['2', 'kg']);
    expect(a.tokens[0]?.numberValueMilli).toBe(2000);
    expect(a.tokens[1]?.canonicalUnit).toBe('kg');
    expect(a.tokens[2]?.text).toBe('aata');
    expect(b.tokens[2]?.text).toBe('atta');
  });

  it('normalizes a mixed Hinglish line', () => {
    expect(normalize('dedh kilo chini aur ५ पीस maggi').text).toBe(
      '1.5 kg chini aur 5 piece maggi',
    );
  });
});

describe('phone-length numbers are preserved', () => {
  it('keeps a 10-digit phone number as an untouched word', () => {
    const n = normalize('9876543210 ke liye');
    expect(n.tokens[0]).toMatchObject({ kind: 'word', text: '9876543210' });
    expect(n.tokens[0]?.numberValueMilli).toBeUndefined();
    expect(n.text).toBe('9876543210 ke liye');
  });

  it('converts a Devanagari phone number to ASCII digits but keeps every digit', () => {
    const n = normalize('९८७६५४३२१०');
    expect(n.tokens).toHaveLength(1);
    expect(n.tokens[0]).toMatchObject({ kind: 'word', text: '9876543210' });
    expect(n.raw).toBe('९८७६५४३२१०');
  });

  it('keeps a +91 phone number digits intact', () => {
    expect(normalize('+919876543210').text).toBe('+ 919876543210');
  });

  it('still treats a 9-digit value as a number', () => {
    const t = normalize('123456789').tokens[0]!;
    expect(t.kind).toBe('number');
    expect(t.text).toBe('123456789');
  });
});
