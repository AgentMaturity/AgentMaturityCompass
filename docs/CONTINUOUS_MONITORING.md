# Continuous Production Monitoring

**Real-time agent observability that closes the LangSmith/LangFuse gap.**

## Overview

AMC's continuous monitoring system provides production-grade observability for AI agents:

- **Continuous scoring** — Automatic periodic scoring (default: every 5 minutes)
- **Drift detection** — Automatic regression detection (default: every 15 minutes)
- **Alert thresholds** — Configurable score drop and anomaly alerts
- **Dashboard metrics feed** — Real-time metrics for dashboards
- **Webhook notifications** — Instant alerts on score drops and incidents

## Quick Start

```bash
# Start monitoring an agent
amc monitor start --agent my-agent

# Check monitoring status
amc monitor status

# View recent events
amc monitor events --limit 50

# Get metrics for a specific agent
amc monitor metrics --agent my-agent
```

## Configuration

### Scoring Interval

Control how often the agent is scored:

```bash
amc monitor start --agent my-agent --scoring-interval 300000  # 5 minutes (default)
```

### Drift Check Interval

Control how often drift detection runs:

```bash
amc monitor start --agent my-agent --drift-interval 900000  # 15 minutes (default)
```

### Score Drop Threshold

Set the threshold for score drop alerts (0-1):

```bash
amc monitor start --agent my-agent --score-drop-threshold 0.1  # 10% drop (default)
```

### Webhook Notifications

Disable webhook notifications:

```bash
amc monitor start --agent my-agent --no-webhooks
```

## Monitoring Events

The continuous monitor emits the following events:

### Score Events

Emitted after each scoring cycle:

```json
{
  "type": "score",
  "ts": 1710086400000,
  "agentId": "my-agent",
  "data": {
    "score": 3.45,
    "runId": "run-123",
    "delta": -0.12
  }
}
```

### Drift Events

Emitted after each drift check:

```json
{
  "type": "drift",
  "ts": 1710086400000,
  "agentId": "my-agent",
  "data": {
    "triggered": true,
    "ruleId": "maturity-regression",
    "reasons": ["Overall score dropped by 0.8 points"],
    "incidentId": "incident-456"
  }
}
```

### Anomaly Events

Emitted when anomalies are detected:

```json
{
  "type": "anomaly",
  "ts": 1710086400000,
  "agentId": "my-agent",
  "data": {
    "type": "SCORE_VOLATILITY_SPIKE",
    "severity": "HIGH",
    "message": "Score volatility spiked 3.2x"
  }
}
```

### Alert Events

Emitted when alerts are dispatched:

```json
{
  "type": "alert",
  "ts": 1710086400000,
  "agentId": "my-agent",
  "data": {
    "ruleId": "continuous-monitor-score-drop",
    "summary": "Score dropped 12.5% (3.45 → 3.02)"
  }
}
```

## Metrics

Each monitored agent tracks the following metrics:

- `currentScore` — Latest overall score
- `previousScore` — Previous overall score
- `scoreDelta` — Change from previous score
- `lastScoredAt` — Timestamp of last scoring
- `lastDriftCheckAt` — Timestamp of last drift check
- `activeIncidents` — Number of active incidents
- `anomaliesDetected` — Total anomalies detected
- `totalScores` — Total number of scores collected
- `uptime` — Monitor uptime in milliseconds

## Provider Drift Canary Alerts

Run provider/model canaries before promoting a new provider route or model snapshot:

```bash
amc benchmark provider-drift --file provider-drift.json --json
```

The result includes:

- provider/model/version pairs for baseline and candidate rows
- canary-level quality score, refusal-rate, p95 latency, and mean-cost drift
- optional architectural repair-effectiveness, false-positive identification, and net codebase impact drift
- optional artifact accuracy, formula integrity, and artifact format quality drift for end-to-end deliverable canaries
- optional protocol success, agreement/deal rate, target outcome value, and latent-preference alignment drift for hidden-preference or proxy-risk canaries
- optional evaluator-suite coverage, guardrail pass rate, score-threshold pass rate, and retry-stability drift for standard evaluator libraries and pytest-style regression suites
- optional Eval-ai-library-style evaluator framework proof: framework id/version, provider route, metric suite id, metric ids/count, evaluator config hash, generated test-data hash, verdict aggregation mode/config hash, temperature and power-mean parameters where applicable, dashboard/report artifact hash, and missing-proof reasons
- optional Opik-style observability pipeline proof: pipeline orchestrator/run, experiment tracker/run, observability project, datastore, retrieval index, content dataset, summary artifact, QA dataset, trace export, metric report, pipeline config, and missing-proof reasons
- optional SparkOrbit-style orbit-monitor proof: source/repository/license refs, source catalog, leaderboard snapshot, model-registry snapshot, benchmark-feed snapshot, news-feed snapshot, reload run, ranking policy, summary artifact, source count, leaderboard category count, daily reload verification, and missing-proof reasons
- optional GeoBenchX-style geospatial tool-calling proof: geospatial benchmark id, task-set hash, dataset snapshot hash, tool-registry hash, reference-solution hash, trace export hash, judge panel id, judge config hash, human-calibration hash, result-report hash, token-cost report hash, task-complexity groups, solvable/unsolvable task counts, tool count, max tool iterations, and missing-proof reasons
- optional user-aware agent metrics: progress AUC, progress per turn, pass@k, pass^k, subgoal completion, expected-tool-call coverage, persona coverage, and clustered error-rate drift
- evidence references for traces, datasets, approvals, or benchmark fixtures
- replayable eval-pack manifest with row hashes and signed evidence refs
- active watch alerts for unwaived threshold breaches
- CI or lifecycle gate result that blocks on unwaived drift
- visible waiver state for approved migration windows

The API equivalent is `POST /api/v1/benchmarks/provider-drift`, which returns `{ report, watchAlerts, evalPack, ciGate }`.

When evaluator framework context is supplied, missing framework/version, provider route, metric suite/count, evaluator config, generated test data, aggregation config, temperature/power-mean parameters for temperature-controlled power-mean aggregation, or dashboard/report artifact proof creates an `evaluationFrameworkEvidence` alert and fails closed unless a waiver explicitly covers it.

When observability pipeline context is supplied, missing pipeline orchestrator/run, experiment tracker/run, observability project, datastore, retrieval index, content dataset, summary artifact, QA dataset, trace export, metric report, or pipeline config proof creates an `observabilityPipelineEvidence` alert and fails closed unless a waiver explicitly covers it.

When orbit-monitor context is supplied, missing source/repository/license proof, source catalog, leaderboard/model/benchmark/news snapshots, reload run, ranking policy, summary artifact, source count, leaderboard-category count, or daily reload proof creates an `orbitMonitorEvidence` alert and fails closed unless a waiver explicitly covers it. AMC uses sparkorbit/sparkorbit only as a high-level AI orbit monitor and leaderboard drift signal and does not copy its code, commands, configs, dashboard UI, screenshots, README prose, local LLM setup, Docker scripts, ranking data, benchmark rows, model/news/source feeds, or implementation details.

## Benchmark Methodology Versions

Provider drift, replay-corpus, and live-drift receipts must preserve the methodology context that made the result comparable:

- `corpusVersion`
- `harnessVersion`
- `modelPoolVersion`
- `tierPolicyVersion`
- `verificationProtocolVersion`
- `scoringFormulaVersion`
- `costAccountingVersion`

Treat static offline receipts as fast regression evidence and live dynamic receipts as end-to-end execution evidence. Do not compare or substitute them unless the relevant versions match or the receipt includes an explicit migration/waiver.

## Metric Validation Gates

Score/report consumers should inspect `metricValidation.ciGate` before treating a score as an externally reliable claim. The gate binds validation rows into an eval pack with row hashes, signed evidence refs, confidence intervals, sample sizes, owners, and fail-closed reasons.

Metric-validation rows can include target outcome alignment checks. These are designed for hidden-preference or proxy-risk settings where an agent can satisfy the surface protocol, complete a task, or reach agreement while missing the outcome the metric is supposed to measure. Rows can also include process-evidence coverage checks for trajectory defect and control-preservation evidence, safety-utility coverage checks for untrusted-tool settings where unsafe-tool, safe-control, final-action risk, and utility-preservation evidence must all be represented, modality-transformation coverage checks for text-to-voice or other transformed benchmarks where source labels, tool schemas, transform configuration, speaker/noise variants, paired-modality parity, and judge-validation evidence must remain bound, lifecycle-observability checks where input/output validation, evaluator execution, structured traces, lifecycle-state transitions, and monitoring evidence must remain bound, ranking-stability checks where subsampling confidence, tail-failure, data-quality, OCR/readability, and pairwise/listwise ordering evidence must remain bound before checkpoint/model rankings are used externally, tool-sandbox checks where registry, dependency-graph, seeded-state, API-failure, retrieval, verification, trajectory, and recovery evidence must remain bound before dynamic tool-environment metrics are used externally, continual-learning checks where task-sequence, dataset-version, retention, adaptation, forgetting-rate, environment/config, controller-log, and longitudinal-run evidence must remain bound before lifelong-learning metrics are used externally, strategic-interaction checks where player-roster, public-transcript, private-action, collision/rule, scoring/rating, silent-baseline, truncation/context, and pairwise-uncertainty evidence must remain bound before multi-agent game metrics are used externally, architecture-reality checks where wrapper-agent, marketing-agent, and real-agent baselines, planning, memory, recovery, stress, network, cost, ensemble, and statistical-confidence evidence must remain bound before architecture-comparison metrics are used externally, RAG-pipeline checks where custom document/test sets, domain/jurisdiction/language/task coverage, corpus/chunking, index provenance, solution roster/config, retriever/reranker/model/judge configs, selected metrics, query-level results, metric-computation traces, logged samples, retrieval/generation traces, evaluator, report/export, and performance/cost evidence must remain bound before retrieval or generation metrics are used externally, RAG evaluation-pipeline checks where ground-truth question/answer sets, RAG pipeline config, document corpus, metric definitions, query/retrieval/generation traces, evaluator config, evaluation report, metric owner, sample size, and confidence interval evidence must remain bound before explicit RAG pipeline evaluation metrics are used externally, business-workflow checks where domain/task coverage, simple-baseline, public/private split, toolset/config, programmatic assertion, partial-credit/pass-rate, export, and multi-run comparison evidence must remain bound before workflow-automation metrics are used externally, data-agent analytical checks where task-type coverage, database/source-modality coverage, difficulty distribution, metric-computation traces, agent-workflow roster/config, expert-validation evidence, cost/latency traces, and submission-schema evidence must remain bound before heterogeneous analytical-query benchmark metrics are used externally, embodied-agent checks where task-type coverage, simulator environment config, scene or dataset package, random/human/model baselines, action-observation trajectory, result folder, overall and task-type metric reports, metric owner, sample size, and confidence interval evidence must remain bound before simulator benchmark metrics are used externally, evaluator-suite checks where deterministic assertions, LLM judge criteria, safety assertions, red-team attacks, dataset eval manifests, custom judge definitions, reporter outputs, framework integrations, threshold configs, metric owners, sample sizes, and confidence intervals must remain bound before judge-suite metrics are used externally, pentest-benchmark checks where source/repository/license proof, benchmark releases, task ids, target images, runtime controllers, firewall isolation, LLM proxies, smart-contract datasets, historical forks, problem metadata, FlawVerifier contracts, Forge grader results, profit thresholds, anti-cheat reset proof, cutoff splits, Dockerized app manifests, language-stack coverage, vulnerability-class coverage, difficulty distribution, multi-step chains, flag and threat-model ground truth, false-positive traps, controls, exploit traces, exploit-success metrics, reports, owners, sample sizes, and confidence intervals must remain bound before security-agent metrics are used externally, trace-evaluation checks where model config, agent parameters, tool registry, trace manifests, repeatable cases, validators, bulk runs, permutations, mocked backend controls, metric definitions, measurement exports, production monitors, threshold alarms, owners, sample sizes, and confidence intervals must remain bound before trace-derived metrics are used externally, and living-environment checks where task programs, mutable environment manifests, environment-mutation traces, capability manifests, sandbox providers, agent adapters, multi-turn trajectories, stage checkers, checker results, trial results, aggregate reports, pass@k metrics, proactive triggers, owners, sample sizes, and confidence intervals must remain bound before stateful multi-turn benchmark metrics are used externally. Supplied outcome, process-evidence, safety-utility, modality-transformation, lifecycle-observability, ranking-stability, tool-sandbox, continual-learning, strategic-interaction, architecture-reality, RAG-pipeline, RAG evaluation-pipeline, business-workflow, data-agent analytical, embodied-agent, evaluator-suite, pentest-benchmark, trace-evaluation, or living-environment checks below threshold fail closed in CI/lifecycle runs.

Persona-agent checks add the PersonaGym-style case: persona manifests, static environments, benchmark question sets, persona-agent configs, model/provider configs, response traces, rubrics, PersonaScore-style metric definitions, human-alignment calibration, evaluation outputs, benchmark results, owners, sample sizes, and confidence intervals must remain bound before persona-adherence or persona-agent metrics are used externally. When `requirePersonaAgentProof` is set, incomplete persona-agent checks fail closed in CI/lifecycle runs.

Scientific-literature checks add the AutoResearchBench-style case: benchmark manifests, deep and wide research task manifests, released dataset and obfuscation manifests, literature corpus manifests, search backends, DeepXiv and web-search tool configs, agent configs, inference runs, evaluation-pipeline configs, deep-search accuracy metrics, wide-search IoU metrics, result reports, owners, sample sizes, and confidence intervals must remain bound before scientific literature discovery metrics are used externally. When `requireScientificLiteratureProof` is set, incomplete scientific-literature checks fail closed in CI/lifecycle runs.

Mobile-agent checks add the MobileBench-style case: benchmark manifests, paper/source refs, mobile environment manifests, app inventories, API catalogs, UI automation traces, task datasets, task-complexity groups, multi-app task manifests, checkpoint rubrics/results, reset policies, device-state fixtures, result reports, dataset license boundaries, owners, sample sizes, and confidence intervals must remain bound before mobile-agent benchmark metrics are used externally. When `requireMobileAgentProof` is set, incomplete mobile-agent checks fail closed in CI/lifecycle runs. AMC uses Xiaomi/MobileBench only as a high-level mobile-agent metric-validity signal and does not copy its code, commands, setup steps, prompts, app lists, APKs, datasets, task rows, result files, screenshots, demo videos, README prose, paper text, paper tables, or implementation details.

Geospatial provider-drift checks add the GeoBenchX-style case: benchmark identity, task-set hashes, dataset snapshots, tool registries, reference-solution manifests, tool-call trace exports, judge panel/config proof, human-calibration evidence, result reports, token-cost reports, complexity groups, solvable and unsolvable task counts, tool counts, max-iteration thresholds, signed evidence refs, and row hashes must remain bound before geospatial provider comparisons are used externally. Missing geospatial proof emits `geospatialToolCallingEvidence` Watch alerts. AMC uses Solirinai/GeoBenchX only as a high-level geospatial provider-drift signal and does not copy its code, prompts, notebooks, task rows, reference solutions, datasets, generated maps, HTML transcripts, result tables, README prose, paper text, paper tables, screenshots, images, or implementation details.

## Live Score and Behavior Drift Alerts

Use live drift receipts after production traces have accumulated. This compares a signed baseline eval window to a live production window and keeps Humanloop-style online evaluator signals separate from provider/model canaries.

```bash
curl -X POST http://localhost:4319/api/v1/watch/live-drift \
  -H "content-type: application/json" \
  -d @live-drift.json
```

The request contains `baselineWindow.rows` and `liveWindow.rows`. Each row should include a trace id, scenario id, score, behavior signature, optional pass/refusal/error/latency/cost/tool-call metrics, optional survey-backed `agentEvaluationDimension` labels, optional perturbation family/severity, optional robustness stability scores, optional arena/environment/reference-pool context, optional framework execution context (`executionMode`, `agentScaffoldId`, `frameworkConfigHash`, `toolRegistryHash`, and `environmentSnapshotId`), optional trajectory-divergence signals (`solutionPathCount`, `offPathAttemptCount`, `divergenceMomentum0to1`, and `actionFixationRate0to1`), optional social-realism distribution signals (`socialHarmPrevalence0to1`, `socialSentimentMinus1to1`, `socialSemanticAlignment0to1`, `socialLexicalDiversity0to1`, `populationSegmentId`, and `discourseContextId`), optional persona-policy signals (`personaPolicyId`, `personaDiversityClusterId`, `personaHumanLikeness0to1`, `personaBehaviorCoverage0to1`, and `personaTaskGoalPreservation0to1`), optional privacy-leakage signals (`privacySensitiveDisclosureRate0to1`, `privacyPeerExposureRate0to1`, `privacySocialPressureIntensity0to1`, and `privacySafeguardActiveRate0to1`), optional artifact-quality signals (`artifactAccuracy0to1`, `formulaIntegrity0to1`, and `formatQuality0to1`), optional process/control-preservation signals (`processDefectRate0to1`, `controlInterpretability0to1`, `controlInterruptibility0to1`, `controlCorrectability0to1`, `controlReversibility0to1`, and `authorityHandoffRate0to1`), optional tool-use RL signals (`toolUseReward0to1`, `toolAnswerVerification0to1`, `toolJudgeAgreement0to1`, `toolCallValidity0to1`, `toolRolloutDiversity0to1`, `toolEvalImprovementDelta0to1`, `toolRlModelId`, `toolRlDatasetHash`, `toolRlRewardRubricHash`, `toolRlVerifierHash`, `toolRlEnvironmentHash`, `toolRlRolloutConfigHash`, and `toolRlJudgeModelId`), optional trading-agent signals (`tradingMarketRegimeId`, `tradingStrategyId`, `tradingRiskPolicyId`, `tradingAiProviderRouteId`, `tradingMemorySnapshotHash`, `tradingChartImageHash`, `tradingIndicatorSnapshotHash`, `tradingClaimValidationTraceHash`, `tradingNewsContextHash`, `tradingPaperLedgerHash`, `tradingWinRate0to1`, `tradingRiskRewardRatio`, `tradingMaxDrawdown0to1`, `tradingRealizedPnlPct`, `tradingRiskLimitViolationRate0to1`, `tradingClaimValidationFailureRate0to1`, `tradingVisionChartAgreement0to1`, `tradingMemoryRetrievalHitRate0to1`, and `tradingProviderFallbackRate0to1`), optional agentic-search signals (`agenticSearchBenchmarkId`, `agenticSearchDatasetFamily`, `agenticSearchQueryType`, `agenticSearchQueryId`, `agenticSearchTaskId`, `agenticSearchSourceManifestHash`, `agenticSearchToolConfigHash`, `agenticSearchPlannerTraceHash`, `agenticSearchSearchTraceHash`, `agenticSearchCitationTraceHash`, `agenticSearchSynthesisTraceHash`, `agenticSearchResultManifestHash`, `agenticSearchPlanningScore0to1`, `agenticSearchQueryDecompositionScore0to1`, `agenticSearchRelevanceScore0to1`, `agenticSearchSynthesisScore0to1`, and `agenticSearchCitationCoverage0to1`), optional document-to-dataset signals (`documentDatasetPipelineId`, `documentDatasetSourceFormat`, `documentDatasetTask`, `documentDatasetExportTarget`, corpus/index/document/page/cell/sample/export/bench/report hashes, `documentDatasetNumGuardCoverage0to1`, `documentDatasetNumericMismatchRate0to1`, `documentDatasetQaAccuracy0to1`, `documentDatasetSummaryQuality0to1`, `documentDatasetRagFaithfulness0to1`, `documentDatasetTokenSavingsRatio`, `documentDatasetThroughputDocsPerSec`, and `documentDatasetMemoryRssMb`), optional EDD RAG strategy signals (`ragPipelineStrategy`, `ragStrategyComparisonId`, `ragStrategyRunId`, strategy/index/query/reference-answer/evaluator/model/result hashes), optional RAG dataset-builder signals (`ragDatasetBuilderId`, `ragDatasetVersion`, source-document/license/QA-pair/passage/config hashes, optional PDF parser and postprocess hashes, `ragDatasetTier`, `ragQuestionType`, `ragBuilderStage`, question/source-document counts, passage-grounding/human-verification/citation/answer-support coverage, generation cost, batch size, document concurrency, and incremental-only-missing mode), optional local-system monitor signals (`localSystemMonitorProfileId`, device/hardware scanner/process catalog/sensor log/alert receipt hashes, workload context, thermal-baseline deviation, voltage SPC anomaly, voltage rail id, process identity match, ghost-driver detection/handling, proactive alert delivery, offline mode, cloud disabled, API key absent, and local-data-only flags), optional live CTF evaluation controls (`ctfEventId`, `ctfChallengeId`, `ctfChallengeCategory`, `ctfAgentInstanceId`, `ctfTeamAccountId`, `ctfFlagAccepted`, `ctfFirstCorrectFlagForwarded`, `ctfExternalSearchUsed`, `ctfIndependenceViolated`, `ctfContaminationRisk0to1`, `ctfCompetitionImpact0to1`, `ctfSubmissionCount`, and `ctfTimeToFlagMs`), optional partial-credit CTF controls (`ctfVmImageHash`, `ctfSandboxProfileHash`, `ctfCheckpointRubricHash`, `ctfExecutionTraceHash`, `ctfCheckpointJudgeRef`, `ctfIsolationBoundaryId`, `ctfCheckpointCompletion0to1`, `ctfPartialCreditScore0to1`, and `ctfIsolationViolated`), optional interaction turn count, optional invalid-action/error-attribution rates, evidence refs, and signed evidence refs.

For RAG monitoring, rows may also include `ragEvaluationMode`, corpus/chunking metadata, `ragRetrieverId`, `ragGeneratorId`, `ragFrameworkId`, `ragRetrievalTopK`, generated-data suffix/finalization, judge type, hallucination evaluator status, and RAG metric fields for accuracy, completeness, utilization, numerical accuracy, and hallucination rate.

For EDD RAG strategy monitoring, rows may include a strategy comparison id, strategy run id, `ragPipelineStrategy`, strategy manifest hash, index manifest hash, query-set hash, reference-answer hash, evaluator config hash, model config hash, and strategy result hash. Watch fails closed when any row that claims strategy-comparison context lacks complete strategy proof or when the live strategy mix materially diverges from the baseline.

For RAG QA dataset-builder monitoring, rows may include builder id, dataset version, source-document manifest, source license, QA-pair manifest, passage manifest, builder config, optional PDF parser and postprocess hashes, easy/medium tier, single-source/multi-hop/wide question type, builder stage, question/source-document counts, passage-grounding coverage, human-verification coverage, citation coverage, answer-support coverage, generation cost, batch size, document concurrency, and incremental-only-missing mode. Watch fails closed when source/license/QA/passage/config evidence is incomplete, grounding/human/citation/support coverage drops, question/source-document counts regress, cost rises beyond threshold, or tier/question-type/stage/context distributions move materially away from the baseline.

For KITE-style knowledge-intensive RAG monitoring, rows may include benchmark id, source/repository/license refs, corpus manifest, document set, query set, ground-truth answer, rubric, RAG pipeline config, response manifest, result manifest, judge config, dataset family (`ai_papers`, `cloud_10k`, `company_handbook`, `supreme_court`, custom, or unknown), RAG configuration id, grading scale, question/document counts, grade, normalized grade, small-sample warning, evidence refs, signed evidence, and row hashes. Watch fails closed when native or normalized grades drop, KITE evidence coverage is incomplete, question/document counts regress, or dataset-family, RAG-configuration, or benchmark context distributions move materially away from the baseline.

For PokerEval-style partial-information poker simulation monitoring, rows may include benchmark id, source/repository/package/citation refs, simulation config, agent config, opponent-pool hash, run manifest, hand-history manifest, metric report, game type (`nlth_cash`, `nlth_tournament`, custom, or unknown), table size, blind-structure hash, hand count, BB/100, all-in adjusted BB/100, EV BB/100, VPIP rate, evidence refs, signed evidence, and row hashes. Watch fails closed when BB/100, all-in adjusted BB/100, or EV drops, VPIP shifts, evidence coverage is incomplete, evaluated hand count regresses, or game-type, table-context, or opponent-pool distributions move materially away from the baseline.

For SAP agent-evaluation tutorial monitoring, rows may include tutorial id, source/repository/license/paper refs, notebook, dataset, baseline log, live sample, metric config, tooling config, role-access policy, reliability policy, compliance policy, alert receipt, objective (`agent_behavior`, `capability`, `reliability`, `safety`, custom, or unknown), evaluation process (`interaction_mode`, `dataset_benchmark`, `metric_computation`, `tooling`, custom, or unknown), enterprise context (`role_based_access`, `reliability_guarantee`, `dynamic_long_horizon`, `compliance`, custom, or unknown), coverage metrics, evidence refs, signed evidence, and row hashes. Watch fails closed when objective/process/enterprise/evidence coverage is incomplete, taxonomy distributions drift, or signed row evidence is missing. AMC treats SAP-samples/llm-agents-eval-tutorial as a high-level source signal only and does not copy notebooks, datasets, logs/sample logs, commands, code, requirements, HTML, paper text, examples, screenshots, or implementation details.

For agent-evaluation observability monitoring, rows may include source/repository/license refs, agent config, eval dataset, prompt variant, model config, RAG index, metric config, baseline/live eval results, OpenTelemetry trace, Application Insights, Event Hub, Kusto policy, Fabric dashboard, alert receipt, metric set (`rag_quality`, `cost_tokens`, `latency`, `variant_selection`, custom, or unknown), telemetry channel (`application_insights`, `event_hub`, `fabric_eventhouse`, `fabric_dashboard`, custom, or unknown), coverage metrics, evidence refs, signed evidence, and row hashes. Watch fails closed when config/telemetry/evidence coverage is incomplete, metric-set or telemetry distributions drift, or signed row evidence is missing. AMC treats vladfeigin/llm-agents-evaluation as a high-level source signal only and does not copy code, commands, configs, Kusto scripts, dashboards, screenshots, README prose, datasets, prompts, examples, or implementation details.

For HedraRAG artifact-eval monitoring, rows may include artifact id, source/repository snapshot refs, license status (`declared`, `absent`, or `unknown`) with declared-license proof or absent/unknown license-review proof, paper and artifact README refs, workflow (`single_retrieval`, `hyde`, `multistep`, `recomp`, `irg`, `graph_rag`, custom, or unknown), baseline framework (`hedrarag`, `heterag`, `langchain`, `flashrag`, `faiss_custom`, custom, or unknown), runtime (`pytorch_docker`, `cuda_gpu`, `cpu`, `native`, custom, or unknown), dataset/corpus/index/dependency/environment/run-script/result/plot/baseline/live/alert/resource/GPU hashes, p95 latency, throughput, memory, replay pass status, evidence refs, signed evidence, and row hashes. Watch fails closed when latency, throughput, memory, replay pass rate, evidence coverage, workflow distribution, baseline-framework distribution, runtime context, or signed row evidence breaks threshold. AMC treats Leo9660/HedraRAG_AE as a high-level source signal only and does not copy code, commands, scripts, configs, dataset/index artifacts, benchmark rows, generated outputs, plots, README prose, paper prose, screenshots, package metadata, or implementation details.

For agent-eval-harness monitoring, rows may include run id, source/repository/license refs, trace schema hash, trace collector hash, trace writer hash, adapter config hash, framework (`langchain`, `openai_agents`, `crewai`, `anthropic`, `pydantic_ai`, `frameworkless`, custom, or unknown), trace mode (`decorator`, `context_manager`, `framework_adapter`, `cli_run`, `dashboard_run`, custom, or unknown), metric context (`tool_success`, `hallucination_schema`, `hallucination_semantic`, `hallucination_llm_judge`, `latency`, `cost`, `combined`, custom, or unknown), trace/dataset/task/tool manifests, hallucination/pricing/metrics configs, baseline/live run hashes, comparison report, dashboard snapshot, local-storage policy, alert policy, reproducibility command, tool-success rate, hallucination rate, p95 latency, mean cost, trace coverage, evidence refs, signed evidence, and row hashes. Watch fails closed when tool success drops, hallucination rises, latency or cost regresses, trace/evidence coverage is incomplete, framework/trace-mode/metric-context distributions drift, or signed row evidence is missing. AMC treats Siddharth-1001/agent-eval-harness as a high-level source signal only and does not copy code, commands, examples, configs, trace rows, dashboard assets, README/docs prose, package metadata, screenshots, or implementation details.

For expert-curated genomics benchmarks, rows may include `genomicsTaskStage`, problem/trait/condition/cohort ids, reference/prediction dataset hashes, metadata/toolchain/expert-annotation hashes, format-conformance status, format-error count, reference-output match, and selection/preprocessing/statistical-analysis metric fields. Watch fails closed when live samples lose reference coverage, format conformance, expert-curation proof, stage coverage, context comparability, or per-stage metric quality.

For safety red-team monitoring, rows may include ALERT-style `redTeamBenchmarkId`, dataset/prompt-set/prompt/response hashes, `redTeamSubset`, risk category, adversarial attack type, policy context, guard model, guard label, guard score, unsafe-response flag, compliance score, and taxonomy hash. Watch fails closed when unsafe-response rate rises, compliance or guard score falls, dataset/taxonomy/attack/guard evidence coverage drops, or risk-category/attack/subset/guard-label distributions drift.

For PIArena-style prompt-injection monitoring, rows may include benchmark id, dataset hash/name, attack id/mode/config, defense id/config, injected-prompt hash, model config, evaluation config, result artifact, agent benchmark (`injecagent`, `agentdojo`, `agentdyn`, or custom), agent suite, attack success, defense block, false-positive status, agent-task success, and tool-call success. Watch fails closed when attack success rises, defense block drops, false positives rise, agent-task or tool-call success drops, evidence coverage is incomplete, or attack/defense/dataset/agent-benchmark distributions drift while generic score and behavior stay stable.

For BackdoorAgent-style backdoor monitoring, rows may include benchmark id, dataset hash, task id/family, workflow stage (`planning`, `memory`, `tool_use`, cross-stage, or custom), attack id/family, trigger hash, poison config hash, model config hash, agent config hash, run config hash, trajectory trace hash, result artifact hash, attack success, clean task success, trigger activation, trigger persistence, trigger propagation, and trajectory capture. Watch fails closed when attack success rises, clean accuracy drops, trigger persistence or propagation rises, trajectory or evidence coverage is incomplete, or stage/task-family/attack-family distributions drift while generic score and behavior stay stable.

For agent-security control monitoring, rows may include Hermes-style `agentSecurityGuardId`, policy, taint, proxy or secret-guard, audit-trail, runtime-telemetry, eval-pack, and classifier hashes; source-origin coverage; taint-propagation coverage; policy-decision accuracy; secret-scrub rate; audit-trail integrity; attack-effectiveness rate; false-positive rate; and guard P95 latency. Watch fails closed when origin or taint coverage drops, policy accuracy drops, secret-scrub or audit integrity drops, attack effectiveness or false-positive rates rise, evidence coverage is incomplete, guard latency regresses, or guard/policy/classifier/eval-pack context moves materially away from the baseline.

For agent-testing methodology monitoring, rows may include `agentTestingTaxonomyId`, methodology, scenario-catalog, fault-injection-plan, observability-plan, safety-plan, and standards-map hashes; category; testing approach; fault model; benchmark family; methodology, scenario, fault-injection, and observability coverage; resilience pass rate; and safety-regression rate. Watch fails closed when live samples keep generic scores stable but lose testing-methodology coverage, scenario coverage, fault-injection coverage, resilience pass rate, observability signal coverage, complete evidence, or category/approach/fault/benchmark-family comparability.

For chaos-reliability monitoring, rows may include benchmark id, scenario id, chaos profile, injection plan, mutation manifest, endpoint contract, judge config, trace bundle, score ledger, agent-card, and improvement-eval hashes; framework id; modality; benchmark family; production reliability; resilience score; chaos drop; recovery pass rate; and failure-trace coverage. Watch fails closed when live samples keep generic scores stable but lose production reliability, chaos resilience, recovery rate, failure-trace coverage, improvement-eval coverage, complete evidence, or framework/modality/benchmark/profile comparability.

For ADK runtime monitoring, rows may include runtime id, framework version, agent graph hash, tool registry hash, eval dataset and case hashes, runner config hash, session state hash, live request queue hash, API server route hash, deployment manifest hash, model route, execution mode, deployment target, eval pass rate, tool-call success rate, graph coverage, streaming stability, and deployment readiness. Watch fails closed when live samples keep generic scores stable but lose ADK eval pass rate, tool-call success, graph coverage, streaming stability, deployment readiness, complete evidence, or framework/graph/tool/model-route/execution/deployment comparability.

For PhysicianBench-style clinical EHR monitoring, rows may include benchmark id, task-set version, paper/source reference hash, task id, specialty, task type, FHIR server image hash, FHIR API schema hash, patient-record manifest hash, patient cohort hash, verifier checkpoint hash, trajectory hash, workspace artifact hash, eval-log hash, metadata hash, model config hash, tool manifest hash, run config hash, task success, checkpoint pass rate, FHIR data-access accuracy, clinical-action safety, documentation quality, trajectory capture, and artifact-bundle completeness. Watch fails closed when clinical success, checkpoint pass rate, FHIR access, safety, documentation, trajectory coverage, artifact coverage, evidence coverage, specialty mix, task-type mix, or EHR context drifts while generic score and behavior stay stable.

For agentic-search monitoring, rows may include dataset families such as `general_qa`, `multi_hop_qa`, `complex_task`, `report_generation`, `math_coding`, or `multimodal`, query types such as `single_hop`, `multi_hop`, `complex`, `report`, `math`, `coding`, or `multimodal`, plus planner/search/citation/synthesis/result trace hashes. Watch fails closed when planning, query-decomposition, relevance, or synthesis quality drops, citation coverage falls below threshold, trace evidence is incomplete, or the live dataset/query/tool-context distribution moves materially away from the baseline.

For document-to-dataset monitoring, rows may include document source formats such as `pdf`, `markdown`, `csv_tsv`, or `image_ocr`, generation tasks such as `qa`, `summary`, `rag`, or `finetune`, export targets such as `huggingface`, `openai_finetune`, `axolotl`, or `rag_jsonl`, plus corpus/index/document/page/cell/sample/export/bench/report hashes. Watch fails closed when QA, summary, or RAG faithfulness drops, NumGuard coverage drops, numeric mismatch increases, evidence coverage is incomplete, token savings or throughput regress, memory increases, or task/source-format/export/pipeline context moves materially away from the baseline.

For CPU-centric agentic workload monitoring, rows may include benchmark id, paper reference hash, workload family (`web_search`, `rag`, `code_generation`, `math_tool_use`, `chemistry_research`, throughput microbenchmark, energy measurement, or custom), framework id, runtime (`vllm`, API-backed, search/tool-backed, FAISS, chemistry-tool, Bash, or custom), schedule mode, environment/conda/hardware/system/model-server/API-boundary/workload/dataset/tool/run/result hashes, optional figure artifact, batch size, worker count, request rate, latency percentiles, throughput, CPU/GPU utilization, memory, and bottleneck share metrics. Watch fails closed when reproduction evidence is incomplete, latency rises, throughput or GPU utilization drops, CPU or memory use increases, bottleneck shares move materially, or workload/runtime/schedule/context distributions drift away from baseline.

For 12-technique evaluator monitoring, rows may include suite id, technique (`exact_match`, `llm_as_judge`, `structured_data_validation`, `dynamic_ground_truth`, `trajectory_evaluation`, `tool_precision_improvement`, `component_wise_rag`, `ragas`, `realtime_feedback`, `pairwise_comparison`, `simulation_benchmarking`, `algorithmic_feedback`, or custom), notebook/dataset/reference/ground-truth/trajectory/tool-schema/RAG-source/judge/callback/batch/LangSmith/LangChain hashes, per-technique score fields, algorithmic-feedback coverage, evidence refs, and signed evidence refs. Watch fails closed when exact-match, judge-agreement, structured-validation, dynamic-ground-truth, trajectory, tool, RAG, feedback, pairwise, or simulation metrics drop, algorithmic-feedback or evidence coverage is incomplete, or technique/context distributions drift away from baseline.

For web-agent privacy leakage monitoring, rows may include benchmark id, dataset hash, task-config hash, browser environment (`shopping`, `gitlab`, `reddit`, or custom), observation mode (`accessibility_tree`, `image_som`, or custom), action-set tag, instruction config, cookie state, environment reset, data-minimization policy, allowed/sensitive info manifests, trajectory hash, result artifact hash, leakage judge hash, captioning model hash for image/SoM mode, model route hash, data-minimization pass rate, leakage rate, unnecessary disclosure rate, sensitive-field exposure count, task-success rate, and modal leakage delta. Watch fails closed when data-minimization drops, leakage/disclosure/exposure rises, task success drops, modal leakage rises, evidence coverage is incomplete, or browser environment, observation mode, and benchmark context drift away from baseline.

For local-system monitoring, rows may include monitor profile, device profile, hardware scanner, process catalog, sensor log, alert receipt, workload context, thermal-baseline deviation, voltage SPC anomaly, voltage rail id, process identity match, ghost-driver detection/handling, proactive alert delivery, offline mode, cloud disabled, API key absent, and local-data-only flags. Watch fails closed when thermal deviation or voltage anomalies increase, process identity, driver handling, proactive alert, local-only privacy, or evidence coverage drops, or workload/hardware context moves materially away from the baseline.

For observability/SRE monitoring, rows may include o11y-bench-style proof: benchmark id, task-spec hash, generated-task hash, Grafana stack/environment config hash, Docker config hash, scenario-clock hash and alignment flag, agent trajectory hash, command stdout hash, grading-details hash, reward hash, result JSON hash, HTML report hash, incident context id, task type (`metric_query`, `log_query`, `trace_query`, `dashboard_inspection`, `alert_triage`, `root_cause_analysis`), data source (`grafana`, `prometheus`, `loki`, `tempo`), tool mode (`mcp_grafana`, `gcx_cli`, `harbor_builtin`, `custom_agent`), deterministic-check pass rate, rubric score, resolution score, and optional evidence coverage. Watch fails closed when resolution, deterministic checks, or rubric quality drops, when task/spec/environment/trajectory/grading/report proof is incomplete, when scenario-clock alignment falls below threshold, or when incident/task/data-source/tool-mode distributions move materially away from the baseline.

For web-operator monitoring, rows may include open-operator-evals-style proof: benchmark/dataset/task/provider/agent-version identity, browser mode, judge model, run-config/replay/result/screenshot/trajectory hashes, self-reported success, independent LLM-evaluated success, retry counts, task reliability, step counts and limits, and time per task. Watch fails closed when independent evaluation success drops, self-report overclaim or mismatch rises, task reliability drops, replay evidence is incomplete, task time regresses, step-limit violations increase, or provider/context distributions move materially away from baseline.

For Navi-Bench-style real-website web-agent monitoring, rows may include benchmark id, source/repository/license refs, Hugging Face dataset ref, blog ref when cited, task id, website-domain taxonomy, task config hash, evaluator config hash, agent config hash, browser mode/provider proof, baseline/live result hashes, saved trajectory hash, visualization artifact hash, screenshot trace hash, alert receipt hash, task finished/crashed/success flags, lower-bound score, excluding-crashed score, upper-bound score, step count/max steps, evidence coverage, signed evidence refs, and row hashes. Watch fails closed when task success drops, crash rate rises, crash-adjusted score bounds regress, trajectory/visualization/evidence coverage is incomplete, step count or step-limit violations regress, or website-domain/browser/eval-context distributions drift while generic score and behavior stay stable. AMC uses yutori-ai/navi-bench as a high-level source signal only and does not copy code, commands, datasets, task rows, screenshots, visualization HTML, README prose, result tables, examples, configs, or implementation details.

For legal-agent monitoring, rows may include LegalAgentBench-style proof: benchmark/dataset/corpus/task identity, task type, difficulty, planning-tree hash, tool-manifest hash, tool-run trace hash, intermediate-step annotation hash, process trace hash, output hash, reference-answer hash, evaluation-report hash, token-record hash, final-success flag, process rate, tool-use accuracy, citation coverage, and token cost. Watch fails closed when final success, process rate, tool-use accuracy, or citation coverage drops, when legal evidence coverage is incomplete, when token cost regresses, or when corpus/task-type/difficulty/planning/tool-manifest context moves materially away from baseline.

For ResearchGym-style autonomous research monitoring, rows may include benchmark id, paper/source reference hash, task id and domain, task/pruned-repository/dataset/evaluation-harness/baseline-score/grading-script/withheld-solution/run-config/runtime-image/agent-adapter/workspace/transcript/cost-summary/status/plan/inspection/violation-report hashes, baseline and candidate scores, score improvement, subtask count and completion, experiment and async-job counts, runtime and API budgets, actual runtime and cost, inspection pass, budget-overrun, and violation flags. Watch fails closed when score improvement or subtask completion drops, artifact coverage is incomplete, inspection pass rate drops, budget overruns or violations appear, or task-domain/runtime-context distributions move materially away from baseline while generic score and behavior stay stable.

For OSUniverse-style GUI-navigation monitoring, rows may include benchmark id, source/repository/license/paper refs, testcase id, task category, complexity level, testcase manifest, agent config, runner config, runtime and runtime-image proof when applicable, dependency lock, validator config, validation report, result artifact, viewer artifact, trajectory, screenshot trace, task success, automated-validation pass, validation error rate, step count, and max-step threshold. Watch fails closed when task success or automated validation drops, validation error rises, evidence coverage is incomplete, step count or step-limit violations regress, or task-category, complexity-level, or runtime context moves materially away from baseline while generic score and behavior stay stable.

For AIAnytime-style LLM/RAG eval-suite monitoring, rows may include eval-suite/run id, candidate/reference manifests, metric-suite hash, semantic similarity metric id and score, bias metric id and risk score, hallucination/faithfulness metric id and rate, judge-config hash, report hash, signed evidence refs, and row hash. Watch fails closed when semantic similarity drops, bias risk or hallucination/faithfulness risk rises, baseline or live proof coverage is incomplete, or suite/reference/metric/judge context drifts beyond thresholds. AMC uses AIAnytime/Evaluation-of-LLMs-and-RAGs as a high-level signal only and does not copy code, notebooks, examples, prompts, or commands.

For D-Star-AI/KITE-style monitoring, rows may include source/repository/license refs, corpus, document-set, query-set, ground-truth answer, rubric, RAG pipeline config, response, result, judge, dataset-family, RAG-configuration, grading-scale, question/document count, grade, normalized grade, and small-sample evidence. Watch fails closed when grades drop, evidence is incomplete, sample counts regress, or dataset/config/context distributions drift beyond thresholds. AMC uses D-Star-AI/KITE as a high-level end-to-end RAG benchmark signal only and does not copy code, commands, configs, prompts, queries, answers, rubrics, documents, result rows, README prose, screenshots, package metadata, or implementation details.

For superagent-ai/poker-eval-style monitoring, rows may include source/repository/package/citation refs, simulation config, agent config, opponent pool, run manifest, hand-history manifest, metric report, game/table/blind context, hand count, BB/100, all-in adjusted BB/100, EV, VPIP, and signed evidence. Watch fails closed when KPI drops or shifts breach thresholds, proof is incomplete, sample counts regress, or game/table/opponent context distributions drift beyond thresholds. AMC uses superagent-ai/poker-eval as a high-level partial-information poker-simulation signal only and does not copy code, commands, examples, configs, cards, hand-history rows, leaderboard rows, README prose, screenshots, package metadata, or implementation details.

For SLDBench-style scaling-law discovery monitoring, rows may include benchmark id, paper/source reference, eval-run id, task id/type, dataset manifest, train/test split hashes, source-experiment manifest, task/evolution/evaluator config hashes, model-route hash, program artifact, checkpoint trace, result report, formula family, extrapolation regime, R2, NMSE, NMAE, signed evidence refs, and row hash. Watch fails closed when R2 drops, NMSE or NMAE rises, baseline or live proof coverage is incomplete, or task-type and benchmark/dataset/split/config/model/formula/extrapolation context drifts beyond thresholds. AMC uses linhaowei1/SLD and its paper as high-level scaling-law discovery signals only and does not copy code, commands, configs, task tables, data rows, prompts, outputs, README prose, paper text/tables/figures, or implementation details.

The response includes:

- `receipt.baselineHash` and `receipt.liveSampleHash`
- `receipt.scoreDrift` for score, pass-rate, refusal-rate, error-rate, latency, cost, tool-call, tool-use RL reward/answer-verification/judge-agreement/tool-validity/rollout-diversity/eval-improvement, trading win-rate/risk-reward/PnL/drawdown/risk-limit/claim-validation/chart-vision/memory/provider-fallback shifts, safety red-team unsafe-response/compliance/guard-score/coverage shifts, PIArena-style prompt-injection attack-success/defense-block/false-positive/agent-task/tool-call/evidence shifts, BackdoorAgent-style backdoor attack-success/clean-accuracy/trigger-persistence/trigger-propagation/trajectory/evidence shifts, agentic-search planning/query-decomposition/relevance/synthesis drops, agentic-search citation/trace coverage drops, document-to-dataset quality, numeric integrity, evidence, efficiency, throughput, and memory shifts, CPU-centric latency/throughput/resource/bottleneck/evidence shifts, eval-technique exact-match, LLM-judge, structured-validation, dynamic-ground-truth, trajectory, tool, RAG, feedback, pairwise, simulation, algorithmic-feedback, and evidence shifts, SAP agent-evaluation objective/process/enterprise/evidence coverage shifts, agent-evaluation observability config/telemetry/evidence coverage shifts, HedraRAG artifact-eval latency/throughput/memory/replay/evidence shifts, agent-eval-harness tool-success/hallucination/latency/cost/trace/evidence shifts, LLM/RAG semantic similarity, bias risk, hallucination/faithfulness, and eval-suite evidence shifts, KITE-style RAG grade, normalized-grade, evidence, question-count, and document-count shifts, PokerEval-style BB/100, all-in adjusted BB/100, EV, VPIP, hand-count, and evidence shifts, SLDBench-style scaling-law R2/NMSE/NMAE and evidence shifts, web-agent privacy data-minimization, leakage, unnecessary disclosure, sensitive exposure, task success, modal leakage, and evidence shifts, EDD RAG strategy evidence shifts, RAG dataset-builder grounding/human/citation/support/evidence/cost/question/source-count shifts, local-system thermal/voltage/process/driver/alert/privacy/evidence shifts, observability/SRE resolution, deterministic-check, rubric, evidence, trace, report, and scenario-clock shifts, web-operator independent-evaluation, self-report overclaim, mismatch, task reliability, replay coverage, task-time, and step-limit shifts, legal-agent final-success, process-rate, tool-use accuracy, citation coverage, evidence coverage, and token-cost shifts, ResearchGym score-improvement, subtask-completion, artifact, inspection, budget-overrun, and violation shifts, OSUniverse task-success, automated-validation, validation-error, evidence, step-count, and step-limit shifts, trajectory-divergence, social-realism, persona-policy quality, privacy-leakage, artifact-quality, process/control-preservation, live CTF solve/search/contamination/competition/independence/flag-forwarding, partial-credit CTF checkpoint/trace/isolation, RAG metric drops, MIRAGE-style RAG metric-proof drops, RAG hallucination-rate increases, retrieval top-k shifts, generated-data finalization drops, interaction-turn, invalid-action, and error-attribution shifts
- `receipt.behaviorDrift` for behavior-signature divergence, lifecycle-stage divergence, survey-backed agent-evaluation dimension divergence, perturbation coverage divergence, arena context divergence, framework execution context divergence, tool-use RL context divergence, trading market/strategy/risk/provider/memory/chart/indicator/claim-validation/news/ledger context divergence, red-team risk-category/attack/subset/guard-label divergence, PIArena attack/defense/dataset/agent-benchmark divergence, BackdoorAgent stage/task-family/attack-family divergence, ADK runtime context divergence, agentic-search dataset-family/query-type/tool-context divergence, document-to-dataset task/source-format/export/pipeline-context divergence, CPU-centric workload/runtime/schedule/context divergence, eval-technique mix/context divergence, SAP agent-evaluation objective/process/enterprise-context divergence, agent-evaluation observability metric-set/telemetry divergence, HedraRAG workflow, baseline-framework, and runtime-context divergence, agent-eval-harness framework, trace-mode, and metric-context divergence, LLM/RAG eval-suite context divergence, KITE-style dataset-family, RAG-configuration, and benchmark-context divergence, PokerEval-style game-type, table-context, and opponent-pool divergence, SLDBench-style scaling-law task-type/context divergence, web-agent privacy environment/observation-mode/context divergence, EDD RAG strategy-mix divergence, RAG dataset-builder tier/question-type/stage/context divergence, local-system workload/hardware context divergence, observability/SRE incident/task/data-source/tool-mode context divergence, web-operator provider/context divergence, legal-agent corpus/task-type/difficulty/tool-context divergence, ResearchGym task-domain and runtime-context divergence, OSUniverse task-category, complexity-level, and runtime-context divergence, social context divergence, persona-policy distribution divergence, live CTF context divergence, partial-credit CTF VM context divergence, RAG evaluation-mode divergence, RAG pipeline-context divergence, MIRAGE-style benchmark/dataset/QA/context/retrieval/protocol/model/retriever/metric context divergence, genomics stage/context divergence, and robustness stability drops
- Navi-Bench receipts add task-success, crash-rate, lower-bound score, excluding-crashed score, trajectory, visualization, evidence, step-count, and step-limit score drift plus website-domain, browser-mode, and eval-context behavior drift.
- Agent-security control drift adds score-drift fields for origin/taint coverage, policy accuracy, secret-scrub, audit integrity, attack effectiveness, false positives, evidence coverage, and guard latency.
- Agent-security control drift adds behavior-drift fields for guard, policy, classifier, and eval-pack context divergence.
- per-row hashes and signed evidence refs
- `watchAlerts` for material score or behavior drift
- `failClosed` when thresholds breach or signed evidence is missing

Score-facing callers can use `POST /api/v1/score/live-drift`; Shield verifies the receipt at `POST /api/v1/shield/live-drift/verify`.

## Replay Corpus Alerts

Run a replay corpus before promoting an agent, prompt, harness, or policy-pack change:

```bash
amc benchmark replay-corpus --file replay-corpus.json --json
```

The result includes:

- `manifest.fixtureHash` for the fixed replay fixture set
- per-row fixture hashes, evidence refs, signed evidence refs, and score deltas
- optional behavior snapshot and tool-call sequence diff hashes
- optional adversarial regression receipts with release-gate proof plus Arthur Engine continuous-eval, guardrail-rule, rerun, and alert-rule evidence
- optional pairwise comparison receipts for head-to-head prompt/response evaluations
- optional modality-pair receipts for transformed benchmark rows, including source/target fixture hashes, schema/label preservation hashes, transform configuration, speaker/noise/judge-validation hashes when supplied, and text-vs-target score deltas
- optional interactive-episode receipts for language-feedback or environment benchmarks, including observation, instruction, feedback, action, reward, termination, randomization, feedback-mode, reward-visibility, and step-limit evidence
- optional video post-production receipts for media-task benchmarks, including task family/id, task instruction hash, source/candidate media manifest hashes, expected output spec, verifier design/reward/metric hashes, agent trajectory, Harbor result, trial log, executor, sandbox image, oracle/baseline solver hashes, leaderboard or human-review hashes, judge mode, task/clip counts, reward, and reward threshold evidence
- optional PawBench-style model-harness receipts, including model id, harness id, task id/source, scenario/capability/complexity/modality/environment taxonomy, grading mode, prompt/workspace/timeout/task metadata hashes, grader or judge rubric evidence, transcript, metrics, submission, slice payload, replay command, result-version path, deterministic seed, task count, and open-environment preservation evidence
- optional skill-lifecycle receipts for skill-authoring benchmarks, including lifecycle mode, architecture pattern, TDD baseline, grader/comparator/analyzer reports, blind comparison, benchmark summary, package artifact, and five-axis score thresholds
- optional SkillBench-style adversarial skill regression receipts, including source reference, skill manifest, baseline and with-skill agent configs, eval-suite and eval-case manifests, deterministic grader, static-analysis config, security-scan report, baseline/with-skill/rerun outputs, result report, replay command, release gate, expected/actual decisions, deterministic seed, eval-case count, correctness, security, completeness, robustness, with-skill score, score delta, and thresholds
- optional RAG-evaluation receipts for retrieval-augmented generation benchmarks, including corpus-document, generated-question, reference-answer, retrieval trace, generation trace, scoring report, human review, quality metric, and performance metric evidence. Industrial multimodal RAG rows can additionally require text/image corpus hashes, PDF and image-extraction traces, image summaries, separate text/image or combined vector-store hashes, multimodal embedding config hashes, baseline and correct-context run hashes, judge model/rubric evidence, modality-specific context/faithfulness scores, and modality coverage before the row is replayable.
- optional MiRAGE-style multimodal multihop RAG dataset-generation receipts, including source/repository/license proof, input documents, semantic chunks, multihop context graph, role manifest, generate/select/verify/correct trace, multimodal carrier manifest, backend/embedding/reranker configs, token usage, checkpoint/resume, deduplication, evaluation report, replay command, output dataset, visualization artifact, backend/modality/stage coverage, question counts, score delta, replay pass rate, metric coverage, and thresholds
- optional RAG chunking-strategy receipts for chunker-comparison benchmarks, including source reference, document/question/reference-answer hashes, chunker manifest, chunking/embedder/keyword-index/fusion configs, retrieval trace, scoring config/report, report/export artifacts, replay command, deterministic seed, document/question/chunker counts, strategy kinds, retrieval mode, best-chunker id, combined-score, answer-span coverage, semantic-focus metrics, and thresholds
- optional Advanced RAG notebook receipts, including course/lesson identity, retrieval variant, notebook/output hashes, environment/dependency hashes, corpus/index/query/reference-answer hashes, retrieval/generation/eval/observability traces, replay command, deterministic seed, query count, context relevance, groundedness, answer relevance, and thresholds
- optional GAGE-style unified evaluation receipts, including engine/run identity, modality, harness mode, configs, registry, dataset, backend, adapter, metric, output contract, events JSONL, samples JSONL, summary JSON, artifact manifests, output directory, environment, dependency lock, replay command, deterministic seed, sample/metric/artifact counts, replay coverage, score mean, and thresholds
- optional AI research task receipts for research-science benchmark fixtures, including problem/dataset/metric/SOTA hashes, harness/scaffold identity, seed count, submission artifact, evaluation script, evaluator output, normalized score, valid-submission flag, and SOTA-surpass flag
- optional GTO Wizard-style poker-agent replay receipts, including source/repository/license proof, API documentation, metric reference, eval pack, fixture, agent policy, API-key scope, no-solver-access policy, hand-history manifest, legal-action trace, result manifest, AIVAT metric report, leaderboard snapshot, replay command, CI receipt, agent type ids, game variant, hand count, deterministic seed, AIVAT bb/100 metrics, replay pass rate, legal-action rate, and thresholds
- optional CostNav-style physical navigation replay receipts, including source/repository/license proof, benchmark spec, scenario manifest, route graph, economic-cost model, physical-agent config, simulator config, trajectory manifest, result manifest, metrics report, replay command, CI receipt, route types, scenario counts, deterministic seed, economic-cost delta, navigation success, replay pass rate, score delta, and thresholds
- optional spent-style session-cost replay receipts, including source/repository/license proof, Claude Code hook config, JSONL log manifest, pricing snapshot, classifier rules, command transcript, dashboard export, result manifest, replay command, CI receipt, privacy/no-telemetry boundary, session and tool-event counts, deterministic seed, efficiency and cost deltas, replay pass rate, classification coverage, JSON export validity, and thresholds
- optional FIRE-style fact-checking replay receipts, including source/repository/paper proof, dataset and atomic-claim manifests, retriever and verifier configs, decision policy, search-provider config, evidence/query/label traces, cost report, result manifest, replay command, CI receipt, atomic-claim and retrieval-step counts, max retrieval depth, deterministic seed, factuality and LLM/search cost deltas, replay pass rate, evidence recall, label agreement, dynamic retrieval boundary, search-provider boundary, and thresholds
- optional Nuclia RAG-triad replay receipts, including source/repository/license proof, package version, model-card refs, model-cache policy, Hugging Face auth boundary, evaluator config, dataset and QA-context manifests, metric manifest, answer/context/groundedness traces, result manifest, replay command, CI receipt, query/context/metric counts, deterministic seed, triad metrics, composite delta, replay pass rate, model-access boundary, no-raw-context-copy boundary, and thresholds
- optional scientific-evaluation receipts for AI4Science benchmark suites, including capability dimensions, disciplines, input modalities, dataset/model registries, prompt/evaluator configs, scoring backend, sandbox config, batch run config, result artifacts, leaderboard/report artifacts, coverage metrics, and average score
- optional dynamic tool-sandbox receipts for MCP or other stateful tool benchmarks, including protocol, retrieval mode, tool registry, dependency graph, seeded state, API-failure schedule, trajectory trace, retrieval trace, environment-verification trace, retrieval recall, verification coverage, and recovery attempt evidence
- optional platform-evaluation receipts for hosted or self-hosted eval-platform workflows, including dataset format, dataset/config/template hashes, judge/model/metric configs, batch run config, RAG config, evaluator trace, export/report artifacts, score metrics, latency, and throughput evidence
- optional Azure agent-lab receipts for workshop-style cloud agent/RAG/evaluation replay, including lab/module ids, guide and notebook hashes, Azure service/project/search/RAG/tool/evaluator configs, cloud-run and identity proof, replay command, seed, scenario count, evaluation score, groundedness, and thresholds
- optional ClawEnvKit-style environment-generation receipts, including generated task YAML, task schema, generation prompt, fixture manifest, mock-service catalog/state, audit log, trajectory, verification/scoring/safety configs, harness tier/id, adapter proof, Docker or agent-loop proof, replay command, seed, service/task/check counts, component scores, final score, and safety gate evidence
- optional DeepResearch-style progressive-search receipts, including workflow/LLM/search/local-runtime configs, context assembly, task plans, progressive-search traces, tool-call traces, knowledge extraction, cross-evaluation traces, iteration logs, final report artifacts, lockfiles, replay commands, seeds, source counts, hallucination checks, report scores, and thresholds
- optional web-search-evaluation receipts for source-linked search-agent benchmarks, including dataset/source-link hashes, search-engine/model/evaluator/agent-framework configs, navigation/search/citation traces, result JSONL and metric-report hashes, domain/question-type/source-link coverage, final score, component metrics, and pass rate
- optional binary-audit receipts for compiled-binary security benchmarks, including task id, target app, category, architecture, binary/config/container/toolchain/trace/report/ground-truth hashes, expected and actual decisions, binary-shape flags, success rate, and false-positive evidence
- optional long-term-memory receipts for memory-span and long-conversation benchmarks, including benchmark version, config, dataset/interface, model, runner, generated test, conversation, memory-update, retrieval, result, and report evidence. REALTALK-style rows can additionally include real-dialogue provenance, privacy/consent proof, temporal split, LoCoMo comparison boundary, 21-day conversation span, memory-probing QA/evaluator artifacts, persona-simulation release proof, emotional-intelligence artifacts, metrics, and thresholds without exporting raw chats.
- optional streaming-improvement receipts for continuous-improvement benchmarks, including source dataset and original source manifests, agent/benchmark configs, stream sequence, initial state, update/prediction/evaluation/sanity-check traces, result artifacts, online-update/sanity flags, improvement delta, retention, and catastrophic-forgetting evidence
- optional biomedical-agent-evaluation receipts for biomedical agent benchmarks, including task/workflow type, task/dataset/knowledge-base/tool/workflow/model/sandbox hashes, execution/code-execution traces, structured result, report, artifact/evaluator hashes, completion counts, score thresholds, and safe-code-execution evidence
- optional enterprise-tool-calling receipts for executable multi-hop and multi-source tool benchmarks, including capability/domain/source-mode identifiers, local API/database/document/MCP/tool-schema/policy hashes, trajectory replay, tool-call/tool-response/retrieved-evidence traces, output validation, evaluator config, deterministic replay, output-validation flags, and policy/groundedness/tool-response/final-answer metrics
- optional benchmark-hackability audit receipts for reward-hacking and evaluation-vulnerability checks, including scanner identity, target benchmark/task manifests, phase traces, static-tool reports, AI-inspection traces, vulnerability finding manifests, dashboard/report artifacts, replay commands, sandbox controls, PoC validation, vulnerability-class coverage, task-count coverage, exploitability thresholds, and signed evidence
- aggregate `manifest.scoreDelta0to1`
- `ciReceipt` with manifest hash, fixture hash, failed rows, failed adversarial-regression rows, failed pairwise rows, failed modality-pair rows, failed interactive-episode rows, failed video-post-production rows, failed PawBench rows, failed benchmark-hackability audit rows, failed skill-lifecycle rows, failed RAG-evaluation rows, `failedAdvancedRagRowIds`, `failedGageEvaluationRowIds`, failed AI-research-task rows, `failedGtoWizardPokerReplayRowIds`, failed scientific-evaluation rows, failed tool-sandbox rows, failed platform-evaluation rows, failed DeepResearch rows, failed web-search-evaluation rows, failed binary-audit rows, failed long-term-memory rows, failed streaming-improvement rows, failed enterprise-tool-calling rows, failed biomedical-agent-evaluation rows, and fail-closed state
- `watchAlerts` for regressed rows or rows missing signed evidence

The API equivalent is `POST /api/v1/benchmarks/replay-corpus`. Watch-only callers can use `POST /api/v1/watch/replay-corpus`; Shield can verify `{ manifest, ciReceipt }` at `POST /api/v1/shield/replay-corpus/verify`.

## Question Explainability Packets

Watch explain packets include the same question-level receipt pack generated by Score:

```bash
curl -X POST http://localhost:4319/api/v1/watch/explain \
  -H "content-type: application/json" \
  -d '{"agentId":"my-agent","runId":"run-123"}'
```

The response includes:

- `markdown` with `## Question Score Explainability`
- `questionExplainability.manifestHash`
- per-question evidence window event count, session count, and duration
- per-question accepted signed evidence IDs
- rejected evidence IDs and reasons
- evaluation criteria IDs, types, judge refs, and criterion repair hints, including prompt-artifact alignment, subjective quality, objective quality, task-category coverage, temporal forecast horizon, multi-source integration, tool-use trace, multi-agent orchestration, session-state trace, tool-auth boundary, code-execution sandbox, untrusted tool feedback, trajectory trust formation, hidden-trigger detection, final-action risk, safe-control comparison, router-visible prefix, step-level model choice, trajectory membership, downstream success preservation, cost-accounting trace, red-team challenge scope, sandboxed execution environment, exploit attempt trace, flag submission outcome, step-budget termination, off-policy evaluation protocol, logged dataset trace, baseline comparison, code-modification trace, optimization-cycle trace, and reliability-improvement checks when those criteria are supplied
- rubric lens previews with skill type, rubric version/source, score, grade, Deep Review certificate hash, market-signal refs, per-check pass/partial/fail/not-applicable status, weights, accepted evidence refs, rejected evidence refs, and check-specific fix hints
- Promptflow-style RAG flow diagnostics with flow id, vector-search backend, flow DAG hash, parameter config hash, eval set hash, batch run id, evaluator flow hash, ground-truth column, data mapping hash, variant/config hashes, deployment artifact hash, metric IDs, status, evidence refs, rejected evidence refs, and repair hints
- AI-coding landscape lenses with source category, dataset refs and SHA-256 hashes, update cadence, freshness, cohort refs, benchmark or tool/model refs, status, evidence refs, rejected evidence refs, and repair hints for fast-moving coding-agent or leaderboard claims
- benchmark-submission lenses with benchmark/source identity, submission id/version, agent version, timestamp, task id/category/status, grading type, overall/category score, speed, cost, leaderboard metric views, submission metadata hash, task-breakdown hash, leaderboard snapshot hash, criterion-level scores, evidence refs, rejected evidence refs, repair hint, and row hash
- professional-task lenses with benchmark/source identity, task/scenario id, industry category, professional domain, dataset/scenario/world-model/tool-schema/agent/fault/verifier/trajectory/result/replay/debug hashes, environment mode, fault mode, verifier-vote threshold, pass-rate threshold, robustness threshold, trajectory-step bound, evidence refs, rejected evidence refs, repair hint, and row hash
- SRE incident-triage lenses with OpenEnv environment id, source ref, task/scenario id, difficulty/severity, OpenEnv/scenario/incident/log/metric/user-report/action/grader/feedback hashes, reward/root-cause/red-herring/ordered-remediation scores and thresholds, step bounds, deterministic grader status, evidence refs, rejected evidence refs, repair hint, and row hash
- missing L-level gates or cap reasons
- repair hints for the next evidence collection step

Use this after a score-drop alert to decide whether the agent regressed, evidence went missing, a claim was unsupported, or the operator needs to collect a specific signed receipt before promoting the result.

Studio exposes the same row-level context at `console/evidenceDrilldown?agent=<agentId>&run=<runId>&question=<questionId>`, including the evaluation criteria table, rubric lens previews, RAG flow diagnostics, AI-coding landscape lenses, benchmark-submission lenses, professional-task lenses, and SRE incident-triage lenses used to justify the question score. The page is intentionally fail-closed: missing question receipt packs, absent rows, unsupported claims, capped rows, missing gate reasons, failed/missing RAG flow diagnostics, stale or incomplete landscape lenses, incomplete benchmark-submission lenses, incomplete professional-task lenses, incomplete incident-triage lenses, and partial/failing rubric lens checks are visible as empty/error states or fail-closed status instead of being hidden behind a single aggregate score.

## Dashboard Integration

The continuous monitor integrates with the AMC Studio dashboard via the `DashboardFeed`:

```typescript
import { globalDashboardFeed } from "agent-maturity-compass";

// Get real-time snapshot
const snapshot = globalDashboardFeed.getSnapshot();

// Listen for events
globalDashboardFeed.on("event", (event) => {
  console.log("New event:", event);
});

// Get agent metrics
const metrics = globalDashboardFeed.getAgentMetrics("my-agent");
```

## Programmatic Usage

```typescript
import { createContinuousMonitor } from "agent-maturity-compass";

const monitor = createContinuousMonitor({
  workspace: "/path/to/workspace",
  agentId: "my-agent",
  scoringIntervalMs: 300000,  // 5 minutes
  driftCheckIntervalMs: 900000,  // 15 minutes
  scoreDropThreshold: 0.1,  // 10%
  enableWebhooks: true
});

// Event handlers
monitor.on("score", (event) => {
  console.log("Score:", event.data.score);
});

monitor.on("drift", (event) => {
  if (event.data.triggered) {
    console.log("Drift detected:", event.data.reasons);
  }
});

monitor.on("alert", (event) => {
  console.log("Alert:", event.data.summary);
});

// Start monitoring
await monitor.start();

// Get metrics
const metrics = monitor.getMetrics();
console.log("Current score:", metrics.currentScore);

// Stop monitoring
await monitor.stop();
```

## Alert Configuration

Alerts are configured via `.amc/alerts.yaml`:

```yaml
alerts:
  version: 1
  channels:
    - type: webhook
      name: slack-alerts
      url: https://hooks.slack.com/services/YOUR/WEBHOOK/URL
      secretRef: vault:alerts/slack
  rules:
    - id: maturity-regression
      when:
        overallDropGte: 0.5
        layerDropGte: 0.7
        integrityDropGte: 0.15
        correlationDropBelow: 0.9
        assuranceDropBelow:
          injection: 80
          hallucination: 80
      actions:
        - ALERT_OWNER
        - FREEZE_EXECUTE
        - CREATE_INCIDENT
      freezeActionClasses:
        - DEPLOY
        - WRITE_HIGH
        - SECURITY
```

## Comparison to LangSmith/LangFuse

| Feature | LangSmith/LangFuse | AMC Continuous Monitoring |
|---------|-------------------|---------------------------|
| Continuous scoring | ❌ Manual | ✅ Automatic (configurable intervals) |
| Drift detection | ❌ No | ✅ Built-in with alert thresholds |
| Alert thresholds | ❌ No | ✅ Configurable score drops & anomalies |
| Dashboard metrics | ✅ Yes | ✅ Real-time feed |
| Webhook notifications | ✅ Yes | ✅ On score drops & incidents |
| Evidence-backed | ❌ No | ✅ Ed25519 + Merkle tree proof chains |
| Tamper-evident | ❌ No | ✅ Cryptographic signatures |

## Best Practices

1. **Start with defaults** — The default intervals (5min scoring, 15min drift) work well for most agents
2. **Tune thresholds** — Adjust `scoreDropThreshold` based on your agent's stability
3. **Monitor the monitor** — Check `amc monitor status` regularly to ensure monitors are running
4. **Review events** — Use `amc monitor events` to understand agent behavior patterns
5. **Set up webhooks** — Configure `.amc/alerts.yaml` for instant notifications

## Troubleshooting

### Monitor not starting

Check that the workspace is initialized:

```bash
amc init
```

### No score events

Ensure the agent has at least one scoring run:

```bash
amc quickscore --agent my-agent
```

### Webhooks not firing

Verify alerts configuration:

```bash
cat .amc/alerts.yaml
amc drift alerts test
```

## See Also

- [Drift Detection](./DRIFT_DETECTION.md)
- [Alert Configuration](./ALERTS.md)
- [Dashboard API](./DASHBOARD_API.md)
- [AMC Studio](./STUDIO.md)
