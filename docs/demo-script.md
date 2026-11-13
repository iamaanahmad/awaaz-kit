# Demo script (2:40 video)

Maps to the "Demo readiness" table in `.kiro/specs/awaaz-kit/design.md`. Total target: 2:40.

Recording rules:

- Use the Demo_Shop ("Sharma Kirana (Demo)"). Press **Reset demo** on About before each take so totals match this script.
- Use **Sample** chips or typed text for the scripted path. Say "Sample" out loud when a chip is used. Do not describe chips as recognized speech.
- Show the real microphone path only if the Speech_Model is cached and the take works. Otherwise skip it. Do not claim voice accuracy beyond `docs/model-benchmark.md`.
- All names and products are fictional. No GST claims; the receipt is a "Cash memo / receipt".
- Screenshots and recordings are captured by hand. Nothing in this repo is pre-recorded.

| #   | Time | Segment                                     | Length |
| --- | ---- | ------------------------------------------- | ------ |
| 1   | 0:00 | Problem and kit                             | 0:20   |
| 2   | 0:20 | Order Awaaz, including the "Amul" ambiguity | 0:50   |
| 3   | 1:10 | Bill Awaaz                                  | 0:35   |
| 4   | 1:45 | Offline to synced                           | 0:30   |
| 5   | 2:15 | Reuse proof                                 | 0:15   |
| 6   | 2:30 | Judge access and close                      | 0:10   |

## 1. Problem and kit (0:00 to 0:20)

Screen: hub page at `/`, then the layered diagram from `docs/architecture.md`.

Narration:

> Small shops take orders and write bills by speaking, in Hindi, Hinglish and English. Awaaz Kit is an open-source, offline-first starter kit for that. One shared engine, two installable apps: Order Awaaz and Bill Awaaz.

## 2. Order Awaaz (0:20 to 1:10)

Screen: `/order/`, Capture.

1. (0:20) Tap the chip **Sample: Aata, tel, chawal**. Transcript fills with `do kilo aata, ek litre tel aur paanch kilo chawal`. Narrate: "This is a sample clip, so it works without a microphone."
2. (0:30) Open **How it understood this**. Walk the stages: normalize, extract, match, gate. Point at the number words becoming quantities.
3. (0:40) Edit the transcript by typing a new line: `do kilo aata aur ek litre Amul`. Narrate: "Typed input is first-class."
4. (0:45) Review shows atta as confirmed and the Amul line with the **Needs review** label. Narrate: "Amul matches milk, butter and ghee. The app does not guess. Confirm stays disabled."
5. (0:55) Pick **Amul Gold Milk** from the options (up to three shown). The line becomes confirmed by a user action.
6. (1:02) Press **Confirm order**. Show **Saved on this device**.

Expected review values: atta 2 kg, Amul Gold Milk 1 litre.

## 3. Bill Awaaz (1:10 to 1:45)

Screen: `/bill/`, Capture.

1. (1:10) Type: `तीन किलो आलू और दो किलो प्याज और एक किलो टमाटर`. Three lines appear with catalog prices.
2. (1:20) Lines screen: total shows ₹200.00 (potato 3 kg ₹90.00, onion 2 kg ₹70.00, tomato 1 kg ₹40.00).
3. (1:28) Quantity correction: change onion from 2 kg to 3 kg. Total updates to ₹235.00. Narrate: "Money is integer paise, so the total is exact."
4. (1:35) Confirm and finalize. Open the print preview titled **Cash memo / receipt**. Note: no GST claims.

## 4. Offline to synced (1:45 to 2:15)

Prerequisite: sync opted in and signed in beforehand (off camera) with a test account or the local test backend (`docs/test-backend.md`). If sync is not configured, show only steps 1 to 3 and say so.

1. (1:45) DevTools, Network, **Offline** (or airplane mode). The **Offline** badge appears.
2. (1:50) Create a second bill by typing `Ramesh ka bill banao, dedh kilo cheeni aur ek litre tel`. Expected total ₹217.00 (sugar 1.5 kg ₹72.00, oil 1 litre ₹145.00). Confirm. Badge reads **Pending (1)** or similar.
3. (2:00) Reload the page while offline. The bill is still in the list.
4. (2:05) Go back online. The `SyncBadge` goes from **Pending** to **Synced**. Narrate: "Retries cannot create a duplicate, the mutation id is idempotent."

## 5. Reuse proof (2:15 to 2:30)

Screen: About, package list for each app, then `docs/reuse-proof.md`.

Narration:

> Both apps import the same engine packages. This report is generated from the real import graph, and lint fails if an engine package imports a domain package.

## 6. Judge access and close (2:30 to 2:40)

Screen: About, **Reset demo** button; repo README.

Narration:

> The Demo_Shop loads without login, and Reset demo restores it. Built with Kiro specs, steering, hooks and property tests. Code is open source.

## Retake checklist

- Reset demo before each take; clear the draft.
- Browser window about 390 px wide for the phone view; zoom 100 percent.
- Hide bookmarks, personal tabs and the `.env.local` file from the screen.
- No account credentials visible on screen.
