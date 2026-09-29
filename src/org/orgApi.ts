import { dirname, join } from "node:path";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { loadOrgConfig, verifyOrgConfigSignature } from "./orgStore.js";
import { computeOrgScorecard, nodeHierarchy, recomputeAndPersistOrgScorecard, scorecardNodeComparison, summarizeNodeForUi } from "./orgEngine.js";
import { loadLatestOrgScorecard } from "./orgScorecard.js";
import { renderOrgCompareMarkdown, renderOrgNodeReportMarkdown, renderOrgSystemicMarkdown } from "./orgReports.js";
import { generateOrgCommitmentPlan, generateOrgEducationBrief, generateOrgOwnershipPlan } from "./orgCommitments.js";

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
