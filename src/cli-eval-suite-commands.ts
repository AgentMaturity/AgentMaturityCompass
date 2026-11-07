/**
 * `amc eval suite run | baseline | compare` (SH-OBS-04): task suites against the governed native agent with graders,
 * pass@k, baselines and gates. Exit codes for compare: 0 pass, 1 fail, 2 inconclusive.
 */
import type { Command } from "commander";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import chalk from "chalk";
import { sha256Hex } from "./utils/hash.js";

interface RunOptions { provider?: string; model?: string; baseUrl?: string; credential?: string; attempts?: string; out?: string; tasks?: string;
  agent?: string; unsafeUnconfinedGraders?: boolean; keepDirs?: boolean; maxSteps?: string; json?: boolean }

export function registerEvalSuiteCommands(program: Command): void {
  const evalGroup = program.commands.find((command) => command.name() === "eval");
  if (!evalGroup) throw new Error("the eval command group must be registered before eval suite commands");
  const suite = evalGroup.command("suite").description("Task suites run against the native agent: graders, pass@k, baselines and gates");

  suite
    .command("run")
    .description("Run every task of a suite N times through the governed native agent and grade each attempt")
    .argument("<suite>", "suite YAML (amc.eval-suite/v1)")
    .option("--provider <id>", "provider route: stub, or a configured provider id", "stub")
    .option("--model <model>", "model for the provider route")
    .option("--base-url <url>", "provider base URL override")
    .option("--credential <ref>", "credential reference for the provider")
    .option("--attempts <n>", "attempts per task (1-10); pass@1..n are reported", "1")
    .option("--out <path>", "write the results JSON here (amc.eval-results/v1)")
    .option("--tasks <ids>", "comma-separated task ids to run")
    .option("--agent <agentId>", "agent id the eval sessions run under", "eval-suite")
    .option("--max-steps <n>", "max loop steps per attempt (default: the suite's)")
    .option("--unsafe-unconfined-graders", "run script/tests graders WITHOUT an OS sandbox when none is available (recorded as confined:false)")
    .option("--keep-dirs", "keep attempt directories under .amc-eval/<runId>")
    .option("--json", "print the results JSON")
    .action(async (suitePath: string, opts: RunOptions) => {
      const { loadEvalSuite } = await import("./eval/suiteLoader.js");
      const { runEvalSuite } = await import("./eval/suiteRunner.js");
      try {
        const attempts = Number.parseInt(opts.attempts ?? "1", 10);
        const loaded = loadEvalSuite(suitePath);
        const { results, json, resultsSha256 } = await runEvalSuite({ workspace: process.cwd(), loaded, attempts,
          provider: { providerId: opts.provider ?? "stub", ...(opts.model === undefined ? {} : { model: opts.model }), ...(opts.baseUrl === undefined ? {} : { baseUrl: opts.baseUrl }),
            ...(opts.credential === undefined ? {} : { credential: opts.credential }), maxSteps: opts.maxSteps === undefined ? loaded.suite.defaults.maxSteps : Number.parseInt(opts.maxSteps, 10) },
          ...(opts.agent === undefined ? {} : { agentId: opts.agent }), ...(opts.tasks === undefined ? {} : { taskIds: opts.tasks.split(",").map((id) => id.trim()).filter(Boolean) }),
          allowUnconfinedGraders: opts.unsafeUnconfinedGraders === true, keepDirs: opts.keepDirs === true, onProgress: (line) => { if (!opts.json) console.error(chalk.gray(line)); } });
        if (opts.out !== undefined) writeFileSync(resolve(opts.out), json);
        if (opts.json) { console.log(json); return; }
        console.log(chalk.bold(`Eval suite ${results.suiteId} run ${results.runId} (${results.provider.providerId}${results.provider.model ? `/${results.provider.model}` : ""}, ${attempts} attempt(s) per task)`));
        for (const task of results.tasks) {
          const atK = Object.entries(task.score.passAtK).map(([k, v]) => `${k} ${v.toFixed(2)}`).join("  ");
          console.log(`  ${task.taskId.padEnd(24)} ${String(task.score.passes).padStart(2)}/${task.score.attempts} pass${task.score.errors ? `, ${task.score.errors} error` : ""}  ${atK}`);
          for (const attempt of task.attempts) for (const grader of attempt.graders) if (grader.status !== "pass") console.log(chalk.gray(`    #${attempt.attempt} ${grader.type} ${grader.status}: ${grader.detail.split("\n")[0]}`));
        }
        const cost = results.summary.cost;
        console.log(`  pass rate ${results.summary.passRate === null ? "n/a" : (results.summary.passRate * 100).toFixed(1) + "%"} over ${results.summary.attempts} attempts; task pass rate ${results.summary.taskPassRate === null ? "n/a" : (results.summary.taskPassRate * 100).toFixed(1) + "%"}`);
        console.log(`  cost ${cost.complete && cost.attributedUsd !== null ? `$${cost.attributedUsd.toFixed(6)}` : `unavailable (${cost.unknownRequests} unknown requests)`}; latency p50 ${results.summary.latency.p50Ms ?? "n/a"} ms, p95 ${results.summary.latency.p95Ms ?? "n/a"} ms`);
        console.log(chalk.gray(`  results sha256 ${resultsSha256} recorded as ${"EVAL_SUITE_RUN"}${opts.out ? `; written to ${resolve(opts.out)}` : ""}`));
        if (results.provider.providerId === "stub") console.log(chalk.gray("  stub provider: this run proves the grading path, not model quality."));
      } catch (error) {
        console.error(chalk.red(`eval suite run failed: ${error instanceof Error ? error.message : String(error)}`));
        process.exitCode = 1;
      }
    });

  suite
    .command("baseline")
    .description("Reduce a results file to a baseline and record its digest in the ledger")
    .argument("<results>", "results JSON from `eval suite run --out`")
    .requiredOption("--out <path>", "baseline JSON to write (amc.eval-baseline/v1)")
    .action(async (resultsPath: string, opts: { out: string }) => {
      const { baselineFromResults, recordBaseline } = await import("./eval/suiteCompare.js");
      try {
        const baseline = baselineFromResults(readFileSync(resolve(resultsPath), "utf8"));
        const json = JSON.stringify(baseline, null, 2);
        recordBaseline(process.cwd(), baseline, sha256Hex(json));
        writeFileSync(resolve(opts.out), json);
        console.log(chalk.green(`Wrote ${resolve(opts.out)} (${Object.keys(baseline.tasks).length} task(s) from run ${baseline.fromRunId})`));
      } catch (error) {
        console.error(chalk.red(`eval suite baseline failed: ${error instanceof Error ? error.message : String(error)}`));
        process.exitCode = 1;
      }
    });

  suite
    .command("compare")
    .description("Gate a results file against a baseline: pass (0), fail (1) or inconclusive (2)")
    .argument("<baseline>", "baseline JSON")
    .argument("<results>", "results JSON")
    .option("--gate <path>", "gate JSON { minPassRate?, maxRegressedTasks, minAttemptsPerTask, requireSameSuite, maxCostIncreaseRatio? }")
    .option("--json", "Output as JSON")
    .action(async (baselinePath: string, resultsPath: string, opts: { gate?: string; json?: boolean }) => {
      const { compareResults, gateSchema, recordedDigests } = await import("./eval/suiteCompare.js");
      try {
        if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode cannot gate: the digests it would check are not signed");
        const baselineJson = readFileSync(resolve(baselinePath), "utf8");
        const resultsJson = readFileSync(resolve(resultsPath), "utf8");
        const gate = gateSchema.parse(opts.gate === undefined ? {} : JSON.parse(readFileSync(resolve(opts.gate), "utf8")));
        const recorded = recordedDigests(process.cwd(), sha256Hex(resultsJson), sha256Hex(baselineJson));
        const verdict = compareResults({ baselineJson, resultsJson, gate, recorded });
        const code = verdict.status === "pass" ? 0 : verdict.status === "fail" ? 1 : 2;
        if (opts.json) console.log(JSON.stringify({ ...verdict, gate, recorded }, null, 2));
        else {
          const colour = verdict.status === "pass" ? chalk.green : verdict.status === "fail" ? chalk.red : chalk.yellow;
          console.log(colour(`Eval gate ${verdict.status.toUpperCase()}`));
          console.log(`  pass rate baseline ${verdict.passRate.baseline === null ? "n/a" : (verdict.passRate.baseline * 100).toFixed(1) + "%"} -> current ${verdict.passRate.current === null ? "n/a" : (verdict.passRate.current * 100).toFixed(1) + "%"}; regressed ${verdict.regressedTasks.length}, improved ${verdict.improvedTasks.length}${verdict.costRatio === null ? "" : `; cost ratio ${verdict.costRatio.toFixed(3)}`}`);
          for (const reason of verdict.reasons) console.log(`  - ${reason}`);
        }
        process.exitCode = code;
      } catch (error) {
        console.error(chalk.red(`eval suite compare failed: ${error instanceof Error ? error.message : String(error)}`));
        process.exitCode = 2;
      }
    });
}
