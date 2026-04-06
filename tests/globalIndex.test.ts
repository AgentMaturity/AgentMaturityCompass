import { describe, expect, test } from "vitest";
import {
  pseudonymizeAgentId,
  toJSONL,
  fromJSONL,
  generateDatasetCard,
  buildGlobalIndexEntry,
  type GlobalIndexEntry,
} from "../src/benchmarks/globalIndex.js";

describe("pseudonymizeAgentId", () => {
  test("produces deterministic pseudonyms", () => {
    const a = pseudonymizeAgentId("my-agent", "salt");
    const b = pseudonymizeAgentId("my-agent", "salt");
    expect(a).toBe(b);
  });

  test("different salts produce different pseudonyms", () => {
    const a = pseudonymizeAgentId("my-agent", "salt-a");
    const b = pseudonymizeAgentId("my-agent", "salt-b");
    expect(a).not.toBe(b);
  });

  test("starts with agent- prefix", () => {
    const result = pseudonymizeAgentId("test");
    expect(result.startsWith("agent-")).toBe(true);
  });
});

describe("JSONL round-trip", () => {
  const entries: GlobalIndexEntry[] = [
    {
      agentPseudonym: "agent-abc123",
      amcVersion: "1.0.0",
      compositeScore: 72.5,
      layerScores: { L0: 80, L1: 70, L2: 65, L3: 75, L4: 72 },
      trustLabel: "MEDIUM TRUST",
      assessedAt: "2026-04-03T00:00:00Z",
      questionsAnswered: 235,
      privacyTier: "redacted",
    },
  ];

  test("toJSONL produces valid JSONL", () => {
    const jsonl = toJSONL(entries);
    const lines = jsonl.trim().split("\n");
    expect(lines.length).toBe(1);
    expect(() => JSON.parse(lines[0]!)).not.toThrow();
  });

  test("fromJSONL reverses toJSONL", () => {
    const jsonl = toJSONL(entries);
    const parsed = fromJSONL(jsonl);
    expect(parsed.length).toBe(1);
    expect(parsed[0]!.compositeScore).toBe(72.5);
    expect(parsed[0]!.layerScores.L0).toBe(80);
  });
});

describe("generateDatasetCard", () => {
  test("produces a valid dataset card", () => {
    const entries: GlobalIndexEntry[] = [
      {
        agentPseudonym: "agent-abc",
        amcVersion: "1.0.0",
        compositeScore: 85,
        layerScores: {},
        trustLabel: "HIGH TRUST",
        assessedAt: "2026-04-03T00:00:00Z",
        questionsAnswered: 200,
        privacyTier: "zero",
      },
    ];
    const card = generateDatasetCard(entries, { amcVersion: "2.0.0" });
    expect(card.name).toBe("amc-global-index");
    expect(card.version).toBe("2.0.0");
    expect(card.splits.train.numRows).toBe(1);
    expect(card.tags).toContain("ai-safety");
  });
});

describe("buildGlobalIndexEntry", () => {
  test("builds an entry with pseudonymized agent ID", () => {
    const entry = buildGlobalIndexEntry({
      agentId: "real-agent-id",
      compositeScore: 85,
      layerScores: { L0: 90, L1: 80 },
      trustLabel: "HIGH TRUST",
      questionsAnswered: 235,
      modelFamily: "gpt-4",
      providerId: "openai",
    });
    expect(entry.agentPseudonym).toMatch(/^agent-/);
    expect(entry.agentPseudonym).not.toContain("real-agent-id");
    expect(entry.compositeScore).toBe(85);
    // modelFamily not included by default (includeModelFamily not set)
    expect(entry.modelFamily).toBeUndefined();
  });

  test("includes modelFamily when explicitly enabled", () => {
    const entry = buildGlobalIndexEntry(
      {
        agentId: "agent-x",
        compositeScore: 70,
        layerScores: {},
        trustLabel: "MEDIUM TRUST",
        questionsAnswered: 100,
        modelFamily: "claude-3",
      },
      { includeModelFamily: true },
    );
    expect(entry.modelFamily).toBe("claude-3");
  });
});
