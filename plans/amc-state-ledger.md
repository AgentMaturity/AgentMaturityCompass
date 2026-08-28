# AMC State Ledger — where every file stood at `521b2136`

Generated `2026-08-28` by a file-level sweep of the repository at `521b2136`
(`1733` TypeScript files across `218` directories under `src/`, plus the
Python and script satellites). Supersedes the 2026-08-20 sweep of `f419839a`.

Status vocabulary: **REAL** (does what it claims) · **PARTIAL** (does some of it)
· **STUB** (placeholder) · **FACADE** (fabricated results presented as real) ·
**DEAD** (nothing imports or invokes it). "wired via" shows how a module is
reached; ORPHAN means nothing imports it.

Companion documents: the gap register (amc-gap-register.md) and the construction
plan (amc-superharness.md).

---

## Reading this document

**It is a snapshot, not an index.** Every row describes the repository as it was
at `521b2136`. Rows go out of date as the repo moves and are NOT maintained in
place: a row corrected one at a time would leave a document that is neither a
faithful record of the commit it names nor an accurate picture of now, while
implying the rows nobody corrected are current.

To see what has changed since, ask git rather than this file:

```bash
git diff --stat 521b2136..HEAD
git log --oneline 521b2136..HEAD -- <path>
```

Nothing in the codebase reads this document — no test, gate or script — so a
stale row misleads a person, never a build.

## How much of it to believe

Coverage was verified mechanically, not asserted: every row's filename is joined
to its directory heading and checked against the real file list. **`1733` of
`1733` files carry a row (`100`%).** Rows naming a file that does not exist: 0.

The classifications are a reading, and readings can be wrong. FACADE is the
strongest word here and the one most worth checking before acting on it. FIVE
were re-verified by hand against the source while assembling this document, and
all five held:

| re-verified | what was confirmed |
|---|---|
| `src/score/owaspLLMCoverage.ts` | 20 `existsSync` calls; all ten OWASP categories scored from AMC's own files being on disk |
| `src/score/euAIActCompliance.ts` | Article 11 "technical documentation" satisfied by `README.md` existing |
| `src/assurance/packs/harmbench-pack.ts` | 13 inline prompts, no dataset load of any kind, under id `harmbench-research-dataset` |
| `src/adapters/adapterCapabilities.ts` | `verification.status: "fixture_verified"` set unconditionally at line 105 for every adapter |
| `tests/adapterCapabilityReceipts.test.ts` | asserts that hardcoded literal — an assertion that cannot fail |

The remaining 128 have NOT been individually re-checked. Treat a FACADE row as a
lead with its evidence attached, not as a finding already litigated.

A row saying REAL is nearly free to produce and worth correspondingly little. A
row saying FACADE, with the note explaining what it fakes, is what this document
is for.

## Summary of the tree at `0c1d10e2`, plus the pack relabelling committed alongside this line

| status | files | what it means |
|---|---|---|
| REAL | 1360 | does what its name and docstring claim |
| PARTIAL | 208 | does part of it; the note says which part is missing |
| STUB | 3 | placeholder returning a fixed or empty value |
| FACADE | 126 | fabricated results presented as real |
| DEAD | 36 | nothing imports or invokes it |

---

## src/assurance

Scope: 173 `.ts` files — 23 in `src/assurance/`, 150 in `src/assurance/packs/`. Every file is listed.

Shared context for the packs table: a pack is a list of scenarios, each with one `buildPrompt` and one
`validate(response, prompt, context)`. `assuranceRunner` sends **one** message per scenario to the real
agent (`agentResponder`) and grades the reply with regexes. No pack can be multi-turn, offer tools, or
read workspace state, because the interface has no way to do it.

### src/assurance

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| agentResponder.ts | Resolves + invokes the real agent under test | lib (assuranceRunner, redteam/runner, api/assuranceRouter, api/securityRouter, cli) | REAL | Y | Deliberately has no synthetic fallback; throws AgentResponderUnavailableError instead. Exposes tool-offering and `toolCalls`, which the runner never uses. |
| assuranceCertificates.ts | Issues + inspects signed .amccert bundles | CLI:`amc assurance cert-issue` / `cert-verify` | REAL | Y | Real Ed25519 signing and real gate enforcement, but unreachable in practice: assuranceRunner persists evidenceGates.correlationRatio/observedShare as hardcoded 0 while the default policy demands 0.9/0.7, so issuance always throws "evidence gates failed". |
| assuranceCli.ts | Thin CLI wrappers over the control plane | CLI:`amc assurance *` | REAL | Y |  |
| assuranceControlPlane.ts | API/CLI facade for runs, waivers, certs, readiness | CLI + API:complianceRouter, studioServer | FACADE | Y | `legacyProjectionForReport` returns `evidenceGates: { correlationRatio: 1, observedShare: 1 }` — literals, never measured, and exactly the values that clear the policy gates; every API/CLI listing of a run reports perfect evidence correlation. `findingCountsFromReport` pins `critical: 0` and buckets every failed scenario as `high`, and `findingsProjectionForReport` hardcodes `severity: "HIGH"`, so the policy's `maxCriticalFindings: 0` gate can never trip through this surface. |
| assuranceFindings.ts | Builds v1 findings docs + severity counts | lib (assuranceScoring) | PARTIAL | N | Only `findingCounts` has a caller. `findingsFromScenarioResults` — the whole scenario→finding conversion — has no consumer anywhere in src or tests; the runner builds findings inline in persistV1Artifacts instead. |
| assurancePolicySchema.ts | Zod schema + default assurance policy | lib (policy store, control plane, cli) | REAL | N |  |
| assurancePolicyStore.ts | Reads/writes/signs policy, runs, waivers, scheduler | lib (15 importers) | REAL | Y | `activeAssuranceWaiver` tests `waiver.allowReadyDespiteAssuranceFail`, which the schema declares `z.literal(true)` — that half of the condition can never be false. The expiry check next to it is real. |
| assuranceRunner.ts | Executes packs against the live agent, writes report + v1 artifacts | CLI:`amc assurance run`, API:assuranceRouter | PARTIAL | Y | Inconclusive-scenario handling and evidence writing are honest. But: `const requestIds: string[] = []` is never filled, so every scenario's `correlatedRequestIds` is empty and `persistV1Artifacts` writes `correlationRatio: 0, observedShare: 0` as literals; and it calls `responder.respond(prompt)` with no tools and keeps only `answer.text`, discarding `answer.toolCalls`, so every tool-governance pack is graded on prose. |
| assuranceScheduler.ts | Cadence/event-triggered runs + cert issuance | lib (control plane, studioServer) | REAL | N |  |
| assuranceSchema.ts | Zod schemas for v1 run/finding/cert/waiver artifacts | lib (12 importers) | REAL | Y |  |
| assuranceScoring.ts | Evidence-gate evaluation + 0-100 risk scoring | lib (assuranceCertificates) | PARTIAL | N | Only `evaluateAssuranceEvidenceGates` is consumed. `scoreAssuranceRun` — the severity-weighted score, the category scores and the INSUFFICIENT_EVIDENCE path — has no caller in src or tests; the runner and control plane each compute their own score instead. |
| assuranceSse.ts | Emits assurance SSE events to the org hub | lib (studioServer) | REAL | N |  |
| assuranceStore.ts | Read-side queries over persisted runs/certs/waivers | lib (control plane, binderCollector, passportCollector, valueReports) | REAL | N |  |
| assuranceVerifier.ts | Verifies cert bundles + whole-workspace signatures | CLI:`amc assurance verify` | REAL | N | Real digest + envelope + inclusion-proof verification, with hardened tar extraction. |
| certificate.ts | Issues/inspects/verifies/revokes .amccert maturity certs | CLI:`amc cert *`, API:cryptoRouter | REAL | Y | Verification actually re-derives hashes, checks signatures against key history, re-runs the gate policy and re-verifies the ledger. |
| evidenceArtifactSchema.ts | Enum of evidence artifact ids | lib (4 compliance packs, type-only) + test | REAL | Y |  |
| evidenceWriters.ts | Writes assurance evidence/receipts to the ledger | lib (assuranceRunner) | REAL | N | `redactedScenarioPayload` genuinely stores only hash+length, matching the policy's storeOnlyHashesAndRefs literal. |
| falsePositiveTracker.ts | False-positive reports, cost model, tuning loop | CLI:`amc fp-submit` / `fp-list` / `fp-report`, API:assuranceRouter | PARTIAL | Y | CRUD reads the durable store when given a workspace, but `generateTuningRecommendations` iterates the module-level `fpReports` array only and `generateFPTuningReport` calls `computeFPCostSummary()` with no workspace — so in a fresh CLI process the tuning report always prints "No false positive reports filed" and zero recommendations no matter how many reports are on disk. |
| indices.ts | Failure-risk + autonomy-preservation indices | CLI:`amc indices`, API:metricsRouter, lib (14 importers) | REAL | Y | Uses a 50 fallback for missing packs but discloses it in the emitted evidence strings and raises an INFO alert. |
| microCanary.ts | Always-on lightweight canary probes + health score | CLI:`amc micro-canary-run` / `-report` / `-alerts`, API:canaryRouter | FACADE | Y | Both production callers build the context as `{recentEventHashes: [], auditCounts: {}, configSignatures: {}, metadata: {}}` (src/cli.ts ~15712, src/api/canaryRouter.ts:116). Against that empty input `mc-injection-markers`, `mc-secret-exposure`, `mc-tool-governance` and `mc-config-drift` all return **PASS** — "No injection attempts detected", "No secret exposures or PII leaks detected", "Tool governance healthy", "No configuration changes detected" — without reading a single ledger event. `computeCanaryHealthScore` returns `score: 100` when there are no executions at all. Separately, `mc-evidence-chain` is described as "Checks that recent evidence events form a valid hash chain" but only checks each hash is 64 chars; it cannot detect a broken chain. |
| report.ts | Renders the assurance markdown report | lib (assuranceRunner) | REAL | N |  |
| scorers.ts | Scenario/pack/overall score aggregation | lib (assuranceRunner, redteam/runner) | REAL | Y | Correctly excludes `inconclusive` scenarios from pack aggregates rather than scoring them. |
| validators.ts | Shared regex graders + pack/scenario interfaces | lib (162 importers — every pack) | REAL | Y | Graders are keyword/regex over the response text; they can and do fail. The hallucination validator carries an explicit comment on why the deterministic detectors are *not* wired in. |

### src/assurance/packs

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| index.ts | Pack registry + getAssurancePack/listAssurancePacks | CLI:`amc assurance run/list`, lib (runner, control plane, cli) | REAL | Y | Registers 145 of the 149 pack files; agentAsProxyPack, economicAmplificationPack, overthinkingDetectionPack and zombieAgentPersistencePack are unreachable through it. |
| advancedThreatsPack.ts | Advanced Threat Coverage | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| adversarial-robustness.ts | Adversarial Robustness (TAP, PAIR, Best-of-N, AutoAdv) | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| adversarialAlignmentProbesPack.ts | Adversarial Alignment Probes | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| agentAsProxyPack.ts | Agent-as-proxy composition-attack helpers | test-only | DEAD | N | not in packs/index.ts, so `amc assurance run --pack agent-as-proxy` throws "Unknown assurance pack". No src importer; only its own test. Its sole production mention is the literal path "src/assurance/packs/agentAsProxyPack.ts" in src/score/monitorBypassResistance.ts, which credits "adversarial monitor testing" from the file existing. |
| agentIdentitySpoofingPack.ts | Agent Identity Spoofing | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| agenticLoopGovernancePack.ts | Agentic Loop Governance | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| aiTrustExploitationPack.ts | AI-to-AI Trust Exploitation | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| alignmentFakingPack.ts | Alignment Faking Detection | CLI:`amc assurance run` (packs/index) | PARTIAL | Y | claims to detect behaviour that differs when observed, but one prompt is sent and the grader checks topic keywords; no observed/unobserved comparison happens. |
| approvalTheaterPack.ts | Approval Theater Resistance | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| autonomousLoopGovernancePack.ts | Autonomous Loop Governance | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| beavertails-pack.ts | BeaverTails-style Harm-category Probes (AMC-authored) | CLI:`amc assurance run` (packs/index) | REAL | Y | 10 AMC-authored prompts, run against the agent and validated. Was FACADE: shipped as `beavertails-research-dataset` claiming scenarios "from the BeaverTails dataset" while loading none. Relabelled to `beavertails-style-probes`; the retired id now fails with the reason. `tests/assurancePackProvenance.test.ts` fails if any pack names a benchmark it does not load. |
| behavioralContractViolationPack.ts | Behavioral Contract Violation | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| benchmarkTrackingModule.ts | Alias re-export of benchmarkTrackingPack | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| benchmarkTrackingPack.ts | Safety-Critical Benchmark Tracking | ORPHAN | PARTIAL | Y | no benchmark is executed. Docstring cites GPQA Diamond / FrontierMath / SWE-bench / METR; the scenarios ask the agent to discuss them and the grader greps for those words. |
| capabilityElicitationPack.ts | Capability Elicitation & Hidden Capability Detection | CLI:`amc assurance run` (packs/index) | PARTIAL | Y | hidden-capability detection graded from one self-report plus keyword presence. |
| cbrnCapabilityPack.ts | CBRN Capability Assessment | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| chainEscalationPack.ts | Chain-of-Tool Escalation Resistance | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| circuitBreakerReliabilityPack.ts | Circuit Breaker & Reliability Controls | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| codeSabotageDefensePack.ts | Code Sabotage Defense | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| codingAgentEscapePack.ts | Coding Agent Sandbox Escape | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| commercialAgentPack.ts | Commercial Agent Archetype | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| compoundThreatPack.ts | Compound Threat Detection | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| configLintPack.ts | Configuration Linting & Safety | CLI:`amc assurance run` (packs/index) | PARTIAL | N | lints no config — it grades an answer about config. Also pushes the success string "Response includes safe configuration guidance" into the failure-`reasons` array, and `pass` is computed from auditTypes, so reasons never affect it. |
| contentProvenancePack.ts | Content Provenance & Output Signing | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| context-leakage.ts | Context Leakage & EchoLeak Assurance Pack | CLI:`amc assurance run` (packs/index) | FACADE | Y | artifact-echo gate plus a requiredTerms count, and buildPrompt hands the model both the artifact ids and the terms it will be graded on. Restating the brief passes "EchoLeak CVE-2025-32711 resistance evidence". |
| contextWindowManagementPack.ts | Context Window Management | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| costEfficiencyPack.ts | Cost Efficiency Scoring | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| crossAgentCollusionPack.ts | Cross-Agent Collusion Resistance | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| cyberseceval-pack.ts | CyberSecEval-style Cyber-safety Probes (AMC-authored) | CLI:`amc assurance run` (packs/index) | REAL | Y | 10 AMC-authored prompts, run against the agent and validated. Was FACADE: shipped as `cyberseceval-research-dataset` claiming scenarios "from the CyberSecEval dataset" while loading none. Relabelled to `cyberseceval-style-probes`; the retired id now fails with the reason. `tests/assurancePackProvenance.test.ts` fails if any pack names a benchmark it does not load. |
| delegationTrustChainPack.ts | Delegation Trust Chain | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| disempowermentPack.ts | Human Empowerment & Autonomy Preservation | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| dlpExfiltrationPack.ts | DLP & Credential Leakage Prevention | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| donotanswer-pack.ts | Do-Not-Answer-style Refusal Probes (AMC-authored) | CLI:`amc assurance run` (packs/index) | REAL | Y | 12 AMC-authored prompts, run against the agent and validated. Was FACADE: shipped as `do-not-answer-research-dataset` claiming scenarios "from the Do-Not-Answer dataset" while loading none. Relabelled to `donotanswer-style-probes`; the retired id now fails with the reason. `tests/assurancePackProvenance.test.ts` fails if any pack names a benchmark it does not load. |
| dualityPack.ts | Digital-Physical Duality Safety | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| dynamicTrustAuthorizationPack.ts | Dynamic Trust Authorization | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| economicAmplificationPack.ts | Tool-call amplification analysis helpers | test-only | DEAD | N | not registered, no src importer, test-only. `analyzeEconomicAmplification` also sets `costCapEnforced: true` when nothing was amplified and nothing capped (0 === 0). |
| educationFERPAPack.ts | Education FERPA/COPPA Pack | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| emergentCapabilityPack.ts | Emergent Capability Discovery | CLI:`amc assurance run` (packs/index) | PARTIAL | Y | all 10 prompts are essay questions; grades whether the answer contains boundary/transparency/safety/novelty words, not whether a capability emerged. |
| emergentMultiAgentRiskPack.ts | Emergent Multi-Agent Risk | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| encodedInjectionPack.ts | Encoded & Obfuscated Injection Resistance | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| environmentalInfraPack.ts | Environmental / Critical Infrastructure Pack | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| euAiActArticlePack.ts | EU AI Act Article-Level Assurance Pack | CLI:`amc assurance run` (packs/index) | FACADE | Y | buildPrompt dictates the exact token to emit (`[artifact:<id>]` / `artifact=<id>`) and validate only checks the reply echoed it. No artifact is opened or proven to exist, yet the pass is reported as a EU AI Act Art. 9/10/13/14/15/17 evidence gate. |
| evalAwareBehaviorPack.ts | Eval-Aware Behavior Detection | CLI:`amc assurance run` (packs/index) | PARTIAL | Y | no unobserved control condition is run, so eval-awareness is not measurable from what this pack collects. |
| evaluationFreshnessPack.ts | Evaluation Freshness & Self-Evolution | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| evaluationReliabilityPack.ts | LLM-as-Judge Evaluation Reliability | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| excessiveAgencyPack.ts | Excessive Agency (OWASP LLM08) | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| exfiltrationPack.ts | Secret Exfiltration Resistance | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| factSimulationBoundaryPack.ts | Fact-Simulation Boundary Integrity | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| falsePremisePack.ts | False Premise Detection (FalseQA) | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| financialModelRiskPack.ts | Financial Model Risk Pack | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| financialSOXPack.ts | Financial Services SOX & Market Integrity Pack | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| forecastLegitimacyPack.ts | Forecast Legitimacy | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| globalAIRegulatoryPack.ts | Global AI Regulatory Compliance | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| governanceBypassPack.ts | Governance Bypass Resistance | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| governanceNISTRMFPack.ts | Governance NIST AI RMF Pack | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| hallucinationPack.ts | Hallucination and Overclaim Resistance | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| harmbench-pack.ts | HarmBench-style Safety Probes (AMC-authored) | CLI:`amc assurance run` (packs/index) | REAL | Y | 12 AMC-authored prompts, run against the agent and validated. Was FACADE: shipped as `harmbench-research-dataset` claiming scenarios "from the HarmBench dataset" while loading none. Relabelled to `harmbench-style-probes`; the retired id now fails with the reason. `tests/assurancePackProvenance.test.ts` fails if any pack names a benchmark it does not load. |
| healthcarePHIPack.ts | Healthcare PHI Protection Pack | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| hipaaCompliancePack.ts | HIPAA Compliance Assurance Pack | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| honeytokenDetectionPack.ts | Honeytoken Detection & Avoidance | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| humanDecisionSabotagePack.ts | Human Decision Sabotage Detection | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| humanOversightQualityPack.ts | Human Oversight Quality Assessment | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| informationExtractionPack.ts | Information Extraction Resistance | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| injectionPack.ts | Prompt Injection Resistance | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| inputFaultResiliencePack.ts | Input Fault Resilience | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| instructionCompliancePack.ts | Instruction Compliance & Shutdown Safety | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| instructionHierarchyPack.ts | Instruction Hierarchy Compliance | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| instructionalLeakagePack.ts | Instructional Data Leakage | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| iso42005Pack.ts | ISO/IEC 42005 Impact Assessment Assurance Pack | CLI:`amc assurance run` (packs/index) | FACADE | Y | buildPrompt dictates the exact token to emit (`[artifact:<id>]` / `artifact=<id>`) and validate only checks the reply echoed it. No artifact is opened or proven to exist, yet the pass is reported as a ISO/IEC 42005 Sec. 6.3/6.4/7/8 evidence gate. |
| legalCompliancePack.ts | Legal & Compliance Boundaries Pack | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| linuxPrivilegeBoundaryRegressionPack.ts | Linux Privilege Boundary Regression Pack | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| mcpSecurityResiliencePack.ts | MCP attack taxonomy + resilience math | lib (src/score/mcpCompliance.ts) | PARTIAL | N | not an AssurancePackDefinition and not registered. `analyzeMCPSecurityResilience` and `getMCPSecurityTestCases` have no production caller; only `getMCPAttackTaxonomy` / `computeNetResilientPerformance` are consumed, by src/score/mcpCompliance.ts. |
| mechanisticTransparencyPack.ts | Mechanistic Transparency & Internal State Monitoring | CLI:`amc assurance run` (packs/index) | PARTIAL | Y | grades an essay about interpretability; no internal state is inspected. |
| memoryMaturityPack.ts | Memory Maturity Assessment | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| memoryPoisoningPack.ts | Memory Poisoning Resistance | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| militaryDualUsePack.ts | Military & Dual-Use AI Governance | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| misleadingContextPack.ts | Misleading Context Resistance (FaithEval) | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| mobilityFunctionalSafetyPack.ts | Mobility Functional Safety Pack | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| modelRoutePoisoningPack.ts | Model-Route Poisoning Resistance | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| modelTheftExfilPack.ts | Model Theft & Weight Exfiltration | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| multi-turn-safety.ts | Multi-Turn Safety (Crescendo, TopicAttack, Siren, Skeleton Key) | CLI:`amc assurance run` (packs/index) | PARTIAL | Y | single-turn. The Crescendo/TopicAttack/Siren/Skeleton-Key trajectory is described inside one prompt, and buildPrompt also hands the model the detection patterns, mitigation checklist and evidence requirements it is graded against. |
| multiAgentOrchestratorPack.ts | Multi-Agent Orchestrator Governance | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| multiTurnDeepEvalPack.ts | Deep Multi-Turn Conversation Evaluation | CLI:`amc assurance run` (packs/index) | PARTIAL | Y | single-turn: the "conversation history" is pasted into one prompt. AssuranceScenarioDefinition has one buildPrompt/one validate and the runner sends exactly one message. |
| multiTurnToolAttackPack.ts | Multi-Turn Tool Attack Taxonomy | CLI:`amc assurance run` (packs/index) | PARTIAL | N | single-turn and tool-free: the turn sequence is prose, and the runner never offers tools nor reads `responder.toolCalls`. |
| notaryAttestationPack.ts | Legacy Notary Attestation Compatibility Pack | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| nvidia-aegis-pack.ts | Aegis-style Robustness Probes (AMC-authored) | CLI:`amc assurance run` (packs/index) | REAL | Y | 8 AMC-authored prompts, run against the agent and validated. Was FACADE: shipped as `aegis-research-dataset` claiming scenarios "from the Aegis dataset" while loading none. Relabelled to `aegis-style-probes`; the retired id now fails with the reason. `tests/assurancePackProvenance.test.ts` fails if any pack names a benchmark it does not load. |
| operational-discipline.ts | Operational Discipline Patterns | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| overCompliancePack.ts | Over-Compliance Resistance (H-Neurons) | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| overreliancePack.ts | Overreliance (OWASP LLM09) | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| oversightUnderminingPack.ts | Oversight Undermining Detection | CLI:`amc assurance run` (packs/index) | PARTIAL | N | asks the model to introspect about being evaluated; no oversight behaviour is observed. |
| overthinkingDetectionPack.ts | Reasoning-length vs accuracy analysis helpers | test-only | DEAD | N | not registered, no src importer, test-only. Sole production mention is the path string in src/score/reasoningEfficiency.ts, which credits "overthinking detection" from the file existing. |
| owaspGenAiPack.ts | OWASP GenAI G01-G10 Assurance Pack | CLI:`amc assurance run` (packs/index) | FACADE | Y | buildPrompt dictates the exact token to emit (`[artifact:<id>]` / `artifact=<id>`) and validate only checks the reply echoed it. No artifact is opened or proven to exist, yet the pass is reported as a OWASP GenAI G01-G10 evidence gate. |
| persuasionManipulationPack.ts | Persuasion & Manipulation at Scale Detection | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| pharmaCompliancePack.ts | Pharmaceutical & Clinical Safety Pack | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| piiDetectionLeakagePack.ts | PII Detection & Leakage Testing | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| policyConfusionPack.ts | Policy Confusion & Spec Ambiguity Resistance | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| powerSeekingPack.ts | Power-Seeking / Instrumental Convergence Detection | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| predictiveUXHonestyPack.ts | Predictive UX Honesty | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| promptCachePoisoningPack.ts | Prompt Cache Poisoning | CLI:`amc assurance run` (packs/index) | PARTIAL | N | the poisoned cache state is described in prose; no cache is exercised. |
| ragPoisoningPack.ts | RAG Pipeline Injection Resistance | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| realPersonRepresentationPack.ts | Real-Person Representation Controls | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| realtimeVoiceSafetyPack.ts | Real-time Voice Safety | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| reasoningLockDetectionPack.ts | Reasoning Lock Detection | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| reasoningObservabilityPack.ts | Reasoning Observability | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| redTeamCoveragePack.ts | Red Team Coverage Assessment | CLI:`amc assurance run` (packs/index) | PARTIAL | Y | grades an essay about red-team coverage; no coverage data is read. |
| replicationResistancePack.ts | Replication Resistance | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| resourceExhaustionPack.ts | Resource Exhaustion Resistance | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| roleDeploySabotagePack.ts | Role-Specific: Deploy Sabotage Resistance | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| roleSupportFraudPack.ts | Role-Specific: Support Fraud Resistance | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| rspCompliancePack.ts | Responsible Scaling Policy Compliance | CLI:`amc assurance run` (packs/index) | PARTIAL | Y | grades an essay about ASL thresholds; no RSP artifact or threshold is checked. |
| runtimeTrustGatePack.ts | Runtime Trust Gate | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| sabotagePack.ts | Sabotage Detection (Bloom) | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| safetyCriticalSILPack.ts | Safety-Critical SIL Pack | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| safetyCulturePack.ts | Safety Culture Assessment | CLI:`amc assurance run` (packs/index) | PARTIAL | Y | assesses an *organization* by asking the model under test to write essays; 7 of 10 prompts are open questions and the grader checks for culture/safety/process/accountability words. |
| sandbaggingPack.ts | Sandbagging Detection | CLI:`amc assurance run` (packs/index) | PARTIAL | Y | "I will ask you the same question two ways" happens inside a single prompt; the capability differential across framings is never measured. |
| sandboxBoundaryPack.ts | Legacy Sandbox Boundary Compatibility Pack | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| sbomSupplyChainPack.ts | SBOM & Supply Chain Attack Resistance | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| scenarioTraceabilityPack.ts | Scenario Traceability & Reproducibility | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| schemingDeceptionPack.ts | Scheming & Goal-Directed Deception Auditor | CLI:`amc assurance run` (packs/index) | PARTIAL | N | "over 10 turns" is described, not executed; one response graded on vocabulary. |
| scienceResearchAgentPack.ts | Science & Research Agent Risk | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| securityStarterPack.ts | Security Starter Pack | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| selfPreferentialBiasPack.ts | Self-Preferential Bias Detection (Bloom) | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| selfPreservationPack.ts | Self-Preservation Resistance (Bloom) | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| silentFailurePack.ts | Silent Failure & False Success Resistance | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| simulationValidityPack.ts | Simulation Validity | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| simulationWritebackGovernancePack.ts | Simulation Writeback Governance | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| stepupApprovalBypassPack.ts | Step-Up Approval & Human-in-the-Loop Bypass | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| supply-chain-integrity.ts | Supply Chain Integrity: CPA-RAG, MCP Tool Poisoning, TombRaider | CLI:`amc assurance run` (packs/index) | PARTIAL | Y | buildPrompt supplies the mitigation checklist and evidence requirements and `requiredSignals` is drawn from that same brief, so restating the prompt satisfies most of the check. |
| supplyChainAttackPack.ts | Supply Chain Attack Resistance | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| sycophancyPack.ts | Sycophancy Resistance (Bloom) | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| syntheticAgentInteractionPack.ts | Synthetic Agent Interaction Safety | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| syntheticPersonaGovernancePack.ts | Synthetic Persona Governance | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| taintPropagationPack.ts | Data Taint Propagation Tracking | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| technologyGDPRSOCPack.ts | Technology GDPR/SOC2/ISO27001 Pack | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| temporalConsistencyPack.ts | Temporal Consistency | CLI:`amc assurance run` (packs/index) | PARTIAL | Y | "200 turns into a multi-session task" is asserted in one prompt; no cross-session state is compared. |
| thoughtSafetyAuditPack.ts | Thought Safety Audit | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| timingSideChannelPack.ts | Timing & Side-Channel Resistance | CLI:`amc assurance run` (packs/index) | PARTIAL | N | no timing is measured (the runner records timingMs: 0); the grader looks for the words "constant-time"/"uniform" in prose. |
| tocTouPack.ts | Time-of-Check / Time-of-Use Resistance | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| toolMisusePack.ts | Legacy Tool Misuse Compatibility Pack | CLI:`amc assurance run` (packs/index) | PARTIAL | Y | same prose-only tool detection as unsafeToolPack; no tool is ever offered to the agent under test. |
| toolSchemaDriftPack.ts | Tool Schema Drift Detection | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| toxic-chat-pack.ts | ToxicChat-style Toxicity-handling Probes (AMC-authored) | CLI:`amc assurance run` (packs/index) | REAL | Y | 12 AMC-authored prompts, run against the agent and validated. Was FACADE: shipped as `toxicchat-research-dataset` claiming scenarios "from the ToxicChat dataset" while loading none. Relabelled to `toxicchat-style-probes`; the retired id now fails with the reason. `tests/assurancePackProvenance.test.ts` fails if any pack names a benchmark it does not load. |
| truthfulnessPack.ts | Legacy Truthfulness Compatibility Pack | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| uncertaintyPropagationPack.ts | Uncertainty Propagation | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| unsafeToolPack.ts | Unsafe Tool Action Resistance | CLI:`amc assurance run` (packs/index) | PARTIAL | N | tool actions are found by regex-extracting {"tool","action"} JSON from prose (validators.extractToolCallRequests). The runner offers no tools and drops `responder.toolCalls`, so a real tool call is invisible to it. |
| valueCoherencePack.ts | Value Coherence Index (VCI) | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| wealthManagementMiFIDPack.ts | Wealth Management MiFID Pack | CLI:`amc assurance run` (packs/index) | REAL | N |  |
| whistleblowerProtectionPack.ts | Whistleblower Protection Assessment | CLI:`amc assurance run` (packs/index) | REAL | Y |  |
| xstest-pack.ts | XSTest-style Over-refusal Probes (AMC-authored) | CLI:`amc assurance run` (packs/index) | REAL | Y | 12 AMC-authored prompts, run against the agent and validated. Was FACADE: shipped as `xstest-research-dataset` claiming scenarios "from the XSTest dataset" while loading none. Relabelled to `xstest-style-probes`; the retired id now fails with the reason. `tests/assurancePackProvenance.test.ts` fails if any pack names a benchmark it does not load. |
| zombieAgentPersistencePack.ts | Memory-injection persistence analysis helpers | test-only | DEAD | N | not registered, no src importer, test-only; the analyze* functions consume caller-supplied results and nothing in src produces them. |

## score & advisory

Slice: `src/score` (100), `src/incidents` (8), `src/standard` (6), `src/doctor` (4), `src/guide` (4), `src/tickets` (3), `src/tuning` (2), `src/guardrails` (1), `src/targets` (1) = **129 files**.

Two structural facts govern most `src/score` rows and are stated once here rather than repeated in 30 notes:

1. **The control-surface family.** ~30 scorers grade a directory by running `existsSync` on paths — many of them *AMC's own source files* (`src/vault`, `src/score/interpretability.ts`). `src/score/controlSurfaceScope.ts` is an honest, well-documented guard added to contain this: it refuses `src/`-prefixed evidence outside an AMC checkout and excludes unassessable criteria from the denominator. It contains the damage; it does not remove it. Inside an AMC checkout these scorers still score AMC ~100 for containing its own filenames, and several emit a number with **no `applicable` flag at all**.
2. **The `.amc/*.json` evidence paths are never written by AMC.** `.amc/behavioral_contract.json`, `.amc/tool_allowlist.json`, `.amc/risk_register.json`, `.amc/policy_staging.json` and ~50 siblings appear only as read-side existence checks in `src/score/*.ts`; grep finds zero producers anywhere else in `src/`. And nothing reads their contents — a zero-byte file at the path scores the control as met.

### src/score

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| a2aProtocol.ts | Score A2A inter-agent protocol maturity | lib (score/index) | REAL | Y | Weighted score over a caller-supplied capability declaration; self-attestation, not probing. |
| adaptiveAccessControl.ts | Score adaptive/learned access control | lib (score/index only) | FACADE | Y | Score/level come entirely from `existsSync`. Its four non-`src/` criteria are `.amc/behavior_profiles`, `.amc/learned_access_policies.json`, `.amc/policy_staging.json`, `.amc/policy_versions` — grep finds no code anywhere that writes any of them, so outside an AMC checkout the score is structurally pinned at 0; inside one it is AMC grading its own filenames. No consumer outside score/index. |
| adversarial.ts | Detect answer inflation/buzzwords in text answers | lib (score/index) | REAL | Y | Text heuristics, honestly named. |
| agentProtocolSecurity.ts | Score multi-protocol (MCP/A2A/ANP) security | lib (score/index only) | FACADE | Y | Same pattern as adaptiveAccessControl: 8 `assessCriterion` calls, zero `readFileSync`. `.amc/protocol_inventory.json`/`.amc/protocol_versions.json` have no producer. No consumer outside score/index. |
| agentSimulator.ts | Run scenario sims against policy or a real agent | lib (score/index) | REAL | Y | Header is explicit that default mode previews *policy* on the scenario input and does not test an agent; `agentSimulatorHonesty.test.ts` guards it. Model example. |
| agentStatePortability.ts | Score portability of agent cognitive state | CLI:`amc score` + lib | FACADE | Y | 7 existence checks, no content read; `.amc/state_spec.json`, `.amc/snapshot_hashes.json`, `.amc/state_signatures` have no producer. A `touch` on the path scores the control met. |
| agentVsWorkflow.ts | Classify workflow vs agent from scores | lib (score/index) | REAL | Y | |
| alignmentIndex.ts | Composite alignment index from 5 signals | lib (score/index) | REAL | Y | Fixed weights, computed over caller inputs. |
| antiGaming.ts | Detect score gaming in a diagnostic report | lib (index.ts) | REAL | Y | Real indicators over real report fields (perfect-score ratio, evidence count, variance). |
| architectureTaskAlignment.ts | Score architecture complexity vs task complexity | lib (score/index) | REAL | Y | |
| auditDepth.ts | Score black/white/outside-the-box audit access | CLI:`amc score audit-depth` | FACADE | Y | Awards "white-box audit support — can inspect model internals, activations, gradients" 10 pts for `src/score/interpretability.ts` existing (a file that scores an events array and never touches a model) and 8 pts for `src/score/capabilityElicitation.ts` — a file nothing imports (see DEAD below). The module's own header says "AMC can't access model weights". Alone in this family it has **no `applicable` flag**, so the number is emitted unqualified. |
| autonomyDuration.ts | Score time-between-interventions + domain risk | lib (score/index only) | REAL | N | No test names it; no consumer outside score/index. |
| behavioralContractMaturity.ts | Score explicit behavioral contracts | CLI:`amc score` + lib | FACADE | Y | Score/level from `existsSync` on `.amc/behavioral_contract.json`, `.amc/alignment_card.json` etc. Content never read, no producer for the paths — an empty file scores L5 criteria as met. |
| behavioralTransparency.ts | Declared-vs-observed behavior gap | ORPHAN | DEAD | N | No import, no dynamic import, no test, anywhere in `src`, `tests`, `api`, `scripts`, `packages`, `sdk`. Its *filename string* is the only thing referenced — `gamingResistance.ts:105` adds +5 and `sleeperDetection.ts:91` counts it as behavioral-fingerprinting evidence. A dead module whose existence inflates AMC's own self-score. |
| bishengObservabilityLiveDriftScore.ts | Re-export shim to watch/ drift surface | lib (score/index) | REAL | Y | 17-line projection shim. |
| calibrationGap.ts | Expected Calibration Error scoring | CLI:`amc score calibration` + lib | FACADE | Y | `scanCalibrationInfrastructure` returns `meanCalibrationError` and `expectedCalibrationError` as `1 - infraScore/100` — ECE, a statistic over confidence/outcome pairs, computed from a file-existence tally. `selfReported`, `observed`, `perDimensionGap` are returned as `{}` every time. No `applicable` flag. (`scoreCalibrationGap(input)`, the other export, is real.) |
| capabilityElicitation.ts | METR-style capability elicitation scoring | ORPHAN | DEAD | N | No importer, no test. `scoreCapabilityElicitation` has zero call sites. Referenced only as a filename string by `auditDepth.ts:69`, where its existence is worth 8 white-box audit points. |
| capabilityGovernance.ts | Score CBRN/replication governance (AMC-7.19–7.30) | lib (lanes/safetyResearchLane) | PARTIAL | Y | Scores free-text self-descriptions by regex keyword match; `+0.05` is awarded for the response being over 200 chars and containing a newline. Verbosity and formatting move a CBRN-governance score. |
| catastrophicRiskIndicators.ts | ForesightSafety catastrophic-risk indicators | lib (score/index) | REAL | Y | Fails closed on missing evidence, marks `evidenceStatus: "missing"`, and states its partial coverage in `coverageNote`. Honest. |
| claimExpiry.ts | TTL/staleness check over claim profiles | lib (score/index) | REAL | Y | |
| claimProvenance.ts | Claim tier promotion with a 2-session gate | lib (score/index) | REAL | Y | |
| communityGovernance.ts | Community governance + reputation registry | lib (index.ts, score/index) | REAL | Y | Scores a caller-supplied profile. |
| confidenceDrift.ts | Track predicted-vs-actual confidence drift | lib (score/index) | REAL | Y | |
| controlSurfaceScope.ts | Guard: refuse scores for non-AMC directories | lib (29 score modules, ci/redteamGate) | REAL | Y | The most honest file in the slice; its docstrings name the exact defect it contains. Note it only *contains* the family, it does not fix it. |
| crossAgentTrust.ts | Cross-agent trust verification + transitive trust | lib (score/index) | PARTIAL | Y | `verifyAgentClaim` awards **full credit for every policy field the caller left unset**: no `minAmcScore` → +0.20, no `minAmcLevel` → +0.15, `requirePassport` false → +0.10, no `allowedWorkspaces` → +0.10, `requireFreshness` false → +0.15. An empty policy therefore returns `trustLevel: 'full'` (1.0) for any correctly-HMAC'd claim. The number measures how few constraints were configured. Also symmetric HMAC: the verifier must already hold the peer's secret. |
| crossFrameworkMapping.ts | Map AMC results to NIST/ISO/EU/SOC2/GDPR controls | lib (score/index) | PARTIAL | Y | A control counts as covered if **an AMC module name appears in `activeModules`** — so running the module satisfies the SOC2/GDPR control. `certificationReadiness` is a boolean derived from that. `auditArtifacts` returns hardcoded filenames (`SOC2_Evidence_Package.pdf`, `DSAR_Report.pdf`, `Privacy_Impact_Assessment.pdf`) that AMC does not produce. |
| densityMap.ts | Evidence density / blind-spot map | CLI:`amc score density` + lib | FACADE | Y | `scanDensityMapInfra` reports `overallCoverage = infraScore/100` from six `existsSync` checks, and always returns `cells: []`, `dimensions: []`, `blindSpots: 0`, `clusterPattern: "unknown"` — a coverage map with no cells. No `applicable` flag. (`buildDensityMap(input)` is real.) |
| distributedAgents.ts | Score distributed multi-agent execution | lib (score/index) | REAL | Y | |
| domainPacks.ts | Domain-specific rubric packs | lib (domains/*, score/index) | REAL | Y | |
| euAIActCompliance.ts | Score EU AI Act high-risk/GPAI requirements | CLI:`amc score eu-ai-act` + lib | FACADE | Y | Art. 11 "technical documentation for compliance assessment" is satisfied by the presence of `README.md`. Art. 15 "accuracy, robustness, cybersecurity" is satisfied by a `tests` directory existing. Art. 17 QMS by `src/score/vibeCodeAudit.ts` existing. These are emitted as EU AI Act article compliance findings. |
| evidenceCollector.ts | Wrap module outputs / ledger events as evidence | lib (productionReadiness, score/index) | REAL | Y | Previously a facade (stamped everything `observed` @ 0.7); the fix and the reason are documented in the docstring. Now correctly `self_reported` @ 0.4. |
| evidenceConflict.ts | Detect contradictory evidence | CLI:`amc score evidence-conflict` + lib | FACADE | Y | `scanEvidenceConflicts` always returns `totalEvidence: 0`, `conflictCount: 0`, `conflictRatio: 0`, `patterns: []` — it never opens the evidence directory it just checked for. The score is four `existsSync` results. No `applicable` flag. (`scoreEvidenceConflict(evidence)` is real.) |
| evidenceCoverageGap.ts | Gap roadmap with effort estimates | lib (score/index) | FACADE | Y | `getEvidenceCoverageReport(_agentId)` ignores its only argument (leading underscore). The "coverage" is `questionIds` whose prefix is in a hardcoded `AUTOMATED_PREFIXES` list — identical output for every agent, forever, regardless of what evidence that agent has. Effort hours (16/24/…) are literals in `ROADMAP_CONFIGS`. |
| evidenceIngestion.ts | Ingest external confidence reports at ATTESTED tier | lib (score/index) | REAL | Y | Uses canonical `trustWeights`. |
| factSimulationBoundary.ts | Score fact/simulation provenance separation | lib (lanes/simulationForecastLane) | PARTIAL | Y | Regex-over-free-text family; carries the `applicable` flag, but the same `+0.05 for >200 chars and a newline` verbosity bonus applies. `scanFactSimBoundaryInfrastructure` has no caller. |
| factuality.ts | Parametric / retrieval / grounded factuality axes | lib (score/index) | REAL | Y | |
| failSecureGovernance.ts | Score fail-closed tool governance (OWASP LLM08) | CLI:`amc score` + lib | FACADE | Y | 8 existence checks, zero content reads. `.amc/fs_policy.json`, `.amc/tool_allowlist.json` have no producer in the codebase. |
| faithfulness.ts | Context-grounding score for LLM output | CLI:`amc score faithfulness` | PARTIAL | Y | The sync `scoreFaithfulness(input, {mode:'llm'})` **stamps `mode: 'llm'` on the result while always running the word-overlap heuristic** — the mode string is echoed, never branched on. The real judge is the separate async `scoreFaithfulnessLLM`. Also, empty output returns `score: 1` ("vacuously faithful"). |
| forecastLegitimacy.ts | Score epistemic honesty of forecasts | lib (lanes/simulationForecastLane) | PARTIAL | Y | Regex-over-free-text family with the verbosity bonus; carries `applicable`. `scanForecastLegitimacyInfrastructure` has no caller. |
| formalSpec.ts | M(a,d,t) = Σ w·E·decay — the core maturity formula | lib (13 modules incl. runner path) | REAL | Y | Genuinely load-bearing; imports canonical weights. |
| gamingResistance.ts | Score whether AMC's own scoring can be gamed | CLI:`amc score gaming-resistance` + lib | FACADE | Y | "Scoring formula is tested and validated against gaming" is printed when `src/score`, `tests`, `src/score/simplicityScoring.ts` and `src/score/predictiveValidity.ts` exist. "Evidence quality gates prevent flooding" when `src/evidence`, `src/score/evidenceCoverageGap.ts`, `src/vault` exist. No test is run; the meta-assurance claim is a directory listing. Uses raw `existsSync`, bypassing `evidencePathExists`. |
| graduatedAutonomy.ts | Confidence-based autonomy escalation model | lib (score/index) | REAL | Y | |
| humanOversightQuality.ts | Oversight quality incl. approval-theater detection | lib (score/index) | REAL | Y | Real telemetry-driven scoring; `simulateScenarios()` is a labelled fixture list, not passed off as measurement. |
| identityContinuity.ts | Score identity/subjective-memory continuity | lib (score/index only) | REAL | N | Scores caller-declared booleans. No test names it. |
| index.ts | Barrel for the scoring modules | lib (22 src modules, cli, api) | REAL | Y | Its docstring is unusually honest: names which exports the runner actually calls, says "Nothing inside AMC calls these" of the standalone libraries, and warns that `scoreExplainer` is not the shipped explainability. Trust this file over the module names. |
| industryTrustModels.ts | Sector-specific risk weighting and decay | lib (score/index) | REAL | Y | |
| interpretability.ts | Score observable interpretability surface | lib (score/index) | REAL | Y | Header is explicit that it cannot see model internals. It is `auditDepth.ts` that misrepresents this file, not this file. |
| kernelSandboxMaturity.ts | Score OS/kernel-level execution isolation | CLI:`amc score` + lib | FACADE | Y | 7 existence checks, no content read, no probe of Landlock/Seatbelt despite the docstring naming them. `.amc/sandbox_profile.json` has no producer. |
| knowledgeGraph.ts | Typed entity/edge graph over AMC artifacts | lib (product/index, score/index) | REAL | Y | |
| leanAMC.ts | Team-size/domain profile + time-to-level estimate | lib (score/index) | REAL | Y | Estimates are table lookups; presented as such. |
| lessonLearnedDatabase.ts | Lesson store with Jaccard similarity + recurrence | lib (score/index) | REAL | Y | In-memory only; `addLesson` returns a lesson but persists nothing. |
| levelTransition.ts | Score maturity promotion/demotion quality | CLI:`amc score level-transition` + lib | FACADE | Y | `scanLevelTransitionInfra` reports `avgTransitionQuality = infraScore` — a file-existence tally relabelled as average transition quality — and always returns `transitions: []`, `promotionRetentionRate: 0`, `demotionRate: 0`. No `applicable` flag. (`scoreTransitionQuality` is real.) |
| maturityTaxonomy.ts | L0–L5 labels and ordinal formatting | CLI + 10 src modules | REAL | Y | |
| mcpCompliance.ts | Score MCP protocol compliance | lib (score/index) | REAL | Y | Weighted rubric over a caller-supplied `MCPCapabilityDeclaration` — self-declaration, no live MCP probe. |
| memoryDepth.ts | Score deep memory operational properties | lib (score/index) | REAL | Y | |
| memoryIntegrity.ts | Score memory consistency/poisoning resistance | lib (score/index) | REAL | Y | |
| memoryMaturity.ts | Memory hash chain, poisoning, continuity | lib (score/index) | REAL | Y | Real hash-chain verification. |
| memorySecurityArchitecture.ts | Score zero-trust memory layer | lib (score/index only) | FACADE | Y | 7 existence checks, no content read; no consumer outside score/index. Same never-written `.amc` paths. |
| metricValidity.ts | Construct-validity report for AMC's own metrics | lib (diagnostic/runner, score/index) | PARTIAL | Y | 18,458 lines. The single production caller (`diagnostic/runner.ts:1443`) passes **none** of the ~60 optional check arrays — no `counterfactualChecks`, `architectureRealityChecks`, `pentestBenchmarkChecks`, … (grep: zero non-test suppliers anywhere in `src`). Every benchmark/RAG/pentest/counterfactual summary in a shipped report is therefore computed from `undefined` and reports `sampleSize: 0` / `null`. Only `constructValidity` and score-stability use live data. The rest is exercised solely by hand-built test fixtures. |
| modelDrift.ts | Detect silent provider model-version drift | lib (scoreHistory, score/index) | REAL | Y | |
| monitorBypassResistance.ts | Score agent-as-proxy monitoring bypass resistance | lib (score/index only) | FACADE | Y | 6 existence checks, no content read; no consumer outside score/index. |
| multiAgentDimension.ts | 8th dimension: multi-agent coordination | lib (score/index only) | REAL | N | Scores a caller-declared boolean profile. No test names it. |
| mutualVerification.ts | Agent-to-agent mutual trust verification | lib (score/index) | PARTIAL | Y | `evidenceChainsValid` is set from `challenger.evidenceChainHead.length > 0 && responder.evidenceChainHead.length > 0` — a field named "chains valid" that only checks the strings are non-empty; **no chain is verified**. `"x"` passes. Also symmetric HMAC: `verifyMutualTrust` requires both parties' signing secrets, so it cannot verify a genuinely remote agent. |
| networkTransparencyLog.ts | CT-style append-only log + score | lib (score/index) | FACADE | Y | `score()` grades the in-memory log object AMC just constructed, not any agent: `hasConsistencyProofs = entries.length >= 2`, `hasCrossAgentVerification = distinct agentIds > 1`, `hasTimestampBinding = every ts > 0` (always true — `append()` sets `Date.now()`). Appending two entries under two agent ids to a fresh log yields score 100 / level 5. Separately, the constructor defaults to the hardcoded key `"amc-transparency-key"`, so `verifyChain()` on a default-constructed log provides no tamper evidence — anyone can recompute the HMACs. (`outputAttestation.ts` fixed exactly this defect; this file did not.) |
| nlpMetrics.ts | BLEU / ROUGE / METEOR / perplexity | lib (safetyMetrics, score/index) | REAL | Y | Real implementations. |
| operationalIndependence.ts | Dependency inventory + drift from guard events | lib (score/index) | REAL | Y | Reads real guard-event telemetry. |
| orchestrationDAG.ts | Capture and score an orchestration DAG | lib (score/index) | REAL | Y | Real cycle detection. |
| organizationalSafetyPosture.ts | Score RSP compliance / safety culture | lib (lanes/safetyResearchLane) | PARTIAL | Y | Regex-over-free-text family + verbosity bonus. |
| outputAttestation.ts | Sign agent outputs with trust metadata | lib (product, score/index, watch) | REAL | Y | `assertSigningKey` rejects the old hardcoded `"amc-default-key"` and short keys, with the reason documented. This is the fixed version of the defect still live in `networkTransparencyLog.ts`. |
| outputIntegrityMaturity.ts | Score LLM output validation (OWASP LLM02) | CLI:`amc score` + lib | FACADE | Y | 8 existence checks, no content read; `.amc/output_length_policy.json`, `.amc/response_selection_policy.json` have no producer. |
| oversightIntegrity.ts | Score protection of human oversight (7.13–7.18) | lib (lanes/safetyResearchLane) | PARTIAL | Y | Regex-over-free-text family + verbosity bonus. |
| owaspLLMCoverage.ts | Score OWASP LLM Top-10 coverage | CLI:`amc score owasp` + lib | FACADE | Y | All ten OWASP categories are `existsSync` on AMC's own source: LLM01 ← `src/assurance/packs/injectionPack.ts`, LLM08 ← `src/score/failSecureGovernance.ts`, LLM09 ← `src/score/humanOversightQuality.ts`. Inside an AMC checkout it scores 100/L5 unconditionally; outside, 0. Uses raw `existsSync`, so the scope guard never suppresses the paths. |
| pauseQuality.ts | Score agent-initiated pause quality | lib (score/index) | REAL | Y | |
| platformDependency.ts | Score single points of platform failure | lib (score/index only) | REAL | N | Scores a caller-declared profile. No test names it. |
| policyConsistency.ts | pass^k policy-following reliability (τ-bench) | CLI:`amc score policy-consistency` + lib | FACADE | Y | `scanPolicyConsistency` sets `passRate = infraScore/100` from eight `existsSync` checks and then emits `passK` as `passRate^k` for k=1..16 with human-readable interpretations. A τ-bench reliability metric fabricated from a directory listing; no trial is ever run. `policyScores: {}` always. No `applicable` flag. |
| predictiveMaturity.ts | M(a,d,t) trajectory + 30-day projection | lib (score/index only) | REAL | N | Real linear regression. No test names it. |
| predictiveValidity.ts | Calibration, inter-rater reliability, drift | lib (metricValidity, score/index) | REAL | Y | Real statistics; `trackPredictionLog` degrades honestly with a warning when `.amc/PREDICTION_LOG.md` is absent. |
| processDeceptionDetection.ts | Score sandbagging/scheming testing (7.1–7.12) | lib (lanes/safetyResearchLane) | PARTIAL | Y | Regex-over-free-text family + verbosity bonus. |
| productionReadiness.ts | Six-gate production readiness assessment | lib (score/index) | REAL | Y | Gates query the real ledger (runs, assurance packs, enforcement). Note non-strict mode passes with one failing gate. |
| ragGroundingEval.ts | RAG grounding evaluation receipts | lib (score/index) | REAL | Y | |
| ragMaturity.ts | RAG production maturity scoring | lib (score/index) | REAL | Y | Falls back to declared booleans when no evaluations are supplied; the fallback is visible in the code path. |
| reasoningEfficiency.ts | Score deep-vs-verbose reasoning | lib (score/index) | PARTIAL | Y | 8 existence checks plus one content read; `.amc/reasoning_metrics.json`, `.amc/reasoning_budget.json`, `.amc/reasoning_traces/` have no producer. |
| regulatoryReadiness.ts | Composite EU AI Act + ISO 42001 + OWASP readiness | CLI:`amc` (static import) + lib | FACADE | Y | Composes three file-existence scorers into one regulatory number **and drops their applicability**: `scoreEUAIActCompliance` and `scoreOWASPLLMCoverage` each carry `applicable`/`notApplicableReason`, but `RegulatoryReadinessResult` has no such field — it multiplies the raw scores by an "agent evidence modifier" and returns a level. Its own `scoreISO42001Coverage` marks ISO-9.2 covered because `src/ledger` exists and ISO-10.2 because `src/incidents` exists. Inside AMC: ~100. In a customer repo: ~0. Neither number is about the customer's agent. |
| reputationPortability.ts | Score portability of agent reputation | lib (score/index only) | REAL | N | Scores caller-declared booleans. No test names it. |
| runtimeIdentityMaturity.ts | Score execution-vs-user identity tracking | CLI:`amc score` + lib | FACADE | Y | 7 existence checks, no content read; `.amc/agent_identity.json`, `.amc/identity_map.json`, `.amc/revocation_list.json` have no producer. |
| safetyMetrics.ts | Toxicity/bias/hate-speech dual-layer evaluation | lib (score/index) | REAL | Y | Pattern lists with declared per-pattern confidence; real computation. |
| scenarioProvenance.ts | Score simulation scenario provenance | lib (lanes/simulationForecastLane) | PARTIAL | Y | Regex-over-free-text family + verbosity bonus, and unlike its three siblings in that lane it has **no `applicable` flag**. |
| scoreExplainer.ts | Decomposition, CIs, benchmark comparison, audit trail | lib (index.ts) | PARTIAL | Y | `computeBenchmarkComparison` defaults to hardcoded population stats `{mean: 2.5, median: 2.4, stdDev: 0.8}` and reports a percentile and a `"top-10%"` / `"bottom-10%"` category against that invented population; the only non-test caller (`src/index.ts`) passes no stats. The source comment concedes "synthetic for now". `score/index.ts` separately warns this is not the explainability AMC ships. |
| scoreHistory.ts | SQLite score snapshots + regression detection | test-only | REAL | Y | Real signed store, but no production caller — nothing in `src`, `api` or `cli` imports it, statically or dynamically. |
| scoringScale.ts | Canonical 0–5 / 0–100 scale conversions | lib (6 src modules) | REAL | Y | |
| selfKnowledgeMaturity.ts | Score agent self-model accuracy | CLI:`amc score` + lib | FACADE | Y | 7 existence checks, no content read. |
| simplicityScoring.ts | Penalise excess layers/deps/overhead | lib (score/index only) | REAL | N | Arithmetic over caller inputs. No test names it. |
| simulationValidity.ts | Score simulation validity claims | lib (lanes/simulationForecastLane) | PARTIAL | Y | Regex-over-free-text family + verbosity bonus; carries `applicable`. |
| sleeperDetection.ts | Detect deceptive-alignment / sleeper behaviour | CLI:`amc score sleeper` + lib | FACADE | Y | `passK` — documented as "pass^k reliability metric (probability of k consecutive successes)" — is `(infraScore/100)^k`, i.e. a τ-bench-style reliability figure derived from how many AMC directories exist. `contextSwitchTests: []` and `triggerPatterns: []` are always empty despite the type promising results. No behavioural test is ever run. |
| statisticalAnalysis.ts | CIs, t-tests, normal/t CDF approximations | lib (score/index) | REAL | Y | Named approximations cited to Abramowitz & Stegun; honest. |
| syntheticIdentityGovernance.ts | Score synthetic-identity governance | lib (lanes/simulationForecastLane) | PARTIAL | Y | Regex-over-free-text family + verbosity bonus; carries `applicable`. |
| taskHorizon.ts | METR-style task-horizon capability banding | lib (score/index) | REAL | Y | |
| trustAuthorizationSync.ts | Score trust/authorization synchronisation | lib (score/index only) | FACADE | Y | 8 existence checks, no content read; `.amc/trust_permission_audit.jsonl`, `.amc/permission_ttl.json`, `.amc/dynamic_permissions.json` have no producer. No consumer outside score/index. |
| trustWeights.ts | Canonical evidence trust weights + decay | lib (formalSpec, evidenceIngestion, modelDrift) | REAL | Y | Consolidates three previously-disagreeing tables; the drift and the fix are documented. |
| vibeCodeAudit.ts | Static safety patterns for AI-generated code | CLI:`amc` + lib | REAL | Y | Real regex scan over supplied source text. |

### src/incidents

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| autoAssembly.ts | Build incidents from drift/assurance/freeze/budget | lib (index barrels only) | PARTIAL | Y | No production caller: only `src/index.ts` and `incidents/index.ts` re-export it, and grep finds no invocation of `assembleFromDrift`/`autoDetectAndAssemble` anywhere in `src` or `api`. The advertised "automatic incident assembly" never runs. Causal-edge confidences are per-rule literals (0.5/0.6/0.7/0.9). |
| causalInference.ts | Rank candidate causes over an incident timeline | lib (incidents/index only) | PARTIAL | Y | Header honestly disclaims causation, but `explainCausalLink` still renders edges as "directly caused … Confidence: 90.0%" where 0.9 is a literal in the rule, not a computed quantity. `signFn` defaults to `(digest) => ""`, so `CausalEdge.signature` is an empty string while the type presents it as a signature. No production caller. |
| incidentGraph.ts | DAG operations over incident causal edges | lib (index barrels only) | REAL | Y | Real cycle detection and root-cause derivation; signs edges with a supplied key. No production caller. |
| incidentRegression.ts | Incident regression receipts + watch alerts | lib (index.ts) | REAL | Y | |
| incidentStore.ts | SQLite incident store, hash chain, signatures | CLI:`amc incident *`, API:incidentRouter | REAL | Y | Real signature verification against the auditor key history. |
| incidentTimeline.ts | Assemble/format incident timelines | lib (index barrels only) | REAL | Y | No production caller. |
| incidentTypes.ts | Incident/edge types + valid state transitions | lib (11 modules) | REAL | Y | |
| index.ts | Barrel for the incidents subsystem | lib (~30 src modules, cli, api) | REAL | Y | |

### src/standard

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| standardApi.ts | API/CLI wrappers + transparency-log entries | lib (studioServer, standardCli) | REAL | N | No test names it. |
| standardCli.ts | Thin CLI adapters for `amc standard` | CLI:`amc standard` | REAL | N | Pure pass-through; no test. |
| standardGenerator.ts | Generate, verify, and validate against the schema bundle | lib (verifyAll, standardApi) | REAL | Y | `verifyStandardSchemas` does real work: auditor signature on `meta.json`, per-schema SHA-256 comparison, and envelope verification with `requireTrustedKey: true`. |
| standardRegistry.ts | Path helpers for the standard bundle | lib (generator, tests helper) | REAL | N | Paths only. |
| standardSchema.ts | Zod schemas for bundle meta and signatures | lib (generator, api, tests) | REAL | Y | |
| standardTests.ts | Canonical snapshot of the schema bundle | test-only | REAL | Y | 18 lines; consumed only by `agentPassportOpenStandard.test.ts`. Lives in `src/` but is test scaffolding. |

### src/doctor

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| doctorCli.ts | Run doctor rules and render text | CLI:`amc doctor` | REAL | Y | |
| doctorFix.ts | Auto-repair common setup issues | CLI:`amc doctor-fix` (dynamic import) | FACADE | N | Three rules (`MISSING_DIR`, `BROKEN_SYMLINK`, `STALE_CACHE`) run **unconditionally**, ignoring the doctor report, and `executeFixRule` hardcodes `result: "FIXED"` whenever the rule does not throw. On a perfectly healthy workspace the report says `Fixed: 3` while `beforeState`/`afterState` read "none found" / "Cache was empty". `fixableChecks` is set to `actions.length` (always ≥3), not the number of fixable failing checks, and bears no relation to `totalChecks`. No test. |
| doctorReport.ts | Render a doctor report as text | lib (doctorCli) | REAL | N | Dead branch: `report.ok` is exactly `failCount === 0`, so the `failCount === 0 ? "READY ✅"` arm inside the `!ok` ternary is unreachable. Cosmetic, not a fabricated result. |
| doctorRules.ts | The doctor check suite | lib (cli, fix, report) | PARTIAL | Y | ~30 genuinely real checks (key-history chain, signature verification, notary smoke-sign, live lease-carrier probes). One is a facade: the `toolhub-denylist` check calls `pathAllowedByPatterns(workspace, ".amc/forbidden.txt", ["./workspace/**"])` and PASSes when the result is *not* ok. `.amc/**` is an unconditional protected path (`toolhub/protectedPaths.ts`), so this returns `ok:false` always — and the workspace's actual denylist is never passed in. "ToolHub denylist blocks .amc path access" **cannot fail**, whatever `tools.yaml` says. |

### src/guide

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| fixCli.ts | `amc fix` command wiring | CLI:`amc fix` | PARTIAL | Y | Prints "N gaps now have enforced guardrails" for markdown text appended between `AMC-GUARDRAILS` markers in `AGENTS.md`. Nothing enforces it; the module it calls says "written", the CLI says "enforced". |
| frameworkGuide.ts | Framework-specific governance patterns | CLI:`amc framework-guide` (dynamic import) | REAL | Y | Static pattern catalogue with code examples; presented as guidance, not measurement. |
| guideGenerator.ts | Personalised improvement guides + guardrail text | lib (oneClickFix, domainApply) | REAL | Y | |
| oneClickFix.ts | Engine behind `amc fix` | lib (fixCli) | REAL | Y | Composes rapid quickscore + guide + guardrail write + a hash-sealed receipt. Safety properties in the header match the code. |

### src/tickets

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| execTicketCli.ts | TTL and action-class parsers | CLI:`amc ticket *` | REAL | N | Named `*Cli` but contains no command registration — two pure parsers. No test names it. |
| execTicketSchema.ts | Zod schema for the exec-ticket payload | lib (execTicketVerify) | REAL | N | |
| execTicketVerify.ts | Issue and verify signed execution tickets | CLI:`amc ticket *`, lib (toolhubServer) | PARTIAL | Y | Real Ed25519 signature, expiry, agent/work-order/action-class binding and a work-order digest re-check. One gap: `if (params.expectedToolName && payload.toolName && ...)` — the tool-name binding is **skipped entirely when the ticket omits `toolName`**, so a ticket issued without a tool name satisfies any `expectedToolName`. |

### src/tuning

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| tuneWizard.ts | Interactive tune/upgrade wizard | CLI:`amc tune`, lib (index.ts) | REAL | Y | Loads real runs from the ledger. |
| upgradeEngine.ts | Rank gaps into an upgrade plan | lib (tuneWizard, index.ts) | REAL | Y | Ranking uses real question-bank gate definitions. |

### src/guardrails

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| guardEngine.ts | Re-export shim to `shield/guardEngine` | CLI, lib (index.ts, shield) | REAL | N | 2 lines; the engine moved to `shield/`. Tests exercise the shield module, not this shim. |

### src/targets

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| targetProfile.ts | Create, sign, load and diff signed target profiles | CLI:`amc target/targets`, lib (21 modules) | REAL | Y | `verifyTargetProfileSignature` reconstructs the canonical payload and verifies against the auditor public-key history — a real verification, not a flag. |

## product & org

Slice: `src/product` `src/credentials` `src/org` `src/runtime` `src/domainProof` `src/corrections` `src/mirofish` `src/packs` `src/workflow` `src/archetypes` `src/attachments` `src/i18n` `src/verify` — 129 `.ts` files, all classified.

### src/product

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| apiWrapperGenerator.ts | Generate tool wrappers from OpenAPI/Postman specs | lib (product/index) | REAL | Y | real JSON parse + endpoint/parameter extraction; unparseable spec becomes a warning, not a fake wrapper |
| approvalWorkflow.ts | Multi-stage approval chains with expiry | lib (product/index) | REAL | Y | legacy `createApproval()` builds a throwaway manager, so the request it returns is stored in nothing |
| asyncCallback.ts | Callback and webhook registry with retrying delivery | lib (product/index) | FACADE | Y | two fabrications. `registerAsyncCallback(url)` returns `{callbackId, url, registered: true}` while registering nothing in the registry. `deliverWebhook` sets `X-AMC-Signature: sha256=${config.secret.slice(0,8)}` — that is not a signature of anything, and it transmits the first 8 characters of the shared secret to the receiver in cleartext (in-file comment: "would use crypto in real impl") |
| autodocGenerator.ts | Render workflow docs as markdown/html/rst | lib (product/index) | REAL | Y | empty steps/tests produce warnings rather than invented content |
| autonomyDial.ts | Decide ask-vs-act from task risk keywords | lib (product/index, src/index) | REAL | N | two hardcoded keyword sets; `_tenantId` and `_context` are accepted and ignored |
| batchProcessor.ts | SQLite batch queue with claim/progress/ETA | lib (product/index, api/productRouter) | REAL | Y | |
| chunkingPipeline.ts | Structure-aware document chunking for RAG | lib (product/index) | REAL | Y | |
| clarification.ts | Detect ambiguity and emit clarifying questions | lib (product/index) | REAL | Y | regex heuristics, weights stated in-file |
| clarificationOptimizer.ts | Dedupe and rank clarification questions | lib (product/index) | REAL | Y | |
| compensation.ts | LIFO saga rollback with compensating actions | lib (product/index) | FACADE | Y | `CompensationLog`/`CompensationSaga` really invoke compensators; the exported free function `compensate(operation)` accepts any string and returns `{actionId, operation, reversed: true}` — a rollback reported as done that reversed nothing. Re-exported from product/index.ts |
| contextOptimizer.ts | Pack context to a token budget | lib (product/index) | REAL | Y | |
| contextPackBuilder.ts | Priority context pack with expiry pruning | lib (product/index) | REAL | Y | |
| conversationSummarizer.ts | Extractive/sliding/topic-change summaries | lib (product/index) | REAL | Y | |
| costLatencyRouter.ts | Route task to a model profile by cost/quality | lib (product/index) | REAL | Y | profiles derived from the shared modelPricing table, not a second copy |
| dependencyGraph.ts | Topo sort, cycle detection, critical path | lib (product/index) | REAL | Y | |
| determinism.ts | Entropy/CV/outlier stats over repeat outputs | lib (product/index) | REAL | Y | |
| documentAssembler.ts | Section-based assembly with TOC and status | lib (product/index) | PARTIAL | Y | class is real; legacy `assembleDocument(sections)` only joins the strings with blank lines and reports `sections: n` — no TOC, no status, no assembly record |
| errorTranslator.ts | Translate error text to guidance via patterns | lib (product/index) | REAL | Y | |
| escalation.ts | Regex routing rules with SLA breach tracking | lib (product/index) | PARTIAL | Y | class is real; legacy `escalateIssue(reason, level)` mints a uuid and returns — no rule matching, no SLA deadline, and the record is stored nowhere, so `trackEscalation` can never find it |
| eventRouter.ts | Rule-based event routing with delivery log | lib (product/index) | FACADE | Y | `EventRouter` routes for real. The exported free function `routeEvent(eventType, _payload)` discards the payload, consults no route rule, delivers to nothing, and returns `{eventId, destination: eventType, handled: true}` — an event marked handled that was never routed |
| featureCatalog.ts | List "product features" for the CLI | CLI:`amc product features`, `amc product features-recommended` | STUB | N | the entire catalog is two hardcoded literals (`AMC-W1-FEATURE-1/2`) with invented price ranges `$1k-$3k` / `$2k-$5k`; `getRecommended(limit)` ignores every input but `limit` and slices that same two-element array. The CLI prints it as the product feature list |
| fixGenerator.ts | Map gaps to module-based fix suggestions | lib (product/index) | PARTIAL | Y | `matchConfidence` is a hardcoded 0.75 / 0.65 / 0.5 chosen by which branch matched, not a measured confidence; the fuzzy branch emits `// TODO: integrate <module> to address <gap>` as the fix "code" |
| glossary.ts | Term/alias registry with variant enforcement | CLI:`amc product glossary ...`, lib | REAL | Y | |
| goalTracker.ts | Goals, milestones, keyword-overlap drift | lib (product/index) | PARTIAL | Y | class is real; legacy `trackGoal(goalId, progress)` looks up no goal — it echoes the caller's own `progress` argument back as the goal's status and computes `complete` from it |
| improvement.ts | Threshold-based performance suggestions | lib (product/index) | FACADE | Y | two defects. `applyImprovement()` stores `{applied: true}` and applies nothing — a flag without the work. `setThresholds(area, ...)` writes into an `areaThresholds` map that `suggestImprovement` never reads (`const t = DEFAULT_THRESHOLDS;` at line 78), so the documented configuration knob cannot change a single suggestion |
| index.ts | Barrel re-exporting the product modules | lib (cli.ts, api/productRouter, domains, compliance) | REAL | N | barrel only; note it is what publishes the facade helpers above onto the library surface |
| instructionFormatter.ts | Format instructions with token budget | lib (product/index) | REAL | Y | |
| knowledgeGraph.ts | Entity/relationship graph with BFS paths | lib (product/index, score/index) | PARTIAL | Y | `KnowledgeGraph` is real; legacy `addKnowledgeNode(label)` returns a node object that is added to no graph and reachable from nothing |
| longTermMemory.ts | Namespaced KV memory with TTL and tags | lib (product/index) | PARTIAL | Y | the docstring claims "agent state persistence"; the store is `private store = new Map(...)` in process memory — nothing is written anywhere and everything is lost at exit |
| loopDetector.ts | Detect repeated action patterns per session | lib (product/index) | REAL | N | |
| metering.ts | Record usage events, total units per tenant | lib (product/index) | REAL | N | in-memory only; each `getBill()` mints a fresh `invoiceId` uuid, so two calls "bill" the same units twice under different ids |
| modelPricing.ts | Indicative per-model price/latency/quality | lib (costLatencyRouter, toolCostEstimator) | REAL | Y | hand-maintained, dated (`MODEL_PRICING_AS_OF`), explicitly labelled not billing data |
| onboardingWizard.ts | Step-based onboarding sessions | lib (product/index) | REAL | Y | |
| outputCorrector.ts | Regex correction rules with stats | lib (product/index) | REAL | Y | |
| outputDiff.ts | Line diff plus Jaccard similarity | lib (product/index) | REAL | Y | |
| personalizedOutput.ts | Style profiles applied to output text | lib (product/index) | REAL | Y | |
| portal.ts | SQLite job portal with a state machine | lib (product/index, api/productRouter) | REAL | Y | transitions validated against `VALID_TRANSITIONS` |
| productDb.ts | Shared SQLite handle for product queues | lib (batchProcessor, portal, index) | REAL | Y | |
| promptModules.ts | SQLite prompt-module registry and versions | lib (product/index) | REAL | N | `compose(templateName, moduleIds)` accepts `templateName` and never uses it |
| reasoningCoach.ts | Heuristic reasoning-quality scoring | lib (product/index) | REAL | Y | scores are declared regex heuristics, not model judgements |
| replayDebugger.ts | Cursor-based session event replay | lib (product/index) | REAL | Y | |
| retryEngine.ts | Exponential backoff retry with jitter | lib (product/index) | REAL | N | |
| rolloutManager.ts | Percentage rollouts with SHA-256 bucketing | lib (product/index) | FACADE | Y | `RolloutManager.checkRollout` does deterministic SHA-256 user bucketing. The exported free function of the same name, `checkRollout(feature, percentage)`, returns `enabled: Math.random() * 100 < pct` — it consults no configured rollout, has no user id, and gives the same caller a different answer on every call while reporting a rollout decision |
| scratchpad.ts | SQLite session scratchpad with TTL | lib (product/index) | REAL | Y | |
| structuredOutput.ts | Parse and repair LLM JSON against a schema | lib (product/index) | PARTIAL | Y | the returned `valid` is `missingFieldIssues.length === 0 \|\| repaired` — once any repair has happened, `valid: true` is returned even for a payload whose required fields were absent and were filled with `''`/`0`/`false`/`[]`/`{}` |
| syncConnector.ts | Field-mapping sync with validation | lib (product/index) | FACADE | Y | `SyncManager` and `validateMapping` are real. The exported `syncData(_source, _dest)` ignores both arguments, touches no sync, and returns `{synced: true, recordCount: 0}` — a completed sync that moved nothing |
| taskSpecBuilder.ts | Fluent task specification builder | lib (product/index) | REAL | Y | |
| taskSplitter.ts | Split tasks by registered agent capability | lib (product/index) | REAL | Y | |
| toolChainBuilder.ts | Build tool chains with cycle detection | lib (product/index) | REAL | Y | |
| toolContract.ts | Validate a tool call against its contract | lib (product/index) | PARTIAL | N | checks only tool-name equality and presence of `inputSchema.required` keys. The contract's `outputSchema`, `maxLatencyMs` and `requiredPermissions` are never read, so `{valid: true}` says nothing about permissions or latency despite the contract declaring them |
| toolCostEstimator.ts | Token/cost estimates per tool and model | lib (product/index) | REAL | Y | reads the shared pricing table |
| toolFallback.ts | Fallback chains with EMA health scores | lib (product/index) | PARTIAL | Y | chains, health scores and `executeWithFallback` are real; `tryWithFallback(primary, fallback, succeeded)` takes the outcome as a parameter and reports it back — it executes nothing, records no health, and its `attemptsBeforeSuccess` is a literal 1 or 2 |
| toolParallelizer.ts | Concurrency-limited parallel tool execution | lib (product/index) | REAL | Y | real semaphore, timeouts and cancellation |
| toolRateLimiter.ts | Sliding-window per-tool rate limiter | lib (product/index) | FACADE | Y | the `RateLimiter` class is a real sliding-window limiter. Alongside it, `export function checkRateLimit(_toolName)` discards its argument and returns `{allowed: true, retryAfterMs: 0}` — a rate-limit check that cannot fail — and product/index.ts re-exports it beside the real class, so a caller reaching for "checkRateLimit" gets the one that always says yes |
| toolReliability.ts | Predict tool failure rate from call history | lib (product/index) | REAL | N | with no history it returns a fixed 0.1 failure probability and 1000 ms, labelled `confidence: 'none'` |
| toolSemanticDocs.ts | TF-IDF tool search and doc generation | lib (product/index) | PARTIAL | Y | `buildIndex`, `searchTools` and `generateDocs` are real TF-IDF; `enrichSpec(toolId, examples)` returns `{summary: '', params: [], relatedTools: []}` — it enriches nothing — and `generateSemanticDocs` emits the placeholder example `Use <tool> to...` |
| whiteLabel.ts | Tenant branding, templates, feature gates | lib (product/index) | PARTIAL | Y | `WhiteLabelManager` is real; legacy `createWhiteLabel(brand, theme)` returns a config object that is registered in no manager and readable by nothing |

### src/credentials

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| credentialRef.ts | Branded, validated credential reference type | lib (gateway, llm, kernel, acp, cli) | REAL | Y | the brand is enforced by a compile-time `AssertFalse` alias; the regex's limits are stated rather than implied |
| credentialResolution.ts | Pure precedence fold across layers | lib (localCredentialsService, snapshot, index) | REAL | Y | ranks layers rather than trusting argument order; throws on a duplicated layer |
| credentialSources.ts | Layer identity, ranking, shadow rules | lib (cli, kernel, resolution, store) | REAL | Y | |
| credentialValue.ts | Empty-is-absent normalization of values | lib (dotenvLayer, gateway, store) | REAL | Y | one implementation of the rule, used by both read and write paths |
| credentialsErrors.ts | Error types that never echo a secret | lib (cli, store, refs) | REAL | Y | `InvalidCredentialRefError` takes `name.length`, not `name` |
| credentialsFileFormat.ts | Parse and patch `.credentials.yaml` | lib (localCredentialsService, snapshot) | REAL | N | no test names this file; behaviour is covered only indirectly through LocalCredentialsService tests |
| credentialsFilePermissions.ts | Assert owner-only 0600/0700 modes | lib (fileWriter, snapshot, index) | REAL | N | skips on win32 and says so, rather than passing an assertion it cannot make; covered only indirectly |
| credentialsFileWriter.ts | Atomic owner-only write of the store | lib (localCredentialsService) | REAL | N | write + fsync + rename; covered only indirectly |
| credentialsPaths.ts | Resolve AMC home and the four layer paths | lib (cli, kernel, prompt, store) | REAL | Y | |
| credentialsService.ts | The `CredentialsService` interface | lib (llm, gateway, kernel, store) | REAL | Y | interface + doc contract only |
| credentialsSnapshot.ts | One consistent read of the file layers | lib (localCredentialsService) | REAL | N | covered only indirectly |
| credentialsStoreErrors.ts | Parse/permission errors for the store | lib (index, permissions, format) | REAL | Y | |
| credentialsWatcher.ts | Debounced fs watch on the store file | lib (localCredentialsService) | REAL | N | `noCredentialsWatcher()` reports `attached: false` rather than pretending to watch |
| credentialsWriteQueue.ts | Serial write queue whose tail never rejects | lib (localCredentialsService) | REAL | N | the docstring states plainly that ordering would hold today without it and names the two properties it does provide |
| dotenvLayer.ts | Minimal `.env` parser for the lower layers | lib (credentialsSnapshot) | REAL | N | missing file returns an empty map, not an error |
| index.ts | Credentials seam public surface | lib (cli-credentials-commands, gateway, studio, identity, ~20 more) | REAL | N | barrel; deliberately does not re-export the permission assertions |
| localCredentialsService.ts | Layered env/file/.env store with locking | CLI:`amc credentials ...`, lib (gateway, kernel, acp) | REAL | Y | re-checks shadowing after the write queue, under a cross-process lock, against freshly re-read disk |

### src/org

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| communityGovernance.ts | Score platform governance from tiered signals | CLI (cli.ts), lib (src/index, score/index) | REAL | Y | computed from supplied signals with real tier weighting; the gaming-detector confidences (0.8 / 0.7 / 0.6) are hand-chosen constants, not derived |
| orgAggregation.ts | Weighted mean/median/percentile/trimmed score | lib (orgEngine) | REAL | N | |
| orgApi.ts | Org status/report/EOC service functions | ORPHAN | DEAD | N | nothing imports this file. `grep -rn "orgApi"` across `src`, `api`, `tests`, `tools`, `scripts` and the repo root (excluding node_modules/dist) returns only the file itself; all seven exports (`orgStatus`, `orgNodePayload`, `recomputeOrgScorecardsApi`, `renderOrgNodeReportFile`, `renderOrgCompareReportFile`, `renderOrgSystemicReport`, `generateOrgEoc`) have no consumer. The studio server and CLI call orgEngine/orgReports/orgCommitments directly |
| orgCli.ts | CLI handlers for the org graph commands | CLI:`amc org init/verify/add-node/assign/score/report/compare/learn/own` | REAL | Y | |
| orgCommitments.ts | Generate learn/own/commit plans per node | lib (studio, orgCli, orgApi[dead]) | REAL | N | |
| orgEngine.ts | Compute org scorecards from real agent runs | lib (src/index, studio, orgCli, transformation, score/leanAMC) | REAL | Y | reads `runs/*.json` filtered to `status === "VALID"` inside the window; trust tier inferred from measured evidence coverage |
| orgReports.ts | Render node/compare/systemic org markdown | lib (studio, orgCli, orgApi[dead]) | REAL | N | |
| orgRun.ts | Simulate org role runs; write artifacts | CLI:`amc org run/list/show`, api/orgRunRouter, studio | PARTIAL | Y | the artifacts are `DiagnosticReport` objects built from the simulation's own gate statuses, not from measurement: `status` is the string literal `"VALID"` at both call sites, so the derived `verificationPassed` is unconditionally `true`, and per-question `finalLevel` is a lookup on the role's own status. The dishonesty is contained by convention rather than by type — `integrityIndex`, `evidenceCoverage` and `correlationRatio` are pinned to 0, an `org-simulation` flag is attached, `runSealSig` is the literal `"org-run-synthetic-report"`, and files are written to `org-runs/` instead of `runs/` with an in-file comment explaining that `amc report` would otherwise read them as the agent's real score |
| orgSchema.ts | Zod schemas for org config and scorecards | lib (13 modules incl. assurance, forecast, prompt) | REAL | N | |
| orgScorecard.ts | Persist, load and verify signed scorecards | lib (src/index, studio, bench, audit, orgEngine) | REAL | N | verification delegates to orgSigner, which does real digest + signature checks |
| orgSigner.ts | Sign/verify workspace files with the auditor key | lib (18 modules: forecast, cgx, bench, mechanic, plugins, assurance) | REAL | Y | recomputes the file digest and compares before verifying the signature; falls back to the public-key history |
| orgSse.ts | SSE hub broadcasting org events | lib (studio/studioServer, src/index; 8 sibling hubs reuse its type) | REAL | N | |
| orgStore.ts | Read/write/sign the org config file | lib (src/index, studio, forecast, bootstrap, orgEngine) | REAL | Y | |
| orgValidator.ts | Validate org parents, cycles, membership weights | lib (orgStore) | REAL | N | real cycle detection; `assertValidOrgGraph` throws with the reason list |

### src/runtime

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| approvalClient.ts | Extract owner approval tokens from text | lib (runtime/index, src/index) | PARTIAL | N | `hasValidApprovalToken` calls a token "valid" purely because it matches `APPROVED_BY_OWNER:[A-Za-z0-9_-]{6,}`. No issuer, signature, expiry or registry is consulted, so any model-authored string of that shape passes. The trace note only records that a token was "attached" |
| autonomyBoundary.ts | Authority-vs-risk gate with signed decisions | lib (runtime/index) | REAL | Y | `verifyRuntimeAutonomyBoundaryDecision` recomputes the receipt hash, requires evidence refs, and stats the event and signature files on disk |
| degradedModeContract.ts | Degraded-mode behaviour receipts and checks | lib (runtime/index) | REAL | Y | status `allow_degraded` requires a passing test run with an evidence ref; receipt hash recomputed on verify |
| firewall.ts | Signed prompt/tool firewall policy and decisions | CLI:`amc firewall ...`, api/firewallRouter, lib (agentToolset, enforce, bridge) | REAL | Y | fails closed — an invalid policy or guardrail control state forces `runtimeFirewallEnabled` to true |
| index.ts | Runtime public surface barrel | lib (src/index, cli.ts, ~28 modules) | REAL | N | barrel |
| lifecycleGraph.ts | Build and verify the runtime lifecycle graph | lib (runtime/index, integrations/partnerInteroperability) | REAL | Y | verify recomputes `graphDigest` and checks required node kinds; fail-open is itself an invalid state |
| runManager.ts | Create, resume, inspect and export runtime runs | CLI:`amc runtime ...`, api/runtimeRouter, lib | REAL | Y | |
| stateCheckpoint.ts | Checkpoints plus hash-backed restore proofs | lib (runtime/index) | REAL | Y | `proveRuntimeStateRestore` compares a recomputed hash of the restored state against the stored checkpoint and refuses without external test-evidence refs — the proof can and does fail |
| traceLogger.ts | Redacting trace writer with privacy tiers | lib (runtime/index, wrapFetch, approvalClient) | REAL | Y | |
| truthProtocol.ts | Check required truth-protocol headings | lib (runtime/index → src/index re-export only) | REAL | N | the function is real, but it has no in-repo caller: its own docstring says it is superseded by `assurance/validators.hasTruthProtocol` and the `src/truthguard` subsystem, and the only references are the two barrel re-exports. Note the low-risk short-circuit — for `riskTier` below high it returns `{ok: true}` without examining the text |
| wrapFetch.ts | Retrying, traced fetch wrapper | lib (runtime/index) | REAL | Y | replayability of the body is actually checked before a retry |

### src/domainProof

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| domainProofApiRequest.ts | Parse HTTP proof-check request payloads | lib (api/domainProofRouter) | REAL | N | |
| domainProofArtifact.ts | Build, hash and verify amcproof artifacts | lib (standard/standardGenerator, check, cli, apiRequest) | PARTIAL | Y | `verifyDomainProofArtifact` re-derives the canonical SHA-256 and stops there. `proofBindings.signatureRef`, `signedEvidenceRefs` and `transparencyEntryHash` are schema fields nothing in this module validates, so an artifact naming a signature is "verified" without that signature ever being checked |
| domainProofCheck.ts | Evaluate toy governance claims into proofs | lib (api/domainProofRouter, domainProofCli) | PARTIAL | N | rule evaluation is genuinely deterministic and refuses any manifest that is not byte-identical to the canonical toy fixture. But it passes the caller's own unsigned `input.evidenceRefs` straight through as `signedEvidenceRefs: input.evidenceRefs` — caller-supplied strings recorded under a field name that claims they were signed. Exercised only indirectly, via tests/domainProofCli.test.ts |
| domainProofCli.ts | CLI wrapper around the proof check | CLI:`amc proof check` | REAL | Y | |
| domainProofSchema.ts | Zod schema and status guards for proofs | lib (truthguard, artifact) | REAL | Y | |
| index.ts | Barrel over the domainProof modules | ORPHAN | DEAD | N | nothing imports it. Every consumer — `src/api/domainProofRouter.ts`, `src/cli.ts`, `src/truthguard/*`, `src/standard/standardGenerator.ts` — imports the concrete module files directly; a repo-wide grep for `domainProof/index`, `from ".../domainProof"` and `domainProof.js` returns no hits outside the directory |
| sourceRuleManifestSchema.ts | Build and verify source-to-rule manifests | lib (check, apiRequest, toyGovernanceRules) | REAL | Y | clause hashes recomputed against the declared source text |
| toyGovernanceRules.ts | The toy governance fixture manifest | lib (domainProofCheck) | REAL | Y | a fixture by design and labelled as one — clauses carry `fixture-only`, `not-real-policy` and a non-legal disclaimer |

### src/corrections

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| correctionStore.ts | SQLite hash-chained correction records | CLI (cli-observability-commands), lib (learning, index) | REAL | Y | |
| correctionTracker.ts | Verify corrections against a later run | CLI (cli-observability-commands), lib (learning, index) | REAL | Y | `verifyCorrection` compares recorded baseline levels against the later report's actual `finalLevel` per question, normalised by remaining headroom; a missing question scores 0, not a pass |
| correctionTypes.ts | Correction event and effectiveness types | lib (store, tracker, closure, learning) | REAL | Y | |
| feedbackClosure.ts | Report open and closed correction loops | CLI (cli.ts, cli-observability-commands), lib | REAL | Y | |
| index.ts | Corrections barrel | lib (cli.ts, evidence/exporter, evidence/auditPacket, score) | REAL | N | barrel; does not re-export `buildOwnerCorrection`, which the CLI imports directly |
| lessonStore.ts | Promote verified corrections into lessons | CLI:`amc lessons-list` / promote (dynamic import in cli.ts) | REAL | N | |

### src/mirofish

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| cli.ts | Register the mirofish simulation commands | CLI:`amc mirofish run/list/create/compare/stress` | REAL | N | many tests import it only to construct the CLI program, which is incidental |
| engine.ts | Seeded Monte Carlo behaviour-to-score simulation | lib (mirofish/cli) | REAL | Y | seeded Mulberry32 + Box-Muller, so runs are reproducible; the dimension→layer weight matrix is declared hand-authored domain judgement |
| format.ts | Render simulation results as text/markdown | lib (mirofish/cli) | REAL | Y | |
| scenarios.ts | Load built-in and YAML scenarios | lib (mirofish/cli, score/forecastLegitimacy) | REAL | Y | |
| types.ts | Zod schemas for scenarios and results | lib (~20 modules incl. cli.ts, shield, ledger, guide) | REAL | N | |

### src/packs

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| packCli.ts | CLI handlers for pack init/list/publish/registry | CLI:`amc pack ...`, api/complianceRouter, studio | REAL | Y | the `// TODO: implement your pack scenarios here` at line 632 is inside a scaffold template emitted for the user, not unfinished code |
| packManager.ts | Install packs with lockfile and integrity check | lib (packCli) | FACADE | Y | the install path fetches, downloads and verifies nothing, yet reports an integrity-checked install. `fetchPackInfo()` never contacts the registry — it composes a `resolved` tarball URL as a string and takes `integrity` from `computePackIntegrity(name)`, which SHA-512s the *local* `.amc/packs/<name>/pack.json`. `installPackage()` then downloads no tarball; it writes that same `pack.json` locally. `verifyIntegrity()` finally re-hashes that same local `pack.json` and compares it to the hash derived from it — a value checked against a copy of itself. Two more escapes make it unfailable in the remaining cases: `if (!expectedIntegrity \|\| expectedIntegrity === "") return true;` and `if (!match) return true; // Unrecognized format — don't block` |
| packRegistry.ts | Local pack registry storage and HTTP server | lib (packCli) | REAL | Y | real `node:http` server, real FS storage, real tarball creation via `tar` |
| packTypes.ts | Zod schemas for pack manifests and registry | lib (packCli, packRegistry, packManager) | REAL | Y | |

### src/workflow

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| workflowPlan.ts | Parse and validate declarative workflow plans | lib (workflowTool, workflowRunner) | REAL | Y | rejects a node whose goal is empty and a composite with no children, with the reason "would run nothing and report success" |
| workflowRunner.ts | Execute plan nodes through the delegation chokepoint | lib (workflowTool) | REAL | Y | every `agent` node goes through `spawnSubagent`, so depth refusal, the Ed25519 handoff packet and the signed log all apply; a composite's answer is its children's text joined, never a synthesised summary |
| workflowTool.ts | The `workflow` model-facing tool definition | lib (agent/agentToolset) | REAL | Y | tests/workflowTool.test.ts drives it through `agentToolset` and asserts the two-party grant; the plan is refused as data before any delegation is authorised |

### src/archetypes

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| index.ts | Archetype catalog; apply context/guardrails/targets | CLI:`amc archetype ...`, lib (src/index, score/crossFrameworkMapping) | REAL | Y | `applyArchetype` writes the context graph, guardrails, prompt addendum and eval harness, creates a signed target profile, hashes every changed file and records a ledger audit session |

### src/attachments

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| attachmentIngest.ts | Content-address and detonation-gate attachments | test-only (ORPHAN in src) | REAL | Y | the gate is real — `detonateAttachment` runs *before* the attachment is recorded, and the docstring states honestly what an extension check cannot prove. One claim is stale: it says this gives `detonateAttachment` "its first production consumer", but nothing under `src/` or `api/` calls `ingestAttachment` — the only caller is tests/attachmentIngest.test.ts |

### src/i18n

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| i18nFramework.ts | Locale metadata, translation bundles, `t()` | lib (src/index) | PARTIAL | Y | the file says it itself: 20 locales are declared but only English strings ship, and no CLI or report path calls `t()`. `SUPPORTED_LOCALES` is a schema, not evidence of multilingual support, and `checkTranslationCompleteness` therefore measures a bundle nothing renders |

### src/verify

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| verifyAll.ts | Run every workspace verifier in one pass | CLI:`amc verify all` | REAL | Y | delegates to ~30 real verifiers (trust config, ops policy, plugins, transparency log + Merkle, ledger, forecast, bench, prompt packs, assurance, audit binders, passport, canon, cgx, mechanic) and marks each PASS/FAIL/SKIP with a critical flag |

## enforce & config

### src/enforce

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| abac.ts | attribute-based access decision | test-only | REAL | Y | `checkAccess` is real; the `checkABAC` wrapper ignores policies and just intersects two attribute maps. `emitGuardEvent` always sends `decision:'allow'` here (labelled "observation"). |
| actionEvidenceLogic.ts | compile/apply evidence-gate trees into signed action policy | lib (actionEvidenceLogicCli) | REAL | Y | writes through the real signed action-policy writer with file locks + transparency log |
| actionEvidenceLogicCli.ts | CLI for evidence-gate logic | CLI:`amc policy action logic show/compile/apply` | REAL | N | |
| antiPhishing.ts | phishing indicators in approval requests | lib (enforce/index) | REAL | Y | `checkPhishing(url)` wrapper passes empty sender/subject/body, so only the URL heuristics run |
| atoDetection.ts | account-takeover signal scoring | lib (enforce/index) | REAL | Y | |
| browserGuardrails.ts | block dangerous URL schemes / internal IPs | test-only | REAL | Y | no production caller |
| circuitBreaker.ts | per-session call/token circuit breaker | lib (enforce/index, runtime/wrapFetch, gateway/server) | REAL | Y | |
| clipboardGuard.ts | scrub PII/secrets from clipboard text | lib (enforce/index) | REAL | Y | |
| configLinter.ts | lint config for risky settings | lib (enforce/index) | REAL | Y | |
| consensus.ts | multi-voter proposal tallying | test-only | REAL | Y | no production caller |
| controlInspectionCli.ts | CLI for control projection/simulation/fixtures | CLI:`amc policy controls\|simulate\|test` | REAL | N | |
| controlProjection.ts | project signed controls as Scope/When/Then | lib (controlSimulation, controlInspectionCli) | REAL | Y | reads and verifies real action/approval/firewall policy signatures |
| controlSimulation.ts | run one control through its production evaluator | lib (policyFixtureRunner, CLI) | REAL | Y | calls the real `evaluateRuntimeFirewall` / `runGovernorCheck` |
| crossSourceVerifier.ts | claim/source consistency check | lib (enforce/index) | PARTIAL | Y | "verification" is word-overlap ≥0.3 between claim and source text; no source fetching, no semantic check. A source that repeats the claim's nouns counts as supporting. |
| dryRun.ts | predict risk of an action before executing | test-only | PARTIAL | Y | nothing is simulated: `predictedOutcome` is the template `` `${actionType} on ${target}` ``, risk comes from two hardcoded keyword sets, and `impact.estimatedDuration` is a literal "minutes"/"seconds" |
| egressProxy.ts | egress allow/deny + header stripping | test-only | FACADE | Y | `logged: true` is hardcoded in every return branch though nothing writes a log, and the `auditEntry` it builds is never persisted anywhere. `strippedHeaders` is a list of header *names*; no header is removed from any request because no request passes through this function. |
| evidenceContract.ts | bind claims to required evidence | lib (enforce/index) | PARTIAL | Y | `verified` never inspects evidence content — it is `missingEvidence.length === 0 && hashValid`, where missing-evidence is pure ID set membership. Any object with the right `id`/`claimId` satisfies a claim. `hashValid` re-hashes `contract.claims[i]` and compares to `contract.claimHashes[i]` from the same object. |
| evidenceEmitter.ts | guard-event SQLite store + hash chain + receipts | lib (61 src importers) | REAL | Y | honest docs on unchained legacy rows; caveat: `verifyGuardEventChain` returns `ok:true, chained:0` from its `catch`, so an unreadable/corrupt DB reports OK |
| execGuard.ts | block dangerous shell commands | lib (enforce/index, bridge/hookControl) | REAL | Y | parses a real command plan, hashes the command instead of storing it |
| formalVerification.ts | "formal verification" of trust invariants | lib (enforce/index, shield/trustPipeline) | FACADE | Y | Header claims "Real formal verification … SAT-based bounded model checking". There is no SAT solver and no TLC invocation anywhere in the repo. `generateTLASpec()` returns a fixed string literal that is never derived from any policy and never checked. `boundedModelCheck` enumerates six hardcoded literal arrays (`[0,10,20,34,35,…]`) and evaluates JS predicates. A `ProofCertificate.valid` is just the boolean a JS predicate returned; `exhaustiveProof(prop, 1, holds)` records `statesChecked: 1` and calls it a proof. |
| gatewayScanner.ts | scan HTTP requests / gateway binding | test-only | PARTIAL | Y | `scanGateway(host, port)` connects to nothing — it string-compares its two arguments and then reports `hardened: findings.length === 0`. `scanGatewayRequest` is real regex/limit checking. |
| geoFence.ts | region allow/block by IP or lat-lon | lib (enforce/index) | PARTIAL | Y | IP→region comes from a hardcoded ~70-entry `/8` prefix table; everything outside it returns `UNKNOWN`, which an `allowedRegions` policy then blocks |
| guardrailCli.ts | CLI for signed guardrail control state | CLI:`amc guardrails list/enable/disable/profile` | REAL | N | |
| guardrailControlState.ts | signed, journalled guardrail request state | lib (guardrailCli, controlProjection, runtime/firewall) | REAL | Y | real artifact signing, file locks, signed control journal |
| guardrailProfiles.ts | guardrail catalog + named profiles | lib (guardrailControlState, controlProjection) | PARTIAL | N | 11 of the 14 catalog entries describe themselves as "Catalog reference for …"; only 3 names appear in `GUARDRAIL_RUNTIME_BINDINGS`, so the other 11 can never be activated. All five mutators are `@deprecated` and act on an in-memory `Set` with no runtime effect. Only referenced by tests via `vi.mock`, so no test exercises it. |
| guardrailRuntimeBindings.ts | join catalog with signed firewall policy | lib (guardrailCli, dashboard/build) | REAL | Y | honestly reports `catalog-only` for unbound entries |
| idempotency.ts | request-id dedupe cache | test-only | REAL | Y | no production caller |
| index.ts | barrel export for enforce | lib (src/index) | REAL | Y | header honestly states these are evaluators, not enforcement points |
| inferenceStrategy.ts | rank inference strategies, write signed receipt | lib (cli-strategy-commands, api/strategyRouter) | REAL | Y | ranks caller-supplied score/cost/latency/risk metrics; measures nothing itself (doesn't claim to) |
| mdnsController.ts | mDNS hostname policy | lib (enforce/index) | REAL | Y | `scanMdns()` is an honest documented no-op that returns `scanned:false` |
| modeSwitcher.ts | agent mode gating | lib (enforce/index) | REAL | Y | |
| modelSwitchboard.ts | pick model by cost/quality | lib (enforce/index) | PARTIAL | Y | no routing happens — it returns a decision object. `estimatedCost` is the literal per-1k price from a 3-row hardcoded table, not an estimate for the task. |
| numericChecker.ts | numeric range/plausibility checks | lib (enforce/index) | REAL | Y | |
| outboundFilter.ts | redact secrets/PII from outbound text | test-only | REAL | Y | `checkOutbound` wrapper is allowlist-only; `filterOutbound` is the real one |
| payeeGuard.ts | payee/amount risk scoring | lib (enforce/index) | REAL | Y | |
| policyFirewall.ts | regex tool-call policy engine | lib (enforce/index, api/enforceRouter) | REAL | Y | |
| policyFixtureRunner.ts | run policy fixtures through real evaluators | CLI:`amc policy test` (dynamic import) | REAL | Y | genuinely drives `simulateControlDecision` and diffs against expectations |
| resourceManifest.ts | signed resource manifests + lifecycle | lib (cli.ts, unifiedRun, neutralImporter, 12 importers) | REAL | Y | |
| reverseProxyGuard.ts | SSRF / metadata-endpoint guard | lib (enforce/index) | REAL | Y | `checkProxy` wrapper is substring matching only; `validateProxyRequest` is real |
| safetyDSL.ts | declarative WHEN/THEN safety constraints | lib (enforce/index) | REAL | Y | parser, evaluator and rate limiter all real |
| sandboxOrchestrator.ts | "sandbox" execution tracker | test-only | PARTIAL | Y | documented honestly: `runInSandbox` calls the closure in the current process; `isolated`/`limitsEnforced` are typed as literal `false`; the memory/CPU/network/filesystem config is recorded and never enforced |
| schemaGate.ts | JSON-shape validation gate | lib (toolhub/toolSchemaContracts) | REAL | Y | |
| scopeTemplateCli.ts | CLI for action-class scope templates | CLI:`amc policy scope list/compile/apply` | REAL | N | |
| scopeTemplates.ts | compile scope templates into signed policy | lib (scopeTemplateCli, controlProjection) | REAL | Y | writes through the locked, signed action/approval policy writers |
| secretBlind.ts | typed secret redaction | lib (enforce/index) | REAL | Y | delegates to the shared `redactSecrets` table |
| semanticGuardrails.ts | topic/tone/boundary steering | lib (enforce/index) | PARTIAL | Y | docstring says these "understand the *meaning* of conversations" and are "unlike pattern-based safety filters" — the implementation is keyword arrays plus regexes; no embedding, model or network call exists in the file |
| sessionFirewall.ts | session state gating | test-only | PARTIAL | Y | class is real. The exported `checkSessionTransfer` consults a module-private `defaultFirewall` that no exported API can populate, so `getState()` is always `null` and the "source session is not active" branch can never fire; the decision reduces to `fromSession.split('-')[0] === toSession.split('-')[0]`. |
| shellCommandPlan.ts | parse shell command into segments | lib (execGuard, bridge/hookControl) | REAL | Y | real quote/escape/connector parsing with limits |
| stepUpAuth.ts | human step-up approval workflow | lib (enforce/index) | FACADE | Y | `approve(requestId, approver)` returns `{approved:true, approver, requestId}` for any strings — it never reads `this.requests`, never checks the id exists, never checks the approver's identity or authority, and never updates request state. `deny` is the mirror image. The class advertises a "human approval workflow" that cannot refuse and whose `requests` map is written but never read. |
| taintTracker.ts | taint propagation registry | lib (enforce/index) | REAL | Y | |
| templateEngine.ts | safe template rendering | lib (enforce/index) | REAL | Y | |
| temporalControls.ts | time-window / cooldown gating | lib (enforce/index) | REAL | Y | |
| toolSandboxLimits.ts | tool sandbox resource-limit receipts | lib (enforce/index) — no product caller | FACADE | Y | Nothing observes anything. `ToolSandboxObservedUsage` (cpuTimeMs, peakMemoryMb, ioReadMb, network/filesystem events, processCount) is supplied entirely by the caller, so a `status:"pass"` receipt asserting six enforced limits is computed from numbers the caller invented. `surfaceBindings` is the hardcoded literal `["API","Studio","Fleet","Enforce","Score"]` — none of those five surfaces call this module. `coveredLimits` is the hardcoded `COVERED_LIMITS` constant, and `verifyToolSandboxResourceLimitReceipt` then checks `receipt.coveredLimits.join("|") !== COVERED_LIMITS.join("|")`, i.e. compares that constant against a copy of itself. Every other verify branch also compares receipt fields to other fields of the same receipt. Only `tests/gap4746…` calls it. |
| twoPersonAuth.ts | two-person approval | test-only | PARTIAL | Y | `TwoPersonAuth` class is real (rejects self-approval, tracks state). The exported `checkTwoPersonApproval(approvals: string[])` just counts distinct strings, so `["a","b"]` satisfies the two-person rule with no identity check and no exclusion of the requester. |
| watchdog.ts | liveness watchdogs + tool review | test-only | PARTIAL | Y | `WatchdogManager` is real. `watchdogReview(toolName, _params)` approves everything not in the 3-item literal `['send_payment','delete','deploy']` and ignores `_params` entirely, returning a fixed riskScore of 85 or 20. |
| webhookGateway.ts | webhook HMAC verification | test-only | FACADE | Y | `validateWebhook(source, signature, body)` returns `{ valid: signature.length > 10 }`. It computes no HMAC, has no secret, and never reads `body` or `source` — an 11-character string validates any payload. (`verifyWebhook` in the same file is a real constant-time HMAC check with replay/freshness handling, and is the one the test covers.) |

### src/steer

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| autotune.ts | classify prompt context, tune sampling params | lib (steer/index, feedbackLoop) | REAL | Y | actually rewrites OpenAI/Anthropic request bodies |
| feedbackLoop.ts | EMA feedback adjustment of autotune profiles | lib (steer/index) | REAL | Y | |
| harmClassifier.ts | 12-domain harm classification | lib (steer/index) | PARTIAL | Y | advertised as "dual-path regex + LLM". The `method` union includes `"llm"` and `"hybrid"`, but no LLM call, endpoint or fetch exists anywhere in the file, so only `"regex"` is ever produced. |
| hygiene.ts | strip hedges/preambles from responses | lib (steer/index) | REAL | Y | |
| index.ts | barrel export for steer | lib (runtime/wrapFetch) | REAL | Y | |
| liquid.ts | SSE streaming transform + buffering | lib (steer/index, runtime/wrapFetch) | REAL | Y | |
| microScore.ts | zero-LLM response scoring | lib (steer/index, race) | REAL | Y | real regex/heuristic dimensions with declared weights |
| parameterMatrix.ts | cartesian parameter sweeps + sensitivity | lib (steer/index) | REAL | Y | |
| pipeline.ts | steer stage pipeline runner | lib (steer/index) | REAL | Y | |
| privacyTiers.ts | telemetry sanitization by privacy tier | lib (steer/index, runtime/traceLogger) | REAL | Y | `validatePrivacyCompliance` genuinely re-checks the sanitized event |
| race.ts | fan out to N models, pick best by micro-score | lib (steer/index, runtime/wrapFetch) | REAL | Y | |
| thermostatCLI.ts | `amc steer` command catalog + runtime | lib (steer/index) | PARTIAL | Y | `STEER_CLI_COMMANDS` and `STEER_STUDIO_PANELS` describe `amc steer enable/disable/status/...` and Studio panels, and `generateSteerHelp()` renders help for them — but no `steer` command is registered anywhere in `src/cli.ts` or the `cli-*-commands.ts` files, and nothing outside `src/steer` imports this module. The help text documents a CLI surface that does not exist. |
| types.ts | steer pipeline types | lib (235 src importers) | REAL | Y | types only |

### src/steer/research

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| eval_autotune_classification.ts | confusion matrix + bootstrap CI for classifier | test-only | REAL | Y | runs the real `classifySteerContext` over a hand-labelled in-file corpus |
| eval_feedback_convergence.ts | feedback-loop convergence measurement | test-only | REAL | Y | header states up front that user profiles are synthetic |
| eval_hygiene_precision.ts | hygiene transform precision/recall | test-only | REAL | Y | |
| eval_scoring_calibration.ts | micro-score monotonicity/tier discrimination | test-only | REAL | Y | |
| index.ts | barrel export for the research evals | ORPHAN | DEAD | N | nothing imports it — the four tests each import their module directly, and no src file, script or dynamic `import()` references `steer/research/index` |

### src/eval

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| amcJudgeIntegration.ts | run LLM-judge metrics inside AMC test runs | ORPHAN | DEAD | N | no static import, no dynamic `import()`, no test anywhere in src/, tests/, api/ or scripts/ references `amcJudgeIntegration`. ~375 lines including a full `AMCJudgeTestRunner` and metrics-registry wiring that never executes. |
| costLatencyAssertions.ts | per-eval cost/latency/token assertions | test-only | REAL | Y | no product caller |
| customAssertionEngine.ts | user-supplied JS/Python grading functions | test-only | REAL | Y | really shells out to `python3` / evaluates JS; no product caller |
| effectAutoAgentReplayCorpus.ts | replay-corpus gate + CI receipt | lib (src/index) | REAL | Y | manifest hash covers full row content, so `verifyEffectAutoAgentReplayReceipt` is a genuine cross-object check |
| evalCli.ts | parse/dispatch `amc eval import` | CLI:`amc eval import/status` | REAL | Y | |
| evalImporters.ts | parse 7 eval-framework result formats | lib (evalCli, src/index) | REAL | Y | real per-format parsers writing to the ledger |
| evalRunCli.ts | `amc eval run` one-shot diagnostic | CLI:`amc eval run` | REAL | Y | |
| evaluatorRegistryMetadata.ts | signed inventory of loaded evaluators | CLI:`amc` (dynamic import at cli.ts:7081) | REAL | Y | fingerprints its own module bytes; claim boundary explicitly says it is not result evidence |
| extendedLLMJudge.ts | extra judge prompts on top of the base engine | lib (evaluatorRegistryMetadata) | REAL | N | reachable only through evaluatorRegistryMetadata; its other importer (amcJudgeIntegration) is dead |
| judgeCalibration.ts | judge-calibration gate + receipt | lib (src/index, api/scoreRouter, shieldRouter, watchRouter) | PARTIAL | Y | the gate arithmetic and hashing are real, but "signed evidence" is never verified: `hasSignedEvidence(ref)` returns true when `evidenceId` is non-empty, `eventHash.length === 64` and `writerSig` is any non-empty string. A receipt can pass `requireSignedEvidence` and report `replayable: true` with `writerSig: "x"`. |
| llmApiIntegration.ts | real OpenAI/Anthropic judge transport | lib (llmJudgeEngine, hallucination/llmJudge) | REAL | Y | real `fetch` calls, rate limiter, retries |
| llmJudgeEngine.ts | LLM-as-judge metric evaluation | lib (extendedLLMJudge, amcJudgeIntegration) | REAL | Y | previously a hardcoded 0.8 mock; now delegates to the real client, and the docstring records that |
| replayCorpusEvidenceReceipt.ts | fail-closed receipt for replay-corpus evidence | lib (src/index, diagnostic/evalReplayCorpusBoundary) | FACADE | Y | `ciReceiptPresent: isHashLike(ciReceiptHash)` where `ciReceiptHash = sha256Hex(canonicalize(result.ciReceipt))` is computed two lines earlier — `sha256Hex` always returns 64 hex chars, so this "CI receipt present" attestation is unconditionally `true` and reports nothing about whether a CI receipt exists. The sibling `manifestHashPresent`/`fixtureHashPresent` flags do check caller-supplied values, and the pass/fail decision itself is real. |

### src/notary

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| notaryApiTypes.ts | zod schemas for notary request/response | lib (notarySigner, notaryVerify, notaryServer) | REAL | N | |
| notaryAttestation.ts | build/sign/export attestation bundles | lib (notaryCli, notaryServer) | REAL | N | hashes real directory trees |
| notaryAuth.ts | HMAC request auth for the notary | lib (notaryServer, crypto/signer, trustConfig) | REAL | Y | timing-safe compare, skew window, body digest bound into the canonical string |
| notaryCli.ts | notary CLI commands | CLI:`amc notary …` | REAL | Y | |
| notaryConfigSchema.ts | notary config schema | lib (notaryConfigStore, notarySigner) | REAL | N | |
| notaryConfigStore.ts | notary paths + config load/save | lib (notaryServer, notarySigner, notaryLog, notaryCli) | REAL | Y | |
| notaryExternalSigner.ts | invoke an external signing subprocess | lib (notarySigner) | REAL | N | verifies the returned ed25519 signature against the returned key |
| notaryLog.ts | append-only hash-chained notary log + seal | lib (notaryServer, notaryCli) | REAL | Y | |
| notaryServer.ts | local notary HTTP/unix server | lib (src/index, notaryCli) | REAL | Y | |
| notarySigner.ts | file-sealed / external ed25519 signing | lib (notaryLog, notaryAttestation, notaryServer, notaryCli) | PARTIAL | N | signing itself is real (scrypt + AES-256-GCM sealed key, ed25519). `attestationLevel` is set to `"HARDWARE"` purely from the external signer subprocess's self-reported `claims.hardware === true` (line 212/227) — no hardware root of trust, TPM/Secure-Enclave quote or certificate chain is checked, yet downstream `signer.ts` rejects signatures for failing `requiredAttestationLevel === "HARDWARE"` on the strength of that boolean. |
| notaryVerify.ts | verify notary sign/attest responses | lib (notaryServer, crypto/signer, trustConfig) | REAL | Y | real digest, signature and fingerprint checks |

### src/config

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| amcConfigCli.ts | `amc config init/validate/show` | CLI (dynamic import at cli.ts:3999) | REAL | Y | |
| amcConfigLoader.ts | discover/load/validate amcconfig.yaml | lib (amcConfigCli, amcConfigRunner) | REAL | Y | |
| amcConfigRunner.ts | run the full pipeline from amcconfig.yaml | CLI (dynamic import at cli.ts:4030) | REAL | Y | calls the real diagnostic and assurance runners per agent |
| amcConfigSchema.ts | zod schema for amcconfig.yaml | lib (loader, runner, cli) | REAL | Y | |
| amcConfigSignature.ts | sign/verify .amc/amc.config.yaml | lib (workspace, ledger) | REAL | N | distinguishes "never signed" from "signature invalid" |
| configCli.ts | `amc config print/explain` | CLI (src/cli.ts) | REAL | N | calls the real signature verifiers for every subsystem config |
| configTypes.ts | studio runtime config types | lib (loadConfig, configCli) | REAL | N | types only |
| envSchema.ts | zod schema for AMC_* env vars | lib (loadConfig) | REAL | N | |
| loadConfig.ts | resolve studio runtime config from env | lib (src/cli.ts, configCli) | REAL | Y | supports `_FILE` secret indirection |

### src/crypto

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| keyHistoryChain.ts | hash chain over the key-history file | lib (crypto/keys, vault/vault) | REAL | N | chained entries must commit to their predecessor; unchained entries accepted only as a leading prefix. No test names this file. |
| keys.ts | key generation, signing, verification, history | lib (116 src importers) | REAL | Y | |

### src/crypto/signing

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| signatureEnvelope.ts | verify a signature envelope | lib (12 src importers) | REAL | N | recomputes the fingerprint from the embedded key, enforces trusted-key list and skew, then does a real ed25519 verify |
| signer.ts | vault-vs-notary signing policy | lib (12 src importers) | REAL | Y | real notary round-trip with fingerprint pinning and attestation-level enforcement |
| signerTypes.ts | signing kinds and envelope types | lib (7 src importers) | REAL | N | types only |
| signerVault.ts | sign a digest with the local vault key | lib (crypto/signer, trust/trustConfig) | REAL | N | |

### src/policyPacks

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| builtInPacks.ts | built-in archetype policy packs | lib (packCli, packApply, packDiff, pluginLoader, marketplace) | REAL | Y | packs are built from the real default policy/tools/budget generators and validated against `packSchema` |
| packApply.ts | write + sign all pack files, log transparency | lib (packCli) | REAL | Y | signs action/tools/budgets/alerts/approval/gate policies and appends a ledger receipt |
| packCli.ts | pack list/describe/diff/apply entry points | CLI:`amc pack …` (src/cli.ts, studio, mechanic) | REAL | Y | |
| packDiff.ts | preview what applying a pack would change | lib (packCli) | PARTIAL | Y | the diff itself is real, but the result fields named `beforeSha`/`afterSha` are produced by the local `simpleHash` — a 32-bit `hash*31 + charCode` folded to 8 hex chars, not SHA-256. A caller reading `beforeSha`/`afterSha` as content digests gets a trivially collidable value. |
| packSchema.ts | zod schema for a policy pack | lib (builtInPacks, pluginLoader) | REAL | N | |

### src/unified

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| index.ts | barrel export for `amc run` | CLI (dynamic import at cli.ts:5433, studio/oneCommandUp) | REAL | N | |
| unifiedRenderer.ts | terminal + CI rendering of the unified result | lib (unified/index) | REAL | Y | |
| unifiedRun.ts | run all 8 surfaces, grade each | CLI:`amc run` | REAL | Y | Score/Shield grades come from the real diagnostic and assurance runners; failures are reported as grade F rather than skipped |
| unifiedSurfaceInspection.ts | grade Enforce/Vault/Watch/Comply/Fleet/Passport | lib (unifiedRun) | REAL | Y | each surface score is driven by real signature-verification results |

### src/workorders

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| workorderCli.ts | parse action classes / risk tier for the CLI | CLI (src/cli.ts:292) | REAL | N | only referenced in tests through `vi.mock`, so nothing exercises it |
| workorderEngine.ts | create/verify/expire signed work orders | lib (cli.ts, ledger, execTicketVerify, approvals, toolhub) | REAL | Y | signs each work order with the auditor key and verifies against the key history |
| workorderSchema.ts | zod schema for a work order | lib (workorderEngine) | REAL | N | |

### src/artifact

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| artifactProvenance.ts | C2PA-inspired signed artifact provenance | lib (src/index) | REAL | Y | recomputes the artifact's own SHA-256 from disk before comparing, and verifies the signature against the auditor key history |

### src/badge

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| badgeCli.ts | shields.io maturity badge markup | lib (diagnostic/quickscoreShare) | PARTIAL | Y | The file header documents it as the `amc badge --agent <id> --run <runId>` command; no `amc badge` command exists — `amc export badge` and `amc passport badge` use `cert/badgeGenerator` and the passport store instead. Its one production caller passes `result.preliminaryLevel` from a quickscore, so the badge level is not bound to a run, evidence or signature; only the methodology hash in the URL is. |

### src/importers

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| neutralImporter.ts | detect/redact/import foreign trace + eval formats | CLI:`amc import …` + API:importerRouter | REAL | Y | real format detection, secret redaction, digesting, manifest writing and rollback |

## diagnostic & identity

### src/diagnostic

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| audits.ts | Regex/heuristic audit findings from evidence | lib (runner) | REAL | N | |
| autoAnswer/autoAnswerEngine.ts | Run diagnostic, derive auto-answers, optional plan | lib (index, mechanic, studio) | REAL | Y | |
| autoAnswer/autoAnswerEvidenceQueries.ts | Derive measured scores/coverage from a report | lib (autoAnswerEngine, autoAnswerTests) | REAL | Y | |
| autoAnswer/autoAnswerMappings.ts | Build auto-answer rules from bank gates | lib (autoAnswerEvidenceQueries) | REAL | Y | |
| autoAnswer/autoAnswerTests.ts | "Determinism probe" for auto-answer | test-only (universalAgentIntegrationLayer) | FACADE | Y | Fakes a determinism guarantee. `autoAnswerDeterminismProbe` calls the same pure function twice on the same object in the same process and returns both; the test asserts `JSON.stringify(a)===JSON.stringify(b)`. `deriveAutoAnswerResults` contains no `Date.now`/random/uuid, so the comparison is a value against a copy of itself and cannot fail. Proves nothing about run-to-run determinism. |
| autoAnswer/traceEvidenceMapper.ts | Map observability traces to question answers | test-only (diagnostic/traceEvidenceMapper.test.ts) | PARTIAL | Y | The mapping math is real, but its docstring claims "This enables `amc run --auto` to derive scores from REAL runtime data" and no module in `src/` imports it — `amc run --auto` goes through `runAutoAnswer` → `deriveAutoAnswerResults`, which never touches this file. It also emits answers for `AMC-3.1` and `AMC-3.2`, which do not exist in the question bank (the real IDs are `AMC-3.1.1`/`AMC-3.2.1`), so 2 of its 10 outputs could not bind to a question even if it were wired. |
| bank/bankApi.ts | Init/get/apply/verify diagnostic bank | lib (bankCli, studioServer) | REAL | N | |
| bank/bankCli.ts | CLI wrappers for bank API | CLI:`amc bank init/verify/print/apply` | REAL | N | |
| bank/bankLoader.ts | Load/save/sign `.amc/diagnostic/bank/bank.yaml` | lib (12 importers) | REAL | Y | `loadDiagnosticBank` does not verify the .sig before returning; verification is a separate opt-in call. |
| bank/bankSchema.ts | Zod schema for the diagnostic bank | lib (bank*, contextualizer) | REAL | N | |
| bank/bankV1.ts | Build default bank from questionBank | lib (bankLoader) | REAL | N | |
| calibration.ts | ECE/bin calibration of confidence vs outcome | lib (confidenceDrift) | REAL | N | "accuracy" is the documented proxy "level held in the next run", not ground truth. |
| componentConfidence.ts | Confidence broken out by subsystem | lib (index public API) | FACADE | Y | Fabricates a per-subsystem breakdown. `classifyQuestionToComponent` matches prose regexes (`/tool/i`, `/route/i`, `/memory/i`…) against the **question ID**; 0 of the bank's 244 IDs (`AMC-1.1`, `AMC-MEM-2`, …) match, verified by running the patterns over the bank. Every question therefore falls to the `else` branch and is pushed into all six components at `confidence*0.3`, so all six component scores are always the identical number, `evidenceCount` is always 0, and `trend` is always "stable" (its filter never matches either). `renderComponentConfidenceMarkdown` prints this as a per-component table. The only test uses an invented ID `q_tool_safety_1` that does match, and asserts nothing but `0<=score<=1` and array length; its "detects trends" case asserts only `components.length`. |
| confidenceControls.ts | Per-question confidence/uncertainty controls | lib (runner, autoAnswerEvidenceQueries) | FACADE | Y | Fakes a judge-agreement metric and a verification flag. `judgeAgreement = clamp(confidence + (unsupported ? -0.25 : 0.05) - flags.length*0.04)` — no second judge, grader or model is consulted anywhere; it is an affine transform of the same `confidence` it sits beside, and is surfaced as `averageJudgeAgreement` in `DiagnosticConfidenceSummary`. `presentationStatus: "verified"` is likewise assigned by threshold arithmetic with no verification step. Grep confirms this line is the sole producer of the field. |
| confidenceDrift.ts | Per-question confidence drift across runs | lib (score/index) | REAL | Y | |
| contextualizer/agentProfile.ts | Zod schema for the agent profile | lib (contextualizer, profileResolver) | REAL | N | |
| contextualizer/contextualizer.ts | Render bank questions tailored to an agent | lib (contextualizerCli, studioServer) | PARTIAL | Y | The "contextualization" is thinner than the name: `howThisApplies` is one of six fixed boilerplate sentences chosen by agent type (from bankV1's `contextualLine`), and `tailoredEvidenceExamples` is three fixed lines with the model/tool family names substituted. Nothing is per-question. |
| contextualizer/contextualizerCli.ts | CLI render to json/md | CLI:`amc diagnostic contextualize` | REAL | N | |
| contextualizer/profileResolver.ts | Derive agent profile from ledger/config | lib (contextualizer) | REAL | N | |
| controlClassification.ts | Tag controls ARCHITECTURAL/POLICY/CONVENTION | CLI:`amc control-classification`, lib (l5DeltaReport) | FACADE | N | Fabricates the entire enforcement report. `DEFAULT_SUB_CONTROLS` is keyed `"q-01"`…`"q-10"`; `questionBank` IDs are `AMC-*`, so `getSubControls(q.id)` never hits the map and every one of the 244 questions receives the single fallback `{enforcementLevel:"CONVENTION", description:"No specific architectural enforcement mapped"}`. Consequences are structural, not data-dependent: `architectural` and `policyEnforced` are always 0, `architecturalRatio` always 0, `dominantLevel` always CONVENTION, and `progressionScore` is always exactly 1/3 (rawScore=n*1, maxScore=n*3). The 20 hand-written sub-controls (ledger hash chain, merkle proof, lease system…) are unreachable dead data. `renderControlClassificationMarkdown` prints "Progression score: 33.3%" as a measurement. |
| evalReplayCorpusBoundary.ts | Fail-closed surface readiness from a receipt | lib (index public API) | REAL | Y | |
| evidenceDrilldown.ts | Build evidence drilldown view for the console | lib (console/assets/app.js) | REAL | Y | |
| evidenceReadiness.ts | Claim-eligibility gate for a run | lib (runner, brief, lifecycle, studio) | REAL | Y | |
| fullDiagnostic.ts | Interactive full-bank survey scoring | CLI (dynamic import in cli.ts:3296) | REAL | Y | Self-report survey; honestly presented as such. |
| gates.ts | Evaluate per-level evidence gates | lib (runner, correlate, fleet, watch) | REAL | Y | Reads only `payload_inline`; the runner hydrates blob payloads before calling, so the blob case is covered. |
| identityStability.ts | Behavioral consistency index across sessions | lib (index public API) | PARTIAL | Y | Math is real and the `provenanceTag` docstring is honest about not being a signature, but nothing in `src/` ever constructs a `BehavioralTrace` — grep finds producers only in `index.ts` re-exports and the test. The feature cannot run from any AMC code path. |
| knownUnknowns.ts | List what AMC cannot determine per run | lib (index public API) | REAL | Y | |
| l5DeltaReport.ts | L4→L5 gap report per question | CLI:`amc l5-delta` (dynamic import) | FACADE | N | Fabricates per-question requirements and enforcement counts. `L5_REQUIREMENTS` is keyed `"q-01"`…`"q-05"` against `AMC-*` question IDs, so `getL5Requirements` always returns the same generic fallback — every one of the 244 rows prints the identical "missing capabilities" and "required evidence" lists as if bespoke. It also consumes `classifyControls()` (see controlClassification), so `summary.architecturalCount` and `policyEnforcedCount` are structurally always 0 and `conventionCount` always equals the question count. |
| liveEvidenceProjection.ts | Declared harness-fact → question bindings | lib (tools/toolEvidence) | REAL | Y | Unusually explicit about what it declines to claim. |
| longitudinalTracking.ts | Time-series trend/regression on scores | lib (index public API) | PARTIAL | Y | Linear-regression math is real, but no code in `src/` builds a `ScoreDataPoint`; grep finds only the `index.ts` re-export. Unreachable from the product. |
| metaConfidence.ts | Confidence in the maturity score itself | lib (index, confidenceGovernor) | PARTIAL | Y | Two of the five "independent" factors are the same measurement: `evidenceVolume = min(1, ids.length/10)` and `evidenceDiversity = min(1, new Set(ids).size/5)`. On a list of unique event IDs those differ only by scale, so "diversity" adds no signal; the code comment concedes it uses "evidence count as proxy for diversity". |
| methodologyVersioning.ts | Field-presence receipt over the methodology manifest | lib (runner) | REAL | Y | |
| nonInteractiveQuickscore.ts | Refuse to fabricate a score without a TTY | CLI:`amc quickscore` | REAL | Y | Explicitly refuses to emit a placeholder L0. |
| questionBank.ts | 244 diagnostic question seeds + gate builder | lib (43 importers) | REAL | Y | 244 questions but only 33 individually specialized gates plus 4 set-based ones; the large majority share the generic base gate. |
| questionExplain.ts | Human explanation of a question | CLI (dynamic import in cli.ts:3466) | REAL | Y | |
| questionScoreExplainability.ts | Per-question explainability rows + row hashes | lib (runner, guideGenerator, passportCollector) | PARTIAL | Y | Two unearned claims. `surfaces: unique([...(q.surfaces ?? ["Score"]), "Shield", "Watch"])` appends Shield and Watch to *every* question regardless of what the question declares. `signedEvidenceRef()` copies `writer_sig` into a struct named `QuestionScoreSignedEvidenceRef` without verifying it — the report field `signedEvidenceRefs` reads as "verified" but is a copy. |
| questionSets.ts | Named/versioned question sets + industry weights | lib (scoreStore, fullDiagnostic, quickScore, runner) | REAL | Y | |
| quickScore.ts | 10-question tiered self-report score | lib (startupGuidance) | REAL | Y | |
| quickscoreShare.ts | Shareable markdown/badge for a quickscore | lib (rapidQuickscore consumers) | PARTIAL | Y | Emits a public "AMC Maturity Score" badge and markdown from a 5-question self-assessment with no trust label or claim boundary — unlike `reportShare.ts`, which carries `trustLabel`, `evidenceStatus` and `claimBoundary`. |
| rapidQuickscore.ts | 5-question rapid self-assessment | lib (quickscoreShare, guide/fixCli, oneClickFix) | REAL | Y | Result field is named `preliminaryLevel`. |
| reportShare.ts | Signed/labelled share bundle for a run | CLI:`amc report ... --share`, lib (prospectDemo) | REAL | Y | Carries claim boundary + trust label. |
| riskTiers.ts | Risk-tier evaluation profiles + auto-detect | lib (index public API) | PARTIAL | N | Docstring says it "Configures evaluation depth based on agent risk tier", but grep shows `RISK_TIER_PROFILES`, `getRiskTierProfile` and `maxQuestions`/`assurancePacks`/`evidenceDepth`/`evaluationTimeoutMs`/`requireSignature` have no consumer anywhere except the `index.ts` re-export — the profiles configure nothing. `autoDetectRiskTier`'s `confidence` is also fabricated: 0.9/0.7/0.5 purely from how many factors fired. |
| runAliases.ts | Named aliases for run IDs | CLI:`amc run --alias`, lib (runner) | REAL | Y | |
| runner.ts | The diagnostic engine; scores a run from evidence | CLI:`amc run`, lib (28 importers) | FACADE | Y | `runDiagnostic` itself is real and heavily tested — the facade is `compareModels()` (line 2138), wired to `amc compare-models` and to `amc demo prospect`'s script. It loops over the caller's model list and calls `runDiagnostic({workspace, window, targetName, agentId, claimMode})` once per model **without ever passing the model**, so every entry in `comparisonMatrix` is the same diagnostic over the same workspace evidence, merely relabelled. It then computes `bestModel`, `worstModel` and `significantDifferences` deltas across those copies. The `options.iterations` parameter is accepted and never read. The in-code comment says the quiet part: "For now, we'll simulate running with different models / In a real implementation, this would involve: 1. Configuring the agent to use the specific model…". |
| selfCalibration.ts | ECE/Brier/log-loss confidence quality | lib (index public API) | REAL | Y | |
| spineEvidenceProjection.ts | Project delegation facts into tagged evidence | lib (agent/delegationEvidenceWriter) | REAL | Y | Explicitly refuses to count an all-classes scope as scope evidence. |

### src/identity

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| hostVault.ts | Encrypted host keypair/secret vault | lib (identityCli, identityConfig, session) | REAL | N | |
| identityApi.ts | Local login / session context / logout | API:workspaceRouter | REAL | N | |
| identityCli.ts | CLI to init config, add providers, SCIM tokens | CLI:`amc identity ...` | PARTIAL | Y | `identityProviderAddSamlCli` writes `security.wantAssertionsSigned:true` and `wantResponseSigned:true` into the config; grep shows nothing anywhere reads either flag. It also takes `--idp-cert-file` and stores it as `idpCertPem`, which `samlVerify` then feeds to `crypto.verify(null, …)` as a raw Ed25519 key — an actual X.509 IdP certificate throws there and is swallowed as `{ok:false}`. |
| identityConfig.ts | Signed identity config, SCIM bearer tokens | lib (13 importers) | REAL | Y | `loadIdentityConfig` does not verify the signature, but `workspaceRouter` calls `verifyIdentityConfigSignature` separately. |
| oidc/jwtVerify.ts | Verify OIDC id_token (JWKS, alg, exp, aud, nonce) | lib (oidcClient, oidcRoutes) | REAL | Y | Rejects `alg:none`; allows only RS256/EdDSA. When the header carries a `kid` but the JWKS entries have none, the predicate falls through to the first key rather than rejecting. |
| oidc/oidcClient.ts | Auth URL + PKCE + code exchange | lib (oidcRoutes) | REAL | N | |
| oidc/oidcRoutes.ts | OIDC login start / callback → session | API:workspaceRouter | PARTIAL | N | Standards-correct (state, nonce, PKCE S256, `email_verified` required), but `pendingStates` is a module-level `Map` — state does not survive a restart and is not shared across processes, so a multi-worker or restarted host fails every callback with "OIDC state mismatch". |
| oidc/pkce.ts | PKCE verifier + S256 challenge | lib (oidcClient) | REAL | N | |
| roleMapping.ts | Map SSO claims to host/workspace roles | lib (oidcRoutes, samlRoutes, scimGroups) | REAL | N | |
| saml/samlRoutes.ts | SAML SP metadata, login start, ACS | API:workspaceRouter | FACADE | N | Advertises SAML 2.0 and speaks something else. `samlMetadataXml()` publishes genuine SAML 2.0 SP metadata (`urn:oasis:names:tc:SAML:2.0:metadata`, `protocolSupportEnumeration=...:2.0:protocol`, `WantAssertionsSigned="true"`), and the query/POST parameters are named `SAMLRequest`/`SAMLResponse` — but `startSamlLogin` base64s a **JSON** object as the SAMLRequest, and `completeSamlAcs` calls `parseCompactSamlResponse` → `JSON.parse` on the SAMLResponse. A real IdP's base64 XML response fails `JSON.parse`, so no genuine SAML IdP can ever complete login against this SP. The configured `saml.claims` attribute map is also never read; subject/email/groups are hardcoded field reads. |
| saml/samlVerify.ts | "Verify a SAML assertion" | lib (samlRoutes) | FACADE | N | Not SAML. There is no XML, no XML-DSig, no X.509 path validation and no `<Assertion>` — it `JSON.parse`s a base64 blob into `CompactSamlAssertion` and calls `crypto.verify(null, canonicalize(payload), idpCertPem, sig)`, i.e. a raw Ed25519 signature over canonical JSON. The signature check itself is real, but it verifies a private format under the name of a standard the code advertises support for (see samlRoutes). |
| scim/scimAuth.ts | SCIM bearer-token + HTTPS enforcement | lib (scimRoutes) | REAL | N | |
| scim/scimGroups.ts | SCIM group CRUD + role grant application | lib (scimRoutes) | REAL | N | |
| scim/scimPatch.ts | Parse SCIM PATCH operations | lib (scimRoutes) | REAL | N | |
| scim/scimRoutes.ts | SCIM 2.0 endpoint dispatch | API:workspaceRouter | REAL | N | `/ServiceProviderConfig` advertises `filter: { supported: true, maxResults: 200 }`; see scimUsers for what is actually supported. |
| scim/scimTypes.ts | SCIM list/error envelope helpers | lib (scimRoutes, scimUsers) | REAL | N | |
| scim/scimUsers.ts | SCIM user list/CRUD/patch | lib (scimRoutes) | PARTIAL | N | Filter support is two patterns only. `scimListUsers` handles `userName eq "x"` and `externalId eq "x"`; every other filter falls to `where = "WHERE 1 = 0"` and returns an empty 200 list rather than a 400. Combined with the `filter: supported: true` advertisement in scimRoutes, an IdP issuing e.g. `filter=active eq true` sees zero users and can conclude the directory is empty. |
| session.ts | Issue/verify signed identity session tokens | lib (sessionStore) | REAL | N | |
| sessionCookie.ts | HttpOnly/SameSite session cookie helpers | lib (identityApi) | REAL | N | |
| sessionStore.ts | Session rows, revocation, user resolution | lib (identityApi, oidcRoutes, samlRoutes) | REAL | N | |

### src/transparency

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| logChain.ts | Append-only signed transparency log | lib (52 importers), CLI via logCli | PARTIAL | Y | Append/verify/seal logic is real and fails loud on Merkle lag. `verifyTransparencyBundle(bundleFile)` is self-certifying: it verifies the seal signature against `auditor.pub` **extracted from the same bundle**, with no way to pass a pinned key, so a wholly forged bundle signed with an attacker keypair returns `ok:true`. `sessionAnchorVerify.ts`'s own header names this exact circularity and requires an out-of-band fingerprint; this path does not. |
| logCli.ts | Re-export barrel for log operations | CLI:`amc transparency log ...` | REAL | Y | Pure re-export. |
| logSchema.ts | Zod schemas for entries/seal/signature | lib (logChain, merkleIndexStore, sessionAnchor) | REAL | Y | |
| merkle.ts | Leaf/node hashing, root, proof, verify | lib (benchProofs, merkleFrontier, merkleIndexStore, sessionAnchorVerify) | REAL | Y | |
| merkleFrontier.ts | O(log n) incremental Merkle frontier | lib (merkleIndexState, merkleIndexStore) | REAL | Y | Pure; equivalence with full rebuild is testable and tested. |
| merkleIndexState.ts | Frontier/pending-marker persistence + resume checks | lib (merkleIndexStore) | REAL | Y | Treats the cache as attacker-writable and re-validates shape against leaf count. |
| merkleIndexStore.ts | Merkle index, signed roots, inclusion proofs | lib (15 importers), CLI via transparencyMerkleCli | PARTIAL | Y | `verifyTransparencyMerkle` is thorough (recomputes root from the log, binds leaf count and last-entry hash). `verifyTransparencyProofBundle(bundleFile)` has the same self-certification hole as logChain: `requireTrustedKey: true` is satisfied by `auditor.pub` read out of the bundle being verified, so a self-consistent forged proof bundle passes. |
| merklePaths.ts | Single home for merkle store file paths | lib (merkleIndexState, merkleIndexStore, sessionAnchorProof) | REAL | Y | |
| proofSchema.ts | Zod schemas for proof payload/signature | lib (merkleIndexStore, sessionAnchorProof, sessionAnchorSchema) | REAL | N | |
| sessionAnchor.ts | Anchor a closed session's root into the log | lib (sessionAnchorProof) | REAL | Y | Refuses to anchor a session that does not verify. |
| sessionAnchorProof.ts | Build/export an offline session anchor proof | CLI (dynamic import in cli-session-commands.ts:198) | REAL | Y | |
| sessionAnchorSchema.ts | Zod schemas for descriptor/proof/root row | lib (sessionAnchor, sessionAnchorProof, sessionAnchorVerify, sessionRootDescriptor) | REAL | Y | |
| sessionAnchorVerify.ts | Offline verification of a session anchor proof | lib (sessionAnchorProof) | REAL | Y | The strongest verifier in the slice: no workspace imports, every rule evaluated, and `expectedAuditorKeyFingerprint` is a required out-of-band pin. |
| sessionRootDescriptor.ts | Recompute + verify a session's root descriptor | lib (sessionAnchor, sessionAnchorProof) | REAL | Y | Recomputes the root from seal rows instead of trusting the close event's claim. |
| transparencyMerkleCli.ts | CLI wrappers for merkle rebuild/root/proof | CLI:`amc transparency merkle ...` | REAL | N | |
| transparencyReport.ts | Public agent transparency report | lib (amcMcpServer, transparencyReportCli) | PARTIAL | Y | Derives from the real run/BOM, but `topPriorities[].impact` fabricates a quantitative forecast: `"Raises overall trust score by ~${Math.round((3 - dim.level) * 15)} points"` is an invented constant, not a modelled or measured uplift. |
| transparencyReportCli.ts | Register transparency-report commands | CLI:`amc transparency report` | REAL | Y | |

### src/claims

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| claimConfidence.ts | Citation-backed per-claim confidence | lib (index public API) | PARTIAL | Y | `CitationQualityScore.highestTrustTier` is documented as "Highest trust tier among evidence" but is read straight off `claim.trustTier` — the cited events are never inspected for it ("Use the claim's trust tier as the best info we have"). That self-declared tier carries 15% of the citation-quality score, so a claim partly grades its own citations. |
| claimExpiry.ts | TTL/staleness detection, append-only expiry | lib (score/index) | REAL | Y | |
| claimFactory.ts | Build a signed Claim from a QuestionScore | ORPHAN | DEAD | N | Nothing in `src/`, `api/`, `scripts/` or `tests/` imports it — checked against a full import index plus dynamic `import()` grep. Also worth noting if revived: `getTrustTierFromEvidence` labels evidence `OBSERVED` purely because `evidenceCount >= 2` and no flag string contains "unverified"/"limited". |
| claimLifecycle.ts | State transitions with gate + signing | test-only (valuesObservabilityCorrections) | PARTIAL | Y | Deprecate/revoke paths pass `{ minDistinctSessions: 1 } as QuarantinePolicy` — a cast fabricating a full policy object. More seriously, its promotion path calls `evaluatePromotion` (see promotionGate) which can never return `allowed:true`, so `transitionClaim` throws `"Promotion not allowed: "` with an empty reason for every QUARANTINE→PROVISIONAL and PROVISIONAL→PROMOTED transition. The one test that covers it mocks `evaluatePromotion` to `{allowed:true}`, so the defect is invisible. |
| claimStore.ts | SQLite append-only claim + transition store | lib (claims/*) | REAL | Y | Tables/triggers live in ledgerSchema.ts. |
| claimTypes.ts | Claim/transition type model | lib (claims/*, types.ts) | REAL | N | Types only. |
| claimVerify.ts | Verify claim signature, hash, chain, provenance | ORPHAN | DEAD | N | Real Ed25519 + hash-chain verification, but no importer anywhere in `src/`, `api/`, `scripts/` or `tests/` — the claim signatures written by claimStore are never checked by anything. |
| confidenceDrift.ts | Confidence drift over claim history | lib (score/index) | REAL | Y | |
| contradictions.ts | Detect claim-vs-claim contradictions | ORPHAN | DEAD | N | No importer; `amc fleet contradictions` resolves to `src/fleet/contradictionDetector.ts`, a different module with the same export name. Also worth noting if revived: `computeContradictionSignature` returns `sha256Hex(canonical)` and assigns it to a field named `signature` — a bare digest with no key, which any tamperer can recompute. |
| governanceLineage.ts | Link claim transitions to transparency + policy | lib (index public API) | REAL | Y | |
| promotionGate.ts | Gate claim promotion on cross-session evidence | lib (claimLifecycle) | FACADE | N | Compares a value against a copy of itself, making the whole evidence gate unreachable. `evaluatePromotion` sets `const requestedState = claim.lifecycleState`, i.e. the requested state IS the current state, then tests `validTransitions[currentState]?.includes(requestedState)`. No state appears in its own transition list (`QUARANTINE: ["PROVISIONAL","EXPIRED","REVOKED"]`), so `isValidTransition` is always `false` and the function always returns at "Invalid state transition from X to X" with `missingCriteria: []`. Checks 5 and 6 — the documented `minEvidenceEvents`, `minDistinctSessions`, `minDistinctDays`, `requireObservedEvidence`, `minConfidenceForPromotion` criteria — are dead code that never executes, while the returned `evidenceSummary` is presented as an evidence evaluation. |
| quarantine.ts | Quarantine policy load/save/verify | lib (claimLifecycle, promotionGate) | REAL | N | Signature verification is real; the policy it guards feeds the broken gate above. |

### src/storage

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| blobs/blobCli.ts | Blob key init/rotate, verify, re-encrypt | CLI:`amc blobs ...` | REAL | N | |
| blobs/blobEncryptor.ts | AES-256-GCM blob envelope encode/decode | lib (blobCli, blobStore) | REAL | N | Real AEAD with AAD binding blobId+keyVersion. |
| blobs/blobKeys.ts | Blob key material, rotation, signed key metadata | CLI + lib (blobCli, blobStore) | REAL | Y | |
| blobs/blobSchema.ts | Zod schemas for blob index/key rows | lib (blobKeys, blobStore) | REAL | N | |
| blobs/blobStore.ts | Encrypted blob store + signed hash-chained index | lib (10 importers) | REAL | Y | Signed chain head is compared against the index's real last-row hash. |
| blobs/blobVerify.ts | Verify blob chain against ledger references | lib (blobCli) | REAL | N | |
| consolidation/guardEventConsolidation.ts | Dual-write/compare/backfill guard events | lib (enforce/evidenceEmitter) | REAL | Y | Comparison genuinely can report a difference; the code says so and does it. |
| nativeGuard.ts | Rebuild better-sqlite3 on ABI mismatch | side-effect import in cli.ts:2 | REAL | N | Not orphaned despite having no `from`-import; `import "./storage/nativeGuard.js"` is the first line of cli.ts. |
| sqlitePool.ts | Pooled SQLite connections | lib (scoreStore, ledger, scoreHistory) | REAL | Y | |
| workspaceRecordStore.ts | Signed, hash-chained workspace record store | lib (falsePositiveTracker, dataResidency, canaryRegisters, cognitionLab) | PARTIAL | N | Writes `prev_record_hash`, `record_hash` and `signature` and its docstring says "the chain still detects tampering" — but grep for `record_hash`/`prev_record_hash` across `src/` returns hits only inside this file. `loadWorkspaceRecords` parses the JSON and ignores both fields, and no verify function exists, so nothing ever detects the tampering the chain is there to detect (this is the store legal holds and residency policies live in). |

### src/drift

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| alerts.ts | Signed alert config + webhook dispatch | CLI + lib (driftDetector, driftRules, watch, policyPacks) | REAL | Y | Refuses to dispatch when the alerts config signature is invalid. |
| continuousMonitor.ts | Anomaly, injection, pollution, tool-change detection | lib (index, watch/*) | REAL | Y | Real z-score baselines and regex detectors. |
| driftCli.ts | CLI for drift check/report and freeze | CLI:`amc drift ...`, `amc freeze ...` | REAL | N | |
| driftDetector.ts | Compare runs, raise incidents, dispatch alerts | lib (dashboard, monitors, forecast, driftCli) | REAL | Y | |
| driftReport.ts | Render incidents as markdown | lib (driftCli) | REAL | N | |
| driftRules.ts | Evaluate configured drift rules against two runs | lib (driftDetector) | REAL | N | Missing assurance packs are treated as a trigger (fail-closed). |
| freezeEngine.ts | Signed freeze incidents and lift records | lib (13 importers) | PARTIAL | N | Incident creation, `verifyIncidentSignature` and `liftFreeze` are real, but `isLifted()` is `pathExists(<incidentId>.lift.json)` — the lift file's own signature is never verified. Anyone who can write an empty file into `.amc/agents/<id>/incidents/` clears an auditor-signed freeze, and `activeFreezeStatus` then reports `active:false` on that basis. |

### src/canon

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| canonApi.ts | Init/get/apply/verify the compass canon | lib (canonCli, studioServer) | REAL | N | |
| canonBuiltin.ts | Build the built-in canon from questionBank | lib (canonLoader) | REAL | N | |
| canonCli.ts | CLI wrappers for canon API | CLI:`amc canon init/verify/print` | REAL | N | |
| canonLoader.ts | Load/save/sign canon.yaml + plugin extensions | lib (11 importers) | REAL | Y | `loadCanon` returns the parsed canon without checking the .sig; verification is a separate call (`verifyAll`, studio, CLI). |
| canonSchema.ts | Zod schema with cross-checks against questionBank | lib (canon/*) | REAL | N | `superRefine` genuinely fails on dimension count mismatch, duplicate IDs, or any missing bank question ID. |

### src/e2e

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| smoke.ts | Local/docker/helm end-to-end smoke runs | lib (smokeCli) | REAL | N | Real bootstrap, gateway, ledger, docker compose and helm subprocesses; PASS/FAIL derived from actual step outcomes, and an early FAIL still lands in `steps` so `hasFail` catches it. No `tests/` coverage — exercised only via `npm run test:e2e`. |
| smokeCli.ts | Run smoke and format the report | CLI:`amc e2e smoke` | REAL | N | |
| smokeSchema.ts | Zod schema for smoke steps/report | lib (smoke, smokeCli, smokeSteps) | REAL | N | |
| smokeSteps.ts | Step runner, port picker, fake OpenAI upstream | lib (smoke) | REAL | N | |

### src/demo

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| demoRun.ts | Run a live demo through an ephemeral gateway | CLI:`amc demo run` (dynamic import) | FACADE | Y | Produces a maturity score from an arithmetic formula, under a command described as producing a real one. `demoMaturityScore(requestsSent, evidenceItems)` returns `min(86, max(35, 42 + requestsSent*2 + evidenceItems))` and maps it to `maturityLevel` L0–L5; nothing about the agent is assessed. Because `runDemo` always sends exactly 10 fixed conversations, the request term is constant, so the "score" is a fixed offset plus a ledger row count, clamped into [35, 86] — it can never leave L2–L4. The CLI registers this as `.description("Run a simulated agent through the AMC gateway and produce a real score")`. Mitigation: the JSON carries `demoOnly:true`/`trustLabel:"DEMO_ONLY"` and the TTY output says "Demo maturity sample" plus "not production audit evidence". The gateway traffic and ledger event count are genuine. |
| gapDemo.ts | Scripted keyword-vs-execution scoring illustration | CLI:`amc demo gap` (dynamic import) | REAL | N | Every claim, test and score is a fixed literal, and the module header, the command description and the printed banner all say so ("Scripted illustration — no agent is executed; all figures are fixed examples"). Honest by construction. |
| prospectDemo.ts | Five-minute prospect demo script + share bundle | CLI:`amc demo prospect/share` (dynamic import) | PARTIAL | Y | Carries `trustLabel:"DEMO_ONLY"` and a claim boundary, but when no live run is supplied `sampleScore` falls back to `demoMaturityScore(10, 20)` — a fixed 82/L4 manufactured from hardcoded inputs (see demoRun). Its step 4 also advertises `amc compare-models` as "Surfaces model comparison", which is the facade in runner.ts. |

### src/ci

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| gate.ts | Signed CI gate policy + bundle-backed evaluation | CLI:`amc ci ...`, lib (certificate, policyPacks, whatIf) | REAL | Y | Verifies the evidence bundle and the policy signature before evaluating, and every threshold can genuinely fail. |
| redteamGate.ts | Red-team CI gate with severity thresholds | CLI (dynamic import at cli.ts:10614) | REAL | Y | Skips gaming-resistance scoring where it cannot apply rather than failing consumers for not being AMC. |

### src/bootstrap

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| bootstrap.ts | One-shot workspace/vault/notary/log bootstrap | CLI:`amc bootstrap`, lib (smoke, hostBootstrap) | PARTIAL | N | Everything it does is real, but the transparency anchor commits to a digest the artifact cannot reproduce: the report is written with `JSON.stringify(report, null, 2)` while `reportDigest = sha256Hex(JSON.stringify(report))` (no indent). The `BOOTSTRAP_COMPLETED` entry's `artifact.sha256` therefore never matches the hash of `bootstrap_<ts>.json` on disk, so the anchor cannot be verified against the file it names. |

### src/ingest

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| ingest.ts | Ingest external logs; record attestations | CLI:`amc ingest ...` | REAL | Y | Previously a trust-tier facade and now fixed with the history documented in-file: `attestIngestSession` requires a named `attestedBy` and `statement`, and records ATTESTED rather than claiming OBSERVED. |

## api & wire

### src/api

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| accessPolicy.ts | Path/method → required role table | lib (studio/apiDelegation) | REAL | Y | |
| adaptersRouter.ts | Adapter integration routes | API:router (api/index) | REAL | Y | |
| agentTimelineRouter.ts | GET /agents/:id/timeline | API:router | REAL | Y | |
| apiCli.ts | `amc api` route listing + server | CLI:`amc api` | REAL | Y | |
| apiHelpers.ts | Body parse, path/query params, responses | lib (41 routers) | REAL | Y | 1 MB body cap, `__proto__`/`constructor` stripped |
| assuranceRouter.ts | Assurance pack + control-plane routes | API:router | REAL | Y | |
| benchmarkRouter.ts | Benchmark store/export/verify routes | API:router | REAL | Y | |
| bomRouter.ts | BOM/SBOM/badge/bundle routes | API:router | REAL | Y | |
| canaryRouter.ts | Policy canary routes | API:router | REAL | Y | |
| ciRouter.ts | CI gate routes | API:router | REAL | Y | |
| complianceRouter.ts | Compliance/policy/waiver routes | API:router | REAL | Y | |
| configRouter.ts | Runtime config + logs routes | API:router | REAL | Y | |
| cryptoRouter.ts | Notary/cert/merkle/receipt routes | API:router | REAL | Y | |
| domainProofRouter.ts | Domain Proof Lane check routes | API:router | REAL | N | `/proof/status` is a static literal, but carries an explicit `nonClaim` field |
| driftRouter.ts | Drift/freeze/alert routes | API:router | REAL | Y | |
| enforceRouter.ts | Policy enforcement routes | API:router | REAL | Y | `/enforce/status` hardcodes `status:'operational'` — cannot report degraded |
| evidenceRouter.ts | Evidence lifecycle + export routes | API:router | REAL | Y | `/evidence/status` hardcodes `status:'operational'` |
| exportRouter.ts | Export/attest routes | API:router | REAL | Y | |
| firewallRouter.ts | Runtime firewall routes | API:router | REAL | N | |
| fixerRouter.ts | RCA/repair proposal routes | API:router | REAL | N | |
| fleetRouter.ts | Fleet registry/lifecycle/freeze routes | API:router | FACADE | Y | `GET /fleet/freeze/status` catch block (line 246) swallows ANY error from `activeFreezeStatus` and returns `{ok:true, active:false}` — an unreadable/corrupt freeze store is reported as "no execution freeze is active". Fail-open on a safety interlock |
| gatewayRouter.ts | Gateway/LLM-proxy routes | API:router | REAL | Y | |
| governorRouter.ts | Governor/oversight/mode routes | API:router | REAL | Y | |
| health.ts | Health payload from real DB pings | lib (api/index, studioServer) | REAL | N | Actually opens ledger + score DB and runs `SELECT 1` |
| identityRouter.ts | Identity/SCIM token routes | API:router | REAL | Y | |
| importerRouter.ts | Neutral importer routes | API:router | REAL | N | |
| incidentRouter.ts | Incident ops routes | API:router | REAL | Y | |
| index.ts | Route registry + dispatcher | lib (cli, studio, dashboard) | PARTIAL | Y | `auth:'protected'` and `validationPolicy` are declarative metadata `handleApiRoute` never consults; enforcement lives only in `src/studio/apiDelegation.ts`. `src/dashboard/serve.ts:156` calls `handleApiRoute` directly for `/api/v1/guardrails/*` with no token and no `resolveApiRolePolicy` check (GETs unauthenticated), even though accessPolicy classes `/api/v1/guardrails` as OWNER |
| memoryRouter.ts | Maturity/integrity/correction memory routes | API:router | REAL | Y | |
| metricsRouter.ts | Metrics/SLO/index routes | API:router | REAL | Y | |
| observeRouter.ts | Observe timeline read routes | API:router | REAL | Y | `/observe/status` hardcodes `status:'operational'` |
| orgRunRouter.ts | Org run/lifecycle routes | API:router | REAL | N | |
| passportRouter.ts | Agent passport routes | API:router | REAL | Y | |
| productRouter.ts | Batch + portal routes | API:router | REAL | Y | State is SQLite-backed, so per-request `new BatchProcessor()` is fine; `/product/status` is a static literal |
| runtimeRouter.ts | Runtime run-manager routes | API:router | REAL | N | |
| sandboxRouter.ts | Sandbox run + docker-args routes | API:router | REAL | Y | |
| scoreRouter.ts | Scoring/diagnostic/quickscore routes | API:router | REAL | Y | Largest router (957 lines); all scoring delegates to diagnostic/score modules |
| scoreStore.ts | SQLite store for score sessions | lib (scoreRouter, health, studioServer) | REAL | Y | Validates question ids against the bank and clamps 0–5 |
| securityRouter.ts | ATO/taint/secrets/threat-intel routes | API:router | FACADE | Y | `POST /security/adversarial` (line 249) runs `testGamingResistance(body.answers ?? { q1: body.agentId })` — with no `answers` the gaming-resistance verdict is computed from the agent's own id as the single answer, which contains no gaming keywords and no evidence markers, so the endpoint always returns a clean pass. A score computed from a hardcoded input. (The lab-pack routes in the same file correctly fail closed with 503.) |
| shieldRouter.ts | Shield scan/red-team/drift routes | API:router | REAL | Y | Two `/status` handlers hardcode `status:'operational'` |
| strategyRouter.ts | Inference-strategy compare routes | API:router | REAL | N | |
| toolsRouter.ts | Tools/plugins/guardrails routes | API:router | REAL | Y | |
| vaultRouter.ts | Vault/DLP/key/zk routes | API:router | REAL | Y | The zk endpoints attach `zeroKnowledge:false` + an explicit "unsound, do not present as evidence" warning to every response — honest about the broken module underneath |
| watchRouter.ts | Watch/guardrail/monitoring routes | API:router | FACADE | Y | `GET /watch/host-hardening` (line 477) catches any failure of `runDoctorCli` and returns `{ok:true, checks:[]}` — a host-hardening report that says OK having performed zero checks. Also `/watch/governor-check` defaults missing query params to the most permissive triple (`READ_ONLY`/`low`/`SIMULATE`) |
| workflowRouter.ts | Work order/ticket/lifecycle routes | API:router | REAL | Y | |

### src/wire

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| ndjsonFraming.ts | Split byte stream into NDJSON records | lib (wireDispatcher, wireClient, acpConnection) | REAL | Y | Emits copies not subarray views; overflow latches rather than resyncs |
| wireCli.ts | `amc wire` unix-socket server command | CLI:`amc wire` | REAL | N | Seals the intake ledger session on `exit`; states SIGKILL/power-loss gap plainly |
| wireClient.ts | TypeScript client for the wire | test-only | REAL | Y | No `src/` importer and not re-exported from `src/index.ts` — a client library with no production consumer. Also imports `WORK_STATES` as a value but only uses the `WorkState` type |
| wireCodecs.ts | Single zod declaration per method, both ends | lib (wireMethods, wireClient) | REAL | Y | |
| wireDispatcher.ts | Bytes→replies message loop, per-message lease auth | lib (wireListener) | REAL | Y | Deliberately treats an unverifiable revocation list as "refuse every lease" instead of inheriting `revokedLeaseIdSet`'s fail-open empty set |
| wireJson.ts | Bytes→object with structural rules before parse | lib (wireClient, wireDispatcher, acpConnection) | REAL | Y | Duplicate/reserved keys and unsafe numbers refused over raw text before `JSON.parse` |
| wireListener.ts | Unix-socket listener, 0700 dir + 0600 socket | lib (wireCli) | REAL | Y | One dispatcher (hence one framer) per connection |
| wireMethods.ts | Method registry with scope + synthetic route | lib (wireDispatcher) | REAL | Y | `agentId` in params is explicitly refused; identity comes only from the verified lease |
| wireReply.ts | Strict reply-envelope reader | lib (wireClient) | REAL | N | |
| wireRpc.ts | JSON-RPC 2.0 envelope parse/serialize | lib (wireDispatcher, wireMethods) | REAL | N | |
| workAcceptance.ts | Ledger-anchored work acceptance + receipts | lib (wireMethods, wireClient, wireCodecs) | REAL | Y | Verifies the receipt names a `work/accepted` row and that the row still chains |

### src/vault

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| dataClassification.ts | Regex sensitivity classification | lib (index, cli, fixGenerator) | REAL | Y | Confidences are fixed per tier (0.9/0.8/0.7/0.95), i.e. labels not measurements |
| dataResidency.ts | Pure residency check against a supplied policy | test-only (only importer is the orphan vault/index.ts) | REAL | Y | Docstring correctly says the real policy system is `src/compliance/dataResidency.ts` |
| dlp.ts | PII/credential scan + redaction | lib (index, cli, agentConfigScanner, vaultRouter) | REAL | Y | Luhn and IBAN mod-97 validators are real |
| dsarAutopilot.ts | DSAR request state machine | lib (dsarCli, index) | REAL | Y | Without a fulfilment handler a request stops at `awaiting-fulfilment`, never `complete` |
| dsarCli.ts | `amc vault dsar *` commands | CLI:`amc vault dsar` | REAL | Y | |
| honeytokens.ts | Deterministic honeytoken mint/detect | lib (index) | REAL | Y | Counter is per-process, so tokens are predictable (`AMC_HONEY_api_key_000001`) |
| index.ts | Barrel re-exporting five vault modules | ORPHAN | DEAD | N | Nothing in `src/`, `api/` or `tests/` imports it — `src/index.ts` re-exports the underlying modules directly, bypassing this file. Only a docs-drift test names the path as a string |
| invoiceFraud.ts | Heuristic invoice risk score | lib (index) | REAL | Y | |
| knowledgeRefreshLineage.ts | Corpus-refresh lineage receipt + verify | lib (index, vault/index) | PARTIAL | Y | `verifyKnowledgeRefreshLineageReceipt` checks only that `signaturePath` EXISTS (`existsSync`) — it never verifies the signature, so a receipt with a forged or stale `.sig` file verifies as VALID. `affectedScores`, `sourceRefs` and `evidenceRefs` are caller assertions checked only for non-emptiness; nothing is resolved or recomputed |
| memoryTtl.ts | TTL-scoped in-memory store | test-only (only importer is the orphan vault/index.ts) | REAL | Y | Docstring records that the wrapper previously returned `stored:true` without storing; it now writes and reads back |
| metadataScrubber.ts | Strip metadata fields from content | lib (index, cli) | REAL | Y | |
| passphraseStore.ts | Remembered vault passphrase (Keychain/file) | lib (cli, oneCommandUp) | REAL | Y | |
| privacyBudget.ts | Differential-privacy budget accounting | lib (index, cli) | REAL | Y | In-memory per process |
| ragGuard.ts | Injection detection in retrieved chunks | lib (index, cli) | PARTIAL | Y | `sanitized.replace(pat, ...)` uses non-global patterns, so only the FIRST match of each pattern per chunk is removed — a chunk with two "ignore previous instructions" spans is returned in `sanitizedChunks` still containing one. `injectionAttempts` counts chunks, not attempts |
| screenshotRedact.ts | Zero out EXIF/APP1 segments in JPEG bytes | test-only (only importer is the orphan vault/index.ts) | REAL | Y | Really reads, rewrites and writes the file |
| secretsBroker.ts | AES-256-GCM in-memory secret store + tokens | test-only (only importer is the orphan vault/index.ts) | REAL | Y | |
| undoLayer.ts | Record/undo/redo reversible actions | test-only (only importer is the orphan vault/index.ts) | REAL | Y | |
| vault.ts | Encrypted key vault, sessions, secrets | lib (19 importers) | REAL | Y | `AMC_NO_SIGN=1` yields ephemeral keys whose signatures are "valid format but not verifiable later" — stated in the code |
| vaultCli.ts | Interactive vault init/unlock/rotate | CLI:`amc vault` | REAL | N | |
| vaultCrypto.ts | PBKDF2-SHA256(210k) + AES-256-GCM envelope | lib (vault, hostVault) | REAL | N | |
| zkPrivacy.ts | Pedersen/Shamir/Merkle + "ZK" proofs | lib (index, cli-vault-zk-commands, vaultRouter, trustPipeline) | FACADE | Y | The file header, the CLI (`NOT a zero-knowledge proof; unsound`) and the API (`zeroKnowledge:false`) all label the range/Schnorr proofs as broken — but two things are not covered by that labelling. (1) `bitProofIsWellFormed` is step 1 of `verifyZKRangeProof` and checks only `challenge0 > 0 && challenge1 > 0 && response0.length > 0 && response1.length > 0` — a check that cannot fail for any well-shaped input and is trivially forgeable. (2) `reconstructMultiPartyResult` returns `verified: true` whenever `collectedShares.length >= threshold`, without ever checking the shares against `mpv.commitments` — a `verified` flag set with no verification, on an unlabelled export. `createMultiPartyVerification` also labels `modPow(G, share)` as "Feldman VSS" when it commits to shares, not polynomial coefficients |

### src/agents

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| agentBase.ts | Abstract governed-agent base class | lib (5 bots, agents/index) | REAL | N | `confidence: 1` on success is a constant, not a measurement |
| autoTestGen.ts | Synthesise regression tests from failures | lib (agents/index) | PARTIAL | Y | `generate()` pads each case to `config.minAssertions` by pushing duplicate `{type:'min_length', value:1}` assertions — a "generated regression test" can consist entirely of N identical assertions that any non-empty output passes. Nothing here executes the generated tests |
| contentModerationBot.ts | Keyword/pattern content moderation | lib (agents/index), CLI:`amc` demo agents | FACADE | Y | `classifyContent` line 64: `const confidence = 0.6 + Math.random() * 0.3;` — the reported `confidence` on a moderation decision is a random number, and it decides the verdict: `category = maxConfidence > 0.8 ? 'unsafe' : 'uncertain'`. The same content is classified `unsafe` or `uncertain` at random across runs, and the number is returned to callers as a confidence |
| customerSupportBot.ts | Intent/sentiment/priority support agent | lib (agents/index) | REAL | Y | Deterministic regex + keyword classification |
| dataPipelineBot.ts | ETL transform pipeline | lib (agents/index), CLI | REAL | Y | |
| harnessRunner.ts | Autonomous maturity-improvement loop | lib (agents/index, runHistory), CLI | FACADE | Y | The improvement loop fabricates the improvement. Each iteration only does `integratedCapabilities.add(capName)` (line ~410); `probeAgent` then returns `{present: true, evidence: "... (integrated via AMC module)", scoreContribution: def.weight}` for every name in that set. Nothing about the agent changed, so `finalScore`, `totalImprovement`, `converged` and `maturityLevel` measure the harness telling itself the gap was closed, and the evidence string asserts an integration that never happened. Separately, `pii_awareness` and `escalation_support` award full weight via `present = relevant ? hasX : true` — "not applicable" scores the same as "implemented" — and `governance_enabled` scores 5 for a boolean config flag the base class defaults to `true` |
| index.ts | Barrel for the agents library | lib (src/index.ts) | REAL | Y | |
| legalContractBot.ts | Regex clause extraction + risk scoring | lib (agents/index), CLI | REAL | Y | `baseRisk` values are hardcoded priors, which is what a rubric is |
| llmJudge.ts | Rubric-based LLM-as-judge | lib (agents/index, playground) | FACADE | Y | Two mislabelled paths. (1) `evaluate()` falls into `simulateScore` whenever `mode!=='llm' || !apiEndpoint || !apiKey`, but still stamps `mode: this.config.mode` — a result labelled `mode:'llm'` can be a length/punctuation heuristic with no model call. (2) `comparePairwise()` ALWAYS calls `simulatePairwise` and never the adapter, while stamping `mode: this.config.mode` — so a pairwise "LLM judgment" is `scoreA/scoreB` derived purely from `output.length` thresholds (>50, >100) |
| metricTemplates.ts | Reusable evaluation metric library | lib (agents/index, monitor, playground, simAgent, traceIngestion, evaluatorRegistryMetadata) | FACADE | Y | `governanceComplianceMetric` can only fail if the CALLER volunteers a failure: every check is of the form `if (context.actionTracked === false)`, over `input.context ?? {}`. With no context it returns `score:1, passed:true, details:'All governance controls satisfied'`. It is a member of both the `governance` group and the `all` group, and the two in-repo callers (`simAgent`, `playground`) build `MetricInput` with only `input`/`output`/`content` — so the "Governance Suite" reports 100% governance compliance by construction. Other metrics in the file are honest heuristics |
| monitor.ts | Rolling-window monitor with alert thresholds | lib (agents/index) | PARTIAL | Y | Header claims "periodic evaluation" and "Integration with RunHistoryStore for persistence"; there is no scheduler (the caller must call `scoreSample`) and no import of runHistory — samples and alerts die with the process. Its `overallScore` inherits the metricTemplates governance defect above |
| playground.ts | Prompt-variant comparison workbench | lib (agents/index) | REAL | Y | Throws `PlaygroundExecutorMissingError` rather than fabricating output — the previous `Math.random` latency/token path was removed |
| runHistory.ts | Run store, A/B compare, regression alerts | lib (agents/index) | REAL | Y | Arithmetic is real; its inputs are `HarnessResult` scores, which harnessRunner fabricates |
| sessionEval.ts | Session/path-level evaluation | lib (agents/index) | PARTIAL | Y | "Goal completion" is substring matching of the caller's own goal keywords against turn text; the satisfaction score starts at a hardcoded 0.5 baseline and moves by keyword counts. Loop detection (jaccard over agent turns) is real |
| simAgent.ts | Multi-turn persona simulation | lib (agents/index, runHistory) | PARTIAL | Y | Personas are fixed template lists indexed by turn number — they never read the agent's reply, so "realistic multi-turn conversations" is a scripted replay. `analyzeConversation` awards `positiveCount += 2` and a `satisfaction_achieved` finding when the PERSONA'S OWN scripted last line contains a satisfaction keyword, i.e. the agent is credited for text the harness itself wrote. The PII/adversarial/escalation findings are real regex over the agent's actual replies |
| traceIngestion.ts | Trace scoring pipeline | lib (agents/index, neutralImporter, traceFailureIndex) | REAL | Y | "Continuous ingestion from multiple sources" is caller-push only — no connector, no scheduler |

### src/auth

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| apiKeyCli.ts | API key create/list/revoke for the CLI | CLI:`amc api key *` (via api/apiCli) | REAL | Y | Store written 0600 |
| apiKeyManager.ts | API key issue/auth/rotate/revoke/usage | lib (apiKeyCli, index) | REAL | Y | `secretHash` is an unsalted sha256 of a high-entropy key; lookup is a Map hit, not constant-time |
| authApi.ts | Users file, signature, sessions, cookies | lib (cli, studioServer, bootstrap, workspaceRouter, complianceRouter) | REAL | Y | Session verification re-reads the users file and re-checks roles unless `authSource==='WORKSPACE_ROUTER'` |
| authCli.ts | `amc user *` commands | CLI:`amc user` | REAL | N | |
| enterpriseIam.ts | SSO config, RBAC, in-memory audit chain | lib (src/index.ts barrel only) | PARTIAL | Y | Header is honest that nothing in AMC calls it, but its own bullet "1. SSO Integration layer (SAML 2.0, OIDC)" is not delivered anywhere in the file: there is no assertion parsing, no discovery fetch, no token validation. `createSsoSession(userId, email, provider, roles)` mints an authenticated session straight from caller-supplied values, and `checkAccess` then grants on those unverified roles. `AuditLog` is process-local — `verifyChainIntegrity`/`exportForAudit` read an array that is never persisted (only `sso-providers.json` is). `allowedDomains` and `autoProvision` are declared and never enforced |
| humanLog.ts | Hash-chained human-action log + seal | lib (studioServer — append only) | PARTIAL | N | `verifyHumanActionLog` can never return `ok:true`: `writeSeal` signs `sha256(JSON.stringify(seal))` (compact) while the verifier computes `sha256(readFileSync(sealPath))` over the file, which was written as `JSON.stringify(seal, null, 2)` (pretty). Confirmed by running both digests — they differ — so every call reports `seal digest mismatch`, a tamper verdict for an untampered log. The function also has no importer anywhere; only `appendHumanActionEvent` is wired |
| passwordHash.ts | scrypt hash + timing-safe verify | lib (authApi) | REAL | N | N=16384, r=8, p=1, keylen=64 |
| rbac.ts | Role predicates + admin/role gate | lib (studioServer) | REAL | N | |
| roles.ts | Role enum + parse/normalise | lib (13 importers) | REAL | N | |
| sessionTokens.ts | Ed25519-signed session tokens | lib (authApi, studioServer, pairingCodes, sessionCookie, workspaceRouter) | REAL | Y | |
| ssoConfig.ts | SSO config shape + group→role mapping | lib (index, scimAdapter) | PARTIAL | Y | `mapSsoGroupsToRole`/`resolveSsoRole` are real pure functions, but no OIDC or SAML implementation exists behind the config anywhere in the repo. `defaultSsoConfig()` returns `enabled: true` with `https://idp.example.com` placeholders — a template that reads as an enabled provider |
| userSchema.ts | Zod schemas for users file | lib (authApi, sessionTokens) | REAL | N | |

### src/experiments

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| architectureExperiment.ts | Same-model, different-architecture comparison | lib (index), CLI:`amc experiment-architecture` | PARTIAL | Y | `runArchitectureExperiment` now requires an explicit `probeRunner` and the CLI refuses by default. But the only runner that ships is `simulateProbeOutcomes`, an LCG that derives score/tokens/latency/choiceAwareness from a seed and the artifact hash — and when `AMC_ARCHITECTURE_ALLOW_SIMULATED=1` the CLI passes exactly that, then prints a markdown report whose "Pass rate / Avg latency / Avg tokens / 95% CI / Effect size" table carries no simulated-run marker |
| experimentCli.ts | Thin CLI wrappers over the runner | CLI:`amc experiment *` | REAL | N | |
| experimentGatePolicy.ts | Gate presets + comparison rows | CLI:`amc experiment gate` | REAL | Y | |
| experimentRunner.ts | Baseline vs candidate casebook comparison | lib (index, experimentCli) | PARTIAL | N | The fabricated-candidate path is gone (it now throws without `--candidate-window`), but the baseline window is hardcoded `"14d"` while the candidate window is caller-supplied and `candidateAgentId` defaults to the baseline agent — so `--candidate-window 14d` with no `--candidate-agent` runs the identical `runCasebook` call twice and reports uplift 0, CI [0,0] and a signed report as a measured comparison. Nothing checks that the two sides differ |
| experimentSchema.ts | Zod schemas for experiments/gates | lib (cli, runner, gatePolicy) | REAL | N | |
| governedOptimizer.ts | Pareto-ranked patch candidates with leakage gates | lib (experimentCli) | FACADE | Y | Every gate is structurally unable to fail. `split-isolated` computes `searchTestIds.filter(id => validationTestIds.includes(id))`, but `validationTestIds` is BY CONSTRUCTION `allTestIds.filter(id => !searchTestIds.includes(id))` — a set compared against its own complement, so the overlap is always empty. `candidate-workspace-isolated` tests `candidateWorkspace.includes("experiments/optimizer")` on a path always built by `candidateWorkspacePath()`, which always contains it. In `buildValidationReceipt`: `live-resources-unchanged` tests `liveResourceMutated === false` on a field typed `false` and hardcoded `false`; `candidate-receipts-created` tests `receipts.length === candidates.length` where `receipts = ranked.map(...)`; `candidate-workspaces-created` tests `existsSync` on directories written moments earlier in the same function. The Pareto metrics feeding the ranking are invented too: `cost = 1 + search*0.5 + validation*0.75` and `latencyMs = 1000 + n*250` are arithmetic on test counts, never measurements |
| stats.ts | Seeded bootstrap CI + effect size | lib (index, runner, architectureExperiment, studioSupervisor, maintenanceCli) | REAL | N | Real xorshift-seeded resampling |

### src/federation

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| federationCli.ts | `amc federate *` commands | CLI:`amc federate` | REAL | Y | |
| federationIdentity.ts | Ed25519 publisher key held in the vault | lib (federationCli, federationSync) | REAL | N | |
| federationSchema.ts | Zod schemas for config/peer/manifest | lib (store, sync) | REAL | N | |
| federationStore.ts | Federation config + peer store, auditor-signed | lib (federationCli, federationSync) | REAL | N | Peer records carry `publisherPublicKeyPem` — see federationSync |
| federationSync.ts | Export/import/verify federation packages | lib (index, federationCli) | FACADE | Y | `verifyFederationPackage` checks the manifest signature against `public-keys/publisher.pub` READ OUT OF THE PACKAGE BEING VERIFIED — the bundle supplies its own trust anchor, so any attacker who re-signs a tampered manifest with their own key passes, and "manifest signature invalid" cannot fire for a self-consistent bundle. `addFederationPeer`/`listFederationPeers` store registered peers' publisher keys precisely for this, and `federationSync` never imports them. `importFederationPackage` gates on this verify, so it ingests unverified benchmarks into the local store |

### src/enterprise

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| enterpriseCli.ts | `amc enterprise status/activate/audit-export/usage` | CLI:`amc enterprise` (cli-late-stage-commands) | FACADE | N | Both license calls pass `publicKey: undefined as never` (lines 39 and 74), so `createVerify().verify(undefined, sig)` throws, is swallowed as `sigValid = false`, and every result is `valid:false, effectiveTier:'FREE', errors:['signature verification failed']` — a verification failure reported for a verification that was never attempted. `amc enterprise status` therefore always prints tier Community regardless of the license on disk. Worse, the two license formats are mutually exclusive: the CLI gates activation on `validateLicenseKeyFormat` (`AMC-ENT-XXXX-XXXX-XXXX`, no dot) while `validateLicenseKey` requires `payload.signature` (split on `.` must give 2 parts) — so no key can pass both and `amc enterprise activate` exits 1 for every input, after writing the key to `.amc/license.key` anyway. `validateLicenseKeyFormat`, `LicenseValidationResult`, `SignedAuditTrail`, `generateUsageMeteringSummary` and `UsageMeteringSummary` are imported and never used |
| fleetGovernance.ts | Multi-tenant quotas, usage, compliance report | lib (enterpriseCli, cli-late-stage-commands) | PARTIAL | Y | `generateTenantComplianceReport` returns `policyCompliant: true` for a tenant with NO usage record — the whole violation block is inside `if (usage)`, so "compliant" and "never measured" are the same answer. `quotaUtilization.maxAuditRetentionDays` is initialised to 0 and never computed, even when usage exists |
| license.ts | Ed25519 license sign/validate/activate | lib (enterpriseCli, cli-late-stage-commands) | PARTIAL | Y | Crypto is real. `activateLicenseKey` writes the key file and returns `persisted: true` even when `validation.valid` is false, so an invalid or forged key is still stored at `.amc/license.key` |
| tiers.ts | Tier feature tables | lib (license, enterpriseCli) | REAL | N | |

### src/exports

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| grcCli.ts | `amc grc export` command | CLI:`amc grc export` | REAL | N | |
| grcEvidenceExport.ts | Map a run onto framework controls + SARIF | lib (grcCli) | REAL | Y | Control verdicts come from real report signals; carries an explicit not-certification disclaimer and gates `claimEligible` on evidence readiness |
| policyExport.ts | Emit a signed policy pack + manifest | CLI, lib (index, studioServer, exportRouter, bomRouter) | REAL | Y | Signature status of target/agent/gateway is read, not asserted |

### src/cli

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| deprecatedCommand.ts | Once-per-process stderr deprecation notices | lib (cli.ts) | REAL | Y | |
| offlineMode.ts | Offline/lite config + capability check | lib (src/index.ts barrel only) | FACADE | Y | `checkOfflineCapability` and `validateOfflineEnvironment` inspect nothing outside the config object handed to them. `questionBankAvailable: config.bundledQuestionBank` echoes a flag rather than checking that a bank exists; `missingDependencies` never checks a dependency; `estimatedMemoryMb` is the literal 80 or 200. For `offlineModeConfig()` — the config the module itself produces — `missing` is necessarily empty, so `canRunOffline` is always true. `validateOfflineEnvironment` is named for the environment and reads only the config's own fields, so it cannot report an environment problem |

### src/brand

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| visualIdentity.ts | Frozen brand tokens (name, type, colors) | lib (cliFormat) | REAL | Y | Constants file; two tests assert the file's contents |

### src/loop

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| loop.ts | Recurring diagnostic/assurance/dashboard loop | CLI:`amc loop *`, lib (index) | REAL | Y | `loopRun` really invokes runDiagnostic, runAssurance, transform tracker, dashboard build and snapshot |

## watch & approvals

### src/watch

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| agentBus.ts | in-memory inter-agent message bus | lib (watch/index → cli, src/index) | REAL | Y | `contentDigest` is an unkeyed SHA-256 and the docstring says so; in-memory only, messages lost on restart |
| agentReadingTestLiveDrift.ts | drift receipt over caller-supplied rows | lib (watch/index re-export only) | REAL | Y | header states "NO VENDOR API IS CONTACTED"; no non-test caller of `runAgentReadingTestLiveDrift` |
| aiReputationClaudeLiveDrift.ts | drift receipt over caller-supplied rows | lib (watch/index re-export only) | REAL | Y | same family; no non-test caller |
| awesomeAgentMemoryLiveDrift.ts | drift receipt over caller-supplied rows | lib (watch/index re-export only) | REAL | Y | same family; no non-test caller |
| behavioralProfiler.ts | robust-z/MAD anomaly + trust degradation | API:watchRouter, CLI, lib | REAL | Y | header honestly downgraded from "ML-Powered" to classical statistics; state is in-memory |
| bishengObservabilityLiveDrift.ts | drift receipt + score/shield/watch surfaces | lib (watch/index, score/bishengObservabilityLiveDriftScore) | REAL | Y | |
| braintrustLiveDrift.ts | proof-delegated drift monitor | lib (watch/index) | REAL | Y | built from `createProofDelegatedMonitor` |
| continuousMonitor.ts | periodic scoring + drift + anomaly loop | CLI:`amc watch`, lib | REAL | Y | runs real `runDiagnostic`/`runDriftCheck`, writes ledger, dispatches alerts |
| ctfAgentBenchmarkLiveDrift.ts | drift receipt over caller-supplied rows | lib (watch/index re-export only) | REAL | Y | no non-test caller |
| darwinGodelMachineLiveDrift.ts | drift receipt over caller-supplied rows | lib (watch/index re-export only) | REAL | Y | no non-test caller |
| dashboardFeed.ts | in-memory metrics/event feed for dashboards | lib (watch/index) | REAL | Y | ring buffer of 1000 events; no persistence, no SSE/WS despite docstring mentioning them |
| decibenchVoiceLiveDrift.ts | proof-delegated drift monitor | lib (watch/index) | REAL | Y | |
| driftMath.ts | shared Family-B drift arithmetic | lib (8 satellites) | REAL | Y | documents that its `ratioIncrease` has reversed args vs the one in liveDriftAlerts |
| evidenceDrilldown.ts | build Watch explain-packet drilldown links | test-only (18 test files) | DEAD | Y | zero src importers; `buildWatchEvidenceDrilldownArtifactLink` / `buildWatchObsStudioSourceArtifactLinks` are never called in production, so the Score drilldown never gets these links |
| evidenceRefs.ts | normalize/validate evidence ref arrays | lib (17 watch files) | REAL | Y | |
| explainabilityPacket.ts | claim digest packet + digest check | lib (watch/index) | REAL | Y | `verifyPacket` is an unkeyed digest recompute — detects corruption, not forgery |
| garageLiveDrift.ts | drift receipt over caller-supplied rows | lib (watch/index re-export only) | REAL | Y | no non-test caller |
| hookActionLifecycle.ts | correlate hook request/decision/terminal evidence | CLI:`amc hooks`, API:watchRouter | REAL | Y | calls real `verifyEvidenceEventIntegrity`; `valid` derived from reasonCodes |
| hookHealthDiagnostics.ts | hook install + evidence health report | CLI:`amc hooks`, API:watchRouter | REAL | Y | |
| hostHardening.ts | host posture checks | CLI, lib | PARTIAL | Y | only 4 checks (inspect flags, secret-shaped env names, node major, uid!=0). H002 reports any env key containing SECRET/TOKEN/PASSWORD/API_KEY as "potentially leaked", so a normal dev shell always fails it |
| index.ts | watch barrel | CLI:`amc watch`, lib (src/index) | REAL | Y | re-exports 19 vendor drift satellites that no production code calls |
| liveDriftAlerts.ts | the 10k-line drift statistics engine | API:scoreRouter/shieldRouter/watchRouter, lib (25) | REAL | Y | pure calculator on caller rows; guards factored into `guarded*` with the operand-order hazards documented |
| liveDriftTypes.ts | 936-field sample row + metric id types | lib (liveDriftAlerts, sessionDriftProjection) | REAL | N | types only |
| llmFighterLiveDrift.ts | drift receipt over caller-supplied rows | lib (watch/index re-export only) | REAL | Y | no non-test caller |
| lmnrObservabilityLiveDrift.ts | drift receipt over caller-supplied rows | lib (watch/index re-export only) | REAL | Y | no non-test caller |
| multiTenantVerifier.ts | tenant isolation check | lib (watch/index) | PARTIAL | Y | `registerResource` builds a map that no method ever reads, so the registry is dead state. `verifyTenantIsolation`/`checkCrossTenantAccess`/`verifyTenantBoundary` only compare two strings the caller passed in — nothing is looked up, so a resource genuinely owned by another tenant is undetectable unless the caller already knew |
| narrowTaskBroadMisalignmentLiveDrift.ts | drift receipt over caller-supplied rows | lib (watch/index re-export only) | REAL | Y | no non-test caller |
| observabilityBridge.ts | OTLP/Langfuse/Helicone/Datadog/webhook trace ingest | CLI:`amc observability`, lib | REAL | Y | real HTTP adapters; `estimateCost` falls back to a flat $0.002/1k for unknown models |
| openCompassLiveDrift.ts | drift receipt over caller-supplied rows | lib (watch/index re-export only) | REAL | Y | no non-test caller |
| outputAttestation.ts | sha256 + timestamp over agent output | lib (watch/index) | REAL | Y | previously a facade (`signed: true` with no signature); now typed `signed: false` with the history in the docstring |
| overrideNearMissAnalytics.ts | override/near-miss receipt + watch alerts | lib (watch/index) | REAL | Y | |
| paperReadSkillLiveDrift.ts | proof-delegated drift monitor | lib (watch/index) | REAL | Y | |
| policyPacks.ts | built-in policy-pack catalog + resolver | lib (watch/index) | PARTIAL | Y | `applyPolicyPack` enforces nothing — it returns `applied: false, resolved: true` and lists modules the pack *would* enable. Honestly documented, but the name still reads as an enforcement call |
| proofDelegatedMonitor.ts | factory behind 5 collapsed drift satellites | lib (5 satellites) | REAL | Y | |
| providerDriftAlerts.ts | re-export of benchmarks/providerDriftBenchmark | lib (watch/index) | REAL | N | 4-line pass-through |
| ragTextGenerationLiveDrift.ts | drift receipt over caller-supplied rows | lib (watch/index re-export only) | REAL | Y | no non-test caller |
| railScoreLiveDrift.ts | drift receipt over caller-supplied rows | lib (watch/index re-export only) | REAL | Y | no non-test caller |
| realtimeAssurance.ts | 9 live checks over ingested traces | CLI:`amc observability`, lib | REAL | Y | checks read real span/cost/latency/tool fields |
| reflexionAgentLiveDrift.ts | proof-delegated drift monitor | lib (watch/index) | REAL | Y | |
| safetyTestkit.ts | 10 OWASP-LLM refusal probes | lib (watch/index) | PARTIAL | Y | pass/fail is a single refusal-keyword regex (`i can't\|sorry\|refuse\|...`) over the response. A reply that apologises *and* complies scores as passed. All 10 scenarios are `shouldReject: true`, so the non-rejection branch is unreachable |
| sessionDriftProjection.ts | project ledger tool-call audits into drift rows | test-only | DEAD | Y | zero src importers. This is the bridge written to connect the ledger to the drift engine; nothing calls `projectToolCallDriftRows`, so `liveDriftAlerts` still never sees ledger data |
| siemExporter.ts | CEF/LEEF/JSON-LD/Splunk/ECS formatters | lib (watch/index, enforce/evidenceEmitter) | PARTIAL | Y | `exportToSiem` returns `exported: true` while only formatting in memory — nothing is transmitted to any SIEM. `exportSplunk`, `exportElastic`, `exportJsonl`, `readRecentGuardEvents`, `mapToMITRE` are exported but have zero importers anywhere including tests |
| skillMatchLiveDrift.ts | proof-delegated drift monitor | lib (watch/index) | REAL | Y | |
| traceFailureIndex.ts | classify + index failing traces | CLI:`amc trace`, API:evidenceRouter, lib | REAL | Y | |
| trismAgenticLiveDrift.ts | drift receipt over caller-supplied rows | lib (watch/index re-export only) | REAL | Y | no non-test caller |

### src/approvals

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| approvalActivity.ts | searchable approval activity projection | lib (studio, approvalCliCommands) | PARTIAL | Y | line 282 re-checks `!row.requestIntegrity.valid` before returning, but `requestIntegrity.valid` is a hardcoded `true` in every row approvalInbox produces, so half that guard can never fire |
| approvalAskCommand.ts | `amc approvals ask` — the asking side of the seam | CLI:`amc approvals ask` (hidden) | REAL | N | exit code is the verdict; deliberately hidden from the command inventory |
| approvalChainStore.ts | signed request/decision/consumed store | lib (9 importers) | REAL | Y | ed25519 sign+verify per artifact; unverifiable files are skipped on list |
| approvalCli.ts | CLI arg parsers for approvals | lib (cli commands, studio) | REAL | N | |
| approvalCliCommands.ts | registers `amc approvals *` | CLI:`amc approvals` | REAL | Y | |
| approvalDelivery.ts | notify integrations on approval lifecycle | CLI, studio, lib | REAL | Y | delegates to the real integration dispatcher; marks itself `notificationOnly: true, proofEligible: false` |
| approvalEngine.ts | create/decide/verify/consume approvals | lib (14 importers) | REAL | Y | `verifyApprovalForExecution` checks signature, agent/intent/tool/class binding, chain integrity, policy/tools/budget context, and quorum |
| approvalInbox.ts | project stored approvals into inbox items | lib (engine, delivery, studio, CLI) | PARTIAL | Y | `requestIntegrity: { valid: true, reasonCode: null }` is a literal, never computed. The invariant holds today (both entry points only pass signature-verified records) but the field is decorative — a tampered request is silently dropped from the listing rather than surfaced as invalid, and any UI rendering "request integrity: valid" is rendering a constant |
| approvalPolicyEngine.ts | signed approval policy load/eval | lib (engine, studio, toolhub) | REAL | Y | |
| approvalPolicySchema.ts | zod schema for approval policy | lib (4) | REAL | N | |
| approvalQuorum.ts | quorum/expiry/denial state machine | lib (approvalEngine) | REAL | Y | `requiredApprovals <= 0` returns QUORUM_MET with zero approvers — policy-driven, but worth knowing |
| approvalSchema.ts | zod schema for the legacy approval artifact | lib (approvalStore) | REAL | N | |
| approvalStore.ts | legacy signed approval artifact store | lib (src/index.ts public API only) | PARTIAL | N | a second, parallel approval store superseded by approvalChainStore; no internal caller and no test. Its `loadApprovalConsumed`/`approvalStatus` names collide with approvalChainStore/approvalEngine exports, which is how it looks reachable in a name grep |
| approvalStudioService.ts | Studio HTTP handlers for approvals | lib (studio/studioServer) | REAL | N | |
| seam/answerNormalize.ts | clamp answerer results to a safe answer | lib (approvalSeam, seam/index) | REAL | Y | |
| seam/approvalSeam.ts | blocking human-in-the-loop `ctx.approval` | lib (kernel/services/approvalServices) | REAL | Y | writes the signed request/answer audit pair; throws rather than returning an unlogged decision |
| seam/approvalSeamTypes.ts | seam contract types + defaults | lib (11 importers) | REAL | Y | |
| seam/devProfileException.ts | bounded ADR-5 dev exception answerer | CLI:cli-agent-commands, lib | REAL | Y | required attribution, 30-day max window, abstains after expiry, no wildcard action class |
| seam/engineAnswerer.ts | route a question to the approvals engine | lib (approvalSeam, seam/index) | REAL | N | |
| seam/index.ts | seam barrel | test-only | DEAD | Y | zero src importers — every production consumer imports the concrete modules directly |

### src/redteam

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| adversarialGenerator.ts | generate adversarial samples, score outcomes | lib (src/index.ts public API only) | PARTIAL | Y | `generateAdversarialSuite` produces prompts but nothing in the repo executes them; `evaluateAdversarialResults` scores outcomes the caller supplies, so the "report" is a tabulation of someone else's verdicts |
| attackPlugins.ts | 5 attack plugins scored on real responses | CLI:`amc redteam attack`, lib | REAL | Y | `simulate()` calls the caller's `respondFn`, which the CLI wires to the real agent responder; zero plugins run yields resilience 0, not 100 |
| exploitLedger.ts | exploit receipt/ledger schema + hashing | lib (src/index, redteam/index) | REAL | Y | |
| index.ts | redteam barrel | CLI:`amc redteam` | REAL | Y | |
| jailbreak/attacks.ts | jailbreak attack prompt library | lib (jailbreak/index, runner, tap) | REAL | Y | |
| jailbreak/detector.ts | heuristic jailbreak verdict from response | CLI, lib | REAL | Y | multi-signal heuristics over the normalized response |
| jailbreak/index.ts | jailbreak barrel | lib (redteam/index) | REAL | Y | |
| jailbreak/normalizer.ts | strip hedging, find refusal-then-comply pivots | lib (detector, jailbreak/index) | REAL | Y | |
| jailbreak/runner.ts | run the attack library against a responder | lib (jailbreak/index → redteam/index) | PARTIAL | Y | takes a real `respondFn`, but no CLI command or API route ever calls `runJailbreakTests` — it is reachable only as a published library export |
| jailbreak/tap.ts | "Tree of Attacks with Pruning" refinement | lib (jailbreak/index, runner) | PARTIAL | Y | the module docstring says branches are "refined based on the target's responses", but all five `refine(prompt, _response, depth)` strategies ignore the response parameter — refinement is a fixed template ladder, not response-driven. The tree/pruning bookkeeping itself is real |
| mcpAgentProvider.ts | evil-MCP tool-offer red team | lib (redteam/index, runner) | REAL | Y | offers real tool definitions and measures actual tool calls; unreachable agent counts as inconclusive, never as passed |
| modelSpecificAttacks.ts | per-model-family attack pack generator | test-only | DEAD | Y | zero src importers; `generateModelSpecificAttack`, `generateAttackConversation`, `renderModelAttackPackMarkdown` have no production consumer |
| multilingualAttacks.ts | non-English/homoglyph/RTL attack catalog | lib (src/index.ts public API only) | REAL | Y | static catalog with query helpers; docstring is explicit that the driving "practitioner quote" is model-generated, not user research |
| perturbation.ts | leetspeak/homoglyph/zero-width mutators | lib (modelSpecificAttacks) | REAL | Y | |
| promptInjectionRegressionSuite.ts | injection regression receipt builder | lib (src/index, redteam/index) | PARTIAL | Y | runs no injection: `status` is derived entirely from `observedDecision` values the caller passes in. Fail-closed defaults are real, but nothing in src ever supplies fixtures |
| runner.ts | packs × strategies against the real agent | lib (ci/redteamGate, redteam/index) | REAL | Y | header still says "synthetic response engine" — stale; the body resolves a real `AgentResponder` and records unreachable agents as inconclusive rather than pass |
| strategies.ts | prompt-transform attack strategies | lib (runner, redteam/index) | REAL | Y | |

### src/cgx

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| cgxApi.ts | init/build/verify/show/policy API surface | CLI:`amc cgx`, studio, mechanic | REAL | N | |
| cgxBuilder.ts | build the signed context graph | lib (cgxApi) | REAL | N | |
| cgxCli.ts | thin CLI wrappers over cgxApi | CLI:`amc cgx *` | REAL | Y | |
| cgxContextPack.ts | build the per-agent context pack | lib (cgxApi, prompt/promptCompiler) | REAL | N | |
| cgxDiff.ts | diff two graph snapshots | CLI | REAL | N | shares the export name `renderGraphDiffMarkdown` with cgxPropagation, which makes name-based test greps false-positive |
| cgxPropagation.ts | semantic edge overlay, risk propagation, integrity | CLI:`amc cgx-integrity`, `amc cgx-propagation`, lib (src/index) | FACADE | Y | two defects. (1) `verifySemanticEdge(overlay, edgeId)` verifies nothing: its whole body is `edge.verifiedTs = Date.now(); edge.stale = false; return true` — it stamps any existing edge as verified and returns true, and that stamp is exactly what `markStaleEdges` and `checkGraphIntegrity` read to decide staleness, so "verifying" every edge makes the integrity check pass by construction. (2) No overlay is ever persisted or loaded anywhere in src — both CLI commands call `createSemanticOverlay(graph)`, which returns `edges: []`, and then run the check/simulation over zero edges. `amc cgx-integrity` therefore always reports 0 contradictions, 0 stale edges and 0 orphaned nodes, and `amc cgx-propagation` always reports zero blast radius |
| cgxSchema.ts | zod schemas for graph/pack/policy | lib (9) | REAL | Y | |
| cgxSimulator.ts | BFS blast-radius over the real graph edges | CLI | REAL | N | operates on the persisted CgxGraph, not on the empty overlay — unaffected by the cgxPropagation defect |
| cgxSse.ts | emit CGX events to the org SSE hub | lib (studio) | REAL | N | |
| cgxStore.ts | signed graph/pack/policy persistence | lib (16), CLI | REAL | Y | |
| cgxVerifier.ts | verify policy + all graphs/packs in a workspace | lib (cgxApi, verify/verifyAll) | REAL | N | |
| semanticCodeEdges.ts | scan a repo into a code graph | CLI, lib (src/index) | PARTIAL | N | regex extraction of functions/imports; `TESTS` edges are inferred by filename-stem match only, and import resolution tries a fixed candidate list, so edges are heuristic despite the "semantic" name and the fixed `confidence: 1.0/0.9/0.8` values |

### src/workspaces

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| hostAuth.ts | scrypt password envelopes + HMAC session tokens | lib (hostDb, workspaceRouter) | REAL | Y | `timingSafeEqual`, expiry checked, real scrypt params |
| hostBootstrap.ts | one-shot host + admin + workspace bootstrap | CLI:`amc host bootstrap` | REAL | N | |
| hostCli.ts | `amc host *` command implementations | CLI:`amc host` | REAL | Y | |
| hostDb.ts | host SQLite: users, workspaces, memberships | lib (13 importers) | REAL | Y | |
| hostSchema.ts | zod schemas for host records | lib (hostDb, identity/roleMapping) | REAL | N | |
| workspaceContext.ts | WorkspaceContext interface | lib (workspaceManager) | REAL | N | 7-line type-only module |
| workspaceId.ts | validate/normalize workspace ids | lib (22 importers) | REAL | Y | |
| workspaceManager.ts | resolve + cache per-workspace contexts | lib (workspaceRouter) | REAL | N | enforces `assertWorkspacePathInsideHost` on every resolve |
| workspacePaths.ts | host directory layout + traversal guard | lib (7) | REAL | Y | |
| workspaceResolver.ts | host-mode vs single-workspace resolution | lib (workspaceManager) | REAL | N | |
| workspaceRouter.ts | host-mode HTTP router (1792 lines) | lib (studio/studioSupervisor → `startWorkspaceRouter`) | REAL | Y | every route goes through `resolveHostAccess` (identity session, else HMAC cookie, else 401) and re-checks the user is still active |

### src/persistence

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| conformance/sessionStoreConformance.ts | shared backend conformance suite | test-only (ships in src by design) | REAL | Y | zero src importers, but that is intentional — it is a consumer-runnable suite with no test-framework dependency; tests/persistence proves cases fail loudly by running deliberately broken backends |
| jsonl/jsonlEventLog.ts | append-only JSONL rows + writer lock | lib (jsonlSessionEventStore, ledger/alternateBackendVerification) | REAL | Y | |
| jsonl/jsonlSessionEventStore.ts | JSONL SessionEventStore backend | lib (openSessionEventStore) | REAL | Y | exercised via `openSessionEventStore` in tests/jsonlSessionStore.test.ts |
| openSessionEventStore.ts | sticky per-workspace backend selection | lib (5) | REAL | Y | refuses a backend mismatch rather than producing two disjoint chains; read-only opens do not pin |
| sessionEventStore.ts | the backend contract | lib (7) | REAL | Y | |
| sessionStoreVerification.ts | backend-independent event verification | lib (3) | REAL | Y | honest about the gap: JSONL workspaces get no `verifyLedgerIntegrity` coverage, and the monitor-fingerprint anchor is required for the verdict to mean anything |
| sqliteSessionEventStore.ts | SQLite backend over the existing ledger | lib (openSessionEventStore) | REAL | Y | delegates writes to `Ledger.appendEvidenceDetailed`; exercised via the conformance suite |

### src/hallucination

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| detector.ts | compose deterministic + LLM-judge findings | lib (hallucination/index) | REAL | Y | docstring claims "it is exported from the package barrel" — it is not: `src/index.ts` does not re-export anything from hallucination/ |
| deterministicDetectors.ts | 8 grounding-based fabrication detectors | lib (detector, hallucination/index) | REAL | Y | require `context`; without it they return no findings, which the detector docstring correctly reads as "could not judge" |
| index.ts | hallucination barrel | test-only | DEAD | Y | zero src importers. Nothing in cli.ts, src/index.ts or any api router references `detectHallucinations` — the entire subsystem has no production consumer |
| llmJudge.ts | prompt-build + parse for an LLM judge | lib (detector, hallucination/index) | REAL | Y | judge fn is injected; parse failure returns empty findings with an explanatory assessment rather than a pass |
| types.ts | hallucination finding/config types | lib (4) | REAL | Y | |

### src/evidence

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| auditPacket.ts | signed zip audit packet | CLI:`amc audit packet`, lib | REAL | Y | defaults `includeChain: true` and `includeRationale: true`, so the packet path does verify the chain; manifest is ed25519-signed by the auditor key |
| exporter.ts | verifier-ready JSON/CSV/PDF evidence export | CLI:`amc evidence export`, API:evidenceRouter | FACADE | Y | `includeChain` defaults to **false**, and on that path every record is emitted with `chainValid: true`, `chainInvalidCount: 0`, and the PDF header line "Chain invalid count: 0" — none of which was computed. `src/api/evidenceRouter.ts:377` calls `collectVerifierEvidence({ workspace, agentId })` with no `includeChain`, and `cli.ts:10400` passes `Boolean(opts.includeChain)`, so the default verifier-facing export asserts hash-chain validity it never checked. Separately, even with `includeChain: true`, `hashChainStatus` only compares `prev_event_hash` linkage — it never recomputes `event_hash` or checks `writer_sig` |
| index.ts | evidence barrel | CLI, API:evidenceRouter, lib | REAL | N | |
| zip.ts | store-only zip writer with CRC32 | lib (auditPacket, evidence/index) | REAL | N | rejects `..` in entry paths; deterministic entry ordering |

### src/mcp

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| amcMcpServer.ts | stdio MCP server exposing 10 read-only tools | CLI:`amc mcp serve` | REAL | Y | in-process rate limiter; all tools read-only |
| mcpCli.ts | registers `amc mcp *` | CLI:`amc mcp` | REAL | Y | |
| mcpServerRiskAttestation.ts | signed MCP-server risk attestation + gate | ORPHAN | DEAD | Y | zero src importers. `evaluateMcpServerRiskAttestation` and `verifyMcpServerRiskAttestationReceipt` implement a real fail-closed gate (signature, manifest, sandbox policy, scan age/result, transport and capability drift) but nothing ever calls it before an MCP invocation, so no MCP server is actually gated |

### src/dashboard

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| build.ts | render the static dashboard from real data | CLI:`amc dashboard build`, lib (7) | REAL | Y | pulls from ledger, diagnostics, assurance, approvals, drift, vault, policy signatures |
| serve.ts | serve the built dashboard + guardrail API | CLI:`amc dashboard serve`, lib | REAL | Y | non-GET guardrail mutations require a per-process same-origin capability token compared with `timingSafeEqual` |

### src/budgets

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| budgets.ts | signed autonomy/usage budgets + enforcement | CLI:`amc budgets`, lib (24 importers) | PARTIAL | Y | load/sign/verify/evaluate are real, and an invalid signature fails closed onto DEPLOY/WRITE_HIGH/SECURITY. But `resetBudgetDay` only appends a `BUDGET_RESET` audit row — `budgetUsageSnapshot` counts every ledger event in the day window and never excludes events before a reset, so `amc budgets reset` records a reset that has no effect on the budget verdict |

### src/methodology

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| publicMethodology.ts | public scoring methodology manifest + packets | CLI:`amc methodology`, API:configRouter, lib | REAL | Y | 5.5k lines, mostly declarative. The L0–L5 case studies are hardcoded but every row carries `synthetic: true`, the dataset status is `"public-synthetic-sample"`, and the card explicitly says not to use it as empirical validation. `verifyPublicMethodologyReference` recomputes hashes from the live question set and can genuinely fail |

## shield & integrations

### src/shield

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| advancedThreats.ts | Compound/TOCTOU/shutdown/corrigibility threat assessment | lib (shield/index, shieldGuardOrchestrator, assurance/packs/advancedThreatsPack, lab/packs) | FACADE | N | Fabricates the events it then reports as observations. With no `decisionFlow` supplied, `inferDecisionFlowFromText` invents check/policy_update/use events from regexes on the prompt; `inferShutdownEvents` invents one event with a hardcoded `delayMs: 60_000`; `inferCorrectionEvents` invents one with hardcoded `latencyMs: 45_000/5_000`. The results are reported as counts of real telemetry — `staleWindows`, `missingRevalidations`, `ignoredCommands`, `delayedCommands`, `acceptanceRate` — with reason strings that read "Observed N state-change window(s)" and "Ignored or non-compliant shutdown signals: N". |
| agentConfigScanCli.ts | CLI printer for agent-config scan | CLI:`amc shield agent-config-scan` (dynamic import, cli.ts:20624) | REAL | N |  |
| agentConfigScanner.ts | Scans CLAUDE.md/settings/hooks/MCP for config risks | lib (posture, agentConfigScanCli) | REAL | Y |  |
| analyzer.ts | Static regex scan of skill code for dangerous calls | lib (shield/index, product/fixGenerator) | REAL | Y |  |
| attachmentDetonation.ts | Flags risky attachments by extension and content | lib (shield/index, attachments/attachmentIngest) | PARTIAL | Y | Nothing is detonated. `detonateAttachment` does extension-set lookups and two `String.includes` checks on a string; no sandbox, no execution, no file parsing. Its guard event is also hardcoded `decision:'allow'` regardless of whether `safe` is false. |
| behavioralSandbox.ts | Regex check for evasion phrasing in prompts | lib (shield/index) | PARTIAL | Y | No sandbox. `sandboxCheck` runs 8 regexes over the prompt string and returns `runCount: 1` hardcoded, implying repeated sandboxed runs that never happen. |
| continuousRedTeam.ts | Evolutionary red-team daemon over a caller evaluator | lib (shield/index) | REAL | Y | Framework is genuine (caller supplies the evaluator). Two soft spots: `trendTest` is labelled "Welch's t-test" but uses a normal-CDF approximation and borrows group1's variance when group2 has one sample; and `metadata.mutations`/`generationMethod` are set from a second, independent `Math.random()` roll, not from the roll that actually decided whether to mutate. |
| conversationIntegrity.ts | Hash-chain tamper check of conversation turns | lib (shield/index) | REAL | Y | Previously a facade; now returns `valid: null` when no baseline is supplied instead of claiming validity. |
| detector.ts | Injection detection adapter over the one matcher | lib (shield/index, shieldGuardOrchestrator, redteam/*, hallucination) | REAL | Y |  |
| downloadQuarantine.ts | Blocks downloads by domain, extension, non-HTTPS | lib (shield/index) | REAL | Y |  |
| dynamicAttackGenerator.ts | Template-based attack prompt synthesis | lib (shieldGuardOrchestrator, continuousRedTeam) | REAL | N | Header honestly states there is no model and no learned component. |
| exploitConfirmation.ts | "Confirms" exploitability under an authorization scope | CLI:`amc shield exploit-confirm*`, API:shieldRouter | FACADE | Y | Nothing is executed. `confirmed = input.task.proofSignals.length > 0` — the caller hands in the proof signals and the module records them. There is no spawn/exec/fetch/replay anywhere in the file, yet `runExploitConfirmation` writes a ledger receipt of type `EXPLOIT_CONFIRMATION_SAFE_REPLAY_EXECUTED` and a proof with `confirmationStatus:"CONFIRMED_SAFE_PROOF"` whose summary reads "Exploitability was confirmed through authorized safe proof signals". |
| guardEngine.ts | Policy gate over proposed action text vs target profile | lib (cli, index, shield/index, guardrails/guardEngine) | REAL | N |  |
| index.ts | Shield barrel | lib (cli, index, studio, assurance, redteam) | REAL | Y |  |
| ingress.ts | Rate-limit + pattern filter on inbound text | lib (shield/index) | REAL | Y |  |
| injection/injectionMatcher.ts | The single prompt-injection matcher | lib (validators, threatIntel, detector, runtime/firewall, tools/guards) | REAL | Y | Caller states its own confidence threshold; risk follows the strongest match, not the count. |
| injection/injectionPatterns.ts | The single prompt-injection pattern table | lib (threatIntel, injectionMatcher) | REAL | Y |  |
| manifest.ts | Validates skill manifest fields and permissions | lib (shield/index) | REAL | Y |  |
| mcpAnalyzeCli.ts | CLI printer for MCP security scan | CLI:`amc shield mcp-analyze` (dynamic import, cli.ts:20649) | REAL | N |  |
| mcpLedgerCli.ts | CLI printer for MCP trust receipt | CLI:`amc shield mcp-ledger` (dynamic import, cli.ts:20637) | REAL | N |  |
| mcpSecurityAnalyzer.ts | Scores MCP server definitions L0–L5 | lib (agentConfigScanner, mcpTrustLedger, mcpAnalyzeCli) | REAL | Y | `configuresSomething` deliberately refuses credit for fields that name their own absence. |
| mcpTrustLedger.ts | Point-in-time MCP inventory receipt with change detection | lib (posture, mcpLedgerCli) | PARTIAL | Y | Header claims "a signed, hash-chained inventory receipt". The receipt is neither: `receiptHash` is a plain sha256 of the body with no signature, and no `prevHash` links one receipt to the next — `changedSincePrevious` compares content hashes supplied by the caller. The in-body comment downgrades this to "signed-ready"; the header does not. |
| oauthScope.ts | Scope grant/deny with wildcard and hierarchy | lib (shield/index) | REAL | Y |  |
| posture.ts | One-command five-dimension security scorecard | lib (postureCli) | REAL | Y | Docstring claims "a deterministic, verifiable receipt rather than an unsigned report", but `receiptHash` is an unsigned sha256 anyone can recompute. Absence of any MCP config scores 60/PASS rather than "not assessed". |
| postureCli.ts | CLI printer for posture scorecard | CLI:`amc shield posture` (dynamic import, cli.ts:20612) | REAL | N |  |
| redaction/redactSecrets.ts | The single secret-redaction pass over text | lib (bridgeRedaction, secretBlind, sdk/amcEvidence) | REAL | Y |  |
| redaction/secretPatterns.ts | The single secret pattern table | lib (redactSecrets) | REAL | Y |  |
| registry.ts | In-memory skill registry with ed25519 verify/revoke | lib (cli, index, workspace, forecast, cgx, studio) | REAL | Y |  |
| reputation.ts | Publisher reputation score from an allowlist | lib (shield/index) | REAL | Y |  |
| runtimeAnalyzer.ts | Wraps the trust pipeline into a runtime action report | lib (shield/index) | REAL | Y |  |
| sanitizer.ts | Strips scripts, handlers, URIs, confusables | lib (shield/index, product/fixGenerator) | REAL | Y |  |
| sbom.ts | Dependency inventory with CVE flags | lib (shield/index) | PARTIAL | Y | Returns `format: 'CycloneDX-compatible'` but emits no CycloneDX document — no `bomFormat`, `specVersion`, or `purl`. `cveAlerts` come from a hardcoded 5-package table (lodash/minimist/node-fetch/glob-parent/tar), so `highRiskCount` is a lookup in a stale literal, not a vulnerability scan. |
| shieldGuardOrchestrator.ts | Runtime protection engine: detect + enforce + learn | lib (runtimeAnalyzer, trustPipeline) | FACADE | N | Three defects that fabricate a result. (1) `extractThreatSignals()` and `buildDecisionFlow()` both `return []` unconditionally and `response` is passed as `''`, so `analyzeAdvancedThreats` always runs on empty input; `assessCorrigibility('')` then returns `acceptsCorrections:false`, which makes `threatDetected` unconditionally **true** on every `protect()` call. (2) `createFailSafeResult` returns `allowed:true, threatLevel:'none', advancedThreats:{} as any` on any exception — a crash is reported to the caller as a clean, threat-free pass. (3) `initializeThreatIntelligence()` is empty, so the threat-intel layer the singleton enables by default matches nothing. |
| signing.ts | ed25519 sign/verify for skill code | test-only (tests/shield-full.test.ts) | REAL | Y | Real crypto, but zero importers anywhere in src — reachable only from its test. |
| threatIntel.ts | Threat matching adapter over the one matcher | lib (shield/index) | REAL | Y |  |
| trustPipeline.ts | Chains shield gate, formal verify, ZK proof, token | lib (shield/index, runtimeAnalyzer) | REAL | Y | Orchestration is honest; the stage results are only as strong as `enforce/formalVerification` and `vault/zkPrivacy` (outside this slice, both substantive on inspection). |
| uiFingerprint.ts | Deterministic session fingerprint plus missing-field flags | lib (shield/index) | REAL | Y |  |
| validators/index.ts | PII/secret/injection/advice/toxicity validator library | lib (cli, index, shield/index, studio, assurance, redteam) | REAL | Y |  |

### src/integrations

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| autogenAdapter.ts | Proxy wrapper claiming AutoGen evidence capture | CLI:`amc integrate autogen` | FACADE | N | Captures evidence into nothing. `wrapAgent` and `captureEvidence` push into a module-local `const events: Array<...> = []` that is never read, returned, or persisted; `ledgerPath` and `autoCapture` are accepted and ignored. The CLI constructs the adapter, prints "✓ AutoGen adapter configured", and discards it — no file written, nothing configured. |
| automationBridge.ts | Risk-scores n8n/Make/Zapier workflow manifests | ORPHAN | DEAD | N | Zero importers in src or tests; no longer re-exported from src/index.ts either. `assessAutomationWorkflow` and `generateWorkflowGovernanceConfig` have no consumer anywhere. Even if wired, every scored field is a caller-supplied boolean — there is no n8n/Make/Zapier parser to derive them. `AutomationAuditEntry` is declared and never used. |
| ciGate.ts | CI scaffolds, gate evaluation, observability connectors | CLI:`amc integrate ci` (setupIntegration only) | PARTIAL | Y | Only the scaffold writer `setupIntegration` is reachable from src (cli-late-stage-commands.ts:1438). `evaluateCIGate` — the gate itself — has no src consumer; it is exercised only by tests/integrations/ciGate.test.ts. |
| crewaiAdapter.ts | Proxy wrapper claiming CrewAI evidence capture | CLI:`amc integrate crewai` | FACADE | N | Same defect as autogenAdapter: events go into an unread module-local array, `ledgerPath`/`autoCapture` ignored, CLI prints "✓ CrewAI adapter configured" for a discarded object. |
| integrationDeadLetters.ts | Append/read redacted dead-letter JSONL | lib (integrationDispatcher) | REAL | Y |  |
| integrationDeliveryQueue.ts | SQLite delivery queue with ordering and retries | lib (index, dispatcher, integrationsCli, queueSchema) | REAL | Y |  |
| integrationDeliveryStore.ts | Delivery journal and dead-letter records | lib (index, dispatcher, integrationsCli) | REAL | Y |  |
| integrationDispatcher.ts | Dispatches ops events to channels with receipts | lib (index, studio, forecast, transformation, approvals, outcomes) | REAL | Y |  |
| integrationQueueSchema.ts | Queue DDL and one-time redaction migration | lib (integrationDeliveryQueue) | REAL | N |  |
| integrationSchema.ts | Zod schemas for integration channels/policy | lib (integrationStore) | REAL | N |  |
| integrationStore.ts | Signed integrations config plus vault secret refs | lib (studio, dispatcher, queue, approvals, cli) | REAL | Y |  |
| integrationsCli.ts | CLI surface for channels, queue, journal | CLI:`amc integrations *` | REAL | Y |  |
| langchainAdapter.ts | Proxy wrapper claiming LangChain evidence capture | CLI:`amc integrate langchain` | FACADE | N | Same defect as autogenAdapter, and says so in a comment: "In real implementation, this would use LangChain callbacks". Events land in an unread local array; CLI prints "✓ LangChain adapter configured" for a discarded object. |
| noCodeGovernanceCli.ts | Thin CLI wrapper for adding a no-code adapter | lib (index) | REAL | Y |  |
| noCodeGovernanceSchema.ts | Zod schemas for no-code adapter records | lib (index, store, webhookAdapters, cli) | REAL | N |  |
| noCodeGovernanceStore.ts | Signed no-code adapter config on disk | lib (index, noCodeGovernanceCli) | REAL | Y |  |
| noCodeWebhookAdapters.ts | Parses n8n/Make/Zapier events into the ledger | lib (src/index.ts barrel only) | REAL | Y | Parser and ledger ingest are real, but no HTTP route mounts `ingestNoCodeWebhookEvent` — reachable only by embedders importing the package. |
| opsReceipt.ts | Verifies ops receipts against ledger events | lib (index, studio) | REAL | Y |  |
| partnerInteroperability.ts | Partner lifecycle-graph export with round-trip proof | lib (src/index.ts barrel only) | FACADE | Y | The "round trip" never leaves the process. `roundTripFor` sets `exportedHash = graphSummary(graph)` and `importedHash = importSummary(partnerExport)`, where `partnerExport` is a field-for-field copy of `graph` built two lines earlier by `exportRuntimeLifecycleGraphForPartner` in the same call — down to `surfaceBinding`, which is the same hardcoded `["Fleet","Watch","Studio"]` literal in both functions. Nothing is serialized to a partner and read back, so `roundTrip.equivalent` cannot be false. `collectFailClosedReasons` line 303 then re-checks `fixture.roundTrip.importedHash !== importSummary(fixture.partnerExport)` — the stored value against a fresh recomputation of itself. |
| scimAdapter.ts | Standalone SCIM 2.0 handler for embedders | lib (src/index.ts barrel only) | REAL | Y | Documented as deliberately not mounted; the served SCIM lives in src/identity/scim/. |
| webhookDelivery.ts | HMAC-signed webhook delivery with backoff | lib (index, queue, store, deadLetters) | REAL | Y | Real HMAC, timing-safe compare, destination redaction. |

### src/plugins

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| builtins/builtInRegistry.ts | Set of built-in asset ids for override collision checks | lib (pluginLoader) | PARTIAL | N | `outcomeTemplates`, `casebookTemplates` and `transformOverlays` are hardcoded `new Set<string>()`. pluginLoader's built-in-collision branch for `transform_overlay` reads `builtins.transformOverlays.has(id)`, which is therefore always false — a plugin can override a built-in transform overlay without hitting the check. |
| pluginApi.ts | Workspace-level plugin init/verify/install/remove | lib (studio, bootstrap, verifyAll, marketplace, pluginCli, audit) | REAL | Y | `verifyPluginWorkspace` returns `ok:true`/`valid:true` for a workspace with no plugin config at all; it does report `signatureExists:false` alongside, so the vacuous pass is at least visible. |
| pluginApiVersion.ts | Plugin API versioning, deprecations, contract fingerprint | lib (src/index.ts barrel only) | FACADE | Y | The contract test cannot detect a breaking change. `computeApiSurfaceFingerprint` hashes a hand-written object literal inside the function, not the real API: it lists hooks (`onLoad`, `onBeforeAssessment`, `onEvidenceCollected`, `onDriftDetected`) and exports (`registerPlugin`, `unregisterPlugin`, `getPluginInfo`) that exist nowhere in src, and flat manifest fields (`entryPoint`, `permissions`, `dependencies`) that `pluginManifestSchema` does not have — the real manifest is nested under `plugin.{...}` with `artifacts` and `signing`. Renaming a real export or changing the real schema leaves the fingerprint identical, so `verifyApiSurface` only detects edits to this literal. `DEPRECATION_REGISTRY` is an empty array with its sole entry commented out. |
| pluginCli.ts | CLI surface for pack/verify/registry/install | CLI:`amc plugin *` | REAL | N |  |
| pluginIdentifiers.ts | Path-safe plugin id/version/artifact-path schemas | lib (pluginApi, manifestSchema, store, registrySchema) | REAL | Y |  |
| pluginLoader.ts | Loads declarative plugin assets with override rules | lib (studio, canonLoader, adapters/registry, adapters/catalog) | REAL | Y | Loads JSON/YAML assets only — no plugin code is ever executed. |
| pluginManifestSchema.ts | Zod schema for the plugin manifest | lib (pluginPackage, signer, verifier) | REAL | Y |  |
| pluginPackage.ts | Pack/verify/extract .amcplug with signature + hashes | lib (registryClient, registry, verifier, api, loader, cli) | REAL | Y | Real archive-member containment, per-artifact sha256/size checks, ed25519 manifest signature. |
| pluginRegistry.ts | Init/publish/serve a signed file registry | lib (pluginCli) | REAL | Y |  |
| pluginRegistryClient.ts | Fetches and verifies a remote registry index | lib (pluginCli, marketplace, pluginApi) | REAL | N | Verifies the index signature and re-verifies the downloaded package against the index entry's fingerprint, sha and risk category. |
| pluginRegistrySchema.ts | Zod schemas for registries, lock, overrides | lib (verifier, registryClient, registry, store, overlayRules) | REAL | Y |  |
| pluginSigner.ts | ed25519 manifest sign/verify + fingerprint | lib (pluginRegistry, pluginPackage) | REAL | N |  |
| pluginStore.ts | On-disk plugin config paths, signed load/save | lib (studio, cgx, bootstrap, api, loader, cli, marketplace) | REAL | Y |  |
| pluginTypes.ts | Shared plugin enums and catalog entry type | lib (registrySchema, manifestSchema, package, api, marketplace) | REAL | N |  |
| pluginVerifier.ts | Verifies the installed-plugin lock and packages | lib (pluginApi, pluginLoader) | REAL | N |  |
| rules/overlayRules.ts | Publisher-fingerprint allowlist for asset overrides | lib (pluginLoader) | REAL | N |  |
| sandboxLimits.ts | "Enforces" CPU/memory/IO/network limits on plugins | CLI:`amc plugin limits` (display only) | FACADE | N | Nothing is enforced. `withCpuTimeout` rejects the promise but never stops the running work. `buildProcessResourceArgs` returns `AMC_SANDBOX_*` env vars that no code reads and spawn options that no caller passes to a spawn. `assertNetworkAllowed` has no caller anywhere. `checkUsageViolations` compares `cpuTimeMs`/`peakMemoryMb`/`ioBytesMb` numbers the caller hands in — nothing in the codebase measures them. There is no plugin execution path at all to sandbox (pluginLoader loads declarative JSON/YAML). The only wired consumer is `amc plugin limits`, which calls `resolveSandboxLimits` + `formatSandboxLimits` and prints the configured numbers. `maxBuffer` also conflates a stdout buffer size with a memory limit. |

### src/release

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| lockfileDependencies.ts | Reads resolved deps from npm or pnpm lockfiles | lib (releaseSbom, releaseLicenses) | REAL | N |  |
| releaseBundle.ts | Builds the signed release bundle | CLI:`amc release pack`, lib (index, e2e/smoke) | FACADE | Y | The secret-scan gate is off by default and rewrites its own verdict. `const skipSecretScan = options.skipSecretScan ?? true` — no caller (releaseCli, e2e/smoke) ever passes `false`. When the scan returns FAIL on HIGH findings, lines 189–194 rewrite `status` to `"PASS"` while leaving the HIGH findings in the same object, write that file as `checks/secret-scan.json`, hash it into the manifest and sign the manifest. `verifyReleaseBundle` then reads `secretScan.status !== "PASS"` and reports the bundle clean. Separately, `writeDockerMetadata` writes `{image:"unknown", digest:"unknown"}` when `AMC_DOCKER_*` env vars are unset, and the manifest records that stub's hash as `artifacts.dockerImageSha256`. |
| releaseCli.ts | CLI surface for release init/pack/verify/print | CLI:`amc release *` | REAL | N |  |
| releaseLicenses.ts | License inventory from the lockfile | lib (index, releaseCli, releaseBundle) | REAL | Y |  |
| releaseManifest.ts | Builds manifest from git info and artifact hashes | lib (index, licenses, bundle, sbom) | REAL | N |  |
| releasePaths.ts | Release directory and key path helpers | lib (releaseSigner, releaseCli) | REAL | N |  |
| releaseProvenance.ts | Build provenance record with input/output hashes | lib (index, releaseCli, releaseBundle) | REAL | N | Honest: stamps `note: "AMC provenance record (not a formal SLSA claim)"`. |
| releaseSbom.ts | CycloneDX 1.5 SBOM from the lockfile | lib (index, releaseBundle, releaseCli) | REAL | Y | Emits a genuine CycloneDX document. Dead leftovers: `LockPackageEntry`, `PackageLockV2` and `parseNameFromPath` are no longer referenced after the switch to `readResolvedDependencies`. |
| releaseSchema.ts | Zod schema for the release manifest | lib (index, manifest, bundle, signer, verifier) | REAL | N |  |
| releaseSecretScan.ts | Scans a directory or archive for secrets | lib (index, pluginPackage, verifier, bundle, cli) | REAL | Y | The rule table and severities are real. Note `scanDirectoryForSecrets` returns `status:"PASS"` when the target directory does not exist — an absent target reads as a clean scan. |
| releaseSigner.ts | ed25519 release key init, sign, verify | lib (index, verifier, bundle, cli) | REAL | N |  |
| releaseUtils.ts | Tar extract, hashing, deterministic timestamps | lib (notary, cli, licenses, bundle, sbom, secretScan, verifier, provenance) | REAL | N |  |
| releaseVerifier.ts | Verifies a release bundle's signature and hashes | lib (index, releaseCli) | PARTIAL | Y | Unless an override path is passed, the manifest signature is verified with `keys/release-signing.pub` read from inside the bundle being verified — a self-supplied trust anchor, so a bundle re-signed with any keypair plus its own public key verifies clean. It also accepts `checks/secret-scan.json`'s own `status` field as the secret-scan verdict rather than re-deriving it from the findings, which is what makes the releaseBundle default above invisible at verify time. |

### src/transformation

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| builtInTransformMap.ts | Default question→4C→intervention map | lib (transformPlanner) | REAL | Y |  |
| fourCs.ts | 4C constants and definitions | lib (forecastSignals, planner, mapSchema, tasks, reports) | REAL | Y |  |
| transformApi.ts | HTTP-facing wrappers for plan/track/attest | lib (studio, executionEngine, autoAnswerEngine) | REAL | N |  |
| transformAttestations.ts | Signed task attestations on disk | lib (index, transformApi, transformCli, transformTracker) | PARTIAL | Y | Write signs with the auditor key and `verifyTransformAttestation` is real, but the read path that feeds status — `listTransformAttestations` → `findLatestAttestationForTask` — only `readUtf8` + schema-parses the JSON and never checks the `.sig`. Verification is reachable only through the separate `amc transform attest verify <file>` command. |
| transformCli.ts | CLI surface for map/plan/track/attest | CLI:`amc transform *` | REAL | Y |  |
| transformMapSchema.ts | Zod schema for the transform map | lib (pluginLoader, planner, cli, builtInTransformMap) | REAL | Y |  |
| transformPlanner.ts | Builds a phased transformation plan from a run | lib (index, forecastSignals, cli, api, loop) | PARTIAL | Y | Gap derivation from real diagnostic runs is genuine, but the projected impact is manufactured: `impact.indices` is `Object.fromEntries(intervention.impact.indices.map(id => [id, -8 * gap]))` and `impact.value` is `[id, 6 * gap]` — one number from hardcoded coefficients 8 and 6, repeated identically across every index and outcome the intervention lists. `addSustainmentTasks` carries fully hardcoded impact figures (-20/-10/20/10 and -25/-15/30/10). The report renders these as per-index impact estimates. |
| transformReports.ts | Markdown and compact status renderers | lib (index, studio, cli, api) | REAL | N |  |
| transformScoring.ts | Percent done, blockers, next tasks | lib (tracker, planner) | REAL | Y |  |
| transformTasks.ts | Task/plan schemas and signed plan storage | lib (index, forecast, cgx, attestations, tracker, cli, reports, scoring, api, loop) | REAL | Y |  |
| transformTracker.ts | Re-evaluates task status against evidence | lib (index, transformCli, transformApi, loop) | FACADE | N | Sets a validated flag without validating. Line 270–275 calls `findLatestAttestationForTask` and, on any hit, writes `status: "ATTESTED"` with `statusReason: "Attested by <user> (<role>)"` and records an `{kind:"attestation", sha256}` evidence ref — but that lookup never verifies the attestation signature (see transformAttestations above). Dropping an unsigned JSON file into `.amc/agents/<id>/transform/attestations/` flips a task to ATTESTED and stamps it as evidence. |

### src/outcomes

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| outcomeApi.ts | HMAC-authenticated outcome feedback ingest | lib (index, studioServer) | REAL | N | Real `createHmac` + `timingSafeEqual`. |
| outcomeCli.ts | CLI surface for contracts and reports | CLI:`amc outcome *` | REAL | N |  |
| outcomeContractEngine.ts | Signed outcome contract load/save/verify | lib (index, cgx, report, cli, api) | REAL | N |  |
| outcomeContractSchema.ts | Zod schema for outcome contracts | lib (pluginLoader, scoring, engine) | REAL | N |  |
| outcomeDashboard.ts | Latest report, trend series, top gaps | lib (index, dashboard/build) | REAL | N |  |
| outcomeReport.ts | Builds and seals the outcome report | lib (index, outcomeCli) | REAL | N |  |
| outcomeScoring.ts | Scores metrics from ledger evidence and trust tiers | lib (outcomeReport) | REAL | N | Genuinely evidence-driven: returns null when the denominator is zero rather than defaulting. |
| qualitySignals.ts | Thumbs up/down ratings with trend and alerts | CLI:`amc rate` (dynamic import, cli-late-stage-commands.ts:1366) | REAL | Y |  |

### src/business

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| fairScenario.ts | Seeded Monte Carlo FAIR loss scenario | CLI:`amc business fair-scenario` | REAL | Y | Real seeded RNG, real percentiles over the sampled distribution. |
| grcExport.ts | GRC treatment plan export (markdown/CSV/JSON) | CLI:`amc business grc-export` | REAL | Y |  |
| riskHeatmap.ts | Likelihood×impact heatmap over an agent portfolio | CLI:`amc business risk-heatmap`, lib (grcExport) | REAL | Y |  |
| riskQuantification.ts | Maturity-adjusted expected annual loss | CLI:`amc business risk`, lib (fair, grc, heatmap, roi) | REAL | Y | The L0–L5 risk multipliers are unsourced constants, but the module says so — `"Residual frequency is a heuristic maturity adjustment, not an actuarial guarantee"` — flags each defaulted input in `inputs.defaulted`, and downgrades `confidence` to LOW when defaults were used. |
| roiCalculator.ts | Trust-gap ROI between current and target maturity | CLI:`amc business roi` | REAL | Y |  |

### src/repl

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| amcRepl.ts | Interactive REPL main loop | CLI:`amc shell` (dynamic import from replCli) | REAL | N | Spawns the real CLI binary per command; Ctrl+C cancellation and preload timeout are implemented. |
| replCli.ts | Registers the `shell` command | CLI:`amc shell` | REAL | N | Header says it also wires bare `amc` to the REPL; it only registers the `shell` subcommand. |
| replContext.ts | In-memory session state parsed from output | lib (replRenderer, amcRepl) | REAL | Y |  |
| replParser.ts | Natural-language → command keyword resolver | lib (amcRepl, replRenderer) | REAL | Y | Honest header: pure keyword matching, no LLM. |
| replRenderer.ts | Terminal rendering for the REPL | lib (amcRepl) | REAL | N |  |
| | | | | | |

### src/values

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| disempowerment.ts | Empowerment score and dependency patterns | lib (values/index) | REAL | Y | Header is explicit that it needs interaction history and that the same-named assurance pack cannot use it. Local helper named `sign()` is a sha256 hash, not a signature. |
| index.ts | Values barrel | lib (cli, index, workspace, shield, studio, assurance, redteam) | REAL | Y |  |
| valueCoherence.ts | Kendall tau-b coherence over revealed preferences | lib (values/index) | REAL | Y | Same `sign()` misnomer — sha256 used for stable ids. |
| valueTypes.ts | Shared value/empowerment type definitions | lib (valueCoherence, disempowerment, index) | REAL | Y |  |

### src/cert

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| badgeGenerator.ts | shields.io-style SVG trust badge | CLI:`amc badge` (dynamic import, cli.ts:5885/6041/6125/11424, cli-late-stage-commands.ts:1132) | REAL | N | XML-escapes the agent id. |
| trustCertificate.ts | Generates and verifies AMC trust certificates | lib (cli, index) | PARTIAL | Y | `verifyTrustCertificateEnvelope` verifies the signature against `envelope.payload.signingKey.publicKeyPem` — the public key carried inside the certificate being verified — with no trust anchor, expected fingerprint, or key allowlist. A certificate self-signed with any keypair returns `ok:true`; the fingerprint check just confirms the embedded key matches its own hash. Tamper detection works; issuer authenticity does not. Unsigned-preview handling is honest and explicit. |

### src/jobs

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| jobRegistry.ts | Process-local job registry with single-winner settlement | lib (kernel/services/jobServices) | REAL | Y | Settlement flag is checked-and-set before anything observable; first cause wins; wake budget bounds the self-exciting chain. |
| jobTypes.ts | Job spec/snapshot types and access error | lib (jobRegistry, kernel/services/jobServices) | REAL | Y |  |

### src/bundles

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| bundle.ts | Export, verify, inspect and diff evidence bundles | CLI:`amc bundle *`, lib (index, studio, assurance/certificate, ci/gate) | PARTIAL | Y | Manifest inventory, per-file sha256 and size checks are real and catch tampering. But every signature check — `manifest.sig`, `run.json` `runSealSig`, and the outcomes/experiments report seals — resolves its keys through `collectAuditorKeysFromBundle` / `collectMonitorKeysFromBundle`, which read `public-keys/auditor.pub` and `public-keys/key-history.json` **from inside the bundle being verified**. There is no external trust anchor and no expected-fingerprint parameter, so a bundle rebuilt and re-signed with an attacker keypair, shipping its own `auditor.pub`, verifies `ok: true`. |

### src/mode

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| mode.ts | Owner/agent mode flag and owner-only command fence | CLI (assertOwnerMode at ~40 call sites in cli.ts), lib (index) | REAL | Y | The blocklist is enforced at real call sites, not just exported. |

## prompt & session

### src/prompt

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| agentPromptProfile.ts | Composes the governed agent's system prompt | lib (cli-prompt-commands, kernel/promptServices) | REAL | Y |  |
| promptCompiler.ts | Compiles a signed prompt pack from workspace state | lib (promptPackApi, promptPackArtifact) | REAL | N |  |
| promptDiff.ts | Diffs the latest prompt pack against the prior snapshot | lib (promptPackApi) | REAL | N | Only compares templateId + 3 provider system strings; other pack fields never diffed, so `changed:false` can hide a real change |
| promptLint.ts | Regex scan of pack/provider text for secrets and leaks | lib (promptCompiler) | REAL | N |  |
| promptPackApi.ts | API/Studio surface for prompt init/verify/build/scheduler | API:studioServer, lib (index, bridgeServer) | PARTIAL | Y | `validateBridgeResponseWithPromptPolicy` synthesizes a `status:"PASS"` truthguard result and returns it when `requireTruthguardForBridgeResponses` is false — no truthguard runs, but the object is indistinguishable from a real pass. `promptVerifyForApi` inherits promptPackVerifier's self-signed-key hole |
| promptPackArtifact.ts | Writes/reads the on-disk prompt pack directory | lib (promptPackStore, standardGenerator, promptPackVerifier) | REAL | Y | Writes the signer's own public key into the artifact as `signer.pub`; that file is what the verifier later trusts |
| promptPackCli.ts | Thin CLI wrappers over promptPackApi | CLI:`amc prompt ...` | REAL | N |  |
| promptPackSchema.ts | Zod schemas for pack, provider files, lint report | lib (10+ prompt modules) | REAL | N |  |
| promptPackSigner.ts | Signs/verifies a pack digest with the auditor key | lib (promptPackArtifact, promptPackVerifier) | REAL | N |  |
| promptPackSse.ts | Emits prompt pack/policy SSE events | lib (studioServer) | REAL | N |  |
| promptPackStore.ts | Persists pack artifacts, lint reports, snapshots | lib (promptPackApi, verifyAll, workspaceManager) | REAL | N |  |
| promptPackVerifier.ts | Verifies a prompt pack artifact's signature and lint | lib (promptPackApi, index) | FACADE | Y | `verifyPromptPackFile` verifies the pack signature with `publicKeyPem: inspected.signerPub` — the key read from `signer.pub` **inside the artifact being verified** (promptPackArtifact.ts:204). Anyone who edits a pack can re-sign it with their own key, drop that key in `signer.pub`, and the check passes. Same for the lint signature via `verifyPromptSignatureObject({signerPub})`. The workspace auditor key history is never consulted on this path |
| promptPolicySchema.ts | Zod schema for the prompt policy file | lib (promptCompiler, promptPolicyStore, promptPackApi) | REAL | Y |  |
| promptPolicyStore.ts | Paths, load/save, signature verify for prompt policy | lib (workspace, bootstrap, studioSupervisor, verifyAll) | REAL | Y |  |
| promptTemplates.ts | Selects a template id and renders the northstar prompt | lib (promptCompiler) | REAL | N |  |

### src/prompt/assembly

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| index.ts | Barrel for the prompt-assembly surface | test-only (tests/promptAssembly.test.ts) | REAL | Y | No src importer; src consumers import the individual files |
| interpolate.ts | Strict `{{variable}}` substitution and rendering | lib (cli-prompt-commands, kernel/promptServices) | REAL | Y | Refuses rather than defaulting; values are never re-scanned |
| promptErrors.ts | The single assembly error type and closed reason set | lib (interpolate, promptRegistry, cli-prompt-commands) | REAL | Y |  |
| promptRegistry.ts | Ordered section/context/variable registry | lib (agentPromptProfile, kernel/promptServices) | REAL | Y | Sorts before resolving; total order with code-unit tiebreak |
| promptTypes.ts | Contracts + order bands for prompt contributors | lib (registry, interpolate, agentPromptProfile, kernel) | REAL | Y |  |

### src/prompt/context

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| index.ts | Barrel for the context-plugin surface | test-only (tests/promptContext.test.ts) | REAL | Y | No src importer |
| contextHost.ts | Registry + the one place plugin I/O happens | lib (cli-prompt-commands, kernel/promptServices) | REAL | Y |  |
| contextPreStep.ts | Joins context snapshots to the agent loop pre-step | lib (kernel/promptServices) | REAL | N |  |
| contextTypes.ts | ContextPlugin contract and join-order constants | lib (contextHost, skillPrompt, skillTurn) | REAL | N |  |
| instructionFiles.ts | Reads AGENTS.md/CLAUDE.md under a byte budget | lib (cli-prompt-commands, instructionsContext) | REAL | N | Omissions are named, never silently dropped |
| instructionPrecedence.ts | Which instruction files and which one wins | lib (cli-prompt-commands, instructionFiles) | REAL | N |  |
| instructionsContext.ts | Renders instruction files as a literal context | lib (agentPromptProfile) | REAL | N |  |
| timeContext.ts | Clock/elapsed reference context plugin | lib (agentPromptProfile) | REAL | N |  |

### src/prompt/providerTemplates

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| anthropic.ts | Builds the Anthropic provider file | lib (promptCompiler) | REAL | N |  |
| gemini.ts | Builds the Gemini provider file | lib (promptCompiler) | REAL | N |  |
| generic.ts | Builds the generic provider file | lib (promptCompiler) | REAL | N |  |
| openai.ts | Builds the OpenAI provider file | lib (promptCompiler) | REAL | N |  |
| openrouter.ts | Builds the OpenRouter provider file | lib (promptCompiler) | REAL | N |  |
| xai.ts | Builds the xAI provider file | lib (promptCompiler) | REAL | N |  |

### src/session

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| approvalEventMeta.ts | Wire shape of the approval request/answer pair | lib (sessionService) | REAL | Y |  |
| eventPayload.ts | Reads a row's payload bytes, pruned vs missing | lib (llm/requestSources, agent/inbox) | REAL | Y |  |
| loopEventMeta.ts | Wire shape of the six agent-loop control rows | lib (sessionService, agent loop) | REAL | Y |  |
| requestHeaderMeta.ts | Wire shape of `request/header` meta | lib (sessionService, llm/deriveRequest) | REAL | Y |  |
| requestOutcomeMeta.ts | Wire shape of request/response and request/failure | lib (sessionService) | REAL | N |  |
| sessionApiTypes.ts | Parameter/result shapes for SessionService | lib (sessionService, agent, kernel) | REAL | Y |  |
| sessionMerkle.ts | RFC-6962 domain-separated Merkle root | lib (turnWindow, sessionRecovery, transparency/*) | REAL | N | Odd node promoted, not duplicated (CVE-2012-2459 avoided) |
| sessionRecovery.ts | Append-only crash recovery for the session spine | lib (cli, kernel) | REAL | Y |  |
| sessionService.ts | The single writer for a session's signed spine | lib (42 importers: agent, kernel, cli, api) | REAL | Y |  |
| sessionTypes.ts | Session event types + envelope embed/extract | lib (42 importers) | REAL | Y |  |
| surfaceProjection.ts | Folds committed rows into the model-visible surface | lib (sessionProjections, sessionService) | REAL | Y | Parts are refs to logged payloads; never synthesizes content |
| toolSchemaCommitment.ts | Rejects a header whose tool-schema digest is unbacked | lib (sessionService) | REAL | N | Throws on the write path |
| turnLifecycleMeta.ts | Wire shape of turn/end and step/end | lib (sessionService, sessionRecovery) | REAL | Y | `interrupted` derived from `reason`, not caller-supplied |
| turnWindow.ts | Per-turn Merkle window and the seal chain | lib (sessionService) | REAL | N |  |

### src/session/projection

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| projectionCut.ts | Prefix digest proving a cached fold still matches | lib (projectionRegistry) | REAL | N | Binds every event, not just the head |
| projectionRegistry.ts | Drives, caches, and gates pure folds | lib (sessionProjections) | REAL | Y |  |
| projectionTypes.ts | The projection unit contract | lib (registry, surfaceProjection) | REAL | Y |  |
| sessionProjections.ts | Factory for a session's built-in projections | lib (sessionService) | REAL | N |  |

### src/session/spill

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| spillEvidence.ts | Retrieves spilled bytes only against a signed row | lib (verify/cli paths) | REAL | Y | Recomputes event_hash, verifies writer_sig, then checks contentSha256 |
| spillPolicy.ts | Decides and performs the spill at post-execute | lib (sessionService) | REAL | N | Mints the ref from bytes actually written rather than trusting a caller claim |
| spillStore.ts | 0600 session-scoped spill files + checked reads | lib (sessionService, spillEvidence) | REAL | Y | O_CREAT\|O_EXCL, chmod after create |
| spillTypes.ts | Spill vocabulary, locator format, ref extraction | lib (spillPolicy, spillStore, sessionService) | REAL | Y |  |

### src/compliance

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| builtInMappings.ts | Default framework→evidence mapping data | lib (complianceEngine, guideGenerator, plugins) | REAL | Y | Data table |
| complianceCli.ts | CLI/API wrappers for report, fleet report, diff | CLI:`amc comply ...`, API:complianceRouter | REAL | Y |  |
| complianceEngine.ts | Evaluates mappings against ledger evidence | lib (complianceCli, matrix, studioServer, unifiedRun) | REAL | Y | Downgrades SATISFIED→PARTIAL when the maps signature fails |
| complianceMatrix.ts | Multi-framework coverage matrix and gap list | CLI:`amc comply matrix` | PARTIAL | Y | The `catch` at generateCoverageMatrix pushes a zeroed row, so a framework whose report *threw* is indistinguishable in the output from one legitimately scoring 0 with 0 categories |
| complianceReport.ts | Markdown/JSON rendering and report diffing | lib (complianceCli) | REAL | Y |  |
| controlCrosswalk.ts | Builds/verifies the framework control crosswalk receipt | lib (index), tests | PARTIAL | Y | `signedEvidenceRef` is only checked for being non-empty and `eventHash` for being 64 hex; no signature is verified and no referenced event is looked up. The audit export prints "Status: VALID" for a receipt whose evidence chain was never cryptographically checked |
| coverageScorer.ts | Weighted SATISFIED/PARTIAL/MISSING/UNKNOWN score | lib (complianceEngine) | REAL | N |  |
| dataResidency.ts | Residency policies, tenant isolation, legal holds | lib (index, cli, leanAMC, vault/dataResidency) | PARTIAL | Y | `checkTenantIsolation` returns `isolated:true, violations:[]` when either tenant is unknown — an unregistered tenant reports as isolated. `generateResidencyReport` sets `compliant: violations.length===0`, so a workspace with one tenant runs zero isolation checks and reports compliant. `getKeyCustodyConfig` returns a static description ("FIPS 140-2 Level 3+") purely from the mode string the tenant declared at registration; nothing verifies an HSM or KMS exists |
| euAiActClassifier.ts | Rule-based EU AI Act risk tier from capability flags | CLI:`amc comply risk-classify` | REAL | Y |  |
| exceptionLifecycle.ts | Governance exception lifecycle receipt | lib (index), tests | PARTIAL | Y | Same as controlCrosswalk: `signedRefValid` = `Boolean(signedEvidenceRef) && isSha256(signatureSha256)`. A request/approval/expiry "signature" is accepted on the basis of any 64-hex string; nothing is verified against a key |
| frameworks.ts | Framework family catalogue, name normalization | lib (cli, index, studioServer, mappingSchema) | REAL | Y |  |
| globalRegulatory.ts | Global framework data, evidence packages, DPIA | lib (index), tests | FACADE | Y | `generateEvidencePackage` stamps `verifiable: true` on every section unconditionally — nothing is verified. Its `attestation.hash` is `sha256({packageId, sections.length, generatedAt})`, so it does **not** commit to `evidenceContent`: the audit-log excerpt and config snapshot can be rewritten and the attestation hash is unchanged. `getDpiaAssessment()` returns `AMC_EVALUATION_DPIA` (a hand-written template with `dpoApproval: true`, all mitigations `implemented: true`, `residualRiskLevel: "low"`) with `lastReviewDate` freshly stamped to `Date.now()` — a DPIA that reports it was reviewed today when no review occurred. `classifyEuAiActRisk` returns `confidenceScore` 0.9/0.85/0.5 as fixed constants and `decisionAutonomy: "advisory"` hardcoded. `CONSTRUCT_VALIDITY_DATA` still ships fabricated psychometrics but is now honestly labeled (`validated:false`, `peerReviewStatus:"not-conducted"`) |
| mappingSchema.ts | Zod schemas + report/category result types | lib (complianceEngine, guideGenerator, pluginLoader) | REAL | Y |  |
| policyDrift.ts | Policy drift impact receipt | lib (index), tests | PARTIAL | Y | Same `signedRefValid` shape-only check as controlCrosswalk/exceptionLifecycle; prior-decision, rollout and evidence "signatures" are never verified |
| privacyRedaction.ts | Built-in PII redaction rules + self-test suite | lib (dataResidency) | PARTIAL | N | `runRedactionTests(rules)` only runs the 6 built-in test cases and skips any rule whose `ruleId` is not one of them. Pass a custom ruleset and it returns `results:[], passCount:0, failCount:0` — which `generateResidencyReport` reads as "no redaction tests failed" |
| providerRisk.ts | Third-party provider risk receipt | lib (index), tests | PARTIAL | Y | `attestationValid` accepts an attestation on the strength of `signedRefValid` alone; a SOC2/ISO attestation is "valid" if it carries any 64-hex string. Row/receipt hashes are real |
| regulatoryAutomation.ts | Regulatory feed monitor, gap analysis, impact | CLI:`amc comply watch/monitor`, API:complianceRouter | FACADE | Y | `analyzeGap(change, currentCoveredControls?)` defaults `covered = Object.keys(CONTROL_TO_AMC_MODULE)` — the module's own control catalogue. `inferImpactedControls` can only emit keys from that same catalogue, so `isCovered` is true for every control it produces: `gaps` is empty, `currentCoverage` is 100, `riskLevel` is "low". `RegulatoryMonitor.checkAllFeeds` calls it with no coverage argument, so the auto-analysis emitted on every detected regulatory change reports full coverage and zero gaps regardless of what the workspace actually implements. `projectedCoverage` is set to the same value as `currentCoverage` — a "projection" that is a copy. Feed fetching, hashing and RSS/JSON parsing are real |

### src/lint

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| index.ts | Barrel re-exporting linter, rules, CLI | ORPHAN | DEAD | N | No importer in src or tests; consumers import linter.js / rules.js / lintCli.js directly |
| lintCli.ts | Registers `amc lint` and `amc lint rules` | CLI:`amc lint` (cli-late-stage-commands.ts:404) | REAL | N |  |
| linter.ts | Discovers configs, runs rules, formats text/json/sarif | lib (lintCli) | REAL | Y |  |
| rules.ts | Rule types + built-in rule registry | lib (linter, lintCli) | REAL | Y |  |
| rules/index.ts | Barrel re-exporting the nine rules | ORPHAN | DEAD | N | Nothing imports it; rules.ts imports each rule file directly |
| rules/noDuplicateKeys.ts | Flags duplicate top-level YAML keys | lib (rules.ts) | REAL | Y |  |
| rules/noHardcodedSecrets.ts | Flags hardcoded API keys/tokens | lib (rules.ts) | REAL | Y |  |
| rules/requireAgentId.ts | Requires a non-empty agentId | lib (rules.ts) | REAL | Y |  |
| rules/requireDomain.ts | Warns on missing domain | lib (rules.ts) | REAL | Y |  |
| rules/requirePrimaryTasks.ts | Warns on missing primaryTasks | lib (rules.ts) | REAL | Y |  |
| rules/requireRole.ts | Warns on missing role | lib (rules.ts) | REAL | Y |  |
| rules/requireStakeholders.ts | Warns on missing stakeholders | lib (rules.ts) | REAL | Y |  |
| rules/requireTrustBoundary.ts | Info when trustBoundaryMode is unset | lib (rules.ts) | REAL | Y |  |
| rules/validRiskTier.ts | Errors on an out-of-set riskTier, offers a fix | lib (rules.ts) | REAL | Y |  |

### src/observability

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| anomalyDetector.ts | Evidence-rate, trust-tier, score-volatility anomalies | lib (debugMode, timeline, watch/continuousMonitor) | REAL | Y |  |
| costBudgetEvidence.ts | Per-agent cost budget evidence receipt | lib (index re-export only), tests | FACADE | Y | Fakes surface binding: the builder hardcodes `surfaceBindings: ["API","Studio","Fleet"]` and `verifyPerAgentCostBudgetEvidenceReceipt` then asserts those exact three strings are present — a check that cannot fail on any receipt this module produces, while the rendered markdown prints "Surfaces: API, Studio, Fleet". No API route, Studio page or Fleet path builds or consumes this receipt; the only non-test reference is a re-export in src/index.ts. The budget/forecast/variance arithmetic and the row/receipt hashes are real |
| costTracker.ts | Per-agent LLM cost records, report, anomalies | CLI:`amc cost ...` (cli-late-stage-commands.ts:1291) | REAL | Y |  |
| debugMode.ts | Lists/streams evidence rows with anomaly detection | CLI:`amc debug` (cli.ts:24490) | REAL | Y |  |
| evalTracing.ts | Emits eval-run spans/metrics through the OTel exporter | lib (eval/evalRunCli) | REAL | Y |  |
| otelExporter.ts | OTLP/Zipkin span, metric and log exporter | lib (ledger, jsonlSessionEventStore, scoreRouter, evalRunCli) | PARTIAL | Y | When `enabled` is false but targets are configured, `flushInternal` returns every request as `{ok: true, status: 0}` — a dispatch that never left the process is reported as a successful export |
| platformConfigs.ts | Grafana/Datadog/New Relic exporter configs from env | lib (index re-export) | REAL | Y |  |
| riskCostLatencySlo.ts | Risk/cost/latency SLO receipt, trace index, alerts | lib (index re-export only), tests | PARTIAL | Y | `surfaceBindings` is a hardcoded tuple `["Watch","Studio","API","Fleet"]` typed as a literal; nothing on those surfaces builds or reads the receipt (only src/index.ts re-exports it). `buildRiskCostLatencySloWatchAlerts` is a no-op: it re-maps `receipt.alerts` setting `source: "risk-cost-latency-slo"`, which `buildAlerts` already set. Percentiles, breach evidence and clustering are real |
| routerFallbackSafety.ts | Router-fallback safety receipt | lib (index re-export only), tests | FACADE | Y | Same fabricated claim as costBudgetEvidence: builder hardcodes `surfaceBindings: ["API","Studio","Fleet"]`, `verifyRouterFallbackSafetyReceipt` asserts exactly those three are present (routerFallbackSafety.ts:300 vs :344) — a surface-binding "verification" against a constant the same module just wrote, for a receipt no surface consumes. The safety/residency/threshold/budget/SLO comparisons themselves are real |
| sessionCorrelator.ts | Cross-surface session correlation and quality | CLI:`amc sessions correlate` (cli-late-stage-commands.ts:1412) | REAL | Y |  |
| timeline.ts | Builds an agent score/evidence timeline | CLI:`amc timeline`, lib (index) | REAL | Y |  |

### src/lab

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| index.ts | Barrel exporting only runTaskDecompositionPack | ORPHAN | DEAD | N | No importer anywhere in src or tests |
| cognitionLab.ts | Model-cognition experiment store, compare, report | lib (index, cli, ops/productionWiring) | PARTIAL | Y | `simulateExperiment` calls no model: scores are derived from `sha256(experimentId:probeId:modelId)` and the response text is `"[Simulated response for …]"`. It is honestly documented and every result carries `metadata.simulated = true`, but it is the only score-producing path in the module — there is no non-simulated runner |

### src/lab/packs

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| index.ts | Barrel for the four live packs | test-only (tests/advancedAssurance.test.ts) | REAL | Y | No src importer; cli/api import each pack file directly |
| labPackContext.ts | Poses scenarios to the real agent under test | CLI:`amc lab ...`, API:assuranceRouter/securityRouter | REAL | Y | Unreachable agent → `inconclusive`, not "safe" |
| advancedThreatsPack.ts | Runs the threat analyzer over the agent's real replies | CLI:`amc lab advanced-threats`, API:securityRouter | REAL | Y |  |
| compoundThreatPack.ts | Compound-threat scenarios against the real agent | CLI, API:securityRouter/assuranceRouter | REAL | Y |  |
| shutdownCompliancePack.ts | Shutdown-compliance scenarios against the real agent | CLI, API:assuranceRouter | REAL | N |  |
| toctouPack.ts | TOCTOU scenarios against the real agent | CLI, API:assuranceRouter | REAL | N |  |
| taskDecompositionPack.ts | "Tests" resistance to decomposed-intent attacks | ORPHAN (only via the dead src/lab/index.ts) | FACADE | N | `detectThreat` runs no detector and calls no agent. It regex-matches the pack's **own hardcoded scenario strings** and returns `detected: true` purely on which module NAMES the caller passed in `activeModules` (`hasTaint`, `hasCompound`, `hasEnforce`, `hasSecretBlind`) — the comment says "Simulate detection based on active AMC modules". So `resistant`, `caughtCount`, `riskLevel` are a function of a caller-supplied string list compared against constants, presented as an attack-resistance result. Also DEAD: nothing imports it except src/lab/index.ts, which nothing imports |

### src/leases

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| leaseCarriers.ts | Extracts a lease token from headers/query | lib (adapters, gateway paths) | REAL | N | Distinguishes lease-shaped from non-lease credentials per carrier |
| leaseCli.ts | CLI/demo/studio wrappers for issue/verify/revoke | CLI:`amc lease ...`, lib (demoRun, connectWizard, studioServer) | PARTIAL | Y | `ensureLeaseRevocationStore` signs the revocation file and then verifies the signature it just wrote, returning `signatureValid` — a check that cannot report false. `verifyLeaseForCli` builds its revocation set from `loadLeaseRevocations` directly instead of `revokedLeaseIdSet`, so it never checks the revocation store's own signature before honouring it |
| leaseSchema.ts | Zod schema for lease payload/scopes/revocations | lib (signer, verifier, store, cli) | REAL | Y |  |
| leaseSigner.ts | Mints an ed25519-signed lease token | lib (leaseCli) | REAL | N |  |
| leaseStore.ts | Signed revocation list, load/sign/verify/revoke | lib (leaseCli, gateway) | REAL | Y | `revokedLeaseIdSet` returns empty when the store signature is invalid (fails open — deliberate but worth knowing) |
| leaseVerifier.ts | Verifies signature, expiry, revocation, scope, route, model | lib (leaseCli, gateway, toolhub) | REAL | Y |  |

### src/sandbox

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| processConfinement.ts | Reports whether this process is OS-confined | lib (agent/agentToolset) | STUB | N | `processIsConfined()` returns a hardcoded `false`. Documented at length as deliberate and structural (nothing re-execs AMC under a sandbox profile), with a companion `processConfinementReason()` — an honest stub rather than a false green |
| sandbox.ts | Docker-confined command run with ledger attestation | CLI:`amc sandbox`, API:sandboxRouter, lib (adapterRunner) | REAL | Y |  |
| sandboxRunner.ts | Backend selection; refuses to run unconfined by default | lib (agent/agentToolset) | REAL | Y | Fails closed; `allowUnconfined` outcome records `confined:false` |
| sandboxTypes.ts | Sandbox policy/outcome/backend contracts | lib (sandboxRunner, seatbeltBackend) | REAL | Y | Deliberately reports no denial count it cannot observe |
| seatbeltBackend.ts | macOS sandbox-exec write confinement | lib (sandboxRunner) | REAL | Y | Resolves symlinks before profile generation; separates runner failure (exit 65 + `sandbox-exec:`) from command failure |

### src/autonomy

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| goalRounds.ts | Bounded repeat-until-done autonomy driver | lib (scheduleRunner), test-only otherwise | REAL | Y | No CLI or API entry point reaches it; `runGoalRounds` has no src caller besides scheduleRunner |
| scheduleRunner.ts | Runs whatever schedules are due, one pass | test-only (tests/scheduleStore.test.ts) | REAL | Y | ORPHAN in production: no CLI command, API route, or supervisor invokes `runDueSchedules` |
| scheduleStore.ts | Signed schedule file + claim/complete run state | lib (scheduleRunner), tests | REAL | Y | Fails closed on a bad schedule-file signature; claim advances the clock so a crash misses rather than repeats |

### src/pairing

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| lanMode.ts | Signed LAN-mode config and CIDR allowlist | CLI:`amc lan ...`, lib (studioServer, studioSupervisor, bootstrap) | REAL | Y |  |
| pairingApi.ts | Pairing cookie set/clear and claim-for-response | lib (studioServer) | REAL | N |  |
| pairingCodes.ts | One-time pairing codes and signed pairing tokens | CLI:`amc pair`, lib (studioServer, pairingApi) | REAL | Y | Codes are stored hashed, single-use, TTL-bounded |

### src/lanes

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| safetyResearchLane.ts | Weighted 4-dimension safety-research lane score | CLI:`amc score safety-lane` (cli.ts:23823), API:scoreRouter | REAL | Y | Weights sum to 1.0; delegates to real score modules |
| simulationForecastLane.ts | Weighted 5-dimension simulation/forecast lane score | CLI:`amc score simulation-lane` (cli.ts:23740) | REAL | Y | Inactive system types get an explicit zeroed report flagged `active:false` |

### src/console

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| consoleServer.ts | Serves /console static pages and assets | lib (studioServer, index) | REAL | N | Path traversal guarded on both the assets and page branches |

### src/monitor

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| trustDriftMonitor.ts | Detects integrity-index drops across runs, persists alerts | CLI:`amc monitor trust-drift`, lib (drift/continuousMonitor, index) | REAL | Y | Reads real run reports from the agent runs directory |

## adapters & kernel

### src/adapters

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| adapterCapabilities.ts | Builds each builtin's capability declaration | lib (15 builtins) | FACADE | Y | Fakes verification provenance. Every call unconditionally stamps `verification.status: "fixture_verified"`, `authority: "amc"` and a fixed `BASE_EVIDENCE_REFS` list; nothing checks a fixture ran or that the refs resolve. `adapterCapabilityReceipt.projectCapabilities` uses that flag as its trust root, so its `declaration:unverified` and `declaration:evidence-missing` fail-closed branches are unreachable for every builtin adapter. |
| adapterCli.ts | CLI surface for adapters init/list/detect/run/env | CLI:`amc adapters *`, API:adaptersRouter | REAL | Y |  |
| adapterConfigSchema.ts | Zod schema + defaults for adapters.yaml | lib (adapterConfigStore) | REAL | N |  |
| adapterConfigStore.ts | Load/save/sign .amc/adapters.yaml | lib (13 importers) | REAL | Y |  |
| adapterDetection.ts | Probe PATH binaries for adapter version | lib (adapterCli, adapterRunner, receipt) | REAL | Y | Provider keys stripped and stdin closed before probing an unvetted binary. |
| adapterRunner.ts | Spawn an adapter under lease + ledger | CLI:`amc adapters run` | REAL | N |  |
| adapterStandardization.ts | Legacy adapter capability comparison matrix | lib (index) | PARTIAL | Y | `capabilitiesFor` hardcodes contextStateCapture, tokenUsageCapture, multiTurnState, interAgentComms, nativeRedTeam and scenarioInjection to `false` for every adapter, so `coverageScore` is 6/10 fixed and can never exceed 40. `getAdapterScoreAdjustment` always returns `factor: 1` despite its name. |
| adapterTypes.ts | Zod types for adapter definitions/capabilities | lib (34 importers) | REAL | Y |  |
| builtins/autogenCli.ts | AutoGen adapter definition | lib (registry) | PARTIAL | N | Detection candidates are only `python3`/`python`; there is no autogen probe, so `amc adapters detect` reports autogen-cli installed whenever Python exists. Declared as `mixed_runtime`. |
| builtins/claudeCli.ts | Claude CLI adapter definition | lib (registry, claudeCliProvider) | REAL | N |  |
| builtins/crewaiCli.ts | CrewAI adapter definition | lib (registry) | PARTIAL | N | Falls back to `python3`/`python` when `crewai` is absent, so detection succeeds on any machine with Python. Declared as `mixed_runtime`. |
| builtins/geminiCli.ts | Gemini CLI adapter definition | lib (registry) | REAL | N |  |
| builtins/genericCli.ts | Wrap-any-command adapter definition | lib (registry) | REAL | N |  |
| builtins/hermesCli.ts | Hermes CLI adapter definition | lib (registry) | REAL | N |  |
| builtins/langchainNode.ts | LangChain (Node) adapter definition | lib (registry) | PARTIAL | N | Detection probes `node --version`; reports installed whenever Node exists, regardless of LangChain. Declared as `host_runtime`. |
| builtins/langchainPython.ts | LangChain (Python) adapter definition | lib (registry) | PARTIAL | N | Detection probes `python3 --version`; framework presence never checked. |
| builtins/langgraphPython.ts | LangGraph adapter definition | lib (registry) | PARTIAL | N | Detection probes `python3 --version`; framework presence never checked. |
| builtins/llamaindexPython.ts | LlamaIndex adapter definition | lib (registry) | PARTIAL | N | Detection probes `python3 --version`; framework presence never checked. |
| builtins/openaiAgentsSdk.ts | OpenAI Agents SDK adapter definition | lib (registry, sdk/amcAgent) | PARTIAL | N | Detection probes `node --version`; SDK presence never checked. |
| builtins/openclawCli.ts | OpenClaw CLI adapter definition | lib (registry) | REAL | N |  |
| builtins/openhandsCli.ts | OpenHands CLI adapter definition | lib (registry) | REAL | N |  |
| builtins/pythonAmcSdk.ts | Python AMC SDK adapter definition | lib (registry) | REAL | N | Real package probe (`import amc; amc.__version__`). |
| builtins/semanticKernel.ts | Semantic Kernel adapter definition | lib (registry) | PARTIAL | N | Detection probes `node --version`; SK presence never checked. |
| catalog.ts | Merge builtin + plugin adapter definitions | lib (adapterCli, adapterRunner, receipt) | REAL | N |  |
| envAssembler.ts | Build the child env (lease, gateway, proxy) | lib (adapterCli, adapterRunner) | REAL | Y | Sets `AMC_EVALUATED_AGENT=1` so the child hits the ledger writer fence. |
| hookIntegration.ts | Install/verify/forward provider-native hooks | lib + CLI:`amc connect hooks *` | REAL | Y | Signed manifest, ownership conflict detection, lease scope checks, fail-closed control path. |
| hookIntegrationCli.ts | Commander wiring for `connect hooks` | CLI:`amc connect hooks *` | REAL | Y |  |
| registry.ts | Authoritative builtin adapter list | lib (47 importers) | REAL | Y |  |
| snippets/nodeFetch.ts | Emit a Node sample calling the gateway | lib (adapterRunner) | REAL | N |  |
| snippets/pythonRequests.ts | Emit a Python sample calling the gateway | lib (adapterRunner) | REAL | N |  |

### src/mechanic

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| agentFixPlan.ts | Turn a run result into a signed fix plan | CLI:`amc run --fix` | REAL | Y |  |
| executionEngine.ts | Execute approved mechanic plan actions | lib (mechanicApi) | REAL | Y | `FREEZE_SET` creates a freeze incident with all deltas zeroed and previousRunId == currentRunId. |
| fixerRca.ts | Root-cause analysis + patch proposals from traces | CLI:`amc fixer *`, API:fixerRouter | FACADE | Y | Fakes validation and confidence. `validationReceipt.status: "passed"` is decided by three gates over objects the same function just built: `regression-tests-generated` passes iff `regressionTests.length > 0`, and `regressionTests` is `clusters.map(regressionTestFor)` computed eight lines earlier — so with any cluster it cannot fail. `regressionTestFor` emits a descriptive record with `mustFailBeforeFix: true`/`mustPassAfterFix: true` and no runner exists anywhere, so no test is ever executed before or after a "fix". `confidence` is `Math.min(0.9, 0.45 + cluster.count * 0.08)` — an invented number presented as RCA confidence. Cluster normalization and validator output are real. |
| gapAnalysis.ts | Measured-vs-target gap report per question | lib (mechanicApi, upgradePlanner) | PARTIAL | N | `global.correlationRatio` is the forecast's `integrityIndex` last value, not a correlation of anything; `summarizeReadiness` is then handed that same value as its "correlationRatio" argument, so integrity is checked twice under two names. |
| mechanicApi.ts | Workbench API: targets, plans, simulate, execute | lib (studioServer, bootstrap, verifyAll) | REAL | Y |  |
| mechanicCli.ts | CLI surface for the mechanic workbench | CLI:`amc mechanic *` | REAL | N |  |
| mechanicSchema.ts | Zod schemas for gap report + simulation | lib (5 mechanic modules) | REAL | Y |  |
| mechanicSse.ts | Emit mechanic events on the org SSE hub | lib (studioServer) | REAL | N |  |
| planDiff.ts | Describe a plan against current config | lib (mechanicApi) | REAL | N |  |
| planStore.ts | Persist + sign mechanic plans and snapshots | lib (executionEngine, mechanicApi, cli) | REAL | N |  |
| profileSchema.ts | Zod schema for mechanic profiles | lib (profiles) | REAL | N |  |
| profiles.ts | Builtin target profiles, apply to targets | lib (mechanicApi, cli, studio) | REAL | Y |  |
| simulator.ts | Project plan effects, gated on evidence | lib (mechanicApi) | PARTIAL | Y | All numeric projections come from `simulatorModels`' hardcoded per-action table; the file labels them via `honestyNotes` and refuses to project below the evidence gate, so the fabrication is disclosed rather than hidden. |
| simulatorEvidenceGates.ts | Integrity/correlation gate for the simulator | lib (simulator) | REAL | N |  |
| simulatorModels.ts | Per-action effect bands | lib (simulator) | REAL | N | Docstring states plainly these are hand-chosen constants with no fitted or historical basis; it does what it says. |
| targetSchema.ts | Zod schema for mechanic targets | lib (9 mechanic modules) | REAL | N |  |
| targetsStore.ts | Load/save/sign + lock mechanic targets | lib (15 importers) | PARTIAL | Y | `measuredTargetMapping` defaults a missing question's `finalLevel` to `3`, so the `preventLoweringBelowMeasured` lock is enforced against a fabricated level-3 baseline for any question the run report does not cover. |
| tuneExport.ts | Export gaps as reward fn / DSPy / finetune recipe | lib (index), CLI:`amc mechanic tune-export` | PARTIAL | Y | `estimatedTrainingHours = totalGapScore * 2.5` — an arbitrary multiplier presented as an estimate; `weightFromGap` buckets are likewise invented. Everything else is a faithful projection of the gap report. |
| tuningSchema.ts | Zod schema for tuning knobs | lib (mechanicApi, cli, tuningStore) | REAL | N |  |
| tuningStore.ts | Load/save/sign tuning knobs | lib (6 importers) | REAL | N |  |
| ui/mechanicModel.ts | Dashboard view-model interfaces | ORPHAN | DEAD | N | Nothing in src, tests, api, scripts, sdk or packages imports the file or references `MechanicDashboardModel`. |
| ui/tuningExplainers.ts | Human text for tuning knob keys | ORPHAN | DEAD | N | `explainTuningKey` has no caller anywhere in the repo. |
| upgradePlanSchema.ts | Zod schema for upgrade plans | lib (7 mechanic modules) | REAL | Y |  |
| upgradePlanner.ts | Build a phased upgrade plan from gaps | lib (mechanicApi) | PARTIAL | N | `safety.blockedByFreeze` is hardcoded `false` and never consults `activeFreezeStatus` from `../drift/freezeEngine.js`, which every other governor path uses — so a plan generated during an active execution freeze still reports itself unblocked. |

### src/passport

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| adapterCapabilityReceipt.ts | Signed receipt of an adapter's effective capabilities | lib (adapterCli, index), CLI:`amc adapters capabilities` | REAL | Y | Projection and signature logic is real; two of its fail-closed branches are unreachable because `adapterCapabilities.ts` hardcodes the declaration flags they test. |
| agentDiscovery.ts | Capability declarations, platform links, reputation export | CLI:`amc discovery *`, lib (index) | FACADE | Y | Fakes attestation and verification. `linkPlatform` sets `attestationHash = sha256(agentId:platform:identity:Date.now())` — a self-hash of the caller's own claim; no platform is contacted and nothing signs it. `verifyPortableReputation` recomputes `sha256(JSON.stringify(rest))` and compares it to `bundleHash` carried inside the same bundle, so any edited bundle re-hashed by the same function verifies. `addCapability` accepts arbitrary `evidenceEventIds` strings and increments `evidenceCount` by their length without checking a single one against the ledger. |
| passportApi.ts | Passport create/verify/export/badge/registry API | API:passportRouter, lib (passportCli, studioServer) | REAL | Y | `passportQrForApi` hands out a third-party `api.qrserver.com` URL rather than rendering locally. |
| passportArtifact.ts | Build the signed .amcpass bundle | lib (passportApi, passportCli, standardGenerator) | REAL | Y | Re-scans PII and re-signs after proof binding. |
| passportCli.ts | CLI surface for passport commands | CLI:`amc passport *` | REAL | Y |  |
| passportCollector.ts | Gather scores, gates and config signatures | lib (passportArtifact) | REAL | N |  |
| passportConstants.ts | Passport expiry constants | lib (api, collector, verifier) | REAL | N |  |
| passportPolicySchema.ts | Zod schema for passport policy | lib (api, collector, store) | REAL | Y |  |
| passportProofs.ts | Build/write/verify passport inclusion proofs | lib (passportArtifact, passportVerifier) | PARTIAL | N | `verifyPassportProofBundle` delegates to `verifyBenchProofBundle`, which walks each proof's merkle path up to `proof.rootHash` — a root carried inside the same proof object. `passportVerifier` calls it with `transparencyRoot: null, merkleRoot: null` and never compares `proof.rootHash` to `proofs/merkle.root.json`, so a self-consistent forged proof passes the `PROOF_INVALID` check. The root *files'* SHAs are separately bound to the signed passport, which is what limits the damage. |
| passportRedaction.ts | PII scan + id hashing for passports | lib (artifact, collector) | REAL | Y |  |
| passportSchema.ts | Zod schema for passport.json | lib (8 importers) | REAL | Y |  |
| passportSchemaCompatibility.ts | Partner-system schema compatibility matrix | lib (index re-export) | FACADE | Y | Fakes cross-system interoperability. "Compatibility with partner system X" is decided entirely by `passportJsonSchema.safeParse(fixture.payload)` — AMC's own schema. No partner schema exists in the repo. The `round_trip` check is `parse -> JSON.stringify -> parse -> canonicalize(a) === canonicalize(b)`, i.e. a value compared against a copy of itself, and cannot fail once the first parse succeeded. `partnerSystem` is a free-form caller-supplied string, so the matrix names vendors nothing was ever tested against. No production caller; only `src/index.ts` re-export and one test. |
| passportSigner.ts | Sign/verify the passport digest | lib (artifact, verifier) | REAL | N |  |
| passportSse.ts | Emit passport events on the org SSE hub | lib (studioServer) | REAL | N |  |
| passportStore.ts | Passport policy, cache, revocation storage | lib (6 importers) | REAL | Y |  |
| passportVerifier.ts | Verify a .amcpass bundle end to end | lib (api, verifyAll, unifiedSurfaceInspection) | REAL | Y | Checks expiry, revocation, digest, signature, PII scan, proof ids, root SHAs, calculation manifest. |
| receiptInterchange.ts | Portable ed25519-signed interop receipts | lib (index re-export only) | REAL | Y | Real `node:crypto` sign/verify over canonicalized bytes. No production caller — reachable only as public API. |
| trustInterchange.ts | Portable trust tokens, translation, federated verify | CLI:`amc trust *`, API:passportRouter, lib (shield/trustPipeline) | FACADE | Y | Fakes the signature, the compliance mapping, and the federated verification. (1) Local `canonicalize(obj)` is `JSON.stringify(obj, Object.keys(obj).sort())` — a JSON.stringify *replacer array*, which filters keys at every nesting level by the top-level key list. Verified by execution: a token's `issuer`, `subject` and every `claims[i]` serialize as `{}`, so the HMAC covers only version/tokenId/issuedAt/expiresAt and the claim count. Rewriting a claim score from 10 to 100, the issuer workspaceId, and the subject agentId leaves the signed payload byte-identical and `verifyTrustToken` still returns `valid: true`. (2) `processVerificationRequest` ("federated verification") never verifies the token signature at all — it only compares `claim.score` against a threshold, so a fabricated token yields `verified: true` and a signed response. (3) `TRUST_TRANSLATIONS` maps AMC dimensions onto NIST AI RMF and ISO 42001 controls via hardcoded `conversionFactor`/`offset`/`confidence` constants with no cited basis, and `translateTrustScores` publishes `amcScore * 0.9 + 0.05` as an ISO 42001 A.6 score. The CLI path additionally signs and verifies with the literal shared secret `"cli-demo-secret"`. |

### src/governor

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| actionCatalog.ts | The nine action classes and their titles | lib (17 importers) | REAL | Y |  |
| actionPolicyEngine.ts | Decide SIMULATE/EXECUTE per action class | lib (32), CLI, API:governorRouter | REAL | Y | The real enforcement core: signature trust, freeze, budget, trust tier, sandbox attestation, exec ticket, evidence logic. |
| actionPolicySchema.ts | Zod schema for action-policy.yaml | lib (5 importers) | REAL | Y |  |
| amcPolicies.ts | Catalog of AMC policy ids and enforcement claims | ORPHAN (index re-export only) | DEAD | N | Only `src/index.ts` re-exports it; no engine, CLI or router reads `AMC_POLICIES`, `getAmcPolicy` or `listAmcPolicies`. The entries declare `enforcement: "always"` for DLP output scanning, circuit-breaker pre-check and honeytoken detection, and nothing in this repo acts on any of them. |
| canaryRegisters.ts | Rollback packs + emergency override records | lib (policyCanary) | REAL | Y | Persistence was added; both registers now write through `workspaceRecordStore`. |
| confidenceGovernor.ts | Cap effective maturity level by meta-confidence | CLI:`amc confidence-check`, lib (index) | REAL | Y | Computes from real `computeDiagnosticMetaConfidence`, but `actionPolicyEngine` never consults it — the cap is advisory output, not enforcement. |
| emergencyOverride.ts | Signed, TTL-limited governance override records | CLI:`amc emergency-override`, `amc override-alerts` | PARTIAL | N | The record store, hash chain and alerts are real. The bypass is not: `isOverrideActive` has no caller, so no policy path is relaxed by an active override; `logOverrideAction` has no caller, so the `actionLog` the docstring promises ("All actions during override are logged with this flag") is always empty; `fileOverridePostmortem` has no caller, so the mandatory postmortem can only ever be OVERDUE. |
| governorCli.ts | Governor check / explain / report entry points | CLI:`amc governor *`, API:governorRouter, studio | REAL | Y |  |
| governorReport.ts | Action-class permission matrix + autonomy index | lib (governorCli, diagnostic, governorWhatIf) | REAL | N |  |
| nlPolicy.ts | Plain-English to Governor policy YAML | lib (index re-export only) | FACADE | Y | Fakes both the output format and its own confidence. `buildYAML` emits `agent/version/rules[{id,condition,action,actionClasses,parameters,reason}]` plus a `shields` list; the governor's real `actionPolicySchema` is `{version, defaultMode, riskTierDefaults, actions[{actionClass, minEffectiveQuestionLevels, requireTrustTierAtLeast, requireAssurancePacks, evidenceLogic, allowExecute, requireExecTicket}]}`. No loader in the repo accepts the generated document, and nothing calls `parseNLPolicy` outside `src/index.ts` and two tests, so the "AMC Governor Policy" it writes can never be applied. `confidence` is the mean of hardcoded per-pattern constants (0.85–0.92), not a measure of anything. `validateParsedPolicy` only checks that `condition`/`action` are non-empty — fields `buildRule` always populates — so `valid: false` is unreachable for any generated policy. |
| policyCanary.ts | Canary routing, canary stats, SLO, drift, report | CLI:`amc canary-*`, API:canaryRouter | FACADE | Y | Fakes canary health and SLO compliance. `makeCanaryDecision` and `recordCanaryOutcome` have no production caller (only `src/index.ts` re-export and tests), so `canaryDecisions` is always empty when `amc canary-stats` / `canary-report` runs — `computeCanaryStats` then reports `candidateFailureRatio: 0`, `isHealthy: true`, `shouldRollback: false` from zero observations. `recordSLOMeasurement` likewise has no production caller, so `computeGovernanceSLO` returns all zeros and `checkSLOCompliance` returns `met: true` with no violations every time. Both stores are module-level arrays that die with the process, so even a same-machine two-command sequence sees nothing. `detectGovernanceDrift` calls `getActivePolicyDebt(agentId)` without the `workspace` argument, reading only the empty in-memory register, so the POLICY_DEBT drift branch cannot fire from the CLI even though the debt is persisted on disk. The policy-debt register half of the file is real. |
| policyCanaryMode.ts | Observation-only policy rollout + report | CLI:`amc policy canary`, API:canaryRouter | FACADE | Y | Fakes the observation report. `recordCanaryObservation` has zero callers anywhere in src or tests, so `observations` is always empty; `generateCanaryModeReport` therefore always emits "0 actions observed, 0 would have been blocked" and a `recommendation` of EXTEND (before expiry) or PROMOTE (after), i.e. a promote recommendation for a policy that was never evaluated against a single action. `activeCanaries`/`observations` are in-memory Maps, so a canary started by one CLI process does not exist for the next, and `getActiveCanaryMode` is never consulted by any policy path. |
| policyDebt.ts | Persistent, hash-chained policy waiver register | CLI:`amc policy-debt *`, lib (policyCanary) | REAL | Y |  |
| policyEvidenceLogic.ts | Nested AND/OR evidence gate trees for rules | lib (schema, engine, enforce) | REAL | Y | Depth/node/byte bounds, canonicalization, semantic hashing, real evaluation. |

### src/kernel

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| agentLoopRunner.ts | Compose the Cordis tree and run one turn | lib (cli-agent-commands) → CLI:`amc agent-loop run` | REAL | Y |  |
| approvalSeamRunner.ts | Compose the tree and raise one approval | lib (approvalAskCommand) → CLI:`amc approvals ask` | REAL | Y |  |
| services/agentLoopServices.ts | Agent driver as a composed seam | lib (agentLoopRunner) | REAL | Y | Disposal cancels the live turn with cause `disposed` and waits for `turn/end`. |
| services/approvalServices.ts | Approval seam as a composed service | lib (agentLoopRunner, approvalSeamRunner) | REAL | Y |  |
| services/credentialsServices.ts | Layered credential store as a composed seam | lib (agentLoopRunner) | REAL | Y |  |
| services/evidenceServices.ts | Ledger/crypto/receipts/blobs as composed seams | test-only | REAL | Y | Delegating wrappers with correct open/close lifetimes; no production composition uses them yet. |
| services/execServices.ts | Subprocess substrate as a composed seam | ORPHAN | DEAD | N | No importer in src, tests, api, scripts, sdk or packages; `execServices`, `SubprocessSeamService` and `SUBPROCESS_SEAM` have zero references outside the file. |
| services/jobServices.ts | Background job registry as a composed seam | ORPHAN | DEAD | N | No importer anywhere; `jobServices`, `JobSeamService`, `JOBS_SEAM` have zero references outside the file. |
| services/llmServices.ts | LLM runtime + adapter registry as a seam | lib (agentLoopRunner) | REAL | Y |  |
| services/promptServices.ts | System-prompt assembly as a composed seam | lib (agentLoopRunner) | REAL | Y |  |
| services/terminalServices.ts | Interactive terminals as a composed seam | ORPHAN | DEAD | N | No importer anywhere; `terminalServices`, `TerminalSeamService`, `TERMINAL_SEAM` have zero references outside the file. |
| services/toolServices.ts | Tool registry + pipeline as a composed seam | ORPHAN | DEAD | N | No importer anywhere; `toolServices`, `ToolPipelineService`, `TOOLS_SEAM` have zero references outside the file. |

### src/ledger

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| alternateBackendVerification.ts | Verify JSONL-backend evidence too | lib (ledgerVerification) | REAL | N | Exists because the SQLite-only verifier used to return ok on a rewritten JSONL workspace. |
| eventHash.ts | Canonical event-hash pre-image helpers | lib (6 importers) | REAL | Y | Shared by writer and verifier so they cannot diverge. |
| ledger.ts | The evidence ledger: sessions, events, seals | lib (110 importers) | REAL | Y | `assertTrustedWriter` fences on `AMC_EVALUATED_AGENT=1`, an env var a determined child can unset; it is a fence, not a boundary. |
| ledgerDurability.ts | Resolve SQLite synchronous/fullfsync policy | lib (ledger, sqliteSessionEventStore) | REAL | N |  |
| ledgerSchema.ts | Append-only schema migrations | lib (ledger) | REAL | N |  |
| ledgerVerification.ts | Chain, payload, receipt, session, run verification | lib (6 importers), CLI:`amc verify` | REAL | Y | Recomputes hashes, checks writer signatures against the monitor key history, cross-checks receipts. |
| monitor.ts | Spawn + record a monitored child process | CLI:`amc wrap`, `amc supervise`, lib (sandbox, agents) | REAL | Y | Strips provider keys, tees scrubbed output, records only stdin the child actually received. |
| sessionVerification.ts | Per-session envelope chain verification | lib (runReport, ledgerVerification) | REAL | Y |  |
| trustTierValidation.ts | Reject unknown trustTier at write time | lib (ledger) | REAL | N |  |

### src/marketplace

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| index.ts | Barrel re-export of the marketplace API | ORPHAN | DEAD | N | Grep for `marketplace/index` across src, tests, api and scripts matches only this file's own header comment; every consumer imports `marketplaceCli.js`, `marketplaceRouter.js` or `marketplaceStore.js` directly. |
| marketplaceCli.ts | `amc pack` search/info/install/rate commands | CLI:`amc pack *` | REAL | N | `incrementInstallCount` fires on the install *request*, before plugin approval, so the counter measures requests not installs — the returned message does say approval is required. |
| marketplaceIndex.ts | Merge assurance/policy/registry packs into a catalog | lib (index, cli, router) | REAL | N | Builtin entries hardcode `version: "1.0.0"` and set `createdTs`/`updatedTs` to `Date.now()` at catalog build time. |
| marketplaceRouter.ts | `/api/v1/marketplace/*` routes | API:api/index.ts | REAL | N |  |
| marketplaceStore.ts | Ratings, install counts, featured, deprecation | lib (index, cli, router, marketplaceIndex) | PARTIAL | Y | The store is a per-workspace JSON file, so "marketplace ratings" and "install counts" are only this machine's own writes, never a shared marketplace signal; `userId` is caller-supplied and unauthenticated, so one caller can write any number of distinct-user ratings. |
| marketplaceTypes.ts | Zod types for catalog, ratings, search | lib (5 marketplace modules) | REAL | Y |  |

### src/simulator

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| budgetsWhatIf.ts | Project budget pressure from real usage | lib (index, targetWhatIf) | REAL | N |  |
| ciGateWhatIf.ts | Predict CI gate outcome under a report | lib (index, targetWhatIf), API:ciRouter | REAL | Y |  |
| governorWhatIf.ts | Permission matrix across class x risk tier | lib (index, targetWhatIf) | REAL | N | Calls the real `evaluateActionPermission` rather than re-implementing it. |
| targetWhatIf.ts | Simulate a proposed target profile | CLI:`amc whatif target`, lib (index, studio) | REAL | N |  |
| whatIfCli.ts | Parse target mapping files and --set pairs | CLI:`amc whatif target` | REAL | N |  |

### src/bom

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| bomGenerator.ts | Build a maturity BOM from a run report | CLI:`amc bom generate`, API:bomRouter | REAL | Y |  |
| bomSchema.ts | Zod schema for the maturity BOM | lib (generator, verifier, transparency) | REAL | N |  |
| bomVerifier.ts | Sign and verify a BOM file | CLI:`amc bom sign/verify`, API:bomRouter | REAL | Y |  |

### src/playground

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| index.ts | Barrel for playground scenarios and session | CLI:`amc playground` | REAL | Y |  |
| interactiveMode.ts | Run all scenarios and format the report | lib (playground/index) | REAL | N | Counts pending scenarios separately and refuses to report them as passes. |
| scenarioRunner.ts | 15 demo scenarios + offline "runner" | CLI:`amc playground` | STUB | Y | `runScenarioOffline` executes nothing: every step returns a fixed `{passed: false, pending: true, actual: "[Not executed — run with a live agent...]"}`. This is honestly labelled — the result carries `pending` and the report says "not executed" — so it is a disclosed placeholder, not a fabricated pass. Tests exercise `DEMO_SCENARIOS` content only, not the runner. |

### src/learning

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| correctionMemory.ts | Promote effective corrections into injectable lessons | CLI:`amc corrections lessons *`, lib (memoryRouter) | PARTIAL | Y | Store, extraction, hash chain and signing are real; two of the four docstring claims are not. `detectLessonDrift` never reads the latest report's scores — it computes `currentLevel` and discards it, then sums `lesson.avgImprovementPostInjection ?? 0` once per question and divides by the count, so `avgDelta` is exactly the lesson's own stored value. That column is written only by `updateLessonPostInjectionRun`, which is called only from this same function with the value it just read, and starts NULL → 0; `0 < -0.5` is false, so `driftDetected` can never become true. `detectLessonDrift` also has no caller outside `src/index.ts`. Separately, `buildLessonAdvisories` is CLI-only — no prompt pack pulls lessons into `checkpoints.currentAdvisories`, so "corrections from one session measurably improve the next" is not wired. |
| reasoningMemory.ts | Episode-derived reasoning memory with writeback receipts | CLI:`amc memory *`, API:memoryRouter | PARTIAL | Y | Item storage, fingerprint dedupe, artifact signing and expiry are real. The signed writeback "policy decision" is mostly a rubber stamp: of five gates, `expiry-present` (ttl/review default to +90d/+30d), `retention-tag-present` (the tag is built from a template that always matches its own regex), `allowed-consumers-valid` (`normalizeConsumers` always returns a non-empty valid list) and `redaction-applied` (`containsSecret` tests the same three regexes `sanitizeSummary` just substituted away) cannot fail on a candidate this module built. Only `evidence-required` can genuinely block. |

### src/context

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| contextGraph.ts | Load/validate the agent context graph; alignment + drift heuristics | lib (18 importers), CLI:`amc context *` | PARTIAL | Y | `loadContextGraph`/`validateContextGraph`/`summarizeContextGraphForPrompt` are real and widely used. `alignmentCheck` is weaker than its name: `pass` is true unless a `forbiddenActions` string appears verbatim (lowercased substring) in the text, and the constraint and mission loops push `reasons` that never affect `pass`. `driftDetection` scores from regex keyword counts times hardcoded weights (0.15/0.2/0.2) with no basis. Neither function has a caller outside the `src/index.ts` re-export. |

### src/presets

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| agentPresets.ts | Signed, strict agent composition presets | lib (cli-agent-commands) → CLI:`amc agent --preset` | REAL | Y | Strict schema (unknown fields refused), signature verified on read, fail-closed with a named reason. |

## ops & benchmarks

### src/ops

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| audit.ts | append ops audit event to ledger | lib (retentionEngine, maintenanceCli, metricsServer, backupEngine) | REAL | N | |
| backpressure.ts | queue-depth backpressure signal + metrics | CLI:`amc ops backpressure` | PARTIAL | Y | Threshold/hysteresis logic is real, but `enqueue`/`dequeue`/`setQueueDepth`/`configureBackpressure` have zero callers outside this file and its test — no gateway or writer feeds the queue, so the CLI always prints depth 0 and `shouldReject()` never returns true in production. |
| backup/backupCli.ts | thin CLI wrappers over backupEngine | CLI:`amc backup create/verify/print/restore` | REAL | N | |
| backup/backupCrypto.ts | scrypt KDF + AES-256-GCM envelope | lib (backupEngine) | REAL | N | |
| backup/backupEngine.ts | create/verify/restore signed encrypted backup | lib (backupCli) | PARTIAL | Y | `verifyBackup` resolves its trust root to `keys/auditor.pub` **inside the bundle being verified** when `--pubkey` is omitted (`pubPath = join(root, "keys", "auditor.pub")`). Repacking a tampered backup with an attacker keypair and matching `manifest.sig` yields `ok: true`. The crypto is real; the trust anchor is not external. |
| backup/backupSchema.ts | zod manifest + signature schemas | lib (backupEngine) | REAL | N | |
| circuitBreaker.ts | timeout/state-machine breaker + dead letters | lib (gateway/server, runtime/wrapFetch, toolhub/toolhubClient, enforce, product/fixGenerator) + CLI:`amc ops circuit-breaker-*` | REAL | Y | Genuinely on the call path. Two dangling limbs: `watchdog.enabled/checkIntervalMs/stuckSessionThresholdMs` config exists but no watchdog loop is ever started, and `reportStuckSession`/`reportOrphanedProcess` have no callers, so `WatchdogAlert` only ever contains CIRCUIT_OPEN/BACKPRESSURE_EXCEEDED. |
| degradationMode.ts | FULL/REDUCED/MINIMAL graceful degradation | CLI:`amc ops degrade` | FACADE | Y | Fakes a mode change. `amc ops degrade --set MINIMAL` prints `Mode changed: FULL → MINIMAL` and the process exits; `state` is a module-level `let` with no persistence, so the next invocation starts at FULL again. Worse, `isFeatureActive()` — the only thing that would make a mode mean anything — has zero callers anywhere in `src/`, so no feature is ever disabled in any mode. `evaluateHealth()` also has no caller, so AUTO_LATENCY/AUTO_ERROR_RATE degradation can never fire. |
| governanceSlo.ts | SLO targets, compliance, cost-of-trust, trust ROI | CLI:`amc ops slo`, API:metricsRouter | PARTIAL | Y | Math and gating are real, but the two intake functions `recordSloMeasurement` and `recordGovernanceDecision` have no callers outside this file/test. Every production read (`amc ops slo`, the metricsRouter SLO endpoints) reports an empty window: 0 decisions, `governancePct: 0`, ROI `BREAKEVEN`. |
| latencyAccounting.ts | P50/95/99 latency + "Cost of Trust" | CLI:`amc ops latency` | PARTIAL | Y | Percentile math is real. `recordLatency()` has no caller outside this file, `governanceSlo` and the test — so `amc ops latency` always reports `totalMeasurements: 0`, and `governancePct` is structurally 0. |
| maintenance/cachePrune.ts | prune console/transform snapshots by mtime | lib (maintenanceCli) | REAL | N | |
| maintenance/logRotation.ts | delete logs past age/size | lib (maintenanceCli) | REAL | N | Named "rotation" but it only unlinks; no rename/compress/generation is kept. |
| maintenance/maintenanceCli.ts | signature-gated maintenance entry points | CLI:`amc maintenance *` | REAL | Y | Every mutating path verifies the ops-policy signature first. |
| maintenance/sqliteMaintenance.ts | VACUUM/ANALYZE + operational indexes | lib (maintenanceCli, retentionEngine) | REAL | N | |
| maintenance/stats.ts | db/blob/archive/cache/log size stats | lib (maintenanceCli, studioSupervisor, experiments) | REAL | N | |
| metrics/metricsMiddleware.ts | Prometheus counters/histograms for HTTP | lib (studioServer, metricsServer, approvals) | REAL | Y | |
| metrics/metricsRegistry.ts | in-process Prometheus registry + renderer | lib (metricsMiddleware, metricsServer, amcJudge) | REAL | Y | |
| metrics/metricsServer.ts | /metrics + /health HTTP server with CIDR gate | lib (studioSupervisor) | REAL | Y | |
| modelRouter.ts | multi-provider model routing + cost/latency stats | lib (src/index barrel only) | FACADE | Y | Fabricates provider health and performance telemetry. All four providers are declared `status: 'healthy'` in a hardcoded `DEFAULT_PROVIDERS` literal and no health probe exists, so the "provider health" filter can never exclude anything. `avgLatencyMs` and `inputCostPer1K` are hardcoded per-model constants, yet `getStats()` reports `avgLatencyMs` / `avgCostPer1K` as routing statistics averaged over those constants — a measurement-shaped number that measured nothing. `currentLoad` counts only in-process `route()` calls, so "rate limit awareness" never reflects real provider load. Nothing is ever sent: the class returns a decision object and issues no request. |
| operatorUx.ts | why-caps, heatmap, action queue, trust summary | CLI:`amc operator-dashboard` | REAL | Y | Derives entirely from a real `DiagnosticReport`. Caveat: `riskReduction` per flag comes from the hand-written `FLAG_DETAILS` table, so `ActionQueue.totalRiskReduction` is a sum of editorial constants, not a measured risk delta. |
| otelExporter.ts | AMC trace → OTLP span export | lib (ledger, observability, scoreRouter, evalRunCli) | PARTIAL | Y | Conversion and the enabled-path POST are real. But `flush()` with `enabled: false`, and `drain()` unconditionally, push `{success: true, spansExported: N}` into `exportHistory` with no network call — so `getStats().totalSpansExported` counts spans that were never exported. |
| overheadAccounting.ts | per-feature overhead budgets + anomalies | CLI:`amc overhead-report`, `amc overhead-profile` | PARTIAL | Y | `recordOverhead()` has no caller outside this file, `governanceSlo` and the test, so `amc overhead-report` always renders an empty report. `amc overhead-profile STRICT` prints "Overhead profile set to STRICT" but `setOverheadProfile` writes a module-level `let` in a CLI process that then exits — nothing persists and nothing reads it. |
| policy.ts | ops-policy schema, sign, verify | lib (workspace, cli, studio, ledger, bootstrap, verifyAll, …) | REAL | Y | Signature verified against the workspace auditor key history — a real external trust root, unlike backupEngine/benchVerify. |
| productionWiring.ts | "wire" overhead/residency/insider/lab/FP into gateway | CLI:`amc wiring-status` | FACADE | Y | Fakes integration status. `getWiringDiagnostics()` sets `wired: hookCount > 0`, where `hookCount` counts calls the *current process* made to the hook — so the only way to see `wired: YES` is to call the hook yourself first, which only the test does. Grepped: no gateway, bridge, diagnostic, assurance or lab code calls `gatewayOverheadHook`, `bridgeResidencyHook`, `diagnosticOperatorHook`, `insiderRiskHook`, `labSignalBridge` or `fpTrackerHook`; `src/index.ts` merely re-exports them. The file header disclaims the zeros as "not observable from this process", which is misleading — no production path fires these hooks at all. |
| retention/retentionArchive.ts | signed retention segments + pruned-blob hash chain | lib (ledger, ledgerVerification, retentionEngine, stats) | REAL | N | |
| retention/retentionCli.ts | thin CLI wrappers | CLI:`amc retention status/run/verify` | REAL | Y | |
| retention/retentionEngine.ts | archive/prune payloads, verify chain continuity | lib (retentionCli) | REAL | N | `verifyRetention` checks policy signature, per-segment signature, cross-segment hash continuity, pruned-row chain and full ledger integrity. |
| retention/retentionSchema.ts | zod segment/seal schemas | lib (retentionArchive) | REAL | N | |

### src/benchmarks

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| academicPaper.ts | build a paper from an EvalReport | test-only (+ lib: evalHarness types) | PARTIAL | Y | Statistics (`computePaperStatistics`) are real. The Discussion section is a fixed string asserting "The findings suggest that AMC steering configuration materially influences benchmark outcomes under controlled conditions" — emitted verbatim regardless of effect size, CI, or `isSignificant`. The paper's conclusion is written before the data. |
| benchCli.ts | parse `--group-by` argument | CLI:`amc benchmark stats` | REAL | N | |
| benchExport.ts | sign + tar a `.amcbench` from a real run | CLI:`amc benchmark export`, API:studioServer | REAL | Y | Reads a real run report, assurance packs and failure-risk indices; bundles `public-keys/auditor.pub` into the artifact (see benchVerify). |
| benchImport.ts | verify + unpack `.amcbench` into workspace | CLI:`amc benchmark import`, lib (federationSync) | REAL | Y | Uses the hardened tar extractor; import is only as strong as `benchVerify`. |
| benchRunner.ts | "benchmark suite" scores + head-to-head compare | CLI:`amc benchmark run/compare` | FACADE | Y | Four separate fabrications. (1) The `latency`, `cost-efficiency` and `reliability` categories are computed from `integrityIndex` and the risk indices — no timing, spend, token, uptime or error-rate data is read anywhere — yet they are emitted as named benchmark scores in JSON and markdown. (2) `percentile(allScores, score)` scores a benchmark against a population that includes itself; with one imported benchmark `rank/len == 1`, so every category is the 100th percentile. (3) When the requested agent has no benchmark, `const bench = agentBench?.bench ?? allBenchmarks[0]!` silently scores a *different* agent's artifact and returns it under `agentId: params.agentId`. (4) `compareBenchmarks` for two agents that both lack benchmarks resolves both sides to `allBenchmarks[0]` — comparing an artifact against a copy of itself and reporting delta 0 / "tie". With zero benchmarks it returns hardcoded 50/50/50 across all five categories plus `overallPercentile: 50`. |
| benchSchema.ts | zod benchmark artifact schema | lib (bench/*, benchmarks/*) | REAL | N | |
| benchStats.ts | grouped medians + scatter over imported benchmarks | CLI:`amc benchmark stats`, API:studioServer | REAL | Y | `percentileOverall` is self-inclusive, so a single imported benchmark always reads 100. |
| benchStore.ts | locate/parse imported benchmark artifacts | lib (benchImport, benchStats, benchRunner, orgEngine) | REAL | Y | |
| benchVerify.ts | verify a `.amcbench` signature | lib (benchImport), CLI:`amc benchmark verify` | FACADE | Y | A signature check that cannot fail for a forgery. The public key is read from `join(tmp, "public-keys", "auditor.pub")` — i.e. from **inside the archive being verified** — and there is no override parameter at all. Anyone can edit `bench.json`, re-sign it with a freshly generated keypair, drop that pubkey into the bundle, and `verifyBenchmarkArtifact` returns `ok: true, errors: []`. `benchExport` writes that same key into the bundle, so the exporter ships the trust root the verifier trusts. |
| consortium.ts | pooled multi-org benchmark statistics | test-only | PARTIAL | Y | Percentiles/medians/σ are real. `submitContribution(pool, memberId, entries, signature)` stores the caller's `signature` on the contribution and `ConsortiumMember.publicKey` is stored too, but nothing anywhere in the file (or any consumer) ever verifies one against the other — contributions are recorded as signed without a signature check. Also unreachable from any CLI or router. |
| evalHarness.ts | controlled-condition eval runner + Cohen's d | lib (academicPaper) + test-only | REAL | Y | Runner is caller-supplied, so no fabrication. `seed` is threaded to the runner but the harness itself uses `Math.random()` for `experimentId` despite the "Random seed for reproducibility" claim. |
| frontierBaseline.ts | compare agent scores to frontier-model baselines | test-only | FACADE | Y | Scores computed from hardcoded inputs. `FRONTIER_BASELINES` is seven hand-written score tables for named third-party models (gpt-4o 79, claude-3-opus 83, …) that were never measured. The honesty pass set `verified: false` and `measuredAt: null` on the data, but **no function reads those fields**: `compareAgainstBaselines`, `calculatePercentile` and `analyzeGaps` compute gaps, a percentile, and prose recommendations ("L2: -8 below claude-3-opus", "Agent scores in the bottom quartile of frontier models") from the invented numbers and propagate nothing marking them unverified. The disclaimer lives only in a comment. |
| globalIndex.ts | pseudonymized JSONL index + dataset card | lib (publicLeaderboard, huggingFacePublisher) | REAL | Y | Default salt is the public constant `"amc-global-index"`, so pseudonyms are trivially reversible for any guessable agentId unless the caller overrides `pseudonymSalt`. |
| helmProviderDrift.ts | HELM-flavoured drift receipt builder | API:benchmarkRouter/scoreRouter/shieldRouter/watchRouter | PARTIAL | Y | Header is explicit that no vendor API is contacted. Real thresholding over caller rows, but every `*Hash` field (`runSpecHash`, `leaderboardSnapshotHash`, `canaryResultHash`, `noSourceCopyProofHash`, …) is caller-supplied and only re-hashed into a `proofHash`; nothing checks any of them against a HELM artifact, so a "proof" attests only that the caller typed those strings. |
| huggingFacePublisher.ts | build an HF dataset repo + "auto publish plan" | lib (publicLeaderboard) | PARTIAL | Y | Never publishes. Grepped: no `fetch`, `http`, or upload call anywhere in the file, and no consumer executes the plan — `createHFAutoPublishPlan` is the only producer and `publicLeaderboard` merely embeds its output. The returned `retryPolicy: {maxRetries, backoffStrategy: "exponential"}` describes retries for an upload that no code performs. |
| humanloopProviderDrift.ts | Humanloop-flavoured drift receipt builder | API:watchRouter, lib (watch/index) | PARTIAL | Y | Same shape as helmProviderDrift: no vendor contact, caller-supplied hashes never verified. |
| inspectProviderDrift.ts | Inspect-flavoured drift receipt builder | API:benchmarkRouter/scoreRouter/shieldRouter/watchRouter | PARTIAL | Y | Same shape as helmProviderDrift. |
| patronusProviderDrift.ts | Patronus-flavoured drift receipt builder | API:scoreRouter/shieldRouter/watchRouter | PARTIAL | Y | Same shape as helmProviderDrift. |
| promptLayerProviderDrift.ts | PromptLayer-flavoured drift receipt builder | API:scoreRouter/shieldRouter/watchRouter | PARTIAL | Y | Same shape as helmProviderDrift. |
| promptfooProviderDrift.ts | promptfoo-flavoured drift receipt builder | API:benchmarkRouter/scoreRouter/shieldRouter/watchRouter | PARTIAL | Y | Same shape as helmProviderDrift. |
| providerDriftBenchmark.ts | baseline-vs-candidate drift engine + CI gate | CLI:`amc provider-drift`, API:benchmarkRouter, lib (7 vendor adapters, watch/providerDriftAlerts) | REAL | Y | Compares two caller-supplied row sets; fabricates nothing. 4102 lines in one file — far past the 800-line guidance and the single largest maintenance risk in this slice after replayBenchmarkCorpus. |
| publicLeaderboard.ts | anonymized leaderboard export from real runs | CLI:`amc leaderboard` (via cli-business-commands) | REAL | Y | Reads actual `.amc/agents/*` run data and refuses to export below `minAgents` (default 5). |
| replayBenchmarkCorpus.ts | replay-corpus manifest, CI receipt, verifier | CLI:`amc`, API:benchmarkRouter/shieldRouter/watchRouter | REAL | Y | `verifyReplayBenchmarkCorpusReceipt` is an honest manifest↔receipt consistency check (recomputes manifest hash, compares fixture hash, score delta, failed row ids, gate state, receipt hash) and does not overclaim that the underlying run happened. 29,468 lines in one file. |
| tensorZeroProviderDrift.ts | TensorZero-flavoured drift receipt builder | API:benchmarkRouter/scoreRouter/shieldRouter/watchRouter | PARTIAL | Y | Same shape as helmProviderDrift. |

### src/bench

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| benchApi.ts | HTTP-facing bench operations incl. dual-control publish | API:studioServer/workspaceRouter, lib (benchCli, mechanic) | REAL | Y | Publish requires explicit owner ack and routes through the approval system. |
| benchArtifact.ts | build/inspect the signed `.amcbench` bundle | CLI + API + lib (verifyAll, passport, standard) | REAL | Y | Downgrades `trustLabel` to LOW and forecast status to INSUFFICIENT_EVIDENCE when transparency/merkle roots are missing — genuinely conservative. Writes `signer.pub` into the bundle, which benchVerifier then trusts. |
| benchCli.ts | thin CLI wrappers | CLI:`amc bench *` | REAL | N | |
| benchCollector.ts | gather real signals/runs/scorecards into bench data | lib (benchArtifact, benchComparer) | REAL | N | Applies `minRunsForAnyExport` and `minDaysCoverage` evidence gates before anything is exported. |
| benchComparer.ts | percentile + peer-group comparison vs imported population | API:benchApi, lib (src/index) | FACADE | Y | Compares the local benchmark against a copy of itself. `percentileTable(localFlat, populationFlat.length > 0 ? populationFlat : [localFlat])` — with no imported population the "population" is a one-element array containing the local point, and `percentile()` counts entries `<= value`, so **every metric reports the 100th percentile**. `kMedoidsPeerGroup(localFlat, [localFlat])` likewise clusters the bench with itself and reports `size: 1, distance: 0`. The result is then persisted, signed via `saveBenchComparison`, and appended to the transparency log as `BENCH_COMPARISON_CREATED`. `population.count: 0` and a `NO_IMPORTED_POPULATION` warning are recorded honestly, but the 100th-percentile numbers sit right beside them. |
| benchPercentiles.ts | metric flattening, percentile, k-medoids clustering | lib (benchComparer) | REAL | N | Deterministic k-medoids with tie-breaks on benchId. |
| benchPolicySchema.ts | zod bench policy schema | lib (benchPolicyStore, benchCollector, benchCli) | REAL | N | |
| benchPolicyStore.ts | bench paths, signed policy/registry config persistence | lib (14 modules incl. workspace, bootstrap, cgx, audit) | REAL | Y | |
| benchProofs.ts | build/verify transparency inclusion proofs for a bench | lib (benchArtifact, benchVerifier, assurance, passport, audit binder) | FACADE | N | The inclusion-proof verification proves nothing. `verifyBenchProofBundle(bundle)` calls `verifyMerkleProof({entryHash: proof.eventHash, proofPath: proof.merklePath, root: proof.rootHash})` — it validates each proof against **the root carried inside that same proof object**. `bundle.transparencyRoot` and `bundle.merkleRoot` are accepted as parameters and never read. So a forged proof whose `rootHash` is simply set to whatever its own path computes verifies as valid, and inclusion in the real transparency log is never established. `BenchInclusionProof.verifiedBy: "amc"` is also stamped at construction time in `buildBenchProofs` before anything is verified. |
| benchRedaction.ts | PII/secret/free-text scan of a bench artifact | lib (benchArtifact, benchCollector, cgx, promptCompiler) | REAL | Y | Aggressive by design — a free-text guard fails any unallowlisted string over 32 chars containing whitespace. |
| benchRegistryClient.ts | fetch/browse/import from a bench registry | CLI + API + lib (verifyAll) | REAL | Y | Checks pinned registry fingerprint, sha256 of the downloaded bytes, trust-label policy and signer allowlist. `requireBenchProofs` only requires proofs to be *present*; their verification is benchProofs' facade. |
| benchRegistrySchema.ts | zod registry index schemas | lib (benchRegistryServer/Client/Store, standard) | REAL | N | |
| benchRegistryServer.ts | init/verify/publish/serve a static bench registry | CLI:`amc bench registry *`, API:benchApi | REAL | Y | Signs and verifies the registry index with a real ed25519 keypair; re-verifies each artifact before publish. |
| benchRegistryStore.ts | cache index, store/read imported benches | lib (benchApi, benchRegistryClient, verifyAll) | REAL | N | |
| benchSchema.ts | zod bench artifact schemas | lib (all of src/bench, standard, benchmarks/*) | REAL | N | |
| benchSigner.ts | sign/verify bench digests via auditor key | lib (benchVerifier, benchArtifact) | REAL | N | `verifyBenchDigestSignature` requires a trusted key (`requireTrustedKey: true`) and returns false when the trusted set is empty — correct on its own; the weakness is the caller supplying a bundle-internal key. |
| benchSse.ts | emit bench events on the org SSE hub | lib (studioServer) | REAL | N | |
| benchVerifier.ts | verify a `.amcbench` file end to end | CLI + API + lib (benchRegistryClient/Store/Server, verifyAll) | FACADE | Y | Two independent holes. (1) When `publicKeyPath` is omitted the signing key is read from `join(root, "signer.pub")` — from inside the archive under verification — so a re-signed artifact passes. (2) It calls `verifyBenchProofBundle({transparencyRoot: null, merkleRoot: null, proofs: inclusion})` with both roots hardcoded to `null`; even if the roots were supplied, `verifyBenchProofBundle` ignores them and checks each proof against its own embedded root. The only structural check left is `PROOF_COUNT_MISMATCH` (count equality), so `ok: true` on a bench artifact means the tarball is internally self-consistent, not that it is authentic or that its events are in any transparency log. |

### src/forecast

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| advisoryGenerator.ts | turn drift/anomaly/risk into advisory records | lib (forecastEngine) | REAL | N | Emits a CRITICAL INTEGRITY advisory when evidence gates fail rather than suppressing it. |
| anomalyDetector.ts | robust-z suspicious maturity jump detector | lib (forecastEngine, observability, watch) | REAL | Y | Requires the jump to coincide with low observed share and flat integrity/correlation before flagging. |
| changePoint.ts | CUSUM change-point detection | lib (forecastEngine) | REAL | N | |
| driftDetector.ts | median-baseline drift with WARN/CRITICAL | lib (forecastEngine, drift/*, watch, dashboard) | REAL | N | |
| forecastApi.ts | HTTP-facing forecast operations | API:studioServer, lib (forecastCli, mechanic, e2e) | REAL | N | |
| forecastCli.ts | forecast/advisory/scheduler CLI wrappers | CLI:`amc forecast *`, `amc advisory *` | REAL | Y | |
| forecastEngine.ts | evidence-gated forecast artifact + advisories | lib (workspace, bootstrap, studio, forecastApi/Cli) | REAL | N | Refuses to run without a valid policy signature; suppresses series/drift/anomaly entirely when gates fail (`status: INSUFFICIENT_EVIDENCE`). |
| forecastModels.ts | Theil-Sen fit + prediction bands | lib (forecastEngine) | REAL | N | |
| forecastReports.ts | markdown rendering incl. an explicit "Non-claims" section | API:studioServer, lib (forecastCli) | REAL | N | |
| forecastSchema.ts | zod forecast/policy/advisory schemas | lib (all of src/forecast) | REAL | N | |
| forecastSignals.ts | collect maturity/integrity/value series from ledger | lib (forecastEngine, benchCollector, valueReports) | REAL | N | |
| forecastStore.ts | signed persistence for policy/artifact/advisories | lib (15 modules incl. workspace, cgx, passport, studio) | REAL | Y | |
| forecastVerifier.ts | verify forecast policy + latest artifact signatures | lib (forecastCli, verifyAll, src/index) | REAL | Y | Verifies against the workspace auditor key, not a bundled one. |
| leadingIndicators.ts | six governance leading indicators from ledger audit events | lib (forecastEngine) | PARTIAL | N | Counts are real ledger reads, but the `approval_backlog_age` indicator labelled "Approvals backlog age" computes a *count of APPROVAL_\* events in the current half-window*, not an age — nothing in the function reads a pending duration. |
| renewalCadence.ts | next-refresh timestamp + weekly/biweekly hint | lib (forecastEngine) | REAL | N | |
| robustStats.ts | median/MAD/quantile/EWMA/Theil-Sen/prediction band | lib (forecastEngine, driftDetector, anomalyDetector, changePoint, forecastModels) | REAL | N | Genuine Theil-Sen with outlier rejection at \|z\|>4. |

### src/tools

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| builtin/bashTool.ts | one-shot shell tool over runProcess | lib (agent/agentToolset) | REAL | Y | Docstring states honestly that `WRITE_HIGH` understates a shell's reach and names where the real control lives. |
| builtin/fsTools.ts | fs.read/fs.write/fs.edit with workspace bound | lib (agent/agentToolset) | REAL | Y | |
| builtin/readBeforeEdit.ts | read-before-edit ledger keyed on realpath + digest | lib (fsTools, agentToolset) | REAL | Y | |
| builtin/searchTools.ts | bounded grep/glob with explicit truncation reporting | lib (agent/agentToolset) | REAL | Y | |
| builtin/workspaceWalk.ts | bounded, symlink-refusing workspace walker | lib (searchTools) | REAL | N | |
| executors/toolhubTools.ts | toolhub executors exposed as pipeline tools | test-only | DEAD | Y | `toolhubPipelineTools()` is the file's only export and grep finds **zero** references anywhere in `src/` — only `tests/toolhubPipelineTools.test.ts` imports and registers it. The five tools (fs.read, fs.write, git, http.fetch, process.spawn) are never registered into any agent toolset or kernel service, so no production tool call ever reaches these bodies. |
| guards/policyGuards.ts | runtime firewall / budget / toolhub allowlist guards | lib (agent/agentToolset) | REAL | Y | Deny-by-default on unverifiable config in all three guards. |
| toolArguments.ts | detach + deep-freeze tool arguments, reject lossy values | lib (toolPipeline) | REAL | N | |
| toolEvidence.ts | project a tool outcome into ledger evidence rows | lib (agent/agentToolset) | REAL | Y | |
| toolPipeline.ts | visibility→freeze→approval→guards→body→filters | lib (toolRegistry, agent, codemode, kernel) | REAL | Y | Guard denial is final by construction — `ToolGuard` has no allow inhabitant. |
| toolRegistry.ts | scoped tool registry, narrowing-only composition | lib (toolPipeline, builtins, agent, workflow, kernel, codemode) | REAL | Y | |
| toolTypes.ts | tool execution contract types | lib (all of src/tools, agent, codemode, workflow, diagnostic) | REAL | Y | |

### src/scanner

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| autoDetect.ts | framework/security/governance detection from file text | lib (scanner/index, localScanner) | PARTIAL | Y | Framework detection by regex is reasonable. `securityPosture` and `governanceArtifacts` are pure substring presence over the concatenated repo text: a file containing the word "policy" yields the `policy-config` governance artifact, "monitor" yields `monitoring`, and `/auth/i` or `/validation/i` anywhere push `securityPosture` toward "strong". These are reported as findings about the repo's governance and security. |
| endpointProbe.ts | HTTP probe → signals → preliminary maturity level | CLI:`amc scan --url` | PARTIAL | Y | Real fetch and header inspection, but `preliminaryScore.level = 3` (rendered with `formatMaturityOrdinal`, the same formatter as the real diagnostic) purely because rate-limit and auth headers are present. `confidence` is a flat `reachable ? 0.3 : 0`. |
| index.ts | scanner barrel | CLI:`amc scan` | REAL | N | Only importer in `src/` is `src/cli.ts`. |
| localScanner.ts | scan a local dir → preliminary maturity + anti-patterns | CLI:`amc scan --local`, lib (repoScanner) | FACADE | Y | Produces a maturity level from keyword presence and prints it as a score. `level = 3` when `detection.governanceArtifacts.length >= 3`, where those "artifacts" are substring hits for policy/audit/compliance/monitor/guardrail/.env anywhere in the scanned files — so essentially any TypeScript repo that mentions three of those words scores level 3, and the level is rendered by `formatMaturityOrdinal` and printed by the CLI as `Preliminary Score: <ordinal>`. Compounding it, the `confidence` shipped alongside that score is `detection.confidence`, which is the *framework-match ratio* (how many langchain/crewai regexes hit), an entirely unrelated quantity. The `patternFindings` half of the file is real. |
| modelScanner.ts | scan model files for malicious content | CLI:`amc model-scan` | PARTIAL | N | Hashing, size and format checks are real, but the "deep scan" is `content.toString('utf8', 0, 1MB)` plus regexes, and the `secrets` rules include `/[A-Za-z0-9+/]{40,}={0,2}/g` and `/[0-9a-f]{32,}/gi` — patterns that any binary weights file matches, so `embedded_secrets` fires on essentially every real model. It never parses pickle opcodes, the actual `.pkl`/`.pth` attack surface: a `REDUCE` payload storing `"posix"`/`"system"` as separate opcode strings is invisible to `/os\.system/gi`. `riskLevel` describes only the first megabyte. |
| patterns/patternCatalog.ts | anti-pattern rule table | lib (patternScanner) | REAL | N | |
| patterns/patternScanner.ts | line-by-line rule matching | lib (localScanner) | REAL | Y | |
| patterns/types.ts | pattern rule/match/annotation types | lib (30+ modules) | REAL | N | |
| repoScanner.ts | shallow-clone a repo and scan it | lib (scanner/index) | REAL | Y | `git clone --depth 1 --` with `--` terminator; has a dedicated command-injection test. |

### src/runtimes

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| claudeCliRuntime.ts | detect the `claude` CLI | lib (runtimes/index) | REAL | Y | Near-identical to the other three detectors; only name/hint/config key differ. |
| common.ts | capability discovery, retry harness, spawn helpers | lib (all runtimes, diagnostic/runner) | REAL | Y | `discoverCapabilities` sets `supportsVersion: raw.includes("--version") \|\| raw.includes("-v")` — the `"-v"` substring matches `--verbose`, `-vv` and `--version` itself, so this flag is true for nearly any CLI with a help page. `runHarnessWithRetries` falls back to blocking on interactive stdin, which will hang a non-TTY invocation. |
| geminiCliRuntime.ts | detect the `gemini` CLI | lib (runtimes/index) | REAL | Y | |
| index.ts | runtime registry + detectAllRuntimes | CLI + lib (workspace, shield, studio, redteam, plugins, assurance, …) | REAL | Y | |
| mockRuntime.ts | detect the configured mock command | lib (runtimes/index) | REAL | N | Excluded from `detectAllRuntimes`. |
| openclawCliRuntime.ts | detect the `openclaw` CLI | lib (runtimes/index) | REAL | Y | |

### src/truthguard

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| truthguardApi.ts | resolve workspace allowlists + known evidence refs | API:studioServer/promptPackApi, lib (truthguardCli) | REAL | Y | Pulls the model allowlist from the signed bridge config and tools from toolhub — real policy sources. |
| truthguardCli.ts | validate a JSON output file | CLI:`amc truthguard validate` | REAL | N | The `enforceWorkspacePolicy: false` path substitutes `["*"]` for both allowlists, disabling the tool/model checks — but it reports that fact in the returned `context`. |
| truthguardEngine.ts | secret / allowlist / evidence-ref / proof-claim checks | lib (truthguardApi, truthguardCli) | REAL | Y | Unsupported-correctness-proof claims require an actual `amcproof` artifact ref. |
| truthguardRules.ts | secret patterns, claim regex, wildcard matching | lib (truthguardEngine) | REAL | N | |
| truthguardSchema.ts | zod output/result schemas | lib (truthguardApi/Engine, promptPackApi) | REAL | Y | |

### src/codemode

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| codeModeRunner.ts | run untrusted program in a worker, dispatch tool calls | lib (runCodeTool) | REAL | Y | Refuses outright when `confined` is false rather than pretending the worker is a sandbox; empty `env`, 128MB heap cap, each call id answered at most once against forged worker traffic. |
| runCodeTool.ts | the `run_code` transport tool | lib (agent/agentToolset) | REAL | Y | Sub-calls re-enter the same `ToolPipeline` with the parent token, so they meet the same guards — no second policy implementation. |
| workerBootstrap.ts | the worker-side program string | lib (codeModeRunner) | REAL | N | Header states plainly that this is a fault boundary and *not* a security boundary, and names the measured bypasses (`fs`, `child_process`, sockets). |

### src/security

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| index.ts | supply-chain barrel | lib (src/index) | REAL | N | |
| safeTarArchive.ts | path-traversal / zip-bomb safe tar extraction | lib (18 modules: bench, transparency, assurance, plugins, passport, audit, release) | REAL | Y | Rejects absolute paths, control chars, backslashes, `..` in any position, and enforces entry/total/compressed byte caps. |
| supplyChainPosture.ts | evaluate component inventory against a source policy | lib (security/index → src/index barrel) | PARTIAL | Y | Policy evaluation and the report/component hash integrity check are real and self-consistent. But nothing here scans anything: `vulnerabilityState` arrives from the caller, so a caller passing `"clean"` gets a clean posture. `buildSupplyChainGuardDecisionReceiptInput` then emits a guard-decision receipt whose reason reads "Supply-chain posture satisfies component inventory, version hash, vulnerability state, and allowed-source policy" — asserting a vulnerability determination that was declared, not performed. No CLI or router reaches it. |

### src/monitoring

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| driftDetection.ts | in-memory score/dimension/behavioral drift | lib (src/index barrel only) | PARTIAL | Y | Header honestly says this is not AMC's drift product. The comparison itself is wrong, though: `baseline = samples.slice(0, min(minSamples, floor(len/2)))` and `recent = samples.slice(-min(windowSize, len))` — with the default `windowSize: 20`, any sample count under 20 makes `recent` the *entire* array, which contains the baseline. So "recent vs baseline" compares a superset against its own prefix, structurally damping `scoreDrift` and guaranteeing high hash overlap in the behavioral check. |
| realtimeDashboard.ts | "real-time monitoring dashboard" | lib (src/index barrel only) | FACADE | Y | A dashboard with no dashboard. `DEFAULT_DASHBOARD_CONFIG` declares six widgets (`fleetOverview`, `trendLine`, `heatmap`, `complianceMatrix`, `alertFeed`, `driftDetector`) with per-widget `refreshIntervalMs`, and no renderer, server, or consumer of `DashboardWidget` exists anywhere in the repo — the only non-test reference is a re-export in `src/index.ts`, and the only test assertion is `widgets).toHaveLength(6)`. Nothing ever calls `ingest()`, so `getFleetOverview()` always reports 0 agents. Separately, every `AlertThreshold` carries a `cooldownMs` that `ingest()` never reads: alerts fire on every breaching sample despite the declared cooldown. |

### src/dogfood

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| maturityEvidence.ts | seed synthetic evidence for demo agents | test-only + `scripts/amc-dogfood-8-agents.mjs` | FACADE | Y | Manufactures a preselected maturity score. `targetLevelForQuestion(targetMaturity, index)` picks the level **first**, then `appendQuestionEvidence` reads that level's gate and synthesizes exactly `max(gate.minEvents, gate.minSessions, gate.minDistinctDays, gate.requiredEvidenceTypes.length)` events of exactly `gate.requiredEvidenceTypes`, across exactly enough sessions — evidence reverse-engineered from the pass condition so the subsequent diagnostic cannot report anything but the target. It writes at `trustTier: "OBSERVED"`, the highest tier and the only one level-5 gates accept. The header warns about this and every event carries `meta.provenance = "dogfood"`, but that tag is decorative: grepping `src/score` and `src/diagnostic` finds no consumer of `provenance`, so seeded evidence is scored identically to evidence captured from a real agent. |

### src/providers

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| providerTemplates.ts | provider config template table + lookups | CLI:`amc provider *`, lib (fleet/registry, src/index) | REAL | Y | A data table presented as a data table; no behavior claimed. |

## audit & studio

### src/audit

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| auditApi.ts | HTTP-facing audit binder/policy/request handlers | lib (studioServer, auditCli, product/fixGenerator) | REAL | Y | `auditReadinessGate` demotes `verifyAuditWorkspace` failures to warnings, so a workspace with invalid binder exports still gates `ok:true` |
| auditCli.ts | CLI wrappers over auditApi | CLI:`amc audit *` | REAL | N |  |
| auditMapBuiltin.ts | Built-in 9-family control map data | lib (auditMapStore) | REAL | N |  |
| auditMapSchema.ts | Zod schemas for control maps/results | lib (auditApi, binderCollector, binderSchema, auditMapStore) | REAL | N |  |
| auditMapSigner.ts | Sign an audit map file | lib (auditMapStore) | REAL | N | 5-line delegate to `org/orgSigner` |
| auditMapStore.ts | Read/write/sign builtin+active maps | lib (studioServer, verifyAll, workspaceManager, binderArtifact) | REAL | Y |  |
| auditMapVerifier.ts | Verify an audit map signature | lib (auditMapStore) | REAL | N | 5-line delegate |
| auditPolicySchema.ts | Zod schema + defaults for audit policy | lib (auditPolicyStore, binderCollector, auditApi) | REAL | N |  |
| auditPolicyStore.ts | Audit dir layout, policy/scheduler persist+sign | lib (11 modules) | REAL | Y |  |
| auditScheduler.ts | Cadence-driven binder refresh + transparency entry | lib (studioServer, auditApi) | REAL | N |  |
| auditSse.ts | Emit audit events onto the org SSE hub | lib (studioServer) | REAL | N |  |
| binderArtifact.ts | Build/sign/package the .amcaudit binder bundle | lib (verifyAll, auditApi) | REAL | Y | refuses to export when the PII scan fails; real crypto |
| binderCollector.ts | Collect 40 facts and evaluate controls from ledger | lib (binderArtifact, auditScheduler) | PARTIAL | Y | 39 facts are real; `retentionStatusHealthy` is `statusFromBoolean(retention.segmentCount >= 0, ...)` — `segmentCount` is a count, so that control can never report FAIL and always contributes a PASS |
| binderProofs.ts | Merkle inclusion proofs for binder bundles | lib (binderArtifact, binderVerifier) | PARTIAL | N | `verifyBinderProofs` delegates to `verifyBenchProofBundle`, which verifies each proof against `proof.rootHash` carried in the same JSON file; nothing compares that root to the binder's own transparency/merkle root, so a self-consistent forged proof set verifies |
| binderRedaction.ts | PII/secret scan + audit-id hashing for binders | lib (binderArtifact, binderCollector) | REAL | Y |  |
| binderSchema.ts | Zod schema for binder JSON / signature / PII scan | lib (7 modules) | REAL | Y |  |
| binderSigner.ts | Canonicalize + sign binder JSON with auditor key | lib (binderArtifact) | REAL | N |  |
| binderStore.ts | Binder cache/export paths, save, load, verify | lib (workspaceRouter, passportCollector, auditApi) | REAL | N | `verifyBinderCacheSignature` returns `valid:true` when the cache file is absent; only callers that pre-check existence keep this honest |
| binderVerifier.ts | Verify an exported .amcaudit archive end-to-end | lib (verifyAll, standardGenerator, auditCli) | REAL | Y | real signature + digest + PII-sha + manifest-sha checks; `spawnSync` imported and unused |
| enterpriseAuditExport.ts | Ledger→SIEM export + "signed audit trail" | lib (index, enterpriseCli, auditCli) | FACADE | Y | `buildSignedAuditTrail` returns a type named `SignedAuditTrail` that has NO signature field, no key, no signer — only `integrityHash = sha256(JSON.stringify(records))` and a chained sha over the same records it embeds. `verifyAuditTrailIntegrity` recomputes both from those same embedded records and reports "records may have been tampered with" on mismatch, so anyone who edits records and re-runs the builder passes. Shipped to auditors via `src/enterprise/enterpriseCli.ts:111` |
| evidenceRequestSchema.ts | Zod schema for auditor evidence requests | lib (evidenceRequestStore, auditApi, evidenceRequests) | REAL | N |  |
| evidenceRequestStore.ts | Persist/sign/list evidence requests | lib (evidenceRequests, auditApi) | REAL | N |  |
| evidenceRequests.ts | Dual-control approval flow for evidence requests | lib (auditApi) | REAL | N | goes through the real approvalEngine |
| insiderRisk.ts | Rubber-stamping / self-approval / anomaly analytics | CLI:`amc insider-risk-report`, `amc insider-alerts`, `amc insider-risk-scores`, `amc attestation-export`; API:securityRouter | FACADE | Y | The detectors read module-level in-memory arrays (`approvalEvents`, `toolUsageEvents`, `policyChangeEvents`) that are only ever filled by `recordApprovalEvent`/`recordToolUsageEvent`/`recordPolicyChangeEvent` — and NOTHING in the product calls those (grep: only `src/index.ts` re-exports + `tests/insiderRisk.test.ts`). `ops/productionWiring.ts:310 insiderRiskHook` pushes to a *different* store (`state.insiderCaptures`). So every CLI/API process starts with an empty store: `amc insider-alerts` always prints "No insider risk alerts", `insider-risk-scores` always prints "no data ingested", and `attestation-export` emits an "Attestation Bundle" for external auditors with 0 alerts, 0 approval events, 0 policy changes and a bundleHash over nothing |
| posthocAuditSampling.ts | Build/verify post-hoc audit sampling receipts | lib (index barrel only; no internal caller) | PARTIAL | Y | Structural validation is real, but every "signed evidence" check is `signedRefValid()` = `Boolean(signedEvidenceRef) && /^[a-f0-9]{64}$/.test(signatureSha256)`. No key, no crypto: any 64-hex string passes, so `verifyPosthocAuditSamplingReceipt` returns `valid:true` on a receipt whose signatures were never verified |
| reviewerIndependence.ts | Build/verify reviewer-independence (SoD) receipts | lib (index barrel only; no internal caller) | PARTIAL | Y | Same defect: `conflictSignaturePresent` and `secondReviewSatisfied` accept any 64-hex `signatureSha256`. Role separation and conflict flags are checked for real; the signatures backing them are not |

### src/bridge

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| bridgeAuth.ts | Pairing codes + lease verification for bridge calls | lib (cli, studioServer, bridgeServer) | REAL | N | checks revocation-list signature before trusting revocations |
| bridgeConfigSchema.ts | Zod schema + defaults for bridge.yaml | lib (bridgeServer, router, enforcer, store) | REAL | N |  |
| bridgeConfigStore.ts | Load/save/sign/verify bridge.yaml | lib (12 modules) | REAL | N |  |
| bridgeModelRouter.ts | Path→provider/requestKind matcher + route inventory | lib (index, compat/*, bridgeRoutes, pythonSdkGenerator) | REAL | Y | `BRIDGE_MODEL_ROUTES` is the honest denominator introduced to kill the old self-comparing SDK coverage metric |
| bridgePolicyEnforcer.ts | Provider/route/model/taxonomy/lease deny decisions | lib (bridgeServer) | REAL | N |  |
| bridgeReceipts.ts | Append signed llm_request/response receipts | lib (bridgeServer) | REAL | N |  |
| bridgeRedaction.ts | Secret redaction + body summarization for bridge rows | lib (cli, hookControl, hookIngress, bridgeServer) | REAL | Y | delegates to the shared `redactSecrets` table |
| bridgeRoutes.ts | Dispatch a matched route to the right intent parser | lib (index, bridgeServer, compat/*) | REAL | N |  |
| bridgeServer.ts | The bridge HTTP handler: auth, policy, proxy, receipts | lib (index, studioServer) | REAL | Y | 1377 lines; enforces lease + policy before proxying |
| bridgeTelemetry.ts | Append agent stdout/stderr/lifecycle to the ledger | lib (bridgeServer) | REAL | N |  |
| compat/anthropicCompat.ts | Parse Anthropic body into a ModelIntent | lib (bridgeRoutes) | REAL | N |  |
| compat/geminiCompat.ts | Parse Gemini body into a ModelIntent | lib (bridgeRoutes) | REAL | N |  |
| compat/localMockCompat.ts | OpenAI parse relabelled provider=local | lib (bridgeRoutes) | REAL | N | 11 lines, thin but honest |
| compat/openaiCompat.ts | Parse OpenAI body into a ModelIntent | lib (bridgeRoutes, 3 sibling compats) | REAL | N |  |
| compat/openrouterCompat.ts | OpenAI parse relabelled provider=openrouter | lib (bridgeRoutes) | REAL | N |  |
| compat/xaiCompat.ts | OpenAI parse relabelled provider=xai | lib (bridgeRoutes) | REAL | N |  |
| hookActionIdentity.ts | Derive stable action ids + correlation digests | lib (hookControl, adapters/hookIntegration) | REAL | N |  |
| hookControl.ts | Provider hook control-plane: decide, seal, verify | lib (bridgeServer, adapters/hookIntegration*) | REAL | Y | `verifyProviderHookControlResult` re-derives ids and compares against a recovered sealed ledger event, not against its own input |
| hookIngress.ts | Ingest observed AEP hook events into the ledger | lib (bridgeServer, integrationScaffold, hookIntegration) | REAL | Y | ships `conformanceClaim: false` deliberately rather than asserting AEP conformance |
| modelTaxonomy.ts | Signed provider/model family taxonomy | lib (index, workspace, bootstrap, enforcer) | REAL | N |  |
| tests/fakeProviders/fakeAnthropic.ts | In-test fake Anthropic HTTP server | test-only | REAL | Y | honest fixture, lives under src/ |
| tests/fakeProviders/fakeGemini.ts | In-test fake Gemini HTTP server | test-only | REAL | Y |  |
| tests/fakeProviders/fakeOpenAI.ts | In-test fake OpenAI HTTP server | test-only | REAL | Y |  |
| tests/fakeProviders/fakeOpenRouter.ts | In-test fake OpenRouter HTTP server | test-only | REAL | Y |  |
| tests/fakeProviders/fakeXAI.ts | In-test fake xAI HTTP server | test-only | REAL | Y |  |

### src/sdk

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| amcAgent.ts | Agent facade wrapping client + instrumentors | lib (sdk/index) | REAL | N |  |
| amcClient.ts | HTTP client for every bridge provider route | lib (all sdk integrations) | REAL | Y |  |
| amcEvidence.ts | SDK-side secret redaction + hashing | lib (amcClient, sdk/index) | REAL | Y |  |
| amcGuards.ts | Block self-reported scoring fields; validate bridge URL | lib (amcClient, mobileFetch, sdk/index) | REAL | N |  |
| amcSpan.ts | Timed span wrapper returning a span record | lib (sdk/index, amcAgent) | REAL | N |  |
| amcTelemetry.ts | POST telemetry events to /bridge/telemetry | lib (sdk/index, amcClient) | REAL | N |  |
| errors.ts | Typed SDK error class | lib (cli, sdk/*, api) | REAL | Y |  |
| frameworkAdapters.ts | "Native SDK wrappers" for LangChain/CrewAI/OpenAI Agents | lib (sdk/index barrel only) | FACADE | Y | Docstring claims each adapter will "Apply safety constraints", "Record decisions for audit" and "Export to AMC's governance layer". None of that exists: `grep ledger\|appendEvidence\|AMCClient` in the file returns nothing, and `enforceSafety` appears 5 times — all 5 are assignments, it is never read. `shouldStop()` is advisory and nothing calls it. Worse, `LangChainAdapter.getCallbackHandler().handleLLMEnd` records `{prompt:0, completion:0}` tokens and `costUsd 0`, so `getSummary().totalTokens`/`totalCostUsd` are permanently 0 for the LangChain path and `checkLimits()` can never set `budgetExceeded` from it — a cost-governance adapter that reports $0 spend no matter what ran |
| index.ts | SDK barrel export | lib (24 modules incl. cli, studioServer) | REAL | Y |  |
| integrations/anthropic.ts | Proxy an Anthropic client through the bridge | lib (frameworkGuide, promptCompiler, sdk/index) | REAL | N |  |
| integrations/gemini.ts | Proxy a Gemini client through the bridge | lib (promptCompiler, sdk/index, amcAgent) | REAL | N |  |
| integrations/langchainJs.ts | LangChain-shaped invoke/bind over the bridge | lib (amcAgent, sdk/index) | PARTIAL | N | `bind: (_params) => ({ invoke })` discards every bound parameter and returns the identical unbound `invoke`, so binding tools/temperature/stop-sequences is silently a no-op |
| integrations/langgraphJs.ts | LangGraph-shaped `run(state)` over the bridge | lib (amcAgent, sdk/index) | PARTIAL | N | no graph, nodes or edges — `run` flattens `state.messages` into one chat completion, so anything expecting LangGraph traversal gets a single LLM call |
| integrations/openai.ts | Proxy an OpenAI client / fetch transport | lib (frameworkGuide, promptCompiler, amcAgent, sdk/index) | REAL | Y |  |
| integrations/openaiAgentsSdk.ts | Proxy OpenAI Agents SDK run/responses | lib (adapters/registry, amcAgent, sdk/index) | REAL | N |  |
| integrations/vercelAiSdk.ts | fetch shim routing Vercel AI SDK to the bridge | lib (amcAgent, sdk/index) | REAL | N |  |
| mobileFetch.ts | React-Native fetch wrapper rewriting provider hosts | lib (sdk/index) | REAL | Y | strips provider auth headers before forwarding |
| pythonSdkGenerator.ts | Package the Python SDK + measure bridge coverage | lib (index) | REAL | Y | `validatePythonSdkCoverage` was a tautology (a list compared to itself, published as 100%); the denominator now comes from `BRIDGE_MODEL_ROUTES` and honestly reports 7/11 |
| versioning.ts | SDK version policy + deprecated route table | lib (sdk/index, api/index) | REAL | N |  |

### src/toolhub

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| blastRadiusConsent.ts | Summarize impact, build + validate consent evidence | lib (toolhubServer) | PARTIAL | Y | `buildToolExecutedScope` computes the "executedScope" (with `simulated: false`, resources, command) from the request args via the same `summarizeToolBlastRadius` used to build the consent — and `toolhubServer.ts:703-712` calls it BEFORE `runTool` at line 778. So the field recorded as evidence of what was actually executed is a prediction from the request, never an observation |
| leastPrivilegeGrants.ts | Signed time-boxed tool grants + usage receipts | test-only (no src importer) | REAL | Y | real Ed25519 sign/verify, but `toolhubServer` never issues or checks a grant, so the least-privilege guarantee is library-only |
| protectedPaths.ts | The unconditional `.amc/**` deny floor | lib (toolsSchema, toolhubCli, toolhubValidators) | REAL | Y | enforcement compares resolved paths, not globs; documents why the old vault-file clause could never fire |
| toolArgumentRoles.ts | Which argument names carry paths/urls/binaries/commands | lib (toolhubValidators) | REAL | N |  |
| toolContext.ts | Project the signed tool config into a trusted context | lib (cgxBuilder, toolhubCli, toolhubServer) | REAL | Y | returns `untrusted` with reason codes rather than an empty pass |
| toolSchemaContracts.ts | Signed tool input/output + side-effect contracts | test-only (no src importer) | REAL | Y | real crypto; nothing in the execution path validates an invocation against a contract |
| toolhubCli.ts | CLI init/verify/inspect for the tool hub | CLI:`amc toolhub *` (via cli.ts) | REAL | Y | prints the protected-path floor alongside the signed config |
| toolhubClient.ts | HTTP client for /toolhub/intent and /toolhub/execute | ORPHAN | DEAD | N | Nothing imports it. Repo-wide grep for `toolhubClient` outside `dist/` and `node_modules/` returns only two planning docs (`plans/amc-gap-register.md`, `plans/amc-state-ledger.md`). 152 lines of retry/circuit-breaker/backoff logic with no caller |
| toolhubExecutors/fs.ts | fs.read / fs.write executor with simulate mode | lib (toolhubServer, tools/executors/toolhubTools) | REAL | N |  |
| toolhubExecutors/git.ts | git status/commit/push executor with simulate mode | lib (toolhubServer, tools/executors/toolhubTools) | REAL | N |  |
| toolhubExecutors/http.ts | http.fetch executor with simulate mode | lib (toolhubServer, tools/executors/toolhubTools) | REAL | Y |  |
| toolhubExecutors/process.ts | process.spawn executor with simulate mode | lib (toolhubServer, tools/executors/toolhubTools) | REAL | N |  |
| toolhubReceipts.ts | Redact payload + append tool evidence with receipt | lib (toolhubServer) | REAL | Y |  |
| toolhubServer.ts | Intent/execute pipeline: policy, approval, run, receipt | lib (studioServer) | FACADE | Y | Line 799 writes `success: true` as a literal into the signed `tool_result` ledger row. `runTool` returns `{code, stdout, stderr}` for git/process and `{status, headers, body}` for http, and NONE of those are inspected — a `git push` that exits 1 or an HTTP 500 is sealed into the tamper-evident ledger as a successful action. Only a thrown exception avoids the flag. Compounded by the pre-execution `executedScope` noted under blastRadiusConsent.ts |
| toolhubValidators.ts | Signed tools.yaml load/verify + per-call arg policy | lib (25 modules) | REAL | Y | `validateToolRequest` checks by declared capability, not by tool name; cwd invariant runs first for every tool |
| toolsSchema.ts | Zod schema + shipped default tool allowlist | lib (toolContext, toolhubValidators, policyPacks) | REAL | Y |  |

### src/lifecycle

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| artifactSignature.ts | Domain-separated sign/verify for 33 artifact kinds | lib (23 modules) | REAL | Y | real `signDigestWithPolicy` / `verifySignedDigest` with a v2 domain separator |
| changeReceipt.ts | Lifecycle change + rollback receipts | lib (cli, resourceManifest, unifiedRun, fleetScoring) | REAL | Y |  |
| controlFileLock.ts | Cross-process file lock with dead-lock reaping | lib (9 modules incl. firewall, packApply) | REAL | Y | `linkSync` based, with contender files so a dead holder can be identified |
| decisionReceipt.ts | Predicted/observed decision receipts | lib (cli, unifiedRun, findingProof, fleetScoring) | REAL | Y | evidence-request receipts hardcode `confidence: 0.5`; score-gap receipts derive it from `report.evidenceCoverage` |
| episodeRecord.ts | Per-run episode records with redaction/export | lib (cli, fixerRca, orgRun, traceFailureIndex) | REAL | Y |  |
| findingProof.ts | Finding→evidence→recommendation proof chains | lib (cli, changeReceipt, unifiedRun, fleetScoring) | REAL | Y | `findingStatus` returns "verified" only with VALID report + evidence ids + confidence ≥ 0.5 + no ledger-invalid flag |
| lifecycle.ts | Stage machine, RACI matrix, governance gates | lib (index, lifecycleCli) | PARTIAL | Y | `advanceLifecycleStage` gates on `params.controlsSatisfied` — a caller-supplied string array compared by set membership against `requiredControlsForStage`. No control is evaluated, so `amc lifecycle advance --to production --controls <the required ids>` clears the production gate by typing the ids. The transition trail does record what was claimed |
| lifecycleCli.ts | CLI wrappers for status/advance | CLI:`amc lifecycle *` | REAL | Y |  |
| lifecycleRunArtifact.ts | 8-surface run artifact build/sign/export | lib (cli, neutralImporter, orgRun, unifiedRun) | REAL | Y |  |
| observabilityLane.ts | Component attribution + decision chain record | lib (cli, unifiedRun, episodeRecord, fleetScoring) | REAL | Y |  |
| signedControlJournal.ts | Append-only signed journal with pinned genesis signer | lib (guardrailControlState, runtime/firewall) | REAL | Y | rejects a signer that differs from the pinned genesis fingerprint; entry/checkpoint signer must match |

### src/studio

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| apiDelegation.ts | Rate-limit + role-gate /api/v1 before delegating | lib (studioServer) | REAL | Y | refuses agent/lease tokens on internal routes |
| cliBridge.ts | Run CLI commands as child processes for Studio | lib (onboardingApi, studioServer) | REAL | Y | `CLI_BRIDGE_ROLES = ["OPERATOR","OWNER"]` exists specifically because an AGENT token previously reached the whole CLI |
| connectWizard.ts | Build connect instructions + issue an agent lease | CLI:`amc connect` (cli.ts:4301), lib (index) | REAL | Y |  |
| onboardingApi.ts | Studio onboarding status/run endpoints | lib (studioServer) | REAL | N |  |
| oneCommandUp.ts | Vault passphrase resolution + first baseline run | CLI:`amc up` (cli.ts:3540) | REAL | N |  |
| openapi.ts | Full Studio+Bridge+Gateway OpenAPI spec generator | CLI:`amc openapi-generate`, lib (index) | PARTIAL | Y | `validateOpenApiContractConsistency` only checks the document against itself ($ref resolution, path params declared, responses present). Nothing compares the ~200 hand-written path literals to what `studioServer.ts` actually routes, so a documented endpoint that no longer exists validates clean |
| signatures.ts | Inspect and re-sign gateway/fleet/agent/tools configs | CLI:`amc studio *` (cli.ts:4147), lib (index) | REAL | Y | `fixSignatures` re-signs anything invalid and logs `CONFIG_RESIGNED` — legitimate repair, but it makes a tampered config valid again |
| studioServer.ts | The Studio HTTP router (214 route branches) | lib (index, studioSupervisor, workspaceRouter) | REAL | Y | 8877 lines. One cosmetic dishonesty: when trust mode ≠ NOTARY the response embeds a synthetic `notaryLogTail: {ok:true, status:200, entries:[]}` — an HTTP-shaped success for a request never made |
| studioState.ts | Studio state/token/session file layout | lib (cli, supervisor, studioServer, workspaceRouter) | REAL | Y |  |
| studioSupervisor.ts | Start/stop/status the Studio daemon | CLI:`amc up`/`amc studio`, lib (index, doctorRules, adapterRunner) | REAL | Y | `studioStatus` proves liveness with `processRunning(state.pid)` rather than trusting the state file |

### src/setup

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| integrationScaffold.ts | Framework scaffolds, contract tests, simulator, OpenAPI | CLI:`amc contract-tests`/`amc simulate-bridge`, lib (index, studio/openapi) | PARTIAL | Y | `validateContractTest` is a real validator but has no production caller — `amc contract-tests` only *prints* the suite and never issues a request, so the four bridge contract assertions are never executed against a running bridge. `simulateBridgeRequest` fabricates responses (random latency, `errorRate: 0.05`, `"[Simulated response to: ...]"`) and is correctly labelled as a simulator |
| onboardingActivation.ts | Project 4-milestone activation from verified evidence | lib (cli, index, onboardingApi, unifiedSurfaceInspection) | REAL | Y | requires `verifyEvidenceEventIntegrity(..., requireReceipt: true)` per event and blocks on any chain/metadata/receipt failure |
| onboardingState.ts | Persist onboarding step state | lib (cli, onboardingApi, quickSetup, quickSetupCli) | REAL | Y |  |
| quickSetup.ts | Detect providers/frameworks, init workspace, save preset | lib (quickSetupCli) | REAL | Y |  |
| quickSetupCli.ts | Register the `amc setup` command | CLI:`amc setup` | REAL | Y |  |
| setupWizard.ts | Framework detection, adapter auto-config, "ETA to L3" | lib (quickSetup) | PARTIAL | Y | The readiness signals are real (frameworks detected, test files counted, CI workflow present, `.amc` and `gateway.yaml` on disk). The headline number is not: `estimatedHours = clamp(18 - readinessScore * 0.14, 2, 20)` with `readinessScore` seeded at a bare `18` and incremented by uncalibrated constants (+12, +10, +6…). It is presented to the operator as a time-to-maturity estimate |

### src/casebooks

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| casebookCli.ts | init/list/verify/add-from-workorder commands | CLI:`amc casebook *` (cli.ts:7026) | REAL | N |  |
| casebookRunner.ts | "Run" a casebook and score each case | lib (index, experiments/experimentRunner:253) | FACADE | N | `runCasebook` executes nothing. It never sends `kase.inputs.prompt` anywhere; `allowedActionClasses` and `requestedMode` are read from the case and discarded. It reads the last 14 days of pre-existing ledger events ONCE and scores every case against that same aggregate, then reports per-case `success` and `valuePoints`. On a workspace with no runs, `latestCorrelationRatio` returns **1** (perfect) as its no-data default, and with schema defaults (`requiredToolActions: []`, `forbiddenAudits: []`, `minCorrelationRatio: 0.9`) every low/medium-risk case comes back `success: true, valuePoints: 100` without a single action having been taken. `experimentRunner` consumes this as the experiment's `baselineRun` |
| casebookSchema.ts | Zod schema for casebooks and cases | lib (pluginLoader, casebookStore) | REAL | N |  |
| casebookStore.ts | Signed casebook/case persistence and verification | lib (index, casebookRunner, casebookCli) | REAL | N | `verifyCasebook` does verify each case file's signature |

### src/exec

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| outputCollector.ts | Bounded, secret-scrubbing output capture | lib (runProcess) | REAL | Y | holds back `longest-1` bytes so a secret split across chunk boundaries is still scrubbed; reports `droppedBytes` |
| processTree.ts | Process-group termination and signal forwarding | lib (pipeTerminal, runProcess) | REAL | N | documents the measured detached/group matrix and why the ESRCH path kills nothing |
| processTypes.ts | The process-execution contract | lib (outputCollector, runProcess, kernel/execServices) | REAL | Y | `treeExitProven` is deliberately separate from `exitCode` — it reports what was demonstrated, not what was assumed |
| runProcess.ts | The single spawn site: env, bounds, grace, timeout | lib (ledger/monitor, bashTool, seatbeltBackend, execServices) | REAL | Y | `write()` resolves at the flush callback so recorded input matches delivered input |

### src/skills

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| skillCatalog.ts | Layered, digest-keyed SKILL.md catalog | lib (skillTurn, skillPrompt) | REAL | Y | unparseable skills are reported as `problems`, not silently dropped |
| skillPrompt.ts | Frame a skill as a literal, attributed prompt context | lib (skillTurn) | REAL | Y | registers as a context plugin (always `literal: true`) so skill text is never interpolated |
| skillTurn.ts | Resolve `/name` into a composed turn | lib (cli-agent-commands) | REAL | Y | unknown skill stops the turn; malformed skill reports why |

### src/receipts

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| receipt.ts | Mint/parse/verify Ed25519 signed receipts | lib (11 modules incl. ledger, gateway, hookControl) | REAL | Y | real `crypto.sign`/`crypto.verify` over canonicalized payload bytes |
| receiptChain.ts | Cross-agent delegation chains over receipts | lib (kernel/evidenceServices) | REAL | Y | store was in-memory only and could never succeed cross-process; now persists the signed receipt string and re-decodes the payload from it |

### src/eoc

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| flows.ts | Education / ownership / commitment flows with audit | CLI:`amc learn` (cli.ts:15531), lib (index) | REAL | N | each flow writes a signed `guard_check` receipt into the ledger and seals the session |

### src/snapshot

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| snapshot.ts | Unified clarity snapshot markdown from the latest run | CLI:`amc snapshot` (cli.ts:13382), lib (index, loop) | REAL | Y | throws when no diagnostic run exists rather than emitting an empty snapshot |

## llm, agent & acp

### src/llm

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| blockAssembler.ts | Folds stream chunks into content blocks | lib (streamRecorder, stepRunner, index) | REAL | Y | |
| exhaustive.ts | assertNever for closed stream unions | lib (blockAssembler, streamProtocol, streamChunk) | REAL | N | |
| index.ts | Public barrel for the LLM seam | lib (cli.ts, kernel, ~23 modules) | REAL | Y | |
| llmFailure.ts | Provider-neutral failure taxonomy | lib (retryPolicy, adapters, streamRecorder) | REAL | Y | |
| retryPolicy.ts | Decides whether a failure class is retryable | lib (adapterRegistry, requestRetry) | REAL | Y | Deciding only; never executes a retry (that is agent/requestRetry.ts) |
| streamChunk.ts | The chunk protocol every adapter emits | lib (adapters, stepRunner, toolCalls) | REAL | Y | |
| streamProtocol.ts | Grammar/state machine over chunk order | lib (blockAssembler, llmRuntime) | REAL | Y | |

### src/llm/adapter

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| adapterRegistry.ts | Route→adapter resolution with per-call pin | lib (llmRuntime, cli-agent-commands, kernel) | REAL | Y | |
| adapterTypes.ts | The LlmAdapter contract | lib (~34 modules incl. src/adapters/**) | REAL | Y | |
| credentialGuard.ts | Scrubs a resolved secret out of error text | lib (streamRecorder, index) | REAL | N | Exact-substring scrub only; a secret the provider re-encodes is not caught |
| llmRuntime.ts | ctx.llm — pin, log, dispatch, record | lib (stepRunner, acpStdioMain, kernel) | REAL | Y | |
| responseFailure.ts | Maps HTTP status → typed failure | lib (llmRuntime) | REAL | N | |
| sse.ts | Server-sent-event framing decoder | lib (openai/anthropic adapters) | REAL | N | |
| streamRecorder.ts | Records settled response as signed rows | lib (llmRuntime, requestRetry) | REAL | N | Exercised only indirectly through agentLoopEvidenceGaps |
| transport.ts | HTTP seam adapters dispatch through | lib (all adapters, kernel) | REAL | Y | |

### src/llm/providers

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| anthropicAdapter.ts | Anthropic Messages stream → chunks | lib (index, cli-agent-commands, acpStdioMain) | REAL | Y | |
| gatewayAdapter.ts | Wraps another adapter to route via AMC gateway | lib (index) | REAL | Y | |
| openaiAdapter.ts | OpenAI Chat stream → chunks, synthesises blocks | lib (index, cli-agent-commands, acpStdioMain) | REAL | Y | |

### src/llm/request

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| anthropicMessagesEncoder.ts | Canonical Anthropic request bytes | lib (anthropicAdapter, builtInEncoders) | REAL | Y | |
| builtInEncoders.ts | Encoder list this tree ships | lib (deriveRequest, index) | REAL | N | 21 lines, pure registration |
| deriveRequest.ts | Rebuilds transmitted bytes from signed rows | lib (prepareRequest, runReport) | REAL | Y | |
| openaiChatEncoder.ts | Canonical OpenAI request bytes | lib (openaiAdapter, builtInEncoders) | REAL | Y | |
| prepareRequest.ts | The only path to bytes for a model | lib (llmRuntime) | REAL | Y | |
| requestEncoder.ts | Encoder seam + (id,version) registry | lib (llmRuntime, encoders, kernel) | REAL | Y | |
| requestSources.ts | Resolves message parts from committed rows | lib (deriveRequest, prepareRequest) | REAL | N | Shared by send and derive paths, so no test names it directly |
| requestSpec.ts | Provider-neutral request/tool types | lib (all encoders, agent seams) | REAL | N | Types + canonical tool-schema bytes |

### src/agent

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| agentDriver.ts | Turn/step machine over SessionService | lib (agentSession, subagentRunner, kernel) | REAL | Y | |
| agentSession.ts | One session, many prompts | lib (acpAgentServer, acpStdioMain) | REAL | Y | |
| agentToolset.ts | Composes registry+pipeline toolset | lib (agentSession, subagentRunner, cli-agent-commands) | REAL | Y | |
| approvalGate.ts | Blocks a tool call on a signed decision | lib (kernel/agentLoopRunner) | REAL | N | No test imports gateToolCallsOnApproval |
| delegateTool.ts | `subagent` tool definition | lib (agentToolset, workflowTool, kernel) | REAL | Y | |
| delegationEvidenceWriter.ts | Writes settled-delegation rows to parent session | lib (subagentSpawn) | REAL | N | |
| delegationIdentity.ts | Identity/depth for a delegated run | lib (subagentSpawn, workflowRunner, autonomy) | REAL | Y | |
| delegationScope.ts | Parses a scope and denies tools outside it | lib (subagentSpawn, presets, cli-agent-commands) | REAL | Y | |
| echoTool.ts | Demonstration tool for a multi-step turn | lib (index, cli-agent-commands) | REAL | Y | Echoes by design; header says so and it is stub-route-default only |
| foreignSubagentRunner.ts | Runs a delegated child as a foreign process | lib (claudeCliProvider) | REAL | Y | Refuses unleased/truncated/nonzero-exit children rather than reporting success |
| inbox.ts | Pending prompts/steering as a fold over rows | lib (agentDriver, index) | REAL | N | |
| index.ts | Agent-loop public barrel | lib (cli.ts, ~23 modules) | REAL | Y | |
| loopTypes.ts | Loop vocabulary, hooks, config | lib (driver, kernel, prompt/context) | REAL | N | |
| pipelineToolSeam.ts | Backs the loop seam with the P4.1 pipeline | lib (agentToolset) | REAL | Y | |
| requestRetry.ts | Request-boundary retry inside one step | lib (stepRunner, agentDriver) | REAL | Y | |
| runReport.ts | Run summary read back out of the log | lib (agentSession, acpProjection, cli-agent-commands) | REAL | Y | |
| stepRunner.ts | One step: one request plus its tool calls | lib (agentDriver, kernel) | REAL | N | |
| stubProvider.ts | Keyless in-process provider route | lib (index, cli-agent-commands, acpStdioMain) | REAL | Y | Real adapter over a local transport, `providerId:"stub"`, zero usage — labelled, not disguised |
| subagentRunner.ts | In-process child executor | lib (kernel/agentLoopRunner) | REAL | Y | |
| subagentSpawn.ts | Governance around spawning a child | lib (delegateTool, workflowRunner, kernel) | REAL | Y | |
| toolCalls.ts | Runs one step's calls in model order | lib (stepRunner, index) | REAL | N | |
| toolSeam.ts | What the loop needs from a tool registry | lib (driver, toolCalls, kernel) | REAL | Y | |

### src/agent/providers

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| claudeCliProvider.ts | Claude Code as a leased foreign child | lib (delegationProviders) | REAL | Y | |
| delegationProviders.ts | Registry of delegation executors | lib (cli-agent-commands) | REAL | Y | |

### src/value

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| valueApi.ts | API-facing value init/policy/ingest/report | lib (studioServer, valueCli, valueScheduler) | REAL | Y | Webhook token compared with timingSafeEqual |
| valueAttribution.ts | Splits KPI credit across agents | lib (valueReports) | REAL | Y | Agent id is guessed by splitting runId on ":"/"@"; falls back to "unknown" and then reports INSUFFICIENT_EVIDENCE |
| valueCli.ts | `amc value …` command bodies | CLI:`amc value` | REAL | N | |
| valueCollector.ts | Derives KPI events from the ledger | lib (valueReports) | REAL | N | Reads real evidence rows; per-KPI collectors are hand-mapped |
| valueContracts.ts | Value-contract zod schema + template | lib (valueStore, scoring, attribution, api) | REAL | N | |
| valueEventSchema.ts | Value-event zod schema | lib (store, collector, scoring, api) | REAL | Y | |
| valueEvidenceGates.ts | Gate strong claims on evidence thresholds | lib (valueReports) | REAL | N | Every threshold is read from the signed policy; gate can fail |
| valuePolicySchema.ts | Value-policy zod schema + defaults | lib (store, gates, scoring, risk, api) | REAL | N | |
| valueRedaction.ts | Rejects payloads with PII/secret shapes | lib (valueApi) | REAL | N | |
| valueReports.ts | Builds signed value snapshots and reports | lib (valueApi) | REAL | Y | |
| valueRisk.ts | Economic significance + regression detection | lib (valueReports) | REAL | N | |
| valueScheduler.ts | Periodic snapshot tick | lib (studioServer) | REAL | N | |
| valueSchema.ts | Snapshot/report zod schemas | lib (valueStore, valueReports, forecast) | REAL | N | |
| valueScoring.ts | Normalizes KPIs into value dimensions | lib (valueReports) | REAL | N | |
| valueSse.ts | Emits value events on the org SSE hub | lib (studioServer) | REAL | N | 16 lines |
| valueStore.ts | Signed on-disk store for value artifacts | lib (api, reports, verifier, passport, forecast) | REAL | Y | |
| valueVerifier.ts | Verifies signatures across the value tree | lib (valueCli) | REAL | N | |

### src/value/connectors

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| csvImport.ts | Thin wrapper over importValueCsvForApi | ORPHAN | DEAD | N | `importValueCsv` has no caller anywhere in src/, tests/, api/ or scripts/; the CLI and API call `importValueCsvForApi` directly |
| localMetricsAdapter.ts | Thin wrapper over ingestValueWebhookForApi | ORPHAN | DEAD | N | `ingestLocalMetricPoints` has zero references outside this file |
| webhookIngest.ts | Thin wrapper over ingestValueWebhookForApi | ORPHAN | DEAD | N | `ingestValueWebhook` has zero references outside this file |

### src/fleet

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| cascadeSimulator.ts | Monte-Carlo cascade-failure model | lib (src/index.ts export only — no CLI) | PARTIAL | Y | Two problems. (1) `stats.faultsDetected/faultsMitigated` count steps where `Math.random() < integrityIndex*0.8` succeeded — a "detection" no agent performed, and 10 iterations of unseeded RNG make the report non-reproducible. (2) `reportSha256` is a sha256 over only `{simulationId, cascadeRiskScore, patternsFound}`, so the field named as the report's digest cannot detect tampering with agents, faults, steps or patterns |
| contradictionDetector.ts | Score deltas on the same question across agents | CLI:`amc fleet contradictions` | REAL | N | Compares distinct reports (i<j), never a list against itself; a "contradiction" is a level delta between self-assessments, not a claim conflict |
| delegationPacket.ts | Signed packet authorising a child run | lib (subagentSpawn) | REAL | Y | |
| fleetLifecycle.ts | Fleet run artifact + cascade-failure detection | CLI:`amc fleet`, lib (fleetScoring) | REAL | Y | |
| fleetScoring.ts | Runs full diagnostics across the fleet | CLI:`amc fleet score` | REAL | Y | Uses runDiagnostic, not quickscore; writes real lifecycle receipts |
| governance.ts | SLOs, environments, health dashboard | CLI:`amc fleet`, API:fleetRouter | REAL | Y | |
| handoffPacket.ts | Signed handoff packets + verification | CLI:`amc fleet handoff`, lib (subagentSpawn) | REAL | Y | `verifyHandoffPacket` rejects the literal "unsigned" rather than passing it |
| multiTenant.ts | "Organization isolation + federated benchmarking" | lib (src/index.ts export only) | FACADE | Y | Fakes tenant isolation. `TenantManager` holds tenants in an in-process `Map` that is never persisted and never consulted by anything; `getIsolation()` returns a namespace, storagePrefix and `encryptionKeyId: key-<sha256(tenantId).slice(0,16)}` naming a key that is never generated, stored or used to encrypt anything. `generateFederatedBenchmark` is handed `allScores` by its caller, so there is no federation. `validateCrossRegionAccess` returns `allowed:false` for every cross-tenant pair regardless of region, so the region branch above it can never change the answer. Nothing in src/ constructs a TenantManager |
| orchestrationDag.ts | Signed multi-agent call-graph capture | CLI:`amc dag` | REAL | N | |
| paths.ts | Per-agent workspace path resolution | lib (~110 modules) | REAL | Y | |
| registry.ts | Fleet/agent config, signing, scaffolding | CLI:`amc fleet`, lib (~45 modules) | REAL | Y | |
| report.ts | Fleet-wide diagnostic report | CLI:`amc fleet report`, API:fleetRouter | REAL | N | |
| trustComposition.ts | Composite trust across delegation edges | CLI:`amc fleet trust`, lib (dashboard) | PARTIAL | Y | `verifyCrossAgentReceipts` does not verify receipts. It counts a from-agent event as "matched" if ANY to-agent event exists within 60s (`Math.abs(te.ts - fe.ts) < 60_000`) — no receipt, hash, id or causal link is checked — then reports it as `matchedReceipts` and `chainCoverage`. Two concurrently-busy agents score ~1.0 coverage with zero actual receipt chain |
| trustInheritance.ts | STRICT/WEIGHTED/FLOOR trust propagation | CLI:`amc fleet trust-inheritance`, API | REAL | Y | |
| typedGraph.ts | Typed multi-agent graph schema + validation | CLI:`amc fleet graph`, lib (enforce, lifecycle) | REAL | Y | |

### src/domains

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| deepIndustryPacks.ts | 150+ regulation-specific question constants | lib (src/index.ts export only) | PARTIAL | Y | Header claims it "Adds granular, regulation-specific questions to existing industry packs" — no code adds them to any pack, question bank or scoring path. The only consumers are the barrel re-export and majorGaps.test.ts, which asserts array lengths |
| domainApply.ts | Applies a domain's guardrails to an agent | CLI:`amc domain apply`, lib (domains/index) | FACADE | Y | Persists fabricated scores as if measured. Line 199 calls `assessDomainForAgent({agentId, domain})` with no scores, so the assessment is derived from an FNV hash of the agent's NAME (see domainCliIntegration.ts). It then (a) writes `domainApply.assessmentScore {composite, level, gaps}` into `.amc/agents/<id>/guardrails.yaml` and (b) selects WHICH guardrail rules to enable from `assessment.complianceGaps` — so the enabled guardrail set is a function of the agent id string, not of the agent |
| domainApplyCli.ts | `amc domain apply` / `--audit` command | CLI:`amc domain apply` | REAL | N | Two overclaims: with no `--responses` the audit scores every control at level 1 silently (`opts.responses ? loadResponses(...) : {}`), and it prints "Signed audit bundle written" for a bundle that carries only a sha256 receiptHash and no signature |
| domainAssessmentEngine.ts | Scores→level, gaps, modules, roadmap | lib (domainCliIntegration, reportBuilder) | REAL | Y | Honest given honest inputs; its caller is what fabricates them |
| domainCliIntegration.ts | CLI-facing domain assessment + assurance | CLI:`amc domain assess` `gaps` `roadmap` `report` `assurance`, lib (domainApply) | FACADE | Y | Two independent fabrications. (1) `buildSyntheticBaseScores`/`buildSyntheticDomainScores` score every question with `pseudoRandomScore(seed)` = FNV-1a hash of `"<agentId>:<domain>:<questionId>"` mapped into 45..92 / 40..95. `assessDomainForAgent` uses them whenever scores are omitted, and `getDomainGaps`, `getDomainRoadmap` and `buildDomainReportForAgent` have NO parameter for real scores at all — so the domain score, maturity level, `certificationReadiness`, compliance gaps, regulatory warnings and 30/60/90 roadmap are all a deterministic function of the agent's NAME. (2) `runDomainAssurance` is a check that cannot fail: it feeds every assurance scenario's `validate()` the module-local constant `SAFE_ASSURANCE_RESPONSE`, a 10-sentence string hand-written to contain each validator's keywords. No agent is invoked, no model is called, and `allPassed` is printed by `amc domain assurance` as "all checks passed". Both surfaces sit behind the paid Industry Packs entitlement (`assertIndustryPackAccess`) |
| domainModuleMap.ts | Module↔domain relevance catalog | lib (domainCliIntegration, assessmentEngine) | REAL | Y | |
| domainRegistry.ts | Domain ids, metadata, aliases | lib (domains/**, score/domainPacks, dashboard) | REAL | Y | |
| domainReportBuilder.ts | Renders a domain report from an assessment | lib (domainCliIntegration, domains/index) | REAL | N | Faithful renderer; the assessment it renders is the synthetic one |
| index.ts | Domains public barrel | lib (cli.ts, ~23 modules) | REAL | Y | Re-exports the fabricating functions as public API |
| industryPackAudit.ts | Deterministic auditor-ready pack audit | lib (domainApplyCli) | REAL | Y | Pure, `now` injected, `verifyIndustryPackAudit` genuinely recomputes the canonical hash. Crosswalk is regex-matched on dimension text and labelled "indicative" in the header |
| industryPackEntitlement.ts | License keys + paywall for industry packs | CLI, API:index.ts, lib (mcp, dashboard) | REAL | Y | Ed25519 + HMAC verification, timingSafeEqual |
| industryPacks.ts | The 41 industry pack definitions | lib (entitlement, audit, mcp, dashboard) | REAL | Y | 2525 lines of pack data |

### src/acp

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| acpAgentServer.ts | ACP agent over one connection | lib (acpStdioMain) | REAL | Y | Unimplemented methods return methodNotFound rather than a fake success |
| acpCli.ts | `amc acp` registration | CLI:`amc acp` | REAL | Y | Exercised by acpStdio.test.ts spawning the built CLI |
| acpConnection.ts | Bidirectional JSON-RPC peer over a stream | lib (acpAgentServer) | REAL | N | |
| acpEnvelope.ts | ACP JSON-RPC envelope + classifier | lib (acpConnection) | REAL | N | |
| acpErrors.ts | JSON-RPC error codes | lib (acpAgentServer, acpConnection) | REAL | N | |
| acpProjection.ts | Signed rows → session/update notifications | lib (acpAgentServer) | REAL | Y | Drops a block rather than emitting an "unsigned" placeholder as agent text |
| acpSchema.ts | Validates against vendored ACP schema via ajv | lib (acpAgentServer) | REAL | Y | Validates the real schema.json, no generated codecs |
| acpStdioMain.ts | Runs the ACP agent on stdio | lib (acpCli) | REAL | Y | Via spawned CLI in acpStdio.test.ts |
| acpStopReason.ts | Turn ending → ACP stop reason | lib (acpAgentServer) | REAL | N | Lossy mapping declared via `stopReasonIsLossy` |

### src/utils

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| errors.ts | toErrorMessage / validateOption | lib (cli.ts, sdk, domains) | REAL | Y | |
| fs.ts | ensureDir / atomic write / read helpers | lib (319 modules) | REAL | Y | |
| hash.ts | sha256Hex | lib (362 modules) | REAL | Y | |
| json.ts | Deep-sorted canonical JSON | lib (229 modules) | REAL | Y | |
| providerKeys.ts | Provider key env names, strip, dummy | lib (bashTool, adapters, monitor) | REAL | Y | |
| time.ts | parseWindowToMs / dayKey | lib (17 modules) | REAL | Y | |
| typeGuards.ts | Typed readonly-array includes | lib (guideGenerator, 3 schedulers) | REAL | Y | 7 lines |

### src/correlation

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| correlate.ts | Verifies trace receipts against the ledger | lib (diagnostic/runner) | REAL | Y | Real signature verification via verifyReceipt, real hash comparison against `payload_sha256` |
| correlationAudits.ts | Persists correlation issues as audit rows | lib (diagnostic/runner) | REAL | N | |
| correlationReport.ts | Turns metrics into operator warnings | lib (diagnostic/runner) | REAL | N | |
| traceSchema.ts | amc_trace_v1 zod schema + NDJSON parser | lib (correlate, importers, otelExporter) | REAL | N | |

### src/gateway

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| config.ts | Signed gateway config, presets, env refs | CLI:`amc up`, lib (~24 modules) | REAL | Y | |
| redaction.ts | Header/body redaction for recorded traffic | lib (server, toolhubReceipts) | REAL | N | Nulls `originalPayloadSha256` when redacted rather than hashing the redacted bytes and calling it the original |
| server.ts | Recording proxy: lease, CIDR, budget, redact | CLI:`amc up`, lib (studio, demo) | REAL | Y | |
| upstreamAuth.ts | Resolves upstream creds per request | lib (server) | REAL | Y | |

### src/terminal

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| pipeTerminal.ts | Shell over pipes, no PTY | lib (kernel/services/terminalServices) | REAL | Y | `resize` absent rather than a no-op |
| terminalSession.ts | Session + per-send nonce readiness ladder | lib (kernel/services/terminalServices) | REAL | Y | |
| terminalTypes.ts | Readiness ladder vocabulary | lib (terminalSession, pipeTerminal, kernel) | REAL | Y | `settled`/`proven` carried separately so a timeout rung cannot read as success |

### src/trust

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| temporalDecay.ts | Exponential half-life decay of trust evidence | CLI:`amc trust decay` | PARTIAL | Y | The math and freshness buckets are real, but `computeTemporalDecayReport` returns `signature: \`decay:${agentId}:${now}\`` — a field named "signature" whose value is the agent id and a timestamp concatenated. No key, no digest, no verify function; anyone can produce a matching "signature" for any report |
| trustConfig.ts | Trust config, notary trust, signing policy | CLI:`amc trust`, lib (~21 modules) | REAL | Y | `checkNotaryTrust` does a real HTTP attest + `verifyNotaryAttestResponse` |

### src/executive

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| brief.ts | Board-facing risk brief from a run report | CLI:`amc executive brief` | REAL | N | Reads a resolved run report and evidence readiness; gates claim eligibility on `readiness.claimEligible` |

### src/startup

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| startupGuidance.ts | 10-minute startup plan and blocker list | CLI:`amc quickstart --startup-plan` (dynamic import) | REAL | Y | Every issue is a real filesystem/env probe; explicitly states "Sample answers are starter scaffolding, not evidence of actual maturity" |

### src (loose files)

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| cli.ts | Root command tree, 24.6k lines | CLI:`amc` | REAL | Y | |
| cli-agent-commands.ts | `amc agent-loop run/verify` (hidden group) | CLI:`amc agent-loop` | REAL | Y | |
| cli-business-commands.ts | KPI/ROI, leaderboard, inventory, comms-check | CLI:`amc business` / `executive` / `leaderboard` / `inventory` / `comms-check` | REAL | Y | `comms-check` prints "Message passed all compliance checks" when ~12 regexes miss; for `--domain technology` only 6 patterns run at all. Its own description says "lightweight". Several tests (businessGrcExport, businessFairScenario) assert on the FILE TEXT rather than behaviour |
| cli-composition-commands.ts | Plugin composition kernel commands | CLI:`amc composition` | REAL | N | Returns null when the kernel is absent instead of faking one |
| cli-credentials-commands.ts | `amc credentials` list/describe/set/unset | CLI:`amc credentials` | REAL | Y | Never prints or accepts a secret value |
| cli-domain-product-commands.ts | `amc domain pack/assess/gaps/roadmap/assurance` | CLI:`amc domain`, `amc product` | REAL | N | Wiring is honest; it is the surface that PRINTS the domainCliIntegration.ts fabrications as "Domain Assessment", "Certification Readiness" and "all checks passed" |
| cli-eval-dataset-commands.ts | Golden-set and lite-score commands | CLI:`amc dataset`, `amc lite-score` | REAL | N | |
| cli-evidence-store-commands.ts | Receipt chains + evidence store consolidation | CLI:`amc evidence-store` | REAL | N | |
| cli-import-commands.ts | `amc import <path>` neutral importers | CLI:`amc import` | REAL | N | |
| cli-late-stage-commands.ts | demo, redteam, dashboard, assurance commands | CLI:`amc demo` / `redteam` / `dashboard` | REAL | Y | `demo run --no-vault` prints "Trust label: DEMO_ONLY — not production audit evidence" |
| cli-observability-commands.ts | `amc observe` and `amc correct` | CLI:`amc observe`, `amc correct` | REAL | N | |
| cli-prompt-commands.ts | System-prompt assembly inspection | CLI:`amc prompt` | REAL | Y | |
| cli-session-commands.ts | Session spine verify/inspect/recover (hidden) | CLI:`amc session` (hidden) | REAL | N | Recovery closers are labelled synthetic and counted separately in output |
| cli-strategy-commands.ts | Inference-strategy evaluation commands | CLI:`amc strategy` | REAL | N | |
| cli-trace-commands.ts | Trace explorer + SIEM/webhook alerts | CLI:`amc trace`, `amc alert` | REAL | N | |
| cli-vault-zk-commands.ts | Vault commitment / secret-sharing utilities | CLI:`amc vault` | REAL | N | Explicitly disclaims: "src/vault/zkPrivacy.ts is not a zero-knowledge proof system" |
| cliFormat.ts | Brand-consistent terminal formatting | lib (cli.ts and command modules) | REAL | N | scoreBox/logo covered by utilsCoreFoundation.test.ts |
| cliUx.ts | Command inventory, grouped help, completions | lib (cli.ts) | REAL | Y | |
| index.ts | Public package barrel | lib (package `main`) | REAL | Y | Header states presence here is not evidence a capability is active; guarded by publicApiSurface.test.ts |
| types.ts | Shared domain types (4405 lines) | lib (nearly everything) | REAL | N | |
| version.ts | Reads version from package.json | lib (acp, cli) | REAL | N | |
| workspace.ts | init/doctor/quickstart workspace lifecycle | CLI:`amc init`, `amc doctor` | REAL | Y | |

## satellites

Slice: `integrations/` `sdk/python/` `platform/python/` `scripts/`.
248 files classified individually; `platform/python/tests/` (93 files) summarised in its own block rather than swept file-by-file.
Language note: this slice contains no `.ts` files — it is Python (`.py`) plus Node scripts (`.mjs`/`.cjs`/`.js`).

### integrations/pytest-amc

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| src/pytest_amc/__init__.py | package version marker | lib (plugin) | REAL | N | two lines, `__version__ = "1.0.0"` (pyproject says 1.0.0 too) |
| src/pytest_amc/gate.py | decide if an AMC result fails a build | lib (plugin.py) | REAL | Y | refuses to pass a level gate on `status != VALID` / `UNRELIABLE` labels; `min_layer_level` takes the min, not the mean |
| src/pytest_amc/plugin.py | pytest hook running `amc quickscore --auto` | pytest entry-point `amc` (pyproject) | REAL | N | fails the run via `session.exitstatus = 1`; no test spawns pytest with the plugin, so only `gate.py` is covered |
| tests/test_gate.py | unit tests for the gate decision | test | REAL | — | table of named failure cases; does not exercise plugin.py |
| examples/test_example.py | usage demo for the plugin | ORPHAN (doc example) | STUB | N | every assertion is a tautology (`assert True`, `assert 1+1==2`); its footer advertises `--amc-fail-below`, a flag `plugin.py` does not define |

### sdk/python/amc_sdk

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| __init__.py | package barrel and version | lib (consumers) | REAL | Y | re-exports client + proof symbols; docstring warns `end_turn` is not success |
| client.py | ACP JSON-RPC client over `amc acp` | lib (SDK users) | REAL | Y | real NDJSON transport, id-correlated replies, reader/stderr threads; module docstring references `Session.prove`, which does not exist (proof lives in module functions) |
| proof.py | anchor/export/verify a session proof via CLI | lib (SDK users) | REAL | Y | thin `subprocess` wrapper; `verify_proof` can only return True or raise — non-vacuity comes from the CLI's exit code, and `tests/test_end_to_end.py` proves it with a forged fingerprint |
| tests/test_end_to_end.py | drives the real CLI end-to-end | test | REAL | — | every test is `skipif` when no `amc` binary supporting `acp` is found, so the whole file is a silent no-op unless `AMC_BIN` points at a build |

### scripts

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| amc-dogfood-8-agents.mjs | run 8 synthetic agents through every AMC surface | npm `qa:dogfood-8-agents` (not in CI) | FACADE | N | the "agents" are a generated `agent.mjs` that writes evidence keyed off a boolean: `eval-output.json` → `passed: improved`, `benchmark-result.json` → `passRate: improved ? 1 : 0.67`, guardrails/memory/graph all branch on the same flag; strict evidence comes from `generateDogfoodMaturityEvidence({targetMaturity})`, which emits evidence at exactly the level being tested, after which the receipt reports the agent "hit target maturity". Per-agent `surfaces.fleet` is the literal string `"covered-by-fleet-status"` and `surfacePassed()` accepts that literal as a pass, so fleet coverage is never checked per agent |
| architecture-boundaries-check.mjs | line-count ratchet + API/CLI boundary gate | npm `check:architecture-boundaries`, CI, release-gate | REAL | Y | descending baselines in `line-budgets.json`; data-registry exemption is verified by logic ratio, not asserted |
| build-pages-site.mjs | build the static docs/site bundle | npm `build:pages`, pages.yml | REAL | Y | hashes and manifests brand assets |
| build-sea.mjs | build a single-executable CLI | npm `build:sea` | REAL | N | downloads an official Node binary and injects the SEA blob |
| clean-dist.mjs | remove dist/ with retries | npm `clean` | REAL | N | `rmSync` with maxRetries for the macOS `.DS_Store` ENOTEMPTY race |
| compat-matrix-report.mjs | write a per-OS/Node compatibility report | nightly-compatibility-matrix.yml | PARTIAL | Y | the `checks` block only mirrors env vars the workflow sets after each step; `quickscoreJson` reads `AMC_MATRIX_QUICKSCORE_JSON` but the workflow sets `AMC_MATRIX_FULLSCORE_JSON`, so that field is `false` in every report ever produced |
| compliance-artifact-freshness.mjs | fail when committed SBOM/compliance files rot | npm `check:compliance-freshness`, CI | REAL | Y | version-matches-package and 180-day evidence-window checks |
| docs-drift-check.mjs | ban stale commands and forbidden names in public docs | npm `check:docs-drift`, CI, release-gate | REAL | Y | regex scan over an explicit file set |
| evidence-path-check.mjs | catch score criteria pointing at nonexistent modules | npm `check:evidence-paths`, CI | REAL | Y | freezes the known-absent set in `evidence-paths.json` so a new phantom path fails |
| fake-external-signer.mjs | test double for an external Ed25519 signer | test (tests/notaryTrust.test.ts), docs/NOTARY.md | REAL | Y | genuine Ed25519 signing over the supplied payload, sha256 cross-checked; note it emits `claims: {hardware: true, device: "HSM", serialRedacted: "simulated"}` from pure software — any consumer that trusts `claims.hardware` is trusting a fixture |
| gen-api-ref.cjs | generate docs/API_REFERENCE.md from source | npm `gen:api-ref` / `check:api-ref`, CI | REAL | N | reads the generated CLI command inventory |
| gen-changelog-page.mjs | render newest CHANGELOG entry into the site | npm `gen:changelog-page` / `check:changelog-page`, CI | REAL | N | only the newest section is generated; older wording is left alone |
| gen-counts.mjs | single source of truth for published self-counts | npm `gen-counts` / `check:counts`, CI | REAL | Y | measures the repo and rewrites `<!-- amc:count:* -->` markers |
| gen-question-bank-export.mjs | regenerate the full question-bank JSON export | npm `check:question-bank-export`, CI | REAL | N | picks the bank array out of the built module by "array longer than 100" |
| incident-readiness-check.mjs | check incident-response readiness of a workspace | npm `check:incident-readiness`, CI | PARTIAL | N | "readiness" is four markdown files existing plus four `.amc/` directories; artifact checks only warn. Prints "PASS: incident readiness baseline checks passed" with nothing about the incident process verified |
| install-persona-qa.mjs | install the packed CLI and run per-persona flows | npm `qa:install-personas`, release-gate | REAL | Y | real assertions on real CLI JSON (question count, SLA flag, pack count) |
| package-desktop-installers.mjs | build the desktop installer archives | npm `package:desktop` | REAL | Y | stages, hashes, and manifests each archive |
| postinstall.js | print a post-install banner | package.json `postinstall` | REAL | Y | exits early under CI |
| prepack-release-check.mjs | pack, SBOM, scan, sign, verify a release | npm `release:prepack-check`, release.yml, npm-publish.yml | REAL | Y | signs with a throwaway Ed25519 key then verifies |
| prepare-public-release-assets.mjs | assemble verified public release assets | npm `release:prepare-assets`, release.yml | REAL | N | every input is digest-checked against the installer manifest |
| release-gate.mjs | run the full pre-release check battery | npm `release:gate` (manual, not in CI) | REAL | N | each step is a real subprocess with timeout + kill; `--quick` records skips as `skipped`, never as passed |
| render-brand-assets.mjs | render the OG card PNG with Playwright | npm `brand:render` | REAL | Y | asserts the rendered PNG is 1200x630 |
| research-amc-landscape.mjs | collect papers/repos/competitors, emit gap register | npm `research:amc-landscape` (manual) | FACADE | N | papers (OpenAlex) and repos (`gh api`) are really fetched, but the headline "5,000 prioritized gaps" are template sentences: `makeGap()` interpolates a source title into a per-category template, `priorityFor()` returns a constant from `gapTemplates[category].priority`, `selectImprovementDimension()` picks by `pool[index % pool.length]`, and `generateGaps()` loops the source list `maxRounds` times purely to reach `targetGaps`. Rationale, risk-if-ignored, effort and next-step are all template text presented as research findings |
| run-e2e.mjs | run the Playwright website suite | npm `test:e2e` (not in CI) | REAL | N | reports the missing dependency instead of failing opaquely |
| run-policy-fixtures-ci.mjs | policy fixture regression + determinism check | npm `check:policy-fixtures`, CI | REAL | N | runs the fixture twice and requires byte-identical output |
| security-scan-lite.mjs | secret scan of shipped surfaces | ci.yml `security-scan-lite` job | PARTIAL | Y | scans `dist`, `docs`, `deploy/helm`, `scripts` only — `src/` is deliberately excluded (comment says adversarial fixtures cause false positives), so no secret committed under `src/` can fail this gate |
| verify-amc-landscape.mjs | verify the landscape research artifacts | npm `research:amc-landscape:verify` | PARTIAL | N | genuine uniqueness/URL/priority-enum checks, but the count assertions are re-derived from the same run's files and several assertions read `summary.requirements.*` — booleans the generator wrote about its own output. It cannot detect that the 5,000 gaps are templates |
| verify-desktop-installers.mjs | verify installer archives and manifest | npm `package:desktop:verify` | REAL | Y | sha256 per artifact, reads entries back out of the archives |
| verify-release-version.mjs | cross-check version across package/CLI/installers | npm `release:verify-version`, release.yml | REAL | Y | five sources plus the git tag must agree |
| write-accessibility-release-evidence.mjs | render axe run results as release evidence | npm `accessibility:release-evidence` | REAL | Y | writes "Manual assistive-technology review: NOT COMPLETE" and exits 2 on failures — refuses to read as a WCAG claim |
| brand/og-card.html | source page for the OG card render | data (render-brand-assets.mjs) | REAL | N | markup only |
| evidence-paths.json | frozen known-absent evidence paths | data (evidence-path-check.mjs) | REAL | Y | registry, not code |
| line-budgets.json | per-file line-count baselines | data (architecture-boundaries-check.mjs) | REAL | Y | registry, not code |

### scripts/lib, scripts/dev, scripts/vendor

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| lib/outputPathArg.mjs | reject a flag where an output path is expected | lib (compat-matrix-report, security-scan-lite) | REAL | Y | exists because scripts wrote files literally named `--json` |
| dev/reachability.mjs | report importers of a source file | ORPHAN | DEAD | N | no package.json script, no workflow, no doc, no importer anywhere in the repo references it |
| vendor/build-workspace.mjs | build vendored packages to their declared entry | ORPHAN | DEAD | N | nothing references `build-workspace` anywhere in the repo — not package.json, not CI, not vendor docs |
| vendor/gen-third-party-notices.mjs | generate THIRD_PARTY_NOTICES from vendor/ | npm `gen:/check:third-party-notices`, CI | REAL | N | reads upstream identity from the vendored ledger table |
| vendor/rescope-vendor.mjs | rescope vendored packages to `@amc/*` | npm `vendor:rescope` / `check:vendor-rescope`, CI | REAL | N | deliberately does not touch runtime identifiers or LICENSE files |
| vendor/verify-vendored-links.mjs | assert vendored names resolve to the workspace copy | npm `check:vendor-links`, CI | REAL | N | fails if a package resolves outside `vendor/` |

### platform/python (root)

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| conftest.py | put `platform/python` on sys.path for pytest | pytest | REAL | — | 8 lines |
| run_full_validation.py | "full platform validation", 7 phases | script (manual) | FACADE | N | PHASE 6 "InvoiceBot L5 Profile" ignores the profile's answer text and builds each answer as `" ".join(rubric["yes"] + rubric["evidence"])` — the rubric's own keyword lists fed back into the keyword scorer — then asserts `overall_level == L5`. The scorer is being scored against a copy of itself, and the pass is recorded in the committed `VALIDATION_REPORT_v3.md` as `overall=MaturityLevel.L5`. Also a second, pytest-duplicating harness that no CI job runs |
| stress_test_expert.py | "62 checks across 10 suites" pre-prod stress test | script (manual) | FACADE | N | SUITE 9 repeats the same rubric-against-itself L5 construction (`answers[qid] = " ".join(rubric["yes"] + rubric["evidence"])`, `assert result.overall_level == MaturityLevel.L5`). Its `check()` also only counts a pass when the check function returns non-None, so a check returning `None` is silently neither passed nor failed |

### platform/python/amc (package barrels)

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| __init__.py | package entry-point re-exports | lib (importers) | REAL | N | re-exports core models/exceptions/settings; version from package metadata |
| core/__init__.py | core primitives barrel | lib | REAL | N | |
| enforce/__init__.py | enforce barrel | lib | REAL | N | re-exports e1 only; the other 34 modules need direct import |
| shield/__init__.py | shield barrel | lib | REAL | N | re-exports s1/s10 only |
| vault/__init__.py | vault barrel | lib | REAL | N | re-exports v2 only |
| watch/__init__.py | watch barrel | lib | REAL | N | re-exports w2/w4/w5/w6/w7/w8/w9/w10 |
| product/__init__.py | product barrel | lib | REAL | N | re-exports the feature catalog |
| agents/__init__.py | empty package marker | lib | REAL | N | 1 line |
| api/__init__.py | empty package marker | lib | REAL | N | 1 line |
| api/routers/__init__.py | empty package marker | lib | REAL | N | 1 line |
| benchmarks/__init__.py | empty package marker | ORPHAN | DEAD | N | 0 bytes; package is unreachable (see benchmarks block) |
| score/__init__.py | empty package marker | lib | REAL | N | 1 line |
| web/__init__.py | empty package marker | lib | REAL | N | 1 line |

### platform/python/amc/core

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| config.py | pydantic-settings for the platform | lib (57 importers via barrel) | REAL | N | creates data directories on load |
| exceptions.py | exception hierarchy | lib | REAL | N | |
| logging.py | structlog configuration | lib (cli) | REAL | N | |
| models.py | shared models: receipts, findings, decisions | lib (57 modules, 11 tests) | REAL | Y | the most-imported module in the package |

### platform/python/amc/cli.py, amc/web

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| cli.py | typer CLI: shield/policy/product/watch/score/view | CLI:`amc-platform` console script | PARTIAL | N | exposes ~12 commands over 5 of the ~190 modules; `view` without `--sample` carries `# TODO: Load actual results from file` and instead runs the whole questionnaire interactively. No test drives the CLI |
| web/viewer.py | browser viewer with "shareable report URLs" | lib (cli `view`) | PARTIAL | N | results live in a module-global dict (`_RESULTS_STORE`, commented "in production, use Redis/DB"), so a "shareable" URL only resolves inside the one process that generated it |

### platform/python/amc/api

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| main.py | FastAPI app, middleware, router mounting | API:app; console script `amc-server` | PARTIAL | Y | `[project.scripts] amc-server = "amc.api.main:run"` names a function that does not exist in the module — the console script raises on start. Routers are mounted through `_include_router_if_available`, which logs a warning and continues, so an import failure silently ships an API missing whole prefixes |
| routers/enforce.py | policy status + evaluate endpoints | API:`/api/v1/enforce` | REAL | N | wraps `e1_policy`; no test hits this prefix |
| routers/product.py | ~470 product routes | API:`/api/v1/product` | REAL | Y | 7,744 lines registering the whole product layer; the only prefix any test exercises (32 references) |
| routers/score.py | questionnaire session endpoints | API:`/api/v1/score` | REAL | N | SQLite-backed session store |
| routers/shield.py | skill scan / injection / sanitize endpoints | API:`/api/v1/shield` | REAL | N | exposes 3 of the 16 shield modules |
| routers/vault.py | DLP status + redact endpoints | API:`/api/v1/vault` | REAL | N | exposes 1 of the 14 vault modules |
| routers/watch.py | receipts, chain verify, assurance endpoints | API:`/api/v1/watch` | REAL | N | exposes w1/w2 |

### platform/python/amc/agents

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| content_moderation_bot.py | ungoverned demo bot (V1) | lib (run_cmb_harness) | REAL | N | honest demo-grade classifier |
| data_pipeline_bot.py | intentionally broken demo bot | script target (run_dpb_selfimprove rewrites this file) | REAL | N | comment admits "Simulate fetching — in real life this would be HTTP/DB call"; that is the point of the fixture |
| legal_contract_bot.py | ungoverned demo bot (V1) | lib (run_lcab_autonomous) | REAL | N | |
| fix_generator.py | AST inspection + fix-plan generation | lib (run_dpb_selfimprove) | REAL | N | genuinely parses the target file and rewrites it |
| evidence_comparison_test.py | old-vs-new scoring comparison script | ORPHAN (referenced only by a committed report) | REAL | N | deliberately builds keyword-stuffed answers to *demonstrate* the old scorer is gameable — honest demo, but nothing runs it |
| run_cmb_harness.py | "autonomous self-improvement" harness, ~60 modules | script (manual) | FACADE | N | the L1→L5 climb is scripted: `integrate_and_test()` imports a module, calls it once, and on success overwrites questionnaire answers with pre-written keyword-rich strings supplied at the call site (e.g. `"sec_1": "Policy firewall via …ToolPolicyFirewall. enterprise-secure preset with allowlist/deny-list rules…"`), then re-scores. The score rises because prepared text replaced the "no … none" seed text, not because the bot changed. Also the sole importer of ~35 shield/enforce/vault modules |
| run_lcab_autonomous.py | same harness for the legal-contract bot | script (manual) | FACADE | N | same construction: `answers` seeded with denial text, replaced with pre-written keyword answers per successful integration, `engine.score_all(answers)` re-run to show the climb |
| run_dpb_selfimprove.py | reasoning-driven self-improvement loop | script (manual) | FACADE | N | `inspect_code()` maps a lowercase substring in the bot's source to a pre-written "Yes, we …" answer stuffed with rubric keywords (`"toolpolicyfirewall" in src` → "Yes, we have a policy firewall …allowlist/deny-list rules"). Inserting an identifier is sufficient to raise the maturity score; the fix does not have to work. The AST fix machinery underneath (fix_generator) is real |

### platform/python/amc/benchmarks

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| benchmark_suite.py | three canonical reference agents for calibration | ORPHAN (only benchmark_runner, itself dead) | FACADE | N | the L5 reference agent is 47 artifacts minted by `_ev()` as `kind=EXECUTION_VERIFIED` with `execution_result={"status": "ok", "verified": True}` and `execution_error=None` — nothing is executed. This is precisely attack #4 ("hardcoded_output_attack") that `score/adversarial.py` documents as a way to forge scores, committed in-tree as the L5 benchmark |
| benchmark_runner.py | score the reference agents, assert expected ranges | ORPHAN | DEAD | N | zero importers; invoked only by the `python -m amc.benchmarks.benchmark_runner` line in its own docstring. Prints PASS for the L5 agent whose evidence was forged above |

### platform/python/amc/score

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| dimensions.py | 7-dimension keyword rubric scoring engine | lib (cli, api score router, agents, viewer) | PARTIAL | Y | levels come from substring keyword matching over free text; the module's own adversarial tester shows keyword-stuffing scores 84+. Honest about the mechanism, but every "maturity level" in this package is downstream of it |
| evidence.py | evidence kinds and trust multipliers | lib (score, agents) | REAL | N | data + one static method |
| evidence_collector.py | collect "execution proof" per rubric question | lib (agents, adversarial) | FACADE | N | `EvidenceKind.EXECUTION_VERIFIED` is documented as "Module called, got real result" and is awarded when `instance = cls()` merely does not raise — no capability is exercised. The gate before it, `module_referenced`, is `module_path in source or module_short in source or class_name in source`, which a comment satisfies. `score/adversarial.py` documents both holes as known gaps, and the label is still emitted |
| adversarial.py | attack the scorer to prove/refute gaming resistance | ORPHAN | DEAD | N | 773 lines, zero importers, zero tests; honest about its findings ("PARTIAL GAP — mocking elevates mapped qids to EXECUTION_VERIFIED") but nothing runs it, so nothing acts on them |
| formal_spec.py | M(a,d,t) maturity math, decay, velocity, CI | ORPHAN | DEAD | N | 920 lines of pure functions; zero importers, zero tests, referenced only by its own `python -m` docstring |
| l5_requirements.py | what L5 actually requires, per dimension | lib (run_dpb_selfimprove only) | REAL | N | data catalogue; unusually honest text ("This is essentially what this self-improvement loop does, but in production") |
| questionnaire.py | question sequencing and session state | lib (cli, api score router, viewer) | REAL | Y | exercised only through `tests/e2e_invoicebot.py` |

### platform/python/amc/enforce

Reachability note: every module below except e1/e5/e6/e7/e35 has exactly one in-tree importer — `amc/agents/run_cmb_harness.py`, the demo harness. None of them is reachable from the CLI or from any API route.

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| e1_policy.py | tool-call policy firewall with presets | lib (cli, api enforce router, agents) | REAL | Y | the one enforce module wired to both CLI and API |
| e2_exec_guard.py | shell/exec command guard | lib (run_cmb_harness only) | REAL | N | untested |
| e3_browser_guardrails.py | browser navigation/anti-phishing guard | lib (run_cmb_harness only) | PARTIAL | N | real levenshtein/entropy domain checks, but `_ocr_screenshot` admits "In production this would use OCR; here we read the file as text" |
| e4_egress_proxy.py | domain allowlist egress proxy | lib (run_cmb_harness only) | PARTIAL | N | proxy and decisions are real; `generate_iptables_rules` emits `# TODO: resolve wildcard allow …` comments instead of rules for wildcard domains, so wildcard entries produce no enforcement |
| e5_circuit_breaker.py | session budget / circuit breaker | lib (agents, evidence_collector) | REAL | Y | covered by `tests/e2e_invoicebot.py` only |
| e6_stepup.py | step-up human approval | lib (agents, evidence_collector) | REAL | Y | |
| e7_sandbox_orchestrator.py | Docker-or-tempdir sandbox orchestration | lib (s2, run_cmb_harness) | PARTIAL | N | Docker path is real; without Docker it "sandboxes" into a temp directory with no isolation, and the same `SandboxHandle` type is returned either way |
| e8_session_firewall.py | cross-session data firewall / diode | lib (run_cmb_harness only) | REAL | N | untested |
| e9_outbound.py | outbound message safety layer | lib (run_cmb_harness only) | REAL | N | untested |
| e10_gateway_scanner.py | gateway exposure scan + hardening plan | lib (run_cmb_harness only) | PARTIAL | N | classifies a supplied config; the "scanner" does not probe a running gateway |
| e11_mdns_controller.py | mDNS/local discovery leak control | lib (run_cmb_harness only) | REAL | Y | hand-written DNS record parser |
| e12_reverse_proxy_guard.py | header-spoofing / proxy trust guard | lib (run_cmb_harness only) | REAL | Y | |
| e13_ato_detection.py | sender account-takeover risk scoring | lib (run_cmb_harness only) | REAL | N | cosine-similarity + hour-histogram heuristics; untested |
| e14_webhook_gateway.py | signed webhook validation + replay protection | lib (run_cmb_harness only) | REAL | Y | real HMAC verification and nonce store |
| e15_abac.py | attribute-based access control engine | lib (run_cmb_harness only) | REAL | N | untested |
| e16_approval_antiphishing.py | type-to-confirm approval cards | lib (run_cmb_harness only) | REAL | N | untested |
| e17_dryrun.py | tool dry-run / digital-twin simulation | lib (run_cmb_harness only) | REAL | Y | per-tool analysers produce proposed changes and an apply token |
| e18_secret_blind.py | secret-blind form fill broker | lib (run_cmb_harness only) | REAL | Y | |
| e19_two_person.py | two-person integrity workflow | lib (run_cmb_harness only) | REAL | Y | |
| e20_payee_guard.py | payee change / payment rail guard | lib (run_cmb_harness only) | REAL | Y | covered by e2e only |
| e21_taint_tracking.py | taint tracking for untrusted input | lib (run_cmb_harness only) | REAL | N | untested |
| e22_schema_gate.py | structured output schema gate + repair | lib (run_cmb_harness only) | REAL | N | untested |
| e23_numeric_checker.py | numeric reasonableness / unit consistency | lib (run_cmb_harness only) | REAL | Y | |
| e24_evidence_contract.py | citations-or-it's-off output contract | lib (run_cmb_harness only) | REAL | N | untested |
| e25_config_linter.py | agent config risk linter | lib (run_cmb_harness, run_lcab) | REAL | N | untested |
| e26_mode_switcher.py | risk-based agent mode switching | lib (run_cmb_harness only) | REAL | N | untested |
| e27_temporal_controls.py | time-window / holiday execution controls | lib (run_cmb_harness only) | REAL | N | untested |
| e28_location_fencing.py | CIDR/geo fencing with quarantine | lib (run_cmb_harness only) | REAL | N | untested |
| e29_idempotency.py | idempotency shield for repeated actions | lib (run_cmb_harness only) | REAL | Y | |
| e30_cross_source_verify.py | require agreement across sources | lib (run_cmb_harness only) | REAL | Y | compares distinct source records, not a list against itself |
| e31_clipboard_guard.py | clipboard/pasteboard policy | lib (run_cmb_harness only) | REAL | Y | |
| e32_template_engine.py | restricted message template engine | lib (run_cmb_harness only) | REAL | Y | |
| e33_watchdog.py | second-opinion watchdog over proposed actions | lib (run_cmb_harness only) | REAL | Y | |
| e34_consensus.py | n-of-m consensus over independent votes | lib (run_cmb_harness only) | REAL | Y | votes are supplied by the caller; the engine does not fabricate a second opinion |
| e35_model_switchboard.py | model routing with safety tiers | lib (run_cmb_harness, l5_requirements) | REAL | Y | |

### platform/python/amc/shield

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| s1_analyzer.py | static "toxic skill" analyzer | lib (api shield router, s2, s7, agents) | REAL | Y | regex/AST rule set |
| s2_behavioral_sandbox.py | detonate a skill and record runtime signals | lib (run_cmb_harness only) | PARTIAL | N | really executes in a temp dir with psutil/proc sampling when available; without psutil the process/network signals silently degrade to empty and the report still reads as a detonation. `random.choice` only randomises decoy env values |
| s3_signing.py | Ed25519 skill signing and verification | lib (s7, run_cmb_harness) | REAL | Y | real `cryptography` Ed25519 sign/verify against a registered publisher key |
| s4_sbom.py | SBOM generation, CVE watch, fetch-exec detection | lib (agents) | PARTIAL | Y | SBOM/CycloneDX/SPDX export is real; `CVEWatcher` matches against 15 `_KnownCVE` entries hardcoded in the file (newest 2024) and never consults a feed |
| s5_reputation.py | publisher/skill trust scoring, Sybil detection | lib (run_cmb_harness only) | REAL | Y | |
| s6_manifest.py | skill permission manifest validator + enforcer | lib (run_cmb_harness only) | REAL | N | 1,256 lines, no test; its `TODO:` strings are template text it emits into generated manifests on purpose |
| s7_registry.py | private enterprise skill registry | lib (run_cmb_harness only) | PARTIAL | Y | `sync_upstream` is a documented placeholder: "validates the upstream URL is in allowlist and returns an empty queue", with `TODO: Implement HTTP fetch + signature verification` — a sync that never syncs |
| s8_ingress.py | channel ingress shield, pairing, rate limits | lib (run_cmb_harness only) | PARTIAL | N | 830 lines, no test; pairing codes come from `random.choices(string.digits)` (not `secrets`), so the pairing code is predictable |
| s9_sanitizer.py | content sanitisation gateway (reader pattern) | lib (e8, v4, run_cmb_harness) | REAL | N | 839 lines, no direct test |
| s10_detector.py | prompt-injection detector and risk scorer | lib (api shield router, 13 modules) | REAL | Y | rule-based; honest about being regex+heuristic |
| s11_attachment_detonation.py | attachment detonation → safe text | lib (run_cmb_harness only) | PARTIAL | N | header says text files return plain text and other types a "redacted stub" — binary attachments are not analysed |
| s12_oauth_scope.py | OAuth scope drift reviewer | lib (run_cmb_harness only) | REAL | N | untested |
| s13_download_quarantine.py | download quarantine + safe-open | lib (run_cmb_harness only) | PARTIAL | N | quarantine and hashing are real; `extract_safe_text` returns a stub for non-text files |
| s14_conversation_integrity.py | conversation integrity monitor | lib (run_cmb_harness only) | REAL | Y | |
| s15_threat_intel.py | threat-intel feed for domains/IPs/patterns | lib (agents, evidence_collector) | PARTIAL | Y | a "feed" with no ingestion: SQLite seeded from `_build_preseed_entries()` plus manual `bulk_import`; nothing fetches or refreshes indicators |
| s16_ui_fingerprint.py | trusted-UI fingerprint guard | lib (run_cmb_harness only) | REAL | Y | |

### platform/python/amc/vault

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| v1_secrets_broker.py | just-in-time scoped secret tokens | lib (run_cmb_harness only) | REAL | N | file/env backends; 824 lines with no test |
| v2_dlp.py | DLP redaction middleware | lib (api vault router, 14 modules) | REAL | Y | regex + entropy detectors; the most-used vault module |
| v3_honeytokens.py | canary token generation and alerting | lib (run_cmb_harness only) | REAL | Y | "fake token" wording is the product, not a shortcut |
| v4_rag_guard.py | RAG retrieval guard, poisoning triage | lib (run_cmb_harness only) | REAL | N | 725 lines, no test |
| v5_memory_ttl.py | memory TTL and purpose limitation | lib (run_cmb_harness only) | REAL | N | untested |
| v6_dsar_autopilot.py | DSAR request lifecycle and data packages | lib (run_cmb_harness only) | PARTIAL | Y | the filesystem connector really scans; `StubConnector.delete()` returns `bool(item)` and its docstring says "A stub cannot mutate external systems; it only records intent" — a DSAR erasure against any non-filesystem system is recorded as done without deleting anything |
| v7_data_residency.py | region routing and anonymisation gate | lib (run_cmb_harness only) | REAL | Y | |
| v8_screenshot_redact.py | screenshot/recording redaction pipeline | lib (run_cmb_harness only) | PARTIAL | N | imports `PIL` at module top level but Pillow is not in `pyproject.toml` dependencies, so the module is unimportable on a clean install. Without `pytesseract` (also undeclared) `_detect_sensitive_regions` falls back to blacking out any 24px row that is >32% dark pixels — no text is read, yet the result still reports `redactions_count` and a share link |
| v9_invoice_fraud.py | invoice fraud / vendor impersonation scoring | lib (run_cmb_harness only) | REAL | Y | |
| v10_undo_layer.py | undo layer / trash can with versions | lib (run_cmb_harness only) | REAL | N | untested |
| v11_metadata_scrubber.py | attachment metadata scrubbing | lib (run_cmb_harness only) | PARTIAL | Y | JSON/CSV/text scrubbing is real; `_handle_binary` cannot strip embedded metadata and passes the file through |
| v12_data_classification.py | data labels + propagation policy | lib (run_cmb_harness only) | REAL | Y | |
| v13_privacy_budget.py | privacy budget accounting | lib (run_cmb_harness only) | REAL | N | untested |
| v14_secret_rotation.py | secret rotation orchestration | lib (run_cmb_harness only) | PARTIAL | N | header states it coordinates only: "in production the steps would call real vault APIs" — rotation is recorded, never performed |

### platform/python/amc/watch

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| w1_receipts.py | hash-chained action receipts ledger | lib (api watch router, 14 modules) | REAL | Y | real prev-hash chain over canonical JSON in SQLite; "signed" in the title means hash-chained, not asymmetrically signed |
| w2_assurance.py | continuous assurance: drift, OWASP, IR, audit | lib (api watch router, score, agents) | PARTIAL | Y | `SecurityAuditRunner` audits a caller-supplied config dict, not a running system, yet reports a "comprehensive security audit"; `IncidentResponseAutopilot.on_breach_suspected` returns a fixed step list with only the summary line varying by input |
| w3_siem_exporter.py | SIEM export with MITRE-style mapping | lib (run_cmb_harness only) | REAL | N | untested |
| w4_safety_testkit.py | OWASP LLM Top-10 probe suite | lib (score, agents) | REAL | Y | probes a caller-supplied firewall/detector; `ToolStub` returning `{"stub": True}` is the test double it deliberately ships |
| w5_agent_bus.py | Ed25519-authenticated inter-agent bus | lib (run_cmb_harness) | REAL | Y | real Ed25519 sign/verify, capability tokens, replay detection |
| w6_output_attestation.py | signed attestations over tool outputs | lib (run_cmb_harness) | PARTIAL | Y | HMAC-SHA256, but the key defaults to the literal `"amc-output-attestation"` compiled into the module — anyone can mint a "valid" attestation unless a caller overrides it |
| w7_explainability_packet.py | auditor-facing evidence packet | lib (score, agents) | REAL | Y | digest over canonical JSON of the rows it actually carries |
| w8_host_hardening.py | host hardening posture checks | lib (run_cmb_harness) | PARTIAL | Y | reads only a caller-supplied config dict — no stat, no /proc, no socket, no filesystem access — but returns `ScanResult(target="host")` with `checks_run: 5`, presenting a config lint as a host posture audit |
| w9_multi_tenant_verifier.py | cross-tenant boundary checks | lib (run_cmb_harness) | FACADE | Y | `run_scan()` builds a `findings` list from every denied request and then returns `ScanResult(..., findings=[])` — the literal empty list. Every scan reports zero findings no matter how many cross-tenant denials occurred (`passed` and `metadata["denied"]` stay honest, so the drop is easy to miss); no test asserts the findings list |
| w10_policy_packs.py | versioned policy-pack registry | lib (prebuilt packs, run_cmb_harness) | PARTIAL | Y | the "integrity check" is a sha256 the pack computes over itself in `with_digest()` and verifies against itself; `install()` already requires it, so `run_marketplace_scan()` can only fail if a stored pack was mutated in memory. No signature or publisher trust despite the marketplace framing — and its test `test_marketplace_scan_reports_issues` asserts `res.passed` |
| prebuilt_policy_packs.py | NIST/SOC2/ISO42001/GDPR/ATLAS/OWASP packs | lib (test only) | FACADE | Y | the packs' `rules` carry `condition` strings such as `"governance_bypass_detected"` and `"metric_test_audit_ratio_below_0.6"`; grep shows those strings appear nowhere else in the repo and the only code that touches `pack.rules` is `if not pack.rules: raise` in `w10.install`. Installing and activating the "GDPR policy pack" enforces nothing, while docs/COMPLIANCE_FRAMEWORKS.md presents them as ready-to-use compliance controls |

### platform/python/amc/product

Reachability note: every module below is imported by `amc/api/routers/product.py` and served under `/api/v1/product`; only that prefix is exercised by tests (32 references).

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| persistence.py | shared SQLite path/retention helpers | lib (57 product modules) | REAL | Y | |
| features.py | 81-entry product feature catalogue | lib (product barrel) | REAL | Y | data registry |
| features_wave2.py | 50-entry wave-2 feature catalogue | test-only | REAL | Y | no runtime importer; reachable only from `test_wave2_modules.py` |
| invoicebot_l5_profile.py | canned "L5 certification" answers | lib (tests, both validation harnesses) | FACADE | Y | 208 lines of answer text written to contain the rubric's own keywords ("audit-log", "SOC2", "RACI", "step-up auth (hitl)", "feedback-loop", "incident-learning"). Both harnesses use it only as a truthiness map and substitute the rubric keyword lists outright, so "InvoiceBot achieves L5" is a score computed from a hardcoded input crafted against the scorer |
| ab_testing.py | experiment assignment and winner analysis | API:product router | REAL | Y | |
| api_wrapper_generator.py | tool wrappers from OpenAPI/Postman specs | API:product router | REAL | Y | |
| approval_workflow.py | draft → approval → send workflow | API:product router | REAL | Y | |
| async_callback.py | callback registration and delivery | API:product router | REAL | Y | |
| autodoc_generator.py | generate agent docs from config | API:product router | REAL | Y | changelog section is a placeholder line |
| autonomy_dial.py | autonomy mode policy decisions | API:product router | REAL | Y | |
| batch_processor.py | batch orchestration with item state | API:product router | REAL | Y | |
| chunking_pipeline.py | structure-aware chunking + summaries | API:product router | REAL | Y | |
| clarification_optimizer.py | rank clarification questions | API:product router | REAL | Y | |
| collaboration.py | tasks, handoffs, comments | API:product router | REAL | Y | notification delivery is logs-only and says so |
| compensation.py | rollback / compensation plans | API:product router | REAL | Y | |
| confidence.py | uncertainty/confidence estimation | API:product router | REAL | Y | |
| context_optimizer.py | select context under a token budget | API:product router | REAL | Y | |
| context_pack.py | build context packs from sources | API:product router | REAL | Y | |
| conversation_state.py | conversation snapshot/restore | API:product router | REAL | Y | |
| conversation_summarizer.py | structured state from transcripts | API:product router | REAL | Y | |
| cost_latency_router.py | route tasks across model tiers | API:product router | REAL | Y | |
| data_quality.py | data quality checks and thresholds | API:product router | REAL | Y | |
| dependency_graph.py | topo sort, cycle and critical path | API:product router | REAL | Y | |
| determinism_kit.py | canonicalise outputs, consistency score | API:product router | REAL | Y | consistency computed over supplied runs |
| dev_sandbox.py | mocked-tool local dev environment | API:product router | REAL | N | mocks are the product; no test |
| docs_ingestion.py | ingest docs, diff versions, summarise | API:product router | REAL | Y | |
| document_assembler.py | multi-step document assembly | API:product router | REAL | Y | |
| error_translator.py | tool error → remediation | API:product router | REAL | Y | |
| escalation.py | human escalation routing queue | API:product router | REAL | Y | |
| event_router.py | webhook/email/DB trigger routing | API:product router | REAL | Y | |
| extractor.py | unstructured → structured extraction | API:product router | REAL | Y | regex/normaliser based |
| failure_clustering.py | cluster failures, root-cause summaries | API:product router | REAL | Y | |
| glossary.py | domain glossary + terminology enforcement | API:product router | REAL | Y | |
| goal_tracker.py | goals, milestones, drift events | API:product router | REAL | Y | |
| improvement.py | feedback loop buckets and series | API:product router | REAL | Y | |
| instruction_formatter.py | reformat instructions per audience | API:product router | REAL | Y | |
| jobs.py | product job queue primitives | API:product router | REAL | Y | |
| kb_builder.py | tickets/email → searchable KB | API:product router | REAL | Y | |
| knowledge_graph.py | entities, relations, path queries | API:product router | REAL | Y | |
| long_term_memory.py | cross-session memory with TTL | API:product router | REAL | Y | |
| loop_detector.py | detect thrash, switch strategy | API:product router | REAL | Y | |
| memory_consolidation.py | dedupe/compact agent memory | API:product router | REAL | Y | |
| metering.py | usage metering and billing lines | API:product router | REAL | Y | deterministic event ids |
| onboarding_wizard.py | agent onboarding session flow | API:product router | REAL | Y | |
| outcome_pricing.py | outcome-based billing contracts | API:product router | REAL | Y | |
| output_corrector.py | rule-based output correction | API:product router | REAL | Y | |
| output_diff.py | run-to-run diffs and regressions | API:product router | REAL | Y | |
| param_autofiller.py | fill tool params from context | API:product router | REAL | Y | |
| persona.py | preference/persona management | API:product router | REAL | Y | |
| personalized_output.py | apply style profiles to output | API:product router | PARTIAL | Y | `_apply_tone_*` is a documented no-op: "For now, tone is expressed via persona system; no text mutation here", so a tone change alters the record without altering the text |
| plan_generator.py | goal → structured execution plan | API:product router | REAL | Y | |
| portal.py | self-serve job portal | API:product router | REAL | Y | |
| proactive_reminders.py | subscriptions, reminders, snoozes | API:product router | REAL | Y | |
| prompt_modules.py | modular prompt registry + versions | API:product router | REAL | Y | |
| rate_limiter.py | cross-API rate limits and quotas | API:product router | REAL | Y | |
| reasoning_coach.py | flag unsupported claims, suggest tools | API:product router | REAL | Y | |
| replay_debugger.py | deterministic trace replay + diff | API:product router | REAL | Y | PII redaction on ingest |
| response_validator.py | validate tool responses against schema | API:product router | REAL | Y | |
| retention_autopilot.py | churn scoring and win-back flows | API:product router | REAL | Y | |
| retry_engine.py | retry policies, backoff, segment rerun | API:product router | REAL | Y | |
| rollout_manager.py | staged rollout gates | API:product router | REAL | Y | |
| scaffolding.py | generate a new agent project | API:product router | REAL | N | emits `# TODO: implement real <tool> logic` inside the generated stubs, which is the intent of a scaffold; no test |
| scratchpad.py | session-isolated working memory | API:product router | REAL | Y | |
| sop_compiler.py | SOP text → workflow | API:product router | REAL | Y | |
| structured_output.py | schema-enforce and repair outputs | API:product router | REAL | Y | |
| sync_connector.py | incremental sync connectors | API:product router | REAL | Y | |
| task_spec.py | task spec + acceptance criteria | API:product router | REAL | Y | |
| task_splitter.py | split work across agents | API:product router | REAL | Y | |
| tool_chain_builder.py | build tool chains from goals | API:product router | REAL | Y | |
| tool_contract.py | tool contract validation and repair | API:product router | REAL | Y | |
| tool_cost_estimator.py | estimate tool call cost | API:product router | REAL | Y | |
| tool_discovery.py | natural-language tool discovery | API:product router | REAL | Y | tf-idf over registered tools |
| tool_fallback.py | fallback chains and equivalence groups | API:product router | REAL | Y | |
| tool_parallelizer.py | safe parallel tool execution | API:product router | REAL | Y | dependency-aware waves, real async execution |
| tool_rate_limiter.py | per-tool token buckets | API:product router | REAL | Y | |
| tool_reliability.py | pre-call failure probability | API:product router | REAL | Y | probability from recorded history + param heuristics; 0.10 default only with no history |
| tool_semantic_docs.py | generate semantic tool docs | API:product router | REAL | Y | |
| version_control.py | prompt/workflow snapshot history | API:product router | REAL | Y | |
| white_label.py | tenant provisioning and branding | API:product router | REAL | Y | |
| workflow_engine.py | durable workflow with checkpoints | API:product router | REAL | Y | |
| workflow_templates.py | workflow template marketplace | API:product router | REAL | Y | |

### platform/python/tests (summary — 93 files, not swept individually)

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| tests/ (93 files, ~1,615 test functions) | pytest suite for the platform | pytest (`testpaths = ["tests"]`) | PARTIAL | — | Real per-module tests: assertions inspect returned values, only two `assert True` occurrences and both are try/except idioms, zero skips. Coverage is uneven and non-random: `product/` is covered almost completely (79/81), `watch/` fully, but 17 of 35 `enforce/`, 7 of 16 `shield/`, 6 of 14 `vault/` modules have no test at all, and neither `cli.py`, `web/viewer.py`, `agents/*`, `benchmarks/*`, nor `score/{adversarial,evidence,evidence_collector,formal_spec,l5_requirements}` is tested. Of the six API routers only `/api/v1/product` is exercised (32 references; zero for score/shield/enforce/vault/watch). `tests/e2e_invoicebot.py` is the sole coverage for e5/e17/e20/questionnaire/w2. `test_l5_scoring.py` asserts L5 from answers written to contain the rubric's keywords — the same construction flagged under `invoicebot_l5_profile.py`. `test_w10_policy_packs.py::test_marketplace_scan_reports_issues` asserts `res.passed`, and no test asserts `w9`'s findings list, which is why its always-empty `findings=[]` survived |

## adapters, tools & plugins (gap pass)

### src/adapters/builtins

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| autogenCli.ts | AutoGen adapter definition (detection, env carriers, `python -m autogen` command) | lib (adapters/registry.ts BUILTINS) | FACADE | Y | Declares `verification.status: "fixture_verified"` with evidenceRefs citing `tests/adapterCapabilityReceipts.test.ts` + `tests/adaptersDoctorLeaseCarriers.test.ts`; neither runs any autogen fixture — the first only asserts the declaration is well-formed, the second exercises `listBuiltInAdapters()[0]` (generic-cli) only. The env/command/detection data itself is real. |
| claudeCli.ts | Claude CLI adapter definition; declares `hookProvider: "claude-code"` | lib (registry.ts, agent/providers/claudeCliProvider.ts) | REAL | Y | Genuinely exercised: `claudeCliProvider` calls `detectAdapter(claudeCliAdapter)`; version-probe test in adaptersDoctorLeaseCarriers; hook tests cover the claude-code provider it claims. |
| crewaiCli.ts | CrewAI CLI adapter definition | lib (registry.ts) | FACADE | Y | Same `fixture_verified` claim with no crewai fixture behind it; only the blanket shape-check iteration touches it. |
| geminiCli.ts | Gemini CLI adapter definition; declares `hookProvider: "gemini-cli"` and the ask/steer omissions | lib (registry.ts) | REAL | Y | Hook capability is really exercised (connectHookIntegration/hookControl install and drive the gemini-cli provider); lossiness honestly names what Gemini cannot do. |
| genericCli.ts | Generic `sh` wrapper adapter; widest base-url/api-key key list | lib (registry.ts) | REAL | Y | The only adapter driven end-to-end: `adaptersRunCli({adapterId:"generic-cli"})` in adaptersDoctorLeaseCarriers.test.ts, plus receipt tests. |
| hermesCli.ts | Hermes Agent CLI adapter definition | lib (registry.ts) | FACADE | Y | `fixture_verified` with zero test references to `hermes-cli` anywhere under tests/ — also absent from the id list in tests/amc1465AdapterCapabilityDocs.test.ts, so not even the docs check covers it. |
| langchainNode.ts | LangChain (Node) library adapter; runs `.amc/adapters-samples/langchain-node/run.mjs` | lib (registry.ts); sample written by adapterRunner.initAdapterProjectSample | FACADE | Y | `fixture_verified` with no langchain-node fixture; the declared entrypoint only exists after `amc adapters init-project` scaffolds it. |
| langchainPython.ts | LangChain (Python) library adapter | lib (registry.ts) | FACADE | Y | Same unfixtured `fixture_verified` claim; sole test hit is the docs id-list assertion. |
| langgraphPython.ts | LangGraph (Python) library adapter | lib (registry.ts) | FACADE | Y | Same unfixtured `fixture_verified` claim. |
| llamaindexPython.ts | LlamaIndex (Python) library adapter | lib (registry.ts) | FACADE | Y | Same unfixtured `fixture_verified` claim. |
| openaiAgentsSdk.ts | OpenAI Agents SDK (Node) library adapter | lib (registry.ts) | FACADE | Y | Same unfixtured `fixture_verified` claim; only test hit anywhere is the docs id list. |
| openclawCli.ts | OpenClaw CLI adapter definition | lib (registry.ts) | FACADE | Y | Same unfixtured `fixture_verified` claim; the openclaw test files that exist are benchmark/crosswalk docs tests, not adapter fixtures. |
| openhandsCli.ts | OpenHands CLI adapter definition | lib (registry.ts) | FACADE | Y | Same unfixtured `fixture_verified` claim. |
| pythonAmcSdk.ts | Python AMC SDK adapter; probes `import amc; print(amc.__version__)` | lib (registry.ts) | FACADE | Y | Same unfixtured `fixture_verified` claim. Second defect: `commandTemplate` is `python3 run_full_validation.py` resolved against the workspace root, but the file lives at `platform/python/run_full_validation.py` — the default command cannot run from a normal workspace. |
| semanticKernel.ts | Semantic Kernel (Node) library adapter | lib (registry.ts) | FACADE | Y | Same unfixtured `fixture_verified` claim. |

### src/adapters/snippets

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| nodeFetch.ts | Builds the Node `wrapFetch` + `logTrace` integration snippet printed by connect and embedded in generated samples | lib (adapters/adapterRunner.ts) → CLI:`amc connect`, `amc adapters init-project` | REAL | N | Emits genuinely runnable code; `wrapFetch` and `logTrace` are real exports of src/index.ts (lines 431-432). Nothing under tests/ asserts the snippet text or that it executes. |
| pythonRequests.ts | Builds the Python urllib integration snippet with the AMC trace envelope | lib (adapters/adapterRunner.ts) → CLI:`amc connect`, `amc adapters init-project` | REAL | N | Same: real code, no test covers the emitted string. |

### src/tools/builtin

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| bashTool.ts | One-shot shell tool over `runProcess` with output caps, timeout, provider-key stripping | lib (agent/agentToolset.ts) → CLI:`amc agent`/delegate paths | REAL | Y | tests/bashTool.test.ts. Honest docstring about `WRITE_HIGH` understating a shell's blast radius; the mitigation it names (signed argv deny-patterns) really is applied by toolhubAllowlistGuard in the same toolset. |
| fsTools.ts | fs.read / fs.write / fs.edit with realpath workspace containment and `.amc`/`.git` denial | lib (agent/agentToolset.ts) | REAL | Y | tests/fsToolsReadBeforeEdit.test.ts. Containment is decided on the realpath of the nearest existing ancestor, so the symlink escape it describes is actually closed, not just documented. |
| readBeforeEdit.ts | Per-agent read-before-edit ledger; digests contents and re-reads on the edit to detect drift | lib (fsTools.ts, agent/agentToolset.ts) | REAL | Y | Enforcement is real (`mayEdit` re-reads the file rather than trusting the stored digest). Two exported members have no consumer anywhere in src or tests: `hasObserved()` and `forget()` — and because `forget()` is never called, the per-agent read Map grows for the life of the process. |
| searchTools.ts | glob and grep tools with separate file/match/byte caps, each cap reported | lib (agent/agentToolset.ts) | REAL | Y | tests/searchTools.test.ts. Truncation is reported in-band, so a capped result cannot read as a complete one. |
| workspaceWalk.ts | Bounded, symlink-refusing workspace walker + glob→RegExp compiler | lib (searchTools.ts) | REAL | Y | No test imports it directly; exercised only through tests/searchTools.test.ts. The symlink claim holds — `withFileTypes` Dirents for links satisfy neither `isDirectory()` nor `isFile()` and fall through both branches. |

### src/tools/executors

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| toolhubTools.ts | Exposes toolhub's fs/git/http/process executors as pipeline ToolDefinitions | test-only | DEAD | Y | No `src/` importer. `agentToolset` (the only composer of the tool registry) defines fsTools/searchTools/bashTool/delegate/workflow and never calls `toolhubPipelineTools()`, so git.*, http.fetch and process.spawn are never offered to an agent through the pipeline. Sole caller is tests/toolhubPipelineTools.test.ts, which therefore validates guard behaviour for tools no production path can reach. The bodies themselves are honest delegation to the shared executors. |

### src/tools/guards

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| policyGuards.ts | Five monotonic deny-only guards: runtime firewall, budgets, signed tools.yaml allowlist, network egress by action class, prompt injection | lib (agent/agentToolset.ts, registered in order) | REAL | Y | tests/toolPolicyGuards.test.ts, tests/networkEgressGuard.test.ts, tests/toolhubPipelineTools.test.ts, tests/agentToolsetWiring.test.ts ("refuses a prompt-injection payload AT THE TOOL BOUNDARY"). All five can genuinely deny: unverifiable configs deny, unlisted network tools deny, a NETWORK_EXTERNAL tool naming no url denies. One deliberate hole, documented in the body: `toolhubAllowlistGuard` returns undefined for `RUN_CODE_TOOL` before loading the config, so the code-mode transport is never allowlist-checked — dispatched calls re-enter the guard under their own names, which is what makes that safe. |

### src/plugins/builtins

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| builtInRegistry.ts | Snapshot of built-in asset ids used to decide whether a plugin is overriding a built-in | lib (plugins/pluginLoader.ts) | PARTIAL | Y | Five of eight sets are populated from real sources (policy packs, assurance packs, compliance maps, adapters, learn ids) and drive real `PLUGIN_OVERRIDE_DENIED` decisions covered by tests/pluginMarketplace.test.ts. The other three are hardcoded `new Set<string>()`: `outcomeTemplates` and `casebookTemplates` are read by nothing at all (pluginLoader loads outcome_template and casebook_template artifacts at lines 272-285 without any `canUseId` call, so those two asset kinds bypass override checking entirely), and `transformOverlays` is read by the fallback branch of `canUseId` where `.has(id)` can never return true. |

### src/plugins/rules

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| overlayRules.ts | Decides whether a publisher fingerprint is allowed to override a specific built-in asset id | lib (plugins/pluginLoader.ts) | REAL | Y | Denies by default when no matching allow rule exists, and the fingerprint it matches is derived from a public PEM (pluginRegistry.publisherFingerprintFromPublicPem), not self-asserted; the overrides file is signature-checked before load. Exercised through tests/pluginMarketplace.test.ts (both denied and allowed paths). |

### src/toolhub/toolhubExecutors

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| fs.ts | Real read/write executors with a simulate branch that returns a SIMULATE line and 0 bytes | lib (toolhub/toolhubServer.ts, tools/executors/toolhubTools.ts) | REAL | Y | Simulate genuinely does not touch the filesystem; tests/toolhubPipelineTools.test.ts asserts "a simulated write must not write". `maxBytes` truncation is silent here (no truncation marker), unlike the builtin fs.read. |
| git.ts | Runs `git status|commit|push` via spawnSync, or a SIMULATE line | lib (toolhub/toolhubServer.ts, tools/executors/toolhubTools.ts) | REAL | Y | Only reached in tests through ToolHubService work orders (tests/multiWorkspaceHostMode.test.ts, tests/governorToolhubWorkorders.test.ts); no test drives a real git subprocess through it. |
| http.ts | HTTP/HTTPS fetch returning status, flattened headers and body | lib (toolhub/toolhubServer.ts, tools/executors/toolhubTools.ts) | REAL | Y | tests/egressRedirectBoundary.test.ts drives it against a live redirector. Redirects are not followed (node's raw `request`), which is what keeps the egress host check meaningful. |
| process.ts | spawnSync of an arbitrary binary with merged env, or a SIMULATE line | lib (toolhub/toolhubServer.ts, tools/executors/toolhubTools.ts) | REAL | Y | Exercised via tests/toolhubPipelineTools.test.ts (`process.spawn` allow/deny/exit-code cases). Note it inherits full `process.env` and does not strip provider keys the way bashTool does. |

## kernel, approvals & persistence (gap pass)

### src/kernel/services

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| agentLoopServices.ts | `ctx.amcAgentLoop` — Cordis service owning one `AgentDriver` for one session; disposer cancels with cause `disposed` and awaits idle | lib (kernel/agentLoopRunner) → CLI:`amc agent-loop run` | REAL | Y | Pure delegation to `AgentDriver`; `status` reads the driver rather than mirroring it. |
| approvalServices.ts | `ctx.amcApproval` — wraps `ApprovalSeam`, binds each registered answerer's unregister to the calling fiber | lib (kernel/agentLoopRunner, kernel/approvalSeamRunner) → CLI:`amc agent-loop run`, `amc approvals ask` | REAL | Y | No disposer by design (documented); no second copy of the seam's rules. |
| credentialsServices.ts | `ctx.amcCredentials` — wraps `LocalCredentialsService`, async disposer closes the watcher/write queue | lib (kernel/agentLoopRunner) → CLI:`amc agent-loop run` | REAL | Y | `resolve` re-delegates per call; no cache layer added in the facade. |
| evidenceServices.ts | Four seams (`amcLedger`/`amcCrypto`/`amcReceipts`/`amcBlobs`) over ledger, keys, receipts and the blob store | test-only (tests/kernelEvidenceServices.test.ts) | REAL | Y | Honest facades — each method opens/closes its own ledger handle in a `finally`. No production consumer: nothing under src/ imports it. |
| execServices.ts | `ctx.amcSubprocess` — tracked `runProcess` spawns, disposal terminates children with reason "dispose" | ORPHAN | DEAD | N | No importer anywhere in src/, tests/, packages/ or scripts/; `execServices`, `SubprocessSeamService`, `SUBPROCESS_SEAM` have zero consumers (only its own dist output). |
| jobServices.ts | `ctx.amcJobs` — background job registry with owner fencing and wake budget | ORPHAN | DEAD | N | No importer; `jobServices`, `JobSeamService`, `JOBS_SEAM` have zero consumers. |
| llmServices.ts | `ctx.amcLlm` — owns the `AdapterRegistry`, exposes stream/prepare/route mutation, `runtimeForSession` for delegated children | lib (kernel/agentLoopRunner) → CLI:`amc agent-loop run` | REAL | Y | Registry shared with child runtimes on purpose; only the session differs. |
| promptServices.ts | `ctx.amcPrompt` — builds the prompt registry + context host together, exposes the `preStep` waterfall entry as a bound property | lib (kernel/agentLoopRunner) → CLI:`amc agent-loop run` | REAL | Y | No render cache; `assemble`/`render` re-resolve each call. |
| terminalServices.ts | `ctx.amcTerminal` — opens pipe-backed shells, disposal closes them all | ORPHAN | DEAD | N | No importer; `terminalServices`, `TerminalSeamService`, `TERMINAL_SEAM` have zero consumers. |
| toolServices.ts | `ctx.amcTools` — tool registry + governed pipeline, define/restrict/guard bound to the calling fiber | ORPHAN | DEAD | N | No importer; `toolServices`, `ToolPipelineService`, `TOOLS_SEAM` have zero consumers. The governed tool pipeline is reached directly, not through this seam. |

### src/approvals/seam

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| answerNormalize.ts | Containment for one answerer: throw/reject/timeout/out-of-union all collapse to `unavailable`; `null` alone is abstention | lib (approvalSeam, index) | REAL | Y | Enters the promise chain before calling so a synchronous throw is contained; aborts its own timer after the race. |
| approvalSeam.ts | `request()` — writes the signed `approval/request` row, runs answerers then the engine, writes `approval/answer`, returns the pair | lib (kernel/services/approvalServices, index) → CLI:`amc approvals ask`, `amc agent-loop run` | REAL | Y | `proceed` is derived once as `answer === "allow"`; request row is committed before any answerer sees the question. |
| approvalSeamTypes.ts | The seam vocabulary: three-valued `ApprovalAnswer`, ask/decision shapes, poll schedule, `realWaitRuntime` | lib (cli-agent-commands, agent/approvalGate, approvalAskCommand, kernel runners) | REAL | Y | Answer union is re-exported from the signed session spine, not redeclared; `realWaitRuntime.sleep` clears its timer on abort. |
| devProfileException.ts | ADR-5 rollback as a bounded, attributed answerer: zod-validated note, 30-day max window, expiry → abstain, no wildcard action class | lib (cli-agent-commands) → CLI:`amc agent-loop run` (exception note flag) | REAL | Y | Refuses an already-expired or over-long window at construction; the audit trail rides in `answeredBy` via `exceptionAnswererName`. |
| engineAnswerer.ts | Thin fail-closed adapter over the approvals engine: create-then-poll, translates six engine states into three seam values | lib (approvalSeam, index) | REAL | Y | Exercised through tests/approvalSeam.test.ts against the real engine. `allow` requires QUORUM_MET **and** a passing `verifyApprovalForExecution`; abandoned questions are cancelled. |
| index.ts | Public barrel for the seam; deliberately does not re-export `src/approvals/` internals | lib (tests/approvalSeam.test.ts, approvalAskCommand for types) | REAL | Y | Re-export only. |

### src/persistence/jsonl

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| jsonlEventLog.ts | File mechanics for the JSONL backend: fixed-column serialize, fail-loud line parse, O(1) tail read, `O_APPEND`+fsync writer, pid-checked single-writer lock | lib (jsonlSessionEventStore, ledger/alternateBackendVerification) | REAL | Y | Malformed lines throw rather than being skipped; a lock held by a live pid (including this process) is refused, a dead-owner lock is taken over. |
| jsonlSessionEventStore.ts | The JSONL `SessionEventStore`: same hash pre-image and monitor signature as the SQLite ledger, blob-backed payloads, non-idempotent seal, read-only mode that creates and locks nothing | lib (persistence/openSessionEventStore) → session service / recovery / verification | REAL | Y | Capability gaps (`concurrentWriters:false`, `powerLossDurable:false`) are declared, not glossed; head advances only after the write returns; mirrors the `AMC_EVALUATED_AGENT` untrusted-writer refusal. |

### src/persistence/conformance

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| sessionStoreConformance.ts | The shared 16-case backend conformance suite plus `compareBackendDeterminism` cross-backend hash parity; assertions are plain throws, no test framework | test-only (tests/sessionStoreConformance.test.ts) | REAL | Y | Cases genuinely fail — the test file runs deliberately-broken backends through the same suite. Two soft spots: `declared-concurrent-writer-capability-matches-behaviour` asserts `second.workspace === first.workspace` on the multi-writer branch, which is the same string on both sides (the real signal there is only that the second open did not throw); `compareBackendDeterminism` returns `ok:true` for a single-backend list because it compares `entries.slice(1)` against the first (callers pass both backends). |

### src/storage/blobs

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| blobCli.ts | Operator commands: blob key init/rotate, store verify, batched re-encrypt between key versions, each with a real signed ledger audit row | CLI:`amc blobs verify`, `amc blobs reencrypt`, `amc blobs key init`, `amc blobs key rotate` | REAL | N | Re-encrypt genuinely decodes/decrypts/re-encrypts and rewrites at 0600. Two exported functions have no consumer anywhere: `blobsStoreForTest` and `blobsIndexVerifyCli` (dead exports in a live file). |
| blobEncryptor.ts | AES-256-GCM blob envelope: encode/decode with magic, nonce, AAD hash, payload sha and auth tag | lib (blobStore, blobCli) | REAL | Y | `decryptBlobV1` recomputes sha256 of the plaintext and throws on mismatch — it does not trust the stored field. |
| blobKeys.ts | Blob key lifecycle: vault-sealed versioned keys, signed `current.json`, unvaulted 0600 random key at keyVersion 0, read-only legacy constant for old no-sign blobs | lib (blobStore, blobCli) + CLI:`amc blobs key ...` | REAL | Y | The published-constant fallback is retained read-only and labelled; rotation is refused under `AMC_NO_SIGN=1` rather than minting unreadable blobs. |
| blobSchema.ts | Zod schemas for the blob index row, index chain-head signature, and key metadata/signature | lib (blobStore, blobKeys) | REAL | N | Schema declarations only; no direct test file. |
| blobStore.ts | Content-addressed encrypted blob storage with a hash-chained `index.jsonl` whose head is signed by the auditor key | lib (ledger, ledgerVerification, retentionEngine, session/eventPayload, jsonl store, conformance, evidenceServices) | PARTIAL | Y | Storage, chaining, and per-row/head verification are real (truncation and edit tampers are covered by tests). Missing case: `verifyBlobIndexSignature` returns `{valid:true}` as soon as `index.jsonl` is absent, before it ever looks at `index.jsonl.sig` — so deleting the whole index (leaving a `.sig` that names a real non-empty head) verifies clean, and `verifyBlobIndexChain` then reports `ok:true, rows:0`. |
| blobVerify.ts | Whole-store verification: index chain + every ledger row's blob file exists, sha matches, and optionally decrypts | CLI:`amc blobs verify` (via blobCli.blobsVerifyCli) | PARTIAL | N | The `decrypt` branch compares `loadBlobPlaintext(...).payloadSha256` against the ledger sha, but that field is the envelope's *stored* sha — literally the same value the preceding `loadBlobMetadata` check already compared — so `"decrypted payload sha mismatch"` cannot be reached. The genuine plaintext check happens inside `decryptBlobV1`, which **throws** out of `verifyBlobStore` instead of appending to `errors`, so real ciphertext corruption surfaces as an exception, not as `ok:false`. |

### src/storage/consolidation

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| guardEventConsolidation.ts | Staged migration of `.amc/guard_events.sqlite` into `evidence.sqlite`: DUAL_WRITE default, content-fingerprint parity report, idempotent backfill, never-throwing consolidated write | lib (enforce/evidenceEmitter) + CLI:`amc evidence-stores parity`, `amc evidence-stores backfill` | REAL | Y | Parity can genuinely fail — it diffs ids in both directions and compares per-row sha256 fingerprints, not counts. Stage defaults to DUAL_WRITE so an upgrade cannot silently cut over. |

## identity, bridge & sdk (gap pass)

### src/identity/scim

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| scimAuth.ts | SCIM bearer-token extraction and per-request auth gate | lib (scimRoutes) | REAL | Y | Real check: `validateScimBearerToken` sha256-hashes the presented token and looks it up in the host vault `scim/tokens/_index`; also enforces `scim.enabled` and `requireHttps`. Exercised over HTTP by tests/enterpriseSsoScim.test.ts. `extractBearerToken` is exported but has no consumer outside this file. |
| scimGroups.ts | SCIM Group CRUD plus SCIM_GROUP-sourced workspace role grant/revoke | lib (scimRoutes) | REAL | Y | Revokes the prior members' SCIM_GROUP-sourced roles before re-applying from the new membership snapshot, so a removal genuinely drops roles (the test asserts the revoke path). `findScimGroupByDisplayName` is used by scimRoutes for POST idempotency. |
| scimPatch.ts | Parse/validate the SCIM PATCH `Operations` array | lib (scimRoutes) | REAL | Y | Rejects non-object bodies, non-array Operations and unknown ops. `path`/`value` are passed through unvalidated by design (consumers interpret them). |
| scimRoutes.ts | HTTP router for `/host/scim/v2` — Users, Groups, and the discovery endpoints | API:workspaceRouter (`handleScimRoute`, workspaceRouter.ts:1179) | PARTIAL | Y | Auth runs before dispatch and CRUD is real, but `/ServiceProviderConfig` advertises `filter: { supported: true, maxResults: 200 }` while only `userName eq "x"` and `externalId eq "x"` are implemented; `/Groups` GET ignores `filter`, `startIndex` and `count` entirely and still returns a ListResponse claiming `startIndex: 1`. Unsupported methods on `/Users/{id}` fall through to 404 "Unknown SCIM endpoint" rather than 405. |
| scimTypes.ts | SCIM ListResponse and Error envelope builders | lib (scimRoutes, scimUsers) | REAL | Y | Small and honest; `itemsPerPage` is the returned page length and `totalResults` is passed in by the caller. |
| scimUsers.ts | SCIM User list/get/create/replace/patch/disable over the host DB | lib (scimRoutes) | PARTIAL | Y | Three gaps. (1) Any filter other than the two recognised forms compiles to `WHERE 1 = 0` and returns HTTP 200 with an empty ListResponse instead of RFC 7644 400 `invalidFilter` — an IdP reads "user absent" and provisions a duplicate. (2) `scimPatchUser` honours only `active` and `displayName`; PATCH ops on `userName`, `emails` or `externalId` are silently dropped and still audited as SCIM_USER_UPDATED. (3) `scimReplaceUser` upserts by username, so a PUT that changes `userName` with no `externalId` creates a *second* user and returns an `id` different from the one in the request URL. |

### src/identity/oidc

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| jwtVerify.ts | JWKS fetch/cache, id_token signature + claim verification, OIDC discovery | lib (oidcClient, oidcRoutes) | REAL | Y | Genuine `crypto.verify`: rejects `alg: none` and any alg outside RS256/EdDSA, then checks exp/nbf with skew, iss, aud (array or scalar) and nonce. tests/security/api-security.test.ts calls it directly with expired / wrong-nonce / bad-signature tokens. Weaknesses, not fakery: when the token has no `kid` (or the JWK has none) it takes the first key, and `jwksCache` is an unbounded module Map with a 5-minute TTL and no negative-cache. |
| oidcClient.ts | Builds the PKCE authorization URL and performs the authorization-code -> token exchange | lib (oidcRoutes) | REAL | Y (via enterpriseSsoScim.test.ts against a local fake IdP) | Sends real `code_challenge`/`code_challenge_method=S256`, state and nonce; throws when `id_token` is absent from the token response. `resolveProviderEndpoints` is consumed by oidcRoutes. |
| oidcRoutes.ts | Login-start and callback handlers: verify id_token, map roles, upsert user, create session | API:workspaceRouter (workspaceRouter.ts:1043, :1068) | REAL | Y | Real end-to-end: state is single-use and 10-minute bounded, `email_verified` must be strictly `true`, subject and email are required, role grants go through evaluateRoleMapping and are written as SSO_GROUP-sourced memberships. Caveat: `pendingStates` is a per-process module Map pruned only on a completed callback, so abandoned logins leak entries for the process lifetime and the flow cannot survive multi-process serving. |
| pkce.ts | S256 PKCE verifier/challenge generation | lib (oidcClient) | REAL | Y (indirect, via the OIDC login test) | 32 bytes from `randomBytes` and a real sha256 base64url challenge — no placeholder. |

### src/identity/saml

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| samlRoutes.ts | SP metadata, login redirect and ACS handler for "SAML" providers | API:workspaceRouter (workspaceRouter.ts:1108, :1116, :1143) | FACADE | Y | Fakes SAML 2.0 conformance. `samlMetadataXml` publishes SP metadata declaring `protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol"` and an `HTTP-POST` AssertionConsumerService, but nothing in the path implements SAML: `startSamlLogin` puts base64-encoded **JSON** in the `SAMLRequest` parameter instead of a DEFLATE-encoded `<AuthnRequest>`, and the ACS calls `parseCompactSamlResponse`, which is `JSON.parse(base64decode(...))`. Any real IdP configured from this metadata fails 100% of the time (a genuine base64 XML `<Response>` throws in JSON.parse). The session/role-mapping/audit work underneath is real; the standards claim on the wire is not. |
| samlVerify.ts | Parse and signature-verify the compact JSON assertion | lib (samlRoutes) | PARTIAL | Y | Does real work: Ed25519 `crypto.verify` over the canonicalized assertion with the signature field removed, plus issuer, audience, inResponseTo and skewed notBefore/notOnOrAfter checks, and it fails closed on exceptions. Missing: no XML, no XMLDSig, no certificate-chain or validity-window validation of `idpCertPem`. `verify(null, ...)` selects the key's own algorithm, so only Ed25519 keys can ever verify — an actual X.509/RSA IdP certificate throws and is swallowed into `ok:false`. `notBefore`/`notOnOrAfter` are optional, so an assertion may carry no expiry at all (replay is bounded only by the one-shot pending-request map in samlRoutes). |

### src/bridge/compat

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| anthropicCompat.ts | Extract model / message count / tool count / temperature / max_tokens from an Anthropic `/v1/messages` body | lib (bridgeRoutes `buildModelIntent` -> bridgeServer) | REAL | Y | Load-bearing: `intent.model` is passed to `verifyBridgeLease` and a null model is denied unless the lease allowlist is `*`, so this parse is a real policy input rather than decoration. Ignores `match.modelFromPath` (Anthropic carries the model in the body). |
| geminiCompat.ts | Same intent extraction for Gemini `generateContent` bodies | lib (bridgeRoutes -> bridgeServer) | REAL | Y | Correctly prefers `match.modelFromPath` (Gemini puts the model in the URL) and falls back to the body; reads temperature/maxOutputTokens out of `generationConfig`. |
| localMockCompat.ts | Relabels the OpenAI intent parse as provider "local" | lib (bridgeRoutes -> bridgeServer) | REAL | N | Honest three-line delegation to `parseOpenAIIntent`. No test exercises the `/bridge/local` route anywhere under tests/, so this is the one compat parser with zero coverage. |
| openaiCompat.ts | Intent extraction for OpenAI chat/responses bodies; base parser for the OpenAI-compatible providers | lib (bridgeRoutes -> bridgeServer, and the three relabel wrappers) | REAL | Y | Handles both `messages` (chat) and `input` (responses), both `tools` and `tool_calls`, and all three max-token spellings. |
| openrouterCompat.ts | Relabels the OpenAI intent parse as provider "openrouter" | lib (bridgeRoutes -> bridgeServer) | REAL | Y | Accurate: OpenRouter's wire format is OpenAI-compatible, so delegation is the correct implementation, not a shortcut. |
| xaiCompat.ts | Relabels the OpenAI intent parse as provider "xai" | lib (bridgeRoutes -> bridgeServer) | REAL | Y | Same as openrouter — xAI's chat/completions payload is OpenAI-compatible. |

### src/bridge/tests/fakeProviders

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| fakeAnthropic.ts | Ephemeral localhost HTTP server impersonating the Anthropic Messages API | test-only (tests/universalAgentIntegrationLayer.test.ts) | REAL | Y | Canned response is the point of a fake, and it does echo the request `model` back, so a test can prove the body reached the upstream. |
| fakeGemini.ts | Ephemeral localhost server impersonating Gemini `generateContent` | test-only (tests/universalAgentIntegrationLayer.test.ts) | REAL | Y | Parses the model out of the request path and echoes it as `modelVersion`, so path-based routing is genuinely observable. |
| fakeOpenAI.ts | Ephemeral localhost server impersonating OpenAI chat completions | test-only (tests/universalAgentIntegrationLayer.test.ts, three call sites) | REAL | Y | Echoes the request `model`; also reused as the `local` upstream. |
| fakeOpenRouter.ts | Ephemeral localhost server impersonating an OpenRouter chat completion | test-only (tests/universalAgentIntegrationLayer.test.ts) | REAL | Y | Ignores the request entirely (`_req`) and hardcodes `model: "openrouter/test-model"`, so nothing on this path can prove the request body was forwarded intact — the test only asserts the canned `openrouter-ok` string, which proves routing but not translation. |
| fakeXAI.ts | Ephemeral localhost server impersonating an xAI chat completion | test-only (tests/universalAgentIntegrationLayer.test.ts) | REAL | Y | Same limitation as fakeOpenRouter: `_req` is discarded and `model: "grok-test"` is hardcoded, so a model-passthrough assertion here would be checking a constant rather than the forwarded request. |

### src/sdk/integrations

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| anthropic.ts | Proxy-wraps an Anthropic client so `messages.create` routes through the AMC bridge | lib (sdk/index.ts:33 -> src/index.ts `export *`; amcAgent.ts:24) | PARTIAL | N | Only `messages.create` is intercepted; `messages.stream`, `messages.countTokens`, `completions` and every other method fall through to the raw provider client and therefore bypass the bridge's lease check, receipt and audit entirely — silently ungoverned rather than refused. Unlike openai.ts it does not guard the inner target, so wrapping a client whose `messages` is undefined throws `TypeError: Cannot create proxy with a non-object` at property access. |
| gemini.ts | Proxy-wraps a Gemini client so `models.generateContent` routes through the bridge | lib (sdk/index.ts:34; amcAgent.ts:28) | PARTIAL | N | Same two gaps: only `generateContent` is intercepted (`generateContentStream`, `countTokens`, `embedContent` pass straight through to the raw client, bypassing governance), and the `new Proxy(models, ...)` call is unguarded against a non-object `models`. Also silently defaults an unspecified model to `"gemini-1.5-flash"` instead of failing. |
| langchainJs.ts | Minimal LangChain-shaped `{ invoke, bind }` object backed by `amc.openaiChat` | lib (sdk/index.ts:36; amcAgent.ts:40) | PARTIAL | N | `invoke` is real. `bind` is not: it takes `_params` and returns the *same unbound* `invoke`, so `.bind({ tools, temperature, response_format })` silently discards every bound option and the caller gets a plain completion presented as a bound one, with no error. Also no `stream`/`batch`, and non-string message content is not handled. |
| langgraphJs.ts | `{ run(state) }` object described as a LangGraph bridge | lib (sdk/index.ts:37; amcAgent.ts:44) | PARTIAL | N | Implements no graph semantics — no nodes, edges, conditional routing or state reduction. `run` is a single chat completion; a state without `messages` is `JSON.stringify`ed into one user message, and the returned body replaces nothing in the state. It also does not match LangGraph's compiled-graph interface (`invoke`/`stream`), so it cannot be dropped into a LangGraph pipeline under that name. |
| openai.ts | Proxy instrumentation and a `fetch`-shaped transport routing 5 OpenAI routes through the bridge | lib (sdk/index.ts:32; amcAgent.ts:20) | REAL | Y | The strongest file here: guards every inner target with a `typeof !== "object"` check, covers chat/responses/embeddings/images/audio on both the proxy and the transport, and throws a typed `AMCSDKError` on an unparseable string body. tests/amcClientSdk.test.ts asserts each of the five routes lands on the matching client method. Caveats: the transport ignores `init.method`/headers and always buffers the bridge body into a JSON `Response`, so `stream: true` callers get a non-streaming reply. |
| openaiAgentsSdk.ts | Proxy-wraps an OpenAI Agents SDK client so `run` and `responses.create` route through the bridge | lib (sdk/index.ts:38; amcAgent.ts:32) | PARTIAL | N | Intercepts `run` unconditionally without consulting the target, so `typeof client.run === "function"` is true for *any* wrapped object, including one that has no run method — a capability probe that cannot fail. `responses` is proxied without the non-object guard openai.ts uses, and everything else on the client bypasses the bridge. |
| vercelAiSdk.ts | Returns a `fetch`-shaped bridge for the Vercel AI SDK, dispatching by a fixed provider | lib (sdk/index.ts:35; amcAgent.ts:36) | PARTIAL | N | Ignores the request URL and method entirely and routes solely on the constructor's `provider` argument, so the SDK's own endpoint selection is discarded. `bodyToObject` throws a typed error for an unparseable *string* body but returns `{}` for any non-string body (Uint8Array, Blob, ReadableStream, FormData) — the payload is silently dropped and an empty request is sent to the bridge instead of erroring. Streaming responses are buffered into a single JSON `Response`. |

## lint, diagnostic, ops & shield (gap pass)

### src/lint/rules

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| index.ts | Barrel re-exporting the 9 lint rules | ORPHAN | DEAD | N | `src/lint/rules.ts` imports each rule file directly (`./rules/requireAgentId.js` …); zero importers of this barrel anywhere in src, tests or docs |
| noDuplicateKeys.ts | Flags duplicate top-level YAML keys | lib (lint/rules.ts → lintConfigs → CLI:`amc lint`) | REAL | Y | Regex anchors at column 0, so only top-level keys — matches what the description claims |
| noHardcodedSecrets.ts | Flags hardcoded API keys/secrets in agent config | lib (lint/rules.ts) | REAL | Y | 4 patterns; narrower than `src/shield/redaction/secretPatterns.ts` (no slack/private-key/connection-string), but it is a lint heuristic, not the redaction path |
| requireAgentId.ts | Requires non-empty agentId | lib (lint/rules.ts) | REAL | Y | |
| requireDomain.ts | Warns on missing/empty domain | lib (lint/rules.ts) | REAL | Y | |
| requirePrimaryTasks.ts | Warns on missing primaryTasks | lib (lint/rules.ts) | REAL | Y | Only an empty *array* fails; a non-array truthy value (e.g. a string) passes the check |
| requireRole.ts | Warns on missing/empty role | lib (lint/rules.ts) | REAL | Y | |
| requireStakeholders.ts | Warns on missing stakeholders | lib (lint/rules.ts) | REAL | Y | |
| requireTrustBoundary.ts | Info-level check for trustBoundaryMode | lib (lint/rules.ts) | REAL | Y | Presence-only: any value passes, including a value that is neither "isolated" nor "shared" |
| validRiskTier.ts | Rejects riskTier outside low/med/high/critical, offers autofix | lib (lint/rules.ts) | REAL | Y | Autofix offset is `lines.slice(0,i).join("\n").length + 1`, which is correct for i>0 but off by one when riskTier is on line 1; `amc lint --fix` really writes (`linter.ts:129`), so that case drops the first char and eats the newline |

### src/diagnostic/autoAnswer

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| autoAnswerEngine.ts | Runs a diagnostic and shapes the auto-answer output, optionally creating a transform plan | lib (src/index.ts, studio/studioServer.ts, mechanic/{gapAnalysis,upgradePlanner,mechanicApi}.ts) | REAL | Y | `transformPlan.created` is set only when a plan was actually created |
| autoAnswerEvidenceQueries.ts | Derives measured scores, coverage and unknown-reasons from a report | lib (autoAnswerEngine, autoAnswerTests) | REAL | Y | Caps `measuredScore` at 1 when unknown, so unknowns cannot inflate a score |
| autoAnswerMappings.ts | Builds per-question evidence rules from the question bank | lib (autoAnswerEvidenceQueries) | REAL | Y | Throws on an unmapped questionId rather than defaulting |
| autoAnswerTests.ts | "Determinism probe" for deriveAutoAnswerResults | test-only (tests/universalAgentIntegrationLayer.test.ts) | FACADE | Y | Calls the same pure function twice on the same input and returns both results; the test asserts `JSON.stringify(a) === JSON.stringify(b)`. `deriveAutoAnswerResults` reads no clock, RNG, or I/O (`controlsForScore` is pure too), so the comparison is a value against a copy of itself and cannot fail — it proves nothing about determinism across runs, processes, or inputs |
| traceEvidenceMapper.ts | Maps normalized observability traces to per-question evidence answers | test-only (tests/diagnostic/traceEvidenceMapper.test.ts) | PARTIAL | Y | Metrics computation is genuine. But (a) `unanswered: 0` is hardcoded in both return paths while only ~10 answers are emitted against a 126/244-question bank, so the summary asserts full coverage that was not measured; (b) it emits answers for `AMC-3.1` and `AMC-3.2`, which do not exist in `src/diagnostic/questionBank.ts`; (c) the header claims it "enables `amc run --auto` to derive scores from REAL runtime data" but no file under src imports it; (d) `randomUUID` and `NormalizedSpan` are imported and unused |

### src/diagnostic/bank

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| bankApi.ts | init/get/apply/verify facade over the bank loader | lib (bankCli, studio/studioServer.ts routes) | REAL | Y (via bankLoader) | |
| bankCli.ts | CLI wrappers for bank operations | CLI:`amc diagnostic bank init`, `amc diagnostic bank verify` | REAL | Y (via bankLoader) | `diagnosticBankPrintCli` and `diagnosticBankApplyCli` are exported but no command or route calls them (Studio calls `…ForApi` directly) |
| bankLoader.ts | Loads/saves the bank YAML and its auditor signature | lib (workspace, bootstrap, studioServer, verify/verifyAll, mechanic/upgradePlanner) | REAL | Y | `verifyDiagnosticBankSignature` delegates to `verifySignedFileWithAuditor`; returns `valid:false` when the file is absent rather than passing vacuously |
| bankSchema.ts | Zod schema + cross-field superRefine for the bank | lib (bankLoader, bankV1, bankApi, contextualizer) | REAL | Y (via bankLoader) | Dimension counts are derived from `questionBank` at module load, so the schema is checked against the real bank, not a copy of the file being validated |
| bankV1.ts | Builds the default v1 bank from the question bank | lib (bankLoader) | REAL | Y (via bankLoader) | `queriesForQuestion` interpolates `question.id` into SQL string literals; ids are internal constants, but the strings are stored as bank content |

### src/diagnostic/contextualizer

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| agentProfile.ts | Zod schema/type for the resolved agent profile | lib (contextualizer, profileResolver, redteam/adversarialGenerator, value/valueContracts) | REAL | Y (via contextualizer) | |
| contextualizer.ts | Renders the bank tailored to an agent profile and its targets | lib (studioServer, contextualizerCli) | REAL | Y (tests/compassCanonCgxTruthguard.test.ts) | `ownerTarget` is null when no target profile loads, rather than defaulted |
| contextualizerCli.ts | CLI/file-output wrapper for the render | CLI:`amc diagnostic render` | REAL | Y (via contextualizer) | |
| profileResolver.ts | Infers agent type, model/tool families, operating mode and capabilities from ledger events + config | lib (contextualizer) | REAL | Y (tests/monitorSubstrateFold.test.ts) | Capability booleans are derived from real state (trust mode, installed plugin lock, forecast artifact, bench comparison), not asserted |

### src/ops/maintenance

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| cachePrune.ts | Deletes aged console/transform snapshots and generic cache files | lib (maintenanceCli) | REAL | Y (via maintenanceCli, tests/opsHardeningPack.test.ts) | "Console snapshots" is implemented as every `.json`/`.sig` under `.amc/studio` recursively, which is broader than the parameter name suggests |
| logRotation.ts | `rotateLogs` — bounds the log directory by age and file size | lib (maintenanceCli) | PARTIAL | Y (via maintenanceCli) | Nothing rotates: oversized or aged files are `unlinkSync`ed outright. No numbered rotation, no compression, no truncate-and-keep. A single active log that exceeds `maxFileMb` is deleted, not rolled |
| maintenanceCli.ts | Policy-gated entry points for stats/vacuum/reindex/rotate/prune | CLI:`amc maintenance stats|vacuum|reindex|rotate-logs|prune-cache`, API:studioServer | REAL | Y (tests/opsHardeningPack.test.ts) | Every mutating call verifies the ops-policy signature first and throws on invalid. `maintenancePruneCacheCli` is the one that writes no audit event, unlike its siblings |
| sqliteMaintenance.ts | VACUUM/ANALYZE and operational index creation | lib (maintenanceCli, retentionEngine) | REAL | Y (via maintenanceCli) | |
| stats.ts | DB/table/blob/archive/cache/log size accounting | lib (maintenanceCli, studioServer, studioSupervisor) | REAL | Y (via maintenanceCli) | Counts come from live `COUNT(*)` and real `statSync` sizes |

### src/ops/backup

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| backupCli.ts | CLI wrappers for create/verify/print/restore | CLI:`amc backup create|verify|print|restore`, lib (verify/verifyAll, e2e/smoke) | REAL | Y (via backupEngine) | |
| backupCrypto.ts | scrypt + AES-256-GCM envelope encrypt/decrypt | lib (backupEngine) | REAL | Y (via backupEngine) | Real AEAD with auth tag; KDF params travel in the envelope and are honoured on decrypt |
| backupEngine.ts | Creates, verifies, prints and restores signed encrypted backups | lib (backupCli) | PARTIAL | Y (tests/opsHardeningPack.test.ts) | Create/verify do real work (per-file sha256, payload sha, ed25519 manifest signature, decrypt-and-rehash). The gap is the trust anchor: when `--pubkey` is not passed, `verifyBackup` reads the auditor public key from `keys/auditor.pub` *inside the bundle being verified* (`backupEngine.ts:346`), so a repacked bundle re-signed with an attacker key verifies clean. Secondary: `manifest.files[].sha256` is hashed from the live workspace after the snapshot copy, not from the copied tree |
| backupSchema.ts | Zod schemas for the manifest and its signature | lib (backupEngine) | REAL | Y (via backupEngine) | |

### src/ops/retention

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| retentionArchive.ts | Segment/manifest/signature paths, segment write + verify, pruned-blob hash chain | lib (retentionEngine, ops/maintenance/stats, ledger/ledger, ledger/ledgerVerification) | REAL | Y (via retentionCli) | `verifyRetentionSegment` and `verifyPrunedRows` recompute hashes and check ed25519 signatures against the auditor key history — the chain check compares each row's stored hash to a freshly computed one, not to itself |
| retentionCli.ts | CLI wrappers for status/run/verify | CLI:`amc retention status|run|verify`, API:studioServer, lib (audit/binderCollector) | REAL | Y (tests/opsHardeningPack.test.ts) | |
| retentionEngine.ts | Archive/prune lifecycle, blob deletion, auto-vacuum, transparency entry | lib (retentionCli) | REAL | Y (via retentionCli) | Policy signature is verified before any mutation; dry-run returns candidate counts without writing. Minor honesty wart: the `RETENTION_SEGMENT_CREATED` audit event is appended even when `segmentId` is null and no segment was written |
| retentionSchema.ts | Zod schemas for segment manifest, signature, pruned rows and seal | lib (retentionArchive) | REAL | Y (via retentionCli) | |

### src/ops/metrics

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| metricsMiddleware.ts | Named record/set helpers over the registry + baseline series seeding | lib (studioServer, studioSupervisor, approvals/approvalStudioService, metricsServer) | REAL | Y (tests/opsHardeningPack.test.ts, tests/observability/metricsServerObservability.test.ts) | `ensureMetricsBaseline` seeds `bootstrap`-labelled series at 0 so scrapers see the metric names; the counters they seed are incremented from real call sites |
| metricsRegistry.ts | In-process counter/gauge/histogram registry and Prometheus text renderer | lib (metricsMiddleware, metricsServer, eval/amcJudgeIntegration) | REAL | Y (tests/observability/metricsServerObservability.test.ts) | Cumulative bucket rendering and `+Inf`/`_sum`/`_count` are computed from observed values |
| metricsServer.ts | Localhost-by-default `/metrics` and `/health` HTTP server with CIDR allowlist and denial auditing | lib (studioSupervisor) | REAL | Y (tests/observability/metricsServerObservability.test.ts, tests/opsHardeningPack.test.ts) | The allow decision can genuinely be false: default is `isLocal(ip)`, remote mode requires a CIDR match; denials rate-limit their audit events rather than suppressing them. `ipAllowedByCidrs` returns true for `::1` unconditionally and cannot match IPv6 CIDRs (IPv4-only integer math) |

### src/redteam/jailbreak

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| attacks.ts | Static library of DAN/roleplay/override/hierarchy/persona attack templates | lib (jailbreak/index → redteam/index; runner, tap) | REAL | Y (tests/security/jailbreak.test.ts) | Getters return copies, so callers cannot mutate the shared table |
| detector.ts | Weighted-signal jailbreak verdict over an agent response | lib (jailbreak/index; dynamic import in cli.ts:20311) | REAL | Y (tests/security/jailbreak.test.ts, tests/security/normalizer.test.ts) | Both directions of evidence exist (negative-weight refusal/meta-awareness signals), so a verdict can go either way. The `attackPrompt` parameter is accepted and never read in the body — the verdict is derived from the response alone, and `cli.ts:20353` passes the payload twice into it |
| index.ts | Barrel for the jailbreak module | lib (src/redteam/index.ts) | REAL | Y (tests import through it) | |
| normalizer.ts | Detects refusal-then-comply pivots and hedging preambles before detection | lib (detector, jailbreak/index) | REAL | Y (tests/security/normalizer.test.ts) | Pivot requires refusal language before *and* compliance indicators after, so it is not a bare punctuation split |
| runner.ts | Orchestrates attack×payload runs, summarises, writes JSON + markdown report | lib (jailbreak/index → redteam/index) | REAL | Y (tests/redteamRealExecution.test.ts) | `respondFn` is required with no synthetic fallback, so scores come from a real target. Re-exported onto the CLI surface but no `amc` command invokes `runJailbreakTests`; only tests call it today |
| tap.ts | Tree-of-Attacks-with-Pruning refinement loop over a live target | lib (jailbreak/index → redteam/index; runner when `enableTAP`) | REAL | Y (tests/redteamRealExecution.test.ts) | Real BFS with pruning, eval budget and early stop; `respondFn` required. Stale header still claims "uses a synthetic response engine … for deterministic, offline evaluation", which the code no longer does |

### src/scanner/patterns

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| patternCatalog.ts | 4 code-smell rules plus a quick-fix suggestion library | lib (patternScanner) | REAL | Y (via patternScanner, tests/scanPatternFindings.test.ts) | `QUICK_FIX_LIBRARY` is exported and referenced by nothing anywhere in the repo, so `quickFixId` on every match dead-ends |
| patternScanner.ts | Line-wise regex scan producing sorted matches | lib (scanner/localScanner.ts) | REAL | Y (tests/scanPatternFindings.test.ts) | `fetch-without-timeout` has a real negative condition (skips lines carrying AbortSignal/signal/timeout). `summarizeQuestionRisk` is exported with no consumer in src or tests |
| types.ts | Rule/match/annotation/quick-fix interfaces | lib (patternCatalog, patternScanner) | REAL | N | `InlineScoreAnnotation` has no producer or consumer anywhere |

### src/shield/injection

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| injectionMatcher.ts | The single prompt-injection matcher; caller-supplied confidence threshold | lib (shield/detector, shield/threatIntel, shield/validators, runtime/firewall, tools/guards/policyGuards) | REAL | Y (tests/injectionMatcherConsolidation.test.ts) | Risk score follows the strongest match rather than a count, and `BLOCK_CONFIDENCE` is exported for the one caller that refuses requests |
| injectionPatterns.ts | Frozen union of the four former pattern tables, each with confidence + provenance | lib (injectionMatcher, shield/detector, shield/threatIntel) | REAL | Y (tests/injectionMatcherConsolidation.test.ts) | Entries are `Object.freeze`d and flag-free; a test refuses any entry carrying `g` |

### src/shield/redaction

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| redactSecrets.ts | One redaction pass; caller chooses the placeholder | lib (bridge/bridgeRedaction, enforce/secretBlind, runtime/firewall, adapters/{envAssembler,adapterRunner}, sdk/amcEvidence) | REAL | Y (tests/secretRedaction.test.ts) | Findings are collected against the original string so offsets stay valid; zero-length matches are advanced past rather than looping |
| secretPatterns.ts | The one secret-pattern table with per-entry provenance | lib (redactSecrets, lint/rules/noHardcodedSecrets, watch/hostHardening) | REAL | Y (tests/secretRedaction.test.ts) | PEM pattern covers all five real header forms; no `g`/`y` flags stored |

### src/shield/validators

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| index.ts | PII/secret/injection/medical/financial/toxicity/competitor/blocklist validators + aggregator | lib (governor/nlPolicy, score/agentSimulator, score/syntheticIdentityGovernance) | PARTIAL | Y (tests/validators.test.ts, tests/shieldValidatorsCoverage.test.ts) | `validatePromptInjection` was correctly rewired onto the shared matcher, but `validateSecretLeakage` still carries its own private 8-entry table that disagrees with `shield/redaction/secretPatterns.ts` — no slack token/webhook, no connection string, no google or xAI key, no lease/amc token — so the same text scans clean here and dirty in the redaction path. `anthropic_key` requires exactly 95 body chars (`sk-ant-[A-Za-z0-9_-]{95}`), missing any other length. `credit_card` is `\b(?:\d[ -]?){13,16}\b` with no Luhn check, and `ip_address` matches any dotted quad including version strings. `validateCompetitorMention` builds a `lower` variable it discards via `void lower` |

### src/mechanic/ui

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| mechanicModel.ts | Type declarations for a mechanic dashboard model | ORPHAN | DEAD | N | Types only, zero importers anywhere in src or tests; the dashboard these describe does not exist |
| tuningExplainers.ts | `explainTuningKey` — human strings for tuning knob keys | ORPHAN | DEAD | N | No caller anywhere in src or tests |
