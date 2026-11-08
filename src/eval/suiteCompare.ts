/**
 * Eval suite baselines and gates (SH-OBS-04). A baseline is a results file reduced to per-task counts; `compare`
 * decides pass / fail / inconclusive. Inconclusive is evidence that cannot decide: a different suite, too few attempts,
 * a cost gate over unavailable cost, or a results or baseline file whose digest is not in the verified ledger (an
 * edited file never passes a gate). Regression is judged on Wilson intervals, so a noisy task is not flagged on one
 * unlucky attempt.
 */
import { z } from "zod";
import { budgetMeta, readBudgetEvents } from "../budgets/nativeBudgetUsage.js";
import { sha256Hex } from "../utils/hash.js";
import { wilsonInterval } from "../experiments/stats.js";
import { appendSealedEvalAudit, EVAL_RESULTS_SCHEMA, EVAL_SUITE_RUN_AUDIT } from "./suiteRunner.js";

const EVAL_BASELINE_SCHEMA = "amc.eval-baseline/v1";
const EVAL_SUITE_BASELINE_AUDIT = "EVAL_SUITE_BASELINE";

const counts = z.object({ attempts: z.number().int().min(0), passes: z.number().int().min(0), errors: z.number().int().min(0) }).strict();
const baselineSchema = z.object({
  schema: z.literal(EVAL_BASELINE_SCHEMA), suiteId: z.string(), suiteSha256: z.string(), fromRunId: z.string(), resultsSha256: z.string(),
  tasks: z.record(z.string(), counts), cost: z.object({ attributedUsd: z.number().nullable(), complete: z.boolean() }).strict()
}).strict();
export type EvalBaseline = z.infer<typeof baselineSchema>;

const resultsShape = z.object({
  schema: z.literal(EVAL_RESULTS_SCHEMA), runId: z.string(), suiteId: z.string(), suiteSha256: z.string(),
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
  return { schema: EVAL_BASELINE_SCHEMA, suiteId: results.suiteId, suiteSha256: results.suiteSha256, fromRunId: results.runId, resultsSha256: sha256Hex(resultsJson),
    tasks: Object.fromEntries(results.tasks.map((task) => [task.taskId, { attempts: task.score.attempts, passes: task.score.passes, errors: task.score.errors }])),
    cost: { attributedUsd: results.summary.cost.attributedUsd, complete: results.summary.cost.complete } };
}

/** Signed record that this baseline (by digest) was derived from that run, so `compare` can refuse an edited baseline. */
export function recordBaseline(workspace: string, baseline: EvalBaseline, baselineSha256: string): void {
  appendSealedEvalAudit(workspace, `eval-baseline-${baselineSha256.slice(0, 16)}`, baseline.suiteSha256, { trustTier: "OBSERVED", auditType: EVAL_SUITE_BASELINE_AUDIT,
    suiteId: baseline.suiteId, suiteSha256: baseline.suiteSha256, fromRunId: baseline.fromRunId, resultsSha256: baseline.resultsSha256, baselineSha256 });
}

/** Which of the two file digests the verified ledger vouches for. Verification failures surface as thrown errors. */
export function recordedDigests(workspace: string, resultsSha256: string, baselineSha256: string): { results: boolean; baseline: boolean } {
  const rows = readBudgetEvents(workspace).filter((row) => row.event_type === "audit");
  const has = (auditType: string, key: string, digest: string) => rows.some((row) => { const meta = budgetMeta(row); return meta.auditType === auditType && meta[key] === digest; });
  return { results: has(EVAL_SUITE_RUN_AUDIT, "resultsSha256", resultsSha256), baseline: has(EVAL_SUITE_BASELINE_AUDIT, "baselineSha256", baselineSha256) };
}

interface CompareVerdict {
  readonly status: "pass" | "fail" | "inconclusive";
  readonly reasons: readonly string[];
  readonly regressedTasks: readonly string[];
  readonly improvedTasks: readonly string[];
  readonly passRate: { readonly baseline: number | null; readonly current: number | null };
  readonly costRatio: number | null;
}

export function compareResults(input: { baselineJson: string; resultsJson: string; gate: EvalGate; recorded: { results: boolean; baseline: boolean } }): CompareVerdict {
  const failed: string[] = [], inconclusive: string[] = [];
  const baseline = baselineSchema.parse(JSON.parse(input.baselineJson));
  const results = resultsShape.parse(JSON.parse(input.resultsJson));
  if (!input.recorded.results) inconclusive.push("results file digest is not recorded in the verified ledger (edited, or from another workspace)");
  if (!input.recorded.baseline) inconclusive.push("baseline file digest is not recorded in the verified ledger (edited, or never written by `eval suite baseline`)");
  if (input.gate.requireSameSuite && baseline.suiteSha256 !== results.suiteSha256) inconclusive.push(`suite changed: baseline ${baseline.suiteSha256.slice(0, 12)}… vs current ${results.suiteSha256.slice(0, 12)}…`);
  const regressed: string[] = [], improved: string[] = [];
  for (const task of results.tasks) {
    const before = baseline.tasks[task.taskId];
    if (!before) { inconclusive.push(`task ${task.taskId} has no baseline`); continue; }
    if (task.score.attempts < input.gate.minAttemptsPerTask || before.attempts < input.gate.minAttemptsPerTask) { inconclusive.push(`task ${task.taskId}: fewer than ${input.gate.minAttemptsPerTask} attempt(s) on one side`); continue; }
    if (task.score.errors > 0) { inconclusive.push(`task ${task.taskId}: ${task.score.errors} grader error(s) in the current run`); continue; }
    const was = wilsonInterval(before.passes, before.attempts), now = wilsonInterval(task.score.passes, task.score.attempts);
    if (was.lower > now.upper) regressed.push(task.taskId);
    else if (now.lower > was.upper) improved.push(task.taskId);
  }
  if (regressed.length > input.gate.maxRegressedTasks) failed.push(`${regressed.length} regressed task(s) (${regressed.join(", ")}); at most ${input.gate.maxRegressedTasks} allowed`);
  if (input.gate.minPassRate !== undefined) {
    if (results.summary.passRate === null) inconclusive.push("current pass rate unavailable (no attempts)");
    else if (results.summary.passRate < input.gate.minPassRate) failed.push(`pass rate ${results.summary.passRate.toFixed(4)} is below ${input.gate.minPassRate.toFixed(4)}`);
  }
  let costRatio: number | null = null;
  if (input.gate.maxCostIncreaseRatio !== undefined) {
    const before = baseline.cost, now = results.summary.cost;
    if (!before.complete || !now.complete || before.attributedUsd === null || now.attributedUsd === null) inconclusive.push("cost evidence unavailable or incomplete on one side");
    else if (before.attributedUsd === 0) { if (now.attributedUsd > 0) failed.push("cost rose from zero"); else inconclusive.push("cost ratio undefined: both costs are zero"); }
    else { costRatio = now.attributedUsd / before.attributedUsd; if (costRatio > input.gate.maxCostIncreaseRatio) failed.push(`cost increase ratio ${costRatio.toFixed(4)} exceeds ${input.gate.maxCostIncreaseRatio.toFixed(4)}`); }
  }
  const baselineAttempts = Object.values(baseline.tasks).reduce((sum, task) => sum + task.attempts, 0);
  const baselinePasses = Object.values(baseline.tasks).reduce((sum, task) => sum + task.passes, 0);
  const status = results.tasks.length === 0 ? "inconclusive" : failed.length > 0 ? "fail" : inconclusive.length > 0 ? "inconclusive" : "pass";
  return { status, reasons: [...failed, ...inconclusive], regressedTasks: regressed, improvedTasks: improved,
    passRate: { baseline: baselineAttempts > 0 ? baselinePasses / baselineAttempts : null, current: results.summary.passRate }, costRatio };
}
