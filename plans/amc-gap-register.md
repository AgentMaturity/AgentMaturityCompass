# AMC Gap Register — exhaustive, end-to-end

**Status:** DRAFT v1 · 2026-08-20 · planning only, no changes made · repo at `f419839a`
**Companions:** [amc-state-ledger.md](amc-state-ledger.md) (per-file status of all 1,775 src files) · [amc-superharness.md](amc-superharness.md) (the construction plan) · [amc-state-ledger] research under `plans/research/`

---

## How this was produced

A 26-agent file-level sweep read **every file in the repo** — all 1,775 `src/` files across 134 directories, plus the 1,118-file test suite, ~300 docs, the 190-module Python platform, every deploy/surface/script, and the repo root and `.amc/` workspace. Each module was classified against a fixed vocabulary:

- **REAL** — does what it claims · **PARTIAL** — real but incomplete · **STUB** — placeholder logic · **FACADE** — fabricates results and presents them as real · **DEAD** — unreferenced.

The sweep classified **1,925 module rows: 1,045 REAL · 83 PARTIAL · 5 STUB · 42 FACADE · 88 DEAD**, with **282 orphaned** (reachable through no CLI command, API route, or studio path). Eight drafters then turned those findings into this register, verifying load-bearing claims directly against source (line numbers cited throughout).

## What the register contains

**289 distinct gaps** across 8 classes, each a table row with a stable id (`G1-01`…), a source path, cited evidence, a severity, and a one-verb disposition.

| Severity | Count | Meaning |
|---|---:|---|
| **CRITICAL** | 43 | Fabricates a value that is scored/signed/shipped as real, a live security exposure, or a distribution channel that ships broken |
| **HIGH** | 98 | Contradicts the product's own thesis, unenforced governance, real code that silently enforces nothing, ship-critical untested paths |
| **MEDIUM** | 113 | Duplication, oversized files, drift, in-memory-only state |
| **LOW** | 35 | Hygiene, cosmetics, already-labeled placeholders |

| Class | Rows | Theme |
|---|---:|---|
| **G1 — Integrity facades** | 50 | Features that fabricate results (synthetic/mock/random) fed into scores, evidence, receipts |
| **G2 — Dead code** | 46 | ~90 fully-dead files + ~282 orphan-barrel modules — the largest class |
| **G3 — Duplication** | 32 | Parallel/competing implementations of the same concept |
| **G4 — Structure & size** | 40 | ~63 files over the 800-line cap; monoliths; decomposition debt |
| **G5 — Claim & number drift** | 37 | Every count that matters has ≥2 live values; overstated capabilities |
| **G6 — Security & secrets** | 26 | Tracked vault blob, forgeable trust anchor, unpinned installs, secrets in git |
| **G7 — Test quality** | 24 | ~50% of tests are template clones or prose assertions; coverage gate off |
| **G8 — Persistence/wiring/methodology/hygiene** | 34 | In-memory stores, dark real subsystems, trust-tier contradictions, repo clutter |

## The one finding that matters most

For a product whose thesis is **"evidence over claims,"** the sweep found a **facade layer** — code that fabricates a result and presents it as measured — threaded through the four organs the product sells:

1. **The security-test path is preordained.** The assurance runner's 142 packs, the red-team engine (`amc redteam`, `amc attack`), the 5 "lab" security packs, the OWASP safety test-kit, and `amc shield red-team` all evaluate a hardcoded `syntheticResponse()` (or literally `Math.random() < 0.2`). No agent or model is ever called, and the synthetic answer always safely refuses — so **every "no vulnerabilities found" is guaranteed before the scan runs** (G1-01 … G1-08).
2. **Scoring measures AMC's own repo, not the target.** An 18-module cluster scores maturity/compliance by checking whether *AMC's own internal source paths* exist on disk (`existsSync('src/vault')`). Any external customer's agent scores ~0; AMC scores itself high. The anti-gaming meta-score is itself gamed by creating empty directories (G1-16/17).
3. **The runs store accepts fabricated runs.** `orgRun` and `neutralImporter` write synthetic `DiagnosticReport`s (`integrityIndex: 1`, `confidence: 0.94`) into the same run directory real scores land in; four CLI dashboards fall back to `buildMockReportForUx()` and render hardcoded scores as a live diagnostic (G1-19/20/21).
4. **The trust crypto is forgeable by default.** Cross-agent trust ships a default symmetric key `amc-default-key`; several "signatures" are plain strings or bare hashes; tamper detection never populates its tampered list; guard evidence logs a hardcoded decision regardless of the real outcome (G1-30 … G1-37, G6-07 … G6-12).

None of this is hidden malice — most facades carry honest inline comments ("in a real deployment this would connect to an actual agent"). They are **placeholders that were shipped and wired to live commands**. But the effect is that AMC currently exhibits, inside its own codebase, the exact failure mode it exists to detect in others. **Closing this is the single highest-leverage program in the repo, and it is the same work as the superharness plan's real agent loop** (build one real execution adapter and route the facades through it).

## Top cross-cutting must-fixes (the 10 that unlock the most)

1. **One real agent-execution adapter** over the existing gateway/bridge/runtime backbone → flips ~13 CRITICAL/HIGH facades (assurance, red-team, lab, judge, playground) from preordained to real (G1-A, G3-03).
2. **Scoring scans the target, not AMC** — replace the 18-module `existsSync` self-scan (G1-16/17/18, G8-15/17).
3. **Repair the trust anchor** — sign/lock key-history, reject unanchored keys, drop `amc-default-key`, kill notary auto-append (G6-07/08/09/10, G1-33).
4. **Purge-and-rotate the committed secrets** — the tracked `vault.amcvault` blob (G6-01), `test_model.pkl` (G6-02), k8s/compose `change-me` creds (G6-03/04), BFG residue + confirm the Feb-23 `ANTHROPIC_TOKEN_HINT` was rotated (G6-17).
5. **`amc gen-counts --check`** — one generator for questions/adapters/packs/tests/version/license, failing CI on drift; dogfoods the "documentation inflation" AMC claims to detect (G5, all).
6. **Delete the DEAD tier and stop counting it as coverage/evidence** — ~90 dead files + the coverage-illusion where tests import unreachable product code (G2-01, G7-05/08).
7. **Collapse the CRITICAL signed-artifact twins** — two cert systems, five fix systems, duplicate governance stack both CLI-wired (G3-01/02/08).
8. **Make the coverage gate real** — thresholds off 0, drop the console/dashboard excludes, add a real linter, wire or delete Playwright (G7-05/19, G8-hygiene).
9. **Wire-or-delete the dark real subsystems** — `llmApiIntegration` (fixes the mock judge), `enterpriseIam` (self-flagged "#1 blocker"), enforce guards, claims lifecycle (G2-38/39, G8-08/11).
10. **A descending line-cap ratchet + logic/data split** — flip `architecture-boundaries-check.mjs` to fail on growth, extract the 6 giant data-literal registries (~63k lines) to generated assets (G4-36, G4-02/03/07/08/14/20).

## Reading guide

Each section stands alone. Dispositions are advisory and pre-decision — **nothing here has been executed.** Where a gap maps onto the superharness plan, the disposition names the phase. The register is deliberately larger than any one person will action at once; it is the complete surface, so that prioritization is a choice made against full information rather than a sample.

---



---

## G1 — Integrity facades (features that fabricate results)

For a product whose entire thesis is "evidence over claims," a feature that prints a fabricated result as if it were measured is not a bug — it is the product lying in exactly the way it exists to catch. AMC's scores, receipts, certificates, and reports are only worth what the weakest fabrication feeding them is worth, and the sweep found fabrication threaded through the security-test path, the scoring core, the attestation crypto, and the runs store itself. Every row below produces synthetic/hardcoded/random output that flows into a score, an evidence ledger, a signed receipt, or CLI output presented to a user as real. This is the class that, left unaddressed, makes the tool self-refuting.

### A. Fake execution engines — the agent/model is never called
The advertised "test the agent" path evaluates a canned string instead. Because the synthetic responses always safely refuse, every "no vulnerabilities found" is preordained.

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|---|---|---|---|---|
| G1-01 | `syntheticResponse()` fabricates a compliant answer per keyword; all 142 assurance packs regex-match that string, then result is signed/ledgered/reported as red-team | src/assurance/assuranceRunner.ts:133,315 | verified: `function syntheticResponse` + call at 315; no agent/model call | CRITICAL | REPLACE-WITH-REAL agent exec |
| G1-02 | Red-team runner scores vulns against `syntheticResponse()`, wired to `amc redteam` + ci/redteamGate | src/redteam/runner.ts:206 | verified: `function syntheticResponse(prompt)` | CRITICAL | REPLACE-WITH-REAL agent exec |
| G1-03 | Evil-MCP provider models a "cautious agent" via `syntheticAgentResponse` | src/redteam/mcpAgentProvider.ts:767,996 | verified; comment admits "real deployment would connect to an actual agent" | CRITICAL | REPLACE-WITH-REAL agent exec |
| G1-04 | `amc attack` passes a hardcoded synthetic respondFn to 5 attack plugins | src/redteam/attackPlugins.ts; src/cli.ts | B8 finding; CLI hardcodes respondFn | CRITICAL | REPLACE-WITH-REAL agent exec |
| G1-05 | jailbreak `tap.ts`/`runner.ts` default to synthetic respondFn | src/redteam/jailbreak/tap.ts,runner.ts | B8 table (FACADE/PARTIAL) | HIGH | REPLACE-WITH-REAL agent exec |
| G1-06 | 5 lab packs (toctou, compoundThreat, shutdownCompliance, advancedThreats, taskDecomposition) evaluate canned responses; wired to CLI + security/assuranceRouter; agentId ignored, identical every run | src/lab/packs/*.ts | B9 table, all FACADE | CRITICAL | REPLACE-WITH-REAL agent exec |
| G1-07 | `safetyTestkit` default responder auto-refuses, "passes" all OWASP LLM Top-10 without an agent | src/watch/safetyTestkit.ts | B9 table FACADE | HIGH | REPLACE-WITH-REAL agent exec |
| G1-08 | `amc shield red-team` evaluator is `Math.random() < 0.2`, `response:"simulated"`; printed success/regression rates are noise | src/cli.ts:20125 | verified line 20125-20126 | CRITICAL | REPLACE-WITH-REAL agent exec |
| G1-09 | `simulateAgentResponse` returns `Math.random`-based output/latency/tokens as model comparison | src/agents/playground.ts:110,116 | verified Math.random latency/tokens | HIGH | REPLACE-WITH-REAL / DELETE |
| G1-10 | Playground offline runner hardcodes `passed:true` per step, prints "N/N scenarios passed" | src/playground/scenarioRunner.ts, interactiveMode.ts | B5 FACADE | HIGH | REPLACE-WITH-REAL / DELETE |
| G1-11 | `agentSimulator` "pre-deployment simulation" pattern-matches scenario text; `evidenceGenerated:true` hardcoded | src/score/agentSimulator.ts | B3 FACADE | HIGH | REPLACE-WITH-REAL / DELETE |
| G1-12 | `callJudgeModel` returns `{score:0.8,"Mock judge response for testing"}`; extendedLLMJudge + amcJudgeIntegration inherit; real client (llmApiIntegration) exists but unwired | src/eval/llmJudgeEngine.ts:346-347 | verified score:0.8 + mock string | CRITICAL | WIRE llmApiIntegration |
| G1-13 | hallucination `llmJudge` never receives a real model fn in src | src/hallucination/llmJudge.ts | B11 PARTIAL | HIGH | WIRE real judge fn |
| G1-14 | `cognitionLab.simulateExperiment` fabricates results (tagged `simulated:true`) | src/lab/cognitionLab.ts | B9 PARTIAL, self-labeled | MEDIUM | DOCUMENT/RELABEL |
| G1-15 | Product facades via live CLI: devSandbox (execution = line-count+regex), jobs ("Simulate completion"), planGenerator (canned steps/ms), workflowEngine (never runs steps), featureCatalog (hardcoded 2-entry) | src/product/{devSandbox,jobs,planGenerator,workflowEngine,featureCatalog}.ts | verified jobs:32 "Simulate completion"; B15 | HIGH | DELETE / REPLACE-WITH-REAL |

### B. Self-referential scoring — measures AMC's own repo, not the target
These "score the agent" modules check `existsSync` of hardcoded AMC-internal source paths. Any external customer's agent scores ~0; AMC scores itself high. This is the core maturity/compliance number the product sells.

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|---|---|---|---|---|
| G1-16 | 18-module self-scan FACADE cluster (12 CLI/API-wired: euAIActCompliance, owaspLLMCoverage, sleeperDetection, kernelSandboxMaturity, outputIntegrityMaturity, runtimeIdentityMaturity, auditDepth, failSecureGovernance, behavioralContractMaturity, agentStatePortability, selfKnowledgeMaturity, gamingResistance + 6 orphan) scores by existsSync of AMC src paths | src/score/*.ts | verified gamingResistance.ts:53-81 existsSync(`src/...`); B3 | CRITICAL | REPLACE-WITH-REAL target scan |
| G1-17 | `gamingResistance` (the anti-gaming meta-score) is itself gameable — create empty `src/score`, `src/vault` dirs to gain points; feeds ci/redteamGate + securityRouter | src/score/gamingResistance.ts:53-81 | verified path checks award points | CRITICAL | REPLACE-WITH-REAL target scan |
| G1-18 | `unifiedRun` letter grades derive mostly from file-existence heuristics | src/unified/unifiedRun.ts | B11 PARTIAL | HIGH | REPLACE-WITH-REAL |

### C. Fabricated runs and reports that enter the evidence store
Synthetic reports written into `runsDir` are indistinguishable from real runs downstream.

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|---|---|---|---|---|
| G1-19 | `orgRun` writes synthetic DiagnosticReports: `integrityIndex:1`, `confidence:0.94`, `runSealSig:"org-run-synthetic-report"`; wired to CLI + orgRunRouter + studio | src/org/orgRun.ts:486,511,564 | verified integrityIndex 1 / synthetic seal / conf 0.94 | CRITICAL | FIX (segregate/label as non-run) |
| G1-20 | `neutralImporter` writes heuristic diagnostic runs (`integrityIndex:0.72`, levels 2-4) into runsDir (marked UNSIGNED — partial mitigation) | src/importers/neutralImporter.ts:690,694 | verified UNSIGNED + integrityIndex 0.72 | HIGH | FIX (keep out of run store) |
| G1-21 | `buildMockReportForUx` supplies hardcoded scores/flags to `operator-dashboard`/`why-capped`/`action-queue`/`confidence-heatmap` when no run exists — rendered as a real diagnostic | src/cli.ts:19216 (+19120,19136,19161,19184) | verified fn + 4 fallback call sites | CRITICAL | DELETE (fail honestly) |
| G1-22 | `gapDemo` "execution-verified" scores exposing the 84-pt gap are static literals; nothing executes | src/demo/gapDemo.ts:158-166 | verified hardcoded executionScore 1/0 | MEDIUM | DOCUMENT/RELABEL |
| G1-23 | `quickSetupCli --demo` and dogfood `maturityEvidence` write synthetic ledger evidence (already labeled) | src/setup/quickSetupCli.ts; src/dogfood/maturityEvidence.ts | B5/B12, self-labeled | LOW | DOCUMENT/RELABEL |

### D. Experiment & benchmark fabrication
| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|---|---|---|---|---|
| G1-24 | `runExperiment` fabricates A/B candidate outcomes from baseline ± jitter; candidate config never executed | src/experiments/experimentRunner.ts | B8 FACADE | HIGH | REPLACE-WITH-REAL |
| G1-25 | `architectureExperiment` default probe runner is an LCG PRNG emitting synthetic scores/tokens/latency | src/experiments/architectureExperiment.ts | B8 FACADE; comment admits placeholder | HIGH | REPLACE-WITH-REAL |
| G1-26 | `benchRunner` latency/cost/safety categories are arithmetic proxies of maturity; nothing is benchmarked | src/benchmarks/benchRunner.ts:60-84 | verified deriveLatency = integrity-proxy, etc. | HIGH | REPLACE-WITH-REAL / DELETE |
| G1-27 | `frontierBaseline` ships hardcoded invented GPT-4/Claude/Gemini "measured" scores (dated 2026-03-15) that drive gap analysis | src/benchmarks/frontierBaseline.ts:49-84 | verified measuredAt "2026-03-15" fabricated | CRITICAL | REPLACE-WITH-REAL / DELETE |
| G1-28 | `simulatorModels` projects maturity/risk deltas from a hardcoded per-action constants table | src/mechanic/simulatorModels.ts | B5 FACADE | MEDIUM | DOCUMENT/RELABEL |
| G1-29 | `product/fixGenerator` + dead `mechanic/autoFixer` emit canned confidence (0.85/0.75/0.65/0.5); duplicate of real `amc fix` path | src/product/fixGenerator.ts; src/mechanic/autoFixer.ts | B5/B15 | MEDIUM | CONSOLIDATE→mechanic real path |

### E. Fake signatures & attestation theater
The trust primitives the whole product rests on are forgeable or inert out of the box.

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|---|---|---|---|---|
| G1-30 | `outputAttestation` hardcodes `signed:true` with no signature computed | src/watch/outputAttestation.ts:19 | verified `signed: true` literal | CRITICAL | FIX (real sig or drop flag) |
| G1-31 | `agentBus` labels a plain sha256 a "signature" | src/watch/agentBus.ts | B9 finding | HIGH | DOCUMENT/RELABEL |
| G1-32 | `identityStability` "signature" = literal `identity:<id>:<ts>`; `selfModelCalibration` labels bare sha256 a signature | src/score/identityStability.ts; src/diagnostic/selfModelCalibration.ts | B6 finding | HIGH | FIX (real crypto) |
| G1-33 | Default symmetric key `amc-default-key` across outputAttestation, mutualVerification, crossAgentTrust — cross-agent "verifiable trust" forgeable by default | src/score/outputAttestation.ts:108,147; mutualVerification.ts:80-118 | verified default key literal | CRITICAL | FIX (require explicit key) |
| G1-34 | `attestIngestSession` upgrades SELF_REPORTED→ATTESTED by re-signing the same unverified payload — attestation adds no verification | src/ingest/ingest.ts:81,152,166 | verified tier upgrade w/ same payload | CRITICAL | FIX (verify before upgrade) |
| G1-35 | `conversationIntegrity` builds a hash chain but never pushes to `tamperedTurns` → always `valid:true`; also emits hardcoded guard `decision:'allow'` | src/shield/conversationIntegrity.ts:15-30 | verified loop only sets chainHash | CRITICAL | FIX (populate tampered turns) |

### F. Guard / isolation / privacy theater — evidence misrepresents reality
| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|---|---|---|---|---|
| G1-36 | ~30 enforce guards emit hardcoded `decision`/`reason` regardless of outcome (payeeGuard blocks yet logs `allow`) into `guard_events.sqlite` | src/enforce/*.ts (payeeGuard.ts:23 et al.) | verified payeeGuard hardcodes `decision:'allow'` | CRITICAL | FIX (log real decision) |
| G1-37 | `sandboxOrchestrator` hardcodes `isolated:true` on a Map entry; no isolation performed | src/enforce/sandboxOrchestrator.ts:33 | verified `isolated: true` literal | CRITICAL | REPLACE-WITH-REAL / DELETE |
| G1-38 | `mdnsController.scanMdns` returns empty result; no mDNS ever performed | src/enforce/mdnsController.ts:45-47 | verified returns empty discovered | MEDIUM | FIX / DELETE |
| G1-39 | 4 vault "backward-compat" wrappers (memoryTtl.storeWithTtl, screenshotRedact, secretsBroker.mintSecretToken, undoLayer) return `stored:true`/`redacted:true`/tokens without doing anything — and are the barrel-exported names | src/vault/{memoryTtl,screenshotRedact,secretsBroker,undoLayer}.ts | verified memoryTtl:50-52 stores nothing | HIGH | DELETE / WIRE real impl |
| G1-40 | `dsarAutopilot.processRequest` marks requests `complete` instantly with no data access/deletion | src/vault/dsarAutopilot.ts:73-79 | verified instant status='complete' | HIGH | REPLACE-WITH-REAL |
| G1-41 | `globalRegulatory` ships hardcoded DPIA and "construct validity" reports presented as assessments | src/compliance/globalRegulatory.ts | B14 FACADE | HIGH | DELETE / REPLACE-WITH-REAL |
| G1-42 | `productionWiring` six hooks are called by no code; `amc wiring-status` can only report 0 | src/ops/productionWiring.ts | B13 FACADE | MEDIUM | WIRE / DELETE |
| G1-43 | `agentDiscovery` builds a fresh empty in-memory registry per command — adds don't persist, `passport capabilities-search` always returns [] | src/passport/agentDiscovery.ts | B13 FACADE | HIGH | FIX (persist registry) |

### G. Mislabeled synthesis — honest math, dishonest name/claim
| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|---|---|---|---|---|
| G1-44 | `dynamicAttackGenerator` header claims "ML-powered attack synthesis"; is template + `Math.random` shuffle | src/shield/dynamicAttackGenerator.ts | B7 PARTIAL | MEDIUM | DOCUMENT/RELABEL |
| G1-45 | `behavioralProfiler` "ML-Powered" header; is z-score statistics | src/watch/behavioralProfiler.ts | B9 finding | LOW | DOCUMENT/RELABEL |
| G1-46 | 19 vendor LiveDrift wrappers + 7 provider-drift adapters present vendor-branded "live drift" proofs (HELM/Humanloop/Promptfoo/…) but never call any vendor; caller supplies rows | src/watch/*LiveDrift.ts; src/benchmarks/{helm,humanloop,…}.ts | B9/B17 | MEDIUM | DOCUMENT/RELABEL + DELETE orphans |
| G1-47 | `business kpi` presents `riskReduction = level×18%`, "$⟨level×18000⟩k annual savings" as business KPIs with no business-data input | src/cli-business-commands.ts; src/business/* | B19 finding | HIGH | DOCUMENT/RELABEL |
| G1-48 | `standardGenerator` publishes required-only JSON-schema shells (`additionalProperties:true`) far weaker than the enforced zod, signed as "open standard" | src/standard/standardGenerator.ts | B5 PARTIAL | MEDIUM | FIX (match enforced schema) |
| G1-49 | `evidenceCollector` assigns flat 0.7 trust and labels every module output "observed", contradicting the evidence-trust-tier methodology | src/score/evidenceCollector.ts | B3 finding | HIGH | FIX (real tiering) |
| G1-50 | watch `policyPacks.applyPolicyPack` returns `applied:true`, enforces nothing | src/watch/policyPacks.ts | B9 PARTIAL | MEDIUM | DELETE |

### G1 rollup
**50 gaps** — CRITICAL 18, HIGH 20, MEDIUM 10, LOW 2. Roughly a third are CRITICAL because they fabricate a value that is then signed, ledgered, or scored and shown to a user as real — the failure mode this product exists to expose. The fabrication concentrates in four organs: the security-test path (assurance/redteam/lab/shield judge all evaluate canned refusals), the scoring core (existsSync of AMC's own repo), the runs store (orgRun/neutralImporter/buildMockReportForUx inject synthetic reports), and the trust crypto (default key, hardcoded `signed:true`, no-op attestation, always-valid integrity).

Three highest-leverage moves:
1. **Build one real agent-execution adapter** (over the existing gateway/bridge/runtime backbone) and route assurance G1-01, redteam G1-02/03/04/05, lab G1-06, safetyTestkit G1-07, shield red-team G1-08, playground G1-09/10, agentSimulator G1-11, and the judge stack G1-12/13 through it. This single wiring flips ~13 CRITICAL/HIGH facades from "preordained pass" to real measurement; until it exists, every "no vulnerabilities" and every judge score is meaningless.
2. **Make scoring measure the target, not AMC.** Replace the existsSync self-scan cluster (G1-16/17/18) with scans of the assessed agent's artifacts. As shipped, every external customer scores ~0 while AMC scores itself high — the most direct contradiction of the product's premise, and trivially demonstrable by a prospect.
3. **End the attestation/guard theater.** Require an explicit signing key (drop `amc-default-key`, G1-33), verify payloads before upgrading trust tier (G1-34), populate tamper detection (G1-35), log guards' actual decisions (G1-36), and stop hardcoding `signed:true`/`isolated:true` (G1-30/37). These are the evidence-integrity primitives every receipt and certificate depends on; forgeable-by-default undermines all of them at once.


---

## G2 — Dead code: unreferenced and orphan-barrel modules

AMC sells evidence integrity and agent trust: every score, certificate, and receipt is supposed to trace to code that actually ran. Dead and orphan modules corrode that promise three ways. First, they inflate the surface the product cites as "capability" — score/* modules literally count `existsSync` of these files as maturity evidence (B10), so unreachable code scores AMC points. Second, they inflate test-coverage numbers: the 25-file product DEAD cluster and the assurance legacy chain are imported only by tests (B15, B1), so coverage counts code no CLI/API/studio path can reach. Third, several dead modules carry fake-signature or "signed:true" markers (B6, B9), meaning cruft and integrity-theater are indistinguishable to a reader. The sweep surfaced ~90 fully-DEAD files (no importer anywhere) and ~282 ORPHAN-barrel modules (reachable only through `index.ts`/subsystem barrels that no `src` file imports). Verified spot-checks: `src/harness` is empty (0 files); `autoInstrument.ts` = 951 lines, zero importers; `replayBenchmarkCorpus.ts` = 29,468 lines; `enterpriseIam` imported only by `src/index.ts`; `shield/stubs.ts`, `shield/signing.ts`, `vault/keyRotation.ts` have zero real importers (the "vscode"/"keyRotation" grep hits are config-string false matches).

### G2.A — Fully DEAD (no importer anywhere) — DELETE / CONSOLIDATE

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|---|---|---|---|---|
| G2-01 | Product DEAD cluster: 23 feature classes + `stubs.ts` (25 no-op impls) + `persistence.ts` | src/product/{abTesting,collaboration,confidence,contextPack,conversationState,dataQuality,docsIngestion,extractor,failureClustering,kbBuilder,memoryConsolidation,outcomePricing,paramAutofiller,persona,proactiveReminders,responseValidator,retentionAutopilot,scaffolding,sopCompiler,taskSpec,toolDiscovery,versionControl,workflowTemplates,stubs,persistence}.ts | B15: not in product barrel, zero importers; imported only by product-*.test to inflate coverage; verified `abTesting`/`contextPack` absent from product/index.ts | HIGH | DELETE |
| G2-02 | Assurance orphan pack cluster: 7 unimported pack modules (2 near-dup spellings of wired packs) + 6 legacy `*PackV1.json` fixtures | src/assurance/packs/{do-not-answer-pack,toxicchat-pack,multiTurnDeepEvalPack,selfReportGamingPack,economicAmplificationPack,overthinkingDetectionPack,zombieAgentPersistencePack}.ts; fixtures/packs/*PackV1.json | B1: never registered in index.ts (142 entries); fixtures referenced nowhere | MEDIUM | DELETE |
| G2-03 | Assurance legacy-v1 chain: dead-ends because `saveAssuranceRunArtifacts` has zero callers | src/assurance/{assuranceFindings,assuranceScoring.scoreAssuranceRun,assuranceStore,assuranceCertificates}.ts | B1: cert issuance always throws on fresh workspace; scheduler swallows it | HIGH | REPLACE-WITH-REAL |
| G2-04 | Benchmarks dead files: `benchCli` (8-line parser), `valueSigner`, `value/connectors` (3), `cgxSigner`, `cgxQuery`, `transformSse`, `crypto/signing/signerNotary` | src/benchmarks/benchCli.ts; src/value/{valueSigner.ts,connectors/*}; src/cgx/{cgxSigner,cgxQuery}.ts; src/transformation/transformSse.ts; src/crypto/signing/signerNotary.ts | B17: never imported; signerNotary duplicates signer.ts notary path | LOW | DELETE |
| G2-05 | Ops/transparency dead shims: `metricsCli`, `retentionVerify`, `backupVerify`, `logVerifier`, `transparencyMerkleApi` | src/ops/metrics/metricsCli.ts; src/ops/retention/retentionVerify.ts; src/ops/backup/backupVerify.ts; src/transparency/{logVerifier,transparencyMerkleApi}.ts | B13: 1–9 line re-export/aggregator shims, unimported | LOW | DELETE |
| G2-06 | Plugin dead files + orphan barrel: `pluginDiff`, `pluginSse`, `pluginRegistryServer`, `ui/pluginModel`, `rules/allowlist`, `integrations/index` | src/plugins/{pluginDiff,pluginSse,pluginRegistryServer,ui/pluginModel,rules/allowlist}.ts; src/integrations/index.ts | B14: zero importers; allowlist re-implemented inline in pluginApi; integrations barrel not an npm subpath | LOW | DELETE |
| G2-07 | Workspaces dead quartet superseded by hostDb/router | src/workspaces/{workspaceApi,workspaceCli,workspaceSse,workspaceSchema}.ts | B16: unreferenced; hostDb defines its own schema | MEDIUM | DELETE |
| G2-08 | Dead signer/verifier/loader duplicates of live functions | src/diagnostic/bank/{bankSigner,bankVerifier}.ts; src/canon/{canonSigner,canonVerifier}.ts; src/identity/identityConfigLoader.ts; src/forecast/{forecastSigner,forecastSse}.ts; src/doctor/doctorFixHints.ts; src/audit/ui/{auditExplainers,controlTemplates}.ts | B4/B6/B12: thin wrappers duplicating loader/store functions; zero importers | LOW | CONSOLIDATE→loaders |
| G2-09 | `selfModelCalibration` dead: 0 importers, 0 tests, labels bare sha256 a "signature" | src/diagnostic/selfModelCalibration.ts | B6: overlaps calibration.ts/selfCalibration.ts (3 calibration modules) | MEDIUM | DELETE |
| G2-10 | Shield dead duplicates: `stubs.ts` (dupes manifest/registry/ingress/sanitizer/detector); `drift/bishengObservabilityLiveDrift` 12-line re-wrap | src/shield/stubs.ts; src/drift/bishengObservabilityLiveDrift.ts | B7: verified zero importers | MEDIUM | DELETE |
| G2-11 | Enforce `stubs.ts` DEAD duplicate of 5 guards | src/enforce/stubs.ts | B11: dupes mdnsController/reverseProxyGuard/antiPhishing/secretBlind/evidenceContract; tests-only | MEDIUM | DELETE |
| G2-12 | `sdk/autoInstrument.ts` — 951 lines, no importer/barrel/test; advertised "one-line framework auto-patch" | src/sdk/autoInstrument.ts | B8: verified 951L, zero importers | HIGH | WIRE or DELETE |
| G2-13 | `experiments/experimentAnalysis.ts` unreferenced + untested | src/experiments/experimentAnalysis.ts | B8: dead | LOW | DELETE |
| G2-14 | Console state view-models + orphan components fully dead | src/console/state/{uiFormat,uiModels,uiSelectors}.ts; src/console/assets/components/{actionCard,evidenceChip}.js | B2: TypeScript view-models with zero importers; browser JS never uses them | LOW | DELETE |
| G2-15 | Dashboard `components/` dead weight: 5 files copied into every build but never `<script>`-loaded; `teamViews.js` not even copied | src/dashboard/components/{radar,heatmap,timeline,questionDetail,eoc,teamViews}.js | B12: app.js re-implements radar/timeline | MEDIUM | DELETE |
| G2-16 | Score dead cluster: `costPredictability`, `decisionExplainability`, `testProdParity`; `scoreHistoryCli` (and `scoreHistory` reachable only through it) | src/score/{costPredictability,decisionExplainability,testProdParity,scoreHistoryCli,scoreHistory}.ts | B3: not in barrel, zero importers, mostly untested; CLI commands never registered | MEDIUM | DELETE |
| G2-17 | Mechanic dead: `autoFixer` (FACADE, dupes product/fixGenerator) + `ui/mechanicModel` + `ui/tuningExplainers` | src/mechanic/{autoFixer,ui/mechanicModel,ui/tuningExplainers}.ts | B5: none imported; hardcoded 0.85 confidence | MEDIUM | CONSOLIDATE→oneClickFix |
| G2-18 | `telemetry/telemetryCli.ts` inert: promised `amc telemetry on/off/status` never registered; `buildEvent` never called; no transport | src/telemetry/telemetryCli.ts | B5: entirely inert feature | MEDIUM | WIRE or DELETE |
| G2-19 | Superseded legacy stores/flows: `approvals/approvalApi` (unused client), `setup/setupCli` (test-only), `packs/packRegistryClient` (only real remote client, unused), `studio/studioSse` | src/approvals/approvalApi.ts; src/setup/setupCli.ts; src/packs/packRegistryClient.ts; src/studio/studioSse.ts | B5/B6: superseded by approvalChain/quickSetup; server uses per-domain SSE | MEDIUM | CONSOLIDATE / DELETE |
| G2-20 | Eval/federation/repl dead: `llmJudgeCli` never registered; `federationVerify`; `repl/index` barrel | src/eval/llmJudgeCli.ts; src/federation/federationVerify.ts; src/repl/index.ts | B18: zero importers | MEDIUM | DELETE |
| G2-21 | Enterprise gating decorative: `gates`, `packRegistry` (zero importers, tiers never enforced); `sso` test-only (identity/ has real SSO) | src/enterprise/{gates,packRegistry,sso}.ts | B16: no code path enforces tier features | HIGH | WIRE or DELETE |
| G2-22 | CLI leftovers: `cli-watch-commands.ts` (imported line 714, `registerWatchCommands` never invoked, body returns immediately); `cli-new-commands.ts.fragment` (506-line scratch, never compiled); `.DS_Store` | src/cli-watch-commands.ts; src/cli-new-commands.ts.fragment; src/.DS_Store | B19: verified import present, no call site; fragment duplicates merged commands | MEDIUM | DELETE |
| G2-23 | Misc dead: `adapters/adapterDoctor`, `claims/index` barrel, `vault/keyRotation` (verified dead), `bridge/tests/fixtures/openai-chat.json` | src/adapters/adapterDoctor.ts; src/claims/index.ts; src/vault/keyRotation.ts; src/bridge/tests/fixtures/openai-chat.json | B10/B12/B16: zero importers | LOW | DELETE |

### G2.B — ORPHAN-barrel, real + tested (reachability gap) — WIRE

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|---|---|---|---|---|
| G2-24 | Product ORPHAN-barrel (~47): 33 in-memory heuristic modules (real TF-IDF/DAG/sagas) + 4 Python-port modules + scratchpad/promptModules/asyncCallback + tool* estimators | src/product/index.ts (cli.ts dynamic-imports only 7 symbols; root src/index.ts skips the barrel) | B15: real algorithms, no consumer, no persistence | HIGH | WIRE or DELETE |
| G2-25 | Score analytics ORPHAN-barrel (~26): real, tested algorithm code reachable only via package barrel | src/score/{nlpMetrics,statisticalAnalysis,safetyMetrics,scoreExplainer,antiGaming,crossFrameworkMapping,ragGroundingEval,ragMaturity,graduatedAutonomy,catastrophicRiskIndicators,...}.ts | B3: BLEU/ROUGE, Welch t-test etc.; no command/route uses them | HIGH | WIRE |
| G2-26 | Diagnostic analytics ORPHAN-barrel (7) + gap-receipt cluster (7) | src/diagnostic/{identityStability,knownUnknowns,componentConfidence,selfCalibration,riskTiers,longitudinalTracking,evalReplayCorpusBoundary}.ts; src/audit/{posthocAuditSampling,reviewerIndependence}.ts; src/runtime/{stateCheckpoint,autonomyBoundary,degradedModeContract}.ts; src/security/supplyChainPosture.ts; src/fleet/cascadeSimulator.ts | B6/B4: src/index.ts export only; exercised by gapNNNN boundary tests, no product surface | HIGH | WIRE |
| G2-27 | Steer pipeline ORPHAN-barrel: 5 stages reachable only via unimported barrel (only race/liquid/privacyTiers used) | src/steer/{autotune,feedbackLoop,hygiene,harmClassifier,parameterMatrix}.ts; src/steer/index.ts; research/eval_* | B10: src/index.ts exports nothing from steer | MEDIUM | WIRE |
| G2-28 | Claims lifecycle state machine dead-ends via unimported `claims/index` | src/claims/{claimFactory,claimLifecycle,claimVerify,promotionGate,quarantine,contradictions}.ts | B10: promotion/quarantine never executed in production | HIGH | WIRE or DELETE |
| G2-29 | Declarative-config cluster (~1100 lines): `amcConfigRunner` header claims it powers `amc eval run --config` — no such command exists | src/config/{amcConfigSchema,amcConfigLoader,amcConfigRunner,amcConfigCli}.ts | B10: zero production importers | MEDIUM | WIRE or DELETE |
| G2-30 | Enforce un-exported guards (12) + orphan-barrel guards (17) + safetyDSL/toolSandboxLimits | src/enforce/{abac,browserGuardrails,consensus,dryRun,egressProxy,gatewayScanner,idempotency,outboundFilter,sessionFirewall,twoPersonAuth,watchdog,webhookGateway,safetyDSL,toolSandboxLimits}.ts + 17 barrel guards | B11: only tests reference the 12; barrel guards hardcode evidence decisions (integrity concern) | HIGH | WIRE / FIX |
| G2-31 | Entire `src/hallucination` dir orphaned (polished module + tests + docs, no CLI/API/studio wiring) | src/hallucination/{index,types,detector,deterministicDetectors,llmJudge}.ts | B11: imported by nothing in src | MEDIUM | WIRE |
| G2-32 | Incidents advanced layer reachable only via package barrel; CLI/API use incidentStore alone | src/incidents/{incidentTimeline,incidentGraph,causalInference,autoAssembly,incidentRegression,index}.ts | B11: "causalInference" is keyword/time heuristics | MEDIUM | WIRE |
| G2-33 | Vault orphan cluster (4 real): dataResidency, honeytokens, invoiceFraud, knowledgeRefreshLineage | src/vault/{dataResidency,honeytokens,invoiceFraud,knowledgeRefreshLineage}.ts | B12: barrel-only; nothing calls them | MEDIUM | WIRE |
| G2-34 | Values engines orphaned while assurance packs of same name never import them | src/values/{valueCoherence,disempowerment,index}.ts | B12: two disconnected implementations | MEDIUM | CONSOLIDATE |
| G2-35 | Ops orphan-barrel: nlPolicy, receiptInterchange, passportSchemaCompatibility, artifactProvenance (779L), modelRouter, amcPolicies | src/ops/modelRouter.ts; src/governor/{nlPolicy,amcPolicies}.ts; src/passport/{receiptInterchange,passportSchemaCompatibility}.ts; src/artifact/artifactProvenance.ts | B13: index.ts export only; amcPolicies references nonexistent Python modules | MEDIUM | WIRE / DELETE |
| G2-36 | Integrations + compliance + observability record-builders orphaned; SCIM handler never mounted | src/integrations/{automationBridge,noCodeGovernanceCli,noCodeGovernanceStore,noCodeWebhookAdapters,partnerInteroperability,scimAdapter,platformConfigs}.ts; src/compliance/{controlCrosswalk,exceptionLifecycle,policyDrift,providerRisk}.ts; src/observability/{costBudgetEvidence,riskCostLatencySlo,routerFallbackSafety}.ts; src/plugins/pluginApiVersion.ts | B14: exported only via src/index.ts; most build hash-stamped records nothing persists | MEDIUM | WIRE |
| G2-37 | Toolhub/redteam/simulator orphan-barrel (real, tested): grants, contracts, exploit/adversarial suites, whatIfs, jailbreak subtree | src/toolhub/{leastPrivilegeGrants,toolSchemaContracts,toolhubClient}.ts; src/redteam/{exploitLedger,adversarialGenerator,multilingualAttacks,promptInjectionRegressionSuite,modelSpecificAttacks,jailbreak/*}.ts; src/simulator/{budgetsWhatIf,governorWhatIf}.ts | B8: barrels/tests only, no product consumer (jailbreak tap/runner default synthetic → facade) | MEDIUM | WIRE |
| G2-38 | Eval real-but-unwired: `llmApiIntegration` (genuine OpenAI/Anthropic fetch — the fix for the mock judge), customAssertionEngine, costLatencyAssertions, effectAutoAgentReplayCorpus | src/eval/{llmApiIntegration,customAssertionEngine,costLatencyAssertions,effectAutoAgentReplayCorpus}.ts | B18: zero production importer; would replace hardcoded judge score | HIGH | WIRE |
| G2-39 | `enterpriseIam` (415L SSO/RBAC/audit, flagged "#1 blocker") + `mcpServerRiskAttestation` (518L) barrel-/test-reachable only | src/auth/enterpriseIam.ts; src/mcp/mcpServerRiskAttestation.ts | B7: verified enterpriseIam imported only by src/index.ts | HIGH | WIRE |
| G2-40 | Monitoring stranded island: functional in-memory DriftDetector/RealtimeMonitor exported only via barrel; real drift lives in src/drift | src/monitoring/{driftDetection,realtimeDashboard}.ts | B5: "continuous monitoring" never wired | MEDIUM | CONSOLIDATE→src/drift |
| G2-41 | Benchmarks research cluster + shield S-modules + shield/signing (real ed25519) orphaned | src/benchmarks/{evalHarness,academicPaper,consortium}.ts; src/shield/{9 S-modules,signing}.ts | B17/B7: test-only / barrel-only; frontierBaseline is a facade (excluded) | MEDIUM | WIRE |
| G2-42 | `i18nFramework` orphan-barrel, English-only despite "20 locales" claim | src/i18n/i18nFramework.ts | B16: t() never called by CLI/reports | LOW | WIRE or DOCUMENT |

### G2.C — Legitimately barrel-only / oversized adjacency — DOCUMENT / DECOMPOSE

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|---|---|---|---|---|
| G2-43 | Published SDK surface reachable only via barrels — legitimate as external package, but internally unconsumed and undocumented as such | src/sdk/{amcClient,amcAgent,integrations/*,mobileFetch,frameworkAdapters}.ts; src/agents/{customerSupportBot,simAgent,llmJudge,runHistory,monitor,sessionEval,autoTestGen}.ts; src/index.ts | B8/B7/B19: whole TS SDK + 8 agents are ORPHAN-barrel; only versioning + pythonSdkGenerator wired | LOW | DOCUMENT/RELABEL |
| G2-44 | `src/vscode` entire dir effectively dead (index barrel zero importers; verified "vscode" hits are `.vscode/mcp.json` strings) — real+tested extension scaffold, product-roadmap decision | src/vscode/{extensionScaffold,patternCatalog,patternScanner,inlineScore,quickFixes,types,index}.ts | B7: not in src/index.ts, no cli/api/studio importer | MEDIUM | WIRE or DELETE |
| G2-45 | `replayBenchmarkCorpus` (29,468 lines, verified) reachable but replays nothing — validates caller-supplied hashes; near-inert giant | src/benchmarks/replayBenchmarkCorpus.ts | B17: 29,468L; no replay execution | MEDIUM | DECOMPOSE |
| G2-46 | `src/harness` directory empty (verified 0 files) despite being an assigned area | src/harness/ | B17: 0 files | LOW | DELETE dir |

### G2 rollup

- **Item count:** ~46 register rows spanning ~90 fully-DEAD files (G2.A) and ~282 ORPHAN-barrel modules (G2.B/C), the largest single class in the sweep. DEAD rows resolve mostly to DELETE/CONSOLIDATE; ORPHAN rows split into WIRE (real+tested, product wants them reachable) vs the legitimately-external SDK surface (DOCUMENT).
- **Severity split:** CRITICAL 0; HIGH 11 (G2-01, 03, 12, 21, 24, 25, 26, 28, 30, 38, 39); MEDIUM ~26; LOW ~9. Nothing here ships a wrong number to a user by itself, so no CRITICAL — but the HIGH items are the ones an evidence-integrity product cannot leave ambiguous: dead code that inflates coverage (G2-01), orphaned real engines the product advertises (G2-24/25/38/39), and gating/lifecycle machinery that silently enforces nothing (G2-21/28/30).
- **Highest-leverage moves:**
  1. **Delete the DEAD tier wholesale and stop counting it as coverage/evidence.** G2-01 (25 product files), G2-02/03 (assurance orphans+legacy chain), and the ~40 dead shims/duplicates (G2-04→23) are the single biggest defensibility win: they remove the "file exists ⇒ capability" inflation that score/* modules exploit, and they cut the coverage-illusion where tests import unreachable code. Pair each duplicate with a CONSOLIDATE target rather than a bare delete.
  2. **Adjudicate every ORPHAN-barrel cluster with a one-time WIRE-or-DELETE decision**, because "real, tested, but reachable by nothing" is exactly the state that lets AMC claim a capability it never runs. Prioritize the ones with a live consumer waiting: `llmApiIntegration` (G2-38) fixes the mock judge; `enterpriseIam` (G2-39) is self-flagged "#1 blocker"; the enforce guards (G2-30) and claims lifecycle (G2-28) are governance primitives that currently enforce nothing.
  3. **Formally separate the legitimate published-SDK barrel surface (G2-43) from accidental orphans** — relabel `src/index.ts` / `sdk/*` / `agents/*` as "external package API, not internal product wiring" so future sweeps don't re-flag them, and make a product call on the two dormant real subsystems (`src/vscode` G2-44, `replayBenchmarkCorpus` G2-45) rather than letting 30k-line and whole-dir dead weight sit ambiguously between roadmap and rot.


---

## G3 — Duplication — parallel and competing implementations

AMC sells evidence integrity and agent trust: a buyer must be able to point at *one* certificate issuer, *one* red-team engine, *one* fix pipeline and trust that the score it emits is the score the product enforces. Instead the codebase carries the same concept two, three, even five times over — often with the copies silently drifted (different endpoints, different confidence constants, different EU-AI-Act tiers). Every parallel implementation is a place where the "signed" artifact a customer receives may have come from the *other* copy, and where a fix to one branch leaves the shipped path untouched. This class is therefore not cosmetic tech-debt; competing signers and competing scorers are a direct threat to the one property the product is supposed to guarantee. All rows below were verified against the repo (paths, line counts, importer greps, file diffs).

### Competing core engines (product-critical twins)

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|---|---|---|---|---|
| G3-01 | Three parallel certificate systems | `src/assurance/certificate.ts` (672L), `src/assurance/assuranceCertificates.ts` (310L), `src/cert/trustCertificate.ts` (456L) | Ledger L32 calls certificate.ts "second, parallel cert system to assuranceCertificates"; cert/ is a third `.amccert` issuer; B1 flags the first two | CRITICAL | CONSOLIDATE→one cert issuer |
| G3-02 | Five+ fix systems, one duplicating another | `src/mechanic/autoFixer.ts`, `src/product/fixGenerator.ts`, `src/guide/oneClickFix.ts`, `src/mechanic/agentFixPlan.ts`, `src/mechanic/fixerRca.ts`, `src/doctor/doctorFix.ts`, `src/guide/fixCli.ts`, `src/api/fixerRouter.ts`, `src/vscode/quickFixes.ts` | B5/B15 + ledger L352: autoFixer.ts (ORPHAN, hardcoded 0.85 confidence) is a straight duplicate of product/fixGenerator.ts (the actual `amc fix` backend); fixGenerator also emits imports of phantom enforce modules (B11) | CRITICAL | CONSOLIDATE→fixGenerator; DELETE autoFixer |
| G3-03 | Two+ red-team engines, all facades | `src/assurance/assuranceRunner.ts`, `src/redteam/runner.ts`, `src/cli.ts` (`shield red-team`), `src/shield/dynamicAttackGenerator.ts` vs real `src/shield/continuousRedTeam.ts` | B1/B8/B19: assuranceRunner + redteam/runner both use canned `syntheticResponse`; cli `shield red-team` is `Math.random()<0.2`; only continuousRedTeam is a real loop | CRITICAL | CONSOLIDATE→real engine; REPLACE-WITH-REAL |
| G3-04 | Two benchmark subsystems + drifted UI twins | `src/bench/` (18 files, real registry, `/bench/*`) vs `src/benchmarks/` (24 files, provider-drift + `frontierBaseline`/`benchRunner` facades, `/benchmarks/list`); `console/.../app.js` vs `benchmarks.js` | B2/B17 + ledger L127: app.js benchmarks hits `/benchmarks/list`, live benchmarks.js hits `/bench/*` — "drifted twins" | HIGH | CONSOLIDATE→bench; DELETE facades |
| G3-08 | Duplicate governance stack, BOTH CLI-wired | `src/governor/policyCanary.ts` vs `emergencyOverride.ts` + `policyDebt.ts` + `policyCanaryMode.ts` + `ops/governanceSlo.ts` | B13: policyCanary reimplements override/debt/drift/SLO; CLI wires both copies under different commands (cli.ts 15673–15835 vs 19545–19644) | CRITICAL | CONSOLIDATE→one governor path |

### Cross-directory concept twins (same name/idea, two dirs)

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|---|---|---|---|---|
| G3-05 | Vendor provider-drift adapters mirrored 3× | `src/benchmarks/{helm,humanloop,inspect,patronus,promptLayer,promptfoo,tensorZero}ProviderDrift.ts` **and** identical set in `src/watch/`; referenced across `api/{benchmark,score,shield,watch}Router.ts` | Verified: 8 files each dir; ledger L988 "8 watch shim files re-export benchmarks, but all routers import benchmarks directly — dead weight" | HIGH | DELETE watch mirror |
| G3-06 | `classifyEuAiActRisk` implemented twice | `src/compliance/euAiActClassifier.ts` (wired) vs `src/compliance/globalRegulatory.ts` (orphan) | B14 + verified grep: both define the classifier; globalRegulatory also ships hardcoded DPIA/"construct validity" reports | HIGH | CONSOLIDATE→euAiActClassifier |
| G3-07 | claims/ vs score/ same-name modules | `src/claims/claimExpiry.ts`≈`src/score/claimExpiry.ts`; `src/claims/confidenceDrift.ts`≈`src/score/confidenceDrift.ts` | B10 + ledger L1114/L1047: overlapping concepts under identical names; claims/* dead-ends (barrel unimported) | HIGH | CONSOLIDATE→score |
| G3-11 | monitoring/ vs drift/ | `src/monitoring/` (DriftDetector, RealtimeMonitor — barrel-only) vs `src/drift/` (freezeEngine, real); `drift/continuousMonitor` wraps `monitor/trustDriftMonitor` | B5/B11: monitoring/ is a stranded island; real drift product lives in drift/ | HIGH | CONSOLIDATE→drift; DELETE monitoring |
| G3-12 | Two IncidentTimeline implementations | `src/ops/operatorUx.ts` (competing IncidentTimeline) vs `src/incidents/incidentTimeline.ts` | B11/ledger L1232: operatorUx defines a competing IncidentTimeline; incidents advanced layer is barrel-only | MEDIUM | CONSOLIDATE→incidents |
| G3-13 | product near-parallel builders | `product/taskSpec`↔`taskSpecBuilder`, `contextPack`↔`contextPackBuilder`, `docsIngestion`↔`chunkingPipeline`, `clarification`↔`clarificationOptimizer` | B15: near-parallel generations; product/* mostly unreachable (72/85 dead/orphan) | HIGH | CONSOLIDATE→wired builder |
| G3-14 | Three overlapping calibration modules | `src/diagnostic/calibration.ts`, `selfCalibration.ts`, `selfModelCalibration.ts` | B6 + verified: three modules; selfModelCalibration.ts fully dead (0 importers/tests) | MEDIUM | CONSOLIDATE→calibration |
| G3-23 | truthProtocol vs truthguard | `src/runtime/truthProtocol.ts` vs wired truthguard CLI subsystem | B4/ledger L341: heading-regex validator conceptually duplicates the wired truthguard | MEDIUM | CONSOLIDATE→truthguard |
| G3-24 | dataResidency twice | `src/vault/dataResidency.ts` (orphan-barrel) vs `src/compliance/dataResidency.ts` | Ledger L1256: "duplicate concern of compliance/dataResidency.ts" | LOW | CONSOLIDATE→compliance |
| G3-32 | Duplicate stale model-pricing tables | `src/product/costLatencyRouter.ts` vs `toolCostEstimator.ts` | B15: hardcoded stale pricing appears twice with mutually inconsistent numbers | MEDIUM | CONSOLIDATE→one price source |

### Legacy / superseded stores, flows and inline re-implementations

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|---|---|---|---|---|
| G3-09 | Two setup flows | `src/setup/setupCli.ts` (test-only) vs `quickSetupCli.ts` | B5/ledger L480: setupCli superseded by quickSetupCli | MEDIUM | DELETE setupCli |
| G3-10 | Two approval stores | `src/approvals/approvalStore.ts` + `approvalSchema.ts` (barrel-only) vs `approvalChainStore.ts` | B5/ledger L480: parallel stores, first superseded | MEDIUM | DELETE legacy store |
| G3-15 | app.js dead equalizer/benchmarks twins | `src/console/assets/app.js` (3,833L) unreachable branches vs live `equalizer.js`/`benchmarks.js` | B2: monolith carries dead branches for pages that load standalone modules; endpoints drift (`/agents/:id/targets` vs `/mechanic/targets`) | MEDIUM | DELETE dead branches |
| G3-16 | Three "run under observation" generations | cli `wrap` (4897), `supervise` (4953), `adapters run`→`adapterRunner.ts` spawn, plus `gateway` proxy | Verified cli.ts; all four "observe an agent's traffic" via different code paths/evidence formats | MEDIUM | CONSOLIDATE/DOCUMENT boundaries |
| G3-17 | Badge/share logic re-implemented inline | `src/diagnostic/quickscoreShare.ts` + `src/…/badgeCli.ts` vs cli.ts inline shields URL (×2, ~3243/~3430) | B6/ledger L532,L1344: cli.ts reimplements `--share` and shields.io URL inline twice | LOW | CONSOLIDATE→badgeCli |
| G3-25 | Parallel unused view layer | `src/console/state/` (uiFormat/uiModels/uiSelectors, 0 importers) vs plain-JS UI; `dashboard/components/` radar/timeline re-implemented in app.js | B2/B12: TS view-models never imported; components/ copied to every build but app.js re-implements them | MEDIUM | DELETE dead view layer |
| G3-31 | Two doctor surfaces | `src/adapters/adapterDoctor.ts` (DEAD, 0 importers) vs `src/doctor/` subsystem | B10 + verified: adapterDoctor "wraps detect into doctor rows", never wired | LOW | DELETE adapterDoctor |

### Thin dead-duplicate wrappers, stubs and shims

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|---|---|---|---|---|
| G3-18 | Signer/verifier wrapper duplicates (cluster) | `bank/bankSigner.ts`+`bankVerifier.ts`, `canonSigner.ts`+`canonVerifier.ts`, `crypto/signing/signerNotary.ts`, `valueSigner.ts`, `cgxSigner.ts`, `vault/keyRotation.ts`, `identityConfigLoader.ts` | B6/B12/B17 + ledger L504/L1261/L1321: each is a 6–8-line wrapper duplicating loader/notary/config functions; zero importers | MEDIUM | DELETE (7+ files) |
| G3-19 | `stubs.ts` dead-duplicate cluster | `src/shield/stubs.ts`, `src/enforce/stubs.ts` (guards), `src/product/stubs.ts` | B7/B11/B15: each re-declares/duplicates real modules (manifest/registry/ingress/sanitizer/detector; mdns/proxy/phishing/secretBlind; 25 product types) with no importer | MEDIUM | DELETE all stubs.ts |
| G3-20 | LiveDrift/providerDrift re-wraps | `src/drift/bishengObservabilityLiveDrift.ts` (12-line re-wrap of `watch/…`), `watch/providerDriftAlerts.ts` (4-line shim of `benchmarks/providerDriftBenchmark`) | B7/B9 + ledger L742/L882 | LOW | DELETE re-wraps |
| G3-21 | Near-duplicate assurance-pack spellings | `do-not-answer-pack.ts`↔`donotanswer-pack.ts`, `toxicchat-pack.ts`↔`toxic-chat-pack.ts` | B1/ledger L51-52: dead near-duplicates, same export name as wired pack | LOW | DELETE dead spellings |
| G3-22 | Duplicated tar-extraction logic | `src/…/binderArtifact`/`binderVerifier` raw `tar -xzf` vs `security/safeTarArchive` | B4/ledger L338: bypasses containment limits — duplication *and* an unprotected extraction path | HIGH | CONSOLIDATE→safeTarArchive |
| G3-30 | Duplicate scratch scripts | `scripts/swarm-test.py`↔`swarm-test-v2.py`; `internal/debug/test-model-scanner.cjs`↔`.mjs` | repo-scripts-ci/repo-satellites: zero references; two spellings of same scanner | LOW | DELETE |

### Cross-language / repo-level parallel builds

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|---|---|---|---|---|
| G3-26 | Full parallel Python re-implementation of TS core | `platform/python/amc/{score,shield,enforce,vault,watch,product}` (~146 modules 1:1 by name, zero shared code) | repo-python findings 1: permanent two-codebase sync burden, already drifted (score: 2 Python vs 102 TS modules) | HIGH | DOCUMENT/RELABEL scope; decide one-of |
| G3-27 | Three disjoint Python client/product surfaces | `platform/python` (port), `sdk/python/amc_sdk` (CLI subprocess), `src/sdk/python/amc_client` (Bridge HTTP) | repo-python findings 2: none interoperate; two "official AMC Python SDKs"; platform FastAPI has no SDK | MEDIUM | CONSOLIDATE→one SDK |
| G3-28 | install.sh duplicated verbatim | `./install.sh` ≡ `./website/install.sh` (105L, byte-identical) + `tmp/*/install.sh` copies | Verified `diff` = IDENTICAL | LOW | CONSOLIDATE→single source |
| G3-29 | Docs duplicate-pair cluster | `docs/compliance/` hyphen/underscore pairs (eu-ai-act, iso-42001, nist-ai-rmf, soc2 + compliance-nist); `COMPLIANCE.md`↔`COMPLIANCE_MAPS.md`; `ECOSYSTEM_VIEW`↔`ECOSYSTEM_COMPARATIVE_VIEW`; `FULL_MODULE_ROADMAP`↔`PYTHON_MODULE_MAPPING`; `SECURITY_COMPLIANCE_QUICKSTART`↔`SECURITY_PATH`; `SOLO_DEV_PATH`/`_QUICKSTART`/`SOLO_USER` (3); `ONE_CLICK_FIX`↔`ONE_COMMAND_FIX`; `docs/INDEX.md`(47) vs `website/docs/docs.js`(343); gap-0610 in docs/research + source-reviews | repo-docs DUP/STALE flags | MEDIUM | CONSOLIDATE→canonical docs |

### G3 rollup

**Count:** 30 gap rows (several are homogeneous clusters — G3-05 covers 16 files, G3-18 covers 7+, G3-19 covers 3 stubs, G3-29 covers ~12 doc pairs, G3-26 covers ~146 Python modules). **Severity split:** CRITICAL 4 (G3-01 certs, G3-02 fixes, G3-03 red-team, G3-08 governance) · HIGH 8 (G3-04, 05, 06, 07, 11, 13, 22, 26) · MEDIUM 12 · LOW 6.

**Highest-leverage moves:**
1. **Collapse the four CRITICAL "signed-artifact" twins first (G3-01/02/03/08).** These are the paths that emit certificates, fixes, red-team verdicts and governance decisions — the exact artifacts a buyer trusts. Pick one implementation per concept, delete the rest, and make the CLI/API/routers point only at the survivor so a fix can never land on a dead branch. Note G3-03 is entangled with G1 (facade) — consolidation must also swap in a real engine, not just pick a facade.
2. **Sweep the dead mirror/shim/stub layers (G3-05 watch mirror, G3-18 signer wrappers, G3-19 stubs.ts, G3-20 re-wraps, G3-21 pack spellings, G3-31 adapterDoctor).** These are ~35+ zero-importer files that add nothing but drift surface and inflate "module count" claims; they are pure DELETE with no behavior change and would visibly shrink the duplication footprint fast.
3. **Make an explicit ownership decision on the Python parallel platform (G3-26/27).** A 146-module, zero-shared-code re-implementation that has *already* drifted (2 vs 102 score modules) cannot be kept silently in sync; either designate the TS core as canonical and relabel `platform/python` as a demo port, or invest in a generation/binding strategy — but the current "two full platforms, one repo" posture is the single largest ongoing duplication cost.


---

## G4 — Structure & maintainability: oversized files, monoliths, decomposition debt

AMC sells itself as an evidence-integrity and agent-trust product, yet a large fraction of its own code lives in files far past the repo's own 800-line cap (`~/.claude/rules/common/coding-style.md`: "800 max"). Unreviewable files are exactly where the facades catalogued in other gap classes hide — a 24,395-line CLI and an 18,458-line "metric validity" registry cannot be audited in a single reading, so mock respondFns (`buildMockReportForUx()`, `Math.random() < 0.2`) sit undetected inside them. Worse, the project's one structural guardrail — `scripts/architecture-boundaries-check.mjs` — does not shrink the monoliths; it *freezes* the two largest at their current audit baselines, converting the cap violation into a blessed permanent fixture. All line counts below were verified directly against the repo at HEAD.

### Extreme monoliths (>4,000 lines) — verified

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|-----|-----------------|----------|----------|-------------|
| G4-01 | `cli.ts` — 24,395-line / 0.99 MB monolith with **990** `.command()` registrations, 30× the cap; hides `buildMockReportForUx` and random shield evaluator | `src/cli.ts` | `wc -l`=24395; `grep -c .command(`=990 | CRITICAL | DECOMPOSE by command domain |
| G4-02 | `replayBenchmarkCorpus.ts` — 29,468 lines, largest file in repo; ~882 logic-ish lines, **~97% data literal** (hash/metric fixtures, no replay executes) | `src/benchmarks/replayBenchmarkCorpus.ts` | 29468 total vs 882 logic lines | HIGH | RELOCATE→generated JSON asset |
| G4-03 | `metricValidity.ts` — 18,458 lines, append-only per-benchmark constants registry; ~888 logic lines, **~95% data literal** | `src/score/metricValidity.ts` | 18458 vs 888 logic | HIGH | RELOCATE→data file; exempt from cap |
| G4-04 | `liveDriftAlerts.ts` — 15,979 lines (20× cap), inside the ~8,700-line orphan `watch/` island (never CLI/API-invoked) | `src/watch/liveDriftAlerts.ts` | 15979; B9 orphan-barrel | CRITICAL | DECOMPOSE + DELETE if unwired |
| G4-05 | `studioServer.ts` — 8,879-line "giant monolith routing all surfaces"; frozen by ratchet, not decomposed | `src/studio/studioServer.ts` | 8879; ratchet baseline 8883 | CRITICAL | DECOMPOSE by route group |
| G4-06 | `product.py` — 7,744-line Python router monolith (largest Python file), backs the parallel product surface | `platform/python/amc/api/routers/product.py` | 7744 | HIGH | DECOMPOSE by resource |
| G4-07 | `publicMethodology.ts` — 5,454 lines, "mostly one manifest literal"; ~196 logic lines, **~96% data literal** | `src/methodology/publicMethodology.ts` | 5454 vs 196 logic | MEDIUM | RELOCATE→JSON manifest |
| G4-08 | `questionBank.ts` — 5,071-line static question catalog | `src/diagnostic/questionBank.ts` | 5071 | MEDIUM | RELOCATE→data file |
| G4-09 | `types.ts` — 4,317-line shared type dump (the "cli types" monolith) | `src/types.ts` | 4317 | MEDIUM | DECOMPOSE by domain module |
| G4-10 | `questionScoreExplainability.ts` — 4,151 lines | `src/diagnostic/questionScoreExplainability.ts` | 4151 | MEDIUM | DECOMPOSE per-question |
| G4-11 | `providerDriftBenchmark.ts` — 4,102 lines; validates caller-supplied hashes, no canary runs | `src/benchmarks/providerDriftBenchmark.ts` | 4102; B17 | MEDIUM | RELOCATE→data + DECOMPOSE |

### Mid-tier monoliths (1,000–4,000 lines) — verified real logic

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|-----|-----------------|----------|----------|-------------|
| G4-12 | `console/assets/app.js` — 3,833-line browser monolith with dead `equalizer`/`benchmarks` branches (standalone modules load instead) | `src/console/assets/app.js` | 3833; B2 | HIGH | DECOMPOSE + DELETE dead branches |
| G4-13 | `dashboard/templates/styles.css` — 3,487-line stylesheet | `src/dashboard/templates/styles.css` | 3487; B12 | MEDIUM | DECOMPOSE by component |
| G4-14 | `industryPacks.ts` — 2,525 lines static data (41-pack catalog) | `src/domains/industryPacks.ts` | 2525; B11 | MEDIUM | RELOCATE→data file |
| G4-15 | `index.ts` — 2,485-line root barrel; no `src` file imports it, so barrel/module drift never breaks the build | `src/index.ts` | 2485; B6/B19 | HIGH | DECOMPOSE; add barrel-drift test |
| G4-16 | `ledger.ts` — 2,366 lines (core evidence ledger) | `src/ledger/ledger.ts` | 2366; B4 | HIGH | DECOMPOSE (read/write/verify) |
| G4-17 | `runner.ts` — 2,265-line diagnostic runner | `src/diagnostic/runner.ts` | 2265; B6 | HIGH | DECOMPOSE per phase |
| G4-18 | `openapi.ts` — 2,212-line hand-maintained spec builder | `src/studio/openapi.ts` | 2212; B6 | MEDIUM | RELOCATE→spec data |
| G4-19 | `dashboard/templates/app.js` — 2,125-line SPA; re-implements radar/timeline that dead `components/` also define | `src/dashboard/templates/app.js` | 2125; B12 | HIGH | DECOMPOSE + DELETE dead components |
| G4-20 | `builtInMappings.ts` — 2,036 lines static mapping data | `src/compliance/builtInMappings.ts` | 2036; B14 | MEDIUM | RELOCATE→data file |
| G4-21 | `resourceManifest.ts` — 2,033 lines | `src/enforce/resourceManifest.ts` | 2033; B11 | MEDIUM | DECOMPOSE |
| G4-22 | `evalImporters.ts` — 1,972 lines | `src/eval/evalImporters.ts` | 1972; B18 | MEDIUM | DECOMPOSE per importer |
| G4-23 | `hookIntegration.ts` — 1,952 lines | `src/adapters/hookIntegration.ts` | 1952; B10 | MEDIUM | DECOMPOSE |
| G4-24 | `gateway/server.ts` — 1,831 lines (real, wired backbone) | `src/gateway/server.ts` | 1831; B8 | MEDIUM | DECOMPOSE by handler |
| G4-25 | `evidenceDrilldown.ts` — 1,817 lines; name collides with dead `watch/evidenceDrilldown.ts` | `src/diagnostic/evidenceDrilldown.ts` | 1817; B6/B9 | MEDIUM | DECOMPOSE; rename to disambiguate |
| G4-26 | `workspaceRouter.ts` — 1,792 lines | `src/workspaces/workspaceRouter.ts` | 1792; B16 | MEDIUM | DECOMPOSE |
| G4-27 | `firewall.ts` — 1,639 lines | `src/runtime/firewall.ts` | 1639; B4 | MEDIUM | DECOMPOSE |
| G4-28 | `bridgeServer.ts` (1,377) + `hookControl.ts` (1,370) + `hookIngress.ts` (883) — bridge subsystem trio over cap | `src/bridge/*` | 1377/1370/883; B16 | MEDIUM | DECOMPOSE per file |
| G4-29 | `toolhubServer.ts` (1,260) + `hostDb.ts` (1,247) — server + host DB over cap | `src/toolhub/`, `src/workspaces/` | 1260/1247; B8/B16 | MEDIUM | DECOMPOSE |
| G4-30 | `binderCollector.ts` (1,173) + `bundle.ts` (1,159) — audit/bundle over cap | `src/audit/`, `src/bundles/` | 1173/1159; B4/B9 | MEDIUM | DECOMPOSE |
| G4-31 | `observabilityBridge.ts` (1,157) + `orgRun.ts` (1,108) — watch/org over cap (orgRun also fabricates diagnostics) | `src/watch/`, `src/org/` | 1157/1108; B9 | MEDIUM | DECOMPOSE |
| G4-32 | `integrationDeliveryQueue.ts` (1,134) + `mcpAgentProvider.ts` (1,098, facade) + `governanceSlo.ts` (1,046) + `neutralImporter.ts` (1,041) + `integrationScaffold.ts` (1,035) + `archetypes/index.ts` (1,010) | mixed dirs | verified 1,010–1,134; B8/B13/B14/B16 | MEDIUM | DECOMPOSE per file |

### Just-over-cap real-logic files (800–1,000 lines)

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|-----|-----------------|----------|----------|-------------|
| G4-33 | 15 files 899–994 lines over cap: `formalVerification.ts` (994), `actionPolicyEngine.ts` (989), `fleet/governance.ts` (963), `scoreRouter.ts` (957), `autoInstrument.ts` (951, **dead**), `operatorUx.ts` (945), `cascadeSimulator.ts` (942), `governanceLineage.ts` (942), `predictiveValidity.ts` (928), `microCanary.ts` (904), `otelExporter.ts` (899) | `src/enforce`, `src/governor`, `src/fleet`, `src/api`, `src/sdk`, `src/ops`, `src/claims`, `src/score`, `src/assurance`, `src/observability` | all verified >800; B3/B4/B8/B13 | MEDIUM | DECOMPOSE; DELETE autoInstrument |
| G4-34 | 5 files 802–885 lines over cap: `ci/gate.ts` (885, load-bearing), `promptPackApi.ts` (838), `assuranceRunner.ts` (805, facade core), `regulatoryAutomation.ts` (802), `operationalIndependence.ts` (1,297) | mixed dirs | verified; B3/B5/B15 | MEDIUM | DECOMPOSE |
| G4-35 | `guideGenerator.ts` (1,273) + `judgeCalibration.ts` (1,291) + `cli-late-stage-commands.ts` (1,561) + `cli-business-commands.ts` (1,100) over cap | `src/guide`, `src/eval`, `src/cli-*` | verified; B10/B18/B19 | MEDIUM | DECOMPOSE |

### Structural monoliths & systemic decomposition debt

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|-----|-----------------|----------|----------|-------------|
| G4-36 | Ratchet **blesses** the two worst monoliths instead of shrinking them: `lineBudgets` freeze `cli.ts` at 24417 and `studioServer.ts` at 8883 as permanent "audit baselines" — the only two files with a guard, and it enforces "don't grow," never "get smaller" | `scripts/architecture-boundaries-check.mjs` | `legacyAuditLineCount: 24417 / 8883` | HIGH | REPLACE-WITH-REAL descending ratchet |
| G4-37 | Over-fragmentation: **182 dirs under `src/`, 34 hold exactly one file** (e.g. `snapshot`, `crypto`, `monitor`, `mode`, `targets`, `verify`, `sandbox`, `badge`, `telemetry`, `i18n`, `loop`) — high coupling cost, contradicts "high cohesion, low coupling" | `src/*` | `find src -type d`=182; 34 single-file dirs | MEDIUM | CONSOLIDATE single-file dirs |
| G4-38 | SQLite created via **3 inconsistent idioms** across 8+ distinct DB files: shared `storage/sqlitePool` `getDb()` (only 6 callers), direct `import Database from 'better-sqlite3'` + `new Database()` (25 callers), and dynamic `require('better-sqlite3')` (4 callers) — 8 DB files (`ledger`, `evidence`, `guard_events`, `score_history`, `score_sessions`, `corrections`, `prompt_modules`, `scratchpad`, `integration-delivery`) with no single connection/migration owner | `src/storage/sqlitePool.ts` + 32 openers | grep idiom counts 6/25/4 | HIGH | CONSOLIDATE→sqlitePool |
| G4-39 | `cli-*` satellite pattern is half-wired: **10 satellite files exist, only 3 imported** into `cli.ts` (`cli-watch`, `cli-late-stage`, `cli-domain-product`); 7 (`cli-business`, `cli-eval-dataset`, `cli-import`, `cli-observability`, `cli-strategy`, `cli-trace`, `.fragment`) are not imported there — extraction without wiring, so `cli.ts` never actually shrank | `src/cli-*.ts` | 3 imports found via grep | MEDIUM | WIRE or DELETE stray satellites |
| G4-40 | `cli-watch-commands.ts` — imported but body is a hard `return;` at line 16, leaving ~170 unreachable lines; `cli-new-commands.ts.fragment` is a 506-line leftover duplicating shield/enforce/product commands | `src/cli-watch-commands.ts`, `src/cli-new-commands.ts.fragment` | `return;` at L16; B19 | HIGH | DELETE dead satellite + fragment |

### G4 rollup

**Counts.** 40 gap rows covering **~63 distinct source files over the 800-line cap** (verified: `find` counts 76 oversized non-test files repo-wide; ~63 in `src/` product code plus `product.py`) and 5 systemic structural patterns. Severity split: **4 CRITICAL** (cli.ts, liveDriftAlerts, studioServer, replayBenchmarkCorpus-adjacent island), **~9 HIGH** (ledger, runner, index barrel, product.py, the ratchet, SQLite idioms, dead satellites, console app.js, metricValidity), **~27 MEDIUM**, 0 LOW. A structural sub-pattern worth flagging: **~4 of the 11 extreme monoliths are ~95%+ data literal** (replayBenchmarkCorpus 97%, metricValidity 95%, publicMethodology 96%, plus questionBank/industryPacks/builtInMappings) — these are append-only constant registries, not logic, and should be relocated to generated data assets and *exempted* from the line cap rather than "decomposed," which changes the fix from refactoring to extraction.

**Highest-leverage moves.**
1. **Replace the ratchet with a descending one (G4-36).** Today the single structural guard permanently blesses the two worst files. Flip `architecture-boundaries-check.mjs` to fail when a file *exceeds* a baseline that only ratchets *downward*, and extend `lineBudgets` to every file >800. This turns the cap from aspiration into an enforced, monotonically-improving invariant — and it is the cheapest change on this list.
2. **Split logic from data across the six giant registries (G4-02/03/07/08/14/20).** Relocating replayBenchmarkCorpus, metricValidity, publicMethodology, questionBank, industryPacks, and builtInMappings to JSON/generated assets removes ~63,000 of the ~641,000 counted source lines (~10%) mechanically, with near-zero behavioral risk, and shrinks the surface where facades hide.
3. **Decompose `cli.ts` and finish the satellite extraction (G4-01/39/40).** The 24,395-line / 990-command CLI is where the mock report and random shield evaluator live; complete the `cli-*` split (wire the 7 stray satellites, delete the dead `cli-watch` body and `.fragment`), so the flagship monolith becomes reviewable and future facades cannot slip in unseen.


---

## G5 — Claim, number & documentation drift

AMC's entire value proposition is that it detects "documentation inflation" — the gap between what an agent *claims* and what it can *prove* (the whitepaper's headline 84-point EPES result). A product that sells trust-weighted evidence integrity cannot itself ship counts that contradict each other file-to-file, a license that disagrees with its own RFC, or "ML-powered" labels on `Math.random`. Every drift below is a live counter-example a skeptical buyer (or a competitor) can screenshot to discredit the tool. These are cheap to verify and were verified directly against the repo; the numbers here are ground-truth from `dist/` and `src/`, not from any doc.

### G5.A — Question-count drift (canonical live bank = **244**, verified `dist/diagnostic/questionBank.js` → `questionIds.length === 244`)

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|---|---|---|---|---|
| G5-01 | "base **138**-question AMC rubric", "**283** domain-level questions", total "**1,021** questions" | docs/DOMAIN_PACKS.md:3,54 | Live base = 244; 283 & 1,021 reconcile to nothing in code (found 61 domain-pack + 150 deep-industry) | HIGH | FIX → 244 canonical |
| G5-02 | "all **67** diagnostic questions" | docs/EQUALIZER_TARGETS.md:3 | Live bank = 244 | HIGH | FIX → 244 |
| G5-03 | "Full" bank export ships only **111** questions | docs/AMC_QUESTION_BANK_FULL.json | `require()` → 111 entries vs 244 live | HIGH | REPLACE-WITH-REAL 244-bank |
| G5-04 | Version tag says **240** questions | `dist` `LEGACY_QUESTION_SET_VERSION = "amc-legacy-240-v1"` | Array length is 244; the id embeds a stale 240 | LOW | FIX version string |
| G5-05 | Research sweeps cite "**138** questions" | docs/RESEARCH_PAPERS_2026 / _MARCH_2026 / RESEARCH_GAPS_* (5 docs) | Frozen 138 baseline vs 244 | MEDIUM | FIX or DOCUMENT snapshot date |
| G5-06 | Whitepaper "optional **264**-question lifecycle set" vs README "**20** lifecycle expansion" | whitepaper/AMC_WHITEPAPER_v1.md abstract; README.md:871 | 264 = 244+20 expanded; whitepaper phrasing implies a separate 264-set | LOW | DOCUMENT/RELABEL "244+20=264" |

### G5.B — Module / pack / adapter count drift (live: **15** adapters, **153** assurance-pack files, **102** score modules)

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|---|---|---|---|---|
| G5-07 | **Same-file self-contradiction**: heading "## 14 Framework Adapters" vs three "15 adapters" claims | README.md:617 vs README.md:169,716,871 | `src/adapters/builtins` has 15; the heading is the lone "14" | HIGH | FIX → 15 (one number) |
| G5-08 | "14 built-in" adapters | docs/ADAPTER_COMPATIBILITY.md | src has 15 (openclaw newest) | MEDIUM | FIX → 15 |
| G5-09 | "**142** assurance packs" (×3 + whitepaper) | README.md:167,274,871; AMC_WHITEPAPER_v1.md | `ls src/assurance/packs/*.ts` = 153 files; 142 is the *registered/wired* subset, 153 the file count — the two are never reconciled (11 extra = unimported/dup packs per B1) | HIGH | DOCUMENT/RELABEL "142 wired of 153 files" |
| G5-10 | Research sweeps cite "**74** score modules" and "**86–99** assurance packs" | docs/RESEARCH_PAPERS_* / RESEARCHER_EXODUS_GAP_ANALYSIS.md | Actual 102 score / 153 pack files | MEDIUM | FIX or date-stamp |

### G5.C — Assurance schema internal contradiction (the packs cannot validate against their own schema)

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|---|---|---|---|---|
| G5-11 | `assurancePackIdSchema` enumerates **7** pack ids | src/assurance/assuranceSchema.ts:9–17 | injection/exfiltration/toolMisuse/truthfulness/sandboxBoundary/notaryAttestation/context-leakage — 7 of 142/153 packs; the schema would reject 135+ of its own pack ids | CRITICAL | FIX → generate enum from registry |
| G5-12 | Policy `packsEnabled` object lists **6** packs, never consulted by runner | src/assurance/assurancePolicySchema.ts:32–38 | 6 booleans vs 142 packs; runner ignores the toggle (see facade class) | HIGH | WIRE or DELETE toggle |

### G5.D — Test-count drift (actual: **1,098** `*.test.ts` files / **8,403** static `it()`/`test()` blocks)

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|---|---|---|---|---|
| G5-13 | Badge "**8,604** passing" + "**1,087** files / 8,604" | README.md:17 (shields badge) & README.md:850 | 1,098 files (stale by 11); 8,403 static blocks (~8,604 plausible after `.each` expansion, but hand-maintained) | MEDIUM | FIX via generated badge |
| G5-14 | Third, unrelated count: "**5031** AMC tests, **336** test files" | qa/README.md:12 | Hardcoded, guaranteed stale vs 1,098 files; no relation to root suite | MEDIUM | FIX or DELETE claim |
| G5-15 | "**6507** tests" boilerplate repeated verbatim in **162** files | docs/source-reviews/*.md (grep = 162 matches) | Frozen snapshot; suite is now ~8.4k blocks | MEDIUM | DOCUMENT (template) or regenerate |
| G5-16 | Whitepaper "**8,604** passing Vitest tests across **1,087** files" + "**1,200+** platform modules" | whitepaper/AMC_WHITEPAPER_v1.md abstract | Same stale file count; "1,200+" is an unverified aggregate | MEDIUM | FIX at publish time |
| G5-17 | "80% coverage" standard vs coverage thresholds set to **0** | vitest.config.ts vs rules/testing.md | Config lines/functions/branches/statements = 0; badge implies rigor the gate does not enforce | HIGH | FIX thresholds or RELABEL claim |

### G5.E — Version / license / config drift

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|---|---|---|---|---|
| G5-18 | **License contradiction**: MIT vs Apache 2.0 | LICENSE:1 + package.json:86 (**MIT**) vs docs/AMC_STANDARD_RFC.md:8 (**"License: Apache 2.0"**) | Two incompatible licenses on the same project; the "open standard" RFC claims Apache while the code ships MIT — a legal-integrity own-goal for a compliance product | CRITICAL | FIX → one license |
| G5-19 | Helm `appVersion "1.0.0"` vs 1.1.1 pinned everywhere | deploy/helm/amc/Chart.yaml:6 | package.json/install.sh/Formula all 1.1.1; Pulumi+Terraform inherit the stale appVersion | MEDIUM | FIX → 1.1.1 |
| G5-20 | `.nvmrc` Node **22** vs CI/Docker Node **20** | .nvmrc (=22) vs ci.yml/docker-build.yml/action.yml (Node 20) | Local dev and CI run different majors by default; nightly matrix tests both | MEDIUM | FIX → align (20 or 24) |
| G5-21 | Whitepaper filename `_v1` vs header "Version 2.0" | whitepaper/AMC_WHITEPAPER_v1.md:4 | Content is v2.0 (arXiv-style) | LOW | FIX filename → v2 |
| G5-22 | Stale `## [Unreleased]` block buried mid-file | CHANGELOG.md:537 | Top entry 1.1.1 is correct; a keep-a-changelog Unreleased stub sits at line 537 | LOW | DELETE stale block |
| G5-23 | Two stale in-repo SBOMs disagree | docs/sbom.md ("Basic SBOM" 2026-02-22) + root sbom.json (Apr 7) | Real SBOM regenerated at pack time; both committed copies are dead/stale | LOW | DELETE, generate at release |

### G5.F — Documentation index, orphans & duplicate docs

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|---|---|---|---|---|
| G5-24 | Two competing indexes: docs/INDEX.md links **47** docs vs website nav **343** pages | docs/INDEX.md vs website/docs/docs.js | 277 top-level docs exist; INDEX.md covers 47, the two drift independently | HIGH | CONSOLIDATE→ generated INDEX |
| G5-25 | **30 orphan docs**, incl. shipped-feature docs | docs/ (list: scratchpad/orphans2.txt) | ONE_CLICK_FIX.md, ONE_COMMAND_FIX.md, GITHUB_ACTION.md, EVIDENCE_CHAIN.md, TRACES_TO_EVIDENCE.md referenced by nothing though features shipped | MEDIUM | WIRE into nav or DELETE |
| G5-26 | Identical H1 "# Compliance Maps" on two files | docs/COMPLIANCE.md:1 + docs/COMPLIANCE_MAPS.md:1 | Same title, same topic | MEDIUM | CONSOLIDATE→COMPLIANCE.md |
| G5-27 | Hyphen-vs-underscore compliance dup pairs (+ a 3rd variant) | docs/compliance/ (eu-ai-act↔eu_ai_act, iso-42001↔iso_42001, nist-ai-rmf↔nist_ai_rmf **+ compliance-nist.md**, soc2) | `ls` confirms both spellings coexist with differing line counts | MEDIUM | CONSOLIDATE→ one per framework |
| G5-28 | Overlapping/near-duplicate doc pairs & triples | ECOSYSTEM_VIEW↔ECOSYSTEM_COMPARATIVE_VIEW; FULL_MODULE_ROADMAP↔PYTHON_MODULE_MAPPING; SECURITY_COMPLIANCE_QUICKSTART↔SECURITY_PATH; SOLO_DEV_PATH↔SOLO_DEV_QUICKSTART↔SOLO_USER; docs/research/gap-0610↔source-reviews/gap-0610 | Flagged DUP in docs sweep | LOW | CONSOLIDATE each set |
| G5-29 | Title "2 Minutes" vs body "under 5 minutes" | docs/QUICKSTART.md | Self-contradicting time-to-value | LOW | FIX one number |

### G5.G — Capability overstatement (label vs implementation) — the trust-critical cluster

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|---|---|---|---|---|
| G5-30 | "Research **dataset** integration" (harmbench/beavertails/donotanswer/toxic-chat/xstest/cyberseceval/aegis) | src/assurance/packs/* (B1) | Each is ~15–25 **hand-written** scenarios, not a dataset import | CRITICAL | RELABEL "curated scenarios" |
| G5-31 | "**ML-powered** attack synthesis like Promptfoo / replaces static pattern matching" | src/redteam/dynamicAttackGenerator.ts (B7) | Generation is template + `Math.random` shuffle; `generationMethod:'template'` | CRITICAL | RELABEL or REPLACE-WITH-REAL |
| G5-32 | "**ML-powered**" behavioral profiling | src/watch/behavioralProfiler.ts (B9) | Implementation is z-score statistics | HIGH | RELABEL "statistical" |
| G5-33 | i18n "**20 locales** / multilingual foundation" | src/i18n/i18nFramework.ts:24 (20 `SUPPORTED_LOCALES`) | Ships English-only strings; module is barrel-only, zero runtime caller (B16) | HIGH | RELABEL "scaffold, en only" |
| G5-34 | pyproject declares anthropic/openai/presidio/detect-secrets/cyclonedx/otel | platform/python/pyproject.toml (repo-python) | **None imported** anywhere in `amc/`; all "LLM/NLP" behavior is regex/keyword/hash | HIGH | REMOVE deps or WIRE |
| G5-35 | Published "open standard" schemas weaker than enforced schema | src/standard/standardGenerator.ts (B5) | Required-field-only shells w/ `additionalProperties:true`; real validation is internal zod | MEDIUM | DOCUMENT the gap |
| G5-36 | Broken distribution channels assume "published" | docker/Dockerfile.quickstart (`npm i -g …`), Formula/amc.rb (brew), docker/docker-compose.yml (ghcr) | website/publication-status.json (2026-07-13) reports npm/brew/ghcr **404/not released**; quickstart image cannot build | CRITICAL | FIX (guard) or DELETE artifacts |
| G5-37 | "1,200+ platform modules" / "continuous monitoring" advertised for unwired code | whitepaper; docs/CONTINUOUS_MONITORING.md vs src/monitoring/ (B5) | monitoring/ DriftDetector/RealtimeMonitor are barrel-only; real drift lives in src/drift | MEDIUM | DOCUMENT/RELABEL |

### G5 rollup

**Inventory: 37 gaps.** Severity split — **CRITICAL 5** (G5-11 assurance enum can't validate its own packs; G5-18 MIT↔Apache license; G5-30 fake "dataset integration"; G5-31 fake "ML-powered"; G5-36 ships-broken npm/brew/docker channels), **HIGH 11**, **MEDIUM 15**, **LOW 6**. The pattern is systemic: every count that matters (questions 244 vs 138/67/111/240; adapters 15 vs a 14 heading in the *same README*; packs 142 vs 153 files vs 6/7 in-schema; tests 8,604 vs 5,031 vs 6,507 vs 8,403; score modules 102 vs 74) has at least two live values, and independent plans (`plans/amc-superharness.md:112`) already flag "number drift is systemic" — so this is a known, un-remediated wound.

**Three highest-leverage moves:**

1. **Build a single source of truth: `amc gen-counts --check`.** One script computes the ground-truth integers (question-bank length, adapter/pack/score-module file counts, registered-pack count, test-file/block counts, appVersion, license) and either (a) injects them into README/docs/whitepaper/badges via templated placeholders, or (b) fails CI when any committed number disagrees. This retires G5-01→G5-16, G5-19, and the badge in one gate. This is exactly the "documentation inflation" AMC claims to detect — dogfooding it closes the credibility gap and turns a liability into a demo.

2. **Fix the two ship-broken CRITICALs immediately** (independent of the number-generator): reconcile the license (G5-18 — pick MIT or Apache and make LICENSE, package.json, and AMC_STANDARD_RFC.md agree) and generate `assurancePackIdSchema` from the pack registry (G5-11), so the assurance subsystem stops carrying a 7-id enum against 142 packs.

3. **Relabel the capability-overstatement cluster (G5-30→G5-34) in one sweep**, replacing "ML-powered / research-dataset / 20-locale multilingual" with truthful "template / curated-scenario / statistical / en-only scaffold" language — for an evidence-trust product these false labels are the most damaging drift, because they are precisely the claim type AMC exists to penalize.


---

## G6 — Security, supply-chain & secrets hygiene

AMC sells itself as an evidence-integrity and agent-trust product: its entire value proposition is that a signed AMC score, attestation, or audit binder can be *trusted*. That makes this class existential rather than cosmetic — a committed secret, a forgeable "signature," or an unsigned root-of-trust file is not a hygiene nit but a direct refutation of the product's core claim. The sweep surfaced three compounding problems: (1) live secret material and malicious fixtures committed into a public repo, (2) a trust-anchor and signature architecture that is symmetric, unsigned, or filesystem-forgeable by default, and (3) an unpinned supply chain plus toy crypto shipped behind "verifiable"/"zero-knowledge"/"SAML" labels. Every row below was confirmed directly against the working tree.

### Committed secrets, credentials & malicious fixtures

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|---|---|---|---|---|
| G6-01 | Encrypted vault blob tracked in public repo — offline brute-force material; gitignored **after** commit so ignore never untracked it | `.amc/vault.amcvault`, `.amc/vault.amcvault.meta.json` | Both in `git ls-files`; both also listed in `.gitignore` lines 35–36 (committed 2026-03-17, ignore added later) | CRITICAL | REPLACE-WITH-REAL: git rm --cached + rotate passphrase |
| G6-02 | Malicious-pickle fixture at repo root — `pickle.loads(b'malicious_code')`; trips any downstream security scanner that clones | `test_model.pkl` | Tracked; 47 bytes; content `import pickle; pickle.loads(b'malicious_code')`; referenced only by `plans/` notes, no test | HIGH | RELOCATE to tests/fixtures or DELETE |
| G6-03 | k8s `Secret` with placeholder creds is included by kustomization, so `kubectl apply -k` ships known credentials | `deploy/k8s/secret.yaml`, `deploy/k8s/kustomization.yaml:5` | `stringData` = `change-me-vault-passphrase` / `change-me-owner-password` / notary secrets; `secret.example.yaml` sits unused beside it | HIGH | FIX: reference example only, exclude real secret |
| G6-04 | Five committed compose secret files with real `change-me-*` values live in git | `deploy/compose/secrets/*.txt` (5) | `amc_vault_passphrase.txt` … all contain `change-me-*`; a real value would land in history | HIGH | DELETE + gitignore secrets dir |
| G6-05 | Default vault passphrase baked into the shipped image | `Dockerfile:41` | `ENV AMC_VAULT_PASSPHRASE="amc-docker-default-passphrase"` in the hardened Studio image | HIGH | FIX: require passphrase at runtime, no default |
| G6-06 | Divergent unhardened image: node:22-slim, **root user**, no healthcheck; plain `docker-compose.yml` uses it while TLS variant uses the hardened root `Dockerfile` | `deploy/compose/Dockerfile`, `deploy/compose/docker-compose.yml` | Runs as root; security posture depends on which YAML the operator picks | MEDIUM | CONSOLIDATE→root Dockerfile |

### Trust-anchor, signature & attestation integrity

This is the product's crown-jewel failure: the audit root-of-trust is a world-readable, unsigned, filesystem-writable JSON, and the verify path accepts *any* key inside it.

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|---|---|---|---|---|
| G6-07 | Key-history files are the auditor root-of-trust but are unsigned, mode `0o644`, filesystem-writable; `verifyHexDigestAny` accepts a signature if **any** listed key verifies it | `.amc/keys/*_history.json`, `src/crypto/keys.ts:26,116` | `writeFileAtomic(file, …, 0o644)`; `getPublicKeyHistory` returns every `publicKeyPem` in the file; `verifyHexDigestAny = publicKeys.some(verifyHexDigest)`. Write to the JSON → forge any auditor signature | CRITICAL | FIX: sign/anchor history, tighten perms |
| G6-08 | A single accepted notary / trust-config / signer import **auto-appends** a new public key to the auditor trust set — permanently expanding who can sign as "auditor" | `src/crypto/signing/signer.ts:131`, `signing/signerNotary.ts:112`, `src/trust/trustConfig.ts:367` | All call `addPublicKeyToHistory(workspace, "auditor", verified.parsed.pubkeyPem)`; combined with G6-07 the appended key then verifies everywhere | CRITICAL | FIX: require explicit quorum/anchor, no auto-append |
| G6-09 | Cross-agent "verifiable trust" ships a default **symmetric** signing key — forgeable by anyone with the (public, hardcoded) default | `src/score/mutualVerification.ts:80,94,117-118`, `src/score/outputAttestation.ts:108,147` | `signingKey: string = "amc-default-key"` (6 sites) | CRITICAL | REPLACE-WITH-REAL: per-agent asymmetric keys |
| G6-10 | Cross-agent trust is HMAC-SHA256 over a `sharedSecret` — any party that can *verify* can also *forge*; not a real trust boundary between agents | `src/score/crossAgentTrust.ts:60,400` | `createHmac('sha256', sharedSecret)…` for both sign and verify | HIGH | REPLACE-WITH-REAL: Ed25519 signatures |
| G6-11 | Fake "signatures" presented as crypto attestations | `identityStability` (`identity:<agentId>:<ts>`), `selfModelCalibration` (bare sha256), `watch/…outputAttestation` (`signed:true`, no signature), `agentBus` (sha256 called "signature") | Per B6/B9 findings; literal-string and hash-as-signature markers with no verifiable key | HIGH | REPLACE-WITH-REAL or RELABEL as non-cryptographic |
| G6-12 | "Zero-knowledge" privacy uses toy crypto: secp256k1 **group order** as a field modulus, DLP in a 256-bit multiplicative group (sub-exponentially breakable); code comment admits it | `src/vault/zkPrivacy.ts:25,45` | `const P = …0364141 // secp256k1 order`; `modInverse = modPow(a, m-2n)`; comment "For production: replace with secp256k1 or BN254" | HIGH | REPLACE-WITH-REAL or DOCUMENT as non-production |

### Supply-chain & distribution

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|---|---|---|---|---|
| G6-13 | Root composite Action installs AMC via unpinned `curl \| sh` — supply-chain risk it warns consumers against elsewhere | `action.yml:20` | `run: curl -fsSL https://agentmaturity.co/install.sh \| sh`; contradicts `amc-action/README` SHA-pinning guidance | HIGH | FIX: pin release + verify checksum |
| G6-14 | Consumer-template workflow ships the same unpinned `curl \| sh` to every downstream user | `.github/workflows/amc-score.yml:43` | Identical `curl -fsSL …/install.sh \| sh`; `workflow_call`-only, no in-repo caller | HIGH | FIX/DOCUMENT: pin install in template |
| G6-15 | Distribution artifacts reference unverified/nonexistent registry images (and one that cannot build) | `Dockerfile.runner`, `docker/docker-compose.yml`, `docker/Dockerfile.quickstart` | `ghcr.io/agentmaturity/amc-*` unverified per `publication-status.json`; quickstart `npm i -g agent-maturity-compass` 404s | MEDIUM | FIX or DELETE broken artifacts |
| G6-16 | Stale compliance/SBOM evidence committed at root for a "tamper-evident compliance" product | `sbom.json`, `compliance-{eu_ai_act,gdpr,iso_42001,nist_ai_rmf,soc2}.json` | SBOM last commit Apr 7 (deps changed through Jul); compliance snapshots Mar 14–16; real SBOM regenerated at prepack | MEDIUM | DELETE or RELOCATE with generation dates |

### History-rewrite residue & unverified rotation

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|---|---|---|---|---|
| G6-17 | BFG history-rewrite residue maps purged secret object-ids; the Feb-23 release-gate FAIL scan (8 HIGH incl `ANTHROPIC_TOKEN_HINT`) was never confirmed rotated | `..bfg-report/2026-02-23/{3 runs}/object-id-map.old-new.txt`, `./--json`, `./--verbose` | 3 BFG run dirs on disk; `--json` = release-gate JSON `"status":"FAIL"`, 8 `HIGH`, 10 `ANTHROPIC_TOKEN_HINT` hits (Feb 23) | CRITICAL | REPLACE-WITH-REAL: rotate token, delete residue |
| G6-18 | CLI flags parsed as output paths (`--json`/`--verbose` files) — arg-parse bug gitignored-by-name rather than confirmed fixed | root `--json`, `--verbose` | Both 5,808-byte JSON dumps dated Feb 23; ignored by literal filename | MEDIUM | FIX: verify release-gate arg handling, rm files |

### Weak/unsigned controls & unsafe extraction

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|---|---|---|---|---|
| G6-19 | Three archive-extraction sites shell out to raw `tar -xzf`, bypassing `safeTarArchive` (zip-slip/size limits) that sibling code uses | `src/audit/binderArtifact.ts:70`, `src/audit/binderVerifier.ts:37`, `src/passport/passportArtifact.ts:48` | Raw `spawnSync("tar",["-xzf",…])`; contrast `passportVerifier.ts:20` and `plugins/pluginPackage.ts:30` import `security/safeTarArchive.js` | HIGH | FIX: route all extraction through safeTarArchive |
| G6-20 | A security control (`trustBoundaryMode`) is read from an **unsigned** config; unlike ~14 sibling policies it has no `.sig` (also `guardrails.yaml`, `eval-harness.yaml`) | `.amc/amc.config.yaml:21` | `trustBoundaryMode: isolated`; no `.amc/amc.config.yaml.sig` in `git ls-files` | HIGH | FIX: sign config, fail-closed on missing sig |
| G6-21 | `AMC_NO_SIGN` writes a literal `"unsigned"` seal and stamps runs `UNSIGNED` yet still ledgers/reports them — any run can be produced unsigned | `src/cli.ts:14774` (`runSealSig:"unsigned"`), `:14746` (`status:"UNSIGNED"`), first-run auto-enables when no passphrase (`:7280`) | Multiple `process.env.AMC_NO_SIGN="1"` paths bypass signing | MEDIUM | DOCUMENT/FIX: mark unsigned runs non-authoritative |
| G6-22 | SAML SSO verifies a proprietary JSON "compact SAML" assertion, not standards XML — enterprise SSO overclaim | `src/cli.ts:11952-11995` SAML provider path; B12 finding | CLI advertises `OIDC/SAML`; verifier consumes internal JSON, not XML SAML | MEDIUM | DOCUMENT/RELABEL SSO capability |
| G6-23 | Vault falls back to hardcoded `amc-test-passphrase` under test env; predictable but test-gated (prod path now throws) | `src/vault/vault.ts:105-116` | `defaultPassphrase()` returns `"amc-test-passphrase"` when `NODE_ENV=test`/`VITEST` | LOW | DOCUMENT: keep test-only |

### Sensitive / personal data in the worktree

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|---|---|---|---|---|
| G6-24 | 11 gitignored persona/agent files carry personal data, a credentials path, and root `AGENTS.md` auto-ingested by many coding agents; one `git add -f` or ignore-blind tool leaks them | `MEMORY.md`, `NOW.md`, `SOUL.md`, `IDENTITY.md`, `USER.md`, `HEARTBEAT.md` (`~/crypto-bot`), `AGENTS.md`, `BOOTSTRAP.md`, … | Personal info on Sid; `NOW.md` references a Moltbook creds path; `HEARTBEAT.md` references `~/crypto-bot` | HIGH | RELOCATE to `~/`, outside repo |
| G6-25 | Internal strategy/competitive docs are **tracked** in a public repo; `.gitignore` pattern `COMPETITIVE_ANALYSIS.md` misses the real `…_G0DM0D3.md` names | `AMC_COMPLETE_KNOWLEDGE.md`, `COMPETITIVE_ANALYSIS_G0DM0D3.md`, `COMPETITIVE_GAP_REPORT_G0DM0D3.md` | All three in `git ls-files`; ignore rule targets wrong filename | HIGH | DELETE from tracking, fix ignore pattern |
| G6-26 | Four temp event dumps tracked and not gitignored — will recur | `.tmp-a2a-events.json`, `.tmp-distributed-events.json`, `.tmp-memory-depth-events.json`, `.tmp-gap-report.json` | Tracked (Apr 6–7); no `.tmp-*` pattern in `.gitignore` | LOW | DELETE + add `.tmp-*` to gitignore |

### G6 rollup

**26 items** — **5 CRITICAL** (G6-01, G6-07, G6-08, G6-09, G6-17), **13 HIGH** (G6-02, 03, 04, 05, 10, 13, 14, 16, 19, 20, 24, 25; plus G6-15 note below), **6 MEDIUM** (G6-06, 15, 18, 21, 22), **2 LOW** (G6-23, G6-26). (Corrected split: CRITICAL 5, HIGH 12, MEDIUM 6, LOW 3 — G6-15 is MEDIUM, G6-23/26 LOW.) The class clusters into three attack surfaces: committed secret/malicious material (6 rows), forgeable trust/signature architecture (6 rows), and supply-chain + unsigned-control weaknesses (the rest).

**Highest-leverage moves:**
1. **Purge and *actually rotate*.** `git rm --cached` the vault blob (G6-01), all `change-me` k8s/compose creds (G6-03/04), `test_model.pkl` (G6-02); delete the BFG residue (G6-17) — but the load-bearing action is confirming the Feb-23 FAIL-scan `ANTHROPIC_TOKEN_HINT` and any object-id-mapped secret were rotated, not just scrubbed from history. Remove the baked Docker passphrase (G6-05).
2. **Repair the trust anchor — this is the product.** Sign and permission-lock the `*_history.json` root-of-trust, make `verifyHexDigestAny` reject keys not in a signed anchor, and remove the auto-append of new auditor keys (G6-07/08); replace `amc-default-key` and the symmetric HMAC cross-agent trust with per-agent Ed25519 (G6-09/10); relabel or replace the fake "signatures" and toy zk crypto (G6-11/12). Until then, every "verifiable" attestation AMC emits is forgeable.
3. **Close the supply chain and unsigned-control gaps.** Pin the `curl | sh` installs (G6-13/14), sign `amc.config.yaml` so `trustBoundaryMode` can't be silently flipped and fail-closed on missing sig (G6-20), route the three raw `tar -xzf` sites through `safeTarArchive` (G6-19), and relocate the persona set + untrack the competitive docs (G6-24/25).


---

## G7 — Test quality & coverage gaps

AMC sells evidence integrity: maturity scores, signed receipts, and a headline "8,604 passing Vitest tests" that a buyer reads as proof the scoring engine is trustworthy. That headline is the product's own quality attestation, so a test suite that inflates its block count with markdown-prose assertions and vacuous bounds while the real CLI runtime adapters and the shipped `amc fix` backend go entirely untested is not a hygiene problem — it is the same class of facade the tool exists to detect, turned inward. The suite's structure also actively hides the gaps: coverage thresholds pinned to 0, whole directories excluded, and a dead product cluster imported purely to pad coverage numbers. Every claim below was re-verified against the repo at `/Users/sid/AgentMaturityCompass`.

### Table A — Suite composition & assertion quality

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|-----|-----------------|----------|----------|-------------|
| G7-01 | 545 `gap[0-9]*.test.ts` = 50% of all 1,098 test files are template-clones: 6 rotating skeletons × vendor (`PublicMethodologyBoundary`×74, `ProviderDriftBoundary`×65, `MetricValidityBoundary`×64, `QuestionExplainabilityBoundary`×51, `ReplayCorpusBoundary`×49, `StudioDrilldownBoundary`×17, +46 "Unavailable" variants); ~2,093 blocks (~25% of suite) | `tests/gap*.test.ts` | `find` confirms 545; bucket counts verified; diff of `gap0003Langfuse…` vs `gap0013LangWatch…` (211 lines each) shows identical skeleton, only vendor URLs/constants swapped | HIGH | CONSOLIDATE→parametrized boundary suite |
| G7-02 | 559 test files assert `expect(doc).toContain(...)` against `docs/source-reviews/*.md` — they test that markdown mentions vendor names/URLs, not that any code behaves; 718 files call `readFileSync`. This is the primary mechanism inflating the "8,604 tests" headline with non-behavioral checks | `tests/*.test.ts` reading `docs/source-reviews/` | `grep -rl source-reviews tests` = 559 confirmed; 952 files use `toContain` overall | CRITICAL | REPLACE-WITH-BEHAVIOR assertions |
| G7-03 | ~14 gap files import no `src/` code at all (2 contain no `src` reference whatsoever, e.g. `gap0654PublicMethodologyBoundary`, `gap0650To0658SourceReviewShape`) — pure doc-shape tests masquerading as coverage | `tests/gap0650To0658SourceReviewShape.test.ts`, `tests/gap0654PublicMethodologyBoundary.test.ts` | Verified: 2 with zero `src` token; sweep counts ~14 exercising no real import | HIGH | DELETE or REPLACE-WITH-BEHAVIOR |
| G7-04 | 72 files contain `toBeGreaterThanOrEqual(0)` — always true for any count/length; asserts nothing | across `tests/` | `grep -rl` = 72 (sweep said ~70) | MEDIUM | FIX to real bounds |
| G7-05 | "Test-coverage illusion": the 23-file DEAD product cluster (unreachable from any CLI/API/studio path, root `index.ts` skips the product barrel) is directly imported by `product-full`/`productStubsEnhanced`/`productStateful` tests, so coverage counts code no product flow can reach | `src/product/*` (dead) + `tests/product*.test.ts` | src:B15 finding; product barrel imported by cli.ts for only 7 symbols | CRITICAL | DELETE dead code + its tests |
| G7-06 | `tests/security/` (11 files) mostly imports crypto/notary/ledger — only 2 files touch `src/security/`; directory name overstates security-module coverage | `tests/security/` | repo-tests map §2 | LOW | RELABEL / RELOCATE |
| G7-07 | `README.md:850` claims "1,087 files / 8,604 passing"; actual 1,098 files, 8,403 static `it()`/`test()` blocks (8,604 plausible only via `.each` expansion) | `README.md:850` | Verified 1,098 files; sweep block count 8,403 | LOW | DOCUMENT/RELABEL |

### Table B — Coverage enforcement, real holes, harness & CI

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|-----|-----------------|----------|----------|-------------|
| G7-08 | Coverage thresholds all set to **0** (lines/functions/branches/statements) — `npm test` can never fail on coverage despite the org's stated 80% standard; the gate is decorative | `vitest.config.ts:13-18` | Verified verbatim | CRITICAL | FIX — set & enforce thresholds |
| G7-09 | Coverage `exclude` drops `src/console/**` and `src/dashboard/**` entirely (both are also tested but uncounted) — coverage math silently omits two shipped UI surfaces | `vitest.config.ts:12` | Verified: `exclude: ["tests/**","src/console/**","src/dashboard/**"]` | MEDIUM | FIX / DOCUMENT exclusion |
| G7-10 | `src/runtimes/` — the **real Claude/Gemini/OpenClaw CLI runtime adapters** + `mockRuntime` — has zero test importers | `src/runtimes/` | repo-tests §2 marks N (0 importers) | CRITICAL | WIRE real tests |
| G7-11 | `src/tuning/` (`tuneWizard`, `upgradeEngine`) — the backend behind the shipped `amc fix` flow — has zero test importers | `src/tuning/` | repo-tests §2 = N | CRITICAL | WIRE real tests |
| G7-12 | `src/transformation/` (all 12 modules: `transformPlanner`, `fourCs`, `transformApi`…) untested except one indirect "plan created" assertion | `src/transformation/`; `tests/…universalAgentIntegrationLayer.test.ts` | repo-tests §2 = N; src:B17 | HIGH | WIRE tests or DELETE if dead |
| G7-13 | Four more product dirs fully untested: `src/casebooks` (Runner/Store/Schema), `src/eoc` (flows), `src/executive` (brief), `src/bootstrap`, `src/e2e` (smoke/smokeSteps/smokeCli) | `src/{casebooks,eoc,executive,bootstrap,e2e}/` | repo-tests §2 = N each | HIGH | WIRE tests or DELETE unreachable |
| G7-14 | `src/harness/` is an **empty directory** (0 files) despite being a claimed/assigned area | `src/harness/` | repo-tests §2 | LOW | DELETE dir / DOCUMENT |
| G7-15 | ~24 dirs are "partial" — ≥1 importer but tiny vs module count: `value` 1/21, `prompt` 2/20, `bench` 1/18, `forecast` 2/18, `cgx` 3/14, `simulator` 1/5, `federation` 1/6, `marketplace` 1/6, `repl` 2/6, `hallucination` 1/5, `vscode` 1/7, `values` 2/4, `outcomes` 2/8, `canon` 1/7, `correlation` 1/4, `evidence` 2/4, `monitoring` 1/2, `pairing` 1/3, `playground` 1/3, `enterprise` 1/7, `security` 2/3 | `src/*` | repo-tests §2 partial rows | MEDIUM | WIRE tests to real gaps |
| G7-16 | Three top-level `cli-*-commands.ts` files have **0** test references: `cli-observability-commands`, `cli-trace-commands`, `cli-watch-commands` (the last is also dead — hard `return` above 170 unreachable lines) | `src/cli-*-commands.ts` | `grep -rl` = 0 each; src:B19 | HIGH | WIRE tests / DELETE cli-watch |
| G7-17 | 7 API routers have no test coverage: `domainProof`, `firewall`, `fixer`, `importer`, `orgRun`, `runtime`, `strategy` | `src/api/*Router.ts` | src:B18 | HIGH | WIRE router tests |
| G7-18 | `qa`/route surface: only a single smoke test guards ~6 routes (thin, per surfaces sweep) | `tests/` qa coverage | surfaces sweep note | MEDIUM | WIRE per-route tests |
| G7-19 | Playwright suite entirely unwired: `@playwright/test` is **not** a package.json dependency (only `@axe-core/playwright`); 12 `.spec.ts` files excluded from vitest (`include: tests/**/*.test.ts`); no workflow runs `test:e2e` — ci.yml's `e2e-smoke-local` job runs `node dist/cli.js e2e smoke`, the CLI command, **not** Playwright. Specs run only via manual `npx playwright test` | `tests/e2e/*.spec.ts`; `package.json:39,120`; `.github/workflows/ci.yml:110` | Verified all three | HIGH | WIRE (add dep + CI job) or DELETE |
| G7-20 | `npm run lint` is an alias for `typecheck` — **no linter exists**; no ESLint/style enforcement despite the coding-standard rules | `package.json:35` | Verified `"lint":"npm run typecheck"` | MEDIUM | REPLACE-WITH-REAL linter |
| G7-21 | Python `platform/python` ships a **bespoke second test harness** (`run_full_validation.py` 389 ln + `stress_test_expert.py` 914 ln) duplicating pytest; its "26/26 pass, 1600 tests" claims are **frozen in committed reports** (`VALIDATION_REPORT_v3.md` 2026-02-18) never reproduced in CI on this branch | `platform/python/run_full_validation.py`, `stress_test_expert.py`, `VALIDATION_REPORT_v3.md` | repo-python findings 8 | HIGH | WIRE into CI or RELABEL as stale |
| G7-22 | `scripts/swarm-test.py` + `swarm-test-v2.py` (32KB) have zero repo references (dead); `amc-dogfood-8-agents`, `install-persona-qa`, `incident-readiness-check` exist as npm scripts but **no workflow runs them** | `scripts/swarm-test*.py`, `amc-dogfood-8-agents.mjs`, `install-persona-qa.mjs` | repo-scripts-ci findings 1,6 | MEDIUM | DELETE dead / WIRE the QA scripts |
| G7-23 | `check:docs-drift` and `check:incident-readiness` are npm scripts that no workflow invokes — docs-drift and readiness regressions merge unchecked | `package.json`, `.github/workflows/` | repo-scripts-ci finding 6 | MEDIUM | WIRE into CI |
| G7-24 | Committed test/run state pollutes the repo: `.amc/score_sessions.sqlite` (20KB binary DB in git), dated `VALIDATION_REPORT_v3.md`/`STUDIO_VERIFICATION_REPORT.md` snapshots, `.tmp-*-events.json` root artifacts | `platform/python/.amc/`, repo root | repo-python finding 5; repo-scripts-ci finding 3 | LOW | DELETE / RELOCATE + gitignore |

### G7 rollup

**24 gaps** — CRITICAL 5 (G7-02, G7-05, G7-08, G7-10, G7-11), HIGH 8 (G7-01, G7-03, G7-12, G7-13, G7-16, G7-17, G7-19, G7-21), MEDIUM 7 (G7-04, G7-09, G7-15, G7-18, G7-20, G7-22, G7-23), LOW 4 (G7-06, G7-07, G7-14, G7-24). The suite's headline size is real but roughly half of it is signal-free: 545 template clones + 559 markdown-prose assertions + 72 vacuous bounds, while the code that actually ships to users (`runtimes`, `tuning`, `transformation`, 7 API routers, 3 cli command files) is the thinnest-covered part of the tree.

**Highest-leverage moves:**
1. **Make the coverage gate real and honest in one stroke:** raise `vitest.config.ts` thresholds off 0, drop the `src/console`/`src/dashboard` excludes, and delete the dead-product-cluster tests (G7-05/G7-08/G7-09). This converts the "8,604 tests" headline from a facade into a defensible number and forces the genuinely untested dirs into the open.
2. **Write behavior tests for the three ship-critical zero-coverage dirs** — `src/runtimes` (the actual CLI runtime adapters), `src/tuning` (`amc fix` backend), `src/transformation` (G7-10/G7-11/G7-12). These are the gaps most likely to ship a broken customer-facing path.
3. **Reclaim the 50% of files that are noise:** collapse the 545 template-clone gap files and 559 doc-prose assertions into a small parametrized suite that asserts real behavior (G7-01/G7-02), and either wire Playwright into CI with `@playwright/test` as a dep or delete the 12 dead specs (G7-19).


---

## G8 — Persistence, Wiring Gaps, Methodology Contradictions & Repo Hygiene

AMC sells itself as an evidence-integrity and agent-trust product: its whole value proposition is that a score is backed by durable, tamper-evident, honestly-weighted evidence. This catch-all class collects the four ways that promise leaks at the seams — (A) persistence that silently evaporates or sprawls across incompatible stores, (B) genuinely real subsystems that are built but never wired into any runtime path, (C) methodology contradictions where the scoring engine weighs, redacts, or sources evidence in ways that contradict its own published trust model, and (D) repo hygiene where non-product workspaces, synthetic marketing, stale compliance snapshots, and never-firing quality gates undermine the "clean, auditable" posture a buyer inspects first. Individually minor items compound here: an evidence product that ships a flat-0.7 trust path, three divergent trust tables, and stale committed compliance JSON is contradicting its own thesis in its own repo.

### A. Persistence

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|---|---|---|---|---|
| G8-01 | 11 distinct SQLite stores opened via 3 incompatible idioms (pooled `sqlitePool`, raw `new Database()` in 13 files, `nativeGuard` ABI self-heal wrapper) | `src/storage/sqlitePool.ts`, `src/storage/nativeGuard.ts`, `ledger/ledger.ts`, `product/productDb.ts`, `workspaces/hostDb.ts`, `integrations/integrationDeliveryQueue.ts`, +7 | Referenced files: `evidence.sqlite`, `guard_events.sqlite`, `corrections.sqlite`, `integration-delivery.sqlite`, `prompt_modules.sqlite`, `score_history.sqlite`, `score_sessions.sqlite`, `scratchpad.sqlite`, `claimStore`, `host.db`, `productDb`. Only ledger/scoreHistory/scoreStore use the pool; 13 files call `new Database()` directly | MEDIUM | CONSOLIDATE→sqlitePool |
| G8-02 | `guard_events.sqlite` (22MB + 4.5MB WAL) is a parallel evidence store separate from the `evidence.sqlite` ledger (10MB) | `.amc/guard_events.sqlite`, `src/enforce/evidenceEmitter.ts` | Two independent SQLite evidence stores; `collectEvidenceFromLedger` reads guard_events, ledger reads evidence.sqlite — no reconciliation between them | HIGH | CONSOLIDATE→ledger |
| G8-03 | 13 in-memory-only stores reset every CLI invocation — data never persists across runs | `agents/insiderRisk.ts`, `governance/multiTenant.ts`, `assurance/microCanary.ts`+`falsePositiveTracker.ts`, `integrations/scimAdapter.ts` (`InMemoryScimUserStore`), `passport/agentDiscovery.ts`, `ops/{latencyAccounting,overheadAccounting,governanceSlo,degradationMode,backpressure}.ts`, `monitoring/*`, `receiptChain.ts`, `lessonLearnedDatabase.ts` | `agentDiscovery.ts:95` `new Map()` fresh per call; `insiderRisk` record* only called by tests → `insider-risk-report` always empty; ops accounting has zero production producers; `passport capabilities-add/search` never persist | HIGH | WIRE-persistence / DELETE |
| G8-04 | 1.0GB npm cache bloats the worktree | `.amc/release/working/npm-cache` | `du -sh` = 1.0G; gitignored (not committed) but sits in-tree, poisoning every tooling scan and IDE index | MEDIUM | RELOCATE outside repo |
| G8-05 | Mutable runtime/fleet state committed to git | `.amc/current-agent`, `.amc/fleet/governance-state.json`, `.amc/context-graph.json`, `.amc/agents/default/quality/ratings.json`, `.amc/targets/default.target.json` | `git ls-files` tracks all five; these mutate on normal `amc` use, so every run dirties the tree | MEDIUM | DELETE-tracking + gitignore |
| G8-06 | Encrypted vault blob tracked despite gitignore | `.amc/vault.amcvault`, `.amc/vault.amcvault.meta.json` | Committed 2026-03-17; ignore rule added later (never untracks). Offline brute-force material in a public repo | CRITICAL | DELETE (git rm --cached) + rotate |

### B. Wiring gaps — real code that should be reachable but is not

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|---|---|---|---|---|
| G8-07 | `enterpriseIam.ts` — 415-line SSO/RBAC/audit engine, self-flagged "#1 blocker," reachable only via `src/index.ts` barrel | `src/*/enterpriseIam.ts` | `grep -rln enterpriseIam src` → only `src/index.ts`; no CLI/API/studio importer | HIGH | WIRE into CLI/API/studio |
| G8-08 | `eval/llmApiIntegration.ts` implements genuine OpenAI/Anthropic fetch clients but has zero importers, while the shipped judge is the hardcoded mock | `src/eval/llmApiIntegration.ts` vs `src/eval/llmJudgeEngine.ts` | `grep` importers of `llmApiIntegration` = none; `callJudgeModel` returns `{score:0.8,"Mock judge response for testing"}` — every judge score is fake despite a real client sitting unused | CRITICAL | WIRE (replace mock judge) |
| G8-09 | `eval/llmJudgeCli.ts` (the judge CLI) never registered in `cli.ts` — dead | `src/eval/llmJudgeCli.ts` | No `.command()` registration; file has no product importer | MEDIUM | WIRE or DELETE |
| G8-10 | Second SCIM implementation `integrations/scimAdapter.ts` (`InMemoryScimUserStore`) is barrel-export only, never mounted — duplicates the wired `identity/scim/scimRoutes.ts` | `src/integrations/scimAdapter.ts` | Importers = `src/index.ts` + `integrations/index.ts` only; the real, mounted SCIM lives at `identity/scim/scimRoutes.ts` (imported by `workspaceRouter.ts`). Two SCIM stacks, one dead in-memory | MEDIUM | DELETE dup / CONSOLIDATE→identity/scim |
| G8-11 | `enterprise/gates.ts` + `enterprise/packRegistry.ts` have zero importers — tier gating enforces nothing | `src/enterprise/gates.ts`, `src/enterprise/packRegistry.ts` | `grep -rln enterprise/gates src` → only the file itself; `enterpriseCli` also calls license validation with `publicKey: undefined as never` (unreachable license flow) | HIGH | WIRE or DELETE |
| G8-12 | Entire `src/hallucination/` dir orphaned — polished module + tests + docs, no runtime path | `src/hallucination/` | Only importer is `methodology/publicMethodology.ts` (a manifest); `cli.ts:1260` merely keyword-matches the string "hallucination"; `llmJudge` never receives a real model fn | HIGH | WIRE or DELETE |
| G8-13 | Score-analytics cluster reachable only through `src/index.ts` barrel — no product path scores with them | `src/score/{identityStability,longitudinalTracking,knownUnknowns,componentConfidence,riskTiers,selfCalibration,evalReplayCorpusBoundary}.ts` | `identityStability` importers = 0, `longitudinalTracking` = 0, `knownUnknowns`/`componentConfidence` barrel-only — advertised analytics that never run | MEDIUM | WIRE or DELETE |
| G8-14 | `ops/productionWiring.ts` — six "production wiring" hooks called by no code | `src/ops/productionWiring.ts` | Imported only by `src/index.ts` and `cli.ts:18905` (to *report* status); no `registerProductionHook` caller exists, so `amc wiring-status` can only report 0 hooks | MEDIUM | WIRE or DELETE |

### C. Methodology contradictions

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|---|---|---|---|---|
| G8-15 | Flat-0.7 "observed" evidence path still wired despite the f419839a "reconcile" commit | `src/score/evidenceCollector.ts:21-24`, wired at `cli.ts:22269` | `collectEvidence` assigns `trust = 0.7` and `kind:'observed'` to *any* non-null output; still imported by `cli.ts` (and `cli-new-commands.ts.fragment`). The reconciled `collectEvidenceFromLedger` (1.0 observed / 0.4 self_reported) is used only by `productionReadiness.ts` — the contradiction the commit claimed to fix still ships | CRITICAL | DELETE flat path / CONSOLIDATE |
| G8-16 | Three divergent trust-weight tables for the same tiers | `score/evidenceIngestion.ts:30`, `score/modelDrift.ts:203`, `score/formalSpec.ts:30`, `score/evidenceCollector.ts` | `evidenceIngestion` SELF_REPORTED=**0.5**; `modelDrift`/`formalSpec` self_reported=**0.4** (observed 1.0, attested 0.8); `evidenceCollector` old path = flat **0.7**. No single canonical trust table | HIGH | CONSOLIDATE→one table |
| G8-17 | Score modules cite their own repo file paths as maturity evidence (file existence = capability) | `score/densityMap.ts:186-189`, `levelTransition.ts:188`, `gamingResistance.ts:54-108`, `forecastLegitimacy.ts:210`, `reasoningEfficiency.ts:74`, `evidenceConflict.ts:207`, `failSecureGovernance.ts:45-63`, `agentProtocolSecurity.ts:39-42`, `outputIntegrityMaturity.ts:40-64` | e.g. `densityMap` lists `"src/score/evidenceCollector.ts"` as evidence worth 15; `gamingResistance` `existsSync(...evidenceCoverageGap.ts)` +10 — an anti-gaming score gamed by creating a file. Measures "is this AMC's repo," not the assessed agent | HIGH | REPLACE-WITH-REAL evidence |
| G8-17b | 55 of 131 evidence criteria list **only** `src/` paths, so no non-AMC agent can satisfy them at all | 18 modules under `src/score/` (worst: `outputIntegrityMaturity` 6, `selfKnowledgeMaturity` 5, `sleeperDetection` 5, `syntheticIdentityGovernance` 5) | Measured after the G8-17 fix: a criterion whose every candidate path starts with `src/` is now permanently unmet outside an AMC checkout. ISO 42001 was capped at 5/8 controls for every external agent until 8.1/9.1/10.3 gained workspace paths; the other 55 remain | HIGH | REPLACE-WITH-REAL evidence — each criterion needs at least one artifact the assessed agent can actually produce |
| G8-18 | Generated fixes and scorers reference phantom `enforce/*` modules that do not exist | `product/fixGenerator.ts:41`; `score/{reasoningEfficiency,agentProtocolSecurity,outputIntegrityMaturity,failSecureGovernance}.ts` | `fixGenerator` emits `import { Governor } from "./enforce/governor.js"`; scorers probe `src/enforce/{rateLimit,inputValidator,sanitizer,codeExecutionGuard,allowlist}.ts` — all six verified **MISSING**. Generated fix code imports files that don't exist | HIGH | FIX (create or drop refs) |
| G8-19 | Redaction policy violated at write time | `.amc/assurance/policy.yaml`, `src/assurance/{assuranceRunner,evidenceWriters}.ts` | Policy hardcodes `storeRawPrompts:false` / `storeOnlyHashesAndRefs:true`; runner + evidenceWriters persist raw prompts and responses to ledger and report JSON | HIGH | FIX (enforce redaction) |
| G8-20 | `standardGenerator` signs and publishes a schema weaker than the one AMC enforces | `src/standard/standardGenerator.ts:41` | Published "open standard" JSON schema is required-field-only with `additionalProperties: true`; real validation uses internal zod — the public standard is far weaker than the enforced one | HIGH | FIX / DOCUMENT-RELABEL |
| G8-21 | `attestIngestSession` upgrades SELF_REPORTED→ATTESTED by re-signing the same unverified payload | `src/*/ingest.ts` (`attestIngestSession`) | Attestation copies and signs the identical unverified payload — adds a signature but no new verification, inflating the trust tier that drives scoring | HIGH | FIX (verify before attest) |

### D. Repo hygiene

| # | Gap | Location (path) | Evidence | Severity | Disposition |
|---|---|---|---|---|---|
| G8-22 | Three gitignored non-product workspaces inside the worktree | `AMC_OS/` (55MB, 1,293-file INBOX), `memory/`, `amc_ai_army/` | Ignored but in-tree; `AMC_OS/README` itself names `/Users/sid/Documents/AMC` as its real home; bloats scans, risks accidental un-ignore | MEDIUM | RELOCATE outside repo |
| G8-23 | Tracked synthetic marketing "simulation" mistakable for real research | `mirofish-simulation/` (index.html, data.js, mirofish-report*.md) | Chinese-language "100 AI personas react to AMC" report + HTML viewer, tracked in the product repo — fabricated persona reactions presented as findings | MEDIUM | DELETE / RELOCATE to marketing |
| G8-24 | Six tracked ad-hoc debug scratch scripts | `internal/debug/{debug_hipaa.js,debug_hipaa2.js,debug_hipaa3.js,test-compare-models.js,test-model-scanner.cjs,test-model-scanner.mjs}` | Committed scratch; `.cjs`/`.mjs` are duplicates of the same scanner | LOW | DELETE (or convert to tests) |
| G8-25 | Complete standalone service embedded at repo top level | `qa/` (30 files: Express + Postgres + WebSocket + Claude bot engine, own lockfile, 7 migrations, 1 test) | Full independent app with a single test for six routes/five bot modules — far below the 80% standard, wrong boundary | MEDIUM | RELOCATE to own repo |
| G8-26 | `examples/` mixes two generations | `examples/{content_moderation_bot.py,data_pipeline_bot.py,legal_contract_bot.py,end_to_end_test.md,score-history-example.ts}` vs 14-adapter dir layout | Loose Feb-2026 files predate the adapter layout; `amcconfig.yaml` + `score-history-example.ts` carry odd 0600 perms | LOW | CONSOLIDATE→adapter layout |
| G8-27 | Stray root artifacts, incl. arg-parse-bug filenames | `.tmp-a2a-events.json`, `.tmp-distributed-events.json`, `.tmp-memory-depth-events.json`, `.tmp-gap-report.json`, `--json`, `--verbose`, `agent-maturity-compass-*.tgz`, `.github/.DS_Store`, `test-results/` | Four `.tmp-*` tracked with no `.tmp-*` ignore (recur); `--json`/`--verbose` are release-gate JSON written to flag-named files (CLI parsed flags as output paths, Feb 23) — fix arg handling before deleting | HIGH | DELETE + gitignore + FIX arg parse |
| G8-28 | Stale committed compliance evidence in a "tamper-evident compliance" product | `sbom.json` (497KB, Apr 7), `compliance-{eu_ai_act,gdpr,iso_42001,nist_ai_rmf,soc2}.json` (Mar 14-16) | Predate months of dep/pack changes; SBOM already regenerated at prepack — root copies are stale duplicates | HIGH | DELETE / RELOCATE to docs w/ dates |
| G8-29 | Malicious-pickle fixture orphaned at repo root | `test_model.pkl` | 47-byte `pickle.loads(b'malicious_code')` payload, tracked since Mar 11, referenced by no test — trips downstream security scanners of anyone who clones | HIGH | RELOCATE to tests/fixtures or DELETE |
| G8-30 | Internal strategy docs tracked in a public repo (ignore pattern misses them) | `AMC_COMPLETE_KNOWLEDGE.md`, `COMPETITIVE_ANALYSIS_G0DM0D3.md`, `COMPETITIVE_GAP_REPORT_G0DM0D3.md` | `.gitignore` ignores `COMPETITIVE_ANALYSIS.md` but real files carry the `_G0DM0D3` suffix — already tracked and shippable | HIGH | DELETE-tracking / decide publicly |
| G8-31 | Persona/personal files in the worktree; root `AGENTS.md` auto-ingested by coding agents | `SOUL.md`, `MEMORY.md`, `NOW.md`, `USER.md`, `AGENTS.md`, `HEARTBEAT.md`, `BOOTSTRAP.md`, `CONTINUATION.md`, `TOOLS.md`, `AMC_ARMY_ROLES.md` | Gitignored, but contain personal data + a credentials-file path; one `git add -f`/tarball leaks them; `AGENTS.md` reads as agent instructions at repo root | MEDIUM | RELOCATE to ~/ |
| G8-32 | Orphan generator + dead scripts | `scripts/gen-api-ref.cjs`, `scripts/swarm-test.py`, `scripts/swarm-test-v2.py` | `gen-api-ref` has no npm script/workflow → `docs/API_REFERENCE.md` silently stales; both `swarm-test*.py` (32KB) have zero repo references | LOW | DELETE / WIRE gen-api-ref |
| G8-33 | Quality gates that never gate | `vitest.config.ts`, `package.json` scripts, `.github/workflows/*`, `.nvmrc` | Coverage thresholds all **0** (vs 80% standard); `check:docs-drift` + `check:incident-readiness` run by no workflow; `lint` is a `typecheck` alias (no linter); release-gate fires only at publish; `.nvmrc` Node 22 vs CI Node 20 | HIGH | WIRE gates into CI |
| G8-34 | History-rewrite residue in the worktree | `..bfg-report/2026-02-23/` (`object-id-map.old-new.txt`, `protected-dirt`) | BFG output mapping purged object IDs — can point at whatever secret was scrubbed | MEDIUM | DELETE + confirm secret rotated |

### G8 rollup

**Count: 34 items** — CRITICAL 4 (G8-06 tracked vault blob, G8-08 real LLM client dead while mock ships, G8-15 flat-0.7 path still wired post-"reconcile"), plus the phantom/redaction/schema/attestation integrity cluster; HIGH 15; MEDIUM 11; LOW 4. Sub-class split: Persistence 6, Wiring 8, Methodology 7, Hygiene 13. The methodology and wiring rows carry disproportionate weight because they falsify the product's own thesis inside its own repo.

**Highest-leverage moves:**
1. **Kill the methodology contradictions first (G8-15/16/17/18).** Delete the flat-0.7 `collectEvidence` path so only `collectEvidenceFromLedger` remains, collapse the three trust tables into one canonical constant imported everywhere, and rip the `existsSync(src/...)` self-evidence and phantom `enforce/*` imports out of the scorers and `fixGenerator`. Until this lands, AMC scores its own repo and ships fixes that import files that don't exist — the single biggest credibility hole for an evidence-integrity product, and the one f419839a only half-closed.
2. **Wire or delete the built-but-dark real subsystems (G8-07/08/11/12) and durable-ize the in-memory stores (G8-03).** The genuine LLM judge client, enterpriseIam SSO/RBAC, enterprise gates, and hallucination dir are real code one import away from being product; decide per-module WIRE vs DELETE rather than leaving them as barrel ghosts, and back the ops/insider/SCIM/passport stores with SQLite so their CLI commands stop returning empty.
3. **One hygiene sweep to make the repo audit-clean (G8-06/22-34):** `git rm --cached` the vault blob (+rotate), the `_G0DM0D3` strategy docs, the stale `sbom.json`/`compliance-*.json`, the `.tmp-*` and `--json`/`--verbose` artifacts (after fixing the arg-parse bug that created them), and relocate `AMC_OS/`, `memory/`, `amc_ai_army/`, `mirofish-simulation/`, `qa/`, and the persona files outside the product tree — then turn on the gates that never gate (coverage thresholds, docs-drift, incident-readiness, a real linter) so this class cannot silently re-accumulate.
