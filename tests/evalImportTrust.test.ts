import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { importEvalResults, type EvalImportFormat } from "../src/eval/evalImporters.js";
import { openLedger } from "../src/ledger/ledger.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * P0-18: imported eval results are SELF_REPORTED whatever the format, the operator cannot choose a tier, and the
 * file's own timestamps never become ledger time.
 */
const PASSPHRASE = "eval-import-trust-test-passphrase";
const HOUR = 3_600_000;
const roots: string[] = [];
afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function workspace(): string {
  process.env.AMC_VAULT_PASSPHRASE = PASSPHRASE;
  const dir = mkdtempSync(join(tmpdir(), "amc-eval-import-trust-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

function write(dir: string, value: unknown): string {
  writeFileSync(join(dir, "eval.json"), JSON.stringify(value), "utf8");
  return "eval.json";
}

function importedRows(dir: string): Array<{ ts: number; meta: Record<string, unknown> }> {
  const ledger = openLedger(dir);
  try {
    return (ledger.db.prepare("SELECT ts, meta_json FROM evidence_events WHERE json_extract(meta_json, '$.source') = 'eval_import'")
      .all() as Array<{ ts: number; meta_json: string }>).map((row) => ({ ts: row.ts, meta: JSON.parse(row.meta_json) as Record<string, unknown> }));
  } finally {
    ledger.close();
  }
}

const FIXTURES: Record<EvalImportFormat, unknown> = {
  openai: { results: [{ id: "oa-1", name: "policy refusal", pass: false, score: 0.1 }] },
  langsmith: { runs: [{ id: "ls-1", name: "jailbreak regression", pass: false, score: 0.1 }] },
  deepeval: { test_cases: [{ id: "de-1", name: "relevancy", pass: true, score: 0.9, metrics_data: [{ name: "answer_relevancy", score: 0.9, success: true }] }] },
  promptfoo: { results: [{ id: "pf-1", description: "prompt injection", success: false, assertionResults: [{ name: "llm01_prompt_injection", pass: false }] }] },
  wandb: { runs: [{ id: "wb-1", name: "run", summary: { accuracy: 0.9 } }] },
  langfuse: { traces: [{ id: "lf-1", name: "trace", status: "ok" }] },
  langwatch: { evaluations: [{ id: "lw-1", name: "eval", status: "ok" }] }
};

describe("eval import trust tier", () => {
  test.each(Object.keys(FIXTURES) as EvalImportFormat[])("%s imports SELF_REPORTED", (format) => {
    const dir = workspace();
    importEvalResults({ workspace: dir, format, file: write(dir, FIXTURES[format]) });
    const rows = importedRows(dir);
    expect(rows.length).toBeGreaterThan(2);
    expect(rows.every((row) => row.meta.trustTier === "SELF_REPORTED")).toBe(true);
  });

  test("amc eval import --trust-tier OBSERVED exits 2 with the removal message and writes nothing", () => {
    const dir = workspace();
    const file = write(dir, FIXTURES.openai);
    const run = spawnSync(process.execPath, [resolve("dist/cli.js"), "eval", "import", "--format", "openai", "--file", file, "--trust-tier", "OBSERVED"], {
      cwd: dir, encoding: "utf8", env: { ...process.env, NO_COLOR: "1", AMC_VAULT_PASSPHRASE: PASSPHRASE }, timeout: 60_000
    });
    expect(run.status).toBe(2);
    expect(run.stderr).toContain("--trust-tier was removed in 2.0.0: trust tiers are derived from provenance, and imported results are SELF_REPORTED. See docs/EVIDENCE_TRUST.md.");
    expect(importedRows(dir)).toEqual([]);
  }, 90_000);
});

describe("eval import time policy", () => {
  function caseAt(ts: number, id = "oa-time"): unknown {
    return { results: [{ id, name: "timed case", pass: true, score: 1, timestamp: new Date(ts).toISOString() }] };
  }

  test("a case one hour in the future is refused, naming the case", () => {
    const dir = workspace();
    expect(() => importEvalResults({ workspace: dir, format: "openai", file: write(dir, caseAt(Date.now() + HOUR, "future-case")) }))
      .toThrow(/future-case/);
    expect(importedRows(dir)).toEqual([]);
  });

  test("a case three days old is refused without --historical", () => {
    const dir = workspace();
    expect(() => importEvalResults({ workspace: dir, format: "openai", file: write(dir, caseAt(Date.now() - 72 * HOUR, "old-case")) }))
      .toThrow(/old-case[\s\S]*--historical/);
    expect(importedRows(dir)).toEqual([]);
  });

  test("with --historical a three-day-old case is stored at recorded time and keeps its claimed time", () => {
    const dir = workspace();
    const claimed = Date.now() - 72 * HOUR;
    const before = Date.now();
    importEvalResults({ workspace: dir, format: "openai", file: write(dir, caseAt(claimed)), historical: true });
    const rows = importedRows(dir).filter((row) => row.meta.caseId === "oa-time");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.ts).toBeGreaterThanOrEqual(before);
      expect(row.meta.claimedTs).toBe(claimed);
      expect(row.meta.historical).toBe(true);
    }
  });

  test("a recent case is accepted and still written at recorded time", () => {
    const dir = workspace();
    const claimed = Date.now() - HOUR;
    const before = Date.now();
    importEvalResults({ workspace: dir, format: "openai", file: write(dir, caseAt(claimed)) });
    const rows = importedRows(dir).filter((row) => row.meta.caseId === "oa-time");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.ts >= before && row.meta.claimedTs === claimed && row.meta.historical === undefined)).toBe(true);
  });
});
