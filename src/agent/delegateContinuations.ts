import { defineTool } from "../tools/toolRegistry.js";
import type { ToolBodyResult, ToolDefinition, ToolExecution } from "../tools/toolTypes.js";
import type { DelegationSettlement, SubagentHandle } from "./subagentSpawn.js";

/**
 * Kept-open delegates and `delegate_continue` (SH-ORCH-05).
 *
 * `delegate({keepOpen: true})` keeps an in-process child after its answer, so
 * its caller can send it more work with `delegate_continue({runAs, text})`
 * instead of explaining the task again to a fresh delegate. The continuation is
 * `spawnSubagent`'s own handle: the same signed packet, lifetime deadline and
 * `max-turns` budget (each continuation is one more executor turn), the same
 * root-wide slot, held until release, and `delegation-completed` deferred until
 * the delegate is released.
 *
 * LIFETIME IS THE CALLER'S TOOLSET. Nothing keeps a child alive past the
 * toolset that holds it: its shutdown releases every open delegate before the
 * caller's session is sealed, so each completion row lands in the caller's log,
 * and a delegate kept open after shutdown began is released at once.
 *
 * NAMES ARE THE CALLER'S OWN LABELS. A delegate is addressed by the `runAs` its
 * caller chose. One open delegate per name, reserved synchronously before the
 * spawn's first await, so two parallel calls cannot both keep the same name.
 *
 * THE TWO ACCOUNTS STAY APART, as in `delegate`: a continuation returns the
 * child's own words alone, and a refusal returns the runtime's account alone.
 */

export interface OpenDelegates {
  /** Whether the caller's model is offered `delegate_continue` now (signed policy, compiled plan, registry). */
  offered(): boolean;
  /** Claim a name before spawning; false when a delegate is open or being kept under it, or shutdown began. */
  reserve(runAs: string): boolean;
  /** Settle a reservation: keep the handle under the name, or free the name when nothing was kept. */
  settle(runAs: string, handle: SubagentHandle | undefined): void;
  open(runAs: string): SubagentHandle | undefined;
  /** Release one delegate; its delegation settles with this account. */
  release(runAs: string, settledAs: DelegationSettlement, reason: string): Promise<string | undefined>;
  names(): string[];
  hasOwnedWork(): boolean;
  /** Release every open delegate (toolset shutdown); true when every release confirmed. */
  closeAll(): Promise<boolean>;
}

const RUN_ENDED = "the caller's run ended; the open delegate was released";

export function openDelegates(offered: () => boolean): OpenDelegates {
  const handles = new Map<string, SubagentHandle>();
  const reserved = new Set<string>();
  // Every release in flight, whoever started it: shutdown resolves only after each one has written its rows (S23).
  const releasing = new Set<Promise<string | undefined>>();
  const drained: Array<() => void> = [];
  let closing: Promise<boolean> | undefined;
  let releaseFailed = false;
  const close = (handle: SubagentHandle, settledAs: DelegationSettlement, reason: string): Promise<string | undefined> => {
    const done = Promise.resolve().then(() => handle.close(settledAs, reason)).then(() => undefined, (error: unknown) => {
      // A release can finish before shutdown has drained its reservations. Retain any failure after removing the promise.
      releaseFailed = true;
      return String(error);
    });
    releasing.add(done);
    void done.then(() => releasing.delete(done));
    return done;
  };
  const live = (runAs: string): SubagentHandle | undefined => {
    const handle = handles.get(runAs);
    if (handle?.settled !== true) return handle;
    // No more work is accepted, but asynchronous cleanup or lineage can still be running.
    handles.delete(runAs);
    void close(handle, "reported", "the delegate already settled");
    return undefined;
  };
  return {
    offered,
    reserve: runAs => {
      if (closing !== undefined || reserved.has(runAs) || live(runAs) !== undefined) return false;
      reserved.add(runAs);
      return true;
    },
    settle: (runAs, handle) => {
      // Kept after shutdown began: released at once, and shutdown waits for that release like any other.
      if (handle !== undefined && closing !== undefined) void close(handle, "reported", RUN_ENDED);
      else if (handle !== undefined) handles.set(runAs, handle);
      reserved.delete(runAs);
      if (reserved.size === 0) for (const resume of drained.splice(0)) resume();
    },
    open: live,
    release: (runAs, settledAs, reason) => {
      const handle = live(runAs);
      handles.delete(runAs);
      return handle === undefined ? Promise.resolve(undefined) : close(handle, settledAs, reason);
    },
    names: () => [...handles.keys()].filter(runAs => live(runAs) !== undefined).sort(),
    hasOwnedWork: () => reserved.size > 0 || handles.size > 0 || releasing.size > 0 || releaseFailed,
    closeAll: () => {
      closing ??= (async () => {
        for (const [runAs, handle] of [...handles.entries()]) { handles.delete(runAs); void close(handle, "reported", RUN_ENDED); }
        // A delegate still being kept settles through `settle`, which releases it; a spawn in flight is bounded by
        // its own cancellation grace, because the caller's driver is disposed (its turn signal aborted) first.
        while (reserved.size > 0) await new Promise<void>(resume => drained.push(resume));
        while (releasing.size > 0) await Promise.all([...releasing]);
        return !releaseFailed;
      })();
      return closing;
    }
  };
}

const CONTINUE_PARAMETERS = Object.freeze({
  type: "object",
  properties: {
    runAs: { type: "string", description: "the runAs of a delegate you kept open with delegate({keepOpen: true})" },
    text: { type: "string", description: "more work for that delegate; it keeps its own earlier turns, but still sees none of this conversation" },
    release: { type: "boolean", description: "true, with no text, to release the delegate: its slot frees and its delegation settles" }
  },
  required: ["runAs"]
});

type ContinueArgs = { readonly runAs: string; readonly text: string } | { readonly runAs: string; readonly release: true };

function readArgs(raw: unknown): { ok: true; args: ContinueArgs } | { ok: false; detail: string } {
  if (raw === null || typeof raw !== "object") return { ok: false, detail: "arguments must be an object with runAs and text, or runAs and release" };
  const record = raw as Record<string, unknown>;
  const runAs = typeof record["runAs"] === "string" ? record["runAs"].trim() : "";
  if (runAs.length === 0) return { ok: false, detail: "runAs must name a delegate you kept open" };
  const text = typeof record["text"] === "string" ? record["text"].trim() : undefined;
  const release = record["release"];
  if (release !== undefined && release !== true && release !== false) return { ok: false, detail: "release, when given, must be true or false" };
  if (release === true) {
    return record["text"] === undefined ? { ok: true, args: { runAs, release: true } } : { ok: false, detail: "give text or release: true, not both" };
  }
  if (text === undefined || text.length === 0) return { ok: false, detail: "text must be a non-empty string (or pass release: true)" };
  return { ok: true, args: { runAs, text } };
}

const refused = (detail: string): ToolBodyResult => ({ ok: false, output: `[amc] delegation refused: ${detail}` });

/** Build `delegate_continue` over one caller's open delegates. */
export function delegateContinueTool(open: OpenDelegates): ToolDefinition {
  return defineTool({
    name: "delegate_continue",
    actionClass: "READ_ONLY",
    description:
      "Send more work to a delegate you kept open with delegate({keepOpen: true}) and wait for its answer, "
      + "or release it. The delegate keeps its own earlier turns, shares this run's budget and permissions, "
      + "and is released when this run ends.",
    parameters: CONTINUE_PARAMETERS,
    body: async (execution: ToolExecution) => {
      const parsed = readArgs(execution.arguments);
      if (!parsed.ok) return refused(parsed.detail);
      const { runAs } = parsed.args;
      const handle = open.open(runAs);
      if (handle === undefined) {
        const names = open.names();
        return refused(`no open delegate is named ${JSON.stringify(runAs)}; ${names.length === 0 ? "none is open" : `open: ${names.join(", ")}`}`);
      }
      if ("release" in parsed.args) {
        const failure = await open.release(runAs, "reported", "the caller released the delegate");
        return failure === undefined ? { ok: true, output: `[amc] delegate ${JSON.stringify(runAs)} released` }
          : refused(`delegate ${JSON.stringify(runAs)} was released, but its cleanup did not confirm: ${failure}`);
      }
      // The child watches the signal of the turn that spawned it; a cancelled continuation must stop it too.
      const onAbort = (): void => { void open.release(runAs, "cancelled", "the caller cancelled the continuation"); };
      execution.signal?.addEventListener("abort", onAbort, { once: true });
      if (execution.signal?.aborted === true) onAbort();
      try {
        // A delegation that settles here (ceiling, deadline, failure) leaves the open set on its next lookup.
        const result = await handle.continue(parsed.args.text);
        // The runtime's account alone on refusal; the child's own words alone on success.
        return result.ok ? { ok: true, output: result.text } : refused(result.reason ?? "the delegate did not report a reason");
      } finally { execution.signal?.removeEventListener("abort", onAbort); }
    }
  });
}
