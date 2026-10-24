import { closeSync, fstatSync, openSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { NATIVE_EXTENSION_LIMITS, NativeExtensionError } from "../extensions/nativeExtensionManifest.js";
import { readNativeExtension } from "../extensions/nativeExtensionStore.js";
import { prepareFileSignatureWithAuditor, signSerializedPayloadWithAuditor } from "../org/orgSigner.js";
import { captureOrgCommitmentAuthority } from "../org/orgPublication.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { distrustAt } from "../trust/admissionRule.js";
import { sha256Hex } from "../utils/hash.js";
import { assertNativeExecutableInstalled, readInstalledNativeExecutable } from "./nativeExecutablePackage.js";
import { NATIVE_EXECUTABLE_LIMITS, NativeExecutableError, nativeExecutableCapabilitySchema, nativeExecutableDigestSchema, type NativeExecutableCapability } from "./nativeExecutableSchema.js";
import { installedPluginTrust } from "./pluginPackage.js";
import { pluginInstalledPackagePath, pluginsInstalledLockPath } from "./pluginStore.js";
import { readNativeExecutableFile, readNativeExecutableSignedJson } from "./nativeExecutableSource.js";

export const nativeExecutablePolicySchema = z.object({
  schemaVersion: z.literal(1),
  grants: z.array(z.object({
    manifestDigest: nativeExecutableDigestSchema,
    capabilities: z.array(nativeExecutableCapabilitySchema).min(1).max(2),
    approvedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive()
  }).strict().refine(grant => new Set(grant.capabilities).size === grant.capabilities.length
    && grant.expiresAt > grant.approvedAt && grant.expiresAt - grant.approvedAt <= 86_400_000)).max(256),
  revoked: z.array(nativeExecutableDigestSchema).max(256)
}).strict().refine(value => new Set(value.grants.map(grant => grant.manifestDigest)).size === value.grants.length
  && new Set(value.revoked).size === value.revoked.length);
export type NativeExecutablePolicy = z.infer<typeof nativeExecutablePolicySchema>;

export function nativeExecutablePolicyPath(workspace: string): string {
  return join(resolve(workspace), ".amc", "plugins", "execution-policy.json");
}

export function readNativeExecutablePolicy(workspace: string): { policy: NativeExecutablePolicy; digest: string } {
  try {
    const signed = readNativeExecutableSignedJson(resolve(workspace), nativeExecutablePolicyPath(workspace), NATIVE_EXECUTABLE_LIMITS.policyBytes);
    return { policy: nativeExecutablePolicySchema.parse(signed.value), digest: signed.digest };
  } catch {
    throw new NativeExecutableError("EXECUTABLE_APPROVAL_REQUIRED", "Executable extensions require a separate valid workspace-signed .amc/plugins/execution-policy.json. A code signature or installation approval alone is not execution approval.");
  }
}

export function assertNativeExecutableApproval(workspace: string, manifestDigest: string,
  requested: readonly NativeExecutableCapability[], now = Date.now()): { policyDigest: string; expiresAt: number } {
  const { policy, digest } = readNativeExecutablePolicy(workspace);
  if (policy.revoked.includes(manifestDigest)) {
    throw new NativeExecutableError("EXECUTABLE_REVOKED", "This exact executable extension manifest has been revoked. It cannot resume through a cached handle.");
  }
  const grant = policy.grants.find(candidate => candidate.manifestDigest === manifestDigest);
  if (!grant || now < grant.approvedAt || now >= grant.expiresAt
    || grant.capabilities.length !== requested.length || requested.some(capability => !grant.capabilities.includes(capability))) {
    throw new NativeExecutableError("EXECUTABLE_APPROVAL_REQUIRED", "The exact manifest digest and capability set need a current, unexpired execution approval. Review them explicitly before loading code.");
  }
  return { policyDigest: digest, expiresAt: grant.expiresAt };
}

function exists(path: string): boolean {
  try { lstatSync(path); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}

/** Explicit operator mutation only. All readers/loads/invocations remain read-only and never self-approve. */
function updatePolicy(workspace: string, expectedPolicyDigest: string | null,
  change: (policy: NativeExecutablePolicy) => NativeExecutablePolicy): { path: string; digest: string } {
  workspace = resolve(workspace);
  const path = nativeExecutablePolicyPath(workspace);
  const parent = dirname(path);
  if (realpathSync(parent) !== parent || !lstatSync(parent).isDirectory()) {
    throw new NativeExecutableError("EXECUTABLE_POLICY_PATH", "Use an initialized, nonsymlink plugin store for execution approvals.");
  }
  const lock = join(parent, ".execution-policy-write-lock");
  try { mkdirSync(lock, { mode: 0o700 }); }
  catch { throw new NativeExecutableError("EXECUTABLE_POLICY_BUSY", "Another execution-policy update is active, or its lock remains. No update was attempted; reconcile the owner before another explicit request."); }
  let staged: string | undefined;
  try {
    const present = exists(path) || exists(`${path}.sig`);
    const current = present ? readNativeExecutablePolicy(workspace) : { policy: { schemaVersion: 1 as const, grants: [], revoked: [] }, digest: null };
    if (expectedPolicyDigest !== current.digest) {
      throw new NativeExecutableError("EXECUTABLE_POLICY_CHANGED", "Execution policy differs from its reviewed digest. No approval or revocation was written.");
    }
    const policy = nativeExecutablePolicySchema.parse(change(current.policy));
    const serialized = `${JSON.stringify(policy, null, 2)}\n`;
    if (Buffer.byteLength(serialized) > NATIVE_EXECUTABLE_LIMITS.policyBytes) throw new Error("policy too large");
    const signed = signSerializedPayloadWithAuditor(workspace, serialized);
    staged = mkdtempSync(join(parent, ".execution-policy-"));
    writeFileSync(join(staged, "policy.json"), serialized, { flag: "wx", mode: 0o600 });
    writeFileSync(join(staged, "policy.sig"), JSON.stringify(signed), { flag: "wx", mode: 0o600 });
    // A concurrent non-cooperating edit is not silently overwritten. A crash
    // between these two renames leaves an invalid signature, hence no grant.
    const unchanged = present ? readNativeExecutablePolicy(workspace).digest === current.digest
      : !exists(path) && !exists(`${path}.sig`);
    if (!unchanged || realpathSync(parent) !== parent) throw new NativeExecutableError("EXECUTABLE_POLICY_CHANGED", "Execution policy changed before publication; no replacement was made.");
    renameSync(join(staged, "policy.json"), path);
    renameSync(join(staged, "policy.sig"), `${path}.sig`);
    return { path, digest: sha256Hex(Buffer.from(serialized)) };
  } finally {
    if (staged) rmSync(staged, { recursive: true, force: true });
    rmSync(lock, { recursive: true, force: true });
  }
}

export function approveNativeExecutableExtension(options: {
  workspace: string; manifestPath: string; expectedDigest: string;
  capabilities: readonly NativeExecutableCapability[]; expiresAt: number;
  expectedPolicyDigest: string | null;
}): { path: string; digest: string } {
  const snapshot = readNativeExtension({ workspace: options.workspace, manifestPath: options.manifestPath, expectedDigest: options.expectedDigest });
  if (snapshot.manifest.schemaVersion !== 2) throw new NativeExecutableError("EXECUTABLE_DECLARATION_REQUIRED", "Execution approval applies only to a signed v2 executable declaration.");
  const requested = snapshot.manifest.executable.capabilities;
  if (requested.length !== options.capabilities.length || new Set(options.capabilities).size !== requested.length
    || requested.some(capability => !options.capabilities.includes(capability))) {
    throw new NativeExecutableError("EXECUTABLE_CAPABILITY_MISMATCH", "Explicitly approve exactly the capability set in the reviewed manifest; no inferred or extra grants are accepted.");
  }
  const approvedAt = Date.now();
  if (!Number.isSafeInteger(options.expiresAt) || options.expiresAt <= approvedAt || options.expiresAt - approvedAt > 86_400_000) {
    throw new NativeExecutableError("EXECUTABLE_APPROVAL_EXPIRY", "Execution approval needs a future integer expiry no more than 24 hours from this explicit approval action.");
  }
  readInstalledNativeExecutable(snapshot.workspace, snapshot.manifest.executable);
  return updatePolicy(snapshot.workspace, options.expectedPolicyDigest, policy => {
    if (policy.revoked.includes(snapshot.manifestDigest)) throw new NativeExecutableError("EXECUTABLE_REVOKED", "A revoked manifest cannot be reapproved. Review a new manifest instead.");
    return { ...policy, grants: [...policy.grants.filter(grant => grant.manifestDigest !== snapshot.manifestDigest),
      { manifestDigest: snapshot.manifestDigest, capabilities: [...requested], approvedAt, expiresAt: options.expiresAt }] };
  });
}

/** Persistent denial wins over grants and is observed by active runners on their next poll. */
export function revokeNativeExecutableExtension(options: {
  workspace: string; manifestDigest: string; expectedPolicyDigest: string;
}): { path: string; digest: string } {
  const manifestDigest = nativeExecutableDigestSchema.parse(options.manifestDigest);
  return updatePolicy(options.workspace, options.expectedPolicyDigest, policy => ({
    ...policy, grants: policy.grants.filter(grant => grant.manifestDigest !== manifestDigest),
    revoked: [...new Set([...policy.revoked, manifestDigest])]
  }));
}

class NativeExecutablePolicyInputError extends Error {
  readonly code = "EXECUTABLE_POLICY_INPUT_UNREADABLE";
  constructor(cause: unknown) {
    super("Could not retain the reviewed executable approval inputs safely; filesystem and source diagnostics are withheld.", { cause });
    this.name = "NativeExecutablePolicyInputError";
  }
}
interface PolicyFileWitness { bytes: Buffer; mode: number; identity: string; mtime: number; ctime: number }
interface PolicyDirectoryWitness { mode: number; identity: string }
function policyChanged(): never {
  throw new NativeExecutableError("EXECUTABLE_POLICY_CHANGED", "Original execution-policy authority, source or target changed. No fresh selection is adopted.");
}
function policyDirectory(path: string): PolicyDirectoryWitness {
  const row = lstatSync(path);
  if (!row.isDirectory() || row.isSymbolicLink() || realpathSync(path) !== path) policyChanged();
  return { mode: row.mode & 0o777, identity: `${row.dev}:${row.ino}` };
}
function samePolicyDirectory(a: PolicyDirectoryWitness, b: PolicyDirectoryWitness): boolean {
  return a.mode === b.mode && a.identity === b.identity;
}
function policyFile(root: string, path: string, limit: number, absent = false): PolicyFileWitness | null {
  policyDirectory(root);
  let first: ReturnType<typeof lstatSync>;
  try { first = lstatSync(path); }
  catch (cause) { if (absent && (cause as NodeJS.ErrnoException).code === "ENOENT") return null; throw cause; }
  const bytes = readNativeExecutableFile(root, path, limit), last = lstatSync(path);
  if (!first.isFile() || !last.isFile() || first.dev !== last.dev || first.ino !== last.ino || first.mode !== last.mode
    || first.size !== last.size || first.nlink !== 1 || last.nlink !== 1 || first.mtimeMs !== last.mtimeMs
    || first.ctimeMs !== last.ctimeMs || bytes.length !== last.size) policyChanged();
  return { bytes: Buffer.from(bytes), mode: last.mode & 0o777, identity: `${last.dev}:${last.ino}`, mtime: last.mtimeMs, ctime: last.ctimeMs };
}
function samePolicyFile(a: PolicyFileWitness | null, b: PolicyFileWitness | null): boolean {
  return a === null || b === null ? a === b : a.mode === b.mode && a.identity === b.identity
    && a.mtime === b.mtime && a.ctime === b.ctime && a.bytes.equals(b.bytes);
}
/** Private bounded witness used only by the two fixed direct policy recipes below. */
function capturePolicyFiles(rows: readonly { root: string; path: string; limit: number; absent?: boolean }[]) {
  const files = new Map<string, { root: string; limit: number; absent: boolean; witness: PolicyFileWitness | null }>();
  const directories = new Map<string, PolicyDirectoryWitness>();
  for (const row of rows) {
    const suffix = relative(row.root, row.path);
    if (!suffix || isAbsolute(suffix) || suffix === ".." || suffix.startsWith(`..${sep}`)) policyChanged();
    let parent = dirname(row.path);
    while (true) {
      const witness = policyDirectory(parent), old = directories.get(parent);
      if (old !== undefined && !samePolicyDirectory(old, witness)) policyChanged();
      directories.set(parent, witness);
      if (parent === row.root) break;
      parent = dirname(parent);
    }
    const witness = policyFile(row.root, row.path, row.limit, row.absent);
    const old = files.get(row.path);
    if (old !== undefined && !samePolicyFile(old.witness, witness)) policyChanged();
    files.set(row.path, { root: row.root, limit: row.limit, absent: row.absent === true, witness });
  }
  const assertDirectories = () => {
    for (const [path, before] of directories) if (!samePolicyDirectory(before, policyDirectory(path))) policyChanged();
  };
  const assertCurrent = () => {
    assertDirectories();
    for (const [path, before] of files) if (!samePolicyFile(before.witness, policyFile(before.root, path, before.limit, before.absent))) policyChanged();
  };
  assertCurrent();
  return { assertCurrent, assertDirectories, get(path: string) { return files.get(path)!.witness; },
    acknowledge(path: string, bytes: Buffer, identity: string) {
      assertDirectories();
      const selected = files.get(path)!, own = policyFile(selected.root, path, selected.limit);
      if (own === null || own.mode !== 0o600 || own.identity !== identity || !own.bytes.equals(bytes)) policyChanged();
      selected.witness = own;
    }
  };
}
interface PolicyLockProgress {
  phase: "capture" | "publication"; attempted: boolean; returned: boolean; acknowledged: boolean;
  cleanupCheckAttempted: boolean; cleanupAttempted: boolean; cleanupReturned: boolean;
}
interface PolicyMemberProgress {
  path: string; openAttempted: boolean; opened: boolean; writeAttempted: boolean; writeReturned: boolean;
  closeAttempted: boolean; closed: boolean; stagedAcknowledged: boolean;
  renameAttempted: boolean; renameReturned: boolean; targetAcknowledged: boolean;
}
interface NativePolicyProgress {
  phase: string; failurePhase: string | null; path: string; signAttempted: boolean; signReturned: boolean;
  locks: PolicyLockProgress[]; members: PolicyMemberProgress[];
  tempCreationAttempted: boolean; temp: string | null; tempReturned: boolean; tempAcknowledged: boolean;
  tempCleanupCheckAttempted: boolean; tempCleanupAttempted: boolean; tempCleanupReturned: boolean;
}
export class NativeExecutablePolicyPublicationError extends Error {
  readonly code = "EXECUTABLE_POLICY_PUBLICATION_INCOMPLETE";
  constructor(readonly progress: Readonly<NativePolicyProgress>, cause: unknown,
    readonly closeCauses: readonly unknown[], readonly cleanupCauses: readonly unknown[]) {
    super("Execution-policy publication did not complete; native setup, replacement or cleanup effects may remain. Diagnostics are withheld.", { cause });
    this.name = "NativeExecutablePolicyPublicationError";
  }
}
function policyProgressSnapshot(progress: NativePolicyProgress): Readonly<NativePolicyProgress> {
  return Object.freeze({ ...progress, locks: progress.locks.map(row => Object.freeze({ ...row })),
    members: progress.members.map(row => Object.freeze({ ...row })) });
}
/** The same mkdir lock as the unchanged synchronous writer; this callback is synchronous and never signs. */
function underPolicyLock<T>(parent: string, phase: PolicyLockProgress["phase"], progress: NativePolicyProgress,
  cleanupCauses: unknown[], operation: () => T): T {
  const lock = join(parent, ".execution-policy-write-lock"), parentBefore = policyDirectory(parent);
  const row: PolicyLockProgress = { phase, attempted: false, returned: false, acknowledged: false,
    cleanupCheckAttempted: false, cleanupAttempted: false, cleanupReturned: false };
  progress.locks.push(row);
  let own: PolicyDirectoryWitness | null = null, result: T | undefined, failed = false, primary: unknown;
  const cleanupStart = cleanupCauses.length;
  try {
    progress.phase = `${phase}-lock-mkdir`; row.attempted = true; mkdirSync(lock, { mode: 0o700 }); row.returned = true;
    own = policyDirectory(lock);
    if ((own.mode & 0o077) !== 0 || !samePolicyDirectory(parentBefore, policyDirectory(parent))) policyChanged();
    row.acknowledged = true; result = operation();
  } catch (cause) { failed = true; primary = cause; if (progress.failurePhase === null) progress.failurePhase = progress.phase; }
  finally {
    if (row.returned) {
      progress.phase = `${phase}-lock-cleanup-check`; row.cleanupCheckAttempted = true;
      try {
        if (own === null || !row.acknowledged || !samePolicyDirectory(parentBefore, policyDirectory(parent))
          || !samePolicyDirectory(own, policyDirectory(lock))) policyChanged();
        progress.phase = `${phase}-lock-cleanup`; row.cleanupAttempted = true;
        rmSync(lock, { recursive: true, force: true }); row.cleanupReturned = true;
      } catch (cause) { if (progress.failurePhase === null) progress.failurePhase = progress.phase; cleanupCauses.push(cause); }
    }
  }
  if (failed) throw primary;
  if (cleanupCauses.length !== cleanupStart) throw cleanupCauses[cleanupStart];
  return result as T;
}
/** Preserve the original readers' fatal UTF-8 and optional leading-BOM decoding on the captured sidecar. */
function originalBundleAdmitted(workspace: string, body: Buffer, sidecar: Buffer): boolean {
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(sidecar);
    return verifyAuditorSignatureBytes(workspace, "BUNDLE", body, Buffer.from(decoded, "utf8")).valid;
  } catch { return false; }
}
function captureOriginalPolicy(workspace: string, expectedDigest: string | null) {
  const path = nativeExecutablePolicyPath(workspace);
  const files = capturePolicyFiles([{ root: workspace, path, limit: NATIVE_EXECUTABLE_LIMITS.policyBytes, absent: true },
    { root: workspace, path: `${path}.sig`, limit: 65_536, absent: true }]);
  const body = files.get(path), signature = files.get(`${path}.sig`);
  const assertAdmission = () => {
    if (body === null && signature === null) return;
    if (body === null || signature === null || !originalBundleAdmitted(workspace, body.bytes, signature.bytes))
      throw new NativeExecutableError("EXECUTABLE_AUTHORITY_INVALID", "The reviewed execution policy requires its same-byte admitted BUNDLE signature.");
  };
  assertAdmission();
  const policy = body === null ? { schemaVersion: 1 as const, grants: [], revoked: [] }
    : nativeExecutablePolicySchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body.bytes)));
  const digest = body === null ? null : sha256Hex(body.bytes);
  if (expectedDigest !== digest) policyChanged();
  return { policy, files, assertCurrent() { files.assertCurrent(); assertAdmission(); } };
}
/** One fixed two-member native recipe. Only its real acknowledged renames advance expected targets. */
async function updatePolicyAsync(workspace: string, expectedDigest: string | null,
  change: (policy: NativeExecutablePolicy) => NativeExecutablePolicy, assertDependencies: () => void,
  beforePublish: (() => void) | undefined, refusedNoSign: boolean): Promise<{ path: string; digest: string }> {
  const path = nativeExecutablePolicyPath(workspace), parent = dirname(path), modeMask = process.umask();
  const progress: NativePolicyProgress = { phase: "capture", failurePhase: null, path, signAttempted: false, signReturned: false,
    locks: [], members: [], tempCreationAttempted: false, temp: null, tempReturned: false, tempAcknowledged: false,
    tempCleanupCheckAttempted: false, tempCleanupAttempted: false, tempCleanupReturned: false };
  const closeCauses: unknown[] = [], cleanupCauses: unknown[] = [];
  let tempDirectory: PolicyDirectoryWitness | null = null, stageFd: number | null = null;
  let activeMember: PolicyMemberProgress | null = null;
  try {
    const original = underPolicyLock(parent, "capture", progress, cleanupCauses, () => captureOriginalPolicy(workspace, expectedDigest));
    const policy = nativeExecutablePolicySchema.parse(change(original.policy));
    const body = Buffer.from(`${JSON.stringify(policy, null, 2)}\n`);
    if (body.length > NATIVE_EXECUTABLE_LIMITS.policyBytes) throw new Error("policy too large");
    const authority = captureOrgCommitmentAuthority(workspace);
    const beforeSign = () => {
      if (refusedNoSign || process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing");
      authority(); original.assertCurrent(); assertDependencies();
      if (process.umask() !== modeMask) policyChanged();
      beforePublish?.();
      if (refusedNoSign || process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing");
      authority(); original.assertCurrent(); assertDependencies();
      if (process.umask() !== modeMask) policyChanged();
    };
    beforeSign(); progress.phase = "sign"; progress.signAttempted = true;
    const prepared = await prepareFileSignatureWithAuditor(workspace, path, body, "BUNDLE", beforeSign);
    progress.signReturned = true; beforeSign(); prepared.assertCurrent();
    // Compact only the actual checked private response, preserving every envelope/basis field and insertion order.
    const signature = Buffer.from(JSON.stringify(JSON.parse(prepared.signatureBytes)));
    if (signature.length > 65_536) throw new Error("policy signature too large");
    const assertCurrent = () => {
      beforeSign(); prepared.assertCurrent();
      if (!verifyAuditorSignatureBytes(workspace, "BUNDLE", body, signature).valid)
        throw new NativeExecutableError("EXECUTABLE_AUTHORITY_INVALID", "The prepared execution policy is not currently admitted for BUNDLE.");
    };
    assertCurrent();
    underPolicyLock(parent, "publication", progress, cleanupCauses, () => {
      try {
        assertCurrent(); progress.phase = "temp-create"; progress.tempCreationAttempted = true;
        progress.temp = mkdtempSync(join(parent, ".execution-policy-")); progress.tempReturned = true;
        tempDirectory = policyDirectory(progress.temp);
        if ((tempDirectory.mode & 0o077) !== 0) policyChanged();
        progress.tempAcknowledged = true;
        const assertStage = () => {
          original.files.assertDirectories();
          if (tempDirectory === null || !samePolicyDirectory(tempDirectory, policyDirectory(progress.temp!))) policyChanged();
        };
        const staged: { path: string; target: string; bytes: Buffer; identity: string; witness: PolicyFileWitness; progress: PolicyMemberProgress }[] = [];
        for (const [name, target, bytes] of [["policy.json", path, body], ["policy.sig", `${path}.sig`, signature]] as const) {
          const stage = join(progress.temp, name);
          activeMember = { path: target, openAttempted: false, opened: false, writeAttempted: false, writeReturned: false,
            closeAttempted: false, closed: false, stagedAcknowledged: false, renameAttempted: false, renameReturned: false, targetAcknowledged: false };
          progress.members.push(activeMember); assertCurrent(); assertStage();
          progress.phase = `${name}-open`; activeMember.openAttempted = true; stageFd = openSync(stage, "wx", 0o600); activeMember.opened = true;
          const opened = fstatSync(stageFd), identity = `${opened.dev}:${opened.ino}`;
          if (!opened.isFile() || opened.nlink !== 1 || (opened.mode & 0o777) !== 0o600) policyChanged();
          progress.phase = `${name}-write`; activeMember.writeAttempted = true; writeFileSync(stageFd, bytes); activeMember.writeReturned = true;
          progress.phase = `${name}-close`; activeMember.closeAttempted = true;
          try { closeSync(stageFd); stageFd = null; activeMember.closed = true; } catch (cause) { closeCauses.push(cause); throw cause; }
          assertStage();
          const witness = policyFile(progress.temp, stage, bytes.length);
          if (witness === null || witness.identity !== identity || witness.mode !== 0o600 || !witness.bytes.equals(bytes)) policyChanged();
          activeMember.stagedAcknowledged = true; staged.push({ path: stage, target, bytes, identity, witness, progress: activeMember });
        }
        for (const member of staged) {
          assertCurrent(); assertStage();
          if (!samePolicyFile(member.witness, policyFile(progress.temp, member.path, member.bytes.length))) policyChanged();
          progress.phase = `${member.target === path ? "body" : "signature"}-rename`; member.progress.renameAttempted = true;
          renameSync(member.path, member.target); member.progress.renameReturned = true;
          progress.phase = `${member.target === path ? "body" : "signature"}-acknowledge`;
          original.files.acknowledge(member.target, member.bytes, member.identity); member.progress.targetAcknowledged = true;
        }
        progress.phase = "published-admission"; assertCurrent();
        const actualBody = original.files.get(path), actualSignature = original.files.get(`${path}.sig`);
        if (actualBody === null || actualSignature === null || !actualBody.bytes.equals(body) || !actualSignature.bytes.equals(signature)
          || !verifyAuditorSignatureBytes(workspace, "BUNDLE", actualBody.bytes, actualSignature.bytes).valid) policyChanged();
      } catch (cause) { if (progress.failurePhase === null) progress.failurePhase = progress.phase; throw cause; }
      finally {
        if (stageFd !== null && activeMember !== null && !activeMember.closeAttempted) {
          progress.phase = "stage-close-after-failure"; activeMember.closeAttempted = true;
          try { closeSync(stageFd); stageFd = null; activeMember.closed = true; } catch (cause) { closeCauses.push(cause); }
        }
        if (progress.temp !== null) {
          progress.phase = "temp-cleanup-check"; progress.tempCleanupCheckAttempted = true;
          try {
            original.files.assertDirectories();
            if (tempDirectory === null || !progress.tempAcknowledged || !samePolicyDirectory(tempDirectory, policyDirectory(progress.temp))) policyChanged();
            progress.phase = "temp-cleanup"; progress.tempCleanupAttempted = true;
            rmSync(progress.temp, { recursive: true, force: true }); progress.tempCleanupReturned = true;
          } catch (cause) { if (progress.failurePhase === null) progress.failurePhase = progress.phase; cleanupCauses.push(cause); }
        }
      }
    });
    if (closeCauses.length > 0 || cleanupCauses.length > 0) throw closeCauses[0] ?? cleanupCauses[0];
    progress.phase = "final-continuation"; assertCurrent();
    return { path, digest: sha256Hex(body) };
  } catch (cause) {
    if (progress.failurePhase === null) progress.failurePhase = progress.phase;
    throw new NativeExecutablePolicyPublicationError(policyProgressSnapshot(progress), cause, Object.freeze([...closeCauses]), Object.freeze([...cleanupCauses]));
  }
}

/** Explicit direct-module async approval; no code is loaded or executed and no CLI approval surface is added. */
export async function approveNativeExecutableExtensionAsync(options: {
  workspace: string; manifestPath: string; expectedDigest: string;
  capabilities: readonly NativeExecutableCapability[]; expiresAt: number;
  expectedPolicyDigest: string | null; beforePublish?: () => void;
}): Promise<{ path: string; digest: string }> {
  const refusedNoSign = process.env.AMC_NO_SIGN === "1";
  if (refusedNoSign) throw new Error("no-sign mode does not authorize policy signing");
  try {
  const workspace = resolve(options.workspace), manifestPath = resolve(workspace, options.manifestPath), expectedDigest = options.expectedDigest;
  const capabilities = [...options.capabilities], expiresAt = options.expiresAt, expectedPolicyDigest = options.expectedPolicyDigest, beforePublish = options.beforePublish;
  const snapshot = readNativeExtension({ workspace, manifestPath, expectedDigest, requireSignature: false });
  if (snapshot.manifest.schemaVersion !== 2) throw new NativeExecutableError("EXECUTABLE_DECLARATION_REQUIRED", "Execution approval applies only to a signed v2 executable declaration.");
  const declaration = snapshot.manifest.executable, requested = [...declaration.capabilities];
  if (requested.length !== capabilities.length || new Set(capabilities).size !== requested.length || requested.some(capability => !capabilities.includes(capability)))
    throw new NativeExecutableError("EXECUTABLE_CAPABILITY_MISMATCH", "Explicitly approve exactly the capability set in the reviewed manifest; no inferred or extra grants are accepted.");
  const approvedAt = Date.now();
  const assertExpiry = () => {
    const now = Date.now();
    if (!Number.isSafeInteger(expiresAt) || now < approvedAt || expiresAt <= now || expiresAt - approvedAt > 86_400_000)
      throw new NativeExecutableError("EXECUTABLE_APPROVAL_EXPIRY", "Execution approval needs its original future integer expiry, no more than 24 hours from the explicit approval action.");
  };
  assertExpiry();
  const lock = pluginsInstalledLockPath(workspace), archive = pluginInstalledPackagePath(workspace, declaration.pluginId, declaration.version);
  const rows = [{ root: snapshot.root, path: manifestPath, limit: NATIVE_EXTENSION_LIMITS.manifestBytes },
    { root: snapshot.root, path: `${manifestPath}.sig`, limit: NATIVE_EXTENSION_LIMITS.manifestBytes },
    ...[...snapshot.manifest.contexts, ...Object.values(snapshot.manifest.commands)].map(entry => ({ root: snapshot.root, path: resolve(snapshot.root, entry.path), limit: NATIVE_EXTENSION_LIMITS.fileBytes })),
    { root: workspace, path: lock, limit: NATIVE_EXECUTABLE_LIMITS.policyBytes }, { root: workspace, path: `${lock}.sig`, limit: 65_536 },
    { root: workspace, path: archive, limit: NATIVE_EXECUTABLE_LIMITS.packageBytes }];
  const policyPath = nativeExecutablePolicyPath(workspace), parent = dirname(policyPath);
  for (const row of rows) if (row.path === policyPath || row.path === `${policyPath}.sig`
    || row.path === join(parent, ".execution-policy-write-lock") || row.path.startsWith(`${join(parent, ".execution-policy-write-lock")}${sep}`)
    || (dirname(row.path) === parent && row.path.slice(parent.length + 1).startsWith(".execution-policy-"))) policyChanged();
  const sources = capturePolicyFiles(rows), manifest = sources.get(manifestPath), signature = sources.get(`${manifestPath}.sig`);
  if (manifest === null || signature === null || !manifest.bytes.equals(snapshot.manifestBytes)
    || snapshot.signatureBytes === null || !signature.bytes.equals(snapshot.signatureBytes)) policyChanged();
  for (const entry of [...snapshot.manifest.contexts, ...Object.values(snapshot.manifest.commands)]) {
    const current = sources.get(resolve(snapshot.root, entry.path));
    if (current === null || sha256Hex(current.bytes) !== entry.sha256 || !current.bytes.equals(Buffer.from(snapshot.contents.get(entry.path)!, "utf8"))) policyChanged();
  }
  const assertManifest = () => {
    if (!originalBundleAdmitted(workspace, manifest.bytes, signature.bytes))
      throw new NativeExecutableError("EXECUTABLE_SIGNATURE_INVALID", "The reviewed v2 manifest requires its same-byte admitted BUNDLE signature.");
  };
  assertManifest();
  const publisher = declaration.publisherFingerprint;
  const originalDistrust = installedPluginTrust(workspace, publisher).distrust.filter(entry => entry.keyId.toLowerCase() === publisher.toLowerCase()).map(entry => ({ ...entry }));
  // Actual verifier observation, not a positive own-file handle. All bounded source witnesses precede it.
  const verified = readInstalledNativeExecutable(workspace, declaration);
  const assertDependencies = () => {
    assertExpiry(); sources.assertCurrent(); assertManifest();
    const archiveBytes = assertNativeExecutableInstalled(workspace, verified.reference);
    if (!archiveBytes.equals(sources.get(archive)!.bytes)) policyChanged();
    const current = installedPluginTrust(workspace, publisher), now = Date.now();
    if (distrustAt(originalDistrust, publisher, now) !== undefined || distrustAt(current.distrust, publisher, now) !== undefined)
      throw new NativeExecutableError("EXECUTABLE_SIGNATURE_INVALID", "The originally admitted installed publisher is currently distrusted; no approval is written.");
    sources.assertCurrent(); assertExpiry();
  };
  assertDependencies();
  return updatePolicyAsync(workspace, expectedPolicyDigest, policy => {
    if (policy.revoked.includes(snapshot.manifestDigest)) throw new NativeExecutableError("EXECUTABLE_REVOKED", "A revoked manifest cannot be reapproved. Review a new manifest instead.");
    return { ...policy, grants: [...policy.grants.filter(grant => grant.manifestDigest !== snapshot.manifestDigest),
      { manifestDigest: snapshot.manifestDigest, capabilities: requested, approvedAt, expiresAt }] };
  }, assertDependencies, beforePublish, refusedNoSign);
  } catch (cause) {
    if (cause instanceof NativeExecutableError || cause instanceof NativeExtensionError || cause instanceof NativeExecutablePolicyPublicationError) throw cause;
    throw new NativeExecutablePolicyInputError(cause);
  }
}

/** Persistent direct-module async denial. No extension, package or publisher prerequisite is acquired. */
export async function revokeNativeExecutableExtensionAsync(options: {
  workspace: string; manifestDigest: string; expectedPolicyDigest: string; beforePublish?: () => void;
}): Promise<{ path: string; digest: string }> {
  const refusedNoSign = process.env.AMC_NO_SIGN === "1";
  if (refusedNoSign) throw new Error("no-sign mode does not authorize policy signing");
  const workspace = resolve(options.workspace), manifestDigest = nativeExecutableDigestSchema.parse(options.manifestDigest);
  const expectedPolicyDigest = options.expectedPolicyDigest, beforePublish = options.beforePublish;
  return updatePolicyAsync(workspace, expectedPolicyDigest, policy => ({ ...policy,
    grants: policy.grants.filter(grant => grant.manifestDigest !== manifestDigest), revoked: [...new Set([...policy.revoked, manifestDigest])]
  }), () => {}, beforePublish, refusedNoSign);
}
