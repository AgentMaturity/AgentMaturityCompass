# Model Governance

This document governs AMC forecasting model behavior, reproducibility, and auditability.

## Versioning

Forecast artifacts include a fixed `modelVersion` (for example `theil_sen_v1`).

Any model logic change must:

- update model version identifier
- be covered by deterministic tests
- preserve canonical output schema

## Reproducibility

AMC forecasting is deterministic:

- canonical JSON serialization
- fixed algorithms and thresholds
- no random seeds, no LLM calls

Given the same inputs and policy, output must be identical prior to signature timestamp/envelope metadata.

## Signing + Verification

Forecast policy, latest artifacts, and snapshots are signed via AMC signer abstraction:

- local vault signer in `LOCAL_VAULT` mode
- Notary signer when trust policy requires it

Verification must succeed offline using existing AMC verify flows.

## Audit Trail

Forecast generation and advisory creation append transparency entries:

- `FORECAST_CREATED`
- `ADVISORY_CREATED`

This gives a hash-chained issuance history and Merkle inclusion proofs.

## Safe Update Process

When changing forecasting behavior:

1. Update policy/model code and tests.
2. Validate deterministic output on fixtures.
3. Sign and apply policy changes.
4. Recompute forecasts and review advisories before acting.

