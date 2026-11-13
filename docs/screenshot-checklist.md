# Screenshot checklist

Screenshots are captured by hand from the running apps with the Demo_Shop after **Reset demo**. This file lists what to capture. No images are committed unless someone actually captured them.

Settings: 360 x 780 viewport, 100 percent zoom, English UI. Save as PNG under `docs/screenshots/` using the file names below. Do not show `.env.local`, credentials, or personal browser data.

| Done | File                            | App     | Screen and state                                                |
| ---- | ------------------------------- | ------- | --------------------------------------------------------------- |
| [ ]  | `hub.png`                       | Hub `/` | Links to both apps                                              |
| [ ]  | `order-capture-sample.png`      | Order   | Capture with Sample chips and transcript filled                 |
| [ ]  | `order-inspector.png`           | Order   | "How it understood this" expanded                               |
| [ ]  | `order-ambiguity-amul.png`      | Order   | Review with the Amul line **Needs review** and Confirm disabled |
| [ ]  | `order-saved.png`               | Order   | "Saved on this device" after confirm                            |
| [ ]  | `order-orders-list.png`         | Order   | Orders list with the saved order                                |
| [ ]  | `bill-capture-hindi.png`        | Bill    | Hindi transcript for potato, onion, tomato                      |
| [ ]  | `bill-lines-total.png`          | Bill    | Lines with total ₹200.00                                        |
| [ ]  | `bill-lines-corrected.png`      | Bill    | Onion 3 kg, total ₹235.00                                       |
| [ ]  | `bill-receipt.png`              | Bill    | Print preview titled "Cash memo / receipt"                      |
| [ ]  | `bill-missing-price-or-qty.png` | Bill    | A **Missing** field blocking finalize                           |
| [ ]  | `offline-badge.png`             | Either  | Offline badge with a saved record                               |
| [ ]  | `sync-pending.png`              | Either  | SyncBadge **Pending**                                           |
| [ ]  | `sync-synced.png`               | Either  | SyncBadge **Synced**                                            |
| [ ]  | `about-reuse.png`               | Either  | About with package list and Reset demo                          |
| [ ]  | `mobile-focus.png`              | Either  | Visible keyboard focus on a 44 px control                       |

Notes:

- Each status screenshot must show the text label, not only colour.
- `scripts/capture-demo-assets.mjs` is not provided; automate only if the output is real Playwright captures of the running app.
- Remove any screenshot showing real personal data. Demo names carry the "(Sample)" suffix.
