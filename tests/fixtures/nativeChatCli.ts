/** AUTHORED UNEXECUTED. Invokes the real registered CLI action in a separately
 * owned process. Source-command coverage, not installed-package acceptance.
 * This entrypoint refuses any workspace not explicitly marked disposable.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import { registerAgentCommands } from "../../src/cli-agent-commands.js";

async function main(): Promise<void> {
  if (process.env.AMC_NATIVE_IMAGE_FIXTURE !== "1"
      || readFileSync(join(process.cwd(), ".native-image-fixture"), "utf8") !== "disposable native ACP image fixture\n") {
    throw new Error("Chat CLI source fixture requires an explicitly marked disposable workspace");
  }
  const command = new Command();
  registerAgentCommands(command, { log: message => console.log(message), error: message => console.error(message),
    fail: () => { process.exitCode = 1; } });
  await command.parseAsync(process.argv);
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "Chat CLI fixture failed"); process.exitCode = 1; });
