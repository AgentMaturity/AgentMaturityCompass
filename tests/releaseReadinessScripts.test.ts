import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();

function packageJson(): { scripts?: Record<string, string>; dependencies?: Record<string, string> } {
  return JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
  };
}

describe("release readiness scripts", () => {
  test("prepack uses the release gate instead of the localhost-heavy full test suite", () => {
    const scripts = packageJson().scripts ?? {};

    expect(scripts["qa:install-personas"]).toBe("node scripts/install-persona-qa.mjs");
    expect(scripts.prepack).toContain("release:gate");
    expect(scripts.prepack).toContain("release:prepack-check");
    expect(scripts.prepack).not.toContain("npm test");
  });

  test("release gate includes isolated install QA for at least ten personas", () => {
    const gate = readFileSync(join(root, "scripts", "release-gate.mjs"), "utf8");

    expect(gate).toContain("install-persona-qa");
    expect(gate).toContain("qa:install-personas");
    expect(gate).toContain("full-test-suite");
    expect(gate).toContain('"npx", ["vitest", "run", "--reporter=dot"]');
    expect(gate).toContain("audit:runtime");
    expect(gate).toContain("const child = spawn(command, args");
    expect(gate).toContain("const timer = setTimeout(() =>");
    expect(gate).toContain('detached: process.platform !== "win32"');
    expect(gate).toContain('process.kill(-child.pid, "SIGKILL")');
    expect(gate.indexOf('runStep("build"')).toBeLessThan(gate.indexOf('runStep("full-test-suite"'));
  });

  test("install persona QA emits a readable feedback report", () => {
    const script = readFileSync(join(root, "scripts", "install-persona-qa.mjs"), "utf8");

    expect(script).toContain("--report");
    expect(script).toContain("renderMarkdownReport");
    expect(script).toContain("Ease-of-use feedback");
    expect(script).toContain("npm install --no-audit --fund=false --package-lock=false");
    expect(script).not.toContain("symlinkSync");
  });

  test("packed CLI declares runtime dependencies it imports", () => {
    const pkg = packageJson();
    const dependencies = pkg.dependencies ?? {};

    expect(dependencies.semver).toBeTruthy();
    expect(pkg.scripts?.["audit:runtime"]).toContain("npm audit --omit=dev");
  });

  test("prepack release bundle check does not mutate the workspace install", () => {
    const script = readFileSync(join(root, "scripts", "prepack-release-check.mjs"), "utf8");

    expect(script).toContain("--skip-install-build");
  });
});
