import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import YAML from "yaml";
import { initWorkspace } from "../../src/workspace.js";
import { listAssurancePacks } from "../../src/assurance/packs/index.js";
import { EVIDENCE_EMITTERS, NON_MATURITY_AUDIT_MODULES } from "../../src/diagnostic/evidenceEmitters.js";
import { builtInComplianceMappings } from "../../src/compliance/builtInMappings.js";
import { complianceMapsSchema } from "../../src/compliance/mappingSchema.js";
import { classifyFrameworkString, familyReview, getFrameworkFamily, normalizeFrameworkName } from "../../src/compliance/frameworks.js";
import { generateComplianceReport, initComplianceMaps, verifyComplianceMapsSignature } from "../../src/compliance/complianceEngine.js";
import { complianceMapsPath } from "../../src/compliance/complianceMapPublication.js";
import { mergeMissingBuiltInFrameworks } from "../../src/compliance/complianceMapsUpgrade.js";
import { owaspLlmTop10Mappings } from "../../src/compliance/mappings/owaspLlmTop10.js";
import { owaspAgenticTop10Mappings } from "../../src/compliance/mappings/owaspAgenticTop10.js";
import { scoreOWASPLLMCoverage } from "../../src/score/owaspLLMCoverage.js";
import { getAssurancePack } from "../../src/assurance/packs/index.js";

/** SH-TRUST-04: OWASP LLM Top 10 (2025) and Agentic Top 10 (ASI01-ASI10) as evidence-bound frameworks. */
describe("OWASP LLM and Agentic Top 10 frameworks", () => {
  const roots: string[] = [];
  afterEach(() => { while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true }); });
  const workspace = () => {
    const dir = mkdtempSync(join(tmpdir(), "amc-owasp-"));
    roots.push(dir);
    process.env.AMC_VAULT_PASSPHRASE = "owasp-passphrase";
    initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
    return dir;
  };
  const all = [...owaspLlmTop10Mappings, ...owaspAgenticTop10Mappings];
  const packIds = new Set(listAssurancePacks().map((pack) => pack.id));
  const registeredAudits = new Set(EVIDENCE_EMITTERS.map((row) => row.auditType));

  test("ten mappings per list, every one parses, in the built-in set, with distinct categories matching the family", () => {
    expect(owaspLlmTop10Mappings).toHaveLength(10);
    expect(owaspAgenticTop10Mappings).toHaveLength(10);
    expect(() => complianceMapsSchema.parse({ complianceMaps: { version: 1, mappings: all } })).not.toThrow();
    for (const framework of ["OWASP_LLM", "OWASP_AGENTIC"] as const) {
      const rows = builtInComplianceMappings.filter((row) => row.framework === framework);
      expect(rows.map((row) => row.category)).toEqual(getFrameworkFamily(framework).categories);
      expect(new Set(rows.map((row) => row.id)).size).toBe(10);
    }
  });

  test("every binding names a registered pack, and every audit type a registered emitter or a non-maturity module's literal", () => {
    // Native audit writers: the registered emitters, the non-maturity modules, and the tool-evidence writer (AUTHORIZATION_RECORD).
    const src = [...NON_MATURITY_AUDIT_MODULES.map((row) => row.module), "src/tools/toolEvidence.ts"]
      .map((module) => readFileSync(join(process.cwd(), module), "utf8")).join("\n");
    for (const mapping of all) {
      for (const requirement of mapping.evidenceRequirements) {
        if (requirement.type === "requires_assurance_pack") expect(packIds.has(requirement.packId), `${mapping.id}: ${requirement.packId}`).toBe(true);
        if (requirement.type === "requires_evidence_event") {
          for (const auditType of requirement.auditTypes ?? []) {
            expect(registeredAudits.has(auditType) || src.includes(`"${auditType}"`), `${mapping.id}: ${auditType}`).toBe(true);
          }
        }
      }
      for (const packId of mapping.related.packs) expect(packIds.has(packId), `${mapping.id} related ${packId}`).toBe(true);
      // ASI05 binds packs and the escape denylist only: NATIVE_SHELL_CONFINEMENT rows are written for unconfined and failed
      // runs too and carry no agent id, so they can neither satisfy nor fail an agent-scoped control.
      if (mapping.id === "owasp_asi05_unexpected_code_execution") {
        expect(mapping.evidenceRequirements.map((row) => row.type).sort()).toEqual(["requires_assurance_pack", "requires_assurance_pack", "requires_no_audit"]);
        expect(readFileSync(join(process.cwd(), "src/compliance/mappings/owaspAgenticTop10.ts"), "utf8")).not.toMatch(/auditRows\("NATIVE_SHELL_CONFINEMENT"\)/);
      }
      expect(mapping.sources).toBeUndefined(); // genai.owasp.org is not an official source host
      expect(mapping.description).toMatch(/Signals/);
    }
  });

  test("aliases: owasp-llm is the LLM list, not the API list; owasp-agentic and asi resolve; owasp stays the API list", () => {
    expect(normalizeFrameworkName("owasp-llm")).toBe("OWASP_LLM");
    expect(normalizeFrameworkName("owasp-agentic")).toBe("OWASP_AGENTIC");
    expect(normalizeFrameworkName("asi")).toBe("OWASP_AGENTIC");
    expect(normalizeFrameworkName("OWASP Top 10 for LLM Applications 2025")).toBe("OWASP_LLM");
    expect(normalizeFrameworkName("OWASP Top 10 for Agentic Applications")).toBe("OWASP_AGENTIC");
    expect(normalizeFrameworkName("owasp")).toBe("OWASP_API_TOP10");
    expect(normalizeFrameworkName("OWASP API Security Top 10")).toBe("OWASP_API_TOP10");
    // "owasp-llm" upper-cases to the id itself, so it classifies as exact; "asi" is a true alias.
    expect(classifyFrameworkString("owasp-llm")).toEqual({ framework: "OWASP_LLM", reason: "exact" });
    expect(classifyFrameworkString("asi")).toEqual({ framework: "OWASP_AGENTIC", reason: "alias" });
    for (const framework of ["OWASP_LLM", "OWASP_AGENTIC"] as const) {
      expect(familyReview(framework).status).toBe("experimental");
      expect(familyReview(framework).flags.join(" ")).toMatch(/community/i);
    }
  });

  test("a report over an empty workspace is NOT_EVALUATED everywhere, never a pass", () => {
    const ws = workspace();
    initComplianceMaps(ws);
    for (const framework of ["OWASP_LLM", "OWASP_AGENTIC"] as const) {
      const report = generateComplianceReport({ workspace: ws, agentId: "default", window: "7d", framework });
      expect(report.categories).toHaveLength(10);
      expect(report.categories.every((row) => row.status === "NOT_EVALUATED")).toBe(true);
      expect(report.coverage.satisfied).toBe(0);
      expect(report.coverage.score).toBeNull();
    }
  });

  test("--merge adds the OWASP frameworks to a workspace whose signed maps predate them without touching its own mappings", () => {
    const ws = workspace();
    const custom = { complianceMaps: { version: 1 as const, mappings: [{ id: "operator_soc2", framework: "SOC2", category: "Security",
      description: "operator edit", evidenceRequirements: [{ type: "requires_no_audit" as const, auditTypesDenylist: ["GOVERNANCE_BYPASS_SUCCEEDED"] }],
      related: { questions: [], packs: [], configs: [] } }] } };
    initComplianceMaps(ws, custom);
    const existing = complianceMapsSchema.parse(YAML.parse(readFileSync(complianceMapsPath(ws), "utf8")));
    const merged = mergeMissingBuiltInFrameworks(existing);
    expect(merged.complianceMaps.mappings[0]?.id).toBe("operator_soc2");
    expect(merged.complianceMaps.mappings.filter((row) => row.framework === "SOC2")).toHaveLength(1); // SOC2 present: not replaced
    expect(merged.complianceMaps.mappings.filter((row) => row.framework === "OWASP_LLM")).toHaveLength(10);
    expect(merged.complianceMaps.mappings.filter((row) => row.framework === "OWASP_AGENTIC")).toHaveLength(10);
    initComplianceMaps(ws, merged);
    expect(verifyComplianceMapsSignature(ws).valid).toBe(true);
    const report = generateComplianceReport({ workspace: ws, agentId: "default", window: "7d", framework: "OWASP_AGENTIC" });
    expect(report.configTrusted).toBe(true);
    expect(report.categories).toHaveLength(10);
  });

  test("no surface in this domain pairs a 2025 id with a 2023 title", () => {
    // The 2023 v1.1 scorer says so in every risk title; the packs that cite 2023 ids name the edition.
    expect(scoreOWASPLLMCoverage().risks.every((risk) => /:2023 /.test(risk.title))).toBe(true);
    expect(getAssurancePack("excessive-agency").title).toMatch(/LLM08:2023, LLM06:2025/);
    expect(getAssurancePack("overreliance").title).toMatch(/LLM09:2023/);
    expect(getAssurancePack("owaspGenAI").title).toMatch(/2023 v1\.1/);
    const llm = owaspLlmTop10Mappings.map((row) => row.category);
    expect(llm[5]).toBe("LLM06:2025 Excessive Agency");
    expect(llm[1]).toBe("LLM02:2025 Sensitive Information Disclosure");
  });
});
