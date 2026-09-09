import { mintDelegationPacket, UnsignablePacketError } from "../fleet/delegationPacket.js";
import { removeHandoffPacket } from "../fleet/handoffPacket.js";
import { parseDelegationScope } from "./delegationScope.js";
import { parseSubagentStopConditions } from "./subagentStopConditions.js";
import { writeDelegationEvidence } from "./delegationEvidenceWriter.js";
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
  /** Validated frozen declarations, also available to descendant composition. */
  readonly stopConditions?: readonly string[];
  /**
   * Aborted when the parent gives up, a lifetime timeout expires, or an active
   * child is released. The same signal covers all continued invocations.
   *
   * A runner that ignores it is not stopped by anything here — the signal is a
   * request, not a kill. What the spawn guarantees is the ACCOUNTING: the
   * delegation settles either way, and the reason says which happened.
   */
  readonly signal?: AbortSignal;
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
  /** max-turns:N and/or timeout-ms:N; validated and enforced before dispatch. */
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
  /**
   * Where the settled delegation's scoreable projection is written.
   *
   * REQUIRED, not optional. Optional would mean a recorder without it silently
   * drops the projection, and a caller cannot tell the difference between
   * "there was nothing to record" and "the evidence went nowhere" -- the same
   * shape as the `toolset-<agentId>` default this codebase has just finished
   * deleting. Every production caller already holds a `SessionService`, which
   * has the method; the cost is confined to the fakes in tests, which is where
   * an unimplemented contract belongs if it is going to be unimplemented
   * anywhere.
   */
  recordProjectedEvidence(row: {
    readonly eventType: "audit" | "metric" | "stdout";
    readonly payload: string;
    readonly meta: Record<string, unknown>;
  }): unknown;
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
  /** Aborted when the parent gives up. See `SubagentRunContext.signal`. */
  readonly signal?: AbortSignal;
  /**
   * How long to wait for a cancelled child to return before settling anyway.
   *
   * Waiting forever would let a runner that ignores its signal hold the parent
   * open; settling immediately would make the log claim the child ended when it
   * may still be running. So: ask, wait a bounded time, and record which of the
   * two actually happened.
   */
  readonly cancelGraceMs?: number;
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
      /** Actual child output, when available; never the runtime's stop reason. */
      readonly childText?: string;
      /** Null when the delegation was refused before it was ever announced. */
      readonly packetId: string | null;
    };

/**
 * Spawn one child, or refuse.
 *
 * Refusals before the announcement write nothing at all — no packet, no row —
 * because a record of an authorisation that never held is worse than silence.
 */
/** How long a cancelled child gets to return before the delegation settles anyway. */
export const DEFAULT_CANCEL_GRACE_MS = 5_000;

/** A grace expiry is an accounting boundary, never proof that execution stopped. */
const ABANDONED = Symbol("abandoned");

/** Remove listeners/timers on both races, and dispose resources returned too late. */
function settleWithin(
  running: Promise<SubagentRunResult>,
  signal: AbortSignal,
  graceMs: number,
  onLate: (result: SubagentRunResult) => void
): Promise<SubagentRunResult | typeof ABANDONED> {
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (value: SubagentRunResult | typeof ABANDONED): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const onAbort = (): void => {
      if (timer === undefined && !settled) timer = setTimeout(() => finish(ABANDONED), graceMs);
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
    void running.then(
      value => { if (settled) onLate(value); else finish(value); },
      (error: unknown) => {
        const failure = { ok: false, text: "", reason: `child threw: ${String(error)}` };
        if (settled) onLate(failure); else finish(failure);
      }
    );
  });
}

export async function spawnSubagent(init: SpawnSubagentInit): Promise<SubagentOutcome> {
  // The signed packet and all later admissions use this snapshot, not mutable
  // caller arrays/configuration inspected again after an async runner returns.
  const { workspace, session, runner, mintSessionId, signal: parentSignal } = init;
  const parent = Object.freeze({ ...init.parent });
  const request = { ...init.request,
    ...(init.request.delegationScope === undefined ? {} : { delegationScope: Object.freeze([...init.request.delegationScope]) }) };
  const stops = parseSubagentStopConditions(request.stopConditions);
  if (!stops.ok) return { ok: false, reason: stops.reason, packetId: null };
  const maxDepth = init.maxDepth ?? DEFAULT_MAX_DELEGATION_DEPTH;
  const graceMs = init.cancelGraceMs ?? DEFAULT_CANCEL_GRACE_MS;
  if (!Number.isSafeInteger(graceMs) || graceMs < 0 || graceMs > 2_147_483_647) {
    return { ok: false, reason: "cancelGraceMs must be an integer between 0 and 2147483647", packetId: null };
  }
  const derived = delegateTo(parent, request.runAs, maxDepth);
  if (!derived.ok) return { ok: false, reason: derived.reason, packetId: null };
  const identity = Object.freeze(derived.identity);
  if (parentSignal?.aborted === true) {
    return { ok: false, reason: "parent gave up before the delegation was authorised", packetId: null };
  }
  let scopeClasses: readonly ActionClass[] | undefined;
  if (request.delegationScope !== undefined) {
    const parsed = parseDelegationScope(request.delegationScope);
    if (!parsed.ok) return { ok: false, reason: parsed.reason, packetId: null };
    scopeClasses = parsed.classes;
  }

  let packetId: string;
  try {
    packetId = mintDelegationPacket(workspace, { parent, child: identity, goal: request.goal,
      delegationScope: request.delegationScope, stopConditions: stops.conditions }).packetId;
  } catch (error) {
    return { ok: false, reason: error instanceof UnsignablePacketError ? error.message : String(error), packetId: null };
  }
  let childSessionId: string;
  try {
    childSessionId = mintSessionId();
    session.recordLoopEvent({ kind: "delegation-started", childRunAs: identity.runAs, childSessionId,
      governedAs: identity.governedAs, depth: identity.depth, packetId });
  } catch (error) {
    removeHandoffPacket(workspace, packetId);
    throw error;
  }

  const controller = new AbortController();
  // A monotonic deadline also refuses late admission when the event loop has
  // not yet delivered the timer callback. Continuations never reset it.
  const deadline = stops.timeoutMs === undefined ? undefined : performance.now() + stops.timeoutMs;
  let lifetimeTimer: ReturnType<typeof setTimeout> | undefined;
  let active = false;
  let closed = false;
  let stopReason: string | undefined;
  let closeReason = "child has been released";
  let accountingError: unknown;
  let turns = 0;
  let latestText = "";
  let continuation: SubagentContinuation | undefined;
  const retained = new Set<SubagentContinuation>();
  const released = new Set<SubagentContinuation>();

  const releaseResources = (late?: SubagentRunResult): string | undefined => {
    if (late?.continuation !== undefined) retained.add(late.continuation);
    let failure: string | undefined;
    for (const resource of retained) {
      if (released.has(resource)) continue;
      released.add(resource);
      try { resource.close(); }
      catch (error) { failure ??= `child resource release failed: ${String(error)}`; }
    }
    return failure;
  };
  const account = (settledAs: DelegationSettlement, reason: string, release = true): void => {
    if (closed) return;
    closed = true;
    if (lifetimeTimer !== undefined) clearTimeout(lifetimeTimer);
    parentSignal?.removeEventListener("abort", onParentAbort);
    const releaseFailure = release ? releaseResources() : undefined;
    closeReason = `${reason}${releaseFailure === undefined ? "" : `; ${releaseFailure}`}`;
    if (releaseFailure !== undefined && settledAs === "reported") settledAs = "failed";
    // Mark terminal before calling external writers or release hooks. An idle
    // timeout can run after the parent writer was closed; retain that error for
    // the handle without throwing from an asynchronous timer or inventing a row.
    try {
      session.recordLoopEvent({ kind: "delegation-completed", childRunAs: identity.runAs,
        childSessionId, packetId, settledAs, reason: closeReason });
      writeDelegationEvidence(session, { settledAs, depth: identity.depth, packetId,
        childRunAs: identity.runAs, childSessionId, governedAs: identity.governedAs,
        ...(scopeClasses === undefined ? {} : { scopeDeclared: scopeClasses }), childText: latestText });
    } catch (error) {
      accountingError = error;
      closeReason += `; delegation completion could not be recorded: ${String(error)}`;
    }
  };
  const requestStop = (reason: string): void => {
    if (closed || stopReason !== undefined) return;
    stopReason = reason;
    controller.abort(reason);
    if (!active) account("cancelled", `${reason}; child was idle and was released`);
  };
  const onParentAbort = (): void => requestStop("parent cancelled the delegation");
  const checkDeadline = (): void => {
    if (deadline !== undefined && performance.now() >= deadline) requestStop(`timeout-ms:${stops.timeoutMs} lifetime expired`);
  };
  const limitReached = (): boolean => stops.maxTurns !== undefined && turns >= stops.maxTurns;
  const publicResult = (result: SubagentRunResult): SubagentRunResult => ({ ok: result.ok, text: result.text,
    ...(result.reason === undefined ? {} : { reason: result.reason }) });

  // One admission lock protects every runner, including injected/foreign ones.
  // Only accepted invocations consume max-turns. The initial invocation is #1.
  const execute = async (dispatch: () => Promise<SubagentRunResult>): Promise<SubagentRunResult> => {
    checkDeadline();
    if (closed || stopReason !== undefined) return { ok: false, text: "",
      reason: closed ? `child has been released: ${closeReason}` : stopReason };
    if (active) return { ok: false, text: "", reason: "child already has an active turn" };
    active = true;
    lifetimeTimer?.ref?.();
    turns += 1;
    let running: Promise<SubagentRunResult>;
    try { running = Promise.resolve(dispatch()); }
    catch (error) { running = Promise.reject(error); }
    const result = await settleWithin(running, controller.signal, graceMs, late => {
      // After abandonment the executor may still own an active DB. Release it
      // only after it returns, including an initial late continuation handle.
      // The original unconfirmed settlement is never rewritten or duplicated.
      releaseResources(late);
    });
    checkDeadline();
    active = false;
    lifetimeTimer?.unref?.();
    if (result === ABANDONED) {
      account("cancelled", `${stopReason ?? "delegation cancelled"}; child did not stop within the grace window and was abandoned; execution stop unconfirmed`, false);
      return { ok: false, text: "", reason: closeReason };
    }
    if (result.continuation !== undefined) {
      retained.add(result.continuation);
      continuation = result.continuation;
    }
    latestText = result.text;
    if (stopReason !== undefined) {
      account("cancelled", `${stopReason}; runner returned${result.reason === undefined ? "" : `: ${result.reason}`}`);
      return { ok: false, text: result.text, reason: closeReason };
    }
    if (!result.ok || result.text.trim().length === 0) {
      account("failed", result.reason ?? (result.ok ? "child produced no output" : "child did not report a reason"));
      return { ok: false, text: result.text, reason: closeReason };
    }
    if (limitReached() || continuation === undefined || request.continuable !== true) {
      account("reported", limitReached() ? `max-turns:${stops.maxTurns} ceiling reached; child reported and was released` : "child reported");
      if (accountingError !== undefined || closeReason.includes("child resource release failed:")) {
        return { ok: false, text: result.text, reason: closeReason };
      }
    }
    return publicResult(result);
  };

  parentSignal?.addEventListener("abort", onParentAbort, { once: true });
  if (parentSignal?.aborted) onParentAbort();
  if (!closed && stops.timeoutMs !== undefined) {
    lifetimeTimer = setTimeout(() => requestStop(`timeout-ms:${stops.timeoutMs} lifetime expired`), stops.timeoutMs);
    // Referenced during active work, unreferenced only while a retained child
    // is idle. Even an executor waiting on a handle-free promise gets a timeout.
  }
  const first = await execute(() => runner({ continuable: request.continuable === true,
    toolsetAgentId: identity.governedAs, identity, childSessionId, goal: request.goal,
    ...(scopeClasses === undefined ? {} : { delegationScope: scopeClasses }),
    ...(request.stopConditions === undefined ? {} : { stopConditions: stops.conditions }), signal: controller.signal }));
  if (!first.ok) return { ok: false, reason: first.reason ?? closeReason, packetId,
    ...(first.text.length === 0 ? {} : { childText: first.text }) };
  if (closed) return { ok: true, identity, packetId, childSessionId, childText: first.text };
  const handle: SubagentHandle = {
    identity, childSessionId, packetId,
    continue: text => execute(() => continuation!.continue(text)),
    close: (settledAs, reason) => {
      checkDeadline();
      if (closed) return;
      if (active) {
        // The active call owns bounded settlement and eventual disposal. Never
        // close a runner's DB beneath its still-running continuation.
        requestStop(`child release requested during an active turn: ${reason}`);
        return;
      }
      account(settledAs, reason);
      if (accountingError !== undefined) throw accountingError;
    }
  };
  return { ok: true, identity, packetId, childSessionId, childText: first.text, handle };
}
