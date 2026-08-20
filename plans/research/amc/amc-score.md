# AMC Scoring — Exploration Report

## 1. STRUCTURE

- **`src/score/`** (102 files) — dimension scorer library. `index.ts` is a pure re-export barrel of ~100 modules. Core math: `formalSpec.ts` (`M(a,d,t)=Σ w·E·decay`). Notables: `maturityTaxonomy.ts` (L0–L5 labels), `evidenceIngestion.ts` (trust-weighted external import), `domainPacks.ts`, `industryTrustModels.ts`, `crossFrameworkMapping.ts`, `safetyMetrics.ts` (LLM-judge prompt generation), `nlpMetrics.ts` (BLEU/ROUGE/METEOR), `statisticalAnalysis.ts`, plus ~60 one-shot `scoreX()` dimension scorers (OWASP, EU AI Act, memory, sandbox, sleeper detection, task horizon, etc.).
- **`src/diagnostic/`** — the real evidence-gated engine. `questionBank.ts` (5,071 lines, 244 question seeds, version `amc-legacy-240-v1`), `questionSets.ts` (legacy + `amc-lifecycle-2026-v1` 264-q expansion + paid industry-pack weights), `gates.ts` (per-level gate evaluation + trust tiers), `runner.ts` (2,265-line pipeline), `quickScore.ts` (10-q), `rapidQuickscore.ts` (5-q), `fullDiagnostic.ts` (interactive all-questions), `nonInteractiveQuickscore.ts`, `bank/` (signed question-bank load/sign/verify), `autoAnswer/` (evidence-derived answers), `contextualizer/`, `evidenceReadiness.ts`, `questionScoreExplainability.ts`.
- **`src/archetypes/index.ts`** (1,010 lines) — role archetype packs → signed target profiles, context-graph seeds, guardrail patterns, 4C upgrade maps.
- **`src/bench/`** — public benchmark **registry** (signer, verifier, redaction, percentiles, SSE, registry server/client, dual-control publish). **`src/benchmarks/`** — a *second* benchmark subsystem: signed ecosystem snapshots keyed to `questionBank`, provider-drift benchmarks (HELM, promptfoo, Inspect, Patronus…), `publicLeaderboard.ts`, `huggingFacePublisher.ts`. Different schemas, overlapping names (`benchCli.ts` in both).
- **`src/eval/`** — LLM-as-judge: `llmJudgeEngine.ts` (base engine, prompts), `llmApiIntegration.ts` (`ProductionLLMJudgeEngine`, real fetch to OpenAI/Anthropic), `extendedLLMJudge.ts`, `amcJudgeIntegration.ts` (test-harness runner), `judgeCalibration.ts`, `llmJudgeCli.ts`, importers, replay-corpus receipts. `src/observability/evalTracing.ts` — OTel span/metric emission for finished diagnostic reports.
- **`src/canon/`** — signed "Compass Canon" content (schema/loader/signer/verifier/builtin).
- **`src/claims/`** — full claim lifecycle: `claimTypes.ts` (QUARANTINE→PROVISIONAL→PROMOTED→EXPIRED/DEPRECATED/REVOKED, provenance tags OBSERVED_FACT…REFERENCE_ONLY), `promotionGate.ts`, `quarantine.ts`, `contradictions.ts`, `claimStore.ts`.

## 2. HOW IT ACTUALLY WORKS

**Primary path — `runDiagnostic()` (`src/diagnostic/runner.ts:665`):**
1. Opens the SQLite evidence ledger, runs `verifyLedgerIntegrity`, verifies Ed25519 signatures on gateway/fleet/agent/action-policy/tools/budgets configs.
2. Loads evidence events in the window (default 14d). `parseEvidenceEvent` (`gates.ts`) reads `meta.trustTier`; evidence >90 days old is **degraded one tier** (OBSERVED_HARDENED→OBSERVED→ATTESTED→SELF_REPORTED).
3. Derives deterministic audits (unsigned configs, provider bypass, etc.) and correlates monitor-signed runtime trace receipts against ledger events; both persisted back into the ledger.
4. **Per question (244), gates L5→L0** (`evaluateGate`): each `Gate` requires `minEvents`/`minSessions`/`minDistinctDays`, `requiredEvidenceTypes`, `mustInclude`/`mustNotInclude` (textRegex, metaKeys, artifactPatterns, metricKeys, auditTypes), and accepted trust tiers. **L5 additionally injects `mandatoryTrustTierForLevel5` (default OBSERVED)** from fleet config. `STRICT_EVIDENCE_BINDING` (default on) blocks untagged evidence (no `meta.questionId`) at L3+.
5. **Cap cascade** on the supported level: `applyGlobalCherryPickDefense` (L5 needs ≥8 sessions/≥10 distinct days; L4 needs ≥5/≥7), missing LLM evidence→≤2, provider-route mismatch→≤3, sandbox attestation for high-risk L5, truth-protocol missing→≤2, assurance-pack scores (per-question packs like `injection`/`hallucination`: <80→cap 3, <90 or non-OBSERVED→cap 4), ToolHub tickets, leases, budget breaches, approval replay, correlation ratio <0.8, invalid receipts, unsigned config→≤3.
6. `finalLevel = min(claimedLevel, supportedMaxLevel)`. Claim modes: `auto` (claim=supported), `owner` (inquirer prompts), `harness` (agent's own LLM self-rates via `runHarnessWithRetries` with zod schema). Claims above evidence emit `FLAG_UNSUPPORTED_CLAIM` + `UNSUPPORTED_HIGH_CLAIM` ledger audit.
7. Per-question confidence (evidence-type coverage + extra days − contradictions), weighted layer scores, then **integrityIndex = evidenceCoverage − ~19 penalty terms** (contradictions, unsupported claims, unsigned configs, bypasses, leases, budgets, drift, trace failures…), zeroed if ledger verification fails. Drift-regression clamps scores to the prior run. Report is canonical-JSON hashed, ledger-signed (`runSealSig`), persisted as JSON + Markdown with explainability rows (accepted/rejected evidence per question, missing-gate reasons), methodology manifest, metric-validation CI gate, evidence readiness (`CLAIM_READY_INTEGRITY=0.6`).

**Secondary paths:** `quickScore.ts`/`rapidQuickscore.ts`/`fullDiagnostic.ts` are pure self-report arithmetic over the bank (no ledger), mapping % to preliminary L0–L5 bands. `autoAnswer/autoAnswerEngine.ts` runs the full diagnostic in `auto` mode and derives measured scores/unknown reasons per question, optionally creating a transformation plan. `formalSpec.ts` is a *parallel* scoring kernel: evidence artifacts with `kind` weights (observed 1.0/attested 0.8/self_reported 0.4), 90-day exponential half-life decay, score→level thresholds (0.15/0.35/0.55/0.75/0.9).

**LLM-as-judge:** `LLMJudgeEngine` holds 15+ metric prompts (answerRelevancy, faithfulness, contextualPrecision, hallucination, toxicity, bias…) but its `callJudgeModel` **returns a hard-coded mock**. `ProductionLLMJudgeEngine` (llmApiIntegration.ts) overrides it with real OpenAI/Anthropic calls (rate limiter, retries, cost tracking). `AMCJudgeTestRunner` wires judges into test runs with pass/fail thresholds. Judge outputs are **not** written into the evidence ledger — the judge lane is disconnected from trust-tier scoring.

## 3. CAPABILITY INVENTORY

- `amc score --tier quick|standard|deep` — interactive self-report; `amc quickscore --answers x.json --json` — CI-safe; `amc run [--score-only] [--question-set lifecycle]` — full evidence diagnostic; run aliases/prefix resolution; `compareModels()` API.
- `amc score formal-spec|adversarial|collect-evidence <agentId>` + ~46 `score <dimension>` gap-closure subcommands (only ~46 of 102 score modules are CLI-reachable).
- `amc diagnostic bank …` — signed question-bank ops; contextualized rendering; `amc archetype …` — list/describe/preview/apply (writes signed target profile + context graph); `amc canon …` — signed canon ops.
- `amc bench registry|publish …` (registry + dual-control publish, redaction, SSE); `amc benchmark …` (signed snapshots, provider drift, leaderboard, HF publish); `amc org score`, `amc industry-benchmark`, `amc dag score`, `amc claims list|claims-stale|claims-sweep`.
- LLM judge CLI: `evaluate|batch|categories|metrics`; judge calibration; eval importers; replay-corpus evidence receipts; OTel eval tracing (`emitEvalRunTelemetry`, `traceEvalRun`).
- Config/env: `STRICT_EVIDENCE_BINDING`, `mandatoryTrustTierForLevel5` (fleet config), industry-pack entitlement (paid weights), question-set versions, claim modes `auto|owner|harness`, `--no-sign` (UNSIGNED reports), target profiles with signature verification.

## 4. REUSE VERDICTS

- **`diagnostic/gates.ts` + `questionBank`/`questionSets`** — **KEEP-AS-SERVICE**: deterministic, dependency-light gate evaluator + versioned bank; the defensible core IP.
- **`diagnostic/runner.ts`** — **REFACTOR**: sound pipeline but a 2,265-line monolith with ~15 hard-coded per-question-ID cap rules (AMC-1.5, AMC-2.3…) that break under question-set versioning; caps should be data-driven policy.
- **`score/formalSpec.ts` + `maturityTaxonomy.ts`** — **KEEP-AS-SERVICE**: tiny pure math kernel, though currently a parallel path the runner never calls.
- **~100 `score/` dimension modules** — **REFACTOR**: mostly pure input→report functions, individually wrappable, but half are CLI-orphaned and several duplicate `claims/`; needs a registry/manifest and dedup before service-wrapping.
- **`quickScore`/`rapidQuickscore`/`fullDiagnostic`/`autoAnswer`** — **KEEP-AS-SERVICE**: small, pure, stable interfaces.
- **`archetypes/`**, **`canon/`**, **`observability/evalTracing.ts`** — **KEEP-AS-SERVICE**: self-contained data+signing / telemetry emission.
- **`claims/`** — **KEEP-AS-SERVICE** (real lifecycle model); **`score/claimProvenance.ts`, `score/claimExpiry.ts`, `score/confidenceDrift.ts`** — **REPLACE**: superseded thin duplicates of `claims/`.
- **`eval/` LLM judge** — **REFACTOR→REPLACE**: prompt library and calibration worth keeping; mock base engine, retired 2024 model IDs (`claude-3-opus-20240229`), and no ledger integration mean a harness-native judge should supersede the execution layer.
- **`bench/` vs `benchmarks/`** — **REFACTOR**: two overlapping benchmark subsystems with incompatible schemas; consolidate to one before wrapping.
- **CLI facade score commands** (`formal-spec`, `adversarial`, `collect-evidence`) — **REPLACE** (see below).

## 5. SURPRISES & DEBT

- **Facade commands:** `amc score formal-spec <agentId>` calls `computeMaturityScore([], {})` — always returns 0, agentId unused (`cli.ts:22228`). `score adversarial` passes the agentId as the answers map. `collectEvidence({[agentId]:{collected:true}})` fabricates an "observed" artifact.
- **`compareModels()`** (`runner.ts` tail) never switches models — runs the identical diagnostic N times; comment admits "For now, we'll simulate."
- **Mock judge:** `LLMJudgeEngine.callJudgeModel` returns `{score:0.8, explanation:"Mock judge response"}`; `getCacheStats` hitRate hard-coded 0. Judge results never become ledger evidence, contradicting "evidence over claims" for the judge lane.
- **Three divergent trust-weight tables:** `formalSpec` (self_reported 0.4, 3 lowercase kinds), `score/evidenceIngestion` (SELF_REPORTED 0.5 + an `UNVERIFIED` tier absent from `types.ts`), and the runner's 4-tier uppercase system — same concept, incompatible vocabularies and numbers.
- **Duplication:** `confidenceDrift` ×3 (score/, claims/, diagnostic/); `claimExpiry` ×2 (54 vs 323 lines); two `benchCli.ts`/`benchSchema.ts`; `score/claimProvenance` vs `claims/`.
- **Question-count drift:** bank holds **244** questions under version string "amc-legacy-**240**-v1"; CLI strings say "**126**-question bank" and "Full 126-question assessment"; README says 244 + 264 lifecycle.
- **`harness` claim mode** has the agent's own LLM self-rate; caps bound it, but it's effectively SELF_REPORTED without being labeled as such.
- Stray `src/cli-new-commands.ts.fragment` at repo root of src/; `~55` exported score modules unreachable from any CLI command; `OBSERVED_HARDENED` accepted in gates but only the gateway writes plain `OBSERVED` — no writer of the hardened tier was found outside assurance/certificate paths.