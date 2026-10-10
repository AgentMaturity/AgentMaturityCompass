/**
 * Assemble's Build and Review (P1-60 slice A; design §10.2). Build runs the approved plan: refusals first (owner mode,
 * the signing key, the baseline Enforce manifest through proposeEnforceResourceLifecycle, and the native session's
 * admission as Studio's native task route checks it), then the deterministic executors (the revised typed graph, the
 * agent's preset merged into the signed presets file), and journals the native build session in its revision before
 * anything starts it: the router starts it after the transition commits, on the live NativeTaskService Studio already
 * holds (`context.nativeTasks.service`), never a second instance. Further turns, cancel and resume go through Studio's
 * native task API under the session's owner, with the task's own cursor contract. Review reads each session through its
 * owner, refuses while one runs or has failed, and records AMC's verifyAgentRun as an integrity self-check, the session
 * and its validation as synthetic_example on the stub provider, Enforce's evaluation, and capabilities and limitations.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { relative, sep } from "node:path";
import { actionEvidenceCoverage } from "../actions/actionEvidenceCoverage.js";
import { verifyAgentRun } from "../agent/runReport.js";
import type { NativeTaskApiContext } from "../api/nativeTasksRouter.js";
import { getPrivateKeyPem } from "../crypto/keys.js";
import { evaluateEnforceResourceLifecycle, projectEnforceResourceLifecycleStatus, proposeEnforceResourceLifecycle } from "../enforce/resourceManifest.js";
import { writeTypedMultiAgentGraph } from "../fleet/typedGraph.js";
import { assertOwnerMode } from "../mode/mode.js";
import { readPresets, savePresets } from "../presets/agentPresets.js";
import { assertNativeExecutionIdentity, NativeAdmissionError } from "../studio/nativeAdmission.js";
import { nativeTaskId } from "../studio/nativeTaskDescriptors.js";
import { NativeTaskServiceError, type NativeTaskActor, type NativeTaskStartRequest, type NativeTaskView } from "../studio/nativeTaskTypes.js";
import { loadTrustContext } from "../trust/trustContext.js";
import { buildVerifierReport } from "../trust/verifierReport.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import type { A4ProducerContext, A4ProducerResult } from "./a4RouterStages.js";
import { A4StoreError } from "./a4Store.js";
import { errorCodeOf } from "./aspireUnderstand.js";
import { ASSEMBLE_CLAIM_BOUNDARY, assembleSpecOf, presetIdOf, proposedFor, STUB_WORDING } from "./spec/assemble.js";
import { answerValues, listValue } from "./spec/aspire.js";

const fail = (status: number, code: string, message: string, detail?: unknown): A4StoreError => new A4StoreError(status, code, message, detail);
const relPath = (workspace: string, path: string): string => relative(workspace, path).split(sep).join("/");
/** States in which a session may still change what it did: Review waits for them. */
const RUNNING = new Set<NativeTaskView["state"]>(["starting", "running", "cancel-requested", "releasing", "verifying"]);

/** The native task actor for `agentId` on this Studio session (the service keys every task by its principal). */
export const nativeActor = (native: NativeTaskApiContext, agentId: string): NativeTaskActor => ({ principalId: native.principalId, demo: native.demo, agentId });

function requireNative(ctx: A4ProducerContext): NativeTaskApiContext {
  if (ctx.native === undefined) throw fail(409, "A4_NOT_READY", "Native build sessions run through Studio's native task service.", { reasonCodes: ["NATIVE_TASKS_UNAVAILABLE"] });
  return ctx.native;
}
/** A native service or admission refusal keeps its status and public code. */
function nativeRefusal(error: unknown): unknown {
  if (error instanceof NativeTaskServiceError || error instanceof NativeAdmissionError) return fail(error.statusCode, error.code, error.message);
  return error;
}

interface PlannedSession {
  readonly planTaskId: string;
  readonly taskId: string;
  readonly ownerKey: string;
  readonly ownerUsername: string;
  readonly start: NativeTaskStartRequest;
}
type Session = { provider: NativeTaskStartRequest["provider"]; model: string | null; tools: "none" | "workspace"; toolsDigest: string | null; maxSteps: number; maxTokens: number };

/**
 * The native session Build journals: admitted as Studio's native task route admits it (read-only refusal, the human
 * execution identity) and checked against the live service's configuration, which must still offer the approved
 * provider (credential configured), tool scope (same digest) and validation config (same sha256). Read-only.
 */
async function plannedSession(ctx: A4ProducerContext, spec: Record<string, unknown>): Promise<PlannedSession> {
  const native = requireNative(ctx);
  const agentId = ctx.state.project.agent_id;
  const session = spec.session as Session;
  const task = (spec.plan as Array<{ id: string; executor: string; prompt?: string }>).find((entry) => entry.executor === "native_turn");
  if (task?.prompt === undefined) throw fail(409, "A4_NOT_READY", "The plan names no native build turn; propose again.", { reasonCodes: ["PLAN_STALE"] });
  if (!native.executionAllowed()) throw fail(403, "NATIVE_READ_ONLY", "Workspace signatures require read-only operation; no build session was started.");
  try {
    assertNativeExecutionIdentity({ actor: native.admissionActor, provider: session.provider, tools: session.tools });
  } catch (error) {
    throw nativeRefusal(error);
  }
  const config = await native.service.configuration(nativeActor(native, agentId)).catch((error: unknown) => {
    throw nativeRefusal(error);
  });
  const offered = config.providers.find((provider) => provider.id === session.provider);
  if (offered === undefined) throw fail(409, "A4_NOT_READY", `Studio does not offer ${session.provider}.`, { reasonCodes: ["PROVIDER_NOT_OFFERED"] });
  if (offered.credential !== null && !offered.credential.configured) {
    throw fail(409, "A4_NOT_READY", `Configure the credential ${offered.credential.ref} for ${session.provider} first.`, { reasonCodes: ["CREDENTIAL_NOT_CONFIGURED"] });
  }
  if (session.tools === "workspace" && (!config.scope.ready || config.scope.digest !== session.toolsDigest)) {
    throw fail(409, "A4_NOT_READY", "The signed tool scope is not ready or changed since the plan was approved; propose again.", { reasonCodes: ["SCOPE_CHANGED"] });
  }
  const plan = spec.validationPlan as { checkIds: string[]; configSha256: string | null };
  if (plan.checkIds.length > 0 && (!config.validation.ready || config.validation.configSha256 !== plan.configSha256)) {
    throw fail(409, "A4_NOT_READY", "The validation config is not ready or changed since the plan was approved; propose again.", { reasonCodes: ["VALIDATION_CONFIG_CHANGED"] });
  }
  const clientRequestId = randomUUID();
  const start: NativeTaskStartRequest = { clientRequestId, agentId, provider: session.provider, ...(session.model === null ? {} : { model: session.model }),
    tools: session.tools, ...(session.tools === "workspace" ? { toolsDigest: session.toolsDigest! } : {}),
    ...(plan.checkIds.length > 0 ? { validation: { configSha256: plan.configSha256!, checkIds: plan.checkIds } } : {}),
    prompt: task.prompt, maxSteps: Math.min(session.maxSteps, config.limits.maxSteps), maxTokens: Math.min(session.maxTokens, config.limits.maxTokens) };
  return { planTaskId: task.id, taskId: nativeTaskId(native.principalId, clientRequestId), ownerKey: ctx.principal.key, ownerUsername: ctx.principal.username, start };
}

/** Starts a journaled session after its transition committed; an exact retry of the same body answers the same task. */
async function startSession(native: NativeTaskApiContext, planned: PlannedSession): Promise<Record<string, unknown>> {
  try {
    const view = await native.service.start(nativeActor(native, planned.start.agentId), planned.start);
    return { taskId: view.taskId, state: view.state, sessionId: view.sessionId, error: view.error === null ? null : view.error.slice(0, 300) };
  } catch (error) {
    return { taskId: planned.taskId, state: null, sessionId: null, error: errorCodeOf(error, "NATIVE_START_FAILED") };
  }
}

/** The pending Enforce changes against the agent's signed baseline manifest (dry run); a baseline that does not verify refuses. */
function enforcePreview(workspace: string, agentId: string) {
  let proposal: ReturnType<typeof proposeEnforceResourceLifecycle>;
  try {
    proposal = proposeEnforceResourceLifecycle({ workspace, agentId });
  } catch (error) {
    throw fail(409, "A4_NOT_READY", "The agent's Enforce baseline manifest cannot be read.", { reasonCodes: [errorCodeOf(error, "BASELINE_MANIFEST_UNREADABLE")] });
  }
  if (!proposal.validation.signature.valid) throw fail(409, "A4_NOT_READY", "The agent's Enforce baseline manifest is not validly signed.", { reasonCodes: ["MANIFEST_SIGNATURE_INVALID"] });
  const { diff } = proposal;
  return { proposalId: proposal.proposalId, expectedManifestId: proposal.expectedManifestId, currentManifestId: proposal.currentManifestId, summary: proposal.summary,
    added: diff.added.length, changed: diff.changed.length, removed: diff.removed.length, validation: proposal.validation.status };
}

/**
 * Build (after the direction gate is consumed; owner, owner mode: it signs the workspace presets file). Every refusal
 * runs before the first write. The router refuses Build (409 RESOURCE_DRIFTED) before it runs when a resource the
 * approved revision bound has moved.
 * ponytail: as at Aspire, the graph and preset are written before the transition that records them; a head that moves in
 * between leaves them written (the same approved bytes), and Build run again is refused as drifted.
 */
export async function buildAssemble(ctx: A4ProducerContext): Promise<A4ProducerResult> {
  const { workspace } = ctx;
  const agentId = ctx.state.project.agent_id;
  assertOwnerMode(workspace, "a4 build");
  const { spec, answers } = assembleSpecOf(ctx.state);
  if (!proposedFor(spec, answers)) throw fail(409, "A4_NOT_READY", "Build runs the proposed plan; propose it again first.", { reasonCodes: ["PLAN_STALE"] });
  const native = spec.path === "native";
  getPrivateKeyPem(workspace, "auditor");
  const preview = enforcePreview(workspace, agentId);
  const presets = native ? readPresets(workspace) : null;
  if (presets !== null && !presets.ok) throw fail(409, "A4_NOT_READY", "The workspace presets file does not verify; restore it or re-sign it.", { reasonCodes: ["PRESETS_UNTRUSTED"] });
  const planned = native ? await plannedSession(ctx, spec) : null;
  const graph = writeTypedMultiAgentGraph({ workspace, graph: spec.graph });
  const files = [{ writer: "typed-graph", path: relPath(workspace, graph.graphPath), sha256: sha256Hex(readFileSync(graph.graphPath)) }];
  let preset: { id: string; sha256: string } | null = null;
  if (presets?.ok === true) {
    const id = presetIdOf(agentId);
    savePresets(workspace, [...presets.presets.filter((one) => one.id !== id), spec.preset]);
    // Hashed as a verified read gives it, the value composition.presetSha256 recomputes.
    const written = readPresets(workspace);
    const found = written.ok ? written.presets.find((one) => one.id === id) : undefined;
    preset = found === undefined ? null : { id, sha256: sha256Hex(canonicalize(found)) };
  }
  const checkIds = listValue((spec.validationPlan as { checkIds?: unknown }).checkIds);
  const sessions = planned === null ? [] : [{ planTaskId: planned.planTaskId, taskId: planned.taskId, ownerKey: planned.ownerKey, ownerUsername: planned.ownerUsername,
    start: planned.start }];
  const out = (label: string, body: unknown) => ({ output: "build", label: `assemble build: ${label}`, lane: "implementation" as const, method: null, body });
  return {
    outputs: [out("Enforce resource-change preview (dry run against the signed baseline)", preview), out(`typed graph written (${files[0]!.path})`, files[0]),
      ...(preset === null ? [] : [out(`preset ${preset.id} signed into .amc/agents.yaml`, preset)]),
      ...sessions.map((session) => out(`native build session ${session.taskId} journaled (it starts once this step is recorded)`,
        { taskId: session.taskId, planTaskId: session.planTaskId, provider: session.start.provider, tools: session.start.tools }))],
    spec: { ...spec, build: { files, preview, preset, sessions,
      validation: checkIds.length > 0 ? { configSha256: (spec.validationPlan as { configSha256: string | null }).configSha256, checkIds } : null } },
    ...(planned === null ? {} : { afterCommit: async () => ({ sessions: [await startSession(requireNative(ctx), planned)] }) })
  };
}

/** AMC's verifyAgentRun over one session as a VerifierReportV1: integrity of bytes under this workspace's keys, never a claim. */
async function sessionIntegrity(workspace: string, sessionId: string, headEventHash: string | null) {
  const trust = loadTrustContext();
  const verification = await verifyAgentRun(workspace, sessionId, trust);
  const anchored = verification.trustRoot.anchored;
  const report = buildVerifierReport({ artifact: { kind: "agent-run", path: `session:${sessionId}`, sha256: headEventHash ?? sha256Hex(sessionId) }, context: trust,
    integrityErrors: [...verification.ledgerErrors, ...verification.sessionChainErrors, ...verification.unsignedRowIds.map((id) => `unsigned row ${id}`)].slice(0, 32),
    signatures: verification.trustRoot.monitorAdmission ? [verification.trustRoot.monitorAdmission] : [],
    anchoring: { status: anchored ? "anchored" : "unanchored", detail: anchored ? null : "no expected monitor fingerprint: workspace-key-consistency" } });
  return { integrityOk: verification.integrityOk, ok: verification.ok, anchored, report };
}

/** One build session as its owner reads it now; refuses while it runs, and names the way on when it failed or never started. */
function settledView(ctx: A4ProducerContext, planned: PlannedSession): NativeTaskView {
  const native = requireNative(ctx);
  if (planned.ownerKey !== ctx.principal.key) {
    throw fail(409, "A4_NOT_READY", `Review reads build sessions through their owner's Studio session: ${planned.ownerUsername} reviews.`, { reasonCodes: ["SESSION_OWNER_REQUIRED"] });
  }
  let view: NativeTaskView;
  try {
    view = native.service.poll(nativeActor(native, ctx.state.project.agent_id), planned.taskId).task;
  } catch (error) {
    if (error instanceof NativeTaskServiceError && error.code === "NATIVE_TASK_NOT_FOUND") {
      throw fail(409, "A4_NOT_READY", "The build session never started: start it again with the body Build recorded (POST /api/v1/native-tasks).",
        { reasonCodes: ["BUILD_FAILED", `TASK:${planned.taskId}`] });
    }
    throw nativeRefusal(error);
  }
  if (RUNNING.has(view.state)) throw fail(409, "A4_NOT_READY", "A build session is still running; review once it settles.", { reasonCodes: ["BUILD_RUNNING", `TASK:${planned.taskId}`] });
  if (view.state === "failed" || view.sessionId === null) {
    throw fail(409, "A4_NOT_READY", view.canResume ? `The build session failed; resume it (POST /api/v1/native-tasks/${planned.taskId}/resume) and review once it settles.`
      : "The build session failed and cannot be resumed; request changes and build again.", { reasonCodes: ["BUILD_FAILED", `TASK:${planned.taskId}`] });
  }
  return view;
}

/**
 * Review: every build session settled and verified, its validation and action-evidence coverage, Enforce's evaluation
 * of the pending changes, and the capabilities and limitations, plan against built. The review is written into the
 * revision the completion gate binds, stub wording included.
 */
export async function reviewAssemble(ctx: A4ProducerContext): Promise<A4ProducerResult> {
  const { workspace } = ctx;
  const agentId = ctx.state.project.agent_id;
  const { spec, answers } = assembleSpecOf(ctx.state);
  const build = spec.build as { sessions?: PlannedSession[] } | undefined;
  if (build === undefined) throw fail(409, "A4_NOT_READY", "Nothing was built at this revision.", { reasonCodes: ["PRODUCED_AT_BUILD"] });
  const views = (build.sessions ?? []).map((planned) => settledView(ctx, planned));
  const outputs: Array<A4ProducerResult["outputs"][number]> = [];
  const sessions: Array<Record<string, unknown>> = [];
  for (const view of views) {
    const stub = view.provider === "stub";
    const sessionId = view.sessionId!;
    const integrity = await sessionIntegrity(workspace, sessionId, view.history.headEventHash);
    const executed = view.validation.checks.filter((check) => check.status === "passed" || check.status === "failed");
    const coverage = actionEvidenceCoverage(workspace, sessionId);
    const agentFacing = stub ? { claimKind: "synthetic_example" as const, method: "synthetic" } : { claimKind: "self_reported" as const, method: null };
    outputs.push({ output: "review", lane: "implementation", ...agentFacing, label: `assemble review: build session ${sessionId}${stub ? " (stub provider: synthetic)" : ""}`,
      body: { taskId: view.taskId, sessionId, headEventHash: view.history.headEventHash, provider: view.provider, model: view.model, state: view.state,
        turnEndReason: view.turnEndReason, approvals: view.approvals.length } });
    outputs.push({ output: "review", lane: "implementation", ...agentFacing, ...(stub || executed.length === 0 ? {} : { method: "executed_test" }),
      label: `assemble review: validation of ${sessionId} (${view.validation.status})`, body: view.validation });
    outputs.push({ output: "review", lane: "implementation", method: null, label: `assemble review: action evidence coverage of ${sessionId}`, body: coverage });
    sessions.push({ taskId: view.taskId, sessionId, headEventHash: view.history.headEventHash, provider: view.provider, stub,
      validation: { status: view.validation.status, passed: executed.filter((check) => check.status === "passed").length,
        failed: executed.filter((check) => check.status === "failed").length },
      coverage: coverage.status === "evaluated" ? { status: coverage.status, calls: coverage.calls, linked: coverage.linked, unknown: coverage.unknown }
        : { status: coverage.status }, integrity });
  }
  let evaluation: { decision: string; canApply: boolean; added: number; changed: number; removed: number } | { error: string };
  try {
    const result = evaluateEnforceResourceLifecycle({ workspace, agentId });
    evaluation = { decision: result.decision, canApply: result.canApply, added: result.diff.added.length, changed: result.diff.changed.length, removed: result.diff.removed.length };
  } catch (error) {
    evaluation = { error: errorCodeOf(error, "ENFORCE_EVALUATION_FAILED") };
  }
  const state = projectEnforceResourceLifecycleStatus({ workspace, agentId }).state;
  const enforce = { state, ...("error" in evaluation ? { decision: "block", error: evaluation.error, pending: 0 }
    : { ...evaluation, pending: evaluation.added + evaluation.changed + evaluation.removed }) };
  outputs.push({ output: "review", lane: "implementation", method: null, label: "assemble review: Enforce evaluation of the pending changes", body: enforce });
  const anyStub = sessions.some((session) => session.stub === true);
  const capabilities = listValue(answerValues(answers).get("capabilities")).map((capability) => ({ capability,
    status: anyStub || sessions.length === 0 ? "not_evaluated" : "self_reported", reason: anyStub ? "stub provider" : sessions.length === 0 ? "no native build session" : "exercised in a build session; not evaluated" }));
  const limitations = [...(spec.unsupported as Array<{ id: string; what: string; key: string }>).map((entry) => `${entry.what} (${entry.key})`),
    ...((spec.claim as { notCovered?: string[] } | undefined)?.notCovered ?? [])];
  outputs.push({ output: "review", lane: "recommendation", ...(anyStub ? { claimKind: "synthetic_example" as const, method: "synthetic" } : { method: null }),
    label: "assemble review: capabilities and limitations, plan against built", body: { capabilities, limitations } });
  const executedAll = sessions.every((session) => (session.validation as { passed: number; failed: number }).failed === 0
    && (session.validation as { passed: number }).passed > 0);
  const unitTestsPassing = anyStub ? "not_evaluated (stub provider)" : sessions.length === 0 || !executedAll
    ? `not_evaluated (${sessions.length === 0 ? "no executed test" : "no executed test or checks failed"})` : "evidence present (advanced only by Activate's lifecycle bridge, P1-62)";
  return {
    outputs,
    notEvaluated: anyStub ? ["SYNTHETIC_VALUES", "STUB_PROVIDER"] : ["NO_OBSERVED_REF"],
    spec: { ...spec, review: { sessions, enforce, capabilities, limitations, lifecycle: { stage: "development", unitTestsPassing },
      wording: anyStub ? STUB_WORDING : null, claimBoundary: ASSEMBLE_CLAIM_BOUNDARY } }
  };
}
