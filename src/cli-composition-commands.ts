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

/**
 * Resolves the composition kernel, or null when it is absent.
 *
 * The root package declares @amc/core as a dev dependency: it is private and
 * pulls in the whole vendored Cordis tree, so it cannot be published as a
 * runtime dependency — declaring it as one made the npm tarball uninstallable
 * (`EUNSUPPORTEDPROTOCOL: Unsupported URL Type "workspace:"`). A missing module
 * here therefore means "installed from npm", not "broken install", and is
 * reported as such. Any other failure is a real error and propagates.
 */
async function importCompositionKernel(): Promise<typeof import("@amc/core") | null> {
  try {
    return await import("@amc/core");
  } catch (error: unknown) {
    if ((error as { code?: string } | null)?.code === "ERR_MODULE_NOT_FOUND") {
      return null;
    }
    throw error;
  }
}

export function registerCompositionCommands(program: Command): void {
  program
    .command("composition")
    .description("Inspect the declarative plugin composition (amc.cordis.yml)")
    .option("--config <path>", "composition file, relative to the workspace")
    .option("--json", "Output as JSON")
    .action(async (opts: { config?: string; json?: boolean }) => {
      try {
        const kernel = await importCompositionKernel();
        if (!kernel) {
          console.error(
            chalk.yellow(
              "The composition kernel (@amc/core) is not installed.\n" +
                "It is a workspace package, not part of the published npm tarball — it re-exports\n" +
                "the vendored Cordis tree, which this release does not ship. Run this command from\n" +
                "a repository checkout (npm install && npm run build:workspace)."
            )
          );
          process.exit(1);
          return;
        }
        const { loadComposition, dumpComposition, renderCompositionDump } = kernel;
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
