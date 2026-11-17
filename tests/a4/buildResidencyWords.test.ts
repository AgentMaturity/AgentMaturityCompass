/**
 * 2026-11-17: a build session whose model request a residency check refused said only "The build session did not finish"
 * on the A4 page; Studio's words (which destination, why, the next step) now reach it. And a second workspace owner read
 * "<owner> started the build session" for a session that never started: the sentence is now true either way.
 */
import { describe, expect, test } from "vitest";
import { buildSessionRefusal } from "../../src/a4/assembleBuild.js";
import * as start from "../../src/console/assets/a4Start.js";
import { residencyRouteWords } from "../../src/residency/admissionWords.js";
import { NativeTaskServiceError } from "../../src/studio/nativeTaskTypes.js";

const words = `${residencyRouteWords("provider", "destination_unregistered", "destination_unregistered")} No automatic retry was sent.`;
const planned = { taskId: "t1", ownerKey: "LOCAL_USER:u1", ownerUsername: "owner", start: { agentId: "helper" } };
const state = (step = "built") => ({ project: { stage: "assemble", step, agent_id: "helper" },
  revisions: [{ stage: "assemble", revision_no: 3, spec_json: JSON.stringify({ build: { sessions: [planned] } }) }] });
const native = (task: Record<string, unknown> | null) => ({ principalId: "session:u1", demo: false, service: { poll: () => {
  if (task === null) throw new NativeTaskServiceError("TASK_NOT_FOUND", 404, "Native task not found.");
  return { task };
} } });
const owner = { key: "LOCAL_USER:u1" };

describe("a build session a residency check stopped", () => {
  test("its owner's project read carries Studio's words; anything else carries none", () => {
    expect(buildSessionRefusal(native({ state: "failed", error: words }) as never, state() as never, owner as never)).toBe(words);
    expect(buildSessionRefusal(native({ state: "failed", error: "The native turn did not complete cleanly." }) as never, state() as never, owner as never)).toBeNull();
    expect(buildSessionRefusal(native(null) as never, state() as never, owner as never)).toBeNull();
    expect(buildSessionRefusal(native({ state: "failed", error: words }) as never, state() as never, { key: "LOCAL_USER:u2" } as never)).toBeNull();
    expect(buildSessionRefusal(native({ state: "failed", error: words }) as never, state("reviewed") as never, owner as never)).toBeNull();
    expect(buildSessionRefusal(undefined, state() as never, owner as never)).toBeNull();
  });
});

const ctx = (codes: string[], project: Record<string, unknown> = {}, username = "owner") => ({ stage: "assemble",
  project: { projectId: "a4p_1", agentId: "helper", stage: "assemble", step: "built", hold: false, members: [], ...project },
  gates: [], members: { candidates: [] }, me: { userId: "u1", username, roles: ["OWNER"] }, questions: [], readiness: { status: "WAITING", items: [], gates: {}, allowed: {} },
  stageRevision: { spec: { build: { sessions: [{ taskId: "t1", ownerUsername: "owner", start: { agentId: "helper" } }] } } },
  allowed: { build: { allowed: false, reasonCodes: [] }, review: { allowed: false, reasonCodes: codes } } });
const move = (value: unknown) => start.nextMove(value as never) as { now: string; act?: { label: string; href?: string } };

test("the A4 page says which destination was refused, why and the next step, then how to continue the session", () => {
  const stopped = move(ctx(["BUILD_FAILED"], { buildRefusal: words }));
  expect(stopped.now).toContain("The build session stopped. AMC's residency check refused a model provider request before it was sent: "
    + "the destination registry declares no model provider destination for that address.");
  expect(stopped.now).toContain("amc residency init --file <registry.yaml>");
  expect(stopped.now).toContain("Resume session");
  expect(stopped.act).toMatchObject({ label: "Open the build session" });
  expect(move(ctx(["BUILD_FAILED"])).now).toMatch(/^The build session did not finish\./);
});

test("a second owner is told what is true whether or not the build session started", () => {
  const second = move(ctx(["SESSION_OWNER_REQUIRED"], {}, "ana"));
  expect(second.now).toBe("owner pressed Build, and only they can see its build session. If it did not start, they press Build again; "
    + "if it ran, they close it and run Review.");
  expect(second.now).not.toMatch(/started the build session/);
  const unnamed = ctx(["SESSION_OWNER_REQUIRED"], {}, "ana");
  delete (unnamed.stageRevision.spec.build.sessions[0] as { ownerUsername?: string }).ownerUsername;
  expect(move(unnamed).now).toMatch(/^Only the person who pressed Build can see its build session\. If it did not start/);
});
