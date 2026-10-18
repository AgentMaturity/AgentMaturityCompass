/** Executes local draft oracles separately from the catalog's evidence and production-enforcement dimensions. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compilePlan, parseDeploymentProfile } from "../../../../src/catalog/compiler/compile.js";
import { evaluateControl } from "../../../../src/catalog/evidence/evaluate.js";
import type { EvaluationContext, EvidenceItem } from "../../../../src/catalog/evidence/types.js";
import { loadCatalog } from "../../../../src/catalog/loader.js";
import type { ControlRecord, FixtureEnvelope } from "../../../../src/catalog/types.js";
import { sha256Hex } from "../../../../src/utils/hash.js";
import { canonicalize } from "../../../../src/utils/json.js";
import { runCraDrill, type CraInput } from "./craDrill.js";
import { runDeviceSimulator, type DeviceInput, type OracleRunResult } from "./deviceSimulator.js";
import { runMarkingVerifier, type MarkingInput } from "./markingVerifier.js";
import { runNis2Drill, type Nis2Input } from "./nis2Drill.js";

export type TechnologyOracleSpec = (
  | { kind: "marking"; input: MarkingInput }
  | { kind: "cra"; input: CraInput }
  | { kind: "iot"; input: DeviceInput }
  | { kind: "nis2"; input: Nis2Input }
) & { expected: { result: OracleRunResult["result"]; reasonCode: string } };
interface EvidenceSetup {
  window: EvaluationContext["window"];
  subject: EvaluationContext["subject"];
  items: Array<Omit<EvidenceItem, "claimedAt" | "ref"> & { ref: Omit<EvidenceItem["ref"], "sha256"> }>;
  priorUses: NonNullable<EvaluationContext["priorUses"]>;
}
export interface TechnologyFixture { ref: string; control: ControlRecord; envelope: FixtureEnvelope }

const catalog = loadCatalog();
export const technologyControls = [...catalog.controls.values()].filter((control) => control.id.startsWith("L1-TECH-"));
const profile = parseDeploymentProfile(JSON.parse(readFileSync(join(process.cwd(), "docs/catalog/technology/profile.platform-agent.json"), "utf8")));
export const plan = compilePlan({ profile, catalog, asOf: "2026-10-18T00:00:00Z" });
export const technologyFixtures: TechnologyFixture[] = technologyControls.flatMap((control) => control.tests.flatMap((test) =>
  [...test.fixtures.positive, ...test.fixtures.negative].map((ref) => {
    const envelope = catalog.fixtures.get(ref)?.envelope;
    if (!envelope) throw new Error(`Technology fixture ${ref} did not load`);
    return { ref, control, envelope };
  })));

function context(control: ControlRecord, setup: EvidenceSetup): EvaluationContext {
  const requirement = plan.requirements.find((candidate) => candidate.controlId === control.id);
  if (!requirement) throw new Error(`compiled platform-agent plan omitted ${control.id}`);
  const state = requirement.applicability;
  const applicability: NonNullable<EvaluationContext["plan"]>["applicability"] = state === "applicable" ? { state }
    : state === "not_applicable" ? { state, rationale: requirement.reasons.join("; ") }
      : { state, reason: requirement.reasons.join("; ") };
  return { subject: setup.subject, window: setup.window, invalidations: [], reviews: [], producers: catalog.producers,
    priorUses: setup.priorUses,
    plan: { digest: plan.digest, policyDigest: plan.runtimePolicy.policyDigest, applicability, mode: "enforce" } };
}

export function evaluateFixture(fixture: TechnologyFixture) {
  const setup = fixture.envelope.setup as unknown as EvidenceSetup;
  const items: EvidenceItem[] = setup.items.map((item) => ({ ...item, claimedAt: null,
    ref: { ...item.ref, sha256: sha256Hex(canonicalize(item)) } }));
  return evaluateControl(fixture.control, items, context(fixture.control, setup));
}

/** No device, publisher or partner evidence exists in this clone; local oracle success must never fill that gap. */
export function evaluateProduction(control: ControlRecord) {
  const setup: EvidenceSetup = {
    subject: { tenantId: profile.deployment.tenantId, workspaceId: profile.deployment.workspaceId,
      deploymentId: profile.deployment.deploymentId, agentId: profile.deployment.agentIds[0]!, subjectId: null },
    window: { start: "2026-10-01T00:00:00Z", end: "2026-10-18T00:00:00Z" }, items: [], priorUses: []
  };
  return evaluateControl(control, [], context(control, setup));
}

export function runTechnologyOracle(spec: TechnologyOracleSpec): OracleRunResult {
  if (spec.kind === "marking") return runMarkingVerifier(spec.input);
  if (spec.kind === "cra") return runCraDrill(spec.input);
  if (spec.kind === "nis2") return runNis2Drill(spec.input);
  return runDeviceSimulator(spec.input);
}
