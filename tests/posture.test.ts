import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildPostureScorecard } from "../src/shield/posture.js";

describe("agent security posture scorecard", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "amc-posture-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });
  function write(rel: string, body: string): void {
    const p = join(dir, rel); mkdirSync(join(p, ".."), { recursive: true }); writeFileSync(p, body);
  }

  test("produces five graded dimensions, an overall L0–L5, a verdict, and a deterministic receipt", () => {
    write("CLAUDE.md", "# Project\nAsk before destructive commands.\n");
    write("package-lock.json", "{}");
    write("Dockerfile", "FROM node:22\n");
    const a = buildPostureScorecard({ root: dir, now: 1_700_000_000_000 });
    expect(a.schemaVersion).toBe("amc.posture-scorecard.v1");
    expect(a.dimensions.map((d) => d.id).sort()).toEqual(["agent-config", "isolation", "mcp-trust", "secrets-on-disk", "supply-chain"]);
    expect(["L0","L1","L2","L3","L4","L5"]).toContain(a.overallLevel);
    expect(a.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    const b = buildPostureScorecard({ root: dir, now: 1_700_000_000_000 });
    expect(b.receiptHash).toBe(a.receiptHash);
  });

  test("hardcoded secret drops secrets-on-disk to FAIL and blocks overall", () => {
    write("CLAUDE.md", "key: sk-ABCDEFGHIJKLMNOPQRSTUVWX\n");
    const card = buildPostureScorecard({ root: dir, now: 1 });
    const secrets = card.dimensions.find((d) => d.id === "secrets-on-disk");
    expect(secrets?.status).toBe("FAIL");
    expect(card.verdict).toBe("BLOCK");
    expect(card.topActions.some((a) => /credential/i.test(a))).toBe(true);
  });

  test("a hardened tree (lockfile + sandbox + clean config) scores well and is CLEAN", () => {
    write("AGENTS.md", "Be careful. Require approval for high-risk tools.\n");
    write(".claude/settings.json", JSON.stringify({ permissions: { allow: ["Read"] } }));
    write("package-lock.json", "{}");
    write("Dockerfile", "FROM node:22\n");
    const card = buildPostureScorecard({ root: dir, now: 1 });
    expect(card.verdict).not.toBe("BLOCK");
    expect(["L3","L4","L5"]).toContain(card.overallLevel);
  });

  test("missing lockfile and no sandbox weaken supply-chain and isolation", () => {
    write("CLAUDE.md", "# ok\n");
    const card = buildPostureScorecard({ root: dir, now: 1 });
    const iso = card.dimensions.find((d) => d.id === "isolation");
    const sc = card.dimensions.find((d) => d.id === "supply-chain");
    expect(iso!.score).toBeLessThan(70);
    expect(sc!.score).toBeLessThanOrEqual(75);
  });

  test("a risky MCP config lowers the mcp-trust dimension", () => {
    write(".mcp.json", JSON.stringify({ name: "risky", tools: [{ name: "run", description: "execute arbitrary shell via child_process exec eval" }] }));
    const card = buildPostureScorecard({ root: dir, now: 1 });
    const mcp = card.dimensions.find((d) => d.id === "mcp-trust");
    expect(mcp!.score).toBeLessThan(70);
  });
});
