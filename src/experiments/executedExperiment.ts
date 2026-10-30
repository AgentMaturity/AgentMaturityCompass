import { readFileSync } from "node:fs";
import { resolveAgentId } from "../fleet/paths.js";
import { casebookContentSha256, loadCasebook } from "../casebooks/casebookStore.js";
import { sha256Hex } from "../utils/hash.js";
import type { ExperimentExecution } from "../types.js";
import { admitExperimentCandidate, ExperimentInputError, loadExperiment, runExperimentAsync, workspaceConfigFile } from "./experimentRunner.js";
import type { LoopCandidateBinding } from "./loopCandidate.js";
import { buildHoldoutPartition } from "./holdoutPartition.js";
import { executeCaseTrials, type TrialBudgetHook, type TrialLimits, type TrialRunner } from "./trialExecutor.js";

export interface ExecutedTrialOptions {
  readonly runTrial: TrialRunner;
  /** Who executes the cases (e.g. `native:<provider>/<model>`); must differ from the judge identity. */
  readonly executorIdentity: string;
  readonly limits?: Partial<TrialLimits>;
  /** Whole-experiment budget envelope (WP28b); absent, only the trial limits bound the run. */
  readonly budget?: TrialBudgetHook;
}

/** Admitted configurations of both arms: the candidate's signed digest, and the baseline file whose digest prefix is its id. */
function admittedArms(workspace: string, experiment: ReturnType<typeof loadExperiment>, loop?: LoopCandidateBinding) {
  const { baselineConfig, candidateConfig } = experiment.experiment;
  if (!candidateConfig?.path || !candidateConfig.digestSha256 || !(candidateConfig.signatureValid || candidateConfig.kind === "improvement-candidate")) {
    throw new ExperimentInputError("executed trials require an admitted, signed candidate artifact");
  }
  const admission = admitExperimentCandidate(workspace, candidateConfig, loop);
  if (!admission.valid || admission.digestSha256 !== candidateConfig.digestSha256) {
    throw new ExperimentInputError(`candidate artifact is no longer the admitted one: ${admission.reason ?? "digest changed after admission"}`);
  }
  // Both arms' bytes reach the trial (and its model provider): each must be a workspace file outside .amc, by full digest.
  const candidatePath = workspaceConfigFile(workspace, candidateConfig.path);
  if (baselineConfig.kind !== "file" || !baselineConfig.path || !baselineConfig.digestSha256) {
    throw new ExperimentInputError("executed trials require a baseline configuration file pinned by its full digest (set it again with set-baseline)");
  }
  const baselinePath = workspaceConfigFile(workspace, baselineConfig.path);
  if (sha256Hex(readFileSync(baselinePath)) !== baselineConfig.digestSha256) throw new ExperimentInputError("baseline configuration changed after it was set");
  return [{ side: "baseline" as const, configPath: baselinePath, configDigest: baselineConfig.digestSha256 },
    { side: "candidate" as const, configPath: candidatePath, configDigest: candidateConfig.digestSha256 }] as const;
}

/** The experiment's frozen casebook partition (seeded by its id) and the held-out cases executed trials run on. */
export function experimentHoldout(workspace: string, agentId: string, experiment: ReturnType<typeof loadExperiment>) {
  const casebookId = experiment.experiment.casebookId;
  const caseIds = loadCasebook(workspace, casebookId, agentId).casebook.caseIds;
  const partition = buildHoldoutPartition({ population: caseIds.map((id) => ({ id, stratum: casebookId })), seed: experiment.experiment.experimentId });
  return { partition, heldOut: partition.strata.flatMap((row) => row.validationIds) };
}

/**
 * `amc experiment run --execute-trials`: execute the unchanged baseline and the admitted candidate over the casebook's
 * held-out split, then compute, seal and publish the bound report through the ordinary run path. The casebook
 * validators judge; the executor never receives them.
 */
export async function runExecutedExperimentAsync(params: {
  workspace: string;
  agentId?: string;
  experimentId: string;
  mode: "supervise" | "sandbox";
  trials: ExecutedTrialOptions;
  /** Set only by the improvement loop, from its verified journal; never from a request. */
  loopCandidate?: LoopCandidateBinding;
}, options: { beforePublish?: () => void } = {}): ReturnType<typeof runExperimentAsync> {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  if (params.mode !== "supervise" && params.mode !== "sandbox") throw new ExperimentInputError(`invalid experiment mode '${String(params.mode)}'; expected supervise or sandbox`);
  const experiment = loadExperiment(params.workspace, agentId, params.experimentId);
  const arms = admittedArms(params.workspace, experiment, params.loopCandidate);
  const casebookId = experiment.experiment.casebookId;
  const { partition, heldOut } = experimentHoldout(params.workspace, agentId, experiment);
  if (heldOut.length === 0) throw new ExperimentInputError("the casebook needs at least two cases to hold one out for executed trials");
  const judgeIdentity = `casebook-validators:${casebookContentSha256(params.workspace, casebookId, agentId).slice(0, 16)}`;
  if (!params.trials.executorIdentity.trim() || params.trials.executorIdentity === judgeIdentity) throw new ExperimentInputError("the trial executor needs an identity distinct from the judge");

  const executed = await executeCaseTrials({ workspace: params.workspace, agentId, casebookId, caseIds: heldOut, mode: params.mode, arms,
    runTrial: params.trials.runTrial, ...(params.trials.limits === undefined ? {} : { limits: params.trials.limits }),
    ...(params.trials.budget === undefined ? {} : { budget: params.trials.budget }) });
  const execution: ExperimentExecution = {
    method: "native-trials/1", partitionDigest: partition.digest, evaluatedSplit: "validation", caseIds: [...heldOut],
    executor: { identity: params.trials.executorIdentity }, judge: { identity: judgeIdentity },
    limits: { ...executed.limits }, executions: executed.executions.map((row) => ({ ...row }))
  };
  // A minute-granular window that covers every executed row; bound mode then counts only rows stamped by these trials.
  const candidateWindow = `${Math.ceil((Date.now() - executed.startedTs) / 60_000) + 1}m`;
  return await runExperimentAsync({ workspace: params.workspace, agentId, experimentId: params.experimentId, mode: params.mode, candidateWindow,
    baselineTrialId: executed.trials.baseline.trialId, candidateTrialId: executed.trials.candidate.trialId, execution,
    ...(params.loopCandidate === undefined ? {} : { loopCandidate: params.loopCandidate }) }, options);
}
