/**
 * Simplicity Scoring — AMC gap closure
 * Source: Community research ("orchestration is a cope"), Reddit ("deleted 400 lines of LangChain")
 * 
 * Measures whether agent architecture is appropriately simple for its risk level.
 * Over-engineering detection: governance overhead vs actual risk level.
 */

export interface SimplicityProfile {
  agentId: string;
  frameworkLayerCount: number;       // How many abstraction layers
  dependencyCount: number;           // External dependencies
  linesOfGlue: number;              // Glue code vs actual logic ratio
  governanceOverheadRatio: number;   // governance complexity / risk level (>2 = over-engineered)
  tokenOverheadPercent: number;      // % of tokens spent on framework overhead vs actual work
  classification: "lean" | "appropriate" | "heavy" | "over-engineered";
  score: number;                     // 0-100 (higher = simpler/better)
  recommendations: string[];
}

export function assessSimplicity(input: {
  frameworkLayerCount?: number;
  dependencyCount?: number;
  linesOfGlue?: number;
  riskTier?: "low" | "medium" | "high" | "critical";
  governanceComplexity?: number;  // 1-10
  tokenOverheadPercent?: number;
}): SimplicityProfile {
  const layers = input.frameworkLayerCount ?? 1;
  const deps = input.dependencyCount ?? 0;
  const glue = input.linesOfGlue ?? 0;
  const riskTier = input.riskTier ?? "medium";
  const govComplexity = input.governanceComplexity ?? 3;
  const tokenOverhead = input.tokenOverheadPercent ?? 5;

  const riskWeight: Record<string, number> = {
    low: 1, medium: 2, high: 3, critical: 4,
  };
  const risk = riskWeight[riskTier] ?? 2;

  const governanceOverheadRatio = govComplexity / risk;

  // Score: penalize excessive layers, deps, and overhead
  let score = 100;
  score -= Math.max(0, (layers - 2) * 10);       // >2 layers starts costing
  score -= Math.max(0, (deps - 10) * 2);          // >10 deps starts costing
  score -= Math.max(0, tokenOverhead - 10) * 2;   // >10% overhead costs
  if (governanceOverheadRatio > 2) score -= (governanceOverheadRatio - 2) * 15;
  score = Math.max(0, Math.min(100, score));

  let classification: SimplicityProfile["classification"];
  if (score >= 80) classification = "lean";
  else if (score >= 60) classification = "appropriate";
  else if (score >= 40) classification = "heavy";
  else classification = "over-engineered";

  const recommendations: string[] = [];
  if (layers > 3) recommendations.push(`Reduce abstraction layers from ${layers} to ≤3 — each layer adds latency and failure modes`);
  if (deps > 15) recommendations.push(`Audit ${deps} dependencies — can any be replaced with stdlib/builtins?`);
  if (tokenOverhead > 15) recommendations.push(`${tokenOverhead}% token overhead on framework — consider direct API calls for simple tasks`);
  if (governanceOverheadRatio > 2.5) recommendations.push(`Governance complexity (${govComplexity}/10) exceeds risk level (${riskTier}) — simplify controls`);
  if (recommendations.length === 0) recommendations.push("Architecture complexity is appropriate for risk level");

  return {
    agentId: "",
    frameworkLayerCount: layers,
    dependencyCount: deps,
    linesOfGlue: glue,
    governanceOverheadRatio,
    tokenOverheadPercent: tokenOverhead,
    classification,
    score,
    recommendations,
  };
}
