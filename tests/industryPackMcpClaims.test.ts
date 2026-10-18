import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { INDUSTRY_PACKS } from "../src/domains/industryPacks.js";
import { getIndustryPackEntitlement } from "../src/domains/industryPackEntitlement.js";
import { registerIndustryPackTools, type IndustryPackToolOptions } from "../src/mcp/industryPackTools.js";
import { testIndustryPackLicence, type TestIndustryPackLicence } from "./helpers/industryPackLicence.js";

/**
 * P1-44: every O17 tool result carries a claim kind from the shared service, scoring is self-reported and never
 * `certified`, unanswered questions are not evaluated (no default level), and a licence changes access, never a result.
 */
const cleanups: Array<() => void> = [];
const clients: Client[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) await c.close();
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-p144-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A licence signed by a key pinned in a temp AMC home trust list (P1-51), or that home with no licence. */
function options(licensed: boolean): IndustryPackToolOptions {
  const licence: TestIndustryPackLicence = testIndustryPackLicence();
  cleanups.push(licence.cleanup);
  const ws = workspace();
  const env = licensed ? { ...licence.env } : { AMC_HOME: licence.amcHome };
  return { resolveEntitlement: () => getIndustryPackEntitlement(ws, env as NodeJS.ProcessEnv) };
}

async function connect(opts: IndustryPackToolOptions): Promise<Client> {
  const server = new McpServer({ name: "amc-p144", version: "0.0.0" });
  registerIndustryPackTools(server, opts);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "p144", version: "0.0.0" });
  await client.connect(clientTransport);
  clients.push(client);
  return client;
}

interface Outcome {
  isError: boolean;
  texts: string[];
  body: Record<string, unknown>;
  structured: Record<string, unknown> | undefined;
}

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<Outcome> {
  const result = (await client.callTool({ name, arguments: args })) as {
    isError?: boolean;
    content: Array<{ text: string }>;
    structuredContent?: Record<string, unknown>;
  };
  const texts = result.content.map((c) => c.text);
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(texts[0] ?? "") as Record<string, unknown>;
  } catch {
    body = {};
  }
  return { isError: result.isError === true, texts, body, structured: result.structuredContent };
}

/** Every key anywhere in a JSON value. */
function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => [k, ...keysOf(v)]);
  return [];
}

const PACK = INDUSTRY_PACKS["digital-payments"];
const ALL_ANSWERED = Object.fromEntries(PACK.questions.map((q) => [q.id, 5]));

describe("amc_score_industry_pack claims", () => {
  it("all questions answered: self_reported with status dimensions, and no certified key anywhere", async () => {
    const out = await call(await connect(options(true)), "amc_score_industry_pack", { packId: PACK.id, responses: ALL_ANSWERED });
    expect(out.isError).toBe(false);
    expect(out.structured?.claimKind).toBe("self_reported");
    expect(out.structured?.statusDimensions).toMatchObject({ result: "not_evaluated", evidence: "incomplete" });
    expect(out.texts[1]).toMatch(/self-reported/i);
    expect(out.body.notEvaluatedQuestionIds).toEqual([]);
    const result = out.body.result as Record<string, unknown>;
    expect(result.claimKind).toBe("self_reported");
    expect(result.eligibleLevel).toBeLessThanOrEqual(1);
    expect(result.selfAssessment).toEqual({ complete: true, answered: PACK.questions.length, total: PACK.questions.length });
    for (const view of [out.body, out.structured]) expect(keysOf(view)).not.toContain("certified");
    expect(out.texts.join("\n")).not.toMatch(/"certified"|certified:/i);
  });

  it("one question unanswered: listed as not evaluated, and no level or percentage is computed", async () => {
    const [missing, ...answered] = PACK.questions;
    const responses = Object.fromEntries(answered.map((q) => [q.id, 4]));
    const out = await call(await connect(options(true)), "amc_score_industry_pack", { packId: PACK.id, responses });
    expect(out.isError).toBe(false);
    expect(out.body.notEvaluatedQuestionIds).toEqual([missing!.id]);
    expect(out.body.result).toBeNull();
    expect(out.body.selfAssessment).toEqual({ complete: false, answered: answered.length, total: PACK.questions.length });
    for (const view of [out.body, out.structured]) {
      expect(keysOf(view)).not.toContain("level");
      expect(keysOf(view)).not.toContain("percentage");
      expect(keysOf(view)).not.toContain("certified");
    }
    expect(out.structured?.claimKind).toBe("self_reported");
  });

  it("the tool description says unanswered questions are not evaluated", async () => {
    const { tools } = await (await connect(options(false))).listTools();
    const score = tools.find((t) => t.name === "amc_score_industry_pack")!;
    expect(score.description).toMatch(/not evaluated/i);
    expect(score.description).not.toMatch(/score as L1/i);
  });
});

describe("every O17 result carries a claim kind", () => {
  it.each([
    ["amc_list_industry_packs", {}],
    ["amc_get_industry_pack", { packId: PACK.id }],
    ["amc_score_industry_pack", { packId: PACK.id, responses: ALL_ANSWERED }],
    ["amc_industry_station_summary", { station: "wealth" }],
  ] as const)("%s", async (name, args) => {
    const out = await call(await connect(options(true)), name, args);
    expect(out.isError).toBe(false);
    expect(["synthetic_example", "self_reported", "observed", "independently_reviewed"]).toContain(out.structured?.claimKind);
    expect(out.structured?.statusDimensions).toBeDefined();
    expect(out.texts[1]).toContain("Claim kinds: see docs/CLAIM_KINDS.md");
    expect(keysOf(out.body)).not.toContain("certified");
  });
});

describe("prototype keys are unknown packs", () => {
  it.each(["__proto__", "constructor", "toString"])("%s", async (packId) => {
    const client = await connect(options(true));
    for (const [name, args] of [
      ["amc_get_industry_pack", { packId }],
      ["amc_score_industry_pack", { packId, responses: {} }],
    ] as const) {
      const out = await call(client, name, args);
      expect(out.isError, name).toBe(true);
      expect((out.body.error as { code: string }).code, name).toBe("unknown_pack_id");
    }
  });
});

describe("a licence changes access, never a result (D-06 = B)", () => {
  it("list and station summary return the same result with and without a licence, apart from the locked flag", async () => {
    const on = await connect(options(true));
    const off = await connect(options(false));
    const unlock = (body: Record<string, unknown>) => JSON.parse(JSON.stringify(body).replace(/"locked":(true|false)/g, '"locked":null'));
    for (const [name, args] of [
      ["amc_list_industry_packs", {}],
      ["amc_list_industry_packs", { station: "health" }],
      ["amc_industry_station_summary", { station: "governance" }],
    ] as const) {
      const [a, b] = [await call(on, name, args), await call(off, name, args)];
      expect(unlock(a.body)).toEqual(unlock(b.body));
      expect(a.structured?.claimKind).toBe(b.structured?.claimKind);
    }
  });

  it("pack content and scoring are refused with the one paywall message while locked", async () => {
    const off = await connect(options(false));
    for (const [name, args] of [
      ["amc_get_industry_pack", { packId: PACK.id }],
      ["amc_score_industry_pack", { packId: PACK.id, responses: ALL_ANSWERED }],
    ] as const) {
      const out = await call(off, name, args);
      expect(out.isError, name).toBe(true);
      const error = out.body.error as { code: string; message: string };
      expect(error.code).toBe("industry_packs_locked");
      expect(error.message).toContain("Industry Packs are locked");
      expect(error.message).toContain(name);
      expect(error.message).toContain("it never changes a score");
      expect(out.texts.join("\n")).not.toContain(PACK.questions[0]!.text);
    }
  });
});
