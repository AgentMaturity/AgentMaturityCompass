import chalk from "chalk";
import type { ExperimentReport } from "../types.js";
import {
  analyzeExperiment,
  createExperiment,
  ExperimentInputError,
  gateExperiment,
  listExperiments,
  loadLatestExperimentRun,
  runExperiment, runExperimentAsync,
  setExperimentBaseline,
  setExperimentCandidate
} from "./experimentRunner.js";
import {
  listGovernedOptimizerRuns,
  loadGovernedOptimizerRun,
  writeGovernedOptimizerRun
} from "./governedOptimizer.js";

/** Task outcomes only; promotion still requires the experiment gate's separate policy checks. */
export function experimentReportExitCode(report: Pick<ExperimentReport, "cases">): 0 | 1 | 3 {
  if (report.cases.some(row => row.candidateStatus === "failed" || (row.candidateStatus === undefined && row.candidateSuccess === false))) return 1;
  if (report.cases.length === 0 || report.cases.some(row => row.candidateSuccess !== true || typeof row.baselineSuccess !== "boolean" ||
      row.candidateStatus === "unavailable" || row.baselineStatus === "unavailable" || row.paired === false)) return 3;
  return 0;
}

function printExperimentReportOutcome(operation: "run" | "analysis", report: ExperimentReport): 0 | 1 | 3 {
  const exitCode = experimentReportExitCode(report);
  const verdict = { 0: chalk.green(`Experiment ${operation} PASSED`), 1: chalk.red(`Experiment ${operation} FAILED`), 3: chalk.yellow(`Experiment ${operation} INCONCLUSIVE`) };
  console.log(verdict[exitCode]);
  return exitCode;
}

/** Terminal presentation stays separate from the API/Studio runner wrapper. */
export async function experimentRunCommandCli(params: Parameters<typeof experimentRunCliAsync>[0], normalizeError: (error: unknown) => string): Promise<void> {
  const out = await experimentRunCliAsync(params).catch((error: unknown) => {
    throw new Error(`Experiment run ERROR: ${normalizeError(error)}`, { cause: error });
  });
  const exitCode = printExperimentReportOutcome("run", out.report);
  console.log(`Experiment run recorded: ${out.report.runId}`);
  console.log(`json=${out.jsonPath}`);
  console.log(`md=${out.mdPath}`);
  process.exitCode = exitCode;
}

/** Analyze the same verified report and render task outcomes without changing the core return contract. */
export function experimentAnalyzeCommandCli(params: Parameters<typeof experimentAnalyzeCli>[0], normalizeError: (error: unknown) => string): void {
  let out: ReturnType<typeof experimentAnalyzeCli>;
  try {
    out = experimentAnalyzeCli(params);
  } catch (error: unknown) {
    throw new Error(`Experiment analysis ERROR: ${normalizeError(error)}`, { cause: error });
  }
  const exitCode = printExperimentReportOutcome("analysis", out.report);
  console.log(`Experiment analysis written: ${out.outFile ?? "none"}`);
  process.exitCode = exitCode;
}

export function experimentCreateCli(params: {
  workspace: string;
  agentId?: string;
  name: string;
  casebookId: string;
}) {
  return createExperiment(params);
}

export function experimentSetBaselineCli(params: {
  workspace: string;
  agentId?: string;
  experimentId: string;
  config: "current" | { path: string };
}) {
  return setExperimentBaseline(params);
}

export function experimentSetCandidateCli(params: {
  workspace: string;
  agentId?: string;
  experimentId: string;
  candidateFile: string;
}) {
  return setExperimentCandidate(params);
}

export function experimentRunCli(params: {
  workspace: string;
  agentId?: string;
  experimentId: string;
  mode: "supervise" | "sandbox";
  /** Evidence window covering the candidate configuration's own run. */
  candidateWindow?: string;
  candidateAgentId?: string;
}) {
  return runExperiment(params);
}

export async function experimentRunCliAsync(params: Parameters<typeof experimentRunCli>[0], options: { beforePublish?: () => void } = {}): Promise<ReturnType<typeof experimentRunCli>> {
  return await runExperimentAsync(params, options);
}

export function experimentAnalyzeCli(params: {
  workspace: string;
  agentId?: string;
  experimentId: string;
  outFile?: string;
}) {
  return analyzeExperiment(params);
}

export function experimentGateCli(params: {
  workspace: string;
  agentId?: string;
  experimentId: string;
  policyPath: string;
}) {
  return gateExperiment(params);
}

export function experimentListCli(params: { workspace: string; agentId?: string }) {
  return listExperiments(params);
}

export { ExperimentInputError };

export function experimentLatestRunCli(params: { workspace: string; agentId?: string; experimentId: string }) {
  return loadLatestExperimentRun(params);
}

export function experimentOptimizeCli(params: {
  workspace: string;
  agentId?: string;
  rcaSelector?: string;
}) {
  return writeGovernedOptimizerRun(params);
}

export function experimentOptimizerListCli(params: {
  workspace: string;
  agentId?: string;
  limit?: number;
  redacted?: boolean;
}) {
  return listGovernedOptimizerRuns(params);
}

export function experimentOptimizerShowCli(params: {
  workspace: string;
  agentId?: string;
  selector: string;
  redacted?: boolean;
}) {
  return loadGovernedOptimizerRun(params);
}
