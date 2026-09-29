/**
 * CLI surface for the declarative plugin composition (Phase 1.2).
 *
 * Lives in its own module rather than cli.ts: that file is 24,700 lines and
 * under a descending line ratchet, so every command added there has to displace
 * something. Carving the composition surface out here is the same strangler
 * move ADR-0001 describes for packages.
 */
import type { Command } from "commander";
import chalk from "chalk";

export function registerCompositionCommands(program: Command): void {
  program
    .command("composition")
    .description("Inspect the declarative plugin composition (amc.cordis.yml)")
    .option("--config <path>", "composition file, relative to the workspace")
    .option("--json", "Output as JSON")
    .action(async (opts: { config?: string; json?: boolean }) => {
      try {
        // The build bundles this seam, so installed users need no private workspace packages.
        const { loadComposition, dumpComposition, renderCompositionDump } = await import("./kernel/amcRuntime.js");
        // Reads the file rather than the live tree, so a composition that does
        // not currently boot can still be inspected — which is exactly when an
        // operator most needs to see it.
        const source = loadComposition({ workspace: process.cwd(), configPath: opts.config });
        const dump = dumpComposition(source);
        if (opts.json) {
          console.log(JSON.stringify(dump, null, 2));
          return;
        }
        console.log(renderCompositionDump(dump));
      } catch (error: unknown) {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}
