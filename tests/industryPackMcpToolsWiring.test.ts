import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// startMcpServer() always connects a stdio transport; swap it for one end of an
// in-memory pair so the real server, with its real rate limiter, is exercised.
const pair = vi.hoisted(() => ({ client: undefined as unknown, server: undefined as unknown }));
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", async () => {
  const { InMemoryTransport: Linked } = await import("@modelcontextprotocol/sdk/inMemory.js");
  return {
    StdioServerTransport: class {
      constructor() {
        const [client, server] = Linked.createLinkedPair();
        pair.client = client;
        pair.server = server;
        return server;
      }
    },
  };
});

const { startMcpServer, resetRateLimiter } = await import("../src/mcp/amcMcpServer.js");

let client: Client | undefined;
const listenersBefore = { int: process.listeners("SIGINT"), term: process.listeners("SIGTERM") };
afterEach(async () => {
  await client?.close();
  client = undefined;
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    const keep = sig === "SIGINT" ? listenersBefore.int : listenersBefore.term;
    for (const l of process.listeners(sig)) if (!keep.includes(l)) process.off(sig, l);
  }
  resetRateLimiter();
});

async function connectRealServer(): Promise<Client> {
  await startMcpServer();
  client = new Client({ name: "o17-wiring", version: "0.0.0" });
  await client.connect(pair.client as InMemoryTransport);
  return client;
}

function body(result: unknown): Record<string, unknown> {
  const text = (result as { content: Array<{ text: string }> }).content[0]!.text;
  return JSON.parse(text) as Record<string, unknown>;
}

describe("amc MCP server registers the industry pack tools", () => {
  it("lists them beside the existing tools and serves 41 packs over 7 stations", async () => {
    const c = await connectRealServer();
    const names = (await c.listTools()).tools.map((t) => t.name);
    for (const name of [
      "amc_list_industry_packs",
      "amc_get_industry_pack",
      "amc_score_industry_pack",
      "amc_industry_station_summary",
      "amc_score_sector_pack",
    ]) {
      expect(names).toContain(name);
    }
    const listed = body(await c.callTool({ name: "amc_list_industry_packs", arguments: {} }));
    expect(listed.packCount).toBe(41);
    expect(listed.stations).toHaveLength(7);
  });

  it("refuses an unknown pack id with a structured error", async () => {
    const c = await connectRealServer();
    const result = await c.callTool({ name: "amc_get_industry_pack", arguments: { packId: "nope" } });
    expect(result.isError).toBe(true);
    expect((body(result).error as { code: string }).code).toBe("unknown_pack_id");
  });

  it("shares the server's 60-per-minute rate limiter", async () => {
    const c = await connectRealServer();
    for (let i = 0; i < 60; i++) {
      const r = await c.callTool({ name: "amc_industry_station_summary", arguments: { station: "health" } });
      expect(r.isError).toBeFalsy();
    }
    const limited = await c.callTool({ name: "amc_industry_station_summary", arguments: { station: "health" } });
    expect(limited.isError).toBe(true);
    expect((body(limited).error as { code: string }).code).toBe("rate_limited");
  });
});
