import { lstatSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { readNativeExtension } from "../extensions/nativeExtensionStore.js";
import { signSerializedPayloadWithAuditor } from "../org/orgSigner.js";
import { sha256Hex } from "../utils/hash.js";
import { readInstalledNativeExecutable } from "./nativeExecutablePackage.js";
import { NATIVE_EXECUTABLE_LIMITS, NativeExecutableError, nativeExecutableCapabilitySchema, nativeExecutableDigestSchema, type NativeExecutableCapability } from "./nativeExecutableSchema.js";
import { readNativeExecutableSignedJson } from "./nativeExecutableSource.js";

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
