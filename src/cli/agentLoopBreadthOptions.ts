import chalk from "chalk";
import type { Command } from "commander";
import type { AgentToolsetOptions } from "../agent/agentToolset.js";
import type { AgentStatus } from "../agent/loopTypes.js";
import { readAgentRunSummary, renderRunSummary } from "../agent/runReport.js";
import { describeRunLimit, type RunLimitBreach } from "../agent/runLimits.js";
import { executionStatusFor } from "../execution/executionStatus.js";
import { renderNativeGuideCommand } from "../setup/nativeFirstUseGuide.js";
import type { GoalRoundsResult } from "../autonomy/goalRounds.js";
import type { WorkflowRunResult } from "../workflow/workflowRunner.js";
import type { WorkflowPassOptions } from "../workflow/workflowPass.js";
import { readWorkflowPlanFile } from "../workflow/workflowPlanFile.js";
import type { AgentDefinition } from "../agent/agentDefinitions.js";
import { integerOption, type AgentLoopCliIo, type RunOptions } from "../cli-agent-options.js";
import { goalRunReceiptStates, reportExitCode, runExitCode, withOutputFormatOption, type RunOutput } from "./agentLoopOutputOptions.js";
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

interface RunOutcome { readonly sessionId: string; readonly status: AgentStatus; readonly goalRounds?: GoalRoundsResult; readonly workflow?: WorkflowRunResult; readonly runLimit?: RunLimitBreach }

export const WEB_SEARCH_SEARXNG_HELP = "opt-in web_search provider for workspace tools: a SearXNG JSON origin, also granted under web_search in the signed tools policy";

export const MAX_ACTIVE_CHILDREN_HELP = "root-wide active child cap including descendants (default 8; 0 disables children)";
export const NO_DELEGATE_STOP_HELP = "explicitly clear extra child stops from a preset; budgets, depth and approvals still apply";
export const VALIDATION_REPAIR_HELP = "explicit bounded repair policy for selected public checks, including allowed edit paths";

export function withBreadthRunOptions(command: Command): Command {
  return withOutputFormatOption(command)
    .option("--validation-repair <json>", VALIDATION_REPAIR_HELP)
    .option("--interactive-ask-user", "answer ask_user through the native chat parent over dedicated Node IPC; answers are auditor-signed")
    .option("--web-search-searxng <origin>", WEB_SEARCH_SEARXNG_HELP)
    .option("--goal-rounds <n>", "run the prompt as a goal for up to N rounds of in-process delegated children (requires --delegate and --tools workspace)")
    .option("--workflow-plan <file>", "run this reviewed workflow plan (JSON, inside the workspace) headless as in-process delegated children, with no model turn; requires --delegate and --tools workspace, takes no prompt")
    .option("--workflow-plan-sha256 <hex>", "pin the exact reviewed plan bytes: refuse when the file's sha256 differs (use it for every unattended --workflow-plan run)")
    .option("--workflow-run-id <id>", "with --workflow-plan and --session: resume that durable workflow run in the session a --keep-open run left unsealed; an id the session never created is refused");
}

export interface BreadthRun {
  /** Spread into `agentToolset`. */
  readonly toolset: Pick<AgentToolsetOptions, "askUser" | "webSearchProvider" | "skillRoots">;
  /** Spread into `runComposedTurn`. */
  readonly turn: { readonly goalRounds?: { readonly maxRounds: number; readonly signal: AbortSignal }; readonly workflowPass?: WorkflowPassOptions };
  /** Goal rounds run no root turn, so the turn's Ctrl-C never arms; this stops the rounds instead. */
  armCancel(): void;
  dispose(): void;
  /**
   * Report the run from its signed log: the summary (text, JSON, or the stream's `result` event), goal rounds, the
   * verified todo/plan and the verify command; then the exit code of the run table (src/cli/agentLoopOutputOptions.ts).
   */
  reportRun(outcome: RunOutcome, priorTurnEndings: number, validationRequested: boolean): void;
}

/** Validates the breadth flags against the composed tool mode; null after a reported refusal. */
export function resolveBreadthRun(io: AgentLoopCliIo, opts: RunOptions, context: { readonly toolMode: string; readonly wantsDelegation: boolean;
  readonly definitions?: ReadonlyMap<string, AgentDefinition>; readonly cancelAfterMs?: number; readonly output?: RunOutput }): BreadthRun | null {
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
  let workflowPass: WorkflowPassOptions | undefined;
  if (opts.workflowPlan !== undefined) {
    if (maxRounds !== undefined) return refuse("--workflow-plan and --goal-rounds are different passes; choose one.");
    if (!context.wantsDelegation || context.toolMode !== "workspace" || opts.delegateProvider !== undefined) {
      return refuse("--workflow-plan runs each node as an in-process child: it needs --delegate and --tools workspace, without --delegate-provider.");
    }
    if (opts.workflowRunId !== undefined && opts.session === undefined) return refuse("--workflow-run-id resumes a durable run in its own session: add --session <id>.");
    const file = readWorkflowPlanFile(process.cwd(), opts.workflowPlan);
    if (!file.ok) return refuse(file.reason);
    // The pin is compared with the digest of the very buffer that was parsed; a workspace writer cannot swap the plan after review.
    if (opts.workflowPlanSha256 !== undefined && opts.workflowPlanSha256.trim().toLowerCase() !== file.sha256) {
      return refuse(`--workflow-plan-sha256 does not match ${file.path}: the file's sha256 is ${file.sha256}; review it again before running it.`);
    }
    (opts.json ? io.error : io.log)(chalk.dim(`workflow plan ${file.path} (sha256 ${file.sha256}${opts.workflowPlanSha256 === undefined ? ", unpinned" : ", pinned"})`));
    workflowPass = { plan: file.plan, ...(opts.workflowRunId === undefined ? {} : { runId: opts.workflowRunId }),
      ...(context.definitions === undefined ? {} : { definitions: context.definitions }) };
  } else if (opts.workflowRunId !== undefined || opts.workflowPlanSha256 !== undefined) return refuse("--workflow-run-id and --workflow-plan-sha256 need --workflow-plan.");
  const abort = new AbortController();
  const passName = workflowPass === undefined ? "goal rounds" : "workflow pass";
  const cancel = (cause = "user"): void => { io.error(chalk.yellow(`\ncancelling the ${passName} (cause: ${cause})…`)); abort.abort(); };
  const onSigint = (): void => cancel();
  // A non-model pass never reaches the turn's onReady, so --cancel-after is armed against the pass itself.
  let cancelTimer: NodeJS.Timeout | undefined;
  return {
    toolset: { ...(opts.interactiveAskUser ? { askUser: ipcAskUserAnswerer() } : {}), ...(webSearchProvider === undefined ? {} : { webSearchProvider }),
      skillRoots: workspaceSkillRoots(process.cwd(), opts.credentialsHome) },
    turn: workflowPass !== undefined ? { workflowPass: { ...workflowPass, signal: abort.signal } }
      : maxRounds === undefined ? {} : { goalRounds: { maxRounds, signal: abort.signal } },
    armCancel: () => {
      if (maxRounds === undefined && workflowPass === undefined) return;
      process.on("SIGINT", onSigint);
      if ((context.cancelAfterMs ?? 0) > 0) cancelTimer = setTimeout(() => cancel("--cancel-after"), context.cancelAfterMs);
    },
    dispose: () => { process.removeListener("SIGINT", onSigint); if (cancelTimer !== undefined) clearTimeout(cancelTimer); },
    reportRun: (outcome, priorTurnEndings, validationRequested) => {
      const summary = readAgentRunSummary(process.cwd(), outcome.sessionId, outcome.status);
      const ending = outcome.workflow === undefined && outcome.goalRounds === undefined && summary.endings.length > priorTurnEndings
        ? summary.endings.at(-1) : undefined;
      const goal = outcome.goalRounds;
      const workflow = outcome.workflow === undefined ? undefined : { runId: outcome.workflow.runId, ok: outcome.workflow.ok,
        outputs: Object.fromEntries(outcome.workflow.outputs), failed: outcome.workflow.failures, cancelled: outcome.workflow.cancelled, agentsRun: outcome.workflow.agentsRun };
      // P2-13: the four execution phases; evidence verification stays pending until `agent-loop verify`.
      const execution = executionStatusFor(process.cwd(), { sessionId: summary.sessionId, admission: "admitted",
        turn: ending?.reason ?? (summary.driverStatus === "failed" ? "error" : null), verified: null });
      const report = { summary, execution, ending, validationRequested, ...(outcome.runLimit === undefined ? {} : { runLimit: outcome.runLimit }), ...(workflow === undefined ? {} : { workflow }),
        ...(goal === undefined ? {} : { goalStop: goal.stoppedBy, goalReceiptStates: goalRunReceiptStates(process.cwd(), summary.sessionId) }) };
      const exitCode = runExitCode(report);
      if (context.output?.sink) context.output.sink.result({ ...report, exitCode, ...(goal === undefined ? {} : { goalRounds: goal }) });
      else io.log(opts.json ? JSON.stringify({ ...summary, ...(goal === undefined ? {} : { goalRounds: goal, goalReceiptStates: report.goalReceiptStates }), ...(workflow === undefined ? {} : { workflow }), ...(report.runLimit === undefined ? {} : { runLimit: report.runLimit }), execution, exitCode }, null, 2) : renderRunSummary(summary));
      if (!opts.json) {
        if (goal !== undefined) {
          io.log(`Goal rounds: ${goal.rounds} run, stopped by ${goal.stoppedBy} (${goal.reason}). Each round is a delegated child session in this session's log.`);
          if (goal.lastText) io.log(goal.lastText);
        }
        if (workflow !== undefined) {
          io.log(`Workflow ${workflow.runId}: ${workflow.ok ? "ok" : workflow.cancelled ? "cancelled" : "failed"}; ${workflow.agentsRun} delegation(s) run, ${Object.keys(workflow.outputs).length} node output(s). Each node is a delegated child session in this session's log.`);
          for (const failure of workflow.failed) io.log(`  ${failure.nodeId}: ${failure.reason}`);
        }
        if (context.toolMode === "workspace") for (const line of renderSessionLists(process.cwd(), summary.sessionId)) io.log(line);
        io.log("Verify the recorded evidence (this does not evaluate answer quality):\n  " +
          renderNativeGuideCommand({ cwd: process.cwd(), argv: ["amc", "agent-loop", "verify", summary.sessionId] }));
      }
      if (outcome.runLimit !== undefined) io.error(chalk.yellow(`Run limit reached: ${describeRunLimit(outcome.runLimit)}. The signed loop/cancel row names it; queued work was dropped and no more is admitted.`));
      reportExitCode(io, exitCode);
    }
  };
}
