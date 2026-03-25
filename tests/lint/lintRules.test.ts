import { describe, expect, test } from "vitest";
import { runLintRules, listLintRules, getLintRule, type LintRuleContext } from "../../src/lint/rules.js";
import { lintConfigs, formatLintText, formatLintJson, formatLintSarif } from "../../src/lint/linter.js";
import { ruleRequireAgentId } from "../../src/lint/rules/requireAgentId.js";
import { ruleRequireRole } from "../../src/lint/rules/requireRole.js";
import { ruleRequireDomain } from "../../src/lint/rules/requireDomain.js";
import { ruleValidRiskTier } from "../../src/lint/rules/validRiskTier.js";
import { ruleNoHardcodedSecrets } from "../../src/lint/rules/noHardcodedSecrets.js";
import { ruleRequireStakeholders } from "../../src/lint/rules/requireStakeholders.js";
import { ruleRequirePrimaryTasks } from "../../src/lint/rules/requirePrimaryTasks.js";
import { ruleNoDuplicateKeys } from "../../src/lint/rules/noDuplicateKeys.js";
import { ruleRequireTrustBoundary } from "../../src/lint/rules/requireTrustBoundary.js";

function makeCtx(content: string, parsed: Record<string, unknown> = {}): LintRuleContext {
  return {
    file: "test.yml",
    content,
    lines: content.split("\n"),
    parsed,
  };
}

describe("Lint Rules Registry", () => {
  test("listLintRules returns all 9 built-in rules", () => {
    const rules = listLintRules();
    expect(rules.length).toBe(9);
    const ids = rules.map((r) => r.id);
    expect(ids).toContain("require-agent-id");
    expect(ids).toContain("no-hardcoded-secrets");
    expect(ids).toContain("valid-risk-tier");
  });

  test("getLintRule returns a specific rule", () => {
    const rule = getLintRule("require-agent-id");
    expect(rule).toBeDefined();
    expect(rule!.id).toBe("require-agent-id");
  });

  test("getLintRule returns undefined for unknown rule", () => {
    expect(getLintRule("nonexistent")).toBeUndefined();
  });

  test("runLintRules with filter runs only specified rules", () => {
    const ctx = makeCtx("domain: finance", { domain: "finance" });
    const diags = runLintRules(ctx, ["require-domain"]);
    expect(diags.length).toBe(0);
  });
});

describe("require-agent-id", () => {
  test("flags missing agentId", () => {
    const ctx = makeCtx("role: assistant", {});
    const diags = ruleRequireAgentId.check(ctx);
    expect(diags.length).toBe(1);
    expect(diags[0]!.ruleId).toBe("require-agent-id");
    expect(diags[0]!.severity).toBe("error");
  });

  test("passes when agentId is present", () => {
    const ctx = makeCtx("agentId: my-agent", { agentId: "my-agent" });
    const diags = ruleRequireAgentId.check(ctx);
    expect(diags.length).toBe(0);
  });

  test("flags empty agentId", () => {
    const ctx = makeCtx("agentId: ", { agentId: "" });
    const diags = ruleRequireAgentId.check(ctx);
    expect(diags.length).toBe(1);
  });
});

describe("require-role", () => {
  test("flags missing role", () => {
    const ctx = makeCtx("agentId: x", { agentId: "x" });
    const diags = ruleRequireRole.check(ctx);
    expect(diags.length).toBe(1);
    expect(diags[0]!.severity).toBe("warning");
  });

  test("passes when role is present", () => {
    const ctx = makeCtx("role: analyst", { role: "analyst" });
    const diags = ruleRequireRole.check(ctx);
    expect(diags.length).toBe(0);
  });
});

describe("require-domain", () => {
  test("flags missing domain", () => {
    const ctx = makeCtx("agentId: x", {});
    const diags = ruleRequireDomain.check(ctx);
    expect(diags.length).toBe(1);
  });

  test("passes when domain is present", () => {
    const ctx = makeCtx("domain: fintech", { domain: "fintech" });
    const diags = ruleRequireDomain.check(ctx);
    expect(diags.length).toBe(0);
  });
});

describe("valid-risk-tier", () => {
  test("flags invalid riskTier", () => {
    const ctx = makeCtx("riskTier: extreme", { riskTier: "extreme" });
    const diags = ruleValidRiskTier.check(ctx);
    expect(diags.length).toBe(1);
    expect(diags[0]!.severity).toBe("error");
    expect(diags[0]!.fix).toBeDefined();
  });

  test("passes when riskTier is valid", () => {
    const ctx = makeCtx("riskTier: high", { riskTier: "high" });
    const diags = ruleValidRiskTier.check(ctx);
    expect(diags.length).toBe(0);
  });

  test("passes when riskTier is not set", () => {
    const ctx = makeCtx("agentId: x", {});
    const diags = ruleValidRiskTier.check(ctx);
    expect(diags.length).toBe(0);
  });
});

describe("no-hardcoded-secrets", () => {
  test("flags sk- pattern", () => {
    const ctx = makeCtx("token: sk-abcdefghijklmnopqrstuvwxyz123456789", {});
    const diags = ruleNoHardcodedSecrets.check(ctx);
    expect(diags.length).toBe(1);
    expect(diags[0]!.severity).toBe("error");
  });

  test("flags api_key pattern", () => {
    const ctx = makeCtx("api_key: ABCDEFGHIJKLMNOPQRSTUVWXYZ", {});
    const diags = ruleNoHardcodedSecrets.check(ctx);
    expect(diags.length).toBe(1);
  });

  test("passes for clean config", () => {
    const ctx = makeCtx("agentId: my-agent\nrole: helper", {});
    const diags = ruleNoHardcodedSecrets.check(ctx);
    expect(diags.length).toBe(0);
  });
});

describe("require-stakeholders", () => {
  test("flags missing stakeholders", () => {
    const ctx = makeCtx("agentId: x", {});
    const diags = ruleRequireStakeholders.check(ctx);
    expect(diags.length).toBe(1);
  });

  test("passes when stakeholders are present", () => {
    const ctx = makeCtx("stakeholders:\n  - admin", { stakeholders: ["admin"] });
    const diags = ruleRequireStakeholders.check(ctx);
    expect(diags.length).toBe(0);
  });
});

describe("require-primary-tasks", () => {
  test("flags missing primaryTasks", () => {
    const ctx = makeCtx("agentId: x", {});
    const diags = ruleRequirePrimaryTasks.check(ctx);
    expect(diags.length).toBe(1);
  });

  test("passes when primaryTasks are present", () => {
    const ctx = makeCtx("primaryTasks:\n  - analyze", { primaryTasks: ["analyze"] });
    const diags = ruleRequirePrimaryTasks.check(ctx);
    expect(diags.length).toBe(0);
  });
});

describe("no-duplicate-keys", () => {
  test("flags duplicate keys", () => {
    const ctx = makeCtx("agentId: a\nrole: x\nagentId: b", {});
    const diags = ruleNoDuplicateKeys.check(ctx);
    expect(diags.length).toBe(1);
    expect(diags[0]!.message).toContain("Duplicate key");
  });

  test("passes when no duplicates", () => {
    const ctx = makeCtx("agentId: a\nrole: x", {});
    const diags = ruleNoDuplicateKeys.check(ctx);
    expect(diags.length).toBe(0);
  });
});

describe("require-trust-boundary", () => {
  test("flags missing trustBoundaryMode", () => {
    const ctx = makeCtx("agentId: x", {});
    const diags = ruleRequireTrustBoundary.check(ctx);
    expect(diags.length).toBe(1);
    expect(diags[0]!.severity).toBe("info");
  });

  test("passes when trustBoundaryMode is set", () => {
    const ctx = makeCtx("trustBoundaryMode: isolated", { trustBoundaryMode: "isolated" });
    const diags = ruleRequireTrustBoundary.check(ctx);
    expect(diags.length).toBe(0);
  });
});

describe("Lint formatters", () => {
  test("formatLintText produces human-readable output", () => {
    const result = {
      files: ["test.yml"],
      diagnostics: [{
        ruleId: "require-agent-id",
        severity: "error" as const,
        message: "Missing agentId",
        file: "test.yml",
        line: 1,
        column: 1,
      }],
      errorCount: 1,
      warningCount: 0,
      infoCount: 0,
      fixedCount: 0,
    };
    const text = formatLintText(result);
    expect(text).toContain("test.yml:1:1");
    expect(text).toContain("1 error(s)");
  });

  test("formatLintJson produces valid JSON", () => {
    const result = {
      files: ["test.yml"],
      diagnostics: [],
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      fixedCount: 0,
    };
    const json = formatLintJson(result);
    const parsed = JSON.parse(json) as unknown;
    expect(parsed).toBeDefined();
  });

  test("formatLintSarif produces valid SARIF", () => {
    const result = {
      files: ["test.yml"],
      diagnostics: [{
        ruleId: "require-agent-id",
        severity: "error" as const,
        message: "Missing",
        file: "test.yml",
        line: 1,
        column: 1,
      }],
      errorCount: 1,
      warningCount: 0,
      infoCount: 0,
      fixedCount: 0,
    };
    const sarif = formatLintSarif(result);
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0]!.results.length).toBe(1);
    expect(sarif.runs[0]!.results[0]!.level).toBe("error");
  });
});
