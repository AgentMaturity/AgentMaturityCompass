import { mintDelegationPacket, UnsignablePacketError } from "../fleet/delegationPacket.js";
import { removeHandoffPacket } from "../fleet/handoffPacket.js";
import { parseDelegationScope } from "./delegationScope.js";
import type { ActionClass } from "../types.js";
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
  /** Whether the runner should keep the child alive after its first turn. */
  readonly continuable: boolean;
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
  /**
   * The action classes this child is authorised for, validated.
   *
   * Absent means unrestricted, which is deliberately distinct from an empty
   * list -- that is refused upstream, because an operator who writes a scope
   * naming nothing means the opposite of "no restriction". The runner is what
   * binds it; see ./delegationScope.ts for why the signed packet alone did not.
   */
  readonly delegationScope?: readonly ActionClass[];
}

/**
 * A child that is still alive and can take more work.
 *
 * Present only when the runner was asked to keep the child. Its existence is
 * what defers `delegation-completed`: a child that can still be asked something
 * has not finished, and writing its completion when its first turn went quiet
 * would close a delegation that is still open.
 */
export interface SubagentContinuation {
  /** Post more work into the child's inbox and run it to quiescence. */
  continue(text: string): Promise<SubagentRunResult>;
  /** Release the child. Called by the handle, which is idempotent. */
  close(): void;
}

/** What the child executor reports back. `text` is the CHILD's own words. */
export interface SubagentRunResult {
  readonly ok: boolean;
  /** The child's output, folded from its own session. Never the runtime's summary. */
  readonly text: string;
  /** Only when `ok` is false. The runtime quotes this in its own account. */
  readonly reason?: string;
  /** Set when the child is continuable and still holding its session. */
  readonly continuation?: SubagentContinuation;
}

export type SubagentRunner = (ctx: SubagentRunContext) => Promise<SubagentRunResult>;

export interface SubagentRequest {
  /** Names the child for evidence. Cannot affect what governs it. */
  readonly runAs: string;
  readonly goal: string;
  readonly delegationScope?: readonly string[];
  readonly stopConditions?: readonly string[];
  /**
   * Keep the child alive after its first turn goes quiet.
   *
   * A continuable child holds its session open, so its `delegation-completed`
   * is deferred until the parent releases it. A parent that never does leaves an
   * unmatched `delegation-started`, which is the honest signature of a
   * delegation nobody closed — not something to paper over.
   */
  readonly continuable?: boolean;
}

/**
 * A live child a parent can keep talking to.
 *
 * `close` is idempotent because the parent may release a child on a path that
 * also unwinds — a second completion row for one delegation would make the log
 * say it ended twice.
 */
export interface SubagentHandle {
  readonly identity: DelegationIdentity;
  readonly childSessionId: string;
  readonly packetId: string;
  /** More work, through the inbox and nowhere else. */
  continue(text: string): Promise<SubagentRunResult>;
  /** Account for the delegation and release the child. Safe to call twice. */
  close(settledAs: DelegationSettlement, reason: string): void;
}

/** How the runtime saw a delegation end. */
export type DelegationSettlement = "reported" | "refused" | "failed" | "cancelled";

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
      /**
       * Present exactly when the child is still alive.
       *
       * While it exists the delegation has NOT been accounted for — closing the
       * handle is what writes `delegation-completed`.
       */
      readonly handle?: SubagentHandle;
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

  // 1b. Read the declared scope BEFORE authorising. The packet is the
  //     authorisation record, and minting one that names a scope the runtime
  //     cannot read would be precisely the defect this scope work exists to
  //     close -- a signature over a constraint nothing enforces. So a bad scope
  //     is refused like a depth refusal: no packet, no row.
  let scopeClasses: readonly ActionClass[] | undefined;
  if (init.request.delegationScope !== undefined) {
    const parsed = parseDelegationScope(init.request.delegationScope);
    if (!parsed.ok) {
      return { ok: false, reason: parsed.reason, packetId: null };
    }
    scopeClasses = parsed.classes;
  }

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
  try {
    init.session.recordLoopEvent({
      kind: "delegation-started",
      childRunAs: identity.runAs,
      childSessionId,
      governedAs: identity.governedAs,
      depth: identity.depth,
      packetId
    });
  } catch (error) {
    // The packet is minted BEFORE the announcement, so a session that refuses
    // the row would otherwise leave a signed authorisation on disk for a
    // delegation the log never mentions — the one case that breaks this
    // function's promise that an unannounced delegation writes nothing at all.
    // A parent session closed mid-turn is the realistic cause, and a long-lived
    // out-of-process child is what makes it likely.
    removeHandoffPacket(init.workspace, packetId);
    throw error;
  }

  // 4. Run. THE governance line: the child is toolset-scoped as its root.
  let result: SubagentRunResult;
  try {
    result = await init.runner({
      continuable: init.request.continuable === true,
      toolsetAgentId: identity.governedAs,
      identity,
      childSessionId,
      goal: init.request.goal,
      ...(scopeClasses === undefined ? {} : { delegationScope: scopeClasses })
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

  const account = (settledAs: DelegationSettlement, reason: string): void => {
    init.session.recordLoopEvent({
      kind: "delegation-completed",
      childRunAs: identity.runAs,
      childSessionId,
      packetId,
      settledAs,
      reason
    });
  };

  // 5. Account — unless the child is still alive.
  //
  // A continuable child has NOT finished just because its first turn went quiet.
  // Writing its completion here would close a delegation the parent can still
  // talk to, and the log would say it ended while it was still running. The
  // handle's `close` writes it instead, and a parent that never closes leaves an
  // unmatched `delegation-started` — the honest signature of a delegation nobody
  // ended, which is exactly what a reader needs to see.
  const continuation = result.continuation;
  if (!result.ok && continuation !== undefined) {
    // A runner may hold a live child and still report a failure — an
    // out-of-process one reaches this the moment a child starts and then fails.
    // In-process it is unreachable, because `createDriverRunner` returns early
    // when its first drain fails and never pairs the two. Without this the
    // process was dropped, never closed, while the delegation was accounted for
    // as finished.
    continuation.close();
  }
  if (result.ok && continuation !== undefined) {
    let closed = false;
    const handle: SubagentHandle = {
      identity,
      childSessionId,
      packetId,
      continue: (text: string) => {
        if (closed) {
          return Promise.resolve({ ok: false, text: "", reason: "child has been released" });
        }
        return continuation.continue(text);
      },
      close: (settledAs: DelegationSettlement, reason: string) => {
        // Idempotent: a parent may release a child on a path that also unwinds,
        // and a second completion row would make the log say it ended twice.
        if (closed) {
          return;
        }
        closed = true;
        continuation.close();
        account(settledAs, reason);
      }
    };
    return { ok: true, identity, packetId, childSessionId, childText: result.text, handle };
  }

  // The cases that most need an account are the ones where the child never got
  // to report, so this is unconditional for every non-continuable child.
  // A child that produced no words did not report, whatever its runner said.
  //
  // This is the chokepoint's job rather than any one runner's, because every
  // runner folds the child's answer out of the log its own way and a fold that
  // silently yields nothing looks exactly like a well-behaved silent child. The
  // parent would then quote an empty string to its model as the delegate's
  // answer. Checked here so an out-of-process provider cannot ship green and
  // empty.
  const reported = result.ok && result.text.trim().length > 0;
  const reason = result.ok
    ? (reported ? "child reported" : "child produced no output")
    : (result.reason ?? "child did not report a reason");

  account(reported ? "reported" : "failed", reason);

  return reported
    ? { ok: true, identity, packetId, childSessionId, childText: result.text }
    : { ok: false, reason, packetId };
}
