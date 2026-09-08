/** Adapter contracts, not a claim that an arbitrary endpoint/model supports them. */
import { LLM_FAILURE_CODE, LlmError } from "../llmFailure.js";
import type { EncodableRequest } from "../request/requestSpec.js";

export const CAPABILITY_NAMES = [
  "text-input", "text-output", "image-input", "image-output", "audio-input", "audio-output", "video-input",
  "thinking-output", "thinking-replay", "tool-calls", "tool-replay", "tool-result-error-flag", "tool-result-error-text",
  "usage", "cache-read-usage", "cache-write-usage", "prompt-cache-control"
] as const;
export type ProviderCapability = typeof CAPABILITY_NAMES[number];
export type CapabilitySupport = "supported" | "unsupported" | "unknown";
export interface ProviderCapabilities {
  readonly schemaVersion: 1;
  readonly protocol: string;
  readonly features: Readonly<Record<ProviderCapability, CapabilitySupport>>;
  readonly usage: "reported-required" | "synthetic-demonstration";
  readonly cache: "automatic" | "explicit-breakpoints" | "none";
  readonly thinking: "unsupported" | "output-text-only-no-replay";
  readonly toolReplay: "provider-call-id-and-text-result";
  readonly toolErrorRepresentation: "wire-error-flag" | "amc-text-envelope-v1" | "unsupported";
  readonly modelSupport: "not-probed";
}
function contract(protocol: string, supported: readonly ProviderCapability[], details: Pick<ProviderCapabilities, "usage" | "cache" | "thinking" | "toolErrorRepresentation">): ProviderCapabilities {
  const features = Object.fromEntries(CAPABILITY_NAMES.map(name => [name, supported.includes(name) ? "supported" : "unsupported"])) as Record<ProviderCapability, CapabilitySupport>;
  return Object.freeze({ schemaVersion: 1, protocol, features: Object.freeze(features), ...details,
    toolReplay: "provider-call-id-and-text-result", modelSupport: "not-probed" });
}
const BASE: readonly ProviderCapability[] = ["text-input", "text-output", "tool-calls", "tool-replay", "usage"];
export const OPENAI_CHAT_CAPABILITIES = contract("openai-chat-completions", [...BASE, "tool-result-error-text", "cache-read-usage"],
  { usage: "reported-required", cache: "automatic", thinking: "unsupported", toolErrorRepresentation: "amc-text-envelope-v1" });
export const ANTHROPIC_CAPABILITIES = contract("anthropic-messages", [...BASE, "thinking-output", "tool-result-error-flag", "cache-read-usage", "cache-write-usage", "prompt-cache-control"],
  { usage: "reported-required", cache: "explicit-breakpoints", thinking: "output-text-only-no-replay", toolErrorRepresentation: "wire-error-flag" });
export const OPENAI_RESPONSES_CAPABILITIES = contract("openai-responses", [...BASE, "tool-result-error-text", "cache-read-usage", "cache-write-usage"],
  { usage: "reported-required", cache: "automatic", thinking: "unsupported", toolErrorRepresentation: "amc-text-envelope-v1" });
export const STUB_CAPABILITIES = contract("amc-stub-echo", [...BASE, "tool-result-error-flag"],
  { usage: "synthetic-demonstration", cache: "none", thinking: "unsupported", toolErrorRepresentation: "wire-error-flag" });

export class LlmCapabilityError extends LlmError {
  readonly capability: string;
  readonly support: CapabilitySupport;
  constructor(capability: string, support: CapabilitySupport) {
    super(`Required LLM capability ${capability} is ${support}; choose an explicitly supported adapter or remove that requirement.`, LLM_FAILURE_CODE.INVALID_REQUEST);
    this.name = "LlmCapabilityError"; this.capability = capability; this.support = support;
  }
}
/** Capture discovery metadata once with the same lifetime as the route. */
export function snapshotCapabilities(value: ProviderCapabilities | undefined): ProviderCapabilities | null {
  if (value === undefined) return null;
  if (value === null || value.schemaVersion !== 1 || typeof value.protocol !== "string" || !value.protocol || !value.features
      || !["reported-required", "synthetic-demonstration"].includes(value.usage)
      || !["automatic", "explicit-breakpoints", "none"].includes(value.cache)
      || !["unsupported", "output-text-only-no-replay"].includes(value.thinking)
      || !["wire-error-flag", "amc-text-envelope-v1", "unsupported"].includes(value.toolErrorRepresentation)
      || value.toolReplay !== "provider-call-id-and-text-result" || value.modelSupport !== "not-probed") {
    throw new LlmCapabilityError("valid-capability-metadata", "unknown");
  }
  const features = {} as Record<ProviderCapability, CapabilitySupport>;
  for (const name of CAPABILITY_NAMES) {
    const support = value.features[name];
    if (!["supported", "unsupported", "unknown"].includes(support)) throw new LlmCapabilityError(name, "unknown");
    features[name] = support;
  }
  if ((value.toolErrorRepresentation === "wire-error-flag" && features["tool-result-error-flag"] !== "supported")
      || (value.toolErrorRepresentation === "amc-text-envelope-v1" && features["tool-result-error-text"] !== "supported")
      || (value.toolErrorRepresentation === "unsupported" && (features["tool-result-error-flag"] === "supported" || features["tool-result-error-text"] === "supported"))) {
    throw new LlmCapabilityError("consistent-tool-error-representation", "unknown");
  }
  return Object.freeze({ ...value, features: Object.freeze(features) });
}
export function assertRequiredCapabilities(capabilities: ProviderCapabilities | null, requirements: readonly string[] = []): void {
  if (!Array.isArray(requirements)) throw new LlmCapabilityError("valid-requirements", "unknown");
  for (const name of requirements) {
    if (typeof name !== "string" || !CAPABILITY_NAMES.includes(name as ProviderCapability)) {
      throw new LlmCapabilityError("unrecognized-requirement", "unknown");
    }
    const support = capabilities?.features[name as ProviderCapability] ?? "unknown";
    if (support !== "supported") throw new LlmCapabilityError(name, support);
  }
}
/** Live-only admission; historical encoder versions remain available to derive old bytes. */
export function assertRequestCapabilities(capabilities: ProviderCapabilities | null, request: EncodableRequest): void {
  const required = new Set<string>(["text-input", "text-output", "usage"]);
  if (request.tools?.length) required.add("tool-calls");
  for (const message of request.messages) {
    if (!["user", "assistant", "tool"].includes(message.role)) throw new LlmCapabilityError("history-role", "unsupported");
    for (const part of message.parts) {
      switch (part.kind) {
        case "text":
          if (message.role === "tool") throw new LlmCapabilityError("unkeyed-tool-result", "unsupported");
          break;
        case "thinking": required.add("thinking-replay"); break;
        case "image": required.add("image-input"); break;
        case "tool_use":
          if (message.role !== "assistant") throw new LlmCapabilityError("tool-call-role", "unsupported");
          required.add("tool-replay"); break;
        case "tool_result":
          if (message.role !== "tool") throw new LlmCapabilityError("tool-result-role", "unsupported");
          if (typeof part.isError !== "boolean") throw new LlmCapabilityError("explicit-tool-error-state", "unknown");
          required.add("tool-replay");
          if (part.isError) required.add(capabilities?.features["tool-result-error-flag"] === "supported" ? "tool-result-error-flag" : "tool-result-error-text");
          break;
        default: throw new LlmCapabilityError("unknown-input-modality", "unknown");
      }
    }
  }
  const p = request.params;
  if ((p.thinking !== undefined && (p.thinking as { type?: string })?.type !== "disabled")
      || (p.reasoning_effort !== undefined && p.reasoning_effort !== "none")
      || (p.reasoning !== undefined && (p.reasoning as { effort?: string })?.effort !== "none")) required.add("thinking-output");
  if (p.audio !== undefined || (Array.isArray(p.modalities) && p.modalities.includes("audio"))) required.add("audio-output");
  if (p.modalities !== undefined && !Array.isArray(p.modalities)) throw new LlmCapabilityError("output-modalities", "unknown");
  if (Array.isArray(p.modalities) && p.modalities.some(value => !["text", "audio"].includes(value))) {
    throw new LlmCapabilityError("unknown-output-modality", "unknown");
  }
  assertRequiredCapabilities(capabilities, [...required]);
}
