import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import { afterEach, describe, expect, test, vi } from "vitest";
import { previewNativePrompt, AMCNativeInputError, AMCNativeProtocolError } from "../src/sdk/nativeAgentClient.js";
import { previewNativePrompt as publicPreview } from "../src/sdk/index.js";
import * as evidence from "../src/enforce/evidenceEmitter.js";
import { MAX_WIRE_LINE_BYTES } from "../src/wire/ndjsonFraming.js";

vi.mock("node:child_process", async original => ({ ...await original<typeof import("node:child_process")>() }));
vi.mock("node:fs", async original => ({ ...await original<typeof import("node:fs")>() }));

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
const input = () => ({ sessionId: "preview-session", text: "Inspect this request" });
afterEach(() => vi.restoreAllMocks());

describe("PI-035 local SDK request preview", () => {
  test("public exports preview exact ACP input without spawning, writing evidence, fetching or dispatching", () => {
    const spawn = vi.spyOn(childProcess, "spawn"), spawnSync = vi.spyOn(childProcess, "spawnSync");
    const write = vi.spyOn(fs, "writeFileSync"), append = vi.spyOn(fs, "appendFileSync");
    const fetch = vi.spyOn(globalThis, "fetch");
    const guard = vi.spyOn(evidence, "emitGuardEvent").mockImplementation(() => undefined);
    const result = previewNativePrompt({ ...input(), clientRequestId: "request-1" });
    expect(publicPreview).toBe(previewNativePrompt);
    expect(result).toEqual({ state: "preview", dispatched: false, spend: "none", admission: "not-evaluated",
      request: { method: "session/prompt", params: { sessionId: "preview-session", prompt: [{ type: "text", text: "Inspect this request" }],
        _meta: { "dev.agentmaturity.amc": { clientRequestId: "request-1" } } } } });
    previewNativePrompt({ ...input(), images: [{ filename: "original.png", mediaType: "image/png", bytes: Buffer.from(png, "base64") }] });
    expect(guard).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled(); expect(spawnSync).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled(); expect(append).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  test("does not invent metadata or an outcome when no request identity was supplied", () => {
    const result = previewNativePrompt(input());
    expect(result.request.params).not.toHaveProperty("_meta");
    expect(result).not.toHaveProperty("verification"); expect(result).not.toHaveProperty("usage");
    expect(result).not.toHaveProperty("text");
  });
  test("snapshots original image bytes, preserves empty text for image-only input and deeply freezes output", () => {
    const image = { filename: "original.png", mediaType: "image/png" as const, bytes: Buffer.from(png, "base64") };
    const result = previewNativePrompt({ sessionId: "preview-session", text: "", images: [image] });
    image.bytes.fill(0);
    expect(result.request.params.prompt).toEqual([{ type: "text", text: "" }, { type: "image", mimeType: "image/png", data: png }]);
    for (const value of [result, result.request, result.request.params, result.request.params.prompt, ...result.request.params.prompt]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
  });
  test("freezes nested identity metadata", () => {
    const result = previewNativePrompt({ ...input(), clientRequestId: "request-1" });
    expect(Object.isFrozen(result.request.params._meta?.["dev.agentmaturity.amc"])).toBe(true);
  });
  test.each([null, "", "  ", "bad\0id", "\ud800", 2])("rejects malformed session identity %j", sessionId => {
    expect(() => previewNativePrompt({ ...input(), sessionId: sessionId as string })).toThrow(AMCNativeInputError);
  });
  test.each([null, 4, "\ud800", "", "  \n"])("rejects malformed or empty text %j", text => {
    expect(() => previewNativePrompt({ ...input(), text: text as string })).toThrow(AMCNativeInputError);
  });
  test.each(["", "has space", "line\nfeed", "x".repeat(129), "非ASCII", 9])("rejects malformed client request identity %j", clientRequestId => {
    expect(() => previewNativePrompt({ ...input(), clientRequestId: clientRequestId as string })).toThrow(AMCNativeInputError);
  });
  test("rejects nonobject preview inputs", () => {
    for (const value of [null, undefined, []]) expect(() => previewNativePrompt(value as never)).toThrow(AMCNativeInputError);
  });
  test("rejects malformed image lists, filenames, types and aggregate size locally", () => {
    const image = { filename: "original.png", mediaType: "image/png" as const, bytes: Buffer.from(png, "base64") };
    for (const images of [null, {}, new Array(1), Array(9).fill(image), [{ ...image, filename: "../original.png" }],
      [{ ...image, filename: "wrong.jpg" }], [{ ...image, filename: "x".repeat(256) }]]) {
      expect(() => previewNativePrompt({ ...input(), images: images as never })).toThrow(AMCNativeInputError);
    }
    const large = Buffer.alloc(3 * 1024 * 1024); Buffer.from(png, "base64").copy(large);
    expect(() => previewNativePrompt({ ...input(), images: Array(3).fill({ ...image, bytes: large }) })).toThrow(/aggregate byte limit/);
  });
  test("rejects original-image type mismatches through the shared pure header admission", () => {
    expect(() => previewNativePrompt({ ...input(), images: [{ filename: "bad.png", mediaType: "image/png", bytes: Buffer.from("not a png") }] }))
      .toThrow(/Image bytes/);
  });
  test("refuses requests above ACP ingress size before any dispatch", () => {
    expect(() => previewNativePrompt({ ...input(), text: "x".repeat(MAX_WIRE_LINE_BYTES) })).toThrow(AMCNativeProtocolError);
    const result = previewNativePrompt({ ...input(), text: "x".repeat(MAX_WIRE_LINE_BYTES - 1024) });
    expect(result.state).toBe("preview");
  });
});
