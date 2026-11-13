/** Reference texts only. No audio is committed; speakers read these aloud or supply files named in this order. */
export type ClipGroup = "hindi" | "hinglish" | "english";

export interface Clip {
  id: string;
  group: ClipGroup;
  reference: string;
}

const hindi = [
  "दो किलो आटा और एक लीटर तेल",
  "पाँच किलो चावल चाहिए",
  "आधा किलो चीनी दे दो",
  "तीन पैकेट नमक और दो पैकेट चायपत्ती",
  "एक किलो दाल और दो किलो आलू",
  "डेढ़ किलो प्याज़ और आधा किलो टमाटर",
  "सवा किलो गुड़ चाहिए",
  "दो लीटर दूध और एक दही",
  "रमेश का बिल बनाओ",
  "चार साबुन और दो शैम्पू",
];

const hinglish = [
  "do kilo aata, ek litre tel aur paanch kilo chawal",
  "teen packet namak aur do packet chai patti",
  "aadha kilo cheeni de do",
  "ek kilo dal aur do kilo aloo",
  "dedh kilo pyaaz aur aadha kilo tamatar",
  "sava kilo gud chahiye",
  "Ramesh ka bill banao do kilo chawal aur ek litre tel",
  "paun kilo ghee aur do packet biscuit",
  "Amul butter ek packet aur paanch litre doodh",
  "char sabun aur do shampoo",
];

const english = [
  "two kilos of wheat flour and one litre of oil",
  "five kilos of rice please",
  "half a kilo of sugar",
  "three packets of salt and two packets of tea",
  "one kilo lentils and two kilos potatoes",
  "one and a half kilos of onions and half a kilo of tomatoes",
  "bill for Ramesh, two kilos rice and one litre oil",
  "two litres of milk and one curd",
  "four soaps and two shampoos",
  "one packet of biscuits and a bottle of cold drink",
];

const make = (group: ClipGroup, list: string[]): Clip[] =>
  list.map((reference, i) => ({ id: `${group}-${String(i + 1).padStart(2, "0")}`, group, reference }));

/** 30 clips: 10 Hindi, 10 Hinglish, 10 English, in this order. */
export const CLIPS: Clip[] = [...make("hindi", hindi), ...make("hinglish", hinglish), ...make("english", english)];
