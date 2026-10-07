---
"agent-maturity-compass": major
---

Breaking: value events can no longer be labelled `ATTESTED` by their writer, and stale observations no longer count as `ATTESTED`.

- `amc value ingest`, `amc value import`, Studio's `/value/ingest/webhook` and Studio's value CSV import record every event as `SELF_REPORTED` with `signatureValid: false`. An operator session or a webhook token authenticates the sender, but nothing verifies a third-party signature on value events. `--attested` was removed and now exits 2 with a pointer to `docs/EVIDENCE_TRUST.md`, and the Studio CSV import answers HTTP 400 to a request carrying `attest`. `ingestValueWebhookForApi` no longer takes `sourceTrust`, and `importValueCsvForApi` no longer takes `attest`. Events AMC's own collector records stay `OBSERVED`.
- In the diagnostic gates, an `OBSERVED` event older than 90 days now counts as `SELF_REPORTED` instead of `ATTESTED`. A stale `OBSERVED_HARDENED` event still counts as `OBSERVED`. With self-reported evidence capped at L1, stale observations alone no longer support L2 or higher.
