import type { ToolDefinition } from "../toolhub/toolsSchema.js";
import type { VerifiedToolsConfigSnapshot } from "../toolhub/toolhubValidators.js";

/** Supported implementation identity, supplied by composition rather than policy alone. */
export interface NativeToolCapability {
  readonly name: string;
  readonly actionClass: ToolDefinition["actionClass"];
  readonly context?: ToolDefinition["context"];
}

export const NATIVE_BUILTIN_CAPABILITIES: readonly NativeToolCapability[] = Object.freeze([
  { name: "fs.read", actionClass: "READ_ONLY" },
  { name: "fs.write", actionClass: "WRITE_LOW" },
  { name: "fs.edit", actionClass: "WRITE_LOW" },
  { name: "glob", actionClass: "READ_ONLY" },
  { name: "grep", actionClass: "READ_ONLY" },
  { name: "bash", actionClass: "WRITE_HIGH" },
  // P1-43 (AMC-1549). Listing here is identity, not permission: each is denied
  // until a signed tools policy lists it, and each body still refuses until
  // that policy grants origins (web_*) or the caller composes its dependency
  // (ask_user: an answerer; web_search: a provider).
  { name: "web_fetch", actionClass: "NETWORK_EXTERNAL" },
  { name: "web_search", actionClass: "NETWORK_EXTERNAL" },
  { name: "ask_user", actionClass: "READ_ONLY" },
  { name: "todo", actionClass: "READ_ONLY" },
  { name: "plan", actionClass: "READ_ONLY" }
].map(capability => Object.freeze(capability as NativeToolCapability)));

/** These become executable only when a caller also supplies the delegation capability. */
export const NATIVE_DELEGATION_CAPABILITIES: readonly NativeToolCapability[] = Object.freeze([
  Object.freeze({ name: "delegate", actionClass: "READ_ONLY" as const }),
  Object.freeze({ name: "workflow", actionClass: "READ_ONLY" as const })
]);

function nativeToolMatchesCapability(tool: ToolDefinition, capability: NativeToolCapability): boolean {
  if (tool.name !== capability.name || tool.actionClass !== capability.actionClass) return false;
  const actual = tool.context;
  const expected = capability.context;
  if (expected?.kind !== "mcp") return actual === undefined || actual.kind === "native";
  return actual?.kind === "mcp" && actual.server.id === expected.server.id
    && actual.server.name === expected.server.name && actual.server.version === expected.server.version
    && actual.server.transport === expected.server.transport;
}

/**
 * Readiness and scope presentation share ONE authenticated snapshot. A policy
 * name alone cannot claim an implementation exists. Additional capabilities
 * must come from an explicitly reviewed composition (for example pinned MCP).
 */
export function selectSupportedNativeTools(snapshot: VerifiedToolsConfigSnapshot,
  additionalCapabilities: readonly NativeToolCapability[] = []): readonly ToolDefinition[] {
  if (!snapshot.signatureValid || !snapshot.config) return [];
  const tools = snapshot.config.tools.allowedTools;
  const names = tools.map(tool => tool.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) return [];
  const supported = new Map(NATIVE_BUILTIN_CAPABILITIES.map(capability => [capability.name, capability]));
  for (const capability of additionalCapabilities) {
    // A caller cannot redefine the identity of a built-in implementation.
    if (!supported.has(capability.name)) supported.set(capability.name, capability);
  }
  return tools.filter(tool => {
    const capability = supported.get(tool.name);
    return capability !== undefined && nativeToolMatchesCapability(tool, capability);
  });
}
