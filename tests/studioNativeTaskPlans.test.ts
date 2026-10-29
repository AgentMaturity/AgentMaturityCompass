import { afterEach, expect, test, vi } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SessionService } from "../src/session/sessionService.js";
import { readNativeTaskProjection, projectNativeTaskUpdate } from "../src/studio/nativeTaskProjection.js";
import { todoTool } from "../src/tools/builtin/todoTool.js";
import { planTool } from "../src/tools/builtin/planTool.js";
import type { NativeReceiptRecorder } from "../src/tools/builtin/nativeToolBreadth/nativeReceipt.js";
import type { ToolExecution } from "../src/tools/toolTypes.js";
import { appendTaskEvent, renderTaskPlans, collectNativeTaskTools, renderTaskToolStatus, renderTaskUsage } from "../src/console/assets/nativeTasksView.js";
import { orderedCleanup, orderedWorkspace } from "./fixtures/nativeOrderedImageHarness.js";

afterEach(orderedCleanup);

function fixture() {
  const workspace = orderedWorkspace(), writer = new SessionService(workspace);
  writer.open({ agentId: "default", harnessVersion: "wp20-plan", compositionDigest: "fixture", policyDigest: "fixture" });
  writer.startTurn({ trigger: "user" }); writer.startStep();
  const record: NativeReceiptRecorder = (execution, receipt) => {
    const meta = { ...receipt, tool: execution.name, callId: execution.callId, sessionId: writer.sessionId, agentId: "default" };
    writer.recordProjectedEvidence({ eventType: "audit", payload: JSON.stringify(meta), meta });
  };
  let calls = 0;
  const execution = (name: string, args: Record<string, unknown>): ToolExecution => ({
    token: `t${++calls}`, callId: `c${calls}`, rootCallId: `c${calls}`, name, workspace, agentId: "default", arguments: args,
    actionClass: "READ_ONLY", requestedMode: "EXECUTE", effectiveMode: "EXECUTE", parentToken: null
  });
  return { workspace, writer, record, execution };
}

test("Studio projects latest committed todo and plan records, including literal model-written markup", async () => {
  const f = fixture();
  try {
    const todo = todoTool({ sessionId: () => f.writer.sessionId, record: f.record });
    await todo.body(f.execution("todo", { items: [{ id: "a", content: "Old revision", status: "pending" }] }));
    await todo.body(f.execution("todo", { items: [{ id: "a", content: "Inspect <script>alert(1)</script>", status: "completed" }] }));
    await planTool({ sessionId: () => f.writer.sessionId, record: f.record }).body(f.execution("plan", {
      summary: "Review <img onerror=alert(2)>", steps: [{ id: "1", title: "Verify & finish", status: "in_progress" }]
    }));
    f.writer.endStep({ stopReason: "complete", usage: null }); f.writer.endTurn({ reason: "complete" }); f.writer.sealTurn();
    const projection = readNativeTaskProjection(f.workspace, f.writer.sessionId, "default");
    expect(projection.usage).toMatchObject({ scope: "recorded-session", requests: 0 });
    const events = projection.plans;
    expect(events).toHaveLength(2);
    expect(events.map(event => event.text).join("\n")).toContain("Inspect <script>alert(1)</script>");
    expect(events.map(event => event.text).join("\n")).toContain("Review <img onerror=alert(2)>");
    expect(events.map(event => event.text).join("\n")).not.toContain("Old revision");
    expect(events.every(event => event.evidence === "committed")).toBe(true);
    const html = renderTaskPlans({ history: { status: "authenticated" }, plans: events });
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;img onerror=alert(2)&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    const nodes: Array<{ tag: string; textContent?: string; innerHTML?: string; dataset: Record<string, string>; children: unknown[]; append: (...children: unknown[]) => void }> = [];
    vi.stubGlobal("document", { createElement: (tag: string) => {
      const node = { tag, dataset: {}, children: [] as unknown[], append(...children: unknown[]) { this.children.push(...children); } };
      nodes.push(node); return node;
    } });
    try {
      for (const event of events) appendTaskEvent({ append() {} }, { ...event, cursor: event.revision, kind: "plan" });
      expect(nodes.filter(node => node.tag === "pre").map(node => node.textContent)).toEqual(events.map(event => event.text));
      expect(nodes.some(node => node.innerHTML !== undefined)).toBe(false);
    } finally { vi.unstubAllGlobals(); }
  } finally { f.writer.disposeWithoutClosing(); }
});

test("Studio refuses a tampered standing plan instead of displaying model text from an unbound file", async () => {
  const f = fixture();
  try {
    await planTool({ sessionId: () => f.writer.sessionId, record: f.record }).body(f.execution("plan", { steps: [{ id: "1", title: "Authentic", status: "pending" }] }));
    f.writer.endStep({ stopReason: "complete", usage: null }); f.writer.endTurn({ reason: "complete" }); f.writer.sealTurn();
    const path = join(f.workspace, ".amc", "native-tools", f.writer.sessionId, "plan.json");
    writeFileSync(path, readFileSync(path, "utf8").replace("Authentic", "Injected!"));
    expect(() => readNativeTaskProjection(f.workspace, f.writer.sessionId, "default")).toThrow();
  } finally { f.writer.disposeWithoutClosing(); }
});


test("Studio preserves an explicitly unknown committed tool outcome instead of claiming failure or completion", () => {
  const event = projectNativeTaskUpdate({ sessionUpdate: "tool_call_update", toolCallId: "uncertain-call", status: "failed",
    _meta: { "dev.agentmaturity.amc": { outcome: "TOOL_OUTCOME_UNKNOWN" } } }, 12);
  expect(event?.status).toBe("unknown");
  const html = renderTaskToolStatus(collectNativeTaskTools(new Map(), [event!]));
  expect(html).toContain("Outcome unknown");
  expect(html).not.toContain(">Failed<");
  expect(html).not.toContain(">Completed<");
});


test("Studio usage stays bounded across many signed requests and preserves issue counts without per-request detail", () => {
  const f = fixture(), count = 128;
  try {
    const system = f.writer.recordSystemPrompt("Usage aggregation fixture."), message = f.writer.recordUserMessage("Inspect recorded usage.");
    const outcomes: Parameters<SessionService["recordRequestOutcome"]>[0][] = [];
    for (let index = 0; index < count; index++) {
      const request = f.writer.recordRequestHeader({ model: "fixture-model", providerId: "openai", params: {}, encoderId: "fixture", encoderVersion: 1,
        systemPromptEventId: system.eventId, toolSchema: null, projectionCutoffEventId: message.eventId,
        projectionDigest: "a".repeat(64), sourceEventIds: [system.eventId, message.eventId], requestBytes: `{"request":${index}}` });
      const outcome = { headerEventId: request.headerEventId, requestDigest: request.requestDigest, providerId: "openai", adapterId: "fixture", adapterVersion: 1,
        httpStatus: 200, durationMs: 1, blocks: [], outcome: "completed" as const, finishReason: "stop" as const, dispatchAttempted: true,
        usage: { reported: true, complete: true, inputTokens: 1, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: null } };
      f.writer.recordRequestOutcome(outcome); outcomes.push(outcome);
    }
    const clean = readNativeTaskProjection(f.workspace, f.writer.sessionId, "default").usage;
    expect(clean).toMatchObject({ requests: count, reportedRequests: count, completeRequests: count, pendingRequests: 0, issueCount: 0 });
    expect(clean).not.toHaveProperty("requestReports"); expect(clean).not.toHaveProperty("issues");
    expect(Buffer.byteLength(JSON.stringify(clean))).toBeLessThan(2048);
    const view = { history: { status: "authenticated" }, provider: "openai", usage: clean };
    expect(renderTaskUsage(view)).toContain("recorded session subtotals");
    expect(renderTaskUsage({ ...view, usage: { ...clean, issueCount: 1 } })).toContain("absent counts are not zero");
    const missingIssueCount = { ...clean } as Record<string, unknown>; delete missingIssueCount.issueCount;
    expect(renderTaskUsage({ ...view, usage: missingIssueCount })).toContain("absent counts are not zero");
    for (const outcome of outcomes) f.writer.recordRequestOutcome(outcome);
    f.writer.endStep({ stopReason: "complete", usage: null }); f.writer.endTurn({ reason: "complete" }); f.writer.sealTurn();
    const invalid = readNativeTaskProjection(f.workspace, f.writer.sessionId, "default").usage;
    expect(invalid).toMatchObject({ status: "invalid", requests: count, reportedRequests: count, pendingRequests: 0, issueCount: count });
    expect(invalid).not.toHaveProperty("requestReports"); expect(invalid).not.toHaveProperty("issues");
    expect(Buffer.byteLength(JSON.stringify(invalid))).toBeLessThan(2048);
    expect(renderTaskUsage({ ...view, usage: invalid })).toContain("absent counts are not zero");
  } finally { f.writer.disposeWithoutClosing(); }
}, 60_000);
