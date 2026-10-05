import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import YAML from "yaml";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
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

export function outcomesDir(workspace: string, agentId?: string): string {
  const paths = getAgentPaths(workspace, resolveAgentId(workspace, agentId));
  return join(paths.rootDir, "outcomes");
}

export function outcomeContractPath(workspace: string, agentId?: string): string {
  return join(outcomesDir(workspace, agentId), "contract.yaml");
}

export function outcomeContractSigPath(workspace: string, agentId?: string): string {
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

function signContractBytes(workspace: string, bytes: Buffer): SignaturePayload {
  const digestSha256 = sha256Hex(bytes);
  return {
    digestSha256,
    signature: signHexDigest(digestSha256, getPrivateKeyPem(workspace, "auditor")),
    signedTs: Date.now(),
    signer: "auditor"
  };
}

export function signOutcomeContract(workspace: string, agentId?: string): string {
  const resolvedAgentId = resolveAgentId(workspace, agentId);
  const contractFile = outcomeContractPath(workspace, resolvedAgentId);
  if (!pathExists(contractFile)) {
    throw new Error(`Outcome contract missing: ${contractFile}`);
  }
  const bytes = readFileSync(contractFile);
  const sigPayload = signContractBytes(workspace, bytes);
  const sigPath = outcomeContractSigPath(workspace, resolvedAgentId);
  writeFileAtomic(sigPath, JSON.stringify(sigPayload, null, 2), 0o644);

  const publicKey = getPublicKeyHistory(workspace, "auditor")[0] ?? "";
  const signerFpr = sha256Hex(Buffer.from(publicKey, "utf8")).slice(0, 16);
  const contractId = sha256Hex(bytes).slice(0, 24);
  const ledger = openLedger(workspace);
  try {
    ledger.insertOutcomeContract({
      contract_id: contractId,
      agent_id: resolvedAgentId,
      file_path: relative(workspace, contractFile).replace(/\\/g, "/"),
      sha256: sigPayload.digestSha256,
      sig_valid: 1,
      signer_fpr: signerFpr
    });
  } finally {
    ledger.close();
  }

  appendTransparencyEntry({
    workspace,
    type: "OUTCOME_CONTRACT_SIGNED",
    agentId: resolvedAgentId,
    artifact: {
      kind: "policy",
      sha256: sigPayload.digestSha256,
      id: `outcome-contract-${resolvedAgentId}`
    }
  });

  return sigPath;
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
    const valid = verifyHexDigestAny(digest, sig.signature, getPublicKeyHistory(workspace, "auditor"));
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
  const dir = outcomesDir(workspace, resolvedAgentId);
  ensureDir(dir);
  ensureDir(join(dir, "reports"));
  const contract = defaultOutcomeContract(resolvedAgentId);
  const path = outcomeContractPath(workspace, resolvedAgentId);
  writeFileAtomic(path, YAML.stringify(contract), 0o644);
  const sigPath = signOutcomeContract(workspace, resolvedAgentId);
  return {
    path,
    sigPath
  };
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
  ensureDir(outcomesDir(workspace, resolvedAgentId));
  writeFileAtomic(path, YAML.stringify(parsed), 0o644);
  return {
    path,
    sigPath: signOutcomeContract(workspace, resolvedAgentId)
  };
}

export function outcomeContractDigest(workspace: string, agentId?: string): string {
  const path = outcomeContractPath(workspace, agentId);
  if (!pathExists(path)) {
    return sha256Hex(canonicalize({ missing: true, agentId: resolveAgentId(workspace, agentId) }));
  }
  return sha256Hex(readFileSync(path));
}
