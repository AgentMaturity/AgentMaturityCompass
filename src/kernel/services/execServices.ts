/**
 * The process-execution substrate as a composed service (P4.2).
 *
 * `ctx.amcSubprocess` is the one place a process is spawned. A plugin that
 * declares `inject: ["amcSubprocess"]` stays PENDING until a host has composed
 * one, which is the point: the value of a single substrate is entirely in
 * there being no second way to spawn, so a consumer that could fall back to
 * `child_process` directly would take the guarantees with it.
 *
 * WHAT DISPOSAL DOES, AND WHY IT IS NOT NOTHING. Unlike the approval and tool
 * seams, this one owns live operating-system resources. Every process started
 * through it is tracked, and disposal terminates each with reason "dispose".
 * A fiber that goes away while its children keep running is precisely the
 * orphan the substrate exists to prevent — and since `detached: true` puts each
 * child in its own process group, an un-terminated child does not even die
 * with the terminal.
 *
 * This module lives under src/kernel/ because it imports workspace packages
 * the published npm tarball does not contain; the architecture-boundaries gate
 * enforces that placement.
 */
import { AmcSeam, defineSeam } from "@amc/core";
import type { Context } from "@amc/cordis";
import { runProcess, type RunningProcess } from "../../exec/runProcess.js";
import type { ProcessOutcome, ProcessSpec } from "../../exec/processTypes.js";

export const SUBPROCESS_SEAM = defineSeam("amcSubprocess");

export class SubprocessSeamService extends AmcSeam {
  private readonly live = new Set<RunningProcess>();

  constructor(ctx: Context) {
    super(ctx, SUBPROCESS_SEAM.name);
    this.track(() => () => this.terminateAll());
  }

  /** Start a process. The handle is tracked until it settles. */
  start(spec: ProcessSpec): RunningProcess {
    const running = runProcess(spec);
    this.live.add(running);
    void running.done.catch(() => undefined).finally(() => this.live.delete(running));
    return running;
  }

  /** Start and wait. The common case, kept short so callers do not re-invent it. */
  async run(spec: ProcessSpec): Promise<ProcessOutcome> {
    return this.start(spec).done;
  }

  /** Processes started here that have not settled yet. */
  get liveCount(): number {
    return this.live.size;
  }

  private terminateAll(): void {
    for (const running of this.live) running.terminate("dispose");
  }
}

/**
 * Registers the subprocess substrate.
 *
 * No configuration: this seam applies no defaults, so there is nothing for a
 * host to set. Every disposition, bound and grace lives on the spec, which is
 * what stops per-caller policy from growing back.
 */
export const execServices = {
  name: "amc-exec-services",
  apply(ctx: Context): void {
    ctx.plugin(SubprocessSeamService);
  }
};
