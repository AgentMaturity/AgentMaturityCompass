import { lstatSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { canonicalSigningKey } from "../keys/algorithmPolicy.js";
import { assertKeysetComplete, boundProviderKey, keysetCommittedMark } from "../keys/keyset.js";
import { configuredRef, keyPolicy, loadKeysConfig } from "../keys/keysConfig.js";
import { KeyProviderError } from "../keys/provider.js";
import { assertSigningKeyUsable, assertVaultMaySign, getSigningPublicKeyPem } from "../keys/signingKeys.js";
import { signDigestWithPurpose } from "../crypto/signing/signerPurpose.js";
import { withConfigSignaturePairLock } from "../config/configSignaturePair.js";
import { captureOrgFiles, captureOrgPairs, assertOrgPairsCurrent, type OrgPairsSnapshot } from "../org/preparedOrgPairs.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { readContained } from "../utils/containedFs.js";
import { pathExists, writeFileAtomic } from "../utils/fs.js";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { workOrderSchema } from "../workorders/workorderSchema.js";
import { loadWorkOrder, workOrderDigest } from "../workorders/workorderEngine.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { vaultStatus } from "../vault/vault.js";
import { prepareApprovalRequestRecord, type ApprovalRequestRecordInput } from "./approvalChainStore.js";

const INPUT_LIMIT = 1024 * 1024;
const enabled = () => { if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing"); };
interface InputObservation {
  path: string; kind: "bytes" | "absent" | "failed"; bytes: Buffer | null; identity: string | null; mode: number | null;
  failureClass: string | null; strictFailure: boolean; cause: unknown;
}
function observeInput(root: string, path: string): InputObservation {
  try {
    const first = lstatSync(path), bytes = readContained(root, relative(root, path), INPUT_LIMIT), last = lstatSync(path);
    if (first.dev !== last.dev || first.ino !== last.ino || first.size !== last.size || first.mtimeMs !== last.mtimeMs
      || first.ctimeMs !== last.ctimeMs || bytes.length !== last.size)
      throw new Error("approval input changed during its bounded read");
    return { path, kind: "bytes", bytes, identity: `${last.dev}:${last.ino}`, mode: last.mode & 0o777,
      failureClass: null, strictFailure: false, cause: null };
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException | null)?.code;
    return { path, kind: code === "ENOENT" ? "absent" : "failed", bytes: null, identity: null, mode: null,
      failureClass: code === "ENOENT" ? null : canonicalize({ code: code ?? null, name: cause instanceof Error ? cause.name : null, message: String(cause) }),
      strictFailure: code === undefined, cause };
  }
}
function sameObservation(old: InputObservation, next: InputObservation): boolean {
  return old.kind === next.kind && old.identity === next.identity && old.mode === next.mode && old.failureClass === next.failureClass
    && (old.bytes === null ? next.bytes === null : next.bytes !== null && old.bytes.equals(next.bytes));
}

/** Fixed actual bound inputs, captured before the maintained ToolHub inspector and before every new await.
 * This async narrowing requires contained regular single-link files <=1 MiB. Failed reads are not absence.
 */
export function captureApprovalBoundInputs(inputWorkspace: string, inputAgentId: string, workOrderId?: string) {
  const workspace = resolve(inputWorkspace), agentId = resolveAgentId(workspace, inputAgentId);
  const agentPaths = getAgentPaths(workspace, agentId), agentSelection = canonicalize(agentPaths);
  const bodies = ["action-policy.yaml", "tools.yaml", "budgets.yaml"].map(name => join(workspace, ".amc", name));
  const workOrderPath = !workOrderId ? null : join(agentPaths.rootDir, "workorders", `${workOrderId}.json`);
  const paths = [...bodies.flatMap(path => [path, `${path}.sig`]), ...(workOrderPath === null ? [] : [workOrderPath, `${workOrderPath}.sig`])];
  const original = paths.map(path => observeInput(workspace, path));
  const workOrderBytes = workOrderPath === null ? null : original.find(row => row.path === workOrderPath)!.bytes;
  let selectedWorkOrder: ReturnType<typeof workOrderSchema.parse> | null = null;
  if (workOrderBytes !== null) {
    try { selectedWorkOrder = workOrderSchema.parse(JSON.parse(workOrderBytes.toString("utf8")) as unknown); }
    catch { /* Preserve the actual later load/hash recipe's error or caught-null classification. */ }
  }
  const revokePath = selectedWorkOrder === null ? null : join(agentPaths.rootDir, "workorders", `${selectedWorkOrder.workOrderId}.revocation.json`);
  const revoked = revokePath === null ? null : pathExists(revokePath);
  let positiveWorkOrderDigest: string | null = null;
  const assertCurrent = () => {
    if (resolve(inputWorkspace) !== workspace || resolveAgentId(workspace, inputAgentId) !== agentId
      || canonicalize(getAgentPaths(workspace, agentId)) !== agentSelection) throw new Error("original approval input location changed");
    for (const old of original) {
      if (old.strictFailure) throw new Error("approval input bounded snapshot refused", { cause: old.cause });
      if (!sameObservation(old, observeInput(workspace, old.path))) throw new Error("original approval input bytes or read classification changed");
    }
    if (revokePath !== null && pathExists(revokePath) !== revoked) throw new Error("original work-order revocation presence changed");
    if (positiveWorkOrderDigest !== null) {
      const live = loadWorkOrder({ workspace, agentId, workOrderId: workOrderId!, requireValidSignature: true });
      if (workOrderDigest(live) !== positiveWorkOrderDigest) throw new Error("original approval work-order admission changed");
      for (const old of original) if (!sameObservation(old, observeInput(workspace, old.path)))
        throw new Error("original approval input changed during actual work-order admission");
    }
  };
  const assertBoundHashes = (hashes: { policyHash: string; toolsHash: string; budgetsHash: string; workOrderHash: string | null }) => {
    assertCurrent();
    const values = [hashes.policyHash, hashes.toolsHash, hashes.budgetsHash], fallbacks = ["missing-action-policy", "missing-tools", "missing-budgets"];
    for (let at = 0; at < bodies.length; at += 1) {
      const row = original.find(item => item.path === bodies[at])!;
      const expected = row.bytes === null ? sha256Hex(fallbacks[at]!) : sha256Hex(row.bytes);
      if (values[at] !== expected) throw new Error("actual approval hash result differs from the original raw input observation");
    }
    if (hashes.workOrderHash !== null) {
      if (selectedWorkOrder === null || hashes.workOrderHash !== workOrderDigest(selectedWorkOrder) || revoked === true)
        throw new Error("actual approval work-order hash differs from the original signed input");
      positiveWorkOrderDigest = hashes.workOrderHash;
    }
    assertCurrent();
  };
  return Object.freeze({ assertCurrent, assertBoundHashes });
}

/** Original direct artifact purpose; no selected policy mode or remotely refreshed descriptor. */
function captureRequestAuthority(workspace: string) {
  enabled();
  const mark = keysetCommittedMark(workspace), selected = assertKeysetComplete(workspace), keyset = canonicalize(selected);
  if (mark === null || selected === null || mark.sequence !== selected.generation || mark.sha256 !== sha256Hex(keyset))
    throw new Error("approval request needs an existing complete committed key set");
  const markShape = canonicalize({ sequence: mark.sequence, sha256: mark.sha256 });
  const bound = boundProviderKey(workspace, "artifact-seal"), binding = canonicalize(bound), holder = bound?.binding.provider ?? "file";
  const originalPublic = bound?.publicKeyPem ?? getSigningPublicKeyPem(workspace, "artifact-seal"), key = canonicalSigningKey(originalPublic);
  if (key === null) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", holder, "the original approval request signer is unsupported");
  const policyShape = canonicalize(keyPolicy(loadKeysConfig(workspace)));
  let observedUnlocked = false, failure = null as { cause: unknown } | null;
  const assertCurrent = () => {
    if (failure !== null) throw failure.cause;
    try {
      enabled();
      const currentMark = keysetCommittedMark(workspace), settings = loadKeysConfig(workspace), policy = keyPolicy(settings);
      if (canonicalize(currentMark === null ? null : { sequence: currentMark.sequence, sha256: currentMark.sha256 }) !== markShape
        || canonicalize(assertKeysetComplete(workspace)) !== keyset || canonicalize(boundProviderKey(workspace, "artifact-seal")) !== binding
        || canonicalize(policy) !== policyShape) throw new Error("original approval request signing authority changed");
      if (!policy.allowed.includes(key.algorithm) || (holder === "file" && policy.requireNonExportable))
        throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", holder, "the original approval request key policy refuses signing");
      assertSigningKeyUsable(workspace, "artifact-seal", key.pem, holder);
      if (holder === "file") {
        const ref = configuredRef(settings, "artifact-seal");
        if (ref !== null) throw new KeyProviderError("KEY_PROVIDER_HELD", ref.provider, "the original approval request purpose has an unbound provider");
        assertVaultMaySign(workspace, "artifact-seal");
        if (getSigningPublicKeyPem(workspace, "artifact-seal") !== originalPublic) throw new Error("original approval request public key changed");
        const unlocked = vaultStatus(workspace).unlocked;
        if (observedUnlocked && !unlocked) throw new Error("original approval request vault was locked during this attempt");
        observedUnlocked ||= unlocked;
      }
      enabled();
    } catch (cause) { failure = { cause }; throw cause; }
  };
  assertCurrent();
  return Object.freeze({ publicKeyPem: key.pem, algorithm: key.algorithm, assertCurrent, assertPrivateReady() {
    assertCurrent();
    if (holder === "file" && !vaultStatus(workspace).unlocked) throw new Error("approval request vault is locked; unlock before a new attempt");
    assertCurrent();
  } });
}
/** Retains the exact first negative and the actual nested partial; it never invents a successful authority. */
export class ApprovalRequestContinuationError extends Error {
  constructor(readonly primaryCause: unknown, cause: unknown) {
    super("approval request continuation refused; earlier native effects may remain", { cause });
    this.name = "ApprovalRequestContinuationError";
  }
}
interface RequestProgress {
  phase: string; directoryPrefixAttempted: boolean; directoryPrefixReturned: boolean;
  signatureAttempted: boolean; signatureReturned: boolean; signatureAcknowledged: boolean;
  lockAttempted: boolean; lockEntered: boolean; lockReturned: boolean;
  attemptedMember: string | null; returnedMembers: readonly string[]; acknowledgedMembers: readonly string[]; complete: boolean;
}
class ApprovalRequestPublicationError extends Error {
  readonly code = "APPROVAL_REQUEST_INCOMPLETE";
  constructor(readonly progress: Readonly<RequestProgress>, cause: unknown) {
    super("approval request publication did not complete; native and earlier policy effects may remain", { cause });
    this.name = "ApprovalRequestPublicationError";
  }
}

/** Actual direct BUNDLE producer. External callbacks can refuse; only native returned writes advance owned state. */
export function captureApprovalRequestPublication(inputWorkspace: string, beforePublish?: () => void) {
  const workspace = resolve(inputWorkspace), authority = captureRequestAuthority(workspace), caller = beforePublish;
  let entered = false;
  return Object.freeze({ assertPublicCurrent: authority.assertCurrent, async publish(input: ApprovalRequestRecordInput) {
    if (entered) throw new Error("approval request publication already entered; inspect the original attempt");
    entered = true;
    const selected = structuredClone(input), shape = canonicalize(selected);
    let expected: OrgPairsSnapshot | null = null, request: ReturnType<typeof prepareApprovalRequestRecord>["request"] | null = null;
    let signatureBytes: Buffer | null = null, bodyBytes: Buffer | null = null, failure = null as { cause: unknown } | null;
    let agentSelection: string | null = null, parents: { path: string; identity: string; mode: number }[] = [];
    const directory = (path: string) => {
      const stat = lstatSync(path);
      if (!stat.isDirectory()) throw new Error("approval request parent must be a real directory");
      return { path, identity: `${stat.dev}:${stat.ino}`, mode: stat.mode & 0o777 };
    };
    const progress: RequestProgress = { phase: "entry", directoryPrefixAttempted: false, directoryPrefixReturned: false,
      signatureAttempted: false, signatureReturned: false, signatureAcknowledged: false,
      lockAttempted: false, lockEntered: false, lockReturned: false, attemptedMember: null, returnedMembers: [], acknowledgedMembers: [], complete: false };
    const returned: string[] = [], acknowledged: string[] = [];
    const snapshot = () => Object.freeze({ ...progress, returnedMembers: Object.freeze([...returned]), acknowledgedMembers: Object.freeze([...acknowledged]) });
    const intrinsic = () => {
      authority.assertCurrent();
      if (resolve(inputWorkspace) !== workspace || resolve(selected.workspace) !== workspace || canonicalize(input) !== shape)
        throw new Error("original approval request publication input changed");
      if (agentSelection !== null && canonicalize(getAgentPaths(selected.workspace, selected.agentId)) !== agentSelection)
        throw new Error("original approval request agent location changed");
      for (const parent of parents) if (canonicalize(directory(parent.path)) !== canonicalize(parent))
        throw new Error("original approval request parent changed");
      if (expected !== null) assertOrgPairsCurrent(expected);
      if (request !== null && Date.now() > request.expiresTs) throw new Error("approval request expired while signing was prepared");
      if (bodyBytes !== null && signatureBytes !== null && !verifyAuditorSignatureBytes(workspace, "BUNDLE", bodyBytes, signatureBytes).valid)
        throw new Error("prepared approval request signature is no longer admitted");
    };
    const current = () => {
      if (failure !== null) throw failure.cause;
      try { intrinsic(); caller?.(); intrinsic(); }
      catch (cause) { failure = { cause }; throw cause; }
    };
    const assertCurrent = () => {
      if (!progress.complete) throw new Error("approval request publication has not returned complete");
      current();
    };
    try {
      current(); agentSelection = canonicalize(getAgentPaths(selected.workspace, selected.agentId));
      progress.phase = "preparation";
      const prepared = prepareApprovalRequestRecord(selected, phase => {
        if (phase === "attempted") { progress.phase = "directory-prefix"; progress.directoryPrefixAttempted = true; }
        else { progress.directoryPrefixReturned = true; progress.phase = "payload"; }
      });
      request = prepared.request;
      const path = prepared.path, sigPath = `${path}.sig`;
      parents = [dirname(dirname(path)), dirname(path)].map(directory);
      expected = captureOrgPairs([path]);
      if (expected.members.some(row => row.bytes !== null)) throw new Error("generated approval request ID already exists");
      bodyBytes = Buffer.from(JSON.stringify(request, null, 2)); current();
      progress.phase = "signature"; authority.assertPrivateReady(); current(); progress.signatureAttempted = true;
      const signed = await signDigestWithPurpose({ workspace, kind: "BUNDLE", digestHex: sha256Hex(bodyBytes), beforeSign: current });
      progress.signatureReturned = true; current();
      const envelope = signed.envelope;
      if (envelope === undefined || envelope.signer.type !== "VAULT" || envelope.alg !== authority.algorithm
        || Buffer.from(envelope.pubkeyB64, "base64").toString("utf8") !== authority.publicKeyPem || signed.signature !== envelope.sigB64)
        throw new Error("real approval request signature differs from the original direct purpose");
      signatureBytes = Buffer.from(JSON.stringify({ digestSha256: signed.digestSha256, signature: signed.signature,
        signedTs: signed.signedTs, signer: "auditor", envelope }, null, 2));
      current(); progress.signatureAcknowledged = true;
      progress.phase = "lock"; progress.lockAttempted = true;
      withConfigSignaturePairLock(workspace, () => {
        progress.lockEntered = true; current();
        for (const member of [{ path, bytes: bodyBytes! }, { path: sigPath, bytes: signatureBytes! }]) {
          progress.attemptedMember = null; current(); authority.assertPrivateReady(); current();
          progress.phase = "member"; progress.attemptedMember = relative(workspace, member.path);
          writeFileAtomic(member.path, member.bytes, 0o644); returned.push(progress.attemptedMember);
          progress.phase = "readback";
          const own = captureOrgFiles([member.path]).members[0]!;
          if (own.mode !== 0o644 || own.bytes === null || !own.bytes.equals(member.bytes))
            throw new Error("approval request member differs from the exact returned write");
          expected = { members: expected!.members.map(row => row.path === member.path ? own : row) };
          acknowledged.push(progress.attemptedMember); progress.attemptedMember = null;
        }
        current();
      });
      progress.lockReturned = true; current(); progress.complete = true; progress.phase = "complete";
      return Object.freeze({ request: structuredClone(request), path, sigPath, assertCurrent, progress: snapshot });
    } catch (cause) {
      progress.phase = `incomplete:${progress.phase}`;
      throw new ApprovalRequestPublicationError(snapshot(), failure === null ? cause : failure.cause);
    }
  } });
}
