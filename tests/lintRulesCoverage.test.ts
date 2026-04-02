/**
 * AMC-27 — Lint module coverage
 * Covers: lint/rules/*.ts, lint/rules.ts, lint/linter.ts
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  getLintRule,
  listLintRules,
  runLintRules,
  type LintRuleContext,
} from "../src/lint/rules.js";
import { lintConfigs, formatLintText, formatLintJson } from "../src/lint/linter.js";
import { ruleNoDuplicateKeys } from "../src/lint/rules/noDuplicateKeys.js";
import { ruleNoHardcodedSecrets } from "../src/lint/rules/noHardcodedSecrets.js";
import { ruleRequireAgentId } from "../src/lint/rules/requireAgentId.js";
import { ruleRequireRole } from "../src/lint/rules/requireRole.js";
import { ruleRequireDomain } from "../src/lint/rules/requireDomain.js";
import { ruleValidRiskTier } from "../src/lint/rules/validRiskTier.js";
import { ruleRequireStakeholders } from "../src/lint/rules/requireStakeholders.js";
import { ruleRequirePrimaryTasks } from "../src/lint/rules/requirePrimaryTasks.js";
import { ruleRequireTrustBoundary } from "../src/lint/rules/requireTrustBoundary.js";

// ── helpers ───────────────────────────────────────────────────────────────────

const roots: string[] = [];
function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), "amc-lint-test-"));
  roots.push(d);
  return d;
}
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

function makeCtx(overrides: Partial<LintRuleContext> & { content?: string }): LintRuleContext {
  const content = overrides.content ?? "";
  const lines = content.split("\n");
  let parsed: Record<string, unknown> = {};
  try {
    // minimal YAML-ish parse — just key: value pairs
    for (const line of lines) {
      const m = /^(\w+):\s*(.*)$/.exec(line.trim());
      if (m) parsed[m[1]!] = m[2]?.trim() ?? "";
    }
  } catch { /* ignore */ }
  return {
    file: overrides.file ?? "agent.yml",
    content,
    lines,
    parsed: overrides.parsed ?? parsed,
    ...overrides,
  };
}

function validAgentYaml(): string {
  return [
    "agentId: my-agent",
    "role: data-processor",
    "domain: analytics",
    "riskTier: med",
    "stakeholders:",
    "  - owner@example.com",
    "primaryTasks:",
    "  - process data",
    "trustBoundaryMode: isolated",
  ].join("\n");
}

// ── listLintRules / getLintRule ───────────────────────────────────────────────

describe("lint/rules registry", () => {
  test("listLintRules returns 9 built-in rules", () => {
    expect(listLintRules().length).toBe(9);
  });

  test("getLintRule finds rule by id", () => {
    const r = getLintRule("require-agent-id");
    expect(r).toBeDefined();
    expect(r!.id).toBe("require-agent-id");
  });

  test("getLintRule returns undefined for unknown id", () => {
    expect(getLintRule("no-such-rule")).toBeUndefined();
  });

  test("each rule has id, description, severity, check", () => {
    for (const rule of listLintRules()) {
      expect(typeof rule.id).toBe("string");
      expect(typeof rule.description).toBe("string");
      expect(["error", "warning", "info"]).toContain(rule.severity);
      expect(typeof rule.check).toBe("function");
    }
  });
});

// ── runLintRules ──────────────────────────────────────────────────────────────

describe("runLintRules", () => {
  test("runs all rules when no filter provided", () => {
    const ctx = makeCtx({ content: "", parsed: {} });
    const diags = runLintRules(ctx);
    // All required-field rules should fire on empty config
    expect(diags.length).toBeGreaterThan(0);
  });

  test("filters to specified rule ids only", () => {
    const ctx = makeCtx({ content: "", parsed: {} });
    const diags = runLintRules(ctx, ["require-agent-id"]);
    expect(diags.every(d => d.ruleId === "require-agent-id")).toBe(true);
  });

  test("returns empty array when rule ids filter matches nothing", () => {
    const ctx = makeCtx({ content: validAgentYaml() });
    const diags = runLintRules(ctx, ["require-agent-id"]);
    expect(diags).toHaveLength(0);
  });

  test("skips unknown rule ids gracefully", () => {
    const ctx = makeCtx({ content: validAgentYaml() });
    expect(() => runLintRules(ctx, ["nonexistent-rule"])).not.toThrow();
  });
});

// ── ruleRequireAgentId ────────────────────────────────────────────────────────

describe("rule: require-agent-id", () => {
  test("passes when agentId is present", () => {
    const ctx = makeCtx({ parsed: { agentId: "my-agent" }, content: "agentId: my-agent" });
    expect(ruleRequireAgentId.check(ctx)).toHaveLength(0);
  });

  test("passes when agent_id (underscore) is present", () => {
    const ctx = makeCtx({ parsed: { agent_id: "my-agent" }, content: "agent_id: my-agent" });
    expect(ruleRequireAgentId.check(ctx)).toHaveLength(0);
  });

  test("fails when agentId is missing", () => {
    const ctx = makeCtx({ parsed: {}, content: "role: worker" });
    const diags = ruleRequireAgentId.check(ctx);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.ruleId).toBe("require-agent-id");
    expect(diags[0]!.severity).toBe("error");
  });

  test("fails when agentId is empty string", () => {
    const ctx = makeCtx({ parsed: { agentId: "  " }, content: "agentId: " });
    expect(ruleRequireAgentId.check(ctx)).toHaveLength(1);
  });

  test("reports line number when agentId keyword found in content", () => {
    const content = "role: worker\nagentId: ";
    const ctx = makeCtx({ parsed: { agentId: "" }, content });
    const diags = ruleRequireAgentId.check(ctx);
    expect(diags[0]!.line).toBe(2);
  });
});

// ── ruleRequireRole ───────────────────────────────────────────────────────────

describe("rule: require-role", () => {
  test("passes when role is present", () => {
    const ctx = makeCtx({ parsed: { role: "worker" }, content: "role: worker" });
    expect(ruleRequireRole.check(ctx)).toHaveLength(0);
  });

  test("fails when role is missing", () => {
    const ctx = makeCtx({ parsed: {}, content: "agentId: foo" });
    const diags = ruleRequireRole.check(ctx);
    expect(diags.length).toBeGreaterThan(0);
    expect(diags[0]!.ruleId).toBe("require-role");
  });

  test("fails when role is empty", () => {
    const ctx = makeCtx({ parsed: { role: "" }, content: "role: " });
    expect(ruleRequireRole.check(ctx)).toHaveLength(1);
  });
});

// ── ruleRequireDomain ─────────────────────────────────────────────────────────

describe("rule: require-domain", () => {
  test("passes when domain is present", () => {
    const ctx = makeCtx({ parsed: { domain: "analytics" }, content: "domain: analytics" });
    expect(ruleRequireDomain.check(ctx)).toHaveLength(0);
  });

  test("fails when domain is missing", () => {
    const ctx = makeCtx({ parsed: {}, content: "" });
    const diags = ruleRequireDomain.check(ctx);
    expect(diags.length).toBeGreaterThan(0);
    expect(diags[0]!.ruleId).toBe("require-domain");
  });
});

// ── ruleValidRiskTier ─────────────────────────────────────────────────────────

describe("rule: valid-risk-tier", () => {
  // Valid tiers: "low", "med", "high", "critical"
  for (const tier of ["low", "med", "high", "critical"]) {
    test(`passes for valid tier: ${tier}`, () => {
      const ctx = makeCtx({ parsed: { riskTier: tier }, content: `riskTier: ${tier}` });
      expect(ruleValidRiskTier.check(ctx)).toHaveLength(0);
    });
  }

  test("fails for invalid risk tier value", () => {
    const ctx = makeCtx({ parsed: { riskTier: "extreme" }, content: "riskTier: extreme" });
    const diags = ruleValidRiskTier.check(ctx);
    expect(diags.length).toBeGreaterThan(0);
    expect(diags[0]!.ruleId).toBe("valid-risk-tier");
  });

  test("fails for 'medium' (not a valid value — use 'med')", () => {
    const ctx = makeCtx({ parsed: { riskTier: "medium" }, content: "riskTier: medium" });
    expect(ruleValidRiskTier.check(ctx)).toHaveLength(1);
  });

  test("passes (no error) when riskTier is missing — field is optional", () => {
    // The rule only fires on invalid values, not missing ones
    const ctx = makeCtx({ parsed: {}, content: "" });
    expect(ruleValidRiskTier.check(ctx)).toHaveLength(0);
  });

  test("diagnostic includes fix with replacements", () => {
    const ctx = makeCtx({ parsed: { riskTier: "extreme" }, content: "riskTier: extreme" });
    const diags = ruleValidRiskTier.check(ctx);
    expect(diags[0]!.fix).toBeDefined();
    expect(diags[0]!.fix!.description).toContain("med");
  });
});

// ── ruleNoHardcodedSecrets ────────────────────────────────────────────────────

describe("rule: no-hardcoded-secrets", () => {
  test("passes on clean config", () => {
    const ctx = makeCtx({ content: "agentId: my-agent\nrole: worker" });
    expect(ruleNoHardcodedSecrets.check(ctx)).toHaveLength(0);
  });

  test("detects sk- style API key", () => {
    const content = "agentId: x\napi_key: sk-abcdefghijklmnopqrstuvwxyz123456789012";
    const ctx = makeCtx({ content });
    expect(ruleNoHardcodedSecrets.check(ctx)).toHaveLength(1);
  });

  test("detects ghp_ GitHub token", () => {
    const content = "token: ghp_abcdefghijklmnopqrstuvwxyz123456789012";
    const ctx = makeCtx({ content });
    expect(ruleNoHardcodedSecrets.check(ctx)).toHaveLength(1);
  });

  test("detects apikey pattern", () => {
    const content = "apikey: ABCDEFGHIJKLMNOPQRSTUV12345";
    const ctx = makeCtx({ content });
    expect(ruleNoHardcodedSecrets.check(ctx)).toHaveLength(1);
  });

  test("detects secret/password pattern", () => {
    const content = "password: mysupersecretpassword123456";
    const ctx = makeCtx({ content });
    expect(ruleNoHardcodedSecrets.check(ctx)).toHaveLength(1);
  });

  test("flags at correct line number", () => {
    const content = "agentId: x\ntoken: ghp_abcdefghijklmnopqrstuvwxyz123456789012";
    const ctx = makeCtx({ content });
    const diags = ruleNoHardcodedSecrets.check(ctx);
    expect(diags[0]!.line).toBe(2);
  });

  test("only reports one diagnostic per line even if multiple patterns match", () => {
    const content = "api_key: sk-abcdefghijklmnopqrstuvwxyz123456789012";
    const ctx = makeCtx({ content });
    expect(ruleNoHardcodedSecrets.check(ctx)).toHaveLength(1);
  });
});

// ── ruleNoDuplicateKeys ───────────────────────────────────────────────────────

describe("rule: no-duplicate-keys", () => {
  test("passes on unique keys", () => {
    const content = "agentId: foo\nrole: worker\ndomain: analytics";
    const ctx = makeCtx({ content });
    expect(ruleNoDuplicateKeys.check(ctx)).toHaveLength(0);
  });

  test("detects single duplicate key", () => {
    const content = "agentId: foo\nrole: worker\nagentId: bar";
    const ctx = makeCtx({ content });
    const diags = ruleNoDuplicateKeys.check(ctx);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("agentId");
    expect(diags[0]!.line).toBe(3);
    expect(diags[0]!.ruleId).toBe("no-duplicate-keys");
  });

  test("detects multiple duplicate keys", () => {
    const content = "a: 1\nb: 2\na: 3\nb: 4";
    const ctx = makeCtx({ content });
    expect(ruleNoDuplicateKeys.check(ctx)).toHaveLength(2);
  });

  test("passes on empty file", () => {
    const ctx = makeCtx({ content: "" });
    expect(ruleNoDuplicateKeys.check(ctx)).toHaveLength(0);
  });

  test("ignores indented keys (only checks top-level pattern)", () => {
    // indented lines won't start with ^key:
    const content = "outer:\n  inner: foo\n  inner: bar";
    const ctx = makeCtx({ content });
    // indented "inner" lines don't match ^[a-zA-Z_]... pattern at col 0
    expect(ruleNoDuplicateKeys.check(ctx)).toHaveLength(0);
  });
});

// ── ruleRequireStakeholders ───────────────────────────────────────────────────

describe("rule: require-stakeholders", () => {
  test("passes when stakeholders is a non-empty array", () => {
    const ctx = makeCtx({ parsed: { stakeholders: ["owner@example.com"] } });
    expect(ruleRequireStakeholders.check(ctx)).toHaveLength(0);
  });

  test("passes when stakeholders is a non-empty string (truthy)", () => {
    // Rule checks: !val || (Array.isArray(val) && val.length === 0)
    // A non-empty string is truthy, so it passes
    const ctx = makeCtx({ parsed: { stakeholders: "owner@example.com" } });
    expect(ruleRequireStakeholders.check(ctx)).toHaveLength(0);
  });

  test("fails when stakeholders is missing", () => {
    const ctx = makeCtx({ parsed: {} });
    expect(ruleRequireStakeholders.check(ctx)).toHaveLength(1);
  });

  test("fails when stakeholders is an empty array", () => {
    const ctx = makeCtx({ parsed: { stakeholders: [] } });
    expect(ruleRequireStakeholders.check(ctx)).toHaveLength(1);
  });

  test("severity is warning", () => {
    expect(ruleRequireStakeholders.severity).toBe("warning");
  });
});

// ── ruleRequirePrimaryTasks ───────────────────────────────────────────────────

describe("rule: require-primary-tasks", () => {
  test("passes when primaryTasks is a non-empty array", () => {
    const ctx = makeCtx({ parsed: { primaryTasks: ["process data"] } });
    expect(ruleRequirePrimaryTasks.check(ctx)).toHaveLength(0);
  });

  test("fails when primaryTasks is missing", () => {
    const ctx = makeCtx({ parsed: {} });
    expect(ruleRequirePrimaryTasks.check(ctx)).toHaveLength(1);
  });

  test("fails when primaryTasks is empty array", () => {
    const ctx = makeCtx({ parsed: { primaryTasks: [] } });
    expect(ruleRequirePrimaryTasks.check(ctx)).toHaveLength(1);
  });
});

// ── ruleRequireTrustBoundary ──────────────────────────────────────────────────

describe("rule: require-trust-boundary", () => {
  // Field checked is trustBoundaryMode (or trust_boundary_mode), NOT trustBoundary

  test("passes when trustBoundaryMode is present", () => {
    const ctx = makeCtx({ parsed: { trustBoundaryMode: "isolated" } });
    expect(ruleRequireTrustBoundary.check(ctx)).toHaveLength(0);
  });

  test("passes when trust_boundary_mode (underscore) is present", () => {
    const ctx = makeCtx({ parsed: { trust_boundary_mode: "shared" } });
    expect(ruleRequireTrustBoundary.check(ctx)).toHaveLength(0);
  });

  test("fails when trustBoundaryMode is missing", () => {
    const ctx = makeCtx({ parsed: {} });
    expect(ruleRequireTrustBoundary.check(ctx)).toHaveLength(1);
  });

  test("severity is info", () => {
    expect(ruleRequireTrustBoundary.severity).toBe("info");
  });

  test("ruleId is require-trust-boundary", () => {
    const ctx = makeCtx({ parsed: {} });
    const diags = ruleRequireTrustBoundary.check(ctx);
    expect(diags[0]!.ruleId).toBe("require-trust-boundary");
  });
});

// ── lintConfigs (integration) ─────────────────────────────────────────────────

describe("lintConfigs", () => {
  test("returns empty diagnostics on valid agent.yml", () => {
    const dir = tmpDir();
    writeFileSync(join(dir, "agent.yml"), validAgentYaml(), "utf8");
    const result = lintConfigs({ workspace: dir, files: [join(dir, "agent.yml")] });
    // validAgentYaml includes trustBoundaryMode so info rule passes too
    expect(result.errorCount).toBe(0);
    expect(result.warningCount).toBe(0);
  });

  test("discovers agent.yml at workspace root", () => {
    const dir = tmpDir();
    writeFileSync(join(dir, "agent.yml"), validAgentYaml(), "utf8");
    const result = lintConfigs({ workspace: dir });
    expect(result.files).toContain("agent.yml");
  });

  test("discovers YAML files in .amc/ dir", () => {
    const dir = tmpDir();
    mkdirSync(join(dir, ".amc"), { recursive: true });
    writeFileSync(join(dir, ".amc", "config.yml"), validAgentYaml(), "utf8");
    const result = lintConfigs({ workspace: dir });
    expect(result.files.some(f => f.includes("config.yml"))).toBe(true);
  });

  test("discovers agent.yml in .amc/agents/ subdirs", () => {
    const dir = tmpDir();
    mkdirSync(join(dir, ".amc", "agents", "bot-1"), { recursive: true });
    writeFileSync(join(dir, ".amc", "agents", "bot-1", "agent.yml"), validAgentYaml(), "utf8");
    const result = lintConfigs({ workspace: dir });
    expect(result.files.some(f => f.includes("bot-1"))).toBe(true);
  });

  test("counts errors correctly", () => {
    const dir = tmpDir();
    // Missing agentId, role, domain — should produce errors
    writeFileSync(join(dir, "agent.yml"), "trustBoundary: isolated\nriskTier: medium\nstakeholders:\n  - x\nprimaryTasks:\n  - y", "utf8");
    const result = lintConfigs({ workspace: dir, files: [join(dir, "agent.yml")] });
    expect(result.errorCount).toBeGreaterThan(0);
  });

  test("filters to specified rules", () => {
    const dir = tmpDir();
    writeFileSync(join(dir, "agent.yml"), "riskTier: invalid-tier", "utf8");
    const result = lintConfigs({ workspace: dir, rules: ["valid-risk-tier"], files: [join(dir, "agent.yml")] });
    expect(result.diagnostics.every(d => d.ruleId === "valid-risk-tier")).toBe(true);
  });

  test("skips missing files gracefully", () => {
    const dir = tmpDir();
    expect(() =>
      lintConfigs({ workspace: dir, files: [join(dir, "nonexistent.yml")] })
    ).not.toThrow();
  });

  test("result contains files array with relative paths", () => {
    const dir = tmpDir();
    writeFileSync(join(dir, "agent.yml"), validAgentYaml(), "utf8");
    const result = lintConfigs({ workspace: dir, files: [join(dir, "agent.yml")] });
    expect(result.files[0]).toBe("agent.yml");
  });

  test("lintConfigs with no files returns empty result", () => {
    const dir = tmpDir();
    const result = lintConfigs({ workspace: dir });
    expect(result.files).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(0);
  });

  test("infoCount and warningCount are zero on fully-valid config", () => {
    const dir = tmpDir();
    writeFileSync(join(dir, "agent.yml"), validAgentYaml(), "utf8");
    const result = lintConfigs({ workspace: dir, files: [join(dir, "agent.yml")] });
    // validAgentYaml() has trustBoundaryMode set, so info rule passes
    expect(result.errorCount).toBe(0);
    expect(result.warningCount).toBe(0);
    expect(result.infoCount).toBe(0);
  });
});

// ── formatLintText ────────────────────────────────────────────────────────────

describe("formatLintText", () => {
  test("always includes summary line", () => {
    const result = { files: [], diagnostics: [], errorCount: 0, warningCount: 0, infoCount: 0, fixedCount: 0 };
    const out = formatLintText(result);
    expect(out).toContain("0 error");
    expect(out).toContain("0 warning");
  });

  test("formats error diagnostic with ✗ icon", () => {
    const diag = {
      ruleId: "require-agent-id", severity: "error" as const,
      message: "Missing agentId", file: "agent.yml", line: 1, column: 1
    };
    const result = { files: ["agent.yml"], diagnostics: [diag], errorCount: 1, warningCount: 0, infoCount: 0, fixedCount: 0 };
    const out = formatLintText(result);
    expect(out).toContain("✗");
    expect(out).toContain("Missing agentId");
    expect(out).toContain("require-agent-id");
  });

  test("formats warning diagnostic with ⚠ icon", () => {
    const diag = {
      ruleId: "some-rule", severity: "warning" as const,
      message: "A warning", file: "agent.yml", line: 2, column: 1
    };
    const result = { files: ["agent.yml"], diagnostics: [diag], errorCount: 0, warningCount: 1, infoCount: 0, fixedCount: 0 };
    const out = formatLintText(result);
    expect(out).toContain("⚠");
  });

  test("formats info diagnostic with ℹ icon", () => {
    const diag = {
      ruleId: "some-rule", severity: "info" as const,
      message: "An info", file: "agent.yml", line: 3, column: 1
    };
    const result = { files: ["agent.yml"], diagnostics: [diag], errorCount: 0, warningCount: 0, infoCount: 1, fixedCount: 0 };
    const out = formatLintText(result);
    expect(out).toContain("ℹ");
  });

  test("summary counts match non-zero values", () => {
    const diag = {
      ruleId: "r", severity: "error" as const, message: "e", file: "f.yml", line: 1, column: 1
    };
    const result = { files: ["f.yml"], diagnostics: [diag], errorCount: 1, warningCount: 0, infoCount: 0, fixedCount: 0 };
    const out = formatLintText(result);
    expect(out).toContain("1 error");
  });
});

// ── formatLintJson ────────────────────────────────────────────────────────────

describe("formatLintJson", () => {
  test("returns valid JSON string", () => {
    const result = { files: [], diagnostics: [], errorCount: 0, warningCount: 0, infoCount: 0, fixedCount: 0 };
    const json = formatLintJson(result);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  test("JSON contains errorCount and warningCount", () => {
    const result = { files: [], diagnostics: [], errorCount: 3, warningCount: 1, infoCount: 0, fixedCount: 0 };
    const parsed = JSON.parse(formatLintJson(result));
    expect(parsed.errorCount).toBe(3);
    expect(parsed.warningCount).toBe(1);
  });
});
