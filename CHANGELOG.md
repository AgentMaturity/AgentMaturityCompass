# Changelog

## 1.1.0

### Minor Changes

- ece9624: Add Advanced RAG notebook replay receipts with course/lesson identity, retrieval variant, notebook/output hashes, environment and dependency-lock hashes, corpus/index/query/reference-answer hashes, retrieval/generation/eval/observability traces, replay command, deterministic seed, query count, RAG triad metric thresholds, CI failed-row reporting, and r42 methodology docs.
- ece9624: Add Agentest-style scenario-test metric-validity proof with signed source, endpoint, scenario, persona, goal, knowledge, tool-mock, scripted-turn, trajectory assertion, LLM judge, comparison, CI reporter, result, sample-size, confidence-interval, and row-hash evidence. Missing or invalid proof now fails closed when `requireAgentScenarioTestProof` is enabled.
- ece9624: Add agentic-search live drift receipts for baseline-to-live monitoring.

  Rows can now bind benchmark id, dataset family, query type, query/task ids, source and tool-config hashes, planner/search/citation/synthesis trace hashes, result manifest hash, planning/query-decomposition/relevance/synthesis scores, and citation coverage. Score, Watch, and Shield now fail closed on agentic-search score drops, citation or trace coverage gaps, dataset-family drift, query-type drift, tool-context drift, missing signed evidence, or receipt hash mismatches.

- ece9624: Add LLM workflow observability methodology-versioning boundaries for trace, visual-debugger, prompt/model registry, frontend analytics, user-feedback, session-replay, telemetry privacy, migration, badge, and report proof.
- ece9624: Add RAG chunking-strategy replay corpus receipts with fail-closed document/question/reference-answer, chunker, retrieval, scoring, export, replay-command, count, score, answer-span, and semantic-focus proof.
- ece9624: Add typed continual-game learning metric-validity proof for TokenSpire2-style agents with required task sequence, game build, mod manifest, LLM config, prompt language, memory, conversation log, run summary, gameplay log, decision trace, outcome metric, improvement trend, fallback control, run-count, confidence-interval, signed evidence, row-hash, tests, and r45 methodology docs.
- ece9624: Add warehouse-native LLM eval replay receipts with dbt/warehouse/capture/baseline/judge/drift/no-egress proof, fail-closed CI receipt IDs, Watch severity projection, methodology r101 documentation, and source-review handoff notes.
- ece9624: Add reproducible macOS, Linux, and Windows desktop installer archives generated from the local AMC npm tarball.
- ece9624: Add an enterprise agent evaluation interop public-methodology boundary requiring dataset, test-case, agent registration, endpoint contract, evaluation-run, MCP/tool registry, tool-call trace, result metric, persistence/export, signed-evidence, and row-hash proof before public interop claims.
- ece9624: Add GAGE-style unified evaluation replay receipts with engine/run identity, modality, harness mode, config/registry/dataset/backend/adapter/metric/output contracts, event/sample/summary/artifact/output-dir/environment/dependency/replay hashes, deterministic seed, sample/metric/artifact counts, replay coverage, score thresholds, CI failed-row reporting, fixture-hash binding, and r43 methodology docs.
- ece9624: Close GAP-0626 with a synthetic benign adversarial-regression fixture for privilege-boundary decisioning across Score, Shield, and Watch, plus source-review documentation, focused tests, and a release-gate receipt step.
- ece9624: Add graph-eval judge calibration proof receipts with node-graph, metric-branch, cache, report, model-routing, parser, cost-estimate, signed-evidence, Watch alert, and Shield verification gates.
- ece9624: Add Hermes Turbo-style question-explainability receipts for source-backed performance dashboard claims. Score, Shield, Watch, and docs now require source/license refs, live default-branch commit/tree, benchmark/perf-budget/daily-score workflows, turbo-score script, dashboard, benchmark report, baseline/candidate results, latency/throughput traces, score manifest, CI, thresholds, accepted/rejected evidence, repair hints, and row hashes before low-latency or turbo-score claims can pass.
- ece9624: Add judge calibration receipts with rubric hashes, calibration set hashes, disagreement/error/variance metrics, appeal outcomes, stability-aware checkpoint ranking checks, signed evidence, Watch alerts, Shield verification, and CI/lifecycle fail-closed gates.
- ece9624: Add scenario-simulation action-level replay receipts for benchmark replay corpus rows, including scenario project, action trace, evaluation report, visualization, persistence, checkpoint resume, summary, CI receipt, methodology, and docs coverage.
- 2b4e35f: Complete AMC lifecycle readiness with runtime, lifecycle, import, strategy, release-gate, and ten-persona install QA coverage.
- ece9624: Add Literal AI product-source coverage to the AMC-owned observability Studio evidence drilldown, including product docs source artifact links, Score/Shield/Watch OpenAPI route documentation, Console rendering coverage, fail-closed empty/error-state handling, and a no-copy source review.
- ece9624: Add live score, behavior, and optional data-science lifecycle-stage drift receipts with Score, Watch, and Shield API surfaces.

  Add persona-policy drift fields and alerts so live receipts can detect when realistic task-preserving persona populations collapse to cooperative defaults despite stable score and behavior signatures.

  Add live CTF evaluation controls for event/challenge context, flag acceptance, first-correct-flag forwarding, external-search contamination risk, competition-impact risk, and per-agent independence violations.

  Add partial-credit CTF drift controls for VM/sandbox/rubric context, execution trace coverage, checkpoint completion, partial-credit score, and isolation violations.

  Add survey-backed agent-evaluation dimension drift controls for planning, tool-use, self-reflection, memory, application-domain, generalist, framework, trend, and emergent-direction coverage.

  Add OmniEval-style RAG live drift controls for corpus/chunking context, retriever/generator/framework identity, retrieval top-k, generated-data finalization, model/rule/close-book evaluator mode, hallucination evaluator coverage, and RAG accuracy/completeness/utilization/numerical-accuracy/hallucination metrics.

  Add calculator-agent-style tool-use RL live drift controls for reward, answer verification, judge agreement, tool-call validity, rollout diversity, eval-improvement delta, and model/dataset/reward/verifier/environment/rollout/judge context drift.

  Add paper-trading agent live drift controls for win rate, risk/reward, drawdown, realized PnL, risk-limit violations, claim-validation failures, chart-vision agreement, memory retrieval, provider fallback, and market/strategy/risk/provider/memory/chart/indicator/validation/news/ledger context drift.

  Add GenoTEX-style genomics live drift controls for dataset-selection, preprocessing, and statistical-analysis task stages; reference/prediction/metadata hashes; expert-curation hashes; format conformance; stage metrics; and genomics stage/context drift.

  Add ALERT-style safety red-team live drift controls for unsafe-response rate, compliance, guard score, dataset/taxonomy/attack/guard evidence coverage, and risk-category/attack/subset/guard-label distribution drift.

- ece9624: Add the `freight-3pl-warehouse` industry sector pack under Mobility and expose logistics-contextual operational reliability scoring with `amc score operational-independence <agent> --domain logistics`.
- ece9624: Add metric-validation eval-pack and CI/lifecycle gate artifacts with deterministic row hashes, signed evidence refs, replayable dataset hashes, and fail-closed metric IDs.
- ece9624: Add diagnostic metric validity and reliability tables with construct validity, judge agreement, test-retest stability, confidence intervals, metric owners, lifecycle-aware coverage gates, ranking-stability coverage gates, dynamic tool-sandbox coverage gates, continual-learning coverage gates, strategic-interaction coverage gates, RAG-pipeline coverage gates, business-workflow coverage gates, and fail-closed status.

  Add a data-agent analytical coverage gate so heterogeneous analytical-query benchmark metrics fail closed without task-type, database/source-modality, difficulty, metric-computation, agent-workflow, expert-validation, cost/latency, and submission-schema evidence.

  Clarify RAG-pipeline coverage gates so custom-domain RAG metrics require document/test sets, solution roster/configs, selected metrics, query-level result records, metric-computation traces, report/export artifacts, and performance/cost evidence before they can support external claims.

  Clarify domain-specific legal RAG metric-validity evidence so corpus provenance, jurisdiction/language/task coverage, retriever/reranker configs, model and judge configs, logged samples, and agent-framework evidence are bound before legal RAG benchmark claims are accepted.

  Add an opt-in RAG evaluation-pipeline proof gate so Semantic Kernel-style RAG evaluation metrics fail closed without signed ground-truth question/answer sets, pipeline config, metric definitions, query/retrieval/generation traces, evaluation report, metric owner, sample size, confidence interval, and row-hash-bound eval-pack evidence.

  Add an opt-in architecture-reality proof gate so agent architecture metrics fail closed without signed wrapper-agent, marketing-agent, real-agent, planning, memory, recovery, stress, network, cost, ensemble, statistical-confidence, and row-hash-bound eval-pack evidence.

- ece9624: Add ARIASHA/MiRAGE-style drug-repositioning metric-validity proof. AMC metric-validation rows can now fail closed unless signed evidence binds dataset release, train/test split, drug-disease mapping, drug and disease features, similarity matrices, negative sampling, classifier config, feature selection, score calculation, evaluation report, case-study validation, owner, sample size, confidence interval, and row hashes.
- ece9624: Add Apex-style pentest and threat-model benchmark metric-validity coverage with
  typed proof for manifests, coverage distributions, ground truth, traps,
  security controls, execution/report artifacts, owners, sample size, confidence
  intervals, eval-pack rows, public methodology, and API documentation.
- ece9624: Add provider/model canary drift benchmarking with fail-closed score, refusal, latency, and cost thresholds plus watch alert and waiver outputs.

  Add user-aware agent-quality drift dimensions for progress AUC, progress per turn, pass@k, pass^k, subgoal completion, expected-tool-call coverage, persona coverage, and clustered error-rate analysis so stable headline scores cannot hide multi-turn or user-proxy regressions.

  Add standard evaluator-suite drift dimensions for evaluator coverage, guardrail pass rate, score-threshold pass rate, and retry stability so provider/model promotions fail closed when evaluator-library or pytest-style regression coverage weakens despite a stable headline score.

- ece9624: Publish a public AMC scoring methodology manifest and bind its id, version, hash, benchmark methodology versioning rules, and modality/lifecycle-aware metric-validation gates into diagnostic reports, badges, the CLI, and the config version API.

  Add a persona-policy realism score-claim boundary so cooperative simulator success is not overclaimed as robust, human-like, task-preserving persona evaluation.

  Add a ranking-stability metric-validation gate so checkpoint, model, or candidate rankings cannot be treated as external proof without subsampling-confidence, tail-failure, data-quality, OCR/readability, and ordering evidence.

  Add a live CTF evaluation integrity score-claim boundary so cybersecurity benchmark or flag-solving claims require contamination, competition-impact, first-correct-flag forwarding, and per-agent independence evidence.

  Add a partial-credit CTF validity score-claim boundary so VM challenge or checkpoint-completion claims require environment snapshots, checkpoint rubrics, execution traces, labelling evidence, and isolation context.

  Add a business-workflow metric-validation gate so workflow automation benchmark metrics cannot be treated as external proof without domain/task coverage, simple-baseline evidence, public/private score caveats, toolset/config controls, programmatic end-state assertions, partial-credit and strict pass-rate semantics, export artifacts, and multi-run comparison evidence.

  Clarify the RAG-pipeline metric-validation methodology so custom-domain RAG benchmark claims disclose document/test sets, selected metrics, query-level computation records, solution comparisons, and performance/cost evidence.

  Clarify the RAG-pipeline metric-validation methodology for legal-domain RAG benchmark claims, including corpus provenance, jurisdiction/language/task coverage, retriever/reranker configs, model and judge configs, logged samples, and agent-framework evidence.

  Add an iterative tournament-learning score-claim boundary so leaderboard, tournament, peer-learning, and code-agent strategy-improvement claims require signed tournament protocol, opponent-pool, code-artifact, battle-log/replay, ranking, repeated-validation, uncertainty, learning-delta, access-policy, and contamination-boundary evidence.

  Add a data-agent analytical metric-validation methodology gate so heterogeneous data-agent benchmark claims require task-type, database/source-modality, difficulty, metric-computation, agent-workflow, expert-validation, cost/latency, and submission-schema evidence.

- Ship checksum-verified GitHub release installers for macOS, Linux, and Windows, keep npm and Homebrew availability fail-closed until independently verified, publish desktop archives even without registry credentials, and align the website, Docs, and README to the truthful release channel.
- ece9624: Add question-level score explainability receipts with accepted signed evidence, rejected evidence reasons, missing gates, repair hints, typed routing, red-team benchmark, off-policy optimization evaluation criteria, SkillLens-style rubric lens checks, row hashes, and Score/Shield/Watch/Passport bindings. Add Promptflow-style RAG flow diagnostics for flow DAG, parameter config, eval set, evaluator flow, ground-truth mapping, variant/deployment artifacts, accepted/rejected evidence, and fail-closed repair hints.
- ece9624: Add RedTeam-style adversarial benchmark regression proof to replay-corpus rows,
  including benchmark/question-set/reference-answer/scoring/backend/model/result
  hashes, scoring modes, optional prompt optimization, release-gate binding,
  summary fields, methodology, and documentation coverage.
- ece9624: Add replayable benchmark corpus manifests with fixture hashes, score deltas, optional multi-turn tool-risk attack-success-rate checks, optional code-execution runtime artifact hashes, optional pairwise, paired-modality, interactive-episode, skill-lifecycle, RAG-evaluation, AI-research-task, scientific-evaluation-suite, dynamic tool-sandbox, platform-evaluation, binary-audit, and long-term-memory receipts, Watch alerts, and Shield-verifiable CI receipts.

  Add Arthur Engine-style adversarial regression evidence for continuous-eval trace/annotation ids, evaluator versions, transforms, eval/rerun statuses, criteria/variables/explanation hashes, guardrail rule results, prompt-injection detection, alert-rule query hashes, thresholds, and webhook refs.

  Add Level-Navi-style web-search benchmark replay evidence for dataset/source-link/config hashes, navigation/search/citation traces, result JSONL and metric-report hashes, domain/question-type/source-link coverage, final score, component metrics, and pass rate.

  Add StreamBench-style streaming continuous-improvement replay evidence for source dataset manifests, ordered sequence hashes, agent/benchmark configs, update/prediction/evaluation/sanity traces, result artifacts, online-update gates, improvement deltas, retention, and catastrophic forgetting.

  Add industrial multimodal RAG replay evidence for text/image corpus hashes, PDF and image-extraction traces, image summaries, separate or combined vector-store hashes, multimodal embedding config hashes, baseline and correct-context run hashes, judge model/rubric evidence, modality-specific context and faithfulness metrics, modality coverage, and fail-closed Watch alerts when those artifacts are missing.

  Add BioDSA-style biomedical agent benchmark replay evidence for biomedical task/workflow types, task/dataset/knowledge-base/tool/workflow/model/sandbox hashes, execution and code-execution traces, structured result/report/artifact/evaluator hashes, completion counts, score thresholds, and safe-code-execution gates.

  Add VAKRA-style enterprise multi-hop, multi-source tool-calling replay evidence for local API/database/document/MCP/tool-schema/policy hashes, trajectory replay, tool-call/tool-response/retrieved-evidence traces, output validation, deterministic replay, policy adherence, groundedness, exact tool-response matching, final-answer metrics, and leaderboard/repro metadata.

  Add AgenticVBench-style video post-production replay evidence for task families, media manifests, verifier reward/metric artifacts, agent trajectories, Harbor result summaries, trial logs, executors, sandbox image hashes, oracle/baseline solver hashes, leaderboard or human-review proof, judge modes, task/clip counts, reward thresholds, and fail-closed CI receipts.

- ece9624: Add SkillBench-style adversarial skill regression replay receipts with fail-closed with-skill/baseline agent config, eval-case, deterministic grader, static-analysis, security-scan, rerun, release-gate, score, and decision proof.
- ece9624: Add SRE incident-triage question-explainability receipts with OpenEnv scenario proof, raw log and metric hashes, user reports, action payloads, deterministic grader and feedback hashes, reward/root-cause/red-herring/ordered-remediation thresholds, step bounds, evidence refs, repair hints, Studio drilldown previews, and r41 methodology docs.
- ece9624: Add a Studio evidence drilldown for question-level score findings, including a UI route, API view model, source artifact links, accepted/rejected evidence previews, missing gate reasons, repair hints, and fail-closed empty states.
- ece9624: Add a VLA/world-model replay lane to the replay benchmark corpus with typed
  taxonomy, manifest, trajectory, simulator/reward, policy, replay, seed, count,
  coverage, task-success, score, summary, CI receipt, Watch alert, methodology,
  and documentation coverage.
- ece9624: Add web-operator live-drift receipts with self-report success, independent LLM-evaluation success, self-report overclaim and mismatch rates, task reliability, replay-artifact coverage, task timing, step-limit violations, provider/context drift alerts, row-hash binding, Watch projections, tests, and r44 methodology docs.
- 8812324: Separate diagnostic artifact validity from evidence readiness across CLI, reports, lifecycle artifacts, Studio, report sharing, and executive briefs. Signed or VALID artifacts now fail closed for external claims until accepted evidence reaches READY.
- ece9624: Add a metadata-only Humanloop provider drift wrapper across Score, Shield, and Watch with fail-closed checks for provider version, canary result hashes, drift-statistic hashes, and alert-or-waiver hashes.
- ece9624: Add a metadata-only Inspect provider drift wrapper across Benchmark, Score, Shield, and Watch with fail-closed checks for provider version, canary result hashes, drift-statistic hashes, and alert-or-waiver hashes.
- 604df61: Add MCP Server (`amc mcp serve`) for IDE integration and Agent Transparency Report (`amc transparency report`) for agent SBOM generation. Includes 14 MCP tools exposing scoring, assurance, fleet, and guide capabilities over JSON-RPC stdio transport.
- ece9624: Add a metadata-only Patronus provider drift wrapper across Score, Shield, and Watch with fail-closed checks for provider version, canary result hashes, drift-statistic hashes, and alert-or-waiver hashes.
- ece9624: Add a metadata-only PromptLayer provider/prompt-version drift wrapper across Score, Watch, and Shield APIs, with fail-closed evidence checks for provider versions, canary result hashes, drift-statistic hashes, and alert/waiver hashes.

### Patch Changes

- ece9624: Extend existing Studio, Console, and Watch evidence drilldown receipts for traceable-reasoning source signals so source artifact links, evidence previews, empty/error states, signed evidence, and row hashes are required before Score, Shield, or Watch drilldown claims count.
- ece9624: Add Mastra-style metric-validity methodology boundaries so repository metadata or framework labels remain source signals only while validation tables, confidence intervals, sample sizes, metric owners, signed evidence, no-copy proof, and row hashes fail closed.
- ece9624: Add Lunary-style observability/evaluation metric-validity methodology boundaries so product metadata remains source-signal only while AMC-owned eval packs, validation tables, trace/session exports, thresholds, metric owners, sample sizes, confidence intervals, signed evidence, no-copy proof, and row hashes fail closed.
- ece9624: Add Open Models LangChain4j/Ollama RAG question-explainability receipts with fail-closed source, runtime, RAG evaluation, evidence, repair-hint, CI, no-source-copy, signed-evidence, and row-hash proof fields.
- ece9624: Add GAP-0589 GBQA source-review coverage showing agent-QA benchmark rows map to existing metric-validity receipts without a source-specific AMC subsystem, including metadata-only fail-closed regression tests and docs boundaries.
- ece9624: Add A2A-NT-style agent-to-agent negotiation methodology boundaries, migration triggers, and documentation.
- ece9624: Add AcademiClaw academic-task metric-validity receipts with fail-closed Score/Shield/Watch surfaces, methodology/docs bindings, and eval-pack proof fields.
- ece9624: Fix accessibility regressions flagged in the Batch 5 audit: top-level CLI `--no-color` handling and help text, accessible names for browser playground and generated console chart canvases, generated-dashboard secondary text contrast, published accessibility statement, and OG image asset verification.
- ece9624: Add an accessibility release-evidence generator and runbook for recording Playwright axe run status without overclaiming manual assistive-technology coverage.
- ece9624: Add AD-GEN-style SOC dataset replay receipts, summaries, CI fail-closed fields, and public methodology proof boundaries for ATT&CK-aligned endpoint telemetry benchmark claims.
- ece9624: Add ADK TypeScript runtime live-drift receipts so Watch fails closed on missing runtime, framework, graph, tool-registry, eval dataset/case, runner, session, live-queue, API-route, deployment, metric, signed-evidence, and row-hash proof.
- ece9624: Add an `adversarialAlignmentProbes` assurance/redteam pack with executable deceptive-alignment, reward-model-gaming, and goal-misgeneralization probes, plus regression coverage and catalog discoverability.
- ece9624: Add Agent Belt methodology-versioning assurance receipts for reproducible coding-agent evaluation claims.
- ece9624: Add Agent Bench-style Java coding-agent metric-validity gates so benchmark/source/license, Java task, YAML benchmark, isolated workspace, CLI-agent, cascaded judge, Maven/JUnit/JaCoCo, result, accuracy/pass@k, sample/CI, signed evidence, and row-hash proof fail closed before Java coding-agent benchmark claims are accepted.
- ece9624: Adds agent-eval-harness live-drift receipt fields, thresholds, row hashing, Watch alerts, methodology docs, and tests for signed trace/evidence coverage, tool-success, hallucination, latency, cost, framework, trace-mode, and metric-context drift.
- ece9624: Add fail-closed live-drift proof for agent-evaluation observability rows, including config, telemetry, evidence coverage, metric-set and telemetry distributions, public methodology r133 docs, and source-safe documentation for vladfeigin/llm-agents-evaluation.
- ece9624: Add Agent_Mont-style monitoring replay receipts to the benchmark corpus, including fail-closed evidence checks for monitoring configuration, framework, token/cost/latency/resource/carbon/log/visualization artifacts, summaries, CI receipt fields, public methodology versioning, and documentation.
- ece9624: Add Agent Reading Test-style web-content reading live-drift receipts with source snapshot, license, homepage, answer key, task manifest, score form, live-site, raw content, canary, alert, signed evidence, and row-hash proof.
- ece9624: Add agent-security control live-drift receipts for Watch and Shield.

  Live drift rows can now bind guard identity, policy hashes, taint/proxy/audit/telemetry/eval-pack/classifier proof, origin and taint coverage, policy-decision accuracy, secret-scrub rate, audit integrity, attack-effectiveness rate, false-positive rate, guard latency, signed evidence, and row hashes. Missing or degraded agent-security evidence fails closed through score drift, behavior drift, Watch alerts, Shield verification, and public methodology r68.

- ece9624: Add agent-testing methodology live-drift receipts for Watch and Shield. Live rows can now carry testing taxonomy, methodology, scenario, fault-injection, observability, safety, standards, category, approach, fault-model, benchmark-family, coverage, resilience, safety-regression, and observability-signal evidence so AMC fails closed when live traffic drifts away from the declared testing methodology despite stable generic scores.
- ece9624: Add Agent Workflow Kit-style workflow replay receipts with fail-closed source, policy, approval, verification, docs-check, replay, threshold, CI receipt, methodology, and documentation coverage.
- ece9624: Adds AgentBench-style config-pinned replay receipts to benchmark corpus runs so source, repository, dataset, agent/global/model-server/environment/dependency, run/replay command, trace, result, metric, seed, sample, shuffle, replay-pass, trace-coverage, signed-evidence, and row-hash proof fail closed.
- ece9624: Add AgentDefense-Bench provider-drift receipts with source/MCP/security-defense proof, fail-closed Watch/CI alerts, public methodology r200 binding, and docs for the live verified source boundary.
- ece9624: Add Agentic Graph RAG metric-validity receipts with fail-closed source/no-license, graph/RAG, vector-store, evaluation, experiment-tracking, UI-question, dependency-lock, owner, confidence-interval, signed-evidence, artifact-hash, and row-hash proof.
- ece9624: Add AgentKernelArena-style GPU-kernel replay receipts with task/config, agent roster, workspace isolation, GPU profile, compile/correctness/performance proof, speedup delta, replay/result coverage, CI receipt, signed evidence, and row-hash gates.
- ece9624: Add AgentTrial-style statistical question-explainability receipts with repeated trial counts, Wilson confidence intervals, bootstrap cost/latency, failure attribution, regression comparison, CI proof, reliability score, and row-hash gates.
- ece9624: Add an AgenTRIM-backed diagnostic question for per-step least-privilege tool access with status-aware validation evidence gates.
- ece9624: Add AgentStock-style future-outcome ranking proof to judge calibration receipts, including source snapshot, leaderboard, PnL, appeal, replay, signed-evidence, and Watch fail-closed gates.
- ece9624: Add AI-agent benchmark comparison replay proof to the benchmark corpus receipt so source, repository, license, agent roster, benchmark dataset, source/pricing/user-report/leaderboard/score manifests, eval-pack, fixture, replay, result, score-delta report, CI receipt, coverage metrics, signed evidence, and row hashes fail closed before comparison claims are accepted.
- ece9624: Add AI-coding landscape question-explainability lenses. Question receipts can now bind source category, dataset refs and SHA-256 hashes, update cadence, freshness, cohort refs, benchmark/tool/model refs, accepted evidence, rejected-evidence reasons, and repair hints into row hashes, fail-closed status, Studio evidence drilldown, and public methodology r36.
- ece9624: Add Awesome AI Evaluation Guide public-methodology receipts with source/license, default branch, guide manifests, benchmark/tool taxonomies, metric-selection, threshold, calibration, trace, human-review, cost-control, deprecation, migration, signed evidence, and row-hash proof.
- ece9624: Add AI Reputation Claude live-drift receipts with source/no-license, agent roster, skill catalog, review-source, sentiment, competitor, response-policy, crisis, report, baseline/live result, drift statistic, alert receipt, brand-safety metric, signed-evidence, and row-hash proof.
- ece9624: Add an AICrypto-style cryptography benchmark methodology boundary.

  Public cryptography capability claims now require methodology-versioned proof for paper/dataset versions, MCQ/CTF/proof task families, expert baselines, sandbox/toolchain evidence, proof rubrics, scoring formulas, thresholds, signed evidence, and row hashes before AMC reports or badges can use those claims as external evidence.

- ece9624: Add alignment feedback-source validation scoring and a diagnostic question for evaluator source quality, bias, collusion, and signed feedback provenance.
- ece9624: Expose alignment-index subcategory breakdowns for goal misgeneralization, reward hacking, deceptive alignment, feedback source validation, sycophancy, and sabotage.
- ece9624: Add `amc api key create`, `amc api key list`, and `amc api key revoke` for local programmatic API key management. Keys are displayed only once on creation; the persisted store keeps hashed secret material and public metadata under `.amc/auth/api-keys.json`.
- ece9624: Document API rate-limit headers, org SSE reconnect behavior, and webhook retry boundaries; add org SSE event IDs and a 15-second reconnect hint.
- ece9624: Add Arize Phoenix/AX-style observability and evaluation metric-validity boundaries to public methodology so Score, Shield, and Watch claims require primary-source retrieval refs, trace/span exports, evaluator configs, dataset and experiment manifests, monitoring/alert proof, signed evidence, thresholds, and row hashes; product/docs metadata remains source-signal only.
- ece9624: Document signed assurance certificate issuance, verification, and policy threshold tuning.
- ece9624: Add `amc assurance run --demo --no-sign` and make single-pack no-sign runs vault-less.
- ece9624: Add regression coverage for Assurance Lab pack-authoring docs so community packs document `index.mjs` as the scaffolded entry point and `index.js` only as legacy fallback.
- ece9624: Add a remediation-priority section to text assurance runs so failed scenarios are ordered by severity with reason, fix hint, evidence path, and verbose rerun command.
- ece9624: Add built-CLI coverage for `assurance run --all --no-sign` and align the UX audit with the current unsigned assurance behavior.
- ece9624: Add Awesome-Agent-Memory-style memory-catalog live-drift receipts with source snapshot, no-license boundary, README blob, taxonomy, benchmark/eval, drift statistic, alert, signed evidence, and row-hash proof.
- ece9624: Clarify that Awesome AI Pentest-style curated source indexes are discovery metadata only: Score/Shield/Watch pentest metric-validity claims must use the existing `pentest_benchmark_coverage` receipts for underlying benchmark manifests, execution/scoring artifacts, CI proof, signed evidence, and row hashes.
- ece9624: Add Azure Agent Lab replay-corpus receipts with lab/module identity, workshop and notebook hashes, Azure service/project/search/RAG/tool/evaluator configs, cloud-run and identity proof, replay command hashes, deterministic seeds, scenario counts, evaluation scores, groundedness thresholds, CI failed-row ids, Watch alerts, and public methodology/docs coverage.
- ece9624: Add BackdoorAgent-style stage-aware backdoor live-drift receipts so attack success, clean accuracy, trigger persistence, trigger propagation, trajectory coverage, evidence coverage, stage/task/attack-family drift, signed evidence, and row hashes fail closed.
- ece9624: Add a Batch 5 audit consistency regression so persona table scores, section headings, and rating lines stay aligned after follow-up fixes.
- ece9624: Add BenchLoop-style local benchmark replay receipts with fail-closed suite, harness, provider, hardware, run, trace, latency, token, export, and metric evidence bindings.
- ece9624: Add benchmark-hackability audit replay receipts for replay benchmark corpora.

  Replay rows can now bind scanner identity, target benchmark/task manifests, audit configs, phase traces, static-tool reports, AI-inspection traces, vulnerability finding manifests, dashboard/report artifacts, replay commands, sandbox controls, PoC validation, vulnerability-class coverage, task-count coverage, exploitability thresholds, signed evidence, and row hashes. Missing benchmark-hackability evidence fails closed through the manifest, CI receipt, Shield verification, Watch alerts, and public methodology r67.

- ece9624: Add benchmark-submission question explainability receipts with task status, criterion scoring, leaderboard metric views, replay hashes, fail-closed validation, drilldown previews, guide remediation hints, and public methodology r65.
- ece9624: Add BestTester replay-corpus receipts for QA-agent benchmark evidence. AMC now validates source/license snapshots, package and lockfile refs, Playwright and TypeScript proof, test/agent/MCP/security/workflow artifacts, LLM-judge agreement, security coverage, CI coverage, signed evidence, and row hashes before BestTester-style claims can pass Score, Shield, or Watch gates.
- ece9624: Add BioAgentBench-style bioinformatics agent metric-validity proof for Score/Shield rows. AMC now requires signed benchmark/source, task, input dataset, truth/reference, workflow reproduction, Docker/environment, tool-version, harness, grader, result artifact, perturbation, privacy-boundary, owner, sample-size, confidence-interval, and row-hash evidence before bioinformatics workflow claims can be used externally.
- ece9624: Add BioKGBench-style biomedical KG replay receipts so source, repository, paper, license, dataset release, knowledge graph, KGCheck/KGQA/SCV task manifests, agent/RAG/Neo4j configs, evaluation scripts, result manifests, error-discovery reports, replay commands, CI receipts, deterministic seeds, metrics, thresholds, signed evidence, and row hashes fail closed before public biomedical KG benchmark claims.
- ece9624: Add BioMedArena-style biomedical harness replay receipts with source, harness, benchmark-family, tool-mode, adapter/tool/vendor, baseline, result, replay, CI, coverage, sandbox, and row-hash proof.
- ece9624: Add metadata-only Bisheng observability live-drift receipts across Score, Shield, and Watch using existing live-drift/watch/score primitives with fail-closed checks for baseline distribution, live sample, drift statistic, alert receipt, source metadata, signed evidence, and no-copy proof.
- ece9624: Add a board-facing L3 business-risk memo and link it from executive surfaces without over-approving production use.
- ece9624: Add Braintrust-style live drift evidence gating on the existing AMC Watch live-drift path.
- ece9624: Add `amc business fair-scenario` to run a deterministic FAIR-style scenario loss distribution with explicit frequency and loss-magnitude calibration ranges, maturity-adjusted exposure, P10/P50/P90/P95 outputs, and risk-appetite status without claiming certified Open FAIR or native GRC sync.
- ece9624: Add `amc business grc-export` to turn portfolio maturity-risk inputs into CSV, JSON, or Markdown GRC treatment-plan exports with owner, due-date, risk appetite, ISO 31000 context, and FAIR-style loss-frequency/loss-magnitude fields.
- ece9624: Add `amc business heatmap` for portfolio-level monetary risk heatmaps across agents, business units, residual expected annual loss, and risk-appetite breaches.
- ece9624: Add `amc business risk` to estimate residual incident frequency, expected annual loss, expected loss reduction, and risk-appetite status from agent maturity.
- ece9624: Add `amc business roi` for cost-of-trust-gap ROI estimates backed by the maturity-linked expected annual loss model.
- ece9624: Link buyer packages prominently from the homepage pricing section for procurement workflows.
- ece9624: Add Calibra-style public-methodology receipts with campaign matrix, task, report, dashboard, changelog, migration, and row-hash proof.
- ece9624: Add ForesightSafety catastrophic-risk scoring for self-replication, resource acquisition, shutdown resistance, persistence, goal-preservation pressure, and cross-system propagation.
- ece9624: Add cc-plugin-eval-style metric-validity proof fields, fail-closed thresholds, public methodology boundaries, and documentation for component-trigger reliability evidence.
- ece9624: Add `amc cert generate --no-sign` / `--preview` for unsigned trust-certificate previews that work without vault signing, are labeled `UNSIGNED_PREVIEW`, and are intentionally rejected by verifier logic until regenerated as signed certificates.
- ece9624: Add chaos-reliability live-drift receipts for Watch and Shield. Live rows can now carry benchmark, scenario, chaos profile, injection, mutation, endpoint contract, judge, trace bundle, score ledger, agent-card, improvement-eval, framework, modality, benchmark-family, production-reliability, resilience, chaos-drop, recovery, and failure-trace evidence so AMC fails closed when live agents drift under failure-injection pressure despite stable generic scores.
- ece9624: Add ChemGraph DOI/OpenAlex source-review metric-validity boundaries for Score, Shield, and Watch using existing validation-table, sample-size, confidence-interval, metric-owner, signed-evidence, and no-copy public-methodology primitives.
- ece9624: Add ChipBenchmark-style hardware benchmark metric-validity receipts across Score, Shield, Watch, public methodology, and docs. AMC now fails closed unless ChipBenchmark claims bind source snapshot, no-license boundary, benchmark/hardware/model/precision manifests, environment and runner/serving scripts, result/frontend/pricing datasets, throughput/latency/cost metrics, regression thresholds, owners, confidence intervals, signed evidence, and row hashes.
- ece9624: Add `amc ci init --no-sign` and `amc gate --no-sign` for explicit unsigned CI setup.
- ece9624: Ensure `npm test` builds the CLI before Vitest so clean CI checkouts can run CLI-focused tests that execute `dist/cli.js`.
- ece9624: Document provider-specific signed CI secret setup for GitHub Actions, GitLab CI/CD, and CircleCI.
- ece9624: Add `amc ci redteam`, a fail-closed CI regression gate for red-team plugin scores, vulnerability thresholds, optional Evil MCP scenarios, and score-gaming resistance checks with JSON output.
- ece9624: Add citable BibTeX metadata to the AMC whitepaper and RFC while replacing unsupported arXiv-preprint claims with explicit repository-preprint status.
- ece9624: Add ClawEnvKit-style environment-generation replay-corpus receipts with generated task YAML, task schema, generation prompt, fixture manifest, mock service catalog/state, audit logs, trajectories, verification/scoring/safety configs, harness tier/id, adapter and MCP/skill-shell config proof, Docker or agent-loop evidence, replay commands, deterministic seeds, service/task/check counts, component scores, final score, safety gate evidence, CI failed-row ids, Watch alerts, and public methodology/docs coverage.
- ece9624: Add CL-Bench-style continual-learning question explainability proof for stateful workflow claims, including replayable dataset/state/mutation/conversation/entity/tool/evaluator/result hashes, metric thresholds, drilldown previews, fail-closed guards, methodology r135, docs, and legal source-boundary disclosure.
- ece9624: Add CloneMem-style long-term-memory replay receipts with digital-trace, persona, question, evidence, bilingual, task-category, replay, score-delta, and fail-closed CI proof.
- ece9624: Document AWS, GCP, and Azure self-hosted cloud reference architectures and add an OpenAPI `https://{host}/api` server template.
- ece9624: Add CodeQuest-style quality question-explainability receipts for source-backed evaluator/optimizer code-quality claims with dimension deltas, feedback/grounding coverage, replay/CI proof, and no-source-copy evidence boundaries.
- ece9624: Adds CoderCup metric-validity receipts for continuous public coding-agent benchmark claims, binding source/license/homepage, branch snapshots, README/contributing, CI, package locks, task specs, test suites, runner contracts, score ledgers, live artifacts, methodology/reference pages, cost accounting, reliability, confidence intervals, signed evidence, artifact hashes, and row hashes.
- ece9624: Add comparative coding-agent report replay receipts for replay benchmark corpora.

  Replay rows can now bind report/source identity, source-material proof, standardized prompt hash, agent roster, scoring rubric, category scores, implementation artifacts, screenshot manifests, report artifacts, replay commands, reviewer/test evidence, agent/category coverage, recommendation use cases, normalized score thresholds, signed evidence, and row hashes. Missing comparative-report evidence fails closed through the manifest, CI receipt, Shield verification, Watch alerts, and public methodology r66.

- ece9624: Close GAP-0634 by binding cognitive-retrieval preprint metadata to existing eval-score explainability receipts, guide evidence requirements, and passport summaries without adding a cognitive retrieval subsystem or copying paper prose/data.
- ece9624: Reconcile public CLI command-count and npm metadata drift by regenerating the command inventory from the compiled CLI registry, updating API/reference/pricing surfaces to 1,132 public command paths, and adding regression coverage for command-count and package keyword claims.
- ece9624: Add a community demo kit with a GitHub-shareable terminal SVG, a concise Why AMC one-pager, and DevRel-ready demo script/copy blocks for five-minute AMC walkthroughs.
- ece9624: Surface community pack registry review gates before upload and document moderation rejection criteria.
- ece9624: Document `amc compare --badge` in public onboarding docs and make the two-run comparison path write the comparison SVG badge instead of silently ignoring the flag.
- ece9624: Add an export-ready legal-review appendix with framework-specific notes to Markdown compliance reports.
- ece9624: Shorten Markdown compliance report evidence refs and add config remediation guidance.
- ece9624: Add status definitions and per-evidence JSON drill-down hints to Markdown compliance reports.
- ece9624: Add an interactive framework picker for `amc comply report` while preserving non-interactive framework listing and usage output.
- ece9624: Document and regression-test the `amc comply risk-classify` EU AI Act risk-tier command surface.
- ece9624: Add demo Console API Quickstart examples with auth headers, curl snippets, and response shapes.
- ece9624: Add CooperBench metric-validity receipts with source/no-license, release, branch, dataset/task, feature-conflict, runner, eval-backend, team-harness, agent-adapter, CI, package-lock, public-report, owner, sample-size, signed-evidence, artifact-hash, and row-hash proof.
- ece9624: Add CostNav-style physical navigation replay proof binding for benchmark corpus rows, including source/repository/license refs, benchmark spec, scenario manifest, route graph, economic-cost model, simulator and trajectory evidence, CI receipts, route/scenario coverage, navigation success, replay pass rate, economic-cost deltas, score deltas, methodology r134 docs, and fail-closed tests.
- ece9624: Add CPU-centric agentic workload live-drift receipts with workload/runtime/schedule context, latency, throughput, utilization, memory, bottleneck-share, evidence-coverage, row-hash, Watch alert, and public methodology bindings.
- ece9624: Add Credence Engine-style live-drift receipts for Score, Shield, and Watch. Rows now bind source/license/archive proof, README/SPEC/package/lock/results artifacts, experiment and benchmark harness refs, test-suite proof, posterior/VOI/expected-utility policies, baseline/live results, drift statistics, alert receipts, signed evidence, and row hashes before Bayesian decision benchmark drift claims can be used externally.
- ece9624: Add Critic Rubrics methodology assurance to the public scoring methodology so rubric-supervised critic, sparse-outcome, type-safe function-calling judge, reranking, and early-stopping claims require source snapshots, no-license boundaries, arXiv/release refs, signed evidence, and row hashes.
- ece9624: Add FishCodeTech CTF-agent benchmark live-drift receipts with source snapshot, GPL license, challenge/Docker/MCP/sidecar/scoreboard, flag-log, solve, first-flag, contamination, independence, partial-credit, trace, sandbox, signed evidence, and row-hash proof.
- ece9624: Add a custom adapter authoring guide covering declarative plugin adapters, SDK wrapper adapters, evidence semantics, and validation checks, with links from the adapter documentation.
- ece9624: Add Darwin Godel Machine-style live-drift receipts for self-improving coding-agent score movement. The Watch adapter now requires source snapshot, no-license boundary, README/security/CI, controller/archive/self-modification/evaluation/scorer/sandbox/live-run/benchmark/lineage proof, baseline/live result hashes, drift statistics, alert receipts, signed evidence, and row hashes before DGM-style claims can be used externally.
- ece9624: Add generated-dashboard high-contrast theme controls and onboarding modal focus trapping with regression coverage.
- ece9624: Add board-ready trend, drill-down, evidence, and next-action panels to the first-run dashboard overview.
- ece9624: Add generated-dashboard question heatmap text alternatives, ARIA grid semantics, confidence meters, and regression coverage.
- ece9624: Harden `amc dashboard open` browser launching with argument-based spawning and add `--no-open` for headless runs.
- ece9624: Embed styled trust delegation topology and review actions in dashboard builds.
- ece9624: Add DB context enrichment replay receipts to benchmark corpus manifests, CI receipts, methodology, and API/benchmark docs.
- ece9624: Add Decibench voice live-drift receipts with fail-closed source, license-boundary, CLI, MCP, RAG, evaluator, audio, scenario, no-transcript-copy, Watch alert, row-hash, and public methodology evidence.
- ece9624: Add GAP-0625 DeepEval-style question score explainability receipts through existing Score, Shield, Watch, guide, and passport primitives without adding a DeepEval subsystem or copying upstream content.
- ece9624: Add DeepMath-style math-agent replay receipts so sandbox, executor, GRPO, vLLM, dataset, output, metric, replay, signed-evidence, and row-hash proof fail closed.
- ece9624: Add DeepResearch-style progressive-search replay receipts to the replay corpus, including workflow/context/search/tool/cross-evaluation/report proof, fail-closed validation, CI receipt fields, Watch alerts, methodology docs, and source-treatment documentation.
- ece9624: Add `amc demo run --no-vault` / `--demo` so first-time users and sales engineers can run the live gateway demo without preparing or unlocking the current workspace vault. The no-vault path uses an ephemeral demo workspace and labels output `DEMO_ONLY` so it is not confused with production audit evidence.
- ece9624: Add agent-scoped diagnostic run aliases. Users can now name a run with `amc run-alias set <alias> <runId|prefix|latest>`, resolve reports with `amc report <alias>`, and see saved aliases in `amc history`.
- ece9624: Add Digital materials ecosystem DOI/OpenAlex source-review metric-validity boundaries requiring validation tables, metric owners, sample sizes, confidence intervals, signed evidence, row hashes, and no-copy proof through existing AMC primitives.
- ece9624: Add `amc dlp scan` and `amc vault dlp scan` CLI surfaces, expand DLP detection with validated IBANs, IP addresses, EU VAT IDs, keyword-bound EU national IDs, passport numbers, and health-record identifiers, and document the source-backed GDPR/IBAN basis.
- ece9624: Replace unverified GHCR quickstart image install commands with local Docker build/run instructions and document the GHCR visibility verification boundary.
- ece9624: Add DocThinker-style document and multimodal RAG memory replay receipts with fail-closed source, carrier, router, KG, memory, observability, metric, replay, CI, and methodology evidence.
- ece9624: Add document-to-dataset live drift receipts and Watch alerts for corpus/index/document/page/cell evidence, generated QA/Summary/RAG samples, exports, numeric integrity, quality metrics, token savings, throughput, memory, and task/source-format/export/pipeline context drift.
- ece9624: Expose supply-chain and logistics domain aliases in the domain registry, CLI help/listing, persona docs, and sector-pack docs so operations users can route `supply-chain` to `environment` and `logistics`/`freight`/`3pl`/`warehouse` to `mobility`.
- ece9624: Add persistent DSAR CLI workflow for `amc vault dsar submit/status/list/complete`, including file-backed request storage, subject-hashed JSONL audit events, legacy `dsar-status` counters, documentation, and focused regression tests.
- ece9624: Add EARBench-style physical-risk-awareness public methodology versioning boundaries.
- ece9624: Add EDD-style RAG strategy proof to live score and behavior drift receipts. Rows can now bind recursive document-agent versus metadata-replacement strategy comparisons to strategy, index, query-set, reference-answer, evaluator, model, and result hashes, with fail-closed Watch alerts for missing strategy proof or strategy-mix drift.
- ece9624: Add edge AI agent replay proof for on-device multimodal-agent benchmark claims.

  AMC now fails closed unless edge AI agent replay rows bind source, repository,
  license, device profile, runtime, optimization, dataset, task, application
  scenario, replay, metric, threshold, signed-evidence, and row-hash proof before
  using mobile, embedded, wearable, IoT, offline, privacy, latency, memory, energy,
  accuracy, replay pass-rate, or score-delta claims as external evidence.

- ece9624: Add effect-autoagent replay-corpus receipts with fail-closed signed evidence, fixed-seed replay manifests, CI receipts, and public methodology bindings.
- ece9624: Add embodied-agent metric-validation gates that fail closed unless simulator benchmark metrics bind task-type coverage, simulator config, scene/dataset package, random/human/model baselines, action-observation trajectories, result folders, overall/per-task metric reports, metric owner, sample size, confidence intervals, and signed evidence refs.
- ece9624: Add Encourage-style modular RAG replay-corpus receipts with fail-closed source, package, method, inference-runner, template, vector DB, metric-suite, MLflow, replay, and CI evidence gates.
- ece9624: Add eval-ai-library question-explainability receipts for question-level metric result, score breakdown, accepted/rejected evidence, repair hint, regression threshold, CI, signed evidence, and no-source-copy proof.
- ece9624: Add 12-technique evaluator live-drift receipts with signed evidence coverage, metric drops, technique/context drift alerts, public methodology r56 docs, and source-use posture for FareedKhan-dev/ai-agents-eval-techniques.
- ece9624: Add Tribunal-style evaluator-suite metric validity proof with deterministic assertion, LLM judge, safety/red-team, dataset eval, custom judge, reporter, framework, threshold, owner, sample-size, and confidence-interval evidence that is row-hashed and fail-closed.
- ece9624: Fix invalid evidence-ingest command references across score output, REPL routing, dashboard actions, and chain documentation.
- ece9624: Add a one-command first-run evidence capture path with dry-run preview and unsigned starter capture.
- ece9624: Add Evidra provider-drift receipts with source/protocol/evidence-chain proof, fail-closed Watch/API/CI alerts, public methodology r208 binding, and docs for the live verified source boundary.
- ece9624: Add a dedicated executive board-brief website page, link it from the homepage, refresh executive overview counts/pricing, and add regression coverage for the board-facing path and stale executive claims.
- ece9624: Add `amc executive brief` to generate a print-ready board one-pager from a diagnostic run without requiring certificate signing.
- 35f5658: Expand the AMC research landscape generator and verifier to require 1,500 GitHub repositories and 5,000 source-linked prioritized improvement gaps.
- ece9624: Add ExploitGym-style exploit-development metric-validity proof to pentest benchmark checks, requiring source/license, release, task, target-image, controller, firewall, proxy, execution, success-metric, owner, confidence-interval, signed evidence, and row-hash receipts before security-agent benchmark claims pass.
- ece9624: Add a public external-source verification policy to the scoring methodology.

  The methodology manifest now states that live or primary-source verification is required for external claims, repository metadata and cached snippets are rejected as parity proof, unavailable sources must be disclosed, and third-party code, commands, prompts, datasets, examples, UI text/assets, README prose, screenshots, benchmark rows, configuration, and implementation details must not be copied without separate license review. Public methodology r70 renders the policy and includes migration guidance for stale or unavailable source-backed claims.

- ece9624: Add GAP-0620 public-methodology boundaries for DOI/OpenAlex-verified fact-checking and factuality-evaluation review claims across Score, Shield, Watch, and badge methodology assurance.
- ece9624: Add Falcon Evaluate provider-drift receipts with fail-closed source, metric-family, provider-route, canary-result, Watch alert, eval-pack row-hash, and public methodology evidence.
- ece9624: Add FIRE-style atomic-claim fact-checking replay receipts with fail-closed source,
  paper, dataset, retrieval, verification, cost, replay, CI, and threshold proof.
- ece9624: Add `amc fleet overview` for executive fleet verdict, coverage, drift, weakest agents, and next actions.
- ece9624: Add `amc fleet trust-graph` with Mermaid, DOT, and JSON visualization of delegation trust edges.
- ece9624: Make `amc fleet trust-report --no-sign` generate an explicit unsigned trust composition report when setup or signing prerequisites are unavailable, and align the UX audit text with the current behavior.
- ece9624: Add fore public methodology versioning receipts to the public methodology manifest, docs, API surface, and benchmark source-boundary notes.
- ece9624: Add FreshStack-style IR/RAG retrieval replay receipts so repository, paper, query/corpus datasets, StackOverflow query and GitHub corpus manifests, licenses, BEIR/qrels, chunking, retriever, index, runfile, evaluator, metrics, leaderboard, replay command, alpha-nDCG, coverage, recall, signed evidence, and row hashes fail closed.
- ece9624: Add GAIA-agent replay-corpus receipts with source-linked benchmark harness proof, fixed seeds, tool-trace coverage, score-delta summaries, CI receipt fields, and public methodology/docs bindings.
- ece9624: Add Galileo-style observability/evaluation provider-drift receipt fields to the existing provider drift benchmark path so provider route, canary result, drift statistic, alert/waiver, signed evidence bundle, and no-copy/source-review proof fail closed without adding a standalone Galileo subsystem.
- ece9624: Fail closed on metadata-only metric-validation eval packs and document GAP-0591 source relevance.

  Metric validation now treats a non-replayable eval pack as a CI/lifecycle gate failure when row evidence refs are not fully backed by signed evidence refs. The source review maps comparative RAG/agent framework benchmarks onto existing validation-facet, confounder-control, outcome-alignment, process-evidence, safety-utility, and lifecycle-observability primitives without adding source-specific public API fields.

- ece9624: Extend guide and passport question-score explainability summaries for autonomous-agent literature source signals so question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, statuses, and row hashes remain visible without copying paper content.
- ece9624: Add GAP-0623 metadata-verified narrow-task broad-misalignment live drift receipts using existing Watch drift primitives.
- ece9624: Close GAP-0652 with a fail-closed DOI/OpenAlex source review for the future-communications large-AI-models survey, documenting metadata hashes and non-implementation boundaries without adding a communications-domain subsystem, importer, or benchmark mirror.
- ece9624: Close GAP-0656 as a relevance-gated question-score explainability source review, documenting live DOI/OpenAlex/Crossref metadata and adding fail-closed regression coverage without adding healthcare ontology or federated-learning product code.
- ece9624: Close AMC source-review GAP-0657 with a relevance-gated Score/Shield/Watch question-level explainability boundary for the Meta-Thinking via MARL survey, documenting live DOI/OpenAlex metadata hashes and adding regression coverage over existing question-score, multi-user benchmark, and eval-pack primitives without adding a meta-thinking/MARL subsystem, importer, benchmark mirror, or parity layer.
- ece9624: Close GAP-0658 with a relevance-gated generative-agents live-drift source-review boundary, using existing Watch live score/behavior drift receipt primitives without adding a simulator, importer, parity layer, or copied paper content.
- ece9624: Add GaRAGe RAG-grounding live-drift receipts with fail-closed source, dataset, annotation-schema, baseline/live, alert, signed-evidence, and row-hash proof.
- ece9624: Add the GDPR Article 5(2) accountability mapping to built-in compliance mappings and cross-framework GDPR coverage.
- ece9624: Add GeoBenchX-style geospatial tool-calling proof to provider/model drift canaries.

  Provider-drift rows can now bind geospatial benchmark ids, task-set hashes, dataset snapshots, tool registries, reference solutions, trace exports, judge panels/configs, human calibration, result reports, token-cost reports, complexity groups, solvable/unsolvable task counts, tool counts, and max tool iterations. Missing geospatial proof emits a fail-closed Watch/API alert and is included in eval-pack row hashes, CI/lifecycle gates, public methodology, and docs.

- ece9624: Add Google ADK-style agent-toolkit evaluation metric-validity boundaries.

  AMC now treats live `google/adk-python` GitHub metadata as a source-review signal only: Score, Shield, and Watch metric-validity claims require an AMC-owned eval pack, validation table, evaluator-suite proof through existing primitives, trace-evaluation proof where traces or Watch are claimed, fail-closed thresholds, metric owner, sample size, confidence interval, signed evidence, artifact hashes, row hashes, and no-copy/source-review proof. No Google ADK subsystem, adapter, importer, parity layer, or upstream code/prose/config is added.

- ece9624: Add GTO Wizard-style poker-agent replay corpus proof with API-scope, no-solver policy, hand-history, legal-action trace, AIVAT metric, replay command, CI receipt, summary, and fail-closed evidence gates.
- ece9624: Add GuardBench-style guardrail metric-validity gates so dataset/access/format proof, moderation contracts, guardrail model and threshold configs, prediction scores, metric-suite and confusion-matrix reports, language coverage, export reports, owners, confidence intervals, signed evidence, and row hashes fail closed.
- ece9624: Add fail-closed HedraRAG artifact-eval live-drift proof with latency, throughput, memory, replay, evidence coverage, workflow/framework/runtime distributions, public methodology r138 docs, and source-safe documentation for Leo9660/HedraRAG_AE.
- ece9624: Add Hermes Bench-style local LLM/agent benchmark metric-validity receipts across Score, Shield, Watch, public methodology, and docs. AMC now fails closed unless Hermes Bench claims bind source/license refs, default-branch snapshots, README/build specs, backend runners, judge calibration, task registries, model/server configs, adapter coverage, result schemas, frontend review surfaces, backend/frontend regressions, Docker runtimes, owners, confidence intervals, signed evidence, artifact hashes, and row hashes.
- ece9624: Add HeurekaBench scientific co-scientist replay receipts to the public methodology manifest, API docs, benchmark boundaries, and source-review notes.
- ece9624: Document HoneyHive source-review relevance and add generic eval replay corpus evidence/diagnostic receipts for Score, Shield, and Watch fail-closed checks.
- ece9624: Add HumanStudy-Bench-style participant-simulation metric-validity receipts with fail-closed source, study, response, evaluator, reliability, validation-pipeline, CI, owner, confidence-interval, signed-evidence, and row-hash proof.
- ece9624: Add product-specific L3 examples for common agent archetypes in `amc improve`.
- ece9624: Explain L3 in product language in `amc improve` and add product outcomes to roadmap items.
- ece9624: Let `amc score industry-adjust` reuse the latest scored run when `--score` is omitted.
- ece9624: Add `amc score industry-adjust --drilldown` for per-dimension industry weighting inspection, with matching `--json --drilldown` rows for automation.
- ece9624: Explain raw versus adjusted score differences in `score industry-adjust` output.
- ece9624: Add exportable industry-adjusted history reports across scored runs.
- ece9624: Add InferenceBench-style inference optimization metric-validity proof. AMC now fails closed unless benchmark-backed inference-serving optimization claims bind scenario objectives, hardware budgets, server contracts, runtime backends, search spaces, baseline comparisons, quality/integrity gates, supervised relaunches, latency/throughput/tail metrics, exploration traces, owners, confidence intervals, signed evidence, and row hashes.
- ece9624: Add InnovatorBench-style research replay receipts for source-backed LLM research-agent benchmarks with ResearchGym, tool, environment, checkpoint, score, replay, CI, and no-shortcut evidence boundaries.
- ece9624: Add Adsum IoT Coder-style IoT firmware question-explainability proof so Score, Shield, Watch, and API drilldowns fail closed unless firmware task claims bind platform, board/chip, hardware session, device logs, build/flash/test artifacts, privacy boundary, benchmark report, metric thresholds, accepted evidence, rejected reasons, repair hints, and row hashes.
- ece9624: Add JudgeIt-style LLM-as-judge replay receipts so dataset/golden/generated manifests, pipeline and judge configs, human-eval references, batch/export/metric/replay artifacts, precision/recall/F1, false-negative, blackbox/whitebox/negative-test metrics, signed evidence, and row hashes fail closed.
- ece9624: Add Kubernetes operational-agent metric-validity receipts with source/license, release, build workflow, agent module, MCP server, tool inventory, diagnostics, resource/log-analysis, CI, owner, confidence interval, artifact hash, and row-hash proof.
- ece9624: Add KITE-style end-to-end RAG live-drift evidence fields, coverage gates, alerts, and methodology docs so corpus/query/rubric/judge/grade drift fails closed with signed receipts.
- ece9624: Add Knowlytics-AI-style MCQ/RAG replay-corpus receipts with source/no-license, owned fixture, trace, feedback, CI, and row-hash proof.
- ece9624: Add a Kubernetes/Helm deployment guide and Terraform Helm-release example covering bootstrap secrets, probes, rollback, and raw Kustomize manifests.
- ece9624: Extend AMC evidence drilldown handling for Langfuse-style source signals using existing Studio, Console, and Watch primitives for UI routes, source artifact links, previews, and empty/error states without adding a Langfuse subsystem.
- ece9624: Add LangSmith-style observability/evaluation metric-validity boundaries to public methodology so Score, Shield, and Watch claims require AMC-owned validation tables, metric owners, sample sizes, confidence intervals, signed evidence, thresholds, and row hashes; product-page metadata remains source-signal only.
- ece9624: Add Legacy-Bench-style legacy-software metric-validity receipts so source/license, default-branch snapshots, README and task-corpus manifests, legacy-language coverage, environments, harness runners, agent tasks, patch submissions, test oracles, evaluator registries, CI, result artifacts, replay commands, owners, confidence intervals, signed evidence, and row hashes fail closed.
- ece9624: Add LegalAgentBench-style legal-agent live drift receipts with final-success,
  process-rate, tool-use, citation, evidence, token-cost, corpus, task-type,
  difficulty, tool-context, signed-evidence, and row-hash fail-closed coverage.
- ece9624: Add Legal Code RAG metric-validity proof fields, fail-closed gates, methodology r110 docs, and tests for French legal-code RAG evidence.
- ece9624: Adds LLM Evaluation System-style jury replay receipts to the replay benchmark corpus, public methodology, benchmark docs, and API docs. AMC now fails closed unless source/repository/license/package/MCP, dataset generation, synthetic QA, document grounding, judge config, jury roster, binary scoring, execution/OpenTelemetry/Bedrock, result/analysis/PDF/S3, replay/CI, no-copy, no-config-only, no-report-only, threshold, signed-evidence, and row-hash proof are present.
- ece9624: Add LLM Fighter live score and behavior drift receipts with signed evidence coverage, Watch alert metric ids, Shield-verifiable receipt hashing, methodology/docs boundaries, and fail-closed tests.
- ece9624: Add llm-prompting-tests public methodology receipts with source/no-license/default-branch, README, prompt-catalog, prompt-taxonomy, rubric, self-check/no-external-assets, judge-calibration, regression-threshold, changelog, deprecation, migration, no-copy, signed-evidence, and row-hash requirements.
- ece9624: Add AIAnytime-style LLM/RAG multi-metric live-drift proof with signed eval-suite evidence, semantic similarity, bias risk, hallucination/faithfulness drift, fail-closed coverage/context alerts, public methodology docs, and tests.
- ece9624: Add LLMOPS-style lifecycle public methodology versioning boundaries.
- ece9624: Add GAP-0633 LM Evaluation Harness-style metric-validity source-review boundaries for Score, Shield, Watch, diagnostic methodology-versioning receipts, score requirements, docs, and badge notices without adding an lm-evaluation-harness subsystem, SDK/importer, parity layer, or copied upstream material.
- ece9624: Add metadata-only LMNR/Laminar observability live drift receipts for Score, Shield, and Watch with fail-closed source/proof validation.
- ece9624: Add local-system monitor live-drift receipts with monitor/device/hardware/process/sensor/alert proof, workload and hardware context drift, thermal-baseline deviation, voltage SPC anomalies, process identity, ghost-driver handling, proactive alert, local-only privacy, signed evidence, and fail-closed Watch alerts.
- ece9624: Close AMC source-review GAP-0653 for pydantic/logfire by documenting the live GitHub metadata and adding regression coverage that binds Logfire only to existing question-score explainability and observability drilldown primitives, with metadata-only claims failing closed and no Logfire subsystem, SDK/importer, adapter, dashboard clone, parity layer, or copied upstream content.
- ece9624: Add an M2RAG-style multimodal RAG methodology-versioning boundary for mixed text/image score claims.
- ece9624: Add MCP Security Bench security-resilience scoring and Net Resilient Performance to MCP compliance and resilience analysis.
- ece9624: Add MedAsk-style clinical benchmark replay receipts for SymptomCheck diagnostic and Triage urgency-classification evidence.
- ece9624: Add MemEval-style long-term-memory replay receipts with fail-closed evidence checks for benchmark manifests, memory-system rosters, scoring configs, token-cost traces, metric coverage, replay pass rates, and CI receipt row IDs.
- ece9624: Add `amc methodology --reproducibility` to export a public methodology packet with question-bank hashes, full question metadata, formulas, source paths, commands, and limitations.
- ece9624: Add `amc methodology --sample-dataset` to export a source-generated public synthetic L0-L5 sample case-study dataset with dataset-card metadata, methodology hashes, evidence profiles, layer scores, privacy notes, and explicit non-empirical-validation boundaries.
- ece9624: Add Metronous-style methodology-versioning assurance receipts for report and badge comparability.
- ece9624: Add MiniAppBench-style interactive HTML replay receipts for replay-corpus runs, including browser-automation traces, generated MiniApp/source-code proof, live-instance evidence, withheld-reference and no-copy boundaries, MiniAppBench summary counters, CI receipt fields, and public methodology documentation.
- ece9624: Add `amc init --minimal` and `amc quickstart --minimal` for startup-friendly workspace setup without vault prompting or immediate full-score prompting.
- ece9624: Add MiRAGE-style multimodal multihop RAG dataset-generation replay proof to replay benchmark corpus receipts, summaries, CI gates, Watch alerts, and docs.
- ece9624: Add MIRAGE-style RAG metric-validity gates so benchmark identity, dataset, QA/context/retrieval pools, base/oracle/mixed protocol, retriever/model configs, LLM/retriever/MIRAGE metric reports, score formula, owner, sample-size, confidence-interval, signed-evidence, and row-hash proof fail closed.
- ece9624: Add ML-development workflow replay receipts to the replay benchmark corpus, including typed task/category/domain/harness evidence, deterministic replay artifacts, fail-closed metric thresholds, CI receipt fields, Watch alerts, methodology r58 docs, and source-use posture for ml-dev-bench/ml-dev-bench.
- ece9624: Add MobileBench-style mobile-agent metric-validity gates requiring signed environment, app inventory, API catalog, UI trace, task dataset, task complexity, multi-app task, checkpoint, reset/device-state, license-boundary, owner, sample-size, confidence-interval, and row-hash proof before mobile-agent benchmark claims can be used externally.
- ece9624: Add a mobile-safe AMC Bridge fetch wrapper for React Native-style integrations and document the mobile Bridge path for React Native and Flutter. The wrapper avoids Node-only imports, strips provider auth by default, injects AMC correlation headers, and keeps self-scoring guards active before mobile requests leave the app.
- ece9624: Add Multi-User-LLM-Agent-style question explainability lenses with scenario, role, policy, trace, evaluator, metric-threshold, accepted/rejected evidence, repair-hint, and row-hash proof.
- ece9624: Add Navi-Bench-style real-website web-agent live-drift receipts with source, dataset, task-config, evaluator, browser-provider, trajectory, visualization, crash-adjusted score, and evidence coverage gates.
- ece9624: Add NIKA-style network troubleshooting metric-validity gates with typed proof coverage, signed eval-pack fields, fail-closed warnings, public methodology r90 documentation, and API surface documentation.
- ece9624: Add NoMIRACL-style multilingual RAG live-drift evidence gates, receipts, methodology boundaries, and docs.
- ece9624: Adds Nuclia-style RAG-triad replay receipts to the replay benchmark corpus. Rows now fail closed unless source/repository/license proof, package/model-cache/auth/evaluator/dataset/QA-context/metric traces, triad scores, replay proof, model-access boundary, no-raw-context-copy boundary, signed evidence, and row hashes are present.
- ece9624: Add observability/SRE live-drift evidence receipts for o11y-bench-style monitoring, including task-spec and generated-task hashes, Grafana stack and Docker config proof, scenario-clock alignment, trajectory/stdout/grading/reward/result/report artifacts, deterministic-check, rubric, resolution, incident/task/data-source/tool-mode drift metrics, Watch alerts, public methodology, and docs coverage.
- ece9624: Expose `amc observe` timeline and anomaly data through read-only `/api/v1/observe/*` API routes, document them in OpenAPI/API surfaces, and add regression coverage for route registration and CLI-parity payloads.
- ece9624: Add OccuBench-style professional-task question explainability proof to Score, Shield, Watch, Studio drilldown, public methodology, and docs.
- ece9624: Add Ollama-metrics-style live drift receipts for local LLM proxy observability, including token, request-duration, time-per-token, loaded-model, RAM, error-rate, model/deployment/proxy-context drift, evidence coverage, methodology docs, and source-boundary notes.
- ece9624: Add GAP-0629 OpenAI Evals-style public-methodology source-review boundaries for Score, Shield, Watch, diagnostic methodology-versioning receipts, and badge notices without adding an OpenAI Evals subsystem, importer, parity layer, or copied upstream material.
- ece9624: Close GAP-0639 with OpenAI Simple Evals metric-validity source-review boundaries for Score, Shield, Watch, diagnostics, badges, and methodology docs without adding a subsystem/importer/parity layer or copying upstream material.
- ece9624: Document reusable OpenAPI webhook payload, event, receipt, and signature-header schemas and link product portal payload examples to those contracts.
- ece9624: Add OpenCode-lab-style metric-validity gates that fail closed on missing source, lab, context, prompt, tool, AGENTS policy, repeated-run, fork-agreement, model-variance, ground-truth, metric-definition, CI, result, owner, sample-size, confidence-interval, signed-evidence, and row-hash proof.
- ece9624: Add metadata-only OpenCompass live drift receipts for Score, Shield, and Watch with fail-closed source proof validation.
- ece9624: Add optional Comet Opik-style question score explainability receipt fields so Score, Shield, and Watch claims require AMC-owned eval packs, signed evidence rows, accepted/rejected ledgers, repair hints, thresholds, and no-copy/no-parity proof; product-page metadata remains source-signal only.
- ece9624: Add OSUniverse-style GUI-navigation live-drift proof receipts with task category, complexity level, validator, trajectory, screenshot, step-limit, and runtime-context drift alerts.
- ece9624: Fix local pack test entry-point resolution for `index.mjs` scaffolds, retain legacy `index.js` fallback, document the pack authoring flow, and add regression coverage.
- ece9624: Make `amc pack init --name <name>` scaffold into `./<name>/`, add `--dir`, and reject unnamed non-interactive scaffolding.
- ece9624: Make `amc pack publish` create an explicit local bundle by default and upload to a registry only when `--registry` is provided.
- ece9624: Make `amc pack test` validate AMC pack manifests, auto-detect one child pack, and print clearer path guidance.
- ece9624: Add paper-read-skill-style live-drift receipts with source-boundary proof, row proof hashes, fail-closed evidence coverage alerts, public methodology r201 bindings, and docs.
- ece9624: Adds PaperArena replay-corpus receipts for scientific-literature tool-use claims, binding source/no-license proof, README/requirements, hub runner/scorer artifacts, dataset-builder/tool/RAG/reflector/run-script trees, Hugging Face dataset snapshots, paper/QA manifests, replay commands, CI receipts, tool surfaces, counts, evaluator agreement, trace/result coverage, signed evidence, and row hashes.
- ece9624: Add Parallel/OpenClaw research-skill metric-validity receipts that fail closed unless source, license-boundary, skill/API/search/deep-research/chat/extract/citation/source-policy/batch/monitoring/security/dependency, benchmark-validation, owner, sample-size, confidence-interval, signed-evidence, and row-hash proof is present.
- ece9624: Add PawBench-style model-harness replay receipts for replay benchmark corpora.

  Replay rows can now bind model id, harness id, task id/source, task taxonomy, grading mode, prompt/workspace/timeout/task metadata hashes, grader or judge rubric proof, transcript and metrics artifacts, submission and slice payloads, replay command, result-version path, deterministic seed, task count, preservation artifacts, signed evidence, and row hashes. Missing model-harness replay evidence fails closed through the manifest, CI receipt, Shield verification, and Watch alerts.

- ece9624: Implement PBSAI governance support with a twelve-domain framework mapping, structured context-envelope diagnostic, and signed attestation envelope metadata.
- ece9624: Add PersonaGym-style persona-agent metric-validity proof with typed persona, environment, benchmark question, model/provider, rubric, PersonaScore-style metric, calibration, evaluation-output, result, owner, sample-size, confidence-interval, signed-evidence, and row-hash gates.
- ece9624: Document GAP-0596 source review for `shipfastlabs/pest-plugin-evals` and add replay-corpus regression coverage proving Pest-style eval packs require AMC-owned fixtures, signed evidence rows, score deltas, replay manifests, and CI/lifecycle receipts while metadata-only source references fail closed.
- ece9624: Add PhysicianBench-style clinical EHR live-drift receipts so FHIR, patient-record, checkpoint, trajectory, workspace, eval-log, clinical metric, signed-evidence, and row-hash proof fail closed.
- ece9624: Add PIArena-style prompt-injection live-drift receipts so attack success, defense block, false positives, agent task success, tool-call success, evidence coverage, attack/defense/dataset/agent-benchmark drift, signed evidence, and row hashes fail closed.
- ece9624: Expand the CLI and browser playground scenario libraries with real-world alignment, supply-chain/logistics, healthcare, and finance cases, plus regression coverage for scenario breadth and static browser scenario checks.
- ece9624: Add GAP-0638 PocketFlow-style public-methodology source-review boundaries for Score, Shield, Watch, diagnostic methodology-versioning receipts, and badge notices without adding a PocketFlow subsystem, SDK/importer, parity layer, or copied upstream material.
- ece9624: Add PokerEval-style live score and behavior drift receipts with package, citation, simulation, opponent-pool, run, hand-history, metric-report, BB/100, all-in adjusted, EV, VPIP, hand-count, context drift, methodology, docs, and synthetic tests.
- ece9624: Add Polymath-style logic benchmark replay receipts to the replay corpus so symbolic-reasoning benchmark claims bind source, dataset access, license, environment, inference boundary, tool, replay, evaluator, metric, signed evidence, and row-hash proof before Score/Shield/Watch accept them.
- ece9624: Add metadata-only promptfoo provider-drift receipts across Score, Watch, Shield, and benchmark APIs, with fail-closed checks for provider version, canary result, drift statistic, and alert/waiver evidence without copying promptfoo code/prose/config.
- ece9624: Add promptware kill-chain scenarios to the injection assurance pack for multi-stage persistence, lateral movement, and exfiltration attacks.
- ece9624: Add guided prospect demo and static share bundle commands for sales walkthroughs, with DEMO_ONLY evidence boundaries and public URL manifests.
- ece9624: Add Eval-ai-library-style provider-drift evaluator framework proof with framework/version, provider route, metric suite, evaluator config, generated test-data, verdict aggregation, dashboard artifact, signed evidence, row-hash, Watch alert, and CI fail-closed coverage.
- ece9624: Fail provider-drift gates closed when canary rows lack signed evidence references, and document the signed-evidence requirement for replayable provider-drift eval packs.
- ece9624: Add Opik-style provider observability pipeline proof to provider/model drift canaries.

  Provider-drift rows can now bind pipeline orchestrator/run, experiment tracker/run, observability project, datastore, retrieval index, content dataset, summary artifact, QA dataset, trace export, metric report, and pipeline config proof. Missing observability-pipeline evidence emits a fail-closed Watch/API alert and is included in eval-pack row hashes, CI/lifecycle gates, public methodology, and docs.

- ece9624: Add `amc leaderboard public-export` for anonymized public leaderboard dataset-card and JSONL exports with minimum-cohort and metadata opt-in privacy controls.
- ece9624: Reconcile public diagnostic-question and industry-pack count drift across product docs, website pages, station pages, and Batch 5 audit notes, with regression coverage for source catalog counts and current-facing copy.
- ece9624: Normalize current-facing public test-count claims to a reproducible Vitest static inventory and add a regression test for stale count drift.
- ece9624: Add a Pulumi Kubernetes Helm-release example for deploying the AMC Helm chart without storing bootstrap secret literals in Pulumi stack config.
- ece9624: Correct diagnostic question-set metadata after the four research-backed additions: the default compatibility set now reports 244 questions, lifecycle reports 264, user-facing copy no longer hardcodes stale 240/260 assumptions, and question-set tests derive expected counts from the bank.
- ece9624: Add `amc quickscore --answers <jsonOrFile>` for non-interactive answer-based scoring in full and rapid quickscore modes.
- ece9624: Make `amc quickscore --auto --json` fail closed with structured `AUTO_NO_EVIDENCE` metadata when execution evidence is missing, avoiding normal-looking zero-score output for first-run users.
- ece9624: Add a first-run interactive hint to non-interactive quickscore placeholder output, including JSON metadata, rapid/full CLI output, quickstart output, and docs/audit coverage.
- ece9624: Keep non-interactive quickscore JSON parseable by moving placeholder-score warnings into structured metadata and strengthening human quickstart warning copy.
- ece9624: Make non-interactive `amc quickscore` fail closed before placeholder L0 scoring unless answers or evidence mode are provided.
- ece9624: Validate the compiled `quickscore --rapid --share` path as an offline badge and summary flow without requiring Studio.
- ece9624: Fail closed for non-interactive `amc quickstart` runs instead of producing placeholder L0 results.
- ece9624: Add IBM/rag-chunking-techniques-style RAG chunking technique metric-validity receipts with fail-closed Score/Shield/Watch surfaces, methodology/docs bindings, and eval-pack proof fields.
- ece9624: Add public methodology and source-boundary receipts for RAG_Contradiction_Detector-style biomedical RAG contradiction replay claims.
- ece9624: Add RAG QA dataset-builder live-drift receipts and alerts for source-document, license, QA-pair, passage, config, tier, question-type, build-stage, grounding, human-verification, citation, answer-support, cost, concurrency, count, and row-hash evidence.
- ece9624: Add rag-eval-style document QA dataset replay receipts. Replay-corpus rows can now fail closed on missing source/repository/license proof, input document manifests, processor/prompt/generator proof, generated QA dataset proof, endpoint response traces, ranking/evaluation reports, replay/CI receipts, question and endpoint counts, score delta, replay pass rate, endpoint response coverage, signed evidence, and row hashes.
- ece9624: Add Rag-Eval-flow-style local RAG replay proof to the replay benchmark corpus, including source/repository/license, pipeline, data-source, model, judge, metric, prompt-template, eval-pack, fixture, replay, result, score-delta, CI, sample-size, seed, replay-pass, metric-coverage, signed-evidence, and row-hash gates.
- ece9624: Add RAG text-generation live-drift source-review coverage to existing Watch drift primitives so baseline distribution, live sample, drift statistic, alert receipt, signed evidence, and row hashes are required before survey-style RAG drift claims count as Score, Shield, or Watch proof.
- ece9624: Add fail-closed RAGAS notebook metric-validity receipts for Coding-Crashkurse/RAG-Evaluation-with-Ragas-style evidence, including source/no-license-boundary, notebook, dependency, document corpus, chunking, testset generation, evolution mix, generated testset, RAG chain, retriever/vectorstore, model/embedding, answer-context, RAGAS metric, LangFuse, visualization, sample/CI, signed-evidence, and row-hash proof.
- ece9624: Add a RagScore-style RAG audit methodology boundary for generated QA datasets, support-span grounding, detailed RAG metrics, failure diagnosis, privacy mode, and MCP/server telemetry claims.
- ece9624: Add RAIL Score live-drift receipts with fail-closed source, release, PyPI package, guardrail, telemetry, compliance, agent-tool, Watch alert, row-hash, and public methodology evidence.
- ece9624: Add RAViG-Bench metric-validity receipts with source/evaluation/dataset/evaluator proof, fail-closed Score/API/CI gates, public methodology r209 binding, and docs for the live verified source boundary.
- ece9624: Add Realign-style simulation metric-validity proof fields, fail-closed judge/regression thresholds, public methodology boundaries, API surface documentation, and benchmark no-copy guidance for simulation-driven AI app evaluation evidence.
- ece9624: Add REALTALK-style long-term conversation replay receipts so real-dialogue memory claims bind provenance, privacy/consent, temporal split, LoCoMo comparison, task-specific evaluator artifacts, metrics, signed evidence, and row-hash proof before Score/Shield/Watch accept them.
- ece9624: Add Recovery-Bench-style live-drift proof so failed-trajectory replay, corrupted-environment recovery, recovery success/reward, message-mode/harness/task drift, signed evidence, and row hashes fail closed across Score, Shield, and Watch.
- ece9624: Add deterministic CVSS v4.0-style base scoring metadata to red-team vulnerability reports, including score, qualitative rating, vector string, metric values, and an explicit approximation note for AI-agent findings.
- ece9624: Expose built-in Evil MCP agent-provider scenarios through `amc redteam run --evil-mcp`, add `--mcp-attacks` category selection with common aliases, embed linked MCP JSON/Markdown evidence paths in the primary red-team report, and fix MCP provider category filtering for `tool-poisoning`.
- ece9624: Document `amc score gaming-resistance` in the red-team guide as the primary score-gaming resistance check, alongside `amc redteam run`, Evil MCP coverage, assurance packs, and shield analysis.
- ece9624: Add explicit unsigned-valid status semantics to `amc redteam run`, expose `--no-sign` in the CLI, and verify that red-team reports run without creating or unlocking a vault while persisting JSON/Markdown evidence. Also refresh canon and diagnostic-bank schema counts from the live question bank so fresh workspace initialization works after the 244-question expansion.
- ece9624: Add metadata-gated Reflexion-agent live score and behavior drift receipts on the existing Watch live-drift path.
- ece9624: Add `amc report latest` and unique run-id prefix resolution so customer-success and sales workflows can render the newest saved report without copying full UUIDs.
- ece9624: Add diagnostic report share bundles. `amc report <run|alias|latest> --share` now writes a static `index.html` plus `share-manifest.json`, prints a local file URL, and can print a public URL with `--public-base-url` for user-custodied static hosting.
- ece9624: Explain diagnostic report statuses in Markdown, executive, and HTML outputs with evidence status labels, claim boundaries, and next verification steps for valid, invalid, unsigned, and trust-boundary-blocked reports.
- ece9624: Add ResearchGym-style autonomous research-run live drift proof so Watch/Score receipts fail closed on missing task, artifact, budget, inspection, violation, score-improvement, subtask-completion, task-domain, or runtime-context evidence.
- ece9624: Add ResearchHarness-style tool-using agent harness replay receipts to AgentBench replay rows, including runtime contract, tool surface, native tool-call, OpenAI-compatible API, workspace boundary, trace, adapter, provider matrix, baseline/meta-harness, policy, metric, summary, CI, methodology, and documentation bindings.
- ece9624: Add resume-RAG evaluator metric-validity receipts for local Ollama resume parser and candidate-evaluator claims, including fail-closed source/license, upload/parser, job-description, RAG strategy, retrieval, model, endpoint, rating, batch, privacy, dependency, owner, sample-size, confidence-interval, signed-evidence, and row-hash proof.
- ece9624: Add ShampooSalesAgent-style retail sales question-explainability receipts with source/product/customer/order/provider/policy/privacy proof, metric thresholds, evidence drilldown previews, public methodology binding, and fail-closed validation.
- ece9624: Add RSS market-impact public methodology versioning receipts with fail-closed source/no-license, feed, model route, prompt/schema, dedupe, analysis, push, threshold, outcome/backtest, migration, signed-evidence, and row-hash requirements.
- ece9624: Add SAP agent-evaluation tutorial live-drift proof with objective, process, enterprise-context, notebook, dataset, baseline log, live sample, metric, tooling, policy, alert-receipt, signed-evidence, distribution-drift, and fail-closed Watch gates.
- ece9624: Add AutoResearchBench-style scientific literature discovery metric-validity gates with signed benchmark, task, dataset, search-tool, metric, owner, confidence-interval, eval-pack, and fail-closed CI proof.
- ece9624: Add SconeBench-style smart-contract exploit metric-validity proof to pentest benchmark checks, requiring dataset, historical fork, problem metadata, FlawVerifier, Forge grader, profit threshold, anti-cheat reset, cutoff split, signed evidence, confidence interval, and row-hash receipts.
- ece9624: Add Scorable SDK Studio evidence drilldown receipts with source/package integrity, trace, receipt, policy, artifact, empty-state, and error-state proof.
- ece9624: Consolidate Node/TypeScript, Python, Go, and OpenAPI SDK surfaces in the SDK docs and update the Batch 5 integration audit evidence.
- ece9624: Add SecureVibeBench secure-coding metric-validity receipts with fail-closed source, dataset, runner, adapter, scenario, test-script, utility, CI, owner, confidence interval, signed-evidence, artifact-hash, and row-hash proof.
- ece9624: Add Securing MCP supply-chain governance scoring and unintentional-adversary excessive-agency probes.
- ece9624: Add `amc shield analyze-runtime`, a runtime action-analysis surface that wraps the Shield trust pipeline with instruction-source, sensitive-field, credential freshness, confidence, risk, recommendation, and evidence-chain reporting.
- ece9624: Document signed CI graduation after `ci init --no-sign`, including vault setup, CI secret handling, signed rerun command, and when to remove `--no-sign`.
- ece9624: Add Skill Forge-style autoresearch replay receipts to SkillBench regression proof, requiring source, agent-role, mutation/revert policy, replay manifest, CI, score-delta, and row-hash evidence before autonomous skill-improvement claims pass.
- ece9624: Add Watch evidence receipts and public methodology boundaries for SkillMatch-style resume live-drift claims.
- ece9624: Add SLDBench-style scaling-law discovery live-drift proof with signed benchmark/source, task, dataset split, source-experiment, config, model-route, program, checkpoint, result, formula, extrapolation, R2, NMSE, NMAE, evidence coverage, task-type, context, row-hash, and fail-closed Watch alerts.
- ece9624: Add Microsoft Social Reasoning Bench-style replay-corpus receipts with fail-closed Score/Shield/Watch surfaces, methodology/docs bindings, source-boundary proof, and CI summary fields.
- ece9624: Close AMC source-review GAP-0640 through GAP-0648 with relevance-gated Score/Shield/Watch boundaries, documenting skipped metadata-only rows and adding regression coverage over existing replay-corpus, question-explainability, and live-drift primitives without adding source-specific subsystems.
- ece9624: Close AMC source-review GAP-0649 as a relevance-gated public-methodology boundary, documenting DOI/OpenAlex/Crossref metadata and the no-bloat decision that the adaptive multi-agent tutoring paper is background context only, not a methodology version bump or source-specific subsystem.
- ece9624: Close AMC source-review GAP-0651 with a relevance-gated AutoRAG replay-corpus boundary, documenting metadata-only fail-closed behavior and regression coverage over existing signed replay-corpus receipts without adding a source-specific subsystem.
- ece9624: Close AMC source-review GAP-0654 with a relevance-gated Agenta public-methodology boundary, documenting live GitHub metadata and regression coverage without adding source-specific subsystems or methodology-version bloat.
- ece9624: Add SparkOrbit-style orbit-monitor proof to provider drift canaries with fail-closed checks for source catalogs, leaderboard/model/benchmark/news snapshots, reload runs, ranking policy, summary artifacts, source/category counts, daily reload verification, eval-pack row hashes, Watch alerts, and CI gates.
- ece9624: Add spent-style session-cost replay receipts to the replay benchmark corpus, including fail-closed source/repository/license, hook config, JSONL manifest, pricing, classifier, dashboard, privacy, session/tool-event, efficiency, cost, replay, classification-coverage, CI, API, methodology, and Watch/Shield summary bindings.
- ece9624: Add discoverable enterprise auth setup entrypoints. `amc sso configure <oidc|saml>` now configures signed host identity providers, and `amc scim init` enables SCIM provisioning with optional first-token creation without resetting existing providers.
- ece9624: Add `amc quickstart --startup-plan` and `--what-broken` for role-aware startup guidance, framework detection, sample answer files, and blocker-only output.
- ece9624: Adds Strands benchmark-harness live-drift receipt fields, thresholds, row hashing, Watch alerts, methodology docs, and tests for signed trajectory/evidence coverage, task-success, patch-apply, test-pass, latency, cost, suite, runtime, and task-family drift.
- ece9624: Add SubtleMemory-style relational-memory metric-validity receipts so Score, Shield, and Watch fail closed when source/license, default-branch, arXiv, Hugging Face dataset, persona split, bench/history manifest, relation taxonomy, construction pipeline, staged evaluation, adapter roster, judge/evaluator, score/diagnostic, CI validation, owner, sample-size, confidence-interval, signed-evidence, artifact-hash, and row-hash proof is missing.
- ece9624: Add Sutro-style batch methodology-versioning assurance for public AMC reports and badges, including source snapshot, license, function/schema, data-source, input-order, priority, dry-run cost, model-pool, observability, export, retention, multi-model, embedding, diagnostic receipt, and no-copy boundary requirements.
- ece9624: Extend the sycophancy assurance pack with systemic objective-decoupling probes for biased feedback loops, evaluator collusion, and unsafe majority-feedback updates.
- ece9624: Add TerminalWorld-style replay-corpus receipts that fail closed unless public-recording provenance, privacy/quality filters, synthesized task proof, Docker environment reproduction, state-based tests, AllPassing/Nop/Partial trials, result/replay/CI proof, signed evidence, and row hashes are present.
- ece9624: Add Terrarium-style living-environment metric-validity gates so stateful multi-turn benchmark claims require task-program, mutable-environment, capability, sandbox, agent-adapter, checker, trial-result, aggregate-metric, pass@k, proactive-trigger, owner, confidence-interval, signed-evidence, and row-hash proof before Score/Shield/Watch accept them.
- ece9624: Add test-suite evaluation lenses to question-level score explainability.

  Question receipts can now bind suite/source identity, language/framework/adapter, dataset and test-case hashes, evaluator config, judge context, experiment results, export artifacts, CI proof, agent trace/tool-call validation, pass-rate and score thresholds, cost/latency/tokens, accepted and rejected evidence, repair hints, and row hashes. Missing test-suite evidence fails closed through question explainability replayability, generated reports, Shield inspection, API docs, and public methodology r69.

- ece9624: Add Text2SQL business-database replay receipts to the replay benchmark corpus, including schema/database/governance/security/audit evidence, fail-closed SQL accuracy and safety thresholds, CI receipt fields, Watch alerts, methodology r59 docs, and source-use posture for Tangxihong0922/QueryMind.
- ece9624: Show compact grouped top-level help by default and keep the full list behind `amc --help --all`.
- ece9624: Add a ToolSafe-backed diagnostic question for proactive pre-execution tool invocation guardrails and feedback evidence.
- ece9624: Add trace-derived agent-evaluation metric-validity proof for Bedrock-style agent quality loops.

  Metric-validation reports now support optional `traceEvaluationChecks` plus `requireTraceEvaluationProof`. When required, AMC fails closed unless the row binds signed evidence for model config, agent parameters, tool registry, trace manifest, repeatable cases, dynamic validators, bulk runs, run permutations, mocked LLM controls, metric definitions, measurement exports, production monitor bindings, threshold alarms, owner, sample size, confidence interval, and row hashes.

- ece9624: Add metadata-only TRiSM agentic AI live drift receipts for Score, Shield, and Watch with fail-closed DOI/OpenAlex metadata validation.
- ece9624: Treat missing monitor public keys as unsigned `fleet trust-report --no-sign` prerequisites instead of hard failures.
- ece9624: Open the Compass Console by default after `amc up --demo` startup, with `--no-open` for headless runs.
- ece9624: Add `amc up --demo` / `--read-only` and `--dry-run` so users can explore Studio without a vault passphrase while keeping signed startup vault-gated.
- ece9624: Bind UpTrain source-review metadata to existing eval score explainability primitives, including accepted/rejected evidence ledger propagation through Score, guide, and passport summaries.
- ece9624: Publish the Studio value webhook route contract with explicit single-workspace and host-mode paths, `x-amc-webhook-token` auth semantics, and vault-token wording.
- ece9624: Add `amc watch safety-test --category` and `--verbose`, plus scenario-level safety test details and alignment-specific probes.
- ece9624: Add eval-score explainability packs over existing question-score receipts with signed evidence rows, accepted/rejected evidence bindings, reproducible eval-pack hashes, fail-closed thresholds, guide hints, and passport summary bindings.
- ece9624: Add typed web-agent privacy leakage live-drift receipts for AgentDAM-style data-minimization proof. Watch now hashes benchmark/task/browser/privacy evidence, checks minimization/leakage/task metrics, fails closed on missing proof, and alerts on environment, observation-mode, and context drift.
- ece9624: Add web eval dataset metric-validity proof for web-search RAG evaluation dataset claims.

  AMC now fails closed unless web eval dataset metric rows bind source, subject,
  generated-query, search-provider, retrieved-document, filter, QA-generation,
  reference-answer, export-target, freshness, source-coverage, answer-grounding,
  owner, confidence-interval, signed-evidence, and row-hash proof before using
  Tavily-style generated web/RAG evaluation datasets as external evidence.

- ece9624: Fix the static 404 page navigation to use domain-agnostic relative links and add regression coverage against the old `/AgentMaturityCompass/` deployment path.
- ece9624: Remove tracked public `website/script-backup*.js` files so stale backup assets are not shipped from the website root.
- ece9624: Validate website blog/changelog content and add a static changelog fallback so the public changelog is useful even when remote release-note loading fails.
- ece9624: Normalize static website keyboard focus-visible styling and add regression coverage for focus indicators and removed backup artifacts.
- ece9624: Add skip-navigation links and `main-content` targets across static website/docs HTML pages, with shared docs skip-link styles and regression coverage.
- ece9624: Resolve whitepaper placeholder citation markers by replacing `[CITATION: ...]` tags with numeric references, adding OpenAI's official agent tooling source, removing unsupported McKinsey/Gartner adoption claims, and adding regression coverage that blocks placeholder citations and unsupported industry-report claims from returning.
- ece9624: Expose the AMC whitepaper from the public homepage research section, footer, and docs index, with regression coverage and Batch 5 audit closure for research-artifact discoverability.
- ce21fad: Contain Domain Proof HTTP checks to inline schema-validated inputs, canonical toy source manifests, and realpath-verified built-in fixtures. API-side output files, shape-only source substitution, traversal, arbitrary workspace reads, symlink escapes, and host-path error disclosure now fail closed while local CLI file workflows remain available.
- ece9624: Add metadata-only HELM provider drift receipts across Benchmark, Score, Shield, and Watch APIs.
- ece9624: Close AMC source-review GAP-0650 as a non-adoption provider-drift boundary for the product-design multi-agent paper, documenting live DOI/OpenAlex/Crossref metadata hashes and adding regression coverage that citation metadata fails closed in existing provider-drift Score/Shield/Watch primitives.
- ece9624: Document GAP-0655 AdalFlow as a metadata-only live drift source review bound to existing Watch primitives.
- ece9624: Document Langfuse source-review relevance and add fail-closed replay-corpus regression coverage for Langfuse-style eval-pack evidence.
- ece9624: Document LangWatch source-review relevance, add LangWatch eval-import normalization, and cover fail-closed LangWatch-style replay-corpus evidence.
- 4c65a89: Enforce a centralized least-privilege role matrix across protected Studio `/api/v1` routes. Viewers remain read-only, operators run workflows, approvers issue execution tickets, auditors verify or attest, and secrets, signing, identity, keys, policy, certificates, and control-plane changes require owners.
- ece9624: Add metadata-only TensorZero provider drift Score, Shield, and Watch surfaces backed by existing provider-drift primitives.
- ece9624: Document Testing-RAG source-review relevance and add fail-closed replay-corpus regression coverage for Testing-RAG-style RAGChecker evidence.

All notable changes to AMC are documented here.

## [Unreleased]

### Added

- **Full 235-question interactive diagnostic** replaces quickscore default (`90f11940`)
- **3 archetype + 3 assurance packs** from awesome-ai-agents gap analysis — autonomous loops, multi-agent orchestrators, science/research agents (`04d5d3ad`, `87f5f34e`)
- **10-gap competitive closure vs Visibe.ai** — runtime observability, real-time assurance, auto-instrumentation SDK, cost tracker, CI/CD integrations (`1ae9819d`)
- **Enterprise tier** — license key system, feature gates, fleet governance, SSO, pack registry (`src/enterprise/`)
- **MCP server** — `amc mcp serve` exposes AMC as a Model Context Protocol server for AI coding assistants
- **Compliance CLI** — `amc compliance` for regulatory framework mapping
- **Continuous documentation update process** (`54e64980`)
- **PR template** with doc update checklist (`359dc691`)

### Fixed

- TypeScript error in MCP server (`report.evidence` → `report.trustEvidence`) — was blocking CI (`21f149ab`)
- CI test timeouts: assurance tests bumped to 90s for slower CI runners (`55cf6f81`)
- Docker smoke test: added missing `studio start` CMD override (`55cf6f81`)

### Changed

- README: added live CI badge, removed duplicate Product Family table (`a270701c`)
- `package.json`: added author field for npm profile (`55cf6f81`)
- Cleaned up 5 stale feature branches (all merged to main)

### Infrastructure

- **Repo hygiene** — keywords (23), compliance file cleanup, .editorconfig, CODE_OF_CONDUCT, Dependabot, SBOM (15K lines), postinstall (`08dc22bf`)
- Vitest 4.x upgrade, audit vulns resolved to 0, competitor traces cleanup (`fd9ee61e`)
- 14 stale docs fixed from freshness audit (`b7fba797`)
- Git push: all commits synced to origin/main

### Metrics

- Diagnostic questions: 195 → **235**
- Assurance packs: 119 → **147**
- Tests: 3,645 → **4,161** (275 files)
- npm audit: **0 vulnerabilities**

## [1.0.0] — 2026-03-17

### Added — Simulation & Forecast Lane Deep Implementation (2026-03-17)

- **5 new scoring modules** for the Simulation & Forecast lane:
  - `forecastLegitimacy.ts` — epistemic honesty, calibration, uncertainty scoring (AMC-6.1–6.10)
  - `factSimulationBoundary.ts` — provenance separation, writeback governance (AMC-6.11–6.17, 6.37–6.42)
  - `syntheticIdentityGovernance.ts` — persona labeling, real-person controls (AMC-6.18–6.25, 6.48–6.52)
  - `simulationValidity.ts` — mode collapse, population diversity, calibration (AMC-6.30–6.36)
  - `scenarioProvenance.ts` — end-to-end traceability, replay, interaction safety (AMC-6.26–6.29, 6.53–6.57)
- **Lane aggregator** (`src/lanes/simulationForecastLane.ts`) — weighted 5-dimension scoring, auto-activates for simulation/forecast system types
- **CLI command** `amc score simulation-lane --system-type <type>` with interactive, JSON, and file-based modes
- **96 new tests** across 8 test files (score modules, lane aggregator, pack integration)
- Total scoring modules: 74 → **79**
- Total tests: 3,549 → **3,645**
- Total test files: 244 → **252**

### Added — Simulation & Forecast Evaluation Lane (2026-03-16)

- **57 new diagnostic questions** (AMC-6.1 → AMC-6.57) covering simulation/forecast systems
  - Forecast Legitimacy (10): uncertainty, calibration, false precision, scenario framing
  - Fact/Simulation Boundary Integrity (7): provenance tagging, evidence class separation
  - Synthetic Persona Governance (8): labeling, evidence basis, private person protection
  - Scenario Traceability & Replayability (4): end-to-end claim lineage, replay
  - Simulation Validity (7): population diversity, synthetic consensus detection
  - Writeback Governance (6): contamination loops, rollback, human approval
  - Predictive UX Honesty (5): claim benchmarking, scenario language
  - Real-Person Representation (5): defamation controls, motive attribution limits
  - Synthetic Agent Interaction Safety (5): dialogue labeling, provenance retention
- **9 new assurance packs** with 54 scenarios for simulation-class systems
- **SystemType taxonomy** added to types.ts for product-class classification
- Total diagnostic questions: 138 → **195**
- Total assurance packs: 110 → **119**

### Added

- Documentation + website refresh for the expanded AMC workflow surface:
  - new docs: `COMPATIBILITY_MATRIX`, `STARTER_BLUEPRINTS`, `OSS_ADOPTION_ROADMAP`
  - website/docs hub now visibly surfaces compatibility, starter blueprints, and adoption planning
  - starter blueprint example folders added for OpenClaw, LangChain RAG, CrewAI + GitHub Actions, and OpenAI-compatible lite-score flows
  - public-facing stale counts/copy normalized across README, website, and selected docs/blog pages
  - `lite-score` naming normalized in updated public docs

### Added

- Agent Transparency Report (`amc transparency report`) — behavioral SBOM for AI agents
- AMC MCP Server (`amc mcp serve`) — Model Context Protocol integration for AI coding assistants
  - 6 tools: amc_list_agents, amc_quickscore, amc_get_guide, amc_check_compliance, amc_transparency_report, amc_score_sector_pack
  - 1 resource: amc://agent/{agentId}
  - IDE configs: Claude Code, Cursor, Windsurf, VS Code Copilot, Kiro
- `amc mcp config` — print ready-to-paste MCP configuration for supported IDEs
- `amc mcp list-tools` — list all MCP tools with descriptions
- **AMC Sector Packs** — 40 industry-specific assessment packs across 7 stations with 380 diagnostic questions

  - **7 Stations**: Environment (6), Health (9), Wealth (5), Education (5), Mobility (5), Technology (5), Governance (5)
  - **382 questions** with specific regulatory article references (e.g., `HIPAA §164.312(a)(1)`, `EU AI Act Art. 5(1)(a)`, `FERPA 20 U.S.C. §1232g`, `UNECE WP.29 R155 §7`, `UNCAC Art. 7`)
  - **Per-pack enterprise metadata**: `riskTier`, `euAIActClassification`, `sdgAlignment`, `certificationPath`, `keyRisks`, `certificationThreshold`
  - **Per-question L1/L3/L5 maturity descriptors** — industry-specific, not generic
  - **Scoring API**: `scoreIndustryPack()`, `getIndustryPack()`, `getIndustryPacksByStation()`, `listIndustryPacks()`, `getStationSummary()`
  - Full export from `src/domains/index.ts`
  - Risk-calibrated certification thresholds (68–85% by tier)
  - Documentation: [`docs/SECTOR_PACKS.md`](docs/SECTOR_PACKS.md)

- **Agent Guide System** — `amc guide` generates personalized guardrails, agent instructions, and improvement plans from actual scores
  - `--go` mode: zero-friction one-command workflow (auto-detect + generate + apply)
  - `--status` mode: one-line health check with severity counts
  - `--quick` mode: skip interactive questions for CI/scripts
  - `--interactive` mode: cherry-pick which gaps to fix
  - `--watch --apply` mode: continuous monitoring with auto-update
  - `--ci --target N` mode: CI gate that exits non-zero below threshold
  - `--diff` mode: compare with previous run, track improvements/regressions
  - `--dry-run` mode: preview apply without writing files
  - `--auto-detect` mode: detect framework from project files
  - `--frameworks` mode: list supported frameworks
  - `--compliance` mode: generate compliance-specific guardrails mapped to regulatory obligations
  - 5 compliance frameworks: EU AI Act, ISO 42001, NIST AI RMF, SOC 2, ISO 27001
  - Per-question compliance gap mapping from 37 built-in compliance mappings
  - Severity tagging: 🔴 Critical (gap ≥ 3), 🟡 High (gap ≥ 2), 🔵 Medium (gap = 1)
  - 10 framework-specific instruction sets (LangChain, CrewAI, AutoGen, OpenAI, LlamaIndex, Semantic Kernel, Claude Code, Gemini, Cursor, Kiro)
  - 15 agent config targets with idempotent AMC-GUARDRAILS markers
  - Per-question verification commands in agent instructions
  - Getting-started tutorial for L0-L1 agents
  - Framework auto-detection from pyproject.toml, requirements.txt, package.json, \*.csproj, config files
- **Over-Compliance Detection** — 3 new assurance packs + 8 diagnostic questions (AMC-OC-1 through AMC-OC-8) based on H-Neurons paper (arXiv:2512.01797)
- **Website Improvement Journey** — new section showing L1→L5 path with simple and technical modes
- **Dashboard v13** — zero-state first-run, rich trend tooltips, crosshair, sidebar collapse, skip-link, prefers-reduced-motion (council score: 9.39/10)

### Changed

- Question bank expanded: 118 → 138 questions (added Evaluation & Growth dimension)
- Assurance packs expanded: 71 → 86 packs
- Test count: 2656 → 3311
- Website stats updated across all surfaces
- CLI formatting module (`src/cliFormat.ts`) shared across init, quickscore, doctor
- Dashboard rebuilt from ground up (v11) with Linear/Vercel aesthetic

### Fixed

- All 44 TypeScript errors in API routers resolved
- Website hero-tag, capability strip, and install tab stats synchronized
- Dashboard light mode contrast and accessibility improvements
