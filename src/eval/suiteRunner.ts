/**
 * Eval suite runner (SH-OBS-04): each task runs `attempts` times through the experiments' governed trial runner
 * (openAgentSession, ToolPipeline, abort grace, "an unsealed session is never a completed attempt"), one fresh session
 * per attempt, every row stamped with a `caseExecution` identity so the attempt's usage and cost are read back from
 * VERIFIED rows (collectTrialReceipts). Graders read the attempt's final assistant text from those rows with a digest
 * check; command graders grade a pristine copy. A results file is written and its digest is recorded in a signed
 * `EVAL_SUITE_RUN` audit row, so a later gate can refuse an edited file.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { budgetMeta, readBudgetEvents } from "../budgets/nativeBudgetUsage.js";
import { collectTrialReceipts } from "../experiments/trialReceipts.js";
import { providerTrialRunner, type TrialProviderSelection } from "../experiments/nativeTrialRunner.js";
import { runBounded } from "../experiments/trialExecutor.js";
import { openLedger } from "../ledger/ledger.js";
import { readEventPayload } from "../session/eventPayload.js";
import type { ToolGuard } from "../tools/toolTypes.js";
import type { EvidenceEvent } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { amcVersion } from "../version.js";
import { gradeCommand, gradeText, type GraderResult } from "./suiteGraders.js";
import { fixtureDigests, type LoadedSuite } from "./suiteLoader.js";
import { scoreTask, summarizeSuite, type SuiteSummary, type TaskScore } from "./suiteScoring.js";

export const EVAL_RESULTS_SCHEMA = "amc.eval-results/v1";
export const EVAL_SUITE_RUN_AUDIT = "EVAL_SUITE_RUN";
export const DEFAULT_EVAL_AGENT_ID = "eval-suite";
const ATTEMPT_GUARD = "eval-attempt-scope";
const MAX_ATTEMPTS = 10;

export interface EvalAttemptRecord {
  readonly attempt: number;
  readonly sessionId: string | null;
  readonly outcome: "completed" | "unavailable";
  readonly reason: string | null;
  readonly verdict: "pass" | "fail" | "error";
  readonly graders: readonly GraderResult[];
  readonly durationMs: number;
  readonly usage: unknown;
  readonly cost: { readonly status: string; readonly attributedUsd: number | null; readonly unknownRequests: number } | null;
}

export interface EvalResults {
  readonly schema: typeof EVAL_RESULTS_SCHEMA;
  readonly runId: string;
  readonly suiteId: string;
  readonly suiteSha256: string;
  readonly suitePath: string;
  readonly fixtures: Record<string, Record<string, string>>;
  readonly provider: { readonly providerId: string; readonly model: string | null };
  readonly agentId: string;
  readonly amcVersion: string;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly attemptsPerTask: number;
  readonly graderMode: "confined-or-refused" | "unsafe-unconfined-allowed";
  readonly tasks: ReadonlyArray<{ readonly taskId: string; readonly attempts: readonly EvalAttemptRecord[]; readonly score: TaskScore }>;
  readonly summary: SuiteSummary & { readonly cost: { readonly attributedUsd: number | null; readonly complete: boolean; readonly unknownRequests: number } };
}

export interface RunEvalSuiteOptions {
  readonly workspace: string;
  readonly loaded: LoadedSuite;
  readonly provider: TrialProviderSelection;
  readonly attempts: number;
  readonly agentId?: string;
  readonly taskIds?: readonly string[];
  readonly allowUnconfinedGraders?: boolean;
  readonly keepDirs?: boolean;
  readonly onProgress?: (line: string) => void;
}

function inside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(sep));
}

/** Deny-only: fs paths outside the attempt directory and any shell are refused; nothing is ever allowed by it. */
function attemptGuard(workspace: string, attemptDir: string, label: string): ToolGuard {
  return (execution) => {
    if (execution.name === "bash" || execution.name.startsWith("shell")) return `${label}: shell tools are not offered to eval attempts`;
    for (const key of ["path", "from", "to", "dir", "cwd", "file"]) {
      const value = execution.arguments[key];
      if (typeof value === "string" && !inside(attemptDir, resolve(workspace, value))) return `${label}: ${key} ${JSON.stringify(value)} is outside the attempt directory ${relative(workspace, attemptDir)}`;
    }
    return undefined;
  };
}

/** The last assistant text block of the attempt's session, from verified rows, or null when it cannot be read as committed. */
function finalAssistantText(workspace: string, rows: readonly EvidenceEvent[]): { text: string | null; turnEndReason: string | null } {
  const blocks = rows.filter((row) => row.event_type === "assistant/block" && budgetMeta(row).blockKind === "text");
  const ends = rows.filter((row) => row.event_type === "turn/end");
  const lastReason = ends.length ? budgetMeta(ends[ends.length - 1]!).reason : null;
  const turnEndReason = typeof lastReason === "string" ? lastReason : null;
  const last = blocks[blocks.length - 1];
  if (!last) return { text: null, turnEndReason };
  const payload = readEventPayload(workspace, last);
  if (payload.status !== "ok" || sha256Hex(payload.bytes) !== last.payload_sha256) return { text: null, turnEndReason };
  return { text: payload.bytes.toString("utf8"), turnEndReason };
}

function recordRun(workspace: string, results: EvalResults, resultsSha256: string): void {
  const ledger = openLedger(workspace);
  const sessionId = `eval-suite-${results.runId}`;
  try {
    ledger.startSession({ sessionId, runtime: "amc", binaryPath: "amc-eval-suite", binarySha256: results.suiteSha256 });
    const meta = { trustTier: "OBSERVED", auditType: EVAL_SUITE_RUN_AUDIT, runId: results.runId, suiteId: results.suiteId, suiteSha256: results.suiteSha256, resultsSha256,
      agentId: results.agentId, attempts: results.summary.attempts, passes: results.summary.passes, errors: results.summary.errors };
    ledger.appendEvidence({ sessionId, runtime: "amc", eventType: "audit", payload: JSON.stringify(meta), payloadExt: "json", inline: true, meta });
    ledger.sealSession(sessionId);
  } finally {
    ledger.close();
  }
}

export async function runEvalSuite(options: RunEvalSuiteOptions): Promise<{ results: EvalResults; resultsSha256: string; json: string }> {
  // The audit row and the receipts need signed rows: no-sign mode cannot produce a traceable run.
  if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize eval suite runs: their signed sessions and audit row cannot be produced");
  if (!Number.isSafeInteger(options.attempts) || options.attempts < 1 || options.attempts > MAX_ATTEMPTS) throw new Error(`--attempts must be an integer from 1 to ${MAX_ATTEMPTS}`);
  const { suite } = options.loaded;
  const selected = options.taskIds === undefined ? suite.tasks : suite.tasks.filter((task) => options.taskIds!.includes(task.id));
  if (options.taskIds !== undefined) for (const id of options.taskIds) if (!suite.tasks.some((task) => task.id === id)) throw new Error(`unknown task ${id}`);
  const agentId = options.agentId ?? DEFAULT_EVAL_AGENT_ID;
  const runId = randomUUID().replace(/-/g, "").slice(0, 16);
  const runRoot = join(options.workspace, ".amc-eval", runId);
  const startedAt = Date.now();
  const tasks: Array<{ taskId: string; attempts: EvalAttemptRecord[]; score: TaskScore }> = [];
  const durations: number[] = [];
  let costUsd = 0, costComplete = true, unknownCostRequests = 0;

  for (const task of selected) {
    const records: EvalAttemptRecord[] = [];
    for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
      const attemptDir = join(runRoot, task.id, String(attempt));
      mkdirSync(attemptDir, { recursive: true });
      for (const file of options.loaded.fixtures.get(task.id) ?? []) {
        const target = join(attemptDir, ...file.relativePath.split("/"));
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, file.bytes, { mode: file.mode });
      }
      const relDir = relative(options.workspace, attemptDir).split(sep).join("/");
      const label = `eval ${suite.suiteId}/${task.id}#${attempt}`;
      const systemPrompt = task.systemPrompt ?? `You are an AMC-governed agent running eval task ${task.id}. Work only inside ${relDir}.`;
      const stamp = { agentId, caseExecution: { v: 1 as const, casebookId: `eval-suite:${suite.suiteId}`, caseId: task.id, caseSha256: options.loaded.suiteSha256,
        trialId: `${runId}:${task.id}:${attempt}`, configDigest: sha256Hex(systemPrompt) } };
      let sessionId: string | null = null;
      const { runTrial } = providerTrialRunner(options.workspace, agentId, options.provider,
        { verbatimPrompt: true, tools: task.tools ?? suite.defaults.tools, extraGuard: { label: ATTEMPT_GUARD, guard: attemptGuard(options.workspace, attemptDir, label) }, onSession: (id) => { sessionId = id; } });
      const began = Date.now();
      options.onProgress?.(`${label} running`);
      const result = await runBounded(runTrial, { view: { caseId: task.id, prompt: task.prompt.replaceAll("{{taskDir}}", relDir), context: null,
        allowedActionClasses: task.allowedActionClasses ?? suite.defaults.allowedActionClasses }, config: Buffer.from(systemPrompt, "utf8"), stamp, mode: "supervise" },
      task.timeoutMs ?? suite.defaults.timeoutMs);
      const durationMs = Date.now() - began;
      durations.push(durationMs);
      // Everything graded comes from verified rows carrying this attempt's exact stamp, never from the runner's word.
      const receipt = collectTrialReceipts(options.workspace, stamp);
      const rows = readBudgetEvents(options.workspace).filter((row) => canonicalize(budgetMeta(row).caseExecution ?? null) === canonicalize(stamp.caseExecution));
      const session = receipt.sessions[0] ?? null;
      const { text, turnEndReason } = finalAssistantText(options.workspace, rows);
      const graders: GraderResult[] = [];
      for (const grader of task.graders) {
        if (grader.type === "llm_judge") graders.push({ type: grader.type, status: "error", detail: "llm_judge graders are deferred (D-12)" });
        else if (grader.type === "script" || grader.type === "tests") {
          graders.push(await gradeCommand(grader, { fixture: options.loaded.fixtures.get(task.id) ?? [], attemptDir, outputs: task.outputs, allowUnconfined: options.allowUnconfinedGraders === true, workspace: options.workspace }));
        } else graders.push(gradeText(grader, result.ok ? text : null));
      }
      const verdict: EvalAttemptRecord["verdict"] = !result.ok ? "fail" : graders.some((g) => g.status === "error") ? "error" : graders.every((g) => g.status === "pass") ? "pass" : "fail";
      const cost = session?.cost ?? null;
      if (cost === null || cost.status !== "complete" || cost.attributedSubtotalUsd === null) costComplete = false; else costUsd += cost.attributedSubtotalUsd;
      unknownCostRequests += cost?.unknownRequests ?? 0;
      records.push({ attempt, sessionId: sessionId ?? session?.sessionId ?? null, outcome: result.ok ? "completed" : "unavailable", reason: result.ok ? null : result.reason, verdict, graders, durationMs,
        usage: session?.usage ?? null, cost: cost === null ? null : { status: cost.status, attributedUsd: cost.attributedSubtotalUsd, unknownRequests: cost.unknownRequests } });
      options.onProgress?.(`${label} ${verdict}${result.ok ? "" : ` (${result.reason})`}`);
      if (!options.keepDirs) rmSync(attemptDir, { recursive: true, force: true });
    }
    tasks.push({ taskId: task.id, attempts: records, score: scoreTask(task.id, records.map((record) => record.verdict)) });
  }
  if (!options.keepDirs) rmSync(runRoot, { recursive: true, force: true });
  const summary = summarizeSuite(tasks.map((task) => task.score), durations);
  const results: EvalResults = { schema: EVAL_RESULTS_SCHEMA, runId, suiteId: suite.suiteId, suiteSha256: options.loaded.suiteSha256, suitePath: options.loaded.path, fixtures: fixtureDigests(options.loaded),
    provider: { providerId: options.provider.providerId, model: options.provider.model ?? null }, agentId, amcVersion, startedAt, endedAt: Date.now(), attemptsPerTask: options.attempts,
    graderMode: options.allowUnconfinedGraders ? "unsafe-unconfined-allowed" : "confined-or-refused", tasks,
    summary: { ...summary, cost: { attributedUsd: costComplete && summary.attempts > 0 ? costUsd : null, complete: costComplete && summary.attempts > 0, unknownRequests: unknownCostRequests } } };
  const json = JSON.stringify(results, null, 2);
  const resultsSha256 = sha256Hex(json);
  recordRun(options.workspace, results, resultsSha256);
  return { results, resultsSha256, json };
}
