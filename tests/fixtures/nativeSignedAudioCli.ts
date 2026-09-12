/** AUTHORED UNEXECUTED. Real registered CLI actions, explicit disposable root.
 * No alternate provider or mock core; the test alone supplies a local HTTP peer.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import { registerAcpCommands } from "../../src/acp/acpCli.js";
import { registerAgentCommands } from "../../src/cli-agent-commands.js";
import { initWorkspace } from "../../src/workspace.js";
const workspace = process.cwd();
if (process.env.AMC_NATIVE_AUDIO_FIXTURE !== "1" || readFileSync(join(workspace, ".native-audio-fixture"), "utf8") !== "disposable native audio fixture\n") {
  throw new Error("Audio source CLI requires its explicitly marked disposable workspace");
}
if (!existsSync(join(workspace, ".amc"))) initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
const program = new Command(); registerAcpCommands(program); registerAgentCommands(program);
await program.parseAsync(process.argv);
