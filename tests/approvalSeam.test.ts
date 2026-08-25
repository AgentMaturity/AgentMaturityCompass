import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { initActionPolicy } from "../src/governor/actionPolicyEngine.js";
import { initToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { getPrivateKeyPem, signHexDigest } from "../src/crypto/keys.js";
import { sha256Hex } from "../src/utils/hash.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { SessionService } from "../src/session/sessionService.js";
import { extractEnvelope } from "../src/session/sessionTypes.js";
import {
  readApprovalAnswerMeta,
  readApprovalRequestMeta
} from "../src/session/approvalEventMeta.js";
import {
  approvalPolicyPath,
  initApprovalPolicy
} from "../src/approvals/approvalPolicyEngine.js";
import { decideApprovalForIntent } from "../src/approvals/approvalEngine.js";
import { listApprovalRequests } from "../src/approvals/approvalChainStore.js";
import { ApprovalSeam, normalizeAnswer } from "../src/approvals/seam/index.js";
import type {
  ApprovalAnswer,
  ApprovalAnswerer,
  ApprovalAsk,
  ApprovalWaitRuntime
} from "../src/approvals/seam/index.js";
import type { EvidenceEvent } from "../src/types.js";

/**
 * P3.3 stage 3 — the approval seam.
 *
 * Every test here drives the REAL seam over the REAL approvals engine and the
 * REAL signed session spine. Nothing is stubbed except the clock, and the clock
 * is stubbed only so a two-approver quorum can be reached inside a test instead
 * of inside a human's afternoon — the approvals themselves are genuine signed
 * decisions written by `decideApprovalForIntent`.
 *
 * The rule each test pins, and how it goes RED when the rule is removed:
 *
 *   - a rogue answerer normalizes to `unavailable`: the row it writes stops
 *     parsing as an approval answer, because "allow_always" is not in the union.
 *   - a throwing answerer is contained: without the containment the throw
 *     escapes `request()` and the await rejects.
 *   - a wedged answerer is timed out: without the race the test never returns.
 *   - a GENUINE two-approver grant proceeds: this is the anti-over-clamping
 *     test. Wrap the engine's verdict in the answerer clamp — the mistake an
 *     earlier design made — and the fake clock's instant sleep trips the
 *     stopwatch, so a real approval comes back `unavailable` and this goes red.
 *   - the audit pair is two SIGNED rows sharing one id inside one turn: drop the
 *     turn/step stamp and the pair no longer sits in the same sealed window.
 *   - an unsigned approval policy refuses: the regression guard for the
 *     bootstrap-widening fix, asserted through the seam rather than the engine.
 */

const PASS = "amc-approval-seam-test-passphrase";
const roots: string[] = [];

interface Fixture {
  readonly workspace: string;
  readonly session: SessionService;
  events(): readonly EvidenceEvent[];
  finish(): void;
}

/** A workspace with every config the approvals engine binds a request to. */
function newFixture(): Fixture {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const workspace = mkdtempSync(join(tmpdir(), "amc-approval-seam-"));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  initActionPolicy(workspace);
  initToolsConfig(workspace);
  initBudgets(workspace, "default");

  const session = new SessionService(workspace);
  session.open({
    agentId: "default",
    harnessVersion: "3.3.0",
    compositionDigest: "composition-digest",
    policyDigest: "policy-digest"
  });
  // The audit pair must be turn-enclosed, so every fixture opens one.
  session.startTurn({ trigger: "user" });
  session.startStep();

  const sessionId = session.sessionId;
  let closed = false;
  return {
    workspace,
    session,
    // Read straight from the ledger rather than through the service: the rows
    // are inspected AFTER the session is closed, and a closed service refuses
    // to serve — correctly, since it is no longer the live writer.
    events: () => {
      const ledger = openLedger(workspace);
      try {
        return ledger.getAllEvents().filter((event) => event.session_id === sessionId);
      } finally {
        ledger.close();
      }
    },
    finish: () => {
      if (closed) return;
      closed = true;
      session.endStep({ stopReason: "done", usage: null });
      session.endTurn({ reason: "complete" });
      session.sealTurn();
      session.close({ reason: "completed" });
    }
  };
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  }
});

const ASK: ApprovalAsk = {
  toolCallId: "call-1",
  toolName: "process.spawn",
  actionClass: "WRITE_HIGH",
  riskTier: "high",
  question: "may the agent delete the production bucket?",
  intentPayload: { bucket: "production" }
};

const rowsOfType = (events: readonly EvidenceEvent[], type: string): EvidenceEvent[] =>
  events.filter((event) => event.event_type === type);

const only = (events: readonly EvidenceEvent[], type: string): EvidenceEvent => {
  const matches = rowsOfType(events, type);
  expect(matches, `exactly one ${type}`).toHaveLength(1);
  return matches[0] as EvidenceEvent;
};

/** An answerer built from a single function, so a test reads as its behaviour. */
function answerer(name: string, answer: () => Promise<unknown>): ApprovalAnswerer {
  return { name, answer: answer as () => Promise<ApprovalAnswer | null> };
}

/**
 * A clock that jumps forward when the seam sleeps, and does the deciding.
 *
 * The engine is create-then-poll, so the seam's wait is where a human would be.
 * `decide` runs there: by the time the next poll reads the request, the signed
 * decisions exist. This is what makes a genuine quorum reachable in a
 * test WITHOUT weakening the engine — the approvals are real, only the waiting
 * is instant.
 */
function decidingRuntime(workspace: string, decide: (approvalRequestId: string) => void): ApprovalWaitRuntime {
  let clock = Date.now();
  let fired = false;
  return {
    now: () => clock,
    sleep: async (ms: number) => {
      clock += ms;
      if (fired) return;
      // Only ever called from the engine poll (the answerer stopwatch runs on
      // the real clock), but a request can still be absent on the first tick if
      // the engine refused to raise one — and deciding then would be deciding a
      // question nobody has asked.
      const requests = listApprovalRequests({ workspace, agentId: "default" });
      const pending = requests[0];
      if (pending === undefined) return;
      fired = true;
      decide(pending.approvalRequestId);
    }
  };
}

/** One genuine signed approval decision by one named reviewer. */
function approveAs(workspace: string, approvalRequestId: string, who: string): void {
  decideApprovalForIntent({
    workspace,
    agentId: "default",
    approvalId: approvalRequestId,
    decision: "APPROVED",
    mode: "EXECUTE",
    reason: `${who} reviewed the blast radius`,
    username: who,
    userId: who,
    userRoles: ["APPROVER"]
  });
}

function denyAs(workspace: string, approvalRequestId: string, who: string): void {
  decideApprovalForIntent({
    workspace,
    agentId: "default",
    approvalId: approvalRequestId,
    decision: "DENIED",
    mode: "SIMULATE",
    reason: `${who} refused`,
    username: who,
    userId: who,
    userRoles: ["APPROVER"]
  });
}

describe("P3.3 — the approval seam normalizes answerers and fails closed", () => {
  test("a rogue answerer's out-of-union value becomes unavailable and does NOT proceed", async () => {
    const fixture = newFixture();
    const seam = new ApprovalSeam({
      session: fixture.session,
      workspace: fixture.workspace,
      agentId: "default",
      // `allow_always` is the removed union member. An answerer that says it is
      // asking for a standing grant, and the seam must read that as NOBODY
      // DECIDED rather than as the most permissive thing it resembles.
      answerers: [answerer("rogue", async () => "allow_always")]
    });

    const decision = await seam.request(ASK);
    expect(decision.answer).toBe("unavailable");
    expect(decision.proceed, "unavailable must never proceed").toBe(false);
    expect(decision.reason).toMatch(/outside the approval vocabulary/);

    // A claimed question stops at the answerer: it must not fall through to the
    // engine, where something more permissive might grant it.
    expect(decision.approvalRequestId).toBeNull();
    expect(listApprovalRequests({ workspace: fixture.workspace, agentId: "default" })).toHaveLength(0);

    // And the SIGNED row says unavailable too. Remove the normalizer and this
    // row carries "allow_always", which no longer parses as an answer at all.
    fixture.finish();
    const answer = only(fixture.events(), "approval/answer");
    expect(readApprovalAnswerMeta(answer.meta_json)?.answer).toBe("unavailable");
  });

  test("a throwing answerer fails the QUESTION closed, not the caller open", async () => {
    const fixture = newFixture();
    const seam = new ApprovalSeam({
      session: fixture.session,
      workspace: fixture.workspace,
      agentId: "default",
      answerers: [
        answerer("thrower", () => {
          // Synchronous, before any await: the containment has to catch this
          // one too, or it escapes past every handler into the caller.
          throw new Error("answerer exploded");
        })
      ]
    });

    const decision = await seam.request(ASK);
    expect(decision.answer).toBe("unavailable");
    expect(decision.proceed).toBe(false);
    expect(decision.reason).toMatch(/threw: answerer exploded/);
    fixture.finish();
  });

  test("an answerer that never settles is timed out to unavailable", async () => {
    const fixture = newFixture();
    const seam = new ApprovalSeam({
      session: fixture.session,
      workspace: fixture.workspace,
      agentId: "default",
      answererTimeoutMs: 25,
      answerers: [answerer("wedged", () => new Promise<never>(() => undefined))]
    });

    const decision = await seam.request(ASK);
    expect(decision.answer).toBe("unavailable");
    expect(decision.proceed).toBe(false);
    expect(decision.reason).toMatch(/did not answer within 25ms/);
    fixture.finish();
  });

  test("an abstaining answerer passes the question to the engine", async () => {
    const fixture = newFixture();
    const seam = new ApprovalSeam({
      session: fixture.session,
      workspace: fixture.workspace,
      agentId: "default",
      answerers: [answerer("abstainer", async () => null)],
      runtime: decidingRuntime(fixture.workspace, (requestId) => {
        approveAs(fixture.workspace, requestId, "ada");
        approveAs(fixture.workspace, requestId, "grace");
      })
    });

    const decision = await seam.request(ASK);
    expect(decision.answeredBy).toBe("approvals-engine");
    expect(decision.answer).toBe("allow");
    fixture.finish();
  });

  test("normalizeAnswer is the identity on every legal answer", () => {
    // The clamp must never touch a real answer. Asserted directly because this
    // is the property whose loss makes human approval impossible.
    expect(normalizeAnswer("allow")).toBe("allow");
    expect(normalizeAnswer("deny")).toBe("deny");
    expect(normalizeAnswer("unavailable")).toBe("unavailable");
    expect(normalizeAnswer(null), "null is the only abstention").toBeNull();
    expect(normalizeAnswer(undefined), "a function that fell off its end malfunctioned").toBe(
      "unavailable"
    );
    expect(normalizeAnswer(true)).toBe("unavailable");
    expect(normalizeAnswer("ALLOW")).toBe("unavailable");
  });
});

describe("P3.3 — a genuine quorum grant survives the seam", () => {
  test("two distinct approvers on a WRITE_HIGH request produce allow", async () => {
    const fixture = newFixture();
    let raised: string | null = null;
    const seam = new ApprovalSeam({
      session: fixture.session,
      workspace: fixture.workspace,
      agentId: "default",
      onRaised: (event) => {
        raised = event.approvalRequestId;
      },
      runtime: decidingRuntime(fixture.workspace, (requestId) => {
        // Two DISTINCT approvers, because the default WRITE_HIGH rule requires
        // two and requires them to be different people.
        approveAs(fixture.workspace, requestId, "ada");
        approveAs(fixture.workspace, requestId, "grace");
      })
    });

    const decision = await seam.request(ASK);

    expect(decision.answer, "a real quorum grant must survive the seam").toBe("allow");
    expect(decision.proceed).toBe(true);
    expect(decision.answeredBy).toBe("approvals-engine");
    expect(decision.reason).toMatch(/quorum met and verified \(2\/2 approvals\)/);
    expect(decision.approvalRequestId).toBe(raised);

    // The two records name each other: the seam's audit id is the engine's
    // intent id, so an auditor can walk in either direction.
    const request = listApprovalRequests({ workspace: fixture.workspace, agentId: "default" })[0] as {
      intentId: string;
    };
    expect(request.intentId).toBe(decision.approvalId);
    fixture.finish();
  });

  test("an action class the policy needs no approvers for does not block", async () => {
    const fixture = newFixture();
    const seam = new ApprovalSeam({
      session: fixture.session,
      workspace: fixture.workspace,
      agentId: "default",
      // No runtime override and no answerers: if this blocked at all it would
      // block on the real clock, and the test would hang rather than fail
      // quietly. READ_ONLY requires zero approvals in the shipped policy, so the
      // FIRST poll already finds a met quorum and nobody is ever prompted.
      poll: { firstDelayMs: 10, maxDelayMs: 10 }
    });

    const decision = await seam.request({
      ...ASK,
      toolName: "fs.read",
      actionClass: "READ_ONLY",
      riskTier: "low"
    });
    expect(decision.answer).toBe("allow");
    expect(decision.reason).toMatch(/0\/0 approvals/);
    fixture.finish();
  });

  test("one approver is not a quorum: the request expires unavailable", async () => {
    const fixture = newFixture();
    const seam = new ApprovalSeam({
      session: fixture.session,
      workspace: fixture.workspace,
      agentId: "default",
      runtime: decidingRuntime(fixture.workspace, (requestId) => {
        approveAs(fixture.workspace, requestId, "ada");
      })
    });

    // The fake clock runs the seam past the signed request's TTL with only one
    // of the two approvals in hand. Nobody decided, so nothing proceeds.
    const decision = await seam.request({ ...ASK, toolCallId: "call-partial" });
    expect(decision.answer).toBe("unavailable");
    expect(decision.proceed).toBe(false);
    expect(decision.reason).toMatch(/expired|1\/2/);
    fixture.finish();
  });

  test("a denial is a decision, and it is deny rather than unavailable", async () => {
    const fixture = newFixture();
    const seam = new ApprovalSeam({
      session: fixture.session,
      workspace: fixture.workspace,
      agentId: "default",
      runtime: decidingRuntime(fixture.workspace, (requestId) => {
        denyAs(fixture.workspace, requestId, "ada");
      })
    });

    const decision = await seam.request(ASK);
    expect(decision.answer).toBe("deny");
    expect(decision.proceed).toBe(false);
    fixture.finish();
  });

  test("a grant does not verify once the config it was bound to changes", async () => {
    const fixture = newFixture();
    const seam = new ApprovalSeam({
      session: fixture.session,
      workspace: fixture.workspace,
      agentId: "default",
      runtime: decidingRuntime(fixture.workspace, (requestId) => {
        approveAs(fixture.workspace, requestId, "ada");
        approveAs(fixture.workspace, requestId, "grace");
        // The approvers said yes to the tool config that existed when they were
        // asked. Swapping it afterwards — even with a VALID new signature —
        // means the grant no longer describes what is about to run.
        const toolsPath = join(fixture.workspace, ".amc", "tools.yaml");
        writeFileSync(toolsPath, `${readFileSync(toolsPath, "utf8")}\n# widened after approval\n`, "utf8");
        const digest = sha256Hex(readFileSync(toolsPath));
        writeFileSync(
          `${toolsPath}.sig`,
          JSON.stringify({
            digestSha256: digest,
            signature: signHexDigest(digest, getPrivateKeyPem(fixture.workspace, "auditor")),
            signedTs: Date.now(),
            signer: "auditor"
          }),
          "utf8"
        );
      })
    });

    const decision = await seam.request(ASK);
    expect(decision.answer, "quorum met is not enough; the grant must still bind").toBe("unavailable");
    expect(decision.proceed).toBe(false);
    expect(decision.reason).toMatch(/did not verify/);
    fixture.finish();
  });
});

describe("P3.3 — the audit pair", () => {
  test("two signed rows, one approval id, inside one turn window", async () => {
    const fixture = newFixture();
    const seam = new ApprovalSeam({
      session: fixture.session,
      workspace: fixture.workspace,
      agentId: "default",
      runtime: decidingRuntime(fixture.workspace, (requestId) => {
        approveAs(fixture.workspace, requestId, "ada");
        approveAs(fixture.workspace, requestId, "grace");
      })
    });

    const decision = await seam.request(ASK);
    fixture.finish();

    const events = fixture.events();
    const requestRow = only(events, "approval/request");
    const answerRow = only(events, "approval/answer");

    // The pair, correlated.
    const request = readApprovalRequestMeta(requestRow.meta_json);
    const answer = readApprovalAnswerMeta(answerRow.meta_json);
    expect(request, "the request row must parse").not.toBeNull();
    expect(answer, "the answer row must parse").not.toBeNull();
    expect(request?.approvalId).toBe(decision.approvalId);
    expect(answer?.approvalId).toBe(decision.approvalId);
    expect(request?.toolCallId).toBe(ASK.toolCallId);
    expect(request?.toolName).toBe(ASK.toolName);
    expect(request?.actionClass).toBe(ASK.actionClass);
    expect(request?.question).toBe(ASK.question);
    expect(answer?.answer).toBe("allow");
    // The pointer out of the session log and into the approvals chain.
    expect(answer?.approvalRequestId).toBe(decision.approvalRequestId);

    // The question is committed BEFORE the answer, never after.
    const requestEnvelope = extractEnvelope(requestRow.meta_json);
    const answerEnvelope = extractEnvelope(answerRow.meta_json);
    expect(requestEnvelope?.seq).toBeLessThan(answerEnvelope?.seq ?? -1);

    // Both halves sit in the SAME turn and step, so the whole decision lands in
    // one sealed window. The answer row used to carry turn: null.
    expect(requestEnvelope?.turn).toBe(1);
    expect(requestEnvelope?.step).toBe(1);
    expect(answerEnvelope?.turn, "the answer must be turn-enclosed too").toBe(1);
    expect(answerEnvelope?.step).toBe(1);
    expect(answer?.turn).toBe(1);
    expect(answer?.step).toBe(1);

    // Signed, and provably so: the whole chain verifies, which is what makes
    // "two signed rows" a claim rather than a comment.
    const verdict = await verifyLedgerIntegrity(fixture.workspace);
    expect(verdict.ok, JSON.stringify(verdict.issues ?? verdict)).toBe(true);

    // And the ids the caller was handed are the rows that exist.
    expect(requestRow.id).toBe(decision.requestEventId);
    expect(answerRow.id).toBe(decision.answerEventId);
  });

  test("an approval cannot be recorded outside an open turn", () => {
    const fixture = newFixture();
    fixture.session.endStep({ stopReason: "done", usage: null });
    fixture.session.endTurn({ reason: "complete" });
    fixture.session.sealTurn();

    // A question asked between turns would be covered by no seal — the one row
    // an auditor most needs sealed would be the one row that is not.
    expect(() =>
      fixture.session.recordApproval({
        phase: "request",
        approvalId: "apr_orphan",
        toolCallId: "call-1",
        question: "may I?"
      })
    ).toThrow(/no turn is open/);

    fixture.session.close({ reason: "completed" });
  });
});

describe("P3.3 — an unverifiable approval policy refuses through the seam", () => {
  test("an unsigned policy yields unavailable and is not silently repaired", async () => {
    const fixture = newFixture();
    initApprovalPolicy(fixture.workspace);
    const policyPath = approvalPolicyPath(fixture.workspace);
    const operatorPolicy = readFileSync(policyPath, "utf8");

    // The attack (regression guard for the bootstrap-widening fix): delete only
    // the signature. The engine must refuse rather than overwrite the
    // operator's rules with a permissive default and sign that.
    unlinkSync(`${policyPath}.sig`);

    const seam = new ApprovalSeam({
      session: fixture.session,
      workspace: fixture.workspace,
      agentId: "default"
    });
    const decision = await seam.request(ASK);

    expect(decision.answer).toBe("unavailable");
    expect(decision.proceed, "an unverifiable policy must never grant anything").toBe(false);
    expect(decision.reason).toMatch(/policy signature invalid/);
    expect(decision.approvalRequestId, "no request may be raised against it").toBeNull();

    expect(readFileSync(policyPath, "utf8"), "the operator's policy must survive").toBe(operatorPolicy);
    expect(existsSync(`${policyPath}.sig`), "and must not be re-signed behind their back").toBe(false);

    // The refusal is still audited: the question was asked and the log says how
    // it settled, so a fail-closed path is not a silent one.
    fixture.finish();
    const answer = readApprovalAnswerMeta(only(fixture.events(), "approval/answer").meta_json);
    expect(answer?.answer).toBe("unavailable");
    expect(answer?.reason).toMatch(/refused to raise the question/);
  });
});
