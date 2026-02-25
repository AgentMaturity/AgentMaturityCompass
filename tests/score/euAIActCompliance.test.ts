import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { scoreEUAIActCompliance } from "../../src/score/euAIActCompliance.js";

describe("euAIActCompliance", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "amc-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns zero score for empty directory", () => {
    const r = scoreEUAIActCompliance(tmp);
    expect(r.score).toBe(0);
    expect(r.level).toBe(0);
    expect(r.riskClassification).toBe("unknown");
    expect(r.gaps.length).toBeGreaterThan(0);
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

  it("detects README as technical documentation", () => {
    writeFileSync(join(tmp, "README.md"), "# Agent");
    const r = scoreEUAIActCompliance(tmp);
    expect(r.hasTechnicalDocumentation).toBe(true);
  });

  it("returns full score when all artifacts present", () => {
    mkdirSync(join(tmp, ".amc"), { recursive: true });
    mkdirSync(join(tmp, "docs"), { recursive: true });
    mkdirSync(join(tmp, "src/score"), { recursive: true });
    mkdirSync(join(tmp, "src/assurance/packs"), { recursive: true });
    writeFileSync(
      join(tmp, ".amc/eu_ai_act_classification.json"),
      JSON.stringify({ riskClass: "high" }),
    );
    writeFileSync(join(tmp, "docs/RISK_MANAGEMENT.md"), "");
    writeFileSync(join(tmp, "docs/DATA_GOVERNANCE.md"), "");
    writeFileSync(join(tmp, "README.md"), "");
    writeFileSync(join(tmp, ".amc/audit_log.jsonl"), "");
    writeFileSync(join(tmp, "src/score/humanOversightQuality.ts"), "");
    writeFileSync(join(tmp, "src/score/vibeCodeAudit.ts"), "");
    writeFileSync(join(tmp, "docs/INCIDENT_RESPONSE_READINESS.md"), "");
    writeFileSync(join(tmp, ".amc/fria.json"), "{}");
    const r = scoreEUAIActCompliance(tmp);
    expect(r.score).toBe(100);
    expect(r.level).toBe(5);
    expect(r.gaps).toHaveLength(0);
  });
});
