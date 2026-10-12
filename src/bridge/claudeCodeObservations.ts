/**
 * What AMC records from Claude Code's session hooks (P1-23), all observed, none enforced: the end of each turn (Stop;
 * AMC never forces Claude Code to continue) and, after each tool call, whether the input that ran is the input AMC
 * authorized (PostToolUse, PostToolUseFailure). Every record is evidence: written in its own ledger session, sealed,
 * and verified (row integrity and signed receipt) before AMC answers. A record that cannot be written and verified
 * fails with a 503, which latches the workspace's hooks (hookAuditLatch.ts). A replayed or duplicated observation is recorded as such and refused.
 *
 * A post-tool record is accepted as a call's outcome only when it names the PreToolUse decision it follows (by AMC's
 * action id from session and tool_use_id, and that decision's receipt digest, whose request digest covers the nonce)
 * and comes with the lease that obtained the decision, in a session still registered. Anything else is recorded as
 * unmatched and refused: it never takes the call's place, so whoever posts first cannot own the record. A second
 * observation of the same call is kept beside the first and flagged as a conflict (`conflictOf`), never dropped.
 * What Claude Code reports (the input that ran, completed or failed) is labelled `reported: { by: "claude-code" }`:
 * AMC records it, it does not vouch for it. A mismatch (`authorizationMismatch: true`) is observed, not prevented,
 * because the tool already ran. Raw tool input reaches AMC over loopback only and is never stored.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { normalizeArguments } from "../actions/normalizeArguments.js";
import { claudeActionId, claudeSessionSha256 } from "../adapters/hookProviders/claudeCode.js";
import { ACTION_CLASSES } from "../governor/actionCatalog.js";
import { getPurposeKeyHistory } from "../keys/signingKeys.js";
import { hashBinaryOrPath, openLedger, verifyEvidenceEventIntegrity } from "../ledger/ledger.js";
import { verifyReceipt, type ReceiptKind } from "../receipts/receipt.js";
import { findToolDefinition, loadVerifiedToolsConfigSnapshot } from "../toolhub/toolhubValidators.js";
import type { ActionClass } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { claudeCodeSessionRegistration } from "./claudeCodeSessionRegistry.js";
import type { HookLease } from "./hookAuthorization.js";
import { deterministicEventId as decisionEventId } from "./hookControl.js";
import { HookControlError } from "./hookProviders.js";

const MAX_BODY_BYTES = 262_144;
type Ledger = ReturnType<typeof openLedger>;

export interface HookObservationResult {
  recorded: true;
  idempotentReplay: false;
  provider: "claude-code";
  eventId: string;
  receiptId: string;
}

/** Append one signed audit row in its own ledger session, seal it, and verify the row and its receipt as written. */
export function appendVerified(ledger: Ledger, input: { id: string; now: number; meta: Record<string, unknown>; body: unknown;
  receipt: { kind: ReceiptKind; providerId: string } }): { eventId: string; receiptId: string } {
  const agentId = String(input.meta.agentId);
  const bodySha256 = sha256Hex(Buffer.from(canonicalize(input.body), "utf8"));
  const sessionId = `${input.id.split("_")[0]}-session-${sha256Hex(input.id).slice(0, 36)}`;
  ledger.startSession({ sessionId, runtime: "claude", binaryPath: "amc-bridge-claude-hooks", binarySha256: hashBinaryOrPath("amc-bridge-claude-hooks", "1") });
  const appended = ledger.appendEvidenceWithReceipt({
    id: input.id, ts: input.now, sessionId, runtime: "claude", eventType: "audit", payload: `${JSON.stringify(input.body, null, 2)}\n`,
    payloadExt: "json", inline: false, meta: { trustTier: "OBSERVED", provider: "claude-code", rawPayloadStored: false, ...input.meta, bodySha256 },
    receipt: { kind: input.receipt.kind, agentId, providerId: input.receipt.providerId, model: null, bodySha256 },
  });
  ledger.sealSession(sessionId);
  const receipt = verifyReceipt(appended.receipt, getPurposeKeyHistory(ledger.workspace, "receipt"));
  if (!verifyEvidenceEventIntegrity({ ledger, eventId: appended.id, requireReceipt: true, requireSealedSession: true }).ok
    || !receipt.ok || receipt.payload?.body_sha256 !== bodySha256) {
    throw new Error("the written row does not verify");
  }
  return { eventId: appended.id, receiptId: appended.receiptId };
}

/**
 * Record one observation of Claude Code session `sessionSha256` under the deterministic `id`, verified as written. A
 * second observation under the same id is a replay, duplicate or conflict: AMC keeps it under its own id with
 * `conflictOf` and refuses it. A write or verification failure fails closed with a 503.
 */
export function recordHookAudit(input: { workspace: string; id: string; now: number; sessionSha256: string; meta: Record<string, unknown>;
  body: unknown; receipt: { kind: ReceiptKind; providerId: string } }): HookObservationResult {
  let ledger: Ledger | null = null;
  let replayed = false;
  try {
    ledger = openLedger(input.workspace);
    if (ledger.db.prepare("SELECT 1 FROM evidence_events WHERE id = ? LIMIT 1").get(input.id)) {
      replayed = true;
      appendVerified(ledger, { ...input, id: `ccconflict_${sha256Hex(`${input.id}\0${input.now}\0${randomUUID()}`).slice(0, 44)}`,
        meta: { ...input.meta, conflictOf: input.id }, body: { ...(input.body as Record<string, unknown>), conflictOf: input.id } });
      throw new HookControlError("HOOK_CONTROL_REPLAY_CONFLICT", 409,
        "this Claude Code observation repeats or conflicts with one already recorded for the same call; AMC kept both and flagged this one");
    }
    return { recorded: true, idempotentReplay: false, provider: "claude-code", ...appendVerified(ledger, input) };
  } catch (error) {
    if (replayed && error instanceof HookControlError) throw error;
    throw new HookControlError("HOOK_CONTROL_LEDGER_UNAVAILABLE", 503,
      `the Claude Code observation could not be recorded and verified: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    ledger?.close();
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

const sessionField = z.string().min(1).max(256);
const stopSchema = z.strictObject({ hook_event_name: z.literal("Stop"), session_id: sessionField, prompt_id: sessionField.optional(), stop_hook_active: z.boolean() });

/** An observation id: deterministic when every part is known (Claude Code named the prompt), so a replay is detected; unique otherwise. */
export function observationId(prefix: string, parts: readonly unknown[], now: number): string {
  const key = parts.every((part) => part !== undefined) ? canonicalize(parts) : `${canonicalize(parts)}\0${now}\0${randomUUID()}`;
  return `${prefix}_${sha256Hex(key).slice(0, 44)}`;
}

/** Record the end of one Claude Code turn. Observed only. */
export function recordClaudeCodeStop(input: { workspace: string; authenticatedAgentId: string; rawInput: string; now?: number }): HookObservationResult {
  const parsed = parse(stopSchema, input.rawInput, "Claude Code Stop");
  const now = input.now ?? Date.now();
  const sessionSha256 = claudeSessionSha256(parsed.session_id);
  const record = { kind: "amc.claude-code-turn-end/v1", agentId: input.authenticatedAgentId, sessionSha256, reported: { by: "claude-code",
    promptId: parsed.prompt_id ?? null, stopHookActive: parsed.stop_hook_active } };
  return recordHookAudit({ workspace: input.workspace, now, sessionSha256, body: record, meta: { turnEndSchemaVersion: 1, ...record },
    id: observationId("ccstop", [input.authenticatedAgentId, sessionSha256, parsed.prompt_id, parsed.stop_hook_active], now),
    receipt: { kind: "work_accepted", providerId: "hook-session:claude-code" } });
}

const postSchema = z.strictObject({
  hook_event_name: z.enum(["PostToolUse", "PostToolUseFailure"]),
  session_id: sessionField,
  tool_use_id: z.string().min(1).max(160),
  tool_name: z.string().min(1).max(512),
  tool_input: z.record(z.string(), z.unknown()),
  /** Whether AMC's forwarder recorded this outcome at the observed ingress first; false latches the session. */
  ingressRecorded: z.boolean(),
  /** The receipt digest of the decision this outcome follows, as AMC's forwarder read it from the ledger. */
  decisionReceiptSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
});
const decisionMetaSchema = z.object({
  agentId: z.string(), decision: z.enum(["allow", "deny", "ask"]), receipt_sha256: z.string().regex(/^[a-f0-9]{64}$/), leaseId: z.string().nullable().optional(),
  authorizedAction: z.object({ toolName: z.string().min(1), actionClass: z.enum(ACTION_CLASSES as [ActionClass, ...ActionClass[]]),
    argumentsDigest: z.string().regex(/^[a-f0-9]{64}$/) }).optional(),
});

/** The verified PreToolUse decision row of `actionId`, or null when there is none or it does not verify. */
function verifiedDecision(ledger: Ledger, agentId: string, actionId: string): (z.infer<typeof decisionMetaSchema> & { eventId: string }) | null {
  const eventId = decisionEventId(agentId, "claude-code", actionId);
  try {
    const row = ledger.db.prepare("SELECT meta_json FROM evidence_events WHERE id = ? LIMIT 1").get(eventId) as { meta_json: string } | undefined;
    if (!row || !verifyEvidenceEventIntegrity({ ledger, eventId, requireReceipt: true, requireSealedSession: true }).ok) return null;
    const meta = decisionMetaSchema.safeParse(JSON.parse(row.meta_json));
    return meta.success && meta.data.agentId === agentId ? { ...meta.data, eventId } : null;
  } catch {
    return null;
  }
}

/**
 * Compare the input a Claude Code tool ran with, as PostToolUse or PostToolUseFailure reports it, with the argument
 * digest AMC authorized for the same action, normalized the same way (P1-02 `amc.args/v1`, the signed definition of
 * the authorized tool). Anything but a verified allow whose digest matches is a mismatch: no decision, a deny, an
 * unbound allow or other input. One terminal observation per action.
 */
export function recordClaudeCodePostExecution(input: { workspace: string; authenticatedAgentId: string; rawInput: string; lease?: HookLease;
  now?: number }): HookObservationResult {
  const parsed = parse(postSchema, input.rawInput, "Claude Code post-tool event");
  const now = input.now ?? Date.now();
  const sessionSha256 = claudeSessionSha256(parsed.session_id);
  const actionId = claudeActionId(parsed.session_id, parsed.tool_use_id);
  const ledger = openLedger(input.workspace);
  let decision: ReturnType<typeof verifiedDecision>;
  let registered: boolean;
  try {
    decision = verifiedDecision(ledger, input.authenticatedAgentId, actionId);
    registered = claudeCodeSessionRegistration(ledger, input.authenticatedAgentId, parsed.session_id).status === "registered";
  } finally {
    ledger.close();
  }
  const bindingRefusal = decision === null ? "no verified PreToolUse decision for this call"
    : parsed.decisionReceiptSha256 !== decision.receipt_sha256 ? "the observation does not name the decision it follows"
      : (input.lease?.leaseId ?? null) !== (decision.leaseId ?? null) ? "the observation does not come with the lease that obtained the decision"
        : !registered ? "the session that obtained the decision is not registered under this installation" : null;
  const bound = bindingRefusal === null ? decision : null;
  const authorized = bound?.decision === "allow" ? bound.authorizedAction ?? null : null;
  let reportedDigest: string | null = null;
  if (authorized) {
    const config = loadVerifiedToolsConfigSnapshot(input.workspace).config;
    const normalized = normalizeArguments(config ? findToolDefinition(config, authorized.toolName) : null, authorized.actionClass, parsed.tool_input);
    reportedDigest = normalized.ok ? normalized.argumentsDigest : null;
  }
  const record = {
    kind: "amc.claude-code-post-execution/v1", agentId: input.authenticatedAgentId, sessionSha256, actionId, toolUseId: parsed.tool_use_id,
    matched: bound !== null, bindingRefusal, decisionEventId: bound?.eventId ?? null, decisionReceiptSha256: bound?.receipt_sha256 ?? null,
    decision: bound?.decision ?? null, authorizedArgumentsDigest: authorized?.argumentsDigest ?? null, reportedArgumentsDigest: reportedDigest,
    authorizationMismatch: authorized === null || reportedDigest !== authorized.argumentsDigest,
    reported: { by: "claude-code", event: parsed.hook_event_name, outcome: parsed.hook_event_name === "PostToolUse" ? "completed" : "failed",
      decisionReceiptSha256: parsed.decisionReceiptSha256, leaseId: input.lease?.leaseId ?? null },
    ingressRecorded: parsed.ingressRecorded,
  };
  const audit = { workspace: input.workspace, now, sessionSha256, meta: { postExecutionSchemaVersion: 1, ...record }, body: record,
    receipt: { kind: "tool_result" as const, providerId: "hook-post-execution:claude-code" } };
  if (bindingRefusal !== null) {
    // Recorded under its own id, so it never takes the call's place, then refused.
    recordHookAudit({ ...audit, id: observationId("ccpost", [input.authenticatedAgentId, actionId, "unmatched", undefined], now) });
    throw new HookControlError("HOOK_CONTROL_REPLAY_CONFLICT", 409, `AMC recorded this outcome as unmatched and refused it: ${bindingRefusal}`);
  }
  const recorded = recordHookAudit({ ...audit, id: observationId("ccpost", [input.authenticatedAgentId, actionId], now) });
  if (!parsed.ingressRecorded) {
    throw new HookControlError("HOOK_CONTROL_LEDGER_UNAVAILABLE", 503, "AMC's forwarder could not record this tool outcome at the observed ingress");
  }
  return recorded;
}
