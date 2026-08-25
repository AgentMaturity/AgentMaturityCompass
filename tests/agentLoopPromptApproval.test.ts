import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initActionPolicy } from "../src/governor/actionPolicyEngine.js";
import { initToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { openLedger } from "../src/ledger/ledger.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import {
  readApprovalAnswerMeta,
  readApprovalRequestMeta
} from "../src/session/approvalEventMeta.js";
import { readTurnEndMeta } from "../src/session/turnLifecycleMeta.js";
import { decideApprovalForIntent } from "../src/approvals/approvalEngine.js";
import { listApprovalRequests } from "../src/approvals/approvalChainStore.js";
import {
  createApprovalExceptionAnswerer,
  MAX_EXCEPTION_WINDOW_MS,
  parseApprovalExceptionNote,
  type ApprovalExceptionNote
} from "../src/approvals/seam/devProfileException.js";
import { runComposedTurn } from "../src/kernel/agentLoopRunner.js";
import type { ComposedTurnOptions } from "../src/kernel/agentLoopRunner.js";
import {
  STUB_PROVIDER_ID,
  STUB_PROVIDER_MODEL,
  stubProviderRoute,
  stubProviderTransport
} from "../src/agent/stubProvider.js";
import { echoToolSeam } from "../src/agent/echoTool.js";
import { verifyAgentRun } from "../src/agent/runReport.js";
import { registerAgentCommands, type AgentLoopCliIo } from "../src/cli-agent-commands.js";
import { PromptAssemblyError } from "../src/prompt/assembly/promptErrors.js";
import type { EvidenceEvent } from "../src/types.js";
import { Command } from "commander";

/** Capture the command surface's three edges without touching the console. */
interface Captured {
  readonly out: string[];
  readonly errors: string[];
  readonly failures: number[];
}

function programWith(): { program: Command; captured: Captured } {
  const out: string[] = [];
  const errors: string[] = [];
  const failures: number[] = [];
  const io: AgentLoopCliIo = {
    log: (line) => out.push(line),
    error: (line) => errors.push(line),
    fail: () => failures.push(1)
  };
  const program = new Command();
  program.exitOverride();
  registerAgentCommands(program, io);
  return { program, captured: { out, errors, failures } };
}

const run = (program: Command, argv: string[]): Promise<unknown> =>
  program.parseAsync(argv, { from: "user" });

/**
 * P3.3 — the exit criterion, end to end: identity, context, human-in-the-loop.
 *
 * One composed turn, on the keyless stub route, with a real approval in front of
 * the tool call. Everything asserted below is read back out of the SIGNED LOG
 * rather than from what the runner returned — four false greens in this project
 * came from reporting over evidence nobody checked, and a summary that agrees
 * with itself proves nothing.
 *
 * The three VERIFY clauses of the plan's P3.3, as an operator meets them:
 *
 *   VERIFY-1  prompt sections assemble in order → asserted on the `system/prompt`
 *             row's own bytes, in the order they appear in it.
 *   VERIFY-2  an unknown {{var}} fails loud     → the run REJECTS before a turn
 *             starts; no request, no model call, no half-built prompt.
 *   VERIFY-3  a blocking, quorum-capable approval with its audit pair, and rogue
 *             answerers normalized to `unavailable` (fail closed).
 *
 * The ADR-5 block at the end is the rollback clause: a dev profile may flip the
 * default to allow, but only as an explicit, expiring, tracked exception whose
 * every grant is named in the signed log.
 */
const PASS = "amc-p33-loop-test-passphrase";
const IDENTITY_MARK = "Agent Maturity Compass";
const APPROVAL_MARK = "require signed human approval";

describe("a governed agent turn: identity, context, and a human in the loop", () => {
  let workspace: string;
  let home: string;
  let credentialsHome: string;
  let priorPassphrase: string | undefined;
  let priorHome: string | undefined;
  let startCwd: string;

  beforeEach(() => {
    startCwd = process.cwd();
    priorPassphrase = process.env["AMC_VAULT_PASSPHRASE"];
    process.env["AMC_VAULT_PASSPHRASE"] = PASS;
    workspace = mkdtempSync(join(tmpdir(), "amc-p33-run-"));
    // The user instruction scope. Pinned to an empty directory so these
    // assertions are about THIS workspace and never about whatever the
    // developer running the suite happens to have in $AMC_HOME.
    home = mkdtempSync(join(tmpdir(), "amc-p33-home-"));
    // The CLI path resolves the user scope from $AMC_HOME rather than from an
    // option, so it is pinned here too — otherwise the CLI assertions would
    // depend on the developer's own instruction files.
    priorHome = process.env["AMC_HOME"];
    process.env["AMC_HOME"] = home;
    credentialsHome = mkdtempSync(join(tmpdir(), "amc-p33-creds-"));
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
    initActionPolicy(workspace);
    initToolsConfig(workspace);
    initBudgets(workspace, "default");
    writeFileSync(
      join(workspace, "AGENTS.md"),
      "# House rules\n\nNever force-push to main. Ask before touching production.\n"
    );
  });

  afterEach(() => {
    process.chdir(startCwd);
    process.exitCode = 0;
    if (priorPassphrase === undefined) delete process.env["AMC_VAULT_PASSPHRASE"];
    else process.env["AMC_VAULT_PASSPHRASE"] = priorPassphrase;
    if (priorHome === undefined) delete process.env["AMC_HOME"];
    else process.env["AMC_HOME"] = priorHome;
    for (const root of [workspace, home, credentialsHome]) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function events(sessionId: string): EvidenceEvent[] {
    const ledger = openLedger(workspace);
    try {
      return ledger.getAllEvents().filter((event) => event.session_id === sessionId);
    } finally {
      ledger.close();
    }
  }

  /** The payload of one row, as the signed bytes hold it. */
  function payloadText(event: EvidenceEvent): string {
    const payload = readEventPayload(workspace, event);
    if (payload.status !== "ok") throw new Error(`payload ${payload.status} for ${event.id}`);
    return payload.bytes.toString("utf8");
  }

  const rowsOf = (rows: readonly EvidenceEvent[], type: string): EvidenceEvent[] =>
    rows.filter((row) => row.event_type === type);

  /** Both approvals the default WRITE_HIGH rule requires, by two distinct people. */
  function reachQuorum(approvalRequestId: string, decision: "APPROVED" | "DENIED"): void {
    for (const who of ["ada", "grace"]) {
      decideApprovalForIntent({
        workspace,
        agentId: "default",
        approvalId: approvalRequestId,
        decision,
        mode: "EXECUTE",
        reason: `${who} reviewed it`,
        username: who,
        userId: who,
        userRoles: ["APPROVER"]
      });
      if (decision === "DENIED") return;
    }
  }

  /** The base composition every test here varies. Keyless: the stub needs no credential. */
  function turnOptions(extra: Partial<ComposedTurnOptions> = {}): ComposedTurnOptions {
    return {
      workspace,
      agentId: "default",
      promptProfile: { persona: "You review infrastructure changes.", amcHome: home },
      prompt: "tidy the changelog",
      route: {
        providerId: STUB_PROVIDER_ID,
        model: STUB_PROVIDER_MODEL,
        params: { max_tokens: 256, stream: true }
      },
      routes: [stubProviderRoute()],
      transport: stubProviderTransport(),
      tools: echoToolSeam(),
      credentials: { homeDir: credentialsHome, env: {}, watch: false, projectDir: null },
      ...extra
    };
  }

  it("VERIFY-1/3: assembles identity in order, carries the workspace's rules, and blocks on a real approval", async () => {
    let raised: string | null = null;

    const outcome = await runComposedTurn(
      turnOptions({
        approvalGate: {
          actionClass: "WRITE_HIGH",
          riskTier: "high",
          // Two distinct approvers act the moment the engine raises the request,
          // so this exercises the real create-then-poll path against the real
          // quorum evaluator — the first poll finds what a quick human leaves.
          onRaised: (event) => {
            raised = event.approvalRequestId;
            reachQuorum(event.approvalRequestId, "APPROVED");
          }
        }
      })
    );
    expect(outcome.status).toBe("idle");
    const rows = events(outcome.sessionId);

    // ── identity, from the signed row rather than from the return value ──
    const systemPrompt = rowsOf(rows, "system/prompt")[0];
    expect(systemPrompt?.id).toBe(outcome.systemPromptEventId);
    const prompt = payloadText(systemPrompt!);
    expect(prompt, "the identity section must be in the rendered bytes").toContain(IDENTITY_MARK);
    expect(prompt.indexOf(IDENTITY_MARK)).toBeLessThan(prompt.indexOf(APPROVAL_MARK));
    expect(prompt.indexOf(APPROVAL_MARK)).toBeLessThan(
      prompt.indexOf("You review infrastructure changes.")
    );

    // ── context: AMC finally reads the guardrails it writes ──
    const userMessages = rowsOf(rows, "user/message").map(payloadText);
    expect(userMessages[0]).toBe("tidy the changelog");
    const snapshot = userMessages.slice(1).join("\n");
    expect(snapshot).toContain("Never force-push to main.");
    expect(snapshot).toContain("AGENTS.md");
    // Model-visible ⟺ logged: the snapshot exists only as a committed
    // `user/message` row, so there is no unsigned path it could have taken.

    // ── the audit pair, and the block it recorded ──
    const request = rowsOf(rows, "approval/request")[0];
    const answer = rowsOf(rows, "approval/answer")[0];
    const requestMeta = readApprovalRequestMeta(request!.meta_json);
    const answerMeta = readApprovalAnswerMeta(answer!.meta_json);
    expect(requestMeta?.toolName).toBe("echo");
    expect(requestMeta?.actionClass).toBe("WRITE_HIGH");
    expect(answerMeta?.approvalId).toBe(requestMeta?.approvalId);
    expect(answerMeta?.answer).toBe("allow");
    expect(answerMeta?.answeredBy).toBe("approvals-engine");
    // The engine chain the verdict came from, so an auditor holding only the
    // session log can walk to the two signed decisions that produced it.
    expect(answerMeta?.approvalRequestId).toBe(raised);

    // ── and the ordering that makes it a GATE rather than a note ──
    const order = (type: string): number => rows.findIndex((row) => row.event_type === type);
    expect(order("approval/request")).toBeLessThan(order("approval/answer"));
    expect(order("approval/answer")).toBeLessThan(order("tool/result"));

    const toolResult = rowsOf(rows, "tool/result")[0];
    expect(JSON.parse(toolResult!.meta_json).outcome).toBe("OK");
    // The echo repeats the LAST model-visible user text, which is the context
    // snapshot — the snapshot goes after the user's own words on purpose (see
    // contextPreStep.ts), and the stub route picks the last one. Asserting on it
    // therefore proves the same thing twice: the tool ran, and what it ran on is
    // exactly what the signed `user/message` rows say the model was shown.
    expect(payloadText(toolResult!)).toContain("Never force-push to main.");

    const report = await verifyAgentRun(workspace, outcome.sessionId);
    expect(report.unsignedRowIds).toEqual([]);
    expect(report.ok, JSON.stringify(report.ledgerErrors)).toBe(true);
  });

  it("VERIFY-3 (fail closed): a denied approval refuses the call and the tool never runs", async () => {
    const outcome = await runComposedTurn(
      turnOptions({
        approvalGate: {
          actionClass: "WRITE_HIGH",
          riskTier: "high",
          onRaised: (event) => {
            reachQuorum(event.approvalRequestId, "DENIED");
          }
        }
      })
    );

    const rows = events(outcome.sessionId);
    expect(readApprovalAnswerMeta(rowsOf(rows, "approval/answer")[0]!.meta_json)?.answer).toBe("deny");

    const toolResult = rowsOf(rows, "tool/result")[0];
    const meta = JSON.parse(toolResult!.meta_json) as { outcome: string };
    expect(meta.outcome).toBe("DENIED");
    // The negative half: the ECHO never ran. If the gate called through on a
    // refusal, the payload would be the echoed prompt instead of the refusal.
    const content = payloadText(toolResult!);
    expect(content).toContain("was not approved");
    expect(content).not.toContain("tidy the changelog");
    // A refused call is still an ANSWERED call: the model gets a result it can
    // act on rather than a turn that died with a dangling tool call.
    expect(readTurnEndMeta(rowsOf(rows, "turn/end")[0]!.meta_json)?.reason).toBe("complete");
  });

  it("does not claim a guardrail it does not have, and raises no approval when nothing gates", async () => {
    const outcome = await runComposedTurn(turnOptions());

    const rows = events(outcome.sessionId);
    const prompt = payloadText(rowsOf(rows, "system/prompt")[0]!);
    // The negative half of the derived `approvalGated`: an ungated run must not
    // tell its model that a human stands in front of its tools.
    expect(prompt).toContain(IDENTITY_MARK);
    expect(prompt).not.toContain(APPROVAL_MARK);
    expect(rowsOf(rows, "approval/request")).toEqual([]);
    expect(rowsOf(rows, "tool/result")).toHaveLength(1);
    expect(JSON.parse(rowsOf(rows, "tool/result")[0]!.meta_json).outcome).toBe("OK");
  });

  it("a turn cancelled while blocked on approval closes balanced, and fails closed", async () => {
    // Nobody answers. The operator presses stop while the tool call is still
    // waiting — the shape a real unattended run hits, and the one where a seam
    // that leaked a pending question would leave a live grant behind.
    const outcome = await runComposedTurn(
      turnOptions({
        approvalGate: { actionClass: "WRITE_HIGH", riskTier: "high" },
        onReady: (handle) => {
          setTimeout(() => handle.cancel({ kind: "user" }), 300);
        }
      })
    );

    const rows = events(outcome.sessionId);
    // Balanced: every opened bracket is closed. A truncated turn would be
    // indistinguishable from a crashed one.
    expect(rowsOf(rows, "turn/start")).toHaveLength(rowsOf(rows, "turn/end").length);
    expect(readTurnEndMeta(rowsOf(rows, "turn/end")[0]!.meta_json)?.reason).toBe("cancelled");

    const answer = readApprovalAnswerMeta(rowsOf(rows, "approval/answer")[0]!.meta_json);
    // FAIL CLOSED. `unavailable` is the answer to every way of not answering,
    // and the withdrawn question left no approvable request behind for
    // something else to spend.
    expect(answer?.answer).toBe("unavailable");
    // Asserted on the request that really exists, not on an empty list: a
    // PENDING request that was abandoned stays APPROVABLE, and a grant arriving
    // after the asker gave up is a grant for something nobody is still asking.
    const statuses = listApprovalRequests({ workspace, agentId: "default" }).map(
      (request) => request.status
    );
    expect(statuses).toHaveLength(1);
    expect(statuses).not.toContain("PENDING");
  });

  it("VERIFY-2: an unknown {{var}} stops the run before a model is ever called", async () => {
    const before = openLedger(workspace);
    const sessionsBefore = before.getAllEvents().filter((row) => row.event_type === "turn/start").length;
    before.close();

    await expect(
      runComposedTurn(turnOptions({ promptProfile: { persona: "Escalate to {{oncall_rota}}.", amcHome: home } }))
    ).rejects.toThrowError(PromptAssemblyError);

    const ledger = openLedger(workspace);
    try {
      const all = ledger.getAllEvents();
      // No turn was started and no request was sent: the prompt is rendered
      // before the loop is composed precisely so a hole in it costs nothing.
      expect(all.filter((row) => row.event_type === "turn/start")).toHaveLength(sessionsBefore);
      expect(all.filter((row) => row.event_type === "request/header")).toHaveLength(0);
      // The session still CLOSES. An abandoned open session reads as INTERRUPTED,
      // which is the verdict for a process that died, not for one that refused.
      expect(all.filter((row) => row.event_type === "session/close")).toHaveLength(1);
    } finally {
      ledger.close();
    }
  });

  describe("the ADR-5 rollback: an exception, never a default", () => {
    const noteFor = (overrides: Partial<ApprovalExceptionNote> = {}): ApprovalExceptionNote =>
      parseApprovalExceptionNote({
        exceptionId: "ADR5-2026-08-25-loop-demo",
        reason: "unattended demo of the loop; no production credentials are mounted",
        approvedBy: "ada",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        actionClasses: ["WRITE_HIGH"],
        ...overrides
      });

    it("auto-allows only what it names, and names ITSELF in the signed answer", async () => {
      const note = noteFor();
      const outcome = await runComposedTurn(
        turnOptions({
          approvalGate: {
            actionClass: "WRITE_HIGH",
            riskTier: "high",
            answerers: [createApprovalExceptionAnswerer(note)]
          }
        })
      );

      const rows = events(outcome.sessionId);
      const answer = readApprovalAnswerMeta(rowsOf(rows, "approval/answer")[0]!.meta_json);
      expect(answer?.answer).toBe("allow");
      // The tracked id, the approver and the expiry are inside the SIGNED row —
      // which is the whole difference between an exception and a silent default.
      expect(answer?.answeredBy).toContain("adr5-exception:ADR5-2026-08-25-loop-demo");
      expect(answer?.answeredBy).toContain("approved by ada");
      expect(answer?.answeredBy).toContain("expires ");
      // An answerer claimed it, so the engine was never asked: no chain exists,
      // and inventing one would be worse than admitting there is none.
      expect(answer?.approvalRequestId).toBeNull();
      expect(listApprovalRequests({ workspace, agentId: "default" })).toEqual([]);
      expect(JSON.parse(rowsOf(rows, "tool/result")[0]!.meta_json).outcome).toBe("OK");
    });

    it("ABSTAINS on a class it does not name, so the engine still decides", async () => {
      // The negative half of rule 4: no wildcard. An exception scoped to
      // READ_ONLY must not quietly cover the WRITE_HIGH call this run makes.
      const note = noteFor({ actionClasses: ["READ_ONLY"] });
      let raised: string | null = null;
      const outcome = await runComposedTurn(
        turnOptions({
          approvalGate: {
            actionClass: "WRITE_HIGH",
            riskTier: "high",
            answerers: [createApprovalExceptionAnswerer(note)],
            onRaised: (event) => {
              raised = event.approvalRequestId;
              reachQuorum(event.approvalRequestId, "APPROVED");
            }
          }
        })
      );

      const answer = readApprovalAnswerMeta(
        rowsOf(events(outcome.sessionId), "approval/answer")[0]!.meta_json
      );
      expect(answer?.answeredBy).toBe("approvals-engine");
      expect(answer?.approvalRequestId).toBe(raised);
    });

    it("refuses to be constructed without a tracked note, an approver and a bounded expiry", () => {
      expect(() => parseApprovalExceptionNote({ reason: "because" })).toThrowError(/exceptionId/);
      expect(() => parseApprovalExceptionNote({ ...noteFor(), approvedBy: "  " })).toThrowError(
        /approvedBy/
      );
      // No wildcard, and no empty list standing in for one.
      expect(() => parseApprovalExceptionNote({ ...noteFor(), actionClasses: [] })).toThrowError(
        /at least one actionClass/
      );

      // Already lapsed: refused where the operator is still standing there to be
      // told, rather than at the first question of an unattended run.
      expect(() =>
        createApprovalExceptionAnswerer(
          noteFor({ expiresAt: new Date(Date.now() - 1000).toISOString() })
        )
      ).toThrowError(/expired/);

      // And an exception that would outlive the release that introduced it is a
      // default with extra paperwork, so the window itself is bounded.
      expect(() =>
        createApprovalExceptionAnswerer(
          noteFor({ expiresAt: new Date(Date.now() + MAX_EXCEPTION_WINDOW_MS + 60_000).toISOString() })
        )
      ).toThrowError(/shorten the window/);
    });

    it("stops granting the moment it lapses, and hands the question back to the engine", async () => {
      const note = noteFor();
      let clock = Date.now();
      const lapsed: string[] = [];
      const answerer = createApprovalExceptionAnswerer(note, {
        now: () => clock,
        onLapsed: (expired) => lapsed.push(expired.exceptionId)
      });
      // Constructed while valid, asked after it expired — the unattended run that
      // has been going long enough for the exception to run out.
      clock = Date.parse(note.expiresAt) + 1;

      let raised: string | null = null;
      const outcome = await runComposedTurn(
        turnOptions({
          approvalGate: {
            actionClass: "WRITE_HIGH",
            riskTier: "high",
            answerers: [answerer],
            onRaised: (event) => {
              raised = event.approvalRequestId;
              reachQuorum(event.approvalRequestId, "APPROVED");
            }
          }
        })
      );

      const answer = readApprovalAnswerMeta(
        rowsOf(events(outcome.sessionId), "approval/answer")[0]!.meta_json
      );
      // Abstained rather than denied: the question goes back to the party that
      // was always supposed to decide it.
      expect(answer?.answeredBy).toBe("approvals-engine");
      expect(answer?.approvalRequestId).toBe(raised);
      expect(lapsed).toEqual([note.exceptionId]);
    });

    /**
     * The operator path, end to end.
     *
     * P2.4 shipped a subsystem whose only callers were its own tests, and the
     * note that followed said it plainly: a guarantee nobody can invoke is not a
     * guarantee. These drive `amc agent-loop run` from argv — the same command a
     * person types — so the gate and the exception have a real caller.
     */
    it("is reachable from the CLI, and refuses the ways it could become a default", async () => {
      const notePath = join(workspace, "adr5-exception.json");
      writeFileSync(notePath, JSON.stringify(noteFor(), null, 2));
      process.chdir(workspace);

      const bad = programWith();
      await run(bad.program, ["agent-loop", "run", "hi", "--approval-exception", notePath]);
      // An exception with no gate to relax is a flag that does nothing, and a
      // flag about turning approval off must never silently do nothing.
      expect(bad.captured.failures).toEqual([1]);
      expect(bad.captured.errors.join("\n")).toContain("only means something with --approve-tools");

      const wrongClass = programWith();
      await run(wrongClass.program, ["agent-loop", "run", "hi", "--approve-tools", "NOT_A_CLASS"]);
      expect(wrongClass.captured.failures).toEqual([1]);

      const malformed = join(workspace, "broken.json");
      writeFileSync(malformed, JSON.stringify({ reason: "trust me" }));
      const broken = programWith();
      await run(broken.program, [
        "agent-loop",
        "run",
        "hi",
        "--approve-tools",
        "WRITE_HIGH",
        "--approval-exception",
        malformed
      ]);
      expect(broken.captured.failures).toEqual([1]);
      expect(broken.captured.errors.join("\n")).toContain("exceptionId");

      const good = programWith();
      await run(good.program, [
        "agent-loop",
        "run",
        "tidy the changelog",
        "--approve-tools",
        "WRITE_HIGH",
        "--approval-exception",
        notePath,
        "--credentials-home",
        credentialsHome,
        "--json"
      ]);
      expect(good.captured.failures).toEqual([]);
      // Loud on stderr: an exception nobody sees is a default.
      expect(good.captured.errors.join("\n")).toContain("ADR-5 APPROVAL EXCEPTION ACTIVE");
      const summary = JSON.parse(good.captured.out[good.captured.out.length - 1]!) as {
        sessionId: string;
        toolCalls: number;
      };
      expect(summary.toolCalls).toBe(1);
      const answer = readApprovalAnswerMeta(
        rowsOf(events(summary.sessionId), "approval/answer")[0]!.meta_json
      );
      expect(answer?.answer).toBe("allow");
      expect(answer?.answeredBy).toContain("adr5-exception:ADR5-2026-08-25-loop-demo");
    });
  });
});
