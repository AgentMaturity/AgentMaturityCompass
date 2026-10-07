import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { canonicalize } from "../src/utils/json.js";
import { sha256Hex } from "../src/utils/hash.js";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { scoreISO42001Coverage, scoreRegulatoryReadiness } from "../src/score/regulatoryReadiness.js";
import { markAsAmcCheckout } from "./helpers/amcCheckout.js";

const roots: string[] = [];

/** A bare directory for zero-evidence cases; initWorkspace would scaffold artifacts that satisfy controls. */
function bareWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-reg-ready-bare-"));
  roots.push(root);
  mkdirSync(join(root, ".amc"), { recursive: true });
  return root;
}

function newWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-reg-ready-test-"));
  roots.push(root);
  // A real workspace, because writeRun signs with its auditor key.
  process.env.AMC_VAULT_PASSPHRASE = "reg-ready-test-passphrase";
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  return root;
}

function writeArtifact(workspace: string, relPath: string): void {
  const abs = join(workspace, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, "fixture\n");
}

function writeRun(workspace: string, agentId: string, runId: string, ts: number, integrityIndex: number | null,
  extra: Record<string, unknown> = {}): void {
  const runPath = join(workspace, ".amc", "agents", agentId, "runs", `${runId}.json`);
  mkdirSync(dirname(runPath), { recursive: true });
  // Sealed the way the diagnostic writer seals: since G9-05, an unsealed run
  // file is refused as a scoring input, so the fixture must be a real one.
  const base = { runId, ts, ...(integrityIndex === null ? {} : { integrityIndex }), ...extra, reportJsonSha256: "", runSealSig: "" };
  const hash = sha256Hex(canonicalize(base));
  const ledger = openLedger(workspace);
  const sig = ledger.signRunHash(hash);
  ledger.close();
  writeFileSync(runPath, `${JSON.stringify({ ...base, reportJsonSha256: hash, runSealSig: sig }, null, 2)}\n`);
}

function populateHighCoverageArtifacts(workspace: string): void {
  // This fixture stands in for a fully-covered AMC checkout: most of the
  // artifacts below are AMC's own source modules. It exercises the aggregation
  // math across EU/ISO/OWASP, not what a customer agent can reach — 55 of 131
  // evidence criteria still list only src/ paths, so a real agent cannot yet
  // satisfy them (tracked separately).
  markAsAmcCheckout(workspace);
  const artifacts = [
    "docs/AI_GOVERNANCE.md",
    "docs/POLICY.md",
    "docs/RISK_MANAGEMENT.md",
    "docs/DATA_GOVERNANCE.md",
    "README.md",
    ".amc/audit_log.jsonl",
    "docs/QA.md",
    "docs/INCIDENT_RESPONSE_READINESS.md",
    "docs/FRIA.md",
    "src/policy/index.ts",
    "src/approvals/index.ts",
    "src/assurance/index.ts",
    "src/ops/index.ts",
    "src/drift/index.ts",
    "src/monitor/index.ts",
    "src/audit/index.ts",
    "src/ledger/index.ts",
    "src/corrections/index.ts",
    "src/loop/index.ts",
    "src/snapshot/index.ts",
    "src/forecast/index.ts",
    "src/score/outputIntegrityMaturity.ts",
    "src/score/mcpCompliance.ts",
    "src/score/humanOversightQuality.ts",
    "src/assurance/packs/injectionPack.ts",
    "src/assurance/packs/ragPoisoningPack.ts",
    "src/assurance/packs/resourceExhaustionPack.ts",
    "src/assurance/packs/sbomSupplyChainPack.ts",
    "src/assurance/packs/dlpExfiltrationPack.ts",
    "src/assurance/packs/governanceBypassPack.ts",
    "src/assurance/packs/taintPropagationPack.ts"
  ];
  for (const artifact of artifacts) {
    writeArtifact(workspace, artifact);
  }
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

// These tests used to assert path-presence scores (ISO controls covered by doc
// file names, a readiness score of 70+ from AMC source paths). File presence is
// not evidence, so since P0-15 all three components are not evaluated.
describe("scoreISO42001Coverage", () => {
  test("reports every control as not evaluated in a bare workspace", () => {
    const score = scoreISO42001Coverage(bareWorkspace());
    expect(score.status).toBe("not_evaluated");
    expect(score.score).toBeNull();
    expect(score.controls).toHaveLength(score.totalControls);
  });

  test("stays not evaluated when governance documents exist", () => {
    const workspace = newWorkspace();
    writeArtifact(workspace, "docs/AI_GOVERNANCE.md");
    writeArtifact(workspace, "docs/POLICY.md");
    writeArtifact(workspace, "docs/MONITORING.md");
    const score = scoreISO42001Coverage(workspace);
    expect(score.score).toBeNull();
    expect(score.controls.every((control) => control.status === "not_evaluated")).toBe(true);
  });
});

describe("scoreRegulatoryReadiness", () => {
  test("is not evaluated even with every formerly accepted artifact and lists all 28 criteria", () => {
    const workspace = newWorkspace();
    populateHighCoverageArtifacts(workspace);
    writeRun(workspace, "agent-reg", "run-1", 1000, 0.95);

    const score = scoreRegulatoryReadiness({ workspace, agentId: "agent-reg" });

    expect(score.status).toBe("not_evaluated");
    expect(score.score).toBeNull();
    expect(score.components).toEqual({ euAiAct: null, iso42001: null, owaspLLM: null });
    expect(score.notEvaluated).toHaveLength(28);
    expect(score.agentId).toBe("agent-reg");
  });

  test("still reports the latest sealed run", () => {
    const workspace = newWorkspace();
    writeRun(workspace, "agent-reg", "run-low", 1000, 0.4);
    writeRun(workspace, "agent-reg", "run-high", 2000, 0.9);
    const score = scoreRegulatoryReadiness({ workspace, agentId: "agent-reg" });
    expect(score.latestRunId).toBe("run-high");
    expect(score.latestIntegrityIndex).toBe(0.9);
  });

  test("ignores unsealed and malformed run files", () => {
    const workspace = newWorkspace();
    const runsDir = join(workspace, ".amc", "agents", "agent-reg", "runs");
    mkdirSync(runsDir, { recursive: true });
    writeFileSync(join(runsDir, "run-unsealed.json"), JSON.stringify({ runId: "run-unsealed", ts: 5000, integrityIndex: 1 }));
    writeFileSync(join(runsDir, "run-broken.json"), "{not json");
    const score = scoreRegulatoryReadiness({ workspace, agentId: "agent-reg" });
    expect(score.latestRunId).toBeNull();
    expect(score.latestIntegrityIndex).toBeNull();
  });

  test("derives the latest integrity from layer scores when the run has no integrity index", () => {
    const workspace = newWorkspace();
    writeRun(workspace, "agent-reg", "run-layers", 1000, null, { layerScores: [{ avgFinalLevel: 4 }, { avgFinalLevel: 2 }] });
    const score = scoreRegulatoryReadiness({ workspace, agentId: "agent-reg" });
    expect(score.latestRunId).toBe("run-layers");
    expect(score.latestIntegrityIndex).toBeCloseTo(0.6);
  });

  test("normalizes custom weights for deterministic weighted composite", () => {
    const workspace = newWorkspace();
    populateHighCoverageArtifacts(workspace);
    writeRun(workspace, "agent-reg", "run-1", 1000, 0.8);

    const score = scoreRegulatoryReadiness({
      workspace,
      agentId: "agent-reg",
      weights: {
        euAiAct: 2,
        iso42001: 2,
        owaspLLM: 0
      }
    });

    const weightSum = score.weights.euAiAct + score.weights.iso42001 + score.weights.owaspLLM;
    expect(Math.abs(weightSum - 1)).toBeLessThan(1e-9);
    expect(score.weights.owaspLLM).toBe(0);
  });
});

