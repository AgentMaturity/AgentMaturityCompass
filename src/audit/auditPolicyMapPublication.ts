import { mkdirSync, readFileSync, statSync } from "node:fs";
import { pathExists } from "../utils/fs.js";
import { dirname, join, resolve } from "node:path";
import YAML from "yaml";
import { assertKeysetComplete, boundProviderKey } from "../keys/keyset.js";
import { capturePurposePublication } from "../keys/purposePublication.js";
import { assertSigningKeyUsable, getSigningKey } from "../keys/signingKeys.js";
import { keyPolicy, loadKeysConfig } from "../keys/keysConfig.js";
import type { KeyProviderId } from "../keys/provider.js";
import { publicKeyFromPrivate } from "../crypto/keyHistoryEnvelope.js";
import { assertPolicySignerCurrent, describePolicySigner } from "../crypto/signing/signer.js";
import { prepareFileSignatureWithAuditor, type SignedFileVerification } from "../org/orgSigner.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { assertOrgPairsCurrent, captureOrgPairs, orgPairBytes, type OrgPairsSnapshot } from "../org/preparedOrgPairs.js";
import { loadTrustConfig } from "../trust/trustConfig.js";
import { canonicalize } from "../utils/json.js";
import { vaultStatus } from "../vault/vault.js";
import { auditPolicyPath, auditMapsDir, auditBindersExportsDir, auditBindersCacheDir, auditRequestsOpenDir, auditRequestsClosedDir } from "./auditPolicyStore.js";
import { auditMapBuiltinPath, auditMapActivePath } from "./auditMapStore.js";
import { auditPolicySchema, type AuditPolicy } from "./auditPolicySchema.js";
import { auditMapSchema, type AuditMapFile } from "./auditMapSchema.js";
import { AuditBinderPublicationError, publishAuditFiles, type AuditPublicationOptions } from "./binderPublication.js";

export interface AuditPolicyMapValues { policy?: AuditPolicy; builtin?: AuditMapFile; active?: AuditMapFile }
export class AuditPolicyMapPublicationError extends AuditBinderPublicationError {
  constructor(phase: string, paths: readonly string[], hashes: readonly string[], cause: unknown,
    readonly createdDirectories: readonly string[] = [], attemptedPath: string | null = null, readonly publicationSetupAttempted = false) {
    super(phase, Object.freeze([...paths]), Object.freeze([...hashes]), cause, attemptedPath); this.createdDirectories = Object.freeze([...createdDirectories]); this.name = "AuditPolicyMapPublicationError";
  }
}
function verifyPairBytes(workspace: string, path: string, kind: "BUNDLE" | "COMPLIANCE_MAPS", bytes: Buffer | null, signature: Buffer | null): SignedFileVerification {
  return { path, sigPath: `${path}.sig`, signatureExists: signature !== null,
    ...(bytes === null ? { valid: false, reason: "file missing" } : signature === null ? { valid: false, reason: "signature missing" }
      : verifyAuditorSignatureBytes(workspace, kind, bytes, signature)) };
}
interface AuditReadSelection { bytes: Buffer | null; signature: Buffer | null; signatureReadFailed: boolean; signatureExists: boolean; verification(): SignedFileVerification; assertCurrent(): void }
/** Display loads keep body parsing independent from invalid/unreadable sidecars and acquire no signer. */
function readPair(workspace: string, path: string, kind: "BUNDLE" | "COMPLIANCE_MAPS", withSignature = true): AuditReadSelection {
  const bytes = pathExists(path) ? readFileSync(path) : null, signatureExists = withSignature && pathExists(`${path}.sig`);
  let signature: Buffer | null = null, signatureReadFailed = false;
  try { if (signatureExists) { if (!statSync(`${path}.sig`).isFile()) signatureReadFailed = true; else signature = readFileSync(`${path}.sig`); } } catch { signatureReadFailed = true; }
  const equal = (a: Buffer | null, b: Buffer | null) => a === null ? b === null : b !== null && a.equals(b);
  return { bytes, signature, verification: (): SignedFileVerification => signatureReadFailed
    ? { valid: false, signatureExists, reason: "audit signature could not be read", path, sigPath: `${path}.sig` }
    : verifyPairBytes(workspace, path, kind, bytes, signature),
    assertCurrent() { const next = readPair(workspace, path, kind, withSignature);
      if (!equal(bytes, next.bytes) || !equal(signature, next.signature) || signatureReadFailed !== next.signatureReadFailed || signatureExists !== next.signatureExists)
        throw new Error("audit displayed input bytes changed during the operation");
    }, signatureReadFailed, signatureExists };
}
export const readAuditPolicySelection = (workspace: string) => readPair(workspace, auditPolicyPath(workspace), "BUNDLE");
export const readAuditMapSelection = (workspace: string, id: "builtin" | "active") => readPair(workspace, id === "builtin" ? auditMapBuiltinPath(workspace) : auditMapActivePath(workspace), "COMPLIANCE_MAPS");
export const readAuditMapBodySelection = (workspace: string, id: "builtin" | "active") => readPair(workspace, id === "builtin" ? auditMapBuiltinPath(workspace) : auditMapActivePath(workspace), "COMPLIANCE_MAPS", false);
/** Existing Studio readiness has two hard prerequisites; workspace verification contributes warnings only.
 * Original own-target admission ends before its first replacement; unrelated admission remains stable. */
export function captureAuditPolicyMapReadiness(workspace: string, replaced: "policy" | "active" | null) {
  const selected = [{ id: "policy" as const, value: readAuditPolicySelection(workspace) },
    { id: "active" as const, value: readAuditMapSelection(workspace, "active") }];
  const check = (preparing: boolean) => {
    for (const row of selected) if (preparing || row.id !== replaced) {
      row.value.assertCurrent();
      if (!row.value.verification().valid) throw new Error("original audit route prerequisite is not currently admitted");
    }
  };
  const assertCurrent = () => check(false), assertPreparing = () => check(true); assertPreparing();
  return Object.freeze({ assertCurrent, assertPreparing, withOptions(input: AuditPublicationOptions): AuditPublicationOptions {
    const caller = { ...input };
    return { ...caller, beforePublish() { caller.beforePublish?.(); assertCurrent(); },
      assertPreparationInputsCurrent() { caller.assertPreparationInputsCurrent?.(); assertPreparing(); } };
  } });
}
export function verifyAuditMapSelection(workspace: string, id: "builtin" | "active"): SignedFileVerification {
  const path = id === "builtin" ? auditMapBuiltinPath(workspace) : auditMapActivePath(workspace);
  try { const selected = readAuditMapSelection(workspace, id); return selected.bytes === null
    ? { valid: false, signatureExists: false, reason: `audit ${id} map missing`, path, sigPath: `${path}.sig` } : selected.verification(); }
  catch { return { valid: false, signatureExists: pathExists(`${path}.sig`), reason: "audit map could not be read", path, sigPath: `${path}.sig` }; }
}
interface Directory { path: string; identity: string | null; mode: number | null }
function directory(path: string): Directory {
  try { const row = statSync(path); if (!row.isDirectory()) throw new Error("audit destination parent is not a directory");
    return { path, identity: `${row.dev}:${row.ino}`, mode: row.mode & 0o777 }; }
  catch (cause) { if ((cause as NodeJS.ErrnoException).code === "ENOENT") return { path, identity: null, mode: null }; throw cause; }
}
/** Preserve exactly ensureAuditDirs' existing finite set and native default mkdir mode, after signing. */
export function captureDirectories(workspace: string) {
  const paths = [join(workspace, ".amc", "audit"), auditMapsDir(workspace), join(workspace, ".amc", "audit", "binders"),
    auditBindersExportsDir(workspace), auditBindersCacheDir(workspace), auditRequestsOpenDir(workspace), auditRequestsClosedDir(workspace)];
  const expected = new Map<string, Directory>(), mode = 0o777 & ~process.umask(), created: string[] = []; let attempted: string | null = null;
  for (const input of paths) { const chain: Directory[] = [];
    for (let path = resolve(input); !expected.has(path); path = dirname(path)) { const row = directory(path); chain.push(row); if (row.identity !== null || dirname(path) === path) break; }
    for (const row of chain.reverse()) expected.set(row.path, row);
  }
  const assertCurrent = () => {
    if ((0o777 & ~process.umask()) !== mode) throw new Error("audit original directory mode changed before publication");
    for (const old of expected.values()) { const next = directory(old.path); if (next.identity !== old.identity || next.mode !== old.mode) throw new Error("audit selected destination directory changed"); }
  };
  return { assertCurrent, created, get attempted() { return attempted; }, create(beforeMember: () => void) {
    for (const [path, old] of expected) { if (old.identity !== null) continue;
      beforeMember(); assertCurrent(); attempted = path; mkdirSync(path, { mode: 0o777 }); created.push(path);
      const own = directory(path); if (own.identity === null || own.mode !== mode) throw new Error("created audit directory differs from expected native mode");
      expected.set(path, own); attempted = null;
    }
  } };
}
/** Fixed actual destinations and recipes only. No caller kind, key, provider, public-key or trust choice. */
export function captureAuditPolicyMapPublication(workspace: string, input: AuditPolicyMapValues, options: AuditPublicationOptions = {}, previous?: OrgPairsSnapshot) {
  const caller = { ...options }, values = structuredClone(input);
  caller.beforePublish?.(); caller.assertInputsCurrent?.(); caller.assertPreparationInputsCurrent?.();
  const rows: { id: "policy" | "builtin" | "active"; path: string; bytes: Buffer; kind: "BUNDLE" | "COMPLIANCE_MAPS" }[] = [];
  if (values.policy !== undefined) { values.policy = auditPolicySchema.parse(values.policy); rows.push({ id: "policy", path: auditPolicyPath(workspace), bytes: Buffer.from(YAML.stringify(values.policy)), kind: "BUNDLE" }); }
  if (values.builtin !== undefined) { values.builtin = auditMapSchema.parse(values.builtin); rows.push({ id: "builtin", path: auditMapBuiltinPath(workspace), bytes: Buffer.from(YAML.stringify(values.builtin)), kind: "COMPLIANCE_MAPS" }); }
  if (values.active !== undefined) { values.active = auditMapSchema.parse(values.active); rows.push({ id: "active", path: auditMapActivePath(workspace), bytes: Buffer.from(YAML.stringify(values.active)), kind: "COMPLIANCE_MAPS" }); }
  if (rows.length === 0) throw new Error("audit publication selected no actual output");
  const paths = Object.freeze(rows.flatMap(row => [row.path, `${row.path}.sig`])); caller.assertOutputsSafe?.(paths);
  const selected = previous ?? captureOrgPairs(rows.map(row => row.path));
  const before: OrgPairsSnapshot = { members: selected.members.filter(row => paths.includes(row.path)).map(row => ({ ...row, bytes: row.bytes === null ? null : Buffer.from(row.bytes) })) };
  for (const path of paths) orgPairBytes(before, path);
  const dirs = captureDirectories(workspace);
  const originals = [...new Set(rows.map(row => row.kind))].map(kind => {
    const descriptor = describePolicySigner(workspace, kind), purpose = kind === "BUNDLE" ? "artifact-seal" as const : "config-signature" as const;
    const captured = descriptor.mode === "VAULT" ? capturePurposePublication(workspace, purpose) : null;
    const holder: KeyProviderId | null = descriptor.mode === "VAULT" ? boundProviderKey(workspace, purpose)?.binding.provider ?? "file" : null;
    return { descriptor, purpose, captured, holder };
  });
  const generation = canonicalize(assertKeysetComplete(workspace)), trust = canonicalize(loadTrustConfig(workspace));
  const intrinsic = () => {
    for (const row of originals) assertPolicySignerCurrent(workspace, row.descriptor);
    if (canonicalize(assertKeysetComplete(workspace)) !== generation || canonicalize(loadTrustConfig(workspace)) !== trust) throw new Error("original audit signing authority changed");
    for (const row of originals) if (row.captured !== null && row.holder !== null) {
      const policy = keyPolicy(loadKeysConfig(workspace));
      if (row.captured.keyset !== generation || !policy.allowed.includes(row.descriptor.algorithm) || (row.holder === "file" && policy.requireNonExportable)) throw new Error("original audit purpose authority is refused");
      assertSigningKeyUsable(workspace, row.purpose, row.descriptor.publicKeyPem, row.holder);
      if (row.holder === "file") {
        if (!vaultStatus(workspace).unlocked) throw new Error("original audit vault is locked; unlock before signing");
        if (publicKeyFromPrivate(getSigningKey(workspace, row.purpose)) !== row.descriptor.publicKeyPem) throw new Error("original audit purpose key changed");
      }
    }
  };
  const external = () => { caller.beforePublish?.(); caller.assertInputsCurrent?.(); caller.assertOutputsSafe?.(paths); };
  external(); intrinsic(); dirs.assertCurrent(); assertOrgPairsCurrent(before);
  return Object.freeze({ get values() { return structuredClone(values); }, paths, async prepare() {
    const signed: Awaited<ReturnType<typeof prepareFileSignatureWithAuditor>>[] = [];
    let own: ReturnType<typeof publishAuditFiles> | null = null;
    const assertCurrent = () => {
      try { external(); intrinsic(); for (const row of signed) row.assertCurrent(); dirs.assertCurrent(); own?.assertCurrent(); }
      catch (cause) { if (own === null) throw cause;
        const nested = cause instanceof AuditBinderPublicationError ? cause : null;
        throw new AuditPolicyMapPublicationError("policy-map-continuation", Object.freeze([...new Set([...own.publishedPaths, ...(nested?.publishedPaths ?? [])])]),
          nested?.completedLogHashes ?? [], cause, Object.freeze([...dirs.created]), nested?.attemptedPath ?? null, true);
      }
    };
    const beforeSign = () => { caller.assertPreparationInputsCurrent?.(); assertCurrent(); assertOrgPairsCurrent(before); };
    for (const row of rows) { beforeSign(); signed.push(await prepareFileSignatureWithAuditor(workspace, row.path, row.bytes, row.kind, beforeSign)); beforeSign(); }
    const writes = rows.flatMap((row, index) => [{ path: row.path, bytes: row.bytes }, { path: `${row.path}.sig`, bytes: Buffer.from(signed[index]!.signatureBytes) }]);
    return Object.freeze({ get values() { return structuredClone(values); }, paths, assertCurrent, get createdDirectories() { return Object.freeze([...dirs.created]); },
      verification(id: "policy" | "builtin" | "active") { const index = rows.findIndex(row => row.id === id); if (index < 0) throw new Error("audit member was not prepared");
        return verifyPairBytes(workspace, rows[index]!.path, rows[index]!.kind, rows[index]!.bytes, Buffer.from(signed[index]!.signatureBytes));
      },
      publish() {
        let setupAttempted = false;
        try { dirs.create(beforeSign); setupAttempted = true; own = publishAuditFiles(workspace, writes, before, assertCurrent, beforeSign); assertCurrent();
          return Object.freeze(Object.fromEntries(rows.map(row => [row.id, { path: row.path, sigPath: `${row.path}.sig` }]))) as Readonly<Partial<Record<"policy" | "builtin" | "active", { path: string; sigPath: string }>>>;
        } catch (cause) {
          const nested = cause instanceof AuditBinderPublicationError ? cause : null;
          if (!setupAttempted && dirs.created.length === 0 && dirs.attempted === null && nested === null) throw cause;
          throw new AuditPolicyMapPublicationError("policy-map-files", Object.freeze([...new Set([...(own?.publishedPaths ?? []), ...(nested?.publishedPaths ?? [])])]), nested?.completedLogHashes ?? [], cause,
            Object.freeze([...dirs.created]), nested?.attemptedPath ?? dirs.attempted, setupAttempted);
        }
      }
    });
  } });
}
