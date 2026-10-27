import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BIN = "packages/amc-conformance/bin/amc-conformance.mjs";
export const DOUBLES = "tests/conformance/doubles";

interface CaseResult { id: string; normative: boolean; outcome: string; durationMs: number; diff: Record<string, unknown> | null }
export interface Results { class: string; conformant: boolean; summary: { normativePassed: number; normativeTotal: number }; cases: CaseResult[]; [key: string]: unknown }

/** Runs `amc-conformance run` in a child process and reads the results file it wrote (null when it wrote none). */
export function runConformance(cls: string, impl: string, extra: string[] = []): { status: number | null; stderr: string; results: Results | null; raw: unknown } {
  const dir = mkdtempSync(join(tmpdir(), "amc-conformance-test-"));
  try {
    const out = join(dir, "results.json");
    const run = spawnSync(process.execPath, [BIN, "run", "--class", cls, "--impl", impl, "--out", out, ...extra], { encoding: "utf8", timeout: 300_000 });
    let raw: unknown = null;
    try { raw = JSON.parse(readFileSync(out, "utf8")); } catch { /* no results written */ }
    return { status: run.status, stderr: run.stderr, results: raw as Results | null, raw };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export const outcomeOf = (results: Results | null, id: string): string | undefined => results?.cases.find(item => item.id === id)?.outcome;

/** The verifier case id for a fixture directory name, from the committed manifest. */
export function verifierCaseId(fixture: string): string {
  const manifest = JSON.parse(readFileSync("spec/conformance/v1/verifier.json", "utf8")) as { cases: Array<{ id: string; name: string }> };
  const found = manifest.cases.find(item => item.name === fixture);
  if (!found) throw new Error(`no verifier case for fixture ${fixture}`);
  return found.id;
}
