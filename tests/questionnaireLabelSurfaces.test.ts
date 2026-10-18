import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerDomainProductCliCommands } from "../src/cli-domain-product-commands.js";
import { assessDomain } from "../src/domains/domainAssessmentEngine.js";
import { buildDomainReport } from "../src/domains/domainReportBuilder.js";
import { buildIndustryPackAudit, renderIndustryPackAuditMarkdown } from "../src/domains/industryPackAudit.js";
import { getIndustryPackEntitlement, toIndustryPackCatalogItem } from "../src/domains/industryPackEntitlement.js";
import { INDUSTRY_PACKS, scoreIndustryPack } from "../src/domains/industryPacks.js";
import { QUESTIONNAIRE_NOTICE } from "../src/domains/questionnaireLabel.js";
import { createAmcMcpServer, resetRateLimiter } from "../src/mcp/amcMcpServer.js";
import { testIndustryPackLicence, type TestIndustryPackLicence } from "./helpers/industryPackLicence.js";

/**
 * P1-42 review: every surface that shows a pack score, level or pack listing says the content is experimental and
 * self-reported, not only the raw pack objects.
 */
const PACK = INDUSTRY_PACKS["digital-payments"];
const ALL = Object.fromEntries(PACK.questions.map((q) => [q.id, 4]));
const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("library results carry the content status", () => {
  test("scoreIndustryPack", () => {
    expect(scoreIndustryPack(PACK.id, ALL).contentStatus).toBe("experimental");
  });

  test("the pack catalog item behind pack list, the MCP list and Studio's pack list", () => {
    const entitlement = getIndustryPackEntitlement(mkdtempSync(join(tmpdir(), "amc-label-")));
    expect(toIndustryPackCatalogItem(PACK, entitlement).contentStatus).toBe("experimental");
  });

  test("the pack audit, JSON and Markdown", () => {
    const audit = buildIndustryPackAudit({ pack: PACK, responses: ALL, now: 1_700_000_000_000 });
    expect(audit.contentStatus).toBe("experimental");
    expect(renderIndustryPackAuditMarkdown(audit)).toContain(`- Content: experimental. ${QUESTIONNAIRE_NOTICE}`);
  });

  test("the domain report and its EU AI Act section", () => {
    const report = buildDomainReport(assessDomain({ agentId: "a", domain: "health", baseScores: {}, domainQuestionScores: {} }));
    expect(report.euAIActClassification.contentStatus).toBe("experimental");
    const section = report.markdown.split("## EU AI Act Classification")[1]!.split("\n## ")[0]!;
    expect(section).toContain(`- Status: experimental. ${QUESTIONNAIRE_NOTICE}`);
  });

  test("the package root exports the content status next to the DEEP_* arrays", () => {
    expect(read("src/index.ts")).toMatch(/export \{ QUESTIONNAIRE_CONTENT_STATUS, QUESTIONNAIRE_NOTICE \} from "\.\/domains\/questionnaireLabel\.js";/);
  });
});

describe("rendered surfaces show it", () => {
  test("Studio's pack list and the dashboard's pack cards render the content status", () => {
    expect(read("src/console/assets/app.js")).toMatch(/questions\$\{pack\.contentStatus \? ` · \$\{htmlEscape\(pack\.contentStatus\)\}, self-reported` : ""\}/);
    expect(read("src/dashboard/templates/components/domains.js")).toMatch(/\$\{pack\.contentStatus \? `<span>\$\{esc\(pack\.contentStatus\)\}, self-reported<\/span>` : ''\}/);
    expect(read("src/dashboard/build.ts")).toContain("contentStatus: pack.contentStatus");
  });
});

describe("CLI and MCP", () => {
  let licence: TestIndustryPackLicence;
  const roots: string[] = [];
  beforeEach(() => {
    licence = testIndustryPackLicence();
    vi.stubEnv("AMC_HOME", licence.amcHome);
    vi.stubEnv("AMC_INDUSTRY_PACKS_LICENSE_KEY", licence.licenseKey);
    resetRateLimiter();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    licence.cleanup();
    while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
  });

  async function cli(...args: string[]): Promise<string> {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => { lines.push(parts.map(String).join(" ")); });
    const domainCmd = new Command("domain").exitOverride();
    registerDomainProductCliCommands({ product: new Command("product"), productGlossary: new Command("glossary"), domainCmd });
    await domainCmd.parseAsync(args, { from: "user" });
    return lines.join("\n");
  }

  test("amc domain pack run, text and --json", async () => {
    expect(JSON.parse(await cli("pack", "run", "--pack", PACK.id, "--baseline", "--json")).contentStatus).toBe("experimental");
    expect(await cli("pack", "run", "--pack", PACK.id, "--baseline")).toContain(`Content: experimental. ${QUESTIONNAIRE_NOTICE}`);
  });

  test("amc domain pack list, text and --json", async () => {
    const json = JSON.parse(await cli("pack", "list", "--json")) as { packs: Array<{ contentStatus: string }> };
    expect(new Set(json.packs.map((p) => p.contentStatus))).toEqual(new Set(["experimental"]));
    expect(await cli("pack", "list")).toContain(`Experimental, self-reported questionnaires. ${QUESTIONNAIRE_NOTICE}`);
  });

  test("MCP amc_score_industry_pack and amc_score_sector_pack", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-label-mcp-"));
    roots.push(workspace);
    const server = createAmcMcpServer(workspace);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "p142-labels", version: "1" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const industry = await client.callTool({ name: "amc_score_industry_pack", arguments: { packId: PACK.id, responses: ALL } });
      const body = JSON.parse((industry.content as Array<{ text: string }>)[0]!.text) as { result: { contentStatus: string } };
      expect(body.result.contentStatus).toBe("experimental");
      const sector = await client.callTool({ name: "amc_score_sector_pack", arguments: { packId: PACK.id, responses: ALL } });
      expect((sector.content as Array<{ text: string }>)[0]!.text).toContain(`**Content:** experimental. ${QUESTIONNAIRE_NOTICE}`);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
