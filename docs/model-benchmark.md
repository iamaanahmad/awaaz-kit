# Speech Model Benchmark and Decision

Status: **measured.** Desktop results below come from real runs of the shipping model on real
audio. The phone run is still open (section 6). Related requirements: 5.2, 5.11.

Raw outputs, one row per clip: [`voice-benchmark-mucs.json`](voice-benchmark-mucs.json) and
[`voice-benchmark-shop.json`](voice-benchmark-shop.json).

## 1. Decision

- **Shipping provider: `shruti`.** [Shruti Hindi](https://huggingface.co/udgamlabs/Shruti) by Udgam
  Labs (Apache-2.0), loaded through the publisher's own `shruti-onnx` 0.2.0 wrapper over
  `onnxruntime-web` 1.31.1 (WASM). Hindi, English and Hinglish in one model; Hindi in Devanagari,
  English words in Latin script.
- **Build: int8** (`hi/onnx-int8`, 4 files, 52.9 MB, one-time download, SHA-256 checked against the
  publisher's `MANIFEST.json`). Chosen over the 4-bit build (32.1 MB): same accuracy, loads in less
  than half the time (section 4).
- **Voice is opt-in.** Nothing is downloaded until the user taps "Download model". Until then the
  mic says that voice needs the download, and typed input plus chips labelled "Sample" work as
  before. `scripted` remains available for tests (`VITE_SPEECH_PROVIDER=scripted`).
- **Where it runs:** a dedicated Web Worker, so loading and transcription never freeze the page.
- **What never happens:** audio is never uploaded or stored; the model is never fetched during
  transcription (only from Cache Storage); no confidence number is shown, because the model has no
  calibrated one.

## 2. Accuracy on real Hinglish speech

|                   |                                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Test set          | First 20 clips of the MUCS 2021 Hindi-English test split (`dianavdavidson/MUCS-Hinglish`, CC-BY-4.0), 125.7 s of audio |
| Speech            | Hindi-English code-mixed spoken tutorials (not shop talk)                                                              |
| Word error rate   | **25.4%** over all words (shipping int8 build)                                                                         |
| Per clip          | from 0% (2 clips) to 62.5%                                                                                             |
| Language detected | `hi` on all 20 clips                                                                                                   |

The publisher reports 35.21% on the full MUCS test set ([model card](https://huggingface.co/udgamlabs/Shruti));
our 20-clip sample is smaller and scored lower. Word error rate here uses one simple normaliser on
both sides (Unicode NFC, lowercase, punctuation removed), with no transliteration and no number
conversion, so a correct word in a different script counts as an error.

To reproduce:

```
node scripts/fetch-voice-benchmark.mjs          # model (int8) + 20 MUCS clips into .voice-bench/
node scripts/benchmark-voice.mjs --out docs/voice-benchmark-mucs.json
```

Clips are downloaded on demand and never committed (`.voice-bench/` is git-ignored).

## 3. Shop-style utterances (synthetic voice)

Two committed clips in [`tests/fixtures/voice-audio/`](../tests/fixtures/voice-audio/), generated
with the Windows SAPI voice "Microsoft Zira" (no human speaker). They drive the end-to-end voice
tests.

| Clip                      | Spoken                            | Heard                                  |
| ------------------------- | --------------------------------- | -------------------------------------- |
| `order-en-sugar-rice.wav` | two kilo sugar and five kilo rice | two kilo sugar and five kilo rice      |
| `order-en-sugar-milk.wav` | two kilo sugar and one litre milk | two kilo sugar and one **leader** milk |

The second clip shows why the honesty gate matters: "litre" was heard as "leader". The app does not
guess a unit; it asks, and Confirm stays locked (`tests/e2e/voice-mishear.e2e.ts`).

These are two synthetic English clips, not a measure of accuracy on real shopkeepers. Section 6
covers real recordings.

## 4. Speed and memory (desktop)

Machine: Intel Core i7-13700H, Windows 11 x64, Node 24.9.0, onnxruntime-web WASM, **one thread**,
5-beam search, graph optimisation "basic". Same runtime as the browser; a phone will be slower.

|                                          | int8 (shipping)                 | 4-bit          |
| ---------------------------------------- | ------------------------------- | -------------- |
| Download                                 | 52.9 MB                         | 32.1 MB        |
| Model load                               | **9.2 s, 9.5 s**                | 22.6 s, 21.8 s |
| Word error rate, same 20 clips           | 25.4%                           | 25.1%          |
| Mean time per clip (6.3 s average audio) | 1.56 s                          | 0.99 s         |
| Real-time factor                         | 0.25 (4x faster than real time) | 0.16           |

Load times are from two alternating runs each. Accuracy is the same within 0.3 points. Load time
decides it: the int8 build is ready in under half the time, and per-clip speed is well inside what
a counter interaction needs.

Measured but rejected settings: graph optimisation "all" or "extended" transcribed slower than
"basic"; "disabled" made one 8.3 s clip take 37.5 s. More WASM threads did not shorten load time.

## 5. In the browser (end to end)

`tests/e2e/voice-journey.e2e.ts` and `voice-mishear.e2e.ts` run in Chromium against the production
build. A WAV plays through the fake microphone, and the real app records, decodes, transcribes in
the worker, and parses. The model files are served from the local verified copy, so the test needs
no network.

- Spoken order "two kilo sugar and five kilo rice" becomes **2 items found**, all clear.
- With the network off, after a reload, recording again works and makes **zero** model requests.
- Passed 6 of 6 repeated runs.

## 6. Still to measure

| Item                                                               | Status                                               |
| ------------------------------------------------------------------ | ---------------------------------------------------- |
| Mid-range Android phone (load time, speed, memory) in Chrome       | Not run yet                                          |
| Real shopkeeper recordings (Hindi, Hinglish, English) with consent | Not run yet                                          |
| Noisy shop background                                              | Not run yet; the publisher did not test noise either |

To record your own: put 16 kHz mono WAV files and a `references.json`
(`[{ "file": "a.wav", "reference": "do kilo aata" }]`) in a folder outside the repo, then run
`node scripts/benchmark-voice.mjs --clips <folder>`. Never commit identifiable recordings.

## 7. Known limits (from the publisher and our runs)

- About 1 word in 4 is wrong on Hinglish lecture speech. Every transcript is editable, and the
  uncertainty gate flags anything the catalog cannot match.
- Numbers come out as words ("do kilo"); the normalizer turns them into quantities.
- Rare names and brand names may be spelt by sound.
- No punctuation or capitalisation.
- First load after the download takes about 9 seconds on a fast laptop; it happens in the
  background, in a worker, as soon as the capture screen opens.
