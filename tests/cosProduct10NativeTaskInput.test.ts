import { describe, expect, test, vi } from "vitest";
import { assertNativeTaskData, assertNativeTaskInputCapability, dispatchNativeTaskInput, nativeTaskInputCapabilities,
  nativeTaskStartSchema, nativeTaskTurnSchema, prepareNativeTaskInput, NATIVE_TASK_MAX_PARTS_BYTES } from "../src/studio/nativeTaskInput.js";
import { taskBodyHash } from "../src/studio/nativeTaskDescriptors.js";
import type { NativeTaskInputPart, NativeTaskPrompt, NativeTaskProvider } from "../src/studio/nativeTaskTypes.js";
import type { AMCNativeSession, AMCNativeTurn } from "../src/sdk/nativeAgentClient.js";
import { IMAGE_PNG_BASE64 } from "./fixtures/nativeAcpImageRuntime.js";
import { wavBytes } from "./fixtures/nativeSignedAudio.js";

// Pure admission/SDK-dispatch regressions. Mock handles are not runtime or evidence acceptance.
const requestId = "c9b34d8c-09f5-4c4a-8057-921dc8401001";
const image = (): NativeTaskInputPart => ({ type: "image", mimeType: "image/png", data: IMAGE_PNG_BASE64 });
const audio = (): NativeTaskInputPart => ({ type: "audio", mimeType: "audio/wav", data: wavBytes().toString("base64") });
const ordered = (parts: NativeTaskInputPart[] = [image(), { type: "text", text: "" }, { type: "text", text: " after  " }]): NativeTaskPrompt =>
  ({ input: { format: "amc-image-input@2", parts } });
const mixed = (parts: NativeTaskInputPart[] = [audio(), { type: "text", text: "" }, image(), { type: "text", text: "after α  " }]): NativeTaskPrompt =>
  ({ input: { format: "amc-audio-input@1", parts } });
const negotiated = { promptCapabilities: { image: true, audio: true }, _meta: { "dev.agentmaturity.amc": {
  orderedImageInput: "amc-image-input@2", audioInput: { format: "amc-audio-input@1", encoderId: "gemini-generate-content", encoderVersion: 2, mimeTypes: ["audio/wav"] }
} } };

describe("P10 exact original input admission", () => {
  test("legacy text retains its historical body hash, whitespace and optional-field omission", () => {
    const before = { clientRequestId: requestId, agentId: "default", provider: "stub", tools: "none", prompt: "  original\n " };
    const parsed = nativeTaskStartSchema.parse(before);
    expect(parsed).toEqual(before); expect(taskBodyHash(parsed)).toBe(taskBodyHash(before));
    expect(prepareNativeTaskInput(parsed, "stub")).toEqual({ kind: "text", text: before.prompt });
    expect(nativeTaskStartSchema.safeParse({ ...before, input: ordered().input }).success).toBe(false);
    expect(nativeTaskStartSchema.safeParse({ ...before, prompt: undefined }).success).toBe(false);
  });

  test("snapshot keeps empty/adjacent text and exact binary order despite caller mutation", () => {
    const parts: NativeTaskInputPart[] = [audio(), { type: "text", text: "" }, { type: "text", text: "  next\n" }, image(), audio()];
    const input = prepareNativeTaskInput(mixed(parts), "gemini-audio");
    expect(input.kind).toBe("audio");
    if (input.kind !== "audio") throw new Error("Missing audio snapshot");
    expect(input.parts.map(part => part.type)).toEqual(["audio", "text", "text", "image", "audio"]);
    expect(input.parts[1]).toEqual({ type: "text", text: "" });
    expect(input.parts[2]).toEqual({ type: "text", text: "  next\n" });
    const snapshot = JSON.stringify(input);
    parts.reverse(); parts.splice(0);
    expect(JSON.stringify(input)).toBe(snapshot); expect(Object.isFrozen(input.parts)).toBe(true);
    const first = input.parts[0];
    if (first?.type !== "audio") throw new Error("Missing first audio");
    expect(Buffer.from(first.audio.data, "base64")).toEqual(wavBytes());
    expect(first.audio.filename).toBe("acp-audio-1.wav");
  });

  test("dispatch calls only the matching SDK API and hands it original bytes", () => {
    const handle = {} as AMCNativeTurn;
    const session = { prompt: vi.fn<AMCNativeSession["prompt"]>(() => handle),
      promptParts: vi.fn<AMCNativeSession["promptParts"]>(() => handle),
      promptAudioParts: vi.fn<AMCNativeSession["promptAudioParts"]>(() => handle) };
    dispatchNativeTaskInput(session, prepareNativeTaskInput(ordered(), "openai"));
    expect(session.prompt).not.toHaveBeenCalled(); expect(session.promptAudioParts).not.toHaveBeenCalled();
    const imageParts = session.promptParts.mock.calls[0]![0];
    expect(imageParts.map(part => part.type)).toEqual(["image", "text", "text"]);
    if (imageParts[0]?.type !== "image") throw new Error("Missing original image");
    expect(imageParts[0].image.bytes).toEqual(Buffer.from(IMAGE_PNG_BASE64, "base64"));
    dispatchNativeTaskInput(session, prepareNativeTaskInput(mixed(), "gemini-audio"));
    expect(session.promptAudioParts).toHaveBeenCalledTimes(1); expect(session.promptParts).toHaveBeenCalledTimes(1);
    const audioParts = session.promptAudioParts.mock.calls[0]![0];
    if (audioParts[0]?.type !== "audio") throw new Error("Missing original audio");
    expect(audioParts[0].audio.bytes).toEqual(wavBytes());
    dispatchNativeTaskInput(session, prepareNativeTaskInput({ prompt: " unchanged " }, "stub"));
    expect(session.prompt).toHaveBeenCalledWith(" unchanged ");
  });

  test.each(["stub", "openai", "openai-responses", "anthropic", "gemini"] as NativeTaskProvider[])("%s cannot silently adopt the audio route", provider => {
    expect(() => prepareNativeTaskInput(mixed(), provider)).toThrow(/pinned provider/);
    expect(nativeTaskInputCapabilities(provider).audioMimeTypes).toEqual([]);
  });

  test("exact version negotiation is required, not just a provider name or capability boolean", () => {
    const imageInput = prepareNativeTaskInput(ordered(), "openai"), audioInput = prepareNativeTaskInput(mixed(), "gemini-audio");
    for (const input of [imageInput, audioInput]) {
      expect(() => assertNativeTaskInputCapability(negotiated, input)).not.toThrow();
      expect(() => assertNativeTaskInputCapability({ promptCapabilities: { image: true, audio: true } }, input)).toThrow(/negotiate/);
    }
    const wrongVersion = structuredClone(negotiated); wrongVersion._meta["dev.agentmaturity.amc"].audioInput.encoderVersion = 1;
    expect(() => assertNativeTaskInputCapability(wrongVersion, audioInput)).toThrow(/negotiate/);
    expect(() => assertNativeTaskInputCapability({ ...negotiated, promptCapabilities: { audio: true, image: false } }, audioInput)).toThrow(/negotiate/);
  });

  test("rejects URI, MIME, base64, header, version, field and sequence contradictions whole", () => {
    const original = audio();
    const invalid: unknown[] = [
      { input: { format: "amc-audio-input@1", parts: [{ ...original, uri: "https://unowned.invalid/a.wav" }] } },
      { input: { format: "amc-audio-input@1", parts: [{ ...original, filename: "original.wav" }] } },
      { input: { format: "amc-audio-input@1", parts: [{ ...original, mimeType: "audio/mpeg" }] } },
      { input: { format: "amc-audio-input@1", parts: [{ ...original, data: wavBytes().toString("base64") + "\n" }] } },
      { input: { format: "amc-audio-input@1", parts: [{ ...original, data: IMAGE_PNG_BASE64 }] } },
      { input: { format: "amc-audio-input@2", parts: [original] } },
      { input: { format: "amc-audio-input@1", parts: [image()] } },
      { input: { format: "amc-image-input@2", parts: [image(), original] } },
      mixed([original, { type: "text", text: "\ud800" }]), mixed([original, { type: "text", text: "\u0000" }]),
      mixed(Array.from({ length: 9 }, audio)), ordered(Array.from({ length: 9 }, image))
    ];
    for (const value of invalid) expect(() => prepareNativeTaskInput(value as NativeTaskPrompt, "gemini-audio")).toThrow();
    expect(nativeTaskTurnSchema.safeParse({ clientRequestId: requestId, expectedRevision: 1, ...mixed(), command: "not-authority" }).success).toBe(false);
    expect(() => prepareNativeTaskInput(ordered([{ type: "image", mimeType: "image/gif", data: "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" }]), "gemini")).toThrow(/MIME/);
  });

  test("counts UTF-8 across text siblings and rejects ACP-size input before materializing media", () => {
    expect(() => prepareNativeTaskInput(mixed([audio(), { type: "text", text: "α".repeat(4096) }, { type: "text", text: "α".repeat(4097) }]), "gemini-audio")).toThrow();
    const large = { type: "audio" as const, mimeType: "audio/wav" as const, data: wavBytes(1, 100_000).toString("base64") };
    expect(JSON.stringify([large, large]).length).toBeGreaterThan(NATIVE_TASK_MAX_PARTS_BYTES);
    expect(() => prepareNativeTaskInput(mixed([large, large]), "gemini-audio")).toThrow(/frame bound/);
    expect(nativeTaskInputCapabilities("gemini-audio")).toMatchObject({ maxPromptFrameBytes: 262144, maxSerializedPartsBytes: 260096, modelSupport: "not-probed" });
  });

  test("no accessor, sparse array, hidden field or sanitized authority can enter the snapshot", () => {
    let reads = 0;
    const part = { type: "audio", mimeType: "audio/wav" };
    Object.defineProperty(part, "data", { enumerable: true, get() { reads++; return wavBytes().toString("base64"); } });
    expect(() => assertNativeTaskData({ input: { format: "amc-audio-input@1", parts: [part] } })).toThrow();
    expect(reads).toBe(0);
    const sparse = [audio(), audio()]; delete sparse[0];
    expect(() => assertNativeTaskData(sparse)).toThrow();
    const hidden = [audio()]; Object.defineProperty(hidden, Symbol("private"), { value: "not-authority" });
    expect(() => assertNativeTaskData(hidden)).toThrow();
    expect(() => assertNativeTaskData(JSON.parse('{"constructor":"not silently discarded"}'))).toThrow();
  });

  test("the signed retry identity includes original order, MIME, bytes and format", () => {
    const original = { clientRequestId: requestId, expectedRevision: 1, ...mixed() };
    const parsed = nativeTaskTurnSchema.parse(original);
    expect(taskBodyHash(parsed)).toBe(taskBodyHash(original));
    const changed = { clientRequestId: requestId, expectedRevision: 1, ...mixed([image(), audio()]) };
    expect(taskBodyHash(nativeTaskTurnSchema.parse(changed))).not.toBe(taskBodyHash(parsed));
    expect(taskBodyHash(nativeTaskTurnSchema.parse({ ...original, expectedRevision: 2 }))).not.toBe(taskBodyHash(parsed));
  });
});
