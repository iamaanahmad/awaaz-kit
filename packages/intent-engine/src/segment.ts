import type { Normalized, NormalizedToken } from '@awaaz-kit/language-normalizer';
import type { CandidateLine, ExtractedField } from './types.js';
import type { CanonicalUnit } from '@awaaz-kit/language-normalizer';

const SEPARATOR_WORDS: ReadonlySet<string> = new Set(['aur', 'and', 'plus', '\u0914\u0930']);

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

/**
 * Split tokens into item segments on `aur`, `and`, `,`, `।`, `plus` (Req 8.1).
 * Other punctuation is dropped. Empty segments are omitted.
 */
export function segmentTokens(tokens: readonly NormalizedToken[]): NormalizedToken[][] {
  const segments: NormalizedToken[][] = [];
  let current: NormalizedToken[] = [];
  const flush = (): void => {
    if (current.length > 0) segments.push(current);
    current = [];
  };
  for (const token of tokens) {
    if (isSeparator(token)) flush();
    else if (token.kind !== 'punct') current.push(token);
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
