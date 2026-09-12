/** AUTHORED UNEXECUTED. Scripted HTTP bytes only; no model or core-success mock. */
import type { HttpResponse } from "../../src/llm/adapter/transport.js";
import type { NativeInputPart } from "../../src/attachments/nativeOrderedInput.js";
import { IMAGE_PNG_BASE64, imageInput } from "./nativeAcpImageRuntime.js";

export const GEMINI_RAW_ARGS = '{ "path" : "α.txt", "offset" : 1e0 }';
export const GEMINI_USAGE = { promptTokenCount: 12, cachedContentTokenCount: 5,
  candidatesTokenCount: 4, thoughtsTokenCount: 3, totalTokenCount: 19 };
export function geminiFrame(parts: readonly string[], responseId = "fixture-response", finish: string | null = "STOP",
  usage: unknown = GEMINI_USAGE): string {
  return `{"responseId":${JSON.stringify(responseId)},"modelVersion":"fixture-model","candidates":[{"index":0,"content":{"role":"model","parts":[${parts.join(",")}]}`
    + `${finish === null ? "" : `,"finishReason":${JSON.stringify(finish)}`} }]${usage === null ? "" : `,"usageMetadata":${JSON.stringify(usage)}`}}`;
}
export function geminiSse(frames: readonly string[], suffix = ""): Buffer {
  return Buffer.from(frames.map(frame => `data: ${frame}\r\n\r\n`).join("") + suffix);
}
export function geminiResponse(frames: readonly string[], suffix = "", onReturn?: () => void): HttpResponse {
  const bytes = geminiSse(frames, suffix);
  return { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8" }, body: (async function* () {
    try { for (let at = 0; at < bytes.length; at += 3) yield bytes.subarray(at, at + 3); }
    finally { onReturn?.(); }
  })() };
}
export function geminiTextResponse(responseId = "fixture-response", text = "Gemini fixture answer") {
  return geminiResponse([geminiFrame([JSON.stringify({ text })], responseId)]);
}
export function geminiCallPart(name: string, id?: string, args = GEMINI_RAW_ARGS): string {
  return `{"thoughtSignature":"c2lnbmF0dXJl","functionCall":{"name":${JSON.stringify(name)},${id === undefined ? "" : `"id":${JSON.stringify(id)},`}"args":${args}}}`;
}
export function geminiInputParts(): NativeInputPart[] {
  return [{ type: "text", text: "  before\n" }, { type: "image", image: imageInput() },
    { type: "text", text: "" }, { type: "text", text: "after α  " }];
}
export function geminiInputBlocks() {
  return [{ type: "text", text: "  before\n" }, { type: "image", mimeType: "image/png", data: IMAGE_PNG_BASE64 },
    { type: "text", text: "" }, { type: "text", text: "after α  " }];
}
export const GEMINI_EXPECTED_INPUT = [{ text: "  before\n" }, { inlineData: { mimeType: "image/png", data: IMAGE_PNG_BASE64 } },
  { text: "" }, { text: "after α  " }];
