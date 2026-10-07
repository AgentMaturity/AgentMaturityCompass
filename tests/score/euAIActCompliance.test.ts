import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { scoreEUAIActCompliance } from "../../src/score/euAIActCompliance.js";
import { markAsAmcCheckout } from "../helpers/amcCheckout.js";

describe("euAIActCompliance", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "amc-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  // These tests used to assert path-presence scores (README.md satisfied Art. 11,
  // a set of AMC source paths scored 100). File presence is not evidence (P0-15).
  it("reports every criterion as not evaluated in an empty directory", () => {
    const r = scoreEUAIActCompliance(tmp);
    expect(r.status).toBe("not_evaluated");
    expect(r.score).toBeNull();
    expect(r.level).toBeNull();
    expect(r.riskClassification).toBe("unknown");
    expect(r.criteria).toHaveLength(10);
    expect(r.recommendations.length).toBeGreaterThan(0);
  });

  it("reads risk classification from file", () => {
    mkdirSync(join(tmp, ".amc"), { recursive: true });
    writeFileSync(
      join(tmp, ".amc/eu_ai_act_classification.json"),
      JSON.stringify({ riskClass: "high" }),
    );
    const r = scoreEUAIActCompliance(tmp);
    expect(r.riskClassification).toBe("high");
  });

  it("does not treat README as technical documentation", () => {
    writeFileSync(join(tmp, "README.md"), "# Agent");
    const r = scoreEUAIActCompliance(tmp);
    expect(r.criteria.find((c) => c.id === "Art. 11")?.status).toBe("not_evaluated");
  });

  it("stays not evaluated when every formerly accepted path is present", () => {
    markAsAmcCheckout(tmp);
    mkdirSync(join(tmp, "docs"), { recursive: true });
    for (const f of ["docs/RISK_MANAGEMENT.md", "docs/DATA_GOVERNANCE.md", "README.md", "docs/INCIDENT_RESPONSE_READINESS.md"]) {
      writeFileSync(join(tmp, f), "");
    }
    const r = scoreEUAIActCompliance(tmp);
    expect(r.score).toBeNull();
    expect(r.criteria.every((c) => c.status === "not_evaluated")).toBe(true);
  });
});
