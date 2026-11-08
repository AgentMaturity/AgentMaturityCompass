import { parallelWithin, runWorkflowPlan, type WorkflowRunResult } from "./workflowRunner.js";
import type { WorkflowNode } from "./workflowPlan.js";
import type { AgentDefinition } from "../agent/agentDefinitions.js";
import type { DelegationIdentity } from "../agent/delegationIdentity.js";
import type { DelegationRecorder, SubagentRunner } from "../agent/subagentSpawn.js";
import type { ActionClass } from "../types.js";

/**
 * A headless workflow pass (SH-ORCH-03): the kernel composes the root session
 * exactly as for a goal-rounds pass — same principal, second-writer and
 * stop-condition checks, same composed driver runner — then runs a REVIEWED
 * plan instead of a model turn. Nothing a model turn would consume is admitted:
 * no prompt, no audio, no images, no foreign delegate, no schedule.
 *
 * The admission for both non-model passes lives here rather than in the kernel
 * so the kernel gains one call, not a second copy of the goal-rounds rules.
 */

export interface WorkflowPassOptions {
  readonly plan: WorkflowNode;
  /** Resume this run's durable progress in the named (unsealed) session. */
  readonly runId?: string;
  readonly definitions?: ReadonlyMap<string, AgentDefinition>;
  readonly signal?: AbortSignal;
}

interface NonModelPassOptions {
  readonly goalRounds?: { readonly maxRounds: number };
  readonly workflowPass?: WorkflowPassOptions;
  readonly delegation?: { readonly runner?: unknown; readonly maxActiveChildren?: number };
  readonly schedulePass?: unknown;
  readonly audioParts?: unknown;
  readonly prompt: string;
}

/** Throws before any session row when a goal-rounds or workflow pass is asked for under the wrong composition. */
export function assertNonModelPassAdmission(options: NonModelPassOptions, imageCount: number): void {
  if (options.goalRounds !== undefined && options.workflowPass !== undefined) {
    throw new Error("Goal rounds and a workflow pass are different passes; choose one.");
  }
  if (options.goalRounds !== undefined) {
    if (options.delegation?.maxActiveChildren !== undefined) {
      throw new Error("Configured --max-active-children root child limits are not supported for --goal-rounds; no execution occurred.");
    }
    const { maxRounds } = options.goalRounds;
    if (options.delegation === undefined || options.delegation.runner !== undefined || options.schedulePass !== undefined
      || options.audioParts !== undefined || imageCount > 0 || options.prompt.trim() === "") {
      throw new Error("Goal rounds need a text goal and in-process delegation (--delegate with workspace tools); schedules, audio, images and foreign delegates are not goal rounds.");
    }
    if (!Number.isSafeInteger(maxRounds) || maxRounds < 1 || maxRounds > 100) throw new Error("Goal rounds must be an integer from 1 through 100.");
  }
  if (options.workflowPass !== undefined) {
    if (options.delegation === undefined || options.delegation.runner !== undefined || options.schedulePass !== undefined
      || options.audioParts !== undefined || imageCount > 0 || options.prompt !== "") {
      throw new Error("A workflow pass runs a reviewed plan under in-process delegation (--delegate with workspace tools) and takes no prompt, audio or images; schedules and foreign delegates are not workflow passes.");
    }
    if (options.workflowPass.signal?.aborted) throw new Error("Workflow pass cancelled before composition.");
  }
}

export interface WorkflowPassInit {
  readonly workspace: string;
  readonly parent: DelegationIdentity;
  readonly session: DelegationRecorder;
  readonly runner: SubagentRunner;
  readonly delegation: {
    readonly scope?: readonly ActionClass[];
    readonly stopConditions?: readonly string[];
    readonly maxDepth?: number;
    readonly maxActiveChildren?: number;
  };
  readonly pass: WorkflowPassOptions;
}

/** Run the plan under the composed runner; every node is still a `spawnSubagent` with the operator's bounds. */
export function runWorkflowPass(init: WorkflowPassInit): Promise<WorkflowRunResult> {
  const { delegation, pass } = init;
  return runWorkflowPlan({
    workspace: init.workspace, plan: pass.plan, parent: init.parent, session: init.session, runner: init.runner,
    mintSessionId: () => `child-${crypto.randomUUID().slice(0, 12)}`,
    ...(pass.runId === undefined ? {} : { runId: pass.runId, resumeOnly: true }),
    ...(pass.definitions === undefined ? {} : { definitions: pass.definitions }),
    ...(pass.signal === undefined ? {} : { signal: pass.signal }),
    ...(delegation.scope === undefined ? {} : { delegationScope: delegation.scope }),
    ...(delegation.stopConditions === undefined ? {} : { stopConditions: delegation.stopConditions }),
    ...(delegation.maxDepth === undefined ? {} : { maxDepth: delegation.maxDepth }),
    // The plan's own scheduler stays inside the root-wide child cap, so parallel nodes queue instead of being refused at admission.
    ...(delegation.maxActiveChildren === undefined ? {} : { maxActiveChildren: delegation.maxActiveChildren, maxParallelAgents: parallelWithin(delegation.maxActiveChildren) })
  });
}
