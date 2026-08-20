# AMC Gap Register — Execution Log

Tracks execution of the 289 gaps in `amc-gap-register.md`, in order, one at a time.
Branch: `amc/gap-register-execution`. Baseline: `f419839a` (typecheck clean).

Gate for every gap: `tsc --noEmit` clean + affected tests pass + real behavior verified.

| Gap | Status | Commit | Verification |
|---|---|---|---|
| G1-01 assurance syntheticResponse | ✅ DONE | `fba5824e` | Real agent execution seam; same agent now scores 10 pass/3 fail on injection pack (was a guaranteed pass). Fail-closed with no report written when no target. 208 assurance tests pass. |
| G1-02 redteam synthetic engine | ✅ DONE | `c0ebbf69` | Red-team now surfaces 3 real vulnerabilities (was always 0). Also fixed a second facade: 0 scenarios scored 100 → now INSUFFICIENT_EVIDENCE/0. |
| G1-03 evil-MCP synthetic agent | ✅ DONE | `15dc87e2` | Real tool-calling. Safe agent → 100 / 0 dangerous calls; unsafe agent → 65 / **10 dangerous calls caught**. Facade scored both identically. |
| G1-04 `amc attack` synthetic respondFn | ✅ DONE | `faaf0fc2` | Safe agent 84 (0 failed) vs complying agent 60 (2 failed). Also fixed 0-plugins→100 resilience. |
| G1-05 jailbreak TAP/runner defaults | ✅ DONE | `8f9fa7ac` | Both synthetic defaults deleted; respondFn now required + async. 63 tests pass. |
| G1-06 five lab packs canned answers | ✅ DONE | `f9194c45` | Canned answers → real adversarial prompts. Tests prove discrimination (safe passes, complying agent trips compound-threat + shutdown resistance, unreachable → INCONCLUSIVE). CLI + 2 routers fail closed (503). |
| G1-07 safetyTestkit auto-refusal | ✅ DONE | `9b73c758` | Removed both auto-passing defaults (no-arg and bare agent-id). Refusing agent 0 failures vs compliant agent >0. |
| G1-08 shield red-team `Math.random()` | ✅ DONE | `5a537b3a` | Real attacks + jailbreak detector. Safe agent **0.0%** vs jailbroken agent **100.0%** (was ~20% noise). |
| G1-09 playground Math.random comparison | ✅ DONE | `2f8ae363` | Executor now required; no fabricated latency/tokens. |
| G1-10 offline scenarios `passed: true` | ✅ DONE | `2f8ae363` | Now `pending`; summary reports "N not executed" instead of counting them as passes. |
| G1-11 agentSimulator fake evidence | ✅ DONE | `ec8e6e34` | Explicit policy-preview vs agent mode; `evidenceGenerated` truthful. Refusing vs leaking agent now differ. |
| G1-12 mock LLM judge | ✅ DONE | `e6b13107` | Wired the real OpenAI/Anthropic client (was `{score:0.8,"Mock judge response"}`). Also fixed hardcoded `hitRate: 0`. |
| G1-13 hallucination judge silent failure | ✅ DONE | `bd7850a4` | Failed judge now throws instead of returning `[]` ("clean"). Added `createProductionJudgeFn`. |
| G1-14 cognitionLab simulated scores | ✅ DONE | `98891582` | Explicit "no model called" warning + header. |
| G1-15 product facades via live CLI | ✅ DONE | `222c271f` | Deleted devSandbox/jobs/planGenerator/workflowEngine + 2 fabricating CLI commands. |
| G1-16/17 self-referential scoring | ✅ DONE | `8c0a4d28` | **Customer repos no longer scored ~0 for not being AMC.** Scope guard on 3 CLI cmds, 4 API routes (422), CI gate. |
| G1-18 unifiedRun file-existence grades | ✅ DONE | `4f02bee8` | Removed 6 dead heuristic scorers (~6.8k chars); live path does real signature/ledger verification. |
| G1-19/20 synthetic runs in run store | ✅ DONE | `9bfe830b` | org-runs/ + imported-runs/ segregation; integrity/confidence no longer perfect. |
| G1-21 buildMockReportForUx | ✅ DONE | `2adc70fe` | **4 dashboards no longer render a fake "VALID / HIGH TRUST" diagnostic.** |
| G1-22/23 demo + dogfood labeling | ✅ DONE | `98891582` | Scripted-illustration banner; dogfood OBSERVED-seeding warning. |

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
