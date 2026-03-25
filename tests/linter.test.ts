import { describe, test, expect } from "vitest";
import { lintConfigs, formatLintText, formatLintJson, formatLintSarif } from "../src/lint/linter.js";
import { listLintRules } from "../src/lint/rules.js";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function makeTempWorkspace(configs: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-lint-"));
  const amcDir = join(dir, ".amc");
  mkdirSync(amcDir, { recursive: true });
  for (const [name, content] of Object.entries(configs)) {
    writeFileSync(join(amcDir, name), content, "utf8");
  }
  return dir;
}

describe("linter", () => {
  test("lintConfigs finds issues in empty config", () => {
    const workspace = makeTempWorkspace({
      "action-policy.yaml": "actions: []",
    });
    const result = lintConfigs({ workspace });
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.files.length).toBeGreaterThan(0);
  });

  test("lintConfigs returns diagnostics with rule IDs", () => {
    const workspace = makeTempWorkspace({
      "action-policy.yaml": "actions: []",
    });
    const result = lintConfigs({ workspace });
    for (const diag of result.diagnostics) {
      expect(diag.ruleId).toBeDefined();
      expect(diag.severity).toMatch(/error|warning|info/);
      expect(diag.message).toBeDefined();
    }
  });

  test("lintConfigs with specific rules only runs those", () => {
    const workspace = makeTempWorkspace({
      "action-policy.yaml": "actions: []",
    });
    const result = lintConfigs({ workspace, rules: ["require-agent-id"] });
    const ruleIds = new Set(result.diagnostics.map((d) => d.ruleId));
    expect(ruleIds.size).toBeLessThanOrEqual(1);
    if (ruleIds.size > 0) {
      expect(ruleIds.has("require-agent-id")).toBe(true);
    }
  });

  test("formatLintText produces human-readable output", () => {
    const workspace = makeTempWorkspace({ "action-policy.yaml": "actions: []" });
    const result = lintConfigs({ workspace });
    const text = formatLintText(result);
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
  });

  test("formatLintJson produces valid JSON", () => {
    const workspace = makeTempWorkspace({ "action-policy.yaml": "actions: []" });
    const result = lintConfigs({ workspace });
    const json = formatLintJson(result);
    const parsed = JSON.parse(json);
    expect(parsed.diagnostics).toBeDefined();
    expect(Array.isArray(parsed.diagnostics)).toBe(true);
  });

  test("formatLintSarif produces SARIF structure", () => {
    const workspace = makeTempWorkspace({ "action-policy.yaml": "actions: []" });
    const result = lintConfigs({ workspace });
    const sarif = formatLintSarif(result);
    expect(sarif).toBeDefined();
    // SARIF has runs array
    expect(sarif).toHaveProperty("runs");
  });

  test("listLintRules returns all available rules", () => {
    const rules = listLintRules();
    expect(rules.length).toBeGreaterThanOrEqual(9);
    for (const rule of rules) {
      expect(rule.id).toBeDefined();
      expect(rule.description).toBeDefined();
    }
  });

  test("lintConfigs handles workspace with no .amc dir", () => {
    const dir = mkdtempSync(join(tmpdir(), "amc-lint-empty-"));
    const result = lintConfigs({ workspace: dir });
    expect(result.files.length).toBe(0);
    expect(result.diagnostics).toEqual([]);
  });
});
