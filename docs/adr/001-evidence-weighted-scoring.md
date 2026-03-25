# ADR-001: Evidence-Weighted Scoring Over Self-Reported Claims

## Status
Accepted

## Date
2026-02-17

## Context
Most AI agent evaluation frameworks rely on self-reported capabilities, documentation claims, or simple pass/fail test results. This creates a trust gap: agents can claim safety compliance without any verification.

## Decision
AMC scores agents based on **execution-verified evidence** with a tiered trust model:

| Tier | Weight | Source |
|------|--------|--------|
| OBSERVED_HARDENED | 1.1× | AMC-controlled adversarial scenarios |
| OBSERVED | 1.0× | Captured via gateway proxy |
| ATTESTED | 0.8× | Cryptographic attestation |
| SELF_REPORTED | 0.4× | Agent's own claims (capped) |

Self-reported evidence is capped at 0.4× weight to prevent gaming.

## Consequences
- **Positive**: Scores reflect actual behavior, not marketing claims
- **Positive**: Gaming resistance — inflating scores requires fooling observed scenarios
- **Negative**: Agents without gateway integration get lower scores (by design)
- **Negative**: Initial setup is slightly more complex than a checklist
