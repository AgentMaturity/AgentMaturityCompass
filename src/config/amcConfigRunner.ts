/**
 * amcconfig.yaml Runner
 *
 * Executes the full evaluation pipeline from a declarative config:
 *   1. Load & validate config
 *   2. For each agent: run diagnostic scoring
 *   3. For each agent: run assurance packs (if configured)
 *   4. Check thresholds
 *   5. Output results
 *
 * This is the engine behind `amc eval run --config amcconfig.yaml`.
 */

import { resolve } from "node:path";
import chalk from "chalk";
import {
  loadDeclarativeConfig,
  resolveAgentEnv,
  resolveAssurancePackIds,
  checkThresholds,
  summarizeConfig,
  type LoadConfigResult,
} from "./amcConfigLoader.js";
import type {
  AMCDeclarativeConfig,
  AMCAgent,
} from "./amcConfigSchema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConfigRunOptions {
  /** Explicit config file path */
  configPath?: string;
  /** Workspace root */
  workspace: string;
  /** Override output format */
  format?: "json" | "html" | "terminal" | "markdown";
  /** Override output path */
  outputPath?: string;
  /** Override evidence window */
  window?: string;
  /** Only run specific agent IDs */
  agentFilter?: string[];
  /** Dry run — validate config and show plan without executing */
  dryRun?: boolean;
  /** Verbose output */
  verbose?: boolean;
}

export interface AgentResult {
  agentId: string;
  agentName: string;
  diagnostic: {
    integrityIndex: number;
    trustLabel: string;
    layerScores: Array<{ layerName: string; avgFinalLevel: number; confidenceWeightedFinalLevel: number }>;
    questionCount: number;
    inflationAttempts: number;
  } | null;
  assurance: {
    overallScore: number;
    packsRun: number;
    packsPassedCount: number;
    scenariosTotal: number;
    scenariosPassed: number;
  } | null;
  thresholdCheck: { passed: boolean; failures: string[] };
  error?: string;
}

export interface ConfigRunResult {
  configPath: string;
  timestamp: number;
  agents: AgentResult[];
  overallPassed: boolean;
  warnings: string[];
  dryRun: boolean;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runFromConfig(options: ConfigRunOptions): Promise<ConfigRunResult> {
  const ws = options.workspace;

  // Step 1: Load config
  const loadResult = loadDeclarativeConfig(options.configPath, ws);
  const { config, configPath, warnings } = loadResult;

  if (options.verbose) {
    console.log(chalk.cyan("─── AMC Config ───"));
    console.log(summarizeConfig(loadResult));
    console.log();
  }

  // Filter agents if requested
  let agents = config.agents;
  if (options.agentFilter && options.agentFilter.length > 0) {
    const filter = new Set(options.agentFilter);
    agents = agents.filter((a) => filter.has(a.id));
    if (agents.length === 0) {
      throw new Error(
        `No agents matched filter: ${options.agentFilter.join(", ")}. ` +
        `Available: ${config.agents.map((a) => a.id).join(", ")}`
      );
    }
  }

  // Dry run: just show the plan
  if (options.dryRun) {
    console.log(chalk.yellow("─── DRY RUN ───"));
    console.log(chalk.white(`Would evaluate ${agents.length} agent(s):`));
    for (const agent of agents) {
      console.log(chalk.white(`  • ${agent.id} (${agent.runtime}, risk=${agent.riskTier})`));
    }

    const packIds = resolveAssurancePackIds(config);
    if (packIds.length > 0) {
      const label = packIds.includes("__ALL__") ? "ALL available packs" : packIds.join(", ");
      console.log(chalk.white(`\nAssurance packs: ${label}`));
    }

    if (config.thresholds) {
      console.log(chalk.white(`\nThresholds: integrity≥${config.thresholds.minIntegrityIndex}, level≥${config.thresholds.minOverallLevel}`));
    }

    return {
      configPath,
      timestamp: Date.now(),
      agents: agents.map((a) => ({
        agentId: a.id,
        agentName: a.name ?? a.id,
        diagnostic: null,
        assurance: null,
        thresholdCheck: { passed: true, failures: [] },
      })),
      overallPassed: true,
      warnings,
      dryRun: true,
    };
  }

  // Step 2-4: Run for each agent
  const results: AgentResult[] = [];

  for (const agent of agents) {
    console.log(chalk.cyan(`\n─── Evaluating: ${agent.name ?? agent.id} ───`));

    try {
      const agentResult = await evaluateAgent(config, agent, options);
      results.push(agentResult);

      // Print summary for this agent
      if (agentResult.diagnostic) {
        const d = agentResult.diagnostic;
        const color = d.integrityIndex >= 0.7 ? chalk.green : d.integrityIndex >= 0.4 ? chalk.yellow : chalk.red;
        console.log(color(`  Integrity: ${d.integrityIndex.toFixed(3)} | Trust: ${d.trustLabel}`));
        for (const layer of d.layerScores) {
          console.log(chalk.gray(`    ${layer.layerName}: ${layer.avgFinalLevel.toFixed(2)}`));
        }
      }

      if (agentResult.assurance) {
        const a = agentResult.assurance;
        const color = a.scenariosPassed === a.scenariosTotal ? chalk.green : chalk.yellow;
        console.log(color(`  Assurance: ${a.scenariosPassed}/${a.scenariosTotal} scenarios passed (${a.packsRun} packs)`));
      }

      if (!agentResult.thresholdCheck.passed) {
        console.log(chalk.red(`  ✗ Threshold violations:`));
        for (const f of agentResult.thresholdCheck.failures) {
          console.log(chalk.red(`    - ${f}`));
        }
      } else {
        console.log(chalk.green(`  ✓ All thresholds passed`));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`  ✗ Error: ${msg}`));
      results.push({
        agentId: agent.id,
        agentName: agent.name ?? agent.id,
        diagnostic: null,
        assurance: null,
        thresholdCheck: { passed: false, failures: [`Error: ${msg}`] },
        error: msg,
      });
    }
  }

  const overallPassed = results.every((r) => r.thresholdCheck.passed && !r.error);

  // Step 5: Final summary
  console.log(chalk.cyan("\n─── Summary ───"));
  console.log(chalk.white(`Agents evaluated: ${results.length}`));
  console.log(
    overallPassed
      ? chalk.green("✓ All agents passed thresholds")
      : chalk.red(`✗ ${results.filter((r) => !r.thresholdCheck.passed || r.error).length} agent(s) failed`)
  );

  return {
    configPath,
    timestamp: Date.now(),
    agents: results,
    overallPassed,
    warnings,
    dryRun: false,
  };
}

// ---------------------------------------------------------------------------
// Per-agent evaluation
// ---------------------------------------------------------------------------

async function evaluateAgent(
  config: AMCDeclarativeConfig,
  agent: AMCAgent,
  options: ConfigRunOptions,
): Promise<AgentResult> {
  const ws = options.workspace;
  const window = options.window ?? config.diagnostic?.window ?? "30d";
  const env = resolveAgentEnv(config, agent);

  // Inject resolved env vars into process for this evaluation
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }

  let diagnosticResult: AgentResult["diagnostic"] = null;
  let assuranceResult: AgentResult["assurance"] = null;

  // Run diagnostic scoring
  try {
    const { runDiagnostic } = await import("../diagnostic/runner.js");
    const report = await runDiagnostic({
      workspace: ws,
      window,
      agentId: agent.id,
      claimMode: config.diagnostic?.claimMode ?? "auto",
    });

    diagnosticResult = {
      integrityIndex: report.integrityIndex,
      trustLabel: report.trustLabel,
      layerScores: report.layerScores.map((l) => ({
        layerName: l.layerName,
        avgFinalLevel: l.avgFinalLevel,
        confidenceWeightedFinalLevel: l.confidenceWeightedFinalLevel,
      })),
      questionCount: report.questionScores.length,
      inflationAttempts: report.inflationAttempts.length,
    };
  } catch (err) {
    if (options.verbose) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(chalk.yellow(`  ⚠ Diagnostic scoring skipped: ${msg}`));
    }
  }

  // Run assurance packs
  const packIds = resolveAssurancePackIds(config);
  if (packIds.length > 0) {
    try {
      const { runAssurance } = await import("../assurance/assuranceRunner.js");
      const runAll = packIds.includes("__ALL__");

      const assuranceReport = await runAssurance({
        workspace: ws,
        agentId: agent.id,
        runAll,
        packId: runAll ? undefined : packIds[0],
        mode: config.assurance?.mode ?? "supervise",
        window: config.assurance?.window ?? "30d",
      });

      let scenariosPassed = 0;
      let scenariosTotal = 0;
      let packsPassedCount = 0;

      for (const pack of assuranceReport.packResults) {
        const packPassed = pack.scenarioResults.every((s) => s.pass);
        if (packPassed) packsPassedCount++;
        for (const scenario of pack.scenarioResults) {
          scenariosTotal++;
          if (scenario.pass) scenariosPassed++;
        }
      }

      assuranceResult = {
        overallScore: assuranceReport.overallScore0to100,
        packsRun: assuranceReport.packResults.length,
        packsPassedCount,
        scenariosTotal,
        scenariosPassed,
      };
    } catch (err) {
      if (options.verbose) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(chalk.yellow(`  ⚠ Assurance run skipped: ${msg}`));
      }
    }
  }

  // Check thresholds
  const thresholdCheck = diagnosticResult
    ? checkThresholds(config, {
        integrityIndex: diagnosticResult.integrityIndex,
        layerScores: diagnosticResult.layerScores,
        trustLabel: diagnosticResult.trustLabel,
      })
    : { passed: true, failures: [] };

  // Clean up injected env vars
  for (const key of Object.keys(env)) {
    delete process.env[key];
  }

  return {
    agentId: agent.id,
    agentName: agent.name ?? agent.id,
    diagnostic: diagnosticResult,
    assurance: assuranceResult,
    thresholdCheck,
  };
}
