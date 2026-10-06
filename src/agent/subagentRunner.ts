import { SessionService } from "../session/sessionService.js";
import { readEventPayload } from "../session/eventPayload.js";
import { deniedToolNamesForScope, intersectDelegationScopes, parseDelegationScope } from "./delegationScope.js";
import { parseSubagentStopConditions } from "./subagentStopConditions.js";
import { ApprovalSeam, type ApprovalSeamInit } from "../approvals/seam/approvalSeam.js";
import { gateToolCallsOnApproval, type ToolApprovalGateOptions } from "./approvalGate.js";
import { NO_HOOKS, type AgentLoopConfig, type LoopHookControl, type LoopHooks } from "./loopTypes.js";
import type { ActionClass } from "../types.js";
import { agentToolset } from "./agentToolset.js";
import type { ShellOptInSource } from "../sandbox/nativeShellGate.js";
import { AgentDriver } from "./agentDriver.js";
import { readAgentRunSummary } from "./runReport.js";
import type { LoopLlm, LoopRoute } from "./stepRunner.js";
import type { SubagentRunContext, SubagentRunResult, SubagentRunner } from "./subagentSpawn.js";

/**
 * The runner that actually executes a child (P6.1a).
 *
 * `spawnSubagent` owns the governance — depth, the signed packet, the evidence
 * pair, and the rule that a child is toolset-scoped as its root. This owns the
 * one remaining question: what it means to run.
 *
 * WHY THE CHILD GETS ITS OWN LLM, BUILT THE PARENT'S WAY. An earlier version of
 * this module took the parent's `LoopLlm` directly and said so in this comment.
 * That was wrong, and writing the end-to-end test is what found it: `LlmRuntime`
 * captures a session at construction and calls `prepareRequest(this.init.session,
 * …)`, so a child sharing the parent's runtime would write its `request/header`
 * and `request/response` rows into the PARENT's session — two runs interleaved in
 * one hash chain, and a child's provider traffic attributed to its parent.
 *
 * So the parent supplies `makeLlm(session)` instead: it has already composed a
 * registry, credentials and transport, and this binds them to the child's own
 * session. The child still cannot pick its own provider or route — those come
 * from the parent — but its evidence lands where it belongs.
 *
 * The route, by contrast, IS a plain value and is passed straight through. It is
 * a pinned choice, not a session-bound object.
 *
 * Either way this module never learns Cordis exists, which is what keeps it
 * outside `src/kernel/**` and legal under the architecture boundary.
 *
 * THE THREE THINGS THAT MAKE THE CHILD GOVERNED.
 *
 * 1. Its session is opened with `agentId: ctx.toolsetAgentId` — the ROOT's id.
 *    This is the one that actually closes the budget escape, because
 *    `budgetUsageSnapshot` counts spend by filtering `meta.agentId`, so every row
 *    the child writes is metered against the root rather than against a name
 *    nothing has spent under.
 * 2. Its toolset is built with the same id, so guard scopes resolve to the
 *    parent's narrowing rather than to an empty layer.
 * 3. Its session id is the one the parent already ANNOUNCED, supplied rather
 *    than generated, so `agent_delegation_started` names the session the child
 *    really wrote and the two join.
 *
 * THE GOAL ENTERS THROUGH THE INBOX AND NOWHERE ELSE. `followup()` is the only
 * call this module makes to hand the child its work, which is what "the inbox is
 * the only mailbox" has to mean in practice — not a claim in a comment but the
 * absence of any other path.
 */

export interface DriverRunnerInit {
  readonly workspace: string;
  /**
   * Builds an LLM runtime bound to the CHILD's session.
   *
   * A factory rather than a value because `LlmRuntime` captures its session at
   * construction. The parent supplies the registry, credentials and transport it
   * already composed; the child gets its own runtime over them.
   */
  readonly makeLlm: (session: SessionService) => LoopLlm;
  /** Pinned by the parent. A child does not pick its own route. */
  readonly route: LoopRoute;
  /** Recorded into the CHILD's own session before its first turn. */
  readonly systemPrompt: string;
  readonly harnessVersion: string;
  readonly compositionDigest: string;
  readonly policyDigest: string;
  /** Same per-turn ceilings as the parent; no independent child defaults. */
  readonly config?: Partial<AgentLoopConfig>;
  /** Existing policy and answerers, rebound to each actual child session. */
  readonly approvalGate?: ToolApprovalGateOptions & Pick<ApprovalSeamInit, "answerers" | "onRaised">;
  /**
   * The parent loop's hook CONTROL, inherited by every child this runner builds
   * (IMPL-3).
   *
   * Before this field existed no spawn path installed hooks on a child: the
   * root loop ran under the composed `LoopHooks` and every child ran under
   * `NO_HOOKS`, so a pre-step veto or a turn-stopping guard registered on the
   * parent simply did not apply to work the parent delegated. The child driver
   * is now built on exactly this control, and the child's own signed session
   * carries a `delegation/hook-control` audit row naming what governed it —
   * including, when this is absent, the fact that nothing did.
   *
   * Only the control half is inherited. `notify` carries no session identity,
   * so a parent's live observer would see a child's steps as its own.
   */
  readonly hookControl?: LoopHookControl;
  /** The parent's explicit shell opt-in. Absent, a child never gains an unconfined shell the parent was not given. */
  readonly unconfinedShell?: ShellOptInSource;
  /**
   * Lets a child delegate further.
   *
   * Absent means children are leaves. When present, each child's toolset carries
   * that child's own identity, which is what makes depth accumulate and
   * `maxDepth` bite on a grandchild rather than only on the first generation.
   */
  readonly grantDelegation?: {
    readonly runner: SubagentRunner;
    /** Optional additional narrowing; always intersected with the child's scope. */
    readonly delegationScope?: readonly ActionClass[];
    /** Each descendant inherits the narrower declared per-delegation limits. */
    readonly stopConditions?: readonly string[];
    readonly maxDepth?: number;
    readonly mintSessionId?: () => string;
  };
}

function descendantStopConditions(
  inherited: readonly string[] | undefined,
  configured: readonly string[] | undefined
): readonly string[] | undefined {
  if (inherited === undefined && configured === undefined) return undefined;
  const parent = parseSubagentStopConditions(inherited);
  const grant = parseSubagentStopConditions(configured);
  if (!parent.ok) throw new Error(parent.reason);
  if (!grant.ok) throw new Error(grant.reason);
  const narrower = (a: number | undefined, b: number | undefined): number | undefined =>
    a === undefined ? b : b === undefined ? a : Math.min(a, b);
  const turns = narrower(parent.maxTurns, grant.maxTurns);
  const timeout = narrower(parent.timeoutMs, grant.timeoutMs);
  return Object.freeze([
    ...(turns === undefined ? [] : [`max-turns:${turns}`]),
    ...(timeout === undefined ? [] : [`timeout-ms:${timeout}`])
  ]);
}

/**
 * The hooks a child driver runs under, and the names an auditor will read.
 *
 * ONE SOURCE FOR BOTH. The driver's hooks and the recorded `inherited` list are
 * derived from the same snapshot, so the row cannot name a control the driver
 * was not built on, and a driver cannot be built on a control the row omits.
 * Without a parent control the child runs under `NO_HOOKS` exactly as before,
 * and the row says so (`source: "none"`, `inherited: []`) rather than being
 * skipped — an absent row would be indistinguishable from a runner that
 * predates this field.
 */
function childHooks(control: LoopHookControl | undefined): { readonly hooks: LoopHooks; readonly inherited: readonly string[] } {
  if (control === undefined) return { hooks: NO_HOOKS, inherited: Object.freeze([]) };
  const preStep = control.preStep;
  const turnStopping = control.turnStopping;
  const hooks: LoopHooks = {
    preStep: (input, next) => preStep(input, next),
    turnStopping: (input) => turnStopping(input),
    notify: NO_HOOKS.notify
  };
  return { hooks: Object.freeze(hooks), inherited: Object.freeze(["preStep", "turnStopping"]) };
}

interface HookControlRecordInput {
  readonly session: SessionService;
  readonly ctx: SubagentRunContext;
  readonly inherited: readonly string[];
  readonly gate: (ToolApprovalGateOptions & Pick<ApprovalSeamInit, "answerers" | "onRaised">) | undefined;
  readonly scope: readonly ActionClass[] | undefined;
  readonly descendantScope: readonly ActionClass[] | undefined;
  readonly descendantStops: readonly string[] | undefined;
}

/**
 * Write the controls that govern this child into the CHILD's own signed session,
 * before its first turn.
 *
 * An `audit` projection row, because that is the one sanctioned way evidence
 * about a run enters the spine without widening `SessionService`. It names the
 * inherited hook control, the approval gate the child's tools are wrapped in,
 * the signed stop conditions and scope this child was declared under, and the
 * narrower descendant limits it will pass on — so an auditor reading the child
 * alone can see which controls applied, and which were absent.
 */
function recordHookControl(input: HookControlRecordInput): void {
  const { ctx, gate } = input;
  input.session.recordProjectedEvidence({ eventType: "audit", payload: "", meta: {
    kind: "delegation/hook-control", version: 1,
    source: input.inherited.length === 0 ? "none" : "parent-loop",
    inherited: [...input.inherited],
    approvalGate: gate === undefined ? null
      : { actionClass: gate.actionClass, riskTier: gate.riskTier, toolNames: gate.toolNames === undefined ? null : [...gate.toolNames] },
    stopConditions: ctx.stopConditions === undefined ? null : [...ctx.stopConditions],
    descendantStopConditions: input.descendantStops === undefined ? null : [...input.descendantStops],
    delegationScope: input.scope === undefined ? null : [...input.scope],
    descendantDelegationScope: input.descendantScope === undefined ? null : [...input.descendantScope],
    governedAs: ctx.toolsetAgentId, runAs: ctx.identity.runAs, depth: ctx.identity.depth
  } });
}

/**
 * Build the runner `spawnSubagent` calls.
 *
 * Returned as a closure rather than exported as a free function because the
 * parent's llm and route are captured once, at the point the parent knows them —
 * the same shape `agentToolset` already uses for its registry and ledger.
 */
export function createDriverRunner(init: DriverRunnerInit): SubagentRunner {
  // Snapshot operator choices once; no child or subsequent caller mutation may
  // widen an already composed run's gate, limits or descendant scope.
  const config = init.config === undefined ? undefined : { ...init.config };
  const gate = init.approvalGate === undefined ? undefined : { ...init.approvalGate,
    ...(init.approvalGate.toolNames === undefined ? {} : { toolNames: [...init.approvalGate.toolNames] }),
    ...(init.approvalGate.answerers === undefined ? {} : { answerers: [...init.approvalGate.answerers] }) };
  const grant = init.grantDelegation === undefined ? undefined : { ...init.grantDelegation,
    ...(init.grantDelegation.delegationScope === undefined ? {} : { delegationScope: [...init.grantDelegation.delegationScope] }),
    ...(init.grantDelegation.stopConditions === undefined ? {} : { stopConditions: Object.freeze([...init.grantDelegation.stopConditions]) }) };
  // The parent's control, captured once. A caller that later swaps its hooks
  // does not change what an already composed run's children run under.
  const control = init.hookControl === undefined ? undefined
    : Object.freeze({ preStep: init.hookControl.preStep, turnStopping: init.hookControl.turnStopping });

  const runChild = async function runChild(ctx: SubagentRunContext): Promise<SubagentRunResult> {
    if (ctx.signal?.aborted) return { ok: false, text: "", reason: "parent cancelled before child execution" };
    const scope = ctx.delegationScope === undefined ? undefined : [...ctx.delegationScope];
    if (scope !== undefined) {
      const parsed = parseDelegationScope(scope);
      if (!parsed.ok) return { ok: false, text: "", reason: parsed.reason };
    }
    const descendantScope = intersectDelegationScopes(scope, grant?.delegationScope);
    let descendantStops: readonly string[] | undefined;
    try { descendantStops = descendantStopConditions(ctx.stopConditions, grant?.stopConditions); }
    catch (error) { return { ok: false, text: "", reason: `child stop conditions: ${error instanceof Error ? error.message : String(error)}` }; }
    const session = new SessionService(init.workspace);
    let toolset: ReturnType<typeof agentToolset> | undefined;
    let driver: AgentDriver | undefined;
    let opened = false;
    let active = false;
    let keepAlive = false;
    let releaseRequested = false;
    let resourcesClosed = false;
    let parentCancelled = false;
    let releaseError: unknown;

    const finalize = (): void => {
      if (resourcesClosed || active) return;
      resourcesClosed = true;
      ctx.signal?.removeEventListener("abort", onParentAbort);
      try { toolset?.close(); } catch (error) { releaseError ??= error; }
      try {
        if (opened) session.close({ reason: "completed" });
        else session.disposeWithoutClosing();
      } catch (error) {
        // A failed writer remains visibly incomplete. Dispose its DB handle
        // without claiming that a refused close was a successful seal.
        releaseError ??= error;
        try { session.disposeWithoutClosing(); } catch { /* preserve original close failure */ }
      }
    };
    const release = (): void => {
      releaseRequested = true;
      ctx.signal?.removeEventListener("abort", onParentAbort);
      if (active) {
        driver?.cancel({ kind: "disposed" }, { by: "delegation-handle-close" });
        return; // The active drain owns settlement and closes resources afterward.
      }
      finalize();
      if (releaseError !== undefined) throw releaseError;
    };
    const onParentAbort = (): void => {
      if (parentCancelled || resourcesClosed) return;
      parentCancelled = true;
      releaseRequested = true;
      try { driver?.cancel({ kind: "parent" }, { by: "parent-delegation" }); }
      catch (error) { releaseError ??= error; }
      // Never close a DB underneath a live tool/approval turn. Idle continued
      // children can close immediately; a running drain does so in its finally.
      if (!active) finalize();
    };

    try {
      session.open({ sessionId: ctx.childSessionId, agentId: ctx.toolsetAgentId,
        harnessVersion: init.harnessVersion, compositionDigest: init.compositionDigest, policyDigest: init.policyDigest });
      opened = true;
      toolset = agentToolset({ workspace: init.workspace, sessionId: ctx.childSessionId,
        recorder: session, agentId: ctx.toolsetAgentId,
        ...(init.unconfinedShell === undefined ? {} : { unconfinedShell: init.unconfinedShell }),
        ...(grant === undefined ? {} : { subagents: {
          identity: ctx.identity, runner: grant.runner, session,
          ...(grant.maxDepth === undefined ? {} : { maxDepth: grant.maxDepth }),
          ...(grant.mintSessionId === undefined ? {} : { mintSessionId: grant.mintSessionId }),
          ...(descendantScope === undefined ? {} : { delegationScope: descendantScope }),
          ...(descendantStops === undefined ? {} : { stopConditions: descendantStops })
        } }) });
      if (scope !== undefined) toolset.registry.restrict({ deny: new Set(deniedToolNamesForScope(toolset.registry, scope)) });
      const systemPromptEventId = session.recordSystemPrompt(init.systemPrompt).eventId;
      const approval = gate === undefined ? undefined : new ApprovalSeam({ session, workspace: init.workspace,
        agentId: ctx.toolsetAgentId,
        ...(gate.answerers === undefined ? {} : { answerers: gate.answerers }),
        ...(gate.onRaised === undefined ? {} : { onRaised: gate.onRaised }) });
      // Inherited control, recorded before the driver exists so no turn can
      // precede the row that says what governed it. See `childHooks`.
      const { hooks, inherited } = childHooks(control);
      recordHookControl({ session, ctx, inherited, gate, scope, descendantScope, descendantStops });
      driver = new AgentDriver({ session, llm: init.makeLlm(session), route: init.route, systemPromptEventId,
        tools: approval === undefined || gate === undefined ? toolset.seam : gateToolCallsOnApproval(toolset.seam, approval, gate),
        hooks,
        ...(config === undefined ? {} : { config }) });
      // Keep this subscription for the entire continuation lifetime, not just
      // the first turn. A parent's abort permanently prevents further followups.
      ctx.signal?.addEventListener("abort", onParentAbort, { once: true });
      if (ctx.signal?.aborted) onParentAbort();
      let reported = 0;
      let completedTurns = 0;
      const drain = async (text: string): Promise<SubagentRunResult> => {
        if (releaseRequested || resourcesClosed || parentCancelled || ctx.signal?.aborted) {
          return { ok: false, text: "", reason: parentCancelled || ctx.signal?.aborted ? "parent cancelled the child" : "child has been released" };
        }
        if (active) return { ok: false, text: "", reason: "child already has an active turn" };
        active = true;
        try {
          driver!.followup(text);
          await driver!.whenIdle();
          const summary = readAgentRunSummary(init.workspace, ctx.childSessionId, driver!.status);
          const ending = summary.endings.at(-1);
          const stopped = parentCancelled || ctx.signal?.aborted
            ? "parent cancelled the child"
            : releaseRequested || driver!.status === "failed" || summary.endings.length <= completedTurns || ending?.reason !== "complete"
              ? `child turn did not complete (${ending?.reason ?? driver!.status})` : undefined;
          if (summary.unsignedRows > 0) {
            releaseRequested = true;
            return { ok: false, text: "", reason: [stopped,
              `child wrote ${summary.unsignedRows} unsigned row(s); its output has no provenance`].filter(Boolean).join("; ") };
          }
          // A stop changes settlement, not what the child already recorded.
          // Read only fresh text payloads: the terminal summary substitutes
          // missing/pruned-payload diagnostics, which are not the child's words.
          // This read-back retains the existing unsigned refusal; it is not an
          // independent signature/chain verification or a successful-task claim.
          const textBlocks = session.readEvents().filter(event => event.event_type === "assistant/block"
            && (JSON.parse(event.meta_json) as { blockKind?: unknown }).blockKind === "text");
          const fresh: string[] = [];
          const unavailable = new Set<string>();
          for (const event of textBlocks.slice(reported)) {
            const payload = readEventPayload(init.workspace, event);
            if (payload.status === "ok") fresh.push(payload.bytes.toString("utf8"));
            else unavailable.add(payload.status);
          }
          reported = textBlocks.length;
          completedTurns = summary.endings.length;
          if (stopped !== undefined || unavailable.size > 0) {
            releaseRequested = true;
            const incomplete = unavailable.size === 0 ? undefined
              : `child text payload unavailable (${[...unavailable].join(", ")}); output is incomplete`;
            return { ok: false, text: fresh.join("\n"), reason: [stopped, incomplete].filter(Boolean).join("; ") };
          }
          return { ok: true, text: fresh.join("\n") };
        } catch (error) {
          releaseRequested = true;
          throw error;
        } finally {
          active = false;
          if (releaseRequested) finalize();
          // oxlint-disable-next-line no-unsafe-finally -- A child cannot report success after its writer release failed.
          if (releaseError !== undefined) throw releaseError;
        }
      };
      const first = await drain(ctx.goal);
      if (!ctx.continuable || !first.ok || releaseRequested) return first;
      keepAlive = true;
      return { ...first, continuation: { continue: drain, close: release } };
    } finally {
      if (!keepAlive) release();
    }
  };
  // Declared, so `spawnSubagent` can tell a driver runner from one that says nothing about control.
  return Object.assign(runChild, { hookControl: (control === undefined ? "none" : "inherited") as "none" | "inherited" });
}
