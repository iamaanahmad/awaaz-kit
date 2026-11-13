import { describe, expect, it } from 'vitest';
import { assertProperty, fc } from '../../../tests/setup/fast-check';

import { formatConfidence, transcriptionResultSchema, type TranscriptionResult } from './types';

// Provider results: text always present; confidence is either absent (every
// shipped adapter) or a calibrated value inside the schema range [0, 1].
const calibratedArb = fc.double({ min: 0, max: 1, noNaN: true });

const resultArb: fc.Arbitrary<TranscriptionResult> = fc.record(
  {
    text: fc.string({ maxLength: 40 }),
    language: fc.constantFrom('hi', 'en', 'hi-IN'),
    durationMs: fc.nat({ max: 600_000 }),
    confidence: calibratedArb,
  },
  { requiredKeys: ['text'] },
);

describe('formatConfidence', () => {
  // Feature: awaaz-kit, Property 16: Numeric confidence is displayed only when provided
  // **Validates: Requirements 5.11, 10.9**
  it('Property 16: shows a number if and only if a calibrated confidence is present', () => {
    assertProperty(
      fc.property(resultArb, (result) => {
        expect(transcriptionResultSchema.safeParse(result).success).toBe(true);
        const shown = formatConfidence(result);
        // Oracle: independent of the implementation. Presence of the key on a
        // schema-valid result is the calibrated signal (design: adapters
        // never populate it otherwise).
        const hasCalibrated = result.confidence !== undefined;
        if (hasCalibrated) {
          expect(shown).not.toBeNull();
          expect(shown).toMatch(/\d/);
          expect(Number(shown)).toBeCloseTo(result.confidence as number, 1);
        } else {
          expect(shown).toBeNull();
        }
      }),
    );
  });

  it('shows nothing for null, NaN and infinite confidence', () => {
    for (const confidence of [null, undefined, Number.NaN, Infinity, -Infinity]) {
      expect(formatConfidence({ confidence })).toBeNull();
    }
  });
});
