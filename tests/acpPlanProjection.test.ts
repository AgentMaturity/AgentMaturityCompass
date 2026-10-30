import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { projectSessionUpdates } from "../src/acp/acpProjection.js";
import { checkAcpDefinition } from "../src/acp/acpSchema.js";
import { SessionService } from "../src/session/sessionService.js";
import { todoTool } from "../src/tools/builtin/todoTool.js";
import { planTool } from "../src/tools/builtin/planTool.js";
import type { NativeReceiptRecorder } from "../src/tools/builtin/nativeToolBreadth/nativeReceipt.js";
import { persistSignedRecord, signRecord } from "../src/tools/builtin/nativeToolBreadth/signedSessionRecords.js";
import type { ToolExecution } from "../src/tools/toolTypes.js";
import { initWorkspace } from "../src/workspace.js";

let workspace: string, writer: SessionService, sessionId: string;
let calls = 0;
beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "wp20-acp-plan-fixture");
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-wp20-plan-")));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  writer = new SessionService(workspace);
  sessionId = "plan-session";
  writer.open({ sessionId, agentId: "default", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture" });
  writer.startTurn({ trigger: "user" });
});
afterEach(() => {
  writer.disposeWithoutClosing();
  rmSync(workspace, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
const record: NativeReceiptRecorder = (execution, receipt) => {
  const meta = { ...receipt, sessionId, agentId: execution.agentId, callId: execution.callId, tool: execution.name };
  writer.recordProjectedEvidence({ eventType: "audit", payload: JSON.stringify(meta), meta });
};
function execution(name: string, args: Record<string, unknown>): ToolExecution {
  const id = String(++calls);
  return { token: id, callId: id, rootCallId: id, parentToken: null, name, agentId: "default", workspace,
    actionClass: "READ_ONLY", requestedMode: "EXECUTE", effectiveMode: "EXECUTE", arguments: args };
}
const plans = () => projectSessionUpdates(workspace, writer.readEvents(), 0, { includeCurrentPlans: true }).updates.filter(update => update.sessionUpdate === "plan");

describe("WP20 committed todo and plan ACP projections", () => {
  it("projects the latest verified todo once with standard ACP plan entries", async () => {
    const tool = todoTool({ sessionId, record });
    await tool.body(execution("todo", { items: [{ id: "a", content: "earlier draft", status: "pending" }] }));
    const offset = writer.readEvents().length;
    await tool.body(execution("todo", { items: [{ id: "a", content: "<img src=x onerror=alert(1)>", status: "completed" }] }));
    const updates = plans();
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ sessionUpdate: "plan", entries: [
      { content: "<img src=x onerror=alert(1)>", priority: "medium", status: "completed" }
    ], _meta: { "dev.agentmaturity.amc": { listKind: "todo", revision: 2 } } });
    expect(await checkAcpDefinition("SessionUpdate", updates[0])).toEqual({ ok: true });
    expect(projectSessionUpdates(workspace, writer.readEvents(), offset, { includeCurrentPlans: true }).updates).toEqual(updates);
    expect(projectSessionUpdates(workspace, writer.readEvents(), writer.readEvents().length, { includeCurrentPlans: true }).updates).toEqual([]);
  });

  it("keeps mutable current list state outside the default durable transcript", async () => {
    await todoTool({ sessionId, record }).body(execution("todo", { items: [{ id: "a", content: "current", status: "pending" }] }));
    expect(plans()).toHaveLength(1);
    expect(projectSessionUpdates(workspace, writer.readEvents(), 0).updates).toEqual([]);
  });

  it("preserves plan summary and blocked status in typed metadata", async () => {
    await planTool({ sessionId, record }).body(execution("plan", { summary: "Model-written summary", steps: [
      { id: "1", title: "Check", status: "done" }, { id: "2", title: "Wait", status: "blocked" }
    ] }));
    const update = plans()[0];
    expect(update).toMatchObject({ entries: [
      { content: "Check", status: "completed", priority: "medium" },
      { content: "Wait", status: "pending", priority: "medium" }
    ], _meta: { "dev.agentmaturity.amc": { listKind: "plan", summary: "Model-written summary", sourceStatuses: ["done", "blocked"] } } });
  });

  it("preserves the latest signed session list across turns until a real replacement", async () => {
    await todoTool({ sessionId, record }).body(execution("todo", { items: [{ id: "a", content: "completed", status: "completed" }] }));
    writer.endTurn({ reason: "complete" }); writer.sealTurn();
    expect(plans()).toHaveLength(1);
    const from = writer.readEvents().length;
    writer.startTurn({ trigger: "user" });
    expect(plans()).toMatchObject([{ entries: [{ content: "completed", status: "completed" }] }]);
    expect(projectSessionUpdates(workspace, writer.readEvents(), from, { includeCurrentPlans: true }).updates).toEqual([]);
    await todoTool({ sessionId, record }).body(execution("todo", { items: [] }));
    expect(plans()).toMatchObject([{ entries: [], _meta: { "dev.agentmaturity.amc": { revision: 2 } } }]);
  });

  it("refuses modified and rolled-back signed list files instead of emitting a shorter stream", async () => {
    const tool = todoTool({ sessionId, record });
    await tool.body(execution("todo", { items: [{ id: "a", content: "first", status: "pending" }] }));
    const path = join(workspace, ".amc", "native-tools", sessionId, "todo.json");
    const first = readFileSync(path, "utf8");
    await tool.body(execution("todo", { items: [{ id: "a", content: "second", status: "completed" }] }));
    const second = readFileSync(path, "utf8");
    writeFileSync(path, second.replace("second", "forged"));
    expect(plans).toThrow(/signature verification/);
    writeFileSync(path, first);
    expect(plans).toThrow(/does not match the session ledger/);
  });

  it("refuses an authenticated list with invalid item shape", async () => {
    await todoTool({ sessionId, record }).body(execution("todo", { items: [] }));
    const path = join(workspace, ".amc", "native-tools", sessionId, "todo.json");
    const original = JSON.parse(readFileSync(path, "utf8")) as { record: Record<string, unknown> };
    const signed = signRecord(workspace, { ...original.record, revision: 2,
      items: [{ id: "bad", content: "oversize".repeat(100), status: "pending" }] }, "monitor");
    persistSignedRecord(path, signed);
    record(execution("todo", {}), { auditType: "NATIVE_TODO", decision: "allow", revision: 2, recordSha256: signed.digestSha256 });
    expect(plans).toThrow(/unsupported shape/);
  });

  it("does not present a later file revision under an earlier observed receipt", async () => {
    const tool = todoTool({ sessionId, record });
    await tool.body(execution("todo", { items: [{ id: "a", content: "first", status: "pending" }] }));
    const before = writer.readEvents();
    await tool.body(execution("todo", { items: [{ id: "a", content: "second", status: "completed" }] }));
    expect(() => projectSessionUpdates(workspace, before, 0, { includeCurrentPlans: true })).toThrow(/observed receipt/);
  });
});
