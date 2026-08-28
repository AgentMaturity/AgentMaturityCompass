import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { SessionService } from "../src/session/sessionService.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { rootIdentity } from "../src/agent/delegationIdentity.js";
import { spawnSubagent } from "../src/agent/subagentSpawn.js";
import { createDriverRunner } from "../src/agent/subagentRunner.js";
import { credentialRef } from "../src/credentials/credentialRef.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import {
  FixedCredentials,
  LOOP_MODEL,
  LOOP_PROVIDER,
  scriptedAdapter,
  silentTransport,
  textStep,
  toolStep
} from "./helpers/agentLoopHarness.js";
import type { LoopEventRecord } from "../src/session/loopEventMeta.js";

/**
 * P6.1a's own Verify criterion: "a parent delegates to a child that reports
 * back", with every delegation carrying a signed handoff packet.
 *
 * Everything before this proved properties ABOUT the governance with the child's
 * executor stubbed out. This runs a real `AgentDriver` behind the seam, so the
 * claims are about a child that actually executed.
 */
const PASS = "subagent-e2e-test-passphrase";
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-subagent-e2e-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "payments-agent", trustBoundaryMode: "isolated" });
  initBudgets(dir, "payments-agent");
  writeRuntimeFirewallPolicy({ workspace: dir, mode: "observe" });
  return dir;
}

function runnerFor(dir: string, scripts: ReturnType<typeof textStep>[]) {
  const registry = new AdapterRegistry();
  registry.register({
    providerId: LOOP_PROVIDER,
    adapter: scriptedAdapter(scripts),
    baseUrl: "https://api.anthropic.invalid",
    credentialRef: credentialRef("AMC_LOOP_TEST_KEY"),
    models: [LOOP_MODEL]
  });
  let clock = 1_000;
  return createDriverRunner({
    workspace: dir,
    makeLlm: (session) =>
      new LlmRuntime({
        session,
        credentials: new FixedCredentials(),
        registry,
        transport: silentTransport,
        now: () => { clock += 5; return clock; }
      }),
    route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } },
    systemPrompt: "You are a careful delegate.",
    harnessVersion: "3.2.0",
    compositionDigest: "composition-digest",
    policyDigest: "policy-digest"
  });
}

function sessionRows(dir: string, sessionId: string): Array<{ event_type: string; meta_json: string }> {
  const db = new Database(join(dir, ".amc", "evidence.sqlite"), { readonly: true });
  try {
    return db
      .prepare("SELECT event_type, meta_json FROM evidence_events WHERE session_id = ? ORDER BY id")
      .all(sessionId) as Array<{ event_type: string; meta_json: string }>;
  } finally {
    db.close();
  }
}

describe("a parent delegates to a child that really runs", () => {
  it("returns the child's own words, folded from the child's signed rows", async () => {
    const dir = workspace();
    const parentSession = new SessionService(dir);
    parentSession.open({
      agentId: "payments-agent",
      harnessVersion: "3.2.0",
      compositionDigest: "c",
      policyDigest: "p"
    });
    const rows: LoopEventRecord[] = [];

    const outcome = await spawnSubagent({
      workspace: dir,
      parent: rootIdentity("payments-agent"),
      request: { runAs: "researcher", goal: "summarise the ledger" },
      session: {
        recordLoopEvent: (record) => { rows.push(record); return parentSession.recordLoopEvent(record); }, recordProjectedEvidence: () => null },
      runner: runnerFor(dir, [textStep("I read 40 rows and found two anomalies.")]),
      mintSessionId: () => "child-session-e2e"
    });

    expect(outcome.ok, outcome.ok ? "" : outcome.reason).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.childText).toContain("two anomalies");
    expect(outcome.childSessionId).toBe("child-session-e2e");
    parentSession.close({ reason: "completed" });
  });

  it("writes the child's rows into the CHILD's session, not the parent's", async () => {
    // The bug the end-to-end test found: `LlmRuntime` captures its session at
    // construction, so a child sharing the parent's runtime would write its
    // request rows into the parent's hash chain.
    const dir = workspace();
    const parentSession = new SessionService(dir);
    parentSession.open({
      agentId: "payments-agent", harnessVersion: "3.2.0", compositionDigest: "c", policyDigest: "p"
    });

    await spawnSubagent({
      workspace: dir,
      parent: rootIdentity("payments-agent"),
      request: { runAs: "researcher", goal: "g" },
      session: { recordLoopEvent: (r) => parentSession.recordLoopEvent(r), recordProjectedEvidence: () => null },
      runner: runnerFor(dir, [textStep("done")]),
      mintSessionId: () => "child-session-e2e"
    });
    const parentId = parentSession.sessionId;
    parentSession.close({ reason: "completed" });

    const childRows = sessionRows(dir, "child-session-e2e");
    const parentRows = sessionRows(dir, parentId);

    expect(childRows.some((r) => r.event_type === "request/header"), "the child's request rows are its own")
      .toBe(true);
    expect(parentRows.some((r) => r.event_type === "request/header"), "and not the parent's")
      .toBe(false);
  });

  it("meters the child's evidence against the ROOT, closing the budget escape", async () => {
    // The escape, end to end. `budgetUsageSnapshot` counts spend by filtering
    // `meta.agentId`, so what matters is the id on the rows the child actually
    // wrote — not merely the id handed to its toolset.
    const dir = workspace();
    const parentSession = new SessionService(dir);
    parentSession.open({
      agentId: "payments-agent", harnessVersion: "3.2.0", compositionDigest: "c", policyDigest: "p"
    });

    await spawnSubagent({
      workspace: dir,
      parent: rootIdentity("payments-agent"),
      request: { runAs: "researcher", goal: "g" },
      session: { recordLoopEvent: (r) => parentSession.recordLoopEvent(r), recordProjectedEvidence: () => null },
      runner: runnerFor(dir, [textStep("done")]),
      mintSessionId: () => "child-session-e2e"
    });
    parentSession.close({ reason: "completed" });

    // The `sessions` table has no `agent_id` column. `SessionService.open` says
    // why: "a natively-run agent has no separate binary, so binary_path records
    // the agent id and binary_sha256 the composition it ran under."
    const db = new Database(join(dir, ".amc", "evidence.sqlite"), { readonly: true });
    const owners = (db
      .prepare("SELECT binary_path FROM sessions WHERE session_id = ?")
      .all("child-session-e2e") as Array<{ binary_path: string }>).map((r) => r.binary_path);
    db.close();

    expect(owners, "the child's session is owned by the root, not by 'researcher'")
      .toEqual(["payments-agent"]);
  });
});

describe("the delegation is announced and accounted for, against a real run", () => {
  it("emits a started/completed pair joined by the signed packet", async () => {
    const dir = workspace();
    const parentSession = new SessionService(dir);
    parentSession.open({
      agentId: "payments-agent", harnessVersion: "3.2.0", compositionDigest: "c", policyDigest: "p"
    });
    const parentId = parentSession.sessionId;

    const outcome = await spawnSubagent({
      workspace: dir,
      parent: rootIdentity("payments-agent"),
      request: { runAs: "researcher", goal: "g" },
      session: { recordLoopEvent: (r) => parentSession.recordLoopEvent(r), recordProjectedEvidence: () => null },
      runner: runnerFor(dir, [textStep("done")]),
      mintSessionId: () => "child-session-e2e"
    });
    parentSession.close({ reason: "completed" });

    expect(outcome.ok).toBe(true);
    const parentRows = sessionRows(dir, parentId);
    const started = parentRows.find((r) => r.event_type === "agent_delegation_started");
    const completed = parentRows.find((r) => r.event_type === "agent_delegation_completed");

    expect(started, "the delegation was announced in the parent's own log").toBeDefined();
    expect(completed, "and accounted for").toBeDefined();

    const startedMeta = JSON.parse(started!.meta_json) as Record<string, unknown>;
    const completedMeta = JSON.parse(completed!.meta_json) as Record<string, unknown>;
    expect(startedMeta["governedAs"]).toBe("payments-agent");
    expect(startedMeta["childSessionId"], "names the session the child really wrote")
      .toBe("child-session-e2e");
    expect(completedMeta["packetId"], "joined to its announcement").toBe(startedMeta["packetId"]);
    expect(completedMeta["settledAs"]).toBe("reported");
  });
});

describe("a child is a leaf", () => {
  it("is not offered `delegate`, so a chain cannot reach depth 2", async () => {
    // The kernel builds its runner with `createDriverRunner({workspace, makeLlm,
    // route, systemPrompt, harnessVersion, compositionDigest, policyDigest})`
    // (src/kernel/agentLoopRunner.ts:394) and passes NO `grantDelegation`. The
    // option exists and `subagentRunner.ts` honours it, but no production caller
    // sets it — so every child is a leaf and the effective delegation ceiling is
    // 1, whatever `--max-delegation-depth` says.
    //
    // This test is the coupling. `runnerFor` below mirrors the kernel's call
    // exactly; the day someone wires onward delegation, this fails and the
    // operator-facing ceiling in src/cli-agent-commands.ts must be revisited
    // with it.
    const dir = workspace();
    const parentSession = new SessionService(dir);
    parentSession.open({
      agentId: "payments-agent", harnessVersion: "3.2.0", compositionDigest: "c", policyDigest: "p"
    });

    const outcome = await spawnSubagent({
      workspace: dir,
      parent: rootIdentity("payments-agent"),
      request: { runAs: "researcher", goal: "delegate this onward" },
      session: { recordLoopEvent: (r) => parentSession.recordLoopEvent(r), recordProjectedEvidence: () => null },
      runner: runnerFor(dir, [
        toolStep("call-1", "delegate", JSON.stringify({ runAs: "grandchild", goal: "g" })),
        textStep("I could not delegate.")
      ]),
      mintSessionId: () => "child-leaf"
    });
    parentSession.close({ reason: "completed" });

    expect(outcome.ok, outcome.ok ? "" : outcome.reason).toBe(true);

    // The child's own log is the evidence: it asked for `delegate` and the seam
    // had no such tool to give it.
    const childRows = sessionRows(dir, "child-leaf");
    const toolRows = childRows.filter((r) => r.event_type.startsWith("tool/"));
    expect(toolRows.length, "the child really did try a tool call").toBeGreaterThan(0);
    const call = toolRows.find((r) => r.event_type === "tool/call");
    const result = toolRows.find((r) => r.event_type === "tool/result");
    expect(JSON.parse(call?.meta_json ?? "{}")["toolName"], "the child asked to delegate")
      .toBe("delegate");
    expect(JSON.parse(result?.meta_json ?? "{}")["denied"], "and was refused it")
      .toBe(true);

    // And no second-level delegation was ever announced anywhere.
    const grandchild = sessionRows(dir, "child-leaf")
      .filter((r) => r.event_type === "agent_delegation_started");
    expect(grandchild, "a child cannot start a delegation of its own").toEqual([]);
  });
});

describe("a child's tool evidence belongs to the child's session", () => {
  it("leaves a ledger that VERIFIES after the child has called a tool", async () => {
    // `agentToolset` used to default its evidence rows to `toolset-<agentId>`,
    // and this runner passed no session — so a child that used a tool wrote rows
    // naming a session nothing ever started, and `amc verify` failed with
    // "references missing session" for a run whose only crime was using tools.
    // The agent id here is the ROOT's by design, so it could never have been the
    // right key for a CHILD's evidence either.
    const dir = workspace();
    const parentSession = new SessionService(dir);
    parentSession.open({
      agentId: "payments-agent", harnessVersion: "3.2.0", compositionDigest: "c", policyDigest: "p"
    });

    const outcome = await spawnSubagent({
      workspace: dir,
      parent: rootIdentity("payments-agent"),
      request: { runAs: "researcher", goal: "read the ledger note" },
      session: { recordLoopEvent: (r) => parentSession.recordLoopEvent(r), recordProjectedEvidence: () => null },
      runner: runnerFor(dir, [
        toolStep("call-1", "fs.read", JSON.stringify({ path: "workspace/note.txt" })),
        textStep("I looked.")
      ]),
      mintSessionId: () => "child-tool-evidence"
    });
    parentSession.close({ reason: "completed" });
    expect(outcome.ok, outcome.ok ? "" : outcome.reason).toBe(true);

    // Non-vacuity: a governed call really was recorded, and in the CHILD's
    // session. Allowed or denied does not matter — both are evidence.
    const audits = sessionRows(dir, "child-tool-evidence").filter((row) =>
      String((JSON.parse(row.meta_json) as { auditType?: string }).auditType ?? "").startsWith("TOOL_CALL_")
    );
    expect(audits.length, "the child's governed call left evidence of its own").toBeGreaterThan(0);

    // ZERO errors, not merely no "missing session" ones.
    //
    // This was deliberately narrowed while a second defect was open: the
    // projection was appended to the child's session AFTER the runner had
    // sealed it, so a delegation also left "Session <child> final hash
    // mismatch". Both are fixed — the projection now goes through the PARENT's
    // writer — so the honest assertion is the whole list. Anything narrower
    // would leave the next regression here invisible.
    const verified = await verifyLedgerIntegrity(dir);
    expect(verified.chain.errors, verified.chain.errors.join("; ")).toEqual([]);
  });
});
