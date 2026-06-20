import { amcVersion } from "../version.js";
import type { DiagnosticQuestionSetInfo, TrustTier } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { DEFAULT_QUESTION_SET_VERSION } from "../diagnostic/questionSets.js";
import { questionBank } from "../diagnostic/questionBank.js";

export const AMC_PUBLIC_METHODOLOGY_ID = "amc-public-scoring-methodology";
export const AMC_PUBLIC_METHODOLOGY_VERSION = "2026.06.20-r210";
export const AMC_PUBLIC_METHODOLOGY_RELEASE_DATE = "2026-06-20";
export const AMC_PUBLIC_METHODOLOGY_DOC = "docs/SCORING_METHODOLOGY.md";
export const AMC_PUBLIC_METHODOLOGY_URL = "https://agentmaturity.co/methodology.html";

export interface PublicMethodologyManifest {
  id: string;
  version: string;
  releaseDate: string;
  status: "public";
  amcVersion: string;
  methodologyDoc: string;
  publicUrl: string;
  defaultQuestionSetVersion: string;
  questionSet: {
    version: string;
    title: string;
    questionCount: number;
    includedVersions: string[];
    default: boolean;
  };
  scoreScale: Array<{
    level: "L0" | "L1" | "L2" | "L3" | "L4" | "L5";
    numericRange: [number, number];
    label: string;
  }>;
  evidenceTrustTiers: Array<{
    tier: TrustTier | "OBSERVED_HARDENED";
    weight: number;
    publicMeaning: string;
  }>;
  formulas: {
    finalQuestionLevel: string;
    confidence: string;
    layerScore: string;
    overallScore: string;
    integrityIndex: string;
  };
  reportBindings: {
    diagnosticJsonField: "methodology";
    badgeQueryParams: string[];
    requiredAuditFields: string[];
  };
  evaluationModeTaxonomy: Array<{
    mode: string;
    surface: string;
    publicMeaning: string;
    proofBinding: string;
    limitation: string;
  }>;
  benchmarkMethodologyVersioning: {
    requiredAuditFields: string[];
    tracks: Array<{
      track: "static_offline" | "live_dynamic";
      publicMeaning: string;
      proofBinding: string;
      comparabilityRule: string;
    }>;
    changeTriggers: Array<{
      trigger: string;
      versionImpact: string;
      migration: string;
    }>;
  };
  methodologyVersioningAssurance: {
    id: string;
    sourceRef: string;
    sourcePattern: "metronous_local_telemetry_benchmark_calibration";
    publicMeaning: string;
    requiredAuditFields: string[];
    badgeQueryParams: string[];
    diagnosticFields: string[];
    proofBinding: string;
    failClosedRule: string;
    noCopyBoundary: string;
  };
  sutroBatchMethodologyAssurance: {
    id: string;
    sourceRef: string;
    sourcePattern: "sutro_unstructured_batch_inference_methodology";
    publicMeaning: string;
    requiredAuditFields: string[];
    badgeQueryParams: string[];
    diagnosticFields: string[];
    proofBinding: string;
    failClosedRule: string;
    noCopyBoundary: string;
  };
  agentBeltMethodologyAssurance: {
    id: string;
    sourceRef: string;
    sourcePattern: "agent_belt_reproducible_coding_agent_methodology";
    publicMeaning: string;
    requiredAuditFields: string[];
    badgeQueryParams: string[];
    diagnosticFields: string[];
    proofBinding: string;
    failClosedRule: string;
    noCopyBoundary: string;
  };
  scoreClaimBoundaries: Array<{
    boundary: string;
    appliesWhen: string;
    publicDisclosure: string;
    requiredEvidence: string;
    migration: string;
  }>;
  metricValidationGates: Array<{
    gate: string;
    defaultThreshold: string;
    appliesWhen: string;
    proofField: string;
    migration: string;
  }>;
  externalSourceVerificationPolicy: {
    requiredForExternalClaims: boolean;
    acceptedStatuses: string[];
    metadataOnlyBoundary: string;
    unavailableSourceGuidance: string;
    legalBoundary: string;
  };
  limitations: string[];
  changelog: Array<{
    version: string;
    date: string;
    summary: string;
    migration: string;
  }>;
  deprecationNotice: string;
  migrationGuidance: string[];
  changePolicy: string;
  hash: string;
}

export interface PublicMethodologyReference {
  id: string;
  version: string;
  releaseDate: string;
  methodologyDoc: string;
  publicUrl: string;
  hash: string;
  versioningAssuranceHash: string;
}

export interface PublicMethodologyReproducibilityPacket {
  schemaVersion: 1;
  id: string;
  generatedAt: string;
  status: "public";
  contentHash: string;
  methodology: PublicMethodologyReference & {
    amcVersion: string;
    defaultQuestionSetVersion: string;
  };
  sourcePaths: Array<{
    path: string;
    purpose: string;
  }>;
  questionBank: {
    version: string;
    title: string;
    questionCount: number;
    questionBankSha256: string;
    layerDistribution: Record<string, number>;
    questions: Array<{
      id: string;
      layerName: string;
      family: string | null;
      title: string;
      promptTemplate: string;
      options: Array<{
        level: number;
        label: string;
        meaning: string;
        observableSignals: string[];
        typicalEvidence: string[];
      }>;
      gates: Array<{
        level: number;
        requiredEvidenceTypes: string[];
        minEvents: number;
        minSessions: number;
        minDistinctDays: number;
        requiredTrustTier: string | null;
        acceptedTrustTiers: string[];
        mustInclude: unknown;
        mustNotInclude: unknown;
      }>;
      evidenceGateHints: string;
      upgradeHints: string;
      tuningKnobs: string[];
      questionSetVersion: string | null;
      surfaces: string[];
      assessmentLayers: string[];
      scoringWeight: number | null;
      activeByDefault: boolean | null;
    }>;
  };
  scoringFormulas: PublicMethodologyManifest["formulas"];
  evidenceTrustTiers: PublicMethodologyManifest["evidenceTrustTiers"];
  artifactReviewAlignment: Array<{
    source: string;
    url: string;
    retrievedAt: string;
    mapping: string;
  }>;
  fairAlignment: Array<{
    principle: "Findable" | "Accessible" | "Interoperable" | "Reusable";
    implementation: string;
  }>;
  reproductionCommands: string[];
  limitations: string[];
}

export interface PublicMethodologyCaseStudyDataset {
  schemaVersion: 1;
  id: string;
  generatedAt: string;
  status: "public-synthetic-sample";
  contentHash: string;
  methodology: PublicMethodologyReference & {
    amcVersion: string;
    defaultQuestionSetVersion: string;
    questionBankSha256: string;
  };
  datasetCard: {
    prettyName: string;
    license: "MIT";
    language: string[];
    taskCategories: string[];
    tags: string[];
    rowCount: number;
    format: "json";
    summary: string;
    intendedUses: string[];
    outOfScopeUses: string[];
    privacyAndSafety: string[];
    limitations: string[];
    sources: Array<{
      title: string;
      url: string;
      retrievedAt: string;
      note: string;
    }>;
  };
  cases: Array<{
    caseId: string;
    synthetic: true;
    agentArchetype: string;
    industryContext: string;
    task: string;
    maturityLevel: 0 | 1 | 2 | 3 | 4 | 5;
    scoreOutOf100: number;
    confidence: "low" | "medium" | "high";
    evidenceProfile: string;
    includedQuestionIds: string[];
    layerScores: Record<string, number>;
    expectedReviewerUse: string;
    recommendedNextAction: string;
  }>;
  reproductionCommands: string[];
  limitations: string[];
}

const DEFAULT_QUESTION_SET_INFO: PublicMethodologyManifest["questionSet"] = {
  version: DEFAULT_QUESTION_SET_VERSION,
  title: "Default AMC assessment",
  questionCount: questionBank.length,
  includedVersions: [DEFAULT_QUESTION_SET_VERSION],
  default: true
};

function questionSetSummary(questionSet?: DiagnosticQuestionSetInfo): PublicMethodologyManifest["questionSet"] {
  if (!questionSet) {
    return DEFAULT_QUESTION_SET_INFO;
  }
  return {
    version: questionSet.version,
    title: questionSet.title,
    questionCount: questionSet.questionCount,
    includedVersions: [...questionSet.includedVersions],
    default: questionSet.default
  };
}

export function getPublicMethodologyManifest(questionSet?: DiagnosticQuestionSetInfo): PublicMethodologyManifest {
  const manifestWithoutHash = {
    id: AMC_PUBLIC_METHODOLOGY_ID,
    version: AMC_PUBLIC_METHODOLOGY_VERSION,
    releaseDate: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
    status: "public" as const,
    amcVersion,
    methodologyDoc: AMC_PUBLIC_METHODOLOGY_DOC,
    publicUrl: AMC_PUBLIC_METHODOLOGY_URL,
    defaultQuestionSetVersion: DEFAULT_QUESTION_SET_VERSION,
    questionSet: questionSetSummary(questionSet),
    scoreScale: [
      { level: "L0" as const, numericRange: [0, 0.99] as [number, number], label: "Initial" },
      { level: "L1" as const, numericRange: [1, 1.99] as [number, number], label: "Aware" },
      { level: "L2" as const, numericRange: [2, 2.99] as [number, number], label: "Managed" },
      { level: "L3" as const, numericRange: [3, 3.99] as [number, number], label: "Defined" },
      { level: "L4" as const, numericRange: [4, 4.74] as [number, number], label: "Measured" },
      { level: "L5" as const, numericRange: [4.75, 5] as [number, number], label: "Optimized" }
    ],
    evidenceTrustTiers: [
      {
        tier: "OBSERVED_HARDENED" as const,
        weight: 1.1,
        publicMeaning: "AMC-controlled adversarial or sandboxed evidence with cryptographic attestation."
      },
      {
        tier: "OBSERVED" as const,
        weight: 1,
        publicMeaning: "Captured runtime, gateway, ledger, trace, test, or artifact evidence."
      },
      {
        tier: "ATTESTED" as const,
        weight: 0.8,
        publicMeaning: "Third-party or signed evidence accepted after signature and integrity checks."
      },
      {
        tier: "SELF_REPORTED" as const,
        weight: 0.4,
        publicMeaning: "Owner or agent claims; capped and insufficient for high-confidence L4/L5 claims alone."
      }
    ],
    formulas: {
      finalQuestionLevel: "min(claimedLevel, supportedMaxLevel) * confidenceMultiplier",
      confidence: "min(1.0, evidenceCountFactor*0.4 + evidenceDiversityFactor*0.3 + evidenceRecencyFactor*0.2 + crossCorrelationFactor*0.1)",
      layerScore: "sum(questionFinalLevel * questionConfidence) / sum(questionConfidence)",
      overallScore: "sum(layerScore) / layerCount",
      integrityIndex: "hashChainIntegrity * evidenceCoverage * signatureValidity"
    },
    reportBindings: {
      diagnosticJsonField: "methodology" as const,
      badgeQueryParams: ["amc_methodology", "amc_methodology_hash", "amc_methodology_assurance"],
      requiredAuditFields: ["id", "version", "hash", "questionSet.version", "questionSet.questionCount", "methodologyVersioning.receiptHash"]
    },
    evaluationModeTaxonomy: [
      {
        mode: "maturity_score",
        surface: "Score",
        publicMeaning: "Evidence-weighted maturity level and layer scores for a configured question set and evidence window, including per-question explainability lenses when source-backed benchmark, performance-dashboard, retail-sales, hardware, code-quality, or scenario evidence is supplied.",
        proofBinding: "diagnostic.questionScores[], diagnostic.layerScores[], and optional questionExplainability rows such as Multi-User-LLM-Agent-style scenario, CL-Bench-style continual-learning stateful workflow, Hermes Turbo-style performance dashboard proof, CodeQuest-style evaluator/optimizer code-quality dimension proof, Adsum IoT Coder-style firmware hardware task, ShampooSalesAgent-style retail sales task, role, policy, trace, evaluator, metric, accepted/rejected evidence, repair-hint, and row-hash proof",
        limitation: "A maturity score is not a benchmark leaderboard and should not be compared without matching methodology, evidence windows, and per-question proof lenses for any source-backed scenario claims."
      },
      {
        mode: "metric_validation",
        surface: "Score, Shield",
        publicMeaning: "Reliability checks for maturity metrics, including validity, trace-evaluation proof, evaluator-suite proof, pentest/threat-model benchmark proof, persona-agent proof, MIRAGE-style RAG metric proof, Agentic Graph RAG metric proof, CoderCup-style coding-agent benchmark proof, ARIASHA/MiRAGE-style drug-repositioning metric proof, Legal Code RAG metric proof, GuardBench-style guardrail metric proof, NIKA-style network troubleshooting benchmark proof, InferenceBench-style inference optimization proof, Tavily-style web eval dataset proof, Parallel/OpenClaw-style research-skill proof, resume-RAG evaluator proof, Agentest-style scenario-test proof, OpenCode-lab-style reliability proof, cc-plugin-eval-style component-trigger proof, Realign-style simulation proof, AcademiClaw-style academic-task proof, RAG chunking technique proof, SecureVibeBench-style secure-coding proof, HumanStudy-Bench-style participant-simulation proof, Legacy-Bench-style legacy-software proof, SubtleMemory-style relational-memory proof, RAGAS notebook metric-validity proof, Agent Bench-style Java coding-agent proof, BioAgentBench-style bioinformatics agent proof, MobileBench-style mobile-agent proof, sample size, confidence interval, and supplied gate coverage.",
        proofBinding: "diagnostic.metricValidation.rows[] and diagnostic.metricValidation.evalPack.rows[], including typed MIRAGE-style base/oracle/mixed RAG metric proof, Agentic Graph RAG source/no-license/default-branch/README/graph-orchestrator/RAG/database/vector-store/evaluation/experiment-tracking/UI/dependency proof, CoderCup-style source/license/homepage/default-branch/README/contributing/CI/package-lock/task-spec/test-suite/runner-contract/score-ledger/live-artifact/methodology/reference/cost-accounting proof, ARIASHA/MiRAGE-style drug-repositioning dataset/split/mapping/feature/similarity/negative-sampling/classifier/score/evaluation/case-study proof, Legal Code RAG legal-corpus/Legifrance/retrieval/evaluation proof, GuardBench-style guardrail metric proof, NIKA-style network scenario/topology/incident/tool/metric proof, InferenceBench-style scenario/hardware/server/backend/gate/relaunch/latency/throughput proof, Tavily-style subject/query/search-provider/retrieved-document/filter/QA/export/freshness/grounding proof, resume-RAG evaluator source/license/upload/parser/job-description/RAG-strategy/query-expansion/retrieval/vector-store/Ollama/embedding/endpoint/rating/batch/privacy/dependency proof, Agentest-style source/repository/license/endpoint/scenario/persona/goal/knowledge/tool-mock/turn/trajectory/judge/comparison/CI/result proof, OpenCode-lab-style source/lab/context/prompt/tool/AGENTS/repeated-run/fork-agreement/model-variance/ground-truth/result proof, cc-plugin-eval-style source/repository/license/plugin/component/trigger/scenario/transcript/detection/judge/conflict/checkpoint/cost/CI/result proof, Realign-style source/repository/license/YAML-config/app-under-test/dataset/scenario/persona/evaluator/target/simulation-trace/repeated-run/judge-calibration/statistics/CI/experiment/result proof, AcademiClaw-style source/license/default-branch/task-corpus/bilingual-task/workspace-query/Docker/rubric/eval-runner/result/conversation-trace/meta-eval/model-roster/metric/CI proof, IBM/rag-chunking-techniques-style source/license/default-branch/README/policy-corpus/simple-RAG-notebook/smart-chunking-notebook/RAG-evaluation-notebook/chunking-strategy/retrieval-pipeline/embedding-vectorstore/evaluation-dataset/metric/CI proof, hariohmprasath/k8s-ai-style source/license/default-branch/README/release/build-workflow/agent-module/MCP-server/Kubernetes-tool-inventory/diagnostic/resource/log-analysis/metric/CI proof, iCSawyer/SecureVibeBench-style source/license/homepage/default-branch/README/results/dataset/format/evaluation-runner/agent-adapter/vulnerability-scenario/test-script/parser/patch-diff/metric/CI proof, HumanStudy-Bench-style source/default-branch/study-config/participant-background/human-response/agent-response/evaluator/metric/validator/scorer/standardizer/reliability/validation-pipeline/CI proof, Legacy-Bench-style source/license/default-branch/readme/task-corpus/legacy-language/environment/harness/agent-task/patch/test-oracle/evaluator/metric/CI/result/replay proof, SubtleMemory-style source/license/default-branch/arXiv/Hugging-Face/persona/bench-instance/history-session/relation-taxonomy/construction/evaluation-stage/adapter/judge/score-summary/diagnostic/CI proof, RAGAS notebook source/no-license-boundary/notebook/dependency/document/chunking/testset/evolution/RAG-chain/retriever/vectorstore/model/embedding/answer-context/RAGAS-metric/LangFuse/visualization/owner/sample-CI proof, Agent Bench-style Java task/YAML/sandbox/jury/Maven/JUnit/JaCoCo/result/pass@k proof, and BioAgentBench-style task/dataset/truth/workflow/grader/perturbation/privacy proof when supplied",
        limitation: "Validation gates only prove the supplied checks; absent checks remain warnings unless a lifecycle policy requires them."
      },
      {
        mode: "benchmark_replay",
        surface: "Shield, Watch",
        publicMeaning: "Replayable benchmark corpus rows with hashes, source refs, signed evidence refs, optional red-team benchmark regression receipts, optional model-harness task-slice receipts, optional TerminalWorld-style public terminal recording, Docker environment, state-test, and trial-validation receipts, optional comparative coding-agent report receipts, optional benchmark-hackability audit receipts, optional SkillBench-style with/without-skill regression receipts, optional effect-autoagent-style declarative agent benchmark replay receipts, optional Agent Workflow Kit-style workflow replay receipts, optional MedAsk-style clinical diagnostic and triage benchmark receipts, optional BioKGBench-style biomedical KG checking, KGQA, and SCV replay receipts, optional BioMedArena-style biomedical harness replay receipts, optional Polymath-style logic benchmark receipts, optional ML-development workflow receipts, optional Text2SQL business-database receipts, optional AgentBench-style config-pinned agent benchmark receipts, optional AI-agent benchmark comparison replay receipts, optional PaperArena-style scientific-literature tool-use replay receipts, optional Social Reasoning Bench social-domain replay receipts, optional BestTester QA-agent replay receipts, optional AgentKernelArena-style GPU-kernel replay receipts, optional LLM Evaluation System-style jury scoring replay receipts, optional InnovatorBench-style LLM research replay receipts, optional Rag-Eval-flow-style local RAG pipeline replay receipts, optional rag-eval-style document QA dataset and endpoint ranking replay receipts, optional MiRAGE-style multimodal multihop RAG dataset-generation replay receipts, optional Encourage-style modular RAG replay receipts, optional ResearchHarness-style tool-using harness baseline receipts, optional Agent_Mont-style monitoring replay receipts, optional MiniAppBench-style interactive HTML browser replay receipts, optional FIRE-style atomic-claim fact-checking replay receipts, optional Nuclia-style RAG-triad replay receipts, optional Edge AI agent on-device replay receipts, optional DeepMath-style math-agent replay receipts, optional JudgeIt-style LLM-as-judge replay receipts, optional BenchLoop-style local benchmark replay receipts, optional scenario-simulation action-level replay receipts, optional warehouse-native LLM eval replay receipts, optional AD-GEN-style SOC dataset replay receipts, optional DocThinker-style document and multimodal RAG memory replay receipts, optional CloneMem-style non-conversational long-term-memory replay receipts, optional FreshStack-style IR/RAG retrieval replay receipts, optional DB context enrichment replay receipts, optional RAG chunking-strategy receipts, optional Azure agent-lab replay receipts, optional environment-generation harness receipts, optional progressive-search deep-research receipts, optional Advanced RAG notebook replay receipts, optional GAGE-style unified evaluation receipts, and optional VLA/world-model replay receipts.",
        proofBinding: "benchmark eval-pack manifests, row hashes, red-team benchmark id/version/question-set/reference-answer/scoring/backend/model/result/prompt-optimization/release-gate receipts, PawBench-style model/harness/task/grader/transcript/submission/replay receipts, TerminalWorld-style source/repository/paper/dataset/license/public-recording/metadata/privacy-filter/quality-filter/task-instruction/reference-solution/Docker/environment/state-test/AllPassing/Nop/Partial/result/replay/CI receipts, comparative coding-agent report/source-material/standardized-prompt/agent-roster/scoring-rubric/category-score/implementation/screenshot/report-artifact/replay receipts, benchmark-hackability scanner/source/task/audit-config/phase-trace/static-tool/AI-inspection/vulnerability-finding/dashboard/report/replay/sandbox/PoC-validation receipts, SkillBench-style benchmark/source/skill/baseline-agent/with-skill-agent/eval-suite/eval-case/deterministic-grader/static-analysis/security-scan/output/rerun/report/replay/release-gate receipts, effect-autoagent-style source/license/default-branch/README/package/lockfile/CI/benchmark-runner/harness/task-spec/metrics/experiment-log/blueprint/runner/result/trajectory/container/task-fixture/Docker/replay-command/seed/score-delta/CI receipts, Falcon Evaluate-style source/license/default-branch/release/package/lockfile/requirements/README/docs/workflow/modules/metric-family/provider-route/canary-result/drift-statistic/alert receipts, Agent Workflow Kit-style source/repository/license/guide/skill-package/template/risk-scoring/workflow-level/spec-layer/approval/verification-command/docs-check/evaluation/replay receipts, MedAsk-style source/repository/license/requirements/setup/SymptomCheck-vignette/Triage-vignette/evaluation-script/patient-simulator/model-config/result/paired-analysis/run-command/replay-command receipts, BioKGBench-style source/repository/paper/license/dataset-release/knowledge-graph/task-manifest/KGCheck/KGQA/SCV/agent/RAG/Neo4j/evaluation/result/error-discovery/replay/CI receipts, BioMedArena-style source/repository/license/README/pyproject/config/matrix/harness/CLI/benchmark-config/eval-suite/adapter-registry/tool-registry/vendor-manifest/baseline/result/replay/CI receipts, Polymath-style logic benchmark dataset/access/license/environment/inference/tool/replay/output/evaluator receipts, ML-development benchmark/version/paper/task-suite/task/config/workspace/runtime/dependency/agent/Calipers/Hydra/metrics/scoring/validation/replay/report/trace receipts, Text2SQL benchmark/version/source/dataset/database/schema/query/reference-SQL/result/agent/model/tool/schema-memory/retrieval/governance/security/audit/policy/execution/replay receipts, AgentBench-style benchmark/version/paper/repository/dataset/agent/global/model-server/environment/dependency/run/replay/trace/result/metric receipts, AI-agent benchmark comparison source/repository/license/agent-roster/benchmark-dataset/source-manifest/pricing/user-report/leaderboard/score/eval-pack/fixture/replay/result/score-delta/CI receipts, PaperArena source/no-license/README/requirements/config/runner/scorer/Hugging-Face-dataset/paper-QA/tool/RAG/reflector/run-script/result/score/replay/CI receipts, Social Reasoning Bench source/repository/license/README/pyproject/lockfile/data/docs/experiments/outputs/packages/scripts/runner/collector/validation/workflow/result/CI/domain/package/scenario replay receipts, BestTester source/repository/license/README/package/lockfile/TypeScript/Playwright/test-tree/agent/MCP/security-fuzzer/Jira-Slack/workflow/result/CI/capability/test-surface/agent-role replay receipts, AgentKernelArena-style source/repository/license/task-manifest/task-config/workspace-isolation/GPU-profile/agent-roster/compile/correctness/performance/result/replay/CI receipts, LLM Evaluation System-style source/repository/license/package/MCP-install/dataset/synthetic-QA/document-grounding/judge-config/jury-roster/binary-scoring/execution/OpenTelemetry/Bedrock/result/analysis/PDF/S3/replay/CI receipts, InnovatorBench-style source/repository/license/paper/Hugging-Face-dataset/task-manifest/task-config/ResearchGym/agent/tool-registry/workspace-dataset-path/environment/Docker-web/multi-GPU-node/checkpoint/execution/result/metric/score-report/replay/CI receipts, Rag-Eval-flow-style source/repository/license/pipeline-config/data-source/model/judge/metric-definition/prompt-template/eval-pack/fixture/replay/result/score-delta/CI receipts, rag-eval-style source/repository/license/input-document/processor/prompt/generator/QA-dataset/endpoint/response/ranking/evaluation/replay/CI receipts, MiRAGE-style source/repository/license/input-document/semantic-chunk/multihop-context/role-manifest/generate-select-verify-correct/multimodal-carrier/backend/embedding/reranker/token-usage/checkpoint/deduplication/evaluation/replay/output-dataset/visualization receipts, Encourage-style source/repository/license/package/dependency/RAG-method/inference-runner/template/vector-DB/dataset/query/reference-answer/metric-suite/MLflow/result/replay/CI receipts, ResearchHarness-style source/repository/license/runtime-contract/tool-surface/native-tool-call/OpenAI-compatible-API/workspace-boundary/trace/benchmark-adapter/baseline-harness/meta-harness/model-provider/evaluation/replay/context-compaction/human-interaction receipts, Agent_Mont-style source/repository/license/monitoring-config/framework/agent/task/run/token/cost/latency/resource/carbon/log/visualization/metric/replay receipts, MiniAppBench-style source/repository/license-review/dataset/query-set/evaluation-reference/generated-app/generated-source/live-instance/browser-automation/interaction-rubric/render-report/dynamic-interaction/result/replay/CI receipts, FIRE-style source/repository/paper/dataset/atomic-claim/retriever/verifier/decision-policy/search-provider/evidence/query/label/cost/result/replay/CI receipts, Nuclia-style RAG-triad source/repository/license/package/model-card/model-cache/Hugging-Face-auth/evaluator/dataset/QA-context/metric/answer-relevance/context-relevance/groundedness/result/replay/CI receipts, Edge AI agent source/repository/license/device-profile/runtime/optimization/dataset/task/application-scenario/replay/metric receipts, DeepMath-style repository/source/model/GRPO/vLLM/agent-interface/sandbox/executor/dataset/evaluation/inference/training/output/metric/replay receipts, JudgeIt-style repository/dataset/golden-text/generated-text/pipeline/judge-model/judge-rubric/human-eval/evaluation/batch/export/metric/replay receipts, BenchLoop-style repository/package/suite/task/frozen-task/scorer/harness/provider/endpoint/model/machine/dependency/run/output/metric/agent-loop/tool-call/token-latency/persistence/export/replay receipts, scenario-simulation repository/source/scenario-project/scene/role/agent-roster/human-policy/LLM-config/evaluator/action-schema/task-dataset/web-UI/server/container/persistence/checkpoint/run/event-log/action-trace/evaluation-report/visualization/replay receipts, warehouse-native LLM eval benchmark/source/dbt-project/package-lock/warehouse-adapter/warehouse-AI-function/model/capture/prompt-input-output-schema/baseline-version/criteria/judge/sampling/threshold/raw-capture/raw-baseline/judge-evaluation/score/performance/drift/alert/compiled-SQL/run-result/no-egress/replay receipts, AD-GEN-style repository/release/source-corpus/LAB-dataset/REAL-dataset/conversion-script/labeling-prompt/output-schema/ATT&CK-mapping/action-schema/validation/label-quality/cross-model-audit/license/replay receipts, DocThinker-style repository/paper/license/document-corpus/text-carrier/image-text-carrier/PDF-processing/query/unanswerable-query/complexity-router/routing-decision/perception/reasoning/session-KG/KG-expansion/memory-policy/memory-recall/retrieval/generation/observability/eval/metric/report/environment/dependency/replay receipts, CloneMem-style repository/source/license/persona/digital-trace/question/evidence/temporal-split/bilingual/evaluation/baseline/memory-system/result/replay receipts, FreshStack-style repository/paper/query-dataset/corpus-dataset/StackOverflow-query/GitHub-corpus/license/BEIR/qrels/chunking/retriever/index/runfile/evaluator/metric/leaderboard/replay receipts, DB context enrichment repository/extension/database-schema/schema-discovery/context-set/template/facet/value-search/golden-dataset/Evalbench/LLM-rater/evaluation/failure-case/hill-climb/mutation/final-validation/replay receipts, RAG chunking-strategy benchmark/version/source/document/question/reference-answer/chunker/config/embedder/keyword-index/fusion/retrieval/scoring/report/export/replay receipts, Azure agent-lab module/service/cloud/evaluator/replay receipts, ClawEnvKit-style task/mock-service/audit/trajectory/harness/safety receipts, DeepResearch-style workflow/context/search/tool/cross-evaluation/report receipts, Advanced RAG course/lesson/notebook/output/environment/dependency/corpus/index/query/reference-answer/retrieval/generation/eval/observability/replay/triad receipts, GAGE-style engine/config/registry/dataset/backend/adapter/metric/output/events/samples/summary/artifact/replay receipts, and VLA world-model taxonomy/model/dataset/benchmark/metric/environment/trajectory/simulator/reward/policy/replay receipts when supplied",
        limitation: "Replay evidence supports the sampled benchmark corpus, not unobserved tasks outside the declared corpus."
      },
      {
        mode: "live_drift",
        surface: "Watch",
        publicMeaning: "Baseline-to-live behavior comparisons with drift statistics, alerts, PIArena-style prompt-injection proof, BackdoorAgent-style backdoor proof, agent-security control proof, agent-testing methodology proof, chaos-reliability proof, ADK runtime proof, PhysicianBench-style clinical EHR proof, 12-technique evaluator proof, Decibench voice-agent testing proof, RAIL Score responsible-AI guardrail proof, SAP agent-evaluation tutorial proof, agent-evaluation observability proof, agent-eval-harness proof, Strands benchmark-harness proof, web-agent privacy proof, RAG QA dataset-builder proof, KITE-style end-to-end RAG benchmark proof, PokerEval-style partial-information poker simulation proof, CPU-agentic workload performance proof, Ollama-metrics-style local LLM proxy/Prometheus proof, Recovery-Bench-style recovery proof, Darwin Godel Machine-style self-improving-agent score-movement proof, web-operator evaluation proof, Navi-Bench-style real-website web-agent proof, legal-agent process proof, ResearchGym-style research-run proof, OSUniverse-style GUI-navigation proof, LLM/RAG multi-metric eval-suite proof, NoMIRACL-style multilingual RAG relevance proof, SLDBench-style scaling-law discovery proof, local-system monitor proof, and waivers.",
        proofBinding: "live drift alert receipts, signed sample evidence, and typed PIArena-style prompt-injection, BackdoorAgent-style stage-aware backdoor, agent-security control, agent-testing methodology, chaos-reliability, ADK runtime, PhysicianBench-style clinical EHR, eval-technique, Decibench source/license/default-branch/release/README/pyproject/CI/CLI/MCP/RAG/evaluator/audio/scenario/baseline-live-result/drift-statistic/alert/no-transcript-copy evidence, RAIL Score source/package/release/client/policy/middleware/telemetry/compliance/agent/integration/baseline-live-result/drift-statistic/alert evidence, SAP agent-evaluation objective/process/enterprise-context/notebook/dataset/log/metric/tooling/policy evidence, agent-evaluation observability source/config/dataset/prompt/model/RAG/metric/result/telemetry evidence, agent-eval-harness source/trace/adapter/metric evidence, Strands benchmark-harness source/config/task/runtime/trajectory/patch/test evidence, web-agent privacy, RAG dataset-builder, KITE-style corpus/query/ground-truth/rubric/pipeline/response/result/judge/grade evidence, PokerEval-style package/citation/simulation/agent/opponent-pool/run/hand-history/metric-report/KPI evidence, CPU-agentic workload, Ollama-metrics-style local LLM proxy/Prometheus, Recovery-Bench-style failure replay/recovery, Darwin Godel Machine source/controller/archive/self-modification/evaluation/sandbox/live-run/benchmark/lineage/score-movement evidence, web-operator, Navi-Bench real-website task/config/evaluator/browser/result/trajectory/visualization/score-bound evidence, legal-agent, ResearchGym-style research-run, OSUniverse-style GUI-navigation, LLM/RAG eval-suite, NoMIRACL-style multilingual RAG relevance, SLDBench-style scaling-law discovery, local-system monitor, and observability evidence when supplied",
        limitation: "Live drift windows can lag fast incidents until enough samples arrive."
      },
      {
        mode: "provider_drift",
        surface: "Watch, API",
        publicMeaning: "Provider/model canary comparisons across versions, capability slices, evaluator-library proof, observability-pipeline proof, geospatial tool-calling proof, AgentDefense-Bench MCP security-defense proof, and evaluator reliability signals.",
        proofBinding: "provider drift benchmark eval-pack rows, evaluator-framework proof fields, observability pipeline provenance fields, geospatial task/dataset/tool/trace/judge proof fields, AgentDefense-Bench source/MCP/attack/defense/run/drift/alert proof fields, and Watch alert projections",
        limitation: "Provider drift receipts should disclose canary family, evaluator framework/version, observability pipeline, geospatial benchmark identity when used, AgentDefense-Bench MCP security-defense identity when used, metric suite, sample size, and waiver state before procurement or compliance use."
      },
      {
        mode: "security_guardrail",
        surface: "Shield, Enforce",
        publicMeaning: "Policy, red-team, and guardrail evidence tied to observed actions and signed artifacts.",
        proofBinding: "shield findings, enforce receipts, and vault evidence refs",
        limitation: "Guardrail evidence does not guarantee safety for attacks or policies outside the configured tests."
      },
      {
        mode: "methodology_binding",
        surface: "Passport, Badge, API, Docs",
        publicMeaning: "Public methodology id, version, hash, question-set binding, changelog, limitations, migration guidance, Metronous-style local telemetry benchmark calibration assurance, Sutro-style batch methodology assurance, Agent Belt-style reproducible coding-agent eval methodology assurance, RSS market-impact alert methodology assurance, SecureVibeBench-style secure-coding metric-validity assurance, Awesome-AI-Evaluation-Guide-style evaluation methodology assurance, and Critic Rubrics rubric-supervised critic methodology assurance.",
        proofBinding: "diagnostic.methodology, diagnostic.methodologyVersioning, badge query params, methodology manifest hash, methodology-versioning assurance hash, Sutro batch methodology assurance hash, Agent Belt source/repository/license/release/scenario/scorer/agent-adapter/worktree/Docker/CI/pass^k proof, RSS market-impact feed/model/prompt/schema/dedupe/analysis/push/rate-limit/outcome/backtest proof, iCSawyer/SecureVibeBench source/license/homepage/default-branch/README/results/dataset/format/evaluation-runner/agent-adapter/scenario/test-script/parser/patch-diff/metric/CI proof, hparreao/Awesome-AI-Evaluation-Guide source/license/default-branch/README/benchmark-guide/tools-platforms/metric-selection/threshold/calibration/component-trace/human-review/cost-control/deprecation/migration proof, and OpenHands/critic-rubrics source/repository/no-license, arXiv, release, rubric feature taxonomy, type-safe function-calling schema, sparse-outcome proxy, reranking, early-stopping, signed-evidence, and row-hash proof",
        limitation: "Historical artifacts should be preserved and compared by their embedded methodology version instead of overwritten."
      }
    ],
    benchmarkMethodologyVersioning: {
      requiredAuditFields: [
        "corpusVersion",
        "harnessVersion",
        "modelPoolVersion",
        "tierPolicyVersion",
        "verificationProtocolVersion",
        "scoringFormulaVersion",
        "costAccountingVersion",
        "telemetrySchemaVersion",
        "calibrationProtocolVersion"
      ],
      tracks: [
        {
          track: "static_offline" as const,
          publicMeaning: "Fast replay or label-based benchmark evidence used for iteration, regression gates, and offline comparison.",
          proofBinding: "benchmark manifests, metric-validation eval packs, provider-drift eval packs, and row hashes",
          comparabilityRule: "Compare only when corpus, harness, model-pool, tier-policy, verification-protocol, scoring, and cost-accounting versions match or a migration note is attached."
        },
        {
          track: "live_dynamic" as const,
          publicMeaning: "End-to-end execution evidence from a running agent, provider, tool, or environment window.",
          proofBinding: "live drift receipts, Watch alerts, signed runtime evidence, and Shield verification receipts",
          comparabilityRule: "Do not substitute for static offline evidence; compare only with matching environment, provider/model, cost-accounting, and evidence-window declarations."
        }
      ],
      changeTriggers: [
        {
          trigger: "corpus_or_question_set_change",
          versionImpact: "Increment corpus or question-set version and publish methodology migration guidance when public score semantics change.",
          migration: "Regenerate affected reports before external comparison."
        },
        {
          trigger: "harness_or_environment_change",
          versionImpact: "Increment harness version and bind the environment snapshot to benchmark and live receipts.",
          migration: "Attach a waiver or rerun old and new harnesses side by side before claiming trend continuity."
        },
        {
          trigger: "model_pool_or_tier_policy_change",
          versionImpact: "Increment model-pool or tier-policy version because cost, capability, and routing labels are no longer directly comparable.",
          migration: "Publish the old and new pool/tier mapping hashes and regenerate provider or replay receipts."
        },
        {
          trigger: "verification_protocol_or_scoring_change",
          versionImpact: "Increment methodology version when pass predicates, evaluator gates, score formulas, or cost accounting change.",
          migration: "Preserve historical artifacts and create a fresh report or benchmark receipt under the new methodology."
        },
        {
          trigger: "metronous_telemetry_calibration_methodology_change",
          versionImpact: "Increment methodology, telemetry-schema, benchmark-corpus, threshold-policy, calibration-protocol, export-sanitization, and badge-assurance versions when Metronous-style local telemetry, benchmark aggregation, model calibration, archive, cost, or report-binding semantics change.",
          migration: "Regenerate badges and reports before comparing kiosvantra/metronous-style, local AI agent telemetry, benchmark, threshold, model calibration, OpenCode-agent, local archive, or methodology-versioning claims."
        },
        {
          trigger: "tournament_or_leaderboard_protocol_change",
          versionImpact: "Increment harness, verification-protocol, and scoring versions when tournament format, opponent pool, generation count, seed policy, ranking aggregation, replay protocol, or leaderboard publication rules change.",
          migration: "Rerun or dual-run the old and new tournament protocols before comparing leaderboard positions, strategy-coding rankings, or iterative-learning deltas."
        },
        {
          trigger: "multimodal_rag_corpus_or_metric_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when multimodal RAG text/image collection, extraction or filtering, modality representation, retrieval or element-selection protocol, output-image policy, evaluator rubric, judge model, or text/image metric definitions change.",
          migration: "Dual-run old and new modality coverage and regenerate badges or reports before comparing M2RAG-style mixed text/image scores."
        },
        {
          trigger: "rag_audit_dataset_or_diagnosis_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when RAG audit QA generation, support-span grounding, endpoint contract, judge model, detailed metric definitions, failure-diagnosis taxonomy, retriever/generator attribution, privacy mode, MCP/server telemetry boundary, report export, or threshold semantics change.",
          migration: "Regenerate badges or reports before comparing RagScore-style RAG audit, generated-QA, detailed-metric, failure-diagnosis, or privacy/local-cloud RAG evaluation claims."
        },
        {
          trigger: "legal_code_rag_metric_validity_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when Legal Code RAG corpus/source boundaries, Legifrance ingestion, vector database, embedding model, windowing, hybrid-search, query-rewrite, routing, evaluation dataset, reference-answer, evaluator, metric, owner, or sample/CI semantics change.",
          migration: "Regenerate badges or reports before comparing HamzaG737/legal-code-rag-style, Legal Code RAG, French legal-code RAG, Legifrance-backed RAG, Qdrant-backed RAG, windowing, hybrid-search, query-rewrite, routing, or legal RAG metric-validity claims."
        },
        {
          trigger: "soc_dataset_schema_or_label_quality_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when SOC dataset source corpus, LAB/REAL split, conversion script, labeling prompt, output schema, ATT&CK mapping, action schema, validation, label-quality, cross-model audit, license boundary, replay pass-rate, or threshold semantics change.",
          migration: "Regenerate badges or reports before comparing AD-GEN-style SOC dataset replay, ATT&CK narrative, LLM SOC automation, validated synthetic label, or endpoint telemetry benchmark claims."
        },
        {
          trigger: "network_troubleshooting_metric_or_scenario_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when network troubleshooting scenario inventory, topology tiers, incident catalog, fault injection, agent/tool interface, environment runtime, metric definitions, judge config, ground truth, batch summary, or sample/CI semantics change.",
          migration: "Regenerate badges or reports before comparing NIKA-style network troubleshooting, dynamic network incident, topology-tier, root-cause, localization, MCP/tool, or batch-evaluation metric-validity claims."
        },
        {
          trigger: "inference_optimization_metric_validity_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when open-ended inference optimization benchmark identity, scenario objectives, hardware budget, server contract, runtime backends, search space, baseline comparison, quality or integrity gate, clean relaunch, latency/throughput/tail metrics, exploration trace, owner, or sample/CI semantics change.",
          migration: "Regenerate badges or reports before comparing InferenceBench-style, inference-serving optimization, TTFT, TPOT, throughput, multi-objective, quality-gated, integrity-gated, or clean-relaunch metric-validity claims."
        },
        {
          trigger: "java_coding_agent_metric_validity_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when Java coding-agent benchmark identity, source/license boundary, Java task inventory, YAML benchmark format, workspace template, sandbox isolation, lifecycle trace, CLI-agent config, cascaded jury, judge tier, Maven/JUnit/JaCoCo checks, result manifest, accuracy/pass@k metrics, owner, or sample/CI semantics change.",
          migration: "Regenerate badges or reports before comparing spring-ai-community/agent-bench-style, Agent Bench, Java-centric coding-agent benchmark, YAML benchmark, isolated sandbox, cascaded judge, Maven, JUnit, JaCoCo, accuracy, or pass@k metric-validity claims."
        },
        {
          trigger: "web_eval_dataset_metric_validity_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when web evaluation dataset-generation benchmark identity, source repository boundary, subject inventory, generated-query manifest, search-provider config, retrieved-document corpus, filtering policy, QA generation, reference-answer set, dataset export target, freshness window, provider-diversity metric, source-coverage metric, answer-grounding metric, owner, or sample/CI semantics change.",
          migration: "Regenerate badges or reports before comparing Eyalbenba/tavily-web-eval-generator-style, Tavily-style, web-search RAG eval dataset, real-time web retrieval, generated-query, QA-pair, local export, LangSmith export, source-coverage, freshness, or grounding metric-validity claims."
        },
        {
          trigger: "parallel_research_skill_metric_validity_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when Parallel/OpenClaw-style research-skill benchmark identity, source repository boundary, skill manifest, API surface taxonomy, search modes, deep-research processor tiers, chat grounding, extraction, citation provenance, source policy, batch execution, monitoring, security boundary, dependency lock, benchmark-claim validation, owner, or sample/CI semantics change.",
          migration: "Regenerate badges or reports before comparing mvanhorn/clawdbot-skill-parallel-style, Parallel.ai skill, OpenClaw research skill, web-search, extraction, deep-research task, grounded chat, source filtering, monitoring, batch task-group, citation, or benchmark-claim metric-validity claims."
        },
        {
          trigger: "resume_rag_evaluator_metric_validity_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when resume-RAG evaluator benchmark identity, source repository boundary, resume upload/parser format, job-description manifest, RAG strategy, query expansion, retrieval config, vector store, Ollama model, embedding model, evaluation endpoint, rating scale, batch mode, privacy boundary, dependency lock, owner, or sample/CI semantics change.",
          migration: "Regenerate badges or reports before comparing punyaa18/ollama-resume-parser-style, local Ollama resume parser, resume/job-description RAG evaluator, similarity/MMR/hybrid retrieval, query expansion, candidate rating, automatic/individual/bulk evaluation, or local privacy-boundary metric-validity claims."
        },
        {
          trigger: "chipbenchmark_metric_validity_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when ChipBenchmark-style hardware benchmark identity, repository snapshot, no-license boundary, benchmark manifest, hardware profile, model family, precision mode, environment setup, runner/serving scripts, result dataset, synced frontend dataset, pricing dataset, throughput/latency/cost metrics, regression thresholds, owner, or sample/CI semantics change.",
          migration: "Regenerate badges or reports before comparing wafer-ai/chipbenchmark-style, GPU/accelerator LLM benchmark, hardware profile, model-family, precision-mode, throughput, latency, pricing, or cost-efficiency metric-validity claims."
        },
        {
          trigger: "hermes_bench_metric_validity_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when Hermes Bench-style benchmark identity, source/license boundary, default-branch snapshot, README/build spec, backend runner, judge calibration, task registry, model/server config, adapter coverage, result schema, frontend review surface, backend/frontend regression, Docker runtime, owner, or sample/CI semantics change.",
          migration: "Regenerate badges or reports before comparing Bent-Solutions/hermes-bench-style, Hermes Bench, local LLM/agent benchmark UI, benchmark-runner, judge-calibration, adapter-coverage, task-registry, result-schema, frontend-review, or regression metric-validity claims."
        },
        {
          trigger: "cooperbench_metric_validity_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when CooperBench-style cooperative coding benchmark identity, source/no-license boundary, release tag, default-branch snapshot, README/changelog, dataset/task manifest, feature-conflict manifest, runner/coop harness, eval backend, team harness, agent-adapter roster, CI workflow, package lock, public report, owner, or sample/CI semantics change.",
          migration: "Regenerate badges or reports before comparing cooperbench/CooperBench-style, CooperBench, cooperative coding-agent benchmark, conflicting software task, team harness, agent-adapter roster, public report, cooperation-score, conflict-resolution, or regression metric-validity claims."
        },
        {
          trigger: "codercup_metric_validity_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when CoderCup-style coding-agent benchmark identity, source/license/homepage boundary, default-branch snapshot, README/contributing, CI workflow, package lock, task spec, test suite, runner contract, score ledger, live artifact, methodology/reference pages, cost accounting, owner, or sample/CI semantics change.",
          migration: "Regenerate badges or reports before comparing TestSprite/CoderCup-style, CoderCup, continuous public coding-agent benchmark, phase suite, runner contract, score ledger, TestSprite E2E verdict, live leaderboard, cost-accounting, or metric-validity claims."
        },
        {
          trigger: "agentic_graph_rag_metric_validity_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when Agentic Graph RAG evaluation identity, source/no-license boundary, default-branch snapshot, README, graph orchestrator, RAG pipeline, database/vector-store, evaluation metric, experiment-tracking, UI question surface, dependency lock, owner, or sample/CI semantics change.",
          migration: "Regenerate badges or reports before comparing mlvanguards/agentic-graph-rag-evaluation-cometml-style, Agentic Graph RAG, graph-RAG orchestrator, vector-store, experiment-tracking, UI-question, retrieval-grounding, or metric-validity claims."
        },
        {
          trigger: "kubernetes_operational_agent_metric_validity_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when Kubernetes operational-agent metric validity changes source/license, default-branch snapshot, README, release assets, build workflow, agent module, MCP server, Kubernetes tool inventory, diagnostic/resource/log-analysis, metric definition, CI, owner, or sample/CI semantics.",
          migration: "Regenerate badges or reports before comparing hariohmprasath/k8s-ai-style, Kubernetes operational agent, Kubernetes MCP agent, diagnostics, resource monitoring, smart log analysis, or operational-agent metric-validity claims."
        },
        {
          trigger: "secure_vibe_bench_metric_validity_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when SecureVibeBench-style secure-coding metric validity changes source/license/homepage refs, default-branch snapshots, README/results manifests, dataset or format examples, evaluation runners, agent adapters, vulnerability scenarios, test scripts, parser or patch-diff utilities, metric definitions, CI, owner, or sample/CI semantics.",
          migration: "Regenerate badges or reports before comparing iCSawyer/SecureVibeBench-style, SecureVibeBench, secure vibe coding, vulnerability-introducing scenario reconstruction, secure coding agent benchmark, adapter roster, scenario corpus, test-script, or metric-validity claims."
        },
        {
          trigger: "ai_evaluation_guide_methodology_change",
          versionImpact: "Increment methodology, scoring, badge, and report versions when Awesome-AI-Evaluation-Guide-style evaluation-methodology semantics change for source/license/default-branch snapshots, README guide manifests, benchmark taxonomy, tools/platforms taxonomy, metric-selection rules, thresholds, calibration, component traces, human-in-loop review, cost controls, deprecation notices, migration guidance, signed evidence, or row hashes.",
          migration: "Regenerate badges or reports before comparing hparreao/Awesome-AI-Evaluation-Guide-style, AI evaluation guide, LLM evaluation, RAG evaluation, agentic AI evaluation, benchmark taxonomy, tool taxonomy, metric-selection, threshold, calibration, trace, human-review, cost-control, deprecation, or migration methodology claims."
        },
        {
          trigger: "awesome_agent_memory_live_drift_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when Awesome-Agent-Memory-style source snapshot, no-license boundary, README blob, memory taxonomy, benchmark/evaluation manifest, baseline/live result, drift statistic, alert receipt, evidence coverage, or memory-category/task context semantics change.",
          migration: "Regenerate badges or reports before comparing wfnuser/Awesome-Agent-Memory-style, memory-system catalog, memory benchmark, retrieval, persistence, forgetting, hallucination, taxonomy, or agent-memory live-drift claims."
        },
        {
          trigger: "agent_reading_test_live_drift_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when Agent Reading Test-style source snapshot, license, homepage, README blob, answer key, task manifest, score form, live-site snapshot, raw content capture, canary evidence, baseline/live result, drift statistic, alert receipt, failure-mode, content-delivery, or context semantics change.",
          migration: "Regenerate badges or reports before comparing agent-ecosystem/agent-reading-test-style, Agent Reading Test, web-content reading, canary recall, truncation, SPA shell, tabbed content, content negotiation, redirect, header-quality, or agent documentation-reading live-drift claims."
        },
        {
          trigger: "ai_reputation_claude_live_drift_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when AI Reputation Claude-style source snapshot, no-license boundary, README, agent roster, skill catalog, install script, review-source manifest, sentiment pipeline, competitor benchmark, response policy, crisis playbook, PDF report template, baseline/live result, drift statistic, alert receipt, brand-safety metric, platform/task distribution, or context semantics change.",
          migration: "Regenerate badges or reports before comparing zubair-trabzada/ai-reputation-claude-style, AI Reputation Claude, brand reputation, review analysis, sentiment scoring, competitor benchmarking, review response, crisis playbook, PDF reputation reporting, hallucinated citation, PII leakage, or live reputation-management drift claims."
        },
        {
          trigger: "ctf_agent_benchmark_live_drift_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when FishCodeTech/ctf-agent-benchmark-style source snapshot, GPL license, README, challenge catalog, challenge manifest, Docker/runtime, compose, backend API, MCP tool, sidecar collector, agent template, scoring service, scoreboard, flag log, baseline/live result, drift statistic, alert receipt, CTF solve, first-flag-forwarding, contamination, independence, partial-credit, trace, sandbox, challenge-category, runtime, or context semantics change.",
          migration: "Regenerate badges or reports before comparing FishCodeTech/ctf-agent-benchmark-style, CTF agent benchmark, tool-use security benchmark, live flag-solving, MCP-integrated CTF, Docker challenge, sidecar-log, scoreboard, partial-credit, sandbox-isolation, or cybersecurity-agent live-drift claims."
        },
        {
          trigger: "llm_fighter_live_drift_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when neutree-ai/llm-fighter-style source snapshot, MIT license, homepage, README, API/UI trees, game-result endpoint, persistence schema, game engine, runner, LLM adapter, YAML export, UI component, baseline/live result, drift statistic, alert receipt, win-rate, game-score, action-validity, combat-stability, trace/export coverage, arena, ruleset, model-roster, or context semantics change.",
          migration: "Regenerate badges or reports before comparing neutree-ai/llm-fighter-style, LLM Fighter, combat-game agent evaluation, game-result API, battle log, YAML export, win-rate, game-score, action-validity, combat-stability, or live behavior-drift claims."
        },
        {
          trigger: "darwin_godel_machine_live_drift_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when lemoz/darwin-godel-machine-style source snapshot, no-license boundary, README, security, CI, controller, archive, self-modification, evaluation harness, scorer, sandbox, live-run config, benchmark manifest, score-movement manifest, lineage, provider/model route, score movement, pass rate, mutation acceptance, regression failure, evidence coverage, or context semantics change.",
          migration: "Regenerate badges or reports before comparing lemoz/darwin-godel-machine-style, Darwin Godel Machine, self-improving coding agent, population evolution, live score movement, sandboxed evolution, benchmark pass-rate, mutation acceptance, regression failure, or live behavior-drift claims."
        },
        {
          trigger: "agent_scenario_test_metric_validity_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when Agentest-style scenario-test benchmark identity, source repository/license boundary, agent endpoint contract, scenario manifest, simulated user persona, goal or knowledge manifest, tool mock, scripted turn, trajectory assertion, LLM judge metric, comparison run, CI reporter, result artifact, owner, or sample/CI semantics change.",
          migration: "Regenerate badges or reports before comparing r-prem/agentest-style, Agentest-style, scenario-based agent testing, simulated-user, tool-call mock, trajectory assertion, LLM-as-judge, comparison-mode, or CI reporter metric-validity claims."
        },
        {
          trigger: "opencode_lab_metric_validity_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when OpenCode-lab-style metric-validity evidence changes source reference, lab benchmark manifest, agent context, prompt variants, tool descriptions, AGENTS policy, repeated-run traces, fork agreement, model variance, ground-truth corrections, metric definitions, CI reporter, result artifacts, owner, or sample/CI semantics.",
          migration: "Regenerate badges or reports before comparing criterium/opencode-lab-style, OpenCode lab, determinism, context-assembly, prompt/tool/AGENTS provenance, fork-agreement, cross-model variance, or ground-truth-correction metric-validity claims."
        },
        {
          trigger: "cc_plugin_eval_metric_validity_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when cc-plugin-eval-style component-trigger evidence changes source repository or license boundary, plugin manifest, component inventory, trigger phrase manifest, scenario generation, scenario-type coverage, execution transcript, programmatic detection, LLM judge calibration, conflict detection, checkpoint/resume state, cost estimate, CI reporter, result artifact, owner, or sample/CI semantics.",
          migration: "Regenerate badges or reports before comparing sjnims/cc-plugin-eval-style, Claude Code plugin evaluation, component triggering, skill/agent/command activation, programmatic detection, LLM-judge calibration, checkpoint/resume, cost-estimate, or metric-validity claims."
        },
        {
          trigger: "bioinformatics_agent_metric_validity_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when bioinformatics agent benchmark identity, paper/source reference, task inventory, input dataset, truth/reference data, workflow reproduction, Docker or environment, tool-version, agent harness, grader config, result artifact, perturbation suite, privacy boundary, owner, or sample/CI semantics change.",
          migration: "Regenerate badges or reports before comparing BioAgentBench-style bioinformatics agent, RNA-seq, variant-calling, metagenomics, workflow-reproduction, perturbation-robustness, privacy-constrained, or grader-based metric-validity claims."
        },
        {
          trigger: "mirage_drug_repositioning_metric_validity_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when ARIASHA/MiRAGE-style drug-repositioning benchmark identity, dataset release, train/test split, drug-disease mapping, drug and disease feature sets, similarity matrices, hard-negative sampling, classifier config, feature selection, score calculation, evaluation report, case-study validation, owner, or sample/CI semantics change.",
          migration: "Regenerate badges or reports before comparing ARIASHA/MiRAGE-style, MiRAGE drug-repositioning, drug-disease association, biological-feature integration, hard-negative-mining, random-forest, feature-importance, score-calculation, or case-study metric-validity claims."
        },
        {
          trigger: "mobile_agent_metric_validity_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when mobile-agent benchmark environment, app inventory, API catalog, UI automation, task dataset, task-complexity grouping, multi-app task coverage, checkpoint rubric, reset/device-state fixture, result report, license boundary, or sample/CI semantics change.",
          migration: "Regenerate badges or reports before comparing MobileBench-style mobile-agent, Android automation, app/API/UI, multi-app collaboration, checkpoint-metric, or device-fixture metric-validity claims."
        },
        {
          trigger: "document_rag_memory_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when document or multimodal carrier manifests, PDF processing, query sets, complexity routing, perception/reasoning split, session KG, KG expansion, memory policy, recall traces, observability, metric definitions, replay command, or threshold semantics change.",
          migration: "Regenerate badges or reports before comparing DocThinker-style, document RAG, multimodal document QA, adaptive retrieval, session-KG, evolving memory, or image-text reasoning replay claims."
        },
        {
          trigger: "clonemem_long_term_memory_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when CloneMem-style source identity, digital-trace manifests, persona/question/evidence manifests, temporal split, bilingual coverage, task categories, memory-system comparison, replay command, score-delta, or threshold semantics change.",
          migration: "Regenerate badges or reports before comparing AvatarMemory/CloneMemBench-style, CloneMem, non-conversational digital-trace memory, bilingual long-term memory, temporal/emotional/opinion tracking, or AI-clone memory replay claims."
        },
        {
          trigger: "researchharness_agent_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when ResearchHarness-style tool-using agent harness contracts, tool surfaces, native tool-call traces, OpenAI-compatible API evidence, workspace boundary, trace format, benchmark adapter, provider matrix, baseline/meta-harness comparison, context compaction, human-interaction policy, replay pass-rate, or threshold semantics change.",
          migration: "Regenerate badges or reports before comparing InternScience/ResearchHarness-style, ResearchHarness, tool-using agent harness, OpenAI-compatible API, workspace-first execution, flat trace, benchmark-adapter, model-provider matrix, or personal-assistant runtime replay claims."
        },
        {
          trigger: "gto_wizard_poker_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when GTO Wizard-style poker-agent source identity, API-scope proof, no-solver policy, hand-history manifest, action trace, AIVAT metric, leaderboard context, legal-action rate, replay pass-rate, or threshold semantics change.",
          migration: "Regenerate badges or reports before comparing gtowizard-ai/researcher-api-client-style, GTO Wizard, NLTH poker-agent, API-key-gated, no-solver-access, hand-history, legal-action, AIVAT, leaderboard, or poker replay-corpus claims."
        },
        {
          trigger: "sap_agent_eval_tutorial_live_drift_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when SAP agent-evaluation tutorial source identity, objective taxonomy, evaluation-process taxonomy, enterprise context, notebook/dataset/log evidence, metric/tooling config, access/reliability/compliance policy, alert receipt, or threshold semantics change.",
          migration: "Regenerate badges or reports before comparing SAP-samples/llm-agents-eval-tutorial-style, enterprise agent evaluation, objective/process taxonomy, role-access, reliability, compliance, dynamic interaction, or live-drift claims."
        },
      {
        trigger: "agent_eval_observability_live_drift_change",
        versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when agent-evaluation observability source identity, agent config, eval dataset, prompt variant, model config, RAG index, metric config, baseline/live result, OpenTelemetry, Application Insights, Event Hub, Kusto, Fabric dashboard, alert receipt, metric-set, telemetry-channel, or threshold semantics change.",
        migration: "Regenerate badges or reports before comparing vladfeigin/llm-agents-evaluation-style, agent-evaluation observability, RAG quality monitoring, prompt/model variant evaluation, OpenTelemetry, Application Insights, Event Hub, Fabric/Kusto, or live-drift claims."
      },
      {
        trigger: "hedrarag_artifact_eval_live_drift_change",
        versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when HedraRAG artifact-eval source identity, license-status proof, workflow taxonomy, baseline-framework taxonomy, runtime context, artifact evidence, latency, throughput, memory, replay pass-rate, evidence coverage, or threshold semantics change.",
        migration: "Regenerate badges or reports before comparing Leo9660/HedraRAG_AE-style, HedraRAG, heterogeneous RAG, graph RAG, HyDE, multistep RAG, FlashRAG/LangChain/HedraRAG baseline, FAISS index, CUDA/GPU runtime, artifact-eval latency, throughput, memory, replay-pass, or live-drift claims."
      },
      {
        trigger: "agent_eval_harness_live_drift_change",
        versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when agent-eval-harness source identity, trace schema, collector/writer proof, adapter/framework taxonomy, trace mode taxonomy, metric context, dataset/task/tool manifests, hallucination/pricing/metrics config, baseline/live run proof, dashboard snapshot, local-storage policy, alert policy, tool-success, hallucination, latency, cost, trace coverage, evidence coverage, or threshold semantics change.",
        migration: "Regenerate badges or reports before comparing Siddharth-1001/agent-eval-harness-style local agent evaluation, structured traces, framework adapters, tool-success, hallucination detection, latency, cost, dashboard, CLI, or live-drift claims."
      },
      {
        trigger: "strands_benchmark_harness_live_drift_change",
        versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when Strands benchmark-harness source identity, repository or license proof, agent package, harness config, model route, prompt template, benchmark suite, runtime, task family, task manifest, dataset snapshot, Docker image, environment setup, tool policy, trajectory, patch artifact, test report, result/upload manifest, safety isolation, baseline/live run, alert policy, task-success, patch-apply, test-pass, trajectory/evidence coverage, latency, cost, distribution, or threshold semantics change.",
        migration: "Regenerate badges or reports before comparing strands-labs/benchmark-harnesses-style, Strands benchmark harness, SWE-Bench, Terminal-Bench, Docker/Harbor-isolated coding-agent, trajectory, patch, test-report, result-upload, or live-drift claims."
      },
      {
        trigger: "costnav_physical_navigation_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when CostNav-style physical navigation benchmark identity, scenario manifest, route graph, economic-cost model, simulator, trajectory, result, replay command, navigation success, replay pass-rate, economic-cost delta, or threshold semantics change.",
          migration: "Regenerate badges or reports before comparing worv-ai/CostNav-style, physical-navigation, route-graph, embodied-agent, simulator, trajectory, economic-cost, navigation-success, or benchmark replay claims."
        },
        {
          trigger: "terminalworld_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when TerminalWorld-style source identity, public recording provenance, task-synthesis proof, Docker reproduction proof, state-test validation, AllPassing/Nop/Partial trial semantics, verified-subset handling, replay pass-rate, or threshold semantics change.",
          migration: "Regenerate badges or reports before comparing EuniAI/TerminalWorld-style, TerminalWorld, public terminal recording, asciinema-derived, Docker environment, state-test, AllPassing/Nop/Partial, or terminal-agent replay-corpus claims."
        },
        {
          trigger: "agent_mont_monitoring_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when Agent_Mont-style agent monitoring framework support, token accounting, cost rate cards, latency/resource/carbon metrics, log capture, visualization artifacts, metric coverage, or replay thresholds change.",
          migration: "Regenerate badges or reports before comparing ansarifaisal12/Agent_Mont-style, Agent Mont, Agno or Crew AI monitoring, token/cost/latency/resource/carbon observability, CLI or Streamlit visualization, or monitored-agent replay claims."
        },
        {
          trigger: "miniappbench_interactive_html_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when MiniAppBench-style interactive HTML benchmark identity, query-set or withheld-reference policy, generated MiniApp/source-code artifact proof, live-instance harness, browser automation trace, interaction rubric, render/dynamic-interaction metrics, human-alignment, replay pass-rate, or score-delta semantics change.",
          migration: "Regenerate badges or reports before comparing MiniAppBench/miniappbench-style, MiniAppBench, MiniAppEval, interactive HTML generation, browser-automation evaluation, generated MiniApp, withheld-reference, or visual/dynamic interaction replay claims."
        },
        {
          trigger: "knowlytics_ai_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when Knowlytics-AI-style MCQ/RAG self-evaluation benchmark identity, no-license boundary, source snapshot, owned synthetic document corpus, quiz fixture, answer key, student response, evaluator rubric, retrieval/generation/scoring traces, provider-family coverage, replay pass-rate, retrieval coverage, evaluator-feedback coverage, or score-delta semantics change.",
          migration: "Regenerate badges or reports before comparing Sathyajitanand2004/Knowlytics-AI-style, Knowlytics-AI, MCQ generation, RAG self-evaluation, Streamlit quiz evaluation, targeted improvement feedback, or MCQ/RAG replay-corpus claims."
        },
        {
          trigger: "calibra_public_methodology_change",
          versionImpact: "Increment corpus, harness, model-pool, tier-policy, verification-protocol, scoring, cost-accounting, telemetry-schema, calibration-protocol, and methodology versions when Calibra-style coding-agent benchmark identity, source/license/homepage/default-branch snapshot, campaign config, campaign matrix, task fixture, agent instruction, model/provider matrix, skill/MCP/environment overlay, deterministic seed, budget policy, trial report, analysis report, comparison report, dashboard/export, changelog, deprecation, migration, or signed-evidence semantics change.",
          migration: "Regenerate badges or reports before comparing Swival/calibra-style, Calibra, coding-agent benchmark harness, campaign matrix, task fixture, model/provider ranking, skill/MCP/environment overlay, trial report, analysis report, comparison report, dashboard export, or public-methodology claims."
        },
        {
          trigger: "spent_session_cost_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when spent-style Claude Code session-cost benchmark identity, source/license boundary, hook config, JSONL log manifest, pricing snapshot, classifier rules, command transcript, dashboard export, privacy/no-telemetry proof, session/tool-event counts, efficiency delta, cost delta, replay pass-rate, classification coverage, or threshold semantics change.",
          migration: "Regenerate badges or reports before comparing loplop-h/spent-style, Claude Code session-cost tracking, efficiency score, productive/wasted classification, local JSONL logs, dashboard, JSON export, no-telemetry, or session-cost replay claims."
        },
        {
          trigger: "fire_fact_checking_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when FIRE-style atomic-claim fact-checking benchmark identity, source/paper boundary, dataset manifest, retriever/verifier configs, decision policy, search-provider config, evidence/query/label traces, cost report, factuality delta, LLM/search cost delta, replay pass-rate, evidence recall, label agreement, dynamic retrieval boundary, search-provider boundary, or threshold semantics change.",
          migration: "Regenerate badges or reports before comparing mbzuai-nlp/fire-style, FIRE, atomic-claim fact-checking, iterative retrieval and verification, dynamic retrieval-depth, Serper/search-provider, factuality, evidence recall, label agreement, or cost-efficiency replay claims."
        },
        {
          trigger: "nuclia_rag_triad_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when Nuclia-style RAG-triad benchmark identity, source/license boundary, package version, model card, model-cache policy, Hugging Face auth boundary, evaluator config, question-answer-context manifest, answer relevance, context relevance, groundedness, composite score, replay pass-rate, model-access boundary, no-raw-context-copy boundary, or threshold semantics change.",
          migration: "Regenerate badges or reports before comparing nuclia/nuclia-eval-style, Nuclia, REMi, RAG triad, answer relevance, context relevance, groundedness, model-cache, gated-model access, or RAG evaluation replay claims."
        },
        {
          trigger: "navi_bench_web_agent_live_drift_change",
          versionImpact: "Increment live-drift, verification-protocol, scoring, and methodology versions when Navi-Bench-style benchmark identity, source/license boundary, Hugging Face dataset ref, task-config/evaluator/browser proof, real-website domain taxonomy, crash-adjusted lower/excluding-crashed/upper score semantics, trajectory/visualization evidence, step-limit policy, or threshold semantics change.",
          migration: "Regenerate badges or reports before comparing yutori-ai/navi-bench-style, Navi-Bench, real-website web-agent, Apartments/Craigslist/OpenTable/Resy/Google Flights task, browser-provider, crash-adjusted score, trajectory, visualization, or web-agent live-drift claims."
        },
        {
          trigger: "agent_trial_statistical_question_explainability_change",
          versionImpact: "Increment scoring, question-set, verification-protocol, and methodology versions when AgentTrial-style statistical question-explainability semantics change for suite identity, package refs, adapter taxonomy, repeated-trial counts, Wilson confidence intervals, bootstrap cost/latency, failure attribution, regression comparison, reliability score, CI receipts, accepted/rejected evidence, repair hints, or row hashes.",
          migration: "Regenerate badges or reports before comparing alepot55/agentrial-style, AgentTrial, pytest-for-agents, repeated statistical agent trials, confidence intervals, failure attribution, regression detection, Agent Reliability Score, or statistical question-explainability claims."
        },
        {
          trigger: "codequest_quality_question_explainability_change",
          versionImpact: "Increment scoring, question-set, verification-protocol, and methodology versions when CodeQuest-style evaluator/optimizer question-explainability semantics change for source status, repository/license proof, code artifacts, evaluator prompts/configs, optimizer prompts/configs, baseline/candidate evaluations, feedback traces, improvement patches, actor-critic loop traces, regression suites, replay commands, CI receipts, dimension coverage, score deltas, no-source-copy boundaries, accepted/rejected evidence, repair hints, or row hashes.",
          migration: "Regenerate badges or reports before comparing jpmorganchase/CodeQuest-style, CodeQuest, code-quality evaluator/optimizer loops, actor-critic code-quality improvement, readability/security/maintainability/efficiency dimensions, or CodeQuest-style question-explainability claims."
        },
        {
          trigger: "agentkernelarena_gpu_kernel_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when AgentKernelArena-style GPU-kernel benchmark identity, task categories, agent roster, workspace isolation, GPU profile, compile/correctness/performance command evidence, speedup metric, A/B comparison, replay pass-rate, result coverage, CI receipt, or leaderboard-only boundary semantics change.",
          migration: "Regenerate badges or reports before comparing AMD-AGI/AgentKernelArena-style, AgentKernelArena, GPU-kernel optimization, HIP/Triton/Torch2HIP, compile-correctness-performance, workspace-isolated, A/B agent, speedup, or kernel benchmark replay claims."
        },
        {
          trigger: "llm_evaluation_system_jury_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when LLM Evaluation System-style source/package/MCP-install identity, dataset generation, synthetic QA, document-grounding, judge config, jury roster, binary scoring policy, execution trace, OpenTelemetry/Bedrock boundary, analysis/PDF report, S3 team-sharing, replay command, CI receipt, no-config-only boundary, no-report-only boundary, or no-synthetic-data-copy semantics change.",
          migration: "Regenerate badges or reports before comparing awslabs/llm-evaluation-system-style, LLM Evaluation System, MCP evaluation, jury scoring, binary criteria, document-grounded synthetic QA, Bedrock/OpenTelemetry agent evaluation, PDF report, S3 team-sharing, or multi-judge replay claims."
        },
        {
          trigger: "innovatorbench_research_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when InnovatorBench-style research benchmark identity, Hugging Face dataset ref, task/config taxonomy, ResearchGym workspace, tool surface, Docker/web backend, multi-GPU/node setup, checkpoint restore, execution/result metrics, score report, replay command, CI receipt, leaderboard-only boundary, or dataset-copy boundary semantics change.",
          migration: "Regenerate badges or reports before comparing GAIR-NLP/InnovatorBench-style, InnovatorBench, ResearchGym, LLM research-agent, data-construction, loss-design, reward-design, scaffold-construction, checkpointed long-horizon, or multi-GPU research replay claims."
        },
        {
          trigger: "edge_ai_agent_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when edge AI agent benchmark identity, source/license boundary, device class coverage, modality coverage, runtime kind coverage, on-device/offline/privacy flags, optimization manifests, benchmark datasets, task manifests, application scenarios, latency, memory, energy, accuracy, replay pass-rate, or score-delta semantics change.",
          migration: "Regenerate badges or reports before comparing yh-yao/awesome-edge-ai-agents-style, edge AI agent, on-device multimodal-agent, mobile/embedded/wearable/IoT agent, inference-engine, optimization, benchmark/dataset, latency/memory/energy, or offline/privacy replay claims."
        },
        {
          trigger: "agent_workflow_kit_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when Agent Workflow Kit-style risk scoring, workflow-level policy, spec-layer decision rules, approval-gate semantics, verification commands, docs-check evidence, templates, skill-package manifests, replay thresholds, or deterministic seeds change.",
          migration: "Regenerate badges or reports before comparing crisxuan/agent-workflow-kit-style, Agent Workflow Kit, evaluation-first workflow, risk-score, workflow-level, AGENTS template, spec-layer, external-approval, verification-command, docs-check, or workflow replay claims."
        },
        {
          trigger: "medask_clinical_benchmark_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when MedAsk-style SymptomCheck or Triage benchmark identity, vignette manifests, patient simulator, model configs, evaluation scripts, result manifests, paired analysis, run or replay commands, diagnostic or triage metrics, deterministic seeds, or threshold semantics change.",
          migration: "Regenerate badges or reports before comparing medaks/medask-benchmarks-style, MedAsk, SymptomCheck Bench, Triage Bench, OSCE-style diagnostic agent, top-5 differential diagnosis, or medical-triage replay claims."
        },
        {
          trigger: "bio_kg_bench_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when BioKGBench-style biomedical KG checking, KGQA, SCV, dataset-release, knowledge-graph build, agent/RAG/Neo4j config, evaluation script, error-discovery, replay pass-rate, score-delta, or threshold semantics change.",
          migration: "Regenerate badges or reports before comparing westlake-autolab/BioKGBench-style, BioKGBench, biomedical KG checking, KGQA, SCV, BKGAgent-style, or biomedical knowledge-graph replay claims."
        },
        {
          trigger: "biomedarena_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when BioMedArena-style biomedical harness source identity, license, README, pyproject, config, matrix config, harness, CLI, benchmark config, eval suite, adapter registry, tool registry, vendor manifest, baseline agent, result, replay, CI, benchmark-family coverage, tool-mode coverage, deterministic seed, benchmark/tool/adapter/vendor counts, coverage, replay pass-rate, score-delta, tool-sandbox, or threshold semantics change.",
          migration: "Regenerate badges or reports before comparing AI-in-Health/BioMedArena-style, BioMedArena, biomedical agent harness, benchmark-family coverage, tool-mode coverage, adapter/tool/vendor coverage, or biomedical harness replay claims."
        },
        {
          trigger: "ai_agent_benchmark_comparison_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when AI-agent benchmark comparison source identity, repository or license proof, agent roster, benchmark dataset, source manifest, pricing snapshot, user-report manifest, leaderboard or score manifest, eval-pack, fixture, replay command, score-delta report, CI receipt, coverage thresholds, or count semantics change.",
          migration: "Regenerate badges or reports before comparing murataslan1/ai-agent-benchmark-style, AI coding-agent comparison, SWE-Bench leaderboard, pricing, user-report, source-manifest, or AI-agent benchmark comparison replay claims."
        },
        {
          trigger: "gaia_agent_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when GAIA-agent source identity, repository/license proof, benchmark harness files, workflow, docs/results, source/test tree, task or dataset snapshot, fixed seed, provider/model/run config, run output, score report, replay command, CI receipt, tool surfaces, evaluator agreement, trace coverage, or result coverage semantics change.",
          migration: "Regenerate badges or reports before comparing gaia-agent/gaia-agent-style, GAIA benchmark-ready super-agent, AI SDK ToolLoopAgent, browser/search/memory/planning/sandbox tool-use, or GAIA-agent replay claims."
        },
        {
          trigger: "paperarena_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when PaperArena source identity, no-license boundary, README/requirements/config/runner/scorer proof, dataset-builder/tool/RAG/reflector/run-script trees, Hugging Face dataset snapshot, paper or QA manifests, replay command, CI receipt, tool surfaces, question/paper/tool counts, max-step semantics, evaluator agreement, trace coverage, or result coverage semantics change.",
          migration: "Regenerate badges or reports before comparing ustc-ai4science/PaperArena-style, PaperArena, tool-augmented scientific-literature reasoning, paper-QA, PDF/retrieval/database/search/code tool-use, or PaperArena replay claims."
        },
        {
          trigger: "hermes_turbo_question_explainability_change",
          versionImpact: "Increment scoring, question-set, verification-protocol, and methodology versions when Hermes Turbo-style performance question-explainability semantics change for source identity, license, default branch, commit/tree, benchmark workflow, perf-budget workflow, daily score workflow, turbo score script, dashboard, benchmark report, baseline/candidate result, latency/throughput traces, score manifest, regression thresholds, CI receipts, performance facet, run counts, p50/p95 latency, throughput, speedup, dashboard coverage, regression pass rate, accepted/rejected evidence, repair hints, or row hashes.",
          migration: "Regenerate badges or reports before comparing wesleysimplicio/hermes-turbo-agent-style, Hermes Turbo Agent, performance dashboard, turbo scoring, low-latency, hot-path optimization, benchmark refresh, perf budget, or performance question-explainability claims."
        },
        {
          trigger: "rss_market_impact_methodology_change",
          versionImpact: "Increment methodology, scoring, verification-protocol, reporting, and badge versions when RSS/news market-impact alert semantics change for source identity, no-license boundary, feed source, polling window, model provider route, prompt/schema policy, importance taxonomy, asset-class taxonomy, dedupe ledger, analysis ledger, push policy, rate limits, alert thresholds, evaluator/backtest evidence, outcome-window policy, cost/latency accounting, accepted/rejected evidence, signed evidence, or row hashes.",
          migration: "Regenerate badges or reports before comparing EliotYang/trump_rss_trade-style, Trump RSS trade, RSS market-impact monitor, OpenAI or Gemini market-impact alert, feed polling, push notification, or news-driven market-impact methodology claims."
        },
        {
          trigger: "credence_engine_live_drift_change",
          versionImpact: "Increment live-drift, verification-protocol, scoring, and methodology versions when Credence Engine-style Bayesian decision benchmark identity, AGPL source boundary, archive status, README/spec/package/lock/result artifacts, experiment mode, decision policy, posterior trace, value-of-information policy, expected-utility policy, baseline/live result, drift statistic, alert receipt, or context-distribution semantics change.",
          migration: "Regenerate badges or reports before comparing gfrmin/credence-engine-style, Credence Engine, Bayesian decision-theoretic agents, value-of-information routing, expected-utility decisions, posterior calibration, benchmark drift experiments, or live agent-evaluation drift claims."
        },
        {
          trigger: "skill_forge_autoresearch_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when Skill Forge-style autoresearch replay semantics change for source identity, repository/license/homepage proof, README/release/skill spec refs, agent-role manifests, orchestrator/mutator/scorer/hypothesis agents, composite scoring, templates, example sessions, improvement loops, mutation and revert policies, replay manifests, CI receipts, score deltas, or threshold semantics.",
          migration: "Regenerate badges or reports before comparing GodModeAI2025/skill-forge-style, Skill Forge, autonomous skill improvement, iterative skill mutation, autoresearch, no-human-in-loop skill optimization, composite scoring, or SkillBench regression-gate replay claims."
        },
        {
          trigger: "effect_autoagent_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when effect-autoagent-style declarative agent benchmark replay semantics change for source identity, repository/license/default-branch proof, README/package/lockfile/CI refs, benchmark runner, harness spec, task spec, metrics, experiment log, blueprint, runner, result, trajectory, container, task fixtures, Docker environments, replay commands, fixed seeds, score deltas, CI receipts, or threshold semantics.",
          migration: "Regenerate badges or reports before comparing mpsuesser/effect-autoagent-style, Effect services, declarative agent blueprint, harness-engineering, task-fixture, Docker task, benchmark-runner, trajectory, score-delta, or replay-corpus claims."
        },
        {
          trigger: "falcon_evaluate_provider_drift_change",
          versionImpact: "Increment provider-drift, verification-protocol, scoring, and methodology versions when Falcon Evaluate-style provider/model drift semantics change for source identity, repository/license/default-branch proof, release tags, package/lockfile/requirements refs, README/docs/workflow refs, evaluation module refs, metric-family mappings, provider routes, canary results, drift statistics, alert receipts, signed evidence, or threshold semantics.",
          migration: "Regenerate badges or reports before comparing Praveengovianalytics/falcon-evaluate-style, Falcon Evaluate, provider/model drift, context relevancy, fairness, reliability, security, machine ethics, provider-route, canary-result, or agent-evaluation benchmark claims."
        },
        {
          trigger: "agent_defense_bench_provider_drift_change",
          versionImpact: "Increment provider-drift, verification-protocol, scoring, and methodology versions when AgentDefense-Bench-style MCP security-defense semantics change for source identity, repository/license/default-branch proof, README/checksums/citation/requirements refs, MCP server manifests, attack-bank or benchmark-suite refs, defense policy, run config, provider route, canary result, drift statistic, alert/waiver, CI receipt, signed evidence, or threshold semantics.",
          migration: "Regenerate badges or reports before comparing arunsanna/AgentDefense-Bench-style, AgentDefense-Bench, MCP security benchmark, infrastructure-layer defense, prompt-injection blocking, jailbreak blocking, tool-poisoning blocking, provider-route, canary-result, or provider-drift claims."
        },
        {
          trigger: "paper_read_skill_live_drift_change",
          versionImpact: "Increment live-drift, verification-protocol, scoring, and methodology versions when paper-read-skill-style research workflow semantics change for source identity, no-license boundary, README/llms manifests, skill trees, paper-analysis or blog-reading prompt catalogs, routing policy, research-task manifests, evaluation rubrics, baseline/live samples, drift statistics, alert receipts, CI receipts, no-prompt-copy proof, signed evidence, or threshold semantics.",
          migration: "Regenerate badges or reports before comparing Ayanami0730/paper-read-skill-style, paper-read-skill, paper-reading agent skill, research-paper analysis, benchmark/methodology/survey-opinion routing, research synthesis, live behavior-drift, or paper-reading score-drift claims."
        },
        {
          trigger: "eval_ai_library_question_explainability_change",
          versionImpact: "Increment scoring, question-set, verification-protocol, and methodology versions when eval-ai-library-style question score explainability semantics change for source identity, Apache-2.0/default-branch/commit/tree proof, README/LICENSE/NOTICE/pyproject/requirements refs, eval_lib metric families, agent metrics, security metrics, tracing/dashboard/schema modules, eval-pack, dataset, question set, question trace, evaluator config, metric result, score breakdown, accepted or rejected evidence ledger, repair hint, regression threshold, CI receipt, no-copy proof, evidence coverage, repair coverage, or score-confidence semantics.",
          migration: "Regenerate badges or reports before comparing firstlinesoftware/eval-ai-library-style, eval-ai-library, RAG metric, agent metric, security metric, question-level score explanation, accepted/rejected evidence, repair-hint, or question score explainability claims."
        },
        {
          trigger: "open_model_rag_question_explainability_change",
          versionImpact: "Increment scoring, question-set, verification-protocol, and methodology versions when Open Models LangChain4j/Ollama RAG question score explainability semantics change for source identity, license/no-license boundary, default-branch/commit/tree proof, README, Java source, build/dependency refs, LangChain4j integration, Ollama runtime, RAG pipeline, corpus, embedding, retrieval, evaluation, open model ids, question trace, evaluator config, metric result, score breakdown, rejected evidence, repair hint, regression threshold, CI receipt, no-copy proof, evidence coverage, repair coverage, grounding, answer relevance, or row-hash semantics.",
          migration: "Regenerate badges or reports before comparing bbenz/gen-ai-with-open-models-style, Open Models, Java local inference, LangChain4j, Ollama, RAG pipeline, RAG evaluation, or question score explainability claims."
        },
        {
          trigger: "fore_public_methodology_versioning_change",
          versionImpact: "Increment methodology, scoring, verification-protocol, reporting, and badge versions when fore-style evaluation-client public methodology semantics change for source identity, archived Apache-2.0/default-branch proof, README/LICENSE/pyproject refs, package version, fore/foresight client/API schema/schema/test/workflow refs, methodology id/version/hash, changelog, deprecation notice, migration guidance, eval-pack, dataset, signed evidence, CI, regression threshold, no-copy proof, or row-hash semantics.",
          migration: "Regenerate badges or reports before comparing foreai-co/fore-style, fore, Fore Foresight client, evaluation-client, RAG/LLM metric client, public methodology versioning, changelog, deprecation, migration, or badge comparability claims."
        },
        {
          trigger: "heurekabench_scientific_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, methodology, reporting, and badge versions when HeurekaBench/sc-HeurekaBench-style scientific co-scientist replay semantics change for source identity, no-root-license boundary, default-branch/commit/tree proof, README/project/arXiv refs, benchmark JSONs, single-cell dataset refs, dataset checksum/no-copy proof, insight/question/answer manifests, extraction/evaluation scripts, G-Eval prompt refs, baseline runner refs, Biomni/CellVoyager adapter refs, result manifests, question type, tool-use subset, evaluator agreement, replay pass rate, regression threshold, signed evidence, CI, or row-hash semantics.",
          migration: "Regenerate badges or reports before comparing mlbio-epfl/HeurekaBench-style, HeurekaBench, sc-HeurekaBench, scientific co-scientist, single-cell benchmark, Biomni/CellVoyager baseline, MCQ/open-ended scientific question, or benchmark replay claims."
        },
        {
          trigger: "rag_contradiction_detector_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, methodology, reporting, and badge versions when RAG_Contradiction_Detector-style biomedical RAG contradiction replay semantics change for source identity, no-root-license boundary, default-branch/commit/tree proof, README/requirements/Makefile refs, SciFact dataset refs, evaluation scripts, quality gates, bootstrap/eval reports, heuristic/PyTorch verifier refs, model registry, PubMed ingestion, retrieval/vector-store proof, Docker/k8s/Prometheus refs, replay command, CI receipt, score delta, signed evidence, or row-hash semantics.",
          migration: "Regenerate badges or reports before comparing robhorvat/RAG_Contradiction_Detector-style, biomedical RAG contradiction, PubMed contradiction triage, SciFact retrieval/verdict, heuristic verifier, torch verifier, quality-gate, Docker/k8s, Prometheus, or replay-corpus claims."
        },
        {
          trigger: "skillmatch_resume_live_drift_change",
          versionImpact: "Increment live-drift, verification-protocol, scoring, methodology, reporting, and badge versions when SkillMatch-style resume analysis semantics change for source identity, no-license boundary, default-branch/commit/tree proof, README/Docker/frontend/old-version refs, PDF extraction, resume task taxonomy, provider route, RAG input corpus, baseline/live sample, drift statistic, alert receipt, privacy boundary, no-source-copy proof, no-resume-copy proof, signed evidence, or row-hash semantics.",
          migration: "Regenerate badges or reports before comparing SubashSK777/SkillMatch-AI_Resume_Analyzer-style, SkillMatch, AI resume analyzer, PDF resume parser, job-match analysis, resume improvement suggestions, RAG resume analysis, or live resume-agent drift claims."
        },
        {
          trigger: "decibench_voice_live_drift_change",
          versionImpact: "Increment live-drift, verification-protocol, scoring, methodology, reporting, and badge versions when Decibench-style voice AI testing semantics change for source identity, GitHub NOASSERTION/license boundary, default branch, release, README, pyproject, CI, CLI, MCP, RAG, evaluator, audio, scenario-suite, bridge, dashboard, deterministic/semantic/RAG evaluation manifests, baseline/live sample, drift statistic, alert receipt, no-source-copy proof, no-transcript-copy proof, privacy boundary, signed evidence, or row-hash semantics.",
          migration: "Regenerate badges or reports before comparing unforkopensource-org/decibench-style, Decibench, voice AI testing, voice-agent benchmark, deterministic evaluation, semantic evaluation, RAG augmented evaluation, CLI/MCP voice-agent evaluation, or voice live-drift claims."
        },
        {
          trigger: "evidra_provider_drift_change",
          versionImpact: "Increment provider-drift, verification-protocol, scoring, methodology, reporting, and badge versions when Evidra-style source identity, Apache-2.0 license proof, default branch, release tag, README/go.mod, CI/release workflows, Docker, CLI/MCP/API refs, evidence-chain packages, lifecycle/pipeline/score refs, tests/docs/signal-validation refs, prescribe/report protocol proof, provider route, canary result, sample manifests, drift statistic, alert or waiver, replay, CI, no-source-copy, signed evidence-chain, or row-hash semantics change.",
          migration: "Regenerate badges or reports before comparing vitas/evidra-style, Evidra, DevOps MCP server, prescribe/report protocol, signed evidence chain, reliability scorecard, provider/model drift, canary-result, or LLMOps provider-drift claims."
        },
        {
          trigger: "ravig_bench_metric_validity_change",
          versionImpact: "Increment metric-validity, verification-protocol, scoring, methodology, reporting, and badge versions when RAViG-Bench-style source identity, Apache-2.0 license proof, default branch, README/legal/dependency/config refs, content/design/execution evaluation refs, function scoring, dataset/test-case/model-result refs, visually-rich generation taxonomy, RAG retrieval context, multi-modal evaluator, screenshot/run-script, metric definition, CI, owner, confidence interval, no-source-copy, signed evidence, or row-hash semantics change.",
          migration: "Regenerate badges or reports before comparing antgroup/ravig-bench-style, RAViG-Bench, retrieval-augmented visually-rich generation, multi-modal automated evaluation, content/design/execution evaluation, or metric-validity claims."
        },
        {
          trigger: "rail_score_live_drift_change",
          versionImpact: "Increment live-drift, verification-protocol, scoring, and methodology versions when RAIL Score-style responsible-AI scoring, guardrail, safe-regeneration, agent tool-call evaluation, telemetry, compliance, source/package release, baseline/live result, drift statistic, alert receipt, or context-distribution semantics change.",
          migration: "Regenerate badges or reports before comparing Responsible-AI-Labs/rail-score-sdk-style, RAIL Score, responsible-AI dimensions, guardrail pass rates, safe regeneration, prompt-injection blocking, agent tool-call evaluation, telemetry, compliance, or live behavior-drift claims."
        },
        {
          trigger: "garage_rag_grounding_live_drift_change",
          versionImpact: "Increment live-drift, verification-protocol, scoring, and methodology versions when GaRAGe-style RAG grounding semantics change for source identity, repository/license/README proof, benchmark dataset, dataset manifest, paper reference, grounding annotation schema, retrieval corpus, prompt/evaluator config, baseline/live result, drift statistic, alert receipt, grounding precision/recall, citation support, deflection, answer faithfulness, validation coverage, or context-distribution semantics.",
          migration: "Regenerate badges or reports before comparing amazon-science/GaRAGe-style, GaRAGe, RAG grounding annotations, long-form answer grounding, passage relevance, citation support, deflection accuracy, answer faithfulness, or RAG live-drift claims."
        },
        {
          trigger: "llm_prompting_tests_public_methodology_change",
          versionImpact: "Increment corpus, harness, verification-protocol, scoring, and methodology versions when llm-prompting-tests-style prompt-suite identity, source/no-license/default-branch snapshot, README proof, prompt catalog, prompt-file refs, prompt taxonomy, task/risk taxonomy, expected-output rubric, self-check policy, no-external-assets policy, language boundary, model/provider pool, judge calibration, baseline/candidate result, regression threshold, changelog, deprecation, migration, or signed-evidence semantics change.",
          migration: "Regenerate badges or reports before comparing Arnie936/llm-prompting-tests-style, llm-prompting-tests, demanding prompt suite, coding-agent prompt, agentic-model prompt, prompt taxonomy, self-check, no-external-assets, rubric, or public-methodology claims."
        },
        {
          trigger: "scorable_studio_drilldown_change",
          versionImpact: "Increment scoring, question-set, verification-protocol, and methodology versions when Scorable SDK Studio drilldown semantics change for source identity, license, default branch, commit/tree, SDK manifests, OpenAPI/client/execution logs, CLI evaluator/judge/execution-log/OTEL/file-upload commands, TypeScript package proof, npm package integrity, UI route, source artifact links, trace/receipt/policy/source-artifact previews, empty/error states, accepted/rejected evidence, repair hints, or row hashes.",
          migration: "Regenerate badges or reports before comparing root-signals/scorable-sdk-style, Scorable SDK, Studio evidence drilldown, execution logs, OTEL traces, evaluator/judge command evidence, file upload artifacts, package integrity, source artifact previews, or question-explainability claims."
        },
        {
          trigger: "social_reasoning_bench_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when Social Reasoning Bench source identity, repository/license proof, README, pyproject, lockfile, data/docs/experiments/outputs/packages/scripts trees, runner, collector, validation script, workflow, result artifact, CI receipt, domain/package/scenario coverage, fixture counts, output artifacts, replay pass rate, score delta, or result coverage semantics change.",
          migration: "Regenerate badges or reports before comparing microsoft/social-reasoning-bench-style, Social Reasoning Bench, calendar-scheduling, marketplace, whimsygen, social-domain agent, privacy, due-diligence, or outcome-optimality replay claims."
        },
        {
          trigger: "besttester_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when BestTester source identity, repository/license proof, README, package/lockfile/tsconfig proof, Playwright config, source/test/agent/MCP/config/script/mutation/report/workflow trees, LLM judge rubric, security fuzzer, Jira/Slack proof, result artifact, CI receipt, capability/test-surface/agent-role coverage, replay pass rate, score delta, LLM-judge agreement, security coverage, or CI coverage semantics change.",
          migration: "Regenerate badges or reports before comparing nshportun/BestTester-style, BestTester, Playwright QA-agent, LLM-as-Judge QA, MCP testing, security fuzzing, Jira/Slack reporting, mutation-testing, or QA automation replay claims."
        },
        {
          trigger: "academiclaw_metric_validity_change",
          versionImpact: "Increment scoring, verification-protocol, and methodology versions when GAIR-NLP/AcademiClaw-style academic-task metric-validity semantics change for source/license refs, default-branch snapshots, README/CITATION manifests, task corpus manifests, bilingual coverage, workspace queries, Docker environments, rubrics, eval runners, OpenClaw result manifests, conversation traces, meta-evals, model rosters, metric definitions, CI regression, owners, sample sizes, confidence intervals, or row hashes.",
          migration: "Regenerate badges or reports before comparing GAIR-NLP/AcademiClaw-style, AcademiClaw, AcademicLaw/OpenClaw, bilingual academic-task, university student-sourced task, rubric, conversation-trace, meta-eval, or academic-agent metric-validity claims."
        },
        {
          trigger: "rag_chunking_technique_metric_validity_change",
          versionImpact: "Increment scoring, verification-protocol, and methodology versions when IBM/rag-chunking-techniques-style RAG chunking metric-validity semantics change for source/license refs, default-branch snapshots, README manifests, policy corpora, simple RAG notebooks, smart chunking notebooks, RAG evaluation notebooks, chunking strategies, retrieval pipelines, embedding/vectorstore manifests, evaluation datasets, metric definitions, CI regression, owners, sample sizes, confidence intervals, or row hashes.",
          migration: "Regenerate badges or reports before comparing IBM/rag-chunking-techniques-style, RAG chunking technique, simple RAG notebook, smart chunking notebook, RAG evaluation notebook, policy corpus, retrieval pipeline, embedding/vectorstore, or metric-validity claims."
        },
        {
          trigger: "rag_eval_flow_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when local RAG evaluation source identity, repository or license proof, pipeline config, data-source manifest, model or judge backend semantics, metric definitions, prompt templates, eval-pack, fixture, replay command, result manifest, score-delta report, CI receipt, sample-size thresholds, replay pass-rate thresholds, or metric-coverage thresholds change.",
          migration: "Regenerate badges or reports before comparing aizip/Rag-Eval-flow-style, local RAG evaluation, configurable RAG pipeline, data/model/judge/metric configured, prompt-template, sample-size, replay command, score-delta, or CI replay claims."
        },
        {
          trigger: "rag_eval_dataset_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when rag-eval source identity, repository or license proof, input document manifests, processor config, prompt or generator config, generated QA dataset, endpoint config, endpoint response trace, ranking report, evaluation run, replay command, CI receipt, data formats, endpoint modes, metric ids, question or endpoint counts, deterministic seed, score delta, replay pass, endpoint response coverage, or threshold semantics change.",
          migration: "Regenerate badges or reports before comparing sundi133/rag-eval-style, document QA generation, endpoint evaluation/ranking, generated QA dataset, sample-app endpoint, report download, or CI replay claims."
        },
        {
          trigger: "encourage_rag_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when Encourage-style source identity, package/dependency, RAG method, inference-runner, template, vector DB, dataset/query/reference, metric-suite, MLflow, replay pass-rate, metric coverage, or threshold semantics change.",
          migration: "Regenerate badges or reports before comparing uhh-hcds/encourage-style, modular RAG, vLLM, Jinja-template, Chroma/Qdrant, MLflow-tracked, or RAG replay-corpus claims."
        },
        {
          trigger: "mirage_multimodal_rag_dataset_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when MiRAGE-style multimodal multihop RAG dataset-generation source identity, repository or license proof, input documents, semantic chunks, multihop context graph, role manifests, generate/select/verify/correct traces, multimodal carriers, backend/embedding/reranker configs, token-usage, checkpoint/resume, deduplication, evaluation, replay command, output dataset, visualization, question-count, replay-pass, metric-coverage, or score-delta semantics change.",
          migration: "Regenerate badges or reports before comparing ChandanKSahu/MiRAGE-style, multimodal multihop QA generation, RAG dataset generation, backend coverage, modality coverage, pipeline-stage coverage, replay command, score-delta, or CI replay claims."
        },
        {
          trigger: "a2a_negotiation_transaction_methodology_change",
          versionImpact: "Increment methodology, corpus, verification-protocol, scoring, and reporting versions when agent-to-agent negotiation benchmark identity, buyer/seller role semantics, product catalog, budget or wholesale constraints, turn limits, conversation trace capture, seller-offer extraction, deal-outcome judging, anomaly taxonomy, provider usage accounting, run manifest, or clean-deal exclusion semantics change.",
          migration: "Regenerate badges or reports before comparing ShenzheZhu/A2A-NT-style, agent-to-agent negotiation, consumer-market transaction, buyer/seller delegation, price bargaining, budget-constraint, wholesale-constraint, anomaly-labeled, or clean-deal methodology claims."
        },
        {
          trigger: "research_run_live_drift_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when research task manifests, pruned-repository or dataset evidence, evaluation harnesses, baseline score manifests, grading scripts, withheld-solution policies, runtime images, agent adapters, inspection reports, budget controls, score-improvement metrics, subtask-completion semantics, or ResearchGym-style alert thresholds change.",
          migration: "Regenerate badges or reports before comparing ResearchGym-style, autonomous AI research, long-horizon research-agent, task-improvement, inspection, budget-control, or research-run live drift claims."
        },
        {
          trigger: "gui_navigation_live_drift_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when GUI-navigation benchmark identity, source/repository/license/paper refs, testcase manifests, task category or complexity-level semantics, agent or runner configs, runtime images, dependency locks, validator configs, validation reports, result/viewer artifacts, trajectories, screenshots, action-step metrics, automated-validation metrics, evidence coverage, or OSUniverse-style alert thresholds change.",
          migration: "Regenerate badges or reports before comparing OSUniverse-style, desktop GUI-navigation agent, multimodal GUI agent, task category, complexity level, automated validation, runtime, trajectory, screenshot, or step-limit live drift claims."
        },
        {
          trigger: "provider_observability_pipeline_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when provider-drift canary observability platform, pipeline orchestrator, experiment tracker, datastore, retrieval index, dataset, trace-export, metric-report, pipeline-config, or fail-closed evidence semantics change.",
          migration: "Regenerate badges or reports before comparing Opik-style, ZenML-style, Mongo-backed, LLM observability, provider-drift, multi-metric evaluation, trace-export, or experiment-tracked canary claims."
        },
        {
          trigger: "geospatial_provider_drift_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when geospatial provider-drift benchmark identity, task set, dataset snapshot, tool registry, reference solution, trace export, judge panel, human calibration, result report, token-cost report, complexity group, solvable/unsolvable mix, tool-count, max-iteration, or threshold semantics change.",
          migration: "Regenerate badges or reports before comparing GeoBenchX-style, geospatial tool-calling, GIS workflow, spatial-analysis, LLM-as-judge, solvable/unsolvable, token-cost, or provider-drift canary claims."
        },
        {
          trigger: "llm_rag_eval_suite_live_drift_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when LLM/RAG live-drift eval suite identity, candidate/reference manifests, semantic-similarity metric, bias metric, hallucination/faithfulness metric, judge config, report artifact, evidence coverage, or threshold semantics change.",
          migration: "Regenerate badges or reports before comparing AIAnytime-style, BERTScore-style, bias-evaluation, hallucination/faithfulness, LLM evaluation, RAG evaluation, or multi-metric live-drift claims."
        },
        {
          trigger: "kite_rag_live_drift_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when KITE-style RAG benchmark identity, repository/source/license refs, corpus/document-set manifests, query-set, ground-truth answer, rubric, RAG pipeline config, response/result manifests, judge config, grading scale, dataset-family, RAG configuration, sample-count, small-sample warning, grade metric, evidence coverage, or threshold semantics change.",
          migration: "Regenerate badges or reports before comparing D-Star-AI/KITE-style, KITE, knowledge-intensive task evaluation, end-to-end RAG benchmark, corpus/query/rubric/judge, grade, dataset-family, RAG configuration, or live-drift claims."
        },
        {
          trigger: "poker_eval_live_drift_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when PokerEval-style benchmark identity, source/repository/package/citation refs, simulation config, agent config, opponent pool, run manifest, hand-history manifest, metric report, game type, table or blind context, hand-count, BB/100, all-in adjusted BB/100, EV BB/100, VPIP, evidence coverage, context distributions, or threshold semantics change.",
          migration: "Regenerate badges or reports before comparing superagent-ai/poker-eval-style, PokerEval, NLTH poker simulation, partial-information decision-making, BB/100, EV, all-in adjusted BB/100, VPIP, hand-count, opponent-pool, or live-drift claims."
        },
        {
          trigger: "physical_risk_awareness_methodology_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when EARBench-style physical-risk-awareness benchmark identity, source/repository/paper/license refs, dataset or EARDataset manifests, domain/scene coverage, safety-guideline generation, risky-scene generation, textual/visual observation, task instruction, plan-generation, plan-assessment rubric, task-risk-rate, effectiveness metrics, mitigation prompt or policy, or threshold semantics change.",
          migration: "Regenerate badges or reports before comparing EARBench-style, physical-risk-awareness, embodied task planning, EARDataset, risky-scene, safety-guideline, task-risk-rate, mitigation-prompt, or plan-assessment methodology claims."
        },
        {
          trigger: "llmops_pipeline_methodology_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when LLMOPS-style lifecycle methodology changes source/repository/license refs, task or pipeline manifests, dataset/split manifests, model registry or artifact manifests, training or fine-tuning configs, evaluation configs, RAG evaluation configs, QA deployment manifests, CI/CD receipts, container or orchestration manifests, infrastructure-as-code manifests, monitoring telemetry baselines, model/service thresholds, or migration semantics.",
          migration: "Regenerate badges or reports before comparing LLMOPS-style, text-summarization pipeline, RAG evaluation, QA deployment, CI/CD, container, Kubernetes, infrastructure-as-code, monitoring, or model-service lifecycle methodology claims."
        },
        {
          trigger: "multi_user_question_explainability_change",
          versionImpact: "Increment scoring, question-set, verification-protocol, and methodology versions when Multi-User-LLM-Agent-style question-explainability semantics change for scenario identity, user-role manifests, permission/preference/queue/instruction policies, interaction traces, evaluator configs, result artifacts, metric thresholds, accepted/rejected evidence, repair hints, or row hashes.",
          migration: "Regenerate badges or reports before comparing Kordi-AI/Multi-User-LLM-Agent-style, multi-user LLM-agent, access-control, meeting-scheduling, shared-queue, multi-user instruction-following, or multi-stakeholder question-explainability claims."
        },
        {
          trigger: "continual_learning_question_explainability_change",
          versionImpact: "Increment scoring, question-set, verification-protocol, and methodology versions when CL-Bench-style continual-learning question-explainability semantics change for stateful workflow identity, dataset, state schema, initial state, state mutation trace, conversation trace, entity-relationship graph, tool execution, evaluator, result, replay command, memory policy, adaptive-learning trace, task completion, response quality, state accuracy, retention, token cost, accepted/rejected evidence, repair hints, or row hashes.",
          migration: "Regenerate badges or reports before comparing Arc-Computer/CL-Bench-style, continual-learning, stateful CRM workflow, multi-turn conversation, state mutation, entity-relationship, tool-execution, adaptive-learning, or question-explainability claims."
        },
        {
          trigger: "iot_firmware_question_explainability_change",
          versionImpact: "Increment scoring, question-set, verification-protocol, and methodology versions when Adsum IoT Coder-style firmware question-explainability semantics change for platform, board, chip, firmware project, toolchain, SDK, hardware session, device logs, build/flash/test artifacts, knowledge pack, evaluator, result, privacy boundary, benchmark report, bug-closure, token-efficiency, log-capture coverage, accepted/rejected evidence, repair hints, or row hashes.",
          migration: "Regenerate badges or reports before comparing adsumnetworks/Adsum-IoT-Coder-style, IoT firmware, nRF, ESP, Zephyr, ESP-IDF, hardware-run, device-log, build/flash/test, token-efficiency, or question-explainability claims."
        },
        {
          trigger: "retail_sales_question_explainability_change",
          versionImpact: "Increment scoring, question-set, verification-protocol, and methodology versions when ShampooSalesAgent-style retail sales question-explainability semantics change for source identity, product catalog or description, customer scenario, conversation trace, order-capture schema, order ledger, pricing or discount policy, model adapter/provider matrix, prompt/recommendation/safety/privacy policy, evaluator, result, benchmark report, sales channel, provider/scenario/order counts, order-capture accuracy, policy compliance, recommendation grounding, PII redaction, accepted/rejected evidence, repair hints, or row hashes.",
          migration: "Regenerate badges or reports before comparing jackfsuia/ShampooSalesAgent-style, retail sales agent, shampoo sales, product recommendation, customer conversation, order capture, model-provider matrix, or retail question-explainability claims."
        },
        {
          trigger: "realign_simulation_metric_validity_change",
          versionImpact: "Increment scoring, verification-protocol, and methodology versions when Realign-style simulation metric-validity semantics change for source/license refs, YAML config, app-under-test, dataset, scenario, persona, evaluator registry, evaluator target, simulation trace, repeated-run trace, judge calibration, statistics, CI regression, experiment tracking, result artifacts, owner, sample-size, confidence interval, or row hashes.",
          migration: "Regenerate badges or reports before comparing honeyhiveai/realign-style, simulation-driven AI app testing, YAML-managed evaluators, synthetic-user/persona simulation, repeated evaluator runs, LLM judge calibration, statistical rigor, CI regression, experiment tracking, or metric-validity claims."
        },
        {
          trigger: "humanstudybench_metric_validity_change",
          versionImpact: "Increment scoring, verification-protocol, and methodology versions when HumanStudy-Bench-style participant-simulation metric-validity semantics change for source/license refs, default-branch snapshots, study configs, participant backgrounds, human responses, agent responses, evaluator registries, metric definitions, validators, scorers, standardizers, reliability reports, validation pipelines, CI reporters, result artifacts, owners, sample sizes, confidence intervals, or row hashes.",
          migration: "Regenerate badges or reports before comparing AISmithLab/HumanStudy-Bench-style, HumanStudy-Bench, participant simulation, human-study response comparison, social-science simulation, evaluator/scorer validity, inter-rater agreement, test-retest reliability, validation-pipeline, or metric-validity claims."
        },
        {
          trigger: "legacybench_metric_validity_change",
          versionImpact: "Increment scoring, verification-protocol, and methodology versions when Legacy-Bench-style legacy-software metric-validity semantics change for source/license refs, default-branch snapshots, README manifests, task corpus manifests, legacy-language coverage, environment manifests, harness runners, agent tasks, patch submissions, test oracles, evaluator registries, scoring metrics, CI reporters, result artifacts, replay commands, owners, sample sizes, confidence intervals, or row hashes.",
          migration: "Regenerate badges or reports before comparing Factory-AI/legacy-bench-style, Legacy-Bench, legacy software engineering, COBOL/Java/Fortran/Assembly/C repair or migration, deterministic test-oracle, replay-command, or software-agent metric-validity claims."
        },
        {
          trigger: "subtlememory_metric_validity_change",
          versionImpact: "Increment scoring, verification-protocol, and methodology versions when SubtleMemory-style relational-memory metric-validity semantics change for source/license refs, default-branch snapshots, arXiv versions, Hugging Face dataset releases, persona splits, bench-instance manifests, history-session manifests, relation taxonomies, construction pipelines, evaluation stages, adapter rosters, judge/evaluator configs, score summaries, diagnostic protocols, CI validation, owners, sample sizes, confidence intervals, or row hashes.",
          migration: "Regenerate badges or reports before comparing Yummytanmo/SubtleMemory-style, SubtleMemory, fine-grained relational memory discrimination, long-horizon memory, persona split, relation-controlled memory variant, staged memory evaluation, judge/evaluator, diagnostic-protocol, or metric-validity claims."
        },
        {
          trigger: "ragas_notebook_metric_validity_change",
          versionImpact: "Increment scoring, verification-protocol, and methodology versions when Coding-Crashkurse/RAG-Evaluation-with-Ragas-style RAGAS notebook metric-validity semantics change for source/no-license-boundary refs, notebook manifests, dependency manifests, document corpus, chunking, testset generation, evolution mix, generated testsets, RAG chain, retriever/vectorstore, model/embedding, answer-context traces, RAGAS metric suite/results, LangFuse score exports, visualization artifacts, owner, sample-size, confidence interval, or row hashes.",
          migration: "Regenerate badges or reports before comparing Coding-Crashkurse/RAG-Evaluation-with-Ragas-style, RAGAS notebook, generated testset, LangChain/Chroma/OpenAI RAG chain, faithfulness, answer relevancy, context precision/recall, LangFuse scoring, or RAG metric-validity claims."
        },
        {
          trigger: "nomiracl_multilingual_rag_live_drift_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when NoMIRACL-style multilingual RAG relevance source identity, language manifest, relevant/non-relevant subset coverage, qrels, passage pool, retrieval run, model route, relevance or abstention metric, hallucination/error metric, evidence coverage, language/subset distribution, or threshold semantics change.",
          migration: "Regenerate badges or reports before comparing project-miracl/nomiracl-style, NoMIRACL, multilingual RAG relevance, answerability, abstention, hallucination/error, or live-drift claims."
        },
        {
          trigger: "scaling_law_discovery_live_drift_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when scaling-law discovery benchmark identity, task inventory, dataset or split manifests, source-experiment manifests, task/evolution/evaluator configs, model-route evidence, program/checkpoint/result artifacts, formula family, extrapolation regime, R2, NMSE, NMAE, evidence-coverage, or threshold semantics change.",
          migration: "Regenerate badges or reports before comparing SLDBench-style, scaling-law discovery, AI-based scaling-law, autonomous scientific-discovery, R2/NMSE/NMAE, formula-discovery, extrapolation, or live-drift claims."
        },
        {
          trigger: "ollama_metrics_live_drift_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when Ollama metrics sidecar identity, proxy or Ollama host config, Prometheus scrape evidence, metrics endpoint snapshots, baseline/live snapshots, alert-policy, model/deployment distributions, token, latency, time-per-token, loaded-model, RAM, error-rate, evidence-coverage, or threshold semantics change.",
          migration: "Regenerate badges or reports before comparing NorskHelsenett/ollama-metrics-style, Ollama metrics sidecar, local LLM proxy, Prometheus-scraped token/latency/memory, model-loaded, Grafana-dashboard, or live-drift claims."
        },
        {
          trigger: "recovery_bench_live_drift_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when Recovery-Bench-style benchmark identity, Terminal-Bench/failure-set versions, failed trajectory, replay command, replay environment, corrupted environment, recovery agent/model/run config, message mode, transcript, result, score report, recovery success/reward, evidence coverage, or threshold semantics change.",
          migration: "Regenerate badges or reports before comparing letta-ai/recovery-bench-style, Recovery-Bench, failed-trajectory replay, corrupted-environment recovery, recovery-agent message-mode, Terminal-Bench, recovery success, or recovery reward live-drift claims."
        },
        {
          trigger: "scenario_simulation_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when scenario-simulation benchmark identity, scenario project manifests, scene or role definitions, participant policy, agent roster, action schema, task dataset, web UI artifact, server/container/persistence/checkpoint evidence, action-level evaluation, visualization artifacts, replay pass-rate, or resume semantics change.",
          migration: "Regenerate badges or reports before comparing leaf-playground-style, scenario simulation, human/LLM co-participation, action-level evaluation, visualization, persistence, checkpoint-resume, or replay-corpus claims."
        },
        {
          trigger: "warehouse_native_llm_eval_replay_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when warehouse-native LLM eval benchmark identity, dbt project/package artifacts, warehouse adapter or AI-function manifests, capture schema, baseline versioning, judge criteria, sampling or thresholds, raw/evaluation/score/performance/drift/alert artifacts, no-egress policy, replay pass-rate, or regression semantics change.",
          migration: "Regenerate badges or reports before comparing dbt-llm-evals-style, warehouse-native LLM eval, dbt evaluation, LLM-as-judge, baseline-versioned, drift-detection, or no-data-egress replay-corpus claims."
        },
        {
          trigger: "llm_workflow_observability_methodology_change",
          versionImpact: "Increment methodology, harness, verification-protocol, and reporting versions when LLM workflow observability, real-time tracing, visual debugging, prompt/model registry, evaluation template, production-monitoring window, frontend analytics, user-feedback, session replay, telemetry sampling, redaction, retention, or data-security semantics change.",
          migration: "Regenerate badges or reports before comparing AgiFlow-style, LLM QA, observability, visual-debugger, prompt/model performance, OpenTelemetry instrumentation, frontend analytics, user-feedback, session-replay, workflow-visualization, or production-monitoring methodology claims."
        },
        {
          trigger: "sutro_batch_methodology_versioning_change",
          versionImpact: "Increment methodology, corpus, harness, verification-protocol, scoring, and cost-accounting versions when Sutro-style unstructured-data batch inference semantics change for function identity, judge/classifier/extractor schema, data-source format, input-order preservation, model pool, priority tier, dry-run estimate, observability, result export, retention, or multi-model comparison.",
          migration: "Regenerate badges or reports before comparing sutro-sh/sutro-style, Sutro, unstructured-data batch inference, LLM judge, classifier, extractor, synthetic-data, semantic-tagging, embedding, DataFrame, CSV, Parquet, S3, observability, dry-run cost, retention, result-export, or large-scale eval methodology claims."
        },
        {
          trigger: "agent_belt_methodology_versioning_change",
          versionImpact: "Increment methodology, corpus, harness, verification-protocol, scoring, and cost-accounting versions when Agent Belt-style reproducible coding-agent evaluation semantics change for scenario schema, turn model, agent adapter roster, workspace diff checks, rule checks, multi-judge consensus, per-turn judging, pass@k/pass^k reliability, worktree isolation, Docker sandbox, export formats, CI, or release provenance.",
          migration: "Regenerate badges or reports before comparing jfrog/agent-belt-style, Agent Belt, coding-agent eval, multi-turn scenario, workspace-diff, rule-check, multi-judge consensus, per-turn judging, pass@k, pass^k, Git worktree, Docker sandbox, or reproducible-eval methodology claims."
        },
        {
          trigger: "critic_rubrics_methodology_change",
          versionImpact: "Increment methodology, corpus, verification-protocol, scoring, and reporting versions when OpenHands/critic-rubrics-style rubric-supervised critic semantics change for source identity, no-license boundary, arXiv version, release tags, README, pyproject, dependency lock, rubric feature taxonomy, type-safe function-calling schema, annotator/prediction modules, trajectory converter, batch annotation docs/scripts, tests/workflows, sparse outcome proxy, best-of-N reranking metrics, early-stopping metrics, data-curation policy, threshold policy, signed evidence, or row hashes.",
          migration: "Regenerate badges or reports before comparing OpenHands/critic-rubrics-style, Critic Rubrics, rubric-supervised critic, sparse real-world outcome, behavior-feature, type-safe function-calling LLM-as-judge, best-of-N reranking, early-stopping, SWE-bench rerankable subset, or critic-methodology claims."
        },
        {
          trigger: "cryptography_benchmark_methodology_change",
          versionImpact: "Increment corpus, verification-protocol, scoring, and methodology versions when cryptography benchmark paper version, task family inventory, MCQ/CTF/proof task counts, expert review policy, answer keys, CTF sandbox/toolchain, automated agent framework, proof rubrics/reference solutions, human baseline, scoring formula, dataset license, or release manifest changes.",
          migration: "Regenerate badges or reports before comparing AICrypto-style, cryptography-capability, MCQ, CTF, formal-proof, vulnerability-exploitation, expert-baseline, or crypto benchmark methodology claims."
        }
      ]
    },
    methodologyVersioningAssurance: {
      id: "metronous-telemetry-calibration-methodology-assurance",
      sourceRef: "github:kiosvantra/metronous",
      sourcePattern: "metronous_local_telemetry_benchmark_calibration" as const,
      publicMeaning: "Metronous-style local AI agent telemetry, benchmark aggregation, model calibration, threshold policy, local archive, and export-sanitization semantics used to prove that public methodology versions and badges are comparable.",
      requiredAuditFields: [
        "methodologyId",
        "methodologyVersion",
        "methodologyHash",
        "questionSetVersion",
        "changelogEntryHash",
        "deprecationNoticeHash",
        "migrationGuidanceHash",
        "telemetrySchemaHash",
        "benchmarkCorpusHash",
        "thresholdPolicyHash",
        "modelCalibrationReportHash",
        "costAccountingPolicyHash",
        "localArchiveManifestHash",
        "exportSanitizationPolicyHash",
        "badgeQueryParamHash",
        "diagnosticReceiptHash"
      ],
      badgeQueryParams: ["amc_methodology", "amc_methodology_hash", "amc_methodology_assurance"],
      diagnosticFields: ["methodology", "methodologyVersioning", "methodologyVersioning.receiptHash"],
      proofBinding: "diagnostic.methodologyVersioning plus badge amc_methodology_assurance hash, tied to public methodology changelog, deprecation notice, migration guidance, telemetry schema, benchmark corpus, thresholds, calibration, cost accounting, archive, and export-sanitization proof.",
      failClosedRule: "Reports and badges fail methodology-versioning assurance when the methodology hash, current changelog row, migration guidance, deprecation notice, telemetry schema, benchmark corpus, threshold policy, model calibration report, cost accounting, local archive, export sanitization, or badge assurance hash is missing.",
      noCopyBoundary: "AMC may use kiosvantra/metronous only as a high-level local telemetry, benchmark, threshold, archive, and model-calibration signal; AMC does not copy Metronous code, commands, configs, threshold values, docs, README prose, UI text/assets, plugin implementation, screenshots, database schemas, telemetry payloads, or benchmark examples."
    },
    sutroBatchMethodologyAssurance: {
      id: "sutro-batch-inference-methodology-assurance",
      sourceRef: "github:sutro-sh/sutro",
      sourcePattern: "sutro_unstructured_batch_inference_methodology" as const,
      publicMeaning: "Sutro-style grounded LLM judges, classifiers, extractors, serverless batch inference, DataFrame/file/source inputs, job priority, dry-run cost estimation, live observability, result export, retention, multi-model comparison, embeddings, and large-scale unstructured-data eval semantics used to prove public methodology comparability.",
      requiredAuditFields: [
        "methodologyId",
        "methodologyVersion",
        "methodologyHash",
        "sourceRepositorySnapshotHash",
        "licenseBoundaryHash",
        "functionDefinitionHash",
        "judgeClassifierExtractorSchemaHash",
        "inputDataSourceManifestHash",
        "inputOrderPreservationHash",
        "batchJobPriorityPolicyHash",
        "dryRunCostEstimateHash",
        "modelPoolManifestHash",
        "observabilityTraceSchemaHash",
        "resultExportManifestHash",
        "retentionPolicyHash",
        "multiModelComparisonHash",
        "embeddingJobManifestHash",
        "diagnosticReceiptHash"
      ],
      badgeQueryParams: ["amc_methodology", "amc_methodology_hash", "amc_methodology_assurance"],
      diagnosticFields: ["methodology", "methodologyVersioning", "methodologyVersioning.batchMethodologyProof", "methodologyVersioning.receiptHash"],
      proofBinding: "diagnostic.methodologyVersioning.batchMethodologyProof plus badge amc_methodology_assurance hash, tied to public methodology changelog, source repository snapshot, license boundary, function/schema, data-source, input-order, priority, dry-run cost, model-pool, observability, export, retention, multi-model, and embedding proof.",
      failClosedRule: "Reports and badges fail Sutro-style batch methodology assurance when methodology identity, source snapshot, license boundary, function/schema, input source, input-order preservation, priority policy, dry-run cost estimate, model pool, observability trace schema, result export, retention, multi-model comparison, embedding job, or diagnostic receipt proof is missing.",
      noCopyBoundary: "AMC may use sutro-sh/sutro only as a high-level unstructured-data batch inference, grounded judge/classifier/extractor, observability, result-export, retention, and cost-estimation methodology signal; AMC does not copy Sutro code, commands, SDK snippets, config files, README prose, docs prose, UI text/assets, screenshots, data samples, result previews, templates, package metadata, or implementation details."
    },
    agentBeltMethodologyAssurance: {
      id: "agent-belt-coding-agent-methodology-assurance",
      sourceRef: "github:jfrog/agent-belt",
      sourcePattern: "agent_belt_reproducible_coding_agent_methodology" as const,
      publicMeaning: "Agent Belt-style reproducible coding-agent evaluation semantics for multi-turn scenarios, agent adapters, workspace diffs, rule checks, multi-judge consensus, per-turn judging, pass@k/pass^k reliability, Git worktrees, optional Docker sandboxes, exports, and CI evidence used to prove public methodology comparability.",
      requiredAuditFields: [
        "methodologyId",
        "methodologyVersion",
        "methodologyHash",
        "sourceRepositorySnapshotHash",
        "licenseBoundaryHash",
        "releaseTagHash",
        "readmeHash",
        "docsGlossaryHash",
        "scenarioSchemaHash",
        "scenarioManifestHash",
        "agentAdapterRosterHash",
        "customAgentContractHash",
        "workspaceDiffCheckHash",
        "ruleCheckPolicyHash",
        "multiJudgeConsensusConfigHash",
        "perTurnJudgeConfigHash",
        "passKReliabilityPolicyHash",
        "passPowerKReliabilityPolicyHash",
        "worktreeIsolationPolicyHash",
        "dockerSandboxPolicyHash",
        "exportFormatManifestHash",
        "ciWorkflowHash",
        "packageReleaseDigest",
        "diagnosticReceiptHash",
        "acceptedEvidenceRefs",
        "rejectedEvidenceRefs",
        "rowHashes"
      ],
      badgeQueryParams: ["amc_methodology", "amc_methodology_hash", "amc_methodology_assurance"],
      diagnosticFields: ["methodology", "methodologyVersioning", "methodologyVersioning.agentBeltMethodologyProof", "methodologyVersioning.receiptHash"],
      proofBinding: "diagnostic.methodologyVersioning.agentBeltMethodologyProof plus badge amc_methodology_assurance hash, tied to source snapshot, Apache-2.0 license, release tag, README/docs, scenario schema and manifests, agent adapter roster, workspace diff and rule checks, multi-judge and per-turn judging config, pass@k/pass^k reliability policy, worktree/Docker isolation, export formats, CI, and package release digests.",
      failClosedRule: "Reports and badges fail Agent Belt-style methodology assurance when source snapshot, license, release, scenario schema, scenario manifest, agent adapter roster, custom-agent contract, workspace-diff checks, rule checks, judge configs, pass@k/pass^k reliability, worktree/Docker isolation, export manifest, CI workflow, package digest, or badge assurance hash is missing.",
      noCopyBoundary: "AMC may use jfrog/agent-belt only as a high-level reproducible coding-agent evaluation methodology signal; AMC does not copy Agent Belt code, commands, configs, scenarios, fixtures, test cases, agent prompts, docs prose, README prose, package artifacts, generated reports, screenshots, or implementation details."
    },
    scoreClaimBoundaries: [
      {
        boundary: "divergent_trajectory_reasoning",
        appliesWhen: "Any report, badge, benchmark receipt, or public claim describes an agent as creative, divergent, multi-path, resilient under dead-ends, or capable of unconventional problem solving.",
        publicDisclosure: "Success-only or single-path completion evidence does not establish divergent trajectory reasoning.",
        requiredEvidence: "Signed trajectory evidence that separates completed paths from off-path attempts and records multiple mechanism-distinct paths or rejected mechanisms.",
        migration: "Relabel success-only historical claims or regenerate reports with trajectory-divergence evidence before using divergent-capability language."
      },
      {
        boundary: "social_simulation_realism",
        appliesWhen: "Any report, badge, benchmark receipt, or public claim describes synthetic agents as realistic, human-like, community-representative, or faithful proxies for public discourse.",
        publicDisclosure: "Plausible or coherent synthetic responses do not establish distributional realism for social simulation.",
        requiredEvidence: "Matched empirical baseline evidence with signed distribution checks for harm prevalence, sentiment or affect, semantic alignment, lexical diversity, population/context labels, and detector limitations.",
        migration: "Relabel plausibility-only historical claims or regenerate reports with matched empirical distribution checks before using social-realism language."
      },
      {
        boundary: "persona_policy_realism",
        appliesWhen: "Any report, badge, benchmark receipt, or public claim describes simulated users as robust, human-like, task-preserving personas, or representative of challenging user behavior.",
        publicDisclosure: "A cooperative simulator, hand-written persona prompt, or stable task score does not establish robust persona-policy realism.",
        requiredEvidence: "Signed persona-policy evidence for policy identity, diversity cluster coverage, human-likeness, behavior coverage, task-goal preservation, and baseline-to-live persona distribution checks.",
        migration: "Reports generated under 2026.06.13-r13 should be regenerated or relabeled before using persona-policy realism, human-like user simulation, or robust persona benchmark claims."
      },
      {
        boundary: "ctf_live_evaluation_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, or public claim uses CTF or flag-solving results as proof of live cybersecurity-agent capability.",
        publicDisclosure: "Static, reused, or score-only CTF evidence does not establish uncontaminated live cybersecurity-agent capability.",
        requiredEvidence: "Signed live CTF evidence for event and challenge context, agent instance and team-account boundaries, flag acceptance, first-correct-flag forwarding, external-search contamination risk, competition-impact risk, and per-agent independence.",
        migration: "Reports generated under 2026.06.13-r15 should be regenerated or relabeled before using live CTF, cybersecurity benchmark, or flag-solving claims as external proof."
      },
      {
        boundary: "ctf_partial_credit_validity",
        appliesWhen: "Any report, badge, benchmark receipt, or public claim uses partial-credit CTF, VM challenge, or checkpoint-completion scores as proof of cybersecurity-agent progress.",
        publicDisclosure: "Binary solved/unsolved results, self-reported progress, or final answers alone do not establish partial CTF capability.",
        requiredEvidence: "Signed VM or sandbox environment snapshot, dataset DOI/version, VM image version or hash, challenge and checkpoint rubric hashes, full execution trace refs, terminal/tool/web-search setting refs, checkpoint labelling or judge evidence, partial-credit scoring version, and isolation boundary evidence.",
        migration: "Reports generated under 2026.06.13-r17 should be regenerated or relabeled before using version-specific partial-credit CTF, VM challenge, or checkpoint-completion claims as external proof."
      },
      {
        boundary: "multi_agent_privacy_leakage",
        appliesWhen: "Any report, badge, benchmark receipt, or public claim describes agents as privacy-safe, secret-preserving, or resistant to disclosure in multi-agent or social settings.",
        publicDisclosure: "Single-agent, single-turn, or static chat privacy evidence does not establish multi-agent privacy safety.",
        requiredEvidence: "Signed multi-turn, multi-agent interaction evidence with sensitive-disclosure labels, peer-exposure context, social-pressure context, safeguard state, and leakage-rate thresholds.",
        migration: "Relabel single-agent privacy claims or regenerate reports with multi-agent leakage evidence before using privacy-safe or secret-preserving language."
      },
      {
        boundary: "architectural_smell_repair",
        appliesWhen: "Any report, badge, benchmark receipt, or public claim describes agents as repairing architectural smells, reducing design debt, or improving codebase architecture.",
        publicDisclosure: "A reduced smell count, local test pass, or agent completion status does not by itself establish architectural repair quality.",
        requiredEvidence: "Signed evidence separating repair effectiveness, false-positive or acceptable-design classification, partial-validity handling, net new-smell or regression impact, and expert or policy review.",
        migration: "Reports generated under 2026.06.13-r7 should be regenerated or relabeled before using architectural repair, design-debt reduction, or codebase-quality improvement claims."
      },
      {
        boundary: "iterative_tournament_learning",
        appliesWhen: "Any report, badge, benchmark receipt, leaderboard, or public claim describes an agent as tournament-proven, strategically improving, peer-learning, rank-robust, or superior at iterative code-agent competition.",
        publicDisclosure: "A single tournament result, leaderboard row, or absolute score does not establish robust strategy coding or iterative learning ability.",
        requiredEvidence: "Signed tournament configuration, environment/version variant, player roster and opponent pool, submitted-code artifact hashes, battle-log or replay refs, round/seed/generation counts, ranking aggregation method, repeated-validation evidence, relative-ranking uncertainty, before/after learning deltas, opponent-code access policy, and leakage or contamination boundary.",
        migration: "Reports generated under 2026.06.13-r25 should be regenerated or relabeled before using tournament, leaderboard, peer-learning, or iterative code-agent benchmark claims as external proof."
      },
      {
        boundary: "enterprise_agent_eval_interop",
        appliesWhen: "Any report, badge, benchmark receipt, or public claim describes an enterprise productivity agent as interoperable, tool-evaluable, dataset-tested, MCP-ready, or comparable across registered agents and evaluation runs.",
        publicDisclosure: "A web UI result, local API response, sample-agent demo, or aggregate evaluation score does not establish enterprise agent evaluation interoperability.",
        requiredEvidence: "Signed dataset id/version, test-case ids, agent registration hash, agent endpoint contract hash, evaluation-run id, MCP or tool registry hash, tool-call trace hashes, response artifact hashes, result metric manifest, persistence/export receipt, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.13-r73 should be regenerated or relabeled before using enterprise agent interop, registered-agent evaluation, MCP tool-evaluation, dataset-tested productivity-agent, or cross-agent eval platform claims as external proof."
      },
      {
        boundary: "a2a_negotiation_transaction_methodology_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, Watch receipt, or public claim uses A2A-NT-style agent-to-agent negotiation, consumer-market transactions, buyer/seller delegation, price bargaining, budget or wholesale constraints, anomaly-labeled negotiation behavior, or clean-deal methodology as public score or benchmark evidence.",
        publicDisclosure: "An A2A-NT label, buyer/seller transcript, local negotiation run, accepted-deal rate, model leaderboard, product list, copied conversation, or README result alone does not establish comparable agent-to-agent negotiation methodology without versioned role, product, constraint, trace, extraction, judging, anomaly, provider, manifest, exclusion, signed-evidence, and methodology-hash proof.",
        requiredEvidence: "Signed methodology id, methodology version, methodology hash, benchmark id/version, repository snapshot hash, paper or source reference hash, dataset or product-catalog manifest hash, buyer-role policy hash, seller-role policy hash, buyer-model route hash, seller-model route hash, summary-model route hash, budget-scenario manifest, wholesale-constraint manifest, turn-limit config hash, conversation trace manifest, seller-offer extraction config hash, deal-outcome judge config hash, anomaly taxonomy hash, model-behavior flag manifest, diagnostic flag manifest, system-data flag manifest, provider usage or cost manifest, run-session manifest, clean-deal exclusion policy hash, report or badge migration guidance, signed evidence refs, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.13-r106 before using ShenzheZhu/A2A-NT-style, A2A-NT, agent-to-agent negotiation, consumer-market transaction, buyer/seller delegation, price bargaining, budget-constraint, wholesale-constraint, anomaly-labeled, or clean-deal methodology claims."
      },
      {
        boundary: "metronous_telemetry_calibration_methodology_integrity",
        appliesWhen: "Any report, badge, API response, Watch receipt, Shield receipt, or public claim uses Metronous-style local agent telemetry, benchmark aggregation, threshold policy, model calibration, local archive, export sanitization, or OpenCode-agent telemetry semantics to justify public methodology comparability.",
        publicDisclosure: "A Metronous label, repository metadata, README description, local CLI output, benchmark summary, threshold file, archive folder, model name, dashboard screenshot, or badge URL alone does not establish comparable public methodology versioning without telemetry schema, benchmark corpus, thresholds, calibration, cost accounting, archive, export-sanitization, changelog, migration, deprecation, methodology hash, badge-assurance, and diagnostic receipt proof.",
        requiredEvidence: "Signed methodology id, methodology version, methodology hash, question-set version, changelog row hash, deprecation-notice hash, migration-guidance hash, telemetry schema hash, benchmark corpus hash, threshold-policy hash, model-calibration report hash, cost-accounting policy hash, local archive manifest hash, export-sanitization policy hash, badge query-param hash, diagnostic methodology-versioning receipt hash, accepted evidence refs, rejected evidence refs, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.17-r143 before using kiosvantra/metronous-style, Metronous, local AI agent telemetry, benchmark aggregation, model calibration, threshold policy, OpenCode-agent telemetry, local archive, export sanitization, or methodology-versioning claims."
      },
      {
        boundary: "sutro_batch_methodology_versioning_integrity",
        appliesWhen: "Any report, badge, API response, Watch receipt, Shield receipt, or public claim uses Sutro-style grounded LLM judges, classifiers, extractors, batch inference, large-scale evals, synthetic data, semantic tagging, embeddings, DataFrame/file/S3 inputs, observability, result export, retention, or cost-estimation semantics to justify public methodology comparability.",
        publicDisclosure: "A Sutro label, repository metadata, README description, SDK method name, local notebook output, batch job id, model name, DataFrame preview, result download, dashboard screenshot, or dry-run estimate alone does not establish comparable public methodology versioning without source snapshot, license, function/schema, data-source, input-order, priority, cost, model-pool, observability, export, retention, multi-model, embedding, methodology-hash, badge-assurance, and diagnostic receipt proof.",
        requiredEvidence: "Signed methodology id, methodology version, methodology hash, source repository snapshot hash, license boundary hash, function definition hash, judge/classifier/extractor schema hash, input data-source manifest hash, input-order preservation hash, batch priority policy hash, dry-run cost estimate hash, model-pool manifest hash, observability trace schema hash, result export manifest hash, retention policy hash, multi-model comparison hash, embedding job manifest hash, diagnostic methodology-versioning receipt hash, accepted evidence refs, rejected evidence refs, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.19-r159 before using sutro-sh/sutro-style, Sutro, unstructured-data batch inference, grounded LLM judge, classifier, extractor, synthetic-data, semantic-tagging, embedding, DataFrame, CSV, Parquet, S3, observability, dry-run cost, retention, result-export, or large-scale eval methodology claims."
      },
      {
        boundary: "agent_belt_methodology_versioning_integrity",
        appliesWhen: "Any report, badge, API response, Watch receipt, Shield receipt, or public claim uses Agent Belt-style reproducible coding-agent evals, multi-turn scenarios, agent adapter comparisons, workspace diffs, rule checks, multi-judge consensus, per-turn judging, pass@k/pass^k reliability, Git worktrees, Docker sandboxes, export formats, or CI release evidence to justify public methodology comparability.",
        publicDisclosure: "An Agent Belt label, repository metadata, README description, release tag, local eval output, scenario file name, agent adapter name, workspace diff summary, rule-check result, judge name, aggregate pass@k/pass^k number, CI badge, package artifact, or source metadata alone does not establish comparable public methodology versioning without source snapshot, Apache-2.0 license, release, README/docs, scenario schema and manifest, agent-adapter roster, custom-agent contract, workspace-diff and rule-check policies, multi-judge and per-turn configs, pass@k/pass^k reliability policy, worktree/Docker isolation, export manifest, CI workflow, package digest, badge-assurance, signed evidence, and row hashes.",
        requiredEvidence: "Signed methodology id, methodology version, methodology hash, source repository snapshot hash, Apache-2.0 license boundary hash, release tag hash, README hash, docs glossary hash, scenario schema hash, scenario manifest hash, agent-adapter roster hash, custom-agent contract hash, workspace-diff check hash, rule-check policy hash, multi-judge consensus config hash, per-turn judge config hash, pass@k reliability policy hash, pass^k reliability policy hash, worktree isolation policy hash, Docker sandbox policy hash, export format manifest hash, CI workflow hash, package release digest, diagnostic methodology-versioning receipt hash, accepted evidence refs, rejected evidence refs, signed evidence refs, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.19-r178 before using jfrog/agent-belt-style, Agent Belt, coding-agent eval, multi-turn scenario, agent adapter, workspace-diff, rule-check, multi-judge consensus, per-turn judging, pass@k, pass^k, worktree, Docker sandbox, export, CI, package-release, or methodology-versioning claims."
      },
      {
        boundary: "rss_market_impact_methodology_integrity",
        appliesWhen: "Any report, badge, API response, Watch receipt, Shield receipt, or public claim uses RSS/news polling, LLM market-impact classification, importance or asset-class labels, push alerts, dedupe ledgers, analysis ledgers, or Trump RSS trade-style market-news monitoring as public methodology or score evidence.",
        publicDisclosure: "A repository title, README summary, copied config, copied RSS or tweet row, copied analysis row, provider name, local daemon run, alert screenshot, push notification, star count, or source metadata alone does not establish comparable public methodology versioning without source snapshot, no-license boundary, feed source, model route, prompt/schema, taxonomy, dedupe, analysis, push, rate-limit, threshold, outcome/backtest, evaluator, methodology hash, migration guidance, signed evidence, and row-hash proof.",
        requiredEvidence: "Signed methodology id, methodology version, methodology hash, question-set version, changelog row hash, deprecation-notice hash, migration-guidance hash, source repository snapshot hash, no-license boundary hash, feed source hash, polling-window policy hash, model provider route hash, prompt/schema policy hash, importance taxonomy hash, asset-class taxonomy hash, dedupe ledger hash, analysis ledger hash, push policy hash, rate-limit policy hash, alert threshold hash, evaluator config hash, backtest report hash, outcome-window policy hash, cost-accounting hash, latency-accounting hash, diagnostic methodology-versioning receipt hash, accepted evidence refs, rejected evidence refs, signed evidence refs, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.19-r184 before using EliotYang/trump_rss_trade-style, Trump RSS trade, RSS market-impact monitor, OpenAI or Gemini market-impact alert, feed polling, push notification, importance or asset-class labels, or news-driven market-impact methodology claims."
      },
      {
        boundary: "credence_engine_live_drift_integrity",
        appliesWhen: "Any report, badge, Watch receipt, Shield receipt, API response, or public claim uses Credence Engine-style Bayesian decision-theoretic agent evaluation, value-of-information routing, expected-utility decisions, posterior calibration, benchmark drift experiments, or decision-quality metrics as live capability or drift evidence.",
        publicDisclosure: "A repository title, archive badge, AGPL label, README/SPEC summary, experiment filename, local run log, aggregate decision score, posterior chart, VOI label, expected-utility claim, model/provider label, or source metadata alone does not establish live agent-evaluation drift reliability without source, repository, license, archive, benchmark harness, experiment manifest, tests, posterior trace, VOI and expected-utility policy, baseline/live results, drift statistic, alert receipt, signed evidence, and row-hash proof.",
        requiredEvidence: "Signed benchmark id, source reference hash, repository snapshot hash, license reference hash, archive-status hash, README blob hash, SPEC blob hash, package manifest hash, lockfile hash, results artifact hash, experiment manifest hash, benchmark harness hash, test-suite hash, posterior trace hash, value-of-information policy hash, expected-utility policy hash, baseline result hash, live result hash, drift statistic hash, alert receipt hash, experiment mode, decision policy, decision quality, posterior calibration, VOI efficiency, expected-utility gain, evidence coverage, context distribution, signed evidence refs, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.19-r185 before using gfrmin/credence-engine-style, Credence Engine, Bayesian decision agents, value-of-information routing, expected-utility decisions, posterior calibration, benchmark drift experiments, or live agent-evaluation drift claims."
      },
      {
        boundary: "skill_forge_autoresearch_replay_integrity",
        appliesWhen: "Any report, badge, Watch receipt, Shield receipt, API response, or public claim uses Skill Forge-style autonomous skill improvement, iterative skill mutation, no-human-in-loop autoresearch, composite skill scoring, or SkillBench regression-gate replay evidence as proof of agent evaluation quality.",
        publicDisclosure: "A Skill Forge label, repository metadata, README description, homepage screenshot, agent filename, skill file, composite-score script name, example session, local mutation loop output, aggregate with-skill score, CI badge, model/provider label, or source metadata alone does not establish replayable skill-improvement evidence without source, repository/license/homepage, README/release/skill spec, agent-role manifest, orchestrator/mutator/scorer/hypothesis agents, scoring script, templates, example session, improvement-loop, mutation/revert policies, replay manifest, CI receipt, signed evidence, and row-hash proof.",
        requiredEvidence: "Signed benchmark id, source reference hash, repository snapshot hash, license reference hash, homepage snapshot hash, README blob hash, release-notes hash, skill spec hash, agent-role manifest hash, orchestrator agent hash, mutator agent hash, scorer agent hash, hypothesis agent hash, composite score script hash, template manifest hash, example session hash, improvement-loop manifest hash, mutation policy hash, revert policy hash, skill manifest hash, baseline-agent config hash, with-skill agent config hash, eval-suite hash, eval-case manifest hash, deterministic-grader hash, static-analysis hash, security-scan hash, baseline output hash, with-skill output hash, rerun output hash, result report hash, replay command hash, replay manifest hash, release-gate receipt, CI receipt hash, deterministic seed, eval-case count, correctness/security/completeness/robustness metrics, score delta, thresholds, signed evidence refs, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.19-r186 before using GodModeAI2025/skill-forge-style, Skill Forge, autonomous skill improvement, iterative skill mutation, autoresearch, no-human-in-loop skill optimization, composite scoring, or SkillBench regression-gate replay claims."
      },
      {
        boundary: "critic_rubrics_methodology_integrity",
        appliesWhen: "Any report, badge, API response, Watch receipt, Shield receipt, or public claim uses OpenHands/critic-rubrics-style rubric-supervised critic, behavior-feature rubric, sparse real-world outcome prediction, type-safe function-calling LLM-as-judge, best-of-N reranking, early stopping, or SWE-bench rerankable subset methodology as public score evidence.",
        publicDisclosure: "A Critic Rubrics label, repository metadata, README description, arXiv abstract, local batch annotation run, model output, aggregate best-of-N metric, aggregate early-stopping metric, function name, rubric name, release tag, or source metadata alone does not establish comparable public methodology versioning without source snapshot, no-license boundary, arXiv version, release, rubric feature taxonomy, function-calling schema, sparse outcome proxy, reranking and early-stopping reports, thresholds, signed evidence, and row hashes.",
        requiredEvidence: "Signed methodology id, methodology version, methodology hash, source repository snapshot hash, no-license boundary hash, arXiv version hash, release tag hash, README hash, pyproject hash, dependency lock hash, package tree hash, rubric base implementation hash, trajectory rubric implementation hash, trajectory converter hash, annotator module hash, prediction module hash, function-calling schema hash, rubric feature taxonomy hash, batch annotation docs hash, batch annotation script hashes, tests and workflows hash, sparse outcome proxy manifest hash, SWE-bench rerankable subset manifest hash, reranking metric report hash, early-stopping metric report hash, data-curation policy hash, threshold policy hash, diagnostic methodology-versioning receipt hash, accepted evidence refs, rejected evidence refs, signed evidence refs, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.19-r173 before using OpenHands/critic-rubrics-style, Critic Rubrics, rubric-supervised critic, sparse real-world outcome, behavior-feature, type-safe function-calling LLM-as-judge, best-of-N reranking, early-stopping, SWE-bench rerankable subset, or critic-methodology claims."
      },
      {
        boundary: "miniappbench_interactive_html_replay_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, Watch alert, Shield receipt, or public claim uses MiniAppBench-style interactive HTML generation, MiniAppEval, browser automation, live MiniApp interaction, generated application code, visual rendering, dynamic interaction, or human-alignment evidence as agent benchmark proof.",
        publicDisclosure: "A MiniAppBench label, repository metadata, query count, leaderboard row, copied evaluation reference, generated HTML sample, local Playwright run, screenshot, aggregate MiniAppEval score, or model/provider label alone does not establish replayable interactive-app benchmark quality without source, dataset, generated-app, live-instance, browser-automation, withheld-reference, metric, threshold, signed-evidence, and no-copy proof.",
        requiredEvidence: "Signed benchmark id/version, source reference hash, repository snapshot hash, license-review hash, dataset manifest hash, query-set hash, evaluation-reference manifest hash, generated MiniApp manifest hash, generated source-code hash, live-instance manifest hash, browser-automation trace hash, interaction-rubric hash, visual-render report hash, dynamic-interaction report hash, result manifest hash, replay command hash, CI receipt hash, task categories and threshold, query count and threshold, deterministic seed, withheld-reference boundary proof, no-copy source-boundary proof, browser-automation success, interaction coverage, human-alignment score, replay pass rate, baseline/candidate scores, score delta, regression threshold, signed evidence refs, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.17-r144 before using MiniAppBench/miniappbench-style, MiniAppBench, MiniAppEval, interactive HTML generation, browser automation, generated MiniApp, withheld-reference, visual-render, dynamic-interaction, or human-alignment replay claims."
      },
      {
        boundary: "knowlytics_ai_replay_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, Watch alert, Shield receipt, API response, or public claim uses Knowlytics-AI-style MCQ generation, RAG-backed quiz generation, self-evaluation scoring, or targeted improvement feedback as agent benchmark evidence.",
        publicDisclosure: "A Knowlytics-AI label, repository metadata, README summary, Streamlit app screenshot, copied quiz, local MCQ generation run, RAG demo, score percentage, provider name, placeholder API key, or source metadata alone does not establish replayable MCQ/RAG evaluation quality without source, no-license, owned fixture, trace, threshold, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed benchmark id/version, source reference hash, repository snapshot hash, no-license boundary hash, README blob hash, Streamlit app hash, MCQ generator hash, RAG generator hash, evaluator hash, requirements hash, demo-artifact hash where reviewed, AMC-owned synthetic document corpus hash, quiz spec hash, MCQ fixture hash, answer key hash, student response hash, evaluator rubric hash, retrieval trace hash, generation trace hash, scoring trace hash, performance-feedback hash, result manifest hash, replay command hash, CI receipt hash, task-category and provider-family coverage, question and answer-option counts with thresholds, deterministic seed, no-license boundary proof, no-raw-PDF-copy boundary proof, secret-placeholder review proof, baseline/candidate quiz scores, score delta, regression threshold, replay pass rate, retrieval coverage, evaluator-feedback coverage, signed evidence refs, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.19-r195 before using Sathyajitanand2004/Knowlytics-AI-style, Knowlytics-AI, MCQ generation, RAG self-evaluation, Streamlit quiz evaluation, targeted improvement feedback, or MCQ/RAG replay-corpus claims."
      },
      {
        boundary: "calibra_public_methodology_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, Watch alert, Shield receipt, API response, or public claim uses Calibra-style coding-agent benchmark harnesses, campaign matrices, task fixtures, model/provider rankings, skills, MCP servers, environment overlays, trial reports, analysis reports, comparison reports, or dashboard exports as public methodology evidence.",
        publicDisclosure: "A Calibra label, repository metadata, README summary, dashboard screenshot, copied task, local run output, aggregate pass rate, model ranking, token-cost number, command name, task folder, config snippet, or source metadata alone does not establish comparable public methodology versioning without source, license, campaign, matrix, task, agent, model/provider, overlay, seed, budget, trial/report, dashboard/export, changelog, deprecation, migration, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed methodology id, methodology version, methodology hash, source reference hash, repository snapshot hash, MIT license reference hash, homepage snapshot hash, default branch hash, README blob hash, pyproject hash, lockfile hash, package tree hash, docs tree hash, task fixture tree hash, test suite tree hash, campaign config hash, campaign matrix hash, agent instructions hash, model/provider matrix hash, skill/MCP/environment overlay hash, deterministic seed policy hash, budget policy hash, trial report schema hash, analysis report hash, comparison report hash, web-dashboard/export proof hash, methodology changelog hash, methodology deprecation notice, migration guidance hash, CI receipt hash, metric owner, sample size, confidence interval policy, signed evidence refs, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.19-r196 before using Swival/calibra-style, Calibra, coding-agent benchmark harness, campaign matrix, task fixture, model/provider ranking, skill/MCP/environment overlay, trial report, analysis report, comparison report, dashboard export, or public-methodology claims."
      },
      {
        boundary: "spent_session_cost_replay_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, Watch alert, Shield receipt, or public claim uses spent-style Claude Code session-cost tracking, efficiency scoring, productive/wasted classification, local JSONL logs, dashboard exports, JSON export, or no-telemetry boundaries as agent benchmark proof.",
        publicDisclosure: "A spent label, repository metadata, CLI score, local cost number, dashboard screenshot, JSON export, copied session log, aggregate efficiency score, model/provider label, or source metadata alone does not establish replayable session-cost quality without source, hook-config, JSONL-manifest, pricing, classifier, command-transcript, dashboard, result, replay, CI, privacy-boundary, metric, threshold, signed-evidence, and no-copy proof.",
        requiredEvidence: "Signed benchmark id/version, source reference hash, repository snapshot hash, license reference hash, hook config hash, JSONL log manifest hash, pricing snapshot hash, classifier rules hash, command transcript hash, dashboard export hash, result manifest hash, replay command hash, CI receipt hash, privacy boundary hash, session and tool-event counts with thresholds, deterministic seed, baseline/candidate efficiency, efficiency delta, regression threshold, baseline/candidate cost, cost delta, cost-increase threshold, replay pass rate, classification coverage, JSON export validity, no-telemetry boundary proof, signed evidence refs, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.17-r148 before using loplop-h/spent-style, spent, Claude Code session-cost tracking, efficiency score, productive/wasted classification, local JSONL logs, live dashboard, JSON export, no-telemetry, or session-cost replay claims."
      },
      {
        boundary: "fire_fact_checking_replay_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, Watch alert, Shield receipt, or public claim uses FIRE-style atomic-claim fact-checking, iterative retrieval and verification, dynamic retrieval depth, factuality, evidence recall, label agreement, or LLM/search cost-efficiency evidence as agent benchmark proof.",
        publicDisclosure: "A FIRE label, repository metadata, paper abstract, copied architecture diagram, local run, aggregate factuality score, cost reduction number, search-provider label, model/provider label, or source metadata alone does not establish replayable fact-checking quality without source, paper, dataset, atomic-claim, retriever, verifier, decision-policy, search-provider, trace, cost, result, replay, CI, metric, threshold, signed-evidence, and no-copy proof.",
        requiredEvidence: "Signed benchmark id/version, source reference hash, repository snapshot hash, paper reference hash, dataset manifest hash, atomic-claim manifest hash, retriever config hash, verifier config hash, decision policy hash, search-provider config hash, evidence trace hash, query trace hash, verification-label hash, cost report hash, result manifest hash, replay command hash, CI receipt hash, atomic-claim and retrieval-step counts with thresholds, max retrieval depth, deterministic seed, baseline/candidate factuality, factuality delta, regression threshold, baseline/candidate LLM cost, LLM cost delta, LLM cost-increase threshold, baseline/candidate search cost, search cost delta, search cost-increase threshold, replay pass rate, evidence recall, label agreement, dynamic retrieval boundary proof, search-provider boundary proof, signed evidence refs, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.19-r149 before using mbzuai-nlp/fire-style, FIRE, atomic-claim fact-checking, iterative retrieval and verification, dynamic retrieval-depth, Serper/search-provider, factuality, evidence recall, label agreement, or cost-efficiency replay claims."
      },
      {
        boundary: "nuclia_rag_triad_replay_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, Watch alert, Shield receipt, or public claim uses Nuclia-style RAG evaluation, REMi, RAG triad, answer relevance, context relevance, groundedness, model-cache, Hugging Face gated-model access, or RAG-evaluation replay evidence as agent benchmark proof.",
        publicDisclosure: "A Nuclia label, repository metadata, README metric list, package version, local Python snippet, Hugging Face model name, model-cache path, aggregate RAG triad score, copied question/context/answer sample, screenshot, or source metadata alone does not establish replayable RAG-triad quality without source, license, package, model-access, evaluator, dataset, QA-context, metric, trace, result, replay, CI, threshold, signed-evidence, and no-raw-context-copy proof.",
        requiredEvidence: "Signed benchmark id/version, source reference hash, repository snapshot hash, license reference hash, package version hash, model-card reference hash, model-cache policy hash, Hugging Face auth-boundary hash, evaluator config hash, dataset manifest hash, question-answer-context manifest hash, metric manifest hash, answer-relevance trace hash, context-relevance trace hash, groundedness trace hash, result manifest hash, replay command hash, CI receipt hash, query/context-piece/metric counts with thresholds, deterministic seed, baseline/candidate answer relevance, context relevance, groundedness and composite scores, composite score delta, regression threshold, replay pass rate, model-access boundary proof, no-raw-context-copy boundary proof, signed evidence refs, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.19-r150 before using nuclia/nuclia-eval-style, Nuclia, REMi, RAG triad, answer relevance, context relevance, groundedness, model-cache, gated-model access, or RAG evaluation replay claims."
      },
      {
        boundary: "navi_bench_web_agent_live_drift_integrity",
        appliesWhen: "Any report, badge, Watch receipt, Shield receipt, or public claim uses Navi-Bench-style real-website web-agent task success, crash rate, lower/excluding-crashed/upper score bounds, browser-provider behavior, saved trajectory, per-task visualization, step-limit, or website-domain drift evidence as live capability proof.",
        publicDisclosure: "A Navi-Bench label, repository metadata, README result screenshot, dataset card, local demo command, aggregate success rate, task URL, visualization screenshot, model/provider label, or source metadata alone does not establish live web-agent quality without source, repository, license, dataset, task config, evaluator, browser-provider, baseline/live result, trajectory, visualization, screenshot, alert, score-bound, threshold, signed-evidence, row-hash, and no-copy proof.",
        requiredEvidence: "Signed benchmark id/version, source reference hash, repository snapshot hash, license reference hash, Hugging Face dataset reference hash, blog/reference hash where cited, task id, real-website domain taxonomy, task config hash, evaluator config hash, agent config hash, browser mode and provider hashes, baseline result hash, live result hash, saved trajectory hash, visualization artifact hash, screenshot trace hash, alert receipt hash, task finished/crashed/success flags, lower-bound score, excluding-crashed score, upper-bound score, step count, max-step threshold, evidence coverage, baseline/live distributions, drift statistic, thresholds, signed evidence refs, row hashes, and no-copy source-boundary proof.",
        migration: "Regenerate or relabel reports generated under 2026.06.19-r151 before using yutori-ai/navi-bench-style, Navi-Bench, real-website web-agent, Apartments/Craigslist/OpenTable/Resy/Google Flights, browser-provider, crash-adjusted score, trajectory, visualization, or web-agent live-drift claims."
      },
      {
        boundary: "agent_trial_statistical_question_explainability_integrity",
        appliesWhen: "Any report, badge, Score drilldown, Shield receipt, Watch view, or public claim uses AgentTrial-style repeated statistical agent evaluation, pytest-for-agents suites, confidence intervals, failure attribution, regression detection, bootstrap cost/latency, or Agent Reliability Score as question-level evidence.",
        publicDisclosure: "An AgentTrial label, repository metadata, PyPI package version, local CLI output, aggregate pass rate, dashboard screenshot, CI green check, README result, or source metadata alone does not establish question-level score explainability without suite, case, repeated-trial, confidence-interval, regression, trajectory, failure-attribution, CI, signed-evidence, row-hash, and no-copy proof.",
        requiredEvidence: "Signed suite id, source reference hash, repository snapshot hash, package reference hash, adapter taxonomy value, case id/name, suite manifest hash, case manifest hash, run manifest hash, trial manifest hash, statistical report hash, trajectory bundle hash, failure-attribution hash, baseline result hash, candidate result hash, CI config hash, CI run id, dashboard snapshot hash when claimed, trial count and threshold, pass count, pass rate and threshold, Wilson confidence level, Wilson lower and upper bounds, minimum Wilson lower bound, bootstrap cost and latency means with thresholds, Agent Reliability Score and threshold, failure-attribution step and p-value, regression test name, non-regression p-value threshold, accepted evidence refs, rejected-evidence reasons, repair hint, signed evidence refs, row hashes, and no-copy source-boundary proof.",
        migration: "Regenerate or relabel reports generated under 2026.06.19-r152 before using alepot55/agentrial-style, AgentTrial, pytest-for-agents, repeated statistical agent trials, Wilson confidence interval, failure attribution, regression detection, Agent Reliability Score, or statistical question-explainability claims."
      },
      {
        boundary: "codequest_quality_question_explainability_integrity",
        appliesWhen: "Any report, badge, Score drilldown, Shield receipt, Watch view, or public claim uses CodeQuest-style code-quality evaluator/optimizer loops, actor-critic improvement, dimension-level code-quality feedback, before/after score movement, or optimizer-grounded repair evidence as question-level evidence.",
        publicDisclosure: "A CodeQuest label, repository metadata, archived/public status, README evaluator/optimizer description, local notebook run, OpenAI API key setup, code-quality dimension name, aggregate quality score, copied prompt/config, or source metadata alone does not establish question-level score explainability without source status, repository, license, code artifact, evaluator, optimizer, feedback, patch, loop trace, regression, replay, CI, dimension-delta, signed-evidence, row-hash, and no-source-copy proof.",
        requiredEvidence: "Signed framework id, source reference hash, repository snapshot hash, license reference, source archive/status hash, task id, language, code artifact hash, evaluator prompt hash, evaluator config hash, optimizer prompt hash, optimizer config hash, baseline evaluation hash, candidate evaluation hash, evaluator feedback hash, optimizer grounding hash, improvement patch hash, actor-critic loop trace hash, regression suite hash, replay command hash, CI run id, CI config hash, no-source-copy boundary hash, dimension count and threshold, baseline and candidate overall scores, overall score delta and threshold, dimension regression count and threshold, evaluator-feedback coverage and threshold, optimizer-grounding coverage and threshold, dimension ids/labels/baseline/candidate scores/deltas/statuses, accepted evidence refs, rejected-evidence reasons, repair hint, signed evidence refs, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.19-r156 before using jpmorganchase/CodeQuest-style, CodeQuest, code-quality evaluator/optimizer, actor-critic code improvement, readability/security/maintainability/efficiency dimensions, or CodeQuest-style question-explainability claims."
      },
      {
        boundary: "agentkernelarena_gpu_kernel_replay_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, Watch alert, Shield receipt, or public claim uses AgentKernelArena-style GPU-kernel optimization, HIP, Triton, Torch2HIP, workspace-isolated agent benchmarking, compile/correctness/performance scoring, speedup, or A/B agent comparison evidence as replay-corpus proof.",
        publicDisclosure: "An AgentKernelArena label, repository metadata, README leaderboard placeholder, local demo URL, agent roster name, task category name, GPU model label, compile log, aggregate speedup, or source metadata alone does not establish replayable GPU-kernel benchmark quality without source, license, task, workspace, GPU, command, result, replay, CI, threshold, signed-evidence, and no-leaderboard-only proof.",
        requiredEvidence: "Signed benchmark id/version, source reference hash, repository snapshot hash, license reference hash, task manifest hash, task config hash, agent roster hash, agent config hash, prompt template hash, workspace isolation hash, environment manifest hash, GPU profile hash, dependency lock hash, compile/correctness/performance command hashes, baseline and candidate kernel hashes, compile/correctness result hashes, performance profile hash, score report hash, run log hash, replay command hash, CI receipt hash, comparison report hash, task categories and threshold, agent types and threshold, task count and threshold, deterministic seed, compilation success rate and threshold, correctness pass rate and threshold, baseline/candidate speedup, speedup delta and regression threshold, replay pass rate, result coverage, workspace-isolation proof, no-leaderboard-only boundary proof, signed evidence refs, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.19-r153 before using AMD-AGI/AgentKernelArena-style, AgentKernelArena, GPU-kernel optimization, HIP, Triton, Torch2HIP, compile/correctness/performance, speedup, A/B agent, or workspace-isolated kernel benchmark replay claims."
      },
      {
        boundary: "llm_evaluation_system_jury_replay_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, Watch alert, Shield receipt, or public claim uses awslabs/llm-evaluation-system-style agentic evaluation, MCP evaluation, jury scoring, binary criteria, document-grounded synthetic QA, Bedrock/OpenTelemetry traces, PDF reports, or S3 team-sharing as replay-corpus proof.",
        publicDisclosure: "An LLM Evaluation System label, repository metadata, PyPI package version, MCP install command, local run, judge-family name, PDF report, report screenshot, S3 bucket name, model family name, aggregate jury score, copied prompt/config, or source metadata alone does not establish replayable jury-evaluation quality without source, package, MCP, dataset, judge, trace, result, report, sharing, replay, CI, threshold, signed-evidence, and no-copy/no-report-only/no-config-only proof.",
        requiredEvidence: "Signed benchmark id/version, source reference hash, repository snapshot hash, license reference hash, package version hash, MCP install manifest hash, dataset manifest hash, synthetic QA manifest hash, document-grounding manifest hash, judge config hash, jury roster hash, criteria manifest hash, binary scoring policy hash, execution manifest hash, agent trace manifest hash, OpenTelemetry trace hash, Bedrock access boundary hash, result manifest hash, analysis report hash, PDF report hash, S3 sync receipt hash, replay command hash, CI receipt hash, no-config-only boundary hash, modes and judge families with thresholds, dataset and evaluation-case counts with thresholds, judge and criterion counts with thresholds, deterministic seed, baseline/candidate jury scores, jury score delta and regression threshold, binary-scoring coverage, judge agreement, replay pass rate, report coverage, agent-trace coverage, no-synthetic-data-copy boundary proof, no-PDF-report-only boundary proof, signed evidence refs, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.19-r154 before using awslabs/llm-evaluation-system-style, LLM Evaluation System, MCP evaluation, jury scoring, binary criteria, document-grounded synthetic QA, Bedrock/OpenTelemetry agent evaluation, PDF report, S3 team-sharing, or multi-judge replay claims."
      },
      {
        boundary: "innovatorbench_research_replay_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, Watch alert, Shield receipt, or public claim uses GAIR-NLP/InnovatorBench-style LLM research-agent evaluation, ResearchGym workspaces, long-horizon research tasks, checkpointed runs, tool-using research workflows, or leaderboard context as replay-corpus proof.",
        publicDisclosure: "An InnovatorBench label, repository metadata, ICLR acceptance note, Hugging Face dataset name, README leaderboard placeholder, local ResearchGym run, task-domain name, agent name, tool list, aggregate final score, copied task config, or source metadata alone does not establish replayable research-agent quality without source, paper, dataset, task, ResearchGym, tool, environment, checkpoint, result, metric, replay, CI, threshold, signed-evidence, and no-leaderboard/no-dataset-copy proof.",
        requiredEvidence: "Signed benchmark id/version, source reference hash, repository snapshot hash, license reference hash, paper reference hash, Hugging Face dataset reference hash, task manifest hash, task config hash, ResearchGym config hash, agent config hash, tool registry hash, workspace dataset-path policy hash, environment manifest hash, Docker/web backend hash, multi-GPU/node manifest hash, checkpoint manifest hash, execution manifest hash, result manifest hash, metric manifest hash, score report hash, replay command hash, CI receipt hash, no-leaderboard-only boundary hash, no-dataset-copy boundary hash, research domains and threshold, tool surfaces and threshold, environment modes and threshold, task count and threshold, max eval times and threshold, deterministic seed, baseline/candidate final scores, final score delta and regression threshold, baseline/candidate best scores, best score delta and regression threshold, replay pass rate, result coverage, checkpoint-restore coverage, tool-evidence coverage, no-leaderboard-only proof, no-dataset-copy proof, signed evidence refs, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.19-r155 before using GAIR-NLP/InnovatorBench-style, InnovatorBench, ICLR 2026 LLM research-agent, ResearchGym, Hugging Face dataset, data-construction, loss-design, reward-design, scaffold-construction, checkpointed long-horizon, or multi-GPU research replay claims."
      },
      {
        boundary: "multimodal_rag_methodology_versioning",
        appliesWhen: "Any report, badge, benchmark receipt, or public claim uses multimodal RAG, mixed text/image retrieval, multimodal generation, image-grounded answer quality, image interleaving, or text/image metric scores.",
        publicDisclosure: "Text-only RAG, aggregate multimodal scores, or local demo transcripts do not establish comparable multimodal RAG capability without methodology-versioned modality coverage.",
        requiredEvidence: "Signed source/provenance evidence for text and image corpus, query set, topic/domain coverage, retrieval and in-document element selection, image extraction/filtering/deduplication, modality representation, output-image placeholder or interleaving policy, evaluator/judge model and rubric, text-modal metrics, image coherence/helpfulness/reference/recall metrics, overall-score formula, score thresholds, evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.13-r85 should be regenerated or relabeled before using M2RAG-style, multimodal RAG, mixed text/image, image-grounded response, image-interleaving, or multimodal benchmark score claims."
      },
      {
        boundary: "rag_audit_methodology_versioning",
        appliesWhen: "Any report, badge, benchmark receipt, or public claim uses generated QA pairs, one-minute RAG audit, endpoint-based RAG evaluation, detailed RAG answer metrics, failure diagnosis, support-span grounding, local/cloud RAG judge comparison, or MCP/server RAG audit telemetry.",
        publicDisclosure: "A generated QA file, notebook plot, CLI summary, screenshot, average score, provider/model label, README example, or copied evaluation row does not establish comparable RAG audit quality without methodology-versioned QA generation, judging, diagnosis, and privacy boundaries.",
        requiredEvidence: "Signed methodology version, generated QA dataset manifest hash, source document manifest hash, support-span provenance, QA generation prompt/audience/purpose config hash, RAG endpoint contract hash, judge model/provider config hash, evaluation run config hash, per-question result hash, detailed metric definitions for correctness/completeness/relevance/conciseness/faithfulness, failure-diagnosis taxonomy, retriever/generator attribution evidence, output report/export hashes, privacy local-vs-cloud disclosure, MCP/server telemetry boundary where used, thresholds, evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.13-r87 should be regenerated or relabeled before using RagScore-style, RAG audit, generated-QA, endpoint RAG evaluation, detailed RAG metric, failure-diagnosis, support-span grounding, local LLM RAG evaluation, or MCP RAG audit claims."
      },
      {
        boundary: "soc_dataset_replay_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, or public claim uses SOC endpoint telemetry narratives, ATT&CK-aligned labels, generated analyst rationales, supported SOC action labels, cross-model audit summaries, LAB/REAL dataset splits, or validated synthetic labels as agent benchmark evidence.",
        publicDisclosure: "Raw telemetry counts, generated narratives, JSONL samples, ATT&CK labels, model-audit summaries, README tables, or dataset release notes do not establish replayable SOC-agent benchmark quality without dataset provenance, schema validation, label-quality, and replay thresholds.",
        requiredEvidence: "Signed benchmark id/version, repository snapshot hash, release manifest hash, source corpus manifest hash, LAB and REAL dataset hashes, conversion script hash, labeling prompt hash, output schema hash, ATT&CK mapping hash, SOC action schema hash, validation report hash, label-quality report hash, cross-model audit report hash, dataset and code license hashes, replay command hash, deterministic seed, environment, label source, raw event count, validated record count, risk-class coverage, MITRE tactic coverage, supported action coverage, parse-success, schema-validity, verdict-consistency, unknown tactic and technique rates, invalid action count, evidence-support score, ATT&CK-alignment score, replay pass rate, score delta, thresholds, evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.13-r88 should be regenerated or relabeled before using AD-GEN-style, SOC dataset replay, ATT&CK-aligned endpoint narrative, LLM SOC automation, synthetic analyst label, or cross-model SOC audit claims."
      },
      {
        boundary: "network_troubleshooting_metric_validity",
        appliesWhen: "Any report, badge, metric-validation row, or public claim uses dynamic network incidents, topology tiers, fault injection, session traces, agent/tool interfaces, root-cause localization, or batch troubleshooting evaluation as proof of agent capability.",
        publicDisclosure: "A network arena label, aggregate troubleshooting score, README result, CLI run, topology name, local demo, or copied incident row does not establish comparable network troubleshooting validity without scenario, topology, incident, fault, tool, metric, ground-truth, batch, and CI proof.",
        requiredEvidence: "Signed benchmark manifest, paper or source reference, network scenario manifest, topology tier manifest, incident catalog, fault-injection manifest, session trace manifest, agent interface manifest, MCP/tool manifest, environment runtime manifest, evaluation metric manifest, judge config manifest, batch summary artifact, root-cause ground truth, localization ground truth, traffic workload manifest, metric owner, sample size, confidence interval, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.13-r89 should be regenerated or relabeled before using sands-lab/nika-style, NIKA, network troubleshooting benchmark, dynamic network incident, topology-tier, fault-injection, root-cause localization, MCP/tool, or batch-evaluation metric-validity claims."
      },
      {
        boundary: "inference_optimization_metric_validity",
        appliesWhen: "Any report, badge, metric-validation row, or public claim uses InferenceBench-style open-ended inference-serving optimization, server-contract, hardware-budget, runtime-backend, quality-gated, integrity-gated, clean-relaunch, latency, throughput, or tail-latency evidence as proof of agent capability.",
        publicDisclosure: "An inference benchmark label, aggregate speedup, local server run, README result, GPU name, backend label, latency number, throughput number, or copied leaderboard row does not establish comparable inference optimization validity without scenario, hardware, server-contract, backend/search-space, quality/integrity, relaunch, metric, exploration, owner, sample-size, and CI proof.",
        requiredEvidence: "Signed benchmark manifest, paper or source reference, scenario objective manifest, hardware budget manifest, server contract manifest, runtime backend manifest, search space manifest, baseline comparison manifest, quality gate result, integrity gate result, supervised relaunch result, latency and throughput metrics, tail latency metrics, exploration trace manifest, metric owner, sample size, confidence interval, signed evidence refs, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.13-r102 before using aisa-group/InferenceBench-style, InferenceBench, inference-serving optimization, TTFT, TPOT, throughput, multi-objective, quality-gated, integrity-gated, clean-relaunch, or open-ended ML systems-engineering metric-validity claims."
      },
      {
        boundary: "java_coding_agent_metric_validity",
        appliesWhen: "Any report, badge, metric-validation row, or public claim uses Agent Bench-style Java-centric coding-agent benchmarks, YAML benchmark definitions, isolated workspaces, CLI-agent execution, cascaded judge tiers, Maven/JUnit/JaCoCo checks, result manifests, accuracy, or pass@k evidence as proof of agent capability.",
        publicDisclosure: "A Java coding-agent benchmark label, YAML file, CLI run, local Maven output, README example, project name, judge-tier label, coverage number, result JSON, accuracy/pass@k score, or copied benchmark row does not establish comparable Java coding-agent validity without source, task, sandbox, lifecycle, agent config, jury, checks, result, owner, sample-size, and CI proof.",
        requiredEvidence: "Signed benchmark manifest, source repository and license reference, Java task manifest, YAML benchmark manifest, workspace template manifest, isolated sandbox manifest, provide lifecycle trace, setup/post script manifest, CLI-agent config, cascaded jury manifest, judge tier policy, Maven build check, JUnit test result, JaCoCo coverage report, result JSON manifest, accuracy/pass@k metric, metric owner, sample size, confidence interval, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.13-r112 should be regenerated or relabeled before using spring-ai-community/agent-bench-style, Agent Bench, Java-centric coding-agent benchmark, isolated sandbox, YAML benchmark, cascaded judge, Maven, JUnit, JaCoCo, accuracy, or pass@k metric-validity claims."
      },
      {
        boundary: "ai_agent_benchmark_comparison_replay_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, Watch alert, or public claim uses AI coding-agent comparison, pricing comparison, user-report synthesis, SWE-Bench leaderboard context, source-manifest evidence, or tool/model ranking evidence as agent benchmark proof.",
        publicDisclosure: "An AI-agent comparison label, README table, aggregate rank, pricing row, user-report quote, GitHub metadata, copied data file, local comparison script, or leaderboard score does not establish replayable AI-agent benchmark comparison quality without source, roster, benchmark, pricing, user-report, replay, score-delta, CI, threshold, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed benchmark id/version, source reference hash, repository snapshot hash, license reference hash, agent roster hash, benchmark dataset hash, source manifest hash, pricing snapshot hash, user-report manifest hash, leaderboard snapshot hash, score manifest hash, eval-pack manifest hash, fixture hash, replay command hash, result manifest hash, score-delta report hash, CI receipt hash, comparison run id, agent-under-test id/category, benchmark-family and source-category coverage, agent/source/benchmark counts, deterministic seed, baseline/candidate scores, score delta, replay pass rate, source/pricing/user-report coverage, thresholds, signed evidence refs, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.13-r116 before using murataslan1/ai-agent-benchmark-style, AI Agents Benchmark, AI coding-agent comparison, pricing comparison, user-report synthesis, source-manifest, SWE-Bench leaderboard context, or AI-agent ranking claims."
      },
      {
        boundary: "gaia_agent_replay_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, Watch alert, Shield receipt, or public claim uses gaia-agent/gaia-agent-style GAIA benchmark-ready agent evaluation, AI SDK ToolLoopAgent behavior, benchmark runner/evaluator/reporter proof, or browser/search/memory/planning/sandbox tool-use evidence as replay-corpus proof.",
        publicDisclosure: "A GAIA-agent label, repository metadata, README claim, local benchmark command, package manifest, benchmark result note, tool name list, aggregate GAIA score, model/provider label, or source metadata alone does not establish replayable GAIA-agent benchmark quality without source, license, benchmark harness, docs/results, source/test tree, fixed seed, provider/model/run config, output, score report, replay, CI, threshold, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed benchmark id/version, source reference hash, repository snapshot hash, license reference hash, README blob hash, package manifest hash, lockfile hash, benchmark tree hash, downloader hash, runner hash, evaluator hash, reflection evaluator hash, reporter hash, benchmark workflow hash, benchmark docs hash, benchmark results hash, validation docs hash, source tree hash, test tree hash, task manifest hash, dataset snapshot hash, fixed seed, provider config hash, model route hash, run config hash, run output hash, score report hash, replay command hash, CI receipt hash, tool surfaces and threshold, sample count and threshold, replay pass rate and threshold, score delta and threshold, evaluator agreement and threshold, tool trace coverage and threshold, result coverage and threshold, signed evidence refs, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.19-r168 before using gaia-agent/gaia-agent-style, GAIA benchmark-ready super-agent, AI SDK ToolLoopAgent, browser/search/memory/planning/sandbox tool-use, benchmark runner/evaluator/reporter, or GAIA-agent replay claims."
      },
      {
        boundary: "paperarena_replay_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, Watch alert, Shield receipt, or public claim uses PaperArena-style tool-augmented scientific-literature reasoning, paper-QA, PDF parsing, retrieval, database search, web search, code execution, LLM-as-judge scoring, or Hugging Face PaperArena dataset evidence as replay-corpus proof.",
        publicDisclosure: "A PaperArena label, GitHub metadata, README abstract, project-page link, arXiv link, Hugging Face dataset card, local run script name, model name, tool list, performance image, aggregate accuracy, or source metadata alone does not establish replayability without source/no-license proof, README/requirements/config/runner/scorer proof, dataset-builder/tool/RAG/reflector/run-script refs, dataset snapshot, paper/QA manifests, deterministic replay command, result/score reports, CI/lifecycle receipt, tool-surface coverage, evaluator agreement, trace/result coverage, signed evidence, and row-hash proof.",
        requiredEvidence: "Signed benchmark id/version, source repository reference, no-license-boundary reference, default-branch repository snapshot, README blob hash, requirements hash, hub config hash, hub runner hash, result-recorder hash, data-loader hash, scorer hash, dataset-builder tree hash, tool tree hash, RAG tree hash, reflector tree hash, run-script tree hash, Hugging Face dataset snapshot hash, dataset manifest hash, paper corpus hash, QA manifest hash, result manifest hash, score report hash, replay command hash, CI receipt hash, tool-surface ids and threshold, question count and threshold, paper count and threshold, tool count and threshold, run-script count and threshold, deterministic seed, max steps and threshold, replay pass rate and threshold, score delta and threshold, evaluator agreement and threshold, tool-trace coverage and threshold, result coverage and threshold, signed evidence refs, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.19-r182 before using ustc-ai4science/PaperArena-style, PaperArena, tool-augmented scientific-literature reasoning, paper-QA, PDF/retrieval/database/search/code tool-use, Hugging Face PaperArena dataset, or PaperArena replay claims."
      },
      {
        boundary: "social_reasoning_bench_replay_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, Watch alert, Shield receipt, or public claim uses microsoft/social-reasoning-bench-style social-domain agent evaluation, calendar-scheduling, marketplace, whimsygen, privacy, due-diligence, outcome-optimality, or social reasoning benchmark evidence as replay-corpus proof.",
        publicDisclosure: "A Social Reasoning Bench label, repository metadata, README description, homepage, local validation command, task-domain name, YAML data filename, output folder, aggregate score, model/provider label, or source metadata alone does not establish replayable social-domain benchmark quality without source, license, data/package/script/harness proof, fixed seed, replay, CI, thresholds, signed evidence, and row-hash proof.",
        requiredEvidence: "Signed benchmark id/version, source reference hash, repository snapshot hash, license reference hash, README blob hash, pyproject hash, lockfile hash, data tree hash, docs tree hash, experiments tree hash, outputs tree hash, packages tree hash, scripts tree hash, runner hash, collector hash, validation script hash, workflow hash, result artifact hash, CI receipt hash, domain/package/scenario mode coverage and thresholds, data-domain count and threshold, fixture count and threshold, pipeline-output count and threshold, test count and threshold, output-artifact count and threshold, deterministic seed, replay pass rate and threshold, score delta and threshold, result coverage and threshold, signed evidence refs, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.19-r171 before using microsoft/social-reasoning-bench-style, Social Reasoning Bench, social-domain agent, calendar-scheduling, marketplace, whimsygen, privacy, due-diligence, outcome-optimality, or replay-corpus claims."
      },
      {
        boundary: "besttester_replay_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, Watch alert, Shield receipt, or public claim uses nshportun/BestTester-style Playwright QA-agent evaluation, LLM-as-Judge QA, MCP testing, security fuzzing, CI/CD, Jira/Slack reporting, mutation testing, or test-healing agent evidence as replay-corpus proof.",
        publicDisclosure: "A BestTester label, repository metadata, README description, package name, local Playwright run, AI-test workflow name, agent filename, Jira/Slack mention, security-fuzzer mention, aggregate pass rate, model/provider label, or source metadata alone does not establish replayable QA-agent benchmark quality without source, license, TypeScript/Playwright/test/agent/MCP/security/workflow proof, replay, CI, thresholds, signed evidence, and row-hash proof.",
        requiredEvidence: "Signed benchmark id/version, source reference hash, repository snapshot hash, license reference hash, README blob hash, package.json hash, lockfile hash, tsconfig hash, Playwright config hash, source tree hash, tests tree hash, agents tree hash, MCP tree hash, config tree hash, scripts tree hash, mutation tree hash, reports tree hash, workflow tree hash, MCP server hash, MCP client hash, LLM judge rubric hash, security fuzzer hash, Jira report hash, result artifact hash, CI receipt hash, capability/test-surface/agent-role coverage and thresholds, workflow count and threshold, agent count and threshold, TypeScript file count and threshold, test file count and threshold, page-object count and threshold, security-signal count and threshold, Jira/Slack integration count and threshold, deterministic seed, replay pass rate and threshold, score delta and threshold, LLM judge agreement and threshold, security coverage and threshold, CI coverage and threshold, signed evidence refs, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.19-r172 before using nshportun/BestTester-style, BestTester, Playwright QA-agent, LLM-as-Judge QA, MCP testing, security fuzzing, CI/CD, Jira/Slack reporting, mutation-testing, test-healing, or QA automation replay claims."
      },
      {
        boundary: "academiclaw_metric_validity",
        appliesWhen: "Any report, badge, metric-validation row, Shield receipt, Watch alert, or public claim uses GAIR-NLP/AcademiClaw-style bilingual academic tasks, OpenClaw/AcademicLaw workspaces, university student-sourced task rubrics, conversation traces, meta-evals, or model-roster comparisons as proof of metric quality.",
        publicDisclosure: "An AcademiClaw label, repository metadata, README abstract, homepage, copied task prompt, copied rubric, local OpenClaw run, model roster, aggregate academic-task score, conversation-log excerpt, meta-eval file name, or source metadata alone does not establish comparable academic-task metric validity without source, task corpus, bilingual coverage, workspace query, Docker, rubric, runner, result, trace, meta-eval, model-roster, metric, CI, owner, confidence-interval, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed source repository reference, license or no-assertion review reference, default-branch snapshot, commit and tree refs, README blob, CITATION manifest, academic task corpus manifest, bilingual language manifest, workspace query manifest, Docker environment manifest, evaluation rubric manifest, eval-task runner manifest, OpenClaw result manifest, conversation trace manifest, meta-eval manifest, model roster manifest, metric definition manifest, CI regression manifest, task count, language count, rubric count, trace count, meta-eval count, model count, regression pass-rate proof, metric owner, sample size, confidence interval, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.19-r169 should be regenerated or relabeled before using GAIR-NLP/AcademiClaw-style, AcademiClaw, AcademicLaw/OpenClaw, bilingual academic-task, university student-sourced task, rubric, conversation-trace, meta-eval, or academic-agent metric-validity claims."
      },
      {
        boundary: "rag_chunking_technique_metric_validity",
        appliesWhen: "Any report, badge, metric-validation row, Shield receipt, Watch alert, or public claim uses IBM/rag-chunking-techniques-style policy corpus, simple or smart chunking notebooks, RAG evaluation notebooks, retrieval pipeline, embedding/vectorstore, or chunking strategy comparisons as proof of metric quality.",
        publicDisclosure: "A repository label, README sentence, notebook filename, copied policy text, local notebook run, chunking strategy name, vectorstore label, aggregate RAG score, chart, or source metadata alone does not establish comparable RAG chunking technique metric validity without source, license, default-branch, README, policy corpus, simple RAG notebook, smart chunking notebook, RAG evaluation notebook, chunking strategy, retrieval pipeline, embedding/vectorstore, evaluation dataset, metric, CI, owner, sample-size, confidence-interval, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed source repository reference, license reference, default-branch snapshot, commit and tree refs, README blob, policy corpus manifest, simple RAG notebook manifest, smart chunking notebook manifest, RAG evaluation notebook manifest, chunking strategy manifest, retrieval pipeline manifest, embedding/vectorstore manifest, evaluation dataset manifest, metric definition manifest, CI regression manifest, policy document count, notebook count, chunking strategy count, evaluation question count, metric count, regression pass-rate proof, metric owner, sample size, confidence interval, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.19-r170 should be regenerated or relabeled before using IBM/rag-chunking-techniques-style, RAG chunking technique, simple RAG notebook, smart chunking notebook, RAG evaluation notebook, policy corpus, retrieval pipeline, embedding/vectorstore, or metric-validity claims."
      },
      {
        boundary: "kubernetes_operational_agent_metric_validity",
        appliesWhen: "Any report, badge, metric-validation row, Shield receipt, Watch alert, or public claim uses hariohmprasath/k8s-ai-style Kubernetes management, Kubernetes MCP tooling, diagnostics, resource monitoring, smart log analysis, or operational-agent benchmark evidence as proof of metric quality.",
        publicDisclosure: "A k8s-ai label, repository metadata, README description, Kotlin language tag, release tag, JAR filename, tool class name, local cluster demo, aggregate operational score, or source metadata alone does not establish comparable Kubernetes operational-agent metric validity without source/license, default-branch, README, release asset, build workflow, agent module, MCP server, Kubernetes tool inventory, diagnostic/resource/log-analysis, metric definition, CI, owner, sample-size, confidence-interval, signed-evidence, artifact-hash, and row-hash proof.",
        requiredEvidence: "Signed source repository reference, license reference, default-branch snapshot, commit and tree refs, README blob, release asset manifest, build workflow manifest, agent module manifest, MCP server manifest, Kubernetes tool inventory manifest, tool category count, diagnostic capability manifest and count, resource monitoring manifest and count, log-analysis manifest and count, metric definition manifest, CI regression manifest, regression pass-rate proof, metric owner, sample size, confidence interval, signed evidence refs, artifact hashes, and row hashes.",
        migration: "Reports generated under 2026.06.19-r187 should be regenerated or relabeled before using hariohmprasath/k8s-ai-style, Kubernetes operational agent, Kubernetes MCP agent, diagnostics, resource monitoring, smart log analysis, or operational-agent metric-validity claims."
      },
      {
        boundary: "secure_vibe_bench_metric_validity",
        appliesWhen: "Any report, badge, metric-validation row, Shield receipt, Watch alert, or public claim uses iCSawyer/SecureVibeBench-style secure vibe coding, vulnerability-introducing scenario reconstruction, secure coding agent benchmark, adapter roster, scenario corpus, or test-script evidence as proof of metric quality.",
        publicDisclosure: "A SecureVibeBench label, repository metadata, README claim, ACL badge, arXiv link, dataset filename, evaluation runner filename, agent adapter name, test-script folder, parser utility name, aggregate score, star count, language tag, or source metadata alone does not establish comparable SecureVibeBench secure-coding metric-validity without source/license/homepage, default branch, README, results, dataset, format example, evaluation runner, adapter roster, vulnerability scenario, test script, parser utility, patch-diff utility, metric definition, CI, owner, sample-size, confidence-interval, signed-evidence, artifact-hash, and row-hash proof.",
        requiredEvidence: "Signed source repository reference, license reference, homepage or arXiv reference, default-branch snapshot, commit and tree refs, README blob, results manifest, dataset manifest, format example manifest, evaluation runner manifest, agent adapter roster and count, vulnerability scenario manifest and count, test script manifest and count, parser utility manifest, patch-diff utility manifest, metric definition manifest, CI regression manifest, regression pass-rate proof, metric owner, sample size, confidence interval, signed evidence refs, artifact hashes, and row hashes.",
        migration: "Reports generated under 2026.06.19-r189 should be regenerated or relabeled before using iCSawyer/SecureVibeBench-style, SecureVibeBench, secure vibe coding, vulnerability-introducing scenario reconstruction, secure coding agent benchmark, adapter roster, scenario corpus, test-script, or metric-validity claims."
      },
      {
        boundary: "ai_evaluation_guide_methodology_integrity",
        appliesWhen: "Any report, badge, API response, Score/Shield/Watch receipt, or public claim uses hparreao/Awesome-AI-Evaluation-Guide-style evaluation guides, benchmark taxonomies, metric-selection advice, tools/platform listings, production-evaluation practices, LLM evaluation, RAG evaluation, or agentic AI evaluation evidence as public methodology or score evidence.",
        publicDisclosure: "An Awesome AI Evaluation Guide label, repository metadata, README section, guide heading, benchmark name, tool or platform name, copied metric example, example script, local guide run, aggregate score, star count, topic tag, or source metadata alone does not establish comparable methodology without source/license, default branch, README guide manifest, benchmark guide manifest, tools/platforms guide manifest, metric-selection taxonomy, threshold, calibration, component trace, human-in-loop review, cost-control, deprecation, migration, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed methodology id, methodology version, methodology hash, source repository reference, license reference, default-branch snapshot, commit and tree refs, README blob, benchmark guide manifest, tools/platforms guide manifest, docs manifest, example manifest, metric-selection taxonomy hash, threshold policy hash, calibration policy hash, component trace policy hash, human-in-loop policy hash, cost-control policy hash, deprecation notice hash, migration guidance hash, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.19-r188 should be regenerated or relabeled before using hparreao/Awesome-AI-Evaluation-Guide-style, Awesome-AI-Evaluation-Guide, AI evaluation guide, LLM evaluation, RAG evaluation, agentic AI evaluation, benchmark taxonomy, tool taxonomy, metric-selection, threshold, calibration, trace, human-review, cost-control, deprecation, or migration methodology claims."
      },
      {
        boundary: "agent_scenario_test_metric_validity",
        appliesWhen: "Any report, badge, metric-validation row, Shield receipt, Watch alert, or public claim uses Agentest-style scenario-based agent testing, simulated users, scripted multi-turn conversations, tool-call mocks, trajectory assertions, LLM-as-judge metrics, comparison mode, or CI reporter output as proof of metric quality.",
        publicDisclosure: "An Agentest label, README example, copied scenario, local test output, CI green check, screenshot, aggregate pass rate, mocked-tool transcript, judge score, config snippet, or source metadata does not establish comparable scenario-test metric validity without source, endpoint, scenario, persona, goal, knowledge, tool mock, turn, trajectory, judge, comparison, result, owner, sample-size, and CI proof.",
        requiredEvidence: "Signed benchmark manifest, source repository and license reference, agent endpoint contract, scenario manifest, simulated user persona manifest, goal and knowledge manifest, tool mock manifest, scripted turn manifest, trajectory assertion manifest, LLM judge metric manifest, comparison run manifest, CI reporter manifest, result artifact manifest, metric owner, sample size, confidence interval, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.13-r117 should be regenerated or relabeled before using r-prem/agentest-style, Agentest-style, scenario-based testing, simulated-user, scripted multi-turn, tool-call mock, trajectory assertion, LLM-as-judge, comparison-mode, or CI-reporter metric-validity claims."
      },
      {
        boundary: "opencode_lab_metric_validity",
        appliesWhen: "Any report, badge, metric-validation row, Shield receipt, Watch alert, or public claim uses OpenCode-lab-style lab recipes, benchmark experiments, determinism checks, context assembly, prompt/tool/AGENTS policy provenance, fork agreement, cross-model variance, or ground-truth correction evidence as proof of metric reliability.",
        publicDisclosure: "An OpenCode lab label, README recipe, copied prompt, local shell output, source metadata, context dump, tool-description snippet, single deterministic run, model/provider label, aggregate pass rate, or benchmark folder name does not establish comparable metric validity without source, lab, context, prompt, tool, AGENTS policy, repeated-run, fork-agreement, model-variance, ground-truth, metric-definition, CI, result, owner, sample-size, and CI proof.",
        requiredEvidence: "Signed source repository reference, lab benchmark manifest, agent context manifest, prompt variant manifest, tool description manifest, AGENTS policy manifest, repeated-run trace, fork agreement report, model variance report, ground-truth correction manifest, metric definition manifest, CI reporter manifest, result artifact manifest, metric owner, sample size, confidence interval, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.17-r135 should be regenerated or relabeled before using criterium/opencode-lab-style, OpenCode lab, deterministic-reliability, context-assembly, prompt/tool/AGENTS provenance, fork-agreement, model-variance, or ground-truth-correction metric-validity claims."
      },
      {
        boundary: "cc_plugin_eval_metric_validity",
        appliesWhen: "Any report, badge, metric-validation row, Shield receipt, Watch alert, or public claim uses cc-plugin-eval-style Claude Code plugin evaluation, component triggering, skill/agent/command activation, trigger phrases, generated scenarios, programmatic detection, LLM judge calibration, checkpoint/resume, or cost-estimate evidence as proof of metric reliability.",
        publicDisclosure: "A plugin-eval label, README workflow, local run, component name list, trigger phrase list, generated scenario, transcript snippet, LLM judge score, cost estimate, checkpoint file, CI green check, aggregate activation rate, or source metadata does not establish comparable metric validity without source, license, plugin, component, trigger, scenario, transcript, programmatic detection, judge calibration, conflict, checkpoint, cost, CI, result, owner, sample-size, and CI proof.",
        requiredEvidence: "Signed source repository and license reference, plugin manifest, component inventory manifest, trigger phrase manifest, scenario generation manifest, scenario-type coverage report, execution transcript bundle, programmatic detection report, LLM judge calibration report, conflict detection report, checkpoint/resume state, cost estimate report, CI reporter manifest, result artifact manifest, trigger accuracy, false-positive rate, false-negative rate, metric owner, sample size, confidence interval, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.17-r139 should be regenerated or relabeled before using sjnims/cc-plugin-eval-style, Claude Code plugin evaluation, component-triggering, skill/agent/command activation, trigger phrase, scenario-generation, programmatic-detection, LLM-judge-calibration, checkpoint/resume, cost-estimate, or metric-validity claims."
      },
      {
        boundary: "realign_simulation_metric_validity",
        appliesWhen: "Any report, badge, metric-validation row, Shield receipt, Watch alert, or public claim uses Realign-style simulation-driven AI app testing, YAML-managed evaluators, scenario/persona simulation, repeated evaluator runs, LLM judge calibration, statistics, CI regression, or experiment tracking as proof of metric reliability.",
        publicDisclosure: "A Realign label, repository metadata, archived status, README claim, copied config, copied scenario, local simulation output, evaluator name list, single LLM judge score, pairwise score, ELO-style aggregate, CI green check, experiment dashboard note, or source metadata does not establish comparable metric validity without source/license, YAML config, app-under-test, dataset, scenario, persona, evaluator, target, trace, repeated-run, judge-calibration, statistics, CI, experiment, result, owner, sample-size, and confidence-interval proof.",
        requiredEvidence: "Signed source repository and license reference, YAML config manifest, app-under-test manifest, dataset manifest, scenario manifest, synthetic-user persona manifest, evaluator registry manifest, evaluator target manifest, simulation run trace, repeated-run trace, LLM judge calibration report, statistical rigor report, CI regression manifest, experiment tracking manifest, result artifact manifest, judge agreement, regression pass rate, scenario count, evaluator count, repeat count, metric owner, sample size, confidence interval, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.17-r141 should be regenerated or relabeled before using honeyhiveai/realign-style, Realign simulation, YAML evaluator config, synthetic-user/persona simulation, repeated evaluator runs, LLM judge calibration, statistical rigor, CI regression, experiment tracking, or metric-validity claims."
      },
      {
        boundary: "humanstudybench_metric_validity",
        appliesWhen: "Any report, badge, metric-validation row, Shield receipt, Watch alert, or public claim uses AISmithLab/HumanStudy-Bench-style participant simulation, human-study response comparison, social-science simulation, evaluator/scorer validity, inter-rater agreement, test-retest reliability, or validation-pipeline evidence as proof of metric quality.",
        publicDisclosure: "A HumanStudy-Bench label, repository metadata, README abstract, homepage, branch name, local validation run, copied study config, copied participant row, copied response row, evaluator filename, aggregate participant-simulation score, or source metadata does not establish comparable metric validity without source/license, live default-branch snapshot, study config, participant-background, human-response, agent-response, evaluator, metric, validator, scorer/standardizer, inter-rater, test-retest, validation pipeline, result, CI, owner, sample-size, and confidence-interval proof.",
        requiredEvidence: "Signed source repository and license reference, default-branch snapshot with commit reference, study config manifest, participant background manifest, human response manifest, agent response manifest, evaluator registry manifest, metric definition manifest, response validator manifest, scorer and standardizer manifest, inter-rater agreement report, test-retest reliability report, validation pipeline manifest, result artifact manifest, CI regression manifest, study count, participant count, response count, evaluator count, inter-rater agreement, test-retest reliability, validation pass rate, metric owner, sample size, confidence interval, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.19-r165 should be regenerated or relabeled before using AISmithLab/HumanStudy-Bench-style, HumanStudy-Bench, participant simulation, human-study response comparison, social-science simulation, evaluator/scorer validity, inter-rater agreement, test-retest reliability, or validation-pipeline metric-validity claims."
      },
      {
        boundary: "legacybench_metric_validity",
        appliesWhen: "Any report, badge, metric-validation row, Shield receipt, Watch alert, or public claim uses Factory-AI/legacy-bench-style legacy software engineering tasks, COBOL/Java/Fortran/Assembly/C repair or migration coverage, deterministic test-oracle evidence, replay commands, or software-agent benchmark results as proof of metric quality.",
        publicDisclosure: "A Legacy-Bench label, repository metadata, README claim, task directory name, branch name, copied task prompt, copied test script, local Docker output, solution script, aggregate pass rate, language list, CI badge, replay transcript, or source metadata does not establish comparable metric validity without source/license, live default-branch snapshot, README manifest, task corpus, legacy-language coverage, environment, harness, agent-task, patch-submission, test-oracle, evaluator, metric, CI, result, replay, owner, sample-size, and confidence-interval proof.",
        requiredEvidence: "Signed source repository reference, Apache-2.0 license reference, default-branch reference, commit hash, tree hash, README blob hash, task corpus tree hash, legacy-language manifest, environment/Docker manifest, harness runner manifest, agent-task manifest, patch-submission manifest, test-oracle manifest, evaluator registry, scoring metric manifest, CI reporter, regression pass-rate proof, result artifact hash, replay command manifest, replay pass-rate proof, metric owner, sample-size record, confidence interval, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.19-r166 should be regenerated or relabeled before using Factory-AI/legacy-bench-style, Legacy-Bench, legacy software engineering, COBOL/Java/Fortran/Assembly/C repair or migration, deterministic test-oracle, replay-command, or software-agent metric-validity claims."
      },
      {
        boundary: "subtlememory_metric_validity",
        appliesWhen: "Any report, badge, metric-validation row, Shield receipt, Watch alert, or public claim uses Yummytanmo/SubtleMemory-style fine-grained relational memory discrimination, long-horizon memory, persona histories, relation-controlled variants, staged memory evaluation, or diagnostic memory-system results as proof of metric quality.",
        publicDisclosure: "A SubtleMemory label, repository metadata, README abstract, arXiv abstract, Hugging Face dataset card, persona folder name, copied JSON row, local run, aggregate memory score, model/provider label, or source metadata alone does not establish comparable metric validity without source/license, live default-branch snapshot, arXiv version, Hugging Face dataset release, persona split, bench-instance manifest, history-session manifest, relation taxonomy, construction pipeline, staged evaluation protocol, adapter roster, judge/evaluator config, score summary, diagnostic protocol, CI validation, owner, sample-size, confidence-interval, signed evidence, and row-hash proof.",
        requiredEvidence: "Signed source repository and license reference, default-branch reference with commit and tree refs, arXiv paper version, Hugging Face dataset release and split/config refs, persona split manifest, bench-instance manifest, history-session manifest, relation taxonomy manifest, construction pipeline manifest, staged evaluation protocol, adapter roster manifest, judge and evaluator config, score summary report, diagnostic protocol report, CI validation manifest, persona count, bench-instance count, history-session count, memory-variant set count, relation-type count, evaluation-stage count, adapter count, judge agreement, validation pass rate, metric owner, sample size, confidence interval, signed evidence refs, artifact hashes, and row hashes.",
        migration: "Reports generated under 2026.06.19-r174 should be regenerated or relabeled before using Yummytanmo/SubtleMemory-style, SubtleMemory, fine-grained relational memory discrimination, long-horizon memory, persona split, relation-controlled memory variant, staged memory evaluation, judge/evaluator, diagnostic-protocol, or metric-validity claims."
      },
      {
        boundary: "ragas_notebook_metric_validity",
        appliesWhen: "Any report, badge, metric-validation row, Shield receipt, Watch alert, or public claim uses Coding-Crashkurse/RAG-Evaluation-with-Ragas-style RAGAS notebooks, testset generation, LangChain/Chroma/OpenAI RAG chains, RAGAS metrics, LangFuse score exports, visualizations, or RAG metric reliability proof.",
        publicDisclosure: "A RAGAS label, notebook filename, GitHub metadata, README claim, local notebook run, dependency list, copied output table, heatmap, LangFuse screenshot, metric names, aggregate RAGAS score, or source metadata alone does not establish comparable RAGAS metric validity without source/no-license-boundary, notebook, dependency, document, chunking, testset generator, evolution mix, generated testset, RAG chain, retriever/vectorstore, model/embedding, answer-context trace, metric suite, evaluation result, LangFuse score export, visualization, owner, sample-size/CI, signed evidence, and row hashes.",
        requiredEvidence: "Signed source repository reference, declared no-license-boundary or license reference, notebook manifest, dependency manifest, document corpus manifest, chunking config, testset generator config, simple/reasoning/multi_context evolution mix, generated testset manifest, RAG chain config, retriever and vectorstore config, model and embedding config, answer-context trace, RAGAS metric suite, RAGAS evaluation result, LangFuse trace and score export, visualization artifact, metric owner, sample size, confidence interval, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.17-r147 should be regenerated or relabeled before using Coding-Crashkurse/RAG-Evaluation-with-Ragas-style, RAGAS notebook, generated testset, LangChain/Chroma/OpenAI RAG chain, faithfulness, answer relevancy, context precision/recall, LangFuse scoring, or RAG metric-validity claims."
      },
      {
        boundary: "web_eval_dataset_metric_validity",
        appliesWhen: "Any report, badge, metric-validation row, Shield receipt, Watch alert, or public claim uses Tavily-style web-search RAG evaluation dataset generation, generated search queries, retrieved web documents, QA-pair generation, local or LangSmith export, freshness, source coverage, or answer grounding as proof of metric quality.",
        publicDisclosure: "A web-eval generator label, README workflow, local run, example subject list, API/provider name, saved dataset, generated QA pair, notebook output, screenshot, source metadata, or aggregate RAG score does not establish comparable web evaluation dataset validity without subject, query, search, document, filter, QA, export, freshness, metric, owner, sample-size, and CI proof.",
        requiredEvidence: "Signed benchmark manifest, source repository reference, subject manifest, generated query manifest, search provider config, retrieved document manifest, document filter manifest, QA generation manifest, reference answer manifest, dataset export manifest, output target manifest, validation report artifact, freshness snapshot, provider diversity metric, source coverage metric, answer grounding metric, metric owner, sample size, confidence interval, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.13-r114 should be regenerated or relabeled before using Eyalbenba/tavily-web-eval-generator-style, Tavily-style, web-search RAG eval dataset, generated-query, retrieved-document, QA-pair, local export, LangSmith export, freshness, source-coverage, or answer-grounding metric-validity claims."
      },
      {
        boundary: "parallel_research_skill_metric_validity",
        appliesWhen: "Any report, badge, metric-validation row, Shield receipt, Watch alert, or public claim uses Parallel/OpenClaw-style web research, source filtering, extraction, deep-research tasks, grounded chat, task groups, monitoring, citations, or benchmark claims as proof of metric quality.",
        publicDisclosure: "A Parallel skill label, repository metadata, README feature list, SKILL manifest title, API surface name, fast/agentic search mode, local wrapper run, citation excerpt, monitoring note, batch-size claim, benchmark claim, or source metadata alone does not establish comparable research-skill metric validity without source, license boundary, skill manifest, API surface, search mode, deep-research, chat grounding, extraction, citation provenance, source policy, batch, monitoring, security, dependency, benchmark-validation, owner, sample-size, and CI proof.",
        requiredEvidence: "Signed source repository reference, license boundary reference, skill manifest hash, API surface manifest hash, search-mode manifest hash, deep-research task manifest hash, chat-grounding manifest hash, extract-content manifest hash, citation provenance report hash, source policy manifest hash, batch execution manifest hash, monitoring manifest hash, security boundary hash, dependency lock hash, benchmark-claim validation report hash, metric owner, sample size, confidence interval, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.19-r157 should be regenerated or relabeled before using mvanhorn/clawdbot-skill-parallel-style, Parallel.ai skill, OpenClaw research skill, search/extraction/deep-research/grounded-chat/batch/monitoring/citation, or benchmark-claim metric-validity claims."
      },
      {
        boundary: "resume_rag_evaluator_metric_validity",
        appliesWhen: "Any report, badge, metric-validation row, Shield receipt, Watch alert, or public claim uses local Ollama resume parsing, candidate evaluation, job-description matching, RAG retrieval strategies, query expansion, batch evaluation, or resume-management metrics as proof of metric quality.",
        publicDisclosure: "A resume parser label, repository metadata, README feature list, local upload demo, model name, RAG strategy name, candidate score, batch evaluation mode, endpoint name, screenshot, or source metadata alone does not establish comparable resume-RAG evaluator validity without source, license boundary, upload/parser, job-description, RAG strategy, query expansion, retrieval, vector-store, Ollama/embedding model, endpoint, candidate-rating, batch, privacy, dependency, owner, sample-size, and CI proof.",
        requiredEvidence: "Signed source repository reference, declared no-license-boundary or license reference, resume upload manifest hash, resume parser manifest hash, job-description manifest hash, RAG strategy manifest hash, query expansion manifest hash, retrieval config manifest hash, vector-store manifest hash, Ollama model manifest hash, embedding model manifest hash, evaluation endpoint manifest hash, candidate rating report hash, batch evaluation manifest hash, privacy boundary hash, dependency lock hash, metric owner, sample size, confidence interval, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.19-r158 should be regenerated or relabeled before using punyaa18/ollama-resume-parser-style, local Ollama resume parser, RAG resume evaluator, PDF/TXT resume parsing, job-description matching, similarity/MMR/hybrid retrieval, query expansion, candidate rating, automatic/individual/bulk evaluation, or privacy-boundary metric-validity claims."
      },
      {
        boundary: "chipbenchmark_metric_validity",
        appliesWhen: "Any report, badge, metric-validation row, Shield receipt, Watch alert, or public claim uses wafer-ai/chipbenchmark-style hardware, model, precision, throughput, latency, pricing, or cost-efficiency benchmark evidence as proof of metric quality.",
        publicDisclosure: "A ChipBenchmark label, repository metadata, README quickstart, local frontend run, hardware name, model family, precision label, copied data row, aggregate chart, pricing number, or source metadata alone does not establish comparable hardware benchmark metric validity without source snapshot, no-license boundary, benchmark, hardware, model, precision, environment, runner/serving, result dataset, synced frontend dataset, pricing, throughput, latency, cost, regression-threshold, owner, sample-size, CI, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed source repository reference, declared no-license-boundary reference, benchmark manifest hash, hardware profile manifest hash, model-family manifest hash, precision-mode manifest hash, environment setup script hash, benchmark runner script hash, serving backend script hash, benchmark result dataset hash, synced frontend dataset hash, pricing dataset hash, throughput metric report hash, latency metric report hash, cost metric report hash, regression threshold hash, metric owner, sample size, confidence interval, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.19-r161 should be regenerated or relabeled before using wafer-ai/chipbenchmark-style, ChipBenchmark, GPU/accelerator LLM benchmark, hardware profile, model-family, precision-mode, throughput, latency, pricing, or cost-efficiency metric-validity claims."
      },
      {
        boundary: "hermes_bench_metric_validity",
        appliesWhen: "Any report, badge, metric-validation row, Shield receipt, Watch alert, or public claim uses Bent-Solutions/hermes-bench-style local LLM/agent benchmark UI, backend benchmark runner, judge calibration, task registry, adapters, result schema, frontend result review, regression tests, or Docker runtime evidence as proof of metric quality.",
        publicDisclosure: "A Hermes Bench label, repository metadata, README claim, local UI screenshot, benchmark-runner filename, judge filename, task registry name, adapter list, model/server config, copied result row, frontend component name, CI badge, Docker command, aggregate benchmark score, or source metadata alone does not establish comparable metric validity without source/license, live default-branch snapshot, README/build spec, backend runner, judge calibration, task registry, model/server config, adapter coverage, result schema, frontend review, backend/frontend regression, Docker runtime, owner, sample-size, confidence-interval, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed source repository and MIT license reference, default-branch reference with commit and recursive tree refs, README blob hash, build-spec blob hash, backend tree hash, benchmark runner hash, judge calibration manifest, task registry manifest, model/server config manifest, adapter coverage manifest, result schema manifest, frontend tree and result-review component hashes, backend regression test manifest, frontend regression test manifest, Docker/runtime manifest, task count, adapter count, backend test count, frontend test count, judge agreement, regression pass rate, metric owner, sample size, confidence interval, signed evidence refs, artifact hashes, and row hashes.",
        migration: "Reports generated under 2026.06.19-r176 should be regenerated or relabeled before using Bent-Solutions/hermes-bench-style, Hermes Bench, local LLM/agent benchmark UI, benchmark-runner, judge-calibration, task-registry, adapter-coverage, result-schema, frontend-review, regression, Docker-runtime, or metric-validity claims."
      },
      {
        boundary: "cooperbench_metric_validity",
        appliesWhen: "Any report, badge, metric-validation row, Shield receipt, Watch alert, or public claim uses cooperbench/CooperBench-style cooperative coding-agent tasks, conflicting software changes, team harnesses, agent adapters, CI workflows, or public reports as proof of metric quality.",
        publicDisclosure: "A CooperBench label, repository metadata, README claim, release tag, dataset folder name, feature patch, runner filename, eval backend filename, team-harness file name, agent adapter name, CI badge, public report page, aggregate cooperation score, conflict-resolution rate, or source metadata alone does not establish comparable metric validity without source/no-license boundary, release tag, live default-branch snapshot, README/changelog, dataset/task manifest, feature-conflict manifest, runner/coop harness, eval backend, team harness, agent-adapter roster, CI workflow, package lock, public report, owner, sample-size, confidence-interval, signed-evidence, artifact-hash, and row-hash proof.",
        requiredEvidence: "Signed source repository reference, declared no-license-boundary reference, release tag reference, default-branch reference with commit and tree refs, README blob hash, changelog hash, dataset tree hash, dataset README hash, task manifest and count, feature-conflict manifest and count, runner/coop harness hash, eval backend hash, team harness/protocol/metrics hashes, agent-adapter roster hash and count, CI workflow hashes, package and lockfile hashes, public report reference, cooperation score, conflict-resolution rate, regression pass rate, metric owner, sample size, confidence interval, signed evidence refs, artifact hashes, and row hashes.",
        migration: "Reports generated under 2026.06.19-r177 should be regenerated or relabeled before using cooperbench/CooperBench-style, CooperBench, cooperative coding-agent benchmark, conflict-resolution, team-harness, agent-adapter, public-report, or metric-validity claims."
      },
      {
        boundary: "codercup_metric_validity",
        appliesWhen: "Any report, badge, metric-validation row, Shield receipt, Watch alert, or public claim uses TestSprite/CoderCup-style continuous public coding-agent benchmark evidence, phase suites, runner contracts, score ledgers, live leaderboard artifacts, or cost-accounting references as proof of metric quality.",
        publicDisclosure: "A CoderCup label, GitHub metadata, README claim, CI badge, live leaderboard screenshot, runner name, suite directory, copied score row, aggregate composite score, vendor rank, cost total, or source metadata alone does not establish comparable metric validity without source/license/homepage proof, live default-branch snapshot, README/contributing, CI, package lock, task spec, test suite and suite indexes, runner contract, score ledger, live artifact, methodology/reference pages, cost accounting, owner, sample-size, confidence-interval, signed-evidence, artifact-hash, reliability, regression, and row-hash proof.",
        requiredEvidence: "Signed source repository, Apache-2.0 license, homepage reference, default-branch reference with commit and tree refs, README blob hash, CONTRIBUTING blob hash, CI workflow hash, package and lockfile hashes, task-spec tree/file hashes, test-suite tree hash, suite-index hashes, runner driver hashes, runner contract and run script hashes, score ledger hashes, live UI and fixture hashes, methodology and reference UI hashes, cost-methodology hash, metric names, phase count, test-plan count, runner count, score-ledger count, live-surface count, inter-rater agreement, test-retest reliability, regression pass rate, metric owner, sample size, confidence interval, signed evidence refs, artifact hashes, and row hashes.",
        migration: "Reports generated under 2026.06.19-r181 should be regenerated or relabeled before using TestSprite/CoderCup-style, CoderCup, continuous public coding-agent benchmark, phase suite, runner contract, score ledger, live leaderboard, TestSprite E2E verdict, cost-accounting, or metric-validity claims."
      },
      {
        boundary: "agentic_graph_rag_metric_validity",
        appliesWhen: "Any report, badge, metric-validation row, Shield receipt, Watch alert, or public claim uses mlvanguards/agentic-graph-rag-evaluation-cometml-style graph-RAG orchestration, vector-store, evaluation metric, experiment tracking, or UI question evidence as proof of metric quality.",
        publicDisclosure: "An Agentic Graph RAG label, repository metadata, README claim, graph file name, Neo4j or vector-store mention, evaluation script name, experiment tracker filename, Streamlit screenshot, predefined question list, dependency file, aggregate retrieval score, or source metadata alone does not establish comparable metric validity without source/no-license boundary, live default-branch snapshot, README, graph orchestrator, RAG pipeline, database/vector-store, evaluation metric, experiment tracking, UI question surface, dependency lock, owner, sample-size, confidence-interval, signed-evidence, artifact-hash, and row-hash proof.",
        requiredEvidence: "Signed source repository reference, declared no-license-boundary reference, default-branch reference with commit and tree refs, README blob hash, graph workflow hash and node/edge counts, orchestrator hash, RAG pipeline hash, database and vector-store hashes, evaluation metric hashes, experiment-tracker hash and experiment count, UI component and predefined-question hashes, dependency and lockfile hashes, retrieval grounding score, regression pass rate, metric owner, sample size, confidence interval, signed evidence refs, artifact hashes, and row hashes.",
        migration: "Reports generated under 2026.06.19-r179 should be regenerated or relabeled before using mlvanguards/agentic-graph-rag-evaluation-cometml-style, Agentic Graph RAG, graph-RAG orchestrator, RAG pipeline, vector-store, evaluation metric, experiment-tracking, UI-question, retrieval-grounding, or metric-validity claims."
      },
      {
        boundary: "awesome_agent_memory_live_drift_integrity",
        appliesWhen: "Any report, badge, Watch receipt, Shield receipt, or public claim uses wfnuser/Awesome-Agent-Memory-style memory-system catalogs, memory benchmarks, memory taxonomy, retrieval, persistence, forgetting, hallucination, or catalog-derived memory-agent monitoring evidence as live-drift proof.",
        publicDisclosure: "An Awesome-Agent-Memory label, repository metadata, star count, README section name, copied catalog row, paper/project title, link list, local note, aggregate memory score, or source metadata alone does not establish live memory-agent drift reliability without source snapshot, no-license boundary, README blob, catalog snapshot, entry-source, taxonomy, benchmark manifest, eval dataset, baseline/live results, drift statistic, alert receipt, evidence coverage, signed evidence, and row-hash proof.",
        requiredEvidence: "Signed source reference hash, repository snapshot hash, declared no-license-boundary hash, README blob hash, catalog snapshot hash, entry id, entry source reference hash, taxonomy manifest hash, benchmark manifest hash, evaluation dataset hash, baseline result hash, live result hash, drift statistic hash, alert receipt hash, memory category, evaluation task, retrieval score, persistence score, forgetting score, hallucination rate, evidence refs, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.19-r162 should be regenerated or relabeled before using wfnuser/Awesome-Agent-Memory-style, Awesome Agent Memory, memory-system catalog, retrieval, persistence, forgetting, hallucination, taxonomy, or agent-memory live-drift claims."
      },
      {
        boundary: "agent_reading_test_live_drift_integrity",
        appliesWhen: "Any report, badge, Watch receipt, Shield receipt, or public claim uses agent-ecosystem/agent-reading-test-style web-content reading tasks, canary recall, answer-key scoring, failure-mode coverage, content-delivery behavior, or documentation-reading evidence as live-drift proof.",
        publicDisclosure: "An Agent Reading Test label, repository metadata, homepage screenshot, README task list, copied test page, copied canary token, answer-key excerpt, scoring-form screenshot, raw HTML/markdown snippet, self-reported score, or source metadata alone does not establish live web-reading drift reliability without source snapshot, license, homepage, README blob, answer key, task manifest, score form, live-site snapshot, raw content capture, expected/reported canary proof, baseline/live result, drift statistic, alert receipt, evidence coverage, signed evidence, and row-hash proof.",
        requiredEvidence: "Signed source reference hash, repository snapshot hash, license reference hash, homepage reference hash, README blob hash, answer key hash, task manifest hash, score form hash, live-site snapshot hash, task id, failure mode, content-delivery mode, baseline result hash, live result hash, drift statistic hash, alert receipt hash, raw content capture hash, reported canary hash, expected canary hash, normalized score, canary recall, task completion, evidence refs, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.19-r163 should be regenerated or relabeled before using agent-ecosystem/agent-reading-test-style, Agent Reading Test, web-content reading, canary recall, truncation, SPA shell, tabbed content, content negotiation, redirect, header-quality, or agent documentation-reading live-drift claims."
      },
      {
        boundary: "ai_reputation_claude_live_drift_integrity",
        appliesWhen: "Any report, badge, Watch receipt, Shield receipt, or public claim uses zubair-trabzada/ai-reputation-claude-style review analysis, brand sentiment, competitor benchmarking, review-response drafting, crisis playbooks, PDF reputation reports, hallucinated-citation checks, PII leakage checks, or reputation-management evidence as live-drift proof.",
        publicDisclosure: "An AI Reputation Claude label, repository metadata, README feature list, agent or skill filename, local review sample, aggregate sentiment score, competitor table, generated response, crisis-playbook excerpt, PDF report, model/provider label, or source metadata alone does not establish live brand-reputation drift reliability without source snapshot, no-license boundary, README blob, agent roster, skill catalog hash, install script hash, review-source manifest, sentiment pipeline, competitor benchmark, response policy, crisis playbook, report template, baseline/live result, drift statistic, alert receipt, evidence coverage, signed evidence, and row-hash proof.",
        requiredEvidence: "Signed source reference hash, repository snapshot hash, no-license boundary hash, README blob hash, agent roster hash, skill catalog hash, install script hash, review-source manifest hash, sentiment pipeline hash, competitor benchmark hash, response-policy hash, crisis-playbook hash, PDF report-template hash, review platform, reputation task, baseline result hash, live result hash, drift statistic hash, alert receipt hash, reputation score, normalized sentiment score, response quality, crisis readiness, review coverage, hallucinated citation rate, PII leak rate, response-policy compliance, platform/task/context distributions, evidence refs, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.19-r175 should be regenerated or relabeled before using zubair-trabzada/ai-reputation-claude-style, AI Reputation Claude, review analysis, sentiment scoring, competitor benchmarking, review response, crisis playbook, PDF reputation report, hallucinated citation, PII leakage, or live reputation-management drift claims."
      },
      {
        boundary: "ctf_agent_benchmark_live_drift_integrity",
        appliesWhen: "Any report, badge, Watch receipt, Shield receipt, or public claim uses FishCodeTech/ctf-agent-benchmark-style CTF tasks, tool-use security workflows, MCP integration, Docker challenge runtime, sidecar logs, scoreboard evidence, flag submission logs, partial credit, or sandbox isolation as live-drift proof.",
        publicDisclosure: "A CTF-agent benchmark label, repository metadata, README claim, challenge name, copied exploit path, copied flag, copied challenge source, local Docker output, scoreboard screenshot, aggregate solve rate, model/provider label, sidecar log excerpt, or source metadata alone does not establish live cybersecurity-agent drift reliability without source snapshot, GPL license, README, challenge catalog, challenge manifest, Docker/runtime, backend API, MCP, sidecar, agent-template, scoring, scoreboard, flag-log, baseline/live result, drift statistic, alert receipt, trace, sandbox, evidence coverage, signed evidence, and row-hash proof.",
        requiredEvidence: "Signed source reference hash, repository snapshot hash, GPL-3.0 license reference hash, README blob hash, challenge catalog tree hash, challenge manifest hash, challenge Dockerfile hash, platform compose hash, backend API manifest hash, MCP tool manifest hash, sidecar collector hash, agent template hash, scoring service hash, scoreboard snapshot hash, flag submission log hash, baseline result hash, live result hash, drift statistic hash, alert receipt hash, challenge id, challenge category, runtime mode, flag accepted, first-correct-flag-forwarded proof, external-search proof, independence proof, contamination-risk metric, competition-impact metric, checkpoint completion, partial-credit score, trace capture, sandbox isolation, score, time-to-flag, submission count, evidence refs, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.19-r167 should be regenerated or relabeled before using FishCodeTech/ctf-agent-benchmark-style, CTF agent benchmark, tool-use security benchmark, MCP-integrated CTF, Docker challenge, sidecar-log, scoreboard, partial-credit, sandbox-isolation, or cybersecurity-agent live-drift claims."
      },
      {
        boundary: "llm_fighter_live_drift_integrity",
        appliesWhen: "Any report, badge, Watch receipt, Shield receipt, or public claim uses neutree-ai/llm-fighter-style combat games, game-result APIs, battle logs, YAML exports, model rosters, win-rate, game-score, action-validity, combat-stability, arena/ruleset drift, or combat-agent monitoring evidence as live-drift proof.",
        publicDisclosure: "An LLM Fighter label, repository metadata, README claim, homepage screenshot, game UI screenshot, copied battle log, copied YAML export, model/provider label, aggregate win rate, aggregate game score, local game run, or source metadata alone does not establish live combat-agent drift reliability without source snapshot, MIT license, homepage, README, API/UI tree, game-result endpoint, persistence schema, engine, runner, LLM adapter, YAML export, UI component, baseline/live result, drift statistic, alert receipt, combat-log, exported-log, evidence coverage, signed evidence, and row-hash proof.",
        requiredEvidence: "Signed source reference hash, repository snapshot hash, MIT license reference hash, homepage reference hash, README blob hash, API tree hash, game-result endpoint hash, persistence schema hash, UI tree hash, game engine hash, game runner hash, LLM adapter hash, YAML export hash, game UI component hash, baseline result hash, live result hash, drift statistic hash, alert receipt hash, arena id, game id, ruleset id, model roster hash, player model id, opponent model id, skill-set hash, combat log hash, exported log hash, winner, game score, action-validity rate, combat stability, turn count, latency, cost, evidence refs, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.19-r180 should be regenerated or relabeled before using neutree-ai/llm-fighter-style, LLM Fighter, combat-game agent evaluation, game-result API, battle log, YAML export, win-rate, game-score, action-validity, combat-stability, or live behavior-drift claims."
      },
      {
        boundary: "darwin_godel_machine_live_drift_integrity",
        appliesWhen: "Any report, badge, Watch receipt, Shield receipt, or public claim uses lemoz/darwin-godel-machine-style self-improving coding agents, population evolution, sandboxed execution, benchmark pass rates, live score movement, mutation acceptance, regression failures, lineage, provider/model routing, or DGM monitoring evidence as live-drift proof.",
        publicDisclosure: "A Darwin Godel Machine label, repository metadata, README claim, research-paper title, local evolution run, copied benchmark config, copied agent code, copied archive row, score-movement JSON excerpt, model/provider label, aggregate candidate score, aggregate pass rate, local sandbox output, or source metadata alone does not establish live self-improvement drift reliability without source snapshot, no-license boundary, README, security, CI, controller, archive, self-modification, evaluation, scorer, sandbox, live-run config, benchmark manifest, score-movement manifest, baseline/live result, drift statistic, alert receipt, lineage, provider/model route, evidence coverage, signed evidence, and row-hash proof.",
        requiredEvidence: "Signed source reference hash, repository snapshot hash, no-license boundary hash, README blob hash, security policy hash, CI workflow hash, controller hash, archive hash, self-modification hash, evaluation harness hash, scorer hash, sandbox Dockerfile hash, sandbox manager hash, live-run config hash, live-proof config hash, model-matrix config hash, benchmark manifest hash, score-movement manifest hash, live-plan verifier hash, sandbox verifier hash, archive-score summarizer hash, full-process sandbox runner hash, baseline result hash, live result hash, drift statistic hash, alert receipt hash, generation, parent-agent hash, candidate-agent hash, lineage graph hash, provider route hash, model id, sandbox mode, benchmark family, parent score, candidate score, score movement, pass rate, mutation accepted flag, regression failure rate, latency, cost, agent step count, evidence refs, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.19-r190 should be regenerated or relabeled before using lemoz/darwin-godel-machine-style, Darwin Godel Machine, self-improving coding agent, live score movement, sandboxed evolution, benchmark pass-rate, mutation acceptance, regression failure, lineage, or live behavior-drift claims."
      },
      {
        boundary: "effect_autoagent_replay_integrity",
        appliesWhen: "Any report, badge, Watch receipt, Shield receipt, API response, or public claim uses mpsuesser/effect-autoagent-style declarative blueprints, Effect-service agents, harness-engineering tasks, Docker task fixtures, benchmark-runner outputs, trajectories, score deltas, or replay-corpus evidence as proof of agent evaluation quality.",
        publicDisclosure: "An effect-autoagent label, repository metadata, README heading, package name, task directory, benchmark runner filename, Dockerfile name, local command, example agent, provider label, aggregate score, CI badge, or source metadata alone does not establish replayable agent benchmark evidence without source/license/default-branch refs, README/package/lockfile/CI proof, benchmark runner, harness spec, task spec, metrics, experiment log, blueprint, runner, result, trajectory, container, task fixture, Docker environment, replay command, fixed seed, score delta, CI receipt, signed evidence, and row-hash proof.",
        requiredEvidence: "Signed source reference hash, repository snapshot hash, MIT license reference hash, default branch hash, README blob hash, package manifest hash, lockfile hash, CI workflow hash, benchmark runner hash, harness spec hash, task spec hash, metrics hash, experiment log hash, agent blueprint hash, agent runner hash, run result hash, trajectory converter hash, container manager hash, task manifest hash, task instruction hash, fixture test hash, Docker environment hash, replay command hash, fixed seed, baseline run id, candidate run id, baseline result hash, candidate result hash, baseline score, candidate score, score delta, replay pass rate, CI receipt hash, evidence refs, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.19-r191 should be regenerated or relabeled before using mpsuesser/effect-autoagent-style, effect-autoagent, Effect service agent, declarative blueprint, harness-engineering, task fixture, Docker task, benchmark-runner, trajectory, score-delta, or replay-corpus claims."
      },
      {
        boundary: "falcon_evaluate_provider_drift_integrity",
        appliesWhen: "Any report, badge, Watch receipt, Shield receipt, API response, or public claim uses Praveengovianalytics/falcon-evaluate-style agent-evaluation metrics, provider/model drift canaries, context relevancy, fairness, reliability, security, machine ethics, user analytics, or provider-route evidence as proof of agent evaluation quality.",
        publicDisclosure: "A Falcon Evaluate label, repository metadata, release tag, package name, README summary, docs page, workflow filename, module filename, metric-family name, provider label, aggregate score, local run output, CI badge, or source metadata alone does not establish provider/model drift evidence without source/license/default-branch refs, release/package/lockfile/requirements proof, README/docs/workflow proof, evaluation/context/fairness/reliability/security/ethics/results/plot/user-analytics module proof, validation data schema, metric-family and metric ids, provider-route proof, canary-result proof, drift statistic, alert or waiver receipt, signed evidence, and row-hash proof.",
        requiredEvidence: "Signed source reference hash, repository snapshot hash, MIT license reference hash, default branch hash, release tag, package manifest hash, lockfile hash, requirements hash, README blob hash, docs index hash, CI workflow hash, evaluation module hash, context relevancy module hash, fairness module hash, reliability module hash, security module hash, machine ethics module hash, results module hash, plot module hash, user analytics module hash, validation data schema hash, metric family ids, metric ids, metric count, provider route id, baseline canary result hash, candidate canary result hash, drift statistic, alert or waiver receipt hash, evidence refs, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.19-r192 should be regenerated or relabeled before using Praveengovianalytics/falcon-evaluate-style, Falcon Evaluate, provider/model drift, context relevancy, fairness, reliability, security, machine ethics, provider-route, canary-result, or agent-evaluation claims."
      },
      {
        boundary: "agent_defense_bench_provider_drift_integrity",
        appliesWhen: "Any report, badge, Watch receipt, Shield receipt, API response, or public claim uses arunsanna/AgentDefense-Bench-style MCP security benchmark rows, infrastructure-layer defenses, prompt-injection blocking, jailbreak blocking, tool-poisoning blocking, benign-pass checks, or provider-route evidence as proof of provider/model security drift.",
        publicDisclosure: "An AgentDefense-Bench label, repository metadata, README summary, MCP server count, copied attack row, copied benchmark JSON, local aggregate block rate, defense-server screenshot, model/provider label, CI badge, or source metadata alone does not establish provider/model security drift evidence without source/license/default-branch refs, README/checksums/citation/requirements proof, MCP server manifest, attack-bank and benchmark-suite hashes, MCP-specific suite proof, defense server and policy proof, run config, provider-route proof, baseline/candidate canary results, drift statistic, alert or waiver receipt, replay command, CI receipt, signed evidence, and row-hash proof.",
        requiredEvidence: "Signed source reference hash, repository snapshot hash, Apache-2.0 license reference hash, default branch hash, README blob hash, CHECKSUMS blob hash, CITATION blob hash, requirements hash, MCP server manifest hash, attack-bank hash, academic benchmark hash, safety benchmark hash, cybersecurity benchmark hash, MCP-specific suite hash, defense server hash, defense policy hash, run config hash, provider route id, baseline canary result hash, candidate canary result hash, drift statistic hash, alert or waiver receipt hash, replay command hash, CI receipt hash, MCP server count, attack suite ids, defense coverage, prompt-injection block rate, jailbreak block rate, tool-poisoning block rate, benign pass rate, thresholds, evidence refs, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.19-r199 should be regenerated or relabeled before using arunsanna/AgentDefense-Bench-style, AgentDefense-Bench, MCP security benchmark, infrastructure-layer defense, prompt-injection blocking, jailbreak blocking, tool-poisoning blocking, benign-pass, provider-route, canary-result, or provider-drift claims."
      },
      {
        boundary: "paper_read_skill_live_drift_integrity",
        appliesWhen: "Any report, badge, Watch receipt, Shield receipt, API response, or public claim uses Ayanami0730/paper-read-skill-style paper-reading, research-paper analysis, benchmark/methodology/survey-opinion routing, research synthesis, or paper-reading live behavior-drift evidence as proof of live score stability.",
        publicDisclosure: "A paper-read-skill label, repository metadata, README summary, copied prompt text, prompt filename, local research transcript, aggregate paper-reading score, route name, model/provider label, CI badge, or source metadata alone does not establish live score or behavior drift evidence without source/no-license/default-branch refs, README and llms manifests, skill-tree and prompt-catalog hashes, routing policy, research-task manifest, evaluation rubric, baseline/live sample manifests, drift statistic, alert receipt, replay command, CI receipt, no-prompt-copy proof, signed evidence, and row-hash proof.",
        requiredEvidence: "Signed source reference hash, repository snapshot hash, no-license boundary hash, default branch hash, README blob hash, llms manifest hash, skills tree hash, paper-analysis skill hash, paper-analysis prompt catalog hash, blog-reading skill hash, blog-reading prompt catalog hash, benchmark prompt hash, methodology prompt hash, survey-opinion prompt hash, route policy hash, research task manifest hash, evaluation rubric hash, baseline distribution hash, live sample manifest hash, drift statistic hash, alert receipt hash, replay command hash, CI receipt hash, no-prompt-copy proof hash, route/task ids, paper corpus hash, prompt-route hash, response hash, evaluator trace hash, evidence refs, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.19-r200 should be regenerated or relabeled before using Ayanami0730/paper-read-skill-style, paper-read-skill, paper-reading agent skill, research-paper analysis, benchmark/methodology/survey-opinion routing, research synthesis, live behavior-drift, or paper-reading score-drift claims."
      },
      {
        boundary: "eval_ai_library_question_explainability_integrity",
        appliesWhen: "Any report, badge, Score receipt, Shield receipt, Watch alert, API response, or public claim uses firstlinesoftware/eval-ai-library-style RAG, agent, security, or custom metric outputs, accepted/rejected evidence, score breakdowns, repair hints, or question-level score explanations as proof for an AMC question row.",
        publicDisclosure: "An eval-ai-library label, repository metadata, README summary, metric family name, local eval output, dashboard screenshot, aggregate score, provider label, question id, or source metadata alone does not establish question-level score explainability without source/license/default-branch refs, metric-module refs, eval-pack, dataset, question set, question trace, evaluator config, metric result, score breakdown, rejected-evidence ledger, repair hint, regression threshold, CI receipt, no-copy proof, signed evidence, and row-hash proof.",
        requiredEvidence: "Signed source reference hash, repository snapshot hash, Apache-2.0 license reference hash, default branch hash, HEAD commit hash, repository tree hash, README blob hash, LICENSE blob hash, NOTICE blob hash, pyproject hash, requirements hash, eval_lib tree hash, metric family ids, metric module hashes, agent metric hashes, security metric hashes, tracing module hash, dashboard asset hashes, evaluation schema hash, testcase schema hash, metric pattern hash, LLM client hash, AMC eval-pack hash, dataset hash, question-set hash, question trace hash, evaluator config hash, metric result hash, score breakdown hash, accepted evidence refs, rejected evidence ledger hash, rejected evidence reasons, repair hint hash, regression threshold hash, CI receipt hash, no-source-copy proof hash, evidence coverage, rejected-evidence reason coverage, repair-hint coverage, score confidence, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.19-r201 should be regenerated or relabeled before using firstlinesoftware/eval-ai-library-style, eval-ai-library, RAG metric, agent metric, security metric, accepted/rejected evidence, repair-hint, or question score explainability claims."
      },
      {
        boundary: "open_model_rag_question_explainability_integrity",
        appliesWhen: "Any report, badge, Score receipt, Shield receipt, Watch alert, API response, or public claim uses bbenz/gen-ai-with-open-models-style Java local open-model inference, LangChain4j, Ollama, RAG pipeline, RAG evaluation, accepted/rejected evidence, score breakdowns, repair hints, or question-level score explanations as proof for an AMC question row.",
        publicDisclosure: "An Open Models label, repository metadata, README summary, JavaOne demo label, local curl output, endpoint list, model name, RAG pipeline name, local eval output, aggregate score, provider label, or source metadata alone does not establish question-level score explainability without source/default-branch refs, license or no-license boundary, Java source, build/dependency refs, LangChain4j/Ollama/RAG/evaluation proof, open model ids, question trace, evaluator config, metric result, score breakdown, rejected-evidence ledger, repair hint, CI receipt, no-copy proof, signed evidence, and row-hash proof.",
        requiredEvidence: "Signed source reference hash, repository snapshot hash, license or no-license boundary hash, default branch hash, HEAD commit hash, repository tree hash, README blob hash, Java source tree hash, build config hash, dependency manifest hash, LangChain4j integration hash, Ollama runtime config hash, RAG pipeline hash, RAG corpus manifest hash, embedding config hash, retrieval trace hash, evaluation manifest hash, open model ids, evaluation metric ids, question-set hash, question trace hash, evaluator config hash, metric result hash, score breakdown hash, rejected evidence ledger hash, rejected evidence reasons, repair hint hash, regression threshold hash, CI receipt hash, no-source-copy proof hash, evidence coverage, rejected-evidence reason coverage, repair-hint coverage, retrieval grounding, answer relevance, regression pass rate, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.19-r209 should be regenerated or relabeled before using bbenz/gen-ai-with-open-models-style, Open Models, Java local inference, LangChain4j, Ollama, RAG pipeline, RAG evaluation, or question score explainability claims."
      },
      {
        boundary: "fore_public_methodology_versioning_integrity",
        appliesWhen: "Any report, badge, API response, benchmark receipt, Shield receipt, Watch alert, or public claim uses foreai-co/fore-style evaluation-client, Fore Foresight API schema, client/test/workflow evidence, RAG or LLM metric client output, methodology versioning, changelog, deprecation, migration, or badge comparability proof as public methodology evidence.",
        publicDisclosure: "A fore label, repository metadata, README summary, package version, archived repository notice, API schema filename, client filename, local client output, metric name, badge URL, aggregate score, provider label, or source metadata alone does not establish comparable public methodology versioning without source/license/default-branch refs, archived-state proof, README/LICENSE/pyproject refs, fore/foresight API schema/client/schema/test/workflow refs, methodology id/version/hash, changelog, deprecation notice, migration guidance, eval-pack, dataset, signed evidence, CI receipt, regression threshold, no-copy proof, and row-hash proof.",
        requiredEvidence: "Signed methodology id, methodology version, methodology hash, methodology changelog hash, deprecation notice hash, migration guidance hash, signed source reference hash, repository snapshot hash, archived repository status hash, Apache-2.0 license reference hash, default branch hash, HEAD commit hash, repository tree hash, README blob hash, LICENSE blob hash, pyproject hash, package name, package version, fore tree hash, fore/foresight tree hash, api_v1.yaml hash, client.py hash, schema.py hash, client_test.py hash, build-test-lint workflow hash, eval-pack hash, dataset hash, evaluator config hash, baseline result hash, candidate result hash, regression threshold hash, CI receipt hash, no-source-copy proof hash, accepted evidence refs, rejected evidence ledger hash, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.19-r202 should be regenerated or relabeled before using foreai-co/fore-style, fore, Fore Foresight client, archived evaluation-client, public methodology versioning, changelog, deprecation, migration, or badge comparability claims."
      },
      {
        boundary: "heurekabench_scientific_replay_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, Watch alert, Shield receipt, API response, or public claim uses mlbio-epfl/HeurekaBench-style scientific co-scientist benchmark rows, sc-HeurekaBench single-cell questions, benchmark JSONs, single-cell dataset refs, Biomni or CellVoyager baseline runs, extraction/evaluation scripts, G-Eval judging, or scientific question-answer replay evidence as proof of agent research capability.",
        publicDisclosure: "A HeurekaBench label, repository metadata, README summary, official-site badge, arXiv badge, paper title, benchmark JSON filename, dataset folder name, Google Drive dataset link, local benchmark command, Biomni or CellVoyager name, prompt filename, PDF count, CSV count, aggregate score, model/provider label, answer file, evaluator output, or source metadata alone does not establish replayable scientific co-scientist benchmark quality without source/default-branch refs, no-root-license boundary, README/project/arXiv refs, benchmark JSON hash, dataset manifest and checksum refs, dataset no-copy proof, insight/question/answer manifest hashes, agent-output extraction hash, evaluation script hash, G-Eval prompt refs, baseline runner refs, Biomni/CellVoyager adapter refs, result manifest hash, replay command hash, CI receipt, question-type and tool-use-subset coverage, evaluator agreement, replay pass rate, regression thresholds, signed evidence, and row-hash proof.",
        requiredEvidence: "Signed benchmark id/version, source reference hash, repository snapshot hash, no-root-license boundary hash, default branch hash, HEAD commit hash, repository tree hash, README blob hash, project page reference hash, arXiv/OpenReview reference hash, benchmark JSON hash, MCQ benchmark hash, OEQ benchmark hash, tool-use subset hash, single-cell dataset manifest hash, dataset checksum refs, dataset no-copy proof hash, benchmark validation tree hash, paper/PDF manifest hash, insight manifest hash, question manifest hash, answer key hash, agent-output extraction hash, evaluation script hash, G-Eval prompt hash, baseline runner hash, open-LLM runner hash, closed-LLM runner hash, Biomni tree hash, Biomni adapter hash, Biomni license reference hash, CellVoyager adapter hash, baseline result hash, candidate result hash, result manifest hash, replay command hash, CI receipt hash, question type, tool-use subset, scientific domain, paper count, question count, dataset count, deterministic seed, evaluator agreement, replay pass rate, score delta, regression threshold hash, evidence refs, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.19-r203 should be regenerated or relabeled before using mlbio-epfl/HeurekaBench-style, HeurekaBench, sc-HeurekaBench, scientific co-scientist, single-cell benchmark, Biomni, CellVoyager, MCQ/open-ended scientific question, or benchmark replay claims."
      },
      {
        boundary: "rag_contradiction_detector_replay_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, Watch alert, Shield receipt, API response, or public claim uses robhorvat/RAG_Contradiction_Detector-style biomedical RAG contradiction detection, PubMed abstract triage, SciFact retrieval/verdict metrics, heuristic or PyTorch verifier results, quality-gate output, Streamlit/Docker/k8s runtime evidence, or Prometheus metrics as proof of agent benchmark quality.",
        publicDisclosure: "A RAG_Contradiction_Detector label, repository metadata, README summary, demo GIF, PubMed ID pair, copied abstract, copied SciFact row, local Streamlit output, Makefile target, eval report excerpt, quality-gate status, macro F1, Recall@k, MRR, Docker or Kubernetes manifest name, Prometheus metric name, model/provider label, or source metadata alone does not establish replayable biomedical contradiction benchmark quality without source/default-branch refs, no-root-license boundary, README/requirements/Makefile/CI refs, evaluation-script hashes, SciFact fixture manifest hash, quality-gate report hash, verifier hashes, retrieval/vector-store proof, Docker/k8s/Prometheus proof, replay command hash, deterministic seed, regression thresholds, no-source-copy proof, no-PubMed-abstract-copy proof, signed evidence, and row-hash proof.",
        requiredEvidence: "Signed benchmark id/version, source reference hash, repository snapshot hash, no-root-license boundary hash, default branch hash, HEAD commit hash, repository tree hash, README blob hash, requirements hash, Makefile hash, CI workflow hash, app hash, source tree hash, evaluation tree hash, metrics.py hash, quality_gate.py hash, evaluate_rag_stack.py hash, prepare_scifact_pairs.py hash, bootstrap_eval_report.py hash, data/scifact manifest hash, SciFact fixture manifest hash, eval report hash, bootstrap eval report hash, quality-gate report hash, heuristic verifier hash, torch verifier hash, verdict arbitration hash, PubMed fetcher hash, retriever hash, vector-store hash, observability metrics hash, model registry hash, Dockerfile hash, docker-compose hash, k8s manifest hashes, Prometheus metrics proof hash, replay command hash, deterministic seed, baseline result hash, candidate result hash, retrieval Recall@k, MRR@k, macro F1, score delta, regression threshold hash, CI receipt hash, no-source-copy proof hash, no-PubMed-abstract-copy proof hash, evidence refs, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.19-r204 should be regenerated or relabeled before using robhorvat/RAG_Contradiction_Detector-style, biomedical RAG contradiction, PubMed contradiction triage, SciFact retrieval/verdict, heuristic verifier, torch verifier, quality-gate, Docker/k8s, Prometheus, or replay-corpus claims."
      },
      {
        boundary: "skillmatch_resume_live_drift_integrity",
        appliesWhen: "Any report, badge, Watch receipt, Shield receipt, API response, or public claim uses SubashSK777/SkillMatch-AI_Resume_Analyzer-style resume analysis, PDF extraction, job matching, strengths/weaknesses analysis, personalized improvement suggestions, RAG resume context, OpenAI or Gemini provider routing, React/Vite frontend evidence, older Streamlit/Python notebook evidence, or resume-analysis live drift evidence as proof of live score stability.",
        publicDisclosure: "A SkillMatch label, repository metadata, README summary, PDF upload demo, frontend screenshot, local analyzer output, copied resume text, copied job description, model/provider label, dependency name, notebook filename, Dockerfile name, aggregate match score, or source metadata alone does not establish live resume-agent drift evidence without source/default-branch refs, no-license boundary, README/Docker/frontend/old-version refs, frontend analyzer component hash, PDF extractor hash, provider-route proof, resume task taxonomy, RAG input corpus manifest, baseline/live sample manifests, drift statistic, alert receipt, replay command, CI receipt, privacy boundary, no-source-copy proof, no-resume-copy proof hash, signed evidence, and row-hash proof.",
        requiredEvidence: "Signed source reference hash, repository snapshot hash, no-license boundary hash, default branch hash, HEAD commit hash, repository tree hash, README blob hash, Dockerfile hash, frontend tree hash, frontend package hash, frontend lockfile hash, frontend analyzer component hash, frontend PDF extractor hash, old-version tree hash, old Streamlit app hash, old notebook hash, requirements hash, model/provider manifest hash, resume task taxonomy hash, RAG input corpus manifest hash, baseline distribution hash, live sample manifest hash, drift statistic hash, alert receipt hash, replay command hash, CI receipt hash, no-source-copy proof hash, no-resume-copy proof hash, privacy boundary hash, task type, resume format, provider route hash, prompt policy hash, private resume input hash, job-description hash, RAG context hash, analysis output hash, evaluator trace hash, parser accuracy, grounding score, suggestion quality, PII redaction result, evidence refs, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.19-r205 should be regenerated or relabeled before using SubashSK777/SkillMatch-AI_Resume_Analyzer-style, SkillMatch, AI resume analyzer, PDF resume parser, job-match analysis, strengths/weaknesses analysis, personalized improvement suggestions, RAG resume analysis, or live resume-agent drift claims."
      },
      {
        boundary: "decibench_voice_live_drift_integrity",
        appliesWhen: "Any report, badge, Watch receipt, Shield receipt, API response, or public claim uses unforkopensource-org/decibench-style voice AI testing, deterministic evaluation, semantic evaluation, RAG augmented evaluation, CLI/MCP evaluation, bridge-sidecar evidence, dashboard evidence, audio or scenario-suite evidence, or voice-agent live drift evidence as proof of live score stability.",
        publicDisclosure: "A Decibench label, repository metadata, README summary, homepage link, release tag, CLI name, MCP label, RAG label, evaluator filename, audio filename, scenario filename, dashboard screenshot, local voice-agent run, copied transcript, copied audio fixture, aggregate voice score, model/provider label, or source metadata alone does not establish voice-agent live drift evidence without source/default-branch refs, GitHub NOASSERTION/license boundary, README/pyproject/CI/CLI/MCP/RAG/evaluator/audio/scenario/bridge/dashboard refs, audio tree hash, deterministic/semantic/RAG evaluation manifests, baseline/live sample manifests, drift statistic, alert receipt, replay command, CI receipt, privacy boundary, no-source-copy proof, no-transcript-copy proof hash, signed evidence, and row-hash proof.",
        requiredEvidence: "Signed source reference hash, repository snapshot hash, license reference hash, GitHub NOASSERTION license boundary hash, default branch hash, HEAD commit hash, repository tree hash, release tag hash, README blob hash, pyproject hash, CI workflow hash, Makefile hash, config example hash, source tree hash, Decibench package tree hash, CLI tree and run/rag command hashes, MCP tree and RAG tool hash, RAG tree hash, evaluator tree hash, audio tree hash, scenario tree hash, scenario-suite manifest hash, tests tree hash, bridge sidecar tree hash, dashboard tree hash, docs tree hash, release-check hash, deterministic eval manifest hash, semantic eval manifest hash, RAG eval manifest hash, baseline distribution hash, live sample manifest hash, drift statistic hash, alert receipt hash, replay command hash, CI receipt hash, no-source-copy proof hash, no-transcript-copy proof hash, privacy boundary hash, voice task type, channel, provider route hash, scenario suite hash, scenario hash, audio fixture hash, transcript hash, expected behavior hash, actual behavior hash, evaluator trace hash, RAG context hash, tool trace hash, WER, latency, task completion, hallucination rate, RAG grounding, audio quality, evidence refs, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.19-r206 should be regenerated or relabeled before using unforkopensource-org/decibench-style, Decibench, voice AI testing, voice-agent benchmark, deterministic evaluation, semantic evaluation, RAG augmented evaluation, CLI/MCP voice-agent evaluation, or voice live-drift claims."
      },
      {
        boundary: "evidra_provider_drift_integrity",
        appliesWhen: "Any report, badge, provider-drift eval pack, Watch alert, Shield receipt, API response, CI gate, or public claim uses Evidra-style DevOps MCP, prescribe/report protocol, signed evidence chain, reliability scorecard, canary result, or provider/model drift evidence as external proof.",
        publicDisclosure: "An Evidra label, repository metadata, README summary, protocol name, local report, scorecard output, copied evidence entry, provider label, aggregate reliability score, CI badge, or source metadata alone does not establish provider-drift quality without source, CLI/MCP/API, evidence-chain, prescribe/report protocol, sample, drift, alert/waiver, CI, signed-evidence, no-copy, and row-hash proof.",
        requiredEvidence: "Signed provider-drift id/version, source reference hash, repository snapshot hash, Apache-2.0 license reference hash, default branch hash, release tag hash, README hash, go.mod hash, CI workflow hash, release workflow hash, Dockerfile hash, CLI tree hash, MCP server tree hash, API command hash, evidence signer hash, evidence package hash, evlock package hash, execcontract package hash, export package hash, MCP server package hash, proxy package hash, lifecycle service hash, pipeline bridge hash, score compare hash, tests tree hash, docs tree hash, signal-validation guide hash, prescribe command hash, report command hash, record command hash, validate command hash, scorecard command hash, prescribe/report protocol proof hash, provider route id, canary result hash, baseline sample manifest hash, live sample manifest hash, drift statistic hash, alert or waiver receipt hash, replay command hash, CI receipt hash, no-source-copy proof hash, signed evidence-chain proof hash, evidence refs, signed evidence refs, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.19-r207 before using vitas/evidra-style, Evidra, DevOps MCP server, prescribe/report protocol, signed evidence chain, reliability scorecard, provider/model canary, or LLMOps provider-drift claims."
      },
      {
        boundary: "ravig_bench_metric_validity_integrity",
        appliesWhen: "Any report, badge, metric-validation eval pack, Score API response, CI gate, lifecycle run, or public claim uses RAViG-Bench-style retrieval-augmented visually-rich generation, multi-modal automated evaluation, content/design/execution evaluation, or benchmark metric-validity evidence as external proof.",
        publicDisclosure: "A RAViG-Bench label, repository metadata, README summary, prompt filename, copied dataset row, copied model result, local aggregate score, screenshot, evaluator filename, run-script name, CI badge, or source metadata alone does not establish metric validity without source/license/default-branch proof, README/legal/dependency/config refs, content/design/execution/function-scoring refs, dataset/test-case/model-result refs, taxonomy, RAG context, multi-modal evaluator, screenshot/run-script, CI, owner, confidence, no-copy, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed metric-validation id/version, source reference hash, repository snapshot hash, Apache-2.0 license reference hash, default branch hash, HEAD commit hash, repository tree hash, README hash, LEGAL hash, requirements/environment hash, config tree hash, content-eval tree hash, design-eval tree hash, execution-eval tree hash, function scoring hash, dataset manifest hash, test-case manifest hash, model-result manifest hash, visually-rich generation taxonomy ids, RAG retrieval context ids, multi-modal evaluator ids, screenshot evaluation hash, run-script hashes, metric names, CI reporter id, validation pass rate, dataset case count, visual-design check count, evaluator count, owner, sample size, confidence interval, no-source-copy proof hash, evidence refs, signed evidence refs, report artifact hashes, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.19-r208 before using antgroup/ravig-bench-style, RAViG-Bench, visually-rich generation, retrieval-augmented generation, multi-modal automated evaluation, or metric-validity claims."
      },
      {
        boundary: "rail_score_live_drift_integrity",
        appliesWhen: "Any report, badge, Watch receipt, Shield receipt, API response, or public claim uses Responsible-AI-Labs/rail-score-sdk-style responsible-AI dimensions, guardrails, safe regeneration, prompt-injection blocking, agent tool-call evaluation, telemetry, compliance, or RAIL Score aggregates as live capability or drift evidence.",
        publicDisclosure: "A RAIL Score label, repository metadata, PyPI package name, release tag, README summary, SDK class name, local score output, guardrail mode label, compliance framework label, aggregate responsible-AI score, model/provider label, CI badge, or source metadata alone does not establish live responsible-AI drift reliability without source, repository, license, release, package, client, policy, middleware, telemetry, compliance, agent, integration, baseline/live result, drift statistic, alert receipt, signed evidence, and row-hash proof.",
        requiredEvidence: "Signed eval-pack id, source reference hash, repository snapshot hash, MIT license reference hash, GitHub release reference hash, PyPI package hash, PyPI wheel hash, PyPI sdist hash, README blob hash, pyproject blob hash, requirements hash, CI workflow hash, publish workflow hash, client/model/policy/session/middleware hashes, telemetry core/instrumentor/compliance logger/review queue hashes, agent client/model/session/policy hashes, OpenAI wrapper hash, Langfuse integration hash, LiteLLM guardrail hash, DPDP client/scanner hashes, baseline result hash, live result hash, drift statistic hash, alert receipt hash, evaluation dimension, guardrail mode, compliance framework, model provider, RAIL score, guardrail pass rate, safe-regeneration rate, agent tool-call accuracy, compliance pass rate, telemetry coverage, prompt-injection block rate, latency, cost, baseline/live distributions, thresholds, evidence refs, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.19-r193 should be regenerated or relabeled before using Responsible-AI-Labs/rail-score-sdk-style, RAIL Score, responsible-AI dimensions, guardrails, safe regeneration, prompt-injection blocking, agent tool-call evaluation, telemetry, compliance, or live behavior-drift claims."
      },
      {
        boundary: "garage_rag_grounding_live_drift_integrity",
        appliesWhen: "Any report, badge, Watch receipt, Shield receipt, API response, or public claim uses amazon-science/GaRAGe-style RAG grounding annotations, long-form answer grounding, passage relevance/correctness, citation support, deflection behavior, answer validation, or RAG grounding drift evidence as live capability proof.",
        publicDisclosure: "A GaRAGe label, repository metadata, README summary, arXiv title, dataset filename, copied dataset row, copied passage, local RAG run, aggregate grounding score, model/provider label, or source metadata alone does not establish live RAG grounding drift reliability without source, repository/license/README proof, benchmark dataset proof, AMC-owned dataset manifest, paper reference, grounding annotation schema, retrieval corpus snapshot, prompt/evaluator configs, baseline/live result, drift statistic, alert receipt, validation coverage, signed evidence, and row-hash proof.",
        requiredEvidence: "Signed eval-pack id, source reference hash, repository snapshot hash, CC-BY-NC license reference hash, README blob hash, benchmark dataset hash, dataset manifest hash, paper reference hash, grounding annotation schema hash, retrieval corpus snapshot hash, prompt template hash, evaluator config hash, sample id, question type, question complexity, question category, question source, topic source, grounding passage count, relevant passage count, cited passage count, answer validation flag, grounding precision, grounding recall, citation support, deflection accuracy, answer faithfulness, baseline result hash, live result hash, drift statistic hash, alert receipt hash, baseline/live distributions, thresholds, evidence refs, signed evidence refs, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.19-r197 before using amazon-science/GaRAGe-style, GaRAGe, RAG grounding annotations, passage relevance, citation support, answer validation, deflective response, or RAG live-drift claims."
      },
      {
        boundary: "llm_prompting_tests_public_methodology_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, Watch alert, Shield receipt, API response, or public claim uses Arnie936/llm-prompting-tests-style demanding prompt suites, coding-agent prompts, agentic-model prompts, prompt taxonomy, prompt-quality gates, self-check rules, no-external-assets rules, or prompt-suite outcomes as public methodology evidence.",
        publicDisclosure: "An llm-prompting-tests label, repository metadata, README summary, prompt count, copied prompt, translated prompt, prompt filename, local chat transcript, model/provider label, aggregate success rate, single impressive completion, or source metadata alone does not establish comparable public methodology versioning without source, no-license boundary, default-branch snapshot, README, prompt catalog, prompt-file refs, prompt taxonomy, task/risk taxonomy, rubric, self-check and no-external-assets policies, language boundary, model/provider pool, judge calibration, baseline/candidate results, regression thresholds, changelog, deprecation, migration, signed evidence, and row-hash proof.",
        requiredEvidence: "Signed methodology id, methodology version, methodology hash, source reference hash, repository snapshot hash, no-license boundary hash, default branch hash, HEAD commit hash, repository tree hash, README blob hash, prompt catalog tree hash, prompt file blob hashes, prompt count, prompt taxonomy hash, test manifest hash, task category taxonomy hash, risk taxonomy hash, expected-output rubric hash, self-check policy hash, no-external-assets policy hash, language/localization boundary hash, model/provider pool hash, judge calibration hash, run config hash, deterministic seed policy hash, baseline result hash, candidate result hash, regression threshold policy hash, methodology changelog hash, methodology deprecation notice, migration guidance hash, no-prompt-copy boundary proof, evidence refs, signed evidence refs, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.19-r198 before using Arnie936/llm-prompting-tests-style, llm-prompting-tests, demanding prompt suite, coding-agent prompt, agentic-model prompt, prompt taxonomy, self-check, no-external-assets, rubric, or public-methodology claims."
      },
      {
        boundary: "scorable_studio_drilldown_integrity",
        appliesWhen: "Any report, badge, Score receipt, Shield receipt, Watch alert, Studio view, API response, or public claim uses root-signals/scorable-sdk-style evaluator execution logs, OTEL traces, file uploads, SDK manifests, package integrity, or Studio evidence drilldown UI as question-level proof.",
        publicDisclosure: "A Scorable SDK label, repository metadata, README summary, package name, release tag, CLI command name, execution-log list, OTEL trace list, Studio screenshot, UI route, local evaluator output, aggregate score, npm metadata, or source metadata alone does not establish actionable evidence drilldown without source/license/default-branch snapshot, commit/tree refs, SDK and CLI artifact hashes, TypeScript package proof, npm integrity, UI route, source artifact links, trace/receipt/policy/source-artifact previews, empty/error-state receipts, accepted/rejected evidence, repair hints, and row-hash proof.",
        requiredEvidence: "Signed source reference hash, repository snapshot hash, Apache-2.0 license reference hash, default branch, commit and tree refs, README artifact hash, Python package manifest hash, Python OpenAPI hash, Python client hash, Python execution-logs hash, Python evaluator API hash, Python execution-log API hash, CLI package manifest hash, CLI lockfile hash, CLI evaluator command hash, CLI judge command hash, CLI execution-log command hash, CLI OTEL trace command hash, CLI file-upload command hash, TypeScript package manifest hash, TypeScript lockfile hash, TypeScript source tree hash, npm package refs and integrity strings, Studio surface, UI route path, source artifact links, trace preview hash, receipt preview hash, policy rule preview hash, source artifact preview hash, empty-state hash, error-state hash, evidence preview count, source artifact link count, evidence refs, signed evidence refs, rejected evidence refs, repair hint, and row hashes.",
        migration: "Reports generated under 2026.06.19-r194 should be regenerated or relabeled before using root-signals/scorable-sdk-style, Scorable SDK, Studio evidence drilldown, execution-log, OTEL trace, evaluator/judge command, file-upload, npm package integrity, source artifact preview, empty/error state, or question-explainability claims."
      },
      {
        boundary: "mobile_agent_metric_validity",
        appliesWhen: "Any report, badge, metric-validation row, or public claim uses MobileBench-style mobile-agent, Android app automation, API/UI, task-complexity, multi-app collaboration, checkpoint metric, or device-fixture evidence as proof of agent capability.",
        publicDisclosure: "A mobile-agent benchmark label, app demo, emulator run, README result, task row, screenshot, API trace, aggregate success rate, or local command output does not establish comparable mobile-agent validity without environment, app, API, UI, checkpoint, reset/device-state, license-boundary, and CI proof.",
        requiredEvidence: "Signed benchmark manifest, paper or source reference, mobile environment manifest, app inventory manifest, API catalog manifest, UI automation trace, task dataset manifest, task-complexity manifest, multi-app task manifest, checkpoint metric rubric, checkpoint result artifact, environment reset policy, device-state fixture, result report artifact, dataset license boundary, metric owner, sample size, confidence interval, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.13-r94 should be regenerated or relabeled before using Xiaomi/MobileBench-style, MobileBench, mobile-agent benchmark, Android automation, app/API/UI, multi-app task, checkpoint-metric, or device-fixture metric-validity claims."
      },
      {
        boundary: "bioinformatics_agent_metric_validity",
        appliesWhen: "Any report, badge, metric-validation row, or public claim uses BioAgentBench-style bioinformatics agent, RNA-seq, variant-calling, metagenomics, workflow reproduction, perturbation robustness, grader-based scoring, or privacy-constrained bioinformatics workflow evidence as proof of agent capability.",
        publicDisclosure: "A bioinformatics benchmark label, task prompt, local pipeline run, result file, aggregate completion score, README claim, Docker command, notebook, or copied task row does not establish comparable bioinformatics-agent validity without task, dataset, truth/reference, workflow, environment, tool, grader, result, perturbation, privacy, owner, and CI proof.",
        requiredEvidence: "Signed benchmark manifest, paper or source reference, bioinformatics task manifest, dataset input manifest, truth/reference manifest, workflow reproduction manifest, Docker or environment manifest, tool-version manifest, agent harness manifest, grader config manifest, result artifact manifest, perturbation suite manifest, privacy boundary manifest, metric owner, sample size, confidence interval, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.13-r97 should be regenerated or relabeled before using bioagent-bench/bioagent-bench-style, BioAgentBench, bioinformatics agent benchmark, RNA-seq, variant-calling, metagenomics, workflow-reproduction, perturbation-robustness, privacy-constrained, or grader-based metric-validity claims."
      },
      {
        boundary: "document_rag_memory_replay_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, or public claim uses document RAG, multimodal document QA, adaptive retrieval, session-scoped knowledge graphs, evolving memory, PDF processing, image-text reasoning, or KG observability as benchmark evidence.",
        publicDisclosure: "A document RAG repo label, local UI demo, upload-and-query transcript, README architecture diagram, paper abstract, aggregate answer score, or copied example does not establish replayable document reasoning quality without carrier, router, KG, memory, observability, metric, and replay proof.",
        requiredEvidence: "Signed benchmark id/version, repository snapshot hash, paper reference hash, license reference hash, document corpus hash, text carrier manifest hash, image-text carrier manifest hash, PDF processing trace hash, query set hash, unanswerable query set hash, complexity-router config hash, routing-decision trace hash, perception trace hash, reasoning trace hash, session-KG manifest hash, KG-expansion trace hash, memory policy hash, memory-recall trace hash, retrieval trace hash, generation trace hash, observability trace hash, eval config hash, metrics report hash, report artifact hash, environment hash, dependency lock hash, replay command hash, deterministic seed, carrier mode, query modes, memory layers, retrieval paths, document/query/memory-layer counts, routing accuracy, evidence recall, answer accuracy, unanswerable robustness, token and cost reduction, replay pass rate, score delta, thresholds, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.13-r90 should be regenerated or relabeled before using Yang-Jiashu/Doc-thinker-style, DocThinker, AutoThinkRAG, document RAG, multimodal document QA, adaptive retrieval, session-KG, evolving memory, or image-text reasoning replay claims."
      },
      {
        boundary: "clonemem_long_term_memory_replay_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, Watch alert, or public claim uses CloneMem-style non-conversational digital traces, AI-clone long-term memory, longitudinal persona state, bilingual memory QA, temporal/emotional/opinion tracking, or unanswerable memory questions as benchmark evidence.",
        publicDisclosure: "A CloneMem or AI-clone memory label, aggregate memory score, README result, local run log, copied dataset row, persona summary, or chat-only memory benchmark does not establish replayable non-conversational long-term-memory quality without digital-trace, persona, question, evidence, bilingual, category, replay, threshold, and row-hash proof.",
        requiredEvidence: "Signed benchmark id/version, repository snapshot hash, source reference hash, dataset license reference hash, persona manifest hash, digital-trace manifest hash, diary/social/direct-message/email trace manifests, question-set hash, ground-truth evidence hash, temporal split hash, bilingual config hash, evaluation config hash, baseline retriever hash, memory-system config hash, result artifact hash, replay command hash, deterministic seed, trace-kind coverage, task-category coverage, language coverage, persona count, question count, short/long-context persona counts, context-span months, evidence-grounding, temporal-consistency, unanswerable-accuracy, trajectory-reasoning, replay pass rate, score delta, thresholds, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.13-r103 should be regenerated or relabeled before using AvatarMemory/CloneMemBench-style, CloneMem, AI-clone memory, digital-trace memory, bilingual long-term memory, temporal reasoning, trajectory analysis, unanswerable memory QA, or non-conversational long-term-memory replay claims."
      },
      {
        boundary: "researchharness_agent_replay_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, Watch alert, or public claim uses ResearchHarness-style tool-using agent harnesses, OpenAI-compatible serving, workspace-first execution, model-provider comparison, or personal-assistant runtime replay as benchmark evidence.",
        publicDisclosure: "A ResearchHarness label, harness demo, model name list, local run log, README summary, trace folder, or aggregate agent score does not establish fair replayable tool-using harness capability without contract, tool-surface, trace, adapter, provider, baseline, replay, and row-hash proof.",
        requiredEvidence: "Signed benchmark id/version, repository snapshot hash, source reference hash, license reference hash, runtime contract hash, tool-surface manifest hash, native tool-call trace hash, OpenAI-compatible API hash, workspace-boundary hash, trace manifest hash, benchmark-adapter hash, baseline harness config hash, meta-harness comparison hash, model-provider matrix hash, evaluation report hash, replay command hash, context-compaction policy hash, human-interaction policy hash, model-family coverage, tool-kind coverage, task-mode coverage, trace-event count, replay pass rate, trace coverage, tool-call validity, workspace isolation, API compatibility, baseline agreement, score delta, thresholds, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.13-r104 should be regenerated or relabeled before using InternScience/ResearchHarness-style, ResearchHarness, tool-using agent harness, benchmark-adapter, OpenAI-compatible API, workspace-first execution, or personal-assistant runtime replay claims."
      },
      {
        boundary: "agent_mont_monitoring_replay_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, Watch alert, or public claim uses Agent_Mont-style monitoring for Agno, Crew AI, or custom agent applications as replayable benchmark or observability evidence.",
        publicDisclosure: "An Agent Mont label, dashboard screenshot, CLI summary, local log, token count, cost number, latency number, README example, or visualization alone does not establish replayable monitored-agent quality without source, monitoring config, metric artifact, threshold, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed benchmark id/version, Agent Mont benchmark id, repository snapshot hash, source reference hash, license reference hash, monitoring config hash, framework label, agent config hash, task manifest hash, run trace hash, token-usage manifest hash, cost rate-card hash, latency trace hash, resource-utilization hash, carbon-estimate config hash, log artifact hash, visualization artifact hash, metrics report hash, replay command hash, visualization-mode coverage, input/output/total token counts, cost, latency, throughput, CPU utilization, memory, carbon estimate, replay pass rate, metric coverage, log coverage, thresholds, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.13-r107 should be regenerated or relabeled before using ansarifaisal12/Agent_Mont-style, Agent Mont, Agno monitoring, Crew AI monitoring, token/cost/latency/resource/carbon observability, visualization, or monitored-agent replay claims."
      },
      {
        boundary: "edge_ai_agent_replay_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, Watch alert, or public claim uses edge/on-device multimodal-agent benchmarks, device AI, mobile, embedded, wearable, IoT, client runtime, inference-engine, optimization, benchmark/dataset, application scenario, latency, memory, energy, accuracy, replay, offline, or privacy evidence as benchmark proof.",
        publicDisclosure: "A curated list label, paper link, benchmark name, framework/runtime name, device claim, local run, README list row, aggregate score, latency number, screenshot, copied list item, or application example does not establish replayable edge-agent quality without source, device, runtime, optimization, dataset, task, application, replay, metric, threshold, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed benchmark id/version, source reference hash, repository snapshot hash, license reference hash, device profile hash, runtime manifest hash, optimization manifest hash, benchmark dataset hash, task manifest hash, application scenario hash, replay command hash, metrics report hash, device-class coverage, modality coverage, runtime-kind coverage, on-device execution flag, offline-capability flag, privacy-boundary flag, latency p95, memory p95, energy per task, accuracy, replay pass rate, score delta, thresholds, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.13-r113 should be regenerated or relabeled before using yh-yao/awesome-edge-ai-agents-style, edge AI agent, on-device multimodal-agent, mobile/embedded/wearable/IoT agent, inference-engine, optimization, benchmark/dataset, latency/memory/energy, or offline/privacy edge-agent replay claims."
      },
      {
        boundary: "agent_workflow_kit_replay_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, Watch alert, or public claim uses Agent Workflow Kit-style evaluation-first repository workflows, risk scoring, workflow-level selection, AGENTS templates, skill packages, spec-layer guidance, external-action approvals, verification commands, or docs checks as replay evidence.",
        publicDisclosure: "An Agent Workflow Kit label, risk score, AGENTS.md template, copied checklist, skill package name, docs badge, guide summary, or local docs-check output alone does not establish replayable workflow maturity without source, policy, approval, verification, threshold, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed benchmark id/version, repository snapshot hash, source reference hash, license reference hash, guide hash, skill-package manifest hash, template manifest hash, risk-scoring rubric hash, workflow-level policy hash, spec-layer policy hash, approval policy hash, verification-command manifest hash, docs-check workflow hash, evaluation manifest hash, replay command hash, risk score, recommended level, applied level, workflow-level match flag, spec-layer decision validity, external-approval requirement and gate proof, deterministic seed, verification pass rate, template coverage, docs-check pass rate, replay pass rate, thresholds, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.13-r108 should be regenerated or relabeled before using crisxuan/agent-workflow-kit-style, Agent Workflow Kit, evaluation-first workflow, risk-score, workflow-level, AGENTS template, skill package, spec-layer, external-approval, verification-command, docs-check, or workflow replay claims."
      },
      {
        boundary: "medask_clinical_benchmark_replay_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, Watch alert, or public claim uses MedAsk, SymptomCheck Bench, Triage Bench, OSCE-style diagnostic accuracy, top-5 differential diagnosis, clinical vignette, or medical urgency classification replay evidence.",
        publicDisclosure: "A MedAsk label, clinical-vignette count, README run, blog result, local model output, aggregate diagnostic accuracy, triage accuracy, urgency label, or copied result table does not establish replayable clinical-agent benchmark quality without source, vignette, simulator, evaluator, result, command, threshold, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed benchmark id/version, repository snapshot hash, source reference hash, license reference hash, requirements hash, setup hash, SymptomCheck vignette manifest hash, Triage vignette manifest hash, SymptomCheck evaluation script hash, Triage evaluation script hash, patient-simulator config hash, doctor model config hash, triage model config hash, SymptomCheck result manifest hash, Triage result manifest hash, paired-analysis hash, run command hash, replay command hash, clinical-task coverage, deterministic seed, symptom and triage vignette counts, top-5 diagnostic accuracy, triage accuracy, urgency-class coverage, replay pass rate, score delta, thresholds, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.13-r110 should be regenerated or relabeled before using medaks/medask-benchmarks-style, MedAsk, SymptomCheck Bench, Triage Bench, OSCE-style diagnostic agent, top-5 differential diagnosis, clinical-vignette, or medical-triage replay claims."
      },
      {
        boundary: "bio_kg_bench_replay_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, Watch alert, or public claim uses BioKGBench-style biomedical KG checking, KGQA, SCV, biomedical literature/database QA, error-discovery, knowledge-graph build, or biomedical KG replay evidence.",
        publicDisclosure: "A BioKGBench label, paper abstract, dataset link, KGCheck/KGQA/SCV task name, local KG build, Neo4j mention, aggregate score, discovered-error count, README result, or copied benchmark row does not establish replayable biomedical KG-agent quality without source, dataset, KG, task, evaluation, replay, threshold, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed benchmark id/version, source reference hash, repository snapshot hash, paper reference hash, license reference hash, dataset-release hash, knowledge graph manifest hash, KG build config hash, task manifest hash, KGCheck manifest hash, KGQA manifest hash, SCV manifest hash, agent config hash, RAG config hash, Neo4j config hash, evaluation script hash, result manifest hash, error-discovery report hash, replay command hash, CI receipt hash, KGCheck/KGQA/SCV task-kind coverage, deterministic seed, dataset sample count, KGCheck annotated count, KGQA test count, SCV test count, KGCheck accuracy, KGQA accuracy, SCV accuracy, error discovery count, replay pass rate, score delta, thresholds, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.13-r120 should be regenerated or relabeled before using westlake-autolab/BioKGBench-style, BioKGBench, biomedical KG checking, KGQA, SCV, BKGAgent-style, or biomedical knowledge-graph replay claims."
      },
      {
        boundary: "biomedarena_replay_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, Watch alert, or public claim uses BioMedArena-style biomedical harness, biomedical agent benchmark-family coverage, tool-mode coverage, adapter/tool/vendor coverage, baseline comparison, replay pass-rate, or sandboxed tool-use evidence.",
        publicDisclosure: "A BioMedArena label, repository metadata, README overview, benchmark count, tool count, config filename, local run log, aggregate score, copied result table, or harness name does not establish replayable biomedical harness quality without source, harness, benchmark, adapter, tool, vendor, baseline, result, replay, threshold, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed benchmark id/version, source reference hash, repository snapshot hash, license reference hash, README hash, pyproject hash, config hash, matrix config hash, harness tree hash, harness CLI hash, benchmark config hash, eval suite hash, adapter registry hash, tool registry hash, vendor manifest hash, baseline agent hash, quick-run hash, release-gate hash, result manifest hash, replay command hash, CI receipt hash, benchmark-family coverage, tool-mode coverage, deterministic seed, benchmark count, tool count, adapter count, vendor count, baseline and candidate scores, score delta, replay pass rate, tool coverage, benchmark coverage, tool sandbox verification, thresholds, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.19-r164 should be regenerated or relabeled before using AI-in-Health/BioMedArena-style, BioMedArena, biomedical agent harness, benchmark-family, tool-mode, adapter/tool/vendor coverage, or biomedical harness replay claims."
      },
      {
        boundary: "mirage_drug_repositioning_metric_validity",
        appliesWhen: "Any report, badge, metric-validation eval pack, Shield receipt, Watch alert, or public claim uses ARIASHA/MiRAGE-style drug-repositioning, drug-disease association, biological feature integration, hard-negative mining, random-forest classifier, feature-importance selection, score calculation, benchmark evaluation, or case-study validation evidence.",
        publicDisclosure: "A MiRAGE label, GitHub metadata, paper link, dataset folder, local notebook run, aggregate drug-repositioning score, random-forest mention, feature-importance table, case-study name, README result, or copied dataset row does not establish metric validity without dataset release, split, mapping, feature, similarity, negative-sampling, classifier, score, evaluation, owner, sample/CI, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed metric-validation row, source reference hash, repository snapshot hash, paper or publication reference hash, dataset-release manifest hash, train/test split manifest hash, drug-disease mapping manifest hash, drug feature manifest hash, disease feature manifest hash, similarity matrix manifest hash, negative-sampling protocol hash, classifier config hash, feature-selection report hash, score-calculation manifest hash, evaluation report hash, case-study validation hash, benchmark ids, dataset ids, split ids, mapping ids, feature-set ids, similarity-matrix ids, negative-sampling ids, classifier-config ids, feature-selection report ids, score-calculation ids, case-study ids, metric names, drug count, disease count, mapping count, feature-set count, similarity-matrix count, metric owner, sample size, confidence interval, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.13-r121 should be regenerated or relabeled before using ARIASHA/MiRAGE-style, MiRAGE drug-repositioning, drug-disease association, biological-feature integration, hard-negative-mining, random-forest, feature-importance, score-calculation, or case-study metric-validity claims."
      },
      {
        boundary: "ollama_metrics_live_drift_integrity",
        appliesWhen: "Any report, badge, Watch alert, or public claim uses Ollama metrics, local LLM proxy observability, Prometheus-scraped token/latency/memory data, model-loaded status, Grafana dashboard evidence, or sidecar metrics as live drift proof.",
        publicDisclosure: "An Ollama label, dashboard screenshot, local metrics endpoint, model name, token count, latency number, README example, or raw Prometheus sample does not establish comparable live local-LLM behavior without sidecar, source, repository, license, proxy, host, scrape, endpoint, baseline/live snapshot, alert-policy, model, deployment, metric, threshold, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed sidecar id, source reference hash, repository snapshot hash, license reference hash, proxy config hash, Ollama host config hash, Prometheus scrape config hash, optional Grafana dashboard hash, metrics endpoint snapshot hash, baseline snapshot hash, live snapshot hash, alert-policy hash, model id, deployment mode, prompt-token and generated-token counts, request-duration p95, time per token, loaded-model count, model-loaded status, model RAM, request error rate, model/deployment/proxy-context distributions, thresholds, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.13-r111 should be regenerated or relabeled before using NorskHelsenett/ollama-metrics-style, Ollama metrics sidecar, local LLM proxy, Prometheus token/latency/memory, model-loaded, Grafana dashboard, or local-model live-drift claims."
      },
      {
        boundary: "recovery_bench_live_drift_integrity",
        appliesWhen: "Any report, badge, Watch receipt, or public claim uses Recovery-Bench-style failed-trajectory replay, corrupted-environment recovery, recovery success rate, recovery reward, Terminal-Bench task recovery, message-mode comparison, or agent-harness recovery evidence as live capability or drift proof.",
        publicDisclosure: "A Recovery-Bench label, Terminal-Bench task name, local run, README workflow, failed trace folder, replay log, aggregate recovery success rate, model/provider label, message-mode label, or copied result alone does not establish live recovery reliability without source, failure-trace, replay, corrupted-environment, recovery-agent, message-mode, result, score-report, threshold, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed benchmark id, source reference hash, repository snapshot hash, license reference hash, Terminal-Bench version, initial trace-set hash, task id, failed-trajectory hash, replay command-log hash, replay environment hash, corrupted-environment hash, recovery agent id, recovery agent config hash, recovery model id, recovery run config hash, message mode, agent harness, recovery transcript hash, recovery result hash, score report hash, initial reward, recovery reward, initial failed flag, replay succeeded flag, recovery succeeded flag, context-provided flag, baseline and live distributions, thresholds, alert receipt or waiver, signed evidence refs, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.13-r115 before using letta-ai/recovery-bench-style, Recovery-Bench, failed-trajectory replay, corrupted-environment recovery, Terminal-Bench recovery, recovery-agent message-mode, recovery success, or recovery reward live-drift claims."
      },
      {
        boundary: "legal_code_rag_metric_validity",
        appliesWhen: "Any report, badge, metric-validation eval pack, Shield receipt, Watch alert, or public claim uses Legal Code RAG, French legal-code RAG, Legifrance-backed RAG, Qdrant-backed legal retrieval, windowing, hybrid-search, query-rewrite, routing, or legal-domain RAG evaluation as maturity evidence.",
        publicDisclosure: "A Legal Code RAG label, France legal-code corpus reference, Legifrance mention, Qdrant config, notebook run, README example, aggregate RAG score, local query output, or copied tutorial result does not establish metric validity without legal-corpus, source-boundary, retrieval-technique, evaluation, threshold, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed metric-validation row, repository snapshot hash, source reference hash, Apache-2.0 license reference hash, legal corpus manifest hash, Legifrance source-boundary hash, retriever config hash, vector database config hash, embedding model config hash, windowing config hash, hybrid-search config hash, query-rewrite config hash, routing-policy config hash, evaluation dataset hash, reference-answer manifest hash, metric definition hash, evaluator config hash, evaluation report hash, legal code ids, jurisdiction ids, retrieval technique ids, vector-store ids, embedding model ids, evaluation dataset ids, metric names, legal question count, metric owner, sample size, confidence interval, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.13-r109 should be regenerated or relabeled before using HamzaG737/legal-code-rag-style, Legal Code RAG, French legal-code RAG, Legifrance-backed RAG, Qdrant-backed RAG, OpenAI or Mistral embedding legal RAG, windowing, hybrid-search, query-rewrite, routing, or legal RAG metric-validity claims."
      },
      {
        boundary: "cryptography_benchmark_methodology_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, or public claim uses cryptography capability, AICrypto-style benchmark, MCQ, CTF, proof, vulnerability exploitation, formal reasoning, or expert-baseline evidence as external proof of agent or model maturity.",
        publicDisclosure: "A crypto benchmark label, aggregate leaderboard score, model ranking, local run output, CTF solve count, proof score, MCQ accuracy, website figure, or copied task example does not establish comparable cryptography capability without versioned task-family, scoring, dataset, expert-baseline, sandbox, and proof-rubric evidence.",
        requiredEvidence: "Signed paper/arXiv version, repository snapshot hash, dataset release and license refs, task-family manifest, MCQ manifest and answer-key/rubric proof, CTF challenge manifest, CTF sandbox/toolchain and automated-agent-framework proof, proof-problem manifest, proof rubric/reference-solution proof, human expert baseline reference, model/provider config, run/output artifact, scoring formula, per-family counts, contamination or recency policy, regression thresholds, source refs, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.13-r93 should be regenerated or relabeled before using wangyu-ovo/aicrypto-agent-style, AICrypto, cryptography-capability benchmark, MCQ, CTF, proof-problem, vulnerability-exploitation, formal-reasoning, or expert-baseline claims."
      },
      {
        boundary: "provider_observability_pipeline_integrity",
        appliesWhen: "Any report, badge, provider-drift eval pack, Watch alert, or public claim uses experiment-tracked LLM observability, Opik-style evaluation, ZenML-style orchestration, Mongo-backed retrieval or storage, football-content summary/QA evaluation, or multi-metric canary evidence as proof of provider/model comparability.",
        publicDisclosure: "A provider/model label, aggregate score, dashboard screenshot, metric name list, local pipeline run, README example, or trace id does not establish comparable provider drift behavior without pipeline, experiment, datastore, dataset, trace, metric-report, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed provider/model versions, canary id, evaluator framework id/version, provider route, metric suite and metric ids/count, evaluator config, generated test data, verdict aggregation, dashboard/report artifact, pipeline orchestrator id, pipeline run id, experiment tracker id, experiment run id, observability project id, datastore id, retrieval index hash, content dataset hash, summary artifact hash, QA dataset hash, trace export hash, metric report hash, pipeline config hash, drift statistic, alert or waiver, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.13-r92 should be regenerated or relabeled before using benitomartin/llm-observability-opik-style, Opik, ZenML, Mongo-backed football-content evaluation, observability pipeline, trace-export, or experiment-tracked provider-drift claims."
      },
      {
        boundary: "geospatial_tool_calling_provider_drift",
        appliesWhen: "Any report, badge, provider-drift eval pack, Watch alert, or public claim uses GeoBenchX-style geospatial tool-calling, GIS workflow, spatial-analysis, solvable/unsolvable task, LLM-as-judge panel, token-cost, or model/provider canary evidence as proof of provider/model comparability.",
        publicDisclosure: "A geospatial benchmark label, notebook, generated map, HTML transcript, README result, aggregate score, model ranking, local run output, or copied task row does not establish comparable provider drift behavior without task, dataset, tool, trace, judge, calibration, result, token-cost, threshold, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed provider/model versions, canary id, geospatial benchmark id, task-set hash, dataset snapshot hash, tool-registry hash, reference-solution hash, tool-call trace export hash, judge panel id, judge config hash, human-calibration hash, result-report hash, token-cost report hash, task-complexity groups, solvable task count, unsolvable task count, tool count, max tool iterations, sample size, trajectory count, score/refusal/latency/cost drift statistics, alert or waiver, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.13-r95 should be regenerated or relabeled before using Solirinai/GeoBenchX-style, GeoBenchX, geospatial tool-calling, GIS workflow, spatial-analysis, LLM-as-judge, solvable/unsolvable task, token-cost, or provider-drift canary claims."
      },
      {
        boundary: "llm_rag_eval_suite_live_drift_integrity",
        appliesWhen: "Any report, badge, Watch receipt, or public claim uses LLM or RAG semantic similarity, bias evaluation, hallucination/faithfulness evaluation, multi-metric evaluation, BERTScore-style candidate/reference scoring, or AIAnytime-style LLM/RAG evaluation as live capability or drift proof.",
        publicDisclosure: "A notebook, metric script, local run log, aggregate score, README claim, model/provider label, copied example, or candidate/reference text alone does not establish live LLM/RAG drift reliability without versioned suite, artifact, metric, judge, threshold, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed eval-suite id, eval-run id, candidate-manifest hash, reference-manifest hash, metric-suite hash, semantic metric id, bias metric id, hallucination or faithfulness metric id, judge-config hash, report hash, semantic-similarity score, bias-risk score, hallucination/faithfulness rate, baseline and live distributions, thresholds, alert receipt or waiver, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.13-r96 should be regenerated or relabeled before using AIAnytime/Evaluation-of-LLMs-and-RAGs-style, LLM evaluation, RAG evaluation, BERTScore-style, bias-evaluation, hallucination/faithfulness, or multi-metric live drift claims."
      },
      {
        boundary: "kite_rag_live_drift_integrity",
        appliesWhen: "Any report, badge, Watch receipt, or public claim uses KITE-style knowledge-intensive RAG benchmark grades, dataset-family comparisons, RAG configuration comparisons, or end-to-end corpus/query/rubric/judge evidence as live capability or drift proof.",
        publicDisclosure: "A KITE label, repository metadata, folder name, dataset name, aggregate RAG grade, judge model name, local run log, README result, copied query, copied answer, copied rubric, or sample result alone does not establish live KITE-style RAG drift reliability without corpus, query, answer, rubric, pipeline, response, result, judge, threshold, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed benchmark id, source reference hash, repository snapshot hash, license reference hash, corpus manifest hash, document-set id, query-set hash, ground-truth answer hash, rubric hash, RAG pipeline config hash, response manifest hash, result manifest hash, judge config hash, dataset family, RAG configuration id, grading scale, question count, document count, grade, normalized grade, small-sample warning, baseline and live distributions, dataset-family/config/context drift thresholds, alert receipt or waiver, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.13-r122 should be regenerated or relabeled before using D-Star-AI/KITE-style, KITE, knowledge-intensive task evaluation, end-to-end RAG benchmark, corpus/query/rubric/judge, grade, dataset-family, RAG configuration, or live-drift claims."
      },
      {
        boundary: "poker_eval_live_drift_integrity",
        appliesWhen: "Any report, badge, Watch receipt, or public claim uses PokerEval-style NLTH poker simulation, partial-information decision-making, BB/100, EV, all-in adjusted BB/100, VPIP, hand-count, table context, or opponent-pool drift as live capability proof.",
        publicDisclosure: "A PokerEval label, repository metadata, package name, leaderboard row, README result, local simulation output, copied hand-history row, aggregate BB/100, model/provider label, or sample cards alone does not establish live PokerEval-style drift reliability without source, package, citation, simulation, run, hand-history, metric, threshold, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed benchmark id, source reference hash, repository snapshot hash, package reference hash, citation reference hash, simulation config hash, agent config hash, opponent-pool hash, run manifest hash, hand-history manifest hash, metric-report hash, game type, table size, blind-structure hash, hand count, BB/100, all-in adjusted BB/100, EV BB/100, VPIP rate, baseline and live distributions, KPI and context drift thresholds, alert receipt or waiver, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.13-r124 should be regenerated or relabeled before using superagent-ai/poker-eval-style, PokerEval, NLTH poker simulation, partial-information decision-making, BB/100, EV, all-in adjusted BB/100, VPIP, hand-count, opponent-pool, or live-drift claims."
      },
      {
        boundary: "physical_risk_awareness_methodology_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, or public claim uses EARBench-style physical-risk-awareness, embodied task-planning safety, risky-scene, textual/visual scenario, task-risk-rate, effectiveness, mitigation-prompt, or EARDataset evidence as public methodology or score evidence.",
        publicDisclosure: "A repository title, arXiv abstract, aggregate TRR, local demo command, dataset filename, or copied benchmark row does not establish comparable physical-risk-awareness methodology without source, dataset, scenario, guideline, observation, instruction, plan, assessment, metric, mitigation, threshold, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed benchmark id, source reference hash, repository snapshot hash, paper reference hash, license reference hash, EARDataset or equivalent dataset manifest hash, physical-risk scenario manifest hash, domain coverage manifest, scene coverage manifest, safety-guideline manifest hash, textual observation manifest hash, visual observation manifest hash when used, task instruction manifest hash, plan-generation config hash, plan assessment rubric hash, plan result manifest hash, task risk rate threshold, effectiveness metric definition, mitigation prompt or policy manifest hash when used, signed evidence refs, row hashes, and threshold policy.",
        migration: "Reports generated under 2026.06.13-r126 should be regenerated or relabeled before using EARBench-style, physical-risk-awareness, embodied task-planning safety, EARDataset, risky-scene, textual/visual scenario, TRR, mitigation-prompt, or plan-assessment methodology claims."
      },
      {
        boundary: "llmops_pipeline_methodology_integrity",
        appliesWhen: "Any report, badge, Watch receipt, Shield receipt, or public claim uses LLMOPS-style text-summarization, RAG evaluation, QA deployment, CI/CD, container, Kubernetes, infrastructure-as-code, monitoring, or model-service lifecycle evidence as public methodology or score evidence.",
        publicDisclosure: "A repository title, README diagram, notebook demo, local command, cloud deployment note, dashboard screenshot, or copied pipeline config does not establish comparable LLMOps lifecycle methodology without source, pipeline, dataset, model artifact, evaluation, deployment, CI/CD, orchestration, infrastructure, monitoring, threshold, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed lifecycle methodology id, source reference hash, repository snapshot hash, license reference hash, task or pipeline manifest hash, dataset manifest hash, train/eval split manifest hash where used, model registry or artifact manifest hash, training or fine-tuning config hash where used, evaluation config hash, RAG evaluation config hash where used, QA deployment manifest hash, CI/CD pipeline receipt hash, container manifest hash, orchestration manifest hash, infrastructure-as-code manifest hash where used, monitoring telemetry baseline hash, model performance threshold, service reliability threshold, signed evidence refs, row hashes, and migration policy.",
        migration: "Reports generated under 2026.06.13-r127 should be regenerated or relabeled before using LLMOPS-style, text-summarization pipeline, RAG evaluation, QA deployment, CI/CD, container, Kubernetes, infrastructure-as-code, monitoring, or model-service lifecycle methodology claims."
      },
      {
        boundary: "multi_user_question_explainability_integrity",
        appliesWhen: "Any report, badge, Shield receipt, Watch explainability response, or public claim uses Multi-User-LLM-Agent-style access-control, meeting-scheduling, shared-queue, multi-user instruction-following, permission, preference, resource-fairness, or multi-stakeholder scenario evidence to justify a question-level L0-L5 score.",
        publicDisclosure: "A scenario label, repository metadata, README capability summary, copied dataset path, local run log, aggregate scenario score, model/provider label, or single transcript alone does not establish question-level multi-user agent maturity without scenario identity, role, policy, trace, evaluator, metric-threshold, accepted/rejected evidence, repair-hint, and row-hash proof.",
        requiredEvidence: "Signed question id, benchmark id, source reference hash, scenario id, scenario family, capability label, dataset manifest hash, user-role manifest hash, scenario-specific permission policy hash, preference profile hash, resource queue policy hash, or instruction-set hash as applicable, interaction trace hash, evaluator config hash, result artifact hash, metric report hash, user-role count, turn count, privacy/access-control pass rate, coordination success rate, queue fairness score, instruction-following score, scenario-specific thresholds, status, accepted evidence refs, rejected evidence refs with reasons, repair hint, and row hash.",
        migration: "Reports generated under 2026.06.13-r123 should be regenerated or relabeled before using Kordi-AI/Multi-User-LLM-Agent-style, multi-user LLM-agent, access-control, meeting-scheduling, shared-queue, multi-user instruction-following, permission, preference, resource-fairness, or multi-stakeholder question-explainability claims."
      },
      {
        boundary: "continual_learning_question_explainability_integrity",
        appliesWhen: "Any report, badge, Shield receipt, Watch explainability response, or public claim uses CL-Bench-style continual-learning, stateful workflow, multi-turn conversation, state mutation, entity-relationship, tool-execution, adaptive-learning, task-completion, response-quality, state-accuracy, retention, or token-cost evidence to justify a question-level L0-L5 score.",
        publicDisclosure: "A repository title, benchmark label, CRM label, dataset path, seed label, local transcript, copied task prompt, aggregate score, task-completion percentage, response-quality score, token cost, model/provider label, or source metadata alone does not establish question-level continual-learning maturity without dataset, state schema, initial state, mutation trace, conversation trace, entity graph, tool execution, evaluator, result, replay command, metric-threshold, accepted/rejected evidence, repair-hint, and row-hash proof.",
        requiredEvidence: "Signed question id, benchmark id, source reference hash, domain id, workflow id, dataset manifest hash, state schema hash, initial state hash, state mutation trace hash, conversation trace hash, entity-relationship graph hash, tool-execution trace hash, evaluator config hash, result artifact hash, replay command hash, memory policy hash when claimed, adaptive-learning trace hash when claimed, scenario count, turn count, state-mutation count, entity count, task-completion rate and threshold, response-quality score and threshold, state-accuracy score and threshold, retention score and threshold, token cost and threshold where claimed, status, accepted evidence refs, rejected evidence refs with reasons, repair hint, and row hash.",
        migration: "Reports generated under 2026.06.17-r134 should be regenerated or relabeled before using Arc-Computer/CL-Bench-style, continual-learning, stateful CRM workflow, multi-turn conversation, state mutation, entity-relationship, tool-execution, adaptive-learning, or question-explainability claims."
      },
      {
        boundary: "hermes_turbo_question_explainability_integrity",
        appliesWhen: "Any report, badge, Shield receipt, Watch explainability response, or public claim uses Hermes Turbo-style performance dashboard, turbo scoring, low-latency, hot-path optimization, benchmark refresh, perf-budget, daily-score, or throughput evidence to justify a question-level L0-L5 score.",
        publicDisclosure: "A repository title, default-branch name, star count, README performance claim, local benchmark command, aggregate speedup number, dashboard screenshot, CI badge, model/provider label, or source metadata alone does not establish question-level performance maturity without source, license, commit/tree, benchmark workflow, perf-budget workflow, daily score workflow, script, dashboard, benchmark report, baseline/candidate result, trace, score, threshold, CI, accepted/rejected evidence, repair-hint, and row-hash proof.",
        requiredEvidence: "Signed question id, benchmark id, source reference hash, repository reference, license reference, SPDX id, default branch, source commit SHA, source tree SHA, source-status hash, README artifact hash, package manifest hash, benchmark workflow hash, perf-budget workflow hash, daily score workflow hash, turbo-score script hash, performance-dashboard hash, benchmark-report hash, baseline-result hash, candidate-result hash, latency trace hash, throughput trace hash, score-manifest hash, regression-threshold hash, CI run id, CI config hash, performance facet, run count and threshold, p50 latency and threshold, p95 latency and threshold, throughput and threshold, speedup factor and threshold, score delta and threshold, dashboard coverage and threshold, regression pass rate and threshold, status, accepted evidence refs, rejected evidence refs with reasons, repair hint, and row hash.",
        migration: "Reports generated under 2026.06.19-r183 should be regenerated or relabeled before using wesleysimplicio/hermes-turbo-agent-style, Hermes Turbo Agent, performance dashboard, turbo scoring, low-latency, hot-path optimization, benchmark refresh, perf budget, or performance question-explainability claims."
      },
      {
        boundary: "professional_task_question_explainability_integrity",
        appliesWhen: "Any report, badge, Shield receipt, Watch explainability response, or public claim uses OccuBench-style professional-task, language-world-model environment, fault-injection, verifier-vote, trajectory, robustness, or real-world professional-domain evidence to justify a question-level L0-L5 score.",
        publicDisclosure: "A professional-domain label, repository metadata, README benchmark summary, environment-mode name, copied task text, local run log, aggregate pass rate, single trajectory, verifier comment, or model/provider label alone does not establish question-level professional-task maturity without scenario, world-model, fault, verifier, trajectory, replay, metric-threshold, accepted/rejected evidence, repair-hint, and row-hash proof.",
        requiredEvidence: "Signed question id, benchmark id, source reference hash, task id, scenario id, industry category, professional domain, difficulty level where claimed, dataset manifest hash, scenario manifest hash, world-model config hash, tool schema hash, agent config hash, fault-injection config hash, verifier rubric hash, verifier vote manifest hash, trajectory hash, result artifact hash, replay config hash, debug trace hash, environment mode, fault mode, verifier vote count and threshold, pass rate and threshold, robustness score and threshold, trajectory step count and bound, status, accepted evidence refs, rejected evidence refs with reasons, repair hint, and row hash.",
        migration: "Reports generated under 2026.06.16-r129 should be regenerated or relabeled before using GregxmHu/OccuBench-style, professional-task, language-world-model, E0/E1/E2/E3 fault-mode, verifier-vote, trajectory, robustness, or professional-domain question-explainability claims."
      },
      {
        boundary: "iot_firmware_question_explainability_integrity",
        appliesWhen: "Any report, badge, Shield receipt, Watch explainability response, or public claim uses Adsum IoT Coder-style IoT firmware, embedded hardware, nRF, ESP, Zephyr, ESP-IDF, device-log, build/flash/test, bug-closure, or token-efficiency evidence to justify a question-level L0-L5 score.",
        publicDisclosure: "A firmware-agent label, repository metadata, package keyword, README capability summary, local build log, copied hardware task, aggregate BLE result, token-efficiency ratio, model/provider label, or source metadata alone does not establish question-level IoT firmware maturity without platform, board, chip, firmware, toolchain, SDK, hardware session, device logs, build/flash/test artifacts, evaluator, privacy, benchmark report, metric-threshold, accepted/rejected evidence, repair-hint, and row-hash proof.",
        requiredEvidence: "Signed question id, benchmark id, source reference hash, task id, platform, board id, chip family, firmware project hash, toolchain manifest hash, SDK version manifest hash, hardware session hash, device log bundle hash, build artifact hash, flash artifact hash, test artifact hash, knowledge-pack manifest hash, task manifest hash, evaluator config hash, result artifact hash, privacy boundary hash, benchmark report hash, hardware-run count, device count, bug-closure rate and threshold, token-efficiency ratio and threshold, log-capture coverage and threshold, status, accepted evidence refs, rejected evidence refs with reasons, repair hint, and row hash.",
        migration: "Reports generated under 2026.06.17-r140 should be regenerated or relabeled before using adsumnetworks/Adsum-IoT-Coder-style, IoT firmware, nRF, ESP, Zephyr, ESP-IDF, hardware-run, device-log, build/flash/test, bug-closure, token-efficiency, or firmware question-explainability claims."
      },
      {
        boundary: "retail_sales_question_explainability_integrity",
        appliesWhen: "Any report, badge, Shield receipt, Watch explainability response, or public claim uses ShampooSalesAgent-style retail sales, shampoo product recommendation, customer conversation, order capture, model-provider adapter, pricing policy, or privacy evidence to justify a question-level L0-L5 score.",
        publicDisclosure: "A retail-sales-agent label, repository metadata, README capability summary, product-description file, copied customer-order CSV, local CLI transcript, screenshot, model/provider name list, aggregate order count, recommendation text, or source metadata alone does not establish question-level retail sales maturity without source identity, product catalog, customer scenario, conversation trace, order schema, order ledger, pricing/discount policies, provider matrix, prompt/recommendation/safety/privacy policy, evaluator, result, benchmark report, metric thresholds, accepted/rejected evidence, repair-hint, and row-hash proof.",
        requiredEvidence: "Signed question id, benchmark id, source reference hash, task id, sales channel, product catalog hash, product description hash, customer scenario hash, conversation trace hash, customer intent manifest hash, order-capture schema hash, order ledger hash, pricing policy hash, discount policy hash, model adapter manifest hash, model provider matrix hash, prompt policy hash, recommendation policy hash, safety policy hash, privacy boundary hash, evaluator config hash, result artifact hash, benchmark report hash, model-provider count, customer-scenario count, order count, order-capture accuracy and threshold, policy-compliance rate and threshold, recommendation-grounding score and threshold, PII-redaction rate and threshold, status, accepted evidence refs, rejected evidence refs with reasons, repair hint, and row hash.",
        migration: "Reports generated under 2026.06.17-r142 should be regenerated or relabeled before using jackfsuia/ShampooSalesAgent-style, retail sales agent, shampoo sales, product recommendation, customer conversation, order capture, model-provider matrix, or retail question-explainability claims."
      },
      {
        boundary: "gto_wizard_poker_replay_integrity",
        appliesWhen: "Any report, badge, CI receipt, Watch receipt, or public claim uses GTO Wizard-style No-Limit Texas Hold'em poker-agent replay, API-key-gated hand play, AIVAT-style evaluation, legal-action traces, no-solver-access boundaries, or leaderboard context as benchmark evidence.",
        publicDisclosure: "A repository title, API-client label, local hand log, copied README command, leaderboard row, aggregate chip result, poker-agent name, or model/provider label alone does not establish replayable poker-agent maturity without source, repository, license, API-scope, no-solver, hand-history, action-trace, AIVAT, replay-command, CI, threshold, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed benchmark id/version, source reference hash, repository snapshot hash, license reference hash, API documentation reference hash, technical paper or metric reference hash, eval-pack manifest hash, fixture hash, agent-policy manifest hash, API-key scope hash, no-solver-access policy hash, hand-history manifest hash, legal-action trace hash, result manifest hash, AIVAT metric report hash, leaderboard snapshot hash when claimed, replay command hash, CI receipt hash, agent type ids and threshold, game variant, hand count and threshold, deterministic seed, baseline and candidate AIVAT bb/100, AIVAT score delta and regression threshold, replay pass rate and threshold, legal-action rate and threshold, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.16-r130 should be regenerated or relabeled before using gtowizard-ai/researcher-api-client-style, GTO Wizard, poker-agent, NLTH, API-key-gated, no-solver-access, AIVAT, legal-action, hand-history, leaderboard, or poker replay-corpus claims."
      },
      {
        boundary: "sap_agent_eval_tutorial_live_drift_integrity",
        appliesWhen: "Any report, badge, Watch receipt, Shield receipt, or public claim uses SAP-samples/llm-agents-eval-tutorial-style objective taxonomy, evaluation-process taxonomy, enterprise-context, notebook/dataset/log, metric/tooling, role-access, reliability, compliance, or dynamic interaction evidence as live-drift proof.",
        publicDisclosure: "A tutorial title, repository metadata, notebook name, dataset folder, sample log path, abstract summary, aggregate eval score, model/provider label, local notebook run, or copied log row alone does not establish live agent-evaluation drift reliability without source, repository, license, notebook, dataset, baseline log, live sample, metric, tooling, enterprise policy, alert, threshold, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed tutorial id, source reference hash, repository snapshot hash, license reference hash, paper or tutorial reference hash, notebook hash, dataset manifest hash, baseline log manifest hash, live sample manifest hash, metric config hash, tooling config hash, role-access policy hash, reliability policy hash, compliance policy hash, alert receipt hash, objective taxonomy value, evaluation-process taxonomy value, enterprise-context taxonomy value, objective/process/enterprise/evidence coverage, baseline and live distributions, drift thresholds, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.16-r131 should be regenerated or relabeled before using SAP-samples/llm-agents-eval-tutorial-style, SAP agent evaluation, KDD 2025 tutorial, objective taxonomy, evaluation-process taxonomy, enterprise role-access, reliability, compliance, dynamic interaction, or live-drift claims."
      },
      {
        boundary: "agent_eval_observability_live_drift_integrity",
        appliesWhen: "Any report, badge, Watch receipt, Shield receipt, or public claim uses vladfeigin/llm-agents-evaluation-style agent-evaluation observability, RAG example evaluation, prompt/model variant evaluation, OpenTelemetry, Application Insights, Event Hub, Kusto, Fabric dashboard, or telemetry-backed live-drift evidence.",
        publicDisclosure: "A repository title, GitHub metadata, README screenshot, copied config, copied Kusto script, dashboard name, local run output, aggregate eval score, Azure service label, prompt variant label, or model/provider label alone does not establish live agent-evaluation observability reliability without source, repository, license, agent config, eval dataset, prompt variant, model config, RAG index, metric config, baseline/live result, telemetry, alert, threshold, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed source reference hash, repository snapshot hash, license reference hash, agent config hash, eval dataset hash, prompt variant hash, model config hash, RAG index hash, metric config hash, baseline eval result hash, live eval result hash, OpenTelemetry trace hash, Application Insights hash, Event Hub hash, Kusto policy hash, Fabric dashboard hash, alert receipt hash, metric-set taxonomy value, telemetry-channel taxonomy value, config/telemetry/evidence coverage, baseline and live distributions, drift thresholds, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.16-r132 should be regenerated or relabeled before using vladfeigin/llm-agents-evaluation-style, agent-evaluation observability, RAG quality monitoring, prompt/model variant evaluation, OpenTelemetry, Application Insights, Event Hub, Fabric/Kusto, dashboard, or live-drift claims."
      },
      {
        boundary: "hedrarag_artifact_eval_live_drift_integrity",
        appliesWhen: "Any report, badge, Watch receipt, Shield receipt, or public claim uses Leo9660/HedraRAG_AE-style heterogeneous RAG artifact evaluation, workflow/runtime comparison, FAISS-indexed retrieval, graph RAG, HyDE, multistep RAG, FlashRAG/LangChain/HedraRAG baseline, latency, throughput, memory, or replay evidence.",
        publicDisclosure: "A repository title, README result, paper abstract, figure label, copied script name, copied CSV row, local run output, plot, aggregate latency, framework label, runtime label, or source metadata alone does not establish live HedraRAG artifact-eval reliability without source, repository snapshot, license-status or license-review proof, artifact, dataset/corpus/index/dependency/environment/run/result/resource, threshold, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed artifact id, source reference hash, repository snapshot hash, declared license hash or absent/unknown license-review hash, paper reference hash, artifact README hash, workflow taxonomy value, baseline-framework taxonomy value, runtime taxonomy value, dataset manifest hash, corpus manifest hash, index manifest hash, dependency manifest hash, environment config hash, run-script hash, figure id, result CSV hash, plot artifact hash, baseline result hash, live result hash, alert policy hash, resource profile hash, GPU profile hash, p95 latency, throughput, memory, replay pass rate, evidence coverage, baseline and live distributions, drift thresholds, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.17-r137 should be regenerated or relabeled before using Leo9660/HedraRAG_AE-style, HedraRAG, heterogeneous RAG, graph RAG, HyDE, multistep RAG, FlashRAG, LangChain, FAISS index, CUDA/GPU runtime, artifact-eval latency, throughput, memory, replay-pass, or live-drift claims."
      },
      {
        boundary: "agent_eval_harness_live_drift_integrity",
        appliesWhen: "Any report, badge, Watch receipt, Shield receipt, or public claim uses Siddharth-1001/agent-eval-harness-style local agent evaluation, structured trace, framework-adapter, dashboard, CLI, tool-success, hallucination, latency, cost, or side-by-side comparison evidence as live-drift proof.",
        publicDisclosure: "A repository title, GitHub metadata, README claim, copied example, copied config, dashboard screenshot, local JSON trace, CLI output, framework label, aggregate metric, or source metadata alone does not establish live agent-eval-harness reliability without source, repository, license, trace, adapter, dataset, task, tool schema, metric config, baseline/live result, local-storage policy, alert policy, threshold, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed run id, source reference hash, repository snapshot hash, license reference hash, trace schema hash, trace collector hash, trace writer hash, adapter config hash, framework taxonomy value, trace-mode taxonomy value, metric-context taxonomy value, trace manifest hash, dataset manifest hash, task manifest hash, tool schema hash, hallucination config hash, pricing config hash, metrics config hash, baseline run hash, live run hash, comparison report hash, dashboard snapshot hash, local-storage policy hash, alert policy hash, reproducibility command hash, tool-success rate, hallucination rate, p95 latency, mean cost, trace coverage, evidence coverage, baseline and live distributions, drift thresholds, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.17-r138 should be regenerated or relabeled before using Siddharth-1001/agent-eval-harness-style, local agent evaluation, structured traces, framework adapters, dashboard, CLI, tool-success, hallucination, latency, cost, side-by-side comparison, or live-drift claims."
      },
      {
        boundary: "strands_benchmark_harness_live_drift_integrity",
        appliesWhen: "Any report, badge, Watch receipt, Shield receipt, or public claim uses strands-labs/benchmark-harnesses-style Strands agents, SWE-Bench-style coding-agent tasks, Terminal-Bench-style terminal tasks, Docker/Harbor runtime isolation, trajectories, patches, test reports, result uploads, or benchmark-harness evidence as live-drift proof.",
        publicDisclosure: "A Strands label, repository metadata, local run, benchmark name, shell transcript, copied prompt/config, aggregate score, screenshot, leaderboard/result summary, or source metadata alone does not establish live benchmark-harness reliability without source, repository, license, agent package, harness config, model route, prompt template, suite, runtime, task, dataset, Docker/environment/tool-policy, trajectory, patch, test, result/upload, safety isolation, baseline/live run, alert policy, threshold, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed harness run id, source reference hash, repository snapshot hash, license reference hash, agent package hash, harness config hash, model route hash, prompt template hash, benchmark suite taxonomy value, runtime taxonomy value, task family taxonomy value, task manifest hash, dataset snapshot hash, Docker image hash, environment setup hash, tool policy hash, trajectory manifest hash, patch artifact hash, test report hash, result manifest hash, upload manifest hash, safety isolation policy hash, baseline run hash, live run hash, alert policy hash, task success rate, patch apply rate, test pass rate, trajectory coverage, evidence coverage, p95 latency, mean cost, baseline and live distributions, drift thresholds, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.17-r145 should be regenerated or relabeled before using strands-labs/benchmark-harnesses-style, Strands benchmark harness, SWE-Bench, Terminal-Bench, Docker/Harbor-isolated coding-agent, trajectory, patch, test-report, result-upload, or live-drift claims."
      },
      {
        boundary: "costnav_physical_navigation_replay_integrity",
        appliesWhen: "Any report, badge, CI receipt, Watch receipt, or public claim uses worv-ai/CostNav-style physical-navigation, route graph, simulator, trajectory, economic-cost, navigation-success, or replay evidence.",
        publicDisclosure: "A repository title, benchmark label, route label, screenshot, copied map, copied config, copied script, local simulator output, aggregate cost, model/provider label, or source metadata alone does not establish replayable physical-navigation maturity without source, repository, license, benchmark spec, scenario, route graph, economic-cost model, physical-agent config, simulator, trajectory, result, metric, replay command, CI, threshold, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed benchmark id/version, source reference hash, repository snapshot hash, license reference hash, benchmark spec hash, scenario manifest hash, route graph hash, economic-cost model hash, physical-agent config hash, simulator config hash, trajectory manifest hash, result manifest hash, metrics report hash, replay command hash, CI receipt hash, route types and threshold, scenario count and threshold, deterministic seed, baseline and candidate economic cost, economic-cost delta and regression threshold, navigation success rate and threshold, replay pass rate and threshold, score delta and regression threshold, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.17-r133 should be regenerated or relabeled before using worv-ai/CostNav-style, physical-navigation, route-graph, embodied-agent, simulator, trajectory, economic-cost, navigation-success, or benchmark replay claims."
      },
      {
        boundary: "terminalworld_replay_integrity",
        appliesWhen: "Any report, badge, CI receipt, Watch receipt, Shield receipt, or public claim uses EuniAI/TerminalWorld-style terminal-task replay, public terminal recording provenance, synthesized task instructions, Docker environment reproduction, state-based tests, or AllPassing/Nop/Partial validation evidence.",
        publicDisclosure: "A TerminalWorld label, repository metadata, arXiv abstract, dataset card, task count, category count, command count, copied README table, local Docker run, aggregate pass rate, or model/provider label alone does not establish replayable terminal-agent maturity without source, recording, privacy, task, Docker, state-test, trial-validation, result, replay, threshold, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed benchmark id/version, source reference hash, repository snapshot hash, paper reference hash, dataset snapshot hash, dataset and code license hashes, public recording manifest hash, recording metadata hash, privacy filter report hash, quality filter report hash, synthesized instruction hash, reference solution hash, task metadata hash, Dockerfile hash, Docker image digest hash, environment reproduction log hash, pre/post execution snapshot hashes, state test suite and result hashes, AllPassing/Nop/Partial trial hashes, agent run trace hash, result manifest hash, replay command hash, CI receipt hash, human verification hash when using the verified subset, category ids, command ids, task/category/unique-command/reproduced-environment counts and thresholds, deterministic seed, trial pass/failure rates, state-assertion coverage, replay pass rate, score delta, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.17-r136 should be regenerated or relabeled before using EuniAI/TerminalWorld-style, TerminalWorld, public terminal recording, asciinema-derived, synthesized terminal task, Docker environment, state-test, AllPassing, Nop, Partial, verified-subset, or terminal-agent replay claims."
      },
      {
        boundary: "nomiracl_multilingual_rag_live_drift_integrity",
        appliesWhen: "Any report, badge, Watch receipt, or public claim uses NoMIRACL-style multilingual RAG relevance, answerability, abstention on non-relevant retrieved passages, or hallucination/error rates as live capability or drift proof.",
        publicDisclosure: "A NoMIRACL label, language list, dataset card, README result, aggregate RAG score, model/provider label, copied example, local run log, or single hallucination metric alone does not establish multilingual RAG live-drift reliability without source, language, subset, retrieval, qrels, metric, threshold, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed benchmark id, source reference hash, repository snapshot hash, license reference hash, dataset manifest hash, language manifest hash, qrels manifest hash, passage pool hash, retrieval run hash, model-route hash, generation trace hash, evaluation report hash, baseline result hash, live result hash, alert-policy hash, language identity, relevant/non-relevant subset identity, query id hash, passage-set hash, subset judgment hash, relevance accuracy, abstention accuracy, hallucination rate, error rate, baseline and live distributions, language/subset/context drift thresholds, alert receipt or waiver, signed evidence refs, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.13-r105 before using project-miracl/nomiracl-style, NoMIRACL, multilingual RAG relevance, relevant/non-relevant subset, answerability, abstention, hallucination/error, or live-drift claims."
      },
      {
        boundary: "scaling_law_discovery_live_drift_integrity",
        appliesWhen: "Any report, badge, Watch receipt, or public claim uses SLDBench-style scaling-law discovery, autonomous formula discovery, R2/NMSE/NMAE extrapolation metrics, or AI-based scientific-discovery benchmark evidence as live capability or drift proof.",
        publicDisclosure: "A benchmark label, local script run, aggregate R2 score, README result, model/provider label, copied config, task name, or result folder alone does not establish live scaling-law discovery drift reliability without versioned task, split, config, artifact, metric, threshold, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed benchmark id, paper/source reference, eval-run id, task id, task type, dataset manifest, train split hash, test split hash, source-experiment manifest, task config, evolution config, evaluator config, model-route hash, program artifact, checkpoint trace, result report, formula family, extrapolation regime, R2, NMSE, NMAE, baseline and live distributions, thresholds, alert receipt or waiver, signed evidence refs, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.13-r98 before using SLDBench-style, scaling-law discovery, AI-based scaling-law, autonomous scientific-discovery, R2/NMSE/NMAE, formula-discovery, extrapolation, or live-drift claims."
      },
      {
        boundary: "scenario_simulation_replay_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, Watch alert, or public claim uses leaf-playground-style scenario simulation, human and LLM co-participation, action-level evaluation, web visualization, local server, persistence, or checkpoint-resume evidence as agent benchmark proof.",
        publicDisclosure: "A scenario label, local server demo, web UI screenshot, aggregate task score, task transcript, participant roster, README example, or copied scenario row alone does not establish replayable scenario-simulation benchmark quality without project, action, evaluator, visualization, persistence, and resume proof.",
        requiredEvidence: "Signed benchmark id/version, repository snapshot hash, source reference hash, scenario project manifest hash, scene definition hash, role definition hash, agent roster hash, human participant policy hash, LLM agent config hash, evaluator config hash, action schema hash, task dataset hash, web UI build hash, server config hash, container image hash, persistence store hash, checkpoint manifest hash, run config hash, event log hash, action trace hash, evaluation report hash, visualization artifact hash, replay command hash, deterministic seed, agent mode, evaluation mode, visualization mode, scenario/agent/action/evaluated-action counts, action evaluation coverage, task success, action score, replay pass rate, score delta, thresholds, persistence flag, checkpoint resume proof, signed evidence refs, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.13-r99 before using leaf-playground-style, scenario simulation, human/LLM co-participation, action-level evaluation, web visualization, persistence, checkpoint-resume, or replay-corpus claims."
      },
      {
        boundary: "warehouse_native_llm_eval_replay_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, Watch alert, or public claim uses dbt-llm-evals-style warehouse-native LLM evaluation, dbt evaluation runs, warehouse AI functions, LLM-as-judge criteria, automatic capture, baseline versioning, drift detection, or no-data-egress evidence as agent benchmark proof.",
        publicDisclosure: "A warehouse label, local dbt run log, SQL snippet, config snippet, aggregate judge score, dashboard result, README example, prompt/input/output sample, or copied table row alone does not establish replayable warehouse-native LLM eval quality without dbt, warehouse, capture, baseline, judge, drift, no-egress, and replay proof.",
        requiredEvidence: "Signed benchmark id/version, repository snapshot hash, source reference hash, dbt project manifest hash, dbt package lock hash, warehouse adapter config hash, warehouse AI function manifest hash, model manifest hash, capture config hash, prompt/input/output schema hash, baseline dataset hash, baseline version manifest hash, evaluation criteria hash, judge model config hash, sampling config hash, threshold config hash, raw capture table hash, raw baseline table hash, judge evaluation table hash, eval score table hash, performance summary hash, drift detection hash, alert table hash, compiled SQL artifact hash, run result artifact hash, data-egress policy hash, replay command hash, deterministic seed, warehouse, evaluation mode, model/capture/baseline/evaluated/criteria counts, capture coverage, judge score, pass rate, drift alert rate, replay pass rate, score delta, thresholds, data-egress-blocked proof, signed evidence refs, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.13-r100 before using dbt-llm-evals-style, warehouse-native LLM eval, dbt evaluation, warehouse AI function, LLM-as-judge, baseline-versioned, drift-detection, no-data-egress, or replay-corpus claims."
      },
      {
        boundary: "llm_workflow_observability_methodology_integrity",
        appliesWhen: "Any report, badge, Watch receipt, benchmark receipt, or public claim uses AgiFlow-style LLM QA, real-time tracing, visual debugging, prompt/model performance testing, production monitoring, OpenTelemetry-style instrumentation, frontend analytics, user feedback, session replay, or workflow visualization as public methodology or score evidence.",
        publicDisclosure: "A dashboard screenshot, trace id, SDK hook, local telemetry run, aggregate evaluation score, visual debugger view, prompt/model registry label, frontend analytics event, or user-feedback widget alone does not establish comparable LLM workflow methodology without versioned tracing, feedback, privacy, retention, monitoring, and methodology-hash proof.",
        requiredEvidence: "Signed methodology id, methodology version, methodology hash, trace schema version, SDK/instrumentation manifest hash, workflow graph or span-model hash, telemetry sampling policy hash, redaction policy hash, prompt registry snapshot hash, model registry snapshot hash, evaluation template hash, judge or rubric config hash, development test-window id, production monitoring-window id, frontend analytics schema hash, session replay artifact manifest hash, user-feedback collection schema hash, data-security boundary hash, retention policy hash, alert threshold config hash, report or badge migration guidance, signed evidence refs, and row hashes.",
        migration: "Regenerate or relabel reports generated under 2026.06.13-r101 before using AgiFlow-style, LLM QA, observability, visual-debugger, prompt/model performance, OpenTelemetry instrumentation, frontend analytics, user-feedback, session-replay, workflow-visualization, or production-monitoring methodology claims."
      },
      {
        boundary: "research_run_live_drift_integrity",
        appliesWhen: "Any report, badge, Watch receipt, or public claim uses autonomous AI research runs, long-horizon research agents, task-specific improvement, research-subtask completion, budgeted research execution, or ResearchGym-style evidence as live capability proof.",
        publicDisclosure: "A research-agent repo label, aggregate score, task family, run transcript, local command log, README result, or copied benchmark row does not establish live research-agent reliability without task, artifact, budget, inspection, and behavior-drift proof.",
        requiredEvidence: "Signed benchmark id, paper/source reference hash, task id and domain, task manifest hash, pruned repository hash, dataset manifest hash, evaluation harness hash, baseline-score manifest hash, grading script hash, withheld-solution policy hash, run config hash, runtime and runtime-image hash, agent adapter hash, workspace snapshot hash, transcript hash, cost summary hash, status hash, plan hash, inspection report hash, violation report hash, baseline and candidate scores, score improvement, subtask count and completion, experiment and async-job counts, runtime and API budgets, actual runtime and cost, inspection pass, budget-overrun and violation flags, task-domain and runtime-context distributions, thresholds, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.13-r91 should be regenerated or relabeled before using ResearchGym-style, autonomous AI research, task-improvement, long-horizon research-agent, inspection, budget-control, or research-run live drift claims."
      },
      {
        boundary: "rag_eval_flow_replay_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, Watch alert, or public claim uses Rag-Eval-flow-style local RAG evaluation, configurable RAG pipelines, data/model/judge/metric configured evaluation, prompt-template evaluation, sample-size replay, score-delta replay, or CI replay as agent benchmark proof.",
        publicDisclosure: "A local RAG eval label, config filename, aggregate score, README result, copied prompt, metric name, model label, judge label, local run output, or copied dataset row alone does not establish replayable local RAG evaluation quality without source, pipeline, data, model, judge, metric, prompt, fixture, replay, result, score-delta, CI, sample-size, and signed-evidence proof.",
        requiredEvidence: "Signed source reference hash, repository snapshot hash, license reference hash, pipeline config hash, data-source manifest hash, model config hash, judge config hash, metric definition hash, prompt-template hash, eval-pack manifest hash, fixture hash, replay command hash, result manifest hash, score-delta report hash, CI receipt hash, pipeline id, data format, model backend, judge backend, metric ids, sample size and threshold, deterministic seed, baseline and candidate scores, score delta and regression threshold, replay pass rate and threshold, metric coverage and threshold, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.13-r119 should be regenerated or relabeled before using aizip/Rag-Eval-flow-style, local RAG evaluation, configurable RAG pipeline, data/model/judge/metric configured, prompt-template, sample-size, score-delta, replay-command, or CI replay claims."
      },
      {
        boundary: "rag_eval_dataset_replay_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, Watch alert, or public claim uses sundi133/rag-eval-style document-to-QA dataset generation, endpoint ranking/reporting, generated QA dataset, sample app endpoint, replay, score delta, or CI proof.",
        publicDisclosure: "A rag-eval label, repository metadata, README workflow, local run, generated QA pair, copied dataset row, output JSON, endpoint URL, model label, or ranking report alone does not establish replayable document QA dataset evaluation without source, document, processor, prompt, generator, endpoint, response, ranking, evaluation, replay, CI, threshold, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed source reference hash, repository snapshot hash, license reference hash, input document manifest hash, processor config hash, prompt template hash, generator config hash, QA dataset hash, endpoint config hash, endpoint response trace hash, ranking report hash, evaluation run hash, replay command hash, CI receipt hash, dataset id, data formats, endpoint modes, metric ids, question count and threshold, endpoint count and threshold, deterministic seed, baseline and candidate scores, score delta and threshold, replay pass rate and threshold, endpoint response coverage and threshold, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.17-r146 should be regenerated or relabeled before using sundi133/rag-eval-style, document QA generation, endpoint evaluation/ranking, generated QA dataset, sample-app endpoint, report download, score-delta, or CI replay claims."
      },
      {
        boundary: "encourage_rag_replay_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, Watch alert, or public claim uses Encourage-style modular RAG, vLLM inference, Jinja templates, Chroma/Qdrant vector DB, Hugging Face or IR metrics, or MLflow tracking as benchmark evidence.",
        publicDisclosure: "An Encourage label, repository metadata, package version, dependency list, README feature claim, local run, vector DB label, MLflow screenshot, aggregate metric, or source metadata alone does not establish replayable modular RAG quality without method, inference, template, vector DB, dataset/query/reference, metrics, MLflow, result, replay, CI, threshold, signed-evidence, and row-hash proof.",
        requiredEvidence: "Signed source reference hash, repository snapshot hash, license reference hash, package version hash, dependency manifest hash, RAG method manifest hash, inference-runner config hash, template manifest hash, vector DB config hash, dataset manifest hash, query set hash, reference answer set hash, metric suite hash, MLflow run hash, result manifest hash, replay command hash, CI receipt hash, method id, inference backend, vector DB id, metric ids, document and question counts, deterministic seed, baseline and candidate scores, score delta and regression threshold, replay pass rate and threshold, metric coverage and threshold, MLflow logging flag, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.19-r160 should be regenerated or relabeled before using uhh-hcds/encourage-style modular RAG, vLLM, Jinja-template, Chroma/Qdrant, MLflow-tracked, or RAG replay-corpus claims."
      },
      {
        boundary: "mirage_multimodal_rag_dataset_replay_integrity",
        appliesWhen: "Any report, badge, benchmark receipt, Watch alert, or public claim uses MiRAGE-style multimodal multihop QA dataset generation, RAG dataset generation, backend coverage, modality coverage, generated question sets, replay commands, or CI replay as agent benchmark proof.",
        publicDisclosure: "A MiRAGE label, repository metadata, README feature list, local run output, copied generated QA pair, output JSON, visualization artifact, or aggregate dataset quality score alone does not establish replayable multimodal RAG dataset-generation quality without source, corpus, pipeline, backend, output, replay, score-delta, metric-coverage, and signed-evidence proof.",
        requiredEvidence: "Signed source reference hash, repository snapshot hash, license reference hash, input-document manifest hash, semantic chunk manifest hash, multihop context graph hash, domain/expert role manifest hash, generate-select-verify-correct trace hash, multimodal carrier manifest hash, backend config hash, embedding config hash, reranker config hash, token-usage trace hash, checkpoint/resume hash, deduplication report hash, evaluation report hash, replay command hash, output dataset hash, visualization artifact hash, dataset id, backend ids, modality ids, pipeline stage ids, question count and threshold, deterministic seed, baseline and candidate quality, score delta and regression threshold, replay pass rate and threshold, metric coverage and threshold, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.13-r128 should be regenerated or relabeled before using ChandanKSahu/MiRAGE-style, multimodal multihop QA generation, RAG dataset generation, backend coverage, modality coverage, generated-question-set, replay-command, or RAG dataset CI replay claims."
      },
      {
        boundary: "gui_navigation_live_drift_integrity",
        appliesWhen: "Any report, badge, Watch receipt, or public claim uses OSUniverse-style desktop, browser, terminal, LibreOffice, multi-app, or multimodal GUI-navigation benchmark evidence as live capability proof.",
        publicDisclosure: "A GUI-agent repo label, aggregate benchmark score, task category, complexity level, local command log, README result, viewer screenshot, copied testcase, or single trajectory does not establish live GUI-navigation reliability without source, testcase, runtime, validator, result, viewer, trajectory, screenshot, and behavior-drift proof.",
        requiredEvidence: "Signed benchmark id, source reference hash, repository snapshot hash, license reference hash, paper reference hash, testcase id, task category, complexity level, testcase manifest hash, agent config hash, runner config hash, runtime and runtime-image proof when applicable, dependency lock hash, validator config hash, validation report hash, result artifact hash, viewer artifact hash, trajectory hash, screenshot trace hash, task success, automated-validation pass, validation error rate, step count, max steps, category/level/runtime-context distributions, thresholds, signed evidence refs, and row hashes.",
        migration: "Reports generated under 2026.06.13-r118 should be regenerated or relabeled before using OSUniverse-style, GUI-navigation, desktop-agent, browser/terminal/multi-app task, automated-validation, runtime, trajectory, screenshot, or step-limit live drift claims."
      }
    ],
    metricValidationGates: [
      {
        gate: "construct_validity",
        defaultThreshold: ">= 0.55",
        appliesWhen: "Every metric validation row.",
        proofField: "metricValidation.rows[].constructValidity",
        migration: "Regenerate reports so construct validity appears in the metric validation table."
      },
      {
        gate: "counterfactual_responsiveness",
        defaultThreshold: ">= 0.60 when supplied",
        appliesWhen: "Metrics with pre-registered counterfactual intervention checks.",
        proofField: "metricValidation.rows[].counterfactualResponsiveness",
        migration: "Attach counterfactual evidence refs and rerun diagnostics for high-stakes intervention-sensitive metrics."
      },
      {
        gate: "validation_facet_coverage",
        defaultThreshold: ">= 0.75 when supplied",
        appliesWhen: "Benchmark-backed metrics with declared capability facets.",
        proofField: "metricValidation.rows[].validationFacetCoverage",
        migration: "Attach validation facet evidence refs and rerun diagnostics for capability-specific benchmark metrics."
      },
      {
        gate: "confounder_control_coverage",
        defaultThreshold: ">= 0.75 when supplied",
        appliesWhen: "Benchmark-backed metrics with declared scaffold, tool, environment, or framework controls.",
        proofField: "metricValidation.rows[].confounderControlCoverage",
        migration: "Attach confounder-control evidence refs and rerun diagnostics before comparing framework-sensitive benchmark claims."
      },
      {
        gate: "target_outcome_alignment",
        defaultThreshold: ">= 0.75 when supplied",
        appliesWhen: "Metrics with declared target outcome checks beyond surface protocol, completion, or agreement success.",
        proofField: "metricValidation.rows[].targetOutcomeAlignment",
        migration: "Attach target-outcome evidence refs and rerun diagnostics before using proxy success as outcome proof."
      },
      {
        gate: "process_evidence_coverage",
        defaultThreshold: ">= 0.75 when supplied",
        appliesWhen: "Metrics that claim process quality, trajectory quality, or control preservation.",
        proofField: "metricValidation.rows[].processEvidenceCoverage",
        migration: "Attach process defect and control-preservation evidence refs before using final-outcome scores as process-quality proof."
      },
      {
        gate: "safety_utility_coverage",
        defaultThreshold: ">= 0.75 when supplied",
        appliesWhen: "Metrics that claim untrusted-tool deployment safety or safety/utility trade-off quality.",
        proofField: "metricValidation.rows[].safetyUtilityCoverage",
        migration: "Attach unsafe-tool, safe-control, final-action risk, and utility-preservation evidence refs before using tool-risk metrics as deployment proof."
      },
      {
        gate: "modality_transformation_coverage",
        defaultThreshold: ">= 0.75 when supplied",
        appliesWhen: "Metrics that transform a benchmark across modalities, such as text to voice or audio variants.",
        proofField: "metricValidation.rows[].modalityTransformationCoverage",
        migration: "Attach paired source/target modality, transform-configuration, speaker/noise, parity, and judge-validation evidence refs before using transformed benchmark metrics as external proof."
      },
      {
        gate: "lifecycle_observability_coverage",
        defaultThreshold: ">= 0.75 when supplied",
        appliesWhen: "Metrics that claim runtime evaluator, validation, tracing, lifecycle-state, or production-monitoring quality.",
        proofField: "metricValidation.rows[].lifecycleObservabilityCoverage",
        migration: "Attach input/output validation, evaluator, trace, state-transition, and monitoring evidence refs before using runtime lifecycle metrics as external proof."
      },
      {
        gate: "ranking_stability_coverage",
        defaultThreshold: ">= 0.75 when supplied",
        appliesWhen: "Metrics that claim robust checkpoint, model, or candidate ranking under noisy evaluations or OCR/data-quality-sensitive samples.",
        proofField: "metricValidation.rows[].rankingStabilityCoverage",
        migration: "Attach subsampling-confidence, tail-failure, data-quality, and OCR/readability evidence refs before using ranking metrics as external proof."
      },
      {
        gate: "tool_sandbox_coverage",
        defaultThreshold: ">= 0.75 when supplied",
        appliesWhen: "Metrics that claim validity in dynamic, interdependent, stateful tool sandboxes such as MCP environments.",
        proofField: "metricValidation.rows[].toolSandboxCoverage",
        migration: "Attach tool-registry, dependency-graph, seeded-state, API-failure, retrieval, verification, trajectory, and recovery evidence refs before using dynamic tool-sandbox metrics as external proof."
      },
      {
        gate: "continual_learning_coverage",
        defaultThreshold: ">= 0.75 when supplied",
        appliesWhen: "Metrics that claim lifelong or continual learning, retention, adaptation, forgetting-rate, or longitudinal improvement validity.",
        proofField: "metricValidation.rows[].continualLearningCoverage",
        migration: "Attach task-sequence, dataset-version, retention, adaptation, forgetting-rate, environment/config, controller-log, and longitudinal-run evidence refs before using lifelong-learning metrics as external proof."
      },
      {
        gate: "strategic_interaction_coverage",
        defaultThreshold: ">= 0.75 when supplied",
        appliesWhen: "Metrics that claim multi-agent strategic interaction, deception, cooperation, hidden-action, or game-theoretic benchmark validity.",
        proofField: "metricValidation.rows[].strategicInteractionCoverage",
        migration: "Attach player-roster, public-transcript, private-action, collision/rule, scoring/rating, silent-baseline, truncation/context, and pairwise-uncertainty evidence refs before using strategic multi-agent metrics as external proof."
      },
      {
        gate: "architecture_reality_coverage",
        defaultThreshold: ">= 1.00 when required",
        appliesWhen: "Metrics that claim to distinguish wrapper, orchestrated, and autonomous agent architectures or compare planning, memory, recovery, stress, network, cost, or ensemble behavior.",
        proofField: "metricValidation.rows[].architectureRealityCoverage",
        migration: "Set requireArchitectureRealityProof and attach signed wrapper, marketing, real-agent, planning, memory, recovery, stress, network, cost, ensemble, and statistical-confidence evidence refs before using architecture-reality metrics as external proof."
      },
      {
        gate: "rag_pipeline_coverage",
        defaultThreshold: ">= 0.75 when supplied",
        appliesWhen: "Metrics that claim RAG retrieval, generation, evaluation, tracing, optimization, vector-search, custom-domain, or domain-specific legal RAG benchmark validity.",
        proofField: "metricValidation.rows[].ragPipelineCoverage",
        migration: "Attach document-set, test-set, domain/jurisdiction/language/task coverage, corpus/chunking, index provenance, solution roster/config, retriever/reranker/model/judge configs, selected metric, query-level result, metric-computation trace, logged-sample, retrieval/generation, evaluator, report/export, and performance/cost evidence refs before using RAG metrics as external proof."
      },
      {
        gate: "rag_evaluation_pipeline_coverage",
        defaultThreshold: ">= 1.00 when required",
        appliesWhen: "Metrics that explicitly claim to evaluate a RAG pipeline against ground-truth question/answer data.",
        proofField: "metricValidation.rows[].ragEvaluationPipelineCoverage",
        migration: "Set requireRagEvaluationPipelineProof and attach signed ground-truth question/answer, pipeline config, document corpus, metric definition, query/retrieval/generation trace, evaluator config, evaluation report, metric owner, sample-size, and confidence-interval evidence refs before using RAG evaluation-pipeline metrics as external proof."
      },
      {
        gate: "mirage_rag_metric_coverage",
        defaultThreshold: ">= 1.00 when required",
        appliesWhen: "Metrics that claim MIRAGE-style, metric-intensive RAG validity across base, oracle, mixed, retriever, LLM, RAG robustness, and overall score composition.",
        proofField: "metricValidation.rows[].mirageRagMetricCoverage",
        migration: "Set requireMirageRagMetricProof and attach signed benchmark identity, dataset, QA-pair, context-pool, retrieval-pool, base/oracle/mixed protocol, retriever config, model config, LLM result, retriever result, MIRAGE metrics, score formula, metric owner, sample-size, and confidence-interval evidence refs before using MIRAGE-style RAG metric-validity claims as external proof."
      },
      {
        gate: "mirage_drug_repositioning_coverage",
        defaultThreshold: ">= 1.00 when required",
        appliesWhen: "Metrics that claim ARIASHA/MiRAGE-style drug-repositioning validity over drug-disease association datasets, biological feature integration, similarity matrices, hard-negative mining, classifier evaluation, score calculation, and case-study validation.",
        proofField: "metricValidation.rows[].mirageDrugRepositioningCoverage",
        migration: "Set requireMirageDrugRepositioningProof and attach signed benchmark identity, dataset release, train/test split, drug-disease mapping, drug and disease feature, similarity-matrix, negative-sampling, classifier, feature-selection, score-calculation, evaluation report, case-study validation, metric owner, sample-size, and confidence-interval evidence refs before using MiRAGE drug-repositioning metric-validity claims as external proof."
      },
      {
        gate: "legal_code_rag_metric_coverage",
        defaultThreshold: ">= 1.00 when required",
        appliesWhen: "Metrics that claim HamzaG737/legal-code-rag-style legal-domain RAG validity over French legal-code corpora, Legifrance source boundaries, vector retrieval, windowing, hybrid-search, query-rewrite, routing, and evaluation datasets.",
        proofField: "metricValidation.rows[].legalCodeRagCoverage",
        migration: "Set requireLegalCodeRagProof and attach signed legal corpus, Legifrance source-boundary, retriever, vector database, embedding model, windowing, hybrid-search, query-rewrite, routing, evaluation dataset, reference answer, metric definition, evaluator, evaluation report, metric owner, sample-size, and confidence-interval evidence refs before using Legal Code RAG metric-validity claims as external proof."
      },
      {
        gate: "business_workflow_coverage",
        defaultThreshold: ">= 0.75 when supplied",
        appliesWhen: "Metrics that claim business workflow automation, cross-application orchestration, or realistic SaaS workflow benchmark validity.",
        proofField: "metricValidation.rows[].businessWorkflowCoverage",
        migration: "Attach domain/task coverage, simple-baseline, public/private score caveat, toolset/config, programmatic assertion, partial-credit/pass-rate, export, and multi-run comparison evidence refs before using workflow automation metrics as external proof."
      },
      {
        gate: "data_agent_analytical_coverage",
        defaultThreshold: ">= 0.75 when supplied",
        appliesWhen: "Metrics that claim data-agent analytical-query benchmark validity over heterogeneous structured, cloud, and unstructured data sources.",
        proofField: "metricValidation.rows[].dataAgentAnalyticalCoverage",
        migration: "Attach task-type, database/source-modality, difficulty, metric-computation, agent-workflow, expert-validation, cost-latency, and submission-schema evidence refs before using data-agent benchmark metrics as external proof."
      },
      {
        gate: "embodied_agent_coverage",
        defaultThreshold: ">= 1.00 when supplied",
        appliesWhen: "Metrics that claim embodied-agent simulator benchmark validity over task types, scenes, baselines, trajectories, and per-task metrics.",
        proofField: "metricValidation.rows[].embodiedAgentCoverage",
        migration: "Attach task-type coverage, simulator environment config, scene or dataset package, random/human/model baselines, action-observation trajectory, result folder, overall and task-type metric reports, metric owner, sample-size, and confidence-interval evidence refs before using embodied-agent benchmark metrics as external proof."
      },
      {
        gate: "evaluator_suite_coverage",
        defaultThreshold: ">= 1.00 when required",
        appliesWhen: "Metrics that claim evaluator-suite validity or use deterministic assertions, LLM judges, safety/red-team checks, dataset evals, custom judges, reporter outputs, framework integrations, thresholds, owners, or confidence intervals as external proof.",
        proofField: "metricValidation.rows[].evaluatorSuiteCoverage",
        migration: "Set requireEvaluatorSuiteProof and attach deterministic assertion, LLM judge, safety assertion, red-team attack, dataset eval manifest, custom judge, reporter output, framework integration, threshold config, metric owner, sample-size, and confidence-interval evidence refs before using evaluator-suite metric-validity claims as external proof."
      },
      {
        gate: "pentest_benchmark_coverage",
        defaultThreshold: ">= 1.00 when required",
        appliesWhen: "Metrics that claim pentesting-agent or threat-model benchmark validity over vulnerable apps, multi-step exploit chains, flags, ground truth, false-positive traps, security controls, execution traces, structured threat-model reports, or curated pentest benchmark indexes.",
        proofField: "metricValidation.rows[].pentestBenchmarkCoverage",
        migration: "Set requirePentestBenchmarkProof and attach Dockerized app manifest, language-stack coverage, vulnerability-class coverage, difficulty distribution, multi-step chain, flag ground truth, threat-model ground truth, false-positive trap, security-control, exploit trace, threat-model report, metric owner, sample-size, and confidence-interval evidence refs before using pentest, threat-model, or curated pentest-index metric-validity claims as external proof. Curated indexes are discovery metadata only until each underlying benchmark supplies these receipts."
      },
      {
        gate: "trace_evaluation_coverage",
        defaultThreshold: ">= 1.00 when required",
        appliesWhen: "Metrics that claim trace-derived agent-evaluation validity over Bedrock Converse-style model configs, agent parameters, tools, traces, repeatable cases, dynamic validators, bulk runs, model/parameter permutations, mocked LLM controls, metric definitions, measurement exports, production monitor bindings, or threshold alarms.",
        proofField: "metricValidation.rows[].traceEvaluationCoverage",
        migration: "Set requireTraceEvaluationProof and attach model config, agent-parameter manifest, tool registry, trace manifest, repeatable case manifest, dynamic validator, bulk run, permutation, mock backend, metric-definition, measurement-export, production-monitor, threshold-alarm, metric-owner, sample-size, and confidence-interval evidence refs before using trace-evaluation metric-validity claims as external proof."
      },
      {
        gate: "living_environment_coverage",
        defaultThreshold: ">= 1.00 when required",
        appliesWhen: "Metrics that claim stateful multi-turn, living-environment, mutable-workflow, proactive-agent, or Terrarium-style benchmark validity.",
        proofField: "metricValidation.rows[].livingEnvironmentCoverage",
        migration: "Set requireLivingEnvironmentProof and attach task-program, living-environment, environment-mutation, capability, sandbox-provider, agent-adapter, multi-turn trajectory, stage-checker, checker-result, trial-result, aggregate-metric, pass-at-k, proactive-trigger, metric-owner, sample-size, and confidence-interval evidence refs before using living-environment metric-validity claims as external proof."
      },
      {
        gate: "persona_agent_coverage",
        defaultThreshold: ">= 1.00 when required",
        appliesWhen: "Metrics that claim PersonaGym-style persona-agent validity over persona inventories, static environments, benchmark question sets, persona-agent configs, model/provider configs, response traces, rubrics, PersonaScore-style metrics, human-alignment calibration, evaluation outputs, or benchmark result manifests.",
        proofField: "metricValidation.rows[].personaAgentCoverage",
        migration: "Set requirePersonaAgentProof and attach persona manifest, static environment manifest, benchmark question set, persona-agent config, model/provider config, response trace, rubric manifest, PersonaScore metric definition, human-alignment calibration, evaluation output, benchmark result, metric owner, sample-size, and confidence-interval evidence refs before using persona-agent metric-validity claims as external proof."
      },
      {
        gate: "scientific_literature_coverage",
        defaultThreshold: ">= 1.00 when required",
        appliesWhen: "Metrics that claim AutoResearchBench-style scientific literature discovery validity over deep-research tasks, wide-research tasks, released or obfuscated datasets, literature corpora, search backends, DeepXiv/web-search tools, inference runs, evaluation pipelines, deep-search accuracy, wide-search IoU, result reports, owners, or confidence intervals.",
        proofField: "metricValidation.rows[].scientificLiteratureCoverage",
        migration: "Set requireScientificLiteratureProof and attach benchmark, deep/wide task, dataset, obfuscation, corpus, search-backend, DeepXiv/web-search tool, agent config, inference-run, evaluation-pipeline, deep-search accuracy, wide-search IoU, result-report, metric-owner, sample-size, and confidence-interval evidence refs before using scientific literature discovery metric-validity claims as external proof."
      },
      {
        gate: "bioinformatics_agent_coverage",
        defaultThreshold: ">= 1.00 when required",
        appliesWhen: "Metrics that claim BioAgentBench-style bioinformatics agent validity over bioinformatics tasks, input datasets, truth/reference data, workflow reproduction, Docker or environment manifests, tool versions, agent harnesses, grader configs, result artifacts, perturbation suites, privacy boundaries, owners, or confidence intervals.",
        proofField: "metricValidation.rows[].bioinformaticsAgentCoverage",
        migration: "Set requireBioinformaticsAgentProof and attach benchmark, paper/source, bioinformatics-task, input-dataset, truth/reference, workflow-reproduction, Docker/environment, tool-version, agent-harness, grader-config, result-artifact, perturbation-suite, privacy-boundary, metric-owner, sample-size, and confidence-interval evidence refs before using bioinformatics agent metric-validity claims as external proof."
      },
      {
        gate: "network_troubleshooting_coverage",
        defaultThreshold: ">= 1.00 when required",
        appliesWhen: "Metrics that claim NIKA-style network troubleshooting validity over dynamic network scenarios, topology tiers, incident catalogs, fault injection, session traces, agent/tool interfaces, runtime environments, root-cause localization, batch summaries, owners, or confidence intervals.",
        proofField: "metricValidation.rows[].networkTroubleshootingCoverage",
        migration: "Set requireNetworkTroubleshootingProof and attach benchmark, paper/source, scenario, topology, incident, fault-injection, session-trace, agent-interface, MCP/tool, environment-runtime, metric, judge, batch-summary, root-cause, localization, traffic-workload, metric-owner, sample-size, and confidence-interval evidence refs before using network troubleshooting metric-validity claims as external proof."
      },
      {
        gate: "inference_optimization_coverage",
        defaultThreshold: ">= 1.00 when required",
        appliesWhen: "Metrics that claim InferenceBench-style open-ended inference optimization validity over scenario objectives, hardware budgets, server contracts, runtime backends, search spaces, baseline comparisons, quality/integrity gates, supervised relaunches, latency/throughput/tail metrics, exploration traces, owners, or confidence intervals.",
        proofField: "metricValidation.rows[].inferenceOptimizationCoverage",
        migration: "Set requireInferenceOptimizationProof and attach benchmark, paper/source, scenario-objective, hardware-budget, server-contract, runtime-backend, search-space, baseline-comparison, quality-gate, integrity-gate, supervised-relaunch, latency/throughput, tail-latency, exploration-trace, metric-owner, sample-size, and confidence-interval evidence refs before using inference optimization metric-validity claims as external proof."
      },
      {
        gate: "java_coding_agent_coverage",
        defaultThreshold: ">= 1.00 when required",
        appliesWhen: "Metrics that claim Agent Bench-style Java coding-agent validity over YAML benchmark definitions, Java tasks, isolated workspaces, CLI-agent configs, cascaded judges, Maven/JUnit/JaCoCo checks, result manifests, accuracy, pass@k, owners, or confidence intervals.",
        proofField: "metricValidation.rows[].javaCodingAgentCoverage",
        migration: "Set requireJavaCodingAgentProof and attach benchmark, source/license, Java task, YAML benchmark, workspace template, isolated sandbox, lifecycle trace, setup/post scripts, CLI-agent config, cascaded jury, judge-tier policy, Maven build, JUnit result, JaCoCo coverage, result JSON, accuracy/pass@k, metric-owner, sample-size, and confidence-interval evidence refs before using Java coding-agent metric-validity claims as external proof."
      },
      {
        gate: "web_eval_dataset_coverage",
        defaultThreshold: ">= 1.00 when required",
        appliesWhen: "Metrics that claim Tavily-style web evaluation dataset-generation validity over generated search queries, web search providers, retrieved documents, filtering, QA-pair generation, local or LangSmith export, freshness, source coverage, answer grounding, owners, or confidence intervals.",
        proofField: "metricValidation.rows[].webEvalDatasetCoverage",
        migration: "Set requireWebEvalDatasetProof and attach benchmark, source repository, subject, generated-query, search-provider, retrieved-document, document-filter, QA-generation, reference-answer, dataset-export, output-target, validation-report, freshness, provider-diversity, source-coverage, answer-grounding, metric-owner, sample-size, and confidence-interval evidence refs before using web eval dataset metric-validity claims as external proof."
      },
      {
        gate: "parallel_research_skill_coverage",
        defaultThreshold: ">= 1.00 when required",
        appliesWhen: "Metrics that claim Parallel/OpenClaw-style research-skill validity over source repository proof, license boundaries, skill/API manifests, search modes, deep-research tasks, grounded chat, extraction, citation provenance, source policy, batch execution, monitoring, security, dependency locks, benchmark-claim validation, owners, or confidence intervals.",
        proofField: "metricValidation.rows[].parallelResearchSkillCoverage",
        migration: "Set requireParallelResearchSkillProof and attach source repository, license-boundary, skill-manifest, API-surface, search-mode, deep-research task, chat-grounding, extract-content, citation-provenance, source-policy, batch-execution, monitoring, security-boundary, dependency-lock, benchmark-validation, metric-owner, sample-size, and confidence-interval evidence refs before using Parallel/OpenClaw research-skill metric-validity claims as external proof."
      },
      {
        gate: "resume_rag_evaluator_coverage",
        defaultThreshold: ">= 1.00 when required",
        appliesWhen: "Metrics that claim local Ollama resume parser/RAG evaluator validity over PDF/TXT resume uploads, parsing, job-description matching, RAG strategy, query expansion, retrieval config, FAISS/vector stores, Ollama models, embedding models, evaluation endpoints, candidate rating, batch mode, privacy boundaries, dependency locks, owners, or confidence intervals.",
        proofField: "metricValidation.rows[].resumeRagEvaluatorCoverage",
        migration: "Set requireResumeRagEvaluatorProof and attach source repository, license/no-license-boundary, resume upload, parser, job-description, RAG strategy, query-expansion, retrieval config, vector-store, Ollama model, embedding model, evaluation endpoint, candidate rating, batch evaluation, privacy boundary, dependency lock, metric-owner, sample-size, and confidence-interval evidence refs before using resume-RAG evaluator metric-validity claims as external proof."
      },
      {
        gate: "chipbenchmark_coverage",
        defaultThreshold: ">= 1.00 when required",
        appliesWhen: "Metrics that claim ChipBenchmark-style hardware benchmark validity over repository snapshots, no-license boundaries, benchmark manifests, hardware profiles, model families, precision modes, environment setup, runner/serving scripts, result datasets, synced frontend datasets, pricing datasets, throughput, latency, cost, regression thresholds, owners, or confidence intervals.",
        proofField: "metricValidation.rows[].chipBenchmarkCoverage",
        migration: "Set requireChipBenchmarkProof and attach source repository, no-license-boundary, benchmark manifest, hardware profile, model family, precision mode, environment setup, benchmark runner, serving backend, result dataset, synced frontend dataset, pricing dataset, throughput, latency, cost, regression threshold, metric-owner, sample-size, and confidence-interval evidence refs before using ChipBenchmark metric-validity claims as external proof."
      },
      {
        gate: "hermes_bench_metric_validity",
        defaultThreshold: ">= 1.00 when required, taskCount>=5, adapterCount>=2, backendTestCount>=8, frontendTestCount>=4, judgeAgreement>=0.80, and regressionPassRate>=0.90",
        appliesWhen: "Metrics that claim Hermes Bench-style local LLM/agent benchmark UI validity over source/license refs, default branch snapshots, README/build specs, backend runners, judge calibration, task registries, model/server configs, adapters, result schemas, frontend result-review surfaces, backend/frontend regressions, Docker runtimes, owners, or confidence intervals.",
        proofField: "metricValidation.rows[].hermesBenchCoverage",
        migration: "Set requireHermesBenchProof and attach source repository/license, default-branch snapshot, commit and tree, README blob, build spec, backend runner, judge calibration, task registry, model/server config, adapter coverage, result schema, frontend result-review, backend regression, frontend regression, Docker runtime, metric-owner, sample-size, and confidence-interval evidence refs before using Hermes Bench metric-validity claims as external proof."
      },
      {
        gate: "cooperbench_metric_validity",
        defaultThreshold: ">= 1.00 when required, taskCount>=30, featureCount>=100, agentAdapterCount>=3, testCount>=30, cooperationScore>=0.75, conflictResolutionRate>=0.75, and regressionPassRate>=0.90",
        appliesWhen: "Metrics that claim CooperBench-style cooperative coding-agent benchmark validity over source/no-license refs, release tags, default branch snapshots, README/changelog manifests, dataset/task manifests, feature-conflict manifests, runner/coop harnesses, eval backends, team harnesses, agent adapters, CI workflows, package locks, public reports, owners, or confidence intervals.",
        proofField: "metricValidation.rows[].cooperBenchCoverage",
        migration: "Set requireCooperBenchProof and attach source repository/no-license-boundary, release tag, default-branch snapshot, commit and tree, README/changelog, dataset/task manifest, feature-conflict manifest, runner/coop harness, eval backend, team harness, agent-adapter roster, CI workflow, package lock, public report, metric-owner, sample-size, and confidence-interval evidence refs before using CooperBench metric-validity claims as external proof."
      },
      {
        gate: "codercup_metric_validity",
        defaultThreshold: ">= 1.00 when required, phaseCount>=10, testPlanCount>=160, runnerCount>=4, scoreLedgerCount>=5, liveSurfaceCount>=3, interRaterAgreement>=0.80, testRetestReliability>=0.80, and regressionPassRate>=0.90",
        appliesWhen: "Metrics that claim TestSprite/CoderCup-style continuous public coding-agent benchmark validity over source/license/homepage refs, default branch snapshots, README/contributing manifests, CI workflows, package locks, task specs, test suites, runner contracts, score ledgers, live artifacts, methodology/reference pages, cost accounting, owners, or confidence intervals.",
        proofField: "metricValidation.rows[].coderCupCoverage",
        migration: "Set requireCoderCupProof and attach source repository/license/homepage, default-branch snapshot, commit and tree, README/contributing, CI workflow, package and lockfile, task spec, test-suite and suite indexes, runner contract, score ledger, live artifact, methodology/reference, cost-accounting, metric-owner, sample-size, reliability, regression, and confidence-interval evidence refs before using CoderCup metric-validity claims as external proof."
      },
      {
        gate: "agentic_graph_rag_metric_validity",
        defaultThreshold: ">= 1.00 when required, graphNodeCount>=1, evaluationMetricCount>=2, experimentCount>=1, retrievalGrounding>=0.75, and regressionPassRate>=0.90",
        appliesWhen: "Metrics that claim Agentic Graph RAG-style graph-RAG benchmark validity over source/no-license refs, default branch snapshots, README manifests, graph orchestrators, RAG pipelines, database/vector-store manifests, evaluation metrics, experiment trackers, UI question surfaces, dependency locks, owners, or confidence intervals.",
        proofField: "metricValidation.rows[].agenticGraphRagCoverage",
        migration: "Set requireAgenticGraphRagProof and attach source repository/no-license-boundary, default-branch snapshot, commit and tree, README, graph-orchestrator, RAG pipeline, database/vector-store, evaluation metric, experiment tracker, UI question, dependency lock, metric-owner, sample-size, and confidence-interval evidence refs before using Agentic Graph RAG metric-validity claims as external proof."
      },
      {
        gate: "agent_scenario_test_coverage",
        defaultThreshold: ">= 1.00 when required",
        appliesWhen: "Metrics that claim Agentest-style scenario-test validity over simulated users, scripted turns, tool-call mocks, trajectory assertions, LLM judge metrics, comparison runs, CI reporters, result artifacts, owners, or confidence intervals.",
        proofField: "metricValidation.rows[].agentScenarioTestCoverage",
        migration: "Set requireAgentScenarioTestProof and attach benchmark, source repository/license, agent endpoint, scenario, simulated-user persona, goal/knowledge, tool-mock, scripted-turn, trajectory-assertion, LLM-judge metric, comparison-run, CI-reporter, result-artifact, metric-owner, sample-size, and confidence-interval evidence refs before using scenario-test metric-validity claims as external proof."
      },
      {
        gate: "open_code_lab_coverage",
        defaultThreshold: ">= 1.00 when required",
        appliesWhen: "Metrics that claim OpenCode-lab-style reliability validity over source references, lab benchmark manifests, agent context, prompt variants, tool descriptions, AGENTS policy, repeated runs, fork agreement, model variance, ground-truth corrections, CI reporters, result artifacts, owners, or confidence intervals.",
        proofField: "metricValidation.rows[].openCodeLabCoverage",
        migration: "Set requireOpenCodeLabProof and attach source reference, lab benchmark, agent context, prompt variant, tool description, AGENTS policy, repeated-run, fork-agreement, model-variance, ground-truth correction, metric-definition, CI-reporter, result-artifact, metric-owner, sample-size, and confidence-interval evidence refs before using OpenCode-lab metric-validity claims as external proof."
      },
      {
        gate: "cc_plugin_eval_coverage",
        defaultThreshold: ">= 1.00 when required, triggerAccuracy>=0.85, falsePositiveRate<=0.10, and falseNegativeRate<=0.10",
        appliesWhen: "Metrics that claim cc-plugin-eval-style component-trigger reliability over source/license references, plugin manifests, component inventories, trigger phrases, generated scenarios, scenario type coverage, transcripts, programmatic detection, LLM judge calibration, conflicts, checkpoint/resume, cost estimates, CI reporters, result artifacts, owners, or confidence intervals.",
        proofField: "metricValidation.rows[].ccPluginEvalCoverage",
        migration: "Set requireCcPluginEvalProof and attach source repository/license, plugin manifest, component inventory, trigger phrase manifest, scenario-generation manifest, scenario-type coverage, transcript bundle, programmatic detection, LLM judge calibration, conflict report, checkpoint/resume state, cost estimate, CI reporter, result artifact, metric-owner, sample-size, and confidence-interval evidence refs before using cc-plugin-eval metric-validity claims as external proof."
      },
      {
        gate: "realign_simulation_coverage",
        defaultThreshold: ">= 1.00 when required, judgeAgreement>=0.85, and regressionPassRate>=0.90",
        appliesWhen: "Metrics that claim Realign-style simulation reliability over YAML configs, apps under test, datasets, scenarios, synthetic-user personas, evaluator registries, evaluator targets, simulation traces, repeated-run traces, judge calibration, statistical rigor, CI regression, experiment tracking, result artifacts, owners, or confidence intervals.",
        proofField: "metricValidation.rows[].realignSimulationCoverage",
        migration: "Set requireRealignSimulationProof and attach source repository/license, YAML config, app-under-test, dataset, scenario, synthetic-user persona, evaluator registry, evaluator target, simulation trace, repeated-run trace, judge calibration, statistical rigor, CI regression, experiment tracking, result artifact, metric-owner, sample-size, and confidence-interval evidence refs before using Realign-style metric-validity claims as external proof."
      },
      {
        gate: "academiclaw_coverage",
        defaultThreshold: ">= 1.00 when required, taskCount>=80, languageCount>=2, rubricCount>=80, traceCount>=80, metaEvalCount>=80, modelCount>=3, and regressionPassRate>=0.90",
        appliesWhen: "Metrics that claim GAIR-NLP/AcademiClaw-style academic-task validity over source/license refs, default-branch snapshots, README/CITATION manifests, task corpora, bilingual task coverage, workspace queries, Docker environments, rubrics, eval-task runners, OpenClaw results, conversation traces, meta-evals, model rosters, metric definitions, CI reporters, owners, or confidence intervals.",
        proofField: "metricValidation.rows[].academiClawCoverage",
        migration: "Set requireAcademiClawProof and attach source repository/license, default-branch snapshot, README/CITATION manifest, task corpus, bilingual language manifest, workspace query, Docker environment, evaluation rubric, eval-task runner, OpenClaw result, conversation trace, meta-eval, model roster, metric definition, CI reporter, metric-owner, sample-size, and confidence-interval evidence refs before using AcademiClaw metric-validity claims as external proof."
      },
      {
        gate: "rag_chunking_technique_coverage",
        defaultThreshold: ">= 1.00 when required, policyDocumentCount>=5, notebookCount>=3, chunkingStrategyCount>=2, evaluationQuestionCount>=5, metricCount>=2, and regressionPassRate>=0.90",
        appliesWhen: "Metrics that claim IBM/rag-chunking-techniques-style RAG chunking technique validity over source/license refs, default-branch snapshots, README manifests, policy corpora, simple RAG notebooks, smart chunking notebooks, RAG evaluation notebooks, chunking strategies, retrieval pipelines, embedding/vectorstore manifests, evaluation datasets, metric definitions, CI reporters, owners, or confidence intervals.",
        proofField: "metricValidation.rows[].ragChunkingTechniqueCoverage",
        migration: "Set requireRagChunkingTechniqueProof and attach source repository/license, default-branch snapshot, README manifest, policy corpus manifest, simple RAG notebook, smart chunking notebook, RAG evaluation notebook, chunking strategy, retrieval pipeline, embedding/vectorstore, evaluation dataset, metric definition, CI reporter, metric-owner, sample-size, and confidence-interval evidence refs before using RAG chunking technique metric-validity claims as external proof."
      },
      {
        gate: "kubernetes_operational_agent_coverage",
        defaultThreshold: ">= 1.00 when required, toolCategoryCount>=8, diagnosticCapabilityCount>=3, resourceMetricCount>=3, logAnalysisCount>=1, and regressionPassRate>=0.90",
        appliesWhen: "Metrics that claim hariohmprasath/k8s-ai-style Kubernetes operational-agent validity over source/license refs, default-branch snapshots, README manifests, release assets, build workflows, agent modules, MCP servers, Kubernetes tool inventories, diagnostic capabilities, resource-monitoring metrics, log-analysis metrics, CI reporters, owners, or confidence intervals.",
        proofField: "metricValidation.rows[].kubernetesOperationalAgentCoverage",
        migration: "Set requireKubernetesOperationalAgentProof and attach source repository/license, default-branch snapshot, README, release asset, build workflow, agent module, MCP server, Kubernetes tool inventory, diagnostic capability, resource monitoring, log analysis, metric definition, CI reporter, metric-owner, sample-size, and confidence-interval evidence refs before using Kubernetes operational-agent metric-validity claims as external proof."
      },
      {
        gate: "secure_vibe_bench_coverage",
        defaultThreshold: ">= 1.00 when required, agentAdapterCount>=5, scenarioCount>=50, testScriptCount>=50, and regressionPassRate>=0.90",
        appliesWhen: "Metrics that claim iCSawyer/SecureVibeBench-style secure-coding benchmark validity over source/license/homepage refs, default-branch snapshots, README/results manifests, datasets, format examples, evaluation runners, agent adapters, vulnerability scenarios, test scripts, parser utilities, patch-diff utilities, CI reporters, owners, or confidence intervals.",
        proofField: "metricValidation.rows[].secureVibeBenchCoverage",
        migration: "Set requireSecureVibeBenchProof and attach source repository/license/homepage, default-branch snapshot, README, results, dataset, format example, evaluation runner, agent adapter, vulnerability scenario, test script, parser utility, patch-diff utility, metric definition, CI reporter, metric-owner, sample-size, and confidence-interval evidence refs before using SecureVibeBench metric-validity claims as external proof."
      },
      {
        gate: "humanstudybench_coverage",
        defaultThreshold: ">= 1.00 when required, interRaterAgreement>=0.80, testRetestReliability>=0.80, and validationPassRate>=0.90",
        appliesWhen: "Metrics that claim HumanStudy-Bench-style participant-simulation validity over source/license refs, default branch snapshots, study configs, participant backgrounds, human and agent responses, evaluator registries, metric definitions, validators, scorers, standardizers, reliability reports, validation pipelines, CI reporters, result artifacts, owners, or confidence intervals.",
        proofField: "metricValidation.rows[].humanStudyBenchCoverage",
        migration: "Set requireHumanStudyBenchProof and attach source repository/license, default-branch snapshot and commit, study config, participant background, human response, agent response, evaluator registry, metric definition, response validator, scorer/standardizer, inter-rater report, test-retest report, validation pipeline, result artifact, CI reporter, metric-owner, sample-size, and confidence-interval evidence refs before using HumanStudy-Bench metric-validity claims as external proof."
      },
      {
        gate: "legacybench_coverage",
        defaultThreshold: ">= 1.00 when required, languageCount>=3, regressionPassRate>=0.90, and replayPassRate>=0.90",
        appliesWhen: "Metrics that claim Legacy-Bench-style legacy-software validity over source/license refs, default branch snapshots, README manifests, task corpora, legacy-language coverage, environments, harness runners, agent tasks, patch submissions, test oracles, evaluator registries, scoring metrics, CI reporters, result artifacts, replay commands, owners, or confidence intervals.",
        proofField: "metricValidation.rows[].legacyBenchCoverage",
        migration: "Set requireLegacyBenchProof and attach source repository/license, default-branch snapshot, commit and tree, README blob, task corpus tree, legacy-language manifest, environment/Docker manifest, harness runner, agent-task, patch-submission, test-oracle, evaluator registry, scoring metric, CI reporter, result artifact, replay command, metric-owner, sample-size, and confidence-interval evidence refs before using Legacy-Bench metric-validity claims as external proof."
      },
      {
        gate: "subtlememory_metric_validity",
        defaultThreshold: ">= 1.00 when required, personaCount>=10, benchInstanceCount>=1500, memoryVariantSetCount>=1000, relationTypeCount>=3, evaluationStageCount>=5, adapterCount>=6, judgeAgreement>=0.80, and validationPassRate>=0.90",
        appliesWhen: "Metrics that claim SubtleMemory-style relational-memory validity over source/license refs, default branch snapshots, arXiv versions, Hugging Face dataset releases, persona splits, bench-instance manifests, history-session manifests, relation taxonomies, construction pipelines, evaluation stages, adapter rosters, judge/evaluator configs, score summaries, diagnostic protocols, CI reporters, owners, or confidence intervals.",
        proofField: "metricValidation.rows[].subtleMemoryCoverage",
        migration: "Set requireSubtleMemoryProof and attach source repository/license, default-branch snapshot, commit and tree, arXiv version, Hugging Face dataset release, persona split, bench-instance manifest, history-session manifest, relation taxonomy, construction pipeline, staged evaluation protocol, adapter roster, judge/evaluator config, score summary, diagnostic protocol, CI validation, metric-owner, sample-size, and confidence-interval evidence refs before using SubtleMemory metric-validity claims as external proof."
      },
      {
        gate: "ragas_notebook_metric_validity",
        defaultThreshold: ">= 1.00 when required",
        appliesWhen: "Metrics that claim RAGAS notebook reliability over source/no-license-boundary refs, notebooks, dependency manifests, document corpora, chunking, testset generation, evolution mix, generated testsets, RAG chains, retrievers, vectorstores, model/embedding configs, answer-context traces, RAGAS metric suites/results, LangFuse score exports, visualizations, owners, or confidence intervals.",
        proofField: "metricValidation.rows[].ragasNotebookCoverage",
        migration: "Set requireRagasNotebookProof and attach source/no-license-boundary, notebook, dependency, document corpus, chunking, testset-generator, evolution-mix, generated-testset, RAG-chain, retriever/vectorstore, model/embedding, answer-context, RAGAS metric-suite/result, LangFuse export, visualization, metric-owner, sample-size, and confidence-interval evidence refs before using RAGAS notebook metric-validity claims as external proof."
      },
      {
        gate: "mobile_agent_coverage",
        defaultThreshold: ">= 1.00 when required",
        appliesWhen: "Metrics that claim MobileBench-style mobile-agent validity over mobile environments, app inventories, API catalogs, UI traces, task datasets, task-complexity groups, multi-app tasks, checkpoint metrics, reset policies, device-state fixtures, result reports, license boundaries, owners, or confidence intervals.",
        proofField: "metricValidation.rows[].mobileAgentCoverage",
        migration: "Set requireMobileAgentProof and attach benchmark, paper/source, mobile-environment, app-inventory, API-catalog, UI-trace, task-dataset, task-complexity, multi-app-task, checkpoint-rubric, checkpoint-result, reset-policy, device-state, result-report, license-boundary, metric-owner, sample-size, and confidence-interval evidence refs before using mobile-agent metric-validity claims as external proof."
      },
      {
        gate: "geospatial_provider_drift_evidence",
        defaultThreshold: "complete when supplied",
        appliesWhen: "Provider-drift canaries that claim GeoBenchX-style geospatial tool-calling, GIS workflow, spatial-analysis, solvable/unsolvable task, LLM-as-judge panel, or token-cost comparability.",
        proofField: "providerDrift.comparisons[].geospatialToolCallingMissingReasons",
        migration: "Attach benchmark id, task-set, dataset snapshot, tool registry, reference solutions, tool-call traces, judge panel/config, human calibration, result report, token-cost report, complexity groups, solvable/unsolvable counts, tool count, max-iteration count, signed evidence, and row hashes before using geospatial provider-drift claims as external proof."
      },
      {
        gate: "llm_rag_eval_suite_live_drift_evidence",
        defaultThreshold: "complete when supplied",
        appliesWhen: "Live-drift windows that claim LLM/RAG multi-metric semantic, bias, hallucination, or faithfulness evaluation comparability.",
        proofField: "liveDrift.liveDistribution.llmRagEvalSuiteEvidenceCoverage0to1",
        migration: "Attach eval-suite, run, candidate/reference, metric-suite, semantic/bias/hallucination metrics, judge config, report, signed evidence, and row hashes before using LLM/RAG live-drift claims as external proof."
      },
      {
        gate: "kite_rag_live_drift_evidence",
        defaultThreshold: "complete when supplied",
        appliesWhen: "Live-drift windows that claim KITE-style knowledge-intensive RAG benchmark grades, dataset-family comparability, RAG configuration comparability, or end-to-end corpus/query/rubric/judge proof.",
        proofField: "liveDrift.liveDistribution.kiteEvidenceCoverage0to1",
        migration: "Attach source, repository snapshot, license, corpus manifest, document set, query set, ground-truth answers, rubrics, RAG pipeline config, responses, results, judge config, dataset family, RAG configuration id, grading scale, question/document counts, grades, small-sample warning, signed evidence, and row hashes before using KITE-style live-drift claims as external proof."
      },
      {
        gate: "poker_eval_live_drift_evidence",
        defaultThreshold: "complete when supplied",
        appliesWhen: "Live-drift windows that claim PokerEval-style NLTH poker simulation, partial-information decision-making, BB/100, EV, all-in adjusted BB/100, VPIP, hand-count, table-context, or opponent-pool comparability.",
        proofField: "liveDrift.liveDistribution.pokerEvalEvidenceCoverage0to1",
        migration: "Attach source, repository snapshot, package, citation, simulation config, agent config, opponent pool, run manifest, hand-history manifest, metric report, game type, table size, blind structure, hand count, BB/100, all-in adjusted BB/100, EV, VPIP, signed evidence, and row hashes before using PokerEval-style live-drift claims as external proof."
      },
      {
        gate: "nomiracl_multilingual_rag_live_drift_evidence",
        defaultThreshold: "complete when supplied",
        appliesWhen: "Live-drift windows that claim NoMIRACL-style multilingual RAG relevance, relevant/non-relevant subset, answerability, abstention, hallucination, or error-rate comparability.",
        proofField: "liveDrift.liveDistribution.noMiraclEvidenceCoverage0to1",
        migration: "Attach source, repository snapshot, license, dataset, language manifest, qrels, passage pool, retrieval run, model route, generation trace, evaluation report, baseline/live result, alert policy, language/subset, subset judgment, relevance/abstention/hallucination/error metrics, signed evidence, and row hashes before using NoMIRACL live-drift claims as external proof."
      },
      {
        gate: "scaling_law_discovery_live_drift_evidence",
        defaultThreshold: "complete when supplied",
        appliesWhen: "Live-drift windows that claim SLDBench-style scaling-law discovery, formula discovery, or R2/NMSE/NMAE extrapolation comparability.",
        proofField: "liveDrift.liveDistribution.scalingLawDiscoveryEvidenceCoverage0to1",
        migration: "Attach benchmark, paper/source, eval-run, task, dataset, train/test split, source-experiment, task/evolution/evaluator config, model-route, program, checkpoint, result, formula, extrapolation, R2, NMSE, NMAE, signed evidence, and row hashes before using scaling-law discovery live-drift claims as external proof."
      },
      {
        gate: "scenario_simulation_replay_evidence",
        defaultThreshold: "complete when supplied",
        appliesWhen: "Replay-corpus rows that claim scenario simulation, human/LLM co-participation, action-level evaluation, web visualization, persistence, or checkpoint-resume comparability.",
        proofField: "replayBenchmark.manifest.rows[].scenarioSimulation",
        migration: "Attach benchmark, repository/source, scenario project, scene, role, participant policy, agent roster, LLM config, evaluator, action schema, task dataset, web UI, server, container, persistence, checkpoint, run, event log, action trace, evaluation report, visualization, replay command, deterministic seed, action-level metrics, signed evidence, and row hashes before using scenario-simulation replay claims as external proof."
      },
      {
        gate: "effect_autoagent_replay_evidence",
        defaultThreshold: "complete when supplied",
        appliesWhen: "Replay-corpus rows that claim effect-autoagent-style declarative agent blueprints, Effect-service execution, benchmark-runner output, task-fixture replay, Docker task environments, trajectory conversion, score deltas, or CI replay comparability.",
        proofField: "effectAutoAgentReplay.manifest.rows[]",
        migration: "Attach source, repository, MIT license, default branch, README, package manifest, lockfile, CI workflow, benchmark runner, harness spec, task spec, metrics, experiment log, agent blueprint, runner, run result, trajectory converter, container manager, task manifest, instruction, fixture test, Docker environment, replay command, fixed seed, baseline/candidate results, score delta, replay pass rate, CI receipt, signed evidence, and row hashes before using effect-autoagent-style replay claims as external proof."
      },
      {
        gate: "falcon_evaluate_provider_drift_evidence",
        defaultThreshold: "complete when supplied",
        appliesWhen: "Provider-drift rows that claim Falcon Evaluate-style provider/model drift comparability, metric-family coverage, provider-route integrity, canary-result evidence, or alert/waiver reliability.",
        proofField: "providerDriftEvalPack.rows[].falconEvaluate",
        migration: "Attach source, repository, MIT license, default branch, release tag, package manifest, lockfile, requirements, README, docs index, CI workflow, evaluation/context/fairness/reliability/security/ethics/results/plot/user-analytics modules, validation data schema, metric families, metric ids, metric count, provider route, baseline/candidate canary results, drift statistic, alert or waiver receipt, signed evidence, and row hashes before using Falcon Evaluate-style provider-drift claims as external proof."
      },
      {
        gate: "agent_defense_bench_provider_drift_evidence",
        defaultThreshold: "complete when supplied and security-defense drift under configured thresholds",
        appliesWhen: "Provider-drift rows that claim AgentDefense-Bench-style MCP security-defense comparability, infrastructure-layer defense coverage, prompt-injection blocking, jailbreak blocking, tool-poisoning blocking, benign-pass preservation, provider-route integrity, canary-result evidence, or alert/waiver reliability.",
        proofField: "providerDriftEvalPack.rows[].agentDefenseBench",
        migration: "Attach source, repository, Apache-2.0 license, default branch, README, CHECKSUMS, CITATION, requirements, MCP server manifest, attack-bank, academic/safety/cybersecurity benchmark-suite hashes, MCP-specific suite, defense server, defense policy, run config, provider route, baseline/candidate canary results, drift statistic, alert or waiver receipt, replay command, CI receipt, MCP server count, attack suite ids, defense coverage, prompt-injection block rate, jailbreak block rate, tool-poisoning block rate, benign pass rate, thresholds, signed evidence, and row hashes before using AgentDefense-Bench-style provider-drift claims as external proof."
      },
      {
        gate: "paper_read_skill_live_drift_evidence",
        defaultThreshold: "paperReadSkillEvidenceCoverage0to1=1.00 and generic live score/behavior drift under configured thresholds",
        appliesWhen: "Watch receipts that claim paper-read-skill-style paper-reading, research-paper analysis, routing, research synthesis, or live score/behavior drift comparability.",
        proofField: "paperReadSkillLiveDrift.paperReadSkillEvidenceCoverage0to1",
        migration: "Attach source, repository, no-license boundary, README, llms manifest, skills tree, paper-analysis and blog-reading skills, prompt catalogs, route policy, research task manifest, evaluation rubric, baseline distribution, live sample manifest, drift statistic, alert receipt, replay command, CI receipt, no-prompt-copy proof, route/task ids, paper corpus, prompt route, response, evaluator trace, signed evidence, and row hashes before using paper-read-skill-style live-drift claims as external proof."
      },
      {
        gate: "eval_ai_library_question_explainability_evidence",
        defaultThreshold: "evidenceCoverage0to1>=0.95, rejectedEvidenceReasonCoverage0to1>=0.90, repairHintCoverage0to1>=0.90, regressionPassRate0to1>=0.99, and scoreConfidence0to1>=0.80",
        appliesWhen: "Question-explainability rows that claim eval-ai-library-style RAG, agent, security, custom metric, accepted/rejected evidence, repair-hint, score-breakdown, or question-level score explanation comparability.",
        proofField: "questionExplainability.rows[].evalAiLibraryQuestionLens[]",
        migration: "Attach source, repository, Apache-2.0 license, default branch, HEAD commit, tree, README, LICENSE, NOTICE, pyproject, requirements, eval_lib tree, metric/agent/security/tracing/schema/dashboard module refs, eval-pack, dataset, question set, question trace, evaluator config, metric result, score breakdown, rejected-evidence ledger, repair hint, regression threshold, CI receipt, no-source-copy proof, signed evidence, and row hashes before using eval-ai-library-style question-explainability claims as external proof."
      },
      {
        gate: "open_model_rag_question_explainability_evidence",
        defaultThreshold: "evidenceCoverage0to1>=0.95, rejectedEvidenceReasonCoverage0to1>=0.90, repairHintCoverage0to1>=0.90, retrievalGroundingScore0to1>=0.90, answerRelevanceScore0to1>=0.90, regressionPassRate0to1>=0.99, and ragQueryCount>=minRagQueryCount",
        appliesWhen: "Question-explainability rows that claim Open Models, Java local inference, LangChain4j, Ollama, RAG pipeline, or RAG evaluation comparability.",
        proofField: "questionExplainability.rows[].openModelRagQuestionLens[]",
        migration: "Attach source, repository/default-branch snapshot, license or no-license boundary, README, Java source tree, build/dependency manifests, LangChain4j integration, Ollama runtime config, RAG pipeline, corpus, embedding config, retrieval trace, evaluation manifest, open model ids, question set/trace, evaluator config, metric result, score breakdown, rejected-evidence ledger, repair hint, regression threshold, CI receipt, no-source-copy proof, signed evidence, and row hashes before using Open Models RAG question-explainability claims as external proof."
      },
      {
        gate: "fore_public_methodology_versioning_evidence",
        defaultThreshold: "complete when supplied and methodology/changelog/deprecation/migration proof present",
        appliesWhen: "Public methodology, badge, report, or benchmark rows claiming fore-style evaluation-client methodology comparability, Fore Foresight client evidence, RAG/LLM metric client proof, or archived evaluation-client public methodology versioning.",
        proofField: "methodologyVersioning.receiptHash and forePublicMethodologyVersioning",
        migration: "Attach methodology id, version, hash, changelog, deprecation notice, migration guidance, source, repository snapshot, archived-state proof, Apache-2.0 license, default branch, HEAD commit, tree, README, LICENSE, pyproject, package version, fore and foresight trees, api_v1.yaml, client, schema, client_test, build-test-lint workflow, eval-pack, dataset, evaluator config, baseline/candidate results, regression threshold, CI receipt, no-source-copy proof, signed evidence, and row hashes before using fore-style public methodology versioning claims as external proof."
      },
      {
        gate: "heurekabench_scientific_replay_evidence",
        defaultThreshold: "complete when supplied and replayPassRate0to1>=0.99, evaluatorAgreement0to1>=0.90, scoreDelta within configured threshold, and dataset no-copy proof present",
        appliesWhen: "Replay-corpus rows that claim HeurekaBench/sc-HeurekaBench-style scientific co-scientist benchmark comparability, single-cell MCQ/open-ended question replay, Biomni or CellVoyager baseline comparison, or scientific agent research capability.",
        proofField: "replayBenchmark.manifest.rows[].heurekaBenchScientificReplay",
        migration: "Attach source, repository snapshot, no-root-license boundary, default branch, HEAD commit, tree, README, project/arXiv refs, benchmark JSONs, single-cell dataset manifest and checksum refs, dataset no-copy proof, benchmark validation tree, paper/PDF manifest, insight/question/answer manifests, extraction and evaluation scripts, G-Eval prompt refs, baseline runner refs, Biomni/CellVoyager adapter refs, result manifest, replay command, CI receipt, question/tool-use/domain coverage, deterministic seed, evaluator agreement, replay pass rate, score delta, thresholds, signed evidence, and row hashes before using HeurekaBench-style scientific replay claims as external proof."
      },
      {
        gate: "rag_contradiction_detector_replay_evidence",
        defaultThreshold: "complete when supplied and replayPassRate0to1>=0.99, macroF1 delta within configured threshold, retrieval metrics within configured threshold, quality-gate status present, and no PubMed/SciFact content-copy proof present",
        appliesWhen: "Replay-corpus rows that claim robhorvat/RAG_Contradiction_Detector-style biomedical RAG contradiction comparability, PubMed abstract triage, SciFact retrieval/verdict replay, heuristic or PyTorch verifier comparison, quality-gate enforcement, or Docker/k8s/Prometheus runtime evidence.",
        proofField: "replayBenchmark.manifest.rows[].ragContradictionDetectorReplay",
        migration: "Attach source, repository snapshot, no-root-license boundary, default branch, HEAD commit, tree, README, requirements, Makefile, CI workflow, app/source/evaluation trees, SciFact fixture manifest, eval reports, quality-gate report, heuristic and torch verifier refs, PubMed ingestion, retrieval and vector-store proof, Docker/k8s/Prometheus refs, replay command, deterministic seed, baseline/candidate results, retrieval and verdict metrics, thresholds, no-source-copy proof, no-PubMed-abstract-copy proof, signed evidence, and row hashes before using RAG_Contradiction_Detector-style replay claims as external proof."
      },
      {
        gate: "skillmatch_resume_live_drift_evidence",
        defaultThreshold: "skillMatchEvidenceCoverage0to1=1.00 and score, pass-rate, behavior, latency, cost, privacy, and resume-task context drift under configured thresholds",
        appliesWhen: "Watch receipts that claim SubashSK777/SkillMatch-AI_Resume_Analyzer-style resume analysis, PDF extraction, job matching, improvement suggestions, RAG resume context, or live resume-agent drift comparability.",
        proofField: "skillMatchResumeLiveDrift.skillMatchEvidenceCoverage0to1",
        migration: "Attach source, repository snapshot, no-license boundary, default branch, HEAD commit, tree, README, Dockerfile, frontend and old-version refs, analyzer and PDF extractor refs, provider-route proof, resume task taxonomy, RAG input corpus, baseline/live sample manifests, drift statistic, alert receipt, replay command, CI receipt, privacy boundary, no-source-copy proof, no-resume-copy proof, signed evidence, and row hashes before using SkillMatch-style live-drift claims as external proof."
      },
      {
        gate: "decibench_voice_live_drift_evidence",
        defaultThreshold: "decibenchEvidenceCoverage0to1=1.00 and score, pass-rate, behavior, latency, cost, privacy, voice-task, audio, transcript, evaluator, RAG, and provider context drift under configured thresholds",
        appliesWhen: "Watch receipts that claim unforkopensource-org/decibench-style voice AI testing, deterministic evaluation, semantic evaluation, RAG augmented evaluation, CLI/MCP voice-agent evaluation, audio/scenario evaluation, or voice-agent live drift comparability.",
        proofField: "decibenchVoiceLiveDrift.decibenchEvidenceCoverage0to1",
        migration: "Attach source, repository snapshot, license/GitHub NOASSERTION boundary, default branch, HEAD commit, tree, release, README, pyproject, CI, CLI, MCP, RAG, evaluator, audio, scenario, bridge, dashboard, docs, deterministic/semantic/RAG evaluation manifests, baseline/live sample manifests, drift statistic, alert receipt, replay command, CI receipt, privacy boundary, no-source-copy proof, no-transcript-copy proof, signed evidence, and row hashes before using Decibench-style voice live-drift claims as external proof."
      },
      {
        gate: "evidra_provider_drift_evidence",
        defaultThreshold: "Evidra evidence-chain proof complete when supplied, signed evidence refs present, and score, refusal, protocol-success, latency, cost, provider-route, canary-result, drift-statistic, and alert/waiver context under configured thresholds",
        appliesWhen: "Provider-drift reports, Watch alerts, CI/lifecycle gates, and eval packs that claim vitas/evidra-style DevOps MCP, prescribe/report protocol, signed evidence-chain, reliability scorecard, or provider/model canary drift comparability.",
        proofField: "providerDrift.comparisons[].evidraMissingReasons",
        migration: "Attach source, repository snapshot, Apache-2.0 license, default branch, HEAD commit, tree, release, README, go.mod, CI/release workflows, Dockerfile, CLI tree, MCP tree, API command, evidence signer/package, evlock, execcontract, export, MCP server package, proxy, lifecycle service, pipeline bridge, score compare, tests/docs/signal-validation refs, prescribe/report/record/validate/scorecard commands, prescribe/report protocol proof, provider route, canary result, baseline/live sample manifests, drift statistic, alert or waiver receipt, replay command, CI receipt, no-source-copy proof, signed evidence-chain proof, evidence refs, signed evidence refs, and row hashes before using Evidra-style provider-drift claims as external proof."
      },
      {
        gate: "ravig_bench_metric_validity_evidence",
        defaultThreshold: "ravigBenchCoverage=1.00, validationPassRate0to1>=0.90, evaluatorCount>=3, visualDesignCheckCount>=3, signed evidence refs present, and confidence interval usable",
        appliesWhen: "Metric-validation reports, Score API responses, CI/lifecycle gates, and eval packs that claim antgroup/ravig-bench-style retrieval-augmented visually-rich generation, multi-modal automated evaluation, or content/design/execution metric-validity proof.",
        proofField: "metricValidation.rows[].ravigBenchCoverage",
        migration: "Attach source/repository/license/default-branch, README/legal/dependency/config refs, content/design/execution/function-scoring refs, dataset/test-case/model-result refs, visually-rich generation taxonomy, RAG retrieval context, multi-modal evaluator ids, screenshot/run-script refs, metric names, CI reporter, validation pass rate, dataset case count, visual-design check count, evaluator count, owner, sample size, confidence interval, no-source-copy proof, evidence refs, signed evidence refs, report artifact hashes, and row hashes before using RAViG-Bench-style metric-validity claims as external proof."
      },
      {
        gate: "rail_score_live_drift_evidence",
        defaultThreshold: "evidenceCoverage=1.00 and score/guardrail/compliance/context drift under configured thresholds",
        appliesWhen: "Watch receipts that claim RAIL Score-style responsible-AI dimensions, guardrail pass rates, safe regeneration, prompt-injection blocking, agent tool-call evaluation, telemetry coverage, compliance pass rates, or live behavior-drift comparability.",
        proofField: "railScoreLiveDrift.liveDistribution.evidenceCoverage0to1",
        migration: "Attach source, repository, MIT license, GitHub release, PyPI package, README, pyproject, workflow, client, model, policy, session, middleware, telemetry, compliance, agent, integration, baseline/live result, drift statistic, alert receipt, dimension/mode/framework/provider context, signed evidence, and row hashes before using RAIL Score-style live-drift claims as external proof."
      },
      {
        gate: "garage_rag_grounding_live_drift_evidence",
        defaultThreshold: "evidenceCoverage=1.00, validationCoverage>=0.95, and grounding/citation/faithfulness/context drift under configured thresholds",
        appliesWhen: "Watch receipts that claim GaRAGe-style RAG grounding annotations, passage relevance, citation support, deflection accuracy, answer faithfulness, validation coverage, or RAG grounding live-drift comparability.",
        proofField: "garageLiveDrift.liveDistribution.evidenceCoverage0to1",
        migration: "Attach source, repository/license, README, benchmark dataset, AMC-owned dataset manifest, paper reference, grounding annotation schema, retrieval corpus snapshot, prompt/evaluator config, baseline/live result, drift statistic, alert receipt, question/source/complexity context, grounding/citation/faithfulness metrics, validation coverage, signed evidence, and row hashes before using GaRAGe-style live-drift claims as external proof."
      },
      {
        gate: "llm_prompting_tests_public_methodology_evidence",
        defaultThreshold: "complete when supplied",
        appliesWhen: "Public methodology, benchmark, or Watch rows that claim llm-prompting-tests-style prompt-suite, coding-agent prompt, agentic-model prompt, prompt taxonomy, self-check, no-external-assets, rubric, or regression comparability.",
        proofField: "methodologyVersioning.receiptHash and replayBenchmark.manifest.rows[].llmPromptingTestsPublicMethodology",
        migration: "Attach source, repository snapshot, no-license boundary, default branch, HEAD commit, tree, README, prompt catalog tree, prompt-file refs, prompt taxonomy, test manifest, task/risk taxonomy, expected-output rubric, self-check policy, no-external-assets policy, language boundary, model/provider pool, judge calibration, run config, deterministic seed, baseline/candidate results, regression thresholds, methodology changelog, deprecation notice, migration guidance, no-prompt-copy proof, signed evidence, and row hashes before using llm-prompting-tests-style public methodology claims as external proof."
      },
      {
        gate: "scorable_studio_drilldown_evidence",
        defaultThreshold: "complete when supplied",
        appliesWhen: "Question-explainability rows that claim Scorable SDK-style Studio drilldown, execution-log, OTEL trace, file-upload, evaluator/judge command, package-integrity, source-artifact preview, or empty/error-state evidence.",
        proofField: "questionExplainability.rows[].scorableStudioDrilldownLens[]",
        migration: "Attach source, repository, Apache-2.0 license, default branch, commit/tree, README, Python package/OpenAPI/client/execution-log/evaluator API hashes, CLI package/lock/evaluator/judge/execution-log/OTEL/file-upload hashes, TypeScript package/lock/source tree hashes, npm package refs and integrity strings, Studio route, source artifact links, trace/receipt/policy/source-artifact previews, empty/error-state hashes, preview/link counts, accepted/rejected evidence, repair hints, and row hashes before using Scorable SDK-style Studio drilldown claims as external proof."
      },
      {
        gate: "knowlytics_ai_replay_evidence",
        defaultThreshold: "complete when supplied",
        appliesWhen: "Replay-corpus rows that claim Knowlytics-AI-style MCQ generation, RAG-backed quiz generation, self-evaluation scoring, provider-family coverage, retrieval coverage, or targeted feedback comparability.",
        proofField: "replayBenchmark.manifest.rows[].agentBenchmarkReplay",
        migration: "Attach source, repository, no-license boundary, README, Streamlit app, MCQ generator, RAG generator, evaluator, requirements, AMC-owned synthetic corpus, quiz spec, MCQ fixture, answer key, student response, evaluator rubric, retrieval/generation/scoring traces, performance-feedback report, result manifest, replay command, CI receipt, task categories, provider families, question/answer-option thresholds, deterministic seed, no-raw-PDF-copy proof, secret-placeholder review proof, replay pass rate, retrieval coverage, evaluator-feedback coverage, signed evidence, and row hashes before using Knowlytics-AI-style replay claims as external proof."
      },
      {
        gate: "calibra_public_methodology_evidence",
        defaultThreshold: "complete when supplied",
        appliesWhen: "Public methodology or benchmark rows that claim Calibra-style coding-agent campaign matrices, task fixtures, model/provider rankings, skills, MCP servers, environment overlays, trial reports, analysis reports, comparison reports, or dashboard exports.",
        proofField: "methodologyVersioning.receiptHash and replayBenchmark.manifest.rows[].calibraPublicMethodology",
        migration: "Attach source, repository, MIT license, homepage/default-branch snapshot, README, pyproject, lockfile, package tree, docs tree, task fixture tree, test suite tree, campaign config, campaign matrix, agent instructions, model/provider matrix, skill/MCP/environment overlays, deterministic seed policy, budget policy, trial report schema, analysis report, comparison report, web dashboard/export proof, methodology changelog, deprecation notice, migration guidance, CI receipt, signed evidence, and row hashes before using Calibra-style public methodology claims as external proof."
      },
      {
        gate: "warehouse_native_llm_eval_replay_evidence",
        defaultThreshold: "complete when supplied",
        appliesWhen: "Replay-corpus rows that claim warehouse-native LLM evaluation, dbt evaluation, warehouse AI functions, LLM-as-judge criteria, baseline versioning, drift detection, or no-data-egress comparability.",
        proofField: "replayBenchmark.manifest.rows[].warehouseNativeLlmEval",
        migration: "Attach benchmark, repository/source, dbt project/package manifests, warehouse adapter, warehouse AI function manifest, model manifest, capture config, prompt/input/output schema, baseline dataset/version, criteria, judge model, sampling/threshold config, raw/evaluation/score/performance/drift/alert artifacts, compiled SQL, run result, no-egress policy, replay command, deterministic seed, metrics, signed evidence, and row hashes before using warehouse-native LLM eval replay claims as external proof."
      },
      {
        gate: "rag_eval_dataset_replay_evidence",
        defaultThreshold: "complete when supplied",
        appliesWhen: "Replay-corpus rows that claim sundi133/rag-eval-style document QA dataset generation, endpoint ranking, generated QA dataset, sample app endpoint, data-format, endpoint-mode, score-delta, replay-pass, or endpoint-response coverage.",
        proofField: "replayBenchmark.manifest.rows[].ragEvaluation.ragEvalDataset*",
        migration: "Attach source, repository, license, input-document, processor, prompt, generator, QA-dataset, endpoint config, endpoint response trace, ranking report, evaluation run, replay command, CI receipt, data formats, endpoint modes, question and endpoint counts, deterministic seed, score delta, replay pass, endpoint response coverage, thresholds, signed evidence, and row hashes before using rag-eval-style document QA replay claims as external proof."
      },
      {
        gate: "encourage_rag_replay_evidence",
        defaultThreshold: "complete when supplied",
        appliesWhen: "Replay-corpus rows that claim Encourage-style modular RAG replay, method/inference/template/vector-DB composition, metric-suite coverage, MLflow tracking, score-delta, replay-pass, or metric coverage.",
        proofField: "replayBenchmark.manifest.rows[].ragEvaluation.encourage*",
        migration: "Attach source, repository, license, package, dependency, RAG method, inference-runner, template, vector DB, dataset, query, reference answer, metric suite, MLflow run, result, replay command, CI receipt, method/backend/vector-DB/metric ids, document and question counts, deterministic seed, score delta, replay pass, metric coverage, thresholds, signed evidence, and row hashes before using Encourage-style modular RAG replay claims as external proof."
      },
      {
        gate: "clonemem_long_term_memory_replay_evidence",
        defaultThreshold: "complete when supplied",
        appliesWhen: "Replay-corpus rows that claim CloneMem-style non-conversational digital-trace long-term memory, AI-clone memory, bilingual QA, temporal/emotional/opinion tracking, or unanswerable memory-question comparability.",
        proofField: "replayBenchmark.manifest.rows[].longTermMemory.cloneMem*",
        migration: "Attach benchmark, repository/source, license, persona, digital-trace, question, ground-truth evidence, temporal split, bilingual config, evaluation config, baseline retriever, memory-system config, result, replay command, deterministic seed, trace-kind/category/language coverage, counts, metrics, thresholds, signed evidence, and row hashes before using CloneMem-style replay claims as external proof."
      },
      {
        gate: "researchharness_agent_replay_evidence",
        defaultThreshold: "complete when supplied",
        appliesWhen: "Replay-corpus rows that claim ResearchHarness-style tool-using agent harnesses, OpenAI-compatible serving, workspace-first execution, model-provider comparison, benchmark-adapter fairness, or personal-assistant runtime comparability.",
        proofField: "replayBenchmark.manifest.rows[].agentBenchmarkReplay.researchHarness*",
        migration: "Attach benchmark, repository/source, license, runtime contract, tool surface, native tool-call trace, OpenAI-compatible API, workspace boundary, trace manifest, benchmark adapter, baseline harness, meta-harness comparison, model-provider matrix, evaluation report, replay command, context-compaction policy, human-interaction policy, coverage counts, metrics, thresholds, signed evidence, and row hashes before using ResearchHarness-style replay claims as external proof."
      },
      {
        gate: "gto_wizard_poker_replay_evidence",
        defaultThreshold: "complete when supplied",
        appliesWhen: "Replay-corpus rows that claim GTO Wizard-style NLTH poker-agent benchmarking, API-key-scoped hand play, no-solver access boundaries, AIVAT-style evaluation, legal-action traces, hand-history replay, or leaderboard context.",
        proofField: "replayBenchmark.manifest.rows[].agentBenchmarkReplay.gtoWizard*",
        migration: "Attach benchmark, source/repository/license, API documentation, metric reference, eval-pack, fixture, agent-policy, API-key scope, no-solver-access policy, hand-history, action trace, result manifest, AIVAT metric report, replay command, CI receipt, agent-type coverage, deterministic seed, hand counts, AIVAT deltas, replay pass rate, legal-action rate, thresholds, signed evidence, and row hashes before using GTO Wizard-style poker replay claims as external proof."
      },
      {
        gate: "sap_agent_eval_tutorial_live_drift_evidence",
        defaultThreshold: "coverage=1.00 and drift under configured thresholds",
        appliesWhen: "Live-drift rows that claim SAP-samples/llm-agents-eval-tutorial-style objective, process, enterprise-context, notebook/dataset/log, metric/tooling, role-access, reliability, compliance, or dynamic-interaction evaluation evidence.",
        proofField: "liveDrift.rows[].sapAgentEval*",
        migration: "Attach tutorial id, source/repository/license, paper or tutorial reference, notebook, dataset, baseline log, live sample, metric/tooling configs, role-access/reliability/compliance policies, alert receipt, objective/process/enterprise taxonomy values, coverage metrics, baseline/live distributions, thresholds, signed evidence, and row hashes before using SAP-style agent-evaluation live drift claims as external proof."
      },
      {
        gate: "agent_eval_observability_live_drift_evidence",
        defaultThreshold: "coverage=1.00 and drift under configured thresholds",
        appliesWhen: "Live-drift rows that claim vladfeigin/llm-agents-evaluation-style agent-evaluation observability, RAG quality monitoring, prompt/model variant evaluation, OpenTelemetry, Application Insights, Event Hub, Fabric/Kusto, dashboard, or telemetry-backed drift evidence.",
        proofField: "liveDrift.rows[].agentEvalObservability*",
        migration: "Attach source/repository/license, agent config, eval dataset, prompt variant, model config, RAG index, metric config, baseline/live eval results, OpenTelemetry, Application Insights, Event Hub, Kusto policy, Fabric dashboard, alert receipt, metric-set and telemetry taxonomy values, coverage metrics, baseline/live distributions, thresholds, signed evidence, and row hashes before using agent-evaluation observability live-drift claims as external proof."
      },
      {
        gate: "hedrarag_artifact_eval_live_drift_evidence",
        defaultThreshold: "coverage=1.00, replay=1.00, and drift under configured thresholds",
        appliesWhen: "Live-drift rows that claim Leo9660/HedraRAG_AE-style heterogeneous RAG workflow, graph RAG, HyDE, multistep, FlashRAG/LangChain/HedraRAG baseline, FAISS-indexed artifact evaluation, runtime, latency, throughput, memory, replay, or resource evidence.",
        proofField: "liveDrift.rows[].hedraRag*",
        migration: "Attach artifact id, source/repository snapshot, declared-license or absent/unknown license-review proof, paper and artifact README refs, workflow/framework/runtime taxonomy values, dataset/corpus/index/dependency/environment/run-script/result/plot/baseline/live/alert/resource/GPU hashes, latency, throughput, memory, replay pass rate, evidence coverage, baseline/live distributions, thresholds, signed evidence, and row hashes before using HedraRAG artifact-eval live-drift claims as external proof."
      },
      {
        gate: "agent_eval_harness_live_drift_evidence",
        defaultThreshold: "traceCoverage=1.00, evidenceCoverage=1.00, and drift under configured thresholds",
        appliesWhen: "Live-drift rows that claim Siddharth-1001/agent-eval-harness-style local agent evaluation, structured traces, framework adapters, dashboard/CLI comparisons, tool-success, hallucination, latency, cost, or metric-context drift evidence.",
        proofField: "liveDrift.rows[].agentEvalHarness*",
        migration: "Attach run/source/repository/license proof, trace schema/collector/writer, adapter config, framework/trace-mode/metric-context taxonomy values, trace/dataset/task/tool manifests, hallucination/pricing/metrics configs, baseline/live run hashes, comparison report, dashboard snapshot, local-storage policy, alert policy, reproducibility command, tool-success, hallucination, latency, cost, coverage metrics, baseline/live distributions, thresholds, signed evidence, and row hashes before using agent-eval-harness live-drift claims as external proof."
      },
      {
        gate: "strands_benchmark_harness_live_drift_evidence",
        defaultThreshold: "trajectoryCoverage=1.00, evidenceCoverage=1.00, and drift under configured thresholds",
        appliesWhen: "Live-drift rows that claim strands-labs/benchmark-harnesses-style Strands benchmark harnesses, SWE-Bench-style coding tasks, Terminal-Bench-style terminal tasks, Docker/Harbor isolation, trajectory, patch, test-report, task-success, patch-apply, test-pass, latency, cost, or suite/runtime/task-family drift evidence.",
        proofField: "liveDrift.rows[].strandsBenchmarkHarness*",
        migration: "Attach source/repository/license, agent package, harness config, model route, prompt template, benchmark suite, runtime, task family, task manifest, dataset snapshot, Docker image, environment setup, tool policy, trajectory, patch artifact, test report, result and upload manifests, safety isolation, baseline/live run, alert policy, task-success, patch-apply, test-pass, latency, cost, coverage metrics, baseline/live distributions, thresholds, signed evidence, and row hashes before using Strands benchmark-harness live-drift claims as external proof."
      },
      {
        gate: "costnav_physical_navigation_replay_evidence",
        defaultThreshold: "complete when supplied",
        appliesWhen: "Replay-corpus rows that claim CostNav-style physical navigation, route graphs, simulator trajectories, economic-cost optimization, navigation-success, or embodied-agent benchmark replay comparability.",
        proofField: "replayBenchmark.manifest.rows[].agentBenchmarkReplay.costNav*",
        migration: "Attach benchmark, source/repository/license, benchmark spec, scenario manifest, route graph, economic-cost model, physical-agent config, simulator config, trajectory, result manifest, metrics report, replay command, CI receipt, route-type coverage, deterministic seed, scenario counts, economic-cost deltas, navigation success, replay pass rate, score delta, thresholds, signed evidence, and row hashes before using CostNav-style replay claims as external proof."
      },
      {
        gate: "terminalworld_replay_evidence",
        defaultThreshold: "complete when supplied",
        appliesWhen: "Replay-corpus rows that claim TerminalWorld-style public terminal recording provenance, synthesized tasks, Docker environment reproduction, state-based tests, verified subset, or AllPassing/Nop/Partial validation comparability.",
        proofField: "replayBenchmark.manifest.rows[].terminalWorld",
        migration: "Attach source/repository/paper/dataset/license, public recording and metadata manifests, privacy and quality filters, synthesized instruction, reference solution, task metadata, Docker image/environment proof, pre/post snapshots, state tests, AllPassing/Nop/Partial trials, agent run trace, result manifest, replay command, CI receipt, deterministic seed, verified-subset human verification when claimed, task/category/command/environment counts, trial metrics, state coverage, replay pass rate, score delta, thresholds, signed evidence, and row hashes before using TerminalWorld-style replay claims as external proof."
      },
      {
        gate: "agent_mont_monitoring_replay_evidence",
        defaultThreshold: "complete when supplied",
        appliesWhen: "Replay-corpus rows that claim Agent_Mont-style Agno, Crew AI, or custom agent monitoring, token/cost accounting, resource/carbon observability, logging, visualization, or monitored-agent replay comparability.",
        proofField: "replayBenchmark.manifest.rows[].agentBenchmarkReplay.agentMont*",
        migration: "Attach benchmark, repository/source, license, monitoring config, framework, agent config, task manifest, run trace, token usage, cost rate card, latency/resource/carbon evidence, log and visualization artifacts, metrics report, replay command, coverage counts, thresholds, signed evidence, and row hashes before using Agent_Mont-style replay claims as external proof."
      },
      {
        gate: "spent_session_cost_replay_evidence",
        defaultThreshold: "complete when supplied",
        appliesWhen: "Replay-corpus rows that claim spent-style Claude Code session-cost tracking, efficiency scoring, productive/wasted classification, local JSONL logs, dashboard exports, JSON export, no-telemetry, replay pass-rate, classification coverage, or cost/efficiency deltas.",
        proofField: "replayBenchmark.manifest.rows[].agentBenchmarkReplay.spentSessionCost*",
        migration: "Attach benchmark, source/repository/license, hook config, JSONL log manifest, pricing snapshot, classifier rules, command transcript, dashboard export, result manifest, replay command, CI receipt, privacy boundary, session/tool-event counts, deterministic seed, efficiency and cost deltas, replay pass-rate, classification coverage, JSON export validity, no-telemetry proof, thresholds, signed evidence, and row hashes before using spent-style session-cost replay claims as external proof."
      },
      {
        gate: "fire_fact_checking_replay_evidence",
        defaultThreshold: "complete when supplied",
        appliesWhen: "Replay-corpus rows that claim FIRE-style atomic-claim fact-checking, iterative retrieval and verification, dynamic retrieval depth, factuality, evidence recall, label agreement, or LLM/search cost-efficiency replay comparability.",
        proofField: "replayBenchmark.manifest.rows[].agentBenchmarkReplay.fire*",
        migration: "Attach benchmark, source/repository/paper, dataset manifest, atomic-claim manifest, retriever and verifier configs, decision policy, search-provider config, evidence/query/label traces, cost report, result manifest, replay command, CI receipt, atomic-claim and retrieval-step counts, max retrieval depth, deterministic seed, factuality and cost deltas, replay pass-rate, evidence recall, label agreement, dynamic retrieval boundary, search-provider boundary, thresholds, signed evidence, and row hashes before using FIRE-style fact-checking replay claims as external proof."
      },
      {
        gate: "nuclia_rag_triad_replay_evidence",
        defaultThreshold: "complete when supplied",
        appliesWhen: "Replay-corpus rows that claim Nuclia-style RAG evaluation, REMi, RAG triad, answer relevance, context relevance, groundedness, model-cache, Hugging Face gated-model access, replay pass-rate, or composite-score comparability.",
        proofField: "replayBenchmark.manifest.rows[].agentBenchmarkReplay.nucliaRagTriad*",
        migration: "Attach benchmark, source/repository/license, package version, model card, model-cache policy, Hugging Face auth boundary, evaluator config, dataset manifest, question-answer-context manifest, metric manifest, answer/context/groundedness traces, result manifest, replay command, CI receipt, query/context/metric counts, deterministic seed, RAG-triad metrics, replay pass-rate, model-access and no-raw-context-copy boundaries, thresholds, signed evidence, and row hashes before using Nuclia-style RAG-triad replay claims as external proof."
      },
      {
        gate: "navi_bench_web_agent_live_drift_evidence",
        defaultThreshold: ">= 1.00 when supplied",
        appliesWhen: "Watch receipts that claim Navi-Bench-style real-website web-agent task success, crash-adjusted score bounds, browser-provider behavior, saved trajectory, per-task visualization, step limits, or website-domain drift.",
        proofField: "liveDrift.liveDistribution.naviBenchEvidenceCoverage0to1",
        migration: "Attach benchmark, source/repository/license, Hugging Face dataset, blog/reference when cited, task id, website domain, task config, evaluator config, agent config, browser mode/provider, baseline/live results, saved trajectory, visualization, screenshot trace, alert receipt, task finished/crashed/success flags, lower/excluding-crashed/upper score bounds, step limits, baseline/live distributions, thresholds, signed evidence, and row hashes before using Navi-Bench-style web-agent live-drift claims as external proof."
      },
      {
        gate: "agent_trial_statistical_question_explainability_evidence",
        defaultThreshold: "complete when supplied, trialCount>=minTrialCount, passRate>=minPassRate, wilsonLower>=minWilsonLower, cost/latency within thresholds, and regressionPValue>=minRegressionPValue",
        appliesWhen: "Question explainability rows that claim AgentTrial-style statistical agent evaluation, repeated trials, Wilson confidence intervals, bootstrap cost/latency, failure attribution, regression detection, CI comparison, or Agent Reliability Score evidence.",
        proofField: "questionExplainability.rows[].statisticalAgentTrialLens[]",
        migration: "Attach source/repository/package proof, suite/case/run/trial manifests, statistical report, trajectory bundle, failure-attribution proof, baseline/candidate result hashes, CI run/config, dashboard snapshot when claimed, trial/pass counts, Wilson interval, bootstrap cost/latency, reliability score, failure-attribution p-value, non-regression p-value, accepted/rejected evidence, repair hint, signed evidence, and row hashes before using AgentTrial-style statistical question-explainability claims as external proof."
      },
      {
        gate: "codequest_quality_question_explainability_evidence",
        defaultThreshold: "complete when supplied, overallScoreDelta>=minOverallScoreDelta, dimensionRegressionCount<=maxDimensionRegressionCount, evaluatorFeedbackCoverage>=minEvaluatorFeedbackCoverage, optimizerGroundingCoverage>=minOptimizerGroundingCoverage, dimensionCount>=minDimensionCount, and all dimension deltas meet their thresholds",
        appliesWhen: "Question explainability rows that claim CodeQuest-style code-quality evaluator/optimizer loops, actor-critic improvement, dimension feedback, before/after quality scores, optimizer grounding, or repair-patch evidence.",
        proofField: "questionExplainability.rows[].codeQuestQualityLens[]",
        migration: "Attach source/repository/license/status proof, code artifact, evaluator prompt/config, optimizer prompt/config, baseline/candidate evaluations, evaluator feedback, optimizer grounding, improvement patch, actor-critic loop trace, regression suite, replay command, CI run/config, no-source-copy boundary, dimension score deltas, accepted/rejected evidence, repair hint, signed evidence, and row hashes before using CodeQuest-style quality question-explainability claims as external proof."
      },
      {
        gate: "agentkernelarena_gpu_kernel_replay_evidence",
        defaultThreshold: "complete when supplied, compilationSuccessRate>=minCompilationSuccessRate, correctnessPassRate>=minCorrectnessPassRate, speedupDelta>=-maxSpeedupRegression, replayPassRate>=minReplayPassRate, resultCoverage>=minResultCoverage, workspaceIsolated=true, and noLeaderboardOnlyBoundary=true",
        appliesWhen: "Replay-corpus rows that claim AgentKernelArena-style GPU-kernel optimization, HIP, Triton, Torch2HIP, workspace-isolated agent benchmarking, compile/correctness/performance scoring, speedup, or A/B agent comparison evidence.",
        proofField: "replayBenchmark.manifest.rows[].agentBenchmarkReplay.agentKernelArena*",
        migration: "Attach source/repository/license proof, task manifest and config, agent roster/config, prompt template, workspace isolation, environment/GPU/dependency manifests, compile/correctness/performance command hashes, baseline/candidate kernel hashes, compile/correctness/performance results, score report, run log, replay command, CI receipt, comparison report, task and agent-type coverage, deterministic seed, compile/correctness/speedup/replay/result-coverage thresholds, workspace isolation, no-leaderboard-only proof, signed evidence, and row hashes before using AgentKernelArena-style GPU-kernel replay claims as external proof."
      },
      {
        gate: "llm_evaluation_system_jury_replay_evidence",
        defaultThreshold: "complete when supplied, juryScoreDelta>=-maxJuryScoreRegression, binaryScoringCoverage>=minBinaryScoringCoverage, judgeAgreement>=minJudgeAgreement, replayPassRate>=minReplayPassRate, reportCoverage>=minReportCoverage, agentTraceCoverage>=minAgentTraceCoverage, noSyntheticDataCopyBoundary=true, and noPdfReportOnlyBoundary=true",
        appliesWhen: "Replay-corpus rows that claim LLM Evaluation System-style agentic evaluation, MCP evaluation, multi-judge jury scoring, binary criteria, document-grounded synthetic QA, Bedrock/OpenTelemetry traces, PDF reports, S3 team-sharing, or jury-score comparability.",
        proofField: "replayBenchmark.manifest.rows[].agentBenchmarkReplay.llmEvaluationSystem*",
        migration: "Attach source/repository/license/package/MCP proof, dataset/synthetic-QA/document-grounding manifests, judge config, jury roster, criteria and binary scoring policies, execution and agent-trace manifests, OpenTelemetry and Bedrock boundary proof, result/analysis/PDF/S3 proof, replay command, CI receipt, no-config-only/no-report-only/no-copy boundaries, mode/judge-family/dataset/evaluation-case coverage, deterministic seed, jury-score delta, binary-scoring coverage, judge agreement, replay/report/trace thresholds, signed evidence, and row hashes before using LLM Evaluation System-style jury replay claims as external proof."
      },
      {
        gate: "innovatorbench_research_replay_evidence",
        defaultThreshold: "complete when supplied, finalScoreDelta>=-maxFinalScoreRegression, bestScoreDelta>=-maxBestScoreRegression, replayPassRate>=minReplayPassRate, resultCoverage>=minResultCoverage, checkpointRestoreCoverage>=minCheckpointRestoreCoverage, toolEvidenceCoverage>=minToolEvidenceCoverage, noLeaderboardOnlyBoundary=true, and noDatasetCopyBoundary=true",
        appliesWhen: "Replay-corpus rows that claim InnovatorBench-style LLM research-agent evaluation, ResearchGym workspaces, long-horizon research tasks, checkpointed runs, multi-GPU/node execution, or leaderboard-score comparability.",
        proofField: "replayBenchmark.manifest.rows[].agentBenchmarkReplay.innovatorBench*",
        migration: "Attach source/repository/license/paper/dataset proof, task manifests/configs, ResearchGym config, agent config, tool registry, workspace dataset-path policy, environment/Docker/multi-GPU/checkpoint proof, execution/result/metric/score reports, replay command, CI receipt, no-leaderboard/no-dataset-copy boundaries, research-domain/tool-surface/environment-mode/task/eval-time coverage, deterministic seed, final/best score deltas, replay/result/checkpoint/tool-evidence thresholds, signed evidence, and row hashes before using InnovatorBench-style research replay claims as external proof."
      },
      {
        gate: "edge_ai_agent_replay_evidence",
        defaultThreshold: "complete when supplied",
        appliesWhen: "Replay-corpus rows that claim edge/on-device multimodal-agent benchmark comparability across mobile, embedded, wearable, IoT, client runtime, inference-engine, optimization, dataset, task, application scenario, offline, privacy, latency, memory, energy, accuracy, replay pass-rate, or score-delta evidence.",
        proofField: "replayBenchmark.manifest.rows[].agentBenchmarkReplay.edgeAi*",
        migration: "Attach benchmark, source/repository/license, device profile, runtime manifest, optimization manifest, benchmark dataset, task manifest, application scenario, replay command, metrics report, device-class/modality/runtime-kind coverage, on-device/offline/privacy flags, latency, memory, energy, accuracy, replay pass-rate, score-delta thresholds, signed evidence, and row hashes before using edge AI agent replay claims as external proof."
      },
      {
        gate: "agent_workflow_kit_replay_evidence",
        defaultThreshold: "complete when supplied",
        appliesWhen: "Replay-corpus rows that claim Agent Workflow Kit-style evaluation-first workflow, risk-score, workflow-level, AGENTS-template, skill-package, spec-layer, external-approval, verification-command, docs-check, or workflow replay comparability.",
        proofField: "replayBenchmark.manifest.rows[].skillLifecycle.agentWorkflowKit*",
        migration: "Attach repository/source/license, guide, skill-package and template manifests, risk-scoring rubric, workflow-level policy, spec-layer policy, approval policy, verification-command manifest, docs-check workflow, evaluation manifest, replay command, recommended/applied levels, approval gates, deterministic seed, metrics, thresholds, signed evidence, and row hashes before using Agent Workflow Kit-style replay claims as external proof."
      },
      {
        gate: "medask_clinical_benchmark_replay_evidence",
        defaultThreshold: "complete when supplied",
        appliesWhen: "Replay-corpus rows that claim MedAsk-style SymptomCheck diagnostic accuracy, Triage urgency classification, OSCE-style symptom assessment, or clinical-vignette replay comparability.",
        proofField: "replayBenchmark.manifest.rows[].biomedicalAgentEvaluation.medAsk*",
        migration: "Attach repository/source/license, requirements, setup, SymptomCheck and Triage vignette manifests, evaluation scripts, patient simulator, doctor and triage model configs, result manifests, paired analysis, run and replay commands, deterministic seed, diagnostic and triage metrics, thresholds, signed evidence, and row hashes before using MedAsk-style replay claims as external proof."
      },
      {
        gate: "bio_kg_bench_replay_evidence",
        defaultThreshold: "complete when supplied",
        appliesWhen: "Replay-corpus rows that claim BioKGBench-style biomedical KG checking, KGQA, SCV, biomedical literature/database QA, error discovery, or knowledge-graph replay comparability.",
        proofField: "replayBenchmark.manifest.rows[].biomedicalAgentEvaluation.bioKgBench*",
        migration: "Attach source/repository/paper/license, dataset release, knowledge graph manifest, KG build config, task/KGCheck/KGQA/SCV manifests, agent/RAG/Neo4j configs, evaluation script, result manifest, error-discovery report, replay command, CI receipt, deterministic seed, task-kind coverage, dataset and task counts, KGCheck/KGQA/SCV metrics, error-discovery count, replay pass rate, score delta, thresholds, signed evidence, and row hashes before using BioKGBench-style replay claims as external proof."
      },
      {
        gate: "biomedarena_replay_evidence",
        defaultThreshold: "complete when supplied",
        appliesWhen: "Replay-corpus rows that claim BioMedArena-style biomedical harness comparability across benchmark families, tool modes, adapters, tools, vendors, baseline agents, replay runs, or sandboxed tool use.",
        proofField: "replayBenchmark.manifest.rows[].biomedicalAgentEvaluation.bioMedArena*",
        migration: "Attach source/repository/license, README, pyproject, config and matrix config, harness tree and CLI, benchmark config, eval suite, adapter registry, tool registry, vendor manifest, baseline agent, quick-run, release-gate, result, replay, CI, benchmark-family and tool-mode coverage, counts, baseline/candidate scores, score delta, replay pass rate, coverage thresholds, tool-sandbox proof, signed evidence, and row hashes before using BioMedArena-style replay claims as external proof."
      },
      {
        gate: "ollama_metrics_live_drift_evidence",
        defaultThreshold: "complete when supplied",
        appliesWhen: "Live-drift rows that claim Ollama metrics sidecar, local LLM proxy, Prometheus scrape, token/latency/memory, model-loaded, deployment-mode, or Grafana-dashboard comparability.",
        proofField: "liveDrift.rows[].ollamaMetrics*",
        migration: "Attach sidecar/source/repository/license, proxy, Ollama host, Prometheus scrape, metrics endpoint, baseline/live snapshot, alert policy, model, deployment, token, duration, time-per-token, loaded-model, RAM, error-rate, distribution, threshold, signed evidence, and row hashes before using Ollama metrics live-drift claims as external proof."
      },
      {
        gate: "recovery_bench_live_drift_evidence",
        defaultThreshold: ">= 1.00 when supplied",
        appliesWhen: "Watch receipts use Recovery-Bench-style failed-trajectory replay or corrupted-environment recovery evidence.",
        proofField: "liveDrift.liveDistribution.recoveryBenchEvidenceCoverage0to1",
        migration: "Attach source, license, trace, replay, corrupted environment, recovery agent/model/run, message-mode, transcript, result, score-report, signed-evidence, and row-hash proof before using Recovery-Bench live-drift claims externally."
      },
      {
        gate: "ai_reputation_claude_live_drift_evidence",
        defaultThreshold: ">= 1.00 when supplied, no PII leakage, hallucinated-citation increase within threshold, and platform/task/context drift within threshold",
        appliesWhen: "Watch receipts that claim AI Reputation Claude-style review analysis, sentiment scoring, competitor benchmarking, review-response quality, crisis readiness, PDF reputation reporting, hallucinated-citation, PII-leakage, policy-compliance, or brand-reputation monitoring comparability.",
        proofField: "liveDrift.liveDistribution.aiReputationEvidenceCoverage0to1",
        migration: "Attach source snapshot, no-license boundary, README, agent roster, skill catalog, install script, review-source manifest, sentiment pipeline, competitor benchmark, response policy, crisis playbook, report template, baseline/live result, drift statistic, alert receipt, platform/task/context distributions, brand-safety metrics, signed evidence, and row hashes before using AI Reputation Claude-style live-drift claims as external proof."
      },
      {
        gate: "llm_fighter_live_drift_evidence",
        defaultThreshold: ">= 1.00 when supplied, win-rate/game-score/action-validity/combat-stability drops within threshold, and arena/ruleset/model-roster/context drift within threshold",
        appliesWhen: "Watch receipts that claim LLM Fighter-style combat-game agent evaluation, game-result API, battle-log, YAML export, model-roster, win-rate, game-score, action-validity, combat-stability, trace/export coverage, or behavior-drift comparability.",
        proofField: "liveDrift.liveDistribution.llmFighterEvidenceCoverage0to1",
        migration: "Attach source snapshot, MIT license, homepage, README, API/UI trees, game-result endpoint, persistence schema, engine, runner, LLM adapter, YAML export, UI component, baseline/live result, drift statistic, alert receipt, arena/ruleset/model-roster context, combat logs, exported logs, game metrics, signed evidence, and row hashes before using LLM Fighter-style live-drift claims as external proof."
      },
      {
        gate: "darwin_godel_machine_live_drift_evidence",
        defaultThreshold: ">= 1.00 when supplied, candidate-score/score-movement/pass-rate/mutation-acceptance/regression-failure shifts within threshold, and generation/provider/model/benchmark/sandbox/context drift within threshold",
        appliesWhen: "Watch receipts that claim Darwin Godel Machine-style self-improving coding-agent evolution, sandboxed execution, benchmark pass-rate, live score movement, mutation acceptance, regression-failure, lineage, provider/model routing, or behavior-drift comparability.",
        proofField: "liveDrift.liveDistribution.darwinGodelMachineEvidenceCoverage0to1",
        migration: "Attach source snapshot, no-license boundary, README, security, CI, controller, archive, self-modification, evaluation, scorer, sandbox, live-run config, live-proof config, model matrix, benchmark manifest, score-movement manifest, verifiers, baseline/live result, drift statistic, alert receipt, lineage, provider/model route, score metrics, signed evidence, and row hashes before using Darwin Godel Machine-style live-drift claims as external proof."
      },
      {
        gate: "confidence_interval_width",
        defaultThreshold: "<= 40 score points",
        appliesWhen: "Every metric validation row.",
        proofField: "metricValidation.rows[].confidenceInterval",
        migration: "Increase sample size or mark the metric as not externally reliable."
      }
    ],
    externalSourceVerificationPolicy: {
      requiredForExternalClaims: true,
      acceptedStatuses: [
        "live_verified_primary_source",
        "primary_source_verified_with_retrieval_date",
        "source_unavailable_disclosed",
        "metadata_only_rejected"
      ],
      metadataOnlyBoundary: "Repository search metadata, cached snippets, local corpus fields, or stale source summaries can seed triage, but they cannot establish parity, external claims, benchmark compatibility, or methodology updates without live or primary-source verification.",
      unavailableSourceGuidance: "If a cited source is unavailable during review, mark the source as unavailable, preserve the attempted URL and retrieval date, avoid source-specific parity claims, and implement only source-independent controls that improve AMC's methodology or evidence boundary.",
      legalBoundary: "External source review may use high-level behavioral signals and public facts, but AMC must not copy third-party code, commands, prompts, datasets, examples, UI text/assets, README prose, screenshots, benchmark rows, configuration, or implementation details unless a separate license review explicitly allows it."
    },
    limitations: [
      "AMC scores observed evidence inside the configured window; they are not a guarantee of future behavior.",
      "Self-reported claims are capped and cannot independently establish high maturity.",
      "Domain or industry packs may add controls, but they do not replace the public core methodology.",
      "External benchmark comparisons require the compared run to disclose its own methodology and evidence window.",
      "External source-backed methodology changes require live or primary-source verification with retrieval date; repository search metadata, cached snippets, local corpus fields, unavailable sources, or stale summaries can only seed triage and must be disclosed instead of used as parity proof.",
      "Knowlytics-AI-style MCQ/RAG replay claims require source snapshot, no-license boundary, AMC-owned synthetic corpus, quiz fixture, answer key, student response, evaluator rubric, retrieval/generation/scoring traces, replay command, CI receipt, no-raw-PDF-copy proof, secret-placeholder review proof, signed evidence refs, and row hashes; a repository description, README claim, Streamlit screen, copied quiz, provider name, or source metadata alone is not enough.",
      "Calibra-style public methodology claims require source repository snapshot, MIT license proof, homepage/default-branch refs, README, pyproject, lockfile, package tree, task fixture tree, test suite tree, campaign config hash, campaign matrix hash, agent instructions hash, model/provider matrix, skill/MCP/environment overlays, deterministic seed policy, budget policy, trial report schema, analysis report, comparison report, web-dashboard/export proof, methodology version, changelog, deprecation notice, migration guidance, evidence refs, signed evidence refs, and row hashes; a Calibra label, repository metadata, README claim, dashboard screenshot, copied task, local run output, aggregate pass rate, model ranking, cost number, or source metadata alone is not enough.",
      "GaRAGe-style RAG grounding live-drift claims require source snapshot, license/README proof, benchmark dataset hash, AMC-owned dataset manifest, paper reference, grounding annotation schema, retrieval corpus snapshot, prompt/evaluator configs, baseline/live result, drift statistic, alert receipt, validation coverage, signed evidence refs, and row hashes; a GaRAGe label, source metadata, arXiv title, dataset filename, copied passage, copied dataset row, local RAG run, aggregate score, or model/provider label alone is not enough.",
      "llm-prompting-tests-style public methodology claims require source repository snapshot, no-license boundary, default branch refs, HEAD/tree refs, README, prompt catalog tree, prompt file blob refs, prompt taxonomy, test manifest, task/risk taxonomy, expected-output rubric, self-check policy, no-external-assets policy, language boundary, model/provider pool, judge calibration, run config, deterministic seed policy, baseline/candidate results, regression threshold policy, methodology version, changelog, deprecation notice, migration guidance, no-prompt-copy proof, evidence refs, signed evidence refs, and row hashes; an llm-prompting-tests label, repository metadata, README claim, prompt count, copied prompt, translated prompt, prompt filename, local chat transcript, aggregate pass rate, model label, or source metadata alone is not enough.",
      "paper-read-skill-style live-drift claims require source repository snapshot, no-license boundary, default branch refs, README, llms manifest, skills tree, paper-analysis and blog-reading skill hashes, prompt catalog hashes, benchmark/methodology/survey-opinion prompt refs, route policy, research-task manifest, evaluation rubric, baseline distribution, live sample manifest, drift statistic, alert receipt, replay command, CI receipt, no-prompt-copy proof, evidence refs, signed evidence refs, and row hashes; a paper-read-skill label, repository metadata, README claim, copied prompt text, prompt filename, local research transcript, aggregate paper-reading score, route name, model label, or source metadata alone is not enough.",
      "eval-ai-library-style question score explainability claims require source repository snapshot, Apache-2.0/default-branch proof, README/LICENSE/NOTICE/pyproject/requirements refs, eval_lib metric, agent-metric, security-metric, tracing, dashboard, schema, metric-pattern, and LLM-client refs, AMC-owned eval-pack and dataset hashes, question-set and question-trace hashes, evaluator config, metric result, score breakdown, accepted evidence refs, rejected-evidence ledger and reasons, repair hint, regression threshold, CI receipt, no-source-copy proof, signed evidence refs, and row hashes; an eval-ai-library label, repository metadata, README summary, metric name, local eval output, dashboard screenshot, aggregate score, provider label, or source metadata alone is not enough.",
      "Open Models RAG question-explainability claims require source repository snapshot, license or no-license boundary proof, default branch refs, HEAD/tree refs, README, Java source tree, build config, dependency manifest, LangChain4j integration, Ollama runtime config, RAG pipeline, corpus, embedding, retrieval trace, evaluation manifest, open model ids, evaluation metric ids, question-set and question-trace hashes, evaluator config, metric result, score breakdown, accepted evidence refs, rejected-evidence ledger and reasons, repair hint, regression threshold, CI receipt, no-source-copy proof, signed evidence refs, and row hashes; an Open Models label, repository metadata, README summary, JavaOne demo label, local curl output, endpoint list, model name, RAG pipeline name, local eval output, aggregate score, provider label, or source metadata alone is not enough.",
      "SkillMatch-style resume live-drift claims require source repository snapshot, no-license boundary, default branch refs, README, Dockerfile, frontend and old-version refs, analyzer and PDF extractor hashes, model/provider manifest, resume task taxonomy, RAG input corpus manifest, baseline/live sample manifests, drift statistic, alert receipt, replay command, CI receipt, privacy boundary, no-source-copy proof, no-resume-copy proof, signed evidence refs, and row hashes; a SkillMatch label, repository metadata, README summary, PDF upload demo, frontend screenshot, copied resume text, copied job description, dependency name, notebook filename, aggregate match score, model/provider label, or source metadata alone is not enough.",
      "Decibench-style voice live-drift claims require source repository snapshot, license and GitHub NOASSERTION boundary proof, default branch proof, release, README, pyproject, CI, CLI, MCP, RAG, evaluator, audio tree hash, scenario-suite, bridge, dashboard, docs, deterministic/semantic/RAG evaluation manifests, baseline/live sample manifests, drift statistic, alert receipt, replay command, CI receipt, privacy boundary, no-source-copy proof, no-transcript-copy proof, signed evidence refs, and row hashes; a Decibench label, repository metadata, README summary, homepage link, release tag, CLI name, MCP label, RAG label, evaluator filename, audio filename, scenario filename, dashboard screenshot, copied transcript, copied audio fixture, aggregate score, model/provider label, or source metadata alone is not enough.",
      "Architectural repair claims must disclose false-positive handling and net codebase impact separately from repair counts.",
      "Persona-policy realism claims require evidence of human-likeness, behavior coverage, and task-goal preservation; cooperative simulator success alone is insufficient.",
      "Live CTF or cybersecurity flag-solving claims require contamination, competition-impact, first-correct-flag forwarding, and per-agent independence evidence; static or score-only CTF results are not enough.",
      "Partial-credit CTF or VM-challenge claims require dataset DOI/version, VM image version or hash, checkpoint rubrics, execution traces, environment snapshots, judge/label evidence, and isolation context; binary solved/unsolved outcomes are not enough.",
      "Checkpoint or model-ranking claims require ranking-stability evidence; pointwise scores alone are not externally reliable when evaluation noise, tail failures, data quality, or OCR readability can change ordering.",
      "Continual or lifelong-learning claims require task-sequence, retention, adaptation, forgetting-rate, environment/config, controller-log, longitudinal-run, game-build/mod/config, memory, conversation log, run-summary JSON, gameplay log, decision trace, outcome metric, improvement trend, fallback-mode, sample-size, and confidence-interval evidence where applicable; point-in-time task success is not enough.",
      "OpenCode-lab-style metric-validity claims require source reference, lab benchmark manifest, agent context manifest, prompt-variant manifest, tool-description manifest, AGENTS policy manifest, repeated-run trace, fork-agreement report, model-variance report, ground-truth correction manifest, metric-definition manifest, CI reporter, result artifact, metric owner, sample-size, confidence-interval, signed evidence, and row-hash proof; repository metadata, a README recipe, a copied prompt, a shell transcript, a context dump, a single deterministic run, or an aggregate pass rate alone is not enough.",
      "cc-plugin-eval-style metric-validity claims require source repository and license refs, plugin manifest, component inventory, trigger phrase manifest, scenario generation manifest, scenario-type coverage, execution transcript bundle, programmatic detection report, LLM judge calibration, conflict detection report, checkpoint/resume state, cost estimate report, CI reporter, result artifact, trigger accuracy, false-positive rate, false-negative rate, metric owner, sample-size, confidence-interval, signed evidence, and row-hash proof; a plugin label, README workflow, component list, trigger phrase list, generated scenario, transcript snippet, judge score, cost estimate, checkpoint file, CI status, aggregate activation rate, or source metadata alone is not enough.",
      "Realign-style simulation metric-validity claims require source repository and license refs, YAML config manifest, app-under-test manifest, dataset manifest, scenario manifest, synthetic-user persona manifest, evaluator registry, evaluator target, simulation trace, repeated-run trace, LLM judge calibration, statistical rigor report, CI regression manifest, experiment tracking manifest, result artifact, judge agreement, regression pass rate, metric owner, sample-size, confidence-interval, signed evidence, and row-hash proof; a Realign label, README claim, copied config or scenario, local simulation output, evaluator name list, single judge score, ELO-style aggregate, CI status, experiment dashboard note, archived repository status, or source metadata alone is not enough.",
      "AcademiClaw-style academic-task metric-validity claims require source repository and license/no-assertion review refs, live default-branch snapshot, README and CITATION manifests, academic task corpus, bilingual task manifest, workspace query manifest, Docker environment manifest, evaluation rubric manifest, eval-task runner manifest, OpenClaw result manifest, conversation trace manifest, meta-eval manifest, model roster manifest, metric definition, CI regression, metric owner, sample-size, confidence-interval, signed evidence, and row-hash proof; an AcademiClaw label, homepage, repository metadata, README abstract, copied task prompt, copied rubric, local OpenClaw run, model roster, aggregate score, conversation-log excerpt, meta-eval file name, or source metadata alone is not enough.",
      "IBM/rag-chunking-techniques-style metric-validity claims require source repository and license refs, live default-branch snapshot, README manifest, policy corpus manifest, simple RAG notebook manifest, smart chunking notebook manifest, RAG evaluation notebook manifest, chunking strategy manifest, retrieval pipeline manifest, embedding/vectorstore manifest, evaluation dataset manifest, metric definition, CI regression, metric owner, sample-size, confidence-interval, signed evidence, and row-hash proof; a repository label, README sentence, notebook filename, copied policy text, local notebook run, chunking strategy name, vectorstore label, aggregate RAG score, chart, or source metadata alone is not enough.",
      "Kubernetes operational-agent metric-validity claims require source repository and license refs, live default-branch snapshot, README, release asset manifest, build workflow, agent module, MCP server module, Kubernetes tool inventory, diagnostic capability manifest, resource monitoring manifest, log-analysis manifest, metric definition, CI regression, metric owner, sample-size, confidence-interval, signed evidence refs, artifact hashes, and row hashes; a k8s-ai label, README summary, Kotlin language tag, JAR filename, tool class name, local cluster demo, aggregate operational score, or source metadata alone is not enough.",
      "SecureVibeBench-style secure-coding metric-validity claims require source repository, license, homepage or arXiv refs, live default-branch snapshot, README, results, dataset, format example, evaluation runner, agent adapter roster, vulnerability scenario manifest, test script manifest, parser utility, patch-diff utility, metric definition, CI regression, metric owner, sample-size, confidence-interval, signed evidence refs, artifact hashes, and row hashes; a SecureVibeBench label, repository metadata, README claim, ACL badge, arXiv link, dataset filename, runner filename, adapter name, test-script folder, aggregate score, language tag, or source metadata alone is not enough.",
      "Awesome-AI-Evaluation-Guide-style public methodology claims require source repository and license refs, live default-branch snapshot, README guide manifest, benchmark guide manifest, tools/platforms guide manifest, docs and example manifests, metric-selection taxonomy, threshold policy, calibration policy, component-trace policy, human-in-loop policy, cost-control policy, deprecation notice, migration guidance, signed evidence refs, and row hashes; a guide label, repository metadata, README heading, benchmark name, tool name, copied metric example, local guide run, topic tag, aggregate score, or source metadata alone is not enough.",
      "HumanStudy-Bench-style participant-simulation metric-validity claims require source repository and license refs, live default-branch snapshot, study config manifest, participant-background manifest, human-response manifest, agent-response manifest, evaluator registry, metric definitions, response validator, scorer and standardizer, inter-rater agreement, test-retest reliability, validation pipeline, result artifact, CI regression, metric owner, sample-size, confidence-interval, signed evidence, and row-hash proof; a HumanStudy-Bench label, homepage, repository metadata, README abstract, copied study config, copied participant or response row, local validation output, evaluator filename, aggregate score, or source metadata alone is not enough.",
      "Legacy-Bench-style legacy-software metric-validity claims require source repository and license refs, live default-branch snapshot, README manifest, task corpus manifest, legacy-language coverage, environment manifest, harness runner manifest, agent-task manifest, patch-submission manifest, test-oracle manifest, evaluator registry, scoring metric manifest, CI regression, result artifact, replay command, metric owner, sample-size, confidence-interval, signed evidence, and row-hash proof; a Legacy-Bench label, repository metadata, README claim, task directory name, copied task prompt, copied test script, local Docker output, solution script, aggregate pass rate, language list, CI badge, replay transcript, or source metadata alone is not enough.",
      "SubtleMemory-style relational-memory metric-validity claims require source repository and license refs, live default-branch snapshot, arXiv version, Hugging Face dataset release, persona split manifest, bench-instance manifest, history-session manifest, relation taxonomy, construction pipeline, staged evaluation protocol, adapter roster, judge/evaluator config, score summary, diagnostic protocol, CI validation, metric owner, sample-size, confidence-interval, signed evidence, artifact hashes, and row-hash proof; a SubtleMemory label, repository metadata, README abstract, arXiv abstract, Hugging Face dataset card, persona folder name, copied JSON row, local run, aggregate memory score, model/provider label, or source metadata alone is not enough.",
      "AI Reputation Claude-style live-drift claims require source repository snapshot, no-license-boundary proof, README blob, agent roster, skill catalog, install script, review-source manifest, sentiment pipeline, competitor benchmark, response policy, crisis playbook, report template, baseline/live results, drift statistic, alert receipt, reputation score, normalized sentiment score, response quality, crisis readiness, review coverage, hallucinated citation rate, PII leak rate, response-policy compliance, platform/task/context distributions, evidence refs, signed evidence refs, and row hashes; an AI Reputation Claude label, repository metadata, README feature list, agent or skill filename, local review sample, aggregate sentiment score, competitor table, generated response, crisis-playbook excerpt, PDF report, model/provider label, or source metadata alone is not enough.",
      "FishCodeTech CTF-agent benchmark live-drift claims require source snapshot, GPL license, README, challenge catalog, challenge manifest, Docker/runtime, platform compose, backend API, MCP tool, sidecar collector, agent template, scoring service, scoreboard, flag-submission log, baseline/live result, drift statistic, alert receipt, CTF solve, first-flag-forwarding, contamination, independence, partial-credit, trace, sandbox, evidence refs, signed evidence refs, and row hashes; a benchmark label, repository metadata, README claim, copied challenge source, copied exploit path, copied flag, local Docker output, scoreboard screenshot, aggregate solve rate, sidecar log excerpt, or source metadata alone is not enough.",
      "GAIA-agent replay claims require source repository and license refs, benchmark harness and workflow hashes, docs/results proof, source/test tree refs, task and dataset snapshots, fixed seed, provider/model/run configs, run output, score report, replay command, CI receipt, tool-surface coverage, replay pass rate, score delta, evaluator agreement, trace coverage, result coverage, signed evidence refs, and row hashes; a GAIA-agent label, repository metadata, README claim, local benchmark command, package manifest, tool list, aggregate score, model/provider label, or source metadata alone is not enough.",
      "PaperArena replay claims require source repository refs, a no-license-boundary receipt, README/requirements/config/runner/scorer proof, dataset-builder/tool/RAG/reflector/run-script tree refs, Hugging Face dataset snapshot proof, paper and QA manifests, result and score reports, replay command, CI/lifecycle receipt, tool-surface coverage, question/paper/tool/run-script counts, deterministic seed, max steps, replay pass rate, score delta, evaluator agreement, trace coverage, result coverage, signed evidence refs, and row hashes; a PaperArena label, GitHub metadata, README abstract, project page, arXiv link, Hugging Face dataset card, run script name, model name, aggregate accuracy, performance image, or source metadata alone is not enough.",
      "Hermes Turbo-style performance question-explainability claims require source repository and license refs, live default-branch commit/tree, README and package manifests, benchmark, perf-budget, and daily-score workflow hashes, turbo-score script, performance dashboard, benchmark report, baseline/candidate results, latency and throughput traces, score manifest, regression thresholds, CI config/run, performance facet, run count, p50/p95 latency, throughput, speedup, dashboard coverage, regression pass rate, accepted evidence, rejected-evidence reasons, repair hint, and row-hash evidence; a repository title, default branch, star count, README claim, local command, dashboard screenshot, aggregate speedup, CI badge, model/provider label, or source metadata alone is not enough.",
      "RSS market-impact alert methodology claims require methodology id/version/hash, changelog row, deprecation notice, migration guidance, source repository snapshot, no-license boundary, feed source, polling window, model provider route, prompt/schema policy, importance taxonomy, asset-class taxonomy, dedupe ledger, analysis ledger, push policy, rate-limit policy, alert threshold, evaluator/backtest report, outcome-window policy, cost and latency accounting, accepted evidence, rejected-evidence reasons, signed evidence refs, and row hashes; a repository title, README summary, copied config, copied RSS or tweet row, copied analysis row, provider name, local daemon run, alert screenshot, push notification, star count, or source metadata alone is not enough.",
      "Credence Engine-style live-drift claims require source repository, AGPL license, archive status, README/SPEC/package/lock/results artifact, experiment manifest, benchmark harness, test suite, posterior trace, value-of-information policy, expected-utility policy, baseline/live result, drift statistic, alert receipt, experiment-mode and decision-policy taxonomy, decision-quality, posterior-calibration, VOI-efficiency, expected-utility-gain, evidence coverage, context-distribution, signed evidence refs, and row hashes; a repository title, archive badge, README/SPEC summary, experiment filename, aggregate decision score, posterior chart, VOI label, expected-utility claim, model/provider label, or source metadata alone is not enough.",
      "Skill Forge-style autoresearch replay claims require source repository, MIT license, homepage, README, release notes, skill spec, agent-role manifest, orchestrator/mutator/scorer/hypothesis agents, composite scoring script, templates, example session, improvement-loop manifest, mutation and revert policies, skill manifest, baseline and with-skill agent configs, eval-suite and eval-case manifests, deterministic grader, static analysis, security scan, baseline/with-skill/rerun outputs, result report, replay command, replay manifest, release-gate receipt, CI receipt, deterministic seed, eval-case count, correctness/security/completeness/robustness metrics, score delta, thresholds, signed evidence refs, and row hashes; a repository title, README summary, agent filename, example session, composite score, CI badge, local loop output, or source metadata alone is not enough.",
      "Social Reasoning Bench replay claims require source repository and license refs, README, pyproject, lockfile, data/docs/experiments/outputs/packages/scripts tree refs, runner, collector, validation script, workflow, result artifact, CI receipt, domain/package/scenario-mode coverage, data-domain count, fixture count, pipeline-output count, test count, output-artifact count, deterministic seed, replay pass rate, score delta, result coverage, signed evidence refs, and row hashes; a Social Reasoning Bench label, repository metadata, homepage, README description, local validation command, task-domain name, YAML data filename, output folder, aggregate score, model/provider label, or source metadata alone is not enough.",
      "BestTester replay claims require source repository and license refs, README, package.json, lockfile, tsconfig, Playwright config, source/test/agent/MCP/config/script/mutation/report/workflow tree refs, MCP server/client refs, LLM judge rubric, security fuzzer, Jira report, result artifact, CI receipt, capability/test-surface/agent-role coverage, workflow count, agent count, TypeScript file count, test file count, page-object count, security-signal count, Jira/Slack integration count, deterministic seed, replay pass rate, score delta, LLM judge agreement, security coverage, CI coverage, signed evidence refs, and row hashes; a BestTester label, repository metadata, README description, package keyword, local Playwright run, AI workflow name, agent filename, Jira/Slack mention, aggregate pass rate, model/provider label, or source metadata alone is not enough.",
      "Critic Rubrics methodology claims require source repository and no-license boundary refs, README, pyproject, lockfile, arXiv version, release tags, rubric base and trajectory implementations, annotator and prediction modules, typed function-calling schema, rubric feature taxonomy, trajectory converter, batch annotation docs/scripts, tests, workflows, sparse outcome proxy manifest, reranking and early-stopping metric reports, signed evidence refs, and row hashes; a Critic Rubrics label, repository metadata, arXiv abstract, README description, local batch-annotation run, model output, aggregate best-of-N or early-stopping number, or source metadata alone is not enough.",
      "RAGAS notebook metric-validity claims require source repository refs, no-license-boundary or license refs, notebook manifest, dependency manifest, document corpus, chunking config, testset generator config, simple/reasoning/multi_context evolution mix, generated testset manifest, RAG chain config, retriever/vectorstore config, model and embedding config, answer-context trace, RAGAS metric suite, RAGAS evaluation result, LangFuse score export, visualization artifact, metric owner, sample size, confidence interval, signed evidence refs, and row hashes; a RAGAS label, notebook filename, GitHub metadata, README claim, local notebook run, dependency list, copied output table, heatmap, LangFuse screenshot, metric names, aggregate RAGAS score, or source metadata alone is not enough.",
      "TerminalWorld-style terminal-task replay claims require benchmark id/version, source/repository/paper/dataset/license refs, public recording and metadata manifests, privacy and quality filter reports, synthesized task instruction, reference solution, task metadata, Dockerfile and Docker image proof, environment reproduction log, pre/post execution snapshots, state-test suite and result hashes, AllPassing/Nop/Partial trial proof, agent run trace, result manifest, replay command, CI receipt, verified-subset human verification when claimed, task/category/unique-command/reproduced-environment counts, deterministic seed, trial pass/failure metrics, state-assertion coverage, replay pass rate, score delta, thresholds, signed evidence refs, and row hashes; a TerminalWorld label, repository metadata, dataset card, copied README table, task count, local Docker run, aggregate pass rate, command count, or model/provider label alone is not enough.",
      "CL-Bench-style continual-learning question-explainability claims require benchmark/source identity, domain id, workflow id, dataset manifest, state schema, initial state, state mutation trace, conversation trace, entity-relationship graph, tool-execution trace, evaluator config, result artifact, replay command, memory policy when claimed, adaptive-learning trace when claimed, scenario/turn/state-mutation/entity counts, task-completion, response-quality, state-accuracy, retention, token-cost thresholds where claimed, accepted evidence, rejected-evidence reasons, repair hint, and row-hash evidence; a repository title, CRM label, seed label, local transcript, copied task prompt, aggregate score, task-completion percentage, response-quality score, token cost, model/provider label, or source metadata alone is not enough.",
      "Adsum IoT Coder-style firmware question-explainability claims require benchmark/source identity, task id, platform, board id, chip family, firmware project, toolchain, SDK version, hardware session, device logs, build/flash/test artifacts, knowledge pack, task manifest, evaluator config, result artifact, privacy boundary, benchmark report, hardware-run and device counts, bug-closure, token-efficiency, log-capture thresholds, accepted evidence, rejected-evidence reasons, repair hint, and row-hash evidence; a firmware-agent label, package metadata, README capability summary, local build output, copied hardware task, aggregate BLE result, token-efficiency ratio, model/provider label, or source metadata alone is not enough.",
      "ShampooSalesAgent-style retail sales question-explainability claims require benchmark/source identity, task id, sales channel, product catalog, product description, customer scenario, conversation trace, customer intent, order-capture schema, order ledger, pricing policy, discount policy, model adapter manifest, model-provider matrix, prompt policy, recommendation policy, safety policy, privacy boundary, evaluator config, result artifact, benchmark report, provider/scenario/order counts, order-capture accuracy, policy compliance, recommendation grounding, PII redaction thresholds, accepted evidence, rejected-evidence reasons, repair hint, and row-hash evidence; a retail-sales-agent label, repository metadata, README capability summary, product-description file, local CLI/chat transcript, copied order CSV, aggregate order count, model/provider list, screenshot, or source metadata alone is not enough.",
      "AgentTrial-style statistical question-explainability claims require suite/source/package identity, adapter taxonomy, case id/name, suite/case/run/trial manifests, statistical report, trajectory bundle, failure-attribution proof, baseline/candidate result hashes, CI config and run id, dashboard snapshot when claimed, repeated trial counts, pass count/rate, Wilson confidence interval, bootstrap cost/latency, Agent Reliability Score, failure-attribution p-value, non-regression p-value, accepted evidence, rejected-evidence reasons, repair hint, and row-hash evidence; an AgentTrial label, repository metadata, PyPI version, local CLI output, aggregate pass rate, CI green check, dashboard screenshot, README result, or source metadata alone is not enough.",
      "CodeQuest-style quality question-explainability claims require framework id, source/repository/license/source-status proof, task id, language, code artifact, evaluator prompt/config, optimizer prompt/config, baseline and candidate evaluation hashes, evaluator feedback, optimizer grounding, improvement patch, actor-critic loop trace, regression suite, replay command, CI run/config, no-source-copy boundary, dimension count, before/after overall scores, score delta, dimension-regression count, evaluator-feedback coverage, optimizer-grounding coverage, per-dimension score deltas/statuses, accepted evidence, rejected-evidence reasons, repair hint, and row-hash evidence; a CodeQuest label, repository metadata, archived/public status, README evaluator/optimizer description, local notebook run, OpenAI API key setup, code-quality dimension name, aggregate quality score, copied prompt/config, or source metadata alone is not enough.",
      "AgentKernelArena-style GPU-kernel replay claims require benchmark id/version, source/repository/license refs, task manifest, task config, agent roster, agent config, prompt template, workspace isolation, environment manifest, GPU profile, dependency lock, compile/correctness/performance commands, baseline and candidate kernels, compile/correctness results, performance profile, score report, run log, replay command, CI receipt, comparison report, task categories, agent types, task count, deterministic seed, compilation success, correctness pass rate, speedup delta, replay pass rate, result coverage, workspace-isolation proof, no-leaderboard-only boundary, thresholds, signed evidence refs, and row hashes; an AgentKernelArena label, repository metadata, README architecture, demo URL, local run log, GPU label, agent roster name, task category, aggregate speedup, leaderboard placeholder, or source metadata alone is not enough.",
      "LLM Evaluation System-style jury replay claims require benchmark id/version, source/repository/license/package/MCP refs, dataset, synthetic QA, document-grounding, judge config, jury roster, criteria, binary-scoring policy, execution, agent trace, OpenTelemetry, Bedrock access boundary, result, analysis report, PDF report, S3 sync, replay command, CI receipt, no-config-only boundary, no-synthetic-data-copy boundary, no-PDF-report-only boundary, mode and judge-family coverage, dataset/evaluation-case counts, deterministic seed, jury-score delta, binary-scoring coverage, judge agreement, replay pass rate, report coverage, agent-trace coverage, thresholds, signed evidence refs, and row hashes; an LLM Evaluation System label, repository metadata, PyPI version, MCP install command, local run, model family, PDF screenshot, S3 bucket name, aggregate jury score, copied prompt/config, or source metadata alone is not enough.",
      "InnovatorBench-style research replay claims require benchmark id/version, source/repository/license/paper/dataset refs, task manifest, task config, ResearchGym config, agent config, tool registry, workspace dataset-path policy, environment manifest, Docker/web backend, multi-GPU/node manifest, checkpoint manifest, execution manifest, result manifest, metric manifest, score report, replay command, CI receipt, no-leaderboard-only and no-dataset-copy boundary hashes, research-domain/tool-surface/environment-mode coverage, task count, max eval times, deterministic seed, final and best score deltas, replay pass rate, result coverage, checkpoint-restore coverage, tool-evidence coverage, thresholds, signed evidence refs, and row hashes; an InnovatorBench label, repository metadata, ICLR acceptance note, Hugging Face dataset name, README leaderboard placeholder, local ResearchGym run, task-domain name, agent name, tool list, aggregate final score, copied task config, or source metadata alone is not enough.",
      "Metronous-style methodology-versioning claims require methodology id, methodology version, methodology hash, question-set version, changelog row, deprecation notice, migration guidance, telemetry schema, benchmark corpus, threshold policy, model calibration report, cost-accounting policy, local archive manifest, export-sanitization policy, badge query-parameter hash, diagnostic methodology-versioning receipt, accepted evidence, rejected-evidence reasons, and row hashes; a Metronous label, repository metadata, README description, local CLI output, benchmark summary, threshold file, archive folder, model name, dashboard screenshot, or badge URL alone is not enough.",
      "Agent Belt-style coding-agent methodology claims require methodology id, methodology version, methodology hash, source repository snapshot, Apache-2.0 license boundary, release tag, README/docs refs, scenario schema and manifest, agent-adapter roster, custom-agent contract, workspace-diff checks, rule-check policy, multi-judge consensus config, per-turn judge config, pass@k reliability policy, pass^k reliability policy, worktree isolation policy, Docker sandbox policy, export format manifest, CI workflow, package release digest, diagnostic methodology-versioning receipt, accepted/rejected evidence, signed evidence refs, and row hashes; an Agent Belt label, repository metadata, README description, release tag, local eval output, scenario filename, agent adapter name, workspace diff summary, rule-check result, judge name, aggregate pass@k/pass^k number, CI badge, package artifact, or source metadata alone is not enough.",
      "MiniAppBench-style interactive HTML replay claims require benchmark id/version, source/repository/license-review refs, dataset and query-set manifests, evaluation-reference manifest, generated MiniApp and generated source-code manifests, live-instance manifest, browser-automation trace, interaction rubric, visual-render and dynamic-interaction reports, result manifest, replay command, CI receipt, task-category and query-count thresholds, deterministic seed, withheld-reference boundary proof, no-copy source-boundary proof, browser-automation success, interaction coverage, human-alignment score, replay pass rate, score delta, thresholds, signed evidence refs, and row hashes; a MiniAppBench label, repository metadata, query count, leaderboard row, copied evaluation reference, generated HTML sample, local Playwright run, screenshot, aggregate MiniAppEval score, or model/provider label alone is not enough.",
      "Spent-style session-cost replay claims require benchmark id/version, source/repository/license refs, Claude Code hook config, JSONL log manifest, pricing snapshot, classifier rules, command transcript, dashboard export, result manifest, replay command, CI receipt, privacy/no-telemetry boundary, session and tool-event counts, deterministic seed, efficiency and cost deltas, replay pass rate, classification coverage, JSON export validity, thresholds, signed evidence refs, and row hashes; a spent label, repository metadata, CLI score, local cost number, dashboard screenshot, JSON export, copied session log, aggregate efficiency score, model/provider label, or source metadata alone is not enough.",
      "FIRE-style fact-checking replay claims require benchmark id/version, source/repository/paper refs, dataset and atomic-claim manifests, retriever and verifier configs, decision policy, search-provider config, evidence/query/label traces, cost report, result manifest, replay command, CI receipt, atomic-claim and retrieval-step counts, max retrieval depth, deterministic seed, factuality and LLM/search cost deltas, replay pass rate, evidence recall, label agreement, dynamic retrieval and search-provider boundaries, thresholds, signed evidence refs, and row hashes; a FIRE label, repository metadata, paper abstract, copied diagram, local run, aggregate factuality score, cost-reduction number, search-provider label, model/provider label, or source metadata alone is not enough.",
      "Nuclia-style RAG-triad replay claims require benchmark id/version, source/repository/license refs, package version, model-card refs, model-cache policy, Hugging Face auth boundary, evaluator config, dataset manifest, question-answer-context manifest, metric manifest, answer-relevance trace, context-relevance trace, groundedness trace, result manifest, replay command, CI receipt, query/context/metric counts, deterministic seed, baseline/candidate answer relevance, context relevance, groundedness and composite scores, composite delta, regression threshold, replay pass rate, model-access boundary, no-raw-context-copy boundary, signed evidence refs, and row hashes; a Nuclia label, repository metadata, README metric list, package version, local Python snippet, Hugging Face model name, model-cache path, aggregate RAG triad score, copied question/context/answer sample, screenshot, or source metadata alone is not enough.",
      "Strategic multi-agent claims require public transcript, private action, rule/collision, scoring/rating, baseline, truncation/context, and uncertainty evidence; leaderboard rank alone is not enough.",
      "Iterative tournament-learning claims require tournament configuration, environment/version variant, player roster and opponent pool, code artifact hashes, battle logs or replay refs, round/seed/generation counts, ranking aggregation, repeated validation, relative-ranking uncertainty, learning deltas, opponent-code access policy, and contamination boundaries; a leaderboard row or single tournament score alone is not enough.",
      "Agent architecture reality claims require signed wrapper-agent, marketing-agent, and real-agent baselines; planning, memory, and recovery evidence; stress, network, cost, and ensemble evidence; and statistical-confidence evidence; an aggregate agent score alone is not enough.",
      "RAG evaluation claims require custom document/test sets, domain/jurisdiction/language/task coverage where applicable, corpus/chunking, index provenance, solution roster/config, retriever/reranker/model/judge configs, selected metrics, query-level results, metric-computation traces, logged samples with retrieved documents, evaluator evidence, report/export artifacts, and performance/cost evidence; explicit RAG evaluation-pipeline claims additionally require signed ground-truth question/answer sets, pipeline config, metric definitions, query/retrieval/generation traces, evaluation report, metric owner, sample size, and confidence interval evidence; MIRAGE-style metric-intensive RAG claims additionally require benchmark identity, dataset, QA-pair, context-pool, retrieval-pool, base/oracle/mixed protocol, retriever config, model config, LLM result, retriever result, MIRAGE metric, overall-score formula, owner, sample-size, confidence-interval, signed evidence, and row-hash proof; aggregate answer quality alone is not enough.",
      "KITE-style RAG live-drift claims require source/repository/license refs, corpus manifest, document set, query set, ground-truth answer, rubric, RAG pipeline config, response manifest, result manifest, judge config, dataset family, RAG configuration id, grading scale, question count, document count, native and normalized grades, small-sample warning, baseline/live distributions, thresholds, signed evidence refs, and row hashes; a KITE label, folder list, judge model label, copied query, copied rubric, aggregate grade, README result, local run output, or source metadata alone is not enough.",
      "PokerEval-style live-drift claims require benchmark/source identity, repository snapshot hash, package reference hash, citation reference hash, simulation config hash, agent config hash, opponent-pool hash, run manifest hash, hand-history manifest hash, metric-report hash, game type, table size, blind-structure hash, hand count, BB/100, all-in adjusted BB/100, EV BB/100, VPIP rate, baseline/live distributions, thresholds, signed evidence refs, and row hashes; a PokerEval label, leaderboard row, README result, local simulation output, copied hand-history row, aggregate BB/100, model/provider label, package metadata, or source metadata alone is not enough.",
      "EARBench-style physical-risk-awareness methodology claims require benchmark identity, source/repository/paper/license refs, EARDataset or equivalent dataset manifest, physical-risk scenario manifest, domain and scene coverage, safety-guideline manifest, textual or visual observation manifest, task instruction manifest, plan-generation config, plan assessment rubric, task-risk-rate metric definition, effectiveness metric definition, mitigation prompt or policy manifest where used, signed evidence refs, row hashes, and threshold policy; a repository title, arXiv abstract, aggregate TRR, demo command, dataset filename, or copied benchmark row alone is not enough.",
      "LLMOPS-style lifecycle methodology claims require source/repository/license refs, task or pipeline manifest, dataset and split manifests, model registry or artifact manifest, training or fine-tuning config where used, evaluation config, RAG evaluation config where used, QA deployment manifest, CI/CD pipeline receipt, container or orchestration manifest, infrastructure-as-code manifest where used, monitoring telemetry baseline, model/service performance thresholds, signed evidence refs, row hashes, and migration policy; a repository title, README diagram, notebook demo, local command, cloud deployment note, dashboard screenshot, or copied pipeline config alone is not enough.",
      "Multi-user LLM-agent question-explainability claims require benchmark/source identity, scenario id/family, capability label, dataset manifest hash, user-role manifest hash, scenario-specific permission/preference/queue/instruction proof, interaction trace hash, evaluator config hash, result artifact hash, metric report hash, user-role and turn counts, scenario-specific metric thresholds, accepted evidence, rejected-evidence reasons, repair hint, and row-hash evidence; a README scenario summary, aggregate score, local run output, copied dataset path, transcript snippet, or source metadata alone is not enough.",
      "M2RAG-style multimodal RAG methodology claims require methodology version, corpus/query/source-provenance hashes, text and image extraction/filtering/deduplication evidence, retrieval or in-document selection traces, modality representation and output-image insertion policy, evaluator/judge model and rubric hashes, text-modal metric definitions, image coherence/helpfulness/reference/recall metric definitions, overall-score formula, domain/topic coverage, thresholds, signed evidence refs, and row hashes; a text-only RAG run, aggregate multimodal score, demo transcript, README example, local evaluation log, copied benchmark row, or dataset card alone is not enough.",
      "RagScore-style RAG audit methodology claims require methodology version, generated QA dataset manifest hash, source document manifest hash, support-span provenance, QA generation prompt/audience/purpose config hash, RAG endpoint contract hash, judge model/provider config hash, evaluation run config hash, per-question result hash, detailed metric definitions for correctness/completeness/relevance/conciseness/faithfulness, failure-diagnosis taxonomy, retriever/generator attribution evidence, output report/export hashes, privacy local-vs-cloud disclosure, MCP/server telemetry boundary where used, thresholds, signed evidence refs, and row hashes; a generated QA file, notebook plot, CLI summary, screenshot, average score, provider/model label, README example, or copied evaluation row alone is not enough.",
      "AD-GEN-style SOC dataset replay claims require benchmark id/version, repository snapshot hash, release manifest hash, source corpus manifest hash, LAB and REAL dataset hashes, conversion script hash, labeling prompt hash, output schema hash, ATT&CK mapping hash, SOC action schema hash, validation report hash, label-quality report hash, cross-model audit report hash, dataset and code license hashes, replay command hash, deterministic seed, environment, label source, raw event count, validated record count, risk-class coverage, MITRE tactic coverage, supported action coverage, parse-success, schema-validity, verdict-consistency, unknown tactic and technique rates, invalid action count, evidence-support and ATT&CK-alignment scores, replay pass rate, score delta, thresholds, evidence refs, signed evidence, and row hashes; raw telemetry counts, generated narratives, JSONL samples, ATT&CK labels, model-audit summaries, README tables, or dataset release notes alone are not enough.",
      "MIRAGE-style RAG metric-validity claims require benchmark identity, dataset manifest, QA-pair manifest, context-pool manifest, retrieval-pool manifest, base/oracle/mixed protocol proof, retriever config, model config, LLM result report, retriever result report, MIRAGE metric report, overall-score formula, metric owner, sample size, confidence interval, signed evidence refs, and row hashes; a generic RAG score, final answer accuracy, retriever metric table, local command log, copied benchmark rows, or README result alone is not enough.",
      "Legal Code RAG metric-validity claims require repository/source/license refs, legal corpus manifests, Legifrance source-boundary proof, retriever config, vector database config, embedding model config, windowing, hybrid-search, query-rewrite, routing-policy configs, evaluation dataset, reference answers, metric definitions, evaluator config, evaluation report, legal code and jurisdiction ids, retrieval technique ids, vector-store and embedding-model ids, evaluation dataset ids, metric owner, sample size, confidence interval, signed evidence refs, and row hashes; a Legal Code RAG label, France legal-code corpus mention, Legifrance mention, Qdrant config, notebook run, local query output, README example, or aggregate RAG score alone is not enough.",
      "GuardBench-style guardrail metric-validity claims require benchmark identity, dataset manifest, dataset access policy, standardized-format proof, moderation-function contract, guardrail-model config, threshold config, prediction-score manifest, metric-suite report, confusion-matrix report, language coverage, leaderboard/export report, metric owner, sample size, confidence interval, signed evidence refs, and row hashes; a leaderboard row, final F1 score, model label, local command log, README example, copied dataset row, or export table alone is not enough.",
      "Tavily-style web eval dataset metric-validity claims require benchmark identity, source repository reference, subject manifest, generated query manifest, search provider config, retrieved document manifest, document filter manifest, QA generation manifest, reference answer manifest, dataset export manifest, output target manifest, validation report artifact, freshness snapshot, provider diversity, source coverage, answer grounding, metric owner, sample size, confidence interval, signed evidence refs, and row hashes; a web-eval generator label, source metadata, README workflow, local run, generated QA pair, saved dataset, API/provider name, screenshot, or aggregate RAG score alone is not enough.",
      "Parallel/OpenClaw research-skill metric-validity claims require source repository reference, license boundary reference, skill manifest, API surface manifest, search-mode manifest, deep-research task manifest, chat-grounding manifest, extract-content manifest, citation provenance report, source policy manifest, batch execution manifest, monitoring manifest, security boundary, dependency lock, benchmark-claim validation report, metric owner, sample size, confidence interval, signed evidence refs, and row hashes; a Parallel skill label, repository metadata, README feature list, SKILL manifest title, API surface name, fast or agentic search mode, local wrapper run, citation excerpt, monitoring note, batch-size claim, benchmark claim, or source metadata alone is not enough.",
      "Resume-RAG evaluator metric-validity claims require source repository reference, license or no-license-boundary reference, resume upload manifest, parser manifest, job-description manifest, RAG strategy manifest, query expansion manifest, retrieval config manifest, vector-store manifest, Ollama model manifest, embedding model manifest, evaluation endpoint manifest, candidate rating report, batch evaluation manifest, privacy boundary, dependency lock, metric owner, sample size, confidence interval, signed evidence refs, and row hashes; a resume parser label, repository metadata, README feature list, local upload demo, model name, RAG strategy name, candidate score, batch-evaluation mode, endpoint name, screenshot, or source metadata alone is not enough.",
      "Sutro-style batch methodology-versioning claims require methodology id/version/hash, source repository snapshot, license boundary, function definition, judge/classifier/extractor schema, input data-source manifest, input-order preservation, batch priority policy, dry-run cost estimate, model-pool manifest, observability trace schema, result export manifest, retention policy, multi-model comparison, embedding job, diagnostic receipt, signed evidence refs, and row hashes; a Sutro label, repository metadata, README description, SDK method name, DataFrame preview, batch job id, dashboard screenshot, result download, dry-run estimate, model name, or source metadata alone is not enough.",
      "Advanced RAG notebook replay claims require course and lesson identity, notebook and notebook-output hashes, environment and dependency-lock hashes, corpus/index/query/reference-answer evidence, retrieval/generation/eval/observability traces, replay command, deterministic seed, query count, context relevance, groundedness, answer relevance, and thresholds; a notebook file or generic RAG score alone is not enough.",
      "CostNav-style physical navigation replay claims require source/repository/license refs, benchmark spec, scenario manifest, route graph, economic-cost model, physical-agent config, simulator config, trajectory manifest, result manifest, metrics report, replay command, CI receipt, route-type coverage, deterministic seed, scenario count, baseline and candidate economic cost, economic-cost delta, navigation success, replay pass rate, score delta, thresholds, signed evidence refs, and row hashes; a repository title, benchmark label, route label, screenshot, copied map/config/script, local simulator output, aggregate cost, model/provider label, or source metadata alone is not enough.",
      "Logic and symbolic benchmark replay claims require benchmark identity, paper/source reference hash, dataset id and manifest, dataset access receipt, license reference, submodule manifest, environment and setup hashes, inference-provider and chat-completion-module proof, secret boundary, logic-agent and auxiliary-tool manifests, tool-kind coverage, replay command, deterministic seed, output JSON, evaluator evidence such as ZeroEval for ZebraLogicBench, unit-test evidence when claimed, task count, logic accuracy, solver agreement, tool-use coverage, replay pass rate, thresholds, evidence refs, signed evidence, and row hashes; aggregate accuracy or a local command log alone is not enough.",
      "Unified evaluation-engine replay claims require engine version, run id, modality, harness mode, run/config registry, dataset, model backend, role adapter, metric config, output contract, events JSONL, samples JSONL, summary JSON, sample/raw/visual artifact manifests where applicable, output directory, environment, dependency lock, replay command, deterministic seed, sample/metric/artifact counts, replay-artifact coverage, score mean, and thresholds; a summary file or benchmark label alone is not enough.",
      "VLA/world-model replay claims require survey and taxonomy version, paradigm, metric family, foundation model id, model/dataset/benchmark/metric/environment hashes, observation-action and predicted-observation traces, generated trajectory manifest, simulator and reward proof when claimed, policy config, replay command, deterministic seed, task/benchmark/metric counts, trajectory coverage, task success, world-model score, thresholds, evidence refs, and signed evidence; curated paper lists or aggregate embodied-AI scores alone are not enough.",
      "Business workflow automation claims require domain/task coverage, simple-baseline evidence, public/private score caveats, toolset/config controls, programmatic end-state assertions, partial-credit and strict pass-rate semantics, export artifacts, and multi-run comparison evidence; a final automation score alone is not enough.",
      "Data-agent analytical benchmark claims require task-type coverage, database/source-modality coverage, difficulty distribution, metric-computation traces, agent-workflow roster/config evidence, expert-validation evidence, cost/latency traces, and submission-schema evidence; aggregate accuracy or rubric score alone is not enough.",
      "Embodied-agent benchmark claims require task-type coverage, simulator environment config, scene or dataset package, random/human/model baselines, action-observation trajectories, result folders, overall and task-type metric reports, metric owner, sample size, and confidence interval evidence; aggregate simulator score alone is not enough.",
      "Document-to-dataset live drift claims require corpus/index/document/page/cell manifests, generated sample/export manifests, bench metric and report artifacts, numeric-guard coverage, quality metrics, token-efficiency, throughput, memory, and task/format/export context evidence; aggregate RAG score alone is not enough.",
      "RAG QA dataset-builder live drift claims require builder id, dataset version, source-document manifest, source license, QA-pair manifest, passage manifest, builder config, tier, question type, stage, passage grounding, human verification, citation, answer-support, cost, batch/concurrency, source/question counts, evidence refs, signed evidence, and row hashes; a generic RAG score or dataset size alone is not enough.",
      "NoMIRACL-style multilingual RAG live-drift claims require source, repository, license, dataset, language manifest, qrels, passage pool, retrieval run, model route, generation trace, evaluation report, baseline/live result, alert policy, language/subset identity, relevant/non-relevant judgment, relevance and abstention accuracy, hallucination and error rates, baseline/live distributions, evidence refs, signed evidence, and row hashes; a NoMIRACL label, language list, README result, dataset card, generic RAG score, or single hallucination metric alone is not enough.",
      "CPU-centric agentic workload live drift claims require benchmark id, paper reference hash, workload family, framework id, runtime, schedule mode, environment and conda hashes, hardware profile, system requirements, model-server config, API-key boundary, workload config, dataset and tool manifests, run script, result manifest, batch size, worker count, latency percentiles, throughput, CPU/GPU utilization, memory, bottleneck share metrics, evidence refs, signed evidence, and row hashes; a generic score or single latency number alone is not enough.",
      "12-technique evaluator live drift claims require technique id, suite id, notebook or recipe hash, dataset hash, LangChain or LangSmith config evidence, technique-specific reference, judge, ground-truth, trajectory, tool-schema, RAG-source, callback, or batch artifacts, per-technique metric outputs, baseline/live distributions, evidence refs, signed evidence, and row hashes; a notebook, demo, or aggregate evaluator score alone is not enough.",
      "PIArena-style prompt-injection live-drift claims require benchmark id, dataset hash/name, attack id/mode/config, defense id/config, injected-prompt hash, model config, evaluation config, result artifact, agent benchmark and suite, attack success, defense block, false-positive, agent-task success, tool-call success, evidence refs, signed evidence refs, and row hashes; generic red-team labels, unsafe-response rates, local command logs, README examples, or copied prompt-injection benchmark rows alone are not enough.",
      "BackdoorAgent-style live-drift claims require benchmark id, dataset hash, task id/family, workflow stage, attack id/family, trigger hash, poison config hash, model config hash, agent config hash, run config hash, trajectory trace hash, result artifact hash, attack success, clean task success, trigger activation, trigger persistence, trigger propagation, trajectory capture, evidence refs, signed evidence refs, and row hashes; generic red-team labels, attack demos, local command logs, aggregate ASR or clean-accuracy numbers, README examples, or copied backdoor benchmark rows alone are not enough.",
      "Agent-security control live-drift claims require guard identity, policy hash, taint trace, proxy/secret-guard trace, tamper-evident audit trail, runtime telemetry, eval-pack hash, classifier/origin proof, source-origin coverage, taint-propagation coverage, policy decision accuracy, secret-scrub rate, audit integrity, attack-effectiveness rate, false-positive rate, guard latency, signed evidence refs, and row hashes; a red-team score, unsafe-response label, local proxy log, screenshot, or command output alone is not enough.",
      "Agent-testing methodology live-drift claims require taxonomy id, methodology hash, scenario-catalog hash, fault-injection plan hash, observability plan hash, safety plan hash, standards-map hash, category, testing approach, fault model, benchmark family, methodology/scenario/fault-injection coverage, resilience pass rate, safety-regression rate, observability signal coverage, signed evidence refs, and row hashes; a curated awesome list, category label, local test command, or aggregate score alone is not enough.",
      "Chaos-reliability live-drift claims require benchmark id, scenario id, chaos profile, injection plan hash, mutation manifest hash, endpoint contract hash, judge config hash, trace bundle hash, score ledger hash, agent-card hash, improvement-eval hash, framework id, modality, benchmark family, production reliability, resilience score, chaos drop, recovery pass rate, failure-trace coverage, signed evidence refs, and row hashes; a badge, dashboard screenshot, local CLI output, leaderboard row, or aggregate reliability score alone is not enough.",
      "ADK runtime live-drift claims require runtime id, framework version, agent graph hash, tool registry hash, eval dataset hash, eval case hashes, runner config hash, session state hash, live request queue hash when streaming is claimed, API server route hash when API execution is claimed, deployment manifest hash when deployment readiness is claimed, model route, execution mode, deployment target, eval pass rate, tool-call success rate, graph coverage, streaming stability, deployment readiness, evidence refs, signed evidence refs, and row hashes; a CLI run, web UI screen, graph visualization, local eval command, or aggregate pass rate alone is not enough.",
      "PhysicianBench-style clinical EHR live-drift claims require benchmark id, task-set version, paper/source reference hash, task id, specialty, task type, FHIR server image hash, FHIR API schema hash, patient-record manifest hash, patient cohort hash, verifier checkpoint hash, trajectory hash, workspace artifact hash, eval-log hash, metadata hash, model config hash, tool manifest hash, run config hash, task success, checkpoint pass rate, FHIR data-access accuracy, clinical-action safety, documentation quality, trajectory and artifact coverage, evidence refs, signed evidence refs, and row hashes; aggregate pass@1, a model ranking, a local run log, a website trajectory, or copied clinical benchmark rows alone are not enough.",
      "Graph-eval judge calibration claims require graph id/version, node graph hash, scan and metric-node hashes, aggregation node hash, report artifact hash, cache-key hash, model-routing hash, prompt/parser/cost/report/schema/dataset/execution hashes, required and executed metric branches, branch coverage, per-case report coverage, cost-estimate drift, signed evidence refs, and proof hashes; a CLI report, cache directory, model label, GEval rubric label, or aggregate judge score alone is not enough.",
      "Enterprise agent interop evaluation claims require dataset id/version, test-case ids, agent registration hash, agent endpoint contract hash, evaluation-run id, MCP or tool registry hash, tool-call trace hashes, response artifact hashes, result metric manifest, persistence/export receipt, signed evidence refs, and row hashes; a web UI result, local API response, sample-agent demo, or aggregate evaluation score alone is not enough.",
      "Web-agent privacy leakage live drift claims require benchmark id, dataset hash, task-config hash, browser environment, observation mode, action-set tag, instruction config, cookie state, environment reset, data-minimization policy, allowed/sensitive info manifests, trajectory, result artifact, leakage judge, model route, captioning model for image/SoM mode, data-minimization and leakage metrics, task success, modal leakage delta, evidence refs, signed evidence, and row hashes; a generic privacy score, final task success, or prompt variant label alone is not enough.",
      "ML-development workflow replay claims require benchmark id/version, paper or source reference, task-suite hash, task category, problem domain, task/config/workspace/runtime/dependency evidence, agent harness/config, Calipers config, Hydra override, metrics config, scoring mode, validation script, replay command, deterministic seed, run count, report and trace artifacts, baseline/candidate metrics, score delta, task pass rate, thresholds, evidence refs, signed evidence, and row hashes; an agent leaderboard row, final model metric, task label, or local command log alone is not enough.",
      "Text2SQL business-database replay claims require benchmark id/version, source reference, dataset id/version, database engine and snapshot, schema and business-domain manifests, query set, reference SQL, expected result manifest, agent harness/config, model config, tool registry, schema memory, schema-retrieval mode and trace, SQL governance config, security-control manifest, audit log, prompt/policy hash, execution trace, result artifact, replay command, deterministic seed, query count, execution accuracy, exact match, retrieval grounding, unsafe-SQL rate, RLS-violation rate, thresholds, evidence refs, signed evidence, and row hashes; a final SQL accuracy number, demo transcript, or generated query alone is not enough.",
      "AgentBench-style replay claims require benchmark id/version, paper/source reference hash, repository snapshot hash, dataset manifest hash, agent config hash, global config hash, model-server config hash, environment manifest hash, dependency lock hash, run and replay command hashes, trace-path and sample-trace hashes, result manifest hash, metrics report hash, architecture and workload labels, deterministic seed, sample/shuffle settings, saved trace proof, baseline/candidate metrics, score delta, replay pass rate, trace coverage, thresholds, evidence refs, signed evidence, and row hashes; aggregate benchmark scores, local command logs, GitHub metadata, README snippets, or copied benchmark rows alone are not enough.",
      "AI-agent benchmark comparison replay claims require source/repository/license refs, agent roster, benchmark dataset, source manifest, pricing snapshot, user-report manifest, leaderboard snapshot, score manifest, eval-pack manifest, fixture hash, replay command, result manifest, score-delta report, CI receipt, comparison run id, agent-under-test identity, family/source-category coverage, agent/source/benchmark counts, deterministic seed, baseline/candidate scores, replay pass rate, source/pricing/user-report coverage, thresholds, signed evidence refs, and row hashes; README tables, aggregate rankings, GitHub metadata, copied data rows, pricing snippets, user-report quotes, or leaderboard context alone are not enough.",
      "GTO Wizard-style poker-agent replay claims require source/repository/license refs, API documentation and scope proof, no-solver-access policy, eval-pack and fixture hashes, agent-policy manifest, hand-history manifest, legal-action trace, result manifest, AIVAT metric report, replay command, CI receipt, agent-type coverage, game variant, hand count, deterministic seed, baseline/candidate AIVAT bb/100, replay pass rate, legal-action rate, thresholds, signed evidence refs, and row hashes; repository metadata, copied README commands, local hand logs, leaderboard context, aggregate chip results, or model labels alone are not enough.",
      "SAP agent-evaluation tutorial live-drift claims require tutorial/source/repository/license refs, notebook, dataset, baseline log, live sample, metric config, tooling config, role-access policy, reliability policy, compliance policy, alert receipt, objective taxonomy, evaluation-process taxonomy, enterprise-context taxonomy, coverage metrics, baseline/live distributions, thresholds, signed evidence refs, and row hashes; repository metadata, notebook names, dataset folders, sample log paths, local notebook runs, abstract summaries, aggregate eval scores, copied log rows, or model labels alone are not enough.",
      "Agent-evaluation observability live-drift claims require source/repository/license refs, agent config, eval dataset, prompt variant, model config, RAG index, metric config, baseline eval result, live eval result, OpenTelemetry trace, Application Insights, Event Hub, Kusto policy, Fabric dashboard, alert receipt, metric-set taxonomy, telemetry taxonomy, config/telemetry/evidence coverage, baseline/live distributions, thresholds, signed evidence refs, and row hashes; repository metadata, README screenshots, copied configs, copied Kusto scripts, dashboard labels, local run output, aggregate eval scores, Azure service labels, prompt variant labels, or model labels alone are not enough.",
      "Agent_Mont-style monitoring replay claims require benchmark id/version, Agent Mont benchmark id, source/repository/license refs, monitoring config, agent framework, agent/task/run traces, token-usage manifest, cost rate card, latency trace, resource-utilization proof, carbon-estimate config, log artifact, visualization artifact, metrics report, replay command, visualization modes, token/cost/latency/throughput/CPU/memory/carbon metrics, replay pass rate, metric and log coverage, thresholds, signed evidence refs, and row hashes; a dashboard screenshot, CLI summary, local log, token counter, cost number, README example, or visualization alone is not enough.",
      "Edge AI agent replay claims require source/repository/license refs, device profiles, runtime manifests, optimization manifests, benchmark datasets, task manifests, application scenarios, replay commands, metric reports, device-class coverage, modality coverage, runtime-kind coverage, on-device execution, offline capability, privacy boundary, latency p95, memory p95, energy per task, accuracy, replay pass rate, score delta, thresholds, signed evidence refs, and row hashes; a curated list entry, paper link, benchmark name, framework/runtime label, device claim, local run, aggregate score, latency number, screenshot, README example, copied list row, or application example alone is not enough.",
      "Agent Workflow Kit-style workflow replay claims require source/repository/license refs, guide hash, skill-package manifest, template manifest, risk-scoring rubric, workflow-level policy, spec-layer policy, approval policy, verification-command manifest, docs-check workflow, evaluation manifest, replay command, risk score, recommended and applied levels, workflow-level match flag, spec-layer decision validity, external-approval requirement and gate proof, deterministic seed, verification/template/docs-check/replay pass rates, thresholds, signed evidence refs, and row hashes; a guide label, risk score, AGENTS.md template, copied checklist, skill package name, docs badge, or local docs check alone is not enough.",
      "MedAsk-style clinical benchmark replay claims require benchmark id/version, source/repository/license refs, requirements and setup hashes, SymptomCheck and Triage vignette manifests, evaluation scripts, patient simulator config, doctor and triage model configs, result manifests, paired analysis, run and replay commands, deterministic seed, clinical-task coverage, symptom and triage vignette counts, top-5 diagnostic accuracy, triage accuracy, urgency-class coverage, replay pass rate, score delta, thresholds, signed evidence refs, and row hashes; a MedAsk label, README run, blog result, clinical-vignette count, local model output, aggregate diagnostic accuracy, triage accuracy, or copied result table alone is not enough.",
      "BioKGBench-style biomedical KG replay claims require benchmark id/version, source/repository/paper/license refs, dataset release, knowledge graph manifest, KG build config, task/KGCheck/KGQA/SCV manifests, agent/RAG/Neo4j configs, evaluation script, result manifest, error-discovery report, replay command, CI receipt, deterministic seed, KGCheck/KGQA/SCV task-kind coverage, dataset and task counts, KGCheck/KGQA/SCV metrics, error discovery count, replay pass rate, score delta, thresholds, signed evidence refs, and row hashes; a BioKGBench label, paper abstract, dataset link, KGCheck/KGQA/SCV task name, local KG build, Neo4j mention, aggregate score, discovered-error count, README result, or copied benchmark row alone is not enough.",
      "BioMedArena-style biomedical harness replay claims require benchmark id/version, source/repository/license refs, README, pyproject, config, matrix config, harness tree, harness CLI, benchmark config, eval suite, adapter registry, tool registry, vendor manifest, baseline agent, quick-run, release-gate, result, replay, CI, benchmark-family coverage, tool-mode coverage, deterministic seed, benchmark/tool/adapter/vendor counts, baseline and candidate scores, score delta, replay pass rate, tool coverage, benchmark coverage, tool sandbox verification, thresholds, signed evidence refs, and row hashes; a BioMedArena label, repository metadata, README overview, benchmark count, tool count, local run log, aggregate score, copied result table, or harness name alone is not enough.",
      "ARIASHA/MiRAGE-style drug-repositioning metric-validity claims require benchmark identity, source/repository/paper refs, dataset release, train/test split, drug-disease mapping, drug feature, disease feature, similarity matrix, negative-sampling protocol, classifier config, feature-selection report, score-calculation manifest, evaluation report, case-study validation, metric owner, sample size, confidence interval, signed evidence refs, and row hashes; a MiRAGE label, GitHub metadata, paper link, dataset folder, notebook output, aggregate score, random-forest mention, feature-importance table, case-study name, README result, or copied dataset row alone is not enough.",
      "DeepMath-style math-agent replay claims require benchmark id/version, repository snapshot hash, source reference hash, model config hash, base-model reference hash, GRPO config hash, vLLM config hash, agent-interface hash, sandbox policy hash, executor allowlist hash, few-shot trace hash, dataset manifest hash, evaluation script hash, inference and training run-config hashes, generated-output JSONL hash, metrics report hash, replay command hash, deterministic seed, dataset family, run mode, sample count, majority@16 accuracy, exact-answer accuracy, code-snippet use, sandbox-violation rate, execution-timeout rate, output-token reduction, replay pass rate, score delta, thresholds, evidence refs, signed evidence, and row hashes; aggregate math accuracy, README examples, local command logs, model cards, copied snippets, or a single generated solution alone is not enough.",
      "JudgeIt-style LLM-as-judge replay claims require benchmark id/version, repository snapshot hash, dataset manifest hash, golden-text manifest hash, generated-text manifest hash, pipeline config hash, judge-model config hash, judge-prompt rubric hash, human-evaluation reference hash, evaluation config hash, batch-run config hash, result export hash, metrics report hash, replay command hash, deterministic seed, pipeline type, scoring mode, sample count, baseline/candidate metrics, score delta, precision, recall, F1, human-agreement F1, false-negative rate, replay pass rate, blackbox score, whitebox trace validity, negative-testing harmful rate, thresholds, evidence refs, signed evidence, and row hashes; a UI screenshot, local command log, README metric claim, leaderboard/export table, copied dataset row, or aggregate LLM-judge score alone is not enough.",
      "BenchLoop-style local LLM benchmark replay claims require benchmark id/version, repository snapshot hash, package version hash, suite/task/frozen-task manifests, scorer/harness/provider/endpoint/model configs, machine profile, dependency lock, run config, run output manifest, metrics report, agent-loop trace, tool-call trace, token-latency trace, run persistence, export artifact, replay command, deterministic seed, suite, provider, harness, deployment mode, task/tool/turn counts, overall, quality, speed, reliability, agent, pass-rate, token-speed, time-to-first-token, replay-pass, score-delta metrics, thresholds, signed evidence refs, and row hashes; a local console score, leaderboard row, hardware label, model name, CLI transcript, README example, copied task row, or screenshot alone is not enough.",
      "FreshStack-style IR/RAG retrieval replay claims require benchmark id/version, repository snapshot hash, paper reference hash, query dataset hash, corpus dataset hash, StackOverflow query manifest hash, GitHub corpus manifest hash, dataset and code license reference hashes, BEIR-format manifest hash, nugget qrels hash, query qrels hash, query-to-nugget map hash, chunking config hash, retriever config hash, index artifact hash, runfile hash, evaluator config hash, metrics report hash, leaderboard snapshot hash, replay command hash, deterministic seed, topic, retriever kind, query count, corpus document count, topic coverage, baseline/candidate metrics, score delta, alpha-nDCG@10, coverage@20, recall@50, replay pass rate, thresholds, evidence refs, signed evidence, and row hashes; a leaderboard row, README example, local runfile, copied dataset row, model name, or aggregate retrieval score alone is not enough.",
      "DB context enrichment replay claims require benchmark id/version, repository snapshot hash, extension manifest hash, database schema hash, schema-discovery trace hash, context-set hash, template-set hash, facet-set hash, value-search-set hash, golden dataset hash, Evalbench db/model/run config hashes, LLM-rater config hash, evaluation result hash, failure-case manifest hash, hill-climb plan hash, context mutation patch hash, final-validation result hash, replay command hash, deterministic seed, database engine, context artifact mode, workflow stage, golden question count, context item count, baseline/candidate SQL accuracy, context reuse coverage, executable SQL rate, hallucinated-column rate, replay pass rate, thresholds, evidence refs, signed evidence, and row hashes; a generated context file, schema dump, local eval log, golden dataset sample, Gemini CLI transcript, README example, or aggregate SQL accuracy alone is not enough.",
      "REALTALK-style long-term conversation replay claims require benchmark identity, paper and license references, raw-export and preprocessed-conversation manifests, participant and speaker manifests, temporal split, privacy/consent proof, LoCoMo comparison boundary, 21-day conversation-span evidence, task-specific QA or persona or emotional-intelligence evaluator artifacts, OpenAI/API boundary proof where used, metrics, thresholds, signed evidence, and row hashes; raw chat exports, aggregate memory scores, or a persona-simulation label alone are not enough.",
      "CloneMem-style long-term-memory replay claims require benchmark identity, repository snapshot, source and license references, persona manifest, digital-trace manifests for diary/social/direct-message/email evidence, question set, ground-truth evidence, temporal split, bilingual config, evaluation config, baseline retriever, memory-system config, result artifact, replay command, deterministic seed, trace-kind/category/language coverage, persona/question/context counts, evidence-grounding, temporal-consistency, unanswerable-accuracy, trajectory-reasoning, replay pass rate, score delta, thresholds, signed evidence refs, and row hashes; a CloneMem label, AI-clone memory label, aggregate score, chat-only memory benchmark, local run log, README result, copied dataset row, or persona summary alone is not enough.",
      "ResearchHarness-style tool-using agent replay claims require benchmark identity, repository snapshot, source and license references, runtime contract, tool-surface manifest, native tool-call trace, OpenAI-compatible API contract, workspace-boundary proof, trace manifest, benchmark adapter, baseline harness config, meta-harness comparison, model-provider matrix, evaluation report, replay command, context-compaction policy, human-interaction policy, model/tool/task coverage, trace-event count, replay pass rate, trace coverage, tool-call validity, workspace isolation, API compatibility, baseline agreement, score delta, thresholds, signed evidence refs, and row hashes; a harness label, model list, local run log, trace folder, README summary, personal-assistant demo, or aggregate agent score alone is not enough.",
      "Model-harness benchmark replay claims require model id, harness id, task id/source, scenario/capability/complexity/modality/environment taxonomy, grading mode, prompt/workspace/timeout/task metadata hashes, grader or judge rubric evidence, transcript and metric artifacts, submission and slice payloads, replay command, result-version path, deterministic seed, task count, and open-environment preservation evidence; an aggregate leaderboard row alone is not enough.",
      "Comparative coding-agent report replay claims require report and source identity, source-material hash, standardized prompt hash, agent roster hash, scoring rubric hash, category-score manifest hash, implementation artifact hash, screenshot manifest hash, report artifact hash, replay command, deterministic seed, agent-count coverage, category-score coverage, recommendation use cases, normalized score threshold, evidence refs, signed evidence refs, and row hashes; aggregate rankings, report PDFs, screenshots, local metadata, or copied implementation examples alone are not enough.",
      "Benchmark-hackability audit replay claims require scanner id/version, target benchmark id, source ref, target task manifest, audit config, phase traces, static-tool reports when static or hybrid analysis is claimed, AI-inspection trace when AI or hybrid analysis is claimed, vulnerability-finding manifest, dashboard/event stream, report artifact, replay command, sandbox config, sandbox network/read-only/capability controls, PoC validation, vulnerability-class coverage, task-count coverage, exploitability threshold, evidence refs, signed evidence refs, and row hashes; a dashboard screenshot, vulnerability label, generated exploit snippet, or local command log alone is not enough.",
      "Evaluator-suite metric-validity claims require deterministic assertion, LLM judge, safety assertion, red-team attack, dataset eval manifest, custom judge, reporter output, framework integration, threshold config, metric owner, sample size, and confidence interval evidence; a judge score or report artifact alone is not enough.",
      "Pentesting and threat-model benchmark metric-validity claims require Dockerized app manifests, language-stack coverage, vulnerability-class coverage, difficulty distribution, multi-step chain coverage, flag ground truth, threat-model ground truth, false-positive traps, security-control effectiveness, exploit execution trace, threat-model report, metric owner, sample size, confidence interval, signed evidence refs, and row hashes; a flag solve rate, exploit script, or threat-model score alone is not enough.",
      "Trace-derived agent-evaluation metric-validity claims require Bedrock Converse-style model config, agent-parameter manifest, tool registry, trace manifest, repeatable case manifest, dynamic expectation validator, bulk case run manifest, run permutation manifest, mock LLM backend control, metric definition manifest, measurement export manifest, production monitor binding, threshold alarm config, metric owner, sample size, confidence interval, signed evidence refs, and row hashes; a trace viewer, case list, metric table, or production alarm alone is not enough.",
      "Living-environment metric-validity claims require task-program, living-environment, environment-mutation, capability, sandbox-provider, agent-adapter, multi-turn trajectory, stage-checker, checker-result, trial-result, aggregate-metric, pass-at-k, proactive-trigger, metric-owner, sample-size, confidence-interval, signed evidence refs, and row hashes; a demo video, final task score, or static benchmark label alone is not enough.",
      "Persona-agent metric-validity claims require persona manifests, static environment manifests, benchmark question sets, persona-agent configs, model/provider configs, response traces, rubric manifests, PersonaScore-style metric definitions, human-alignment calibration, evaluation outputs, benchmark result manifests, metric owner, sample size, confidence interval, signed evidence refs, and row hashes; a persona label, final PersonaScore, demo transcript, or static benchmark name alone is not enough.",
      "Scientific literature discovery metric-validity claims require benchmark manifests, deep and wide research task manifests, released dataset and obfuscation manifests, literature corpus manifests, search-backend configs, DeepXiv and web-search tool configs, agent configs, inference-run manifests, evaluation-pipeline configs, deep-search accuracy and wide-search IoU metric definitions, result reports, metric owner, sample size, confidence interval, signed evidence refs, and row hashes; a paper list, search transcript, final answer, or aggregate literature-discovery score alone is not enough.",
      "BioAgentBench-style bioinformatics agent metric-validity claims require benchmark manifests, paper or source references, bioinformatics task manifests, input dataset manifests, truth/reference manifests, workflow reproduction manifests, Docker or environment manifests, tool-version manifests, agent-harness manifests, grader config manifests, result artifact manifests, perturbation-suite manifests, privacy-boundary manifests, metric owner, sample size, confidence interval, signed evidence refs, and row hashes; a task prompt, local pipeline run, result file, aggregate completion score, README claim, Docker command, notebook, copied task text, or copied task row alone is not enough.",
      "Network troubleshooting metric-validity claims require benchmark manifests, paper or source references, scenario manifests, topology tier manifests, incident catalogs, fault-injection manifests, session traces, agent interface manifests, MCP/tool manifests, environment runtime manifests, evaluation metric manifests, judge config manifests, batch summaries, root-cause and localization ground truth, traffic workload manifests, metric owner, sample size, confidence interval, signed evidence refs, and row hashes; a network benchmark name, topology label, aggregate troubleshooting score, local CLI output, README example, or copied incident row alone is not enough.",
      "Inference optimization metric-validity claims require benchmark manifests, paper or source references, scenario objective manifests, hardware budget manifests, server contract manifests, runtime backend manifests, search space manifests, baseline comparison manifests, quality gate results, integrity gate results, supervised relaunch results, latency and throughput metrics, tail latency metrics, exploration trace manifests, metric owner, sample size, confidence interval, signed evidence refs, and row hashes; an inference benchmark name, aggregate speedup, local server run, GPU label, backend label, single latency number, throughput number, README result, or copied leaderboard row alone is not enough.",
      "Agent Bench-style Java coding-agent metric-validity claims require benchmark manifests, source/repository/license refs, Java task manifests, YAML benchmark manifests, workspace templates, isolated sandbox manifests, provide lifecycle traces, setup/post script manifests, CLI-agent configs, cascaded jury manifests, judge-tier policies, Maven build checks, JUnit test results, JaCoCo coverage reports, result JSON manifests, accuracy/pass@k metrics, metric owner, sample size, confidence interval, signed evidence refs, and row hashes; a Java benchmark label, YAML file, CLI run, local Maven output, README example, project name, judge-tier label, coverage number, result JSON, aggregate accuracy/pass@k score, or copied benchmark row alone is not enough.",
      "Mobile-agent metric-validity claims require benchmark manifests, paper or source references, mobile environment manifests, app inventory manifests, API catalog manifests, UI automation traces, task dataset manifests, task-complexity manifests, multi-app task manifests, checkpoint metric rubrics, checkpoint result artifacts, environment reset policies, device-state fixtures, result report artifacts, dataset license boundaries, metric owner, sample size, confidence interval, signed evidence refs, and row hashes; a MobileBench-style label, app demo, emulator run, aggregate success rate, screenshot, API trace, local command output, copied task row, or README result alone is not enough.",
      "DocThinker-style document RAG replay claims require benchmark identity, repository/paper/license references, document corpus, text and image-text carrier manifests, PDF processing, query and unanswerable-query sets, complexity-router config, routing decisions, perception and reasoning traces, session-KG and KG-expansion artifacts, memory policy and recall traces, retrieval/generation/observability traces, eval config, metrics report, report artifact, environment, dependency lock, replay command, deterministic seed, carrier/query/memory/retrieval coverage, document/query/memory-layer counts, routing accuracy, evidence recall, answer accuracy, unanswerable robustness, token/cost reduction, replay pass rate, score delta, thresholds, signed evidence refs, and row hashes; a local UI demo, README architecture diagram, paper abstract, upload transcript, or aggregate RAG score alone is not enough.",
      "RAG chunking-strategy replay claims require source reference, document set, question set, reference-answer set, chunker manifest, chunking config, embedder config, keyword-index config, retrieval-fusion config, retrieval trace, scoring config, scoring report, report/export artifacts, replay command, deterministic seed, document/question/chunker counts, strategy-kind coverage, retrieval mode, best-chunker id, combined-score, answer-span coverage, semantic-focus metrics, thresholds, signed evidence refs, and row hashes; a best-chunker label or final table alone is not enough.",
      "SkillBench-style adversarial skill regression claims require source reference, skill manifest, baseline-agent config, with-skill agent config, eval-suite and eval-case manifests, deterministic grader, static-analysis config, security-scan report, baseline/with-skill outputs, rerun output, result report, replay command, release-gate receipt, expected and actual decisions, deterministic seed, eval-case counts, correctness/security/completeness/robustness metrics, with-skill score, score delta, thresholds, signed evidence refs, and row hashes; a skill label, final score, self-grade, or demo transcript alone is not enough.",
      "Local-system monitor live drift claims require monitor profile, device profile, hardware scanner, process catalog, sensor log, alert receipt, workload context, thermal-baseline deviation, voltage SPC anomaly, process identity, ghost-driver handling, proactive alert, and local-only privacy evidence; generic health score alone is not enough.",
      "AI-coding landscape or leaderboard question-explainability claims require source category, dataset refs and SHA-256 hashes, update cadence, freshness, cohort refs, benchmark or tool/model refs, accepted evidence, rejected-evidence reasons, and a repair hint; a fast-moving category listing alone is not enough.",
      "Benchmark-submission question-explainability claims require benchmark/source identity, submission id/version, agent version, submission timestamp, task id/category/status, grading type, overall and category scores, speed and cost metrics where claimed, leaderboard metric views, submission metadata hash, task-breakdown hash, leaderboard snapshot hash, criterion-level scores, accepted evidence, rejected-evidence reasons, repair hint, and row-hash evidence; an aggregate submission score alone is not enough.",
      "Test-suite question-explainability claims require suite id, language, framework, adapter, dataset ref/hash, test-case hash, evaluator ids/config, judge model where claimed, experiment run/result/export artifacts, CI run/config, agent trace and tool-call validation when agent behavior is claimed, pass-rate and score thresholds, cost/latency/tokens where claimed, accepted evidence, rejected-evidence reasons, repair hint, and row-hash evidence; a console output, passing unit test, aggregate pass rate, or local CI log alone is not enough.",
      "SRE incident-triage question-explainability claims require OpenEnv config, scenario manifest, incident report, raw log bundle, metric snapshot, user report, action payload, deterministic grader config, feedback, reward, root-cause, red-herring, ordered-remediation, step-bound, accepted evidence, rejected-evidence, repair hint, and row-hash evidence; a final incident score alone is not enough.",
      "Professional-task question-explainability claims require benchmark/source identity, task id, scenario id, industry category, professional domain, dataset/scenario/world-model/tool-schema/agent/fault/verifier/trajectory/result/replay/debug hashes, environment mode, fault mode, verifier-vote threshold, pass-rate threshold, robustness threshold, trajectory-step bound, accepted evidence, rejected-evidence reasons, repair hint, and row-hash evidence; a professional-domain label, aggregate pass rate, single trajectory, or verifier comment alone is not enough.",
      "Azure agent lab or workshop replay claims require lab and module id, workshop guide and notebook hashes, Azure service config hashes, AI project/search/RAG/tool/evaluator config, cloud-run artifact, credential and managed-identity scope proof, replay command, deterministic seed, scenario count, score, and groundedness thresholds; notebook completion or a generic RAG score alone is not enough.",
      "Environment-generation replay claims require toolkit version, dataset id/version hash, generated task config, task schema, generation prompt, fixture manifest, mock-service catalog and state, audit log, trajectory capture, verification config, scoring rubric, safety-check config, harness tier/id, adapter config, Docker or agent-loop proof, replay command, deterministic seed, service/task/check counts, component scores, final score, and safety-gate evidence; a generated task or benchmark score alone is not enough.",
      "Deep-research replay claims require framework version, research task id, workflow/LLM/search/local-runtime configs, knowledge-base/tool-description/interaction-history context, task plan, progressive-search trace, tool-call trace, knowledge extraction, cross-evaluation trace, iteration log, final report and outline hashes, lockfile, replay command, deterministic seed, search/source counts, cross-evaluation pass rate, hallucination-check pass rate, final report score, and thresholds; a generated report alone is not enough.",
      "Observability/SRE live drift claims require task-spec and generated-task hashes, Grafana stack/environment and Docker config hashes, scenario-clock hash and alignment, trajectory, command stdout, grading details, reward, result JSON, HTML report artifacts, deterministic check pass rate, rubric score, resolution score, incident context, task type, data source, and tool mode evidence; a generic incident score alone is not enough.",
      "Web-operator live drift claims require benchmark, dataset, task, provider, agent-version, browser-mode, judge model, run-config, replay artifact, result JSON, screenshot, trajectory, self-report, independent evaluation, retry reliability, step-limit, task-time, evidence refs, and signed evidence; an agent self-report or single web-task success alone is not enough.",
      "Navi-Bench-style real-website web-agent live-drift claims require benchmark id, source/repository/license refs, Hugging Face dataset ref, task id, website-domain taxonomy, task config, evaluator config, agent config, browser mode and provider proof, baseline/live result hashes, saved trajectory, visualization artifact, screenshot trace, alert receipt, task finished/crashed/success flags, lower-bound score, excluding-crashed score, upper-bound score, step limits, evidence coverage, baseline/live distributions, thresholds, signed evidence refs, and row hashes; a Navi-Bench label, README screenshot, dataset card, local demo, aggregate score, task URL, browser label, model/provider label, or source metadata alone is not enough.",
      "Legal-agent live drift claims require benchmark, dataset, corpus, task, task type, difficulty, planning-tree, tool-manifest, tool-run trace, intermediate-step annotation, process trace, output, reference answer, evaluation report, final-success, process-rate, tool-use accuracy, citation coverage, token-cost where claimed, evidence refs, and signed evidence; final success rate alone is not enough.",
      "ResearchGym-style research-run live drift claims require benchmark id, paper/source reference, task id/domain, task/pruned-repo/dataset/evaluation-harness/baseline/grading/withheld-solution/run/runtime/agent-adapter/workspace/transcript/cost/status/plan/inspection/violation artifacts, baseline and candidate score improvement, subtask completion, experiment and async-job counts, runtime and API budget controls, inspection pass, budget-overrun and violation rates, task-domain and runtime-context distributions, evidence refs, signed evidence, and row hashes; a local research run, aggregate score, README result, task family, or transcript alone is not enough.",
      "OSUniverse-style GUI-navigation live drift claims require benchmark id, source/repository/license/paper refs, testcase id, task category, complexity level, testcase manifest, agent config, runner config, runtime and runtime-image proof when applicable, dependency lock, validator config, validation report, result artifact, viewer artifact, trajectory, screenshot trace, task success, automated-validation pass, validation error rate, action-step count, max-step threshold, category/level/runtime-context distributions, evidence refs, signed evidence, and row hashes; a GUI-agent label, aggregate score, local run output, README result, viewer screenshot, copied testcase, task category, or single trajectory alone is not enough.",
      "Rag-Eval-flow-style local RAG replay claims require source/repository/license refs, pipeline config, data-source manifest, model config, judge config, metric definition, prompt-template, eval-pack manifest, fixture, replay command, result manifest, score-delta report, CI receipt, pipeline id, data format, model backend, judge backend, metric ids, sample size, deterministic seed, baseline/candidate scores, score delta, replay pass rate, metric coverage, thresholds, signed evidence refs, and row hashes; a local RAG eval label, config filename, aggregate score, README result, copied prompt, metric name, model label, judge label, local run output, or copied dataset row alone is not enough.",
      "rag-eval-style document QA replay claims require source/repository/license refs, input-document manifests, processor config, prompt template, generator config, generated QA dataset, endpoint config, endpoint-response trace, ranking report, evaluation run, replay command, CI receipt, dataset id, data formats, endpoint modes, metric ids, question and endpoint counts, deterministic seed, baseline/candidate scores, score delta, replay pass rate, endpoint response coverage, thresholds, signed evidence refs, and row hashes; a rag-eval label, repository metadata, README workflow, copied generated QA pair, output JSON, endpoint URL, model/provider label, local run log, ranking report, or source metadata alone is not enough.",
      "Encourage-style modular RAG replay claims require source/repository/license refs, package and dependency manifests, RAG method, inference-runner, template, vector DB, dataset, query, reference answer, metric suite, MLflow run, result manifest, replay command, CI receipt, method/backend/vector-DB/metric ids, document and question counts, deterministic seed, baseline/candidate scores, score delta, replay pass rate, metric coverage, thresholds, signed evidence refs, and row hashes; an Encourage label, repository metadata, package version, dependency list, README feature claim, local run, vector DB label, MLflow screenshot, aggregate metric, or source metadata alone is not enough.",
      "MiRAGE-style multimodal multihop RAG dataset-generation replay claims require source/repository/license refs, input-document manifests, semantic chunks, multihop context graph, domain/expert role manifest, generate-select-verify-correct trace, multimodal carrier manifest, backend/embedding/reranker configs, token-usage trace, checkpoint/resume proof, deduplication report, evaluation report, replay command, output dataset, visualization artifact, dataset/backend/modality/stage ids, question counts, deterministic seed, quality score delta, replay pass rate, metric coverage, thresholds, signed evidence refs, and row hashes; a MiRAGE label, README feature list, local run output, copied generated QA pair, output JSON, visualization file, or aggregate dataset quality claim alone is not enough.",
      "A2A-NT-style agent-to-agent negotiation methodology claims require methodology id/version/hash, benchmark id/version, repository snapshot, paper/source reference, product-catalog manifest, buyer and seller role policies, buyer/seller/summary model routes, budget scenarios, wholesale constraints, turn limits, conversation trace manifest, seller-offer extraction config, deal-outcome judge config, anomaly taxonomy, model-behavior/diagnostic/system-data flag manifests, provider usage or cost manifest, run-session manifest, clean-deal exclusion policy, report or badge migration guidance, signed evidence refs, and row hashes; a buyer/seller transcript, accepted-deal rate, product list, leaderboard, local run, README result, copied conversation, or A2A-NT label alone is not enough.",
      "Static offline benchmark receipts and live dynamic execution receipts are not interchangeable unless versioned corpus, harness, model-pool, tier-policy, verification, scoring, and cost-accounting context is disclosed.",
      "AICrypto-style cryptography benchmark claims require paper/arXiv version, repository snapshot, dataset release and license refs, task-family manifests, MCQ answer-key/rubric proof, CTF challenge manifest, sandbox/toolchain and agent-framework proof, proof-problem manifest, proof rubric/reference-solution proof, human expert baseline reference, model/provider config, run outputs, scoring formula, per-family counts, contamination or recency policy, thresholds, signed evidence refs, and row hashes; an aggregate leaderboard score, CTF solve count, proof score, MCQ accuracy, local run output, website figure, or copied task example alone is not enough.",
      "GeoBenchX-style geospatial provider-drift claims require benchmark identity, task-set hashes, dataset snapshots, tool registries, reference-solution manifests, tool-call trace exports, judge panel/config proof, human-calibration evidence, result reports, token-cost reports, complexity groups, solvable and unsolvable task counts, tool counts, max-iteration thresholds, signed evidence refs, and row hashes; notebooks, generated maps, HTML transcripts, aggregate scores, model rankings, README results, local run logs, copied task rows, or copied datasets alone are not enough.",
      "AIAnytime-style LLM/RAG eval-suite live drift claims require eval-suite and run ids, candidate/reference manifests, semantic-similarity metric, bias metric, hallucination or faithfulness metric, judge config, report artifact, baseline/live distributions, thresholds, signed evidence refs, and row hashes; notebooks, copied examples, local metric scripts, aggregate scores, model labels, or README claims alone are not enough.",
      "HedraRAG artifact-eval live-drift claims require artifact id, source/repository snapshot, declared-license proof or absent/unknown license-review proof, paper and artifact README refs, workflow/framework/runtime taxonomy, dataset/corpus/index/dependency/environment/run-script/result/plot/baseline/live/alert/resource/GPU hashes, latency, throughput, memory, replay pass rate, evidence coverage, baseline/live distributions, thresholds, signed evidence refs, and row hashes; a repository title, README result, paper abstract, figure label, copied script name, copied CSV row, local run output, plot, aggregate latency, framework label, runtime label, or source metadata alone is not enough.",
      "Agent-eval-harness live-drift claims require run/source/repository/license proof, trace schema/collector/writer proof, adapter config, framework/trace-mode/metric-context taxonomy, trace/dataset/task/tool manifests, hallucination/pricing/metrics configs, baseline/live run hashes, comparison report, dashboard snapshot, local-storage policy, alert policy, reproducibility command, tool-success, hallucination, latency, cost, trace coverage, evidence coverage, baseline/live distributions, thresholds, signed evidence refs, and row hashes; a repository title, README feature list, copied example, copied config, dashboard screenshot, local JSON trace, CLI output, framework label, aggregate metric, or source metadata alone is not enough.",
      "Strands benchmark-harness live-drift claims require source/repository/license refs, agent-package, harness-config, model-route, prompt-template, benchmark-suite, runtime, task-family, task-manifest, dataset-snapshot, Docker-image, environment-setup, tool-policy, trajectory, patch-artifact, test-report, result/upload manifests, safety-isolation, baseline/live run, alert-policy, task-success, patch-apply, test-pass, trajectory/evidence coverage, latency/cost, baseline/live distributions, thresholds, signed evidence refs, and row hashes; a Strands label, repository metadata, local run, benchmark name, shell transcript, copied prompt/config, aggregate score, screenshot, leaderboard/result summary, or source metadata alone is not enough.",
      "Recovery-Bench-style live-drift claims require failed initial traces, replay command logs, fresh replay environments, corrupted-environment hashes, recovery agent/model/run configs, declared message modes, transcripts, result/score reports, recovery success/reward metrics, signed evidence refs, and row hashes; aggregate recovery success rates, task labels, replay logs, README workflow, or model names alone are not enough.",
      "SLDBench-style scaling-law discovery live drift claims require benchmark id, paper/source reference, eval-run id, task id, task type, dataset manifest, train/test split hashes, source-experiment manifest, task/evolution/evaluator configs, model-route hash, program artifact, checkpoint trace, result report, formula family, extrapolation regime, R2, NMSE, NMAE, baseline/live distributions, thresholds, signed evidence refs, and row hashes; aggregate R2, a task label, local script output, result folder, README result, copied config, or model label alone is not enough.",
      "Scenario-simulation replay claims require benchmark id/version, repository and source references, scenario project, scene and role definitions, human participant policy, agent roster, LLM agent config, evaluator config, action schema, task dataset, web UI build, server config, container image, persistence store, checkpoint manifest, run config, event log, action trace, evaluation report, visualization artifact, replay command, deterministic seed, agent/evaluation/visualization modes, scenario/agent/action/evaluated-action counts, action evaluation coverage, task success, action score, replay pass rate, score delta, thresholds, persistence flag, checkpoint resume proof, signed evidence refs, and row hashes; a scenario label, local server demo, UI screenshot, transcript, participant roster, aggregate task score, README example, or copied scenario row alone is not enough.",
      "Warehouse-native LLM evaluation replay claims require benchmark id/version, repository and source references, dbt project and package lock manifests, warehouse adapter config, warehouse AI function manifest, model manifest, capture config, prompt/input/output schema, baseline dataset, baseline version manifest, evaluation criteria, judge model config, sampling and threshold configs, raw capture, raw baseline, judge evaluation, eval score, performance summary, drift detection, alert, compiled SQL, run result, data-egress policy, replay command, deterministic seed, warehouse, evaluation mode, model/capture/baseline/evaluated/criteria counts, capture coverage, judge score, pass rate, drift alert rate, replay pass rate, score delta, thresholds, data-egress-blocked proof, signed evidence refs, and row hashes; a warehouse label, dashboard result, local dbt run log, SQL snippet, config snippet, README example, prompt/input/output sample, aggregate score, or copied table row alone is not enough.",
      "LLM workflow observability methodology claims require methodology id, methodology version, methodology hash, trace schema version, SDK/instrumentation manifest, workflow graph or span-model proof, telemetry sampling and redaction policies, prompt and model registry snapshots, evaluation template, judge/rubric config, development test-window id, production monitoring-window id, frontend analytics schema, session replay artifact manifest, user-feedback collection schema, data-security boundary, retention policy, alert threshold config, report or badge migration guidance, signed evidence refs, and row hashes; a dashboard screenshot, trace id, SDK hook, visual debugger view, local telemetry run, aggregate evaluation score, frontend analytics event, user-feedback widget, or README example alone is not enough.",
      "Opik-style provider observability pipeline drift claims require evaluator framework id/version, provider route, metric suite, metric ids/count, evaluator config, generated test data, verdict aggregation, dashboard/report artifact, pipeline orchestrator/run, experiment tracker/run, observability project, datastore, retrieval index, content dataset, summary artifact, QA dataset, trace export, metric report, pipeline config, signed evidence refs, and row hashes; a dashboard screenshot, trace id, metric name list, local pipeline run, provider/model label, or aggregate score alone is not enough.",
      "Ollama metrics live-drift claims require sidecar id, source/repository/license refs, proxy and Ollama host configs, Prometheus scrape config, metrics endpoint snapshot, baseline/live snapshots, alert policy, model id, deployment mode, prompt and generated token counts, request-duration p95, time per token, loaded-model count/status, model RAM, request error rate, model/deployment/proxy-context distributions, thresholds, signed evidence refs, and row hashes; a dashboard screenshot, raw metrics endpoint, model label, token count, latency number, README example, or local log alone is not enough.",
      "Provider evaluator framework drift claims require evaluator framework id/version, provider route, metric suite id, metric ids/count, evaluator config hash, generated test-data hash, verdict aggregation and aggregation-config hash, dashboard/report artifact hash, provider/model versions, canary results, drift statistic, alert or waiver, signed evidence refs, and row hashes; a provider/model label, evaluator-library name, dashboard screenshot, or aggregate score alone is not enough.",
      "ChipBenchmark-style hardware benchmark metric-validity claims require source repository snapshot, no-license-boundary proof, benchmark manifests, hardware profiles, model families, precision modes, environment setup, benchmark runner, serving backend, result datasets, synced frontend datasets, pricing datasets, throughput, latency, cost, regression thresholds, metric owner, sample-size, confidence-interval, signed evidence refs, and row hashes; a repository label, README quickstart, local frontend run, copied benchmark row, hardware/model/precision label, aggregate chart, pricing number, or source metadata alone is not enough.",
      "Hermes Bench-style local benchmark metric-validity claims require source repository and license refs, live default-branch snapshot, README blob, build spec, backend runner, judge calibration, task registry, model/server config, adapter coverage, result schema, frontend result-review surface, backend regression, frontend regression, Docker runtime, metric owner, sample-size, confidence-interval, signed evidence refs, artifact hashes, and row hashes; a Hermes Bench label, repository metadata, README claim, local UI screenshot, benchmark-runner filename, judge filename, task registry name, adapter list, copied result row, frontend component name, Docker command, aggregate benchmark score, or source metadata alone is not enough.",
      "CooperBench-style cooperative coding benchmark metric-validity claims require source repository and no-license-boundary refs, live default-branch snapshot, release tag, README/changelog, dataset/task manifest, feature-conflict manifest, runner/coop harness, eval backend, team harness, agent-adapter roster, CI workflow, package lock, public report, metric owner, sample-size, confidence-interval, signed evidence refs, artifact hashes, and row hashes; a CooperBench label, repository metadata, README claim, release tag, local run, task folder name, feature patch, agent adapter name, team-harness file name, public report page, aggregate cooperation score, conflict-resolution rate, or source metadata alone is not enough.",
      "CoderCup-style continuous coding-agent benchmark metric-validity claims require source/license/homepage refs, live default-branch snapshot, README/contributing, CI workflow, package lock, task spec, test suite and suite indexes, runner contract, score ledger, live artifact, methodology/reference pages, cost accounting, metric owner, sample-size, confidence-interval, inter-rater agreement, test-retest reliability, regression pass rate, signed evidence refs, artifact hashes, and row hashes; a CoderCup label, repository metadata, CI badge, live leaderboard screenshot, copied score row, composite score, vendor rank, cost total, or source metadata alone is not enough.",
      "Agentic Graph RAG metric-validity claims require source repository and no-license-boundary refs, live default-branch snapshot, README manifest, graph workflow and orchestrator manifests, RAG pipeline manifest, database and vector-store manifests, evaluation metric manifest, experiment-tracking manifest, UI question-surface manifest, dependency lock manifest, metric owner, sample-size, confidence-interval, signed evidence refs, artifact hashes, and row hashes; an Agentic Graph RAG label, repository metadata, README claim, graph filename, Neo4j mention, vector-store mention, evaluation file, experiment tracker filename, Streamlit screenshot, predefined question, dependency file, aggregate retrieval score, or source metadata alone is not enough.",
      "Awesome-Agent-Memory-style live-drift claims require source repository snapshot, no-license-boundary proof, README blob, catalog snapshot, entry source, taxonomy, benchmark manifest, evaluation dataset, baseline/live results, drift statistic, alert receipt, retrieval/persistence/forgetting/hallucination metrics, evidence refs, signed evidence refs, and row hashes; a catalog label, repository metadata, star count, README section, copied list entry, project or paper title, link list, aggregate memory score, or source metadata alone is not enough.",
      "Agent Reading Test-style live-drift claims require source repository snapshot, license reference, homepage reference, README blob, answer key, task manifest, score form, live-site snapshot, raw content capture, expected/reported canary proof, baseline/live results, drift statistic, alert receipt, reading score, canary recall, task completion, evidence refs, signed evidence refs, and row hashes; a benchmark label, repository metadata, homepage screenshot, README task list, copied test page, copied canary token, answer-key excerpt, scoring-form screenshot, self-reported score, raw HTML/markdown snippet, or source metadata alone is not enough.",
      "LLM Fighter-style live-drift claims require source repository snapshot, MIT license reference, homepage reference, README blob, API and UI tree hashes, game-result endpoint, persistence schema, game engine, game runner, LLM adapter, YAML export, game UI component, baseline/live result, drift statistic, alert receipt, combat log, exported log, win-rate, game score, action-validity, combat-stability, arena/ruleset/model-roster context, evidence refs, signed evidence refs, and row hashes; an LLM Fighter label, repository metadata, README claim, homepage screenshot, game UI screenshot, copied battle log, copied YAML export, aggregate win rate, aggregate game score, model/provider label, local game run, or source metadata alone is not enough.",
      "Darwin Godel Machine-style live-drift claims require source repository snapshot, no-license-boundary proof, README, security, CI, controller, archive, self-modification, evaluation harness, scorer, sandbox, live-run config, live-proof config, model matrix, benchmark manifest, score-movement manifest, verifiers, baseline/live results, drift statistic, alert receipt, lineage, provider/model route, score movement, pass rate, mutation acceptance, regression failure rate, context distributions, evidence refs, signed evidence refs, and row hashes; a DGM label, repository metadata, research-paper title, local evolution run, copied benchmark config, copied agent code, copied archive row, aggregate candidate score, aggregate pass rate, model label, local sandbox output, or source metadata alone is not enough.",
      "Effect-autoagent-style replay-corpus claims require source repository snapshot, MIT license proof, default branch proof, README, package manifest, lockfile, CI workflow, benchmark runner, harness spec, task spec, metrics, experiment log, agent blueprint, runner, run result, trajectory converter, container manager, task manifest, instruction, fixture test, Docker environment, replay command, fixed seed, baseline/candidate results, score delta, replay pass rate, CI receipt, evidence refs, signed evidence refs, and row hashes; an effect-autoagent label, repository metadata, README heading, package name, task directory, benchmark runner filename, Dockerfile name, local command, example agent, provider label, aggregate score, CI badge, or source metadata alone is not enough.",
      "Falcon Evaluate-style provider-drift claims require source repository snapshot, MIT license proof, default branch proof, release tag, package manifest, lockfile, requirements, README, docs index, CI workflow, evaluation/context/fairness/reliability/security/ethics/results/plot/user-analytics modules, validation data schema, metric-family and metric ids, metric count, provider route, baseline and candidate canary results, drift statistic, alert or waiver receipt, evidence refs, signed evidence refs, and row hashes; a Falcon Evaluate label, repository metadata, release tag, package name, README summary, docs page, workflow filename, module filename, metric-family name, provider label, aggregate score, local run output, CI badge, or source metadata alone is not enough.",
      "AgentDefense-Bench-style provider-drift claims require source repository snapshot, Apache-2.0 license proof, default branch proof, README, CHECKSUMS, CITATION, requirements, MCP server manifest, attack-bank and benchmark-suite hashes, MCP-specific suite, defense server, defense policy, run config, provider route, baseline and candidate canary results, drift statistic, alert or waiver receipt, replay command, CI receipt, MCP server count, attack suite ids, defense coverage, prompt-injection block rate, jailbreak block rate, tool-poisoning block rate, benign pass rate, thresholds, evidence refs, signed evidence refs, and row hashes; an AgentDefense-Bench label, source metadata, copied benchmark row, copied attack JSON, local block-rate aggregate, MCP server count, model label, defense-server screenshot, or CI badge alone is not enough.",
      "fore-style public methodology versioning claims require methodology id/version/hash, methodology changelog hash, deprecation notice hash, migration guidance hash, source repository snapshot, archived-state proof, Apache-2.0/default-branch proof, HEAD/tree refs, README/LICENSE/pyproject refs, package name and version, fore and foresight tree hashes, API schema/client/schema/client-test/workflow refs, eval-pack and dataset hashes, baseline/candidate results, regression threshold, CI receipt, no-source-copy proof, signed evidence refs, and row hashes; a fore label, repository metadata, README summary, package version, archived repository notice, API schema filename, client filename, local client output, metric name, badge URL, aggregate score, provider label, or source metadata alone is not enough.",
      "HeurekaBench-style scientific co-scientist replay claims require source repository snapshot, no-root-license boundary proof, default branch proof, README/project/arXiv refs, benchmark JSON hashes, single-cell dataset manifest and checksum refs, dataset no-copy proof, benchmark validation tree, paper/PDF manifest, insight/question/answer manifests, agent-output extraction hash, evaluation script hash, G-Eval prompt refs, baseline runner refs, Biomni/CellVoyager adapter refs, result manifest, replay command, CI receipt, question-type and tool-use coverage, deterministic seed, evaluator agreement, replay pass rate, score delta thresholds, signed evidence refs, and row hashes; a HeurekaBench label, repository metadata, README summary, official-site badge, arXiv badge, benchmark JSON filename, dataset folder name, Google Drive dataset link, local benchmark command, Biomni or CellVoyager name, prompt filename, PDF count, CSV count, aggregate score, model/provider label, answer file, evaluator output, or source metadata alone is not enough.",
      "RAG_Contradiction_Detector-style biomedical RAG contradiction replay claims require source repository snapshot, no-root-license boundary proof, default branch proof, README/requirements/Makefile/CI refs, app/source/evaluation tree refs, SciFact fixture manifest, eval and bootstrap report hashes, quality-gate report hash, heuristic and torch verifier hashes, PubMed ingestion proof, retriever and vector-store proof, observability/Prometheus metrics proof, Docker and k8s refs, replay command, deterministic seed, retrieval and verdict metrics, score-delta thresholds, no-source-copy proof, no-PubMed-abstract-copy proof, signed evidence refs, and row hashes; a RAG_Contradiction_Detector label, repository metadata, README summary, demo GIF, PubMed ID pair, copied abstract, copied SciFact row, local Streamlit output, Makefile target, eval report excerpt, quality-gate status, aggregate macro F1, Recall@k, MRR, Docker/Kubernetes manifest name, Prometheus metric name, model/provider label, or source metadata alone is not enough.",
      "SkillMatch-style resume live-drift claims require source repository snapshot, no-license boundary proof, default branch proof, README/Docker/frontend/old-version refs, analyzer and PDF extractor hashes, model/provider manifest, resume task taxonomy, RAG input corpus manifest, baseline/live sample manifests, drift statistic, alert receipt, replay command, CI receipt, privacy boundary, no-source-copy proof, no-resume-copy proof, signed evidence refs, and row hashes; a SkillMatch label, repository metadata, README summary, PDF upload demo, frontend screenshot, copied resume text, copied job description, dependency name, notebook filename, aggregate match score, model/provider label, or source metadata alone is not enough.",
      "Decibench-style voice live-drift claims require source repository snapshot, license and GitHub NOASSERTION boundary proof, default branch proof, release, README, pyproject, CI, CLI, MCP, RAG, evaluator, audio tree hash, scenario-suite, bridge, dashboard, docs, deterministic/semantic/RAG evaluation manifests, baseline/live sample manifests, drift statistic, alert receipt, replay command, CI receipt, privacy boundary, no-source-copy proof, no-transcript-copy proof, signed evidence refs, and row hashes; a Decibench label, repository metadata, README summary, homepage link, release tag, CLI name, MCP label, RAG label, evaluator filename, audio filename, scenario filename, dashboard screenshot, copied transcript, copied audio fixture, aggregate score, model/provider label, or source metadata alone is not enough.",
      "Evidra-style provider-drift claims require source repository snapshot, Apache-2.0 license proof, default branch proof, release tag, README, go.mod, CI and release workflows, Dockerfiles, CLI tree, MCP tree, API command, evidence signer/package, evlock, execcontract, export, MCP server, proxy, lifecycle service, pipeline bridge, score compare, tests/docs/signal-validation refs, prescribe/report/record/validate/scorecard command hashes, prescribe/report protocol proof, provider route, baseline and live sample manifests, canary results, drift statistic, alert or waiver receipt, replay command, CI receipt, no-source-copy proof, signed evidence-chain proof, evidence refs, signed evidence refs, and row hashes; an Evidra label, repository metadata, README summary, protocol name, local report, scorecard output, evidence entry, provider label, aggregate reliability score, CI badge, or source metadata alone is not enough.",
      "RAViG-Bench-style metric-validity claims require source repository snapshot, Apache-2.0 license proof, default branch proof, README and legal refs, dependency and config refs, content/design/execution evaluation refs, function scoring refs, dataset/test-case/model-result refs, visually-rich generation taxonomy, RAG retrieval context, multi-modal evaluator ids, screenshot and run-script refs, metric definitions, CI reporter, validation pass rate, dataset case count, visual-design check count, evaluator count, metric owner, sample size, confidence interval, no-source-copy proof, evidence refs, signed evidence refs, report artifact hashes, and row hashes; a RAViG-Bench label, source metadata, README summary, prompt filename, copied dataset row, copied model result, screenshot, evaluator filename, aggregate score, or CI badge alone is not enough.",
      "RAIL Score-style live-drift claims require source repository snapshot, MIT license proof, GitHub release, PyPI package/wheel/sdist hashes, README, pyproject, requirements, CI/publish workflows, client/model/policy/session/middleware proof, telemetry proof, compliance proof, agent proof, integration proof, baseline/live results, drift statistic, alert receipt, evaluation dimension, guardrail mode, compliance framework, model provider, score, guardrail pass rate, safe-regeneration rate, tool-call accuracy, compliance pass rate, telemetry coverage, prompt-injection block rate, context distributions, evidence refs, signed evidence refs, and row hashes; a RAIL Score label, source metadata, package name, release tag, README summary, SDK class name, local score output, aggregate responsible-AI score, model label, or CI badge alone is not enough.",
      "Scorable SDK-style Studio drilldown claims require source repository snapshot, Apache-2.0 license proof, default branch, commit/tree refs, README, Python package/OpenAPI/client/execution-log/evaluator API hashes, CLI package/lock/evaluator/judge/execution-log/OTEL/file-upload hashes, TypeScript package/lock/source tree hashes, npm package refs and integrity strings, Studio route, source artifact links, trace/receipt/policy/source-artifact preview hashes, empty/error-state hashes, evidence preview count, source artifact link count, evidence refs, signed evidence refs, rejected evidence refs, repair hints, and row hashes; a Scorable SDK label, source metadata, package name, CLI command, execution-log list, OTEL trace list, Studio screenshot, UI route, or local evaluator output alone is not enough.",
      "Agentest-style scenario-test metric-validity claims require source/repository/license refs, agent endpoint contract, scenario, simulated-user persona, goal/knowledge, tool mock, scripted-turn, trajectory-assertion, LLM-judge metric, comparison-run, CI-reporter, result artifact, owner, sample-size, confidence-interval, signed evidence refs, and row hashes; source metadata, labels, README examples, copied scenarios, config snippets, local run output, screenshots, aggregate pass rate, tool-mock transcript, or judge score alone is not enough.",
      "Awesome AI Pentest-style curated-index claims require live source repository snapshot, default-branch and README blob refs, no-root-license boundary proof, no-source-copy proof, and underlying benchmark-specific manifests, hashes, execution traces, scoring configs, CI receipts, owners, sample sizes, confidence intervals, signed evidence refs, and row hashes through pentest_benchmark_coverage before Score, Shield, or Watch metric-validity claims; repository metadata, README benchmark lists, paper-result percentages, tool names, or source-index labels alone are discovery metadata and fail closed.",
      "Red-team/offensive-security benchmark regression claims require benchmark id/version, question-set hash, reference-answer manifest hash, scoring config hash, scoring modes, provider backend, model config hash, result export hashes, rerun output hash, release gate receipt, question count, pass/refusal/hallucination/semantic scores where claimed, judge rubric for LLM-judge scoring, prompt-optimization config/count where claimed, signed evidence refs, and row hashes; raw prompts, exploit content, reference answers, or final percentage alone is not enough."
    ],
    changelog: [
      {
        version: AMC_PUBLIC_METHODOLOGY_VERSION,
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Open Models RAG question-explainability receipts and clarifies Awesome AI Pentest-style curated-index handling: source indexes can seed Score/Shield/Watch security metric review, but pentest metric-validity proof remains bound to underlying benchmark manifests, execution/scoring artifacts, CI receipts, signed evidence, and row hashes.",
        migration: "Reports generated under 2026.06.19-r209 should be regenerated before using bbenz/gen-ai-with-open-models-style, Open Models, Java local inference, LangChain4j, Ollama, RAG pipeline, RAG evaluation, question score explainability, insidetrust/awesome-ai-pentest-style curated pentest indexes, or pentest benchmark metric-validity claims as external evidence."
      },
      {
        version: "2026.06.19-r209",
        date: "2026-06-19",
        summary: "Adds RAViG-Bench metric-validity receipts so source/repository/license/default-branch, README/legal/dependency/config refs, content/design/execution/function-scoring refs, dataset/test-case/model-result refs, visually-rich generation taxonomy, RAG retrieval context, multi-modal evaluator ids, screenshot/run-script refs, CI, owner, confidence interval, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r208 should be regenerated before using antgroup/ravig-bench-style, RAViG-Bench, retrieval-augmented visually-rich generation, multi-modal automated evaluation, or metric-validity claims as external evidence."
      },
      {
        version: "2026.06.19-r208",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Evidra provider-drift receipts so source/repository/license/default-branch/release, README/go.mod/workflow/Docker/CLI/MCP/API refs, evidence-chain package refs, lifecycle/pipeline/score/test/docs refs, prescribe/report protocol proof, provider route, canary results, baseline/live sample manifests, drift statistic, alert or waiver, replay command, CI receipt, no-source-copy proof, signed evidence-chain proof, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r207 should be regenerated before using vitas/evidra-style, Evidra, DevOps MCP server, prescribe/report protocol, signed evidence chain, reliability scorecard, provider/model canary, or LLMOps provider-drift claims as external evidence."
      },
      {
        version: "2026.06.19-r207",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Decibench voice live-drift receipts so source/default-branch, license and GitHub NOASSERTION boundary, release, README/pyproject/CI/CLI/MCP/RAG/evaluator/audio/scenario refs, bridge/dashboard/docs refs, deterministic/semantic/RAG evaluation manifests, baseline/live sample manifests, drift statistics, alert receipts, privacy boundary, no-source-copy proof, no-transcript-copy proof, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r206 should be regenerated before using unforkopensource-org/decibench-style, Decibench, voice AI testing, voice-agent benchmark, deterministic evaluation, semantic evaluation, RAG augmented evaluation, CLI/MCP voice-agent evaluation, or voice live-drift claims as external evidence."
      },
      {
        version: "2026.06.19-r206",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds SkillMatch resume live-drift receipts so source/default-branch, no-license boundary, README/Docker/frontend/old-version refs, analyzer and PDF extractor refs, model/provider context, resume task taxonomy, RAG input corpus, baseline/live sample manifests, drift statistics, alert receipts, privacy boundary, no-source-copy proof, no-resume-copy proof, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r205 should be regenerated before using SubashSK777/SkillMatch-AI_Resume_Analyzer-style, SkillMatch, AI resume analyzer, PDF resume parser, job-match analysis, strengths/weaknesses analysis, personalized improvement suggestions, RAG resume analysis, or live resume-agent drift claims as external evidence."
      },
      {
        version: "2026.06.19-r205",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds RAG contradiction detector replay receipts so source/default-branch, no-root-license boundary, README/requirements/Makefile/CI refs, app/source/evaluation trees, SciFact fixture manifests, eval reports, quality-gate proof, heuristic and torch verifier refs, PubMed ingestion, retrieval/vector-store proof, Docker/k8s/Prometheus refs, replay command, deterministic seed, regression thresholds, no-source-copy proof, no-PubMed-abstract-copy proof, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r204 should be regenerated before using robhorvat/RAG_Contradiction_Detector-style, biomedical RAG contradiction, PubMed contradiction triage, SciFact retrieval/verdict, heuristic verifier, torch verifier, quality-gate, Docker/k8s, Prometheus, or replay-corpus claims as external evidence."
      },
      {
        version: "2026.06.19-r204",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds HeurekaBench scientific co-scientist replay receipts so source/default-branch, no-root-license boundary, README/project/arXiv refs, benchmark JSONs, dataset refs and no-copy proof, benchmark validation tree, paper/PDF manifest, insight/question/answer manifests, extraction/evaluation scripts, G-Eval prompts, baseline runners, Biomni/CellVoyager adapter refs, result manifests, replay command, CI receipt, evaluator agreement, replay pass rate, regression thresholds, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r203 should be regenerated before using mlbio-epfl/HeurekaBench-style, HeurekaBench, sc-HeurekaBench, scientific co-scientist, single-cell benchmark, Biomni, CellVoyager, MCQ/open-ended scientific question, or benchmark replay claims as external evidence."
      },
      {
        version: "2026.06.19-r203",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds fore public methodology versioning receipts so source/license/default-branch, archived repository status, README/LICENSE/pyproject, package version, fore/foresight API schema, client, schema, client-test, workflow, methodology id/version/hash, changelog, deprecation notice, migration guidance, eval-pack, dataset, regression thresholds, CI receipt, no-source-copy proof, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r202 should be regenerated before using foreai-co/fore-style, fore, Fore Foresight client, archived evaluation-client, public methodology versioning, changelog, deprecation, migration, or badge comparability claims as external evidence."
      },
      {
        version: "2026.06.19-r202",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds eval-ai-library question-explainability receipts so source/license/default-branch, README/LICENSE/NOTICE/pyproject/requirements, eval_lib metric, agent-metric, security-metric, tracing/dashboard/schema refs, eval-pack, dataset, question trace, evaluator config, metric result, score breakdown, rejected-evidence reasons, repair hints, regression thresholds, CI receipt, no-source-copy proof, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r201 should be regenerated before using firstlinesoftware/eval-ai-library-style, eval-ai-library, RAG metric, agent metric, security metric, accepted/rejected evidence, repair-hint, or question score explainability claims as external evidence."
      },
      {
        version: "2026.06.19-r201",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds paper-read-skill live-drift receipts so source/no-license/default-branch, README, llms manifest, skills tree, paper-analysis and blog-reading skills, prompt catalogs, route policy, research-task manifest, evaluation rubric, baseline/live sample, drift statistic, alert receipt, replay command, CI receipt, no-prompt-copy proof, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r200 should be regenerated before using Ayanami0730/paper-read-skill-style, paper-read-skill, paper-reading agent skill, research-paper analysis, benchmark/methodology/survey-opinion routing, research synthesis, live behavior-drift, or paper-reading score-drift claims as external evidence."
      },
      {
        version: "2026.06.19-r200",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds AgentDefense-Bench provider-drift receipts so source/license/default-branch, README, CHECKSUMS, CITATION, requirements, MCP server manifest, attack-bank and benchmark-suite hashes, MCP-specific suite, defense server, defense policy, run config, provider route, canary results, drift statistic, alert or waiver, replay command, CI receipt, MCP server count, attack suite ids, defense/block/pass-rate metrics, thresholds, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r199 should be regenerated before using arunsanna/AgentDefense-Bench-style, AgentDefense-Bench, MCP security benchmark, infrastructure-layer defense, prompt-injection blocking, jailbreak blocking, tool-poisoning blocking, benign-pass, provider-route, canary-result, or provider-drift claims as external evidence."
      },
      {
        version: "2026.06.19-r199",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds llm-prompting-tests public-methodology receipts so source/no-license/default-branch, HEAD/tree, README, prompt catalog, prompt-file refs, prompt taxonomy, test manifest, task/risk taxonomy, rubric, self-check/no-external-assets policies, language boundary, model/provider pool, judge calibration, baseline/candidate results, regression thresholds, changelog, deprecation notice, migration guidance, no-prompt-copy proof, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r198 should be regenerated before using Arnie936/llm-prompting-tests-style, llm-prompting-tests, demanding prompt suite, coding-agent prompt, agentic-model prompt, prompt taxonomy, self-check, no-external-assets, rubric, or public-methodology claims as external evidence."
      },
      {
        version: "2026.06.19-r198",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds GaRAGe live-drift receipts so source/license/README, benchmark dataset, AMC-owned dataset manifest, paper reference, grounding annotation schema, retrieval corpus, prompt/evaluator config, baseline/live result, drift statistic, alert receipt, grounding precision/recall, citation support, deflection, answer faithfulness, validation coverage, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r197 should be regenerated before using amazon-science/GaRAGe-style, GaRAGe, RAG grounding annotations, passage relevance, citation support, deflective response, answer faithfulness, answer validation, or RAG live-drift claims as external evidence."
      },
      {
        version: "2026.06.19-r197",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Calibra public-methodology receipts so source/license/homepage/default-branch, package/docs/task/test trees, campaign config, campaign matrix, agent instructions, model/provider matrix, skill/MCP/environment overlays, deterministic seed, budget policy, trial/analysis/comparison reports, dashboard/export proof, changelog, deprecation notice, migration guidance, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r196 should be regenerated before using Swival/calibra-style, Calibra, coding-agent benchmark harness, campaign matrix, task fixture, model/provider ranking, skill/MCP/environment overlay, trial report, analysis report, comparison report, dashboard export, or public-methodology claims as external evidence."
      },
      {
        version: "2026.06.19-r196",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Knowlytics-AI MCQ/RAG replay-corpus receipts so source/no-license/default-branch, Streamlit app, MCQ generator, RAG generator, evaluator, requirements, owned synthetic corpus, quiz fixture, answer key, student response, evaluator rubric, retrieval/generation/scoring traces, performance feedback, replay command, CI receipt, task/provider coverage, no-raw-PDF-copy, secret-placeholder review, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r195 should be regenerated before using Sathyajitanand2004/Knowlytics-AI-style, Knowlytics-AI, MCQ generation, RAG self-evaluation, Streamlit quiz evaluation, targeted improvement feedback, or MCQ/RAG replay-corpus claims as external evidence."
      },
      {
        version: "2026.06.19-r195",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Scorable SDK Studio drilldown receipts so source/license/default-branch, commit/tree, Python/OpenAPI/client/execution-log/evaluator proof, CLI evaluator/judge/execution-log/OTEL/file-upload proof, TypeScript package proof, npm package integrity, UI route, source artifact links, trace/receipt/policy/source-artifact previews, empty/error states, accepted/rejected evidence, repair hints, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r194 should be regenerated before using root-signals/scorable-sdk-style, Scorable SDK, Studio evidence drilldown, execution-log, OTEL trace, evaluator/judge command, file-upload, npm package integrity, source artifact preview, empty/error state, or question-explainability claims as external evidence."
      },
      {
        version: "2026.06.19-r194",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds RAIL Score live-drift receipts so source/license/release, PyPI package hashes, README, pyproject, workflow, client, policy, middleware, telemetry, compliance, agent, integration, baseline/live result, drift statistic, alert receipt, score, guardrail, safe-regeneration, tool-call, compliance, telemetry, prompt-injection, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r193 should be regenerated before using Responsible-AI-Labs/rail-score-sdk-style, RAIL Score, responsible-AI dimensions, guardrails, safe regeneration, prompt-injection blocking, agent tool-call evaluation, telemetry, compliance, or live behavior-drift claims as external evidence."
      },
      {
        version: "2026.06.19-r193",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Falcon Evaluate provider-drift receipts so source/license/default-branch, release, package, lockfile, requirements, README, docs, workflow, evaluation modules, metric families, provider routes, canary results, drift statistic, alert or waiver, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r192 should be regenerated before using Praveengovianalytics/falcon-evaluate-style, Falcon Evaluate, provider/model drift, context relevancy, fairness, reliability, security, machine ethics, provider-route, canary-result, or agent-evaluation claims as external evidence."
      },
      {
        version: "2026.06.19-r192",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds effect-autoagent replay-corpus receipts so source/license/default-branch, README, package, lockfile, CI, benchmark runner, harness spec, task spec, metrics, experiment log, blueprint, runner, result, trajectory, container, task fixture, Docker environment, replay command, fixed seed, score delta, CI receipt, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r191 should be regenerated before using mpsuesser/effect-autoagent-style, effect-autoagent, Effect service agent, declarative blueprint, harness-engineering, task fixture, Docker task, benchmark-runner, trajectory, score-delta, or replay-corpus claims as external evidence."
      },
      {
        version: "2026.06.19-r191",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Darwin Godel Machine live-drift receipts so source/no-license, README, security, CI, controller, archive, self-modification, evaluation, scorer, sandbox, live-run config, benchmark manifest, score-movement manifest, lineage, provider/model route, candidate score, score movement, pass rate, mutation acceptance, regression failure, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r190 should be regenerated before using lemoz/darwin-godel-machine-style, Darwin Godel Machine, self-improving coding agent, population evolution, live score movement, sandboxed evolution, benchmark pass-rate, mutation acceptance, regression failure, lineage, or live behavior-drift claims as external evidence."
      },
      {
        version: "2026.06.19-r190",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds SecureVibeBench secure-coding metric-validity receipts so source/license/homepage, default branch, README, results, dataset, format example, evaluation runners, agent adapters, vulnerability scenarios, test scripts, parser utilities, patch-diff utilities, metric definitions, CI, owner, confidence interval, signed evidence, artifact hashes, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r189 should be regenerated before using iCSawyer/SecureVibeBench-style, SecureVibeBench, secure vibe coding, vulnerability-introducing scenario reconstruction, secure coding agent benchmark, adapter roster, scenario corpus, test-script, or metric-validity claims as external evidence."
      },
      {
        version: "2026.06.19-r189",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Awesome AI Evaluation Guide public-methodology receipts so source/license, default branch, README guide manifest, benchmark guide, tools/platforms guide, metric-selection taxonomy, thresholds, calibration, component traces, human-in-loop review, cost controls, deprecation notices, migration guidance, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r188 should be regenerated before using hparreao/Awesome-AI-Evaluation-Guide-style, Awesome-AI-Evaluation-Guide, AI evaluation guide, LLM/RAG/agentic AI evaluation, benchmark taxonomy, tool taxonomy, metric-selection, threshold, calibration, trace, human-review, cost-control, deprecation, or migration methodology claims as external evidence."
      },
      {
        version: "2026.06.19-r188",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Kubernetes operational-agent metric-validity receipts so source/license, default branch, README, release assets, build workflow, agent module, MCP server, Kubernetes tool inventory, diagnostics, resource monitoring, log analysis, metric definitions, CI, owner, confidence interval, signed evidence, artifact hashes, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r187 should be regenerated before using hariohmprasath/k8s-ai-style, Kubernetes operational agent, Kubernetes MCP agent, diagnostics, resource monitoring, smart log analysis, or operational-agent metric-validity claims as external evidence."
      },
      {
        version: "2026.06.19-r187",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Skill Forge autoresearch replay receipts so source/license/homepage, README/release/skill spec, agent-role, orchestrator/mutator/scorer/hypothesis, composite scoring, templates, example sessions, improvement loops, mutation/revert policy, replay manifest, CI, score delta, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r186 should be regenerated before using GodModeAI2025/skill-forge-style, Skill Forge, autonomous skill improvement, iterative skill mutation, autoresearch, no-human-in-loop skill optimization, composite scoring, or SkillBench regression-gate replay claims as external evidence."
      },
      {
        version: "2026.06.19-r186",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Credence Engine live-drift receipts so Bayesian decision source/license/archive, benchmark harness, experiments, tests, posterior, VOI, expected-utility, baseline/live result, drift statistic, alert receipt, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r185 should be regenerated before using gfrmin/credence-engine-style, Credence Engine, Bayesian decision-theoretic agents, value-of-information routing, expected-utility decisions, posterior calibration, benchmark drift experiments, or live agent-evaluation drift claims as external evidence."
      },
      {
        version: "2026.06.19-r185",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds RSS market-impact methodology-versioning receipts so source/no-license, feed, model route, prompt/schema, taxonomy, dedupe and analysis ledgers, push/rate-limit policies, thresholds, outcome/backtest/evaluator evidence, migration guidance, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r184 should be regenerated before using EliotYang/trump_rss_trade-style, Trump RSS trade, RSS market-impact monitor, OpenAI or Gemini market-impact alert, feed polling, push notification, importance or asset-class labels, or news-driven market-impact methodology claims as external evidence."
      },
      {
        version: "2026.06.19-r184",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Hermes Turbo question-explainability receipts so source/license, default branch, commit/tree, benchmark/perf-budget/daily-score workflows, turbo-score script, dashboard, benchmark report, baseline/candidate results, latency/throughput traces, score manifests, CI, thresholds, accepted/rejected evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r183 should be regenerated before using wesleysimplicio/hermes-turbo-agent-style, Hermes Turbo Agent, performance dashboard, turbo scoring, low-latency, hot-path optimization, benchmark refresh, perf budget, or performance question-explainability claims as external evidence."
      },
      {
        version: "2026.06.19-r183",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds PaperArena replay-corpus receipts so source/no-license, README/requirements/config/runner/scorer proof, dataset-builder/tool/RAG/reflector/run-script trees, Hugging Face dataset snapshots, paper/QA manifests, result/score reports, replay command, CI/lifecycle receipt, tool-surface coverage, counts, thresholds, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r182 should be regenerated before using ustc-ai4science/PaperArena-style, PaperArena, tool-augmented scientific-literature reasoning, paper-QA, PDF/retrieval/database/search/code tool-use, Hugging Face PaperArena dataset, or PaperArena replay claims as external evidence."
      },
      {
        version: "2026.06.19-r182",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds CoderCup metric-validity receipts so source/license/homepage, default branch, README/contributing, CI, package lock, task spec, test-suite, runner contract, score-ledger, live-artifact, methodology/reference, cost-accounting, owner, reliability, confidence interval, signed evidence, artifact hashes, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r181 should be regenerated before using TestSprite/CoderCup-style, CoderCup, continuous public coding-agent benchmark, phase suite, runner contract, score ledger, live leaderboard, TestSprite E2E verdict, cost-accounting, or metric-validity claims as external evidence."
      },
      {
        version: "2026.06.19-r181",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds LLM Fighter live-drift receipts so source snapshot, MIT license, homepage, README, API/UI trees, game-result endpoint, persistence schema, engine, runner, LLM adapter, YAML export, UI component, baseline/live result, drift statistic, alert receipt, combat logs, exported logs, game metrics, signed evidence, artifact hashes, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r180 should be regenerated before using neutree-ai/llm-fighter-style, LLM Fighter, combat-game agent evaluation, game-result API, battle log, YAML export, win-rate, game-score, action-validity, combat-stability, or live behavior-drift claims as external evidence."
      },
      {
        version: "2026.06.19-r180",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Agentic Graph RAG metric-validity receipts so source/no-license, default branch, README, graph orchestrator, RAG pipeline, database/vector-store, evaluation metrics, experiment tracking, UI question surfaces, dependency locks, owners, confidence intervals, signed evidence, artifact hashes, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r179 should be regenerated before using mlvanguards/agentic-graph-rag-evaluation-cometml-style, Agentic Graph RAG, graph-RAG orchestrator, RAG pipeline, vector-store, evaluation metric, experiment-tracking, UI-question, retrieval-grounding, or metric-validity claims as external evidence."
      },
      {
        version: "2026.06.19-r179",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Agent Belt methodology-versioning assurance so source/license/release, README/docs, scenario schema, agent adapters, custom-agent contracts, workspace-diff and rule checks, multi-judge and per-turn configs, pass@k/pass^k reliability, worktree/Docker isolation, export, CI, package digests, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r178 should be regenerated before using jfrog/agent-belt-style, Agent Belt, coding-agent eval, multi-turn scenario, agent adapter, workspace-diff, rule-check, multi-judge consensus, per-turn judging, pass@k, pass^k, worktree, Docker sandbox, export, CI, package-release, or methodology-versioning claims as external evidence."
      },
      {
        version: "2026.06.19-r178",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds CooperBench metric-validity receipts so source/no-license, release, default branch, README/changelog, dataset/task, feature-conflict, runner/coop harness, eval backend, team harness, agent-adapter roster, CI workflow, package lock, public report, owner, confidence interval, signed evidence, artifact hashes, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r177 should be regenerated before using cooperbench/CooperBench-style, CooperBench, cooperative coding-agent benchmark, conflict-resolution, team-harness, agent-adapter, public-report, or metric-validity claims as external evidence."
      },
      {
        version: "2026.06.19-r177",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Hermes Bench metric-validity receipts so source/license, default branch, README/build spec, backend runner, judge calibration, task registry, model/server config, adapter coverage, result schema, frontend review surface, backend/frontend regression, Docker runtime, owner, confidence interval, signed evidence, artifact hashes, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r176 should be regenerated before using Bent-Solutions/hermes-bench-style, Hermes Bench, local LLM/agent benchmark UI, benchmark-runner, judge-calibration, task-registry, adapter-coverage, result-schema, frontend-review, regression, Docker-runtime, or metric-validity claims as external evidence."
      },
      {
        version: "2026.06.19-r176",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds AI Reputation Claude live-drift receipts so source/no-license, README, agent roster, skill catalog, install, review-source, sentiment, competitor, response-policy, crisis-playbook, report-template, baseline/live result, drift statistic, alert receipt, brand-safety metrics, platform/task/context distributions, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r175 should be regenerated before using zubair-trabzada/ai-reputation-claude-style, AI Reputation Claude, review analysis, sentiment scoring, competitor benchmarking, review response, crisis playbook, PDF reputation report, hallucinated citation, PII leakage, or live reputation-management drift claims as external evidence."
      },
      {
        version: "2026.06.19-r175",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds SubtleMemory-style relational-memory metric-validity receipts so source/license, default branch, arXiv version, Hugging Face dataset release, persona splits, bench/history manifests, relation taxonomy, construction pipeline, staged evaluation, adapter roster, judge/evaluator config, score/diagnostic reports, CI validation, owner, confidence interval, signed evidence, artifact hashes, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r174 should be regenerated before using Yummytanmo/SubtleMemory-style, SubtleMemory, fine-grained relational memory discrimination, long-horizon memory, persona split, relation-controlled memory variant, staged memory evaluation, judge/evaluator, diagnostic-protocol, or metric-validity claims as external evidence."
      },
      {
        version: "2026.06.19-r174",
        date: "2026-06-19",
        summary: "Adds Critic Rubrics rubric-supervised critic methodology assurance so source/no-license review, default-branch snapshot, README, pyproject, lockfile, arXiv version, release tags, rubric base/trajectory implementations, annotator, prediction, type-safe function-calling schema, feature taxonomy, batch annotation pipeline, tests/workflows, sparse outcome proxy, reranking, early-stopping, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r173 should be regenerated before using OpenHands/critic-rubrics-style, Critic Rubrics, rubric-supervised critic, sparse real-world outcome, behavior-feature, type-safe function-calling LLM-as-judge, best-of-N reranking, early-stopping, SWE-bench rerankable subset, or critic-methodology claims as external evidence."
      },
      {
        version: "2026.06.19-r173",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds BestTester replay receipts so source/license review, default-branch snapshot, README, package.json, lockfile, tsconfig, Playwright config, source/test/agent/MCP/config/script/mutation/report/workflow trees, MCP server/client, LLM judge rubric, security fuzzer, Jira report, result artifact, CI receipt, capability/test-surface/agent-role coverage, replay pass rate, score delta, LLM judge agreement, security coverage, CI coverage, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r172 should be regenerated before using nshportun/BestTester-style, BestTester, Playwright QA-agent, LLM-as-Judge QA, MCP testing, security fuzzing, Jira/Slack reporting, mutation-testing, test-healing, or QA automation replay claims as external evidence."
      },
      {
        version: "2026.06.19-r172",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Microsoft Social Reasoning Bench replay receipts so source/license review, default-branch snapshot, README, pyproject, lockfile, data/docs/experiments/outputs/packages/scripts trees, runner, collector, validation script, workflow, result artifact, CI receipt, domain/package/scenario coverage, fixture counts, output artifacts, replay pass rate, score delta, result coverage, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r171 should be regenerated before using microsoft/social-reasoning-bench-style, Social Reasoning Bench, social-domain agent, calendar-scheduling, marketplace, whimsygen, privacy, due-diligence, outcome-optimality, or replay-corpus claims as external evidence."
      },
      {
        version: "2026.06.19-r171",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds IBM/rag-chunking-techniques-style RAG chunking technique metric-validity receipts so source/license review, default-branch snapshot, README, policy corpus, simple RAG notebooks, smart chunking notebooks, RAG evaluation notebooks, chunking strategies, retrieval pipelines, embedding/vectorstore manifests, evaluation datasets, metrics, CI, owners, confidence intervals, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r170 should be regenerated before using IBM/rag-chunking-techniques-style, RAG chunking technique, policy corpus, simple RAG, smart chunking, RAG evaluation, retrieval pipeline, embedding/vectorstore, notebook-run, or chunking metric-validity claims as external evidence."
      },
      {
        version: "2026.06.19-r170",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds AcademiClaw academic-task metric-validity receipts so source/license review, default-branch snapshot, README/CITATION, task corpus, bilingual coverage, workspace queries, Docker environments, rubrics, eval-task runners, OpenClaw results, conversation traces, meta-evals, model rosters, metric definitions, CI, owner, confidence intervals, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r169 should be regenerated before using GAIR-NLP/AcademiClaw-style, AcademiClaw, AcademicLaw/OpenClaw, bilingual academic-task, university student-sourced task, rubric, conversation-trace, meta-eval, or academic-agent metric-validity claims as external evidence."
      },
      {
        version: "2026.06.19-r169",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds GAIA-agent replay receipts so source snapshot, Apache-2.0 license, README, package/lockfile, benchmark tree, downloader/runner/evaluator/reporter, benchmark workflow/docs/results, source/test trees, task/dataset snapshots, fixed seeds, provider/model/run configs, output, score report, replay command, CI receipt, tool surfaces, replay pass rate, score delta, evaluator agreement, trace/result coverage, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r168 should be regenerated before using gaia-agent/gaia-agent-style, GAIA benchmark-ready super-agent, AI SDK ToolLoopAgent, browser/search/memory/planning/sandbox tool-use, benchmark runner/evaluator/reporter, or GAIA-agent replay claims as external evidence."
      },
      {
        version: "2026.06.19-r168",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds FishCodeTech CTF-agent benchmark live-drift receipts so source snapshot, GPL license, README, challenge catalog, challenge manifest, Docker/runtime, compose, backend API, MCP, sidecar, agent template, scoring, scoreboard, flag log, baseline/live result, drift statistic, alert receipt, solve, first-flag, contamination, independence, partial-credit, trace, sandbox, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r167 should be regenerated before using FishCodeTech/ctf-agent-benchmark-style, CTF agent benchmark, tool-use security benchmark, MCP-integrated CTF, Docker challenge, sidecar-log, scoreboard, partial-credit, sandbox-isolation, or cybersecurity-agent live-drift claims as external evidence."
      },
      {
        version: "2026.06.19-r167",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Legacy-Bench-style legacy-software metric-validity receipts so source/license, default branch, README, task corpus, legacy-language, environment, harness, agent-task, patch, test-oracle, evaluator, metric, CI, result, replay, owner, confidence interval, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r166 should be regenerated before using Factory-AI/legacy-bench-style, Legacy-Bench, legacy software engineering, COBOL/Java/Fortran/Assembly/C repair or migration, deterministic test-oracle, replay-command, or software-agent metric-validity claims as external evidence."
      },
      {
        version: "2026.06.19-r166",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds HumanStudy-Bench-style participant-simulation metric-validity receipts so source, default-branch snapshot, study config, participant and response manifests, evaluator/scorer/validator proof, reliability reports, validation pipeline, CI, owners, confidence intervals, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r165 should be regenerated before using AISmithLab/HumanStudy-Bench-style, HumanStudy-Bench, participant simulation, human-study response comparison, social-science simulation, evaluator/scorer validity, inter-rater agreement, test-retest reliability, or validation-pipeline metric-validity claims as external evidence."
      },
      {
        version: "2026.06.19-r165",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds BioMedArena-style biomedical harness replay receipts so source, repository, license, README, pyproject, config, matrix config, harness, CLI, benchmark config, eval suite, adapter/tool/vendor registries, baseline, quick-run, release-gate, result, replay, CI, coverage metrics, sandbox proof, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r164 should be regenerated before using AI-in-Health/BioMedArena-style, BioMedArena, biomedical agent harness, benchmark-family coverage, tool-mode coverage, adapter/tool/vendor coverage, or biomedical harness replay claims as external evidence."
      },
      {
        version: "2026.06.19-r164",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Agent Reading Test-style web-content reading live-drift receipts so source snapshot, license, homepage, README blob, answer key, task manifest, score form, live-site snapshot, raw content capture, canary proof, baseline/live results, drift statistics, alert receipts, reading score, canary recall, task completion, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r163 should be regenerated before using agent-ecosystem/agent-reading-test-style, Agent Reading Test, web-content reading, canary recall, truncation, SPA shell, tabbed content, content negotiation, redirect, header-quality, or agent documentation-reading live-drift claims as external evidence."
      },
      {
        version: "2026.06.19-r163",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Awesome-Agent-Memory-style memory-catalog live-drift receipts so source snapshot, no-license boundary, README blob, catalog snapshot, entry-source, taxonomy, benchmark/eval manifests, baseline/live results, drift statistics, alert receipts, retrieval/persistence/forgetting/hallucination metrics, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r162 should be regenerated before using wfnuser/Awesome-Agent-Memory-style, Awesome Agent Memory, memory-system catalog, retrieval, persistence, forgetting, hallucination, taxonomy, or agent-memory live-drift claims as external evidence."
      },
      {
        version: "2026.06.19-r162",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds ChipBenchmark-style hardware benchmark metric-validity receipts so source snapshot, no-license boundary, benchmark/hardware/model/precision manifests, environment and runner/serving scripts, result and frontend datasets, pricing, throughput/latency/cost metrics, regression thresholds, owners, confidence intervals, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r161 should be regenerated before using wafer-ai/chipbenchmark-style, ChipBenchmark, GPU/accelerator LLM benchmark, hardware profile, model-family, precision-mode, throughput, latency, pricing, or cost-efficiency metric-validity claims as external evidence."
      },
      {
        version: "2026.06.19-r161",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Encourage-style modular RAG replay receipts so source/repository/license, package/dependency, RAG method, inference-runner, template, vector DB, dataset/query/reference-answer, metric suite, MLflow, result, replay, CI, counts, score delta, metric coverage, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r160 should be regenerated before using uhh-hcds/encourage-style, modular RAG, vLLM, Jinja-template, Chroma/Qdrant, MLflow-tracked, or RAG replay-corpus claims as external evidence."
      },
      {
        version: "2026.06.19-r160",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Sutro-style batch methodology-versioning assurance so grounded LLM judge/classifier/extractor, unstructured-data batch inference, data-source/schema, input-order, priority, dry-run cost, model-pool, observability, result-export, retention, multi-model, and embedding semantics are pinned before reports or badges are externally comparable.",
        migration: "Reports generated under 2026.06.19-r159 should be regenerated before using sutro-sh/sutro-style, Sutro, unstructured-data batch inference, grounded judge/classifier/extractor, synthetic-data, semantic-tagging, embeddings, DataFrame/file/S3 input, dry-run cost, observability, retention, or result-export methodology claims as external evidence."
      },
      {
        version: "2026.06.19-r159",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds resume-RAG evaluator metric-validity receipts so source/license boundaries, resume upload/parser, job-description, RAG strategy, query expansion, retrieval config, vector store, Ollama/embedding models, endpoints, candidate rating, batch/privacy/dependency proof, owners, confidence intervals, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r158 should be regenerated before using punyaa18/ollama-resume-parser-style, local Ollama resume parser, RAG resume evaluator, PDF/TXT resume parsing, job-description matching, similarity/MMR/hybrid retrieval, query expansion, candidate rating, automatic/individual/bulk evaluation, or privacy-boundary metric-validity claims as external evidence."
      },
      {
        version: "2026.06.19-r158",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Parallel/OpenClaw research-skill metric-validity receipts so source/license boundaries, skill/API/search/deep-research/chat/extract/citation/source-policy/batch/monitoring/security/dependency proof, benchmark-claim validation, owners, confidence intervals, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r157 should be regenerated before using mvanhorn/clawdbot-skill-parallel-style, Parallel.ai skill, OpenClaw research skill, search/extraction/deep-research/grounded-chat/batch/monitoring/citation, or benchmark-claim metric-validity claims as external evidence."
      },
      {
        version: "2026.06.19-r157",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds CodeQuest-style quality question-explainability receipts so source status, repository/license proof, evaluator and optimizer configs, code artifacts, feedback traces, improvement patches, actor-critic loop traces, regression suites, dimension deltas, replay/CI receipts, no-source-copy boundaries, signed evidence, and row hashes fail closed per question.",
        migration: "Reports generated under 2026.06.19-r156 should be regenerated before using jpmorganchase/CodeQuest-style, CodeQuest, code-quality evaluator/optimizer loops, actor-critic code-quality improvement, readability/security/maintainability/efficiency dimensions, or CodeQuest-style question-explainability claims as external evidence."
      },
      {
        version: "2026.06.19-r156",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds InnovatorBench-style research replay receipts so source/repository/license/paper/dataset proof, task and ResearchGym configs, tool registry, environment/Docker/multi-GPU/checkpoint proof, execution/result/metric/score reports, replay/CI receipts, coverage thresholds, no-leaderboard/no-dataset-copy boundaries, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r155 should be regenerated before using GAIR-NLP/InnovatorBench-style, InnovatorBench, ICLR 2026 LLM research-agent, ResearchGym, Hugging Face dataset, data-construction, loss-design, reward-design, scaffold-construction, checkpointed long-horizon, or multi-GPU research replay claims as external evidence."
      },
      {
        version: "2026.06.19-r155",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds LLM Evaluation System-style jury replay receipts so source/repository/license/package/MCP, dataset generation, synthetic QA, document grounding, judge config, jury roster, binary scoring, execution and OpenTelemetry trace proof, Bedrock boundary, result/analysis/PDF/S3 proof, replay/CI receipts, coverage thresholds, no-copy/no-report-only boundaries, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r154 should be regenerated before using awslabs/llm-evaluation-system-style, LLM Evaluation System, MCP evaluation, jury scoring, binary criteria, document-grounded synthetic QA, Bedrock/OpenTelemetry agent evaluation, PDF report, S3 team-sharing, or multi-judge replay claims as external evidence."
      },
      {
        version: "2026.06.19-r154",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds AgentKernelArena-style GPU-kernel replay receipts so source/repository/license, task config, agent roster, workspace isolation, GPU profile, compile/correctness/performance command and result proof, speedup deltas, A/B comparison, replay pass rate, result coverage, CI receipt, signed evidence, no-leaderboard-only boundary, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r153 should be regenerated before using AMD-AGI/AgentKernelArena-style, AgentKernelArena, GPU-kernel optimization, HIP, Triton, Torch2HIP, compile/correctness/performance, speedup, A/B agent, or workspace-isolated kernel benchmark replay claims as external evidence."
      },
      {
        version: "2026.06.19-r153",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds AgentTrial-style statistical question-explainability receipts so suite/source/package identity, adapter taxonomy, repeated trial counts, Wilson confidence intervals, bootstrap cost/latency, failure attribution, regression comparison, Agent Reliability Score, CI proof, accepted/rejected evidence, repair hints, and row hashes fail closed per question.",
        migration: "Reports generated under 2026.06.19-r152 should be regenerated before using alepot55/agentrial-style, AgentTrial, pytest-for-agents, repeated statistical agent trials, confidence intervals, failure attribution, regression detection, Agent Reliability Score, or statistical question-explainability claims as external evidence."
      },
      {
        version: "2026.06.19-r152",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Navi-Bench-style real-website web-agent live-drift receipts so source/repository/license, Hugging Face dataset, task config, evaluator config, browser-provider proof, baseline/live results, saved trajectory, visualization, screenshot trace, crash-adjusted score bounds, evidence coverage, website-domain/browser/eval-context drift, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r151 should be regenerated before using yutori-ai/navi-bench-style, Navi-Bench, real-website web-agent, Apartments/Craigslist/OpenTable/Resy/Google Flights, browser-provider, crash-adjusted score, trajectory, visualization, or web-agent live-drift claims as external evidence."
      },
      {
        version: "2026.06.19-r151",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Nuclia-style RAG-triad replay receipts so source/repository/license, package version, model-card, model-cache policy, Hugging Face auth boundary, evaluator config, dataset and QA-context manifests, metric manifest, answer relevance, context relevance, groundedness, composite score delta, replay pass rate, model-access and no-raw-context-copy boundaries, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r150 should be regenerated before using nuclia/nuclia-eval-style, Nuclia, REMi, RAG triad, answer relevance, context relevance, groundedness, model-cache, gated-model access, or RAG evaluation replay claims as external evidence."
      },
      {
        version: "2026.06.19-r150",
        date: "2026-06-19",
        summary: "Adds FIRE-style atomic-claim fact-checking replay receipts so source/repository/paper, dataset and atomic-claim manifests, retriever/verifier configs, decision policy, search-provider config, evidence/query/label traces, cost report, result manifest, replay command, CI receipt, atomic-claim and retrieval-step counts, max retrieval depth, factuality and LLM/search cost deltas, replay pass rate, evidence recall, label agreement, dynamic retrieval and search-provider boundaries, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.19-r149 should be regenerated before using mbzuai-nlp/fire-style, FIRE, atomic-claim fact-checking, iterative retrieval and verification, dynamic retrieval-depth, Serper/search-provider, factuality, evidence recall, label agreement, or cost-efficiency replay claims as external evidence."
      },
      {
        version: "2026.06.19-r149",
        date: "2026-06-19",
        summary: "Adds spent-style Claude Code session-cost replay receipts so source/repository/license, hook config, JSONL log manifest, pricing snapshot, classifier rules, command transcript, dashboard export, result manifest, replay command, CI receipt, privacy/no-telemetry boundary, session/tool-event counts, efficiency and cost deltas, replay pass rate, classification coverage, JSON export validity, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.17-r148 should be regenerated before using loplop-h/spent-style, Claude Code session-cost tracking, efficiency score, productive/wasted classification, local JSONL logs, live dashboard, JSON export, no-telemetry, or session-cost replay claims as external evidence."
      },
      {
        version: "2026.06.17-r148",
        date: "2026-06-17",
        summary: "Adds Coding-Crashkurse/RAG-Evaluation-with-Ragas-style RAGAS notebook metric-validity receipts so source/no-license-boundary, notebook, dependency, document corpus, chunking, testset generator, evolution mix, generated testset, RAG chain, retriever/vectorstore, model/embedding, answer-context traces, RAGAS metric suite/results, LangFuse score exports, visualization, owner, sample-size/CI, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.17-r147 should be regenerated before using Coding-Crashkurse/RAG-Evaluation-with-Ragas-style, RAGAS notebook, generated testset, LangChain/Chroma/OpenAI RAG chain, RAGAS metrics, LangFuse scoring, visualization, or RAG metric-validity claims as external evidence."
      },
      {
        version: "2026.06.17-r147",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds rag-eval-style document QA dataset replay receipts so source/repository/license, input document, processor, prompt/generator, generated QA dataset, endpoint config/response trace, ranking/evaluation reports, replay command, CI, data format, endpoint modes, question/endpoint counts, score delta, replay pass, endpoint-response coverage, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.17-r146 should be regenerated before using sundi133/rag-eval-style, document QA generation, endpoint evaluation/ranking, generated QA dataset, sample-app endpoint, report download, score-delta, or CI replay claims as external evidence."
      },
      {
        version: "2026.06.17-r146",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Strands benchmark-harness live-drift receipts so source/repository/license proof, agent package, harness config, model route, prompt template, benchmark suite, runtime, task family, Docker/environment/tool-policy proof, trajectory, patch, test report, result/upload manifests, safety isolation, task-success, patch-apply, test-pass, latency, cost, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.17-r145 should be regenerated before using strands-labs/benchmark-harnesses-style, Strands benchmark harness, SWE-Bench, Terminal-Bench, Docker/Harbor-isolated coding-agent, trajectory, patch, test-report, result-upload, or live-drift claims as external evidence."
      },
      {
        version: "2026.06.17-r145",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds MiniAppBench-style interactive HTML replay receipts so source/repository/license-review, dataset/query/evaluation-reference manifests, generated MiniApp and source-code proof, live-instance/browser-automation traces, render and dynamic-interaction reports, withheld-reference and no-copy boundaries, human-alignment, replay pass-rate, score-delta, CI receipt, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.17-r144 should be regenerated before using MiniAppBench/miniappbench-style, MiniAppBench, MiniAppEval, interactive HTML generation, browser automation, generated MiniApp, withheld-reference, visual-render, dynamic-interaction, or human-alignment replay claims as external evidence."
      },
      {
        version: "2026.06.17-r144",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Metronous-style methodology-versioning assurance so public report and badge comparability requires methodology identity, current changelog, deprecation notice, migration guidance, telemetry schema, benchmark corpus, threshold policy, model calibration, cost accounting, local archive, export sanitization, badge-assurance, diagnostic receipt, accepted/rejected evidence, and row hashes.",
        migration: "Reports generated under 2026.06.17-r143 should be regenerated before using kiosvantra/metronous-style, Metronous, local AI agent telemetry, benchmark aggregation, threshold policy, model calibration, OpenCode-agent telemetry, local archive, export sanitization, badge comparability, or methodology-versioning claims as external evidence."
      },
      {
        version: "2026.06.17-r143",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds ShampooSalesAgent-style retail sales question-explainability proof so source identity, product/catalog, customer scenario, conversation trace, order schema and ledger, pricing/discount policies, model adapter/provider matrix, prompt/recommendation/safety/privacy policies, evaluator, result, benchmark report, provider/scenario/order counts, metric thresholds, accepted/rejected evidence, repair hints, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.17-r142 should be regenerated before using jackfsuia/ShampooSalesAgent-style, retail sales agent, shampoo sales, product recommendation, customer conversation, order capture, model-provider matrix, or retail question-explainability claims as external evidence."
      },
      {
        version: "2026.06.17-r142",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Realign-style simulation metric-validity proof so source/license, YAML config, app-under-test, dataset, scenario, synthetic-user persona, evaluator registry, evaluator target, simulation trace, repeated-run trace, judge calibration, statistics, CI regression, experiment tracking, result artifacts, owner, sample-size, confidence-interval, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.17-r141 should be regenerated before using honeyhiveai/realign-style, Realign simulation, YAML evaluator config, synthetic-user/persona simulation, repeated evaluator runs, LLM judge calibration, statistical rigor, CI regression, experiment tracking, or metric-validity claims as external evidence."
      },
      {
        version: "2026.06.17-r141",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Adsum IoT Coder-style firmware question-explainability proof so platform, board, chip, firmware project, toolchain, SDK, hardware session, device logs, build/flash/test artifacts, knowledge pack, evaluator, privacy boundary, benchmark report, hardware-run/device counts, bug-closure, token-efficiency, log-capture coverage, accepted/rejected evidence, repair hints, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.17-r140 should be regenerated before using adsumnetworks/Adsum-IoT-Coder-style, IoT firmware, nRF, ESP, Zephyr, ESP-IDF, hardware-run, device-log, build/flash/test, bug-closure, token-efficiency, or firmware question-explainability claims as external evidence."
      },
      {
        version: "2026.06.17-r140",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds cc-plugin-eval-style metric-validity proof so source/repository/license, plugin manifest, component inventory, trigger phrase, scenario generation/type coverage, transcript, programmatic detection, LLM judge calibration, conflict, checkpoint/resume, cost, CI, result artifact, owner, sample-size, confidence-interval, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.17-r139 should be regenerated before using sjnims/cc-plugin-eval-style, Claude Code plugin evaluation, component triggering, skill/agent/command activation, trigger phrase, scenario generation, programmatic detection, LLM judge calibration, checkpoint/resume, cost-estimate, or metric-validity claims as external evidence."
      },
      {
        version: "2026.06.17-r139",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds agent-eval-harness live-drift receipts so source/repository/license proof, structured trace schema/collector/writer evidence, framework/trace-mode/metric-context distributions, tool-success, hallucination, latency, cost, trace coverage, evidence coverage, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.17-r138 should be regenerated before using Siddharth-1001/agent-eval-harness-style, local agent evaluation, structured traces, framework adapters, dashboard, CLI, tool-success, hallucination, latency, cost, side-by-side comparison, or live-drift claims as external evidence."
      },
      {
        version: "2026.06.17-r138",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds HedraRAG artifact-eval live-drift receipts so source/repository snapshot, license-status or license-review proof, paper/README refs, dataset/corpus/index/dependency/environment/run/result/plot/resource/GPU proof, workflow/framework/runtime distributions, latency, throughput, memory, replay pass rate, evidence coverage, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.17-r137 should be regenerated before using Leo9660/HedraRAG_AE-style, HedraRAG, heterogeneous RAG workflow, graph RAG, HyDE, multistep RAG, FlashRAG/LangChain/HedraRAG baseline, FAISS index, CUDA/GPU runtime, artifact-eval latency, throughput, memory, replay-pass, or live-drift claims as external evidence."
      },
      {
        version: "2026.06.17-r137",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds TerminalWorld-style replay-corpus receipts so public recording provenance, privacy/quality filters, synthesized tasks, Docker environment reproduction, state-based tests, AllPassing/Nop/Partial trial validation, verified-subset proof, counts, metrics, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.17-r136 should be regenerated before using EuniAI/TerminalWorld-style, TerminalWorld, public terminal recording, asciinema-derived, synthesized terminal task, Docker environment, state-test, AllPassing, Nop, Partial, verified-subset, or terminal-agent replay claims as external evidence."
      },
      {
        version: "2026.06.17-r136",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds OpenCode-lab-style metric-validity gates so source reference, lab benchmark manifest, agent context, prompt variants, tool descriptions, AGENTS policy, repeated-run traces, fork agreement, model variance, ground-truth corrections, metric definitions, CI reporter, result artifacts, owner, sample-size, confidence interval, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.17-r135 should be regenerated before using criterium/opencode-lab-style, OpenCode lab, determinism, context-assembly, prompt/tool/AGENTS provenance, fork-agreement, model-variance, ground-truth-correction, or metric-validity claims as external evidence."
      },
      {
        version: "2026.06.17-r135",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds CL-Bench-style continual-learning question-explainability lenses so stateful workflow identity, dataset, state schema, initial state, state mutation trace, conversation trace, entity graph, tool execution, evaluator, result, replay command, memory/adaptive-learning proof, task-completion, response-quality, state-accuracy, retention, token-cost thresholds, accepted/rejected evidence, repair hints, and row hashes fail closed per question.",
        migration: "Reports generated under 2026.06.17-r134 should be regenerated before using Arc-Computer/CL-Bench-style, continual-learning, stateful CRM workflow, multi-turn conversation, state mutation, entity-relationship, tool-execution, adaptive-learning, or question-explainability claims as external evidence."
      },
      {
        version: "2026.06.17-r134",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds CostNav-style physical navigation replay receipts so source/repository/license, benchmark spec, scenario manifest, route graph, economic-cost model, physical-agent config, simulator config, trajectory, result, metrics, replay command, CI receipt, route-type coverage, deterministic seed, scenario counts, economic-cost delta, navigation success, replay pass rate, score delta, thresholds, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.17-r133 should be regenerated before using worv-ai/CostNav-style, physical-navigation, route-graph, embodied-agent, simulator, trajectory, economic-cost, navigation-success, or benchmark replay claims as external evidence."
      },
      {
        version: "2026.06.17-r133",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds agent-evaluation observability live-drift receipts so source/repository/license, agent config, eval dataset, prompt/model/RAG/metric config, baseline/live results, OpenTelemetry, Application Insights, Event Hub, Kusto, Fabric dashboard, alert receipt, metric-set and telemetry coverage, baseline/live distributions, thresholds, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.16-r132 should be regenerated before using vladfeigin/llm-agents-evaluation-style, agent-evaluation observability, RAG quality monitoring, prompt/model variant evaluation, OpenTelemetry, Application Insights, Event Hub, Fabric/Kusto, dashboard, or live-drift claims as external evidence."
      },
      {
        version: "2026.06.16-r132",
        date: "2026-06-16",
        summary: "Adds SAP agent-evaluation tutorial live-drift receipts so source/repository/license, notebook, dataset, baseline log, live sample, metric/tooling config, role-access, reliability, compliance, alert receipt, objective/process/enterprise taxonomy coverage, baseline/live distributions, thresholds, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.16-r131 should be regenerated before using SAP-samples/llm-agents-eval-tutorial-style, SAP agent evaluation, KDD 2025 tutorial, objective taxonomy, evaluation-process taxonomy, role-access, reliability, compliance, dynamic interaction, or live-drift claims as external evidence."
      },
      {
        version: "2026.06.16-r131",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds GTO Wizard-style poker-agent replay receipts so source/repository/license, API scope, no-solver policy, hand-history, legal-action trace, AIVAT metric report, replay command, CI receipt, agent-type coverage, deterministic seed, hand count, AIVAT score delta, replay pass rate, legal-action rate, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.16-r130 should be regenerated before using gtowizard-ai/researcher-api-client-style, GTO Wizard, NLTH poker-agent, API-key-gated, no-solver-access, hand-history, legal-action, AIVAT, leaderboard, or poker replay-corpus claims as external evidence."
      },
      {
        version: "2026.06.16-r130",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds OccuBench-style professional-task question-explainability lenses so task/scenario/domain identity, world-model environment, tool schema, agent config, fault injection, verifier rubric/votes, trajectory, result, replay/debug proof, pass and robustness thresholds, accepted/rejected evidence, repair hints, and row hashes fail closed per question.",
        migration: "Reports generated under 2026.06.16-r129 should be regenerated before using GregxmHu/OccuBench-style, professional-task, language-world-model, E0/E1/E2/E3 fault-mode, verifier-vote, trajectory, robustness, or professional-domain question-explainability claims as external evidence."
      },
      {
        version: "2026.06.16-r129",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds MiRAGE-style multimodal multihop RAG QA dataset-generation replay receipts so source/repository/license, input documents, semantic chunks, multihop context graph, role manifests, generate/select/verify/correct traces, multimodal carriers, backend/embedding/reranker configs, token usage, checkpoint/resume, deduplication, evaluation report, replay command, output dataset, visualization artifact, deterministic seed, question counts, score delta, replay pass rate, metric coverage, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.13-r128 should be regenerated before using ChandanKSahu/MiRAGE-style, multimodal multihop QA generation, RAG dataset generation, backend coverage, modality coverage, generated-question-set, replay-command, or RAG dataset CI replay claims as external evidence."
      },
      {
        version: "2026.06.13-r128",
        date: "2026-06-13",
        summary: "Adds LLMOPS-style lifecycle methodology boundaries so source/repository/license refs, task or pipeline manifests, dataset and split manifests, model artifacts, training or fine-tuning configs where used, evaluation and RAG-evaluation configs, QA deployment manifests, CI/CD receipts, container or orchestration manifests, infrastructure-as-code manifests where used, monitoring telemetry baselines, model/service thresholds, signed evidence, row hashes, and migration policy are required before public LLMOps lifecycle claims.",
        migration: "Reports generated under 2026.06.13-r127 should be regenerated before using ngtranminhtuan/LLMOPS-style, LLMOPS-style, text-summarization pipeline, RAG evaluation, QA deployment, CI/CD, container, Kubernetes, infrastructure-as-code, monitoring, or model-service lifecycle methodology claims as external evidence."
      },
      {
        version: "2026.06.13-r127",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds EARBench-style physical-risk-awareness methodology boundaries so source/repository/paper/license refs, EARDataset or equivalent dataset manifests, physical-risk scenarios, domain/scene coverage, safety guidelines, textual/visual observations, task instructions, plan-generation configs, plan-assessment rubrics, task-risk-rate/effectiveness metrics, mitigation prompts or policies, signed evidence, row hashes, and thresholds are required before public embodied-risk claims.",
        migration: "Reports generated under 2026.06.13-r126 should be regenerated before using zihao-ai/EARBench-style, EARBench, physical-risk-awareness, embodied task-planning safety, EARDataset, risky-scene, TRR, mitigation-prompt, or plan-assessment methodology claims as external evidence."
      },
      {
        version: "2026.06.13-r126",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Corrects default question-set metadata after four source-backed diagnostic additions, so the `amc-legacy-240-v1` compatibility id now reports the current default bank count instead of stale 240-question copy.",
        migration: "Reports generated under 2026.06.13-r125 remain verifiable, but should be regenerated before comparing default question-count, max-score, or methodology-hash fields against current reports."
      },
      {
        version: "2026.06.13-r125",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds PokerEval-style live-drift receipts so source/repository/package/citation, simulation, agent, opponent-pool, run, hand-history, metric report, game/table/blind context, hand count, BB/100, all-in adjusted BB/100, EV, VPIP, context distributions, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.13-r124 should be regenerated before using superagent-ai/poker-eval-style, PokerEval, NLTH poker simulation, partial-information decision-making, BB/100, EV, all-in adjusted BB/100, VPIP, hand-count, opponent-pool, or live-drift claims as external evidence."
      },
      {
        version: "2026.06.13-r124",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Multi-User-LLM-Agent-style question-explainability lenses so scenario, user-role, permission/preference/queue/instruction, interaction trace, evaluator, result, metric-threshold, accepted/rejected evidence, repair hint, and row-hash proof fail closed per question.",
        migration: "Reports generated under 2026.06.13-r123 should be regenerated before using Kordi-AI/Multi-User-LLM-Agent-style, multi-user LLM-agent, access-control, meeting-scheduling, shared-queue, multi-user instruction-following, or multi-stakeholder question-explainability claims as external evidence."
      },
      {
        version: "2026.06.13-r123",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds D-Star-AI/KITE-style RAG live-drift receipts so source/repository/license, corpus, document set, query set, ground-truth answers, rubrics, RAG pipeline configs, responses, results, judge config, grading scale, dataset family, RAG configuration, sample counts, small-sample warning, grade metrics, evidence coverage, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.13-r122 should be regenerated before using D-Star-AI/KITE-style, KITE, knowledge-intensive task evaluation, end-to-end RAG benchmark, corpus/query/rubric/judge, grade, dataset-family, RAG configuration, or live-drift claims as external evidence."
      },
      {
        version: "2026.06.13-r122",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds ARIASHA/MiRAGE-style drug-repositioning metric-validity gates so dataset release, train/test split, drug-disease mapping, drug and disease features, similarity matrices, negative sampling, classifier config, feature selection, score calculation, evaluation report, case-study validation, owner, sample-size, confidence-interval, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.13-r121 should be regenerated before using ARIASHA/MiRAGE-style, MiRAGE drug-repositioning, drug-disease association, biological-feature integration, hard-negative-mining, random-forest, feature-importance, score-calculation, or case-study metric-validity claims as external evidence."
      },
      {
        version: "2026.06.13-r121",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds BioKGBench-style biomedical KG replay receipts so source/repository/paper/license, dataset release, knowledge graph, KG build, KGCheck/KGQA/SCV task manifests, agent/RAG/Neo4j configs, evaluation scripts, result manifests, error-discovery reports, replay commands, CI receipts, deterministic seeds, metrics, thresholds, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.13-r120 should be regenerated before using westlake-autolab/BioKGBench-style, BioKGBench, biomedical KG checking, KGQA, SCV, BKGAgent-style, or biomedical knowledge-graph replay claims as external evidence."
      },
      {
        version: "2026.06.13-r120",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Rag-Eval-flow-style local RAG replay receipts so source/repository/license, pipeline config, data-source manifest, model config, judge config, metric definition, prompt template, eval-pack, fixture, replay command, result manifest, score-delta report, CI receipt, sample size, deterministic seed, replay pass rate, metric coverage, signed evidence, and row-hash proof is fail-closed.",
        migration: "Reports generated under 2026.06.13-r119 should be regenerated before using aizip/Rag-Eval-flow-style, local RAG evaluation, configurable RAG pipeline, data/model/judge/metric configured, prompt-template, sample-size, score-delta, replay-command, or CI replay claims as external evidence."
      },
      {
        version: "2026.06.13-r119",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds OSUniverse-style GUI-navigation live drift receipts so source/repository/license/paper, testcase, category, complexity level, agent and runner config, runtime image, dependency lock, validator, result, viewer, trajectory, screenshot, task success, automated validation, validation error, step-count, context distributions, signed evidence, and row-hash proof is fail-closed.",
        migration: "Reports generated under 2026.06.13-r118 should be regenerated before using agentsea/osuniverse-style, OSUniverse-style, GUI-navigation, desktop-agent, browser/terminal/multi-app task, automated-validation, runtime, trajectory, screenshot, or step-limit live drift claims as external evidence."
      },
      {
        version: "2026.06.13-r118",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Agentest-style scenario-test metric-validity proof so source/repository/license, endpoint contract, scenario, simulated-user persona, goal/knowledge, tool-mock, scripted-turn, trajectory-assertion, LLM-judge metric, comparison-run, CI-reporter, result artifact, owner, sample-size, confidence interval, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.13-r117 should be regenerated before using r-prem/agentest-style, Agentest-style, scenario-based testing, simulated-user, scripted multi-turn, tool-call mock, trajectory-assertion, LLM-as-judge, comparison-mode, or CI-reporter metric-validity claims as external evidence."
      },
      {
        version: "2026.06.13-r117",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds AI-agent benchmark comparison replay proof so source, repository, license, agent roster, benchmark dataset, source manifest, pricing/user-report/leaderboard/score manifests, eval pack, fixture, replay command, result, score-delta report, CI receipt, coverage metrics, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.13-r116 should be regenerated before using murataslan1/ai-agent-benchmark-style, AI Agents Benchmark, AI coding-agent comparison, SWE-Bench leaderboard context, pricing comparison, user-report synthesis, source-manifest, or AI-agent ranking replay claims as external evidence."
      },
      {
        version: "2026.06.13-r116",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Recovery-Bench-style live-drift proof so failed-trajectory replay, corrupted environment, recovery agent/model/run config, message mode, transcript, result, score report, recovery success/reward, evidence coverage, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.13-r115 should be regenerated before using letta-ai/recovery-bench-style, Recovery-Bench, failed-trajectory replay, corrupted-environment recovery, recovery-agent message-mode, Terminal-Bench, recovery success, or recovery reward live-drift claims as external evidence."
      },
      {
        version: "2026.06.13-r115",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Tavily-style web eval dataset metric-validity proof so generated-query, search-provider, retrieved-document, filter, QA generation, reference-answer, export-target, freshness, provider-diversity, source-coverage, answer-grounding, owner, confidence interval, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.13-r114 should be regenerated before using Eyalbenba/tavily-web-eval-generator-style, Tavily-style, web-search RAG eval dataset, generated-query, retrieved-document, QA-pair, local export, LangSmith export, freshness, source-coverage, or answer-grounding metric-validity claims as external evidence."
      },
      {
        version: "2026.06.13-r114",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds edge AI agent replay receipts so on-device multimodal-agent claims bind source, repository, license, device profile, runtime, optimization, dataset, task, application scenario, replay command, metric report, device/modality/runtime coverage, on-device/offline/privacy flags, latency, memory, energy, accuracy, replay pass rate, score delta, signed evidence, and row hashes.",
        migration: "Reports generated under 2026.06.13-r113 should be regenerated before using yh-yao/awesome-edge-ai-agents-style, edge AI agent, on-device multimodal-agent, mobile/embedded/wearable/IoT agent, inference-engine, optimization, benchmark/dataset, latency/memory/energy, or offline/privacy edge-agent replay claims as external evidence."
      },
      {
        version: "2026.06.13-r113",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Agent Bench-style Java coding-agent metric-validity proof so benchmark/source/license, Java tasks, YAML benchmarks, workspaces, isolated sandboxes, lifecycle traces, CLI-agent configs, cascaded judges, Maven/JUnit/JaCoCo checks, result manifests, accuracy/pass@k metrics, owners, confidence intervals, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.13-r112 should be regenerated before using spring-ai-community/agent-bench-style, Agent Bench, Java-centric coding-agent benchmark, isolated sandbox, YAML benchmark, cascaded judge, Maven, JUnit, JaCoCo, accuracy, or pass@k metric-validity claims as external evidence."
      },
      {
        version: "2026.06.13-r112",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Ollama-metrics-style live drift receipts so local LLM proxy and Prometheus sidecar claims bind source, repository, license, proxy, Ollama host, scrape, endpoint, baseline/live snapshots, alert policy, model/deployment, token, latency, time-per-token, loaded-model, memory, error-rate, distribution, threshold, signed evidence, and row hashes before public local-LLM observability maturity claims.",
        migration: "Reports generated under 2026.06.13-r111 should be regenerated before using NorskHelsenett/ollama-metrics-style, Ollama metrics sidecar, local LLM proxy, Prometheus token/latency/memory, model-loaded, Grafana dashboard, or local-model live-drift claims as external evidence."
      },
      {
        version: "2026.06.13-r111",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds MedAsk-style clinical benchmark replay receipts so SymptomCheck diagnostic and Triage urgency-classification claims bind source, repository, license, requirements, setup, vignette manifests, simulators, model configs, evaluation scripts, result manifests, paired analysis, run/replay commands, deterministic seeds, metrics, thresholds, signed evidence, and row hashes before public clinical-agent maturity claims.",
        migration: "Reports generated under 2026.06.13-r110 should be regenerated before using medaks/medask-benchmarks-style, MedAsk, SymptomCheck Bench, Triage Bench, OSCE-style diagnostic agent, top-5 differential diagnosis, clinical-vignette, or medical-triage replay claims as external evidence."
      },
      {
        version: "2026.06.13-r110",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Legal Code RAG metric-validity receipts so French legal-code RAG claims bind legal corpus, Legifrance source boundary, retriever, vector database, embedding model, windowing, hybrid-search, query-rewrite, routing, evaluation dataset, reference-answer, evaluator, metric-owner, sample/CI, signed evidence, and row hashes before public legal RAG maturity claims.",
        migration: "Reports generated under 2026.06.13-r109 should be regenerated before using HamzaG737/legal-code-rag-style, Legal Code RAG, French legal-code RAG, Legifrance-backed RAG, Qdrant-backed RAG, OpenAI or Mistral embedding legal RAG, windowing, hybrid-search, query-rewrite, routing, or legal RAG metric-validity claims as external evidence."
      },
      {
        version: "2026.06.13-r109",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Agent Workflow Kit-style workflow replay receipts so evaluation-first workflow claims bind source, repository, license, guide, skill-package/template manifests, risk-scoring, workflow-level, spec-layer, approval, verification-command, docs-check, evaluation, replay, signed evidence, and row hashes before public workflow maturity claims.",
        migration: "Reports generated under 2026.06.13-r108 should be regenerated before using crisxuan/agent-workflow-kit-style, Agent Workflow Kit, evaluation-first workflow, risk-score, workflow-level, AGENTS template, skill package, spec-layer, external-approval, verification-command, docs-check, or workflow replay claims as external evidence."
      },
      {
        version: "2026.06.13-r108",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Agent_Mont-style monitoring replay receipts so Agno/Crew AI monitoring claims bind source, repository, license, monitoring config, framework, task/run traces, token/cost/latency/resource/carbon/log/visualization artifacts, replay metrics, signed evidence, and row hashes before public benchmark or observability claims.",
        migration: "Reports generated under 2026.06.13-r107 should be regenerated before using ansarifaisal12/Agent_Mont-style, Agent Mont, Agno monitoring, Crew AI monitoring, token/cost/latency/resource/carbon observability, CLI/Streamlit visualization, or monitored-agent replay claims as external evidence."
      },
      {
        version: "2026.06.13-r107",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds A2A-NT-style agent-to-agent negotiation methodology boundaries so buyer/seller roles, product catalogs, budget and wholesale constraints, dialogue traces, offer extraction, deal judging, anomaly labels, provider usage, run manifests, clean-deal exclusions, signed evidence, and row hashes are required before public negotiation benchmark claims.",
        migration: "Reports generated under 2026.06.13-r106 should be regenerated before using ShenzheZhu/A2A-NT-style, A2A-NT, agent-to-agent negotiation, consumer-market transaction, buyer/seller delegation, price bargaining, budget-constraint, wholesale-constraint, anomaly-labeled, or clean-deal methodology claims as external evidence."
      },
      {
        version: "2026.06.13-r106",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds NoMIRACL-style multilingual RAG live-drift receipts so source, repository, license, dataset, language, qrels, passage, retrieval, model, generation, evaluation, baseline/live, alert-policy, relevance, abstention, hallucination, error, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.13-r105 should be regenerated before using project-miracl/nomiracl-style, NoMIRACL, multilingual RAG relevance, relevant/non-relevant subset, answerability, abstention, hallucination/error, or live-drift claims as external evidence."
      },
      {
        version: "2026.06.13-r105",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds ResearchHarness-style tool-using agent harness replay receipts so runtime contracts, tool surfaces, native tool-call traces, OpenAI-compatible API proof, workspace boundaries, trace manifests, benchmark adapters, provider matrices, baseline/meta-harness comparisons, replay metrics, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.13-r104 should be regenerated before using InternScience/ResearchHarness-style, ResearchHarness, tool-using agent harness, OpenAI-compatible API, workspace-first execution, flat trace, benchmark-adapter, model-provider matrix, or personal-assistant runtime replay claims as external evidence."
      },
      {
        version: "2026.06.13-r104",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds CloneMem-style long-term-memory replay receipts so non-conversational digital traces, persona/question/evidence manifests, bilingual coverage, task categories, temporal/unanswerable/trajectory metrics, replay commands, score deltas, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.13-r103 should be regenerated before using AvatarMemory/CloneMemBench-style, CloneMem, AI-clone memory, non-conversational digital traces, bilingual long-term memory, temporal/emotional/opinion tracking, trajectory analysis, or unanswerable memory QA replay claims as external evidence."
      },
      {
        version: "2026.06.13-r103",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds InferenceBench-style inference optimization metric-validity proof so scenario objectives, hardware budgets, server contracts, runtime backends, search spaces, baseline comparisons, quality gates, integrity gates, clean relaunches, latency/throughput/tail metrics, exploration traces, owners, confidence intervals, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.13-r102 should be regenerated before using aisa-group/InferenceBench-style, InferenceBench, inference-serving optimization, TTFT, TPOT, throughput, multi-objective, quality-gated, integrity-gated, clean-relaunch, or open-ended ML systems-engineering metric-validity claims as external evidence."
      },
      {
        version: "2026.06.13-r102",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds LLM workflow observability methodology-versioning proof so trace schemas, SDK instrumentation, workflow/span models, telemetry sampling and redaction, prompt/model registry snapshots, evaluation templates, monitoring windows, frontend analytics, user feedback, session replay, data-security boundaries, retention policies, migration guidance, signed evidence, and row hashes are required before public observability-backed score claims.",
        migration: "Reports generated under 2026.06.13-r101 should be regenerated before using AgiFlow-style, LLM QA, observability, visual-debugger, prompt/model performance, OpenTelemetry instrumentation, frontend analytics, user-feedback, session-replay, workflow-visualization, or production-monitoring methodology claims as external evidence."
      },
      {
        version: "2026.06.13-r101",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds warehouse-native LLM eval replay proof so dbt project/package manifests, warehouse adapter and AI-function manifests, capture schema, baseline versions, judge criteria, raw/evaluation/score/performance/drift/alert artifacts, no-egress policy, replay command, metrics, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.13-r100 should be regenerated before using dbt-llm-evals-style, warehouse-native LLM eval, dbt evaluation, warehouse AI function, LLM-as-judge, baseline-versioned, drift-detection, no-data-egress, or replay-corpus claims as external evidence."
      },
      {
        version: "2026.06.13-r100",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds scenario-simulation action-level replay proof so scenario project, scene, roles, participant policy, agent roster, LLM/evaluator/action-schema configs, task dataset, web UI, server/container/persistence/checkpoint artifacts, event/action traces, evaluation report, visualization artifact, replay command, resume proof, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.13-r99 should be regenerated before using leaf-playground-style, scenario simulation, human/LLM co-participation, action-level evaluation, web visualization, persistence, checkpoint-resume, or replay-corpus claims as external evidence."
      },
      {
        version: "2026.06.13-r99",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds SLDBench-style scaling-law discovery live-drift proof so benchmark/source, task, split, source-experiment, task/evolution/evaluator config, model-route, program, checkpoint, result, formula, extrapolation, R2, NMSE, NMAE, evidence coverage, context drift, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.13-r98 should be regenerated before using SLDBench-style, scaling-law discovery, AI-based scaling-law, autonomous scientific-discovery, R2/NMSE/NMAE, formula-discovery, extrapolation, or live-drift claims as external evidence."
      },
      {
        version: "2026.06.13-r98",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds BioAgentBench-style bioinformatics agent metric-validity proof so benchmark/source, task, dataset, truth/reference, workflow, environment, tool-version, harness, grader, result, perturbation, privacy, owner, confidence-interval, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.13-r97 should be regenerated before using bioagent-bench/bioagent-bench-style, BioAgentBench, bioinformatics agent benchmark, RNA-seq, variant-calling, metagenomics, workflow-reproduction, perturbation-robustness, privacy-constrained, or grader-based metric-validity claims as external evidence."
      },
      {
        version: "2026.06.13-r97",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds AIAnytime-style LLM/RAG multi-metric live-drift proof so eval-suite/run identity, candidate/reference manifests, semantic similarity, bias risk, hallucination/faithfulness metrics, judge config, report artifacts, evidence coverage, context drift, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.13-r96 should be regenerated before using AIAnytime/Evaluation-of-LLMs-and-RAGs-style, LLM evaluation, RAG evaluation, BERTScore-style, bias-evaluation, hallucination/faithfulness, or multi-metric live-drift claims as external evidence."
      },
      {
        version: "2026.06.13-r96",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds GeoBenchX-style geospatial provider-drift proof so benchmark id, task set, dataset snapshot, tool registry, reference solutions, tool-call traces, judge panel/config, human calibration, result report, token-cost report, complexity groups, solvable/unsolvable mix, tool counts, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.13-r95 should be regenerated before using Solirinai/GeoBenchX-style, GeoBenchX, geospatial tool-calling, GIS workflow, spatial-analysis, LLM-as-judge, solvable/unsolvable task, token-cost, or provider-drift canary claims as external evidence."
      },
      {
        version: "2026.06.13-r95",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds MobileBench-style mobile-agent metric-validity gates so environment, app inventory, API catalog, UI trace, task dataset, task complexity, multi-app task, checkpoint rubric/result, reset/device-state, license-boundary, owner, confidence-interval, signed evidence, and row-hash proof is fail-closed.",
        migration: "Reports generated under 2026.06.13-r94 should be regenerated before using Xiaomi/MobileBench-style, MobileBench, mobile-agent benchmark, Android automation, app/API/UI, multi-app task, checkpoint-metric, or device-fixture metric-validity claims as external evidence."
      },
      {
        version: "2026.06.13-r94",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds AICrypto-style cryptography benchmark methodology boundaries so MCQ, CTF, proof-task, expert-baseline, task-count, dataset-release, sandbox/toolchain, proof-rubric, scoring-formula, signed-evidence, and row-hash proof is required before public cryptography-capability benchmark claims.",
        migration: "Reports generated under 2026.06.13-r93 should be regenerated before using AICrypto-style, cryptography-capability, MCQ, CTF, proof-problem, vulnerability-exploitation, formal-reasoning, or expert-baseline benchmark claims as external evidence."
      },
      {
        version: "2026.06.13-r93",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Opik-style provider observability pipeline proof so provider-drift canaries fail closed on missing pipeline orchestrator/run, experiment tracker/run, observability project, datastore, retrieval index, content/summary/QA datasets, trace export, metric report, pipeline config, signed evidence, and row hashes.",
        migration: "Reports generated under 2026.06.13-r92 should be regenerated before using Opik-style, ZenML-style, Mongo-backed football-content evaluation, LLM observability pipeline, trace-export, experiment-tracked, or multi-metric provider-drift claims as external evidence."
      },
      {
        version: "2026.06.13-r92",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds ResearchGym-style research-run live drift receipts so task, pruned-repository, dataset, evaluation harness, grading, withheld-solution, runtime, adapter, workspace, transcript, budget, plan, inspection, violation, score-improvement, subtask-completion, distribution, signed evidence, and row-hash proof is fail-closed.",
        migration: "Reports generated under 2026.06.13-r91 should be regenerated before using ResearchGym-style, autonomous AI research, long-horizon research-agent, task-improvement, inspection, budget-control, or research-run live drift claims as external evidence."
      },
      {
        version: "2026.06.13-r91",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds DocThinker-style document and multimodal RAG memory replay receipts so carrier manifests, PDF processing, query routing, perception/reasoning traces, session KG, memory recall, observability, metrics, replay, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.13-r90 should be regenerated before using Yang-Jiashu/Doc-thinker-style, DocThinker, AutoThinkRAG, document RAG, multimodal document QA, adaptive retrieval, session-KG, evolving memory, or image-text reasoning replay claims as external evidence."
      },
      {
        version: "2026.06.13-r90",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds NIKA-style network troubleshooting metric-validity gates so benchmark/source, scenario, topology, incident, fault-injection, session, agent/tool, environment, metric, judge, batch, root-cause, localization, traffic workload, owner, confidence-interval, signed evidence, and row-hash proof is fail-closed.",
        migration: "Reports generated under 2026.06.13-r89 should be regenerated before using sands-lab/nika-style, NIKA, network troubleshooting benchmark, dynamic network incident, topology-tier, fault-injection, root-cause localization, MCP/tool, or batch-evaluation metric-validity claims as external evidence."
      },
      {
        version: "2026.06.13-r89",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds AD-GEN-style SOC dataset replay integrity boundaries so repository, release, source corpus, LAB/REAL dataset, conversion, labeling, schema, ATT&CK mapping, SOC action, validation, label-quality, cross-model audit, license, replay, quality metric, signed evidence, and row-hash proof is required before public SOC-agent benchmark claims.",
        migration: "Reports generated under 2026.06.13-r88 should be regenerated before using namhop88/AD-GEN-style, SOC endpoint telemetry narrative, ATT&CK-aligned narrative, LLM SOC automation, validated synthetic analyst label, supported SOC action, label-quality, cross-model SOC audit, or LAB/REAL dataset split claims as external evidence."
      },
      {
        version: "2026.06.13-r88",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds a RagScore-style RAG audit methodology-versioning boundary so generated QA datasets, source documents, support spans, endpoint contracts, judge configs, per-question results, detailed metrics, failure diagnosis, retriever/generator attribution, privacy mode, MCP/server telemetry boundaries, exports, thresholds, signed evidence, and row hashes are required before public RAG audit score claims.",
        migration: "Reports generated under 2026.06.13-r87 should be regenerated before using HZYAI/RagScore-style, RAG audit, generated-QA, endpoint RAG evaluation, detailed RAG metric, failure-diagnosis, support-span grounding, local LLM RAG evaluation, privacy-first RAG evaluation, or MCP RAG audit claims as external evidence."
      },
      {
        version: "2026.06.13-r87",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds BenchLoop-style local benchmark replay receipts so repository/package snapshots, frozen suite/task/scorer manifests, harness/provider/model configs, machine/run/output/metric artifacts, agent-loop/tool-call/token-latency traces, persistence/export proof, local quality/speed/reliability/agent metrics, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.13-r86 should be regenerated before using outsourc-e/bench-loop-style, BenchLoop, local-first LLM benchmark, local hardware benchmark, OpenAI-compatible endpoint benchmark, agent loop benchmark, token latency, tokens-per-second, suite/harness/provider, leaderboard/export, or local benchmark score claims as external evidence."
      },
      {
        version: "2026.06.13-r86",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds an M2RAG-style multimodal RAG methodology-versioning boundary so mixed text/image corpus provenance, retrieval and element-selection, image processing, modality representation, output-image policy, evaluator/rubric, text-modal and image metrics, overall-score formula, thresholds, signed evidence, and row hashes are required before public multimodal RAG score claims.",
        migration: "Reports generated under 2026.06.13-r85 should be regenerated before using maziao/M2RAG-style, multimodal RAG, mixed text/image retrieval, multimodal generation, image-grounded answer quality, image-interleaving, text-modal metric, image coherence, image helpfulness, image reference, image recall, or multimodal benchmark score claims as external evidence."
      },
      {
        version: "2026.06.13-r85",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds DB context enrichment replay receipts so schema discovery, ContextSet/templates/facets/value-search artifacts, Evalbench configs, LLM-rater configs, hill-climb mutation proof, final validation, SQL accuracy, context reuse, executable SQL, hallucinated-column, replay pass, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.13-r84 should be regenerated before using GoogleCloudPlatform/db-context-enrichment-style, Context Engineering Agent, ContextSet, schema discovery, templates, facets, value searches, Evalbench, hill-climbing, final validation, natural-language-to-SQL context enrichment, executable SQL, or hallucinated-column replay claims as external evidence."
      },
      {
        version: "2026.06.13-r84",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds FreshStack-style IR/RAG retrieval replay receipts so repository, paper, query/corpus datasets, StackOverflow query and GitHub corpus manifests, licenses, BEIR/qrels, chunking, retriever, index, runfile, evaluator, metrics, leaderboard, replay command, alpha-nDCG, coverage, recall, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.13-r83 should be regenerated before using fresh-stack/freshstack-style, FreshStack, IR, RAG retrieval, StackOverflow query, GitHub corpus, BEIR, qrels, dense retrieval, multi-vector retrieval, alpha-nDCG, coverage, recall, or leaderboard replay claims as external evidence."
      },
      {
        version: "2026.06.13-r83",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds JudgeIt-style LLM-as-judge replay receipts so dataset, golden/generated text, pipeline, judge model, rubric, human-eval reference, batch/export/metric, replay command, precision/recall/F1, false-negative, blackbox/whitebox/negative-test, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.13-r82 should be regenerated before using ibm-self-serve-assets/JudgeIt-LLM-as-a-Judge-style, LLM-as-judge, RAG, query-rewrite, Text2SQL, agentic workflow, blackbox, whitebox, negative-testing, human-alignment, batch evaluation, or GenAI pipeline replay claims as external evidence."
      },
      {
        version: "2026.06.13-r82",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds GuardBench-style guardrail metric-validity gates so benchmark identity, dataset/access/format proof, moderation contract, guardrail model config, threshold config, prediction scores, metric suite, confusion matrix, language coverage, export report, owner, confidence interval, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.13-r81 should be regenerated before using AmenRa/GuardBench-style, guardrail model, prompt moderation, 40-dataset, metric suite, precision/recall/F1/MCC/AUPRC/sensitivity/specificity/G-Mean/FPR/FNR, leaderboard, export-table, or guardrail benchmark metric-validity claims as external evidence."
      },
      {
        version: "2026.06.13-r81",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds BackdoorAgent-style stage-aware backdoor live-drift receipts so attack success, clean accuracy, trigger persistence, trigger propagation, trajectory coverage, evidence coverage, stage/task/attack-family drift, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.13-r80 should be regenerated before using Yunhao-Feng/BackdoorAgent-style, stage-aware backdoor, planning/memory/tool-use attack, trigger persistence, trigger propagation, attack-success-rate, clean-accuracy, or agent backdoor benchmark live-drift claims as external evidence."
      },
      {
        version: "2026.06.13-r80",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds PIArena-style prompt-injection live-drift receipts so attack success, defense block, false positives, agent task success, tool-call success, evidence coverage, attack/defense/dataset/agent-benchmark drift, signed evidence, and row hashes fail closed.",
        migration: "Reports generated under 2026.06.13-r79 should be regenerated before using sleeepeer/PIArena-style, prompt-injection, attack/defense, search-based attack, InjecAgent, AgentDojo, AgentDyn, or agent prompt-injection benchmark live-drift claims as external evidence."
      },
      {
        version: "2026.06.13-r79",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds MIRAGE-style RAG metric-validity gates so benchmark identity, dataset, QA-pair, context-pool, retrieval-pool, base/oracle/mixed protocol, retriever/model configs, LLM/retriever/MIRAGE metric reports, score formula, owner, sample-size, confidence-interval, signed-evidence, and row-hash proof fail closed.",
        migration: "Reports generated under 2026.06.13-r78 should be regenerated before using nlpai-lab/MIRAGE-style, metric-intensive RAG, base/oracle/mixed RAG setup, noise-vulnerability, context-acceptability, context-insensitivity, context-misinterpretation, retriever-dependency, or overall RAG score claims as external evidence."
      },
      {
        version: "2026.06.13-r78",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds DeepMath-style math-agent replay receipts so sandbox, executor, GRPO, vLLM, dataset, run-config, output, metric, replay, signed-evidence, and row-hash proof fail closed.",
        migration: "Reports generated under 2026.06.13-r77 should be regenerated before using IntelLabs/DeepMath-style, math-agent, sandboxed Python executor, GRPO, vLLM, majority@16, output-length reduction, or math benchmark replay claims as external evidence."
      },
      {
        version: "2026.06.13-r77",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds PhysicianBench-style clinical EHR live-drift receipts so Watch fails closed on missing FHIR server/API, patient-record, patient-cohort, checkpoint, trajectory, workspace, eval-log, metadata, model, tool, run-config, metric, signed-evidence, and row-hash proof.",
        migration: "Reports generated under 2026.06.13-r76 should be regenerated before using HealthRex/PhysicianBench-style, clinical EHR agent, FHIR-backed workflow, specialty task, checkpoint pass-rate, clinical-action safety, documentation quality, or website trajectory claims as external evidence."
      },
      {
        version: "2026.06.13-r76",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds AgentBench-style replay receipts so config-pinned agent benchmark rows fail closed on missing source, repository, dataset, agent/global/model-server/environment/dependency, run/replay command, trace, result, metric, seed, sample, shuffle, replay-pass, trace-coverage, signed-evidence, and row-hash proof.",
        migration: "Reports generated under 2026.06.13-r75 should be regenerated before using AgentBench-style, dynamic-reasoning agent benchmark, config-pinned benchmark, trace-saved benchmark, sample-controlled replay, or aggregate agent benchmark score claims as external evidence."
      },
      {
        version: "2026.06.13-r75",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds ADK runtime live-drift receipts so TypeScript agent-runtime evaluations fail closed on missing runtime, framework, graph, tool registry, eval dataset/case, runner, session, live queue, API route, deployment, model-route, execution-mode, metric, signed-evidence, and row-hash proof.",
        migration: "Reports generated under 2026.06.13-r74 should be regenerated before using ADK TypeScript runtime, code-first agent, streaming, graph-visualized, tool-calling, deployment-ready, or built-in-evaluation live-drift claims as external evidence."
      },
      {
        version: "2026.06.13-r74",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds an enterprise agent evaluation interop score-claim boundary so dataset, test-case, agent registration, endpoint contract, evaluation-run, MCP/tool registry, tool-call trace, response artifact, metric manifest, persistence/export, signed evidence, and row-hash proof is required before public interop claims.",
        migration: "Reports generated under 2026.06.13-r73 should be regenerated before using EvalsforAgentsInterop-style, enterprise productivity-agent, registered-agent evaluation, MCP tool-evaluation, dataset-tested agent, webapp result, or cross-agent eval platform claims as external evidence."
      },
      {
        version: "2026.06.13-r73",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds graph-eval judge calibration proof receipts so node graphs, scan and metric nodes, aggregation/report/cache/model-routing/prompt/parser/cost/dataset/execution/schema hashes, metric branch coverage, per-case report coverage, cost-estimate drift, signed evidence, and proof hashes are fail-closed.",
        migration: "Reports generated under 2026.06.13-r72 should be regenerated before using graph-eval, cache-aware evaluation, per-case report, metric-branch, GEval, LLM-as-judge, or cost-estimated judge-calibration claims as external evidence."
      },
      {
        version: "2026.06.13-r72",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds chaos-reliability live-drift receipts so benchmark, scenario, chaos profile, injection plan, mutation manifest, endpoint contract, judge config, trace bundle, score ledger, agent card, improvement eval, framework, modality, benchmark family, production reliability, resilience score, chaos drop, recovery pass rate, failure trace coverage, context drift, signed evidence, and row hashes are fail-closed.",
        migration: "Reports generated under 2026.06.13-r71 should be regenerated before using EvalMonkey-style, chaos-engineering, failure-injection, production-reliability, agent-card, improvement-eval, benchmark-resilience, or chaos-drop live-drift claims as external evidence."
      },
      {
        version: "2026.06.13-r71",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds agent-testing methodology live-drift receipts so testing taxonomy, methodology, scenario catalog, fault-injection plan, observability plan, safety plan, standards map, category, approach, fault model, benchmark family, coverage metrics, resilience pass rate, safety-regression rate, observability coverage, context drift, signed evidence, and row hashes are fail-closed.",
        migration: "Reports generated under 2026.06.13-r70 should be regenerated before using awesome-ai-agent-testing-style, methodology-coverage, scenario-coverage, fault-injection, resilience, safety-regression, observability-signal, or testing-taxonomy live-drift claims as external evidence."
      },
      {
        version: "2026.06.13-r70",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds an external-source verification policy to the public methodology so source-backed score, benchmark, and documentation claims disclose live verification status, reject metadata-only parity, handle unavailable sources, and preserve legal no-copy boundaries.",
        migration: "Reports generated under 2026.06.13-r69 should be regenerated before using repository-search metadata, cached snippets, stale source summaries, unavailable source reviews, source-backed methodology changes, or external-source parity claims as public evidence."
      },
      {
        version: "2026.06.13-r69",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Dokimos-style test-suite question-explainability lenses so suite identity, language/framework/adapter, dataset and test-case hashes, evaluator config, judge context, experiment results, export artifacts, CI proof, agent trace/tool-call validation, pass-rate and score thresholds, cost/latency/tokens, accepted/rejected evidence, repair hints, and row hashes are fail-closed per question.",
        migration: "Reports generated under 2026.06.13-r68 should be regenerated before using Dokimos-style, test-suite, JUnit, CI evaluation, dataset-backed evaluator, agent trace, tool-call validation, experiment export, or JVM agent-evaluation question-explainability claims as external evidence."
      },
      {
        version: "2026.06.13-r68",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Hermes-style agent-security control live-drift receipts so guard, policy, taint, proxy, audit, telemetry, eval-pack, classifier, origin/taint coverage, policy accuracy, secret-scrub, audit integrity, attack-effectiveness, false-positive, latency, context drift, signed evidence, and row hashes are fail-closed.",
        migration: "Reports generated under 2026.06.13-r67 should be regenerated before using Hermes-style, agent-security control, taint-tracking, proxy-secret-guard, policy-engine, audit-trail, attack-effectiveness, false-positive, or security-control live-drift claims as external evidence."
      },
      {
        version: "2026.06.13-r67",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds BenchJack-style benchmark-hackability audit replay receipts so scanner identity, target benchmark, phase traces, static-tool reports, AI inspection, vulnerability classes, dashboard/report artifacts, replay command, sandbox controls, PoC validation, task coverage, exploitability thresholds, signed evidence, and row hashes are fail-closed.",
        migration: "Reports generated under 2026.06.13-r66 should be regenerated before using benchmark-hackability audit, reward-hacking scan, static-plus-AI scanner, vulnerability-class coverage, PoC-validation, sandbox-control, dashboard-stream, or exploitability-threshold replay claims as external evidence."
      },
      {
        version: "2026.06.13-r66",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds comparative coding-agent report replay receipts so report/source identity, source materials, standardized prompt, agent roster, scoring rubric, category score manifest, implementation artifacts, screenshots, report artifacts, replay commands, agent coverage, category coverage, recommendation use cases, normalized score thresholds, signed evidence, and row hashes are fail-closed.",
        migration: "Reports generated under 2026.06.13-r65 should be regenerated before using comparative coding-agent report, standardized-prompt, agent-roster, implementation-artifact, screenshot-manifest, category-score, use-case recommendation, or professional-scoring replay claims as external evidence."
      },
      {
        version: "2026.06.13-r65",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds PinchBench-style benchmark-submission question explainability so benchmark/source identity, submission metadata, agent version, timestamp, task category/status, grading type, criterion scores, leaderboard metric views, score/speed/cost fields, replay hashes, accepted/rejected evidence, repair hints, and row hashes are fail-closed per question.",
        migration: "Reports generated under 2026.06.13-r64 should be regenerated before using PinchBench-style, benchmark-submission, task-breakdown, criterion-scoring, leaderboard-view, score/speed/cost, or submission-detail question-explainability claims as external evidence."
      },
      {
        version: "2026.06.13-r64",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Eval-ai-library-style provider-drift evaluator framework proof so framework/version, provider route, metric suite, metric ids/count, evaluator config, generated test data, verdict aggregation, dashboard artifact, signed evidence, row hashes, alerts, and waivers are fail-closed.",
        migration: "Reports generated under 2026.06.13-r63 should be regenerated before using Eval-ai-library-style, provider evaluator framework, multi-provider metric-suite, generated test-data, temperature-controlled verdict aggregation, dashboard artifact, or evaluator-library provider-drift claims as external evidence."
      },
      {
        version: "2026.06.13-r63",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds AutoResearchBench-style scientific literature discovery metric-validity gates so benchmark, deep/wide task, dataset, obfuscation, corpus, search-backend, DeepXiv/web-search tool, agent, inference, evaluation-pipeline, deep-search accuracy, wide-search IoU, result-report, owner, confidence-interval, signed evidence, and row-hash proof is fail-closed.",
        migration: "Reports generated under 2026.06.13-r62 should be regenerated before using AutoResearchBench-style, scientific literature discovery, deep research, wide research, DeepXiv, search-backend, literature-corpus, deep-search accuracy, or wide-search IoU metric-validity claims as external evidence."
      },
      {
        version: "2026.06.13-r62",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds SkillBench-style adversarial skill regression replay receipts so source refs, skill manifests, baseline and with-skill agent configs, eval suites/cases, deterministic graders, static-analysis and security-scan proof, outputs, rerun outputs, result reports, replay commands, release gates, expected decisions, deterministic seeds, correctness/security/completeness/robustness metrics, score deltas, thresholds, signed evidence, and row hashes are fail-closed.",
        migration: "Reports generated under 2026.06.13-r61 should be regenerated before using SkillBench-style, adversarial skill benchmark, with-skill versus without-skill, deterministic grader, biomedical skill eval, skill security score, or skill regression-gate claims as external evidence."
      },
      {
        version: "2026.06.13-r61",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds RAG chunking-strategy replay receipts so document/question/reference-answer proof, chunker manifests, embedding and keyword-index configs, retrieval-fusion traces, scoring configs/reports, exports, replay commands, deterministic seeds, strategy coverage, combined-score, answer-span coverage, semantic-focus metrics, thresholds, signed evidence, and row hashes are fail-closed.",
        migration: "Reports generated under 2026.06.13-r60 should be regenerated before using chunk-norris-style, RAG chunking-strategy, best-chunker, hybrid-retrieval ranking, answer-span coverage, semantic-focus, or chunker-comparison replay claims as external evidence."
      },
      {
        version: "2026.06.13-r60",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds PersonaGym-style persona-agent metric-validity gates so persona manifests, static environments, benchmark questions, persona-agent/model-provider configs, response traces, rubrics, PersonaScore-style metric definitions, human-alignment calibration, evaluation outputs, benchmark results, owners, confidence intervals, signed evidence, and row hashes are fail-closed.",
        migration: "Reports generated under 2026.06.13-r59 should be regenerated before using PersonaGym-style, PersonaScore, persona-agent, persona-adherence, static-environment, persona-benchmark, or human-aligned persona evaluation claims as external evidence."
      },
      {
        version: "2026.06.13-r59",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Text2SQL business-database replay receipts so database snapshots, schema and business-domain manifests, query/reference/result proof, schema-memory retrieval traces, SQL governance, security controls, audit logs, execution artifacts, replay commands, deterministic seeds, accuracy/grounding/safety metrics, thresholds, signed evidence, and row hashes are fail-closed.",
        migration: "Reports generated under 2026.06.13-r58 should be regenerated before using QueryMind-style, Text2SQL, business-database, schema-retrieval, SQL-governance, RLS, injection-control, BIRD-SQL, or database-agent replay claims as external evidence."
      },
      {
        version: "2026.06.13-r58",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds ML-development workflow replay receipts so benchmark identity, paper/source refs, task suites, categories, domains, workspace/runtime/dependency proof, agent/Calipers/Hydra/metrics/scoring configs, validation and replay commands, deterministic seeds, reports, traces, metrics, pass rates, thresholds, signed evidence, and row hashes are fail-closed.",
        migration: "Reports generated under 2026.06.13-r57 should be regenerated before using ML-Dev-Bench-style, Calipers, Hydra, ML workflow, dataset-handling, model-training, debugging, API-integration, or performance-improvement replay claims as external evidence."
      },
      {
        version: "2026.06.13-r57",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds web-agent privacy leakage live-drift receipts so benchmark, dataset, task config, browser environment, observation mode, action set, cookie/reset state, data-minimization policy, allowed/sensitive manifests, trajectory, result, leakage judge, model route, captioning proof, minimization/leakage/task metrics, evidence coverage, and environment/observation/context drift are fail-closed.",
        migration: "Reports generated under 2026.06.13-r56 should be regenerated before using AgentDAM-style, data-minimization, privacy-leakage, browser-agent privacy, WebArena/VisualWebArena-style, accessibility-tree, image/SoM, or privacy-aware prompt live-drift claims as external evidence."
      },
      {
        version: "2026.06.13-r56",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds 12-technique evaluator live-drift receipts so exact match, LLM-as-judge, structured validation, dynamic ground truth, trajectory, tool, RAG, real-time feedback, pairwise, simulation, and algorithmic-feedback evaluator rows carry signed evidence, row hashes, metric drops, coverage gates, and technique/context drift alerts.",
        migration: "Reports generated under 2026.06.13-r55 should be regenerated before using agent-evaluation technique, LangChain/LangSmith evaluator, trajectory-evaluation, pairwise-comparison, simulation-benchmark, RAGAS, or algorithmic-feedback live-drift claims as external evidence."
      },
      {
        version: "2026.06.13-r55",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Terrarium-style living-environment metric-validity gates so task programs, mutable environment manifests, capability/sandbox/agent-adapter proof, multi-turn trajectories, stage checkers, trial results, aggregate metrics, pass@k, proactive triggers, owners, confidence intervals, signed evidence, and row hashes are fail-closed.",
        migration: "Reports generated under 2026.06.13-r54 should be regenerated before using Terrarium, living environment, mutable workflow, multi-turn environment, proactive agent, stage-checker, trial-result, pass@k, or stateful workflow benchmark claims as external evidence."
      },
      {
        version: "2026.06.13-r54",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds REALTALK-style long-term conversation replay receipts so real-dialogue provenance, privacy/consent, temporal splits, LoCoMo comparison, memory-probing QA/evaluator artifacts, persona-simulation release proof, emotional-intelligence artifacts, metrics, signed evidence, and row hashes are fail-closed.",
        migration: "Reports generated under 2026.06.13-r53 should be regenerated before using REALTALK, long-term conversation, real-world chat, memory-probing, persona-simulation, emotional-intelligence, LoCoMo comparison, 21-day dialogue, or real-dialogue replay claims as external evidence."
      },
      {
        version: "2026.06.13-r53",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds CPU-centric agentic workload live-drift receipts so workload family, framework/runtime/schedule, environment, conda, hardware, system requirements, model-server and API-key boundary proof, workload/dataset/tool/run/result manifests, latency percentiles, throughput, CPU/GPU utilization, memory, bottleneck share metrics, signed evidence, and row hashes are fail-closed.",
        migration: "Reports generated under 2026.06.13-r52 should be regenerated before using CPU-centric, agentic workload, vLLM, LangChain, Haystack, Mini-SWE-Agent, Toolformer, ChemCrow, throughput, latency, resource-utilization, or bottleneck live-drift claims as external evidence."
      },
      {
        version: "2026.06.13-r52",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Polymath-style logic benchmark replay receipts so symbolic reasoning datasets, dataset access, license, environment setup, inference-provider boundary, tool manifests, replay commands, outputs, ZeroEval evidence, deterministic seeds, task counts, accuracy, solver agreement, tool-use coverage, replay pass rates, signed evidence, and row hashes are fail-closed.",
        migration: "Reports generated under 2026.06.13-r51 should be regenerated before using Polymath, FOLIO, ZebraLogicBench, constraint-solver, symbolic-reasoning, logic-agent, ZeroEval, or replayed logic benchmark claims as external evidence."
      },
      {
        version: "2026.06.13-r51",
        date: "2026-06-13",
        summary: "Adds RAG QA dataset-builder live-drift receipts so source-document, license, QA-pair, passage, config, tier, question-type, build-stage, grounding, human-verification, citation, answer-support, cost, concurrency, count, and row-hash evidence are fail-closed.",
        migration: "Reports generated under 2026.06.13-r50 should be regenerated before using RAG QA dataset-builder, tiered QA, multi-hop/wide question, passage-grounding, human-verification, citation, answer-support, or dataset-generation cost live-drift claims as external evidence."
      },
      {
        version: "2026.06.13-r50",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds a trace-derived agent-evaluation metric-validation gate so Bedrock Converse-style model configs, agent parameters, tools, traces, repeatable cases, dynamic validators, bulk runs, permutations, mock controls, metrics, exports, production monitors, alarms, owners, sample sizes, confidence intervals, and row hashes are fail-closed.",
        migration: "Reports generated under 2026.06.13-r49 should be regenerated before using trace-derived agent-evaluation, Bedrock Converse, repeatable-case, bulk-run, mocked-LLM, production-monitor, CloudWatch-style metric, or threshold-alarm claims as external evidence."
      },
      {
        version: "2026.06.13-r49",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds RedTeam-style adversarial benchmark regression receipts so benchmark identity, question-set and reference-answer manifests, scoring configs and modes, provider/model configs, result exports, optional prompt optimization, judge rubric, semantic/refusal/hallucination scores, rerun output, release gate, signed evidence, and row hashes are fail-closed.",
        migration: "Reports generated under 2026.06.13-r48 should be regenerated before using red-team benchmark, offensive-security eval, uncensoredness, prompt-optimization, semantic-scoring, or release-gate regression claims as external evidence."
      },
      {
        version: "2026.06.13-r48",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds an Apex-style pentest and threat-model metric-validation gate so Dockerized app manifests, language-stack coverage, vulnerability-class coverage, difficulty distribution, multi-step chains, flag and threat-model ground truth, false-positive traps, security controls, execution traces, threat-model reports, owners, sample sizes, confidence intervals, and row hashes are fail-closed.",
        migration: "Reports generated under 2026.06.13-r47 should be regenerated before using pentest-agent, threat-model, vulnerable-app, multi-step exploit-chain, flag-ground-truth, false-positive-trap, or security-control metric-validity claims as external evidence."
      },
      {
        version: "2026.06.13-r47",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds VLA/world-model replay receipts so survey taxonomy, paradigm, metric family, foundation model, manifests, traces, simulator/reward proof, policy config, replay command, deterministic seed, counts, trajectory coverage, task success, world-model score, thresholds, and row hashes are fail-closed.",
        migration: "Reports generated under 2026.06.13-r46 should be regenerated before using VLA, world-model, embodied-AI survey, world-planner, world-action-model, world-synthesizer, world-simulator, trajectory, or simulation-reward replay claims as external evidence."
      },
      {
        version: "2026.06.13-r46",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds legal-agent live-drift receipts so legal corpus/task/difficulty/tool context, final success, process rate, tool-use accuracy, citation coverage, evidence coverage, token cost, distribution drift, and row hashes are fail-closed.",
        migration: "Reports generated under 2026.06.13-r45 should be regenerated before using LegalAgentBench-style, legal-domain agent, multi-hop legal reasoning, legal writing, process-rate, planning-tree, or legal-tool live-drift claims as external evidence."
      },
      {
        version: "2026.06.13-r45",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds typed continual-game learning metric-validity proof so task sequence, environment, controller, longitudinal run, game build, mod manifest, LLM config, prompt language, memory, conversation logs, run summaries, gameplay logs, decision traces, outcome metrics, improvement trends, fallback controls, run counts, confidence intervals, and row hashes are fail-closed.",
        migration: "Reports generated under 2026.06.13-r44 should be regenerated before using TokenSpire2-style game-agent, cross-run memory, gameplay-log, run-summary, floor-progression, self-improvement, or continual-learning validity claims as external evidence."
      },
      {
        version: "2026.06.13-r44",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds web-operator live-drift receipts so self-report success, independent LLM evaluation success, self-report overclaim, mismatch rate, task reliability, replay coverage, task time, step-limit violations, provider/context drift, and row hashes are fail-closed.",
        migration: "Reports generated under 2026.06.13-r43 should be regenerated before using web-operator, browser-agent, WebVoyager-style, self-report, judge-evaluation, replay-artifact, task-reliability, or step-limit live-drift claims as external evidence."
      },
      {
        version: "2026.06.13-r43",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds GAGE-style unified evaluation replay receipts so engine/run identity, modality, harness mode, configs, registry, dataset, backend, adapter, metrics, output contracts, events, samples, summaries, artifact manifests, replay commands, seeds, counts, coverage, score thresholds, and row hashes are fail-closed.",
        migration: "Reports generated under 2026.06.13-r42 should be regenerated before using unified evaluation-engine, Game Arena, AgentKitV2, external-harness, multimodal, audio, diffusion, or replayable-artifact claims as external evidence."
      },
      {
        version: "2026.06.13-r42",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Advanced RAG notebook replay receipts so course/lesson identity, notebook/output, environment/dependency, corpus/index/query/reference-answer, retrieval/generation/eval/observability traces, replay command, seed, query count, RAG triad metrics, thresholds, and row hashes are fail-closed.",
        migration: "Reports generated under 2026.06.13-r41 should be regenerated before using Advanced RAG, RAG triad, sentence-window, auto-merging, or notebook-based RAG replay claims as external evidence."
      },
      {
        version: "2026.06.13-r41",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds SRE incident-triage question-explainability lenses so OpenEnv scenario proof, raw logs, metrics, user reports, action payloads, deterministic graders, feedback, reward/root-cause/red-herring/ordered-remediation thresholds, step bounds, evidence refs, repair hints, and row hashes are fail-closed per question.",
        migration: "Reports generated under 2026.06.13-r40 should be regenerated before using SRE incident-triage, root-cause analysis, red-herring filtering, or ordered-remediation question-level claims as external evidence."
      },
      {
        version: "2026.06.13-r40",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds DeepResearch-style progressive-search replay receipts so workflow, LLM/search/local runtime configs, context assembly artifacts, task plans, progressive-search traces, tool-call traces, knowledge extraction, cross-evaluation, iteration logs, report artifacts, lockfiles, replay commands, seeds, source counts, hallucination checks, final report scores, and row hashes are fail-closed.",
        migration: "Reports generated under 2026.06.13-r39 should be regenerated before using progressive-search, deep-research, cross-evaluation, local-deployment, or final-report replay claims as external evidence."
      },
      {
        version: "2026.06.13-r39",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds observability/SRE live-drift receipts so o11y-bench-style task specs, generated tasks, Grafana stack configs, scenario clocks, trajectories, stdout, grading details, rewards, result JSON, HTML reports, deterministic checks, rubric scores, resolution scores, data-source distributions, and tool-mode distributions are fail-closed.",
        migration: "Reports generated under 2026.06.13-r38 should be regenerated before using observability, SRE, Grafana, Prometheus, Loki, Tempo, scenario-clock, or o11y-bench-style live drift claims as external evidence."
      },
      {
        version: "2026.06.13-r38",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds ClawEnvKit-style environment-generation replay receipts so generated task configs, task schemas, generation prompts, fixture manifests, mock services, audit logs, trajectories, verification/scoring/safety configs, harness tiers, Docker or agent-loop proof, replay commands, seeds, counts, component scores, final scores, safety gates, and row hashes are fail-closed.",
        migration: "Reports generated under 2026.06.13-r37 should be regenerated before using environment-generation, generated-harness, mock-service, audit-log, or ClawEnvKit-style replay claims as external evidence."
      },
      {
        version: "2026.06.13-r37",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds Azure agent-lab replay receipts so lab/module identity, workshop and notebook hashes, Azure service/project/search/RAG/tool/evaluator configs, cloud-run artifacts, identity proof, replay commands, seeds, scenario counts, scores, groundedness thresholds, and row hashes are fail-closed.",
        migration: "Reports generated under 2026.06.13-r36 should be regenerated before using Azure agent-lab, workshop, cloud RAG, or evaluation-design replay claims as external evidence."
      },
      {
        version: "2026.06.13-r36",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds AI-coding landscape question-explainability lenses so source category, dataset refs and hashes, update cadence, freshness, cohorts, benchmark/tool/model refs, accepted evidence, rejected-evidence reasons, repair hints, and row hashes are fail-closed for fast-moving coding-agent and leaderboard claims.",
        migration: "Reports generated under 2026.06.13-r35 should be regenerated before using AI-coding landscape, coding-agent category, or leaderboard question-level claims as external evidence."
      },
      {
        version: "2026.06.13-r35",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds local-system monitor live-drift receipts so monitor/device/hardware/process/sensor/alert proof, workload and hardware context, thermal-baseline deviation, voltage SPC anomalies, process identity, ghost-driver handling, proactive alerts, local-only privacy, signed evidence, and row hashes are fail-closed.",
        migration: "Reports generated under 2026.06.13-r34 should be regenerated before using local-system monitor live-drift claims as external evidence."
      },
      {
        version: "2026.06.13-r34",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds a Tribunal-style evaluator-suite metric-validation gate so deterministic assertions, LLM judges, safety assertions, red-team attacks, dataset eval manifests, custom judges, reporter outputs, framework integrations, thresholds, owners, sample sizes, and confidence intervals are row-hashed and fail-closed.",
        migration: "Reports generated under 2026.06.13-r33 should be regenerated before using evaluator-suite metric-validity claims as external evidence."
      },
      {
        version: "2026.06.13-r33",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds PawBench-style model-harness replay receipts so task taxonomy, model/harness identity, grader proof, transcripts, metrics, submissions, slice payloads, replay commands, result-version paths, seeds, and preservation artifacts are row-hashed and fail-closed.",
        migration: "Reports generated under 2026.06.13-r32 should be regenerated before using model-harness benchmark replay claims as external evidence."
      },
      {
        version: "2026.06.13-r32",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds document-to-dataset live drift receipts so document corpus/index manifests, document/page/cell records, generated QA/Summary/RAG samples, export artifacts, numeric integrity, bench/report metrics, efficiency, throughput, memory, and task/format/export context drift are row-hashed and fail-closed.",
        migration: "Reports generated under 2026.06.13-r31 should be regenerated before using document-to-dataset live drift alerts as external evidence."
      },
      {
        version: "2026.06.13-r31",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds an embodied-agent metric-validation gate so simulator benchmark metrics disclose task-type coverage, simulator environment, scene or dataset package, random/human/model baselines, action-observation trajectories, result folders, overall and task-type metric reports, owner, sample size, and confidence interval evidence.",
        migration: "Reports generated under 2026.06.13-r30 should be regenerated before using embodied-agent simulator benchmark metrics as external evidence."
      },
      {
        version: "2026.06.13-r30",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds agentic-search live drift receipts so planning, query decomposition, relevance, synthesis, citation coverage, trace coverage, dataset-family mix, query-type mix, and tool-context drift are row-hashed and fail-closed.",
        migration: "Reports generated under 2026.06.13-r29 should be regenerated before using agentic-search live drift alerts as external evidence."
      },
      {
        version: "2026.06.13-r29",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds an architecture-reality metric-validation gate so agent architecture metrics disclose wrapper, marketing, real-agent, planning, memory, recovery, stress, network, cost, ensemble, and statistical-confidence evidence.",
        migration: "Reports generated under 2026.06.13-r28 should be regenerated before using architecture-reality metrics as external evidence."
      },
      {
        version: "2026.06.13-r28",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds an opt-in RAG evaluation-pipeline metric-validation gate so RAG pipeline claims disclose ground-truth question/answer sets, pipeline config, metric definitions, query/retrieval/generation traces, evaluation report, metric owner, sample size, and confidence interval evidence.",
        migration: "Reports generated under 2026.06.13-r27 should be regenerated before using RAG evaluation-pipeline metrics as external evidence."
      },
      {
        version: "2026.06.13-r27",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds a metric-validation gate for data-agent analytical coverage so heterogeneous data-agent benchmark metrics disclose task type, database/source modality, difficulty, metric computation, agent workflow, expert validation, cost/latency, and submission-schema evidence.",
        migration: "Reports generated under 2026.06.13-r26 should be regenerated before using data-agent analytical benchmark metrics as external evidence."
      },
      {
        version: "2026.06.13-r26",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds a public score-claim boundary for iterative tournament learning so leaderboard, tournament, peer-learning, and code-agent strategy-improvement claims disclose tournament protocol, opponent-pool, replay, ranking, uncertainty, and learning-delta evidence.",
        migration: "Reports generated under 2026.06.13-r25 should be regenerated or relabeled before using tournament, leaderboard, peer-learning, or iterative code-agent benchmark claims as external proof."
      },
      {
        version: "2026.06.13-r25",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Clarifies the RAG-pipeline metric-validation gate so domain-specific legal RAG benchmark metrics disclose corpus provenance, jurisdiction/language/task coverage, retriever/reranker configs, judge rubrics, logged samples, and agent-framework evidence.",
        migration: "Reports generated under 2026.06.13-r24 should be regenerated before using legal-domain RAG benchmark metrics as external evidence."
      },
      {
        version: "2026.06.13-r24",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Clarifies the RAG-pipeline metric-validation gate so custom-domain RAG benchmark metrics disclose document/test sets, selected metrics, query-level computation records, solution comparisons, and performance/cost evidence.",
        migration: "Reports generated under 2026.06.13-r23 should be regenerated before using custom-domain RAG benchmark metrics as external evidence."
      },
      {
        version: "2026.06.13-r23",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds a metric-validation gate for business-workflow coverage, with report and eval-pack bindings for workflow automation benchmark metrics.",
        migration: "Reports generated under 2026.06.13-r22 should be regenerated before using business workflow automation benchmark metrics as external evidence."
      },
      {
        version: "2026.06.13-r22",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds a metric-validation gate for RAG-pipeline coverage, with report and eval-pack bindings for retrieval, generation, and evaluator metrics.",
        migration: "Reports generated under 2026.06.13-r21 should be regenerated before using RAG pipeline benchmark metrics as external evidence."
      },
      {
        version: "2026.06.13-r21",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds a metric-validation gate for strategic-interaction coverage, with report and eval-pack bindings for multi-agent game and hidden-action metrics.",
        migration: "Reports generated under 2026.06.13-r20 should be regenerated before using multi-agent strategic benchmark metrics as external evidence."
      },
      {
        version: "2026.06.13-r20",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds a metric-validation gate for continual-learning coverage, with report and eval-pack bindings for lifelong-learning benchmark metrics.",
        migration: "Reports generated under 2026.06.13-r19 should be regenerated before using lifelong or continual-learning benchmark metrics as external evidence."
      },
      {
        version: "2026.06.13-r19",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds a metric-validation gate for dynamic tool-sandbox coverage, with report and eval-pack bindings for MCP-style stateful tool environments.",
        migration: "Reports generated under 2026.06.13-r18 should be regenerated before using dynamic tool-sandbox benchmark metrics as external evidence."
      },
      {
        version: "2026.06.13-r18",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Clarifies the partial-credit CTF public boundary so dataset DOI/version and VM image version evidence are required for version-specific VM benchmark claims.",
        migration: "Reports generated under 2026.06.13-r17 should be regenerated or relabeled before using version-specific partial-credit CTF, VM challenge, or checkpoint-completion claims as external proof."
      },
      {
        version: "2026.06.13-r17",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds a public score-claim boundary for partial-credit CTF validity so VM or checkpoint-completion claims disclose environment, trace, rubric, and labelling evidence.",
        migration: "Reports generated under 2026.06.13-r16 should be regenerated or relabeled before using partial-credit CTF, VM challenge, or checkpoint-completion claims as external proof."
      },
      {
        version: "2026.06.13-r16",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds a public score-claim boundary for live CTF evaluation integrity so cybersecurity benchmark claims are not overclaimed from static or score-only CTF results.",
        migration: "Reports generated under 2026.06.13-r15 should be regenerated or relabeled before using live CTF, cybersecurity benchmark, or flag-solving claims as external proof."
      },
      {
        version: "2026.06.13-r15",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds a metric-validation gate for ranking-stability coverage, with report and eval-pack bindings.",
        migration: "Reports generated under 2026.06.13-r14 should be regenerated before using checkpoint, model, or candidate ranking metrics as external evidence."
      },
      {
        version: "2026.06.13-r14",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds a public score-claim boundary for persona-policy realism so cooperative simulator success is not overclaimed as robust human-like user simulation.",
        migration: "Reports generated under 2026.06.13-r13 should be regenerated or relabeled before using persona-policy realism, human-like user simulation, or robust persona benchmark claims."
      },
      {
        version: "2026.06.13-r13",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds a metric-validation gate for lifecycle-observability coverage, with report and eval-pack bindings.",
        migration: "Reports generated under 2026.06.13-r12 should be regenerated before using runtime evaluator, trace, validation, or monitor metrics as external evidence."
      },
      {
        version: "2026.06.13-r12",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds a metric-validation gate for modality-transformation coverage, with report and eval-pack bindings.",
        migration: "Reports generated under 2026.06.13-r11 should be regenerated before using transformed-modality benchmark metrics as external evidence."
      },
      {
        version: "2026.06.13-r11",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds benchmark methodology versioning for static offline and live dynamic evidence so benchmark receipts disclose corpus, harness, model-pool, tier-policy, verification-protocol, scoring, and cost-accounting versions.",
        migration: "Reports generated under 2026.06.13-r10 should be regenerated before comparing static benchmark evidence with live dynamic execution evidence."
      },
      {
        version: "2026.06.13-r10",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds a metric-validation gate for safety-utility coverage, with report and eval-pack bindings.",
        migration: "Reports generated under 2026.06.13-r9 should be regenerated before using untrusted-tool metrics as evidence for both safety and utility under final-action risk."
      },
      {
        version: "2026.06.13-r9",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds a metric-validation gate for process-evidence coverage, with report and eval-pack bindings.",
        migration: "Reports generated under 2026.06.13-r8 should be regenerated before using final-outcome scores as evidence for process-level control or trajectory-quality claims."
      },
      {
        version: "2026.06.13-r8",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds a public score-claim boundary for architectural smell repair so repair rates are not overclaimed without false-positive handling and net impact evidence.",
        migration: "Reports generated under 2026.06.13-r7 should be regenerated or relabeled before using architectural repair or design-debt reduction claims."
      },
      {
        version: "2026.06.13-r7",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds a public score-claim boundary for multi-agent privacy leakage so single-agent privacy evidence is not overclaimed as social privacy safety.",
        migration: "Reports generated under 2026.06.13-r6 should be regenerated or relabeled before using multi-agent privacy-safe or secret-preserving claims."
      },
      {
        version: "2026.06.13-r6",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds a public score-claim boundary for social simulation realism so plausible synthetic discourse is not overclaimed as representative of real audiences.",
        migration: "Reports generated under 2026.06.13-r5 should be regenerated or relabeled before using social-realism or human-proxy claims."
      },
      {
        version: "2026.06.13-r5",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds a public score-claim boundary for divergent trajectory reasoning so success-only evidence is not overclaimed as creative or multi-path capability.",
        migration: "Reports generated under 2026.06.13-r4 should be regenerated or relabeled before using divergent-capability marketing or benchmark claims."
      },
      {
        version: "2026.06.13-r4",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds a public evaluation-mode taxonomy so score, replay, drift, security, provider comparison, and methodology-binding evidence are not conflated.",
        migration: "Reports generated under 2026.06.13-r3 should be regenerated before external comparisons that mix different evaluation modes."
      },
      {
        version: "2026.06.13-r3",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds a metric-validation gate for benchmark confounder-control coverage, with report and eval-pack bindings.",
        migration: "Reports generated under 2026.06.13-r2 should be regenerated before comparing framework-sensitive benchmark validity claims."
      },
      {
        version: "2026.06.13-r2",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Adds metric-validation gates for counterfactual responsiveness and validation facet coverage, with report and eval-pack bindings.",
        migration: "Reports generated under 2026.06.13 should be regenerated before comparing high-stakes metric validity claims."
      },
      {
        version: "2026.06.13",
        date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE,
        summary: "Initial public scoring-methodology manifest with report, badge, API, trust-tier, and question-set bindings.",
        migration: "Reports without a methodology block should be regenerated before they are used as external score or badge evidence."
      }
    ],
    deprecationNotice: "Reports and badges that do not include methodology.id, methodology.version, methodology.hash, and questionSet.version are legacy outputs and should not be used as current external proof.",
    migrationGuidance: [
      "Run amc methodology --json and store the manifest hash with audit evidence.",
      "Regenerate diagnostic reports so the methodology block is present in JSON and Markdown outputs.",
      "Regenerate badges so amc_methodology and amc_methodology_hash are present in badge URLs and titles.",
      "Regenerate benchmark receipts when corpus, harness, model-pool, tier-policy, verification protocol, scoring formula, or cost-accounting versions change.",
      "Regenerate or dual-run tournament receipts when opponent pools, round counts, seed policy, generation counts, replay evidence, ranking aggregation, or leaderboard publication rules change.",
      "For historical reports, preserve the original artifact and attach a fresh AMC report instead of editing the old report in place."
    ],
    changePolicy: "Any scoring, weighting, trust-tier, question-set, report-binding, corpus, QA-generation, support-span, failure-diagnosis, privacy-mode, telemetry-boundary, legal-code RAG corpus/Legifrance/vector-store/embedding/retrieval-technique/evaluation metric-validity semantics, SOC dataset schema, ATT&CK mapping, action schema, label-quality, cross-model audit, network troubleshooting scenario/topology/incident/fault/evaluation semantics, inference optimization scenario/hardware/server/backend/search-space/gate/relaunch/latency/throughput/tail/exploration metric-validity semantics, Java coding-agent benchmark/source/license/task/YAML/workspace/sandbox/lifecycle/CLI-agent/jury/judge-tier/Maven/JUnit/JaCoCo/result/pass@k metric-validity semantics, web eval dataset source/subject/query/search-provider/document/filter/QA/export/freshness/source-coverage/answer-grounding metric-validity semantics, Parallel/OpenClaw research-skill source/license/skill/API/search/deep-research/chat/extract/citation/source-policy/batch/monitoring/security/dependency/benchmark-validation metric-validity semantics, resume-RAG evaluator source/license/upload/parser/job-description/RAG-strategy/query-expansion/retrieval/vector-store/Ollama/embedding/endpoint/rating/batch/privacy/dependency metric-validity semantics, Sutro-style unstructured-data batch inference function/schema/source/input-order/priority/dry-run-cost/model-pool/observability/export/retention/multi-model/embedding methodology semantics, OpenHands/critic-rubrics-style source/no-license/arXiv/release/rubric-feature/function-calling-schema/sparse-outcome/reranking/early-stopping methodology semantics, OpenCode-lab source/lab/context/prompt/tool/AGENTS/repeated-run/fork-agreement/model-variance/ground-truth-correction metric-validity semantics, AcademiClaw-style source/default-branch/task-corpus/bilingual-task/workspace-query/Docker/rubric/eval-runner/result/conversation-trace/meta-eval/model-roster/metric/CI metric-validity semantics, IBM/rag-chunking-techniques-style source/license/default-branch/README/policy-corpus/simple-RAG-notebook/smart-chunking-notebook/RAG-evaluation-notebook/chunking-strategy/retrieval-pipeline/embedding-vectorstore/evaluation-dataset/metric/CI metric-validity semantics, hariohmprasath/k8s-ai-style source/license/default-branch/README/release/build-workflow/agent-module/MCP-server/Kubernetes-tool-inventory/diagnostic/resource/log-analysis/metric/CI metric-validity semantics, iCSawyer/SecureVibeBench-style source/license/homepage/default-branch/README/results/dataset/format/evaluation-runner/agent-adapter/vulnerability-scenario/test-script/parser/patch-diff/metric/CI metric-validity semantics, hparreao/Awesome-AI-Evaluation-Guide-style source/license/default-branch/README/benchmark-guide/tools-platforms/metric-selection/threshold/calibration/component-trace/human-review/cost-control/deprecation/migration methodology semantics, HumanStudy-Bench-style source/default-branch/study-config/participant-background/human-response/agent-response/evaluator/metric/validator/scorer/standardizer/reliability/validation-pipeline/CI metric-validity semantics, Legacy-Bench-style source/license/default-branch/README/task-corpus/legacy-language/environment/harness/agent-task/patch/test-oracle/evaluator/metric/CI/result/replay metric-validity semantics, Yummytanmo/SubtleMemory-style source/license/arXiv/Hugging-Face/persona/bench-instance/history-session/relation-taxonomy/construction/evaluation-stage/adapter/judge/score-summary/diagnostic/CI metric-validity semantics, Bent-Solutions/hermes-bench-style source/license/default-branch/README/build-spec/backend-runner/judge/task-registry/model-server-config/adapter/result-schema/frontend-review/regression/Docker metric-validity semantics, cooperbench/CooperBench-style source/no-license/default-branch/release/README/changelog/dataset/task/feature-conflict/runner/eval-backend/team-harness/agent-adapter/CI/package-lock/report metric-validity semantics, TestSprite/CoderCup-style source/license/homepage/default-branch/README/contributing/CI/package-lock/task-spec/test-suite/runner-contract/score-ledger/live-artifact/methodology/reference/cost-accounting metric-validity semantics, mlvanguards/agentic-graph-rag-evaluation-cometml-style source/no-license/default-branch/README/graph-orchestrator/RAG-pipeline/database/vector-store/evaluation/experiment-tracking/UI/dependency-lock metric-validity semantics, Coding-Crashkurse/RAG-Evaluation-with-Ragas-style RAGAS notebook/testset/LangFuse metric-validity semantics, TerminalWorld public-recording/task-synthesis/Docker/state-test/AllPassing-Nop-Partial replay semantics, bioinformatics task/dataset/truth/workflow/environment/tool/grader/perturbation/privacy metric-validity semantics, ARIASHA/MiRAGE-style drug-repositioning dataset/split/mapping/feature/similarity/negative-sampling/classifier/score/evaluation/case-study metric-validity semantics, mobile-agent environment/app/API/UI/task/checkpoint/license semantics, document or multimodal RAG carrier/routing/KG/memory/observability replay semantics, Encourage-style modular RAG method/inference/template/vector-DB/metric/MLflow replay semantics, CloneMem-style digital-trace/persona/question/evidence/bilingual/task-category/temporal-memory replay semantics, ResearchHarness-style tool-surface/native-tool-call/API/workspace/trace/adapter/provider/baseline replay semantics, PaperArena-style source/no-license/README/requirements/hub-config/runner/scorer/dataset-builder/tool/RAG/reflector/run-script/Hugging-Face-dataset/paper-QA/result/score/replay/CI tool-use replay semantics, GTO Wizard-style poker-agent API-scope/no-solver/hand-history/action-trace/AIVAT/legal-action replay semantics, SAP agent-evaluation tutorial objective/process/enterprise-context/notebook/dataset/log/metric/tooling/policy live-drift semantics, Agent_Mont-style monitoring framework/token/cost/latency/resource/carbon/log/visualization replay semantics, MiniAppBench-style query-set/evaluation-reference/generated-MiniApp/source-code/live-instance/browser-automation/render/dynamic-interaction/human-alignment replay semantics, Knowlytics-AI-style MCQ/RAG source/no-license/owned-corpus/quiz/evaluator/retrieval/generation/scoring/feedback replay semantics, Calibra-style source/license/homepage/default-branch/package/docs/task/test/campaign-matrix/agent/model-provider/skill-MCP-environment/seed/budget/trial-analysis-comparison/dashboard-export methodology-versioning semantics, spent-style Claude Code session-cost hook/config/JSONL/pricing/classifier/dashboard/privacy replay semantics, FIRE-style atomic-claim fact-checking dataset/retriever/verifier/decision-policy/search-provider/evidence/query/label/cost replay semantics, AgentKernelArena-style GPU-kernel task/config/workspace/GPU/compile/correctness/performance/A-B replay semantics, LLM Evaluation System-style package/MCP/dataset/synthetic-QA/document-grounding/judge/jury/binary-scoring/OpenTelemetry/Bedrock/PDF/S3 replay semantics, InnovatorBench-style source/paper/dataset/task/ResearchGym/tool/environment/checkpoint/score/replay/CI/no-leaderboard/no-dataset-copy replay semantics, Navi-Bench-style real-website web-agent dataset/task-config/evaluator/browser-provider/crash-adjusted-score/trajectory/visualization live-drift semantics, Strands benchmark-harness source/config/task/runtime/trajectory/patch/test/result-upload live-drift semantics, Awesome-Agent-Memory-style source/catalog/taxonomy/benchmark/eval-dataset/retrieval/persistence/forgetting/hallucination live-drift semantics, Agent Reading Test-style source/license/homepage/answer-key/task-manifest/score-form/live-site/raw-content/canary/failure-mode/content-delivery live-drift semantics, AI Reputation Claude-style source/no-license/README/agent-roster/skill-catalog/review-source/sentiment/competitor/response-policy/crisis/report/hallucinated-citation/PII live-drift semantics, neutree-ai/llm-fighter-style source/license/homepage/API/UI/game-result/schema/engine/runner/LLM-adapter/YAML-export/game-UI/combat-log/exported-log/win-rate/game-score/action-validity/combat-stability live-drift semantics, lemoz/darwin-godel-machine-style source/no-license/README/security/CI/controller/archive/self-modification/evaluation/scorer/sandbox/live-run/benchmark/score-movement/lineage/provider/model live-drift semantics, mpsuesser/effect-autoagent-style source/license/default-branch/README/package/lockfile/CI/benchmark-runner/harness/task/metrics/experiment-log/blueprint/trajectory/container/task-fixture/Docker/replay-command/seed/score-delta replay semantics, Praveengovianalytics/falcon-evaluate-style source/license/default-branch/release/package/lockfile/requirements/README/docs/workflow/modules/metric-family/provider-route/canary-result provider-drift semantics, Responsible-AI-Labs/rail-score-sdk-style source/license/release/PyPI/client/policy/middleware/telemetry/compliance/agent/integration/score/guardrail/safe-regeneration/tool-call/compliance live-drift semantics, edge AI agent device-profile/runtime/optimization/dataset/task/application/latency/memory/energy/accuracy/privacy/offline replay semantics, Agent Workflow Kit-style risk-score/workflow-level/spec-layer/approval/verification/docs-check replay semantics, MedAsk-style SymptomCheck/Triage vignette/simulator/evaluator/result/replay clinical benchmark semantics, BioKGBench-style KGCheck/KGQA/SCV dataset/KG/evaluator/replay biomedical benchmark semantics, BioMedArena-style source/config/harness/eval-suite/adapter/tool/vendor/baseline/replay/coverage/sandbox biomedical harness replay semantics, rag-eval-style document-QA dataset/endpoint/ranking/response/replay/CI semantics, A2A-NT-style buyer/seller role/product/budget/wholesale/trace/extraction/judging/anomaly/provider/clean-deal methodology semantics, ResearchGym-style task/artifact/budget/inspection/live-drift semantics, LLM/RAG eval-suite semantic/bias/hallucination live-drift semantics, KITE-style RAG corpus/query/ground-truth/rubric/pipeline/response/result/judge/grade/dataset-family/configuration live-drift semantics, PokerEval-style package/citation/simulation/opponent-pool/hand-history/BB-per-100/all-in-adjusted-BB-per-100/EV/VPIP/table-context live-drift semantics, Multi-User-LLM-Agent-style question/scenario/user-role/permission/preference/queue/instruction/trace/evaluator/metric-threshold explainability semantics, AgentTrial-style statistical suite/case/trial/confidence-interval/failure-attribution/regression/reliability question-explainability semantics, CodeQuest-style source-status/evaluator/optimizer/code-artifact/dimension-delta/replay/CI/no-source-copy question-explainability semantics, OccuBench-style professional-task/scenario/world-model/fault/verifier/trajectory/robustness explainability semantics, NoMIRACL-style multilingual RAG language/subset/qrels/retrieval/abstention/hallucination/error live-drift semantics, scaling-law discovery task/split/config/artifact/R2/NMSE/NMAE live-drift semantics, Ollama metrics sidecar/proxy/host/scrape/endpoint/token/latency/time-per-token/model-loaded/RAM/error-rate live-drift semantics, provider observability pipeline proof semantics, LLM workflow observability trace/debugger/feedback/session-replay methodology semantics, geospatial provider-drift task/dataset/tool/trace/judge/calibration/token-cost semantics, warehouse-native LLM eval dbt/warehouse/capture/baseline/judge/drift/no-egress replay semantics, cryptography benchmark task/rubric/sandbox/baseline methodology, modality-representation, retrieval or element-selection protocol, local hardware or run-profile benchmark binding, harness, model-pool, tier-policy, verification-protocol, tournament/leaderboard protocol, evaluator metric, or cost-accounting change must publish a new methodology version or explicit benchmark sub-version and preserve old report hashes."
  };

  return {
    ...manifestWithoutHash,
    hash: sha256Hex(canonicalize(manifestWithoutHash))
  };
}

export function getPublicMethodologyReference(questionSet?: DiagnosticQuestionSetInfo): PublicMethodologyReference {
  const manifest = getPublicMethodologyManifest(questionSet);
  return {
    id: manifest.id,
    version: manifest.version,
    releaseDate: manifest.releaseDate,
    methodologyDoc: manifest.methodologyDoc,
    publicUrl: manifest.publicUrl,
    hash: manifest.hash,
    versioningAssuranceHash: sha256Hex(canonicalize({
      methodologyVersioningAssurance: manifest.methodologyVersioningAssurance,
      sutroBatchMethodologyAssurance: manifest.sutroBatchMethodologyAssurance,
      agentBeltMethodologyAssurance: manifest.agentBeltMethodologyAssurance
    }))
  };
}

function publicQuestionRows(): PublicMethodologyReproducibilityPacket["questionBank"]["questions"] {
  return questionBank.map((question) => ({
    id: question.id,
    layerName: question.layerName,
    family: question.family ?? null,
    title: question.title,
    promptTemplate: question.promptTemplate,
    options: question.options.map((option) => ({
      level: option.level,
      label: option.label,
      meaning: option.meaning,
      observableSignals: [...option.observableSignals],
      typicalEvidence: [...option.typicalEvidence]
    })),
    gates: question.gates.map((gate) => ({
      level: gate.level,
      requiredEvidenceTypes: [...gate.requiredEvidenceTypes],
      minEvents: gate.minEvents,
      minSessions: gate.minSessions,
      minDistinctDays: gate.minDistinctDays,
      requiredTrustTier: gate.requiredTrustTier ?? null,
      acceptedTrustTiers: [...(gate.acceptedTrustTiers ?? [])],
      mustInclude: gate.mustInclude,
      mustNotInclude: gate.mustNotInclude
    })),
    evidenceGateHints: question.evidenceGateHints,
    upgradeHints: question.upgradeHints,
    tuningKnobs: [...question.tuningKnobs],
    questionSetVersion: question.questionSetVersion ?? null,
    surfaces: [...(question.surfaces ?? [])],
    assessmentLayers: [...(question.assessmentLayers ?? [])],
    scoringWeight: question.scoringWeight ?? null,
    activeByDefault: question.activeByDefault ?? null
  }));
}

function layerDistribution(questions: PublicMethodologyReproducibilityPacket["questionBank"]["questions"]): Record<string, number> {
  const counts = questions.reduce<Record<string, number>>((acc, question) => {
    acc[question.layerName] = (acc[question.layerName] ?? 0) + 1;
    return acc;
  }, {});
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

export function getPublicMethodologyReproducibilityPacket(params: { generatedAt?: string } = {}): PublicMethodologyReproducibilityPacket {
  const manifest = getPublicMethodologyManifest();
  const questions = publicQuestionRows();
  const questionBankSha256 = sha256Hex(canonicalize(questions));
  const basePacket = {
    schemaVersion: 1 as const,
    id: "amc-methodology-reproducibility-packet",
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    status: "public" as const,
    methodology: {
      ...getPublicMethodologyReference(),
      amcVersion: manifest.amcVersion,
      defaultQuestionSetVersion: manifest.defaultQuestionSetVersion
    },
    sourcePaths: [
      { path: "src/methodology/publicMethodology.ts", purpose: "Canonical public methodology manifest, hashes, limitations, and rendering." },
      { path: "src/diagnostic/questionBank.ts", purpose: "Compiled default diagnostic question bank with prompts, level descriptors, and gates." },
      { path: "src/diagnostic/questionSets.ts", purpose: "Question-set versioning, default set binding, and optional lifecycle expansion." },
      { path: "docs/SCORING_METHODOLOGY.md", purpose: "Human-readable public methodology documentation." },
      { path: "whitepaper/AMC_WHITEPAPER_v1.md", purpose: "Repository preprint and citable academic narrative." }
    ],
    questionBank: {
      version: manifest.questionSet.version,
      title: manifest.questionSet.title,
      questionCount: questions.length,
      questionBankSha256,
      layerDistribution: layerDistribution(questions),
      questions
    },
    scoringFormulas: manifest.formulas,
    evidenceTrustTiers: manifest.evidenceTrustTiers,
    artifactReviewAlignment: [
      {
        source: "ACM Artifact Review and Badging - Current",
        url: "https://www.acm.org/publications/policies/artifact-review-and-badging-current",
        retrievedAt: "2026-06-16",
        mapping: "Packet includes a complete artifact inventory, source paths, execution commands, hashes, and question-level gates so another reviewer can exercise the methodology artifact."
      },
      {
        source: "GO FAIR Principles",
        url: "https://www.go-fair.org/fair-principles/",
        retrievedAt: "2026-06-16",
        mapping: "Packet records stable identifiers, metadata, source paths, machine-readable JSON, and reuse limitations."
      }
    ],
    fairAlignment: [
      {
        principle: "Findable" as const,
        implementation: "The packet has a stable id, methodology id/version/hash, source paths, and question-bank hash."
      },
      {
        principle: "Accessible" as const,
        implementation: "The packet is generated locally with `amc methodology --reproducibility --json` or written with `--out`."
      },
      {
        principle: "Interoperable" as const,
        implementation: "JSON output uses explicit schemaVersion, arrays, primitive fields, and source-path references."
      },
      {
        principle: "Reusable" as const,
        implementation: "Question prompts, level descriptors, gates, formulas, commands, limitations, and hashes are included for independent review."
      }
    ],
    reproductionCommands: [
      "amc methodology --json",
      "amc methodology --reproducibility --json",
      "amc methodology --reproducibility --format markdown --out amc-methodology-reproducibility.md",
      "npx vitest run tests/questionBank.test.ts tests/publicMethodology.test.ts tests/methodologyReproducibilityPacket.test.ts --reporter=dot"
    ],
    limitations: [
      "The packet proves the current public methodology and compiled default question bank, not DOI or arXiv assignment.",
      "Historical reports remain bound to their embedded methodology version and hash.",
      "Empirical case-study datasets remain separate; this packet makes the scoring instrument reproducible, not every historical case-study claim.",
      "Industry-pack entitlement and private customer evidence are not included unless separately exported with permission."
    ]
  };

  const contentHash = sha256Hex(canonicalize({
    ...basePacket,
    generatedAt: "omitted-from-content-hash"
  }));

  return {
    ...basePacket,
    contentHash
  };
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function renderPublicMethodologyReproducibilityMarkdown(packet = getPublicMethodologyReproducibilityPacket()): string {
  const questionRows = packet.questionBank.questions.map((question) => {
    const l0 = question.options.find((option) => option.level === 0)?.label ?? "";
    const l5 = question.options.find((option) => option.level === 5)?.label ?? "";
    return `| ${question.id} | ${escapeMarkdown(question.layerName)} | ${escapeMarkdown(question.title)} | ${escapeMarkdown(l0)} | ${escapeMarkdown(l5)} |`;
  });

  return [
    "# AMC Methodology Reproducibility Packet",
    "",
    `- Packet ID: ${packet.id}`,
    `- Generated at: ${packet.generatedAt}`,
    `- Content hash: ${packet.contentHash}`,
    `- Methodology: ${packet.methodology.id} ${packet.methodology.version}`,
    `- Methodology hash: ${packet.methodology.hash}`,
    `- AMC version: ${packet.methodology.amcVersion}`,
    "",
    "## Question Bank Snapshot",
    "",
    `- Version: ${packet.questionBank.version}`,
    `- Title: ${packet.questionBank.title}`,
    `- Question count: ${packet.questionBank.questionCount}`,
    `- Question bank SHA-256: ${packet.questionBank.questionBankSha256}`,
    "",
    "| Layer | Questions |",
    "|---|---:|",
    ...Object.entries(packet.questionBank.layerDistribution).map(([layer, count]) => `| ${escapeMarkdown(layer)} | ${count} |`),
    "",
    "## Source Paths",
    "",
    "| Path | Purpose |",
    "|---|---|",
    ...packet.sourcePaths.map((source) => `| ${source.path} | ${escapeMarkdown(source.purpose)} |`),
    "",
    "## Scoring Formulas",
    "",
    ...Object.entries(packet.scoringFormulas).map(([name, formula]) => `- ${name}: ${formula}`),
    "",
    "## Evidence Trust Tiers",
    "",
    "| Tier | Weight | Meaning |",
    "|---|---:|---|",
    ...packet.evidenceTrustTiers.map((tier) => `| ${tier.tier} | ${tier.weight} | ${escapeMarkdown(tier.publicMeaning)} |`),
    "",
    "## External Review Alignment",
    "",
    "| Source | Retrieved | Mapping |",
    "|---|---|---|",
    ...packet.artifactReviewAlignment.map((row) => `| ${escapeMarkdown(row.source)} | ${row.retrievedAt} | ${escapeMarkdown(row.mapping)} |`),
    "",
    "## FAIR Alignment",
    "",
    "| Principle | Implementation |",
    "|---|---|",
    ...packet.fairAlignment.map((row) => `| ${row.principle} | ${escapeMarkdown(row.implementation)} |`),
    "",
    "## Reproduction Commands",
    "",
    ...packet.reproductionCommands.map((command) => `- \`${command}\``),
    "",
    "## Limitations",
    "",
    ...packet.limitations.map((limitation) => `- ${limitation}`),
    "",
    "## Full Question Inventory",
    "",
    "| ID | Layer | Title | L0 label | L5 label |",
    "|---|---|---|---|---|",
    ...questionRows
  ].join("\n");
}

const SAMPLE_CASE_LAYER_ORDER = [
  "Strategic Agent Operations",
  "Skills",
  "Resilience",
  "Leadership & Autonomy",
  "Culture & Alignment"
] as const;

function sampleLayerScores(level: 0 | 1 | 2 | 3 | 4 | 5): Record<string, number> {
  const base = Math.min(5, Math.max(0, level));
  return {
    "Strategic Agent Operations": Number(Math.max(0, base - 0.2).toFixed(2)),
    Skills: Number(Math.min(5, base + 0.15).toFixed(2)),
    Resilience: Number(Math.max(0, base - 0.35).toFixed(2)),
    "Leadership & Autonomy": Number(Math.min(5, base + (level >= 4 ? 0.2 : 0)).toFixed(2)),
    "Culture & Alignment": Number(Math.max(0, base - (level <= 1 ? 0.15 : 0.05)).toFixed(2))
  };
}

export function getPublicMethodologyCaseStudyDataset(params: { generatedAt?: string } = {}): PublicMethodologyCaseStudyDataset {
  const manifest = getPublicMethodologyManifest();
  const reproducibility = getPublicMethodologyReproducibilityPacket({ generatedAt: "omitted-from-case-study-dataset" });
  const methodology = {
    ...getPublicMethodologyReference(),
    amcVersion: manifest.amcVersion,
    defaultQuestionSetVersion: manifest.defaultQuestionSetVersion,
    questionBankSha256: reproducibility.questionBank.questionBankSha256
  };
  const cases: PublicMethodologyCaseStudyDataset["cases"] = [
    {
      caseId: "amc-sample-l0-notebook-helper",
      synthetic: true,
      agentArchetype: "Notebook research helper",
      industryContext: "technology",
      task: "Summarize engineering notes without production tools",
      maturityLevel: 0,
      scoreOutOf100: 8,
      confidence: "low",
      evidenceProfile: "Self-reported capability only; no signed runtime trace, policy, or evaluator evidence.",
      includedQuestionIds: ["AMC-1.1", "AMC-2.1", "AMC-3.1", "AMC-4.1", "AMC-5.1"],
      layerScores: sampleLayerScores(0),
      expectedReviewerUse: "Baseline example for a side-project agent that should not be treated as production-ready.",
      recommendedNextAction: "Capture one observed run, define owner-approved scope, and add basic evaluator checks before claiming L1."
    },
    {
      caseId: "amc-sample-l1-support-drafter",
      synthetic: true,
      agentArchetype: "Support reply drafter",
      industryContext: "customer support",
      task: "Draft responses for human review",
      maturityLevel: 1,
      scoreOutOf100: 24,
      confidence: "medium",
      evidenceProfile: "Observed prompts and human approval traces exist, but policy gates and regression datasets are incomplete.",
      includedQuestionIds: ["AMC-1.2", "AMC-2.3", "AMC-3.4", "AMC-4.2", "AMC-5.3"],
      layerScores: sampleLayerScores(1),
      expectedReviewerUse: "Example for human-in-the-loop workflows with narrow autonomy and early evidence capture.",
      recommendedNextAction: "Add scoped tool policy, refusal tests, and a small golden dataset to reach L2."
    },
    {
      caseId: "amc-sample-l2-rag-assistant",
      synthetic: true,
      agentArchetype: "Internal RAG assistant",
      industryContext: "professional services",
      task: "Answer internal policy questions with citations",
      maturityLevel: 2,
      scoreOutOf100: 43,
      confidence: "medium",
      evidenceProfile: "Retrieval traces, source citations, and basic regression checks exist; drift monitoring and incident runbooks are partial.",
      includedQuestionIds: ["AMC-1.5", "AMC-2.7", "AMC-3.8", "AMC-4.5", "AMC-5.5"],
      layerScores: sampleLayerScores(2),
      expectedReviewerUse: "Example for managed internal agents that need stronger monitoring before broader rollout.",
      recommendedNextAction: "Add source freshness checks, alert thresholds, and residual-risk acceptance to reach L3."
    },
    {
      caseId: "amc-sample-l3-claims-triage",
      synthetic: true,
      agentArchetype: "Claims triage copilot",
      industryContext: "insurance",
      task: "Classify incoming claims for human adjuster queues",
      maturityLevel: 3,
      scoreOutOf100: 62,
      confidence: "high",
      evidenceProfile: "Signed observed runs, scoped tools, evaluator pack, risk appetite, and owner acceptance are present.",
      includedQuestionIds: ["AMC-1.8", "AMC-2.10", "AMC-3.12", "AMC-4.10", "AMC-5.8"],
      layerScores: sampleLayerScores(3),
      expectedReviewerUse: "Example for limited production use where residual risk, owner, and monitoring are explicit.",
      recommendedNextAction: "Increase evaluator coverage, add incident drills, and quantify financial risk for L4 readiness."
    },
    {
      caseId: "amc-sample-l4-ops-orchestrator",
      synthetic: true,
      agentArchetype: "Operations orchestration agent",
      industryContext: "logistics",
      task: "Recommend exception-handling plans with guarded workflow tools",
      maturityLevel: 4,
      scoreOutOf100: 82,
      confidence: "high",
      evidenceProfile: "Continuous monitoring, signed work orders, dual-control approvals, replayable evals, and risk heatmaps are present.",
      includedQuestionIds: ["AMC-1.12", "AMC-2.18", "AMC-3.21", "AMC-4.14", "AMC-5.10"],
      layerScores: sampleLayerScores(4),
      expectedReviewerUse: "Example for measured production workflows with strong evidence but not full autonomous optimization.",
      recommendedNextAction: "Add cross-environment replay, adaptive improvement controls, and independent audit evidence for L5."
    },
    {
      caseId: "amc-sample-l5-controlled-improver",
      synthetic: true,
      agentArchetype: "Controlled self-improvement agent",
      industryContext: "software delivery",
      task: "Propose and verify bounded workflow improvements under policy gates",
      maturityLevel: 5,
      scoreOutOf100: 95,
      confidence: "high",
      evidenceProfile: "Tamper-evident traces, adversarial assurance, budget controls, replay evidence, policy-gated self-improvement, and external audit packet are present.",
      includedQuestionIds: ["AMC-1.18", "AMC-2.38", "AMC-3.30", "AMC-4.28", "AMC-5.8"],
      layerScores: sampleLayerScores(5),
      expectedReviewerUse: "Example of the evidence shape required for optimized agents; not a claim about a shipped public agent.",
      recommendedNextAction: "Preserve methodology hash and rerun independent review before using the case in external comparisons."
    }
  ];
  const baseDataset = {
    schemaVersion: 1 as const,
    id: "amc-public-methodology-case-study-dataset",
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    status: "public-synthetic-sample" as const,
    methodology,
    datasetCard: {
      prettyName: "AMC Public Methodology Sample Case Studies",
      license: "MIT" as const,
      language: ["en"],
      taskCategories: ["text-classification", "question-answering", "risk-analysis"],
      tags: ["agent-maturity", "ai-governance", "case-study", "synthetic", "dataset-card"],
      rowCount: cases.length,
      format: "json" as const,
      summary: "A small synthetic L0-L5 case-study dataset for exercising AMC's public scoring methodology, docs, and reviewer workflows without exposing private customer evidence.",
      intendedUses: [
        "Show researchers the expected shape of AMC case-study rows.",
        "Provide fixture-like examples for methodology reviews, docs, tutorials, and parser tests.",
        "Demonstrate how maturity levels, evidence profiles, question IDs, and layer scores can be represented."
      ],
      outOfScopeUses: [
        "Do not use this dataset as empirical validation of AMC accuracy.",
        "Do not treat these rows as real customer deployments or third-party benchmark results.",
        "Do not use these rows to claim DOI, arXiv, or peer-reviewed dataset publication."
      ],
      privacyAndSafety: [
        "Rows are synthetic and contain no private customer evidence, secrets, personal data, or dogfood-agent run traces.",
        "Agent names are archetypes, not real customer or employee identities.",
        "The dataset intentionally omits prompts, private traces, and proprietary operational logs."
      ],
      limitations: [
        "The dataset covers representation and reproducibility shape, not statistical validity.",
        "Sample size is intentionally small and balanced across L0-L5.",
        "External empirical case studies still require participant consent, source data release, and independent review."
      ],
      sources: [
        {
          title: "Hugging Face Dataset Cards",
          url: "https://huggingface.co/docs/hub/datasets-cards",
          retrievedAt: "2026-06-16",
          note: "Dataset cards document README-based dataset metadata, intended use, context, license, and discoverability fields."
        },
        {
          title: "Datasheets for Datasets",
          url: "https://arxiv.org/abs/1803.09010",
          retrievedAt: "2026-06-16",
          note: "Dataset documentation should communicate motivation, composition, collection process, recommended uses, and limitations."
        }
      ]
    },
    cases,
    reproductionCommands: [
      "amc methodology --sample-dataset --json",
      "amc methodology --sample-dataset --format markdown --out amc-methodology-case-studies.md",
      "npx vitest run tests/methodologyReproducibilityPacket.test.ts --reporter=dot"
    ],
    limitations: [
      "This is a public synthetic sample dataset, not private customer evidence.",
      "This closes the representation/sample-dataset gap, not DOI or arXiv assignment.",
      "Third-party empirical validation requires separately released real-world cases and consented evidence."
    ]
  };
  const contentHash = sha256Hex(canonicalize({
    ...baseDataset,
    generatedAt: "omitted-from-content-hash"
  }));
  return {
    ...baseDataset,
    contentHash
  };
}

export function renderPublicMethodologyCaseStudyDatasetMarkdown(
  dataset = getPublicMethodologyCaseStudyDataset()
): string {
  return [
    "# AMC Public Methodology Sample Case-Study Dataset",
    "",
    `- Dataset ID: ${dataset.id}`,
    `- Generated at: ${dataset.generatedAt}`,
    `- Content hash: ${dataset.contentHash}`,
    `- Status: ${dataset.status}`,
    `- Methodology: ${dataset.methodology.id} ${dataset.methodology.version}`,
    `- Question bank SHA-256: ${dataset.methodology.questionBankSha256}`,
    "",
    "## Dataset Card",
    "",
    `- Pretty name: ${dataset.datasetCard.prettyName}`,
    `- License: ${dataset.datasetCard.license}`,
    `- Format: ${dataset.datasetCard.format}`,
    `- Rows: ${dataset.datasetCard.rowCount}`,
    `- Summary: ${dataset.datasetCard.summary}`,
    "",
    "### Intended Uses",
    "",
    ...dataset.datasetCard.intendedUses.map((item) => `- ${item}`),
    "",
    "### Out-of-Scope Uses",
    "",
    ...dataset.datasetCard.outOfScopeUses.map((item) => `- ${item}`),
    "",
    "### Privacy and Safety",
    "",
    ...dataset.datasetCard.privacyAndSafety.map((item) => `- ${item}`),
    "",
    "### Sources",
    "",
    "| Source | Retrieved | Note |",
    "|---|---|---|",
    ...dataset.datasetCard.sources.map((source) => `| ${escapeMarkdown(source.title)} | ${source.retrievedAt} | ${escapeMarkdown(source.note)} |`),
    "",
    "## Cases",
    "",
    "| Case ID | Level | Score | Confidence | Archetype | Industry | Evidence Profile |",
    "|---|---:|---:|---|---|---|---|",
    ...dataset.cases.map((row) => `| ${row.caseId} | L${row.maturityLevel} | ${row.scoreOutOf100} | ${row.confidence} | ${escapeMarkdown(row.agentArchetype)} | ${escapeMarkdown(row.industryContext)} | ${escapeMarkdown(row.evidenceProfile)} |`),
    "",
    "## Layer Scores",
    "",
    "| Case ID | Strategic Agent Operations | Skills | Resilience | Leadership & Autonomy | Culture & Alignment |",
    "|---|---:|---:|---:|---:|---:|",
    ...dataset.cases.map((row) => `| ${row.caseId} | ${SAMPLE_CASE_LAYER_ORDER.map((layer) => (row.layerScores[layer] ?? 0).toFixed(2)).join(" | ")} |`),
    "",
    "## Reproduction Commands",
    "",
    ...dataset.reproductionCommands.map((command) => `- \`${command}\``),
    "",
    "## Limitations",
    "",
    ...dataset.limitations.map((limitation) => `- ${limitation}`)
  ].join("\n");
}

export function renderPublicMethodologyMarkdown(manifest = getPublicMethodologyManifest()): string {
  return [
    `# AMC Public Methodology ${manifest.version}`,
    "",
    `- ID: ${manifest.id}`,
    `- Release date: ${manifest.releaseDate}`,
    `- AMC version: ${manifest.amcVersion}`,
    `- Methodology hash: ${manifest.hash}`,
    `- Public doc: ${manifest.methodologyDoc}`,
    `- Public URL: ${manifest.publicUrl}`,
    `- Question set: ${manifest.questionSet.version} (${manifest.questionSet.questionCount} questions)`,
    "",
    "## Score Scale",
    "",
    "| Level | Numeric Range | Label |",
    "|---|---|---|",
    ...manifest.scoreScale.map((row) => `| ${row.level} | ${row.numericRange[0]}-${row.numericRange[1]} | ${row.label} |`),
    "",
    "## Evidence Trust Tiers",
    "",
    "| Tier | Weight | Meaning |",
    "|---|---:|---|",
    ...manifest.evidenceTrustTiers.map((row) => `| ${row.tier} | ${row.weight} | ${row.publicMeaning} |`),
    "",
    "## Report Bindings",
    "",
    `- Diagnostic JSON field: ${manifest.reportBindings.diagnosticJsonField}`,
    `- Badge query params: ${manifest.reportBindings.badgeQueryParams.join(", ")}`,
    `- Required audit fields: ${manifest.reportBindings.requiredAuditFields.join(", ")}`,
    "",
    "## Evaluation Mode Taxonomy",
    "",
    "| Mode | Surface | Public Meaning | Proof Binding | Limitation |",
    "|---|---|---|---|---|",
    ...manifest.evaluationModeTaxonomy.map((row) => `| ${row.mode} | ${row.surface} | ${row.publicMeaning} | ${row.proofBinding} | ${row.limitation} |`),
    "",
    "## Benchmark Methodology Versioning",
    "",
    `- Required audit fields: ${manifest.benchmarkMethodologyVersioning.requiredAuditFields.join(", ")}`,
    "",
    "| Track | Public Meaning | Proof Binding | Comparability Rule |",
    "|---|---|---|---|",
    ...manifest.benchmarkMethodologyVersioning.tracks.map((row) => `| ${row.track} | ${row.publicMeaning} | ${row.proofBinding} | ${row.comparabilityRule} |`),
    "",
    "| Change Trigger | Version Impact | Migration |",
    "|---|---|---|",
    ...manifest.benchmarkMethodologyVersioning.changeTriggers.map((row) => `| ${row.trigger} | ${row.versionImpact} | ${row.migration} |`),
    "",
    "## Methodology Versioning Assurance",
    "",
    `- ID: ${manifest.methodologyVersioningAssurance.id}`,
    `- Source reference: ${manifest.methodologyVersioningAssurance.sourceRef}`,
    `- Source pattern: ${manifest.methodologyVersioningAssurance.sourcePattern}`,
    `- Public meaning: ${manifest.methodologyVersioningAssurance.publicMeaning}`,
    `- Required audit fields: ${manifest.methodologyVersioningAssurance.requiredAuditFields.join(", ")}`,
    `- Badge query params: ${manifest.methodologyVersioningAssurance.badgeQueryParams.join(", ")}`,
    `- Diagnostic fields: ${manifest.methodologyVersioningAssurance.diagnosticFields.join(", ")}`,
    `- Proof binding: ${manifest.methodologyVersioningAssurance.proofBinding}`,
    `- Fail-closed rule: ${manifest.methodologyVersioningAssurance.failClosedRule}`,
    `- No-copy boundary: ${manifest.methodologyVersioningAssurance.noCopyBoundary}`,
    "",
    "## Sutro Batch Methodology Assurance",
    "",
    `- ID: ${manifest.sutroBatchMethodologyAssurance.id}`,
    `- Source reference: ${manifest.sutroBatchMethodologyAssurance.sourceRef}`,
    `- Source pattern: ${manifest.sutroBatchMethodologyAssurance.sourcePattern}`,
    `- Public meaning: ${manifest.sutroBatchMethodologyAssurance.publicMeaning}`,
    `- Required audit fields: ${manifest.sutroBatchMethodologyAssurance.requiredAuditFields.join(", ")}`,
    `- Badge query params: ${manifest.sutroBatchMethodologyAssurance.badgeQueryParams.join(", ")}`,
    `- Diagnostic fields: ${manifest.sutroBatchMethodologyAssurance.diagnosticFields.join(", ")}`,
    `- Proof binding: ${manifest.sutroBatchMethodologyAssurance.proofBinding}`,
    `- Fail-closed rule: ${manifest.sutroBatchMethodologyAssurance.failClosedRule}`,
    `- No-copy boundary: ${manifest.sutroBatchMethodologyAssurance.noCopyBoundary}`,
    "",
    "## Agent Belt Methodology Assurance",
    "",
    `- ID: ${manifest.agentBeltMethodologyAssurance.id}`,
    `- Source reference: ${manifest.agentBeltMethodologyAssurance.sourceRef}`,
    `- Source pattern: ${manifest.agentBeltMethodologyAssurance.sourcePattern}`,
    `- Public meaning: ${manifest.agentBeltMethodologyAssurance.publicMeaning}`,
    `- Required audit fields: ${manifest.agentBeltMethodologyAssurance.requiredAuditFields.join(", ")}`,
    `- Badge query params: ${manifest.agentBeltMethodologyAssurance.badgeQueryParams.join(", ")}`,
    `- Diagnostic fields: ${manifest.agentBeltMethodologyAssurance.diagnosticFields.join(", ")}`,
    `- Proof binding: ${manifest.agentBeltMethodologyAssurance.proofBinding}`,
    `- Fail-closed rule: ${manifest.agentBeltMethodologyAssurance.failClosedRule}`,
    `- No-copy boundary: ${manifest.agentBeltMethodologyAssurance.noCopyBoundary}`,
    "",
    "## Score Claim Boundaries",
    "",
    "| Boundary | Applies When | Public Disclosure | Required Evidence | Migration |",
    "|---|---|---|---|---|",
    ...manifest.scoreClaimBoundaries.map((row) => `| ${row.boundary} | ${row.appliesWhen} | ${row.publicDisclosure} | ${row.requiredEvidence} | ${row.migration} |`),
    "",
    "## Metric Validation Gates",
    "",
    "| Gate | Default Threshold | Applies When | Proof Field | Migration |",
    "|---|---|---|---|---|",
    ...manifest.metricValidationGates.map((row) => `| ${row.gate} | ${row.defaultThreshold} | ${row.appliesWhen} | ${row.proofField} | ${row.migration} |`),
    "",
    "## External Source Verification Policy",
    "",
    `- Required for external claims: ${manifest.externalSourceVerificationPolicy.requiredForExternalClaims ? "yes" : "no"}`,
    `- Accepted statuses: ${manifest.externalSourceVerificationPolicy.acceptedStatuses.join(", ")}`,
    `- Metadata-only boundary: ${manifest.externalSourceVerificationPolicy.metadataOnlyBoundary}`,
    `- Unavailable-source guidance: ${manifest.externalSourceVerificationPolicy.unavailableSourceGuidance}`,
    `- Legal boundary: ${manifest.externalSourceVerificationPolicy.legalBoundary}`,
    "",
    "## Limitations",
    "",
    ...manifest.limitations.map((item) => `- ${item}`),
    "",
    "## Changelog",
    "",
    "| Version | Date | Summary | Migration |",
    "|---|---|---|---|",
    ...manifest.changelog.map((row) => `| ${row.version} | ${row.date} | ${row.summary} | ${row.migration} |`),
    "",
    "## Deprecation Notice",
    "",
    manifest.deprecationNotice,
    "",
    "## Migration Guidance",
    "",
    ...manifest.migrationGuidance.map((item) => `- ${item}`),
    "",
    "## Change Policy",
    "",
    manifest.changePolicy
  ].join("\n");
}
