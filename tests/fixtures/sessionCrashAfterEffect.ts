/**
 * Child process for P2-12: a native session whose call is interrupted by SIGKILL. `payment`: a journaled FINANCIAL call
 * reaches its system of record and the process dies before the call's receipt or `tool/result` is written. `read`: a
 * READ_ONLY call is recorded and the process dies before it runs. `write`: an fs.write's file change is recorded and the
 * process dies before its result. argv: workspace, oracle file, mode, session id.
 */
import { openActionJournal, type ActionJournal } from "../../src/actions/actionJournal.js";
import { SessionService } from "../../src/session/sessionService.js";
import { ToolPipeline } from "../../src/tools/toolPipeline.js";
import { ToolRegistry } from "../../src/tools/toolRegistry.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { FAULT_ARGUMENTS, faultTools, PAYMENT_TOOL } from "../helpers/actionFaults.js";
import { FakeSystemOfRecord } from "./actions/fakeSystemOfRecord.js";

const [workspace, oracleFile, mode, sessionId] = process.argv.slice(2) as [string, string, string, string];
const die = (): void => { process.kill(process.pid, "SIGKILL"); };
const session = new SessionService(workspace);
session.open({ sessionId, agentId: "default", harnessVersion: "ownership-test", compositionDigest: sha256Hex("composition"), policyDigest: sha256Hex("policy") });
session.startTurn({ trigger: "user" }); session.recordUserMessage("settle the invoice"); session.startStep();
if (mode === "write") {
  // fs.write's audit row records the file change (P1-36) before the call's result row; the process dies between them.
  session.recordToolCall({ toolCallId: "write-1", toolName: "fs.write", dispatch: "native", parentToken: null, args: JSON.stringify({ path: "notes.txt" }) });
  const fileChange = { path: "notes.txt", beforeSha256: sha256Hex("before\n"), afterSha256: sha256Hex("after\n") };
  session.recordProjectedEvidence({ eventType: "audit", payload: JSON.stringify({ callId: "write-1", fileChange }),
    meta: { auditType: "TOOL_CALL_ALLOWED", callId: "write-1", fileChange } });
  die();
}
if (mode === "read") {
  session.recordToolCall({ toolCallId: "read-1", toolName: "fs.read", dispatch: "native", parentToken: null, args: JSON.stringify({ path: "README.md" }) });
  die();
}
session.recordToolCall({ toolCallId: "pay-1", toolName: PAYMENT_TOOL, dispatch: "native", parentToken: null, args: JSON.stringify(FAULT_ARGUMENTS[PAYMENT_TOOL]) });
const registry = new ToolRegistry();
for (const definition of faultTools(new FakeSystemOfRecord(oracleFile), { afterEffect: die })) registry.define(definition);
let journal: ActionJournal | undefined;
const pipeline = new ToolPipeline({ registry, workspace, journal: () => (journal ??= openActionJournal(workspace)),
  authorizationContext: () => ({ sessionId, evidenceRefs: [] }) });
await pipeline.execute({ name: PAYMENT_TOOL, agentId: "default", arguments: FAULT_ARGUMENTS[PAYMENT_TOOL], requestedMode: "EXECUTE", callId: "pay-1" });
process.exit(0); // Reaching here means the crash point never fired.
