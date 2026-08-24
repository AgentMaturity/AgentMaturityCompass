import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { extractEnvelope, SESSION_GENESIS } from "../src/session/sessionTypes.js";
import { SessionService, PreparedRequest } from "../src/session/sessionService.js";
import { sha256Hex } from "../src/utils/hash.js";
import type { EvidenceEvent } from "../src/types.js";

// P2.2 — the turn-sealed session spine. These tests drive a full session through
// SessionService and prove two things over the SAME bytes: the existing evidence
// verifier accepts the whole session (chain.ok, and the session lands in CLOSED),
// and the per-session envelope chain — seq monotonicity and prevSessionEventHash
// linkage — is intact and cryptographically anchored to each row's event_hash.

describe("SessionService — turn-sealed session spine", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "amc-session-spine-"));
    initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // Runs one realistic session: open, a turn with a system prompt and user
  // message, two steps (the first dispatching a tool), a turn seal, and close.
  function runFullSession(): { service: SessionService; sessionId: string; prepared: PreparedRequest } {
    const service = new SessionService(dir);
    service.open({
      runtime: "claude",
      agentId: "default",
      harnessVersion: "2.2.0",
      compositionDigest: sha256Hex("composition"),
      policyDigest: sha256Hex("policy")
    });
    const sessionId = service.sessionId;

    // Session-scoped content, recorded before any turn opens.
    const systemPrompt = service.recordSystemPrompt("You are a careful assistant.");
    service.recordSandboxMode({ backend: "seatbelt", mode: "workspace-write", policyDigest: sha256Hex("sandbox") });

    service.startTurn({ trigger: "user" });
    service.recordUserMessage("List the files, then read the first one.");

    // Step 1: a request, an assistant text block, then a tool call + result.
    const step1 = service.startStep();
    const prepared = service.recordRequestHeader({
      model: "claude-opus-4-8",
      providerId: "anthropic",
      params: { max_tokens: 1024 },
      systemPromptEventId: systemPrompt.eventId,
      toolSchemaSha256: sha256Hex("tool-schema"),
      projectionCutoffEventId: step1.eventId,
      projectionDigest: sha256Hex("projection-1"),
      sourceEventIds: [systemPrompt.eventId],
      requestBytes: JSON.stringify({ system: "You are a careful assistant.", messages: [] })
    });
    service.recordAssistantBlock({
      blockIndex: 0,
      blockKind: "text",
      stopReason: null,
      content: "I'll list the directory first."
    });
    service.recordApproval({
      phase: "request",
      approvalId: "apr-1",
      toolCallId: "call-1",
      question: "Allow shell command `ls`?"
    });
    service.recordApproval({ phase: "answer", approvalId: "apr-1", answer: "allow", answeredBy: "operator" });
    service.recordToolCall({
      toolCallId: "call-1",
      toolName: "shell",
      dispatch: "native",
      parentToken: null,
      args: JSON.stringify({ command: "ls" })
    });
    service.recordToolResult({
      toolCallId: "call-1",
      outcome: "OK",
      exitCode: 0,
      timedOut: false,
      denied: false,
      content: "file-a.txt\nfile-b.txt\n"
    });
    service.endStep({
      stopReason: "tool_use",
      usage: { inputTokens: 320, outputTokens: 48, cacheRead: 0, cacheWrite: 320 }
    });

    // Step 2: the model's final answer.
    service.startStep();
    service.recordRequestHeader({
      model: "claude-opus-4-8",
      providerId: "anthropic",
      params: { max_tokens: 1024 },
      systemPromptEventId: systemPrompt.eventId,
      toolSchemaSha256: sha256Hex("tool-schema"),
      projectionCutoffEventId: step1.eventId,
      projectionDigest: sha256Hex("projection-2"),
      sourceEventIds: [systemPrompt.eventId],
      requestBytes: JSON.stringify({ system: "You are a careful assistant.", messages: ["..."] })
    });
    service.recordAssistantBlock({
      blockIndex: 0,
      blockKind: "text",
      stopReason: "end_turn",
      content: "There are two files: file-a.txt and file-b.txt."
    });
    service.endStep({
      stopReason: "end_turn",
      usage: { inputTokens: 360, outputTokens: 20, cacheRead: 320, cacheWrite: 40 }
    });

    service.endTurn({ reason: "complete", interrupted: false });
    service.sealTurn();
    service.close({ reason: "completed" });

    return { service, sessionId, prepared };
  }

  function sessionEvents(sessionId: string): EvidenceEvent[] {
    const ledger = openLedger(dir);
    try {
      return ledger.getAllEvents().filter((event) => event.session_id === sessionId);
    } finally {
      ledger.close();
    }
  }

  function monitorFingerprint(): string {
    return sha256Hex(
      Buffer.from(readFileSync(join(dir, ".amc", "keys", "monitor_ed25519.pub"), "utf8"), "utf8")
    );
  }

  test("a full open→turn(steps with blocks)→tool→seal→close session verifies as CLOSED", async () => {
    const { sessionId, prepared } = runFullSession();

    const verdict = await verifyLedgerIntegrity(dir);
    expect(verdict.chain.ok, verdict.chain.errors.join("; ")).toBe(true);
    expect(verdict.sessions.closed).toContain(sessionId);
    expect(verdict.sessions.open).not.toContain(sessionId);
    expect(verdict.sessions.interrupted).not.toContain(sessionId);

    // recordRequestHeader is the only mint of a PreparedRequest, and it commits
    // the signed request/header row BEFORE releasing the bytes: the digest it
    // returns is sha256 of exactly those bytes, and the committed row's meta
    // carries the same digest under the same signed event_hash.
    expect(prepared).toBeInstanceOf(PreparedRequest);
    expect(prepared.requestDigest).toBe(sha256Hex(prepared.toBytes()));
    const header = sessionEvents(sessionId).find(
      (event) => event.event_type === "request/header" && event.event_hash === prepared.headerEventHash
    );
    expect(header, "the request/header row exists and is the one the PreparedRequest names").toBeDefined();
    expect((JSON.parse(header!.meta_json) as Record<string, unknown>).requestDigest).toBe(prepared.requestDigest);
  });

  test("the closed session still verifies under an out-of-band trust anchor (no 521f21e7 regression)", async () => {
    const { sessionId } = runFullSession();

    const verdict = await verifyLedgerIntegrity(dir, { expectedMonitorFingerprint: monitorFingerprint() });
    expect(verdict.chain.ok, verdict.chain.errors.join("; ")).toBe(true);
    expect(verdict.trustRoot.anchored).toBe(true);
    expect(verdict.trustRoot.monitorFingerprint).toBe(verdict.trustRoot.expectedFingerprint);
    expect(verdict.sessions.closed).toContain(sessionId);
  });

  test("the per-session envelope chain is intact: seq monotone, prevSessionEventHash linked", () => {
    const { sessionId } = runFullSession();
    const events = sessionEvents(sessionId);

    expect(events.length).toBeGreaterThan(10);

    let expectedSeq = 0;
    let expectedPrev = SESSION_GENESIS;
    for (const event of events) {
      const envelope = extractEnvelope(event.meta_json);
      expect(envelope, `event ${event.id} (${event.event_type}) carries an envelope`).not.toBeNull();
      if (envelope === null) {
        continue;
      }
      expect(envelope.sessionId).toBe(sessionId);
      expect(envelope.seq).toBe(expectedSeq);
      expect(envelope.prevSessionEventHash).toBe(expectedPrev);
      expectedSeq += 1;
      // The next event links to THIS row's global event_hash — the same value the
      // verifier's per-session chain check advances to.
      expectedPrev = event.event_hash;
    }

    const first = events[0]!;
    const last = events[events.length - 1]!;
    expect(first.event_type).toBe("session/open");
    expect(last.event_type).toBe("session/close");
  });

  test("every surface part is the payload of exactly one event (model-visible ⊆ logged)", () => {
    const { sessionId } = runFullSession();
    const events = sessionEvents(sessionId);

    const contentTypes = new Set(["system/prompt", "user/message", "assistant/block", "tool/call", "tool/result"]);
    let contentEvents = 0;
    for (const event of events) {
      const envelope = extractEnvelope(event.meta_json);
      if (envelope === null) {
        continue;
      }
      if (envelope.surface.op === "append") {
        // The invariant by construction: the appended part names this row's payload.
        expect(envelope.surface.part.sha256).toBe(event.payload_sha256);
        expect(contentTypes.has(event.event_type)).toBe(true);
        // Content is blob-backed, never inline, so retention can physically delete it.
        expect(event.payload_inline).toBeNull();
        contentEvents += 1;
      } else {
        expect(envelope.surface.op).toBe("none");
      }
    }
    // system prompt, user message, two assistant blocks, one tool call, one result.
    expect(contentEvents).toBe(6);
  });

  test("a turn/seal commits to its window and links into a seal chain", () => {
    const { sessionId } = runFullSession();
    const events = sessionEvents(sessionId);

    const seal = events.find((event) => event.event_type === "turn/seal");
    expect(seal, "the turn was sealed").toBeDefined();
    const meta = JSON.parse(seal!.meta_json) as Record<string, unknown>;
    expect(meta.seal_chain_index).toBe(0);
    expect(meta.prev_seal_event_id).toBeNull();
    expect(typeof meta.window_merkle_root).toBe("string");
    expect((meta.window_merkle_root as string).length).toBe(64);
    // The window covers turn/start..turn/end for the single turn: user message,
    // two step/start, request/header ×2, assistant ×2, approval ×2, tool call,
    // tool result, two step/end, plus turn/start and turn/end.
    expect(meta.window_event_count).toBe(15);
  });
});
