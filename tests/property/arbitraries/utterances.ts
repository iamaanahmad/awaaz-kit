import { englishAlias, type GeneratedCatalog, type PoolEntry } from './catalog';
import { fc, type CanonicalUnit, type Lang } from './common';

/**
 * Hindi, Hinglish and English utterance templates driven by a generated catalog.
 * Each utterance carries the expected extraction, built from the template inputs (not from the
 * code under test), so it can serve as an independent oracle for routing and extraction.
 */

export interface UtteranceLine {
  /** Index into `catalog.products`. */
  productIndex: number;
  /** Expected quantity in milli-units (1.5 kg = 1500). */
  qtyMilli: number;
  /** Unit spoken, always equal to the catalog unit of the product. */
  unit: CanonicalUnit;
}

export interface GeneratedUtterance {
  lang: Lang;
  text: string;
  lines: UtteranceLine[];
}

const NUMBER_WORDS: Record<Lang, readonly string[]> = {
  hi: ['', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ', 'दस'],
  hinglish: ['', 'ek', 'do', 'teen', 'char', 'paanch', 'chhe', 'saat', 'aath', 'nau', 'das'],
  en: ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'],
};

const UNIT_WORDS: Record<Lang, Record<CanonicalUnit, string>> = {
  hi: { piece: 'पीस', kg: 'किलो', g: 'ग्राम', litre: 'लीटर', ml: 'मिलीलीटर' },
  hinglish: { piece: 'piece', kg: 'kilo', g: 'gram', litre: 'litre', ml: 'ml' },
  en: { piece: 'piece', kg: 'kg', g: 'grams', litre: 'litre', ml: 'ml' },
};

const HALF_WORD: Record<Lang, string> = { hi: 'आधा', hinglish: 'aadha', en: 'half' };

const JOINERS: Record<Lang, readonly string[]> = {
  hi: [' और ', ' , '],
  hinglish: [' aur ', ' , '],
  en: [' and ', ' , '],
};

const FRAMES: Record<Lang, readonly ((body: string) => string)[]> = {
  hi: [(b) => b, (b) => `${b} चाहिए`, (b) => `मुझे ${b} दे दो`],
  hinglish: [(b) => b, (b) => `${b} chahiye`, (b) => `mujhe ${b} de do`],
  en: [(b) => b, (b) => `I need ${b}`, (b) => `please give me ${b}`],
};

const aliasFor = (lang: Lang, e: PoolEntry): string =>
  lang === 'hi' ? e.hi : lang === 'hinglish' ? e.hinglish : englishAlias(e);

/** How a quantity is written: word, digits, or the "half" fraction word. */
type QtyStyle = 'word' | 'digits' | 'half';

function renderQuantity(
  lang: Lang,
  unit: CanonicalUnit,
  qtyMilli: number,
  style: QtyStyle,
): string {
  const unitWord = UNIT_WORDS[lang][unit];
  if (style === 'half') return `${HALF_WORD[lang]} ${unitWord}`;
  const whole = qtyMilli / 1000;
  const n = style === 'word' ? NUMBER_WORDS[lang][whole] : undefined;
  return `${n ?? String(whole)} ${unitWord}`;
}

/** Allowed (qtyMilli, style) choices for a unit. Word style is only used for 1..10. */
function quantityChoices(unit: CanonicalUnit): fc.Arbitrary<{ qtyMilli: number; style: QtyStyle }> {
  if (unit === 'g' || unit === 'ml') {
    return fc
      .constantFrom(100, 250, 500)
      .map((n) => ({ qtyMilli: n * 1000, style: 'digits' as const }));
  }
  const whole = fc
    .tuple(fc.integer({ min: 1, max: 10 }), fc.constantFrom<QtyStyle>('word', 'digits'))
    .map(([n, style]) => ({ qtyMilli: n * 1000, style }));
  if (unit === 'piece') return whole;
  return fc.oneof(
    { weight: 4, arbitrary: whole },
    { weight: 1, arbitrary: fc.constant({ qtyMilli: 500, style: 'half' as QtyStyle }) },
  );
}

/**
 * A multi-line shopping or billing utterance in the requested language.
 * Lines use distinct catalog products and always speak the catalog unit, so a correct engine
 * extracts exactly `lines`, with every field confirmed.
 */
export function utteranceArb(
  catalog: GeneratedCatalog,
  lang?: Lang,
  opts: { maxLines?: number } = {},
): fc.Arbitrary<GeneratedUtterance> {
  const maxLines = Math.min(opts.maxLines ?? 4, catalog.products.length);
  const langs: fc.Arbitrary<Lang> = lang ? fc.constant(lang) : fc.constantFrom<Lang>('hi', 'hinglish', 'en');
  return langs.chain((l) =>
    fc
      .uniqueArray(fc.integer({ min: 0, max: catalog.products.length - 1 }), {
        minLength: 1,
        maxLength: maxLines,
      })
      .chain((indexes) =>
        fc.tuple(
          fc.tuple(
            ...indexes.map((i) =>
              quantityChoices((catalog.entries[i] as PoolEntry).unit).map((q) => ({ i, ...q })),
            ),
          ),
          fc.constantFrom(...JOINERS[l]),
          fc.constantFrom(...FRAMES[l]),
        ),
      )
      .map(([picked, joiner, frame]) => {
        const phrases = picked.map(({ i, qtyMilli, style }) => {
          const entry = catalog.entries[i] as PoolEntry;
          return `${renderQuantity(l, entry.unit, qtyMilli, style)} ${aliasFor(l, entry)}`;
        });
        const lines = picked.map(({ i, qtyMilli }) => ({
          productIndex: i,
          qtyMilli,
          unit: (catalog.entries[i] as PoolEntry).unit,
        }));
        return { lang: l, text: frame(phrases.join(joiner)), lines };
      }),
  );
}

/** Utterance in a random language of the three. */
export const anyLanguageUtteranceArb = (
  catalog: GeneratedCatalog,
): fc.Arbitrary<GeneratedUtterance> => utteranceArb(catalog);

/**
 * Utterances with an uncertain field, for ambiguity-gate properties. `missingQty` drops the
 * quantity of the single line, `unknownProduct` replaces the product with a word that is not
 * in any catalog. The expected status is recorded so tests can check it is never `confirmed`.
 */
export interface UncertainUtterance {
  lang: Lang;
  text: string;
  uncertain: 'missing_quantity' | 'unmatched_product';
}

const UNKNOWN_WORDS = ['zzqx', 'xylophonium', 'qwertyuiop', 'ज़ज़ज़क्स'] as const;

export function uncertainUtteranceArb(catalog: GeneratedCatalog): fc.Arbitrary<UncertainUtterance> {
  return fc
    .tuple(
      fc.constantFrom<Lang>('hi', 'hinglish', 'en'),
      fc.integer({ min: 0, max: catalog.products.length - 1 }),
      fc.constantFrom<UncertainUtterance['uncertain']>('missing_quantity', 'unmatched_product'),
      fc.constantFrom(...UNKNOWN_WORDS),
      fc.integer({ min: 1, max: 10 }),
    )
    .map(([lang, i, uncertain, unknown, n]) => {
      const entry = catalog.entries[i] as PoolEntry;
      const text =
        uncertain === 'missing_quantity'
          ? aliasFor(lang, entry)
          : `${NUMBER_WORDS[lang][n] as string} ${UNIT_WORDS[lang][entry.unit]} ${unknown}`;
      return { lang, text, uncertain };
    });
}

/** Free text that is not an item list (routing negatives): greetings and noise. */
export const nonOrderTextArb: fc.Arbitrary<string> = fc.constantFrom(
  'hello',
  'namaste',
  'नमस्ते',
  'thank you',
  'ok theek hai',
  '',
);
