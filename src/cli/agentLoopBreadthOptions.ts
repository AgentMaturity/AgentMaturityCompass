import chalk from "chalk";
import type { Command } from "commander";
import type { AgentToolsetOptions } from "../agent/agentToolset.js";
import type { AgentStatus } from "../agent/loopTypes.js";
import { readAgentRunSummary, renderRunSummary } from "../agent/runReport.js";
import { executionStatusFor } from "../execution/executionStatus.js";
import { renderNativeGuideCommand } from "../setup/nativeFirstUseGuide.js";
import type { GoalRoundsResult } from "../autonomy/goalRounds.js";
import { integerOption, type AgentLoopCliIo, type RunOptions } from "../cli-agent-options.js";
import { ipcAskUserAnswerer } from "../setup/nativeInteractiveAskUser.js";
import { workspaceSkillRoots } from "../skills/skillTurn.js";
import { renderSessionLists } from "../tools/builtin/todoTool.js";
import { searxngSearchProvider } from "../tools/builtin/webSearchProviders.js";
import type { WebSearchProvider } from "../tools/builtin/webSearchTool.js";

/**
 * The `agent-loop run` flags for the native breadth tools and goal rounds (WP40): option
 * declarations, their validation, what they hand the toolset and the turn, and how a run reports
 * them. Kept here so the run command composes them without carrying their rules.
 */

interface RunOutcome { readonly sessionId: string; readonly status: AgentStatus; readonly goalRounds?: GoalRoundsResult }

export const WEB_SEARCH_SEARXNG_HELP = "opt-in web_search provider for workspace tools: a SearXNG JSON origin, also granted under web_search in the signed tools policy";

export function withBreadthRunOptions(command: Command): Command {
  return command
    .option("--interactive-ask-user", "answer ask_user through the native chat parent over dedicated Node IPC; answers are auditor-signed")
    .option("--web-search-searxng <origin>", WEB_SEARCH_SEARXNG_HELP)
    .option("--goal-rounds <n>", "run the prompt as a goal for up to N rounds of in-process delegated children (requires --delegate and --tools workspace)");
}

export interface BreadthRun {
  /** Spread into `agentToolset`. */
  readonly toolset: Pick<AgentToolsetOptions, "askUser" | "webSearchProvider" | "skillRoots">;
  /** Spread into `runComposedTurn`. */
  readonly turn: { readonly goalRounds?: { readonly maxRounds: number; readonly signal: AbortSignal } };
  /** Goal rounds run no root turn, so the turn's Ctrl-C never arms; this stops the rounds instead. */
  armCancel(): void;
  dispose(): void;
  /**
   * Report the run from its signed log: the summary (JSON or text), goal rounds, the verified todo/plan and the verify
   * command; fails the command on a failed driver, an error ending, unpassed requested validation or a failed goal run.
   */
  reportRun(outcome: RunOutcome, priorTurnEndings: number, validationRequested: boolean): void;
}

/** Validates the breadth flags against the composed tool mode; null after a reported refusal. */
export function resolveBreadthRun(io: AgentLoopCliIo, opts: RunOptions, context: { readonly toolMode: string; readonly wantsDelegation: boolean }): BreadthRun | null {
  const refuse = (message: string): null => { io.error(chalk.red(message)); io.fail(); return null; };
  if (opts.interactiveAskUser && (typeof process.send !== "function" || !process.connected)) {
    return refuse("--interactive-ask-user requires an AMC parent with a dedicated IPC channel. Use native chat.");
  }
  let webSearchProvider: WebSearchProvider | undefined;
  try { webSearchProvider = opts.webSearchSearxng === undefined ? undefined : searxngSearchProvider(opts.webSearchSearxng); }
  catch (error) { return refuse(error instanceof Error ? error.message : "Invalid web search provider."); }
  if ((opts.interactiveAskUser || webSearchProvider !== undefined) && context.toolMode !== "workspace") {
    return refuse("--interactive-ask-user and --web-search-searxng configure workspace tools; add --tools workspace.");
  }
  const maxRounds = opts.goalRounds === undefined ? undefined : integerOption(io, "--goal-rounds", opts.goalRounds, 0);
  if (maxRounds === null) return null;
  if (maxRounds !== undefined && (maxRounds < 1 || maxRounds > 100)) return refuse("--goal-rounds must be an integer from 1 through 100; it is the hard ceiling.");
  if (maxRounds !== undefined && (!context.wantsDelegation || context.toolMode !== "workspace" || opts.delegateProvider !== undefined)) {
    return refuse("--goal-rounds runs each round as an in-process child: it needs --delegate and --tools workspace, without --delegate-provider.");
  }
  const abort = new AbortController();
  const cancel = (): void => { io.error(chalk.yellow("\ncancelling the goal rounds (cause: user)…")); abort.abort(); };
  return {
    toolset: { ...(opts.interactiveAskUser ? { askUser: ipcAskUserAnswerer() } : {}), ...(webSearchProvider === undefined ? {} : { webSearchProvider }),
      skillRoots: workspaceSkillRoots(process.cwd(), opts.credentialsHome) },
    turn: maxRounds === undefined ? {} : { goalRounds: { maxRounds, signal: abort.signal } },
    armCancel: () => { if (maxRounds !== undefined) process.on("SIGINT", cancel); },
    dispose: () => { process.removeListener("SIGINT", cancel); },
    reportRun: (outcome, priorTurnEndings, validationRequested) => {
      const summary = readAgentRunSummary(process.cwd(), outcome.sessionId, outcome.status);
      const ending = summary.endings.length > priorTurnEndings ? summary.endings.at(-1) : undefined;
      const goal = outcome.goalRounds;
      // P2-13: the four execution phases; evidence verification stays pending until `agent-loop verify`.
      io.log(opts.json ? JSON.stringify({ ...summary, ...(goal === undefined ? {} : { goalRounds: goal }),
        execution: executionStatusFor(process.cwd(), { sessionId: summary.sessionId, admission: "admitted",
          turn: ending?.reason ?? (summary.driverStatus === "failed" ? "error" : null), verified: null }) }, null, 2) : renderRunSummary(summary));
      if (!opts.json) {
        if (goal !== undefined) {
          io.log(`Goal rounds: ${goal.rounds} run, stopped by ${goal.stoppedBy} (${goal.reason}). Each round is a delegated child session in this session's log.`);
          if (goal.lastText) io.log(goal.lastText);
        }
        if (context.toolMode === "workspace") for (const line of renderSessionLists(process.cwd(), summary.sessionId)) io.log(line);
        io.log("Verify the recorded evidence (this does not evaluate answer quality):\n  " +
          renderNativeGuideCommand({ cwd: process.cwd(), argv: ["amc", "agent-loop", "verify", summary.sessionId] }));
      }
      if (summary.driverStatus === "failed" || ending?.reason === "error" || (validationRequested && summary.validation.status !== "passed")
        || (goal !== undefined && ["failed", "refused", "cancelled"].includes(goal.stoppedBy))) io.fail();
    }
  };
}
