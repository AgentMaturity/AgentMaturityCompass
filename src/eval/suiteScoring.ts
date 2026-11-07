/**
 * Eval suite scoring (SH-OBS-04): the unbiased pass@k estimator (Chen et al. 2021) and Wilson intervals from
 * src/experiments/stats.ts. No rate is reported over an unknown denominator.
 */
import { nearestRank, wilsonInterval } from "../experiments/stats.js";

/** pass@k = 1 - C(n-c, k) / C(n, k): the probability that at least one of k attempts drawn from n passes. */
export function passAtK(n: number, c: number, k: number): number {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(c) || !Number.isSafeInteger(k) || n <= 0 || c < 0 || c > n || k <= 0) throw new Error("pass@k needs integers 0 <= c <= n and 1 <= k");
  if (k > n) throw new Error(`pass@${k} is undefined over ${n} attempt(s)`);
  if (n - c < k) return 1;
  // Product form of C(n-c,k)/C(n,k): avoids large factorials.
  let miss = 1;
  for (let i = n - c - k + 1; i <= n - c; i += 1) miss *= i / (i + c);
  return 1 - miss;
}

export interface TaskScore {
  readonly taskId: string;
  readonly attempts: number;
  readonly passes: number;
  readonly errors: number;
  readonly passRate: number | null;
  readonly wilson95: { readonly lower: number; readonly upper: number } | null;
  readonly passAtK: Readonly<Record<string, number>>;
}

export function scoreTask(taskId: string, outcomes: ReadonlyArray<"pass" | "fail" | "error">): TaskScore {
  const n = outcomes.length;
  const c = outcomes.filter((outcome) => outcome === "pass").length;
  const errors = outcomes.filter((outcome) => outcome === "error").length;
  const atK: Record<string, number> = {};
  if (n > 0) for (let k = 1; k <= n; k += 1) atK[`pass@${k}`] = passAtK(n, c, k);
  const wilson = n > 0 ? wilsonInterval(c, n) : null;
  return { taskId, attempts: n, passes: c, errors, passRate: n > 0 ? c / n : null, wilson95: wilson ? { lower: wilson.lower, upper: wilson.upper } : null, passAtK: atK };
}

export interface SuiteSummary {
  readonly tasks: number;
  readonly attempts: number;
  readonly passes: number;
  readonly errors: number;
  /** Over all attempts. */
  readonly passRate: number | null;
  /** Share of tasks whose every attempt passed. */
  readonly taskPassRate: number | null;
  readonly latency: { readonly p50Ms: number | null; readonly p95Ms: number | null };
}

export function summarizeSuite(scores: readonly TaskScore[], durationsMs: readonly number[]): SuiteSummary {
  const attempts = scores.reduce((sum, score) => sum + score.attempts, 0);
  const passes = scores.reduce((sum, score) => sum + score.passes, 0);
  const errors = scores.reduce((sum, score) => sum + score.errors, 0);
  return { tasks: scores.length, attempts, passes, errors, passRate: attempts > 0 ? passes / attempts : null,
    taskPassRate: scores.length > 0 ? scores.filter((score) => score.attempts > 0 && score.passes === score.attempts).length / scores.length : null,
    latency: { p50Ms: durationsMs.length ? nearestRank(durationsMs, 0.5) : null, p95Ms: durationsMs.length ? nearestRank(durationsMs, 0.95) : null } };
}
