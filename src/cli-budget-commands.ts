import type { Command } from "commander";
import chalk from "chalk";
import {
  acceptUnknownUsageAsync,
  budgetsPath,
  evaluateBudgetStatus,
  initBudgetsAsync,
  resetBudgetDay,
  signBudgetsConfigAsync,
  verifyBudgetsConfigSignature
} from "./budgets/budgets.js";

/** Explicit local policy operations. Signing never initializes or rewrites limits. */
export function registerBudgetCommands(program: Command): void {
  const budgets = program.command("budgets").description("Signed autonomy and usage budgets");

  budgets.command("init")
    .option("--agent <agentId>", "agent ID", "default")
    .action(async (opts: { agent: string }) => {
      const out = await initBudgetsAsync(process.cwd(), opts.agent);
      console.log(chalk.green(`Budgets initialized: ${out.configPath}`));
      console.log(`Signature: ${out.sigPath}`);
    });

  budgets.command("sign")
    .description("Validate and sign the existing reviewed budget limits without changing the policy")
    .option("--json", "Output signature metadata")
    .action(async (opts: { json?: boolean }) => {
      try {
        const workspace = process.cwd();
        const sigPath = await signBudgetsConfigAsync(workspace);
        if (opts.json) console.log(JSON.stringify({ ok: true, configPath: budgetsPath(workspace), sigPath }, null, 2));
        else console.log(chalk.green(`Reviewed budgets signed: ${sigPath}`));
      } catch {
        const message = "Budget signing refused. Review the existing .amc/budgets.yaml limits and local signing access, then retry budgets sign.";
        if (opts.json) console.log(JSON.stringify({ ok: false, code: "BUDGET_SIGNING_REFUSED", message }, null, 2));
        else console.error(message);
        process.exitCode = 1;
      }
    });

  budgets.command("verify")
    .action(() => {
      const verify = verifyBudgetsConfigSignature(process.cwd());
      if (!verify.valid) {
        console.log(chalk.red(`Invalid budgets signature: ${verify.reason ?? "unknown"}`));
        process.exit(1);
      }
      console.log(chalk.green("Budgets signature valid"));
    });

  budgets.command("status")
    .requiredOption("--agent <agentId>", "agent ID")
    .action((opts: { agent: string }) => {
      const status = evaluateBudgetStatus(process.cwd(), opts.agent);
      console.log(JSON.stringify(status, null, 2));
      if (!status.ok) {
        // The JSON stays machine-readable on stdout; the person reads why and what to do on stderr.
        console.error(chalk.red(`Budget for agent ${opts.agent} is blocking: ${status.reasons.join("; ")}.`));
        for (const step of status.next) console.error(`Next: ${step}`);
        process.exit(1);
      }
    });

  budgets.command("reset")
    .description("Record a budget-day reset (it does not restore allowance), or accept earlier unknown model usage")
    .requiredOption("--agent <agentId>", "agent ID")
    .option("--day <yyyy-mm-dd>", "budget day to record a reset for")
    .option("--accept-unknown", "sign into budgets.yaml that model requests recorded so far with unknown usage no longer block this agent; limits are unchanged")
    .action(async (opts: { agent: string; day?: string; acceptUnknown?: boolean }) => {
      if (opts.day === undefined && opts.acceptUnknown !== true) {
        console.error("Give --day <yyyy-mm-dd> to record a reset, or --accept-unknown to accept earlier unknown model usage.");
        process.exitCode = 1;
        return;
      }
      if (opts.day !== undefined) {
        const eventId = resetBudgetDay({ workspace: process.cwd(), agentId: opts.agent, day: opts.day });
        console.log(chalk.green(`Budget reset logged: ${eventId}`));
      }
      if (opts.acceptUnknown === true) {
        try {
          const accepted = await acceptUnknownUsageAsync(process.cwd(), opts.agent);
          console.log(chalk.green(`Accepted: model requests recorded before ${accepted.acceptedBefore} with unknown usage no longer block agent ${opts.agent}.`));
          console.log(`Signed into budgets.perAgent.${accepted.entry}.acceptUnknownUsageBefore in .amc/budgets.yaml. Limits are unchanged; a later request with unknown usage blocks again.`);
        } catch (error) {
          console.error(`Could not sign the acceptance: ${error instanceof Error ? error.message : String(error)}`);
          process.exitCode = 1;
        }
      }
    });
}
