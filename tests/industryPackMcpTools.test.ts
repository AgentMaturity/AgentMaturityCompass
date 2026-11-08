import { afterEach, describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  INDUSTRY_PACKS,
  getStationSummary,
  scoreIndustryPack,
  type IndustryPackId,
} from "../src/domains/industryPacks.js";
import { listDomainIds } from "../src/domains/domainRegistry.js";
import {
  INDUSTRY_PACK_TOOL_METADATA,
  INDUSTRY_PACK_TOOL_NAMES,
  registerIndustryPackTools,
  type IndustryPackToolOptions,
} from "../src/mcp/industryPackTools.js";

const clients: Client[] = [];
afterEach(async () => {
  for (const c of clients) await c.close();
  clients.length = 0;
  vi.restoreAllMocks();
});

/** Industry Packs are free: the tools take no licence or entitlement. */
async function connect(options: IndustryPackToolOptions = {}): Promise<Client> {
  const server = new McpServer({ name: "amc-test", version: "0.0.0" });
  registerIndustryPackTools(server, options);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "o17-test", version: "0.0.0" });
  await client.connect(clientTransport);
  clients.push(client);
  return client;
}

interface ToolOutcome {
  isError: boolean;
  text: string;
  body: Record<string, unknown>;
}

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
  const result = (await client.callTool({ name, arguments: args })) as {
    isError?: boolean;
    content: Array<{ type: string; text: string }>;
  };
  const text = result.content[0]?.text ?? "";
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    body = {};
  }
  return { isError: result.isError === true, text, body };
}

const [LIST, GET, SCORE, SUMMARY] = [
  "amc_list_industry_packs",
  "amc_get_industry_pack",
  "amc_score_industry_pack",
  "amc_industry_station_summary",
];

describe("industry pack MCP tools — registration", () => {
  it("registers exactly the four read-only tools", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...INDUSTRY_PACK_TOOL_NAMES].sort());
    expect([...INDUSTRY_PACK_TOOL_NAMES].sort()).toEqual([LIST, GET, SCORE, SUMMARY].sort());
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.annotations?.openWorldHint).toBe(false);
    }
  });

  it("no tool description or metadata entry says a licence is needed: Industry Packs are free", async () => {
    const { tools } = await (await connect()).listTools();
    for (const description of [...tools.map((t) => t.description ?? ""), ...INDUSTRY_PACK_TOOL_METADATA.map((t) => t.description)]) {
      expect(description).not.toMatch(/(needs|requires) an Industry Packs licence|\blocked\b/i);
    }
  });
});

describe("amc_list_industry_packs", () => {
  it("lists 41 packs across 7 stations", async () => {
    const client = await connect();
    const out = await call(client, LIST, {});
    expect(out.isError).toBe(false);
    const stations = out.body.stations as Array<{ stationId: string; packs: Array<{ packId: string; domain: string }> }>;
    expect(stations).toHaveLength(7);
    expect(stations.map((s) => s.stationId)).toEqual(listDomainIds());
    const all = stations.flatMap((s) => s.packs);
    expect(all).toHaveLength(41);
    expect(out.body.packCount).toBe(41);
    expect(new Set(all.map((p) => p.packId))).toEqual(new Set(Object.keys(INDUSTRY_PACKS)));
    for (const s of stations) for (const p of s.packs) expect(p.domain).toBe(s.stationId);
  });

  it("filters by station", async () => {
    const client = await connect();
    const out = await call(client, LIST, { station: "health" });
    const stations = out.body.stations as Array<{ stationId: string; packs: unknown[] }>;
    expect(stations).toHaveLength(1);
    expect(stations[0]!.stationId).toBe("health");
    const expected = Object.values(INDUSTRY_PACKS).filter((p) => p.stationId === "health").length;
    expect(stations[0]!.packs).toHaveLength(expected);
    expect(out.body.packCount).toBe(expected);
  });

  it("lists every pack unlocked, with its public catalog fields: Industry Packs are free", async () => {
    const out = await call(await connect(), LIST, { station: "governance" });
    const packs = (out.body.stations as Array<{ packs: Array<Record<string, unknown>> }>)[0]!.packs;
    expect(packs.length).toBeGreaterThan(0);
    for (const p of packs) {
      expect(p.locked).toBe(false);
      expect(p.regulatoryBasis).toEqual(INDUSTRY_PACKS[p.packId as IndustryPackId].regulatoryBasis);
      expect(p.complianceFrameworks).toEqual(INDUSTRY_PACKS[p.packId as IndustryPackId].complianceFrameworks);
    }
  });

  it("rejects an unknown station and unknown arguments at the schema", async () => {
    const client = await connect();
    const bad = await call(client, LIST, { station: "mars" });
    expect(bad.isError).toBe(true);
    expect(bad.text).toMatch(/Input validation error/);
    const extra = await call(client, LIST, { station: "health", workspace: "/etc" });
    expect(extra.isError).toBe(true);
    expect(extra.text).toMatch(/Input validation error/);
  });
});

describe("amc_get_industry_pack", () => {
  it("refuses an unknown pack id with a structured error, not a throw", async () => {
    const client = await connect();
    const out = await call(client, GET, { packId: "no-such-pack" });
    expect(out.isError).toBe(true);
    expect(out.body.ok).toBe(false);
    const error = out.body.error as { code: string; packId: string; availablePackIds: string[] };
    expect(error.code).toBe("unknown_pack_id");
    expect(error.packId).toBe("no-such-pack");
    expect(error.availablePackIds).toHaveLength(41);
  });

  it("refuses prototype keys as unknown pack ids", async () => {
    const client = await connect();
    for (const packId of ["__proto__", "constructor", "toString"]) {
      const out = await call(client, GET, { packId });
      expect(out.isError).toBe(true);
      expect((out.body.error as { code: string }).code).toBe("unknown_pack_id");
    }
  });

  it("returns questions, regulatoryBasis, frameworks and EU AI Act class with no licence", async () => {
    const client = await connect();
    const out = await call(client, GET, { packId: "clinical-trials" });
    expect(out.isError).toBe(false);
    const pack = INDUSTRY_PACKS["clinical-trials"];
    const got = out.body.pack as Record<string, unknown>;
    expect(got.id).toBe(pack.id);
    expect(got.stationId).toBe(pack.stationId);
    expect(got.questions).toEqual(pack.questions);
    expect(got.regulatoryBasis).toEqual(pack.regulatoryBasis);
    expect(got.complianceFrameworks).toEqual(pack.complianceFrameworks);
    expect(got.euAIActClassification).toBe(pack.euAIActClassification);
  });
});

describe("amc_score_industry_pack", () => {
  it("refuses an unknown pack id with a structured error", async () => {
    const client = await connect();
    const out = await call(client, SCORE, { packId: "no-such-pack", responses: {} });
    expect(out.isError).toBe(true);
    expect((out.body.error as { code: string }).code).toBe("unknown_pack_id");
  });

  it("refuses response keys that are not questions of the pack", async () => {
    const client = await connect();
    const out = await call(client, SCORE, { packId: "farm-to-fork", responses: { "NOT-A-Q": 3 } });
    expect(out.isError).toBe(true);
    const error = out.body.error as { code: string; questionIds: string[] };
    expect(error.code).toBe("unknown_question_id");
    expect(error.questionIds).toEqual(["NOT-A-Q"]);
  });

  it("rejects out-of-range and non-integer levels at the schema", async () => {
    const client = await connect();
    const qid = INDUSTRY_PACKS["farm-to-fork"].questions[0]!.id;
    for (const level of [0, 6, 2.5]) {
      const out = await call(client, SCORE, { packId: "farm-to-fork", responses: { [qid]: level } });
      expect(out.isError).toBe(true);
      expect(out.text).toMatch(/Input validation error/);
    }
  });

  it("returns the shared scoreIndustryPack result, which leaves unanswered questions not evaluated", async () => {
    const client = await connect();
    const pack = INDUSTRY_PACKS["digital-payments"];
    const all = Object.fromEntries(pack.questions.map((q) => [q.id, 4]));
    const full = await call(client, SCORE, { packId: pack.id, responses: all });
    expect(full.isError).toBe(false);
    expect(full.body.result).toEqual(scoreIndustryPack(pack.id, all));
    const partial = Object.fromEntries(pack.questions.slice(0, 3).map((q) => [q.id, 4]));
    const out = await call(client, SCORE, { packId: pack.id, responses: partial });
    expect(out.isError).toBe(false);
    expect(out.body.result).toEqual(scoreIndustryPack(pack.id, partial));
    expect((out.body.result as { notEvaluatedQuestionIds: string[] }).notEvaluatedQuestionIds).toEqual(pack.questions.slice(3).map((q) => q.id));
  });
});

describe("amc_industry_station_summary", () => {
  it("matches getStationSummary, frameworks included, for all 7 stations", async () => {
    const client = await connect();
    for (const stationId of listDomainIds()) {
      const out = await call(client, SUMMARY, { station: stationId });
      expect(out.isError).toBe(false);
      expect(out.body.summary).toEqual(getStationSummary(stationId));
    }
  });
});

describe("guards shared with the host server", () => {
  it("turns a beforeCall refusal into a structured rate_limited error", async () => {
    const client = await connect({
      beforeCall: () => {
        throw new Error("Rate limit exceeded");
      },
    });
    for (const [name, args] of [
      [LIST, {}],
      [GET, { packId: "blockchain" }],
      [SCORE, { packId: "blockchain", responses: {} }],
      [SUMMARY, { station: "wealth" }],
    ] as const) {
      const out = await call(client, name, args);
      expect(out.isError).toBe(true);
      expect((out.body.error as { code: string }).code).toBe("rate_limited");
    }
  });

  it("makes no network calls", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network forbidden"));
    const client = await connect();
    await call(client, LIST, {});
    await call(client, GET, { packId: "blockchain" });
    await call(client, SCORE, { packId: "blockchain", responses: {} });
    await call(client, SUMMARY, { station: "technology" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
