/**
 * Architecture-task alignment metrics.
 *
 * Evaluates whether architecture complexity is proportional to task complexity,
 * and whether pipeline controls prevent error compounding.
 */

export type TaskRiskTier = "low" | "med" | "medium" | "high" | "critical";

export interface TaskComplexityProfile {
  taskId?: string;
  complexity: number; // expected range: 1..10
  stepCount: number;
  integrationCount: number;
  riskTier?: TaskRiskTier;
  requiresDeterminism?: boolean;
  requiresHumanApproval?: boolean;
  parallelismRequired?: boolean;
}

export interface ArchitectureProfile {
  architectureId?: string;
  pattern?: "workflow" | "single-agent" | "supervised-agent" | "multi-agent" | "pipeline" | "event-driven";
  layerCount: number;
  agentCount: number;
  orchestrationDepth: number;
  toolingSurface: number;
  hasHumanCheckpoint: boolean;
  validationCoverage: number; // 0..1
  retryCoverage: number; // 0..1
  fallbackCoverage: number; // 0..1
  circuitBreakerCoverage: number; // 0..1
  observabilityCoverage: number; // 0..1
  criticalPathRedundancy: number; // average alternate paths on critical stages
  singlePointOfFailureCount: number;
}

export interface PipelineStageProfile {
  stageId: string;
  errorRate: number; // 0..1
  propagationFactor?: number; // >=0 (1 = neutral, >1 amplifies)
  detectionCoverage?: number; // 0..1
  rollbackCoverage?: number; // 0..1
}

export interface ArchitectureTaskFitScore {
  score: number; // 0..100 (higher is better fit)
  classification: "under-architected" | "aligned" | "over-architected";
  requiredComplexity: number;
  providedComplexity: number;
  complexityGap: number;
  rationale: string[];
}

export interface ErrorAmplificationHotspot {
  stageId: string;
  stageRisk: number; // 0..1
  residualError: number; // 0..1
  propagationFactor: number;
}

export interface ErrorAmplificationResult {
  score: number; // 0..100 (higher means better containment)
  amplificationDetected: boolean;
  amplificationRatio: number;
  independentErrorRate: number;
  compoundedErrorRate: number;
  hotspotStages: ErrorAmplificationHotspot[];
  recommendations: string[];
}

export interface ComplexityTaxScore {
  score: number; // 0..100 (higher means lower complexity tax)
  taxRate: number; // 0..1
  classification: "minimal" | "manageable" | "heavy" | "punitive";
  drivers: string[];
  recommendations: string[];
}

export interface FailureModeRisk {
  id:
    | "cascade-failure"
    | "single-point-outage"
    | "silent-corruption"
    | "approval-gap"
    | "coordination-deadlock"
    | "retry-storm"
    | "latency-budget-breach";
  title: string;
  likelihood: number; // 0..1
  impact: number; // 0..1
  riskScore: number; // 0..100 (higher is worse)
  whyLikely: string;
  mitigations: string[];
}

export interface FailureModeAnalysisResult {
  overallRiskScore: number; // 0..100 (higher is worse)
  topFailureModes: FailureModeRisk[];
  recommendations: string[];
}

export interface RedundancyScore {
  score: number; // 0..100
  level: "fragile" | "basic" | "resilient" | "fault-tolerant";
  singlePointsOfFailure: number;
  gaps: string[];
  recommendations: string[];
}

export interface ArchitectureTaskAlignmentInput {
  task: TaskComplexityProfile;
  architecture: ArchitectureProfile;
  pipelineStages?: PipelineStageProfile[];
}

export interface ArchitectureTaskAlignmentReport {
  fit: ArchitectureTaskFitScore;
  errorAmplification: ErrorAmplificationResult;
  complexityTax: ComplexityTaxScore;
  failureModes: FailureModeAnalysisResult;
  redundancy: RedundancyScore;
  overallScore: number; // 0..100
  summary: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function normalizeRate(value: number): number {
  return clamp(value, 0, 1);
}

function combineIndependentErrors(a: number, b: number): number {
  return 1 - (1 - a) * (1 - b);
}

function riskWeight(riskTier?: TaskRiskTier): number {
  switch (riskTier) {
    case "low":
      return 1;
    case "med":
    case "medium":
      return 2;
    case "high":
      return 3;
    case "critical":
      return 4;
    default:
      return 2;
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

export function scoreArchitectureTaskFit(
  task: TaskComplexityProfile,
  architecture: ArchitectureProfile
): ArchitectureTaskFitScore {
  const requiredComplexity = clamp(
    task.complexity * 0.55 +
      Math.min(Math.max(task.stepCount, 0), 20) * 0.12 +
      Math.min(Math.max(task.integrationCount, 0), 12) * 0.08 +
      riskWeight(task.riskTier) * 0.9 +
      (task.requiresDeterminism ? 0.45 : 0) +
      (task.requiresHumanApproval ? 0.45 : 0) +
      (task.parallelismRequired ? 0.35 : 0),
    1,
    10
  );

  const providedComplexity = clamp(
    Math.max(architecture.layerCount, 1) * 1.25 +
      Math.max(architecture.orchestrationDepth, 0) * 0.95 +
      Math.max(architecture.agentCount, 1) * 0.65 +
      Math.sqrt(Math.max(architecture.toolingSurface, 0)) * 0.5 +
      (architecture.hasHumanCheckpoint ? 0.35 : 0) +
      normalizeRate(architecture.validationCoverage) * 0.5,
    1,
    15
  );

  const complexityGap = round2(providedComplexity - requiredComplexity);
  let score = 100 - Math.abs(complexityGap) * 14;
  const risk = riskWeight(task.riskTier);
  const validationCoverage = normalizeRate(architecture.validationCoverage);

  if (risk >= 3 && !architecture.hasHumanCheckpoint) {
    score -= 12;
  }
  if (risk >= 3 && validationCoverage < 0.6) {
    score -= 10;
  }
  if (risk <= 2 && complexityGap > 2) {
    score -= 6;
  }

  score = clamp(score, 0, 100);

  let classification: ArchitectureTaskFitScore["classification"];
  if (complexityGap < -1.25) {
    classification = "under-architected";
  } else if (complexityGap > 1.5) {
    classification = "over-architected";
  } else {
    classification = "aligned";
  }

  const rationale: string[] = [];
  if (classification === "under-architected") {
    rationale.push(
      `Architecture complexity (${round2(providedComplexity)}) is below task demand (${round2(requiredComplexity)}).`
    );
    rationale.push("High-risk or multi-step paths likely lack sufficient containment.");
  } else if (classification === "over-architected") {
    rationale.push(
      `Architecture complexity (${round2(providedComplexity)}) materially exceeds task demand (${round2(requiredComplexity)}).`
    );
    rationale.push("Coordination and maintenance overhead is likely higher than task value requires.");
  } else {
    rationale.push(
      `Architecture complexity (${round2(providedComplexity)}) is close to task demand (${round2(requiredComplexity)}).`
    );
    rationale.push("Complexity appears proportional to expected risk and execution depth.");
  }
  if (risk >= 3 && !architecture.hasHumanCheckpoint) {
    rationale.push("High-risk task without a human checkpoint weakens governance fit.");
  }
  if (risk >= 3 && validationCoverage < 0.6) {
    rationale.push("Validation coverage is thin for high-risk operation.");
  }

  return {
    score: Math.round(score),
    classification,
    requiredComplexity: round2(requiredComplexity),
    providedComplexity: round2(providedComplexity),
    complexityGap,
    rationale
  };
}

export function detectErrorAmplification(stages: PipelineStageProfile[]): ErrorAmplificationResult {
  if (stages.length === 0) {
    return {
      score: 100,
      amplificationDetected: false,
      amplificationRatio: 1,
      independentErrorRate: 0,
      compoundedErrorRate: 0,
      hotspotStages: [],
      recommendations: ["No pipeline stages were provided; no compounding path was evaluated."]
    };
  }

  let propagatedResidual = 0;
  let independentResidual = 0;
  const hotspotStages: ErrorAmplificationHotspot[] = [];

  for (const stage of stages) {
    const baseError = normalizeRate(stage.errorRate);
    const propagation = Math.max(0, stage.propagationFactor ?? 1);
    const detection = normalizeRate(stage.detectionCoverage ?? 0);
    const rollback = normalizeRate(stage.rollbackCoverage ?? 0);

    const perStageIndependentResidual = baseError * (1 - detection) * (1 - rollback);
    independentResidual = combineIndependentErrors(independentResidual, perStageIndependentResidual);

    const propagatedError = clamp(propagatedResidual * propagation, 0, 1);
    const grossError = combineIndependentErrors(baseError, propagatedError);
    const residual = clamp(grossError * (1 - detection) * (1 - rollback), 0, 1);
    propagatedResidual = residual;

    const stageRisk = clamp(
      baseError * 0.35 +
        Math.max(0, propagation - 1) * 0.35 +
        (1 - detection) * 0.2 +
        (1 - rollback) * 0.1,
      0,
      1
    );

    if (stageRisk >= 0.5 || residual >= 0.1 || propagation >= 1.5) {
      hotspotStages.push({
        stageId: stage.stageId,
        stageRisk: round2(stageRisk),
        residualError: round2(residual),
        propagationFactor: round2(propagation)
      });
    }
  }

  const compoundedErrorRate = round2(propagatedResidual);
  const independentErrorRate = round2(independentResidual);
  const amplificationRatio =
    independentResidual <= 0.000001
      ? compoundedErrorRate > 0
        ? 2
        : 1
      : round2(compoundedErrorRate / independentResidual);

  const amplificationDetected =
    stages.length > 1 && amplificationRatio > 1.2 && compoundedErrorRate > 0.03;

  let score = 100 - Math.max(0, amplificationRatio - 1) * 55 - compoundedErrorRate * 220;
  score = clamp(score, 0, 100);

  const sortedHotspots = hotspotStages
    .slice()
    .sort((a, b) => b.stageRisk - a.stageRisk || b.residualError - a.residualError);

  const recommendations: string[] = [];
  if (amplificationDetected) {
    recommendations.push("Insert validation checkpoints between high-risk stages to block cascading errors.");
  }
  if (sortedHotspots.some((stage) => stage.propagationFactor > 1.5)) {
    recommendations.push("Reduce stage fan-out/fan-in amplification or isolate stage outputs behind schema gates.");
  }
  if (score < 60) {
    recommendations.push("Increase detectionCoverage and rollbackCoverage on later pipeline stages.");
  }
  if (recommendations.length === 0) {
    recommendations.push("Pipeline controls appear to contain error propagation under current assumptions.");
  }

  return {
    score: Math.round(score),
    amplificationDetected,
    amplificationRatio,
    independentErrorRate,
    compoundedErrorRate,
    hotspotStages: sortedHotspots,
    recommendations
  };
}

export function scoreComplexityTax(
  task: TaskComplexityProfile,
  architecture: ArchitectureProfile
): ComplexityTaxScore {
  const fit = scoreArchitectureTaskFit(task, architecture);
  const required = Math.max(1, fit.requiredComplexity);
  const overProvision = Math.max(0, fit.complexityGap);

  const coordinationTax = Math.max(0, architecture.agentCount - 1) * 0.06;
  const layerTax = Math.max(0, architecture.layerCount - 2) * 0.08;
  const orchestrationBudget = Math.ceil(Math.max(task.stepCount, 0) * 0.75);
  const orchestrationTax = Math.max(0, architecture.orchestrationDepth - orchestrationBudget) * 0.04;
  const integrationBudget = Math.max(0, task.integrationCount) + 2;
  const integrationTax = Math.max(0, architecture.toolingSurface - integrationBudget) * 0.015;
  const overProvisionTax = (overProvision / required) * 0.45;

  const taxRate = clamp(
    overProvisionTax + coordinationTax + layerTax + orchestrationTax + integrationTax,
    0,
    1
  );

  const score = Math.round((1 - taxRate) * 100);

  let classification: ComplexityTaxScore["classification"];
  if (taxRate <= 0.15) classification = "minimal";
  else if (taxRate <= 0.35) classification = "manageable";
  else if (taxRate <= 0.6) classification = "heavy";
  else classification = "punitive";

  const drivers: string[] = [];
  if (overProvisionTax > 0.1) {
    drivers.push(
      `Provided complexity exceeds required complexity by ${round2(overProvision)} points.`
    );
  }
  if (coordinationTax > 0.1) {
    drivers.push(`Coordination tax from ${architecture.agentCount} agents is high.`);
  }
  if (layerTax > 0.1) {
    drivers.push(`Layer tax from ${architecture.layerCount} abstraction layers is high.`);
  }
  if (orchestrationTax > 0.08) {
    drivers.push("Orchestration depth exceeds what task step-count requires.");
  }
  if (integrationTax > 0.08) {
    drivers.push("Tooling surface exceeds likely integration needs for this task.");
  }
  if (drivers.length === 0) {
    drivers.push("No major complexity-tax driver detected.");
  }

  const recommendations: string[] = [];
  if (classification === "punitive" || classification === "heavy") {
    recommendations.push("Collapse orchestration layers and reduce agent handoffs on the critical path.");
  }
  if (architecture.agentCount > 2 && task.stepCount <= 4) {
    recommendations.push("Consider a single-agent or supervised-agent path for lower-step tasks.");
  }
  if (architecture.toolingSurface > task.integrationCount + 4) {
    recommendations.push("Trim tool integrations that are not required by acceptance criteria.");
  }
  if (recommendations.length === 0) {
    recommendations.push("Architecture overhead is proportional to task demands.");
  }

  return {
    score,
    taxRate: round2(taxRate),
    classification,
    drivers,
    recommendations
  };
}

interface FailureModeBuilder {
  id: FailureModeRisk["id"];
  title: string;
  likelihood: number;
  impact: number;
  whyLikely: string;
  mitigations: string[];
}

function buildFailureMode(input: FailureModeBuilder): FailureModeRisk {
  const likelihood = round2(clamp(input.likelihood, 0, 1));
  const impact = round2(clamp(input.impact, 0, 1));
  return {
    id: input.id,
    title: input.title,
    likelihood,
    impact,
    riskScore: Math.round(likelihood * impact * 100),
    whyLikely: input.whyLikely,
    mitigations: input.mitigations
  };
}

export function analyzeFailureModes(input: {
  task: TaskComplexityProfile;
  architecture: ArchitectureProfile;
  errorAmplification?: ErrorAmplificationResult;
  complexityTax?: ComplexityTaxScore;
}): FailureModeAnalysisResult {
  const amplification = input.errorAmplification ?? detectErrorAmplification([]);
  const complexityTax =
    input.complexityTax ?? scoreComplexityTax(input.task, input.architecture);
  const risk = riskWeight(input.task.riskTier);
  const riskImpactBase = clamp(0.25 + risk * 0.18, 0, 1);
  const validation = normalizeRate(input.architecture.validationCoverage);
  const observability = normalizeRate(input.architecture.observabilityCoverage);
  const fallback = normalizeRate(input.architecture.fallbackCoverage);
  const retry = normalizeRate(input.architecture.retryCoverage);
  const breaker = normalizeRate(input.architecture.circuitBreakerCoverage);

  const modes: FailureModeRisk[] = [];

  const cascadeLikelihood = clamp(
    (input.architecture.orchestrationDepth / 8) * 0.35 +
      Math.max(0, amplification.amplificationRatio - 1) * 0.45 +
      (1 - validation) * 0.2,
    0,
    1
  );
  if (cascadeLikelihood >= 0.2) {
    modes.push(
      buildFailureMode({
        id: "cascade-failure",
        title: "Cascading pipeline failure",
        likelihood: cascadeLikelihood,
        impact: clamp(riskImpactBase + 0.2, 0, 1),
        whyLikely: "Deep orchestration and propagation pressure increase error carry-through risk.",
        mitigations: [
          "Insert validation and checkpoint barriers after high-risk transformation stages.",
          "Limit stage fan-out and enforce typed output contracts between stages."
        ]
      })
    );
  }

  const spofLikelihood = clamp(
    (Math.min(input.architecture.singlePointOfFailureCount, 5) / 5) * 0.6 +
      (1 - fallback) * 0.4,
    0,
    1
  );
  if (spofLikelihood >= 0.2) {
    modes.push(
      buildFailureMode({
        id: "single-point-outage",
        title: "Single-point dependency outage",
        likelihood: spofLikelihood,
        impact: clamp(riskImpactBase + 0.15, 0, 1),
        whyLikely: "Fallback coverage is low relative to identified single points of failure.",
        mitigations: [
          "Add active standby providers for critical dependencies and failover drills.",
          "Reduce SPOFs on the critical path before scaling autonomy."
        ]
      })
    );
  }

  const silentLikelihood = clamp(
    (1 - validation) * 0.55 + (1 - observability) * 0.3 + (1 - fallback) * 0.15,
    0,
    1
  );
  if (silentLikelihood >= 0.2) {
    modes.push(
      buildFailureMode({
        id: "silent-corruption",
        title: "Silent output corruption",
        likelihood: silentLikelihood,
        impact: clamp(riskImpactBase + 0.25, 0, 1),
        whyLikely: "Low validation and observability permit bad outputs to pass unnoticed.",
        mitigations: [
          "Enforce output schema validation with signed audit traces.",
          "Add confidence/evidence gates before execution and external side effects."
        ]
      })
    );
  }

  const approvalRequired = Boolean(input.task.requiresHumanApproval) || risk >= 3;
  const approvalLikelihood = approvalRequired
    ? clamp((input.architecture.hasHumanCheckpoint ? 0.1 : 0.7) + (1 - validation) * 0.2, 0, 1)
    : 0.1;
  if (approvalLikelihood >= 0.2) {
    modes.push(
      buildFailureMode({
        id: "approval-gap",
        title: "Approval or oversight gap",
        likelihood: approvalLikelihood,
        impact: clamp(riskImpactBase + 0.2, 0, 1),
        whyLikely: "Risk tier implies oversight, but checkpoint coverage is weak.",
        mitigations: [
          "Add explicit human checkpoints on high-impact transitions.",
          "Tie approvals to risk-tiered execution gates and expiry windows."
        ]
      })
    );
  }

  const deadlockLikelihood = clamp(
    Math.max(0, input.architecture.agentCount - 2) * 0.12 +
      Math.max(0, input.architecture.orchestrationDepth - 3) * 0.08 +
      (1 - observability) * 0.35,
    0,
    1
  );
  if (deadlockLikelihood >= 0.2) {
    modes.push(
      buildFailureMode({
        id: "coordination-deadlock",
        title: "Multi-agent coordination deadlock",
        likelihood: deadlockLikelihood,
        impact: clamp(riskImpactBase + 0.1, 0, 1),
        whyLikely: "Agent count and depth increase coordination contention without enough observability.",
        mitigations: [
          "Define clear ownership per stage and bounded handoff retries.",
          "Instrument coordination state with timeout and dead-letter queues."
        ]
      })
    );
  }

  const retryStormLikelihood = clamp(
    retry * 0.4 +
      (1 - breaker) * 0.35 +
      Math.max(0, amplification.compoundedErrorRate - 0.05) * 2 * 0.25,
    0,
    1
  );
  if (retryStormLikelihood >= 0.2) {
    modes.push(
      buildFailureMode({
        id: "retry-storm",
        title: "Retry storm under partial failure",
        likelihood: retryStormLikelihood,
        impact: clamp(riskImpactBase + 0.1, 0, 1),
        whyLikely: "Retries are likely to compound failures without adequate circuit breaking.",
        mitigations: [
          "Apply exponential backoff with jitter and circuit-breaker trip thresholds.",
          "Cap per-stage retry budgets and route to fallback or human escalation."
        ]
      })
    );
  }

  const latencyLikelihood = clamp(
    complexityTax.taxRate * 0.6 +
      Math.max(0, input.architecture.layerCount - 3) * 0.1 +
      Math.max(0, input.architecture.orchestrationDepth - input.task.stepCount) * 0.03,
    0,
    1
  );
  if (latencyLikelihood >= 0.2) {
    modes.push(
      buildFailureMode({
        id: "latency-budget-breach",
        title: "Latency budget breach",
        likelihood: latencyLikelihood,
        impact: clamp(riskImpactBase, 0, 1),
        whyLikely: "Complexity overhead exceeds task latency tolerance.",
        mitigations: [
          "Collapse non-critical stages and use a lower-latency execution path for simple requests.",
          "Apply task-complexity routing so heavy stacks are used only when needed."
        ]
      })
    );
  }

  const topFailureModes = modes
    .slice()
    .sort((a, b) => b.riskScore - a.riskScore || b.likelihood - a.likelihood)
    .slice(0, 5);

  const overallRiskScore =
    topFailureModes.length === 0
      ? 0
      : Math.round(
          topFailureModes.reduce((sum, mode) => sum + mode.riskScore, 0) /
            topFailureModes.length
        );

  const recommendations = uniqueStrings(
    topFailureModes.map((mode) => `${mode.title}: ${mode.mitigations[0] ?? ""}`)
  );

  if (recommendations.length === 0) {
    recommendations.push("No dominant architecture-linked failure mode was detected.");
  }

  return {
    overallRiskScore,
    topFailureModes,
    recommendations
  };
}

export function scoreRedundancy(architecture: ArchitectureProfile): RedundancyScore {
  const fallback = normalizeRate(architecture.fallbackCoverage);
  const retry = normalizeRate(architecture.retryCoverage);
  const breaker = normalizeRate(architecture.circuitBreakerCoverage);
  const pathRedundancy = clamp(architecture.criticalPathRedundancy / 2, 0, 1);
  const spofPenalty = clamp(architecture.singlePointOfFailureCount / 5, 0, 1);

  let score =
    (fallback * 0.3 +
      retry * 0.15 +
      breaker * 0.2 +
      pathRedundancy * 0.2 +
      (1 - spofPenalty) * 0.15 +
      (architecture.hasHumanCheckpoint ? 0.08 : 0)) *
    100;
  score = clamp(score, 0, 100);

  let level: RedundancyScore["level"];
  if (score >= 85) level = "fault-tolerant";
  else if (score >= 65) level = "resilient";
  else if (score >= 45) level = "basic";
  else level = "fragile";

  const gaps: string[] = [];
  if (fallback < 0.5) {
    gaps.push("Fallback coverage below 50% for critical dependencies.");
  }
  if (pathRedundancy < 0.5) {
    gaps.push("Critical path has limited alternative execution paths.");
  }
  if (breaker < 0.5) {
    gaps.push("Circuit breaker coverage is insufficient.");
  }
  if (architecture.singlePointOfFailureCount > 0) {
    gaps.push(`${architecture.singlePointOfFailureCount} single point(s) of failure remain.`);
  }
  if (!architecture.hasHumanCheckpoint) {
    gaps.push("No human checkpoint configured for escalations.");
  }

  const recommendations: string[] = [];
  if (fallback < 0.5) {
    recommendations.push("Add fallback providers for each critical external dependency.");
  }
  if (pathRedundancy < 0.5) {
    recommendations.push("Create at least one validated alternate path for each critical stage.");
  }
  if (breaker < 0.5) {
    recommendations.push("Add circuit-breaker protection to prevent retry storms.");
  }
  if (architecture.singlePointOfFailureCount > 0) {
    recommendations.push("Eliminate or isolate remaining single points of failure.");
  }
  if (recommendations.length === 0) {
    recommendations.push("Fallback and redundancy controls appear sufficient.");
  }

  return {
    score: Math.round(score),
    level,
    singlePointsOfFailure: architecture.singlePointOfFailureCount,
    gaps,
    recommendations
  };
}

function buildDefaultPipelineStages(
  task: TaskComplexityProfile,
  architecture: ArchitectureProfile
): PipelineStageProfile[] {
  const stageCount = clamp(
    Math.round((Math.max(task.stepCount, 1) + Math.max(architecture.orchestrationDepth, 1)) / 3),
    1,
    6
  );
  const baseError = clamp(0.01 + task.complexity / 150, 0.01, 0.2);
  const propagation = clamp(1 + Math.max(0, architecture.orchestrationDepth - 1) * 0.08, 0.8, 2);
  const detection = normalizeRate(architecture.validationCoverage);
  const rollback = normalizeRate((architecture.retryCoverage + architecture.circuitBreakerCoverage) / 2);

  return Array.from({ length: stageCount }, (_unused, index) => ({
    stageId: `stage-${index + 1}`,
    errorRate: round2(baseError),
    propagationFactor: round2(propagation),
    detectionCoverage: round2(detection),
    rollbackCoverage: round2(rollback)
  }));
}

export function evaluateArchitectureTaskAlignment(
  input: ArchitectureTaskAlignmentInput
): ArchitectureTaskAlignmentReport {
  const fit = scoreArchitectureTaskFit(input.task, input.architecture);
  const pipelineStages =
    input.pipelineStages && input.pipelineStages.length > 0
      ? input.pipelineStages
      : buildDefaultPipelineStages(input.task, input.architecture);
  const errorAmplification = detectErrorAmplification(pipelineStages);
  const complexityTax = scoreComplexityTax(input.task, input.architecture);
  const redundancy = scoreRedundancy(input.architecture);
  const failureModes = analyzeFailureModes({
    task: input.task,
    architecture: input.architecture,
    errorAmplification,
    complexityTax
  });

  const overallScore = Math.round(
    clamp(
      fit.score * 0.3 +
        errorAmplification.score * 0.2 +
        complexityTax.score * 0.2 +
        redundancy.score * 0.2 +
        (100 - failureModes.overallRiskScore) * 0.1,
      0,
      100
    )
  );

  const summary = [
    `Task-fit classification: ${fit.classification} (${fit.score}/100).`,
    `Error amplification: ${errorAmplification.amplificationDetected ? "detected" : "not detected"} (ratio ${errorAmplification.amplificationRatio}).`,
    `Complexity tax: ${complexityTax.classification} (${Math.round(complexityTax.taxRate * 100)}%).`,
    `Redundancy level: ${redundancy.level} (${redundancy.score}/100).`,
    `Failure-mode risk index: ${failureModes.overallRiskScore}/100.`
  ];

  return {
    fit,
    errorAmplification,
    complexityTax,
    failureModes,
    redundancy,
    overallScore,
    summary
  };
}
