import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import YAML from "yaml";
import {
  initBudgets,
  evaluateBudgetStatus,
  defaultBudgets,
  budgetsPath,
  signBudgetsConfig
} from "../src/budgets/budgets.js";

/**
 * Failing-direction coverage for evaluateBudgetStatus.
 *
 * Written because P4.1 wires budgets in as an inline execution guard, and this
 * function had ZERO test references anywhere in the suite — it has only ever
 * been a reporter. A checker that has never denied anything in a test is about
 * to decide whether real work proceeds: from then on its bugs stop producing a
 * wrong number and start either blocking legitimate work or waving through what
 * they should stop.
 *
 * Every test below drives REAL ledger events, because usage is derived from the
 * ledger rather than passed in. A test that stubbed the usage snapshot would
 * pass against a function that could not read the ledger at all.
 */
const PASS = "budgets-evaluate-status-pass";
const AGENT = "default";

function withWorkspace<T>(fn: (workspace: string) => T): T {
  const prior = process.env["AMC_VAULT_PASSPHRASE"];
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const workspace = mkdtempSync(join(tmpdir(), "amc-budgets-"));
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  initBudgets(workspace, AGENT);
  try {
    return fn(workspace);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
    if (prior === undefined) delete process.env["AMC_VAULT_PASSPHRASE"];
    else process.env["AMC_VAULT_PASSPHRASE"] = prior;
  }
}

/** Append `count` events of one type, attributed to `agentId`. */
function append(
  workspace: string,
  eventType: "llm_request" | "llm_response" | "tool_action",
  count: number,
  extra: { meta?: Record<string, unknown>; payload?: Record<string, unknown> } = {},
  agentId: string = AGENT
): void {
  const ledger = openLedger(workspace);
  try {
    ledger.startSession({
      sessionId: `s-${eventType}-${agentId}-${count}`,
      runtime: "amc",
      binaryPath: "b",
      binarySha256: "0".repeat(64)
    });
    for (let i = 0; i < count; i += 1) {
      ledger.appendEvidence({
        sessionId: `s-${eventType}-${agentId}-${count}`,
        runtime: "amc",
        eventType,
        payload: JSON.stringify(extra.payload ?? {}),
        inline: true,
        meta: { agentId, ...(extra.meta ?? {}) }
      });
    }
    ledger.sealSession(`s-${eventType}-${agentId}-${count}`);
  } finally {
    ledger.close();
  }
}

const DEPLOY_EXECUTE = { payload: { effectiveMode: "EXECUTE", actionClass: "DEPLOY" } };

describe("evaluateBudgetStatus denies", () => {
  it("fails CLOSED when the budgets config signature is invalid", () => {
    withWorkspace((workspace) => {
      // Baseline: a freshly signed config permits.
      expect(evaluateBudgetStatus(workspace, AGENT).ok).toBe(true);

      // Remove only the signature — the config itself is untouched.
      unlinkSync(join(workspace, ".amc", "budgets.yaml.sig"));

      const status = evaluateBudgetStatus(workspace, AGENT);
      expect(status.ok, "an unverifiable budget config must not permit spending").toBe(false);
      expect(status.budgetConfigValid).toBe(false);
      expect(status.reasons.join(" ")).toContain("signature invalid");
      // The high-consequence classes are frozen specifically, not merely flagged.
      expect(status.exceededActionClasses).toEqual(
        expect.arrayContaining(["DEPLOY", "WRITE_HIGH", "SECURITY"])
      );
    });
  });

  it("denies when per-minute LLM requests are exceeded", () => {
    withWorkspace((workspace) => {
      // Default perMinute.maxLlmRequests is 60.
      append(workspace, "llm_request", 61);
      const status = evaluateBudgetStatus(workspace, AGENT);
      expect(status.ok).toBe(false);
      expect(status.reasons.join(" ")).toContain("per-minute llm requests exceeded");
    });
  });

  it("denies when daily cost is exceeded, reading cost from the response meta", () => {
    withWorkspace((workspace) => {
      // Default daily.maxCostUsd is 50.
      append(workspace, "llm_response", 1, { meta: { usage: { cost_usd: 50.01 } } });
      const status = evaluateBudgetStatus(workspace, AGENT);
      expect(status.ok).toBe(false);
      expect(status.reasons.join(" ")).toContain("daily llm cost exceeded");
    });
  });

  it("names the exceeded ACTION CLASS, not just that something was exceeded", () => {
    withWorkspace((workspace) => {
      // Default daily.maxToolExecutes.DEPLOY is 3.
      append(workspace, "tool_action", 4, DEPLOY_EXECUTE);
      const status = evaluateBudgetStatus(workspace, AGENT);
      expect(status.ok).toBe(false);
      // A guard needs to know WHICH class to freeze; "over budget" is not actionable.
      expect(status.exceededActionClasses).toContain("DEPLOY");
      expect(status.exceededActionClasses).not.toContain("READ_ONLY");
    });
  });

  it("allows EXACTLY at the limit, and denies one over", () => {
    // The comparisons are `>` not `>=`. That is the classic budget off-by-one,
    // and the difference between a limit of 3 meaning three or two.
    withWorkspace((workspace) => {
      append(workspace, "tool_action", 3, DEPLOY_EXECUTE);
      expect(evaluateBudgetStatus(workspace, AGENT).ok, "the limit itself is permitted").toBe(true);

      append(workspace, "tool_action", 1, DEPLOY_EXECUTE);
      expect(evaluateBudgetStatus(workspace, AGENT).ok, "one past the limit is not").toBe(false);
    });
  });

  it("counts only EXECUTE, so a simulated action spends no budget", () => {
    withWorkspace((workspace) => {
      // Far past the DEPLOY limit of 3, but simulated.
      append(workspace, "tool_action", 20, { payload: { effectiveMode: "SIMULATE", actionClass: "DEPLOY" } });
      const status = evaluateBudgetStatus(workspace, AGENT);
      expect(status.ok, "simulation must not consume a real budget").toBe(true);
      expect(status.exceededActionClasses).toHaveLength(0);
    });
  });

  it("attributes usage per agent — another agent's spend does not deny this one", () => {
    withWorkspace((workspace) => {
      append(workspace, "llm_request", 61, {}, "some-other-agent");
      expect(
        evaluateBudgetStatus(workspace, AGENT).ok,
        "budgets are per agent; cross-attribution would deny the wrong caller"
      ).toBe(true);
    });
  });
});

describe("evaluateBudgetStatus — what happens to an agent the config never mentions", () => {
  it("inherits the `default` LIMITS but gets its own FRESH counters", () => {
    // `budgetForAgent` falls back to the `default` entry, so an unlisted agent
    // is still governed — but usage is attributed per agentId, so each new
    // agent id starts at zero. A fleet of N agents therefore gets N times the
    // budget the operator wrote down. Pinned because it is easy to read the
    // config as a total.
    withWorkspace((workspace) => {
      append(workspace, "tool_action", 4, DEPLOY_EXECUTE, "unlisted-agent");
      expect(
        evaluateBudgetStatus(workspace, "unlisted-agent").ok,
        "an unlisted agent is governed by the default limits"
      ).toBe(false);

      expect(
        evaluateBudgetStatus(workspace, "another-unlisted-agent").ok,
        "...but its spend is its own, so a second agent starts fresh"
      ).toBe(true);
    });
  });

  it("is UNGOVERNED when the config has no `default` entry at all", () => {
    // The one truly open path: with no matching entry and no default,
    // `budgetForAgent` returns null and the function returns ok:true without
    // looking at usage. `initBudgets` always writes a `default`, so this needs
    // a hand-built config to reach — but an operator pruning the config to
    // named agents would land here, and would silently un-govern everyone else.
    withWorkspace((workspace) => {
      writeFileSync(budgetsPath(workspace), YAML.stringify(defaultBudgets("alpha")));
      signBudgetsConfig(workspace);

      // Spend that would exceed every limit in the file.
      append(workspace, "llm_request", 61, {}, "beta");
      append(workspace, "tool_action", 20, DEPLOY_EXECUTE, "beta");

      const status = evaluateBudgetStatus(workspace, "beta");
      expect(status.ok, "no entry and no default means no limit").toBe(true);
      expect(status.budgetConfigValid).toBe(true);
      expect(status.reasons).toHaveLength(0);
      // Usage was real; it simply was not checked against anything.
      expect(status.usage.minute.llmRequests).toBe(61);
    });
  });
});
