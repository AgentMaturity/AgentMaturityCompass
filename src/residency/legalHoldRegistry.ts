import { randomUUID } from "node:crypto";
import { chmodSync, closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readSync, readdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { loadActiveCompiledPolicy } from "../catalog/compiler/activate.js";
import { ensureSigningKeys, getPublicKeyHistory, verifyHexDigestAny } from "../crypto/keys.js";
import { artifactSigPath, readAndVerifyArtifactFileSignature, signArtifactBytes, verifyArtifactBytesSignature } from "../lifecycle/artifactSignature.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { appendSignedControlJournal, readSignedControlJournal, SignedControlJournalError,
  type SignedControlJournalSnapshot } from "../lifecycle/signedControlJournal.js";
import { getMode } from "../mode/mode.js";
import { appendOpsAuditEvent } from "../ops/audit.js";
import { writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { loadDestinationRegistrySnapshot, loadPinnedResidencyProfile } from "./destinationRegistry.js";
import { DELETION_TARGET_KINDS, type DeletionRequest, type HoldVerdict, type LegalHoldScopeV1, type LegalHoldV1 } from "./types.js";

const MAX_RECORD_BYTES = 65_536, MAX_RECORDS = 1024;
const term = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
const text = z.string().min(1).max(2048).refine(value => value === value.trim() && !/[\x00\r\n]/.test(value));
const timestamp = z.number().int().nonnegative().refine(Number.isSafeInteger);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const ids = z.array(term).max(1024).refine(values => new Set(values).size === values.length);
export const deletionTargetSchema = z.strictObject({ kind: z.enum(DELETION_TARGET_KINDS), sessionIds: ids.optional(),
  sessionHashes: z.array(digest).optional(), before: z.iso.datetime({ offset: true }).optional() });
export const legalHoldScopeSchema = z.strictObject({ tenantId: term, workspaceIds: ids, sessionIds: ids,
  dataKinds: z.array(z.enum(DELETION_TARGET_KINDS)).max(DELETION_TARGET_KINDS.length).refine(values => new Set(values).size === values.length) });
export const legalHoldSchema = z.strictObject({ schemaVersion: z.literal("amc.legal-hold/v1"), holdId: term, scope: legalHoldScopeSchema,
  reason: text, issuedBy: text, issuedTs: timestamp, expiresTs: timestamp.nullable(), active: z.boolean(),
  releasedTs: timestamp.nullable(), legacyRecordSha256: digest.nullable() }).superRefine((hold, context) => {
  if (hold.expiresTs !== null && hold.expiresTs <= hold.issuedTs) context.addIssue({ code: "custom", message: "expiry precedes issue" });
  if (hold.active !== (hold.releasedTs === null) || (hold.releasedTs !== null && hold.releasedTs < hold.issuedTs))
    context.addIssue({ code: "custom", message: "invalid release state" });
});
const legacyReleaseSchema = z.strictObject({ schemaVersion: z.literal("amc.legacy-hold-release/v1"), holdId: term,
  active: z.literal(false), legacyRecordSha256: digest, releasedTs: timestamp, acceptedBy: z.literal("owner") });
type LegacyRelease = z.infer<typeof legacyReleaseSchema>;
const modernSchema = z.union([legalHoldSchema, legacyReleaseSchema]);
const identitySchema = z.strictObject({ tenantId: term, workspaceId: term });
type Identity = z.infer<typeof identitySchema>;
// Read the original signed format, but never let profile or tenant-record revisions change the identity pair.
const oldIdentitySchema = identitySchema.extend({ sourceDigest: digest });
const headSchema = z.strictObject({ schemaVersion: z.literal("amc.legal-hold-head/v1"), workspacePathSha256: digest,
  identity: z.union([identitySchema, oldIdentitySchema]).nullable(), count: z.number().int().nonnegative().max(MAX_RECORDS),
  recordsDigest: digest, updatedTs: timestamp });
type Head = z.infer<typeof headSchema>;
const anchorSchema = z.strictObject({ count: z.number().int().nonnegative().max(MAX_RECORDS), recordsDigest: digest, identity: identitySchema.nullable() });
type Anchor = z.infer<typeof anchorSchema>;
const envelope = { prev_record_hash: z.string().min(1).max(128), record_hash: digest,
  signature: z.string().min(1).max(1024).regex(/^[A-Za-z0-9+/]+={0,2}$/), storedTs: timestamp };
const legacyHoldSchema = z.strictObject({ holdId: term, tenantId: term, reason: text, issuedBy: text, issuedTs: timestamp,
  expiresTs: timestamp.nullable(), active: z.boolean(), holdHash: digest, ...envelope }).refine(hold => hold.expiresTs === null || hold.expiresTs > hold.issuedTs);
const legacyTenantSchema = z.strictObject({ tenantId: term, workspaceId: term,
  region: z.enum(["us-east-1", "us-west-2", "eu-west-1", "eu-central-1", "ap-southeast-1", "ap-northeast-1", "custom"]),
  isolationLevel: z.enum(["strict", "shared", "federated"]), keyCustodyMode: z.enum(["local", "notary", "external-kms", "external-hsm"]),
  createdTs: timestamp, ...envelope });
type Unknown = Extract<HoldVerdict, { verdict: "unknown" }>;
export class LegalHoldRegistryError extends Error {
  readonly verdict: Unknown;
  constructor(reason: Unknown["reason"]) {
    super("Legal hold registry unavailable: " + reason); this.name = "LegalHoldRegistryError";
    this.verdict = Object.freeze({ verdict: "unknown", reason });
  }
}
function fail(reason: Unknown["reason"]): never { throw new LegalHoldRegistryError(reason); }
function workspacePath(workspace: string): string {
  if (typeof workspace !== "string" || !workspace.trim()) fail("registry_unreadable");
  try { return realpathSync(resolve(workspace)); } catch { return fail("registry_unreadable"); }
}
export const legalHoldRegistryRoot = (workspace: string): string => join(workspacePath(workspace), ".amc", "residency", "legal-holds");
const legacyRoot = (workspace: string, kind: string): string => join(workspacePath(workspace), ".amc", "compliance", "residency", kind);
const headPath = (workspace: string): string => join(legalHoldRegistryRoot(workspace), "HEAD.json");
const journalPath = (workspace: string): string => join(legalHoldRegistryRoot(workspace), "journal");
const present = (path: string): boolean => { try { lstatSync(path); return true; } catch (error) {
  if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; return fail("registry_unreadable"); } };
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { for (const nested of Object.values(value)) freeze(nested); Object.freeze(value); } return value;
}
function safeDirectory(workspace: string, path: string): void {
  const root = workspacePath(workspace); let current = root;
  for (const segment of path.slice(root.length + 1).split(/[\\/]/)) {
    current = join(current, segment); if (!present(current)) break;
    const stat = lstatSync(current); if (!stat.isDirectory() || stat.isSymbolicLink()) fail("registry_unreadable");
  }
}
function bounded(path: string): Buffer {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd); if (!stat.isFile() || stat.size > MAX_RECORD_BYTES) fail("record_corrupt");
    const bytes = Buffer.alloc(MAX_RECORD_BYTES + 1); let size = 0;
    while (size < bytes.length) { const count = readSync(fd, bytes, size, bytes.length - size, null); if (!count) break; size += count; }
    if (size > MAX_RECORD_BYTES) fail("record_corrupt"); return bytes.subarray(0, size);
  } finally { closeSync(fd); }
}
const json = (bytes: Buffer): unknown => { try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return fail("record_corrupt"); } };
function files(workspace: string, path: string, modern: boolean): string[] {
  safeDirectory(workspace, path); if (!present(path)) return [];
  const entries = readdirSync(path); if (entries.length > MAX_RECORDS * 2 + 5) fail("record_corrupt");
  for (const entry of entries) {
    if (modern && ["HEAD.json", "HEAD.json.sig", ".holds.lock", ".holds-locks", "journal"].includes(entry)) continue;
    if (!(modern ? /^[A-Za-z0-9][A-Za-z0-9_.:-]*\.json(?:\.sig)?$/ : /^[A-Za-z0-9][A-Za-z0-9_.:-]*\.json$/).test(entry)) fail("record_corrupt");
    const stat = lstatSync(join(path, entry)); if (!stat.isFile() || stat.isSymbolicLink()) fail("record_corrupt");
    if (entry.endsWith(".sig") && !present(join(path, entry.slice(0, -4)))) fail("record_corrupt");
  }
  const records = entries.filter(entry => entry.endsWith(".json") && (!modern || entry !== "HEAD.json")).sort();
  if (records.length > MAX_RECORDS) fail("record_corrupt"); return records;
}
function signed<T>(workspace: string, path: string, schema: z.ZodType<T>): { value: T; sha256: string } {
  const snapshot = readAndVerifyArtifactFileSignature({ workspace, path, artifactKind: "legal-hold", requireDomainSeparated: true,
    maxArtifactBytes: MAX_RECORD_BYTES, maxSignatureBytes: 16_384 });
  if (!snapshot.valid || !snapshot.artifactBytes || !snapshot.artifactSha256) fail("signature_invalid");
  const parsed = schema.safeParse(json(snapshot.artifactBytes)); if (!parsed.success) fail("record_corrupt");
  return { value: parsed.data, sha256: snapshot.artifactSha256 };
}
function legacy<T extends z.infer<typeof legacyTenantSchema> | z.infer<typeof legacyHoldSchema>>(
  workspace: string, bytes: Buffer, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(json(bytes)); if (!parsed.success) fail("record_corrupt");
  const value = parsed.data, { record_hash, signature, storedTs: _storedTs, ...body } = value;
  let valid = false;
  try { valid = sha256Hex(canonicalize(body)) === record_hash && verifyHexDigestAny(record_hash, signature, getPublicKeyHistory(workspace, "auditor")); }
  catch { /* Unavailable legacy keys do not authenticate raw fields. */ }
  if (!valid) fail("signature_invalid"); return value;
}
function mapping(workspace: string): { identity: Identity | null; regulated: boolean } {
  const active = loadActiveCompiledPolicy(workspace);
  if (active) {
    const registry = loadDestinationRegistrySnapshot(workspace); if (registry.state !== "verified") fail("tenant_unmapped");
    const profile = loadPinnedResidencyProfile(workspace, registry.registry, active.profileSha256);
    return { regulated: true, identity: identitySchema.parse({ tenantId: profile.tenantId, workspaceId: profile.workspaceId }) };
  }
  try {
    const path = legacyRoot(workspace, "tenants"), identities = files(workspace, path, false).map(file => {
      const record = legacy(workspace, bounded(join(path, file)), legacyTenantSchema);
      if (file !== record.tenantId + ".json") fail("record_corrupt");
      return { tenantId: record.tenantId, workspaceId: record.workspaceId };
    });
    return { regulated: false, identity: identities.length === 1 ? identities[0]! : null };
  } catch { return { regulated: false, identity: null }; }
}
type Entry =
  | { source: "record"; holdId: string; sha256: string; record: LegalHoldV1 | LegacyRelease }
  | { source: "legacy"; holdId: string; sha256: string; hold: LegalHoldV1 }
  | { source: "legacy-unverified"; holdId: string; sha256: string };
interface Descriptor { source: "record" | "legacy"; holdId: string; sha256: string }
function recordDigest(rows: readonly Entry[]): string {
  if (rows.length > MAX_RECORDS) fail("record_corrupt");
  const descriptors: Descriptor[] = rows.map(row => ({ source: row.source === "record" ? "record" : "legacy", holdId: row.holdId, sha256: row.sha256 }));
  descriptors.sort((a, b) => a.source + ":" + a.holdId < b.source + ":" + b.holdId ? -1 : a.source + ":" + a.holdId > b.source + ":" + b.holdId ? 1 : 0);
  return sha256Hex(canonicalize(descriptors));
}
function identityPair(identity: Head["identity"]): Identity | null {
  return identity === null ? null : { tenantId: identity.tenantId, workspaceId: identity.workspaceId };
}
function anchorOf(head: Pick<Head, "count" | "recordsDigest" | "identity">): Anchor {
  return { count: head.count, recordsDigest: head.recordsDigest, identity: identityPair(head.identity) };
}
function readJournal(workspace: string, recover = false): SignedControlJournalSnapshot<Anchor> {
  try {
    safeDirectory(workspace, journalPath(workspace));
    return readSignedControlJournal({ workspace, controlKind: "legal-hold-head", journalDir: journalPath(workspace),
      parsePayload: value => anchorSchema.parse(value), recoverPendingPublication: recover });
  } catch (error) { return fail(error instanceof SignedControlJournalError ? "record_corrupt" : "registry_unreadable"); }
}
export interface LegalHoldRegistrySnapshot {
  readonly holds: readonly LegalHoldV1[];
  readonly identity: Identity | null;
  readonly registryDigest: string;
  readonly holdsChecked: number;
  readonly headMissing: boolean;
  readonly regulated: boolean;
  readonly unverifiedLegacy: readonly { holdId: string; sha256: string }[];
  readonly journalRevision: number;
}
interface State extends LegalHoldRegistrySnapshot {
  readonly rows: readonly Entry[];
  readonly head: Head | null;
  readonly journal: SignedControlJournalSnapshot<Anchor>;
  readonly bindingMismatch: boolean;
  readonly headStale: boolean;
}
function readUnlocked(workspace: string, options: { initialize?: boolean; rebind?: boolean } = {}): State {
  try {
    const tenant = mapping(workspace), root = legalHoldRegistryRoot(workspace), oldRoot = legacyRoot(workspace, "legal-holds"), now = Date.now();
    const rows: Entry[] = files(workspace, root, true).map(file => {
      const row = signed(workspace, join(root, file), modernSchema), record = row.value;
      if (file !== record.holdId + ".json" || (record.schemaVersion === "amc.legal-hold/v1" && record.issuedTs > now)
        || (record.releasedTs !== null && record.releasedTs > now)) fail("record_corrupt");
      return { source: "record", holdId: record.holdId, record, sha256: row.sha256 };
    });
    for (const file of files(workspace, oldRoot, false)) {
      const bytes = bounded(join(oldRoot, file)), sha256 = sha256Hex(bytes), holdId = file.slice(0, -5); term.parse(holdId);
      try {
        const hold = legacy(workspace, bytes, legacyHoldSchema);
        if (hold.holdId !== holdId || hold.issuedTs > now || hold.storedTs > now) fail("record_corrupt");
        rows.push({ source: "legacy", holdId, sha256, hold: { schemaVersion: "amc.legal-hold/v1", holdId,
          scope: { tenantId: hold.tenantId, workspaceIds: [], sessionIds: [], dataKinds: [] }, reason: hold.reason, issuedBy: hold.issuedBy,
          issuedTs: hold.issuedTs, expiresTs: hold.expiresTs, active: hold.active, releasedTs: hold.active ? null : Math.max(hold.issuedTs, hold.storedTs), legacyRecordSha256: sha256 } });
      } catch (error) {
        if (!(error instanceof LegalHoldRegistryError) || !["signature_invalid", "record_corrupt"].includes(error.verdict.reason)) throw error;
        rows.push({ source: "legacy-unverified", holdId, sha256 });
      }
    }
    const registryDigest = recordDigest(rows), journal = readJournal(workspace, options.initialize === true);
    const path = headPath(workspace), headMissing = !present(path);
    let head: Head | null = null, bindingMismatch = false, headStale = false;
    if (journal.integrity === "trusted") {
      const anchor = journal.payload;
      if (!anchor || anchor.count !== rows.length || anchor.recordsDigest !== registryDigest) fail("record_corrupt");
      if (anchor.identity !== null && canonicalize(anchor.identity) !== canonicalize(tenant.identity)) fail("tenant_unmapped");
      try {
        if (headMissing) fail(present(artifactSigPath(path)) ? "record_corrupt" : "head_missing");
        head = signed(workspace, path, headSchema).value;
        if (head.updatedTs > now || canonicalize(anchorOf(head)) !== canonicalize(anchor)) fail("record_corrupt");
      } catch (error) {
        if (options.initialize !== true || !(error instanceof LegalHoldRegistryError)
          || !["head_missing", "signature_invalid", "record_corrupt"].includes(error.verdict.reason)) throw error;
        head = null; headStale = true;
      }
      bindingMismatch = canonicalize(anchor.identity) !== canonicalize(tenant.identity)
        || (head !== null && head.workspacePathSha256 !== sha256Hex(workspacePath(workspace)));
      if (bindingMismatch && !options.rebind) fail("tenant_unmapped");
    } else if (headMissing) {
      if (present(artifactSigPath(path))) fail("record_corrupt");
      if (rows.some(row => row.source === "record") || (tenant.regulated && !options.initialize)) fail("head_missing");
    } else {
      head = signed(workspace, path, headSchema).value;
      if (head.updatedTs > now || head.count !== rows.length || head.recordsDigest !== registryDigest) fail("record_corrupt");
      if (!options.initialize || (head.workspacePathSha256 !== sha256Hex(workspacePath(workspace)) && options.rebind !== true)) fail("record_corrupt");
      bindingMismatch = head.workspacePathSha256 !== sha256Hex(workspacePath(workspace)) || canonicalize(identityPair(head.identity)) !== canonicalize(tenant.identity);
      if (bindingMismatch) {
        const previous = identityPair(head.identity);
        const compatible = previous === null || canonicalize(previous) === canonicalize(tenant.identity);
        if (!options.rebind || !compatible) fail("tenant_unmapped");
      }
    }
    const effective = new Map<string, LegalHoldV1>();
    const legacyRows = new Map<string, Extract<Entry, { source: "legacy" | "legacy-unverified" }>>();
    for (const row of rows) if (row.source !== "record") legacyRows.set(row.holdId, row);
    const unresolved = new Map<string, { holdId: string; sha256: string }>();
    for (const row of legacyRows.values()) {
      if (row.source === "legacy") effective.set(row.holdId, row.hold);
      else unresolved.set(row.holdId, { holdId: row.holdId, sha256: row.sha256 });
    }
    for (const row of rows) {
      if (row.source !== "record") continue;
      const old = legacyRows.get(row.holdId), next = row.record;
      if (next.schemaVersion === "amc.legacy-hold-release/v1") {
        if (!old || next.legacyRecordSha256 !== old.sha256) fail("record_corrupt");
        unresolved.delete(row.holdId); effective.delete(row.holdId); continue;
      }
      if (old) {
        if (next.active || next.legacyRecordSha256 !== old.sha256) fail("record_corrupt");
        if (old.source === "legacy") {
          const previous = old.hold;
          if (canonicalize(next.scope) !== canonicalize(previous.scope) || next.reason !== previous.reason || next.issuedBy !== previous.issuedBy
            || next.issuedTs !== previous.issuedTs || next.expiresTs !== previous.expiresTs) fail("record_corrupt");
        } else unresolved.delete(row.holdId); // Only the independently verified modern override supplies trusted fields.
      } else if (next.legacyRecordSha256 !== null) fail("record_corrupt");
      effective.set(row.holdId, next);
    }
    return freeze({ holds: [...effective.values()], identity: tenant.identity, registryDigest, holdsChecked: rows.length, headMissing,
      regulated: tenant.regulated, unverifiedLegacy: [...unresolved.values()], journalRevision: journal.revision, rows, head, journal, bindingMismatch, headStale });
  } catch (error) { if (error instanceof LegalHoldRegistryError) throw error; return fail("registry_unreadable"); }
}
function view(state: State): LegalHoldRegistrySnapshot {
  const { rows: _rows, head: _head, journal: _journal, bindingMismatch: _binding, headStale: _stale, ...snapshot } = state; return freeze(snapshot);
}
export function readLegalHoldRegistry(workspace: string): LegalHoldRegistrySnapshot { return view(readUnlocked(workspacePath(workspace))); }
/** Listing is a verified view, never deletion admission; untrusted legacy fields are not promoted into hold DTOs. */
export function listLegalHolds(workspace: string, options: { tenantId?: string; activeOnly?: boolean; rejectUnverifiedLegacy?: boolean } = {}): readonly LegalHoldV1[] {
  const snapshot = readLegalHoldRegistry(workspace), now = Date.now();
  if (options.rejectUnverifiedLegacy === true && snapshot.unverifiedLegacy.length) fail("signature_invalid");
  if (options.tenantId !== undefined && !term.safeParse(options.tenantId).success) return [];
  return snapshot.holds.filter(hold => (!options.tenantId || hold.scope.tenantId === options.tenantId)
    && (!options.activeOnly || (hold.active && (hold.expiresTs === null || hold.expiresTs > now))));
}
export function holdVerdict(input: { workspace: string; target?: DeletionRequest["target"] }): HoldVerdict {
  try {
    if (input.target !== undefined && !deletionTargetSchema.safeParse(input.target).success) fail("record_corrupt");
    const snapshot = readLegalHoldRegistry(input.workspace), now = Date.now();
    if (snapshot.unverifiedLegacy.length) return freeze({ verdict: "unknown", reason: "signature_invalid" });
    const active = snapshot.holds.filter(hold => hold.active && (hold.expiresTs === null || hold.expiresTs > now));
    if (active.some(hold => !snapshot.identity || hold.scope.tenantId !== snapshot.identity.tenantId)) return freeze({ verdict: "unknown", reason: "tenant_unmapped" });
    const identity = snapshot.identity;
    const held = active.filter(hold => identity && hold.scope.tenantId === identity.tenantId
      && (!hold.scope.workspaceIds.length || hold.scope.workspaceIds.includes(identity.workspaceId))
      && (!input.target || !hold.scope.dataKinds.length || hold.scope.dataKinds.includes(input.target.kind))
      && ((!input.target?.sessionIds?.length && !input.target?.sessionHashes?.length) || !hold.scope.sessionIds.length
        || hold.scope.sessionIds.some(id => input.target?.sessionIds?.includes(id) || input.target?.sessionHashes?.includes(sha256Hex(Buffer.from(id, "utf8"))))));
    if (held.length) return freeze({ verdict: "held", holdIds: held.map(hold => hold.holdId).sort() });
    return freeze({ verdict: "clear", registryDigest: snapshot.registryDigest, holdsChecked: snapshot.holdsChecked,
      ...(snapshot.headMissing ? { warning: "head_missing_unregulated" as const } : {}) });
  } catch (error) { return error instanceof LegalHoldRegistryError ? error.verdict : freeze({ verdict: "unknown", reason: "registry_unreadable" }); }
}
const locked = new Set<string>();
/** Synchronous only. Nested gates recheck their own scope while the same writer lock remains held. */
export function withLegalHoldLock<T>(workspace: string, operation: () => T): T {
  const root = workspacePath(workspace); if (locked.has(root)) return operation();
  const path = legalHoldRegistryRoot(root); safeDirectory(root, path);
  return withControlFileLock({ root: path, name: "holds", operation: () => {
    locked.add(root); try { return operation(); } finally { locked.delete(root); }
  } });
}
function assertWriter(workspace: string): void {
  if (process.env.AMC_NO_SIGN === "1" || getMode(workspace) !== "owner" || typeof process.getuid !== "function") fail("registry_unreadable");
  const mode = join(workspacePath(workspace), ".amc", "mode.json");
  if (present(mode) && !z.strictObject({ mode: z.literal("owner"), updatedTs: timestamp }).safeParse(json(bounded(mode))).success) fail("registry_unreadable");
  const root = legalHoldRegistryRoot(workspace); safeDirectory(workspace, root); mkdirSync(root, { recursive: true, mode: 0o700 });
  if (lstatSync(root).uid !== process.getuid()) fail("registry_unreadable"); chmodSync(root, 0o700);
}
function acknowledgedAudit(workspace: string, auditType: string, payload: Record<string, unknown>): void {
  try {
    const audit = appendOpsAuditEvent({ workspace, auditType, severity: "HIGH", payload });
    if (!audit.eventId || !digest.safeParse(audit.eventHash).success) fail("registry_unreadable");
  } catch { return fail("registry_unreadable"); }
}
interface PreparedArtifact { bytes: Buffer; signatureBytes: Buffer }
interface PreparedHead extends PreparedArtifact { value: Head }
function prepareArtifact(workspace: string, bytes: Buffer): PreparedArtifact {
  if (bytes.length > MAX_RECORD_BYTES) fail("record_corrupt");
  try {
    ensureSigningKeys(workspace);
    const signature = signArtifactBytes({ workspace, artifactKind: "legal-hold", bytes });
    if (!verifyArtifactBytesSignature({ workspace, artifactKind: "legal-hold", bytes, signature })) fail("registry_unreadable");
    const signatureBytes = Buffer.from(JSON.stringify(signature, null, 2) + "\n", "utf8");
    if (signatureBytes.length > 16_384) fail("registry_unreadable");
    return { bytes, signatureBytes };
  } catch { return fail("registry_unreadable"); }
}
function prepareHead(workspace: string, rows: readonly Entry[], identity: Identity | null): PreparedHead {
  const value = headSchema.parse({ schemaVersion: "amc.legal-hold-head/v1", workspacePathSha256: sha256Hex(workspacePath(workspace)), identity,
    count: rows.length, recordsDigest: recordDigest(rows), updatedTs: Date.now() });
  return { value, ...prepareArtifact(workspace, Buffer.from(canonicalize(value) + "\n", "utf8")) };
}
function writePreparedArtifact(path: string, artifact: PreparedArtifact): void {
  writeFileAtomic(path, artifact.bytes, 0o600);
  writeFileAtomic(artifactSigPath(path), artifact.signatureBytes, 0o600);
}
function publishHead(workspace: string, previous: State, rows: readonly Entry[], identity = previous.identity,
  record?: { path: string; artifact: PreparedArtifact }): void {
  const head = prepareHead(workspace, rows, identity);
  try {
    // Both signatures verify before the journal can commit; registry files follow its authority.
    appendSignedControlJournal({ workspace, controlKind: "legal-hold-head", journalDir: journalPath(workspace), previous: previous.journal, payload: anchorOf(head.value) });
    if (record) writePreparedArtifact(record.path, record.artifact);
    writePreparedArtifact(headPath(workspace), head);
  } catch { return fail("registry_unreadable"); }
}
/** Owner initialization can repair only HEAD from a trusted journal that exactly matches the verified row snapshot. */
export function initLegalHoldRegistry(workspace: string, options: { rebind?: boolean } = {}): LegalHoldRegistrySnapshot {
  const root = workspacePath(workspace); assertWriter(root);
  return withLegalHoldLock(root, () => {
    assertWriter(root);
    let snapshot = readUnlocked(root, { initialize: true, rebind: options.rebind === true });
    if (snapshot.headStale) {
      const anchor = snapshot.journal.payload;
      if (snapshot.journal.integrity !== "trusted" || !anchor) fail("record_corrupt");
      const head = prepareHead(root, snapshot.rows, anchor.identity);
      if (canonicalize(anchorOf(head.value)) !== canonicalize(anchor)) fail("record_corrupt");
      acknowledgedAudit(root, "LEGAL_HOLD_REGISTRY_HEAD_REPUBLISHED", { count: snapshot.holdsChecked,
        recordsDigest: snapshot.registryDigest, journalRevision: snapshot.journalRevision });
      try { writePreparedArtifact(headPath(root), head); } catch { return fail("registry_unreadable"); }
      // A null-to-known identity change still requires the separate audited rebind below.
      snapshot = readUnlocked(root, { initialize: true, rebind: options.rebind === true });
    }
    if (!snapshot.headMissing && !snapshot.bindingMismatch && snapshot.journal.integrity === "trusted") return view(snapshot);
    acknowledgedAudit(root, snapshot.bindingMismatch ? "LEGAL_HOLD_REGISTRY_REBOUND" : "LEGAL_HOLD_REGISTRY_INITIALIZED", {
      count: snapshot.holdsChecked, recordsDigest: snapshot.registryDigest, unverifiedLegacyCount: snapshot.unverifiedLegacy.length,
      journalRevision: snapshot.journalRevision, previousPathSha256: snapshot.head?.workspacePathSha256 ?? null, workspacePathSha256: sha256Hex(root) });
    publishHead(root, snapshot, snapshot.rows); return readLegalHoldRegistry(root);
  });
}
function publish(workspace: string, previous: State, record: LegalHoldV1 | LegacyRelease): void {
  const value = modernSchema.parse(record), path = join(legalHoldRegistryRoot(workspace), value.holdId + ".json"), bytes = Buffer.from(canonicalize(value) + "\n", "utf8");
  if (bytes.length > MAX_RECORD_BYTES) fail("record_corrupt");
  const rows: Entry[] = previous.rows.filter(row => row.source !== "record" || row.holdId !== value.holdId);
  rows.push({ source: "record", holdId: value.holdId, record: value, sha256: sha256Hex(bytes) }); recordDigest(rows);
  // Preserve the verified row descriptors. Never sign a directory reread narrowed during the signing window.
  const artifact = prepareArtifact(workspace, bytes);
  publishHead(workspace, previous, rows, previous.identity, { path, artifact }); readLegalHoldRegistry(workspace);
}
export function issueScopedLegalHold(input: { workspace: string; scope: LegalHoldScopeV1; reason: string; issuedBy: string; expiresTs?: number | null }): LegalHoldV1 {
  const workspace = workspacePath(input.workspace); assertWriter(workspace);
  return withLegalHoldLock(workspace, () => {
    assertWriter(workspace);
    const snapshot = readUnlocked(workspace), scope = legalHoldScopeSchema.parse(input.scope);
    if (snapshot.identity && (scope.tenantId !== snapshot.identity.tenantId
      || (scope.workspaceIds.length && !scope.workspaceIds.includes(snapshot.identity.workspaceId)))) fail("tenant_unmapped");
    if (snapshot.holdsChecked >= MAX_RECORDS) fail("record_corrupt");
    const holdId = "lh_" + randomUUID(); if (snapshot.rows.some(row => row.holdId === holdId)) fail("record_corrupt");
    const hold = legalHoldSchema.parse({ schemaVersion: "amc.legal-hold/v1", holdId, scope, reason: input.reason, issuedBy: input.issuedBy,
      issuedTs: Date.now(), expiresTs: input.expiresTs ?? null, active: true, releasedTs: null, legacyRecordSha256: null });
    publish(workspace, snapshot, hold); return freeze(hold);
  });
}
export function releaseScopedLegalHold(workspace: string, holdId: string, options: { acceptUnverifiedLegacy?: boolean } = {}): boolean {
  const root = workspacePath(workspace); assertWriter(root); term.parse(holdId);
  return withLegalHoldLock(root, () => {
    assertWriter(root);
    const snapshot = readUnlocked(root), unknown = snapshot.unverifiedLegacy.find(row => row.holdId === holdId);
    if (unknown) {
      if (options.acceptUnverifiedLegacy !== true) fail("signature_invalid");
      if (snapshot.holdsChecked >= MAX_RECORDS) fail("record_corrupt");
      acknowledgedAudit(root, "LEGAL_HOLD_LEGACY_RELEASE_ACCEPTED", { holdId, legacyRecordSha256: unknown.sha256 });
      publish(root, snapshot, { schemaVersion: "amc.legacy-hold-release/v1", holdId, active: false,
        legacyRecordSha256: unknown.sha256, releasedTs: Date.now(), acceptedBy: "owner" }); return true;
    }
    const hold = snapshot.holds.find(row => row.holdId === holdId); if (!hold || !hold.active) return false;
    if (hold.legacyRecordSha256 !== null && snapshot.holdsChecked >= MAX_RECORDS) fail("record_corrupt");
    publish(root, snapshot, { ...hold, active: false, releasedTs: Date.now() }); return true;
  });
}
