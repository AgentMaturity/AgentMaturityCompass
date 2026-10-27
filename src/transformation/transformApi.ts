import { resolveAgentId } from "../fleet/paths.js";
import { loadLatestTransformPlan, verifyLatestTransformPlan } from "./transformTasks.js";
import { createTransformPlan, loadTransformMap, saveTransformMap, verifyTransformMap } from "./transformPlanner.js";
import { runTransformTracker } from "./transformTracker.js";
import { writeTransformAttestation } from "./transformAttestations.js";
import { saveTransformMapAsync, createTransformPlanAsync } from "./transformPlanner.js";
import { runTransformTrackerAsync } from "./transformTracker.js";
import { writeTransformAttestationAsync } from "./transformAttestations.js";
import type { TransformPublicationChecks } from "./transformPublication.js";
import { compactTransformStatus } from "./transformReports.js";

export function getTransformMapForApi(workspace: string): {
  map: ReturnType<typeof loadTransformMap>;
  signature: ReturnType<typeof verifyTransformMap>;
} {
  return {
    map: loadTransformMap(workspace),
    signature: verifyTransformMap(workspace)
  };
}

export function getLatestAgentTransformPlanForApi(params: {
  workspace: string;
  agentId: string;
}): {
  plan: ReturnType<typeof loadLatestTransformPlan>;
  compact: ReturnType<typeof compactTransformStatus> | null;
  signature: ReturnType<typeof verifyLatestTransformPlan>;
} {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const scope = {
    type: "AGENT" as const,
    agentId
  };
  const plan = loadLatestTransformPlan(params.workspace, scope);
  return {
    plan,
    compact: plan ? compactTransformStatus(plan) : null,
    signature: verifyLatestTransformPlan(params.workspace, scope)
  };
}

export function getLatestNodeTransformPlanForApi(params: {
  workspace: string;
  nodeId: string;
}): {
  plan: ReturnType<typeof loadLatestTransformPlan>;
  compact: ReturnType<typeof compactTransformStatus> | null;
  signature: ReturnType<typeof verifyLatestTransformPlan>;
} {
  const scope = {
    type: "NODE" as const,
    nodeId: params.nodeId
  };
  const plan = loadLatestTransformPlan(params.workspace, scope);
  return {
    plan,
    compact: plan ? compactTransformStatus(plan) : null,
    signature: verifyLatestTransformPlan(params.workspace, scope)
  };
}

export function createAgentTransformPlanForApi(params: {
  workspace: string;
  agentId: string;
  to: "targets" | "excellence" | "custom";
  window?: string;
  targetOverride?: Record<string, number>;
  preview?: boolean;
}): ReturnType<typeof createTransformPlan> {
  return createTransformPlan({
    workspace: params.workspace,
    scope: {
      type: "AGENT",
      agentId: resolveAgentId(params.workspace, params.agentId)
    },
    to: params.to,
    window: params.window,
    targetOverride: params.targetOverride,
    preview: params.preview
  });
}


export async function applyTransformMapForApiAsync(params: {
  workspace: string;
  map: ReturnType<typeof loadTransformMap>;
}, checks: TransformPublicationChecks = {}) {
  return saveTransformMapAsync(params.workspace, params.map, checks);
}


export async function createAgentTransformPlanForApiAsync(params: {
  workspace: string;
  agentId: string;
  to: "targets" | "excellence" | "custom";
  window?: string;
  targetOverride?: Record<string, number>;
  preview?: boolean;
}, checks: TransformPublicationChecks = {}) {
  return createTransformPlanAsync({
    workspace: params.workspace,
    scope: {
      type: "AGENT",
      agentId: resolveAgentId(params.workspace, params.agentId)
    },
    to: params.to,
    window: params.window,
    targetOverride: params.targetOverride,
    preview: params.preview
  }, checks);
}


export async function createNodeTransformPlanForApiAsync(params: {
  workspace: string;
  nodeId: string;
  to: "targets" | "excellence" | "custom";
  window?: string;
  targetOverride?: Record<string, number>;
  preview?: boolean;
}, checks: TransformPublicationChecks = {}) {
  return createTransformPlanAsync({
    workspace: params.workspace,
    scope: {
      type: "NODE",
      nodeId: params.nodeId
    },
    to: params.to,
    window: params.window,
    targetOverride: params.targetOverride,
    preview: params.preview
  }, checks);
}


export async function trackAgentTransformPlanForApiAsync(params: {
  workspace: string;
  agentId: string;
  window?: string;
}, checks: TransformPublicationChecks = {}) {
  return runTransformTrackerAsync({
    workspace: params.workspace,
    scope: {
      type: "AGENT",
      agentId: resolveAgentId(params.workspace, params.agentId)
    },
    window: params.window
  }, checks);
}


export async function trackNodeTransformPlanForApiAsync(params: {
  workspace: string;
  nodeId: string;
  window?: string;
}, checks: TransformPublicationChecks = {}) {
  return runTransformTrackerAsync({
    workspace: params.workspace,
    scope: {
      type: "NODE",
      nodeId: params.nodeId
    },
    window: params.window
  }, checks);
}


export async function attestAgentTransformTaskForApiAsync(params: {
  workspace: string;
  agentId: string;
  taskId: string;
  statement: string;
  files?: string[];
  evidenceLinks?: string[];
  createdByUser: string;
  role: "OWNER" | "AUDITOR";
}, checks: TransformPublicationChecks = {}) {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  return writeTransformAttestationAsync({
    workspace: params.workspace,
    scope: {
      type: "AGENT",
      agentId
    },
    taskId: params.taskId,
    statement: params.statement,
    files: params.files,
    evidenceLinks: params.evidenceLinks,
    createdByUser: params.createdByUser,
    role: params.role
  }, checks);
}


export async function attestNodeTransformTaskForApiAsync(params: {
  workspace: string;
  nodeId: string;
  taskId: string;
  statement: string;
  files?: string[];
  evidenceLinks?: string[];
  createdByUser: string;
  role: "OWNER" | "AUDITOR";
}, checks: TransformPublicationChecks = {}) {
  return writeTransformAttestationAsync({
    workspace: params.workspace,
    scope: {
      type: "NODE",
      nodeId: params.nodeId
    },
    taskId: params.taskId,
    statement: params.statement,
    files: params.files,
    evidenceLinks: params.evidenceLinks,
    createdByUser: params.createdByUser,
    role: params.role
  }, checks);
}
