---
inclusion: always
---

# Testing Conventions

Stack: Vitest (jsdom, `globals: false`, so import `describe`, `it` and `expect` from `vitest`), fast-check, Testing Library, `fake-indexeddb`, Playwright (Chromium). Root scripts: `pnpm test`, `pnpm test:offline`, `pnpm test:e2e`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.

## Where tests live

- Unit and component tests sit next to the source as `*.test.ts` or `*.test.tsx`.
- Cross-package tests go in `tests/` (`tests/property/`, `tests/integration/`). Playwright specs go in `tests/e2e/`, which Vitest excludes.
- Shared setup is in `tests/setup/` (`vitest.setup.ts`, `fast-check.ts`).
- Shared generators go in `tests/property/arbitraries/`: catalog, Hindi, Hinglish and English utterance templates, bills, drafts, mutation lists, fault plans.
- Fixtures are in `tests/fixtures/`. The Voice_Corpus has reference transcripts and expected results only, with no identifiable speaker recordings.

## fast-check conventions

- Use `fast-check`, not hand-rolled random generators.
- Each Correctness Property in `design.md` gets exactly one property test.
- Use `assertProperty` from `tests/setup/fast-check.ts`. It defaults to `numRuns: 100`. Do not go below 100 unless a code comment explains the cost. Persistence and sync properties may use 50 to 100 with the in-memory fakes.
- Write smart generators that stay inside the valid input space instead of filtering heavily.
- Tag each property test with a comment directly above it:

```ts
// Feature: awaaz-kit, Property 24: Bill arithmetic is exact and consistent
it("Property 24", () => assertProperty(fc.property(billArb, (bill) => { /* ... */ })));
```

- Add a requirement link in the test title or comment, for example `**Validates: Requirements 14.2**`.
- When a property fails, copy the printed seed and path into a regression example test. Then fix the code, not the seed. Record the shrunk counterexample in `docs/kiro-journal.md`.
- Implement only properties numbered in `design.md`. To add one, update the design first.

## Oracles

- Oracles must be independent of the implementation. Use BigInt arithmetic for money, a naive in-memory remote model for sync, and a table-driven number-word expander for normalization.
- Never derive the expected value by calling the function under test.

## Test doubles

- IndexedDB: `fake-indexeddb` injected into Dexie.
- Microphone: fake `MediaDevices` with scripted outcomes.
- Speech: `ScriptedProvider`. The real Shruti adapter is only for the manual spike and a cached-model smoke test.
- Appwrite: `InMemoryRemote` with the same `SyncRemote` contract. Contract tests also run against a real test project when env vars are present. Without them, skip with a visible message.
- Time, randomness and ids: inject `clock`, `random` and `newId`.
- Do not use mocks or fake data just to make a test pass.

## What gets which kind of test

- Property tests: pure engine code, money math, persistence invariants, sync idempotency.
- Example tests: specific fixtures such as the Demo_Shop utterances, migrations and edge cases.
- Component tests: mic states, transcript editing, ambiguity prompts, confirm-button states and sync status. Include accessibility assertions.
- Integration tests: IndexedDB transaction with outbox, parser-to-review, confirm-to-save, sync push and pull.
- E2E and smoke tests: PWA manifest, service worker, offline reload, print preview, Appwrite permissions.
- Do not use property tests for visual design, service worker caching or the Shruti model itself.

## Quality gates

- Corpus: at least 95 percent correct routing, at least 85 percent complete exact extraction on clean transcripts, and 100 percent of seeded ambiguity fixtures flagged.
- Offline save and reload keeps 100 percent of records. Duplicate Mutations create exactly one remote entity.
- Before commit, `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` must pass.
- Make Vitest runs terminate, for example `pnpm vitest run <path>`. Never use watch mode in scripts or hooks.
