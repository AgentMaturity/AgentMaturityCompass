import { getIndustryPackEntitlement } from "../domains/industryPackEntitlement.js";
import { listIndustryPacks } from "../domains/industryPacks.js";
import type {
  AMCSurfaceName,
  AssessmentQuestionFamily,
  DiagnosticQuestion,
  DiagnosticQuestionSetDimension,
  DiagnosticQuestionSetInfo,
  LayerName
} from "../types.js";
import { buildQuestion, LEGACY_QUESTION_SET_VERSION, questionBank, type QuestionSeed } from "./questionBank.js";

export const DEFAULT_QUESTION_SET_VERSION = LEGACY_QUESTION_SET_VERSION;
export const LIFECYCLE_QUESTION_SET_VERSION = "amc-lifecycle-2026-v1";

export type DiagnosticQuestionSetVersion =
  | typeof DEFAULT_QUESTION_SET_VERSION
  | typeof LIFECYCLE_QUESTION_SET_VERSION;

export interface QuestionSetOptions {
  version?: string;
  workspace?: string;
  env?: NodeJS.ProcessEnv;
  applyIndustryPackWeights?: boolean;
}

export interface DiagnosticQuestionSet {
  version: DiagnosticQuestionSetVersion;
  title: string;
  questions: DiagnosticQuestion[];
  info: DiagnosticQuestionSetInfo;
}

interface FamilyDefinition {
  family: AssessmentQuestionFamily;
  title: string;
  description: string;
  surfaces: AMCSurfaceName[];
  layers: LayerName[];
}

type LifecycleQuestionSeed = QuestionSeed & {
  family: Exclude<AssessmentQuestionFamily, "core">;
};

const STANDARD_LABELS: QuestionSeed["labels"] = [
  "Absent",
  "Ad Hoc",
  "Documented",
  "Operational",
  "Measured and Governed",
  "Signed and Continuously Verified"
];

const LIFECYCLE_FAMILIES: FamilyDefinition[] = [
  {
    family: "lifecycle-governance",
    title: "Lifecycle Governance",
    description: "Controls that tie scoring, fixes, release decisions, and lifecycle receipts into one governed run.",
    surfaces: ["Score", "Enforce", "Comply", "Passport"],
    layers: ["Strategic Agent Operations", "Culture & Alignment"]
  },
  {
    family: "harness-resources",
    title: "Harness Resources",
    description: "Resource manifests, sandbox boundaries, budgets, tools, and test harnesses required to reproduce agent behavior.",
    surfaces: ["Shield", "Enforce", "Vault"],
    layers: ["Strategic Agent Operations", "Resilience"]
  },
  {
    family: "evidence-binding",
    title: "Evidence Binding",
    description: "Question-to-evidence links, trace receipts, signatures, and chain-of-custody checks for scored claims.",
    surfaces: ["Score", "Vault", "Comply"],
    layers: ["Culture & Alignment", "Resilience"]
  },
  {
    family: "typed-multi-agent",
    title: "Typed Multi-Agent Systems",
    description: "Typed handoffs, role contracts, delegation scopes, and graph-aware trust boundaries across agents.",
    surfaces: ["Fleet", "Enforce", "Passport"],
    layers: ["Strategic Agent Operations", "Skills"]
  },
  {
    family: "trace-repair",
    title: "Trace and Repair",
    description: "Failure trace indexing, root cause analysis, rollback evidence, and repair verification loops.",
    surfaces: ["Watch", "Enforce", "Shield"],
    layers: ["Resilience", "Skills"]
  },
  {
    family: "proof-exports",
    title: "Proof Exports",
    description: "Portable proof bundles, finding proofs, auditor packets, and redacted exports that survive environment changes.",
    surfaces: ["Passport", "Vault", "Comply"],
    layers: ["Culture & Alignment", "Skills"]
  },
  {
    family: "reasoning-memory",
    title: "Reasoning Memory",
    description: "Governed learning memory that keeps useful lessons while preventing poisoning, leakage, and stale reuse.",
    surfaces: ["Score", "Vault", "Watch"],
    layers: ["Leadership & Autonomy", "Skills"]
  },
  {
    family: "uncertainty-controls",
    title: "Uncertainty Controls",
    description: "Confidence, uncertainty, decisiveness, downgrade, and auto-fix controls for scored findings and recommendations.",
    surfaces: ["Score", "Enforce", "Comply"],
    layers: ["Leadership & Autonomy", "Culture & Alignment"]
  },
  {
    family: "runtime-gateway-watch",
    title: "Runtime Gateway and Watch",
    description: "Runtime run state, gateway policy receipts, drift alerts, and connected live-operation monitoring.",
    surfaces: ["Enforce", "Watch", "Vault"],
    layers: ["Strategic Agent Operations", "Resilience"]
  },
  {
    family: "fleet-org-operation",
    title: "Fleet and Org Operation",
    description: "Parent-child lifecycle runs, org role handoffs, cascade failures, and fleet-level operating evidence.",
    surfaces: ["Fleet", "Score", "Comply"],
    layers: ["Strategic Agent Operations", "Skills"]
  }
];

const FAMILY_BY_ID = new Map(LIFECYCLE_FAMILIES.map((family) => [family.family, family]));

function lifecycleSeed(
  id: string,
  family: LifecycleQuestionSeed["family"],
  layerName: LayerName,
  title: string,
  promptTemplate: string,
  evidenceGateHints: string,
  upgradeHints: string,
  tuningKnobs: string[]
): LifecycleQuestionSeed {
  return {
    id,
    family,
    layerName,
    title,
    promptTemplate,
    labels: STANDARD_LABELS,
    evidenceGateHints,
    upgradeHints,
    tuningKnobs
  };
}

const LIFECYCLE_QUESTION_SEEDS: LifecycleQuestionSeed[] = [
  lifecycleSeed(
    "AMC-LIFE-1.1",
    "lifecycle-governance",
    "Strategic Agent Operations",
    "Lifecycle Run Governance",
    "Does each assessment run connect setup, scoring, fix decisions, runtime evidence, and final artifacts into a single reviewable lifecycle record?",
    "Require lifecycle artifact paths, decision receipts, resource manifests, and run status evidence.",
    "Write a lifecycle artifact for each scored run and link every decision receipt, proof, and resource manifest back to the run.",
    ["lifecycle.runArtifact", "receipts.decision", "governance.review"]
  ),
  lifecycleSeed(
    "AMC-LIFE-1.2",
    "lifecycle-governance",
    "Culture & Alignment",
    "Lifecycle Change Accountability",
    "Can reviewers determine who or what proposed, approved, applied, or rolled back each lifecycle change?",
    "Require proposer, approver, change receipt, rollback receipt, and owner handoff metadata.",
    "Attach accountable owner and rollback evidence to every applied change, then summarize open ownership gaps.",
    ["lifecycle.changeReceipts", "approvals.owners", "rollback.evidence"]
  ),
  lifecycleSeed(
    "AMC-HRS-1.1",
    "harness-resources",
    "Strategic Agent Operations",
    "Harness Resource Manifest Coverage",
    "Are tools, files, prompts, models, network scopes, and budgets captured in a resource manifest before risky evaluation or execution?",
    "Require signed resource manifests with tool scope, model route, network, filesystem, and budget references.",
    "Generate resource manifests before score, shield, and enforce runs; fail closed when high-risk resources are missing.",
    ["harness.resourceManifest", "gateway.route", "toolhub.scope"]
  ),
  lifecycleSeed(
    "AMC-HRS-1.2",
    "harness-resources",
    "Resilience",
    "Harness Replay and Isolation",
    "Can the team replay the assessed behavior in an isolated harness without silently adding untracked resources?",
    "Require replay command, sandbox mode, deterministic input, and blocked-resource evidence.",
    "Add replay scripts and sandbox defaults, then compare replay evidence against the original run manifest.",
    ["harness.replay", "sandbox.isolation", "evidence.replayDiff"]
  ),
  lifecycleSeed(
    "AMC-EVB-1.1",
    "evidence-binding",
    "Culture & Alignment",
    "Question Evidence Binding",
    "Does every L3+ question score bind to question-specific evidence instead of broad untagged logs?",
    "Require meta.questionId tagging, matched evidence IDs, and fallback-warning absence for L3+ claims.",
    "Tag evidence with question IDs at collection time and reject unbound evidence for high-confidence claims.",
    ["evidence.questionId", "score.strictBinding", "ledger.index"]
  ),
  lifecycleSeed(
    "AMC-EVB-1.2",
    "evidence-binding",
    "Resilience",
    "Receipt and Signature Verification",
    "Are trace receipts, event hashes, artifact hashes, and signatures checked before evidence affects scores or recommendations?",
    "Require valid receipt counts, invalid receipt caps, artifact hash checks, and signer fingerprints.",
    "Verify receipts and artifact signatures before scoring; downgrade any recommendation backed by invalid or unverifiable evidence.",
    ["vault.receipts", "evidence.signature", "trace.correlation"]
  ),
  lifecycleSeed(
    "AMC-TMA-1.1",
    "typed-multi-agent",
    "Strategic Agent Operations",
    "Typed Agent Role Contracts",
    "Do multi-agent systems define typed role contracts, inputs, outputs, permissions, and escalation paths for each participating agent?",
    "Require role contract schemas, delegation scopes, owner mappings, and rejected out-of-scope handoff evidence.",
    "Create typed role contracts for each agent and validate handoffs against them before accepting downstream work.",
    ["fleet.roleContracts", "handoff.schema", "permissions.delegation"]
  ),
  lifecycleSeed(
    "AMC-TMA-1.2",
    "typed-multi-agent",
    "Skills",
    "Typed Handoff Compatibility",
    "Are handoffs between agents validated for schema compatibility, context freshness, and trust boundary preservation?",
    "Require handoff schema validation, context age checks, and trust inheritance evidence.",
    "Validate each handoff packet against typed schemas and block stale or boundary-breaking context propagation.",
    ["handoff.compatibility", "context.freshness", "fleet.trustInheritance"]
  ),
  lifecycleSeed(
    "AMC-TRR-1.1",
    "trace-repair",
    "Resilience",
    "Trace Failure Indexing",
    "Are failed or degraded runs indexed by trace, severity, root cause, and impacted question or surface?",
    "Require trace failure records, severity labels, linked question IDs, and impacted surface metadata.",
    "Create a trace failure index and require every critical incident to link to its scored question and surface.",
    ["watch.failureIndex", "incidents.severity", "score.questionLinks"]
  ),
  lifecycleSeed(
    "AMC-TRR-1.2",
    "trace-repair",
    "Skills",
    "Repair Verification Loop",
    "Does the repair loop prove that fixes addressed root cause without hiding unresolved regressions?",
    "Require root cause record, proposed fix, applied commit or patch, rollback path, and post-fix verification evidence.",
    "Pair each repair with a root cause artifact and rerun the failing check before marking the finding resolved.",
    ["fixer.rootCause", "repair.verification", "rollback.path"]
  ),
  lifecycleSeed(
    "AMC-PROOF-1.1",
    "proof-exports",
    "Culture & Alignment",
    "Portable Finding Proofs",
    "Can each important finding be exported as a portable proof with evidence, recommendation, receipt, and redaction metadata?",
    "Require proof set IDs, evidence refs, redaction report, and recommendation links.",
    "Generate finding proof sets from score output and include redacted evidence references for outside review.",
    ["proof.findingSet", "exports.redaction", "recommendation.links"]
  ),
  lifecycleSeed(
    "AMC-PROOF-1.2",
    "proof-exports",
    "Skills",
    "Auditor-Ready Export Completeness",
    "Do exported proof bundles include enough context for an auditor to verify the score without accessing private workspace state?",
    "Require manifest, hashes, schema version, surface map, question set version, and missing-evidence disclosure.",
    "Add manifest and schema metadata to every export, then dry-run verification in a clean workspace.",
    ["passport.bundle", "audit.export", "schema.versioning"]
  ),
  lifecycleSeed(
    "AMC-RMEM-1.1",
    "reasoning-memory",
    "Leadership & Autonomy",
    "Reasoning Lesson Capture",
    "Does the system capture reusable reasoning lessons from incidents, reviews, and successful runs without storing unsafe private content?",
    "Require lesson records, source run IDs, allowed consumers, retention policy, and redaction evidence.",
    "Store lessons with source run IDs, consumer allowlists, and retention limits; redact sensitive payloads before reuse.",
    ["memory.lessons", "memory.consumers", "redaction.policy"]
  ),
  lifecycleSeed(
    "AMC-RMEM-1.2",
    "reasoning-memory",
    "Skills",
    "Reasoning Memory Reuse Control",
    "Are retrieved lessons freshness-checked, scoped to allowed consumers, and excluded when they no longer apply?",
    "Require retrieval logs, TTL checks, consumer checks, stale lesson suppression, and poisoning detection evidence.",
    "Gate lesson retrieval by consumer, TTL, and source trust; log suppressed stale or poisoned lessons.",
    ["memory.retrieval", "memory.ttl", "memory.poisoning"]
  ),
  lifecycleSeed(
    "AMC-UNC-1.1",
    "uncertainty-controls",
    "Leadership & Autonomy",
    "Uncertainty-Aware Findings",
    "Do scored findings expose evidence sufficiency, contradiction risk, judge agreement, and uncertainty before driving decisions?",
    "Require per-question confidence controls and downgrade evidence when uncertainty is high.",
    "Add confidence controls to each finding and downgrade presentation status when evidence is thin or contradictory.",
    ["confidence.findings", "uncertainty.presentation", "judges.agreement"]
  ),
  lifecycleSeed(
    "AMC-UNC-1.2",
    "uncertainty-controls",
    "Culture & Alignment",
    "Auto-Fix Decisiveness Gates",
    "Are automated fixes blocked when confidence, evidence sufficiency, or decisiveness do not meet the threshold?",
    "Require auto-fix allow/block reasons, confidence thresholds, and reviewer escalation records.",
    "Require recommendation control checks before auto-fix and route uncertain changes to human review.",
    ["confidence.autoFix", "recommendations.gates", "review.escalation"]
  ),
  lifecycleSeed(
    "AMC-RTW-1.1",
    "runtime-gateway-watch",
    "Strategic Agent Operations",
    "Runtime Run State Management",
    "Does each live runtime run have durable state, status transitions, event history, and safe resume or cancel controls?",
    "Require runtime run state, event log, status transition evidence, and resume/cancel/degrade receipts.",
    "Persist runtime run state and append events for start, trace, policy decision, degraded, canceled, and completed transitions.",
    ["runtime.runState", "runtime.events", "runtime.resumeCancel"]
  ),
  lifecycleSeed(
    "AMC-RTW-1.2",
    "runtime-gateway-watch",
    "Resilience",
    "Gateway Policy Decision Watch",
    "Are gateway policy decisions linked into runtime events so operators can see allow, deny, degrade, and alert outcomes?",
    "Require policy decision events, linked receipt IDs, alert records, and gateway route context.",
    "Append policy decision events from the runtime gateway and summarize deny/degrade patterns in Watch.",
    ["gateway.policyEvents", "watch.alerts", "runtime.receipts"]
  ),
  lifecycleSeed(
    "AMC-FLEET-1.1",
    "fleet-org-operation",
    "Strategic Agent Operations",
    "Fleet Parent Lifecycle Spine",
    "Do fleet assessments create a parent lifecycle record linking child agents, shared resources, topology, and aggregate status?",
    "Require parent run ID, child run IDs, topology, shared resource manifests, and child artifact paths.",
    "Create a signed parent lifecycle artifact after fleet scoring and link every child diagnostic run into it.",
    ["fleet.parentRun", "fleet.topology", "lifecycle.childRuns"]
  ),
  lifecycleSeed(
    "AMC-FLEET-1.2",
    "fleet-org-operation",
    "Skills",
    "Org Handoff and Cascade Failure Management",
    "Can the organization detect shared weaknesses, cascade failures, and unresolved handoffs across many agents or roles?",
    "Require cascade failure records, role handoff notes, shared weakness summaries, and remediation owner evidence.",
    "Aggregate weak links across agents and route shared failures to accountable org roles with handoff notes.",
    ["fleet.cascadeFailures", "org.handoffs", "remediation.owners"]
  )
];

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function lifecycleQuestions(): DiagnosticQuestion[] {
  return LIFECYCLE_QUESTION_SEEDS.map((seed) => {
    const family = FAMILY_BY_ID.get(seed.family)!;
    const base = buildQuestion(seed);
    return {
      ...base,
      questionSetVersion: LIFECYCLE_QUESTION_SET_VERSION,
      family: seed.family,
      surfaces: family.surfaces,
      assessmentLayers: unique([seed.layerName, ...family.layers]),
      introducedIn: LIFECYCLE_QUESTION_SET_VERSION,
      scoringWeight: 1,
      activeByDefault: false
    };
  });
}

const LIFECYCLE_QUESTIONS = lifecycleQuestions();

function normalizeVersion(version?: string): DiagnosticQuestionSetVersion {
  const raw = (version ?? DEFAULT_QUESTION_SET_VERSION).trim().toLowerCase();
  if (raw === "legacy" || raw === "default" || raw === "240" || raw === LEGACY_QUESTION_SET_VERSION) {
    return DEFAULT_QUESTION_SET_VERSION;
  }
  if (raw === "lifecycle" || raw === "expanded" || raw === "2026" || raw === LIFECYCLE_QUESTION_SET_VERSION) {
    return LIFECYCLE_QUESTION_SET_VERSION;
  }
  throw new Error(`Unknown question set "${version}". Use ${DEFAULT_QUESTION_SET_VERSION} or ${LIFECYCLE_QUESTION_SET_VERSION}.`);
}

function coreDimension(questionCount: number): DiagnosticQuestionSetDimension {
  return {
    family: "core",
    title: "Core AMC Assessment",
    description: "The stable default evidence-weighted AMC assessment.",
    questionCount,
    surfaces: ["Score"],
    layers: unique(questionBank.map((question) => question.layerName))
  };
}

function dimensionsFor(questions: DiagnosticQuestion[], includeLifecycle: boolean): DiagnosticQuestionSetDimension[] {
  const dimensions = [coreDimension(questionBank.length)];
  if (!includeLifecycle) {
    return dimensions;
  }

  for (const family of LIFECYCLE_FAMILIES) {
    const questionCount = questions.filter((question) => question.family === family.family).length;
    dimensions.push({
      family: family.family,
      title: family.title,
      description: family.description,
      questionCount,
      surfaces: family.surfaces,
      layers: family.layers
    });
  }
  return dimensions;
}

function baseInfo(version: DiagnosticQuestionSetVersion, questions: DiagnosticQuestion[]): DiagnosticQuestionSetInfo {
  const includeLifecycle = version === LIFECYCLE_QUESTION_SET_VERSION;
  return {
    version,
    title: includeLifecycle
      ? "Lifecycle expanded AMC assessment"
      : "Default AMC assessment",
    questionCount: questions.length,
    default: version === DEFAULT_QUESTION_SET_VERSION,
    includedVersions: includeLifecycle
      ? [DEFAULT_QUESTION_SET_VERSION, LIFECYCLE_QUESTION_SET_VERSION]
      : [DEFAULT_QUESTION_SET_VERSION],
    dimensions: dimensionsFor(questions, includeLifecycle)
  };
}

function applyIndustryWeights(params: {
  questions: DiagnosticQuestion[];
  info: DiagnosticQuestionSetInfo;
  workspace?: string;
  env?: NodeJS.ProcessEnv;
}): DiagnosticQuestionSet {
  const entitlement = getIndustryPackEntitlement(params.workspace, params.env);
  if (!entitlement.active) {
    return {
      version: params.info.version as DiagnosticQuestionSetVersion,
      title: params.info.title,
      questions: params.questions,
      info: {
        ...params.info,
        domainPackWeighting: {
          requested: true,
          applied: false,
          entitlementActive: false,
          modifiedQuestionCount: 0,
          message: entitlement.message
        }
      }
    };
  }

  const packCount = listIndustryPacks().length;
  let modifiedQuestionCount = 0;
  const questions = params.questions.map((question) => {
    if (question.questionSetVersion !== LIFECYCLE_QUESTION_SET_VERSION) {
      return question;
    }
    const surfaces = question.surfaces ?? [];
    const boost = surfaces.some((surface) => surface === "Comply" || surface === "Fleet")
      ? 1.2
      : surfaces.some((surface) => surface === "Enforce" || surface === "Watch")
        ? 1.15
        : 1.1;
    modifiedQuestionCount += 1;
    return {
      ...question,
      scoringWeight: boost
    };
  });

  return {
    version: params.info.version as DiagnosticQuestionSetVersion,
    title: params.info.title,
    questions,
    info: {
      ...params.info,
      domainPackWeighting: {
        requested: true,
        applied: modifiedQuestionCount > 0,
        entitlementActive: true,
        modifiedQuestionCount,
        message: `Industry pack weighting applied from ${packCount} entitled Industry Packs.`
      }
    }
  };
}

export function getQuestionSet(options: QuestionSetOptions = {}): DiagnosticQuestionSet {
  const version = normalizeVersion(options.version);
  const includeLifecycle = version === LIFECYCLE_QUESTION_SET_VERSION;
  const questions = includeLifecycle
    ? [...questionBank, ...LIFECYCLE_QUESTIONS]
    : [...questionBank];
  const info = baseInfo(version, questions);
  const set: DiagnosticQuestionSet = {
    version,
    title: info.title,
    questions,
    info
  };

  if (!options.applyIndustryPackWeights) {
    return set;
  }

  return applyIndustryWeights({
    questions: set.questions,
    info: set.info,
    workspace: options.workspace,
    env: options.env
  });
}

export function listQuestionSets(): DiagnosticQuestionSetInfo[] {
  return [
    getQuestionSet({ version: DEFAULT_QUESTION_SET_VERSION }).info,
    getQuestionSet({ version: LIFECYCLE_QUESTION_SET_VERSION }).info
  ];
}

export function allKnownQuestions(): DiagnosticQuestion[] {
  return [...questionBank, ...LIFECYCLE_QUESTIONS];
}

export function resolveQuestionSetVersion(version?: string): DiagnosticQuestionSetVersion {
  return normalizeVersion(version);
}
