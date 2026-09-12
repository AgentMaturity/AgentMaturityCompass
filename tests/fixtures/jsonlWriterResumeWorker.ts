import { appendFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { SessionService } from "../../src/session/sessionService.js";
import { resumeSession } from "../../src/session/sessionResume.js";
import { openSessionEventStore } from "../../src/persistence/openSessionEventStore.js";
import { JsonlWriterLock } from "../../src/persistence/jsonl/jsonlWriterLock.js";
import { reserveNativeToolBudget } from "../../src/budgets/nativeBudgetAdmission.js";
import type { ToolExecution } from "../../src/tools/toolTypes.js";
import { sha256Hex } from "../../src/utils/hash.js";

const [workspace, mode, sessionId] = process.argv.slice(2) as [string, string, string | undefined];
const identity = { agentId: "default", harnessVersion: "jsonl-recovery-test", compositionDigest: sha256Hex("jsonl-recovery-composition"), policyDigest: sha256Hex("jsonl-recovery-policy") };
let service: SessionService | undefined, lock: JsonlWriterLock | undefined;
const held = setInterval(() => undefined, 1000);
function report(value: Record<string, unknown>) { process.send?.({ pid: process.pid, ...value }); }
function acquire() {
  try {
    if (mode === "mutex") lock = new JsonlWriterLock(join(workspace, "writer.lock"));
    else {
      const result = resumeSession({ workspace, sessionId: sessionId!, ...identity,
        claimant: { pid: process.pid, hostId: hostname(), bootId: "owned-test-process", startedAt: Date.now() } });
      service = result.service;
    }
    report({ kind: "acquired", ok: true, sessionId: service?.sessionId });
  } catch (error) { report({ kind: "acquired", ok: false, error: error instanceof Error ? error.message : String(error) }); }
}
process.on("message", (value: string) => {
  if (value === "go") acquire();
  if (value === "release") {
    try { service?.releaseWithoutClosing(); lock?.release(); report({ kind: "released", ok: true }); }
    catch (error) { report({ kind: "released", ok: false, error: String(error) }); }
    finally {
      clearInterval(held);
      // Only an IPC-spawned child has a disconnect; this worker is always one, so refuse loudly otherwise.
      if (process.disconnect === undefined) throw new Error("jsonl resume worker requires an IPC channel");
      process.disconnect();
    }
  }
});
if (mode === "create") {
  service = new SessionService(workspace, openSessionEventStore(workspace, "jsonl"));
  service.open(identity);
  service.startTurn({ trigger: "user" }); service.recordUserMessage("original admitted input"); service.startStep();
  for (const callId of ["acknowledged-effect", "uncertain-effect"]) {
    service.recordToolCall({ toolCallId: callId, toolName: "fs.write", args: JSON.stringify({ path: "effects.log", content: callId }), dispatch: "native", parentToken: null });
    const token = `token-${callId}`;
    // This deterministic fixture invokes the real budget admission seam and a
    // real file side effect. It is not a provider, sandbox or approval test.
    const refused = reserveNativeToolBudget({ workspace, agentId: "default", effectiveMode: "EXECUTE", actionClass: "WRITE_LOW", token, callId } as ToolExecution, service.sessionId);
    if (refused) throw new Error(refused);
    appendFileSync(join(workspace, "effects.log"), `${callId}\n`);
    if (callId === "acknowledged-effect") {
      const meta = { auditType: "TOOL_CALL_ALLOWED", agentId: "default", effectiveMode: "EXECUTE", actionClass: "WRITE_LOW", callId, toolToken: token };
      service.recordProjectedEvidence({ eventType: "audit", payload: JSON.stringify(meta), meta });
      service.recordToolResult({ toolCallId: callId, content: "acknowledged original effect", outcome: "OK", exitCode: 0, timedOut: false, denied: false });
    }
  }
  report({ kind: "ready", sessionId: service.sessionId });
} else report({ kind: "ready" });
