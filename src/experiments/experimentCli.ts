import {
  analyzeExperiment,
  createExperiment,
  gateExperiment,
  listExperiments,
  runExperiment,
  setExperimentBaseline,
  setExperimentCandidate
} from "./experimentRunner.js";
import {
  listGovernedOptimizerRuns,
  loadGovernedOptimizerRun,
  writeGovernedOptimizerRun
} from "./governedOptimizer.js";

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
}) {
  return runExperiment(params);
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
