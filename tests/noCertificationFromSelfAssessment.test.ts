import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import YAML from "yaml";
import { assessDomain } from "../src/domains/domainAssessmentEngine.js";
import { buildDomainReport } from "../src/domains/domainReportBuilder.js";
import { buildIndustryPackAudit, renderIndustryPackAuditMarkdown } from "../src/domains/industryPackAudit.js";
import { listIndustryPacks, scoreIndustryPack, type IndustryPack } from "../src/domains/industryPacks.js";
import { getDomainPackQuestions } from "../src/score/domainPacks.js";
import type { Level0to5, Likert1to5 } from "../src/score/units.js";
import { generateTransparencyReport, renderTransparencyReportMarkdown } from "../src/transparency/transparencyReport.js";

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>;
const mcpTools = vi.hoisted(() => new Map<string, ToolHandler>());

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class {
    tool(name: string, _description: string, _schema: unknown, handler: ToolHandler) { mcpTools.set(name, handler); }
    resource() {}
    async connect() {}
    async close() {}
  },
  ResourceTemplate: class {}
}));
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({ StdioServerTransport: class {} }));
vi.mock("../src/domains/industryPackEntitlement.js", () => ({
  getIndustryPackEntitlement: () => ({ active: true }),
  formatIndustryPackPaywallMessage: () => "locked"
}));

/** "certif" may appear only inside the negation "not a certification". */
function certificationWords(text: string): string[] {
  return text.replace(/not a certification/gi, "").match(/\w*certif\w*/gi) ?? [];
}

function allFives(pack: IndustryPack): Record<string, number> {
  return Object.fromEntries(pack.questions.map((question) => [question.id, 5]));
}

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** The transparency fixture that read "✅ Certified" before P0-21: integrity 0.95 and level 4.2. */
function highScoringWorkspace(): { workspace: string; agentId: string } {
  const workspace = mkdtempSync(join(tmpdir(), "amc-no-cert-"));
  roots.push(workspace);
  const agentId = "cert-agent";
  const agentDir = join(workspace, ".amc", "agents", agentId);
  mkdirSync(join(agentDir, "runs"), { recursive: true });
  writeFileSync(join(agentDir, "agent.config.yaml"), YAML.stringify({
    id: agentId, agentName: "Cert Agent", role: "assistant", domain: "testing", primaryTasks: ["t"],
    stakeholders: ["dev"], riskTier: "low",
    provider: { templateId: "custom", routePrefix: "/t", upstreamId: "u", baseUrl: "http://localhost:8080", openaiCompatible: true, auth: { type: "none" } },
    environment: "development", createdTs: Date.now(), updatedTs: Date.now()
  }));
  writeFileSync(join(agentDir, "runs", "run-001.json"), JSON.stringify({
    agentId, runId: "run-001", ts: Date.now(), status: "VALID", integrityIndex: 0.95,
    layerScores: [{ layerName: "Tool Use Safety", avgFinalLevel: 4.2, confidenceWeightedFinalLevel: 4 }],
    reportJsonSha256: "a".repeat(64)
  }));
  return { workspace, agentId };
}

describe("no certification from self-assessment (P0-21)", () => {
  test("all-5 answers on every registered pack are a complete self-assessment, not a certification", () => {
    const packs = listIndustryPacks();
    expect(packs.length).toBeGreaterThan(0);
    for (const pack of packs) {
      const result = scoreIndustryPack(pack.id, allFives(pack));
      expect(result.selfAssessment, pack.id).toEqual({ complete: true, answered: pack.questions.length, total: pack.questions.length });
      expect(result.claimKind, pack.id).toBe("self_reported");
      expect(result.eligibleLevel, pack.id).not.toBeNull();
      expect(result.eligibleLevel!, pack.id).toBeLessThanOrEqual(1);
      expect(result.percentage, pack.id).toBe(100);
      expect("certified" in result, pack.id).toBe(false);
    }
  });

  test("a partial self-assessment is reported as incomplete", () => {
    const pack = listIndustryPacks()[0]!;
    const result = scoreIndustryPack(pack.id, { [pack.questions[0]!.id]: 5 });
    expect(result.selfAssessment).toEqual({ complete: false, answered: 1, total: pack.questions.length });
  });

  test("an answer outside 1-5 is refused, not clamped", () => {
    const pack = listIndustryPacks()[0]!;
    expect(() => scoreIndustryPack(pack.id, { [pack.questions[0]!.id]: 6 })).toThrow(RangeError);
  });

  test("the pack audit reports a self-reported overall with no certified field", () => {
    for (const pack of listIndustryPacks()) {
      const audit = buildIndustryPackAudit({ pack, responses: allFives(pack), now: 1_700_000_000_000 });
      expect(audit.schemaVersion).toBe("amc.industry-pack-audit/2");
      expect("certified" in audit.overall, pack.id).toBe(false);
      expect(audit.overall.claimKind).toBe("self_reported");
      expect(audit.overall.eligibleLevel!).toBeLessThanOrEqual(1);
      expect(audit.overall.selfAssessment.complete).toBe(true);
      const markdown = renderIndustryPackAuditMarkdown(audit);
      // Control text quotes third-party schemes (e.g. "organic certification"); the summary must not certify.
      const summary = markdown.slice(0, markdown.indexOf("## Framework coverage"));
      expect(summary).toContain("Overall (self-reported): 100% · self-assessment complete: yes · claim kind: self-reported");
      expect(certificationWords(summary), pack.id).toEqual([]);
    }
  });

  test("the domain report carries no certification field or wording", () => {
    const report = buildDomainReport(assessDomain({
      agentId: "agent-tech",
      domain: "technology",
      baseScores: { "AMC-1.1": 5, "AMC-1.2": 5 } as Record<string, Level0to5>,
      domainQuestionScores: Object.fromEntries(getDomainPackQuestions("technology").map((q) => [q.id, 5])) as Record<string, Likert1to5>
    }));
    expect(certificationWords(JSON.stringify(report))).toEqual([]);
  });

  test("the transparency report shows evidence standing, never certification", () => {
    const { workspace, agentId } = highScoringWorkspace();
    const report = generateTransparencyReport(agentId, workspace);
    expect(report.identity.evidenceStanding).toBe("evidence_supported");
    expect("certificationStatus" in report.identity).toBe(false);
    const markdown = renderTransparencyReportMarkdown(report);
    expect(markdown).toContain("Evidence standing");
    expect(certificationWords(markdown)).toEqual([]);
  });

  test("MCP sector-pack and trust-score text say self-assessment and evidence standing", async () => {
    const { startMcpServer } = await import("../src/mcp/amcMcpServer.js");
    await startMcpServer();
    const pack = listIndustryPacks()[0]!;
    const sector = await mcpTools.get("amc_score_sector_pack")!({ packId: pack.id, responses: allFives(pack) });
    const sectorText = sector.content[0]!.text;
    expect(sectorText).toContain("Self-assessment: complete (self-reported; not a certification)");
    expect(certificationWords(sectorText)).toEqual([]);

    const { workspace, agentId } = highScoringWorkspace();
    for (const tool of ["amc_quickscore", "amc_score_agent"]) {
      const out = await mcpTools.get(tool)!({ agentId, workspace });
      const text = out.content[0]!.text;
      expect(text, tool).toContain("Evidence standing");
      expect(certificationWords(text), tool).toEqual([]);
    }
  });
});
