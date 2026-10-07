/**
 * Child process for the P1-04 crash points: runs one journaled call and SIGKILLs itself after `started` (before the
 * request leaves) or after the system of record applied the effect (before the reply is recorded).
 * argv: workspace, crash point, oracle file, tool name.
 */
import { openActionJournal, type ActionJournal } from "../../../src/actions/actionJournal.js";
import { ToolPipeline } from "../../../src/tools/toolPipeline.js";
import { ToolRegistry } from "../../../src/tools/toolRegistry.js";
import { FAULT_ARGUMENTS, faultTools, type FaultTool } from "../../helpers/actionFaults.js";
import { FakeSystemOfRecord } from "./fakeSystemOfRecord.js";

const [workspace, point, oracleFile, tool] = process.argv.slice(2) as [string, string, string, FaultTool];
const die = (): void => { process.kill(process.pid, "SIGKILL"); };
const registry = new ToolRegistry();
for (const definition of faultTools(new FakeSystemOfRecord(oracleFile), {
  ...(point === "crash_after_start_before_dispatch" ? { beforeEffect: die } : {}),
  ...(point === "crash_after_dispatch_before_ack" ? { afterEffect: die } : {})
})) registry.define(definition);
let journal: ActionJournal | undefined;
const pipeline = new ToolPipeline({ registry, workspace, journal: () => (journal ??= openActionJournal(workspace)) });
await pipeline.execute({ name: tool, agentId: "default", arguments: FAULT_ARGUMENTS[tool], requestedMode: "EXECUTE" });
process.exit(0); // Reaching here means the crash point never fired.
