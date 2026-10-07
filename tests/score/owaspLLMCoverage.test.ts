import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { scoreOWASPLLMCoverage } from "../../src/score/owaspLLMCoverage.js";

describe("owaspLLMCoverage", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "amc-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  // These tests used to score coverage from AMC source file names. File presence
  // is not evidence that a risk is mitigated (P0-15).
  it("reports all 10 risks as not evaluated in an empty directory", () => {
    const r = scoreOWASPLLMCoverage(tmp);
    expect(r.status).toBe("not_evaluated");
    expect(r.score).toBeNull();
    expect(r.level).toBeNull();
    expect(r.risks).toHaveLength(10);
  });

  it("stays not evaluated when the formerly accepted source files exist", () => {
    mkdirSync(join(tmp, "src/assurance/packs"), { recursive: true });
    writeFileSync(join(tmp, "src/assurance/packs/injectionPack.ts"), "");
    const r = scoreOWASPLLMCoverage(tmp);
    expect(r.score).toBeNull();
    expect(r.risks.find((risk) => risk.id === "LLM01")?.status).toBe("not_evaluated");
  });
});
