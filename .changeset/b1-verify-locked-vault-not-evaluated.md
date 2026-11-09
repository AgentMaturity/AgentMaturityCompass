---
"agent-maturity-compass": minor
---

`amc verify`, `amc session verify`, `amc verify all` and `amc evidence verify` no longer report a healthy workspace as tampered when they run with the vault locked (cron, `docker exec`, `kubectl exec` or an agent shell: no terminal and no `AMC_VAULT_PASSPHRASE`). An encrypted payload whose key the locked vault holds is reported as not evaluated, with the hint "vault locked: export AMC_VAULT_PASSPHRASE or set AMC_VAULT_PASSPHRASE_FILE, or run from your terminal", instead of `payload authentication failed`, and the running gateway's session is named open instead of `missing seal`. Such a run is never a pass: `amc verify` prints `Ledger verification NOT EVALUATED` and exits 1; `amc verify all` marks `ledger-hash-chain` SKIP, reports `INCOMPLETE` and exits 1, also under `--allow-unanchored`. A payload that does not open under a reachable key still fails as before, and every other verifier keeps failing a payload it cannot open.
