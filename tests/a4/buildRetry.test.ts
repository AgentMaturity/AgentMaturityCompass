/**
 * 2026-11-17 A4 walk, project 1: Build ran while storage admission held every session, the step was recorded as built and
 * the journaled build session failed before the runtime opened it. Nothing on the page could build again: Build answered
 * A4_STEP_ORDER (it followed direction_approved only), Request changes needs an open gate (none exists at built), resume
 * needs a session, and "Start it again" repeats the same request id, which only answers the failed task. A build session
 * that never started now lets its owner press Build again, under every check a first Build runs.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { buildRetryAllowed, reviewRefusals } from "../../src/a4/assembleBuild.js";
import * as start from "../../src/console/assets/a4Start.js";
import { stepOffer } from "../../src/console/assets/a4View.js";
import { NativeTaskServiceError } from "../../src/studio/nativeTaskTypes.js";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { refusal } from "./a4Harness.js";
import { ASSEMBLE_ANSWERS, Journey } from "./a4Journey.js";

// The first build session fails before its runtime opens a session (as a held start did); every later one opens.
const fake = vi.hoisted(() => ({ starts: 0, views: new Map<string, Record<string, unknown>>() }));
vi.mock("../../src/studio/nativeTaskService.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/studio/nativeTaskService.js")>();
  const { nativeTaskId } = await import("../../src/studio/nativeTaskDescriptors.js");
  const { NativeTaskServiceError: NotFound } = await import("../../src/studio/nativeTaskTypes.js");
  return { ...actual, createNativeTaskService: (options: Parameters<typeof actual.createNativeTaskService>[0]) => {
    const service = actual.createNativeTaskService(options);
    return { ...service,
      start: async (actor: { principalId: string }, body: Record<string, unknown>) => {
        const failed = fake.starts++ === 0;
        const view = { taskId: nativeTaskId(actor.principalId, String(body.clientRequestId)), clientRequestId: body.clientRequestId, agentId: body.agentId,
          provider: body.provider, model: body.model ?? null, tools: body.tools, toolsDigest: body.toolsDigest ?? null, validationSelection: body.validation ?? null,
          maxSteps: body.maxSteps, maxTokens: body.maxTokens, state: failed ? "failed" : "idle", sessionId: failed ? null : "session-retry", canResume: false,
          error: failed ? "Native startup did not finish." : null };
        fake.views.set(view.taskId, view);
        return view;
      },
      poll: (_actor: unknown, taskId: string) => {
        const task = fake.views.get(taskId);
        if (task === undefined) throw new NotFound("TASK_NOT_FOUND", 404, "Native task not found.");
        return { task };
      } };
  } };
});

vi.setConfig({ testTimeout: 180_000 });
afterEach(() => { vi.unstubAllEnvs(); cleanupGovernanceFixtures(); });

describe("which build sessions Build may run again", () => {
  const planned = { planTaskId: "p1", taskId: "t1", ownerKey: "LOCAL_USER:u1", ownerUsername: "owner",
    start: { clientRequestId: "c1", agentId: "helper", provider: "stub", model: null, tools: "none", toolsDigest: null, validation: null, maxSteps: 8, maxTokens: 1024 } };
  const state = { project: { stage: "assemble", step: "built", agent_id: "helper" },
    revisions: [{ stage: "assemble", revision_no: 3, spec_json: JSON.stringify({ build: { sessions: [planned] } }) }] };
  const native = (task: Record<string, unknown> | null) => ({ principalId: "session:u1", demo: false, service: { poll: () => {
    if (task === null) throw new NativeTaskServiceError("TASK_NOT_FOUND", 404, "Native task not found.");
    return { task: { clientRequestId: "c1", agentId: "helper", provider: "stub", model: null, tools: "none", toolsDigest: null, validationSelection: null,
      maxSteps: 8, maxTokens: 1024, canResume: false, ...task } };
  } } });
  const owner = { key: "LOCAL_USER:u1" };
  const codes = (task: Record<string, unknown> | null, workspace = "no-workspace", who = owner) => reviewRefusals(native(task) as never, state as never, who as never, workspace);

  test("one that failed before its session opened, or never started: yes; one that ran, or someone else's: no", () => {
    expect(codes({ state: "failed", sessionId: null })).toEqual(["BUILD_FAILED", "BUILD_RETRYABLE"]);
    expect(codes(null)).toEqual(["BUILD_FAILED", "BUILD_RETRYABLE"]);
    expect(codes({ state: "failed", sessionId: "s1" })).toEqual(["BUILD_FAILED"]);
    expect(codes({ state: "failed", sessionId: "s1", canResume: true })).toEqual(["BUILD_FAILED"]);
    expect(codes({ state: "idle", sessionId: "s1" })).toEqual(["BUILD_SESSION_OPEN"]);
    expect(codes({ state: "failed", sessionId: null }, "no-workspace", { key: "LOCAL_USER:u2" })).toEqual(["SESSION_OWNER_REQUIRED"]);
    expect(buildRetryAllowed(native({ state: "failed", sessionId: null }) as never, state as never, owner as never, "no-workspace")).toBe(true);
    expect(buildRetryAllowed(native({ state: "failed", sessionId: "s1" }) as never, state as never, owner as never, "no-workspace")).toBe(false);
  });

  test("while storage admission holds every session, the hold is named and Build may still be pressed (it refuses before writing)", () => {
    const ws = mkdtempSync(join(tmpdir(), "amc-build-retry-")), checkpoints = mkdtempSync(join(tmpdir(), "amc-build-retry-checkpoints-"));
    try {
      vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", checkpoints);
      mkdirSync(join(ws, ".amc", "residency"), { recursive: true });
      writeFileSync(join(ws, ".amc", "residency", "destinations.yaml"), "schemaVersion: amc.residency-destinations/v1\n"); // no signature
      expect(codes({ state: "failed", sessionId: null }, ws)).toEqual(["NATIVE_RESIDENCY_REFUSED", "BUILD_RETRYABLE"]);
      expect(codes({ state: "failed", sessionId: "s1" }, ws)).toEqual(["NATIVE_RESIDENCY_REFUSED"]);
    } finally {
      for (const dir of [ws, checkpoints]) rmSync(dir, { recursive: true, force: true });
    }
  });
});

test("the page offers Build again, enabled at Build, and names the hold first while it lasts", () => {
  const ctx = (codes: string[]) => ({ stage: "assemble", project: { projectId: "a4p_1", agentId: "helper", stage: "assemble", step: "built", hold: false, members: [] },
    gates: [], members: { candidates: [] }, me: { userId: "u1", username: "owner", roles: ["OWNER"] }, questions: [], readiness: { status: "WAITING", items: [], gates: {}, allowed: {} },
    stageRevision: { spec: { build: { sessions: [{ taskId: "t1", ownerUsername: "owner", start: { agentId: "helper" } }] } } },
    allowed: { build: { allowed: true, reasonCodes: [] }, review: { allowed: false, reasonCodes: codes } } });
  const retry = start.nextMove(ctx(["BUILD_FAILED", "BUILD_RETRYABLE"]) as never) as { now: string; act?: { label: string; press?: string } };
  expect(retry.act).toEqual({ label: "Build again", press: "build" });
  expect(retry.now).not.toMatch(/request changes|resume/i);
  const held = start.nextMove(ctx(["NATIVE_RESIDENCY_REFUSED", "BUILD_RETRYABLE"]) as never) as { now: string; act?: { label: string; press?: string } };
  expect(held.now).toContain("amc residency init --file");
  expect(held.now).toContain("press Build again");
  expect(held.act?.press).toBe("build");
  expect(stepOffer({ allowed: true, reasonCodes: [] }, ctx(["BUILD_FAILED", "BUILD_RETRYABLE"]) as never, "build")).toEqual({ allowed: true, reasonCodes: [] });
  expect(stepOffer({ allowed: true, reasonCodes: [] }, ctx(["BUILD_SESSION_OPEN"]) as never, "build").allowed).toBe(false);
  // Before the first Build, a hold already in force is named first (Studio's residencyHeld on the project).
  const first = ctx([]);
  const before = start.nextMove({ ...first, project: { ...first.project, step: "direction_approved", residencyHeld: "registry_missing" } } as never) as { now: string };
  expect(before.now).toMatch(/^First: AMC holds every new session .+ amc residency init --file <registry\.yaml>\. Until then Studio refuses Build and writes nothing\. Build: /);
});

test("a build whose session failed at startup is built again from the A4 page's Build, by its owner", async () => {
  const j = await Journey.start();
  await j.throughAspire();
  const { alice } = j.t;
  const answers = Object.entries({ ...ASSEMBLE_ANSWERS, path: "native" }).map(([questionId, value]) => ({ questionId, value }));
  for (const tail of ["answers", "understand", "answers", "understand"]) await j.p.ok(alice, `/stages/assemble/${tail}`, tail === "answers" ? { answers } : {});
  await j.p.ok(alice, "/stages/assemble/confirm-understanding", { confirmed: true });
  await j.p.ok(alice, "/stages/assemble/explain", { level: "practitioner" });
  await j.p.ok(alice, "/stages/assemble/propose", { spec: {} });
  expect((await j.complete("assemble", await j.approve("assemble", "direction"))).status).toBe(200);

  const first = await j.p.ok(alice, "/stages/assemble/build");
  const failed = (first.body.data!.sessions as Array<{ taskId: string; state: string; sessionId: string | null }>)[0]!;
  expect(failed).toMatchObject({ state: "failed", sessionId: null });
  const allowed = (await j.p.get(alice, "/readiness?stage=assemble")).body.data!.allowed as Record<string, { reasonCodes: string[] }>;
  expect(allowed.review!.reasonCodes).toEqual(expect.arrayContaining(["BUILD_FAILED", "BUILD_RETRYABLE"]));

  const again = await j.p.post(alice, "/stages/assemble/build");
  expect(again.status).toBe(201);
  const retried = (again.body.data!.sessions as Array<{ taskId: string; state: string; sessionId: string | null }>)[0]!;
  expect(retried.taskId).not.toBe(failed.taskId);
  expect(retried).toMatchObject({ state: "idle", sessionId: "session-retry" });
  expect((await j.p.get(alice)).body.data).toMatchObject({ stage: "assemble", step: "built" });
  // Once a session opened, Build at built is the step order again.
  expect(refusal(await j.p.post(alice, "/stages/assemble/build"))).toEqual([409, "A4_STEP_ORDER"]);
});

test("Build while storage admission holds every session is refused in words with its codes, and writes nothing; Build works once the hold ends", async () => {
  fake.starts = 1; // this test's sessions open
  const j = await Journey.start();
  await j.throughAspire();
  const { alice } = j.t;
  const answers = Object.entries({ ...ASSEMBLE_ANSWERS, path: "native" }).map(([questionId, value]) => ({ questionId, value }));
  for (const tail of ["answers", "understand", "answers", "understand"]) await j.p.ok(alice, `/stages/assemble/${tail}`, tail === "answers" ? { answers } : {});
  await j.p.ok(alice, "/stages/assemble/confirm-understanding", { confirmed: true });
  await j.p.ok(alice, "/stages/assemble/explain", { level: "practitioner" });
  await j.p.ok(alice, "/stages/assemble/propose", { spec: {} });
  expect((await j.complete("assemble", await j.approve("assemble", "direction"))).status).toBe(200);

  const residency = join(j.t.workspace, ".amc", "residency");
  mkdirSync(residency, { recursive: true });
  writeFileSync(join(residency, "destinations.yaml"), "schemaVersion: amc.residency-destinations/v1\n"); // no signature: held
  const graphs = join(j.t.workspace, ".amc", "fleet", "typed-graphs");
  const before = { head: (await j.p.get(alice)).body.data, graphs: existsSync(graphs) ? readdirSync(graphs, { recursive: true }).length : 0 };
  const refused = await j.p.post(alice, "/stages/assemble/build");
  expect(refusal(refused)).toEqual([409, "NATIVE_RESIDENCY_REFUSED"]);
  expect(refused.body.detail).toEqual({ reason: "registry_unverifiable", detail: "signature_missing" });
  expect(refused.body.error).toContain("the destination registry has no signature");
  expect(refused.body.error).toContain("amc residency init --file");
  expect(refused.body.error).not.toContain(j.t.workspace);
  const after = (await j.p.get(alice)).body.data!;
  expect({ headSeq: after.headSeq, step: after.step, revisionNo: after.revisionNo })
    .toEqual({ headSeq: before.head!.headSeq, step: "direction_approved", revisionNo: before.head!.revisionNo });
  expect(existsSync(graphs) ? readdirSync(graphs, { recursive: true }).length : 0).toBe(before.graphs);
  expect(existsSync(join(j.t.workspace, ".amc", "studio-native-tasks")) ? readdirSync(join(j.t.workspace, ".amc", "studio-native-tasks")) : []).toEqual([]);

  rmSync(residency, { recursive: true, force: true });
  const built = await j.p.post(alice, "/stages/assemble/build");
  expect(built.status).toBe(201);
  expect((built.body.data!.sessions as Array<{ sessionId: string | null }>)[0]).toMatchObject({ sessionId: "session-retry" });
});
