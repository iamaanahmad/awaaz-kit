export interface SampleUtterance {
  /** Fixture clip id understood by `ScriptedProvider`. */
  clipId: string;
  /** Short chip label; the UI always prefixes it with "Sample". */
  label: string;
  language: 'hi' | 'hinglish' | 'en';
  text: string;
  app: 'order' | 'bill';
}

export const SAMPLE_UTTERANCES: readonly SampleUtterance[] = [
  {
    clipId: 'order-hinglish-1',
    label: 'Aata, tel, chawal',
    language: 'hinglish',
    text: 'do kilo aata, ek litre tel aur paanch kilo chawal',
    app: 'order',
  },
  {
    clipId: 'order-hindi-1',
    label: 'चीनी और दूध',
    language: 'hi',
    text: 'दो किलो चीनी और एक लीटर दूध',
    app: 'order',
  },
  {
    clipId: 'order-english-1',
    label: 'Sugar and milk',
    language: 'en',
    text: 'two kg sugar and one litre milk',
    app: 'order',
  },
  {
    clipId: 'bill-hinglish-1',
    label: 'Ramesh ka bill',
    language: 'hinglish',
    text: 'Ramesh ka bill banao, dedh kilo cheeni aur ek litre tel',
    app: 'bill',
  },
  {
    clipId: 'bill-english-1',
    label: 'Bill for Ramesh',
    language: 'en',
    text: 'bill for Ramesh, half kg tea and two packets biscuit',
    app: 'bill',
  },
];

export function sampleClipTranscripts(
  samples: readonly SampleUtterance[] = SAMPLE_UTTERANCES,
): Record<string, string> {
  return Object.fromEntries(samples.map((s) => [s.clipId, s.text]));
}
