/**
 * The Claude Code hook payloads AMC accepts (P1-23): one strict schema set per qualified release, taken from that
 * release's recorded payloads (tests/fixtures/harness-hooks/claude-code/<version>) and its own tool input types
 * (`sdk-tools.d.ts` in the npm package). A field the release does not send, a value of another type, or a mapped
 * tool's input with a field its schema lacks is refused, so AMC never decides on a reading of the payload that differs
 * from the one Claude Code acts on.
 */
import { z } from "zod";

const id = z.string().min(1).max(256);
const path = z.string().min(1).max(4096);
const PERMISSION_MODES = ["default", "plan", "acceptEdits", "auto", "dontAsk", "bypassPermissions"] as const;

/** Claude Code 2.1.296: the hooks reference (sha256:31754d5a…) and the payloads recorded from the binary. */
function schemas2_1_296() {
  const common = {
    session_id: id, transcript_path: path.optional(), cwd: path, prompt_id: id.optional(), permission_mode: z.enum(PERMISSION_MODES).optional(),
    scratchpad_dir: path.optional(), effort: z.strictObject({ level: z.enum(["low", "medium", "high", "xhigh", "max"]) }).optional(), agent_id: id.optional(),
    agent_type: z.string().max(256).optional(),
  };
  const tool = { tool_name: z.string().min(1).max(512), tool_input: z.record(z.string(), z.unknown()), tool_use_id: z.string().min(1).max(160),
    mcp_server: z.strictObject({ name: z.string().max(512), source: z.string().max(64) }).optional() };
  const count = z.number().int().nonnegative();
  return {
    payload: z.discriminatedUnion("hook_event_name", [
      z.strictObject({ ...common, hook_event_name: z.literal("PreToolUse"), ...tool }),
      z.strictObject({ ...common, hook_event_name: z.literal("PostToolUse"), ...tool, tool_response: z.unknown(), duration_ms: count.optional() }),
      z.strictObject({ ...common, hook_event_name: z.literal("PostToolUseFailure"), ...tool, error: z.string(), is_interrupt: z.boolean().optional(),
        duration_ms: count.optional() }),
      z.strictObject({ ...common, hook_event_name: z.literal("SessionStart"), source: z.enum(["startup", "resume", "clear", "compact", "fork"]),
        model: z.string().max(256).optional(), session_title: z.string().max(1024).optional(), seconds_since_last_response: z.number().optional(),
        context_tokens: count.optional(), prompt_cache_likely_expired: z.boolean().optional(), estimated_cache_write_usd: z.number().optional() }),
      z.strictObject({ ...common, hook_event_name: z.literal("UserPromptSubmit"), prompt: z.string(), session_title: z.string().max(1024).optional() }),
      z.strictObject({ ...common, hook_event_name: z.literal("Stop"), stop_hook_active: z.boolean(), last_assistant_message: z.string().optional(),
        background_tasks: z.array(z.unknown()).optional(), session_crons: z.array(z.unknown()).optional() }),
    ]),
    /** What AMC's forwarder sends to the control route for PreToolUse: Claude Code's payload plus a fresh nonce. */
    controlRequest: z.strictObject({ ...common, hook_event_name: z.literal("PreToolUse"), ...tool, amc: z.strictObject({ nonce: z.string().min(16).max(128) }) }),
    /** The inputs of the tools AMC maps (`BashInput`, `FileReadInput`, … in the release's sdk-tools.d.ts). */
    toolInputs: {
      Bash: z.strictObject({ command: z.string(), description: z.string().optional(), timeout: count.optional(), run_in_background: z.boolean().optional(),
        dangerouslyDisableSandbox: z.boolean().optional() }),
      Read: z.strictObject({ file_path: z.string(), offset: count.optional(), limit: count.optional(), pages: z.string().optional(), allow_large: z.boolean().optional() }),
      Write: z.strictObject({ file_path: z.string(), content: z.string() }),
      Edit: z.strictObject({ file_path: z.string(), old_string: z.string(), new_string: z.string(), replace_all: z.boolean().optional() }),
      Glob: z.strictObject({ pattern: z.string(), path: z.string().optional() }),
      Grep: z.strictObject({ pattern: z.string(), path: z.string().optional(), glob: z.string().optional(),
        output_mode: z.enum(["content", "files_with_matches", "count"]).optional(), "-B": count.optional(), "-A": count.optional(), "-C": count.optional(),
        context: count.optional(), "-n": z.boolean().optional(), "-i": z.boolean().optional(), "-o": z.boolean().optional(), type: z.string().optional(),
        head_limit: count.optional(), offset: count.optional(), multiline: z.boolean().optional() }),
      WebFetch: z.strictObject({ url: z.string(), prompt: z.string(), offset: count.optional() }),
    } as Readonly<Record<string, z.ZodType>>,
  };
}

/** The schemas of each qualified release; a release qualifies only with a passing conformance receipt. */
export const CLAUDE_HOOK_SCHEMAS: Readonly<Record<string, ReturnType<typeof schemas2_1_296>>> = { "2.1.296": schemas2_1_296() };
export type ClaudeHookPayload = z.infer<ReturnType<typeof schemas2_1_296>["payload"]>;
export type ClaudeControlRequest = z.infer<ReturnType<typeof schemas2_1_296>["controlRequest"]>;

export function claudeHookSchemasFor(version: string | null | undefined): ReturnType<typeof schemas2_1_296> | null {
  return version && Object.hasOwn(CLAUDE_HOOK_SCHEMAS, version) ? CLAUDE_HOOK_SCHEMAS[version]! : null;
}

/** A control request some qualified release's schema accepts, or null. The session's registration names the release that must. */
export function parseQualifiedControlRequest(input: unknown): ClaudeControlRequest | null {
  for (const schemas of Object.values(CLAUDE_HOOK_SCHEMAS)) {
    const parsed = schemas.controlRequest.safeParse(input);
    if (parsed.success) return parsed.data;
  }
  return null;
}

/** Why a control request does not match release `version`'s schemas (the request, and a mapped tool's input), or null. */
export function claudeRequestRefusal(version: string, request: unknown): string | null {
  const schemas = claudeHookSchemasFor(version);
  if (!schemas) return `AMC has no payload schema for Claude Code ${version}, so AMC denied the call.`;
  const parsed = schemas.controlRequest.safeParse(request);
  if (!parsed.success) return `The PreToolUse payload does not match Claude Code ${version}'s, so AMC denied the call.`;
  const toolSchema = Object.hasOwn(schemas.toolInputs, parsed.data.tool_name) ? schemas.toolInputs[parsed.data.tool_name] : undefined;
  return toolSchema && !toolSchema.safeParse(parsed.data.tool_input).success
    ? `The ${parsed.data.tool_name} input does not match Claude Code ${version}'s ${parsed.data.tool_name} schema, so AMC denied the call.`
    : null;
}
