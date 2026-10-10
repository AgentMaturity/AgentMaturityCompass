/**
 * Aspire's question bank, producers and readiness items (P1-59; design §9.2, §10.1). Questions are data: an answer is
 * re-asked when it is missing or when its `dependencyDigest` (sha256 over the canonical answers of `dependsOn`, as the
 * answers route records it) no longer matches, so changing `markets` re-asks only `stations` and `governance`. The
 * producers live in src/a4/stages/aspire.ts and are loaded on first use. The item builders are pure: they read the
 * newest Aspire revision and the chain, never a file, and nothing here computes a maturity level.
 */
import { z } from "zod";
import { validateContextGraph } from "../../context/contextGraph.js";
import { a4QualitySpecSchema, type A4QualitySpec } from "../../contracts/v1/a4Package.js";
import { A4_STEPS } from "../../contracts/v1/a4Project.js";
import { parseStation, STATIONS } from "../../domains/stations.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import type { A4ReadinessItem, A4ReadinessQuery, A4ReadinessState } from "../a4Readiness.js";
import type { A4Producer } from "../a4RouterStages.js";
import { a4AnswerSchema, a4HypothesisSchema, type A4Answer, type A4Hypothesis, type A4Question, type A4Step } from "../a4Schema.js";

const question = (id: string, prompt: string, kind: A4Question["kind"], required: boolean, dependsOn: string[] = []): A4Question =>
  ({ id, stage: "aspire", prompt, dependsOn, required, kind });

/** The Aspire question bank (design §10.1 Ask). */
export const QUESTIONS: A4Question[] = [
  question("agent", "What should the agent be called, and what is its job? (name: job)", "text", true),
  question("problem", "What problem should it solve?", "text", true),
  question("audience", "Who will use it or be affected by it? One per line.", "list", true),
  question("currentWorkflow", "How is this work done today?", "text", false),
  question("expertise", "How much detail do you want in explanations: novice, practitioner or expert?", "choice", true),
  question("goals", "What should it achieve? One per line.", "list", true),
  question("successMetrics", "How will you know it works? One measurable signal per line.", "list", true),
  question("constraints", "What constraints must it respect? One per line.", "list", true),
  question("forbiddenActions", "What must it never do? One per line.", "list", true),
  question("riskTier", "Risk appetite: low, med, high or critical?", "choice", true),
  question("markets", "Which markets (jurisdictions) first? One per line; leave empty when unknown.", "list", false),
  question("stations", "Which stations does it touch: education, environment, health, wealth, technology, mobility or governance?", "list", true, ["markets"]),
  question("governance", "Governance: regulated (no self-approval: someone other than a gate's requester, author and builder approves it; takes a high or critical risk tier) or standard?",
    "choice", true, ["riskTier", "markets"]),
  question("archetypeInterest", "Start from an archetype? Name its id, or leave empty.", "choice", false)
];

/** The values a choice question takes (archetypeInterest takes a listed archetype id). `riskTier` keeps the context-graph spelling. */
export const CHOICES: Readonly<Record<string, readonly string[]>> = {
  expertise: ["novice", "practitioner", "expert"], riskTier: ["low", "med", "high", "critical"], governance: ["regulated", "standard"]
};

/** What a valid answer is, for each question answerGaps checks beyond being answered (the reflection quotes it). */
export const ANSWER_RULES: Readonly<Record<string, string>> = {
  expertise: "one of novice, practitioner, expert", riskTier: "one of low, med, high, critical",
  governance: "regulated or standard; regulated takes a high or critical risk tier, the tiers that make every gate regulated",
  stations: `each one of ${STATIONS.join(", ")}`
};
const isStation = (value: string): boolean => {
  try {
    parseStation(value);
    return true;
  } catch {
    return false;
  }
};

/** Where Understand pre-fills an unanswered question from (recorded `source: "inferred"`; the member confirms or changes it). */
export const PREFILL_SOURCES: Readonly<Record<string, string>> = {
  agent: "the existing agent config (agentName, role)", problem: "the existing context-graph.json mission",
  successMetrics: "the existing context-graph.json", constraints: "the existing context-graph.json", forbiddenActions: "the existing context-graph.json",
  riskTier: "the existing context-graph.json or agent config", stations: "the agent config domain (parseStation)",
  expertise: "the project's creation profile", archetypeInterest: "the project's creation profile",
  governance: "the risk tier (regulated when high or critical)"
};

const load = () => import("../stages/aspire.js");
/** Aspire's producers; the router records their outputs instead of the no-producer path (src/a4/a4RouterStages.ts). */
export const PRODUCERS: readonly A4Producer[] = (["understand", "explain", "propose", "build", "review"] as const)
  .map((step) => ({ id: `aspire.${step}`, step, run: async (ctx) => (await load()).produceAspire(step, ctx) }));

export const ASPIRE_SPEC_SCHEMA = "amc.a4-aspire-spec/v1";
export const ASPIRE_CLAIM_BOUNDARY = "A brief is a statement of intent; no outcome is claimed.";

/** A list answer: an array of strings, or text with one entry per line. */
export function listValue(value: unknown): string[] {
  const items = Array.isArray(value) ? value : typeof value === "string" ? value.split("\n") : [];
  return items.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}
export const textValue = (value: unknown): string | null => (typeof value === "string" && value.trim().length > 0 ? value.trim() : null);
const answered = (value: unknown): boolean => listValue(value).length > 0;

/** The stage's answers by question id. */
export const answerValues = (answers: readonly A4Answer[]): Map<string, unknown> => new Map(answers.map((answer) => [answer.questionId, answer.value]));
/** The digest the answers route records for `question` (src/a4/a4RouterStages.ts): its dependencies' answers, canonical. */
export function dependencyDigest(dependsOn: readonly string[], values: ReadonlyMap<string, unknown>): string {
  return sha256Hex(canonicalize(dependsOn.map((id) => [id, values.get(id) ?? null])));
}
/** What the brief was built from: every answer's value, by id; a confirmation that keeps a value keeps the brief. */
export const answersDigestOf = (answers: readonly A4Answer[]): string =>
  sha256Hex(canonicalize([...answers].sort((a, b) => a.questionId.localeCompare(b.questionId)).map((answer) => [answer.questionId, answer.value ?? null])));

/** Required questions with no answer, and answered ones whose dependencies changed since (to be asked again). */
export function answerGaps(answers: readonly A4Answer[]): { missing: string[]; stale: string[]; invalid: string[] } {
  const values = answerValues(answers);
  const byId = new Map(answers.map((answer) => [answer.questionId, answer]));
  const missing = QUESTIONS.filter((entry) => entry.required && !answered(values.get(entry.id))).map((entry) => entry.id);
  const stale = QUESTIONS.filter((entry) => byId.has(entry.id) && entry.dependsOn.length > 0
    && byId.get(entry.id)!.dependencyDigest !== dependencyDigest(entry.dependsOn, values)).map((entry) => entry.id);
  const invalid = Object.entries(CHOICES).filter(([id, allowed]) => textValue(values.get(id)) !== null && !allowed.includes(textValue(values.get(id))!))
    .map(([id]) => id);
  // "regulated" promises regulated gates (no self-approval); isRegulated (src/a4/a4Readiness.ts) gives that only for a high or critical tier.
  const tier = textValue(values.get("riskTier"));
  if (!invalid.includes("governance") && textValue(values.get("governance")) === "regulated" && (tier === "low" || tier === "med")) invalid.push("governance");
  // Build writes the first station into the agent config's domain.
  if (listValue(values.get("stations")).some((value) => !isStation(value))) invalid.push("stations");
  return { missing, stale, invalid };
}

/** The newest Aspire revision's spec and answers (the stage's record). */
export function aspireSpecOf(state: Pick<A4ReadinessState, "revisions">): { spec: Record<string, unknown>; answers: A4Answer[]; revisionNo: number | null } {
  const revision = state.revisions.filter((row) => row.stage === "aspire").at(-1);
  const spec = revision ? JSON.parse(revision.spec_json) as Record<string, unknown> : {};
  const answers = Array.isArray(spec.answers) ? spec.answers.flatMap((answer) => {
    const parsed = a4AnswerSchema.safeParse(answer);
    return parsed.success ? [parsed.data] : [];
  }) : [];
  return { spec, answers, revisionNo: revision?.revision_no ?? null };
}

/** Quality targets with neither an evidence source (blank counts as none) nor `measure: "not instrumented"`. */
export const unmeasuredTargets = (quality: A4QualitySpec): A4QualitySpec["targets"] =>
  quality.targets.filter((target) => (target.evidenceSource ?? "").trim() === "" && target.measure !== "not instrumented");

/**
 * What an observation binds (the observe route records it on the ref): the hypothesis's content, so an id that names
 * another statement, window or evidence source after a new proposal is not observed by an older ref.
 */
export const hypothesisDigestOf = (hypothesis: Pick<A4Hypothesis, "id" | "statement" | "predictedOutcome" | "window" | "evidenceSource">): string =>
  sha256Hex(canonicalize({ id: hypothesis.id, statement: hypothesis.statement, predictedOutcome: hypothesis.predictedOutcome, window: hypothesis.window,
    evidenceSource: hypothesis.evidenceSource }));

/** The hypotheses a spec carries, each as the schema reads it (a row that does not parse is left out). */
export const previousHypotheses = (spec: Record<string, unknown>): A4Hypothesis[] =>
  (Array.isArray(spec.hypotheses) ? spec.hypotheses : []).flatMap((entry) => {
    const parsed = a4HypothesisSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
/** A hypothesis id the observe route takes (src/a4/a4RouterStages.ts, POST …/hypotheses/:id/observe). */
export const HYPOTHESIS_ID = /^[A-Za-z0-9_.-]{1,128}$/;

export const misuseSchema = z.array(z.strictObject({ failureMode: z.string().trim().min(1), mitigation: z.string().trim().min(1), source: z.string().min(1) })).min(1);
export const learningPlanSchema = z.array(z.strictObject({
  milestoneId: z.string().min(1), title: z.string().min(1), acceptanceCriteria: z.array(z.string().min(1)).min(1), evidenceSource: z.string().nullable(),
  dependsOn: z.array(z.string()), status: z.literal("planned")
})).min(1);

type Fields = Partial<Omit<A4ReadinessItem, "id" | "status">>;
const item = (id: string, status: A4ReadinessItem["status"], fields: Fields = {}): A4ReadinessItem => ({
  id, status, kind: null, reasonCodes: [], section: "recommendation", evidence: [], claim: null, report: null, acknowledged: null,
  nextAction: null, mandatory: true, bound: false, ...fields
} as A4ReadinessItem);
const waiting = (id: string, codes: string[], fields: Fields = {}): A4ReadinessItem =>
  item(id, "WAITING", { kind: "evidence_missing", reasonCodes: codes, ...fields });

/** Whether the project has reached `step` at Aspire (any later stage counts). */
function reached(state: A4ReadinessState, step: A4Step): boolean {
  if (state.project.stage !== "aspire") return true;
  return A4_STEPS.indexOf(state.project.step) >= A4_STEPS.indexOf(step);
}

/** The proposal items (design §10.1 Readiness): each reads the brief Propose recorded, and only while its answers still stand. */
function proposalItems(spec: Record<string, unknown>, answers: readonly A4Answer[]): A4ReadinessItem[] {
  const ids = ["alternatives_present", "hypotheses_present", "learning_plan_present", "quality_spec_complete", "risk_section_present", "brief_valid"];
  if (spec.schema !== ASPIRE_SPEC_SCHEMA) return ids.map((id) => waiting(id, ["NOT_PROPOSED"], { nextAction: { label: "Propose the brief" } }));
  if (spec.answersDigest !== answersDigestOf(answers)) return ids.map((id) => waiting(id, ["BRIEF_STALE"], { nextAction: { label: "Answers changed: propose again" } }));
  const brief = (spec.brief ?? {}) as Record<string, unknown>;
  const quality = a4QualitySpecSchema.safeParse(spec.quality);
  const unmeasured = quality.success ? unmeasuredTargets(quality.data) : [];
  const hypotheses = Array.isArray(spec.hypotheses) ? spec.hypotheses : [];
  const check = (id: string, ok: boolean, code: string, section: "recommendation" | "implementation" = "recommendation"): A4ReadinessItem =>
    ok ? item(id, "READY", { section }) : waiting(id, [code], { section });
  let graphValid = true;
  try {
    validateContextGraph(brief.contextGraph);
  } catch {
    graphValid = false;
  }
  return [
    check("alternatives_present", Array.isArray(spec.alternatives) && spec.alternatives.length >= 2, "ALTERNATIVES_MISSING"),
    check("hypotheses_present", hypotheses.length > 0 && hypotheses.every((entry) => a4HypothesisSchema.safeParse(entry).success), "HYPOTHESES_MISSING"),
    check("learning_plan_present", learningPlanSchema.safeParse(spec.learningPlan).success, "LEARNING_PLAN_MISSING"),
    quality.success && unmeasured.length === 0 ? item("quality_spec_complete", "READY")
      : waiting("quality_spec_complete", ["QUALITY_TARGET_UNMEASURED", ...unmeasured.map((target) => target.dimension)],
        { nextAction: { label: "Give every quality target an evidence source, or mark its measure \"not instrumented\"" } }),
    check("risk_section_present", misuseSchema.safeParse(spec.misuse).success, "RISK_SECTION_MISSING"),
    check("brief_valid", graphValid, "CONTEXT_GRAPH_INVALID")
  ];
}

/**
 * Build's items: mandatory once the direction gate is consumed; before it they name the step that produces them. Review's
 * checks are read from its signed STEP on the built revision. `manifest_active` is BLOCKED while the head revision's
 * bound Enforce resources drifted (`enforce.resourcesSha256`, the live facts), as Enforce then reads DRIFTED.
 */
function buildItems(state: A4ReadinessState, spec: Record<string, unknown>, revisionNo: number | null, drifted: readonly string[] | null): A4ReadinessItem[] {
  const due = reached(state, "direction_approved");
  const build = (spec.build ?? null) as { files?: Array<{ writer?: unknown }>; manifestId?: unknown; manifestError?: unknown } | null;
  const review = [...state.chain].reverse().find((link) => link.kind === "STEP" && link.body.to === "reviewed" && link.revisionNo === revisionNo)?.body as
    { checks?: { contextGraph?: { valid?: unknown; matchesBuild?: unknown; targetMatches?: unknown; targetProfile?: unknown } };
      integrity?: { agentConfigSignature?: { valid?: unknown; reasonCode?: unknown } } } | undefined;
  const wrote = (writer: string): boolean => build?.files?.some((file) => file.writer === writer) === true;
  const pending = (id: string): A4ReadinessItem => waiting(id, ["PRODUCED_AT_BUILD"], { section: "implementation", mandatory: due });
  const signature = review?.integrity?.agentConfigSignature;
  // Review's graph checks: it validates, it is what Build wrote, and it is what the agent's verified target profile signs.
  const graph = review?.checks?.contextGraph;
  const graphProblems = graph === undefined ? [] : graph.valid !== true ? ["CONTEXT_GRAPH_INVALID"] : [
    ...(graph.matchesBuild === true ? [] : ["CONTEXT_GRAPH_MISMATCH"]),
    ...(graph.targetMatches === true ? [] : ["TARGET_PROFILE_MISMATCH", ...(typeof graph.targetProfile === "string" && graph.targetProfile !== "verified" ? [graph.targetProfile] : [])])];
  const items = [
    graphProblems.length > 0
      ? item("context_graph_written", "BLOCKED", { section: "implementation", kind: "evidence_contradictory", reasonCodes: graphProblems })
      : wrote("context-graph") ? item("context_graph_written", "READY", { section: "implementation" }) : pending("context_graph_written"),
    signature !== undefined && signature.valid !== true
      ? item("agent_config_signed", "BLOCKED", { section: "implementation", kind: "evidence_untrusted", reasonCodes: ["AGENT_CONFIG_SIGNATURE_INVALID"] })
      : wrote("agent-config") ? item("agent_config_signed", "READY", { section: "implementation" }) : pending("agent_config_signed"),
    typeof build?.manifestId === "string" && revisionNo === state.project.revision_no && drifted?.includes("enforce.resourcesSha256") === true
      ? item("manifest_active", "BLOCKED", { section: "implementation", kind: "scope_changed", reasonCodes: ["MANIFEST_DRIFTED", "RESOURCE_DRIFTED"] })
      : typeof build?.manifestId === "string" ? item("manifest_active", "READY", { section: "implementation" })
      : typeof build?.manifestError === "string" ? item("manifest_active", "BLOCKED", { section: "implementation", kind: "evidence_missing",
        reasonCodes: [...new Set(["ENFORCE_MANIFEST_REFUSED", build.manifestError])] }) : pending("manifest_active")
  ];
  // AMC's own signature check: integrity of bytes under the workspace's keys, never a lane, never a claim (design §7).
  if (signature !== undefined) {
    items.push(item("aspire.agent_config_signature", signature.valid === true ? "READY" : "BLOCKED", { section: "integrity",
      reasonCodes: signature.valid === true ? ["SELF_CHECK", "UNANCHORED"]
        // A closed code only (Review records one); anything else in a STEP body is never printed.
        : ["AGENT_CONFIG_SIGNATURE_INVALID", typeof signature.reasonCode === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(signature.reasonCode) ? signature.reasonCode : "SIGNATURE_INVALID"] }));
  }
  return items;
}

/**
 * One item per hypothesis, never mandatory and never a level: `proposed` until …/observe binds a runtime-written row (the
 * only way out) to this exact hypothesis (its id and content digest), `expired` past its window with none. It reads as
 * observed only while that ref still resolves in the observed lane; a dangling or downgraded ref is NOT_EVALUATED. The
 * observed value is the row's (Observed); the verdict is a person's statement (self-reported) and is printed as such.
 */
function hypothesisItems(state: A4ReadinessState, spec: Record<string, unknown>, now: number): A4ReadinessItem[] {
  return (Array.isArray(spec.hypotheses) ? spec.hypotheses : []).flatMap((entry) => {
    const parsed = a4HypothesisSchema.safeParse(entry);
    if (!parsed.success) return [];
    const hypothesis = parsed.data;
    const digest = hypothesisDigestOf(hypothesis);
    const link = state.chain.find((candidate) => candidate.kind === "EVIDENCE_REF" && candidate.body.hypothesisId === hypothesis.id
      && candidate.body.hypothesisDigest === digest);
    const id = `hypothesis.${hypothesis.id}`;
    if (link === undefined) {
      const expired = now > Date.parse(hypothesis.window.to);
      return [item(id, "NOT_EVALUATED", { kind: "not_evaluated", mandatory: false, reasonCodes: [expired ? "HYPOTHESIS_EXPIRED" : "HYPOTHESIS_PROPOSED"],
        nextAction: expired ? null : { label: `Observe with a runtime-written ${hypothesis.evidenceSource.eventType} row for ${hypothesis.evidenceSource.metric} inside the window`,
          route: `POST /api/v1/a4/projects/${state.project.project_id}/hypotheses/${hypothesis.id}/observe` } })];
    }
    const verdict = (link.body.verdict ?? {}) as { outcome?: unknown; by?: unknown; username?: unknown };
    const ref = state.refs.find((candidate) => candidate.refId === link.body.refId && candidate.sha256 === link.body.sha256);
    const view = ref === undefined ? [] : [{ refKind: ref.refKind, refId: ref.refId, sha256: ref.sha256, status: ref.status, trustTier: ref.trustTier,
      reasonCodes: ref.reasonCodes, lane: ref.lane, claimKind: ref.claimKind }];
    if (ref === undefined || ref.lane !== "observed") {
      return [item(id, "NOT_EVALUATED", { kind: "not_evaluated", mandatory: false, evidence: view as A4ReadinessItem["evidence"],
        reasonCodes: [ref === undefined ? "HYPOTHESIS_REF_UNRESOLVED" : "HYPOTHESIS_OBSERVATION_DOWNGRADED", ...(ref?.reasonCodes ?? [])] })];
    }
    return [item(id, "COMPLETE", { section: "observed", mandatory: false, evidence: view as A4ReadinessItem["evidence"],
      reasonCodes: [verdict.outcome === "refuted" ? "HYPOTHESIS_REFUTED" : "HYPOTHESIS_OBSERVED", "VERDICT_SELF_REPORTED", `VERDICT_BY:${String(verdict.username ?? verdict.by ?? "unknown")}`,
        // The row's own value as the observe route copied it (null: the row carried none).
        `OBSERVED_VALUE:${canonicalize(link.body.observedOutcome ?? null)}`] })];
  });
}

/** Aspire's readiness items (design §10.1); `sod` and the two gates are the governance items every stage carries. */
export function aspireItems(state: A4ReadinessState, query: A4ReadinessQuery): A4ReadinessItem[] {
  const { spec, answers, revisionNo } = aspireSpecOf(state);
  const gaps = answerGaps(answers);
  return [
    reached(state, "understood") ? item("understanding_confirmed", "READY")
      : waiting("understanding_confirmed", ["UNDERSTANDING_NOT_CONFIRMED"], { nextAction: { label: "Run Understand, then confirm it" } }),
    gaps.missing.length + gaps.stale.length + gaps.invalid.length === 0 ? item("ask_complete", "READY")
      : waiting("ask_complete", [...gaps.missing.map((id) => `ANSWER_MISSING:${id}`), ...gaps.stale.map((id) => `ANSWER_STALE:${id}`),
        ...gaps.invalid.map((id) => `ANSWER_INVALID:${id}`)], { nextAction: { label: "Answer or confirm the listed questions" } }),
    ...proposalItems(spec, answers),
    ...buildItems(state, spec, revisionNo, query.live.driftedSlots),
    ...hypothesisItems(state, spec, query.now)
  ];
}
