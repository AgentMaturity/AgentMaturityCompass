import { RequestEncodingError } from "../request/requestSpec.js";
import { assertGeminiJsonValue } from "./geminiJson.js";

export const GEMINI_CONTENT_ID = "gemini-generate-content";
export const GEMINI_CONTENT_VERSION = 1;
export const GEMINI_WIRE_CONTRACT = Object.freeze({ retrieved: "2026-09-10", apiVersion: "v1beta",
  reference: "https://ai.google.dev/api/generate-content", transport: "streamGenerateContent?alt=sse",
  modelSupport: "not-probed" });
export function geminiFail(detail: string): never { throw new RequestEncodingError(`Gemini request: ${detail}`); }
export function geminiObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function geminiKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) geminiFail(`unsupported ${label} field ${key}`);
}
export function geminiText(value: unknown, label: string, nonempty = false): string {
  if (typeof value !== "string" || Buffer.from(value, "utf8").toString("utf8") !== value
      || (nonempty && (!value.trim() || /[\u0000-\u001f\u007f]/.test(value)))) return geminiFail(`invalid ${label}`);
  return value;
}
/** A path component, not an arbitrary URL or a model capability assertion. */
export function geminiModel(value: unknown): string {
  const model = geminiText(value, "model", true);
  if (!/^(?:models\/)?[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(model)) return geminiFail("model must name one models/ resource, without URL syntax");
  return model.startsWith("models/") ? model.slice(7) : model;
}
export function geminiParams(value: Record<string, unknown>): Record<string, unknown> {
  try { assertGeminiJsonValue(value); } catch (error) { return geminiFail(error instanceof Error ? error.message : "invalid JSON parameters"); }
  if (!geminiObject(value)) return geminiFail("params must be an object");
  // External cachedContent, built-in tools, file references, safety overrides and
  // alternate output modalities have no signed native source in this version.
  geminiKeys(value, ["generationConfig", "toolConfig"], "params");
  const config = value.generationConfig;
  if (!geminiObject(config)) return geminiFail("generationConfig with an explicit maxOutputTokens is required");
  geminiKeys(config, ["maxOutputTokens", "temperature", "topP", "topK", "stopSequences", "candidateCount", "thinkingConfig", "responseMimeType"], "generationConfig");
  if (!Number.isSafeInteger(config.maxOutputTokens) || (config.maxOutputTokens as number) < 1 || (config.maxOutputTokens as number) > 1_000_000) return geminiFail("maxOutputTokens must be a bounded positive integer");
  if (config.candidateCount !== undefined && config.candidateCount !== 1) return geminiFail("only one candidate is supported");
  if (config.responseMimeType !== undefined && config.responseMimeType !== "text/plain") return geminiFail("only text/plain output is supported");
  for (const [name, maximum] of [["temperature", 2], ["topP", 1]] as const) {
    const number = config[name];
    if (number !== undefined && (typeof number !== "number" || number < 0 || number > maximum)) return geminiFail(`invalid ${name}`);
  }
  if (config.topK !== undefined && (!Number.isSafeInteger(config.topK) || (config.topK as number) <= 0)) return geminiFail("invalid topK");
  if (config.stopSequences !== undefined && (!Array.isArray(config.stopSequences) || config.stopSequences.length > 5
      || config.stopSequences.some(item => typeof item !== "string" || item.length === 0))) return geminiFail("invalid stopSequences");
  if (config.thinkingConfig !== undefined) {
    const thinking = config.thinkingConfig;
    if (!geminiObject(thinking)) return geminiFail("thinkingConfig must be an object");
    geminiKeys(thinking, ["includeThoughts", "thinkingBudget", "thinkingLevel"], "thinkingConfig");
    if (thinking.includeThoughts !== undefined && typeof thinking.includeThoughts !== "boolean") return geminiFail("invalid includeThoughts");
    if (thinking.thinkingBudget !== undefined && (!Number.isSafeInteger(thinking.thinkingBudget) || (thinking.thinkingBudget as number) < -1 || (thinking.thinkingBudget as number) > 1_000_000)) return geminiFail("invalid thinkingBudget");
    if (thinking.thinkingLevel !== undefined && (typeof thinking.thinkingLevel !== "string" || !["MINIMAL", "LOW", "MEDIUM", "HIGH"].includes(thinking.thinkingLevel))) return geminiFail("unsupported thinkingLevel");
    if (thinking.thinkingBudget !== undefined && thinking.thinkingLevel !== undefined) return geminiFail("choose thinkingBudget or thinkingLevel, not both");
  }
  if (value.toolConfig !== undefined) {
    const tool = value.toolConfig;
    if (!geminiObject(tool)) return geminiFail("toolConfig must be an object");
    geminiKeys(tool, ["functionCallingConfig"], "toolConfig");
    const fn = tool.functionCallingConfig;
    if (!geminiObject(fn)) return geminiFail("functionCallingConfig must be an object");
    geminiKeys(fn, ["mode", "allowedFunctionNames"], "functionCallingConfig");
    if (fn.mode !== undefined && (typeof fn.mode !== "string" || !["AUTO", "ANY", "NONE", "VALIDATED"].includes(fn.mode))) return geminiFail("unsupported function calling mode");
    if (fn.allowedFunctionNames !== undefined && (!Array.isArray(fn.allowedFunctionNames) || fn.allowedFunctionNames.length === 0
        || fn.allowedFunctionNames.some(name => typeof name !== "string") || new Set(fn.allowedFunctionNames).size !== fn.allowedFunctionNames.length
        || !["ANY", "VALIDATED"].includes(String(fn.mode)))) return geminiFail("allowedFunctionNames requires distinct offered functions in ANY/VALIDATED mode");
  }
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
