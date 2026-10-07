import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { CONSTRUCT_VALIDITY_DATA } from "../src/index.js";
import { openLedger } from "../src/ledger/ledger.js";
import { computeIndustryAdjustedScore, INDUSTRY_TRUST_MODELS, latestObservedEvidenceShare } from "../src/score/industryTrustModels.js";
import { sha256Hex } from "../src/utils/hash.js";
import { canonicalize } from "../src/utils/json.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * P0-15: the industry models shipped peer percentiles with invented sample
 * sizes (1200, 2500, 300, 150, 5000, 3000) and ranked agents against them; the
 * CLI assumed an 80% observed-evidence share. No peer data exists.
 */

const roots: string[] = [];

/** A workspace whose agent "default" has one run with observed share 0.99, sealed by its auditor key or not. */
function runWorkspace(sealed: boolean): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-p015-observed-"));
  roots.push(workspace);
  process.env.AMC_VAULT_PASSPHRASE = "p015-observed-share";
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const base = {
    agentId: "default", runId: "run-share", ts: Date.now(), status: "VALID", integrityIndex: 0.9,
    evidenceTrustCoverage: { observed: 0.99, attested: 0, selfReported: 0.01 }, questionScores: [], reportJsonSha256: "", runSealSig: ""
  };
  const hash = sha256Hex(canonicalize(base));
  const ledger = openLedger(workspace);
  const sig = ledger.signRunHash(hash);
  ledger.close();
  const path = join(workspace, ".amc", "runs", "run-share.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(sealed ? { ...base, reportJsonSha256: hash, runSealSig: sig } : base));
  return workspace;
}

function runCli(args: string[], cwd = mkdtempSync(join(tmpdir(), "amc-p015-industry-"))) {
  roots.push(cwd);
  return spawnSync(process.execPath, [resolve(process.cwd(), "dist/cli.js"), ...args], {
    cwd, env: { ...process.env, NO_COLOR: "1" }, encoding: "utf8", timeout: 60_000
  });
}

afterAll(() => {
  delete process.env.AMC_VAULT_PASSPHRASE;
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe("industry trust models carry no invented peer data", () => {
  test("no model has benchmark percentiles", () => {
    for (const model of Object.values(INDUSTRY_TRUST_MODELS)) {
      expect(model).not.toHaveProperty("benchmarkPercentiles");
      expect(JSON.stringify(model)).not.toMatch(/sampleSize|lastUpdated/);
    }
  });

  test("the percentile rank is null with the reason", () => {
    const result = computeIndustryAdjustedScore({ safety: 0.8, security: 0.7 }, "healthcare", Date.now(), 0.6);
    expect(result.percentileRank).toBeNull();
    expect(result.percentileReason).toBe("no peer data");
  });

  test("an unknown observed-evidence share is reported, never assumed", () => {
    const result = computeIndustryAdjustedScore({ safety: 0.8 }, "healthcare", Date.now(), null);
    expect(result.observedEvidenceShare).toBeNull();
    expect(result.riskFactors.join(" ")).toMatch(/observed evidence share is not evaluated/i);
  });

  test("without a run the observed-evidence share is null, not a default", () => {
    const dir = mkdtempSync(join(tmpdir(), "amc-p015-share-"));
    roots.push(dir);
    expect(latestObservedEvidenceShare(dir, "default")).toBeNull();
  });

  test("only a sealed run supplies the observed-evidence share; an unsealed run file is not evidence", () => {
    const sealed = runWorkspace(true);
    expect(latestObservedEvidenceShare(sealed, "default")).toBe(0.99);
    expect(latestObservedEvidenceShare(sealed, "default", "run-share")).toBe(0.99);
    const forged = runWorkspace(false);
    expect(latestObservedEvidenceShare(forged, "default")).toBeNull();
    expect(latestObservedEvidenceShare(forged, "default", "run-share")).toBeNull();
    const json = runCli(["score", "industry-adjust", "--industry", "healthcare", "--score", "75", "--agent", "default", "--json"], forged);
    expect(json.status, json.stderr).toBe(0);
    const parsed = JSON.parse(json.stdout) as { observedEvidenceShare: number | null; riskFactors: string[] };
    expect(parsed.observedEvidenceShare).toBeNull();
    expect(parsed.riskFactors.join(" ")).toMatch(/observed evidence share is not evaluated/i);
  });

  test("amc score industry-adjust --score 75 prints no percentile", () => {
    const text = runCli(["score", "industry-adjust", "--industry", "healthcare", "--score", "75"]);
    expect(text.status, text.stderr).toBe(0);
    expect(text.stdout).not.toMatch(/percentile/i);
    expect(text.stdout).not.toMatch(/\bp\d{1,2}\b/);
    const json = runCli(["score", "industry-adjust", "--industry", "healthcare", "--score", "75", "--json"]);
    expect(JSON.parse(json.stdout)).toMatchObject({ percentileRank: null, observedEvidenceShare: null });
  });

  test("amc score industry-benchmark reports no peer data", () => {
    const text = runCli(["score", "industry-benchmark", "--industry", "healthcare"]);
    expect(text.status, text.stderr).toBe(0);
    expect(text.stdout).toMatch(/not evaluated/i);
    expect(text.stdout).not.toMatch(/Sample size|P50/);
  });
});

describe("CONSTRUCT_VALIDITY_DATA", () => {
  test("exposes no numeric study figure", () => {
    const numbers: number[] = [];
    const collect = (value: unknown): void => {
      if (typeof value === "number") numbers.push(value);
      else if (typeof value === "string") numbers.push(...(value.match(/\d+\.\d+|n=\d+/g) ?? []).map(Number));
      else if (value && typeof value === "object") Object.values(value).forEach(collect);
    };
    collect(CONSTRUCT_VALIDITY_DATA);
    expect(numbers).toEqual([]);
    expect(CONSTRUCT_VALIDITY_DATA.validated).toBe(false);
  });
});
