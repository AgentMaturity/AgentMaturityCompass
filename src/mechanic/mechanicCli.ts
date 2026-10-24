import { captureMechanicRun, mechanicProgress, mechanicFailed } from "./mechanicPublication.js";
import { captureMechanicPair } from "./mechanicPairs.js";
import { mechanicTargetsPath, captureMechanicTargets, prepareMechanicTargets, prepareInitialMechanicTargets, initMechanicTargetsAsync } from "./targetsStore.js";
import { mechanicTuningPath, captureMechanicTuning, prepareMechanicTuning, prepareInitialMechanicTuning, initMechanicTuningAsync } from "./tuningStore.js";
import { initMechanicWorkspaceAsync, mechanicTargetsApplyForApiAsync, mechanicTuningApplyForApiAsync, mechanicProfileApplyForApiAsync } from "./mechanicSettingsPublication.js";
import { readdirSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import YAML from "yaml";
import { pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { loadMechanicTargets, initMechanicTargets, saveMechanicTargets } from "./targetsStore.js";
import { loadMechanicTuning, initMechanicTuning, saveMechanicTuning } from "./tuningStore.js";
import { verifyMechanicProfilesSignature } from "./profiles.js";
import { loadMechanicPlanById } from "./planStore.js";
import type { MechanicTargets } from "./targetSchema.js";
import type { MechanicScope } from "./targetSchema.js";
import type { MechanicTuning } from "./tuningSchema.js";
import { mechanicGapReportSchema, type MechanicGapReport } from "./mechanicSchema.js";
import { exportAsDSPyTargets, exportAsFineTuneRecipe, exportAsRewardFunction } from "./tuneExport.js";
import {
  initMechanicWorkspace,
  mechanicTargetsForApi,
  mechanicTargetsApplyForApi,
  mechanicProfilesForApi,
  mechanicProfileApplyForApi,
  mechanicTuningForApi,
  mechanicTuningApplyForApi,
  mechanicGapForApi,
  mechanicCreatePlanForApi,
  mechanicLatestPlanForApi,
  mechanicPlanDiffForApi,
  mechanicPlanRequestApprovalForApi,
  mechanicPlanExecuteForApi,
  mechanicSimulateForApi,
  mechanicLatestSimulationForApi,
  verifyMechanicWorkspace
} from "./mechanicApi.js";
import { verifyMechanicTargetsSignature } from "./targetsStore.js";
import { verifyMechanicTuningSignature } from "./tuningStore.js";

function normalizeScope(scope: "workspace" | "node" | "agent", id?: string): MechanicScope {
  const normalizedType = scope.toUpperCase() as "WORKSPACE" | "NODE" | "AGENT";
  return {
    type: normalizedType,
    id: (id ?? (normalizedType === "WORKSPACE" ? "workspace" : "default")).trim() || (normalizedType === "WORKSPACE" ? "workspace" : "default")
  };
}

function parseValue(value: string): unknown {
  const raw = value.trim();
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    return Number(raw);
  }
  if ((raw.startsWith("{") && raw.endsWith("}")) || (raw.startsWith("[") && raw.endsWith("]"))) {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  }
  if (raw.includes(",") && !raw.includes(" ")) {
    return raw.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
  }
  return raw;
}

function setByPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".").filter((part) => part.length > 0);
  if (parts.length === 0) {
    throw new Error("key is required");
  }
  let cursor: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i]!;
    const next = cursor[part];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      cursor[part] = {};
    }
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]!] = value;
}

function latestMechanicGapReportPath(workspace: string): string {
  const reportsDir = join(resolve(workspace), ".amc", "mechanic", "reports");
  if (!pathExists(reportsDir)) {
    throw new Error("No mechanic reports directory found — run `amc mechanic gap` first");
  }
  const files = readdirSync(reportsDir)
    .filter((name) => /^gap_\d+\.json$/.test(name))
    .sort((a, b) => b.localeCompare(a));
  if (files.length === 0) {
    throw new Error("No mechanic gap reports found — run `amc mechanic gap` first");
  }
  return join(reportsDir, files[0]!);
}

function loadMechanicGapReportCli(workspace: string, gapFile?: string): { report: MechanicGapReport; sourcePath: string } {
  const sourcePath = gapFile ? resolve(workspace, gapFile) : latestMechanicGapReportPath(workspace);
  const report = mechanicGapReportSchema.parse(JSON.parse(readUtf8(sourcePath)) as unknown);
  return { report, sourcePath };
}

export function mechanicInitCli(params: {
  workspace: string;
  scope?: "workspace" | "node" | "agent";
  id?: string;
}) {
  const scope = normalizeScope(params.scope ?? "workspace", params.id);
  return initMechanicWorkspace({
    workspace: params.workspace,
    scopeType: scope.type,
    scopeId: scope.id
  });
}

export function mechanicTargetsInitCli(params: {
  workspace: string;
  scope: "workspace" | "node" | "agent";
  id?: string;
  mode: "DESIRED" | "EXCELLENCE";
}) {
  const scope = normalizeScope(params.scope, params.id);
  return initMechanicTargets({
    workspace: params.workspace,
    scope,
    mode: params.mode
  });
}

export function mechanicTargetsSetCli(params: {
  workspace: string;
  qid: string;
  value: number;
  reason: string;
}) {
  const current = loadMechanicTargets(params.workspace);
  const next: MechanicTargets = {
    mechanicTargets: {
      ...current.mechanicTargets,
      targets: {
        ...current.mechanicTargets.targets,
        [params.qid]: params.value
      }
    }
  };
  return saveMechanicTargets({
    workspace: params.workspace,
    targets: next,
    reason: params.reason
  });
}

export function mechanicTargetsApplyCli(params: {
  workspace: string;
  filePath: string;
  reason: string;
  actor: string;
}) {
  const path = resolve(params.workspace, params.filePath);
  const raw = readUtf8(path);
  const parsed = params.filePath.endsWith(".json") ? (JSON.parse(raw) as unknown) : (YAML.parse(raw) as unknown);
  return mechanicTargetsApplyForApi({
    workspace: params.workspace,
    targets: parsed as MechanicTargets,
    reason: params.reason,
    actor: params.actor
  });
}

export function mechanicTargetsPrintCli(workspace: string) {
  return mechanicTargetsForApi(workspace);
}

export function mechanicTargetsVerifyCli(workspace: string) {
  return verifyMechanicTargetsSignature(workspace);
}

export function mechanicProfileListCli(workspace: string) {
  return mechanicProfilesForApi(workspace);
}

export function mechanicProfileApplyCli(params: {
  workspace: string;
  profileId: string;
  scope: "workspace" | "node" | "agent";
  id?: string;
  mode: "DESIRED" | "EXCELLENCE";
  reason: string;
  actor: string;
}) {
  const scope = normalizeScope(params.scope, params.id);
  return mechanicProfileApplyForApi({
    workspace: params.workspace,
    profileId: params.profileId,
    mode: params.mode,
    scopeType: scope.type,
    scopeId: scope.id,
    reason: params.reason,
    actor: params.actor
  });
}

export function mechanicProfilesVerifyCli(workspace: string) {
  return verifyMechanicProfilesSignature(workspace);
}

export function mechanicTuningInitCli(params: {
  workspace: string;
  scope: "workspace" | "node" | "agent";
  id?: string;
}) {
  return initMechanicTuning({
    workspace: params.workspace,
    scope: normalizeScope(params.scope, params.id)
  });
}

export function mechanicTuningSetCli(params: {
  workspace: string;
  keyPath: string;
  value: string;
  reason: string;
}) {
  const current = loadMechanicTuning(params.workspace);
  const next = JSON.parse(JSON.stringify(current)) as Record<string, unknown>;
  setByPath(next, params.keyPath, parseValue(params.value));
  const parsed = next as unknown as MechanicTuning;
  return saveMechanicTuning({
    workspace: params.workspace,
    tuning: parsed,
    reason: params.reason
  });
}

export function mechanicTuningApplyCli(params: {
  workspace: string;
  filePath: string;
  reason: string;
  actor: string;
}) {
  const path = resolve(params.workspace, params.filePath);
  const raw = readUtf8(path);
  const parsed = params.filePath.endsWith(".json") ? (JSON.parse(raw) as unknown) : (YAML.parse(raw) as unknown);
  return mechanicTuningApplyForApi({
    workspace: params.workspace,
    tuning: parsed as MechanicTuning,
    reason: params.reason,
    actor: params.actor
  });
}

export function mechanicTuningPrintCli(workspace: string) {
  return mechanicTuningForApi(workspace);
}

export function mechanicTuningVerifyCli(workspace: string) {
  return verifyMechanicTuningSignature(workspace);
}

export async function mechanicGapCli(params: {
  workspace: string;
  scope?: "workspace" | "node" | "agent";
  id?: string;
  outFile?: string;
}) {
  const scope = normalizeScope(params.scope ?? "workspace", params.id);
  const out = await mechanicGapForApi({
    workspace: params.workspace,
    scopeType: scope.type,
    scopeId: scope.id
  });
  if (params.outFile) {
    writeFileAtomic(resolve(params.workspace, params.outFile), `${JSON.stringify(out.gap, null, 2)}\n`, 0o644);
  }
  return out;
}

export async function mechanicPlanCreateCli(params: {
  workspace: string;
  scope?: "workspace" | "node" | "agent";
  id?: string;
}) {
  const scope = normalizeScope(params.scope ?? "workspace", params.id);
  return mechanicCreatePlanForApi({
    workspace: params.workspace,
    scopeType: scope.type,
    scopeId: scope.id
  });
}

export function mechanicPlanShowCli(params: {
  workspace: string;
  planId?: string;
}) {
  if (!params.planId) {
    return mechanicLatestPlanForApi(params.workspace);
  }
  return {
    plan: loadMechanicPlanById(params.workspace, params.planId),
    signatures: mechanicLatestPlanForApi(params.workspace).signatures
  };
}

export function mechanicPlanDiffCli(params: {
  workspace: string;
  planId: string;
}) {
  return mechanicPlanDiffForApi(params);
}

export function mechanicPlanRequestApprovalCli(params: {
  workspace: string;
  planId: string;
  actor: string;
  reason: string;
}) {
  return mechanicPlanRequestApprovalForApi(params);
}

export async function mechanicPlanExecuteCli(params: {
  workspace: string;
  planId: string;
}) {
  return mechanicPlanExecuteForApi(params);
}

export async function mechanicSimulateCli(params: {
  workspace: string;
  planId: string;
}) {
  return mechanicSimulateForApi(params);
}

export function mechanicSimulationLatestCli(workspace: string) {
  return mechanicLatestSimulationForApi(workspace);
}

export function mechanicTuneExportCli(params: {
  workspace: string;
  gapFile?: string;
  format?: "reward" | "dspy" | "recipe" | "all";
  outFile?: string;
}) {
  const { report, sourcePath } = loadMechanicGapReportCli(params.workspace, params.gapFile);
  const format = params.format ?? "all";
  const reward = exportAsRewardFunction(report);
  const dspy = exportAsDSPyTargets(report);
  const recipe = exportAsFineTuneRecipe(report);
  const output = format === "reward"
    ? reward
    : format === "dspy"
      ? dspy
      : format === "recipe"
        ? recipe
        : { reward, dspy, recipe };

  if (params.outFile) {
    writeFileAtomic(resolve(params.workspace, params.outFile), `${JSON.stringify(output, null, 2)}\n`, 0o644);
  }

  return {
    format,
    sourcePath,
    gap: report,
    output,
  };
}

export function mechanicVerifyCli(workspace: string) {
  return verifyMechanicWorkspace(workspace);
}

export async function mechanicInitCliAsync(params: Parameters<typeof mechanicInitCli>[0]) {
  const input = { ...params }, scope = normalizeScope(input.scope ?? "workspace", input.id);
  return initMechanicWorkspaceAsync({ workspace: input.workspace, scopeType: scope.type, scopeId: scope.id });
}
export async function mechanicTargetsInitCliAsync(params: Parameters<typeof mechanicTargetsInitCli>[0]) {
  const input = { ...params }; return initMechanicTargetsAsync({ workspace: input.workspace, scope: normalizeScope(input.scope, input.id), mode: input.mode });
}
export async function mechanicTuningInitCliAsync(params: Parameters<typeof mechanicTuningInitCli>[0]) {
  const input = { ...params }; return initMechanicTuningAsync({ workspace: input.workspace, scope: normalizeScope(input.scope, input.id) });
}
export async function mechanicTargetsApplyCliAsync(params: Parameters<typeof mechanicTargetsApplyCli>[0]) {
  const input = { ...params }, path = resolve(input.workspace, input.filePath), raw = readUtf8(path);
  const targets = (input.filePath.endsWith(".json") ? JSON.parse(raw) : YAML.parse(raw)) as MechanicTargets;
  return mechanicTargetsApplyForApiAsync({ workspace: input.workspace, targets, reason: input.reason, actor: input.actor });
}
export async function mechanicTuningApplyCliAsync(params: Parameters<typeof mechanicTuningApplyCli>[0]) {
  const input = { ...params }, path = resolve(input.workspace, input.filePath), raw = readUtf8(path);
  const tuning = (input.filePath.endsWith(".json") ? JSON.parse(raw) : YAML.parse(raw)) as MechanicTuning;
  return mechanicTuningApplyForApiAsync({ workspace: input.workspace, tuning, reason: input.reason, actor: input.actor });
}
export async function mechanicProfileApplyCliAsync(params: Parameters<typeof mechanicProfileApplyCli>[0]) {
  const input = { ...params }, scope = normalizeScope(input.scope, input.id);
  return mechanicProfileApplyForApiAsync({ workspace: input.workspace, profileId: input.profileId, mode: input.mode, scopeType: scope.type, scopeId: scope.id, reason: input.reason, actor: input.actor });
}
export async function mechanicTargetsSetCliAsync(params: Parameters<typeof mechanicTargetsSetCli>[0]) {
  const input = { ...params }, run = captureMechanicRun(input.workspace, () => {}), state = mechanicProgress();
  let constructorTargets: MechanicTargets | undefined, initialCurrent = () => {};
  try {
    const initial = captureMechanicPair(input.workspace, mechanicTargetsPath(input.workspace), "mechanic targets missing");
    if (initial.bytes === null && initial.hasSidecar) throw new Error("existing mechanic sidecar has no body; initialization refuses replacement");
    if (initial.bytes === null) { state.phase = "initial-targets";
      const prepared = await prepareInitialMechanicTargets({ workspace: input.workspace, scope: { type: "WORKSPACE", id: "workspace" }, mode: "DESIRED" }, { assertInputsCurrent: run.fixed }, initial.before);
      const saved = prepared.publish(); constructorTargets = saved.targets; initialCurrent = prepared.assertCurrent; state.completed.push(relative(input.workspace, saved.path), relative(input.workspace, saved.sigPath)); prepared.assertCurrent(); run.fixed(); }
    const selected = captureMechanicTargets(input.workspace), next: MechanicTargets = { mechanicTargets: { ...(constructorTargets ?? selected.targets).mechanicTargets, targets: { ...(constructorTargets ?? selected.targets).mechanicTargets.targets, [input.qid]: input.value } } };
    state.phase = "targets-pair";
    const prepared = await prepareMechanicTargets({ workspace: input.workspace, targets: next, reason: input.reason }, {
      assertInputsCurrent() { initialCurrent(); selected.assertCurrent(); run.fixed(); }
    }, selected.before);
    return prepared.publish();
  } catch (error) { mechanicFailed(state, error); }
}
export async function mechanicTuningSetCliAsync(params: Parameters<typeof mechanicTuningSetCli>[0]) {
  const input = { ...params }, run = captureMechanicRun(input.workspace, () => {}), state = mechanicProgress();
  let initialCurrent = () => {};
  try {
    const initial = captureMechanicPair(input.workspace, mechanicTuningPath(input.workspace), "mechanic tuning missing");
    if (initial.bytes === null && initial.hasSidecar) throw new Error("existing mechanic sidecar has no body; initialization refuses replacement");
    if (initial.bytes === null) { state.phase = "initial-tuning";
      const prepared = await prepareInitialMechanicTuning({ workspace: input.workspace, scope: { type: "WORKSPACE", id: "workspace" } }, { assertInputsCurrent: run.fixed }, initial.before);
      const saved = prepared.publish(); initialCurrent = prepared.assertCurrent; state.completed.push(relative(input.workspace, saved.path), relative(input.workspace, saved.sigPath)); prepared.assertCurrent(); run.fixed(); }
    const selected = captureMechanicTuning(input.workspace), next = structuredClone(selected.tuning) as unknown as Record<string, unknown>;
    setByPath(next, input.keyPath, parseValue(input.value)); state.phase = "tuning-pair";
    const prepared = await prepareMechanicTuning({ workspace: input.workspace, tuning: next as unknown as MechanicTuning, reason: input.reason }, {
      assertInputsCurrent() { initialCurrent(); selected.assertCurrent(); run.fixed(); }
    }, selected.before);
    return prepared.publish();
  } catch (error) { mechanicFailed(state, error); }
}
