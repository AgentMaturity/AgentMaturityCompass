---
"agent-maturity-compass": patch
---

Verify false-positive and cognition-lab records on read, detect a deleted newest workspace record, and read signed evaluation artifacts through one verified-artifact registry.

- False-positive lists, cost summaries and tuning reports, and cognition-lab reports and comparisons, now read stored records through the verifying reader. A record whose hash or signature fails is left out and reported as an UNVERIFIED line, and the output carries `evidenceStatus` (MEASURED or INSUFFICIENT_EVIDENCE) and an `outcome` that is `not_evaluated` when there is nothing to measure. The tuning report carries a self-reported claim label. `amc fp-tuning-report` now reads reports persisted by earlier commands.
- Each workspace record store keeps a head anchor beside its record directory. Deleting the newest record, or rolling it back to a kept revision, is reported as HEAD_MISSING, and the finding survives later writes. A store with records but no anchor is reported as HEAD_UNANCHORED. Updated records no longer read as HASH_MISMATCH. Diagnostic runs were already covered by the ledger's newer-run check.
- `readVerified(kind, …)` in `src/crypto/signing/verifiedArtifacts.ts` maps assurance certificates, passports, bench artifacts and audit binders to their existing verifiers. A failing artifact is refused as UNVERIFIED, and an unregistered kind is refused as UNKNOWN_KIND. The certificate summary that passports and binders embed, and standard schema validation, now read through it.
