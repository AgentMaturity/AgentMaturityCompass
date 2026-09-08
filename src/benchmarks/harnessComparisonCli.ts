import type { Command } from "commander";
import { runHarnessComparison } from "./harnessComparison.js";
import { readComparisonFile } from "./harnessComparisonArtifacts.js";
import { harnessComparisonManifestSchema } from "./harnessComparisonSchema.js";
import { summarizeHarnessComparison } from "./harnessComparisonReport.js";

/** Integration seam: register once on the existing `bench` command. */
export function registerHarnessComparisonCommands(bench: Command): void {
  bench.command("harness-compare")
    .description("Run pinned comparison adapters and independent oracles; unavailable measurements remain N/A")
    .requiredOption("--manifest <path>", "Versioned matched-harness manifest")
    .requiredOption("--out <directory>", "New directory for redacted receipts and report")
    .option("--allow-adapter-execution", "Execute the pinned local adapters; their OS permission boundary is external to this runner", false)
    .option("--live", "Permit explicitly bounded live lanes using only named environment credentials", false)
    .action(async (options: { manifest: string; out: string; allowAdapterExecution: boolean; live: boolean }) => {
      let parsed: unknown;
      try { parsed = JSON.parse(readComparisonFile(options.manifest).toString("utf8")); }
      catch { throw new Error("Comparison manifest could not be read as bounded JSON."); }
      const manifest = harnessComparisonManifestSchema.safeParse(parsed);
      if (!manifest.success) throw new Error("Invalid harness comparison manifest.");
      const names = options.live ? [...new Set(manifest.data.lanes.filter(lane => lane.kind === "live-provider").flatMap(lane => lane.requiredSecretEnv))] : [];
      const secretEnv = Object.fromEntries(names.flatMap(name => typeof process.env[name] === "string" ? [[name, process.env[name]!]] : []));
      const abort = new AbortController();
      const cancel = () => abort.abort();
      process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
      try {
        const report = await runHarnessComparison({ manifestPath: options.manifest, outputDir: options.out,
          allowAdapterExecution: options.allowAdapterExecution, allowLive: options.live, secretEnv, signal: abort.signal });
        console.log(JSON.stringify(summarizeHarnessComparison(report), null, 2));
        // An unavailable-only or inconclusive comparison must not look like a green gate.
        if (report.trials.some(trial => trial.status !== "executed" || trial.verdict !== "pass")) process.exitCode = 1;
      } finally {
        process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel);
      }
    });
}
