import { join } from "node:path";
import YAML from "yaml";
import { publishOrgPairs, prepareOrgPairsAsync, type OrgPairsOptions, type OrgPairsSnapshot } from "../org/preparedOrgPairs.js";
import { captureMechanicPair, requireMechanicPair, verifyMechanicPair } from "./mechanicPairs.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import type { MechanicScope } from "./targetSchema.js";
import { mechanicTuningSchema, type MechanicTuning } from "./tuningSchema.js";
import { mechanicRoot } from "./targetsStore.js";

export function mechanicTuningPath(workspace: string): string {
  return join(mechanicRoot(workspace), "tuning.yaml");
}

export function mechanicTuningSigPath(workspace: string): string {
  return `${mechanicTuningPath(workspace)}.sig`;
}

function defaultMechanicTuning(scope: MechanicScope): MechanicTuning {
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

function planMechanicTuning(params: {
  workspace: string;
  tuning: MechanicTuning;
  reason?: string;
}) {
  const path = mechanicTuningPath(params.workspace);
  const normalized = mechanicTuningSchema.parse({
    mechanicTuning: {
      ...params.tuning.mechanicTuning,
      updatedTs: Date.now()
    }
  });
  if (!params.reason || params.reason.trim().length === 0) {
    throw new Error("tuning apply requires reason");
  }
  return { path, bytes: Buffer.from(YAML.stringify(normalized)) };
}

export function saveMechanicTuning(params: {
  workspace: string;
  tuning: MechanicTuning;
  reason?: string;
}): { path: string; sigPath: string } {
  const plan = planMechanicTuning(params); return publishOrgPairs(params.workspace, [plan])[0]!;
}
export async function prepareMechanicTuning(params: Parameters<typeof saveMechanicTuning>[0], options: OrgPairsOptions = {}, before?: OrgPairsSnapshot) {
  const plan = planMechanicTuning(params), prepared = await prepareOrgPairsAsync(params.workspace, [plan], options, before);
  return { bytes: Buffer.from(plan.bytes), assertCurrent: prepared.assertCurrent, publish() { return prepared.publish()[0]!; } };
}
export function captureMechanicTuning(workspace: string) {
  const captured = captureMechanicPair(workspace, mechanicTuningPath(workspace), "mechanic tuning missing");
  return { ...captured, tuning: mechanicTuningSchema.parse(YAML.parse(requireMechanicPair(captured).toString("utf8")) as unknown) };
}
export async function prepareInitialMechanicTuning(params: Parameters<typeof initMechanicTuning>[0], options: OrgPairsOptions = {}, previous?: OrgPairsSnapshot) {
  const tuning = defaultMechanicTuning({ ...params.scope }), prepared = await prepareMechanicTuning({ workspace: params.workspace, tuning, reason: "initial mechanic tuning" }, options, previous);
  return { assertCurrent: prepared.assertCurrent, publish() { return { ...prepared.publish(), tuning }; } };
}
export async function initMechanicTuningAsync(params: Parameters<typeof initMechanicTuning>[0]) { return (await prepareInitialMechanicTuning(params)).publish(); }

export function verifyMechanicTuningSignature(workspace: string) {
  return verifyMechanicPair(workspace, mechanicTuningPath(workspace), "mechanic tuning missing");
}
