# Third-Party Notices

Awaaz Kit is released under the MIT License (see `LICENSE`). It uses the packages and models below, each under its own license. Copyright notices and license texts of included components are preserved with their distributions.

License identifiers were read from the `license` field of each installed package's `package.json` (pnpm store, versions pinned in the workspace `package.json` files and `pnpm-lock.yaml`). Re-verify when a dependency version changes.

## Runtime packages (shipped in app bundles)

| Package         | Version | Use                                               | License      |
| --------------- | ------- | ------------------------------------------------- | ------------ |
| react           | 19.3.1  | UI library                                        | MIT          |
| react-dom       | 19.3.1  | UI renderer                                       | MIT          |
| react-router    | 8.5.1   | Routing                                           | MIT          |
| dexie           | 4.0.11  | IndexedDB wrapper (local-data)                    | Apache-2.0   |
| fuse.js         | 7.1.0   | Fuzzy catalog matching                            | Apache-2.0   |
| zod             | 3.25.76 | Boundary validation                               | MIT          |
| appwrite        | 29.2.0  | Optional cloud sync SDK (single adapter file)     | BSD-3-Clause |
| onnxruntime-web | 1.31.1  | Browser inference runtime (Shruti adapter, spike) | MIT          |
| shruti-onnx     | 0.2.0   | Shruti model loader and decoder (Udgam Labs)      | Apache-2.0   |
| tailwindcss     | 4.3.5   | Styling (compiled CSS)                            | MIT          |
| workbox-window  | 7.4.1   | Service worker registration helper                | MIT          |

## Fonts (bundled)

| Package                          | Version | Use                     | License                             |
| -------------------------------- | ------- | ----------------------- | ----------------------------------- |
| @fontsource/noto-sans            | 5.3.0   | Latin UI text           | OFL-1.1 (SIL Open Font License 1.1) |
| @fontsource/noto-sans-devanagari | 5.3.0   | Hindi / Devanagari text | OFL-1.1 (SIL Open Font License 1.1) |

## Build and development tooling (not shipped to users)

| Package                        | Version                    | License                                                    |
| ------------------------------ | -------------------------- | ---------------------------------------------------------- |
| vite                           | 8.3.8                      | MIT                                                        |
| @vitejs/plugin-react           | 6.3.0                      | MIT                                                        |
| @tailwindcss/vite              | 4.3.5                      | MIT                                                        |
| vite-plugin-pwa                | 2.0.0                      | MIT                                                        |
| workbox-build                  | 7.4.1                      | MIT                                                        |
| typescript                     | 5.9.3 (root), 7.0.2 (apps) | Apache-2.0                                                 |
| @types/react, @types/react-dom | 19.3.0                     | Not re-verified; DefinitelyTyped packages are normally MIT |
| vitest                         | 5.1.0                      | MIT                                                        |
| fast-check                     | 4.10.2                     | MIT                                                        |
| fake-indexeddb                 | 6.2.8                      | Apache-2.0                                                 |
| jsdom                          | 31.0.0                     | MIT                                                        |
| axe-core                       | 4.14.0                     | MPL-2.0 (test-only, not shipped; unmodified)               |
| @playwright/test               | 1.65.0                     | Apache-2.0                                                 |
| @testing-library/dom           | 10.4.2                     | MIT                                                        |
| @testing-library/react         | 16.3.3                     | MIT                                                        |
| @testing-library/jest-dom      | 7.0.1                      | MIT                                                        |
| @testing-library/user-event    | 14.6.10                    | Not re-verified                                            |
| eslint, @eslint/js             | 9.39.5                     | MIT                                                        |
| typescript-eslint              | 8.72.2                     | MIT                                                        |
| eslint-config-prettier         | 10.1.8                     | MIT                                                        |
| prettier                       | 3.10.1                     | MIT                                                        |
| husky                          | 9.1.7                      | MIT                                                        |
| dependency-cruiser             | 18.7.2                     | MIT                                                        |
| globals                        | 17.14.0                    | MIT                                                        |

Transitive dependencies are listed in `pnpm-lock.yaml` and keep their own licenses.

## Models

Model files are not stored in this repository. The user downloads them at runtime into Cache Storage.

| Model                                                                   | Use                                                                                                               | License                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shruti Hindi, int8 ONNX build (`udgamlabs/Shruti-ONNX`, `hi/onnx-int8`) | On-device speech to text (default provider), downloaded by the user at runtime from Hugging Face, SHA-256 checked | Apache-2.0, per the publisher's model card (https://huggingface.co/udgamlabs/Shruti). Shruti is a modified version of Cactus Whistle by Cactus Compute (Apache-2.0). Training data credited by the publisher: AI4Bharat IndicVoices, Shrutilipi, Kathbath, NPTEL and Rural Women ASR; ARTPARK-IISc Vaani; Google FLEURS; MUCS 2021 (CC-BY-4.0; original corpus CC-BY-SA-4.0); Mozilla Common Voice (CC0); LibriSpeech (CC-BY-4.0). The model is not redistributed by this repository. |
| whisper.cpp WASM (tiny)                                                 | Fallback speech to text candidate, not bundled in the current build                                               | whisper.cpp is MIT and OpenAI Whisper weights are MIT (upstream statements, not re-verified here). Verify when the provider is added.                                                                                                                                                                                                                                                                                                                                                 |

The shipping default provider is `shruti`. Until the user downloads the model, typed input and labelled sample chips are the path, and no model is used.

## Test and benchmark data

| Data                                                                | Use                                                                                                     | License                                                                                                     |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| MUCS 2021 Hindi-English test clips (`dianavdavidson/MUCS-Hinglish`) | Voice benchmark (`docs/model-benchmark.md`); downloaded on demand into `.voice-bench/`, never committed | CC-BY-4.0 on the dataset card; original corpus CC-BY-SA-4.0                                                 |
| `tests/fixtures/voice-audio/*.wav`                                  | End-to-end voice tests                                                                                  | Synthetic speech generated for this repository with the Windows SAPI voice Microsoft Zira; no human speaker |
