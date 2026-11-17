/**
 * 2026-11-17 A4 walk, leg 2 (simulated hosting): Activate's readiness never read the release request's status, so the
 * panel only said "Open the Release card", an approver's Home never said the release request waited for them, and Home's
 * Next line said a second person approves the plan when it was approved. Readiness now reads the engine request's status
 * (APPROVAL_STATUS, as Assemble's and Adapt's second requests do); who may approve, and how many, are unchanged.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import * as start from "../../src/console/assets/a4Start.js";
import { approvalWaiting } from "../../src/console/assets/a4Who.js";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { a4, settled, type Who } from "./a4Harness.js";
import { ACTIVATE_ANSWERS, Journey } from "./a4Journey.js";

vi.setConfig({ testTimeout: 300_000 });
afterEach(() => { vi.unstubAllEnvs(); cleanupGovernanceFixtures(); });

describe("Activate's release request, as readiness reads it", () => {
  test("not opened, waiting for its approvers, approved, then released", async () => {
    const j = await Journey.start();
    await j.toActivate();
    await j.propose("activate", ACTIVATE_ANSWERS);
    const gate = await j.approve("activate", "direction");
    const release = () => j.item("release_effect", "activate");
    const readinessOf = async (who: Who) => (await j.p.get(who, "/readiness?stage=activate")).body.data as Record<string, unknown>;
    const project = { projectId: j.p.projectId, name: "P2-35 scenario", stage: "activate", step: "proposed" };
    const home = (who: { userId: string }, username: string) => approvalWaiting([project], { userId: who.userId, username },
      async (path: string) => (await a4(j.t.workspace, who, "GET", path)).body.data);

    expect(await release()).toMatchObject({ status: "WAITING", reasonCodes: ["EFFECT_GATE_NOT_OPEN"] });
    expect(start.releaseNext(project, await readinessOf(j.t.alice))).toContain("a project owner opens the release request");

    await j.openEffect("activate", "direction", gate, []);
    const pending = await release();
    expect(pending?.status).toBe("WAITING");
    expect(pending?.reasonCodes).toEqual(expect.arrayContaining(["EFFECT_GATE_OPENED", "APPROVAL_STATUS:PENDING"]));
    expect(start.releaseNext(project, await readinessOf(j.t.alice))).toBe("Next: the project's approvers approve the release request on the Release card.");
    // bob approves the release request from Home; alice, who asked for the plan's approval, does not.
    expect(await home(j.t.bob, "bob")).toEqual({ project, kind: "release" });
    expect(await home(j.t.alice, "alice")).toBeNull();

    const opened = (await j.transitions()).filter((link) => link.kind === "EFFECT_GATE_OPENED").at(-1)!;
    for (const who of [j.t.bob, j.t.owner]) expect((await j.engineDecide(who, opened.body)).status).toBeLessThan(300);
    const approved = await release();
    expect(approved?.status).toBe("READY");
    expect(approved?.reasonCodes).toContain("APPROVAL_STATUS:QUORUM_MET");
    expect(start.releaseNext(project, await readinessOf(j.t.alice))).toContain("a project owner releases it");
    expect(await home(j.t.bob, "bob")).toBeNull();

    expect((await j.p.post(j.t.alice, "/releases", { gateId: gate.gateId })).status).toBe(200);
    await settled();
    await j.p.sync();
    expect(await release()).toMatchObject({ status: "READY", reasonCodes: ["EFFECT_RECORDED"] });
  });
});

test("the panel names who acts on the release request, in words", () => {
  const ctx = (codes: string[], allowed: Record<string, unknown>, me = { userId: "u2", username: "second", roles: ["APPROVER"] }) => ({ stage: "activate",
    project: { projectId: "a4p_1", agentId: "helper", stage: "activate", step: "proposed", hold: false, members: [] },
    gates: [{ gateId: "g1", excludedKeys: ["LOCAL_USER:u1"] }], members: { candidates: [] }, questions: [], me, allowed,
    readiness: { status: "WAITING", allowed, gates: { direction: { gateId: "g1", status: "QUORUM_MET" } },
      items: [{ id: "release_effect", status: "WAITING", mandatory: false, acknowledged: null, nextAction: null, reasonCodes: codes }] } });
  const owner = { userId: "u1", username: "owner", roles: ["OWNER"] };
  const yes = { allowed: true, reasonCodes: [] }, no = { allowed: false, reasonCodes: ["PRINCIPAL_ROLE_INSUFFICIENT"] };
  const move = (c: unknown) => start.nextMove(c as never) as { now: string; act?: { label: string; press?: string; focus?: string; copy?: boolean } };
  expect(move(ctx(["EFFECT_GATE_NOT_OPEN"], { openEffect: yes, release: yes, requestChanges: yes }, owner)).act).toEqual({ label: "Open the release request", press: "open-release" });
  expect(move(ctx(["EFFECT_GATE_NOT_OPEN"], { openEffect: no, requestChanges: yes })).now).toContain("A project owner opens the release request next");
  const pending = ["EFFECT_GATE_OPENED", "APPROVAL_STATUS:PENDING", "APPROVAL_REQUEST:apprreq_1:d1", "GATE:g1"];
  expect(move(ctx(pending, { openEffect: no, requestChanges: yes })).now).toContain("The release request waits for your approval");
  expect(move(ctx(pending, { openEffect: no, requestChanges: yes })).act?.focus).toBe('[data-card="release"] [name="release-reason"]');
  expect(move(ctx(pending, { openEffect: yes, release: yes, requestChanges: yes }, owner)).now).toContain("Waiting for the project's approvers to approve the release request");
  expect(move(ctx(["EFFECT_GATE_OPENED", "APPROVAL_STATUS:QUORUM_MET"], { openEffect: yes, release: yes, requestChanges: yes }, owner)).act).toEqual({ label: "Release", press: "release" });
  expect(start.homeCardHtml({ waiting: { project: { projectId: "a4p_1", name: "Helper", stage: "activate" }, kind: "release" } as never }))
    .toContain("needs your approval on its release request");
});

test("the Release card's buttons give the reason that holds them now", async () => {
  const { register } = await import("../../src/console/assets/a4Activate.js");
  const { stageCards } = await import("../../src/console/assets/a4Cards.js");
  register();
  const cards = stageCards("activate") as unknown as Array<{ id: string; render: (ctx: unknown) => string }>;
  const render = cards.find((card) => card.id === "release")!.render;
  const yes = { allowed: true, reasonCodes: [] };
  const card = (codes: string[], direction = "QUORUM_MET") => render({ stage: "activate", project: { projectId: "a4p_1", agentId: "helper" }, me: { username: "owner" },
    allowed: { openEffect: yes, release: yes, requestChanges: yes }, stageRevision: { spec: {} },
    readiness: { gates: { direction: { gateId: "g1", status: direction } }, items: [{ id: "release_effect", reasonCodes: codes }] } });
  expect(card(["EFFECT_GATE_NOT_OPEN"], "PENDING")).toContain("The release approval does not have enough approvals yet");
  expect(card(["EFFECT_GATE_NOT_OPEN"])).toContain("Open the release request first");
  expect(card(["EFFECT_GATE_OPENED", "APPROVAL_STATUS:PENDING", "APPROVAL_REQUEST:apprreq_1:d1", "GATE:g1"])).toContain("The release request needs its approvals on this card first");
  const released = card(["EFFECT_RECORDED"], "CONSUMED"); // Release consumes the release approval
  expect(released).toContain("Done: this release is recorded");
  expect(released).not.toContain("The release approval does not have enough approvals");
});
