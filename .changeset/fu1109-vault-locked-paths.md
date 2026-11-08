---
"agent-maturity-compass": patch
---

The "🔐 Vault locked" signing refusal now names paths that work without a terminal: export `AMC_VAULT_PASSPHRASE`, or set `AMC_VAULT_PASSPHRASE_FILE`, or run `amc vault unlock` from a terminal (before, it suggested only `amc vault unlock`, which refuses in cron, `docker exec`, `kubectl exec` and agent shells). The text is written once; Studio and API routes keep mapping it to 423 `VAULT_LOCKED`, now by its fixed prefix, so the variants that federation, integrations and the Studio supervisor threw map to 423 too. `amc verify --repair --apply` names the same paths.
