import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveAgentId } from "../fleet/paths.js";
import { activeFreezeStatus, liftFreeze, liftFreezeAsync, liftFreezeForAuthority } from "./freezeEngine.js";
import { runDriftCheck, runDriftCheckAsync, runDriftCheckForAuthority, writeDriftCheckReport, driftPostPublicationError } from "./driftDetector.js";
import { renderDriftMarkdown } from "./driftReport.js";

export async function driftCheckCli(params: {
  workspace: string;
  agentId?: string;
  against?: "previous";
}): Promise<{
  agentId: string;
  triggered: boolean;
  incidentId: string | null;
  reasons: string[];
}> {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const result = await runDriftCheck({
    workspace: params.workspace,
    agentId
  });
  return {
    agentId,
    triggered: result.triggered,
    incidentId: result.incidentId,
    reasons: result.reasons
  };
}

export async function driftReportCli(params: {
  workspace: string;
  agentId?: string;
  outFile?: string;
}): Promise<{ markdown: string; outFile: string | null }> {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const markdown = renderDriftMarkdown({
    workspace: params.workspace,
    agentId
  });
  if (!params.outFile) {
    return { markdown, outFile: null };
  }
  const result = await runDriftCheck({
    workspace: params.workspace,
    agentId
  });
  const outFile = writeDriftCheckReport({
    workspace: params.workspace,
    agentId,
    outFile: params.outFile,
    result
  });
  return {
    markdown,
    outFile
  };
}

export function freezeStatusCli(params: {
  workspace: string;
  agentId?: string;
}): ReturnType<typeof activeFreezeStatus> {
  return activeFreezeStatus(params.workspace, params.agentId);
}

export function freezeLiftCli(params: {
  workspace: string;
  agentId?: string;
  incidentId: string;
  reason: string;
}): { liftPath: string } {
  return liftFreeze({
    workspace: params.workspace,
    agentId: params.agentId,
    incidentId: params.incidentId,
    reason: params.reason
  });
}

/** Maintained checked CLI/SDK path; old wrapper remains the callback-absent registry compatibility branch. */
export async function driftCheckCliAsync(params: Parameters<typeof driftCheckCli>[0]): ReturnType<typeof driftCheckCli> {
  const captured = { ...params }, agentId = resolveAgentId(captured.workspace, captured.agentId);
  return runDriftCheckAsync({ workspace: captured.workspace, agentId });
}
/** Internal router/Studio handoff. No actor claims or functions are accepted from request bodies. */
export async function driftCheckCliForAuthority(params: Parameters<typeof driftCheckCli>[0], beforePublish: () => void): ReturnType<typeof driftCheckCli> {
  const captured = { ...params }, agentId = resolveAgentId(captured.workspace, captured.agentId);
  return runDriftCheckForAuthority({ workspace: captured.workspace, agentId }, beforePublish);
}
export async function driftReportCliAsync(input: Parameters<typeof driftReportCli>[0]): ReturnType<typeof driftReportCli> {
  const params = { ...input }, agentId = resolveAgentId(params.workspace, params.agentId), markdown = renderDriftMarkdown({ workspace: params.workspace, agentId });
  if (!params.outFile) return { markdown, outFile: null };
  const target = join(params.workspace, params.outFile);
  const read = (): Buffer | null => { try { return readFileSync(target); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; } };
  const before = read(), result = await runDriftCheckAsync({ workspace: params.workspace, agentId });
  try {
    const current = read(); if (before === null ? current !== null : current === null || !before.equals(current)) throw new Error("drift report destination changed while signing was prepared");
    return { markdown, outFile: writeDriftCheckReport({ workspace: params.workspace, agentId, outFile: params.outFile, result }) };
  } catch (error) { throw driftPostPublicationError(params.workspace, result, "report-output", error); }
}
export async function freezeLiftCliAsync(params: Parameters<typeof freezeLiftCli>[0]): Promise<{ liftPath: string }> {
  return liftFreezeAsync({ ...params });
}
/** Internal trusted router handoff, not a root SDK actor option. */
export async function freezeLiftCliForAuthority(params: Parameters<typeof freezeLiftCli>[0], beforePublish: () => void): Promise<{ liftPath: string }> {
  return liftFreezeForAuthority({ ...params }, beforePublish);
}
