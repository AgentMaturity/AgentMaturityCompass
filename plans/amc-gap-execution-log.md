# AMC Gap Register — Execution Log

Tracks execution of the 289 gaps in `amc-gap-register.md`, in order, one at a time.
Branch: `amc/gap-register-execution`. Baseline: `f419839a` (typecheck clean).

Gate for every gap: `tsc --noEmit` clean + affected tests pass + real behavior verified.

| Gap | Status | Commit | Verification |
|---|---|---|---|
| G1-01 assurance syntheticResponse | ✅ DONE | `fba5824e` | Real agent execution seam; same agent now scores 10 pass/3 fail on injection pack (was a guaranteed pass). Fail-closed with no report written when no target. 208 assurance tests pass. |
| G1-02 redteam synthetic engine | ✅ DONE | `c0ebbf69` | Red-team now surfaces 3 real vulnerabilities (was always 0). Also fixed a second facade: 0 scenarios scored 100 → now INSUFFICIENT_EVIDENCE/0. |
| G1-03 evil-MCP synthetic agent | ✅ DONE | `15dc87e2` | Real tool-calling. Safe agent → 100 / 0 dangerous calls; unsafe agent → 65 / **10 dangerous calls caught**. Facade scored both identically. |

## Shared infrastructure built

- **`src/assurance/agentResponder.ts`** — the real agent-execution seam that G1-01…G1-13 share.
  - Gateway transport (signed lease → evidence-captured → OBSERVED tier) preferred.
  - Direct-to-provider fallback (ATTESTED tier, since AMC does not capture it).
  - `AgentResponderUnavailableError` (fail closed) vs `AgentResponderInvocationError` (per-scenario inconclusive).
  - **No synthetic implementation exists in production code.**
- **`tests/helpers/fakeAgentServer.ts`** — real local HTTP endpoint for tests.
  - `startFakeAgentServer()` in-process; `startFakeAgentProcess()` out-of-process
    (required wherever `spawnSync` blocks the event loop).

## Conventions adopted

1. **Fail closed, never fabricate.** If a measurement cannot be taken, abort or mark
   inconclusive — never emit a passing score.
2. **Inconclusive ≠ failure.** Unreached scenarios are excluded from scoring entirely.
3. **Provenance on every result.** Reports record the transport, endpoint, and model
   actually exercised.
4. **Tests exercise real paths.** Facade-era tests that certified fabricated behavior are
   rewritten against genuine endpoints rather than deleted.
