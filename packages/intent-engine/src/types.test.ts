import { describe, expect, it } from 'vitest';
import { extractionContextSchema, extractionResultSchema } from './types.js';

describe('extraction schemas', () => {
  it('accepts a result with a missing quantity and sourceText', () => {
    const result = {
      lines: [
        {
          index: 0,
          productPhrase: { value: 'aata', status: 'confirmed', sourceText: 'aata' },
          quantityMilli: { value: null, status: 'missing' },
          unit: { value: 'kg', status: 'confirmed', sourceText: 'kilo' },
        },
      ],
      customerPhone: { value: '9876543210', status: 'confirmed', sourceText: '9876543210' },
    };
    expect(extractionResultSchema.parse(result)).toEqual(result);
  });

  it('rejects an unknown unit and an unknown locale', () => {
    expect(
      extractionResultSchema.safeParse({
        lines: [
          {
            index: 0,
            productPhrase: { value: 'x', status: 'confirmed' },
            quantityMilli: { value: 1000, status: 'confirmed' },
            unit: { value: 'bag', status: 'confirmed' },
          },
        ],
      }).success,
    ).toBe(false);
    expect(extractionContextSchema.safeParse({ locale: 'fr-FR' }).success).toBe(false);
  });
});
