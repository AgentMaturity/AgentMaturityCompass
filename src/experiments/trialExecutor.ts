import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { openLedger } from "../ledger/ledger.js";
import { resolveAgentId } from "../fleet/paths.js";
import { sha256Hex } from "../utils/hash.js";
import { caseFileSha256, loadCase, loadCasebook, verifyCasebook } from "../casebooks/casebookStore.js";
import type { CaseExecutionRef } from "../casebooks/casebookRunner.js";

/**
 * Bounded executor of experiment trials (GAP-WP04).
 *
 * One trial is one immutable configuration (a baseline config or an admitted candidate artifact, named by its digest)
 * run over a set of casebook cases. Every case execution runs through an injected {@link TrialRunner} (the governed
 * native agent path in production) whose every signed row carries the case execution identity, so a bound casebook
 * run counts exactly those rows. The executor writes a start and a settle row per execution; a casebook judge reads an
 * execution that did not settle as completed (crash, timeout, refusal) as unavailable, never as a success.
 *
 * The executor sees a case's task only ({@link ExecutorCaseView}); validators and scoring are the judge's.
 */

/** What an executor may see of a case: its task. Never its validators or scoring, which are the judge's rubric and answers. */
export interface ExecutorCaseView {
  readonly caseId: string;
  readonly prompt: string;
  readonly context: Readonly<Record<string, unknown>> | null;
  readonly allowedActionClasses: readonly string[];
}

export interface TrialArm {
  readonly side: "baseline" | "candidate";
  readonly configPath: string;
  /** The digest admitted for this configuration; the bytes run must still hash to it. */
  readonly configDigest: string;
}

export interface TrialRunInput {
  readonly view: ExecutorCaseView;
  /** The configuration bytes, read once and checked against the admitted digest before every execution. */
  readonly config: Buffer;
  /** Fields to merge over every row the execution writes. */
  readonly stamp: { readonly agentId: string; readonly caseExecution: CaseExecutionRef };
  readonly signal: AbortSignal;
}

export type TrialRunResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };
export type TrialRunner = (input: TrialRunInput) => Promise<TrialRunResult>;

export interface TrialLimits {
  /** Arms x cases; a larger plan is refused before any execution. */
  readonly maxExecutions: number;
  readonly trialTimeoutMs: number;
  readonly concurrency: number;
}

const DEFAULT_TRIAL_LIMITS: TrialLimits = Object.freeze({ maxExecutions: 64, trialTimeoutMs: 300_000, concurrency: 1 });
const MAX_CONCURRENCY = 8;
const MAX_TRIAL_TIMEOUT_MS = 3_600_000;
/** How long a timed-out execution may take to settle after its abort before the executor moves on. */
const ABORT_GRACE_MS = 5_000;

export interface CaseExecutionRecord {
  readonly side: "baseline" | "candidate";
  readonly trialId: string;
  readonly caseId: string;
  readonly outcome: "completed" | "unavailable";
  readonly reason: string | null;
  readonly durationMs: number;
}

/**
 * Whole-experiment budget seam (owned by WP28b): `admit` sees the full plan before any execution and may refuse it by
 * throwing; `settle` sees each execution as it ends, failed ones included.
 */
export interface TrialBudgetHook {
  admit(plan: { readonly executions: number; readonly caseIds: readonly string[]; readonly arms: readonly { side: string; configDigest: string }[] }): void;
  settle?(execution: CaseExecutionRecord): void;
}

export interface ExecutedTrials {
  readonly trials: { readonly baseline: { trialId: string; configDigest: string }; readonly candidate: { trialId: string; configDigest: string } };
  readonly executions: readonly CaseExecutionRecord[];
  readonly limits: TrialLimits;
  readonly startedTs: number;
  readonly endedTs: number;
}

function executorCaseView(kase: ReturnType<typeof loadCase>): ExecutorCaseView {
  return Object.freeze({ caseId: kase.caseId, prompt: kase.inputs.prompt, context: kase.inputs.context ?? null,
    allowedActionClasses: Object.freeze([...kase.allowedActionClasses]) });
}

function resolveLimits(limits: Partial<TrialLimits> | undefined): TrialLimits {
  const out = { ...DEFAULT_TRIAL_LIMITS, ...limits };
  const int = (value: number, max: number) => Number.isSafeInteger(value) && value >= 1 && value <= max;
  if (!int(out.maxExecutions, 10_000) || !int(out.trialTimeoutMs, MAX_TRIAL_TIMEOUT_MS) || !int(out.concurrency, MAX_CONCURRENCY)) {
    throw new Error(`Trial limits must be positive integers: executions <= 10000, timeout <= ${MAX_TRIAL_TIMEOUT_MS} ms, concurrency <= ${MAX_CONCURRENCY}.`);
  }
  return out;
}

function readAdmitted(arm: TrialArm): Buffer {
  const bytes = readFileSync(arm.configPath);
  if (sha256Hex(bytes) !== arm.configDigest) throw new Error(`The ${arm.side} configuration changed after admission; its digest no longer matches ${arm.configDigest}.`);
  return bytes;
}

/** One signed executor row about a case execution, in its own ledger session. */
function writeTrialRow(workspace: string, sessionId: string, stamp: TrialRunInput["stamp"], row: Record<string, unknown>, seal: boolean): void {
  const ledger = openLedger(workspace);
  try {
    if (!seal) ledger.startSession({ sessionId, runtime: "amc", binaryPath: "amc-experiment-executor", binarySha256: stamp.caseExecution.configDigest });
    const meta = { trustTier: "OBSERVED", auditType: "EXPERIMENT_CASE_TRIAL", ...row, ...stamp };
    ledger.appendEvidence({ sessionId, runtime: "amc", eventType: "audit", payload: JSON.stringify(meta), payloadExt: "json", inline: true, meta });
    if (seal) ledger.sealSession(sessionId);
  } finally {
    ledger.close();
  }
}

async function runBounded(runner: TrialRunner, input: Omit<TrialRunInput, "signal">, timeoutMs: number): Promise<TrialRunResult> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const run = Promise.resolve().then(() => runner({ ...input, signal: controller.signal }))
    .catch((error: unknown): TrialRunResult => ({ ok: false, reason: `trial crashed: ${error instanceof Error ? error.message : String(error)}` }));
  const timeout = new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), timeoutMs); });
  try {
    const first = await Promise.race([run, timeout]);
    if (first !== "timeout") return first;
    controller.abort();
    await Promise.race([run, new Promise((resolve) => setTimeout(resolve, Math.min(ABORT_GRACE_MS, timeoutMs)))]);
    return { ok: false, reason: `trial timed out after ${timeoutMs} ms` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run each arm over each case, bounded in executions, time per execution and concurrency.
 *
 * @throws before any execution when the casebook does not verify, a case is unknown, a configuration's bytes no longer
 * match its admitted digest, the plan exceeds its limits or the budget hook refuses it; and after the in-flight
 * executions settle when a configuration changes during the run (nothing from that run may be reported).
 */
export async function executeCaseTrials(params: {
  workspace: string;
  agentId?: string;
  casebookId: string;
  caseIds: readonly string[];
  arms: readonly [TrialArm, TrialArm];
  runTrial: TrialRunner;
  limits?: Partial<TrialLimits>;
  budget?: TrialBudgetHook;
}): Promise<ExecutedTrials> {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const limits = resolveLimits(params.limits);
  const [baselineArm, candidateArm] = params.arms;
  if (baselineArm.side !== "baseline" || candidateArm.side !== "candidate") throw new Error("Trial arms are a baseline and a candidate, in that order.");
  const verified = verifyCasebook(params.workspace, params.casebookId, agentId);
  if (!verified.valid) throw new Error(`casebook verification failed: ${verified.reasons.join("; ")}`);
  const known = new Set(loadCasebook(params.workspace, params.casebookId, agentId).casebook.caseIds);
  if (params.caseIds.length === 0 || new Set(params.caseIds).size !== params.caseIds.length || params.caseIds.some((id) => !known.has(id))) {
    throw new Error("Trial cases must be distinct cases of the casebook, and at least one.");
  }
  const configs = params.arms.map(readAdmitted);
  const executions = params.arms.length * params.caseIds.length;
  if (executions > limits.maxExecutions) throw new Error(`The trial plan has ${executions} executions; the limit is ${limits.maxExecutions}.`);
  params.budget?.admit({ executions, caseIds: [...params.caseIds], arms: params.arms.map(({ side, configDigest }) => ({ side, configDigest })) });

  const cases = params.caseIds.map((caseId) => ({ view: executorCaseView(loadCase(params.workspace, params.casebookId, caseId, agentId)),
    caseSha256: caseFileSha256(params.workspace, params.casebookId, caseId, agentId) }));
  const trialIds = params.arms.map(() => `trial_${randomUUID().replace(/-/g, "")}`);
  const tasks = params.arms.flatMap((arm, armIndex) => cases.map((kase) => ({ arm, armIndex, kase })));
  const records: CaseExecutionRecord[] = [];
  let changed: Error | null = null;
  const startedTs = Date.now();

  const runTask = async ({ arm, armIndex, kase }: typeof tasks[number]): Promise<void> => {
    try { readAdmitted(arm); } catch (error) { changed ??= error as Error; return; }
    const trialId = trialIds[armIndex]!;
    const stamp = { agentId, caseExecution: { v: 1 as const, casebookId: params.casebookId, caseId: kase.view.caseId,
      caseSha256: kase.caseSha256, trialId, configDigest: arm.configDigest } };
    const sessionId = `${trialId}-${kase.view.caseId}`;
    writeTrialRow(params.workspace, sessionId, stamp, { phase: "started", side: arm.side }, false);
    const began = Date.now();
    const result = await runBounded(params.runTrial, { view: kase.view, config: configs[armIndex]!, stamp }, limits.trialTimeoutMs);
    const record: CaseExecutionRecord = { side: arm.side, trialId, caseId: kase.view.caseId, outcome: result.ok ? "completed" : "unavailable",
      reason: result.ok ? null : result.reason, durationMs: Date.now() - began };
    writeTrialRow(params.workspace, sessionId, stamp, { phase: "settled", side: arm.side, outcome: record.outcome, reason: record.reason, durationMs: record.durationMs }, true);
    records.push(record);
    params.budget?.settle?.(record);
  };

  let next = 0;
  const worker = async (): Promise<void> => {
    while (changed === null && next < tasks.length) await runTask(tasks[next++]!);
  };
  await Promise.all(Array.from({ length: Math.min(limits.concurrency, tasks.length) }, worker));
  if (changed !== null) throw changed;
  return {
    trials: { baseline: { trialId: trialIds[0]!, configDigest: baselineArm.configDigest }, candidate: { trialId: trialIds[1]!, configDigest: candidateArm.configDigest } },
    executions: records,
    limits,
    startedTs,
    endedTs: Date.now()
  };
}
