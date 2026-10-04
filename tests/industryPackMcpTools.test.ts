import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
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
  createIndustryPackLicenseKey,
  getIndustryPackEntitlement,
} from "../src/domains/industryPackEntitlement.js";
import {
  INDUSTRY_PACK_TOOL_NAMES,
  registerIndustryPackTools,
  type IndustryPackToolOptions,
} from "../src/mcp/industryPackTools.js";

const dirs: string[] = [];
const clients: Client[] = [];
afterEach(async () => {
  for (const c of clients) await c.close();
  clients.length = 0;
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs.length = 0;
  vi.restoreAllMocks();
});

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-o17-"));
  dirs.push(dir);
  return dir;
}

/** Locked: the real resolver with an empty env and an empty workspace. */
function lockedOptions(): IndustryPackToolOptions {
  const ws = workspace();
  return { resolveEntitlement: () => getIndustryPackEntitlement(ws, {}) };
}

/** Active: the real resolver with a license signed by a per-test, in-memory HMAC value. */
function activeOptions(): IndustryPackToolOptions {
  const ws = workspace();
  const env: NodeJS.ProcessEnv = { AMC_INDUSTRY_PACKS_LICENSE_SECRET: randomBytes(24).toString("hex") };
  env.AMC_INDUSTRY_PACKS_LICENSE_KEY = createIndustryPackLicenseKey({ env });
  return { resolveEntitlement: () => getIndustryPackEntitlement(ws, env) };
}

async function connect(options: IndustryPackToolOptions): Promise<Client> {
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
    const client = await connect(lockedOptions());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...INDUSTRY_PACK_TOOL_NAMES].sort());
    expect([...INDUSTRY_PACK_TOOL_NAMES].sort()).toEqual([LIST, GET, SCORE, SUMMARY].sort());
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.annotations?.openWorldHint).toBe(false);
    }
  });
});

describe("amc_list_industry_packs", () => {
  it("lists 41 packs across 7 stations", async () => {
    const client = await connect(lockedOptions());
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
    const client = await connect(lockedOptions());
    const out = await call(client, LIST, { station: "health" });
    const stations = out.body.stations as Array<{ stationId: string; packs: unknown[] }>;
    expect(stations).toHaveLength(1);
    expect(stations[0]!.stationId).toBe("health");
    const expected = Object.values(INDUSTRY_PACKS).filter((p) => p.stationId === "health").length;
    expect(stations[0]!.packs).toHaveLength(expected);
    expect(out.body.packCount).toBe(expected);
  });

  it("hides gated fields while locked and shows them when active", async () => {
    const locked = await call(await connect(lockedOptions()), LIST, { station: "governance" });
    const lockedPacks = (locked.body.stations as Array<{ packs: Array<Record<string, unknown>> }>)[0]!.packs;
    expect(locked.body.locked).toBe(true);
    for (const p of lockedPacks) {
      expect(p.locked).toBe(true);
      expect(p.regulatoryBasis).toBeUndefined();
      expect(p.complianceFrameworks).toBeUndefined();
    }
    const active = await call(await connect(activeOptions()), LIST, { station: "governance" });
    const activePacks = (active.body.stations as Array<{ packs: Array<Record<string, unknown>> }>)[0]!.packs;
    expect(active.body.locked).toBe(false);
    for (const p of activePacks) {
      expect(p.locked).toBe(false);
      expect(p.regulatoryBasis).toEqual(INDUSTRY_PACKS[p.packId as IndustryPackId].regulatoryBasis);
    }
  });

  it("rejects an unknown station and unknown arguments at the schema", async () => {
    const client = await connect(lockedOptions());
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
    const client = await connect(activeOptions());
    const out = await call(client, GET, { packId: "no-such-pack" });
    expect(out.isError).toBe(true);
    expect(out.body.ok).toBe(false);
    const error = out.body.error as { code: string; packId: string; availablePackIds: string[] };
    expect(error.code).toBe("unknown_pack_id");
    expect(error.packId).toBe("no-such-pack");
    expect(error.availablePackIds).toHaveLength(41);
  });

  it("refuses prototype keys as unknown pack ids", async () => {
    const client = await connect(activeOptions());
    for (const packId of ["__proto__", "constructor", "toString"]) {
      const out = await call(client, GET, { packId });
      expect(out.isError).toBe(true);
      expect((out.body.error as { code: string }).code).toBe("unknown_pack_id");
    }
  });

  it("refuses with industry_packs_locked when the entitlement is inactive", async () => {
    const client = await connect(lockedOptions());
    const out = await call(client, GET, { packId: "clinical-trials" });
    expect(out.isError).toBe(true);
    const error = out.body.error as { code: string; message: string };
    expect(error.code).toBe("industry_packs_locked");
    expect(error.message).toMatch(/Industry Packs are locked/);
    expect(out.text).not.toContain(INDUSTRY_PACKS["clinical-trials"].questions[0]!.text);
  });

  it("returns questions, regulatoryBasis, frameworks and EU AI Act class when active", async () => {
    const client = await connect(activeOptions());
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
    const client = await connect(activeOptions());
    const out = await call(client, SCORE, { packId: "no-such-pack", responses: {} });
    expect(out.isError).toBe(true);
    expect((out.body.error as { code: string }).code).toBe("unknown_pack_id");
  });

  it("refuses when locked", async () => {
    const client = await connect(lockedOptions());
    const out = await call(client, SCORE, { packId: "farm-to-fork", responses: {} });
    expect(out.isError).toBe(true);
    expect((out.body.error as { code: string }).code).toBe("industry_packs_locked");
  });

  it("refuses response keys that are not questions of the pack", async () => {
    const client = await connect(activeOptions());
    const out = await call(client, SCORE, { packId: "farm-to-fork", responses: { "NOT-A-Q": 3 } });
    expect(out.isError).toBe(true);
    const error = out.body.error as { code: string; questionIds: string[] };
    expect(error.code).toBe("unknown_question_id");
    expect(error.questionIds).toEqual(["NOT-A-Q"]);
  });

  it("rejects out-of-range and non-integer levels at the schema", async () => {
    const client = await connect(activeOptions());
    const qid = INDUSTRY_PACKS["farm-to-fork"].questions[0]!.id;
    for (const level of [0, 6, 2.5]) {
      const out = await call(client, SCORE, { packId: "farm-to-fork", responses: { [qid]: level } });
      expect(out.isError).toBe(true);
      expect(out.text).toMatch(/Input validation error/);
    }
  });

  it("returns the scoreIndustryPack result and names unanswered questions", async () => {
    const client = await connect(activeOptions());
    const pack = INDUSTRY_PACKS["digital-payments"];
    const responses = Object.fromEntries(pack.questions.slice(0, 3).map((q) => [q.id, 4]));
    const out = await call(client, SCORE, { packId: pack.id, responses });
    expect(out.isError).toBe(false);
    expect(out.body.result).toEqual(scoreIndustryPack(pack.id, responses));
    expect(out.body.unansweredQuestionIds).toEqual(pack.questions.slice(3).map((q) => q.id));
  });
});

describe("amc_industry_station_summary", () => {
  it("matches getStationSummary for all 7 stations when active", async () => {
    const client = await connect(activeOptions());
    for (const stationId of listDomainIds()) {
      const out = await call(client, SUMMARY, { station: stationId });
      expect(out.isError).toBe(false);
      expect(out.body.summary).toEqual(getStationSummary(stationId));
    }
  });

  it("withholds frameworks while locked", async () => {
    const client = await connect(lockedOptions());
    const out = await call(client, SUMMARY, { station: "wealth" });
    const summary = out.body.summary as Record<string, unknown>;
    expect(summary.packCount).toBe(getStationSummary("wealth").packCount);
    expect(summary.frameworks).toBeUndefined();
    expect(out.body.locked).toBe(true);
  });
});

describe("guards shared with the host server", () => {
  it("turns a beforeCall refusal into a structured rate_limited error", async () => {
    const client = await connect({
      ...activeOptions(),
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
    const client = await connect(activeOptions());
    await call(client, LIST, {});
    await call(client, GET, { packId: "blockchain" });
    await call(client, SCORE, { packId: "blockchain", responses: {} });
    await call(client, SUMMARY, { station: "technology" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
