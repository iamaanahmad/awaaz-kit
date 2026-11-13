# Awaaz Kit

An open-source, offline-first starter framework for voice-first business workflows in Hindi, Hinglish and English. One shared engine, two installable PWAs. Built for Kiroween 2026 (Skeleton Crew).

Awaaz Kit is for small shops where talking or typing is faster than filling forms. You say or type "2 kilo chawal, ek litre tel, Amul butter", and the app turns it into a draft you can review. Nothing is saved until you confirm.

## The two apps

| App                                  | What it does                                                                                                | Dev URL                      | Built path |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------- |
| **Order Awaaz** (`apps/order-awaaz`) | A customer's spoken or typed shopping request becomes a reviewable, confirmed order.                        | http://localhost:5173/order/ | `/order/`  |
| **Bill Awaaz** (`apps/bill-awaaz`)   | A spoken or typed billing instruction becomes an editable, confirmed cash memo / receipt with exact totals. | http://localhost:5174/bill/  | `/bill/`   |

The built output also has a small static hub page at `/` that links to both (`scripts/build-hub.mjs`). The hub is not an app. Exactly two apps live under `apps/`.

Bill Awaaz titles its output "Cash memo / receipt". It makes no GST claims and is not a GST invoicing tool.

## The core loop

1. Record audio or type an utterance. Typed input is first-class, not a fallback.
2. A replaceable speech-to-text provider produces an editable transcript. The raw transcript is kept separately from your edits.
3. A deterministic normalizer and parser extract draft lines. There is no cloud LLM anywhere in the loop.
4. A catalog matcher resolves products. Anything missing, ambiguous or not in the catalog is flagged with a text label and icon, never guessed.
5. You review and explicitly confirm. The confirm button stays disabled while anything is unresolved.
6. The record and a sync mutation are written together in one IndexedDB transaction.
7. If you opted in, signed in and are online, the outbox syncs idempotently to Appwrite.

Safety rules that shape the code: no record is written before confirmation, a missing quantity is never defaulted to 1, units are never converted silently, money is integer paise and quantities are integer milli-units, and finalized bills are immutable.

## Reuse proof

The reuse claim is checked by tooling, not asserted. The workspace has 12 packages. Ten are engine packages that never import a domain package. Two are domain packages (`domain-order`, `domain-billing`) that hold the workflow-specific code. This is enforced by `.dependency-cruiser.cjs` as part of `pnpm lint`.

`pnpm reuse-report` generates [`docs/reuse-proof.md`](docs/reuse-proof.md) from the real import graph. The current report shows both apps reaching all ten engine packages:

| Engine package                                                                                                         | Order Awaaz        | Bill Awaaz           |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------- |
| `voice-capture`, `speech-provider`, `catalog-matcher`, `confirmation-engine`, `local-data`, `sync-engine`, `shared-ui` | direct             | direct               |
| `language-normalizer`, `confidence-engine`                                                                             | direct             | via `domain-billing` |
| `intent-engine`                                                                                                        | via `domain-order` | via `domain-billing` |

`domain-order` is unreachable from Bill Awaaz and `domain-billing` is unreachable from Order Awaaz. That is by design. "Via domain" means the app reaches that package through its domain package rather than importing it itself. See the report for file counts.

## Build your own workflow

A new workflow is one adapter class over the shared engine. It does not touch any engine package. [`examples/appointment-workflow/`](examples/appointment-workflow/) shows a small appointment-booking workflow that reuses the same pipeline as Order and Bill: normalize, extract, resolve, then validate. This is an illustration of reuse, not a third app.

The file below is embedded verbatim from [`examples/appointment-workflow/src/appointment-workflow.ts`](examples/appointment-workflow/src/appointment-workflow.ts):

```ts
import type { CatalogIndex } from '@awaaz-kit/catalog-matcher';
import { resolveLines, type ResolvedLine } from '@awaaz-kit/confidence-engine';
import type {
  ValidationIssue,
  WorkflowAdapter,
  WorkflowContext,
} from '@awaaz-kit/confirmation-engine';
import { extract } from '@awaaz-kit/intent-engine';
import { normalize } from '@awaaz-kit/language-normalizer';

/** A draft appointment: the shared pipeline's lines are the services requested. */
export interface AppointmentDraft {
  id: string;
  shopId: string;
  services: ResolvedLine[];
  rawTranscript: string;
}

export class AppointmentWorkflowAdapter implements WorkflowAdapter<AppointmentDraft, CatalogIndex> {
  // The WorkflowAdapter contract currently names only the built-in workflows.
  readonly id = 'order' as const;

  parse(text: string, ctx: WorkflowContext<CatalogIndex>): AppointmentDraft {
    // Same shared pipeline as Order and Bill: normalize -> extract -> resolve.
    const extraction = extract(normalize(text), { locale: 'hi-IN', knownCustomerNames: [] });
    const services = resolveLines(extraction, ctx.catalog, ctx.makeId);
    return { id: ctx.makeId(), shopId: ctx.shopId, services, rawTranscript: text };
  }

  validate(draft: AppointmentDraft): ValidationIssue[] {
    return draft.services
      .filter((s) => s.product.value === null || s.product.status !== 'confirmed')
      .map((s) => ({
        code: 'service_unresolved',
        lineId: s.lineId,
        field: 'product',
        message: 'Choose a service from the catalog.',
      }));
  }

  canConfirm(draft: AppointmentDraft): boolean {
    return draft.services.length > 0 && this.validate(draft).length === 0;
  }
}
```

What to take from it:

- It imports only engine packages (`language-normalizer`, `intent-engine`, `catalog-matcher`, `confidence-engine`, `confirmation-engine`). No domain package is involved.
- `parse` turns text into a typed draft. `validate` lists issues. `canConfirm` is the gate that must be true before the confirmation engine will mint a `ConfirmedAction`.
- Uncertain fields stay unconfirmed. `validate` blocks any service that is unmatched or not confirmed, so nothing is guessed.
- The example is a sketch of the adapter only. It has no UI and no persistence. Saving a record would still go through `commitConfirmed` with a `ConfirmedAction`, which needs a domain package for the new record type.
- The `WorkflowAdapter` contract currently names only the built-in workflows, so the example reuses the `'order'` id. A real workflow would extend that contract.

Type-check the example with `pnpm --filter @awaaz-kit/example-appointment-workflow typecheck`.

## Offline promise

What works offline, and what does not:

- **Works offline after the first online load:** the app shell, the catalog, drafts, saved orders and bills, and typed input. All data lives in IndexedDB on the device.
- **Voice works offline only after the speech model is downloaded.** The first model download needs a connection and is started by you from the app. Until the model is cached, use typed input.
- **The shipping default speech provider is `scripted`.** That means typed input plus sample utterance chips that are labelled "Sample". It does not transcribe your voice.
- **The real on-device provider (Shruti, ONNX in the browser) is built behind the `SpeechToTextProvider` interface but is not the default.** It becomes the default only after the manual device benchmark is recorded. That benchmark has not been run yet; see [`docs/model-benchmark.md`](docs/model-benchmark.md), where every result is marked "pending manual run". No accuracy or latency claim is made for voice.
- Cloud sync is off until you opt in and sign in. Pending changes wait in a local outbox while you are offline or signed out.

## Quick start

Requirements: Node 20 or newer and pnpm 10 (the repo pins `pnpm@10.13.1`).

```
pnpm install
pnpm dev:order     # http://localhost:5173/order/
pnpm dev:bill      # http://localhost:5174/bill/
```

On first open, choose the Demo Shop or create a local shop name. No sign-in or backend is needed.

Production-style build of both apps plus the hub page:

```
pnpm build
```

### Separate origins during development

The two dev servers use different ports, so the browser treats them as different origins with separate databases. Data created in Order Awaaz on port 5173 (including a reset demo shop) will not appear in Bill Awaaz on port 5174 while developing. When both apps are served from one origin (the built `dist/` with `/order/` and `/bill/`), they share one IndexedDB database (`awaaz-kit`), one catalog and one speech model cache.

### Demo shop and reset

The Demo Shop is "Sharma Kirana (Demo)": a seeded catalog of 24 products with Hindi, Hinglish and English aliases, and 5 sample customers. All of it is fictional and labelled so in the app. To restore it, open the **About** screen and choose **Reset demo**. Order Awaaz asks you to confirm first.

## Appwrite setup (optional sync)

Sync is optional. Skip this section to use the apps fully local.

Appwrite Cloud and self-hosted both work. The backend is a TablesDB database `awaaz` with tables `products`, `customers`, `orders`, `order_items`, `bills` and `bill_items`. Row security is on, and permissions are per shop team. The definitions are in [`appwrite/appwrite.json`](appwrite/appwrite.json).

1. Create an Appwrite project (Cloud or self-hosted) and add a Web platform for your app's host.
2. Create a server API key with the scopes `databases.*`, `tables.*`, `columns.*` and `indexes.*`.
3. Validate the definitions without any network or credentials:

   ```
   node appwrite/setup.mjs --dry-run
   ```

4. Export the server credentials **in your shell only** and apply the schema. The script is idempotent and additive: it never deletes or changes existing columns or indexes.

   PowerShell:

   ```
   $env:APPWRITE_ENDPOINT = "https://cloud.appwrite.io/v1"
   $env:APPWRITE_PROJECT_ID = "<project id>"
   $env:APPWRITE_API_KEY = "<server key>"
   node appwrite/setup.mjs
   ```

5. Copy `.env.example` to `.env.local` and fill in only the two client variables:

   | Variable                                                       | Used by                   | Notes                                                                              |
   | -------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------- |
   | `VITE_APPWRITE_ENDPOINT`                                       | apps (browser)            | Public endpoint, for example `https://cloud.appwrite.io/v1`                        |
   | `VITE_APPWRITE_PROJECT_ID`                                     | apps (browser)            | Public project id                                                                  |
   | `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY` | `appwrite/setup.mjs` only | Shell environment only. Never put these in a committed file or a `VITE_` variable. |

The Appwrite API key must never reach `apps/`, `packages/` or a built bundle. `.env.local` is gitignored.

In the app, open About and enable cloud sync, then sign in with email and password. Without that opt-in the app sends no business data to the backend.

## Privacy and what syncs

- Audio stays on the device. It is not uploaded and not kept after transcription.
- Local-first: IndexedDB is the source of truth.
- After opt-in and sign-in, products, customers, orders, order items, bills and bill items sync. Orders and bills carry a unique mutation id, so a repeated push creates one remote record.
- **Transcripts do not sync by default.** The raw and normalized transcript fields stay out of remote rows unless you turn on "Sync transcripts", which is off after opt-in.
- Production code does not log transcripts, names, phone numbers or receipt contents. Logs carry ids, counts, statuses and error codes.
- Bills and bill items are read-only on the backend after creation.
- Browser storage can be cleared by the user or the operating system. Use **Export** on the About screen to keep a copy.

## Tests and checks

| Command             | What it runs                                                                  |
| ------------------- | ----------------------------------------------------------------------------- |
| `pnpm test`         | Vitest unit, component, property (fast-check) and integration tests           |
| `pnpm test:offline` | `sync-engine` and `local-data` tests, then Playwright specs tagged `@offline` |
| `pnpm test:e2e`     | Playwright (Chromium) specs in `tests/e2e/`                                   |
| `pnpm lint`         | ESLint plus dependency-cruiser architecture rules                             |
| `pnpm typecheck`    | TypeScript across all workspaces                                              |
| `pnpm build`        | Both apps, then the hub page                                                  |
| `pnpm reuse-report` | Regenerates `docs/reuse-proof.md`                                             |

Property tests use fast-check with independent oracles (for example BigInt for money). Tests that need a real Appwrite backend skip with a visible message unless `APPWRITE_TEST_*` variables are set; see [`docs/test-backend.md`](docs/test-backend.md). A local Docker-based test backend is described there but was not exercised on the authoring machine.

Playwright needs its browser once: `pnpm exec playwright install chromium`.

A voice test corpus lives in `tests/fixtures/voice-corpus/` with reference transcripts and expected results only. It has no speaker recordings.

## How Kiro was used

The project is spec-driven. Everything is committed under `.kiro/`:

- **Specs** in `.kiro/specs/awaaz-kit/` (`requirements.md`, `design.md`, `tasks.md`) are the source of truth. Each correctness property in the design maps to exactly one property test.
- **Steering** in `.kiro/steering/` (`product.md`, `architecture.md`, `safety-and-privacy.md`, `testing.md`) keeps scope, layering, privacy rules and test conventions in every session.
- **Hooks** in `.kiro/hooks/` run targeted tests on save for the billing, engine and storage/sync areas, and a commit gate.
- **Journal:** [`docs/kiro-journal.md`](docs/kiro-journal.md) is an honest log of what specs, steering and hooks changed. It records only what happened and says where nothing has been recorded yet.

## Known limitations

- **Voice is not proven.** The default provider is typed input plus labelled samples. The on-device speech model has not been benchmarked on a target phone, so no voice accuracy is claimed.
- The first speech model download needs connectivity. Voice offline requires the model to be cached, and the browser may evict it.
- Language coverage is rule-based: number words 0 to 100, common fractions and a fixed unit set. Unusual phrasing is flagged for review rather than guessed.
- Sync is a basic opt-in, email/password flow. It does not resolve conflicts between multiple devices beyond last-write-wins for products and customers.
- Not built, by design: payments or UPI, GST invoicing, WhatsApp sending, telephony or IVR, inventory, a catalog editor, CSV import, and any cloud LLM.
- The Docker test backend and the Appwrite flow have not been verified end to end on the authoring machine. Run the checks above on your machine before relying on them.
- Use desktop Chrome or Chrome for Android. Other browsers are untested.

## License

MIT, see [`LICENSE`](LICENSE). Model and package attributions are in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
