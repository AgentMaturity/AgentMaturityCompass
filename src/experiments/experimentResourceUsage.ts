import { realpathSync } from "node:fs";
import { z } from "zod";
import { projectNativeRunUsage, type NativeRunUsage } from "../agent/nativeRunUsage.js";
import { budgetSessionAgent, measuredUsage, readBudgetEvents } from "../budgets/nativeBudgetUsage.js";
import { foldNativeRequestCosts, renderNativeCost, type NativeCostProjection } from "../budgets/nativeCostProjection.js";
import { displayEvidenceIdentifier } from "../session/evidenceIdentifier.js";
import type { ArchitectureExperiment, ArchitectureProbe, ArchitectureSpec, ProbeOutcome } from "./architectureExperiment.js";
import { deterministicSeed } from "./stats.js";

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const work = z.object({ maxCalls: count, maxTokens: count }).strict();
const budgetSchema = z.object({
  maxCalls: count, maxTokens: count, timeoutMs: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  maxCostUsd: z.number().finite().nonnegative().optional(),
  requireHardCeiling: z.boolean().optional(),
  planned: z.object({ baseline: work, candidate: work }).strict()
}).strict();

/** Caller-owned admission plan, not signed workspace policy or an adapter-enforced spend ceiling. */
export type ArchitectureBudget = z.infer<typeof budgetSchema>;
interface ExperimentUsageEvidence { workspace: string; sessionId: string }
type ArchitectureProbeRun = ProbeOutcome[] | { outcomes: ProbeOutcome[]; usageEvidence: ExperimentUsageEvidence };
export type ArchitectureProbeRunner = (spec: ArchitectureSpec, probes: ArchitectureProbe[], seed: number) => ArchitectureProbeRun;
type ExperimentResourceRole = "proposer" | "executor" | "judge" | "repair" | "selector" | "reflection";
type ExperimentResourceState = "not-run" | "started" | "settled" | "unknown";
export interface ExperimentCostStage {
  readonly stage: string;
  readonly role: ExperimentResourceRole;
  readonly state: ExperimentResourceState;
  /** Native request projection, never a descriptor/formula-derived optimizer metric. */
  readonly cost: NativeCostProjection | null;
}
interface ExperimentCostTotals {
  readonly cost: NativeCostProjection | null;
  /** Final attributed USD only when every declared stage settled with complete request cost coverage. */
  readonly totalCostUsd: number | null;
  readonly complete: boolean;
  /** Stages without a native request projection; their missing cost is not zero. */
  readonly unavailableStages: number;
}
export interface ExperimentRoleCostSummary {
  readonly schemaVersion: 1;
  readonly evidenceBasis: "native-request-cost-projections-with-caller-selected-roles";
  readonly stages: readonly (ExperimentCostStage & ExperimentCostTotals)[];
  readonly roles: readonly (ExperimentCostTotals & { readonly role: ExperimentResourceRole })[];
  readonly total: ExperimentCostTotals;
}
const RESOURCE_ROLES: readonly ExperimentResourceRole[] = ["proposer", "executor", "judge", "repair", "selector", "reflection"];

/** Fold existing request-level USD semantics without repricing history or adding reported amounts to estimates. */
function mergeExperimentCosts(costs: readonly NativeCostProjection[]): NativeCostProjection | null {
  if (costs.length === 0) return null;
  const requests = costs.flatMap(cost => cost.requests);
  for (const field of ["reportedCostUsd", "estimatedCostUsd", "attributedCostUsd"] as const) {
    const values = requests.map(request => request[field]).filter((value): value is number => value !== null);
    if (values.some(value => !Number.isFinite(value) || value < 0)) throw new Error("Invalid native cost projection amount");
    if (!Number.isFinite(values.reduce((sum, value) => sum + value, 0))) throw new Error("Experiment cost subtotal overflow");
  }
  return foldNativeRequestCosts(requests);
}

/** Caller assigns roles; each observed native request may supply cost to exactly one experiment stage. */
export function summarizeExperimentRoleCosts(stages: readonly ExperimentCostStage[]): ExperimentRoleCostSummary {
  const names = new Set<string>(), requests = new Set<string>();
  for (const stage of stages) {
    if (!stage.stage || names.has(stage.stage)) throw new Error("Experiment cost attribution requires distinct stage names");
    names.add(stage.stage);
    if (!RESOURCE_ROLES.includes(stage.role) || !["not-run", "started", "settled", "unknown"].includes(stage.state)) {
      throw new Error("Invalid experiment cost role or stage state");
    }
    if (stage.state === "not-run" && stage.cost !== null) throw new Error("A not-run stage cannot carry native cost evidence");
    if (stage.cost === null) continue;
    const projection = stage.cost;
    const folded = mergeExperimentCosts([projection])!;
    const fields = ["schemaVersion", "basis", "status", "reportedSubtotalUsd", "estimatedSubtotalUsd", "attributedSubtotalUsd",
      "completeRequests", "partialRequests", "unknownRequests"] as const;
    if (fields.some(field => projection[field] !== folded[field])) throw new Error("Invalid native cost projection coverage or subtotal");
    for (const request of projection.requests) {
      if (request.headerEventId === null || displayEvidenceIdentifier(request.headerEventId) !== request.headerEventId
        || typeof request.estimateComplete !== "boolean" || !["current", "stale", "unknown"].includes(request.freshness)
        || (request.outcomeEventId !== null && (typeof request.outcomeEventId !== "string"
          || displayEvidenceIdentifier(request.outcomeEventId) !== request.outcomeEventId))
        || (request.outcomeEventId === null && (request.reportedCostUsd !== null || request.estimatedCostUsd !== null
          || request.attributedCostUsd !== null || request.estimateComplete))
        || (request.estimateComplete && (request.estimatedCostUsd === null || request.costBasis === "unavailable"))
        || (request.costBasis === "provider-reported" && (request.reportedCostUsd === null || request.attributedCostUsd !== request.reportedCostUsd))
        || (request.costBasis === "catalog-estimate" && (!request.estimateComplete || request.reportedCostUsd !== null
          || request.estimatedCostUsd === null || request.attributedCostUsd !== request.estimatedCostUsd))
        || (request.costBasis === "unavailable" && request.attributedCostUsd !== null)
        || !["provider-reported", "catalog-estimate", "unavailable"].includes(request.costBasis)) {
        throw new Error("Invalid native cost projection request provenance");
      }
      if (requests.has(request.headerEventId) || (request.outcomeEventId !== null
        && (requests.has(request.outcomeEventId) || request.outcomeEventId === request.headerEventId))) {
        throw new Error("A native request cannot be attributed to multiple experiment stages");
      }
      requests.add(request.headerEventId);
      if (request.outcomeEventId !== null) requests.add(request.outcomeEventId);
    }
  }
  const summarize = (rows: readonly ExperimentCostStage[]): ExperimentCostTotals => {
    const cost = mergeExperimentCosts(rows.flatMap(stage => stage.cost === null ? [] : [stage.cost]));
    const complete = rows.length > 0 && rows.every(stage => stage.state === "settled" && stage.cost?.status === "complete");
    return { cost, complete, totalCostUsd: complete ? cost?.attributedSubtotalUsd ?? null : null,
      unavailableStages: rows.filter(stage => stage.cost === null).length };
  };
  return structuredClone({ schemaVersion: 1, evidenceBasis: "native-request-cost-projections-with-caller-selected-roles",
    stages: stages.map(stage => ({ ...stage, ...summarize([stage]) })),
    roles: RESOURCE_ROLES.map(role => ({ role, ...summarize(stages.filter(stage => stage.role === role)) })),
    total: summarize(stages) });
}

type StageName = "baseline" | "candidate" | "proposer" | "repair" | "selector" | "judge" | "reflection";
interface ExperimentResourceStage {
  stage: StageName;
  role: ExperimentResourceRole;
  state: ExperimentResourceState;
  /** Only a verified native session selected by the caller; this does not attest its experimental role. */
  sessionId: string | null;
  observedTokens: number | null;
  tokensComplete: boolean;
  usage: NativeRunUsage | null;
  cost: NativeCostProjection | null;
  wallTimeMs: number | null;
  reservedCalls: number | null;
  reservedTokens: number | null;
}
export interface ExperimentResourceUsage {
  schemaVersion: 1;
  scope: "caller-bound-experiment";
  evidenceBasis: "verified-native-sessions-with-caller-selected-roles";
  enforcementState: "between-stage-admission" | "not-enforced";
  hardCeilingEnforced: false;
  budget: ArchitectureBudget | null;
  startedStages: number;
  settledStages: number;
  stages: ExperimentResourceStage[];
  roleCosts?: ExperimentRoleCostSummary;
}

/** Tracks only the two existing architecture runner callbacks; no new model or judging execution path. */
function architectureResourceTracker(input?: ArchitectureBudget) {
  const budget = input === undefined ? null : budgetSchema.parse(input);
  if (budget) {
    if (budget.maxCostUsd !== undefined || budget.requireHardCeiling) {
      throw new Error("A hard resource ceiling requires a bounded adapter contract; the injected architecture runner has none");
    }
    for (const [field, label] of [["maxTokens", "token"], ["maxCalls", "call"]] as const) {
      const planned = budget.planned.baseline[field] + budget.planned.candidate[field];
      if (!Number.isSafeInteger(planned) || planned > budget[field]) throw new Error(`Planned ${label} work exceeds the whole experiment envelope`);
    }
  }
  const startedTs = Date.now();
  const stages: ExperimentResourceStage[] = (["baseline", "candidate", "proposer", "repair", "selector", "judge", "reflection"] as const)
    .map(stage => ({ stage, role: stage === "baseline" || stage === "candidate" ? "executor" : stage,
      state: "not-run", sessionId: null, observedTokens: null, tokensComplete: false, usage: null, cost: null,
      wallTimeMs: null, reservedCalls: null, reservedTokens: null }));
  const selected = new Set<string>();
  const snapshot = (): ExperimentResourceUsage => structuredClone({ schemaVersion: 1, scope: "caller-bound-experiment",
    evidenceBasis: "verified-native-sessions-with-caller-selected-roles", enforcementState: budget ? "between-stage-admission" : "not-enforced",
    hardCeilingEnforced: false, budget, startedStages: stages.filter(stage => stage.state !== "not-run").length,
    settledStages: stages.filter(stage => stage.state === "settled").length, stages, roleCosts: summarizeExperimentRoleCosts(stages) });
  const check = (next?: "baseline" | "candidate") => {
    if (!budget) return;
    if (Date.now() - startedTs >= budget.timeoutMs) throw new Error("Experiment deadline exhausted before the next stage");
    const started = stages.filter(stage => stage.state !== "not-run");
    if (started.some(stage => !stage.tokensComplete || stage.usage === null)) throw new Error("Unknown native usage prevents later experiment stages");
    const tokens = started.reduce((sum, stage) => sum + stage.observedTokens!, 0);
    const calls = started.reduce((sum, stage) => sum + stage.usage!.requests, 0);
    if (!Number.isSafeInteger(tokens) || tokens + (next ? budget.planned[next].maxTokens : 0) > budget.maxTokens) {
      throw new Error("Experiment token envelope exceeded or exhausted");
    }
    if (!Number.isSafeInteger(calls) || calls + (next ? budget.planned[next].maxCalls : 0) > budget.maxCalls) {
      throw new Error("Experiment call envelope exceeded or exhausted");
    }
  };
  return {
    snapshot,
    run<T>(stageName: "baseline" | "candidate", run: () => { value: T; usageEvidence?: ExperimentUsageEvidence }): T {
      check(stageName);
      const stage = stages.find(row => row.stage === stageName)!;
      stage.state = "started";
      stage.reservedCalls = budget?.planned[stageName].maxCalls ?? null;
      stage.reservedTokens = budget?.planned[stageName].maxTokens ?? null;
      const before = Date.now();
      try {
        const result = run();
        if (result.usageEvidence) {
          const selector = result.usageEvidence;
          const key = `${realpathSync(selector.workspace)}\0${selector.sessionId}`;
          if (selected.has(key)) throw new Error("A native session cannot be charged to multiple experiment stages");
          const rows = readBudgetEvents(selector.workspace);
          budgetSessionAgent(rows, selector.sessionId);
          const usage = projectNativeRunUsage(rows, selector.sessionId);
          if (usage.status === "invalid" || usage.cost?.status === "invalid") throw new Error("Experiment native usage evidence is invalid");
          selected.add(key);
          stage.sessionId = displayEvidenceIdentifier(selector.sessionId);
          const { cost, ...counters } = usage;
          stage.usage = counters;
          stage.cost = cost ?? null;
          const totals = usage.totals;
          const measured = measuredUsage({ reported: usage.reportedRequests > 0, complete: usage.status === "recorded",
            inputTokens: totals.inputTokens.observedTokens, outputTokens: totals.outputTokens.observedTokens,
            cacheReadTokens: totals.cacheReadTokens.observedTokens, cacheWriteTokens: totals.cacheWriteTokens.observedTokens }, true);
          if (!Number.isSafeInteger(measured.tokens)) throw new Error("Experiment token subtotal overflow");
          stage.observedTokens = usage.reportedRequests > 0 ? measured.tokens : null;
          stage.tokensComplete = usage.requests > 0 && usage.syntheticRequests === 0 && measured.tokensKnown
            && rows.some(row => row.session_id === selector.sessionId && row.event_type === "session/close")
            && [totals.inputTokens, totals.outputTokens, totals.cacheReadTokens, totals.cacheWriteTokens]
              .every(metric => metric.reportedRequests === usage.requests);
          if (stage.tokensComplete) { stage.reservedCalls = 0; stage.reservedTokens = 0; }
        }
        stage.state = "settled";
        stage.wallTimeMs = Math.max(0, Date.now() - before);
        return result.value;
      } catch (error) {
        stage.state = "unknown";
        stage.wallTimeMs = Math.max(0, Date.now() - before);
        throw error;
      }
    },
    finish: () => check()
  };
}

/** Executes the existing two callbacks with one resource tracker, retaining observations on failure. */
export function runArchitectureProbeStages(experiment: ArchitectureExperiment, options: {
  probeRunner: ArchitectureProbeRunner;
  budget?: ArchitectureBudget;
}) {
  const runner = options.probeRunner;
  const resources = architectureResourceTracker(options.budget);

  experiment.status = "RUNNING";

  const seed = deterministicSeed([
    experiment.experimentId,
    experiment.baselineSpec.artifactSha256,
    experiment.candidateSpec.artifactSha256,
  ]);

  try {
    const run = (spec: ArchitectureSpec) => {
      const result = runner(spec, experiment.probes, seed);
      return Array.isArray(result) ? { value: result } : { value: result.outcomes, usageEvidence: result.usageEvidence };
    };
    const baselineOutcomes = resources.run("baseline", () => run(experiment.baselineSpec));
    const candidateOutcomes = resources.run("candidate", () => run(experiment.candidateSpec));
    resources.finish();

    experiment.status = "COMPLETED";
    const resourceUsage = resources.snapshot();
    experiment.resourceUsage = resourceUsage;
    return { experiment, baselineOutcomes, candidateOutcomes, resourceUsage };
  } catch (e) {
    experiment.status = "FAILED";
    experiment.resourceUsage = resources.snapshot();
    throw e;
  }
}

export function renderExperimentResourceUsage(usage: ExperimentResourceUsage): string[] {
  return ["## Resource attribution", "",
    `Admission: ${usage.enforcementState}; caller-bound plan; no hard resource ceiling or interruption of an active callback.`,
    "Native session signatures are verified; role selection is caller supplied. Missing stages are unavailable, not free.",
    ...usage.stages.map(stage => `- ${stage.stage}: ${stage.state}; tokens=${stage.observedTokens ?? "unavailable"} (${stage.tokensComplete ? "complete" : "incomplete"}); `
      + (stage.cost ? renderNativeCost(stage.cost) : "Native cost: unavailable (stage has no verified usage evidence).")), ""];
}
