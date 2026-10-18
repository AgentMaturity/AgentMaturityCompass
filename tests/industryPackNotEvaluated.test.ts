import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerDomainProductCliCommands } from "../src/cli-domain-product-commands.js";
import { buildIndustryPackAudit, renderIndustryPackAuditMarkdown } from "../src/domains/industryPackAudit.js";
import { INDUSTRY_PACKS, scoreIndustryPack } from "../src/domains/industryPacks.js";
import { createAmcMcpServer, resetRateLimiter } from "../src/mcp/amcMcpServer.js";
import { testIndustryPackLicence, type TestIndustryPackLicence } from "./helpers/industryPackLicence.js";

/**
 * P1-44 (truth rule 2): an unanswered pack question is not evaluated. The shared scorer gives it no level, so no
 * percentage or level exists until every question is answered, and the CLI, both MCP tools and the pack audit
 * report that same result.
 */
const PACK = INDUSTRY_PACKS["digital-payments"];
const ALL = Object.fromEntries(PACK.questions.map((q) => [q.id, 4]));
const ALL_IDS = PACK.questions.map((q) => q.id);

describe("the shared scorer (scoreIndustryPack)", () => {
  test("no answers: nothing evaluated, no percentage, no level, no gap", () => {
    const result = scoreIndustryPack(PACK.id, {});
    expect(result.notEvaluatedQuestionIds).toEqual(ALL_IDS);
    expect(result.percentage).toBeNull();
    expect(result.level).toBeNull();
    expect(result.eligibleLevel).toBeNull();
    expect(result.questionResults).toEqual([]);
    expect(result.complianceGaps).toEqual([]);
    expect(result.selfAssessment).toEqual({ complete: false, answered: 0, total: ALL_IDS.length });
  });

  test("one question unanswered: it is listed, the others are reported, and no overall score exists", () => {
    const [missing, ...rest] = PACK.questions;
    const result = scoreIndustryPack(PACK.id, Object.fromEntries(rest.map((q) => [q.id, 2])));
    expect(result.notEvaluatedQuestionIds).toEqual([missing!.id]);
    expect(result.percentage).toBeNull();
    expect(result.level).toBeNull();
    expect(result.eligibleLevel).toBeNull();
    expect(result.questionResults.map((r) => r.id)).toEqual(rest.map((q) => q.id));
    expect(result.complianceGaps.some((gap) => gap.startsWith(`${missing!.id} `))).toBe(false);
  });

  test("every question answered: a self-reported score and nothing left unevaluated", () => {
    const result = scoreIndustryPack(PACK.id, ALL);
    expect(result.notEvaluatedQuestionIds).toEqual([]);
    expect(result.percentage).toBe(75);
    expect(result.level).toBeGreaterThan(1);
    expect(result.eligibleLevel).toBe(1);
  });
});

describe("surfaces report the shared result", () => {
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

  test("CLI: amc domain pack run --baseline --json reports every question not evaluated and no score", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => { lines.push(args.map(String).join(" ")); });
    const domainCmd = new Command("domain").exitOverride();
    registerDomainProductCliCommands({ product: new Command("product"), productGlossary: new Command("glossary"), domainCmd });
    await domainCmd.parseAsync(["pack", "run", "--pack", PACK.id, "--baseline", "--json"], { from: "user" });
    const out = JSON.parse(lines.join("\n")) as Record<string, unknown>;
    expect(out.notEvaluatedQuestionIds).toEqual(ALL_IDS);
    expect(out.percentage).toBeNull();
    expect(out.level).toBeNull();
    expect(out.eligibleLevel).toBeNull();
    expect(out.complianceGaps).toEqual([]);
    expect(out.claimKind).toBe("self_reported");
    expect((out.statusDimensions as { result: string }).result).toBe("not_evaluated");
  });

  async function mcp() {
    const workspace = mkdtempSync(join(tmpdir(), "amc-p144-ne-"));
    roots.push(workspace);
    const server = createAmcMcpServer(workspace);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "p144-ne", version: "1" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    return { client, close: async () => { await client.close(); await server.close(); } };
  }

  test("MCP amc_score_sector_pack: no score or level for unanswered questions", async () => {
    const { client, close } = await mcp();
    try {
      const partial = await client.callTool({ name: "amc_score_sector_pack", arguments: { packId: PACK.id, responses: { [ALL_IDS[0]!]: 5 } } });
      const text = (partial.content as Array<{ text: string }>)[0]!.text;
      expect(partial.isError).toBeFalsy();
      expect(text).toContain(`not evaluated: ${ALL_IDS.length - 1} of ${ALL_IDS.length} questions unanswered`);
      expect(text).not.toMatch(/\*\*Score:\*\* \d|\*\*Maturity Level:\*\* L\d/);
      expect(text).not.toContain(`${ALL_IDS[1]} (`);
      const full = await client.callTool({ name: "amc_score_sector_pack", arguments: { packId: PACK.id, responses: ALL } });
      expect((full.content as Array<{ text: string }>)[0]!.text).toContain("**Score:** 75%");
    } finally {
      await close();
    }
  });

  test("MCP amc_score_industry_pack: returns the shared result unchanged", async () => {
    const { client, close } = await mcp();
    try {
      const out = await client.callTool({ name: "amc_score_industry_pack", arguments: { packId: PACK.id, responses: {} } });
      const body = JSON.parse((out.content as Array<{ text: string }>)[0]!.text) as { result: Record<string, unknown> };
      expect(body.result).toEqual(scoreIndustryPack(PACK.id, {}));
      expect(body.result.notEvaluatedQuestionIds).toEqual(ALL_IDS);
      expect(body.result.level).toBeNull();
    } finally {
      await close();
    }
  });
});

describe("the pack audit uses the same rule", () => {
  test("an unanswered control is not evaluated: no level, no gap, and the overall has no score", () => {
    const [missing, ...rest] = PACK.questions;
    const audit = buildIndustryPackAudit({ pack: PACK, responses: Object.fromEntries(rest.map((q) => [q.id, 4])), now: 1_700_000_000_000 });
    const control = audit.controls.find((c) => c.id === missing!.id)!;
    expect(control.level).toBeNull();
    expect(control.status).toBe("NOT_EVALUATED");
    expect(audit.overall.percentage).toBeNull();
    expect(audit.overall.level).toBeNull();
    expect(audit.overall.notEvaluatedQuestionIds).toEqual([missing!.id]);
    expect(audit.overall.gapCount + audit.overall.adequateCount + audit.overall.passCount).toBe(rest.length);
    const markdown = renderIndustryPackAuditMarkdown(audit);
    expect(markdown).toContain(`### ${missing!.id} — ${missing!.dimension} · not evaluated (no answer)`);
    expect(markdown).not.toMatch(/Overall \(self-reported\): \d/);
  });
});
