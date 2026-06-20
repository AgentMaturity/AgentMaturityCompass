import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("accessibility release evidence", () => {
  test("generates an auditable axe release artifact without overclaiming manual AT coverage", () => {
    const dir = mkdtempSync(join(tmpdir(), "amc-a11y-release-"));
    const reportPath = join(dir, "playwright-accessibility.json");
    const outPath = join(dir, "accessibility-release-evidence.md");
    writeFileSync(reportPath, JSON.stringify({
      stats: {
        expected: 7,
        unexpected: 0,
        flaky: 0,
        skipped: 0,
        duration: 1875
      },
      suites: [
        {
          title: "Accessibility",
          specs: [
            { title: "index.html passes axe-core checks", tests: [{ status: "expected", results: [{ status: "passed" }] }] },
            { title: "playground.html passes axe-core checks", tests: [{ status: "expected", results: [{ status: "passed" }] }] },
            { title: "lite.html passes axe-core checks", tests: [{ status: "expected", results: [{ status: "passed" }] }] }
          ]
        }
      ]
    }));

    const result = spawnSync(process.execPath, [
      "scripts/write-accessibility-release-evidence.mjs",
      "--report",
      reportPath,
      "--out",
      outPath,
      "--run-id",
      "test-run-2026-06-16"
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" }
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(existsSync(outPath)).toBe(true);

    const artifact = readFileSync(outPath, "utf8");
    expect(artifact).toContain("# Accessibility Release Evidence");
    expect(artifact).toContain("Automated axe status: PASS");
    expect(artifact).toContain("Manual assistive-technology review: NOT COMPLETE");
    expect(artifact).toContain("test-run-2026-06-16");
    expect(artifact).toContain("index.html passes axe-core checks");
    expect(artifact).toContain("https://www.w3.org/WAI/test-evaluate/");
    expect(artifact).toContain("https://www.deque.com/axe/core-documentation/api-documentation/");
  });

  test("docs and audit expose the release-evidence workflow", () => {
    const runbook = readFileSync("docs/runbooks/ACCESSIBILITY_RELEASE_EVIDENCE.md", "utf8");
    const audit = readFileSync("docs/AUDIT_50_AGENTS_BATCH5.md", "utf8");
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };

    expect(pkg.scripts["accessibility:release-evidence"]).toContain("write-accessibility-release-evidence.mjs");
    expect(runbook).toContain("npx playwright test --config tests/e2e/playwright.config.ts tests/e2e/accessibility.spec.ts --reporter=json");
    expect(runbook).toContain("Manual assistive-technology review remains required");
    expect(audit).toContain("Accessibility release evidence artifact — ✅ Resolved 2026-06-16");
    expect(audit).not.toContain("run status should still be captured in release artifacts");
  });
});
