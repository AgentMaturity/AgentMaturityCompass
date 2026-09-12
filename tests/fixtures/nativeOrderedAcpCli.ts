/** AUTHORED UNEXECUTED. Actual registered `amc acp` source action, not installed CLI proof. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import { registerAcpCommands } from "../../src/acp/acpCli.js";
if (process.env.AMC_NATIVE_IMAGE_FIXTURE !== "1"
    || readFileSync(join(process.cwd(), ".native-image-fixture"), "utf8") !== "disposable native ACP image fixture\n") {
  throw new Error("Ordered ACP CLI fixture requires a marked disposable workspace");
}
const program = new Command(); registerAcpCommands(program);
void program.parseAsync(process.argv).catch(() => { process.stderr.write("Ordered ACP CLI source fixture failed\n"); process.exitCode = 1; });
