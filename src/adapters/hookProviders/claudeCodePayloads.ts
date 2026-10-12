/**
 * The Claude Code hook payloads AMC accepts (P1-23): one strict schema set per qualified release, taken from that
 * release's recorded payloads (tests/fixtures/harness-hooks/claude-code/<version>) and its own tool input types
 * (`sdk-tools.d.ts` in the npm package). A field the release does not send, a value of another type, or a mapped
 * tool's input with a field its schema lacks is refused, so AMC never decides on a reading of the payload that differs
 * from the one Claude Code acts on.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import YAML from "yaml";

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
    preToolUse: z.strictObject({ ...common, hook_event_name: z.literal("PreToolUse"), ...tool }),
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
export type ClaudePreToolUse = z.infer<ReturnType<typeof schemas2_1_296>["preToolUse"]>;

export function claudeHookSchemasFor(version: string | null | undefined): ReturnType<typeof schemas2_1_296> | null {
  return version && Object.hasOwn(CLAUDE_HOOK_SCHEMAS, version) ? CLAUDE_HOOK_SCHEMAS[version]! : null;
}

/** A PreToolUse payload some qualified release's schema accepts, or null. The session's registration names the release that must. */
export function parseQualifiedPreToolUse(input: unknown): ClaudePreToolUse | null {
  for (const schemas of Object.values(CLAUDE_HOOK_SCHEMAS)) {
    const parsed = schemas.preToolUse.safeParse(input);
    if (parsed.success) return parsed.data;
  }
  return null;
}

/** Why a PreToolUse payload does not match release `version`'s schemas (the payload, and a mapped tool's input), or null. */
export function claudeRequestRefusal(version: string, request: unknown): string | null {
  const schemas = claudeHookSchemasFor(version);
  if (!schemas) return `AMC has no payload schema for Claude Code ${version}, so AMC denied the call.`;
  const parsed = schemas.preToolUse.safeParse(request);
  if (!parsed.success) return `The PreToolUse payload does not match Claude Code ${version}'s, so AMC denied the call.`;
  const toolSchema = Object.hasOwn(schemas.toolInputs, parsed.data.tool_name) ? schemas.toolInputs[parsed.data.tool_name] : undefined;
  return toolSchema && !toolSchema.safeParse(parsed.data.tool_input).success
    ? `The ${parsed.data.tool_name} input does not match Claude Code ${version}'s ${parsed.data.tool_name} schema, so AMC denied the call.`
    : null;
}

/** Why a payload's bytes have more than one reading. */
export class ClaudePayloadError extends Error {
  constructor(readonly kind: "ambiguous" | "invalid", message: string) {
    super(message);
    this.name = "ClaudePayloadError";
  }
}

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function assertWellFormed(value: unknown): void {
  if (typeof value === "string") {
    if (LONE_SURROGATE.test(value)) throw new ClaudePayloadError("invalid", "the payload holds a lone surrogate");
  } else if (Array.isArray(value)) {
    value.forEach(assertWellFormed);
  } else if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      assertWellFormed(key);
      assertWellFormed(item);
    }
  }
}

/**
 * Claude Code's hook payload bytes, read the one way they can be read: strict UTF-8 with no byte-order mark, JSON with
 * no repeated key, and no lone surrogate in any string or key. Anything else could be read one way by AMC and another
 * by Claude Code, so it is refused.
 */
export function strictClaudeJson(bytes: Buffer): { text: string; value: unknown } {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw new ClaudePayloadError("invalid", "the payload starts with a byte-order mark");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ClaudePayloadError("invalid", "the payload is not valid UTF-8");
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new ClaudePayloadError("invalid", "the payload is not JSON");
  }
  if (YAML.parseDocument(text, { uniqueKeys: true }).errors.some((error) => /unique|duplicate/i.test(error.message))) {
    throw new ClaudePayloadError("ambiguous", "the payload repeats a JSON key");
  }
  assertWellFormed(value);
  return { text, value };
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const envelopeSchema = z.strictObject({ amc: z.strictObject({ nonce: z.string().min(16).max(128) }), payload: z.string().max(400_000).regex(BASE64) });

/**
 * What AMC's forwarder sends the control route for a PreToolUse: Claude Code's payload bytes exactly as received
 * (base64) and a fresh nonce. AMC hashes and decides on those bytes; the nonce makes each request single-use.
 */
export function claudeEnvelope(payload: Buffer, nonce: string): string {
  return JSON.stringify({ amc: { nonce }, payload: payload.toString("base64") });
}

/** The envelope's payload bytes (strictly read), their SHA-256 and the nonce; the envelope itself must be exact. */
export function openClaudeEnvelope(value: unknown): { payload: unknown; payloadSha256: string; nonce: string } {
  const parsed = envelopeSchema.safeParse(value);
  if (!parsed.success) throw new ClaudePayloadError("invalid", "the control request is not AMC's envelope");
  const bytes = Buffer.from(parsed.data.payload, "base64");
  if (bytes.toString("base64") !== parsed.data.payload) throw new ClaudePayloadError("invalid", "the envelope payload is not canonical base64");
  return { payload: strictClaudeJson(bytes).value, payloadSha256: createHash("sha256").update(bytes).digest("hex"), nonce: parsed.data.amc.nonce };
}
