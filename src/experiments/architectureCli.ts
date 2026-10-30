import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import chalk from "chalk";
import { resolveAgentId } from "../fleet/paths.js";
import { createArchitectureSpec, parseArchitectureKind, quickArchitectureComparison, simulateProbeOutcomes, type ArchitectureSpecKind } from "./architectureExperiment.js";
import { runExecutedArchitectureExperiment, type ArchitectureArm } from "./architectureTrials.js";
import { experimentReportExitCode } from "./experimentCli.js";
import { ExperimentInputError } from "./experimentRunner.js";
import { providerTrialRunner, type TrialProviderSelection } from "./nativeTrialRunner.js";
import type { TrialLimits } from "./trialExecutor.js";

/** Terminal presentation of `amc experiment-architecture` (GAP-WP06): measured trials, or the refused/labelled simulation. */
function readArtifact(file: string, side: string): Buffer {
  try { return readFileSync(file); }
  catch (error) { throw new ExperimentInputError(`cannot read the ${side} architecture artifact ${file}: ${error instanceof Error ? error.message : String(error)}`); }
}

/** `amc experiment-architecture --execute-trials`: pin both artifacts now, execute them on the named model, print the bound report. */
async function architectureExecuteCommandCli(params: {
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

export interface ArchitectureCommandOptions {
  name: string;
  model: string;
  baselineFile: string;
  candidateFile: string;
  baselineKind: string;
  candidateKind: string;
  executeTrials?: boolean;
  casebook?: string;
  provider?: string;
  mode: string;
  maxSteps?: number;
  agent?: string;
}

function cliError(message: string): void {
  console.error(chalk.red(`Architecture comparison ERROR: ${message}`));
  process.exitCode = 1;
}

/** `amc experiment-architecture`: `--execute-trials` measures; otherwise refuse, unless the operator opted into a labelled simulation. */
export async function architectureCommandCli(opts: ArchitectureCommandOptions & { workspace: string; agentId?: string }, normalizeError: (error: unknown) => string): Promise<void> {
  let baselineKind: ArchitectureSpecKind, candidateKind: ArchitectureSpecKind;
  try { baselineKind = parseArchitectureKind(opts.baselineKind); candidateKind = parseArchitectureKind(opts.candidateKind); }
  catch (error) { cliError(normalizeError(error)); return; }
  if (opts.executeTrials) {
    // GAP-WP06: the measured path runs both pinned artifacts through the experiment trial executor and gate.
    if (!opts.casebook || !opts.provider) { cliError("--execute-trials requires --casebook and --provider"); return; }
    await architectureExecuteCommandCli({ workspace: opts.workspace, ...(opts.agentId === undefined ? {} : { agentId: opts.agentId }), name: opts.name, modelId: opts.model,
      casebookId: opts.casebook, mode: opts.mode as "supervise" | "sandbox", /* the runner refuses any other mode */
      baseline: { file: resolve(opts.workspace, opts.baselineFile), kind: baselineKind }, candidate: { file: resolve(opts.workspace, opts.candidateFile), kind: candidateKind },
      trial: { providerId: opts.provider, ...(opts.maxSteps === undefined ? {} : { maxSteps: opts.maxSteps }) } }, normalizeError);
    return;
  }
  // Without --execute-trials there is no real probe runner: refuse rather than report LCG-generated scores as a
  // measured comparison, unless the operator opts into a labelled simulation with exactly AMC_ARCHITECTURE_ALLOW_SIMULATED=1.
  if (process.env.AMC_ARCHITECTURE_ALLOW_SIMULATED !== "1") {
    console.error(chalk.yellow("Architecture comparison INCONCLUSIVE — no real probe runner is configured."));
    console.error(chalk.gray("This command previously reported deterministic pseudo-random scores, tokens and latencies as a measured comparison."));
    console.error(chalk.cyan("Use --execute-trials --casebook <id> --provider <id> for a measured comparison, or set AMC_ARCHITECTURE_ALLOW_SIMULATED=1 to run it explicitly as a simulation for pipeline testing."));
    process.exitCode = 3;
    return;
  }
  let baselineContent: string, candidateContent: string;
  try { baselineContent = readFileSync(opts.baselineFile, "utf-8"); candidateContent = readFileSync(opts.candidateFile, "utf-8"); }
  catch (error) { cliError(normalizeError(error)); return; }
  const { markdown } = quickArchitectureComparison({ name: opts.name, modelId: opts.model,
    baselineName: `Baseline (${opts.baselineFile})`, baselineKind, baselineContent, baselineDescription: `Loaded from ${opts.baselineFile}`,
    candidateName: `Candidate (${opts.candidateFile})`, candidateKind, candidateContent, candidateDescription: `Loaded from ${opts.candidateFile}`,
    probeRunner: simulateProbeOutcomes });
  console.log(markdown);
  console.log(chalk.yellow("Architecture comparison INCONCLUSIVE: simulated outcomes are not measured task results."));
  process.exitCode = 3;
}
