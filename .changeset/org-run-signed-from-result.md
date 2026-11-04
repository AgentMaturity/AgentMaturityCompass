---
"agent-maturity-compass": patch
---

`amc org run` reports a signature only when a signing call returned one. Before, its Vault surface read `complete` with a ref to `org-run.json.sig` whenever `AMC_VAULT_PASSPHRASE` was set (or, earlier, `NODE_ENV=test` or `VITEST`), even when signing then failed and no `.sig` existed. Now the org-run artifact's and the parent lifecycle artifact's Vault surface lists the signatures the role and parent lifecycle signing calls returned, reads `complete` only when every one of them was signed, and otherwise reads `degraded` with "N of M lifecycle artifact(s) were not signed". An artifact cannot record its own signature: the org-run artifact's signature is the `.sig` file beside it, and the command's result returns its path, or null when signing was skipped or failed.
