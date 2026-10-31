import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import YAML from "yaml";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { getSigningKey, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { publicKeyFromPrivate } from "../crypto/keyHistoryEnvelope.js";
import { getPurposeKeyHistory } from "../keys/signingKeys.js";
import { assertKeysetComplete } from "../keys/keyset.js";
import { signingKeyId } from "../keys/algorithmPolicy.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { assertPurposePublicationCurrent, capturePurposePublication } from "../keys/purposePublication.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { readContainedOrNull, writeContained } from "../utils/containedFs.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { openLedger } from "../ledger/ledger.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { outcomeContractSchema, type OutcomeContract } from "./outcomeContractSchema.js";

interface SignaturePayload {
  digestSha256: string;
  signature: string;
  signedTs: number;
  signer: "auditor";
}

function outcomesDir(workspace: string, agentId?: string): string {
  const paths = getAgentPaths(workspace, resolveAgentId(workspace, agentId));
  return join(paths.rootDir, "outcomes");
}

export function outcomeContractPath(workspace: string, agentId?: string): string {
  return join(outcomesDir(workspace, agentId), "contract.yaml");
}

function outcomeContractSigPath(workspace: string, agentId?: string): string {
  return `${outcomeContractPath(workspace, agentId)}.sig`;
}

function defaultOutcomeContract(agentId: string): OutcomeContract {
  return outcomeContractSchema.parse({
    outcomeContract: {
      version: 1,
      agentId,
      title: "Agent Outcome Contract",
      description: "Defines measurable value signals and evidence requirements.",
      windowDefaults: {
        reportingWindowDays: 14,
        minObservedRatioForClaims: 0.6
      },
      metrics: [
        {
          metricId: "functional.task_success_rate",
          category: "Functional",
          description: "Percent of work orders completed without rework.",
          type: "ratio",
          numeratorSignal: "workorder.completed",
          denominatorSignal: "workorder.started",
          target: {
            level3: 0.7,
            level4: 0.85,
            level5: 0.95
          },
          evidenceRules: {
            trustTierAtLeast: "OBSERVED",
            requiresNoAudit: ["APPROVAL_REPLAY_ATTEMPTED", "EXECUTE_WITHOUT_TICKET_ATTEMPTED"]
          }
        },
        {
          metricId: "economic.cost_per_success",
          category: "Economic",
          description: "Tokens or cost per successful work order.",
          type: "derived",
          inputs: ["llm.tokens", "workorder.completed"],
          target: {
            level3: "<=baseline",
            level4: "<=baseline*0.9",
            level5: "<=baseline*0.8"
          },
          evidenceRules: {
            trustTierAtLeast: "OBSERVED"
          }
        },
        {
          metricId: "emotional.user_rating_avg",
          category: "Emotional",
          description: "Average user rating.",
          type: "avg",
          signal: "feedback.rating",
          target: {
            level3: 3.5,
            level4: 4.2,
            level5: 4.6
          },
          evidenceRules: {
            trustTierAtLeast: "ATTESTED",
            minSampleSize: 20
          }
        },
        {
          metricId: "brand.truth_protocol_compliance",
          category: "Brand",
          description: "High-risk responses with truth protocol sections.",
          type: "ratio",
          numeratorSignal: "truth_protocol.present",
          denominatorSignal: "truth_protocol.required",
          target: {
            level3: 0.8,
            level4: 0.95,
            level5: 0.99
          },
          evidenceRules: {
            trustTierAtLeast: "OBSERVED"
          }
        },
        {
          metricId: "lifetime.repeat_usage_7d",
          category: "Lifetime",
          description: "Users returning within 7 days.",
          type: "ratio",
          numeratorSignal: "user.returned_7d",
          denominatorSignal: "user.active",
          target: {
            level3: 0.25,
            level4: 0.4,
            level5: 0.55
          },
          evidenceRules: {
            trustTierAtLeast: "ATTESTED"
          }
        }
      ]
    }
  });
}

export function loadOutcomeContract(workspace: string, agentId?: string): OutcomeContract {
  const path = outcomeContractPath(workspace, agentId);
  if (!pathExists(path)) {
    throw new Error(`Outcome contract missing: ${path}`);
  }
  return outcomeContractSchema.parse(YAML.parse(readUtf8(path)) as unknown);
}

function signContractBytes(workspace: string, bytes: Buffer): { payload: SignaturePayload; signerFpr: string } {
  const digestSha256 = sha256Hex(bytes);
  const privateKey = getSigningKey(workspace, "config-signature");
  return { payload: { digestSha256, signature: signHexDigest(digestSha256, privateKey), signedTs: Date.now(), signer: "auditor" },
    signerFpr: signingKeyId(publicKeyFromPrivate(privateKey))!.slice(0, 16) };
}

function withContractPublicationLock<T>(workspace: string, agentId: string, operation: () => T): T {
  return withControlFileLock({ root: outcomesDir(workspace, agentId), name: "outcome-contract", operation });
}

function recordContract(workspace: string, agentId: string, bytes: Buffer, sigPayload: SignaturePayload, signerFpr: string): void {
  const contractFile = outcomeContractPath(workspace, agentId);
  const contractId = sha256Hex(bytes).slice(0, 24);
  const ledger = openLedger(workspace);
  try {
    const existing = ledger.listOutcomeContracts().find(row => row.contract_id === contractId);
    if (existing) {
      // Content IDs are immutable. A re-sign must not overwrite the first publication's signer record.
      if (existing.sig_valid !== 1 || existing.sha256 !== sigPayload.digestSha256 || existing.agent_id !== agentId
        || existing.file_path !== relative(workspace, contractFile).replace(/\\/g, "/")) throw new Error("outcome contract content-id collision");
      return;
    }
    ledger.insertOutcomeContract({
      contract_id: contractId,
      agent_id: agentId,
      file_path: relative(workspace, contractFile).replace(/\\/g, "/"),
      sha256: sigPayload.digestSha256,
      sig_valid: 1,
      signer_fpr: signerFpr
    });
  } finally {
    ledger.close();
  }
}

function logContract(workspace: string, agentId: string, digestSha256: string): void {
  appendTransparencyEntry({
    workspace,
    type: "OUTCOME_CONTRACT_SIGNED",
    agentId,
    artifact: {
      kind: "policy",
      sha256: digestSha256,
      id: `outcome-contract-${agentId}`
    }
  });

}

function signContractUnlocked(workspace: string, agentId: string): { sigPath: string; digestSha256: string } {
  const contractFile = outcomeContractPath(workspace, agentId);
  if (!pathExists(contractFile)) throw new Error(`Outcome contract missing: ${contractFile}`);
  const bytes = readFileSync(contractFile), signed = signContractBytes(workspace, bytes), sigPath = outcomeContractSigPath(workspace, agentId);
  writeFileAtomic(sigPath, JSON.stringify(signed.payload, null, 2), 0o644);
  recordContract(workspace, agentId, bytes, signed.payload, signed.signerFpr);
  return { sigPath, digestSha256: signed.payload.digestSha256 };
}

export function signOutcomeContract(workspace: string, agentId?: string): string {
  const resolved = resolveAgentId(workspace, agentId), signed = withContractPublicationLock(workspace, resolved, () => signContractUnlocked(workspace, resolved));
  logContract(workspace, resolved, signed.digestSha256);
  return signed.sigPath;
}

export class OutcomeContractPublicationError extends Error {
  readonly code = "OUTCOME_CONTRACT_PUBLICATION_INCOMPLETE";
  constructor(readonly published: { path: string; sigPath: string }, readonly stage: "ledger" | "transparency") {
    super(`Outcome contract files are published; ${stage} recording did not complete. Inspect the published files before retrying.`);
    this.name = "OutcomeContractPublicationError";
  }
}

/** No provider is awaited under the file lock; only a current prepared signature may publish the unchanged predecessor. */
async function publishContractAsync(workspace: string, agentId: string, candidate: Buffer | null, reports = false): Promise<{ path: string; sigPath: string }> {
  const path = outcomeContractPath(workspace, agentId), sigPath = outcomeContractSigPath(workspace, agentId);
  const rel = relative(workspace, path).replace(/\\/g, "/"), sigRel = relative(workspace, sigPath).replace(/\\/g, "/");
  const captured = capturePurposePublication(workspace, "config-signature");
  const readPair = () => ({ body: readContainedOrNull(workspace, rel, Number.MAX_SAFE_INTEGER), signature: readContainedOrNull(workspace, sigRel, Number.MAX_SAFE_INTEGER) });
  const predecessor = withContractPublicationLock(workspace, agentId, () => {
    if (outcomeContractPath(workspace, agentId) !== path) throw new Error("outcome contract location changed while signing was prepared; retry");
    return readPair();
  });
  const bytes = candidate === null ? predecessor.body : Buffer.from(candidate);
  if (bytes === null) throw new Error("outcome contract missing");
  const digestSha256 = sha256Hex(bytes), signed = await signWithPurposeKey(workspace, "config-signature", Buffer.from(digestSha256, "hex"));
  const payload: SignaturePayload = { digestSha256, signature: signed.signature.toString("base64"), signedTs: Date.now(), signer: "auditor" };
  const result = { path, sigPath };
  withContractPublicationLock(workspace, agentId, () => {
    if (outcomeContractPath(workspace, agentId) !== path) throw new Error("outcome contract location changed while signing was prepared; retry");
    assertPurposePublicationCurrent(workspace, captured, signed);
    const current = readPair(), same = (a: Buffer | null, b: Buffer | null) => a === null ? b === null : b !== null && a.equals(b);
    if (!same(predecessor.body, current.body) || !same(predecessor.signature, current.signature)) throw new Error("outcome contract or signature changed while signing was prepared; retry");
    if (reports) ensureDir(join(outcomesDir(workspace, agentId), "reports"));
    if (candidate !== null) writeContained(workspace, rel, bytes, 0o644);
    writeContained(workspace, sigRel, JSON.stringify(payload, null, 2), 0o644);
    try { recordContract(workspace, agentId, bytes, payload, signed.keyId.slice(0, 16)); }
    catch { throw new OutcomeContractPublicationError(result, "ledger"); }
  });
  // Existing workspace transparency is synchronous, including its notary route, and always runs after this lock is released.
  try { logContract(workspace, agentId, digestSha256); }
  catch { throw new OutcomeContractPublicationError(result, "transparency"); }
  return result;
}

export async function signOutcomeContractAsync(workspace: string, agentId?: string): Promise<string> {
  return (await publishContractAsync(workspace, resolveAgentId(workspace, agentId), null)).sigPath;
}

export function verifyOutcomeContractSignature(workspace: string, agentId?: string): {
  valid: boolean;
  signatureExists: boolean;
  reason: string | null;
  path: string;
  sigPath: string;
} {
  const path = outcomeContractPath(workspace, agentId);
  const sigPath = outcomeContractSigPath(workspace, agentId);
  if (!pathExists(path)) {
    return {
      valid: false,
      signatureExists: false,
      reason: "outcome contract missing",
      path,
      sigPath
    };
  }
  if (!pathExists(sigPath)) {
    return {
      valid: false,
      signatureExists: false,
      reason: "outcome contract signature missing",
      path,
      sigPath
    };
  }
  try {
    const sig = JSON.parse(readUtf8(sigPath)) as SignaturePayload;
    const digest = sha256Hex(readFileSync(path));
    if (digest !== sig.digestSha256) {
      return {
        valid: false,
        signatureExists: true,
        reason: "digest mismatch",
        path,
        sigPath
      };
    }
    assertKeysetComplete(workspace);
    const valid = verifyHexDigestAny(digest, sig.signature, getPurposeKeyHistory(workspace, "config-signature"));
    return {
      valid,
      signatureExists: true,
      reason: valid ? null : "signature verification failed",
      path,
      sigPath
    };
  } catch (error) {
    return {
      valid: false,
      signatureExists: true,
      reason: String(error),
      path,
      sigPath
    };
  }
}

export function initOutcomeContract(workspace: string, agentId?: string, _archetype?: string): {
  path: string;
  sigPath: string;
} {
  const resolvedAgentId = resolveAgentId(workspace, agentId);
  const path = outcomeContractPath(workspace, resolvedAgentId);
  const signed = withContractPublicationLock(workspace, resolvedAgentId, () => {
    getSigningKey(workspace, "config-signature"); // compatibility API refuses before changing the signed pair
    ensureDir(join(outcomesDir(workspace, resolvedAgentId), "reports"));
    writeFileAtomic(path, YAML.stringify(defaultOutcomeContract(resolvedAgentId)), 0o644);
    return signContractUnlocked(workspace, resolvedAgentId);
  });
  logContract(workspace, resolvedAgentId, signed.digestSha256);
  return { path, sigPath: signed.sigPath };
}

export async function initOutcomeContractAsync(workspace: string, agentId?: string, _archetype?: string): Promise<{ path: string; sigPath: string }> {
  const resolved = resolveAgentId(workspace, agentId);
  return publishContractAsync(workspace, resolved, Buffer.from(YAML.stringify(defaultOutcomeContract(resolved))), true);
}

export function upsertOutcomeContract(workspace: string, contract: OutcomeContract, agentId?: string): {
  path: string;
  sigPath: string;
} {
  const resolvedAgentId = resolveAgentId(workspace, agentId);
  const parsed = outcomeContractSchema.parse(contract);
  if (parsed.outcomeContract.agentId !== resolvedAgentId) {
    parsed.outcomeContract.agentId = resolvedAgentId;
  }
  const path = outcomeContractPath(workspace, resolvedAgentId);
  const signed = withContractPublicationLock(workspace, resolvedAgentId, () => {
    getSigningKey(workspace, "config-signature"); // provider-held/locked keys cannot leave a changed unsigned body
    writeFileAtomic(path, YAML.stringify(parsed), 0o644);
    return signContractUnlocked(workspace, resolvedAgentId);
  });
  logContract(workspace, resolvedAgentId, signed.digestSha256);
  return { path, sigPath: signed.sigPath };
}

export async function upsertOutcomeContractAsync(workspace: string, contract: OutcomeContract, agentId?: string): Promise<{ path: string; sigPath: string }> {
  const resolved = resolveAgentId(workspace, agentId), parsed = outcomeContractSchema.parse(contract);
  parsed.outcomeContract.agentId = resolved;
  return publishContractAsync(workspace, resolved, Buffer.from(YAML.stringify(parsed)));
}

export function outcomeContractDigest(workspace: string, agentId?: string): string {
  const path = outcomeContractPath(workspace, agentId);
  if (!pathExists(path)) {
    return sha256Hex(canonicalize({ missing: true, agentId: resolveAgentId(workspace, agentId) }));
  }
  return sha256Hex(readFileSync(path));
}
