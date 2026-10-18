/**
 * What AMC records from Claude Code's session hooks (P1-23), all observed, none enforced: the end of each turn (Stop;
 * AMC never forces Claude Code to continue) and, after each tool call, whether the input that ran is the input AMC
 * authorized (PostToolUse, PostToolUseFailure). Every record is evidence: written in its own ledger session, sealed,
 * and verified (row integrity and signed receipt) before AMC answers. A record AMC's writer cannot write and verify
 * for a session with a verified registration latches the workspace's hooks (hookAuditLatch.ts); input never does.
 * After-the-fact intake is capped per registration (unregistered sessions share one cap), never silently: what is
 * refused is listed in a signed summary row, and the registration's calls are denied until its intake recovers. A replayed or duplicated observation is recorded as such and refused.
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
import { resolve } from "node:path";
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
import { writerFault } from "./hookAuditLatch.js";
import { IntakeCounters, OBSERVATION_LIMITS, shedDigest, type IntakeLevel, type IntakeScope, type IntakeShed } from "./hookIntake.js";
import { HookControlError } from "./hookProviders.js";

const MAX_BODY_BYTES = 262_144;
type Ledger = ReturnType<typeof openLedger>;
// ponytail: in-memory counters per Bridge process (bounded, hookIntake.ts); a restart resets them, summary rows already written stay.
const observationCounters = new IntakeCounters(OBSERVATION_LIMITS);

/** Whether Claude Code session `sessionId` has a verified registration: only then can a fault of its writer latch. */
export function sessionRegistered(workspace: string, agentId: string, sessionId: string): boolean {
  const ledger = openLedger(workspace);
  try {
    return claudeCodeSessionRegistration(ledger, agentId, sessionId).status === "registered";
  } finally {
    ledger.close();
  }
}

/** The intake scope of an observation or decision: its workspace, the lease it came with, and its session (unregistered ones share one). */
function intakeScope(input: { workspace: string; agentId: string; leaseId: string | undefined; sessionId: string; registered: boolean }): IntakeScope {
  return { workspace: resolve(input.workspace), lease: `${input.agentId}\0${input.leaseId ?? "no-lease"}`,
    session: input.registered ? claudeSessionSha256(input.sessionId) : `unregistered\0${input.agentId}` };
}

/** The writer of signed intake summary rows for one scope: what was refused, at which cap, and the digest of the ids it lists. */
function summaryWriter(input: { workspace: string; agentId: string; sessionSha256: string; leaseId: string | undefined; registered: boolean; now: number }) {
  return (shed: IntakeShed, level: IntakeLevel): void => {
    const body = { kind: "amc.claude-code-intake-summary/v1", agentId: input.agentId, sessionSha256: input.sessionSha256, leaseId: input.leaseId ?? null,
      registered: input.registered, cap: level, reason: "observation not recorded (rate-limited)",
      window: { from: new Date(shed.since).toISOString(), to: new Date(input.now).toISOString() }, count: shed.count,
      toolUseIds: shed.toolUseIds, actionIds: shed.actionIds, idsSha256: shedDigest(shed) };
    recordHookAudit({ workspace: input.workspace, now: input.now, sessionSha256: input.sessionSha256, body, meta: { intakeSummarySchemaVersion: 1, ...body },
      id: observationId("ccintake", [input.agentId, input.sessionSha256, undefined], input.now), underRegistration: input.registered,
      receipt: { kind: "guard_check", providerId: "hook-intake:claude-code" } });
  };
}

/**
 * Admit one after-the-fact observation (Stop, PostToolUse, PostToolUseFailure) of session `sessionId` within the caps of
 * its session, its lease and its workspace (hookIntake.ts). Over a cap it is refused (429), never silently: it is listed
 * in a signed intake summary row, and decisions under the capped scope are denied until its window passes.
 */
function admitObservation(input: { workspace: string; agentId: string; sessionId: string; leaseId: string | undefined; now: number;
  toolUseId?: string }): { registered: boolean } {
  const registered = sessionRegistered(input.workspace, input.agentId, input.sessionId);
  const write = summaryWriter({ ...input, sessionSha256: claudeSessionSha256(input.sessionId), registered });
  const refused = observationCounters.admit(intakeScope({ ...input, registered }), input.now, write,
    input.toolUseId ? { toolUseId: input.toolUseId, actionId: claudeActionId(input.sessionId, input.toolUseId) } : undefined);
  if (refused !== null) {
    throw new HookControlError("HOOK_CONTROL_RATE_LIMITED", 429, `Claude Code observations are over AMC's ${refused} intake limit: AMC lists this one `
      + "in a signed intake summary as not recorded and denies the calls under that limit until it recovers");
  }
  return { registered };
}

/**
 * Why registered session `sessionId`'s PreToolUse decision is denied: its session, its lease or its workspace refused
 * observations and has not recovered. What was refused since the last summary row is written first. Decision rows
 * themselves are never capped.
 */
export function intakeBackpressure(input: { workspace: string; agentId: string; sessionId: string; leaseId: string | undefined; now: number }): string | null {
  const write = summaryWriter({ ...input, sessionSha256: claudeSessionSha256(input.sessionId), registered: true });
  const levels = observationCounters.backpressure(intakeScope({ ...input, registered: true }), input.now, write);
  return levels.length === 0 ? null : `Claude Code observations are over AMC's ${levels.join(" and ")} intake limit, and AMC listed those it could not `
    + "record in a signed summary; AMC denies these calls until intake recovers.";
}

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
 * `conflictOf` and refuses it. A writer failure is a `HookWriterFault`, which latches only `underRegistration`.
 */
export function recordHookAudit(input: { workspace: string; id: string; now: number; sessionSha256: string; meta: Record<string, unknown>;
  body: unknown; receipt: { kind: ReceiptKind; providerId: string }; underRegistration: boolean }): HookObservationResult {
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
    throw writerFault(error, input.underRegistration, "the Claude Code observation");
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
export function recordClaudeCodeStop(input: { workspace: string; authenticatedAgentId: string; rawInput: string; lease?: HookLease; now?: number }):
  HookObservationResult {
  const parsed = parse(stopSchema, input.rawInput, "Claude Code Stop");
  const now = input.now ?? Date.now();
  const { registered } = admitObservation({ workspace: input.workspace, agentId: input.authenticatedAgentId, sessionId: parsed.session_id,
    leaseId: input.lease?.leaseId, now });
  const sessionSha256 = claudeSessionSha256(parsed.session_id);
  const record = { kind: "amc.claude-code-turn-end/v1", agentId: input.authenticatedAgentId, sessionSha256, reported: { by: "claude-code",
    promptId: parsed.prompt_id ?? null, stopHookActive: parsed.stop_hook_active } };
  return recordHookAudit({ workspace: input.workspace, now, sessionSha256, body: record, meta: { turnEndSchemaVersion: 1, ...record },
    id: observationId("ccstop", [input.authenticatedAgentId, sessionSha256, parsed.prompt_id, parsed.stop_hook_active], now),
    receipt: { kind: "work_accepted", providerId: "hook-session:claude-code" }, underRegistration: registered });
}

const postSchema = z.strictObject({
  hook_event_name: z.enum(["PostToolUse", "PostToolUseFailure"]),
  session_id: sessionField,
  tool_use_id: z.string().min(1).max(160),
  tool_name: z.string().min(1).max(512),
  tool_input: z.record(z.string(), z.unknown()),
  /** Whether AMC's forwarder recorded this outcome at the observed ingress first; false is recorded and refused. */
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
  const { registered } = admitObservation({ workspace: input.workspace, agentId: input.authenticatedAgentId, sessionId: parsed.session_id,
    leaseId: input.lease?.leaseId, now,
    toolUseId: parsed.tool_use_id });
  const ledger = openLedger(input.workspace);
  let decision: ReturnType<typeof verifiedDecision>;
  try {
    decision = verifiedDecision(ledger, input.authenticatedAgentId, actionId);
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
    receipt: { kind: "tool_result" as const, providerId: "hook-post-execution:claude-code" }, underRegistration: registered };
  if (bindingRefusal !== null) {
    // Recorded under its own id, so it never takes the call's place, then refused.
    recordHookAudit({ ...audit, id: observationId("ccpost", [input.authenticatedAgentId, actionId, "unmatched", undefined], now) });
    throw new HookControlError("HOOK_CONTROL_REPLAY_CONFLICT", 409, `AMC recorded this outcome as unmatched and refused it: ${bindingRefusal}`);
  }
  const recorded = recordHookAudit({ ...audit, id: observationId("ccpost", [input.authenticatedAgentId, actionId], now) });
  if (!parsed.ingressRecorded) {
    // The forwarder's own report: AMC recorded it above (ingressRecorded: false) and refuses it, but input never latches.
    throw new HookControlError("HOOK_CONTROL_INPUT_INVALID", 422, "AMC recorded this tool outcome, but AMC's forwarder could not record it at the observed ingress");
  }
  return recorded;
}
