import { percentileRank } from "../experiments/stats.js";
import { readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { listAgents, verifyAgentConfigSignature, verifyFleetConfigSignature } from "../fleet/registry.js";
import { listVerifiedRuns } from "../diagnostic/runReportResolution.js";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { parseWindowToMs } from "../utils/time.js";
import type { DiagnosticReport, EvidenceOutcome, TrustTier } from "../types.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { keyPolicy, loadKeysConfig } from "../keys/keysConfig.js";
import { assertPolicySignerCurrent, describePolicySigner } from "../crypto/signing/signer.js";
import { questionBank } from "../diagnostic/questionBank.js";
import { activeFreezeStatus } from "../drift/freezeEngine.js";
import { latestAssuranceByPack } from "../assurance/assuranceRunner.js";
import { computeFailureRiskIndices } from "../assurance/indices.js";
import { loadTargetProfile } from "../targets/targetProfile.js";
import { listImportedBenchmarks } from "../benchmarks/benchStore.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { robustScore, weightedDistribution, weightedMedian, weightedMean, type WeightedPoint, weightedPercentile } from "./orgAggregation.js";
import type { OrgConfig, OrgNode, OrgNodeScorecard, OrgScorecard, OrgNodeType, NodeLayerScore, NodeQuestionScore, WeightedDistribution } from "./orgSchema.js";
import { loadOrgConfig, nodeAgentIds, memberWeightForNode } from "./orgStore.js";
import { verifyOrgConfigSignature } from "./orgStore.js";
import { writeOrgScorecard, prepareOrgScorecardAsync, orgScorecardPathsForResult } from "./orgScorecard.js";
import { appendTransparencyEntryAttemptAsync, captureWorkspaceLogAuthority } from "../transparency/asyncWorkspaceAppend.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { captureOrgComputationInputs, captureOrgScorecardAuthority, OrgFollowupError, type OrgEffectOptions } from "./orgPublication.js";

const LAYER_NAMES = [
  "Strategic Agent Operations",
  "Leadership & Autonomy",
  "Culture & Alignment",
  "Resilience",
  "Skills"
] as const;

interface AgentSnapshot {
  agentId: string;
  run: DiagnosticReport;
  targetMap: Record<string, number>;
  baseWeight: number;
  trustTier: TrustTier | "OBSERVED_HARDENED";
  trustWeight: number;
  integrityWeight: number;
  penaltyWeight: number;
  finalWeight: number;
  hasFreeze: boolean;
  hasConfigIssue: boolean;
  overall: number;
  valueScore: number | null;
  economicSignificanceIndex: number | null;
  assuranceScores: Record<string, number>;
  riskScores: Record<string, number>;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Sealed runs only (WP37): an edited run must not move an org scorecard. */
function latestRunInWindow(workspace: string, agentId: string, windowStartTs: number, windowEndTs: number): DiagnosticReport | null {
  return listVerifiedRuns(workspace, agentId)
    .find((row) => row.ts >= windowStartTs && row.ts <= windowEndTs && row.status === "VALID") ?? null;
}

function latestOutcomeValuesInWindow(workspace: string, agentId: string, windowStartTs: number, windowEndTs: number): {
  valueScore: number | null;
  economicSignificanceIndex: number | null;
} {
  const reportsDir = join(getAgentPaths(workspace, agentId).rootDir, "outcomes", "reports");
  if (!pathExists(reportsDir)) {
    return { valueScore: null, economicSignificanceIndex: null };
  }
  const rows = readdirSync(reportsDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      try {
        const parsed = JSON.parse(readUtf8(join(reportsDir, file))) as {
          ts?: number;
          valueScore?: number;
          economicSignificanceIndex?: number;
        };
        return {
          ts: Number(parsed.ts ?? 0),
          valueScore: typeof parsed.valueScore === "number" ? parsed.valueScore : null,
          economicSignificanceIndex: typeof parsed.economicSignificanceIndex === "number" ? parsed.economicSignificanceIndex : null
        };
      } catch {
        return null;
      }
    })
    .filter((row): row is { ts: number; valueScore: number | null; economicSignificanceIndex: number | null } => row !== null)
    .filter((row) => row.ts >= windowStartTs && row.ts <= windowEndTs)
    .sort((a, b) => b.ts - a.ts);
  return rows[0] ?? { valueScore: null, economicSignificanceIndex: null };
}

function inferTrustTier(report: DiagnosticReport): TrustTier | "OBSERVED_HARDENED" {
  const coverage = report.evidenceTrustCoverage ?? {
    observed: 0,
    attested: 0,
    selfReported: 0
  };
  if (coverage.observed >= 0.85 && report.correlationRatio >= 0.95 && report.invalidReceiptsCount === 0) {
    return "OBSERVED_HARDENED";
  }
  if (coverage.observed >= 0.5) {
    return "OBSERVED";
  }
  if (coverage.attested >= coverage.selfReported) {
    return "ATTESTED";
  }
  return "SELF_REPORTED";
}

function trustWeight(tier: TrustTier | "OBSERVED_HARDENED"): number {
  switch (tier) {
    case "OBSERVED_HARDENED":
      return 1.0;
    case "OBSERVED":
      return 0.9;
    case "ATTESTED":
      return 0.7;
    case "SELF_REPORTED":
      return 0.4;
    default:
      return 0.4;
  }
}

function overallFromRun(run: DiagnosticReport): number {
  const layers = Array.isArray(run.layerScores) ? run.layerScores : [];
  if (layers.length === 0) {
    return 0;
  }
  return layers.reduce((sum, layer) => sum + Number(layer.avgFinalLevel ?? 0), 0) / layers.length;
}

function normalizeRiskTier(config: OrgConfig, nodeId: string): "low" | "med" | "high" | "critical" {
  const nodeDefaults = config.policies.defaultsByNode[nodeId];
  const tier = nodeDefaults?.riskTierDefault;
  if (tier === "low" || tier === "med" || tier === "high" || tier === "critical") {
    return tier;
  }
  return "med";
}

function buildAgentSnapshots(params: {
  workspace: string;
  config: OrgConfig;
  node: OrgNode;
  windowStartTs: number;
  windowEndTs: number;
}): AgentSnapshot[] {
  const fleetSig = verifyFleetConfigSignature(params.workspace);
  const agentIds = nodeAgentIds(params.config, params.node.id);
  const snapshots: AgentSnapshot[] = [];

  for (const agentIdRaw of agentIds) {
    const agentId = resolveAgentId(params.workspace, agentIdRaw);
    const run = latestRunInWindow(params.workspace, agentId, params.windowStartTs, params.windowEndTs);
    if (!run) {
      continue;
    }

    const baseWeight = memberWeightForNode(params.config, agentId, params.node.id) || 1;
    const tier = inferTrustTier(run);
    const tWeight = trustWeight(tier);
    const iWeight = clamp(run.integrityIndex, 0.2, 1.0);

    const freeze = activeFreezeStatus(params.workspace, agentId);
    const agentSig = verifyAgentConfigSignature(params.workspace, agentId);
    const hasConfigIssue = !agentSig.valid || !fleetSig.valid;
    // One preserves the existing weight when no freeze/configuration penalty applies.
    // One preserves the existing weight when no freeze/configuration penalty applies.
    const penaltyWeight = freeze.active || hasConfigIssue ? 0.8 : 1.0;

    const outcome = latestOutcomeValuesInWindow(params.workspace, agentId, params.windowStartTs, params.windowEndTs);
    const assurance = latestAssuranceByPack({
      workspace: params.workspace,
      agentId,
      windowStartTs: params.windowStartTs,
      windowEndTs: params.windowEndTs
    });
    const risk = computeFailureRiskIndices({ run });

    let targetMap: Record<string, number> = {};
    try {
      targetMap = loadTargetProfile(params.workspace, "default", agentId).mapping;
    } catch {
      targetMap = {};
    }

    snapshots.push({
      agentId,
      run,
      targetMap,
      baseWeight,
      trustTier: tier,
      trustWeight: tWeight,
      integrityWeight: iWeight,
      penaltyWeight,
      finalWeight: baseWeight * tWeight * iWeight * penaltyWeight,
      hasFreeze: freeze.active,
      hasConfigIssue,
      overall: overallFromRun(run),
      valueScore: outcome.valueScore,
      economicSignificanceIndex: outcome.economicSignificanceIndex,
      assuranceScores: Object.fromEntries([...assurance.entries()].map(([id, row]) => [id, row.score0to100])),
      riskScores: Object.fromEntries(risk.indices.map((idx) => [idx.id, idx.score0to100]))
    });
  }

  return snapshots;
}

function scoreFromPoints(points: WeightedPoint[]): number {
  return Number(robustScore(points).median.toFixed(4));
}

function distFromPoints(points: WeightedPoint[]): WeightedDistribution {
  return weightedDistribution(points);
}

function percentiles(points: WeightedPoint[]): { p10: number; p50: number; p90: number } {
  return {
    p10: Number(weightedPercentile(points, 0.1).toFixed(4)),
    p50: Number(weightedPercentile(points, 0.5).toFixed(4)),
    p90: Number(weightedPercentile(points, 0.9).toFixed(4))
  };
}

function buildNodeScorecard(params: {
  workspace: string;
  config: OrgConfig;
  node: OrgNode;
  snapshots: AgentSnapshot[];
  configTrusted: boolean;
}): OrgNodeScorecard {
  const pointsOverall: WeightedPoint[] = params.snapshots.map((snap) => ({
    value: snap.overall,
    weight: snap.finalWeight
  }));

  const headline = robustScore(pointsOverall);
  const headlineDistribution = distFromPoints(pointsOverall);

  const layerScores: NodeLayerScore[] = LAYER_NAMES.map((layerName) => {
    const points = params.snapshots.map((snap) => ({
      value: snap.run.layerScores.find((layer) => layer.layerName === layerName)?.avgFinalLevel ?? 0,
      weight: snap.finalWeight
    }));
    const agg = robustScore(points);
    return {
      layerName,
      median: agg.median,
      trimmedMean: agg.trimmedMean
    };
  });

  const questionScores: NodeQuestionScore[] = questionBank.map((question) => {
    const points = params.snapshots.map((snap) => ({
      value: snap.run.questionScores.find((row) => row.questionId === question.id)?.finalLevel ?? 0,
      weight: snap.finalWeight
    }));
    const targetPoints = params.snapshots.map((snap) => ({
      value: snap.targetMap[question.id] ?? 0,
      weight: snap.finalWeight
    }));
    const agg = robustScore(points);
    return {
      questionId: question.id,
      median: agg.median,
      trimmedMean: agg.trimmedMean,
      targetMedian: Number(scoreFromPoints(targetPoints).toFixed(4))
    };
  });

  const integrityPoints: WeightedPoint[] = params.snapshots.map((snap) => ({
    value: snap.run.integrityIndex,
    weight: snap.finalWeight
  }));
  const integrityMedian = scoreFromPoints(integrityPoints);

  const valuePoints: WeightedPoint[] = params.snapshots
    .filter((snap) => snap.valueScore !== null)
    .map((snap) => ({ value: snap.valueScore as number, weight: snap.finalWeight }));
  const econPoints: WeightedPoint[] = params.snapshots
    .filter((snap) => snap.economicSignificanceIndex !== null)
    .map((snap) => ({ value: snap.economicSignificanceIndex as number, weight: snap.finalWeight }));

  const assuranceIds = [...new Set(params.snapshots.flatMap((snap) => Object.keys(snap.assuranceScores)))].sort((a, b) =>
    a.localeCompare(b)
  );
  const assurance = Object.fromEntries(
    assuranceIds.map((id) => {
      const points = params.snapshots
        .filter((snap) => typeof snap.assuranceScores[id] === "number")
        .map((snap) => ({ value: snap.assuranceScores[id]!, weight: snap.finalWeight }));
      return [id, distFromPoints(points)];
    })
  ) as Record<string, WeightedDistribution>;

  const riskIds = [
    "EcosystemFocusRisk",
    "ClarityPathRisk",
    "EconomicSignificanceRisk",
    "RiskAssuranceRisk",
    "DigitalDualityRisk"
  ];
  const riskIndices = riskIds.map((id) => {
    const points = params.snapshots
      .filter((snap) => typeof snap.riskScores[id] === "number")
      .map((snap) => ({ value: snap.riskScores[id]!, weight: snap.finalWeight }));
    return {
      id,
      score0to100: Number(scoreFromPoints(points).toFixed(4))
    };
  });

  const coverageObserved = weightedMean(
    params.snapshots.map((snap) => ({
      value: snap.run.evidenceTrustCoverage.observed,
      weight: snap.finalWeight
    }))
  );
  const coverageAttested = weightedMean(
    params.snapshots.map((snap) => ({
      value: snap.run.evidenceTrustCoverage.attested,
      weight: snap.finalWeight
    }))
  );
  const coverageSelf = weightedMean(
    params.snapshots.map((snap) => ({
      value: snap.run.evidenceTrustCoverage.selfReported,
      weight: snap.finalWeight
    }))
  );
  const correlationMedian = weightedMedian(
    params.snapshots.map((snap) => ({
      value: snap.run.correlationRatio,
      weight: snap.finalWeight
    }))
  );

  const cheatSuspicionCount = params.snapshots.reduce(
    (sum, snap) =>
      sum +
      snap.run.invalidReceiptsCount +
      (Array.isArray(snap.run.correlationWarnings) ? snap.run.correlationWarnings.length : 0) +
      (snap.run.unsupportedClaimCount ?? 0),
    0
  );

  const topGapQuestions = [...questionScores]
    .map((row) => ({
      questionId: row.questionId,
      currentMedian: row.median,
      targetMedian: row.targetMedian,
      gap: Number((row.targetMedian - row.median).toFixed(4))
    }))
    .filter((row) => row.gap > 0)
    .sort((a, b) => b.gap - a.gap || a.questionId.localeCompare(b.questionId))
    .slice(0, 10);

  const topSystemicRisks = [...riskIndices]
    .sort((a, b) => b.score0to100 - a.score0to100 || a.id.localeCompare(b.id))
    .slice(0, 5);

  const whyCapped: string[] = [];
  let trustLabel: OrgNodeScorecard["trustLabel"] = "HIGH TRUST";
  let cappedHeadline = headline;

  if (!params.configTrusted) {
    trustLabel = "UNTRUSTED";
    cappedHeadline = {
      median: Math.min(cappedHeadline.median, 3.0),
      trimmedMean: Math.min(cappedHeadline.trimmedMean, 3.0)
    };
    whyCapped.push("UNTRUSTED CONFIG: org.yaml signature invalid; display-level cap <= 3.0");
  }

  if (coverageObserved < 0.5 || correlationMedian < 0.9) {
    if (trustLabel !== "UNTRUSTED") {
      trustLabel = "LOW TRUST";
    }
    cappedHeadline = {
      median: Math.min(cappedHeadline.median, 3.0),
      trimmedMean: Math.min(cappedHeadline.trimmedMean, 3.0)
    };
    whyCapped.push("Evidence gap: OBSERVED coverage < 50% or median correlation_ratio < 0.9");
  }

  if (params.snapshots.some((snap) => snap.hasFreeze)) {
    whyCapped.push("Freeze penalty applied for one or more agents with active freezes");
  }
  if (params.snapshots.some((snap) => snap.hasConfigIssue)) {
    whyCapped.push("Config signature penalty applied for one or more agents");
  }

  const runRefs = [...new Set(params.snapshots.map((snap) => snap.run.runId))].sort((a, b) => a.localeCompare(b));
  const trustTiers = params.snapshots.map((snap) => snap.trustTier);
  const countHighTrustAgents = trustTiers.filter((tier) => tier === "OBSERVED" || tier === "OBSERVED_HARDENED").length;
  const countLowTrustAgents = trustTiers.filter((tier) => tier === "SELF_REPORTED").length;

  return {
    nodeId: params.node.id,
    nodeType: params.node.type,
    name: params.node.name,
    parentId: params.node.parentId,
    trustLabel,
    agentIds: params.snapshots.map((snap) => snap.agentId).sort((a, b) => a.localeCompare(b)),
    countAgentsIncluded: params.snapshots.length,
    countHighTrustAgents,
    countLowTrustAgents,
    confidence: {
      observedCoverage: Number(coverageObserved.toFixed(4)),
      medianCorrelationRatio: Number(correlationMedian.toFixed(4)),
      integrityMedian: Number(integrityMedian.toFixed(4))
    },
    evidenceCoverage: {
      observedRatio: Number(coverageObserved.toFixed(4)),
      attestedRatio: Number(coverageAttested.toFixed(4)),
      selfReportedRatio: Number(coverageSelf.toFixed(4)),
      medianCorrelationRatio: Number(correlationMedian.toFixed(4)),
      cheatSuspicionCount
    },
    headline: {
      median: Number(cappedHeadline.median.toFixed(4)),
      trimmedMean: Number(cappedHeadline.trimmedMean.toFixed(4))
    },
    headlineDistribution,
    layerScores,
    questionScores,
    integrityIndex: Number(integrityMedian.toFixed(4)),
    valueScore: valuePoints.length > 0 ? Number(scoreFromPoints(valuePoints).toFixed(4)) : null,
    economicSignificanceIndex: econPoints.length > 0 ? Number(scoreFromPoints(econPoints).toFixed(4)) : null,
    assurance,
    riskIndices,
    topGapQuestions,
    topSystemicRisks,
    whyCapped,
    runRefs,
    transparencyRefs: []
  };
}

function ecosystemRollupFromBenchmarks(
  workspace: string,
  scorecard: OrgScorecard,
  enterpriseRollup: OrgNodeScorecard | null
): OrgScorecard["summary"]["ecosystemRollup"] {
  if (!enterpriseRollup) {
    return null;
  }
  const peers = listImportedBenchmarks(workspace);
  const percentile = (value: number, rows: number[]): number | null => {
    if (rows.length === 0) return null;
    return Number(percentileRank(rows, value).toFixed(2));
  };

  const overallRows = peers.map((row) => row.bench.run.overall);
  const integrityRows = peers.map((row) => row.bench.run.integrityIndex);
  const valueRows = peers
    .map((row) => {
      const runRow = row.bench.run as { valueScore?: unknown };
      return typeof runRow.valueScore === "number" ? runRow.valueScore : null;
    })
    .filter((row): row is number => row !== null);

  const percentiles = {
    overall: percentile(enterpriseRollup.headline.median, overallRows),
    integrity: percentile(enterpriseRollup.integrityIndex, integrityRows),
    value: enterpriseRollup.valueScore === null ? null : percentile(enterpriseRollup.valueScore, valueRows),
  };
  const metricOutcomes: Record<"overall" | "integrity" | "value", EvidenceOutcome> = {
    overall: percentiles.overall === null ? "not_evaluated" : "measured",
    integrity: percentiles.integrity === null ? "not_evaluated" : "measured",
    value: percentiles.value === null ? "not_evaluated" : "measured",
  };
  return {
    outcome: Object.values(percentiles).some(value => value !== null) ? "measured" : "not_evaluated",
    sampleSize: peers.length,
    metricOutcomes,
    peerCount: peers.length,
    localEnterpriseOverall: enterpriseRollup.headline.median,
    localEnterpriseIntegrity: enterpriseRollup.integrityIndex,
    localEnterpriseValue: enterpriseRollup.valueScore,
    percentiles,
  };
}

export function computeOrgScorecard(params: {
  workspace: string;
  window: string;
  config?: OrgConfig;
  asOfTs?: number;
}): OrgScorecard {
  const config = params.config ?? loadOrgConfig(params.workspace);
  const orgSig = verifyOrgConfigSignature(params.workspace);
  const now = params.asOfTs ?? Date.now();
  const windowMs = parseWindowToMs(params.window);
  const windowStartTs = now - windowMs;
  const windowEndTs = now;

  const nodes = [...config.nodes]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((node) => {
      const snapshots = buildAgentSnapshots({
        workspace: params.workspace,
        config,
        node,
        windowStartTs,
        windowEndTs
      });
      return buildNodeScorecard({
        workspace: params.workspace,
        config,
        node,
        snapshots,
        configTrusted: orgSig.valid
      });
    });

  const enterpriseNode = config.nodes.find((node) => node.type === "ENTERPRISE") ?? null;
  const enterpriseRollup = enterpriseNode
    ? nodes.find((node) => node.nodeId === enterpriseNode.id) ?? null
    : null;

  const scorecard: OrgScorecard = {
    v: 1,
    enterpriseId: config.enterpriseId,
    enterpriseName: config.enterpriseName,
    computedAt: now,
    window: {
      raw: params.window,
      windowStartTs,
      windowEndTs
    },
    configTrusted: orgSig.valid,
    nodes,
    summary: {
      enterpriseNodeId: enterpriseNode?.id ?? null,
      enterpriseRollup,
      ecosystemRollup: null
    }
  };

  scorecard.summary.ecosystemRollup = ecosystemRollupFromBenchmarks(params.workspace, scorecard, enterpriseRollup);

  return scorecard;
}

export function recomputeAndPersistOrgScorecard(params: {
  workspace: string;
  window: string;
}): {
  scorecard: OrgScorecard;
  latestPath: string;
  latestSigPath: string;
  historyPath: string;
  historySigPath: string;
} {
  const scorecard = computeOrgScorecard(params);
  const written = writeOrgScorecard(params.workspace, scorecard);

  appendTransparencyEntry({
    workspace: params.workspace,
    type: "ORG_SCORECARD_RECORDED",
    agentId: "org",
    artifact: {
      kind: "policy",
      sha256: sha256Hex(Buffer.from(JSON.stringify(scorecard), "utf8")),
      id: String(scorecard.computedAt)
    }
  });

  return {
    scorecard,
    ...written
  };
}

/** Computed values are historical at computedAt; only the exact consumed org pair remains a current input gate. */
export async function recomputeAndPersistOrgScorecardAsync(params: { workspace: string; window: string },
  options: OrgEffectOptions = {}): Promise<ReturnType<typeof recomputeAndPersistOrgScorecard>> {
  const assertSigningEnabled = () => { if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing"); };
  assertSigningEnabled();
  const actor = options.beforePublish, beforeAuthority = () => { assertSigningEnabled(); actor?.(); assertSigningEnabled(); };
  const resultWorkspace = params.workspace, input = { workspace: resolve(resultWorkspace), window: params.window };
  const assertOriginal = captureOrgScorecardAuthority(input.workspace, beforeAuthority);
  const logDescriptors = (["TRANSPARENCY_ROOT", "MERKLE_ROOT"] as const).map(kind => describePolicySigner(input.workspace, kind));
  const logPolicy = logDescriptors.some(row => row.mode === "VAULT") ? canonicalize(keyPolicy(loadKeysConfig(input.workspace))) : null;
  const beforeLog = () => { beforeAuthority();
    for (const descriptor of logDescriptors) assertPolicySignerCurrent(input.workspace, descriptor);
    if (logPolicy !== null && canonicalize(keyPolicy(loadKeysConfig(input.workspace))) !== logPolicy)
      throw new Error("original org log signing policy changed while preparing the operation");
  };
  const originalLog = captureWorkspaceLogAuthority(input.workspace, beforeLog);
  const inputs = captureOrgComputationInputs(input.workspace), computed = computeOrgScorecard({ ...input, config: inputs.config });
  const beforePublish = () => { assertOriginal(); originalLog.assertCurrent(); inputs.assertCurrent(); };
  beforePublish();
  const prepared = await prepareOrgScorecardAsync(input.workspace, computed, { beforePublish });
  const written = prepared.publish(), scorecard = prepared.scorecard;
  const publishedPaths = Object.freeze([written.latestPath, written.historyPath, written.latestSigPath, written.historySigPath]
    .map(path => relative(input.workspace, path)));
  let completedEntryHash: string | null = null;
  try {
    const stable = () => withControlFileLock({ root: join(input.workspace, ".amc"), name: "org-scorecard-pairs", operation: () => {
      beforePublish(); prepared.assertCurrent();
    } });
    const attempt = await appendTransparencyEntryAttemptAsync({ workspace: input.workspace, type: "ORG_SCORECARD_RECORDED", agentId: "org",
      artifact: { kind: "policy", sha256: sha256Hex(Buffer.from(JSON.stringify(scorecard), "utf8")), id: String(scorecard.computedAt) } },
      { beforeCommit: stable, beforeMember: stable });
    completedEntryHash = attempt.entry.hash; stable(); attempt.assertCurrent();
  } catch (error) {
    throw new OrgFollowupError("log", publishedPaths, null, error, completedEntryHash);
  }
  return { scorecard, ...orgScorecardPathsForResult(resultWorkspace, scorecard.computedAt) };
}

export function nodeHierarchy(config: OrgConfig): Array<{
  nodeId: string;
  nodeType: OrgNodeType;
  name: string;
  parentId: string | null;
  depth: number;
}> {
  const byParent = new Map<string | null, OrgNode[]>();
  for (const node of config.nodes) {
    const list = byParent.get(node.parentId) ?? [];
    list.push(node);
    byParent.set(node.parentId, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }

  const out: Array<{
    nodeId: string;
    nodeType: OrgNodeType;
    name: string;
    parentId: string | null;
    depth: number;
  }> = [];

  const walk = (parentId: string | null, depth: number): void => {
    const children = byParent.get(parentId) ?? [];
    for (const child of children) {
      out.push({
        nodeId: child.id,
        nodeType: child.type,
        name: child.name,
        parentId: child.parentId,
        depth
      });
      walk(child.id, depth + 1);
    }
  };

  walk(null, 0);
  return out;
}

export function summarizeNodeForUi(scorecard: OrgScorecard, nodeId: string): {
  nodeId: string;
  headline: number;
  integrityIndex: number;
  trustLabel: string;
  valueScore: number | null;
  evidenceGap: boolean;
} | null {
  const node = scorecard.nodes.find((row) => row.nodeId === nodeId);
  if (!node) {
    return null;
  }
  return {
    nodeId: node.nodeId,
    headline: node.headline.median,
    integrityIndex: node.integrityIndex,
    trustLabel: node.trustLabel,
    valueScore: node.valueScore,
    evidenceGap: node.evidenceCoverage.observedRatio < 0.5 || node.evidenceCoverage.medianCorrelationRatio < 0.9
  };
}

export function scorecardNodeComparison(scorecard: OrgScorecard, nodeA: string, nodeB: string): {
  nodeA: string;
  nodeB: string;
  overallDelta: number;
  layerDeltas: Array<{ layerName: string; delta: number }>;
  topGapQuestions: Array<{ questionId: string; delta: number }>;
  topWins: Array<{ questionId: string; delta: number }>;
} {
  const a = scorecard.nodes.find((node) => node.nodeId === nodeA);
  const b = scorecard.nodes.find((node) => node.nodeId === nodeB);
  if (!a || !b) {
    throw new Error(`Node not found: ${!a ? nodeA : nodeB}`);
  }

  const questionDeltas = a.questionScores.map((row) => {
    const other = b.questionScores.find((item) => item.questionId === row.questionId);
    return {
      questionId: row.questionId,
      delta: Number(((other?.median ?? 0) - row.median).toFixed(4))
    };
  });

  return {
    nodeA: a.nodeId,
    nodeB: b.nodeId,
    overallDelta: Number((b.headline.median - a.headline.median).toFixed(4)),
    layerDeltas: a.layerScores.map((row) => ({
      layerName: row.layerName,
      delta: Number(((b.layerScores.find((item) => item.layerName === row.layerName)?.median ?? 0) - row.median).toFixed(4))
    })),
    topGapQuestions: [...questionDeltas].sort((x, y) => y.delta - x.delta).slice(0, 10),
    topWins: [...questionDeltas].sort((x, y) => x.delta - y.delta).slice(0, 10)
  };
}
