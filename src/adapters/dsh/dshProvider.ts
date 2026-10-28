/**
 * DeepSeek Harness (DSH) as a provider of AMC's hook control path (P2-17 part C).
 *
 * AMC's DSH plugin (packages/dsh-amc-plugin) sends each call from DSH's `tools/pre-execute` waterfall to the Bridge
 * control route with provider `dsh`. This module holds only what is DSH-specific there: the call AMC derives from DSH's
 * session and call ids, the canonical ToolHub request, and the response row AMC signs. Pinned contract:
 * docs/source-reviews/P2-17-dsh-plugin.md (DSH 0.2.1-rc.2). No DSH version is qualified yet (dshVersions.ts), so
 * control denies every DSH call until one is.
 */
import { z } from "zod";
import type { ActionClass } from "../../types.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import { canonicalUrl, claudeFileLocation } from "../hookProviders/claudeCode.js";
import type { CanonicalToolRequest, HookCall, HookControlDecision } from "../../bridge/hookProviders.js";

/** The hook control event a DSH tool call arrives as: DSH's waterfall name. */
export const DSH_TOOL_CALL_EVENT = "tools/pre-execute";

/**
 * What AMC's DSH plugin adds to each call: DSH's version, its session id and call ids (AMC derives the action id from
 * them), whether the call is a sub-dispatch, and a fresh nonce, so one decision answers one request. None of it is
 * authority: identity comes from the lease, and the session must be registered.
 */
const dshControlContextSchema = z.strictObject({
  version: z.string().min(1).max(64),
  sessionId: z.string().min(1).max(512),
  callId: z.string().min(1).max(512),
  rootCallId: z.string().min(1).max(512),
  nested: z.boolean(),
  nonce: z.string().min(16).max(128),
});
export type DshControlContext = z.infer<typeof dshControlContextSchema>;

/** AMC's action id for one DSH tool call, from the session and call id (call ids repeat across sessions). */
export function dshActionId(sessionId: string, callId: string): string {
  return `dsh_${sha256Hex(canonicalize({ sessionId, callId })).slice(0, 40)}`;
}

/** The call a DSH control request names, or null when it carries no valid DSH context (hookProviders.ts refuses it). */
export function dshHookCall(input: Record<string, unknown>): HookCall | null {
  const parsed = dshControlContextSchema.safeParse(input.dsh);
  if (!parsed.success) return null;
  const dsh = parsed.data;
  // DSH resolves relative paths against a per-session working directory AMC cannot see, so AMC maps absolute paths only.
  return { provider: "dsh", actionId: dshActionId(dsh.sessionId, dsh.callId), sessionId: dsh.sessionId, callId: dsh.callId,
    parentActionId: dsh.nested ? dshActionId(dsh.sessionId, dsh.rootCallId) : null, cwd: "", pi: null, acs: null, dsh, request: null, payloadSha256: null };
}

type ArgumentType = "string" | "number" | "boolean";

/**
 * Every DSH built-in AMC maps, with DSH 0.2.1-rc.2's exact parameters (dsh-tool-fs read/write/edit, dsh-tool-web
 * web_fetch) and their types, the one argument the ToolHub validator reads, and the lowest action class the signed
 * config may give the tool. A call with any other argument (write's sandbox-escalation fields included) or a wrong type
 * is not mapped: a key the validator does not read could carry the real effect. Shell, search, PTC (`run_code`),
 * subagent and MCP tools are not mapped, so they are denied.
 */
const DSH_TOOLS: Readonly<Record<string, { tool: "fs.read" | "fs.write" | "http.fetch"; key: "file_path" | "url";
  args: Readonly<Record<string, { type: ArgumentType; required: boolean }>>; minimumActionClass: ActionClass }>> = {
  read: { tool: "fs.read", key: "file_path", minimumActionClass: "READ_ONLY",
    args: { file_path: { type: "string", required: true }, offset: { type: "number", required: false }, limit: { type: "number", required: false } } },
  write: { tool: "fs.write", key: "file_path", minimumActionClass: "WRITE_LOW",
    args: { file_path: { type: "string", required: true }, content: { type: "string", required: true } } },
  edit: { tool: "fs.write", key: "file_path", minimumActionClass: "WRITE_LOW",
    args: { file_path: { type: "string", required: true }, old_string: { type: "string", required: true }, new_string: { type: "string", required: true },
      replace_all: { type: "boolean", required: false } } },
  web_fetch: { tool: "http.fetch", key: "url", minimumActionClass: "NETWORK_EXTERNAL", args: { url: { type: "string", required: true } } },
};

/** Whether `input` has exactly the tool's arguments: no other key, every required one, each of its declared type. */
function matchesSchema(input: Record<string, unknown>, args: Readonly<Record<string, { type: ArgumentType; required: boolean }>>): boolean {
  if (Object.keys(input).some((key) => !Object.hasOwn(args, key))) return false;
  return Object.entries(args).every(([key, spec]) => (Object.hasOwn(input, key) ? typeof input[key] === spec.type : !spec.required));
}

/**
 * The canonical ToolHub request for a DSH tool call, or null when AMC does not map it: a tool outside DSH_TOOLS, an
 * argument outside its schema, a path that is not absolute in its one canonical spelling (resolved through symlinks
 * to where it opens), or a URL that is not one canonical http(s) spelling. `web_fetch` is a GET.
 */
export function dshToolRequest(toolName: string, toolInput: Record<string, unknown>, workspace: string, call: { readonly dsh?: DshControlContext | null } | null):
  Omit<CanonicalToolRequest, "segment"> | null {
  if (!call?.dsh || !Object.hasOwn(DSH_TOOLS, toolName)) return null;
  const tool = DSH_TOOLS[toolName]!;
  if (!matchesSchema(toolInput, tool.args)) return null;
  const value = toolInput[tool.key];
  if (tool.key === "url") {
    return canonicalUrl(value) ? { name: tool.tool, args: { url: value, method: "GET" }, argumentsReviewable: true, minimumActionClass: tool.minimumActionClass } : null;
  }
  const location = claudeFileLocation(value, workspace);
  return location ? { name: tool.tool, args: { path: location }, argumentsReviewable: true, minimumActionClass: tool.minimumActionClass } : null;
}

/** The response row AMC signs for a DSH decision; `requestSha256` binds the exact request decided. */
const requestSha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const dshControlResponseSchema = z.union([
  z.strictObject({ decision: z.literal("allow"), requestSha256: requestSha256Schema }),
  z.strictObject({ decision: z.literal("deny"), reason: z.string().min(1).max(1_024), requestSha256: requestSha256Schema }),
]);

export function renderDshControlResponse(decision: HookControlDecision, reason: string, requestSha256: string | undefined): Record<string, unknown> {
  if (!requestSha256) throw new Error("a DSH control response must bind the request it decided");
  return decision === "allow" ? { decision: "allow", requestSha256 } : { decision: "deny", reason, requestSha256 };
}

/** Why AMC denied an outcome a DSH call cannot carry (capability-lossy). */
export function dshLossyNote(outcome: "ask" | "steer"): string {
  return outcome === "ask"
    ? "DSH's approval request carries no tool arguments and is not AMC approval, so AMC denied the action."
    : "AMC does not rewrite DSH tool input, so AMC denied the action.";
}
