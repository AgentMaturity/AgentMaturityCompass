/**
 * Model Cognition Lab — Research Module
 *
 * Experimental features for exploring model-internal signals:
 * - Typed attention experiment harness for local models
 * - Trace-memory experiment runner with before/after comparisons
 * - Self-knowledge auxiliary-head experiment templates
 * - Model-internal signal import adapters into AMC evidence model
 * - Clear boundary markers between production and research controls
 *
 * All lab features are prefixed with `lab_` and clearly marked as
 * experimental / non-production.
 */

import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { getLabTemplates as builtInLabTemplates, buildLabExperiment, simulatedProbeInput } from "./cognitionLabBodies.js";
import {
  saveWorkspaceRecord,
  loadWorkspaceRecords,
  updateWorkspaceRecord,
  captureWorkspaceRecordPredecessor,
  prepareWorkspaceRecordAsync,
  withWorkspaceRecordPublicationLock
} from "../storage/workspaceRecordStore.js";

/** Where lab experiments live under .amc/. */
const EXPERIMENTS_AT = { area: ["lab"], kind: "experiments" };
const PROBE_RESULTS_AT = { area: ["lab"], kind: "probe-results" };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LabExperimentKind =
  | "typed_attention"
  | "trace_memory"
  | "self_knowledge"
  | "activation_threshold"
  | "identity_stability"
  | "custom";

export type LabExperimentStatus =
  | "draft"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type LabBoundaryMarker = "RESEARCH_ONLY" | "PRODUCTION_SAFE";

export interface LabExperimentTemplate {
  templateId: string;
  kind: LabExperimentKind;
  name: string;
  description: string;
  parameters: LabParameter[];
  defaultProbes: LabProbe[];
  boundaryMarker: LabBoundaryMarker;
}

export interface LabParameter {
  name: string;
  type: "string" | "number" | "boolean" | "select";
  description: string;
  defaultValue: string | number | boolean;
  options?: string[]; // for 'select' type
}

export interface LabProbe {
  probeId: string;
  name: string;
  promptText: string;
  measureDimension: string;
  expectedBehavior: string;
}

export interface LabExperiment {
  experimentId: string;
  kind: LabExperimentKind;
  name: string;
  description: string;
  modelId: string;
  parameters: Record<string, string | number | boolean>;
  probes: LabProbe[];
  status: LabExperimentStatus;
  boundaryMarker: LabBoundaryMarker;
  createdTs: number;
  startedTs: number | null;
  completedTs: number | null;
}

export interface LabProbeResult {
  probeId: string;
  experimentId: string;
  responseText: string;
  scores: Record<string, number>; // dimension → score (0.0–1.0)
  latencyMs: number;
  tokenCount: number;
  metadata: Record<string, unknown>;
  ts: number;
}

const labProbeIdentitySchema = z.object({ experimentId: z.string().refine((id) => id.trim().length > 0, "experiment identity must be nonempty") });
const labProbeResultSchema = z.object({
  ...labProbeIdentitySchema.shape,
  probeId: z.string().refine((id) => id.trim().length > 0, "probe identity must be nonempty"),
  responseText: z.string(),
  scores: z.record(z.string(), z.number().finite().min(0).max(1)),
  latencyMs: z.number().finite().nonnegative(),
  tokenCount: z.number().int().nonnegative(),
  metadata: z.record(z.string(), z.unknown()),
  ts: z.number().finite().nonnegative()
}).passthrough();

export interface LabComparisonPair {
  pairId: string;
  baselineExperimentId: string;
  candidateExperimentId: string;
  probeId: string;
  baselineScores: Record<string, number>;
  candidateScores: Record<string, number>;
  deltas: Record<string, number>;
  significantDimensions: string[];
}

export interface LabExperimentReport {
  reportId: string;
  experimentId: string;
  kind: LabExperimentKind;
  modelId: string;
  probeResults: LabProbeResult[];
  aggregateScores: Record<string, number>; // dimension → avg score
  comparisons: LabComparisonPair[];
  summary: string;
  boundaryMarker: LabBoundaryMarker;
  generatedTs: number;
  reportHash: string;
}

export interface ModelSignalImport {
  importId: string;
  sourceExperimentId: string;
  targetEvidenceType: string;
  signalName: string;
  signalValue: number;
  confidence: number;
  importedTs: number;
  boundaryMarker: LabBoundaryMarker;
}

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

/**
 * In-process cache over the durable store.
 *
 * These arrays were the only home for lab state, so `amc lab-create` returned
 * an experiment ID that no other lab-* command could resolve:
 *
 *   $ amc lab-create --kind custom --name exp1 --model m1
 *   Experiment created: lab_9f0af681-598
 *   $ amc lab-list
 *   No lab experiments found.
 *
 * Anything given a `workspace` now also lives under .amc/lab/.
 */
let experiments: LabExperiment[] = [];
let probeResults: LabProbeResult[] = [];
let signalImports: ModelSignalImport[] = [];

export function resetLabState(): void {
  experiments = [];
  probeResults = [];
  signalImports = [];
}

// ---------------------------------------------------------------------------
// Built-in experiment templates
// ---------------------------------------------------------------------------

/**
 * Get all built-in experiment templates.
 */
export function getLabTemplates(): LabExperimentTemplate[] { return builtInLabTemplates(); }

/**
 * Get a specific template by ID.
 */
export function getLabTemplate(templateId: string): LabExperimentTemplate | null {
  return getLabTemplates().find((t) => t.templateId === templateId) ?? null;
}

// ---------------------------------------------------------------------------
// Probe factories
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Experiment lifecycle
// ---------------------------------------------------------------------------

/**
 * Create a new lab experiment from a template or custom spec.
 */
export function createLabExperiment(opts: {
  kind: LabExperimentKind;
  name: string;
  description: string;
  modelId: string;
  parameters?: Record<string, string | number | boolean>;
  probes?: LabProbe[];
  boundaryMarker?: LabBoundaryMarker;
}, workspace?: string): LabExperiment {
  const experiment = buildLabExperiment(opts);

  experiments.push(experiment);
  if (workspace) {
    saveWorkspaceRecord(workspace, EXPERIMENTS_AT, experiment.experimentId, { ...experiment }, experiment.createdTs);
  }
  return experiment;
}

/** Live experiments plus any persisted by an earlier process, deduped by id. */
function allExperiments(workspace?: string): LabExperiment[] {
  if (!workspace) return [...experiments];
  const stored = loadWorkspaceRecords<LabExperiment>(workspace, EXPERIMENTS_AT);
  const seen = new Set(experiments.map((e) => e.experimentId));
  return [...experiments, ...stored.filter((e) => !seen.has(e.experimentId))];
}

export function getLabExperiment(experimentId: string, workspace?: string): LabExperiment | null {
  return allExperiments(workspace).find((e) => e.experimentId === experimentId) ?? null;
}

export function listLabExperiments(kind?: LabExperimentKind, workspace?: string): LabExperiment[] {
  const all = allExperiments(workspace);
  return kind ? all.filter((e) => e.kind === kind) : all;
}

/** A library call without a workspace stays memory-only and writes nothing; the CLI passes its working directory. */
function experimentWorkspace(workspace?: string): string | undefined {
  return workspace ? resolve(workspace) : undefined;
}

/** Applies a status transition in memory and in the store. */
function transitionExperiment(
  experimentId: string,
  allowedFrom: LabExperiment["status"][],
  apply: (experiment: LabExperiment) => void,
  workspace?: string
): LabExperiment | null {
  const live = experiments.find((e) => e.experimentId === experimentId);
  const experiment = live ?? allExperiments(workspace).find((e) => e.experimentId === experimentId);
  if (!experiment || !allowedFrom.includes(experiment.status)) return null;
  apply(experiment);
  if (live && live !== experiment) apply(live);
  if (workspace) {
    updateWorkspaceRecord(workspace, EXPERIMENTS_AT, experiment.experimentId, { ...experiment }, Date.now());
  }
  return experiment;
}

/**
 * Start a lab experiment (transition from draft to running).
 */
export function startLabExperiment(experimentId: string, workspace?: string): LabExperiment | null {
  return transitionExperiment(experimentId, ["draft"], startLabState, workspace);
}

/**
 * Record a probe result for an experiment.
 */
export function recordLabProbeResult(result: Omit<LabProbeResult, "ts">, workspace?: string): LabProbeResult {
  const full: LabProbeResult = { ...result, ts: Date.now() };
  if (workspace) {
    saveWorkspaceRecord(workspace, PROBE_RESULTS_AT, randomUUID(), { ...full }, full.ts);
  }
  probeResults.push(full);
  return full;
}

/**
 * Complete an experiment.
 */
export function completeLabExperiment(experimentId: string, workspace?: string): LabExperiment | null {
  return transitionExperiment(experimentId, ["running"], completeLabState, workspace);
}

/**
 * Cancel an experiment.
 */
export function cancelLabExperiment(experimentId: string, workspace?: string): LabExperiment | null {
  return transitionExperiment(experimentId, ["draft", "running"], cancelLabState, workspace);
}

function startLabState(experiment: LabExperiment): void { experiment.status = "running"; experiment.startedTs = Date.now(); }
function completeLabState(experiment: LabExperiment): void { experiment.status = "completed"; experiment.completedTs = Date.now(); }
function cancelLabState(experiment: LabExperiment): void { experiment.status = "cancelled"; }

// ---------------------------------------------------------------------------
// Experiment simulation (deterministic for testing)
// ---------------------------------------------------------------------------

/**
 * Produces DETERMINISTIC PLACEHOLDER results for an experiment's probes.
 *
 * No model is called. Scores are derived from a hash of the experiment/probe
 * ids purely so repeated runs are reproducible — they are not measurements and
 * must never be presented as model performance or used as evidence. Every
 * result is tagged `metadata.simulated = true` and carries a `synthetic_example`
 * envelope in `metadata.envelope`.
 *
 * Use this to exercise the lab workflow (wiring, reporting, storage), not to
 * evaluate a model.
 */
export function simulateExperiment(experimentId: string, workspace?: string): LabProbeResult[] {
  const resolvedWorkspace = experimentWorkspace(workspace);
  const experiment = getLabExperiment(experimentId, resolvedWorkspace);
  if (!experiment) return [];

  if (experiment.status === "draft") {
    startLabExperiment(experimentId, resolvedWorkspace);
  }

  const results: LabProbeResult[] = [];
  for (const probe of experiment.probes) {
    const result = recordLabProbeResult(simulatedProbeInput(experiment, probe), resolvedWorkspace);
    results.push(result);
  }

  completeLabExperiment(experimentId, resolvedWorkspace);
  return results;
}

/** Actual async writers use the prepared-store dependency; old synchronous SDK behavior remains available. */
export async function createLabExperimentAsync(opts: Parameters<typeof createLabExperiment>[0], workspace?: string): Promise<LabExperiment> {
  if (!workspace) return createLabExperiment(opts);
  const root = resolve(workspace), experiment = buildLabExperiment(structuredClone(opts));
  const prepared = await prepareWorkspaceRecordAsync(root, EXPERIMENTS_AT, experiment.experimentId, { ...experiment }, experiment.createdTs);
  return withWorkspaceRecordPublicationLock(root, EXPERIMENTS_AT, () => { prepared.publish(); experiments.push(experiment); return experiment; });
}

type SelectedLabExperiment = { experiment: LabExperiment; body: string; predecessor: ReturnType<typeof captureWorkspaceRecordPredecessor> };
const LAB_CHANGED = "lab experiment changed while signing was prepared; retry";
function labBody(experiment: LabExperiment): string {
  const body = { ...experiment } as Record<string, unknown>;
  for (const field of ["prev_record_hash", "record_hash", "signature", "storedTs"]) delete body[field];
  return canonicalize(body);
}
function selectLabExperiment(experimentId: string, workspace: string): SelectedLabExperiment | null {
  if (getLabExperiment(experimentId, workspace) === null) return null;
  const predecessor = captureWorkspaceRecordPredecessor(workspace, EXPERIMENTS_AT, experimentId);
  let stored: LabExperiment | null = null;
  if (predecessor.target !== null) {
    try { stored = JSON.parse(predecessor.target.toString("utf8")) as LabExperiment | null; } catch { return null; }
    if (stored === null || stored.experimentId !== experimentId) return null;
  }
  const selected = experiments.find(experiment => experiment.experimentId === experimentId) ?? stored;
  if (selected === null) return null;
  const experiment = structuredClone(selected), body = labBody(experiment);
  if (stored !== null && labBody(stored) !== body) return null;
  return { experiment, body, predecessor };
}
function sameLabSelection(current: SelectedLabExperiment | null, expected: SelectedLabExperiment): boolean {
  const target = expected.predecessor.target;
  return current !== null && current.body === expected.body && (target === null ? current.predecessor.target === null
    : current.predecessor.target !== null && current.predecessor.target.equals(target));
}
function assertLabSelectionCurrent(workspace: string, expected: SelectedLabExperiment): void {
  if (!sameLabSelection(selectLabExperiment(expected.experiment.experimentId, workspace), expected)) throw new Error(LAB_CHANGED);
}
type LabOperationAuthority = { assertCurrent?: () => void };
async function transitionLabAsync(experimentId: string, allowedFrom: LabExperimentStatus[], apply: (experiment: LabExperiment) => void,
  workspace?: string, expected?: SelectedLabExperiment, operation?: LabOperationAuthority): Promise<LabExperiment | null> {
  if (!workspace) return transitionExperiment(experimentId, allowedFrom, apply);
  operation?.assertCurrent?.();
  const root = resolve(workspace), selected = selectLabExperiment(experimentId, root);
  if (selected === null || !allowedFrom.includes(selected.experiment.status)) return null;
  if (expected !== undefined && !sameLabSelection(selected, expected)) throw new Error(LAB_CHANGED);
  const next = structuredClone(selected.experiment); apply(next);
  // Snapshot the earlier gate, not the mutable holder, to avoid a first-preparation self-reference.
  const original = operation?.assertCurrent;
  const prepared = await prepareWorkspaceRecordAsync(root, EXPERIMENTS_AT, experimentId, { ...next }, Date.now(), selected.predecessor, { beforePublish: original });
  if (operation !== undefined && original === undefined) operation.assertCurrent = prepared.assertCurrent;
  return withWorkspaceRecordPublicationLock(root, EXPERIMENTS_AT, () => {
    assertLabSelectionCurrent(root, selected);
    prepared.publish();
    const live = experiments.find(experiment => experiment.experimentId === experimentId);
    if (live !== undefined) { live.status = next.status; live.startedTs = next.startedTs; live.completedTs = next.completedTs; }
    return expected === undefined ? live ?? next : next;
  });
}
export async function startLabExperimentAsync(experimentId: string, workspace?: string): Promise<LabExperiment | null> {
  return transitionLabAsync(experimentId, ["draft"], startLabState, workspace);
}
export async function completeLabExperimentAsync(experimentId: string, workspace?: string): Promise<LabExperiment | null> {
  return transitionLabAsync(experimentId, ["running"], completeLabState, workspace);
}
export async function cancelLabExperimentAsync(experimentId: string, workspace?: string): Promise<LabExperiment | null> {
  return transitionLabAsync(experimentId, ["draft", "running"], cancelLabState, workspace);
}
async function publishLabProbeAsync(result: Omit<LabProbeResult, "ts">, workspace: string, selected?: SelectedLabExperiment,
  operation?: LabOperationAuthority): Promise<LabProbeResult> {
  const full: LabProbeResult = { ...structuredClone(result), ts: Date.now() }, id = randomUUID();
  const original = operation?.assertCurrent;
  original?.();
  if (selected !== undefined) assertLabSelectionCurrent(workspace, selected);
  const prepared = await prepareWorkspaceRecordAsync(workspace, PROBE_RESULTS_AT, id, { ...full }, full.ts, undefined, { beforePublish: original });
  if (operation !== undefined && original === undefined) operation.assertCurrent = prepared.assertCurrent;
  const publish = () => withWorkspaceRecordPublicationLock(workspace, PROBE_RESULTS_AT, () => { prepared.publish(); probeResults.push(full); return full; });
  if (selected === undefined) return publish();
  const expected = selected;
  return withWorkspaceRecordPublicationLock(workspace, EXPERIMENTS_AT, () => {
    assertLabSelectionCurrent(workspace, expected);
    return publish();
  });
}
export async function recordLabProbeResultAsync(result: Omit<LabProbeResult, "ts">, workspace?: string): Promise<LabProbeResult> {
  return workspace ? publishLabProbeAsync(result, resolve(workspace)) : recordLabProbeResult(result);
}
/** Placeholder math only; each successful write remains if a later operation refuses. */
export async function simulateExperimentAsync(experimentId: string, workspace?: string): Promise<LabProbeResult[]> {
  if (!workspace) return simulateExperiment(experimentId);
  const root = resolve(workspace);
  if (getLabExperiment(experimentId, root) === null) return [];
  let selected = selectLabExperiment(experimentId, root);
  if (selected === null) throw new Error(LAB_CHANGED);
  const operation: LabOperationAuthority = {};
  if (selected.experiment.status === "draft") {
    const started = await transitionLabAsync(experimentId, ["draft"], startLabState, root, selected, operation);
    if (started === null) throw new Error(LAB_CHANGED);
    operation.assertCurrent?.();
    selected = selectLabExperiment(experimentId, root);
    if (selected === null || selected.body !== labBody(started)) throw new Error(LAB_CHANGED);
  }
  const expected = selected;
  const results: LabProbeResult[] = [];
  for (const probe of expected.experiment.probes) {
    operation.assertCurrent?.();
    results.push(structuredClone(await publishLabProbeAsync(simulatedProbeInput(expected.experiment, probe), root, expected, operation)));
  }
  if (expected.experiment.status === "running") {
    const completed = await transitionLabAsync(experimentId, ["running"], completeLabState, root, expected, operation);
    if (completed === null) throw new Error(LAB_CHANGED);
    operation.assertCurrent?.();
  } else withWorkspaceRecordPublicationLock(root, EXPERIMENTS_AT, () => {
    operation.assertCurrent?.(); assertLabSelectionCurrent(root, expected);
  });
  return results;
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

/**
 * Compare two experiments' probe results. With a workspace, both sides are read from its store
 * (the CLI passes its working directory); without one, the call stays memory-only.
 */
export function compareExperiments(
  baselineId: string,
  candidateId: string,
  workspace?: string,
): LabComparisonPair[] {
  const resolvedWorkspace = experimentWorkspace(workspace);
  const resultsFor = (experimentId: string): LabProbeResult[] => resolvedWorkspace
    ? storedProbeResults(resolvedWorkspace, experimentId)
    : probeResults.filter((r) => r.experimentId === experimentId);
  const baselineResults = resultsFor(baselineId);
  const candidateResults = resultsFor(candidateId);

  const baselineMap = new Map(baselineResults.map((r) => [r.probeId, r]));
  const pairs: LabComparisonPair[] = [];

  for (const candidateResult of candidateResults) {
    const baselineResult = baselineMap.get(candidateResult.probeId);
    if (!baselineResult) continue;

    const deltas: Record<string, number> = {};
    const significantDimensions: string[] = [];
    const allDimensions = new Set([
      ...Object.keys(baselineResult.scores),
      ...Object.keys(candidateResult.scores),
    ]);

    for (const dim of allDimensions) {
      const baseScore = baselineResult.scores[dim] ?? 0;
      const candScore = candidateResult.scores[dim] ?? 0;
      const delta = candScore - baseScore;
      deltas[dim] = parseFloat(delta.toFixed(4));
      if (Math.abs(delta) > 0.05) {
        significantDimensions.push(dim);
      }
    }

    pairs.push({
      pairId: `pair_${randomUUID().slice(0, 8)}`,
      baselineExperimentId: baselineId,
      candidateExperimentId: candidateId,
      probeId: candidateResult.probeId,
      baselineScores: baselineResult.scores,
      candidateScores: candidateResult.scores,
      deltas,
      significantDimensions,
    });
  }

  return pairs;
}

// ---------------------------------------------------------------------------
// Model signal import
// ---------------------------------------------------------------------------

/**
 * Import a model-internal signal into the AMC evidence model.
 */
export function importModelSignal(opts: {
  sourceExperimentId: string;
  targetEvidenceType: string;
  signalName: string;
  signalValue: number;
  confidence: number;
}): ModelSignalImport {
  const signal: ModelSignalImport = {
    importId: `msi_${randomUUID().slice(0, 12)}`,
    sourceExperimentId: opts.sourceExperimentId,
    targetEvidenceType: opts.targetEvidenceType,
    signalName: opts.signalName,
    signalValue: opts.signalValue,
    confidence: opts.confidence,
    importedTs: Date.now(),
    boundaryMarker: "RESEARCH_ONLY",
  };
  signalImports.push(signal);
  return signal;
}

export function getSignalImports(experimentId?: string): ModelSignalImport[] {
  return experimentId
    ? signalImports.filter((s) => s.sourceExperimentId === experimentId)
    : [...signalImports];
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

/** Validate only the requested experiment's payload; a record without an identity cannot be safely scoped away. */
function storedProbeResults(workspace: string, experimentId: string): LabProbeResult[] {
  const invalid = (error: z.ZodError): Error => {
    const issue = error.issues[0];
    return new Error(`Invalid persisted lab probe result at ${issue?.path.join(".") || "record"}: ${issue?.message || "invalid record shape"}`);
  };
  const results: LabProbeResult[] = [];
  for (const record of loadWorkspaceRecords<unknown>(workspace, PROBE_RESULTS_AT)) {
    const identity = labProbeIdentitySchema.safeParse(record);
    if (!identity.success) throw invalid(identity.error);
    if (identity.data.experimentId !== experimentId) continue;
    const parsed = labProbeResultSchema.safeParse(record);
    if (!parsed.success) throw invalid(parsed.error);
    const result = record as LabProbeResult;
    // Record validators can skip reserved own keys; validate every raw dimension before retaining its value.
    for (const [dimension, score] of Object.entries(result.scores)) {
      if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 1) {
        throw new Error(`Invalid persisted lab probe result at scores.${dimension}: expected a finite number between 0 and 1`);
      }
    }
    // The schema validates without coercion; retain raw own keys that the validator's clone can omit.
    results.push(result);
  }
  return results;
}

/**
 * Generate a lab experiment report.
 */
export function generateLabReport(experimentId: string, workspace?: string): LabExperimentReport | null {
  const resolvedWorkspace = experimentWorkspace(workspace);
  const experiment = getLabExperiment(experimentId, resolvedWorkspace);
  if (!experiment) return null;

  const results = resolvedWorkspace ? storedProbeResults(resolvedWorkspace, experimentId)
    : probeResults.filter((r) => r.experimentId === experimentId);

  // Aggregate scores by dimension
  const dimensionSums = new Map<string, number[]>();
  for (const result of results) {
    for (const [dim, score] of Object.entries(result.scores)) {
      const arr = dimensionSums.get(dim) ?? [];
      arr.push(score);
      dimensionSums.set(dim, arr);
    }
  }

  const aggregateScores: Record<string, number> = Object.fromEntries([...dimensionSums].map(([dim, scores]) =>
    [dim, parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(3))]));

  // Find comparisons involving this experiment
  const comparisons = probeResults.length > 0 ? [] : []; // comparisons must be computed separately

  const reportContent = {
    experimentId,
    kind: experiment.kind,
    modelId: experiment.modelId,
    probeResults: results,
    aggregateScores,
    comparisons,
    boundaryMarker: experiment.boundaryMarker,
    generatedTs: Date.now(),
  };
  const reportHash = sha256Hex(JSON.stringify(reportContent));

  const summary = results.length > 0
    ? `Experiment "${experiment.name}" completed with ${results.length} probe results across ${Object.keys(aggregateScores).length} dimensions. ` +
      `Average scores: ${Object.entries(aggregateScores).map(([d, s]) => `${d}=${(s * 100).toFixed(0)}%`).join(", ")}.`
    : `Experiment "${experiment.name}" has no probe results yet.`;

  return {
    reportId: `labr_${randomUUID().slice(0, 12)}`,
    experimentId,
    kind: experiment.kind,
    modelId: experiment.modelId,
    probeResults: results,
    aggregateScores,
    comparisons,
    summary,
    boundaryMarker: experiment.boundaryMarker,
    generatedTs: Date.now(),
    reportHash,
  };
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

/**
 * Render a lab experiment report as markdown.
 */
export function renderLabReportMarkdown(report: LabExperimentReport): string {
  const lines: string[] = [];

  lines.push("# Model Cognition Lab Report");
  lines.push(`⚠️ **${report.boundaryMarker}** — This is a research experiment, not a production control.`);
  lines.push("");
  lines.push(`Report ID: ${report.reportId}`);
  lines.push(`Experiment: ${report.experimentId} (${report.kind})`);
  lines.push(`Model: ${report.modelId}`);
  lines.push(`Generated: ${new Date(report.generatedTs).toISOString()}`);
  lines.push("");

  // Summary
  lines.push("## Summary");
  lines.push(report.summary);
  lines.push("");

  // Aggregate scores
  if (Object.keys(report.aggregateScores).length > 0) {
    lines.push("## Aggregate Scores");
    lines.push("| Dimension | Score |");
    lines.push("|-----------|-------|");
    for (const [dim, score] of Object.entries(report.aggregateScores)) {
      lines.push(`| ${dim} | ${(score * 100).toFixed(1)}% |`);
    }
    lines.push("");
  }

  // Probe results
  if (report.probeResults.length > 0) {
    lines.push("## Probe Results");
    lines.push("| Probe | Latency | Tokens | Primary Score |");
    lines.push("|-------|---------|--------|---------------|");
    for (const r of report.probeResults) {
      const primaryDim = Object.keys(r.scores)[0] ?? "—";
      const primaryScore = r.scores[primaryDim] ?? 0;
      lines.push(`| ${r.probeId} | ${r.latencyMs}ms | ${r.tokenCount} | ${(primaryScore * 100).toFixed(1)}% |`);
    }
    lines.push("");
  }

  // Comparisons
  if (report.comparisons.length > 0) {
    lines.push("## Comparisons");
    lines.push("| Probe | Significant Dimensions | Largest Delta |");
    lines.push("|-------|----------------------|---------------|");
    for (const c of report.comparisons) {
      const largest = Object.entries(c.deltas).sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))[0];
      lines.push(`| ${c.probeId} | ${c.significantDimensions.join(", ") || "none"} | ${largest ? `${largest[0]}: ${(largest[1] * 100).toFixed(1)}%` : "—"} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
