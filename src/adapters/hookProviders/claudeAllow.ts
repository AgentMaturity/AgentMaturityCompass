/**
 * The only way AMC's forwarder answers Claude Code with an allow (P1-23). `claudeAllow` returns the allow answer only for
 * a verified, signed AMC decision bound to this exact call; every other path in the forwarder answers with
 * `claudeDeny` (or the non-blocking answer of an event that cannot block). The decision must be:
 *
 * - the sealed ledger row the Bridge wrote for this exact request: AMC's envelope of these payload bytes and its fresh
 *   nonce (verifyProviderHookControlResult: row integrity, signed receipt, request digest);
 * - an allow of the action AMC derives from this payload's session_id and tool_use_id, bound to the SHA-256 of these
 *   exact payload bytes, under a qualified registration (the row names the registered Claude Code version) with an
 *   authorization record;
 * - answered with the empty native response whose digest the receipt signs (no permission decision, so Claude Code's own
 *   permission settings and prompts still apply; no input rewrite);
 * - for a workspace whose hook audit latch this process does not see set.
 *
 * The Bridge decided allow only for a current registration, an unlatched writer and no intake backpressure; a signed
 * allow row is its statement that those held when it decided.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { deterministicEventId, verifyProviderHookControlResult } from "../../bridge/hookControl.js";
import { hookAuditLatchState } from "../../bridge/hookAuditLatch.js";
import { renderProviderControlResponse, serializeProviderControlResponse } from "../../bridge/hookProviders.js";
import { openLedger } from "../../ledger/ledger.js";
import { claudeActionId } from "./claudeCode.js";

export interface ClaudeAnswer {
  stdout: string;
  stderr: string;
  exitCode: 0 | 1 | 2;
}

const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
// AMC only restricts: its allow is the empty answer, so Claude Code's own permission settings and prompts still apply.
const allowResponseSchema = z.strictObject({});
const allowRowSchema = z.object({ decision: z.literal("allow"), effectiveOutcome: z.literal("allow"), providerMapping: z.literal("native"),
  agentId: z.string(), actionId: z.string(), claudePayloadSha256: z.string(), claudeCodeVersion: z.string().min(1),
  authorizationRecordDigest: z.string().regex(/^[a-f0-9]{64}$/), providerResponseSha256: z.string().regex(/^[a-f0-9]{64}$/) });

const denyResponseSchema = z.strictObject({ hookSpecificOutput: z.strictObject({ hookEventName: z.literal("PreToolUse"),
  permissionDecision: z.literal("deny"), permissionDecisionReason: z.string().max(4_096).optional() }) });
const FAIL_CLOSED = "AMC control is unavailable; the action is denied fail closed.";

/**
 * The one deny answer for a Claude Code PreToolUse, exit 2 (Claude Code blocks the call on exit 2 whatever the JSON
 * says): the Bridge's signed deny response when it is exactly a deny, otherwise AMC's fail-closed deny; `reason` on stderr.
 */
export function claudeDeny(reason: string, signedResponse?: unknown): ClaudeAnswer {
  const signed = denyResponseSchema.safeParse(signedResponse);
  const response = signed.success ? signed.data : renderProviderControlResponse("claude-code", "deny", FAIL_CLOSED);
  return { stdout: `${serializeProviderControlResponse(response)}\n`, stderr: `${reason}\n`, exitCode: 2 };
}

/** The ledger row of a decision, as written (its integrity was verified with it). */
function decisionRow(workspace: string, eventId: string): unknown {
  const ledger = openLedger(workspace);
  try {
    const row = ledger.db.prepare("SELECT meta_json FROM evidence_events WHERE id = ? LIMIT 1").get(eventId) as { meta_json: string } | undefined;
    return row ? JSON.parse(row.meta_json) as unknown : null;
  } finally {
    ledger.close();
  }
}

/**
 * The allow answer for this exact call, or null. `payloadBytes` are Claude Code's payload as received, `envelope` the
 * request AMC's forwarder sent (those bytes and its nonce), `result` the Bridge's answer to it.
 */
export function claudeAllow(input: { workspace: string; agentId: string; payloadBytes: Buffer; sessionId: string; toolUseId: string;
  envelope: string; result: unknown }): { answer: ClaudeAnswer; payloadSha256: string } | null {
  try {
    if (hookAuditLatchState(input.workspace).latched) return null;
    if (!verifyProviderHookControlResult({ workspace: input.workspace, authenticatedAgentId: input.agentId, provider: "claude-code",
      rawInput: input.envelope, result: input.result }).ok) return null;
    const actionId = claudeActionId(input.sessionId, input.toolUseId);
    const payloadSha256 = sha256(input.payloadBytes);
    const row = allowRowSchema.safeParse(decisionRow(input.workspace, deterministicEventId(input.agentId, "claude-code", actionId)));
    const response = allowResponseSchema.safeParse((input.result as { providerResponse?: unknown }).providerResponse);
    if (!row.success || !response.success || row.data.agentId !== input.agentId || row.data.actionId !== actionId
      || row.data.claudePayloadSha256 !== payloadSha256) return null;
    const bytes = serializeProviderControlResponse(response.data);
    if (sha256(bytes) !== row.data.providerResponseSha256) return null;
    return { answer: { stdout: `${bytes}\n`, stderr: "", exitCode: 0 }, payloadSha256 };
  } catch {
    return null;
  }
}
