# Implementation Plan: Awaaz Kit

## Overview

Implementation language: TypeScript (pnpm monorepo, Vite + React apps, Vitest, fast-check, Playwright).

The plan is ordered to protect the demo from the biggest risk first:

1. Day-1 speech spike, then the typed input and sample-clip fallback, so the product works even if on-device ASR does not.
2. Shared engine packages (pure packages first, then persistence and sync).
3. The two apps (Order Awaaz, Bill Awaaz) on top of the shared packages.
4. Appwrite sync, PWA and offline behavior.
5. Integration and end-to-end tests, CI, Kiro steering and hooks, README and demo assets.

Property tests come from the Correctness Properties in `design.md` (Properties 1 to 41). Each property has its own sub-task, placed next to the code it checks.

## Tasks

- [x] 1. Day-1 speech spike (gate for the provider choice)
  - [x] 1.1 Create the standalone spike harness in `spikes/shruti-bare-vite/`
    - Vite app outside the pnpm workspace packages, loads the Shruti browser model with onnxruntime-web, downloads model files and stores them in Cache Storage
    - Page shows model status and a record button that decodes audio to mono 16 kHz Float32
    - _Requirements: 5.2, 5.5, 5.6_

  - [x] 1.2 Add transcription and metrics to the spike
    - Run transcription on recorded clips and on the 30-clip list (10 Hindi, 10 Hinglish, 10 English retail clips; reference text only, no audio committed)
    - Record first-inference and repeat latency, peak memory, reload-from-cache check and word error rate per group
    - _Requirements: 5.2, 5.6, 5.7, 19.7_

  - [x] 1.3 Write `docs/model-benchmark.md` with results and the go/no-go decision
    - Results table, device and browser used, decision rule from the design (Shruti, then Whisper WASM, then typed plus scripted clips as the primary path)
    - Record the chosen default provider id for task 3.6
    - _Requirements: 5.2, 5.11_

- [x] 2. Workspace scaffold and tooling
  - [x] 2.1 Create the pnpm workspace and TypeScript base
    - `pnpm-workspace.yaml`, root `package.json` with scripts `dev:order`, `dev:bill`, `test`, `test:e2e`, `lint`, `typecheck`, `build`, `test:offline`, `tsconfig.base.json`
    - _Requirements: 1.1, 1.7_

  - [x] 2.2 Scaffold the 12 packages and 2 app folders
    - Create `packages/{voice-capture,speech-provider,language-normalizer,intent-engine,catalog-matcher,confidence-engine,confirmation-engine,local-data,sync-engine,shared-ui,domain-order,domain-billing}` and `apps/{order-awaaz,bill-awaaz}` each with `package.json`, `tsconfig.json`, `src/index.ts`
    - Add Zod as the shared boundary-validation dependency
    - _Requirements: 1.1, 1.2, 8.10_

  - [x] 2.3 Configure ESLint and Prettier
    - `no-console` as error in production code, `no-restricted-imports` for `dexie` in `apps/**` and `packages/shared-ui/**`
    - _Requirements: 15.3, 15.10_

  - [x] 2.4 Add dependency-cruiser rules from the design dependency table
    - `.dependency-cruiser.cjs` forbids engine packages importing `domain-*`, `voice-capture` importing any workspace package, `shared-ui` importing `local-data`, and circular dependencies; wire into `pnpm lint`
    - _Requirements: 1.5, 4.9, 15.3_

  - [x] 2.5 Add license, notices and repository hygiene files
    - OSI-approved `LICENSE`, initial `THIRD_PARTY_NOTICES.md`, `.gitignore` that does not list `.kiro`, `.env.example` with only `VITE_APPWRITE_ENDPOINT` and `VITE_APPWRITE_PROJECT_ID`
    - _Requirements: 1.9, 18.4, 18.6, 20.1_

  - [x] 2.6 Set up Vitest, fast-check, fake-indexeddb and Testing Library
    - Workspace Vitest config, shared setup file, fast-check default `numRuns: 100` helper, tag-comment convention `// Feature: awaaz-kit, Property N: ...`
    - _Requirements: 19.1, 19.2_

  - [x]* 2.7 Write structure checks
    - Test that `apps/` has exactly two folders, all 12 packages exist, `LICENSE` and `THIRD_PARTY_NOTICES.md` exist and `.kiro` is not git-ignored
    - _Requirements: 1.1, 1.2, 1.9, 20.1_

- [x] 3. Speech provider with typed and sample-clip fallback
  - [x] 3.1 Define STT_Provider contracts and the confidence display helper
    - `SpeechToTextProvider`, `ModelStatus`, `ModelManager` types with Zod schemas, `formatConfidence(result)` returning a number string only when `confidence` is present
    - _Requirements: 5.1, 5.3, 5.11_

  - [x]* 3.2 Write property test for confidence display
    - **Property 16: Numeric confidence is displayed only when provided**
    - **Validates: Requirements 5.11, 10.9**

  - [x] 3.3 Implement `ScriptedProvider`, provider registry and sample utterances
    - `createProvider(id, deps)` for `shruti | whisper-wasm | scripted`, fixture clip ids mapped to fixed transcripts, `samples.ts` exporting labelled sample utterances (including "do kilo aata, ek litre tel aur paanch kilo chawal")
    - Env-selectable provider so tests and demo run without a microphone or model
    - _Requirements: 5.1, 5.3, 6.1, 6.2_

  - [x] 3.4 Implement `ModelManager`
    - Streamed download with progress and abort, SHA-256 check against `model-manifest.json`, Cache Storage cache `awaaz-speech-model-v1`, `status()` detecting missing or evicted files, `remove()`
    - Only `download` touches the network, only after a user action
    - _Requirements: 5.4, 5.5, 5.6, 5.7, 5.8, 4.10_

  - [x]* 3.5 Write unit tests for `ModelManager`
    - Fake `fetch` and `caches`: progress events, hash mismatch deletes partial files, eviction detected, no network call without `download`
    - _Requirements: 5.5, 5.7, 5.8_

  - [x] 3.6 Implement the real provider adapter chosen by the spike
    - Shruti adapter (or Whisper WASM adapter per `docs/model-benchmark.md`) running in a Web Worker, audio decode and resample inside the adapter, 30 s timeout with a typed failure reason, `confidence` left unset
    - _Requirements: 5.2, 5.6, 5.9, 5.10, 5.12_

- [x] 4. Voice capture package
  - [x] 4.1 Implement `createVoiceCapture` and the Recording_State reducer
    - Permission requested only inside `start()`, elapsed timer with injected clock, `stop()`, `retry()`, `discard()`, typed `CaptureError`, audio kept only in a closure, no storage or network calls
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10_

  - [x]* 4.2 Write property test for the capture state machine
    - **Property 32: Capture state machine is legal and discards audio**
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8**

  - [x]* 4.3 Write unit tests for capture errors
    - Permission denied, no device, unsupported `MediaRecorder`, permission not requested on construction
    - _Requirements: 4.1, 4.6, 4.7_

- [x] 5. Language normalizer package
  - [x] 5.1 Build number, fraction, digit and unit tables
    - Hindi (Devanagari and romanized), Hinglish and English number words 0 to 100, `aadha`, `dedh`, `dhai`, `sava`, `paun`, half, quarter, Devanagari digits, unit spellings to `piece | kg | g | litre | ml`, phonetic fold table
    - _Requirements: 7.2, 7.3, 7.4, 7.5_

  - [x] 5.2 Implement `normalize` and `foldForMatching`
    - Token output with source spans, milli-unit numbers, canonical units, whitespace and punctuation cleanup, unknown tokens preserved, raw never mutated, output a fixed point of the rules
    - _Requirements: 7.1, 7.5, 7.6, 7.7, 7.8, 7.9_

  - [x]* 5.3 Write property test for idempotence and raw preservation
    - **Property 1: Normalization is idempotent and preserves the raw transcript**
    - **Validates: Requirements 7.8, 7.9**

  - [x]* 5.4 Write property test for span mapping
    - **Property 2: Normalizer spans map back to the raw transcript**
    - **Validates: Requirements 7.1**

  - [x]* 5.5 Write property test for equivalent spellings
    - **Property 3: Equivalent number and unit spellings normalize identically**
    - **Validates: Requirements 7.2, 7.3, 7.4**

  - [x]* 5.6 Write property test for unknown tokens
    - **Property 4: Unknown tokens are preserved**
    - **Validates: Requirements 7.5, 7.6, 7.7**

  - [x]* 5.7 Write unit tests for number and unit parsing
    - `dedh kilo` = 1500, `sava kilo` = 1250, `paun kilo` = 750, `do kilo aata` equals `2 kg atta`, Devanagari digits
    - _Requirements: 7.2, 7.3, 7.4_

- [x] 6. Catalog matcher package
  - [x] 6.1 Implement `CatalogProduct` and `buildIndex` exact lookup
    - Filter to active shop, `active`, non-deleted; folded name and alias map; `exact` and `unmatched` results
    - _Requirements: 9.1, 9.2, 9.5, 9.6, 9.7, 9.8_

  - [x] 6.2 Add fuzzy suggestions and ambiguity handling
    - Fuse.js index, up to three suggestions with unit and brand, `ambiguous` for shared aliases or near-equal scores, never auto-pick
    - _Requirements: 9.3, 9.4, 9.5_

  - [x]* 6.3 Write property test for alias exactness
    - **Property 9: Catalog aliases match their product exactly**
    - **Validates: Requirements 9.1, 9.2, 9.8**

  - [x]* 6.4 Write property test for catalog filtering
    - **Property 10: Matcher ignores inactive, deleted and foreign-shop products**
    - **Validates: Requirements 9.6, 9.7**

  - [x]* 6.5 Write property test for ambiguity
    - **Property 11: Ambiguity is never silently resolved**
    - **Validates: Requirements 9.3, 9.4**

  - [x]* 6.6 Write unit tests for matching examples
    - Hindi, Hinglish and English aliases, brand disambiguation ("Amul" with two products), unmatched phrase
    - _Requirements: 9.1, 9.3, 9.4, 9.5_

- [x] 7. Intent engine package
  - [x] 7.1 Define extraction types and Zod schemas
    - `CandidateLine`, `ExtractionResult`, `ExtractionContext`, `ExtractedField` shapes with `sourceText`
    - _Requirements: 8.1, 8.7, 8.10_

  - [x] 7.2 Implement item segmentation and slot binding
    - Split on `aur`, `and`, `,`, `।`, `plus`; bind `(number)? (unit)? (phrase)` in either order; missing quantity yields `value: null`; empty list for no recognizable item; no I/O, clock or random
    - _Requirements: 8.1, 8.3, 8.4, 8.5, 8.6, 8.8_

  - [x] 7.3 Extract customer name and phone
    - Lead phrases ("Ramesh ka bill banao", "for Ramesh") and 10-digit Indian mobile pattern
    - _Requirements: 8.2, 8.7_

  - [x]* 7.4 Write property test for item count and order
    - **Property 6: Extraction preserves item count, order and values**
    - **Validates: Requirements 8.1, 8.6**

  - [x]* 7.5 Write property test for source text and customer fields
    - **Property 7: Extracted fields carry source text and optional customer fields**
    - **Validates: Requirements 8.2, 8.7**

  - [x]* 7.6 Write unit tests for extraction edge cases
    - Reordered phrases ("aata do kilo"), missing quantity, empty utterance, mixed separators
    - _Requirements: 8.1, 8.6, 8.8_

- [x] 8. Confidence engine package
  - [x] 8.1 Implement `resolveLines` with the status table
    - Missing quantity never defaults to 1, absent or mismatched unit is `needs_review` with no conversion, `unmatched` and candidate handling (max 3), exact match with explicit quantity and consistent unit is `confirmed`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 8.2 Implement `applyUserValue` and `nextClarification`
    - User value sets `confirmed` and touches only that field; one clarification (with prompt text) for the first unresolved field in line order
    - _Requirements: 10.6, 10.7_

  - [x]* 8.3 Write property test for status rules
    - **Property 12: Field statuses follow the uncertainty rules**
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5**

  - [x]* 8.4 Write property test for user-supplied values
    - **Property 13: A user-supplied value confirms the field**
    - **Validates: Requirements 10.6**

  - [x]* 8.5 Write property test for clarification order
    - **Property 14: Exactly one clarification at a time**
    - **Validates: Requirements 10.7**

  - [x]* 8.6 Write unit tests for the status table
    - One example per row of the design status table
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 9. Checkpoint - Engine packages
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Confirmation engine package
  - [x] 10.1 Define `WorkflowAdapter`, `WorkflowContext`, `ValidationIssue` and `buildReview`
    - Interfaces per the design, `canConfirm` semantics, `ReviewPayload`
    - _Requirements: 11.1, 11.3, 11.4, 8.10_

  - [x] 10.2 Implement `ConfirmedAction` brand, `UserConfirmationEvidence` and `confirm`
    - Throws `NotConfirmableError` when `canConfirm` is false or evidence is missing, evidence requires a trusted click event
    - _Requirements: 11.5, 11.6, 11.7_

  - [x]* 10.3 Write property test for the confirmation boundary
    - **Property 19: Persistence requires explicit user confirmation**
    - **Validates: Requirements 11.5, 11.7**

- [x] 11. Local data package
  - [x] 11.1 Define the Dexie v1 schema, record types, Zod schemas and bundle types
    - Ten stores per the design, `OrderBundle`, `BillBundle`, `CorrectionBundle`, `Mutation`, client UUIDs, versioned `db.version(1)`
    - _Requirements: 15.1, 15.2, 15.4, 6.6_

  - [x] 11.2 Implement `openDb` and error mapping
    - `LocalDataError` kinds `quota_exceeded`, `open_failed`, `blocked_upgrade`; `versionchange` closes the connection
    - _Requirements: 2.5, 15.4_

  - [x] 11.3 Implement repositories with live queries
    - shops, products, customers, orders, bills, outbox, syncMeta, audit; no update method for finalized bills
    - _Requirements: 15.3, 12.9, 13.15_

  - [x] 11.4 Implement `commitConfirmed`
    - Single transaction: counters on `shops`, order or bill rows, items with snapshots, audit event, Mutation; returns `already_exists` for a repeated draft id; rolls back fully on error; accepts only `ConfirmedAction`
    - _Requirements: 15.5, 15.6, 11.8, 12.8, 12.10, 13.9, 13.10_

  - [x] 11.5 Enforce finalized-bill immutability and correction commits
    - Dexie `updating` hook rejects writes to finalized rows; `CorrectionBundle` creates a `void` or `correction` row with `correctsBillId`
    - _Requirements: 13.13, 13.14, 16.14_

  - [x] 11.6 Implement the redacting logger
    - `createLogger()` redacts `transcript`, `rawTranscript`, `normalizedText`, `phone`, `customerPhone`, `note`, `payload` and 10-digit phone patterns
    - _Requirements: 15.10_

  - [x] 11.7 Add the Demo_Shop seed and `resetDemoShop`
    - `demo-shop.json` with fixed UUIDs, "Sharma Kirana (Demo)", 24 products with Hindi, Hinglish and English aliases, 5 sample customers, fictional labels; reset upserts seed and soft-deletes non-seed demo products
    - _Requirements: 3.3, 3.4, 3.9_

  - [x] 11.8 Implement admin, onboarding and settings repositories
    - `exportAll`, `clearAll`, create local shop with INR, `syncMeta` helpers (`deviceId`, `activeShopId`, `syncOptIn`, `syncTranscripts` default disabled, `persistentStorage`), persistent-storage request helper
    - _Requirements: 2.3, 2.4, 3.5, 3.6, 3.7, 3.8, 15.9, 16.20_

  - [x]* 11.9 Write property test for persistence round trip
    - **Property 27: Local persistence round trip**
    - **Validates: Requirements 15.2, 15.8, 12.11, 13.16**

  - [x]* 11.10 Write property test for atomic commit
    - **Property 28: Confirmation commits atomically**
    - **Validates: Requirements 15.5, 15.6**

  - [x]* 11.11 Write property test for repeated confirmation
    - **Property 21: Confirming the same draft repeatedly creates one record**
    - **Validates: Requirements 11.8**

  - [x]* 11.12 Write property test for finalized bill immutability
    - **Property 29: Finalized bills are immutable and corrections are separate**
    - **Validates: Requirements 13.13, 13.14, 16.14**

  - [x]* 11.13 Write property test for log redaction
    - **Property 30: Logging redacts sensitive content**
    - **Validates: Requirements 15.10**

  - [x]* 11.14 Write property test for demo reset
    - **Property 33: Demo reset restores the seed**
    - **Validates: Requirements 3.9**

  - [x]* 11.15 Write migration and local-only unit tests
    - Open a v1 fixture database and upgrade; records stay `local_only` before sign-in; both apps read the same catalog
    - _Requirements: 15.4, 3.7, 3.8_

- [x] 12. Billing domain package
  - [x] 12.1 Implement `money.ts`
    - `lineTotalPaise` with BigInt multiply-divide and half-up rounding, `computeTotals`, `formatRupees` and its parser, safe-integer guards returning validation issues
    - _Requirements: 13.7, 14.1, 14.2, 14.3, 14.4, 14.5, 14.7_

  - [x]* 12.2 Write property test for bill arithmetic
    - **Property 24: Bill arithmetic is exact and consistent**
    - **Validates: Requirements 13.7, 14.1, 14.2, 14.3, 14.4, 14.5, 14.8**

  - [x]* 12.3 Write property test for rupee formatting
    - **Property 26: Rupee display round-trips the paise value**
    - **Validates: Requirements 14.7**

  - [x] 12.4 Implement `BillDraft` and `BillingWorkflowAdapter`
    - `parse` using the shared pipeline, catalog price on matched lines, missing price blocks `canConfirm`, discount-over-subtotal issue, `toBundle` producing `BillBundle` with snapshots and `status: "finalized"`
    - _Requirements: 13.4, 13.5, 13.10, 14.6, 11.3, 11.4_

  - [x] 12.5 Implement draft editing operations
    - Edit product, quantity, unit, price, discount; add and remove lines; recompute totals and validity
    - _Requirements: 13.6, 14.8, 10.11_

  - [x]* 12.6 Write property test for excess discount
    - **Property 25: Excess discount blocks finalization**
    - **Validates: Requirements 14.6**

  - [x]* 12.7 Write billing unit tests
    - Three typed items, edited quantity, recomputed total; tax shown only when configured
    - _Requirements: 13.8, 13.16, 14.8_

- [x] 13. Order domain package
  - [x] 13.1 Implement `OrderDraft` and `OrderWorkflowAdapter`
    - `parse` using the shared pipeline, catalog price snapshot on matched lines, customer or walk-in, validation issues for unresolved product, quantity or unit
    - _Requirements: 12.3, 12.4, 12.7, 11.3, 11.4_

  - [x] 13.2 Implement order draft editing and `toBundle`
    - Delivery or pickup, note, estimated total, line removal, `OrderBundle` with name and unit price snapshots and human-readable local number request
    - _Requirements: 12.6, 12.8, 12.10, 10.11_

  - [x]* 13.3 Write the fixture example test
    - "do kilo aata, ek litre tel aur paanch kilo chawal" yields wheat flour 2 kg, cooking oil 1 litre, rice 5 kg against the Demo_Shop
    - _Requirements: 12.5_

- [x] 14. Cross-package property tests
  - [x]* 14.1 Create shared arbitraries in `tests/property/arbitraries/`
    - Catalog, multilingual utterance templates, drafts, bills, fault plans, mutation lists
    - _Requirements: 19.2_

  - [x]* 14.2 Write property test for pipeline determinism
    - **Property 5: Extraction is deterministic and depends only on the text**
    - **Validates: Requirements 8.5, 6.4**

  - [x]* 14.3 Write property test for adapter output schema
    - **Property 8: Adapter output satisfies the draft schema**
    - **Validates: Requirements 8.10**

  - [x]* 14.4 Write property test for the confirmation gate
    - **Property 17: The confirmation gate matches draft validity**
    - **Validates: Requirements 11.3, 11.4, 12.7, 13.5**

  - [x]* 14.5 Write property test for line removal
    - **Property 18: Removing a line equals never having it**
    - **Validates: Requirements 10.11**

  - [x]* 14.6 Write property test for shared pipeline output
    - **Property 22: Both workflows consume the same shared pipeline output**
    - **Validates: Requirements 1.6**

  - [x]* 14.7 Write property test for read-only pipeline stages
    - **Property 20: Recording, transcription and parsing write nothing**
    - **Validates: Requirements 11.6**

  - [x]* 14.8 Write property test for price snapshots
    - **Property 23: Price snapshots follow the catalog at parse time and never change afterwards**
    - **Validates: Requirements 12.4, 12.10, 13.4, 13.10, 15.7**

- [x] 15. Checkpoint - Domain and persistence
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Voice corpus
  - [x] 16.1 Author `tests/fixtures/voice-corpus/corpus.json`
    - At least 30 text-only entries across Hindi, Hinglish, English, code-switching, brand names, quantity words and deliberate ambiguity, each with reference transcript, `app` route and expected structured result; `seededUncertainty` on ambiguity entries; no speaker recordings
    - _Requirements: 19.6, 19.7_

  - [x]* 16.2 Implement the corpus runner and report
    - Routing at least 95 percent, complete exact extraction at least 85 percent, 100 percent of seeded uncertainty flagged; write `docs/corpus-report.md` during `pnpm test`
    - _Requirements: 19.8, 19.9, 10.10_

  - [x]* 16.3 Write property test for seeded uncertainty
    - **Property 15: Seeded ambiguous and unmatched fixtures are never confirmed**
    - **Validates: Requirements 10.10**

  - [x]* 16.4 Write parser-to-review integration test
    - Corpus utterances through both adapters to `ReviewPayload`
    - _Requirements: 19.4, 12.5_

- [x] 17. Sync engine package
  - [x] 17.1 Define sync contracts and row ID derivation
    - `SyncRemote`, `SyncError`, `RemoteTable`, `RowPermissions`, UUIDv5 helpers `headerRowId` and `itemRowId` (create-once entities), entity-ID rows for products and customers
    - _Requirements: 16.3, 16.4_

  - [x] 17.2 Implement `toRemoteRow`, remote Zod schemas and permission builder
    - Pure function applying `syncTranscripts` (off by default, omits `rawTranscript` and `normalizedText`), team-scoped permissions, read-only permissions for bills and bill items
    - _Requirements: 16.15, 16.19, 16.20, 18.2_

  - [x] 17.3 Implement `InMemoryRemote`
    - Same uniqueness (409 as `already_exists`), guarded upsert and permission semantics as the Appwrite schema
    - _Requirements: 16.4, 19.11_

  - [x] 17.4 Implement the push algorithm
    - Batches of 10 in creation order, child rows before header, success marks Mutation and record `synced` in one transaction, failures keep the Mutation with `attempts + 1`, `lastError` and jittered exponential backoff (base 2 s, cap 5 min), `failed` for validation or permission errors
    - _Requirements: 16.1, 16.2, 16.4, 16.5, 16.6_

  - [x] 17.5 Implement pull, cursors, conflicts and last-write-wins
    - Per-table cursor in `syncMeta` written after a page applies, Zod validation of remote rows, catalog LWW with `deviceId` tie-break, local order kept with `conflict` state, finalized bills never overwritten, remote corrections inserted
    - _Requirements: 16.11, 16.12, 16.13, 16.14_

  - [x] 17.6 Implement `createSyncEngine` wiring
    - Opt-in, sign-in and online gating, triggers (launch, online, visibility, post-commit, 30 s interval, Sync Now), coalesced runs, status observable, optional Background Sync registration, auth-paused state
    - _Requirements: 16.1, 16.2, 16.7, 16.8, 16.9, 16.10, 18.3_

  - [x]* 17.7 Write property test for row IDs
    - **Property 34: Remote row IDs are deterministic and valid**
    - **Validates: Requirements 16.3**

  - [x]* 17.8 Write property test for transcript exclusion
    - **Property 41: Transcripts are excluded from remote rows unless enabled**
    - **Validates: Requirements 16.19, 16.20**

  - [x]* 17.9 Write property test for duplicate deliveries
    - **Property 35: Duplicate deliveries leave one remote entity per Mutation**
    - **Validates: Requirements 16.4, 16.18**

  - [x]* 17.10 Write property test for sync gating
    - **Property 36: Nothing leaves the device without opt-in, sign-in and connectivity**
    - **Validates: Requirements 16.1, 16.2, 18.2, 18.3**

  - [x]* 17.11 Write property test for push outcomes and backoff
    - **Property 37: Push outcomes update state and backoff correctly**
    - **Validates: Requirements 16.5, 16.6**

  - [x]* 17.12 Write property test for pull cursors
    - **Property 38: Pull cursors are monotonic and resumable**
    - **Validates: Requirements 16.11**

  - [x]* 17.13 Write property test for catalog convergence
    - **Property 39: Catalog last-write-wins converges in any order**
    - **Validates: Requirements 16.13**

  - [x]* 17.14 Write property test for order conflicts
    - **Property 40: A newer remote order never overwrites the local order**
    - **Validates: Requirements 16.12**

  - [x]* 17.15 Write the shared `SyncRemote` contract test suite
    - Runs against `InMemoryRemote`; parametrized so task 22.6 can run it against Appwrite
    - _Requirements: 16.4, 19.11_

- [x] 18. Checkpoint - Sync engine and corpus
  - Ensure all tests pass, ask the user if questions arise.

- [x] 19. Shared UI package
  - [x] 19.1 Set up Tailwind, `tokens.css`, fonts and the component barrel
    - Self-hosted Noto Sans and Noto Sans Devanagari, app accent tokens, `prefers-reduced-motion` handling, 44px touch targets, visible focus, barrel `index.ts` exporting all planned component modules as stubs so later tasks edit separate files
    - _Requirements: 17.2, 17.5, 17.6, 17.8, 17.10_

  - [x] 19.2 Implement the `CaptureSession` reducer and hook
    - Layers `transcribing | ready | failed` over Recording_State, keeps Raw_Transcript separate from the editable Transcript, blank transcript yields retry and typed-entry state with no draft, re-parse on edit
    - _Requirements: 5.9, 5.10, 5.12, 6.2, 6.4, 6.5, 6.6_

  - [x] 19.3 Implement `MicButton`
    - Start, Stop, Retry states, accessible name, `aria-live` status, elapsed timer, permission and device error messages offering typed input
    - _Requirements: 4.3, 4.6, 4.7, 17.3, 17.4_

  - [x] 19.4 Implement `TranscriptEditor` and `SampleUtteranceChips`
    - Typed input always available, editable transcript above results, Raw_Transcript diff link, chips labelled "Sample"
    - _Requirements: 6.1, 6.3, 5.12, 17.7_

  - [x] 19.5 Implement `ModelStatusCard`
    - Approximate download size, Download model, progress, Continue with typing, evicted state, failure reason
    - _Requirements: 5.4, 5.5, 5.7, 5.8, 5.9_

  - [x] 19.6 Implement `UncertaintyBadge` and `ClarificationPrompt`
    - Icon plus text per Field_Status, "Not in catalog", up to three candidate buttons, one prompt at a time
    - _Requirements: 10.4, 10.5, 10.7, 10.8, 17.9_

  - [x] 19.7 Implement `LineEditor`
    - Product, quantity, unit, price, remove line, labelled fields
    - _Requirements: 10.11, 13.6, 17.4_

  - [x] 19.8 Implement `ReviewCard` and `ConfirmButton`
    - Full draft view, confirm disabled with reason while not confirmable, disabled while pending, produces `UserConfirmationEvidence` from a trusted click
    - _Requirements: 11.2, 11.3, 11.4, 11.5, 11.8, 12.6_

  - [x] 19.9 Implement `OnlineIndicator`, `SyncBadge` and `StorageBanner`
    - Updates on connectivity events without reload, Offline, Local only, Pending (n), Syncing, Synced, Failed, Conflict text plus icon, Sync Now, storage denied, quota and open errors with Retry, "Reload to update" banner
    - _Requirements: 2.4, 2.5, 2.6, 2.7, 16.9, 16.10, 17.9_

  - [x] 19.10 Implement `PipelineInspector`
    - Raw, Normalized with span highlights, Candidates, Matches, Field_Status
    - _Requirements: 6.6, 8.7_

  - [x] 19.11 Implement the `Onboarding` flow
    - Demo_Shop or local shop name, local-storage explanation, fictional labelling, model status
    - _Requirements: 3.1, 3.2, 3.4, 3.5_

  - [x] 19.12 Implement `SyncSettings` panel
    - Explicit opt-in, sign-in form via callbacks, plain-language "what syncs" text, "Sync transcripts" toggle off by default, local data export and clear controls
    - _Requirements: 15.9, 16.20, 18.3_

  - [x]* 19.13 Write property test for blank transcripts
    - **Property 31: Blank transcripts create nothing**
    - **Validates: Requirements 6.5**

  - [x]* 19.14 Write component tests for microphone states
    - Idle, requesting, recording, stopped, error; accessible names and status announcements
    - _Requirements: 4.2, 17.3, 17.4_

  - [x]* 19.15 Write component tests for transcript editing and ambiguity prompts
    - Edit re-parses, candidate selection confirms the field, "Not in catalog" label
    - _Requirements: 6.4, 10.4, 10.5, 10.6_

  - [x]* 19.16 Write component tests for confirm button states
    - Disabled with no lines, disabled with unresolved fields, enabled when confirmable, single activation
    - _Requirements: 11.3, 11.4, 11.8_

  - [x]* 19.17 Write component tests for sync status display
    - All SyncBadge states show text plus icon, pending count, online indicator updates
    - _Requirements: 2.7, 16.10_

  - [x]* 19.18 Write accessibility checks
    - `axe-core` on shared components, focus visibility, reduced motion, 360px layout
    - _Requirements: 17.1, 17.4, 17.5, 17.8, 17.9_

- [x] 20. Order Awaaz app
  - [x] 20.1 Scaffold the Order_App
    - Vite + React + Router with `basename = import.meta.env.BASE_URL`, all routes (`/`, `/capture`, `/resolve`, `/review`, `/orders`, `/orders/:id`, `/catalog`, `/about`) declared up front with lazy screen stubs, providers for db, repositories, speech provider and capture session, saffron theme, app-local data hooks
    - _Requirements: 1.3, 12.1, 3.8_

  - [x] 20.2 Build the Home screen
    - New Order, recent orders, Online_Indicator, pending sync count, Demo_Shop badge, first-run onboarding
    - _Requirements: 12.2, 2.6, 3.1, 3.4_

  - [x] 20.3 Build the Capture screen
    - Customer select or Walk-in, MicButton, typed input, sample chips, model status card, editable transcript, submit to `OrderWorkflowAdapter.parse`
    - _Requirements: 12.3, 6.1, 6.2, 6.3, 5.4_

  - [x] 20.4 Build the Resolve screen
    - Clarification prompts one at a time, candidate chips, line editor, remove line, field status badges
    - _Requirements: 10.5, 10.7, 10.8, 10.11, 12.7_

  - [x] 20.5 Build the Review screen and confirm flow
    - Customer, items, quantities, units, prices, delivery or pickup, note, estimated total, Confirm through `confirm()` and `commitConfirmed`, "Saved on this device", save-error display
    - _Requirements: 12.6, 12.8, 11.2, 15.6_

  - [x] 20.6 Build the Orders list and detail screens
    - Search, status and Sync_State filters, detail view with snapshots, order persisted across reload
    - _Requirements: 12.9, 12.10, 12.11_

  - [x] 20.7 Build the read-only Catalog screen
    - Products, aliases, price, unit, availability from the shared Catalog
    - _Requirements: 12.12, 3.8_

  - [x] 20.8 Build the About screen
    - Pipeline inspector toggle, Reset demo, local data export and clear, "what syncs" explanation, build-time package manifest list
    - _Requirements: 3.9, 15.9, 1.3_

  - [x]* 20.9 Write Order_App screen tests
    - Capture to resolve to review with Testing Library using `ScriptedProvider`
    - _Requirements: 12.4, 12.7, 12.8_

- [x] 21. Bill Awaaz app
  - [x] 21.1 Scaffold the Bill_App
    - Same structure as 20.1 with routes `/`, `/capture`, `/lines`, `/review`, `/finalize/:id`, `/bills`, `/bills/:id`, `/about` declared up front, teal theme
    - _Requirements: 1.4, 13.1, 3.8_

  - [x] 21.2 Build the Home screen
    - New Bill, recent bills, today's finalized total for the Demo_Shop, Online_Indicator, pending sync count, onboarding
    - _Requirements: 13.2, 2.6, 3.1_

  - [x] 21.3 Build the Capture screen
    - Optional customer, MicButton, typed input, sample chips, model status card, editable transcript, submit to `BillingWorkflowAdapter.parse`
    - _Requirements: 13.3, 6.1, 6.2, 6.3_

  - [x] 21.4 Build the Line editor screen
    - Edit product, quantity, unit, price, discount, add and remove lines, manual price entry for unpriced lines, live totals
    - _Requirements: 13.5, 13.6, 14.8_

  - [x] 21.5 Build the Review screen
    - Items, quantity, unit price, line total, discount, subtotal, final total, tax only when configured, validation issues listed above the Finalize control
    - _Requirements: 13.8, 14.6, 11.3_

  - [x] 21.6 Build the Finalize screen and receipt
    - Finalize through `confirm()` and `commitConfirmed`, receipt number, receipt preview titled "Cash memo / receipt" with no GST claims, print, share and copy actions, print stylesheet
    - _Requirements: 13.9, 13.11, 13.12, 13.13_

  - [x] 21.7 Build the Bills list and detail screens
    - Search, filter, reopen receipt, print again, Sync_State, create correction or void linked to the original
    - _Requirements: 13.14, 13.15, 13.16_

  - [x] 21.8 Build the About screen
    - Same panels as 20.8 with Bill_App accent
    - _Requirements: 3.9, 15.9, 1.4_

  - [x]* 21.9 Write Bill_App screen tests
    - Three items, edit quantity, finalize, receipt label, finalized bill not editable
    - _Requirements: 13.13, 13.16_

- [x] 22. Appwrite sync backend and app wiring
  - [x] 22.1 Implement `AppwriteRemote`
    - Only file importing the `appwrite` SDK, email/password session, team-per-shop `ensureShopTeam`, `createOnce` mapping HTTP 409 to `already_exists`, `upsertGuarded`, `pull`; confirm the TablesDB or Databases call surface during implementation
    - _Requirements: 16.1, 16.3, 16.4, 16.16, 18.4, 18.5_

  - [x] 22.2 Add versioned Appwrite definitions and the setup script
    - `appwrite/appwrite.json` with tables `products`, `customers`, `orders`, `order_items`, `bills`, `bill_items`, row security on, unique `mutationId` index, `(shopId, $updatedAt)` indexes, optional `rawTranscript` and `normalizedText`; `appwrite/setup.mjs` reading the API key from the developer environment only
    - _Requirements: 16.15, 16.17, 16.16, 16.19_

  - [x] 22.3 Wire sync into the Order_App
    - Sync provider with `createSyncEngine` and `AppwriteRemote`, `SyncBadge` and Sync Now on Home, `SyncSettings` on About, sync report display
    - _Requirements: 16.9, 16.10, 18.3, 3.7_

  - [x] 22.4 Wire sync into the Bill_App
    - Same wiring as 22.3, corrections synced as separate events
    - _Requirements: 16.9, 16.10, 16.14, 18.3_

  - [x] 22.5 Provide a local test backend
    - `docker-compose.test.yml` for self-hosted Appwrite plus `scripts/seed-test-backend.mjs` reusing `appwrite/setup.mjs`; documents environment variables
    - _Requirements: 19.4, 19.11_

  - [ ]* 22.6 Run the `SyncRemote` contract suite against Appwrite
    - Skipped with a visible message when environment variables are absent
    - _Requirements: 16.4, 19.11_

  - [x]* 22.7 Write the Appwrite isolation test
    - `tests/integration/appwrite-isolation.test.ts`: two users, two shop teams, cross-read and cross-get denied
    - _Requirements: 16.15, 19.13_

- [x] 23. PWA, offline and hosting
  - [x] 23.1 Configure PWA for the Order_App
    - Shared PWA config helper, manifest (scope `/order/`), icons, Workbox precache with `navigateFallback`, precached fonts, Speech_Model files excluded from precache
    - _Requirements: 2.1, 2.2, 17.6_

  - [x] 23.2 Configure PWA for the Bill_App
    - Same as 23.1 with scope `/bill/`
    - _Requirements: 2.1, 2.2, 17.6_

  - [x] 23.3 Wire app-start storage handling in both apps
    - Persistent storage request, `StorageBanner` for denial, quota and open errors with Retry, Dexie `versionchange` "Reload to update" banner, Online_Indicator wiring
    - _Requirements: 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 23.4 Add the Background Sync service worker handler in both apps
    - `awaaz-sync` tag registered where supported, handler posts to an open client or runs the engine from IndexedDB, correctness independent of it
    - _Requirements: 16.8_

  - [x] 23.5 Add `scripts/build-hub.mjs` and combined build output
    - Static hub page with cards for `/order/` and `/bill/`, combined `dist/` layout, root `build` script
    - _Requirements: 1.7, 2.1_

- [x] 24. Reuse proof
  - [x] 24.1 Implement `scripts/reuse-report.mjs`
    - dependency-cruiser JSON to `docs/reuse-proof.md`, fails when either app lacks an import of any of the ten required capabilities
    - _Requirements: 1.3, 1.4_

  - [x] 24.2 Add the build-time package manifest to About screens
    - "Powered by Awaaz Kit" panel listing shared packages and versions in both apps
    - _Requirements: 1.3, 1.4_

  - [x]* 24.3 Write the dual-parse reuse test
    - `tests/integration/reuse.test.ts` runs the same utterances through both adapters and asserts the shared `ResolvedLine[]`
    - _Requirements: 1.6_

  - [x] 24.4 Add the "Build your own workflow" example source
    - 40-line `AppointmentWorkflowAdapter` under `examples/appointment-workflow/` reusing the pipeline without copying engine code
    - _Requirements: 1.8_

  - [x]* 24.5 Write the README example compile test
    - `tests/integration/readme-example.test.ts` type-checks and runs the example
    - _Requirements: 1.8_

- [x] 25. Integration and end-to-end tests
  - [x] 25.1 Configure Playwright and fixtures
    - Chromium project, preview server for the combined build, `ScriptedProvider` selected by env, offline helpers, root `test:e2e` and `test:offline` scripts
    - _Requirements: 19.5, 1.7_

  - [x]* 25.2 Write confirm-to-save integration tests
    - IndexedDB transaction with Outbox against `fake-indexeddb`, parser-to-review across the real packages
    - _Requirements: 19.4, 15.5_

  - [x]* 25.3 Write offline and sync integration tests
    - Save then reload retains 100 percent of records, push and pull against `InMemoryRemote`, duplicate Mutation yields one remote entity
    - _Requirements: 19.4, 19.10, 19.11_

  - [x]* 25.4 Write the Order journey E2E
    - Onboarding with Demo_Shop, sample order, correct a field, confirm, reload, order visible
    - _Requirements: 12.5, 12.8, 12.11, 19.5_

  - [x]* 25.5 Write the Bill journey E2E
    - Three items, quantity edit, finalize, print preview via `emulateMedia({ media: "print" })`, reload
    - _Requirements: 13.9, 13.11, 13.16, 19.5_

  - [x]* 25.6 Write the offline journey E2E
    - Load once online, `setOffline(true)`, create an order and a bill, reload, both remain
    - _Requirements: 2.2, 19.10, 19.5_

  - [ ]* 25.7 Write the sync journey E2E
    - Opt in and sign in against the local test backend, Sync Now, one remote row per record, replayed Mutation still one row
    - _Requirements: 16.1, 16.4, 19.11, 19.5_

  - [x]* 25.8 Write the safety journey E2E
    - Sample submit alone creates no record, Confirm disabled until required fields are confirmed
    - _Requirements: 11.3, 11.6_

  - [x]* 25.9 Write the reuse journey E2E
    - About screens of both apps list the same shared packages
    - _Requirements: 1.3, 1.4_

  - [x]* 25.10 Write the built-bundle secret scan
    - Fails when a built bundle contains an Appwrite API key name or value, or any config beyond endpoint and project ID
    - _Requirements: 16.16, 18.4_

- [x] 26. Continuous integration
  - [x] 26.1 Add the main GitHub Actions workflow
    - `.github/workflows/ci.yml`: frozen-lockfile install, lint (ESLint and dependency-cruiser), typecheck, unit and property tests, build both apps, Playwright smoke
    - _Requirements: 19.12_

  - [x] 26.2 Add the main-branch isolation and release-checklist workflows
    - Separate workflow files: Appwrite isolation test with repository secrets, release checklist asserting license, `THIRD_PARTY_NOTICES.md` and committed `.kiro`
    - _Requirements: 19.13, 1.9, 20.1_

- [x] 27. Kiro steering, hooks and evidence
  - [x] 27.1 Write steering `product.md` and `architecture.md`
    - Scope freeze (two apps, non-goals), package dependency table, no database access from UI components, domain code outside engine packages
    - _Requirements: 20.2, 20.3_

  - [x] 27.2 Write steering `safety-and-privacy.md` and `testing.md`
    - No writes before confirmation, no unreviewed guessed fields, local-first, money in Paise, no audio upload, no sensitive logging, fast-check conventions and tag format
    - _Requirements: 20.2, 20.3_

  - [x] 27.3 Add targeted-test hooks in `.kiro/hooks`
    - `PostFileSave` hooks for engine packages, storage and sync packages, and billing
    - _Requirements: 20.4_

  - [x] 27.4 Add the commit gate hook and husky pre-commit
    - `PreToolUse` hook on `git commit` running lint, typecheck, unit tests and build (exit code 2 blocks), mirrored by a husky pre-commit
    - _Requirements: 20.4_

  - [x] 27.5 Seed `docs/kiro-journal.md`
    - Dated entry template for spec constraints, hook catches and fast-check shrunk counterexamples
    - _Requirements: 20.1, 20.4_

- [x] 28. README, documentation and demo assets
  - [x] 28.1 Write the README core sections
    - Setup, scripts, demo shop reset, offline instructions, separate-origin note for dev ports, privacy and what syncs, known limitations including that the first Speech_Model download needs connectivity
    - _Requirements: 20.5, 15.9, 18.2_

  - [x] 28.2 Add the "Build your own workflow" README section
    - Embed the example from `examples/appointment-workflow/`
    - _Requirements: 1.8_

  - [x] 28.3 Write `docs/architecture.md`
    - Layered diagram, runtime flow, dependency rules, reuse-proof pointer
    - _Requirements: 1.5, 1.3_

  - [x] 28.4 Add demo assets
    - `docs/demo-script.md` for the 2:40 video (including the "Amul" ambiguity and offline-to-synced segments) and `scripts/capture-demo-assets.mjs` producing screenshots from the Demo_Shop
    - _Requirements: 3.3, 10.5, 16.10_

  - [x] 28.5 Finalize `THIRD_PARTY_NOTICES.md`
    - Attributions for the chosen speech model, onnxruntime-web, Fuse.js, Dexie, fonts and other bundled packages
    - _Requirements: 1.9, 18.6_

- [x] 29. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (test-only) and can be skipped for a faster MVP; non-optional tasks must still be implemented.
- Property tests use `fast-check` with at least 100 runs and the tag `// Feature: awaaz-kit, Property N: <title>`.
- If the spike (task 1) selects the typed and scripted-clip path as primary, task 3.6 builds the experimental adapter behind the provider flag and the rest of the plan is unchanged.
- Test-only checks that need Appwrite credentials skip with a visible message when environment variables are absent.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2"] },
    { "id": 2, "tasks": ["1.3", "2.3", "2.5"] },
    { "id": 3, "tasks": ["2.4"] },
    { "id": 4, "tasks": ["2.6"] },
    { "id": 5, "tasks": ["2.7", "3.1", "4.1", "5.1", "10.1"] },
    { "id": 6, "tasks": ["3.2", "3.3", "4.2", "4.3", "5.2", "10.2"] },
    { "id": 7, "tasks": ["3.4", "5.3", "5.4", "5.5", "5.6", "5.7", "6.1", "7.1", "10.3", "11.1"] },
    { "id": 8, "tasks": ["3.5", "3.6", "6.2", "7.2", "11.2", "12.1"] },
    { "id": 9, "tasks": ["6.3", "6.4", "6.5", "6.6", "7.3", "8.1", "11.3", "12.2", "12.3"] },
    { "id": 10, "tasks": ["7.4", "7.5", "7.6", "8.2", "11.4", "12.4"] },
    { "id": 11, "tasks": ["8.3", "8.4", "8.5", "8.6", "11.5", "12.5", "13.1"] },
    { "id": 12, "tasks": ["11.6", "11.7", "12.6", "12.7", "13.2", "17.1"] },
    { "id": 13, "tasks": ["11.8", "13.3", "14.1", "16.1", "17.2", "17.3", "17.7"] },
    { "id": 14, "tasks": ["11.9", "11.10", "11.11", "11.12", "11.13", "11.14", "11.15", "14.2", "14.3", "14.4", "14.5", "14.6", "14.7", "14.8", "16.2", "17.4", "17.8"] },
    { "id": 15, "tasks": ["16.3", "16.4", "17.5", "17.9", "17.11", "19.1"] },
    { "id": 16, "tasks": ["17.6", "17.12", "17.13", "17.14", "17.15", "19.2", "19.3", "19.4", "19.5"] },
    { "id": 17, "tasks": ["17.10", "19.6", "19.7", "19.8", "19.9", "19.13"] },
    { "id": 18, "tasks": ["19.10", "19.11", "19.12", "19.14", "19.15"] },
    { "id": 19, "tasks": ["19.16", "19.17", "19.18", "20.1", "21.1"] },
    { "id": 20, "tasks": ["20.2", "20.3", "20.6", "20.7", "21.2", "21.3", "21.7"] },
    { "id": 21, "tasks": ["20.4", "20.8", "21.4", "21.8"] },
    { "id": 22, "tasks": ["20.5", "21.5", "22.1", "22.2"] },
    { "id": 23, "tasks": ["20.9", "21.6", "22.3", "22.4", "22.5"] },
    { "id": 24, "tasks": ["21.9", "22.6", "22.7", "23.1", "23.2"] },
    { "id": 25, "tasks": ["23.3", "24.1", "24.2", "24.3", "24.4", "25.2", "25.3"] },
    { "id": 26, "tasks": ["23.4", "23.5", "24.5", "25.1"] },
    { "id": 27, "tasks": ["25.4", "25.5", "25.6", "25.7", "25.8", "25.9", "25.10"] },
    { "id": 28, "tasks": ["26.1", "26.2", "27.1", "27.2", "27.3", "27.4", "27.5"] },
    { "id": 29, "tasks": ["28.1", "28.3", "28.4", "28.5"] },
    { "id": 30, "tasks": ["28.2"] }
  ]
}
```
