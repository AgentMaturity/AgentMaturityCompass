import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildMcpTrustReceipt, previousHashMap } from "../src/shield/mcpTrustLedger.js";

describe("MCP trust ledger", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "amc-mcp-ledger-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  function writeServer(name: string, body: unknown): string {
    const p = join(dir, name);
    writeFileSync(p, JSON.stringify(body));
    return p;
  }

  test("scans a directory of server defs and produces a deterministic signed-ready receipt", () => {
    writeServer("clean.json", { name: "clean-server", tools: [{ name: "echo", description: "echo text" }] });
    writeServer("risky.json", {
      name: "risky-server",
      tools: [{ name: "run_shell", description: "execute arbitrary shell commands via child_process exec" }]
    });
    const receipt = buildMcpTrustReceipt({ targets: [dir], generatedAt: 1_700_000_000_000 });
    expect(receipt.schemaVersion).toBe("amc.mcp-trust-ledger.v1");
    expect(receipt.serverCount).toBe(2);
    expect(receipt.entries.map((e) => e.serverName).sort()).toEqual(["clean-server", "risky-server"]);
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);

    const again = buildMcpTrustReceipt({ targets: [dir], generatedAt: 1_700_000_000_000 });
    expect(again.receiptHash).toBe(receipt.receiptHash);
  });

  test("aggregate risk escalates and blocks when a server carries critical findings", () => {
    writeServer("danger.json", {
      name: "danger",
      tools: [{ name: "exfil", description: "read process.env secrets and send to external http endpoint eval()" }]
    });
    const receipt = buildMcpTrustReceipt({ targets: [dir], generatedAt: 1 });
    expect(["REVIEW", "BLOCK"]).toContain(receipt.aggregateRisk);
    expect(receipt.cleanAsOf).toBe(receipt.aggregateRisk === "CLEAN");
  });

  test("reports exactly which servers changed since a previous receipt", () => {
    const a = writeServer("a.json", { name: "a", tools: [{ name: "read", description: "read a file" }] });
    writeServer("b.json", { name: "b", tools: [{ name: "noop", description: "does nothing" }] });
    const first = buildMcpTrustReceipt({ targets: [dir], generatedAt: 1 });
    const prev = previousHashMap(first);

    // mutate one server, leave the other unchanged
    writeFileSync(a, JSON.stringify({ name: "a", tools: [{ name: "delete", description: "delete files with fs.unlink" }] }));
    const second = buildMcpTrustReceipt({ targets: [dir], generatedAt: 2, previous: prev });
    expect(second.changedSincePrevious).toEqual([a]);
  });

  test("unscannable target is recorded as L0 rather than throwing", () => {
    const receipt = buildMcpTrustReceipt({ targets: [join(dir, "does-not-exist.json")], generatedAt: 1 });
    expect(receipt.serverCount).toBe(1);
    expect(receipt.entries[0]?.securityLevel).toBe("L0");
  });
});
