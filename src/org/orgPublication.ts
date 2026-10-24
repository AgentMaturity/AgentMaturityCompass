import { dirname, join, relative, resolve } from "node:path";
import YAML from "yaml";
import { assertPolicySignerCurrent, describePolicySigner } from "../crypto/signing/signer.js";
import { capturePurposePublication } from "../keys/purposePublication.js";
import { keyPolicy, loadKeysConfig } from "../keys/keysConfig.js";
import { assertKeysetComplete, boundProviderKey } from "../keys/keyset.js";
import { vaultStatus } from "../vault/vault.js";
import { loadTrustConfig } from "../trust/trustConfig.js";
import { canonicalize } from "../utils/json.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { appendTransparencyEntryAsync } from "../transparency/logChain.js";
import { TransparencyMerkleLagError } from "../transparency/merkleIndexState.js";
import { captureOrgPairs, assertOrgPairsCurrent, orgPairBytes } from "./preparedOrgPairs.js";
import { verifyAuditorSignatureBytes } from "./orgSignatureBytes.js";
import { defaultOrgConfig, orgConfigPath } from "./orgStore.js";
import { orgSchema, orgSignatureSchema, type OrgConfig } from "./orgSchema.js";
import { verifySignatureEnvelope } from "../crypto/signing/signatureEnvelope.js";
import { assertValidOrgGraph } from "./orgValidator.js";

export interface OrgEffectOptions { beforePublish?: () => void }
// Only the two existing org recipes can reach this private capture. No caller-selected kind/key/provider API.
function captureAuthority(workspace: string, kind: "BUNDLE" | "ORG_SCORECARD", beforePublish?: () => void) {
  workspace = resolve(workspace);
  const assertSigningEnabled = () => { if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing"); };
  assertSigningEnabled(); beforePublish?.(); assertSigningEnabled();
  const descriptor = describePolicySigner(workspace, kind), policy = JSON.stringify(loadTrustConfig(workspace));
  const purpose = descriptor.mode === "VAULT" ? capturePurposePublication(workspace, "artifact-seal") : null;
  const keyset = purpose?.keyset ?? canonicalize(assertKeysetComplete(workspace));
  const selectedPolicy = descriptor.mode === "VAULT" ? canonicalize(keyPolicy(loadKeysConfig(workspace))) : null;
  const assertSigningCurrent = () => {
    assertPolicySignerCurrent(workspace, descriptor);
    if (JSON.stringify(loadTrustConfig(workspace)) !== policy || canonicalize(assertKeysetComplete(workspace)) !== keyset
      || (selectedPolicy !== null && canonicalize(keyPolicy(loadKeysConfig(workspace))) !== selectedPolicy))
      throw new Error("original org publication authority changed while preparing the operation");
    if (descriptor.mode === "VAULT" && boundProviderKey(workspace, "artifact-seal") === null && !vaultStatus(workspace).unlocked)
      throw new Error("original org publication vault is locked; unlock before publication");
  };
  const assertCurrent = () => { assertSigningEnabled(); beforePublish?.(); assertSigningCurrent(); };
  return { descriptor, assertCurrent, assertSigningCurrent };
}
export const captureOrgScorecardAuthority = (workspace: string, beforePublish?: () => void) =>
  captureAuthority(workspace, "ORG_SCORECARD", beforePublish).assertCurrent;
export const captureOrgCommitmentAuthority = (workspace: string, beforePublish?: () => void) =>
  captureAuthority(workspace, "BUNDLE", beforePublish).assertCurrent;

/** Exact config bytes consumed by computation; configTrusted still comes from the existing verifier. */
export function captureOrgComputationInputs(workspace: string) {
  const path = orgConfigPath(workspace), previous = captureOrgPairs([path]), bytes = orgPairBytes(previous, path);
  const config = bytes === null ? defaultOrgConfig() : orgSchema.parse(YAML.parse(bytes.toString("utf8")));
  assertValidOrgGraph(config);
  return { config, assertCurrent: () => assertOrgPairsCurrent(previous) };
}
export class OrgFollowupError extends Error {
  readonly code = "ORG_FOLLOWUP_PARTIAL";
  readonly entryHash: string | null;
  readonly pendingRecorded: boolean | null;
  readonly auditMayHaveProgressed: boolean;
  constructor(readonly phase: "log" | "audit" | "mirror", readonly publishedPaths: readonly string[],
    readonly auditEventId: string | null, cause: unknown, completedEntryHash: string | null = null, readonly attemptedPath: string | null = null) {
    super("org files are already published; a later operation is incomplete; inspect its phase and cause before retrying", { cause });
    this.name = "OrgFollowupError";
    this.entryHash = cause instanceof TransparencyMerkleLagError ? cause.entryHash : completedEntryHash;
    this.pendingRecorded = cause instanceof TransparencyMerkleLagError ? cause.pendingRecorded : null;
    this.auditMayHaveProgressed = phase === "audit";
  }
}

/** Retain the original config writer authority through the existing later human-audit and workspace-log waits. */
export function prepareOrgConfigUpdateLog(workspace: string, beforePublish: () => void, beforeSecondaryPublish: () => void = beforePublish) {
  const original = captureAuthority(workspace, "BUNDLE", beforePublish), assertAuthority = original.assertCurrent;
  // Recompute remains best-effort. Failure to capture its distinct initial signer must not fail the primary edit,
  // but it must prevent a later secondary recompute from adopting a fresh authority after the first wait.
  let assertScorecardAuthority: () => void;
  try { assertScorecardAuthority = captureOrgScorecardAuthority(workspace, beforeSecondaryPublish); }
  catch (error) { assertScorecardAuthority = () => { throw error; }; }
  return { assertCurrent: assertAuthority, published(path: string, config: OrgConfig) {
    const publishedPaths = Object.freeze([relative(workspace, path), relative(workspace, `${path}.sig`)]);
    try {
    assertAuthority();
    const snapshot = captureOrgPairs([path]), body = orgPairBytes(snapshot, path), signature = orgPairBytes(snapshot, `${path}.sig`);
    if (snapshot.members.some(member => member.mode !== 0o644) || body === null || signature === null || !body.equals(Buffer.from(YAML.stringify(config)))
      || !verifyAuditorSignatureBytes(workspace, "BUNDLE", body, signature).valid)
      throw new Error("published org config does not match this operation");
    const digest = sha256Hex(body), signed = orgSignatureSchema.parse(JSON.parse(signature.toString("utf8")));
    if (signed.envelope === undefined || signed.signature !== signed.envelope.sigB64
      || signed.envelope.signer.type !== original.descriptor.mode || signed.envelope.alg !== original.descriptor.algorithm
      || !verifySignatureEnvelope(digest, signed.envelope, { trustedPublicKeys: [original.descriptor.publicKeyPem], requireTrustedKey: true }))
      throw new Error("published org config was not signed by the original operation authority");
    return { beforeRecompute() { beforeSecondaryPublish(); original.assertSigningCurrent(); assertScorecardAuthority(); assertOrgPairsCurrent(snapshot); },
      async append(id: string, auditEventId: string) {
      try {
        return await appendTransparencyEntryAsync({ workspace, type: "ORG_CONFIG_UPDATED", agentId: "org",
          artifact: { kind: "policy", sha256: digest, id } }, { beforeCommit: () => {
          withControlFileLock({ root: join(workspace, ".amc"), name: "org-config-pair", operation: () => {
            assertAuthority(); assertOrgPairsCurrent(snapshot);
          } });
        } });
      } catch (error) { throw new OrgFollowupError("log", publishedPaths, auditEventId, error); }
    } };
    } catch (error) { throw new OrgFollowupError("log", publishedPaths, null, error); }
  } };
}

/** The optional unsigned CLI copy keeps its original post-audit position and exact preawait target CAS. */
export function prepareOrgCommitmentMirror(workspace: string, outFile: string | undefined, signedPath: string) {
  const path = outFile === undefined ? null : resolve(workspace, outFile), signed = resolve(signedPath);
  if (path === `${signed}.sig`) throw new Error("org output copy overlaps the signed sidecar");
  const before = path === null || path === signed ? null : captureOrgPairs([path]);
  return { path: path === null ? null : relative(workspace, path), publish(markdown: string, assertCurrent: () => void) {
    if (path === null || path === signed) return;
    withControlFileLock({ root: join(workspace, ".amc"), name: "org-auditor-pairs", operation: () => {
      assertCurrent(); assertOrgPairsCurrent(before!);
      ensureDir(dirname(path)); writeFileAtomic(path, markdown, 0o644);
    } });
  } };
}
