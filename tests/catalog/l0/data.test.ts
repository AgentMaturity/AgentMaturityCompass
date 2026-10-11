import { appendFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectProtectedRequest } from "../../../src/dataflow/detectors.js";
import { initProcessorRegistry, processorRegistryPath, type ProcessorRegistryV1 } from "../../../src/dataflow/processorRegistry.js";
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
