import { afterEach, describe, expect, it, vi } from "vitest";
import { JobRegistry } from "../src/jobs/jobRegistry.js";
import { jobTools, type JobToolsOptions } from "../src/jobs/jobTools.js";
import type { JobOutput, JobSnapshot } from "../src/jobs/jobTypes.js";
import { ToolPipeline, type ToolCallInput } from "../src/tools/toolPipeline.js";
import { ToolRegistry, defineTool } from "../src/tools/toolRegistry.js";
import { Context } from "../src/kernel/amcRuntime.js";
import { JOBS_SEAM, jobServices, type JobSeamService } from "../src/kernel/services/jobServices.js";
import { pipelineToolSeam } from "../src/agent/pipelineToolSeam.js";
import type { ToolCallRequest } from "../src/agent/toolSeam.js";

const ALICE = "session-alice";
const BOB = "session-bob";
const registries: JobRegistry[] = [];
const never = () => new Promise<{ ok: boolean; summary: string }>(() => undefined);
function fixture() {
  let owner = ALICE;
  let sequence = 0;
  const jobs = new JobRegistry({ cleanupGraceMs: 5 });
  registries.push(jobs);
  const registry = new ToolRegistry();
  const run = vi.fn<JobToolsOptions["run"]>(async () => ({ ok: true, summary: "complete", cleanupConfirmed: true, exitCode: 0 }));
  for (const tool of jobTools({ registry: jobs, sessionId: () => owner, ownerStep: execution => execution.ownerStep,
    run: (...args) => run(...args) })) registry.define(tool);
  // Test-only admission; production supplies the signed policy/approval/authorization guards.
  const pipeline = new ToolPipeline({ registry, workspace: "/tmp/amc-wp16-job-tools", authorizeClasses: new Set() });
  const call = (name: string, args: Record<string, unknown> = {}, extra: Partial<ToolCallInput> = {}) => {
    const callId = `call-${++sequence}`;
    return pipeline.execute({ name, arguments: args, agentId: "agent", requestedMode: "EXECUTE", callId,
      ownerStep: { sessionId: owner, turn: 1, step: 2, callId }, ...extra });
  };
  const start = async (args: Record<string, unknown> = {}) => {
    const outcome = await call("job_start", { command: "long operation", ...args });
    expect(outcome.ok, outcome.output).toBe(true);
    return JSON.parse(outcome.output) as JobSnapshot;
  };
  return { jobs, registry, pipeline, run, call, start, setOwner: (next: string) => { owner = next; } };
}
afterEach(async () => {
  for (const registry of registries.splice(0)) await registry.disposeAll();
});

describe("WP16 governed job tools", () => {
  it("requires the caller's trusted starting step and refuses model-provided owner identities", async () => {
    const { call, run, start, jobs } = fixture();
    expect(await call("job_start", { command: "work" }, { ownerStep: undefined })).toMatchObject({ ok: false,
      output: expect.stringContaining("trusted ownership") });
    expect(await call("job_start", { command: "work" }, { ownerStep: { sessionId: BOB, turn: 1, step: 2, callId: "forged" } }))
      .toMatchObject({ ok: false });
    expect(await call("job_start", { command: "work", owner: BOB })).toMatchObject({ ok: false });
    expect(run).not.toHaveBeenCalled();
    const job = await start();
    expect(job.ownerStep).toEqual({ sessionId: ALICE, turn: 1, step: 2, callId: expect.stringMatching(/^call-/) });
    await vi.waitFor(() => expect(jobs.get(job.id, ALICE).cleanup).toBe("confirmed"));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("publishes explicit successful simulation without invoking a producer or allocating a job", async () => {
    const { call, run, jobs } = fixture();
    expect(await call("job_start", { command: "unsafe" }, { requestedMode: "SIMULATE" }))
      .toMatchObject({ ok: true, effect: "not_applied" });
    expect(run).not.toHaveBeenCalled();
    expect(jobs.list(ALICE)).toEqual([]);
  });

  it("returns bounded partial output on finite waits without killing the producer", async () => {
    const { run, start, call, jobs } = fixture();
    let output!: (text: string) => void;
    let ownedSignal!: AbortSignal;
    run.mockImplementation((_execution, signal, emit) => {
      output = emit; ownedSignal = signal; emit("head"); return never();
    });
    const job = await start();
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    const initial = JSON.parse((await call("job_output", { job_id: job.id, max_bytes: 16 })).output) as JobOutput;
    expect(initial.segments.map(segment => segment.text).join("")).toBe("head");
    const waiting = call("job_output", { job_id: job.id, cursor: initial.totalBytes, wait: true, timeout_ms: 100, max_bytes: 16 });
    setTimeout(() => output("tail"), 2);
    const partial = JSON.parse((await waiting).output) as JobOutput;
    expect(partial.segments.map(segment => segment.text).join("")).toBe("tail");
    const timed = JSON.parse((await call("job_output", { job_id: job.id, cursor: partial.totalBytes, wait: true, timeout_ms: 5 })).output) as JobOutput;
    expect(timed.snapshot).toMatchObject({ status: "running", stopRequested: false, outcome: null });
    expect(ownedSignal.aborted).toBe(false);
    expect(jobs.hasOwnedWork(ALICE)).toBe(true);
  });

  it("keeps the list, output and kill fences identical for foreign and missing handles", async () => {
    const { run, start, call, setOwner } = fixture();
    run.mockImplementation((_execution, _signal, emit) => { emit("private output"); return never(); });
    const job = await start({ description: "private label" });
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    setOwner(BOB);
    expect(JSON.parse((await call("job_list")).output)).toEqual([]);
    for (const name of ["job_output", "job_kill"]) {
      const foreign = await call(name, { job_id: job.id });
      const missing = await call(name, { job_id: "missing" });
      expect(foreign.ok).toBe(false);
      expect(foreign.output.replace(job.id, "<id>")).toBe(missing.output.replace("missing", "<id>"));
      expect(foreign.output).not.toContain("private");
    }
  });

  it("can kill an owned background bash while that bash holds the same pipeline's write lock", async () => {
    const { registry, run, pipeline, start, call, jobs } = fixture();
    let bashEntered = false;
    let aborted = false;
    registry.define(defineTool({ name: "bash", actionClass: "WRITE_HIGH", description: "test confined producer",
      parameters: { type: "object", properties: {} }, body: execution => new Promise(resolve => {
        bashEntered = true;
        execution.signal!.addEventListener("abort", () => {
          aborted = true;
          resolve({ ok: false, output: "tree exited", effect: "applied" });
        }, { once: true });
      }) }));
    run.mockImplementation(async (execution, signal, emit) => {
      emit("running");
      const outcome = await pipeline.execute({ name: "bash", arguments: {}, agentId: execution.agentId,
        requestedMode: "EXECUTE", parentToken: execution.token, signal, ownerStep: execution.ownerStep });
      return { ok: outcome.ok, summary: outcome.output, cleanupConfirmed: true };
    });
    const job = await start();
    await vi.waitFor(() => expect(bashEntered).toBe(true));
    const killed = await call("job_kill", { job_id: job.id, reason: "stop this owned task" });
    expect(killed.ok, killed.output).toBe(true);
    expect(aborted).toBe(true);
    expect(JSON.parse(killed.output)).toMatchObject({ stopRequested: true, cleanup: "confirmed",
      outcome: { cause: "killed", outcome: "TOOL_OUTCOME_UNKNOWN" } });
    expect(jobs.hasOwnedWork(ALICE)).toBe(false);
  });

  it("reports unknown physical cleanup for a noncooperative producer and does not simulate a kill effect", async () => {
    const { run, start, call, jobs } = fixture();
    let signal!: AbortSignal;
    run.mockImplementation((_execution, ownedSignal) => { signal = ownedSignal; return never(); });
    const job = await start();
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(await call("job_kill", { job_id: job.id }, { requestedMode: "SIMULATE" }))
      .toMatchObject({ ok: true, effect: "not_applied" });
    expect(signal.aborted).toBe(false);
    const killed = await call("job_kill", { job_id: job.id });
    expect(killed).toMatchObject({ ok: false, effect: "unknown" });
    expect(JSON.parse(killed.output)).toMatchObject({ cleanup: "unknown", outcome: { outcome: "TOOL_OUTCOME_UNKNOWN" } });
    expect(signal.aborted).toBe(true);
    expect(jobs.hasOwnedWork(ALICE)).toBe(true);
  });

  it("preserves an unknown stop outcome when the turn aborts after cancellation dispatch", async () => {
    const { run, start, pipeline, registry, jobs } = fixture();
    const turn = new AbortController();
    run.mockImplementation((_execution, ownedSignal) => {
      ownedSignal.addEventListener("abort", () => turn.abort(), { once: true });
      return never(); // Cancellation was requested, but physical cleanup was never acknowledged.
    });
    const job = await start();
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    const seam = pipelineToolSeam({ registry, pipeline, agentId: "agent" });
    const request: ToolCallRequest = {
      callId: "kill-after-dispatch", toolName: "job_kill", rawArguments: JSON.stringify({ job_id: job.id }),
      sessionId: ALICE, turn: 1, step: 3, parentToken: null, dispatch: "native", signal: turn.signal
    };
    const outcome = await seam.execute(request);
    expect(turn.signal.aborted).toBe(true);
    expect(jobs.get(job.id, ALICE)).toMatchObject({ stopRequested: true, cleanup: "unknown" });
    expect(outcome).toMatchObject({ outcome: "TOOL_OUTCOME_UNKNOWN", denied: false });
  });

  it("rejects invalid limits and closes admission before invoking any later producer", async () => {
    const { call, run, jobs } = fixture();
    expect(await call("job_start", { command: "x", timeoutMs: 600_001 })).toMatchObject({ ok: false });
    expect(await call("job_output", { job_id: "missing", timeout_ms: 30_001 })).toMatchObject({ ok: false });
    expect(await call("job_output", { job_id: "missing", max_bytes: 64_001 })).toMatchObject({ ok: false });
    await jobs.disposeAll();
    expect(await call("job_start", { command: "too late" })).toMatchObject({ ok: false, output: expect.stringContaining("disposed") });
    expect(run).not.toHaveBeenCalled();
  });
});


describe("WP16 composed job service disposal", () => {
  it("reaps jobs started directly through the shared tool registry", async () => {
    const jobs = new JobRegistry({ cleanupGraceMs: 10 });
    registries.push(jobs);
    const ctx = new Context();
    const fiber = ctx.plugin(jobServices, { registry: jobs });
    await fiber.await();
    const service = (ctx as unknown as Record<string, JobSeamService>)[JOBS_SEAM.name]!;
    expect(service.cleanupConfirmed).toBeNull();
    let stopped = false;
    const id = jobs.start({ kind: "bash", owner: ALICE, label: "shared registry", run: signal => new Promise(resolve => {
      signal.addEventListener("abort", () => { stopped = true; resolve({ ok: false, summary: "exited", cleanupConfirmed: true }); }, { once: true });
    }) });
    await fiber.dispose();
    expect(service.cleanupConfirmed).toBe(true);
    expect(await service.shutdown()).toBe(true);
    expect(stopped).toBe(true);
    expect(jobs.get(id, ALICE).cleanup).toBe("confirmed");
    expect(jobs.hasOwnedWork(ALICE)).toBe(false);
    expect(() => jobs.start({ kind: "bash", owner: BOB, label: "late", run: never })).toThrow(/disposed/);
  });

  it("acknowledges unconfirmed cleanup explicitly even when Cordis fiber disposal resolves", async () => {
    const jobs = new JobRegistry({ cleanupGraceMs: 5 });
    registries.push(jobs);
    const ctx = new Context();
    const fiber = ctx.plugin(jobServices, { registry: jobs });
    await fiber.await();
    const service = (ctx as unknown as Record<string, JobSeamService>)[JOBS_SEAM.name]!;
    const id = jobs.start({ kind: "bash", owner: ALICE, label: "noncooperative", run: never });
    await fiber.dispose();
    expect(service.cleanupConfirmed).toBe(false);
    const acknowledgment = service.shutdown();
    expect(await acknowledgment).toBe(false);
    expect(service.shutdown()).toBe(acknowledgment);
    expect(jobs.get(id, ALICE)).toMatchObject({ cleanup: "unknown", stopRequested: true });
    expect(jobs.hasOwnedWork(ALICE)).toBe(true);
  });
});
