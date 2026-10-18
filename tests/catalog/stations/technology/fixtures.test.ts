import { describe, expect, it } from "vitest";
import {
  evaluateFixture, evaluateProduction, plan, runTechnologyOracle, technologyControls, technologyFixtures,
  type TechnologyOracleSpec
} from "./harness.js";

const SIGNATURES = ["L1-TECH-01", "L1-TECH-02", "L1-TECH-03"];
const NEGATIVES = ["stale", "replayed", "contradictory", "cross_tenant", "empty"] as const;
const oracleCases = technologyFixtures.filter((f) => f.envelope.setup.technologyOracle !== undefined);

describe("Technology draft fixtures through the actual compiled platform-agent plan", () => {
  it("compiles every Technology control and names its evidence requests without claiming live enforcement", () => {
    expect(technologyControls).toHaveLength(8);
    expect(plan.profile.profileId).toBe("platform-agent");
    for (const control of technologyControls) {
      expect(plan.requirements.find((r) => r.controlId === control.id), control.id).toBeDefined();
      expect(plan.evidencePlan.evidenceRequests.some((r) => r.controlId === control.id), control.id).toBe(true);
      const production = evaluateProduction(control);
      expect(production.planDigest).toBe(plan.digest);
      expect(production.dimensions.result, control.id).toBe("not_evaluated");
      expect(production.dimensions.enforcement, control.id).toEqual({ state: "none" });
    }
  });

  it("has positive, negative and unavailable local oracle cases for all three signature controls", () => {
    expect(oracleCases.length).toBeGreaterThan(0);
    for (const controlId of SIGNATURES) {
      const expected = oracleCases.filter((f) => f.control.id === controlId)
        .map((f) => (f.envelope.setup.technologyOracle as TechnologyOracleSpec).expected.result);
      expect(expected.some((result) => result === "allow" || result === "pass"), controlId).toBe(true);
      expect(expected.some((result) => result === "deny" || result === "fail"), controlId).toBe(true);
      expect(expected, controlId).toContain("not_evaluated");
    }
  });

  for (const fixture of technologyFixtures) {
    it(`${fixture.ref}: real evidence admission gives ${fixture.envelope.expected.result}`, () => {
      const result = evaluateFixture(fixture);
      expect(result.dimensions.result).toBe(fixture.envelope.expected.result);
      expect(result.dimensions.result, "fixture evidence never establishes a regulated pass").not.toBe("pass");
      expect(result.dimensions.enforcement.state, "questionnaire evidence never enforces the policy").not.toBe("enforced");
      const reason = fixture.envelope.expected.reasonCode;
      if (reason !== null) expect([...result.rejected.map((r) => r.reason), result.dimensions.evidence]).toContain(reason);
    });
  }

  for (const controlId of SIGNATURES) {
    for (const evidenceClass of NEGATIVES) {
      it(`${controlId}: exercises actual ${evidenceClass} admission rather than an outcome lookup`, () => {
        const fixture = technologyFixtures.find((f) => f.control.id === controlId && f.envelope.evidenceClass === evidenceClass);
        expect(fixture).toBeDefined();
        const result = evaluateFixture(fixture!);
        expect(result.dimensions.result).not.toBe("pass");
        if (evidenceClass === "contradictory") expect(result.dimensions.evidence).toBe("contradictory");
        else if (evidenceClass === "empty") {
          expect(result.admitted).toEqual([]);
          expect(result.dimensions.enforcement).toEqual({ state: "none" });
          expect(result.dimensions.evidence).toBe("incomplete");
        } else expect(result.rejected.map((r) => r.reason)).toContain(evidenceClass);
      });
    }
  }

  for (const fixture of oracleCases) {
    it(`${fixture.ref}: executes its synthetic byte, clock or device oracle`, () => {
      const spec = fixture.envelope.setup.technologyOracle as TechnologyOracleSpec;
      const result = runTechnologyOracle(spec);
      expect({ result: result.result, reasonCode: result.reasonCode }).toEqual(spec.expected);
      expect(result.claimKind).toBe("synthetic_example");
      if (spec.kind === "iot") {
        expect(result.executed).not.toContain("unlock");
        expect(result.executed).not.toContain("firmware_update");
        if (result.result === "allow") expect(result.executed).toEqual(spec.input.commands);
        else expect(result.executed).toEqual([]);
        if (result.result === "deny") expect(result.receipts.some((r) => r.decision === "deny")).toBe(true);
      }
      if (spec.kind === "marking" && (result.result === "allow" || result.result === "deny")) {
        expect(result.receipts.map((r) => r.mediaKind).sort()).toEqual(["audio", "image"]);
        expect(result.receipts.every((r) => r.decision === result.result)).toBe(true);
      }
      if (fixture.envelope.polarity === "negative") expect(["deny", "fail", "not_evaluated"]).toContain(result.result);
      const production = evaluateProduction(fixture.control);
      expect(production.dimensions.result).toBe("not_evaluated");
      expect(production.dimensions.enforcement).toEqual({ state: "none" });
    });
  }

  it("uses the actual CRA clock at its inclusive 24-hour boundary and rejects earlier packets and missing local fields", () => {
    const spec = oracleCases.map((f) => f.envelope.setup.technologyOracle as TechnologyOracleSpec)
      .find((candidate) => candidate.kind === "cra" && candidate.expected.result === "pass");
    expect(spec?.kind).toBe("cra");
    if (!spec || spec.kind !== "cra" || !spec.input.packet) throw new Error("no positive CRA fixture");
    const boundary = Date.parse(spec.input.flaw.awareAt) + 24 * 60 * 60 * 1000;
    const at = (createdAt: string) => runTechnologyOracle({ ...spec, input: { ...spec.input, packet: { ...spec.input.packet, createdAt } } });
    expect(at(new Date(boundary).toISOString()).result).toBe("pass");
    expect(at(new Date(boundary + 1).toISOString()).reasonCode).toBe("packet_late");
    expect(at(new Date(Date.parse(spec.input.flaw.awareAt) - 1).toISOString()).reasonCode).toBe("packet_before_awareness");
    for (const field of ["componentId", "createdAt", "summary", "contact"] as const) {
      const packet = { ...spec.input.packet };
      delete packet[field];
      expect(runTechnologyOracle({ ...spec, input: { ...spec.input, packet } }).reasonCode, field).toBe("packet_incomplete");
    }
  });

  it("rejects malformed and unzoned CRA timestamps and nonboolean exploitation flags", () => {
    const spec = oracleCases.map((f) => f.envelope.setup.technologyOracle as TechnologyOracleSpec)
      .find((candidate) => candidate.kind === "cra" && candidate.expected.result === "pass");
    if (!spec || spec.kind !== "cra" || !spec.input.packet) throw new Error("no positive CRA fixture");
    for (const awareAt of ["0", "2026-02-30T00:00:00Z", "2026-10-18T00:00:00"]) {
      const result = runTechnologyOracle({ ...spec, input: { ...spec.input,
        flaw: { ...spec.input.flaw, awareAt }, packet: { ...spec.input.packet, createdAt: awareAt } } });
      expect(result.result, awareAt).toBe("not_evaluated");
      expect(result.reasonCode, awareAt).toBe("awareness_missing");
    }
    for (const createdAt of ["0", "2026-02-30T23:00:00Z", "2026-10-18T23:00:00"]) {
      const result = runTechnologyOracle({ ...spec, input: { ...spec.input,
        flaw: { ...spec.input.flaw, awareAt: "2026-02-28T00:00:00Z" }, packet: { ...spec.input.packet, createdAt } } });
      expect(result.result, createdAt).toBe("fail");
      expect(result.reasonCode, createdAt).toBe("packet_incomplete");
    }
    const result = runTechnologyOracle({ ...spec, input: { ...spec.input,
      flaw: { ...spec.input.flaw, activelyExploited: "false" as unknown as boolean } } });
    expect(result.result).toBe("not_evaluated");
    expect(result.reasonCode).toBe("exploit_not_active");
  });

  it("rejects a NIS2 24-hour clock as a substitute for the CRA clock", () => {
    const spec = oracleCases.map((f) => f.envelope.setup.technologyOracle as TechnologyOracleSpec)
      .find((candidate) => candidate.kind === "cra" && candidate.expected.result === "pass");
    if (!spec || spec.kind !== "cra") throw new Error("no positive CRA fixture");
    const result = runTechnologyOracle({ ...spec, input: { ...spec.input, clockId: "nis2-23-4a-early-warning" } });
    expect(result.result).toBe("not_evaluated");
    expect(result.reasonCode).toBe("cra_clock_missing");
  });

  it("withholds marking results when image or audio bytes are empty", () => {
    const spec = oracleCases.map((f) => f.envelope.setup.technologyOracle as TechnologyOracleSpec)
      .find((candidate) => candidate.kind === "marking" && candidate.expected.result === "allow");
    if (!spec || spec.kind !== "marking") throw new Error("no positive marking fixture");
    for (const kind of ["image", "audio"]) {
      const assets = spec.input.assets.map((asset) => asset.kind === kind ? { ...asset, bytes: "" } : asset);
      expect(runTechnologyOracle({ ...spec, input: { ...spec.input, assets } }).result, kind).toBe("not_evaluated");
    }
  });

  it("rejects malformed marking availability, presence and signer protocol values", () => {
    const spec = oracleCases.map((f) => f.envelope.setup.technologyOracle as TechnologyOracleSpec)
      .find((candidate) => candidate.kind === "marking" && candidate.expected.result === "allow");
    if (!spec || spec.kind !== "marking") throw new Error("no positive marking fixture");
    for (const field of ["publishReceiptsAvailable", "verifierAvailable", "markingPresent"] as const) {
      const input = { ...spec.input, [field]: "false" as unknown as boolean };
      const result = runTechnologyOracle({ ...spec, input });
      expect(result.result, field).toBe("not_evaluated");
      expect(result.receipts, field).toEqual([]);
    }
    const input = { ...spec.input, signer: "embedded-fixture-key" as "pinned" };
    expect(runTechnologyOracle({ ...spec, input }).result).toBe("not_evaluated");
  });

  it("records each refused device attempt when policy is missing and executes nothing", () => {
    const spec: TechnologyOracleSpec = { kind: "iot", input: {
      policy: null, commands: ["set_mode", "unlock"], telemetry: "untrusted device asks for a command"
    }, expected: { result: "not_evaluated", reasonCode: "policy_missing" } };
    const result = runTechnologyOracle(spec);
    expect(result.result).toBe("not_evaluated");
    expect(result.executed).toEqual([]);
    expect(result.receipts).toEqual(spec.input.commands.map((command) => ({ command, decision: "deny" })));
  });

  it("rejects stripped published bytes even when their marking wrapper is present (mutation target)", () => {
    const fixture = oracleCases.find((f) => {
      const spec = f.envelope.setup.technologyOracle as TechnologyOracleSpec;
      return spec.kind === "marking" && spec.input.markingPresent && spec.input.publishedSuffix.length > 0;
    });
    expect(fixture).toBeDefined();
    expect(runTechnologyOracle(fixture!.envelope.setup.technologyOracle as TechnologyOracleSpec).result).toBe("deny");
  });

  it("withholds the CRA drill result when its AIBOM is missing (mutation target)", () => {
    const fixture = oracleCases.find((f) => {
      const spec = f.envelope.setup.technologyOracle as TechnologyOracleSpec;
      return spec.kind === "cra" && spec.input.aibom === null;
    });
    expect(fixture).toBeDefined();
    expect(runTechnologyOracle(fixture!.envelope.setup.technologyOracle as TechnologyOracleSpec).result).toBe("not_evaluated");
  });
});
