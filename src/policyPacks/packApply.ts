import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import YAML from "yaml";
import { getPolicyPack } from "./builtInPacks.js";
import type { PolicyPack } from "./packSchema.js";
import { getSigningKey, assertSigningKeyUsable, assertVaultMaySign } from "../keys/signingKeys.js";
import { publicKeyFromPrivate } from "../crypto/keyHistoryEnvelope.js";
import { describePolicySigner } from "../crypto/signing/signer.js";
import { resolveAgentId } from "../fleet/paths.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import {
  ACTION_POLICY_WRITER_LOCK,
  actionPolicyPath as canonicalActionPolicyPath,
  assertActionPolicyWriterReady,
  signActionPolicyWithLockHeld,
} from "../governor/actionPolicyEngine.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { signToolsConfig } from "../toolhub/toolhubValidators.js";
import { signBudgetsConfig } from "../budgets/budgets.js";
import { signAlertsConfig } from "../drift/alerts.js";
import { signApprovalPolicy } from "../approvals/approvalPolicyEngine.js";
import { parseGatePolicy, writeSignedGatePolicy } from "../ci/gate.js";
import { createSignedTargetProfile, loadTargetProfile, saveTargetProfile } from "../targets/targetProfile.js";
import { loadContextGraph } from "../context/contextGraph.js";
import { sha256Hex } from "../utils/hash.js";
import { openLedger } from "../ledger/ledger.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { buildDashboard } from "../dashboard/build.js";

export interface PolicyPackApplyResult {
  packId: string;
  agentId: string;
  files: Array<{ path: string; sha256: string }>;
  targetProfileId: string;
  transparencyHash: string;
  auditEventId: string;
}

function hashFilePayload(text: string): string {
  return sha256Hex(Buffer.from(text, "utf8"));
}

export function writePolicyPackAudit(workspace: string, agentId: string, payload: Record<string, unknown>, beforeEffect: () => void = () => {}, recorded: (effect: string) => void = () => {}): string {
  beforeEffect(); const ledger = openLedger(workspace);
  const sessionId = `policy-pack-${randomUUID()}`;
  const body = JSON.stringify(payload);
  const bodySha = sha256Hex(Buffer.from(body, "utf8"));
  let failed: unknown;
  try {
    beforeEffect(); ledger.startSession({
      sessionId,
      runtime: "unknown",
      binaryPath: "amc-policy-pack",
      binarySha256: "amc-policy-pack"
    });
    recorded(`audit-session:${sessionId}`); beforeEffect();
    const out = ledger.appendEvidenceWithReceipt({
      sessionId,
      runtime: "unknown",
      eventType: "audit",
      payload: body,
      payloadExt: "json",
      inline: true,
      meta: {
        ...payload,
        trustTier: "OBSERVED",
        agentId,
        bodySha256: bodySha
      },
      receipt: {
        kind: "guard_check",
        agentId,
        providerId: "unknown",
        model: null,
        bodySha256: bodySha
      }
    });
    recorded(`audit-event:${out.id}`); beforeEffect(); ledger.sealSession(sessionId); recorded(`audit-seal:${sessionId}`);
    return out.id;
  } catch (cause) { failed = cause; throw cause; } finally {
    try { ledger.close(); } catch (close) {
      if (failed !== undefined) throw new AggregateError([failed, close], "policy-pack audit and connection close failed", { cause: failed });
      throw close;
    }
  }
}

function applyPolicyPackLocked(params: {
  workspace: string;
  agentId?: string;
  packId: string;
}): PolicyPackApplyResult {
  assertActionPolicyWriterReady(params.workspace);
  const pack = getPolicyPack(params.packId);
  if (!pack) {
    throw new Error(`unknown policy pack: ${params.packId}`);
  }
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const files: Array<{ path: string; sha256: string }> = [];
  files.push(...publishPolicyPackCompatibility(params.workspace, pack));

  const gatePolicyPath = `.amc/agents/${agentId}/gatePolicy.json`;
  writeSignedGatePolicy({
    workspace: params.workspace,
    policyPath: gatePolicyPath,
    policy: parseGatePolicy(pack.gatePolicy)
  });
  files.push({
    path: join(params.workspace, gatePolicyPath),
    sha256: hashFilePayload(JSON.stringify(pack.gatePolicy, null, 2))
  });

  const context = loadContextGraph(params.workspace, agentId);
  const contextHash = sha256Hex(Buffer.from(JSON.stringify(context), "utf8"));
  const previousTarget = (() => {
    try {
      return loadTargetProfile(params.workspace, "default", agentId);
    } catch {
      return null;
    }
  })();
  const mergedTarget = {
    ...(previousTarget?.mapping ?? {}),
    ...pack.targetAdjustments
  };
  const profile = createSignedTargetProfile({
    workspace: params.workspace,
    name: "default",
    contextGraphHash: contextHash,
    mapping: mergedTarget
  });
  const targetPath = saveTargetProfile(params.workspace, profile, agentId);
  files.push({
    path: targetPath,
    sha256: sha256Hex(Buffer.from(JSON.stringify(profile), "utf8"))
  });

  const digest = sha256Hex(Buffer.from(JSON.stringify(files), "utf8"));
  const transparency = appendTransparencyEntry({
    workspace: params.workspace,
    type: "POLICY_PACK_APPLIED",
    agentId,
    artifact: {
      kind: "policy",
      sha256: digest,
      id: pack.id
    }
  });
  const auditEventId = writePolicyPackAudit(params.workspace, agentId, {
    auditType: "POLICY_PACK_APPLIED",
    severity: "LOW",
    packId: pack.id,
    files
  });

  try {
    buildDashboard({
      workspace: params.workspace,
      agentId,
      outDir: `.amc/agents/${agentId}/dashboard`
    });
  } catch {
    // ignore dashboard build failure if no run exists yet
  }

  return {
    packId: pack.id,
    agentId,
    files,
    targetProfileId: profile.id,
    transparencyHash: transparency.hash,
    auditEventId
  };
}

export function applyPolicyPack(params: {
  workspace: string;
  agentId?: string;
  packId: string;
}): PolicyPackApplyResult {
  if (!getPolicyPack(params.packId)) throw new Error(`unknown policy pack: ${params.packId}`);
  preflightPolicyPackCompatibility(params.workspace);
  const policyPath = canonicalActionPolicyPath(params.workspace);
  return withControlFileLock({
    root: dirname(policyPath),
    name: ACTION_POLICY_WRITER_LOCK,
    timeoutMs: 500,
    operation: () => applyPolicyPackLocked(params),
  });
}

/** Actual held signer preflight. Required-notary approval logging has no held async handoff yet. */
export function preflightPolicyPackCompatibility(workspace: string): void {
  assertVaultMaySign(workspace, "config-signature"); assertVaultMaySign(workspace, "artifact-seal");
  for (const purpose of ["config-signature", "artifact-seal"] as const) {
    const key = getSigningKey(workspace, purpose);
    assertSigningKeyUsable(workspace, purpose, publicKeyFromPrivate(key), "file");
  }
  if (describePolicySigner(workspace, "TRANSPARENCY_ROOT").mode !== "VAULT"
    || describePolicySigner(workspace, "MERKLE_ROOT").mode !== "VAULT")
    throw new Error("policy-pack approval logging requires the retained local signer; its held async handoff is unavailable");
}

/** Existing synchronous five-config phase; the caller must hold ACTION_POLICY_WRITER_LOCK. */
export function publishPolicyPackCompatibility(workspace: string, pack: PolicyPack, options: {
  beforeMember?: (path: string) => void; recorded?: (path: string) => void; approvalLogReturned?: () => void;
} = {}): Array<{ path: string; sha256: string }> {
  assertActionPolicyWriterReady(workspace);
  const rows = [
    { name: "action-policy.yaml", value: pack.actionPolicy, sign: signActionPolicyWithLockHeld },
    { name: "tools.yaml", value: pack.tools, sign: signToolsConfig },
    { name: "budgets.yaml", value: pack.budgets, sign: signBudgetsConfig },
    { name: "alerts.yaml", value: pack.alerts, sign: signAlertsConfig },
    { name: "approval-policy.yaml", value: pack.approvalPolicy, sign: signApprovalPolicy }
  ];
  const files: Array<{ path: string; sha256: string }> = [];
  for (const row of rows) {
    const path = join(workspace, ".amc", row.name), text = YAML.stringify(row.value);
    options.beforeMember?.(path); ensureDir(dirname(path)); writeFileAtomic(path, text, 0o644); options.recorded?.(path);
    files.push({ path, sha256: hashFilePayload(text) });
    options.beforeMember?.(`${path}.sig`); const signaturePath = row.sign(workspace); options.recorded?.(signaturePath);
    if (row.name === "approval-policy.yaml") options.approvalLogReturned?.();
  }
  return files;
}
