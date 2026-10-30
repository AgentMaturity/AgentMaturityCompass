/**
 * Codex observe mode (P2-17): what Codex 0.165.0 reports at its PostToolUse hook, recorded as an observation. Codex's
 * PreToolUse fails open (docs/source-reviews/P2-17-codex-hooks.md), so AMC installs no Codex control hook and claims
 * nothing but "observed": the call already ran, and AMC cannot tell whether Codex ran a call it never reported.
 *
 * The payload must match Codex's own `post-tool-use.command.input` schema at the pin (no other field). AMC stores the
 * tool name and the SHA-256 of the session id, tool input and tool response, never their contents. Observations are
 * capped per lease and workspace like the other providers' (claudeCodeObservations.ts admitObservation); the same
 * report sent again is recorded already, and a different one for the same call is kept and flagged.
 */
import { z } from "zod";
import { codexActionId, codexSessionSha256 } from "../adapters/codex/codexIdentity.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { admitObservation, observationId, parse, recordHookAudit, type HookObservationResult } from "./claudeCodeObservations.js";
import type { HookLease } from "./hookAuthorization.js";

/** Codex 0.165.0 `post-tool-use.command.input.schema.json` (additionalProperties: false). */
const codexPostToolUseSchema = z.strictObject({
  hook_event_name: z.literal("PostToolUse"),
  session_id: z.string().min(1).max(256),
  turn_id: z.string().min(1).max(256),
  transcript_path: z.string().max(4_096).nullable(),
  cwd: z.string().min(1).max(4_096),
  model: z.string().min(1).max(256),
  permission_mode: z.enum(["default", "acceptEdits", "plan", "dontAsk", "bypassPermissions"]),
  tool_name: z.string().min(1).max(512),
  tool_use_id: z.string().min(1).max(256),
  tool_input: z.unknown(),
  tool_response: z.unknown(),
  agent_id: z.string().min(1).max(256).optional(),
  agent_type: z.string().min(1).max(256).optional(),
});

const digest = (value: unknown) => sha256Hex(Buffer.from(canonicalize(value ?? null), "utf8"));

/** Record one Codex PostToolUse report. Observed only. */
export function recordCodexPostToolUse(input: { workspace: string; authenticatedAgentId: string; rawInput: string; lease?: HookLease; now?: number }):
  HookObservationResult {
  const parsed = parse(codexPostToolUseSchema, input.rawInput, "Codex PostToolUse");
  const now = input.now ?? Date.now();
  admitObservation({ workspace: input.workspace, agentId: input.authenticatedAgentId, sessionId: parsed.session_id, leaseId: input.lease?.leaseId,
    now, provider: "codex", toolUseId: parsed.tool_use_id });
  const sessionSha256 = codexSessionSha256(parsed.session_id);
  const actionId = codexActionId(parsed.session_id, parsed.tool_use_id);
  const record = {
    kind: "amc.codex-post-tool-use/v1", agentId: input.authenticatedAgentId, claim: "observed", sessionSha256, actionId,
    toolName: parsed.tool_name, toolUseId: parsed.tool_use_id, toolInputSha256: digest(parsed.tool_input), toolResponseSha256: digest(parsed.tool_response),
    model: parsed.model, permissionMode: parsed.permission_mode, subagent: parsed.agent_type ?? null, leaseId: input.lease?.leaseId ?? null,
  };
  return recordHookAudit({ workspace: input.workspace, now, sessionSha256, provider: "codex", body: record, meta: { codexObservationSchemaVersion: 1, ...record },
    id: observationId("cxpost", [input.authenticatedAgentId, actionId], now), idempotent: true,
    receipt: { kind: "tool_result", providerId: "hook-observe:codex" }, underRegistration: false });
}
