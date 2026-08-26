import { SessionService } from "../session/sessionService.js";
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
  /**
   * Lets a child delegate further.
   *
   * Absent means children are leaves. When present, each child's toolset carries
   * that child's own identity, which is what makes depth accumulate and
   * `maxDepth` bite on a grandchild rather than only on the first generation.
   */
  readonly grantDelegation?: {
    readonly runner: SubagentRunner;
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
  return async function runChild(ctx: SubagentRunContext): Promise<SubagentRunResult> {
    const session = new SessionService(init.workspace);
    const toolset = agentToolset({
      workspace: init.workspace,
      // The root's id. Never ctx.identity.runAs — see subagentSpawn.ts.
      agentId: ctx.toolsetAgentId,
      // A child that can itself delegate is given ITS OWN identity, so
      // `delegateTo` sees the real depth. Handing it the parent's would make
      // every generation look like depth 1 and turn `maxDepth` into a field
      // nothing enforces.
      ...(init.grantDelegation === undefined
        ? {}
        : {
            subagents: {
              identity: ctx.identity,
              runner: init.grantDelegation.runner,
              session,
              ...(init.grantDelegation.maxDepth === undefined
                ? {}
                : { maxDepth: init.grantDelegation.maxDepth }),
              ...(init.grantDelegation.mintSessionId === undefined
                ? {}
                : { mintSessionId: init.grantDelegation.mintSessionId })
            }
          })
    });

    let keepAlive = false;
    let released = false;
    const release = (): void => {
      // No early return on a second call. `SessionService` already refuses one
      // ("SessionService used after close()") and writes exactly one
      // `session/close` row — measured, not assumed — so a guard here would be a
      // protection sitting next to a protection that already covers the case.
      // The flag is still set, because `drain` genuinely needs it: without that
      // one, a caller holding the raw continuation gets an opaque failure from a
      // closed session instead of a refusal it can act on.
      released = true;
      // Both, always. A leaked ledger handle outlives the delegation that opened
      // it, and an unclosed session leaves a run that verification reads as
      // still open.
      try { toolset.close(); } catch { /* already closed */ }
      try { session.close({ reason: "completed" }); } catch { /* never opened */ }
    };

    try {
      session.open({
        sessionId: ctx.childSessionId,
        agentId: ctx.toolsetAgentId,
        harnessVersion: init.harnessVersion,
        compositionDigest: init.compositionDigest,
        policyDigest: init.policyDigest
      });
      const systemPromptEventId = session.recordSystemPrompt(init.systemPrompt).eventId;

      const driver = new AgentDriver({
        session,
        llm: init.makeLlm(session),
        route: init.route,
        systemPromptEventId,
        tools: toolset.seam
      });

      /**
       * How much of the child's assistant text the parent has already been told.
       *
       * `readAgentRunSummary` folds the WHOLE session, so without this cursor a
       * second continuation would hand the parent everything the child has ever
       * said — the first answer quoted again as if it were the new one.
       */
      let reported = 0;

      const drain = async (text: string): Promise<SubagentRunResult> => {
        if (released) {
          return { ok: false, text: "", reason: "child has been released" };
        }
        // The only way in.
        driver.followup(text);
        await driver.whenIdle();

        // The driver's own status goes in beside the log's counts, never instead
        // of them — `readAgentRunSummary` is built that way on purpose.
        const status = driver.status;
        const summary = readAgentRunSummary(init.workspace, ctx.childSessionId, status);

        // `failed` is terminal: the spine refused a `turn/end` or `turn/seal`, so
        // the child's log has an open turn nothing may build on. Its text may look
        // complete; the run it came from is not.
        if (status === "failed") {
          return { ok: false, text: "", reason: "child driver failed; its log has an open turn" };
        }

        // `unsignedRows` documents itself as "zero is the only acceptable value".
        // A child whose evidence is not signed has produced words with no
        // provenance, and handing those back to a parent that will quote them
        // would launder them into the parent's own signed log.
        if (summary.unsignedRows > 0) {
          return {
            ok: false,
            text: "",
            reason: `child wrote ${summary.unsignedRows} unsigned row(s); its output has no provenance`
          };
        }

        const fresh = summary.assistantText.slice(reported);
        reported = summary.assistantText.length;
        return { ok: true, text: fresh.join("\n") };
      };

      const first = await drain(ctx.goal);
      if (!ctx.continuable || !first.ok) {
        return first;
      }

      // The child stays alive, so the `finally` must not tear it down. Its
      // delegation is not accounted for until the parent releases the handle.
      keepAlive = true;
      return { ...first, continuation: { continue: drain, close: release } };
    } finally {
      if (!keepAlive) {
        release();
      }
    }
  };
}
