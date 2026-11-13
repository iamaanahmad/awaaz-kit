export {
  CANONICAL_UNITS,
  DEVANAGARI_DIGITS,
  FRACTION_MODIFIERS,
  FRACTION_PHRASES,
  FRACTION_WORDS,
  NUMBER_WORDS,
  PHONETIC_FOLD_RULES,
  UNIT_WORDS,
} from './tables.js';
export type { CanonicalUnit, FractionModifier } from './tables.js';
export { foldForMatching, normalize } from './normalize.js';
export type { Normalized, NormalizedToken, SourceSpan } from './normalize.js';
