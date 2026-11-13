import {
  DEVANAGARI_DIGITS,
  FRACTION_MODIFIERS,
  FRACTION_PHRASES,
  FRACTION_WORDS,
  NUMBER_WORDS,
  PHONETIC_FOLD_RULES,
  UNIT_WORDS,
} from './tables.js';
import type { CanonicalUnit } from './tables.js';

export interface SourceSpan {
  start: number;
  end: number;
}

export interface NormalizedToken {
  text: string;
  kind: 'number' | 'unit' | 'word' | 'punct';
  numberValueMilli?: number;
  canonicalUnit?: CanonicalUnit;
  span: SourceSpan;
}

export interface Normalized {
  raw: string;
  text: string;
  tokens: NormalizedToken[];
}

const DIGIT = '[0-9\\u0966-\\u096F]';
const TOKEN_RE = new RegExp(
  `(${DIGIT}+(?:\\.${DIGIT}+)?)|([\\p{L}\\p{M}][\\p{L}\\p{M}\\u200c\\u200d]*(?:-[\\p{L}\\p{M}][\\p{L}\\p{M}\\u200c\\u200d]*)*)|([^\\s\\u200b\\ufeff])`,
  'gu',
);
const MAX_PHRASE_WORDS = 5;
const MAX_INT_DIGITS = 9;
const MAX_FRAC_DIGITS = 3;

interface RawToken {
  kind: 'digits' | 'word' | 'punct';
  text: string;
  start: number;
  end: number;
}

function tokenize(raw: string): RawToken[] {
  const out: RawToken[] = [];
  for (const m of raw.matchAll(TOKEN_RE)) {
    const start = m.index;
    const text = m[0];
    const kind = m[1] !== undefined ? 'digits' : m[2] !== undefined ? 'word' : 'punct';
    out.push({ kind, text, start, end: start + text.length });
  }
  return out;
}

function toAsciiDigits(s: string): string {
  let out = '';
  for (const ch of s) out += DEVANAGARI_DIGITS.get(ch) ?? ch;
  return out;
}

/** Render milli-units as a canonical ASCII decimal ("1500" -> "1.5"). */
function renderMilli(milli: number): string {
  const whole = Math.floor(milli / 1000);
  const frac = String(milli % 1000)
    .padStart(3, '0')
    .replace(/0+$/, '');
  return frac === '' ? String(whole) : `${whole}.${frac}`;
}

/** Parse ASCII digits to milli-units, or null when too large or too precise to be safe. */
function digitsToMilli(ascii: string): number | null {
  const [intPart = '', fracPart = ''] = ascii.split('.');
  if (intPart.replace(/^0+/, '').length > MAX_INT_DIGITS || fracPart.length > MAX_FRAC_DIGITS) {
    return null;
  }
  return Number(intPart) * 1000 + Number(fracPart.padEnd(MAX_FRAC_DIGITS, '0'));
}

const key = (s: string): string => s.normalize('NFC').toLowerCase();

type Match =
  | { type: 'number'; milli: number; whole: boolean; used: number }
  | { type: 'unit'; unit: CanonicalUnit; used: number }
  | { type: 'modifier'; bareMilli: number; deltaMilli: number; used: number };

/** Longest-first match of recognized words starting at index i (word tokens only). */
function matchAt(tokens: readonly RawToken[], i: number): Match | null {
  const max = Math.min(MAX_PHRASE_WORDS, tokens.length - i);
  for (let n = max; n >= 1; n -= 1) {
    const slice = tokens.slice(i, i + n);
    if (!slice.every((t) => t.kind === 'word')) continue;
    const phrase = slice.map((t) => key(t.text).replace(/-/g, ' ')).join(' ');
    const joined = n === 1 ? key(slice[0]!.text) : phrase;
    for (const [p, milli] of FRACTION_PHRASES) {
      if (p === phrase) return { type: 'number', milli, whole: false, used: n };
    }
    const num = NUMBER_WORDS.get(joined) ?? NUMBER_WORDS.get(phrase);
    if (num !== undefined) return { type: 'number', milli: num * 1000, whole: true, used: n };
    if (n > 1) continue;
    const frac = FRACTION_WORDS.get(joined);
    if (frac !== undefined) return { type: 'number', milli: frac, whole: false, used: 1 };
    const mod = FRACTION_MODIFIERS.get(joined);
    if (mod !== undefined) return { type: 'modifier', ...mod, used: 1 };
    const unit = UNIT_WORDS.get(joined);
    if (unit !== undefined) return { type: 'unit', unit, used: 1 };
  }
  return null;
}

function numberToken(milli: number, start: number, end: number): NormalizedToken {
  return {
    text: renderMilli(milli),
    kind: 'number',
    numberValueMilli: milli,
    span: { start, end },
  };
}

/**
 * Normalize a transcript. Output tokens are canonical forms (ASCII digits,
 * canonical unit strings) that the rules do not rewrite again, so
 * `normalize(normalize(x).text).text === normalize(x).text` (Req 7.8).
 * `raw` is returned as given (Req 7.9).
 */
export function normalize(raw: string): Normalized {
  const src = tokenize(raw);
  const tokens: NormalizedToken[] = [];
  let i = 0;
  while (i < src.length) {
    const t = src[i]!;
    if (t.kind === 'digits') {
      const ascii = toAsciiDigits(t.text);
      const milli = digitsToMilli(ascii);
      if (milli === null) {
        tokens.push({ text: ascii, kind: 'word', span: { start: t.start, end: t.end } });
      } else {
        tokens.push(numberToken(milli, t.start, t.end));
      }
      i += 1;
      continue;
    }
    if (t.kind === 'punct') {
      const prev = tokens[tokens.length - 1];
      if (!(prev && prev.kind === 'punct' && prev.text === t.text)) {
        tokens.push({ text: t.text, kind: 'punct', span: { start: t.start, end: t.end } });
      }
      i += 1;
      continue;
    }
    const m = matchAt(src, i);
    if (m === null) {
      tokens.push({ text: t.text, kind: 'word', span: { start: t.start, end: t.end } });
      i += 1;
      continue;
    }
    const last = src[i + m.used - 1]!;
    if (m.type === 'unit') {
      tokens.push({
        text: m.unit,
        kind: 'unit',
        canonicalUnit: m.unit,
        span: { start: t.start, end: last.end },
      });
      i += m.used;
    } else if (m.type === 'number') {
      tokens.push(numberToken(m.milli, t.start, last.end));
      i += m.used;
    } else {
      // sava / paun / sadhe: combine with a following whole number, else bare value.
      const nextIdx = i + 1;
      const next = src[nextIdx];
      let milli = m.bareMilli;
      let used = 1;
      let end = t.end;
      let following: number | null = null;
      let followingUsed = 0;
      if (next?.kind === 'digits') {
        const v = digitsToMilli(toAsciiDigits(next.text));
        if (v !== null && v % 1000 === 0) {
          following = v;
          followingUsed = 1;
        }
      } else if (next?.kind === 'word') {
        const nm = matchAt(src, nextIdx);
        if (nm?.type === 'number' && nm.whole) {
          following = nm.milli;
          followingUsed = nm.used;
        }
      }
      if (following !== null && following + m.deltaMilli > 0 && following >= 1000) {
        milli = following + m.deltaMilli;
        used += followingUsed;
        end = src[i + used - 1]!.end;
      }
      tokens.push(numberToken(milli, t.start, end));
      i += used;
    }
  }
  return { raw, text: tokens.map((x) => x.text).join(' '), tokens };
}

/**
 * Alias-friendly form: lowercase, strip Latin diacritics, then apply
 * PHONETIC_FOLD_RULES until stable so the result is a fixed point.
 * Devanagari combining marks are kept (they carry vowels).
 */
export function foldForMatching(s: string): string {
  let out = s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC');
  for (let pass = 0; pass < 32; pass += 1) {
    let next = out;
    for (const [pattern, replacement] of PHONETIC_FOLD_RULES) {
      next = next.replace(pattern, replacement);
    }
    if (next === out) break;
    out = next;
  }
  return out.replace(/\s+/g, ' ').trim();
}
