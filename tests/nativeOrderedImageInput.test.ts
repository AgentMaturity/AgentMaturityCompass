/** AUTHORED UNEXECUTED: ordered codec, immutable inbox, original projection and
 * real runtime tool/error history. No check or fixture ran during authoring. */
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { NativeImageInputError, encodeNativeImageInput, snapshotNativeImages } from "../src/attachments/nativeImageInput.js";
import { decodeNativeOrderedInput, encodeNativeOrderedInput, materializeNativeInputParts,
  NATIVE_ORDERED_INPUT_FORMAT, snapshotNativeInputParts, type NativeInputPart } from "../src/attachments/nativeOrderedInput.js";
import { LoopInbox } from "../src/agent/inbox.js";
import { recordNativeOrderedMessage } from "../src/agent/nativeOrderedMessage.js";
import { SessionService } from "../src/session/sessionService.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LocalCredentialsService } from "../src/credentials/localCredentialsService.js";
import { acpRouteFor } from "../src/acp/acpStdioMain.js";
import { paramsFor } from "../src/cli-agent-options.js";
import { providerToolWireName } from "../src/llm/request/providerToolNames.js";
import { sha256Hex } from "../src/utils/hash.js";
import * as sdk from "../src/sdk/index.js";
import * as native from "../src/sdk/nativeAgentClient.js";
import { imageInput, IMAGE_PNG_BASE64 } from "./fixtures/nativeAcpImageRuntime.js";
import { chatImageStream } from "./fixtures/nativeChatImageStream.js";
import { responsesImageStream } from "./fixtures/nativeResponsesImageStream.js";
import { orderedCleanup, orderedWorkspace, orderedParts, expectedImageWire, firstUserWire, orderedCold } from "./fixtures/nativeOrderedImageHarness.js";

afterEach(orderedCleanup);
function writerAt(root: string) {
  const writer = new SessionService(root);
  writer.open({ agentId: "default", harnessVersion: "ordered-fixture", compositionDigest: "ordered-fixture", policyDigest: "ordered-fixture" });
  return writer;
}
describe("ordered native image input (unexecuted)", () => {
  test("v1 exact canonical bytes and public exports survive the additive format", () => {
    const legacy = encodeNativeImageInput("legacy", snapshotNativeImages([imageInput()]));
    expect(legacy).toBe(`{"format":"amc-image-input@1","images":[{"data":"${IMAGE_PNG_BASE64}","filename":"pixel.png","mediaType":"image/png"}],"text":"legacy"}`);
    expect(native.NATIVE_ORDERED_INPUT_FORMAT).toBe("amc-image-input@2");
    expect(sdk.NATIVE_ORDERED_INPUT_FORMAT).toBe(native.NATIVE_ORDERED_INPUT_FORMAT);
    expect(sdk.snapshotNativeInputParts).toBe(native.snapshotNativeInputParts);
    const parts = snapshotNativeInputParts(orderedParts());
    const payload = encodeNativeOrderedInput(parts);
    expect(decodeNativeOrderedInput(Buffer.from(payload))).toEqual(parts);
    expect(() => decodeNativeOrderedInput(Buffer.from(legacy))).toThrow(/Unsupported ordered input format/);
  });
  test("immutable original sequence includes empty and adjacent text without merging", () => {
    const original = orderedParts(); const snapshot = snapshotNativeInputParts(original);
    const bytes = encodeNativeOrderedInput(snapshot);
    for (const part of original) if (part.type === "image") part.image.bytes.fill(0);
    original.reverse(); original.splice(0);
    expect(encodeNativeOrderedInput(snapshot)).toBe(bytes);
    expect(Object.isFrozen(snapshot)).toBe(true); expect(snapshot.every(Object.isFrozen)).toBe(true);
    expect(snapshot.map(part => part.type)).toEqual(["text", "image", "text", "text", "image", "text"]);
    expect(snapshot[2]).toEqual({ type: "text", text: "" });
    const materialized = materializeNativeInputParts(snapshot);
    if (materialized[1]?.type !== "image") throw new Error("Expected image");
    materialized[1].image.bytes.fill(0); expect(encodeNativeOrderedInput(snapshot)).toBe(bytes);
  });
  test.each([
    [], [{ type: "text", text: "text-only is explicitly legacy" }],
    [{ type: "image", image: imageInput() }, { type: "audio", data: "AAAA" }],
    [{ type: "image", image: imageInput() }, { type: "text", text: "\ud800" }],
    [{ type: "image", image: imageInput() }, { type: "text", text: "ignored extra", extra: true }],
    Array.from({ length: 9 }, () => ({ type: "image", image: imageInput() })),
    [{ type: "image", image: imageInput() }, ...Array.from({ length: 256 }, () => ({ type: "text", text: "" }))]
  ].map(parts => ({ parts })))("hostile public sequence is refused, not normalized into a different claim", ({ parts }) => {
    expect(() => snapshotNativeInputParts(parts as NativeInputPart[])).toThrow(NativeImageInputError);
  });
  test("noncanonical, truncated, extra-field and wrong-version payloads fail closed", () => {
    const parts = snapshotNativeInputParts(orderedParts()), payload = encodeNativeOrderedInput(parts);
    const invalidUtf8 = Buffer.from(payload); invalidUtf8[invalidUtf8.indexOf("before")] = 0xff;
    expect(() => decodeNativeOrderedInput(invalidUtf8)).toThrow(/lossless UTF-8/);
    for (const value of [payload + "\n", payload.slice(0, -1), JSON.stringify({ format: NATIVE_ORDERED_INPUT_FORMAT, parts, extra: true }),
      payload.replace("amc-image-input@2", "amc-image-input@200"), payload.replace(IMAGE_PNG_BASE64, IMAGE_PNG_BASE64 + " ")]) {
      expect(() => decodeNativeOrderedInput(Buffer.from(value))).toThrow(NativeImageInputError);
    }
  });
  test.each(["sqlite", "jsonl"])("%s immutable v1/v2 queue replay and original signed row provenance", backend => {
    const root = orderedWorkspace(backend), writer = writerAt(root);
    try {
      const inbox = new LoopInbox(writer, () => {});
      inbox.insert("next-turn", "legacy", "followup", { wake: false, demotedFrom: null, images: [imageInput()] });
      const receipt = inbox.insert("next-step", "", "inject", { wake: false, demotedFrom: null, parts: orderedParts() });
      const replay = new LoopInbox(writer, () => {});
      expect(replay.nextTurn).toEqual(inbox.nextTurn); expect(replay.nextStep).toEqual(inbox.nextStep);
      expect(replay.nextTurn[0]!.images).toHaveLength(1); expect(replay.nextTurn[0]!.parts).toBeUndefined();
      const claim = inbox.claim("next-step")[0]!;
      writer.startTurn({ trigger: "user" }); writer.startStep(); recordNativeOrderedMessage(writer, claim);
      const rows = writer.readEvents().filter(row => ["user/message", "user/attachment"].includes(row.event_type));
      expect(rows.map(row => JSON.parse(row.meta_json).sourceContentIndex)).toEqual([0, 1, 2, 3, 4, 5]);
      expect(rows.every(row => JSON.parse(row.meta_json).sourceInputEventId === receipt.eventId)).toBe(true);
      expect(rows.every(row => JSON.parse(row.meta_json).sourceInputFormat === NATIVE_ORDERED_INPUT_FORMAT)).toBe(true);
      expect(rows.filter(row => row.event_type === "user/attachment").map(row => JSON.parse(row.meta_json).sourceInputIndex)).toEqual([0, 1]);
      expect(readEventPayload(root, rows[2]!)).toEqual({ status: "ok", bytes: Buffer.alloc(0) });
      const source = writer.readEvents().find(row => row.id === receipt.eventId)!;
      expect(source.meta_json).not.toContain(IMAGE_PNG_BASE64);
      expect(source.payload_sha256).toBe(sha256Hex(Buffer.from(encodeNativeOrderedInput(claim.parts!))));
    } finally { writer.disposeWithoutClosing(); }
  });
  test("whole sequence mismatch cannot project even a valid text prefix", () => {
    const root = orderedWorkspace(), writer = writerAt(root);
    try {
      const inbox = new LoopInbox(writer, () => {});
      inbox.insert("next-turn", "", "followup", { wake: false, demotedFrom: null, parts: orderedParts() });
      const message = inbox.claim("next-turn")[0]!;
      writer.startTurn({ trigger: "user" }); writer.startStep(); const before = writer.readEvents();
      for (const altered of [{ ...message, parts: [...message.parts!].reverse() }, { ...message, text: "flattened" },
        { ...message, inputEventId: "not-the-source" }, { ...message, origin: "inject" as const }]) {
        expect(() => recordNativeOrderedMessage(writer, altered)).toThrow(); expect(writer.readEvents()).toEqual(before);
      }
    } finally { writer.disposeWithoutClosing(); }
  });
  test.each(["openai", "openai-responses"] as const)("%s actual runtime preserves ordered input plus raw tool arguments and keyed errors, then reconstructs cold", async provider => {
    const root = orderedWorkspace(), writer = writerAt(root);
    const credentials = new LocalCredentialsService({ env: {}, projectDir: null, homeDir: join(root, "empty-home"), includeDotenv: false, watch: false });
    let sealed = false;
    try {
      const system = writer.recordSystemPrompt("Ordered runtime fixture");
      const inbox = new LoopInbox(writer, () => {});
      inbox.insert("next-turn", "", "followup", { wake: false, demotedFrom: null, parts: orderedParts() });
      writer.startTurn({ trigger: "user" }); writer.startStep(); recordNativeOrderedMessage(writer, inbox.claim("next-turn")[0]!);
      const route = acpRouteFor({ workspace: root, agentId: "default", providerId: provider, model: "fixture-model", systemPrompt: "fixture" });
      if ("error" in route) throw new Error(route.error);
      const registry = new AdapterRegistry(); registry.register({ ...route, baseUrl: "https://ordered.invalid", credentialRef: null });
      const raw = '{ "path" : "fixture.txt" }', response = provider === "openai" ? chatImageStream : responsesImageStream;
      const replies = [response({ toolName: providerToolWireName("fs.read"), rawArguments: raw }), response()];
      const sent: Buffer[] = [];
      const runtime = new LlmRuntime({ session: writer, credentials, registry, transport: async request => {
        sent.push(Buffer.from(request.body)); const next = replies.shift(); if (!next) throw new Error("Unexpected fixture request"); return next;
      } });
      const spec = { providerId: provider, model: "fixture-model", params: paramsFor(provider, 64), systemPromptEventId: system.eventId };
      for await (const _chunk of runtime.prepare({ ...spec, tools: [{ name: "fs.read", description: "read", parameters: { type: "object", properties: {} } }] }).stream()) { /* actual recorder */ }
      const call = writer.readEvents().find(row => row.event_type === "tool/call")!;
      expect(readEventPayload(root, call)).toEqual({ status: "ok", bytes: Buffer.from(raw) });
      writer.recordToolResult({ toolCallId: "image-read", outcome: "ERROR", exitCode: 1, timedOut: false, denied: false, content: "Denied by fixture policy" });
      writer.endStep({ stopReason: "tool_calls", usage: null }); writer.startStep();
      for await (const _chunk of runtime.prepare({ ...spec, tools: [] }).stream()) { /* actual recorder */ }
      for (const bytes of sent) expect(firstUserWire(provider, bytes)).toEqual(expectedImageWire(provider));
      const body = JSON.parse(sent[1]!.toString("utf8"));
      if (provider === "openai") {
        expect(body.messages.find((item: { role: string }) => item.role === "assistant").tool_calls[0].function.arguments).toBe(raw);
        const result = body.messages.find((item: { role: string }) => item.role === "tool");
        expect(result.tool_call_id).toBe("image-read"); expect(JSON.parse(result.content)).toEqual({ type: "amc.tool-result", version: 1, isError: true, output: "Denied by fixture policy" });
      } else {
        expect(body.input.find((item: { type: string }) => item.type === "function_call").arguments).toBe(raw);
        const result = body.input.find((item: { type: string }) => item.type === "function_call_output");
        expect(result.call_id).toBe("image-read"); expect(JSON.parse(result.output)).toEqual({ type: "amc.tool-result", version: 1, isError: true, output: "Denied by fixture policy" });
      }
      writer.endStep({ stopReason: "complete", usage: null }); writer.endTurn({ reason: "complete" }); writer.sealTurn(); writer.close({ reason: "fixture-completed" }); sealed = true;
      expect(orderedCold(root, writer.sessionId).map(row => row.bytes)).toEqual(sent.map(bytes => bytes.toString("base64")));
    } finally { if (!sealed) writer.disposeWithoutClosing(); await credentials.close(); }
  }, 60_000);
});
