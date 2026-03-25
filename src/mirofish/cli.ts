/**
 * Mirofish CLI commands — registered as subcommands of `amc mirofish`.
 */
import { Command } from "commander";
import inquirer from "inquirer";
import YAML from "yaml";
import { loadScenario, listScenariosWithMeta } from "./scenarios.js";
import { runSimulation, runStressTest } from "./engine.js";
import {
  formatSimulationText,
  formatSimulationMarkdown,
  formatComparisonText,
  formatStressText,
  formatScenarioList,
} from "./format.js";
import type { SimulationOptions } from "./types.js";

function defaultSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

export function registerMirofishCommands(program: Command): void {
  const mirofish = program
    .command("mirofish")
    .description("Agent behavior simulation framework — flight simulator for AI agents");

  /* ── run ─────────────────────────────────────────── */
  mirofish
    .command("run")
    .description("Run a Monte Carlo simulation with a scenario")
    .requiredOption("--scenario <name|path>", "Built-in scenario name or custom YAML path")
    .option("--iterations <n>", "Number of Monte Carlo iterations", "1000")
    .option("--seed <n>", "Random seed for reproducibility")
    .option("--output <format>", "Output format: text, json, markdown", "text")
    .action(async (opts: { scenario: string; iterations: string; seed?: string; output: string }) => {
      const scenario = loadScenario(opts.scenario);
      const simOpts: SimulationOptions = {
        iterations: parseInt(opts.iterations, 10),
        seed: opts.seed ? parseInt(opts.seed, 10) : defaultSeed(),
      };

      const result = runSimulation(scenario, simOpts);

      switch (opts.output) {
        case "json":
          console.log(JSON.stringify(result, null, 2));
          break;
        case "markdown":
          console.log(formatSimulationMarkdown(result));
          break;
        default:
          console.log(formatSimulationText(result));
      }
    });

  /* ── list ────────────────────────────────────────── */
  mirofish
    .command("list")
    .description("List available built-in scenarios")
    .action(() => {
      const scenarios = listScenariosWithMeta();
      console.log(formatScenarioList(scenarios));
    });

  /* ── create ──────────────────────────────────────── */
  mirofish
    .command("create")
    .description("Interactive scenario builder")
    .action(async () => {
      const answers = await inquirer.prompt([
        { type: "input", name: "name", message: "Scenario name:", validate: (v: string) => v.length > 0 || "Name required" },
        { type: "input", name: "description", message: "Description:" },
        { type: "number", name: "autonomy", message: "Autonomy (0–1):", default: 0.5 },
        { type: "number", name: "errorRate", message: "Error rate (0–1):", default: 0.1 },
        { type: "number", name: "escalationFrequency", message: "Escalation frequency (0–1):", default: 0.3 },
        { type: "number", name: "toolUsage", message: "Tool usage (0–1):", default: 0.5 },
        { type: "number", name: "responseLatency", message: "Response latency (0–1):", default: 0.3 },
        { type: "number", name: "hallucinationRate", message: "Hallucination rate (0–1):", default: 0.05 },
        { type: "number", name: "complianceAdherence", message: "Compliance adherence (0–1):", default: 0.8 },
      ]);

      const scenario = {
        name: answers.name as string,
        description: (answers.description as string) || `Custom scenario: ${answers.name}`,
        version: "1.0.0",
        behavior: {
          autonomy: answers.autonomy as number,
          errorRate: answers.errorRate as number,
          escalationFrequency: answers.escalationFrequency as number,
          toolUsage: answers.toolUsage as number,
          responseLatency: answers.responseLatency as number,
          hallucinationRate: answers.hallucinationRate as number,
          complianceAdherence: answers.complianceAdherence as number,
        },
      };

      const yaml = YAML.stringify(scenario);
      console.log("\n--- Generated Scenario YAML ---\n");
      console.log(yaml);
      console.log(`Save to a .yml file and use with: amc mirofish run --scenario <path>`);
    });

  /* ── compare ─────────────────────────────────────── */
  mirofish
    .command("compare")
    .description("Side-by-side comparison of two scenarios")
    .argument("<scenario1>", "First scenario name or path")
    .argument("<scenario2>", "Second scenario name or path")
    .option("--iterations <n>", "Monte Carlo iterations per scenario", "1000")
    .option("--seed <n>", "Random seed for reproducibility")
    .action(async (scenario1: string, scenario2: string, opts: { iterations: string; seed?: string }) => {
      const s1 = loadScenario(scenario1);
      const s2 = loadScenario(scenario2);
      const simOpts: SimulationOptions = {
        iterations: parseInt(opts.iterations, 10),
        seed: opts.seed ? parseInt(opts.seed, 10) : defaultSeed(),
      };

      const r1 = runSimulation(s1, simOpts);
      const r2 = runSimulation(s2, simOpts);

      console.log(formatComparisonText(r1, r2));
    });

  /* ── stress ──────────────────────────────────────── */
  mirofish
    .command("stress")
    .description("Find governance breaking points for a scenario")
    .argument("<scenario>", "Scenario name or path")
    .option("--seed <n>", "Random seed", String(42))
    .action(async (scenarioName: string, opts: { seed: string }) => {
      const scenario = loadScenario(scenarioName);
      const result = runStressTest(scenario, {
        iterations: 100,
        seed: parseInt(opts.seed, 10),
      });

      console.log(formatStressText(result));
    });
}
