import { afterEach, describe, expect, test, vi } from "vitest";
import type { CompiledPlan } from "../../src/catalog/compiler/types.js";
import { lifecycleView } from "../../src/lifecycle/governanceLifecycle.js";
import { admitNativeSession, lifecycleInvalidations, listReassessments, type ChangeEnvelopeLookup } from "../../src/lifecycle/reassessment.js";
import { diffManifests, unpinnedComponents, type AgentVersionManifest } from "../../src/lifecycle/versionManifest.js";
import { cleanupGovernanceFixtures, governanceFixture } from "../governor/governanceFixture.js";
import { activate, AGENT, manifest, ownerActor, planView } from "./lifecycleFixture.js";

// The active plan transitions read (review cadence, plan digest). Null unless a test sets one.
const active = vi.hoisted(() => ({ plan: null as unknown }));
vi.mock("../../src/catalog/compiler/activate.js", async (original) => ({
  ...(await original<typeof import("../../src/catalog/compiler/activate.js")>()), activeControlPlan: () => active.plan
}));

afterEach(() => {
  active.plan = null;
  cleanupGovernanceFixtures();
});

const DAY = 86_400_000;
const open = (workspace: string, current: AgentVersionManifest, options: { envelope?: ChangeEnvelopeLookup; now?: number; lifecycleControl?: boolean } = {}) =>
  admitNativeSession({ workspace, agentId: AGENT, manifest: () => current, plan: planView({ lifecycleControl: options.lifecycleControl }),
    ...(options.envelope ? { envelope: options.envelope } : {}), ...(options.now ? { now: options.now } : {}) });

describe("reassessment triggers at native session open (P2-23)", () => {
  test("a model change that invalidates a mandatory control suspends the agent before the session starts", async () => {
    const { workspace } = governanceFixture();
    await activate(workspace, ownerActor(workspace));
    const changed = manifest({ model: { providerId: "fixture-provider", model: "fixture-model-b", providerReportedVersion: "2026-10-01" } });
    expect(open(workspace, changed)).toMatchObject({ state: "suspended", reason: "reassessment_required" });
    const [record] = listReassessments(workspace, AGENT);
    expect(record).toMatchObject({ trigger: "invalidated_by", changed: ["model"], invalidatedControls: ["L0-CHG-01"],
      requiredTests: ["L0-CHG-01-T2"], status: "open", closedTs: null, envelopeId: null });
    expect(lifecycleInvalidations(workspace, AGENT)).toEqual([{ trigger: "model_version", at: new Date(record!.createdTs).toISOString(), ref: record!.reassessmentId }]);
    // The next open sees the same suspended agent and records nothing new.
    expect(open(workspace, changed).state).toBe("suspended");
    expect(listReassessments(workspace, AGENT)).toHaveLength(1);
  });

  test("a prompt change covered by a stub change envelope stays active and cites the envelope", async () => {
    const { workspace } = governanceFixture();
    await activate(workspace, ownerActor(workspace));
    const envelope: ChangeEnvelopeLookup = ({ changed }) => changed.every((kind) => kind === "prompt") ? { envelopeId: "env_fixture_prompt" } : null;
    expect(open(workspace, manifest({ systemPromptSha256: "c".repeat(64) }), { envelope }).state).toBe("active");
    expect(listReassessments(workspace, AGENT)).toEqual([expect.objectContaining({ trigger: "invalidated_by", changed: ["prompt"], status: "passed",
      envelopeId: "env_fixture_prompt", invalidatedControls: ["L0-CHG-01"] })]);
  });

  test("no change keeps the agent active and records nothing", async () => {
    const { workspace } = governanceFixture();
    await activate(workspace, ownerActor(workspace));
    expect(open(workspace, manifest()).state).toBe("active");
    expect(listReassessments(workspace, AGENT)).toEqual([]);
  });

  test("a change no mandatory control names is recorded as passed and the agent stays active", async () => {
    const { workspace } = governanceFixture();
    await activate(workspace, ownerActor(workspace));
    expect(open(workspace, manifest({ corpusDigests: ["corpus-b"] })).state).toBe("active");
    expect(listReassessments(workspace, AGENT)).toEqual([expect.objectContaining({ changed: ["corpus"], invalidatedControls: ["L1-OPT-01"], status: "passed" })]);
  });

  test("a review past due suspends the agent (review_expired); an advisory one records a warning", async () => {
    const duty = (controlId: string) => ({ controlId, duty: "review", ownerRole: "owner", cadence: "monthly", evidenceOfPerformance: "record" });
    const plan = (controlId: string) => ({ digest: `sha256:${"7".repeat(64)}`, requirements: planView().plan.requirements,
      evidencePlan: { tests: [], evidenceRequests: [], releaseGates: [], manualDuties: [duty(controlId)] } }) as unknown as CompiledPlan;
    for (const [controlId, expected] of [["L0-CHG-01", "suspended"], ["L1-OPT-01", "active"]] as const) {
      const { workspace } = governanceFixture();
      active.plan = plan(controlId);
      await activate(workspace, ownerActor(workspace));
      const view = lifecycleView(workspace, AGENT);
      expect(view.reviewDueTs! - view.updatedTs!).toBeLessThanOrEqual(30 * DAY);
      expect(view.reviewAdvisory).toBe(expected === "active");
      expect(open(workspace, manifest(), { now: Date.now() + 31 * DAY }).state).toBe(expected);
      expect(listReassessments(workspace, AGENT)).toEqual([expect.objectContaining({ trigger: "scheduled", status: "open" })]);
      if (expected === "suspended") expect(lifecycleView(workspace, AGENT).reason).toBe("review_expired");
      cleanupGovernanceFixtures();
    }
  });

  test("a null toolsDigest counts as changed (fail closed) and suspends", async () => {
    const { workspace } = governanceFixture();
    await activate(workspace, ownerActor(workspace));
    expect(diffManifests(manifest(), manifest({ toolsDigest: null }))).toEqual(["tool"]);
    expect(open(workspace, manifest({ toolsDigest: null }))).toMatchObject({ state: "suspended", reason: "reassessment_required" });
  });

  test("manifest diff: every component kind, missing fields fail closed, an unreported model version is unpinned", () => {
    const base = manifest();
    expect(diffManifests(base, base)).toEqual([]);
    expect(diffManifests(base, { ...base, policyDigest: "policy-b", compiledPlanDigest: "plan-b" })).toEqual(["policy"]);
    expect(diffManifests(base, { ...base, harnessVersion: "1.3.0" })).toEqual(["deployment"]);
    expect(diffManifests(base, { ...base, systemPromptSha256: "" })).toEqual(["prompt"]);
    const { corpusDigests: _corpus, ...noCorpus } = base;
    expect(diffManifests(base, noCorpus as AgentVersionManifest)).toEqual(["corpus"]);
    expect(unpinnedComponents(manifest({ model: { providerId: "p", model: "m", providerReportedVersion: null } }))).toEqual(["model"]);
  });

  test("no lifecycle row: a pre-P2-23 agent's session opens untouched and its manifest is never read", () => {
    const { workspace } = governanceFixture();
    const read = vi.fn(() => manifest());
    expect(admitNativeSession({ workspace, agentId: AGENT, manifest: read, plan: planView() })).toMatchObject({ implicit: true, state: "active" });
    expect(read).not.toHaveBeenCalled();
  });
});
