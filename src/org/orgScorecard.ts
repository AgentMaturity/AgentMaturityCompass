import { join, relative, resolve } from "node:path";
import type { OrgNodeScorecard, OrgScorecard } from "./orgSchema.js";
import { orgScorecardHistoryDir, orgScorecardsDir } from "./orgStore.js";
import { pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { prepareFileSignatureWithAuditor, type SignedFileVerification } from "./orgSigner.js";
import { signDigestWithPolicy } from "../crypto/signing/signer.js";
import { sha256Hex } from "../utils/hash.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { captureOrgFiles, captureOrgPairs, assertOrgPairsCurrent, orgPairBytes, type OrgPairsSnapshot } from "./preparedOrgPairs.js";
import { capturePassportDirectories, PassportPublicationError } from "../passport/passportPublication.js";
import { verifyAuditorSignatureBytes } from "./orgSignatureBytes.js";
import { captureOrgScorecardAuthority, type OrgEffectOptions } from "./orgPublication.js";

function latestOrgScorecardPath(workspace: string): string {
  return join(orgScorecardsDir(workspace), "latest.json");
}

function orgScorecardHistoryPath(workspace: string, ts: number): string {
  return join(orgScorecardHistoryDir(workspace), `${ts}.json`);
}

type WrittenScorecard = { latestPath: string; latestSigPath: string; historyPath: string; historySigPath: string };
/** Result spelling only; native publication retains its separately captured absolute workspace. */
export function orgScorecardPathsForResult(workspace: string, computedAt: number): WrittenScorecard {
  const latestPath = latestOrgScorecardPath(workspace), historyPath = orgScorecardHistoryPath(workspace, computedAt);
  return { latestPath, latestSigPath: `${latestPath}.sig`, historyPath, historySigPath: `${historyPath}.sig` };
}
function scorecardPlan(workspace: string, input: OrgScorecard, resultWorkspace = workspace) {
  const payload = JSON.stringify(input, null, 2), scorecard = JSON.parse(payload) as OrgScorecard;
  workspace = resolve(workspace);
  const latestPath = latestOrgScorecardPath(workspace), historyPath = orgScorecardHistoryPath(workspace, scorecard.computedAt);
  return { workspace, scorecard, payload: Buffer.from(payload), latestPath, historyPath,
    written: orgScorecardPathsForResult(resultWorkspace, scorecard.computedAt), previous: captureOrgPairs([latestPath, historyPath]),
    directories: capturePassportDirectories([orgScorecardsDir(workspace), orgScorecardHistoryDir(workspace)]) };
}
interface OrgScorecardPublicationProgress {
  readonly phase: string; readonly lockSetupAttempted: boolean; readonly lockEntered: boolean;
  readonly directorySetupAttempted: boolean; readonly returnedDirectories: readonly string[]; readonly acknowledgedPaths: readonly string[];
}
class OrgScorecardPublicationError extends Error {
  readonly code = "ORG_SCORECARD_PARTIAL";
  constructor(readonly publishedPaths: readonly string[], readonly attemptedPath: string, cause: unknown,
    readonly progress: OrgScorecardPublicationProgress | null = null) {
    super("org scorecard publication is incomplete; inspect returned, acknowledged and attempted members before retrying", { cause });
    this.publishedPaths = Object.freeze([...publishedPaths]); this.name = "OrgScorecardPublicationError";
  }
}
function publishScorecard(plan: ReturnType<typeof scorecardPlan>, latestSignature: string, historySignature: string,
  assertCurrent: () => void) {
  const expected: { members: OrgPairsSnapshot["members"][number][] } = {
    members: plan.previous.members.map(row => ({ ...row, bytes: row.bytes === null ? null : Buffer.from(row.bytes) }))
  };
  const published: string[] = [], acknowledged: string[] = []; let attempted = "", phase = "lock-setup";
  let lockSetupAttempted = false, lockEntered = false, directorySetupAttempted = false;
  const progress = (): OrgScorecardPublicationProgress => Object.freeze({ phase, lockSetupAttempted, lockEntered, directorySetupAttempted,
    returnedDirectories: Object.freeze([...plan.directories.created]), acknowledgedPaths: Object.freeze([...acknowledged]) });
  const assertOwnedCurrent = () => { plan.directories.assertCurrent(); assertOrgPairsCurrent(expected); };
  // External/current signature negatives precede the last original-remaining/acknowledged-own target CAS.
  const beforeMember = () => { assertCurrent(); assertOwnedCurrent(); };
  lockSetupAttempted = true;
  try {
    return withControlFileLock({ root: join(plan.workspace, ".amc"), name: "org-scorecard-pairs", operation: () => {
      lockEntered = true; phase = "directory-setup"; beforeMember(); directorySetupAttempted = true;
      plan.directories.create(beforeMember);
      // Retain the existing two-body, then two-sidecar publication order.
      for (const [path, bytes] of [[plan.latestPath, plan.payload], [plan.historyPath, plan.payload],
        [`${plan.latestPath}.sig`, Buffer.from(latestSignature)], [`${plan.historyPath}.sig`, Buffer.from(historySignature)]] as const) {
        attempted = ""; phase = "member"; beforeMember();
        attempted = relative(plan.workspace, path);
        writeFileAtomic(path, bytes, 0o644); published.push(attempted);
        phase = "member-acknowledgment";
        const own = captureOrgFiles([path]).members[0];
        if (own === undefined || own.mode !== 0o644 || own.bytes === null || !own.bytes.equals(bytes))
          throw new Error("published org scorecard member differs from its exact prepared bytes or mode");
        const index = expected.members.findIndex(row => row.path === path);
        if (index < 0) throw new Error("published org scorecard destination was not captured");
        expected.members[index] = { ...own, bytes: Buffer.from(own.bytes) }; acknowledged.push(attempted); attempted = "";
      }
      phase = "final-continuation"; beforeMember();
      return Object.freeze({ written: plan.written, publishedPaths: Object.freeze([...published]), progress: progress(), assertCurrent: assertOwnedCurrent });
    } });
  } catch (cause) {
    const directoryAttempt = cause instanceof PassportPublicationError ? cause.attemptedPath : null;
    throw new OrgScorecardPublicationError(Object.freeze([...published]), attempted || (directoryAttempt === null ? "" : relative(plan.workspace, directoryAttempt)), cause, progress());
  }
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
  }).written;
}
/** Internal used preparation retains first-signature authority through the second Sign and later workspace-log waits. */
export async function prepareOrgScorecardAsync(workspace: string, scorecard: OrgScorecard, options: OrgEffectOptions = {}) {
  const resultWorkspace = workspace, copied = structuredClone(scorecard), beforePublish = options.beforePublish;
  workspace = resolve(workspace);
  const assertAuthority = captureOrgScorecardAuthority(workspace, beforePublish), plan = scorecardPlan(workspace, copied, resultWorkspace);
  const beforeSign = () => { assertAuthority(); plan.directories.assertCurrent(); assertOrgPairsCurrent(plan.previous); };
  const latest = await prepareFileSignatureWithAuditor(workspace, plan.latestPath, plan.payload, "ORG_SCORECARD", beforeSign);
  const beforeHistorySign = () => { beforeSign(); latest.assertCurrent(); };
  beforeHistorySign();
  const history = await prepareFileSignatureWithAuditor(workspace, plan.historyPath, plan.payload, "ORG_SCORECARD", beforeHistorySign);
  let published: ReturnType<typeof publishScorecard> | null = null;
  const assertCurrent = () => {
    assertAuthority(); latest.assertCurrent(); history.assertCurrent(); plan.directories.assertCurrent(); published?.assertCurrent();
  };
  assertCurrent();
  return { scorecard: plan.scorecard, assertCurrent, publish() {
    if (published !== null) throw new Error("prepared org scorecard has already been published");
    published = publishScorecard(plan, latest.signatureBytes, history.signatureBytes, assertCurrent);
    try { assertCurrent(); }
    catch (cause) { throw new OrgScorecardPublicationError(published.publishedPaths, "", cause,
      Object.freeze({ ...published.progress, phase: "post-lock-continuation" })); }
    return published.written;
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
