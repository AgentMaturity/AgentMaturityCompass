/**
 * Whole-session observation (Watch): what Claude Code and Codex report at their session hooks (session start and end,
 * prompts, turn ends and failures, sub-agents, compaction, permission prompts, interrupts), recorded as the provider's
 * own word. Event names and fields: https://code.claude.com/docs/en/hooks and https://learn.chatgpt.com/docs/hooks
 * (both read 2026-11-16).
 *
 * Lenient on purpose: these hooks only watch. A payload that is not JSON, names no event, or names one AMC does not know
 * is still recorded, as "unreadable" or "unknown" with its digest, and the hook still answers so the agent goes on.
 * Nothing here decides anything: control mode keeps its strict schemas (claudeCodePayloads.ts).
 * Privacy and trust: prompt text, messages, tool input and ids AMC does not need are stored as SHA-256 and length;
 * short names (event, source, trigger, model, tool name) are kept only when they are plain tokens of at most 40
 * characters. The agent is always the lease's own; rows are SELF_REPORTED and set no trust tier, label or decision.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { codexSessionSha256 } from "../adapters/codex/codexIdentity.js";
import { CLAUDE_OBSERVE_SESSION_HOOKS, claudeSessionSha256 } from "../adapters/hookProviders/claudeCode.js";
import { openLedger } from "../ledger/ledger.js";
import { isLoopback, readCapped } from "../standards/acs/acsGuardianHttp.js";
import { writeControlJson } from "../utils/controlHttpResponses.js";
import { sha256Hex } from "../utils/hash.js";
import { verifyBridgeLease } from "./bridgeAuth.js";
import { appendVerified, observationId } from "./claudeCodeObservations.js";
import { consumeObservedHookRateLimit } from "./hookIngress.js";

export type SessionProvider = "claude-code" | "codex";
const MAX_SESSION_EVENT_BYTES = 262_144;
/** The session events each provider documents (tool events are recorded by their own routes). */
export const SESSION_EVENTS: Readonly<Record<SessionProvider, readonly string[]>> = {
  "claude-code": CLAUDE_OBSERVE_SESSION_HOOKS,
  codex: ["SessionStart", "SessionEnd", "UserPromptSubmit", "Stop", "SubagentStart", "SubagentStop", "PreCompact", "PostCompact", "Interrupt"],
};

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,39}$/;
const KEPT = ["source", "reason", "trigger", "model", "permission_mode", "tool_name", "agent_type", "error_type"] as const;
const DIGESTED = ["prompt", "last_assistant_message", "agent_id", "tool_input", "error", "custom_instructions", "message", "transcript_path",
  "agent_transcript_path", "cwd"] as const;
const IDS = ["prompt_id", "turn_id"] as const;
const COMMON = new Set<string>(["hook_event_name", "session_id", "stop_hook_active", "is_interrupt", "effort", "scratchpad_dir", ...KEPT, ...DIGESTED, ...IDS]);

type Json = Record<string, unknown>;
const digest = (value: unknown) => {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  return { sha256: sha256Hex(Buffer.from(text, "utf8")), length: Buffer.byteLength(text, "utf8") };
};

/** What AMC keeps of one session hook payload: never its text, and never anything that can fail. */
export function readSessionEvent(provider: SessionProvider, rawInput: string): Json {
  let parsed: unknown = null;
  try { parsed = JSON.parse(rawInput); } catch { /* recorded as unreadable */ }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return { event: "unreadable", payload: digest(rawInput) };
  const input = parsed as Json;
  const named = typeof input.hook_event_name === "string" ? input.hook_event_name : null;
  const event = named !== null && SESSION_EVENTS[provider].includes(named) ? named : named === null ? "unreadable" : "unknown";
  const sessionId = typeof input.session_id === "string" && input.session_id.length > 0 && input.session_id.length <= 256 ? input.session_id : null;
  const reported: Json = {};
  for (const key of KEPT) if (input[key] !== undefined) reported[key] = typeof input[key] === "string" && TOKEN.test(input[key] as string) ? input[key] : digest(input[key]);
  for (const key of IDS) if (input[key] !== undefined) reported[key] = typeof input[key] === "string" && TOKEN.test(input[key] as string) ? input[key] : digest(input[key]);
  for (const key of DIGESTED) if (input[key] !== undefined) reported[key] = digest(input[key]);
  for (const key of ["stop_hook_active", "is_interrupt"] as const) if (typeof input[key] === "boolean") reported[key] = input[key];
  const unknownFields = Object.keys(input).filter((key) => !COMMON.has(key)).length;
  return { event, ...(event === "unknown" ? { eventName: digest(named) } : {}),
    sessionSha256: sessionId === null ? null : provider === "codex" ? codexSessionSha256(sessionId) : claudeSessionSha256(sessionId),
    reported, ...(unknownFields > 0 ? { unknownFields } : {}) };
}

/** Record one session hook report as the provider's own word, under the lease's agent. Signed and verified as written. */
export function recordSessionEvent(input: { workspace: string; agentId: string; provider: SessionProvider; rawInput: string; leaseId: string | null; now?: number }):
  { eventId: string; event: string } {
  const now = input.now ?? Date.now();
  const read = readSessionEvent(input.provider, input.rawInput);
  const body = { kind: "amc.hook-session-event/v1", provider: input.provider, agentId: input.agentId, claim: "self-reported", ...read };
  const ledger = openLedger(input.workspace);
  try {
    const { eventId } = appendVerified(ledger, { id: observationId(input.provider === "codex" ? "cxsess" : "ccsess", [input.agentId, undefined], now), now, body,
      meta: { auditType: "HOOK_SESSION_EVENT", sessionEventSchemaVersion: 1, trustTier: "SELF_REPORTED", contentTier: "SELF_REPORTED", ...body, leaseId: input.leaseId },
      receipt: { kind: "work_accepted", providerId: `hook-session:${input.provider}` } });
    return { eventId, event: String(read.event) };
  } finally {
    ledger.close();
  }
}

const SESSION_HOOK_ROUTE = "/hooks/session/v1";
export const SESSION_HOOK_PATH = `/bridge${SESSION_HOOK_ROUTE}`;
const refuse = (res: ServerResponse, status: number, error: string): true => {
  writeControlJson(res, status, { ok: false, error });
  return true;
};

/** The Bridge route Claude Code's observe forwarder posts session hooks to: loopback, observe lease, rate-limited. */
export async function handleSessionHookHttp(options: { workspace: string; req: IncomingMessage; res: ServerResponse; url: URL }): Promise<true> {
  const { req, res, workspace } = options;
  if ((req.method ?? "POST").toUpperCase() !== "POST") return refuse(res, 405, "method not allowed");
  if (!isLoopback(req.socket.remoteAddress)) return refuse(res, 403, "the session observation route accepts loopback requests only");
  const auth = verifyBridgeLease({ workspace, requestUrl: options.url, headers: req.headers, routePath: SESSION_HOOK_ROUTE, requiredScope: "hook:observe" });
  if (!auth.ok || !auth.payload) return refuse(res, 401, "unauthorized");
  const provider = req.headers["x-amc-hook-provider"] === "codex" ? "codex" : "claude-code";
  try {
    const limit = consumeObservedHookRateLimit({ workspace, leaseId: auth.payload.leaseId, authenticatedAgentId: auth.payload.agentId,
      maxRequestsPerMinute: auth.payload.maxRequestsPerMinute, routePath: SESSION_HOOK_ROUTE });
    if (!limit.allowed) {
      res.setHeader("retry-after", String(limit.retryAfterSeconds));
      return refuse(res, 429, "hook lease rate limit exceeded");
    }
    const rawInput = await readCapped(req, MAX_SESSION_EVENT_BYTES);
    if (rawInput === null) return refuse(res, 413, "session hook payload exceeds 256 KiB");
    const recorded = recordSessionEvent({ workspace, agentId: auth.payload.agentId, provider, rawInput, leaseId: auth.payload.leaseId });
    writeControlJson(res, 201, { ok: true, observed: true, claim: "self-reported", ...recorded });
  } catch (error) {
    process.stderr.write(`[amc] session observation route: ${error instanceof Error ? error.message.replace(/[^\x20-\x7e]/g, "?").slice(0, 300) : "error"}\n`);
    return refuse(res, 503, "the session hook could not be recorded");
  }
  return true;
}
