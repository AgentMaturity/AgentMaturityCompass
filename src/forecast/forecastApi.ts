import { pathExists } from "../utils/fs.js";
import { join } from "node:path";
import { createForecastForAuthority, createForecastForPublication, refreshForecastBatchForAuthority, ForecastPublicationError,
  acknowledgeAdvisoryAsync, acknowledgeAdvisoryForAuthority, applyForecastPolicyAsync, applyForecastPolicyForAuthority,
  schedulerRunNowAsync, schedulerRunNowForAuthority, schedulerSetEnabledAsync, schedulerSetEnabledForAuthority } from "./forecastPublication.js";
import { resolveAgentId } from "../fleet/paths.js";
import { loadOrgConfig } from "../org/orgStore.js";
import type { ForecastScope } from "./forecastSchema.js";
import {
  acknowledgeAdvisory,
  createForecast,
  listForecastScopesForWorkspace,
  parseForecastScope,
  refreshForecastsForWorkspace,
  schedulerRunNow,
  schedulerSetEnabled,
  schedulerStatus
} from "./forecastEngine.js";
import {
  listAdvisories,
  loadForecastPolicy,
  saveForecastPolicy,
  verifyForecastPolicySignature
} from "./forecastStore.js";

function normalizeScope(params: {
  workspace: string;
  scope: "workspace" | "agent" | "node";
  targetId?: string | null;
}): ForecastScope {
  if (params.scope === "agent") {
    return parseForecastScope({
      scope: "agent",
      targetId: resolveAgentId(params.workspace, params.targetId ?? "default")
    });
  }
  if (params.scope === "node") {
    const nodeId = params.targetId?.trim() ?? "";
    if (!nodeId) {
      throw new Error("targetId is required for node scope");
    }
    const org = loadOrgConfig(params.workspace);
    if (!org.nodes.some((node) => node.id === nodeId)) {
      throw new Error(`unknown org node: ${nodeId}`);
    }
    return parseForecastScope({
      scope: "node",
      targetId: nodeId
    });
  }
  return parseForecastScope({
    scope: "workspace"
  });
}

export function getForecastLatestForApi(params: {
  workspace: string;
  scope: "workspace" | "agent" | "node";
  targetId?: string | null;
}) {
  const scope = normalizeScope(params);
  return createForecast({
    workspace: params.workspace,
    scope,
    persist: false
  }).forecast;
}

export function refreshForecastForApi(params: {
  workspace: string;
  scope: "workspace" | "agent" | "node";
  targetId?: string | null;
}) {
  const scope = normalizeScope(params);
  return createForecast({
    workspace: params.workspace,
    scope,
    persist: true
  });
}

export function listAdvisoriesForApi(params: {
  workspace: string;
  scope?: "workspace" | "agent" | "node";
  targetId?: string | null;
}) {
  const rows = listAdvisories(params.workspace);
  if (!params.scope) {
    return rows;
  }
  const normalized = normalizeScope({
    workspace: params.workspace,
    scope: params.scope,
    targetId: params.targetId
  });
  return rows.filter((row) => row.scope.type === normalized.type && row.scope.id === normalized.id);
}

export function ackAdvisoryForApi(params: {
  workspace: string;
  advisoryId: string;
  by: string;
  note: string;
}) {
  return acknowledgeAdvisory(params);
}

export function getForecastPolicyForApi(workspace: string) {
  return {
    policy: loadForecastPolicy(workspace),
    signature: verifyForecastPolicySignature(workspace)
  };
}

export function applyForecastPolicyForApi(params: {
  workspace: string;
  policy: ReturnType<typeof loadForecastPolicy>;
}) {
  return saveForecastPolicy(params.workspace, params.policy);
}

export function forecastSchedulerStatusForApi(workspace: string) {
  return schedulerStatus(workspace);
}

export function forecastSchedulerRunNowForApi(params: {
  workspace: string;
  scope?: "workspace" | "agent" | "node";
  targetId?: string | null;
}) {
  if (!params.scope) {
    return schedulerRunNow({
      workspace: params.workspace
    });
  }
  const scope = normalizeScope({
    workspace: params.workspace,
    scope: params.scope,
    targetId: params.targetId
  });
  return schedulerRunNow({
    workspace: params.workspace,
    scopes: [scope]
  });
}

export function forecastSchedulerSetEnabledForApi(params: {
  workspace: string;
  enabled: boolean;
}) {
  return schedulerSetEnabled(params.workspace, params.enabled);
}

export function listForecastScopesForApi(workspace: string) {
  return listForecastScopesForWorkspace(workspace);
}

export function refreshAllForecastsForApi(workspace: string) {
  return refreshForecastsForWorkspace({
    workspace
  });
}


function capturedScope(input: Parameters<typeof normalizeScope>[0]) {
  const params = { ...input }, scope = normalizeScope(params);
  return { params, scope, assertCurrent() {
    if (scope.type === "NODE" && !pathExists(join(params.workspace, ".amc", "org.yaml"))) throw new Error("selected forecast org scope disappeared while signing");
    const current = normalizeScope(params);
    if (current.type !== scope.type || current.id !== scope.id) throw new Error("selected forecast scope changed while signing");
  } };
}
export async function refreshForecastForApiAsync(input: Parameters<typeof refreshForecastForApi>[0]) { return refreshForecastForAuthority(input, () => {}); }
/** Internal trusted route caller; callback does not supply authority or a signer. */
export async function refreshForecastForAuthority(input: Parameters<typeof refreshForecastForApi>[0], beforePublish: () => void) {
  const captured = capturedScope(input);
  return createForecastForAuthority({ workspace: captured.params.workspace, scope: captured.scope, persist: true }, () => { beforePublish(); captured.assertCurrent(); });
}
export async function prepareForecastRefreshForOutput(input: Parameters<typeof refreshForecastForApi>[0], beforePublish: () => void = () => {}) {
  const captured = capturedScope(input);
  return createForecastForPublication({ workspace: captured.params.workspace, scope: captured.scope, persist: true }, () => { beforePublish(); captured.assertCurrent(); });
}
export async function ackAdvisoryForApiAsync(input: Parameters<typeof ackAdvisoryForApi>[0]) { return acknowledgeAdvisoryAsync({ ...input }); }
export async function ackAdvisoryForAuthority(input: Parameters<typeof ackAdvisoryForApi>[0], beforePublish: () => void) { return acknowledgeAdvisoryForAuthority({ ...input }, beforePublish); }
export async function applyForecastPolicyForApiAsync(input: Parameters<typeof applyForecastPolicyForApi>[0]) { return applyForecastPolicyAsync(input.workspace, input.policy); }
export async function applyForecastPolicyForApiForAuthority(input: Parameters<typeof applyForecastPolicyForApi>[0], beforePublish: () => void) { return applyForecastPolicyForAuthority(input.workspace, input.policy, beforePublish); }
export async function forecastSchedulerRunNowForApiAsync(input: Parameters<typeof forecastSchedulerRunNowForApi>[0]) {
  if (!input.scope) return schedulerRunNowAsync({ workspace: input.workspace });
  const captured = capturedScope({ workspace: input.workspace, scope: input.scope, targetId: input.targetId });
  return schedulerRunNowForAuthority({ workspace: input.workspace, scopes: [captured.scope] }, captured.assertCurrent);
}
export async function forecastSchedulerRunNowForApiForAuthority(input: Parameters<typeof forecastSchedulerRunNowForApi>[0], beforePublish: () => void) {
  if (!input.scope) return schedulerRunNowForAuthority({ workspace: input.workspace }, beforePublish);
  const captured = capturedScope({ workspace: input.workspace, scope: input.scope, targetId: input.targetId });
  return schedulerRunNowForAuthority({ workspace: input.workspace, scopes: [captured.scope] }, () => { beforePublish(); captured.assertCurrent(); });
}
export async function forecastSchedulerSetEnabledForApiAsync(input: Parameters<typeof forecastSchedulerSetEnabledForApi>[0]) { return schedulerSetEnabledAsync(input.workspace, input.enabled); }
export async function forecastSchedulerSetEnabledForApiForAuthority(input: Parameters<typeof forecastSchedulerSetEnabledForApi>[0], beforePublish: () => void) { return schedulerSetEnabledForAuthority(input.workspace, input.enabled, beforePublish); }

/** Existing Studio secondary effect: preserve known primary work on forecast refusal; no public root actor API. */
export async function refreshForecastsAfterPrimary(input: readonly Parameters<typeof refreshForecastForApi>[0][], beforePublish: () => void,
  primary: { kind: string; id?: string; value?: unknown }) {
  const captured = input.map(capturedScope), original = structuredClone(primary);
  if (captured.length === 0) throw new Error("a forecast batch must contain a scope");
  const workspace = captured[0]!.params.workspace;
  if (captured.some(row => row.params.workspace !== workspace)) throw new Error("a forecast batch must belong to one workspace");
  try {
    const results = await refreshForecastBatchForAuthority(workspace, captured.map(row => row.scope), () => { beforePublish(); for (const row of captured) row.assertCurrent(); });
    const first = results[0]; if (first === undefined) throw new Error("forecast batch produced no result");
    return [first.result, ...results.slice(1).map(row => row.result)] as const;
  } catch (cause) { throw new ForecastPublicationError(Object.freeze([`primary:${primary.kind}${primary.id ? `:${primary.id}` : ""}`]), "forecast-after-primary", null, null, cause, original); }
}
