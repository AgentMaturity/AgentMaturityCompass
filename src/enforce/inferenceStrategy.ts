import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { writeEnforceResourceManifest, enforceResourceManifestRef, type EnforceResourceManifestRef } from "./resourceManifest.js";
import { getAgentPaths, normalizeAgentId } from "../fleet/paths.js";
import { trySignArtifactFile } from "../lifecycle/artifactSignature.js";
import { ensureDir, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

const inferenceMetricsSchema = z.object({
  score: z.number().min(0).max(1),
  costUsd: z.number().min(0),
  latencyMs: z.number().min(0),
  risk: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1)
});

export const inferenceStrategyInputSchema = z.object({
  strategyId: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  promptResourceVersion: z.string().min(1),
  temperature: z.number().min(0).max(2).default(0),
  settings: z.record(z.string(), z.unknown()).default({}),
  toolPolicy: z.string().min(1).default("read-only"),
  metrics: inferenceMetricsSchema,
  evidenceRefs: z.array(z.string().min(1)).default([])
});

export type InferenceStrategyInput = z.input<typeof inferenceStrategyInputSchema>;
export type InferenceObjective = "balanced" | "quality" | "cost" | "latency" | "safety";

export interface InferenceStrategyRecord extends z.output<typeof inferenceStrategyInputSchema> {
  rank: number;
  weightedScore: number;
  tradeoffs: {
    scoreDelta: number;
    costDeltaUsd: number;
    latencyDeltaMs: number;
    riskDelta: number;
  };
}

export interface InferenceStrategyPolicyCheck {
  policyId: string;
  passed: boolean;
  summary: string;
  evidenceRefs: string[];
}

export interface InferenceStrategyReceipt {
  receiptId: string;
  receiptType: "strategy.proposal" | "strategy.validation" | "strategy.commit" | "strategy.rollback";
  status: "proposed" | "accepted" | "blocked" | "rolled-back";
  createdAt: string;
  strategyRunId: string;
  recommendedStrategyId: string | null;
  policyChecks: InferenceStrategyPolicyCheck[];
  evidenceRefs: string[];
}

export interface InferenceRouteChange {
  status: "not-requested" | "blocked" | "accepted" | "rolled-back";
  routePath: string;
  previousRoutePath: string | null;
  recommendedStrategyId: string | null;
  liveResourceMutated: boolean;
  resourceManifest: EnforceResourceManifestRef | null;
  reason: string;
}

export interface InferenceStrategyRun {
  schemaVersion: "2026-05-22";
  strategyRunId: string;
  workspace: string;
  agentId: string;
  createdAt: string;
  objective: InferenceObjective;
  recommendedStrategyId: string | null;
  confidence: number;
  tradeoffSummary: string;
  strategies: InferenceStrategyRecord[];
  routeChange: InferenceRouteChange;
  receipts: InferenceStrategyReceipt[];
  signaturePath: string | null;
}

export interface WriteInferenceStrategyRunResult {
  run: InferenceStrategyRun;
  path: string;
  signaturePath: string | null;
}

export interface InferenceStrategyRollbackResult {
  schemaVersion: "2026-05-22";
  strategyRunId: string;
  status: "rolled-back" | "blocked";
  routePath: string;
  receiptPath: string;
  reason: string;
}

function strategyRoot(workspace: string, agentId: string): string {
  return join(getAgentPaths(workspace, agentId).rootDir, "experiments", "inference-strategies");
}

function strategyRunDir(workspace: string, agentId: string, strategyRunId: string): string {
  return join(strategyRoot(workspace, agentId), strategyRunId);
}

function strategyRunPath(workspace: string, agentId: string, strategyRunId: string): string {
  return join(strategyRunDir(workspace, agentId, strategyRunId), "strategy-run.json");
}

function routePath(workspace: string, agentId: string): string {
  return join(getAgentPaths(workspace, agentId).rootDir, "model-routes.json");
}

function previousRoutePath(workspace: string, agentId: string, strategyRunId: string): string {
  return join(strategyRunDir(workspace, agentId, strategyRunId), "previous-model-routes.json");
}

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function normalize(value: number, max: number): number {
  if (max <= 0) return 0;
  return value / max;
}

function objectiveWeights(objective: InferenceObjective): { score: number; confidence: number; cost: number; latency: number; risk: number } {
  switch (objective) {
    case "quality": return { score: 60, confidence: 20, cost: 5, latency: 5, risk: 10 };
    case "cost": return { score: 30, confidence: 15, cost: 35, latency: 5, risk: 15 };
    case "latency": return { score: 30, confidence: 15, cost: 10, latency: 30, risk: 15 };
    case "safety": return { score: 30, confidence: 20, cost: 5, latency: 5, risk: 40 };
    case "balanced":
    default: return { score: 45, confidence: 20, cost: 15, latency: 10, risk: 25 };
  }
}

function rankStrategies(strategies: z.output<typeof inferenceStrategyInputSchema>[], objective: InferenceObjective): InferenceStrategyRecord[] {
  const maxCost = Math.max(...strategies.map((strategy) => strategy.metrics.costUsd), 0);
  const maxLatency = Math.max(...strategies.map((strategy) => strategy.metrics.latencyMs), 0);
  const weights = objectiveWeights(objective);
  const maxScore = Math.max(...strategies.map((strategy) => strategy.metrics.score), 0);
  const minCost = Math.min(...strategies.map((strategy) => strategy.metrics.costUsd));
  const minLatency = Math.min(...strategies.map((strategy) => strategy.metrics.latencyMs));
  const minRisk = Math.min(...strategies.map((strategy) => strategy.metrics.risk));
  return strategies
    .map((strategy) => ({
      ...strategy,
      rank: 0,
      weightedScore: round(
        strategy.metrics.score * weights.score
        + strategy.metrics.confidence * weights.confidence
        - normalize(strategy.metrics.costUsd, maxCost) * weights.cost
        - normalize(strategy.metrics.latencyMs, maxLatency) * weights.latency
        - strategy.metrics.risk * weights.risk
      ),
      tradeoffs: {
        scoreDelta: round(strategy.metrics.score - maxScore),
        costDeltaUsd: round(strategy.metrics.costUsd - minCost),
        latencyDeltaMs: round(strategy.metrics.latencyMs - minLatency),
        riskDelta: round(strategy.metrics.risk - minRisk)
      }
    }))
    .sort((a, b) => b.weightedScore - a.weightedScore || b.metrics.confidence - a.metrics.confidence)
    .map((strategy, index) => ({ ...strategy, rank: index + 1 }));
}

function receipt(input: {
  type: InferenceStrategyReceipt["receiptType"];
  status: InferenceStrategyReceipt["status"];
  strategyRunId: string;
  recommendedStrategyId: string | null;
  checks?: InferenceStrategyPolicyCheck[];
  evidenceRefs?: string[];
}): InferenceStrategyReceipt {
  return {
    receiptId: `${input.type}-${input.strategyRunId}`,
    receiptType: input.type,
    status: input.status,
    createdAt: new Date().toISOString(),
    strategyRunId: input.strategyRunId,
    recommendedStrategyId: input.recommendedStrategyId,
    policyChecks: input.checks ?? [],
    evidenceRefs: input.evidenceRefs ?? []
  };
}

function validationChecks(input: {
  strategies: InferenceStrategyRecord[];
  recommended: InferenceStrategyRecord;
  applyRoute: boolean;
  policyApproval: boolean;
  maxRisk: number;
}): InferenceStrategyPolicyCheck[] {
  return [
    {
      policyId: "strategy-count",
      passed: input.strategies.length >= 2,
      summary: input.strategies.length >= 2 ? "At least two inference strategies were compared." : "Compare at least two strategies.",
      evidenceRefs: input.strategies.map((strategy) => strategy.strategyId)
    },
    {
      policyId: "recommended-evidence-present",
      passed: input.recommended.evidenceRefs.length > 0,
      summary: input.recommended.evidenceRefs.length > 0 ? "Recommended strategy has evidence references." : "Recommended strategy cannot be accepted without evidence.",
      evidenceRefs: input.recommended.evidenceRefs
    },
    {
      policyId: "risk-within-limit",
      passed: input.recommended.metrics.risk <= input.maxRisk,
      summary: input.recommended.metrics.risk <= input.maxRisk ? "Recommended strategy risk is within policy." : "Recommended strategy risk exceeds policy.",
      evidenceRefs: input.recommended.evidenceRefs
    },
    {
      policyId: "route-change-approved",
      passed: !input.applyRoute || input.policyApproval,
      summary: !input.applyRoute ? "No route change requested." : input.policyApproval ? "Route change has policy approval." : "Route change requires policy approval.",
      evidenceRefs: input.recommended.evidenceRefs
    }
  ];
}

function tradeoffSummary(recommended: InferenceStrategyRecord, alternatives: InferenceStrategyRecord[]): string {
  const bestScore = Math.max(...alternatives.map((strategy) => strategy.metrics.score));
  const cheapest = Math.min(...alternatives.map((strategy) => strategy.metrics.costUsd));
  const fastest = Math.min(...alternatives.map((strategy) => strategy.metrics.latencyMs));
  const safest = Math.min(...alternatives.map((strategy) => strategy.metrics.risk));
  return [
    `${recommended.strategyId} is recommended with score ${recommended.metrics.score.toFixed(2)} and confidence ${recommended.metrics.confidence.toFixed(2)}.`,
    `It is ${recommended.metrics.costUsd === cheapest ? "the lowest-cost option" : `$${recommended.tradeoffs.costDeltaUsd.toFixed(4)} above the lowest cost`}.`,
    `latency is ${recommended.metrics.latencyMs === fastest ? "the fastest measured option" : `${recommended.tradeoffs.latencyDeltaMs}ms above the fastest option`}.`,
    `risk is ${recommended.metrics.risk === safest ? "the lowest-risk option" : `${recommended.tradeoffs.riskDelta.toFixed(2)} above the lowest risk`}.`,
    `score tradeoff versus best score is ${round(recommended.metrics.score - bestScore).toFixed(2)}.`
  ].join(" ");
}

export function compareInferenceStrategies(input: {
  workspace: string;
  agentId?: string;
  strategies: InferenceStrategyInput[];
  objective?: InferenceObjective;
  applyRoute?: boolean;
  policyApproval?: boolean;
  maxRisk?: number;
}): WriteInferenceStrategyRunResult {
  const workspace = resolve(input.workspace);
  const agentId = normalizeAgentId(input.agentId ?? "default");
  const parsed = input.strategies.map((strategy) => inferenceStrategyInputSchema.parse(strategy));
  if (parsed.length < 2) {
    throw new Error("Compare at least two inference strategies.");
  }
  const objective = input.objective ?? "balanced";
  const ranked = rankStrategies(parsed, objective);
  const recommended = ranked[0]!;
  if (recommended.evidenceRefs.length === 0) {
    throw new Error("Recommended strategy requires at least one evidence reference.");
  }
  const seed = sha256Hex(canonicalize({ agentId, objective, strategies: parsed, ts: Date.now() }));
  const strategyRunId = `strategy-run-${seed.slice(0, 16)}`;
  const runPath = strategyRunPath(workspace, agentId, strategyRunId);
  const routeFile = routePath(workspace, agentId);
  const checks = validationChecks({
    strategies: ranked,
    recommended,
    applyRoute: Boolean(input.applyRoute),
    policyApproval: Boolean(input.policyApproval),
    maxRisk: input.maxRisk ?? 0.35
  });
  const validationAccepted = checks.every((check) => check.passed);
  const receipts = [
    receipt({
      type: "strategy.proposal",
      status: "proposed",
      strategyRunId,
      recommendedStrategyId: recommended.strategyId,
      evidenceRefs: ranked.flatMap((strategy) => strategy.evidenceRefs)
    }),
    receipt({
      type: "strategy.validation",
      status: validationAccepted ? "accepted" : "blocked",
      strategyRunId,
      recommendedStrategyId: recommended.strategyId,
      checks,
      evidenceRefs: checks.flatMap((check) => check.evidenceRefs)
    })
  ];

  let resourceManifest: EnforceResourceManifestRef | null = null;
  let routeChange: InferenceRouteChange = {
    status: input.applyRoute ? "blocked" : "not-requested",
    routePath: routeFile,
    previousRoutePath: null,
    recommendedStrategyId: recommended.strategyId,
    liveResourceMutated: false,
    resourceManifest: null,
    reason: input.applyRoute ? "Route change blocked by policy validation." : "No route change requested."
  };

  if (input.applyRoute && validationAccepted) {
    const previous = existsSync(routeFile) ? readFileSync(routeFile, "utf8") : null;
    const previousPath = previousRoutePath(workspace, agentId, strategyRunId);
    ensureDir(strategyRunDir(workspace, agentId, strategyRunId));
    if (previous !== null) {
      writeFileAtomic(previousPath, previous, 0o600);
    }
    const routeConfig = {
      schemaVersion: "2026-05-22",
      source: "inference-strategy-comparison",
      strategyRunId,
      activeStrategyId: recommended.strategyId,
      provider: recommended.provider,
      model: recommended.model,
      promptResourceVersion: recommended.promptResourceVersion,
      temperature: recommended.temperature,
      settings: recommended.settings,
      toolPolicy: recommended.toolPolicy,
      evidenceRefs: recommended.evidenceRefs,
      rollback: {
        previousRoutePath: previous === null ? null : previousPath
      }
    };
    writeFileAtomic(routeFile, `${JSON.stringify(routeConfig, null, 2)}\n`, 0o644);
    resourceManifest = enforceResourceManifestRef(writeEnforceResourceManifest({ workspace, agentId }));
    routeChange = {
      status: "accepted",
      routePath: routeFile,
      previousRoutePath: previous === null ? null : previousPath,
      recommendedStrategyId: recommended.strategyId,
      liveResourceMutated: true,
      resourceManifest,
      reason: "Route change accepted with policy approval and manifest evidence."
    };
    receipts.push(receipt({
      type: "strategy.commit",
      status: "accepted",
      strategyRunId,
      recommendedStrategyId: recommended.strategyId,
      checks,
      evidenceRefs: [resourceManifest.manifestId, ...recommended.evidenceRefs]
    }));
  } else if (input.applyRoute) {
    receipts.push(receipt({
      type: "strategy.commit",
      status: "blocked",
      strategyRunId,
      recommendedStrategyId: recommended.strategyId,
      checks,
      evidenceRefs: checks.flatMap((check) => check.evidenceRefs)
    }));
  }

  const run: InferenceStrategyRun = {
    schemaVersion: "2026-05-22",
    strategyRunId,
    workspace,
    agentId,
    createdAt: new Date().toISOString(),
    objective,
    recommendedStrategyId: recommended.strategyId,
    confidence: recommended.metrics.confidence,
    tradeoffSummary: tradeoffSummary(recommended, ranked),
    strategies: ranked,
    routeChange,
    receipts,
    signaturePath: null
  };
  ensureDir(strategyRunDir(workspace, agentId, strategyRunId));
  writeFileAtomic(runPath, `${JSON.stringify(run, null, 2)}\n`, 0o644);
  const signed = trySignArtifactFile({ workspace, path: runPath, artifactKind: "inference-strategy-run" });
  const signedRun = signed ? { ...run, signaturePath: signed.sigPath } : run;
  if (signed) {
    writeFileAtomic(runPath, `${JSON.stringify(signedRun, null, 2)}\n`, 0o644);
    trySignArtifactFile({ workspace, path: runPath, artifactKind: "inference-strategy-run" });
  }
  return { run: signedRun, path: runPath, signaturePath: signed?.sigPath ?? null };
}

export function listInferenceStrategyRuns(input: { workspace: string; agentId?: string; limit?: number }): InferenceStrategyRun[] {
  const agentId = normalizeAgentId(input.agentId ?? "default");
  const dir = strategyRoot(input.workspace, agentId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((entry) => strategyRunPath(input.workspace, agentId, entry))
    .filter((path) => existsSync(path))
    .map((path) => JSON.parse(readUtf8(path)) as InferenceStrategyRun)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, input.limit ?? Number.POSITIVE_INFINITY);
}

export function loadInferenceStrategyRun(input: { workspace: string; agentId?: string; selector: string }): InferenceStrategyRun {
  const agentId = normalizeAgentId(input.agentId ?? "default");
  if (input.selector !== "latest") {
    const directPath = strategyRunPath(input.workspace, agentId, input.selector);
    if (existsSync(directPath)) {
      return JSON.parse(readUtf8(directPath)) as InferenceStrategyRun;
    }
  }
  const found = listInferenceStrategyRuns({ workspace: input.workspace, agentId, limit: input.selector === "latest" ? 1 : undefined })
    .find((run) => input.selector === "latest" || run.strategyRunId === input.selector);
  if (!found) {
    throw new Error(`Inference strategy run not found: ${input.selector}`);
  }
  return found;
}

export function rollbackInferenceStrategyRun(input: { workspace: string; agentId?: string; selector: string }): InferenceStrategyRollbackResult {
  const workspace = resolve(input.workspace);
  const agentId = normalizeAgentId(input.agentId ?? "default");
  const run = loadInferenceStrategyRun({ workspace, agentId, selector: input.selector });
  const routeFile = run.routeChange.routePath;
  const receiptPath = join(strategyRunDir(workspace, agentId, run.strategyRunId), "rollback-receipt.json");
  if (run.routeChange.status !== "accepted" || !run.routeChange.liveResourceMutated) {
    const blocked: InferenceStrategyRollbackResult = {
      schemaVersion: "2026-05-22",
      strategyRunId: run.strategyRunId,
      status: "blocked",
      routePath: routeFile,
      receiptPath,
      reason: "No accepted live route change exists for this strategy run."
    };
    writeFileAtomic(receiptPath, `${JSON.stringify(blocked, null, 2)}\n`, 0o644);
    return blocked;
  }
  if (run.routeChange.previousRoutePath && existsSync(run.routeChange.previousRoutePath)) {
    writeFileAtomic(routeFile, readFileSync(run.routeChange.previousRoutePath, "utf8"), 0o644);
  } else if (existsSync(routeFile)) {
    rmSync(routeFile, { force: true });
  }
  writeEnforceResourceManifest({ workspace, agentId });
  const rolledBack: InferenceStrategyRollbackResult = {
    schemaVersion: "2026-05-22",
    strategyRunId: run.strategyRunId,
    status: "rolled-back",
    routePath: routeFile,
    receiptPath,
    reason: "Route restored to the prior manifest-covered state."
  };
  writeFileAtomic(receiptPath, `${JSON.stringify(rolledBack, null, 2)}\n`, 0o644);
  return rolledBack;
}
