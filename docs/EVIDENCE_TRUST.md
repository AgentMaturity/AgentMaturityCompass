# Evidence Trust Model

AMC maturity scoring is evidence-derived. Agents cannot raise their own scores by self-reporting.

## Trust Tiers

- `SELF_REPORTED`: agent-declared telemetry; informational only.
- `ATTESTED`: signed human/notary attestations.
- `OBSERVED`: AMC-observed runtime/tool/gateway evidence.
- `OBSERVED_HARDENED`: observed evidence with stronger assurance context.

## Scoring Rules

- Only observed/attested evidence can elevate high-confidence maturity levels.
- Missing required evidence produces `UNKNOWN` outcomes with capped scores.
- If evidence quality/coverage is weak, AMC returns insufficient-evidence style outputs rather than inflated certainty.

## Anti-Cheat Guarantees

- Agents cannot submit 67-question scores directly.
- Auto-answering derives measured levels from ledger events, receipts, approvals, policy checks, assurance runs, and signed config state.
- All critical artifacts and state transitions are signed and auditable.
