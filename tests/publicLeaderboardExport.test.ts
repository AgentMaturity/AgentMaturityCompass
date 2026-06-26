import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  buildPublicLeaderboardBundle,
  collectPublicLeaderboardEntries,
  writePublicLeaderboardBundle
} from "../src/benchmarks/publicLeaderboard.js";

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-public-leaderboard-"));
  roots.push(root);
  return root;
}

function writeRun(root: string, agentId: string, runId: string, integrityIndex: number, ts: number): void {
  const runsDir = join(root, ".amc", "agents", agentId, "runs");
  writeFileSync(join(runsDir, ".keep"), "", { flag: "w" });
  rmSync(join(runsDir, ".keep"), { force: true });
  writeFileSync(join(runsDir, `${runId}.json`), JSON.stringify({
    integrityIndex,
    trustLabel: integrityIndex >= 0.8 ? "HIGH TRUST" : "MEDIUM TRUST",
    ts,
    questionScores: [{ id: "AMC-1.1" }, { id: "AMC-2.1" }],
    layerScores: [
      { layerName: "Reliability", avgFinalLevel: integrityIndex * 5 },
      { layerName: "Security", avgFinalLevel: integrityIndex * 4.5 }
    ],
    modelFamily: "redacted-family",
    providerId: "redacted-provider"
  }), "utf8");
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("public leaderboard export", () => {
  test("collects latest scored runs without exposing raw agent ids", () => {
    const root = tempRoot();
    mkdirSync(join(root, ".amc", "agents", "claims-agent", "runs"), { recursive: true });
    mkdirSync(join(root, ".amc", "agents", "support-agent", "runs"), { recursive: true });
    writeRun(root, "claims-agent", "2026-01-01", 0.66, Date.parse("2026-01-01T00:00:00Z"));
    writeRun(root, "claims-agent", "2026-02-01", 0.91, Date.parse("2026-02-01T00:00:00Z"));
    writeRun(root, "support-agent", "2026-01-15", 0.72, Date.parse("2026-01-15T00:00:00Z"));

    const entries = collectPublicLeaderboardEntries({
      workspace: root,
      pseudonymSalt: "test-salt",
      amcVersion: "1.2.3"
    });

    expect(entries).toHaveLength(2);
    expect(entries[0]!.compositeScore).toBe(91);
    expect(entries.map((entry) => entry.agentPseudonym).join(" ")).not.toContain("claims-agent");
    expect(entries.map((entry) => entry.agentPseudonym).join(" ")).not.toContain("support-agent");
    expect(entries[0]!.modelFamily).toBeUndefined();
    expect(entries[0]!.providerId).toBeUndefined();
    expect(entries[0]!.questionsAnswered).toBe(2);
    expect(entries[0]!.amcVersion).toBe("1.2.3");
  });

  test("keeps model and provider metadata opt-in for public rows", () => {
    const root = tempRoot();
    mkdirSync(join(root, ".amc", "agents", "claims-agent", "runs"), { recursive: true });
    writeRun(root, "claims-agent", "latest", 0.88, Date.parse("2026-01-01T00:00:00Z"));

    const entries = collectPublicLeaderboardEntries({
      workspace: root,
      includeModelFamily: true,
      includeProviderId: true
    });

    expect(entries[0]!.modelFamily).toBe("redacted-family");
    expect(entries[0]!.providerId).toBe("redacted-provider");
  });

  test("fails closed for small public cohorts unless explicitly lowered", () => {
    const root = tempRoot();
    mkdirSync(join(root, ".amc", "agents", "solo-agent", "runs"), { recursive: true });
    writeRun(root, "solo-agent", "latest", 0.8, Date.parse("2026-01-01T00:00:00Z"));

    expect(() => buildPublicLeaderboardBundle({ workspace: root, minAgents: 5 }))
      .toThrow("requires at least 5 scored agents");

    const bundle = buildPublicLeaderboardBundle({ workspace: root, minAgents: 1 });
    expect(bundle.entries).toHaveLength(1);
  });

  test("writes Hugging Face-style dataset card and JSONL payload", () => {
    const root = tempRoot();
    const out = tempRoot();
    for (const agent of ["a", "b", "c", "d", "e"]) {
      mkdirSync(join(root, ".amc", "agents", agent, "runs"), { recursive: true });
      writeRun(root, agent, "latest", 0.6 + agent.charCodeAt(0) / 1000, Date.parse("2026-01-01T00:00:00Z"));
    }

    const bundle = buildPublicLeaderboardBundle({
      workspace: root,
      datasetId: "AgentMaturity/amc-global-index",
      prettyName: "AMC Global Index",
      minAgents: 5
    });
    const written = writePublicLeaderboardBundle(out, bundle);

    expect(written.some((path) => path.endsWith("README.md"))).toBe(true);
    expect(written.some((path) => path.endsWith("data/train.jsonl"))).toBe(true);
    expect(existsSync(join(out, "README.md"))).toBe(true);
    expect(readFileSync(join(out, "README.md"), "utf8")).toContain("AMC Global Index");
    expect(readFileSync(join(out, "data", "train.jsonl"), "utf8")).toContain("agentPseudonym");
  });

  test("public docs expose the anonymized leaderboard export surface", () => {
    const source = readFileSync(join(process.cwd(), "src/cli-business-commands.ts"), "utf8");
    const inventory = readFileSync(join(process.cwd(), "docs/CLI_COMMAND_INVENTORY.md"), "utf8");
    const apiReference = readFileSync(join(process.cwd(), "docs/API_REFERENCE.md"), "utf8");
    const audit = readFileSync(join(process.cwd(), "docs/AUDIT_50_AGENTS_BATCH5.md"), "utf8");

    expect(source).toContain('.command("public-export")');
    expect(source).toContain("Build an anonymized public leaderboard dataset bundle");
    expect(source).toContain("--include-provider-id");
    expect(inventory).toContain("| `amc leaderboard public-export` |");
    expect(apiReference).toContain("#### `amc leaderboard public-export`");
    expect(audit).toContain("Public leaderboard — ✅ Resolved 2026-06-16");
    expect(audit).not.toContain("No public leaderboard of anonymized agent scores.");
  });
});
