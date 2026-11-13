# Requirements Document

## Introduction

Awaaz Kit is an open-source, offline-first starter framework for voice-first business workflows in Hindi, Hinglish and English. This spec covers the P0 MVP from the PRD (Kiroween 2026, Skeleton Crew category): one shared engine delivered as pnpm workspace packages, plus exactly two separately runnable installable PWA applications:

- Order Awaaz: converts a spoken or typed customer shopping request into a reviewable, confirmed order.
- Bill Awaaz: converts a spoken or typed billing instruction into an editable, confirmed cash memo / receipt.

Core behaviour: a user records or types an utterance; a replaceable local speech-to-text provider produces an editable transcript; a deterministic normalizer and parser extract typed draft lines; a catalog matcher resolves products; an uncertainty gate flags missing, ambiguous or unmatched fields; the user confirms explicitly; the record and an outbox mutation are committed atomically to IndexedDB (Dexie); and the outbox syncs idempotently with Appwrite (Cloud or self-hosted) when online and opted in.

Out of scope (PRD non-goals): Kisan Awaaz, mandi prices, weather or agriculture advisory; real missed-call, IVR or telephony; payment gateway, UPI, wallet or settlement; automatic WhatsApp sending; formal GST invoicing, GST filing or accounting integrations; predictive inventory, supplier purchasing, multi-branch stock and payroll; any cloud LLM dependency for the core loop; any third application. P1 and P2 items (catalog editor, sync history panel, benchmark page, CSV import, multi-device conflict resolution, Kiro Crew app, additional language packs) are not part of this spec.

## Glossary

- **Awaaz_Kit**: The monorepo containing the shared engine packages and both applications.
- **Order_App**: The Order Awaaz application located in `apps/order-awaaz`.
- **Bill_App**: The Bill Awaaz application located in `apps/bill-awaaz`.
- **Application**: Either Order_App or Bill_App.
- **Shared_Packages**: The workspace packages under `packages/`: voice-capture, speech-provider, language-normalizer, intent-engine, catalog-matcher, confidence-engine, confirmation-engine, local-data, sync-engine, shared-ui, domain-order and domain-billing.
- **PWA_Shell**: The web app manifest, service worker and precached assets that allow an Application to load without a network.
- **Voice_Capture**: The `voice-capture` package that manages microphone permission and the recording lifecycle.
- **Recording_State**: One of idle, requesting_permission, recording, stopped, error.
- **STT_Provider**: An implementation of the `SpeechToTextProvider` interface (`initialize`, `transcribe`) in the `speech-provider` package.
- **Shruti_Adapter**: The default STT_Provider implementation based on Shruti ONNX models running through onnxruntime-web.
- **Speech_Model**: The on-device model files used by the STT_Provider, downloaded once and cached in the browser.
- **Transcript**: The editable text produced by transcription or typed input. The original text is retained as the Raw_Transcript.
- **Raw_Transcript**: The unmodified text exactly as produced by the STT_Provider or typed by the user.
- **Normalizer**: The `language-normalizer` package.
- **Normalized_Text**: The Normalizer output, with source spans mapping back to the Raw_Transcript.
- **Intent_Engine**: The `intent-engine` package that extracts typed candidates from Normalized_Text.
- **Workflow_Adapter**: An implementation of the `WorkflowAdapter` interface (`parse`, `validate`, `canConfirm`) supplied by a domain package.
- **Candidate_Line**: A typed draft line containing product, quantity and unit fields, each an Extracted_Field.
- **Extracted_Field**: A value with a Field_Status, optional source text, optional calibrated confidence and an optional reason.
- **Field_Status**: One of confirmed, needs_review, missing, unmatched.
- **Catalog**: The locally cached set of products for a shop, each with name, aliases, unit and price in paise.
- **Catalog_Matcher**: The `catalog-matcher` package providing exact alias lookup, normalized search and fuzzy suggestions.
- **Confidence_Engine**: The `confidence-engine` package that assigns Field_Status values.
- **Uncertainty_Gate**: The logic that blocks confirmation while any required field has Field_Status other than confirmed.
- **Confirmation_Engine**: The `confirmation-engine` package that builds reviewable action payloads and enforces explicit confirmation.
- **Review_Card**: The screen that shows the full draft for explicit user confirmation.
- **Local_Database**: The Dexie database over IndexedDB, owned by the `local-data` package.
- **Outbox**: The Local_Database store of pending sync mutations.
- **Mutation**: One Outbox entry with a unique `mutationId` (UUID), entity type, entity id, operation, payload, attempts, next attempt time, state and last error.
- **Sync_Engine**: The `sync-engine` package that pushes Mutations, pulls remote changes and records conflicts.
- **Sync_Backend**: The Appwrite project, either Appwrite Cloud or self-hosted (Appwrite Auth and Databases/TablesDB with collection and row permissions), used for optional cloud sync.
- **Sync_State**: One of local_only, pending, syncing, synced, failed, conflict.
- **Paise**: The integer unit of money, where 100 paise equal 1 INR.
- **Order**: A confirmed customer order with order lines, owned by domain-order.
- **Bill**: A cash memo / receipt with bill lines, owned by domain-billing. A Bill has status draft or finalized.
- **Demo_Shop**: The clearly labelled fictional shop profile with a seeded Catalog of 20 to 30 grocery products and sample customers.
- **Voice_Corpus**: The fixtures under `tests/fixtures/voice-corpus/` containing reference transcripts and expected structured results.
- **Online_Indicator**: The UI element that shows online or offline connectivity state.
- **Shop_Operator**: The shop owner, cashier or helper using an Application.

## Requirements

### Requirement 1: Monorepo structure and reuse proof

**User Story:** As a hackathon judge, I want one repository with a shared engine and exactly two separate apps, so that I can verify the foundation is genuinely reusable.

#### Acceptance Criteria

1. THE Awaaz_Kit SHALL provide a pnpm workspace containing `apps/order-awaaz`, `apps/bill-awaaz` and every Shared_Package under `packages/`.
2. THE Awaaz_Kit SHALL contain exactly two Application folders under `apps/`.
3. THE Order_App SHALL import Shared_Packages for voice capture, speech provider, normalization, intent extraction, catalog matching, confidence, confirmation, local data, sync and shared UI.
4. THE Bill_App SHALL import the same Shared_Packages as the Order_App for voice capture, speech provider, normalization, intent extraction, catalog matching, confidence, confirmation, local data, sync and shared UI.
5. THE Awaaz_Kit SHALL define each Workflow_Adapter in a domain package (domain-order or domain-billing) and not in the Shared_Packages that contain engine logic.
6. WHEN the same fixture utterance is processed by the Order Workflow_Adapter and the Billing Workflow_Adapter, THE Awaaz_Kit SHALL produce an Order draft and a Bill draft respectively from the same shared parser and matcher implementations.
7. THE Awaaz_Kit SHALL provide root scripts `dev:order`, `dev:bill`, `test`, `test:e2e`, `lint`, `typecheck`, `build` and `test:offline`.
8. THE Awaaz_Kit SHALL include a README section with a minimal Workflow_Adapter example that shows how to build a new workflow without copying engine code.
9. THE Awaaz_Kit SHALL include an OSI-approved license file, a THIRD_PARTY_NOTICES.md file listing model and package attributions, and a committed `.kiro` directory containing specs, steering files and hooks.

### Requirement 2: Installable offline PWA shell

**User Story:** As a Shop_Operator, I want each app to install and load without internet, so that I can keep working when connectivity fails.

#### Acceptance Criteria

1. THE Application SHALL provide a web app manifest and a service worker that precaches the PWA_Shell.
2. WHEN an Application has been loaded once online, THE Application SHALL load its PWA_Shell and routes with the network disabled.
3. WHEN the Application starts, THE Application SHALL request persistent storage where the browser supports the request.
4. IF the browser denies persistent storage, THEN THE Application SHALL display a message that browser storage can be cleared by the user or operating system.
5. IF a storage quota error or IndexedDB open error occurs, THEN THE Application SHALL display an error message that names the failure and offer retry.
6. THE Application SHALL display the Online_Indicator on its home screen.
7. WHEN browser connectivity changes, THE Application SHALL update the Online_Indicator without a page reload.

### Requirement 3: Shop onboarding and demo data

**User Story:** As a first-time user or judge, I want to pick a demo shop or create a local shop without an account, so that I can try the apps immediately.

#### Acceptance Criteria

1. WHEN the Application is opened for the first time, THE Application SHALL display a screen that offers the Demo_Shop profile or creation of a local shop name.
2. THE Application SHALL explain on first run that data is stored locally on the device.
3. WHEN the user selects the Demo_Shop, THE Application SHALL load a Catalog of 20 to 30 products with Hindi and English aliases and a set of sample customers into the Local_Database.
4. THE Application SHALL label the Demo_Shop and its sample customers as fictional.
5. WHEN the user creates a local shop name, THE Application SHALL create the shop record in the Local_Database with currency INR.
6. THE Application SHALL allow use of every P0 local feature without sign-in.
7. WHERE the user has not signed in, THE Application SHALL operate in local-only mode and keep every record with Sync_State local_only.
8. THE Order_App and the Bill_App SHALL read the same Catalog of a shop from the Local_Database.
9. WHEN the user chooses to reset the Demo_Shop, THE Application SHALL restore the seeded Catalog and sample customers.

### Requirement 4: Voice capture

**User Story:** As a Shop_Operator, I want clear recording controls, so that I can speak an order or bill and recover from problems.

#### Acceptance Criteria

1. THE Voice_Capture SHALL request microphone permission only after the user activates the record control.
2. THE Voice_Capture SHALL expose Recording_State values idle, requesting_permission, recording, stopped and error.
3. WHEN the user activates the record control while Recording_State is idle, THE Voice_Capture SHALL start recording and display the Recording_State and an elapsed-time counter.
4. WHEN the user activates the stop control while Recording_State is recording, THE Voice_Capture SHALL stop recording and deliver the audio to the STT_Provider.
5. WHEN the user activates the retry control after a recording or transcription, THE Voice_Capture SHALL discard the previous audio and return to Recording_State idle.
6. IF microphone permission is denied, THEN THE Voice_Capture SHALL set Recording_State to error and display a message that offers typed input.
7. IF no microphone device is available, THEN THE Voice_Capture SHALL set Recording_State to error and display a message that offers typed input.
8. WHEN transcription completes or fails, THE Voice_Capture SHALL discard the raw audio held in memory.
9. THE Voice_Capture SHALL contain no business rules and SHALL NOT import any domain package.
10. THE Application SHALL NOT upload audio to any remote service.

### Requirement 5: Replaceable local speech-to-text

**User Story:** As a developer, I want the speech model behind a replaceable interface, so that I can swap providers without touching workflow logic.

#### Acceptance Criteria

1. THE speech-provider package SHALL define the STT_Provider interface with `initialize()` returning readiness and optional model version, and `transcribe(audio, options)` returning text with optional language and duration.
2. THE Shruti_Adapter SHALL implement the STT_Provider interface using onnxruntime-web.
3. THE Workflow_Adapter implementations, the Intent_Engine and the Catalog_Matcher SHALL reference the STT_Provider only through the interface type.
4. WHEN the Speech_Model is not installed, THE Application SHALL display the approximate download size and offer a Download model action and a Continue with typing action.
5. WHEN the user activates Download model, THE Application SHALL download the Speech_Model, display download progress and cache the files in browser storage.
6. WHEN the Speech_Model is cached, THE STT_Provider SHALL transcribe recorded audio without network access.
7. WHEN the Application starts, THE Application SHALL check whether the cached Speech_Model is present and display the model status.
8. IF the cached Speech_Model is missing or evicted, THEN THE Application SHALL display the Download model action and keep typed input available.
9. IF transcription fails, THEN THE Application SHALL display the failure reason and keep typed input available.
10. WHILE transcription is running, THE Application SHALL display a processing state.
11. THE Application SHALL NOT display a numeric accuracy claim for transcription unless the STT_Provider returns a calibrated confidence value.
12. WHEN the Application produces a Transcript from audio, THE Application SHALL retain the Raw_Transcript separately from the editable Transcript.

### Requirement 6: Typed input fallback and editable transcript

**User Story:** As a Shop_Operator, I want to type or correct the transcript, so that work continues when speech recognition is unavailable or wrong.

#### Acceptance Criteria

1. THE Application SHALL provide typed text input on every capture screen at all times, independent of Speech_Model status.
2. WHEN a typed utterance is submitted, THE Application SHALL parse and save a draft without a Speech_Model download.
3. WHEN a Transcript is produced, THE Application SHALL display the Transcript in an editable field above the parsed results.
4. WHEN the user edits the Transcript, THE Application SHALL re-run normalization, extraction and matching on the edited text.
5. IF the Transcript is empty or contains only whitespace, THEN THE Application SHALL display retry and typed-entry options and SHALL NOT create an Order or a Bill.
6. THE Application SHALL keep the Raw_Transcript, the Normalized_Text and the structured extraction as separate stored values.

### Requirement 7: Language normalization

**User Story:** As a Shop_Operator, I want Hindi, Hinglish and English spellings, number words and units understood consistently, so that "do kilo aata" and "2 kg atta" mean the same thing.

#### Acceptance Criteria

1. WHEN text is provided, THE Normalizer SHALL return Normalized_Text with whitespace and punctuation cleaned and with source spans that map to the Raw_Transcript.
2. THE Normalizer SHALL convert Hindi, Hinglish and English number words for 0 to 100, and the fractions half, one and a half, quarter and their Hindi equivalents (aadha, dedh, dhai, sava, paun), to numeric values.
3. THE Normalizer SHALL convert Devanagari numerals and Latin numerals to numeric values.
4. THE Normalizer SHALL map unit spellings in Devanagari and Latin script to the canonical units piece, kg, g, litre and ml.
5. THE Normalizer SHALL map Devanagari and Latin spellings of catalog terms to alias-friendly token forms.
6. IF a token is not a recognized number, unit or alias, THEN THE Normalizer SHALL preserve the token unchanged.
7. THE Normalizer SHALL NOT rewrite unknown product names.
8. FOR ALL input text, normalizing the output of normalization SHALL produce text equal to the first normalization output (idempotence).
9. FOR ALL input text, THE Normalizer SHALL keep the Raw_Transcript unchanged.

### Requirement 8: Deterministic intent and slot extraction

**User Story:** As a Shop_Operator, I want the spoken list turned into structured lines by predictable rules, so that results are testable and need no cloud AI.

#### Acceptance Criteria

1. WHEN Normalized_Text is provided, THE Intent_Engine SHALL extract Candidate_Lines, each with product phrase, quantity and unit, using deterministic rules.
2. THE Intent_Engine SHALL extract optional customer name and phone fields when the utterance contains them.
3. THE Intent_Engine SHALL perform no database writes and no network requests.
4. THE Intent_Engine SHALL operate without any cloud LLM.
5. WHEN the same Normalized_Text and context are provided twice, THE Intent_Engine SHALL return equal output both times.
6. WHEN an utterance contains several items, THE Intent_Engine SHALL return one Candidate_Line per spoken item in spoken order.
7. THE Intent_Engine SHALL record the sourceText phrase for each extracted field.
8. IF the utterance contains no recognizable item, THEN THE Intent_Engine SHALL return an empty list of Candidate_Lines.
9. THE Intent_Engine SHALL route an utterance through the Workflow_Adapter of the active Application only.
10. THE Awaaz_Kit SHALL validate Workflow_Adapter output at module boundaries with a runtime schema.

### Requirement 9: Catalog matching

**User Story:** As a Shop_Operator, I want spoken product names matched to my catalog, so that lines carry correct products and prices.

#### Acceptance Criteria

1. WHEN a product phrase is provided, THE Catalog_Matcher SHALL search exact aliases and product names in normalized form before fuzzy suggestions.
2. WHEN exactly one catalog product matches a phrase exactly, THE Catalog_Matcher SHALL return that product as the match.
3. WHEN no exact match exists, THE Catalog_Matcher SHALL return up to three fuzzy suggestions with unit and brand information.
4. WHEN several products match a phrase equally or nearly equally, THE Catalog_Matcher SHALL return all candidates and SHALL NOT select one.
5. IF no catalog product matches or is suggested, THEN THE Catalog_Matcher SHALL return an unmatched result.
6. THE Catalog_Matcher SHALL ignore products with `active` set to false and products with a `deletedAt` value.
7. THE Catalog_Matcher SHALL match only against the Catalog of the active shop.
8. FOR ALL catalog products and each of their aliases, THE Catalog_Matcher SHALL return that product as the exact match for the alias.

### Requirement 10: Uncertainty handling

**User Story:** As a Shop_Operator, I want unclear fields shown as unclear, so that the app asks me instead of guessing.

#### Acceptance Criteria

1. THE Confidence_Engine SHALL assign each Extracted_Field a Field_Status of confirmed, needs_review, missing or unmatched.
2. IF a quantity is absent from a Candidate_Line, THEN THE Confidence_Engine SHALL set the quantity Field_Status to missing and SHALL NOT default the quantity to 1.
3. IF a unit is absent or ambiguous, THEN THE Confidence_Engine SHALL set the unit Field_Status to needs_review and SHALL NOT convert units on the user's behalf.
4. IF the Catalog_Matcher returns an unmatched result, THEN THE Confidence_Engine SHALL set the product Field_Status to unmatched and the Application SHALL display "Not in catalog".
5. IF the Catalog_Matcher returns several candidates, THEN THE Confidence_Engine SHALL set the product Field_Status to needs_review and the Application SHALL display up to three candidates for the user to choose.
6. WHEN the user supplies or selects a value for a field, THE Confidence_Engine SHALL set that field's Field_Status to confirmed.
7. WHEN fields remain unresolved, THE Application SHALL present one focused clarification prompt at a time, with the prompt text shown on screen.
8. THE Application SHALL highlight each unresolved field using a text label and an icon, not color alone.
9. WHERE the STT_Provider returns a calibrated confidence value, THE Application SHALL display the numeric confidence.
10. FOR ALL seeded ambiguous or unmatched fixtures in the Voice_Corpus, THE Awaaz_Kit SHALL produce a Field_Status other than confirmed for the seeded field.
11. WHEN the user removes a Candidate_Line, THE Application SHALL exclude that line from the draft and recompute draft validity.

### Requirement 11: Explicit confirmation gate

**User Story:** As a Shop_Operator, I want nothing saved as final until I tap confirm, so that a recognition mistake cannot create a wrong record.

#### Acceptance Criteria

1. THE Confirmation_Engine SHALL build a reviewable action payload from a draft.
2. WHEN a draft is ready, THE Application SHALL display the Review_Card with all fields before any Order is created or Bill is finalized.
3. WHILE any required field has a Field_Status other than confirmed, THE Confirmation_Engine SHALL report that the draft cannot be confirmed and the Application SHALL disable the confirm control.
4. WHILE the draft contains no lines, THE Application SHALL disable the confirm control.
5. WHEN the user activates the confirm control on a confirmable draft, THE Confirmation_Engine SHALL permit persistence.
6. THE Application SHALL NOT create an Order, finalize a Bill, change catalog stock or share content as a result of recording, transcription or parsing alone.
7. THE Confirmation_Engine SHALL reject a persistence request that does not originate from an explicit user confirmation action.
8. WHEN the user activates the confirm control twice in succession, THE Application SHALL create exactly one record.

### Requirement 12: Order Awaaz workflow

**User Story:** As a Shop_Operator, I want to capture a customer's spoken grocery list as a structured order, so that I can save it without typing each item.

#### Acceptance Criteria

1. THE Order_App SHALL provide Home, Capture, Resolve, Review, Orders and Catalog screens.
2. THE Order_App Home screen SHALL display New Order, recent orders, the Online_Indicator and the pending sync count.
3. WHEN the user starts a new order, THE Order_App SHALL let the user select an existing customer or choose Walk-in.
4. WHEN a Transcript is submitted, THE Order Workflow_Adapter SHALL produce an editable Order draft containing Candidate_Lines with product, quantity, unit and unit price snapshot from the Catalog.
5. WHEN the fixture utterance "do kilo aata, ek litre tel aur paanch kilo chawal" is processed against the Demo_Shop Catalog, THE Order Workflow_Adapter SHALL produce lines for wheat flour 2 kg, cooking oil 1 litre and rice 5 kg.
6. THE Order_App Review screen SHALL display customer, items, quantities, units, prices, delivery or pickup choice, an optional note and the estimated total.
7. IF any order line has unresolved product, quantity or unit, THEN THE Order Workflow_Adapter SHALL report validation issues and `canConfirm` SHALL return false.
8. WHEN the user confirms an Order, THE Order_App SHALL save the Order with a human-readable local order number and display Saved on this device.
9. THE Order_App Orders screen SHALL list saved Orders with search, filter by status, Sync_State and a detail view.
10. WHEN an Order is saved, THE Order_App SHALL store a product name and unit price snapshot on each order line.
11. WHEN the Application is reloaded after an Order is confirmed, THE Order_App SHALL display the saved Order.
12. THE Order_App Catalog screen SHALL display products, aliases, price, unit and availability from the shared Catalog in read-only form.

### Requirement 13: Bill Awaaz workflow

**User Story:** As a shop cashier, I want to speak the items for a bill and get an editable itemized receipt with exact totals, so that I can finalize it quickly.

#### Acceptance Criteria

1. THE Bill_App SHALL provide Home, Capture, Line editor, Review, Finalize and Bills screens.
2. THE Bill_App Home screen SHALL display New Bill, recent bills, the total of today's finalized bills for the Demo_Shop, the Online_Indicator and the pending sync count.
3. WHEN the user starts a new bill, THE Bill_App SHALL let the user select an optional customer.
4. WHEN a Transcript is submitted, THE Billing Workflow_Adapter SHALL produce an editable Bill draft whose matched lines carry the current Catalog unit price.
5. IF a Bill line has no Catalog price, THEN THE Billing Workflow_Adapter SHALL require an explicit manual price entry or removal of the line before finalization.
6. THE Bill_App Line editor SHALL let the user edit product, quantity, unit, unit price and discount, and add or remove lines.
7. THE Billing domain package SHALL compute every line total, subtotal, discount and final total as integer Paise.
8. THE Bill_App Review screen SHALL display line items, quantity, unit price, line total, optional discount, subtotal and final total, and SHALL display tax only where tax is explicitly configured.
9. WHEN the user activates Finalize Bill on a confirmable draft, THE Bill_App SHALL save the Bill with status finalized, assign a receipt number and display a receipt preview.
10. WHEN a Bill is finalized, THE Bill_App SHALL store a product name and unit price snapshot on each bill line.
11. WHEN the user activates print, share or copy on a finalized Bill, THE Bill_App SHALL perform that action through the browser print dialog, the system share sheet or the clipboard.
12. THE Bill_App SHALL label the receipt as a cash memo / receipt and SHALL NOT present it as a GST tax invoice.
13. WHILE a Bill has status finalized, THE Bill_App SHALL prevent edits to that Bill.
14. WHEN a correction to a finalized Bill is requested, THE Bill_App SHALL create a separate void or correction record linked to the original Bill and leave the original Bill unchanged.
15. THE Bill_App Bills screen SHALL list saved Bills with search, filter, receipt reopen, print again and Sync_State.
16. WHEN the user types three Catalog items, edits one quantity, finalizes the Bill and reloads the Application, THE Bill_App SHALL display the saved Bill with the recomputed total.

### Requirement 14: Bill arithmetic

**User Story:** As a shop cashier, I want totals to be exact, so that receipts never show rounding errors.

#### Acceptance Criteria

1. THE Billing domain package SHALL represent all money values as integer Paise.
2. THE Billing domain package SHALL compute each line total from unit price in Paise and quantity using a single documented rounding rule that returns an integer.
3. FOR ALL valid bills, THE Billing domain package SHALL produce a subtotal equal to the sum of its line totals.
4. FOR ALL valid bills, THE Billing domain package SHALL produce a final total equal to the subtotal minus the discount plus the tax.
5. FOR ALL valid bills, THE Billing domain package SHALL produce line totals, subtotal and final total that are non-negative integers.
6. IF a discount exceeds the subtotal, THEN THE Billing domain package SHALL report a validation issue and `canConfirm` SHALL return false.
7. THE Application SHALL convert Paise to rupees for display only.
8. WHEN a quantity is changed on a line, THE Billing domain package SHALL recompute the line total, subtotal and final total.

### Requirement 15: Local persistence

**User Story:** As a Shop_Operator, I want records saved on my device, so that work survives reloads and airplane mode.

#### Acceptance Criteria

1. THE Local_Database SHALL define stores for shops, products, customers, orders, orderItems, bills, billItems, outbox, syncMeta and auditEvents.
2. THE Local_Database SHALL generate UUIDs on the client for all record ids and for every `mutationId`.
3. THE Local_Database SHALL expose repositories and transactions through the `local-data` package, and Application UI components SHALL access persistent data only through those repositories.
4. THE Local_Database SHALL include a versioned schema with migrations.
5. WHEN a record is confirmed, THE Local_Database SHALL write the domain records, an audit event and an Outbox Mutation in a single IndexedDB transaction.
6. IF the single transaction fails, THEN THE Application SHALL display a save error, SHALL NOT report the record as saved and SHALL leave no partial domain record or Mutation in the Local_Database.
7. WHEN a catalog price changes after an Order or Bill is saved, THE Local_Database SHALL leave the price snapshot on existing order and bill lines unchanged.
8. FOR ALL record sets saved to the Local_Database, reading the records back SHALL produce values equal to the saved values (round trip).
9. THE Application SHALL provide local data clear and local data export controls and a plain-language explanation of what syncs to the cloud.
10. THE Application SHALL NOT write full transcripts, customer phone numbers or receipt contents to the console or to analytics in production builds.

### Requirement 16: Outbox sync with Appwrite

**User Story:** As a Shop_Operator, I want my saved work to sync safely when I am online and have opted in, so that nothing is lost or duplicated.

#### Acceptance Criteria

1. WHERE the user has opted in to cloud sync and signed in, THE Sync_Engine SHALL push pending Mutations to the Sync_Backend in batches.
2. WHILE the device is offline or the user is not signed in, THE Sync_Engine SHALL keep Mutations in the Outbox and SHALL NOT discard them.
3. THE Sync_Engine SHALL derive the unique Appwrite document or row ID of each create-once entity (orders, order items, bills, bill items and corrections) from the `mutationId`, so that a repeated Mutation produces no additional remote row, and SHALL use the entity ID with a timestamp-guarded upsert for products and customers.
4. WHEN the same Mutation is pushed more than once, THE Sync_Backend SHALL leave exactly one remote entity for that Mutation.
5. WHEN the Sync_Backend accepts a Mutation, THE Sync_Engine SHALL mark the Mutation as synced and update the related record Sync_State to synced.
6. IF the Sync_Backend returns a validation failure or a network error, THEN THE Sync_Engine SHALL retain the Mutation, increment attempts, record the last error and schedule the next attempt with backoff.
7. THE Sync_Engine SHALL trigger a sync attempt on application launch, the browser online event, page visibility resume, completion of a local write while online, a periodic in-app interval while the Application is open and the Sync Now action.
8. WHERE the browser supports the Background Synchronization API, THE Sync_Engine SHALL register it as an additional trigger and SHALL NOT depend on it for correctness.
9. WHEN the user activates Sync Now, THE Application SHALL start a sync attempt and display the result.
10. THE Application SHALL display the Sync_State values pending, failed and synced and the online or offline state, together with the pending Mutation count.
11. WHEN the Sync_Engine pulls remote changes, THE Sync_Engine SHALL store the pull cursor and last successful sync time in syncMeta.
12. IF a remote record is newer than the local record for an open order, THEN THE Sync_Engine SHALL keep the local record, store conflict metadata and set the Sync_State to conflict.
13. WHEN catalog fields differ between local and remote, THE Sync_Engine SHALL apply last-write-wins using `updatedAt` and display the last synced time.
14. THE Sync_Engine SHALL treat a finalized Bill as immutable and SHALL sync corrections as separate correction events.
15. THE Sync_Backend SHALL apply Appwrite collection and row permissions scoped per user or team so that an authenticated user can read and write only records of that user's shop.
16. THE Application SHALL NOT include an Appwrite server API key or any other privileged secret in frontend code.
17. THE Sync_Backend schema and setup SHALL be provided as versioned definitions (an `appwrite.json` file or setup scripts) in the repository.
18. FOR ALL Mutation sequences containing duplicate deliveries, THE Sync_Engine SHALL produce a remote state equal to the state from delivering each Mutation once (idempotence).
19. THE Sync_Engine SHALL omit the Raw_Transcript and the Normalized_Text from every remote row unless the user has enabled the Sync transcripts setting.
20. THE Application SHALL set the Sync transcripts setting to disabled by default after cloud sync opt-in, and SHALL describe on the opt-in screen which data syncs.

### Requirement 17: Mobile-first UX and accessibility

**User Story:** As a Shop_Operator on a small Android phone, I want a readable, accessible interface, so that I can work quickly with touch.

#### Acceptance Criteria

1. THE Application SHALL support the core workflows at a 360px viewport width in portrait orientation.
2. THE Application SHALL provide touch targets of at least 44 by 44 CSS pixels for primary controls.
3. THE Application SHALL provide one primary microphone control on capture screens with visible Start, Stop and Retry states.
4. THE Application SHALL provide accessible names for the microphone control, recording status and form fields, and SHALL announce status changes to assistive technologies.
5. THE Application SHALL provide keyboard navigation and a visible focus indicator for all controls.
6. THE Application SHALL render mixed Devanagari and Latin text, numerals and the rupee symbol legibly.
7. THE Application SHALL display text for every spoken or transcribed prompt and SHALL NOT present information by audio only.
8. WHERE the user has requested reduced motion, THE Application SHALL disable non-essential animation.
9. THE Application SHALL convey uncertainty, offline state and destructive actions with text labels in addition to color.
10. THE Application SHALL display UI labels in English with Hindi and Hinglish example content.

### Requirement 18: Privacy and security

**User Story:** As a Shop_Operator, I want my voice and business data kept private, so that I control what leaves my device.

#### Acceptance Criteria

1. THE Application SHALL keep audio on the device and SHALL NOT retain raw audio after transcription.
2. WHERE cloud sync is not enabled by the user, THE Application SHALL send no business data to the Sync_Backend.
3. THE Application SHALL require explicit user opt-in and sign-in before any Mutation is sent to the Sync_Backend.
4. THE Application SHALL use only the Appwrite project ID and endpoint as backend configuration in frontend code.
5. THE Application SHALL transmit synced data over TLS.
6. THE Awaaz_Kit SHALL preserve the license notices for all included models and packages.

### Requirement 19: Testing and quality gates

**User Story:** As a maintainer, I want automated tests and measurable quality targets, so that I can verify P0 behaviour before release.

#### Acceptance Criteria

1. THE Awaaz_Kit SHALL include unit tests for normalization, number and unit parsing, alias matching, extraction statuses, amount calculation and validation.
2. THE Awaaz_Kit SHALL include fast-check property tests for non-negative totals, line totals that sum to the subtotal, paise arithmetic without floating-point drift, normalization idempotence and sync idempotency.
3. THE Awaaz_Kit SHALL include component tests for microphone states, transcript editing, ambiguity prompts, confirm-button states and sync status display.
4. THE Awaaz_Kit SHALL include integration tests for the IndexedDB transaction with Outbox, parser-to-review, confirm-to-save and sync push and pull against a fake IndexedDB and a local test backend.
5. THE Awaaz_Kit SHALL include Playwright end-to-end tests for a new order, a new bill, airplane-mode create and reload, reconnect sync and receipt print preview.
6. THE Awaaz_Kit SHALL provide a Voice_Corpus of at least 30 utterances covering Hindi, Hinglish, English, code-switching, brand names, quantity words and deliberate ambiguity, each with a reference transcript and expected structured result.
7. THE Voice_Corpus SHALL contain no identifiable speaker recordings.
8. WHEN the Voice_Corpus is run through the parser, THE Awaaz_Kit SHALL route at least 95 percent of utterances to the correct app-specific parse route.
9. WHEN clean Voice_Corpus transcripts are run against the Demo_Shop Catalog, THE Awaaz_Kit SHALL extract complete exact product and quantity for at least 85 percent of utterances.
10. WHEN the offline save and reload test cases run, THE Awaaz_Kit SHALL retain 100 percent of locally saved records.
11. WHEN the duplicate-Mutation test cases run, THE Awaaz_Kit SHALL create exactly one remote entity per Mutation.
12. THE Awaaz_Kit SHALL provide a GitHub Actions pipeline that runs install, lint, type-check, unit tests, build and a Playwright smoke test.
13. THE Awaaz_Kit SHALL provide an Appwrite permissions isolation test that confirms two users in different shops cannot read each other's records.

### Requirement 20: Kiro workflow evidence

**User Story:** As a hackathon judge, I want visible evidence of spec-driven development with Kiro, so that I can assess the depth of Kiro usage.

#### Acceptance Criteria

1. THE Awaaz_Kit SHALL commit the `.kiro/specs` directory containing requirements, design and tasks for this feature, and SHALL NOT list `.kiro` in `.gitignore`.
2. THE Awaaz_Kit SHALL commit steering files in `.kiro/steering` for product, architecture, safety and privacy, and testing.
3. THE steering files SHALL state the rules: no direct database access from UI components, no writes before confirmation, local-first operation, money in Paise, and no unreviewed guessed fields.
4. THE Awaaz_Kit SHALL commit hook configuration in `.kiro/hooks` that runs targeted tests after edits to parser, storage or sync files and runs lint, type-check, unit tests and build before commit.
5. THE Awaaz_Kit SHALL document in the README the setup, scripts, demo shop reset, offline instructions and known limitations, including that first Speech_Model download requires connectivity.
