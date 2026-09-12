/** AUTHORED UNEXECUTED / UNQUALIFIED. Actual runtime and signed sources;
 * only the HTTP edge is scripted. No live model or installed-package claim.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { Command } from "commander";
import YAML from "yaml";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { ingestAttachment } from "../src/attachments/attachmentIngest.js";
import { MAX_NATIVE_IMAGE_BYTES } from "../src/attachments/nativeImageInput.js";
import { loadNativeImageFiles } from "../src/attachments/nativeImageFiles.js";
import { runComposedTurn } from "../src/kernel/agentLoopRunner.js";
import { registerAgentCommands } from "../src/cli-agent-commands.js";
import { LocalCredentialsService } from "../src/credentials/localCredentialsService.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime, type LlmCallSpec } from "../src/llm/adapter/llmRuntime.js";
import type { LlmAdapter } from "../src/llm/adapter/adapterTypes.js";
import type { HttpRequest, HttpResponse } from "../src/llm/adapter/transport.js";
import { openaiResponsesAdapter } from "../src/llm/providers/openaiResponsesAdapter.js";
import { openaiResponsesEncoder } from "../src/llm/request/openaiResponsesEncoder.js";
import { openaiResponsesEncoderV2 } from "../src/llm/request/openaiResponsesEncoderV2.js";
import { openaiResponsesEncoderV3 } from "../src/llm/request/openaiResponsesEncoderV3.js";
import { BUILT_IN_REQUEST_ENCODERS } from "../src/llm/request/builtInEncoders.js";
import { RequestEncoderRegistry } from "../src/llm/request/requestEncoder.js";
import { providerToolWireName, usesProviderToolNames } from "../src/llm/request/providerToolNames.js";
import type { EncodablePart, EncodableRequest } from "../src/llm/request/requestSpec.js";
import { resolveRequestSources } from "../src/llm/request/requestSources.js";
import * as publicLlm from "../src/llm/index.js";
import { paramsFor, routeFor } from "../src/cli-agent-options.js";
import { acpSupportsImageInput } from "../src/acp/acpPromptInput.js";
import { budgetsPath, loadBudgetsConfig, signBudgetsConfig } from "../src/budgets/budgets.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { sha256Hex } from "../src/utils/hash.js";
import { responsesImageStream } from "./fixtures/nativeResponsesImageStream.js";
import { IMAGE_PNG_BASE64 } from "./fixtures/nativeAcpImageRuntime.js";

const PNG = Buffer.from(IMAGE_PNG_BASE64, "base64");
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");
const roots: string[] = [], writers = new Set<SessionService>(), credentials: LocalCredentialsService[] = [];
afterEach(async () => {
  try {
    for (const writer of writers) writer.disposeWithoutClosing(); writers.clear();
    for (const store of credentials.splice(0)) await store.close();
  } finally { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); vi.unstubAllEnvs(); }
});
function harness(adapter: LlmAdapter = openaiResponsesAdapter, responses = [responsesImageStream()], backend = "sqlite") {
  vi.stubEnv("AMC_SESSION_STORE", backend); vi.stubEnv("AMC_VAULT_PASSPHRASE", "responses-image-fixture-passphrase");
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-responses-image-"))); roots.push(root);
  initWorkspace({ workspacePath: root, agentId: "default", trustBoundaryMode: "isolated" });
  const session = new SessionService(root); writers.add(session);
  session.open({ agentId: "default", harnessVersion: "responses-image-fixture", compositionDigest: "responses-image-fixture", policyDigest: "responses-image-fixture" });
  const system = session.recordSystemPrompt("Describe original signed images; fixture transport, not a model assertion.");
  session.startTurn({ trigger: "user" }); session.startStep(); session.recordUserMessage("Compare the attached bytes.");
  const bytes = Buffer.from(PNG);
  expect(ingestAttachment({ session, filename: "pixel.png", content: bytes })).toMatchObject({ ok: true, sha256: sha256Hex(PNG), mimeType: "image/png" });
  bytes.fill(0);
  const store = new LocalCredentialsService({ env: {}, projectDir: null, homeDir: join(root, "empty-credentials"), includeDotenv: false, watch: false });
  credentials.push(store);
  const registry = new AdapterRegistry();
  registry.register({ providerId: "openai-responses", adapter, baseUrl: "https://responses-image.invalid", credentialRef: null, models: ["fixture-model"] });
  const sent: HttpRequest[] = [];
  const runtime = new LlmRuntime({ session, credentials: store, registry, transport: async request => {
    sent.push({ ...request, body: Buffer.from(request.body), headers: { ...request.headers } });
    const response = responses.shift(); if (!response) throw new Error("Unexpected fixture dispatch"); return response;
  } });
  const spec: LlmCallSpec = { providerId: "openai-responses", model: "fixture-model", params: { max_output_tokens: 64 },
    tools: null, systemPromptEventId: system.eventId };
  const close = (reason: "complete" | "error" = "complete") => {
    session.endStep({ stopReason: reason, usage: null }); session.endTurn({ reason }); session.sealTurn();
    session.close({ reason: "fixture-completed" }); writers.delete(session);
  };
  return { root, session, registry, runtime, spec, sent, close };
}
async function drain(stream: AsyncIterable<unknown>) { for await (const _ of stream) { /* real decoder/grammar/recorder */ } }
function cold(h: { root: string; session: { sessionId: string } }) {
  const child = spawnSync(process.execPath, ["--import", import.meta.resolve("tsx"),
    fileURLToPath(new URL("./fixtures/nativeSignedImageCold.ts", import.meta.url)), h.root, h.session.sessionId],
  { encoding: "utf8", timeout: 30_000, maxBuffer: 32 * 1024 * 1024 });
  expect(child.error).toBeUndefined(); expect(child.status, child.stderr).toBe(0);
  return JSON.parse(child.stdout) as { status: string; bytes: string | null; recordedDigest: string; derivedDigest: string | null }[];
}
const imagePart = (bytes = PNG, mediaType = "image/png"): EncodablePart => ({ kind: "image", bytes, mediaType, sha256: sha256Hex(bytes) });
const input = (): EncodableRequest => ({ model: "fixture-model", params: { max_output_tokens: 64 }, system: "Fixture",
  tools: [{ name: "fs.read", description: "read", parameters: { type: "object", properties: {} } }],
  messages: [{ role: "user", parts: [{ kind: "text", text: "Look" }, imagePart()] }] });
const imageWire = (bytes = PNG, mediaType = "image/png") => ({ type: "input_image", image_url: `data:${mediaType};base64,${bytes.toString("base64")}`, detail: "auto" });

describe("native Responses signed-image encoder and runtime (not executed)", () => {
  test("real CLI parsing and composed native file input use Responses v3; deleted original path is not needed by cold reconstruction", async () => {
    const program = new Command(); registerAgentCommands(program, { log: () => {}, error: () => {}, fail: () => {} });
    const command = program.commands.find(item => item.name() === "agent-loop")!.commands.find(item => item.name() === "run")!;
    expect(command.parseOptions(["--provider", "openai-responses", "--model", "fixture-model", "--image", "one.png", "--image", "two.gif"]).unknown).toEqual([]);
    expect(command.opts()).toMatchObject({ provider: "openai-responses", model: "fixture-model", image: ["one.png", "two.gif"] });
    vi.stubEnv("AMC_SESSION_STORE", "sqlite"); vi.stubEnv("AMC_VAULT_PASSPHRASE", "responses-image-fixture-passphrase");
    const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-responses-composed-"))); roots.push(root);
    initWorkspace({ workspacePath: root, agentId: "default", trustBoundaryMode: "isolated" });
    const file = join(root, "pixel.png"); writeFileSync(file, PNG);
    const selected = routeFor({ log: () => {}, error: () => {}, fail: () => {} }, "openai-responses", {}, "fixture-model")!;
    const sent: Buffer[] = [];
    const outcome = await runComposedTurn({ workspace: root, agentId: "default", systemPrompt: "Original image fixture", prompt: "Describe",
      images: loadNativeImageFiles([file]), route: { providerId: selected.providerId, model: "fixture-model", params: paramsFor(selected.providerId, 64) },
      routes: [{ ...selected, credentialRef: null, baseUrl: "https://responses-composed.invalid" }],
      transport: async request => { sent.push(Buffer.from(request.body)); return responsesImageStream(); },
      credentials: { homeDir: join(root, "no-credentials"), projectDir: null, includeDotenv: false, watch: false } });
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0]!.toString("utf8")).input[0].content).toEqual([{ type: "input_text", text: "Describe" }, imageWire()]);
    rmSync(file); // Only the disposable caller file, never signed history.
    expect(cold({ root, session: { sessionId: outcome.sessionId } })).toEqual([
      expect.objectContaining({ status: "reconstructed", bytes: sent[0]!.toString("base64") })
    ]);
  }, 60_000);
  test.each(["sqlite", "jsonl"])("%s: actual selected runtime sends original bytes; closed writer reconstructs in a fresh default-registry process", async backend => {
    const h = harness(openaiResponsesAdapter, [responsesImageStream()], backend);
    const call = h.runtime.prepare(h.spec); await drain(call.stream());
    expect(h.sent).toHaveLength(1); const transmitted = h.sent[0]!;
    expect(transmitted.url).toBe("https://responses-image.invalid/v1/responses");
    expect(transmitted.headers.authorization).toBeUndefined();
    const body = JSON.parse(transmitted.body.toString("utf8"));
    expect(body).toMatchObject({ model: "fixture-model", stream: true, store: false, max_output_tokens: 64,
      input: [{ role: "user", content: [{ type: "input_text", text: "Compare the attached bytes." }, imageWire()] }] });
    expect(body.messages).toBeUndefined(); expect(body.previous_response_id).toBeUndefined();
    const attachment = h.session.readEvents().find(row => row.event_type === "user/attachment")!;
    expect(readEventPayload(h.root, attachment)).toEqual({ status: "ok", bytes: PNG });
    expect(JSON.parse(attachment.meta_json)).toMatchObject({ mimeType: "image/png", bytes: PNG.length });
    const header = h.session.readEvents().find(row => row.event_type === "request/header")!;
    expect(header.meta_json).toContain('"encoderVersion":3');
    h.close();
    expect(cold(h)).toEqual([expect.objectContaining({ status: "reconstructed", bytes: transmitted.body.toString("base64"),
      recordedDigest: sha256Hex(transmitted.body), derivedDigest: call.requestDigest })]);
    const integrity = verifyLedgerIntegrity(h.root); expect(integrity.chain.ok, integrity.chain.errors.join("\n")).toBe(true);
    expect(integrity.trustRoot.anchored).toBe(false);
  }, 60_000);
  test("images, provider-safe raw function arguments, keyed failure and later text turn all replay without granting historical tools", async () => {
    const raw = '{ "path" : "fixture.txt" }';
    const h = harness(openaiResponsesAdapter, [responsesImageStream({ toolName: providerToolWireName("fs.read"), rawArguments: raw }), responsesImageStream(), responsesImageStream()]);
    const tools = [{ name: "fs.read", description: "read", parameters: { type: "object", properties: {} } }];
    await drain(h.runtime.prepare({ ...h.spec, tools }).stream());
    const called = h.session.readEvents().find(row => row.event_type === "tool/call")!;
    expect(JSON.parse(called.meta_json)).toMatchObject({ toolName: "fs.read", providerName: { encoderVersion: 3, wireName: providerToolWireName("fs.read") } });
    expect(readEventPayload(h.root, called)).toEqual({ status: "ok", bytes: Buffer.from(raw) });
    h.session.recordToolResult({ toolCallId: "image-read", outcome: "ERROR", exitCode: 1, timedOut: false, denied: false, content: "Fixture policy refused reading" });
    h.session.endStep({ stopReason: "tool_calls", usage: null }); h.session.startStep();
    await drain(h.runtime.prepare({ ...h.spec, tools: [] }).stream());
    const replay = JSON.parse(h.sent[1]!.body.toString("utf8"));
    expect(replay.tools).toEqual([]);
    expect(replay.input).toContainEqual({ type: "function_call", call_id: "image-read", name: providerToolWireName("fs.read"), arguments: raw });
    const result = replay.input.find((item: { type?: string }) => item.type === "function_call_output");
    expect(JSON.parse(result.output)).toEqual({ type: "amc.tool-result", version: 1, isError: true, output: "Fixture policy refused reading" });
    h.session.endStep({ stopReason: "complete", usage: null }); h.session.endTurn({ reason: "complete" }); h.session.sealTurn();
    h.session.startTurn({ trigger: "user" }); h.session.startStep(); h.session.recordUserMessage("Use the original image again.");
    await drain(h.runtime.prepare({ ...h.spec, tools: [] }).stream());
    expect(h.sent[2]!.body.toString("utf8")).toContain(IMAGE_PNG_BASE64);
    h.close(); expect(cold(h).map(row => row.bytes)).toEqual(h.sent.map(row => row.body.toString("base64")));
  }, 60_000);
  test("prepare snapshots the offered authority; an unoffered alias cannot become a signed executable call", async () => {
    const h = harness(openaiResponsesAdapter, [responsesImageStream({ toolName: providerToolWireName("fs.write") })]);
    const tools = [{ name: "fs.read", description: "read", parameters: { type: "object" } }];
    const call = h.runtime.prepare({ ...h.spec, tools }); tools[0]!.name = "fs.write";
    await expect(drain(call.stream())).rejects.toThrow();
    expect(JSON.parse(h.sent[0]!.body.toString("utf8")).tools[0].name).toBe(providerToolWireName("fs.read"));
    expect(h.session.readEvents().some(row => row.event_type === "tool/call")).toBe(false); h.close("error");
  });
  test.each([1, 2])("historical Responses v%s still refuses images before a header or dispatch", encoderVersion => {
    const h = harness({ ...openaiResponsesAdapter, encoderVersion });
    expect(() => h.runtime.prepare(h.spec)).toThrow(/image/);
    expect(h.sent).toEqual([]); expect(h.session.readEvents().some(row => row.event_type === "request/header")).toBe(false); h.close("error");
  });
  test("all historical identities remain registered; v3 text/function/result bytes equal v2, without changing signed names", () => {
    const registry = new RequestEncoderRegistry(BUILT_IN_REQUEST_ENCODERS);
    for (const encoder of [openaiResponsesEncoder, openaiResponsesEncoderV2, openaiResponsesEncoderV3]) {
      expect(registry.get(encoder.id, encoder.version)).toBe(encoder);
    }
    const plain: EncodableRequest = { ...input(), params: { max_output_tokens: 64, tool_choice: { type: "function", name: "fs.read" } }, messages: [
      { role: "user", parts: [{ kind: "text", text: "one" }, { kind: "text", text: "two" }] },
      { role: "assistant", parts: [{ kind: "text", text: "checking" }, { kind: "tool_use", toolCallId: "c1", toolName: "fs.read", argumentsJson: '{ "a": 1 }' }] },
      { role: "tool", parts: [{ kind: "tool_result", toolCallId: "c1", isError: true, text: '{"isError":false}' }] },
      { role: "user", parts: [{ kind: "text", text: "continue" }] }
    ] };
    expect(openaiResponsesEncoderV3.encode(plain)).toEqual(openaiResponsesEncoderV2.encode(plain));
    expect(plain.tools![0]!.name).toBe("fs.read");
    for (const encoder of [openaiResponsesEncoder, openaiResponsesEncoderV2]) expect(() => encoder.encode(input())).toThrow(/image/);
    expect(publicLlm.openaiResponsesEncoderV3).toBe(openaiResponsesEncoderV3);
    expect(publicLlm.OPENAI_RESPONSES_TEXT_CAPABILITIES.features["image-input"]).toBe("unsupported");
    expect(usesProviderToolNames("openai-responses", 3)).toBe(true); expect(usesProviderToolNames("openai-responses", 4)).toBe(false);
  });
  test("actual CLI route selects v3 while unsupported and unknown route identities cannot advertise images", () => {
    const fail = vi.fn();
    const route = routeFor({ log: () => {}, error: () => {}, fail }, "openai-responses", {}, "fixture-model");
    expect(route?.adapter).toBe(openaiResponsesAdapter); expect(fail).not.toHaveBeenCalled();
    const registry = new AdapterRegistry(); registry.register(route!);
    const pinned = registry.pin({ providerId: "openai-responses", model: "fixture-model" });
    expect(pinned).toMatchObject({ encoderVersion: 3, capabilities: { modelSupport: "not-probed" } });
    expect(acpSupportsImageInput(pinned)).toBe(true);
    for (const version of [1, 2, 4]) expect(acpSupportsImageInput({ ...pinned, encoderVersion: version })).toBe(false);
    expect(acpSupportsImageInput({ ...pinned, encoderId: "unknown" })).toBe(false);
    expect(acpSupportsImageInput({ ...pinned, capabilities: null })).toBe(false);
    expect(acpSupportsImageInput({ ...pinned, capabilities: { ...pinned.capabilities!, protocol: "deepseek-chat-completions" } })).toBe(false);
    expect(publicLlm.DEEPSEEK_CAPABILITIES.features["image-input"]).toBe("unsupported");
    expect(publicLlm.OPENAI_CHAT_CAPABILITIES.features["image-input"]).toBe("supported");
  });
  test("multiple original formats retain ordering; image-only has no invented empty input_text", () => {
    const request = { ...input(), messages: [{ role: "user" as const, parts: [imagePart(), imagePart(GIF, "image/gif")] }] };
    expect(JSON.parse(openaiResponsesEncoderV3.encode(request).toString("utf8")).input).toEqual([
      { role: "user", content: [imageWire(), imageWire(GIF, "image/gif")] }
    ]);
  });
  test.each(["assistant", "tool", "system"] as const)("%s images cannot be projected into the user role", role => {
    expect(() => openaiResponsesEncoderV3.encode({ ...input(), messages: [{ role, parts: [imagePart()] }] })).toThrow();
  });
  test("hostile digest-only, wrong MIME, altered digest, URI bytes and count/byte excess all refuse", () => {
    const oversized = Buffer.alloc(MAX_NATIVE_IMAGE_BYTES + 1); PNG.copy(oversized);
    const invalid: EncodablePart[] = [
      { kind: "image", sha256: sha256Hex(PNG) },
      { kind: "image", bytes: PNG, mediaType: "image/jpeg", sha256: sha256Hex(PNG) },
      { kind: "image", bytes: PNG, mediaType: "image/png", sha256: "0".repeat(64) },
      imagePart(Buffer.from("https://never-fetch.invalid/image.png")), imagePart(oversized)
    ];
    for (const part of invalid) expect(() => openaiResponsesEncoderV3.encode({ ...input(), messages: [{ role: "user", parts: [part] }] })).toThrow();
    expect(() => openaiResponsesEncoderV3.encode({ ...input(), messages: [{ role: "user", parts: Array.from({ length: 9 }, () => imagePart()) }] })).toThrow(/limits/);
    const large = Buffer.alloc(3 * 1024 * 1024); PNG.copy(large); // Header-only size fixture, not codec validation.
    expect(() => openaiResponsesEncoderV3.encode({ ...input(), messages: [{ role: "user", parts: Array.from({ length: 3 }, () => imagePart(large)) }] })).toThrow(/limits/);
    for (const params of [{ input: [] }, { previous_response_id: "remote-state" }, { tools: [] }, { stream: false }, { tool_choice: { type: "function", name: "unoffered" } }]) {
      expect(() => openaiResponsesEncoderV3.encode({ ...input(), params })).toThrow();
    }
  });
  test.each(["missing", "pruned", "tampered", "mime", "length", "surface"] as const)("closed-writer cold evidence keeps the %s distinction without supplying oracle bytes", async mode => {
    const h = harness(); await drain(h.runtime.prepare(h.spec).stream()); h.close();
    // Mutation applies ONLY to the disposable workspace minted by harness above.
    const db = new Database(join(h.root, ".amc", "evidence.sqlite"));
    try {
      for (const trigger of ["protect_evidence_immutable", "no_delete_evidence", "no_update_evidence"]) db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
      const row = db.prepare("SELECT id, meta_json FROM evidence_events WHERE session_id = ? AND event_type = 'user/attachment'").get(h.session.sessionId) as { id: string; meta_json: string };
      if (mode === "missing") db.prepare("UPDATE evidence_events SET payload_inline = NULL, payload_path = NULL, canonical_payload_path = NULL WHERE id = ?").run(row.id);
      else if (mode === "pruned") db.prepare("UPDATE evidence_events SET payload_pruned = 1 WHERE id = ?").run(row.id);
      else if (mode === "tampered") db.prepare("UPDATE evidence_events SET payload_inline = ? WHERE id = ?").run("changed original bytes", row.id);
      else {
        const meta = JSON.parse(row.meta_json);
        if (mode === "mime") meta.mimeType = "image/jpeg";
        if (mode === "length") meta.bytes++;
        if (mode === "surface") meta.amcSession.surface.part.sha256 = "0".repeat(64);
        db.prepare("UPDATE evidence_events SET meta_json = ? WHERE id = ?").run(JSON.stringify(meta), row.id);
      }
    } finally { db.close(); }
    expect(cold(h)[0]).toMatchObject({ status: mode === "missing" ? "payload-missing" : mode === "pruned" ? "payload-pruned" : "evidence-inconsistent", bytes: null });
  }, 60_000);
  test("source resolution rejects signed role/length/MIME contradictions before encoder or dispatch", () => {
    const h = harness(), rows = h.session.readEvents();
    const original = rows.find(row => row.event_type === "user/attachment")!;
    for (const change of ["role", "length", "mime"]) {
      const meta = JSON.parse(original.meta_json);
      if (change === "role") meta.amcSession.surface.role = "assistant";
      if (change === "length") meta.bytes++;
      if (change === "mime") meta.mimeType = "image/jpeg";
      const result = resolveRequestSources({ workspace: h.root, events: rows.map(row => row.id === original.id ? { ...row, meta_json: JSON.stringify(meta) } : row),
        model: h.spec.model, params: h.spec.params, systemPromptEventId: h.spec.systemPromptEventId,
        toolSchemaEventId: null, toolSchemaSha256: null, projectionCutoffEventId: rows[rows.length - 1]!.id });
      expect(result.failure?.kind).toBe("evidence-inconsistent"); expect(result.request).toBeNull();
    }
    expect(h.sent).toEqual([]); h.close("error");
  });
  test("signed model budget and pre-dispatch cancellation still refuse Responses image HTTP", async () => {
    const h = harness(), config = loadBudgetsConfig(h.root);
    config.budgets.perAgent.default!.daily.maxLlmRequests = 1;
    writeFileSync(budgetsPath(h.root), YAML.stringify(config)); signBudgetsConfig(h.root);
    await drain(h.runtime.prepare(h.spec).stream());
    await expect(drain(h.runtime.prepare(h.spec).stream())).rejects.toThrow(/request budget exhausted/);
    expect(h.sent).toHaveLength(1);
    const abort = new AbortController(); const call = h.runtime.prepare({ ...h.spec, signal: abort.signal }); abort.abort();
    await expect(drain(call.stream())).rejects.toThrow(/cancelled before budget/); expect(h.sent).toHaveLength(1); h.close("error");
  });
  test("image input does not enable opaque reasoning or hosted/media output", async () => {
    const bytes = Buffer.from('data: {"type":"response.output_item.added","output_index":0,"item":{"id":"unsupported","type":"reasoning"}}\n\n');
    const response: HttpResponse = { status: 200, headers: { "content-type": "text/event-stream" }, body: (async function* () { yield bytes; })() };
    const h = harness(openaiResponsesAdapter, [response]);
    await expect(drain(h.runtime.prepare(h.spec).stream())).rejects.toThrow(/unsupported reasoning/);
    expect(h.session.readEvents().some(row => row.event_type === "tool/call")).toBe(false); h.close("error");
  });
});
