---
"agent-maturity-compass": patch
---

`POST /api/v1/imports` and `POST /api/v1/imports/dry-run` accept `retainOriginals: false`, the API form of `--no-retain-original`. The manifest records the loss. An original that cannot be retained now answers 422 with `IMPORT_ORIGINAL_NOT_RETAINABLE` instead of 500.
