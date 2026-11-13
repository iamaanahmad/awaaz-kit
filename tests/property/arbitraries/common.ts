import { fc } from '../../setup/fast-check';

/**
 * Shared primitives for the property-test arbitraries.
 * Everything here stays inside the valid input space (no heavy filtering).
 * Money is integer paise, quantities are integer milli-units, ids are UUIDs, dates are ISO strings.
 */

export type CanonicalUnit = 'piece' | 'kg' | 'g' | 'litre' | 'ml';
export type FieldStatus = 'confirmed' | 'needs_review' | 'missing' | 'unmatched';
export type Lang = 'hi' | 'hinglish' | 'en';

export const CANONICAL_UNITS: readonly CanonicalUnit[] = ['piece', 'kg', 'g', 'litre', 'ml'];
export const LANGS: readonly Lang[] = ['hi', 'hinglish', 'en'];

/** Largest safe money value used by generators (keeps BigInt oracles and JS numbers both exact). */
export const MAX_PRICE_PAISE = 1_000_000; // Rs 10,000 per unit
export const MAX_QTY_MILLI = 100_000; // 100 units

export const uuidArb: fc.Arbitrary<string> = fc.uuid();

/** ISO timestamp between 2024-01-01 and 2030-01-01. */
export const isoDateArb: fc.Arbitrary<string> = fc
  .integer({ min: 1_704_067_200_000, max: 1_893_456_000_000 })
  .map((ms) => new Date(ms).toISOString());

export const unitArb: fc.Arbitrary<CanonicalUnit> = fc.constantFrom(...CANONICAL_UNITS);
export const langArb: fc.Arbitrary<Lang> = fc.constantFrom(...LANGS);

export const pricePaiseArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: MAX_PRICE_PAISE });
/** Positive quantity in milli-units. */
export const qtyMilliArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: MAX_QTY_MILLI });

/** A fixed deterministic `newId` source for tests that inject `newId` (counter based, UUID-shaped). */
export function sequentialIds(prefix = 0): () => string {
  let n = prefix;
  return () => {
    n += 1;
    return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
  };
}

export { fc };
