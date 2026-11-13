import { normalize } from '@awaaz-kit/language-normalizer';
import { describe, expect, it } from 'vitest';
import { catalogArb } from '../../../tests/property/arbitraries/catalog';
import { utteranceArb } from '../../../tests/property/arbitraries/utterances';
import { assertProperty, fc } from '../../../tests/setup/fast-check';
import { extract } from './customer.js';
import type { ExtractedField } from './types.js';

// Independent oracle: the transcript is assembled from known pieces, so the expected name,
// phone digits and written phone text are known by construction and never derived by
// calling the extractor.

const ASCII_NAMES = [
  'Ramesh',
  'Sunita',
  'Anita',
  'Mohan',
  'Geeta',
  'Vikram',
  'Pooja',
  'Rajesh',
  'Meena',
  'Suresh',
  'Farida',
  'Imran',
] as const;
const ASCII_SURNAMES = ['Kumar', 'Sharma', 'Verma', 'Khan'] as const;
const DEVANAGARI_NAMES = ['रमेश', 'सुनीता', 'मोहन', 'गीता'] as const;

const nameArb: fc.Arbitrary<{ text: string; devanagari: boolean }> = fc.oneof(
  fc.constantFrom(...ASCII_NAMES).map((n) => ({ text: n, devanagari: false })),
  fc
    .tuple(fc.constantFrom(...ASCII_NAMES), fc.constantFrom(...ASCII_SURNAMES))
    .map(([a, b]) => ({ text: `${a} ${b}`, devanagari: false })),
  fc.constantFrom(...DEVANAGARI_NAMES).map((n) => ({ text: n, devanagari: true })),
);

/** 10-digit Indian mobile: first digit 6-9, then nine digits. */
const phoneDigitsArb: fc.Arbitrary<string> = fc
  .tuple(fc.integer({ min: 6, max: 9 }), fc.integer({ min: 0, max: 999_999_999 }))
  .map(([d, rest]) => `${d}${String(rest).padStart(9, '0')}`);

const phoneStyleArb = fc.constantFrom('plain', 'split', 'plus91', 'plus91split');

function writePhone(digits: string, style: string): string {
  const a = digits.slice(0, 5);
  const b = digits.slice(5);
  switch (style) {
    case 'split':
      return `${a} ${b}`;
    case 'plus91':
      return `+91 ${digits}`;
    case 'plus91split':
      return `+91 ${a} ${b}`;
    default:
      return digits;
  }
}

const scenarioArb = catalogArb.chain((catalog) =>
  fc.record({
    utterance: utteranceArb(catalog, undefined, { maxLines: 3 }),
    name: fc.option(nameArb, { nil: undefined }),
    phone: fc.option(fc.tuple(phoneDigitsArb, phoneStyleArb), { nil: undefined }),
    nameFirst: fc.boolean(),
    label: fc.constantFrom('', 'phone ', 'number '),
  }),
);

describe('extract source text and customer fields', () => {
  // Feature: awaaz-kit, Property 7: Extracted fields carry source text and optional customer fields
  // **Validates: Requirements 8.2, 8.7**
  it('Property 7: Extracted fields carry source text and optional customer fields', () =>
    assertProperty(
      fc.property(scenarioArb, ({ utterance, name, phone, nameFirst, label }) => {
        const phoneText = phone ? writePhone(phone[0], phone[1]) : undefined;
        const phoneBit = phoneText ? `${label}${phoneText}` : '';
        const items = utterance.text;
        const parts = nameFirst
          ? [name ? `${name.text} ${name.devanagari ? 'का बिल बनाओ' : 'ka bill banao'}` : '', phoneBit, items]
          : [items, name ? `, for ${name.text}` : '', phoneBit];
        const raw = parts.filter((p) => p !== '').join(' ');

        const result = extract(normalize(raw), { locale: 'en-IN' });
        const tokens = normalize(raw).tokens;

        // Every non-null field carries sourceText that is a slice of the raw transcript.
        const fields: ExtractedField<unknown>[] = [
          ...result.lines.flatMap((l) => [l.productPhrase, l.quantityMilli, l.unit]),
          ...(result.customerName ? [result.customerName] : []),
          ...(result.customerPhone ? [result.customerPhone] : []),
        ];
        for (const f of fields) {
          if (f.value === null) continue;
          expect(f.sourceText).toBeTypeOf('string');
          expect(f.sourceText).not.toBe('');
          expect(raw.includes(f.sourceText as string)).toBe(true);
        }
        // Non-phone fields are identified by token spans: the slice runs from one token's
        // start to a later (or the same) token's end.
        for (const f of fields.filter((x) => x !== result.customerPhone && x.value !== null)) {
          const ok = tokens.some((a) =>
            tokens.some(
              (b) =>
                b.span.end >= a.span.end && raw.slice(a.span.start, b.span.end) === f.sourceText,
            ),
          );
          expect(ok).toBe(true);
        }

        // Customer phone: extracted exactly when one was written.
        if (phone && phoneText) {
          expect(result.customerPhone?.value).toBe(phone[0]);
          expect(result.customerPhone?.sourceText).toBe(phoneText);
          expect(raw.includes(phoneText)).toBe(true);
        } else {
          expect(result.customerPhone).toBeUndefined();
        }

        // Customer name: extracted exactly when placed in a supported phrase.
        if (name) {
          expect(result.customerName?.value).toBe(name.text);
          expect(result.customerName?.sourceText).toBe(name.text);
        } else {
          expect(result.customerName).toBeUndefined();
        }
      }),
    ));

  it('example: Ramesh ka bill banao phone 9876543210', () => {
    const raw = 'Ramesh ka bill banao phone 9876543210 do kilo aata';
    const r = extract(normalize(raw), { locale: 'en-IN' });
    expect(r.customerName?.sourceText).toBe('Ramesh');
    expect(r.customerPhone?.sourceText).toBe('9876543210');
    expect(r.lines).toHaveLength(1);
  });
});
