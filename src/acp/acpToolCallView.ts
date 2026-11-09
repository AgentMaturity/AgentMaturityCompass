import { insideWorkspace } from "../tools/builtin/fsTools.js";

/**
 * How a committed `tool/call` row is shown to an ACP client (SH-UI-04): the standard `kind`, `title` and `locations`
 * fields of a `tool_call` update, derived ONLY from the signed row (its tool name and its frozen arguments).
 *
 * ACP requires absolute paths, so each `path` argument is resolved against the session workspace under the same
 * containment the fs tools apply (`insideWorkspace`); an argument that escapes it, or names a protected directory, is
 * not announced as a location at all.
 *
 * No `rawInput` and no `{type: "diff"}` content: ACP's Diff needs the file's full new text, which the ledger never
 * records (fs results carry a bounded, redacted unified diff as text), and complete arguments can exceed a frame.
 */

export type AcpToolKind = "read" | "edit" | "delete" | "move" | "search" | "execute" | "think" | "fetch" | "other";

const KINDS: Readonly<Record<string, AcpToolKind>> = Object.freeze({
  "fs.read": "read", "fs.edit": "edit", "fs.write": "edit", "fs.list": "read",
  bash: "execute", glob: "search", grep: "search", tool_search: "search",
  web_fetch: "fetch", web_search: "fetch", todo: "think", plan: "think", ask_user: "other", delegate: "other"
});

/** Which argument names an fs path, per tool; only these become `locations`. */
const PATH_ARGUMENTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "fs.read": ["path"], "fs.edit": ["path"], "fs.write": ["path"], "fs.list": ["path"], glob: ["path"], grep: ["path"]
});

const MAX_PATH = 4096;

export function acpToolKind(toolName: string): AcpToolKind {
  return KINDS[toolName] ?? "other";
}

export interface AcpToolCallView {
  readonly title: string;
  readonly kind: AcpToolKind;
  readonly locations?: readonly { readonly path: string }[];
}

/** `args` is the row's committed argument object, or null when the payload is not a JSON object. */
export function acpToolCallView(workspace: string, toolName: string, args: unknown): AcpToolCallView {
  const keys = PATH_ARGUMENTS[toolName];
  const locations: { path: string }[] = [];
  if (keys && args !== null && typeof args === "object" && !Array.isArray(args)) {
    for (const key of keys) {
      const value = (args as Record<string, unknown>)[key];
      if (typeof value !== "string" || value.length === 0 || value.length > MAX_PATH || /[\x00-\x1f\x7f]/.test(value)) continue;
      try { locations.push({ path: insideWorkspace(workspace, value).full }); } catch { /* escapes the workspace: no location */ }
    }
  }
  return { title: toolName, kind: acpToolKind(toolName), ...(locations.length ? { locations } : {}) };
}
