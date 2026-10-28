/**
 * P2-34: A4 as a consumer of P2-23's governed lifecycle and P2-26's regulatory runtime. The workspace is the owned P2-24
 * governance fixture (signed policies, a real vault, a real ledger); the A4 project is created through the store and,
 * where a case needs a deployed project, moved to Activate with a deployed release id by one fixture transition (the full
 * release and deploy-receipt flow is P2-35's scenario work). Live roles are OWNER by fiat; everything else is real.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("../../src/a4/a4Identity.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/a4/a4Identity.js")>()),
  liveRolesFor: () => ["OWNER"]
}));
// The active plan regime floors read. P2-26's own rule templates and floor arithmetic run on it; a setup file loads the
// plan reader before any mock, so the floor function is re-pointed at this plan rather than the reader mocked.
const active = vi.hoisted(() => ({ plan: null as { requirements: never } | null, throws: false }));
vi.mock("../../src/ops/retention/regimeRetention.js", async (original) => {
  const real = await original<typeof import("../../src/ops/retention/regimeRetention.js")>();
  return { ...real, regimeFloor: (_workspace: string, cls: "logs") => {
    if (active.throws) throw new real.RegimeRetentionRefused(["the active compiled plan could not be read (fixture)"]);
    return real.effectiveRetention(real.regimeRetentionRules(active.plan?.requirements ?? null)).minimums[cls] ?? null;
  } };
});

import { readinessFor, refuseOnFreeze, resumeProject, retireProject } from "../../src/a4/a4Gates.js";
import {
  A4_RUNTIME, packageVersionManifest, recordLifecycleActivation, syncRuntimeLifecycle
} from "../../src/a4/a4RuntimeLifecycle.js";
import { openA4Store, type A4Store } from "../../src/a4/a4Store.js";
import { a4PackageV1Schema } from "../../src/contracts/v1/a4Package.js";
import type { A4Principal } from "../../src/contracts/v1/a4Project.js";
import { LIFECYCLE_AUDIT, lifecycleEvents, lifecycleView, transitionAgent } from "../../src/lifecycle/governanceLifecycle.js";
import { admitNativeSession } from "../../src/lifecycle/reassessment.js";
import { manifestDigest } from "../../src/lifecycle/versionManifest.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { checkChangeEnvelopeAtOpen, type EnvelopeDecision } from "../../src/runtime/changeEnvelope.js";
import { activateKillSwitch, releaseKillSwitch } from "../../src/runtime/killSwitch.js";
import { cleanupGovernanceFixtures, governanceFixture } from "../governor/governanceFixture.js";
import { activate, AGENT, approvedMove, manifest, ownerActor, planView } from "../lifecycle/lifecycleFixture.js";

vi.setConfig({ testTimeout: 60_000 });
const stores: A4Store[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  active.plan = null;
  active.throws = false;
  cleanupGovernanceFixtures();
});

const owner = {
  key: "LOCAL_USER:owner", authSource: "LOCAL_USER", userId: "owner", username: "owner", roles: ["OWNER"], admission: "native_login_token",
  identityCheck: "users_yaml", provenance: { usersYamlSignerFingerprint: null, createdTs: null, createdBy: null }
} as unknown as A4Principal;
const RELEASE = "a4r_fixture_deployed";

function project(workspace: string, agentId = AGENT): { store: A4Store; projectId: string } {
  const store = openA4Store(workspace);
  stores.push(store);
  const created = store.createProject({ actor: owner, agentId, name: "P2-34 fixture", hostedRouter: false });
  if (created.replay) throw new Error("unexpected replay");
  return { store, projectId: created.projectId };
}

/** Fixture shortcut: the head at Activate with a deployed release, as a deploy receipt would leave it. */
function deployed(store: A4Store, projectId: string): void {
  store.transition(projectId, A4_RUNTIME, () => ({ kind: "STEP", payload: { fixture: "deployed release (P2-34 test)" },
    head: { stage: "activate", step: "completion_approved", deployed_release_id: RELEASE } }));
}

const tail = (store: A4Store, projectId: string, n: number) => store.readChain(projectId).slice(-n).map((link) => ({ kind: link.kind, actorKey: link.body.actorKey,
  automatic: link.body.automatic, toStage: link.body.toStage, baseReleaseId: link.body.baseReleaseId }));
const block = (changed: EnvelopeDecision["changed"]): EnvelopeDecision => ({ outcome: "block", envelopeId: "env_fixture", changed, reasons: ["prompt outside envelope env_fixture"], unpinned: false });

describe("runtime changes move a deployed project (P2-34)", () => {
  test("an envelope-covered change is a TUNE from the deployed release by amc-runtime, without reopening Adapt", async () => {
    const { workspace } = governanceFixture();
    await activate(workspace, ownerActor(workspace));
    const { store, projectId } = project(workspace);
    deployed(store, projectId);
    const envelope = () => ({ envelopeId: "env_fixture" });
    expect(admitNativeSession({ workspace, agentId: AGENT, manifest: () => manifest({ systemPromptSha256: "c".repeat(64) }), plan: planView(), envelope }).state).toBe("active");
    expect(syncRuntimeLifecycle(store, projectId)).not.toBeNull();
    expect(tail(store, projectId, 2)).toEqual([
      expect.objectContaining({ kind: "STEP" }),
      { kind: "TUNE", actorKey: "amc-runtime", automatic: true, toStage: undefined, baseReleaseId: RELEASE }
    ]);
    const head = store.readHead(projectId)!;
    expect(head).toMatchObject({ base_release_id: RELEASE, step: "asked" });
    expect(["assemble", "adapt"]).toContain(head.stage);
    // Consumed once: the next write finds nothing new.
    expect(syncRuntimeLifecycle(store, projectId)).toBeNull();
  });

  test("an out-of-envelope change suspends the agent in P2-23 and REOPENs Adapt before the TUNE", async () => {
    const { workspace } = governanceFixture();
    await activate(workspace, ownerActor(workspace));
    const { store, projectId } = project(workspace);
    deployed(store, projectId);
    const live = manifest({ systemPromptSha256: "c".repeat(64) });
    expect(() => checkChangeEnvelopeAtOpen({ workspace, agentId: AGENT, live, decision: block(["prompt"]) })).toThrow(/change_envelope_blocked/);
    expect(lifecycleView(workspace, AGENT)).toMatchObject({ state: "suspended", reason: "reassessment_required" });
    refuseOnFreeze(store, projectId); // the governed-write path consumes the change before the owner's write
    expect(tail(store, projectId, 2)).toEqual([
      { kind: "REOPEN", actorKey: "amc-runtime", automatic: true, toStage: "adapt", baseReleaseId: undefined },
      { kind: "TUNE", actorKey: "amc-runtime", automatic: true, toStage: undefined, baseReleaseId: RELEASE }
    ]);
  });

  test("a mandatory invalidated control (P2-23 reassessment) REOPENs Adapt; an agent P2-23 does not govern reads P2-26's rows", async () => {
    const { workspace } = governanceFixture();
    await activate(workspace, ownerActor(workspace));
    const { store, projectId } = project(workspace);
    deployed(store, projectId);
    const changed = manifest({ model: { providerId: "fixture-provider", model: "fixture-model-b", providerReportedVersion: "2026-10-01" } });
    expect(admitNativeSession({ workspace, agentId: AGENT, manifest: () => changed, plan: planView() }).state).toBe("suspended");
    syncRuntimeLifecycle(store, projectId);
    expect(tail(store, projectId, 2).map((row) => row.kind)).toEqual(["REOPEN", "TUNE"]);

    const other = project(workspace, "ungoverned-agent");
    deployed(other.store, other.projectId);
    checkChangeEnvelopeAtOpen({ workspace, agentId: "ungoverned-agent", live: manifest({ agentId: "ungoverned-agent" }),
      decision: { outcome: "allow_in_envelope", envelopeId: "env_fixture", changed: ["prompt"], reasons: [], unpinned: false } });
    syncRuntimeLifecycle(other.store, other.projectId);
    expect(tail(other.store, other.projectId, 1).map((row) => row.kind)).toEqual(["TUNE"]);
  });

  test("a project with no deployed release is not moved", async () => {
    const { workspace } = governanceFixture();
    await activate(workspace, ownerActor(workspace));
    const { store, projectId } = project(workspace);
    expect(() => checkChangeEnvelopeAtOpen({ workspace, agentId: AGENT, live: manifest({ systemPromptSha256: "c".repeat(64) }), decision: block(["prompt"]) })).toThrow();
    expect(syncRuntimeLifecycle(store, projectId)).toBeNull();
    // At Activate but with no deployed release: still nothing to tune from.
    store.transition(projectId, A4_RUNTIME, () => ({ kind: "STEP", payload: { fixture: "activate, not deployed" }, head: { stage: "activate", step: "completion_approved" } }));
    expect(syncRuntimeLifecycle(store, projectId)).toBeNull();
    expect(store.readChain(projectId).map((link) => link.kind)).toEqual(["CREATED", "STEP"]);
  });
});

describe("the kill switch holds the project (P2-34)", () => {
  test("an active kill holds with its incident id; RESUME is refused until it is released, then an owner resumes", async () => {
    const { workspace } = governanceFixture();
    const { store, projectId } = project(workspace);
    const kill = await activateKillSwitch({ workspace, issuedBy: "owner-1", scope: { kind: "agent", id: AGENT }, mode: "stop_new_effects",
      reason: "P2-34 drill", incidentId: "inc-p234" });
    expect(() => refuseOnFreeze(store, projectId)).toThrow(/freeze is active/);
    const held = store.readChain(projectId).at(-1)!;
    expect(held.kind).toBe("HOLD");
    expect(held.body).toMatchObject({ actorKey: "amc-runtime", automatic: true, incidentIds: [`kill-switch:${kill.killId}`, "inc-p234"] });
    expect(store.readHead(projectId)!.hold).toBe(1);
    const resume = () => resumeProject(store, projectId, { principal: owner, reason: "cause cleared", expectedHeadSeq: store.readHead(projectId)!.head_seq });
    expect(resume).toThrow(/freeze is active/);
    expect(store.readHead(projectId)!.hold).toBe(1);
    await releaseKillSwitch({ workspace, releasedBy: "owner-1", killId: kill.killId, incidentId: "inc-p234" });
    expect(store.readHead(projectId)!.hold).toBe(1); // a released kill lifts nothing by itself
    resume();
    expect(store.readHead(projectId)!.hold).toBe(0);
  });

  test("break-glass never lifts an A4 hold: no A4 module reads break-glass records", () => {
    const dir = join(process.cwd(), "src", "a4");
    const files = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((name) => name.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) expect(readFileSync(join(dir, file), "utf8")).not.toMatch(/breakGlass|break-glass\.js|emergencyOverride/);
  });
});

describe("retention floors in Adapt readiness (P2-34)", () => {
  const floorItem = ({ store, projectId }: ReturnType<typeof project>) =>
    readinessFor(store, projectId, owner, {}, "adapt").items.find((entry) => entry.id === "memory_policy_retention_floor");
  const aiActPlan = { digest: `sha256:${"9".repeat(64)}`, requirements: [{ controlId: "L0-LOG-03", applicability: "applicable", citationsInScope: ["eu-ai-act-art-26-6"],
    pulledInBy: ["layer0"], mandatory: true }], evidencePlan: { tests: [], evidenceRequests: [], manualDuties: [], releaseGates: [] } };

  test("a memory policy kept less than the regime floor is BLOCKED; no floor is READY; an unreadable plan is NOT_EVALUATED", async () => {
    const { workspace } = governanceFixture();
    const fixture = project(workspace);
    expect(floorItem(fixture)).toMatchObject({ status: "READY", reasonCodes: ["NO_REGIME_FLOOR", "RETENTION_DAYS:90"] });
    active.plan = aiActPlan as never;
    const blocked = floorItem(fixture);
    expect(blocked).toMatchObject({ status: "BLOCKED", mandatory: true });
    expect(blocked!.reasonCodes).toEqual(expect.arrayContaining(["MEMORY_RETENTION_BELOW_FLOOR", "RETENTION_DAYS:90", "FLOOR_DAYS:183",
      "REGIME:eu-ai-act-art-26-6-deployer-logs", "EXPERIMENTAL"]));
    active.throws = true;
    expect(floorItem(fixture)).toMatchObject({ status: "NOT_EVALUATED", reasonCodes: ["REGIME_FLOOR_UNREADABLE"] });
  });
});

describe("the package's version manifest (P2-34)", () => {
  test("embeds P2-23's bound manifest with the digest P2-23 recorded; a tampered state row refuses", async () => {
    const { workspace } = governanceFixture();
    const m = manifest();
    await activate(workspace, ownerActor(workspace), m);
    const embedded = packageVersionManifest(workspace, AGENT);
    expect(embedded).toMatchObject({ source: "lifecycle_bound", manifestDigest: manifestDigest(m) });
    expect(embedded.manifestDigest).toBe(manifestDigest(lifecycleView(workspace, AGENT).boundManifest!));
    expect(a4PackageV1Schema.shape.versionManifest.parse(embedded)).toEqual(embedded);
    expect(packageVersionManifest(workspace, "ungoverned-agent")).toEqual({ manifest: null, manifestDigest: null, source: "not_governed" });

    const ledger = openLedger(workspace);
    try {
      ledger.db.prepare("UPDATE agent_lifecycle_state SET bound_manifest_json = ? WHERE agent_id = ?")
        .run(JSON.stringify(manifest({ systemPromptSha256: "e".repeat(64) })), AGENT);
    } finally {
      ledger.close();
    }
    expect(() => packageVersionManifest(workspace, AGENT)).toThrow(/VERSION_MANIFEST_MISMATCH|not the one P2-23 recorded/);
  });
});

describe("activation and retirement through P2-23 (P2-34)", () => {
  const gate = { gate_id: "a4g_fixture", binding_digest: "b".repeat(64) };

  test("the deployment approval activates an approved agent, naming the gate's binding digest; other states refuse", async () => {
    const { workspace } = governanceFixture();
    const actor = ownerActor(workspace);
    expect(recordLifecycleActivation(workspace, AGENT, owner, gate).status).toBe("not_governed");
    transitionAgent({ workspace, agentId: AGENT, to: "proposed", actor });
    expect(() => recordLifecycleActivation(workspace, AGENT, owner, gate)).toThrow(/is proposed/);
    await approvedMove(workspace, actor, "approved", manifest());
    const result = recordLifecycleActivation(workspace, AGENT, owner, gate);
    expect(result).toMatchObject({ status: "activated", bindingDigest: gate.binding_digest });
    expect(lifecycleView(workspace, AGENT).state).toBe("active");
    const ledger = openLedger(workspace);
    try {
      const row = lifecycleEvents(ledger.db, LIFECYCLE_AUDIT.transition, AGENT).at(-1)!;
      expect(row.id).toBe(result.lifecycleEventId);
      expect(row.meta).toMatchObject({ from: "approved", to: "active", note: `A4 activate.completion gate ${gate.gate_id}, binding_digest ${gate.binding_digest}` });
    } finally {
      ledger.close();
    }
    expect(recordLifecycleActivation(workspace, AGENT, owner, gate).status).toBe("already_active");
  });

  test("RETIRE of a deployed project retires the agent through P2-23 first and names that row", async () => {
    const { workspace } = governanceFixture();
    await activate(workspace, ownerActor(workspace));
    const { store, projectId } = project(workspace);
    deployed(store, projectId);
    await retireProject(store, projectId, { principal: owner, reason: "decommissioned", expectedHeadSeq: store.readHead(projectId)!.head_seq });
    expect(lifecycleView(workspace, AGENT)).toMatchObject({ state: "retired", reason: "retired" });
    const retired = store.readChain(projectId).at(-1)!;
    expect(retired.kind).toBe("RETIRE");
    expect(retired.body.lifecycleRetirement).toEqual({ lifecycleEventId: lifecycleView(workspace, AGENT).lastEventId });
  });
});
