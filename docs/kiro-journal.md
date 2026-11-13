# Kiro Journal

An honest log of how Kiro specs, steering, hooks and subagents shaped the Awaaz Kit build. Entries record what happened and what it changed. Where a result does not exist yet, the entry says so. Nothing here is a measured result unless it names the artifact that holds the measurement.

Related requirements: 20.1, 20.4. Evidence lives in `.kiro/specs/awaaz-kit/` and `docs/`.

## How to add an entry

Append new entries at the bottom, newest last. Use the template below. Keep one catch per entry and link a file, test or task id.

```markdown
### YYYY-MM-DD: short title

- Kind: spec constraint | hook catch | fast-check counterexample | subagent | decision
- Where: task id, file path or test name
- What happened: one or two factual sentences
- What it changed: the code, spec or process change that followed
- Evidence: path, test name or command (or "none recorded")
```

For a fast-check counterexample, also record the shrunk input exactly as fast-check printed it, the property number from `design.md` and the seed if one was reported. Do not paraphrase the counterexample.

## State at seeding (task 27.5)

- Done in the spec: the day-1 speech spike harness, scaffold and tooling, and the engine, storage and app tasks recorded as `[x]` in `tasks.md`.
- Steering files and hooks (tasks 27.1 to 27.4) were being written in the same execution wave as this journal. This journal does not claim any hook has fired or caught anything. The hook catch section below is empty on purpose.
- No fast-check shrunk counterexample has been recorded here yet.
- The spike has not been run on a target device (see the speech entry).

## Entries

### Spec workflow: requirements first

- Kind: decision
- Where: `.kiro/specs/awaaz-kit/.config.kiro` (`workflowType: requirements-first`, `specType: feature`)
- What happened: The feature is one spec with `requirements.md`, `design.md` and `tasks.md`. The PRD's repository sketch listed three specs (`awaaz-core`, `order-awaaz`, `bill-awaaz`). The build uses a single `awaaz-kit` spec instead.
- What it changed: Requirements are numbered acceptance criteria, and tasks cite them (for example `_Requirements: 5.2, 5.11_`). Property tests cite the same numbers with `**Validates: Requirements ...**`. This made it possible to check that a task has a requirement behind it and that a requirement has a task.
- Evidence: `requirements.md`, `design.md`, `tasks.md`.

### Spec constraints that shape the code

- Kind: spec constraint
- Where: `requirements.md` Requirement 20.3, Requirement 11.7, Requirement 15.3; `design.md` key decisions
- What happened: The rules were written as testable statements, not preferences: no direct database access from UI components, no writes before confirmation, local-first, money in Paise, no unreviewed guessed fields.
- What it changed:
  - Confirmation is a type, not a convention. `confirmation-engine` mints a branded `ConfirmedAction` and `local-data` accepts only that type (tasks 10.2, 11.4).
  - UI imports of `dexie` are blocked by an ESLint `no-restricted-imports` rule (task 2.3).
  - Package boundaries are enforced by dependency-cruiser rules taken from the design's dependency table (task 2.4).
  - A missing quantity yields `value: null` and is never defaulted to 1 (tasks 7.2, 8.1).
- Evidence: `eslint.config.js`, `.dependency-cruiser.cjs`, tasks 2.3, 2.4, 8.1, 10.2, 11.4.

### Design-time research: Appwrite permissions

- Kind: decision
- Where: `design.md` "Research summary"
- What happened: The design records that a row created from a client SDK without explicit permissions grants the creator read, update and delete by default, and that table-level and row-level permissions combine when row security is on. It cites the Appwrite docs.
- What it changed: The design always passes explicit row permissions and enables row security on every synced table. Create-once entities derive the row ID from `mutationId` and treat a 409 on duplicate create as success (Requirements 16.3, 16.4, 16.18). The row-ID character and length limits are flagged "to be re-verified against the pinned SDK".
- Evidence: `design.md` research summary; `appwrite/appwrite.json`, `appwrite/setup.mjs`. Open item at seeding: the design lists the exact web SDK surface (TablesDB versus legacy Databases) as confirmed later, not confirmed in the design.

### Appwrite as the sync backend

- Kind: decision
- Where: `requirements.md` glossary (Sync_Backend), Requirement 16; `Awaaz_Kit_PRD_Kiroween_2026.md`
- What happened: The spec names Appwrite (Cloud or self-hosted) as the Sync_Backend. The PRD wording still describes the backend in Postgres and row-level-security terms ("Auth + Postgres + RLS", "anon key", "service-role keys"), which does not match Appwrite's model of collection and row permissions. I only have these two documents to go on, not the discussion that led to the change, so this entry does not claim why the backend changed.
- What it changed: The requirements restate the backend rules in Appwrite terms: permissions scoped per user or team (16.15), no privileged key in frontend code (16.16), only the project ID and endpoint in frontend configuration (18.4), and schema as versioned definitions in the repo (16.17). `.env.example` carries only `VITE_APPWRITE_ENDPOINT` and `VITE_APPWRITE_PROJECT_ID` (task 2.5). Sync sits behind a `SyncRemote` interface with an Appwrite implementation and an in-memory fake, so the engine is testable offline.
- Follow-up: the PRD should be edited to match the spec so the two do not disagree. Not done at seeding.
- Evidence: `requirements.md`, `design.md`, `.env.example`, `docs/test-backend.md`.

### Speech spike decision

- Kind: decision
- Where: task 1, `docs/model-benchmark.md`, `design.md` "Speech provider spike and fallback strategy"
- What happened: The design treated on-device Hindi and Hinglish recognition as the largest risk and put a spike first in the plan, with a fixed fallback order: Shruti, then Whisper WASM, then typed input plus scripted sample clips. The harness exists at `spikes/shruti-bare-vite/` and tasks 1.1 to 1.3 are marked done. The benchmark document is provisional. Every measurement in it reads "pending manual run", and no device result has been recorded.
- What it changed: `scripted` is the provisional default provider, and the product claim stays "voice is local and optional, typed input is first-class". The `SpeechToTextProvider` interface, `ScriptedProvider`, the provider registry and `ModelManager` were built so the app and tests do not depend on a microphone or model (tasks 3.1 to 3.4). Adapters never populate `confidence`, so the UI shows no number unless one is calibrated (Requirements 5.11, 10.9).
- What I cannot say: that Shruti or Whisper WASM meets the 10 second, 5 second clip bar on a target Android phone. That has not been measured. Task 3.6 is marked done but the benchmark still lists `scripted` as the default until section 6 is filled in.
- Evidence: `docs/model-benchmark.md` sections 1, 5, 6 and 7.

### Concurrency and orchestration

- Kind: subagent
- Where: `tasks.md` wave table (`{ "id": N, "tasks": [...] }`), `tasks.meta.json`
- What happened: The task list ends with a wave table that groups tasks with no dependency on each other. Wave 28 runs 26.1, 26.2 and 27.1 to 27.5 together. An orchestrator hands individual tasks to execution subagents and owns status changes (queued, in progress, completed). A subagent reports back and does not edit task status, and does only the one task it is given.
- What it changed: Independent packages and docs were built in parallel, with dependent work held to later waves. This task, 27.5, ran in the same wave as the steering and hook tasks and so could not cite their results.
- Cost worth noting: parallel tasks cannot see each other's output. Anything written in a wave that depends on a sibling (for example this journal and the hooks) has to be reconciled afterwards.
- Evidence: `tasks.md` wave table, `tasks.meta.json`.

## Steering

Steering files for product, architecture, safety and privacy, and testing are required by Requirement 20.2 and covered by tasks 27.1 and 27.2. No entry is recorded yet for a specific case where steering changed an output. Add one when it happens.

## Hook catches

None recorded. Hooks are covered by tasks 27.3 and 27.4 (targeted tests after saves, and a commit gate that blocks with exit code 2). Add an entry per real catch using the template, with the hook name, the file saved or command run, and the failure text.

## fast-check shrunk counterexamples

### Property 29: finalized bills could be deleted

- Kind: fast-check counterexample
- Property: 29, "Finalized bills are immutable and corrections are separate" (`packages/local-data/src/bill.immutable.property.test.ts`, task 11.12).
- Counterexample: `billItems.bulkDelete` on a finalized bill's item succeeded. Seed -1863756540, path `0:0:0:0:0:0:0:0:0:0:0:1:1`.
- Classification: code bug. `schema.ts` had `updating` hooks but no `deleting` hooks.
- Fix: `deleting` hooks on `bills` (finalized) and `billItems` (always, since items only exist under a finalized bill) throw `ImmutableRecordError`. Dexie 4 does fire them for `Table.clear()`, so admin `clearAll` goes through `AwaazDb.purgeAllTables()`, which sets an internal bypass flag. Regression example test added in the same file.

Earlier note: property tests use `fast-check` with at least 100 runs and the tag `// Feature: awaaz-kit, Property N: <title>`. When a property fails, record the shrunk counterexample verbatim, whether it was a code bug, a test bug or a spec gap, and the fix.
