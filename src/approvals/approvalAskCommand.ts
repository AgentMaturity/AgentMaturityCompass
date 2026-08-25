/**
 * `amc approvals ask` — put one question through the composed approval seam (P3.3).
 *
 * The other `approvals` subcommands are the ANSWERING side: list an inbox,
 * approve, deny. Nothing was the ASKING side, which meant the seam that blocks
 * on a human had no operator-invocable path at all. This is it — and it is the
 * plan's own verification clause made runnable: raise a question through
 * `ctx.amcApproval`, block on the real quorum-capable engine while somebody
 * decides in another terminal with `amc approvals approve`, and print the two
 * signed audit rows the pair produced.
 *
 * HIDDEN, on purpose. This is an operator and integration surface rather than a
 * product one — the ordinary caller of the seam will be the tool pipeline, not a
 * person — and hiding it keeps it out of `buildCommandInventory`, so the
 * published command-count claim is unaffected.
 *
 * The exit code is the verdict: 0 only for `allow`. A shell script that forgets
 * to read the JSON still cannot mistake `unavailable` for permission.
 */
import chalk from "chalk";
import type { Command } from "commander";
import { randomUUID } from "node:crypto";
import { isActionClass } from "../governor/actionCatalog.js";
import type { ActionClass } from "../types.js";
import type { ApprovalRiskTier } from "./seam/approvalSeamTypes.js";

interface AskOptions {
  agent: string;
  tool: string;
  actionClass: string;
  risk?: string;
  reason?: string;
  callId?: string;
  json?: boolean;
}

const RISK_TIERS: readonly ApprovalRiskTier[] = ["low", "medium", "high", "critical"];

function parseRiskTier(value: string | undefined): ApprovalRiskTier | null {
  if (value === undefined) return "high";
  const normalized = value.trim().toLowerCase();
  return (RISK_TIERS as readonly string[]).includes(normalized) ? (normalized as ApprovalRiskTier) : null;
}

/** Import the composed runner, or explain that the kernel is not installed. */
async function importRunner(): Promise<typeof import("../kernel/approvalSeamRunner.js") | null> {
  try {
    return await import("../kernel/approvalSeamRunner.js");
  } catch (error: unknown) {
    if ((error as { code?: string } | null)?.code === "ERR_MODULE_NOT_FOUND") {
      console.error(
        chalk.yellow(
          "The composition kernel (@amc/core) is not installed.\n" +
            "`approvals ask` puts the question through the composed tree, and that tree lives in\n" +
            "workspace packages this release does not publish. Run from a repository checkout\n" +
            "(npm install && npm run build:workspace)."
        )
      );
      return null;
    }
    throw error;
  }
}

export function registerApprovalAskCommand(approvals: Command): void {
  approvals
    .command("ask", { hidden: true })
    .description("Raise one approval through the composed seam and block until it is answered (internal)")
    .requiredOption("--agent <agentId>", "agent ID the question is asked on behalf of")
    .requiredOption("--tool <name>", "the tool the question is about")
    .requiredOption("--action-class <class>", "action class whose signed policy rule governs the question")
    .option("--risk <tier>", "low|medium|high|critical", "high")
    .option("--reason <text>", "why permission is being asked for")
    .option("--call-id <id>", "the tool call being decided, when there is one")
    .option("--json", "Output as JSON")
    .action(async (opts: AskOptions) => {
      const actionClass = opts.actionClass.trim().toUpperCase();
      if (!isActionClass(actionClass)) {
        console.error(chalk.red(`Invalid action class: ${opts.actionClass}`));
        process.exitCode = 1;
        return;
      }
      const riskTier = parseRiskTier(opts.risk);
      if (riskTier === null) {
        console.error(chalk.red(`Invalid risk tier: ${opts.risk ?? ""} (expected ${RISK_TIERS.join("|")})`));
        process.exitCode = 1;
        return;
      }
      const runner = await importRunner();
      if (runner === null) {
        process.exitCode = 1;
        return;
      }

      // Ctrl-C WITHDRAWS the question rather than killing the process: the seam
      // then cancels the engine request, so an abandoned ask does not leave a
      // live grant behind for something else to spend.
      const withdrawal = new AbortController();
      const onSigint = (): void => {
        console.error(chalk.yellow("\nwithdrawing the question…"));
        withdrawal.abort();
      };
      process.on("SIGINT", onSigint);

      try {
        const outcome = await runner.runComposedApproval({
          workspace: process.cwd(),
          agentId: opts.agent,
          onRaised: (event) => {
            if (opts.json) return;
            console.log(chalk.bold(`approval raised: ${event.approvalRequestId}`));
            console.log(
              chalk.gray(
                `  answer it with: amc approvals approve --agent ${opts.agent} ` +
                  `--mode execute --reason "…" --username "…" --roles APPROVER ${event.approvalRequestId}`
              )
            );
          },
          ask: {
            // A direct operator ask has no tool call behind it, and the id says
            // so rather than pretending to name a `tool/call` row that the log
            // does not contain.
            toolCallId: opts.callId ?? `operator-ask:${randomUUID()}`,
            toolName: opts.tool,
            actionClass: actionClass as ActionClass,
            riskTier,
            question: opts.reason ?? `operator asked whether ${opts.tool} may run`,
            intentPayload: { tool: opts.tool, askedBy: "cli", actionClass },
            signal: withdrawal.signal
          }
        });

        if (opts.json) {
          console.log(JSON.stringify({ sessionId: outcome.sessionId, ...outcome.decision }, null, 2));
        } else {
          const decision = outcome.decision;
          const paint = decision.answer === "allow" ? chalk.green : chalk.red;
          console.log(paint(`answer: ${decision.answer} (${decision.answeredBy})`));
          console.log(`  reason:  ${decision.reason}`);
          console.log(`  session: ${outcome.sessionId}`);
          console.log(`  audit:   ${decision.requestEventId} → ${decision.answerEventId}`);
        }
        if (!outcome.decision.proceed) process.exitCode = 1;
      } finally {
        process.removeListener("SIGINT", onSigint);
      }
    });
}
