/**
 * Register the REPL as a Commander command + wire bare `amc` to it.
 */

import type { Command } from "commander";

export function registerReplCommand(program: Command): void {
  program
    .command("shell")
    .description("Interactive AMC session — natural language + commands")
    .option("--agent <id>", "Agent to use", "default")
    .action(async (opts: { agent?: string }) => {
      const { startRepl } = await import("./amcRepl.js");
      await startRepl({ agent: opts.agent });
    });
}
