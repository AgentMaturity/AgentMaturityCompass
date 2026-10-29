import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { initCasebook } from "../src/casebooks/casebookStore.js";
import {
  analyzeExperiment,
  createExperiment,
  gateExperiment,
  listExperiments,
  runExperiment,
  setExperimentBaseline,
  setExperimentCandidate
} from "../src/experiments/experimentRunner.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { getPrivateKeyPem, getSigningKey, signHexDigest } from "../src/crypto/keys.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { sha256Hex } from "../src/utils/hash.js";
import { canonicalize } from "../src/utils/json.js";

/**
 * Public experiment paths (WP02, WP38): the compiled CLI and the Studio route reach the runner with the caller's
 * candidate evidence inputs, refuse invalid input before any report exists, keep working after `experiment optimize`,
 * and only read a latest run whose seal verifies against the current experiment.
 */
const PASSPHRASE = "experiment-public-paths-passphrase";
const roots: string[] = [];
afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function fixture(): { ws: string; experimentId: string; runsDir: string } {
  const ws = mkdtempSync(join(tmpdir(), "amc-experiment-public-"));
  roots.push(ws);
  process.env.AMC_VAULT_PASSPHRASE = PASSPHRASE;
  initWorkspace({ workspacePath: ws, trustBoundaryMode: "isolated" });
  initBudgets(ws, "default");
  initCasebook(ws, "default", "expbook");
  const { experimentId } = createExperiment({ workspace: ws, agentId: "default", name: "public-path", casebookId: "expbook" });
  setExperimentBaseline({ workspace: ws, agentId: "default", experimentId, config: "current" });
  const candidateFile = join(ws, "candidate.yaml");
  writeFileSync(candidateFile, "candidate:\n  mode: safe\n", "utf8");
  signAuditorFile(ws, candidateFile);
  setExperimentCandidate({ workspace: ws, agentId: "default", experimentId, candidateFile });
  // The on-disk layout `amc experiment optimize` writes under the experiments root.
  const optimizerRun = join(getAgentPaths(ws, "default").rootDir, "experiments", "optimizer", "optimizer-1-abcd1234");
  mkdirSync(optimizerRun, { recursive: true });
  writeFileSync(join(optimizerRun, "optimizer-run.json"), "{}\n");
  return { ws, experimentId, runsDir: join(getAgentPaths(ws, "default").rootDir, "experiments", experimentId, "runs") };
}

function signAuditorFile(ws: string, file: string): void {
  const digestSha256 = sha256Hex(readFileSync(file));
  writeFileSync(`${file}.sig`, JSON.stringify({ digestSha256, signature: signHexDigest(digestSha256, getPrivateKeyPem(ws, "auditor")),
    signedTs: Date.now(), signer: "auditor" }));
}

function runFiles(runsDir: string): string[] {
  return existsSync(runsDir) ? readdirSync(runsDir) : [];
}

function cli(ws: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const run = spawnSync(process.execPath, [resolve("dist/cli.js"), ...args], {
    cwd: ws, encoding: "utf8", env: { ...process.env, NO_COLOR: "1", AMC_VAULT_PASSPHRASE: PASSPHRASE }, timeout: 90_000
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no test port");
  await new Promise<void>((done) => server.close(() => done()));
  return address.port;
}

async function call(url: string, init: { method?: string; body?: string; token?: string } = {}): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await fetch(url, { method: init.method ?? "GET", body: init.body,
    headers: { "content-type": "application/json", ...(init.token ? { "x-amc-admin-token": init.token } : {}) } });
  return { status: response.status, json: await response.json() as Record<string, unknown> };
}

/** A sealed report written the way runExperiment writes one, with chosen contents. */
function writeSealedReport(ws: string, runsDir: string, experimentId: string, cases: unknown[]): string {
  const runId = `exp_run_${Date.now() + 60_000}_deadbeef`;
  const experiment = readFileSync(join(runsDir, "..", "experiment.yaml"), "utf8");
  const candidateConfigId = /candidateConfig:\n(?:.*\n)*?\s+id: "?([0-9a-f]{12})"?/.exec(experiment)![1]!;
  const base = { experimentId, agentId: "default", ts: Date.now(), mode: "sandbox", casebookId: "expbook", baselineConfigId: "current",
    candidateConfigId, runId, cases, baselineSuccessRate: 0, candidateSuccessRate: 0, upliftSuccessRate: 0, baselineValuePointsAvg: 0,
    candidateValuePointsAvg: 0, upliftValuePoints: 0, baselineCostPerSuccess: 0, candidateCostPerSuccess: 0, confidenceInterval95: [0, 0], effectSize: 0 };
  const reportJsonSha256 = sha256Hex(canonicalize(base));
  mkdirSync(runsDir, { recursive: true });
  writeFileSync(join(runsDir, `${runId}.json`), JSON.stringify({ ...base, reportJsonSha256,
    reportSealSig: signHexDigest(reportJsonSha256, getSigningKey(ws, "artifact-seal")) }, null, 2));
  return runId;
}

describe("experiment public paths", () => {
  test("compiled CLI: list works after optimize; run refuses invalid mode, window and candidate agent before any report, then runs", () => {
    const { ws, experimentId, runsDir } = fixture();

    const listed = cli(ws, ["experiment", "list"]);
    expect(listed.status).toBe(0);
    expect((JSON.parse(listed.stdout) as Array<{ experimentId: string }>).map((row) => row.experimentId)).toEqual([experimentId]);

    const badMode = cli(ws, ["experiment", "run", "--experiment", experimentId, "--mode", "yolo", "--candidate-window", "7d"]);
    expect(badMode.status).not.toBe(0);
    expect(`${badMode.stdout}${badMode.stderr}`).toContain("invalid experiment mode 'yolo'");
    const badWindow = cli(ws, ["experiment", "run", "--experiment", experimentId, "--mode", "sandbox", "--candidate-window", "7x"]);
    expect(badWindow.status).not.toBe(0);
    expect(`${badWindow.stdout}${badWindow.stderr}`).toContain("Invalid window format: 7x");
    const ghost = cli(ws, ["experiment", "run", "--experiment", experimentId, "--mode", "sandbox", "--candidate-window", "7d", "--candidate-agent", "ghost"]);
    expect(ghost.status).not.toBe(0);
    expect(`${ghost.stdout}${ghost.stderr}`).toContain("candidate agent 'ghost' has no casebook 'expbook'");
    expect(runFiles(runsDir)).toEqual([]);

    const ok = cli(ws, ["experiment", "run", "--experiment", experimentId, "--mode", "supervise", "--candidate-window", "7d", "--candidate-agent", "default"]);
    expect(ok.status, ok.stderr).toBe(0);
    const report = JSON.parse(readFileSync(/json=(.*)/.exec(ok.stdout)![1]!.trim(), "utf8")) as { mode: string };
    expect(report.mode).toBe("supervise");
  }, 300_000);

  test("compiled CLI: gate exits 3 when inconclusive, 1 when failed", () => {
    const { ws, experimentId, runsDir } = fixture();
    const policy = join(ws, "gate.json");
    writeFileSync(policy, JSON.stringify({ minUpliftSuccessRate: 0.99, minUpliftValuePoints: 50, denyIfRegression: true }));

    runExperiment({ workspace: ws, agentId: "default", experimentId, mode: "sandbox", candidateWindow: "14d" });
    const failed = cli(ws, ["experiment", "gate", "--experiment", experimentId, "--policy", policy]);
    expect(failed.status).toBe(1);
    expect(failed.stdout).toContain("Experiment gate FAILED");

    writeSealedReport(ws, runsDir, experimentId, []);
    const inconclusive = cli(ws, ["experiment", "gate", "--experiment", experimentId, "--policy", policy]);
    expect(inconclusive.status).toBe(3);
    expect(inconclusive.stdout).toContain("Experiment gate INCONCLUSIVE");
  }, 300_000);

  test("Studio: list and history skip optimizer runs; run validates input before any report and forwards candidate inputs", async () => {
    const { ws, experimentId, runsDir } = fixture();
    const token = "experiment-public-token";
    const studio = await startStudioApiServer({ workspace: ws, host: "127.0.0.1", port: await freePort(), token });
    try {
      const list = await call(`${studio.url}/experiments/list?agentId=default`, { token });
      expect(list.status).toBe(200);
      expect((list.json as unknown as Array<{ experimentId: string }>).map((row) => row.experimentId)).toEqual([experimentId]);
      const history = await call(`${studio.url}/experiments/history?agentId=default`, { token });
      expect(history.status).toBe(200);
      expect(history.json.rows).toEqual([{ experimentId, name: "public-path", casebookId: "expbook", latestRun: null, latestRunProblem: null }]);

      const run = (body: unknown, auth = token) => call(`${studio.url}/experiments/${experimentId}/run`, { method: "POST", body: JSON.stringify(body), token: auth });
      expect((await run({ mode: "sandbox", candidateWindow: "7d" }, "")).status).toBeGreaterThanOrEqual(401);
      expect((await run([1, 2])).status).toBe(400);
      expect((await run({ mode: "sandbox" })).json.error).toBe("candidateWindow is required");
      const badMode = await run({ mode: "yolo", candidateWindow: "7d" });
      expect(badMode).toMatchObject({ status: 400, json: { code: "EXPERIMENT_INPUT_INVALID" } });
      expect(String(badMode.json.error)).toContain("invalid experiment mode 'yolo'");
      expect((await run({ mode: "sandbox", candidateWindow: "soon" })).status).toBe(400);
      const ghost = await run({ mode: "sandbox", candidateWindow: "7d", candidateAgentId: "ghost" });
      expect(ghost.status).toBe(400);
      expect(String(ghost.json.error)).toContain("candidate agent 'ghost'");
      expect(runFiles(runsDir)).toEqual([]);

      const ok = await run({ mode: "supervise", candidateWindow: "7d", candidateAgentId: "default" });
      expect(ok.status).toBe(200);
      expect((ok.json.report as { mode: string }).mode).toBe("supervise");
      const after = await call(`${studio.url}/experiments/history?agentId=default`, { token });
      expect((after.json.rows as Array<{ latestRun: { runId: string } | null }>)[0]!.latestRun?.runId).toBe((ok.json.report as { runId: string }).runId);
    } finally {
      await studio.close();
    }
  }, 120_000);
});

describe("experiment latest-run admission", () => {
  test("a tampered or re-candidated latest run is refused by analyze and gate; history reports why", () => {
    const { ws, experimentId, runsDir } = fixture();
    const policy = join(ws, "gate.json");
    writeFileSync(policy, JSON.stringify({ minUpliftSuccessRate: -1, minUpliftValuePoints: -100, denyIfRegression: false }));
    const { jsonPath } = runExperiment({ workspace: ws, agentId: "default", experimentId, mode: "sandbox", candidateWindow: "14d" });
    expect(analyzeExperiment({ workspace: ws, agentId: "default", experimentId }).report.runId).toBeTruthy();

    const original = readFileSync(jsonPath, "utf8");
    writeFileSync(jsonPath, original.replace(/"upliftSuccessRate": [^,]+,/, "\"upliftSuccessRate\": 1,"));
    expect(() => gateExperiment({ workspace: ws, agentId: "default", experimentId, policyPath: policy })).toThrow(/report hash does not match/);
    const resealed = JSON.parse(readFileSync(jsonPath, "utf8")) as Record<string, unknown>;
    const { reportJsonSha256: _h, reportSealSig: _s, ...base } = resealed;
    writeFileSync(jsonPath, JSON.stringify({ ...base, reportJsonSha256: sha256Hex(canonicalize(base)), reportSealSig: "AAAA" }));
    expect(() => analyzeExperiment({ workspace: ws, agentId: "default", experimentId })).toThrow(/seal does not verify/);

    writeFileSync(jsonPath, original);
    expect(gateExperiment({ workspace: ws, agentId: "default", experimentId, policyPath: policy }).status).toBe("pass");
    const nextCandidate = join(ws, "candidate-2.yaml");
    writeFileSync(nextCandidate, "candidate:\n  mode: bolder\n", "utf8");
    signAuditorFile(ws, nextCandidate);
    setExperimentCandidate({ workspace: ws, agentId: "default", experimentId, candidateFile: nextCandidate });
    expect(() => gateExperiment({ workspace: ws, agentId: "default", experimentId, policyPath: policy })).toThrow(/candidate changed since this run/);
    expect(runFiles(runsDir).filter((name) => name.endsWith(".json"))).toHaveLength(1);
    expect(listExperiments({ workspace: ws, agentId: "default" })).toHaveLength(1);
  }, 120_000);
});
