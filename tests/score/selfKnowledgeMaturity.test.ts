import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { scoreSelfKnowledgeMaturity } from "../../src/score/selfKnowledgeMaturity.js";

describe("selfKnowledgeMaturity", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "amc-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns zero score for empty directory", () => {
    const r = scoreSelfKnowledgeMaturity(tmp);
    expect(r.score).toBe(0);
    expect(r.level).toBe(0);
    expect(r.gaps.length).toBeGreaterThan(0);
    expect(r.recommendations.length).toBeGreaterThan(0);
  });

  it("detects claimProvenance as interpretability + citation + self-knowledge loss", () => {
    mkdirSync(join(tmp, "src/score"), { recursive: true });
    writeFileSync(join(tmp, "src/score/claimProvenance.ts"), "");
    const r = scoreSelfKnowledgeMaturity(tmp);
    expect(r.hasInterpretabilityLayer).toBe(true);
    expect(r.hasConfidenceWithCitation).toBe(true);
    expect(r.hasSelfKnowledgeLoss).toBe(true);
  });

  it("detects confidenceDrift as calibration mechanism", () => {
    mkdirSync(join(tmp, "src/score"), { recursive: true });
    writeFileSync(join(tmp, "src/score/confidenceDrift.ts"), "");
    const r = scoreSelfKnowledgeMaturity(tmp);
    expect(r.hasCalibrationMechanism).toBe(true);
    expect(r.hasInterpretabilityLayer).toBe(true);
  });

  it("returns full score when all artifacts present", () => {
    mkdirSync(join(tmp, "src/score"), { recursive: true });
    mkdirSync(join(tmp, "src/claims"), { recursive: true });
    writeFileSync(join(tmp, "src/score/knowledgeGraph.ts"), "");
    writeFileSync(join(tmp, "src/score/claimProvenance.ts"), "");
    writeFileSync(join(tmp, "src/score/lessonLearnedDatabase.ts"), "");
    writeFileSync(join(tmp, "src/claims/claimConfidence.ts"), "");
    writeFileSync(join(tmp, "src/score/confidenceDrift.ts"), "");
    const r = scoreSelfKnowledgeMaturity(tmp);
    expect(r.score).toBe(100);
    expect(r.level).toBe(5);
    expect(r.gaps).toHaveLength(0);
  });
});
