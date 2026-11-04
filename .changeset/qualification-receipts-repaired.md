---
"agent-maturity-compass": patch
---

Contributor tooling only, no runtime change: qualification receipts that were written in older ad hoc shapes now follow `qualification/receipt.schema.json`, with their extra fields kept in the receipt notes, and folders under `qualification/` that had no `receipt.json` or `README.md` have them, written from the folders' own logs and git history, with values that were never recorded marked as not recorded. `npm run check:qualification` reads `qualification/wp29-campaign` as a campaign definition, not a receipt, and six receipt folders whose names could never match their receipt key now use the documented lowercase variant (for example `qualification/2026-10-29-P2-06-D5` is now `qualification/2026-10-29-P2-06-d5-chart`), so the check passes.
