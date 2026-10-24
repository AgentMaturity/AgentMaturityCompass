import { join, relative } from "node:path";
import type { OrgNodeScorecard, OrgScorecard } from "./orgSchema.js";
import { orgScorecardHistoryDir, orgScorecardsDir } from "./orgStore.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { prepareFileSignatureWithAuditor, type SignedFileVerification } from "./orgSigner.js";
import { signDigestWithPolicy } from "../crypto/signing/signer.js";
import { sha256Hex } from "../utils/hash.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { captureOrgPairs, assertOrgPairsCurrent, orgPairBytes } from "./preparedOrgPairs.js";
import { verifyAuditorSignatureBytes } from "./orgSignatureBytes.js";
import { captureOrgScorecardAuthority, type OrgEffectOptions } from "./orgPublication.js";

function latestOrgScorecardPath(workspace: string): string {
  return join(orgScorecardsDir(workspace), "latest.json");
}

function orgScorecardHistoryPath(workspace: string, ts: number): string {
  return join(orgScorecardHistoryDir(workspace), `${ts}.json`);
}

type WrittenScorecard = { latestPath: string; latestSigPath: string; historyPath: string; historySigPath: string };
function scorecardPlan(workspace: string, input: OrgScorecard) {
  const payload = JSON.stringify(input, null, 2), scorecard = JSON.parse(payload) as OrgScorecard;
  const latestPath = latestOrgScorecardPath(workspace), historyPath = orgScorecardHistoryPath(workspace, scorecard.computedAt);
  return { workspace, scorecard, payload: Buffer.from(payload), latestPath, historyPath,
    previous: captureOrgPairs([latestPath, historyPath]) };
}
export class OrgScorecardPublicationError extends Error {
  readonly code = "ORG_SCORECARD_PARTIAL";
  constructor(readonly publishedPaths: readonly string[], readonly attemptedPath: string, cause: unknown) {
    super("org scorecard publication is incomplete; inspect acknowledged and attempted members before retrying", { cause });
    this.name = "OrgScorecardPublicationError";
  }
}
function publishScorecard(plan: ReturnType<typeof scorecardPlan>, latestSignature: string, historySignature: string,
  assertCurrent: () => void): WrittenScorecard {
  return withControlFileLock({ root: join(plan.workspace, ".amc"), name: "org-scorecard-pairs", operation: () => {
    assertCurrent(); assertOrgPairsCurrent(plan.previous);
    const published: string[] = []; let attempted = "";
    try {
      ensureDir(orgScorecardsDir(plan.workspace)); ensureDir(orgScorecardHistoryDir(plan.workspace));
      // Retain the existing two-body, then two-sidecar publication order.
      for (const [path, bytes] of [[plan.latestPath, plan.payload], [plan.historyPath, plan.payload],
        [`${plan.latestPath}.sig`, latestSignature], [`${plan.historyPath}.sig`, historySignature]] as const) {
        attempted = relative(plan.workspace, path); writeFileAtomic(path, bytes, 0o644); published.push(attempted);
      }
    } catch (error) { throw new OrgScorecardPublicationError(Object.freeze([...published]), attempted, error); }
    return { latestPath: plan.latestPath, latestSigPath: `${plan.latestPath}.sig`,
      historyPath: plan.historyPath, historySigPath: `${plan.historyPath}.sig` };
  } });
}
/** Existing sync API, with both fixed ORG_SCORECARD signatures prepared before the first file replacement. */
export function writeOrgScorecard(workspace: string, scorecard: OrgScorecard): WrittenScorecard {
  const plan = scorecardPlan(workspace, scorecard), digest = sha256Hex(plan.payload);
  const sign = () => {
    const signed = signDigestWithPolicy({ workspace, kind: "ORG_SCORECARD", digestHex: digest });
    return JSON.stringify({ digestSha256: digest, signature: signed.signature, signedTs: signed.signedTs,
      signer: "auditor", envelope: signed.envelope }, null, 2);
  };
  const latest = sign(), history = sign();
  return publishScorecard(plan, latest, history, () => {
    for (const signature of [latest, history]) if (!verifyAuditorSignatureBytes(workspace, "ORG_SCORECARD", plan.payload, Buffer.from(signature)).valid)
      throw new Error("prepared scorecard signature is not admitted by current ORG_SCORECARD authority");
  });
}
/** Internal used preparation retains first-signature authority through the second Sign and later workspace-log waits. */
export async function prepareOrgScorecardAsync(workspace: string, scorecard: OrgScorecard, options: OrgEffectOptions = {}) {
  const copied = structuredClone(scorecard), beforePublish = options.beforePublish;
  const assertAuthority = captureOrgScorecardAuthority(workspace, beforePublish), plan = scorecardPlan(workspace, copied);
  const latest = await prepareFileSignatureWithAuditor(workspace, plan.latestPath, plan.payload, "ORG_SCORECARD");
  const history = await prepareFileSignatureWithAuditor(workspace, plan.historyPath, plan.payload, "ORG_SCORECARD");
  let published: ReturnType<typeof captureOrgPairs> | null = null;
  const assertCurrent = () => {
    assertAuthority(); latest.assertCurrent(); history.assertCurrent();
    if (published !== null) assertOrgPairsCurrent(published);
  };
  return { scorecard: plan.scorecard, assertCurrent, publish() {
    const written = publishScorecard(plan, latest.signatureBytes, history.signatureBytes, assertCurrent);
    try {
    published = captureOrgPairs([plan.latestPath, plan.historyPath]);
    if (published.members.some(member => member.mode !== 0o644)) throw new OrgScorecardPublicationError(
      Object.freeze([written.latestPath, written.historyPath, written.latestSigPath, written.historySigPath].map(path => relative(workspace, path))),
      "published scorecard modes", new Error("published scorecard mode changed"));
    for (const [path, expected] of [[plan.latestPath, plan.payload], [plan.historyPath, plan.payload],
      [`${plan.latestPath}.sig`, Buffer.from(latest.signatureBytes)], [`${plan.historyPath}.sig`, Buffer.from(history.signatureBytes)]] as const) {
      const actual = orgPairBytes(published, path);
      if (actual === null || !actual.equals(expected)) throw new OrgScorecardPublicationError(
        Object.freeze([written.latestPath, written.historyPath, written.latestSigPath, written.historySigPath].map(path => relative(workspace, path))),
        relative(workspace, path), new Error("published scorecard changed before its continuation was captured"));
    }
    } catch (error) {
      if (error instanceof OrgScorecardPublicationError) throw error;
      throw new OrgScorecardPublicationError(Object.freeze([written.latestPath, written.historyPath, written.latestSigPath, written.historySigPath]
        .map(path => relative(workspace, path))), "published scorecard snapshot", error);
    }
    return written;
  } };
}
export async function writeOrgScorecardAsync(workspace: string, scorecard: OrgScorecard,
  options: OrgEffectOptions = {}): Promise<WrittenScorecard> {
  return (await prepareOrgScorecardAsync(workspace, scorecard, options)).publish();
}

export function loadLatestOrgScorecard(workspace: string): OrgScorecard | null {
  const path = latestOrgScorecardPath(workspace);
  if (!pathExists(path)) {
    return null;
  }
  return JSON.parse(readUtf8(path)) as OrgScorecard;
}

export function verifyLatestOrgScorecardSignature(workspace: string): SignedFileVerification {
  const path = latestOrgScorecardPath(workspace), sigPath = `${path}.sig`;
  try {
    const captured = captureOrgPairs([path]), body = orgPairBytes(captured, path), signature = orgPairBytes(captured, sigPath);
    if (body === null) return { valid: false, signatureExists: false, reason: "file missing", path, sigPath };
    if (signature === null) return { valid: false, signatureExists: false, reason: "signature missing", path, sigPath };
    return { ...verifyAuditorSignatureBytes(workspace, "ORG_SCORECARD", body, signature), signatureExists: true, path, sigPath };
  } catch { return { valid: false, signatureExists: pathExists(sigPath), reason: "scorecard signature read failed", path, sigPath }; }
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
