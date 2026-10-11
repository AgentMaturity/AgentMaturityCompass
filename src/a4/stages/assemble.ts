/**
 * Assemble, creation (P1-60; design §10.2). Understand carries the Aspire answers it depends on and reads the
 * workspace facts a build needs (toolset readiness, the doctor's checks, the native task limits, providers and tool
 * scope from the live Studio NativeTaskService, frameworks, mechanic profiles, the compiled plan, the outcome_unknown
 * count, the path table); Explain renders them at three levels; Propose builds the plan from the answers (revised typed
 * graph with node permissions, implementation plan by executor, preset, build session, validation plan, the
 * IntegrationClaim, unsupported items with their keys (a declared workflow among them while it cannot run), and the
 * baseline Enforce manifest). Build and Review are in src/a4/assembleBuild.ts; an external path's scaffold, connect and
 * import in src/a4/assembleConnect.ts. Completion runs the effect a4.assemble.apply: the reviewed Enforce resources are applied
 * through applyEnforceResourceLifecycle after the effect gate's engine grant is consumed. Everything A4 writes here is
 * self_reported; a stub-provider session's agent-facing refs are synthetic_example.
 */
import { readFileSync } from "node:fs";
import { relative, sep } from "node:path";
import { checkToolsetReadiness } from "../../agent/agentToolset.js";
import { loadActiveCompiledPolicy, type ActiveCompiledPolicy } from "../../catalog/compiler/activate.js";
import { applyEnforceResourceLifecycle, projectEnforceResourceLifecycleStatus } from "../../enforce/resourceManifest.js";
import { typedMultiAgentGraphSchema } from "../../fleet/typedGraph.js";
import { isActionClass } from "../../governor/actionCatalog.js";
import { openLedger } from "../../ledger/ledger.js";
import { listMechanicProfiles } from "../../mechanic/profiles.js";
import { readPresets } from "../../presets/agentPresets.js";
import { nativeShellReadiness } from "../../sandbox/nativeShellGate.js";
import { listAvailableFrameworks } from "../../setup/integrationScaffold.js";
import { compiledPolicyShows } from "../../tools/guards/compiledPolicyGuard.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import type { WorkflowNode } from "../../workflow/workflowPlan.js";
import type { A4EffectContext, A4EffectDef, A4EffectOutcome } from "../a4Effects.js";
import { explain, type A4ExplainFact, type A4ExplainLevel } from "../a4Explain.js";
import { RESOURCE_SLOTS } from "../a4Gates.js";
import type { A4GateRow } from "../a4Readiness.js";
import type { A4ProducerContext, A4ProducerResult } from "../a4RouterStages.js";
import type { A4Answer, A4StageRegistry } from "../a4Schema.js";
import { A4StoreError } from "../a4Store.js";
import { INTEGRATION_CLAIMS, integrationClaimFor, SCAFFOLD_FRAMEWORK } from "../assemblePaths.js";
import { buildAssemble, nativeActor, reviewAssemble } from "../assembleBuild.js";
import { blockingExecutionsIn } from "../assembleLockout.js";
import { errorCodeOf } from "../aspireUnderstand.js";
import {
  APPLY_EFFECT_ID, ASSEMBLE_CLAIM_BOUNDARY, ASSEMBLE_SPEC_SCHEMA, CARRIED, answerGaps, assembleItems, assembleSpecOf, carriedValues, parseProvider, presetIdOf,
  workflowPlanOf
} from "../spec/assemble.js";
import { answersDigestOf, answerValues, aspireSpecOf, dependencyDigest, listValue, textValue } from "../spec/aspire.js";

const fail = (status: number, code: string, message: string, detail?: unknown): A4StoreError => new A4StoreError(status, code, message, detail);
const relPath = (workspace: string, path: string): string => relative(workspace, path).split(sep).join("/");

/** The agent's preset as a verified read of the signed presets file gives it; null when it has none; unreadable throws. */
function presetSha256(workspace: string, agentId: string): string | null {
  const read = readPresets(workspace);
  if (!read.ok) throw fail(409, "RESOURCE_UNREADABLE", "composition.presetSha256: the workspace presets file does not verify or parse");
  const preset = read.presets.find((one) => one.id === presetIdOf(agentId));
  return preset === undefined ? null : sha256Hex(canonicalize(preset));
}

/**
 * Readiness items, the preset slot and the completion effect. `enforce.resourcesSha256` is Aspire's recomputer (P1-59),
 * reused: RESOURCE_SLOTS assignment overwrites, so Assemble never assigns it.
 */
export function register(registry: A4StageRegistry): void {
  registry.items.push(assembleItems);
  RESOURCE_SLOTS["composition.presetSha256"] = presetSha256;
  registry.registerEffect(APPLY_EFFECT);
}

/** The Enforce resource set the completion gate bound (`enforce.resourcesSha256`), as its manifest id; null when unbound. */
function boundManifestId(gate: A4GateRow): string | null {
  const bound = (JSON.parse(gate.intent_json) as { resourceDigests?: Record<string, string | null> }).resourceDigests?.["enforce.resourcesSha256"];
  return typeof bound === "string" && /^[0-9a-f]{64}$/.test(bound) ? `enforce-resources-${bound.slice(0, 16)}` : null;
}

/**
 * The completion effect (design §6.1 table, §10.2): after the engine grant is consumed (step 0) and the runner's preamble
 * re-read the freeze and recomputed every bound slot, the bound resource set is applied as the agent's active Enforce
 * manifest with a signed receipt. `confirmManifestId` is the bound set's id, so a set that moved after the preamble is
 * refused by Enforce under its own lock. A failure is recorded by its code; retry re-runs it under design §6.5.
 */
async function applyManifest({ workspace, state, gate }: A4EffectContext): Promise<A4EffectOutcome> {
  try {
    const confirmManifestId = boundManifestId(gate);
    if (confirmManifestId === null) throw fail(409, "MANIFEST_NOT_BOUND", "The completion gate bound no Enforce resource set.");
    const result = applyEnforceResourceLifecycle({ workspace, agentId: state.project.agent_id, dryRun: false, confirmManifestId });
    if (!result.applied || result.receiptPath === null) throw fail(409, "APPLY_NOT_RECORDED", "Enforce applied nothing.");
    const receipt = readFileSync(result.receiptPath);
    // An artifact ref: resolveRefs verifies the receipt's bytes and its artifact signature on every read.
    return { receipt: { refKind: "artifact", refId: relPath(workspace, result.receiptPath), sha256: sha256Hex(receipt),
      label: `assemble completion: Enforce manifest ${confirmManifestId} applied (${result.receiptSigPath === null ? "receipt unsigned" : "signed receipt"})` } };
  } catch (error) {
    // EFFECT_FAILED stores the message: a code only (messages name absolute paths).
    throw new Error(errorCodeOf(error, "ASSEMBLE_APPLY_FAILED"));
  }
}
/** The execution id names the gate as well as the set: the same resource set applied again in a later cycle is a new execution, retryable on its own. */
const APPLY_EFFECT: A4EffectDef = { id: APPLY_EFFECT_ID, toolName: "a4.assemble.apply_manifest", actionClass: "WRITE_HIGH", consumes: "A4",
  completes: "assemble.completion", executionId: (_state, gate) => `a4-apply-${gate.gate_id}-${boundManifestId(gate) ?? "unbound"}`, run: applyManifest };

/** The router's entry (src/a4/spec/assemble.ts PRODUCERS). */
export async function produceAssemble(step: "understand" | "explain" | "propose" | "build" | "review", ctx: A4ProducerContext): Promise<A4ProducerResult> {
  if (step === "understand") return understand(ctx);
  if (step === "explain") return explainStep(ctx);
  if (step === "propose") return propose(ctx);
  if (step === "build") return buildAssemble(ctx);
  return reviewAssemble(ctx);
}

/** One reader's answer, or the error's code: a fact that cannot be read is recorded as such, never as "fine". */
function attempt<T>(read: () => T): T | { error: string } {
  try {
    return read();
  } catch (error) {
    return { error: errorCodeOf(error, "UNREADABLE") };
  }
}

/**
 * C6: whether the active compiled plan shows the `workflow` tool (P1-12's default visibleTools omits it), with the
 * runtime's own denial (compiledPolicyDenial) and the plan's controls compiled at the tool pipeline.
 */
function workflowVisibility(policy: ActiveCompiledPolicy) {
  if (compiledPolicyShows(policy, "workflow")) return { visible: true, revision: policy.revision };
  return { visible: false, revision: policy.revision, policyDigest: policy.runtimePolicy.policyDigest,
    denial: "compiled policy denied this call (toolPipeline.visibleTools): \"workflow\" is not a visible tool",
    controlIds: policy.controls.filter((control) => control.compiledPoints.includes("tool_pipeline")).map((control) => control.controlId).slice(0, 32) };
}

/** Understand's facts: compact values for the spec (read by readiness and Propose) and one self_reported output each. */
async function understandFacts(ctx: A4ProducerContext) {
  const { workspace } = ctx;
  const agentId = ctx.state.project.agent_id;
  const toolset = attempt(() => {
    const readiness = checkToolsetReadiness(workspace);
    return { ready: readiness.ready, blockers: readiness.blockers.slice(0, 16).map((line) => line.slice(0, 300)) };
  });
  const { runDoctorRules } = await import("../../doctor/doctorRules.js");
  const { firstRunFixCommands } = await import("../../doctor/firstRunPlan.js");
  const report = await runDoctorRules(workspace);
  const attention = report.checks.filter((check) => check.status === "FAIL" || check.status === "WARN");
  // Credentials are described by reference and `configured`, never resolved (the native service's own projection).
  let nativeError: string | null = ctx.native === undefined ? "NATIVE_TASKS_UNAVAILABLE" : null;
  const configuration = ctx.native === undefined ? null : await ctx.native.service.configuration(nativeActor(ctx.native, agentId)).catch((error: unknown) => {
    nativeError = errorCodeOf(error, "NATIVE_TASKS_UNAVAILABLE");
    return null;
  });
  const native = configuration === null ? null : {
    providers: configuration.providers.map((provider) => ({ id: provider.id, local: provider.local, model: provider.model,
      configured: provider.credential === null || provider.credential.configured, credentialRef: provider.credential?.ref ?? null })),
    scope: { ready: configuration.scope.ready, digest: configuration.scope.digest, message: configuration.scope.message.slice(0, 300),
      tools: configuration.scope.tools.map((tool) => ({ name: tool.name, actionClass: tool.actionClass })) },
    limits: configuration.limits,
    validation: { ready: configuration.validation.ready, configSha256: configuration.validation.configSha256, checks: configuration.validation.checks.map((check) => check.id) },
    shellOptIn: ctx.native?.service.shellOptIn ?? null
  };
  const outcomeUnknown = attempt(() => {
    const ledger = openLedger(workspace, { readonly: true });
    try {
      return blockingExecutionsIn(ledger.db, workspace, agentId);
    } finally {
      ledger.close();
    }
  });
  const baseline = attempt(() => projectEnforceResourceLifecycleStatus({ workspace, agentId }).state);
  const compiled = attempt(() => loadActiveCompiledPolicy(workspace));
  // The runtime's own shell decision, with the live service's opt-in (Studio's native task options route reads the same).
  const shell = attempt(() => {
    const readiness = nativeShellReadiness(workspace, ctx.native?.service.shellOptIn ?? undefined);
    return { decision: readiness.decision, boundary: readiness.boundary, enforcement: readiness.enforcement, reason: readiness.reason?.slice(0, 500) ?? null };
  });
  const facts = {
    toolset, doctor: { ok: report.ok, attention: attention.map((check) => check.id) }, native, platform: process.platform, shell,
    frameworks: listAvailableFrameworks().map((framework) => framework.id), mechanicProfiles: attempt(() => listMechanicProfiles(workspace).map((profile) => profile.id)),
    compiledPolicy: compiled === null ? "none" : "error" in compiled ? compiled : "active",
    workflowTool: compiled === null ? { visible: true, revision: null } : "error" in compiled ? compiled : workflowVisibility(compiled),
    outcomeUnknown: Array.isArray(outcomeUnknown) ? outcomeUnknown.length : outcomeUnknown, baseline,
    paths: Object.values(INTEGRATION_CLAIMS).map(({ path, enforcementBoundary, evidenceTier, supported, reason }) => ({ path, enforcementBoundary, evidenceTier, supported, reason }))
  };
  const output = (label: string, body: unknown, lane: "implementation" | "recommendation" = "implementation") =>
    ({ output: "understanding", label: `assemble understand: ${label}`, lane, method: null, body });
  return { facts, outputs: [
    output("tool pipeline readiness (checkToolsetReadiness)", toolset),
    output("doctor checks needing attention, with first-run fixes", { ok: report.ok, attention: attention.map(({ id, status, message }) => ({ id, status, message })),
      fixes: firstRunFixCommands(report) }),
    output("native task providers, tool scope, limits and validation config (the live Studio service)", native ?? { error: nativeError }),
    output("the native shell gate (nativeShellReadiness)", shell),
    output("integration frameworks, mechanic profiles, the compiled plan and whether it shows the workflow tool", { frameworks: facts.frameworks,
      mechanicProfiles: facts.mechanicProfiles, compiledPolicy: facts.compiledPolicy, workflowTool: facts.workflowTool }),
    output("outcome_unknown executions blocking this agent", { executions: outcomeUnknown }),
    output("Enforce resource state", { state: baseline }),
    output("integration paths and what each can claim (IntegrationClaim)", Object.values(INTEGRATION_CLAIMS), "recommendation")
  ] };
}

/** Understand: the carried Aspire answers and the facts; nothing proposes until a person confirms it. */
async function understand(ctx: A4ProducerContext): Promise<A4ProducerResult> {
  const { spec, answers } = assembleSpecOf(ctx.state);
  const carried = carriedValues(ctx.state);
  const revisionNo = ctx.state.project.revision_no + 1;
  const kept = answers.filter((answer) => !(CARRIED as readonly string[]).includes(answer.questionId));
  const values = answerValues(kept);
  for (const [id, value] of carried) values.set(id, value);
  const carriedAnswers: A4Answer[] = [...carried].map(([questionId, value]) => ({ questionId, value, source: "carried", answeredAtRevision: revisionNo,
    dependencyDigest: dependencyDigest([], values) }));
  const merged = [...kept, ...carriedAnswers].sort((a, b) => a.questionId.localeCompare(b.questionId));
  const { facts, outputs } = await understandFacts(ctx);
  const understanding = { answersDigest: answersDigestOf(merged), carried: [...carried.keys()], facts };
  return { outputs, spec: { ...spec, answers: merged, understanding }, response: { understanding } };
}

type Facts = Awaited<ReturnType<typeof understandFacts>>["facts"];
const factsOf = (spec: Record<string, unknown>): Partial<Facts> => ((spec.understanding as { facts?: Partial<Facts> } | undefined)?.facts ?? {});

/** Assemble's explanation facts (design §10.2 Explain). */
export function assembleFacts(spec: Record<string, unknown>, answers: readonly A4Answer[]): A4ExplainFact[] {
  const values = answerValues(answers);
  const facts = factsOf(spec);
  const claim = integrationClaimFor(textValue(values.get("path")));
  const limits = facts.native?.limits;
  const open = typeof facts.outcomeUnknown === "number" ? facts.outcomeUnknown : null;
  const workflow = workflowPlanOf(values.get("workflow"), values.get("autonomy"));
  const hidden = facts.workflowTool !== undefined && "denial" in facts.workflowTool ? facts.workflowTool : null;
  const shell = facts.shell !== undefined && !("error" in facts.shell) ? facts.shell : null;
  return [
    { id: "enforced-vs-advisory", sources: ["compiledPolicyGuard", "bindAuthorization", "recheckAuthorization", "openActionJournal", "writeEffectivePolicyReceipt"], dataStatus: null,
      novice: "On AMC's own runtime every action the agent tries goes through AMC first: AMC can stop it, asks for approval when the rules say so, and keeps a record. Anything outside that runtime AMC can only advise on.",
      practitioner: "Enforced at the tool pipeline: the compiled policy guard, the authorization bound before a call and re-checked before dispatch, the action journal and the effective-policy receipt. Advisory: anything the agent does outside the native runtime.",
      expert: "agentToolset → compiledPolicyGuard.approvalDenial → bindAuthorization/recheckAuthorization (src/actions/authorize.ts) → openActionJournal (journaled above WRITE_LOW) → writeEffectivePolicyReceipt." },
    { id: "lockout", sources: ["openActionJournal.blockingExecutions", "requestManualResolution", "resolveManually"], dataStatus: null,
      novice: `If an action stops halfway, AMC does not guess whether it happened: the agent is paused until a person says what happened and someone else approves that statement.${open ? ` ${open} such action(s) are open now.` : ""}`,
      practitioner: "A cancelled or failed journaled call above WRITE_LOW leaves outcome_unknown and blocks the agent's journaled calls. Clear it from the outcome_unknown card: request a resolution, a second person approves it, then it is recorded as the operator's statement (self-reported).",
      expert: "blockingExecutions({ workspaceId, agentId }) → requestManualResolution (amc.action.resolve, dual control per the class rule) → decideApprovalInStudio bound to the request digest → resolveManually (SELF_REPORTED)." },
    { id: "limits", sources: ["NativeTaskService.configuration().limits"], dataStatus: null,
      novice: "Each build session is small on purpose: a few steps and a short answer per turn. A bigger build is done in more turns, never with bigger limits.",
      practitioner: limits ? `Per turn: ${limits.maxSteps} steps and ${limits.maxTokens} tokens; ${limits.maxActive} active sessions across Studio; ${Math.round(limits.lifetimeMs / 60_000)} minutes per session, ${Math.round(limits.idleTimeoutMs / 60_000)} idle.` : "Native task limits were not readable (Understand runs from Studio).",
      expert: "LIMITS in src/studio/nativeTaskService.ts are never raised by A4; Build chunks work into turns of at most maxSteps." },
    { id: "path", sources: ["src/a4/assemblePaths.ts", "design §13"], dataStatus: null,
      novice: claim ? `You chose ${claim.path}: AMC ${claim.supported === "supported" ? "builds and controls it" : `can only ${claim.supported === "preview" ? "partly" : "not yet"} support it`} (${claim.reason ?? "fully supported"}).` : "No engineering path is chosen yet.",
      practitioner: claim ? `${claim.path}: enforcement boundary ${claim.enforcementBoundary}, evidence ${claim.evidenceTier}, ${claim.supported}${claim.reason ? ` (${claim.reason})` : ""}. Not covered: ${claim.notCovered.join("; ")}.` : "No path chosen.",
      expert: claim ? `IntegrationClaim ${JSON.stringify({ path: claim.path, enforcementBoundary: claim.enforcementBoundary, supported: claim.supported })}; enforced only for hook:*/pi:* with a conformance receipt for the pinned version.` : "integrationClaimFor(null) = null." },
    { id: "shell", sources: ["nativeShellReadiness", "decideNativeShell", "src/sandbox/nativeShellGate.ts"], dataStatus: null,
      novice: shell === null ? "AMC has not read how this computer runs the agent's shell commands: run Understand."
        : shell.decision === "confined" ? `On this computer the agent's shell commands run inside AMC's sandbox (${String(shell.boundary)}).`
          : shell.decision === "unconfined-opt-in" ? "On this computer the agent's shell commands run with no sandbox and your full user rights: the operator chose that when starting Studio."
            : "On this computer AMC does not run the agent's shell commands: no sandbox is available here.",
      practitioner: shell === null ? `The shell gate was not read (${facts.shell !== undefined && "error" in facts.shell ? facts.shell.error : "Understand has not run"}).`
        : `Platform ${String(facts.platform ?? "unknown")}: shell ${shell.decision}, boundary ${shell.boundary ?? "none"}, enforcement ${shell.enforcement}.${shell.reason === null ? "" : ` ${shell.reason}`}`,
      expert: "decideNativeShell: confined by linux-bwrap on Linux and macos-seatbelt on macOS; refused when no backend is available (never an unconfined Linux shell; always refused on Windows and other platforms); enforcement none only under the macOS unconfined opt-in, which is the operator's environment at Studio start (AMC_UNSAFE_UNCONFINED_SHELL=1), never a request field." },
    { id: "stub", sources: ["design §10.1 keyless first run"], dataStatus: null,
      novice: "Without an AI key the build session uses a stand-in model. That shows how AMC records actions, not how good your agent is.",
      practitioner: "On the stub provider every ref about the agent is synthetic_example, and the review says \"tool pipeline observed on a stub model; agent behaviour not evaluated\". Review itself records no observed ref on any provider: it does not yet reference the session's runtime-written rows (ACTION_STATE, effective-policy receipts) as ledger refs (NO_OBSERVED_REF on a real provider); a member can add such a row by reference through the evidence route.",
      expert: "Stub sessions: claimKind synthetic_example (method synthetic, reason SYNTHETIC_VALUES, lane implementation); verifyAgentRun is an integrity-section item; Review writes stage outputs only, no ledger_event ref to the session's runtime rows (NO_OBSERVED_REF)." },
    ...(workflow === null ? [] : [{ id: "workflow", sources: ["parseWorkflowPlan", "runWorkflowPlan", "spawnSubagent", "compiledPolicyShows"], dataStatus: null,
      novice: "A workflow splits the work across helper agents. AMC checks the plan you declared, but cannot run it from Studio yet: Studio's build sessions cannot start helper agents.",
      practitioner: `A declared workflow runs only through the agent's workflow tool, where each helper starts through spawnSubagent (depth limit, signed handoff packet, declared scope, a started/completed pair). Studio's native build sessions compose no delegation, so the workflow stays listed as unsupported until they do${hidden ? `; the active compiled plan (revision ${hidden.revision}) also hides the workflow tool` : ""}.`,
      expert: `workflowTool → parseWorkflowPlan → runWorkflowPlan → spawnSubagent per agent node; Studio native tasks (acpNativeSession → openAgentSession) compose no subagents capability (NATIVE_TASKS_NO_DELEGATION); once a plan is active, P1-12's default visibleTools omits workflow (C6)${hidden ? `: ${hidden.denial}` : ""}.` }])
  ];
}

/**
 * The `workflow` executor's task (design §10.2, C6). A declared workflow runs only through the agent's workflow tool,
 * each agent node through spawnSubagent (depth refusal, signed handoff packet, declared scope, a started/completed
 * pair), never as sessions A4 starts on its own. It is listed with every reason it cannot run, never silently skipped:
 * the active compiled plan hiding the tool (C6, with the runtime's denial and the plan's tool-pipeline controls; an
 * unread or unreadable plan counts as hiding it), and Studio's native tasks composing no delegation, so nothing in
 * Studio can run it (NATIVE_TASKS_NO_DELEGATION, a seam of the native task lane).
 * ponytail: unsupported until a native task can be granted `subagents`; Build then runs it before plan activation.
 */
function workflowTask(workflow: { plan: WorkflowNode; agents: number }, tool: Partial<Facts>["workflowTool"], native: boolean) {
  const denial = tool !== undefined && "denial" in tool ? tool : null;
  const policy = tool === undefined ? ["COMPILED_POLICY_NOT_READ"] : "error" in tool ? ["COMPILED_POLICY_UNREADABLE"] : denial !== null ? ["C6_COMPILED_POLICY_DENIES"] : [];
  const blockers = [...(native ? [] : ["NATIVE_PATH_ONLY"]), ...policy, "NATIVE_TASKS_NO_DELEGATION"];
  return { id: "workflow", title: `Run the declared workflow ${workflow.plan.id}: ${workflow.agents} delegated task(s), each through spawnSubagent`,
    executor: "workflow", supported: false, key: blockers[0]!, blockers, plan: workflow.plan, agents: workflow.agents, compiledPolicy: denial,
    acceptance: "every agent node reports through spawnSubagent (depth refusal, signed handoff packet, declared scope, a started/completed pair)",
    expectedEvidence: "the parent session's delegation-started/completed rows and each child's own session" };
}

/** Explain: the facts once, rendered at the member's level; all three renderings are kept. */
function explainStep(ctx: A4ProducerContext): A4ProducerResult {
  const level: A4ExplainLevel = ctx.level ?? "practitioner";
  const { spec, answers } = assembleSpecOf(ctx.state);
  const facts = assembleFacts(spec, answers);
  const items = explain(facts, level);
  return { outputs: [{ output: "explanation", label: `assemble explain at the ${level} level`, lane: "recommendation", method: null, body: { level, items } }],
    spec: { ...spec, explanation: { level, facts } }, response: { explanation: { level, items } } };
}

/** Aspire's typed-graph draft with the agent node's permissions and capabilities for this plan. */
function revisedGraph(ctx: A4ProducerContext, tools: "none" | "workspace", scopeTools: ReadonlyArray<{ actionClass: string }>, capabilities: readonly string[]) {
  const parsed = typedMultiAgentGraphSchema.safeParse(aspireSpecOf(ctx.state).spec.graph);
  if (!parsed.success) throw fail(409, "A4_NOT_READY", "Aspire's solution sketch is not a typed multi-agent graph; reopen Aspire.", { reasonCodes: ["TYPED_GRAPH_INVALID"] });
  const permissions = tools === "none" ? ["READ_ONLY"] : [...new Set(["READ_ONLY", ...scopeTools.map((tool) => tool.actionClass).filter(isActionClass)])];
  return typedMultiAgentGraphSchema.parse({ ...parsed.data, createdAt: new Date(ctx.now).toISOString(),
    nodes: parsed.data.nodes.map((node) => node.nodeId === "agent" ? { ...node, permissions, description: capabilities.join("; ").slice(0, 2000) || node.description } : node) });
}

/**
 * Propose: the plan from the answers and Understand's facts (no part is edited by hand; change the answers instead), and
 * the baseline: the agent's Enforce state now, which must be ACTIVE and is checked against what the revision binds.
 */
function propose(ctx: A4ProducerContext): A4ProducerResult {
  const { workspace } = ctx;
  const { spec, answers } = assembleSpecOf(ctx.state);
  const gaps = answerGaps(answers, carriedValues(ctx.state));
  const codes = [...gaps.missing.map((id) => `ANSWER_MISSING:${id}`), ...gaps.stale.map((id) => `ANSWER_STALE:${id}`), ...gaps.invalid.map((id) => `ANSWER_INVALID:${id}`),
    ...gaps.carried];
  if (codes.length > 0) throw fail(409, "A4_NOT_READY", "Answer or confirm the listed questions before proposing.", { reasonCodes: codes });
  for (const key of Object.keys(ctx.spec ?? {})) {
    if (canonicalize(ctx.spec![key] ?? null) !== canonicalize(spec[key] ?? null)) {
      throw fail(400, "INPUT_INVALID", `${key} is built from your answers; change the answers instead.`);
    }
  }
  const agentId = ctx.state.project.agent_id;
  const values = answerValues(answers);
  const facts = factsOf(spec);
  const claim = integrationClaimFor(textValue(values.get("path")))!;
  const native = claim.path === "native";
  const tools = textValue(values.get("autonomy")) === "act_with_approval" ? "workspace" : "none";
  const provider = parseProvider(values.get("providers"))!;
  const config = facts.native ?? null;
  if (native && config === null) {
    throw fail(409, "A4_NOT_READY", "The native path needs Studio's native task service: run Understand from Studio.", { reasonCodes: ["NATIVE_TASKS_UNAVAILABLE"] });
  }
  if (native && !config!.providers.some((offered) => offered.id === provider.provider)) {
    throw fail(409, "A4_NOT_READY", `Studio does not offer the provider ${provider.provider}.`, { reasonCodes: ["ANSWER_INVALID:providers"] });
  }
  const capabilities = listValue(values.get("capabilities"));
  const scopeTools = config?.scope.tools ?? [];
  const checkIds = listValue(values.get("validation"));
  const limits = config?.limits ?? null;
  const brief = (aspireSpecOf(ctx.state).spec.brief ?? {}) as { agentName?: unknown };
  const agentName = typeof brief.agentName === "string" ? brief.agentName : agentId;
  const prompt = [`You are ${agentName}, an agent being assembled in AMC.`, "Show, step by step, how you would do each of these, using only the tools you are given:",
    ...capabilities.map((capability) => `- ${capability}`)].join("\n").slice(0, 4000);
  const declared = workflowPlanOf(values.get("workflow"), values.get("autonomy"));
  const workflow = declared === null || "error" in declared ? null : workflowTask(declared, facts.workflowTool, native);
  const chosenTools = listValue(values.get("tools"));
  const framework = SCAFFOLD_FRAMEWORK[claim.path];
  const unsupported = [
    // A foreign child runs only under spawnSubagent from a parent session; Studio's native tasks compose no delegation.
    ...(native ? [] : [{ id: "foreign-first-task", what: "one bounded first task through createForeignRunner (a foreign child runs only under spawnSubagent from a parent session)",
      key: "NATIVE_TASKS_NO_DELEGATION" }]),
    ...listValue(values.get("connectors")).map((name) => ({ id: `connector:${name.slice(0, 64)}`, what: `MCP connector ${name}`, key: "NOT_MOUNTED_IN_NATIVE_TASKS" })),
    ...chosenTools.filter((name) => !scopeTools.some((tool) => tool.name === name))
      .map((name) => ({ id: `tool:${name.slice(0, 64)}`, what: `tool ${name}`, key: "NOT_IN_SIGNED_SCOPE" })),
    // The session, the preset and the graph's permissions all take the whole signed scope: a narrower list is not enforced.
    ...(tools === "workspace" && chosenTools.length > 0 && scopeTools.some((tool) => !chosenTools.includes(tool.name))
      ? [{ id: "tool-subset", what: `the listed tools (${chosenTools.length}) are not enforced as a subset: the graph's permissions and the build session take all ${scopeTools.length} tools of the signed scope`,
        key: "NATIVE_TASKS_WHOLE_SCOPE" }] : []),
    ...checkIds.filter((id) => !(config?.validation.checks ?? []).includes(id)).map((id) => ({ id: `check:${id.slice(0, 64)}`, what: `validation check ${id}`, key: "NOT_IN_VALIDATION_CONFIG" })),
    ...(workflow === null ? [] : [{ id: "workflow", what: `workflow ${workflow.plan.id} (${workflow.agents} delegated task(s))`, key: workflow.key }])
  ];
  const plan = [
    { id: "graph", title: "Write the revised typed multi-agent graph (node permissions)", executor: "deterministic", supported: true, key: null,
      acceptance: "graph.typedGraphDigest recomputes to the written graph", expectedEvidence: "implementation ref with the graph file's sha256" },
    ...(native ? [
      { id: "preset", title: `Sign the agent's preset ${presetIdOf(agentId)} into .amc/agents.yaml`, executor: "deterministic", supported: true, key: null,
        acceptance: "composition.presetSha256 recomputes to the signed preset", expectedEvidence: "implementation ref with the preset's sha256" },
      { id: "first-turn", title: "One bounded native build session on the chosen provider", executor: "native_turn", supported: true, key: null, prompt,
        acceptance: "the session settles; Review verifies it", expectedEvidence: "session ref with its head event hash (synthetic_example on the stub provider)" }
    ] : [
      ...(framework === undefined ? [] : [{ id: "scaffold", title: `Scaffold the ${claim.path} agent: the ${framework} scaffold, contract tests and the policy pack, into a directory you name outside .amc/`,
        executor: "scaffold", supported: true, key: null, acceptance: "the recorded manifest names every written file's sha256", expectedEvidence: "a manifest ref (self_reported)" }]),
      { id: "connect", title: "Connect instructions: the gateway route, the command and a lease whose token is shown once and never stored (its leaseId is recorded)",
        executor: "deterministic", supported: true, key: null, acceptance: "the record keeps the leaseId, never the token", expectedEvidence: "an external ref naming the lease (self_reported)" },
      { id: "import", title: "Import the agent's traces through the neutral importer, originals retained", executor: "deterministic", supported: true, key: null,
        acceptance: "the import's manifest is recorded; imported traces stay self_reported", expectedEvidence: "a manifest ref (self_reported)" },
      { id: "first-task", title: "One bounded first task, run by you under supervision (createForeignRunner is listed as unsupported)", executor: "human", supported: true, key: null,
        command: `amc supervise --agent ${agentId} -- <your agent's one-shot command>`, acceptance: "you run it; AMC never does", expectedEvidence: "the supervised session's own rows" }
    ]),
    ...(workflow === null ? [] : [workflow]),
    { id: "review-resources", title: "Review the agent's pending Enforce changes", executor: "human", supported: true, key: null,
      command: `amc resource evaluate --agent ${agentId}`, acceptance: "Review records Enforce's decision", expectedEvidence: "Review's Enforce record" }
  ];
  const status = attempt(() => projectEnforceResourceLifecycleStatus({ workspace, agentId }));
  const baseline = "error" in status ? { state: "UNREADABLE", manifestId: null, resourcesSha256: null, nextAction: null }
    : { state: status.state, manifestId: status.active?.manifestId ?? null, resourcesSha256: status.active?.resourcesSha256 ?? null, nextAction: status.nextAction };
  const { build: _build, review: _review, ...carried } = spec;
  const next = { ...carried, answers, schema: ASSEMBLE_SPEC_SCHEMA, answersDigest: answersDigestOf(answers), path: claim.path, claim,
    graph: revisedGraph(ctx, tools, scopeTools, capabilities),
    preset: native ? { id: presetIdOf(agentId), description: `A4 Assemble preset for agent ${agentId}`, model: provider.model ?? "stub", providerId: provider.provider,
      maxSteps: limits?.maxSteps ?? 8, maxTokens: limits?.maxTokens ?? 1024, tools, toolMode: "native" } : null,
    session: native ? { provider: provider.provider, model: provider.model, tools, toolsDigest: tools === "workspace" ? config!.scope.digest : null,
      maxSteps: limits?.maxSteps ?? 8, maxTokens: limits?.maxTokens ?? 1024 } : null,
    plan, unsupported,
    resourcePlan: { kinds: ["graph"], note: "A build session with workspace tools may change any resource its signed scope allows; Review lists Enforce's diff." },
    validationPlan: { checkIds, configSha256: checkIds.length > 0 ? config?.validation.configSha256 ?? null : null },
    notes: { existingSystems: listValue(values.get("existingSystems")), budget: textValue(values.get("budget")) },
    baseline, claimBoundary: ASSEMBLE_CLAIM_BOUNDARY };
  return { outputs: [{ output: "plan", label: "assemble propose: the plan (AMC's draft from your answers)", lane: "recommendation", method: null,
    body: { path: claim.path, plan, unsupported, baseline } }], spec: next };
}
