import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import YAML from "yaml";
import { getPolicyPack } from "./builtInPacks.js";
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

function writeAudit(workspace: string, agentId: string, payload: Record<string, unknown>): string {
  const ledger = openLedger(workspace);
  const sessionId = `policy-pack-${randomUUID()}`;
  const body = JSON.stringify(payload);
  const bodySha = sha256Hex(Buffer.from(body, "utf8"));
  try {
    ledger.startSession({
      sessionId,
      runtime: "unknown",
      binaryPath: "amc-policy-pack",
      binarySha256: "amc-policy-pack"
    });
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
    ledger.sealSession(sessionId);
    return out.id;
  } finally {
    ledger.close();
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
  const writeAndTrack = (path: string, text: string): void => {
    ensureDir(dirname(path));
    writeFileAtomic(path, text, 0o644);
    files.push({
      path,
      sha256: hashFilePayload(text)
    });
  };

  const actionPolicyPath = join(params.workspace, ".amc", "action-policy.yaml");
  writeAndTrack(actionPolicyPath, YAML.stringify(pack.actionPolicy));
  signActionPolicyWithLockHeld(params.workspace);

  const toolsPath = join(params.workspace, ".amc", "tools.yaml");
  writeAndTrack(toolsPath, YAML.stringify(pack.tools));
  signToolsConfig(params.workspace);

  const budgetsPath = join(params.workspace, ".amc", "budgets.yaml");
  writeAndTrack(budgetsPath, YAML.stringify(pack.budgets));
  signBudgetsConfig(params.workspace);

  const alertsPath = join(params.workspace, ".amc", "alerts.yaml");
  writeAndTrack(alertsPath, YAML.stringify(pack.alerts));
  signAlertsConfig(params.workspace);

  const approvalPolicyPath = join(params.workspace, ".amc", "approval-policy.yaml");
  writeAndTrack(approvalPolicyPath, YAML.stringify(pack.approvalPolicy));
  signApprovalPolicy(params.workspace);

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
  const auditEventId = writeAudit(params.workspace, agentId, {
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
  const policyPath = canonicalActionPolicyPath(params.workspace);
  return withControlFileLock({
    root: dirname(policyPath),
    name: ACTION_POLICY_WRITER_LOCK,
    timeoutMs: 500,
    operation: () => applyPolicyPackLocked(params),
  });
}
