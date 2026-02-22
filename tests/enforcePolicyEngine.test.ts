import { describe, expect, test } from "vitest";
import { PolicyFirewall } from "../src/enforce/policyFirewall.js";
import { SafetyEngine, parseDSLRule, parseDSLRules, type SafetyConstraint } from "../src/enforce/safetyDSL.js";

describe("enforce policy engine", () => {
  test("PolicyFirewall allows when no rules match", () => {
    const fw = new PolicyFirewall();
    const result = fw.evaluate("safe_tool", { action: "read" });
    expect(result.decision).toBe("allow");
    expect(result.matchedRules).toEqual([]);
    expect(result.stepUpRequired).toBe(false);
  });

  test("PolicyFirewall denies on matching rule", () => {
    const fw = new PolicyFirewall();
    fw.addRule({ id: "deny-delete", pattern: "delete", action: "deny" });
    const result = fw.evaluate("delete_file", { target: "/tmp" });
    expect(result.decision).toBe("deny");
    expect(result.matchedRules).toContain("deny-delete");
  });

  test("PolicyFirewall sets step-up requirement when stepup rule matches", () => {
    const fw = new PolicyFirewall();
    fw.addRule({ id: "stepup-transfer", pattern: "wire_transfer", action: "stepup" });
    const result = fw.evaluate("wire_transfer", { amount: 9000 });
    expect(result.decision).toBe("stepup");
    expect(result.stepUpRequired).toBe(true);
  });

  test("PolicyFirewall can match against serialized args", () => {
    const fw = new PolicyFirewall();
    fw.addRule({ id: "deny-secret", pattern: "secret", action: "deny" });
    const result = fw.evaluate("tool_safe", { note: "contains-secret-material" });
    expect(result.decision).toBe("deny");
    expect(result.matchedRules).toEqual(["deny-secret"]);
  });

  test("PolicyFirewall applies sanitize only when current decision is allow", () => {
    const fw = new PolicyFirewall();
    fw.addRule({ id: "sanitize-html", pattern: "<script>", action: "sanitize" });
    const result = fw.evaluate("render", { html: "<script>alert(1)</script>" });
    expect(result.decision).toBe("sanitize");
  });

  test("PolicyFirewall quarantine outranks sanitize but not deny", () => {
    const fw = new PolicyFirewall();
    fw.addRule({ id: "sanitize", pattern: "payload", action: "sanitize" });
    fw.addRule({ id: "quarantine", pattern: "payload", action: "quarantine" });
    let result = fw.evaluate("tool", { payload: "suspicious" });
    expect(result.decision).toBe("quarantine");

    fw.addRule({ id: "deny", pattern: "payload", action: "deny" });
    result = fw.evaluate("tool", { payload: "suspicious" });
    expect(result.decision).toBe("deny");
  });

  test("PolicyFirewall listPolicies returns a copy", () => {
    const fw = new PolicyFirewall();
    fw.addRule({ id: "r1", pattern: "x", action: "deny" });
    const listed = fw.listPolicies();
    listed.push({ id: "r2", pattern: "y", action: "allow" });
    expect(fw.listPolicies()).toHaveLength(1);
  });

  test("PolicyFirewall check helper evaluates action string and context", () => {
    const fw = new PolicyFirewall();
    fw.addRule({ id: "deny-shell", pattern: "rm -rf", action: "deny" });
    const result = fw.check("agent-7", "terminal", "rm -rf /");
    expect(result.decision).toBe("deny");
    expect(result.matchedRules).toContain("deny-shell");
  });

  test("parseDSLRule parses valid condition/action/message", () => {
    const parsed = parseDSLRule(
      'WHEN agent.action == "send_email" AND context.pii_detected == true THEN DENY WITH "No PII email"'
    );
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) {
      throw new Error(parsed.error);
    }
    expect(parsed.action).toBe("DENY");
    expect(parsed.conditions).toHaveLength(2);
    expect(parsed.conditions[1]?.value).toBe(true);
  });

  test("parseDSLRule rejects invalid syntax", () => {
    const parsed = parseDSLRule("IF x THEN DENY");
    expect("error" in parsed).toBe(true);
  });

  test("parseDSLRule rejects unsupported action", () => {
    const parsed = parseDSLRule('WHEN agent.action == "x" THEN BLOCK WITH "msg"');
    expect("error" in parsed).toBe(true);
    if ("error" in parsed) {
      expect(parsed.error).toContain("Invalid action");
    }
  });

  test("parseDSLRules handles comments, blank lines, and line-numbered errors", () => {
    const dsl = [
      "# comment",
      "",
      'WHEN agent.action == "x" THEN ALLOW WITH "ok"',
      "bad rule",
      'WHEN context.risk_tier in ["high","critical"] THEN REQUIRE_APPROVAL WITH "approval"'
    ].join("\n");
    const result = parseDSLRules(dsl);
    expect(result.rules).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.line).toBe(4);
  });

  test("SafetyEngine addFromDSL evaluates nested ConstraintContext", () => {
    const engine = new SafetyEngine();
    const added = engine.addFromDSL(
      'WHEN agent.action == "send_email" AND context.pii == true THEN DENY WITH "Blocked"'
    );
    expect("error" in added).toBe(false);

    const result = engine.evaluate({
      agent: { id: "a1", type: "assistant", action: "send_email" },
      context: { pii: true }
    });
    expect(result.decision).toBe("DENY");
    expect(result.allowed).toBe(false);
    expect(result.matchedConstraints).toHaveLength(1);
  });

  test("SafetyEngine evaluates flat dot-path context maps", () => {
    const engine = new SafetyEngine();
    engine.addConstraint({
      id: "c1",
      name: "flat-map",
      conditions: [{ field: "agent.tool", operator: "==", value: "database_write" }],
      action: "REQUIRE_APPROVAL",
      message: "db writes need approval",
      priority: 10,
      enabled: true,
      tags: []
    });
    const result = engine.evaluate({
      "agent.id": "a1",
      "agent.type": "assistant",
      "agent.tool": "database_write"
    });
    expect(result.decision).toBe("REQUIRE_APPROVAL");
    expect(result.allowed).toBe(false);
  });

  test("SafetyEngine chooses most restrictive matched action", () => {
    const engine = new SafetyEngine();
    const constraints: SafetyConstraint[] = [
      {
        id: "allow-c",
        name: "allow",
        conditions: [{ field: "agent.action", operator: "==", value: "export" }],
        action: "ALLOW",
        message: "allow",
        priority: 50,
        enabled: true,
        tags: []
      },
      {
        id: "deny-c",
        name: "deny",
        conditions: [{ field: "agent.action", operator: "matches", value: "export" }],
        action: "DENY",
        message: "deny",
        priority: 100,
        enabled: true,
        tags: []
      }
    ];
    for (const c of constraints) {
      engine.addConstraint(c);
    }
    const result = engine.evaluate({
      agent: { id: "a1", type: "assistant", action: "export" }
    });
    expect(result.decision).toBe("DENY");
    expect(result.decidingConstraint?.constraintId).toBe("deny-c");
  });

  test("SafetyEngine ignores disabled constraints", () => {
    const engine = new SafetyEngine();
    engine.addConstraint({
      id: "disabled",
      name: "disabled",
      conditions: [{ field: "agent.action", operator: "==", value: "delete" }],
      action: "DENY",
      message: "disabled",
      priority: 1,
      enabled: false,
      tags: []
    });
    const result = engine.evaluate({ agent: { id: "a1", type: "assistant", action: "delete" } });
    expect(result.decision).toBe("ALLOW");
    expect(result.totalEvaluated).toBe(0);
  });

  test("SafetyEngine RATE_LIMIT triggers only after threshold exceeded", () => {
    const engine = new SafetyEngine();
    engine.addConstraint({
      id: "rl",
      name: "rate-limit",
      conditions: [{ field: "agent.id", operator: "==", value: "a1" }],
      action: "RATE_LIMIT",
      message: "too many requests",
      priority: 1,
      enabled: true,
      rateLimit: { maxPerMinute: 1, maxPerHour: 10 },
      tags: []
    });

    const first = engine.evaluate({ agent: { id: "a1", type: "assistant" } });
    expect(first.decision).toBe("ALLOW");
    expect(first.matchedConstraints).toHaveLength(0);

    const second = engine.evaluate({ agent: { id: "a1", type: "assistant" } });
    expect(second.decision).toBe("RATE_LIMIT");
    expect(second.matchedConstraints).toHaveLength(1);
  });

  test("SafetyEngine removeConstraint and constraintCount work as expected", () => {
    const engine = new SafetyEngine();
    engine.addConstraint({
      id: "to-remove",
      name: "remove me",
      conditions: [{ field: "agent.id", operator: "==", value: "a1" }],
      action: "LOG",
      message: "log",
      priority: 1,
      enabled: true,
      tags: []
    });
    expect(engine.constraintCount).toBe(1);
    expect(engine.removeConstraint("to-remove")).toBe(true);
    expect(engine.removeConstraint("missing")).toBe(false);
    expect(engine.constraintCount).toBe(0);
  });

  test("SafetyEngine tracks history and can clear it", () => {
    const engine = new SafetyEngine();
    engine.evaluate({ agent: { id: "a1", type: "assistant" } });
    engine.evaluate({ agent: { id: "a2", type: "assistant" } });
    expect(engine.getHistory()).toHaveLength(2);
    engine.clearHistory();
    expect(engine.getHistory()).toHaveLength(0);
  });

  test("SafetyEngine getStats computes deny and approval rates", () => {
    const engine = new SafetyEngine();
    engine.addConstraint({
      id: "deny",
      name: "deny dangerous",
      conditions: [{ field: "agent.action", operator: "==", value: "delete" }],
      action: "DENY",
      message: "deny",
      priority: 1,
      enabled: true,
      tags: []
    });
    engine.addConstraint({
      id: "approval",
      name: "approval transfer",
      conditions: [{ field: "agent.action", operator: "==", value: "transfer" }],
      action: "REQUIRE_APPROVAL",
      message: "approve",
      priority: 2,
      enabled: true,
      tags: []
    });

    engine.evaluate({ agent: { id: "a1", type: "assistant", action: "delete" } });
    engine.evaluate({ agent: { id: "a1", type: "assistant", action: "transfer" } });
    engine.evaluate({ agent: { id: "a1", type: "assistant", action: "read" } });

    const stats = engine.getStats();
    expect(stats.totalConstraints).toBe(2);
    expect(stats.totalEvaluations).toBe(3);
    expect(stats.denyRate).toBeCloseTo(1 / 3, 5);
    expect(stats.approvalRate).toBeCloseTo(1 / 3, 5);
  });

  test("SafetyEngine supports contains, in, and regex match operators", () => {
    const engine = new SafetyEngine();
    engine.addConstraint({
      id: "contains-c",
      name: "contains check",
      conditions: [{ field: "input.tags", operator: "contains", value: "sensitive" }],
      action: "ESCALATE",
      message: "sensitive tag",
      priority: 5,
      enabled: true,
      tags: []
    });
    engine.addConstraint({
      id: "in-c",
      name: "tier check",
      conditions: [{ field: "agent.risk_tier", operator: "in", value: ["high", "critical"] }],
      action: "REQUIRE_APPROVAL",
      message: "high risk",
      priority: 4,
      enabled: true,
      tags: []
    });
    engine.addConstraint({
      id: "matches-c",
      name: "tool pattern",
      conditions: [{ field: "agent.tool", operator: "matches", value: "^db_" }],
      action: "LOG",
      message: "db tool used",
      priority: 10,
      enabled: true,
      tags: []
    });

    const result = engine.evaluate({
      agent: { id: "a1", type: "assistant", risk_tier: "high", tool: "db_write" },
      input: { tags: ["public", "sensitive"] }
    });

    expect(result.matchedConstraints.map((c) => c.constraintId).sort()).toEqual(["contains-c", "in-c", "matches-c"]);
    expect(result.decision).toBe("REQUIRE_APPROVAL");
  });
});
