import { appendFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectProtectedRequest } from "../../../src/dataflow/detectors.js";
import { initProcessorRegistry, processorRegistryPath, processorRegistrySchema, type ProcessorContractV1,
  type ProcessorRegistryV1 } from "../../../src/dataflow/processorRegistry.js";
import { admitProtectedModelRequest } from "../../../src/dataflow/purposePolicy.js";
import type { EncodableRequest } from "../../../src/llm/request/requestSpec.js";
import { EgressBlocked, checkScopedEgress } from "../../../src/residency/checkEgress.js";
import { destinationRegistryPath, initDestinationRegistry } from "../../../src/residency/destinationRegistry.js";
import type { DestinationRegistryV1, EgressChannel } from "../../../src/residency/types.js";
import { fixturesFor } from "./harness.js";
import { newWorkspace } from "./workspaces.js";

/**
 * L0-DAT-01, L0-DAT-03 and L0-DAT-04 against the real P2-02 protected-data admission and the P2-01 residency egress check
 * (P1-14). Admission runs the same two steps the native runtime's request hook runs, detection then the signed purpose
 * policy, on a request built from the fixture's text; it covers native model requests only, not tool arguments or logs.
 * The oracle is the admission decision and the egress verdict, never the model's reply.
 */
type AdmitSetup = { registry: ProcessorRegistryV1; registryState: string; route: { providerId: string; baseUrl: string }; text: string };
type RouteSetup = { registry: DestinationRegistryV1; registryState: string; channel: EgressChannel; url: string; dataClasses: string[] };

const request = (text: string): EncodableRequest => ({ model: "fixture-model", params: {}, system: null, tools: null,
  messages: [{ role: "user", parts: [{ kind: "text", text }] }] });

describe("L0-DAT-01 and L0-DAT-03: protected-data admission of model requests (P2-02)", () => {
  const fixtures = [...fixturesFor("data_admission", "L0-DAT-01"), ...fixturesFor("data_admission", "L0-DAT-03")];
  it("has fixtures for both controls", () => expect(new Set(fixtures.map((f) => f.control.id)).size).toBe(2));
  for (const f of fixtures) {
    it(`${f.ref}: ${f.envelope.expected.result} ${f.envelope.expected.reasonCode ?? ""}`, () => {
      const s = f.envelope.setup as unknown as AdmitSetup;
      const ws = newWorkspace();
      initProcessorRegistry(ws, s.registry);
      if (s.registryState === "edited_after_signing") appendFileSync(processorRegistryPath(ws), "# widened after signing\n");
      const detection = detectProtectedRequest(request(s.text));
      expect(detection.classes.length, "the fixture text carries a protected class").toBeGreaterThan(0);
      const admission = admitProtectedModelRequest(ws, s.route.providerId, s.route.baseUrl, detection);
      expect(admission.allowed ? "allow" : "deny", admission.reason).toBe(f.envelope.expected.result);
      expect(admission.reason).toBe(f.envelope.expected.reasonCode);
    });
  }
});

describe("P2-02 step 7: admission when nothing is detected", () => {
  // Admission alone, on a request whose detection is empty: what the signed run purpose and a declared PHI token decide.
  const route = { providerId: "care-provider", baseUrl: "https://care.fixture.example/v1" };
  const empty = () => detectProtectedRequest(request("Summarise the changelog."));
  const contract = (kind: ProcessorContractV1["kind"], effective: string, expires: string | null): ProcessorContractV1 =>
    ({ kind, reference: `${kind}-CARE-1`, effective, expires, dataClasses: ["phi", "pii"] });
  const DPA = contract("DPA", "2026-01-01", null);
  const BAA = contract("BAA", "2026-01-01", null);
  const careRegistry = (c: ProcessorContractV1, runPurpose?: string): ProcessorRegistryV1 => ({ schemaVersion: "amc.dataflow-processors/v1",
    experimental: true, processors: [{ processorId: "proc-care", legalName: "Fixture Care Processor", contracts: [c] }],
    purposes: [{ purposeId: "care", allowedDataClasses: ["phi", "pii"], allowedTools: ["model.request"], allowedProcessors: ["proc-care"] }],
    bindings: [{ ...route, processorId: "proc-care", purposeId: "care" }], ...(runPurpose === undefined ? {} : { runPurpose }) });
  const admit = (registry: ProcessorRegistryV1, declared: ("phi" | "pii")[] = []) => {
    const ws = newWorkspace();
    initProcessorRegistry(ws, registry);
    return admitProtectedModelRequest(ws, route.providerId, route.baseUrl, empty(), declared);
  };

  it("the request carries no detectable class", () => expect(empty().classes).toEqual([]));
  it("a PHI run purpose routed to a DPA-only processor needs a BAA", () =>
    expect(admit(careRegistry(DPA, "care"))).toMatchObject({ allowed: false, reason: "baa_required", classes: ["phi"] }));
  it("an expired BAA is no BAA", () =>
    expect(admit(careRegistry(contract("BAA", "2025-01-01", "2026-01-01"), "care"))).toMatchObject({ allowed: false, reason: "baa_required" }));
  it("a BAA in force is allowed, with classes [phi]", () => expect(admit(careRegistry(BAA, "care")))
    .toMatchObject({ allowed: true, reason: "declared_policy_allows", processorId: "proc-care", purposeId: "care", classes: ["phi"] }));
  it("a declared PHI token with no run purpose needs a BAA", () =>
    expect(admit(careRegistry(DPA), ["phi"])).toMatchObject({ allowed: false, reason: "baa_required", classes: ["phi"] }));
  it("nothing detected, declared or purposed is no_protected_data", () =>
    expect(admit(careRegistry(DPA))).toMatchObject({ allowed: true, reason: "no_protected_data", classes: [] }));
  it("a registry edited after signing refuses whatever the request holds", () => {
    const ws = newWorkspace();
    initProcessorRegistry(ws, careRegistry(BAA, "care"));
    appendFileSync(processorRegistryPath(ws), "# widened after signing\n");
    expect(admitProtectedModelRequest(ws, route.providerId, route.baseUrl, empty())).toMatchObject({ allowed: false, reason: "signature_invalid" });
  });
  it("the schema rejects an unknown run purpose and a destination owned by two processors", () => {
    const owned = (processorId: string) => ({ processorId, legalName: `Fixture ${processorId}`, contracts: [BAA], destinationIds: ["referral-api"] });
    const base = careRegistry(BAA, "care");
    expect(processorRegistrySchema.safeParse({ ...base, processors: [owned("proc-care")] }).success).toBe(true);
    expect(processorRegistrySchema.safeParse({ ...base, runPurpose: "marketing" }).success).toBe(false);
    expect(processorRegistrySchema.safeParse({ ...base, processors: [owned("proc-care"), owned("proc-other")] }).success).toBe(false);
  });
});

describe("L0-DAT-04 residency routing (signed destination registry)", () => {
  const fixtures = fixturesFor("residency_egress", "L0-DAT-04");
  it("has fixtures", () => expect(fixtures.length).toBeGreaterThan(1));
  for (const f of fixtures) {
    it(`${f.ref}: ${f.envelope.expected.result} ${f.envelope.expected.reasonCode ?? ""}`, () => {
      const s = f.envelope.setup as unknown as RouteSetup;
      const ws = newWorkspace();
      initDestinationRegistry(ws, s.registry);
      if (s.registryState === "edited_after_signing") appendFileSync(destinationRegistryPath(ws), "# widened after signing\n");
      let verdict: { result: "allow" | "deny"; code: string | null };
      try {
        const decision = checkScopedEgress(ws, s.channel, s.url, { dataClasses: s.dataClasses, agentId: "default" });
        expect(decision.verdict, "a residency rule applies to this route").toBe("allowed");
        verdict = { result: "allow", code: null };
      } catch (error) {
        if (!(error instanceof EgressBlocked)) throw error;
        expect(error.controlResult.status, "a blocked route makes no residency claim").toBe("not_evaluated");
        verdict = { result: "deny", code: error.decision.reason };
      }
      expect(verdict.result).toBe(f.envelope.expected.result);
      expect(verdict.code).toBe(f.envelope.expected.reasonCode);
    });
  }
});
