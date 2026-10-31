---
"agent-maturity-compass": patch
---

Contributor tooling only, no runtime change: qualification receipts that were written in older ad hoc shapes now follow `qualification/receipt.schema.json`, with their extra fields kept in the receipt notes, and folders under `qualification/` that had no `receipt.json` or `README.md` have them, written from the folders' own logs and git history, with values that were never recorded marked as not recorded. `npm run check:qualification` reads `qualification/wp29-campaign` as a campaign definition, not a receipt.
