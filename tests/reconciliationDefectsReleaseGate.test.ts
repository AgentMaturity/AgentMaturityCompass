// AMC-1521: tests/releaseGateExecution.test.ts:55 notices a dropped
// `typecheck-tests` step only through executed/passed/total counts, and no test
// asserted the CI or publish workflow step. That file, scripts/release-gate.mjs
// and .github/workflows/ci.yml are another session's uncommitted work, so this
// separate file pins the step by identity without editing them.
// AMC_RECONCILE_ROOT points a mutation run at a mutated copy of those files.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

const root = resolve(process.env.AMC_RECONCILE_ROOT ?? join(import.meta.dirname, ".."));
const scratch: string[] = [];
afterEach(() => { for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true }); });

describe("test typecheck stays a named release and CI step", () => {
  test("the release gate runs typecheck:tests as its own step before build", async () => {
    const { releaseGate } = await import(pathToFileURL(join(root, "scripts", "release-gate.mjs")).href) as {
      releaseGate: (options: Record<string, unknown>) => Promise<unknown> };
    const workdir = mkdtempSync(join(tmpdir(), "amc-reconcile-gate-")); scratch.push(workdir);
    const calls: Array<{ id: string; argv: string }> = [];
    const execute = async (id: string, command: string, args: string[]) => {
      calls.push({ id, argv: [command, ...args].join(" ") });
      return { id, command: [command, ...args].join(" "), status: "failed", startedAt: "", endedAt: "", stdout: "", stderr: "", remediation: null };
    };
    await releaseGate({ root: workdir, quick: true, execute }).catch(() => undefined);
    const step = calls.findIndex(call => call.id === "typecheck-tests");
    expect(calls[step]).toEqual({ id: "typecheck-tests", argv: "npm run typecheck:tests" });
    expect(step).toBeLessThan(calls.findIndex(call => call.id === "build"));
  });

  test.each(["ci.yml", "npm-publish.yml"])("%s runs the test typecheck as a named step", workflow => {
    const text = readFileSync(join(root, ".github", "workflows", workflow), "utf8");
    expect(text).toMatch(/- name: Typecheck tests\n\s+run: npm run typecheck:tests\n/);
  });
});
