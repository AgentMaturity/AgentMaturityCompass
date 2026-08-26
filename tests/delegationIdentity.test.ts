import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_DELEGATION_DEPTH,
  chainOf,
  delegateTo,
  isDelegate,
  rootIdentity
} from "../src/agent/delegationIdentity.js";
import { budgetForAgent, defaultBudgets } from "../src/budgets/budgets.js";

/**
 * The two escapes this type exists to close (P6.1a).
 *
 * Both were measured in the tree before any subagent code was written:
 *
 * 1. `budgetForAgent` falls back to the `default` limits for an unknown id,
 *    while `budgetUsageSnapshot` counts usage filtered by `meta.agentId`. A run
 *    under a fresh id therefore gets full limits and zero spend.
 * 2. `ToolRegistry` resolves guard scopes with `this.scopes.get(agentId)`, and
 *    scopes are where guards NARROW the global layer. A run under an unknown id
 *    gets the global guards and none of the narrowing.
 *
 * Neither is a bug for a person running `amc agent --agent x`. Both become one
 * the moment a run can spawn a child that names itself, because then spawning
 * resets a budget and sheds a restriction.
 */
describe("a child is governed as its root, never as itself", () => {
  it("inherits governedAs through the whole chain", () => {
    const root = rootIdentity("payments-agent");
    const child = delegateTo(root, "researcher");
    expect(child.ok).toBe(true);
    if (!child.ok) return;
    const grandchild = delegateTo(child.identity, "summariser");
    expect(grandchild.ok).toBe(true);
    if (!grandchild.ok) return;

    expect(child.identity.governedAs).toBe("payments-agent");
    expect(grandchild.identity.governedAs, "two levels down, still the root").toBe("payments-agent");
  });

  it("keeps the child's own name for evidence, separate from what governs it", () => {
    const child = delegateTo(rootIdentity("root"), "researcher");
    if (!child.ok) throw new Error("expected delegation");

    expect(child.identity.runAs, "named for its evidence rows").toBe("researcher");
    expect(child.identity.governedAs, "metered and restricted as the root").toBe("root");
    expect(child.identity.parent).toBe("root");
    expect(child.identity.depth).toBe(1);
  });

  it("closes the budget escape: the child resolves the ROOT's budget", () => {
    // The escape, made concrete. A fresh id resolves the `default` allowance;
    // the root's own allowance is what should apply.
    const config = defaultBudgets("payments-agent");
    const child = delegateTo(rootIdentity("payments-agent"), "researcher");
    if (!child.ok) throw new Error("expected delegation");

    const asChildName = budgetForAgent(config, child.identity.runAs);
    const asGoverned = budgetForAgent(config, child.identity.governedAs);
    const asRoot = budgetForAgent(config, "payments-agent");

    expect(asGoverned, "governedAs resolves the root's budget").toEqual(asRoot);
    // The escape is only interesting if the two names really do resolve
    // differently — otherwise this test would pass on a broken implementation.
    expect(asChildName, "a child-named lookup does NOT resolve the root's budget").not.toEqual(asRoot);
  });
});

describe("depth is bounded, and the bound is not decoration", () => {
  it("refuses one level past the limit", () => {
    let identity = rootIdentity("root");
    for (let level = 1; level <= DEFAULT_MAX_DELEGATION_DEPTH; level += 1) {
      const step = delegateTo(identity, `child-${level}`);
      expect(step.ok, `level ${level} should be allowed`).toBe(true);
      if (!step.ok) return;
      identity = step.identity;
    }
    const past = delegateTo(identity, "one-too-many");

    expect(past.ok).toBe(false);
    if (past.ok) return;
    expect(past.reason).toContain(`exceeds maxDepth ${DEFAULT_MAX_DELEGATION_DEPTH}`);
  });

  it("honours a caller's tighter limit", () => {
    const first = delegateTo(rootIdentity("root"), "child", 1);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    expect(delegateTo(first.identity, "grandchild", 1).ok, "depth 2 with maxDepth 1").toBe(false);
  });

  it("treats maxDepth 0 as delegation disabled", () => {
    const refused = delegateTo(rootIdentity("root"), "child", 0);

    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.reason).toContain("delegation is disabled");
  });

  it("refuses rather than throws, so a parent can record the reason", () => {
    // A thrown error is something a caller can swallow; a returned refusal has
    // to be handled, and carries text fit for an evidence row.
    const refused = delegateTo(rootIdentity("root"), "   ");

    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.reason.length, "a refusal with no reason is not auditable").toBeGreaterThan(20);
  });
});

describe("the small surface around it", () => {
  it("knows a root from a delegate", () => {
    const root = rootIdentity("root");
    expect(isDelegate(root)).toBe(false);

    const child = delegateTo(root, "c");
    if (!child.ok) throw new Error("expected delegation");
    expect(isDelegate(child.identity)).toBe(true);
  });

  it("reports the chain tail it can actually know", () => {
    // One identity knows its parent, not its grandparent. Claiming a full
    // ancestry here would be inventing one; the signed handoff packets are the
    // audit record.
    const root = rootIdentity("root");
    expect(chainOf(root)).toEqual(["root"]);

    const child = delegateTo(root, "c");
    if (!child.ok) throw new Error("expected delegation");
    expect(chainOf(child.identity)).toEqual(["root", "c"]);
  });

  it("refuses an empty root id rather than governing as the empty string", () => {
    expect(() => rootIdentity("  ")).toThrow(/non-empty/);
  });
});
