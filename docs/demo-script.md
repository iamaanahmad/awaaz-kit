# Demo script (2:50 video)

Target 2:50, hard limit 3:00. Every value below was checked against the Demo_Shop seed and the parser on the current `main` build.

## Before recording (off camera)

1. The live site must run the latest build (no "Check order" button on Order capture, model size "about 50 MB" everywhere).
2. Use one browser profile on `https://awaazkit.vercel.app` so the hub, `/order/` and `/bill/` share one catalog.
3. On About in each app, press **Reset demo** and confirm, so receipt and order numbers start fresh.
4. On Order capture, press **Download model** and wait until the card says **Voice is ready on this device**. Then reload once, so the first load (about 10 s) is not on camera.
5. Do one practice mic take of the utterance in segment 2. If it fails twice, use the typed fallback written under that step.
6. Window about 390 px wide (or a real phone screen recording), zoom 100%. Hide bookmarks, personal tabs, `.env.local` and any credentials.

Recording rules:

- Say "Sample" out loud whenever a Sample chip is used. Never describe a chip as recognized speech.
- Claim only what `docs/model-benchmark.md` measured: 25.4% word error rate on 20 Hinglish clips, on a laptop CPU. Do not claim phone speed or accuracy.
- Do not demo cloud sync. It is not configured on the live build, and the app says so.
- All names and products are fictional. The receipt is a "Cash memo / receipt" and makes no GST claims.

| #   | Time | Segment                                | Length |
| --- | ---- | -------------------------------------- | ------ |
| 1   | 0:00 | Problem and kit                        | 0:15   |
| 2   | 0:15 | Order Awaaz: real voice, on the device | 0:35   |
| 3   | 0:50 | Order Awaaz: the app does not guess    | 0:35   |
| 4   | 1:25 | Bill Awaaz: exact money                | 0:35   |
| 5   | 2:00 | Offline                                | 0:20   |
| 6   | 2:20 | Reuse proof                            | 0:15   |
| 7   | 2:35 | How Kiro built it, and close           | 0:15   |

## 1. Problem and kit (0:00 to 0:15)

Screen: hub page at `/`.

> Small shops take orders and write bills by speaking, in Hindi, Hinglish and English. Awaaz Kit is an open-source, offline-first starter kit for that: one shared engine, two installable apps, Order Awaaz and Bill Awaaz.

## 2. Order Awaaz: real voice (0:15 to 0:50)

Screen: `/order/`, **New Order**. The model card reads **Voice is ready on this device**.

1. (0:15) Tap the mic and say: **"two kilo sugar and five kilo rice"**. Tap stop.
2. (0:22) The transcript appears and the status reads **2 items found.** Narrate:
   > The speech model runs in the browser. Audio never leaves the phone, and it works offline once downloaded. We measured 25.4% word error rate on real Hinglish clips, so every transcript stays editable.
3. (0:35) If a word was misheard, fix it in the text box on camera. That is part of the story, not a failure.

Expected: Sugar 2 kg, India Gate Basmati Rice 5 kg.

Typed fallback (if the mic take fails): type the same sentence into **Order text** and say "typed this time". Do not present typed text as speech.

## 3. Order Awaaz: the app does not guess (0:50 to 1:25)

1. (0:50) At the end of the transcript, type **` and one litre Amul`**. The status reads **3 items found.** Narrate: "Typed input is first-class."
2. (0:58) Tap **Continue to review items**. On **Resolve items**, the Amul line asks which item it is. Narrate:
   > Amul matches milk, butter and ghee. The app does not guess, and Continue stays locked.
3. (1:05) Optional: tap **Show how it understood this** and point at the candidates.
4. (1:10) Choose **Amul Gold Milk**. **Continue to review** unlocks. Tap it.
5. (1:15) Tap **Confirm order**. **Saved on this device** appears with the order number.

Expected lines: Sugar 2 kg, India Gate Basmati Rice 5 kg, Amul Gold Milk 1 litre. Review shows **Estimated total: ₹618.00** (₹96 + ₹450 + ₹72).

## 4. Bill Awaaz: exact money (1:25 to 2:00)

Screen: `/bill/`, **New Bill**.

1. (1:25) Type into **Bill text**: `तीन किलो आलू और दो किलो प्याज और एक किलो टमाटर`. Status reads **3 lines found.**
2. (1:32) Tap **Review lines**. Total **₹200.00** (Potato 3 kg ₹90.00, Onion 2 kg ₹70.00, Tomato 1 kg ₹40.00).
3. (1:40) Change the onion quantity from 2 to 3. Total updates to **₹235.00**. Narrate: "Money is stored as integer paise, so totals are exact."
4. (1:48) Tap **Review bill**, then **Finalize**. Show the **Cash memo / receipt** with its receipt number, then **Print** to open the print preview. Narrate: "A finalized bill can't be edited. Fixes are separate void or correction records."

## 5. Offline (2:00 to 2:20)

1. (2:00) DevTools, Network, **Offline** (or airplane mode on a phone). The **Offline** status appears.
2. (2:05) Reload `/bill/`. The app and the receipt from segment 4 are still there.
3. (2:10) Tap a Sample chip, for example **Sample: Ramesh ka bill banao, dedh kilo cheeni aur ek litre tel**, and say "Sample". It parses offline: Sugar 1.5 kg ₹72.00, Fortune Sunflower Oil 1 litre ₹145.00, total ₹217.00. You don't need to finalize it.
4. Narrate: "Everything is saved on the device first. Cloud sync to Appwrite is opt-in and off by default."

Do not show sync going to Synced. The home screen honestly reads "N not synced (cloud sync is off)".

## 6. Reuse proof (2:20 to 2:35)

Screen: About in either app (the **Shared packages** list), then `docs/reuse-proof.md` on GitHub.

> Both apps import the same ten engine packages. This table is generated from the real import graph, and lint fails if an engine package imports app-specific code. A third workflow example lives in `examples/appointment-workflow`.

## 7. How Kiro built it, and close (2:35 to 2:50)

Screen: the repo's `.kiro/` folder (specs, steering, hooks), then `docs/kiro-journal.md` at "Property 29: finalized bills could be deleted".

> Built spec-first with Kiro: requirements, design and tasks, steering rules for safety and privacy, and a commit-gate hook that runs lint, typecheck, tests and build. A property test found that a finalized bill could be deleted, and we fixed it. Open source, MIT.

Say only that the hook runs the gates. The journal records no bug caught by a hook.

## Retake checklist

- Reset demo before each take.
- Model card reads **Voice is ready on this device** before segment 2.
- Network back online before starting a new take.
- No credentials or `.env.local` on screen.
