import { join } from "node:path";
import YAML from "yaml";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { readContainedOrNull, writeContained } from "../utils/containedFs.js";
import { ensureDir } from "../utils/fs.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { assertOwnerMode } from "../mode/mode.js";
import { assertPolicySignerCurrent, describePolicySigner, signDigestWithPolicy, signDigestWithPolicyAsync } from "../crypto/signing/signer.js";
import { signingPurposeForKind, type SignKind, type SignedDigest } from "../crypto/signing/signerTypes.js";
import { verifySignatureEnvelope } from "../crypto/signing/signatureEnvelope.js";
import { getPurposeKeyHistory } from "../keys/signingKeys.js";
import { captureOrgPairsAuthority } from "../org/preparedOrgPairs.js";
import { captureConfigSignatureAuthority } from "../config/configSignaturePair.js";
import { signingKeyId, verifyWithKey } from "../keys/algorithmPolicy.js";
import { assertKeysetComplete, boundProviderKey } from "../keys/keyset.js";
import { capturePurposePublication, assertPurposePublicationCurrent } from "../keys/purposePublication.js";
import type { KeyProviderId } from "../keys/provider.js";
import { orgSignatureSchema } from "../org/orgSchema.js";
import type { SignedFileVerification } from "../org/orgSigner.js";
import { installedPluginsLockSchema, pluginRegistryConfigSchema, type InstalledPluginsLock, type PluginRegistryConfig } from "./pluginRegistrySchema.js";

const BASE = ".amc/plugins", REG = `${BASE}/registries.yaml`, LOCK = `${BASE}/installed.lock.json`;
const POLICIES = [
  ["actionPolicySha256", ".amc/action-policy.yaml", "missing-action-policy"], ["toolsSha256", ".amc/tools.yaml", "missing-tools"],
  ["budgetsSha256", ".amc/budgets.yaml", "missing-budgets"], ["approvalPolicySha256", ".amc/approval-policy.yaml", "missing-approval-policy"],
  ["opsPolicySha256", ".amc/ops-policy.yaml", "missing-ops-policy"], ["registriesSha256", REG, "missing-plugin-registries"]
] as const;
const INPUTS = [...new Set([...POLICIES.map(row => row[1]), REG, LOCK, ".amc/trust.yaml", ".amc/amc.config.yaml"])].flatMap(rel => [rel, `${rel}.sig`]);
type State = Map<string, Buffer | null>;
function state(workspace: string): State { return new Map(INPUTS.map(rel => [rel, readContainedOrNull(workspace, rel, Number.MAX_SAFE_INTEGER)])); }
function stamp(value: State): string { return canonicalize([...value].map(([rel, bytes]) => [rel, bytes?.toString("base64") ?? null])); }
function withPluginPublicationLock<T>(workspace: string, operation: () => T): T {
  return withControlFileLock({ root: join(workspace, BASE), name: "plugin-initialization", operation });
}

/** Workspace signatures use exact purpose history. NOTARY mode is authorized by the authenticated selected-kind policy and current pin. */
export function verifyPluginSignedFile(workspace: string, rel: string, kind: SignKind): SignedFileVerification {
  try { return verifyPluginSignedBytes(workspace, rel, kind, readContainedOrNull(workspace, rel, Number.MAX_SAFE_INTEGER), readContainedOrNull(workspace, `${rel}.sig`, Number.MAX_SAFE_INTEGER)); }
  catch { return { valid: false, signatureExists: false, reason: "plugin signed file is invalid", path: join(workspace, rel), sigPath: join(workspace, `${rel}.sig`) }; }
}
/** Verify actual captured bytes without reopening the named file. The path labels diagnostics, never authority. */
export function verifyPluginSignedBytes(workspace: string, rel: string, kind: SignKind, bytes: Buffer | null, sidecar: Buffer | null): SignedFileVerification {
  const path = join(workspace, rel), sigPath = `${path}.sig`;
  const signatureExists = sidecar !== null;
  try {
    if (bytes === null || sidecar === null) return { valid: false, signatureExists, reason: bytes === null ? "file missing" : "signature missing", path, sigPath };
    assertKeysetComplete(workspace);
    const signed = orgSignatureSchema.parse(JSON.parse(sidecar.toString("utf8"))), digest = sha256Hex(bytes);
    if (digest !== signed.digestSha256) return { valid: false, signatureExists, reason: "digest mismatch", path, sigPath };
    const notary = signed.envelope?.signer.type === "NOTARY" ? describePolicySigner(workspace, kind) : null;
    const keys = notary === null ? getPurposeKeyHistory(workspace, signingPurposeForKind(kind))
      : notary.mode === "NOTARY" ? [notary.publicKeyPem] : [];
    const valid = signed.envelope === undefined
      ? keys.some(pem => verifyWithKey(Buffer.from(digest, "hex"), pem, Buffer.from(signed.signature, "base64")))
      : signed.signature === signed.envelope.sigB64 && verifySignatureEnvelope(digest, signed.envelope, { trustedPublicKeys: keys, requireTrustedKey: true });
    return { valid, signatureExists, reason: valid ? null : "signature verify failed", path, sigPath };
  } catch { return { valid: false, signatureExists, reason: "plugin signed file is invalid", path, sigPath }; }
}

function authority(workspace: string, kind: SignKind) {
  const descriptor = describePolicySigner(workspace, kind), purpose = signingPurposeForKind(kind);
  return { descriptor, captured: descriptor.mode === "VAULT" ? capturePurposePublication(workspace, purpose) : null,
    provider: (boundProviderKey(workspace, purpose)?.binding.provider ?? "file") as KeyProviderId };
}
type Authority = ReturnType<typeof authority>;
function current(workspace: string, captured: Authority, signed: SignedDigest): void {
  assertPolicySignerCurrent(workspace, captured.descriptor);
  const envelope = signed.envelope;
  if (envelope === undefined || envelope.sigB64 !== signed.signature
    || !verifySignatureEnvelope(signed.digestSha256, envelope, { trustedPublicKeys: [captured.descriptor.publicKeyPem], requireTrustedKey: true })) throw new Error("prepared plugin signature no longer matches its selected signer");
  if (captured.captured !== null) {
    const publicKeyPem = Buffer.from(envelope.pubkeyB64, "base64").toString("utf8"), keyId = signingKeyId(publicKeyPem);
    if (keyId === null) throw new Error("prepared plugin signature key is unsupported");
    assertPurposePublicationCurrent(workspace, captured.captured, { provider: captured.provider, algorithm: envelope.alg,
      publicKeyPem, keyId, signature: Buffer.from(signed.signature, "base64") });
  }
}
interface Target { rel: string; kind: SignKind; bytes: Buffer; authority: Authority }
function target(workspace: string, rel: string, kind: SignKind, bytes: Buffer): Target { return { rel, kind, bytes, authority: authority(workspace, kind) }; }
interface Plan { before: State; targets: Target[] }
export interface PluginInitializationResult { registriesPath: string; registriesSigPath: string; lockPath: string; lockSigPath: string }
const result = (workspace: string): PluginInitializationResult => ({ registriesPath: join(workspace, REG), registriesSigPath: join(workspace, `${REG}.sig`), lockPath: join(workspace, LOCK), lockSigPath: join(workspace, `${LOCK}.sig`) });

function prepare(workspace: string, registries: PluginRegistryConfig, emptyLock: InstalledPluginsLock): Plan {
  assertOwnerMode(workspace, "plugin init");
  const before = state(workspace), targets: Target[] = [], registry = Buffer.from(YAML.stringify(pluginRegistryConfigSchema.parse(registries)));
  for (const [rel, kind] of [[REG, "BUNDLE"], [LOCK, "INSTALLED_LOCK"]] as const) {
    const body = before.get(rel)!, sidecar = before.get(`${rel}.sig`)!;
    if ((body === null) !== (sidecar === null)) throw new Error("plugin initialization refuses an incomplete existing signed pair; recover the reviewed pair first");
    if (body !== null && !verifyPluginSignedBytes(workspace, rel, kind, body, sidecar).valid) throw new Error("plugin initialization refuses an invalid existing signed pair");
  }
  if (before.get(REG) === null) targets.push(target(workspace, REG, "BUNDLE", registry));
  else pluginRegistryConfigSchema.parse(YAML.parse(before.get(REG)!.toString("utf8")));
  if (before.get(LOCK) === null) {
    const lock = installedPluginsLockSchema.parse(structuredClone(emptyLock));
    for (const [key, rel, fallback] of POLICIES) lock.policySnapshot[key] = sha256Hex(rel === REG ? before.get(REG) ?? registry : before.get(rel) ?? fallback);
    targets.push(target(workspace, LOCK, "INSTALLED_LOCK", Buffer.from(JSON.stringify(lock, null, 2))));
  } else installedPluginsLockSchema.parse(JSON.parse(before.get(LOCK)!.toString("utf8")));
  return { before, targets };
}

class PluginInitializationPublicationError extends Error {
  readonly code = "PLUGIN_INITIALIZATION_PARTIAL";
  constructor(readonly publishedPaths: readonly string[]) {
    super(`plugin initialization published ${publishedPaths.join(", ")}; publication is incomplete. Recover the reviewed signed pairs before retrying`);
    this.name = "PluginInitializationPublicationError";
  }
}
function publish(workspace: string, plan: Plan, signatures: SignedDigest[], ownerCommand: "plugin init" | null, beforeOutput?: () => void): void {
  withPluginPublicationLock(workspace, () => {
    if (ownerCommand !== null) assertOwnerMode(workspace, ownerCommand);
    if (stamp(state(workspace)) !== stamp(plan.before)) throw new Error("plugin initialization inputs changed while signatures were prepared; retry");
    plan.targets.forEach((item, index) => current(workspace, item.authority, signatures[index]!));
    beforeOutput?.();
    ensureDir(join(workspace, BASE, "installed")); ensureDir(join(workspace, BASE, "pending"));
    const published: string[] = [];
    try {
      plan.targets.forEach((item, index) => {
        writeContained(workspace, item.rel, item.bytes, 0o644); published.push(item.rel);
        writeContained(workspace, `${item.rel}.sig`, JSON.stringify(signatures[index]!, null, 2), 0o644); published.push(`${item.rel}.sig`);
      });
    } catch (error) { if (published.length > 0) throw new PluginInitializationPublicationError(Object.freeze([...published])); throw error; }
  });
}

export function initializePluginFiles(workspace: string, registries: PluginRegistryConfig, emptyLock: InstalledPluginsLock): PluginInitializationResult {
  const plan = prepare(workspace, registries, emptyLock), signatures = plan.targets.map(item => signDigestWithPolicy({ workspace, kind: item.kind, digestHex: sha256Hex(item.bytes), expectedSigner: item.authority.descriptor }));
  publish(workspace, plan, signatures, "plugin init"); return result(workspace);
}
export async function initializePluginFilesAsync(workspace: string, registries: PluginRegistryConfig, emptyLock: InstalledPluginsLock): Promise<PluginInitializationResult> {
  const plan = prepare(workspace, registries, emptyLock), signatures: SignedDigest[] = [];
  // Capture both actual missing-pair purposes before either signature can yield. Existing pairs need admission, not new signing authority.
  const keyset = plan.targets.length === 0 ? null : canonicalize(assertKeysetComplete(workspace));
  const original = plan.targets.map(item => item.kind === "BUNDLE" ? captureOrgPairsAuthority(workspace)
    : item.authority.descriptor.mode === "VAULT" ? captureConfigSignatureAuthority(workspace).assertCurrent : null);
  const assertBeforeOutput = () => {
    assertOwnerMode(workspace, "plugin init");
    if (keyset !== null && canonicalize(assertKeysetComplete(workspace)) !== keyset)
      throw new Error("original plugin initialization key set changed while signing");
    plan.targets.forEach((item, index) => {
      assertPolicySignerCurrent(workspace, item.authority.descriptor); original[index]?.();
      if (item.authority.captured !== null && canonicalize(assertKeysetComplete(workspace)) !== item.authority.captured.keyset)
        throw new Error("original plugin initialization purpose generation changed while signing");
    });
    for (const [rel, kind] of [[REG, "BUNDLE"], [LOCK, "INSTALLED_LOCK"]] as const) {
      const body = plan.before.get(rel)!, sidecar = plan.before.get(`${rel}.sig`)!;
      if (body !== null && !verifyPluginSignedBytes(workspace, rel, kind, body, sidecar).valid)
        throw new Error("plugin initialization existing signed pair is no longer admitted");
    }
    signatures.forEach((signed, index) => current(workspace, plan.targets[index]!.authority, signed));
    if (stamp(state(workspace)) !== stamp(plan.before)) throw new Error("plugin initialization inputs changed while signatures were prepared; retry");
  };
  const beforeSign = () => withPluginPublicationLock(workspace, assertBeforeOutput);
  for (const item of plan.targets) signatures.push(await signDigestWithPolicyAsync({ workspace, kind: item.kind,
    digestHex: sha256Hex(item.bytes), expectedSigner: item.authority.descriptor, beforeSign }));
  // This old-plan gate is preparation-only: publication never replays it after replacing one of its own members.
  publish(workspace, plan, signatures, "plugin init", assertBeforeOutput); return result(workspace);
}

/** Existing synchronous compatibility saves sign before replacing either member, then join the same publication lock. */
export function savePluginSignedFile(workspace: string, rel: string, kind: SignKind, bytes: Buffer): { path: string; sigPath: string } {
  const before = state(workspace), item = target(workspace, rel, kind, Buffer.from(bytes));
  const signed = signDigestWithPolicy({ workspace, kind, digestHex: sha256Hex(item.bytes), expectedSigner: item.authority.descriptor });
  publish(workspace, { before, targets: [item] }, [signed], null);
  return { path: join(workspace, rel), sigPath: join(workspace, `${rel}.sig`) };
}
