import { dirname, join } from "node:path";
import { captureOrgComputationInputs, captureOrgCommitmentAuthority, type OrgEffectOptions } from "./orgPublication.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { loadOrgConfig, verifyOrgConfigSignature } from "./orgStore.js";
import { computeOrgScorecard, nodeHierarchy, recomputeAndPersistOrgScorecard, recomputeAndPersistOrgScorecardAsync, scorecardNodeComparison, summarizeNodeForUi } from "./orgEngine.js";
import { loadLatestOrgScorecard } from "./orgScorecard.js";
import { renderOrgCompareMarkdown, renderOrgNodeReportMarkdown, renderOrgSystemicMarkdown } from "./orgReports.js";
import { generateOrgCommitmentPlan, generateOrgEducationBrief, generateOrgOwnershipPlan, generateOrgCommitmentPlanAsync, generateOrgEducationBriefAsync, generateOrgOwnershipPlanAsync } from "./orgCommitments.js";

export function orgStatus(workspace: string): {
  config: ReturnType<typeof loadOrgConfig>;
  signature: ReturnType<typeof verifyOrgConfigSignature>;
  latestScorecard: ReturnType<typeof loadLatestOrgScorecard>;
  tree: ReturnType<typeof nodeHierarchy>;
} {
  const config = loadOrgConfig(workspace);
  return {
    config,
    signature: verifyOrgConfigSignature(workspace),
    latestScorecard: loadLatestOrgScorecard(workspace),
    tree: nodeHierarchy(config)
  };
}

export function orgNodePayload(params: {
  workspace: string;
  nodeId: string;
  window?: string;
}): {
  node: ReturnType<typeof summarizeNodeForUi>;
  scorecard: ReturnType<typeof computeOrgScorecard>;
} {
  const scorecard = computeOrgScorecard({
    workspace: params.workspace,
    window: params.window ?? "14d"
  });
  return {
    node: summarizeNodeForUi(scorecard, params.nodeId),
    scorecard
  };
}

export function recomputeOrgScorecardsApi(params: {
  workspace: string;
  window: string;
}): ReturnType<typeof recomputeAndPersistOrgScorecard> {
  return recomputeAndPersistOrgScorecard(params);
}

export function renderOrgNodeReportFile(params: {
  workspace: string;
  nodeId: string;
  outFile: string;
  window?: string;
}): {
  outFile: string;
  markdown: string;
  scorecard: ReturnType<typeof computeOrgScorecard>;
} {
  const scorecard = computeOrgScorecard({
    workspace: params.workspace,
    window: params.window ?? "14d"
  });
  const markdown = renderOrgNodeReportMarkdown(scorecard, params.nodeId);
  const outFile = join(params.workspace, params.outFile);
  ensureDir(dirname(outFile));
  writeFileAtomic(outFile, markdown, 0o644);
  return { outFile, markdown, scorecard };
}

export function renderOrgCompareReportFile(params: {
  workspace: string;
  nodeA: string;
  nodeB: string;
  outFile: string;
  format: "md" | "json";
  window?: string;
}): {
  outFile: string;
  payload: unknown;
} {
  const scorecard = computeOrgScorecard({
    workspace: params.workspace,
    window: params.window ?? "14d"
  });
  const outFile = join(params.workspace, params.outFile);
  ensureDir(dirname(outFile));
  if (params.format === "json") {
    const payload = scorecardNodeComparison(scorecard, params.nodeA, params.nodeB);
    writeFileAtomic(outFile, JSON.stringify(payload, null, 2), 0o644);
    return { outFile, payload };
  }
  const payload = renderOrgCompareMarkdown(scorecard, params.nodeA, params.nodeB);
  writeFileAtomic(outFile, payload, 0o644);
  return { outFile, payload };
}

export function renderOrgSystemicReport(params: {
  workspace: string;
  outFile: string;
  window?: string;
}): {
  outFile: string;
  markdown: string;
} {
  const scorecard = computeOrgScorecard({
    workspace: params.workspace,
    window: params.window ?? "14d"
  });
  const markdown = renderOrgSystemicMarkdown(scorecard);
  const outFile = join(params.workspace, params.outFile);
  ensureDir(dirname(outFile));
  writeFileAtomic(outFile, markdown, 0o644);
  return {
    outFile,
    markdown
  };
}

export function generateOrgEoc(params: {
  workspace: string;
  nodeId: string;
  type: "learn" | "own" | "commit";
  days?: 14 | 30 | 90;
  window?: string;
}): ReturnType<typeof generateOrgEducationBrief> | ReturnType<typeof generateOrgOwnershipPlan> | ReturnType<typeof generateOrgCommitmentPlan> {
  const scorecard = computeOrgScorecard({
    workspace: params.workspace,
    window: params.window ?? "14d"
  });
  if (params.type === "learn") {
    return generateOrgEducationBrief({
      workspace: params.workspace,
      nodeId: params.nodeId,
      scorecard
    });
  }
  if (params.type === "own") {
    return generateOrgOwnershipPlan({
      workspace: params.workspace,
      nodeId: params.nodeId,
      scorecard
    });
  }
  return generateOrgCommitmentPlan({
    workspace: params.workspace,
    nodeId: params.nodeId,
    scorecard,
    days: params.days ?? 30
  });
}

export async function recomputeOrgScorecardsApiAsync(params: Parameters<typeof recomputeOrgScorecardsApi>[0],
  options: OrgEffectOptions = {}): Promise<ReturnType<typeof recomputeOrgScorecardsApi>> {
  return recomputeAndPersistOrgScorecardAsync({ ...params }, options);
}
/** Actual maintained E/O/C handoff; capture original authority and consumed config before computation or any wait. */
export async function generateOrgEocAsync(params: Parameters<typeof generateOrgEoc>[0] & { outFile?: string },
  options: OrgEffectOptions = {}): Promise<ReturnType<typeof generateOrgEoc>> {
  const input = { ...params }, assertOriginal = captureOrgCommitmentAuthority(input.workspace, options.beforePublish);
  const inputs = captureOrgComputationInputs(input.workspace);
  const scorecard = computeOrgScorecard({ workspace: input.workspace, window: input.window ?? "14d", config: inputs.config });
  inputs.assertCurrent();
  const continuation = { outFile: input.outFile, beforePublish: () => { assertOriginal(); inputs.assertCurrent(); } };
  if (input.type === "learn") return generateOrgEducationBriefAsync({ workspace: input.workspace, nodeId: input.nodeId, scorecard }, continuation);
  if (input.type === "own") return generateOrgOwnershipPlanAsync({ workspace: input.workspace, nodeId: input.nodeId, scorecard }, continuation);
  return generateOrgCommitmentPlanAsync({ workspace: input.workspace, nodeId: input.nodeId, scorecard, days: input.days ?? 30 }, continuation);
}
