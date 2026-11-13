/**
 * Static lookup tables for the normalizer. Data only, no logic beyond small
 * builders, so the rules in `normalize` stay table-driven (Req 7.2 to 7.5).
 *
 * All lookup keys are lowercase. Latin keys are plain ASCII; Devanagari keys
 * are stored in the form speech providers usually emit (NFC).
 */

export type CanonicalUnit = 'piece' | 'kg' | 'g' | 'litre' | 'ml';

/** Each entry: numeric value and its spellings (romanized, Hinglish, Devanagari). */
type NumberEntry = readonly [value: number, spellings: readonly string[]];

const ENGLISH_ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
] as const;

const ENGLISH_TENS: Readonly<Record<number, string>> = {
  20: 'twenty',
  30: 'thirty',
  40: 'forty',
  50: 'fifty',
  60: 'sixty',
  70: 'seventy',
  80: 'eighty',
  90: 'ninety',
};

/** English number words 0 to 100, generated. */
function englishNumberEntries(): NumberEntry[] {
  const entries: NumberEntry[] = [];
  for (let n = 0; n < 20; n += 1) entries.push([n, [ENGLISH_ONES[n] as string]]);
  for (let tens = 20; tens <= 90; tens += 10) {
    const tensWord = ENGLISH_TENS[tens] as string;
    entries.push([tens, [tensWord]]);
    for (let ones = 1; ones <= 9; ones += 1) {
      entries.push([
        tens + ones,
        [`${tensWord}-${ENGLISH_ONES[ones]}`, `${tensWord} ${ENGLISH_ONES[ones]}`],
      ]);
    }
  }
  entries.push([100, ['hundred', 'one hundred']]);
  return entries;
}

/** Hindi and Hinglish number words 0 to 100: romanized variants then Devanagari. */
const HINDI_NUMBER_ENTRIES: readonly NumberEntry[] = [
  [0, ['shunya', 'sifar', 'शून्य', 'सिफर']],
  [1, ['ek', 'एक']],
  [2, ['do', 'दो']],
  [3, ['teen', 'tin', 'तीन']],
  [4, ['char', 'chaar', 'chār', 'चार']],
  [5, ['paanch', 'panch', 'पाँच', 'पांच']],
  [6, ['chhe', 'chhah', 'chhah', 'che', 'chhay', 'छह', 'छः', 'छे']],
  [7, ['saat', 'sat', 'सात']],
  [8, ['aath', 'ath', 'आठ']],
  [9, ['nau', 'nao', 'नौ']],
  [10, ['das', 'dus', 'दस']],
  [11, ['gyarah', 'gyaarah', 'giyarah', 'ग्यारह']],
  [12, ['barah', 'baarah', 'बारह']],
  [13, ['terah', 'तेरह']],
  [14, ['chaudah', 'chaudaha', 'चौदह']],
  [15, ['pandrah', 'pandra', 'पंद्रह', 'पन्द्रह']],
  [16, ['solah', 'sola', 'सोलह']],
  [17, ['satrah', 'satra', 'सत्रह']],
  [18, ['atharah', 'athaarah', 'अठारह']],
  [19, ['unnis', 'unnees', 'उन्नीस']],
  [20, ['bees', 'bis', 'बीस']],
  [21, ['ikkis', 'ikkees', 'इक्कीस']],
  [22, ['baais', 'bais', 'बाईस']],
  [23, ['teis', 'tees', 'teyis', 'तेईस']],
  [24, ['chaubis', 'chaubees', 'चौबीस']],
  [25, ['pachchis', 'pacchis', 'pachis', 'पच्चीस']],
  [26, ['chhabbis', 'chhabis', 'छब्बीस']],
  [27, ['sattais', 'sattaees', 'सत्ताईस']],
  [28, ['atthais', 'athais', 'अट्ठाईस', 'अठाईस']],
  [29, ['untis', 'unatis', 'उनतीस']],
  [30, ['tees', 'tis', 'तीस']],
  [31, ['ikattis', 'iktis', 'इकतीस']],
  [32, ['battis', 'battees', 'बत्तीस']],
  [33, ['taintis', 'tentis', 'तैंतीस']],
  [34, ['chauntis', 'chauntees', 'चौंतीस']],
  [35, ['paintis', 'pentis', 'पैंतीस']],
  [36, ['chhattis', 'chattis', 'छत्तीस']],
  [37, ['saintis', 'sentis', 'सैंतीस']],
  [38, ['adtis', 'artis', 'अड़तीस']],
  [39, ['unchalis', 'untalis', 'उनतालीस']],
  [40, ['chalis', 'chaalis', 'चालीस']],
  [41, ['iktalis', 'ektalis', 'इकतालीस']],
  [42, ['bayalis', 'byalis', 'बयालीस']],
  [43, ['taintalis', 'tentalis', 'तैंतालीस']],
  [44, ['chauvalis', 'chavalis', 'चौवालीस']],
  [45, ['paintalis', 'pentalis', 'पैंतालीस']],
  [46, ['chhiyalis', 'chiyalis', 'छियालीस']],
  [47, ['saintalis', 'sentalis', 'सैंतालीस']],
  [48, ['adtalis', 'artalis', 'अड़तालीस']],
  [49, ['unchas', 'unanchas', 'उनचास']],
  [50, ['pachas', 'pachaas', 'पचास']],
  [51, ['ikyavan', 'ikyawan', 'इक्यावन']],
  [52, ['bavan', 'bawan', 'बावन']],
  [53, ['tirpan', 'tirepan', 'तिरपन']],
  [54, ['chauvan', 'chawan', 'चौवन']],
  [55, ['pachpan', 'pachpan', 'पचपन']],
  [56, ['chhappan', 'chappan', 'छप्पन']],
  [57, ['sattavan', 'satawan', 'सत्तावन']],
  [58, ['atthavan', 'athawan', 'अट्ठावन']],
  [59, ['unsath', 'unasath', 'उनसठ']],
  [60, ['saath', 'sath', 'साठ']],
  [61, ['iksath', 'ikasath', 'इकसठ']],
  [62, ['baasath', 'basath', 'बासठ']],
  [63, ['tirsath', 'tirasath', 'तिरसठ']],
  [64, ['chaunsath', 'chausath', 'चौंसठ']],
  [65, ['painsath', 'pensath', 'पैंसठ']],
  [66, ['chhiyasath', 'chiyasath', 'छियासठ']],
  [67, ['sadsath', 'sarsath', 'सड़सठ']],
  [68, ['adsath', 'arsath', 'अड़सठ']],
  [69, ['unhattar', 'unahattar', 'उनहत्तर']],
  [70, ['sattar', 'satar', 'सत्तर']],
  [71, ['ikhattar', 'ekahattar', 'इकहत्तर']],
  [72, ['bahattar', 'bahatar', 'बहत्तर']],
  [73, ['tihattar', 'tihatar', 'तिहत्तर']],
  [74, ['chauhattar', 'chauhatar', 'चौहत्तर']],
  [75, ['pachhattar', 'pachattar', 'पचहत्तर']],
  [76, ['chhihattar', 'chihattar', 'छिहत्तर']],
  [77, ['satahattar', 'satattar', 'सतहत्तर']],
  [78, ['athahattar', 'athattar', 'अठहत्तर']],
  [79, ['unyasi', 'unasi', 'उन्यासी']],
  [80, ['assi', 'asi', 'अस्सी']],
  [81, ['ikyasi', 'ekyasi', 'इक्यासी']],
  [82, ['bayasi', 'byasi', 'बयासी']],
  [83, ['tirasi', 'tirasee', 'तिरासी']],
  [84, ['chaurasi', 'chaurasee', 'चौरासी']],
  [85, ['pachasi', 'pachaasi', 'पचासी']],
  [86, ['chhiyasi', 'chiyasi', 'छियासी']],
  [87, ['sattasi', 'satasi', 'सत्तासी']],
  [88, ['atthasi', 'athasi', 'अट्ठासी']],
  [89, ['navasi', 'nawasi', 'नवासी']],
  [90, ['nabbe', 'nabbe', 'नब्बे']],
  [91, ['ikyanve', 'ikyanbe', 'इक्यानवे']],
  [92, ['baanve', 'banve', 'बानवे']],
  [93, ['tiranve', 'tiranbe', 'तिरानवे']],
  [94, ['chauranve', 'chauranbe', 'चौरानवे']],
  [95, ['pachanve', 'pachaanve', 'पचानवे']],
  [96, ['chhiyanve', 'chiyanve', 'छियानवे']],
  [97, ['sattanve', 'satanve', 'सत्तानवे']],
  [98, ['atthanve', 'athanve', 'अट्ठानवे']],
  [99, ['ninyanve', 'ninanve', 'निन्यानवे']],
  [100, ['sau', 'सौ']],
];

/**
 * Number words 0 to 100 mapped to integer values. Where a spelling is shared
 * by two numbers (for example "tees" as 23 or 30) the later, more common
 * entry in table order does not override an earlier one: first wins.
 */
function buildNumberWordMap(): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  for (const [value, spellings] of [...englishNumberEntries(), ...HINDI_NUMBER_ENTRIES]) {
    for (const spelling of spellings) {
      const key = spelling.toLowerCase();
      if (!map.has(key)) map.set(key, value);
    }
  }
  // "tees" is thirty in everyday speech; make that explicit.
  map.set('tees', 30);
  return map;
}

/** Number word (any supported spelling) to its integer value, 0 to 100. */
export const NUMBER_WORDS: ReadonlyMap<string, number> = buildNumberWordMap();

/** Standalone fractional quantities, in milli-units (1000 = one whole). */
export const FRACTION_WORDS: ReadonlyMap<string, number> = new Map<string, number>([
  ['aadha', 500],
  ['aadhaa', 500],
  ['adha', 500],
  ['aadhi', 500],
  ['adhi', 500],
  ['आधा', 500],
  ['आधी', 500],
  ['half', 500],
  ['quarter', 250],
  ['pav', 250],
  ['paav', 250],
  ['पाव', 250],
  ['dedh', 1500],
  ['derh', 1500],
  ['डेढ़', 1500],
  ['डेढ', 1500],
  ['dhai', 2500],
  ['dhaai', 2500],
  ['adhai', 2500],
  ['ढाई', 2500],
  ['अढ़ाई', 2500],
]);

/**
 * Fractions that add to or subtract from the following number word:
 * "sava kilo" is 1.25 kg, "paun kilo" is 0.75 kg, "sadhe teen" is 3.5.
 * `base` is the quantity when no number word follows (milli-units);
 * `delta` is added to the following whole number (milli-units).
 */
export interface FractionModifier {
  /** Value when used without a following number ("sava kilo"). */
  readonly bareMilli: number;
  /** Offset applied to the following number, in milli-units. */
  readonly deltaMilli: number;
}

export const FRACTION_MODIFIERS: ReadonlyMap<string, FractionModifier> = new Map<
  string,
  FractionModifier
>([
  ['sava', { bareMilli: 1250, deltaMilli: 250 }],
  ['sawa', { bareMilli: 1250, deltaMilli: 250 }],
  ['सवा', { bareMilli: 1250, deltaMilli: 250 }],
  ['paun', { bareMilli: 750, deltaMilli: -250 }],
  ['pauna', { bareMilli: 750, deltaMilli: -250 }],
  ['पौन', { bareMilli: 750, deltaMilli: -250 }],
  ['पौना', { bareMilli: 750, deltaMilli: -250 }],
  ['sadhe', { bareMilli: 500, deltaMilli: 500 }],
  ['saade', { bareMilli: 500, deltaMilli: 500 }],
  ['साढ़े', { bareMilli: 500, deltaMilli: 500 }],
  ['साढे', { bareMilli: 500, deltaMilli: 500 }],
]);

/** Multi-word fraction phrases, longest first for greedy matching. */
export const FRACTION_PHRASES: readonly (readonly [phrase: string, milli: number])[] = [
  ['one and a half', 1500],
  ['one and half', 1500],
  ['two and a half', 2500],
  ['two and half', 2500],
  ['half a', 500],
];

/** Devanagari digit to Latin digit. */
export const DEVANAGARI_DIGITS: ReadonlyMap<string, string> = new Map<string, string>([
  ['०', '0'],
  ['१', '1'],
  ['२', '2'],
  ['३', '3'],
  ['४', '4'],
  ['५', '5'],
  ['६', '6'],
  ['७', '7'],
  ['८', '8'],
  ['९', '9'],
]);

const UNIT_SPELLINGS: Readonly<Record<CanonicalUnit, readonly string[]>> = {
  piece: ['piece', 'pieces', 'pc', 'pcs', 'nag', 'nang', 'पीस', 'नग', 'टुकड़ा', 'टुकड़े'],
  kg: [
    'kg',
    'kgs',
    'kilo',
    'kilos',
    'kilogram',
    'kilograms',
    'kilogramme',
    'kilogrammes',
    'kg.',
    'किलो',
    'किलोग्राम',
    'केजी',
    'किग्रा',
    'किलोज़',
  ],
  g: ['g', 'gm', 'gms', 'gram', 'grams', 'gramme', 'grammes', 'ग्राम', 'ग्रा', 'जीएम'],
  litre: ['l', 'lt', 'ltr', 'ltrs', 'litre', 'litres', 'liter', 'liters', 'leter', 'लीटर', 'लिटर'],
  ml: [
    'ml',
    'mls',
    'millilitre',
    'millilitres',
    'milliliter',
    'milliliters',
    'मिलीलीटर',
    'मिली',
    'एमएल',
  ],
};

function buildUnitMap(): ReadonlyMap<string, CanonicalUnit> {
  const map = new Map<string, CanonicalUnit>();
  for (const unit of Object.keys(UNIT_SPELLINGS) as CanonicalUnit[]) {
    for (const spelling of UNIT_SPELLINGS[unit]) map.set(spelling.toLowerCase(), unit);
  }
  return map;
}

/** Unit spelling (any supported form) to canonical unit. */
export const UNIT_WORDS: ReadonlyMap<string, CanonicalUnit> = buildUnitMap();

/** Canonical unit strings, for fixed-point checks. */
export const CANONICAL_UNITS: readonly CanonicalUnit[] = ['piece', 'kg', 'g', 'litre', 'ml'];

/**
 * Ordered phonetic fold rules for Latin-script matching (Req 7.5). Applied
 * after lowercasing and diacritic stripping. Chosen so common spelling
 * variants collapse: aata/atta/ata -> ata, chawal/chaval -> chaval.
 */
export const PHONETIC_FOLD_RULES: readonly (readonly [pattern: RegExp, replacement: string])[] = [
  [/ph/g, 'f'],
  [/w/g, 'v'],
  [/ck/g, 'k'],
  [/z/g, 'j'],
  [/aa+/g, 'a'],
  [/ee+/g, 'i'],
  [/ii+/g, 'i'],
  [/oo+/g, 'u'],
  [/uu+/g, 'u'],
  [/ou/g, 'au'],
  // collapse any doubled letter: atta -> ata, chhe stays as ch-h handled below
  [/([a-z])\1+/g, '$1'],
  // silent aspirate after c/k/g/t/d/b/p: chhe -> che, kh stays distinct enough
  [/([cgtdbp])h+/g, '$1h'],
];
