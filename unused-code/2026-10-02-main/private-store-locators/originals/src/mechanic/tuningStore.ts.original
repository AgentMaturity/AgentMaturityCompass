import { join } from "node:path";
import YAML from "yaml";
import { signFileWithAuditor, verifySignedFileWithAuditor } from "../org/orgSigner.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import type { MechanicScope } from "./targetSchema.js";
import { mechanicTuningSchema, type MechanicTuning } from "./tuningSchema.js";
import { mechanicRoot } from "./targetsStore.js";

export function mechanicTuningPath(workspace: string): string {
  return join(mechanicRoot(workspace), "tuning.yaml");
}

export function mechanicTuningSigPath(workspace: string): string {
  return `${mechanicTuningPath(workspace)}.sig`;
}

export function defaultMechanicTuning(scope: MechanicScope): MechanicTuning {
  return mechanicTuningSchema.parse({
    mechanicTuning: {
      version: 1,
      scope,
      knobs: {
        maxTokensPerRun: 12000,
        maxCostPerDayUsd: 50,
        maxToolCallsPerRun: 100,
        maxNetworkCallsPerRun: 50,
        requireApprovalFor: ["HIGH_RISK_TOOLS", "DATA_EXPORT", "PLUGIN_INSTALL", "POLICY_CHANGE"],
        approvalQuorum: {
          owners: 1,
          auditors: 1
        },
        allowedProviders: ["openai", "anthropic", "google", "xai", "openrouter", "local"],
        allowedModelPatterns: ["gpt-*", "claude-*", "gemini-*", "grok-*", "openrouter/*", "local/*"],
        allowedTools: ["fs.read", "git.status", "http.fetch"],
        deniedTools: ["shell.exec", "secrets.read"],
        requireTruthguardForFinalOutputs: true,
        minObservedEvidenceShareForScoreIncrease: 0.6,
        forbidSelfReportScoreIncrease: true,
        diagnosticCadenceHours: 24,
        forecastCadenceHours: 24,
        benchCadenceDays: 30
      },
      updatedTs: Date.now()
    }
  });
}

export function initMechanicTuning(params: {
  workspace: string;
  scope: MechanicScope;
}): {
  path: string;
  sigPath: string;
  tuning: MechanicTuning;
} {
  const tuning = defaultMechanicTuning(params.scope);
  const saved = saveMechanicTuning({
    workspace: params.workspace,
    tuning,
    reason: "initial mechanic tuning"
  });
  return {
    ...saved,
    tuning
  };
}

export function loadMechanicTuning(workspace: string): MechanicTuning {
  const path = mechanicTuningPath(workspace);
  if (!pathExists(path)) {
    return initMechanicTuning({
      workspace,
      scope: { type: "WORKSPACE", id: "workspace" }
    }).tuning;
  }
  return mechanicTuningSchema.parse(YAML.parse(readUtf8(path)) as unknown);
}

export function saveMechanicTuning(params: {
  workspace: string;
  tuning: MechanicTuning;
  reason?: string;
}): { path: string; sigPath: string } {
  const path = mechanicTuningPath(params.workspace);
  ensureDir(mechanicRoot(params.workspace));
  const normalized = mechanicTuningSchema.parse({
    mechanicTuning: {
      ...params.tuning.mechanicTuning,
      updatedTs: Date.now()
    }
  });
  if (!params.reason || params.reason.trim().length === 0) {
    throw new Error("tuning apply requires reason");
  }
  writeFileAtomic(path, YAML.stringify(normalized), 0o644);
  const sigPath = signFileWithAuditor(params.workspace, path);
  return {
    path,
    sigPath
  };
}

export function verifyMechanicTuningSignature(workspace: string) {
  const path = mechanicTuningPath(workspace);
  if (!pathExists(path)) {
    return {
      valid: false,
      signatureExists: false,
      reason: "mechanic tuning missing",
      path,
      sigPath: `${path}.sig`
    };
  }
  return verifySignedFileWithAuditor(workspace, path);
}
