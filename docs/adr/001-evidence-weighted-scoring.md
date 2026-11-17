# ADR-001: Evidence-Weighted Scoring Over Self-Reported Claims

## Status
Accepted

## Date
2026-02-17

## Context
Most AI agent evaluation frameworks rely on self-reported capabilities, documentation claims, or simple pass/fail test results. This creates a trust gap: agents can claim safety compliance without any verification.

## Decision
AMC scores agents based on **execution-verified evidence** with a tiered trust model:

| Tier | Side-score weight | Source |
|------|--------|--------|
| OBSERVED_HARDENED | 1.1× | AMC-controlled adversarial scenarios |
| OBSERVED | 1.0× | Captured via gateway proxy |
| ATTESTED | 0.8× | Cryptographic attestation |
| SELF_REPORTED | 0.4× | Agent's own claims (capped) |

Correction (2026-11-16): no weight is applied to a maturity level. A question's level is gated by evidence tier: only OBSERVED evidence can support L2 and above, and self-reported or attested evidence supports L1 at most. The weights above scale side scores only (confidence, citation quality, drift, community signals), from the one table in `src/score/trustWeights.ts`.

## Consequences
- **Positive**: Scores reflect actual behavior, not marketing claims
- **Positive**: Gaming resistance — inflating scores requires fooling observed scenarios
- **Negative**: Agents without gateway integration get lower scores (by design)
- **Negative**: Initial setup is slightly more complex than a checklist
