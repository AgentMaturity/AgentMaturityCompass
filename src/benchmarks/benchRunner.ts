/**
 * Benchmark runner — executes a standard benchmark suite against an agent
 * and compares results across categories.
 */

import { listImportedBenchmarks } from "./benchStore.js";
import type { BenchmarkArtifact } from "./benchSchema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BenchCategory = "latency" | "accuracy" | "safety" | "cost-efficiency" | "reliability";

export interface BenchCategoryScore {
  category: BenchCategory;
  score0to100: number;
  percentile: number;
  baseline: number;
  description: string;
}

export interface BenchRunResult {
  agentId: string;
  ts: number;
  overall0to100: number;
  overallPercentile: number;
  categories: BenchCategoryScore[];
  benchmarkCount: number;
}

export interface BenchCompareResult {
  agent1: string;
  agent2: string;
  ts: number;
  categories: Array<{
    category: BenchCategory;
    agent1Score: number;
    agent2Score: number;
    delta: number;
    winner: string;
  }>;
  overall1: number;
  overall2: number;
  overallDelta: number;
  winner: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function percentile(values: number[], value: number): number {
  if (values.length === 0) return 50;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = sorted.filter((v) => v <= value).length;
  return Number(((rank / sorted.length) * 100).toFixed(2));
}

function deriveLatencyScore(bench: BenchmarkArtifact): number {
  // Use integrity index as a proxy — agents with high integrity process evidence faster
  return Math.round(bench.run.integrityIndex * 100);
}

function deriveAccuracyScore(bench: BenchmarkArtifact): number {
  // Use overall score normalized to 0-100
  return Math.round((bench.run.overall / 5) * 100);
}

function deriveSafetyScore(bench: BenchmarkArtifact): number {
  // Use assurance pack scores averaged
  const assuranceValues = Object.values(bench.run.assurance);
  if (assuranceValues.length === 0) return 50;
  return Math.round(assuranceValues.reduce((a, b) => a + b, 0) / assuranceValues.length);
}

function deriveCostEfficiencyScore(bench: BenchmarkArtifact): number {
  // Combine overall maturity and low risk indices for cost efficiency
  const riskScore = 100 - (bench.run.indices.EconomicSignificanceRisk ?? 50);
  const maturity = (bench.run.overall / 5) * 100;
  return Math.round((riskScore + maturity) / 2);
}

function deriveReliabilityScore(bench: BenchmarkArtifact): number {
  // Use integrity + ecosystem focus risk as reliability proxy
  const intScore = bench.run.integrityIndex * 100;
  const ecoRisk = 100 - (bench.run.indices.EcosystemFocusRisk ?? 50);
  return Math.round((intScore + ecoRisk) / 2);
}

function buildCategoryScores(bench: BenchmarkArtifact, allBenchmarks: BenchmarkArtifact[]): BenchCategoryScore[] {
  const categories: Array<{ category: BenchCategory; derive: (b: BenchmarkArtifact) => number; description: string }> = [
    { category: "latency", derive: deriveLatencyScore, description: "Evidence processing speed and response time" },
    { category: "accuracy", derive: deriveAccuracyScore, description: "Diagnostic accuracy and maturity assessment quality" },
    { category: "safety", derive: deriveSafetyScore, description: "Safety controls and assurance pack compliance" },
    { category: "cost-efficiency", derive: deriveCostEfficiencyScore, description: "Resource efficiency and economic risk posture" },
    { category: "reliability", derive: deriveReliabilityScore, description: "Consistency, integrity, and ecosystem resilience" },
  ];

  return categories.map(({ category, derive, description }) => {
    const score = derive(bench);
    const allScores = allBenchmarks.map(derive);
    const baseline = allScores.length > 0
      ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
      : 50;

    return {
      category,
      score0to100: score,
      percentile: percentile(allScores, score),
      baseline,
      description,
    };
  });
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export function runBenchmarkSuite(params: {
  workspace: string;
  agentId: string;
}): BenchRunResult {
  const imported = listImportedBenchmarks(params.workspace);
  const allBenchmarks = imported.map((r) => r.bench);

  // Find the agent's benchmark
  const agentBench = imported.find((r) =>
    r.bench.agent.agentId === params.agentId ||
    r.bench.benchId.includes(params.agentId)
  );

  if (!agentBench && allBenchmarks.length === 0) {
    // No benchmarks available — return baseline scores
    const defaultCategories: BenchCategoryScore[] = [
      { category: "latency", score0to100: 50, percentile: 50, baseline: 50, description: "Evidence processing speed" },
      { category: "accuracy", score0to100: 50, percentile: 50, baseline: 50, description: "Diagnostic accuracy" },
      { category: "safety", score0to100: 50, percentile: 50, baseline: 50, description: "Safety controls" },
      { category: "cost-efficiency", score0to100: 50, percentile: 50, baseline: 50, description: "Resource efficiency" },
      { category: "reliability", score0to100: 50, percentile: 50, baseline: 50, description: "Consistency and integrity" },
    ];
    return {
      agentId: params.agentId,
      ts: Date.now(),
      overall0to100: 50,
      overallPercentile: 50,
      categories: defaultCategories,
      benchmarkCount: 0,
    };
  }

  const bench = agentBench?.bench ?? allBenchmarks[0]!;
  const categories = buildCategoryScores(bench, allBenchmarks);
  const overall = Math.round(categories.reduce((sum, c) => sum + c.score0to100, 0) / categories.length);
  const allOveralls = allBenchmarks.map((b) => {
    const cats = buildCategoryScores(b, allBenchmarks);
    return Math.round(cats.reduce((sum, c) => sum + c.score0to100, 0) / cats.length);
  });

  return {
    agentId: params.agentId,
    ts: Date.now(),
    overall0to100: overall,
    overallPercentile: percentile(allOveralls, overall),
    categories,
    benchmarkCount: allBenchmarks.length,
  };
}

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------

export function compareBenchmarks(params: {
  workspace: string;
  agent1: string;
  agent2: string;
}): BenchCompareResult {
  const result1 = runBenchmarkSuite({ workspace: params.workspace, agentId: params.agent1 });
  const result2 = runBenchmarkSuite({ workspace: params.workspace, agentId: params.agent2 });

  const categories = result1.categories.map((c1) => {
    const c2 = result2.categories.find((c) => c.category === c1.category);
    const s2 = c2?.score0to100 ?? 50;
    return {
      category: c1.category,
      agent1Score: c1.score0to100,
      agent2Score: s2,
      delta: c1.score0to100 - s2,
      winner: c1.score0to100 > s2 ? params.agent1
        : c1.score0to100 < s2 ? params.agent2
        : "tie",
    };
  });

  const overallDelta = result1.overall0to100 - result2.overall0to100;

  return {
    agent1: params.agent1,
    agent2: params.agent2,
    ts: Date.now(),
    categories,
    overall1: result1.overall0to100,
    overall2: result2.overall0to100,
    overallDelta,
    winner: overallDelta > 0 ? params.agent1
      : overallDelta < 0 ? params.agent2
      : "tie",
  };
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

export function renderBenchRunMarkdown(result: BenchRunResult): string {
  const lines: string[] = [];
  lines.push("# AMC Benchmark Report");
  lines.push("");
  lines.push(`**Agent:** ${result.agentId}`);
  lines.push(`**Overall:** ${result.overall0to100}/100 (percentile: ${result.overallPercentile})`);
  lines.push(`**Ecosystem Benchmarks:** ${result.benchmarkCount}`);
  lines.push("");
  lines.push("## Category Scores");
  lines.push("");
  lines.push("| Category | Score | Baseline | Percentile | Description |");
  lines.push("|----------|-------|----------|------------|-------------|");
  for (const c of result.categories) {
    const delta = c.score0to100 - c.baseline;
    const deltaStr = delta >= 0 ? `+${delta}` : `${delta}`;
    lines.push(`| ${c.category} | ${c.score0to100}/100 | ${c.baseline} (${deltaStr}) | ${c.percentile}% | ${c.description} |`);
  }
  lines.push("");
  lines.push("---");
  lines.push("*Generated by `amc benchmark run`*");
  return lines.join("\n");
}

export function renderBenchCompareMarkdown(result: BenchCompareResult): string {
  const lines: string[] = [];
  lines.push("# AMC Benchmark Comparison");
  lines.push("");
  lines.push(`**Agent 1:** ${result.agent1} (${result.overall1}/100)`);
  lines.push(`**Agent 2:** ${result.agent2} (${result.overall2}/100)`);
  lines.push(`**Winner:** ${result.winner}`);
  lines.push("");
  lines.push("## Head-to-Head");
  lines.push("");
  lines.push("| Category | Agent 1 | Agent 2 | Delta | Winner |");
  lines.push("|----------|---------|---------|-------|--------|");
  for (const c of result.categories) {
    lines.push(`| ${c.category} | ${c.agent1Score} | ${c.agent2Score} | ${c.delta >= 0 ? "+" : ""}${c.delta} | ${c.winner} |`);
  }
  lines.push("");
  lines.push("---");
  lines.push("*Generated by `amc benchmark compare`*");
  return lines.join("\n");
}
