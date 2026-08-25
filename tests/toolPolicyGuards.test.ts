import { mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { ToolRegistry, defineTool } from "../src/tools/toolRegistry.js";
import { ToolPipeline } from "../src/tools/toolPipeline.js";
import { budgetGuard, runtimeFirewallGuard } from "../src/tools/guards/policyGuards.js";

/**
 * AMC's policy engines deciding real tool calls.
 *
 * These drive signed workspace state and real ledger events rather than stubs,
 * because the thing being tested is precisely that the guard reads the same
 * evidence the reporting commands read. A stubbed engine would pass against a
 * guard wired to nothing.
 */
const PASS = "tool-policy-guards-pass";
const AGENT = "default";
const roots: string[] = [];

async function withWorkspace(fn: (workspace: string) => Promise<void>): Promise<void> {
  const prior = process.env["AMC_VAULT_PASSPHRASE"];
  const priorFlag = process.env["AMC_FIREWALL_ENABLED"];
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  delete process.env["AMC_FIREWALL_ENABLED"];
  const workspace = mkdtempSync(join(tmpdir(), "amc-tool-guards-"));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  initBudgets(workspace, AGENT);
  try {
    // Awaited, not returned. A synchronous finally would delete the workspace
    // before an async body ever touched it — and every guard here would then
    // deny for the wrong reason, which is a green test proving nothing.
    await fn(workspace);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
    if (prior === undefined) delete process.env["AMC_VAULT_PASSPHRASE"];
    else process.env["AMC_VAULT_PASSPHRASE"] = prior;
    if (priorFlag === undefined) delete process.env["AMC_FIREWALL_ENABLED"];
    else process.env["AMC_FIREWALL_ENABLED"] = priorFlag;
  }
}

let sessionSeq = 0;

function spendDeployBudget(workspace: string, count: number): void {
  const sessionId = `spend-${(sessionSeq += 1)}`;
  const ledger = openLedger(workspace);
  try {
    ledger.startSession({ sessionId, runtime: "amc", binaryPath: "b", binarySha256: "0".repeat(64) });
    for (let i = 0; i < count; i += 1) {
      ledger.appendEvidence({
        sessionId,
        runtime: "amc",
        eventType: "tool_action",
        payload: JSON.stringify({ effectiveMode: "EXECUTE", actionClass: "DEPLOY" }),
        inline: true,
        meta: { agentId: AGENT }
      });
    }
    ledger.sealSession(sessionId);
  } finally {
    ledger.close();
  }
}

function pipelineWith(workspace: string, guards: "firewall" | "budget" | "both"): ToolPipeline {
  const registry = new ToolRegistry();
  registry.define(defineTool({
    name: "deploy", actionClass: "DEPLOY", description: "deploys",
    body: () => ({ output: "deployed" })
  }));
  registry.define(defineTool({
    name: "read", actionClass: "READ_ONLY", description: "reads",
    body: () => ({ output: "contents" })
  }));
  if (guards !== "budget") registry.guard("runtime-firewall", runtimeFirewallGuard(workspace));
  if (guards !== "firewall") registry.guard("budgets", budgetGuard(workspace));
  return new ToolPipeline({ registry, workspace });
}

const call = (name: string) => ({
  name, agentId: AGENT, arguments: { target: "production" }, requestedMode: "EXECUTE" as const
});

describe("the runtime firewall as a tool guard", () => {
  it("blocks every call in a workspace with no signed policy", async () => {
    // ADR-0011's deny-by-default reaching the execution path, which is what it
    // was changed for. If this ever reads "allowed", the firewall went inert
    // again in exactly the deployments that configured nothing.
    await withWorkspace(async (workspace) => {
      const outcome = await pipelineWith(workspace, "firewall").execute(call("read"));
      expect(outcome.ok).toBe(false);
      expect(outcome.denied?.guardLabel).toBe("runtime-firewall");
      expect(outcome.denied?.reason).toContain("missing-policy");
    });
  });

  it("lets calls through once a policy is signed", async () => {
    await withWorkspace(async (workspace) => {
      writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
      const outcome = await pipelineWith(workspace, "firewall").execute(call("read"));
      expect(outcome.ok, "a configured firewall must not be a wall").toBe(true);
      expect(outcome.output).toBe("contents");
    });
  });
});

describe("budgets as a tool guard", () => {
  it("permits up to the limit and denies past it, on the class that ran out", async () => {
    await withWorkspace(async (workspace) => {
      writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
      const pipeline = pipelineWith(workspace, "both");

      // Default DEPLOY limit is 3.
      spendDeployBudget(workspace, 3);
      expect((await pipeline.execute(call("deploy"))).ok, "at the limit").toBe(true);

      spendDeployBudget(workspace, 1);
      const denied = await pipeline.execute(call("deploy"));
      expect(denied.ok, "past the limit").toBe(false);
      expect(denied.denied?.guardLabel).toBe("budgets");
      expect(denied.denied?.reason).toContain("DEPLOY");

      // A different class is untouched: the guard freezes what ran out, not
      // everything.
      expect((await pipeline.execute(call("read"))).ok).toBe(true);
    });
  });

  it("never denies a SIMULATE call for budget", async () => {
    // Simulation does not spend, and budgetUsageSnapshot only counts EXECUTE.
    // A guard that denied it would disagree with the meter it reads.
    await withWorkspace(async (workspace) => {
      writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
      spendDeployBudget(workspace, 50);
      const outcome = await pipelineWith(workspace, "both").execute({
        ...call("deploy"), requestedMode: "SIMULATE"
      });
      expect(outcome.ok).toBe(true);
    });
  });

  it("denies EVERY class when the budgets config cannot be verified", async () => {
    // Deliberately wider than evaluateBudgetStatus's own class list. That list
    // names what the consequence model freezes; an unverifiable signature is
    // tampering, and "we cannot tell what the limits are" is not a reason to
    // permit reads either.
    await withWorkspace(async (workspace) => {
      writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
      unlinkSync(join(workspace, ".amc", "budgets.yaml.sig"));
      const pipeline = pipelineWith(workspace, "budget");

      const read = await pipeline.execute(call("read"));
      expect(read.ok, "READ_ONLY is not exempt from an untrustworthy config").toBe(false);
      expect(read.denied?.reason).toContain("not verifiable");
      expect((await pipeline.execute(call("deploy"))).ok).toBe(false);
    });
  });
});

describe("guards compose without either one weakening the other", () => {
  it("denies when either engine denies, and names which", async () => {
    await withWorkspace(async (workspace) => {
      // Firewall unconfigured (denies) AND budget fine.
      const both = pipelineWith(workspace, "both");
      const firewallDenied = await both.execute(call("read"));
      expect(firewallDenied.denied?.guardLabel).toBe("runtime-firewall");

      // Firewall configured (allows) AND budget exhausted.
      writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
      spendDeployBudget(workspace, 10);
      const budgetDenied = await both.execute(call("deploy"));
      expect(budgetDenied.denied?.guardLabel).toBe("budgets");
    });
  });
});
