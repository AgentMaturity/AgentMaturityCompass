/** Gate-policy pair implementation shared by the retained sync API and actual policy-pack preparation. */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { GatePolicy } from "../types.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { getSigningKey, getPublicKeyPem, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { assertKeysetComplete, boundProviderKey, keysetDeclared } from "../keys/keyset.js";
import { getPurposeKeyHistory, readHistory } from "../keys/signingKeys.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { assertPurposePublicationCurrent, capturePurposePublication } from "../keys/purposePublication.js";
import { canonicalize } from "../utils/json.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { captureOrgFiles, captureOrgPairs, assertOrgPairsCurrent, orgPairBytes } from "../org/preparedOrgPairs.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";

interface SignaturePayload {
  digestSha256: string;
  signature: string;
  signedTs: number;
  signer: "auditor";
}

function signPolicyContent(workspace: string, bytes: Buffer): SignaturePayload {
  const digestSha256 = sha256Hex(bytes);
  return {
    digestSha256,
    signature: signHexDigest(digestSha256, getSigningKey(workspace, "config-signature")),
    signedTs: Date.now(),
    signer: "auditor"
  };
}

export function writeSignedGatePolicy(params: {
  workspace: string;
  policyPath: string;
  policy: GatePolicy;
}): { policyPath: string; sigPath: string } {
  const resolved = resolve(params.workspace, params.policyPath);
  ensureDir(dirname(resolved));
  const bytes = Buffer.from(JSON.stringify(params.policy, null, 2), "utf8");
  writeFileAtomic(resolved, bytes, 0o644);
  const signature = signPolicyContent(params.workspace, bytes);
  const sigPath = `${resolved}.sig`;
  writeFileAtomic(sigPath, JSON.stringify(signature, null, 2), 0o644);
  appendTransparencyEntry({
    workspace: params.workspace,
    type: "GATE_POLICY_SIGNED",
    agentId: "system",
    artifact: {
      kind: "policy",
      sha256: signature.digestSha256,
      id: "gate-policy"
    }
  });
  return {
    policyPath: resolved,
    sigPath
  };
}

export function verifyGatePolicySignature(params: {
  workspace: string;
  policyPath: string;
}): { valid: boolean; signatureExists: boolean; reason: string | null; sigPath: string } {
  const resolved = resolve(params.workspace, params.policyPath);
  const sigPath = `${resolved}.sig`;
  if (!pathExists(resolved)) {
    return {
      valid: false,
      signatureExists: false,
      reason: "policy file missing",
      sigPath
    };
  }
  if (!pathExists(sigPath)) {
    return {
      valid: false,
      signatureExists: false,
      reason: "policy signature missing",
      sigPath
    };
  }

  try {
    const payload = JSON.parse(readFileSync(sigPath, "utf8")) as SignaturePayload;
    const bytes = readFileSync(resolved);
    const digest = sha256Hex(bytes);
    if (digest !== payload.digestSha256) {
      return {
        valid: false,
        signatureExists: true,
        reason: "policy digest mismatch",
        sigPath
      };
    }
    assertKeysetComplete(params.workspace);
    const keys = getPurposeKeyHistory(params.workspace, "config-signature");
    if (keysetDeclared(params.workspace) && boundProviderKey(params.workspace, "config-signature") === null) {
      const history = readHistory(params.workspace, "auditor", getPublicKeyPem(params.workspace, "auditor"));
      keys.push(...(history?.entries.filter(entry => entry.source === "imported").map(entry => entry.publicKeyPem) ?? []));
    }
    const valid = verifyHexDigestAny(digest, payload.signature, keys);
    return {
      valid,
      signatureExists: true,
      reason: valid ? null : "signature verification failed",
      sigPath
    };
  } catch (error) {
    return {
      valid: false,
      signatureExists: true,
      reason: `invalid signature payload: ${String(error)}`,
      sigPath
    };
  }
}

/** Internal prepare-only boundary. The actual caller owns its later GATE_POLICY_SIGNED log and original run gate. */
export async function prepareSignedGatePolicy(input: { workspace: string; policyPath: string; policy: GatePolicy },
  options: { beforePublish?: () => void; assertInputsCurrent?: () => void } = {}) {
  const workspace = input.workspace, path = resolve(workspace, input.policyPath), sigPath = `${path}.sig`, policy = structuredClone(input.policy);
  const beforePublish = options.beforePublish, assertInputsCurrent = options.assertInputsCurrent;
  beforePublish?.(); assertInputsCurrent?.();
  const before = captureOrgPairs([path]), bytes = Buffer.from(JSON.stringify(policy, null, 2));
  const digestSha256 = sha256Hex(bytes), authority = capturePurposePublication(workspace, "config-signature");
  const beforeSign = () => {
    beforePublish?.(); assertInputsCurrent?.();
    if (canonicalize(assertKeysetComplete(workspace)) !== authority.keyset) throw new Error("original gate-policy purpose authority changed while preparing Sign");
    assertOrgPairsCurrent(before);
  };
  beforeSign();
  const signed = await signWithPurposeKey(workspace, "config-signature", Buffer.from(digestSha256, "hex"), { beforeSign });
  beforePublish?.(); assertInputsCurrent?.(); assertPurposePublicationCurrent(workspace, authority, signed);
  const sidecar = Buffer.from(JSON.stringify({ digestSha256, signature: signed.signature.toString("base64"), signedTs: Date.now(), signer: "auditor" }, null, 2));
  let published: ReturnType<typeof captureOrgPairs> | null = null;
  const assertCurrent = () => { assertPurposePublicationCurrent(workspace, authority, signed); if (published !== null) assertOrgPairsCurrent(published); };
  return { digestSha256, assertCurrent, publish(recordEffect: (path: string) => void = () => {}) {
    return withControlFileLock({ root: dirname(path), name: "gate-policy-writer", operation: () => {
      let expected = before;
      const guard = () => { beforePublish?.(); assertInputsCurrent?.(); assertCurrent(); assertOrgPairsCurrent(expected); };
      const observe = (member: string, exact: Buffer) => {
        const captured = captureOrgFiles([member]), row = captured.members[0]!;
        if (row.mode !== 0o644 || row.bytes === null || !row.bytes.equals(exact)) throw new Error("published gate-policy member differs from its prepared bytes");
        expected = { members: expected.members.map(old => old.path === member ? row : old) };
      };
      guard(); const committed: string[] = []; let attemptedPath = path;
      try {
        ensureDir(dirname(path)); writeFileAtomic(path, bytes, 0o644); committed.push(path); recordEffect(path); observe(path, bytes);
        attemptedPath = sigPath; guard(); writeFileAtomic(sigPath, sidecar, 0o644); committed.push(sigPath); recordEffect(sigPath); observe(sigPath, sidecar);
        guard(); published = expected;
        if (!orgPairBytes(published, path)?.equals(bytes) || !orgPairBytes(published, sigPath)?.equals(sidecar)
          || published.members.some(row => row.mode !== 0o644)) throw new Error("published gate-policy pair changed before observation");
      } catch (cause) { throw new GatePolicyPublicationError(Object.freeze([...committed]), attemptedPath, cause); }
      return { policyPath: path, sigPath };
    } });
  } };
}
class GatePolicyPublicationError extends Error {
  readonly code = "GATE_POLICY_PARTIAL";
  constructor(readonly publishedPaths: readonly string[], readonly attemptedPath: string, cause: unknown) {
    super("gate-policy pair publication is incomplete; earlier members remain committed", { cause }); this.name = "GatePolicyPublicationError";
  }
}
