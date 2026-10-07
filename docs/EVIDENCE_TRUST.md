# Evidence Trust Model

AMC maturity scoring is evidence-derived. Agents cannot raise their own scores by self-reporting.

## Trust Tiers

- `SELF_REPORTED`: agent-declared telemetry; informational only.
- `ATTESTED`: signed human/notary attestations.
- `OBSERVED`: AMC-observed runtime/tool/gateway evidence.
- `OBSERVED_HARDENED`: observed evidence with stronger assurance context.

Claim kinds (`synthetic_example`, `self_reported`, `observed`, `independently_reviewed`) and the five status dimensions that every result will carry are defined in [CLAIM_KINDS.md](CLAIM_KINDS.md), with the mapping from each trust tier.

## Scoring Rules

- Only observed/attested evidence can elevate high-confidence maturity levels.
- Missing required evidence produces `UNKNOWN` outcomes with capped scores.
- If evidence quality/coverage is weak, AMC returns insufficient-evidence style outputs rather than inflated certainty.

`amc import` stores external artifacts as unverified, `SELF_REPORTED` content. It does not run a maturity evaluation: import summaries contain no question or layer scores, no observed or attested coverage, and no measured integrity or receipt correlation. Numeric zero fields in the legacy report envelope mean no accepted diagnostic evidence; `importProvenance.evaluationPerformed` is `false`. Artifact counts and source references describe what was imported, not evidence quality. Signing an import artifact preserves its integrity without verifying its source claims. Capture observed evidence or obtain a named attestation, then run a full AMC assessment before making maturity claims.

## Anti-Cheat Guarantees

- Agents cannot submit question-level scores directly (current implementation: 89-question bank).
- Auto-answering derives measured levels from ledger events, receipts, approvals, policy checks, assurance runs, and signed config state.
- All critical artifacts and state transitions are signed and auditable.

## Issuer keys

A signature shows who signed a record and that it is unchanged, not that the record is true, and a key shipped inside an artifact cannot vouch for that artifact. `agent-maturity-compass/trust` adds signed trust lists and an admission check that counts a signature only when the verifier operator pinned its key for that purpose. `evidence-authority` and `independent-attestation` are purposes there, and a workspace's own keys are never admitted for them.

Since P0-09 PR 2, `amc bundle verify`, `cert verify`, `cert verify-revocation`, `passport verify`, `assurance cert-verify` and `release verify` refuse an issuer key that is not pinned by `--pubkey` or a signed trust list, and print the key id to pin. `amc verify`, `verify all`, `evidence verify`, `session verify` and `agent-loop verify` fail an unanchored ledger: the monitor key is read from the workspace being verified, so without `--expect-monitor`, `AMC_EXPECTED_MONITOR_FINGERPRINT` or a trust list the check proves internal consistency only. `--allow-unpinned` and `--allow-unanchored` give an integrity-only result with exit code 2, never a trusted one. A monitor key that is distrusted, or revoked in a loaded trust list, fails every one of these checks even with `--allow-unanchored`, and `AMC_EXPECTED_MONITOR_FINGERPRINT` never anchors it, because distrust beats every pin. The workflow `amc ci init` writes pins the auditor key and monitor fingerprint from the repository variables `AMC_AUDITOR_PUBKEY` and `AMC_MONITOR_FINGERPRINT`, never from the `.amc/keys` files in the checkout; set them from the fingerprints recorded when the vault was created. Since PR 3 the same holds for `audit binder verify`, `bench verify`, `benchmark verify`, `backup verify`, `plugin verify`, `plugin registry verify`, `prompt pack verify` and `federate verify-bundle`, and for the imports and installs behind them (`benchmark ingest`, `federate import`, `plugin install`); `docs/security/verifier-inventory.md` lists the seven portable commands outside the issue table that are not wired yet. No trust tier uses issuer admission until P0-18 ties tiers to provenance. See `docs/TRUST_LIST.md`.
