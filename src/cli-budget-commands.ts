import type { Command } from "commander";
import chalk from "chalk";
import {
  budgetsPath,
  evaluateBudgetStatus,
  initBudgets,
  resetBudgetDay,
  signBudgetsConfig,
  verifyBudgetsConfigSignature
} from "./budgets/budgets.js";

/** Explicit local policy operations. Signing never initializes or rewrites limits. */
export function registerBudgetCommands(program: Command): void {
  const budgets = program.command("budgets").description("Signed autonomy and usage budgets");

  budgets.command("init")
    .option("--agent <agentId>", "agent ID", "default")
    .action((opts: { agent: string }) => {
      const out = initBudgets(process.cwd(), opts.agent);
      console.log(chalk.green(`Budgets initialized: ${out.configPath}`));
      console.log(`Signature: ${out.sigPath}`);
    });

  budgets.command("sign")
    .description("Validate and sign the existing reviewed budget limits without changing the policy")
    .option("--json", "Output signature metadata")
    .action((opts: { json?: boolean }) => {
      try {
        const workspace = process.cwd();
        const sigPath = signBudgetsConfig(workspace);
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
      if (!status.ok) process.exit(1);
    });

  budgets.command("reset")
    .requiredOption("--agent <agentId>", "agent ID")
    .requiredOption("--day <yyyy-mm-dd>", "budget day to reset")
    .action((opts: { agent: string; day: string }) => {
      const eventId = resetBudgetDay({ workspace: process.cwd(), agentId: opts.agent, day: opts.day });
      console.log(chalk.green(`Budget reset logged: ${eventId}`));
    });
}
