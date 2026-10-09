import { randomUUID } from "node:crypto";
import { chmodSync, closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { loadActiveCompiledPolicy } from "../catalog/compiler/activate.js";
import { getPublicKeyHistory, verifyHexDigestAny } from "../crypto/keys.js";
import { artifactSigPath, readAndVerifyArtifactFileSignature, signArtifactFile } from "../lifecycle/artifactSignature.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { getMode } from "../mode/mode.js";
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
  sessionHashes: z.array(digest).max(1024).optional(), before: z.iso.datetime({ offset: true }).optional() });
export const legalHoldScopeSchema = z.strictObject({ tenantId: term, workspaceIds: ids, sessionIds: ids,
  dataKinds: z.array(z.enum(DELETION_TARGET_KINDS)).max(DELETION_TARGET_KINDS.length).refine(values => new Set(values).size === values.length) });
export const legalHoldSchema = z.strictObject({ schemaVersion: z.literal("amc.legal-hold/v1"), holdId: term, scope: legalHoldScopeSchema,
  reason: text, issuedBy: text, issuedTs: timestamp, expiresTs: timestamp.nullable(), active: z.boolean(),
  releasedTs: timestamp.nullable(), legacyRecordSha256: digest.nullable() }).superRefine((hold, context) => {
  if (hold.expiresTs !== null && hold.expiresTs <= hold.issuedTs) context.addIssue({ code: "custom", message: "expiry precedes issue" });
  if (hold.active !== (hold.releasedTs === null) || (hold.releasedTs !== null && hold.releasedTs < hold.issuedTs))
    context.addIssue({ code: "custom", message: "invalid release state" });
});
const identitySchema = z.strictObject({ tenantId: term, workspaceId: term, sourceDigest: digest });
type Identity = z.infer<typeof identitySchema>;
const headSchema = z.strictObject({ schemaVersion: z.literal("amc.legal-hold-head/v1"), workspacePathSha256: digest,
  identity: identitySchema.nullable(), count: z.number().int().nonnegative().max(MAX_RECORDS), recordsDigest: digest, updatedTs: timestamp });
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
    super(`Legal hold registry unavailable: ${reason}`); this.name = "LegalHoldRegistryError";
    this.verdict = Object.freeze({ verdict: "unknown", reason });
  }
}
const fail = (reason: Unknown["reason"]): never => { throw new LegalHoldRegistryError(reason); };
const workspacePath = (workspace: string): string => typeof workspace === "string" && workspace.trim() ? resolve(workspace) : fail("registry_unreadable");
export const legalHoldRegistryRoot = (workspace: string): string => join(workspacePath(workspace), ".amc", "residency", "legal-holds");
const legacyRoot = (workspace: string, kind: string): string => join(workspacePath(workspace), ".amc", "compliance", "residency", kind);
const headPath = (workspace: string): string => join(legalHoldRegistryRoot(workspace), "HEAD.json");
const present = (path: string): boolean => { try { lstatSync(path); return true; } catch (error) {
  if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; return fail("registry_unreadable"); } };
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { for (const nested of Object.values(value)) freeze(nested); Object.freeze(value); } return value;
}
function safeDirectory(workspace: string, path: string): void {
  const root = workspacePath(workspace);
  let current = root;
  for (const segment of path.slice(root.length + 1).split(/[\\/]/)) {
    current = join(current, segment);
    if (!present(current)) break;
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
  const entries = readdirSync(path);
  if (entries.length > MAX_RECORDS * 2 + 4) fail("record_corrupt");
  for (const entry of entries) {
    if (modern && ["HEAD.json", "HEAD.json.sig", ".holds.lock", ".holds-locks"].includes(entry)) continue;
    if (!(modern ? /^[A-Za-z0-9][A-Za-z0-9_.:-]*\.json(?:\.sig)?$/ : /^[A-Za-z0-9][A-Za-z0-9_.:-]*\.json$/).test(entry)) fail("record_corrupt");
    if (!lstatSync(join(path, entry)).isFile() || lstatSync(join(path, entry)).isSymbolicLink()) fail("record_corrupt");
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
  workspace: string, path: string, schema: z.ZodType<T>): { value: T; sha256: string } {
  const bytes = bounded(path), parsed = schema.safeParse(json(bytes)); if (!parsed.success) fail("record_corrupt");
  const value = parsed.data;
  const { record_hash, signature, storedTs: _storedTs, ...body } = value;
  if (sha256Hex(canonicalize(body)) !== record_hash || !verifyHexDigestAny(record_hash, signature, getPublicKeyHistory(workspace, "auditor"))) fail("signature_invalid");
  return { value, sha256: sha256Hex(bytes) };
}
function mapping(workspace: string): { identity: Identity | null; regulated: boolean } {
  const active = loadActiveCompiledPolicy(workspace);
  if (active) {
    const registry = loadDestinationRegistrySnapshot(workspace); if (registry.state !== "verified") fail("tenant_unmapped");
    const profile = loadPinnedResidencyProfile(workspace, registry.registry, active.profileSha256);
    return { regulated: true, identity: identitySchema.parse({ tenantId: profile.tenantId, workspaceId: profile.workspaceId, sourceDigest: active.profileSha256 }) };
  }
  const path = legacyRoot(workspace, "tenants"), identities = files(workspace, path, false).map(file => {
    const record = legacy(workspace, join(path, file), legacyTenantSchema);
    if (file !== `${record.value.tenantId}.json`) fail("record_corrupt");
    return { tenantId: record.value.tenantId, workspaceId: record.value.workspaceId, sourceDigest: record.sha256 };
  });
  return { regulated: false, identity: identities.length === 1 ? identities[0]! : null };
}
interface Entry { hold: LegalHoldV1; sha256: string; source: "record" | "legacy" }
export interface LegalHoldRegistrySnapshot {
  readonly holds: readonly LegalHoldV1[];
  readonly identity: Identity | null;
  readonly registryDigest: string;
  readonly holdsChecked: number;
  readonly headMissing: boolean;
  readonly regulated: boolean;
}
function readUnlocked(workspace: string, allowInitialize = false, publishing = false): LegalHoldRegistrySnapshot {
  try {
    const tenant = mapping(workspace), root = legalHoldRegistryRoot(workspace), oldRoot = legacyRoot(workspace, "legal-holds");
    const entries: Entry[] = files(workspace, root, true).map(file => {
      const row = signed(workspace, join(root, file), legalHoldSchema);
      if (file !== `${row.value.holdId}.json`) fail("record_corrupt");
      return { hold: row.value, sha256: row.sha256, source: "record" };
    });
    for (const file of files(workspace, oldRoot, false)) {
      const row = legacy(workspace, join(oldRoot, file), legacyHoldSchema), hold = row.value;
      if (file !== `${hold.holdId}.json`) fail("record_corrupt");
      entries.push({ source: "legacy", sha256: row.sha256, hold: {
        schemaVersion: "amc.legal-hold/v1", holdId: hold.holdId, scope: { tenantId: hold.tenantId, workspaceIds: [], sessionIds: [], dataKinds: [] },
        reason: hold.reason, issuedBy: hold.issuedBy, issuedTs: hold.issuedTs, expiresTs: hold.expiresTs, active: hold.active,
        releasedTs: hold.active ? null : Math.max(hold.issuedTs, hold.storedTs), legacyRecordSha256: row.sha256 } });
    }
    if (entries.length > MAX_RECORDS) fail("record_corrupt");
    if (entries.some(row => row.hold.issuedTs > Date.now() || (row.hold.releasedTs !== null && row.hold.releasedTs > Date.now()))) fail("record_corrupt");
    const recordDigest = sha256Hex(canonicalize(entries.map(row => ({ source: row.source, holdId: row.hold.holdId, sha256: row.sha256 }))
      .sort((a, b) => `${a.source}:${a.holdId}` < `${b.source}:${b.holdId}` ? -1 : `${a.source}:${a.holdId}` > `${b.source}:${b.holdId}` ? 1 : 0)));
    const path = headPath(workspace), headMissing = !present(path);
    if (headMissing && present(artifactSigPath(path))) fail("record_corrupt");
    if (!headMissing && !publishing) {
      const head = signed(workspace, path, headSchema).value;
      if (head.updatedTs > Date.now() || head.workspacePathSha256 !== sha256Hex(workspacePath(workspace)) || head.count !== entries.length || head.recordsDigest !== recordDigest
        || canonicalize(head.identity) !== canonicalize(tenant.identity)) fail("record_corrupt");
    } else if (headMissing && !publishing && ((tenant.regulated && !allowInitialize) || entries.some(row => row.source === "record"))) fail("head_missing");
    const effective = new Map<string, Entry>();
    for (const row of entries.filter(entry => entry.source === "legacy")) effective.set(row.hold.holdId, row);
    for (const row of entries.filter(entry => entry.source === "record")) {
      const old = effective.get(row.hold.holdId);
      if (old) {
        const previous = old.hold, next = row.hold;
        if (next.legacyRecordSha256 !== old.sha256 || next.active || canonicalize(next.scope) !== canonicalize(previous.scope)
          || next.reason !== previous.reason || next.issuedBy !== previous.issuedBy || next.issuedTs !== previous.issuedTs || next.expiresTs !== previous.expiresTs) fail("record_corrupt");
      } else if (row.hold.legacyRecordSha256 !== null) fail("record_corrupt");
      effective.set(row.hold.holdId, row);
    }
    // No HEAD is tolerable only after every legacy row has passed strict verification.
    return freeze({ holds: [...effective.values()].map(row => row.hold), identity: tenant.identity, registryDigest: recordDigest,
      holdsChecked: entries.length, headMissing, regulated: tenant.regulated });
  } catch (error) { if (error instanceof LegalHoldRegistryError) throw error; return fail("registry_unreadable"); }
}
export function readLegalHoldRegistry(workspace: string): LegalHoldRegistrySnapshot { return readUnlocked(workspacePath(workspace)); }
export function listLegalHolds(workspace: string, options: { tenantId?: string; activeOnly?: boolean } = {}): readonly LegalHoldV1[] {
  if (options.tenantId !== undefined && !term.safeParse(options.tenantId).success) fail("record_corrupt");
  const snapshot = readLegalHoldRegistry(workspace), now = Date.now();
  if (snapshot.holds.some(hold => hold.active && (hold.expiresTs === null || hold.expiresTs > now)
    && (!snapshot.identity || hold.scope.tenantId !== snapshot.identity.tenantId))) fail("tenant_unmapped");
  return snapshot.holds.filter(hold => (!options.tenantId || hold.scope.tenantId === options.tenantId)
    && (!options.activeOnly || (hold.active && (hold.expiresTs === null || hold.expiresTs > now))));
}
export function holdVerdict(input: { workspace: string; target?: DeletionRequest["target"] }): HoldVerdict {
  try {
    if (input.target !== undefined && !deletionTargetSchema.safeParse(input.target).success) fail("record_corrupt");
    const snapshot = readLegalHoldRegistry(input.workspace), now = Date.now();
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
  if (getMode(workspace) !== "owner" || typeof process.getuid !== "function") fail("registry_unreadable");
  const mode = join(workspacePath(workspace), ".amc", "mode.json");
  if (present(mode) && z.strictObject({ mode: z.literal("owner"), updatedTs: timestamp }).safeParse(json(bounded(mode))).success === false) fail("registry_unreadable");
  const root = legalHoldRegistryRoot(workspace); safeDirectory(workspace, root); mkdirSync(root, { recursive: true, mode: 0o700 });
  if (lstatSync(root).uid !== process.getuid()) fail("registry_unreadable"); chmodSync(root, 0o700);
}
function publishHead(workspace: string, snapshot: LegalHoldRegistrySnapshot): void {
  const head = { schemaVersion: "amc.legal-hold-head/v1", workspacePathSha256: sha256Hex(workspacePath(workspace)), identity: snapshot.identity,
    count: snapshot.holdsChecked, recordsDigest: snapshot.registryDigest, updatedTs: Date.now() };
  writeFileAtomic(headPath(workspace), `${canonicalize(head)}\n`, 0o600);
  signArtifactFile({ workspace, path: headPath(workspace), artifactKind: "legal-hold" }); chmodSync(artifactSigPath(headPath(workspace)), 0o600);
}
/** Initializes the actual verified register; it never invents a hold or repairs an invalid publication. */
export function initLegalHoldRegistry(workspace: string): LegalHoldRegistrySnapshot {
  const root = workspacePath(workspace); assertWriter(root);
  return withLegalHoldLock(root, () => {
    const snapshot = readUnlocked(root, true);
    if (!snapshot.headMissing) return snapshot;
    publishHead(root, snapshot); return readLegalHoldRegistry(root);
  });
}
function publish(workspace: string, hold: LegalHoldV1): LegalHoldV1 {
  const value = legalHoldSchema.parse(hold), path = join(legalHoldRegistryRoot(workspace), `${value.holdId}.json`), bytes = `${canonicalize(value)}\n`;
  if (Buffer.byteLength(bytes) > MAX_RECORD_BYTES) fail("record_corrupt");
  writeFileAtomic(path, bytes, 0o600); signArtifactFile({ workspace, path, artifactKind: "legal-hold" }); chmodSync(artifactSigPath(path), 0o600);
  // Record first, HEAD last: any partial publication remains unverifiable and denies deletion.
  publishHead(workspace, readUnlocked(workspace, false, true));
  readLegalHoldRegistry(workspace); return freeze(value);
}
export function issueScopedLegalHold(input: { workspace: string; scope: LegalHoldScopeV1; reason: string; issuedBy: string; expiresTs?: number | null }): LegalHoldV1 {
  const workspace = workspacePath(input.workspace); assertWriter(workspace);
  return withLegalHoldLock(workspace, () => {
    const snapshot = readUnlocked(workspace, true), scope = legalHoldScopeSchema.parse(input.scope);
    if (snapshot.identity && (scope.tenantId !== snapshot.identity.tenantId
      || (scope.workspaceIds.length && !scope.workspaceIds.includes(snapshot.identity.workspaceId)))) fail("tenant_unmapped");
    if (snapshot.holdsChecked >= MAX_RECORDS) fail("record_corrupt");
    const holdId = `lh_${randomUUID()}`; if (snapshot.holds.some(hold => hold.holdId === holdId)) fail("record_corrupt");
    return publish(workspace, { schemaVersion: "amc.legal-hold/v1", holdId, scope, reason: input.reason, issuedBy: input.issuedBy,
      issuedTs: Date.now(), expiresTs: input.expiresTs ?? null, active: true, releasedTs: null, legacyRecordSha256: null });
  });
}
export function releaseScopedLegalHold(workspace: string, holdId: string): boolean {
  const root = workspacePath(workspace); assertWriter(root); term.parse(holdId);
  return withLegalHoldLock(root, () => {
    const snapshot = readUnlocked(root, true), hold = snapshot.holds.find(row => row.holdId === holdId);
    if (!hold || !hold.active) return false;
    if (hold.legacyRecordSha256 !== null && snapshot.holdsChecked >= MAX_RECORDS) fail("record_corrupt");
    publish(root, { ...hold, active: false, releasedTs: Date.now() }); return true;
  });
}
