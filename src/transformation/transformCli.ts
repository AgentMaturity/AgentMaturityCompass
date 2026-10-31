import { dirname, resolve } from "node:path";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { resolveAgentId } from "../fleet/paths.js";
import {
  createTransformPlan,
  initTransformMap,
  loadTransformMap,
  saveTransformMap,
  verifyTransformMap
} from "./transformPlanner.js";
import { writeTransformAttestation, verifyTransformAttestation } from "./transformAttestations.js";
import { loadLatestTransformPlan, verifyLatestTransformPlan } from "./transformTasks.js";
import { runTransformTracker } from "./transformTracker.js";
import { compactTransformStatus, renderTransformReportMarkdown } from "./transformReports.js";
import type { TransformMap } from "./transformMapSchema.js";
import { initTransformMapAsync, saveTransformMapAsync, createTransformPlanAsync } from "./transformPlanner.js";
import { runTransformTrackerAsync } from "./transformTracker.js";
import { writeTransformAttestationAsync } from "./transformAttestations.js";
import { captureOrgPairs, assertOrgPairsCurrent } from "../org/preparedOrgPairs.js";
import { transformLatestPath } from "./transformTasks.js";
import type { TransformPlan } from "./transformTasks.js";

type TransformScope =
  | { type: "AGENT"; agentId: string }
  | { type: "NODE"; nodeId: string };

function normalizeScope(workspace: string, scope: TransformScope): TransformScope {
  if (scope.type === "AGENT") {
    return {
      type: "AGENT",
      agentId: resolveAgentId(workspace, scope.agentId)
    };
  }
  return scope;
}

export function transformInitCli(workspace: string): ReturnType<typeof initTransformMap> {
  return initTransformMap(workspace);
}

export function transformVerifyCli(workspace: string): ReturnType<typeof verifyTransformMap> {
  return verifyTransformMap(workspace);
}

export function transformMapReadCli(workspace: string): TransformMap {
  return loadTransformMap(workspace);
}

export function transformMapApplyCli(params: {
  workspace: string;
  map: TransformMap;
}): ReturnType<typeof saveTransformMap> {
  return saveTransformMap(params.workspace, params.map);
}

export function transformPlanCli(params: {
  workspace: string;
  scope: TransformScope;
  to: "targets" | "excellence" | "custom";
  window?: string;
  preview?: boolean;
  targetOverride?: Record<string, number>;
}): ReturnType<typeof createTransformPlan> {
  return createTransformPlan({
    workspace: params.workspace,
    scope: normalizeScope(params.workspace, params.scope),
    to: params.to,
    window: params.window,
    preview: params.preview,
    targetOverride: params.targetOverride
  });
}

export function transformStatusCli(params: {
  workspace: string;
  scope: TransformScope;
}): {
  plan: TransformPlan | null;
  compact: ReturnType<typeof compactTransformStatus> | null;
  verify: ReturnType<typeof verifyLatestTransformPlan>;
} {
  const scope = normalizeScope(params.workspace, params.scope);
  const plan = loadLatestTransformPlan(params.workspace, scope);
  const verify = verifyLatestTransformPlan(params.workspace, scope);
  return {
    plan,
    compact: plan ? compactTransformStatus(plan) : null,
    verify
  };
}

export function transformTrackCli(params: {
  workspace: string;
  scope: TransformScope;
  window?: string;
}): ReturnType<typeof runTransformTracker> {
  const scope = normalizeScope(params.workspace, params.scope);
  return runTransformTracker({
    workspace: params.workspace,
    scope,
    window: params.window
  });
}

export function transformReportCli(params: {
  workspace: string;
  scope: TransformScope;
  outFile: string;
}): {
  outFile: string;
  markdown: string;
  compact: ReturnType<typeof compactTransformStatus>;
  verify: ReturnType<typeof verifyLatestTransformPlan>;
} {
  const scope = normalizeScope(params.workspace, params.scope);
  const plan = loadLatestTransformPlan(params.workspace, scope);
  if (!plan) {
    throw new Error("No transformation plan found for scope. Run `amc transform plan` first.");
  }
  const outFile = resolve(params.workspace, params.outFile);
  ensureDir(dirname(outFile));
  const markdown = renderTransformReportMarkdown(plan);
  writeFileAtomic(outFile, markdown, 0o644);
  return {
    outFile,
    markdown,
    compact: compactTransformStatus(plan),
    verify: verifyLatestTransformPlan(params.workspace, scope)
  };
}

export function transformAttestCli(params: {
  workspace: string;
  scope: TransformScope;
  taskId: string;
  statement: string;
  createdByUser: string;
  role: "OWNER" | "AUDITOR";
  files?: string[];
  evidenceLinks?: string[];
}): ReturnType<typeof writeTransformAttestation> {
  const scope = normalizeScope(params.workspace, params.scope);
  const status = transformStatusCli({
    workspace: params.workspace,
    scope
  });
  return writeTransformAttestation({
    workspace: params.workspace,
    scope,
    taskId: params.taskId,
    statement: params.statement,
    createdByUser: params.createdByUser,
    role: params.role,
    files: params.files,
    evidenceLinks: params.evidenceLinks,
    plan: status.plan
  });
}

export function transformAttestVerifyCli(params: {
  workspace: string;
  file: string;
}): ReturnType<typeof verifyTransformAttestation> {
  const file = resolve(params.workspace, params.file);
  return verifyTransformAttestation(params.workspace, file);
}

export async function transformInitCliAsync(workspace: string) { return initTransformMapAsync(workspace); }
export async function transformMapApplyCliAsync(params: Parameters<typeof transformMapApplyCli>[0]) { return saveTransformMapAsync(params.workspace, params.map); }
export async function transformPlanCliAsync(input: Parameters<typeof transformPlanCli>[0]) {
  const params = structuredClone(input); return createTransformPlanAsync({ ...params, scope: normalizeScope(params.workspace, params.scope) });
}
export async function transformTrackCliAsync(input: Parameters<typeof transformTrackCli>[0]) {
  const params = structuredClone(input); return runTransformTrackerAsync({ ...params, scope: normalizeScope(params.workspace, params.scope) });
}
export async function transformAttestCliAsync(input: Parameters<typeof transformAttestCli>[0]) {
  const params = structuredClone(input), scope = normalizeScope(params.workspace, params.scope);
  const previous = captureOrgPairs([transformLatestPath(params.workspace, scope)]);
  const status = transformStatusCli({ workspace: params.workspace, scope }); assertOrgPairsCurrent(previous);
  return writeTransformAttestationAsync({ ...params, scope, plan: status.plan }, { assertInputsCurrent() { assertOrgPairsCurrent(previous); } });
}
