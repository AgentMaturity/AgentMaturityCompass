/**
 * The A4 project read carries Studio's words for a build session a residency check stopped (`buildRefusal`), read through
 * the real router; until 2026-11-19 this was seen working live only.
 */
import { afterEach, expect, test, vi } from "vitest";
import { residencyRouteWords } from "../../src/residency/admissionWords.js";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { ASSEMBLE_ANSWERS, Journey } from "./a4Journey.js";

const words = `${residencyRouteWords("provider", "destination_unregistered", "destination_unregistered")} No automatic retry was sent.`;
// Every build session opens, then its first model request is refused by a residency check (Studio's task error is the words).
const fake = vi.hoisted(() => ({ polls: 0, words: "", views: new Map<string, Record<string, unknown>>() }));
vi.mock("../../src/studio/nativeTaskService.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/studio/nativeTaskService.js")>();
  const { nativeTaskId } = await import("../../src/studio/nativeTaskDescriptors.js");
  const { NativeTaskServiceError: NotFound } = await import("../../src/studio/nativeTaskTypes.js");
  return { ...actual, createNativeTaskService: (options: Parameters<typeof actual.createNativeTaskService>[0]) => {
    const service = actual.createNativeTaskService(options);
    return { ...service,
      start: async (actor: { principalId: string }, body: Record<string, unknown>) => {
        const view = { taskId: nativeTaskId(actor.principalId, String(body.clientRequestId)), clientRequestId: body.clientRequestId, agentId: body.agentId,
          provider: body.provider, model: body.model ?? null, tools: body.tools, toolsDigest: body.toolsDigest ?? null, validationSelection: body.validation ?? null,
          maxSteps: body.maxSteps, maxTokens: body.maxTokens, state: "failed", sessionId: "session-refused", canResume: true, error: fake.words };
        fake.views.set(view.taskId, view);
        return view;
      },
      poll: (_actor: unknown, taskId: string) => {
        fake.polls += 1;
        const task = fake.views.get(taskId);
        if (task === undefined) throw new NotFound("TASK_NOT_FOUND", 404, "Native task not found.");
        return { task };
      } };
  } };
});
fake.words = words;

vi.setConfig({ testTimeout: 180_000 });
afterEach(() => { vi.unstubAllEnvs(); cleanupGovernanceFixtures(); });

test("the project read names the refused destination, why and the next step, for the session's owner only", async () => {
  const j = await Journey.start();
  await j.throughAspire();
  const { alice, bob } = j.t;
  const answers = Object.entries({ ...ASSEMBLE_ANSWERS, path: "native" }).map(([questionId, value]) => ({ questionId, value }));
  for (const tail of ["answers", "understand", "answers", "understand"]) await j.p.ok(alice, `/stages/assemble/${tail}`, tail === "answers" ? { answers } : {});
  await j.p.ok(alice, "/stages/assemble/confirm-understanding", { confirmed: true });
  await j.p.ok(alice, "/stages/assemble/explain", { level: "practitioner" });
  await j.p.ok(alice, "/stages/assemble/propose", { spec: {} });
  expect((await j.complete("assemble", await j.approve("assemble", "direction"))).status).toBe(200);
  expect((await j.p.post(alice, "/stages/assemble/build")).status).toBe(201);

  const read = (await j.p.get(alice)).body.data!;
  expect(read).toMatchObject({ stage: "assemble", step: "built", buildRefusal: words });
  expect((await j.p.get(bob)).body.data!.buildRefusal).toBeNull();
});
