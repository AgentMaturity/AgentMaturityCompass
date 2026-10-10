/**
 * Aspire, conceptualization (P1-59; design §10.1). Understand runs the detectors and reflects the answers; Explain renders
 * the same facts at three levels; Propose builds the brief from the answers (a context graph, a misuse section, a typed
 * graph sketch, PMF hypotheses that stay `proposed`, ≥ 2 alternatives, a learning plan, a quality specification, a value
 * contract draft); Build writes them through the fleet's own writers and freezes the revision naming what was written;
 * Review checks it. Everything is self_reported and runs offline with no provider key; no output names a maturity level.
 * Hypotheses live only in the revision spec, never in the decision-receipt files a full score run marks observed.
 */
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import YAML from "yaml";
import { listArchetypes, previewArchetypeApply } from "../../archetypes/index.js";
import { validateContextGraph, type ContextGraph } from "../../context/contextGraph.js";
import { a4QualitySpecSchema, type A4QualitySpec } from "../../contracts/v1/a4Package.js";
import { getPrivateKeyPem, getPublicKeyHistory, verifyHexDigestAny } from "../../crypto/keys.js";
import { writeEnforceResourceManifest } from "../../enforce/resourceManifest.js";
import { parseStation } from "../../domains/stations.js";
import { getAgentPaths } from "../../fleet/paths.js";
import { agentConfigSchema, buildAgentConfig, saveAgentConfig, scaffoldAgent, verifyAgentConfigSignature, type AgentConfig } from "../../fleet/registry.js";
import { typedMultiAgentGraphDigest, typedMultiAgentGraphSchema, writeTypedMultiAgentGraph } from "../../fleet/typedGraph.js";
import { assertOwnerMode } from "../../mode/mode.js";
import { signArtifactFile } from "../../lifecycle/artifactSignature.js";
import { initOutcomeContract, outcomeContractPath, upsertOutcomeContract } from "../../outcomes/outcomeContractEngine.js";
import { outcomeContractSchema, type OutcomeCategory, type OutcomeMetric } from "../../outcomes/outcomeContractSchema.js";
import { createSignedTargetProfile, defaultTargetMapping, loadTargetProfileFromFile, saveTargetProfile, verifyTargetProfileSignature } from "../../targets/targetProfile.js";
import type { TargetProfile } from "../../types.js";
import { ensureDir, pathExists, writeFileAtomic } from "../../utils/fs.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import { valueContractApplyForApi } from "../../value/valueApi.js";
import { valueContractTemplate } from "../../value/valueContracts.js";
import { valueAgentContractPath } from "../../value/valueStore.js";
import { a4ProjectsRoot } from "../a4Blobs.js";
import type { A4EffectContext, A4EffectDef, A4EffectOutcome } from "../a4Effects.js";
import { explain, type A4ExplainFact, type A4ExplainLevel } from "../a4Explain.js";
import { RESOURCE_SLOTS } from "../a4Gates.js";
import type { A4ProducerContext, A4ProducerResult } from "../a4RouterStages.js";
import { a4HypothesisSchema, mapRiskTier, type A4Answer, type A4Hypothesis, type A4StageRegistry } from "../a4Schema.js";
import { TIER_RANK, type A4ReadinessState } from "../a4Readiness.js";
import { A4StoreError } from "../a4Store.js";
import { errorCodeOf, understandAspire } from "../aspireUnderstand.js";
import {
  ASPIRE_CLAIM_BOUNDARY, ASPIRE_SPEC_SCHEMA, HYPOTHESIS_ID, QUESTIONS, answerGaps, answerValues, answersDigestOf, aspireItems, aspireSpecOf, dependencyDigest,
  hypothesisDigestOf, learningPlanSchema, listValue, misuseSchema, previousHypotheses, textValue, unmeasuredTargets
} from "../spec/aspire.js";

const DAY_MS = 86_400_000;
const HYPOTHESIS_WINDOW_DAYS = 90;
const NOT_OBSERVED = "NO_RUNTIME_OBSERVATION_AT_ASPIRE";
/** The parts of a proposal a member may write; every other part is built from the answers. */
const EDITABLE = ["hypotheses", "learningPlan", "quality", "misuse"] as const;
type Editable = (typeof EDITABLE)[number];

const fail = (status: number, code: string, message: string, detail?: unknown): A4StoreError => new A4StoreError(status, code, message, detail);
const relPath = (workspace: string, path: string): string => relative(workspace, path).split(sep).join("/");
/** A file's bytes; null only when it is absent. Any other read error is 409 RESOURCE_UNREADABLE naming `what` (the RESOURCE_SLOTS contract). */
function readOrAbsent(path: string, what: string): Buffer | null {
  try {
    return readFileSync(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw fail(409, "RESOURCE_UNREADABLE", `${what} could not be read (${code ?? "unknown error"})`);
  }
}
function fileSha(path: string, what: string): string | null {
  const bytes = readOrAbsent(path, what);
  return bytes === null ? null : sha256Hex(bytes);
}
/** sha256Hex(canonicalize(graph)): the contextGraphHash scaffoldAgent and initWorkspace sign into the target profile. */
function contextGraphSha256(workspace: string, agentId: string): string | null {
  const what = "brief.contextGraphSha256 (the agent's context-graph.json)";
  const bytes = readOrAbsent(getAgentPaths(workspace, agentId).contextGraph, what);
  if (bytes === null) return null;
  let graph: unknown;
  try {
    graph = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw fail(409, "RESOURCE_UNREADABLE", `${what} is not JSON`);
  }
  return sha256Hex(canonicalize(graph));
}

/** The typed graph Build writes for the agent (writeTypedMultiAgentGraph's per-graph file, graphId `a4-<agentId>`). */
const typedGraphPath = (workspace: string, agentId: string): string => join(workspace, ".amc", "fleet", "typed-graphs", `a4-${agentId}.json`);
/** typedMultiAgentGraphDigest of that file, the digest Enforce's manifest records for a typed graph. */
function typedGraphDigest(workspace: string, agentId: string): string | null {
  const what = "graph.typedGraphDigest (the agent's typed multi-agent graph)";
  const bytes = readOrAbsent(typedGraphPath(workspace, agentId), what);
  if (bytes === null) return null;
  try {
    return typedMultiAgentGraphDigest(typedMultiAgentGraphSchema.parse(JSON.parse(bytes.toString("utf8"))));
  } catch {
    throw fail(409, "RESOURCE_UNREADABLE", `${what} is not a typed multi-agent graph`);
  }
}

/** Readiness items and the brief and graph slots a gate binds and every decide, complete and executor preamble recomputes. */
export function register(registry: A4StageRegistry): void {
  registry.items.push(aspireItems);
  RESOURCE_SLOTS["brief.contextGraphSha256"] = contextGraphSha256;
  RESOURCE_SLOTS["brief.agentConfigSha256"] = (workspace, agentId) => fileSha(getAgentPaths(workspace, agentId).agentConfig, "brief.agentConfigSha256 (the agent config)");
  RESOURCE_SLOTS["graph.typedGraphDigest"] = typedGraphDigest;
  registry.registerEffect(CONTRACTS_EFFECT);
}

/** Why a detached `.sig` (registry.ts's format) does not sign `bytes` under this workspace's auditor keys; null when it does. */
function signatureProblem(workspace: string, bytes: Buffer, sigBytes: Buffer | null): string | null {
  if (sigBytes === null) return "signature missing";
  let sig: { digestSha256?: unknown; signature?: unknown; signer?: unknown } | null;
  try {
    sig = JSON.parse(sigBytes.toString("utf8")) as typeof sig;
  } catch {
    return "signature unreadable";
  }
  if (sig === null || typeof sig !== "object" || sig.signer !== "auditor" || typeof sig.signature !== "string") return "signature unreadable";
  const digest = sha256Hex(bytes);
  if (sig.digestSha256 !== digest) return "digest mismatch";
  try {
    return verifyHexDigestAny(digest, sig.signature, getPublicKeyHistory(workspace, "auditor")) ? null : "signature verify failed";
  } catch (error) {
    return `signature not checkable (${error instanceof Error ? error.message.slice(0, 120) : "no auditor key"})`;
  }
}

/** Quality dimensions as outcome-contract categories (a coarse default; the contract's owner edits it). */
const OUTCOME_CATEGORY: Readonly<Record<A4QualitySpec["targets"][number]["dimension"], OutcomeCategory>> = {
  capability: "Functional", reliability: "Functional", latency: "Functional", maintainability: "Functional", cost: "Economic", impact: "Economic",
  security: "Brand", privacy: "Brand"
};

/**
 * The outcome-contract metrics a quality spec states: one per target with an evidence source (an uninstrumented target
 * gives none), its signal that source, its target the member's own at every level (Aspire derives no level ladder).
 */
export function outcomeMetricsOf(quality: unknown): OutcomeMetric[] {
  const parsed = a4QualitySpecSchema.safeParse(quality);
  const metrics = (parsed.success ? parsed.data.targets : []).filter((target) => (target.evidenceSource ?? "").trim() !== "" && target.measure !== "not instrumented")
    .map((target): OutcomeMetric => ({ metricId: `a4.${target.dimension}.${slug(target.statement)}`, category: OUTCOME_CATEGORY[target.dimension],
      description: target.statement, type: "avg", signal: target.evidenceSource!.trim(), target: { level3: target.target, level4: target.target, level5: target.target },
      evidenceRules: { trustTierAtLeast: target.evidenceMethod === "human_review" ? "ATTESTED" : "OBSERVED" } }));
  return [...new Map(metrics.map((metric) => [metric.metricId, metric])).values()];
}

/**
 * Merges `metrics` by metricId into the agent's outcome contract, read once and verified over those bytes, and re-signs
 * it; a contract that already holds them is left as it is (re-signing the same bytes repeats its ledger row's key).
 */
function mergeOutcomeMetrics(workspace: string, agentId: string, metrics: readonly OutcomeMetric[]): void {
  if (metrics.length === 0) return;
  const path = outcomeContractPath(workspace, agentId);
  const bytes = readOrAbsent(path, "The outcome contract");
  if (bytes === null || signatureProblem(workspace, bytes, readOrAbsent(`${path}.sig`, "The outcome contract's signature")) !== null) {
    throw fail(409, "OUTCOME_CONTRACT_UNTRUSTED", "The outcome contract is missing or does not verify under this workspace's keys.");
  }
  const current = outcomeContractSchema.parse(YAML.parse(bytes.toString("utf8"))).outcomeContract;
  const ids = new Set(metrics.map((metric) => metric.metricId));
  const next = { ...current, metrics: [...current.metrics.filter((metric) => !ids.has(metric.metricId)), ...metrics] };
  if (canonicalize(outcomeContractSchema.parse({ outcomeContract: next })) === canonicalize({ outcomeContract: current })) return;
  upsertOutcomeContract(workspace, { outcomeContract: next }, agentId);
}

/**
 * Aspire's completion effect (design §10.1, Completion approval): after GATE_CONSUMED, once the runner re-read the freeze
 * and recomputed the bound slots, the approved revision's value contract draft is applied when the agent has none (an
 * existing one is kept) and its quality-spec metrics are merged into the verified outcome contract, each signed by its
 * own writer. A signed receipt names both by path and sha256. A failure is recorded by its code; retry re-runs it.
 */
async function applyContracts({ workspace, state, gate }: A4EffectContext): Promise<A4EffectOutcome> {
  try {
    const revision = state.revisions.find((row) => row.revision_no === gate.revision_no);
    const spec = revision === undefined ? {} : JSON.parse(revision.spec_json) as Record<string, unknown>;
    const agentId = state.project.agent_id;
    // The outcome merge first: it is the step that refuses (an untrusted contract), so a retry still finds the value contract absent.
    const metrics = outcomeMetricsOf(spec.quality);
    mergeOutcomeMetrics(workspace, agentId, metrics);
    const valuePath = valueAgentContractPath(workspace, agentId);
    const valuePresent = pathExists(valuePath);
    if (!valuePresent) valueContractApplyForApi({ workspace, contract: spec.valueContractDraft, scopeType: "AGENT", scopeId: agentId });
    const outcomePath = outcomeContractPath(workspace, agentId);
    const receipt = canonicalize({ schema: "amc.a4-aspire-contracts/v1", projectId: state.project.project_id, gateId: gate.gate_id, revisionNo: gate.revision_no,
      valueContract: { path: relPath(workspace, valuePath), action: valuePresent ? "present" : "applied", sha256: fileSha(valuePath, "The value contract") },
      outcomeContract: { path: relPath(workspace, outcomePath), metricsMerged: metrics.map((metric) => metric.metricId), sha256: fileSha(outcomePath, "The outcome contract") } });
    const receiptPath = join(a4ProjectsRoot(workspace), state.project.project_id, "effects", `${gate.gate_id}.contracts.json`);
    ensureDir(dirname(receiptPath));
    writeFileAtomic(receiptPath, receipt, 0o644);
    signArtifactFile({ workspace, path: receiptPath, artifactKind: "a4-stage-output" });
    return { receipt: { refKind: "stage_output", refId: relPath(workspace, receiptPath), sha256: sha256Hex(receipt),
      label: `aspire completion: value contract ${valuePresent ? "kept" : "applied"}, ${metrics.length} outcome metric(s) merged (signed)` } };
  } catch (error) {
    // EFFECT_FAILED stores the message: a code only (messages name absolute paths).
    throw new Error(errorCodeOf(error, "ASPIRE_CONTRACTS_FAILED"));
  }
}
const CONTRACTS_EFFECT: A4EffectDef = { id: "a4.aspire.apply_contracts", toolName: "a4.aspire.apply_contracts", actionClass: "WRITE_LOW", consumes: "gate",
  completes: "aspire.completion", executionId: (_state, gate) => `a4-aspire-contracts-${gate.gate_id}`, run: applyContracts };

interface PriorAgent {
  /** Any of the agent's config, context graph or target profile is on disk (the root default agent of `amc init` has no config). */
  readonly exists: boolean;
  readonly config: AgentConfig | null;
  readonly mapping: Record<string, number> | null;
  readonly checked: { readonly agentConfig: "verified" | "absent"; readonly targetProfile: "verified" | "absent" };
}

/**
 * The agent's own signed files as Build may build on them, checked before anything is written: each is absent (ENOENT)
 * or verifies, the config over the very bytes that are then parsed. Anything else refuses (409) and nothing is written.
 * Only the agent's own target profile is read, never loadTargetProfile's fallback to the workspace root's.
 */
function priorAgent(workspace: string, agentId: string): PriorAgent {
  const paths = getAgentPaths(workspace, agentId);
  const untrusted = (code: string, message: string): A4StoreError => fail(409, code, `${message} Build wrote nothing; restore the file or have an owner re-sign it.`,
    { reasonCodes: [code] });
  const configBytes = readOrAbsent(paths.agentConfig, "The agent config");
  let config: AgentConfig | null = null;
  if (configBytes !== null) {
    const problem = signatureProblem(workspace, configBytes, readOrAbsent(`${paths.agentConfig}.sig`, "The agent config's signature"));
    if (problem !== null) throw untrusted("AGENT_CONFIG_UNTRUSTED", `The agent config does not verify under this workspace's keys (${problem}).`);
    let parsed: ReturnType<typeof agentConfigSchema.safeParse> | null = null;
    try {
      parsed = agentConfigSchema.safeParse(YAML.parse(configBytes.toString("utf8")));
    } catch {
      parsed = null;
    }
    if (parsed?.success !== true) throw untrusted("AGENT_CONFIG_INVALID", "The agent config is signed but does not parse as an agent config.");
    config = parsed.data;
  }
  const targetFile = join(paths.targetsDir, "default.target.json");
  let profile: TargetProfile | null = null;
  try {
    profile = loadTargetProfileFromFile(targetFile);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      if (typeof code === "string") throw fail(409, "RESOURCE_UNREADABLE", `The agent's target profile could not be read (${code})`);
      throw untrusted("TARGET_PROFILE_INVALID", "The agent's target profile does not parse.");
    }
  }
  if (profile !== null) {
    let valid = false;
    try {
      valid = verifyTargetProfileSignature(workspace, profile);
    } catch {
      valid = false;
    }
    if (!valid) throw untrusted("TARGET_PROFILE_UNTRUSTED", "The agent's target profile does not verify under this workspace's keys.");
  }
  return { exists: config !== null || profile !== null || pathExists(paths.contextGraph), config,
    mapping: profile?.mapping ?? null, checked: { agentConfig: config === null ? "absent" : "verified", targetProfile: profile === null ? "absent" : "verified" } };
}

/** The router's entry (src/a4/spec/aspire.ts PRODUCERS). */
export async function produceAspire(step: "understand" | "explain" | "propose" | "build" | "review", ctx: A4ProducerContext): Promise<A4ProducerResult> {
  if (step === "understand") return understand(ctx);
  if (step === "explain") return explainStep(ctx);
  if (step === "propose") return propose(ctx);
  if (step === "build") return build(ctx);
  return review(ctx);
}

const createdProfile = (state: A4ReadinessState): Record<string, unknown> => state.chain.find((link) => link.kind === "CREATED")?.body ?? {};

/** Understand: the detectors (one ref each), the reflection, and pre-fills for unanswered questions (`source: "inferred"`). */
function understand(ctx: A4ProducerContext): A4ProducerResult {
  const { spec, answers } = aspireSpecOf(ctx.state);
  const profile = createdProfile(ctx.state);
  const found = understandAspire(ctx.workspace, ctx.state.project.agent_id, answers, { expertise: profile.expertise, archetype: profile.archetype });
  const revisionNo = ctx.state.project.revision_no + 1;
  const values = answerValues(answers);
  for (const entry of found.inferred) values.set(entry.questionId, entry.value);
  const inferred: A4Answer[] = found.inferred.map((entry) => ({ questionId: entry.questionId, value: entry.value, source: "inferred", answeredAtRevision: revisionNo,
    dependencyDigest: dependencyDigest(QUESTIONS.find((question) => question.id === entry.questionId)?.dependsOn ?? [], values) }));
  const understanding = { reflection: found.reflection, inferred: found.inferred.map(({ questionId, from }) => ({ questionId, from })),
    facts: found.facts.map(({ id, lane, label, body }) => ({ id, lane, label, body })) };
  return {
    outputs: [...found.facts.map((fact) => ({ output: "understanding", label: fact.label, lane: fact.lane, method: fact.method, body: fact.body })),
      { output: "understanding", label: "aspire understand: reflection (what AMC understood from your answers)", lane: "recommendation", method: null, body: found.reflection }],
    spec: { ...spec, answers: [...answers, ...inferred].sort((a, b) => a.questionId.localeCompare(b.questionId)), understanding },
    response: { understanding: { reflection: found.reflection, inferred: understanding.inferred } }
  };
}

type UnderstandingFacts = Array<{ id: string; body: Record<string, unknown> }>;
const factBody = (spec: Record<string, unknown>, id: string): Record<string, unknown> =>
  ((spec.understanding as { facts?: UnderstandingFacts } | undefined)?.facts?.find((fact) => fact.id === id)?.body) ?? {};

/** Aspire's explanation facts: tier, archetypes, stations, trade-offs, what is not evaluated, the business case, the stub. */
export function aspireFacts(spec: Record<string, unknown>, answers: readonly A4Answer[]): A4ExplainFact[] {
  const values = answerValues(answers);
  const tier = textValue(values.get("riskTier"));
  const regulated = tier !== "low" && tier !== "med";
  const stations = (factBody(spec, "stations").stations as Array<{ station: string }> | undefined)?.map((entry) => entry.station) ?? [];
  const entries = (factBody(spec, "register").entries as Array<{ id: string; verified: boolean }> | undefined) ?? [];
  const unverified = entries.filter((entry) => !entry.verified).length;
  const matches = (factBody(spec, "archetypes").matches as Array<{ id: string; sharedWords: string[] }> | undefined) ?? [];
  return [
    { id: "risk-tier", sources: ["answers.riskTier", "a4Readiness.isRegulated"], dataStatus: null,
      novice: tier === null ? "You have not chosen a risk level yet, so AMC treats the project as high risk and asks two different people to approve each step."
        : regulated ? `You chose ${tier} risk, so AMC asks two different people to approve each step.`
          : `You chose ${tier} risk. AMC still asks two different people for each step (one asks, another approves) when your workspace requires that for every project, or when ${tier} is lower than the agent's current risk level; otherwise, if you are the only user, you may approve your own steps, which AMC labels self-approved.`,
      practitioner: `riskTier "${tier ?? "unstated"}" is written to context-graph.json and sent as the gate request's riskTier (${tier === null ? "high" : mapRiskTier(tier as "low")}); high or critical makes the project regulated, and so do the workspace's a4.regulated floor and a tier below the agent's current one.`,
      expert: `isRegulated(state, floor): floor.regulated, riskTierOf(brief) ∉ {low, med, medium}, brief.priorRiskTier ranked above it, or an activated Adapt plan → requireDistinctUsers on every gate and deriveSelfApprovalAllowed() → false.` },
    { id: "archetype", sources: ["listArchetypes", "answers.archetypeInterest"], dataStatus: null,
      novice: matches.length > 0 ? `Archetypes that share words with your answers: ${matches.slice(0, 3).map((entry) => entry.id).join(", ")}. Propose shows what each would change.` : "No archetype shares words with your answers; Propose still offers alternatives.",
      practitioner: `Matched by shared words with the agent, problem and goals (a keyword match, self-reported): ${matches.slice(0, 3).map((entry) => `${entry.id} (${entry.sharedWords.length})`).join(", ") || "none"}.`,
      expert: "listArchetypes() ranked by |words(name ∪ description) ∩ words(agent, problem, goals)|; previewArchetypeApply() gives each alternative's context diff (no write)." },
    { id: "stations", sources: ["answers.stations", "getRegisterEntriesForStation"], dataStatus: entries.length === 0 ? null : unverified > 0 ? "unverified" : "verified",
      novice: stations.length > 0 ? `Your agent touches ${stations.join(", ")}. AMC lists ${entries.length} rules for these areas; ${unverified} of them are not verified yet. Which ones apply is decided later, at Adapt.` : "No station is chosen yet, so AMC lists no rules.",
      practitioner: `${entries.length} register entries for ${stations.join(", ") || "no station"}; verified flags as the register records them; applicability is not evaluated at Aspire.`,
      expert: "getRegisterEntriesForStation(station) per station, deduplicated by id; `verified` verbatim; compilePlan decides applicability at Adapt." },
    { id: "trade-offs", sources: ["answers.governance", "detectFrameworksForOnboarding"], dataStatus: null,
      novice: "Building a new agent in AMC gives the most evidence; connecting an existing one keeps your code. More autonomy means fewer approvals but less oversight.",
      practitioner: "Native: Assemble builds on AMC's runtime and the tool pipeline records every action. External: AMC records what the integration path can enforce. Oversight: every gate needs an approval; regulated gates need two people.",
      expert: "Native → NativeTaskService under the tool pipeline; external → IntegrationClaim per path (P1-60); oversight → A4 gate policy floors over the signed approval policy." },
    { id: "not-evaluated", sources: ["notEvaluatedLevel", "design §10.3"], dataStatus: null,
      novice: "Nothing here measures how good your agent is. That needs evidence from runs, which do not exist yet.",
      practitioner: "No maturity level is computed at Aspire; a level comes only from a scoring run over evidence. Which rules apply is decided at Adapt.",
      expert: "A4 computes no level (notEvaluatedLevel for any level text); the compiled applicability plan is Adapt's." },
    { id: "business-case", sources: ["calculateTrustGapRoi", "envelopeForUnboundResult"], dataStatus: null,
      novice: "AMC did not estimate money or risk for this agent. Any estimate from your own numbers would be your estimate, not AMC's.",
      practitioner: "No business case was computed. ROI or risk figures from your own numbers would be self-reported and not evaluated.",
      expert: "An optional business case would carry envelopeForUnboundResult({ method: \"numeric_self_answer\" }): self_reported, result not_evaluated, RESULT_NOT_BOUND." },
    { id: "keyless", sources: ["design §10.1 keyless first run"], dataStatus: null,
      novice: "You need no AI key for this. Later, the first build runs on a stand-in model, so it shows how AMC records actions, not how your agent behaves.",
      practitioner: "Aspire calls no model. Assemble's first native build runs on the stub provider; anything it says about the agent is labelled synthetic_example.",
      expert: "Stub-session refs carry claimKind synthetic_example (lane implementation); only runtime-written rows stay observed by reference." }
  ];
}

/** Explain: the facts once, rendered at the member's level; all three renderings are kept so the level only picks one. */
function explainStep(ctx: A4ProducerContext): A4ProducerResult {
  const level: A4ExplainLevel = ctx.level ?? "practitioner";
  const { spec, answers } = aspireSpecOf(ctx.state);
  const facts = aspireFacts(spec, answers);
  const items = explain(facts, level);
  return { outputs: [{ output: "explanation", label: `aspire explain at the ${level} level`, lane: "recommendation", method: null, body: { level, items } }],
    spec: { ...spec, explanation: { level, facts } }, response: { explanation: { level, items } } };
}

const slug = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64) || "metric";

/** The context graph the brief proposes, in the shape initWorkspace writes; 409 A4_NOT_READY when it does not validate. */
function contextGraphOf(values: ReadonlyMap<string, unknown>, agentName: string): ContextGraph {
  const tier = textValue(values.get("riskTier")) ?? "high";
  const regulated = textValue(values.get("governance")) === "regulated";
  const entity = (type: string, prefix: string, labels: string[]) => labels.map((label, index) => ({ id: `${prefix}-${index + 1}`, type, label }));
  try {
    return validateContextGraph({
      mission: `${agentName}: ${textValue(values.get("problem")) ?? ""}`, successMetrics: listValue(values.get("successMetrics")),
      constraints: listValue(values.get("constraints")), forbiddenActions: listValue(values.get("forbiddenActions")), riskTier: tier,
      escalationRules: [regulated ? "Escalate to two distinct approvers before any irreversible action" : "Escalate to an approver before any irreversible action",
        "Escalate when required evidence is missing", "Escalate when confidence is low"],
      entities: [...entity("Goal", "goal", listValue(values.get("goals"))), ...entity("Stakeholder", "stakeholder", listValue(values.get("audience"))),
        ...entity("Constraint", "constraint", listValue(values.get("constraints"))), ...entity("Metric", "metric", listValue(values.get("successMetrics"))),
        { id: "risk-1", type: "RiskTier", label: tier }]
    });
  } catch (error) {
    throw fail(409, "A4_NOT_READY", `The answers do not make a valid context graph: ${error instanceof Error ? error.message.slice(0, 300) : String(error)}`,
      { reasonCodes: ["CONTEXT_GRAPH_INVALID"] });
  }
}

/** The solution sketch: the agent, its audiences and its approver, with typed handoffs (the typed multi-agent graph draft). */
function typedGraphOf(agentId: string, agentName: string, values: ReadonlyMap<string, unknown>, now: number) {
  const audiences = listValue(values.get("audience")).slice(0, 5);
  const tier = textValue(values.get("riskTier"));
  const severity = tier === "critical" ? "critical" : tier === "high" ? "high" : "medium";
  return typedMultiAgentGraphSchema.parse({
    schemaVersion: "2026-05-22", graphId: `a4-${agentId}`, fleetId: "default", createdAt: new Date(now).toISOString(), maxFanOut: 5,
    nodes: [
      { nodeId: "agent", agentId, nodeType: "agent", role: agentName, description: textValue(values.get("problem")) ?? "",
        inputs: [{ name: "request", schema: "text" }], outputs: [{ name: "response", schema: "text" }, { name: "escalation", schema: "escalation" }] },
      { nodeId: "approver", nodeType: "human", role: textValue(values.get("governance")) === "regulated" ? "two distinct approvers" : "approver",
        inputs: [{ name: "escalation", schema: "escalation" }] },
      ...audiences.map((audience, index) => ({ nodeId: `audience-${index + 1}`, nodeType: "human", role: audience, outputs: [{ name: "request", schema: "text" }] }))
    ],
    edges: [
      ...audiences.map((_audience, index) => ({ edgeId: `audience-${index + 1}-agent`, from: `audience-${index + 1}`, to: "agent", edgeType: "handoff", purpose: "requests",
        contract: { inputSchema: "text", outputSchema: "text", requiredEvidence: [], approvalRequired: false } })),
      { edgeId: "agent-approver", from: "agent", to: "approver", edgeType: "approval", purpose: "escalation before irreversible actions",
        contract: { inputSchema: "escalation", outputSchema: "decision", requiredEvidence: [], approvalRequired: true } }
    ],
    invariants: listValue(values.get("forbiddenActions")).map((action, index) => ({ invariantId: `forbidden-${index + 1}`, description: `Never: ${action}`, severity }))
  });
}

/** ≥ 2 alternatives: the brief on its own, matching archetypes with their dry-run context diff, and a detected framework. */
function alternativesOf(ctx: A4ProducerContext, spec: Record<string, unknown>, values: ReadonlyMap<string, unknown>) {
  const named = textValue(values.get("archetypeInterest"));
  const matched = (factBody(spec, "archetypes").matches as Array<{ id: string; sharedWords: string[] }> | undefined) ?? [];
  const known = new Map(listArchetypes().map((entry) => [entry.id, entry]));
  const ids = [...new Set([...(named !== null && known.has(named) ? [named] : []), ...matched.map((entry) => entry.id)])].filter((id) => known.has(id)).slice(0, 2);
  if (ids.length === 0) ids.push(...[...known.keys()].slice(0, 1));
  const detected = (factBody(spec, "frameworks").detections as Array<{ framework: string }> | undefined) ?? [];
  return [
    { id: "native", title: "A new AMC-native agent built from this brief", archetypeId: null, reason: "Uses only your answers; Assemble builds it on AMC's native runtime.",
      tradeOffs: ["Every action passes the tool pipeline and is recorded", "You write what an archetype would pre-fill"], preview: null, previewReason: "NO_ARCHETYPE" },
    ...ids.map((id) => {
      let preview: { contextDiff: string[] } | null = null;
      let previewReason: string | null = null;
      try {
        preview = { contextDiff: previewArchetypeApply({ workspace: ctx.workspace, agentId: ctx.state.project.agent_id, archetypeId: id }).contextDiff };
      } catch {
        previewReason = pathExists(getAgentPaths(ctx.workspace, ctx.state.project.agent_id).contextGraph) ? "PREVIEW_FAILED" : "AGENT_HAS_NO_CONTEXT_GRAPH";
      }
      const shared = matched.find((entry) => entry.id === id)?.sharedWords ?? [];
      return { id: `archetype:${id}`, title: known.get(id)!.name, archetypeId: id,
        reason: id === named ? "You named this archetype." : `Shares ${shared.length} word(s) with your answers (a keyword match): ${shared.join(", ") || "none"}.`,
        tradeOffs: ["Starts from the archetype's guardrails, prompt and eval harness", "Merges its context into yours"], preview, previewReason };
    }),
    ...detected.slice(0, 1).map((entry) => ({ id: `external:${slug(entry.framework)}`, title: `Connect the ${entry.framework} agent found in this workspace`, archetypeId: null,
      reason: "A framework was detected by a file scan; Assemble's external path records what that integration can enforce.",
      tradeOffs: ["Keeps your code", "AMC sees only what the integration path reports"], preview: null, previewReason: "EXTERNAL_PATH" }))
  ];
}

/**
 * A member's edit of one editable part, validated; null when the proposal does not change it. A hypothesis new in this
 * edit (its content digest is in no earlier one) predicts from now: its window starts at or after the server's `now`
 * and ends after it starts, so no row written before the prediction can observe it. Its id is one the observe route takes.
 */
function editOf(key: Editable, input: Record<string, unknown> | undefined, previous: Record<string, unknown>, now: number): unknown {
  if (input === undefined || !Object.hasOwn(input, key) || canonicalize(input[key] ?? null) === canonicalize(previous[key] ?? null)) return null;
  const value = input[key];
  const parsed = key === "hypotheses" ? a4HypothesisSchema.array().min(1).safeParse(value) : key === "learningPlan" ? learningPlanSchema.safeParse(value)
    : key === "quality" ? a4QualitySpecSchema.safeParse(value) : misuseSchema.safeParse(value);
  if (!parsed.success) throw fail(400, "INPUT_INVALID", `${key}: ${parsed.error.issues[0]?.message ?? "invalid"}`);
  if (key === "hypotheses") {
    const rows = parsed.data as A4Hypothesis[];
    if (rows.some((entry) => entry.status !== "proposed" || entry.verdict !== null)) {
      throw fail(400, "INPUT_INVALID", "A hypothesis is proposed with no verdict; only …/hypotheses/:id/observe moves it.");
    }
    if (new Set(rows.map((entry) => entry.id)).size !== rows.length) throw fail(400, "INPUT_INVALID", "hypotheses: each id names one hypothesis.");
    const bad = rows.find((entry) => !HYPOTHESIS_ID.test(entry.id));
    if (bad !== undefined) throw fail(400, "INPUT_INVALID", `hypotheses: an id is 1 to 128 letters, digits, ".", "_" or "-" (${bad.id.slice(0, 40)})`);
    const known = new Set(previousHypotheses(previous).map(hypothesisDigestOf));
    const early = rows.find((entry) => !known.has(hypothesisDigestOf(entry))
      && !(Date.parse(entry.window.from) >= now && Date.parse(entry.window.to) > Date.parse(entry.window.from)));
    if (early !== undefined) {
      throw fail(400, "INPUT_INVALID", `hypotheses: ${early.id} is new or changed, so its window starts now or later (server time ${new Date(now).toISOString()}) and ends after it starts.`);
    }
  }
  return parsed.data;
}

const tierRank = (tier: string): number => TIER_RANK[tier] ?? 2;
const highestTier = (tiers: ReadonlyArray<string | null>): string | null =>
  tiers.filter((tier): tier is string => tier !== null).sort((a, b) => tierRank(b) - tierRank(a))[0] ?? null;
/** The bar an earlier proposal of this stage recorded (null before the first). */
const priorTierOf = (spec: Record<string, unknown>): string | null => {
  const prior = (spec.brief as { priorRiskTier?: unknown } | undefined)?.priorRiskTier;
  return prior === undefined || prior === null ? null : typeof prior === "string" ? prior : "unreadable";
};

/**
 * The agent's risk tier before this brief: the higher of its config's and its context graph's, each read only from
 * verified bytes: the config when its detached signature verifies over the bytes read, the graph when it is what the
 * agent's own verified target profile signs (contextGraphHash). Any other file counts as "unreadable", which ranks as
 * high (unknown risk is not low risk), so a tier never comes from an editable file; isRegulated decides a lowering as
 * regulated (src/a4/a4Readiness.ts).
 */
function priorRiskTierOf(workspace: string, agentId: string): string | null {
  const paths = getAgentPaths(workspace, agentId);
  const tierOf = (value: unknown): string => {
    const tier = (value as { riskTier?: unknown } | null)?.riskTier;
    return typeof tier === "string" ? tier : "unstated";
  };
  const configTier = (bytes: Buffer | null): string | null => {
    if (bytes === null) return null;
    if (signatureProblem(workspace, bytes, readOrAbsent(`${paths.agentConfig}.sig`, "The agent config's signature")) !== null) return "unreadable";
    try {
      return tierOf(YAML.parse(bytes.toString("utf8")));
    } catch {
      return "unreadable";
    }
  };
  const graphTier = (bytes: Buffer | null): string | null => {
    if (bytes === null) return null;
    try {
      const graph = JSON.parse(bytes.toString("utf8")) as unknown;
      const profile = loadTargetProfileFromFile(join(paths.targetsDir, "default.target.json"));
      return verifyTargetProfileSignature(workspace, profile) && profile.contextGraphHash === sha256Hex(canonicalize(graph)) ? tierOf(graph) : "unreadable";
    } catch {
      return "unreadable";
    }
  };
  return highestTier([configTier(readOrAbsent(paths.agentConfig, "The agent config")), graphTier(readOrAbsent(paths.contextGraph, "The agent's context graph"))]);
}

/** Propose: the brief and everything around it, from the answers; members may edit hypotheses, learning plan, quality and misuse. */
function propose(ctx: A4ProducerContext): A4ProducerResult {
  const { spec, answers } = aspireSpecOf(ctx.state);
  const gaps = answerGaps(answers);
  const codes = [...gaps.missing.map((id) => `ANSWER_MISSING:${id}`), ...gaps.stale.map((id) => `ANSWER_STALE:${id}`), ...gaps.invalid.map((id) => `ANSWER_INVALID:${id}`)];
  if (codes.length > 0) throw fail(409, "A4_NOT_READY", "Answer or confirm the listed questions before proposing.", { reasonCodes: codes });
  for (const key of Object.keys(ctx.spec ?? {})) {
    if (!(EDITABLE as readonly string[]).includes(key) && canonicalize(ctx.spec![key] ?? null) !== canonicalize(spec[key] ?? null)) {
      throw fail(400, "INPUT_INVALID", `${key} is built from your answers; change the answers instead (members edit ${EDITABLE.join(", ")}).`);
    }
  }
  const values = answerValues(answers);
  const agentId = ctx.state.project.agent_id;
  const agentLine = textValue(values.get("agent")) ?? agentId;
  const agentName = agentLine.split(":")[0]!.trim().slice(0, 80) || agentId;
  const metrics = [...new Set(listValue(values.get("successMetrics")))];
  const audience = listValue(values.get("audience"));
  const edited = new Set(Array.isArray(spec.edited) ? spec.edited.filter((key): key is string => typeof key === "string") : []);
  const pick = <T>(key: Editable, generated: () => T): T => {
    const edit = editOf(key, ctx.spec, spec, ctx.now);
    if (edit !== null) {
      edited.add(key);
      return edit as T;
    }
    return edited.has(key) ? spec[key] as T : generated();
  };
  const from = new Date(ctx.now).toISOString();
  const to = new Date(ctx.now + HYPOTHESIS_WINDOW_DAYS * DAY_MS).toISOString();
  // An id names its content (statement, outcome, window, source), never a list position; observations bind the content too.
  const hypotheses = pick("hypotheses", () => metrics.slice(0, 5).map((metric) => {
    const content = { statement: `Deploying ${agentName} for ${audience.join(", ")} improves: ${metric}`, predictedOutcome: metric, window: { from, to },
      evidenceSource: { eventType: "audit", metric: slug(metric) } };
    return { id: `h-${sha256Hex(canonicalize(content)).slice(0, 12)}`, ...content, verdict: null, status: "proposed" as const };
  }));
  const learningPlan = pick("learningPlan", () => [
    ...hypotheses.map((hypothesis, index) => ({ milestoneId: `learn-${index + 1}`, title: `Learn whether: ${hypothesis.statement}`,
      acceptanceCriteria: [`A runtime-written ${hypothesis.evidenceSource.eventType} row for ${hypothesis.evidenceSource.metric} inside the window`,
        `A recorded verdict on hypothesis ${hypothesis.id}`], evidenceSource: `${hypothesis.evidenceSource.eventType}:${hypothesis.evidenceSource.metric}`,
      dependsOn: [], status: "planned" as const })),
    { milestoneId: "first-observed-run", title: "A first session on a configured (non-stub) provider", acceptanceCriteria: ["A session the runtime recorded for this agent"],
      evidenceSource: "runtime session", dependsOn: [], status: "planned" as const }]);
  const quality = pick<A4QualitySpec>("quality", () => ({ targets: [
    ...metrics.map((metric) => ({ dimension: "impact" as const, statement: metric, measure: "not instrumented", target: metric, evidenceSource: null,
      evidenceMethod: "not_yet_decided" as const, source: "answers.successMetrics" })),
    { dimension: "security" as const, statement: "The agent never performs a forbidden action", measure: "not instrumented", target: "none performed",
      evidenceSource: null, evidenceMethod: "not_yet_decided" as const, source: "answers.forbiddenActions" }] }));
  const misuse = pick("misuse", () => listValue(values.get("forbiddenActions")).map((action) => ({ failureMode: `The agent attempts to ${action}`,
    mitigation: "Refused by the agent's policy and escalated to an approver", source: "drafted from answers.forbiddenActions; edit before approving" })));
  const contextGraph = contextGraphOf(values, agentName);
  const brief = { agent: agentLine, agentName, problem: textValue(values.get("problem")), audience, currentWorkflow: textValue(values.get("currentWorkflow")),
    goals: listValue(values.get("goals")), expertise: textValue(values.get("expertise")), markets: listValue(values.get("markets")).length > 0 ? listValue(values.get("markets")) : null,
    stations: [...new Set(listValue(values.get("stations")).map((value) => parseStation(value)))], governance: textValue(values.get("governance")),
    // The bar is carried: after this stage's own Build the files hold its lowered tier, which must not unregulate a re-proposal.
    riskTier: contextGraph.riskTier, priorRiskTier: highestTier([priorRiskTierOf(ctx.workspace, agentId), priorTierOf(spec)]), contextGraph };
  const { build: _build, ...carried } = spec;
  const next = { ...carried, answers, schema: ASPIRE_SPEC_SCHEMA, answersDigest: answersDigestOf(answers), brief, misuse,
    graph: typedGraphOf(agentId, agentName, values, ctx.now), hypotheses, alternatives: alternativesOf(ctx, spec, values), learningPlan, quality,
    valueContractDraft: valueContractTemplate({ scopeType: "AGENT", scopeId: agentId, type: "other" }), outcomeContractDraft: { metrics: outcomeMetricsOf(quality) }, edited: [...edited].sort(),
    claim: { claimKind: "self_reported", result: "not_evaluated", claimBoundary: ASPIRE_CLAIM_BOUNDARY } };
  return { outputs: [{ output: "brief", label: "aspire propose: the brief (AMC's draft from your answers)", lane: "recommendation", method: null,
    body: { brief, misuse, hypotheses, quality } }], spec: next };
}

/**
 * Build (after the direction gate is consumed): the context graph through validateContextGraph and initWorkspace's writer,
 * scaffoldAgent for an agent with none of its files, else the signed config re-saved (a placeholder one when it has none)
 * and its own target profile re-signed with the new contextGraphHash and its verified mapping; the outcome contract when
 * there is none; the typed multi-agent graph (writeTypedMultiAgentGraph, which also replaces the fleet's latest.json);
 * then the Enforce manifest so the agent is ACTIVE. It signs what `agent add`, `target set` and `snapshot`
 * sign, so it takes their owner-mode gates, and the router admits only owners (src/api/accessPolicy.ts A4_OWNER). Every
 * check that can refuse runs before the first write. Each write is an implementation ref with its file's sha256; the
 * revision names what was written. A manifest Enforce refuses is recorded by its code (manifest_active BLOCKED), never
 * thrown after the other writes.
 * The router refuses Build (409 RESOURCE_DRIFTED) before it runs when a resource the approved revision bound has moved.
 * ponytail: the router refuses a stale head before Build runs, but the files are still written before the transaction
 * that records them; a head that moves in between leaves them written, and Build run again is then refused as drifted,
 * so the brief is proposed and approved again.
 */
function build(ctx: A4ProducerContext): A4ProducerResult {
  const { workspace } = ctx;
  for (const command of ["agent add", "target set", "snapshot"]) assertOwnerMode(workspace, command);
  const { spec, answers } = aspireSpecOf(ctx.state);
  if (spec.schema !== ASPIRE_SPEC_SCHEMA || spec.answersDigest !== answersDigestOf(answers)) {
    throw fail(409, "A4_NOT_READY", "Build writes the proposed brief; propose it again first.", { reasonCodes: ["BRIEF_STALE"] });
  }
  const brief = spec.brief as { agentName: string; agent: string; goals: string[]; audience: string[]; stations: string[]; contextGraph: unknown };
  const agentId = ctx.state.project.agent_id;
  const paths = getAgentPaths(workspace, agentId);
  const graph = validateContextGraph(brief.contextGraph);
  const role = brief.agent.includes(":") ? brief.agent.slice(brief.agent.indexOf(":") + 1).trim() || "assistant" : "assistant";
  const fields = { agentName: brief.agentName, role, domain: brief.stations[0] ?? "general", primaryTasks: brief.goals, stakeholders: brief.audience, riskTier: graph.riskTier };
  const typedGraph = typedMultiAgentGraphSchema.safeParse(spec.graph);
  if (!typedGraph.success) throw fail(409, "A4_NOT_READY", "The proposed solution sketch is not a typed multi-agent graph; propose again.", { reasonCodes: ["TYPED_GRAPH_INVALID"] });
  // Refusals first: the signing key (423 while the vault is locked), the agent's own signed files, the config to sign.
  getPrivateKeyPem(workspace, "auditor");
  const prior = priorAgent(workspace, agentId);
  let config: AgentConfig;
  try {
    // No provider key: a local placeholder upstream; Assemble chooses the provider.
    config = prior.config === null
      ? buildAgentConfig({ agentId, ...fields, templateId: "local_openai", baseUrl: "http://127.0.0.1:8000", routePrefix: "/local", auth: { type: "none" } })
      : agentConfigSchema.parse({ ...prior.config, ...fields, updatedTs: ctx.now });
  } catch (error) {
    throw fail(409, "A4_NOT_READY", `The brief does not make a valid agent config: ${error instanceof Error ? error.message.slice(0, 300) : "invalid"}`,
      { reasonCodes: ["AGENT_CONFIG_INVALID"] });
  }
  ensureDir(paths.rootDir);
  writeFileAtomic(paths.contextGraph, JSON.stringify(graph, null, 2), 0o644);
  const contextGraphHash = sha256Hex(canonicalize(graph));
  let targetPath: string;
  if (!prior.exists) {
    targetPath = scaffoldAgent(workspace, config).targetPath;
  } else {
    saveAgentConfig(workspace, config);
    targetPath = saveTargetProfile(workspace, createSignedTargetProfile({ workspace, name: "default", contextGraphHash, mapping: prior.mapping ?? defaultTargetMapping(3) }), agentId);
  }
  const outcomePath = outcomeContractPath(workspace, agentId);
  const outcomeKept = pathExists(outcomePath);
  if (!outcomeKept) {
    initOutcomeContract(workspace, agentId);
    mergeOutcomeMetrics(workspace, agentId, outcomeMetricsOf(spec.quality));
  }
  const graphWritten = writeTypedMultiAgentGraph({ workspace, graph: typedGraph.data });
  let manifest: { manifestId: string; path: string } | { error: string };
  try {
    const written = writeEnforceResourceManifest({ workspace, agentId });
    // The writer publishes a manifest it could not sign (its signing errors are swallowed); Enforce's loader refuses it.
    manifest = written.manifestSigPath === null || written.snapshotSigPath === null ? { error: "MANIFEST_UNSIGNED" }
      : { manifestId: written.manifest.manifestId, path: written.manifestPath };
  } catch (error) {
    // Only a code is recorded (members and viewers read it); an error's message may carry absolute workspace paths.
    manifest = { error: errorCodeOf(error, "ENFORCE_MANIFEST_REFUSED") };
  }
  const files = ([["context-graph", paths.contextGraph, "written"], ["agent-config", paths.agentConfig, "written"], ["target-profile", targetPath, "written"],
    ["outcome-contract", outcomePath, outcomeKept ? "kept" : "written"], ["typed-graph", graphWritten.graphPath, "written"], ...("path" in manifest ? [["enforce-manifest", manifest.path, "written"] as const] : [])] as const)
    .map(([writer, path, action]) => ({ writer, path: relPath(workspace, path), action, sha256: fileSha(path, `the ${writer} Build ${action}`) }));
  return {
    outputs: files.map((file) => ({ output: "build", lane: "implementation" as const, method: null, body: file,
      label: `aspire build: ${file.writer} ${file.action === "kept" ? "kept (not written by Build)" : "written"} (${file.path})` })),
    spec: { ...spec, build: { files, agentCreated: !prior.exists, verifiedBefore: prior.checked, contextGraphHash, outcomeContract: outcomeKept ? "kept" : "initialised",
      typedGraphDigest: graphWritten.ref.digestSha256, ...("manifestId" in manifest ? { manifestId: manifest.manifestId } : { manifestError: manifest.error }),
      provider: prior.config === null ? "local_openai placeholder, no key (Assemble chooses the provider)" : "kept" } }
  };
}

/**
 * Review: the written context graph validates and matches the build, and equals the contextGraphHash of the agent's own
 * target profile, whose signature verifies; the agent config's signature under this workspace's keys (an integrity
 * check, recorded on the STEP, never a ref); the doctor's failing and warning checks with their first-run fixes; brief
 * completeness. Nothing at Aspire is observed: `reviewed` carries the explicit not_evaluated output with its reason.
 */
async function review(ctx: A4ProducerContext): Promise<A4ProducerResult> {
  const { workspace } = ctx;
  const { spec } = aspireSpecOf(ctx.state);
  const built = spec.build as { contextGraphHash?: unknown } | undefined;
  if (built === undefined) throw fail(409, "A4_NOT_READY", "Nothing was built at this revision.", { reasonCodes: ["PRODUCED_AT_BUILD"] });
  const agentId = ctx.state.project.agent_id;
  const paths = getAgentPaths(workspace, agentId);
  let hash: string | null = null;
  let error: string | null = null;
  try {
    hash = sha256Hex(canonicalize(validateContextGraph(JSON.parse(readFileSync(paths.contextGraph, "utf8")) as unknown)));
  } catch (caught) {
    // A code only: the message names the absolute path (members and viewers read this output).
    error = caught instanceof SyntaxError ? "NOT_JSON" : errorCodeOf(caught, "INVALID");
  }
  // The agent's own profile only (never loadTargetProfile's root fallback), and only once its signature verifies.
  let targetProfile: "verified" | "TARGET_PROFILE_ABSENT" | "TARGET_PROFILE_INVALID" | "TARGET_PROFILE_UNTRUSTED";
  let targetHash: string | null = null;
  try {
    const profile = loadTargetProfileFromFile(join(paths.targetsDir, "default.target.json"));
    let valid = false;
    try {
      valid = verifyTargetProfileSignature(workspace, profile);
    } catch {
      valid = false;
    }
    targetProfile = valid ? "verified" : "TARGET_PROFILE_UNTRUSTED";
    targetHash = valid ? profile.contextGraphHash : null;
  } catch (caught) {
    targetProfile = (caught as NodeJS.ErrnoException).code === "ENOENT" ? "TARGET_PROFILE_ABSENT" : "TARGET_PROFILE_INVALID";
  }
  const contextGraph = { valid: hash !== null, matchesBuild: hash !== null && hash === built.contextGraphHash, targetMatches: hash !== null && hash === targetHash,
    targetProfile, error };
  const signature = verifyAgentConfigSignature(workspace, agentId);
  const { runDoctorRules } = await import("../../doctor/doctorRules.js");
  const { firstRunFixCommands } = await import("../../doctor/firstRunPlan.js");
  const report = await runDoctorRules(workspace);
  const doctor = { ok: report.ok, attention: report.checks.filter((check) => check.status === "FAIL" || check.status === "WARN")
    .map(({ id, status, message }) => ({ id, status, message })), fixes: firstRunFixCommands(report) };
  const quality = a4QualitySpecSchema.safeParse(spec.quality);
  const completeness = { qualityTargets: quality.success ? quality.data.targets.length : 0,
    unmeasured: quality.success ? unmeasuredTargets(quality.data).map((target) => target.statement) : [],
    misuseRows: misuseSchema.safeParse(spec.misuse).success ? (spec.misuse as unknown[]).length : 0,
    hypothesesNotObserved: Array.isArray(spec.hypotheses) ? spec.hypotheses.length : 0 };
  return {
    outputs: [
      { output: "review", label: "aspire review: context graph validates and matches the build and the signed target profile", lane: "implementation", method: null, body: contextGraph },
      { output: "review", label: "aspire review: doctor checks needing attention, with first-run fixes", lane: "implementation", method: null, body: doctor },
      { output: "review", label: "aspire review: brief completeness", lane: "recommendation", method: null, body: completeness }
    ],
    notEvaluated: [NOT_OBSERVED],
    record: { checks: { contextGraph: { valid: contextGraph.valid, matchesBuild: contextGraph.matchesBuild, targetMatches: contextGraph.targetMatches,
      targetProfile }, doctorOk: doctor.ok },
      integrity: { agentConfigSignature: { valid: signature.valid, signatureExists: signature.signatureExists, reason: signature.reason, mode: "workspace-key-consistency" } } }
  };
}
