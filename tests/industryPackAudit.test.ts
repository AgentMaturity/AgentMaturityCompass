import { describe, expect, test } from "vitest";
import { getPackById } from "../src/domains/industryPacks.js";
import {
  buildIndustryPackAudit,
  verifyIndustryPackAudit,
  renderIndustryPackAuditMarkdown,
  normalizeAuditFramework,
  AUDIT_FRAMEWORKS,
  type IndustryPackAudit,
} from "../src/domains/industryPackAudit.js";

const NOW = 1_700_000_000_000;

function pack() {
  const p = getPackById("clinical-trials");
  if (!p) throw new Error("expected clinical-trials pack to exist");
  return p;
}

function responsesAll(level: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const q of pack().questions) out[q.id] = level;
  return out;
}

describe("industry pack audit", () => {
  test("produces a deterministic, verifiable signed receipt", () => {
    const a = buildIndustryPackAudit({ pack: pack(), responses: responsesAll(3), now: NOW });
    const b = buildIndustryPackAudit({ pack: pack(), responses: responsesAll(3), now: NOW });
    expect(a.receiptHash).toBe(b.receiptHash);
    expect(a.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyIndustryPackAudit(a)).toBe(true);
    expect(a.generatedAt).toBe(new Date(NOW).toISOString());
  });

  test("detects tampering — any edit invalidates the receipt", () => {
    const audit = buildIndustryPackAudit({ pack: pack(), responses: responsesAll(3), now: NOW });
    const tampered: IndustryPackAudit = {
      ...audit,
      controls: audit.controls.map((c, i) => (i === 0 ? { ...c, level: 5, status: "PASS" as const } : c)),
    };
    expect(verifyIndustryPackAudit(tampered)).toBe(false);
  });

  test("maps every control across all frameworks plus the sector regulation", () => {
    const audit = buildIndustryPackAudit({ pack: pack(), responses: responsesAll(2), now: NOW });
    for (const c of audit.controls) {
      const frameworks = new Set(c.crosswalk.map((x) => x.framework));
      expect(frameworks.has("EU AI Act")).toBe(true);
      expect(frameworks.has("NIST AI RMF")).toBe(true);
      expect(frameworks.has("ISO 42001")).toBe(true);
      expect(frameworks.has("SOC 2")).toBe(true);
      expect(frameworks.has("Sector")).toBe(true);
    }
    const euCoverage = audit.frameworkCoverage.find((f) => f.framework === "EU AI Act");
    expect(euCoverage?.controls).toBe(audit.controls.length);
  });

  test("generates a concrete remediation for every control below PASS, none for PASS", () => {
    const gaps = buildIndustryPackAudit({ pack: pack(), responses: responsesAll(1), now: NOW });
    expect(gaps.overall.gapCount).toBe(gaps.controls.length);
    for (const c of gaps.controls) {
      expect(c.status).toBe("GAP");
      expect(c.remediation).not.toBeNull();
      expect(c.remediation?.generatedArtifact).toContain("target_level: 3");
      expect(c.remediation?.evidenceExpected.length).toBeGreaterThan(0);
    }

    const clean = buildIndustryPackAudit({ pack: pack(), responses: responsesAll(5), now: NOW });
    expect(clean.overall.passCount).toBe(clean.controls.length);
    expect(clean.overall.gapCount).toBe(0);
    for (const c of clean.controls) {
      expect(c.status).toBe("PASS");
      expect(c.remediation).toBeNull();
    }
    expect(clean.overall.percentage).toBeGreaterThanOrEqual(gaps.overall.percentage);
  });

  test("status thresholds: L5 PASS, L3 ADEQUATE, L1 GAP", () => {
    expect(buildIndustryPackAudit({ pack: pack(), responses: responsesAll(5), now: NOW }).controls[0]!.status).toBe("PASS");
    expect(buildIndustryPackAudit({ pack: pack(), responses: responsesAll(3), now: NOW }).controls[0]!.status).toBe("ADEQUATE");
    expect(buildIndustryPackAudit({ pack: pack(), responses: responsesAll(1), now: NOW }).controls[0]!.status).toBe("GAP");
  });

  test("framework filter narrows the crosswalk to one framework", () => {
    const audit = buildIndustryPackAudit({ pack: pack(), responses: responsesAll(2), now: NOW, frameworkFilter: "EU AI Act" });
    for (const c of audit.controls) {
      expect(c.crosswalk.every((x) => x.framework === "EU AI Act")).toBe(true);
    }
    expect(audit.frameworkCoverage).toHaveLength(1);
    expect(audit.frameworkCoverage[0]!.framework).toBe("EU AI Act");
  });

  test("normalizeAuditFramework resolves common aliases", () => {
    expect(normalizeAuditFramework("eu_ai_act")).toBe("EU AI Act");
    expect(normalizeAuditFramework("NIST")).toBe("NIST AI RMF");
    expect(normalizeAuditFramework("iso42001")).toBe("ISO 42001");
    expect(normalizeAuditFramework("soc2")).toBe("SOC 2");
    expect(normalizeAuditFramework("nonsense")).toBeUndefined();
    expect(AUDIT_FRAMEWORKS).toContain("EU AI Act");
  });

  test("renders an auditor-ready markdown report", () => {
    const md = renderIndustryPackAuditMarkdown(buildIndustryPackAudit({ pack: pack(), responses: responsesAll(1), now: NOW }));
    expect(md).toContain("# Industry Pack Audit — ");
    expect(md).toContain("## Framework coverage");
    expect(md).toContain("## Controls");
    expect(md).toContain("Receipt: `sha256:");
    expect(md).toContain("```yaml");
  });
});
