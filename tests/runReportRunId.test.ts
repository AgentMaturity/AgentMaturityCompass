/**
 * `loadRunReport` joins the run id into a path (`<runsDir>/<runId>.json`), and `amc bundle export --run` and every other
 * caller hand it the id as typed. Ids outside /^[A-Za-z0-9_-]+$/ are refused with RUN_ID_INVALID before any path is built.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { loadRunReport, loadVerifiedRunReport } from "../src/diagnostic/runReportResolution.js";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

/** A workspace whose legacy runs dir holds one run, and a sibling file a `../` id would reach. */
function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-run-id-"));
  dirs.push(root);
  const ws = join(root, "ws");
  mkdirSync(join(ws, ".amc", "runs"), { recursive: true });
  writeFileSync(join(ws, ".amc", "runs", "run_ok-1.json"), JSON.stringify({ runId: "run_ok-1", ts: 1 }));
  writeFileSync(join(ws, ".amc", "outside.json"), JSON.stringify({ runId: "outside", ts: 2 }));
  writeFileSync(join(root, "abs.json"), JSON.stringify({ runId: "abs", ts: 3 }));
  return ws;
}
const reasonOf = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (error) {
    return (error as { code?: unknown }).code;
  }
  return "no error";
};

describe("loadRunReport run id", () => {
  test("a well-formed id loads", () => {
    expect(loadRunReport(workspace(), "run_ok-1").runId).toBe("run_ok-1");
  });

  test.each([["../outside"], ["../../abs"], ["/tmp/abs"], ["a/b"], ["a\\b"], ["."], [""], ["run.1"]])("%j is refused with RUN_ID_INVALID", (runId) => {
    const ws = workspace();
    expect(reasonOf(() => loadRunReport(ws, runId))).toBe("RUN_ID_INVALID");
    expect(() => loadRunReport(ws, runId)).toThrow(/^RUN_ID_INVALID: /);
    expect(loadVerifiedRunReport(ws, runId)).toBeNull();
  });

  test("an absolute id naming an existing file is refused, not read", () => {
    const ws = workspace();
    expect(reasonOf(() => loadRunReport(ws, join(ws, "..", "abs")))).toBe("RUN_ID_INVALID");
  });
});
