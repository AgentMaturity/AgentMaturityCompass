import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { openActionJournal, type ActionJournal } from "../../../src/actions/actionJournal.js";
import { agentToolset } from "../../../src/agent/agentToolset.js";
import { decideApprovalForIntent } from "../../../src/approvals/approvalEngine.js";
import { initApprovalPolicy } from "../../../src/approvals/approvalPolicyEngine.js";
import { initBudgets } from "../../../src/budgets/budgets.js";
import { activateControlPlan, loadActiveCompiledPolicy } from "../../../src/catalog/compiler/activate.js";
import { compilePlan, parseDeploymentProfile } from "../../../src/catalog/compiler/compile.js";
import { signPlan } from "../../../src/catalog/compiler/sign.js";
import { writeRuntimeFirewallPolicy } from "../../../src/runtime/firewall.js";
import { issueLeaseForCli } from "../../../src/leases/leaseCli.js";
import { leaseRevocationPaths, revokeLease } from "../../../src/leases/leaseStore.js";
import { toolEvidenceFor } from "../../../src/tools/toolEvidence.js";
import { ToolPipeline, type ToolApprovalAsker } from "../../../src/tools/toolPipeline.js";
import { defineTool, ToolRegistry } from "../../../src/tools/toolRegistry.js";
import type { ActionClass } from "../../../src/types.js";
import { catalog, fixturesFor, type L0Fixture } from "./harness.js";
import { newWorkspace } from "./workspaces.js";

/**
 * L0-IDN-02 and L0-IDN-04 against the real tool pipeline (P1-14). The call carries a signed lease through the
 * authorization context, as a lease-bound composition passes it; the pipeline's authorization stage verifies it
 * (signature, expiry, signed revocation list, agent, execute scope) at bind and again at the recheck before the body.
 * The oracle is the denial, the action_state receipt chain and whether the body ran.
 */
type LeaseSetup = { actionClass: ActionClass; lease: { state: string; agentId: string; scopes: string[] } };
type DrillSetup = { actionClass: ActionClass; mode: string; boundMs: number };

const leaseIdOf = (token: string): string =>
  (JSON.parse(Buffer.from(token.split(".")[0]!, "base64url").toString("utf8")) as { leaseId: string }).leaseId;

function issue(ws: string, agentId: string, scopes: string[], ttl = "1h"): string {
  return issueLeaseForCli({ workspace: ws, agentId, ttl, scopes: scopes.join(","), routes: "/", models: "*", rpm: 1000, tpm: 1_000_000 }).token;
}

function compose(ws: string, actionClass: ActionClass, leaseToken: () => string, approve?: ToolApprovalAsker) {
  const runs = { body: 0 };
  const registry = new ToolRegistry();
  registry.define(defineTool({ name: "fixture.write", actionClass, description: "fixture tool",
    body: () => { runs.body += 1; return { output: "ran", effect: "applied" }; } }));
  let journal: ActionJournal | undefined;
  const records: ReturnType<typeof toolEvidenceFor> = [];
  const pipeline = new ToolPipeline({ registry, workspace: ws, journal: () => (journal ??= openActionJournal(ws)),
    authorizationContext: () => ({ leaseToken: leaseToken() }),
    ...(approve ? { approve, approvalRequiredFor: new Set([actionClass]) } : {}),
    record: (execution, outcome) => records.push(...toolEvidenceFor(execution, outcome)) });
  const call = async () => {
    const before = runs.body;
    const outcome = await pipeline.execute({ name: "fixture.write", agentId: "default", arguments: {}, requestedMode: "EXECUTE" });
    const id = outcome.action?.executionId;
    expect(id, "a journaled call has an execution id").toBeTruthy();
    const chain = journal!.verifyReceiptChain(id!);
    expect(chain.ok, `the receipt chain verifies (${chain.errors.join("; ")})`).toBe(true);
    return { outcome, ran: runs.body > before, state: journal!.get(id!)?.state, reasonCode: chain.receipts.at(-1)?.reasonCode };
  };
  return { call, close: () => journal?.close(), records };
}

function expectRefused(f: L0Fixture, r: Awaited<ReturnType<ReturnType<typeof compose>["call"]>>): void {
  expect(r.outcome.ok).toBe(false);
  expect(r.outcome.denied?.stage).toBe("authorization");
  expect(r.ran, "a refused call never runs its body").toBe(false);
  expect(r.state).toBe("denied");
  expect(r.reasonCode).toBe(f.envelope.expected.reasonCode);
}

describe("L0-IDN-02 short-lived scoped credentials (lease check at the authorization stage)", () => {
  const fixtures = fixturesFor("lease", "L0-IDN-02");
  it("has fixtures", () => expect(fixtures.length).toBeGreaterThan(1));
  for (const f of fixtures) {
    it(`${f.ref}: ${f.envelope.expected.result} ${f.envelope.expected.reasonCode ?? ""}`, async () => {
      const s = f.envelope.setup as unknown as LeaseSetup;
      const ws = newWorkspace();
      const signer = s.lease.state === "signed_by_other_workspace" ? newWorkspace("amc-l0-other-") : ws;
      const token = issue(signer, s.lease.agentId, s.lease.scopes, s.lease.state === "expired" ? "60s" : "1h");
      if (s.lease.state === "revoked") revokeLease(ws, leaseIdOf(token), "layer0 fixture");
      if (s.lease.state === "expired") {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(Date.now() + 2 * 3_600_000);
      }
      const h = compose(ws, s.actionClass, () => token);
      const r = await h.call();
      h.close();
      if (f.envelope.expected.result === "allow") {
        expect(r.outcome.ok, JSON.stringify(r.outcome.denied)).toBe(true);
        expect(r.ran).toBe(true);
        expect(r.state).toBe("completed");
        expect(h.records.find((row) => row.meta?.auditType === "AUTHORIZATION_RECORD"), "the bound record is written").toBeTruthy();
      } else expectRefused(f, r);
    });
  }
});

describe("L0-IDN-04 revocation takes effect (drill)", () => {
  const fixtures = fixturesFor("lease_revocation_drill", "L0-IDN-04");
  it("has fixtures", () => expect(fixtures.length).toBeGreaterThan(1));
  for (const f of fixtures) {
    it(`${f.ref}: ${f.envelope.expected.result} ${f.envelope.expected.reasonCode ?? ""}`, async () => {
      const s = f.envelope.setup as unknown as DrillSetup;
      const ws = newWorkspace();
      const token = issue(ws, "default", ["toolhub:execute"]);
      if (s.mode === "revoke_between_calls") {
        const h = compose(ws, s.actionClass, () => token);
        const before = await h.call();
        expect(before.outcome.ok, "the lease works before the revocation").toBe(true);
        const revokedAt = performance.now();
        revokeLease(ws, leaseIdOf(token), "layer0 drill");
        const after = await h.call();
        const timeToEffectMs = performance.now() - revokedAt;
        h.close();
        expect(after.outcome.ok).toBe(false);
        expect(after.ran).toBe(false);
        expect(after.reasonCode).toBe("authorization_denied:lease_revoked");
        expect(timeToEffectMs, "the drill's measured time to effect is within the bound").toBeLessThan(s.boundMs);
        console.info(`L0-IDN-04 drill: revocation refused the next call ${timeToEffectMs.toFixed(1)} ms after it was written`);
        return;
      }
      let approve: ToolApprovalAsker | undefined;
      if (s.mode === "revoke_during_approval") {
        approve = async () => { revokeLease(ws, leaseIdOf(token), "layer0 drill, in flight"); return "allow"; };
      } else if (s.mode === "revocation_list_tampered") {
        revokeLease(ws, "lease-unrelated", "seed the signed list");
        const { file } = leaseRevocationPaths(ws);
        writeFileSync(file, readFileSync(file, "utf8").replace("lease-unrelated", "lease-renamed"));
      } else throw new Error(`unknown drill mode ${s.mode}`);
      const h = compose(ws, s.actionClass, () => token, approve);
      const r = await h.call();
      h.close();
      expectRefused(f, r);
    });
  }
});

/**
 * L0-IDN-01 under a real active compiled plan (P1-10, P1-12, P1-67): the fixture profile compiles against the shipped
 * catalog to a ready plan, which is signed, approved by two distinct owners and activated; the native toolset pins it
 * and its compiled-policy guard enforces identity-binding. The lease is the agent identity. A lease also counts as the
 * principal (a service principal), so a lease-bound call with no human principal is allowed: that part of the
 * statement is not enforced yet (proposed follow-up P1-78), and no fixture claims it is.
 */
type IdentitySetup = { profile: unknown; tool: string; args: Record<string, unknown>; lease: "valid" | "none" | "expired" | "signed_by_other_workspace" };

function activate(ws: string, profile: unknown): void {
  const plan = compilePlan({ profile: parseDeploymentProfile(profile), catalog, asOf: new Date().toISOString() });
  expect(plan.status, `the fixture profile compiles to a ready plan (${plan.requirements.filter((r) => r.applicability === "unresolved").map((r) => r.controlId).join(", ")})`).toBe("ready");
  expect(plan.requirements.find((r) => r.controlId === "L0-IDN-01")?.applicability).toBe("applicable");
  const { signed } = signPlan({ workspace: ws, plan, previous: null, reviewAgentId: "default" });
  const approvalId = signed.review.approvalRequestId!;
  for (const userId of ["owner-1", "owner-2"]) {
    decideApprovalForIntent({ workspace: ws, agentId: "default", approvalId, decision: "APPROVED", mode: "EXECUTE", reason: "layer0 fixture plan review",
      userId, username: userId, userRoles: ["OWNER"] });
  }
  activateControlPlan({ workspace: ws, signed, approvalRequestId: approvalId, reviewAgentId: "default" });
}

describe("L0-IDN-01 unique agent identity under an active compiled plan (compiled-policy identity-binding)", () => {
  const fixtures = fixturesFor("compiled_identity", "L0-IDN-01");
  it("has fixtures", () => expect(fixtures.length).toBeGreaterThan(1));
  for (const f of fixtures) {
    it(`${f.ref}: ${f.envelope.expected.result} ${f.envelope.expected.reasonCode ?? ""}`, async () => {
      const s = f.envelope.setup as unknown as IdentitySetup;
      const ws = newWorkspace();
      initApprovalPolicy(ws);
      initBudgets(ws, "default");
      writeRuntimeFirewallPolicy({ workspace: ws, mode: "observe" });
      mkdirSync(join(ws, "workspace", "output"), { recursive: true });
      writeFileSync(join(ws, "workspace", "n.txt"), "fixture");
      activate(ws, s.profile);
      expect(loadActiveCompiledPolicy(ws)?.controls.some((c) => c.controlId === "L0-IDN-01")).toBe(true);
      const signer = s.lease === "signed_by_other_workspace" ? newWorkspace("amc-l0-other-") : ws;
      const token = s.lease === "none" ? undefined : issue(signer, "default", ["toolhub:execute"], s.lease === "expired" ? "60s" : "1h");
      if (s.lease === "expired") {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(Date.now() + 2 * 3_600_000);
      }
      // No session writer: under an active plan SessionService.open also requires a pinned residency profile (P2-01),
      // which is L0-DAT-04's concern, not this control's. The toolset records through its own ledger handle.
      const sessionId = `layer0-identity-${f.envelope.evidenceClass}`;
      const toolset = agentToolset({ workspace: ws, agentId: "default", sessionId, ...(token ? { leaseToken: token } : {}) });
      let result: Awaited<ReturnType<typeof toolset.seam.execute>>;
      try {
        result = await toolset.seam.execute({ callId: "layer0-identity-call", toolName: s.tool, rawArguments: JSON.stringify(s.args), sessionId,
          turn: 1, step: 1, parentToken: null, dispatch: "native", signal: new AbortController().signal });
      } finally {
        toolset.close();
      }
      const text = JSON.stringify(result);
      if (f.envelope.expected.result === "allow") {
        expect(text).toContain('"outcome":"OK"');
        expect(text).not.toMatch(/IDENTITY_UNRESOLVED|PRINCIPAL_UNRESOLVED/);
        return;
      }
      expect(text).not.toContain('"outcome":"OK"');
      expect(text, "the compiled-policy guard names the control and the reason").toContain(`control L0-IDN-01@0.1.0): ${f.envelope.expected.reasonCode}`);
    });
  }
});
