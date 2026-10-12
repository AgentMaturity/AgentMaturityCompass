/**
 * What AMC records from Claude Code's session hooks (P1-23), all observed, none enforced: the end of each turn (Stop;
 * AMC never forces Claude Code to continue) and, after each tool call, whether the input that ran is the input AMC
 * authorized (PostToolUse, PostToolUseFailure). A mismatch is recorded as `authorizationMismatch: true`: observed, not
 * prevented, because the tool already ran. Raw tool input reaches AMC over loopback only and is never stored.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { normalizeArguments } from "../actions/normalizeArguments.js";
import { claudeActionId, claudeSessionSha256 } from "../adapters/hookProviders/claudeCode.js";
import { hashBinaryOrPath, openLedger, verifyEvidenceEventIntegrity } from "../ledger/ledger.js";
import type { ReceiptKind } from "../receipts/receipt.js";
import { findToolDefinition, loadVerifiedToolsConfigSnapshot } from "../toolhub/toolhubValidators.js";
import { ACTION_CLASSES } from "../governor/actionCatalog.js";
import type { ActionClass } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { deterministicEventId as decisionEventId } from "./hookControl.js";
import { HookControlError } from "./hookProviders.js";

const MAX_BODY_BYTES = 262_144;

export interface HookObservationResult {
  recorded: true;
  idempotentReplay: boolean;
  provider: "claude-code";
  eventId: string;
  receiptId: string;
}

/** One signed audit row in its own sealed ledger session; `id` is unique per observation. */
export function recordHookAudit(input: { workspace: string; id: string; now: number; meta: Record<string, unknown>; body: unknown;
  receipt: { kind: ReceiptKind; providerId: string } }): HookObservationResult {
  const agentId = String(input.meta.agentId);
  const bodySha256 = sha256Hex(Buffer.from(canonicalize(input.body), "utf8"));
  const ledger = openLedger(input.workspace);
  try {
    const existing = ledger.db.prepare("SELECT meta_json FROM evidence_events WHERE id = ? LIMIT 1").get(input.id) as { meta_json: string } | undefined;
    if (existing) {
      return { recorded: true, idempotentReplay: true, provider: "claude-code", eventId: input.id, receiptId: String(JSON.parse(existing.meta_json).receipt_id) };
    }
    const sessionId = `${input.id.split("_")[0]}-session-${sha256Hex(input.id).slice(0, 36)}`;
    ledger.startSession({ sessionId, runtime: "claude", binaryPath: "amc-bridge-claude-hooks", binarySha256: hashBinaryOrPath("amc-bridge-claude-hooks", "1") });
    const appended = ledger.appendEvidenceWithReceipt({
      id: input.id, ts: input.now, sessionId, runtime: "claude", eventType: "audit", payload: `${JSON.stringify(input.body, null, 2)}\n`,
      payloadExt: "json", inline: false, meta: { trustTier: "OBSERVED", provider: "claude-code", rawPayloadStored: false, ...input.meta, bodySha256 },
      receipt: { kind: input.receipt.kind, agentId, providerId: input.receipt.providerId, model: null, bodySha256 },
    });
    ledger.sealSession(sessionId);
    return { recorded: true, idempotentReplay: false, provider: "claude-code", eventId: appended.id, receiptId: appended.receiptId };
  } catch (error) {
    throw new HookControlError("HOOK_CONTROL_LEDGER_UNAVAILABLE", 503, `the Claude Code observation could not be recorded: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    ledger.close();
  }
}

function parse<T>(schema: z.ZodType<T>, rawInput: string, what: string): T {
  try {
    if (Buffer.byteLength(rawInput, "utf8") > MAX_BODY_BYTES) throw new Error("too large");
    return schema.parse(JSON.parse(rawInput));
  } catch {
    throw new HookControlError("HOOK_CONTROL_INPUT_INVALID", 400, `${what} does not match its schema`);
  }
}

const stopSchema = z.strictObject({ hook_event_name: z.literal("Stop"), session_id: z.string().min(1).max(256) });

/** Record the end of one Claude Code turn. Observed only. */
export function recordClaudeCodeStop(input: { workspace: string; authenticatedAgentId: string; rawInput: string; now?: number }): HookObservationResult {
  const parsed = parse(stopSchema, input.rawInput, "Claude Code Stop");
  const now = input.now ?? Date.now();
  const record = { kind: "amc.claude-code-turn-end/v1", agentId: input.authenticatedAgentId, sessionSha256: claudeSessionSha256(parsed.session_id) };
  return recordHookAudit({ workspace: input.workspace, now, id: `ccstop_${sha256Hex(`${canonicalize(record)}\0${now}\0${randomUUID()}`).slice(0, 44)}`,
    meta: { turnEndSchemaVersion: 1, ...record }, body: record,
    receipt: { kind: "work_accepted", providerId: "hook-session:claude-code" } });
}

const postSchema = z.strictObject({
  hook_event_name: z.enum(["PostToolUse", "PostToolUseFailure"]),
  session_id: z.string().min(1).max(256),
  tool_use_id: z.string().min(1).max(160),
  tool_name: z.string().min(1).max(512),
  tool_input: z.record(z.string(), z.unknown()),
});
const authorizedActionSchema = z.object({ toolName: z.string().min(1), actionClass: z.enum(ACTION_CLASSES as [ActionClass, ...ActionClass[]]),
  argumentsDigest: z.string().regex(/^[a-f0-9]{64}$/) });

/**
 * Compare the input a Claude Code tool ran with (as PostToolUse or PostToolUseFailure reports it) with the argument
 * digest AMC authorized for the same action, normalized the same way (P1-02 `amc.args/v1`, the signed definition of
 * the authorized tool). No allow decision with a bound record, an unreadable decision or another tool all record a
 * mismatch: the tool ran without the authorization this input needed.
 */
export function recordClaudeCodePostExecution(input: { workspace: string; authenticatedAgentId: string; rawInput: string; now?: number }): HookObservationResult {
  const parsed = parse(postSchema, input.rawInput, "Claude Code post-tool event");
  const actionId = claudeActionId(parsed.session_id, parsed.tool_use_id);
  const decisionId = decisionEventId(input.authenticatedAgentId, "claude-code", actionId);
  let authorized: z.infer<typeof authorizedActionSchema> | null = null;
  let executedDigest: string | null = null;
  const ledger = openLedger(input.workspace);
  try {
    const row = ledger.db.prepare("SELECT meta_json FROM evidence_events WHERE id = ? LIMIT 1").get(decisionId) as { meta_json: string } | undefined;
    const meta = row ? JSON.parse(row.meta_json) as Record<string, unknown> : null;
    const intact = row !== undefined && verifyEvidenceEventIntegrity({ ledger, eventId: decisionId, requireReceipt: true, requireSealedSession: true }).ok;
    const found = intact && meta?.decision === "allow" && meta.agentId === input.authenticatedAgentId ? authorizedActionSchema.safeParse(meta.authorizedAction) : null;
    authorized = found?.success ? found.data : null;
  } catch {
    authorized = null;
  } finally {
    ledger.close();
  }
  if (authorized) {
    const config = loadVerifiedToolsConfigSnapshot(input.workspace).config;
    const normalized = normalizeArguments(config ? findToolDefinition(config, authorized.toolName) : null, authorized.actionClass, parsed.tool_input);
    executedDigest = normalized.ok ? normalized.argumentsDigest : null;
  }
  const record = {
    kind: "amc.claude-code-post-execution/v1", agentId: input.authenticatedAgentId, actionId, decisionEventId: decisionId,
    outcome: parsed.hook_event_name === "PostToolUse" ? "completed" : "failed", authorizedArgumentsDigest: authorized?.argumentsDigest ?? null,
    executedArgumentsDigest: executedDigest, authorizationMismatch: authorized === null || executedDigest !== authorized.argumentsDigest,
  };
  return recordHookAudit({ workspace: input.workspace, now: input.now ?? Date.now(), id: `ccpost_${sha256Hex(`${actionId}\0${parsed.hook_event_name}`).slice(0, 44)}`,
    meta: { postExecutionSchemaVersion: 1, ...record }, body: record, receipt: { kind: "tool_result", providerId: "hook-post-execution:claude-code" } });
}
