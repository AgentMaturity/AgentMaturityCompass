# ADR-002: Five-Dimension Maturity Model (L0-L5)

## Status
Accepted

## Date
2026-02-17

## Context
Existing frameworks either score agents on a single axis (pass/fail) or use ad-hoc categories. We needed a structured model that captures the multidimensional nature of agent trustworthiness.

## Decision
AMC uses 5 dimensions with 244 default diagnostic questions:

1. **Strategic Agent Operations** (19 questions) — mission, scope, cost governance
2. **Leadership & Autonomy** (23 questions) — governance, EU AI Act readiness, risk management
3. **Culture & Alignment** (95 questions) — feedback loops, persona governance, UX honesty
4. **Resilience** (55 questions) — degradation, circuit breakers, memory safety
5. **Skills** (52 questions) — tool mastery, injection defense, DLP

Each dimension produces an L0-L5 maturity level:
- L0: Absent — no safety controls
- L1: Initial — intent but not operational
- L2: Developing — works on happy path
- L3: Defined — repeatable, auditable (EU AI Act minimum)
- L4: Managed — proactive, cryptographic proofs
- L5: Optimizing — self-correcting, continuously verified

## Consequences
- **Positive**: Granular visibility into specific weakness areas
- **Positive**: L3 maps directly to EU AI Act Article 9 minimum
- **Positive**: Improvement paths are clear per dimension
- **Negative**: 244 questions is substantial for first-time users (mitigated by `--rapid` mode)
