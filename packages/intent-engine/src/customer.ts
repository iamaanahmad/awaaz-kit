import type { Normalized, NormalizedToken } from '@awaaz-kit/language-normalizer';
import type { ExtractedField, ExtractionContext, ExtractionResult } from './types.js';
import { extractLines } from './segment.js';

const D = '[0-9\\u0966-\\u096F]';
/** 10-digit Indian mobile (first digit 6-9), optional +91/91/0 prefix, optional one space or dash in the middle. */
const PHONE_RE = new RegExp(
  `(?<!${D})(?:\\+?91[\\s-]?|0)?([6-9\\u096C-\\u096F]${D}{4})[\\s-]?(${D}{5})(?!${D})`,
  'gu',
);
const DEVANAGARI_ZERO = 0x0966;

const POSSESSIVE: ReadonlySet<string> = new Set(['ka', 'ki', 'ke', 'का', 'की', 'के']);
const LEAD_WORDS: ReadonlySet<string> = new Set([
  'for',
  'customer',
  'naam',
  'name',
  'ke liye',
  'के लिए',
]);
const DOC_NOUNS: ReadonlySet<string> = new Set([
  'bill',
  'order',
  'hisaab',
  'hisab',
  'udhaar',
  'udhar',
  'memo',
  'receipt',
  'बिल',
  'ऑर्डर',
  'हिसाब',
  'उधार',
]);
const VERBS: ReadonlySet<string> = new Set([
  'banao',
  'banana',
  'bana',
  'banaiye',
  'banaye',
  'karo',
  'kijiye',
  'kar',
  'बनाओ',
  'बनाना',
  'बनाइए',
  'करो',
  'कीजिए',
]);
const PHONE_LABELS: ReadonlySet<string> = new Set([
  'phone',
  'number',
  'mobile',
  'mob',
  'no',
  'contact',
  'नंबर',
  'फोन',
  'मोबाइल',
]);
/** Words that can never be part of a customer name. */
const STOP_WORDS: ReadonlySet<string> = new Set([
  ...POSSESSIVE,
  ...LEAD_WORDS,
  ...DOC_NOUNS,
  ...VERBS,
  ...PHONE_LABELS,
  'aur',
  'and',
  'plus',
  'with',
  'ko',
  'se',
  'me',
  'mein',
  'ek',
  'the',
  'a',
  'an',
  'to',
  'of',
  'new',
  'naya',
  'nayi',
  'chahiye',
  'de',
  'dena',
  'do',
  'dijiye',
  'aur',
  'या',
  'और',
  'को',
  'से',
]);
const MAX_NAME_WORDS = 2;

const lc = (s: string): string => s.normalize('NFC').toLowerCase();

const toAscii = (s: string): string =>
  Array.from(s, (ch) => {
    const cp = ch.codePointAt(0)!;
    return cp >= DEVANAGARI_ZERO && cp <= DEVANAGARI_ZERO + 9 ? String(cp - DEVANAGARI_ZERO) : ch;
  }).join('');

export interface CustomerExtraction {
  customerName?: ExtractedField<string>;
  customerPhone?: ExtractedField<string>;
  /** Token indices (into `n.tokens`) used by the customer lead phrase or phone. */
  consumed: ReadonlySet<number>;
}

function isNameWord(t: NormalizedToken | undefined): t is NormalizedToken {
  return t !== undefined && t.kind === 'word' && !STOP_WORDS.has(lc(t.text));
}

function findPhone(n: Normalized, consumed: Set<number>): ExtractedField<string> | undefined {
  for (const m of n.raw.matchAll(PHONE_RE)) {
    const digits = toAscii(`${m[1]}${m[2]}`);
    if (!/^[6-9]\d{9}$/.test(digits)) continue;
    const start = m.index;
    const end = start + m[0].length;
    n.tokens.forEach((t, i) => {
      if (t.span.start < end && t.span.end > start) consumed.add(i);
    });
    // A directly preceding label ("phone", "number") belongs to the phone phrase.
    let i = Math.min(...[...consumed].filter((c) => n.tokens[c]!.span.start >= start)) - 1;
    while (i >= 0 && n.tokens[i]!.kind === 'word' && PHONE_LABELS.has(lc(n.tokens[i]!.text))) {
      consumed.add(i);
      i -= 1;
    }
    return {
      value: digits,
      status: 'confirmed',
      sourceText: n.raw.slice(start, end),
      confidence: null,
    };
  }
  return undefined;
}

function nameField(
  n: Normalized,
  idx: number[],
  ctx: ExtractionContext | undefined,
): ExtractedField<string> {
  const first = n.tokens[idx[0]!]!;
  const last = n.tokens[idx[idx.length - 1]!]!;
  const spoken = idx.map((i) => n.tokens[i]!.text).join(' ');
  const known = ctx?.knownCustomerNames?.find((k) => lc(k) === lc(spoken));
  return {
    value: known ?? spoken,
    status: 'confirmed',
    sourceText: n.raw.slice(first.span.start, last.span.end),
    confidence: null,
  };
}

function findName(
  n: Normalized,
  consumed: Set<number>,
  ctx: ExtractionContext | undefined,
): ExtractedField<string> | undefined {
  const toks = n.tokens;
  // "<Name> ka bill banao"
  for (let i = 0; i < toks.length; i += 1) {
    const t = toks[i]!;
    if (consumed.has(i) || t.kind !== 'word' || !POSSESSIVE.has(lc(t.text))) continue;
    const noun = toks[i + 1];
    if (!noun || noun.kind !== 'word' || !DOC_NOUNS.has(lc(noun.text))) continue;
    const nameIdx: number[] = [];
    for (let j = i - 1; j >= 0 && nameIdx.length < MAX_NAME_WORDS; j -= 1) {
      if (consumed.has(j) || !isNameWord(toks[j])) break;
      nameIdx.unshift(j);
    }
    if (nameIdx.length === 0) continue;
    [...nameIdx, i, i + 1].forEach((k) => consumed.add(k));
    const verb = toks[i + 2];
    if (verb && verb.kind === 'word' && VERBS.has(lc(verb.text))) consumed.add(i + 2);
    return nameField(n, nameIdx, ctx);
  }
  // "Ramesh ke liye" (name, then the two-token postposition)
  for (let i = 0; i + 1 < toks.length; i += 1) {
    const t = toks[i]!;
    const next = toks[i + 1]!;
    if (consumed.has(i) || consumed.has(i + 1) || t.kind !== 'word' || next.kind !== 'word') {
      continue;
    }
    if (!(lc(t.text) === 'ke' || t.text === '\u0915\u0947')) continue;
    if (!(lc(next.text) === 'liye' || next.text.normalize('NFC') === '\u0932\u093F\u090F')) continue;
    const nameIdx: number[] = [];
    for (let j = i - 1; j >= 0 && nameIdx.length < MAX_NAME_WORDS; j -= 1) {
      if (consumed.has(j) || !isNameWord(toks[j])) break;
      nameIdx.unshift(j);
    }
    if (nameIdx.length === 0) continue;
    [...nameIdx, i, i + 1].forEach((k) => consumed.add(k));
    return nameField(n, nameIdx, ctx);
  }
  // "for Ramesh", "customer Ramesh"
  for (let i = 0; i < toks.length; i += 1) {
    const t = toks[i]!;
    if (consumed.has(i) || t.kind !== 'word') continue;
    const w = lc(t.text);
    if (w === 'for' || w === 'customer' || w === 'naam' || w === 'name') {
      const nameIdx: number[] = [];
      for (let j = i + 1; j < toks.length && nameIdx.length < MAX_NAME_WORDS; j += 1) {
        if (consumed.has(j) || !isNameWord(toks[j])) break;
        nameIdx.push(j);
      }
      if (nameIdx.length === 0) continue;
      [i, ...nameIdx].forEach((k) => consumed.add(k));
      return nameField(n, nameIdx, ctx);
    }
  }
  return undefined;
}

/**
 * Extract optional customer name and phone (Req 8.2). Each field carries the
 * exact `sourceText` from the raw transcript (Req 8.7). Pure and deterministic.
 */
export function extractCustomer(n: Normalized, ctx?: ExtractionContext): CustomerExtraction {
  const consumed = new Set<number>();
  const customerPhone = findPhone(n, consumed);
  const customerName = findName(n, consumed, ctx);
  return {
    ...(customerName ? { customerName } : {}),
    ...(customerPhone ? { customerPhone } : {}),
    consumed,
  };
}

/**
 * Full extraction: customer fields plus item lines. Tokens used by the
 * customer lead phrase or phone are excluded from item segmentation.
 */
export function extract(n: Normalized, ctx?: ExtractionContext): ExtractionResult {
  const { consumed, ...customer } = extractCustomer(n, ctx);
  const remaining = n.tokens.filter((_, i) => !consumed.has(i));
  return { lines: extractLines({ ...n, tokens: remaining }), ...customer };
}
