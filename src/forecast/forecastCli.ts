import { readFileSync } from "node:fs";
import { forecastPolicyPath } from "./forecastStore.js";
import { initForecastPolicyAsync, ForecastPublicationError } from "./forecastPublication.js";
import { prepareForecastRefreshForOutput, ackAdvisoryForApiAsync, applyForecastPolicyForApiAsync,
  forecastSchedulerRunNowForApiAsync, forecastSchedulerSetEnabledForApiAsync } from "./forecastApi.js";
import { dirname, resolve, join, relative } from "node:path";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import type { ForecastPolicy } from "./forecastSchema.js";
import {
  ackAdvisoryForApi,
  applyForecastPolicyForApi,
  forecastSchedulerRunNowForApi,
  forecastSchedulerSetEnabledForApi,
  forecastSchedulerStatusForApi,
  getForecastLatestForApi,
  getForecastPolicyForApi,
  listAdvisoriesForApi,
  refreshForecastForApi
} from "./forecastApi.js";
import { defaultForecastPolicy, initForecastPolicy } from "./forecastEngine.js";
import { renderForecastMarkdown } from "./forecastReports.js";
import { verifyForecastPolicy } from "./forecastVerifier.js";

function writeOutFile(path: string, content: string): string {
  const out = resolve(path);
  ensureDir(dirname(out));
  writeFileAtomic(out, content, 0o644);
  return out;
}

export function forecastInitCli(workspace: string): {
  path: string;
  sigPath: string;
} {
  return initForecastPolicy(workspace);
}

export function forecastVerifyCli(workspace: string) {
  return verifyForecastPolicy(workspace);
}

export function forecastPrintPolicyCli(workspace: string): ForecastPolicy {
  return getForecastPolicyForApi(workspace).policy;
}

export function forecastRefreshCli(params: {
  workspace: string;
  scope: "workspace" | "agent" | "node";
  targetId?: string;
  outFile?: string;
}): {
  status: "OK" | "INSUFFICIENT_EVIDENCE";
  latestPath: string | null;
  snapshotPath: string | null;
  advisories: number;
  outFile: string | null;
} {
  const refreshed = refreshForecastForApi({
    workspace: params.workspace,
    scope: params.scope,
    targetId: params.targetId
  });
  let outFile: string | null = null;
  if (params.outFile) {
    const isJson = params.outFile.endsWith(".json");
    const body = isJson ? JSON.stringify(refreshed.forecast, null, 2) : renderForecastMarkdown(refreshed.forecast);
    outFile = writeOutFile(params.outFile, body);
  }
  return {
    status: refreshed.forecast.status,
    latestPath: refreshed.latestPath,
    snapshotPath: refreshed.snapshotPath,
    advisories: refreshed.advisories.length,
    outFile
  };
}

export function forecastLatestCli(params: {
  workspace: string;
  scope: "workspace" | "agent" | "node";
  targetId?: string;
  outFile?: string;
}): {
  status: "OK" | "INSUFFICIENT_EVIDENCE";
  outFile: string | null;
} {
  const latest = getForecastLatestForApi({
    workspace: params.workspace,
    scope: params.scope,
    targetId: params.targetId
  });
  let outFile: string | null = null;
  if (params.outFile) {
    const isJson = params.outFile.endsWith(".json");
    outFile = writeOutFile(params.outFile, isJson ? JSON.stringify(latest, null, 2) : renderForecastMarkdown(latest));
  }
  return {
    status: latest.status,
    outFile
  };
}

export function advisoryListCli(params: {
  workspace: string;
  scope?: "workspace" | "agent" | "node";
  targetId?: string;
}) {
  return listAdvisoriesForApi({
    workspace: params.workspace,
    scope: params.scope,
    targetId: params.targetId
  });
}

export function advisoryShowCli(params: {
  workspace: string;
  advisoryId: string;
}) {
  const all = advisoryListCli({ workspace: params.workspace });
  const advisory = all.find((row) => row.advisoryId === params.advisoryId);
  if (!advisory) {
    throw new Error(`advisory not found: ${params.advisoryId}`);
  }
  return advisory;
}

export function advisoryAckCli(params: {
  workspace: string;
  advisoryId: string;
  by: string;
  note: string;
}) {
  return ackAdvisoryForApi({
    workspace: params.workspace,
    advisoryId: params.advisoryId,
    by: params.by,
    note: params.note
  });
}

export function forecastSchedulerStatusCli(workspace: string) {
  return forecastSchedulerStatusForApi(workspace);
}

export function forecastSchedulerRunNowCli(params: {
  workspace: string;
  scope?: "workspace" | "agent" | "node";
  targetId?: string;
}) {
  return forecastSchedulerRunNowForApi(params);
}

export function forecastSchedulerEnableCli(workspace: string) {
  return forecastSchedulerSetEnabledForApi({
    workspace,
    enabled: true
  });
}

export function forecastSchedulerDisableCli(workspace: string) {
  return forecastSchedulerSetEnabledForApi({
    workspace,
    enabled: false
  });
}

export function forecastPolicyApplyCli(params: {
  workspace: string;
  policy: ForecastPolicy;
}) {
  return applyForecastPolicyForApi({
    workspace: params.workspace,
    policy: params.policy
  });
}

export function forecastPolicyDefaultCli(): ForecastPolicy {
  return defaultForecastPolicy();
}


export async function forecastInitCliAsync(workspace: string) { return initForecastPolicyAsync(workspace); }
export async function forecastRefreshCliAsync(input: Parameters<typeof forecastRefreshCli>[0]): Promise<ReturnType<typeof forecastRefreshCli>> {
  const params = { ...input }, target = params.outFile ? resolve(params.outFile) : null;
  const read = (): Buffer | null => { if (target === null) return null; try { return readFileSync(target); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; } };
  if (target !== null && [forecastPolicyPath(params.workspace), join(params.workspace, ".amc", "amc.config.yaml"), join(params.workspace, ".amc", "trust.yaml")]
    .some(path => target === resolve(path) || target === resolve(`${path}.sig`))) throw new Error("forecast output aliases a selected signing or forecast policy input");
  const expected = read(), prepared = await prepareForecastRefreshForOutput(params), refreshed = prepared.result;
  let outFile: string | null = null;
  if (target !== null) try {
    const body = target.endsWith(".json") ? JSON.stringify(refreshed.forecast, null, 2) : renderForecastMarkdown(refreshed.forecast);
    if ([refreshed.latestPath, refreshed.snapshotPath].some(path => path !== null && (target === resolve(path) || target === resolve(`${path}.sig`))))
      throw new Error("forecast output aliases a published forecast pair");
    prepared.assertCurrent();
    const current = read(); if (expected === null ? current !== null : current === null || !expected.equals(current)) throw new Error("forecast output destination changed while signing");
    outFile = writeOutFile(target, body);
  } catch (cause) { throw new ForecastPublicationError(Object.freeze([refreshed.latestPath, refreshed.snapshotPath].filter((path): path is string => path !== null).map(path => relative(params.workspace, path))), "cli-output", null, null, cause); }
  return { status: refreshed.forecast.status, latestPath: refreshed.latestPath, snapshotPath: refreshed.snapshotPath, advisories: refreshed.advisories.length, outFile };
}
export async function advisoryAckCliAsync(input: Parameters<typeof advisoryAckCli>[0]) { return ackAdvisoryForApiAsync({ ...input }); }
export async function forecastSchedulerRunNowCliAsync(input: Parameters<typeof forecastSchedulerRunNowCli>[0]) { return forecastSchedulerRunNowForApiAsync({ ...input }); }
export async function forecastSchedulerEnableCliAsync(workspace: string) { return forecastSchedulerSetEnabledForApiAsync({ workspace, enabled: true }); }
export async function forecastSchedulerDisableCliAsync(workspace: string) { return forecastSchedulerSetEnabledForApiAsync({ workspace, enabled: false }); }
export async function forecastPolicyApplyCliAsync(input: Parameters<typeof forecastPolicyApplyCli>[0]) { return applyForecastPolicyForApiAsync(input); }
