import { join } from "node:path";
import type { OrgNodeScorecard, OrgScorecard } from "./orgSchema.js";
import { orgScorecardHistoryDir, orgScorecardsDir } from "./orgStore.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { signFileWithAuditor, verifySignedFileWithAuditor, type SignedFileVerification } from "./orgSigner.js";

export function latestOrgScorecardPath(workspace: string): string {
  return join(orgScorecardsDir(workspace), "latest.json");
}

export function orgScorecardHistoryPath(workspace: string, ts: number): string {
  return join(orgScorecardHistoryDir(workspace), `${ts}.json`);
}

export function writeOrgScorecard(workspace: string, scorecard: OrgScorecard): {
  latestPath: string;
  latestSigPath: string;
  historyPath: string;
  historySigPath: string;
} {
  ensureDir(orgScorecardsDir(workspace));
  ensureDir(orgScorecardHistoryDir(workspace));
  const latestPath = latestOrgScorecardPath(workspace);
  const historyPath = orgScorecardHistoryPath(workspace, scorecard.computedAt);
  const payload = JSON.stringify(scorecard, null, 2);
  writeFileAtomic(latestPath, payload, 0o644);
  writeFileAtomic(historyPath, payload, 0o644);
  const latestSigPath = signFileWithAuditor(workspace, latestPath);
  const historySigPath = signFileWithAuditor(workspace, historyPath);
  return {
    latestPath,
    latestSigPath,
    historyPath,
    historySigPath
  };
}

export function loadLatestOrgScorecard(workspace: string): OrgScorecard | null {
  const path = latestOrgScorecardPath(workspace);
  if (!pathExists(path)) {
    return null;
  }
  return JSON.parse(readUtf8(path)) as OrgScorecard;
}

export function verifyLatestOrgScorecardSignature(workspace: string): SignedFileVerification {
  return verifySignedFileWithAuditor(workspace, latestOrgScorecardPath(workspace));
}

export function findNodeScorecard(scorecard: OrgScorecard, nodeId: string): OrgNodeScorecard | null {
  return scorecard.nodes.find((node) => node.nodeId === nodeId) ?? null;
}

export function compareNodeScorecards(scorecard: OrgScorecard, nodeAId: string, nodeBId: string): {
  nodeA: OrgNodeScorecard;
  nodeB: OrgNodeScorecard;
  deltas: {
    overall: number;
    integrityIndex: number;
    valueScore: number | null;
    economicSignificanceIndex: number | null;
    layers: Array<{ layerName: string; delta: number }>;
    riskIndices: Array<{ id: string; delta: number }>;
    topQuestionGaps: Array<{ questionId: string; delta: number }>;
    topQuestionWins: Array<{ questionId: string; delta: number }>;
  };
} {
  const nodeA = findNodeScorecard(scorecard, nodeAId);
  const nodeB = findNodeScorecard(scorecard, nodeBId);
  if (!nodeA || !nodeB) {
    throw new Error(`Node not found in scorecard: ${!nodeA ? nodeAId : nodeBId}`);
  }

  const layerDeltas = nodeA.layerScores.map((layer) => {
    const other = nodeB.layerScores.find((row) => row.layerName === layer.layerName);
    return {
      layerName: layer.layerName,
      delta: Number(((other?.median ?? 0) - layer.median).toFixed(4))
    };
  });

  const riskDeltas = nodeA.riskIndices.map((risk) => {
    const other = nodeB.riskIndices.find((row) => row.id === risk.id);
    return {
      id: risk.id,
      delta: Number(((other?.score0to100 ?? 0) - risk.score0to100).toFixed(4))
    };
  });

  const questionDeltas = nodeA.questionScores.map((question) => {
    const other = nodeB.questionScores.find((row) => row.questionId === question.questionId);
    return {
      questionId: question.questionId,
      delta: Number(((other?.median ?? 0) - question.median).toFixed(4))
    };
  });

  const topQuestionGaps = [...questionDeltas]
    .sort((a, b) => b.delta - a.delta || a.questionId.localeCompare(b.questionId))
    .slice(0, 10);
  const topQuestionWins = [...questionDeltas]
    .sort((a, b) => a.delta - b.delta || a.questionId.localeCompare(b.questionId))
    .slice(0, 10)
    .map((row) => ({
      questionId: row.questionId,
      delta: Number((-row.delta).toFixed(4))
    }));

  return {
    nodeA,
    nodeB,
    deltas: {
      overall: Number((nodeB.headline.median - nodeA.headline.median).toFixed(4)),
      integrityIndex: Number((nodeB.integrityIndex - nodeA.integrityIndex).toFixed(4)),
      valueScore:
        nodeA.valueScore === null || nodeB.valueScore === null
          ? null
          : Number((nodeB.valueScore - nodeA.valueScore).toFixed(4)),
      economicSignificanceIndex:
        nodeA.economicSignificanceIndex === null || nodeB.economicSignificanceIndex === null
          ? null
          : Number((nodeB.economicSignificanceIndex - nodeA.economicSignificanceIndex).toFixed(4)),
      layers: layerDeltas,
      riskIndices: riskDeltas,
      topQuestionGaps,
      topQuestionWins
    }
  };
}
