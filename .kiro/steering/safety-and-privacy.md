---
inclusion: always
---

# Safety and Privacy Rules

These rules apply to every change in Awaaz Kit (Req 11, 15, 16, 18, 20.3). Break one only with an explicit spec change.

## No writes before confirmation

- A spoken, typed or sample utterance only produces a draft. Recording, transcribing or submitting text never creates an order or bill.
- Persistent domain records can only be created by a `ConfirmedAction`. `confirmation-engine` mints it (`confirm()`), from user click evidence, and only when `canConfirm(draft)` is true.
- `local-data.commitConfirmed` must reject anything for which `isConfirmedAction()` is false. Do not export the brand symbol or add a second path that writes orders, order items, bills or bill items.
- Confirm must be idempotent: a double activation creates exactly one record.
- A confirmed record is written in one IndexedDB transaction with its audit event and outbox Mutation. If the transaction fails, show a save error and leave no partial rows.
- A finalized Bill is immutable. Fix mistakes with a separate correction record.

## No unreviewed guessed fields

- Every extracted field carries a status (`confirmed`, `needs_review`, `missing`, `unmatched`, `ambiguous`). Never fill a missing, unmatched or ambiguous value with a default or best guess so it looks confirmed.
- A unit that differs from the catalog unit is `needs_review`. Do not convert units silently.
- A missing bill price blocks finalize.
- Only a user action can move a field to `confirmed`. The parser and matcher never do it for uncertain fields.
- Show uncertainty with text labels, not color alone.

## Local-first

- IndexedDB (via `local-data`) is the source of truth. The app shell, catalog, drafts, saved records and typed input must work offline.
- Voice works offline only after the Speech_Model is cached. Say so honestly in the UI and docs.
- Cloud sync is off until the user opts in and signs in. Without that, send no business data to the Sync_Backend.
- Pending Mutations stay in the outbox while offline or signed out. Never discard them.
- Transcripts (`rawTranscript`, `normalizedText`) stay out of remote rows unless the user enables "Sync transcripts". It is disabled by default after opt-in.

## Money in Paise

- Store and compute money as integer Paise. Quantities are integer milli-units (`qtyMilli`, 1.5 kg = 1500).
- Never use floating-point for money or quantity math. Use `domain-billing` (`lineTotalPaise`, `computeTotals`) with its half-up integer rule.
- Convert to rupees only for display (`formatRupees`).
- Price snapshots on saved order and bill lines never change when the catalog price changes.

## Audio and secrets

- Audio stays on the device. Do not upload it, and do not keep raw audio after transcription.
- Frontend code may only use the Appwrite endpoint and project ID. Never put an API key or other privileged secret in `apps/` or `packages/`, in built bundles or in committed files.
- Do not read, print or commit `.env.local`. Keep `.env.example` limited to non-secret placeholder names.
- Data goes over TLS only.

## No sensitive logging

- Do not write full transcripts, customer names or phone numbers, or receipt contents to the console, analytics or error messages in production builds.
- ESLint enforces `no-console` for production code. Use the project logger and log only ids, counts, statuses and error codes.
- Error text kept in `lastError` on outbox Mutations must not contain payload data.

## Licenses

- Keep the license notices for included models and packages. Update `THIRD_PARTY_NOTICES.md` whenever a model or dependency is added.
- The Voice_Corpus must not contain identifiable speaker recordings.
