import chalk from "chalk";
import type { Command } from "commander";
import { parseRunLimits, type RunLimits } from "../agent/runLimits.js";
import { listenForSteerFrames, type SteerTarget } from "../agent/steerIpc.js";
import { resolveLatestSession } from "../session/latestSession.js";
import { SessionResumeRefused } from "../session/sessionResume.js";
import { escapeTerminalControls } from "../tools/builtin/askUserTool.js";
import type { AgentLoopCliIo, RunOptions } from "../cli-agent-options.js";

/**
 * The `agent-loop run` and `chat` flags for session continuity and run bounds (SH-LOOP-01/02/04/06):
 * `--continue`, `--plan`, `--stop <condition>` and `--interactive-steer`. Their rules live here so
 * the run command composes them without carrying them, in the style of agentLoopBreadthOptions.
 */

export interface ContinuityOptions extends RunOptions {
  readonly continue?: boolean;
  readonly plan?: boolean;
  readonly stop?: readonly string[];
  readonly interactiveSteer?: boolean;
}

const CONTINUE_HELP = "continue the most recent released native session for this agent in this workspace (the same flags as its original run are required)";
const STOP_HELP = "repeatable run limit: max-turns:N (highest session turn number that may open), max-tokens:N (provider-reported tokens over the session) or timeout-ms:N (wall clock from start); a breach is a signed cancel with cause limit";

function collect(value: string, previous: string[] = []): string[] { return [...previous, value]; }

export function withContinuityRunOptions(command: Command): Command {
  return command
    .option("--continue", CONTINUE_HELP)
    .option("--plan", "plan mode: only READ_ONLY tools are offered; delegate, workflow and job_kill are withheld; the plan is recorded with the plan tool and executed by a later turn without --plan")
    .option("--stop <condition>", STOP_HELP, collect)
    .option("--interactive-steer", "accept steer, queue and withdraw frames from the AMC parent over dedicated Node IPC; each is answered with its signed inbox receipt");
}

export function withContinuityChatOptions(command: Command): Command {
  return command.option("--continue", CONTINUE_HELP);
}

export interface ContinuityRun {
  /** The session `--continue` chose, to flow into `--session`. */
  readonly session: string | undefined;
  readonly continued: boolean;
  readonly planMode: boolean;
  readonly runLimits: RunLimits | undefined;
  readonly interactiveSteer: boolean;
  /** Installs the IPC steer listener on the composed handle; a no-op without `--interactive-steer`. */
  listen(target: SteerTarget): () => void;
}

/** Resolve `--continue` to a session id, or report why none can be continued; null after a reported refusal. */
export function continuedSession(io: AgentLoopCliIo, context: { readonly workspace: string; readonly agentId: string }): string | null {
  const latest = resolveLatestSession(context);
  if (latest.ok) return latest.session.sessionId;
  // Session and agent ids come from the ledger (imported sessions included): escaped like the chat picker's rows.
  io.error(chalk.red(escapeTerminalControls(`${latest.code}: ${latest.reason}`)));
  for (const row of latest.skipped) io.error(chalk.dim(escapeTerminalControls(`  skipped ${row.sessionId}: ${row.reason}`)));
  io.fail();
  return null;
}

/** Validates the continuity flags against the rest of the run; null after a reported refusal. */
export function resolveContinuityRun(io: AgentLoopCliIo, opts: ContinuityOptions, context: {
  readonly workspace: string; readonly agentId: string; readonly wantsDelegation: boolean; readonly toolMode: string;
}): ContinuityRun | null {
  const refuse = (message: string): null => { io.error(chalk.red(message)); io.fail(); return null; };
  if (opts.continue && (opts.session !== undefined || opts.forkFrom !== undefined)) return refuse("--continue chooses the session itself; it cannot be combined with --session or --fork-from.");
  if (opts.plan && (context.wantsDelegation || opts.goalRounds !== undefined)) return refuse("--plan cannot be combined with --delegate or --goal-rounds: a child's toolset is built after plan mode narrows the root's, so the restriction would not reach it.");
  if (opts.plan && context.toolMode !== "workspace") return refuse("--plan narrows the workspace tools; add --tools workspace.");
  if (opts.plan && (opts.validate?.length ?? 0) > 0) return refuse("--plan cannot be combined with --validate: public checks run through bash, which plan mode denies, so they could only fail.");
  if (opts.interactiveSteer && (typeof process.send !== "function" || !process.connected)) return refuse("--interactive-steer requires an AMC parent with a dedicated IPC channel (child_process.fork or native chat).");
  if (opts.interactiveSteer && opts.goalRounds !== undefined) return refuse("--interactive-steer steers the root turn, and --goal-rounds runs none: each round is a delegated child.");
  const limits = parseRunLimits(opts.stop);
  if (!limits.ok) return refuse(`--stop: ${limits.reason}`);
  if (limits.conditions.length > 0 && opts.goalRounds !== undefined) return refuse("--stop bounds the root driver, and --goal-rounds runs no root turn: each round is a delegated child, bounded by --delegate-stop and the round ceiling.");
  let session = opts.session;
  if (opts.continue) {
    const chosen = continuedSession(io, context);
    if (chosen === null) return null;
    session = chosen;
    (opts.json ? io.error : io.log)(chalk.dim(escapeTerminalControls(`continuing session ${chosen}`)));
  }
  if (limits.conditions.length > 0) (opts.json ? io.error : io.log)(chalk.dim(`run limits: ${limits.conditions.join(", ")}; a breach ends the run with a signed limit cause`));
  if (opts.plan) (opts.json ? io.error : io.log)(chalk.dim("plan mode: only READ_ONLY tools run in this turn; execute the plan with a later turn without --plan"));
  const interactiveSteer = opts.interactiveSteer === true;
  return {
    session, continued: opts.continue === true, planMode: opts.plan === true,
    runLimits: limits.conditions.length === 0 ? undefined : limits.limits, interactiveSteer,
    listen: (target) => interactiveSteer ? listenForSteerFrames(target, process as unknown as Parameters<typeof listenForSteerFrames>[1]) : () => undefined
  };
}

/**
 * `--continue` chose a session the new flags cannot resume. Reported by name so the operator can restore the
 * original flags or pick another session; the error is otherwise rethrown unchanged.
 */
export function reportContinueRefusal(io: AgentLoopCliIo, error: unknown, continued: string | undefined): boolean {
  if (continued === undefined || !(error instanceof SessionResumeRefused) || error.code !== "CONFIGURATION_MISMATCH") return false;
  io.error(chalk.red(escapeTerminalControls(`CONTINUE_CONFIGURATION_MISMATCH: session ${continued} was recorded under different execution settings or signed policy. ${error.message} Restore the original flags (provider, model, tools, approval, max-steps, compaction) or name another session with --session <id>.`)));
  io.fail();
  return true;
}
