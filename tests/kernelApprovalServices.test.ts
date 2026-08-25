import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, it } from "vitest";
import { Context } from "@amc/cordis";
import { initWorkspace } from "../src/workspace.js";
import { initActionPolicy } from "../src/governor/actionPolicyEngine.js";
import { initToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { openLedger } from "../src/ledger/ledger.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { SessionService } from "../src/session/sessionService.js";
import { readTurnEndMeta } from "../src/session/turnLifecycleMeta.js";
import {
  readApprovalAnswerMeta,
  readApprovalRequestMeta
} from "../src/session/approvalEventMeta.js";
import { decideApprovalForIntent } from "../src/approvals/approvalEngine.js";
import {
  APPROVAL_SEAM,
  approvalServices,
  type ApprovalSeamService
} from "../src/kernel/services/approvalServices.js";
import { runComposedApproval } from "../src/kernel/approvalSeamRunner.js";
import { registerApprovalCliCommands } from "../src/approvals/approvalCliCommands.js";
import { listApprovalRequests } from "../src/approvals/approvalChainStore.js";
import type { ApprovalAsk } from "../src/approvals/seam/approvalSeamTypes.js";
import type { EvidenceEvent } from "../src/types.js";

/**
 * P3.3 stage 3 — the approval seam on the composed tree.
 *
 * Same shape as the P2.1 / P3.0 / P3.1 / P3.2 service tests: the value of
 * composing a capability is that a consumer declaring `inject: ["amcApproval"]`
 * stays PENDING when nothing provides it, rather than dereferencing undefined
 * the first time something needs permission. A tool pipeline that could not find
 * an approval seam must not quietly behave as though everything were approved.
 *
 * The second test is the one that matters most, and it is not about Cordis at
 * all: it drives `runComposedApproval` — the path `amc approvals ask` takes — so
 * the seam has a caller that is not its own unit test. P2.4 shipped a subsystem
 * whose only callers were tests, and the note that followed said it plainly: a
 * guarantee nobody can invoke is not a guarantee.
 */
const settle = (): Promise<unknown> => new Promise((resolve) => setTimeout(resolve, 20));
const PASS = "amc-kernel-approval-test-passphrase";
const roots: string[] = [];
const startCwd = process.cwd();

function newWorkspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const workspace = mkdtempSync(join(tmpdir(), "amc-kernel-approval-"));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  initActionPolicy(workspace);
  initToolsConfig(workspace);
  initBudgets(workspace, "default");
  return workspace;
}

afterEach(() => {
  process.chdir(startCwd);
  process.exitCode = 0;
  while (roots.length > 0) {
    const root = roots.pop();
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  }
});

function eventsOf(workspace: string, sessionId: string): EvidenceEvent[] {
  const ledger = openLedger(workspace);
  try {
    return ledger.getAllEvents().filter((event) => event.session_id === sessionId);
  } finally {
    ledger.close();
  }
}

const ASK: ApprovalAsk = {
  toolCallId: "call-1",
  toolName: "process.spawn",
  actionClass: "WRITE_HIGH",
  riskTier: "high",
  question: "may the agent restart the fleet?",
  intentPayload: { fleet: "production" }
};

/** Both approvals the default WRITE_HIGH rule requires, by two distinct people. */
function reachQuorum(workspace: string, approvalRequestId: string): void {
  for (const who of ["ada", "grace"]) {
    decideApprovalForIntent({
      workspace,
      agentId: "default",
      approvalId: approvalRequestId,
      decision: "APPROVED",
      mode: "EXECUTE",
      reason: `${who} reviewed it`,
      username: who,
      userId: who,
      userRoles: ["APPROVER"]
    });
  }
}

describe("the approval seam on the composed tree", () => {
  it("leaves a consumer PENDING until something provides amcApproval", async () => {
    const workspace = newWorkspace();
    const session = new SessionService(workspace);
    session.open({
      agentId: "default",
      harnessVersion: "3.3.0",
      compositionDigest: "composition-digest",
      policyDigest: "policy-digest"
    });
    const ctx = new Context();
    const seen: string[] = [];

    ctx.plugin({
      name: "needs-approval",
      inject: [APPROVAL_SEAM.name],
      apply: () => {
        seen.push("applied");
      }
    });
    await settle();
    // PENDING, not "applied with an undefined service": a consumer that ran here
    // would be one that could act with nobody able to say no.
    expect(seen).toEqual([]);

    const fiber = ctx.plugin(approvalServices, { session, workspace, agentId: "default" });
    await fiber.await();
    await settle();
    expect(seen).toEqual(["applied"]);

    const service = (ctx as unknown as Record<string, ApprovalSeamService>)[APPROVAL_SEAM.name];
    expect(service?.answererNames, "an unconfigured deployment has no answerers, not a missing seam").toEqual(
      []
    );
    await fiber.dispose();
    session.close({ reason: "completed" });
  });

  it("runs one real approval through the composed runner and seals the pair", async () => {
    const workspace = newWorkspace();
    let raised: string | null = null;

    const outcome = await runComposedApproval({
      workspace,
      agentId: "default",
      ask: ASK,
      // The two approvers act the moment the engine raises the request, so this
      // exercises the create-then-poll path with the REAL clock: the first poll
      // already finds a quorum, exactly as it would if a human had been quick.
      onRaised: (event) => {
        raised = event.approvalRequestId;
        reachQuorum(workspace, event.approvalRequestId);
      }
    });

    expect(outcome.decision.answer).toBe("allow");
    expect(outcome.decision.proceed).toBe(true);
    expect(outcome.decision.approvalRequestId).toBe(raised);

    const rows = eventsOf(workspace, outcome.sessionId);
    const request = rows.find((row) => row.event_type === "approval/request");
    const answer = rows.find((row) => row.event_type === "approval/answer");
    expect(request, "the composed run must record the question").toBeDefined();
    expect(answer, "and the answer").toBeDefined();
    expect(readApprovalRequestMeta(request!.meta_json)?.approvalId).toBe(outcome.decision.approvalId);
    expect(readApprovalAnswerMeta(answer!.meta_json)?.approvalId).toBe(outcome.decision.approvalId);

    // A granted question ends the turn `complete`, and the turn is SEALED — the
    // pair is inside a committed window rather than an open turn a crash would
    // leave behind.
    const turnEnd = rows.find((row) => row.event_type === "turn/end");
    expect(readTurnEndMeta(turnEnd!.meta_json)?.reason).toBe("complete");
    expect(rows.some((row) => row.event_type === "turn/seal")).toBe(true);
    expect(rows.some((row) => row.event_type === "session/close")).toBe(true);

    const verdict = await verifyLedgerIntegrity(workspace);
    expect(verdict.ok, JSON.stringify(verdict.issues ?? verdict)).toBe(true);
  });

  it("ends the turn blocked when nobody grants the question", async () => {
    const workspace = newWorkspace();

    // Nobody answers, and the question is withdrawn immediately — the headless
    // case an unattended runner really hits. It must fail closed AND close the
    // turn honestly, not leave one open.
    const withdrawal = new AbortController();
    withdrawal.abort();
    const outcome = await runComposedApproval({
      workspace,
      agentId: "default",
      ask: { ...ASK, signal: withdrawal.signal }
    });

    expect(outcome.decision.answer).toBe("unavailable");
    expect(outcome.decision.proceed).toBe(false);

    const rows = eventsOf(workspace, outcome.sessionId);
    const turnEnd = rows.find((row) => row.event_type === "turn/end");
    expect(readTurnEndMeta(turnEnd!.meta_json)?.reason).toBe("blocked");
    expect(rows.some((row) => row.event_type === "approval/answer")).toBe(true);
  });

  it("`amc approvals ask` is a real operator path, and hidden from the inventory", async () => {
    const workspace = newWorkspace();
    process.chdir(workspace);

    const program = new Command();
    program.exitOverride();
    registerApprovalCliCommands(program);

    const approvals = program.commands.find((command) => command.name() === "approvals");
    const ask = approvals?.commands.find((command) => command.name() === "ask");
    expect(ask, "the asking side of the group must exist").toBeDefined();
    // Hidden, so `buildCommandInventory` still treats it as internal and the
    // published command-count claim is unaffected by an operator/debug surface.
    expect((ask as unknown as { _hidden?: boolean })._hidden).toBe(true);

    // The engine raises the request synchronously inside the command, so a
    // watcher approving on the next tick is the human answering quickly.
    const approver = setInterval(() => {
      const pending = listApprovalRequests({ workspace, agentId: "default" })[0];
      if (pending === undefined) return;
      clearInterval(approver);
      reachQuorum(workspace, pending.approvalRequestId);
    }, 10);

    try {
      await program.parseAsync(
        [
          "approvals",
          "ask",
          "--agent",
          "default",
          "--tool",
          "process.spawn",
          "--action-class",
          "WRITE_HIGH",
          "--json"
        ],
        { from: "user" }
      );
    } finally {
      clearInterval(approver);
    }

    // Exit code IS the verdict: 0 only for allow, so a shell script that never
    // reads the JSON still cannot mistake a fail-closed answer for permission.
    expect(process.exitCode ?? 0).toBe(0);
    const raised = listApprovalRequests({ workspace, agentId: "default" });
    expect(raised, "the command really went through the engine").toHaveLength(1);
  });

  it("`amc approvals ask` exits non-zero when the answer is not a grant", async () => {
    const workspace = newWorkspace();
    process.chdir(workspace);

    const program = new Command();
    program.exitOverride();
    registerApprovalCliCommands(program);

    // Nobody answers. The TTL is minutes away, so the question is denied
    // outright instead — one approver saying no is a decision, and it arrives
    // as fast as the quorum did above.
    const denier = setInterval(() => {
      const pending = listApprovalRequests({ workspace, agentId: "default" })[0];
      if (pending === undefined) return;
      clearInterval(denier);
      decideApprovalForIntent({
        workspace,
        agentId: "default",
        approvalId: pending.approvalRequestId,
        decision: "DENIED",
        mode: "SIMULATE",
        reason: "too risky",
        username: "ada",
        userId: "ada",
        userRoles: ["APPROVER"]
      });
    }, 10);

    try {
      await program.parseAsync(
        ["approvals", "ask", "--agent", "default", "--tool", "rm", "--action-class", "WRITE_HIGH", "--json"],
        { from: "user" }
      );
    } finally {
      clearInterval(denier);
    }

    expect(process.exitCode).toBe(1);
  });
});
