import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { projectSessionUpdates } from "../src/acp/acpProjection.js";
import { checkAcpDefinition } from "../src/acp/acpSchema.js";
import { acpToolCallView, acpToolKind } from "../src/acp/acpToolCallView.js";
import { SessionService } from "../src/session/sessionService.js";
import { initWorkspace } from "../src/workspace.js";

/** SH-UI-04: tool_call kind/title/locations from the signed row only, and thought chunks only when asked for. */
describe("acpToolCallView", () => {
  it("maps the governed tools to ACP kinds and everything else to other", () => {
    expect(["fs.read", "fs.edit", "fs.write", "bash", "grep", "web_fetch", "todo", "echo", "mcp:anything"].map(acpToolKind))
      .toEqual(["read", "edit", "edit", "execute", "search", "fetch", "think", "other", "other"]);
  });

  it("derives locations only from the path arguments of fs tools, refusing control characters", () => {
    expect(acpToolCallView("fs.read", { path: "src/a.ts" })).toEqual({ title: "fs.read", kind: "read", locations: [{ path: "src/a.ts" }] });
    expect(acpToolCallView("fs.edit", { path: "x\u0000y", find: "a" })).toEqual({ title: "fs.edit", kind: "edit" });
    expect(acpToolCallView("bash", { command: "ls /etc" })).toEqual({ title: "bash", kind: "execute" });
    expect(acpToolCallView("fs.read", "not an object")).toEqual({ title: "fs.read", kind: "read" });
  });
});

describe("projection of tool calls and thoughts", () => {
  let workspace: string;
  let writer: SessionService;
  beforeEach(() => {
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "sh-ui-tool-call-view");
    workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-tool-call-view-")));
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
    writer = new SessionService(workspace);
    writer.open({ sessionId: "view-fixture", agentId: "default", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture" });
    writer.startTurn({ trigger: "user" }); writer.startStep();
  });
  afterEach(() => { writer.disposeWithoutClosing(); rmSync(workspace, { recursive: true, force: true }); vi.unstubAllEnvs(); });

  it("emits a schema-valid tool_call with kind and locations from the committed arguments", async () => {
    writer.recordToolCall({ toolCallId: "c1", toolName: "fs.read", dispatch: "native", parentToken: null, args: JSON.stringify({ path: "notes/a.md" }) });
    const { updates } = projectSessionUpdates(workspace, writer.readEvents(), 0);
    expect(updates).toEqual([{ sessionUpdate: "tool_call", toolCallId: "c1", title: "fs.read", kind: "read", locations: [{ path: "notes/a.md" }], status: "pending" }]);
    expect(await checkAcpDefinition("ToolCall", updates[0])).toEqual({ ok: true });
    expect(await checkAcpDefinition("SessionNotification", { sessionId: "view-fixture", update: updates[0] })).toEqual({ ok: true });
  });

  it("projects committed thinking blocks as agent_thought_chunk only when includeThoughts is set", async () => {
    writer.recordAssistantBlock({ blockIndex: 0, blockKind: "thinking", stopReason: null, content: "weighing options" });
    writer.recordAssistantBlock({ blockIndex: 1, blockKind: "text", stopReason: "end_turn", content: "answer" });
    const withheld = projectSessionUpdates(workspace, writer.readEvents(), 0);
    expect(withheld.updates.map(update => update.sessionUpdate)).toEqual(["agent_message_chunk"]);
    const shown = projectSessionUpdates(workspace, writer.readEvents(), 0, { includeThoughts: true });
    expect(shown.updates.map(update => update.sessionUpdate)).toEqual(["agent_thought_chunk", "agent_message_chunk"]);
    expect(shown.updates[0]).toEqual({ sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "weighing options" } });
    expect(await checkAcpDefinition("SessionNotification", { sessionId: "view-fixture", update: shown.updates[0] })).toEqual({ ok: true });
  });
});
