/** Native retained-output operator surface; registration/help never open a workspace. */
import type { Command } from "commander";
import { lstatSync, realpathSync, type Stats } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import type { EvidenceEvent, SessionRecord } from "./types.js";
import type { SessionStoreBackendId } from "./persistence/sessionEventStore.js";
import type { SpillInventory, SpillInventoryEntry, SpillEraseScope } from "./session/spill/spillLifecycle.js";
import { sha256Hex } from "./utils/hash.js";
import { canonicalize } from "./utils/json.js";

export interface SpillCliIo {
  log(line: string): void;
  error(line: string): void;
  fail(): void;
}
const defaultIo: SpillCliIo = {
  log: line => console.log(line), error: line => console.error(line),
  fail: () => { process.exitCode = 1; }
};
type Operation = "inventory" | "export" | "restore" | "erase";
interface Flags {
  workspace?: string; json?: boolean; expectMonitor?: string;
  out?: string; from?: string; event?: string[]; session?: string[];
  reason?: string; apply?: boolean; expectPlan?: string;
}
const INSPECT = "amc spill inventory --workspace /existing/workspace --json";
const REVIEW = 'amc spill erase --workspace /existing/workspace --session EXACT_SESSION_ID --reason "Reviewed local retention request" --json';
const CONCURRENCY = "Optimistic review only: not a lock, authorization credential, or transaction. Quiesce writers and retention externally; concurrent changes after review remain possible. No automatic retries.";

class SpillCommandError extends Error {
  constructor(readonly code: string, message: string, readonly repair: string,
    readonly context: Record<string, unknown> = {}) { super(message); }
}
function refuse(code: string, message: string, repair = INSPECT, context?: Record<string, unknown>): never {
  throw new SpillCommandError(code, message, repair, context);
}
function present(path: string): Stats | null {
  try { return lstatSync(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    return refuse("history-unreadable", "A required workspace path cannot be inspected. No history was accepted.");
  }
}
function requirePath(path: string, directory: boolean, label: string): Stats {
  const stat = present(path);
  if (!stat) refuse("history-missing", `${label} is missing; absence is not an empty verified history.`);
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())) {
    refuse("history-path-unsafe", `${label} must be a real ${directory ? "directory" : "regular file"}.`);
  }
  return stat;
}
function pathOption(value: string | undefined, name: string, repair: string): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) {
    refuse("invalid-option", `${name} requires a nonempty path.`, repair);
  }
  return value;
}
function digestOption(value: string | undefined, name: string): string | undefined {
  if (value !== undefined && !/^[a-f0-9]{64}$/.test(value)) {
    refuse("invalid-option", `${name} requires exactly 64 lowercase hexadecimal SHA-256 characters.`,
      name === "--expect-plan" ? `${REVIEW}; review the plan before supplying its exact planSha256 with --apply --expect-plan.`
        : `${INSPECT} --expect-monitor 'OUT_OF_BAND_MONITOR_SHA256'`);
  }
  return value;
}
function exactIds(values: string[] | undefined, name: string): string[] {
  if (values !== undefined && !Array.isArray(values)) refuse("invalid-option", `${name} must be repeated once per exact ID.`, REVIEW);
  for (const value of values ?? []) {
    if (typeof value !== "string" || !value || value !== value.trim() || /[\x00-\x1f\x7f]/.test(value)) {
      refuse("invalid-option", `${name} requires a nonempty exact ID, without surrounding whitespace or control characters.`, REVIEW);
    }
  }
  return [...new Set(values ?? [])].sort();
}
function validate(kind: Operation, flags: Flags) {
  const workspace = pathOption(flags.workspace ?? process.cwd(), "--workspace", INSPECT);
  const expectedMonitorFingerprint = digestOption(
    flags.expectMonitor ?? process.env.AMC_EXPECTED_MONITOR_FINGERPRINT, "--expect-monitor / AMC_EXPECTED_MONITOR_FINGERPRINT");
  const options = expectedMonitorFingerprint === undefined ? {} : { expectedMonitorFingerprint };
  const scope: SpillEraseScope = { eventIds: exactIds(flags.event, "--event"), sessionIds: exactIds(flags.session, "--session") };
  if (kind === "export") pathOption(flags.out, "--out", `${INSPECT.replace("inventory", "export")} --out /private/parent/new-export`);
  if (kind === "restore") pathOption(flags.from, "--from", `${INSPECT.replace("inventory", "restore")} --from /private/parent/export`);
  if (kind === "erase") {
    if (!scope.eventIds!.length && !scope.sessionIds!.length) refuse("empty-scope", "Erasure has no implicit all-workspace scope. Supply exact --event and/or --session IDs.", REVIEW);
    if (typeof flags.reason !== "string" || !flags.reason.trim() || flags.reason.length > 2048 || flags.reason.includes("\0")) {
      refuse("invalid-reason", "--reason requires nonempty text of at most 2048 characters, without NUL. Use a non-sensitive audit reason.", REVIEW);
    }
    digestOption(flags.expectPlan, "--expect-plan");
    if (flags.apply && flags.expectPlan === undefined) refuse("review-required", "--apply requires the exact reviewed --expect-plan digest.", REVIEW);
    if (!flags.apply && flags.expectPlan !== undefined) refuse("invalid-option", "--expect-plan is only meaningful with --apply. Omit both to review without writes.", REVIEW);
    if (flags.apply && process.env.AMC_NO_SIGN === "1") refuse("signing-required", "Unsigned mode cannot apply an erasure requiring signed intent and outcome.", `Use the normal signed operator environment; then ${REVIEW}`);
  }
  return { workspace, options, scope };
}

async function loadRuntime() {
  const [stores, lifecycle, trust, storage, evidence] = await Promise.all([
    import("./persistence/openSessionEventStore.js"), import("./session/spill/spillLifecycle.js"),
    import("./persistence/sessionStoreVerification.js"), import("./session/spill/spillStore.js"),
    import("./session/spill/spillEvidence.js")
  ]);
  return { stores, lifecycle, trust, storage, evidence };
}
type Runtime = Awaited<ReturnType<typeof loadRuntime>>;

/** The native read-only opener deliberately does not pin or police backend selection. */
function selectedBackend(workspace: string, runtime: Runtime): SessionStoreBackendId {
  requirePath(join(workspace, ".amc"), true, "Workspace .amc directory");
  const marker = join(workspace, ".amc", "session-store.json");
  const markerStat = present(marker);
  if (markerStat) requirePath(marker, false, "Session-store marker");
  const pinned = runtime.stores.readSessionStoreMarker(workspace);
  if (markerStat && pinned === null) refuse("history-marker-malformed", "Session-store marker is malformed or names an unsupported backend. No fallback was attempted.");
  const raw = process.env.AMC_SESSION_STORE;
  const requested = raw?.trim().toLowerCase();
  if (raw !== undefined && requested !== "sqlite" && requested !== "jsonl") {
    refuse("invalid-backend", "AMC_SESSION_STORE must explicitly name sqlite or jsonl, or be unset.", `env -u AMC_SESSION_STORE ${INSPECT}`);
  }
  if (pinned && requested && pinned !== requested) {
    refuse("backend-mismatch", "AMC_SESSION_STORE conflicts with this workspace's sticky backend. No other store was opened.",
      `env -u AMC_SESSION_STORE ${INSPECT}`, { pinnedBackend: pinned, requestedBackend: requested });
  }
  // A pre-spine SQLite ledger can legitimately lack a marker. A JSONL tree
  // without its marker is ambiguous, including when an unrelated SQLite ops DB exists.
  if (!pinned && (requested === "jsonl" || present(join(workspace, ".amc", "jsonl")))) {
    refuse("history-marker-missing", "JSONL history requires its existing reviewed session-store marker; backend authority is unknown.",
      `Restore the reviewed marker with its original history, without switching backends; then ${INSPECT}`);
  }
  const backend = pinned ?? "sqlite";
  if (backend === "sqlite") requirePath(join(workspace, ".amc", "evidence.sqlite"), false, "Selected SQLite history");
  else {
    requirePath(join(workspace, ".amc", "jsonl"), true, "Selected JSONL directory");
    requirePath(join(workspace, ".amc", "jsonl", "events.jsonl"), false, "Selected JSONL event history");
    requirePath(join(workspace, ".amc", "jsonl", "sessions.jsonl"), false, "Selected JSONL session history");
  }
  return backend;
}

function assertRows(events: readonly EvidenceEvent[]): void {
  if (!events.length) refuse("history-empty", "The selected store contains no events. Retained-output completeness cannot be established from an empty history.");
  const seen = new Set<string>();
  const fields = ["id", "session_id", "runtime", "event_type", "payload_sha256", "meta_json", "prev_event_hash", "event_hash", "writer_sig"] as const;
  for (const event of events) {
    if (!event || fields.some(field => typeof event[field] !== "string" || !event[field]) || !Number.isFinite(event.ts)) {
      refuse("history-malformed", "The selected store contains an incomplete or malformed evidence row.");
    }
    if (seen.has(event.id)) refuse("history-duplicate-event", "The selected history contains duplicate event IDs.", INSPECT, { eventIds: [event.id] });
    seen.add(event.id);
  }
}
function loadHistory(workspacePath: string, options: { expectedMonitorFingerprint?: string }, runtime: Runtime) {
  let workspace: string;
  try { workspace = realpathSync(resolve(workspacePath)); }
  catch { return refuse("workspace-missing-or-unreadable", "Select an existing readable workspace; this command never initializes one."); }
  requirePath(workspace, true, "Selected workspace");
  const backend = selectedBackend(workspace, runtime);
  const store = runtime.stores.openSessionEventStore(workspace, backend, { readOnly: true });
  try {
    const events = store.readAllEvents(); // Never readSessionEvents or a display-filtered subset.
    assertRows(events);
    const records: SessionRecord[] = [];
    for (const id of new Set(events.map(event => event.session_id))) {
      const record = store.readSessionRecord(id);
      if (!record || record.session_id !== id || !Number.isFinite(record.started_ts)
        || typeof record.runtime !== "string" || typeof record.binary_path !== "string" || typeof record.binary_sha256 !== "string"
        || (record.ended_ts !== null && !Number.isFinite(record.ended_ts))
        || (record.session_final_event_hash !== null && typeof record.session_final_event_hash !== "string")
        || (record.session_seal_sig !== null && typeof record.session_seal_sig !== "string")) {
        refuse("history-session-gap", "An event's session lifecycle record is missing or malformed.", INSPECT, { sessionIds: [id] });
      }
      records.push(record);
    }
    const errors: string[] = [];
    const trust = runtime.trust.verifyMonitorTrustRoot(workspace, options.expectedMonitorFingerprint ?? null, errors);
    if (errors.length || trust.monitorFingerprint === null) {
      refuse("monitor-trust-unavailable-or-mismatched", "The monitor public trust root is missing or does not match the supplied out-of-band pin.",
        `${INSPECT} --expect-monitor 'OUT_OF_BAND_MONITOR_SHA256'`);
    }
    // Authenticate even rows with no spill key: removing that key from unsigned
    // metadata must not make a retained object silently disappear from inventory.
    // This reuses the native keyless row validator, not the decrypting whole-log verifier.
    for (const event of events) {
      if (runtime.evidence.spillLifecycleEventAuthenticityError(workspace, event, options) !== null) {
        refuse("history-row-unauthentic", "A stored evidence row failed native authentication. No filtered history was substituted.", INSPECT,
          { eventIds: [event.id], sessionIds: [event.session_id] });
      }
    }
    return { workspace, backend, events, trust, historySha256: sha256Hex(canonicalize({ events, records })) };
  } finally { store.close(); }
}
type History = ReturnType<typeof loadHistory>;

const DETAILS: Record<string, string> = {
  retained: "Signed ciphertext framing and digest checked; plaintext and key availability unknown.",
  missing: "Referenced object is absent; a named retained-output gap.",
  unretrievable: "The signed reference records unavailable bytes; private reason text is not printed.",
  "legacy-plaintext": "Legacy reference; native inventory does not read or establish existence of its plaintext object.",
  tampered: "Object integrity or path safety failed; do not treat this entry as verified.",
  exported: "Ciphertext copied; no decryption performed.",
  "legacy-excluded": "Legacy plaintext excluded from encrypted transport.",
  restored: "Ciphertext published against destination signed evidence; no decryption performed.",
  "not-in-export": "Destination reference has no matching transport entry.",
  removed: "Native lifecycle removed the selected local referenced object.",
  failed: "Native operation failed for this object; private error details are suppressed."
};
function publicEntry(entry: SpillInventoryEntry) {
  return { locator: entry.locator, eventIds: entry.eventIds, sessionIds: entry.sessionIds,
    status: entry.status, referenceVersion: entry.ref.v, detail: DETAILS[entry.status] };
}
function problems(inventory: SpillInventory, history: History) {
  return inventory.errors.map(error => ({
    code: error.includes("conflicting") ? "conflicting-references-or-event-identities" : "reference-authentication-or-object-integrity-failed",
    eventIds: history.events.filter(event => error.startsWith(`${event.id}:`)).map(event => event.id),
    detail: "Native inventory refused this evidence or object. Raw metadata/error text is suppressed."
  }));
}
function summary(history: History, inventory: SpillInventory) {
  return { workspace: history.workspace, backend: history.backend, eventCount: history.events.length,
    historySha256: history.historySha256, historyRead: "all-available-selected-store-events",
    chainVerification: "not-performed", eventAuthentication: "individual-rows-only",
    referenceVerification: inventory.ok ? "authenticated" : "failed-or-incomplete",
    monitorTrust: { ...history.trust, assurance: history.trust.anchored ? "out-of-band-pin-matched" : "workspace-consistency-only" },
    contentVerification: "not-decrypted", plaintextVerified: false,
    retainedOutputComplete: inventory.ok && inventory.entries.every(entry => entry.status === "retained"),
    entries: inventory.entries.map(publicEntry), errors: problems(inventory, history) };
}
function requireInventory(inventory: SpillInventory, history: History): void {
  if (!inventory.ok) refuse("inventory-refused", "Native inventory found unauthentic, conflicting, or tampered evidence. No mutation was started.",
    INSPECT, { inventory: summary(history, inventory) });
}

/** Metadata only, for optimistic review (especially v1, whose bytes are never read).
 * Native lifecycle/storage remain the authority for integrity, transport and unlink.
 */
function reviewObjectState(history: History, entry: SpillInventoryEntry, runtime: Runtime) {
  if (entry.locator === null) return { state: "unretrievable", components: [] };
  const path = runtime.storage.resolveSpillPath(history.workspace, entry.locator);
  if (path === null) return refuse("invalid-plan-locator", "Native storage could not resolve a selected reference.", REVIEW);
  let cursor = history.workspace;
  const parts = relative(history.workspace, path).split(sep);
  const components: Record<string, unknown>[] = [];
  for (const [index, part] of parts.entries()) {
    cursor = join(cursor, part);
    const stat = present(cursor);
    if (!stat) return { state: "missing", components, missingComponent: index };
    const last = index === parts.length - 1;
    if (stat.isSymbolicLink() || (last ? !stat.isFile() : !stat.isDirectory())) {
      refuse("unsafe-plan-path", "A selected object's path contains a link or unsupported file type. No erasure plan is accepted.", REVIEW);
    }
    components.push({ dev: stat.dev, ino: stat.ino, mode: stat.mode, uid: stat.uid, nlink: stat.nlink,
      ...(last ? { size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs } : {}) });
  }
  return { state: "present", components };
}
function erasePlan(history: History, inventory: SpillInventory, scope: SpillEraseScope, reason: string, runtime: Runtime) {
  requireInventory(inventory, history);
  const rows = new Map(history.events.map(event => [event.id, event]));
  const events = new Set(scope.eventIds), sessions = new Set(scope.sessionIds);
  for (const id of events) if (!rows.has(id)) refuse("unknown-event-scope", "An exact event ID is outside the supplied full history.", REVIEW, { eventIds: [id] });
  for (const id of sessions) if (!history.events.some(event => event.session_id === id)) {
    refuse("unknown-session-scope", "An exact session ID is outside the supplied full history.", REVIEW, { sessionIds: [id] });
  }
  const selected = (id: string) => events.has(id) || sessions.has(rows.get(id)!.session_id);
  const entries = inventory.entries.filter(entry => entry.eventIds.some(selected));
  for (const entry of entries) {
    if (!entry.eventIds.every(selected)) refuse("outside-scope-reference", "A selected object has signed origins outside the exact scope. Include every commitment/result reference or its exact session.",
      REVIEW, { locator: entry.locator, eventIds: entry.eventIds, sessionIds: entry.sessionIds,
        outsideScopeEventIds: entry.eventIds.filter(id => !selected(id)) });
  }
  if (!entries.length) refuse("no-selected-objects", "The exact scope selects no authenticated spill objects. No empty erasure audit will be written.", REVIEW);
  const states = entries.map(entry => reviewObjectState(history, entry, runtime));
  const reasonSha256 = sha256Hex(reason);
  const planSha256 = sha256Hex(canonicalize({ format: "amc-spill-erasure-plan-v1", workspace: history.workspace,
    backend: history.backend, historySha256: history.historySha256, trust: history.trust, scope,
    reasonSha256, entries, states }));
  return { planSha256, scope, reasonSha256,
    selectedObjects: entries.map((entry, index) => ({ ...publicEntry(entry), filesystemState: states[index] })),
    localScope: "local-referenced-spill-objects-only", concurrency: CONCURRENCY,
    auditPreflight: "Native apply enforces the configured signed-audit payload bound; an oversized selection requires a smaller exact batch." };
}

function nativeFailure(error: unknown, phase: string): SpillCommandError {
  if (error instanceof SpillCommandError) return error;
  const text = error instanceof Error ? error.message : "";
  if (text.includes("selection exceeds the signed audit payload limit")) {
    return new SpillCommandError("audit-selection-too-large", "Spill erasure selection exceeds the signed audit payload limit; select a smaller batch of exact event IDs.",
      `Select one locator and ALL its signed origin event IDs; review a new plan: ${REVIEW}`);
  }
  if (text.includes("not authorized by destination signed rows")) {
    return new SpillCommandError("transport-not-authorized", "Transport entries do not match the destination's existing authenticated evidence.",
      `Restore the correct signed evidence and public trust history separately; then ${INSPECT}`);
  }
  return new SpillCommandError(`${phase}-failed`, `The native ${phase} operation failed. No successful completion is established; private exception text is suppressed.`,
    `Inspect the selected workspace, file permissions, integrity and signed audit state. Do not automatically retry mutations. Start with ${INSPECT}`);
}
function emit(io: SpillCliIo, json: boolean | undefined, report: Record<string, unknown>, failed: boolean) {
  const text = JSON.stringify(report, null, 2);
  // JSON quoting also prevents origin IDs and operator paths becoming terminal escapes.
  io.log(json ? text : `Retained-output ${String(report.command)}: ${String(report.status)}\n${text}`);
  if (failed) io.fail();
}

async function execute(kind: Operation, flags: Flags, io: SpillCliIo): Promise<void> {
  let phase = "options", mutationAttempted = false;
  try {
    const config = validate(kind, flags);
    phase = "runtime-load";
    const runtime = await loadRuntime();
    phase = "history-read";
    const history = loadHistory(config.workspace, config.options, runtime); // Resources close before any lifecycle mutation.
    phase = "inventory";
    const input = { workspace: history.workspace, events: history.events, options: config.options };
    const inventory = runtime.lifecycle.inventorySessionSpills(input);
    const inspection = summary(history, inventory);
    // Mutation outcomes must not be mistaken for this earlier inventory snapshot.
    const common = { schemaVersion: 1, command: kind, workspace: history.workspace, backend: history.backend,
      plaintextVerified: false, inspection: { phase: kind === "inventory" ? "read-only" : "before-operation", ...inspection } };
    if (kind === "inventory") {
      const ok = inspection.retainedOutputComplete;
      emit(io, flags.json, { ...common, ok, status: !inventory.ok ? "failed" : ok ? "complete" : "incomplete", mutationAttempted: false }, !ok);
      return;
    }
    requireInventory(inventory, history);
    if (kind === "erase") {
      const plan = erasePlan(history, inventory, config.scope, flags.reason!, runtime);
      if (!flags.apply) {
        emit(io, flags.json, { ...common, ok: inspection.retainedOutputComplete,
          status: inspection.retainedOutputComplete ? "planned" : "planned-with-gaps", operation: "read-only-plan",
          mutationAttempted: false, plan }, !inspection.retainedOutputComplete);
        return;
      }
      if (plan.planSha256 !== flags.expectPlan) {
        refuse("stale-plan", "The supplied review digest does not match fresh full history, scope, reason and object states. No erasure was attempted.",
          `Run and review a new read-only plan, not an automatic retry: ${REVIEW}`);
      }
      phase = "erase"; mutationAttempted = true;
      const result = runtime.lifecycle.eraseSessionSpills({ ...input, scope: config.scope, reason: flags.reason! });
      const ok = result.ok && result.entries.every(entry => entry.status === "removed");
      emit(io, flags.json, { ...common, ok, status: ok ? "complete" : "incomplete", mutationAttempted, planSha256: plan.planSha256,
        auditEventIds: result.auditEventIds, auditStore: "workspace-sqlite-operations-ledger", concurrency: CONCURRENCY,
        outcomes: result.entries.map(entry => ({ locator: entry.locator, eventIds: entry.eventIds,
          status: entry.status, detail: DETAILS[entry.status] ?? DETAILS.failed })) }, !ok);
      return;
    }
    phase = kind; mutationAttempted = true;
    if (kind === "export") {
      const destination = resolve(flags.out!);
      const result = runtime.lifecycle.exportSessionSpills({ ...input, destination });
      const ok = result.entries.every(entry => entry.status === "exported");
      emit(io, flags.json, { ...common, ok, status: ok ? "complete" : "incomplete", mutationAttempted,
        destination, transportFormat: result.format,
        outcomes: result.entries.map(entry => ({ locator: entry.locator, eventIds: entry.eventIds, sessionIds: entry.sessionIds,
          status: entry.status, objectFile: entry.objectFile, encodedSha256: entry.encodedSha256,
          detail: DETAILS[entry.status] ?? DETAILS.failed })),
        note: "Useful completed transport is preserved even when entries are excluded or missing. It contains no keys or decrypted output." }, !ok);
    } else {
      const source = resolve(flags.from!);
      const result = runtime.lifecycle.restoreSessionSpills({ ...input, source });
      const ok = result.ok && result.entries.every(entry => entry.status === "restored");
      emit(io, flags.json, { ...common, ok, status: ok ? "complete" : "incomplete", mutationAttempted, source,
        outcomes: result.entries.map(entry => ({ locator: entry.locator, status: entry.status, detail: DETAILS[entry.status] ?? DETAILS.failed })),
        note: "Destination evidence, not the transport index, authorizes restoration. No overwrite, decryption or automatic retry." }, !ok);
    }
  } catch (error) {
    const problem = nativeFailure(error, phase);
    emit(io, flags.json, { schemaVersion: 1, command: kind, ok: false, status: mutationAttempted ? "failed" : "refused",
      mutationAttempted, mutationState: mutationAttempted ? "unknown-possibly-partial" : "not-started", plaintextVerified: false,
      error: { code: problem.code, message: problem.message, repair: problem.repair, ...problem.context },
      ...(mutationAttempted ? { note: "A native operation was entered. Files or signed intent may already exist, and final audit signing may have failed after removal. Inspect actual outcomes before any deliberate new attempt." } : {}) }, true);
  }
}

/** Root owns adding this single registration call to src/cli.ts. */
export function registerSpillCommands(program: Command, io: SpillCliIo = defaultIo): void {
  const group = program.command("spill").description("Inventory, transport and deliberately erase native retained output")
    .showHelpAfterError(`Example: ${INSPECT}`);
  const descriptions: Record<Operation, string> = {
    inventory: "Read all selected session evidence and inventory ciphertext without decrypting",
    export: "Export authenticated ciphertext to a new directory, retaining explicit gaps",
    restore: "Restore ciphertext against this destination's existing signed evidence",
    erase: "Plan exact local erasure read-only; apply only an unchanged reviewed plan"
  };
  const collect = (value: string, previous: string[] = []) => [...previous, value];
  for (const kind of ["inventory", "export", "restore", "erase"] as const) {
    const command = group.command(kind).description(descriptions[kind]).allowExcessArguments(false)
      .option("--workspace <path>", "existing workspace (default: current directory at invocation)")
      .option("--json", "structured report, including failures and named gaps")
      .option("--expect-monitor <sha256>", "out-of-band monitor public-key pin (otherwise AMC_EXPECTED_MONITOR_FINGERPRINT)")
      .showHelpAfterError(`Example: ${kind === "erase" ? REVIEW : kind === "export"
        ? `${INSPECT.replace("inventory", "export")} --out /private/parent/new-export`
        : kind === "restore" ? `${INSPECT.replace("inventory", "restore")} --from /private/parent/export` : INSPECT}`);
    if (kind === "export") command.option("--out <new-directory>", "new transport directory; existing private parent required, no overwrite");
    if (kind === "restore") command.option("--from <directory>", "existing native ciphertext export directory");
    if (kind === "erase") command
      .option("--event <id>", "exact origin event ID; repeat to include paired commitments/results", collect)
      .option("--session <id>", "exact origin session ID; repeat for an explicit union", collect)
      .option("--reason <text>", "non-sensitive signed audit reason, at most 2048 characters")
      .option("--apply", "mutate only after recomputing and matching the reviewed plan")
      .option("--expect-plan <sha256>", "exact planSha256 from a separately reviewed read-only plan");
    command.action(async (flags: Flags) => { await execute(kind, flags, io); });
  }
}
