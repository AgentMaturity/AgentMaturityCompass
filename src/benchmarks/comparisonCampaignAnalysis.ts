import { z } from "zod";
import { checkComparisonCampaign, loadComparisonCampaign, type ComparisonCampaign } from "./comparisonCampaign.js";
import { campaignTrialEvidenceSchema, diffCampaignWorkspace } from "./comparisonCampaignEvidence.js";
import { comparisonSha256 } from "./harnessComparisonArtifacts.js";
import { comparisonObservationsSchema, comparisonOracleSchema, HARNESS_COMPARISON_VERSION, harnessComparisonManifestSchema } from "./harnessComparisonSchema.js";
import type { HarnessComparisonReport, HarnessComparisonTrial } from "./harnessComparison.js";
import { summarizeHarnessComparison } from "./harnessComparisonReport.js";
import { deterministicSeed, mean, pairedBootstrapCI, wilsonInterval } from "../experiments/stats.js";
import { evaluateExperimentGate } from "../experiments/experimentGatePolicy.js";

// Validate fields consumed by analysis; retain additional executor receipt fields verbatim.
const trialSchema = z.object({
  id: z.string().min(1), targetId: z.string(), taskId: z.string(), laneId: z.string(), repetition: z.number().int().positive(),
  laneKind: z.enum(["keyless-conformance", "live-provider", "local-provider"]), scenario: z.string(),
  status: z.enum(["executed", "unavailable", "inconclusive"]), verdict: z.enum(["pass", "fail"]).nullable(),
  laneConfigurationSha256: z.string(), modelCalled: z.boolean().nullable(), observedOutcome: z.enum(["pass", "fail"]).nullable(),
  process: z.object({ durationMs: z.number().finite().nonnegative(), exitCode: z.number().int().nullable(), signal: z.string().nullable(),
    terminatedBy: z.string().nullable(), treeExitProven: z.boolean() }).passthrough().nullable(),
  oracle: comparisonOracleSchema.nullable(), observations: comparisonObservationsSchema.nullable(),
  budgetStatus: z.enum(["not-applicable", "unknown", "within-recorded-bounds", "exceeded"]),
  reason: z.string().nullable(), artifacts: z.array(z.unknown())
}).passthrough();
const reportSchema = z.object({ schemaVersion: z.literal(HARNESS_COMPARISON_VERSION), comparisonId: z.string(), manifestSha256: z.string(),
  startedAt: z.string().datetime(), finishedAt: z.string().datetime(), manifest: harnessComparisonManifestSchema, environment: z.object({ platform: z.string(), arch: z.string(), nodeVersion: z.string() }),
  trials: z.array(trialSchema).max(2000) }).passthrough();
const key = (row: { targetId: string; taskId: string; repetition: number }) => `${row.targetId}/${row.taskId}/${row.repetition}`;

function costPerSuccess(rows: HarnessComparisonTrial[]): number | null {
  const successes = rows.filter(row => row.status === "executed" && row.verdict === "pass").length;
  if (!successes || !rows.length || rows.some(row => row.process === null || !row.observations?.cost || !row.observations.usage)) return null;
  return rows.reduce((sum, row) => sum + row.observations!.cost!.amountUsd, 0) / successes;
}

/** Offline analysis only. Attributed local receipts do not authenticate promotion or establish model superiority. */
export function analyzeComparisonCampaign(input: { campaignPath: string; expectedCampaignSha256: string; report: HarnessComparisonReport; evidence?: readonly unknown[] }) {
  const { spec, campaignSha256 } = loadComparisonCampaign(input.campaignPath);
  const ready = checkComparisonCampaign(input.campaignPath, { analysisOnly: true });
  const problems = [...ready.problems];
  if (ready.campaignSha256 !== campaignSha256) problems.push("Campaign spec changed during admission.");
  if (input.expectedCampaignSha256 !== campaignSha256) problems.push("Campaign spec or analysis policy changed since preregistration, or its frozen digest is unavailable.");
  const parsed = reportSchema.safeParse(input.report);
  const report = parsed.success ? parsed.data as unknown as HarnessComparisonReport : null;
  if (!report) problems.push("Report does not satisfy the consumed trial evidence contract.");
  if (report && ready.manifest) {
    if (report.manifestSha256 !== spec.manifest?.sha256 || report.comparisonId !== spec.id || JSON.stringify(report.manifest) !== JSON.stringify(ready.manifest)) problems.push("Report manifest/artifact/model/policy identity differs from the pinned campaign.");
    const expectedEnvironment = ready.manifest.environment;
    if (report.environment.platform !== expectedEnvironment.platform || report.environment.arch !== expectedEnvironment.arch || report.environment.nodeVersion.replace(/^v/, "") !== expectedEnvironment.nodeVersion.replace(/^v/, "")) problems.push("Report execution environment differs from the pinned campaign.");
    const plan = new Map(ready.trials.map((row, index) => [key(row), { row, index }]));
    const ids = new Set<string>(), keys = new Set<string>(); let previous = -1;
    for (const row of report.trials) {
      const expected = plan.get(key(row)), lane = ready.manifest.lanes.find(lane => lane.id === row.laneId);
      if (ids.has(row.id) || keys.has(key(row))) problems.push("Duplicate trial identity or matched slot.");
      ids.add(row.id); keys.add(key(row));
      if (!expected || expected.index <= previous || expected.row.laneId !== row.laneId) problems.push("Trial slot or actual order differs from the preregistered rotation.");
      previous = expected?.index ?? previous;
      if (!lane || row.laneKind !== lane.kind || row.laneConfigurationSha256 !== comparisonSha256(JSON.stringify(lane)) || row.scenario !== spec.tasks.find(task => task.id === row.taskId)?.scenario) problems.push("Trial task/model/permissions/policy identity differs from the admitted manifest.");
      if (lane) {
        const { maxTokens, maxCostUsd } = lane.budgets;
        const usage = row.observations?.usage, cost = row.observations?.cost;
        const exceeded = (maxTokens !== null && usage && usage.inputTokens + usage.outputTokens > maxTokens) || (maxCostUsd !== null && cost && cost.amountUsd > maxCostUsd);
        const unknown = (maxTokens !== null && !usage) || (maxCostUsd !== null && !cost);
        const expectedBudget = maxTokens === null && maxCostUsd === null ? "not-applicable" : exceeded ? "exceeded" : unknown ? "unknown" : "within-recorded-bounds";
        if (row.status === "executed" && row.budgetStatus !== expectedBudget) problems.push("Qualified trial budget status contradicts the recorded observations and pinned limits.");
        if (row.modelCalled !== (row.observations?.modelExecution?.modelCalled ?? null) && lane.kind !== "keyless-conformance") problems.push("Model-call claim differs from attributed adapter observations.");
        if (lane.kind === "local-provider" && cost) problems.push("Local inference cannot admit a fabricated monetary observation.");
      }
      if (row.status === "executed" && (!row.process?.treeExitProven || row.process.terminatedBy !== null || row.verdict === null || !row.oracle || !["pass", "fail"].includes(row.oracle.verdict) || row.budgetStatus === "unknown" || row.oracle.verdict !== row.observedOutcome || row.verdict !== (row.budgetStatus === "exceeded" ? "fail" : row.oracle.verdict))) problems.push("Qualified trial lacks intact process, budget or independent oracle evidence.");
    }
  }
  const sidecars = new Map<string, z.infer<typeof campaignTrialEvidenceSchema>>();
  for (const raw of input.evidence ?? []) {
    const evidence = campaignTrialEvidenceSchema.safeParse(raw);
    if (!evidence.success) { problems.push("Malformed campaign trial sidecar."); continue; }
    if (sidecars.has(evidence.data.trialId) || !report?.trials.some(row => row.id === evidence.data.trialId)) problems.push("Duplicate or unbound campaign trial sidecar.");
    if (evidence.data.manifestSha256 !== report?.manifestSha256 || evidence.data.comparisonStartedAt !== report?.startedAt) problems.push("Campaign sidecar belongs to another manifest or run.");
    if (evidence.data.workspace) {
      try { diffCampaignWorkspace(evidence.data.workspace.baseline, evidence.data.workspace.after); }
      catch { problems.push("Campaign workspace snapshots are inconsistent."); }
    }
    sidecars.set(evidence.data.trialId, evidence.data);
  }
  const validity = { valid: problems.length === 0, reasons: [...new Set(problems)] };
  const empty = { schemaVersion: "comparison-campaign-analysis/1" as const, campaignId: spec.id, campaignSha256,
    inputDigests: { reportSha256: comparisonSha256(JSON.stringify(input.report)), evidenceSha256: comparisonSha256(JSON.stringify(input.evidence ?? [])) },
    evidenceClass: spec.evidenceClass, status: "inconclusive" as "pass" | "fail" | "inconclusive", passed: false,
    promotionAllowed: false as const, validity, summary: null as ReturnType<typeof summarizeHarnessComparison> | null,
    behavioral: [] as BehavioralRow[], comparisons: [] as ComparisonRow[], components: [] as ComponentRow[],
    workspaceChanges: [] as WorkspaceRow[], reasons: validity.reasons,
    limitations: ["Scripted conformance measures contracts only. Human usability, platform support and model quality are separate evidence classes.",
      "Sidecars and report fields are adapter-attributed local evidence, not authenticated report or gate signatures. No promotion or release claim is authorized.",
      "Uncertainty resamples task-level matched means, keeping repetitions within their task cluster. The metric is all-pass outcome points (0 or 100), not partial-credit score.",
      "Command wall time includes adapter startup and cleanup. Resource/cache/cost coverage and failed attempts remain visible in summary."] };
  if (!validity.valid || !report) return empty;
  const rows = new Map(report.trials.map(row => [key(row), row]));
  const missing: string[] = [];
  const determinate = (row: HarnessComparisonTrial | undefined): row is HarnessComparisonTrial => !!row && row.status === "executed" && row.verdict !== null && (row.laneKind === "keyless-conformance" || row.modelCalled === true);
  const behavioral: BehavioralRow[] = spec.targets.flatMap(targetId => spec.tasks.map(task => {
    const attempts = Array.from({ length: spec.repetitions }, (_, i) => rows.get(key({ targetId, taskId: task.id, repetition: i + 1 })));
    const complete = attempts.every(determinate), successes = attempts.filter(row => determinate(row) && row.verdict === "pass").length;
    const interval = complete ? wilsonInterval(successes, spec.repetitions) : null;
    return { targetId, taskId: task.id, planned: spec.repetitions, determinate: attempts.filter(determinate).length,
      unavailable: attempts.filter(row => row?.status === "unavailable").length, inconclusive: attempts.filter(row => row?.status === "inconclusive").length,
      missing: attempts.filter(row => !row).length, passed: successes,
      passRate: complete ? successes / spec.repetitions : null, interval95: interval ? [interval.lower, interval.upper] : null,
      status: !complete ? "inconclusive" : successes === 0 || interval!.lower < spec.behavioralGate.minPassRateLowerBound ? "fail" : "pass" };
  }));
  const comparisons = spec.comparisons.map(pair => analyzePair(spec, report, rows, determinate, pair));
  const components: ComponentRow[] = spec.targets.map(targetId => {
    const trials = report.trials.filter(row => row.targetId === targetId);
    const observed = trials.flatMap(row => { const used = sidecars.get(row.id)?.componentsUsed; return used === null || used === undefined ? [] : [{ trialId: row.id, used }]; });
    const counts = new Map<string, { id: string; kind: string; trials: number }>();
    for (const record of observed) for (const component of record.used) {
      const identity = `${component.kind}/${component.id}`, before = counts.get(identity);
      counts.set(identity, { id: component.id, kind: component.kind, trials: (before?.trials ?? 0) + 1 });
    }
    const unknownTrials = spec.tasks.length * spec.repetitions - observed.length;
    if (spec.requireComponentsUsed && unknownTrials) missing.push(`${targetId}: ${unknownTrials} trial(s) lack component-use observations.`);
    return { targetId, observedTrials: observed.length, unknownTrials, used: [...counts.values()] };
  });
  const workspaceChanges: WorkspaceRow[] = report.trials.filter(row => spec.workspaceTaskIds.includes(row.taskId)).map(row => {
    const workspace = sidecars.get(row.id)?.workspace;
    if (!workspace) missing.push(`${row.id}: post-install baseline and final workspace evidence unavailable.`);
    return { trialId: row.id, source: "adapter-observation", changes: workspace ? diffCampaignWorkspace(workspace.baseline, workspace.after) : null };
  });
  const statuses = [...behavioral.map(row => row.status), ...comparisons.map(row => row.status)];
  const status = missing.length || statuses.includes("inconclusive") ? "inconclusive" : statuses.includes("fail") ? "fail" : "pass";
  const summary = summarizeHarnessComparison(report);
  if (behavioral.some(row => row.status === "inconclusive")) {
    // Descriptive counts stay visible; a blocked pair cannot retain an apparently complete headline rate.
    for (const group of summary.groups) { group.oraclePassRate = null; group.checkPassFraction = null; }
  }
  return { ...empty, status, passed: status === "pass", summary, behavioral, comparisons, components, workspaceChanges,
    reasons: [...missing, ...behavioral.filter(row => row.status !== "pass").map(row => `${row.targetId}/${row.taskId}: ${row.status === "inconclusive" ? "incomplete or unscored repetitions; rate withheld" : row.passed === 0 ? "no passing repeated outcome" : "pass-rate lower bound below preregistered threshold"}`), ...comparisons.flatMap(row => row.reasons)] };
}

interface BehavioralRow {
  targetId: string; taskId: string; planned: number; determinate: number; unavailable: number; inconclusive: number; missing: number;
  passed: number; passRate: number | null; interval95: [number, number] | null; status: "pass" | "fail" | "inconclusive";
}
interface ComparisonRow { baseline: string; candidate: string; pairedTasks: number; plannedTasks: number; meanDifferencePoints: number | null; interval95: [number, number] | null; status: "pass" | "fail" | "inconclusive"; reasons: string[] }
interface ComponentRow { targetId: string; observedTrials: number; unknownTrials: number; used: { id: string; kind: string; trials: number }[] }
interface WorkspaceRow { trialId: string; source: string; changes: ReturnType<typeof diffCampaignWorkspace> | null }

function analyzePair(spec: ComparisonCampaign, report: HarnessComparisonReport, rows: Map<string, HarnessComparisonTrial>, determinate: (row: HarnessComparisonTrial | undefined) => row is HarnessComparisonTrial, pair: ComparisonCampaign["comparisons"][number]): ComparisonRow {
  const clusters = spec.tasks.flatMap(task => {
    const repeats = Array.from({ length: spec.repetitions }, (_, i) => [rows.get(key({ targetId: pair.baseline, taskId: task.id, repetition: i + 1 })), rows.get(key({ targetId: pair.candidate, taskId: task.id, repetition: i + 1 }))]);
    if (repeats.some(arms => !arms.every(determinate))) return [];
    return [[mean(repeats.map(arms => arms[0]!.verdict === "pass" ? 100 : 0)), mean(repeats.map(arms => arms[1]!.verdict === "pass" ? 100 : 0))] as const];
  });
  if (clusters.length !== spec.tasks.length) return { ...pair, pairedTasks: clusters.length, plannedTasks: spec.tasks.length, meanDifferencePoints: null, interval95: null, status: "inconclusive", reasons: ["Incomplete matched repetitions; headline difference and uncertainty withheld."] };
  const interval = pairedBootstrapCI({ pairs: clusters, seed: deterministicSeed([spec.id, pair.baseline, pair.candidate]) });
  const difference = clusters.length ? mean(clusters.map(([a, b]) => b - a)) : null;
  const gate = evaluateExperimentGate({ schemaVersion: 2, baseline: { trialId: pair.baseline }, candidate: { trialId: pair.candidate },
    counts: { pairedCases: clusters.length }, upliftSuccessRate: difference === null ? null : difference / 100, upliftValuePoints: difference,
    valueUnit: "points", confidenceStatus: interval.status, confidenceInterval95: interval.interval,
    baselineCostPerSuccess: costPerSuccess(report.trials.filter(row => row.targetId === pair.baseline)), candidateCostPerSuccess: costPerSuccess(report.trials.filter(row => row.targetId === pair.candidate)) }, pair.policy);
  return { baseline: pair.baseline, candidate: pair.candidate, pairedTasks: clusters.length, plannedTasks: spec.tasks.length, meanDifferencePoints: difference, interval95: interval.interval, ...gate };
}
