/**
 * Eval suite baselines and gates (SH-OBS-04). A baseline is a results file reduced to per-task counts; `compare`
 * decides pass / fail / inconclusive. Inconclusive is evidence that cannot decide: a different suite or fixture set,
 * too few attempts to separate even a total regression, a baseline task the results do not cover, grader errors, a
 * cost gate over unavailable cost, or a results or baseline file whose digest is not in the verified ledger (an edited
 * file never passes a gate, and a baseline is only built from a recorded run). Regression is judged on Wilson
 * intervals over graded attempts, so a noisy task is not flagged on one unlucky attempt.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { budgetMeta, readBudgetEvents } from "../budgets/nativeBudgetUsage.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { wilsonInterval } from "../experiments/stats.js";
import { appendSealedEvalAudit, EVAL_RESULTS_SCHEMA, EVAL_SUITE_RUN_AUDIT } from "./suiteRunner.js";

const EVAL_BASELINE_SCHEMA = "amc.eval-baseline/v1";
const EVAL_SUITE_BASELINE_AUDIT = "EVAL_SUITE_BASELINE";

const counts = z.object({ attempts: z.number().int().min(0), passes: z.number().int().min(0), errors: z.number().int().min(0) }).strict();
const fixtures = z.record(z.string(), z.record(z.string(), z.string()));
const baselineSchema = z.object({
  schema: z.literal(EVAL_BASELINE_SCHEMA), suiteId: z.string(), suiteSha256: z.string(), fixtures, fromRunId: z.string(), resultsSha256: z.string(),
  tasks: z.record(z.string(), counts), cost: z.object({ attributedUsd: z.number().nullable(), complete: z.boolean() }).strict()
}).strict();
export type EvalBaseline = z.infer<typeof baselineSchema>;

const resultsShape = z.object({
  schema: z.literal(EVAL_RESULTS_SCHEMA), runId: z.string(), suiteId: z.string(), suiteSha256: z.string(), fixtures,
  tasks: z.array(z.object({ taskId: z.string(), score: counts.extend({ passRate: z.number().nullable() }).passthrough() }).passthrough()),
  summary: z.object({ attempts: z.number().int(), passes: z.number().int(), errors: z.number().int(), passRate: z.number().nullable(),
    cost: z.object({ attributedUsd: z.number().nullable(), complete: z.boolean() }).passthrough() }).passthrough()
}).passthrough();

export const gateSchema = z.object({
  minPassRate: z.number().min(0).max(1).optional(),
  maxRegressedTasks: z.number().int().min(0).default(0),
  minAttemptsPerTask: z.number().int().min(1).default(1),
  requireSameSuite: z.boolean().default(true),
  maxCostIncreaseRatio: z.number().positive().optional()
}).strict();
type EvalGate = z.infer<typeof gateSchema>;

export function baselineFromResults(resultsJson: string): EvalBaseline {
  const results = resultsShape.parse(JSON.parse(resultsJson));
  return { schema: EVAL_BASELINE_SCHEMA, suiteId: results.suiteId, suiteSha256: results.suiteSha256, fixtures: results.fixtures, fromRunId: results.runId, resultsSha256: sha256Hex(resultsJson),
    tasks: Object.fromEntries(results.tasks.map((task) => [task.taskId, { attempts: task.score.attempts, passes: task.score.passes, errors: task.score.errors }])),
    cost: { attributedUsd: results.summary.cost.attributedUsd, complete: results.summary.cost.complete } };
}

/**
 * Signed record that this baseline (by digest) was derived from that run, so `compare` can refuse an edited baseline.
 * The session id carries a random suffix: a session left behind by an interrupted write never blocks a retry.
 */
export function recordBaseline(workspace: string, baseline: EvalBaseline, baselineSha256: string): void {
  appendSealedEvalAudit(workspace, `eval-baseline-${baselineSha256.slice(0, 16)}-${randomUUID().slice(0, 8)}`, baseline.suiteSha256, { trustTier: "OBSERVED", auditType: EVAL_SUITE_BASELINE_AUDIT,
    suiteId: baseline.suiteId, suiteSha256: baseline.suiteSha256, fromRunId: baseline.fromRunId, resultsSha256: baseline.resultsSha256, baselineSha256 });
}

export interface RecordedDigests { readonly runs: ReadonlySet<string>; readonly baselines: ReadonlySet<string> }

/** Every results digest a signed `EVAL_SUITE_RUN` row vouches for, and every baseline digest an `EVAL_SUITE_BASELINE` row does. Verification failures surface as thrown errors. */
export function recordedDigests(workspace: string): RecordedDigests {
  const runs = new Set<string>(), baselines = new Set<string>();
  for (const row of readBudgetEvents(workspace)) {
    if (row.event_type !== "audit") continue;
    const meta = budgetMeta(row);
    if (meta.auditType === EVAL_SUITE_RUN_AUDIT && typeof meta.resultsSha256 === "string") runs.add(meta.resultsSha256);
    if (meta.auditType === EVAL_SUITE_BASELINE_AUDIT && typeof meta.baselineSha256 === "string") baselines.add(meta.baselineSha256);
  }
  return { runs, baselines };
}

interface CompareVerdict {
  readonly status: "pass" | "fail" | "inconclusive";
  readonly reasons: readonly string[];
  readonly regressedTasks: readonly string[];
  readonly improvedTasks: readonly string[];
  readonly passRate: { readonly baseline: number | null; readonly current: number | null };
  readonly costRatio: number | null;
}

/** Can these graded counts separate even a total regression (all pass before, none now) at 95 %? Four per side is the floor. */
export function canDetectTotalRegression(baselineGraded: number, currentGraded: number): boolean {
  return baselineGraded > 0 && currentGraded > 0 && wilsonInterval(baselineGraded, baselineGraded).lower > wilsonInterval(0, currentGraded).upper;
}

export function compareResults(input: { baselineJson: string; resultsJson: string; gate: EvalGate; recorded: RecordedDigests }): CompareVerdict {
  const failed: string[] = [], inconclusive: string[] = [];
  const baseline = baselineSchema.parse(JSON.parse(input.baselineJson));
  const results = resultsShape.parse(JSON.parse(input.resultsJson));
  if (!input.recorded.runs.has(sha256Hex(input.resultsJson))) inconclusive.push("results file digest is not recorded in the verified ledger (edited, or from another workspace)");
  if (!input.recorded.baselines.has(sha256Hex(input.baselineJson))) inconclusive.push("baseline file digest is not recorded in the verified ledger (edited, or never written by `eval suite baseline`)");
  if (!input.recorded.runs.has(baseline.resultsSha256)) inconclusive.push("the baseline's source results digest is not a recorded EVAL_SUITE_RUN (the baseline was built from an edited file)");
  if (input.gate.requireSameSuite && baseline.suiteSha256 !== results.suiteSha256) inconclusive.push(`suite changed: baseline ${baseline.suiteSha256.slice(0, 12)}… vs current ${results.suiteSha256.slice(0, 12)}…`);
  if (input.gate.requireSameSuite && canonicalize(baseline.fixtures) !== canonicalize(results.fixtures)) inconclusive.push("fixture files changed between the baseline run and this run (the graders' inputs differ)");
  const regressed: string[] = [], improved: string[] = [];
  const covered = new Set(results.tasks.map((task) => task.taskId));
  for (const taskId of Object.keys(baseline.tasks)) if (!covered.has(taskId)) inconclusive.push(`baseline task ${taskId} is absent from the results (a --tasks subset run cannot gate the whole suite)`);
  for (const task of results.tasks) {
    const before = baseline.tasks[task.taskId];
    if (!before) { inconclusive.push(`task ${task.taskId} has no baseline`); continue; }
    if (task.score.attempts < input.gate.minAttemptsPerTask || before.attempts < input.gate.minAttemptsPerTask) { inconclusive.push(`task ${task.taskId}: fewer than ${input.gate.minAttemptsPerTask} attempt(s) on one side`); continue; }
    if (task.score.errors > 0) { inconclusive.push(`task ${task.taskId}: ${task.score.errors} grader error(s) in the current run`); continue; }
    const gradedBefore = before.attempts - before.errors, gradedNow = task.score.attempts - task.score.errors;
    if (!canDetectTotalRegression(gradedBefore, gradedNow)) { inconclusive.push(`task ${task.taskId}: ${gradedBefore} vs ${gradedNow} graded attempt(s) cannot separate even a total regression at 95 % (4 per side is the floor)`); continue; }
    const was = wilsonInterval(before.passes, gradedBefore), now = wilsonInterval(task.score.passes, gradedNow);
    if (was.lower > now.upper) regressed.push(task.taskId);
    else if (now.lower > was.upper) improved.push(task.taskId);
  }
  if (regressed.length > input.gate.maxRegressedTasks) failed.push(`${regressed.length} regressed task(s) (${regressed.join(", ")}); at most ${input.gate.maxRegressedTasks} allowed`);
  if (input.gate.minPassRate !== undefined) {
    const { attempts, passes, errors, passRate } = results.summary, min = input.gate.minPassRate;
    if (passRate === null) inconclusive.push("current pass rate unavailable (no graded attempts)");
    else if (passRate < min) {
      // An errored attempt is neither a pass nor a fail: the rate fails only if it would fail however the errors resolved.
      if (errors === 0 || (passes + errors) / attempts < min) failed.push(`pass rate ${passRate.toFixed(4)} is below ${min.toFixed(4)}${errors > 0 ? ` even if all ${errors} errored attempt(s) had passed` : ""}`);
      else inconclusive.push(`pass rate ${passRate.toFixed(4)} over graded attempts is below ${min.toFixed(4)}, but ${errors} errored attempt(s) could still decide it`);
    } else if (errors > 0 && passes / attempts < min) inconclusive.push(`pass rate ${passRate.toFixed(4)} over graded attempts meets ${min.toFixed(4)}, but ${errors} errored attempt(s) could still decide it`);
  }
  let costRatio: number | null = null;
  if (input.gate.maxCostIncreaseRatio !== undefined) {
    const before = baseline.cost, now = results.summary.cost;
    if (!before.complete || !now.complete || before.attributedUsd === null || now.attributedUsd === null) inconclusive.push("cost evidence unavailable or incomplete on one side");
    else if (before.attributedUsd === 0) { if (now.attributedUsd > 0) failed.push("cost rose from zero"); else inconclusive.push("cost ratio undefined: both costs are zero"); }
    else { costRatio = now.attributedUsd / before.attributedUsd; if (costRatio > input.gate.maxCostIncreaseRatio) failed.push(`cost increase ratio ${costRatio.toFixed(4)} exceeds ${input.gate.maxCostIncreaseRatio.toFixed(4)}`); }
  }
  const baselineGraded = Object.values(baseline.tasks).reduce((sum, task) => sum + task.attempts - task.errors, 0);
  const baselinePasses = Object.values(baseline.tasks).reduce((sum, task) => sum + task.passes, 0);
  const status = results.tasks.length === 0 ? "inconclusive" : failed.length > 0 ? "fail" : inconclusive.length > 0 ? "inconclusive" : "pass";
  return { status, reasons: [...failed, ...inconclusive], regressedTasks: regressed, improvedTasks: improved,
    passRate: { baseline: baselineGraded > 0 ? baselinePasses / baselineGraded : null, current: results.summary.passRate }, costRatio };
}
