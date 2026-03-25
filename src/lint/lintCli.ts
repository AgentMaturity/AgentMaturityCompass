/**
 * CLI handler for `amc lint` command
 */

import { Command } from "commander";
import chalk from "chalk";
import { lintConfigs, formatLintText, formatLintJson, formatLintSarif } from "./linter.js";
import { listLintRules } from "./rules.js";

export function registerLintCommands(program: Command): void {
  const lint = program
    .command("lint")
    .description("Lint agent configuration files for schema compliance, anti-patterns, and best practices")
    .option("--fix", "Auto-fix simple issues where possible", false)
    .option("--format <fmt>", "Output format: text, json, sarif", "text")
    .option("--rules <ids...>", "Only run specific rule IDs")
    .option("--workspace <path>", "Workspace path", process.cwd())
    .action((opts: { fix: boolean; format: string; rules?: string[]; workspace: string }) => {
      const result = lintConfigs({
        workspace: opts.workspace,
        fix: opts.fix,
        rules: opts.rules,
      });

      if (opts.format === "json") {
        console.log(formatLintJson(result));
      } else if (opts.format === "sarif") {
        console.log(JSON.stringify(formatLintSarif(result), null, 2));
      } else {
        if (result.diagnostics.length === 0) {
          console.log(chalk.green("✓ No lint issues found"));
        } else {
          console.log(formatLintText(result));
        }
      }

      if (result.errorCount > 0 && !opts.fix) {
        process.exit(1);
      }
    });

  lint
    .command("rules")
    .description("List all available lint rules")
    .option("--json", "JSON output", false)
    .action((opts: { json: boolean }) => {
      const rules = listLintRules();
      if (opts.json) {
        console.log(JSON.stringify(rules.map(({ id, description, severity }) => ({ id, description, severity })), null, 2));
        return;
      }
      console.log(chalk.bold("Available Lint Rules:\n"));
      for (const r of rules) {
        const icon = r.severity === "error" ? chalk.red("ERR") : r.severity === "warning" ? chalk.yellow("WRN") : chalk.cyan("INF");
        console.log(`  ${icon}  ${chalk.bold(r.id.padEnd(28))} ${r.description}`);
      }
    });
}
