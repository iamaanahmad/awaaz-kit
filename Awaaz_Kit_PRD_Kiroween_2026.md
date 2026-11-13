**AWAAZ KIT  /  PRODUCT REQUIREMENTS DOCUMENT** 

#### **K I R O W E E N   2 0 2 6** 

# **Awaaz Kit** 

Speak naturally. Work effortlessly. 

PRODUCT REQUIREMENTS DOCUMENT Architecture • UX flows • Technology • Delivery plan 

#### **Product direction** 

An offline-first, Hindi/Hinglish/English voice workflow kit demonstrated through two distinct small-business applications: Order Awaaz (voice-to-order) and Bill Awaaz (voice-to-bill). Awaaz Kit is the reusable foundation; the two apps are proof that the foundation is genuinely versatile. 

|**Field**|**Value**|
|---|---|
|Document status|Implementation baseline / v1.0|
|Prepared|9 November 2026|
|Hackathon|Kiroween 2026 — Skeleton Crew|
|Submission deadline|4 December 2026, 2:00 PM Pacific / 5 December 2026, 3:30 AM IST|
|Primary platform|Installable web application (PWA), mobile-first|
|Primary audience|Indian kirana and neighbourhood retail businesses|



This is a build-ready product specification, not a promise that speech recognition will be perfect. All parsed facts remain editable and every consequential action requires explicit confirmation. 

Kiroween 2026  •  Working PRD  •  1 

**AWAAZ KIT  /  PRODUCT REQUIREMENTS DOCUMENT** 

## **Document map** 

|**Section**|**Contents**|
|---|---|
|01|Executive summary and product decision|
|02|Problem, users and product outcomes|
|03|Scope, priorities and non-goals|
|04|Product experience and application flows|
|05|Shared engine: architecture and contracts|
|06|Technology decisions|
|07|Data model and sync design|
|08|Functional requirements and acceptance criteria|
|09|UX, accessibility, privacy and security|
|10|Testing and quality strategy|
|11|Repository structure and Kiro workflow|
|12|Build roadmap and shipping checklist|
|13|Risks, mitigations and fallback decisions|
|14|Kiroween category and student-prize strategy|
|15|Three-minute demo and submission package|
|16|External references|



#### **Decisions locked for the hackathon** 

Build one shared engine and exactly two polished applications. Do not add Kisan Awaaz, actual missed-call telephony, payments, multi-branch inventory, or formal GST invoicing to the MVP. Preserve those as roadmap possibilities. 

## **01. Executive summary and product decision** 

Awaaz Kit is an open-source starter framework for voice-first, offline-capable business workflows. It lets a developer define a workflow-specific vocabulary, intent pack, catalog and confirmation policy while reusing the same voice capture, transcription, normalization, extraction, uncertainty handling, local storage and sync components. 

The hackathon submission will demonstrate the foundation through two separately navigable applications that solve different jobs for the same small-retail audience: 

- Order Awaaz — convert a customer’s spoken shopping request into a structured, reviewable order. 

- Bill Awaaz — convert a shopkeeper’s spoken billing instruction into an editable itemized cash memo / receipt. 

The applications share the same product catalog, language utilities, voice adapter, parser contracts, confidence/uncertainty model, local database, outbox sync and confirmation UX. Their screens, task entry points, domain entities and completion states remain distinct. 

#### **Positioning statement** 

Awaaz Kit helps local businesses turn everyday Hindi, Hinglish and English speech into dependable business records — even when the internet is unreliable — without handing control to an opaque AI system. 

Kiroween 2026  •  Working PRD  •  2 

**AWAAZ KIT  /  PRODUCT REQUIREMENTS DOCUMENT** 

### **1.1 Product principles** 

- Local-first: the app shell, catalog, drafts and saved records remain usable without a network after initial installation and model download. 

- Honest by design: unknown or ambiguous fields are shown as unknown; the system must ask, not guess. 

- Human-confirmed actions: no order creation, bill finalization, inventory change or message sharing occurs before an explicit user action. 

- Deterministic business logic: product matching, quantities, arithmetic, validation and state transitions are rule-based and testable. No cloud LLM is required for the core workflow. 

- Reusable by construction: both apps import shared packages; domain differences are configuration and workflow modules, not copied code. 

- Accessible: large controls, legible Hindi/English text, clear spoken prompts and simple recovery from recognition errors. 

### **1.2 Success outcomes** 

|**Outcome**|**Hackathon target / evidence**|
|---|---|
|Two distinct apps|Both app folders run and are deployable; each has its own entry flow and task-specific UX.|
|Shared foundation|Both apps import the same versioned core packages; no duplicated parser/database/sync implementation.|
|Offline operation|After installation and model download, users can create, edit, save and review records in airplane mode.|
|Safe extraction|Every item, quantity and price is reviewable; missing or ambiguous fields block finalization.|
|Reliable sync|Offline changes queue locally and sync idempotently when online; user can see pending / failed / synced<br>status.|
|Kiro evidence|Repo contains meaningful .kiro specs, steering, hooks and tests showing spec-driven use.|



## **02. Problem, users and product outcomes** 

### **2.1 Problem statement** 

Many small retailers take orders and prepare bills while serving customers, answering calls and handling stock. Typing every item into a form is slow, especially for users who are more comfortable speaking in Hindi or Hinglish. Connectivity can be inconsistent, and generic speech-to-text tools do not understand the shop’s product catalog, aliases, quantities or billing rules. 

The product problem is not merely “transcribe speech”. It is: reliably turn informal speech into structured commercial data, expose uncertainty, let the user correct it, and save the result without losing work when connectivity drops. 

### **2.2 Primary personas** 

|**Persona**|**Context**|**Job to be done**|
|---|---|---|
|Kirana owner / cashier|Runs a neighbourhood shop; uses an Android phone;<br>catalog is small to medium; may prefer<br>Hindi/Hinglish.|Create a correct customer order or bill quickly without<br>typing every line item.|
|Family member / helper|Takes orders while the owner is busy; may not know<br>all product names or prices.|Capture the request, see what is uncertain and ask the<br>customer before committing.|
|Awaaz Kit developer|Builds a voice-enabled workflow for another domain.|Reuse the engine and supply a domain schema,<br>vocabulary, extractor and confirmation policy.|



### **2.3 User needs / jobs-to-be-done** 

- “When a customer tells me a list of groceries, help me capture it as an order without making me type every product.” 

- “When I am preparing a bill, let me speak the items and quantities, but show me the exact prices and total before finalizing.” 

- “When internet access fails, do not block me from recording today’s work or lose what I entered.” 

Kiroween 2026  •  Working PRD  •  3 

**AWAAZ KIT  /  PRODUCT REQUIREMENTS DOCUMENT** 

- “When the speech recognizer gets a product or quantity wrong, let me fix just that field without starting over.” 

- “When I reconnect, sync the saved work safely and tell me what still needs attention.” 

### **2.4 Product boundaries** 

Initial target: single-shop, single-device demo and early pilot. Multi-device simultaneous editing is not a launch requirement. The data model should not prevent multiple devices later, but the MVP prioritizes predictable local work and transparent synchronization over complex distributed conflict resolution. 

## **03. Scope, priorities and non-goals** 

### **3.1 MVP scope (P0 — required)** 

|**Capability**|**Requirement**|
|---|---|
|Installable PWA|Manifest, service worker, app shell and offline route loading on supported Chromium browsers.|
|Voice capture|Record a short utterance with clear recording / stop / retry controls; support typed input as a first-class fallback.|
|Local speech-to-text|Integrate an on-device Hindi/English/Hinglish speech model after an initial model download. Transcripts remain<br>editable.|
|Language normalization|Normalize common Devanagari/Latin spellings, number words, units and shop-specific aliases without rewriting<br>unknown names silently.|
|Intent / slot extraction|Extract workflow action, product candidates, quantities and optional customer fields into a typed draft. No LLM<br>required.|
|Catalog matching|Match against a locally cached shop catalog with exact aliases first and fuzzy suggestions second.|
|Uncertainty handling|Mark missing / ambiguous / unmatched fields. Ask one focused clarification at a time.|
|Confirmation|Show a review card and require an explicit confirm action before creating an order or final bill.|
|Local persistence|Persist catalog, customers, drafts, orders, bills and sync outbox in IndexedDB via Dexie.|
|Sync|Push and pull when online; retry safely; expose sync state and manual Sync Now.|
|Order Awaaz|Create, review, save and list customer orders.|
|Bill Awaaz|Create, review, calculate, save, print/share a cash memo / receipt.|
|Demo dataset|Include a clearly labelled fictional shop catalog and sample customers for judge testing.|



### **3.2 Should-have (P1)** 

- Optional customer phone/name capture and order notes. 

- Printable receipt layout and Web Share / copy summary fallback. 

- Basic catalog editor: create product, update price, add aliases, disable product. 

- Sync history panel with last successful sync and retry failed items. 

- English UI with Hindi/Hinglish example content; localized labels for core screens. 

- A small benchmark page showing the test utterance set and parser outcomes. 

### **3.3 Could-have (P2 / only after P0 is stable)** 

- A separate Kiro Crew app or agent workflow as a bonus-prize experiment. 

- Multiple shop devices and more advanced conflict resolution. 

- CSV import/export for product catalog. 

- Additional language pack, e.g. Maithili, after Hindi/Hinglish is reliable. 

- Customer-facing order confirmation link. 

Kiroween 2026  •  Working PRD  •  4 

**AWAAZ KIT  /  PRODUCT REQUIREMENTS DOCUMENT** 

### **3.4 Explicit non-goals for this submission** 

- Kisan Awaaz, mandi prices, weather or agriculture advisory. This is a future Awaaz Kit vertical, not one of the two required retail demos. 

- Real missed-call / IVR / telephony integration. The order app uses in-app recording or a supplied audio sample. 

- Payment gateway, UPI collection, wallet or settlement. 

- Automatic WhatsApp sending via unofficial automation. Sharing is user-initiated through the system share sheet or a copied message. 

- Formal GST invoice compliance, GST filing, accounting integrations or tax advice. Bill Awaaz creates a basic cash memo / receipt only. 

- Predictive inventory, supplier purchasing, multi-branch stock and staff payroll. 

- A cloud LLM dependency for the core loop. 

#### **Scope guardrail** 

The Skeleton Crew proof is not “two pages that look different”. It is one shared engine with two separate workflows and independently demonstrable applications. Do not start a third app before both required apps pass the acceptance tests. 

Kiroween 2026  •  Working PRD  •  5 

**AWAAZ KIT  /  PRODUCT REQUIREMENTS DOCUMENT** 

## **04. Product experience and application flows** 

### **4.1 Shared onboarding flow** 

**1.** User opens the deployed PWA and sees two app choices: Order Awaaz and Bill Awaaz. 

**2.** First run explains local storage and asks permission to use the microphone only when the user taps the mic. 

**3.** User chooses a demo shop profile or creates a local shop name. The demo profile includes a sample catalog. 

**4.** The app checks whether the speech model is installed. If absent, explain the approximate download size and offer Download / Continue with typing. 

**5.** The app stores settings locally and opens the selected application. No account is required for the local demo. Cloud sync is opt-in and requires sign-in. 

### **4.2 Shared voice-to-structured-data flow** 

User action (record or type) | v Capture adapter -> Audio / text input | v SpeechToTextProvider (local model) -> editable transcript | v Language normalizer -> normalized text + source spans | v Workflow adapter -> intent + candidate slots | v Catalog matcher -> exact match / suggestions / unmatched | v Uncertainty gate -> missing or ambiguous fields? |                         | no                        yes |                         | v                         v Review card <------------- clarification / edit | v Explicit user confirmation | v Local transaction + outbox event | v Sync engine when online 

### **4.3 App 1 — Order Awaaz: voice-to-order** 

Primary task: shop owner or helper captures a customer’s spoken shopping list and saves a structured order. The app user is the shop-side operator; this is not an inbound-call answering service in the MVP. 

#### **Happy path** 

**1.** Open Order Awaaz and tap New Order. 

**2.** Optionally select an existing customer or choose Walk-in. 

**3.** Tap the microphone and speak naturally, for example: “Bhaiya, do kilo aata, ek litre tel aur paanch kilo chawal bhej dena.” 

**4.** The app transcribes locally and shows the transcript in an editable text field. 

**5.** The parser extracts candidate lines: wheat flour 2 kg, cooking oil 1 litre, rice 5 kg. 

Kiroween 2026  •  Working PRD  •  6 

**AWAAZ KIT  /  PRODUCT REQUIREMENTS DOCUMENT** 

**6.** Catalog matcher resolves spoken terms to the shop’s product records and current price snapshots. 

**7.** If a quantity or product is unclear, the app highlights that line and asks for correction; no silent guess. 

**8.** Review the order card: products, quantities, optional customer, delivery/pickup, note and estimated total. 

**9.** User taps Confirm Order. App saves locally, assigns a human-readable order number and queues a sync mutation. 

**10.** Order detail shows Saved on this device / Waiting to sync / Synced. 

#### **Order Awaaz screens** 

|**Screen**|**Key elements**|
|---|---|
|Home|New Order, recent orders, connection badge, pending sync count.|
|Capture|Big mic button, recording timer, transcript editor, type-in fallback, retry.|
|Resolve|Candidate products, quantity/unit controls, missing-field prompts, remove line.|
|Review|Customer, items, prices, total estimate, delivery note, edit and Confirm Order.|
|Orders|Search/filter, status, local/sync status, reopen detail.|
|Catalog|Products, aliases, price, unit, availability; shared with Bill Awaaz.|



### **4.4 App 2 — Bill Awaaz: voice-to-bill** 

Primary task: shop owner or cashier speaks a list of items for a customer bill. The app uses the same catalog and productmatching foundation but follows a billing-specific flow with deterministic arithmetic and an editable receipt. 

#### **Happy path** 

**1.** Open Bill Awaaz and tap New Bill. 

**2.** Optionally select a customer. 

**3.** Speak: “Ramesh ka bill banao. Do Amul Gold, ek kilo chini aur aadha kilo chai patti.” 

**4.** App shows an editable transcript. 

**5.** Parser extracts item candidates; catalog matcher resolves each against catalog aliases. 

**6.** For every matched line, app loads the current catalog unit price and calculates the line total using integer paise. 

**7.** If product, quantity, unit or price is missing/ambiguous, app asks the user to select or edit it. 

**8.** Review the bill with line items, quantity, unit price, line total, optional discount and final amount. 

**9.** User taps Finalize Bill. The bill becomes a saved cash memo/receipt. 

**10.** User may print or share the receipt via system share sheet or copy. Any external send action is user-initiated. 

#### **Bill Awaaz screens** 

|**Screen**|**Key elements**|
|---|---|
|Home|New Bill, recent bills, today’s total for demo data, sync badge.|
|Capture|Mic, transcript, type-in fallback, customer selection.|
|Line editor|Product, quantity, unit, unit price, discount; add/remove line.|
|Review|Receipt preview, subtotal, discount, tax only if explicitly configured, final total.|
|Finalize|Explicit finalization, receipt number, print/share/copy.|
|Bills|Search/filter, open receipt, print again, view sync status.|



Kiroween 2026  •  Working PRD  •  7 

**AWAAZ KIT  /  PRODUCT REQUIREMENTS DOCUMENT** 

### **4.5 Clarification and error flows** 

|**Condition**|**Required behaviour**|
|---|---|
|No transcript|Show retry and text entry; never create an empty order/bill.|
|Unknown product|Show “Not in catalog”; let user search/add a product or remove the item.|
|Multiple product matches|Show up to three candidates with unit/brand; user must choose.|
|Missing quantity|Ask “Kitni quantity?”; do not default to 1 unless the user explicitly selects it.|
|Ambiguous unit|Ask kg / g / litre / piece; do not assume conversion.|
|Missing price|Block bill finalization until a price is entered or line is removed.|
|Low-confidence transcript|Show full editable transcript and highlight uncertain extraction; user may type correction.|
|Offline at save|Save locally first, show pending sync; do not block the user.|
|Sync failure|Keep the local record, show retry state and actionable error; never delete queued mutation.|
|Duplicate tap / retry|Idempotency key prevents duplicate remote order/bill creation.|



## **05. Shared engine: architecture and contracts** 

### **5.1 Logical architecture** 

A W A A Z   K I T +-------------------------------------------------------------+ |                    APPLICATIONS                              | |   apps/order-awaaz                 apps/bill-awaaz            | |   Order workflow                   Billing workflow           | +-----------------------------+-------------------------------+ | +-------------------------------------------------------------+ |                  SHARED WORKFLOW ENGINE                      | |  Workflow adapter  |  Schema validator  |  Confirmation UX   | |  Intent/slot parser|  Catalog matcher  |  Uncertainty gate   | +-------------------------------------------------------------+ | +-------------------------------------------------------------+ |                    SHARED CAPABILITIES                       | |  Audio capture | STT provider | Language normalization       | |  Dexie local DB | Outbox/sync | Audit events | PWA shell       | +-------------------------------------------------------------+ |                                         | v                                         v Local device storage                     Appwrite IndexedDB + Cache Storage                 Auth + Postgres |                                         | +-------------- sync adapter -------------+ 

Architecture rule: applications may define domain-specific workflow configuration and UI, but shared capabilities live under packages/. Any duplicated parser, data-access or sync implementation is treated as a defect. 

### **5.2 Package responsibilities** 

|**Package**|**Responsibility / contract**|
|---|---|
|voice-capture|Microphone permission, recording lifecycle, audio blob/PCM handoff; no business rules.|
|speech-provider|SpeechToTextProvider interface and Shruti ONNX adapter; returns transcript, detected language, timing/metadata<br>when available.|
|language-normalizer|Whitespace/punctuation cleanup, number/unit normalization and alias-friendly token forms; retains raw transcript.|



Kiroween 2026  •  Working PRD  •  8 

**AWAAZ KIT  /  PRODUCT REQUIREMENTS DOCUMENT** 

|**Package**|**Responsibility / contract**|
|---|---|
|intent-engine|Workflow-specific extraction from normalized text into typed candidate objects; no DB writes.|
|catalog-matcher|Exact alias lookup, normalized search and fuzzy suggestions; never silently picks among ambiguous near-matches.|
|confidence-engine|Field status: confirmed, needs_review, missing, unmatched. Numeric confidence is optional and must only be shown<br>if calibrated.|
|confirmation-engine|Builds reviewable action payloads and enforces explicit confirmation before persistence/finalization.|
|local-data|Dexie schema, migrations, transactions and repositories.|
|sync-engine|Outbox, idempotent push, pull cursor, retry/backoff, conflict recording and status events.|
|shared-ui|Mic control, transcript editor, product line editor, uncertainty badge, sync status and confirmation card.|
|domain-order|Order types, order workflow adapter and order-specific validation.|
|domain-billing|Bill types, calculation helpers, receipt numbering and bill-specific validation.|



### **5.3 Core TypeScript contracts (illustrative)** 

type FieldStatus = "confirmed" | "needs_review" | "missing" | "unmatched"; 

type ExtractedField<T> = { value: T | null; status: FieldStatus; sourceText?: string;       // phrase from the transcript, when known confidence?: number | null; // only if calibrated by the provider reason?: string; }; type CandidateLineItem = { productId: string | null; spokenName: string; quantity: number | null; unit: "piece" | "kg" | "g" | "litre" | "ml" | null; quantityField: ExtractedField<number>; productField: ExtractedField<string>; unitField: ExtractedField<string>; }; 

interface SpeechToTextProvider { initialize(): Promise<{ ready: boolean; modelVersion?: string }>; transcribe(audio: Blob, options?: { language?: "hi" | "en" | "auto" }): Promise<{ text: string; language?: string; durationMs?: number }>; } 

interface WorkflowAdapter<TDraft> { parse(text: string, context: WorkflowContext): TDraft; validate(draft: TDraft): ValidationIssue[]; canConfirm(draft: TDraft): boolean; } 

These are contract examples, not prescribed final code. Keep domain types separate from UI components and use Zod (or equivalent runtime validation) at boundaries. 

### **5.4 Reuse proof required for judging** 

- Both apps import the same packages for voice capture, transcript, normalization, catalog, confidence, confirmation, local persistence and sync. 

- A shared test fixture can be processed by both workflows with app-specific output. 

- A new demo workflow can be explained as supplying a new adapter/schema/intent pack, not copying the engine. 

- README includes a “build your own workflow” example with a minimal adapter interface. 

Kiroween 2026  •  Working PRD  •  9 

**AWAAZ KIT  /  PRODUCT REQUIREMENTS DOCUMENT** 

## **06. Technology decisions** 

|**Layer**|**Recommended technology**|**Why / implementation notes**|
|---|---|---|
|Workspace|pnpm workspaces + TypeScript monorepo|Shared packages stay version-aligned; one root .kiro folder and one CI<br>pipeline.|
|Frontend|Vite + React + TypeScript|Fast static build, client-side PWA and predictable browser APIs; no SSR<br>required for this product.|
|UI|Tailwind CSS + shadcn/ui + Lucide|Fast polished mobile-first components; large touch controls and consistent<br>states.|
|Routing|React Router|Separate application entry points and task flows without introducing a meta-<br>framework.|
|PWA/offline shell|vite-plugin-pwa + Workbox|Manifest and service-worker precaching of app shell/assets.|
|Local DB|Dexie.js over IndexedDB|Typed schema, transactions, migrations and reactive reads.|
|Speech recognition|Shruti ONNX + onnxruntime-web (prototype first)|Current project advertises browser ONNX models around 32 MB for<br>Hindi/English/Hinglish; runs locally after download. Must benchmark in target<br>browsers.|
|Audio APIs|MediaRecorder + Web Audio API|Capture and prepare audio locally; keep model adapter isolated from capture<br>logic.|
|Parsing|TypeScript deterministic parser + Zod + Fuse.js|Rule-based number/unit parsing, aliases and catalog suggestions; no cloud<br>LLM dependency.|
|Client state|React state/context; Zustand only if needed|Keep state minimal; IndexedDB is the source of truth for persistent records.|
|Cloud sync|appwrite Auth + Postgres + RLS|Optional sync and user/shop isolation; local-only mode remains functional.|
|Testing|Vitest + Testing Library + Playwright + fast-check|Unit, workflow, browser, offline and property-based tests.|
|Deployment|Cloudflare Pages (static PWA) + appwrite|Simple HTTPS hosting; CDN for app/model assets; database/auth managed<br>separately.|
|CI|GitHub Actions|Install, lint, type-check, unit test, build and Playwright smoke test.|



### **6.1 Speech model decision and feasibility gate** 

Prototype Shruti ONNX first. Its repository documents a web/Node package using onnxruntime-web and a per-language model of about 32 MB. Its published benchmark reports 20.46% word error rate on one Hindi benchmark and 35.21% on a Hinglish benchmark; these are source-reported test-set results, not a promise for local shop recordings. The project also lists limitations around noisy audio, rare names and English technical terms [R1]. Treat this as a candidate, not a guaranteed capability. 

- Day-one spike: load the browser model on desktop Chrome and Android Chrome; record 10 Hindi, 10 Hinglish and 10 English retail utterances. 

- Measure model download, first inference, repeated inference, transcription quality and memory on a mid-range Android device. 

- Do not display a fake “95% accurate” badge. Show transcript for correction and field-level states. 

- Cache model files locally after consent; detect missing/evicted model and provide a Download model action. 

- Keep SpeechToTextProvider replaceable. If Shruti cannot be integrated robustly, test whisper.cpp WebAssembly as a heavier fallback; its browser example warns that performance is CPU-heavy and the tiny model is roughly 74 MB [R2]. 

- Typed input remains available at all times. Offline text workflows must work even when local ASR is not ready. 

#### **Honest offline promise** 

The app shell and local data work offline after installation. Local speech transcription works offline only after the model has been downloaded and retained by the browser. First-time model download requires connectivity; browser storage may be cleared by the OS/user. 

Kiroween 2026  •  Working PRD  •  10 

**AWAAZ KIT  /  PRODUCT REQUIREMENTS DOCUMENT** 

### **6.2 Why not Next.js?** 

Next.js is a good choice for websites with server rendering, route handlers or SEO-heavy pages. Awaaz Kit is primarily an installable, client-side tool whose core differentiator is browser storage, microphone access and offline execution. Vite keeps the deployment model simpler and reduces server/runtime complexity. If a marketing site is needed later, it can be a separate small site. 

## **07. Data model and sync design** 

### **7.1 Local database schema** 

|**Table / store**|**Important fields**|
|---|---|
|shops|id, name, currency=INR, locale, createdAt, updatedAt, syncVersion|
|products|id, shopId, name, aliases[], unit, pricePaise, active, updatedAt, deletedAt|
|customers|id, shopId, name, phone?, notes?, updatedAt, deletedAt|
|orders|id, shopId, localNumber, customerId?, status, note?, totalEstimatePaise, createdAt, updatedAt, syncState|
|orderItems|id, orderId, productId?, nameSnapshot, quantity, unit, unitPricePaise?, lineTotalPaise?, resolutionStatus|
|bills|id, shopId, receiptNumber, customerId?, status, subtotalPaise, discountPaise, taxPaise, totalPaise, createdAt,<br>finalizedAt?, syncState|
|billItems|id, billId, productId?, nameSnapshot, quantity, unit, unitPricePaise, lineTotalPaise|
|outbox|mutationId, entityType, entityId, operation, payload, createdAt, attempts, nextAttemptAt, state, lastError|
|syncMeta|deviceId, lastPullCursor, lastSuccessfulSyncAt, schemaVersion|
|auditEvents|id, entityType, entityId, action, actor, createdAt, metadata|



### **7.2 Data rules** 

- Use UUIDs for local IDs and a unique mutationId for each sync operation. Do not rely on server-generated IDs to create offline records. 

- Store money as integer paise, not floating-point rupees. Convert for display only. 

- Store a product name and unit-price snapshot on each order/bill line; later catalog price changes must not rewrite historical records. 

- Keep original transcript separate from normalized text and structured extraction. Never discard the user’s source phrase after parsing. 

- Keep raw audio temporary in memory/object URL and discard after transcription by default. Do not upload audio in the MVP. 

- Persist local record and outbox mutation in the same IndexedDB transaction. If either fails, show a save error and do not claim it was saved. 

- Finalized bills are immutable in the MVP. Corrections create a void/correction record or a clearly tracked edit; do not silently mutate a finalized receipt. 

### **7.3 Offline-first sync sequence** 

1. User confirms order / bill. 

2. IndexedDB transaction: 

- a. write domain record(s) 

- b. write audit event 

- c. write outbox mutation with UUID idempotency key 

3. UI updates immediately from local DB. 

4. Sync worker checks navigator.onLine and authenticated session. 

5. Push unsynced mutations in batches. 

6. Server upserts with unique mutation_id; duplicate retry is a no-op. 

7. Server returns accepted IDs / validation failures. 

8. Client marks accepted mutations synced and stores pull cursor. 

9. Client pulls newer remote updates and applies safe merges. 

Kiroween 2026  •  Working PRD  •  11 

**AWAAZ KIT  /  PRODUCT REQUIREMENTS DOCUMENT** 

10. If conflict: keep local record, record conflict and ask user to resolve. 

### **7.4 Sync triggers and conflict policy** 

Do not rely on the Background Synchronization API as the only retry mechanism; MDN marks it as limited availability [R3]. Implement these triggers: on app launch, browser online event, page visibility/resume, after local writes when online, periodic inapp retry while open, and a manual Sync Now action. Add Background Sync as a progressive enhancement only where supported. 

|**Case**|**Policy**|
|---|---|
|Network unavailable|Keep local record + queued mutation; show Offline / Pending sync.|
|Retry of same mutation|Server uniqueness constraint on mutationId makes operation idempotent.|
|Remote record newer than local|Do not blindly overwrite; store conflict metadata and show review state.|
|Catalog updates|MVP: last-write-wins for catalog fields, with updatedAt/version and visible last-synced time.|
|Finalized bills|Immutable; changes are new correction/void events, not overwrites.|
|Two devices edit same open order|MVP: flag conflict for manual resolution; full collaborative editing is out of scope.|



## **08. Functional requirements and acceptance criteria** 

### **8.1 Shared engine requirements** 

|**ID**|**Priority**|**Acceptance requirement**|
|---|---|---|
|CORE-001|P0|App shell loads without network after one successful install/visit.|
|CORE-002|P0|Text input can be parsed and saved without model download.|
|CORE-003|P0|Voice recording has clear permission, recording, stop, retry and error states.|
|CORE-004|P0|Local STT adapter is replaceable and does not couple to workflow logic.|
|CORE-005|P0|Transcript remains editable before parsing/confirmation.|
|CORE-006|P0|Unknown products and ambiguous quantities never silently become confirmed values.|
|CORE-007|P0|Confirmation screen is required before creating an order or finalizing a bill.|
|CORE-008|P0|Local record and outbox mutation are committed atomically.|
|CORE-009|P0|Repeated sync of same mutation does not create duplicate remote records.|
|CORE-010|P0|User can see online/offline, pending, failed and synced status.|
|ORD-001|P0|Order Awaaz converts transcript into editable order lines and optional customer details.|
|ORD-002|P0|Order cannot be confirmed with unresolved required fields.|
|BILL-001|P0|Bill Awaaz derives unit prices from catalog or an explicit manual entry.|
|BILL-002|P0|Bill calculations use integer paise and pass rounding tests.|
|BILL-003|P0|Finalized bill can be previewed and printed/shared by explicit user action.|
|KIT-001|P0|Two separate app folders exist in the root GitHub repository.|
|KIT-002|P0|Both apps import the same shared core packages; architecture evidence is documented.|



### **8.2 Definition of done for the two demo journeys** 

- Order journey: from a clean app launch, user can record or type a Hindi/Hinglish order, correct at least one parsed field, confirm it, reload the PWA and still see the order. 

Kiroween 2026  •  Working PRD  •  12 

**AWAAZ KIT  /  PRODUCT REQUIREMENTS DOCUMENT** 

- Bill journey: user can dictate/type three catalog items, correct an item/quantity, see an accurate total, finalize and print/preview a receipt. 

- Offline journey: after model and app shell are cached, turn on airplane mode, create an order and bill, reload app and verify both remain. 

- Sync journey: reconnect, run Sync Now, verify one remote row per local record and no duplicate after a retry. 

- Reuse journey: source inspection shows the shared parser/matcher/storage/sync packages are imported by both applications. 

- Safety journey: no final order or bill is created by recording alone; confirmation button is explicit and user-initiated. 

### **8.3 Suggested quality targets (measure; do not advertise as guarantees)** 

|**Measure**|**Target for demo dataset**|
|---|---|
|Intent routing on curated examples|At least 95% correct app-specific parse route.|
|Product/quantity extraction from clean<br>transcripts|At least 85% complete exact product + quantity on a 30-utterance in-house set after supported<br>vocabulary setup.|
|Uncertainty behaviour|100% of seeded ambiguous/unmatched fixtures are flagged rather than silently finalized.|
|Arithmetic|100% of unit tests/property tests pass for line totals, discounts and sums.|
|Offline data persistence|100% of offline save/reload test cases retain local records.|
|Sync idempotency|100% of duplicate mutation tests create one remote entity.|
|Mobile usability|Core workflows usable at 360px viewport with touch targets around 44px or larger.|



## **09. UX, accessibility, privacy and security** 

### **9.1 Visual and interaction direction** 

- Use a calm, high-contrast interface; prioritize readable item lists and clear status over decorative AI visual effects. 

- A single large microphone control is the primary action on capture screens; include visible Start / Stop / Retry state. 

- Always show the editable transcript above parsed results so users can locate transcription errors. 

- Use text labels with icons; never communicate uncertainty, offline mode or destructive actions by color alone. 

- Use Devanagari-capable fonts and test mixed Latin/Devanagari strings, numerals, currency and long product names. 

- Keep the app usable on a small Android phone in portrait orientation. 

### **9.2 Accessibility** 

- Keyboard navigation and visible focus states for all desktop controls. 

- Accessible labels for microphone, recording status, status announcements and form fields. 

- Large touch targets; avoid gesture-only interactions. 

- Respect reduced motion and adequate text/background contrast. 

- Do not use audio-only prompts; display spoken/transcribed content on screen. 

### **9.3 Privacy and security requirements** 

- Microphone permission is requested only after the user taps Record. 

- Audio stays on-device for the MVP; it is not uploaded or retained after transcription by default. 

- Transcript, customer details and business records are treated as personal/business data. Use dummy data in public demo accounts. 

- Cloud sync is opt-in. Use TLS and appwrite Row Level Security so users can access only their shop/workspace records. 

- Do not put secrets or service-role keys in frontend code. Use appwrite anon/public key with strict RLS; privileged operations stay server-side. 

- Do not log full transcripts, customer phone numbers or receipt contents to analytics or console in production. 

- Provide local data clear/export controls and a clear explanation of what syncs to cloud. 

- Open-source model/package licenses and notices must be preserved in the repository. 

Kiroween 2026  •  Working PRD  •  13 

**AWAAZ KIT  /  PRODUCT REQUIREMENTS DOCUMENT** 

### **9.4 Reliability and browser support** 

Primary test target: current stable Chrome on Android and desktop. Other browsers may be supported on a best-effort basis, but voice model/WASM support must be tested, not assumed. App must detect unavailable microphone, unavailable model, quota/storage errors and sync errors. Ask for persistent storage best-effort where supported and explain that browser storage can still be cleared by the user or operating system. 

## **10. Testing and quality strategy** 

### **10.1 Test layers** 

|**Layer**|**What to test**|**Tools**|
|---|---|---|
|Unit|Normalization, number/unit parser, alias matching, extraction statuses, amount<br>calculation, validation.|Vitest|
|Property-based|Non-negative totals; line totals sum consistently; paise arithmetic has no floating<br>drift; sync idempotency; normalization idempotence where intended.|fast-check|
|Component|Mic states, transcript edit, ambiguity prompts, confirmation button states, sync<br>badge.|Testing Library|
|Integration|IndexedDB transaction + outbox; parser-to-review; confirm-to-save; sync<br>push/pull.|Vitest + fake IndexedDB / local test<br>appwrite|
|End-to-end|New order, new bill, airplane-mode create/reload, reconnect sync, print preview.|Playwright|
|Manual device|Android mid-range phone, desktop Chrome, noisy room, accent/code-switching,<br>low storage, permission denied.|Device checklist + test corpus|



### **10.2 Test utterance corpus** 

Create a small, transparent benchmark under tests/fixtures/voice-corpus/. Obtain consent from speakers; do not publish identifiable recordings. Include a transcript reference and expected structured result for each phrase. Cover clean Hindi, Hinglish, English, code-switching, brand names, quantity words and deliberate ambiguity. 

Example utterance: "Do kilo aata, ek litre tel aur paanch kilo chawal." Expected candidate: wheat-flour: quantity=2, unit=kg cooking-oil: quantity=1, unit=litre rice: quantity=5, unit=kg Expected state: all product/quantity fields confirmed only after review no order persisted until Confirm Order is tapped 

### **10.3 Release gates** 

- No P0 test failures. 

- No critical security finding or exposed secret. 

- No order/bill finalization without explicit confirmation. 

- No lost local data after offline reload test. 

- No duplicate remote record after retry test. 

- PWA manifest, service worker and production HTTPS verified. 

- README setup instructions verified by a clean clone on a second machine or fresh environment. 

Kiroween 2026  •  Working PRD  •  14 

**AWAAZ KIT  /  PRODUCT REQUIREMENTS DOCUMENT** 

## **11. Repository structure and Kiro workflow** 

### **11.1 Recommended monorepo** 

awaaz-kit/ 

├── .kiro/ │├── specs/ ││├── awaaz-core/ ││├── order-awaaz/ ││└── bill-awaaz/ │├── steering/ ││├── product.md ││├── architecture.md ││├── safety-and-privacy.md ││└── testing.md │└── hooks/ ├── apps/ │├── order-awaaz/       # separate application 1 │└── bill-awaaz/        # separate application 2 ├── packages/ │├── voice-capture/ │├── speech-provider/ │├── language-normalizer/ │├── intent-engine/ │├── catalog-matcher/ │├── confidence-engine/ │├── confirmation-engine/ │├── local-data/ │├── sync-engine/ │├── shared-ui/ │├── domain-order/ │└── domain-billing/ ├── appwrite/ │├── migrations/ │└── seed.sql ├── tests/ │├── fixtures/ │├── property/ │└── e2e/ ├── docs/ │├── architecture.md │├── demo-script.md │└── model-benchmark.md ├── LICENSE ├── README.md ├── pnpm-workspace.yaml └── package.json 

For Skeleton Crew, the official rules require two separate application folders in the repository. Keep the shared engine in packages/ and the two apps in apps/; document exactly how to run each one [R4]. 

### **11.2 Required Kiro usage (make it real and auditable)** 

|**Kiro capability**|**Concrete use in this project**|**Evidence to keep**|
|---|---|---|
|Spec-driven development|Write requirements, design and tasks for core, Order Awaaz and Bill Awaaz<br>before implementation.|Committed .kiro/specs files and task<br>checklists.|
|Steering|Set architecture rules: no direct DB access from UI, no writes before<br>confirmation, local-first, money in paise, no unreviewed guessed fields.|.kiro/steering/*.md|
|Hooks|After edits to parser/storage/sync files run targeted tests; before commit run<br>lint, type-check, unit tests and build.|Committed hook configuration and captured<br>examples.|
|Custom agents|Optional: parser engineer, offline QA reviewer, security/privacy reviewer. Use<br>agents for bounded tasks with clear outputs.|Agent definitions / notes and reviewed diffs.|



Kiroween 2026  •  Working PRD  •  15 

**AWAAZ KIT  /  PRODUCT REQUIREMENTS DOCUMENT** 

|**Kiro capability**|**Concrete use in this project**|**Evidence to keep**|
|---|---|---|
|MCP|Only add an MCP server if it materially helps, e.g. issue tracking or<br>documentation lookup; do not add integrations for show.|MCP config and a short explanation of the<br>workflow improved.|
|Property-based testing|Generate quantities, prices, discounts, repeated outbox mutations and<br>normalization inputs to catch edge cases.|fast-check tests + examples of bugs found.|
|Kiro Crew|Optional bonus experiment: a genuinely useful, separately packaged Kiro Crew<br>app; not required for Skeleton Crew.|Separate public repo and feature write-up if<br>pursued.|



### **11.3 Root scripts** 

pnpm dev:order       # run Order Awaaz pnpm dev:bill        # run Bill Awaaz pnpm test            # unit + integration tests pnpm test:e2e        # Playwright tests pnpm lint            # lint all packages/apps pnpm typecheck       # TypeScript checks pnpm build           # production builds for both apps pnpm test:offline    # offline/sync integration suite 

### **11.4 License and provenance** 

Use an OSI-approved license such as MIT or Apache-2.0 for original code, after checking all dependency/model licenses and notices. Keep a THIRD_PARTY_NOTICES.md with model/package attribution, versions and license links. The public GitHub repository must contain a visible license and must not ignore the .kiro directory [R4]. 

## **12. Build roadmap and shipping checklist** 

The schedule below assumes work starts on 9 November 2026 and the submission deadline is 4 December at 2:00 PM Pacific Time. The India local deadline is 5 December at 3:30 AM IST. Set an internal freeze on 3 December evening IST so submission does not depend on a last-minute upload. 

|**Dates (2026)**|**Build phase**|**Deliverable / gate**|
|---|---|---|
|Nov 9–10|Feasibility spike|Shruti browser prototype; 30 sample utterances; offline PWA shell; confirm model load/inference on<br>Android and desktop. Stop and choose fallback if the model is not viable.|
|Nov 11–13|Foundation|pnpm workspace, root .kiro, types, Dexie schema, design tokens, PWA manifest/service worker, demo<br>shop seed.|
|Nov 14–17|Shared engine|Voice adapter, editable transcript, language normalizer, deterministic parser, catalog matcher,<br>uncertainty model and unit fixtures.|
|Nov 18–21|Order Awaaz|End-to-end voice/text order intake, review, confirmation, local save, order list/detail.|
|Nov 22–25|Bill Awaaz|Voice/text bill capture, line editor, exact paise math, finalize, receipt preview/print.|
|Nov 26–28|Offline and sync|Outbox transaction, retry triggers, appwrite schema/RLS, idempotent push/pull, airplane-mode test.|
|Nov 29–Dec 1|Hardening|Playwright flows, Android testing, error states, README, license, CI, demo data, request Kiro credits<br>before Dec 1 12:00 PM PT.|
|Dec 2–3|Submission polish|Deploy both apps, verify judge access, record <3 minute video, finish Devpost copy, blog/social posts<br>if pursuing.|
|Dec 4|Submission buffer|Final QA and submit before 2:00 PM PT; do not rely on late edits.|



### **12.1 Day-one build order (do not skip)** 

**1.** Create a brand-new public/private GitHub repo (make it public before submission) and initialize .kiro at the root. Check that the repository is new work created during the Kiroween submission period. 

**2.** Prototype Shruti ONNX in a bare Vite page before building the full interface. Confirm browser model download, inference, cache persistence and Hindi/Hinglish output. 

Kiroween 2026  •  Working PRD  •  16 

**AWAAZ KIT  /  PRODUCT REQUIREMENTS DOCUMENT** 

**3.** Create 30 representative test utterances and a catalog of 20–30 common grocery products with Hindi/English aliases. 

**4.** Implement the typed-input parsing path first. This isolates intent/parser correctness from speech-recognition accuracy. 

**5.** Connect the same parser output to both app flows. Prove the shared contract before polishing either UI. 

**6.** Add Dexie local save and airplane-mode reload test before adding appwrite. 

**7.** Build Order Awaaz end-to-end, then Bill Awaaz; reuse engine packages, not screens. 

### **12.2 Ship checklist** 

- [ ] Production PWA available over HTTPS; app shell works offline after first visit. 

- [ ] Speech model download status and typed fallback both work. 

- [ ] Order Awaaz and Bill Awaaz each have their own app route/folder and can be run independently. 

- [ ] Shared package imports are demonstrable in both apps. 

- [ ] Local data survives reload and airplane mode. 

- [ ] Sync queue is idempotent; retry and manual sync work. 

- [ ] RLS tested with two users/shops; no cross-shop access. 

- [ ] README contains architecture, setup, scripts, demo accounts, offline instructions and limitations. 

- [ ] Public GitHub repo has an OSI-approved license, /.kiro committed and no secrets. 

- [ ] Public YouTube demo video is under three minutes and actually shows the app running. 

- [ ] Devpost description explains Kiro usage and links both applications, repo and video. 

- [ ] Student details and proof-of-enrollment readiness checked before selecting student bonus eligibility. 

## **13. Risks, mitigations and fallback decisions** 

|**Risk**|**Impact**|**Mitigation / decision**|
|---|---|---|
|Hindi/Hinglish ASR quality is<br>uneven|Wrong products/quantities;<br>undermines trust.|Benchmark immediately; use editable transcript, aliases and mandatory confirmation.<br>Never present ASR confidence as fact accuracy.|
|Browser model too slow on low-<br>end Android|Poor demo experience.|Measure on target device early; offer text input; keep model provider replaceable; use<br>short clips and an explicit processing state.|
|Model cache is evicted|Offline voice stops working.|Check model availability on launch; show download state; request persistent storage<br>best-effort; app data/text workflows still work.|
|Background sync unavailable|Queued data may not sync<br>while app closed.|Retry on app launch, resume, online event and manual action; use background sync<br>only as enhancement.|
|Scope creep into farmer app /<br>missed calls|Two required apps remain<br>unfinished.|Freeze scope: only Order Awaaz + Bill Awaaz. Kisan Awaaz is post-hackathon<br>roadmap.|
|Cross-device conflicts|Data overwrites or duplicates.|Single-device demo first; idempotent mutations; manual conflict review; advanced<br>collaboration out of scope.|
|WhatsApp integration consumes<br>time|Demo delayed / unsupported<br>send.|Use Web Share or copy text; user initiates external share. Do not build unofficial<br>message sending.|
|Kiro usage appears superficial|Weak technical implementation<br>score.|Use specs, steering and hooks in actual development; commit evidence and describe<br>a concrete issue caught by each.|
|GST / invoice compliance<br>ambiguity|User may treat demo receipt as<br>tax invoice.|Call it a cash memo/receipt; no GST invoice claims or tax automation in MVP.|



## **14. Kiroween category and student-prize strategy** 

### **14.1 Primary category: Skeleton Crew** 

#### **Submit Awaaz Kit under Skeleton Crew** 

The project maps directly to the official definition: a lean reusable template demonstrated through two distinct applications. The repository must contain two separate app folders. Select only one main category for this project [R3, R4]. 

Kiroween 2026  •  Working PRD  •  17 

**AWAAZ KIT  /  PRODUCT REQUIREMENTS DOCUMENT** 

Do not submit Awaaz Kit simultaneously to Frankenstein, Costume Contest or Resurrection. The rules FAQ says each project goes into one category; separate submissions are allowed only when they are unique and substantially different projects [R3]. 

### **14.2 Student bonus: Best Student Project — Skeleton Crew** 

Yes, this is the student prize that matches the selected category. It is a bonus prize attached to the Skeleton Crew submission, not a second category choice. The official rules say every member of a submitting team must be attending classes at a recognised academic institution. The submission needs LinkedIn profile(s), student email(s), current year and degree, and school name; proof of current enrollment may be requested [R3]. 

- If submitting solo, confirm current enrollment and prepare the required student details before selecting the student bonus. 

- If adding teammates, every team member must be a current student to qualify for the Student Project award. 

- A completed diploma or being an alumnus is not enough by itself; the requirement is that you are currently attending classes. 

### **14.3 Other prizes / bonus opportunities** 

|**Prize / opportunity**|**Fit**|**What is needed**|
|---|---|---|
|Best Skeleton Crew — $5,000|Primary category.|Two demonstrably distinct apps sharing the same foundation.|
|Best Student Project: Skeleton Crew —<br>$1,500 + one-year Kiro Pro Max|Strong fit if currently enrolled.|Student details and all team members eligible.|
|Best Demo — $1,000|Good opportunity.|A very clear end-to-end video; rule says winner must be top 10% overall and<br>highest Presentation score among eligible entries.|
|Bonus Blog Prize — 2,000 Kiro credits|Good low-cost opportunity.|Publish a public third-party blog post during submission period; explicitly<br>mention it is for Kiroween 2026 and include the URL.|
|Social Blitz — 3-month Kiro Pro+|Possible.|Public social post must start with #KiroweenHackathon26 and explain what<br>Kiro changed about your development approach.|
|Best Kiro Crew App — $1,000|Stretch only.|A separate, newly created Kiro Crew app, its own public GitHub repo and<br>feature write-up; not just using Kiro Crew to build Awaaz Kit.|
|Best Startup Project — $10,000|Conditional.|Only if the entrant can truthfully submit an eligible startup profile as its<br>founder with LinkedIn and startup website; sponsor determines eligibility.|
|Best Ghost of Kiroween Past — $2,000|Unknown.|Only if the entrant registered for Kiroween 2025 and Devpost can verify it.|



### **14.4 Multiple-prize rule** 

One eligible project can win either one Overall Prize or one Category Prize, not both, and can also win any number of Bonus Prizes. Therefore the practical target is: Best Skeleton Crew (or overall placement) plus Student Project: Skeleton Crew and any eligible bonuses [R3]. 

#### **Recommended submission selection** 

Main category: Skeleton Crew. Student bonus: Best Student Project — Skeleton Crew (only if current-enrollment requirements are met). Also pursue Best Demo, Blog and Social Blitz if time permits. Treat Kiro Crew and Startup as conditional stretch bonuses, not core build scope. 

## **15. Three-minute demo and submission package** 

### **15.1 Suggested video outline (2:40 maximum)** 

|**Time**|**Narrative / screen**|
|---|---|
|0:00–0:20|Problem: small shops take orders and create bills while typing is slow and connectivity is unreliable. Introduce Awaaz Kit.|
|0:20–0:45|Show the shared engine diagram: voice/text → transcript → normalization → parser/catalog → uncertainty → confirmation → local<br>save/sync.|



Kiroween 2026  •  Working PRD  •  18 

**AWAAZ KIT  /  PRODUCT REQUIREMENTS DOCUMENT** 

|**Time**|**Narrative / screen**|
|---|---|
|0:45–1:25|Order Awaaz: speak a grocery order in Hinglish; show transcript, extracted items, correction, confirmation and saved order.|
|1:25–2:05|Bill Awaaz: speak three items; show product match, itemized price calculation, editable bill and receipt.|
|2:05–2:30|Turn on airplane mode; create/save a new record; reload and show it persists. Reconnect and show pending → synced.|
|2:30–2:40|Show repository structure with two apps and shared packages; explain the same engine powers both.|



### **15.2 Devpost project description structure** 

- One-sentence elevator pitch. 

- Problem and who experiences it. 

- What Awaaz Kit is (the reusable engine). 

- Order Awaaz: features and workflow. 

- Bill Awaaz: features and workflow. 

- How the same foundation powers both (show package reuse). 

- Offline guarantee and its boundary (first model download requires internet). 

- How Kiro was used: specs, steering, hooks, tests, custom agents/MCP if actually used. 

- Architecture image, product screenshots, live links, GitHub repo, YouTube video. 

- Known limitations and next steps. 

### **15.3 Judge access** 

Provide public URLs to both working applications or a single demo landing page with clear links. If demo data is pre-seeded, explain how to reset it. Avoid requiring login for the primary judge journey. Keep a “Load demo shop” option; never expose real customer information. Include an online demo path if browser storage/model download blocks first-run testing. 

## **16. External references** 

References checked on 9 November 2026. Re-check official rules and dependency licenses immediately before submission. 

**[R1] Shruti — offline speech-to-text for Hindi, English and Hinglish; browser ONNX integration, model sizes and benchmark limitations.** <u>https://github.com/udgamlabs/shruti</u> 

**[R2] whisper.cpp — browser WebAssembly example; model sizes and performance caveats.** 

<u>https://github.com/ggml-org/whisper.cpp/tree/master/examples/whisper.wasm</u> 

**[R3] Kiroween 2026 Official Rules — eligibility, Student Project prize, multiple submissions, judging, prize rules and deadlines.** <u>https://kiroween.devpost.com/rules</u> 

**[R4] Kiroween 2026 FAQ — one category per project, public repo, two app folders for Skeleton Crew, demo requirements.** <u>https://kiroween.devpost.com/details/faqs</u> 

**[R5] Dexie.js documentation — IndexedDB wrapper, schema and transaction support.** <u>https://dexie.org/docs/Dexie.js</u> 

**[R6] vite-plugin-pwa documentation — PWA manifest and Workbox-backed service worker integration.** <u>https://vite-pwa-org.netlify.app/</u> 

##### **[R7] MDN — Offline and background operation for PWAs.** 

<u>https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation</u> 

**[R8] MDN — Background Synchronization API; limited browser availability.** 

<u>https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API</u> 

**[R9] appwrite Database documentation — managed PostgreSQL foundation for optional cloud sync.** <u>https://appwrite.com/docs/guides/database/overview</u> 

#### **Final product decision** 

Ship Awaaz Kit as the reusable offline-first voice workflow foundation with Order Awaaz and Bill Awaaz as the two proof applications. Make the typed workflow reliable first, prove local persistence, then integrate on-device speech, then add cloud sync. The strongest demo is not a perfect transcription claim; it is a trustworthy workflow that exposes mistakes, asks for confirmation and never loses a saved transaction. 

Kiroween 2026  •  Working PRD  •  19 

