import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import type { CredentialsService } from "../src/credentials/credentialsService.js";
import type { HttpRequest, HttpTransport } from "../src/llm/adapter/transport.js";
import type { LlmAdapter } from "../src/llm/adapter/adapterTypes.js";
import { openaiAdapter } from "../src/llm/providers/openaiAdapter.js";
import { openaiResponsesAdapter } from "../src/llm/providers/openaiResponsesAdapter.js";
import { anthropicAdapter } from "../src/llm/providers/anthropicAdapter.js";
import { deriveSessionRequests } from "../src/llm/request/deriveRequest.js";
import { bindProviderToolNames, providerToolWireName } from "../src/llm/request/providerToolNames.js";
import type { ToolSchema } from "../src/llm/request/requestSpec.js";
import { toolCallId, type StreamChunk } from "../src/llm/streamChunk.js";
import { nativeMcpToolName } from "../src/mcp/nativeMcpClient.js";
import { okStream } from "./helpers/llmStubUpstream.js";

// Real request encoders, provider decoders, stream recording and cold replay;
// transport bytes are scripted. This is not a live-provider qualification.
const folders: string[] = [], sessions: SessionService[] = [];
afterEach(() => {
  for (const session of sessions.splice(0)) session.disposeWithoutClosing();
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});
const credentials: CredentialsService = {
  resolve: () => null, describe: () => ({ configured: false, source: null, writable: false }),
  set: async () => { throw new Error("No credentials in this fixture"); }, unset: async () => false
};
const protocols = [
  { id: "chat", adapter: openaiAdapter, params: { max_tokens: 64 } },
  { id: "responses", adapter: openaiResponsesAdapter, params: { max_output_tokens: 64 } },
  { id: "anthropic", adapter: anthropicAdapter, params: { max_tokens: 64, stream: true } }
] as const;
type Protocol = typeof protocols[number];
const tool = (name: string): ToolSchema => ({ name, description: `Fixture ${name}`, parameters: { type: "object", properties: {} } });
const args = '{ "value": 1 }';
const names = ["fs.read", "fs_read", "é", "e\u0301", `${"same.".repeat(20)}one`, `${"same.".repeat(20)}two`,
  "amc_reserved", nativeMcpToolName("reviewed", "remote.工具")];

function offered(protocol: Protocol, request: HttpRequest): string[] {
  const body = JSON.parse(request.body.toString());
  return (body.tools ?? []).map((item: { name?: string; function?: { name: string } }) => protocol.id === "chat" ? item.function!.name : item.name!);
}

function response(protocol: Protocol, wireNames: readonly string[], stop = "tool_calls") {
  if (protocol.id === "chat") return okStream([
    ...wireNames.map((name, index) => ({ data: JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [
      { index, id: `call_${index}`, type: "function", function: { name, arguments: args } }
    ] } }] }) })),
    { data: JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: wireNames.length ? stop : "stop" }] }) },
    { data: JSON.stringify({ choices: [], usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 } }) },
    { data: "[DONE]" }
  ]);
  if (protocol.id === "anthropic") return okStream([
    { data: JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 8, output_tokens: 0 } } }) },
    ...wireNames.flatMap((name, index) => [
      { data: JSON.stringify({ type: "content_block_start", index, content_block: { type: "tool_use", id: `call_${index}`, name, input: {} } }) },
      { data: JSON.stringify({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: args } }) },
      { data: JSON.stringify({ type: "content_block_stop", index }) }
    ]),
    { data: JSON.stringify({ type: "message_delta", delta: { stop_reason: wireNames.length ? "tool_use" : "end_turn" }, usage: { output_tokens: 2 } }) },
    { data: JSON.stringify({ type: "message_stop" }) }
  ]);
  const items = wireNames.map((name, index) => ({ type: "function_call", id: `fc_${index}`, call_id: `call_${index}`, name, arguments: args, status: "completed" }));
  return okStream([
    { data: JSON.stringify({ type: "response.created", response: { id: "resp_fixture" } }) },
    ...items.flatMap((item, output_index) => [
      { data: JSON.stringify({ type: "response.output_item.added", output_index, item: { ...item, arguments: "", status: "in_progress" } }) },
      { data: JSON.stringify({ type: "response.function_call_arguments.delta", output_index, item_id: item.id, delta: args }) },
      { data: JSON.stringify({ type: "response.function_call_arguments.done", output_index, item_id: item.id, arguments: args }) },
      { data: JSON.stringify({ type: "response.output_item.done", output_index, item }) }
    ]),
    { data: JSON.stringify({ type: "response.completed", response: { id: "resp_fixture", status: "completed", output: items,
      usage: { input_tokens: 8, output_tokens: 2, total_tokens: 10 } } }) }
  ]);
}

function harness(protocol: Protocol, transport: HttpTransport, adapter: LlmAdapter = protocol.adapter) {
  const workspace = mkdtempSync(join(tmpdir(), "amc-provider-name-")); folders.push(workspace);
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  const session = new SessionService(workspace); sessions.push(session);
  session.open({ agentId: "default", harnessVersion: "fixture", compositionDigest: "fixture-composition", policyDigest: "fixture-policy" });
  const system = session.recordSystemPrompt("Fixture: preserve tool identity.");
  session.startTurn({ trigger: "user" }); session.recordUserMessage("Use only offered tools."); session.startStep();
  const registry = new AdapterRegistry();
  registry.register({ providerId: "fixture", adapter, baseUrl: "https://provider.invalid", credentialRef: null, models: ["fixture"] });
  const runtime = new LlmRuntime({ session, registry, credentials, transport });
  const spec = (tools: readonly ToolSchema[] | null) => ({ providerId: "fixture", model: "fixture", params: protocol.params,
    tools, systemPromptEventId: system.eventId });
  const close = (failed = false) => {
    session.endStep({ stopReason: failed ? "error" : "end_turn", usage: null });
    session.endTurn({ reason: failed ? "error" : "complete" }); session.sealTurn(); session.close({ reason: "completed" });
  };
  return { workspace, session, runtime, spec, close };
}

async function drain(stream: AsyncIterable<StreamChunk>, chunks: StreamChunk[] = []) {
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}
function calls(chunks: readonly StreamChunk[]) {
  return chunks.flatMap(chunk => chunk.type === "block-end" && chunk.block.kind === "tool_use" ? [chunk.block] : []);
}

describe("provider tool names retain signed internal identity", () => {
  test("stable aliases distinguish punctuation, Unicode normalization, long prefixes and reserved names", () => {
    const forward = bindProviderToolNames(names.map(tool)), reverse = bindProviderToolNames([...names].reverse().map(tool));
    expect(forward.size).toBe(names.length);
    for (const [wire, canonical] of forward) {
      expect(wire).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
      expect(reverse.get(wire)).toBe(canonical);
      expect(bindProviderToolNames([tool(canonical)]).get(wire)).toBe(canonical);
    }
    expect(providerToolWireName("fs_read")).toBe("fs_read");
    expect(providerToolWireName("fs.read")).not.toBe("fs_read");
    expect(providerToolWireName("é")).not.toBe(providerToolWireName("e\u0301"));
    const alias = providerToolWireName("fs.read");
    expect(bindProviderToolNames([tool("fs.read"), tool(alias)]).size).toBe(2);
    expect(providerToolWireName(alias)).not.toBe(alias);
  });

  test("duplicate and lossy canonical identities refuse instead of choosing one", () => {
    expect(() => bindProviderToolNames([tool("fs.read"), tool("fs.read")])).toThrow(/Duplicate/);
    for (const invalid of ["", "   ", "read\u0000", "\ud800", "\udfff"]) expect(() => providerToolWireName(invalid)).toThrow();
  });

  test.each(protocols)("$id maps actual provider frames back to internal names and commits both identities", async protocol => {
    const sent: Buffer[] = []; let wireNames: string[] = [];
    const h = harness(protocol, async request => { sent.push(Buffer.from(request.body)); wireNames = offered(protocol, request); return response(protocol, wireNames); });
    const prepared = h.runtime.prepare(h.spec(names.map(tool)));
    const blocks = calls(await drain(prepared.stream()));
    expect(wireNames).toHaveLength(names.length); expect(new Set(wireNames).size).toBe(names.length);
    expect(blocks.map(block => block.name)).toEqual(names);
    expect(blocks.map(block => block.providerWireName)).toEqual(wireNames);
    const recorded = h.session.readEvents().filter(row => row.event_type === "tool/call");
    expect(recorded).toHaveLength(names.length);
    for (const [index, row] of recorded.entries()) {
      expect(JSON.parse(row.meta_json)).toMatchObject({ toolName: names[index], toolCallId: `call_${index}`,
        providerName: { version: 1, wireName: wireNames[index], headerEventId: prepared.headerEventId,
          encoderId: protocol.adapter.encoderId, encoderVersion: protocol.adapter.encoderVersion } });
      const payload = readEventPayload(h.workspace, row); expect(payload.status).toBe("ok");
      if (payload.status === "ok") expect(payload.bytes.toString()).toBe(args);
      h.session.recordToolResult({ toolCallId: `call_${index}`, outcome: "OK", exitCode: 0, timedOut: false, denied: false, content: "synthetic tool result" });
    }
    h.close();
    expect(verifyLedgerIntegrity(h.workspace).chain.ok).toBe(true);
    expect(deriveSessionRequests({ workspace: h.workspace, sessionId: h.session.sessionId })[0]).toMatchObject({ status: "reconstructed", bytes: sent[0] });
  });

  test.each(protocols)("$id replays a removed historical tool but never reauthorizes its returned alias", async protocol => {
    const sent: Buffer[] = []; let originalWire = "";
    const h = harness(protocol, async request => {
      sent.push(Buffer.from(request.body));
      if (sent.length === 1) originalWire = offered(protocol, request)[0]!;
      return response(protocol, [originalWire]);
    });
    await drain(h.runtime.stream(h.spec([tool("fs.read")])));
    h.session.recordToolResult({ toolCallId: "call_0", outcome: "OK", exitCode: 0, timedOut: false, denied: false, content: "old result" });
    h.session.endStep({ stopReason: "tool_use", usage: null }); h.session.startStep();
    const current: StreamChunk[] = [];
    await expect(drain(h.runtime.stream(h.spec(null)), current)).rejects.toMatchObject({ code: "AMC_LLM_UNOFFERED_TOOL_NAME" });
    expect(calls(current)).toHaveLength(0);
    const second = JSON.parse(sent[1]!.toString());
    const replayed = protocol.id === "chat" ? second.messages.flatMap((row: { tool_calls?: { function: { name: string } }[] }) => row.tool_calls ?? []).map((row: { function: { name: string } }) => row.function.name)
      : protocol.id === "responses" ? second.input.filter((row: { type: string }) => row.type === "function_call").map((row: { name: string }) => row.name)
      : second.messages.flatMap((row: { content: { type: string; name?: string }[] }) => row.content).filter((row: { type: string }) => row.type === "tool_use").map((row: { name: string }) => row.name);
    expect(replayed).toEqual([originalWire]); expect(second.tools).toBeUndefined();
    expect(h.session.readEvents().filter(row => row.event_type === "tool/call")).toHaveLength(1);
    const failure = h.session.readEvents().find(row => row.event_type === "request/failure")!;
    expect(JSON.parse(failure.meta_json)).toMatchObject({ failure: { code: "AMC_LLM_UNOFFERED_TOOL_NAME", message: expect.stringContaining(originalWire) }, policy: { retryable: false } });
    h.close(true);
    expect(verifyLedgerIntegrity(h.workspace).chain.ok).toBe(true);
    const derived = deriveSessionRequests({ workspace: h.workspace, sessionId: h.session.sessionId });
    expect(derived).toHaveLength(2);
    derived.forEach((row, index) => { expect(row.status).toBe("reconstructed"); expect(row.bytes?.equals(sent[index]!)).toBe(true); });
  });

  test.each(["unknown_alias", "fs.read"])("unoffered wire name %s cannot reach a tool consumer", async returned => {
    const protocol = protocols[0];
    const h = harness(protocol, async () => response(protocol, [returned])); const chunks: StreamChunk[] = [];
    await expect(drain(h.runtime.stream(h.spec([tool("fs.read")])), chunks)).rejects.toMatchObject({ code: "AMC_LLM_UNOFFERED_TOOL_NAME" });
    expect(calls(chunks)).toHaveLength(0);
    expect(h.session.readEvents().filter(row => row.event_type === "tool/call" || row.event_type === "tool/result")).toHaveLength(0);
    expect(JSON.parse(h.session.readEvents().find(row => row.event_type === "request/failure")!.meta_json)).toMatchObject({ policy: { retryable: false } });
  });

  test("post-prepare caller mutation cannot change the bound schema authority", async () => {
    const protocol = protocols[0]; let transmitted: string[] = [];
    const h = harness(protocol, async request => { transmitted = offered(protocol, request); return response(protocol, [transmitted[0]!]); });
    const tools = [{ name: "fs.read", description: "Read", parameters: { type: "object" } }];
    const prepared = h.runtime.prepare(h.spec(tools));
    tools[0]!.name = "fs.write"; tools.push({ name: "bash", description: "Shell", parameters: { type: "object" } });
    const result = calls(await drain(prepared.stream()));
    expect(transmitted).toHaveLength(1); expect(result.map(block => block.name)).toEqual(["fs.read"]);
    expect(JSON.parse(h.session.readEvents().find(row => row.event_type === "tool/call")!.meta_json).toolName).toBe("fs.read");
  });

  test.each(["delta", "end"] as const)("a provider name switch at %s is a signed nonretryable failure", async where => {
    const protocol = protocols[0];
    const first = providerToolWireName("fs.read"), second = providerToolWireName("fs.write");
    const adapter: LlmAdapter = { ...protocol.adapter, decode: async function* () {
      yield { type: "block-start", index: 0, blockKind: "tool_use" };
      yield { type: "tool-call-delta", index: 0, id: toolCallId("call_0"), name: first, argumentsDelta: args };
      if (where === "delta") yield { type: "tool-call-delta", index: 0, id: toolCallId("call_0"), name: second, argumentsDelta: "" };
      else yield { type: "block-end", index: 0, block: { kind: "tool_use", id: toolCallId("call_0"), name: second, arguments: args } };
    } };
    const h = harness(protocol, async () => okStream([]), adapter); const chunks: StreamChunk[] = [];
    await expect(drain(h.runtime.stream(h.spec([tool("fs.read"), tool("fs.write")])), chunks)).rejects.toMatchObject({ code: "AMC_LLM_TOOL_NAME_CHANGED" });
    expect(calls(chunks)).toHaveLength(0);
    expect(h.session.readEvents().filter(row => row.event_type === "tool/call")).toHaveLength(0);
    const failure = JSON.parse(h.session.readEvents().find(row => row.event_type === "request/failure")!.meta_json);
    expect(failure).toMatchObject({ failure: { code: "AMC_LLM_TOOL_NAME_CHANGED", message: expect.stringContaining(first) }, policy: { retryable: false } });
  });

  test.each(["abandon", "max-tokens"] as const)("%s keeps the observed provider name in dropped signed evidence", async kind => {
    const protocol = protocols[0]; let wire = "";
    const h = harness(protocol, async request => { wire = offered(protocol, request)[0]!; return response(protocol, [wire], kind === "max-tokens" ? "length" : "tool_calls"); });
    const prepared = h.runtime.prepare(h.spec([tool("fs.read")]));
    if (kind === "abandon") {
      for await (const chunk of prepared.stream()) if (chunk.type === "tool-call-delta") break;
    } else await drain(prepared.stream());
    expect(h.session.readEvents().filter(row => row.event_type === "tool/call")).toHaveLength(0);
    const dropped = h.session.readEvents().filter(row => row.event_type === "assistant/block" && String(JSON.parse(row.meta_json).stopReason).startsWith("dropped:"));
    expect(dropped).toHaveLength(1);
    const payload = readEventPayload(h.workspace, dropped[0]!); expect(payload.status).toBe("ok");
    if (payload.status === "ok") expect(JSON.parse(payload.bytes.toString())).toMatchObject({ type: "amc.provider-tool-drop", version: 1,
      providerName: { version: 1, wireName: wire, headerEventId: prepared.headerEventId }, content: `fs.read${args}` });
    expect(prepared.settled?.assembly.blocks[0]?.outcome.status).toBe("dropped");
  });

  test("an unnamed adapter delta cannot replace observed wire provenance before abandonment", async () => {
    const protocol = protocols[0], wire = providerToolWireName("fs.read");
    const adapter: LlmAdapter = { ...protocol.adapter, decode: async function* () {
      yield { type: "block-start", index: 0, blockKind: "tool_use" };
      yield { type: "tool-call-delta", index: 0, id: toolCallId("call_0"), name: wire, argumentsDelta: "{" };
      yield { type: "tool-call-delta", index: 0, id: toolCallId("call_0"), argumentsDelta: ' "value": 1 }', providerWireName: "spoofed_wire_name" };
    } };
    const h = harness(protocol, async () => okStream([]), adapter);
    const prepared = h.runtime.prepare(h.spec([tool("fs.read")]));
    let deltas = 0;
    for await (const chunk of prepared.stream()) if (chunk.type === "tool-call-delta" && ++deltas === 2) {
      expect(chunk.providerWireName).toBeUndefined(); break;
    }
    expect(deltas).toBe(2);
    const dropped = h.session.readEvents().filter(row => row.event_type === "assistant/block");
    expect(dropped).toHaveLength(1);
    const payload = readEventPayload(h.workspace, dropped[0]!); expect(payload.status).toBe("ok");
    if (payload.status === "ok") {
      expect(JSON.parse(payload.bytes.toString())).toMatchObject({ type: "amc.provider-tool-drop",
        providerName: { wireName: wire, headerEventId: prepared.headerEventId } });
      expect(payload.bytes.toString()).not.toContain("spoofed_wire_name");
    }
    expect(h.session.readEvents().filter(row => row.event_type === "tool/call")).toHaveLength(0);
  });
});
