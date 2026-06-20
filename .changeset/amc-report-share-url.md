---
"agent-maturity-compass": patch
---

Add diagnostic report share bundles. `amc report <run|alias|latest> --share` now writes a static `index.html` plus `share-manifest.json`, prints a local file URL, and can print a public URL with `--public-base-url` for user-custodied static hosting.
