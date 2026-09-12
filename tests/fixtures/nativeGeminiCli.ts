/** AUTHORED UNEXECUTED. Actual registered CLI actions in a marked scratch root.
 * No provider runtime/HTTP replacement; callers supply a disposable local server.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import { registerAcpCommands } from "../../src/acp/acpCli.js";
import { registerAgentCommands } from "../../src/cli-agent-commands.js";
import { initWorkspace } from "../../src/workspace.js";

if (process.env.AMC_NATIVE_GEMINI_FIXTURE !== "1"
    || readFileSync(join(process.cwd(), ".native-gemini-fixture"), "utf8") !== "disposable native Gemini fixture\n") {
  throw new Error("Gemini CLI fixture requires an explicitly marked disposable workspace");
}
if (!existsSync(join(process.cwd(), ".amc"))) initWorkspace({ workspacePath: process.cwd(), agentId: "default", trustBoundaryMode: "isolated" });
const program = new Command().name("amc");
registerAcpCommands(program); registerAgentCommands(program);
await program.parseAsync(process.argv);
