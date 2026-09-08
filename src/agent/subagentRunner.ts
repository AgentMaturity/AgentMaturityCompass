import { SessionService } from "../session/sessionService.js";
import { deniedToolNamesForScope, intersectDelegationScopes, parseDelegationScope } from "./delegationScope.js";
import { ApprovalSeam, type ApprovalSeamInit } from "../approvals/seam/approvalSeam.js";
import { gateToolCallsOnApproval, type ToolApprovalGateOptions } from "./approvalGate.js";
import type { AgentLoopConfig } from "./loopTypes.js";
import type { ActionClass } from "../types.js";
import { agentToolset } from "./agentToolset.js";
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
    readonly maxDepth?: number;
    readonly mintSessionId?: () => string;
  };
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
    ...(init.grantDelegation.delegationScope === undefined ? {} : { delegationScope: [...init.grantDelegation.delegationScope] }) };

  return async function runChild(ctx: SubagentRunContext): Promise<SubagentRunResult> {
    if (ctx.signal?.aborted) return { ok: false, text: "", reason: "parent cancelled before child execution" };
    const scope = ctx.delegationScope === undefined ? undefined : [...ctx.delegationScope];
    if (scope !== undefined) {
      const parsed = parseDelegationScope(scope);
      if (!parsed.ok) return { ok: false, text: "", reason: parsed.reason };
    }
    const descendantScope = intersectDelegationScopes(scope, grant?.delegationScope);
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
        ...(grant === undefined ? {} : { subagents: {
          identity: ctx.identity, runner: grant.runner, session,
          ...(grant.maxDepth === undefined ? {} : { maxDepth: grant.maxDepth }),
          ...(grant.mintSessionId === undefined ? {} : { mintSessionId: grant.mintSessionId }),
          ...(descendantScope === undefined ? {} : { delegationScope: descendantScope })
        } }) });
      if (scope !== undefined) toolset.registry.restrict({ deny: new Set(deniedToolNamesForScope(toolset.registry, scope)) });
      const systemPromptEventId = session.recordSystemPrompt(init.systemPrompt).eventId;
      const approval = gate === undefined ? undefined : new ApprovalSeam({ session, workspace: init.workspace,
        agentId: ctx.toolsetAgentId,
        ...(gate.answerers === undefined ? {} : { answerers: gate.answerers }),
        ...(gate.onRaised === undefined ? {} : { onRaised: gate.onRaised }) });
      driver = new AgentDriver({ session, llm: init.makeLlm(session), route: init.route, systemPromptEventId,
        tools: approval === undefined || gate === undefined ? toolset.seam : gateToolCallsOnApproval(toolset.seam, approval, gate),
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
          if (parentCancelled || ctx.signal?.aborted || releaseRequested || driver!.status === "failed"
              || summary.endings.length <= completedTurns || ending?.reason !== "complete") {
            releaseRequested = true;
            return { ok: false, text: "", reason: parentCancelled || ctx.signal?.aborted
              ? "parent cancelled the child" : `child turn did not complete (${ending?.reason ?? driver!.status})` };
          }
          if (summary.unsignedRows > 0) {
            releaseRequested = true;
            return { ok: false, text: "", reason: `child wrote ${summary.unsignedRows} unsigned row(s); its output has no provenance` };
          }
          const fresh = summary.assistantText.slice(reported);
          reported = summary.assistantText.length;
          completedTurns = summary.endings.length;
          return { ok: true, text: fresh.join("\n") };
        } catch (error) {
          releaseRequested = true;
          throw error;
        } finally {
          active = false;
          if (releaseRequested) finalize();
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
}
