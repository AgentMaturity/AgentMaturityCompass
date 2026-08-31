import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { canonicalize } from "../src/utils/json.js";
import { sha256Hex } from "../src/utils/hash.js";
import { sealedRunReportVerifies } from "../src/diagnostic/reportSeal.js";

/**
 * G9-02/G9-05 — one rule for "this run report is the bytes its writer sealed",
 * shared by every consumer that feeds a report back into scoring. Each reader
 * had been deciding for itself, and most decided not to look.
 */

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-report-seal-test-"));
  roots.push(dir);
  process.env.AMC_VAULT_PASSPHRASE = "report-seal-test-passphrase";
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function sealed(workspace: string, body: Record<string, unknown>): Record<string, unknown> {
  const base = { ...body, reportJsonSha256: "", runSealSig: "" };
  const hash = sha256Hex(canonicalize(base));
  const ledger = openLedger(workspace);
  const sig = ledger.signRunHash(hash);
  ledger.close();
  return { ...base, reportJsonSha256: hash, runSealSig: sig };
}

describe("sealedRunReportVerifies", () => {
  test("accepts a report sealed by this workspace", () => {
    const workspace = newWorkspace();
    const report = sealed(workspace, { runId: "r1", ts: 1, layerScores: [] });
    expect(sealedRunReportVerifies(workspace, report)).toBe(true);
  });

  test("rejects a tampered report", () => {
    const workspace = newWorkspace();
    const report = sealed(workspace, { runId: "r1", ts: 1, overall: 2 });
    report.overall = 5;
    expect(sealedRunReportVerifies(workspace, report)).toBe(false);
  });

  test("rejects unsigned and hashless reports", () => {
    const workspace = newWorkspace();
    expect(sealedRunReportVerifies(workspace, { runId: "r1" })).toBe(false);
    const base = { runId: "r1", reportJsonSha256: "", runSealSig: "" };
    const hash = sha256Hex(canonicalize(base));
    expect(sealedRunReportVerifies(workspace, { ...base, reportJsonSha256: hash, runSealSig: "unsigned" })).toBe(false);
  });

  test("rejects a report sealed by a DIFFERENT workspace's keys", () => {
    const theirs = newWorkspace();
    const mine = newWorkspace();
    const report = sealed(theirs, { runId: "r1", ts: 1 });
    expect(sealedRunReportVerifies(mine, report)).toBe(false);
  });
});
