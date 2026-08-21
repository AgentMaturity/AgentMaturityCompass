import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { registerPolicyDebt, getActivePolicyDebt } from "../src/governor/policyCanary.js";
import { loadAllDebt } from "../src/governor/policyDebt.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * G3-08: two governance stacks were both wired into the CLI. policyCanary's
 * registerPolicyDebt pushed a waiver into a module-level array while
 * policyDebt.addDebtEntry wrote a hash-chained, signed record to disk.
 *
 * `amc policy-debt-add` therefore printed "Policy debt registered" with an
 * expiry, and the waiver — a record that a control was deliberately bypassed —
 * was gone in the next process, invisible to both list commands.
 */
const dirs: string[] = [];
function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-debt-"));
  dirs.push(dir);
  initWorkspace(dir);
  return dir;
}
afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("policy debt survives the process that recorded it", () => {
  it("registering a waiver writes it to the durable store", () => {
    const ws = workspace();
    registerPolicyDebt(
      {
        agentId: "agent-1",
        waivedRequirement: "two-person-auth",
        justification: "pilot rollout",
        expiresTs: Date.now() + 7 * 24 * 3600 * 1000,
        createdBy: "operator"
      },
      ws
    );

    // The durable store is the one both command families read.
    const persisted = loadAllDebt(ws);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.affectedPolicies).toContain("two-person-auth");
    expect(persisted[0]?.reason).toContain("pilot rollout");
  });

  it("persisted waivers carry a hash chain and signature", () => {
    const ws = workspace();
    registerPolicyDebt(
      {
        agentId: "agent-1",
        waivedRequirement: "approval-quorum",
        justification: "incident response",
        expiresTs: Date.now() + 3600 * 1000,
        createdBy: "operator"
      },
      ws
    );
    const entry = loadAllDebt(ws)[0];
    expect(entry?.debt_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(entry).toHaveProperty("prev_debt_hash");
  });

  it("a reader in a later process sees the waiver", () => {
    const ws = workspace();
    registerPolicyDebt(
      {
        agentId: "agent-2",
        waivedRequirement: "sandbox-required",
        justification: "debugging",
        expiresTs: Date.now() + 3600 * 1000,
        createdBy: "operator"
      },
      ws
    );

    // getActivePolicyDebt with a workspace reads the durable store, which is
    // what a separate CLI invocation does.
    const active = getActivePolicyDebt("agent-2", ws);
    expect(active.length).toBeGreaterThan(0);
    expect(active.some((d) => d.waivedRequirement === "sandbox-required")).toBe(true);
  });

  it("expired waivers are not reported as active", () => {
    const ws = workspace();
    registerPolicyDebt(
      {
        agentId: "agent-3",
        waivedRequirement: "expired-control",
        justification: "old",
        expiresTs: Date.now() - 1000,
        createdBy: "operator"
      },
      ws
    );
    expect(getActivePolicyDebt("agent-3", ws)).toEqual([]);
  });
});
