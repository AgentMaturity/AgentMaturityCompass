import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import { classifyAgentVsWorkflow } from "../src/score/agentVsWorkflow.js";
import { checkClaimExpiry } from "../src/score/claimExpiry.js";
import { captureDAG, scoreDAGGovernance } from "../src/score/orchestrationDAG.js";

const workspace = mkdtempSync(join(tmpdir(), "amc-axe2022-scores-"));
const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
afterAll(() => rmSync(workspace, { recursive: true, force: true }));

const commands = [
  { name: "factuality", args: ["score", "factuality"], score: "overallScore" },
  { name: "output-attestation", args: ["score", "output-attestation"], score: "score" },
  { name: "mutual-verification", args: ["score", "mutual-verification"], score: "score" },
  { name: "classify", args: ["classify", "agent", "empty-agent"], score: "score" },
  { name: "claims-list", args: ["claims", "list", "empty-agent"], score: null },
  { name: "dag", args: ["dag", "score"], score: "score" },
];

function run(args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: workspace,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    timeout: 30_000,
  });
}

describe("AXE-20 empty public score inputs", () => {
  test.each(commands)("$name JSON reports not_evaluated and exits nonzero", ({ args, score }) => {
    const child = run([...args, "--json"]);
    expect(child.error).toBeUndefined();
    expect(child.signal).toBeNull();
    expect(child.stdout, child.stderr).not.toBe("");
    const result = JSON.parse(child.stdout);
    expect(result.outcome).toBe("not_evaluated");
    if (score) expect(result[score]).toBeNull();
    if (args[0] === "score" || args[0] === "dag") {
      expect(typeof result.claimKind).toBe("string");
      expect(typeof result.claimLabel).toBe("string");
      expect(result.statusDimensions.result).toBe("not_evaluated");
    }
    if (args[0] === "claims") {
      expect(result.certificationBlocked).toBeNull();
      expect(result.agentId).toBe("empty-agent");
      expect(result.ttlDefaults).toHaveProperty("security-audit");
    }
    expect(child.status).toBe(1);
  });

  test.each(commands)("$name text reports no data without a score or pass", ({ args }) => {
    const child = run(args);
    expect(child.error).toBeUndefined();
    expect(child.stdout).toContain("not_evaluated");
    expect(child.stdout).toMatch(/no data/i);
    expect(child.stdout).not.toMatch(/Score:|AMC Level:|Certification blocked: false|Lnull|100%|\bPASS\b/);
    expect(child.status).toBe(1);
  });
});

describe("AXE-20 shared scorer admission", () => {
  test("classification abstains without finite scores", () => {
    const inputs: Record<string, number>[] = [{}, { invalid: Number.NaN }, { invalid: Number.POSITIVE_INFINITY }];
    for (const scores of inputs) {
      expect(classifyAgentVsWorkflow(scores)).toMatchObject({
        outcome: "not_evaluated", score: null, classification: null,
        amcLevel: null, governanceRequired: null, governanceUrgency: null,
      });
    }
  });

  test("observed zero remains a measured workflow", () => {
    expect(classifyAgentVsWorkflow({ observed: 0 })).toMatchObject({
      outcome: "measured", score: 0, classification: "workflow", amcLevel: "L0",
    });
  });

  test("empty claims do not clear certification", () => {
    expect(checkClaimExpiry([])).toMatchObject({
      outcome: "not_evaluated", certificationBlocked: null, expired: [], stale: [], fresh: [],
    });
  });

  test("populated claims keep the certification decision", () => {
    expect(checkClaimExpiry([{
      claimId: "expired", claimType: "security-audit", createdAt: "2000-01-01T00:00:00.000Z",
      ttlDays: 1, expiresAt: "", isExpired: false, isStale: false, renewalRequired: false,
    }])).toMatchObject({ outcome: "measured", certificationBlocked: true });
  });

  test("empty DAG cannot earn a governance score", () => {
    expect(scoreDAGGovernance(captureDAG([]))).toMatchObject({
      outcome: "not_evaluated", score: null, level: null,
    });
  });

  test("populated DAG keeps the measured score", () => {
    expect(scoreDAGGovernance(captureDAG([{
      agentId: "reviewer", role: "reviewer", inputs: [], outputs: [], trustLevel: "high",
    }]))).toMatchObject({ outcome: "measured", score: 100, level: "L5" });
  });
});
