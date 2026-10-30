import { readFileSync } from "node:fs";
import chalk from "chalk";
import { resolveAgentId } from "../fleet/paths.js";
import { sha256Hex } from "../utils/hash.js";
import { createArchitectureExperiment, createArchitectureSpec, type ArchitectureExperiment, type ArchitectureSpec, type ArchitectureSpecKind } from "./architectureExperiment.js";
import { runExecutedExperimentAsync, type ExecutedTrialOptions } from "./executedExperiment.js";
import { experimentReportExitCode } from "./experimentCli.js";
import { createExperiment, ExperimentInputError, loadExperiment, setExperimentBaseline, setExperimentCandidate, workspaceConfigFile } from "./experimentRunner.js";
import { providerTrialRunner, type TrialProviderSelection } from "./nativeTrialRunner.js";
import type { TrialLimits } from "./trialExecutor.js";

/**
 * Measured architecture comparison (GAP-WP06). Each arm is an immutable architecture artifact pinned by its spec's
 * digest; both arms run through the WP04 trial executor on one declared model route over the casebook's held-out
 * cases, so the artifact is the only factor that differs. Results are the ordinary bound, sealed experiment report
 * with paired statistics, gated by `amc experiment gate`. The synchronous probe API stays simulated or unbound.
 */
export interface ArchitectureArm {
  /** The spec whose `artifactSha256` pins the bytes this arm may run. */
  readonly spec: ArchitectureSpec;
  /** A workspace file (outside .amc) holding those bytes; the candidate's needs an auditor signature beside it. */
  readonly file: string;
}

function pinnedArmPath(workspace: string, side: string, arm: ArchitectureArm): string {
  const real = workspaceConfigFile(workspace, arm.file);
  if (sha256Hex(readFileSync(real)) !== arm.spec.artifactSha256) {
    throw new ExperimentInputError(`the ${side} architecture artifact changed: its bytes no longer hash to the pinned ${arm.spec.artifactSha256}`);
  }
  return real;
}

/**
 * Execute a controlled architecture comparison as a bound experiment.
 *
 * @throws before any execution when the arms declare different models, an arm's bytes no longer match its pinned
 * digest, the candidate is not signed, or the executor refuses the plan; and when an arm changes during the run.
 */
export async function runExecutedArchitectureExperiment(params: {
  workspace: string;
  agentId?: string;
  name: string;
  casebookId: string;
  baseline: ArchitectureArm;
  candidate: ArchitectureArm;
  mode: "supervise" | "sandbox";
  trials: ExecutedTrialOptions;
}, options: { beforePublish?: () => void } = {}): Promise<Awaited<ReturnType<typeof runExecutedExperimentAsync>> & { experimentId: string; architecture: ArchitectureExperiment }> {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  // The same-model guard compares declared request identities; the trial route then runs that one model for both arms.
  const architecture = createArchitectureExperiment({ name: params.name, baselineSpec: Object.freeze({ ...params.baseline.spec }),
    candidateSpec: Object.freeze({ ...params.candidate.spec }), probes: [] });
  const baselinePath = pinnedArmPath(params.workspace, "baseline", params.baseline);
  const candidatePath = pinnedArmPath(params.workspace, "candidate", params.candidate);
  const { experimentId } = createExperiment({ workspace: params.workspace, agentId, name: `architecture: ${params.name}`, casebookId: params.casebookId });
  setExperimentBaseline({ workspace: params.workspace, agentId, experimentId, config: { path: baselinePath } });
  setExperimentCandidate({ workspace: params.workspace, agentId, experimentId, candidateFile: candidatePath });
  const admitted = loadExperiment(params.workspace, agentId, experimentId).experiment;
  if (admitted.baselineConfig.digestSha256 !== params.baseline.spec.artifactSha256 || admitted.candidateConfig?.digestSha256 !== params.candidate.spec.artifactSha256) {
    throw new ExperimentInputError("an architecture artifact changed while it was being admitted");
  }
  // The executor re-reads both admitted digests before every execution and refuses the run if either changes.
  const out = await runExecutedExperimentAsync({ workspace: params.workspace, agentId, experimentId, mode: params.mode, trials: params.trials }, options);
  return { ...out, experimentId, architecture: { ...architecture, status: "COMPLETED" } };
}

function readArtifact(file: string, side: string): Buffer {
  try { return readFileSync(file); }
  catch (error) { throw new ExperimentInputError(`cannot read the ${side} architecture artifact ${file}: ${error instanceof Error ? error.message : String(error)}`); }
}

/** `amc experiment-architecture --execute-trials`: pin both artifacts now, execute them on the named model, print the bound report. */
export async function architectureExecuteCommandCli(params: {
  workspace: string;
  agentId?: string;
  name: string;
  modelId: string;
  casebookId: string;
  mode: "supervise" | "sandbox";
  baseline: { file: string; kind: ArchitectureSpecKind };
  candidate: { file: string; kind: ArchitectureSpecKind };
  trial: Omit<TrialProviderSelection, "model"> & { limits?: Partial<TrialLimits> };
}, normalizeError: (error: unknown) => string): Promise<void> {
  try {
    const agentId = resolveAgentId(params.workspace, params.agentId);
    const arm = (side: "baseline" | "candidate", input: { file: string; kind: ArchitectureSpecKind }): ArchitectureArm => ({ file: input.file,
      spec: createArchitectureSpec({ name: `${side} (${input.file})`, kind: input.kind, modelId: params.modelId, artifactContent: readArtifact(input.file, side), description: `Loaded from ${input.file}` }) });
    const { limits, ...selection } = params.trial;
    let runner: ReturnType<typeof providerTrialRunner>;
    try { runner = providerTrialRunner(params.workspace, agentId, { ...selection, model: params.modelId }); }
    catch (error) { throw new ExperimentInputError(error instanceof Error ? error.message : String(error)); }
    if (!runner.executorIdentity.endsWith(`/${params.modelId}`)) throw new ExperimentInputError(`the trial route runs ${runner.executorIdentity}, not the declared model ${params.modelId}`);
    const out = await runExecutedArchitectureExperiment({ workspace: params.workspace, agentId, name: params.name, casebookId: params.casebookId,
      baseline: arm("baseline", params.baseline), candidate: arm("candidate", params.candidate), mode: params.mode,
      trials: { ...runner, ...(limits === undefined ? {} : { limits }) } });
    for (const spec of [out.architecture.baselineSpec, out.architecture.candidateSpec]) console.log(`${spec.name}: ${spec.kind} sha256=${spec.artifactSha256}`);
    const exitCode = experimentReportExitCode(out.report);
    console.log({ 0: chalk.green("Architecture comparison PASSED (measured)"), 1: chalk.red("Architecture comparison FAILED (measured)"),
      3: chalk.yellow("Architecture comparison INCONCLUSIVE (measured)") }[exitCode]);
    console.log(`Experiment run recorded: ${out.report.runId}`);
    console.log(`experiment=${out.experimentId}`);
    console.log(`json=${out.jsonPath}`);
    console.log(`md=${out.mdPath}`);
    console.log(`Promotion: amc experiment gate --experiment ${out.experimentId} --policy <policy.json>`);
    process.exitCode = exitCode;
  } catch (error) {
    console.error(chalk.red(`Architecture comparison ERROR: ${normalizeError(error)}`));
    process.exitCode = 1;
  }
}
