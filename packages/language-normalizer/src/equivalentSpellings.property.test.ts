import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { assertProperty } from '../../../tests/setup/fast-check.js';
import { normalize } from './normalize.js';

/**
 * Oracle tables are written out here by hand and deliberately do not import
 * anything from ./tables.ts. The expected value comes from the table index,
 * never from calling the function under test.
 */

// Index = value 0..100. Each row: romanized/Hinglish spelling, Devanagari spelling.
const HINDI: ReadonlyArray<readonly [string, string]> = [
  ['shunya', 'शून्य'],
  ['ek', 'एक'],
  ['do', 'दो'],
  ['teen', 'तीन'],
  ['char', 'चार'],
  ['paanch', 'पाँच'],
  ['chhah', 'छह'],
  ['saat', 'सात'],
  ['aath', 'आठ'],
  ['nau', 'नौ'],
  ['das', 'दस'],
  ['gyarah', 'ग्यारह'],
  ['barah', 'बारह'],
  ['terah', 'तेरह'],
  ['chaudah', 'चौदह'],
  ['pandrah', 'पंद्रह'],
  ['solah', 'सोलह'],
  ['satrah', 'सत्रह'],
  ['atharah', 'अठारह'],
  ['unnis', 'उन्नीस'],
  ['bees', 'बीस'],
  ['ikkis', 'इक्कीस'],
  ['baais', 'बाईस'],
  ['teis', 'तेईस'],
  ['chaubis', 'चौबीस'],
  ['pachchis', 'पच्चीस'],
  ['chhabbis', 'छब्बीस'],
  ['sattais', 'सत्ताईस'],
  ['atthais', 'अट्ठाईस'],
  ['untis', 'उनतीस'],
  ['tis', 'तीस'],
  ['ikattis', 'इकतीस'],
  ['battis', 'बत्तीस'],
  ['taintis', 'तैंतीस'],
  ['chauntis', 'चौंतीस'],
  ['paintis', 'पैंतीस'],
  ['chhattis', 'छत्तीस'],
  ['saintis', 'सैंतीस'],
  ['adtis', 'अड़तीस'],
  ['unchalis', 'उनतालीस'],
  ['chalis', 'चालीस'],
  ['iktalis', 'इकतालीस'],
  ['bayalis', 'बयालीस'],
  ['taintalis', 'तैंतालीस'],
  ['chauvalis', 'चौवालीस'],
  ['paintalis', 'पैंतालीस'],
  ['chhiyalis', 'छियालीस'],
  ['saintalis', 'सैंतालीस'],
  ['adtalis', 'अड़तालीस'],
  ['unchas', 'उनचास'],
  ['pachas', 'पचास'],
  ['ikyavan', 'इक्यावन'],
  ['bavan', 'बावन'],
  ['tirpan', 'तिरपन'],
  ['chauvan', 'चौवन'],
  ['pachpan', 'पचपन'],
  ['chhappan', 'छप्पन'],
  ['sattavan', 'सत्तावन'],
  ['atthavan', 'अट्ठावन'],
  ['unsath', 'उनसठ'],
  ['saath', 'साठ'],
  ['iksath', 'इकसठ'],
  ['baasath', 'बासठ'],
  ['tirsath', 'तिरसठ'],
  ['chaunsath', 'चौंसठ'],
  ['painsath', 'पैंसठ'],
  ['chhiyasath', 'छियासठ'],
  ['sadsath', 'सड़सठ'],
  ['adsath', 'अड़सठ'],
  ['unhattar', 'उनहत्तर'],
  ['sattar', 'सत्तर'],
  ['ikhattar', 'इकहत्तर'],
  ['bahattar', 'बहत्तर'],
  ['tihattar', 'तिहत्तर'],
  ['chauhattar', 'चौहत्तर'],
  ['pachhattar', 'पचहत्तर'],
  ['chhihattar', 'छिहत्तर'],
  ['satahattar', 'सतहत्तर'],
  ['athahattar', 'अठहत्तर'],
  ['unyasi', 'उन्यासी'],
  ['assi', 'अस्सी'],
  ['ikyasi', 'इक्यासी'],
  ['bayasi', 'बयासी'],
  ['tirasi', 'तिरासी'],
  ['chaurasi', 'चौरासी'],
  ['pachasi', 'पचासी'],
  ['chhiyasi', 'छियासी'],
  ['sattasi', 'सत्तासी'],
  ['atthasi', 'अट्ठासी'],
  ['navasi', 'नवासी'],
  ['nabbe', 'नब्बे'],
  ['ikyanve', 'इक्यानवे'],
  ['baanve', 'बानवे'],
  ['tiranve', 'तिरानवे'],
  ['chauranve', 'चौरानवे'],
  ['pachanve', 'पचानवे'],
  ['chhiyanve', 'छियानवे'],
  ['sattanve', 'सत्तानवे'],
  ['atthanve', 'अट्ठानवे'],
  ['ninyanve', 'निन्यानवे'],
  ['sau', 'सौ'],
];

const EN_ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen',
];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function englishWord(n: number): string {
  if (n === 100) return 'one hundred';
  if (n < 20) return EN_ONES[n]!;
  const tens = EN_TENS[Math.floor(n / 10)]!;
  const ones = n % 10;
  return ones === 0 ? tens : `${tens} ${EN_ONES[ones]}`;
}

const LATIN_DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const DEVA_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
const mapDigits = (n: number, set: readonly string[]): string =>
  String(n)
    .split('')
    .map((d) => set[Number(d)]!)
    .join('');

/** All oracle spellings of integer n (0..100). */
function integerSpellings(n: number): string[] {
  return [
    mapDigits(n, LATIN_DIGITS),
    mapDigits(n, DEVA_DIGITS),
    HINDI[n]![0],
    HINDI[n]![1],
    englishWord(n),
  ];
}

// Unit spellings per canonical unit (Latin and Devanagari).
const UNITS: ReadonlyArray<readonly [canonical: string, spellings: readonly string[]]> = [
  ['piece', ['piece', 'pieces', 'pcs', 'पीस', 'नग']],
  ['kg', ['kg', 'kilo', 'kilogram', 'किलो', 'किलोग्राम']],
  ['g', ['g', 'gm', 'gram', 'grams', 'ग्राम']],
  ['litre', ['litre', 'liter', 'ltr', 'लीटर', 'लिटर']],
  ['ml', ['ml', 'millilitre', 'milliliter', 'मिलीलीटर', 'एमएल']],
];

// Standalone fraction words: expected milli and spellings.
const FRACTIONS: ReadonlyArray<readonly [milli: number, spellings: readonly string[]]> = [
  [500, ['aadha', 'adha', 'half', 'आधा']],
  [250, ['quarter', 'pav', 'पाव']],
  [1500, ['dedh', 'derh', 'डेढ़', 'one and a half']],
  [2500, ['dhai', 'adhai', 'ढाई', 'two and a half']],
];

// Modifiers combined with a following whole number n >= 1: expected = n*1000 + delta.
const MODIFIERS: ReadonlyArray<readonly [delta: number, spellings: readonly string[]]> = [
  [250, ['sava', 'sawa', 'सवा']],
  [-250, ['paun', 'पौन']],
  [500, ['sadhe', 'साढ़े']],
];

const unitArb = fc.integer({ min: 0, max: UNITS.length - 1 });
const pickArb = (len: number) => fc.integer({ min: 0, max: len - 1 });

/** Normalize "<number spelling> <unit spelling>" and return [milli, canonical unit]. */
function run(numberText: string, unitText: string): [number | undefined, string | undefined] {
  const tokens = normalize(`${numberText} ${unitText}`).tokens;
  expect(tokens).toHaveLength(2);
  expect(tokens[0]!.kind).toBe('number');
  expect(tokens[1]!.kind).toBe('unit');
  return [tokens[0]!.numberValueMilli, tokens[1]!.canonicalUnit];
}

describe('Property 3: equivalent number and unit spellings', () => {
  // Feature: awaaz-kit, Property 3: Equivalent number and unit spellings normalize identically
  // **Validates: Requirements 7.2, 7.3, 7.4**
  it('Property 3: integers 0..100 in every spelling normalize to the same value and unit', () => {
    assertProperty(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        unitArb,
        pickArb(5),
        pickArb(5),
        pickArb(5),
        pickArb(5),
        (n, u, numA, numB, unitA, unitB) => {
          const [canonical, unitSpellings] = UNITS[u]!;
          const spellings = integerSpellings(n);
          const a = run(spellings[numA]!, unitSpellings[unitA]!);
          const b = run(spellings[numB]!, unitSpellings[unitB]!);
          expect(a).toEqual([n * 1000, canonical]);
          expect(b).toEqual(a);
        },
      ),
    );
  });

  // Feature: awaaz-kit, Property 3: Equivalent number and unit spellings normalize identically
  // **Validates: Requirements 7.2, 7.3, 7.4**
  it('Property 3: fraction words and modifiers agree across spellings', () => {
    assertProperty(
      fc.property(
        fc.integer({ min: 0, max: FRACTIONS.length - 1 }),
        fc.integer({ min: 0, max: MODIFIERS.length - 1 }),
        fc.integer({ min: 1, max: 100 }),
        unitArb,
        fc.nat(),
        fc.nat(),
        fc.nat(),
        (f, m, n, u, s1, s2, s3) => {
          const [canonical, unitSpellings] = UNITS[u]!;
          const unitText = unitSpellings[s3 % unitSpellings.length]!;

          const [fracMilli, fracSpellings] = FRACTIONS[f]!;
          const fa = run(fracSpellings[s1 % fracSpellings.length]!, unitText);
          const fb = run(fracSpellings[s2 % fracSpellings.length]!, unitText);
          expect(fa).toEqual([fracMilli, canonical]);
          expect(fb).toEqual(fa);

          const [delta, modSpellings] = MODIFIERS[m]!;
          const numSpellings = integerSpellings(n);
          const modText = modSpellings[s1 % modSpellings.length]!;
          const ma = run(`${modText} ${numSpellings[s1 % 5]!}`, unitText);
          const mb = run(`${modText} ${numSpellings[s2 % 5]!}`, unitText);
          expect(ma).toEqual([n * 1000 + delta, canonical]);
          expect(mb).toEqual(ma);
        },
      ),
    );
  });
});
