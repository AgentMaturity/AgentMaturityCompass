---
"agent-maturity-compass": major
---

Breaking: trust tiers now come from who produced the evidence, not from the operator. `amc eval import --trust-tier` is removed: the flag exits 2 with a pointer to `docs/EVIDENCE_TRUST.md`, and every imported eval event is `SELF_REPORTED` (it was `ATTESTED` by default, and `OBSERVED` on request). Imported events are recorded at import time and keep the file's time as `meta.claimedTs`; an import with a case more than 5 minutes ahead or more than 24 hours old is refused unless `--historical` is passed. The library export `parseEvalImportTrustTier` and the `trustTier` parameter of `importEvalResults` and `evalImportCli` are removed, and `ingestFeedbackOutcome` and `ingestOutcomeWebhook` take `attestationKind` instead of `trustTier`.

`amc attest` no longer upgrades an ingest session to `ATTESTED` on the operator's own key: without `--attester-signature` the rows are `SELF_REPORTED` and labelled self-attested, and with it they are `ATTESTED` only when the signature over the bundle hash comes from a third-party key pinned for `independent-attestation` in a signed trust list (not revoked, distrusted or expired; never the workspace's own keys). `POST /api/v1/evidence/attest` takes the same `attesterSignature`. `amc outcomes attest` and Studio's `/outcomes/ingest` and `/feedback/ingest` record `SELF_REPORTED` signals for both operator sessions and HMAC webhooks, and return that tier. Direct-transport assurance scans are labelled `OBSERVED`.

The ledger refuses `OBSERVED` for imported, manual, webhook and synthetic evidence, and `ATTESTED` without an attestation record. Diagnostic gates, the compliance engine and `amc eval status` re-check stored rows, so rows written by 1.x as imported `ATTESTED` or `OBSERVED` now read `SELF_REPORTED`; the ledger is not rewritten. Scores and compliance results in existing workspaces drop where they rested on imported, self-attested or seeded evidence; that is the corrected result.

The dogfood evidence seeder behind `npm run qa:dogfood-8-agents` refuses unless `AMC_DEV_DOGFOOD=1` in a source checkout, labels its events `synthetic_example`, and no longer raises any maturity level.
