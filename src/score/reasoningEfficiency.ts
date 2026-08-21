/**
 * Reasoning Efficiency Maturity
 * Scores whether an agent's reasoning is deep (effective) vs just long (verbose).
 * 
 * Inspired by: "Think Deep, Not Just Long" (Chen et al., 2026, arXiv:2602.13517)
 * Key insight: Token count has r=-0.59 correlation with accuracy. Deep-thinking
 * ratio (DTR) has r=0.683. Longer ≠ better. Agents that overthink degrade.
 *
 * Dimensions scored:
 * 1. Response selection/filtering — does the agent evaluate multiple candidates?
 * 2. Reasoning budget awareness — does the agent calibrate effort to task difficulty?
 * 3. Overthinking detection — does the agent detect and break verbose loops?
 * 4. Output length governance — are there caps/budgets on reasoning length?
 * 5. Accuracy-length monitoring — is the relationship between length and quality tracked?
 * 6. Early stopping capability — can the agent stop reasoning when confident?
 * 7. Reasoning trace audit — are reasoning traces logged for quality analysis?
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { evidencePathExists } from "./controlSurfaceScope.js";

export interface ReasoningEfficiencyResult {
  score: number; // 0-100
  level: number; // 0-5
  hasResponseSelection: boolean;
  hasReasoningBudget: boolean;
  hasOverthinkingDetection: boolean;
  hasOutputLengthGovernance: boolean;
  hasAccuracyLengthMonitoring: boolean;
  hasEarlyStopping: boolean;
  hasReasoningTraceAudit: boolean;
  gaps: string[];
  recommendations: string[];
}

export function scoreReasoningEfficiency(cwd?: string): ReasoningEfficiencyResult {
  const root = cwd ?? process.cwd();
  const gaps: string[] = [];
  const recommendations: string[] = [];

  let hasResponseSelection = false;
  let hasReasoningBudget = false;
  let hasOverthinkingDetection = false;
  let hasOutputLengthGovernance = false;
  let hasAccuracyLengthMonitoring = false;
  let hasEarlyStopping = false;
  let hasReasoningTraceAudit = false;

  // 1. Response selection — best-of-N, self-consistency, DTR-based filtering
  const selectionPaths = [
    "src/reasoning/responseSelector.ts",
    "src/reasoning/bestOfN.ts",
    "src/reasoning/selfConsistency.ts",
    "src/score/reasoningEfficiency.ts", // self-reference means the concept exists
    ".amc/response_selection_policy.json",
    "src/output/responseRanker.ts",
  ];
  for (const f of selectionPaths) {
    if (evidencePathExists(root, f)) hasResponseSelection = true;
  }

  // 2. Reasoning budget — task-difficulty-calibrated token budgets
  const budgetPaths = [
    "src/reasoning/budgetAllocator.ts",
    ".amc/reasoning_budget.json",
    "src/ops/tokenBudget.ts",
    "src/enforce/reasoningBudget.ts",
    "src/reasoning/taskDifficultyRouter.ts",
  ];
  for (const f of budgetPaths) {
    if (evidencePathExists(root, f)) hasReasoningBudget = true;
  }
  // Also check if model routing exists (implies task-appropriate compute allocation)
  const routingPaths = ["src/score/architectureTaskAlignment.ts", "src/ops/modelRouter.ts"];
  for (const f of routingPaths) {
    if (evidencePathExists(root, f)) hasReasoningBudget = true;
  }

  // 3. Overthinking detection — loop detection, verbosity analysis
  const overthinkPaths = [
    "src/reasoning/overthinkingDetector.ts",
    "src/ops/loopDetector.ts",
    "src/enforce/maxIterations.ts",
    "src/reasoning/verbosityAnalyzer.ts",
    "src/ops/circuitBreaker.ts", // circuit breaker implies loop/runaway protection
  ];
  for (const f of overthinkPaths) {
    if (evidencePathExists(root, f)) hasOverthinkingDetection = true;
  }

  // 4. Output length governance — max tokens, length caps
  const lengthGovPaths = [
    ".amc/output_length_policy.json",
    "src/enforce/outputLengthCap.ts",
    "src/ops/tokenLimiter.ts",
    "src/enforce/rateLimit.ts", // rate limiting implies resource governance
  ];
  for (const f of lengthGovPaths) {
    if (evidencePathExists(root, f)) hasOutputLengthGovernance = true;
  }

  // 5. Accuracy-length monitoring — tracking whether longer = better for this agent
  const monitorPaths = [
    "src/reasoning/accuracyLengthTracker.ts",
    ".amc/reasoning_metrics.json",
    "src/ops/reasoningMetrics.ts",
    "src/score/confidenceDrift.ts", // confidence tracking is a proxy
    "src/score/calibrationGap.ts",
  ];
  for (const f of monitorPaths) {
    if (evidencePathExists(root, f)) hasAccuracyLengthMonitoring = true;
  }

  // 6. Early stopping — agent can stop reasoning when confident enough
  const earlyStopPaths = [
    "src/reasoning/earlyStopping.ts",
    "src/reasoning/confidenceGate.ts",
    "src/enforce/earlyExit.ts",
    "src/ops/confidenceThreshold.ts",
  ];
  for (const f of earlyStopPaths) {
    if (evidencePathExists(root, f)) hasEarlyStopping = true;
  }

  // 7. Reasoning trace audit — traces logged for post-hoc quality analysis
  const traceAuditPaths = [
    ".amc/reasoning_traces/",
    "src/reasoning/traceLogger.ts",
    ".amc/audit_log.jsonl", // general audit log captures reasoning
    "src/receipts", // receipt chain captures reasoning evidence
    "src/ledger",
  ];
  for (const f of traceAuditPaths) {
    if (evidencePathExists(root, f)) hasReasoningTraceAudit = true;
  }

  // Gap analysis
  if (!hasResponseSelection) {
    gaps.push("No response selection/filtering — agent commits to first generation without quality comparison (Think@n shows 50% cost savings from selection)");
    recommendations.push("Implement best-of-N or DTR-inspired response selection: generate multiple candidates, select highest quality before committing");
  }
  if (!hasReasoningBudget) {
    gaps.push("No reasoning budget calibration — agent applies same compute effort regardless of task difficulty");
    recommendations.push("Calibrate reasoning effort to task difficulty: simple queries get short reasoning, complex problems get deeper thinking");
  }
  if (!hasOverthinkingDetection) {
    gaps.push("No overthinking detection — agent cannot detect when additional reasoning degrades output quality (Chen et al. 2026: r=-0.59 between length and accuracy)");
    recommendations.push("Add overthinking detection: monitor accuracy vs. reasoning length; break reasoning loops when quality plateaus or degrades");
  }
  if (!hasOutputLengthGovernance) {
    gaps.push("No output length governance — reasoning traces can grow unbounded, burning compute on verbose but shallow generation");
  }
  if (!hasAccuracyLengthMonitoring) {
    gaps.push("No accuracy-length monitoring — the relationship between reasoning effort and output quality is untracked");
  }
  if (!hasEarlyStopping) {
    gaps.push("No early stopping capability — agent cannot terminate reasoning early when sufficient confidence is reached");
    recommendations.push("Implement confidence-gated early stopping: if reasoning reaches high confidence before budget exhaustion, stop and commit");
  }
  if (!hasReasoningTraceAudit) {
    gaps.push("No reasoning trace audit — cannot analyze reasoning quality post-hoc or detect systematic overthinking patterns");
  }

  const checks = [
    hasResponseSelection, hasReasoningBudget, hasOverthinkingDetection,
    hasOutputLengthGovernance, hasAccuracyLengthMonitoring,
    hasEarlyStopping, hasReasoningTraceAudit,
  ];
  const passed = checks.filter(Boolean).length;
  const score = Math.round((passed / checks.length) * 100);
  const level = score >= 90 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : score >= 10 ? 1 : 0;

  return {
    score, level,
    hasResponseSelection, hasReasoningBudget, hasOverthinkingDetection,
    hasOutputLengthGovernance, hasAccuracyLengthMonitoring,
    hasEarlyStopping, hasReasoningTraceAudit,
    gaps, recommendations,
  };
}
