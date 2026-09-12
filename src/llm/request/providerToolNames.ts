import { createHash } from "node:crypto";
import { RequestEncodingError, type EncodableRequest, type ToolSchema } from "./requestSpec.js";

export type ToolNameEncoderId = "openai-chat" | "openai-responses" | "anthropic-messages" | "deepseek-chat";
const SAFE_NAME = /^[A-Za-z0-9_-]{1,64}$/;
const RESERVED_PREFIX = "amc_";

function assertCanonicalName(name: string): void {
  if (typeof name !== "string" || name.length === 0 || name.trim().length === 0 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new RequestEncodingError("Provider tool identity requires a nonempty name without control characters");
  }
  // Buffer's UTF-8 conversion replaces lone surrogates. Refuse that lossy input
  // rather than letting different JavaScript strings acquire the same digest.
  for (let index = 0; index < name.length; index++) {
    const code = name.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = name.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new RequestEncodingError("Provider tool name contains an unpaired surrogate");
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new RequestEncodingError("Provider tool name contains an unpaired surrogate");
    }
  }
}

/** Stable for the exact canonical string, independently of every other offered tool. */
export function providerToolWireName(name: string): string {
  assertCanonicalName(name);
  if (SAFE_NAME.test(name) && !name.startsWith(RESERVED_PREFIX)) return name;
  const slug = name.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 15);
  const digest = createHash("sha256").update(name, "utf8").digest("base64url");
  // 4 + at most 15 + 1 + 43 <= 63. Reserve the prefix even for otherwise-safe
  // names so a canonical name cannot impersonate another name's wire alias.
  return `${RESERVED_PREFIX}${slug}_${digest}`;
}

function addIdentity(bindings: Map<string, string>, name: string): string {
  const wire = providerToolWireName(name);
  const prior = bindings.get(wire);
  if (prior !== undefined && prior !== name) throw new RequestEncodingError("Provider tool wire names collide");
  bindings.set(wire, name);
  return wire;
}

/** Current offered functions only. Runtime decoding must not admit historical-only tools. */
export function bindProviderToolNames(tools: readonly Pick<ToolSchema, "name">[]): ReadonlyMap<string, string> {
  const bindings = new Map<string, string>(), canonical = new Set<string>();
  for (const tool of tools) {
    if (canonical.has(tool.name)) throw new RequestEncodingError("Duplicate canonical tool name in offered schema");
    canonical.add(tool.name);
    addIdentity(bindings, tool.name);
  }
  return bindings;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mappedToolChoice(choice: unknown, encoderId: ToolNameEncoderId, offered: ReadonlySet<string>,
  universe: Map<string, string>): unknown {
  if (encoderId !== "anthropic-messages" && typeof choice === "string" && ["auto", "none", "required"].includes(choice)) return choice;
  if (!record(choice)) throw new RequestEncodingError("Provider tool_choice requires a supported explicit shape");
  const selected = (name: unknown): string => {
    if (typeof name !== "string" || !offered.has(name)) throw new RequestEncodingError("Provider tool_choice must select an offered canonical function");
    return addIdentity(universe, name);
  };
  if ((encoderId === "openai-chat" || encoderId === "deepseek-chat") && choice.type === "function" && record(choice.function)) {
    return { ...choice, function: { ...choice.function, name: selected(choice.function.name) } };
  }
  if (encoderId === "openai-responses" && choice.type === "function") {
    return { ...choice, name: selected(choice.name) };
  }
  if (encoderId === "anthropic-messages") {
    if (choice.type === "tool") return { ...choice, name: selected(choice.name) };
    if (["auto", "any", "none"].includes(String(choice.type)) && !Object.hasOwn(choice, "name")) return { ...choice };
  }
  throw new RequestEncodingError("Provider tool_choice shape is unsupported by this encoder version");
}

/**
 * Pure outbound projection. Signed schemas and historical tool calls remain in
 * canonical identity space; only the provider request receives the stable alias.
 */
export function encodeProviderToolNames(request: EncodableRequest, encoderId: ToolNameEncoderId): EncodableRequest {
  if (!["openai-chat", "openai-responses", "anthropic-messages", "deepseek-chat"].includes(encoderId)) {
    throw new RequestEncodingError("Unknown provider tool-name encoder");
  }
  const bindings = new Map(bindProviderToolNames(request.tools ?? []));
  const offered = new Set(request.tools?.map(tool => tool.name) ?? []);
  const tools = request.tools === null ? null : request.tools.map(tool => ({ ...tool, name: addIdentity(bindings, tool.name) }));
  // The same historical function can appear repeatedly, or no longer be
  // offered. That is replay, not a duplicate declaration or new authority.
  const messages = request.messages.map(message => ({ ...message, parts: message.parts.map(part =>
    part.kind === "tool_use" ? { ...part, toolName: addIdentity(bindings, part.toolName) } : part) }));
  const params = { ...request.params };
  if (Object.hasOwn(params, "tool_choice")) params.tool_choice = mappedToolChoice(params.tool_choice, encoderId, offered, bindings);
  return { ...request, tools, messages, params };
}

/** No optimistic admission of unknown future or historical encoder behavior. */
export function usesProviderToolNames(encoderId: string, version: number): boolean {
  return (encoderId === "openai-chat" && (version === 3 || version === 4))
    || (encoderId === "anthropic-messages" && (version === 3 || version === 4))
    || (encoderId === "openai-responses" && (version === 2 || version === 3))
    || (encoderId === "deepseek-chat" && version === 1)
    || (encoderId === "ollama-chat" && version === 1)
    || (encoderId === "gemini-generate-content" && (version === 1 || version === 2));
}
