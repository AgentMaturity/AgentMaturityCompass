/**
 * The A4 stage, gate and effect routes (P1-57; design §6, §9, §12.1). The six generic stage routes (understand,
 * confirm-understanding, explain, propose, build, review) plus answers run the fixed step order; while a stage has no
 * producer (its spec module's PRODUCERS is empty, until P1-59…P1-62) they take the "no producer registered" path: the
 * human-authored content goes to the project's encrypted blob store, is signed as an `a4-stage-output` artifact outside
 * any transaction and is recorded as a `stage_output` ref (self_reported, lane implementation), so `built` and `reviewed`
 * are reachable now. Every write is governed (src/a4/a4Gates.ts): freeze refusal, readiness on rows read inside the
 * transaction, signing outside it. Decisions, consumption and effects reuse the slice A functions unchanged. Stage
 * modules register through src/a4/a4Stages.ts, which evaluation and effect lookups run first.
 */
import { join, relative, sep } from "node:path";
import { z } from "zod";
import { apiSuccess } from "../api/apiHelpers.js";
import { effectiveTrustTier, eventMeta, readerTrustFor } from "../claims/evidenceProvenance.js";
import { signArtifactFile } from "../lifecycle/artifactSignature.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { auditA4 } from "./a4Audit.js";
import { a4ProjectsRoot, putPrivate } from "./a4Blobs.js";
import { completeStage, openEffectGate, retryEffect, runA4Effect } from "./a4Effects.js";
import {
  assertAllowed, evaluateFor, gateRowOf, governed, livePrincipal, loadA4State, recordDecision, refuseOnFreeze, requestChanges, requestGate,
  RESOURCE_SLOTS
} from "./a4Gates.js";
import type { A4Action, A4ReadinessState } from "./a4Readiness.js";
// Function declarations only: a4Router.ts imports this module, so nothing here may read its bindings at load time.
import {
  a4Fail, assertNoSecrets, callOf, mutationResult, precheck, priorReplay, readJson, requirePrincipal, stageInput, type A4Route
} from "./a4Router.js";
import {
  a4AnswerSchema, a4HypothesisSchema, a4ResourceDigestsSchema, gatePolicyDigestOf, type A4Answer, type A4Question, type A4Stage, type A4Step
} from "./a4Schema.js";
import { PRODUCERS as ACTIVATE_PRODUCERS, QUESTIONS as ACTIVATE_QUESTIONS } from "./spec/activate.js";
import { PRODUCERS as ADAPT_PRODUCERS, QUESTIONS as ADAPT_QUESTIONS } from "./spec/adapt.js";
import { PRODUCERS as ASPIRE_PRODUCERS, QUESTIONS as ASPIRE_QUESTIONS } from "./spec/aspire.js";
import { PRODUCERS as ASSEMBLE_PRODUCERS, QUESTIONS as ASSEMBLE_QUESTIONS } from "./spec/assemble.js";
import { openA4Store, type A4ChangeSpec, type A4RequestKey, type A4TransitionResult } from "./a4Store.js";

/** Each stage's question bank as its lane publishes it (empty until P1-59…P1-62). */
export const STAGE_QUESTIONS: Readonly<Record<A4Stage, readonly A4Question[]>> = {
  aspire: ASPIRE_QUESTIONS, assemble: ASSEMBLE_QUESTIONS, adapt: ADAPT_QUESTIONS, activate: ACTIVATE_QUESTIONS
};
/** Each stage's output producers; the generic no-producer path serves only a stage that has none. */
const STAGE_PRODUCERS: Readonly<Record<A4Stage, ReadonlyArray<{ readonly id: string }>>> = {
  aspire: ASPIRE_PRODUCERS, assemble: ASSEMBLE_PRODUCERS, adapt: ADAPT_PRODUCERS, activate: ACTIVATE_PRODUCERS
};
const OBSERVED_TIERS = new Set(["OBSERVED", "OBSERVED_HARDENED"]);
const NO_PRODUCER = "NO_PRODUCER_REGISTERED";

type StepRoute = "answers" | "understand" | "confirm-understanding" | "explain" | "propose" | "build" | "review";
/** The fixed step order (design §9.1): the steps a route may start from, the step it records and the output it stores. */
const STEP_ROUTES: Record<StepRoute, { action: A4Action; from: readonly A4Step[] | null; to: A4Step | null; output: string | null }> = {
  answers: { action: "ask", from: null, to: "asked", output: null },
  understand: { action: "understand", from: ["asked"], to: null, output: "understanding" },
  "confirm-understanding": { action: "understand", from: ["asked"], to: "understood", output: null },
  explain: { action: "explain", from: ["understood"], to: "explained", output: "explanation" },
  propose: { action: "propose", from: ["explained"], to: "proposed", output: null },
  build: { action: "build", from: ["direction_approved"], to: "built", output: "build" },
  review: { action: "review", from: ["built"], to: "reviewed", output: "review" }
};
const clientRequestIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/, "clientRequestId: 8 to 128 letters, digits, _ or -");
const headSeqSchema = z.number().int().min(0);
const reasonSchema = z.string().trim().min(1).max(2000);
const base = { expectedHeadSeq: headSeqSchema, clientRequestId: clientRequestIdSchema };
const content = z.string().trim().min(1).max(65_536);
const STEP_SCHEMAS = {
  answers: z.strictObject({ ...base, answers: z.array(z.strictObject({ questionId: z.string().regex(/^[A-Za-z0-9_.-]{1,128}$/), value: z.unknown() })).min(1).max(200) }),
  understand: z.strictObject({ ...base, content }),
  // Corrections are new answers: POST …/answers, then understand again (design §9.3); a confirmation carries none.
  "confirm-understanding": z.strictObject({ ...base, confirmed: z.literal(true), corrections: z.union([z.string().max(0), z.array(z.string()).max(0)]).optional() }),
  explain: z.strictObject({ ...base, content, level: z.enum(["novice", "practitioner", "expert"]) }),
  propose: z.strictObject({ ...base, spec: z.record(z.string(), z.unknown()), parentRevisionNo: z.number().int().min(0).optional() }),
  build: z.strictObject({ ...base, content }),
  review: z.strictObject({ ...base, content })
} as const;

/** The newest revision recorded at `stage`, and its answers. */
function stageSpec(state: A4ReadinessState, stage: A4Stage): { spec: Record<string, unknown>; answers: A4Answer[] } {
  const revision = state.revisions.filter((row) => row.stage === stage).at(-1);
  const spec = revision ? JSON.parse(revision.spec_json) as Record<string, unknown> : {};
  const answers = Array.isArray(spec.answers) ? spec.answers.flatMap((answer) => {
    const parsed = a4AnswerSchema.safeParse(answer);
    return parsed.success ? [parsed.data] : [];
  }) : [];
  return { spec, answers };
}

/** The slots a generic revision binds: the signed configs as they are now and the gate policy in force; the rest is not produced. */
function genericResourceDigests(workspace: string, state: A4ReadinessState) {
  const slot = (name: string): string | null => RESOURCE_SLOTS[`signedConfigs.${name}`]!(workspace);
  return a4ResourceDigestsSchema.parse({
    schema: "amc.a4-resource-digests/v1", brief: { contextGraphSha256: null, agentConfigSha256: null },
    enforce: { manifestId: null, resourcesSha256: null, snapshotBundleSha256: null }, composition: { compositionDigest: null, policyDigest: null, presetSha256: null },
    graph: { typedGraphDigest: null },
    signedConfigs: { tools: slot("tools"), approvalPolicy: slot("approvalPolicy"), budgets: slot("budgets"), firewall: slot("firewall"),
      actionPolicy: slot("actionPolicy"), opsPolicy: slot("opsPolicy") },
    plan: { planDigest: null, lockDigest: null, journalEntrySha256: null }, operatingProfile: { sha256: null, activationSha256: null },
    context: { contextPluginSha256: null, promptPackSha256: null, memoryPolicySha256: null },
    release: { packageDigest: null, imageDigest: null, chartOrComposeDigest: null, valuesDigest: null }, gatePolicyDigest: gatePolicyDigestOf(state.chain)
  });
}

/** A REVISION spec (as `appendRevision` writes it) for revision head + 1 at `stage`. */
function revisionSpec(workspace: string, state: A4ReadinessState, stage: A4Stage, spec: Record<string, unknown>, actorKey: string, ts: number): A4ChangeSpec {
  const projectId = state.project.project_id;
  const revisionNo = state.project.revision_no + 1;
  const digests = genericResourceDigests(workspace, state);
  const values = { project_id: projectId, revision_no: revisionNo, stage, parent_revision_no: state.project.revision_no === 0 ? null : state.project.revision_no,
    spec_json: canonicalize(spec), spec_digest: sha256Hex(canonicalize(spec)), resource_digests_json: canonicalize(digests),
    resource_digests_sha256: sha256Hex(canonicalize(digests)), operating_scope_json: null, created_by_key: actorKey, ts };
  return { kind: "REVISION", stage, revisionNo, payload: { specDigest: values.spec_digest, resourceDigestsSha256: values.resource_digests_sha256 },
    sideRows: [{ table: "a4_revisions", values }], head: { revision_no: revisionNo } };
}

/**
 * The no-producer output: sealed into the project's blob store (personal text never enters the ledger), signed as an
 * `a4-stage-output` artifact before any transaction, and named by its path and ciphertext sha256.
 * ponytail: a blob whose transition then fails stays as an unreferenced file, as comment blobs do.
 */
function writeStageOutput(route: A4Route, projectId: string, text: string): { refId: string; sha256: string } {
  const keySha256 = route.store.readChain(projectId)[0]?.body.projectPublicKeySha256;
  if (typeof keySha256 !== "string") throw a4Fail(409, "A4_INTEGRITY_FAILED", "The CREATED record names no project key.");
  const { blobRef } = putPrivate(route.workspace, projectId, Buffer.from(text, "utf8"), keySha256);
  const path = join(a4ProjectsRoot(route.workspace), projectId, "private", `${blobRef}.enc`);
  signArtifactFile({ workspace: route.workspace, path, artifactKind: "a4-stage-output" });
  return { refId: relative(route.workspace, path).split(sep).join("/"), sha256: blobRef };
}

/** One generic stage step: answers, understand, confirm-understanding, explain, propose, build or review. */
async function stageStep(route: A4Route, projectId: string, stage: A4Stage, kind: StepRoute): Promise<true> {
  const def = STEP_ROUTES[kind];
  const { body, request } = await readJson(route, STEP_SCHEMAS[kind]);
  const replay = priorReplay(route.store, request, projectId);
  if (replay) return (apiSuccess(route.res, replay), true);
  // The output is labelled NO_PRODUCER_REGISTERED, so the generic path serves only a stage whose lane registered none.
  if (def.output !== null && STAGE_PRODUCERS[stage].length > 0) {
    throw a4Fail(409, "A4_PRODUCER_REGISTERED", `${stage} has registered producers; its lane records ${kind}, not the no-producer path.`);
  }
  const fields = body as { content?: string; level?: string; spec?: Record<string, unknown>; parentRevisionNo?: number;
    answers?: Array<{ questionId: string; value?: unknown }>; expectedHeadSeq: number };
  if (fields.spec !== undefined && Object.hasOwn(fields.spec, "answers")) throw a4Fail(400, "INPUT_INVALID", "Answers are carried by the server; record them through …/answers.");
  if (fields.spec !== undefined) assertNoSecrets(fields.spec, "The specification");
  if (fields.answers !== undefined) assertNoSecrets(fields.answers, "The answers");
  const call = callOf(route, request);
  const principal = livePrincipal(route.store, call);
  const now = Date.now();
  const check = (state: A4ReadinessState) => {
    const project = state.project;
    if (project.stage !== stage) throw a4Fail(409, "A4_STEP_ORDER", `The project is at ${project.stage}, not ${stage}.`);
    const { readiness } = evaluateFor(route.store, state, principal, call, stage, now);
    assertAllowed(readiness, def.action);
    if (def.from !== null && !def.from.includes(project.step)) throw a4Fail(409, "A4_STEP_ORDER", `${kind} follows ${def.from.join(" or ")}; the project is at ${project.step}.`);
    if (fields.parentRevisionNo !== undefined && fields.parentRevisionNo !== project.revision_no) {
      throw a4Fail(409, "A4_STALE_HEAD", "The specification was edited from an older revision; reload and merge.", { revisionNo: project.revision_no });
    }
    return readiness;
  };
  // The pre-flight refusal writes the automatic hold under a freeze, as governed() does, before any blob is written.
  refuseOnFreeze(route.store, projectId);
  check(loadA4State(route.store, projectId, now));
  const output = def.output !== null ? writeStageOutput(route, projectId, fields.content!) : null;
  const result = governed(route.store, projectId, principal, { expectedHeadSeq: fields.expectedHeadSeq, request }, (ts) => {
    const state = loadA4State(route.store, projectId, now);
    const readiness = check(state);
    const project = state.project;
    const specs: A4ChangeSpec[] = [];
    if (output !== null) {
      const label = `${stage} ${def.output} (no producer registered; human-authored)`;
      specs.push({ kind: "EVIDENCE_REF", stage, payload: { refKind: "stage_output", refId: output.refId, sha256: output.sha256, lane: "implementation",
        claimKind: "self_reported", output: def.output, producer: null },
        sideRows: [{ table: "a4_evidence_refs", values: { project_id: projectId, seq: project.head_seq + 1, revision_no: project.revision_no, stage,
          lane: "implementation", ref_kind: "stage_output", ref_id: output.refId, sha256: output.sha256, claim_kind: "self_reported", trust_tier: null,
          method: null, label, actor_key: principal.key, ts } }] });
    }
    const { spec, answers } = stageSpec(state, stage);
    if (kind === "answers") {
      const revisionNo = project.revision_no + 1;
      const bank = STAGE_QUESTIONS[stage];
      const merged = new Map(answers.map((answer) => [answer.questionId, answer]));
      for (const answer of fields.answers!) {
        if (bank.length > 0 && !bank.some((question) => question.id === answer.questionId)) throw a4Fail(400, "A4_UNKNOWN_QUESTION", `no question ${answer.questionId} at ${stage}`);
        merged.set(answer.questionId, { questionId: answer.questionId, value: answer.value ?? null, source: "user", answeredAtRevision: revisionNo, dependencyDigest: "" });
      }
      // dependencyDigest = sha256(canonical answers of dependsOn), recomputed for the answers given now (design §9.2).
      for (const answer of fields.answers!) {
        const dependsOn = bank.find((question) => question.id === answer.questionId)?.dependsOn ?? [];
        merged.set(answer.questionId, { ...merged.get(answer.questionId)!,
          dependencyDigest: sha256Hex(canonicalize(dependsOn.map((id) => [id, merged.get(id)?.value ?? null]))) });
      }
      specs.push(revisionSpec(route.workspace, state, stage, { ...spec, answers: [...merged.values()].sort((a, b) => a.questionId.localeCompare(b.questionId)) },
        principal.key, ts));
    }
    if (kind === "propose") specs.push(revisionSpec(route.workspace, state, stage, { ...fields.spec, answers }, principal.key, ts));
    if (def.to !== null && def.to !== project.step) {
      const observed = state.refs.some((ref) => ref.revisionNo === project.revision_no && ref.lane === "observed");
      specs.push({ kind: "STEP", stage, payload: { from: project.step, to: def.to, claimKind: "self_reported", producer: null,
        ...(def.output !== null ? { reasonCodes: [NO_PRODUCER] } : {}),
        ...(fields.level !== undefined ? { level: fields.level } : {}),
        // `reviewed` needs an observed ref or an explicit not_evaluated output with its reason (design §9.1).
        ...(kind === "review" ? { observed: observed ? "present" : { status: "not_evaluated", reasonCodes: [NO_PRODUCER] } } : {}) },
        head: { step: def.to } });
    }
    if (specs.length === 0) throw a4Fail(409, "A4_STEP_ORDER", "Nothing to record.");
    return { readiness, specs };
  });
  apiSuccess(route.res, mutationResult(result), 201);
  return true;
}

/** The executor runs after the response, outside the project lock, on its own store (design §6.5). */
function runEffectAfterResponse(workspace: string, projectId: string, attemptId: string): void {
  setImmediate(() => {
    let store: ReturnType<typeof openA4Store>;
    try {
      store = openA4Store(workspace);
    } catch {
      return; // The attempt stays running; the liveness sweeper settles it as process_lost once its heartbeat is stale.
    }
    void runA4Effect(store, projectId, attemptId).catch(() => undefined).finally(() => store.close());
  });
}

const gateIdSchema = z.string().regex(/^a4gate_[0-9a-f]{32}$/);
const decideSchema = z.strictObject({ reason: reasonSchema, expectedRequestDigestSha256: z.string().regex(/^[0-9a-f]{64}$/),
  expectedReadinessBindingDigest: z.string().regex(/^[0-9a-f]{64}$/).optional(), expectedGateSeq: headSeqSchema, clientRequestId: clientRequestIdSchema });
const changesSchema = z.strictObject({ reason: reasonSchema, expectedGateSeq: headSeqSchema, clientRequestId: clientRequestIdSchema,
  findings: z.array(z.strictObject({ severity: z.enum(["info", "low", "medium", "high", "critical"]), message: z.string().trim().min(1).max(2000) })).max(100).default([]) });
const completeSchema = z.strictObject({ ...base, gateId: gateIdSchema });
const observeSchema = z.strictObject({ ...base, verdict: z.enum(["observed", "refuted"]),
  evidenceRef: z.strictObject({ refId: z.string().min(1).max(512), sha256: z.string().regex(/^[0-9a-f]{64}$/) }) });

async function respond(route: A4Route, projectId: string, request: A4RequestKey | undefined, write: () => A4TransitionResult,
  status = 200, extra: (result: A4TransitionResult) => Record<string, unknown> = () => ({})): Promise<true> {
  const replay = priorReplay(route.store, request, projectId);
  if (replay) apiSuccess(route.res, replay);
  else {
    const result = write();
    apiSuccess(route.res, mutationResult(result, extra(result)), status);
  }
  return true;
}

/**
 * POST …/hypotheses/:id/observe (design §10.1): the only path out of `proposed`. The ref must be a runtime-written
 * (OBSERVED) ledger row of the declared evidence source, inside the hypothesis window; the human verdict is signed
 * beside it as a separate, self_reported statement and never merged with the observed value.
 */
async function observeHypothesis(route: A4Route, projectId: string, hypothesisId: string): Promise<true> {
  const principal = requirePrincipal(route);
  const { body, request } = await readJson(route, observeSchema);
  return respond(route, projectId, request, () => {
    const state = precheck(route, projectId, "observeHypothesis", body.expectedHeadSeq);
    const { spec } = stageSpec(state, "aspire");
    const hypothesis = (Array.isArray(spec.hypotheses) ? spec.hypotheses : []).map((entry) => a4HypothesisSchema.safeParse(entry))
      .find((parsed) => parsed.success && parsed.data.id === hypothesisId)?.data;
    if (hypothesis === undefined) throw a4Fail(404, "A4_HYPOTHESIS_NOT_FOUND", `no hypothesis ${hypothesisId} in the Aspire brief`);
    if (state.chain.some((link) => link.kind === "EVIDENCE_REF" && link.body.hypothesisId === hypothesisId)) {
      throw a4Fail(409, "A4_HYPOTHESIS_OBSERVED", "This hypothesis already left proposed.");
    }
    const event = route.store.ledger.getEventById(body.evidenceRef.refId);
    if (!event) throw a4Fail(409, "EVIDENCE_REF_DANGLING", `no ledger row ${body.evidenceRef.refId}`);
    const meta = eventMeta(event);
    if (!OBSERVED_TIERS.has(effectiveTrustTier(event, readerTrustFor(route.workspace)) ?? "")) {
      throw a4Fail(409, "HYPOTHESIS_NOT_OBSERVED", "Only a row the runtime wrote (OBSERVED) can observe a hypothesis.");
    }
    const source = hypothesis.evidenceSource;
    if (![event.event_type, meta.auditType, meta.eventType].includes(source.eventType)
      || ![meta.metricKey, meta.metric, meta.metricId, meta.kpiId].includes(source.metric)) {
      throw a4Fail(400, "HYPOTHESIS_SOURCE_MISMATCH", `the ref is not a ${source.eventType} row for ${source.metric}`);
    }
    if (event.ts < Date.parse(hypothesis.window.from) || event.ts > Date.parse(hypothesis.window.to)) {
      throw a4Fail(409, "HYPOTHESIS_OUTSIDE_WINDOW", "The row lies outside the hypothesis window.");
    }
    return route.store.addEvidenceRef(projectId, { actor: principal, refKind: "ledger_event", refId: body.evidenceRef.refId, sha256: body.evidenceRef.sha256,
      claimKind: "observed", method: "runtime_observation", label: `hypothesis ${hypothesisId}: observed outcome`, column: "implementation",
      expectedHeadSeq: body.expectedHeadSeq, request,
      note: { hypothesisId, verdict: { outcome: body.verdict, by: principal.key, claimKind: "self_reported" } } });
  }, 201);
}

/** Stage, gate, effect and hypothesis POSTs. Returns false when none matches. */
export async function handleA4StageRoute(route: A4Route, projectId: string, tail: string): Promise<boolean> {
  if (route.method !== "POST") return false;
  const { store } = route;
  const step = /^\/stages\/([a-z]+)\/(answers|understand|confirm-understanding|explain|propose|build|review)$/.exec(tail);
  if (step !== null) return stageStep(route, projectId, stageInput(step[1]), step[2] as StepRoute);
  const gateRequest = /^\/stages\/([a-z]+)\/gates\/(direction|completion)\/request$/.exec(tail);
  if (gateRequest !== null) {
    const stage = stageInput(gateRequest[1]);
    const gate = gateRequest[2] as "direction" | "completion";
    const { body, request } = await readJson(route, z.strictObject(base));
    return respond(route, projectId, request, () => {
      const result = requestGate(store, projectId, { ...callOf(route, request), stage, gate, expectedHeadSeq: body.expectedHeadSeq });
      const head = store.readHead(projectId);
      if (!result.replay && head) auditA4(route.workspace, { type: "A4_GATE_OPENED", agentId: head.agent_id, projectId, username: requirePrincipal(route).username,
        summary: `A4 ${stage}.${gate} gate opened on ${head.name}`, details: { stage, gate, seq: result.seq } });
      return result;
    }, 201);
  }
  const decision = /^\/gates\/(a4gate_[0-9a-f]{32})\/(approve|deny|request-changes)$/.exec(tail);
  if (decision !== null) {
    const gateId = decision[1]!;
    if (decision[2] === "request-changes") {
      const { body, request } = await readJson(route, changesSchema);
      return respond(route, projectId, request, () => {
        // The gate's own seq, derived by the server from its GATE_REQUESTED row (a head seq never passes for it).
        const state = loadA4State(store, projectId, Date.now());
        const row = gateRowOf(state, gateId);
        const requested = state.chain.find((link) => link.kind === "GATE_REQUESTED" && link.body.gateId === row.gate_id)?.seq;
        if (requested !== body.expectedGateSeq) throw a4Fail(409, "A4_GATE_SEQ_MISMATCH", `the gate was requested at seq ${String(requested)}`, { gateSeq: requested ?? null });
        return requestChanges(store, projectId, { ...callOf(route, request), gateId, reason: body.reason, findings: body.findings,
          expectedHeadSeq: state.project.head_seq });
      });
    }
    const { body, request } = await readJson(route, decideSchema);
    const verdict = decision[2] as "approve" | "deny";
    return respond(route, projectId, request, () => {
      const result = recordDecision(store, projectId, { ...callOf(route, request), gateId, decision: verdict, reason: body.reason,
        expectedRequestDigestSha256: body.expectedRequestDigestSha256, expectedGateSeq: body.expectedGateSeq,
        ...(body.expectedReadinessBindingDigest === undefined ? {} : { expectedReadinessBindingDigest: body.expectedReadinessBindingDigest }) });
      const head = store.readHead(projectId);
      if (!result.replay && head) auditA4(route.workspace, { type: "A4_GATE_DECIDED", agentId: head.agent_id, projectId, username: requirePrincipal(route).username,
        summary: `A4 gate ${verdict === "approve" ? "approved" : "denied"} on ${head.name}`, details: { gateId, decision: verdict, seq: result.seq } });
      return result;
    }, 201);
  }
  const complete = /^\/stages\/([a-z]+)\/complete$/.exec(tail);
  if (complete !== null) {
    const stage = stageInput(complete[1]);
    const { body, request } = await readJson(route, completeSchema);
    let attemptId: string | null = null;
    return respond(route, projectId, request, () => {
      // complete evaluates integrity in full (verifyA4Chain), as GET and verify do (design §7); the effect comes from the chain.
      const started = completeStage(store, projectId, { ...callOf(route, request, true), stage, gateId: body.gateId, expectedHeadSeq: body.expectedHeadSeq });
      attemptId = started.attemptId;
      if (attemptId !== null && !started.result.replay) runEffectAfterResponse(route.workspace, projectId, attemptId);
      return started.result;
    }, 200, () => (attemptId === null ? {} : { attemptId }));
  }
  const effect = /^\/stages\/([a-z]+)\/effects\/([a-z0-9_.-]{1,128})\/(open|retry)$/.exec(tail);
  if (effect !== null) {
    stageInput(effect[1]);
    const effectId = effect[2]!;
    if (effect[3] === "open") {
      const { body, request } = await readJson(route, z.strictObject({ ...base, gateId: gateIdSchema }));
      return respond(route, projectId, request, () => openEffectGate(store, projectId, { ...callOf(route, request), effectId, gateId: body.gateId,
        expectedHeadSeq: body.expectedHeadSeq }), 201);
    }
    const { body, request } = await readJson(route, z.strictObject({ ...base, attemptId: z.string().regex(/^a4e_[0-9a-f]{32}$/) }));
    let nextAttempt = "";
    return respond(route, projectId, request, () => {
      const started = store.readChain(projectId).find((link) => link.kind === "EFFECT_STARTED" && link.body.effectId === body.attemptId);
      if (started?.body.effect !== effectId) throw a4Fail(404, "A4_EFFECT_NOT_FOUND", `no attempt ${body.attemptId} of effect ${effectId}`);
      const retried = retryEffect(store, projectId, { ...callOf(route, request), attemptId: body.attemptId, expectedHeadSeq: body.expectedHeadSeq });
      nextAttempt = retried.attemptId;
      if (!retried.result.replay) runEffectAfterResponse(route.workspace, projectId, nextAttempt);
      return retried.result;
    }, 201, () => ({ attemptId: nextAttempt }));
  }
  const observe = /^\/hypotheses\/([A-Za-z0-9_.-]{1,128})\/observe$/.exec(tail);
  if (observe !== null) return observeHypothesis(route, projectId, observe[1]!);
  return false;
}
