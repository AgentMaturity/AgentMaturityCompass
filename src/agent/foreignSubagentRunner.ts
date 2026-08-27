import Database from "better-sqlite3";
import { join } from "node:path";
import { spawnGovernedChild } from "../ledger/monitor.js";
import type { SubagentRunContext, SubagentRunResult, SubagentRunner } from "./subagentSpawn.js";

/**
 * A delegated child that is a FOREIGN process (plan P6.1b).
 *
 * The same `SubagentRunner` seam as `./subagentRunner.ts`, so `spawnSubagent`
 * keeps deciding everything that governs a delegation — depth, the signed
 * handoff packet, the announced child session, the started/completed pair, the
 * declared scope. Only the executor changes. That is the whole point of putting
 * the seam there: a provider cannot opt out of the governance by being foreign.
 *
 * WHY NOT `runAdapterCommand`. It is AMC's existing foreign-CLI launcher and the
 * obvious thing to wrap, and it cannot satisfy this contract. It requires AMC
 * Studio to be running; it mints its own `randomUUID()` session id, so the
 * announced `childSessionId` would name a session that does not exist; it
 * returns only an `exitCode` with no child text, so there is nothing to put in
 * `SubagentRunResult.text`; and its SANDBOX branch returns a hardcoded
 * `exitCode: 0`, so a crashed foreign agent reports success. This composes the
 * same primitives one level down instead.
 *
 * WHAT AMC CAN AND CANNOT BIND ON A FOREIGN CHILD. It cannot intercept the
 * child's tool loop — the signed tool allowlist, the approval gate and the
 * toolset write scope are all in-process interception of a loop AMC does not
 * own, and a `delegationScope` cannot narrow a registry that lives in another
 * process. What it CAN do is decide the child's environment: the provider route
 * it must talk through and the lease it must authenticate with. That is why this
 * refuses to spawn an unleased child rather than running one ungoverned, and why
 * the environment is composed rather than inherited.
 */

export interface ForeignRunnerInit {
  readonly workspace: string;
  /** Builds the command that starts the foreign agent on one goal. */
  readonly spawn: (goal: string) => { readonly command: string; readonly args: readonly string[] };
  /**
   * The environment that GOVERNS the child: its provider route and its OWN
   * lease. Returning an empty lease is a refusal, not a default.
   *
   * A function rather than a value because a lease is short-lived, and one
   * minted when the runner was composed could already have expired by the time a
   * model decides to delegate.
   */
  readonly governedEnv: () => { readonly env: Record<string, string>; readonly lease: string };
  readonly cwd?: string;
  /**
   * How long a child may run. Absent means no deadline, which is only safe when
   * the caller supplies its own.
   *
   * A foreign agent that waits for input it will never get -- an interactive CLI
   * invoked without a print flag is the obvious case -- would otherwise hold the
   * parent's turn open indefinitely.
   */
  readonly timeoutMs?: number;
}

const refuse = (reason: string): SubagentRunResult => ({ ok: false, text: "", reason });

/**
 * Fold the child's answer out of its own recorded output.
 *
 * The monitor tees stdout into signed `stdout` rows as the child produces it, so
 * the log IS the transcript — there is no second copy to disagree with it. Read
 * back in insertion order via `rowid`, because `id` is a UUID and ordering by it
 * would interleave chunks into nonsense.
 */
function foldChildOutput(
  workspace: string,
  sessionId: string
): { text: string; truncated: boolean } {
  const db = new Database(join(workspace, ".amc", "evidence.sqlite"), { readonly: true });
  try {
    const rows = db
      .prepare(
        "SELECT event_type, payload_inline, meta_json FROM evidence_events "
        + "WHERE session_id = ? ORDER BY rowid"
      )
      .all(sessionId) as Array<{ event_type: string; payload_inline: string | null; meta_json: string }>;

    let text = "";
    let truncated = false;
    for (const row of rows) {
      if (row.event_type === "stdout") {
        text += row.payload_inline ?? "";
        continue;
      }
      if (row.event_type !== "metric") continue;
      try {
        const meta = JSON.parse(row.meta_json) as Record<string, unknown>;
        if (meta["metricKey"] === "runtime_output_truncated") truncated = true;
      } catch {
        // A row whose meta will not parse cannot say it was truncated. It is
        // also not evidence that nothing was, so nothing is concluded here.
      }
    }
    return { text, truncated };
  } finally {
    db.close();
  }
}

export function createForeignRunner(init: ForeignRunnerInit): SubagentRunner {
  return async function runForeignChild(ctx: SubagentRunContext): Promise<SubagentRunResult> {
    // A one-shot CLI cannot be continued. `claude -p` and `codex exec` answer
    // and exit; handing back a continuation that silently starts a FRESH process
    // on each follow-up would present a new agent with no memory of the first
    // exchange as though it were the same child. dsh reached the same
    // conclusion: none of its out-of-process providers implements continuation.
    if (ctx.continuable) {
      return refuse(
        "a foreign child is not continuable; it answers once and exits, and a second "
        + "process would be a different agent wearing the same name"
      );
    }

    const governed = init.governedEnv();
    if (governed.lease.length === 0) {
      return refuse(
        "refusing to spawn an ungoverned foreign child: no lease was issued, so its provider "
        + "traffic would bypass the gateway with nothing metering or recording it"
      );
    }

    // The scope reaches the packet and the parent's log, and stops there: AMC
    // cannot narrow a tool registry that lives in another process. Said plainly
    // rather than left for a reader to assume the in-process guarantee carries
    // over — it does not.
    const { command, args } = init.spawn(ctx.goal);

    let outcome: { sessionId: string; exitCode: number; terminatedBy: string | null };
    try {
      outcome = await spawnGovernedChild({
        workspace: init.workspace,
        sessionId: ctx.childSessionId,
        agentId: ctx.toolsetAgentId,
        command,
        args,
        envExtras: governed.env,
        // The lease is a bearer credential handed to the child; a child that
        // echoes it must not put it in the signed log or on the terminal.
        scrubValues: [governed.lease],
        ...(init.cwd ? { cwd: init.cwd } : {}),
        ...(init.timeoutMs === undefined ? {} : { timeoutMs: init.timeoutMs })
      });
    } catch (error) {
      return refuse(`foreign child could not be started: ${String(error)}`);
    }

    if (outcome.terminatedBy === "timeout") {
      // Named separately because a killed child's exit code is 1, and "exited 1"
      // would send an operator hunting a crash instead of a deadline.
      return refuse(
        `foreign child timed out${init.timeoutMs === undefined ? "" : ` after ${init.timeoutMs}ms`}`
      );
    }
    if (outcome.exitCode !== 0) {
      // Deliberately without the partial output. A child that printed something
      // and then crashed has not answered, and handing the fragment back would
      // let a parent quote half a thought to its model as a delegate's finding.
      return refuse(`foreign child exited ${outcome.exitCode}`);
    }

    const { text, truncated } = foldChildOutput(init.workspace, ctx.childSessionId);
    if (truncated) {
      return refuse(
        "foreign child produced more output than the monitor records, so its answer "
        + "cannot be reported in full"
      );
    }
    if (text.trim().length === 0) {
      return refuse("foreign child exited cleanly but produced no output");
    }

    return { ok: true, text };
  };
}
