import { readFileSync } from "node:fs";
import { resolveAgentId } from "../fleet/paths.js";
import { sha256Hex } from "../utils/hash.js";
import { createArchitectureExperiment, type ArchitectureExperiment, type ArchitectureSpec } from "./architectureExperiment.js";
import { runExecutedExperimentAsync, type ExecutedTrialOptions } from "./executedExperiment.js";
import { createExperiment, ExperimentInputError, loadExperiment, setExperimentBaseline, setExperimentCandidate, workspaceConfigFile } from "./experimentRunner.js";

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
