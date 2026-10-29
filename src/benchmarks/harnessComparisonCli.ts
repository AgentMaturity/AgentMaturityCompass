import type { Command } from "commander";
import { checkHarnessComparison, runHarnessComparison } from "./harnessComparison.js";
import { readComparisonFile, redactComparisonText } from "./harnessComparisonArtifacts.js";
import { harnessComparisonManifestSchema } from "./harnessComparisonSchema.js";
import { summarizeHarnessComparison } from "./harnessComparisonReport.js";

/** Integration seam: register once on the existing `bench` command. */
export function registerHarnessComparisonCommands(bench: Command): void {
  bench.command("harness-compare")
    .description("Run pinned comparison adapters and independent oracles; exits 0 pass, 1 qualified failure/fatal error, 3 unavailable/inconclusive")
    .requiredOption("--manifest <path>", "Versioned matched-harness manifest")
    .option("--out <directory>", "New directory for redacted receipts and report; required except for --check/--dry-run")
    .option("--check", "Check pins, environment and named credentials; preview trials without executing or writing results", false)
    .option("--dry-run", "Alias for --check; no adapter, oracle or model execution and no result writes", false)
    .option("--allow-adapter-execution", "Execute the pinned local adapters; their OS permission boundary is external to this runner", false)
    .option("--live", "Permit explicitly bounded live lanes using only named environment credentials", false)
    .action(async (options: { manifest: string; out?: string; check: boolean; dryRun: boolean; allowAdapterExecution: boolean; live: boolean }) => {
      const abort = new AbortController();
      const cancel = () => abort.abort();
      let secretEnv: Record<string, string> = {};
      try {
        let parsed: unknown;
        try { parsed = JSON.parse(readComparisonFile(options.manifest).toString("utf8")); }
        catch { throw new Error("Comparison manifest could not be read as bounded JSON."); }
        const manifest = harnessComparisonManifestSchema.safeParse(parsed);
        if (!manifest.success) throw new Error("Invalid harness comparison manifest.");
        const preview = options.check || options.dryRun;
        const names = preview || options.live ? [...new Set(manifest.data.lanes.flatMap(lane => lane.requiredSecretEnv))] : [];
        secretEnv = Object.fromEntries(names.flatMap(name => typeof process.env[name] === "string" ? [[name, process.env[name]!]] : []));
        if (preview) {
          const readiness = checkHarnessComparison({ manifestPath: options.manifest, secretEnv });
          console.log(JSON.stringify(readiness, null, 2));
          process.exitCode = readiness.ready ? 0 : 1;
          return;
        }
        if (!options.out) throw new Error("--out is required when executing a comparison.");
        process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
        const report = await runHarnessComparison({ manifestPath: options.manifest, outputDir: options.out,
          allowAdapterExecution: options.allowAdapterExecution, allowLive: options.live, secretEnv, signal: abort.signal });
        console.log(JSON.stringify(summarizeHarnessComparison(report), null, 2));
        process.exitCode = report.trials.some(trial => trial.status === "executed" && trial.verdict === "fail") ? 1
          : report.trials.length > 0 && report.trials.every(trial => trial.status === "executed" && trial.verdict === "pass") ? 0 : 3;
      } catch (error) {
        console.error(`Harness comparison ERROR: ${redactComparisonText(error instanceof Error ? error.message : String(error), Object.values(secretEnv)).slice(0, 1024)}`);
        process.exitCode = 1;
      } finally {
        process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel);
      }
    });
}
