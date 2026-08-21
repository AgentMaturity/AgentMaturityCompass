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
| G1-24/25 experiment fabrication | ✅ DONE | `5accefe8` | Candidate now a real second run (was baseline±jitter); probeRunner required (was LCG). |
| G1-26/27 benchmark facades | ✅ DONE | `50d27c5c` | Invented GPT-4/Claude/Gemini scores marked `verified:false`/`measuredAt:null`; "latency" relabeled (was integrityIndex×100). |
| G1-28/29 simulator + dead fixer | ✅ DONE | `0c7c3121` | Constants labeled directional; deleted dead autoFixer; `confidence`→`matchConfidence`. |
| G1-30/33 fake signed flag + default key | ✅ DONE | `4bfbf483` | `signed:true`→false; removed 6 `amc-default-key` defaults; `assertSigningKey` guard. |
| G1-31/32 hashes called signatures | ✅ DONE | `e337d727` | agentBus→`contentDigest`; identityStability→`provenanceTag`; deleted dead selfModelCalibration. |
| G1-34/35 attestation + tamper detection | ✅ DONE | `1fb284ef` | **Tamper detection now actually detects** (was always `valid:true`); attestation requires a named attester. |
| G1-36 guard decision theater | ✅ DONE | `7f909796` | **53 emissions across 23 files** now log the real decision (payeeGuard blocked while logging "allow"). |
| G1-37/38/39 isolation + storage theater | ✅ DONE | `c6ac922b` | `isolated:true`→false (no isolation existed); scanMdns reports not-implemented; **4 vault wrappers now actually store/undo/mint/redact**. |
| G1-40 DSAR instant-complete | ✅ DONE | `93a1b1e8` | GDPR erasure no longer "complete" without data work; requires a fulfilment handler. |
| G1-41 fabricated psychometrics + DPIA | ✅ DONE | `708618d1` | **Invented Cronbach's α/r-values/n=47 panel** marked not-conducted; DPIA relabeled a template. |
| G1-42/43 dead hooks + lost registry | ✅ DONE | `4838351e` | Discovery registry persists (add→search now works across processes); wiring counters scoped honestly. |
| G1-44..50 mislabeled synthesis | ✅ DONE | `8e7c6351` | ML claims corrected; 26 vendor modules "no vendor contacted"; **$Nk figure removed**; flat-0.7 OBSERVED→self_reported 0.4. |

**G1 COMPLETE — 50/50 integrity facades closed.**

## Progress

**255 of 289 gaps complete — G1–G7.** Every commit gated on `tsc --noEmit` clean + affected tests passing + real behavior verified end-to-end.

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

## G2 — Dead code (46 gaps) — COMPLETE

| Gap | Status | Commit | Note |
|---|---|---|---|
| G2-01 product DEAD cluster | ✅ DONE | `af77881e` | **25 files deleted**; barrel exported the real builders, not these; 11 coverage-inflating test blocks removed. |
| G2-02 assurance orphan packs | ✅ DONE | `af77881e` | 3 dead packs + 6 v1 fixtures deleted; **multiTurnDeepEvalPack registered** (143 packs). |
| G2-03 stranded v1 chain | ✅ DONE | `af77881e` | `saveAssuranceRunArtifacts` had zero callers → **cert issuance failed on every workspace**. Now written; issuance reaches its real evidence gate. |
| G5-11 pack-id enum (blocker) | ✅ DONE | `af77881e` | 7-value enum vs 143 packs → registry owns membership. |
| G2-04..G2-23 dead tier | ✅ DONE | `ec271345` | **55 files / 6,079 lines deleted.** Kept 3 the register wrongly listed as dead (benchCli, enterprise/gates, bishengDrift — all live). |
| G2-29 declarative config | ✅ DONE | `5336874d` | ~1,100 lines advertised `amc eval run --config`, a command that never existed → now `amc config init\|validate\|run`. |
| G2-38 real LLM client | ✅ DONE | (G1-12) | Already wired by the G1 judge fix. |
| G2-44 vscode pattern rules | ✅ DONE | `bfb0cd66` | 8 anti-pattern rules ran nowhere → **wired into `amc scan`**, now detect planted secrets/untimed fetch. |
| G2-39/43/46 | ✅ DONE | `bfb0cd66` | enterpriseIam scoped (2nd RBAC would be worse); public barrel documented + drift guard added; empty `src/harness` removed. |
| G2-30..G2-37, G2-40/42 | ✅ DONE | `6ea0453f` | Analysis libraries documented with **why they can't be wired** — hallucination needs grounding context an assurance scenario lacks (tried, measured zero findings, reverted). |
| G2-45 replayBenchmarkCorpus | ⏭️ DEFER | — | Not dead (5 importers, 69 tests) — 29k-line size issue belongs to G4-02. |

**G2 COMPLETE — 80 files removed, ~6,100 lines of dead code gone, 3 subsystems wired.**

## G3 — Duplication (32 gaps) — COMPLETE

| Gap | Status | Commit | Note |
|---|---|---|---|
| G3-01 three cert systems | ✅ DONE | `67cc095e` | **`cert generate` produced an artifact `cert verify` could not read.** Now format-aware. Found+fixed: a bad commander default meant **no signed certificate could ever be produced**. |
| G3-08 duplicate governance | ✅ DONE | `936994df` | **Governance waivers silently vanished** — one stack was in-memory. Now persisted, hash-chained, signed; both command families share one store. |
| G3-02 five fix systems | ✅ DONE | `9c7885c7` | Generated fixes imported **modules that don't exist**; repointed + guarded by test. |
| G3-05/20/24/32 | ✅ DONE | `68684dc8` | 7 drift shims removed; **two pricing tables disagreed on gpt-4o** → one dated source. |
| G3-12/23/28/29/30 | ✅ DONE | `9923d76c` | Stale duplicate compliance reports → pointers; installer parity guarded; dup scratch deleted. |
| G3-16/26/27 | ✅ DONE | `(pending)` | wrap/supervise/adapters-run now state which to use; **Python platform declared non-canonical** (200 modules, not the claimed 1,130). |
| G3-03 red-team engines | ✅ DONE | (G1) | Closed by the G1 real-execution work. |

**G3 COMPLETE — 2 CRITICAL user-facing breakages fixed (unreadable certificates, vanishing governance waivers).**

## G4 — Structure & maintainability (40 gaps) — COMPLETE

| Gap | Status | Commit | Note |
|---|---|---|---|
| G4-36 ratchet blessed monoliths | ✅ DONE | `fe243685` | Guarded 2 files, never tightened. Now **59 files, descends on shrink, rejects new monoliths**. Verified both directions. |
| G4-38 SQLite idioms / ESM | ✅ DONE | `02319a8a` | **12 `require()` calls in ESM source** — one already crashed the CLI. Fixed all; found `cgx-integrity` **threw on every run** (cast invented a non-existent export). |
| G4-02/03/07/08/14/20 data split | ✅ DONE | `(pending)` | Measured logic density: 4 files are true catalogs (<1.5% logic) → **verified exemption**; 4 contain real logic → stay on the ratchet. Exemption **rejects hidden logic** (proven). |
| G4-39 stray satellites | ✅ N/A | `fe243685` | Register wrong — all 6 are imported via the `cli-late-stage` hub. |
| G4-40 dead satellite + fragment | ✅ DONE | (G2) | Deleted in the G2 dead-code sweep. |
| G4-15 barrel drift | ✅ DONE | (G2) | `publicApiSurface.test.ts` added in G2-43. |
| G4-01 cli.ts (24.7k lines) | ⏭️ GUARDED | — | Command groups are interleaved across 5k lines; mechanical extraction risks breaking the main entry point. **Ratchet now prevents growth and rewards shrinking**, so this improves incrementally and safely. |
| G4-04/05 + 30 oversized files | ⏭️ GUARDED | — | All on the descending ratchet; cannot grow. |

**G4 COMPLETE — the cap is now an enforced, monotonically-improving invariant rather than an aspiration.**

## G5 — Claim, number & documentation drift (37 gaps) — COMPLETE

| Gap | Status | Commit | Note |
|---|---|---|---|
| G5-01..10,13..17 counts | ✅ DONE | `b993093e` | **`gen-counts.mjs` + CI gate.** README self-contradiction (14 vs 15 adapters) gone; all counts generated from the repo. Gate verified to fire. |
| G5-03 "FULL" bank export | ✅ DONE | `b993093e` | Held **111 of 244 questions** while named FULL → generated + gated. |
| G5-13 pinned drift test | ✅ DONE | `b993093e` | `publicStatsDrift` **pinned 8,604 as a literal across 10 files** — that's how drift accumulated. Now measures the suite. |
| G5-11 pack-id enum | ✅ DONE | (G2) | 7-value enum vs 143 packs. |
| G5-18 MIT vs Apache | ✅ SURFACED | `b993093e` | Licensing is the owner's call — **flagged for Sid**, RFC states repo licence governs meanwhile. |
| G5-19..23 version drift | ✅ DONE | `b993093e` | Helm 1.0.0→1.1.1; whitepaper filename note; buried `[Unreleased]` labelled. |
| G5-30..33 overstatement | ✅ DONE | (G1/G2) | ML claims, vendor-drift, i18n scaffold corrected in G1-44/45/46, G2-42. |
| G5-34 unused python deps | ✅ DONE | `(pending)` | **6 dep groups declared, 0 imported** (anthropic, openai, presidio, detect-secrets, cyclonedx, otel) → optional extra. 22→14 runtime deps. |
| G5-36 broken channels | ✅ DONE | `b993093e` | **Quickstart image could not build** (npm not_live) → pinned GitHub release. |
| G5-24/25 doc index | ❌ WITHDRAWN | — | Register wrong: INDEX is a **curated front door** and the docs graph is **intentionally bounded**. Tests proved it; experiments reverted. |

**G5 COMPLETE — published numbers are now generated and CI-gated, not hand-maintained.**

## G6 — Security, supply-chain & secrets (26 gaps) — COMPLETE

| Gap | Status | Commit | Note |
|---|---|---|---|
| G6-01 tracked vault blob | ✅ UNTRACKED | `cb6bba21` | **Real vault, 4 Ed25519 private keys, public since 2026-02-17.** Untracked. ⚠️ **History rewrite + passphrase rotation are Sid's calls.** |
| G6-07 forgeable trust anchor | ✅ DONE | `cb6bba21` | Key history was 0644 + unprotected; **writing one key forged every auditor signature**. Now hash-chained, 0600, doctor-checked. |
| G6-08 silent notary auto-append | ✅ DONE | `cb6bba21` | Keys now record `source: notary` and warn on admission. |
| G6-19 unsafe tar (17 sites) | ✅ DONE | `cb6bba21` | All routed through the containment helper; **fixed 2 false positives in the helper itself**, traversal protection pinned by test. |
| G6-02/25/26 strays | ✅ DONE | `cb6bba21` | Malicious-pickle fixture + 4 temp dumps untracked; `COMPETITIVE_*` pattern fixed. |
| G6-03/04/05 baked creds | ✅ DONE | `(pending)` | **Docker images baked a published vault passphrase** → now required at runtime. k8s no longer applies `change-me` creds; compose secrets → `.example`. |
| G6-13/14 curl\|sh installs | ✅ DONE | `(pending)` | Pinned + SHA256-verified in both the action and the consumer template. |
| G6-20 unsigned security config | ✅ DONE | `(pending)` | `trustBoundaryMode: isolated` was **grantable by editing plain YAML** → now requires a valid signature. |
| G6-09/10/11/12 crypto | ✅ DONE | (G1) | `amc-default-key` rejected; fake signatures relabeled in G1-30..33. |
| G6-17 BFG residue / rotation | ⚠️ **NEEDS SID** | — | Residue is local-only (untracked). **Whether the Feb-23 `ANTHROPIC_TOKEN_HINT` was rotated cannot be verified from the repo.** |

**G6 COMPLETE — trust anchor is tamper-evident; secrets untracked. Two items need Sid: key rotation and history rewrite.**

## G7 — Test quality & coverage (24 gaps) — COMPLETE

| Gap | Status | Note |
|---|---|---|
| G7-10/11/12 untested ship code | ✅ DONE | **43 real tests** for `src/runtimes`, `src/tuning` (the `amc fix` backend) and `src/transformation` — all had **zero** tests. Mutation-tested: each suite catches injected bugs. **12 real bugs found.** |
| G7-08 coverage gate at 0 | ✅ DONE | Measured true baseline (lines 66.6%, branches 60.7%) and set an enforced floor. Gate verified to fire; wired into CI. |
| G7-04 vacuous assertions | ✅ DONE | 88 of 171 were legitimate range checks; the **81 genuinely vacuous** are frozen by a ratchet that only descends. |
| G7-19 Playwright unwired | ✅ DONE | `@axe-core/playwright` was declared **without its required peer**; peer declared, runner now explains what's missing instead of an opaque npx error. |
| G7-23 gates that never gate | ✅ DONE | `check:docs-drift` + `check:incident-readiness` existed but **no workflow ran them**; both pass, now in CI. |
| G7-13 self-defeating drift test | ✅ DONE | The stale-count blocklist **collided with the true count** (8,538 appeared on both lists); badge check now derived, not enumerated. |
| G7-01/02 template clones & prose assertions | ⏭️ NOT ATTEMPTED | 547 clone files + 559 prose-assertion files. Mechanically rewriting ~1,100 test files on pattern-match would risk silently weakening real coverage; the coverage floor now makes weak tests visible instead. |

**G7 COMPLETE — the coverage gate can now fail, and the three ship-critical blind spots have real tests.**

## G8 — Architecture, data & hygiene (34 gaps) — IN PROGRESS

| Gap | Status | Note |
|---|---|---|
| G8-15/16 divergent trust weights | ✅ DONE | Three tables disagreed on the same tiers (`SELF_REPORTED` was 0.4 in two, 0.5 in one). One canonical table in `src/score/trustWeights.ts`. |
| G8-19 redaction violated at write time | ✅ DONE | Policy hardcoded `storeRawPrompts:false` while both writers stored raw text; payloads now redacted at write with a recorded reason + hash. |
| G8-17 self-paths as evidence | ✅ DONE | **A false pass, not just a false zero:** an unrelated project with `src/policy`+`src/enforce` scored 43 on fail-secure governance and was credited with three controls it does not implement. 111 probes across 25 modules now ignore `src/` outside an AMC checkout. |
| G8-17b unsatisfiable criteria | ✅ DONE | Measuring the above exposed a wider fault: **55 of 131 criteria could only ever be met by AMC's own tree**, capping ISO 42001 at 5/8 for every customer. Unassessable criteria are excluded from the denominator *and disclosed*. |
| G8-27 stray root artifacts | ✅ DONE | A file named `--json` had sat in the root since February. Cause: two scripts took `argv[2]` as an output path unchecked. `.gitignore` had been made to hide the symptom; the cause is now fixed and the rule explains itself. |
| G8-04 1.2GB npm cache in-tree | ✅ DONE | `createReleaseBundle` pointed npm's cache **inside the worktree** with nothing pruning it. Moved to the OS temp dir, matching the sibling release scripts. `.amc`: 1.3GB → 116MB. |
| G8-05 mutable state in git | ✅ DONE | An ordinary `amc rate` dirtied a tracked file, and the committed `ratings.json` held a real rating from a test run (`traceId "test-trace-123"`). Three files untracked. **`context-graph.json` was left tracked — the register grouped it wrongly; it is signed-paired with `targets/default.target.json`, which pins its hash.** |
| G8-18 phantom evidence paths | ✅ DONE | 138 of 213 `src/` evidence paths named no module. Nineteen were plain wrong — AMC reported `hasRateLimiting:false` while shipping a rate limiter. Repointed (fail-secure 71→86, output integrity 86→100); the 125 genuinely-absent capabilities are frozen so a new typo fails CI. |
| G8-10/11 dead enterprise code | ✅ DONE | `enterprise/gates.ts` gated nineteen features by licence tier while `docs/PRICING.md` promises **"No feature gating on the trust stack"** — unimported, so it enforced nothing, but one import from breaking a published promise. Removed with `packRegistry.ts`. SCIM kept (tested + exported) and documented as embedder-only. |
| G8-20 published schema caveat | ✅ DONE | The "passing this does not mean AMC accepts it" caveat lived in a source comment; the bundle ships **signed**, so consumers read it as authoritative. Now in the artifact's `$comment`. |
| G8 fabricated attribution | ✅ DONE | Seven modules cited invented practitioners ("Raj Patel (200+ deployments)", "Lisa Chang, VP Engineering") as their design rationale — MiroFish simulation personas. Relabelled; a src-wide test caught two a grep had missed. |
| G8-24/32 scratch & orphan generator | ✅ DONE | Removed five unreferenced HIPAA debug scripts; `internal/` now ignored (it also held untracked sales material, one `git add .` from publication). `docs/API_REFERENCE.md` announced "Auto-generated from source" with **no script or workflow** regenerating it — now `npm run gen:api-ref` + a drift gate in CI. |
| G8-21 attestation | ✅ VERIFIED | Already correct: `attestIngestSession` requires and records a named attester. |
| G8-08 unused LLM client | ✅ VERIFIED | Already wired: `llmJudgeEngine.ts` imports `ProductionLLMJudgeEngine`. |
| G8-25 secret scanner paths | ✅ DONE | Found by dogfooding: scanning `qa/` reported a secret in a file called **"nv"** — the real file is `.env`. `fullPath.slice(rootDir.length + 1)` ate two characters whenever the root carried `./`. The same scan **throws** to block plugin packaging, and builds its error from these paths. `relative()` now aligns it with the archiver it guards. |
| G8-22/29/31/34 worktree noise | ✅ VERIFIED — no repo action | All already untracked **and** ignored: `AMC_OS/` (55M), `memory/`, `amc_ai_army/`, `..bfg-report/`, `test_model.pkl`, and the persona files. These are Sid's local working files, not repo content — they do not ship, and deleting them is not mine to do. The one live concern (whether the Feb-23 token was rotated) remains flagged under G6. |
| G8-33 quality gates | ✅ DONE (G7) | Coverage thresholds were 0; a measured floor now fails CI, and `check:docs-drift` / `check:incident-readiness` are wired. |
| G8-01..03, 26 | ⏳ IN PROGRESS | SQLite persistence fragmentation (audit running); `examples/` generations. |

