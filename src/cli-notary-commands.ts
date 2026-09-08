/** Notary listener registration, separate from the main CLI command inventory. */
import type { Command } from "commander";
import chalk from "chalk";
import { notaryStartCli } from "./notary/notaryCli.js";

export function registerNotaryStartCommand(notary: Command): void {
  notary.command("start")
    .description("Start AMC Notary service (foreground)")
    .option("--notary-dir <dir>", "notary data directory")
    .option("--workspace <dir>", "workspace path for attestation snapshots")
    .option("--bind <host>", "runtime TCP listen host; preserves the saved config (default: saved host, initially 127.0.0.1)")
    .action(async (opts: { notaryDir?: string; workspace?: string; bind?: string }) => {
      const runtime = await notaryStartCli({
        notaryDir: opts.notaryDir,
        workspace: opts.workspace ?? process.cwd(),
        bindHost: opts.bind
      });
      console.log(chalk.green(`AMC Notary running at ${runtime.url}`));
      const stop = async (): Promise<void> => {
        await runtime.close();
        process.exit(0);
      };
      const onStop = (): void => {
        void stop().catch((error: unknown) => {
          console.error(chalk.red(error instanceof Error ? error.message : String(error)));
          process.exit(1);
        });
      };
      process.on("SIGINT", onStop);
      process.on("SIGTERM", onStop);
      await new Promise<void>(() => { /* hold foreground process */ });
    });
}
