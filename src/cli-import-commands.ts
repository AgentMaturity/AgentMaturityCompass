import { resolve } from "node:path";
import type { Command } from "commander";
import chalk from "chalk";

export function registerNeutralImportCommands(program: Command, activeAgent: (p: Command) => string | undefined): void {
  program
    .command("import <path>")
    .description("Import neutral traces, runs, workflow graphs, configs, memory, evals, and benchmarks")
    .option("--agent <agentId>", "agent ID")
    .option("--dry-run", "detect and summarize without writing artifacts", false)
    .option("--validate", "validate support without writing artifacts", false)
    .option("--json", "JSON output")
    .action(async (path: string, opts: { agent?: string; dryRun?: boolean; validate?: boolean; json?: boolean }) => {
      try {
        const agentId = opts.agent ?? activeAgent(program) ?? "default";
        const mode = opts.validate ? "validate" : opts.dryRun ? "dry-run" : "import";
        const { runNeutralImport } = await import("./importers/neutralImporter.js");
        const result = runNeutralImport({
          workspace: process.cwd(),
          inputPath: resolve(process.cwd(), path),
          agentId,
          mode
        });
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        console.log(chalk.bold(`Neutral import ${result.importId}`));
        console.log(`  Mode: ${result.mode}`);
        console.log(`  Status: ${result.plan.status}`);
        console.log(`  Artifacts: ${result.plan.candidateCount}`);
        console.log(`  Categories: ${result.plan.categories.join(", ") || "-"}`);
        console.log(`  Redactions: ${result.plan.redactionCount}`);
        if (!result.applied) {
          console.log(chalk.gray("  Dry run only. Re-run without --dry-run or --validate to write AMC evidence."));
          for (const path of result.plan.wouldWrite.slice(0, 8)) {
            console.log(chalk.gray(`  would write ${path}`));
          }
          return;
        }
        console.log(chalk.green("  Imported into AMC evidence."));
        console.log(`  Episode: ${result.episode?.episode.episodeId ?? "-"}`);
        console.log(`  Lifecycle: ${result.lifecycleRun?.artifact.lifecycleRunId ?? "-"}`);
        console.log(`  Trace index: ${result.traceFailureIndex?.ref.indexId ?? "-"}`);
        console.log(`  Manifest: ${result.resourceManifest?.manifest.manifestId ?? "-"}`);
      } catch (error) {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  const imports = program
    .command("imports")
    .description("List, inspect, and roll back neutral import runs");

  imports
    .command("list")
    .description("List recent neutral import runs")
    .option("--limit <n>", "max imports", "25")
    .option("--json", "JSON output")
    .action(async (opts: { limit: string; json?: boolean }) => {
      try {
        const { listNeutralImports } = await import("./importers/neutralImporter.js");
        const limit = Number.parseInt(opts.limit, 10);
        const rows = listNeutralImports({
          workspace: process.cwd(),
          limit: Number.isFinite(limit) && limit > 0 ? limit : 25
        });
        if (opts.json) {
          console.log(JSON.stringify({ imports: rows, total: rows.length }, null, 2));
          return;
        }
        if (rows.length === 0) {
          console.log(chalk.dim("No neutral imports found."));
          return;
        }
        for (const row of rows) {
          console.log(`${row.createdAt} ${row.importId} artifacts=${row.plan.candidateCount} categories=${row.plan.categories.join(",")}`);
        }
      } catch (error) {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  imports
    .command("show <importId>")
    .description("Inspect a neutral import manifest")
    .option("--json", "JSON output")
    .action(async (importId: string, opts: { json?: boolean }) => {
      try {
        const { loadNeutralImportManifest } = await import("./importers/neutralImporter.js");
        const manifest = loadNeutralImportManifest({ workspace: process.cwd(), importId });
        if (opts.json) {
          console.log(JSON.stringify(manifest, null, 2));
          return;
        }
        console.log(chalk.bold(`Neutral import ${manifest.importId}`));
        console.log(`  Created: ${manifest.createdAt}`);
        console.log(`  Agent: ${manifest.agentId}`);
        console.log(`  Source: ${manifest.sourcePath}`);
        console.log(`  Categories: ${manifest.plan.categories.join(", ") || "-"}`);
        console.log(`  Redactions: ${manifest.plan.redactionCount}`);
      } catch (error) {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  imports
    .command("rollback <importId>")
    .description("Remove files written by a neutral import run")
    .option("--json", "JSON output")
    .action(async (importId: string, opts: { json?: boolean }) => {
      try {
        const { rollbackNeutralImport } = await import("./importers/neutralImporter.js");
        const result = rollbackNeutralImport({ workspace: process.cwd(), importId });
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        const removed = result.removed.filter((entry) => entry.status === "removed").length;
        console.log(chalk.green(`Rolled back ${removed} file(s).`));
        console.log(`Receipt: ${result.receiptPath}`);
      } catch (error) {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}
