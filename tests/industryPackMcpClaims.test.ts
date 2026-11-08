import { afterEach, describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { INDUSTRY_PACKS } from "../src/domains/industryPacks.js";
import { registerIndustryPackTools } from "../src/mcp/industryPackTools.js";
import { testIndustryPackLicence } from "./helpers/industryPackLicence.js";

/**
 * P1-44: every O17 tool result carries a claim kind from the shared service, scoring is self-reported and never
 * `certified`, and unanswered questions are not evaluated (no default level). Industry Packs are free: no tool needs a
 * licence, and a legacy licence changes no result.
 */
const cleanups: Array<() => void> = [];
const clients: Client[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) await c.close();
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.unstubAllEnvs();
});

async function connect(): Promise<Client> {
  const server = new McpServer({ name: "amc-p144", version: "0.0.0" });
  registerIndustryPackTools(server);
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
    const out = await call(await connect(), "amc_score_industry_pack", { packId: PACK.id, responses: ALL_ANSWERED });
    expect(out.isError).toBe(false);
    expect(out.structured?.claimKind).toBe("self_reported");
    expect(out.structured?.statusDimensions).toMatchObject({ result: "not_evaluated", evidence: "incomplete" });
    expect(out.texts[1]).toMatch(/self-reported/i);
    const result = out.body.result as Record<string, unknown>;
    expect(result.notEvaluatedQuestionIds).toEqual([]);
    expect(result.claimKind).toBe("self_reported");
    expect(result.eligibleLevel).toBeLessThanOrEqual(1);
    expect(result.selfAssessment).toEqual({ complete: true, answered: PACK.questions.length, total: PACK.questions.length });
    for (const view of [out.body, out.structured]) expect(keysOf(view)).not.toContain("certified");
    expect(out.texts.join("\n")).not.toMatch(/"certified"|certified:/i);
  });

  it("one question unanswered: listed as not evaluated, and no level or percentage is computed", async () => {
    const [missing, ...answered] = PACK.questions;
    const responses = Object.fromEntries(answered.map((q) => [q.id, 4]));
    const out = await call(await connect(), "amc_score_industry_pack", { packId: PACK.id, responses });
    expect(out.isError).toBe(false);
    const result = out.body.result as Record<string, unknown>;
    expect(result.notEvaluatedQuestionIds).toEqual([missing!.id]);
    expect(result.percentage).toBeNull();
    expect(result.level).toBeNull();
    expect(result.eligibleLevel).toBeNull();
    expect(result.selfAssessment).toEqual({ complete: false, answered: answered.length, total: PACK.questions.length });
    for (const view of [out.body, out.structured]) expect(keysOf(view)).not.toContain("certified");
    expect(out.structured?.claimKind).toBe("self_reported");
  });

  it("the tool description says unanswered questions are not evaluated", async () => {
    const { tools } = await (await connect()).listTools();
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
    const out = await call(await connect(), name, args);
    expect(out.isError).toBe(false);
    expect(["synthetic_example", "self_reported", "observed", "independently_reviewed"]).toContain(out.structured?.claimKind);
    expect(out.structured?.statusDimensions).toBeDefined();
    expect(out.texts[1]).toContain("Claim kinds: see docs/CLAIM_KINDS.md");
    expect(keysOf(out.body)).not.toContain("certified");
  });
});

describe("prototype keys are unknown packs", () => {
  it.each(["__proto__", "constructor", "toString"])("%s", async (packId) => {
    const client = await connect();
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

describe("Industry Packs are free: no licence is needed, and a legacy licence changes no result", () => {
  it("every tool answers with no licence, unlocked, and identically, claim included, with a legacy licence", async () => {
    const calls = [
      ["amc_list_industry_packs", {}],
      ["amc_list_industry_packs", { station: "health" }],
      ["amc_get_industry_pack", { packId: PACK.id }],
      ["amc_score_industry_pack", { packId: PACK.id, responses: ALL_ANSWERED }],
      ["amc_industry_station_summary", { station: "governance" }],
    ] as const;
    const free = await connect();
    const unlicensed: Outcome[] = [];
    for (const [name, args] of calls) {
      const out = await call(free, name, args);
      expect(out.isError, name).toBe(false);
      unlicensed.push(out);
    }
    const listed = (unlicensed[0]!.body.stations as Array<{ packs: Array<{ locked: boolean }> }>).flatMap((s) => s.packs);
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.every((pack) => pack.locked === false)).toBe(true);
    expect((unlicensed[2]!.body.pack as { questions: unknown }).questions).toEqual(PACK.questions);
    expect(unlicensed[3]!.structured?.claimKind).toBe("self_reported");

    const licence = testIndustryPackLicence();
    cleanups.push(licence.cleanup);
    for (const [key, value] of Object.entries(licence.env)) vi.stubEnv(key, value);
    const licensed = await connect();
    for (const [i, [name, args]] of calls.entries()) expect(await call(licensed, name, args), name).toEqual(unlicensed[i]);
  });
});
