import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-fleet-trust-graph-"));
  roots.push(dir);
  return dir;
}

function runCli(cwd: string, args: string[]) {
  const env = { ...process.env, NO_COLOR: "1" };
  delete env.AMC_VAULT_PASSPHRASE;
  delete env.AMC_VAULT_PASSPHRASE_FILE;
  return spawnSync(process.execPath, [resolve(process.cwd(), "dist/cli.js"), ...args], {
    cwd,
    env,
    encoding: "utf8"
  });
}

function seedTrustEdge(dir: string) {
  expect(runCli(dir, ["fleet", "trust-init"]).status).toBe(0);
  const add = runCli(dir, [
    "fleet",
    "trust-add-edge",
    "--from",
    "orchestrator",
    "--to",
    "researcher",
    "--purpose",
    "research handoff",
    "--mode",
    "weighted",
    "--weight",
    "0.6"
  ]);
  expect(add.status, `${add.stdout}\n${add.stderr}`).toBe(0);
}

function seedDashboardRun(dir: string, agentId = "default") {
  const runsDir = join(dir, ".amc", "agents", agentId, "runs");
  mkdirSync(runsDir, { recursive: true });
  const now = Date.now();
  writeFileSync(
    join(runsDir, "run-trust-dashboard.json"),
    JSON.stringify({
      runId: "run-trust-dashboard",
      ts: now,
      windowStartTs: now - 60_000,
      windowEndTs: now,
      status: "VALID",
      verificationPassed: true,
      trustBoundaryViolated: false,
      trustBoundaryMessage: null,
      integrityIndex: 0.78,
      trustLabel: "MEDIUM TRUST",
      layerScores: [
        { layerName: "Governance", avgFinalLevel: 3.4, confidenceWeightedFinalLevel: 3.4 },
        { layerName: "Resilience", avgFinalLevel: 3.1, confidenceWeightedFinalLevel: 3.1 }
      ],
      questionScores: [],
      evidenceToCollectNext: [],
      evidenceCoverage: 0.7
    }, null, 2),
    "utf8"
  );
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("fleet trust graph visualization", () => {
  test("prints a mermaid delegation graph from trust edges", () => {
    const dir = workspace();
    seedTrustEdge(dir);

    const result = runCli(dir, ["fleet", "trust-graph"]);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("Trust Delegation Graph");
    expect(result.stdout).toContain("Edges: 1");
    expect(result.stdout).toContain("flowchart LR");
    expect(result.stdout).toContain('orchestrator["orchestrator"]');
    expect(result.stdout).toContain('researcher["researcher"]');
    expect(result.stdout).toContain("orchestrator -->|research handoff; weighted; w=0.6| researcher");
  }, 60_000);

  test("writes dot output for graph tooling", () => {
    const dir = workspace();
    seedTrustEdge(dir);

    const result = runCli(dir, ["fleet", "trust-graph", "--format", "dot", "--out", "trust.dot"]);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("Trust graph written:");
    const dot = readFileSync(join(dir, "trust.dot"), "utf8");
    expect(dot).toContain("digraph amc_trust");
    expect(dot).toContain('"orchestrator" -> "researcher"');
    expect(dot).toContain('label="research handoff; weighted; w=0.6"');
  });

  test("supports JSON graph output", () => {
    const dir = workspace();
    seedTrustEdge(dir);

    const result = runCli(dir, ["fleet", "trust-graph", "--format", "json"]);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const payload = JSON.parse(result.stdout) as { edgeCount: number; nodes: string[]; edges: Array<{ fromAgentId: string; toAgentId: string }> };
    expect(payload.edgeCount).toBe(1);
    expect(payload.nodes).toEqual(["orchestrator", "researcher"]);
    expect(payload.edges[0]).toMatchObject({ fromAgentId: "orchestrator", toAgentId: "researcher" });
  });

  test("embeds a styled trust topology panel in built dashboards", () => {
    const dir = workspace();
    seedDashboardRun(dir);
    seedTrustEdge(dir);

    const result = runCli(dir, ["dashboard", "build", "--out", "dashboard"]);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const data = JSON.parse(readFileSync(join(dir, "dashboard", "data.json"), "utf8")) as {
      trustGraph?: {
        edgeCount: number;
        nodes: string[];
        edges: Array<{ fromAgentId: string; toAgentId: string; riskTier: string; inheritanceMode: string; weight: number }>;
        reviewActions: string[];
      };
    };
    expect(data.trustGraph?.edgeCount).toBe(1);
    expect(data.trustGraph?.nodes).toEqual(["orchestrator", "researcher"]);
    expect(data.trustGraph?.edges[0]).toMatchObject({
      fromAgentId: "orchestrator",
      toAgentId: "researcher",
      riskTier: "med",
      inheritanceMode: "weighted",
      weight: 0.6
    });
    expect(data.trustGraph?.reviewActions).toContain("Review weighted delegation edges below 0.70 before production use.");

    const html = readFileSync(join(dir, "dashboard", "index.html"), "utf8");
    const app = readFileSync(join(dir, "dashboard", "app.js"), "utf8");
    const css = readFileSync(join(dir, "dashboard", "styles.css"), "utf8");
    expect(html).toContain("Trust Topology");
    expect(html).toContain("trust-graph-mount");
    expect(app).toContain("function renderTrustTopology");
    expect(app).toContain("trustGraph");
    expect(css).toContain(".trust-topology");
    expect(css).toContain(".trust-edge-card");
  });

  test("keeps the UX audit aligned with trust graph visualization", () => {
    const audit = readFileSync(resolve(process.cwd(), "docs/UX_AUDIT_REPORT.md"), "utf8");

    expect(audit).toContain("R19 — trust graph visualization is available");
    expect(audit).toContain("`amc fleet trust-graph` renders Mermaid by default");
    expect(audit).toContain("R32 — trust graph is styled and embedded in dashboards");
    expect(audit).toContain("| 7 | Aisha | Enterprise Arch | ⭐ 1/5 | ⭐⭐⭐⭐⭐ 5/5 | +4 | Trust graph setup, visualization, unsigned reports, styled dashboard topology, and review actions work |");
    expect(audit).not.toContain("Add `--no-sign` to `trust-report`; show trust graph visualization");
    expect(audit).not.toContain("Aisha (⭐⭐⭐⭐) | Add richer trust graph styling and dashboard embedding");
  });
});
