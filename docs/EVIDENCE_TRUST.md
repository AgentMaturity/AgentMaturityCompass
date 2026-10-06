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
