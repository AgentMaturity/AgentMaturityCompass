import { randomUUID } from "node:crypto";
import { lstatSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { canonicalize, parseCanonicalJson } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { assertOrgPairsCurrent, captureOrgPairs, orgPairBytes, prepareOrgPairsAsync } from "../org/preparedOrgPairs.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { budgetMeta, budgetSessionAgent, readBudgetEvents } from "../budgets/nativeBudgetUsage.js";
import { loadSessionEventHistory } from "../session/sessionEventHistory.js";
import { assertSessionOwnerAvailable, readSessionWriter } from "../session/sessionOwnership.js";
import { SessionService } from "../session/sessionService.js";
import { workspaceSelfTrust } from "../trust/trustContext.js";
import { MAX_GOAL_ROUNDS } from "./goalRounds.js";
import { assertScheduleClaim, assertScheduleOwner, interruptedClaims, readSchedules, schedulesPath, withStoreLock, type Schedule } from "./scheduleStore.js";

const idSchema = z.string().min(1).max(128).refine(value => !["__proto__", "prototype", "constructor"].includes(value), "reserved objective id");
const positiveInteger = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const roundSchema = z.object({ claimId: z.string().min(1), round: positiveInteger, sessionId: z.string().min(1) }).strict();
const checkStatusSchema = z.enum(["complete", "failed", "unavailable"]);
const objectiveSchema = z.object({
  version: z.literal(1), id: idSchema, scheduleId: idSchema, revision: positiveInteger,
  objective: z.string().min(1).max(65_536), ownerPrincipal: z.string().min(1).max(128), scopeDigest: z.string().regex(/^[a-f0-9]{64}$/),
  completionCheckDigest: z.string().regex(/^[a-f0-9]{64}$/),
  maxRounds: positiveInteger.max(MAX_GOAL_ROUNDS), status: z.enum(["active", "paused", "blocked", "complete"]),
  roundsUsed: z.number().int().min(0).max(MAX_GOAL_ROUNDS), currentRound: roundSchema.nullable(),
  lastRound: roundSchema.nullable().optional(), lastStopReason: z.string().max(4096).optional(), lastCheckStatus: checkStatusSchema.optional()
}).strict().refine(record => record.id === record.scheduleId && record.roundsUsed <= record.maxRounds
  && (record.currentRound === null || record.currentRound.round === record.roundsUsed)
  && (record.lastRound == null || record.lastRound.round <= record.roundsUsed), "inconsistent objective identity or round budget");
export type ObjectiveRecord = z.infer<typeof objectiveSchema>;
export interface ObjectiveRoundAuthority { readonly claimId: string; readonly configDigest: string; readonly round: number; readonly sessionId: string }
type CheckStatus = z.infer<typeof checkStatusSchema>;

/** IDs never become path components. Objective state is a signed domain beside its existing schedule. */
export function objectivePath(workspace: string, id: string): string {
  idSchema.parse(id);
  return join(workspace, ".amc", "objectives", `${sha256Hex(id)}.json`);
}
function assertDirectory(workspace: string): void {
  for (const path of [join(workspace, ".amc"), join(workspace, ".amc", "objectives")]) {
    try { if (!lstatSync(path).isDirectory()) throw new Error("Objective storage must use real directories, not links."); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
}
const JOURNAL_TYPE = "native_objective_revision_authorized";
interface ObjectiveBinding { readonly eventHash: string; readonly revision: number; readonly recordSha256: string; readonly ownerPrincipal: string }
/** Reuse the native list receipt pattern: signatures alone do not prevent replay of an older signed file. */
function objectiveBinding(workspace: string, id: string): ObjectiveBinding | null {
  // ponytail: verify the full receipt history; add an authenticated index only if journal volume warrants it.
  const rows = readBudgetEvents(workspace, undefined, { trust: workspaceSelfTrust(workspace) });
  let latest: ObjectiveBinding | null = null;
  let nextRevision = 1;
  let previousSha256: string | null = null;
  let ownerPrincipal: string | null = null;
  const selected = rows.flatMap(row => {
    const meta = budgetMeta(row);
    return row.event_type === "audit" && meta.type === JOURNAL_TYPE && meta.objectiveId === id ? [{ row, meta }] : [];
  });
  for (const { row, meta } of selected) {
    const sessionRows = rows.filter(event => event.session_id === row.session_id);
    const opened = sessionRows.filter(event => event.event_type === "session/open");
    const closed = sessionRows.filter(event => event.event_type === "session/close");
    if (sessionRows.length !== 3 || sessionRows[0]?.event_type !== "session/open" || sessionRows[1]?.id !== row.id
      || sessionRows[2]?.event_type !== "session/close" || opened.length !== 1 || closed.length !== 1 || budgetMeta(opened[0]!).harnessVersion !== "amc-native-objective-v1"
      || budgetMeta(opened[0]!).compositionDigest !== meta.recordSha256 || budgetMeta(opened[0]!).policyDigest !== meta.configDigest
      || closed[0]!.ts < row.ts || meta.scheduleId !== id || meta.revision !== nextRevision
      || meta.previousSha256 !== previousSha256 || typeof meta.recordSha256 !== "string" || !/^[a-f0-9]{64}$/.test(meta.recordSha256)
      || typeof meta.configDigest !== "string" || !/^[a-f0-9]{64}$/.test(meta.configDigest)
      || typeof meta.ownerPrincipal !== "string" || budgetSessionAgent(rows, row.session_id) !== meta.ownerPrincipal
      || (ownerPrincipal !== null && meta.ownerPrincipal !== ownerPrincipal))
      throw new Error("Objective revision journal is incomplete, conflicting or bound to another owner.");
    latest = { eventHash: row.event_hash, revision: meta.revision as number, recordSha256: meta.recordSha256, ownerPrincipal: meta.ownerPrincipal };
    nextRevision += 1; previousSha256 = latest.recordSha256; ownerPrincipal = latest.ownerPrincipal;
  }
  return latest;
}
function assertBinding(workspace: string, id: string, expected: ObjectiveBinding | null): void {
  if (canonicalize(objectiveBinding(workspace, id)) !== canonicalize(expected)) throw new Error("Objective revision journal changed while signing; retry from its exact current record.");
}
function journalRevision(workspace: string, record: ObjectiveRecord, digest: string, previous: ObjectiveBinding | null, configDigest: string): ObjectiveBinding {
  const session = new SessionService(workspace);
  try {
    session.open({ sessionId: `objective-${randomUUID()}`, agentId: record.ownerPrincipal, harnessVersion: "amc-native-objective-v1",
      compositionDigest: digest, policyDigest: configDigest });
    const event = session.recordProjectedEvidence({ eventType: "audit", payload: "Objective revision authorized before signed record publication",
      meta: { type: JOURNAL_TYPE, objectiveId: record.id, scheduleId: record.scheduleId, ownerPrincipal: record.ownerPrincipal,
        revision: record.revision, recordSha256: digest, previousSha256: previous?.recordSha256 ?? null, configDigest } });
    session.close({ reason: "objective revision authorized" });
    return { eventHash: event.eventHash, revision: record.revision, recordSha256: digest, ownerPrincipal: record.ownerPrincipal };
  } catch (error) { session.disposeWithoutClosing(); throw error; }
}
function capturedObjective(workspace: string, id: string) {
  assertDirectory(workspace);
  const path = objectivePath(workspace, id), previous = captureOrgPairs([path]);
  const body = orgPairBytes(previous, path), signature = orgPairBytes(previous, `${path}.sig`);
  const assertAdmission = () => {
    if (body === null ? signature !== null : signature === null || !verifyAuditorSignatureBytes(workspace, "BUNDLE", body, signature).valid)
      throw new Error("Objective record signature is missing or not admitted; unsigned edits are refused.");
  };
  assertAdmission();
  const record = body === null ? null : objectiveSchema.parse(parseCanonicalJson(body));
  if (record !== null && record.id !== id) throw new Error("Signed objective identity differs from its requested id.");
  const binding = objectiveBinding(workspace, id);
  if ((body === null ? null : sha256Hex(body)) !== (binding?.recordSha256 ?? null)
    || (record?.revision ?? null) !== (binding?.revision ?? null) || (record?.ownerPrincipal ?? null) !== (binding?.ownerPrincipal ?? null))
    throw new Error("Objective signed record does not match its authenticated revision journal; replay, deletion or incomplete publication is refused.");
  assertOrgPairsCurrent(previous);
  return { path, previous, record, binding, assertAdmission };
}
/** Verify the captured exact body and sidecar together; an absent record does not authorize execution. */
export function readObjective(workspace: string, id: string): ObjectiveRecord | null {
  return capturedObjective(resolve(workspace), id).record;
}
function scopeDigest(schedule: Schedule): string { return sha256Hex(canonicalize(schedule.scope ?? null)); }
/** A durable objective never acquires a new owner or wider definition from mutable operational state. */
export function assertObjectiveSchedule(record: ObjectiveRecord, schedule: Schedule): void {
  if (schedule.objective === undefined || record.ownerPrincipal !== schedule.objective.ownerPrincipal)
    throw new Error("Objective owner does not match the signed schedule owner.");
  if (record.id !== schedule.id || record.scheduleId !== schedule.id || record.objective !== schedule.goal
    || record.maxRounds !== schedule.maxRounds || record.scopeDigest !== scopeDigest(schedule)
    || record.completionCheckDigest !== sha256Hex(canonicalize(schedule.objective.completionCheck)))
    throw new Error("Signed schedule definition changed; an owner must explicitly edit and resume the objective.");
}
function scheduleSelection(workspace: string, id: string, digest: string) {
  const read = readSchedules(workspace);
  if (!read.ok) throw new Error(read.reason);
  if (read.digest !== digest) throw new Error("Signed schedule configuration digest changed; review before changing the objective.");
  const schedule = read.schedules.find(row => row.id === id);
  if (schedule?.objective === undefined) throw new Error("A signed schedule with a configured objective owner and completion check is required.");
  const path = schedulesPath(workspace), previous = captureOrgPairs([path]), body = orgPairBytes(previous, path), signature = orgPairBytes(previous, `${path}.sig`);
  if (body === null || signature === null || sha256Hex(body) !== digest || !verifyAuditorSignatureBytes(workspace, "BUNDLE", body, signature).valid)
    throw new Error("Signed schedule configuration changed during objective admission.");
  return { schedule, previous, assertCurrent() {
    assertOrgPairsCurrent(previous);
    if (!verifyAuditorSignatureBytes(workspace, "BUNDLE", body, signature).valid) throw new Error("Signed objective schedule is no longer admitted.");
  } };
}
function assertRevision(record: ObjectiveRecord | null, expected: number | "absent"): void {
  if (expected === "absent" ? record !== null : !Number.isSafeInteger(expected) || expected < 1 || record?.revision !== expected)
    throw new Error("Objective revision changed; review the signed record before retrying.");
}
function assertSigning(workspace: string): void {
  if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize objective signing");
  assertScheduleOwner(workspace);
  assertDirectory(workspace);
}
function assertNoClaim(workspace: string, id: string): void {
  if (interruptedClaims(workspace).some(row => row.scheduleId === id)) throw new Error("Objective has an active or interrupted schedule claim; close it before edit or resume.");
}
/** An absent operational claim is never evidence that a signed unresolved child stopped. */
function priorRoundClosure(workspace: string, record: ObjectiveRecord): string {
  const round = record.currentRound;
  if (round === null) return "no-unresolved-round";
  const history = loadSessionEventHistory({ workspace });
  const rows = history.events, meta = (row: (typeof rows)[number]) => JSON.parse(row.meta_json) as Record<string, unknown>;
  const claims = rows.filter(row => row.event_type === "audit" && meta(row).type === "native_schedule_claimed"
    && meta(row).scheduleId === record.scheduleId && meta(row).claimId === round.claimId);
  if (claims.length !== 1) throw new Error("Unresolved objective round has no unique signed native claim closure authority.");
  const claim = claims[0]!, claimed = meta(claim), parentRows = rows.filter(row => row.session_id === claim.session_id);
  const parentOpen = parentRows[0]!, parentHead = parentRows.at(-1)!;
  if (claimed.parentSessionId !== claim.session_id || parentOpen.event_type !== "session/open"
    || meta(parentOpen).agentId !== record.ownerPrincipal || claimed.agentId !== record.ownerPrincipal
    || claimed.goalSha256 !== sha256Hex(record.objective) || claimed.maxRounds !== record.maxRounds
    || sha256Hex(canonicalize(claimed.scope)) !== record.scopeDigest
    || typeof claimed.schedulesDigest !== "string" || !/^[a-f0-9]{64}$/.test(claimed.schedulesDigest))
    throw new Error("Unresolved objective signed claim differs from its owner or exact definition.");
  const childRows = rows.filter(row => row.session_id === round.sessionId), childHead = childRows.at(-1);
  if (childRows.length > 0 && (childRows[0]!.event_type !== "session/open" || meta(childRows[0]!).agentId !== record.ownerPrincipal))
    throw new Error("Unresolved objective child belongs to another signed principal.");
  const settlements = parentRows.filter(row => {
    const value = meta(row);
    return row.event_type === "audit" && value.type === "native_schedule_execution_settled" && value.scheduleId === record.scheduleId
      && value.claimId === round.claimId && value.parentSessionId === claim.session_id && value.agentId === record.ownerPrincipal
      && value.schedulesDigest === claimed.schedulesDigest && Array.isArray(value.childSessionIds)
      && value.childSessionIds.filter(id => id === round.sessionId).length === 1;
  });
  const childRecord = history.sessions.find(session => session.session_id === round.sessionId);
  if (settlements.length === 1 && childHead?.event_type === "session/close" && readSessionWriter(childHead)?.state === "released"
    && childRecord !== undefined && childRecord.ended_ts !== null && childRecord.session_final_event_hash === childHead.event_hash
    && rows.indexOf(claim) < rows.indexOf(childRows[0]!) && rows.indexOf(childHead) < rows.indexOf(settlements[0]!))
    return canonicalize({ claim: claim.event_hash, parentHead: parentHead.event_hash, childHead: childHead.event_hash, settled: settlements[0]!.event_hash });

  const directory = join(workspace, ".amc", "schedule-closures");
  let names: string[];
  try {
    if (!lstatSync(directory).isDirectory()) throw new Error("Signed schedule closure storage must be a real directory.");
    names = readdirSync(directory).filter(name => /^[a-f0-9-]{36}\.json$/.test(name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("Unresolved objective round has no authenticated closure; signed currentRound was preserved.");
    throw error;
  }
  const owner = readSessionWriter(claim);
  if (owner === null || owner.state !== "active") throw new Error("Unresolved objective claim lacks supported signed owner authority.");
  for (const name of names) {
    const path = join(directory, name), captured = captureOrgPairs([path]), body = orgPairBytes(captured, path), signature = orgPairBytes(captured, `${path}.sig`);
    if (body === null || signature === null || !verifyAuditorSignatureBytes(workspace, "BUNDLE", body, signature).valid)
      throw new Error("Interrupted schedule closure signature is not admitted.");
    const audit = JSON.parse(body.toString("utf8")) as Record<string, unknown>;
    if (audit.scheduleId !== record.scheduleId || audit.claimId !== round.claimId) continue;
    if (audit.auditType !== "NATIVE_SCHEDULE_CLOSE_INTERRUPTED" || audit.phase !== "authorized" || audit.reason !== "interrupted" || audit.ok !== false
      || audit.sourceEventId !== claim.id || audit.sourceEventHash !== claim.event_hash || audit.sessionId !== claim.session_id
      || audit.claimedConfigDigest !== claimed.schedulesDigest || canonicalize(audit.owner) !== canonicalize(owner))
      throw new Error("Interrupted objective closure differs from the exact signed claim source or owner nonce.");
    assertSessionOwnerAvailable(parentHead); // Released or demonstrably dead local owners only; no lease-age takeover.
    if (childHead !== undefined) assertSessionOwnerAvailable(childHead);
    else if (parentRows.some(row => row.event_type === "agent_delegation_started" && meta(row).childSessionId === round.sessionId))
      throw new Error("Unresolved objective child was announced but has no signed execution closure or owner evidence.");
    assertOrgPairsCurrent(captured);
    return canonicalize({ claim: claim.event_hash, parentHead: parentHead.event_hash, childHead: childHead?.event_hash ?? null,
      closure: name, closureSha256: sha256Hex(Buffer.concat([body, signature])) });
  }
  throw new Error("Unresolved objective round has no exact authenticated native closure; signed currentRound was preserved.");
}
interface Publication {
  readonly selected: ReturnType<typeof capturedObjective>;
  readonly record: ObjectiveRecord;
  readonly assertCurrent: () => void;
  readonly configDigest: string;
}
async function publish(workspace: string, planned: Publication): Promise<ObjectiveRecord> {
  const bytes = Buffer.from(canonicalize(objectiveSchema.parse(planned.record)));
  let binding = planned.selected.binding;
  const stable = () => { assertSigning(workspace); planned.selected.assertAdmission(); assertBinding(workspace, planned.record.id, binding); planned.assertCurrent(); };
  const prepared = await prepareOrgPairsAsync(workspace, [{ path: planned.selected.path, bytes }], {
    beforePublish: stable, assertInputsCurrent() { stable(); assertOrgPairsCurrent(planned.selected.previous); }
  }, planned.selected.previous);
  return withStoreLock(workspace, () => {
    stable(); assertOrgPairsCurrent(planned.selected.previous);
    binding = journalRevision(workspace, planned.record, sha256Hex(bytes), binding, planned.configDigest);
    stable(); prepared.publish(); prepared.assertCurrent();
    return structuredClone(planned.record);
  });
}

/** Human owner actions are CAS writes; edit always pauses and retains the lifetime round budget. */
export async function manageObjective(workspaceInput: string, id: string, expectedRevision: number | "absent", expectedSchedulesDigest: string,
  action: "create" | "edit" | "pause" | "resume", options: { beforePublish?: () => void } = {}): Promise<ObjectiveRecord> {
  const workspace = resolve(workspaceInput);
  const caller = options.beforePublish; caller?.();
  assertSigning(workspace); idSchema.parse(id); z.enum(["create", "edit", "pause", "resume"]).parse(action);
  const planned = withStoreLock(workspace, () => {
    const schedule = scheduleSelection(workspace, id, expectedSchedulesDigest), selected = capturedObjective(workspace, id);
    assertRevision(selected.record, expectedRevision);
    const old = selected.record;
    if (old !== null && old.ownerPrincipal !== schedule.schedule.objective!.ownerPrincipal) throw new Error("Objective owner differs from signed schedule owner; cross-owner edits are refused.");
    const closure = old?.currentRound != null && (action === "edit" || action === "resume") ? priorRoundClosure(workspace, old) : null;
    const claimGuard = () => {
      if (action !== "pause") assertNoClaim(workspace, id);
      if (closure !== null && old !== null && priorRoundClosure(workspace, old) !== closure)
        throw new Error("Unresolved objective closure changed while signing; no reconciliation was published.");
    };
    claimGuard();
    let record: ObjectiveRecord;
    if (action === "create") {
      if (old !== null || expectedRevision !== "absent") throw new Error("Objective create requires an absent signed record.");
      record = { version: 1, id, scheduleId: id, revision: 1, objective: schedule.schedule.goal,
        ownerPrincipal: schedule.schedule.objective!.ownerPrincipal, scopeDigest: scopeDigest(schedule.schedule),
        completionCheckDigest: sha256Hex(canonicalize(schedule.schedule.objective!.completionCheck)), maxRounds: schedule.schedule.maxRounds,
        status: "active", roundsUsed: 0, currentRound: null, lastRound: null };
    } else {
      if (old === null) throw new Error("Objective is absent; explicitly create it before changing its lifecycle.");
      if (action !== "edit") assertObjectiveSchedule(old, schedule.schedule);
      if (action === "resume" && old.status === "complete") throw new Error("A complete objective requires an explicit edit before resume.");
      if (action === "resume" && old.roundsUsed >= old.maxRounds) throw new Error("Objective round budget is exhausted; an owner must explicitly edit its ceiling.");
      if (action === "edit" && old.roundsUsed > schedule.schedule.maxRounds) throw new Error("Edited objective ceiling cannot discard rounds already used.");
      record = { ...old, revision: old.revision + 1,
        ...(action === "edit" ? { objective: schedule.schedule.goal, maxRounds: schedule.schedule.maxRounds, scopeDigest: scopeDigest(schedule.schedule),
          completionCheckDigest: sha256Hex(canonicalize(schedule.schedule.objective!.completionCheck)), status: "paused" as const, currentRound: null, lastRound: null } : { status: action === "pause" ? "paused" as const : "active" as const }),
        ...(action === "resume" ? { currentRound: null, lastRound: null } : {}) };
      if (action === "resume" || action === "edit") { delete record.lastStopReason; delete record.lastCheckStatus; }
    }
    return { selected, record, configDigest: expectedSchedulesDigest, assertCurrent: () => { caller?.(); schedule.assertCurrent(); claimGuard(); } };
  });
  return publish(workspace, planned);
}
function roundIdentity(authority: ObjectiveRoundAuthority) {
  return roundSchema.parse({ claimId: authority.claimId, round: authority.round, sessionId: authority.sessionId });
}
function sameRound(round: z.infer<typeof roundSchema> | null | undefined, authority: ObjectiveRoundAuthority): boolean {
  return round != null && round.claimId === authority.claimId && round.round === authority.round && round.sessionId === authority.sessionId;
}
function roundPlan(workspace: string, id: string, expectedRevision: number, authorityInput: ObjectiveRoundAuthority,
  change: (record: ObjectiveRecord, authority: ObjectiveRoundAuthority) => ObjectiveRecord): Publication {
  const authority = structuredClone(authorityInput);
  roundIdentity(authority);
  const selected = capturedObjective(workspace, id);
  assertRevision(selected.record, expectedRevision);
  if (selected.record === null) throw new Error("No signed objective authorizes this round.");
  const schedule = scheduleSelection(workspace, id, authority.configDigest);
  assertObjectiveSchedule(selected.record, schedule.schedule);
  const assertCurrent = () => { schedule.assertCurrent(); assertScheduleClaim(workspace, id, authority.claimId, authority.configDigest); };
  assertCurrent();
  return { selected, record: change(selected.record, authority), configDigest: authority.configDigest, assertCurrent };
}
/** Consume the total round budget durably before any delegated effect. Unknown prior rounds block another begin. */
export async function beginObjectiveRound(workspaceInput: string, id: string, expectedRevision: number, authority: ObjectiveRoundAuthority): Promise<ObjectiveRecord> {
  const workspace = resolve(workspaceInput); assertSigning(workspace);
  const planned = withStoreLock(workspace, () => roundPlan(workspace, id, expectedRevision, authority, (old, selected) => {
    if (old.status !== "active") throw new Error(`Objective is ${old.status}; only an explicit owner resume can activate it.`);
    if (old.currentRound !== null) throw new Error("Objective has an unsettled current round; reconcile it before another effect.");
    if (old.roundsUsed >= old.maxRounds || selected.round !== old.roundsUsed + 1) throw new Error("Objective round budget exhausted or next total round is not sequential.");
    return { ...old, revision: old.revision + 1, roundsUsed: selected.round, currentRound: roundIdentity(selected) };
  }));
  return publish(workspace, planned);
}
/** Only the exact current round can settle; a model claim cannot substitute for a successful configured check. */
export async function finishObjectiveRound(workspaceInput: string, id: string, expectedRevision: number, authority: ObjectiveRoundAuthority,
  status: "active" | "blocked" | "complete", stopReason: string, checkStatus: CheckStatus): Promise<ObjectiveRecord> {
  const workspace = resolve(workspaceInput); assertSigning(workspace); checkStatusSchema.parse(checkStatus); z.enum(["active", "blocked", "complete"]).parse(status);
  if (status === "complete" && checkStatus !== "complete") throw new Error("Objective completion requires a complete configured stop check.");
  const planned = withStoreLock(workspace, () => roundPlan(workspace, id, expectedRevision, authority, (old, selected) => {
    if (!sameRound(old.currentRound, selected)) throw new Error("Objective current round authority does not match this exact claim, round and session.");
    return { ...old, revision: old.revision + 1, status: old.status === "paused" ? "paused" : status,
      currentRound: null, lastRound: roundIdentity(selected), lastStopReason: stopReason.slice(0, 4096), lastCheckStatus: checkStatus };
  }));
  return publish(workspace, planned);
}
/** Block after a settled round, binding its exact authority; completion is only allowed through finishObjectiveRound. */
export async function stopObjective(workspaceInput: string, id: string, expectedRevision: number, authority: ObjectiveRoundAuthority,
  stopReason: string, checkStatus: CheckStatus): Promise<ObjectiveRecord> {
  const workspace = resolve(workspaceInput); assertSigning(workspace); checkStatusSchema.parse(checkStatus);
  const planned = withStoreLock(workspace, () => roundPlan(workspace, id, expectedRevision, authority, (old, selected) => {
    if (old.currentRound !== null || !sameRound(old.lastRound, selected)) throw new Error("Objective stop requires the exact last settled round authority.");
    if (old.status !== "active" && old.status !== "paused") throw new Error("Objective terminal state cannot be overwritten by another stop.");
    return { ...old, revision: old.revision + 1, status: old.status === "paused" ? "paused" : "blocked",
      lastStopReason: stopReason.slice(0, 4096), lastCheckStatus: checkStatus };
  }));
  return publish(workspace, planned);
}
