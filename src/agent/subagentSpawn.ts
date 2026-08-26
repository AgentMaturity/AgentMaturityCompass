import { mintDelegationPacket, UnsignablePacketError } from "../fleet/delegationPacket.js";
import {
  DEFAULT_MAX_DELEGATION_DEPTH,
  delegateTo,
  type DelegationIdentity
} from "./delegationIdentity.js";
import type { LoopEventRecord } from "../session/loopEventMeta.js";

/**
 * Spawning one in-process child, with the governance that makes it safe (P6.1a).
 *
 * THE ONE RULE THIS MODULE EXISTS TO ENFORCE. A child's toolset is built with
 * `governedAs` — the ROOT's id — never with the child's own name. Both of AMC's
 * per-agent mechanisms key on that id and both were measured before this was
 * written:
 *
 *   `budgetForAgent` falls back to the `default` LIMITS for an unknown id while
 *   `budgetUsageSnapshot` counts USAGE filtered by `meta.agentId`, so a fresh
 *   name means full limits and zero spend.
 *
 *   `ToolRegistry` resolves guard scopes with `this.scopes.get(agentId)`, and
 *   scopes are where guards NARROW the global layer, so a fresh name sheds every
 *   restriction the parent had.
 *
 * Pass `runAs` to a toolset and "spawn a child" becomes how you reset a budget
 * and drop a restriction. `SubagentRunContext.toolsetAgentId` is the only id this
 * module hands out, and it is always `identity.governedAs`.
 *
 * WHY THE CHILD'S EXECUTOR IS INJECTED. Running a real child needs an LLM, a
 * route and a session. Injecting the runner keeps every governance property —
 * depth, signing, the toolset id, the evidence pair — testable without a model,
 * which is what makes them testable at all.
 *
 * ORDER IS THE SAFETY PROPERTY. Refuse, then authorise, then announce, then run.
 * A refusal writes nothing; an unsignable packet leaves no file and no row; and
 * `delegation-completed` is only ever written for a child that was announced,
 * so a rolled-back spawn cannot emit a completion for a delegation nobody saw.
 */

/** What the runtime hands a child executor. */
export interface SubagentRunContext {
  /**
   * The id the child's toolset, budgets and guard scopes must use.
   *
   * ALWAYS `identity.governedAs`. Never `identity.runAs`. See the module note.
   */
  readonly toolsetAgentId: string;
  readonly identity: DelegationIdentity;
  /** The child's own session. A child is never a second writer on the parent's. */
  readonly childSessionId: string;
  readonly goal: string;
}

/** What the child executor reports back. `text` is the CHILD's own words. */
export interface SubagentRunResult {
  readonly ok: boolean;
  /** The child's output, folded from its own session. Never the runtime's summary. */
  readonly text: string;
  /** Only when `ok` is false. The runtime quotes this in its own account. */
  readonly reason?: string;
}

export type SubagentRunner = (ctx: SubagentRunContext) => Promise<SubagentRunResult>;

export interface SubagentRequest {
  /** Names the child for evidence. Cannot affect what governs it. */
  readonly runAs: string;
  readonly goal: string;
  readonly delegationScope?: readonly string[];
  readonly stopConditions?: readonly string[];
}

/** The minimum this module needs of a session. */
export interface DelegationRecorder {
  recordLoopEvent(record: LoopEventRecord): unknown;
}

export interface SpawnSubagentInit {
  readonly workspace: string;
  readonly parent: DelegationIdentity;
  readonly request: SubagentRequest;
  readonly session: DelegationRecorder;
  readonly runner: SubagentRunner;
  /** Mints the child's session id. Injected so a test can pin it. */
  readonly mintSessionId: () => string;
  readonly maxDepth?: number;
}

export type SubagentOutcome =
  | {
      readonly ok: true;
      readonly identity: DelegationIdentity;
      readonly packetId: string;
      readonly childSessionId: string;
      /** The CHILD's words. Kept separate from `settledReason` on purpose. */
      readonly childText: string;
    }
  | {
      readonly ok: false;
      /** The RUNTIME's account. Never presented as the child's words. */
      readonly reason: string;
      /** Null when the delegation was refused before it was ever announced. */
      readonly packetId: string | null;
    };

/**
 * Spawn one child, or refuse.
 *
 * Refusals before the announcement write nothing at all — no packet, no row —
 * because a record of an authorisation that never held is worse than silence.
 */
export async function spawnSubagent(init: SpawnSubagentInit): Promise<SubagentOutcome> {
  const maxDepth = init.maxDepth ?? DEFAULT_MAX_DELEGATION_DEPTH;

  // 1. Refuse. Depth is checked before anything is written.
  const derived = delegateTo(init.parent, init.request.runAs, maxDepth);
  if (!derived.ok) {
    return { ok: false, reason: derived.reason, packetId: null };
  }
  const identity = derived.identity;

  // 2. Authorise. An unsignable packet leaves no file behind and no row.
  let packetId: string;
  try {
    packetId = mintDelegationPacket(init.workspace, {
      parent: init.parent,
      child: identity,
      goal: init.request.goal,
      delegationScope: init.request.delegationScope,
      stopConditions: init.request.stopConditions
    }).packetId;
  } catch (error) {
    const reason = error instanceof UnsignablePacketError ? error.message : String(error);
    return { ok: false, reason, packetId: null };
  }

  // 3. Announce, before the child runs. An unmatched `started` is the honest
  //    signature of a parent that died mid-delegation.
  const childSessionId = init.mintSessionId();
  init.session.recordLoopEvent({
    kind: "delegation-started",
    childRunAs: identity.runAs,
    childSessionId,
    governedAs: identity.governedAs,
    depth: identity.depth,
    packetId
  });

  // 4. Run. THE governance line: the child is toolset-scoped as its root.
  let result: SubagentRunResult;
  try {
    result = await init.runner({
      toolsetAgentId: identity.governedAs,
      identity,
      childSessionId,
      goal: init.request.goal
    });
  } catch (error) {
    // A throwing child still gets an account. Announced means accounted for.
    init.session.recordLoopEvent({
      kind: "delegation-completed",
      childRunAs: identity.runAs,
      childSessionId,
      packetId,
      settledAs: "failed",
      reason: `child threw: ${String(error)}`
    });
    return { ok: false, reason: `child threw: ${String(error)}`, packetId };
  }

  // 5. Account, unconditionally. The cases that most need an account are the
  //    ones where the child never got to report.
  init.session.recordLoopEvent({
    kind: "delegation-completed",
    childRunAs: identity.runAs,
    childSessionId,
    packetId,
    settledAs: result.ok ? "reported" : "failed",
    reason: result.ok ? "child reported" : (result.reason ?? "child did not report a reason")
  });

  return result.ok
    ? { ok: true, identity, packetId, childSessionId, childText: result.text }
    : { ok: false, reason: result.reason ?? "child did not report a reason", packetId };
}
