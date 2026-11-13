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

| Model                              | Use                                                                 | License                                                                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shruti (browser ONNX speech model) | On-device speech to text, downloaded by the user at runtime         | UNCONFIRMED. The license has not been verified from the model source. Confirm it, and the redistribution terms, before release or before enabling Shruti as the default provider. |
| whisper.cpp WASM (tiny)            | Fallback speech to text candidate, not bundled in the current build | whisper.cpp is MIT and OpenAI Whisper weights are MIT (upstream statements, not re-verified here). Verify when the provider is added.                                             |

The shipping default provider is `scripted` (typed input and labelled sample chips), which uses no model.
