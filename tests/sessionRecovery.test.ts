import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { SessionService } from "../src/session/sessionService.js";
import { recoverSession, type RecoveryClaimant } from "../src/session/sessionRecovery.js";
import { embedEnvelope, extractEnvelope, type SessionEnvelope } from "../src/session/sessionTypes.js";
import { readStepBoundary, readTurnEndMeta } from "../src/session/turnLifecycleMeta.js";
import { sha256Hex } from "../src/utils/hash.js";
import type { EvidenceEvent } from "../src/types.js";

// P2.2 crash recovery. Recovery only ever APPENDS: the partial turn a crash left
// stays exactly as it was, and synthetic, signed, chained closers are added after
// it under a fenced claim. These tests prove the three verdicts that matter — a
// stale crash recovers and is DISTINGUISHABLE from a clean close (synthetic +
// interrupted), a broken per-session chain is TAMPERED and is never appended to,
// and a fresh session is refused unless forced.

describe("recoverSession — turn-sealed session crash recovery", () => {
  let dir: string;

  const claimant: RecoveryClaimant = { pid: 4242, hostId: "host-a", bootId: "boot-1", startedAt: 1_600_000_000 };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "amc-session-recover-"));
    initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // Drives a session up to a crash and then ABANDONS the service (never closes
  // it), leaving an open turn with a tool/call that has no tool/result — the
  // shape a process death leaves: an unsealed, unclosed tail.
  function buildCrashedSession(): { sessionId: string; toolCallId: string } {
    const service = new SessionService(dir);
    service.open({
      runtime: "claude",
      agentId: "default",
      harnessVersion: "2.2.0",
      compositionDigest: sha256Hex("composition"),
      policyDigest: sha256Hex("policy")
    });
    const sessionId = service.sessionId;

    service.recordSystemPrompt("You are a careful assistant.");
    service.startTurn({ trigger: "user" });
    service.recordUserMessage("List the files, then read the first one.");
    service.startStep();
    service.recordAssistantBlock({ blockIndex: 0, blockKind: "text", stopReason: null, content: "I'll list them." });
    const toolCallId = "call-crash-1";
    service.recordToolCall({
      toolCallId,
      toolName: "shell",
      dispatch: "native",
      parentToken: null,
      args: JSON.stringify({ command: "ls" })
    });
    // CRASH here: no tool result, no step/end, no turn/end, no seal, no close.
    // The service is deliberately not closed — that is the crash.
    return { sessionId, toolCallId };
  }

  function sessionEvents(sessionId: string): EvidenceEvent[] {
    const ledger = openLedger(dir);
    try {
      return ledger.getAllEvents().filter((event) => event.session_id === sessionId);
    } finally {
      ledger.close();
    }
  }

  function metaOf(event: EvidenceEvent): Record<string, unknown> {
    return JSON.parse(event.meta_json) as Record<string, unknown>;
  }

  const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  test("(a) a stale crashed session recovers to RECOVERED, marked interrupted and synthetic", async () => {
    const { sessionId, toolCallId } = buildCrashedSession();
    const crashTail = sessionEvents(sessionId).map((event) => event.id);

    // staleAfterMs:0 plus a real elapsed gap makes the crash unambiguously stale
    // without waiting out the 60s default.
    await delay(25);
    const report = recoverSession({ workspace: dir, sessionId, claimant, staleAfterMs: 0 });

    expect(report.verdict).toBe("RECOVERED");
    expect(report.wonClaim).toBe(true);
    expect(report.claimEventId).not.toBeNull();
    expect(report.unknownToolOutcomes).toBe(1);
    expect(report.syntheticTurnEnds).toBe(1);
    // D6: the crash left a step open too, and a recovered log has to be
    // well-formed at BOTH levels — not just the outermost bracket.
    expect(report.syntheticStepEnds).toBe(1);
    expect(report.closed).toBe(false);

    const events = sessionEvents(sessionId);
    // The crash tail is untouched — the pre-crash rows are still there, in order,
    // and the recovery only added rows after them.
    expect(events.length).toBeGreaterThan(crashTail.length);
    expect(events.slice(0, crashTail.length).map((event) => event.id)).toEqual(crashTail);

    // A synthetic tool/result answers the unanswered call — UNKNOWN, never OK,
    // and model-visible (an append op whose part is this row's own payload).
    const toolResult = events.find((event) => event.event_type === "tool/result");
    expect(toolResult, "a synthetic tool/result was appended").toBeDefined();
    const trEnvelope = extractEnvelope(toolResult!.meta_json)!;
    expect(trEnvelope.synthetic).toBe(true);
    expect(metaOf(toolResult!).outcome).toBe("TOOL_OUTCOME_UNKNOWN");
    expect(metaOf(toolResult!).toolCallId).toBe(toolCallId);
    expect(trEnvelope.surface.op).toBe("append");
    if (trEnvelope.surface.op === "append") {
      expect(trEnvelope.surface.part.sha256).toBe(toolResult!.payload_sha256);
    }
    // Blob-backed, never inline — retention must be able to physically unlink it.
    expect(toolResult!.payload_inline).toBeNull();

    // The open STEP is closed before its turn is, with no stop reason and no
    // usage. Null, not zero: the process died without reporting either, and a
    // fabricated 0 would put a measurement nobody took into a signed row and
    // into every cost projection that reads it.
    const stepEnd = events.find((event) => event.event_type === "step/end");
    expect(stepEnd, "the open step was synthetically ended").toBeDefined();
    const seEnvelope = extractEnvelope(stepEnd!.meta_json)!;
    expect(seEnvelope.synthetic).toBe(true);
    expect(metaOf(stepEnd!).usage).toBeNull();
    expect(metaOf(stepEnd!).stopReason).toBeNull();
    expect(metaOf(stepEnd!).recoveredBy).toBe(report.claimEventId);
    expect(readStepBoundary(stepEnd!.meta_json)).toEqual({ turn: 1, step: 1 });

    // The open turn is closed as interrupted — never laundered into a clean end.
    const turnEnd = events.find((event) => event.event_type === "turn/end");
    expect(turnEnd, "the open turn was synthetically ended").toBeDefined();
    const teEnvelope = extractEnvelope(turnEnd!.meta_json)!;
    expect(teEnvelope.synthetic).toBe(true);
    expect(metaOf(turnEnd!).interrupted).toBe(true);
    expect(metaOf(turnEnd!).reason).toBe("interrupted");
    // Crash repair never attributes a cancel: nobody stopped this agent.
    expect(readTurnEndMeta(turnEnd!.meta_json)!.cancelCause).toBeNull();

    // Ordering is load-bearing: a step/end after its own turn/end would be an
    // inner bracket closing outside the outer one.
    expect(events.indexOf(stepEnd!)).toBeLessThan(events.indexOf(turnEnd!));

    // Well-formed at the step level: every step/start now has a step/end.
    const started = events
      .filter((event) => event.event_type === "step/start")
      .map((event) => JSON.stringify(readStepBoundary(event.meta_json)));
    const ended = events
      .filter((event) => event.event_type === "step/end")
      .map((event) => JSON.stringify(readStepBoundary(event.meta_json)));
    expect(started.length).toBeGreaterThan(0);
    expect(ended).toEqual(started);

    // The recovery itself is fenced, summarised, and sealed.
    expect(events.some((event) => event.event_type === "session/recovery-claim")).toBe(true);
    expect(events.some((event) => event.event_type === "session/recovered")).toBe(true);
    expect(events.some((event) => event.event_type === "turn/seal")).toBe(true);
    // Distinguishable from a clean close: there is NO session/close here.
    expect(events.some((event) => event.event_type === "session/close")).toBe(false);

    // No bracket is ever closed twice. Two mechanisms would each prevent it —
    // the synthetic closers are matched exactly like real ones, and the claim
    // fence is permanent (the first valid claim in chain order keeps winning) —
    // and the fence is the one that answers first, so a second pass is refused
    // outright and the closer counts do not move.
    const closerCount = (): number =>
      sessionEvents(sessionId).filter(
        (event) => event.event_type === "turn/end" || event.event_type === "step/end"
      ).length;
    const closersAfterRecovery = closerCount();
    const second = recoverSession({ workspace: dir, sessionId, claimant, force: true });
    expect(second.verdict).toBe("INDETERMINATE");
    expect(second.wonClaim).toBe(false);
    expect(closerCount()).toBe(closersAfterRecovery);

    // The whole recovered ledger still verifies: global chain, per-session chain,
    // and payloads all intact after the synthetic appends.
    const verdict = await verifyLedgerIntegrity(dir);
    expect(verdict.chain.ok, verdict.chain.errors.join("; ")).toBe(true);
  });

  test("(a2) recovery with close seals a synthetic session/close that verifies as CLOSED", async () => {
    const { sessionId } = buildCrashedSession();
    await delay(25);

    const report = recoverSession({ workspace: dir, sessionId, claimant, staleAfterMs: 0, close: true });
    expect(report.verdict).toBe("RECOVERED");
    expect(report.closed).toBe(true);

    const events = sessionEvents(sessionId);
    const close = events.find((event) => event.event_type === "session/close");
    expect(close, "a synthetic session/close was appended").toBeDefined();
    // The close is marked synthetic inside the hash, so a recovery-closed session
    // never masquerades as a cleanly closed one.
    expect(extractEnvelope(close!.meta_json)!.synthetic).toBe(true);

    const verdict = await verifyLedgerIntegrity(dir);
    expect(verdict.chain.ok, verdict.chain.errors.join("; ")).toBe(true);
    expect(verdict.sessions.closed).toContain(sessionId);
  });

  // The user's P3.2 decision, made checkable: "someone stopped this agent" and
  // "this agent died" are two different facts, and the log must keep them apart.
  // One session carries both — a turn a hook cancelled while the process was
  // alive, and a turn the process died inside — and projecting the two turn/end
  // rows has to yield two different answers. A design that spelled a live cancel
  // the way crash repair spells a death would make this test fail at the
  // `reason` assertion; one that dropped the cause would fail at `cancelCause`.
  test("(a3) a live cancel and a crash repair are DISTINGUISHABLE by projecting both turn/end rows", async () => {
    const service = new SessionService(dir);
    service.open({
      agentId: "default",
      harnessVersion: "3.2.0",
      compositionDigest: sha256Hex("composition"),
      policyDigest: sha256Hex("policy")
    });
    const sessionId = service.sessionId;

    // Turn 1 — stopped by a hook while the agent was very much alive. The step
    // ends with no usage at all, because the stream was cut off before any
    // arrived; that is recorded as null rather than as four zeroes.
    service.startTurn({ trigger: "user" });
    service.startStep();
    service.recordUserMessage("do the risky thing");
    service.endStep({ stopReason: null, usage: null });
    service.endTurn({ reason: "cancelled", cause: { kind: "hook", reason: "egress-guard" } });
    service.sealTurn();

    // Turn 2 — the process dies mid-step. No endStep, no endTurn, no close.
    service.startTurn({ trigger: "user" });
    service.startStep();
    service.recordUserMessage("and now the safe thing");

    await delay(25);
    const report = recoverSession({ workspace: dir, sessionId, claimant, staleAfterMs: 0 });
    expect(report.verdict).toBe("RECOVERED");
    // Only the crashed turn and its step are closed synthetically; the cancelled
    // turn was already closed and is not touched.
    expect(report.syntheticTurnEnds).toBe(1);
    expect(report.syntheticStepEnds).toBe(1);

    const events = sessionEvents(sessionId);
    const turnEnds = events.filter((event) => event.event_type === "turn/end");
    expect(turnEnds.length).toBe(2);

    const cancelled = readTurnEndMeta(turnEnds[0]!.meta_json)!;
    expect(cancelled.turn).toBe(1);
    expect(cancelled.reason).toBe("cancelled");
    expect(cancelled.interrupted).toBe(false);
    expect(cancelled.cancelCause).toEqual({ kind: "hook", reason: "egress-guard" });
    expect(extractEnvelope(turnEnds[0]!.meta_json)!.synthetic).toBe(false);

    const died = readTurnEndMeta(turnEnds[1]!.meta_json)!;
    expect(died.turn).toBe(2);
    expect(died.reason).toBe("interrupted");
    expect(died.interrupted).toBe(true);
    expect(died.cancelCause).toBeNull();
    expect(extractEnvelope(turnEnds[1]!.meta_json)!.synthetic).toBe(true);

    // The whole point: no projection of these two rows collapses them.
    expect(cancelled.reason).not.toBe(died.reason);
    expect(cancelled.interrupted).not.toBe(died.interrupted);

    // The step the cancel ended reported no usage either — recorded as unknown.
    const stepEnds = events.filter((event) => event.event_type === "step/end");
    expect(stepEnds.length).toBe(2);
    expect(metaOf(stepEnds[0]!).usage).toBeNull();

    const verdict = await verifyLedgerIntegrity(dir);
    expect(verdict.chain.ok, verdict.chain.errors.join("; ")).toBe(true);
  });

  test("(b) a broken per-session chain is TAMPERED and is never appended to", () => {
    const { sessionId } = buildCrashedSession();

    // Forge an event with a wrong per-session seq — a genuine chain break, the
    // signature of a rewritten history rather than a crash. Appended raw so the
    // GLOBAL chain stays valid while the per-session envelope does not.
    const existing = sessionEvents(sessionId);
    const last = existing[existing.length - 1]!;
    const lastEnvelope = extractEnvelope(last.meta_json)!;
    const brokenEnvelope: SessionEnvelope = {
      v: 1,
      sessionId,
      seq: lastEnvelope.seq + 5, // skips ahead: the break
      prevSessionEventHash: last.event_hash,
      turn: null,
      step: null,
      surface: { op: "none" },
      synthetic: false
    };
    const forger = openLedger(dir);
    try {
      forger.appendEvidenceDetailed({
        sessionId,
        runtime: "claude",
        eventType: "user/message",
        meta: embedEnvelope({}, brokenEnvelope)
      });
    } finally {
      forger.close();
    }

    const beforeCount = sessionEvents(sessionId).length;
    const report = recoverSession({ workspace: dir, sessionId, claimant, force: true });

    expect(report.verdict).toBe("TAMPERED");
    expect(report.wonClaim).toBe(false);
    expect(report.claimEventId).toBeNull();

    // Nothing was appended: no claim, no synthetics — recovery refuses to build on
    // top of a rewritten chain.
    const after = sessionEvents(sessionId);
    expect(after.length).toBe(beforeCount);
    expect(after.some((event) => event.event_type === "session/recovery-claim")).toBe(false);
  });

  test("(c) a fresh (non-stale) session is refused without force, then recovers with it", () => {
    const { sessionId } = buildCrashedSession();

    // Default staleness window (60s) and no force: a just-crashed session is
    // indistinguishable from a slow one, so recovery refuses and changes nothing.
    const before = sessionEvents(sessionId).length;
    const refused = recoverSession({ workspace: dir, sessionId, claimant });

    expect(refused.verdict).toBe("INDETERMINATE");
    expect(refused.wonClaim).toBe(false);
    expect(refused.claimEventId).toBeNull();
    expect(refused.reason).toMatch(/not stale/);

    const after = sessionEvents(sessionId);
    expect(after.length).toBe(before);
    expect(after.some((event) => event.event_type === "session/recovery-claim")).toBe(false);

    // The operator override is the only thing that was missing.
    const forced = recoverSession({ workspace: dir, sessionId, claimant, force: true });
    expect(forced.verdict).toBe("RECOVERED");
    expect(forced.wonClaim).toBe(true);
    expect(sessionEvents(sessionId).some((event) => event.event_type === "session/recovery-claim")).toBe(true);
  });
});
