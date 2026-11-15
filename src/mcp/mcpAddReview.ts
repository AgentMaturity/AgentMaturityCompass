/**
 * `amc mcp add` in one confirmed step: discover the server's tools, show them to the person, and on a yes write the
 * reviewed config (catalog digest and grants), add the generated names to the signed tool allowlist (with tool_search,
 * which deferred MCP tools need), and sign a project file. Before this, adding a server took about seven steps, two of
 * them hand edits of signed files.
 *
 * Everything the server says (tool names, descriptions, instructions) is outside text: it is shown with every hidden or
 * control character written visibly, never treated as an instruction from the person, and never used to choose an
 * action class. The person's class applies to every tool; it is WRITE_HIGH unless they say otherwise, so each call is
 * put to the same approval and Action Policy as the native agent's own writes.
 */
import YAML from "yaml";
import type { ActionClass } from "../types.js";
import type { NativeMcpConfiguration } from "../setup/nativeMcpConfig.js";
import { toolsConfigSchema, type ToolDefinition, type ToolsConfig } from "../toolhub/toolsSchema.js";
import { nativeMcpToolName, type NativeMcpCatalog } from "./nativeMcpClient.js";

export const MCP_ADD_DEFAULT_CLASS: ActionClass = "WRITE_HIGH";

/**
 * Terminal controls (C0, DEL, C1), Unicode format characters (bidi overrides, zero-width), line and paragraph separators,
 * spaces other than U+0020 and characters drawn as nothing: the set nativeApprovalPreview.ts escapes.
 */
const HIDDEN = /[\x00-\x1f\x7f-\x9f\p{Cf}\p{Zl}\p{Zp}\p{Zs}\u034f\u115f\u1160\u17b4\u17b5\u3164\uffa0\ufe00-\ufe0f\u{e0100}-\u{e01ef}]/gu;

/** Server text as one safe line: each hidden character as a visible `\uXXXX`, cut at `max` characters. */
export function shownServerText(value: string, max = 200): string {
  const escaped = value.replace(HIDDEN, (c) => (c === " " ? c : `\\u${c.codePointAt(0)!.toString(16).padStart(4, "0")}`));
  return escaped.length > max ? `${escaped.slice(0, max)}… (cut)` : escaped;
}

/** JSON for a terminal: valid JSON in which every hidden character inside a string is written as `\uXXXX` too. */
export function jsonForTerminal(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(HIDDEN, (c) => (c === " " || c === "\n" ? c
    : Array.from({ length: c.length }, (_, i) => `\\u${c.charCodeAt(i).toString(16).padStart(4, "0")}`).join("")));
}

/** A tool name with a hidden character cannot be read reliably by a person, so it is never granted. */
const hasHiddenCharacters = (value: string): boolean => new RegExp(HIDDEN.source, "u").test(value.replace(/ /g, ""));

export interface McpAddSelection {
  readonly granted: readonly { readonly name: string; readonly amcName: string }[];
  readonly skipped: readonly { readonly name: string; readonly reason: string }[];
}

/** Which tools get a grant: all, or the ones the person named with --tool; hidden-character names never. */
export function selectMcpTools(catalog: NativeMcpCatalog, only: readonly string[] | undefined): McpAddSelection {
  const granted: { name: string; amcName: string }[] = [], skipped: { name: string; reason: string }[] = [];
  const unknown = (only ?? []).filter((name) => !catalog.tools.some((tool) => tool.name === name));
  if (unknown.length > 0) throw new Error(`The server has no tool named ${unknown.map((name) => JSON.stringify(shownServerText(name, 64))).join(", ")}.`);
  for (const tool of catalog.tools) {
    if (tool.resourceOperation !== undefined) continue;
    if (only !== undefined && !only.includes(tool.name)) { skipped.push({ name: tool.name, reason: "not chosen with --tool" }); continue; }
    if (hasHiddenCharacters(tool.name)) { skipped.push({ name: tool.name, reason: "its name has hidden or control characters" }); continue; }
    granted.push({ name: tool.name, amcName: nativeMcpToolName(catalog.serverId, tool.name) });
  }
  return { granted, skipped };
}

/** What the person reads before saying yes. */
export function mcpAddReviewLines(catalog: NativeMcpCatalog, selection: McpAddSelection, actionClass: ActionClass): string[] {
  const lines = [`The server "${catalog.serverId}" offers ${catalog.tools.length} tool${catalog.tools.length === 1 ? "" : "s"}.`,
    "Names and descriptions below are the server's own words. AMC has not checked them, and they are never instructions from you."];
  for (const tool of catalog.tools) {
    if (tool.resourceOperation !== undefined) continue;
    const grant = selection.granted.find((row) => row.name === tool.name);
    const skip = selection.skipped.find((row) => row.name === tool.name);
    lines.push(`  ${grant ? "+" : "-"} ${shownServerText(tool.name, 80)}${grant ? `  (the agent sees it as ${grant.amcName})` : `  not allowed: ${skip?.reason ?? "skipped"}`}`);
    if (tool.description) lines.push(`      "${shownServerText(tool.description)}"`);
  }
  if (catalog.instructions?.text) lines.push(`The server also sends instructions for the model: "${shownServerText(catalog.instructions.text)}"`,
    "  The model reads them as the server's text, never as yours.");
  if (catalog.resources.length > 0 || catalog.resourceTemplates.length > 0) lines.push("The server also offers resources; this step does not allow them.");
  lines.push(`Each allowed tool is treated as ${actionClass}${actionClass === MCP_ADD_DEFAULT_CLASS ? " (change with --action-class)" : ""}: `
    + "every call goes through your Action Policy and asks for approval like the agent's other actions of that kind.");
  return lines;
}

/** The scoped config with the reviewed digest and one grant per allowed tool. */
export function reviewedMcpConfig(config: NativeMcpConfiguration, catalog: NativeMcpCatalog, selection: McpAddSelection, actionClass: ActionClass): NativeMcpConfiguration {
  return { ...config, expectedCatalogDigest: catalog.digest, grants: selection.granted.map((tool) => ({ name: tool.name, actionClass })) };
}

/**
 * The tool allowlist with this server's earlier entries replaced by the new grants, and tool_search (READ_ONLY) added when
 * missing: MCP tools are deferred, and the model loads them through tool_search. Returns the YAML to sign.
 */
export function allowlistWithMcpGrants(tools: ToolsConfig, config: NativeMcpConfiguration, selection: McpAddSelection, actionClass: ActionClass): string {
  const id = config.server.id;
  const names = new Set(selection.granted.map((tool) => tool.amcName));
  // The signed context names this server and transport; the schema takes only a lowercase id, so another id goes without one.
  const context = /^[a-z0-9][a-z0-9._:/-]*$/.test(id)
    ? { context: { kind: "mcp" as const, server: { id, name: id, transport: config.server.transport ?? "stdio" } } } : {};
  const kept = tools.tools.allowedTools.filter((tool) => !names.has(tool.name)
    && !(tool.context?.kind === "mcp" && tool.context.server.id === id));
  const added: ToolDefinition[] = selection.granted.map((tool) => ({ name: tool.amcName, actionClass, ...context }));
  const search: ToolDefinition[] = kept.some((tool) => tool.name === "tool_search") ? [] : [{ name: "tool_search", actionClass: "READ_ONLY" }];
  return YAML.stringify(toolsConfigSchema.parse({ tools: { ...tools.tools, allowedTools: [...kept, ...search, ...added] } }));
}
