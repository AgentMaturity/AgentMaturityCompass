import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildMcpTrustReceipt, previousHashMap } from "../src/shield/mcpTrustLedger.js";

/** What the ledger reports as changed: removed servers, and every tool when the previous record could not be read. */
describe("MCP trust ledger change report", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "amc-mcp-ledger-change-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const write = (name: string, body: unknown) => { const p = join(dir, name); writeFileSync(p, JSON.stringify(body)); return p; };

  test("a server in the previous receipt that is gone now is reported as removed; an unchanged one is not", () => {
    write("keep.json", { name: "keep", tools: [{ name: "read", description: "read a file" }] });
    const x = write("x.json", { name: "x", tools: [{ name: "read", description: "read a file" }] });
    const y = write("y.json", { name: "y", tools: [{ name: "read", description: "read a file" }] });
    const gone = write("gone.json", { name: "gone", tools: [{ name: "noop", description: "does nothing" }] });
    write("notes.txt", "ignored: not a definition file");
    const first = buildMcpTrustReceipt({ targets: [dir], generatedAt: 1 });
    expect(first.serverCount).toBe(4);
    expect(first.changedSincePrevious).toBeNull();
    expect(first.changedTools).toBeNull();
    unlinkSync(gone);
    write("y.json", { name: "y", tools: [{ name: "write", description: "write a file" }] });
    write("x.json", { name: "x", tools: [{ name: "write", description: "write a file" }] });
    const second = buildMcpTrustReceipt({ targets: [dir], generatedAt: 2, previous: previousHashMap(first) });
    expect(second.changedSincePrevious).toEqual([x, y, `${gone} (removed)`]);
  });

  test("an unreadable previous record counts every current tool as changed in both description and schema", () => {
    write("a.json", { name: "a", tools: [{ name: "zeta", description: "z" }, { name: "alpha", description: "a" }] });
    const receipt = buildMcpTrustReceipt({ targets: [dir], generatedAt: 1, previousEntries: "unreadable" });
    expect(receipt.changedTools).toEqual([
      { server: "a", tool: "alpha", changed: ["description", "schema"] },
      { server: "a", tool: "zeta", changed: ["description", "schema"] },
    ]);
  });

  test("a tool new to a known server, or a server the previous record never had, is not a changed tool", () => {
    write("a.json", { name: "a", tools: [{ name: "read", description: "read a file", inputSchema: { type: "object" } }] });
    write("c.json", { name: "c", tools: [{ name: "read", description: "read" }] });
    const first = buildMcpTrustReceipt({ targets: [dir], generatedAt: 1 });
    write("a.json", { name: "a", tools: [{ name: "read", description: "read a file", inputSchema: { type: "object", properties: { p: { type: "string" } } } },
      { name: "write", description: "write a file" }] });
    write("c.json", { name: "c", tools: [{ name: "read", description: "read a file" }] });
    write("b.json", { name: "b", tools: [{ name: "read", description: "other" }] });
    const second = buildMcpTrustReceipt({ targets: [dir], generatedAt: 2, previousEntries: first.entries });
    expect(second.changedTools).toEqual([{ server: "a", tool: "read", changed: ["schema"] }, { server: "c", tool: "read", changed: ["description"] }]);
  });

  test("a file named twice, directly and through its folder, is scanned once", () => {
    const a = write("a.json", { name: "a", tools: [{ name: "read", description: "read a file" }] });
    const receipt = buildMcpTrustReceipt({ targets: [a, dir, a], generatedAt: 1 });
    expect(receipt.entries.map((e) => e.path)).toEqual([a]);
  });

  test("no target gives an empty, clean receipt at the lowest level", () => {
    const receipt = buildMcpTrustReceipt({ targets: [], generatedAt: 1 });
    expect(receipt).toMatchObject({ serverCount: 0, lowestLevel: "L0", aggregateRisk: "CLEAN", cleanAsOf: true, entries: [] });
  });
});
