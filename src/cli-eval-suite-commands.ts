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

/** A whole number within bounds, or a thrown error naming the flag: a typo must never run (and sign) a suite of crashed attempts. */
function parseBounded(flag: string, raw: string, min: number, max: number): number {
  const value = /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : Number.NaN;
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${flag} must be an integer from ${min} to ${max}, got ${JSON.stringify(raw)}`);
  return value;
}

export function registerEvalSuiteCommands(program: Command): void {
  // The real CLI creates `eval` first (src/cli.ts); a host that registers the late-stage commands on a bare program gets the group here.
  const evalGroup = program.commands.find((command) => command.name() === "eval") ?? program.command("eval").description("Eval interop import and coverage status");
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
    .option("--keep-dirs", "keep attempt directories under workspace/output/amc-eval/<runId>")
    .option("--json", "print the results JSON")
    .action(async (suitePath: string, opts: RunOptions) => {
      const { loadEvalSuite } = await import("./eval/suiteLoader.js");
      const { runEvalSuite } = await import("./eval/suiteRunner.js");
      try {
        const attempts = parseBounded("--attempts", opts.attempts ?? "1", 1, 10);
        const maxSteps = opts.maxSteps === undefined ? undefined : parseBounded("--max-steps", opts.maxSteps, 1, 1024);
        const loaded = loadEvalSuite(suitePath);
        const { results, json, resultsSha256 } = await runEvalSuite({ workspace: process.cwd(), loaded, attempts,
          provider: { providerId: opts.provider ?? "stub", ...(opts.model === undefined ? {} : { model: opts.model }), ...(opts.baseUrl === undefined ? {} : { baseUrl: opts.baseUrl }),
            ...(opts.credential === undefined ? {} : { credential: opts.credential }), maxSteps: maxSteps ?? loaded.suite.defaults.maxSteps },
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
        console.log(`  pass rate ${results.summary.passRate === null ? "n/a" : (results.summary.passRate * 100).toFixed(1) + "%"} over ${results.summary.attempts - results.summary.errors} graded attempt(s)${results.summary.errors ? ` (${results.summary.errors} error(s) neither pass nor fail)` : ""}; task pass rate ${results.summary.taskPassRate === null ? "n/a" : (results.summary.taskPassRate * 100).toFixed(1) + "%"}`);
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
    .description("Reduce a recorded results file to a baseline and record its digest in the ledger")
    .argument("<results>", "results JSON from `eval suite run --out` (its digest must be a recorded EVAL_SUITE_RUN)")
    .requiredOption("--out <path>", "baseline JSON to write (amc.eval-baseline/v1)")
    .action(async (resultsPath: string, opts: { out: string }) => {
      const { baselineFromResults, recordBaseline, recordedDigests } = await import("./eval/suiteCompare.js");
      try {
        if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode cannot build a baseline: the run digest it would check is not signed");
        const resultsJson = readFileSync(resolve(resultsPath), "utf8");
        const recorded = recordedDigests(process.cwd());
        // An edited results file must not be laundered into a signed baseline that every later run is gated against.
        if (!recorded.runs.has(sha256Hex(resultsJson))) throw new Error("results file digest is not a recorded EVAL_SUITE_RUN in this workspace's verified ledger (edited, or from another workspace); a baseline is only built from a recorded run");
        const baseline = baselineFromResults(resultsJson);
        const json = JSON.stringify(baseline, null, 2);
        const digest = sha256Hex(json);
        // File first, then the record; recording is idempotent, so a retry after a failed write never hits a duplicate session id.
        writeFileSync(resolve(opts.out), json);
        if (!recorded.baselines.has(digest)) recordBaseline(process.cwd(), baseline, digest);
        console.log(chalk.green(`Wrote ${resolve(opts.out)} (${Object.keys(baseline.tasks).length} task(s) from run ${baseline.fromRunId}${recorded.baselines.has(digest) ? "; digest already recorded" : ""})`));
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
        const recorded = recordedDigests(process.cwd());
        const verdict = compareResults({ baselineJson, resultsJson, gate, recorded });
        const code = verdict.status === "pass" ? 0 : verdict.status === "fail" ? 1 : 2;
        if (opts.json) console.log(JSON.stringify({ ...verdict, gate, recorded: { results: recorded.runs.has(sha256Hex(resultsJson)), baseline: recorded.baselines.has(sha256Hex(baselineJson)) } }, null, 2));
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
