import type { Command } from "commander";
import chalk from "chalk";
import { formatToolhubContextText, initToolhubConfig, inspectToolhubContextForCli, verifyToolhubConfig } from "./toolhub/toolhubCli.js";
import { signToolsConfig, toolsConfigPath } from "./toolhub/toolhubValidators.js";

export function registerToolsCommands(program: Command): void {
  const tools = program.command("tools").description("ToolHub tools config");

  tools.command("init")
    .description("Create and sign .amc/tools.yaml")
    .action(() => {
      const created = initToolhubConfig(process.cwd());
      console.log(chalk.green(`Tools config created: ${created.configPath}`));
      console.log(`Signature: ${created.sigPath}`);
    });

  tools.command("sign")
    .description("Validate and sign the existing reviewed tool policy without changing its grants")
    .option("--json", "Output signature metadata")
    .action((opts: { json?: boolean }) => {
      try {
        const workspace = process.cwd();
        const sigPath = signToolsConfig(workspace);
        if (opts.json) console.log(JSON.stringify({ ok: true, configPath: toolsConfigPath(workspace), sigPath }, null, 2));
        else console.log(chalk.green(`Reviewed tool policy signed: ${sigPath}`));
      } catch {
        const message = "Tool policy signing refused. Review the existing .amc/tools.yaml grants and local signing access, then retry tools sign.";
        if (opts.json) console.log(JSON.stringify({ ok: false, code: "TOOLS_SIGNING_REFUSED", message }, null, 2));
        else console.error(message);
        process.exitCode = 1;
      }
    });

  tools.command("verify")
    .description("Verify tools.yaml signature")
    .action(() => {
      const verify = verifyToolhubConfig(process.cwd());
      if (verify.valid) {
        console.log(chalk.green(`Tools config signature valid: ${verify.sigPath}`));
        return;
      }
      console.log(chalk.red(`Tools config signature invalid: ${verify.reason ?? "unknown reason"}`));
      process.exit(1);
    });

  tools.command("list")
    .description("List signed ToolHub tools grouped by provider context")
    .option("--json", "emit the complete tool context projection as JSON", false)
    .action((opts: { json?: boolean }) => {
      const projection = inspectToolhubContextForCli(process.cwd());
      console.log(opts.json ? JSON.stringify(projection, null, 2) : formatToolhubContextText(projection));
      if (projection.integrity.status !== "trusted") process.exitCode = 1;
    });
}
