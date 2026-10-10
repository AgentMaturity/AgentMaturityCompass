/**
 * Aspire, conceptualization (P1-59; design §10.1). Understand runs the detectors and reflects the answers; Explain renders
 * the same facts at three levels; Propose builds the brief from the answers (a context graph, a misuse section, a typed
 * graph sketch, PMF hypotheses that stay `proposed`, ≥ 2 alternatives, a learning plan, a quality specification, a value
 * contract draft); Build writes them through the fleet's own writers and freezes the revision naming what was written;
 * Review checks it. Everything is self_reported and runs offline with no provider key; no output names a maturity level.
 * Hypotheses live only in the revision spec, never in the decision-receipt files a full score run marks observed.
 */
import { readFileSync } from "node:fs";
import { relative, sep } from "node:path";
import { listArchetypes, previewArchetypeApply } from "../../archetypes/index.js";
import { validateContextGraph, type ContextGraph } from "../../context/contextGraph.js";
import { a4QualitySpecSchema, type A4QualitySpec } from "../../contracts/v1/a4Package.js";
import { writeEnforceResourceManifest } from "../../enforce/resourceManifest.js";
import { getAgentPaths } from "../../fleet/paths.js";
import { agentConfigSchema, buildAgentConfig, loadAgentConfig, saveAgentConfig, scaffoldAgent, verifyAgentConfigSignature } from "../../fleet/registry.js";
import { typedMultiAgentGraphSchema } from "../../fleet/typedGraph.js";
import { initOutcomeContract, outcomeContractPath } from "../../outcomes/outcomeContractEngine.js";
import { createSignedTargetProfile, defaultTargetMapping, loadTargetProfile, saveTargetProfile } from "../../targets/targetProfile.js";
import { ensureDir, pathExists, writeFileAtomic } from "../../utils/fs.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import { valueContractTemplate } from "../../value/valueContracts.js";
import { explain, type A4ExplainFact, type A4ExplainLevel } from "../a4Explain.js";
import { RESOURCE_SLOTS } from "../a4Gates.js";
import type { A4ReadinessState } from "../a4Readiness.js";
import type { A4ProducerContext, A4ProducerResult } from "../a4RouterStages.js";
import { a4HypothesisSchema, mapRiskTier, type A4Answer, type A4StageRegistry } from "../a4Schema.js";
import { A4StoreError } from "../a4Store.js";
import { understandAspire } from "../aspireUnderstand.js";
import {
  ASPIRE_CLAIM_BOUNDARY, ASPIRE_SPEC_SCHEMA, QUESTIONS, answerGaps, answerValues, answersDigestOf, aspireItems, aspireSpecOf, dependencyDigest,
  learningPlanSchema, listValue, misuseSchema, textValue
} from "../spec/aspire.js";

const DAY_MS = 86_400_000;
const HYPOTHESIS_WINDOW_DAYS = 90;
const NOT_OBSERVED = "NO_RUNTIME_OBSERVATION_AT_ASPIRE";
/** The parts of a proposal a member may write; every other part is built from the answers. */
const EDITABLE = ["hypotheses", "learningPlan", "quality", "misuse"] as const;
type Editable = (typeof EDITABLE)[number];

const fail = (status: number, code: string, message: string, detail?: unknown): A4StoreError => new A4StoreError(status, code, message, detail);
const relPath = (workspace: string, path: string): string => relative(workspace, path).split(sep).join("/");
/** A file's sha256; null only when it is absent (the RESOURCE_SLOTS contract: any other read error throws). */
function fileSha(path: string): string | null {
  try {
    return sha256Hex(readFileSync(path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
/** sha256Hex(canonicalize(graph)): the contextGraphHash scaffoldAgent and initWorkspace sign into the target profile. */
function contextGraphSha256(workspace: string, agentId: string): string | null {
  const path = getAgentPaths(workspace, agentId).contextGraph;
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  return sha256Hex(canonicalize(JSON.parse(raw) as unknown));
}

/** Readiness items and the two brief slots a gate binds and every decide, complete and executor preamble recomputes. */
export function register(registry: A4StageRegistry): void {
  registry.items.push(aspireItems);
  RESOURCE_SLOTS["brief.contextGraphSha256"] = contextGraphSha256;
  RESOURCE_SLOTS["brief.agentConfigSha256"] = (workspace, agentId) => fileSha(getAgentPaths(workspace, agentId).agentConfig);
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
        : regulated ? `You chose ${tier} risk, so AMC asks two different people to approve each step.` : `You chose ${tier} risk. One approver is enough; if you are the only user, you may approve your own steps and AMC labels them self-approved.`,
      practitioner: `riskTier "${tier ?? "unstated"}" is written to context-graph.json and sent as the gate request's riskTier (${tier === null ? "high" : mapRiskTier(tier as "low")}); high or critical makes the project regulated.`,
      expert: `isRegulated(state, floor): riskTierOf(brief) ∉ {low, med, medium} → requireDistinctUsers on every gate and deriveSelfApprovalAllowed() → false.` },
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
        previewReason = "AGENT_HAS_NO_CONTEXT_GRAPH";
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

/** A member's edit of one editable part, validated; null when the proposal does not change it. */
function editOf(key: Editable, input: Record<string, unknown> | undefined, previous: Record<string, unknown>): unknown {
  if (input === undefined || !Object.hasOwn(input, key) || canonicalize(input[key] ?? null) === canonicalize(previous[key] ?? null)) return null;
  const value = input[key];
  const parsed = key === "hypotheses" ? a4HypothesisSchema.array().min(1).safeParse(value) : key === "learningPlan" ? learningPlanSchema.safeParse(value)
    : key === "quality" ? a4QualitySpecSchema.safeParse(value) : misuseSchema.safeParse(value);
  if (!parsed.success) throw fail(400, "INPUT_INVALID", `${key}: ${parsed.error.issues[0]?.message ?? "invalid"}`);
  if (key === "hypotheses" && (parsed.data as Array<{ status: string; verdict: unknown }>).some((entry) => entry.status !== "proposed" || entry.verdict !== null)) {
    throw fail(400, "INPUT_INVALID", "A hypothesis is proposed with no verdict; only …/hypotheses/:id/observe moves it.");
  }
  return parsed.data;
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
  const metrics = listValue(values.get("successMetrics"));
  const audience = listValue(values.get("audience"));
  const edited = new Set(Array.isArray(spec.edited) ? spec.edited.filter((key): key is string => typeof key === "string") : []);
  const pick = <T>(key: Editable, generated: () => T): T => {
    const edit = editOf(key, ctx.spec, spec);
    if (edit !== null) {
      edited.add(key);
      return edit as T;
    }
    return edited.has(key) ? spec[key] as T : generated();
  };
  const from = new Date(ctx.now).toISOString();
  const to = new Date(ctx.now + HYPOTHESIS_WINDOW_DAYS * DAY_MS).toISOString();
  const hypotheses = pick("hypotheses", () => metrics.slice(0, 5).map((metric, index) => ({ id: `h${index + 1}`,
    statement: `Deploying ${agentName} for ${audience.join(", ")} improves: ${metric}`, predictedOutcome: metric, window: { from, to },
    evidenceSource: { eventType: "audit", metric: slug(metric) }, verdict: null, status: "proposed" as const })));
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
    stations: listValue(values.get("stations")), governance: textValue(values.get("governance")), riskTier: contextGraph.riskTier, contextGraph };
  const { build: _build, ...carried } = spec;
  const next = { ...carried, answers, schema: ASPIRE_SPEC_SCHEMA, answersDigest: answersDigestOf(answers), brief, misuse,
    graph: typedGraphOf(agentId, agentName, values, ctx.now), hypotheses, alternatives: alternativesOf(ctx, spec, values), learningPlan, quality,
    valueContractDraft: valueContractTemplate({ scopeType: "AGENT", scopeId: agentId, type: "other" }), edited: [...edited].sort(),
    claim: { claimKind: "self_reported", result: "not_evaluated", claimBoundary: ASPIRE_CLAIM_BOUNDARY } };
  return { outputs: [{ output: "brief", label: "aspire propose: the brief (AMC's draft from your answers)", lane: "recommendation", method: null,
    body: { brief, misuse, hypotheses, quality } }], spec: next };
}

/**
 * Build (after the direction gate is consumed): the context graph through validateContextGraph and initWorkspace's writer,
 * scaffoldAgent for a new agent or the signed config re-saved for an existing one (the default target profile re-signed
 * with the new contextGraphHash), the outcome contract when there is none, then the Enforce manifest so the agent is
 * ACTIVE. Each write is an implementation ref with its file's sha256; the revision names what was written. A manifest
 * Enforce refuses is recorded with its code (manifest_active BLOCKED), never thrown after the other writes.
 * The typed graph stays a draft in the spec: Enforce's manifest digests `typed-graphs/latest.json` canonically and checks
 * its staged copy by raw bytes, so once that file exists no manifest can be written in the workspace; Assemble writes the
 * graph (P1-60) once that is fixed.
 * ponytail: the files are written before the transaction that records them; a request refused there (a moved head)
 * leaves them written, and Build run again rewrites the same brief.
 */
function build(ctx: A4ProducerContext): A4ProducerResult {
  const { workspace } = ctx;
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
  ensureDir(paths.rootDir);
  writeFileAtomic(paths.contextGraph, JSON.stringify(graph, null, 2), 0o644);
  const contextGraphHash = sha256Hex(canonicalize(graph));
  const created = !pathExists(paths.agentConfig);
  let targetPath: string;
  if (created) {
    // No provider key: a local placeholder upstream; Assemble chooses the provider.
    targetPath = scaffoldAgent(workspace, buildAgentConfig({ agentId, ...fields, templateId: "local_openai", baseUrl: "http://127.0.0.1:8000", routePrefix: "/local",
      auth: { type: "none" } })).targetPath;
  } else {
    saveAgentConfig(workspace, agentConfigSchema.parse({ ...loadAgentConfig(workspace, agentId), ...fields, updatedTs: Date.now() }));
    let mapping: Record<string, number>;
    try {
      mapping = loadTargetProfile(workspace, "default", agentId).mapping;
    } catch {
      mapping = defaultTargetMapping(3);
    }
    targetPath = saveTargetProfile(workspace, createSignedTargetProfile({ workspace, name: "default", contextGraphHash, mapping }), agentId);
  }
  const outcomePath = outcomeContractPath(workspace, agentId);
  const outcomeKept = pathExists(outcomePath);
  if (!outcomeKept) initOutcomeContract(workspace, agentId);
  let manifest: { manifestId: string; path: string } | { error: string };
  try {
    const written = writeEnforceResourceManifest({ workspace, agentId });
    manifest = { manifestId: written.manifest.manifestId, path: written.manifestPath };
  } catch (error) {
    manifest = { error: (error as { code?: unknown }).code === undefined ? String(error).slice(0, 200) : String((error as { code: unknown }).code) };
  }
  const files = ([["context-graph", paths.contextGraph], ["agent-config", paths.agentConfig], ["target-profile", targetPath], ["outcome-contract", outcomePath],
    ...("path" in manifest ? [["enforce-manifest", manifest.path] as const] : [])] as const)
    .map(([writer, path]) => ({ writer, path: relPath(workspace, path), sha256: fileSha(path) }));
  return {
    outputs: files.map((file) => ({ output: "build", label: `aspire build: ${file.writer} written (${file.path})`, lane: "implementation" as const, method: null, body: file })),
    spec: { ...spec, build: { files, agentCreated: created, contextGraphHash, outcomeContract: outcomeKept ? "kept" : "initialised",
      typedGraph: "draft in this spec; not written (Enforce manifest digest mismatch)", ...("manifestId" in manifest ? { manifestId: manifest.manifestId } : { manifestError: manifest.error }),
      provider: created ? "local_openai placeholder, no key (Assemble chooses the provider)" : "kept" } }
  };
}

/**
 * Review: the written context graph validates and matches the build and the signed target profile; the agent config's
 * signature under this workspace's keys (an integrity check, recorded on the STEP, never a ref); the doctor's failing and
 * warning checks with their first-run fixes; brief completeness. Nothing at Aspire is observed: `reviewed` carries the
 * explicit not_evaluated output with its reason.
 */
async function review(ctx: A4ProducerContext): Promise<A4ProducerResult> {
  const { workspace } = ctx;
  const { spec } = aspireSpecOf(ctx.state);
  const built = spec.build as { contextGraphHash?: unknown } | undefined;
  if (built === undefined) throw fail(409, "A4_NOT_READY", "Nothing was built at this revision.", { reasonCodes: ["PRODUCED_AT_BUILD"] });
  const agentId = ctx.state.project.agent_id;
  let contextGraph: { valid: boolean; matchesBuild: boolean; targetMatches: boolean; error: string | null };
  try {
    const hash = sha256Hex(canonicalize(validateContextGraph(JSON.parse(readFileSync(getAgentPaths(workspace, agentId).contextGraph, "utf8")) as unknown)));
    let target: string | null = null;
    try {
      target = loadTargetProfile(workspace, "default", agentId).contextGraphHash;
    } catch {
      target = null;
    }
    contextGraph = { valid: true, matchesBuild: hash === built.contextGraphHash, targetMatches: hash === target, error: null };
  } catch (error) {
    contextGraph = { valid: false, matchesBuild: false, targetMatches: false, error: error instanceof Error ? error.message.slice(0, 300) : String(error) };
  }
  const signature = verifyAgentConfigSignature(workspace, agentId);
  const { runDoctorRules } = await import("../../doctor/doctorRules.js");
  const { firstRunFixCommands } = await import("../../doctor/firstRunPlan.js");
  const report = await runDoctorRules(workspace);
  const doctor = { ok: report.ok, attention: report.checks.filter((check) => check.status === "FAIL" || check.status === "WARN")
    .map(({ id, status, message }) => ({ id, status, message })), fixes: firstRunFixCommands(report) };
  const quality = a4QualitySpecSchema.safeParse(spec.quality);
  const completeness = { qualityTargets: quality.success ? quality.data.targets.length : 0,
    unmeasured: quality.success ? quality.data.targets.filter((target) => target.evidenceSource === null && target.measure !== "not instrumented").map((target) => target.statement) : [],
    misuseRows: misuseSchema.safeParse(spec.misuse).success ? (spec.misuse as unknown[]).length : 0,
    hypothesesNotObserved: Array.isArray(spec.hypotheses) ? spec.hypotheses.length : 0 };
  return {
    outputs: [
      { output: "review", label: "aspire review: context graph validates and matches the build and the target profile", lane: "implementation", method: null, body: contextGraph },
      { output: "review", label: "aspire review: doctor checks needing attention, with first-run fixes", lane: "implementation", method: null, body: doctor },
      { output: "review", label: "aspire review: brief completeness", lane: "recommendation", method: null, body: completeness }
    ],
    notEvaluated: [NOT_OBSERVED],
    record: { checks: { contextGraph: { valid: contextGraph.valid, matchesBuild: contextGraph.matchesBuild, targetMatches: contextGraph.targetMatches }, doctorOk: doctor.ok },
      integrity: { agentConfigSignature: { valid: signature.valid, signatureExists: signature.signatureExists, reason: signature.reason, mode: "workspace-key-consistency" } } }
  };
}
