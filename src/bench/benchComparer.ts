export { createBenchComparisonAsync } from "./benchComparisonAsync.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { sha256Hex } from "../utils/hash.js";
import { resolveAgentId } from "../fleet/paths.js";
import { collectBenchData } from "./benchCollector.js";
import { loadBenchPolicy, saveBenchComparison } from "./benchPolicyStore.js";
import { benchArtifactSchema, benchComparisonSchema, type BenchArtifact, type BenchComparison } from "./benchSchema.js";
import { flattenBenchMetrics, kMedoidsPeerGroup, percentileTable } from "./benchPercentiles.js";
import { listImportedBenchArtifacts } from "./benchRegistryClient.js";

function localBenchFromScope(params: {
  workspace: string;
  scope: "workspace" | "node" | "agent";
  id: string;
}): BenchArtifact {
  const policy = loadBenchPolicy(params.workspace);
  const scopeType = params.scope === "workspace" ? "WORKSPACE" : params.scope === "node" ? "NODE" : "AGENT";
  const scopeId =
    scopeType === "AGENT"
      ? resolveAgentId(params.workspace, params.id || "default")
      : scopeType === "NODE"
        ? params.id
        : "workspace";
  const collected = collectBenchData({
    workspace: params.workspace,
    scopeType,
    scopeId,
    windowDays: 30,
    policy
  });
  return benchArtifactSchema.parse(collected.bench);
}

export function loadImportedBenchObjects(workspace: string): Array<{ bench: BenchArtifact; registryId: string }> {
  const imports = listImportedBenchArtifacts(workspace);
  const out: Array<{ bench: BenchArtifact; registryId: string }> = [];
  for (const row of imports) {
    const artifactPath = join(workspace, ".amc", "bench", "imports", "benches", row.benchId, row.version, "bench.amcbench");
    if (!pathExists(artifactPath)) {
      continue;
    }
    // Best-effort read of extracted bench.json is not guaranteed; fallback to parsing bundle not required for comparer.
    const extractedBenchPath = join(workspace, ".amc", "bench", "imports", "benches", row.benchId, row.version, "bench.json");
    if (!pathExists(extractedBenchPath)) {
      continue;
    }
    try {
      const bench = benchArtifactSchema.parse(JSON.parse(readUtf8(extractedBenchPath)) as unknown);
      out.push({
        bench,
        registryId: row.registryId
      });
    } catch {
      // skip malformed imports
    }
  }
  return out;
}

function riskToScore(risk: number): number {
  return 100 - Math.max(0, Math.min(100, risk));
}

function compositeScores(params: {
  local: BenchArtifact;
  policyWeights: ReturnType<typeof loadBenchPolicy>["benchPolicy"]["weights"];
}): {
  ecosystemAlignmentScore: number;
  riskAssuranceScore: number;
  digitalDualityReadiness: number;
} {
  const w = params.policyWeights;
  const ecosystemAlignmentScore = Number(
    (
      (riskToScore(params.local.metrics.strategyFailureRisks.ecosystemFocusRisk) / 100) * w.ecosystemAlignment.ecosystemFocusRisk * 100 +
      (params.local.metrics.valueDimensions.emotionalValue / 100) * w.ecosystemAlignment.emotionalValue * 100 +
      (params.local.metrics.valueDimensions.brandValue / 100) * w.ecosystemAlignment.brandValue * 100
    ).toFixed(6)
  );
  const riskAssuranceScore = Number(
    (
      (riskToScore(params.local.metrics.strategyFailureRisks.riskAssuranceRisk) / 100) * w.riskAssurance.riskAssuranceRisk * 100 +
      params.local.evidence.integrityIndex * w.riskAssurance.integrityIndex * 100 +
      params.local.evidence.correlationRatio * w.riskAssurance.correlationRatio * 100
    ).toFixed(6)
  );
  const digitalDualityReadiness = Number(
    (
      (riskToScore(params.local.metrics.strategyFailureRisks.digitalDualityRisk) / 100) * w.digitalDuality.digitalDualityRisk * 100 +
      (params.local.metrics.maturity.fiveLayers.strategicOps / 5) * w.digitalDuality.toolGovernanceMaturity * 100
    ).toFixed(6)
  );
  return {
    ecosystemAlignmentScore,
    riskAssuranceScore,
    digitalDualityReadiness
  };
}

function warningSummary(local: BenchArtifact, population: BenchArtifact[]): string[] {
  const warnings: string[] = [];
  if (local.evidence.trustLabel === "LOW") {
    warnings.push("LOCAL_TRUST_LOW_INFORMATIONAL_ONLY");
  }
  if (population.length === 0) {
    warnings.push("NO_IMPORTED_POPULATION");
    return warnings;
  }
  const low = population.filter((row) => row.evidence.trustLabel === "LOW").length;
  if (low / Math.max(1, population.length) > 0.5) {
    warnings.push("POPULATION_LOW_TRUST_MAJOR_SHARE");
  }
  if (population.some((row) => row.proofBindings.includedEventProofIds.length === 0)) {
    warnings.push("POPULATION_WITHOUT_PROOFS_PRESENT");
  }
  return warnings;
}

/** Existing diagnostic comparison recipe, with actual selected values supplied by each producer. */
export function benchComparisonWithInputs(params: {against?:"imported"|`registry:${string}`}, local:BenchArtifact, loaded:ReturnType<typeof loadImportedBenchObjects>, policy:ReturnType<typeof loadBenchPolicy>) {
  const populationRows =
    params.against && params.against.startsWith("registry:")
      ? loaded.filter((row) => row.registryId === params.against!.slice("registry:".length))
      : loaded;
  const population = populationRows.map((row) => row.bench);
  const localFlat = flattenBenchMetrics(local);
  const populationFlat = population.map((row) => flattenBenchMetrics(row));
  const percentiles = percentileTable(localFlat, populationFlat.length > 0 ? populationFlat : [localFlat]);
  const peer = kMedoidsPeerGroup(localFlat, populationFlat.length > 0 ? populationFlat : [localFlat]);
  const comparison = benchComparisonSchema.parse({
    v: 1,
    generatedTs: Date.now(),
    scope: {
      type: local.scope.type,
      idHash: local.scope.idHash
    },
    population: {
      count: population.length,
      registryIds: [...new Set(populationRows.map((row) => row.registryId))].sort((a, b) => a.localeCompare(b)),
      trustSummary: {
        low: population.filter((row) => row.evidence.trustLabel === "LOW").length,
        medium: population.filter((row) => row.evidence.trustLabel === "MEDIUM").length,
        high: population.filter((row) => row.evidence.trustLabel === "HIGH").length
      }
    },
    percentiles,
    composites: compositeScores({
      local,
      policyWeights: policy.benchPolicy.weights
    }),
    peerGroup: peer,
    warnings: warningSummary(local, population)
  });
  return comparison;
}

export function createBenchComparison(params: {
  workspace: string;
  scope: "workspace" | "node" | "agent";
  id: string;
  against?: "imported" | `registry:${string}`;
}): {
  comparison: BenchComparison;
  path: string;
  sigPath: string;
  transparencyHash: string;
} {
  const local = localBenchFromScope(params);
  const comparison = benchComparisonWithInputs(params,local,loadImportedBenchObjects(params.workspace),loadBenchPolicy(params.workspace));
  const saved = saveBenchComparison(params.workspace, comparison);
  const transparency = appendTransparencyEntry({
    workspace: params.workspace,
    type: "BENCH_COMPARISON_CREATED",
    agentId: params.scope === "agent" ? resolveAgentId(params.workspace, params.id) : "workspace",
    artifact: {
      kind: "amcbench",
      sha256: sha256Hex(readFileSync(saved.path)),
      id: `comparison:${comparison.scope.type}:${comparison.scope.idHash}`
    }
  });
  return {
    comparison,
    path: saved.path,
    sigPath: saved.sigPath,
    transparencyHash: transparency.hash
  };
}
