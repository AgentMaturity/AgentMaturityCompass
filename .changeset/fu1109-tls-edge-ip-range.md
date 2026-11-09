---
"agent-maturity-compass": patch
---

The TLS Compose stack (`deploy/compose/docker-compose.tls.yml`) starts again. Studio joins the `amc_edge` network before Caddy and was given Caddy's fixed address `172.16.250.2`, so Caddy failed with "Address already in use" and the stack served no HTTPS. Studio now takes its address from `ip_range: 172.16.250.8/29`. `amc doctor` names `AMC_VAULT_PASSPHRASE_FILE` beside `AMC_VAULT_PASSPHRASE` when the passphrase is available.
