/** Native compile/admission adapter and reusable synthetic fixture arrangement. No expected result affects a decision. */
import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { compilePlan, parseDeploymentProfile } from "../../../../src/catalog/compiler/compile.js";
import type { CompiledPlan, DeploymentProfile } from "../../../../src/catalog/compiler/types.js";
import { evaluateControl } from "../../../../src/catalog/evidence/evaluate.js";
import type { EvaluationContext, EvidenceItem } from "../../../../src/catalog/evidence/types.js";
import { loadCatalog, type LoadedCatalog } from "../../../../src/catalog/loader.js";
import type { ControlRecord, FixtureEnvelope } from "../../../../src/catalog/types.js";
import { ed25519KeyId, signTrustList, type TrustList } from "../../../../src/trust/trustList.js";
import { canonicalize } from "../../../../src/utils/json.js";
import { sha256Hex } from "../../../../src/utils/hash.js";
import { runReleaseCheck } from "./releaseCheck.js";
import { runScreeningLog } from "./screeningLog.js";
import { runPortAccess } from "./portAccess.js";
import { runChangeGate } from "./changeGate.js";
import { runOtaDeployer, type OtaFixtureAuthority } from "./otaDeployer.js";
import { runVehicleSimulator } from "./vehicleSimulator.js";
import type { OtaInput } from "./protocol.js";

export const MOBILITY_IDS = ["L1-MOB-01", "L1-MOB-02", "L1-MOB-03", "L1-MOB-04", "L1-MOB-05", "L1-MOB-06"];
const PROFILE_FILES = ["profile.port-operations.json", "profile.tenant-screening.json", "profile.fleet-software.json"];
export interface MobilityPlan { profile: DeploymentProfile; plan: CompiledPlan }
export interface MobilityFixture { ref: string; control: ControlRecord; envelope: FixtureEnvelope }
interface EvidenceSetup {
  window: EvaluationContext["window"]; subject: EvaluationContext["subject"];
  items: Array<Omit<EvidenceItem, "claimedAt" | "ref"> & { ref: Omit<EvidenceItem["ref"], "sha256"> }>;
  priorUses: NonNullable<EvaluationContext["priorUses"]>;
}
export type FixtureCryptoMode = "valid" | "unsigned" | "unknown_signer" | "revoked_signer" | "wrong_purpose" | "bad_content"
  | "bad_signature" | "unavailable_trust" | "invalid_trust" | "future_trust" | "expired_trust";
export interface MobilityOracleSpec { kind: "release_check" | "screening_log" | "port_access" | "change_gate" | "ota_deployer" | "vehicle_simulator"; input: unknown }

/** Fixture-only arrangement. Private keys remain in memory; callers cannot pass a TrustContext or use a mode as a verdict. */
export function prepareOtaFixture(value: unknown, mode: FixtureCryptoMode) {
  // Preserve malformed caller properties for the oracle to reject; no expected result is read here.
  const input = structuredClone(value) as OtaInput;
  const root = generateKeyPairSync("ed25519"), release = generateKeyPairSync("ed25519"), other = generateKeyPairSync("ed25519");
  const rootPublic = root.publicKey.export({ type: "spki", format: "pem" }).toString();
  const releasePublic = release.publicKey.export({ type: "spki", format: "pem" }).toString();
  const otherPublic = other.publicKey.export({ type: "spki", format: "pem" }).toString();
  const list: TrustList = {
    type: "amc.trust-list", version: 1, listId: "mobility-fixture-release", sequence: 1,
    issuedAt: mode === "future_trust" ? "2026-10-19T00:00:00.000Z" : "2026-10-01T00:00:00.000Z",
    expiresAt: mode === "expired_trust" ? "2026-10-17T00:00:00.000Z" : "2026-11-01T00:00:00.000Z",
    entries: [{ keyId: ed25519KeyId(releasePublic)!, algorithm: "ed25519", publicKeyPem: releasePublic,
      purposes: mode === "wrong_purpose" ? ["artifact-seal"] : ["release"], subject: "synthetic release authority",
      validFrom: "2026-10-01T00:00:00.000Z", validTo: "2026-11-01T00:00:00.000Z", source: "operator",
      ...(mode === "revoked_signer" ? { revokedAt: "2026-10-17T00:00:00.000Z", revocationReason: "cessation" as const } : {}) }], distrust: []
  };
  const signedTrustList = signTrustList(list, root.privateKey.export({ type: "pkcs8", format: "pem" }).toString());
  input.package.metadata.payloadSha256 = sha256Hex(Buffer.from(input.package.payloadBase64, "base64"));
  const digest = sha256Hex(canonicalize(input.package.metadata));
  input.package.signerPublicKeyPem = mode === "unknown_signer" ? otherPublic : releasePublic;
  input.package.signatureB64 = sign(null, Buffer.from(digest, "hex"), mode === "unknown_signer" ? other.privateKey : release.privateKey).toString("base64");
  if (mode === "unsigned") input.package.signatureB64 = "";
  if (mode === "bad_signature") {
    const bytes = Buffer.from(input.package.signatureB64, "base64"); bytes[0] = bytes[0]! ^ 1; input.package.signatureB64 = bytes.toString("base64");
  }
  if (mode === "bad_content") input.package.payloadBase64 = Buffer.from("changed after fixture signature").toString("base64");
  const authority: OtaFixtureAuthority | null = mode === "unavailable_trust" ? null
    : { signedTrustList, pinnedRootKeyIds: [mode === "invalid_trust" ? ed25519KeyId(otherPublic)! : ed25519KeyId(rootPublic)!] };
  return { input, authority };
}

export function runMobilityOracle(spec: { kind: "ota_deployer"; input: unknown }, fixtureCrypto?: { mode: FixtureCryptoMode }): ReturnType<typeof runOtaDeployer>;
export function runMobilityOracle(spec: MobilityOracleSpec, fixtureCrypto?: { mode: FixtureCryptoMode }): ReturnType<typeof runReleaseCheck> | ReturnType<typeof runScreeningLog>
  | ReturnType<typeof runPortAccess> | ReturnType<typeof runChangeGate> | ReturnType<typeof runOtaDeployer> | ReturnType<typeof runVehicleSimulator>;
export function runMobilityOracle(spec: MobilityOracleSpec, fixtureCrypto?: { mode: FixtureCryptoMode }) {
  switch (spec.kind) {
    case "release_check": return runReleaseCheck(spec.input);
    case "screening_log": return runScreeningLog(spec.input);
    case "port_access": return runPortAccess(spec.input);
    case "change_gate": return runChangeGate(spec.input);
    case "ota_deployer": { const prepared = prepareOtaFixture(spec.input, fixtureCrypto?.mode ?? "valid"); return runOtaDeployer(prepared.input, prepared.authority); }
    case "vehicle_simulator": return runVehicleSimulator(spec.input);
  }
}

export function mobilityHarness() {
  const catalog = loadCatalog();
  const plans = PROFILE_FILES.map((file): MobilityPlan => {
    const profile = parseDeploymentProfile(JSON.parse(readFileSync("docs/catalog/mobility/" + file, "utf8")));
    return { profile, plan: compilePlan({ profile, catalog, asOf: "2026-10-19T00:00:00.000Z" }) };
  });
  const controls = MOBILITY_IDS.map(id => { const control = catalog.controls.get(id); if (!control) throw new Error("Mobility control " + id + " is absent"); return control; });
  const fixtures = controls.flatMap((control): MobilityFixture[] => [...new Set(control.tests.flatMap(test => [...test.fixtures.positive, ...test.fixtures.negative]))].map(ref => {
    const envelope = catalog.fixtures.get(ref)?.envelope; if (!envelope) throw new Error("Mobility fixture " + ref + " did not load"); return { ref, control, envelope };
  }));
  return { catalog, plans, controls, fixtures };
}
function context(catalog: LoadedCatalog, compiled: MobilityPlan, control: ControlRecord, setup: EvidenceSetup): EvaluationContext {
  const requirement = compiled.plan.requirements.find(row => row.controlId === control.id);
  if (!requirement || requirement.applicability === "not_applicable") throw new Error(compiled.profile.profileId + " does not select " + control.id);
  const { tenantId, workspaceId, deploymentId, agentIds } = compiled.profile.deployment;
  if (setup.subject.tenantId !== tenantId || setup.subject.workspaceId !== workspaceId || setup.subject.deploymentId !== deploymentId || !agentIds.includes(setup.subject.agentId ?? "")) {
    throw new Error("Fixture subject is outside compiled " + compiled.profile.profileId);
  }
  return { subject: setup.subject, window: setup.window, invalidations: [], reviews: [], producers: catalog.producers, priorUses: setup.priorUses,
    plan: { digest: compiled.plan.digest, policyDigest: compiled.plan.runtimePolicy.policyDigest,
      applicability: requirement.applicability === "applicable" ? { state: "applicable" } : { state: "unresolved", reason: requirement.reasons.join("; ") }, mode: "enforce" } };
}
export function evaluateMobilityFixture(catalog: LoadedCatalog, compiled: MobilityPlan, fixture: MobilityFixture) {
  const setup = fixture.envelope.setup as unknown as EvidenceSetup;
  const items: EvidenceItem[] = setup.items.map(item => ({ ...item, claimedAt: null, ref: { ...item.ref, sha256: sha256Hex(canonicalize(item)) } }));
  return evaluateControl(fixture.control, items, context(catalog, compiled, fixture.control, setup));
}
export function evaluateMobilityProduction(catalog: LoadedCatalog, compiled: MobilityPlan, control: ControlRecord) {
  const { tenantId, workspaceId, deploymentId, agentIds } = compiled.profile.deployment;
  const setup: EvidenceSetup = { subject: { tenantId, workspaceId, deploymentId, agentId: agentIds[0]!, subjectId: null },
    window: { start: "2026-10-01T00:00:00.000Z", end: "2026-10-18T12:00:00.000Z" }, items: [], priorUses: [] };
  return evaluateControl(control, [], context(catalog, compiled, control, setup));
}
