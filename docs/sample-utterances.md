# Sample utterance sheet

Type these into the transcript field or use the **Sample** chips. They produce drafts only; nothing is saved until you confirm. Prices are the Demo_Shop prices (integer paise, shown as rupees).

## Built-in Sample chips

Defined in `packages/speech-provider/src/samples.ts`.

| App   | Chip label        | Language | Transcript                                                | Expected lines                                                                        |
| ----- | ----------------- | -------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Order | Aata, tel, chawal | Hinglish | `do kilo aata, ek litre tel aur paanch kilo chawal`       | Atta 2 kg, Sunflower Oil 1 litre, Basmati Rice 5 kg                                   |
| Order | चीनी और दूध        | Hindi    | `दो किलो चीनी और एक लीटर दूध`                              | Sugar 2 kg, Amul Gold Milk 1 litre                                                    |
| Order | Sugar and milk    | English  | `two kg sugar and one litre milk`                         | Sugar 2 kg, Amul Gold Milk 1 litre                                                    |
| Bill  | Ramesh ka bill    | Hinglish | `Ramesh ka bill banao, dedh kilo cheeni aur ek litre tel` | Customer Ramesh; Sugar 1.5 kg ₹72.00, Oil 1 litre ₹145.00; total ₹217.00              |
| Bill  | Bill for Ramesh   | English  | `bill for Ramesh, half kg tea and two packets biscuit`    | Customer Ramesh; Tata Tea Gold 0.5 kg ₹260.00, Parle-G 2 pieces ₹20.00; total ₹280.00 |

## Typed utterances for the demo

| App   | Transcript                                     | Expected                                                                                    |
| ----- | ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Order | `do kilo aata aur ek litre Amul`               | Atta 2 kg confirmed. "Amul" is **Needs review** (milk, butter, ghee). Pick one to continue. |
| Bill  | `तीन किलो आलू और दो किलो प्याज और एक किलो टमाटर` | Potato 3 kg ₹90.00, Onion 2 kg ₹70.00, Tomato 1 kg ₹40.00; total ₹200.00                    |
| Bill  | same, then change onion to 3 kg                | total ₹235.00                                                                               |

## Uncertainty cases (should never look confirmed)

From the Voice_Corpus ambiguity group (`tests/fixtures/voice-corpus/corpus.json`).

| Transcript                             | Expected field status                      |
| -------------------------------------- | ------------------------------------------ |
| `ek litre Amul`                        | product **Needs review**; pick a candidate |
| `do kilo laptop`                       | product **Unmatched**                      |
| `ek kilo xyzzy masala`                 | product **Unmatched**                      |
| `kilo chini`                           | quantity **Missing**                       |
| `kilo namak aur do kilo chawal` (Bill) | namak quantity **Missing**, rice 2 kg      |

## More working examples

From the corpus, with expected results.

| Language       | Transcript                                    | Expected                            |
| -------------- | --------------------------------------------- | ----------------------------------- |
| Hinglish       | `teen kilo chini aur do kilo namak`           | Sugar 3 kg, Salt 2 kg               |
| Hinglish       | `ek kilo Tata namak aur ek piece Amul butter` | Tata Salt 1 kg, Amul Butter 1 piece |
| English        | `five kilo potato, three kilo onion`          | Potato 5 kg, Onion 3 kg             |
| English        | `one litre milk and two kg sugar`             | Amul Gold Milk 1 litre, Sugar 2 kg  |
| Code-switching | `teen kilo rice aur one kilo chini please`    | Rice 3 kg, Sugar 1 kg               |
| Brand names    | `do litre Amul Gold doodh`                    | Amul Gold Milk 2 litre              |
| Brand names    | `ek kilo surf excel aur teen piece lux sabun` | Surf Excel 1 kg, Lux Soap 3 pieces  |
| Quantity words | `dedh litre doodh`                            | Amul Gold Milk 1.5 litre            |

Unit rule: if you say a unit that differs from the catalog unit, the line is **Needs review**. The app does not convert silently.
