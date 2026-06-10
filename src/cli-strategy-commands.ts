import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Command } from "commander";
import chalk from "chalk";
import YAML from "yaml";
import type { InferenceObjective, InferenceStrategyInput } from "./enforce/inferenceStrategy.js";

function readStrategies(path: string): InferenceStrategyInput[] {
  const raw = readFileSync(resolve(process.cwd(), path), "utf8");
  const parsed = path.endsWith(".yaml") || path.endsWith(".yml")
    ? YAML.parse(raw)
    : JSON.parse(raw);
  const value = Array.isArray(parsed) ? parsed : parsed?.strategies;
  if (!Array.isArray(value)) {
    throw new Error("Strategy file must be an array or an object with a strategies array.");
  }
  return value as InferenceStrategyInput[];
}

export function registerStrategyCommands(program: Command, activeAgent: (p: Command) => string | undefined): void {
  const strategy = program
    .command("strategy")
    .description("Compare inference strategies and govern route changes");

  strategy
    .command("compare")
    .description("Compare model/provider strategies with score, cost, latency, risk, and evidence")
    .requiredOption("--file <path>", "JSON/YAML file containing strategy records")
    .option("--agent <agentId>", "agent ID")
    .option("--objective <objective>", "balanced|quality|cost|latency|safety", "balanced")
    .option("--apply", "request a model-routes.json change", false)
    .option("--approve", "policy approval for route change", false)
    .option("--json", "JSON output")
    .action(async (opts: { file: string; agent?: string; objective: InferenceObjective; apply?: boolean; approve?: boolean; json?: boolean }) => {
      try {
        const agentId = opts.agent ?? activeAgent(program) ?? "default";
        const { compareInferenceStrategies } = await import("./enforce/inferenceStrategy.js");
        const result = compareInferenceStrategies({
          workspace: process.cwd(),
          agentId,
          strategies: readStrategies(opts.file),
          objective: opts.objective,
          applyRoute: Boolean(opts.apply),
          policyApproval: Boolean(opts.approve)
        });
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        console.log(chalk.bold(`Strategy comparison ${result.run.strategyRunId}`));
        console.log(`  Recommended: ${result.run.recommendedStrategyId}`);
        console.log(`  Confidence: ${result.run.confidence.toFixed(2)}`);
        console.log(`  Route change: ${result.run.routeChange.status}`);
        console.log(`  ${result.run.tradeoffSummary}`);
      } catch (error) {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  strategy
    .command("list")
    .description("List inference strategy comparison runs")
    .option("--agent <agentId>", "agent ID")
    .option("--limit <n>", "max runs", "10")
    .option("--json", "JSON output")
    .action(async (opts: { agent?: string; limit: string; json?: boolean }) => {
      try {
        const agentId = opts.agent ?? activeAgent(program) ?? "default";
        const limit = Number.parseInt(opts.limit, 10);
        const { listInferenceStrategyRuns } = await import("./enforce/inferenceStrategy.js");
        const runs = listInferenceStrategyRuns({ workspace: process.cwd(), agentId, limit: Number.isFinite(limit) && limit > 0 ? limit : 10 });
        if (opts.json) {
          console.log(JSON.stringify({ runs, total: runs.length }, null, 2));
          return;
        }
        for (const run of runs) {
          console.log(`${run.createdAt} ${run.strategyRunId} recommended=${run.recommendedStrategyId ?? "-"} route=${run.routeChange.status}`);
        }
      } catch (error) {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  strategy
    .command("show <run>")
    .description("Inspect an inference strategy comparison run")
    .option("--agent <agentId>", "agent ID")
    .option("--json", "JSON output")
    .action(async (run: string, opts: { agent?: string; json?: boolean }) => {
      try {
        const agentId = opts.agent ?? activeAgent(program) ?? "default";
        const { loadInferenceStrategyRun } = await import("./enforce/inferenceStrategy.js");
        const loaded = loadInferenceStrategyRun({ workspace: process.cwd(), agentId, selector: run });
        if (opts.json) {
          console.log(JSON.stringify(loaded, null, 2));
          return;
        }
        console.log(chalk.bold(`Strategy comparison ${loaded.strategyRunId}`));
        console.log(`  Recommended: ${loaded.recommendedStrategyId}`);
        console.log(`  Route change: ${loaded.routeChange.status}`);
        console.log(`  ${loaded.tradeoffSummary}`);
      } catch (error) {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  strategy
    .command("rollback <run>")
    .description("Roll back an accepted inference route change")
    .option("--agent <agentId>", "agent ID")
    .option("--json", "JSON output")
    .action(async (run: string, opts: { agent?: string; json?: boolean }) => {
      try {
        const agentId = opts.agent ?? activeAgent(program) ?? "default";
        const { rollbackInferenceStrategyRun } = await import("./enforce/inferenceStrategy.js");
        const result = rollbackInferenceStrategyRun({ workspace: process.cwd(), agentId, selector: run });
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        console.log(`${result.status}: ${result.reason}`);
      } catch (error) {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}
