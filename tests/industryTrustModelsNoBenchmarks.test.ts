import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { CONSTRUCT_VALIDITY_DATA } from "../src/index.js";
import { computeIndustryAdjustedScore, INDUSTRY_TRUST_MODELS } from "../src/score/industryTrustModels.js";

/**
 * P0-15: the industry models shipped peer percentiles with invented sample
 * sizes (1200, 2500, 300, 150, 5000, 3000) and ranked agents against them; the
 * CLI assumed an 80% observed-evidence share. No peer data exists.
 */

const roots: string[] = [];

function runCli(args: string[]) {
  const cwd = mkdtempSync(join(tmpdir(), "amc-p015-industry-"));
  roots.push(cwd);
  return spawnSync(process.execPath, [resolve(process.cwd(), "dist/cli.js"), ...args], {
    cwd, env: { ...process.env, NO_COLOR: "1" }, encoding: "utf8", timeout: 60_000
  });
}

afterAll(() => {
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
