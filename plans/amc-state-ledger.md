# AMC State Ledger — where every file stands today

Generated 2026-08-20 by a 26-agent file-level sweep of the full repo at \`f419839a\` (1,775 src files across 134 dirs + tests/docs/python/surfaces/satellites/scripts/state). Status vocabulary: REAL (does what it claims) · PARTIAL · STUB (placeholder) · FACADE (fakes results presented as real) · DEAD (unreferenced). "wired via" shows how a module is reachable; ORPHAN = no importer found.

Companion documents: the gap register (amc-gap-register.md) and the construction plan (amc-superharness.md).

---

## B1 — src/assurance

### src/assurance

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| assuranceRunner.ts | Run packs, score, sign, persist reports | CLI:`amc assurance run` + API:assuranceRouter + studio | FACADE | Y | validates own hardcoded syntheticResponse(); no agent/model ever called; 805 lines |
| validators.ts | Shared regex validators + pack types | lib (packs, shield, redteam, domains) | REAL | Y | refusal detection is keyword regex only |
| scorers.ts | Scenario/pack/overall score aggregation | lib (runner, redteam/runner) | REAL | N | tested only indirectly via runner |
| report.ts | Render assurance report markdown | lib (assuranceRunner) | REAL | N | trivial renderer |
| evidenceWriters.ts | Append prompts/responses/audits to ledger | lib (assuranceRunner) | REAL | N | stores raw prompts+responses, contradicting redaction policy |
| assuranceCli.ts | CLI facade over control plane | CLI:`amc assurance *` + API:complianceRouter | REAL | Y | thin delegation layer |
| assuranceControlPlane.ts | Policy/run/waiver/scheduler orchestration | API:assuranceRouter + studio + CLI | REAL | Y | returns `saved:null` — never persists v1 run artifacts |
| assurancePolicyStore.ts | Signed persistence: policy, runs, waivers, scheduler | lib (workspace, bootstrap, studio) | REAL | Y | saveAssuranceRunArtifacts has zero callers |
| assurancePolicySchema.ts | Zod policy schema + defaults | lib (control plane, store) | REAL | N | packsEnabled lists only 6 packs; cadence unused |
| assuranceSchema.ts | Zod schemas: v1 run/finding/waiver/cert | lib (store, certs, verifier) | PARTIAL | Y | packId enum allows 7 ids vs 142 registered packs |
| assuranceScoring.ts | Severity-penalty scoring + evidence gates | lib (assuranceCertificates) | PARTIAL | N | scoreAssuranceRun never called; only gates function live |
| assuranceFindings.ts | Build findings doc from v1 scenarios | lib (assuranceScoring only) | DEAD | N | entire call chain dead; nothing produces v1 scenarios |
| assuranceCertificates.ts | Issue/inspect signed assurance cert bundle | lib (scheduler, control plane → CLI/API) | PARTIAL | Y | loads AssuranceRun files nothing writes; throws on fresh workspace |
| assuranceVerifier.ts | Verify cert tar signature + proofs | CLI:`amc assurance verify-cert` + API + verifyAll | REAL | N | real crypto verification |
| assuranceScheduler.ts | Scheduler status/enable/run-now | lib (control plane, studio) | PARTIAL | N | no timer loop; "cadence" never auto-fires |
| assuranceStore.ts | Read run/cert/waiver summaries | lib (value, passport, audit binder) | PARTIAL | N | reads v1 runs nothing writes; usually null |
| assuranceSse.ts | Emit assurance SSE events | studio | REAL | N | 19-line helper |
| certificate.ts | Maturity certificate bundle: issue/verify/revoke | CLI:`amc cert` + API:cryptoRouter | REAL | Y | 672 lines; second, parallel cert system to assuranceCertificates |
| indices.ts | Failure-risk + autonomy indices from runs | CLI + lib (forecast, snapshot, bench, bom) | REAL | Y | weighted blend of question scores and pack scores |
| microCanary.ts | Continuous canary probe engine | CLI + API:canaryRouter | REAL | Y | 904 lines; all state module-level in-memory |
| falsePositiveTracker.ts | FP reports, cost model, tuning recs | CLI + API:assuranceRouter | PARTIAL | Y | in-memory only — every CLI invocation starts empty |
| evidenceArtifactSchema.ts | Enum of evidence artifact types | lib (4 compliance packs) | REAL | Y | pure enum |

### src/assurance/fixtures/packs

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| *PackV1.json (6 files) | Legacy v1 pack manifests | ORPHAN | DEAD | N | no reference anywhere in src or tests |

### src/assurance/packs

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| index.ts | Pack registry (142 entries) | lib (runner, control plane, CLI, shield) | REAL | Y | imports continue after code at file bottom; 323 lines |
| registered scenario packs (140 files) | Prompt seeds + regex response validators | lib (index.ts → runner/CLI/API) | REAL | ~half | definitions real, but only ever run against synthetic response |
| benchmarkTrackingModule.ts | Rename alias re-export | lib (index.ts) | REAL | N | 16-line alias of benchmarkTrackingPack |
| do-not-answer-pack.ts | Refusal scenario pack | ORPHAN | DEAD | N | near-duplicate of wired donotanswer-pack.ts |
| toxicchat-pack.ts | Toxicity scenario pack | ORPHAN | DEAD | N | near-duplicate of wired toxic-chat-pack.ts, same export name |
| multiTurnDeepEvalPack.ts | Multi-turn eval pack definition | ORPHAN (tests only) | DEAD | Y | never registered in index.ts |
| selfReportGamingPack.ts | Self-report gaming pack definition | ORPHAN | DEAD | N | never registered, no test |
| agentAsProxyPack.ts | Composition-attack detection functions | lib (score/monitorBypassResistance) | REAL | Y | analysis library, not an AssurancePackDefinition |
| mcpSecurityResiliencePack.ts | MCP security analysis functions | lib (score/mcpCompliance) | REAL | Y | analysis library; 402 lines |
| economicAmplificationPack.ts | Economic amplification detectors | ORPHAN (tests only) | DEAD | Y | no src importer |
| overthinkingDetectionPack.ts | Reasoning-loop detectors | ORPHAN (tests only) | DEAD | Y | no src importer |
| zombieAgentPersistencePack.ts | Persistence-pattern detectors | ORPHAN (tests only) | DEAD | Y | no src importer |

#### Findings — B1

- **Core facade**: `assuranceRunner.syntheticResponse()` fabricates a compliant answer per prompt keyword; all 142 packs "test" that canned string with regexes — no agent, model, or live system is ever exercised, yet output is signed, ledgered, and reported as red-team results.
- **Stranded legacy chain**: `saveAssuranceRunArtifacts` has zero callers, so `issueAssuranceCertificate`, `assuranceStore`, `assuranceScoring.scoreAssuranceRun`, and `assuranceFindings` operate on v1 files nothing writes — cert issuance always throws on a fresh workspace (scheduler swallows it).
- **Schema contradictions**: `assurancePackIdSchema` allows 7 pack ids vs 142 registered; policy `packsEnabled` lists 6 and is never consulted by the runner.
- **Redaction policy violated**: policy hardcodes `storeRawPrompts:false / storeOnlyHashesAndRefs:true`, but runner/evidenceWriters persist raw prompts and responses to ledger and report JSON.
- **Orphan cluster (13 files)**: 7 unimported pack modules (2 are near-duplicate spellings of wired packs) plus 6 dead fixture JSONs.
- **"Research dataset integration" overstated**: harmbench/beavertails/donotanswer/toxic-chat/xstest/cyberseceval/aegis packs are ~15–25 hand-written scenarios each, not actual dataset imports.
- **In-memory-only state**: microCanary and falsePositiveTracker hold module-level state; every CLI invocation resets it, making their CLI commands effectively no-ops across runs.
- **Duplication/size**: two parallel certificate systems (certificate.ts 672L vs assuranceCertificates.ts); microCanary 904L and assuranceRunner 805L exceed the 800-line guideline; scheduler has no scheduling loop.

---

## B2 — src/console

### src/console
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| consoleServer.ts | Serves console pages/assets over HTTP | lib (studioServer.ts, index.ts) | REAL | Y | path-traversal guarded; ~45 tests hit /console routes |

### src/console/state
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| uiFormat.ts | Percent/timestamp formatters | ORPHAN | DEAD | N | no importer anywhere in src or tests |
| uiModels.ts | Console view-model interfaces | ORPHAN | DEAD | N | imported only by orphan uiSelectors.ts |
| uiSelectors.ts | Raw-to-model mapping selectors | ORPHAN | DEAD | N | no importer; browser JS never uses it |

### src/console/assets
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| api.js | Fetch wrapper, auth, workspace-prefix routing | studio (all page modules) | REAL | N | handles /w/ and /host base prefixes |
| app.js | Router + renderers for ~49 console pages | studio (page shells) | REAL | Y | 3,833 lines; dead equalizer/benchmarks branches; workorders mislabeled |
| charts.js | Canvas line/bar chart renderers | studio (app.js, forecast.js) | REAL | N | pure canvas drawing |
| qr.js | "QR-like" pairing code graphic | studio (app.js login) | FACADE | N | hash-seeded decorative dots, not scannable QR |
| sw.js | Service worker offline caching | studio (app.js installPwa) | REAL | Y | caches pages, assets, snapshot |
| styles.css | Console stylesheet | studio (all pages) | REAL | Y | packaging tests assert presence |
| manifest.json | PWA manifest | studio | REAL | Y | SVG icons only |
| evidenceDrilldown.js | Evidence drilldown page, fail-closed rendering | studio (app.js) | REAL | Y | 239 lines; 18 gap-boundary tests pin content |
| app.js page modules (19 files: advisories, assurance, assuranceRun, assuranceCert, audit, auditBinder, auditRequests, compass, contextGraph, diagnosticView, forecast, northstar, passport, portfolioForecast, standard, trust, value, valueAgent, valueKpis) | Per-page renderers calling live studio APIs | studio (imported by app.js) | REAL | N | endpoints verified in studioServer; value/passport files have single test refs |
| standalone page modules (7 files: benchmarks, benchCompare, benchRegistry, equalizer, mechanic, simulator, upgradeWizard) | Self-booting pages hitting /bench, /mechanic APIs | studio (own `<script>` in HTML) | REAL | N | own whoami auth; bypass app.js router |
| benchPortfolio.js | Cross-workspace bench portfolio table | studio (benchPortfolio.html) | PARTIAL | N | /api/bench/portfolio exists only host-scoped; silently empty otherwise |

### src/console/assets/components
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| presentational render helpers (39 files) | HTML-string card/chip/chart/table renderers | studio (imported by page modules/app.js) | REAL | N | 14–107 lines each; escape input; no synthetic data |
| actionCard.js | Action card renderer | ORPHAN | DEAD | N | exported, never imported |
| evidenceChip.js | Evidence ref chip renderer | ORPHAN | DEAD | N | exported, never imported |

### src/console/assets/icons
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| compass.svg | PWA/console icon | studio (manifest.json, sw.js) | REAL | N | 306 bytes |

### src/console/pages
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| app.js shell pages (49 files) | data-page shells loading assets/app.js | studio (consoleServer) | REAL | N | 25–51-line homogeneous shells; home.html tested |
| standalone shells (8 files: benchmarks, benchCompare, benchPortfolio, benchRegistry, equalizer, mechanic, simulator, upgradeWizard) | Shells loading their own page module | studio (consoleServer) | REAL | N | linked from mechanic/home navs |
| dashboard.html | Clone of home.html | studio (URL only) | PARTIAL | Y | 1-char diff from home.html; unlinked drift clone |
| ops.html | Retention/maintenance/backup ops panel, inline script | studio (URL only) | REAL | N | hits real /ops/* routes; unlinked from any nav |
| score.html | Static info card pointing to CLI | studio (home link) | STUB | N | no live data; different styling; brochure page |

#### Findings — B2
- **qr.js is a facade**: xorshift-random dot pattern with QR finder squares, aria-labeled "Pairing QR" on the login screen — not scannable.
- **app.js is a 3,833-line monolith** (>800-line cap) containing unreachable dead branches for `equalizer` and `benchmarks` — those pages load standalone modules instead.
- **Competing duplicate implementations**: app.js equalizer hits `/agents/:id/targets` while live equalizer.js hits `/mechanic/targets`; app.js benchmarks hits `/benchmarks/list` while live benchmarks.js hits `/bench/*` — drifted twins.
- **src/console/state/ is fully dead** (uiFormat/uiModels/uiSelectors): TypeScript view-models with zero importers; the actual UI is plain JS that never uses them.
- **Orphan components**: actionCard.js and evidenceChip.js exported but never imported.
- **Host-scope-only APIs**: benchPortfolio.js and portfolioForecast.js call `/api/bench/portfolio` and `/api/portfolio/forecast`, which exist only as `/host/api/*` in workspaceRouter — workspace-scoped views degrade to empty/fallback silently.
- **Unlinked pages**: dashboard.html (1-char clone of home.html) and ops.html are reachable only by direct URL; score.html is a static brochure/CLI pointer amid live pages.
- **Test coverage is thin and lopsided**: content assertions concentrate on app.js (23 refs), evidenceDrilldown.js (18), sw.js (4); all 41 components and most page modules have no direct tests.

---

## B3 — src/score

### src/score

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| index.ts | barrel re-exporting ~180 symbols | lib (src/index.ts, cli.ts) | REAL | Y | package public API; sole "wiring" for ~22 modules |
| self-scan rubric, wired (12 files: agentStatePortability, auditDepth, behavioralContractMaturity, euAIActCompliance, failSecureGovernance, gamingResistance, kernelSandboxMaturity, outputIntegrityMaturity, owaspLLMCoverage, runtimeIdentityMaturity, selfKnowledgeMaturity, sleeperDetection) | score security/compliance maturity of target repo | CLI:cli.ts (+API compliance/security routers) | FACADE | Y | existsSync of hardcoded AMC-internal src/ paths presented as maturity/compliance score |
| self-scan rubric, orphan (6 files: adaptiveAccessControl, agentProtocolSecurity, memorySecurityArchitecture, monitorBypassResistance, reasoningEfficiency, trustAuthorizationSync) | same self-scan pattern, arXiv-sourced dimensions | ORPHAN-barrel | FACADE | Y | same hardcoded-path checklist; only barrel exports |
| gamingResistance.ts *(detail of row 2)* | meta-score of AMC's own gameability | CLI + ci/redteamGate + API | FACADE | Y | awards points for `existsSync("src/score")` etc.; 17 path checks |
| agentSimulator.ts | pre-deployment scenario simulation | ORPHAN-barrel | FACADE | Y | "agent behavior" synthesized by own rule engine; agent never invoked; `evidenceGenerated: true` hardcoded |
| evidenceCollector.ts | wrap module outputs as evidence | CLI (dynamic) + densityMap | PARTIAL | Y | flat 0.7 trust; all outputs labeled "observed" |
| evidenceCoverageGap.ts | gap roadmap with effort estimates | CLI + 3 score libs | PARTIAL | Y | agentId param ignored; static prefix-based roadmap |
| regulatoryReadiness.ts | composite EU/ISO/OWASP readiness | CLI + API:complianceRouter | PARTIAL | Y | composes self-scan FACADE components; ledger modifier is real |
| input-rubric scorers, CLI-wired (9 files: a2aProtocol, agentVsWorkflow, alignmentIndex, distributedAgents, leanAMC, memoryDepth, orchestrationDAG, pauseQuality, taskHorizon) | weighted score from caller-supplied profile/events | CLI:cli.ts | REAL | Y | honest rubric math; inputs are self-reported by caller |
| autonomyDuration.ts | domain risk profiles lookup | CLI:cli.ts | REAL | N | static table + intervention math; untested |
| industryTrustModels.ts, memoryIntegrity.ts, memoryMaturity.ts (3 files) | sector weighting; memory integrity; hash-chain verification | CLI + API (score/memory routers) | REAL | Y | memoryMaturity verifies real SHA-256 hash chains |
| lane rubrics (9 files: capabilityGovernance, factSimulationBoundary, forecastLegitimacy, organizationalSafetyPosture, oversightIntegrity, processDeceptionDetection, scenarioProvenance, simulationValidity, syntheticIdentityGovernance) | AMC-6.x/7.x question-range scorers | lib (lanes/*Lane.ts → CLI+API) | REAL | Y | input-driven; scan helpers use filename heuristics |
| adversarial.ts | answer-inflation/buzzword gaming detection | CLI(dynamic) + API + agents/harnessRunner | REAL | Y | real text heuristics over answers |
| antiGaming.ts | statistical gaming detection, fingerprinting | ORPHAN-barrel (src/index.ts export only) | REAL | Y | volatility/outlier math is real; unwired to commands |
| graduatedAutonomy.ts | confidence-based escalation model | ORPHAN-barrel (src/index.ts only) | REAL | Y | export-only wiring |
| scoreExplainer.ts | score decomposition, counterfactuals, CI | ORPHAN-barrel (src/index.ts only) | REAL | Y | 515 lines; export-only wiring |
| unwired analytics (9 files: bishengObservabilityLiveDriftScore, catastrophicRiskIndicators, communityGovernance, crossFrameworkMapping, nlpMetrics, ragGroundingEval, ragMaturity, safetyMetrics, statisticalAnalysis) | metrics/governance/framework-mapping modules | ORPHAN-barrel | REAL | Y | real algorithms (BLEU/ROUGE, Welch t-test, regex classifiers, Merkle-free mappings); nothing calls them |
| unwired rubrics, untested (4 files: multiAgentDimension, platformDependency, predictiveMaturity, reputationPortability) | 8th-dimension/platform/trajectory/reputation scoring | ORPHAN-barrel | REAL | N | whitepaper "future work" modules; no consumer, no tests |
| costPredictability.ts, decisionExplainability.ts, testProdParity.ts (3 files) | input-rubric scorers | ORPHAN | DEAD | N | not in barrel, zero importers, zero tests |
| scoreHistory.ts | JSON snapshot store, regression detection | ORPHAN | REAL | Y | only importer is dead scoreHistoryCli |
| scoreHistoryCli.ts | CLI wrappers for score history | ORPHAN | DEAD | N | commands never registered in cli.ts |
| calibrationGap.ts | ECE from predictions + infra scan | CLI + reasoningEfficiency | REAL | Y | real calibration math; scan half is filename checks |
| confidenceDrift.ts | prediction-vs-outcome drift tracking | CLI + 11 score libs | REAL | Y | most-imported module in dir |
| claimExpiry.ts | claim TTL/staleness math | CLI + 2 libs | REAL | Y | |
| claimProvenance.ts | claim tier lifecycle, quarantine gates | lib (3 score modules) | REAL | Y | sha256 provenance chain |
| crossAgentTrust.ts | HMAC claim verification, transitive trust | API:scoreRouter + trustAuthorizationSync | REAL | Y | real crypto; symmetric-key trust model |
| densityMap.ts | evidence density heatmap | CLI:cli.ts | REAL | Y | |
| domainPacks.ts | vertical rubric question packs | lib (domains/ → CLI) | REAL | Y | 763 lines, mostly question data |
| evidenceConflict.ts | evidence consistency scoring | CLI:cli.ts | REAL | Y | |
| evidenceIngestion.ts | external confidence-report ingestion (ATTESTED tier) | CLI:cli.ts | REAL | Y | |
| factuality.ts | three-axis factuality scoring | CLI + calibrationGap | REAL | Y | scores caller-labeled samples, no retrieval itself |
| faithfulness.ts | context-grounding score, heuristic + LLM-judge | CLI:cli.ts | REAL | Y | dual mode honestly labeled; llm mode does real fetch |
| formalSpec.ts | canonical M(a,d,t) decay formula | lib (5 modules) + CLI dynamic | REAL | Y | core scoring math of product |
| humanOversightQuality.ts | approval-theater detection from telemetry | CLI + API:governorRouter + 4 libs | REAL | Y | 784 lines; real latency/concentration analysis |
| interpretability.ts | decision-trace observability scoring | CLI + auditDepth | REAL | Y | event-driven |
| knowledgeGraph.ts | typed agent/tool/policy graph | lib (selfKnowledgeMaturity) | REAL | Y | only consumer is a FACADE module |
| lessonLearnedDatabase.ts | lessons store, Jaccard recurrence | lib (selfKnowledgeMaturity) | REAL | Y | in-memory only |
| levelTransition.ts | promotion/demotion evidence gates | CLI:cli.ts | REAL | Y | |
| maturityTaxonomy.ts | L0–L5 labels/legend constants | CLI + 8 modules | REAL | Y | canonical taxonomy source |
| mcpCompliance.ts | MCP capability rubric + injection regexes | lib (owaspLLMCoverage) | REAL | Y | real input-driven module consumed only by FACADE |
| metricValidity.ts | per-benchmark metric-validity requirements registry | lib (diagnostic/runner) | REAL | Y | 18,458 lines — ~23× the 800-line cap; constants-as-code |
| modelDrift.ts | model-version drift tagging | lib (6 score modules) | REAL | Y | |
| mutualVerification.ts | nonce challenge/response agent trust | CLI:cli.ts | REAL | Y | HMAC, real |
| networkTransparencyLog.ts | CT-style Merkle append-only log | CLI:cli.ts | REAL | Y | real Merkle tree, in-process only |
| operationalIndependence.ts | dependency/reliability scoring from guard events | CLI + gamingResistance | REAL | Y | 1,297 lines (>800 cap) |
| outputAttestation.ts | HMAC-signed output attestations | CLI:cli.ts | REAL | Y | default key "amc-default-key" — forgeable out-of-box |
| policyConsistency.ts | pass^k reliability over trials | CLI:cli.ts | REAL | Y | |
| predictiveValidity.ts | prediction-log calibration, score stability | lib (gamingResistance, metricValidity) | REAL | Y | 928 lines (>800 cap) |
| productionReadiness.ts | deterministic go/no-go gates from ledger | CLI + euAIActCompliance | REAL | Y | reads real evidence ledger |
| scoringScale.ts | 0–1 to display-scale config | lib (enforce, passport, watch, vault) | REAL | Y | |
| architectureTaskAlignment.ts | complexity-vs-task fit metrics | lib (reasoningEfficiency only) | REAL | Y | 780 lines; sole importer is orphan FACADE |
| support rubrics, untested (5 files: behavioralTransparency, capabilityElicitation, identityContinuity, simplicityScoring, evidence n/a) — behavioralTransparency, capabilityElicitation, identityContinuity, simplicityScoring | declared-vs-observed, elicitation, identity, simplicity scoring | lib (other score modules only) | REAL | N | consumed mainly by FACADE self-scan modules |
| vibeCodeAudit.ts | regex static safety checks on code | CLI + euAIActCompliance | REAL | Y | honest static lint, no LLM claim |

#### Findings — B3
- **18-module FACADE cluster**: security/compliance scorers (EU AI Act, OWASP LLM Top 10, sleeper detection, gaming resistance, etc.) score by `existsSync` of hardcoded AMC-internal paths — they measure "is this AMC's own repo", not the assessed agent; any external target scores ~0, AMC scores itself high.
- gamingResistance (the anti-gaming meta-score) is itself the most gameable: create empty files/dirs named `src/score`, `src/vault` to gain points; it feeds ci/redteamGate and securityRouter.
- agentSimulator's "pre-deployment agent simulation" never invokes an agent — pass/fail comes from pattern-matching scenario text against its own rules; `evidenceGenerated` hardcoded `true`.
- ~26 modules are ORPHAN-barrel or fully ORPHAN: real, tested algorithm code (nlpMetrics, statisticalAnalysis, safetyMetrics, scoreExplainer, antiGaming, crossFrameworkMapping, ragGroundingEval) reachable only via the package barrel, no command/route uses them.
- Dead cluster: costPredictability, decisionExplainability, testProdParity, scoreHistoryCli (and scoreHistory reachable only through it) — unwired, mostly untested.
- Size violations: metricValidity.ts 18,458 lines (append-only benchmark-registry constants), operationalIndependence 1,297, predictiveValidity 928 — all past the repo's 800-line rule.
- evidenceCollector assigns flat 0.7 trust and labels every module output "observed", contradicting the repo's evidence-trust-tier methodology (commit f419839a claims those boundaries were reconciled).
- Trust crypto (outputAttestation, crossAgentTrust, mutualVerification) is real HMAC-SHA256 but ships default symmetric key `amc-default-key`, making cross-agent "verifiable trust" forgeable by default.

---

## B4 — audit/forecast/fleet/runtime/corrections/scanner/security/ledger/verify

### src/audit

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| auditApi.ts | binder/map/policy CRUD, readiness gate | studio + CLI (via auditCli) | REAL | Y | approval-gated binder export flows |
| auditCli.ts | CLI wrappers over auditApi | CLI:audit | REAL | N | thin delegation layer |
| auditMapBuiltin.ts | built-in SOC2/ISO/NIST-like control map | lib (auditMapStore) | REAL | N | static config-as-code, 388 lines |
| auditMapSchema.ts | zod schemas for audit maps | lib | REAL | N | |
| auditMapSigner.ts + auditMapVerifier.ts (2) | sign/verify map files | lib (auditMapStore) | REAL | N | 4-line orgSigner wrappers |
| auditMapStore.ts | load/save/sign active maps | studio, verifyAll, workspace | REAL | Y | |
| auditPolicySchema.ts | zod policy/scheduler schemas | lib | REAL | N | |
| auditPolicyStore.ts | policy + scheduler store, dirs | studio, verifyAll, workspace | REAL | Y | |
| auditScheduler.ts | recurrence refresh of binder cache | studio | REAL | N | |
| auditSse.ts | binder/request SSE emit helper | studio | REAL | N | 15 lines |
| binderArtifact.ts | export signed binder tar/PDF | lib (auditApi, verifyAll) | REAL | Y | spawnSync tar; hand-rolled PDF writer |
| binderCollector.ts | evaluate controls against workspace evidence | lib (binderArtifact/scheduler) | REAL | Y | 1173 lines; deterministic fact catalog |
| binderProofs.ts | proof bundle wrapper | lib | REAL | N | delegates to bench/benchProofs |
| binderRedaction.ts | PII scan + id hashing | lib | REAL | Y | regex rules |
| binderSchema.ts | binder zod schemas | lib + standardGenerator | REAL | Y | |
| binderSigner.ts | sign binder JSON | lib (binderArtifact) | REAL | N | |
| binderStore.ts | binder cache/export paths | lib (workspaceRouter, passport) | REAL | N | |
| binderVerifier.ts | verify binder cache/export signatures | verifyAll, standard, workspaces | REAL | Y | raw `tar -xzf`, no safeTarArchive |
| enterpriseAuditExport.ts | ledger → splunk/datadog/cloudtrail/syslog | CLI (enterpriseCli) | REAL | Y | real format mapping |
| evidenceRequestSchema.ts | zod request schema | lib | REAL | N | |
| evidenceRequestStore.ts | signed open/closed request store | lib (auditApi) | REAL | N | |
| evidenceRequests.ts | approval-gated auditor request workflow | lib (auditApi) | REAL | N | |
| insiderRisk.ts | rubber-stamp/self-approval/unusual-hours analytics | CLI (dynamic import) | PARTIAL | Y | in-memory store; nothing ingests ledger events — CLI reports always empty |
| posthocAuditSampling.ts + reviewerIndependence.ts (2) | sampling/independence receipt builders+verifiers | ORPHAN-barrel | REAL | Y | src/index.ts export only; gap-boundary tests only |
| ui/auditExplainers.ts + ui/controlTemplates.ts (2) | UI copy constants | ORPHAN | DEAD | N | 6/11 lines, zero importers |

### src/forecast

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| forecastEngine.ts | orchestrates fit, advisories, scheduler | lib (workspace, studio, bootstrap) | REAL | N | 692 lines; real Theil-Sen pipeline |
| forecastModels/robustStats/changePoint/advisoryGenerator/leadingIndicators/renewalCadence/forecastSignals (7) | engine internals: robust stats, CUSUM, advisories, cadence, signal collection | lib (engine; signals also bench/value; cadence also transformation) | REAL | N | genuine statistics (Theil-Sen, MAD, EWMA, CUSUM) |
| forecastSchema.ts | types/ids/zod | lib | REAL | N | |
| forecastStore.ts | signed artifact/policy/advisory store | lib, studio, bootstrap | REAL | Y | |
| forecastVerifier.ts | verify forecast artifacts | verifyAll | REAL | Y | |
| forecastReports.ts | markdown rendering | studio | REAL | N | |
| forecastApi.ts | API-shaped facade functions | studio + mechanic + e2e | REAL | N | |
| forecastCli.ts | CLI wrappers | CLI:forecast | REAL | Y | |
| driftDetector.ts | series drift detection | lib (drift, watch, dashboard) | REAL | Y | shared by two continuousMonitor clones |
| anomalyDetector.ts | suspicious maturity-jump detection | lib (observability, watch) | REAL | Y | |
| forecastSigner.ts | 4-line sign wrapper | ORPHAN | DEAD | N | unused; store signs directly |
| forecastSse.ts | event type union only | ORPHAN | DEAD | N | 7 lines; no emitter (unlike auditSse) |

### src/fleet

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| registry.ts | agent registry, signed configs | CLI + lib (many) | REAL | Y | core module |
| paths.ts | per-agent path helpers | lib (everywhere) | REAL | Y | |
| governance.ts | fleet policies, SLOs, drift alerts | CLI + API:fleetRouter.ts | REAL | Y | 963 lines |
| fleetScoring.ts | multi-agent diagnostic runs + aggregation | CLI:fleet | REAL | Y | writes full lifecycle artifacts |
| fleetLifecycle.ts | fleet run artifact + cascade detection | CLI + unified | REAL | Y | |
| report.ts | fleet evidence report | CLI + assuranceRunner | REAL | Y | |
| trustComposition.ts | delegation-aware composite trust | CLI + dashboard | REAL | Y | |
| trustInheritance.ts | strict/weighted/floor trust modes | CLI | REAL | Y | |
| typedGraph.ts | typed multi-agent graph store | CLI + enforce | REAL | Y | |
| handoffPacket.ts | signed A2A handoff packets | CLI | REAL | Y | |
| orchestrationDag.ts | signed delegation DAG capture | CLI | REAL | N | |
| contradictionDetector.ts | cross-agent conflicting claims | CLI | REAL | N | |
| cascadeSimulator.ts | probabilistic cascade failure simulation | ORPHAN-barrel | REAL | Y | unseeded Math.random; src/index.ts only |
| multiTenant.ts | tenant isolation + federated benchmarks | ORPHAN-barrel | STUB | Y | in-memory Map; "isolation" is generated strings, nothing enforced |

### src/runtime

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| firewall.ts | runtime firewall policy, evaluation, signed journal | CLI + API:firewallRouter.ts + bridge/enforce | REAL | Y | 1639 lines |
| runManager.ts | runtime run/event store | CLI + API:runtimeRouter.ts + lib | REAL | Y | |
| index.ts | barrel | lib | REAL | Y | re-exports all runtime modules |
| wrapFetch.ts | gateway fetch wrapper: retry, breaker, steer | lib (studio, adapters, SDK) | REAL | Y | |
| traceLogger.ts | trace build + secret redaction | lib (wrapFetch, adapters) | REAL | Y | |
| lifecycleGraph.ts | run lifecycle graph build/verify | lib (integrations) | REAL | Y | |
| stateCheckpoint/autonomyBoundary/degradedModeContract (3) | signed receipt builders: checkpoints, autonomy decisions, degraded mode | ORPHAN-barrel | REAL | Y | gap-boundary family; no product surface calls them |
| truthProtocol.ts | required-headings validator | ORPHAN-barrel | PARTIAL | N | 47 lines heading regex; overlaps truthguard subsystem |
| approvalClient.ts | approval-token regex extraction | ORPHAN-barrel | PARTIAL | N | 28 lines, token regex only |

### src/corrections

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| correctionStore.ts | sqlite corrections tables, hash-chained | CLI (observability cmds) + learning | REAL | Y | |
| correctionTracker.ts | verify effectiveness vs next run | CLI + learning | REAL | Y | |
| correctionTypes.ts | shared types | lib | REAL | Y | |
| feedbackClosure.ts | closure eligibility, stale-loop alerts | CLI (dynamic import) | REAL | Y | |
| lessonStore.ts | promote recurring corrections to lessons | CLI (dynamic import) | REAL | N | |
| index.ts | barrel | CLI, workspace, studio | REAL | Y | |

### src/scanner

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| index.ts | barrel | CLI (dynamic import), studio | REAL | Y | |
| autoDetect.ts | regex framework/security detection | lib (localScanner) | REAL | Y | pure heuristics |
| localScanner.ts | walk dir, preliminary maturity score | CLI:scan | REAL | Y | regex "preliminary score", capped 200 files |
| repoScanner.ts | shallow git clone + scanLocal | CLI:scan | REAL | Y | injection-hardened (`--` arg) |
| endpointProbe.ts | HTTP security-header probe | CLI:scan | REAL | Y | header heuristics only |
| modelScanner.ts | model-file malware pattern scan | CLI (dynamic import) | PARTIAL | N | regex over binary bytes; shallow vs claims |

### src/security

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| index.ts | barrel | CLI, workspace, shield | REAL | Y | |
| supplyChainPosture.ts | posture report builder/verifier | ORPHAN-barrel | REAL | Y | gap-boundary family; src/index.ts only |
| safeTarArchive.ts | tar extraction containment limits | lib (plugins, passport) | REAL | Y | not used by audit binder tar paths |

### src/ledger

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| ledger.ts | sqlite evidence ledger, signatures, receipts, integrity | CLI + lib (everywhere) | REAL | Y | 2366 lines; core of product |
| monitor.ts | spawn monitored child process, capture evidence | CLI + agents/sandbox | REAL | Y | strips provider keys |

### src/verify

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| verifyAll.ts | aggregate workspace-wide signature verification | CLI:verify | REAL | Y | fans out to 20+ verifiers |

#### Findings — B4
- Orphan "gap-receipt" cluster: posthocAuditSampling, reviewerIndependence, stateCheckpoint, autonomyBoundary, degradedModeContract, supplyChainPosture, cascadeSimulator are exported only via src/index.ts and exercised only by gapNNNN boundary tests — no CLI/API/studio surface consumes them.
- insiderRisk is PARTIAL despite four CLI commands: its in-memory store has no ledger ingestion path (record* functions called only by tests), so `insider-risk-report` is always empty in production.
- multiTenant is a STUB sold as "R4-02 multi-tenant federated scoring": in-memory Map, generated namespace/encryptionKeyId strings, no persistence or enforcement.
- Dead files (4): forecastSigner.ts, forecastSse.ts, audit/ui/auditExplainers.ts, audit/ui/controlTemplates.ts — zero importers.
- binderArtifact/binderVerifier shell out to raw `tar -xzf` without the containment limits of security/safeTarArchive — duplicated tar logic and an unprotected extraction path.
- Files >800 lines: ledger.ts (2366), firewall.ts (1639), binderCollector.ts (1173), governance.ts (963), cascadeSimulator.ts (942).
- cascadeSimulator uses unseeded Math.random for fault detection — simulation receipts are irreproducible run-to-run.
- runtime/truthProtocol (heading-regex validator) conceptually duplicates the wired truthguard CLI subsystem; scanner scoring and endpointProbe are regex/header heuristics, honest but shallow relative to "maturity scoring" naming.

---

## B5

### src/mechanic

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| agentFixPlan.ts | Build signed fix plan from run result | CLI:`amc run --fix` (dynamic) | REAL | Y | Deterministic builder, hashed receipt, canned starter artifacts |
| autoFixer.ts | Template fix generator per gap QID | ORPHAN | FACADE | N | Hardcoded 0.85 confidence; duplicate of product/fixGenerator.ts |
| executionEngine.ts | Apply plan actions to configs | lib (mechanicApi) | REAL | Y | Really mutates budgets/tools/approval policy, signs configs |
| fixerRca.ts | Rule-based RCA from trace failures | CLI + API:fixerRouter | REAL | Y | RCA = static failure-class→resource lookup tables |
| gapAnalysis.ts | Measured-vs-target gap report | lib (mechanicApi/upgradePlanner) | REAL | Y | Prefix-based dimension mapping over question bank |
| mechanicApi.ts | Mechanic API surface (targets/plans/simulate/execute) | studio + lib | REAL | Y | Central hub; verified in mechanicWorkbench tests |
| mechanicCli.ts | CLI wrappers for mechanic ops | CLI:`amc mechanic` | REAL | N | Thin delegation to mechanicApi |
| mechanicSchema.ts | Zod schemas for gap/simulation | lib | REAL | Y | — |
| mechanicSse.ts | Emit mechanic SSE events | studio | REAL | N | 23 lines, event relay only |
| planDiff.ts | Summarize plan vs current config | lib (mechanicApi) | PARTIAL | N | Textual count summaries, not field-level diffs |
| planStore.ts | Persist/sign upgrade plans | lib | REAL | N | — |
| profileSchema.ts | Zod schema for profiles | lib | REAL | N | — |
| profiles.ts | Preset target profiles, signed | studio + CLI + lib | REAL | Y | — |
| simulator.ts | Persist/sign plan simulations | lib (mechanicApi) | PARTIAL | Y | Real gates/signing; projections come from static table |
| simulatorEvidenceGates.ts | Integrity/correlation gate check | lib (simulator) | REAL | N | Blocks projections below thresholds |
| simulatorModels.ts | Projected effect bands per action | lib (simulator) | FACADE | N | Hardcoded per-action-kind constants presented as projections |
| targetSchema.ts | Zod schema for targets | lib | REAL | N | — |
| targetsStore.ts | Persist/sign mechanic targets | lib + studio | REAL | Y | — |
| tuneExport.ts | Export reward-signal/DSPy targets | CLI + lib | REAL | Y | Deterministic transform of gap report |
| tuningSchema.ts | Zod schema for tuning knobs | lib | REAL | N | — |
| tuningStore.ts | Persist/sign tuning intent | lib + studio | REAL | N | — |
| ui/mechanicModel.ts | Dashboard model types | ORPHAN | DEAD | N | 25 lines, types only, never imported |
| ui/tuningExplainers.ts | Knob explanation strings | ORPHAN | DEAD | N | 21 lines, never imported |
| upgradePlanSchema.ts | Zod schema for upgrade plans | lib | REAL | Y | — |
| upgradePlanner.ts | Build plan from gaps via hints | lib (mechanicApi) | REAL | N | Keyword hint→action-kind heuristic |

### src/prompt

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| promptCompiler.ts | Compile signed Northstar prompt packs | lib (promptPackApi) | REAL | N | Pulls real workspace context; regex agent-type detection |
| promptDiff.ts | Diff prompt pack snapshots | lib (promptPackApi) | REAL | N | — |
| promptLint.ts | Regex secret/PII/leak lint | lib (compiler) | REAL | N | Real rules; token count = length/4 estimate |
| promptPackApi.ts | Prompt pack API operations | studio + bridge + CLI + index | REAL | Y | 838 lines, over 800 cap |
| promptPackArtifact.ts | Signed .amcprompt artifact I/O | lib | REAL | Y | — |
| promptPackCli.ts | CLI for prompt packs | CLI:`amc prompt` | REAL | N | — |
| promptPackSchema.ts | Zod schemas, 16 importers | lib | REAL | N | — |
| promptPackSigner.ts | Sign/verify pack digests | lib | REAL | N | Real auditor-key envelopes |
| promptPackSse.ts | Emit prompt SSE events | studio | REAL | N | 19 lines |
| promptPackStore.ts | Pack/lint file persistence | lib + studio | REAL | N | — |
| promptPackVerifier.ts | Verify pack signature files | studio + verify + CLI | REAL | Y | — |
| promptPolicySchema.ts | Prompt policy zod schema | lib + bridge + studio | REAL | Y | — |
| promptPolicyStore.ts | Policy/scheduler persistence, 14 importers | lib | REAL | Y | — |
| promptTemplates.ts | Template selection + system prompt render | lib (compiler) | REAL | N | — |
| providerTemplates/* (6 files) | Per-provider prompt envelope wrappers | lib (compiler, sdk) | REAL | Y | Trivial schema wrappers; openrouter is openai clone |

### src/approvals

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| approvalActivity.ts | Search/filter approval activity | studio + CLI | REAL | Y | — |
| approvalApi.ts | HTTP client for studio approval endpoints | ORPHAN | DEAD | N | Never imported anywhere; unused client |
| approvalChainStore.ts | Signed approval request/decision chain | studio + lib | REAL | Y | 705 lines |
| approvalCli.ts | Parse approval CLI args | lib + studio | REAL | Y | — |
| approvalCliCommands.ts | Register approval CLI commands | CLI:`amc approvals` | REAL | Y | — |
| approvalDelivery.ts | Deliver approval notifications via integrations | studio + CLI + lib | REAL | Y | Real dispatcher + ledger receipts |
| approvalEngine.ts | Create/verify/consume signed approvals | 13 importers incl. studio | REAL | Y | — |
| approvalInbox.ts | Inbox projection with integrity check | studio + CLI + lib | REAL | Y | — |
| approvalPolicyEngine.ts | Signed approval policy load/eval | CLI + studio + 20 more | REAL | Y | Most-imported module in bucket |
| approvalPolicySchema.ts | Policy zod schema | lib | REAL | N | — |
| approvalQuorum.ts | Quorum/role evaluation | lib (engine) | REAL | N | — |
| approvalSchema.ts | Legacy approval zod schema | lib (approvalStore only) | REAL | N | Only reachable through orphaned approvalStore |
| approvalStore.ts | Legacy signed approval artifacts | ORPHAN-barrel | REAL | N | Superseded by approvalChainStore; index.ts export only |
| approvalStudioService.ts | Studio approval decision service | studio | REAL | N | — |

### src/lifecycle

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| artifactSignature.ts | Sign/verify typed artifacts | lib (23 importers) | REAL | Y | Backbone of signing across repo |
| changeReceipt.ts | Signed change receipts | CLI + lib | REAL | Y | — |
| controlFileLock.ts | Hardlink-based file locking | lib (enforce/runtime) | REAL | Y | Real stale-lock reclaim logic |
| decisionReceipt.ts | Per-run decision receipts | CLI + lib | REAL | Y | — |
| episodeRecord.ts | Episode records + failure index | CLI + lib | REAL | Y | — |
| findingProof.ts | Per-finding proof set | CLI + lib | REAL | Y | — |
| lifecycle.ts | Stage state machine with gates | lib (lifecycleCli) | REAL | Y | dev→test→staging→prod gates enforced |
| lifecycleCli.ts | Status/advance CLI ops | CLI + API:workflowRouter | REAL | Y | — |
| lifecycleRunArtifact.ts | Unified run lifecycle artifact | CLI + lib | REAL | Y | — |
| observabilityLane.ts | Observability lane artifact | CLI + lib | REAL | Y | — |
| signedControlJournal.ts | Signed control-mutation journal | lib (enforce, firewall) | REAL | Y | 709 lines; real envelope verify |

### src/setup

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| integrationScaffold.ts | Framework scaffolds, contract tests, OpenAPI | CLI (dynamic) + studio/openapi | REAL | Y | 1035 lines, over 800 cap |
| onboardingActivation.ts | Evidence-backed activation milestones | CLI + studio | REAL | Y | Milestones verified against real ledger events |
| onboardingState.ts | Onboarding step state persistence | CLI + studio + lib | REAL | Y | — |
| quickSetup.ts | Interactive provider/gateway setup | lib (quickSetupCli) | REAL | Y | — |
| quickSetupCli.ts | Registers `amc setup` command | CLI:`amc setup` | REAL | Y | `--demo` writes synthetic demo evidence file |
| setupCli.ts | Older full setup flow | ORPHAN | DEAD | Y | Only tests import it; superseded by quickSetupCli |
| setupWizard.ts | Framework detection, L3 ETA estimate | lib (quickSetup, setupCli) | REAL | Y | ETA is disclosed heuristic formula |

### src/standard

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| standardApi.ts | Generate/verify/validate standard schemas | studio + standardCli | REAL | N | — |
| standardCli.ts | CLI wrappers | CLI:`amc standard` | REAL | N | — |
| standardGenerator.ts | Emit + sign schema bundle | lib + verify | PARTIAL | Y | Published JSON schemas are required-only shells; zod does real validation |
| standardRegistry.ts | Standard dir path helpers | lib | REAL | N | — |
| standardSchema.ts | Meta/signature zod schemas | lib | REAL | Y | — |
| standardTests.ts | Canonical schema snapshot helper | ORPHAN | REAL | Y | Only tests import it |

### src/playground

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| index.ts | Barrel for playground exports | CLI:`amc playground` (dynamic) | REAL | Y | — |
| interactiveMode.ts | "Run" all scenarios, format report | lib (index) | FACADE | Y | Prints "N/N scenarios passed" with no agent executed |
| scenarioRunner.ts | Scenario definitions + offline runner | lib (index) | FACADE | Y | Offline run hardcodes passed:true on every step |

### src/monitoring

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| driftDetection.ts | Rolling-window drift detector class | ORPHAN-barrel | REAL | Y | Logic works; in-memory only, nothing in product uses it |
| realtimeDashboard.ts | In-memory metric/alert store | ORPHAN-barrel | PARTIAL | Y | No dashboard/UI/persistence despite "Real-time Dashboard" name |

### src/telemetry

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| telemetryCli.ts | Opt-in telemetry config + event builder | ORPHAN | DEAD | Y | Promised `amc telemetry` command never registered; no transport exists |

#### Findings — B5
- Dead cluster in mechanic: autoFixer.ts (duplicates src/product/fixGenerator.ts with hardcoded confidence scores) plus ui/mechanicModel.ts and ui/tuningExplainers.ts — none imported anywhere.
- Facade cluster: playground offline runner marks every scenario step `passed: true` and prints "N/N passed" without any agent call; simulatorModels.ts projects maturity/risk deltas from a hardcoded per-action constants table.
- telemetry/telemetryCli.ts promises `amc telemetry on/off/status` in its header but no CLI command is registered, buildEvent is never called, and no send transport exists — feature is entirely inert.
- Legacy duplication: approvals has two parallel stores — approvalStore.ts+approvalSchema.ts (barrel-export only) superseded by approvalChainStore.ts; setup has two setup flows — setupCli.ts (test-only) superseded by quickSetupCli.ts.
- monitoring/ is a stranded island: DriftDetector and RealtimeMonitor are functional in-memory classes exported only via the index barrel; the real drift product lives in src/drift/ (freezeEngine), so "continuous monitoring" here is never wired.
- approvalApi.ts is an unused HTTP client for endpoints the studio serves directly — dead code.
- Files over the 800-line cap: setup/integrationScaffold.ts (1035), prompt/promptPackApi.ts (838).
- standardGenerator.ts signs and publishes "open standard" JSON schemas that are required-field-only shells with `additionalProperties: true`; actual validation is done by internal zod schemas, so the published standard is far weaker than the enforced one.

---

## B6 — src/diagnostic, src/lint, src/studio, src/leases, src/packs, src/pairing, src/receipts, src/targets

### src/diagnostic

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| audits.ts | Regex-based deterministic audit findings from evidence | lib (runner.ts) | REAL | Y | heuristic regexes for contradiction/policy detection |
| autoAnswer/autoAnswerEngine.ts | Evidence-driven auto answers via runDiagnostic | studio, lib (mechanic) | REAL | Y | powers `--auto` scoring path |
| autoAnswer/autoAnswerEvidenceQueries.ts | Derive per-question measured scores/unknowns | lib | REAL | Y | deterministic derivation from report |
| autoAnswer/autoAnswerMappings.ts | Build evidence rules from questionBank gates | lib | REAL | Y | |
| autoAnswer/autoAnswerTests.ts | Determinism probe running derivation twice | ORPHAN (test-only) | REAL | Y | test helper living in src |
| autoAnswer/traceEvidenceMapper.ts | Map observability traces to question answers | ORPHAN (test-only) | REAL | Y | claims to power `amc run --auto`; nothing imports it |
| bank/bankApi.ts | Bank init/get/apply/verify API wrappers | studio | REAL | N | thin delegation layer |
| bank/bankCli.ts | CLI wrappers over bankApi | CLI:diagnostic-bank | REAL | N | pure pass-through |
| bank/bankLoader.ts | Load/save/sign diagnostic bank YAML | lib (14 importers) | REAL | Y | signed with auditor key |
| bank/bankSchema.ts | Zod schema for diagnostic bank | lib | REAL | N | |
| bank/bankSigner.ts, bank/bankVerifier.ts (2) | Thin sign/verify wrappers over bankLoader | ORPHAN | DEAD | N | duplicate of bankLoader functions; no importers |
| bank/bankV1.ts | Generate default bank from questionBank | lib (bankLoader) | REAL | N | |
| calibration.ts | Confidence-vs-accuracy calibration bins | lib (confidenceDrift) | REAL | Y | |
| componentConfidence.ts | Per-subsystem confidence via questionId regexes | ORPHAN-barrel | REAL | Y | index.ts export only |
| confidenceControls.ts | Per-question confidence/downgrade controls | lib (runner) | REAL | Y | formula-derived synthetic metrics (judgeAgreement etc.) |
| confidenceDrift.ts | Confidence drift across runs | lib (score/index) | REAL | Y | |
| contextualizer/agentProfile.ts | Zod agent profile schema | lib | REAL | N | |
| contextualizer/contextualizer.ts | Render bank questions per agent profile | studio, CLI | REAL | Y | |
| contextualizer/contextualizerCli.ts | Render to md/json file | CLI | REAL | N | |
| contextualizer/profileResolver.ts | Infer agent type/models from ledger | lib | REAL | N | keyword classification |
| controlClassification.ts | Tag controls architectural/policy/convention | CLI:l5-delta, lib | REAL | N | hardcoded per-question mapping table |
| evalReplayCorpusBoundary.ts | Score/Shield/Watch readiness from replay receipt | ORPHAN-barrel | REAL | Y | |
| evidenceDrilldown.ts | Build evidence drilldown rows for score UI | API:scoreRouter (dynamic) | REAL | Y | 1817 lines; 18 gap-boundary tests |
| evidenceReadiness.ts | Claim-eligibility gate from integrity metrics | lib (7 importers) | REAL | Y | |
| fullDiagnostic.ts | Layer-grouped full interactive diagnostic scoring | CLI (dynamic import) | REAL | Y | |
| gates.ts | Evidence parsing, trust tiers, gate evaluation | lib (runner, fleet) | REAL | Y | staleness degrades trust tier |
| identityStability.ts | Behavioral consistency / persona-break index | ORPHAN-barrel | PARTIAL | Y | "signature" is plain string, not cryptographic |
| knownUnknowns.ts | List what AMC cannot determine per run | ORPHAN-barrel | REAL | Y | |
| l5DeltaReport.ts | Gap report current level vs L5 | CLI | REAL | N | |
| longitudinalTracking.ts | Time-series trend/regression analysis | ORPHAN-barrel | REAL | Y | |
| metaConfidence.ts | Confidence-in-the-score factors | lib (confidenceGovernor) | REAL | Y | |
| methodologyVersioning.ts | Methodology versioning receipt + source refs | lib (runner) | REAL | Y | hardcoded third-party source-ref constants |
| nonInteractiveQuickscore.ts | CI-safe quickscore notices + answer parsing | CLI | REAL | Y | explicitly refuses placeholder scores |
| questionBank.ts | 240-question default bank definition | lib (40+ importers) | REAL | Y | 5071 lines; core data asset |
| questionExplain.ts | Explain one question (measures/why/how) | CLI (dynamic) | REAL | Y | |
| questionScoreExplainability.ts | Normalize per-question explainability lens rows | lib (runner) | REAL | Y | 4151 lines; ~30 benchmark "lens" variants, mostly types |
| questionSets.ts | Legacy + lifecycle question set assembly | lib | REAL | Y | applies industry pack weights |
| quickScore.ts | 10-question quick score + ASCII radar | lib (startupGuidance) | REAL | Y | |
| quickscoreShare.ts | Shareable markdown badge for quickscore | ORPHAN (test-only) | REAL | Y | cli.ts reimplements --share inline; duplication |
| rapidQuickscore.ts | 5-question rapid score | CLI (dynamic), lib | REAL | Y | |
| reportShare.ts | Static share bundle with manifest hashes | CLI:score --share | REAL | Y | |
| riskTiers.ts | Risk-tier assessment depth profiles | ORPHAN-barrel | REAL | Y | config only; nothing enforces tiering |
| runAliases.ts | Named aliases for run IDs | CLI, lib | REAL | Y | |
| runner.ts | Core diagnostic engine (evidence→scores→report) | CLI:score/run, studio, 25+ libs | REAL | Y | 2265 lines; central module |
| selfCalibration.ts | Prediction-vs-outcome calibration (ECE/Brier) | ORPHAN-barrel | REAL | Y | overlaps calibration.ts |
| selfModelCalibration.ts | Agent self-prediction accuracy engine | ORPHAN | DEAD | N | zero importers/tests; sha256 labeled "signature" |

### src/lint

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| index.ts | Barrel re-exporting linter API | lib (24 src importers) | REAL | Y | heavily imported barrel |
| lintCli.ts | `amc lint` + `lint rules` commands | CLI:lint | REAL | N | text/json/sarif output |
| linter.ts | Discover + lint .amc YAML configs | CLI, lib | REAL | Y | |
| rules.ts | Rule registry + runner | lib | REAL | Y | |
| rules/index.ts | Barrel of rule modules | ORPHAN-barrel | REAL | Y | resolves same-name imports for lint/index |
| rules/*.ts pattern (9 files) | Individual config lint rules | lib (rules.ts) | REAL | Y | small, honest checks incl. secret regexes |

### src/studio

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| apiDelegation.ts | Auth/rate-limit gate delegating to /api/v1 | studio | REAL | Y | |
| cliBridge.ts | Expose CLI commands as Studio endpoints | studio | REAL | Y | spawn argv, no shell; danger-list confirm |
| connectWizard.ts | Build agent connect instructions + lease | CLI:connect | REAL | Y | |
| onboardingApi.ts | Onboarding status/run endpoints | studio | REAL | N | runs `amc` via cliBridge |
| oneCommandUp.ts | Vault passphrase resolution for `amc up` | CLI:up/start | REAL | N | |
| openapi.ts | OpenAPI 3.0 spec generator + contract check | CLI:openapi-generate | REAL | Y | 2212 lines; spec is hand-maintained, drift risk |
| signatures.ts | Inspect/re-sign workspace config signatures | CLI, lib | REAL | Y | |
| studioServer.ts | Entire Studio HTTP API server | studio (supervisor), lib | REAL | Y | 8879 lines; giant monolith routing all surfaces |
| studioSse.ts | Generic SSE hub for dashboard streams | ORPHAN | DEAD | N | server uses per-domain SSE emitters instead |
| studioState.ts | Studio state/token/path persistence | CLI, studio, lib | REAL | Y | |
| studioSupervisor.ts | Start/stop Studio daemon + subsystem init | CLI:studio/up | REAL | Y | |

### src/leases

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| leaseCarriers.ts | Extract lease token from headers/query | lib (gateway, bridge) | REAL | N | |
| leaseCli.ts | Issue/verify/revoke lease helpers | CLI:lease, studio | REAL | Y | |
| leaseSchema.ts | Zod lease payload/scopes/revocations | lib | REAL | Y | |
| leaseSigner.ts | Ed25519-sign lease tokens | lib | REAL | Y | real crypto (node sign) |
| leaseStore.ts | Signed revocation store | lib | REAL | Y | |
| leaseVerifier.ts | Verify token, scopes, route/model allowlists | lib (10 importers) | REAL | Y | |

### src/packs

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| packCli.ts | `amc pack` install/publish/search commands | CLI:pack, studio | REAL | Y | default registry https://registry.amc.dev (unverified live) |
| packManager.ts | NPM-style install/dependency resolution | lib (packCli) | PARTIAL | Y | no network download; fabricates manifest+integrity for missing packs |
| packRegistry.ts | Filesystem registry storage + local HTTP server | lib (packCli) | REAL | Y | signs tarball digests |
| packRegistryClient.ts | HTTP client for remote registries | ORPHAN | DEAD | N | real fetch code, never imported |
| packTypes.ts | Zod schemas/types for packs | lib | REAL | Y | |

### src/pairing

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| lanMode.ts | Signed LAN-mode config + CIDR checks | CLI, studio, bootstrap | REAL | Y | |
| pairingApi.ts | Pairing cookie set/claim helpers | studio | REAL | N | |
| pairingCodes.ts | One-time codes + signed session tokens | CLI, studio | REAL | Y | hashes codes, Ed25519 tokens |

### src/receipts

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| receipt.ts | Mint/verify signed action receipts | lib (gateway, bridge, ledger) | REAL | Y | core primitive, real crypto |
| receiptChain.ts | Cross-agent delegation receipt chains | ORPHAN (test-only) | PARTIAL | Y | in-memory Map store; never integrated |

### src/targets

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| targetProfile.ts | Signed per-question target level profiles | CLI, studio, lib (20 importers) | REAL | Y | |

#### Findings — B6
- **Dead code cluster (diagnostic):** selfModelCalibration.ts (0 importers, 0 tests), bank/bankSigner.ts + bankVerifier.ts (duplicate bankLoader wrappers), studio/studioSse.ts (server uses per-domain emitters), packs/packRegistryClient.ts (only real remote-registry client, unused).
- **ORPHAN-barrel cluster:** 7 advertised analytics modules (identityStability, knownUnknowns, componentConfidence, selfCalibration, riskTiers, longitudinalTracking, evalReplayCorpusBoundary) reachable only via src/index.ts barrel — no CLI/API/studio path exercises them in product flows.
- **Contradiction:** traceEvidenceMapper.ts header claims it "enables `amc run --auto` to derive scores from REAL runtime data" but nothing in src imports it; auto path uses autoAnswerEngine instead.
- **Duplication:** quickscoreShare.ts vs inline badge logic re-implemented twice in cli.ts (lines ~3243, ~3430); three overlapping calibration modules (calibration.ts, selfCalibration.ts, selfModelCalibration.ts).
- **Facade-ish install:** packManager.fetchPackInfo/simulateInstall fabricate manifest, resolved URL, and integrity hash for packs not present locally — "install" succeeds without downloading anything; default registry registry.amc.dev likely nonexistent.
- **Fake signatures:** identityStability report "signature" is the literal string `identity:<agentId>:<ts>`; selfModelCalibration labels a bare sha256 as signature — neither is verifiable crypto (contrast: leases/receipts use real Ed25519).
- **Files >800 lines:** studioServer.ts (8879), questionBank.ts (5071), questionScoreExplainability.ts (4151), runner.ts (2265), openapi.ts (2212), evidenceDrilldown.ts (1817).
- **receiptChain** delegation chaining exists only against an in-memory Map and its own test — cross-agent accountability is not wired into ledger/gateway despite the receipts primitive being central elsewhere.

---

## B7 — src/shield, agents, auth, drift, vscode, policyPacks, mcp, trust, startup

### src/shield
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| analyzer.ts | Static danger-pattern code scanner | API:shieldRouter / CLI | REAL | Y | regex danger patterns, emits guard events |
| detector.ts | Prompt-injection pattern detector | API:shieldRouter+securityRouter / CLI | REAL | Y | regex attack taxonomy |
| sanitizer.ts | HTML/URI/unicode sanitizer | API:shieldRouter / CLI | REAL | Y | strips scripts, confusables |
| threatIntel.ts | Built-in threat-pattern matcher | API:securityRouter | REAL | Y | 10 static patterns |
| manifest.ts | Skill manifest permission validator | lib (packRegistryClient, hookIntegration) | REAL | Y | dangerous/wildcard perm flags |
| validators/index.ts | Guardrails-style content validators | lib (governor/nlPolicy, score) | REAL | Y | PII/toxicity/injection validators |
| advancedThreats.ts | Compound/TOCTOU/corrigibility analysis | lib+API:shieldRouter | REAL | Y | 616 lines |
| dynamicAttackGenerator.ts | Attack synthesis engine | API:shieldRouter, lib | PARTIAL | Y | template+Math.random, not the "ML-powered" it claims |
| continuousRedTeam.ts | Evolutionary adversarial daemon | API:shieldRouter / CLI | REAL | Y | 611 lines, evolutionary loop |
| exploitConfirmation.ts | Signed exploit repro receipts | API:shieldRouter / CLI | REAL | Y | 658 lines, safe-mode replay |
| shieldGuardOrchestrator.ts | Unified runtime protection engine | lib (trustPipeline) | REAL | Y | 686 lines |
| guardEngine.ts | Target-profile runtime gate | lib (orchestrator), barrel | REAL | Y | maps AMC target thresholds |
| trustPipeline.ts | End-to-end trust chain orchestration | API:shieldRouter, lib | REAL | Y | shield→formal→zk→token, hash-chained |
| runtimeAnalyzer.ts | Runtime-action analysis wrapper | CLI | REAL | Y | wraps trustPipeline |
| mcpSecurityAnalyzer.ts | MCP server security scanner | lib+CLI:mcpAnalyzeCli | REAL | Y | 526 lines, L0–L5 scoring |
| mcpTrustLedger.ts | Signed hash-chained MCP inventory | lib (posture)+CLI | REAL | Y | receipt over mcpSecurityAnalyzer |
| agentConfigScanner.ts | Agent-config security scanner | lib (posture)+CLI | REAL | Y | CLAUDE.md/settings/hooks scan |
| posture.ts | One-command posture scorecard | CLI:postureCli | REAL | Y | composes config+mcp+env dims |
| postureCli/mcpAnalyzeCli/mcpLedgerCli/agentConfigScanCli.ts | CLI wrappers (4 files) | CLI | REAL | Y | thin renderers, all wired in cli.ts |
| conversationIntegrity.ts | Hash-chain turn verification | ORPHAN-barrel | STUB | Y | never populates tamperedTurns; always valid |
| S-module family (9 files) | Deterministic S-checks | ORPHAN-barrel | REAL | Y | behavioralSandbox, sbom, reputation, attachmentDetonation, downloadQuarantine, uiFingerprint, registry, ingress, oauthScope |
| signing.ts | ed25519 skill signing | ORPHAN | REAL | Y | no importer, not in barrel |
| stubs.ts | Thin duplicate S-checks | ORPHAN | DEAD | N | no importer; duplicates manifest/registry/ingress/sanitizer/detector |
| index.ts | Shield barrel | lib (SDK) | REAL | - | re-export barrel |

### src/agents
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| agentBase.ts | Abstract governed-agent base | lib (bots) | REAL | N | base class |
| contentModerationBot.ts | Keyword/pattern moderation | CLI | REAL | Y | Math.random confidence jitter |
| dataPipelineBot.ts | ETL transform runner | CLI | REAL | Y | real transforms |
| legalContractBot.ts | Regex clause extraction | CLI | REAL | Y | risk scoring |
| harnessRunner.ts | Maturity probe/improvement loop | CLI | REAL | Y | real introspection, 485 lines |
| metricTemplates.ts | Reusable metric library | lib (simAgent, eval, hallucination) | REAL | Y | 672 lines |
| traceIngestion.ts | Production trace ingest+score | lib (importers, watch) | REAL | Y | 299 lines |
| customerSupportBot.ts | Multi-channel support agent | ORPHAN-barrel | REAL | Y | 435 lines, stateful |
| simAgent.ts | Multi-turn persona simulation | ORPHAN-barrel | REAL | Y | 564 lines, drives real agent |
| llmJudge.ts | LLM-as-judge evaluator | ORPHAN-barrel | REAL | Y | real fetch mode + simulated fallback |
| runHistory.ts | Run persistence/AB/regression | ORPHAN-barrel | REAL | Y | 558 lines |
| monitor.ts | Production monitor + alerts | ORPHAN-barrel | REAL | Y | metric-window trends |
| sessionEval.ts | Session/path-level eval | ORPHAN-barrel | REAL | Y | 557 lines |
| autoTestGen.ts | Testcase gen from failures | ORPHAN-barrel | REAL | Y | 523 lines |
| playground.ts | Prompt A/B comparison | ORPHAN-barrel | FACADE | Y | simulateAgentResponse: synthetic output, no model call |
| index.ts | Agents barrel | lib (SDK) | REAL | - | re-export barrel |

### src/auth
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| authApi.ts | Session/user HTTP auth API | lib+studio+API | REAL | Y | 513 lines, signed users file |
| authCli.ts | User admin CLI | CLI | REAL | N | wired in cli.ts |
| apiKeyManager.ts | API key issue/rotate/revoke | lib (apiKeyCli/apiCli) | REAL | Y | hashed keys |
| apiKeyCli.ts | API key CLI | API:apiCli | REAL | Y | - |
| passwordHash.ts | scrypt password hashing | lib (authApi) | REAL | N | timingSafeEqual |
| sessionTokens.ts | Signed session cookies | lib (studio, identity, pairing) | REAL | Y | - |
| userSchema.ts | User record zod schema | lib (authApi) | REAL | N | - |
| roles.ts | Role constants/parsers | lib (approvals, audit, studio) | REAL | Y | widely used |
| rbac.ts | Role-check helpers | studio | REAL | Y | - |
| humanLog.ts | Tamper-evident human-action log | studio | REAL | N | hash-chained, signed |
| ssoConfig.ts | SAML/OIDC config schema | lib (scimAdapter)+barrel | REAL | Y | config only |
| enterpriseIam.ts | SSO/RBAC/audit IAM engine | ORPHAN-barrel | REAL | Y | 415 lines; only SDK barrel reaches it |

### src/drift
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| driftDetector.ts | Between-run drift check | lib (dashboard, watch)+API:driftRouter | REAL | Y | - |
| driftCli.ts | Drift check CLI | CLI+API:driftRouter | REAL | Y | - |
| driftReport.ts | Markdown drift report | lib (driftCli) | REAL | Y | - |
| driftRules.ts | Drift-rule evaluation | lib (driftDetector) | REAL | N | - |
| alerts.ts | Signed alert dispatch (webhooks) | lib+CLI+API (widely) | REAL | Y | real http(s) POST |
| freezeEngine.ts | Freeze-incident engine | lib (governor, org, fleet, +10) | REAL | N | signed incidents |
| continuousMonitor.ts | Real-time continuous drift monitor | ORPHAN-barrel | REAL | Y | 744 lines; only SDK barrel, tested 52× |
| bishengObservabilityLiveDrift.ts | Extract drift statistic adapter | ORPHAN | DEAD | Y | 12-line re-wrap of watch/ module, no importer |

### src/vscode
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| extensionScaffold.ts | VS Code extension scaffold builder | ORPHAN-barrel | REAL | Y | dir root; nothing imports it |
| patternCatalog.ts | AMC anti-pattern rule catalog | ORPHAN-barrel | REAL | N | data |
| patternScanner.ts | Scan source for AMC patterns | ORPHAN-barrel | REAL | Y | - |
| inlineScore.ts | Derive inline score annotations | ORPHAN-barrel | REAL | N | - |
| quickFixes.ts | Quick-fix suggestions | ORPHAN-barrel | REAL | N | - |
| types.ts | Shared vscode types | ORPHAN-barrel | REAL | N | - |
| index.ts | vscode barrel | ORPHAN | DEAD | N | not in src/index.ts, no external importer |

### src/policyPacks
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| builtInPacks.ts | Built-in policy pack definitions | lib (plugins, marketplace, enforce) | REAL | Y | - |
| packSchema.ts | Policy pack zod schema | lib (builtInPacks, pluginLoader) | REAL | N | - |
| packApply.ts | Apply pack to workspace | lib (packCli) | REAL | Y | - |
| packDiff.ts | Diff pack vs current | lib (packCli) | REAL | Y | - |
| packCli.ts | Policy pack CLI | CLI+studio+API:complianceRouter | REAL | Y | - |

### src/mcp
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| amcMcpServer.ts | AMC MCP server (tools/resources) | mcp / lib (mcpCli) | REAL | Y | 744 lines, real MCP SDK |
| mcpCli.ts | MCP server CLI registration | CLI (cli.ts, late-stage) | REAL | Y | - |
| mcpServerRiskAttestation.ts | Signed MCP risk attestation | ORPHAN | REAL | Y | 518 lines; no src importer, tested only |

### src/trust
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| trustConfig.ts | Notary trust config/signing | lib (crypto, diagnostic, workspace)+CLI | REAL | Y | 453 lines, widely used |
| temporalDecay.ts | Trust half-life decay scoring | CLI+API:scoreRouter | REAL | Y | exponential decay |

### src/startup
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| startupGuidance.ts | Startup readiness guidance plan | CLI | REAL | Y | reads quickScore questions |

#### Findings — B7
- Large orphan cluster in **src/agents**: 8 of 16 modules (customerSupportBot, simAgent, llmJudge, runHistory, monitor, sessionEval, autoTestGen, playground) reachable only through the SDK `agents/index.js` barrel — no internal product consumer, though all are tested.
- **playground.ts is a FACADE**: `simulateAgentResponse` returns Math.random-based synthetic output/latency/tokens presented as model comparison; no real model call.
- **Entire src/vscode dir is effectively DEAD**: not exported by src/index.ts and not imported by any cli/api/studio; `extensionScaffold` ties the files together but nothing imports it. `vscode/index.ts` barrel has zero importers.
- **Dead/duplicated shield code**: `shield/stubs.ts` (no importer; thin duplicates of manifest/registry/ingress/sanitizer/detector/oauthScope) and `shield/signing.ts` (no importer, not in barrel). `drift/bishengObservabilityLiveDrift.ts` is a 12-line re-wrap of `watch/bishengObservabilityLiveDrift.ts` with no importer.
- **STUB**: `shield/conversationIntegrity.ts` builds a hash chain but never populates `tamperedTurns` — always returns `valid:true`, so tamper detection does nothing.
- **Overstated capability**: `dynamicAttackGenerator.ts` header claims "ML-powered attack synthesis like Promptfoo / replaces static pattern matching," but generation is template + `Math.random` shuffle (only `generationMethod:'template'`).
- Files >800 lines: none in bucket; largest are `mcp/amcMcpServer.ts` and `drift/continuousMonitor.ts` at 744.
- **enterpriseIam.ts** (415-line SSO/RBAC/audit engine, flagged "#1 blocker" in comments) and **mcpServerRiskAttestation.ts** (518 lines) are both fully built but only barrel-/test-reachable — no runtime wiring into CLI, API, or studio.

---

All utils are REAL, heavily used lib helpers. I have enough to compile the ledger.

## B8 — SDK / Redteam / Toolhub / Experiments / Utils / Simulator / Gateway / Tuning / Snapshot

### src/sdk
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| amcClient.ts | Bridge HTTP client, all providers | ORPHAN-barrel | REAL | Y | public SDK entrypoint, self-scoring guard |
| amcAgent.ts | Agent wrapper over client+integrations | ORPHAN-barrel | REAL | Y | thin facade over integrations |
| amcEvidence.ts | Secret redaction + sha256 hashing | lib (amcClient) | REAL | N | — |
| amcGuards.ts | Blocks self-scoring payloads, URL check | lib (amcClient/mobileFetch) | REAL | N | — |
| amcSpan.ts | Span timing wrapper | lib (amcAgent) | REAL | N | — |
| amcTelemetry.ts | POST /bridge/telemetry | lib (amcClient/amcAgent) | REAL | N | — |
| autoInstrument.ts | One-line framework auto-patch | ORPHAN | DEAD | N | 951 lines, no importer/barrel/test |
| errors.ts | AMCSDKError type | lib (sdk-wide) | REAL | Y | — |
| frameworkAdapters.ts | LangChain/CrewAI session trackers | ORPHAN-barrel | REAL | Y | consumes external events, no model call |
| index.ts | SDK barrel | lib (src/index) | REAL | Y | omits autoInstrument |
| mobileFetch.ts | React-Native fetch bridge | ORPHAN-barrel | REAL | Y | strips provider auth headers |
| pythonSdkGenerator.ts | Packages python/ dir for pip | CLI:sdk python | REAL | Y | reads real python source files |
| versioning.ts | SDK version + deprecated route policy | API:api/index.ts | REAL | Y | — |
| integrations/*.ts (7 files) | Proxy openai/anthropic/gemini/vercel/langchain/langgraph/agents to bridge | lib (amcAgent) | REAL | partial | openai tested; others N |
| go/* (5 files) | Standalone Go SDK client+middleware | ORPHAN (no TS ref) | REAL | Y | go test + sdkConsolidationDocs |
| python/* (8 files) | Standalone Python SDK client+middleware | CLI (via generator) | REAL | Y | pytest + pythonSdk.test |

### src/redteam
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| runner.ts | Runs attack packs, scores vulns | CLI:redteam / ci/redteamGate | FACADE | Y | syntheticResponse() canned, no real agent (634 ln) |
| mcpAgentProvider.ts | Evil-MCP agent-provider attacks | CLI:redteam --evil-mcp | FACADE | Y | syntheticAgentResponse models cautious agent (1098 ln) |
| attackPlugins.ts | 5 attack plugin simulations | CLI:attack | FACADE | Y | CLI passes hardcoded synthetic respondFn |
| strategies.ts | Prompt-transform strategies | lib (runner)/CLI | REAL | Y | real string transforms |
| exploitLedger.ts | Signed exploit disposition ledger | ORPHAN-barrel | REAL | Y | crypto-signed receipts |
| adversarialGenerator.ts | Generates adversarial sample templates | ORPHAN-barrel | REAL | Y | static template generation |
| multilingualAttacks.ts | Non-English attack corpus | ORPHAN-barrel | REAL | Y | static corpus |
| promptInjectionRegressionSuite.ts | Signed PI regression receipts | ORPHAN-barrel | REAL | Y | scores caller-supplied results |
| perturbation.ts | Leetspeak/homoglyph mutators | lib (modelSpecificAttacks) | REAL | Y | — |
| modelSpecificAttacks.ts | Per-model attack pack generator | ORPHAN | REAL | Y | static generation |
| index.ts | Redteam barrel | CLI (runRedTeam only) | REAL | Y | re-exports unused jailbreak/mcp |
| jailbreak/attacks.ts | Jailbreak attack library | ORPHAN-barrel | REAL | Y | static |
| jailbreak/detector.ts | Regex/heuristic jailbreak verdict | ORPHAN-barrel | REAL | Y | refusal-pattern matching |
| jailbreak/normalizer.ts | Obfuscation normalizer | ORPHAN-barrel | REAL | Y | — |
| jailbreak/runner.ts | Runs jailbreak tests | ORPHAN-barrel | PARTIAL | Y | default synthetic respondFn |
| jailbreak/tap.ts | Tree-of-Attacks-w-Pruning | ORPHAN-barrel | FACADE | Y | default syntheticResponse (522 ln) |
| jailbreak/index.ts | Jailbreak barrel | ORPHAN-barrel | REAL | Y | reachable only via unused re-export |

### src/toolhub
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| toolhubServer.ts | ToolHub intent/execute engine | studio (ToolHubService) | REAL | Y | governor+ledger+executors (1260 ln) |
| toolhubValidators.ts | Signed tools.json load/validate | lib (workspace/studio/CLI) | REAL | Y | — |
| toolhubCli.ts | ToolHub config CLI helpers | CLI | REAL | Y | — |
| toolContext.ts | Tool context projection | lib (cgxBuilder/server) | REAL | Y | — |
| toolsSchema.ts | Tool definition schema | lib (validators/policyPacks) | REAL | Y | — |
| toolhubReceipts.ts | Tool evidence receipts | lib (toolhubServer) | REAL | Y | reuses gateway redaction |
| blastRadiusConsent.ts | Blast-radius consent records | lib (toolhubServer) | REAL | Y | 368 lines |
| leastPrivilegeGrants.ts | Signed least-privilege grants | ORPHAN | REAL | Y | no src importer (362 ln) |
| toolSchemaContracts.ts | Signed pre/post tool contracts | ORPHAN | REAL | Y | no src importer (487 ln) |
| toolhubClient.ts | HTTP client w/ circuit breaker | ORPHAN | REAL | N | no importer anywhere |
| toolhubExecutors/*.ts (4 files) | Real fs/git/http/process exec w/ simulate | lib (toolhubServer) | REAL | N | — |

### src/experiments
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| experimentRunner.ts | A/B casebook experiment | CLI (experimentCli)/score | FACADE | N | candidate outcomes fabricated via jitter (461 ln) |
| architectureExperiment.ts | Architecture probe experiment | CLI/src/index | FACADE | Y | default probe runner is LCG random (786 ln) |
| experimentCli.ts | Experiment CLI wiring | CLI/studio | REAL | N | — |
| experimentSchema.ts | Experiment/gate types | CLI | REAL | N | types only |
| experimentGatePolicy.ts | Gate presets strict/balanced | CLI | REAL | Y | — |
| experimentAnalysis.ts | Release-readiness check | ORPHAN | DEAD | N | unreferenced + untested |
| governedOptimizer.ts | Optimizer run ledger, leakage guard | CLI (read only) | PARTIAL | Y | writer path unused (558 ln) |
| stats.ts | Bootstrap CI, effect size | lib (architectureExperiment) | REAL | N | — |

### src/utils
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| errors.ts | Error helpers | lib | REAL | Y | — |
| fs.ts | Atomic write, ensureDir | lib (304 importers) | REAL | Y | — |
| hash.ts | sha256Hex | lib (336 importers) | REAL | Y | — |
| json.ts | canonicalize (sorted JSON) | lib (219 importers) | REAL | Y | — |
| providerKeys.ts | Strip provider API keys from env | lib | REAL | Y | — |
| time.ts | Time helpers | lib | REAL | Y | — |
| typeGuards.ts | Type-safe includes() | lib | REAL | Y | 7 lines |

### src/simulator
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| targetWhatIf.ts | Target/equalizer what-if | CLI:whatif / studio | REAL | N | 220 lines |
| whatIfCli.ts | What-if CLI parse helpers | CLI:whatif | REAL | N | — |
| ciGateWhatIf.ts | CI gate what-if | API:ciRouter | REAL | Y | — |
| budgetsWhatIf.ts | Budget what-if | ORPHAN-barrel | REAL | N | — |
| governorWhatIf.ts | Governor what-if | ORPHAN-barrel | REAL | N | — |

### src/gateway
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| server.ts | LLM proxy + CONNECT + ledger | CLI:up/gateway | REAL | Y | real http/https/net proxy (1831 ln) |
| config.ts | Signed gateway config load | lib (studio/bootstrap/CLI) | REAL | Y | 490 lines |
| redaction.ts | Redact body/headers | lib (server/toolhubReceipts) | REAL | N | — |

### src/tuning
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| tuneWizard.ts | Interactive tuning wizard | CLI | REAL | N | inquirer-driven |
| upgradeEngine.ts | Generate upgrade plan | lib (tuneWizard) | REAL | N | — |

### src/snapshot
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| snapshot.ts | Build agent maturity snapshot | CLI / loop | REAL | Y | reads real run/assurance data |

#### Findings — B8
- **Systemic redteam facade**: `runner.ts`, `mcpAgentProvider.ts`, `attackPlugins.ts` (and `jailbreak/tap.ts`, `jailbreak/runner.ts` defaults) never call a real agent — all use hardcoded `syntheticResponse`/`syntheticAgentResponse` that always safely refuse, so every "no vulnerabilities" report is preordained. CLI `amc attack` even hardcodes the synthetic respondFn.
- **Experiment facades**: `experimentRunner.runExperiment` fabricates candidate A/B outcomes from baseline ± jitter (candidate config never executed); `architectureExperiment` default probe runner is an LCG PRNG producing synthetic scores/tokens/latency.
- **Dead code**: `sdk/autoInstrument.ts` (951 lines, no importer/barrel/test) and `experiments/experimentAnalysis.ts` (unreferenced, untested) are dead.
- **Orphan cluster (unwired but real+tested)**: toolhub `leastPrivilegeGrants`, `toolSchemaContracts`, `toolhubClient`; redteam `exploitLedger`, `adversarialGenerator`, `multilingualAttacks`, `promptInjectionRegressionSuite`, `modelSpecificAttacks`, entire `jailbreak/` subtree; simulator `budgetsWhatIf`, `governorWhatIf` — reachable only via barrels/tests, no product consumer.
- **SDK reachable only via barrels**: the whole TS SDK surface (`amcClient`, `amcAgent`, integrations, `mobileFetch`, `frameworkAdapters`) is ORPHAN-barrel — legitimate as a published external SDK, but not consumed internally; only `versioning` (API) and `pythonSdkGenerator` (CLI) are wired into the product.
- **Files >800 lines**: `gateway/server.ts` (1831), `toolhub/toolhubServer.ts` (1260), `redteam/mcpAgentProvider.ts` (1098), `sdk/autoInstrument.ts` (951, dead), `experiments/architectureExperiment.ts` (786 near-cap).
- **Doc contradiction**: comments in `mcpAgentProvider`/`architectureExperiment` admit "in a real deployment this would connect to an actual agent/model," confirming the synthetic engines are placeholders, not the advertised red-team/experiment execution.
- **Real & wired backbone**: gateway (server/config/redaction), toolhub server+validators+executors, snapshot, tuning, and all `utils/*` are genuine implementations backing live CLI/studio/API paths.

---

## B9 — watch, org, domainProof, lab, correlation, evidence, budgets, bundles, sandbox

### src/watch

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| index.ts | barrel re-exporting all watch modules | CLI:watch + lib (src/index) | REAL | N | 433-line barrel; sole wiring for most drift modules |
| liveDriftAlerts.ts | drift statistics engine over supplied sample rows | API:scoreRouter/watchRouter/shieldRouter | REAL | Y | 15,979 lines; pure stats, "live" data supplied by caller |
| vendor LiveDrift wrappers (19 files: agentReadingTest, aiReputationClaude, awesomeAgentMemory, bisheng, braintrust, ctfAgentBenchmark, darwinGodelMachine, decibenchVoice, garage, llmFighter, lmnr, narrowTaskBroadMisalignment, openCompass, paperReadSkill, ragTextGeneration, railScore, reflexionAgent, skillMatch, trismAgentic) | vendor-flavored wrappers around liveDriftAlerts with hash "proofs" | ORPHAN-barrel | REAL | Y | ~8,300 lines; no runner calls any; no vendor integration, caller supplies rows |
| provider drift shims (7 files: helm, humanloop, inspect, patronus, promptLayer, promptfoo, tensorZero) | re-export shims to src/benchmarks modules | ORPHAN-barrel | DEAD | N | routers import ../benchmarks directly; shims bypassed |
| providerDriftAlerts.ts | 4-line shim to benchmarks/providerDriftBenchmark | ORPHAN-barrel | DEAD | N | duplicate export path |
| continuousMonitor.ts | interval-based scoring/drift/anomaly monitor | CLI:watch (cli-watch-commands) | REAL | Y | runs real runDiagnostic on timers |
| dashboardFeed.ts | in-memory metrics feed for dashboards | CLI:watch | REAL | Y | EventEmitter buffer only |
| observabilityBridge.ts | normalize traces from Langfuse/OTLP/Datadog/webhooks | CLI:observe + lib (sdk, studio, integrations) | REAL | Y | 1,157 lines; real HTTP polling adapters |
| realtimeAssurance.ts | evaluate live traces against assurance checks | CLI (cli-late-stage-commands) + studio types | REAL | Y | 708 lines |
| behavioralProfiler.ts | online behavioral anomaly profiling | CLI + API:watchRouter | REAL | Y | statistical, no ML despite "ML-Powered" header |
| traceFailureIndex.ts | cluster trace failures into signed index | lib (importers, lifecycle, mechanic) | REAL | Y | — |
| hookActionLifecycle.ts | verify hook action evidence lifecycle | lib (adapters, setup) | REAL | Y | — |
| hookHealthDiagnostics.ts | hook installation/event health checks | lib (adapters) | REAL | Y | — |
| overrideNearMissAnalytics.ts | override/near-miss trend receipts | ORPHAN-barrel | REAL | Y | computation only, nothing calls it |
| hostHardening.ts | host hardening posture checks | CLI | PARTIAL | Y | only 4 local process checks |
| safetyTestkit.ts | OWASP LLM Top-10 refusal scenarios | ORPHAN-barrel | FACADE | Y | default responder auto-refuses; passes all tests without an agent |
| outputAttestation.ts | hash + timestamp agent output | ORPHAN-barrel | PARTIAL | Y | `signed: true` hardcoded; no signature exists |
| siemExporter.ts | CEF/LEEF/Splunk/ECS event formatting | ORPHAN-barrel | REAL | Y | formats only; no transport to any SIEM |
| policyPacks.ts | static policy pack registry | ORPHAN-barrel | PARTIAL | Y | applyPolicyPack returns `applied:true`, enforces nothing; distinct from src/policyPacks |
| agentBus.ts | in-memory inter-agent message bus | ORPHAN-barrel | PARTIAL | Y | sha256 labeled "signature" is not cryptographic |
| multiTenantVerifier.ts | tenant/namespace prefix checks | ORPHAN-barrel | REAL | Y | trivial string comparisons |
| explainabilityPacket.ts | hash-digested claim packets | ORPHAN-barrel | REAL | Y | — |
| evidenceRefs.ts | evidence-ref normalization helpers | lib (watch drift modules) | REAL | N | — |
| evidenceDrilldown.ts | build watch explain-packet links | ORPHAN | DEAD | Y | zero importers; name collides with diagnostic/evidenceDrilldown |

### src/org

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| orgEngine.ts | weighted org scorecard computation | studio + lib (transformation, score) | REAL | Y | aggregates real diagnostic runs |
| orgRun.ts | multi-role org run orchestrator | CLI:org + API:orgRunRouter + studio | FACADE | Y | writes "synthetic" DiagnosticReports: integrityIndex 1, confidence 0.94 hardcoded |
| orgStore.ts | org config persistence + signing | CLI + studio + lib (bootstrap, forecast) | REAL | Y | — |
| orgSigner.ts | file signing/verification with auditor keys | lib (forecast, cgx, bench, mechanic) | REAL | Y | widely reused crypto utility |
| orgScorecard.ts | scorecard persistence/comparison | studio + lib (bench, audit) | REAL | Y | — |
| orgSse.ts | typed SSE event hub | studio + lib (cgx, bench, mechanic) | REAL | Y | — |
| orgSchema.ts | zod schemas for org graph/scorecards | lib (forecast, assurance, prompt) | REAL | N | — |
| orgCli.ts | CLI wrappers for org operations | CLI:org | REAL | Y | — |
| orgAggregation.ts | weighted mean/median/percentile math | lib (orgEngine) | REAL | N | — |
| orgValidator.ts | org graph cycle/parent validation | lib (orgStore) | REAL | N | — |
| orgReports.ts | markdown report renderers | studio | REAL | N | — |
| orgCommitments.ts | commitment/education/ownership plans | studio | REAL | N | ledger-audited |
| orgApi.ts | status/node payload composition helpers | ORPHAN | DEAD | N | no importer anywhere; studio calls pieces directly |
| communityGovernance.ts | platform governance dimension scoring | CLI:community | REAL | Y | — |

### src/domainProof

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| domainProofCheck.ts | rule-based proof check (toy governance) | API:domainProofRouter + CLI | REAL | Y | only 3 toy age/residency rules; honest non-claim text |
| domainProofArtifact.ts | proof artifact schema + hashing | lib (standard) | REAL | Y | — |
| domainProofSchema.ts | proof class/status schemas | lib (truthguard) | REAL | Y | — |
| domainProofApiRequest.ts | API request validation, legacy path guard | API:domainProofRouter | REAL | Y | — |
| sourceRuleManifestSchema.ts | source-rule manifest schema/verify | lib | REAL | Y | — |
| toyGovernanceRules.ts | embedded toy rule fixture | lib (domainProofCheck) | REAL | Y | explicitly fixture-only |
| domainProofCli.ts | CLI wrapper | CLI:domain-proof | REAL | Y | — |
| index.ts | barrel | ORPHAN-barrel | REAL | N | — |

### src/lab

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| cognitionLab.ts | experiment templates + simulateExperiment | CLI:lab | PARTIAL | Y | simulateExperiment fabricates results; tagged `simulated:true` |
| packs/toctouPack.ts | TOCTOU vulnerability "test" | CLI + API:assuranceRouter | FACADE | Y | agentId ignored; evaluates hardcoded canned responses |
| packs/compoundThreatPack.ts | compound threat "detection" | CLI + API:securityRouter/assuranceRouter | FACADE | Y | canned responses; result identical every run |
| packs/shutdownCompliancePack.ts | shutdown compliance "test" | CLI + API:assuranceRouter | FACADE | Y | canned compliant responses; always passes |
| packs/advancedThreatsPack.ts | advanced threat scenario "test" | CLI + API:securityRouter/assuranceRouter | FACADE | Y | same pattern; agent never invoked |
| packs/taskDecompositionPack.ts | decomposition-attack detection simulation | ORPHAN-barrel | FACADE | N | "Simulate detection" from module list only |
| packs/index.ts | pack barrel | ORPHAN-barrel | REAL | N | callers deep-import instead |
| index.ts | 3-line barrel | ORPHAN | DEAD | N | no importers |

### src/correlation

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| correlate.ts | verify trace receipts against evidence | lib (diagnostic/runner) | REAL | Y | real signature verification |
| correlationAudits.ts | persist issues to ledger | lib (diagnostic/runner) | REAL | N | — |
| correlationReport.ts | warning strings from metrics | lib (diagnostic/runner) | REAL | Y | — |
| traceSchema.ts | AMC trace v1 zod schema/parser | lib (importers, runtime, ops, watch) | REAL | N | — |

### src/evidence

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| exporter.ts | export ledger evidence json/csv/pdf | CLI:evidence | REAL | Y | PDF is minimal hand-rolled text PDF |
| auditPacket.ts | zip audit packet with signature | CLI:evidence | REAL | Y | — |
| zip.ts | dependency-free ZIP writer with CRC32 | lib (auditPacket, bundles?) | REAL | Y | — |
| index.ts | barrel | CLI (via cli.ts import) | REAL | N | — |

### src/budgets

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| budgets.ts | signed budget config + usage evaluation | CLI + studio + lib (25+ importers) | REAL | Y | one of the most-wired modules in repo |

### src/bundles

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| bundle.ts | export/verify/diff signed evidence bundles | CLI + studio + lib (ci, assurance) | REAL | Y | 1,159 lines, >800-line threshold |

### src/sandbox

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| sandbox.ts | run commands in docker with gateway routing | CLI:sandbox + lib (adapters) | REAL | Y | real docker spawn; ledger-wrapped |

#### Findings — B9
- **Facade assurance packs are wired to CLI and API**: all four lab/packs called from cli.ts, api/securityRouter, api/assuranceRouter evaluate hardcoded canned agent responses — "security test" results are predetermined and identical every run; agentId is never used.
- **~8,700 orphan lines in watch**: 19 vendor LiveDrift wrappers plus overrideNearMissAnalytics are reachable only via the index.ts barrel; no CLI/API/studio path invokes them; even the src/drift and src/score bisheng shims are themselves orphaned.
- **orgRun.ts fabricates diagnostics**: writes "synthetic" DiagnosticReports into the runs dir with hardcoded integrityIndex 1, confidence 0.94, evidenceTrustCoverage observed:1 — indistinguishable from real runs downstream.
- **Duplicate provider-drift layer**: 8 watch shim files re-export src/benchmarks modules, but all routers import benchmarks directly — the shims are dead weight.
- **liveDriftAlerts.ts is 15,979 lines** (20x the 800-line rule) and bundle.ts, observabilityBridge.ts, orgRun.ts also exceed 800.
- Dead files: watch/evidenceDrilldown.ts (zero importers, name-collides with diagnostic/evidenceDrilldown), org/orgApi.ts, lab/index.ts.
- Overclaiming labels: outputAttestation hardcodes `signed:true` with no signature; agentBus calls a plain sha256 a "signature"; behavioralProfiler claims "ML-powered" but is z-score statistics; watch "live drift" modules never contact the named vendors.
- Solid core: budgets, bundles, sandbox, correlation, evidence, and most of org are real, cross-wired, and tested; org report/commitment/aggregation/validator helpers lack direct tests.

---

## B10 — adapters/steer/claims/config/outcomes/casebooks/guide/brand/cli/providers

### src/adapters
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| adapterCli.ts | CLI facade: init/list/detect/configure/run adapters | CLI:amc adapters + API:adaptersRouter.ts | REAL | Y | thin delegation layer |
| adapterTypes.ts | zod schemas for adapter definitions | lib (pluginLoader, passport) | REAL | Y | schema source of truth |
| adapterCapabilities.ts | builds capability declarations for builtins | lib (builtins/*) | REAL | Y | embeds evidenceRefs to test files |
| adapterConfigSchema.ts | zod schema for .amc/adapters.yaml | lib (adapterConfigStore) | REAL | Y | — |
| adapterConfigStore.ts | load/save/sign adapters.yaml | lib (bootstrap, studio, onboarding) | REAL | Y | auditor-signed config |
| adapterDetection.ts | probe installed CLI binaries for version | lib (adapterCli, passport) | REAL | N | spawnSync probes, cached |
| adapterDoctor.ts | wraps detect into doctor rows | ORPHAN | DEAD | N | zero importers anywhere |
| adapterRunner.ts | spawn adapter process with lease env | lib (adapterCli via runAdapterCommand) | REAL | N | leases, budgets, sandbox, redaction |
| adapterStandardization.ts | legacy capability-tier comparison projection | ORPHAN-barrel (index.ts only) | REAL | Y | self-described backward-compat shim |
| catalog.ts | merge builtins + plugin adapters | lib (adapterCli, passport) | REAL | N | — |
| registry.ts | authoritative builtin adapter registry | lib (connectWizard, plugins, fleet) | REAL | Y | — |
| envAssembler.ts | template env vars, strip provider keys | lib (adapterCli, adapterRunner) | REAL | Y | secret redaction helper |
| hookIntegration.ts | install/verify Claude/Gemini lifecycle hooks | CLI:amc connect hooks | REAL | Y | 1952 lines, >800 cap |
| hookIntegrationCli.ts | commander registration for hooks commands | CLI:cli.ts | REAL | Y | — |
| builtins/* pattern (15 files) | static AdapterDefinition per framework | lib (registry.ts) | REAL | N | homogeneous 40-51 line data files |
| snippets/nodeFetch.ts, pythonRequests.ts (2 files) | generated integration code snippets | lib (adapterRunner) | REAL | N | string templates only |

### src/steer
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| types.ts | SteerStage/pipeline type contracts | lib (wrapFetch) | REAL | Y | — |
| pipeline.ts | sequential stage runner factory | lib (types via wrapFetch) | REAL | Y | createSteerPipeline never called in src |
| autotune.ts | regex context classifier → param profiles | ORPHAN-barrel | REAL | Y | regex heuristics, no LLM |
| feedbackLoop.ts | EMA thumbs-up/down profile adjustment | ORPHAN-barrel | REAL | Y | — |
| hygiene.ts | strip hedges/preambles from responses | ORPHAN-barrel | REAL | Y | — |
| harmClassifier.ts | 12-domain regex harm classifier | ORPHAN-barrel | REAL | Y | LLM fallback described, not implemented |
| microScore.ts | zero-LLM 5-dimension response scoring | lib (race.ts) | REAL | Y | — |
| race.ts | fan-out N models, pick best | lib (wrapFetch) | REAL | Y | — |
| liquid.ts | SSE streaming transform + buffering | lib (wrapFetch) | REAL | Y | — |
| parameterMatrix.ts | cartesian param stress-test builder | ORPHAN-barrel | REAL | Y | offline eval only |
| privacyTiers.ts | telemetry sanitization by tier | lib (traceLogger) | REAL | Y | — |
| thermostatCLI.ts | `amc steer` commands + Studio panels | ORPHAN (tests only) | FACADE | Y | amc steer never registered; stub echo handlers |
| index.ts | barrel | lib (wrapFetch types) | REAL | N | not exported from package entry |
| research/eval_* pattern (4 files) | labeled corpora + F1/calibration evals | ORPHAN (tests only) | REAL | Y | genuine stats, no prod caller |
| research/index.ts | research barrel | ORPHAN-barrel | REAL | N | — |

### src/claims
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| claimTypes.ts | claim/provenance/lifecycle types | lib (types.ts) | REAL | Y | — |
| claimStore.ts | SQLite append-only claim persistence | lib (wired claims modules) | REAL | Y | — |
| claimFactory.ts | QuestionScore → signed Claim | ORPHAN-barrel | REAL | N | never called outside barrel |
| claimLifecycle.ts | state-machine transitions with hash chain | ORPHAN-barrel | REAL | Y | only orphaned barrel exports it |
| claimVerify.ts | signature/hash-chain verification | ORPHAN-barrel | REAL | N | unused verifier |
| claimConfidence.ts | citation-backed per-claim confidence | CLI:cli.ts (dynamic) | REAL | Y | — |
| claimExpiry.ts | TTL-based append-only expiry sweep | CLI:amc claims stale/sweep | REAL | Y | name-clashes with score/claimExpiry.ts |
| confidenceDrift.ts | per-question confidence time series | CLI:cli.ts (dynamic) | REAL | N | duplicate concept of score/confidenceDrift.ts |
| contradictions.ts | claim-vs-claim conflict detection | ORPHAN-barrel | REAL | N | unused detector |
| governanceLineage.ts | claim→transparency-log→policy audit trail | CLI:cli.ts + lib(index) | REAL | Y | 942 lines, >800 cap |
| promotionGate.ts | evidence thresholds for promotion | lib (claimLifecycle — itself orphan) | REAL | Y | dead-end chain |
| quarantine.ts | signed quarantine policy YAML | lib (claimLifecycle chain) | REAL | N | dead-end chain |
| index.ts | barrel | ORPHAN (no importer) | DEAD | N | nothing imports claims barrel |

### src/config
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| amcConfigSchema.ts | zod schema for amcconfig.yaml | lib (loader/runner only) | REAL | Y | orphan cluster member |
| amcConfigLoader.ts | discover/load/resolve amcconfig.yaml | ORPHAN (tests only) | REAL | Y | orphan cluster member |
| amcConfigRunner.ts | run diagnostics+assurance from yaml | ORPHAN (no tests) | REAL | N | claims to power nonexistent `amc eval run --config` |
| amcConfigCli.ts | config init/validate/show commands | ORPHAN (tests only) | REAL | Y | never registered in cli.ts |
| configCli.ts | print/explain runtime config + signatures | CLI:amc config | REAL | N | — |
| configTypes.ts | StudioRuntimeConfig type | lib (loadConfig, configCli) | REAL | N | — |
| envSchema.ts | zod env-var coercion schema | lib (loadConfig) | REAL | N | — |
| loadConfig.ts | resolve studio runtime config from env | CLI:cli.ts + studio | REAL | Y | — |

### src/outcomes
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| outcomeApi.ts | HMAC-verified feedback/webhook ingestion | studio (studioServer) | REAL | Y | tested via index imports |
| outcomeCli.ts | outcome contract/report CLI facades | CLI:cli.ts | REAL | Y | — |
| outcomeContractEngine.ts | signed outcome contract load/verify | lib (outcomeCli, report) | REAL | Y | transparency-log linked |
| outcomeContractSchema.ts | zod contract schema | lib (engine) | REAL | Y | — |
| outcomeDashboard.ts | latest report/trend/value-gap reads | lib (dashboard/build) | REAL | N | — |
| outcomeReport.ts | compute+sign windowed outcome reports | lib (outcomeCli) | REAL | Y | — |
| outcomeScoring.ts | metric math from ledger signals | lib (outcomeReport) | REAL | Y | — |
| qualitySignals.ts | thumbs up/down trend store | CLI:cli-late-stage-commands | REAL | Y | — |

### src/casebooks
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| casebookCli.ts | init/list/verify/add casebook facades | CLI:cli.ts | REAL | Y | tested via index imports |
| casebookRunner.ts | replay cases against ledger evidence | lib (experiments/experimentRunner) | REAL | Y | — |
| casebookSchema.ts | zod case/casebook schema | lib (store) | REAL | Y | — |
| casebookStore.ts | signed casebook YAML persistence | lib (cli, runner) | REAL | Y | — |

### src/guide
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| fixCli.ts | `amc fix` interactive command | CLI:cli.ts | REAL | Y | — |
| oneClickFix.ts | score→plan→write guardrails→receipt engine | lib (fixCli) | REAL | Y | dry-run first, marker-scoped writes |
| guideGenerator.ts | personalized guide + guardrail generation | CLI:cli.ts (dynamic) | REAL | Y | 1273 lines, >800 cap; 58 test files |
| frameworkGuide.ts | per-framework governance patterns + code | CLI:cli-late-stage-commands | REAL | Y | — |

### src/brand
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| visualIdentity.ts | brand constants (colors, names) | lib (cliFormat) | REAL | Y | — |

### src/cli
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| offlineMode.ts | offline/lite mode config + checks | ORPHAN-barrel (index.ts only) | FACADE | Y | hardcoded memory estimates; nothing enforces offline |

### src/providers
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| providerTemplates.ts | LLM provider template catalog | CLI:cli.ts + API:gatewayRouter | REAL | Y | — |

#### Findings — B10
- **Orphaned declarative-config cluster**: all four `src/config/amcConfig*` files (~1100 lines) have zero production importers; amcConfigRunner's header claims it is "the engine behind `amc eval run --config`" — no such command exists in cli.ts.
- **thermostatCLI.ts is a facade**: defines `amc steer` commands and STEER_STUDIO_PANELS, but no `steer` command is registered in cli.ts and studio never reads the panels; default runtime handlers echo `{ok:true,...args}`.
- **Steer pipeline unreachable from public API**: src/index.ts exports nothing from src/steer; autotune, feedbackLoop, hygiene, harmClassifier, parameterMatrix are reachable only through an unimported barrel — only race/liquid/privacyTiers are actually used (via wrapFetch/traceLogger).
- **Claims lifecycle machinery dead-ends**: claimFactory, claimLifecycle, claimVerify, promotionGate, quarantine, contradictions are exported only via claims/index.ts, which no file imports — the promotion/quarantine state machine is never executed in production paths.
- **Cross-dir duplication**: `claims/claimExpiry.ts` vs `score/claimExpiry.ts` and `claims/confidenceDrift.ts` vs `score/confidenceDrift.ts` implement overlapping concepts under identical names.
- **Dead code**: adapters/adapterDoctor.ts (no importer, no test); claims/index.ts barrel.
- **offlineMode.ts is cosmetic**: claims "zero network calls, reduced memory" but is only a zod schema with hardcoded 80/200 MB estimates; no consumer enforces it.
- **Files >800 lines**: adapters/hookIntegration.ts (1952), guide/guideGenerator.ts (1273), claims/governanceLineage.ts (942).
- **Self-referential evidence**: score/* modules cite bucket file paths (e.g. "src/claims/claimConfidence.ts") as maturity evidence, including for orphaned modules — file existence counts as capability.

---

## B11 — enforce / domains / incidents / hallucination / unified / bootstrap / context / monitor

### src/enforce

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| index.ts | barrel re-exporting ~26 modules | lib (src/index.ts) | REAL | N | barrel only; 14 sibling files not exported |
| barrel-exported heuristic guards (17 files: antiPhishing, circuitBreaker, clipboardGuard, configLinter, crossSourceVerifier, evidenceContract, execGuard, geoFence, mdnsController, modeSwitcher, modelSwitchboard, numericChecker, payeeGuard, reverseProxyGuard, stepUpAuth, templateEngine, temporalControls) | small in-memory heuristic guard checks | ORPHAN-barrel | PARTIAL | Y | evidence events hardcoded decision/reason regardless of outcome |
| un-exported heuristic guards (12 files: abac, browserGuardrails, consensus, dryRun, egressProxy, gatewayScanner, idempotency, outboundFilter, sessionFirewall, twoPersonAuth, watchdog, webhookGateway) | same guard family, not in barrel | ORPHAN | PARTIAL | Y | only tests/enforce-full.test.ts references them |
| sandboxOrchestrator.ts | claims sandboxed execution | ORPHAN | FACADE | Y | no isolation; `isolated: true` hardcoded on a Map entry |
| stubs.ts | duplicate mini-implementations of 5 guards | ORPHAN | DEAD | N | zero importers; duplicates mdns/proxy/phishing/secretBlind modules |
| atoDetection.ts, secretBlind.ts, taintTracker.ts (3 files) | account-takeover, secret redaction, taint tags | API:securityRouter.ts | PARTIAL | Y | regex/heuristic; dynamically imported by API |
| policyFirewall.ts | rule-based tool-call policy engine | API:enforceRouter.ts | REAL | Y | also used by product/fixGenerator |
| schemaGate.ts | JSON-schema-ish output validation | lib (toolhub/toolSchemaContracts) | REAL | Y | hand-rolled validator, works |
| evidenceEmitter.ts | signed guard_check events to SQLite | lib (~30 importers: shield/*, score/*, watch) | REAL | Y | never-throw design; signing receipts real |
| safetyDSL.ts | WHEN/THEN safety-constraint DSL parser+engine | ORPHAN-barrel | REAL | Y | works, but nothing in src runs it |
| semanticGuardrails.ts | topic avoidance / steering | ORPHAN-barrel | PARTIAL | Y | keyword lists, not semantic, despite name |
| toolSandboxLimits.ts | resource-limit receipts | ORPHAN-barrel | PARTIAL | Y | receipts over caller-reported usage; no OS enforcement |
| formalVerification.ts | proof trees, BMC, TLA+ generation | CLI:cli.ts + API:enforceRouter + lib (shield/trustPipeline) | PARTIAL | Y | 994 lines; verifies built-in toy state model |
| inferenceStrategy.ts | signed inference-strategy run artifacts | API:strategyRouter + CLI:cli-strategy-commands | REAL | Y | compare/rollback with manifests |
| resourceManifest.ts | enforce resource manifest write/verify/apply | CLI:cli.ts + lib (fleet, lifecycle, importers) | REAL | Y | 2033 lines, >800; hub dependency |
| shellCommandPlan.ts | shell command parser/blast-radius plan | lib (bridge/hookControl, execGuard) | REAL | Y | real tokenizer with reason codes |
| actionEvidenceLogic.ts | signed action-policy evidence logic | API:complianceRouter + CLI (via wrapper) | REAL | Y | 728 lines |
| actionEvidenceLogicCli.ts | CLI registration for above | CLI:cli.ts | REAL | N | thin wrapper |
| controlInspectionCli.ts | CLI for projection/simulation/fixtures | CLI:cli.ts | REAL | N | dynamic imports |
| guardrailCli.ts | CLI for guardrail control state | CLI:cli.ts | REAL | N | |
| scopeTemplateCli.ts | CLI for scope templates | CLI:cli.ts | REAL | N | |
| guardrailControlState.ts | signed, journaled guardrail state | lib (runtime/firewall, guardrailCli) | REAL | Y | lock + signed journal |
| guardrailProfiles.ts | named guardrail profiles data | lib (controlState, projection, bindings) | REAL | Y | |
| guardrailRuntimeBindings.ts | binds profiles to runtime | lib (dashboard/build) | REAL | Y | |
| controlProjection.ts | unified control-plane projection | lib (controlSimulation) | REAL | Y | |
| controlSimulation.ts | what-if control decision simulation | API:complianceRouter + CLI (inspectionCli) | REAL | Y | |
| policyFixtureRunner.ts | YAML policy fixture CI runner | CLI (dynamic via controlInspectionCli) | REAL | Y | |
| scopeTemplates.ts | reusable signed scope templates | lib (scopeTemplateCli, controlProjection) | REAL | Y | |

### src/domains

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| index.ts | barrel | lib (src/index.ts re-export) | REAL | N | |
| domainRegistry.ts | 7-domain metadata + parsing | lib (dashboard, score/domainPacks) | REAL | Y | |
| industryPacks.ts | 41 industry pack question catalog | lib (dashboard, diagnostic, mcp, enterprise) | REAL | Y | 2525 lines, >800; static data |
| deepIndustryPacks.ts | HIPAA/SOX/FedRAMP deep questions | ORPHAN-barrel | REAL | Y | only src/index.ts re-export |
| industryPackEntitlement.ts | $9.99 license/entitlement (HMAC+Ed25519) | lib (dashboard, diagnostic, mcp) | REAL | Y | real paywall check |
| industryPackAudit.ts | deterministic auditor-ready pack audit receipt | lib (domainApplyCli) | REAL | Y | pure, hash-receipted |
| domainModuleMap.ts | module→domain activation mapping data | lib (assessmentEngine) | REAL | Y | 646 lines static data |
| domainAssessmentEngine.ts | domain-adjusted scoring | lib (domainCliIntegration) | REAL | Y | |
| domainReportBuilder.ts | builds domain report sections | lib (domainCliIntegration) | REAL | N | no direct test |
| domainCliIntegration.ts | assess+write domain reports | lib (domainApply) | REAL | Y | |
| domainApply.ts | apply pack guardrails to agent config | lib (domainApplyCli) | REAL | Y | |
| domainApplyCli.ts | `amc domain` command registration | CLI:cli.ts | REAL | N | |

### src/incidents

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| index.ts | barrel | ORPHAN (only tests import it) | REAL | Y | src/index.ts imports members directly |
| incidentTypes.ts | incident/causal types | lib (types.ts, ledger, otelExporter, API) | REAL | Y | |
| incidentStore.ts | signed hash-chained SQLite incident store | CLI:cli.ts + API:incidentRouter | REAL | Y | genuinely wired core |
| incidentTimeline.ts | timeline assembly from evidence | ORPHAN-barrel (src/index.ts only) | REAL | Y | tested via incidents/index |
| incidentGraph.ts | signed causal edge graph | ORPHAN-barrel | REAL | Y | |
| causalInference.ts | "causal inference" over evidence | ORPHAN (only via incidents/index) | PARTIAL | Y | heuristic keyword/time rules, not inference |
| autoAssembly.ts | auto-create incidents from drift/freeze/budget | ORPHAN-barrel | REAL | Y | never called by CLI/API |
| incidentRegression.ts | regression receipts before incident close | ORPHAN-barrel | REAL | Y | boundary-tested only |

### src/hallucination

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| index.ts | barrel with usage docs | ORPHAN | REAL | Y | whole dir imported by nothing in src |
| types.ts | finding/config types | ORPHAN (intra-dir only) | REAL | Y | |
| detector.ts | composite detector orchestration | ORPHAN | REAL | Y | dedupe + scoring real |
| deterministicDetectors.ts | regex detectors (citations, stats, URLs) | ORPHAN | REAL | Y | |
| llmJudge.ts | prompt builder + response parser | ORPHAN | PARTIAL | Y | needs caller-injected judgeFn; no model call anywhere |

### src/unified

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| index.ts | barrel | CLI:cli.ts (`amc run` dynamic import) | REAL | Y | |
| unifiedRun.ts | run 8 modules, letter grades | CLI:cli.ts + lib (mechanic, studio/oneCommandUp) | PARTIAL | Y | grades mostly from file-existence heuristics |
| unifiedRenderer.ts | ANSI terminal rendering | CLI (via unified/index) | REAL | Y | |
| unifiedSurfaceInspection.ts | verify configured surfaces/signatures | lib (unifiedRun) | REAL | Y | real signature checks |

### src/bootstrap

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| bootstrap.ts | one-shot workspace init (vault, policies, logs) | CLI:cli.ts + lib (setupCli, hostBootstrap, e2e) | REAL | Y | initializes ~25 subsystems |

### src/context

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| contextGraph.ts | zod-validated agent context graph loader | CLI:cli.ts + lib (12+ importers) | REAL | Y | widely used |

### src/monitor

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| trustDriftMonitor.ts | score-drop drift alerts from run history | CLI:cli.ts + lib (drift/continuousMonitor) | REAL | Y | overlaps src/drift subsystem |

#### Findings — B11
- ~30 small enforce guards emit evidence with hardcoded `decision`/`reason` regardless of actual outcome (payeeGuard blocks yet logs `allow`) — guard evidence in `.amc/guard_events.sqlite` misrepresents decisions.
- Orphan cluster: 12 un-exported guards + sandboxOrchestrator + stubs.ts have zero src importers (tests only); stubs.ts is a DEAD duplicate of mdnsController/reverseProxyGuard/antiPhishing/secretBlind/evidenceContract.
- sandboxOrchestrator is a FACADE: hardcodes `isolated: true`, provides no actual isolation; mdnsController's `scanMdns` returns empty (no mDNS ever performed).
- Entire src/hallucination directory is orphaned — polished module, tests, docs, but no CLI/API/studio wiring; llmJudge never receives a real model fn in src.
- Incidents advanced layer (timeline, graph, causalInference, autoAssembly, incidentRegression) reachable only via package barrel/tests; CLI/API use incidentStore alone; "causalInference" is keyword/time heuristics.
- product/fixGenerator and 4 score modules reference non-existent enforce modules (enforce/governor, rateLimit, sanitizer, codeExecutionGuard, inputValidator, allowlist) — generated fix code imports phantom files.
- Oversized files: industryPacks.ts (2525), resourceManifest.ts (2033), formalVerification.ts (994); formalVerification "verifies" only its built-in toy model, and semanticGuardrails is keyword matching despite the "semantic" claim.
- Duplication across dirs: ops/operatorUx.ts defines a competing IncidentTimeline; drift/continuousMonitor wraps monitor/trustDriftMonitor; enforce guard CLIs (guardrailCli, scopeTemplateCli, actionEvidenceLogicCli, controlInspectionCli) have no direct tests.

---

## B12

### src/vault
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| vault.ts | encrypted workspace keystore, key mgmt, secrets | lib (crypto, bootstrap, studio, api, 15+ importers) | REAL | Y | core module; in-memory sessions, 30-min TTL |
| vaultCrypto.ts | PBKDF2 + AES-256-GCM envelope | lib (vault.ts, identity/hostVault) | REAL | N | solid crypto; tested only indirectly |
| vaultCli.ts | interactive init/unlock/rotate prompts | CLI:vault init/unlock/lock | REAL | N | inquirer prompts + env override |
| passphraseStore.ts | remember passphrase (Keychain/file) | CLI:up, studio | REAL | Y | macOS `security` CLI or 0600 file |
| dlp.ts | regex PII/credential scan + redact | CLI, API:vaultRouter, lib (shield, score) | REAL | Y | Luhn+IBAN validation; widely wired |
| dataClassification.ts | keyword sensitivity classifier | CLI:classify, lib (fixGenerator) | REAL | Y | regex keywords, fixed confidences |
| ragGuard.ts | regex injection scan of RAG chunks | CLI:rag-guard | REAL | Y | 7 regex patterns only |
| metadataScrubber.ts | strip metadata fields from content | CLI:scrub | REAL | Y | regex/JSON field removal |
| privacyBudget.ts | in-memory DP budget counter | CLI:privacy-budget | REAL | Y | 26 lines; no persistence |
| zkPrivacy.ts | Schnorr/Pedersen/Shamir ZK proofs | CLI, API:vaultRouter, lib (trustPipeline) | REAL | Y | 730 lines; real Sigma math, toy modulus |
| dsarAutopilot.ts | DSAR request tracker class | lib (dsarCli) | PARTIAL | Y | "process" completes instantly; no data ops |
| dsarCli.ts | persistent DSAR store + audit jsonl | CLI:vault dsar | REAL | Y | persistence + hashed-subject audit |
| knowledgeRefreshLineage.ts | signed corpus-refresh lineage receipts | ORPHAN-barrel (src/index.ts only) | REAL | Y | no src consumer; gap-test only |
| invoiceFraud.ts | heuristic invoice risk score | ORPHAN-barrel | REAL | Y | leanAMC references it only as string |
| honeytokens.ts | AMC_HONEY_ token gen/detect | ORPHAN-barrel | REAL | Y | module-level counter; no consumer |
| dataResidency.ts | region allow-list check | ORPHAN-barrel | REAL | Y | duplicate concern of compliance/dataResidency.ts |
| memoryTtl.ts | in-memory TTL store | ORPHAN-barrel | PARTIAL | Y | wrapper storeWithTtl returns stored:true, stores nothing |
| screenshotRedact.ts | zero EXIF segments in JPEG buffer | ORPHAN-barrel | PARTIAL | Y | wrapper redactScreenshot fakes success, touches no file |
| secretsBroker.ts | AES-GCM in-memory secret store | ORPHAN-barrel | PARTIAL | Y | mintSecretToken wrapper returns synthetic token |
| undoLayer.ts | undo/redo action bookkeeping | ORPHAN-barrel | PARTIAL | Y | wrappers snapshotBeforeChange/undoChange fake results |
| keyRotation.ts | 8-line rotate wrapper | ORPHAN (no importer) | DEAD | Y | duplicate of vault.rotateMonitorKeyInVault |
| index.ts | barrel + legacy type aliases | lib | REAL | N | re-exports only |

### src/identity
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| hostVault.ts | host-level encrypted keystore + signing | lib (identityConfig, session, identityCli) | REAL | N | env/default passphrase fallback |
| identityConfig.ts | zod identity config, signing, SCIM tokens | lib (workspaceRouter, configCli, binderCollector) | REAL | Y | YAML + hostVault-signed |
| identityConfigLoader.ts | ensure/load-trusted config helpers | ORPHAN (no importer) | DEAD | N | duplicates identityConfig functions |
| identityApi.ts | local login/logout/portfolio handlers | API:workspaceRouter | REAL | N | audits to hostDb |
| identityCli.ts | identity init/provider/mapping/scim CLI | CLI:identity, scim | REAL | Y | — |
| roleMapping.ts | claims→workspace role grants | lib (oidc/saml routes) | REAL | Y | — |
| session.ts | signed session token issue/verify | lib (sessionStore) | REAL | N | ed25519 via hostVault |
| sessionStore.ts | session rows + revocation | lib (identityApi, oidcRoutes) | REAL | N | backed by hostDb |
| sessionCookie.ts | HttpOnly cookie set/clear/parse | lib (identityApi, workspaceRouter) | REAL | Y | — |
| oidc/oidcClient.ts | auth URL + code exchange | lib (oidcRoutes) | REAL | Y | discovery + PKCE |
| oidc/jwtVerify.ts | JWKS fetch + JWT verify | lib (oidcClient, oidcRoutes) | REAL | Y | RS256 via node crypto |
| oidc/oidcRoutes.ts | OIDC login/callback flow | API:workspaceRouter | REAL | Y | in-memory pending state |
| oidc/pkce.ts | PKCE verifier/challenge | lib (oidcClient) | REAL | N | 13 lines |
| saml/samlVerify.ts | verify "compact SAML" assertion | lib (samlRoutes) | PARTIAL | N | JSON stand-in, not XML SAML standard |
| saml/samlRoutes.ts | SAML login/ACS/metadata | API:workspaceRouter | PARTIAL | Y | real flow over non-standard assertion format |
| scim/* (6 files: scimAuth, scimTypes, scimPatch, scimUsers, scimGroups, scimRoutes) | SCIM 2.0 users/groups provisioning | API:workspaceRouter | REAL | Y | backed by hostDb; bearer-token auth |

### src/dashboard
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| build.ts | assemble static dashboard from workspace data | CLI:dashboard build, studio, lib (loop, packApply) | REAL | Y | 644 lines; aggregates 25+ subsystems |
| serve.ts | HTTP server for built dashboard + API | CLI:dashboard serve, studio | REAL | Y | token-gated, path-normalized |
| components/{radar,heatmap,timeline,questionDetail,eoc}.js (5 files) | canvas/DOM render helpers | ORPHAN (copied by build, never loaded) | DEAD | N | index.html never scripts them; app.js re-implements radar/timeline |
| components/teamViews.js | engineer/product/CISO/exec views | ORPHAN (not even copied) | DEAD | N | unreferenced anywhere |
| templates/index.html | dashboard page shell | lib (build.ts) | REAL | N | loads api/domains/guardrails/app only |
| templates/app.js | main dashboard SPA logic | lib (build.ts) | REAL | N | 2125 lines, >800 |
| templates/api.js | fetch client for /api/v1 | lib (build.ts) | REAL | N | — |
| templates/styles.css | dashboard styling | lib (build.ts) | REAL | N | 3487 lines |
| templates/components/{domains,guardrailsView}.js (2) | domain/guardrail panels | lib (build.ts + index.html) | REAL | N | actually loaded, unlike components/ |
| templates/fonts/* (2 woff2) | Inter + JetBrains Mono | lib (build.ts) | REAL | N | binary assets |

### src/notary
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| notaryCli.ts | init/start/status/attest/sign/log-verify | CLI:notary, API:cryptoRouter, exportRouter | REAL | Y | — |
| notaryServer.ts | localhost HTTP signing service | CLI:notary start, lib | REAL | Y | HMAC auth, hash-chained log |
| notarySigner.ts | scrypt-sealed ed25519 key backend | lib (server, cli) | REAL | Y | FILE_SEALED + EXTERNAL_SIGNER backends |
| notaryExternalSigner.ts | spawn external signer binary | lib (notarySigner) | REAL | N | verifies returned sig locally |
| notaryLog.ts | hash-chained append-only log + seal | lib (server, cli) | REAL | Y | — |
| notaryAttestation.ts | signed workspace attestation bundles | lib (server, cli) | REAL | Y | tar bundle, dir hashing |
| notaryAuth.ts | HMAC request auth build/verify | lib (server, crypto/signing, trust) | REAL | Y | timing-safe compare |
| notaryVerify.ts | verify sign/attest responses | lib (crypto/signing, trustConfig) | REAL | Y | — |
| notaryConfigSchema.ts | zod notary config | lib (configStore, signer) | REAL | N | — |
| notaryConfigStore.ts | config + path resolution | lib | REAL | Y | — |
| notaryApiTypes.ts | zod request/response schemas | lib | REAL | N | — |

### src/canon
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| canonLoader.ts | load/save/init/verify canon.yaml | lib (workspace, bootstrap, 8+ importers) | REAL | Y | plugin extension merging |
| canonSchema.ts | zod canon schema | lib | REAL | N | validated against questionBank |
| canonBuiltin.ts | built-in canon content | lib (canonLoader) | REAL | N | prefix→dimension routing table |
| canonApi.ts | thin API wrappers | studio, lib (canonCli) | REAL | N | pass-through to loader |
| canonCli.ts | thin CLI wrappers | CLI:canon init/verify/print | REAL | N | pass-through to canonApi |
| canonSigner.ts | 6-line sign wrapper | ORPHAN (no importer) | DEAD | N | duplicate of loader saveCanon signing |
| canonVerifier.ts | 6-line verify wrapper | ORPHAN (no importer) | DEAD | N | duplicate of verifyCanonSignature |

### src/doctor
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| doctorRules.ts | environment/workspace health checks | lib (doctorCli, doctorFix) | REAL | Y | probes real services, signatures, leases |
| doctorCli.ts | run rules + render text | CLI:doctor, src/index.ts | REAL | Y | — |
| doctorReport.ts | text renderer | lib (doctorCli) | REAL | N | — |
| doctorFix.ts | auto-repair safe issues | CLI:doctor --fix | REAL | N | dry-run support; no direct tests |
| doctorFixHints.ts | 6-line fixHint accessor | ORPHAN (no importer) | DEAD | N | trivial wrapper, unused |

### src/values
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| valueTypes.ts | preference/empowerment types | lib (diagnostic/selfModelCalibration) | REAL | Y | types only |
| valueCoherence.ts | Kendall-tau preference coherence engine | ORPHAN-barrel | REAL | Y | assurance valueCoherencePack does NOT import it |
| disempowerment.ts | empowerment score + dependency detect | ORPHAN-barrel | REAL | Y | assurance disempowermentPack does NOT import it |
| index.ts | barrel | ORPHAN-barrel | REAL | N | nothing imports the barrel |

### src/badge
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| badgeCli.ts | shields.io maturity badge generator | lib (quickscoreShare), API:exportRouter | REAL | Y | cli.ts duplicates shields URL inline twice |

### src/dogfood
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| maturityEvidence.ts | scaffold 8 demo agents, write synthetic ledger evidence | scripts/amc-dogfood-8-agents.mjs (dist import) | REAL | Y | intentionally synthetic evidence; not CLI-wired |

### src/mode
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| mode.ts | owner/agent mode gate for CLI commands | CLI:mode, lib (cli guard) | REAL | Y | hardcoded 100+ command blocklist |

#### Findings — B12
- Orphan cluster in vault: 9 modules (dataResidency, memoryTtl, screenshotRedact, secretsBroker, undoLayer, honeytokens, invoiceFraud, knowledgeRefreshLineage, keyRotation) reachable only through barrels or not at all; keyRotation.ts fully dead.
- Facade wrappers: "backward-compatible" functions in memoryTtl/screenshotRedact/secretsBroker/undoLayer return success objects (stored:true, redacted:true, tokenId) without performing any operation — and they are the barrel-exported names.
- Dashboard components/ dir is dead weight: 5 files copied into every build output but never `<script>`-loaded (app.js re-implements radar/timeline); teamViews.js not even copied.
- Dead duplicates: canonSigner.ts + canonVerifier.ts duplicate canonLoader functions; identityConfigLoader.ts duplicates identityConfig; doctorFixHints.ts trivial and unused.
- Contradiction: assurance packs named "disempowerment"/"valueCoherence" share names with src/values engines but never import them — two disconnected implementations of the same concepts.
- SAML support verifies a proprietary JSON "compact SAML" assertion, not standards XML SAML — enterprise SSO claims should be qualified.
- Files >800 lines: dashboard/templates/app.js (2125), styles.css (3487); zkPrivacy.ts (730) is near-cap real-but-toy crypto (secp256k1 order as modulus).
- dsarAutopilot "processRequest" marks requests complete instantly with no data access/deletion — DSAR workflow is record-keeping only.

---

## B13

### src/ops
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| latencyAccounting.ts | P50/95/99 latency + cost-of-trust analytics | CLI:ops latency, lib | PARTIAL | Y | in-memory array, no production recorders call it |
| operatorUx.ts | why-capped/unlock views from diagnostic report | CLI:ops (5 cmds) | REAL | Y | 945 lines; pure derivation, hardcoded riskReduction weights |
| governanceSlo.ts | governance SLO definitions, alerts, compliance | CLI:ops slo, lib | PARTIAL | Y | 1046 lines; in-memory, no measurement producers |
| otelExporter.ts | AMC trace → OTLP/JSON export | lib (ledger, observability, api) | REAL | Y | real fetch push to collector |
| policy.ts | signed ops-policy YAML load/verify | lib (workspace, studio, ledger) | REAL | Y | core config, widely imported |
| circuitBreaker.ts | hook circuit breaker, dead-letter, watchdog | lib (gateway, wrapFetch, toolhub) + CLI | REAL | Y | in-proc state, persisted policy; real runtime callers |
| overheadAccounting.ts | per-feature overhead/token accounting | CLI:overhead, lib (slo) | PARTIAL | Y | in-memory, no producers |
| modelRouter.ts | multi-provider cost/latency routing decisions | ORPHAN-barrel | PARTIAL | N | hardcoded price table; never executes requests; no caller |
| audit.ts | append ops audit event to ledger | lib (retention, backup, metrics) | REAL | N | thin ledger wrapper |
| productionWiring.ts | bridge feature modules into event pipeline | CLI:wiring-status | FACADE | Y | hooks never invoked anywhere; status always shows unwired |
| degradationMode.ts | FULL/REDUCED/MINIMAL degradation modes | CLI:ops mode | PARTIAL | Y | in-memory; `--set` lost when process exits |
| backpressure.ts | write-queue backpressure signaling | CLI:ops backpressure | PARTIAL | Y | in-memory, no queue producers |
| metrics/metricsRegistry.ts | Prometheus counter/gauge/histogram registry | lib | REAL | Y | in-proc registry |
| metrics/metricsMiddleware.ts | record HTTP metrics per request | studio, lib | REAL | Y | wired into studio server |
| metrics/metricsServer.ts | /metrics HTTP server with CIDR auth | studio (supervisor) | REAL | Y | audits denied requests |
| metrics/metricsCli.ts | probe /metrics reachability | ORPHAN | DEAD | N | no importer anywhere |
| retention/retentionEngine.ts | archive+prune ledger events per policy | lib, CLI via retentionCli | REAL | N | signed segments, tombstones, vacuum |
| retention/retentionVerify.ts | re-export verifyRetention | ORPHAN | DEAD | N | 2-line shim, unimported |
| retention/retentionSchema.ts | zod schemas for segments/pruned rows | lib | REAL | N | |
| retention/retentionArchive.ts | signed gzip archive segments + proofs | lib (ledger) | REAL | N | |
| retention/retentionCli.ts | retention CLI entry | CLI + studio | REAL | Y | |
| maintenance/maintenanceCli.ts | vacuum/rotate/prune CLI entry | CLI + studio | REAL | Y | |
| maintenance/sqliteMaintenance.ts | VACUUM/ANALYZE + index creation | lib | REAL | N | |
| maintenance/stats.ts | workspace size/DB stats | lib (studio, experiments) | REAL | N | |
| maintenance/logRotation.ts | delete old/large log files | lib | REAL | N | |
| maintenance/cachePrune.ts | prune stale cache files | lib | REAL | N | |
| backup/backupCli.ts | backup create/verify CLI entry | CLI, verifyAll, smoke | REAL | N | |
| backup/backupEngine.ts | encrypted signed tar backups + restore | lib | REAL | Y | real tar, scrypt/AES-GCM, manifests |
| backup/backupCrypto.ts | passphrase AES-256-GCM envelope | lib | REAL | N | |
| backup/backupVerify.ts | re-export verifyBackup | ORPHAN | DEAD | N | 1-line shim, unimported |
| backup/backupSchema.ts | backup manifest schemas | lib | REAL | N | |

### src/passport
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| passportConstants.ts | 90-day expiry constant | lib | REAL | N | |
| passportStore.ts | policy/cache/revocation persistence | lib, studio | REAL | Y | |
| passportCollector.ts | aggregate workspace evidence into passport | lib (passportArtifact) | REAL | Y | pulls ~20 real subsystems |
| passportSchemaCompatibility.ts | partner import/export fixture round-trips | ORPHAN-barrel | REAL | Y | logic works, nothing invokes it |
| passportSigner.ts | sign/verify passport digests | lib | REAL | N | |
| passportRedaction.ts | PII scan + id hashing | lib | REAL | Y | |
| passportPolicySchema.ts | passport policy zod schema | lib | REAL | N | |
| passportApi.ts | passport create/verify/badge/QR API funcs | API:passportRouter, studio, CLI | REAL | Y | 636 lines |
| passportArtifact.ts | build signed tar.gz passport bundle | lib + CLI | REAL | Y | transparency-logged, proof files |
| passportProofs.ts | thin wrapper over benchProofs | lib | REAL | N | pure delegation |
| passportSchema.ts | passport JSON schemas | lib | REAL | Y | |
| passportCli.ts | passport CLI entry | CLI:passport | REAL | Y | |
| passportSse.ts | emit passport SSE events | studio | REAL | N | 16 lines |
| agentDiscovery.ts | capability declare/search/platform links | CLI:passport capabilities-add/search/link | FACADE | Y | fresh in-memory registry per command; nothing persists, search always empty |
| adapterCapabilityReceipt.ts | signed adapter capability receipts | lib (adapterCli) | REAL | Y | |
| passportVerifier.ts | verify passport bundle offline | lib (verifyAll, api) | REAL | Y | safe tar extraction |
| receiptInterchange.ts | cross-platform signed receipt format | ORPHAN-barrel | REAL | Y | logic complete, no CLI/API caller |
| trustInterchange.ts | AMC trust tokens + score translation | CLI, API:passportRouter, shield | PARTIAL | Y | "federated network" is local-only processing |

### src/governor
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| nlPolicy.ts | English → governor YAML via regex patterns | ORPHAN-barrel | REAL | Y | honest: deterministic, no LLM; unwired |
| actionPolicyEngine.ts | core action permission evaluation | lib, CLI, studio | REAL | Y | 989 lines, heavily imported |
| governorReport.ts | allow/deny matrix per action class | lib (governorCli, runner, simulator) | REAL | N | |
| actionPolicySchema.ts | action policy zod schema | lib (enforce/*) | REAL | N | |
| emergencyOverride.ts | signed TTL override + postmortem | CLI (19625) | REAL | N | duplicates policyCanary.ts override impl |
| policyDebt.ts | waiver/debt register with expiry | CLI (19583) | REAL | N | duplicates policyCanary.ts debt impl |
| amcPolicies.ts | static policy catalog | ORPHAN-barrel | REAL | N | descriptions map to nonexistent "Python amc" modules |
| actionCatalog.ts | action class constants | lib (enforce, tickets, bridge) | REAL | Y | |
| policyEvidenceLogic.ts | evidence gate boolean logic | lib | REAL | Y | |
| confidenceGovernor.ts | confidence-adjusted autonomy caps | CLI (19761) | REAL | Y | pure computation |
| governorCli.ts | governor check CLI entry | CLI, studio, bridge | REAL | Y | |
| policyCanaryMode.ts | observation-only policy canary | CLI (19545) | REAL | Y | overlaps policyCanary.ts canary |
| policyCanary.ts | canary rollout + rollback packs | CLI (15673–15835) | REAL | Y | 799 lines; ALSO contains 2nd override/debt/SLO/drift impls, both CLI-wired |

### src/transparency
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| transparencyReport.ts | agent behavior "SBOM" report | lib (cli, mcp) | REAL | Y | |
| logCli.ts | re-export logChain functions | CLI, studio | REAL | Y | pure shim |
| logChain.ts | append-only signed transparency log | lib (bench, cgx, studio, ops) | REAL | Y | core primitive, widely used |
| proofSchema.ts | inclusion proof schemas | lib | REAL | N | |
| logVerifier.ts | rename-wrappers for verify functions | ORPHAN | DEAD | N | 9 lines, unimported |
| merkleIndexStore.ts | persistent merkle index over log | lib, studio | REAL | Y | |
| logSchema.ts | log entry/seal schemas | lib | REAL | N | |
| transparencyReportCli.ts | transparency report CLI entry | CLI | REAL | Y | |
| merkle.ts | merkle tree build/prove/verify | lib (benchProofs) | REAL | Y | |
| transparencyMerkleCli.ts | merkle status CLI entry | CLI | REAL | N | |
| transparencyMerkleApi.ts | aggregate merkle status | ORPHAN | DEAD | N | unimported aggregator |

### src/marketplace
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| marketplaceRouter.ts | /api/v1/marketplace routes | API:api/index.ts | REAL | N | |
| marketplaceTypes.ts | catalog/rating schemas | lib | REAL | N | |
| index.ts | barrel | lib (cli, studio, shield) | REAL | N | re-exports only |
| marketplaceCli.ts | `amc pack` search/install/rate | CLI | REAL | N | |
| marketplaceStore.ts | ratings/installs JSON store | lib | REAL | Y | |
| marketplaceIndex.ts | merge builtin packs + remote registry | lib | REAL | N | catalog is real builtin+plugin data |

### src/e2e
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| smoke.ts | full-stack smoke suite (bootstrap→backup→verify) | CLI via smokeCli | REAL | N | 615 lines; exercises real subsystems |
| smokeSteps.ts | step runner, fake OpenAI upstream, helpers | lib (smoke) | REAL | N | fake upstream is legitimate test double |
| smokeCli.ts | `amc smoke` entry | CLI:smoke | REAL | N | |
| smokeSchema.ts | smoke report schema | lib | REAL | N | |

### src/demo
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| demoRun.ts | run simulated agent through real gateway | CLI:demo run | REAL | Y | real ledger evidence; labeled DEMO_ONLY |
| gapDemo.ts | keyword-vs-execution scoring gap demo | CLI:demo gap | FACADE | Y | "execution tests" fully hardcoded; nothing executes |
| prospectDemo.ts | 5-minute sales demo script + share bundle | CLI:demo prospect | REAL | Y | explicit DEMO_ONLY claim boundary; optional live run |

### src/artifact
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| artifactProvenance.ts | C2PA-inspired signed artifact manifests | ORPHAN-barrel | REAL | Y | 779 lines; real signing, no CLI/API surface |

### src/eoc
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| flows.ts | education/ownership/commitment flows, ledger-audited | CLI:cli.ts | REAL | N | |

### src/methodology
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| publicMethodology.ts | public scoring methodology manifest + packets | CLI, lib (diagnostic, badge) | REAL | Y | 5454 lines, mostly one hardcoded literal; case studies labeled synthetic:true |

#### Findings — B13
- **In-memory ops theater**: latencyAccounting, overheadAccounting, governanceSlo, degradationMode, backpressure have zero production producers; their CLI dashboards always render empty/reset state, and `ops mode --set` silently evaporates at process exit.
- **productionWiring.ts is a facade**: named "production wiring" but its six hooks are called by no code; `amc wiring-status` can only ever report 0 hooks.
- **agentDiscovery facade**: `passport capabilities-add/search/link` build a fresh empty in-memory registry per invocation — adds don't persist, search always returns [].
- **gapDemo hardcodes its punchline**: the "execution-verified" scores that expose the 84-point gap are static literals; no execution occurs.
- **Duplicate governance stack**: policyCanary.ts reimplements emergency override, policy debt, drift, and SLOs that also exist as emergencyOverride.ts, policyDebt.ts, policyCanaryMode.ts, ops/governanceSlo.ts — and the CLI wires BOTH copies under different commands (cli.ts 15673–15835 vs 19545–19644).
- **Dead files (6)**: metricsCli.ts, retentionVerify.ts, backupVerify.ts, logVerifier.ts, transparencyMerkleApi.ts unimported; modelRouter.ts, nlPolicy.ts, receiptInterchange.ts, passportSchemaCompatibility.ts, amcPolicies.ts, artifactProvenance.ts are ORPHAN-barrel (index.ts export only).
- **Files >800 lines**: publicMethodology.ts (5454, mostly one manifest literal), governanceSlo.ts (1046), actionPolicyEngine.ts (989), operatorUx.ts (945).
- **Contradiction**: amcPolicies.ts descriptions claim mappings to "Python amc.vault/amc.enforce" modules that don't exist in this repo (only example bots are Python).

---

## B14

### src/plugins
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| pluginApi.ts | Approval-gated plugin install/upgrade/remove lifecycle | lib (bootstrap, studio, marketplace, verify) | REAL | Y | signature+approval checks, transparency log; genuine |
| pluginCli.ts | CLI handlers for plugin commands | CLI:plugin + API:toolsRouter | REAL | Y | |
| pluginLoader.ts | Load installed plugin assets with overlay rules | lib (adapters, canon, studio) | REAL | Y | integrity-verified asset loading |
| pluginPackage.ts | Build/verify signed .tgz plugin packages | lib (pluginApi/Cli/Registry) | REAL | Y | tar limits, secret scan, manifest signing |
| pluginRegistry.ts | Local registry create/publish/serve with signed index | lib (pluginCli) | REAL | Y | includes real HTTP server |
| pluginRegistryClient.ts | Fetch/verify remote registry index and packages | lib (marketplace, pluginApi) | REAL | N | path-traversal guards, fingerprint pinning |
| pluginStore.ts | Signed lock/registries/overrides file persistence | lib (bootstrap, cgx, marketplace, studio) | REAL | Y | |
| pluginVerifier.ts | Verify installed plugins vs signed lock | lib (pluginApi, pluginLoader) | REAL | Y | |
| pluginSigner.ts | Ed25519 manifest sign/verify, fingerprints | lib (pluginPackage, pluginRegistry) | REAL | N | |
| pluginManifestSchema.ts | Zod schema for plugin manifest | lib (intra-dir) | REAL | Y | |
| pluginRegistrySchema.ts | Zod schemas for registry/lock/overrides | lib (intra-dir) | REAL | Y | |
| pluginIdentifiers.ts | Plugin id/version schemas, safe install paths | lib (intra-dir) | REAL | N | |
| pluginTypes.ts | Shared plugin type/risk enums | lib (marketplaceTypes) | REAL | N | |
| pluginApiVersion.ts | Plugin API semver compat + deprecation tracking | ORPHAN-barrel | PARTIAL | Y | compat check never invoked by loader |
| sandboxLimits.ts | Plugin resource limit schema + enforcement helpers | CLI:plugin limits | PARTIAL | Y | enforcement helpers unused; CLI only prints defaults |
| pluginDiff.ts | Diff artifacts between two plugin packages | ORPHAN | DEAD | N | no importer, no test |
| pluginSse.ts | Plugin SSE event-name constants | ORPHAN | DEAD | N | 9 lines, unreferenced |
| pluginRegistryServer.ts | Wrapper around servePluginRegistry | ORPHAN | DEAD | N | 9-line wrapper, unreferenced |
| ui/pluginModel.ts | UI row type definitions | ORPHAN | DEAD | N | types only, unreferenced |
| rules/allowlist.ts | Publisher/risk-category allowlist checks | ORPHAN | DEAD | N | logic re-implemented inline in pluginApi |
| rules/overlayRules.ts | Which asset kinds plugins may override | lib (pluginLoader) | REAL | N | |
| builtins/builtInRegistry.ts | Registry of built-in packs/adapters/mappings | lib (pluginLoader) | REAL | N | |

### src/integrations
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| framework adapters (3 files: autogenAdapter, crewaiAdapter, langchainAdapter) | "Wrap" agent frameworks to capture evidence | CLI:integrate | FACADE | N | JS Proxy over Python frameworks; events never persisted; CLI prints snippet |
| automationBridge.ts | Risk-score n8n/Make/Zapier workflows | ORPHAN-barrel | REAL | N | deterministic scoring works, nothing calls it |
| ciGate.ts | CI gate eval + GitHub/GitLab/webhook config generators | CLI:late-stage | REAL | Y | |
| index.ts | Barrel re-exports | ORPHAN | DEAD | Y | not an npm subpath; no importer |
| integrationDeadLetters.ts | Append/list dead-letter JSONL | lib (dispatcher) | REAL | Y | |
| integrationDeliveryQueue.ts | SQLite delivery queue with signed receipts | lib (dispatcher, integrationsCli) | REAL | Y | 1134 lines, >800 |
| integrationDeliveryStore.ts | Delivery receipt/dead-letter persistence | lib (dispatcher, cli) | REAL | Y | |
| integrationDispatcher.ts | Dispatch governance events to channels | lib (approvals, forecast, studio, value) | REAL | Y | widely wired |
| integrationSchema.ts | Zod schema for integrations.yaml | lib (integrationStore) | REAL | N | |
| integrationStore.ts | Signed config + vault-backed secrets | lib (dispatcher, studio) | REAL | Y | |
| integrationsCli.ts | CLI handlers for integrations commands | CLI:integrations + studio | REAL | Y | |
| noCodeGovernanceCli.ts | Thin add-adapter wrapper | ORPHAN-barrel | REAL | Y | not registered in cli.ts |
| noCodeGovernanceSchema.ts | Zod schema for no-code adapters | lib (store, adapters) | REAL | N | |
| noCodeGovernanceStore.ts | Signed no-code-governance.yaml store | lib (noCodeGovernanceCli) | REAL | Y | reachable only via orphan CLI wrapper |
| noCodeWebhookAdapters.ts | Parse n8n/Make/Zapier payloads into ledger evidence | ORPHAN-barrel | REAL | Y | working parser, no HTTP route mounts it |
| opsReceipt.ts | Verify signed ops receipts vs ledger | studio | REAL | Y | |
| partnerInteroperability.ts | Signed partner interop manifest builder | ORPHAN-barrel | REAL | Y | |
| scimAdapter.ts | SCIM 2.0 user provisioning handler | ORPHAN-barrel | PARTIAL | Y | in-memory Map only; never mounted on server |
| webhookDelivery.ts | HMAC-signed webhook POST with retry/redaction | lib (queue, store) | REAL | Y | |

### src/compliance
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| builtInMappings.ts | Built-in framework→evidence mappings | lib (engine, guide, plugins) | REAL | Y | 2036 lines static data, >800 |
| complianceCli.ts | Compliance report CLI handlers | CLI + API:complianceRouter + studio | REAL | Y | |
| complianceEngine.ts | Evaluate ledger evidence against mappings | lib (cli, studio, unified) | REAL | Y | signed reports from real ledger events |
| complianceMatrix.ts | Multi-framework coverage matrix/gaps | CLI:compliance matrix | REAL | Y | |
| complianceReport.ts | Write/diff report artifacts, legal notes | lib (complianceCli) | REAL | Y | |
| controlCrosswalk.ts | Cross-framework control crosswalk record builder | ORPHAN-barrel | PARTIAL | Y | pure record builder, no persistence/caller |
| coverageScorer.ts | Weighted coverage score | lib (engine) | REAL | N | |
| dataResidency.ts | Residency policies, tenant isolation, legal holds | CLI | PARTIAL | Y | module-level in-memory state, no persistence |
| euAiActClassifier.ts | Rule-based EU AI Act tier classifier | CLI | REAL | Y | |
| exceptionLifecycle.ts | Governance exception record builder | ORPHAN-barrel | PARTIAL | Y | hash-stamped records, nothing stores them |
| frameworks.ts | Framework enum + category families | lib (cli, api, studio) | REAL | Y | |
| globalRegulatory.ts | FedRAMP/global frameworks, DPIA, construct validity | ORPHAN-barrel | FACADE | Y | hardcoded DPIA/validity "reports"; duplicate EU classifier |
| mappingSchema.ts | Zod schemas for mappings/reports | lib | REAL | Y | |
| policyDrift.ts | Policy drift impact record builder | ORPHAN-barrel | PARTIAL | Y | pure builders, no caller |
| providerRisk.ts | Third-party provider risk record builder | ORPHAN-barrel | PARTIAL | Y | pure builders, no caller |
| regulatoryAutomation.ts | Regulatory feed monitor + impact scoring | CLI + API:complianceRouter | PARTIAL | Y | real fetch(); parsing/diffing heuristic; 802 lines |

### src/observability
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| anomalyDetector.ts | Evidence-rate/tier/volatility anomaly detection | lib (watch, timeline, debugMode) | REAL | Y | |
| costBudgetEvidence.ts | Per-agent cost budget receipt builder | ORPHAN-barrel | PARTIAL | Y | pure record builder, no caller |
| costTracker.ts | Per-run dollar cost tracking from traces | CLI:late-stage + studio | REAL | Y | |
| debugMode.ts | Ledger evidence debug inspector | CLI | REAL | Y | |
| evalTracing.ts | OTel spans around eval runs | lib (evalRunCli) | REAL | Y | |
| otelExporter.ts | OTLP exporter with buffering/flush | lib (score API, ledger, eval) | REAL | Y | real fetch to endpoints; 899 lines |
| platformConfigs.ts | Grafana/Datadog/NewRelic exporter configs | ORPHAN-barrel | REAL | Y | config builders unused by product code |
| riskCostLatencySlo.ts | Risk/cost/latency SLO receipt builder | ORPHAN-barrel | PARTIAL | Y | pure record builder, no caller |
| routerFallbackSafety.ts | Router fallback allow/block record builder | ORPHAN-barrel | PARTIAL | Y | pure record builder, no caller |
| sessionCorrelator.ts | Group traces into session quality metrics | CLI:late-stage | REAL | Y | |
| timeline.ts | Agent timeline from ledger + runs | API:agentTimelineRouter + CLI | REAL | Y | |

### src/storage
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| sqlitePool.ts | better-sqlite3 connection pool | lib (ledger, scoreStore) | REAL | N | |
| nativeGuard.ts | Auto-rebuild better-sqlite3 on ABI mismatch | CLI (side-effect import) | REAL | N | |
| blobs/blobStore.ts | Encrypted blob store, signed hash-chained index | lib (ledger, retention) | REAL | Y | |
| blobs/blobEncryptor.ts | AES-256-GCM envelope encrypt/decrypt | lib (blobStore, blobCli) | REAL | N | |
| blobs/blobKeys.ts | Vault-backed blob key management/rotation | lib (blobStore, blobCli) | REAL | N | |
| blobs/blobSchema.ts | Zod schemas for blob index | lib | REAL | N | |
| blobs/blobVerify.ts | Verify blob chain + ledger refs | lib (blobCli) | REAL | Y | |
| blobs/blobCli.ts | CLI for blob store ops | CLI | REAL | N | |

### src/truthguard
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| truthguardEngine.ts | Validate agent output: secrets, claims, allowlists | lib (api, cli) | REAL | Y | deterministic regex/allowlist checks |
| truthguardRules.ts | Secret patterns, claim regex, tag extraction | lib (engine) | REAL | N | |
| truthguardApi.ts | Workspace-context validation (ledger, toolhub, bridge) | studio + lib (promptPackApi) | REAL | Y | |
| truthguardCli.ts | CLI validate command | CLI:truthguard | REAL | N | |
| truthguardSchema.ts | Zod output/result schemas | lib | REAL | Y | |

### src/exports
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| policyExport.ts | Export signed policy/config/run bundle | CLI + API:exportRouter,bomRouter + studio | REAL | Y | |
| grcEvidenceExport.ts | Run → GRC control manifest + SARIF | lib (grcCli) | REAL | Y | pure transform, honest about scope |
| grcCli.ts | CLI for GRC export | CLI:grc | REAL | N | |

### src/archetypes
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| index.ts | Built-in agent archetypes + apply to workspace | CLI:archetype | REAL | Y | 1010 lines, mostly archetype data; >800 |

### src/executive
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| brief.ts | Board-ready HTML/markdown executive brief | CLI:business brief | REAL | Y | renders from real run report |

### src/loop
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| loop.ts | Recurring diagnostic+assurance+dashboard+snapshot orchestrator | CLI:loop | REAL | Y | schedule subcommand only prints cron/launchd/systemd text |

#### Findings — B14
- Orphan-barrel cluster (~15 files): governance "record builders" (exceptionLifecycle, policyDrift, providerRisk, controlCrosswalk, costBudgetEvidence, riskCostLatencySlo, routerFallbackSafety) plus scimAdapter, partnerInteroperability, noCodeWebhookAdapters, noCodeGovernance*, automationBridge, platformConfigs, pluginApiVersion — exported only via src/index.ts, never used by CLI/API/studio; most build hash-stamped records nothing persists.
- Dead files: pluginDiff, pluginSse, pluginRegistryServer, ui/pluginModel, rules/allowlist, integrations/index.ts (barrel not an npm subpath, zero importers).
- FACADE: `amc integrate langchain|crewai|autogen` prints "adapter configured" — Proxy wrappers (JS wrapping Python frameworks) whose captured events are never persisted; ledgerPath/autoCapture ignored.
- sandboxLimits claims to "enforce CPU/memory/IO limits" but withCpuTimeout/buildProcessResourceArgs/checkUsageViolations are never called from any plugin execution path; CLI just prints defaults.
- Duplicate `classifyEuAiActRisk` implementations in euAiActClassifier.ts (wired) and globalRegulatory.ts (orphan); globalRegulatory also ships hardcoded DPIA and "construct validity" reports presented as assessments.
- Files >800 lines: builtInMappings (2036), integrationDeliveryQueue (1134), archetypes/index (1010), otelExporter (899), regulatoryAutomation (802).
- Genuinely solid cores: plugin signing/install pipeline (approval-gated, transparency-logged), encrypted blob store, integration delivery queue/dispatcher, compliance engine over real ledger evidence, OTLP exporter with real HTTP flush.
- SCIM provisioning and dataResidency keep all state in process memory — restarts lose users/tenants/legal holds; SCIM handler is never mounted on any HTTP router.

---

## B15 — src/product, src/ci, src/guardrails, src/ingest

### src/product

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| index.ts | barrel re-exporting 57 modules | lib (cli.ts dynamic-imports 7 symbols) | REAL | Y | root src/index.ts skips it (name conflict) |
| productDb.ts | SQLite WAL singleton for product queues | lib (batchProcessor, portal) | REAL | Y | only intra-dir consumer pair |
| batchProcessor.ts | SQLite batch queue, progress/ETA/pause | API:productRouter.ts | REAL | Y | one of few genuinely persistent modules |
| portal.ts | SQLite job portal, files, transitions | API:productRouter.ts | REAL | Y | real state-transition enforcement |
| featureCatalog.ts | product feature catalog | CLI:amc product feature | FACADE | N | hardcoded 2-entry catalog presented as catalog |
| glossary.ts | terminology manager, variant scanning | CLI:amc product glossary | REAL | Y | in-memory only |
| costLatencyRouter.ts | route task to best model | CLI:amc product route | PARTIAL | Y | hardcoded 3-profile table, stale pricing |
| autonomyDial.ts | ask-vs-act decision | CLI:amc product autonomy | PARTIAL | Y | keyword-set risk heuristic |
| loopDetector.ts | repeated-action loop detection | CLI:amc product loop | REAL | Y | pattern-window check, works |
| metering.ts | usage metering + billing | CLI:amc product meter | PARTIAL | Y | in-memory; invoice is randomUUID |
| retryEngine.ts | exponential backoff retry | CLI:amc product retry | REAL | Y | small but genuine |
| planGenerator.ts | generate execution plan from goal | CLI:amc product plan | FACADE | Y | canned Analyze/Plan/Execute steps, fabricated ms |
| workflowEngine.ts | "workflow orchestration engine" | CLI:amc product workflow | STUB | Y | start() flips status; never executes steps |
| in-memory heuristic modules (33 files: approvalWorkflow, clarification, compensation, contextOptimizer, contextPackBuilder, conversationSummarizer, dependencyGraph, determinism, documentAssembler, errorTranslator, escalation, eventRouter, goalTracker, improvement, instructionFormatter, knowledgeGraph, onboardingWizard, outputCorrector, outputDiff, personalizedOutput, reasoningCoach, replayDebugger, rolloutManager, structuredOutput, syncConnector, taskSpecBuilder, taskSplitter, toolChainBuilder, toolFallback, toolParallelizer, toolRateLimiter, toolSemanticDocs, whiteLabel) | per-name product feature, Map-backed | ORPHAN-barrel | PARTIAL | Y | real in-scope algorithms (TF-IDF, DAG, sagas); no consumer, no persistence |
| Python-port modules (4: chunkingPipeline, apiWrapperGenerator, autodocGenerator, clarificationOptimizer) | RAG chunking / OpenAPI wrappers / autodocs / question-minimizer | ORPHAN-barrel | REAL | Y | substantial ports, 215–427 lines, zero consumers |
| scratchpad.ts | session scratchpad, SQLite | ORPHAN-barrel | REAL | Y | own .amc/scratchpad.sqlite, unused |
| promptModules.ts | prompt component registry, SQLite | ORPHAN-barrel | REAL | Y | own sqlite db, unused |
| asyncCallback.ts | webhook callback registry | ORPHAN-barrel | REAL | Y | real fetch delivery + backoff |
| devSandbox.ts | "execute code in sandbox" | ORPHAN-barrel | FACADE | Y | "execution" = line count + regex for `throw|error` |
| jobs.ts | job queue | ORPHAN-barrel | FACADE | Y | processJob comment "Simulate completion", instant success |
| fixGenerator.ts | map gaps → fix code templates | ORPHAN-barrel | PARTIAL | Y | duplicate of mechanic/autoFixer (real amc fix path); canned confidence 0.75/0.65/0.5 |
| longTermMemory.ts | "long-term memory persistence" | ORPHAN-barrel | PARTIAL | Y | plain Map — vanishes on exit, contradicts name |
| toolContract.ts | validate tool call vs contract | ORPHAN-barrel | PARTIAL | N | only checks name + required fields |
| toolReliability.ts | predict tool failure probability | ORPHAN-barrel | PARTIAL | N | avg of history; canned defaults when empty |
| toolCostEstimator.ts | model pricing registry + estimates | ORPHAN-barrel | PARTIAL | Y | hardcoded 2024-era pricing table |
| DEAD heuristic cluster (23 files: abTesting, collaboration, confidence, contextPack, conversationState, dataQuality, docsIngestion, extractor, failureClustering, kbBuilder, memoryConsolidation, outcomePricing, paramAutofiller, persona, proactiveReminders, responseValidator, retentionAutopilot, scaffolding, sopCompiler, taskSpec, toolDiscovery, versionControl, workflowTemplates) | per-name feature, class + trailing stub fn | ORPHAN (not even in barrel) | DEAD | Y | tested-but-unshipped; each ends with trivial stub function |
| stubs.ts | 25 self-described "no-op implementations" | ORPHAN | DEAD | N | superseded per barrel comment "redirected from stubs" |
| persistence.ts | file KV store | ORPHAN | DEAD | N | writes to os tmpdir; persistData() fakes `stored:true` |

### src/ci

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| gate.ts | release gate: policy, signing, receipts | CLI:amc ci + API:ciRouter.ts + lib (assurance, policyPacks, simulator) | REAL | Y | 885 lines (>800); signature verify, receipts, transparency log |
| redteamGate.ts | CI thresholds over red-team run | CLI:cli.ts (dynamic) | REAL | Y | quality inherits from redteam/runner |

### src/guardrails

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| guardEngine.ts | 2-line re-export shim | CLI:cli.ts + API:watchRouter.ts | REAL | Y | real engine moved to shield/guardEngine |

### src/ingest

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| ingest.ts | ingest evidence files into ledger; attest | CLI:cli.ts + API:evidenceRouter.ts | REAL | Y | attest re-labels SELF_REPORTED events ATTESTED by re-signing same payloads |

#### Findings — B15

- **~72 of 85 product files are unreachable from any CLI/API/studio path**: 25 fully DEAD (no importer at all, not in barrel) + 47 ORPHAN-barrel (exported only via product/index.ts, which cli.ts imports for just 7 symbols); root src/index.ts deliberately skips the product barrel.
- **Facades**: devSandbox.ts fakes code execution (line count + regex); jobs.ts fakes job processing ("Simulate completion"); planGenerator.ts emits canned 4-step plans with fabricated durations; featureCatalog.ts serves a hardcoded 2-entry catalog through a live CLI command; workflowEngine.ts is an "orchestration engine" that never runs steps.
- **Duplication**: product/fixGenerator.ts duplicates src/mechanic/autoFixer.ts (the actual `amc fix` backend); product/taskSpec vs taskSpecBuilder, contextPack vs contextPackBuilder, docsIngestion vs chunkingPipeline, clarification vs clarificationOptimizer are near-parallel generations; stubs.ts re-declares types 25 modules also declare.
- **Test-coverage illusion**: the 23-file DEAD cluster is directly imported by product tests (product-full/productStubsEnhanced/productStateful), so coverage numbers count code no product path can reach.
- **Only 4 product modules touch durable storage** (productDb, batchProcessor, portal, scratchpad/promptModules with private sqlite files); everything else including "longTermMemory" is process-lifetime Maps.
- **Trust-boundary concern**: ingest.ts `attestIngestSession` upgrades SELF_REPORTED evidence to ATTESTED by copying and signing the same unverified payloads — attestation adds no new verification.
- **>800 lines**: src/ci/gate.ts (885) is the only oversized file in the bucket; it is also the bucket's most genuinely load-bearing module (CLI, API, assurance, policyPacks, simulator all depend on it).
- Hardcoded stale model pricing appears twice (costLatencyRouter, toolCostEstimator) with mutually inconsistent numbers.

---

## B16

### src/bridge

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| bridgeModelRouter.ts | Regex path→provider route matching | lib (bridgeRoutes, bridgeServer) | REAL | N | 6 providers, deterministic |
| bridgeAuth.ts | Pairing codes, lease issue/verify | CLI:cli.ts, studio | REAL | N | scrypt-free; hashes codes, real lease crypto |
| bridgeRedaction.ts | Secret-pattern redaction, body summaries | lib (bridgeServer, adapters, cli) | REAL | N | 13 secret regexes |
| bridgeServer.ts | LLM proxy: policy, receipts, streaming | lib/studio (index, studioServer) | REAL | Y | 1377 lines; real upstream fetch |
| bridgePolicyEnforcer.ts | Provider/route/model/lease policy checks | lib (bridgeServer) | REAL | N | includes taxonomy signature check |
| bridgeTelemetry.ts | Append agent stdio events to ledger | lib (bridgeServer) | REAL | N | redacts before append |
| hookIngress.ts | AEP hook event validation/ingestion | lib (bridgeServer, adapters, scaffold) | REAL | Y | 883 lines; replay/skew/rate-limit guards |
| bridgeConfigStore.ts | Load/save/sign bridge config | lib (many: workspace, cgx, bootstrap) | REAL | N | signed-file pattern |
| hookControl.ts | Provider hook allow/deny decisions | lib (adapters, bridgeServer) | REAL | Y | 1370 lines; ledger-backed idempotency |
| bridgeConfigSchema.ts | Zod schema + default config | lib | REAL | N | |
| hookActionIdentity.ts | Deterministic hook action identity hashing | lib (hookIntegration, hookControl) | REAL | N | |
| bridgeRoutes.ts | Route match → model intent dispatch | lib (bridgeServer) | REAL | N | |
| bridgeReceipts.ts | Request/response/audit receipt appends | lib (bridgeServer) | REAL | N | |
| modelTaxonomy.ts | Signed provider/model allowlist file | lib (workspace, bootstrap, enforcer) | REAL | N | |
| compat/* (6 files) | Per-provider request-intent parsers | lib (bridgeRoutes) | REAL | N | 11–33 lines each; local wraps openai |
| tests/fakeProviders/* (5 files) | Canned local HTTP provider fakes | tests only | REAL | Y | honest test doubles under src/ |
| tests/fixtures/openai-chat.json | Sample chat fixture | ORPHAN | DEAD | N | referenced nowhere |

### src/bench

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| benchCli.ts | `amc bench` command surface | CLI:cli.ts | REAL | N | also used by e2e/smoke |
| benchApi.ts | Bench ops for API/studio | API:workspaceRouter, studio | REAL | Y | |
| benchCollector.ts | Aggregate runs/assurance/forecast into artifact | lib (benchArtifact, benchComparer) | REAL | N | 646 lines; reads real workspace data |
| benchArtifact.ts | Create/inspect signed bench artifacts | CLI/API + passport, standard | REAL | Y | |
| benchVerifier.ts | Verify artifact signature/proofs | CLI/API, verifyAll | REAL | Y | |
| benchComparer.ts | Percentiles vs imported population | CLI/API | REAL | Y | k-medoids peers; trust warnings |
| benchPercentiles.ts | Percentile table, k-medoids clustering | lib (benchComparer) | REAL | N | real math, 231 lines |
| benchProofs.ts | Merkle/transparency proof bundles | lib (assurance, passport, audit) | REAL | N | |
| benchSigner.ts | Sign/verify bench digests | lib (verifier, artifact) | REAL | N | |
| benchRegistryServer.ts | Init/publish/serve bench registry | CLI/API | REAL | Y | real HTTP server |
| benchRegistryClient.ts | Browse/import from registry over HTTP | CLI/API, verifyAll | REAL | Y | real fetch |
| benchRegistryStore.ts | Cache/store imported benches | lib (client, api, verifyAll) | REAL | N | |
| benchPolicyStore.ts | Signed bench policy file store | lib (workspace, cgx, studio) | REAL | Y | |
| benchPolicySchema.ts | Zod policy schema | lib (store, cli, collector) | REAL | N | |
| benchSchema.ts | Artifact/comparison zod schemas | lib (benchmarks/*, standard) | REAL | N | |
| benchRegistrySchema.ts | Registry config schema | lib | REAL | N | |
| benchRedaction.ts | Hash ids, PII scan | lib (cgx, prompt, collector) | REAL | Y | |
| benchSse.ts | Emit bench SSE event | studio | REAL | N | 22 lines |

### src/workspaces

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| workspaceRouter.ts | Host-mode HTTP API (auth, workspaces, portfolio) | studio (studioSupervisor) | REAL | Y | 1792 lines |
| hostDb.ts | SQLite host DB: users, memberships, SCIM | lib (identity, scim, studio) | REAL | Y | 1247 lines; better-sqlite3 |
| hostAuth.ts | scrypt password hash, HMAC session tokens | lib (hostDb, workspaceRouter) | REAL | Y | timing-safe compare |
| hostCli.ts | Host user/workspace admin CLI ops | CLI:cli.ts | REAL | Y | |
| hostBootstrap.ts | First-run host dir + admin creation | CLI:cli.ts, setup | REAL | N | |
| hostSchema.ts | Host role types | lib (hostDb, roleMapping) | REAL | N | |
| workspaceManager.ts | Workspace cache/resolution + readiness checks | lib (workspaceRouter) | REAL | N | verifies 15+ policy signatures |
| workspaceId.ts | Workspace id normalize/validate | CLI + lib (widely) | REAL | Y | 17 test files |
| workspacePaths.ts | Host dir layout, path containment | studio + lib | REAL | Y | |
| workspaceResolver.ts | Host-mode vs single-dir resolution | lib (workspaceManager) | REAL | N | |
| workspaceContext.ts | Context interface | lib (workspaceManager) | REAL | N | types only |
| workspaceApi.ts | Health/list wrappers | ORPHAN | DEAD | N | nothing imports it |
| workspaceCli.ts | List-workspaces helper | ORPHAN | DEAD | N | no CLI registers it |
| workspaceSse.ts | Host event types | ORPHAN | DEAD | N | types only, unused |
| workspaceSchema.ts | Workspace record zod schema | ORPHAN | DEAD | N | hostDb defines its own |

### src/mirofish

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| cli.ts | `amc mirofish` run/list/compare/stress | CLI:cli.ts | REAL | N | |
| engine.ts | Seeded Monte Carlo behavior→layer simulation | lib (cli) | REAL | Y | honest simulator; hardcoded weight matrix |
| types.ts | Scenario/result zod schemas | lib | REAL | Y | |
| format.ts | Text/markdown renderers | lib (cli) | REAL | Y | |
| scenarios.ts | Load built-in/custom YAML scenarios | lib (cli) | REAL | Y | |
| scenarios/*.yml (6 files) | Built-in behavior profiles | lib (scenarios.ts) | REAL | Y | data packs, 23–71 lines |

### src/enterprise

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| tiers.ts | FREE/PRO/ENTERPRISE feature matrices | lib (intra: license, gates, cli) | REAL | N | |
| license.ts | Signed license validate/activate/status | CLI:cli-late-stage | REAL | Y | signature path works only with publicKey |
| gates.ts | Feature gate checks by tier | ORPHAN | DEAD | N | gating never enforced anywhere |
| packRegistry.ts | Industry-pack tier availability | ORPHAN | DEAD | N | duplicates naming of src/packs/packRegistry |
| sso.ts | SAML/OIDC claim validation, sessions | ORPHAN (tests only) | REAL | Y | src never imports; identity/ has own SSO |
| fleetGovernance.ts | Tenant quotas/usage/compliance file store | CLI:cli-late-stage | REAL | Y | |
| enterpriseCli.ts | status/activate/audit-export commands | CLI:cli-late-stage | PARTIAL | N | passes `publicKey: undefined as never` — activation always invalid/FREE |

### src/business

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| riskQuantification.ts | Maturity→expected-annual-loss model | CLI:cli-business-commands | REAL | Y | hardcoded multipliers, $50k default; assumptions disclosed |
| roiCalculator.ts | Trust-gap ROI report | CLI:cli-business-commands | REAL | Y | derived from riskQuantification |
| fairScenario.ts | FAIR-style scenario analysis | CLI:cli-business-commands | REAL | Y | |
| grcExport.ts | GRC treatment plan md/csv export | CLI:cli-business-commands | REAL | Y | |
| riskHeatmap.ts | Portfolio risk heatmap md/json | CLI:cli-business-commands | REAL | Y | 591 lines |

### src/bom

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| bomGenerator.ts | Maturity BOM from real run+assurance | CLI:cli.ts, API:bomRouter | REAL | Y | includes git metadata, sha256 |
| bomVerifier.ts | Verify BOM vs workspace state | CLI:cli.ts, API:bomRouter | REAL | Y | |
| bomSchema.ts | BOM zod schema | lib (transparency) | REAL | N | |

### src/cert

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| trustCertificate.ts | ed25519-signed trust certs + hash chain | CLI:cli.ts, API:cryptoRouter | REAL | Y | unsigned-preview mode clearly claim-bounded |
| badgeGenerator.ts | shields.io-style SVG badge | CLI (dynamic import) | REAL | Y | |

### src/i18n

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| i18nFramework.ts | Locale metadata, ~40-key string table, t() | ORPHAN-barrel | PARTIAL | Y | English-only; t() never called by CLI/reports |

### src/importers

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| neutralImporter.ts | Import foreign traces/configs → AMC artifacts | CLI:cli-import-commands, API:importerRouter | PARTIAL | Y | 1041 lines; fabricates diagnostic scores + integrityIndex 0.72 heuristically (marked UNSIGNED) |

#### Findings — B16
- Dead cluster in src/workspaces: workspaceApi, workspaceCli, workspaceSse, workspaceSchema unreferenced; hostDb/router reimplement their roles.
- Enterprise gating is decorative: gates.ts and packRegistry.ts have zero importers — no code path enforces tier features; sso.ts is test-only (identity/ has the real SSO).
- enterpriseCli calls license validation with `publicKey: undefined as never`, so `amc enterprise activate/status` can never report a valid license — signed-license flow unreachable from CLI.
- neutralImporter writes synthetic diagnostic run reports (heuristic levels 2–4, hardcoded integrityIndex 0.72) into runsDir; mitigated by UNSIGNED status but still enters the run store.
- Files >800 lines: workspaceRouter (1792), bridgeServer (1377), hookControl (1370), hostDb (1247), neutralImporter (1041), hookIngress (883).
- i18nFramework claims 20 locales/multilingual foundation but ships English-only strings and is exported solely through the index.ts barrel — no runtime caller.
- src/bridge/tests/fixtures/openai-chat.json is dead; fakeProviders live under src/ though used only by one test.
- Core bridge/bench/workspaces code is genuinely real: actual upstream proxying, ed25519/scrypt crypto, SQLite host DB; mirofish is honestly labeled Monte Carlo simulation (hardcoded weight matrix).

---

## B17

### src/benchmarks
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| benchExport.ts | Build signed tar benchmark artifact | CLI + API:benchmarkRouter + studio | REAL | Y | Signs digest, appends transparency entry |
| benchImport.ts | Verify and extract benchmark bundles | CLI + API:benchmarkRouter | REAL | Y | Also used by federationSync |
| benchVerify.ts | Verify artifact signature/digest | CLI + API:benchmarkRouter | REAL | Y | — |
| benchStore.ts | List imported benchmark artifacts | CLI + API + studio | REAL | Y | Also orgEngine, dashboard |
| benchStats.ts | Aggregate percentile stats by group | CLI + API + studio | REAL | Y | — |
| benchSchema.ts | Zod schema for artifacts | lib | REAL | N | Intra-dir consumers only |
| benchRunner.ts | Derive category benchmark scores | CLI:bench run | FACADE | Y | Latency/cost/safety derived from maturity proxies, not measured |
| benchCli.ts | Parse --group-by flag | ORPHAN | DEAD | N | 8 lines, never imported |
| providerDriftBenchmark.ts | Compare baseline/candidate canary rows | CLI + API + watch | REAL | Y | 4102 lines; compares supplied rows, executes nothing |
| replayBenchmarkCorpus.ts | Threshold receipts per external benchmark | CLI + API:benchmarkRouter/shield/watch | PARTIAL | Y | 29,468 lines; validates supplied hashes, replays nothing |
| provider drift adapters (7 files: helm/humanloop/inspect/patronus/promptLayer/promptfoo/tensorZero) | Vendor-branded drift proof wrappers | API:watch/score/shield/benchmark + watch | PARTIAL | Y | Near-clones; hash/metadata envelopes only, zero vendor API calls |
| evalHarness.ts | Experiment config/runner/report | ORPHAN | REAL | Y | Test-only; runner injected by caller |
| academicPaper.ts | Generate paper sections from eval | ORPHAN | REAL | Y | Test-only; imports evalHarness |
| consortium.ts | Multi-org anonymized benchmark pool | ORPHAN | REAL | Y | Test-only; no product wiring |
| frontierBaseline.ts | Gap analysis vs frontier models | ORPHAN | FACADE | Y | Hardcoded invented GPT-4/Claude "measured" scores |
| globalIndex.ts | JSONL/dataset-card export, pseudonyms | lib | REAL | Y | Via publicLeaderboard → CLI |
| huggingFacePublisher.ts | Build offline HF publish plan | lib | REAL | Y | Plan only; never uploads |
| publicLeaderboard.ts | Bundle leaderboard entries + plan | CLI:leaderboard | REAL | Y | cli-business-commands |

### src/value
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| valueApi.ts | Value endpoints for studio | studio | REAL | Y | Webhook token check, CSV import |
| valueCli.ts | CLI wrappers for value ops | CLI | REAL | N | — |
| valueStore.ts | Signed YAML/JSON persistence | studio + lib | REAL | Y | Also forecast, passport, workspaces |
| valueReports.ts | Build snapshots/reports with gates | lib | REAL | Y | Orchestrates collector/scoring/risk |
| valueCollector.ts | Collect observed events from ledger | lib | REAL | N | — |
| valueScoring.ts | Normalize KPIs to dimensions | lib | REAL | N | — |
| valueContracts.ts | Zod contract schema + templates | lib | REAL | N | — |
| valueEventSchema.ts | Zod value event schema | lib | REAL | Y | — |
| valuePolicySchema.ts | Zod policy + defaults | lib | REAL | N | — |
| valueEvidenceGates.ts | Evidence sufficiency gate | lib | REAL | Y | — |
| valueRisk.ts | Economic significance, regression detect | lib | REAL | N | — |
| valueAttribution.ts | Attribute value to agents | lib | REAL | Y | — |
| valueVerifier.ts | Verify signed value files | lib | REAL | N | Used by valueCli |
| valueScheduler.ts | Cadence-based snapshot tick | studio | REAL | N | — |
| valueRedaction.ts | Suspicious-string payload scan | lib | REAL | N | Used by valueApi |
| valueSse.ts | Emit value SSE events | studio | REAL | N | — |
| valueSigner.ts | Sign value file wrapper | ORPHAN | DEAD | N | 5 lines, never imported |
| connectors/ (3 files: csvImport, webhookIngest, localMetricsAdapter) | Thin wrappers over valueApi | ORPHAN | DEAD | N | Nothing imports connectors dir |

### src/cgx
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| cgxBuilder.ts | Build compliance graph from workspace | lib | REAL | Y | 632 lines; only cgxApi imports it |
| cgxStore.ts | Graph/pack persistence + signatures | CLI + studio + lib | REAL | Y | 11 external importers |
| cgxSchema.ts | Zod graph/pack/policy schemas | lib | REAL | Y | — |
| cgxCli.ts | CLI build/init/show/verify | CLI | REAL | Y | — |
| cgxApi.ts | Studio graph endpoints | studio | REAL | N | Also mechanic/upgradePlanner |
| cgxContextPack.ts | Build agent context pack | lib | REAL | N | Used by promptCompiler |
| cgxDiff.ts | Diff graph snapshots | CLI | REAL | N | — |
| cgxSimulator.ts | Edge-walk impact propagation | CLI | REAL | N | — |
| cgxPropagation.ts | Semantic edges, risk propagation, CI gates | CLI | REAL | Y | 734 lines; overlay on base graph |
| semanticCodeEdges.ts | Scan repo into code graph | CLI:cgx code-scan | REAL | N | Regex import/call scan, not AST |
| cgxVerifier.ts | Verify workspace graph signatures | lib | REAL | N | Used by verify/verifyAll |
| cgxSse.ts | Emit CGX SSE events | studio | REAL | N | — |
| cgxSigner.ts | Sign policy/graph/pack wrappers | ORPHAN | DEAD | N | Never imported |
| cgxQuery.ts | Filter graph nodes/edges | ORPHAN | DEAD | N | Never imported |

### src/transformation
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| transformPlanner.ts | Build signed transform plan from gaps | CLI + lib | REAL | Y | 697 lines; loop.ts, forecast use it |
| transformTracker.ts | Evidence-checked task completion | CLI + lib | REAL | N | Trust-tier gating vs run evidence |
| transformTasks.ts | Plan schema, persistence, 4C summary | lib | REAL | N | 7 external importers incl. cgx |
| transformCli.ts | CLI wrappers | CLI | REAL | N | — |
| transformApi.ts | Studio/mechanic transform endpoints | studio | REAL | N | Also autoAnswerEngine |
| transformReports.ts | Markdown progress reports | studio + CLI | REAL | N | — |
| transformAttestations.ts | Signed human attestation files | lib | REAL | N | — |
| transformScoring.ts | percentDone/topBlockers/nextTasks | lib | REAL | N | — |
| transformMapSchema.ts | Zod transform map schema | lib | REAL | N | Also pluginLoader |
| builtInTransformMap.ts | Per-question remediation playbook | lib | REAL | N | Maps questionBank → 4C tasks |
| fourCs.ts | 4C constants/definitions | lib | REAL | N | — |
| transformSse.ts | Emit transform SSE events | ORPHAN | DEAD | N | Never imported, unlike value/cgx SSE |

### src/crypto
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| keys.ts | Ed25519 keygen/sign/verify + history | CLI + lib | REAL | Y | ~103 importers; core trust primitive |
| signing/signer.ts | Sign via vault or remote notary | lib | REAL | Y | Spawns node subprocess for sync HTTP |
| signing/signerTypes.ts | Signature type definitions | lib | REAL | N | — |
| signing/signatureEnvelope.ts | Envelope verification | lib | REAL | N | 10 importers |
| signing/signerVault.ts | Local vault-key signing | lib | REAL | N | — |
| signing/signerNotary.ts | Async HTTP notary client | ORPHAN | DEAD | N | Duplicates signer.ts notary path, unused |

### src/runtimes
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| index.ts | Runtime registry + detect-all | lib | REAL | N | workspace.ts; CLI adapters doctor |
| common.ts | Detection, spawn harness, JSON retries | lib | REAL | N | Interactive paste-JSON fallback on failure |
| CLI adapters (3 files: claudeCliRuntime, geminiCliRuntime, openclawCliRuntime) | Detect installed CLI runtimes | lib | REAL | N | Detection only; execution via config argsTemplate |
| mockRuntime.ts | Mock runtime for tests | lib | REAL | N | — |

### src/tickets
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| execTicketVerify.ts | Issue/verify signed exec tickets | CLI + API:workflowRouter + toolhub | REAL | Y | Ed25519 over canonical payload, TTL, nonce |
| execTicketSchema.ts | Zod ticket payload schema | lib | REAL | N | — |
| execTicketCli.ts | Parse TTL/action-class args | CLI + studio + API | REAL | N | — |

### src/learning
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| correctionMemory.ts | Extract lessons, inject advisories, drift | CLI + API:memoryRouter | REAL | Y | 646 lines; SQLite; used by fixGenerator |
| reasoningMemory.ts | Episode-derived signed memory items | CLI + API:memoryRouter | REAL | Y | 676 lines; consumer-scoped retrieval |

### src/harness
| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| (none) | Directory empty | — | — | — | 0 files; bucket listed it but nothing exists |

#### Findings — B17
- src/harness is empty: 0 files despite being an assigned/claimed area.
- Orphan research cluster in benchmarks: evalHarness, academicPaper, consortium, frontierBaseline — tested but wired to nothing in the product.
- frontierBaseline is a facade: hardcoded, invented GPT-4/Claude/Gemini "measured" baseline scores (dated 2026-03-15) driving gap analysis.
- benchRunner facade: "latency/cost/safety" benchmark categories are arithmetic proxies of maturity scores; nothing is ever benchmarked.
- Size outliers: replayBenchmarkCorpus.ts (29,468 lines) and providerDriftBenchmark.ts (4,102) — both validate caller-supplied hashes/metrics; no replay or canary execution happens anywhere.
- 7 vendor-branded provider-drift adapters (HELM, Humanloop, Inspect, Patronus, PromptLayer, Promptfoo, TensorZero) are near-clone hash-envelope wrappers with zero vendor API integration, mirrored again in src/watch and 4 API routers.
- Dead files: benchCli.ts, valueSigner.ts, value/connectors (all 3), cgxSigner.ts, cgxQuery.ts, transformSse.ts, crypto/signing/signerNotary.ts (duplicates signer.ts's notary path).
- Transformation subsystem (12 files, ~2,100 lines) has no direct tests — only an indirect "plan created" assertion in universalAgentIntegrationLayer.test.ts.

---

## B18 — src/api, src/eval, src/release, src/federation, src/repl, src/workorders, src/lanes

### src/api

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| index.ts | Central /api/v1 dispatcher + route-family metadata | studio (apiDelegation.ts) | REAL | Y | 538 lines; mounts 40 routers |
| apiCli.ts | `amc api` status/routes/start/docs/key commands | CLI:api | REAL | Y | key mgmt real; start aliases `amc up` |
| apiHelpers.ts | JSON body parse, errors, proto-pollution guard | lib (all routers) | REAL | Y | 1MB body cap, dangerous-key filter |
| accessPolicy.ts | RBAC role-to-access-class mapping | lib (apiDelegation) | REAL | Y | enforced in studio auth path |
| health.ts | Health payload with real ledger/score DB probes | lib (index.ts) | REAL | N | no direct test found |
| scoreStore.ts | SQLite diagnostic session store | lib (scoreRouter, studio) | REAL | Y | pooled better-sqlite3 |
| scoreRouter.ts | Score/diagnostic API, judge-calibration receipts | API:index.ts | REAL | Y | 957 lines, >800 |
| delegating routers (31 files: adapters, agentTimeline, assurance, benchmark, bom, canary, ci, compliance, config, crypto, drift, enforce, evidence, export, fleet, gateway, governor, identity, incident, memory, metrics, observe, passport, product, sandbox, security, shield, tools, vault, watch, workflow) | Thin CLI-parity routes delegating to real domain modules | API:index.ts | REAL | Y | dynamic-import real engines; no synthetic output found |
| untested routers (7 files: domainProof, firewall, fixer, importer, orgRun, runtime, strategy) | Same thin-delegation pattern | API:index.ts | REAL | N | not exercised by apiRouters.test.ts |

### src/eval

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| evalCli.ts | `amc eval import/status` commands | CLI:eval | REAL | Y | thin wrapper over evalImporters |
| evalRunCli.ts | `amc eval run` full diagnostic, json/html/terminal | CLI:eval run | REAL | Y | runs real diagnostic runner |
| evalImporters.ts | Parse OpenAI/LangSmith/DeepEval/promptfoo/W&B/Langfuse/LangWatch exports to ledger | lib (evalCli) | REAL | Y | 1972 lines, >800 |
| evaluatorRegistryMetadata.ts | Signed evaluator inventory manifest | CLI (dynamic import cli.ts) | REAL | Y | explicit "not evaluator-result evidence" boundary |
| judgeCalibration.ts | Judge calibration receipts, alerts, verification | lib (watch/score/shieldRouter) | REAL | Y | 1291 lines, >800 |
| effectAutoAgentReplayCorpus.ts | Replay-gate receipt builder for agent corpus | ORPHAN-barrel | REAL | Y | only src/index.ts re-export |
| replayCorpusEvidenceReceipt.ts | Eval replay corpus evidence receipt | lib (diagnostic boundary) | REAL | Y | fail-closed hashing |
| llmJudgeEngine.ts | LLM-as-judge core, 15+ metric prompts | lib (via extendedLLMJudge) | FACADE | N | callJudgeModel returns hardcoded {score:0.8, "Mock judge response"} |
| extendedLLMJudge.ts | Extended judge metrics atop engine | lib (evaluatorRegistryMetadata) | FACADE | N | inherits mock call; prod uses only getMetricCategories() |
| amcJudgeIntegration.ts | Judge results into AMC metrics registry | ORPHAN | FACADE | N | never imported; scores come from mock |
| llmApiIntegration.ts | Real OpenAI/Anthropic fetch client for judges | ORPHAN | REAL | N | the fix for the mock — never wired to engine |
| llmJudgeCli.ts | Commander CLI for judge runs | ORPHAN | DEAD | N | never registered in cli.ts |
| customAssertionEngine.ts | User JS/Python grading functions, weighted sets | ORPHAN | REAL | Y | tests-only consumer; real child-process exec |
| costLatencyAssertions.ts | Per-eval cost/latency/token threshold assertions | ORPHAN | REAL | Y | tests-only consumer |

### src/release

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| releaseCli.ts | `amc release` command family | CLI:release | REAL | Y | registered cli.ts:663 |
| releaseBundle.ts | Runs `npm pack`, tarball safety checks | lib (releaseCli, e2e) | REAL | Y | rejects unsafe files in tarball |
| releaseManifest.ts | Manifest build with real git info | lib | REAL | Y | spawnSync git |
| releaseSigner.ts | ed25519 keygen/sign/verify of manifests | lib | REAL | Y | real node:crypto, env-supplied key |
| releaseVerifier.ts | Verify manifest+signature+hashes | lib (verifyAll, notary) | REAL | Y | |
| releaseSbom.ts | SBOM from package-lock parsing | lib (bomRouter) | REAL | Y | |
| releaseLicenses.ts | License inventory from lockfile | lib | REAL | Y | |
| releaseSecretScan.ts | Regex secret scan with schema'd findings | lib | REAL | Y | |
| releaseProvenance.ts | Provenance doc with output hashes | lib | REAL | Y | |
| releaseSchema.ts | Zod schemas for release artifacts | lib | REAL | Y | |
| releasePaths.ts | Release/key directory path helpers | lib | REAL | Y | |
| releaseUtils.ts | tmp dir + cleanup helpers | lib | REAL | Y | |

### src/federation

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| federationCli.ts | `amc federate` init/peer/export/import | CLI:federate | REAL | Y | cli.ts:453 |
| federationSync.ts | Signed tar bundle export/import/verify | lib (federationCli) | REAL | Y | file-based exchange; no network peer sync |
| federationStore.ts | Signed peer/config store | lib | REAL | Y | auditor-signed digests |
| federationIdentity.ts | Vault-backed publisher keypair | lib | REAL | Y | requires unlocked vault |
| federationSchema.ts | Zod federation config schema | lib | REAL | Y | |
| federationVerify.ts | 5-line wrapper around verifyFederationPackage | ORPHAN | DEAD | N | no importers anywhere |

### src/repl

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| amcRepl.ts | Interactive REPL loop, spawns real CLI | CLI:repl (bare `amc`) | REAL | Y | child-process execution, cancel support |
| replCli.ts | Registers repl Commander command | CLI:repl | REAL | Y | |
| replParser.ts | "Natural language" to command via keyword patterns | lib (amcRepl) | REAL | Y | no LLM — pure keyword matching, as documented |
| replContext.ts | In-memory session state | lib | REAL | Y | |
| replRenderer.ts | Chalk terminal rendering | lib | REAL | Y | |
| index.ts | Barrel re-exports | ORPHAN-barrel | DEAD | N | nothing imports it; cli.ts imports replCli directly |

### src/workorders

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| workorderCli.ts | Parse action-class/risk-tier flags | CLI (cli.ts:282) | REAL | Y | |
| workorderEngine.ts | Signed work orders: create/verify/revoke | CLI + API:workflowRouter | REAL | Y | real crypto signing, 7 test files |
| workorderSchema.ts | Zod work-order schema | lib (engine) | REAL | Y | |

### src/lanes

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| simulationForecastLane.ts | 5-dimension simulation/forecast scoring lane | CLI (dynamic) + API:scoreRouter | REAL | Y | activates only for 3 system types |
| safetyResearchLane.ts | 4-dimension safety-research alignment lane | CLI (dynamic) + API:scoreRouter | REAL | Y | delegates to real score/ modules |

#### Findings — B18
- FACADE core: `eval/llmJudgeEngine.ts` `callJudgeModel` returns hardcoded `{score:0.8, "Mock judge response for testing"}`; `extendedLLMJudge.ts` and orphan `amcJudgeIntegration.ts` inherit it — any judge "score" from this stack is fake.
- The real fix exists but is unwired: `eval/llmApiIntegration.ts` implements genuine OpenAI/Anthropic fetch clients yet has zero importers; `llmJudgeCli.ts` (the judge CLI) is never registered in cli.ts — dead.
- Orphan cluster in src/eval: 5 of 14 files (amcJudgeIntegration, llmApiIntegration, llmJudgeCli, customAssertionEngine, costLatencyAssertions) have no production importer; the latter two are exercised only by their own tests.
- `federation/federationVerify.ts` and `repl/index.ts` are DEAD (zero importers); federation "sync" is file/tar exchange only — no network peer protocol despite the name.
- Files >800 lines: eval/evalImporters.ts (1972), eval/judgeCalibration.ts (1291), api/scoreRouter.ts (957).
- src/api is healthy: 45 files, all wired through the index dispatcher or CLI, thin delegation to real engines, no synthetic-output markers found; but 7 routers (domainProof, firewall, fixer, importer, orgRun, runtime, strategy) have no test coverage.
- Router headers claim "full CLI parity" per domain — unverified claim, parity not checked here; watchRouter/governorRouter/toolsRouter overlap coverage of `amc governor`/`amc guardrails` suggests duplicated route ownership.
- release/, workorders/, lanes/ are uniformly REAL with genuine crypto (ed25519 signing, npm pack inspection, signed work orders) and test coverage.

---

## B19 — src root loose files

### src (root .ts files)

| file | purpose | wired via | status | tests | note |
|---|---|---|---|---|---|
| cli.ts | Monolithic `amc` CLI entry, ~990 commands | CLI:amc (package bin) | PARTIAL | Y | 24,395 lines; mock-report + random red-team facades inside |
| index.ts | Public SDK barrel re-exporting ~360 symbols | lib (package.json main/exports) | REAL | Y | 2,485 lines; nothing in src imports it |
| types.ts | Core shared type definitions (175 exported types) | lib (193 src importers) | REAL | Y | 4,317 lines, types only |
| version.ts | Reads package.json version | lib (cli, api, sdk, notary) | REAL | Y | tiny, safe fallback |
| workspace.ts | Workspace init, config profiles, doctor, quickstart wizard | CLI:init/doctor/quickstart + lib | REAL | Y | real runtime/docker/signature checks; ~99 test importers |
| cliFormat.ts | Branded terminal output helpers (boxes, bars, tables) | lib (cli.ts dynamic imports) | REAL | Y | pure formatting |
| cliUx.ts | Grouped help, command suggestions, shell completions | lib (cli.ts help/error path) | REAL | Y | edit-distance suggester + bash/zsh/fish completion |
| cli-late-stage-commands.ts | Aggregator: demo, redteam, pack, costs, rate, sessions, enterprise | CLI:many (called cli.ts:24345) | REAL | Y | 1,561 lines; thin wrappers; e2e via dist/cli.js |
| cli-business-commands.ts | business kpi/risk/roi, executive brief, leaderboard, inventory, comms-check | CLI:business etc. (via late-stage) | PARTIAL | Y | kpi "business impact" = hardcoded level×18 formulas |
| cli-domain-product-commands.ts | Industry pack paywall/checkout, product features, domain assess | CLI:product/domain (cli.ts:22173) | REAL | N | wraps domains/ entitlement + assessment libs |
| cli-eval-dataset-commands.ts | Dataset CRUD/import + run vs gateway; lite-score | CLI:dataset, lite-score (via late-stage) | REAL | N | real HTTP eval loop; lite-score filters real diagnostic |
| cli-import-commands.ts | Neutral trace import/list/show/rollback | CLI:import, imports (via late-stage) | REAL | N | wrapper over importers/neutralImporter (lib tested) |
| cli-observability-commands.ts | observe timeline/anomalies; correction tracking | CLI:observe, correction (via late-stage) | REAL | N | sqlite-backed via corrections/ store |
| cli-strategy-commands.ts | Inference strategy compare/rollback | CLI:strategy (via late-stage) | REAL | N | wrapper over enforce/inferenceStrategy |
| cli-trace-commands.ts | Trace explorer + webhook/SIEM alerts | CLI:trace, alert (via late-stage) | REAL | N | minor bug: prints `agent=${s.runtime}` |
| cli-watch-commands.ts | Legacy monitor-legacy command registration | ORPHAN (imported, never called) | DEAD | N | body returns immediately; "already registered in cli.ts" |
| cli-new-commands.ts.fragment | Scratch fragment: shield/enforce/watch/product commands | ORPHAN (not .ts, never compiled) | DEAD | N | 506 lines; commands since merged into cli.ts |
| .DS_Store | macOS folder metadata | ORPHAN | DEAD | N | junk, should be gitignored |

#### Findings — B19
- cli.ts is a 24,395-line / 1.04MB monolith with ~990 `.command()` registrations — 30× over the stated 800-line file cap; late-stage (1,561), business (1,100), types (4,317), index (2,485) also exceed it.
- FACADE in cli.ts: `operator-dashboard`, `why-capped`, `action-queue`, `confidence-heatmap` silently fall back to `buildMockReportForUx()` (line 19216) — hardcoded scores/flags rendered as a real diagnostic when no run exists.
- FACADE in cli.ts: `amc shield red-team` evaluator is `Math.random() < 0.2` with `response: "simulated"` (line ~20123); printed success rates and regression counts are random noise.
- `business kpi` presents heuristic formulas (riskReduction = level×18%, "$⟨level×18000⟩k annual savings") as business KPIs with no real business data input.
- Dead code: cli-watch-commands.ts is imported by cli.ts but never invoked, and its body is a hard `return` above 170 unreachable lines; cli-new-commands.ts.fragment is a 506-line leftover duplicating shield/enforce/product commands now in cli.ts.
- index.ts barrel is only consumed by package consumers/tests — no src file imports it, so drift between barrel and modules would not break the build.
- Eight of ten cli-* satellite files have zero direct tests; coverage is indirect via dist/cli.js e2e runs, and cli-business "tests" are string-contains assertions on source text.
- Minor correctness bug in cli-trace-commands.ts `trace list`: prints `agent=${s.runtime}` (runtime shown where agent id claimed).

---

# AMC Test Suite Map — Coverage Gap Report

## 1. Per-subdirectory table

1,118 files total under `tests/`; 1,013 sit at the root (flat, not in subdirs), 1,098 are `*.test.ts` (vitest-included), 12 are `.spec.ts` (Playwright), plus fixtures/helpers.

| dir | files | what it covers |
|---|---|---|
| tests/ (root) | 1,013 | Bulk of suite: 545 `gapNNNN*` vendor-boundary tests, 19 `amcNNNN*` ticket tests, ~448 feature tests (scoring, passports, vault, trust, CLI, watch, adversarial, website content) |
| assurance/ | 7 | Adversarial/assurance packs: MCP security, PII leakage, zombie agents, economic amplification |
| badge/ | 1 | Badge CLI |
| benchmarks/ | 1 | Bench runner |
| compliance/ | 1 | Compliance matrix |
| diagnostic/ | 3 | Full diagnostic run, quickscore share, trace-evidence mapper |
| dx/ | 1 | Quickstart developer experience |
| e2e/ | 15 | Playwright specs (homepage, docs routing, brand, a11y, i18n, theme) + own playwright.config.ts — **not run by vitest or CI** |
| enforce/ | 1 | Resource manifest |
| evaluation/ | 1 | Property-based score-consistency test |
| fixtures/ | 3 | JSON fixtures (gap regression, drift canary, replay corpus) |
| guide/ | 2 | `amc fix` CLI, framework guide |
| hallucination/ | 1 | Hallucination detection |
| helpers/ | 1 | Live-drift evidence helper |
| integration/ | 1 | Webhook event system |
| integrations/ | 1 | CI gate |
| lifecycle/ | 6 | Receipts (change/decision), episode records, finding proofs, observability lane |
| lint/ | 1 | Lint rules |
| mechanic/ | 1 | Tune export |
| mirofish/ | 3 | Mirofish engine/format/scenarios |
| observability/ | 3 | Cost tracker, metrics server, session correlator |
| outcomes/ | 1 | Quality signals |
| performance/ | 3 | Ingest pipeline, ledger concurrency, scoring engine perf |
| redteam/ | 1 | Attack plugins |
| score/ | 28 | Scoring dimensions: OWASP LLM, EU AI Act, memory integrity, autonomy, interpretability, NLP/safety metrics |
| security/ | 11 | Security scenarios: jailbreak, tenant isolation, crypto, command injection, tampering (imports crypto/notary/ledger — only 2 files touch `src/security/`) |
| setup/ | 2 | Onboarding state, quick-setup CLI |
| telemetry/ | 1 | Telemetry |
| watch/ | 4 | Continuous monitor, monitor CLI, observability bridge, realtime assurance |

## 2. KEY DELIVERABLE — src/ top-level directory test coverage

Evidence = count of test files importing `src/<dir>/` (grep of `tests/`, cross-checked by module basenames for zero-hit dirs). **Partial** = ≥1 importer but small vs module count; **N** = zero importers and zero module-name imports.

| src dir | tested? | evidence |
|---|---|---|
| adapters | Y | 14 importers |
| agents | Y | 6 |
| api | Y | 125 |
| approvals | Y | 19 |
| archetypes | Y | 1 (dir has 1 module) |
| artifact | Y | 1/1 module |
| assurance | Y | 56 |
| audit | Y | 19 |
| auth | Y | 11 |
| badge | Y | 92 |
| bench | **partial** | 1 importer vs 18 modules |
| benchmarks | Y | 165 |
| bom | Y | 3 |
| **bootstrap** | **N** | 0 importers |
| brand | Y | 2/1 module |
| bridge | Y | 12 |
| budgets | Y | 5 |
| bundles | Y | 3 |
| business | Y | 5 |
| canon | **partial** | 1 vs 7 modules |
| **casebooks** | **N** | 0; casebookRunner/Store/Schema never imported |
| cert | Y | 2/2 modules |
| cgx | **partial** | 3 vs 14 modules |
| ci | Y | 12 |
| claims | Y | 13 |
| cli | Y | 20 (incl. src/cli.ts) |
| compliance | Y | 41 |
| config | Y | 4 |
| console | Y | 31 (but excluded from coverage config) |
| context | Y | 1/1 |
| corrections | Y | 6 |
| correlation | **partial** | 1 vs 4 |
| crypto | Y | 27 |
| dashboard | Y | 6 (excluded from coverage config) |
| demo | Y | 3 |
| diagnostic | Y | 371 (most-imported) |
| doctor | Y | 4 |
| dogfood | Y | 1/1 |
| domainProof | Y | 5 |
| domains | Y | 11 |
| drift | Y | 58 |
| **e2e** | **N** | 0; smoke/smokeSteps/smokeCli never imported |
| enforce | Y | 37 |
| enterprise | **partial** | 1 vs 7 |
| **eoc** | **N** | 0; flows.ts never imported |
| eval | Y | 75 |
| evidence | **partial** | 2 vs 4 |
| **executive** | **N** | 0; brief.ts never imported |
| experiments | Y | 3 |
| exports | Y | 2/3 |
| federation | **partial** | 1 vs 6 |
| fleet | Y | 49 |
| forecast | **partial** | 2 vs 18 modules |
| gateway | Y | 14 |
| governor | Y | 22 |
| guardrails | Y | 1/1 |
| guide | Y | 62 |
| hallucination | **partial** | 1 vs 5 |
| **harness** | **N** | empty dir (0 files) |
| i18n | Y | 1 |
| identity | Y | 3 |
| importers | Y | 1/1 |
| incidents | Y | 12 |
| ingest | Y | 4 |
| integrations | Y | 17 |
| lab | Y | 3 |
| lanes | Y | 3 |
| learning | Y | 4 |
| leases | Y | 25 |
| ledger | Y | 45 |
| lifecycle | Y | 41 |
| lint | Y | 3 |
| loop | Y | 2/1 |
| marketplace | **partial** | 1 vs 6 |
| mcp | Y | 5 |
| mechanic | Y | 8 |
| methodology | Y | 152 |
| mirofish | Y | 3 |
| mode | Y | 3 |
| monitor | Y | 5 |
| monitoring | **partial** | 1 vs 2 |
| notary | Y | 3 |
| observability | Y | 18 |
| ops | Y | 14 |
| org | Y | 5 |
| outcomes | **partial** | 2 vs 8 |
| packs | Y | 4 |
| pairing | **partial** | 1 vs 3 |
| passport | Y | 87 |
| playground | **partial** | 1 vs 3 |
| plugins | Y | 7 |
| policyPacks | Y | 4 |
| product | Y | 10 |
| prompt | **partial** | 2 vs 20 modules |
| providers | Y | 1/1 |
| receipts | Y | 7 |
| redteam | Y | 23 |
| release | Y | 3 |
| repl | **partial** | 2 vs 6 |
| runtime | Y | 30 |
| **runtimes** | **N** | 0; claudeCliRuntime/geminiCliRuntime/openclawCliRuntime/mockRuntime never imported |
| sandbox | Y | 1/1 |
| scanner | Y | 3 |
| score | Y | 239 |
| sdk | Y | 6 |
| security | **partial** | 2 vs 3 (tests/security/ mostly imports other dirs) |
| setup | Y | 8 |
| shield | Y | 23 |
| simulator | **partial** | 1 vs 5 |
| snapshot | Y | 2/1 |
| standard | Y | 3 |
| startup | Y | 2/1 |
| steer | Y | 23 |
| storage | Y | 3 |
| studio | Y | 67 |
| targets | Y | 3 |
| telemetry | Y | 1/1 |
| tickets | Y | 3 |
| toolhub | Y | 25 |
| **transformation** | **N** | 0; all 12 modules (transformPlanner, fourCs, transformApi…) never imported |
| transparency | Y | 15 |
| trust | Y | 11 |
| truthguard | Y | 3 |
| **tuning** | **N** | 0; tuneWizard/upgradeEngine never imported |
| unified | Y | 3 |
| utils | Y | 59 |
| value | **partial** | 1 vs 21 modules |
| values | **partial** | 2 vs 4 |
| vault | Y | 26 |
| verify | Y | 2/1 |
| vscode | **partial** | 1 vs 7 |
| watch | Y | 174 |
| workorders | Y | 7 |
| workspaces | Y | 10 |

Top-level src files: `cli.ts` (20), `workspace.ts` (109), `types.ts` (189), `index.ts` (31) tested; **`cli-observability-commands.ts`, `cli-trace-commands.ts`, `cli-watch-commands.ts` have 0 test references**.

**Summary: 9 of 145 src dirs fully untested (bootstrap, casebooks, e2e, eoc, executive, harness [empty], runtimes, transformation, tuning); ~24 partial.**

## 3. Test block count vs README claim

- README.md:850 claims "1,087 files / 8,604 passing Vitest tests".
- Actual: **1,098** `*.test.ts` files (README stale by 11).
- Static `it()`/`test()` line-start blocks: **8,403** (loose regex incl. `.each`/mid-line: 8,470).
- 14 files use `it.each`/`test.each` and ~2 loop-generated tests, so runtime expansion to ~8,604 is plausible — the claim is roughly honest for block count, but see quality below. Zero `.skip`/`.todo` found.

## 4. Test-quality findings

1. **Template-clone GAP tests dominate**: 545 `gap[0-9]*.test.ts` files = **50% of all test files**, contributing 2,093 blocks (~25% of the suite), avg ~4 tests/file. Filenames follow 6 rotating templates × vendor (`PublicMethodologyBoundary` ×74, `ProviderDriftBoundary` ×65, `MetricValidityBoundary` ×64, `QuestionExplainabilityBoundary` ×51, `ReplayCorpusBoundary` ×49, `StudioDrilldownBoundary` ×17, plus "Unavailable" variants). Diffing `gap0003Langfuse…` vs `gap0013LangWatch…` (211 lines each) shows identical skeletons with only vendor URLs/constants swapped.
2. **Documentation-prose assertions, not behavior**: 559 test files assert `expect(doc).toContain(...)` against `docs/source-reviews/*.md`; 2,508 `readFileSync` calls across tests. 14 gap files import no `src/` code at all — they test that markdown mentions vendor names/URLs.
3. **Vacuous assertions**: 70 files contain `toBeGreaterThanOrEqual(0)` (always true for counts/lengths).
4. **Unwired Playwright**: `tests/e2e/` (12 specs + config) is excluded from vitest (`include: ["tests/**/*.test.ts"]` — specs are `.spec.ts`); `@playwright/test` is **not in package.json dependencies** (only `@axe-core/playwright`); no GitHub workflow invokes `test:e2e` — ci.yml runs only `npm test`. The E2E suite runs only via manual `npx playwright test`.
5. **Coverage thresholds all zero**: vitest.config.ts sets lines/functions/branches/statements thresholds to 0 and excludes `src/console/**` and `src/dashboard/**` from coverage — no enforcement despite the 8,604-test headline.
6. **Real risk gaps**: untested `src/runtimes/` (the actual Claude/Gemini/OpenClaw CLI runtime adapters), `src/transformation/` (12 modules), `src/tuning/` (upgradeEngine backing the shipped `amc fix` flow), and 3 untested top-level `cli-*-commands.ts` files.

---

# docs/ Inventory — /Users/sid/AgentMaturityCompass/docs (277 top-level .md + 2 JSON + 11 subdirs; 1,103 files total)

Verified baselines: question bank = **244** questions (dist/diagnostic/questionBank.js), industry packs = **41** / **600** questions, domain stations = **7**, built-in adapters = **15**, score modules = **102** files, assurance packs = **153** files, tests ≈ **8.4k** it/test blocks in 1,040 files, CLI inventory = 1,171 rows / 40 top-level groups.

| Doc | Content | Flag |
|---|---|---|
| ACCESSIBILITY.md | Accessibility statement | OK |
| ACTION_EVIDENCE_LOGIC.md | Action-policy evidence composition | OK |
| ADAPTERS.md / CUSTOM_ADAPTER.md | Adapter system guide + authoring | OK |
| ADAPTER_COMPATIBILITY.md | Adapter capability proof; says "14 built-in" — src has 15 | STALE |
| AFTER_FIRST_SCORE.md | Post-first-score next steps | OK |
| AGENT_CONFIG_SECURITY.md | Agent config scanning | ORPHAN |
| AGENT_COUNCIL_100_RATINGS/_REPORT.md (2) | 100-agent test snapshots, 2026-03 | ORPHAN |
| AGENT_GUIDE.md | Score-driven improvement plans | OK |
| AGENT_PASSPORT.md | `.amcpass` credential | OK |
| AGENT_VS_WORKFLOW.md | Agent/workflow classification standard | OK |
| AMC_LIFECYCLE_COMPLETION_BACKLOG.md | May-2026 gap tracker | ORPHAN |
| AMC_MASTER_REFERENCE.md | CLI reference by category | OK |
| AMC_QUESTIONS_IN_DEPTH.md | Question/option explainers (core subset) | OK |
| AMC_QUESTION_BANK_FULL.json | "Full" bank export with 111 questions vs 244 live | STALE |
| AMC_STANDARD_RFC.md | RFC-style spec v1.0 | OK |
| AMC_TRUST_PROTOCOL.md | Agent-to-agent trust negotiation | OK |
| ANTI_HALLUCINATION.md | Claim-discipline controls | OK |
| API_REFERENCE.md | Auto-generated API docs (2026-07-15) | OK |
| API_SURFACES.md | Three HTTP surfaces | OK |
| APPROVALS.md / DUAL_CONTROL_APPROVALS.md | Quorum approval chains | OK |
| ARCHETYPES.md | Role-default packs | OK |
| ARCHITECTURE_BRIEF/_MAP.md (2) | Code-backed architecture overviews | OK |
| ASSURANCE_CERTS/_LAB.md (2) | Red-team harness + certificates | OK |
| ATTESTATION_EVIDENCE_PATHS.md | Where attestation evidence lives | OK |
| AUDIT_50_AGENTS_BATCH1–10.md (10) | Persona/CLI audit snapshots, 2026-03; 8 of 10 unreferenced | ORPHAN |
| AUDIT_BINDER.md | `.amcaudit` export | OK |
| AUDIT_SAFETY_RESEARCH_LANE.md | Lane audit snapshot 2026-03 | ORPHAN |
| BACKUPS.md | Signed encrypted backups | OK |
| BENCHMARKING / BENCHMARKS / BENCHMARK_GALLERY / BENCH_REGISTRY.md (4) | Bench comparison, artifacts, gallery, registry | OK |
| BENCHMARK_VULNERABLE_VS_HARDENED.md | Weak-vs-hardened experiment | ORPHAN |
| BOARD_RISK_L3_MEMO.md | Board-level L3 memo | OK |
| BOM.md | Signed maturity manifest | OK |
| BRIDGE.md / BRIDGE_PROMPT_ENFORCEMENT.md | Provider-shaped proxy + prompt enforcement | OK |
| BROWSER_SANDBOX.md | Playground try-now entry | OK |
| BUDGETS.md | Autonomy budgets | OK |
| BUNDLES.md | `.amcbundle` archives | OK |
| BUYER_PACKAGES / PRICING / PRICING_FAQ / PRODUCT_EDITIONS.md (4) | Commercial set; $9.99 consistent with code/site | OK |
| CANON.md | Signed core taxonomy | OK |
| CASEBOOKS.md | Signed test-case sets | OK |
| CERTIFICATION.md | `.amccert` packages | OK |
| CHAIN_ARCHITECTURE.md | Three chaining levels | OK |
| CI.md / CI_TEMPLATES.md | CI gates + templates | OK |
| CLAIM_PROVENANCE.md | Claim lifecycle | OK |
| CLI_COMMAND_INVENTORY.md | 1,171 generated command rows; matches 40 live top-level groups | OK |
| CLI_WRAPPERS.md | `amc wrap` process evidence | OK |
| CLOUD_REFERENCE_ARCHITECTURES.md | AWS/GCP/Azure mappings | OK |
| COMMUNITY / _DEMO_KIT / _SHOWCASE / _SUPPORT.md (4) | Community + DevRel set | OK |
| COMPARE_AMC.md | Competitor comparison | OK |
| COMPATIBILITY_MATRIX.md | Stack compatibility guide | OK |
| COMPATIBILITY_OVERVIEW.md | Fit summary; overlaps MATRIX | ORPHAN |
| COMPLIANCE.md / COMPLIANCE_MAPS.md | Both titled "Compliance Maps", same topic | DUP |
| COMPLIANCE_FRAMEWORKS.md | Built-in framework mappings | OK |
| CONNECT.md | Gateway setup printout | OK |
| CONSOLE.md | Studio owner cockpit | OK |
| CONTENT_CALENDAR.md | 4-week content calendar template | ORPHAN |
| CONTEXT_GRAPH.md | CGX signed context graph | OK |
| CONTINUOUS_MONITORING.md | Production observability | OK |
| CONTINUOUS_RECURRENCE.md | Forecast renewal loop | OK |
| CONTROL_PROJECTION/_SIMULATION.md (2) | Control view + decision preview | OK |
| DASHBOARD.md | Offline-first Compass view | OK |
| DEPLOYMENT / _CHECKLIST / _OPTIONS.md (3) | Deployment set | OK |
| DESKTOP_PACKAGES.md | Portable installers | OK |
| DIAGNOSTIC_BANK.md | 244-question rubric — matches live bank | OK |
| DOCS_DRIFT_CLEANUP_PLAN.md | Docs remediation plan | OK |
| DOCS_PROCESS.md | Docs update process | ORPHAN |
| DOCTOR.md | `amc doctor` | OK |
| DOGFOOD_REPORT.md | Self-score, 2026-03-25 | ORPHAN |
| DOMAIN_PACKS.md | Pack overview; "base 138-question rubric" and "1,021 total" wrong (base = 244); 41 packs/600 questions correct | STALE |
| DOMAIN_PROOF_LANE.md | Answer-correctness lane | OK |
| DRIFT_ALERTS.md | Regression detection/freeze | OK |
| ECC_GAP_ANALYSIS_AND_ACTION_PLAN.md | ECC comparison, 2026-03 | ORPHAN |
| ECONOMIC_SIGNIFICANCE.md | Deterministic significance score | OK |
| ECOSYSTEM.md | Model/framework support | OK |
| ECOSYSTEM_VIEW / ECOSYSTEM_COMPARATIVE_VIEW.md | Two overlapping benchmark-comparison docs | DUP |
| ENCRYPTION_AT_REST.md | AES-256-GCM blob store | OK |
| ENTERPRISE.md | Enterprise tier | OK |
| EQUALIZER_TARGETS.md | Target setting; says "all 67 questions" vs 244 live | STALE |
| EU_AI_ACT_COMPLIANCE.md | Dimension mapping v1.1 | OK |
| EVALUATOR_REGISTRY.md | Evaluator metadata catalog | OK |
| EVIDENCE_CHAIN.md | Cryptographic chain explainer | ORPHAN |
| EVIDENCE_REQUESTS / EVIDENCE_TRUST.md (2) | Auditor disclosure + trust model | OK |
| EXAMPLES_INDEX.md | Copy-paste starting points | OK |
| EXECUTIVE_OVERVIEW.md | CTO/CISO overview | OK |
| EXPERIMENTS.md | Baseline-vs-candidate runs | OK |
| FEDERATION.md | Cross-org artifact sharing | OK |
| FLEET.md | Multi-agent workspace | OK |
| FORECASTING.md | Evidence-gated planning | OK |
| FULL_MODULE_ROADMAP.md / PYTHON_MODULE_MAPPING.md | Two Python→TS module mappings | DUP |
| GDPR_ARTICLE_COMPLIANCE.md | GDPR article mapping | OK |
| GETTING_STARTED.md | 2-minute first score | OK |
| GITHUB_ACTION.md | CI action guide | ORPHAN |
| GOVERNANCE.md | Project governance | OK |
| GOVERNOR.md | Policy-as-code autonomy | OK |
| GO_TO_MARKET_PACK.md | Partner narratives | OK |
| HARDENING.md | Secure deployment entry | OK |
| HARDWARE_TRUST.md | Notary signing boundary | OK |
| HOMEPAGE_TRUST_SIGNALS.md | Trust-packaging notes | ORPHAN |
| IDENTITY.md / IDENTITY_STABILITY.md | Host identity; behavioral consistency metrics | OK |
| IMPLEMENTATION_REALITY_MAP.md | Real-vs-partial capability map | OK |
| INCIDENT_RESPONSE_READINESS.md | Incident runbook | OK |
| INDEX.md | Docs index — links only 47 of 277 docs; real nav is website/docs/docs.js (343 pages) | STALE |
| INDUSTRY_PACK_AUDIT.md | Paid pack deliverable | ORPHAN |
| INNOVATION_THESIS.md | Theory essay | OK |
| INSTALL.md / INSTALL_PACKAGES.md | Install guides | OK |
| INTEGRATIONS.md | Provider integrations | OK |
| ISO_42001_ALIGNMENT.md | ISO 42001 mapping (also covered 3× in compliance/) | OK |
| KUBERNETES_HELM_DEPLOYMENT.md | Helm/Kustomize guide | OK |
| LAUNCH.md | Code-validated launch runbook | OK |
| LEASES.md | Short-lived lease tokens | OK |
| LOOP.md | Recurring maturity checks | OK |
| MARKET_INTELLIGENCE_MARCH_2026.md | Dated market snapshot | OK |
| MCP_SERVER.md | MCP server integration | OK |
| MECHANIC_MODE / MECHANIC_WORKBENCH.md (2) | Target-setting surfaces | OK |
| MEMORY_MATURITY.md | Memory architecture guide | OK |
| METHODOLOGY_CROSSWALK.md | L0–L5 vs external frameworks | OK |
| METRICS.md | Prometheus metrics | OK |
| MIGRATION_FROM_PROMPTFOO_DEEPEVAL.md | Migration guide | OK |
| MIGRATION_RUNBOOK.md | Upgrade data safety | OK |
| MITRE_ATLAS_MAPPING.md | ATLAS tactic matrix | OK |
| MODEL_GOVERNANCE.md | Forecast model governance | OK |
| MODES.md | Two CLI roles | OK |
| MULTI_AGENT_TRUST.md | Fleet trust composition | OK |
| MULTI_MODEL_VALIDATION.md | Cross-LLM design | OK |
| NORTHSTAR_PROMPTS.md | Signed prompt packs | OK |
| NOTARY.md | Separate signing service | OK |
| NO_CODE_GOVERNANCE.md | Webhook governance bridges | OK |
| ONE_CLICK_FIX.md / ONE_COMMAND_FIX.md | `amc fix` design + `amc run --fix`; overlapping, both unreferenced | ORPHAN |
| OPEN_RUBRIC_STANDARD / OPEN_STANDARD.md (2) | Open assessment/schema standards | OK |
| OPERATIONS.md / OPS_HARDENING.md | Ops runbook + signed ops policy | OK |
| ORG_COMPASS / ORG_EOC.md (2) | Org scorecards + node E/O/C | OK |
| OSS_ADOPTION_ROADMAP.md | Adoption plan | OK |
| OUTCOMES.md | Value layer | OK |
| PAIRING.md / PAIRING_LAN_PWA.md | Agent pairing, LAN, PWA | OK |
| PAPER_IMPLEMENTATION_AUDIT.md | Papers-vs-code audit, 2026-03 | OK |
| PERSONAS.md | Role-based entry points | OK |
| PLATFORM_ENGINEER_QUICKSTART / PLATFORM_PATH.md (2) | Platform-team path | OK |
| PLAYGROUND.md | Web playground | OK |
| PLUGINS / PLUGIN_SUPPLY_CHAIN / REGISTRY.md (3) | Plugin dev, security, registry | OK |
| POLICY_EXPORT / POLICY_PACKS.md (2) | Policy export + golden bundles | OK |
| PREDICTION_LOG.md | Prediction-log pattern | OK |
| PREDICTIVE_MAINTENANCE.md | Early degradation signals | OK |
| PROMPT_POLICY.md | Signed prompt policy | OK |
| PROVIDERS.md | Config-driven provider coverage | OK |
| PUBLISHING.md | Distribution guide | OK |
| QUESTION_BANK.md | 244 default / 264 expanded — matches live | OK |
| QUICKSTART.md | Title says "2 Minutes", body says "under 5 minutes" | STALE |
| RBAC.md | Signed users.yaml roles | OK |
| REALTIME.md | Org SSE events | OK |
| REAL_PEOPLE_COUNCIL.md | 20 non-technical personas, 2026-03 | OK |
| RECEIPTS / RECEIPT_INTERCHANGE.md (2) | Receipt proofs + verifier format | OK |
| RECIPES.md | Copy-paste quick wins | OK |
| RED_TEAMING_GUIDE.md | Red-team walkthrough | OK |
| RELEASE_CADENCE / _HIGHLIGHTS / _RUNBOOK / RELEASING.md (4) | Release set | OK |
| RESEARCH_PAPERS_2026 / RESEARCH_PAPERS_MARCH_2026 / RESEARCH_GAPS_MARCH_2026 / NEW_GAPS_RESEARCH / RESEARCHER_EXODUS_GAP_ANALYSIS.md (5) | Research sweeps citing "74 score modules, 86–99 assurance packs, 138 questions" — now 102 / 153 / 244; two also ORPHAN | STALE |
| RUNTIMES.md / RUNTIME_SDK.md | Runtime integrations + embed SDK | OK |
| SAFETY_RESEARCH_LANE.md | Safety eval lane | ORPHAN |
| SANDBOX.md | Docker sandbox attestation | OK |
| SCIM.md | SCIM 2.0 provisioning | OK |
| SCOPE_TEMPLATES.md | Policy scope templates | OK |
| SCORING_METHODOLOGY.md | Public scoring methodology | OK |
| SDK.md / SDK_VERSIONING.md | Node/Python/Go SDKs + SemVer policy | OK |
| SECTOR_PACKS.md | Sector-specific packs | OK |
| SECURITY / SECURITY_ARCHITECTURE_OVERVIEW / SECURITY_DEPLOYMENT / THREAT_MODEL.md (4) | Security model set | OK |
| SECURITY_COMPLIANCE_QUICKSTART / SECURITY_PATH.md | Two near-identical security-audience entry pages | DUP |
| SERVICES_AND_SUPPORT.md | Support/services story | OK |
| SHIELD_ENFORCE_REFERENCE.md | Runtime protection CLI reference | OK |
| SINGLE_BINARY.md | Experimental Node SEA | OK |
| SOLO_DEV_PATH / SOLO_DEV_QUICKSTART / SOLO_USER.md (3) | Three overlapping solo-developer entries | DUP |
| SOURCE_REVIEW_GAP_0591.md | Stray review; belongs in source-reviews/ | ORPHAN |
| SPONSORING.md | Sponsorship paths | OK |
| SSO_OIDC / SSO_SAML.md (2) | Host-level SSO | OK |
| STANDARDS_MAPPING.md | Cross-standard alignment | OK |
| STARTER_BLUEPRINTS.md | Opinionated baselines | OK |
| START_HERE.md | Routing page | OK |
| STUDIO.md | Local control plane | OK |
| SUPPLY_CHAIN.md | Dual supply-chain meaning | OK |
| SUPPORT_POLICY.md | Version/support policy | OK |
| SYSTEM_CAPABILITIES.md | Go-live capability matrix | OK |
| TICKETS.md | Execution tickets | OK |
| TOOLHUB.md | Trusted tool proxy | OK |
| TRACES_TO_EVIDENCE.md | Trace-ingestion guide | ORPHAN |
| TRANSPARENCY / _MERKLE / _REPORT.md (3) | Transparency log, Merkle, agent report | OK |
| TROUBLESHOOTING.md | Common setup failures | OK |
| TRUTHGUARD.md | Output-contract linter | OK |
| UPGRADE_AUTOPILOT.md | Approval-gated upgrade plans | OK |
| USE_CASES.md | Concrete job mapping | OK |
| UX_AUDIT_REPORT / UX_FINAL_AUDIT.md (2) | UX audit snapshots, 2026-03 | OK |
| VALIDITY_FRAMEWORK.md | Assessment scientific basis | OK |
| VALUE_CONTRACTS / _GATES / _INGESTION / _REALIZATION.md (4) | Value-layer set | OK |
| VAULT.md | Encrypted key vault | OK |
| VSCODE_EXTENSION.md | Extension scaffold | OK |
| WAIVERS.md | Time-limited waivers | OK |
| WHATIF.md | Target-impact simulator | OK |
| WHY_AMC.md / WHY_AMC_ONE_PAGER.md | Positioning long + short | OK |
| WORK_ORDERS.md | Signed job envelopes | OK |
| ZERO_KEYS.md | Keyless agent model | OK |
| agent-framework-compatibility.md | Framework matrix, 2026-02 | OK |
| db-schemas.md | SQLite schema reference | OK |
| enterprise-readiness-checklist.md | PASS/PARTIAL/FAIL checklist | OK |
| sbom.md | "Basic SBOM" snapshot 2026-02-22; superseded by root sbom.json | STALE |
| score-history.md | Score regression snapshots | OK |
| self-calibration.md | Prediction-vs-outcome scoring | OK |
| wave4-*-audit.md + wave4-sbom.cdx.json (9) | 2026-02-22 audit wave snapshots (safety, docs, integration, regulatory, supply-chain, test-coverage…); 6 of 8 unreferenced | ORPHAN |
| adapters/ (21) | Per-framework adapter guides + 5 landing pages | OK |
| adr/ (5) | Architecture decision records 001–005 | OK |
| compliance/ (21) | Framework guides; 4 hyphen/underscore near-dup pairs + compliance-nist.md | DUP |
| content/ (8) | Launch/marketing drafts (HN, PH, Reddit, video) | OK |
| council/ (43) | Industry persona council YAMLs + log | OK |
| deep-dive/ (6) | Five architecture-plane deep dives + index | OK |
| integrations/ci-cd.md | CI/CD integration guide | OK |
| internal/ (14) | Competitor analyses + mirofish audits | OK |
| research/gap-0610-trism-agentic-live-drift.md | Same GAP-0610 exists in source-reviews/ | DUP |
| runbooks/ (5) | Operational incident runbooks | OK |
| source-reviews/ (614) | AMC-ticket + GAP-nnnn source review notes; 162 repeat "6507 tests" boilerplate | OK |

## Findings

- **Question-count drift is the biggest inconsistency.** Live bank = 244 (verified in dist/diagnostic/questionBank.js). DOMAIN_PACKS.md claims a "base 138-question rubric" (total "1,021"), EQUALIZER_TARGETS.md says "all 67 diagnostic questions", and AMC_QUESTION_BANK_FULL.json exports only 111 — three different stale baselines; DIAGNOSTIC_BANK.md and QUESTION_BANK.md (244/264) are correct.
- **Pack numbers mostly check out**: 41 industry packs / 600 industry questions and 7 domain stations match dist/domains exactly; but DOMAIN_PACKS.md's "283 domain-level questions" doesn't reconcile with code (61 domain-pack + 150 deep-industry questions found).
- **Capability counts in research sweeps are outdated**: docs cite 74 score modules and 86–99 assurance packs; src now has 102 score modules and 153 assurance-pack files.
- **Adapter off-by-one**: ADAPTER_COMPATIBILITY.md says 14 built-in adapters; src/adapters/builtins has 15 (openclaw appears newest).
- **30 docs are true orphans** — referenced by no doc, README, src, or website page — including shipped-feature docs (ONE_CLICK_FIX.md, ONE_COMMAND_FIX.md, GITHUB_ACTION.md, EVIDENCE_CHAIN.md, TRACES_TO_EVIDENCE.md); full list in /private/tmp/claude-501/-Users-sid-AgentMaturityCompass/c5c61ae5-1f16-447b-bd19-a171b760d0cc/scratchpad/orphans2.txt.
- **Two competing indexes**: docs/INDEX.md links only 47 docs while website/docs/docs.js carries 343 page names — they drift independently; INDEX.md is not a reliable table of contents.
- **compliance/ carries systematic duplicates**: hyphen vs underscore pairs for eu-ai-act, iso-42001, nist-ai-rmf, and soc2 (differing line counts, same subject), plus compliance-nist.md; top-level COMPLIANCE.md and COMPLIANCE_MAPS.md share the identical H1.
- **Test-count claims are frozen snapshots**: "6507 tests" appears 162 times across source-reviews/ while the suite is now ~8.4k test blocks in 1,040 files; CLI_COMMAND_INVENTORY.md (1,171 rows) does match the live Commander registry's 40 top-level groups.

---

# Inventory: `platform/python` and `sdk/`

## 1. `platform/python` — Python platform (`amc` package, v2.0.0, "amc-platform")

Layout: `amc/{core,score,shield,enforce,vault,watch,product,agents,api,web,benchmarks}` + `cli.py`; 93 test files (~1,600 tests per committed report). Status key: REAL = does what it claims in-process; FACADE = substantial code but the headline claim isn't delivered; STUB = trivial; DEAD = referenced by nothing except the import-sweep in `run_full_validation.py`.

### amc/core (4 modules)
| module | purpose | status | note |
|---|---|---|---|
| config.py | pydantic-settings env config | REAL | |
| models.py | shared enums/models (RiskLevel, PolicyDecision, ActionReceipt) | REAL | backbone of every suite |
| exceptions.py / logging.py | error types, structlog setup | REAL | small glue |

### amc/score (7)
| module | purpose | status | note |
|---|---|---|---|
| dimensions.py | 7-dimension L1–L5 maturity scoring engine | REAL | wired to API+CLI |
| questionnaire.py | 30-question assessment sessions | REAL | sqlite-persisted via score router |
| l5_requirements.py | L5 gate checklist | REAL | consumed only by agents harness |
| evidence.py | evidence dataclasses | STUB | 47 lines of types |
| evidence_collector.py | runtime evidence capture | REAL | harness-only, no tests |
| adversarial.py | anti-gaming attacks against the scorer itself (incl. `mock_execution_attack` patching sys.modules) | REAL | unusual and genuine |
| formal_spec.py | 920-line "formal" maturity math (M, V=ΔM/Δt) | DEAD | zero references anywhere |

### amc/shield S1–S16 (16)
| module(s) | purpose | status | note |
|---|---|---|---|
| s1_analyzer | static skill/tool scanner | REAL | API + tests |
| s3_signing, s4_sbom, s5_reputation, s7_registry, s14_conversation_integrity, s15_threat_intel, s16_ui_fingerprint | signing, SBOM+CVE alerts, publisher reputation, registry, tamper checks, threat feed, UI fingerprint | REAL | tested; sqlite3/JSON persistence |
| s10_detector | prompt-injection detector | REAL | regex stage real+tested; "LLM classifier" stage exists but no client is ever wired (`llm_client=None`) |
| s2_behavioral_sandbox, s6_manifest (1,256 ln), s8_ingress, s9_sanitizer, s11_attachment_detonation, s12_oauth_scope, s13_download_quarantine | detonation sandbox, manifests, ingress pairing, HTML sanitizer, attachment/download/oauth controls | REAL | substantial code, but reachable **only** from `agents/run_cmb_harness.py`; no tests, not in API |

### amc/enforce E1–E35 (35)
| module(s) | purpose | status | note |
|---|---|---|---|
| e1_policy | tool policy firewall | REAL | API + startup + tests |
| e5_circuit_breaker | failure breaker | REAL | app startup + sqlite |
| e6, e11_mdns, e12_reverse_proxy_guard, e14_webhook_gateway, e18_secret_blind, e19_two_person, e23_numeric, e29_idempotency, e30_cross_source, e31_clipboard, e32_template, e33_watchdog, e34_consensus, e35_model_switchboard | step-up auth, mDNS control, proxy guard, signed webhooks, secret blinding, 4-eyes, numeric/idempotency/consensus checks | REAL | direct tests each |
| e4_egress_proxy | HTTP egress proxy | REAL | actual `BaseHTTPRequestHandler` server; CONNECT tunneling acknowledged-limited; harness-only |
| e7_sandbox_orchestrator | exec sandbox | REAL | docker optional, tempdir fallback; harness-only |
| e2_exec, e3_browser, e8_session_firewall, e9_outbound, e10_gateway_scanner, e13_ato, e15_abac, e16_antiphishing, e17_dryrun, e20_payee, e21_taint, e22_schema_gate, e24_evidence_contract, e25_config_linter, e26_mode_switcher, e27_temporal, e28_location | remaining guardrails | REAL | in-process rule engines; harness/e2e-only, no direct tests |

### amc/vault V1–V14 (14)
| module(s) | purpose | status | note |
|---|---|---|---|
| v2_dlp | DLP redactor | REAL | regex+entropy only — API-exposed and tested, but presidio/detect-secrets never imported |
| v6_dsar, v7_residency, v9_invoice_fraud, v11_metadata, v12_classification | privacy/fraud controls | REAL | tested |
| v1_secrets_broker | scoped-token secrets broker | FACADE | only File/Env backends; hvac/boto3 extras never imported; tokens in-memory only; harness-only |
| v3_honeytokens, v4_rag_guard, v5_memory_ttl, v8_screenshot_redact, v10_undo, v13_privacy_budget, v14_secret_rotation | remaining vault controls | REAL | harness/policy-pack-only, most untested |

### amc/watch W1–W10 (11)
| module(s) | purpose | status | note |
|---|---|---|---|
| w1_receipts | hash-chained action ledger | REAL | app startup, API, tests |
| w2_assurance | OWASP-agent regression + full audit | REAL | attacks run against the in-process firewall/detector (self-test, not external agents) |
| w4–w10, prebuilt_policy_packs | safety testkit, agent bus, attestation, explainability, hardening, tenant verifier, packs | REAL | tested |
| w3_siem_exporter | SIEM export | REAL | harness-only |

### amc/product (81 modules + persistence.py) — the bulk
All 81 are the same species: 300–830-line in-process engines with dataclass/pydantic models, JSON/sqlite persistence, and direct tests (~50 `test_product_*` files + wave suites). Grouped:
| group | modules | status | note |
|---|---|---|---|
| Orchestration | workflow_engine, workflow_templates, task_splitter, task_spec, plan_generator, dependency_graph, tool_chain_builder, tool_parallelizer, compensation, event_router, async_callback, jobs, batch_processor, escalation, approval_workflow, autonomy_dial | REAL | |
| Tool intelligence | tool_contract, tool_discovery, tool_fallback, tool_reliability, tool_cost_estimator, tool_rate_limiter, tool_semantic_docs, param_autofiller | REAL | |
| Memory/context | long_term_memory, memory_consolidation, conversation_state, conversation_summarizer, context_pack, context_optimizer, scratchpad, chunking_pipeline, knowledge_graph, kb_builder, glossary, docs_ingestion | REAL | keyword/hash heuristics — no LLM or embedding calls anywhere in the platform |
| Quality/output | structured_output, response_validator, output_corrector, output_diff, data_quality, error_translator, confidence, extractor, personalized_output, persona, instruction_formatter, prompt_modules, reasoning_coach, clarification_optimizer, loop_detector, retry_engine, rate_limiter, determinism_kit, replay_debugger, failure_clustering, improvement | REAL | |
| Business/ops | metering, outcome_pricing, ab_testing, rollout_manager, version_control, retention_autopilot, onboarding_wizard, portal, collaboration, white_label, goal_tracker, proactive_reminders, sop_compiler, autodoc_generator, api_wrapper_generator, document_assembler, sync_connector, dev_sandbox, scaffolding, features, features_wave2 | REAL | features*.py = 148-feature catalog registry |
| Support | persistence.py (66 ln shared queue defaults), invoicebot_l5_profile (demo fixture) | REAL | |

### amc/agents (8) — dogfood layer
| module | purpose | status | note |
|---|---|---|---|
| run_cmb_harness.py (922 ln) | ContentModerationBot harness exercising ~60 modules | REAL | sole consumer of ~35 shield/enforce/vault modules |
| content_moderation_bot, data_pipeline_bot, legal_contract_bot | demo agents | REAL | demo-grade |
| run_dpb_selfimprove, run_lcab_autonomous | self-improvement loops | REAL | script-run only |
| fix_generator.py | generates fixes by AST-inspecting AMC module source (not a hardcoded catalog) | REAL | script-run only |
| evidence_comparison_test.py | evidence A/B script | REAL | script |

### amc/api, web, benchmarks, cli
| module | purpose | status | note |
|---|---|---|---|
| api/main.py | app factory: DLP body-redaction logging, in-memory rate limiter, CORS, startup init of ledger/firewall/breaker/detector | REAL | |
| api/routers/product.py | **7,744 lines, ~470 routes, imports all 81 product modules** via 10 sub-routers | REAL | monolith |
| api/routers/{score,shield,enforce,vault,watch}.py | 51–229 lines each | REAL | expose only S1, S10, E1, V2, W1, W2 + score sessions (sqlite) |
| web/viewer.py | promptfoo-style results viewer | REAL | used by `amc view` |
| benchmarks/* | benchmark suite/runner | DEAD | self-referential only |
| cli.py | typer CLI (`amc`, `amc-server`) | REAL | thin wrapper |

### FastAPI app, validation, committed workspace state
- **App**: `uvicorn amc.api.main:app`; graceful `_include_router_if_available`; health endpoint reports score-DB status. Security/watch surface is tiny (7 modules); product surface is huge (470 routes).
- **run_full_validation.py** (389 ln): 7 phases — full pytest, import-sweep of every module, API-correctness spot checks, autonomy modes, endpoints, InvoiceBot L5 profile, evidence scoring; writes report to `/tmp`.
- **Committed workspace state**: `.amc/score_sessions.sqlite` (20 KB binary session DB **committed to git**); `VALIDATION_REPORT_v3.md` (2026-02-18, "26/26 pass, 1600 tests") and `STUDIO_VERIFICATION_REPORT.md` (2026-02-19, verifies the **TS** studio server) are committed run outputs; `amc_prompt_workflow_versions.json`; `AMC_OS/LOGS/` and `logs/` are empty untracked dirs; `stress_test_expert.py` (914 ln) committed ad-hoc harness.
- **Dependency facade**: pyproject declares anthropic, openai, presidio-analyzer/anonymizer, detect-secrets, cyclonedx-bom, sqlalchemy/aiosqlite, opentelemetry — **none is imported anywhere in `amc/`** (verified); actual persistence is stdlib sqlite3 + JSON.

## 2. Top-level `sdk/` (only `sdk/python/`)
| file | purpose | status | note |
|---|---|---|---|
| amc_sdk/core.py (221 ln) | `score()/fix()/report()/with_amc()` — **subprocess wrappers around the TS npm CLI** (`amc` / `npx agent-maturity-compass` quickscore/fix/gateway/compliance) | REAL | silently returns zeroed results on any failure |
| amc_sdk/assurance.py | `assurance.run()` → CLI red-team packs | REAL | |
| amc_sdk/decorators.py | `@amc_guardrails` pytest decorator | REAL | |
| amc_sdk/types.py | ScoreResult/FixResult/Finding dataclasses | REAL | |
| tests/test_types.py | types-only tests | REAL | no test touches core (subprocess) |
| examples/ (3), README, pyproject (`amc-sdk` 0.1.0, MIT) | docs/examples | REAL | |

## Duplication vs the TS core (`src/`)
- **`platform/python/amc` is a wholesale Python port of the TS core's five security suites and product catalog**: enforce E1–E35 ↔ `src/enforce` 1:1 (policyFirewall→e1 … modelSwitchboard→e35); shield S1–S16 ↔ `src/shield` (analyzer, behavioralSandbox, signing, sbom, reputation, manifest, registry, ingress, sanitizer, detector, attachmentDetonation, oauthScope, downloadQuarantine, conversationIntegrity, threatIntel, uiFingerprint); vault V1–V14 ↔ `src/vault`; watch W1–W10 ↔ `src/watch`; product 81 ↔ `src/product` near-1:1 (abTesting↔ab_testing …). It duplicates by name and concept, not by shared code.
- **Coverage is asymmetric**: TS shield has ~18 extra modules (mcpSecurityAnalyzer, trustPipeline, continuousRedTeam…), TS vault extras (vaultCrypto, zkPrivacy…), and `src/score` has 100+ modules vs Python's 2 wired ones — plus ~140 TS top-level domains (studio, marketplace, federation, cert…) with no Python counterpart.
- **Unique to Python platform**: the FastAPI service itself, agents/ dogfood bots + AST-based fix_generator, score/adversarial anti-gaming attacks, formal_spec, benchmarks, web viewer, validation/stress harnesses.
- **`sdk/python` duplicates no logic** — it shells out to the TS CLI — but it duplicates the *role* of `src/sdk/python` (`amc_client.py`, an HTTP client for the TS Bridge on :3212). Two unrelated official "AMC Python SDKs" exist, and neither talks to the Python platform's FastAPI at all.

## Findings (8)
1. `platform/python/amc` is a full parallel Python re-implementation of the TS core (S/E/V/W/product, ~146 modules 1:1 by name) with zero shared code — a permanent two-codebase sync burden, already drifted (score: 2 Python vs 100+ TS modules).
2. Three disjoint Python client/product surfaces exist: `platform/python` (port), `sdk/python/amc_sdk` (CLI subprocess wrapper), `src/sdk/python/amc_client` (Bridge HTTP client); none interoperate, and the platform's FastAPI has no SDK.
3. pyproject declares anthropic, openai, presidio, detect-secrets, cyclonedx-bom, sqlalchemy/aiosqlite, opentelemetry — none imported anywhere; all "LLM/NLP" behavior is regex/keyword/hash heuristics (S10's LLM stage never wired) — install-weight and capability facade.
4. ~35 shield/enforce/vault modules are reachable only via the demo harness `amc/agents/run_cmb_harness.py`; the non-product API routers expose just 7 security modules while `product.py` exposes 470 routes — the security platform is mostly unwired library code.
5. Committed run/workspace state: `.amc/score_sessions.sqlite` binary DB, dated VALIDATION_REPORT_v3.md / STUDIO_VERIFICATION_REPORT.md snapshots, and `amc_prompt_workflow_versions.json` are in git; empty `AMC_OS/LOGS/` and `logs/` dirs sit untracked.
6. `amc/api/routers/product.py` is 7,744 lines (vs the repo's own 800-line rule) and imports all 81 product modules — the real center of gravity and the main refactor target.
7. Dead weight: `amc/score/formal_spec.py` (920 ln, zero refs) and `amc/benchmarks/` (script-only); `sdk/python` swallows all CLI errors, returning `score=0/L0` indistinguishable from a real L0.
8. `run_full_validation.py` + `stress_test_expert.py` form a bespoke second test harness duplicating pytest; its "26/26 / 1600 passed" claims are frozen in committed reports from 2026-02-18/19 and not reproduced in CI on this branch.

---

# AMC Repository Inventory — File-Level Audit

## Root distribution files

| file | purpose | status | note |
|---|---|---|---|
| `Dockerfile` | Studio image (node:20-alpine, non-root 10001, `ENTRYPOINT amc`, healthcheck) | active | Used by `docker-compose.tls.yml`; ships default `AMC_VAULT_PASSPHRASE` baked in |
| `Dockerfile.runner` | CI runner image with Python/git/jq + AMC built from source | active | Targets `ghcr.io/agentmaturity/amc-runner:latest`; registry pull unverified per `publication-status.json` |
| `action.yml` | Composite GH Action: `curl install.sh \| sh` then `amc run --ci --fail-below <grade>` | duplicate | Grade-based (A+–F) gate; conflicts with `amc-action/` level-based (0–5) gate |
| `install.sh` | Verified release installer, pinned `1.1.1`, SHA-256 checked | active | Byte-identical to `website/install.sh` — two copies to keep in sync |
| `install.ps1` | **Missing at root** | absent | Only exists as `website/install.ps1`; root `action.yml` relies on the website copy |
| `vercel.json` | Deploy `api/index.ts` via `@vercel/node` | unwired | No verified Vercel deployment; API also targeted by railway.json |
| `railway.json` | Nixpacks deploy, `npm run api:start` | unwired | Same API, second platform config; neither confirmed live |
| `Formula/amc.rb` | Homebrew formula for v1.1.1 tarball | unwired | `install-channel.json` + `publication-status.json` say Homebrew tap is 404 / not released |
| `--json`, `--verbose` (root) | Accidental files from mis-quoted CLI runs (Feb 23) | stray | Shell redirect artifacts; should be deleted |

## api/

| file | purpose | status | note |
|---|---|---|---|
| `api/index.ts` | 372-line REST API: health, questions, packs, score, quickscore, badge, Industry Packs checkout/license endpoints | active | Price `$9.99` matches website after recent fix; checkout is "not_live" per publication-status, so pack endpoints are speculative |

## deploy/

| file | purpose | status | note |
|---|---|---|---|
| `compose/docker-compose.yml` | Studio via **`deploy/compose/Dockerfile`** | active | Different image than TLS variant |
| `compose/docker-compose.tls.yml` | Notary + Studio + Caddy 2.8, secrets, read-only, cap_drop | active | Builds **root** `Dockerfile` instead; obsolete `version: "3.9"` key |
| `compose/Dockerfile` | Alternate Studio image: node:**22**-slim, **root user**, own bootstrap CMD | duplicate | Diverges from hardened root Dockerfile (node:20, non-root, healthcheck) |
| `compose/Caddyfile` | TLS reverse proxy config | active | — |
| `compose/.env.example` | Compose env template | active | — |
| `compose/secrets/*.txt` (5) | Bootstrap secret files, all `change-me-*` | placeholder | Committed secrets directory; real values would land in git |
| `compose/README.md` | Compose deploy guide | active | Documents both variants |
| `helm/amc/Chart.yaml` | Chart v0.1.0, **appVersion "1.0.0"** | stale | Everything else pins 1.1.1 |
| `helm/amc/values.yaml` | Defaults `image: amc-studio:local` | active | Local-only default; no published registry image |
| `helm/amc/templates/*` (11) | Deployment, svc, ingress, netpol, PDB, PVCs (data+notary), secret, SA, configmap, helpers | active | Reasonably complete chart |
| `helm/amc/examples/*` (3) | ingress-TLS / internal-only / persistent-bootstrap values | active | — |
| `k8s/*` (namespace, configmap, deployment, service, ingress, hpa, pdb, pvc, kustomization, README) | Raw-manifest baseline, `image: amc-studio:local` | active | Parallel to Helm chart — third deploy path to maintain |
| `k8s/secret.yaml` + `secret.example.yaml` | Secret with `change-me` stringData, plus example | contradiction | **Both** exist and `kustomization.yaml` includes the real `secret.yaml`, so `kubectl apply -k` ships placeholder creds; example file is redundant |
| `pulumi/helm-release/*` (5) | Pulumi TS wrapper around local chart | active | Chart path `../../helm/amc`; inherits stale appVersion |
| `terraform/helm-release/*` (6) | Terraform wrapper around local chart | active | Mirrors Pulumi — fourth deploy path |
| `.DS_Store` | macOS junk | stray | Remove / gitignore |

## docker/

| file | purpose | status | note |
|---|---|---|---|
| `Dockerfile.quickstart` | `npm i -g agent-maturity-compass` quickstart image | **broken** | npm package returns 404 (publication-status); build cannot succeed; also contradicts install-channel policy of not advertising npm |
| `docker-compose.yml` | Runs `ghcr.io/agentmaturity/amc-studio:latest` | unwired | No verified public image at that ref |
| `entrypoint.sh` | Env-file-driven bootstrap/exec wrapper | unwired | Not COPY'd by any Dockerfile (root image uses `ENTRYPOINT ["amc"]`); only touched by CI workflow and tests |
| `.dockerignore` | Context rules | active | — |
| `README.md` | Says "this directory contains the Studio container entrypoint"; `docker build .` instructions | contradiction | There is no `docker/Dockerfile`; build instructions assume repo-root context and root Dockerfile |

## amc-action/ (vs root action.yml)

| file | purpose | status | note |
|---|---|---|---|
| `action.yml` | Full-featured action: pin release 1.1.1 or local build, quickscore, PR comment, score-drop gate, artifacts, `target-level 0–5` | active | The maintained one; outputs score/level/passed |
| `README.md` | Usage; warns not Marketplace-verified, pin a reviewed SHA | active | Root `action.yml` ignores this guidance (installs from live URL, no pinning) |

## website/ (served at agentmaturity.co)

| file | purpose | status | note |
|---|---|---|---|
| `index.html` | Landing page (461 lines; GSAP + Plausible from CDNs) | active | Pricing honestly marked "planned"; consistent with API `$9.99` |
| `lite.html` | Low-bandwidth landing variant | active | In sitemap |
| `playground.html` + `playground.css` | Interactive scoring playground | active | Only page registering `sw.js` and reading `install-channel.json` |
| `api.html` | API playground, renders `openapi.yaml` | active | — |
| `openapi.yaml` | API spec | active | Consumed by api.html |
| `demo.html` | Terminal demo page | active | Uses `assets/amc-five-minute-terminal.svg` |
| `verify.html` + `verify/amc-sample-evidence.amcbundle` | Public claims-verification page + sample evidence bundle | active | Good trust artifact |
| `executive.html` | Board-level brief | active | — |
| `compare.html/.css/.js`, `vs-promptfoo.html` | Competitive comparison pages | active | — |
| `methodology.html`, `compliance.html`, `accessibility.html`, `changelog.html/.css`, `404.html` | Methodology, EU-AI-Act, a11y, release notes, 404 | active | `methodology.html` overlaps `docs/methodology.html` |
| `station-*.html` ×7 + `station.css` | Sector "station" pages (education, environment, governance, health, mobility, technology, wealth) | active | — |
| `blog.html` | Full blog listing (20.8 KB) | duplicate | — |
| `blog/index.html` | Second, smaller blog index (4 KB stub with canonical) | duplicate | Two indexes will drift |
| `blog/*.html` ×4 + `editorial.css/.js` | Posts + blog styling/JS | active | — |
| `docs/index.html`, `getting-started`, `cli`, `adapters`, `compliance`, `methodology`, `docs.css/js`, `shared.css` | Docs microsite | active | — |
| `docs/amcconfig.md`, `docs/competitive-analysis.md` | Markdown sources served raw | unwired | Not linked as HTML; competitive-analysis is internal-flavored content on a public site |
| `style.css`, `brand.css` | Global + brand styles | active | — |
| `script.js`, `i18n.js`, `particles.js` | Landing interactions, 568-line i18n dictionary, particle background | active | `i18n.js` loaded but `index.html` has zero `data-i18n` attributes — translation layer effectively dormant |
| `sw.js` | Service worker (cache `amc-v9`) | partial | Registered only by playground.html; other pages uncached |
| `manifest.json` | PWA manifest | **stale** | `start_url: "/AgentMaturityCompass/"` is the old GitHub-Pages project path — wrong on agentmaturity.co |
| `CNAME` | GitHub Pages custom domain | contradiction | Coexists with `netlify.toml` (Netlify publish + SPA redirects) — two hosting configs, unclear which is authoritative |
| `netlify.toml` | Netlify config with `/* → /index.html` 200 catch-all | active? | Catch-all is SPA-style on a multi-page site (non-forced, so files win, but fragile) |
| `robots.txt`, `llms.txt` | Crawler + LLM guidance | active | — |
| `sitemap.xml` | Sitemap | **stale** | Only 5 URLs (/; playground; lite; verify; /docs/) for a ~25-page site |
| `install.sh`, `install.ps1`, `install-channel.json` | Served installers (pinned 1.1.1) + channel truth file | active | Channel file honestly lists npm/brew unavailable |
| `publication-status.json` | 2026-07-13 channel audit | unwired | Referenced by no page; valuable but invisible, and 5+ weeks old |
| `schemas/*.json` ×2 | Evidence/hook receipt JSON schemas | active | Public schema URLs |
| `og-card.png`, `amc-logo.png`, `README.md`, `.DS_Store` | Social card, logo, deploy notes, junk | active/stray | README documents GitHub Pages; netlify.toml says Netlify |

## vscode-extension/

| file | purpose | status | note |
|---|---|---|---|
| `package.json` | Manifest v0.1.0, publisher AgentMaturity, engine ^1.85 | active | Not on Marketplace (no channel entry); local install only |
| `src/extension.ts` (86 lines) / `out/extension.js` | Quickscore command wrapper; compiled output | active | `out/` committed but same-day as src (Jul 13) — in sync today, will drift |
| `schemas/amcconfig.schema.json` | JSON schema for `.amcconfig` | active | Pairs with `website/docs/amcconfig.md` |
| `.vscode/launch.json`, `.vscodeignore`, `tsconfig.json`, `README.md`, `package-lock.json` | Dev harness | active | — |

## Findings

- **Broken distribution artifacts contradict the project's own channel truth**: `docker/Dockerfile.quickstart` (`npm i -g agent-maturity-compass`) and `Formula/amc.rb` (Homebrew) depend on npm/brew channels that `website/install-channel.json` and `website/publication-status.json` explicitly report as 404/not released; `docker/docker-compose.yml` and `Dockerfile.runner` reference unverified `ghcr.io` images. The quickstart image cannot build at all.
- **Two competing GitHub Actions with different semantics**: root `action.yml` gates on letter grades via `amc run --ci` and installs from the live URL, while `amc-action/action.yml` gates on levels 0–5 via pinned release 1.1.1 with SHA-pinning guidance the root action itself violates. One should be deleted or made a thin wrapper.
- **Three divergent Studio images**: root `Dockerfile` (node:20-alpine, non-root, healthcheck), `deploy/compose/Dockerfile` (node:22-slim, runs as root, no healthcheck), and the broken quickstart. The plain compose file uses the unhardened image while the TLS compose uses the hardened one — security posture depends on which YAML you pick.
- **`deploy/k8s/kustomization.yaml` includes the committed `secret.yaml`** (placeholder `change-me` creds), so `kubectl apply -k deploy/k8s` deploys known credentials verbatim; `secret.example.yaml` sits unused beside it. Same pattern in `deploy/compose/secrets/` (committed secret files).
- **`docker/entrypoint.sh` is wired into no image** — no Dockerfile copies it; the root image's `ENTRYPOINT ["amc"]` and compose command strings duplicate its logic. `docker/README.md` claims the directory "contains the container entrypoint" and gives build instructions that don't match any Dockerfile in that directory.
- **Website hosting is doubly configured**: `CNAME` (GitHub Pages) and `netlify.toml` (Netlify, with an SPA catch-all on a multi-page site) coexist, and `manifest.json` still uses the pre-custom-domain `start_url: "/AgentMaturityCompass/"`, which breaks PWA launch on agentmaturity.co.
- **Stale metadata**: Helm `appVersion: "1.0.0"` vs the 1.1.1 pinned everywhere else; `sitemap.xml` lists 5 of ~25 pages; `publication-status.json` (dated 2026-07-13) is referenced by no page; duplicate blog indexes (`blog.html` vs `blog/index.html`) will drift.
- **Duplication that invites desync**: `install.sh` exists identically at root and in `website/` (only the website copy of `install.ps1` exists at all); `website/methodology.html` duplicates `docs/methodology.html`; i18n machinery (568-line `i18n.js`) ships on pages with no `data-i18n` markup; stray root files `--json`/`--verbose` and multiple `.DS_Store` files are committed.

---

# Repository Inventory — /Users/sid/AgentMaturityCompass

## qa/ — AI-powered RelOps service (Express + Postgres + Claude bot engine; all 30 files tracked)

|file/dir|purpose|belongs in repo? Y/N|note|
|---|---|---|---|
|qa/.env.example|env template|Y||
|qa/README.md|service docs|Y||
|qa/package.json|deps/scripts|Y||
|qa/package-lock.json|lockfile|Y||
|qa/tsconfig.json|TS config|Y||
|qa/src/index.ts|server entry|Y||
|qa/src/auth.ts|auth middleware|Y||
|qa/src/db.ts|Postgres access|Y||
|qa/src/events.ts|WebSocket events|Y||
|qa/src/runners.ts|Vitest runner layer|Y||
|qa/src/bot/anthropic.ts|Claude API client|Y||
|qa/src/bot/decisions.ts|bot decision logic|Y||
|qa/src/bot/engine.ts|tool-calling loop|Y||
|qa/src/bot/scheduler.ts|job scheduling|Y||
|qa/src/bot/tools.ts|bot tool defs|Y||
|qa/src/integrations/base.ts|integration interface|Y||
|qa/src/integrations/github.ts|GitHub PR/CI integration|Y||
|qa/src/migrations/001_initial.sql|schema|Y||
|qa/src/migrations/002_auth.sql|auth tables|Y||
|qa/src/migrations/003_test_runs.sql|test-run tables|Y||
|qa/src/migrations/004_webhooks.sql|webhook tables|Y||
|qa/src/migrations/005_bot_jobs.sql|job queue|Y||
|qa/src/migrations/006_validation_results.sql|validation tables|Y||
|qa/src/migrations/099_seed_integrations.sql|seed data|Y||
|qa/src/routes/bot.ts|bot API|Y||
|qa/src/routes/integrations.ts|integrations API|Y||
|qa/src/routes/releases.ts|releases API|Y||
|qa/src/routes/test-runs.ts|test-runs API|Y||
|qa/src/routes/webhooks.ts|webhook receiver|Y||
|qa/tests/runners.test.ts|runner tests|Y|only test file|

## integrations/

|file/dir|purpose|belongs in repo? Y/N|note|
|---|---|---|---|
|pytest-amc/README.md|plugin docs|Y||
|pytest-amc/QUICKSTART.md|quickstart|Y||
|pytest-amc/MANIFEST.in|packaging manifest|Y||
|pytest-amc/pyproject.toml|package metadata|Y||
|pytest-amc/setup.py|legacy setup shim|Y||
|pytest-amc/src/pytest_amc/__init__.py|package init|Y||
|pytest-amc/src/pytest_amc/plugin.py|pytest plugin: AMC score/threshold gates|Y||
|pytest-amc/examples/test_example.py|usage example|Y||

## examples/ — 14-adapter integration examples (gateway proxy pattern)

|file/dir|purpose|belongs in repo? Y/N|note|
|---|---|---|---|
|README.md|adapter index|Y||
|autogen/|AutoGen adapter example|Y||
|claude-code/|Claude Code example|Y||
|crewai/|CrewAI example|Y||
|crewai-amc-github-actions/|CrewAI + GH Actions CI|Y||
|domain-proof/toy-governance|domain-proof demo|Y|pairs with fixtures/domain-proof|
|gemini/|Gemini example|Y||
|generic-cli/|generic CLI example|Y||
|hello-agent/|minimal starter|Y||
|langchain-node/|LangChain JS example|Y||
|langchain-python/|LangChain Py example|Y||
|langchain-rag-amc/|RAG example|Y||
|langgraph-python/|LangGraph example|Y||
|llamaindex-python/|LlamaIndex example|Y||
|openai-agents-sdk/|OpenAI Agents SDK example|Y||
|openai-compatible-lite-score/|lite-score via OpenAI-compatible API|Y||
|openclaw/|OpenClaw config example|Y||
|openclaw-amc-baseline/|OpenClaw baseline run|Y||
|openhands/|OpenHands example|Y||
|python-amc-sdk/|Python SDK example|Y||
|semantic-kernel/|Semantic Kernel example|Y||
|amcconfig.yaml|sample config|Y|tracked; 0600 perms, Mar 2026|
|content_moderation_bot.py|loose demo bot|Y|Feb 2026, predates adapter layout|
|data_pipeline_bot.py|loose demo bot|Y|same generation|
|legal_contract_bot.py|loose demo bot|Y|same generation|
|end_to_end_test.md|E2E walkthrough doc|Y|same generation|
|score-history-example.ts|score-history snippet|Y|0600 perms|
|.DS_Store|Finder cruft|N|untracked/ignored; delete|

## fixtures/

|file/dir|purpose|belongs in repo? Y/N|note|
|---|---|---|---|
|domain-proof/toy-governance/source-rule-manifest.json|toy governance rule manifest|Y||
|domain-proof/toy-governance/source-rules.md|toy governance rules|Y||
|policy/amc-ci-policy-fixtures.yaml|deterministic CI policy regression suite|Y|schemaVersion 2026-07-12|

## whitepaper/

|file/dir|purpose|belongs in repo? Y/N|note|
|---|---|---|---|
|AMC_WHITEPAPER_v1.md|AMC whitepaper v2.0 (arXiv-style)|Y|filename says v1, content v2.0|

## research/

|file/dir|purpose|belongs in repo? Y/N|note|
|---|---|---|---|
|reproduce.sh|reproduces whitepaper's 84-point doc-inflation gap|Y|sole file; backs whitepaper claims|

## internal/

|file/dir|purpose|belongs in repo? Y/N|note|
|---|---|---|---|
|debug/debug_hipaa.js|ad-hoc HIPAA debug script|N|tracked scratch code|
|debug/debug_hipaa2.js|iteration 2|N|tracked scratch code|
|debug/debug_hipaa3.js|iteration 3|N|tracked scratch code|
|debug/test-compare-models.js|model comparison scratch|N|tracked scratch code|
|debug/test-model-scanner.cjs|scanner scratch (CJS)|N|duplicate of .mjs|
|debug/test-model-scanner.mjs|scanner scratch (ESM)|N|tracked scratch code|
|archive/HANDOFF.md|GTM handoff notes|N|gitignored, local only|
|archive/qualification.md|sales qualification doc|N|gitignored, local only|
|archive/sales_playbook.md|sales playbook|N|gitignored, local only|

## tools/

|file/dir|purpose|belongs in repo? Y/N|note|
|---|---|---|---|
|evil-mcp-server/README.md|red-team tool docs|Y||
|evil-mcp-server/pyproject.toml|packaging|Y||
|evil-mcp-server/evil_mcp_server/__init__.py|package init|Y||
|evil-mcp-server/evil_mcp_server/__main__.py|CLI entry|Y||
|evil-mcp-server/evil_mcp_server/config.py|attack config|Y||
|evil-mcp-server/evil_mcp_server/server.py|adversarial MCP server|Y||
|evil-mcp-server/evil_mcp_server/attacks/__init__.py|attacks registry|Y||
|evil-mcp-server/evil_mcp_server/attacks/data_exfil.py|exfiltration attack sim|Y||
|evil-mcp-server/evil_mcp_server/attacks/priv_esc.py|privilege-escalation sim|Y||
|evil-mcp-server/evil_mcp_server/attacks/prompt_inject.py|prompt-injection sim|Y||
|evil-mcp-server/evil_mcp_server/attacks/resource_exhaust.py|resource-exhaustion sim|Y||
|evil-mcp-server/evil_mcp_server/attacks/rug_pull.py|rug-pull (tool mutation) sim|Y||
|evil-mcp-server/evil_mcp_server/attacks/tool_poison.py|tool-poisoning sim|Y||
|evil-mcp-server/tests/__init__.py|test pkg|Y||
|evil-mcp-server/tests/test_attacks.py|attack tests|Y||

## memory/ (top level; entire dir gitignored)

|file/dir|purpose|belongs in repo? Y/N|note|
|---|---|---|---|
|2026-02-17.md … 2026-02-19.md (4 files)|daily agent session logs|N|local only|
|ai-agents-knowledge-base.md|agent knowledge dump (46KB)|N|local only|
|amc-gaps-from-moltbook.md|gap analysis notes|N|local only|
|amc-gaps-from-reddit.md|gap analysis notes (38KB)|N|local only|
|amc-implementation-plan.md|planning notes|N|local only|
|amc-reference.md|reference notes (32KB)|N|local only|
|lacuna-analysis.md|gap analysis|N|local only|
|moltbook-queued-post.md|queued social post|N|local only|
|moltbook-wisdom.md|research notes|N|local only|
|self-improvement-plan.md / self-review.md|agent self-eval notes|N|local only|

## AMC_OS/ (top level; entire dir gitignored; 55MB)

|file/dir|purpose|belongs in repo? Y/N|note|
|---|---|---|---|
|README.md|declares itself "local operating archive"|N|by own docs, not product source|
|00_DASHBOARD.md|status dashboard|N||
|AMC_GAP_REVIEW_AGENTIC_INFRA_2026-05-22.md|gap review|N||
|CAVEATS_RESOLUTION_2026-06-13.md|caveats log|N||
|READINESS_AUDIT_2026-05-21.md|readiness audit|N||
|REPO_AUDIT_2026-06-10.md|repo audit (32KB)|N||
|INBOX/|agent handoff inbox|N|1,293 files|
|LOGS/|run logs|N|mode 700|
|PLANS/ PROMPTS/ RESEARCH/ ROLEBOOKS/ TOOLS/|plans, prompts, research receipts, role standards, tooling|N||
|.DS_Store|Finder cruft|N|delete|

## amc_ai_army/ (top level; entire dir gitignored)

|file/dir|purpose|belongs in repo? Y/N|note|
|---|---|---|---|
|GOAL.md|GTM goals ($5k sprint, $3–15k/mo retainer)|N|sales campaign workspace|
|ICP.md|ideal customer profile|N||
|SCOREBOARD.md|campaign scoreboard|N||
|messaging_house.md|messaging framework|N||
|sprint_plan.md|sprint plan|N||
|trigger_events.md|outreach triggers|N||
|daily_exec_brief_template.md|brief template|N||
|RUBRIC/|scoring rubric|N||
|DELIVERY.md, LEADS.csv, OFFERS.md, OUTREACH.md, PRODUCT.md, RISKS.md|placeholders|N|all 0 bytes, never filled|

## mirofish-simulation/ (tracked)

|file/dir|purpose|belongs in repo? Y/N|note|
|---|---|---|---|
|index.html|simulation report viewer|N|marketing artifact, not product|
|data.js|simulation data|N||
|mirofish-report.md|Chinese-language report: simulated 100-persona social reaction to AMC CLI|N|synthetic/predictive, not real user data|
|mirofish-report-100agents.md|expanded 100-agent report|N||

## Findings (7)

1. **Three gitignored non-product workspaces sit inside the worktree** — AMC_OS/ (55MB, 1,293-file INBOX), memory/, amc_ai_army/. Correctly ignored, but they bloat local tooling scans and risk accidental un-ignoring; relocate outside the repo (AMC_OS's own README points to `/Users/sid/Documents/AMC` as the curated home).
2. **internal/debug/ contains six tracked ad-hoc scratch scripts** (debug_hipaa 1–3, test-compare-models.js, test-model-scanner in duplicate .cjs/.mjs). Committed debug scratch; delete or convert the useful ones into real tests.
3. **mirofish-simulation/ is a tracked synthetic marketing simulation** (Chinese-language "100 AI personas evaluate AMC" report + HTML viewer). Not product source and could be mistaken for real user research; move to a marketing/research archive outside the product repo.
4. **qa/ is a complete standalone service** (Express, Postgres, WebSocket, Claude bot engine, own lockfile, 7 migrations) embedded at repo top level with a single test file for six routes and a five-module bot engine. Consider a separate repo or workspace boundary, and test coverage far below the 80% standard.
5. **examples/ mixes two generations**: the current 14-adapter directory layout vs. loose Feb-2026 files (content_moderation_bot.py, data_pipeline_bot.py, legal_contract_bot.py, end_to_end_test.md, score-history-example.ts). Consolidate loose files into the adapter layout or delete; also normalize the 0600 perms on amcconfig.yaml and score-history-example.ts.
6. **internal/archive/ holds gitignored sales content** (sales_playbook.md, qualification.md, HANDOFF.md) colocated with source; move to the GTM/docs vault alongside amc_ai_army content.
7. **Minor hygiene**: whitepaper filename `AMC_WHITEPAPER_v1.md` vs. internal "Version 2.0" header; .DS_Store files scattered (examples/, AMC_OS/) — ignored but should be deleted; research/ holds a single script whose purpose is whitepaper reproduction — consider co-locating it under whitepaper/.

---

# Repo Inventory: scripts/, .github/, root configs

## scripts/ (26 files + brand/)

| file | purpose | wired | note |
|---|---|---|---|
| amc-dogfood-8-agents.mjs | Spins up 8 persona agents to dogfood `amc` scoring | manual (`qa:dogfood-8-agents`) | 30KB; no workflow calls it |
| architecture-boundaries-check.mjs | Enforces module dependency boundaries | CI (`ci.yml` → `check:architecture-boundaries`) | |
| brand/og-card.html | OG social-card template | manual | consumed by render-brand-assets.mjs; asserted by brand tests |
| build-pages-site.mjs | Builds public website for GitHub Pages | CI (`pages.yml` → `build:pages`) | also a path-trigger for pages.yml |
| build-sea.mjs | Builds Node Single Executable Application binary | CI (`release.yml` → `build:sea`) | perms 600 |
| compat-matrix-report.mjs | Summarizes matrix results into report | CI (`nightly-compatibility-matrix.yml`) | |
| docs-drift-check.mjs | Detects docs vs code drift | manual (`check:docs-drift`) | referenced by publicDistributionTruth.test.ts; no CI step |
| fake-external-signer.mjs | Fixture notary signer for trust tests | test-only | used by tests/notaryTrust.test.ts, docs/NOTARY.md |
| gen-api-ref.cjs | Generates docs/API_REFERENCE.md | dead-ish | no package.json script, no workflow; only docs mention it |
| incident-readiness-check.mjs | Validates incident-response readiness docs/config | manual (`check:incident-readiness`) | no CI step |
| install-persona-qa.mjs | Install QA across user personas | manual (`qa:install-personas`) | referenced by release-gate.mjs + a test |
| package-desktop-installers.mjs | Builds desktop installers | CI (`release.yml` → `package:desktop`) | 24KB |
| postinstall.js | npm postinstall hook | lifecycle (every `npm ci`, incl. CI) | `\|\| true` — never fails install |
| prepack-release-check.mjs | Pre-publish sanity check | CI (`npm-publish.yml`, `release.yml`) | also via `prepack` |
| prepare-public-release-assets.mjs | Stages public release artifacts | CI (`release.yml`) | |
| release-gate.mjs | Aggregate release readiness gate | lifecycle only (`prepack` → runs inside `changeset publish` in npm-publish.yml) | no explicit CI step |
| render-brand-assets.mjs | Renders brand/OG assets | manual (`brand:render`) | |
| research-amc-landscape.mjs | Competitive-landscape research generator | manual (`research:amc-landscape`) | 87KB single file |
| run-policy-fixtures-ci.mjs | Runs policy regression fixtures against built dist | CI (`ci.yml` → `check:policy-fixtures`) | |
| security-scan-lite.mjs | Lightweight secret/security scan | CI (`ci.yml`, direct node call) | |
| swarm-test.py | Python agent-swarm test harness | dead | zero references repo-wide |
| swarm-test-v2.py | v2 of the above | dead | zero references repo-wide |
| verify-amc-landscape.mjs | Verifies research output | manual (`research:amc-landscape:verify`) | |
| verify-desktop-installers.mjs | Verifies installer artifacts | CI (`release.yml`) | |
| verify-release-version.mjs | Tag vs package version check | CI (`release.yml`) | |
| write-accessibility-release-evidence.mjs | Writes a11y evidence from Playwright report | manual (`accessibility:release-evidence`) | covered by unit test; not in workflows |

## .github/

| file | purpose | wired | note |
|---|---|---|---|
| workflows/ci.yml | Main CI: changeset presence, lint/typecheck/test/build, policy fixtures, arch boundaries, e2e smoke via `dist/cli.js`, Docker smoke, Helm lint, security-scan-lite | CI (PR + push) | 269 lines; biggest workflow |
| workflows/amc-pr-gate.yml | Dogfoods scoring on every PR via local `./amc-action` composite action | CI (PR) | `amc-version: 'local'`; `./amc-action/action.yml` exists |
| workflows/amc-score.yml | Reusable `workflow_call` scoring template for consumers | dead in-repo | nothing in this repo calls it; installs amc via `curl \| sh` from agentmaturity.co; documented in docs/ as a copyable recipe |
| workflows/docker-build.yml | Docker image build/smoke | CI (PR + tags) | Node 20 |
| workflows/docker-runner.yml | Runner image build | CI (`v*` tags + PR) | |
| workflows/nightly-compatibility-matrix.yml | cron `17 2 * * *`: OS matrix × Node 20/22 + compat-matrix-report | CI (schedule + dispatch) | |
| workflows/npm-publish.yml | Changesets publish: typecheck, build, prepack-check, `version-packages`/`release` | CI (push to main) | release-gate runs implicitly via prepack |
| workflows/pages.yml | Deploys website (`build:pages`) to GitHub Pages | CI (push + dispatch) | |
| workflows/release.yml | Tag/dispatch release: desktop installers + verify, release assets, version check, SEA build | CI (tags + dispatch) | 248 lines |
| ISSUE_TEMPLATE/{bug_report, adapter_request, assurance_pack_request, domain_pack_request}.yml | Structured issue forms | wired (GitHub UI) | |
| ISSUE_TEMPLATE/config.yml | Contact links (Discussions, private security advisories) | wired | blank issues enabled |
| dependabot.yml | Weekly npm (grouped dev/prod) + github-actions updates | wired | |
| pull_request_template.md | PR description/changes template | wired | |
| .DS_Store | macOS junk | dead | should be gitignored/removed |

## Root configs

| file | purpose | wired | note |
|---|---|---|---|
| package.json (scripts) | 36 scripts: build/dev/test chain (`pretest`→build), release chain (changesets, gate, prepack), `check:*` gates, `qa:*`, `research:*`, packaging, pages, SEA, brand | mixed | `lint` is just an alias for `typecheck` — no actual linter |
| tsconfig.json | ES2022 / NodeNext, strict + `noUncheckedIndexedAccess`, src→dist, declarations | CI | |
| vitest.config.ts | node env, `tests/**/*.test.ts`, 30s timeout, v8 coverage | CI (`npm test`) | all coverage thresholds set to **0** |
| .nvmrc | Node 22 | manual | CI jobs mostly pin Node 20 — mismatch |
| .editorconfig | 2-space, LF, UTF-8, final newline | editor | |
| .mcp.json | Project MCP servers | empty `{}` | effectively unused |
| .serena/ | Serena LSP config (`project.yml`, cache, memories) | tooling | project.yml currently modified in git |
| .claude/ (top-level) | `settings.json` (only `enabledPlugins`), `scheduled_tasks.lock`, `worktrees/` | tooling | |
| `--json`, `--verbose` (root files) | 5.8KB JSON each, dated Feb 23 | dead | accidental CLI-flag-as-filename artifacts; plus stray `.tmp-*-events.json`, `.tmp-gap-report.json` at root |

## Pending changesets (33) — .changeset/*.md

adapter-capability-receipts (signed adapter capability receipts); approval-activity-search (fail-closed approval search in CLI/API/Studio); canonical-maturity-taxonomy (one L0–L5 taxonomy everywhere); capability-gated-provider-steer (steer outcome for ToolHub rejections); comparison-brand (canonical comparison page); compound-command-blast-radius (shell-segment blast-radius review); docs-code-controls (Docs code-copy controls); docs-same-origin-artifact (deterministic Pages Docs w/ SHA-256 receipts); editorial-brand (blog brand unification); evaluator-backed-control-simulation (`amc policy simulate`); first-party-public-typography (self-hosted Inter/Space Mono); hook-action-lifecycle (lifecycle hooks under stable action ID); hook-health-diagnostics (read-only hook health projection); mcp-tool-context (signed ToolHub context for MCP tools); nested-action-evidence-logic (bounded nested Action Policy logic); outcome-based-onboarding (first-run activation projection); pages-node24-actions (Pages workflow on Node 24 action majors); playground-brand (Playground brand unification); policy-fixtures-ci (`amc policy test` + CI gate); privacy-safe-approval-delivery (canonical approval quorum chain + delivery); provider-native-signed-hook-control (loopback `hooks install --mode control`); provider-neutral-hook-ingress (lease-scoped AEP 0.1 ingress); public-brand-docs (public identity + Docs catalog); public-changelog-brand (static branded changelog); public-docs-link-graph (link-closed Docs catalog); reusable-scope-templates (4 action-class scope templates); reversible-provider-hooks (reversible `hooks install/status/remove`); signed-control-version-lifecycle (fail-closed version activation/rollback); signed-evaluator-registry (signed evaluator metadata catalog); signed-guardrail-control-state (signed immutable guardrail journals); signed-observe-rollout (signed observe-only rollout counters); verified-control-projection (`amc policy controls` unified projection); worktree-reconciliation-hardening (fail-closed drift evidence + methodology r223). Config: public access, baseBranch main, no linked/fixed groups.

## Scripts no workflow ever calls (directly or via npm scripts referenced in workflows)

amc-dogfood-8-agents.mjs, docs-drift-check.mjs, fake-external-signer.mjs (test fixture), gen-api-ref.cjs, incident-readiness-check.mjs, install-persona-qa.mjs, render-brand-assets.mjs (+ brand/og-card.html), research-amc-landscape.mjs, verify-amc-landscape.mjs, swarm-test.py, swarm-test-v2.py, write-accessibility-release-evidence.mjs. (release-gate.mjs and postinstall.js reach CI only through npm lifecycle hooks, not explicit steps.)

## Findings (8)

1. **Dead code**: `scripts/swarm-test.py` and `scripts/swarm-test-v2.py` (32KB combined) have zero references anywhere in the repo — safe to delete.
2. **Orphaned generator**: `scripts/gen-api-ref.cjs` has no package.json script and no workflow; docs/API_REFERENCE.md risks silent staleness since regeneration is purely by-hand.
3. **Stray root artifacts**: files literally named `--json` and `--verbose` (CLI output accidentally captured as filenames) plus `.tmp-a2a-events.json`, `.tmp-distributed-events.json`, `.tmp-gap-report.json`, `.tmp-memory-depth-events.json`, `.github/.DS_Store` clutter the repo root.
4. **amc-score.yml never runs**: it is `workflow_call`-only with no in-repo caller — it's a consumer template stored where real workflows live, and it installs `amc` via unpinned `curl -fsSL https://agentmaturity.co/install.sh | sh` (supply-chain risk for any consumer).
5. **Coverage gate is decorative**: vitest.config.ts sets all coverage thresholds to 0 (lines/functions/branches/statements), so `npm test` can never fail on coverage despite the stated 80% standard; relatedly `npm run lint` is only a typecheck alias — no linter exists.
6. **Quality gates that never gate**: `check:docs-drift` and `check:incident-readiness` exist as npm scripts but no workflow runs them; docs drift and incident-readiness regressions can merge and ship unchecked.
7. **release-gate.mjs only fires at publish time**: it runs via the `prepack` lifecycle inside `changeset publish`, so a gate failure surfaces at the very end of npm-publish.yml rather than as an early explicit CI step.
8. **Node version drift**: `.nvmrc` pins Node 22 while ci.yml/docker-build/amc-score pin Node 20 (nightly matrix tests 20+22); local dev and CI run different majors by default.

---

# Root & `.amc` Inventory Audit

## A. `.amc/` tracked contents (from `git ls-files .amc` — 80 files)

| path | what | tracked? | belongs? | note |
|---|---|---|---|---|
| `.amc/*.yaml` + `.sig` (action-policy, adapters, agent.config, amc.config, bridge, budgets, fleet, gateway, guardrails, model-taxonomy, ops-policy, tools, trust, eval-harness) | ~14 policy configs + Ed25519 sigs | Y | Y | Signed-config-in-repo is the product's design; sigs pair 1:1 except `amc.config.yaml`, `guardrails.yaml`, `eval-harness.yaml` (unsigned) |
| `.amc/{assurance,audit,bench,cgx,forecast,prompt,value,passport}/policy.yaml` (+sigs), `audit/maps/*`, `canon/canon.yaml`, `diagnostic/bank/bank.yaml`, `mechanic/*.yaml` | subsystem policies + sigs | Y | Y | Consistent pattern; `passport/policy.yaml` has no `.sig` |
| `.amc/keys/*_ed25519.pub`, `*_history.json` | 4 public keys + rotation history | Y | Y | Public halves only — no private key material tracked |
| `.amc/transparency/log.jsonl`, `log.seal.*`, `merkle/*` | tamper-evident ledger + Merkle roots | Y | Y* | Intentional for demo/self-dogfood, but grows forever in git |
| `.amc/vault.amcvault` + `.meta.json` | encrypted vault blob | Y | **N** | In `.gitignore` yet still tracked (committed 2026-03-17, ignored later) — see Finding 2 |
| `.amc/agents/default/quality/ratings.json`, `fleet/governance-state.json`, `context-graph.json`, `current-agent`, `targets/default.target.json`, `evidence/demo-evidence.json`, `prompt-addendum.md` | runtime/demo state | Y | mixed | Demo evidence defensible; `current-agent` + governance-state are mutable runtime state in git |

## B. Remaining root files

| path | what | tracked? | belongs? | note |
|---|---|---|---|---|
| `README.md` | 873-line main doc: What is / 60-sec quickstart / Compares / What AMC Tests / Architecture / Product Family / Recipes / Adapters / Compliance / Install / Deploy / Pricing / Docs / Contributing / License | Y | Y | Claims audit: 244 questions sums correctly (19+23+95+55+52); pricing honestly labeled "planned; not yet purchasable"; "does not certify legal compliance" disclaimer present; adapter count contradicts itself (Finding 1) |
| `CHANGELOG.md` | 113KB changelog | Y | Y | Top entry `1.1.1` matches package.json 1.1.1 (last touched Jul 10); a stale keep-a-changelog `## [Unreleased]` block is buried at line 537 mid-file |
| `CONTRIBUTING.md` | 480-line contributor guide | Y | Y | Healthy size |
| `SECURITY.md` | security policy w/ Threat Model | Y | Y | Updated Apr 7 |
| `CODE_OF_CONDUCT.md` | 43-line CoC | Y | Y | — |
| `LICENSE` | MIT, © 2026 Agent Maturity Compass | Y | Y | Matches `"license": "MIT"` |
| `MEMORY.md` | OpenClaw persona long-term memory (personal info about Sid) | N | N | Gitignored; personal data in a public repo's working tree (Finding 8) |
| `NOW.md` | persona current-state (Moltbook creds path reference) | N | N | Same |
| `SOUL.md` | "Satanic Pope" persona definition | N | N | Same |
| `IDENTITY.md` | persona identity card | N | N | Same |
| `USER.md` | profile of the human (name, TZ) | N | N | Same |
| `AGENTS.md` | 70-role AI org charter (reads as agent instructions at repo root) | N | N | Risk: tools that auto-load root `AGENTS.md` will ingest it |
| `HEARTBEAT.md` | heartbeat playbook (references `~/crypto-bot`) | N | N | Same |
| `BOOTSTRAP.md` / `CONTINUATION.md` / `TOOLS.md` / `AMC_ARMY_ROLES.md` | persona bootstrap / session handoff / guardrails / agent roles | N | N | One cluster; all gitignored, all misplaced |
| `AMC_COMPLETE_KNOWLEDGE.md`, `COMPETITIVE_ANALYSIS_G0DM0D3.md`, `COMPETITIVE_GAP_REPORT_G0DM0D3.md` | internal strategy/competitive docs | **Y** | N | Tracked in a public repo; `.gitignore` ignores `COMPETITIVE_ANALYSIS.md` but the real file is `…_G0DM0D3.md` — pattern misses it |
| `AMC_IMPROVEMENT_ROADMAP.md` | roadmap | N | N | Gitignored, still on disk |
| `sbom.json` | 497KB CycloneDX SBOM | Y | N | Stale: last commit Apr 7; deps changed through Jul. Real SBOM now generated at pack time (`prepack-release-check.mjs` → `amc release sbom`) — root copy is a dead duplicate (Finding 5) |
| `compliance-{eu_ai_act,gdpr,iso_42001,nist_ai_rmf,soc2}.json` | 5 generated compliance reports | Y | N | CLI output snapshots from Mar 14–16 committed at root; stale vs current pack counts (Finding 5) |
| `agent-maturity-compass-1.0.0/1.1.0/1.1.1.tgz` | npm pack outputs, ~14MB total | N | N | Ignored via `*.tgz`; delete (releases live on npm/GitHub) |
| `test_model.pkl` | 47-byte deliberate malicious-pickle fixture | Y | **N** | Finding 3 |
| `.tmp-a2a-events.json`, `.tmp-distributed-events.json`, `.tmp-memory-depth-events.json`, `.tmp-gap-report.json` | temp test event dumps (Apr 6–7) | **Y** | N | Tracked and not gitignored (Finding 4) |
| `--json`, `--verbose` | release-gate JSON written to flag-named files (Feb 23) | N | N | Gitignored by literal name; bug artifact (Finding 6) |
| `..bfg-report/2026-02-23/{3 runs}` | BFG Repo-Cleaner reports incl. `object-id-map.old-new.txt`, `protected-dirt` | N | N | History-rewrite residue (Finding 7) |
| `test-results/` | Playwright failure artifacts (brand/docs/playground specs) | N | N | Gitignored; safe to delete |
| `logs/` | empty directory | N | N | Delete |
| `tmp/` | ~37 screenshots, smoke JSONs, `amc-cloud-snap.tgz` | N | N | Gitignored; periodic purge needed |
| `ASSETS/landing_page_copy.md` | marketing copy | N | N | Gitignored; belongs in `website/` if wanted |
| `security-audit/{awesome-agent-skills, awesome-openclaw-skills, voltagent}` | third-party repos cloned for scanning | N | N | Gitignored; move outside the repo |

## C. npm tarball verification

`package.json` `files` is a strict allowlist: `dist/**` (minus `sea/`, `installers/`), `scripts/postinstall.js`, `scripts/run-policy-fixtures-ci.mjs`, `fixtures/policy/amc-ci-policy-fixtures.yaml`, `README.md`, `LICENSE`. **None of the root junk above — persona files, `.tmp-*`, compliance JSONs, `sbom.json`, `test_model.pkl`, `.amc/` — ships in the npm package.** `CHANGELOG.md` is also excluded (npm does not auto-include it; add to `files` if intended). `prepack` additionally runs the release gate.

## Findings (ranked)

1. **README contradicts itself on adapter count** — heading says "## 14 Framework Adapters" (line 617) while the comparison table (line ~168) and Pricing table (line ~717) both claim "15 adapters". One is wrong; pick the number `amc adapters list` actually reports.
2. **`.amc/vault.amcvault` + `.meta.json` are tracked despite being gitignored** — committed 2026-03-17, ignore rule added later (gitignore never untracks). An encrypted vault blob in a public repo is offline-brute-force material; `git rm --cached` both and rotate the vault passphrase.
3. **`test_model.pkl` is an orphaned malicious-pickle fixture at repo root** — contains `import pickle; pickle.loads(b'malicious_code')`, tracked since Mar 11, referenced only by `plans/` research notes, not by any test in `src/`/`tests/`/`scripts/`. It will trip downstream security scanners of anyone who clones the repo; move under `tests/fixtures/` with a README or delete.
4. **Four `.tmp-*.json` files are tracked and not gitignored** — temp event dumps committed Apr 6–7; no `.tmp-*` pattern in `.gitignore`, so they will recur. `git rm --cached`, add `.tmp-*` to `.gitignore`.
5. **Committed compliance evidence is stale** — `sbom.json` (last commit Apr 7) and the 5 `compliance-*.json` (Mar 14–16) predate months of dependency and pack changes, while the release pipeline already regenerates SBOM at prepack. For a "tamper-evident compliance" product, shipping stale evidence in-repo is a credibility own-goal; delete or move to `docs/` with generation dates.
6. **`--json` / `--verbose` files prove an arg-parsing bug** — some past invocation treated CLI flags as output paths and wrote release-gate JSON (`status: FAIL`, 8 high findings) into files literally named `--json`/`--verbose` (Feb 23). The files were gitignored by name rather than the bug being confirmed fixed — verify current `release-gate.mjs`/`amc fix` arg handling, then `rm ./--json ./--verbose`.
7. **BFG history-rewrite residue in working tree** — `..bfg-report/` (3 runs, Feb 23) holds `object-id-map.old-new.txt` and `protected-dirt`, which map purged old object IDs and can point at whatever secret was scrubbed. Archive outside the repo and delete; confirm the purged secret was rotated.
8. **Personal/persona files live in a public product repo's working tree** — 11 gitignored files (`SOUL.md`, `MEMORY.md`, `NOW.md`, `USER.md`, `HEARTBEAT.md`, etc.) contain personal data, a credentials file path, and agent instructions; root `AGENTS.md` is auto-ingested by many coding agents. One `git add -f`, a tarball, or an ignore-blind tool leaks them — and `AMC_COMPLETE_KNOWLEDGE.md` + both `*_G0DM0D3.md` competitive docs are *already tracked* (the ignore pattern `COMPETITIVE_ANALYSIS.md` doesn't match). Relocate the persona set to `~/`, and decide deliberately whether strategy docs are public.

---

