/**
 * What AMC records from Claude Code's session hooks (P1-23) and Pi's tool_result (piObservations.ts, P1-22 follow-up), all
 * observed, none enforced: the end of each turn (Stop; AMC never forces Claude Code to continue) and, after each tool
 * call, whether the input that ran is the input AMC authorized (PostToolUse, PostToolUseFailure, Pi's tool_result).
 * Every record is evidence: written in its own ledger session, sealed,
 * and verified (row integrity and signed receipt) before AMC answers. A record AMC's writer cannot write and verify
 * for a session with a verified registration latches the workspace's hooks (hookAuditLatch.ts); input never does.
 * After-the-fact intake is capped per registration (unregistered sessions share one cap), never silently: what is
 * refused is listed in a signed summary row, and the registration's calls are denied until its intake recovers. A replayed or duplicated observation is recorded as such and refused.
 *
 * A post-tool record is accepted as a call's outcome only when it names the decision it follows (PreToolUse or Pi's
 * tool_call; by AMC's action id from session and call id, and that decision's receipt digest, whose request digest covers the nonce)
 * and comes with the lease that obtained the decision, in a session still registered. Anything else is recorded as
 * unmatched and refused: it never takes the call's place, so whoever posts first cannot own the record. A second
 * observation of the same call is kept beside the first and flagged as a conflict (`conflictOf`), never dropped; for Pi,
 * a repeat of exactly the recorded observation, bound to the same decision, is answered as recorded (an idempotent replay).
 * What the provider reports (the input that ran, completed or failed) is labelled `reported: { by: <provider> }`:
 * AMC records it, it does not vouch for it. A mismatch (`authorizationMismatch: true`) is observed, not prevented,
 * because the tool already ran. Raw tool input reaches AMC over loopback only and is never stored.
 */
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";
import { normalizeArguments } from "../actions/normalizeArguments.js";
import { claudeActionId, claudeSessionSha256 } from "../adapters/hookProviders/claudeCode.js";
import { piActionId, piSessionSha256 } from "../adapters/pi/piIdentity.js";
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
import { CONTROL_HOOK_EVENTS, HookControlError } from "./hookProviders.js";
import { piSessionRegistration } from "./piSessionRegistry.js";

const MAX_BODY_BYTES = 262_144;
type Ledger = ReturnType<typeof openLedger>;
// ponytail: in-memory counters per Bridge process (bounded, hookIntake.ts); a restart resets them, summary rows already written stay.
const observationCounters = new IntakeCounters(OBSERVATION_LIMITS);

/** The providers whose after-the-fact observations AMC records here, and how each names its sessions, calls and registrations. */
export type ObservedProvider = "claude-code" | "pi";
const PROVIDERS = {
  "claude-code": { label: "Claude Code", prefix: "cc", sessionSha256: claudeSessionSha256, actionId: claudeActionId, registration: claudeCodeSessionRegistration },
  pi: { label: "Pi", prefix: "pi", sessionSha256: piSessionSha256, actionId: piActionId, registration: piSessionRegistration },
} as const;

/** Whether `provider` session `sessionId` has a verified registration: only then can a fault of its writer latch. */
export function sessionRegistered(workspace: string, agentId: string, sessionId: string, provider: ObservedProvider = "claude-code"): boolean {
  const ledger = openLedger(workspace);
  try {
    return PROVIDERS[provider].registration(ledger, agentId, sessionId).status === "registered";
  } finally {
    ledger.close();
  }
}

type ScopeInput = { workspace: string; agentId: string; leaseId: string | undefined; sessionId: string; provider: ObservedProvider };

/** The intake scope of an observation or decision: its workspace, the lease it came with, and its session (unregistered ones share one). */
function intakeScope(input: ScopeInput & { registered: boolean }): IntakeScope {
  return { workspace: resolve(input.workspace), lease: `${input.agentId}\0${input.leaseId ?? "no-lease"}`,
    session: input.registered ? PROVIDERS[input.provider].sessionSha256(input.sessionId) : `unregistered\0${input.provider}\0${input.agentId}` };
}

/** The writer of signed intake summary rows for one scope: what was refused, at which cap, and the digest of the ids it lists. */
function summaryWriter(input: ScopeInput & { registered: boolean; now: number }) {
  const sessionSha256 = PROVIDERS[input.provider].sessionSha256(input.sessionId);
  return (shed: IntakeShed, level: IntakeLevel): void => {
    const body = { kind: `amc.${input.provider}-intake-summary/v1`, agentId: input.agentId, sessionSha256, leaseId: input.leaseId ?? null,
      registered: input.registered, cap: level, reason: "observation not recorded (rate-limited)",
      window: { from: new Date(shed.since).toISOString(), to: new Date(input.now).toISOString() }, count: shed.count,
      toolUseIds: shed.toolUseIds, actionIds: shed.actionIds, idsSha256: shedDigest(shed) };
    recordHookAudit({ workspace: input.workspace, now: input.now, sessionSha256, body, meta: { intakeSummarySchemaVersion: 1, ...body }, provider: input.provider,
      id: observationId(`${PROVIDERS[input.provider].prefix}intake`, [input.agentId, sessionSha256, undefined], input.now), underRegistration: input.registered,
      receipt: { kind: "guard_check", providerId: `hook-intake:${input.provider}` } });
  };
}

/**
 * Admit one after-the-fact observation (Stop, PostToolUse, PostToolUseFailure) of session `sessionId` within the caps of
 * its session, its lease and its workspace (hookIntake.ts). Over a cap it is refused (429), never silently: it is listed
 * in a signed intake summary row, and decisions under the capped scope are denied until its window passes.
 */
function admitObservation(input: ScopeInput & { now: number; toolUseId?: string }): { registered: boolean } {
  const registered = sessionRegistered(input.workspace, input.agentId, input.sessionId, input.provider);
  const write = summaryWriter({ ...input, registered });
  const refused = observationCounters.admit(intakeScope({ ...input, registered }), input.now, write,
    input.toolUseId ? { toolUseId: input.toolUseId, actionId: PROVIDERS[input.provider].actionId(input.sessionId, input.toolUseId) } : undefined);
  if (refused !== null) {
    throw new HookControlError("HOOK_CONTROL_RATE_LIMITED", 429, `${PROVIDERS[input.provider].label} observations are over AMC's ${refused} intake limit: AMC lists this one `
      + "in a signed intake summary as not recorded and denies the calls under that limit until it recovers");
  }
  return { registered };
}

/**
 * Why registered session `sessionId`'s decision (PreToolUse, Pi's tool_call) is denied: its session, its lease or its
 * workspace refused observations and has not recovered. What was refused since the last summary row is written first.
 * Decision rows themselves are never capped.
 */
export function intakeBackpressure(input: Omit<ScopeInput, "provider"> & { provider?: ObservedProvider; now: number }): string | null {
  const scope = { ...input, provider: input.provider ?? "claude-code", registered: true };
  const levels = observationCounters.backpressure(intakeScope(scope), input.now, summaryWriter(scope));
  return levels.length === 0 ? null : `${PROVIDERS[scope.provider].label} observations are over AMC's ${levels.join(" and ")} intake limit, and AMC listed those it could not `
    + "record in a signed summary; AMC denies these calls until intake recovers.";
}

export interface HookObservationResult {
  recorded: true;
  idempotentReplay: boolean;
  provider: ObservedProvider;
  eventId: string;
  receiptId: string;
}

/** Whether row `eventId` verifies as written: sealed, intact, and its receipt signed by a receipt purpose key over `bodySha256`. */
function verifiesAs(ledger: Ledger, eventId: string, receipt: string, bodySha256: string): boolean {
  const verified = verifyReceipt(receipt, getPurposeKeyHistory(ledger.workspace, "receipt"));
  return verifyEvidenceEventIntegrity({ ledger, eventId, requireReceipt: true, requireSealedSession: true }).ok && verified.ok
    && verified.payload?.body_sha256 === bodySha256;
}

/** Append one signed audit row in its own ledger session, seal it, and verify the row and its receipt as written. */
export function appendVerified(ledger: Ledger, input: { id: string; now: number; meta: Record<string, unknown>; body: unknown;
  receipt: { kind: ReceiptKind; providerId: string } }): { eventId: string; receiptId: string } {
  const agentId = String(input.meta.agentId);
  const bodySha256 = sha256Hex(Buffer.from(canonicalize(input.body), "utf8"));
  const sessionId = `${input.id.split("_")[0]}-session-${sha256Hex(input.id).slice(0, 36)}`;
  const runtime = input.meta.provider === "pi" ? "pi" : "claude";
  ledger.startSession({ sessionId, runtime, binaryPath: `amc-bridge-${runtime}-hooks`, binarySha256: hashBinaryOrPath(`amc-bridge-${runtime}-hooks`, "1") });
  const appended = ledger.appendEvidenceWithReceipt({
    id: input.id, ts: input.now, sessionId, runtime, eventType: "audit", payload: `${JSON.stringify(input.body, null, 2)}\n`,
    payloadExt: "json", inline: false, meta: { trustTier: "OBSERVED", provider: "claude-code", rawPayloadStored: false, ...input.meta, bodySha256 },
    receipt: { kind: input.receipt.kind, agentId, providerId: input.receipt.providerId, model: null, bodySha256 },
  });
  ledger.sealSession(sessionId);
  if (!verifiesAs(ledger, appended.id, appended.receipt, bodySha256)) throw new Error("the written row does not verify");
  return { eventId: appended.id, receiptId: appended.receiptId };
}

/** The receipt id of recorded row `id` when it verifies and records exactly `body`, else null: then a repeat is no conflict. */
function sameObservation(ledger: Ledger, id: string, metaJson: string, body: unknown): string | null {
  try {
    const meta = JSON.parse(metaJson) as { receipt?: unknown; receipt_id?: unknown };
    const same = verifiesAs(ledger, id, String(meta.receipt), sha256Hex(Buffer.from(canonicalize(body), "utf8")));
    return same && typeof meta.receipt_id === "string" ? meta.receipt_id : null;
  } catch {
    return null;
  }
}

/**
 * Record one observation of `provider` session `sessionSha256` under the deterministic `id`, verified as written. A
 * second observation under the same id is a replay, duplicate or conflict: AMC keeps it under its own id with
 * `conflictOf` and refuses it. With `idempotent`, a repeat of exactly the recorded body (which names the decision it
 * follows) is the same observation, answered as recorded and not written again. A writer failure is a
 * `HookWriterFault`, which latches only `underRegistration`.
 */
export function recordHookAudit(input: { workspace: string; id: string; now: number; sessionSha256: string; meta: Record<string, unknown>;
  body: unknown; receipt: { kind: ReceiptKind; providerId: string }; underRegistration: boolean; provider?: ObservedProvider; idempotent?: boolean }):
  HookObservationResult {
  const provider = input.provider ?? "claude-code";
  const { label, prefix } = PROVIDERS[provider];
  const audit = { ...input, meta: { provider, ...input.meta } };
  let ledger: Ledger | null = null;
  let replayed = false;
  try {
    ledger = openLedger(input.workspace);
    const existing = ledger.db.prepare("SELECT meta_json FROM evidence_events WHERE id = ? LIMIT 1").get(input.id) as { meta_json: string } | undefined;
    if (existing) {
      const receiptId = input.idempotent ? sameObservation(ledger, input.id, existing.meta_json, input.body) : null;
      if (receiptId) return { recorded: true, idempotentReplay: true, provider, eventId: input.id, receiptId };
      replayed = true;
      appendVerified(ledger, { ...audit, id: `${prefix}conflict_${sha256Hex(`${input.id}\0${input.now}\0${randomUUID()}`).slice(0, 44)}`,
        meta: { ...audit.meta, conflictOf: input.id }, body: { ...(input.body as Record<string, unknown>), conflictOf: input.id } });
      throw new HookControlError("HOOK_CONTROL_REPLAY_CONFLICT", 409,
        `this ${label} observation repeats or conflicts with one already recorded for the same call; AMC kept both and flagged this one`);
    }
    return { recorded: true, idempotentReplay: false, provider, ...appendVerified(ledger, audit) };
  } catch (error) {
    if (replayed && error instanceof HookControlError) throw error;
    throw writerFault(error, input.underRegistration, `the ${label} observation`);
  } finally {
    ledger?.close();
  }
}

/** `rawInput` parsed against `schema`; anything else, or more than 256 KiB, is refused (400) and never latches. */
export function parse<T>(schema: z.ZodType<T>, rawInput: string, what: string): T {
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
    leaseId: input.lease?.leaseId, now, provider: "claude-code" });
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

/** The verified decision row of `provider`'s action `actionId`, or null when there is none or it does not verify. */
function verifiedDecision(ledger: Ledger, agentId: string, actionId: string, provider: ObservedProvider):
  (z.infer<typeof decisionMetaSchema> & { eventId: string }) | null {
  const eventId = decisionEventId(agentId, provider, actionId);
  try {
    const row = ledger.db.prepare("SELECT meta_json FROM evidence_events WHERE id = ? LIMIT 1").get(eventId) as { meta_json: string } | undefined;
    if (!row || !verifyEvidenceEventIntegrity({ ledger, eventId, requireReceipt: true, requireSealedSession: true }).ok) return null;
    const meta = decisionMetaSchema.safeParse(JSON.parse(row.meta_json));
    return meta.success && meta.data.agentId === agentId ? { ...meta.data, eventId } : null;
  } catch {
    return null;
  }
}

/** One tool call's outcome as the provider's hook reports it, in AMC's terms. */
export interface ReportedOutcome {
  provider: ObservedProvider;
  /** The provider's event name (PostToolUse, PostToolUseFailure, tool_result). */
  event: string;
  sessionId: string;
  callId: string;
  toolInput: Record<string, unknown>;
  failed: boolean;
  /** Whether AMC's forwarder or extension recorded this outcome at the observed ingress first; false is recorded and refused. */
  ingressRecorded: boolean;
  /** The receipt digest of the decision this outcome follows, as the forwarder or extension names it. */
  decisionReceiptSha256: string | null;
}

/** Record a Claude Code PostToolUse or PostToolUseFailure outcome (recordPostExecution). */
export function recordClaudeCodePostExecution(input: { workspace: string; authenticatedAgentId: string; rawInput: string; lease?: HookLease;
  now?: number }): HookObservationResult {
  const parsed = parse(postSchema, input.rawInput, "Claude Code post-tool event");
  return recordPostExecution(input, { provider: "claude-code", event: parsed.hook_event_name, sessionId: parsed.session_id, callId: parsed.tool_use_id,
    toolInput: parsed.tool_input, failed: parsed.hook_event_name === "PostToolUseFailure", ingressRecorded: parsed.ingressRecorded,
    decisionReceiptSha256: parsed.decisionReceiptSha256 });
}

/**
 * Compare the input a tool ran with, as the provider reports it after the call, with the argument digest AMC authorized
 * for the same action, normalized the same way (P1-02 `amc.args/v1`, the signed definition of the authorized tool).
 * Anything but a verified allow whose digest matches is a mismatch: no decision, a deny, an unbound allow or other
 * input. One terminal observation per action.
 */
export function recordPostExecution(input: { workspace: string; authenticatedAgentId: string; lease?: HookLease; now?: number },
  reported: ReportedOutcome): HookObservationResult {
  const { provider } = reported;
  const now = input.now ?? Date.now();
  const sessionSha256 = PROVIDERS[provider].sessionSha256(reported.sessionId);
  const actionId = PROVIDERS[provider].actionId(reported.sessionId, reported.callId);
  const { registered } = admitObservation({ workspace: input.workspace, agentId: input.authenticatedAgentId, sessionId: reported.sessionId,
    leaseId: input.lease?.leaseId, now, provider, toolUseId: reported.callId });
  const ledger = openLedger(input.workspace);
  let decision: ReturnType<typeof verifiedDecision>;
  try {
    decision = verifiedDecision(ledger, input.authenticatedAgentId, actionId, provider);
  } finally {
    ledger.close();
  }
  const bindingRefusal = decision === null ? `no verified ${CONTROL_HOOK_EVENTS[provider]} decision for this call`
    : reported.decisionReceiptSha256 !== decision.receipt_sha256 ? "the observation does not name the decision it follows"
      : (input.lease?.leaseId ?? null) !== (decision.leaseId ?? null) ? "the observation does not come with the lease that obtained the decision"
        : !registered ? "the session that obtained the decision is not registered under this installation" : null;
  const bound = bindingRefusal === null ? decision : null;
  const authorized = bound?.decision === "allow" ? bound.authorizedAction ?? null : null;
  let reportedDigest: string | null = null;
  if (authorized) {
    const config = loadVerifiedToolsConfigSnapshot(input.workspace).config;
    const normalized = normalizeArguments(config ? findToolDefinition(config, authorized.toolName) : null, authorized.actionClass, reported.toolInput);
    reportedDigest = normalized.ok ? normalized.argumentsDigest : null;
  }
  const record = {
    kind: `amc.${provider}-post-execution/v1`, agentId: input.authenticatedAgentId, sessionSha256, actionId, toolUseId: reported.callId,
    matched: bound !== null, bindingRefusal, decisionEventId: bound?.eventId ?? null, decisionReceiptSha256: bound?.receipt_sha256 ?? null,
    decision: bound?.decision ?? null, authorizedArgumentsDigest: authorized?.argumentsDigest ?? null, reportedArgumentsDigest: reportedDigest,
    authorizationMismatch: authorized === null || reportedDigest !== authorized.argumentsDigest,
    reported: { by: provider, event: reported.event, outcome: reported.failed ? "failed" : "completed",
      decisionReceiptSha256: reported.decisionReceiptSha256, leaseId: input.lease?.leaseId ?? null },
    ingressRecorded: reported.ingressRecorded,
  };
  const audit = { workspace: input.workspace, now, sessionSha256, meta: { postExecutionSchemaVersion: 1, ...record }, body: record, provider,
    receipt: { kind: "tool_result" as const, providerId: `hook-post-execution:${provider}` }, underRegistration: registered };
  const prefix = `${PROVIDERS[provider].prefix}post`;
  if (bindingRefusal !== null) {
    // Recorded under its own id, so it never takes the call's place, then refused.
    recordHookAudit({ ...audit, id: observationId(prefix, [input.authenticatedAgentId, actionId, "unmatched", undefined], now) });
    throw new HookControlError("HOOK_CONTROL_REPLAY_CONFLICT", 409, `AMC recorded this outcome as unmatched and refused it: ${bindingRefusal}`);
  }
  // Pi: the same outcome, bound to the same decision, sent again is recorded already; Claude Code keeps P1-23's rule (every repeat is flagged).
  const recorded = recordHookAudit({ ...audit, id: observationId(prefix, [input.authenticatedAgentId, actionId], now), idempotent: provider === "pi" });
  if (!reported.ingressRecorded) {
    // The forwarder's own report: AMC recorded it above (ingressRecorded: false) and refuses it, but input never latches.
    throw new HookControlError("HOOK_CONTROL_INPUT_INVALID", 422, "AMC recorded this tool outcome, but it was not recorded at the observed ingress first");
  }
  return recorded;
}
