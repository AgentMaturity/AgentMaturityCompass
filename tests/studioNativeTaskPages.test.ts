import { writeFileSync } from "node:fs";
import { afterEach } from "vitest";
import { projectSessionUpdates, type AcpSessionUpdate } from "../src/acp/acpProjection.js";
import { UNSIGNED } from "../src/agent/runReport.js";
import { loadOpsPolicy, opsPolicyPath, signOpsPolicy } from "../src/ops/policy.js";
import { SessionService } from "../src/session/sessionService.js";
import { loadSessionEventHistory } from "../src/session/sessionEventHistory.js";
import { orderedCleanup, orderedWorkspace } from "./fixtures/nativeOrderedImageHarness.js";

import type { IncomingMessage, ServerResponse } from "node:http";
import { expect, test, vi } from "vitest";
import { handleNativeTasksRoute, type NativeTaskApiContext } from "../src/api/nativeTasksRouter.js";
import type { NativeTaskService } from "../src/studio/nativeTaskTypes.js";

function route() {
  const poll = vi.fn(() => ({ task: {}, events: [], truncated: false }));
  const service = { poll } as unknown as NativeTaskService;
  const nativeTasks: NativeTaskApiContext = { service, principalId: "verified-owner", demo: false,
    nativeCsrfToken: null, admissionActor: { kind: "owner", principalId: "verified-owner" } as unknown as NativeTaskApiContext["admissionActor"], executionAllowed: () => true };
  const request = async (selection: string) => {
    const path = "/api/v1/native-tasks/task_12345678";
    const req = { url: `${path}?agentId=default&${selection}` } as IncomingMessage;
    let body = "";
    const response = { statusCode: 200, setHeader() { return this; }, writeHead(status: number) { this.statusCode = status; return this; }, end(value: string) { body = value; return this; } };
    expect(await handleNativeTasksRoute(path, "GET", req, response as unknown as ServerResponse, { workspace: "/unused", nativeTasks })).toBe(true);
    return { status: response.statusCode, body: JSON.parse(body) as unknown };
  };
  return { poll, request };
}

test("existing Studio task GET negotiates bounded verified pages and forwards authenticated owner identity", async () => {
  const f = route();
  expect((await f.request("limit=2")).status).toBe(200);
  expect(f.poll).toHaveBeenLastCalledWith({ principalId: "verified-owner", agentId: "default", demo: false }, "task_12345678", { limit: 2 });
  expect((await f.request("pageCursor=snapshot_position&limit=1")).status).toBe(200);
  expect(f.poll).toHaveBeenLastCalledWith({ principalId: "verified-owner", agentId: "default", demo: false }, "task_12345678", { cursor: "snapshot_position", limit: 1 });
});

test("Studio page query rejects mixed modes, ambiguous cursors and unbounded pages before service dispatch", async () => {
  const f = route();
  for (const query of ["limit=0", "limit=257", "limit=-1", "limit=1.5", "limit=01", "limit=1&limit=2",
    "cursor=0&limit=1", "cursor=0&pageCursor=x", "pageCursor=", "pageCursor=x&pageCursor=y", `pageCursor=${"x".repeat(2049)}`]) {
    expect((await f.request(query)).status, query).toBe(400);
  }
  expect(f.poll).not.toHaveBeenCalled();
});

test("Studio recovers all committed updates beyond its display suffix through owner-bound read-only pages", async () => {
  const { randomUUID } = await import("node:crypto");
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { SessionService } = await import("../src/session/sessionService.js");
  const { loadSessionEventHistory } = await import("../src/session/sessionEventHistory.js");
  const { NativeTaskDescriptors, nativeTaskId } = await import("../src/studio/nativeTaskDescriptors.js");
  const { createNativeTaskService } = await import("../src/studio/nativeTaskService.js");
  const { orderedCleanup, orderedWorkspace } = await import("./fixtures/nativeOrderedImageHarness.js");
  const workspace = orderedWorkspace(), writer = new SessionService(workspace);
  const actor = { principalId: "page-owner", agentId: "default", demo: true };
  writer.open({ agentId: "default", harnessVersion: "wp20-pages", compositionDigest: "fixture", policyDigest: "fixture" });
  writer.startTurn({ trigger: "user" }); writer.startStep();
  for (let i = 0; i < 520; i++) writer.recordUserMessage(`Committed message ${i}`);
  writer.endStep({ stopReason: "complete", usage: null }); writer.endTurn({ reason: "complete" }); writer.sealTurn();
  const sessionId = writer.sessionId, requestId = randomUUID(), taskId = nativeTaskId(actor.principalId, requestId);
  const descriptors = new NativeTaskDescriptors(workspace), now = Date.now();
  descriptors.write({ kind: "amc/studio-native-task/v1", taskId, principalId: actor.principalId, agentId: "default", demo: true,
    sessionId, provider: "stub", model: null, tools: "none", toolsDigest: null, maxSteps: 2, maxTokens: 64,
    createdAt: now, updatedAt: now, revision: 1, pendingTurn: false, closed: false,
    submissions: [{ clientRequestId: requestId, bodyHash: "a".repeat(64), revision: 1 }] });
  const service = createNativeTaskService({ workspace, environment: { PATH: process.env.PATH } });
  try {
    const before = loadSessionEventHistory({ workspace, sessionId }), descriptor = readFileSync(join(descriptors.directory, `${taskId}.json`));
    let response = service.poll(actor, taskId, { limit: 64 });
    const text: string[] = [];
    for (;;) {
      expect(response.truncated).toBe(false);
      expect(response.page).toMatchObject({ committed: true, sessionId, agentId: "default" });
      expect(response.events.length).toBeLessThanOrEqual(64);
      text.push(...response.events.filter(event => event.kind === "user").map(event => event.text));
      if (!response.page?.nextCursor) break;
      response = service.poll(actor, taskId, { cursor: response.page.nextCursor, limit: 64 });
    }
    expect(text).toEqual(Array.from({ length: 520 }, (_, index) => `Committed message ${index}`));
    const resume = response.page!.resumeCursor;
    expect(service.poll(actor, taskId, { cursor: resume, limit: 64 }).events).toEqual([]);
    expect(() => service.poll({ ...actor, principalId: "another-owner" }, taskId, { cursor: resume, limit: 64 }))
      .toThrow(expect.objectContaining({ code: "NATIVE_TASK_NOT_FOUND" }));
    expect(() => service.poll(actor, taskId, { cursor: "forged", limit: 64 })).toThrow();
    expect(loadSessionEventHistory({ workspace, sessionId }).events).toEqual(before.events);
    expect(readFileSync(join(descriptors.directory, `${taskId}.json`))).toEqual(descriptor);
  } finally { writer.disposeWithoutClosing(); await service.close(); await orderedCleanup(); }
}, 60_000);

test("Studio rejects an oversized assembled page without truncating admitted task state or changing legacy reads", async () => {
  const { randomUUID } = await import("node:crypto");
  const { SessionService } = await import("../src/session/sessionService.js");
  const { NativeTaskDescriptors, nativeTaskId } = await import("../src/studio/nativeTaskDescriptors.js");
  const { createNativeTaskService } = await import("../src/studio/nativeTaskService.js");
  const projection = await import("../src/studio/nativeTaskProjection.js");
  const { orderedCleanup, orderedWorkspace } = await import("./fixtures/nativeOrderedImageHarness.js");
  const workspace = orderedWorkspace(), writer = new SessionService(workspace);
  const actor = { principalId: "response-owner", agentId: "default", demo: true };
  writer.open({ agentId: "default", harnessVersion: "wp20-response-bound", compositionDigest: "fixture", policyDigest: "fixture" });
  writer.startTurn({ trigger: "user" }); writer.startStep(); writer.recordUserMessage("Small committed page.");
  writer.endStep({ stopReason: "complete", usage: null }); writer.endTurn({ reason: "complete" }); writer.sealTurn();
  const sessionId = writer.sessionId, requestId = randomUUID(), taskId = nativeTaskId(actor.principalId, requestId), now = Date.now();
  new NativeTaskDescriptors(workspace).write({ kind: "amc/studio-native-task/v1", taskId, principalId: actor.principalId, agentId: "default", demo: true,
    sessionId, provider: "stub", model: null, tools: "none", toolsDigest: null, maxSteps: 2, maxTokens: 64,
    createdAt: now, updatedAt: now, revision: 1, pendingTurn: false, closed: false,
    submissions: [{ clientRequestId: requestId, bodyHash: "a".repeat(64), revision: 1 }] });
  const original = projection.readNativeTaskProjection(workspace, sessionId, "default");
  // Isolate transport admission after projection authentication. These bounded
  // field counts model a large approval summary plus escaped standing-list text;
  // this mock does not claim to verify an approval or grant its authority.
  const admitted = { ...original,
    approvals: Array.from({ length: 32 }, (_, index) => ({ approvalRequestId: `approval_${index}`, requestDigestSha256: "b".repeat(64),
      toolName: "a".repeat(48 * 1024), actionClass: "READ_ONLY", riskTier: "low", status: "PENDING", required: 1, received: 0, expiresTs: now + 60_000 })),
    plans: (["todo", "plan"] as const).map(kind => ({ kind, revision: 1, recordSha256: "c".repeat(64), text: "\0".repeat(50_000), evidence: "committed" as const, scope: "current-record" as const })) };
  const spy = vi.spyOn(projection, "readNativeTaskProjection").mockReturnValue(admitted);
  const service = createNativeTaskService({ workspace, environment: { PATH: process.env.PATH } });
  try {
    expect(() => service.poll(actor, taskId, { limit: 256 }))
      .toThrow(expect.objectContaining({ code: "NATIVE_EVIDENCE_UNAVAILABLE", statusCode: 409 }));
    expect(service.poll(actor, taskId, 0).task.approvals).toHaveLength(32);
  } finally { spy.mockRestore(); writer.disposeWithoutClosing(); await service.close(); await orderedCleanup(); }
}, 60_000);


test("Studio pages recover a closed committed text history larger than the full ACP replay bound", async () => {
  const { randomUUID } = await import("node:crypto");
  const { writeFileSync } = await import("node:fs");
  const { loadOpsPolicy, opsPolicyPath, signOpsPolicy } = await import("../src/ops/policy.js");
  const { SessionService } = await import("../src/session/sessionService.js");
  const { loadSessionEventHistory } = await import("../src/session/sessionEventHistory.js");
  const { readEventPayload } = await import("../src/session/eventPayload.js");
  const { projectSessionUpdates } = await import("../src/acp/acpProjection.js");
  const { NativeTaskDescriptors, nativeTaskId } = await import("../src/studio/nativeTaskDescriptors.js");
  const { createNativeTaskService } = await import("../src/studio/nativeTaskService.js");
  const { orderedCleanup, orderedWorkspace } = await import("./fixtures/nativeOrderedImageHarness.js");
  const workspace = orderedWorkspace();
  const policy = loadOpsPolicy(workspace);
  policy.opsPolicy.retention.maxPayloadBytesPerEvent = 256 * 1024;
  writeFileSync(opsPolicyPath(workspace), JSON.stringify(policy));
  signOpsPolicy(workspace);
  const writer = new SessionService(workspace);
  const actor = { principalId: "long-page-owner", agentId: "default", demo: true };
  const blocks = Array.from({ length: 48 }, (_, index) => `Committed large block ${index}: ${"x".repeat(192 * 1024)}`);
  writer.open({ agentId: "default", harnessVersion: "wp20-long-pages", compositionDigest: "fixture", policyDigest: "fixture" });
  writer.startTurn({ trigger: "user" }); writer.startStep();
  blocks.forEach((content, blockIndex) => writer.recordAssistantBlock({ blockIndex, blockKind: "text", stopReason: "end_turn", content }));
  writer.endStep({ stopReason: "complete", usage: null }); writer.endTurn({ reason: "complete" }); writer.sealTurn();
  const sessionId = writer.sessionId;
  writer.close({ reason: "complete" });
  const requestId = randomUUID(), taskId = nativeTaskId(actor.principalId, requestId), now = Date.now();
  new NativeTaskDescriptors(workspace).write({ kind: "amc/studio-native-task/v1", taskId, principalId: actor.principalId, agentId: "default", demo: true,
    sessionId, provider: "stub", model: null, tools: "none", toolsDigest: null, maxSteps: 2, maxTokens: 64,
    createdAt: now, updatedAt: now, revision: 1, pendingTurn: false, closed: true,
    submissions: [{ clientRequestId: requestId, bodyHash: "a".repeat(64), revision: 1 }] });
  const service = createNativeTaskService({ workspace, environment: { PATH: process.env.PATH } });
  try {
    const history = loadSessionEventHistory({ workspace, sessionId });
    const raw = history.events.filter(event => event.event_type === "assistant/block").map(event => readEventPayload(workspace, event));
    expect(raw).toHaveLength(blocks.length);
    expect(raw.every(payload => payload.status === "ok")).toBe(true);
    expect(raw.map(payload => payload.status === "ok" ? payload.bytes.toString("utf8") : null)).toEqual(blocks);
    expect(blocks.reduce((bytes, block) => bytes + Buffer.byteLength(block), 0)).toBeGreaterThan(8 * 1024 * 1024);
    expect(() => projectSessionUpdates(workspace, history.events, 0, { includeUser: true }))
      .toThrow(expect.objectContaining({ acpData: { reason: "history-output-limit" } }));
    const recovered: string[] = [];
    let cursor: string | undefined;
    for (let pageCount = 0; ; pageCount++) {
      expect(pageCount).toBeLessThan(100);
      const response = service.poll(actor, taskId, { cursor, limit: 64 });
      expect(response.truncated).toBe(false);
      expect(response.task.history.status).toBe("authenticated");
      expect(response.task).toMatchObject({ nextCursor: 48, firstCursor: 39, droppedEvents: 38 });
      expect(response.page).toMatchObject({ committed: true, sessionId, sealed: true });
      expect(Buffer.byteLength(JSON.stringify({ ok: true, data: response }), "utf8")).toBeLessThanOrEqual(2 * 1024 * 1024);
      recovered.push(...response.events.filter(event => event.kind === "assistant").map(event => event.text));
      if (!response.page?.nextCursor) break;
      cursor = response.page.nextCursor;
    }
    expect(recovered).toEqual(blocks);
  } finally { writer.disposeWithoutClosing(); await service.close(); await orderedCleanup(); }
}, 60_000);


afterEach(orderedCleanup);
function recordedCollector(blocks = ["First committed block.", "Second committed block."]) {
  const workspace = orderedWorkspace();
  const policy = loadOpsPolicy(workspace);
  policy.opsPolicy.retention.maxPayloadBytesPerEvent = 1024 * 1024;
  writeFileSync(opsPolicyPath(workspace), JSON.stringify(policy)); signOpsPolicy(workspace);
  const writer = new SessionService(workspace);
  writer.open({ agentId: "default", harnessVersion: "wp20-collector", compositionDigest: "fixture", policyDigest: "fixture" });
  writer.startTurn({ trigger: "user" }); writer.startStep();
  blocks.forEach((content, blockIndex) => writer.recordAssistantBlock({ blockIndex, blockKind: "text", stopReason: "end_turn", content }));
  writer.endStep({ stopReason: "complete", usage: null }); writer.endTurn({ reason: "complete" }); writer.sealTurn();
  const sessionId = writer.sessionId; writer.close({ reason: "complete" }); writer.disposeWithoutClosing();
  return { workspace, rows: loadSessionEventHistory({ workspace, sessionId }).events };
}

test("Studio collector visits every committed update without retaining a second replay array", () => {
  const { workspace, rows } = recordedCollector(), collected: AcpSessionUpdate[] = [];
  const expected = projectSessionUpdates(workspace, rows, 0, { includeUser: true });
  const result = projectSessionUpdates(workspace, rows, 0, { includeUser: true, collectUpdate: update => collected.push(update) });
  expect(collected).toEqual(expected.updates); expect(collected).toHaveLength(2);
  expect(result).toEqual({ updates: [], unsigned: 0 });
  const unsigned = rows.map(row => row.event_type === "assistant/block" ? { ...row, writer_sig: UNSIGNED } : row);
  const sink = vi.fn();
  expect(projectSessionUpdates(workspace, unsigned, 0, { includeUser: true, collectUpdate: sink })).toEqual({ updates: [], unsigned: 2 });
  expect(sink).not.toHaveBeenCalled();
});

test("Studio collector requires faithful user replay and cannot retain event-identity arrays", () => {
  const { workspace, rows } = recordedCollector(), collectUpdate = vi.fn();
  expect(() => projectSessionUpdates(workspace, rows, 0, { collectUpdate })).toThrow(/collector/i);
  expect(() => projectSessionUpdates(workspace, rows, 0, { includeUser: true, includeEventIdentity: true, collectUpdate })).toThrow(/collector/i);
  expect(collectUpdate).not.toHaveBeenCalled();
});

test("Studio collector preserves the individual ACP frame bound", () => {
  const { workspace, rows } = recordedCollector(["x".repeat(901_000)]), collectUpdate = vi.fn();
  expect(() => projectSessionUpdates(workspace, rows, 0, { includeUser: true, collectUpdate }))
    .toThrow(expect.objectContaining({ acpData: { reason: "history-output-limit" } }));
  expect(collectUpdate).not.toHaveBeenCalled();
});

test("Studio collector checks later payload commitments and complete media provenance", () => {
  const { workspace, rows } = recordedCollector(), collectUpdate = vi.fn();
  let block = 0;
  const contradicted = rows.map(row => row.event_type === "assistant/block" && ++block === 2 ? { ...row, payload_sha256: "0".repeat(64) } : row);
  expect(() => projectSessionUpdates(workspace, contradicted, 0, { includeUser: true, collectUpdate })).toThrow(/committed digest/);
  expect(collectUpdate).toHaveBeenCalledTimes(1);
  collectUpdate.mockClear();
  const brokenAudio = rows.map(row => row.event_type === "assistant/block" ? { ...row,
    meta_json: JSON.stringify({ ...JSON.parse(row.meta_json), sourceInputFormat: "amc-audio-input@1", sourceInputEventId: "missing-source" }) } : row);
  expect(() => projectSessionUpdates(workspace, brokenAudio, 0, { includeUser: true, collectUpdate }))
    .toThrow(expect.objectContaining({ acpData: { reason: "evidence-inconsistent" } }));
  expect(collectUpdate).not.toHaveBeenCalled();
});
