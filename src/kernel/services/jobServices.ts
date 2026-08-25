/**
 * Background jobs as a composed service (P4.2).
 *
 * `ctx.amcJobs` is where work outlives the turn that started it. A plugin that
 * declares `inject: ["amcJobs"]` stays PENDING until a host has composed one,
 * because a loop that could not find the registry would have to keep its own
 * handle on a running promise — and a job nobody can enumerate, fence or kill
 * is the thing this seam exists to make impossible.
 *
 * WHAT DISPOSAL DOES. Settles every job with cause "owner-disposed" and aborts
 * its work. A fiber that goes away while its jobs keep running leaves work
 * nothing can reach: not the owner, who is gone, and not another session,
 * which the fence refuses.
 *
 * This module lives under src/kernel/ because it imports workspace packages
 * the published npm tarball does not contain; the architecture-boundaries gate
 * enforces that placement.
 */
import { AmcSeam, defineSeam } from "@amc/core";
import type { Context } from "@amc/cordis";
import { JobRegistry, type JobSettledListener } from "../../jobs/jobRegistry.js";
import type { JobId, JobOutcome, JobSnapshot, JobSpec } from "../../jobs/jobTypes.js";

export const JOBS_SEAM = defineSeam("amcJobs");

export interface JobServiceConfig {
  /** Consecutive turns a completion may open on one owner. */
  readonly wakeBudget?: number;
}

export class JobSeamService extends AmcSeam {
  private readonly registry: JobRegistry;
  private readonly owners = new Set<string>();

  constructor(ctx: Context, config: JobServiceConfig = {}) {
    super(ctx, JOBS_SEAM.name);
    this.registry = config.wakeBudget === undefined
      ? new JobRegistry()
      : new JobRegistry(config.wakeBudget);
    this.track(() => () => {
      for (const owner of this.owners) this.registry.disposeOwner(owner);
    });
  }

  start(spec: JobSpec): JobId {
    this.owners.add(spec.owner);
    return this.registry.start(spec);
  }

  get(id: JobId, caller: string): JobSnapshot {
    return this.registry.get(id, caller);
  }

  list(caller: string): JobSnapshot[] {
    return this.registry.list(caller);
  }

  kill(id: JobId, caller: string): void {
    this.registry.kill(id, caller);
  }

  wait(id: JobId, caller: string): Promise<JobOutcome> {
    return this.registry.wait(id, caller);
  }

  /** Settlement notices for one owner, bound to the calling fiber. */
  onSettled(owner: string, listener: JobSettledListener): void {
    const remove = this.registry.onSettled(owner, listener);
    this.ctx.effect(() => remove, `amcJobs listener ${owner}`);
  }

  /** Whether a completion may open a turn on this owner right now. */
  claimWake(owner: string): boolean {
    return this.registry.claimWake(owner);
  }

  /** Restores the wake budget. Only a host that saw a human message calls it. */
  acknowledge(owner: string): void {
    this.registry.acknowledge(owner);
  }

  disposeOwner(owner: string): void {
    this.registry.disposeOwner(owner);
    this.owners.delete(owner);
  }
}

export const jobServices = {
  name: "amc-job-services",
  apply(ctx: Context, config: JobServiceConfig = {}): void {
    ctx.plugin(JobSeamService, config);
  }
};
