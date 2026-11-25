import type { Normalized, NormalizedToken } from '@awaaz-kit/language-normalizer';
import type { CandidateLine, ExtractedField } from './types.js';
import type { CanonicalUnit } from '@awaaz-kit/language-normalizer';

/**
 * Item separators. "or" and "ओर" are how speech-to-text and casual typing often render the
 * spoken "aur" (and); in a shopping list they always join items, never offer a choice.
 */
const SEPARATOR_WORDS: ReadonlySet<string> = new Set([
  'aur',
  'and',
  'or',
  'plus',
  '\u0914\u0930',
  '\u0913\u0930',
]);

/**
 * Conversational address and politeness words. They never belong to a product phrase
 * (bhaiya two kilo atta, one kilo chini please), so binding drops them.
 */
const FILLER_WORDS: ReadonlySet<string> = new Set([
  'bhaiya',
  'bhaiyya',
  'bhai',
  'please',
  'pls',
  'plz',
  '\u092D\u0948\u092F\u093E',
  '\u092D\u093E\u0908',
]);

/**
 * Request-frame words around an item list (mujhe ... chahiye, I need ..., please give me ...,
 * ... de do). They carry no product information, so binding drops them from the phrase.
 */
const CARRIER_WORDS: ReadonlySet<string> = new Set([
  'mujhe',
  'chahiye',
  'chahie',
  'need',
  'give',
  'me',
  'i',
  '\u092E\u0941\u091D\u0947',
  '\u091A\u093E\u0939\u093F\u090F',
]);

/** Verb of the "de do" frame. A number word right after it is the verb "do", not a quantity. */
const GIVE_VERBS: ReadonlySet<string> = new Set(['de', '\u0926\u0947']);

const SEPARATOR_PUNCT: ReadonlySet<string> = new Set([',', '\u0964']);

function isSeparator(token: NormalizedToken): boolean {
  if (token.kind === 'punct') return SEPARATOR_PUNCT.has(token.text);
  return token.kind === 'word' && SEPARATOR_WORDS.has(token.text.normalize('NFC').toLowerCase());
}

/** A word that can belong to a product phrase (not filler, request frame or the "de do" verb). */
function isPhraseWord(word: string | null): boolean {
  return word !== null && !FILLER_WORDS.has(word) && !CARRIER_WORDS.has(word) && !GIVE_VERBS.has(word);
}

/**
 * Split tokens into item segments (Req 8.1).
 *
 * Explicit separators: `aur`, `and`, `,`, `।`, `plus`. Other punctuation is dropped.
 *
 * Speech has no commas, and people often list items with no "aur" between them ("do kilo aata
 * ek litre tel"), so a segment also ends where the next item clearly begins:
 * - "quantity unit product" order: a new quantity after a product word starts the next item.
 * - "product quantity unit" order: a new product word after the quantity starts the next item.
 * A number right after the "de" of "de do" is the verb, not a quantity, and never splits.
 * Empty segments are omitted.
 */
export function segmentTokens(tokens: readonly NormalizedToken[]): NormalizedToken[][] {
  const segments: NormalizedToken[][] = [];
  let current: NormalizedToken[] = [];
  let hasNumber = false;
  let hasPhrase = false;
  let phraseFirst = false;
  let prevWord: string | null = null;
  const flush = (): void => {
    if (current.length > 0) segments.push(current);
    current = [];
    hasNumber = false;
    hasPhrase = false;
    phraseFirst = false;
  };
  for (const token of tokens) {
    if (isSeparator(token)) {
      flush();
      prevWord = null;
      continue;
    }
    if (token.kind === 'punct') continue;
    const word = token.kind === 'word' ? token.text.normalize('NFC').toLowerCase() : null;
    const quantity = token.kind === 'number' && !(prevWord !== null && GIVE_VERBS.has(prevWord));

    if (quantity && hasNumber && hasPhrase && !phraseFirst) flush();
    else if (isPhraseWord(word) && hasNumber && phraseFirst) flush();

    current.push(token);
    if (quantity) hasNumber = true;
    if (isPhraseWord(word)) {
      if (!hasNumber && !hasPhrase) phraseFirst = true;
      hasPhrase = true;
    }
    prevWord = word;
  }
  flush();
  return segments;
}

const missing = <T>(reason: string): ExtractedField<T> => ({
  value: null,
  status: 'missing',
  confidence: null,
  reason,
});

/**
 * Bind `(number)? (unit)? (phrase)` in either order for one segment.
 * Returns null when the segment has no product phrase words.
 * Pure: no I/O, clock or random (Req 8.3, 8.5).
 */
export function bindSegment(
  raw: string,
  rawSegment: readonly NormalizedToken[],
  index: number,
): CandidateLine | null {
  const wordOf = (t: NormalizedToken): string | null =>
    t.kind === 'word' ? t.text.normalize('NFC').toLowerCase() : null;
  const segment = rawSegment.filter((t, i) => {
    const w = wordOf(t);
    if (w !== null && (CARRIER_WORDS.has(w) || GIVE_VERBS.has(w))) return false;
    const prev = i > 0 ? wordOf(rawSegment[i - 1]!) : null;
    return !(t.kind === 'number' && prev !== null && GIVE_VERBS.has(prev));
  });
  const numberIdx = segment.findIndex((t) => t.kind === 'number');
  const unitIdx = segment.findIndex((t) => t.kind === 'unit');
  const phraseTokens = segment.filter(
    (t, i) =>
      i !== numberIdx &&
      i !== unitIdx &&
      !(t.kind === 'word' && FILLER_WORDS.has(t.text.normalize('NFC').toLowerCase())),
  );
  if (phraseTokens.length === 0) return null;

  const first = phraseTokens[0]!;
  const last = phraseTokens[phraseTokens.length - 1]!;
  const slice = (a: number, b: number): string => raw.slice(a, b);

  const productPhrase: ExtractedField<string> = {
    value: phraseTokens.map((t) => t.text).join(' '),
    status: 'confirmed',
    sourceText: slice(first.span.start, last.span.end),
    confidence: null,
  };

  const numTok = numberIdx >= 0 ? segment[numberIdx]! : undefined;
  const quantityMilli: ExtractedField<number> =
    numTok?.numberValueMilli !== undefined
      ? {
          value: numTok.numberValueMilli,
          status: 'confirmed',
          sourceText: slice(numTok.span.start, numTok.span.end),
          confidence: null,
        }
      : missing('no quantity spoken');

  const unitTok = unitIdx >= 0 ? segment[unitIdx]! : undefined;
  const unit: ExtractedField<CanonicalUnit> =
    unitTok?.canonicalUnit !== undefined
      ? {
          value: unitTok.canonicalUnit,
          status: 'confirmed',
          sourceText: slice(unitTok.span.start, unitTok.span.end),
          confidence: null,
        }
      : missing('no unit spoken');

  return { index, productPhrase, quantityMilli, unit };
}

/** Extract one Candidate_Line per spoken item, in spoken order (Req 8.1, 8.6, 8.8). */
export function extractLines(n: Normalized): CandidateLine[] {
  const lines: CandidateLine[] = [];
  for (const segment of segmentTokens(n.tokens)) {
    const line = bindSegment(n.raw, segment, lines.length);
    if (line) lines.push(line);
  }
  return lines;
}
