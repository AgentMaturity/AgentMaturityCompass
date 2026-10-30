/**
 * Composed by src/agent/agentToolset.ts for governed native background jobs.
 * The session toolset and this facade share one registry and cleanup lifetime.
 *
 * Background jobs as a composed service (P4.2).
 *
 * `ctx.amcJobs` is where work outlives the turn that started it. A plugin that
 * declares `inject: ["amcJobs"]` stays PENDING until a host has composed one,
 * because a loop that could not find the registry would have to keep its own
 * handle on a running promise — and a job nobody can enumerate, fence or kill
 * is the thing this seam exists to make impossible.
 *
 * WHAT DISPOSAL DOES. Requests every owned producer to stop and awaits bounded
 * observed cleanup. shutdown() acknowledges physical cleanup explicitly; Cordis
 * fiber disposal alone is not proof that every producer exited.
 *
 * This module lives under src/kernel/ because it imports workspace packages
 * the published npm tarball does not contain; the architecture-boundaries gate
 * enforces that placement.
 */
import { AmcSeam, defineSeam } from "../amcRuntime.js";
import type { Context } from "../amcRuntime.js";
import { JobRegistry, type JobSettledListener } from "../../jobs/jobRegistry.js";
import type { JobId, JobOutcome, JobSnapshot, JobSpec } from "../../jobs/jobTypes.js";

export const JOBS_SEAM = defineSeam("amcJobs");

export interface JobServiceConfig {
  /** Consecutive turns a completion may open on one owner. */
  readonly wakeBudget?: number;
  /** Share the registry used by this session's governed tools. */
  readonly registry?: JobRegistry;
}

export class JobSeamService extends AmcSeam {
  private readonly registry: JobRegistry;
  private shutdownTask: Promise<boolean> | undefined;
  private cleanupState: boolean | null = null;

  constructor(ctx: Context, config: JobServiceConfig = {}) {
    super(ctx, JOBS_SEAM.name);
    this.registry = config.registry ?? new JobRegistry(config.wakeBudget ?? 3);
    ctx.effect(() => async () => { await this.shutdown(); }, "owned job cleanup");
  }

  /** The bounded shutdown acknowledgment; null until teardown settles, false means unconfirmed. */
  get cleanupConfirmed(): boolean | null { return this.cleanupState; }

  shutdown(): Promise<boolean> {
    if (this.shutdownTask) return this.shutdownTask;
    let finish!: (confirmed: boolean) => void;
    // Reserve before abort/settlement listeners can synchronously re-enter teardown.
    this.shutdownTask = new Promise<boolean>(resolve => { finish = resolve; });
    void this.registry.disposeAll().then(snapshots => {
      this.cleanupState = snapshots.every(snapshot => snapshot.cleanup === "confirmed");
      finish(this.cleanupState);
    }, () => { this.cleanupState = false; finish(false); });
    return this.shutdownTask;
  }

  start(spec: JobSpec): JobId {
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

  async disposeOwner(owner: string): Promise<JobSnapshot[]> {
    return this.registry.disposeOwner(owner);
  }
}

export const jobServices = {
  name: "amc-job-services",
  apply(ctx: Context, config: JobServiceConfig = {}): void {
    ctx.plugin(JobSeamService, config);
  }
};
