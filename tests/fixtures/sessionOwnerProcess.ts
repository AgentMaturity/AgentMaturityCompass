import { SessionService } from "../../src/session/sessionService.js";
import { resumeSession } from "../../src/session/sessionResume.js";
import { sha256Hex } from "../../src/utils/hash.js";

const [workspace, mode, existingId] = process.argv.slice(2);
if (!workspace || !mode) throw new Error("workspace and mode required");
const identity = { agentId: "default", harnessVersion: "ownership-test", compositionDigest: sha256Hex("composition"), policyDigest: sha256Hex("policy") };
let service: SessionService;
try {
  service = mode.startsWith("resume")
    ? resumeSession({ workspace, sessionId: existingId!, claimant: { pid: process.pid, hostId: "test", bootId: "child", startedAt: Date.now() }, ...identity }).service
    : new SessionService(workspace);
  if (!mode.startsWith("resume")) {
    service.open(identity);
    if (mode === "cancel-then-crash") {
      service.startTurn({ trigger: "user" }); service.startStep();
      service.recordUserMessage("do the risky thing");
      service.endStep({ stopReason: null, usage: null });
      service.endTurn({ reason: "cancelled", cause: { kind: "hook", reason: "egress-guard" } }); service.sealTurn();
    }
    service.startTurn({ trigger: "user" });
    service.recordUserMessage("first recorded turn");
    if (mode === "tool" || mode === "cancel-then-crash") {
      service.startStep();
      service.recordToolCall({ toolCallId: "call-crash-1", toolName: "shell", dispatch: "native", parentToken: null, args: JSON.stringify({ command: "ls" }) });
    } else {
      service.endTurn({ reason: "complete" });
      if (mode === "sealed") service.sealTurn();
    }
  }
  if (mode === "resume-tool") {
    service.startTurn({ trigger: "user" }); service.startStep();
    service.recordToolCall({ toolCallId: "call-crash-2", toolName: "shell", dispatch: "native", parentToken: null, args: "{}" });
  }
  process.send?.({ ready: true, sessionId: service.sessionId, pid: process.pid });
  process.on("message", (command) => {
    try {
      if (command === "release") { service.releaseWithoutClosing(); process.send?.({ released: true }); process.exit(0); }
      if (command === "continue") {
        service.startTurn({ trigger: "user" }); service.recordUserMessage("original writer continues");
        service.endTurn({ reason: "complete" }); service.sealTurn(); process.send?.({ continued: true });
      }
    } catch (error) { process.send?.({ error: error instanceof Error ? error.message : String(error) }); }
  });
} catch (error) {
  process.send?.({ error: error instanceof Error ? error.message : String(error), code: (error as { code?: string }).code });
  process.exit(1);
}
