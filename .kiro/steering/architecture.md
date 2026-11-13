# Architecture

TypeScript pnpm monorepo. Vite + React apps, Dexie for local persistence, Appwrite for optional sync, Vitest + fast-check + Playwright for tests. Packages are scoped `@awaaz-kit/*`.

## Layout

```
apps/order-awaaz, apps/bill-awaaz      the only two apps
packages/                              12 packages (below)
appwrite/appwrite.json, setup.mjs      versioned Appwrite tables and setup script
docker-compose.test.yml                self-hosted Appwrite test backend
scripts/                               build-hub, reuse-report, seed-test-backend
examples/appointment-workflow/         "Build your own workflow" example
tests/                                 fixtures (voice corpus), property and integration tests
docs/                                  model-benchmark, reuse-proof, corpus-report, journal
spikes/                                standalone Shruti spike, outside the workspace rules
```

## Packages and dependency rules

Enforced by `.dependency-cruiser.cjs` through `pnpm lint`. Violations fail CI. Update the rules and this table together.

| Package | Role | May import | Must not import |
|---|---|---|---|
| `voice-capture` | Mic capture, Recording_State | browser APIs only | any workspace package |
| `speech-provider` | STT interface, ModelManager, providers (`scripted`, `shruti`, `whisper-wasm`) | browser APIs, onnxruntime-web | domain packages, intent/catalog engines |
| `language-normalizer` | Numbers, units, folding | nothing in workspace | everything else |
| `intent-engine` | Item and slot extraction | normalizer types | domain, `local-data`, network |
| `catalog-matcher` | Exact and fuzzy product match (Fuse.js) | normalizer, Fuse.js | domain, `local-data` (catalog passed in as data) |
| `confidence-engine` | Field_Status, clarification | intent-engine, catalog-matcher types | domain, `local-data` |
| `confirmation-engine` | `WorkflowAdapter`, `ConfirmedAction`, `confirm` | confidence-engine types | domain, `local-data` |
| `local-data` | Dexie schema, repositories, `commitConfirmed`, logger, seed | Dexie, confirmation-engine types | domain, React, `sync-engine` |
| `sync-engine` | Outbox push and pull, `SyncRemote`, `AppwriteRemote` | `local-data`, `appwrite` SDK (one adapter file only) | domain, React |
| `shared-ui` | Shared React components, tokens | React, engine types | `local-data` |
| `domain-order` | `OrderWorkflowAdapter`, order drafts | engine packages, `local-data` record types | `domain-billing`, apps |
| `domain-billing` | `BillingWorkflowAdapter`, money math | engine packages, `local-data` record types | `domain-order`, apps |

Additional rules: no cycles; packages never import apps; apps never import each other.

## Hard architectural rules

- Engine packages (`voice-capture` through `shared-ui`) never import `domain-*`. This keeps the reuse claim true by construction. Workflow-specific code belongs in a domain package, never in an engine package.
- No database access from UI components. `dexie` is banned by ESLint `no-restricted-imports` in `apps/**` and `packages/shared-ui/**`. Apps reach data only through app-local hooks over `local-data` repositories.
- Pure engine stages (normalize, extract, match, resolve) take data as arguments and have no I/O, clock or randomness.
- Records are persisted only through `commitConfirmed`, which accepts only a `ConfirmedAction` produced by `confirm()` with trusted-click evidence. One Dexie transaction writes the record, snapshots, audit event and outbox Mutation.
- Finalized bills are immutable. Changes are separate `void` or `correction` rows linked by `correctsBillId`.
- Validate at module boundaries with Zod (adapter output, remote rows, stored records).
- `no-console` is an error in production code. Use the redacting logger from `local-data`.

## Sync and Appwrite

- Backend is Appwrite (Cloud or self-hosted) using TablesDB database `awaaz` with tables `products`, `customers`, `orders`, `order_items`, `bills`, `bill_items`. Row security is on, permissions are team-per-shop, and bills and bill items are read-only after creation.
- `orders` and `bills` have a unique `mutationId` index. Create-once entities use deterministic UUIDv5 row ids; a 409 maps to `already_exists` and counts as success. Products and customers use guarded upsert with last-write-wins and a `deviceId` tie-break.
- `rawTranscript` and `normalizedText` columns are optional and only populated when the user turns on "Sync transcripts" (off by default).
- `AppwriteRemote` is the only file that imports the `appwrite` SDK. Everything else talks to the `SyncRemote` interface; `InMemoryRemote` backs tests.
- The client holds only `VITE_APPWRITE_ENDPOINT` and `VITE_APPWRITE_PROJECT_ID`. The Appwrite API key is used only by `appwrite/setup.mjs` from the developer environment and must never reach a bundle.
- Sync runs only with opt-in, sign-in and connectivity. Background Sync (`awaaz-sync` tag) is a progressive enhancement; correctness does not depend on it.

## Build and hosting

- `pnpm build` builds both apps, then `scripts/build-hub.mjs` assembles the combined `dist/` with a static hub at `/`, `/order/` and `/bill/`.
- Each app is a PWA with its own manifest scope and service worker. Speech_Model files are excluded from precache and cached under Cache Storage `awaaz-speech-model-v1` after a user-initiated download.
- During `pnpm dev:order` and `pnpm dev:bill` the apps use different ports and therefore different origins and databases.
- Both apps ship the same `local-data` version; a Dexie `versionchange` closes the connection and shows a "Reload to update" banner.

## Commands

`pnpm dev:order`, `pnpm dev:bill`, `pnpm test`, `pnpm test:e2e`, `pnpm test:offline`, `pnpm lint` (ESLint + dependency-cruiser), `pnpm typecheck`, `pnpm build`, `pnpm reuse-report`.
