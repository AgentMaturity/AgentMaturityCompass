import { EventEmitter } from "node:events";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startAcpStdio, type AcpStdioHandle, type AcpStdioInit } from "../src/acp/acpStdioMain.js";
import { deriveRecordedRequest } from "../src/llm/request/deriveRequest.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { readNativeSessionEvents } from "../src/session/readNativeSessionEvents.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";
import type { EvidenceEvent } from "../src/types.js";

// Exercise the production ACP fork seam with real signed native sessions and the local stub transport.
type Frame = { id?: number; result?: Record<string, unknown>; error?: { code: number; message: string } };
const AMC = "dev.agentmaturity.amc";
let workspace: string, home: string;
const handles: AcpStdioHandle[] = [];
beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "wp17a-acp-fork-fixture");
  vi.stubEnv("AMC_SESSION_STORE", undefined);
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-wp17a-acp-")));
  home = realpathSync(mkdtempSync(join(tmpdir(), "amc-wp17a-acp-home-")));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
});
afterEach(async () => {
  for (const handle of handles.splice(0)) await handle.close();
  lockVault(workspace);
  rmSync(workspace, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
function client(options: Pick<AcpStdioInit, "forkSessionFactory"> = {}) {
  const stdin = new EventEmitter(), frames: Frame[] = [];
  const handle = startAcpStdio({ workspace, agentId: "default", providerId: "stub", systemPrompt: "Fork fixture system.", tools: "none",
    credentialsMode: "operator-only", credentialsHome: home, stdin, ...options,
    stdout: { write: bytes => { frames.push(JSON.parse(bytes.toString("utf8")) as Frame); return true; } },
    stderr: { write: () => true } });
  handles.push(handle);
  let sequence = 0;
  return { async call(method: string, params: unknown): Promise<Frame> {
    const id = ++sequence;
    stdin.emit("data", Buffer.from(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`));
    await vi.waitFor(() => expect(frames.find(frame => frame.id === id)).toBeDefined(), { timeout: 20_000, interval: 10 });
    return frames.find(frame => frame.id === id)!;
  } };
}
const scope = () => ({ cwd: workspace, mcpServers: [] });
const prompt = (sessionId: string, text: string) => ({ sessionId, prompt: [{ type: "text", text }] });
function payload(row: EvidenceEvent): string {
  const read = readEventPayload(workspace, row);
  expect(read.status).toBe("ok");
  return read.status === "ok" ? read.bytes.toString("utf8") : "";
}
function requestText(sessionId: string) {
  const events = readNativeSessionEvents(workspace, sessionId);
  const header = events.find(row => row.event_type === "request/header")!;
  expect(header).toBeDefined();
  const derived = deriveRecordedRequest({ workspace, events, headerEventId: header.id });
  expect(derived.status).toBe("reconstructed");
  expect(derived.inconsistencies).toEqual([]);
  const request = JSON.parse(derived.bytes!.toString("utf8")) as {
    messages: { role: string; content: { type: string; text?: string }[] }[];
  };
  return { events, header, text: request.messages.flatMap(message => message.content.flatMap(part => part.type === "text" ? [part.text] : [])) };
}

describe("WP17a native ACP context fork", () => {
  it("advertises standard fork and sends inherited conversation in the child's first reconstructable request", async () => {
    const peer = client();
    const initialized = await peer.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
    const capabilities = initialized.result!.agentCapabilities as Record<string, unknown>;
    expect(capabilities.sessionCapabilities).toEqual({ fork: {} });
    expect((capabilities._meta as Record<string, Record<string, unknown>>)[AMC]!.forkContext).toBe("authenticated-parent-history");
    const parent = (await peer.call("session/new", scope())).result!.sessionId as string;
    expect((await peer.call("session/prompt", prompt(parent, "Ancestor user fixture."))).result?.stopReason).toBe("end_turn");
    const before = readNativeSessionEvents(workspace, parent);
    const ancestorAnswer = payload(before.find(row => row.event_type === "assistant/block")!);
    const forked = await peer.call("session/fork", { sessionId: parent, ...scope() });
    expect(forked.error).toBeUndefined();
    const child = forked.result!.sessionId as string;
    expect(child).not.toBe(parent);
    expect((await peer.call("session/prompt", prompt(child, "Independent child fixture."))).result?.stopReason).toBe("end_turn");
    const sent = requestText(child);
    expect(sent.text).toContain("Ancestor user fixture.");
    expect(sent.text).toContain(ancestorAnswer);
    expect(sent.text).toContain("Independent child fixture.");
    const inherited = sent.events.filter(row => row.event_type === "audit")
      .map(row => JSON.parse(row.meta_json) as { forkSource?: { sessionId: string; eventId: string; eventHash: string; turn: number | null }; copiedEventId?: string })
      .filter(receipt => receipt.forkSource !== undefined);
    expect(inherited.length).toBeGreaterThan(0);
    const ids = (JSON.parse(sent.header.meta_json) as { sourceEventIds: string[] }).sourceEventIds;
    for (const receipt of inherited) {
      const source = before.find(row => row.id === receipt.forkSource!.eventId)!;
      expect(source).toBeDefined();
      expect(receipt.forkSource).toMatchObject({ sessionId: parent, eventHash: source.event_hash });
      const copied = sent.events.find(row => row.id === receipt.copiedEventId)!;
      expect(copied).toBeDefined();
      if (copied.event_type === "user/message" || copied.event_type === "assistant/block") expect(ids).toContain(copied.id);
    }
    const opening = JSON.parse(sent.events[0]!.meta_json) as { parentSession: { sessionId: string; forkTurn: number } };
    expect(opening.parentSession).toMatchObject({ sessionId: parent, forkTurn: 1 });
    expect(readNativeSessionEvents(workspace, parent)).toEqual(before);
  });

  it("keeps the explicit lineage-only extension empty of inherited model conversation", async () => {
    const peer = client();
    await peer.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
    const parent = (await peer.call("session/new", scope())).result!.sessionId as string;
    await peer.call("session/prompt", prompt(parent, "Private ancestor fixture."));
    const before = readNativeSessionEvents(workspace, parent);
    const forked = await peer.call("_amc/session/fork", { sessionId: parent, ...scope() });
    expect(forked.error).toBeUndefined();
    expect((forked.result!._meta as Record<string, Record<string, unknown>>)[AMC]!.forkContext).toBe("lineage-only");
    const child = forked.result!.sessionId as string;
    expect(readNativeSessionEvents(workspace, child).filter(row => row.event_type === "user/message" || row.event_type === "assistant/block")).toEqual([]);
    await peer.call("session/prompt", prompt(child, "Only this child fixture."));
    const sent = requestText(child);
    expect(sent.text).toContain("Only this child fixture.");
    expect(sent.text).not.toContain("Private ancestor fixture.");
    expect(readNativeSessionEvents(workspace, parent)).toEqual(before);
  });

  it("honors an operator-supplied standard fork factory instead of silently selecting the default", async () => {
    const factory = vi.fn<NonNullable<AcpStdioInit["forkSessionFactory"]>>(async () => { throw new Error("operator fork fixture refusal"); });
    const peer = client({ forkSessionFactory: factory });
    await peer.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
    const parent = (await peer.call("session/new", scope())).result!.sessionId as string;
    const before = readNativeSessionEvents(workspace, parent);
    const refused = await peer.call("session/fork", { sessionId: parent, ...scope() });
    expect(refused.error).toBeDefined();
    expect(refused.result).toBeUndefined();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory.mock.calls[0]![0]).toMatchObject({ parentSessionId: parent, workspace, agentId: "default", signal: expect.any(AbortSignal) });
    expect(readNativeSessionEvents(workspace, parent)).toEqual(before);
  });
});
