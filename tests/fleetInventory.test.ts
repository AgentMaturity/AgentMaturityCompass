import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { addObservedAgent, describeTimeOverlap, fleetWindowMs, TIME_OVERLAP_NOTE } from "../src/fleet/fleetActions.js";
import { assembleFleetInventory, type InventoryFacts } from "../src/fleet/inventory.js";
import { costWords, csvCell, fleetInventoryCsv, renderFleetInventoryText } from "../src/fleet/inventoryRender.js";

const meta = (value: Record<string, unknown>): string => JSON.stringify(value);
function facts(overrides: Partial<InventoryFacts> = {}): InventoryFacts {
  return {
    now: 1_800_000_000_000, costWindow: { since: 1_800_000_000_000 - 30 * 86_400_000, until: 1_800_000_000_000 },
    registered: [{ id: "billing", owner: "Priya Shah" }, { id: "support" }],
    events: [
      { ts: 1_799_999_000_000, runtime: "claude", meta_json: meta({ agentId: "billing", registration: { claudeCodeVersion: "1.0.0" } }) },
      { ts: 1_799_999_500_000, runtime: "unknown", meta_json: meta({ agentId: "\u001b[31m../../etc\u202e" }) },
      { ts: 1_799_999_600_000, runtime: "unknown", meta_json: meta({ agentId: "system" }) }
    ],
    hooks: [{ agentId: "billing", provider: "claude-code", mode: "control", state: "installed", controlVerified: true, releaseWarning: null }],
    budgetFor: (agentId) => agentId === "billing" ? { maxCostUsdPerDay: 5, maxLlmTokensPerDay: 100_000, inherited: false } : null,
    freezeFor: () => ({ active: false, incidentIds: [] }),
    costs: new Map([["billing", { estimatedUsd: null, calls: 3, unknownCalls: 3 }]]),
    ...overrides
  };
}

describe("fleet inventory", () => {
  test("counts agents without an owner, lists observed names apart and never registers them", () => {
    const inventory = assembleFleetInventory(facts());
    expect(inventory.summary).toMatchObject({ registered: 2, withoutOwner: 1, unregistered: 1 });
    expect(inventory.agents.map((row) => row.agentId)).toEqual(["billing", "support"]);
    expect(inventory.unregistered.map((row) => row.registered)).toEqual([false]);
    // AMC's own rows ("system") are not agents.
    expect(inventory.unregistered.some((row) => row.agentId === "system")).toBe(false);
    const billing = inventory.agents[0]!;
    expect(billing.runtimes).toEqual([{ runtime: "claude-code", version: "1.0.0", qualified: false }, { runtime: "claude", version: null, qualified: null }]);
    expect(billing.missing).toEqual(["a qualified runtime release"]);
    expect(inventory.agents[1]!.missing).toEqual(["an owner", "a budget", "verified control"]);
  });

  test("an unpriced cost is not known, never zero, for the agent and its owner", () => {
    const inventory = assembleFleetInventory(facts());
    expect(costWords(inventory.agents[0]!.cost)).toBe("not known (3 calls with no price)");
    expect(costWords(inventory.agents[1]!.cost)).toBe("no calls recorded");
    expect(inventory.costByOwner.find((row) => row.owner === "Priya Shah")!.cost!.estimatedUsd).toBeNull();
    expect(costWords({ estimatedUsd: 1.234, calls: 4, unknownCalls: 1 })).toBe("about $1.23 (estimate, plus 1 call not known)");
    expect(fleetInventoryCsv(inventory).split("\r\n")[1]).toContain(",not known,3,3,");
    expect(renderFleetInventoryText(inventory)).toContain("estimate from the token counts AMC recorded and the model price list");
  });

  test("an observed name is escaped in the terminal and the CSV", () => {
    const inventory = assembleFleetInventory(facts());
    const text = renderFleetInventoryText(inventory);
    expect(text).not.toContain("\u001b");
    expect(text).not.toContain("\u202e");
    expect(text).toContain("\\u001b[31m../../etc\\u202e");
    expect(fleetInventoryCsv(inventory)).not.toContain("\u001b");
  });

  test("CSV cells a spreadsheet would run as formulas start with a quote, and are quoted correctly", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    for (const value of ["+1", "-2", "@SUM(A1)", " =1", "\t=1"]) expect(csvCell(value).replace(/^"/, "").startsWith("'")).toBe(true);
    expect(csvCell("Smith, Jo")).toBe("\"Smith, Jo\"");
    expect(csvCell("line\nbreak")).toBe("\"line\nbreak\"");
    expect(csvCell("plain")).toBe("plain");
    const inventory = assembleFleetInventory(facts({ registered: [{ id: "billing", owner: "=cmd|' /C calc'!A0" }] }));
    expect(fleetInventoryCsv(inventory)).toContain(",'=cmd|' /C calc'!A0,");
  });
});

describe("fleet trust-receipts wording and window", () => {
  test("12h is 12 hours; s, m, h and d are understood; anything else is refused", () => {
    expect(fleetWindowMs("30s")).toBe(30_000);
    expect(fleetWindowMs("45m")).toBe(45 * 60_000);
    expect(fleetWindowMs("12h")).toBe(12 * 3_600_000);
    expect(fleetWindowMs("30d")).toBe(30 * 86_400_000);
    for (const bad of ["12", "1w", "", "-1h", "1.5h", "0h", "12 h", "h"]) expect(() => fleetWindowMs(bad)).toThrow(/not a time window/);
  });

  test("says time-window overlap and never OK, BROKEN, verified or chain", () => {
    const lines = [TIME_OVERLAP_NOTE, describeTimeOverlap({ fromAgentId: "a", toAgentId: "b", fromReceiptCount: 4, matchedReceipts: 1 }),
      describeTimeOverlap({ fromAgentId: "a", toAgentId: "b", fromReceiptCount: 0, matchedReceipts: 0 })].join("\n");
    expect(lines.toLowerCase()).toContain("time-window overlap");
    expect(lines).not.toMatch(/\bOK\b|BROKEN|verified|chain/i);
  });
});

describe("adding an observed agent and lifting a freeze", () => {
  test("an observed name with path characters is refused before anything is written", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-fleet-observed-"));
    for (const bad of ["../evil", "a/b", "a\\b", "x.y", "A".repeat(65), "\u001bbad"]) {
      await expect(addObservedAgent(workspace, bad)).rejects.toThrow(/cannot be used as an agent id/);
    }
    expect(readdirSync(workspace)).toEqual([]);
    expect(existsSync(join(workspace, ".amc"))).toBe(false);
  });

  test("records AMC could not read show cost and last seen as not known, for each agent and each owner", () => {
    const inventory = assembleFleetInventory(facts({ costs: null, events: null, costProblem: "Cost and last seen are not known: AMC could not read its records (locked)." }));
    expect(inventory.agents[0]!.cost).toBeNull();
    expect(inventory.costByOwner.find((row) => row.owner === "Priya Shah")!.cost).toBeNull();
    expect(inventory.lastSeenKnown).toBe(false);
    const text = renderFleetInventoryText(inventory);
    expect(text).toContain("  Last seen:   not known");
    expect(text).toContain("  Cost:        not known");
    expect(text).toContain("Priya Shah: not known across 1 agent");
    expect(text).not.toContain("no calls recorded");
    expect(text).not.toMatch(/Last seen: +never/);
  });
});
