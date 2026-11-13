# Judge test guide

About 10 minutes. No account needed for steps 1 to 6. Everything uses the fictional Demo_Shop "Sharma Kirana (Demo)".

## Setup

From a clean clone:

```
pnpm install
pnpm dev:order   # Order Awaaz
pnpm dev:bill    # Bill Awaaz (separate terminal)
```

The two dev servers use different ports, so they have different origins and separate databases. In a built deployment (`pnpm build`) both apps share one origin: hub at `/`, apps at `/order/` and `/bill/`.

Use a phone-width window (about 360 px). Use `Reset demo` on the About screen any time to restore the demo data.

## Checks

| #   | Do this                                                             | Expect                                                                                                             |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | Open `/order/`. Pick the Demo_Shop.                                 | Loads without login. 24 products, 5 fictional customers.                                                           |
| 2   | Tap the **Sample** chip "Aata, tel, chawal".                        | Transcript filled; chip is labelled Sample, not claimed as recognized speech. Nothing is saved yet.                |
| 3   | Type `do kilo aata aur ek litre Amul`.                              | Atta confirmed. Amul line labelled **Needs review** with up to 3 candidates. Confirm is disabled until you choose. |
| 4   | Choose a candidate, then Confirm. Double-click Confirm.             | One order. "Saved on this device". No duplicate.                                                                   |
| 5   | Open `/bill/`. Type `तीन किलो आलू और दो किलो प्याज और एक किलो टमाटर`. | Total ₹200.00. Edit onion to 3 kg: ₹235.00.                                                                        |
| 6   | Finalize, open receipt.                                             | Titled "Cash memo / receipt". No GST wording. A finalized bill cannot be edited; use void or correction.           |
| 7   | Type `kilo chini`.                                                  | Quantity shown as **Missing**. No default quantity filled.                                                         |
| 8   | Type `do kilo laptop`.                                              | Product **Unmatched**. Not guessed.                                                                                |
| 9   | DevTools, Network, **Offline**. Save a bill. Reload.                | App still loads, bill still listed. Offline badge visible.                                                         |
| 10  | Open About.                                                         | Package list for each app and link to `docs/reuse-proof.md`.                                                       |
| 11  | Open the "How it understood this" inspector.                        | Shows normalize, extract, match, gate stages for the current input.                                                |

## Optional: cloud sync

Sync is off by default and nothing leaves the device until you opt in and sign in. A demo account, if provided, is in the private Devpost field and not in this repo. Alternatively run the self-hosted test backend (`docs/test-backend.md`).

1. About, turn on sync and sign in.
2. Save a bill while offline. Badge shows **Pending**.
3. Go online. Badge becomes **Synced**.
4. Transcripts are not uploaded unless "Sync transcripts" is turned on (off by default).

## Voice

The shipping default provider is `scripted` (typed input plus Sample chips). The on-device model is used only after a user-initiated download, and works offline only after it is cached. See `docs/model-benchmark.md` for what has and has not been measured.

## Automated checks

```
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

## Release gates

- No failing P0 test
- No secret in the repo or bundles
- No finalization without confirmation
- No lost data after offline reload
- No duplicate remote record after retry
- HTTPS PWA verified
- README verified from a clean clone
