import { constants, closeSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { EvidenceEvent } from "../../types.js";
import { appendOpsAuditEvent } from "../../ops/audit.js";
import { loadOpsPolicy } from "../../ops/policy.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import { createSpillReferenceAuthenticator, type SpillRetrievalOptions } from "./spillEvidence.js";
import { inspectSpillObject, removeSpillObject, restoreSpillObject } from "./spillStore.js";
import { isSpillRef, type SpillRef } from "./spillTypes.js";
import { validateSpillEnvelope } from "./spillEncryption.js";
import { withDeletionGate, DeletionDenied } from "../../residency/deletionGate.js";

export type SpillInventoryStatus = "retained" | "missing" | "unretrievable" | "legacy-plaintext" | "tampered";
export interface SpillInventoryEntry {
  readonly locator: string | null;
  readonly ref: SpillRef;
  readonly eventIds: readonly string[];
  readonly sessionIds: readonly string[];
  readonly status: SpillInventoryStatus;
  readonly detail: string | null;
}
export interface SpillInventory {
  readonly ok: boolean;
  readonly entries: readonly SpillInventoryEntry[];
  readonly errors: readonly string[];
  /** Ciphertext integrity is checked without asking for a decryption key. */
  readonly contentVerification: "not-decrypted";
}
export interface SpillLifecycleInput {
  readonly workspace: string;
  /** Supply the complete applicable history, not just rows selected for erasure. */
  readonly events: readonly EvidenceEvent[];
  readonly options?: SpillRetrievalOptions;
}
export interface SpillReferenceInventory {
  readonly ok: boolean;
  readonly entries: readonly Omit<SpillInventoryEntry, "status" | "detail">[];
  readonly errors: readonly string[];
}
interface PendingEntry { ref: SpillRef; eventIds: Set<string>; sessionIds: Set<string> }
function entryKey(ref: SpillRef, eventId: string): string { return ref.locator ?? `event:${eventId}`; }
function freezeRef(ref: SpillRef): SpillRef { return Object.freeze(JSON.parse(JSON.stringify(ref)) as SpillRef); }

/** Authenticate and reconcile every supplied reference without reading object files. */
export function inventorySessionSpillReferences(input: SpillLifecycleInput): SpillReferenceInventory {
  const pending = new Map<string, PendingEntry>(), errors: string[] = [], seenRows = new Map<string, string>();
  const authenticate = createSpillReferenceAuthenticator(input.workspace, input.options);
  for (const event of input.events) {
    const binding = `${event.session_id}:${event.event_hash}:${event.writer_sig}`;
    const previous = seenRows.get(event.id);
    if (previous !== undefined && previous !== binding) errors.push(`${event.id}: conflicting signed event identities`);
    seenRows.set(event.id, binding);
    let authentication;
    try { authentication = authenticate(event); }
    catch (error) { errors.push(`${event.id}: spill authentication failed: ${String(error)}`); continue; }
    if (authentication.status === "not-spilled") continue;
    if (authentication.status !== "ok" || authentication.ref === null) {
      errors.push(`${event.id}: ${authentication.status}: ${authentication.detail ?? "no authenticated spill reference"}`);
      continue;
    }
    const ref = freezeRef(authentication.ref);
    const key = entryKey(ref, event.id), existing = pending.get(key);
    if (existing && canonicalize(existing.ref) !== canonicalize(ref)) {
      errors.push(`${event.id}: conflicting signed spill references for ${ref.locator}`); continue;
    }
    const entry = existing ?? { ref, eventIds: new Set<string>(), sessionIds: new Set<string>() };
    entry.eventIds.add(event.id); entry.sessionIds.add(event.session_id); pending.set(key, entry);
  }
  const entries = errors.length > 0 ? [] : [...pending.values()].map(entry => Object.freeze({
    locator: entry.ref.locator, ref: entry.ref,
    eventIds: Object.freeze([...entry.eventIds].sort()), sessionIds: Object.freeze([...entry.sessionIds].sort())
  }));
  return Object.freeze({ ok: errors.length === 0, entries: Object.freeze(entries), errors: Object.freeze(errors) });
}

/** Authenticate every candidate before allowing a selection to hide conflicts. No plaintext is read. */
export function inventorySessionSpills(input: SpillLifecycleInput): SpillInventory {
  const references = inventorySessionSpillReferences(input);
  const errors = [...references.errors];
  const entries: SpillInventoryEntry[] = [];
  // Do not even inspect files when row authentication or conflict detection failed.
  if (errors.length === 0) {
    for (const entry of references.entries) {
      const inspected = inspectSpillObject(input.workspace, entry.ref, input.options?.root);
      const status: SpillInventoryStatus = inspected.status === "ok" ? "retained"
        : inspected.status === "invalid-locator" ? "tampered" : inspected.status;
      if (status === "tampered") errors.push(`${entry.ref.locator}: ${inspected.detail}`);
      entries.push(Object.freeze({ locator: entry.ref.locator, ref: entry.ref,
        eventIds: Object.freeze([...entry.eventIds].sort()), sessionIds: Object.freeze([...entry.sessionIds].sort()),
        status, detail: inspected.detail }));
    }
  }
  return Object.freeze({ ok: errors.length === 0, entries: Object.freeze(entries), errors: Object.freeze(errors),
    contentVerification: "not-decrypted" as const });
}
function requireInventory(input: SpillLifecycleInput): SpillInventory {
  const inventory = inventorySessionSpills(input);
  if (!inventory.ok) throw new Error(`Spill lifecycle refused: ${inventory.errors.join("; ")}`);
  return inventory;
}

export interface SpillEraseScope { readonly eventIds?: readonly string[]; readonly sessionIds?: readonly string[] }
export interface SpillEraseEntry { readonly locator: string | null; readonly eventIds: readonly string[]; readonly status: "removed" | "missing" | "unretrievable" | "failed" | "held" | "hold_unknown"; readonly detail: string | null }
export interface SpillEraseResult { readonly ok: boolean; readonly entries: readonly SpillEraseEntry[]; readonly auditEventIds: readonly string[] }
function exactIds(values: readonly string[] | undefined, label: string): Set<string> {
  if (values !== undefined && !Array.isArray(values)) throw new Error(`Spill erasure ${label} must be an array`);
  const ids = new Set<string>();
  for (const value of values ?? []) {
    if (typeof value !== "string" || value.length === 0 || value !== value.trim()) throw new Error(`Spill erasure requires exact nonempty ${label}`);
    ids.add(value);
  }
  return ids;
}

/** Local referenced objects only. This does not infer subjects or erase backup/remote copies. */
export function eraseSessionSpills(input: SpillLifecycleInput & { readonly scope: SpillEraseScope; readonly reason: string }): SpillEraseResult {
  input = { ...input, workspace: resolve(input.workspace) };
  const eventIds = exactIds(input.scope?.eventIds, "event IDs"), sessionIds = exactIds(input.scope?.sessionIds, "session IDs");
  if (eventIds.size + sessionIds.size === 0) throw new Error("Spill erasure requires an explicit event or session scope");
  if (typeof input.reason !== "string" || !input.reason.trim() || input.reason.length > 2048) throw new Error("Spill erasure requires a bounded reason");
  const inventory = requireInventory(input);
  const rows = new Map(input.events.map(row => [row.id, row]));
  for (const id of eventIds) if (!rows.has(id)) throw new Error(`Spill erasure event is outside supplied history: ${id}`);
  for (const id of sessionIds) if (!input.events.some(row => row.session_id === id)) throw new Error(`Spill erasure session is outside supplied history: ${id}`);
  const selected = (id: string) => eventIds.has(id) || sessionIds.has(rows.get(id)!.session_id);
  const entries = inventory.entries.filter(entry => entry.eventIds.some(selected));
  for (const entry of entries) {
    if (!entry.eventIds.every(selected)) throw new Error(`Spill erasure scope excludes another signed reference to ${entry.locator}`);
  }
  const auditEventIds: string[] = [], outcomes: SpillEraseEntry[] = [];
  // The signed intention must return before any object is unlinked. Its digest
  // binds the complete selection while keeping the audit payload bounded.
  const selectionSha256 = sha256Hex(canonicalize(entries.map(entry => ({ ref: entry.ref, eventIds: entry.eventIds }))));
  const finishedPayload = (intentionEventId: string, ok: boolean, items: readonly SpillEraseEntry[]) => ({
    intentionEventId, selectionSha256, ok, outcomes: items, outcomeSha256: sha256Hex(canonicalize(items)),
    scope: "local-referenced-spill-objects-only"
  });
  // A batch too large to record its exact outcomes must fail before deletion.
  // Error details are bounded below, so this is a conservative payload bound.
  const maximumOutcome = finishedPayload("x".repeat(128), false, entries.map(entry => ({
    locator: entry.locator, eventIds: entry.eventIds, status: "unretrievable" as const, detail: "\u0000".repeat(512)
  })));
  if (Buffer.byteLength(JSON.stringify({ auditType: "SESSION_SPILL_ERASURE_FINISHED", ...maximumOutcome }), "utf8")
    > loadOpsPolicy(input.workspace).opsPolicy.retention.maxPayloadBytesPerEvent) {
    throw new Error("Spill erasure selection exceeds the signed audit payload limit; select a smaller batch of exact event IDs");
  }
  const intention = appendOpsAuditEvent({ workspace: input.workspace, auditType: "SESSION_SPILL_ERASURE_INTENDED",
    payload: { reason: input.reason, eventIds: [...eventIds].sort(), sessionIds: [...sessionIds].sort(), selectionSha256,
      scope: "local-referenced-spill-objects-only", selectedObjects: entries.length } });
  auditEventIds.push(intention.eventId);
  for (const entry of entries) {
    if (entry.locator === null) {
      outcomes.push({ locator: null, eventIds: entry.eventIds, status: "unretrievable", detail: entry.ref.unretrievable?.slice(0, 512) ?? null }); continue;
    }
    try {
      const status = withDeletionGate({ workspace: input.workspace, executor: "spill-lifecycle.remove-object",
        target: { kind: "spills", sessionHashes: entry.sessionIds.map(id => sha256Hex(Buffer.from(id, "utf8"))) } },
        () => removeSpillObject(input.workspace, entry.ref, input.options?.root));
      outcomes.push({ locator: entry.locator, eventIds: entry.eventIds, status, detail: null });
    } catch (error) {
      const status = error instanceof DeletionDenied ? error.verdict.verdict === "held" ? "held" : "hold_unknown" : "failed";
      outcomes.push({ locator: entry.locator, eventIds: entry.eventIds, status, detail: String(error).slice(0, 512) });
    }
  }
  const ok = outcomes.every(entry => entry.status !== "failed" && entry.status !== "held" && entry.status !== "hold_unknown");
  const outcome = appendOpsAuditEvent({ workspace: input.workspace, auditType: "SESSION_SPILL_ERASURE_FINISHED",
    payload: finishedPayload(intention.eventId, ok, outcomes) });
  auditEventIds.push(outcome.eventId);
  return { ok, entries: outcomes, auditEventIds };
}

export interface SpillExportEntry {
  readonly locator: string | null;
  readonly ref: SpillRef;
  readonly eventIds: readonly string[];
  readonly sessionIds: readonly string[];
  readonly status: "exported" | "legacy-excluded" | "missing" | "unretrievable";
  readonly objectFile: string | null;
  readonly encodedSha256: string | null;
  readonly detail: string | null;
}
export interface SpillExportIndex {
  readonly format: "amc-spill-export-v1";
  readonly entries: readonly SpillExportEntry[];
  readonly contentVerification: "not-decrypted";
}
function objectFile(locator: string): string { return `objects/${sha256Hex(locator)}.blob`; }

function assertTransportDirectory(path: string): void {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Spill transport directory is not a real directory: ${path}`);
  if (process.platform !== "win32" && ((stat.mode & 0o022) !== 0 || (typeof process.getuid === "function" && stat.uid !== process.getuid()))) {
    throw new Error("Spill transport requires an operator-owned directory without group or other write access");
  }
}
/** Resolve the operator-selected root once, including ordinary /var or /tmp aliases. */
function selectedTransportDirectory(path: string): string {
  const root = realpathSync(resolve(path));
  assertTransportDirectory(root);
  return root;
}
/** Everything below that selected root must remain a real, operator-owned directory. */
function transportDirectory(path: string, root: string): string {
  const full = resolve(path), suffix = relative(root, full);
  if (isAbsolute(suffix) || suffix === ".." || suffix.startsWith(`..${sep}`)) throw new Error("Spill transport path escaped its selected root");
  assertTransportDirectory(root);
  let cursor = root;
  for (const part of suffix.split(sep).filter(Boolean)) {
    cursor = join(cursor, part);
    assertTransportDirectory(cursor);
  }
  return full;
}
function writeExclusive(path: string, bytes: Buffer): void {
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
}
function readTransportFile(path: string, maxBytes: number, root: string): Buffer {
  transportDirectory(dirname(path), root);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.nlink !== 1 || before.size > maxBytes) throw new Error("Spill transport file is not a bounded regular single-link object");
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (count === 0) throw new Error("Spill transport file was truncated while reading");
      offset += count;
    }
    const after = fstatSync(fd), named = lstatSync(path);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs
      || after.nlink !== 1 || named.dev !== after.dev || named.ino !== after.ino || named.isSymbolicLink()) throw new Error("Spill transport file changed while reading");
    return bytes;
  } finally { closeSync(fd); }
}

/** New directory only; the index is published last. Incomplete export never has a complete index. */
export function exportSessionSpills(input: SpillLifecycleInput & { readonly destination: string }): SpillExportIndex {
  const inventory = requireInventory(input), selected = resolve(input.destination);
  const parent = selectedTransportDirectory(dirname(selected)), destination = join(parent, basename(selected));
  mkdirSync(destination, { mode: 0o700 }); mkdirSync(join(destination, "objects"), { mode: 0o700 });
  const entries: SpillExportEntry[] = [];
  for (const entry of inventory.entries) {
    const common = { locator: entry.locator, ref: entry.ref, eventIds: entry.eventIds, sessionIds: entry.sessionIds };
    if (entry.ref.v === 1) {
      entries.push({ ...common, status: "legacy-excluded", objectFile: null, encodedSha256: null,
        detail: "Legacy plaintext is excluded; explicitly purge or separately migrate it before transport" }); continue;
    }
    const inspected = inspectSpillObject(input.workspace, entry.ref, input.options?.root);
    if (inspected.status === "missing" || inspected.status === "unretrievable") {
      entries.push({ ...common, status: inspected.status, objectFile: null, encodedSha256: null, detail: inspected.detail }); continue;
    }
    if (inspected.status !== "ok" || entry.locator === null) throw new Error(`Spill export refused changed object: ${inspected.detail}`);
    const file = objectFile(entry.locator);
    writeExclusive(join(destination, file), inspected.encoded);
    entries.push({ ...common, status: "exported", objectFile: file, encodedSha256: sha256Hex(inspected.encoded), detail: null });
  }
  const index: SpillExportIndex = { format: "amc-spill-export-v1", entries, contentVerification: "not-decrypted" };
  writeExclusive(join(destination, "index.json"), Buffer.from(JSON.stringify(index, null, 2), "utf8"));
  return index;
}

export interface SpillRestoreEntry { readonly locator: string | null; readonly status: "restored" | "legacy-excluded" | "missing" | "unretrievable" | "not-in-export" | "failed"; readonly detail: string | null }
export interface SpillRestoreResult { readonly ok: boolean; readonly entries: readonly SpillRestoreEntry[] }
function parseIndex(bytes: Buffer): SpillExportIndex {
  const value: unknown = JSON.parse(bytes.toString("utf8"));
  if (!value || typeof value !== "object") throw new Error("Invalid spill export index");
  const candidate = value as Record<string, unknown>;
  if (candidate.format !== "amc-spill-export-v1" || candidate.contentVerification !== "not-decrypted" || !Array.isArray(candidate.entries)) throw new Error("Unsupported spill export index");
  for (const raw of candidate.entries) {
    if (!raw || typeof raw !== "object") throw new Error("Invalid spill export entry");
    const entry = raw as Record<string, unknown>;
    if (!isSpillRef(entry.ref) || entry.locator !== entry.ref.locator
      || !Array.isArray(entry.eventIds) || !entry.eventIds.length || entry.eventIds.some(id => typeof id !== "string" || !id)
      || !Array.isArray(entry.sessionIds) || !entry.sessionIds.length || entry.sessionIds.some(id => typeof id !== "string" || !id)
      || (entry.detail !== null && typeof entry.detail !== "string")
      || !["exported", "legacy-excluded", "missing", "unretrievable"].includes(String(entry.status))) throw new Error("Invalid spill export entry shape");
    if (entry.status === "exported") {
      if (entry.ref.v !== 2 || entry.ref.locator === null || entry.objectFile !== objectFile(entry.ref.locator)
        || entry.encodedSha256 !== entry.ref.encodedSha256) throw new Error("Spill export object does not match its declared reference");
    } else if (entry.objectFile !== null || entry.encodedSha256 !== null) throw new Error("A spill gap must not name a transport object");
  }
  return value as SpillExportIndex;
}

/** The index is not an authority: destination signed rows must independently authorize every object. */
export function restoreSessionSpills(input: SpillLifecycleInput & { readonly source: string }): SpillRestoreResult {
  const inventory = requireInventory(input), source = selectedTransportDirectory(input.source);
  const index = parseIndex(readTransportFile(join(source, "index.json"), 16 * 1024 * 1024, source));
  const expected = new Map(inventory.entries.map(entry => [entryKey(entry.ref, entry.eventIds[0]!), entry]));
  const incoming = new Map<string, SpillExportEntry>();
  for (const entry of index.entries) {
    const key = entryKey(entry.ref, entry.eventIds[0]!), authorized = expected.get(key);
    if (incoming.has(key)) throw new Error("Duplicate spill export entry");
    if (!authorized || canonicalize(authorized.ref) !== canonicalize(entry.ref)
      || canonicalize(authorized.eventIds) !== canonicalize(entry.eventIds)
      || canonicalize(authorized.sessionIds) !== canonicalize(entry.sessionIds)) throw new Error("Spill export entry is not authorized by destination signed rows");
    incoming.set(key, entry);
  }
  // Validate every incoming ciphertext before publishing any of them, retaining
  // at most one object's bytes. Storage revalidates on exclusive publication.
  for (const entry of incoming.values()) {
    if (entry.status !== "exported") continue;
    if (entry.ref.v !== 2 || entry.ref.encodedBytes === null) throw new Error("Missing signed encoded byte limit");
    const bytes = readTransportFile(join(source, entry.objectFile!), entry.ref.encodedBytes, source);
    validateSpillEnvelope(entry.ref, bytes);
  }
  const outcomes: SpillRestoreEntry[] = [];
  for (const [key, entry] of expected) {
    const supplied = incoming.get(key);
    if (!supplied) { outcomes.push({ locator: entry.locator, status: "not-in-export", detail: "No transport entry for this authenticated reference" }); continue; }
    if (supplied.status !== "exported") { outcomes.push({ locator: entry.locator, status: supplied.status, detail: supplied.detail }); continue; }
    try {
      if (entry.ref.v !== 2 || entry.ref.encodedBytes === null) throw new Error("Missing signed encoded byte limit");
      const bytes = readTransportFile(join(source, supplied.objectFile!), entry.ref.encodedBytes, source);
      restoreSpillObject(input.workspace, entry.ref, bytes, input.options?.root);
      outcomes.push({ locator: entry.locator, status: "restored", detail: null });
    } catch (error) { outcomes.push({ locator: entry.locator, status: "failed", detail: String(error) }); }
  }
  return { ok: outcomes.every(entry => entry.status === "restored"), entries: outcomes };
}
