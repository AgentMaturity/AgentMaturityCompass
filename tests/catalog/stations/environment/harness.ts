/** Actual compiler/admission adapter; synthetic local outcomes never become production evidence. */
import { readFileSync } from "node:fs";
import { compilePlan, parseDeploymentProfile } from "../../../../src/catalog/compiler/compile.js";
import type { CompiledPlan, DeploymentProfile } from "../../../../src/catalog/compiler/types.js";
import { evaluateControl } from "../../../../src/catalog/evidence/evaluate.js";
import type { EvaluationContext, EvidenceItem } from "../../../../src/catalog/evidence/types.js";
import { loadCatalog, type LoadedCatalog } from "../../../../src/catalog/loader.js";
import type { ControlRecord, FixtureEnvelope } from "../../../../src/catalog/types.js";
import { canonicalize } from "../../../../src/utils/json.js";
import { sha256Hex } from "../../../../src/utils/hash.js";

export const ENVIRONMENT_IDS = ["L1-ENV-01", "L1-ENV-02", "L1-ENV-03", "L1-ENV-04", "L1-ENV-05", "L1-ENV-06"];
const PROFILE_FILES = ["profile.grid-operations.json", "profile.grid-operations-in.json", "profile.food-lot-release.json"];
export interface EnvironmentPlan { profile: DeploymentProfile; plan: CompiledPlan }
export interface EnvironmentFixture { ref: string; control: ControlRecord; envelope: FixtureEnvelope }
interface EvidenceSetup {
  window: EvaluationContext["window"];
  subject: EvaluationContext["subject"];
  items: Array<Omit<EvidenceItem, "claimedAt" | "ref"> & { ref: Omit<EvidenceItem["ref"], "sha256"> }>;
  priorUses: NonNullable<EvaluationContext["priorUses"]>;
}

export function environmentHarness() {
  const catalog = loadCatalog();
  const plans = PROFILE_FILES.map((file): EnvironmentPlan => {
    const profile = parseDeploymentProfile(JSON.parse(readFileSync("docs/catalog/environment/" + file, "utf8")));
    return { profile, plan: compilePlan({ profile, catalog, asOf: "2026-10-19T00:00:00.000Z" }) };
  });
  const controls = ENVIRONMENT_IDS.map(id => {
    const control = catalog.controls.get(id);
    if (!control) throw new Error("Environment control " + id + " is absent");
    return control;
  });
  const fixtures = controls.flatMap((control): EnvironmentFixture[] => {
    const refs = [...new Set(control.tests.flatMap(test => [...test.fixtures.positive, ...test.fixtures.negative]))];
    return refs.map(ref => {
      const envelope = catalog.fixtures.get(ref)?.envelope;
      if (!envelope) throw new Error("Environment fixture " + ref + " did not load");
      return { ref, control, envelope };
    });
  });
  return { catalog, plans, controls, fixtures };
}

function context(catalog: LoadedCatalog, compiled: EnvironmentPlan, control: ControlRecord, setup: EvidenceSetup): EvaluationContext {
  const requirement = compiled.plan.requirements.find(row => row.controlId === control.id);
  if (!requirement || requirement.applicability === "not_applicable") throw new Error(compiled.profile.profileId + " does not select " + control.id);
  const { tenantId, workspaceId, deploymentId, agentIds } = compiled.profile.deployment;
  if (setup.subject.tenantId !== tenantId || setup.subject.workspaceId !== workspaceId
    || setup.subject.deploymentId !== deploymentId || !agentIds.includes(setup.subject.agentId ?? "")) {
    throw new Error("Fixture subject is outside compiled " + compiled.profile.profileId);
  }
  return { subject: setup.subject, window: setup.window, invalidations: [], reviews: [], producers: catalog.producers, priorUses: setup.priorUses,
    plan: { digest: compiled.plan.digest, policyDigest: compiled.plan.runtimePolicy.policyDigest,
      applicability: requirement.applicability === "applicable" ? { state: "applicable" } : { state: "unresolved", reason: requirement.reasons.join("; ") }, mode: "enforce" } };
}

export function evaluateEnvironmentFixture(catalog: LoadedCatalog, compiled: EnvironmentPlan, fixture: EnvironmentFixture) {
  const setup = fixture.envelope.setup as unknown as EvidenceSetup;
  const items: EvidenceItem[] = setup.items.map(item => ({ ...item, claimedAt: null, ref: { ...item.ref, sha256: sha256Hex(canonicalize(item)) } }));
  return evaluateControl(fixture.control, items, context(catalog, compiled, fixture.control, setup));
}

export function evaluateEnvironmentProduction(catalog: LoadedCatalog, compiled: EnvironmentPlan, control: ControlRecord) {
  const { tenantId, workspaceId, deploymentId, agentIds } = compiled.profile.deployment;
  const setup: EvidenceSetup = { subject: { tenantId, workspaceId, deploymentId, agentId: agentIds[0]!, subjectId: null },
    window: { start: "2026-10-01T00:00:00.000Z", end: "2026-10-18T12:00:00.000Z" }, items: [], priorUses: [] };
  return evaluateControl(control, [], context(catalog, compiled, control, setup));
}
