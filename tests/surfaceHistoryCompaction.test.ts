import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { verifySessionChains } from "../src/ledger/sessionVerification.js";
import { openLedger } from "../src/ledger/ledger.js";
import { ANTHROPIC_MESSAGES_ENCODER_ID, prepareRequest } from "../src/llm/index.js";
import { sha256Hex } from "../src/utils/hash.js";

/**
 * Compacting CONVERSATION history (plan P6.3).
 *
 * `compactToolResult` shipped first because tool results are the easy half:
 * their slot, `tool_result:<callId>`, is unique, so slot addressing reaches
 * them. Conversation slots are not -- "user" names every user message ever
 * appended, `assistant:0` the first block of every response -- so slot-addressed
 * replace/retract can only ever reach the MOST RECENT turn, and history is
 * precisely the part that is not recent.
 *
 * These tests are about the other half: addressing an old entry by the event
 * that created it, and doing so without ever editing the log. Large tool
 * outputs are already shortened for the model by the spill policy before they
 * are ever recorded, so conversation history is where the remaining context
 * pressure lives.
 */
const PASS = "history-compaction-test-passphrase";
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-history-compact-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

function openSession(dir: string): SessionService {
  const session = new SessionService(dir);
  session.open({
    agentId: "payments-agent",
    harnessVersion: "3.2.0",
    compositionDigest: sha256Hex("composition"),
    policyDigest: sha256Hex("policy")
  });
  return session;
}

/** One user/assistant exchange, with no tool use. */
function chatTurn(session: SessionService, ask: string, answer: string): { user: string; assistant: string } {
  session.startTurn({ trigger: "user" });
  const user = session.recordUserMessage(ask);
  session.startStep();
  const assistant = session.recordAssistantBlock({
    blockIndex: 0,
    blockKind: "text",
    stopReason: "end_turn",
    content: answer
  });
  session.endStep({ stopReason: "end_turn", usage: null });
  session.endTurn({ reason: "complete" });
  // `endTurn` records the end; `sealTurn` is what closes the turn window and
  // lets the next `startTurn` open one.
  session.sealTurn();
  return { user: user.eventId, assistant: assistant.eventId };
}

/** A turn that calls one tool and gets a result back. */
function toolTurn(session: SessionService, callId: string, output: string): { result: string } {
  session.startTurn({ trigger: "user" });
  session.recordUserMessage("read the ledger");
  session.startStep();
  session.recordToolCall({
    toolCallId: callId,
    toolName: "fs.read",
    dispatch: "native",
    parentToken: null,
    args: "{}"
  });
  const result = session.recordToolResult({
    toolCallId: callId,
    outcome: "OK",
    exitCode: 0,
    timedOut: false,
    denied: false,
    content: output
  });
  session.endStep({ stopReason: "tool_use", usage: null });
  session.endTurn({ reason: "complete" });
  session.sealTurn();
  return { result: result.eventId };
}

/** Every part sha on the surface, in order. */
function surfaceShas(session: SessionService): readonly string[] {
  return session.projectHistory().flatMap((message) => message.parts.map((part) => part.sha256));
}

const rowCount = (dir: string, sessionId: string): number => {
  const db = new Database(join(dir, ".amc", "evidence.sqlite"), { readonly: true });
  try {
    return (
      db.prepare("SELECT COUNT(*) n FROM evidence_events WHERE session_id = ?").get(sessionId) as { n: number }
    ).n;
  } finally {
    db.close();
  }
};

/** The request the model would actually be sent, decoded. */
function requestBody(session: SessionService, systemPromptEventId: string): {
  messages: {
    role: string;
    content: { type: string; text?: string; is_error?: boolean; content?: { type: string; text: string }[] }[];
  }[];
} {
  const prepared = prepareRequest(session, {
    model: "claude-opus-4-8",
    providerId: "anthropic",
    encoderId: ANTHROPIC_MESSAGES_ENCODER_ID,
    encoderVersion: 1,
    params: { max_tokens: 1024, temperature: 0 },
    systemPromptEventId,
    tools: []
  });
  return JSON.parse(prepared.toBytes().toString("utf8"));
}

describe("the surface tells a pruner what it may address", () => {
  it("names an origin event for every live entry", () => {
    const dir = workspace();
    const session = openSession(dir);
    const first = chatTurn(session, "what is the balance?", "It is 412 EUR.");
    const second = chatTurn(session, "and yesterday?", "It was 380 EUR.");

    const live = session.liveSurfaceEntries();

    expect(live.map((entry) => entry.originEventId), "in surface order, one per live entry").toEqual([
      first.user,
      first.assistant,
      second.user,
      second.assistant
    ]);
    expect(live.map((entry) => entry.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(live.map((entry) => entry.kind)).toEqual(["text", "text", "text", "text"]);
    session.close({ reason: "completed" });
  });

  it("drops an entry from the listing once it is retracted", () => {
    const dir = workspace();
    const session = openSession(dir);
    const first = chatTurn(session, "what is the balance?", "It is 412 EUR.");
    chatTurn(session, "and yesterday?", "It was 380 EUR.");

    session.dropSurfaceEntry({ originEventId: first.assistant, reason: "superseded" });

    expect(session.liveSurfaceEntries().map((entry) => entry.originEventId))
      .not.toContain(first.assistant);
    session.close({ reason: "completed" });
  });
});

describe("an old turn's message can be compacted", () => {
  it("replaces the FIRST turn's user message, not the most recent one", () => {
    // The defect this whole change exists to fix: `replace` on slot "user"
    // resolves to the last occurrence, so turn one was unreachable.
    const dir = workspace();
    const session = openSession(dir);
    const first = chatTurn(session, "here is a very long problem statement ".repeat(40), "Understood.");
    chatTurn(session, "now do it", "Done.");
    const before = surfaceShas(session);

    session.compactSurfaceEntry({
      originEventId: first.user,
      replacement: "[summary: user described a long problem]",
      replacedBytes: 1_520,
      reason: "context pressure"
    });
    const after = surfaceShas(session);

    expect(after[0], "turn one's user message now points at the summary")
      .toBe(createHash("sha256").update("[summary: user described a long problem]").digest("hex"));
    expect(after.slice(1), "and nothing else moved").toEqual(before.slice(1));
    session.close({ reason: "completed" });
  });

  it("puts the summary in the request the model is actually sent", () => {
    // The projection carries references, not bytes. What matters is which bytes
    // request derivation resolves, so this asserts on the encoded request.
    const dir = workspace();
    const session = openSession(dir);
    const systemPrompt = session.recordSystemPrompt("You are a careful assistant.");
    const first = chatTurn(session, "the original long question", "Understood.");
    chatTurn(session, "now do it", "Done.");

    session.compactSurfaceEntry({
      originEventId: first.user,
      replacement: "[summary]",
      replacedBytes: 1_000,
      reason: "context pressure"
    });

    session.startTurn({ trigger: "user" });
    session.startStep();
    const body = requestBody(session, systemPrompt.eventId);

    const texts = body.messages.flatMap((message) => message.content.map((part) => part.text));
    expect(texts, "the summary is sent").toContain("[summary]");
    expect(texts, "the original is not").not.toContain("the original long question");
    session.close({ reason: "completed" });
  });

  it("grows the log rather than editing it", () => {
    const dir = workspace();
    const session = openSession(dir);
    const first = chatTurn(session, "the original long question", "Understood.");
    chatTurn(session, "now do it", "Done.");
    const sessionId = session.sessionId;
    const before = rowCount(dir, sessionId);

    session.compactSurfaceEntry({
      originEventId: first.user,
      replacement: "[summary]",
      replacedBytes: 1_000,
      reason: "context pressure"
    });

    expect(rowCount(dir, sessionId), "exactly one row added, none removed").toBe(before + 1);
    session.close({ reason: "completed" });
  });

  it("points the surface at the compaction row's own payload", () => {
    // The SurfacePartRef invariant: a projected part's sha256 IS some logged
    // row's payload_sha256. After a compaction that row is the compaction.
    const dir = workspace();
    const session = openSession(dir);
    const first = chatTurn(session, "the original long question", "Understood.");
    chatTurn(session, "now do it", "Done.");

    const ref = session.compactSurfaceEntry({
      originEventId: first.user,
      replacement: "[summary]",
      replacedBytes: 1_000,
      reason: "context pressure"
    });

    expect(surfaceShas(session)[0], "the surface points at the row the writer returned")
      .toBe(ref.payloadSha256);
    expect(ref.payloadSha256, "which is the replacement's bytes")
      .toBe(createHash("sha256").update("[summary]").digest("hex"));
    session.close({ reason: "completed" });
  });

  it("can compact the same position twice", () => {
    // A pruner runs repeatedly over a long session. If the second pass could not
    // find a position it had already compacted, compaction would be one-shot.
    const dir = workspace();
    const session = openSession(dir);
    const first = chatTurn(session, "the original long question", "Understood.");
    chatTurn(session, "now do it", "Done.");

    session.compactSurfaceEntry({
      originEventId: first.user, replacement: "[summary of the question]", replacedBytes: 1_000, reason: "pressure"
    });
    session.compactSurfaceEntry({
      originEventId: first.user, replacement: "[shorter]", replacedBytes: 25, reason: "more pressure"
    });

    expect(surfaceShas(session)[0])
      .toBe(createHash("sha256").update("[shorter]").digest("hex"));
    session.close({ reason: "completed" });
  });

  it("leaves the per-session hash chain intact", () => {
    const dir = workspace();
    const session = openSession(dir);
    const first = chatTurn(session, "the original long question", "Understood.");
    chatTurn(session, "now do it", "Done.");
    session.compactSurfaceEntry({
      originEventId: first.user, replacement: "[summary]", replacedBytes: 1_000, reason: "pressure"
    });
    session.dropSurfaceEntry({ originEventId: first.assistant, reason: "pruned" });
    session.close({ reason: "completed" });

    const errors: string[] = [];
    const ledger = openLedger(dir);
    try {
      verifySessionChains(ledger, errors);
    } finally {
      ledger.close();
    }

    expect(errors, "a compacted session still verifies").toEqual([]);
  });
});

describe("an old entry can be dropped outright", () => {
  it("removes it from the surface while the log keeps it", () => {
    const dir = workspace();
    const session = openSession(dir);
    const first = chatTurn(session, "stale context", "stale answer");
    const second = chatTurn(session, "current question", "current answer");
    const sessionId = session.sessionId;
    const before = rowCount(dir, sessionId);

    session.dropSurfaceEntry({ originEventId: first.user, reason: "pruned" });
    session.dropSurfaceEntry({ originEventId: first.assistant, reason: "pruned" });

    expect(session.liveSurfaceEntries().map((entry) => entry.originEventId), "only turn two survives")
      .toEqual([second.user, second.assistant]);
    expect(rowCount(dir, sessionId), "two rows added, none removed").toBe(before + 2);
    session.close({ reason: "completed" });
  });
});

describe("compacting a tool result keeps it a tool result", () => {
  it("preserves the part kind and the call it answers", () => {
    // A tool_result that turned into a text part would leave the model with a
    // tool_use no result ever answered -- providers reject that outright.
    const dir = workspace();
    const session = openSession(dir);
    const systemPrompt = session.recordSystemPrompt("You are a careful assistant.");
    const turn = toolTurn(session, "call-1", "x".repeat(4_000));

    session.compactSurfaceEntry({
      originEventId: turn.result,
      replacement: "[compacted: 4000 bytes of fs.read output]",
      replacedBytes: 4_000,
      reason: "context pressure"
    });

    session.startTurn({ trigger: "user" });
    session.startStep();
    const body = requestBody(session, systemPrompt.eventId);
    const toolResults = body.messages.flatMap((message) =>
      message.content.filter((part) => part.type === "tool_result"));

    expect(toolResults, "still exactly one tool_result part").toHaveLength(1);
    expect(toolResults[0]?.content?.[0]?.text, "carrying the replacement")
      .toBe("[compacted: 4000 bytes of fs.read output]");
    session.close({ reason: "completed" });
  });

  it("does not turn a successful result into an error", () => {
    // `toPart` derives is_error from the row's recorded `outcome`. A compaction
    // row that records no outcome reads back as "not OK", which would tell the
    // model a tool that succeeded had failed.
    const dir = workspace();
    const session = openSession(dir);
    const systemPrompt = session.recordSystemPrompt("You are a careful assistant.");
    const turn = toolTurn(session, "call-1", "x".repeat(4_000));

    session.compactSurfaceEntry({
      originEventId: turn.result, replacement: "[compacted]", replacedBytes: 4_000, reason: "pressure"
    });

    session.startTurn({ trigger: "user" });
    session.startStep();
    const body = requestBody(session, systemPrompt.eventId);
    const toolResult = body.messages
      .flatMap((message) => message.content)
      .find((part) => part.type === "tool_result");

    expect(toolResult?.is_error, "the tool succeeded, and still did").toBe(false);
    session.close({ reason: "completed" });
  });
});

describe("compaction refuses what it cannot do honestly", () => {
  it("refuses an origin that is not on the surface", () => {
    // An origin-addressed op against an absent entry is a silent no-op in the
    // projection, so without this the caller would be told a compaction happened
    // and the model would see no change.
    const dir = workspace();
    const session = openSession(dir);
    chatTurn(session, "hello", "hi");

    expect(() => session.compactSurfaceEntry({
      originEventId: "evt-never-existed",
      replacement: "[summary]",
      replacedBytes: 1_000,
      reason: "pressure"
    })).toThrow(/evt-never-existed/);
    session.close({ reason: "completed" });
  });

  it("refuses an entry that was already dropped", () => {
    const dir = workspace();
    const session = openSession(dir);
    const first = chatTurn(session, "stale", "stale answer");
    chatTurn(session, "current", "current answer");
    session.dropSurfaceEntry({ originEventId: first.user, reason: "pruned" });

    expect(() => session.compactSurfaceEntry({
      originEventId: first.user, replacement: "[summary]", replacedBytes: 1_000, reason: "pressure"
    })).toThrow(/surface/);
    session.close({ reason: "completed" });
  });

  it("refuses a replacement that is not smaller", () => {
    const dir = workspace();
    const session = openSession(dir);
    const first = chatTurn(session, "tiny", "answer");

    expect(() => session.compactSurfaceEntry({
      originEventId: first.user,
      replacement: "a much longer replacement than the original ever was",
      replacedBytes: 4,
      reason: "pressure"
    })).toThrow(/smaller/i);
    session.close({ reason: "completed" });
  });

  it("refuses to drop an entry that is not on the surface", () => {
    const dir = workspace();
    const session = openSession(dir);
    chatTurn(session, "hello", "hi");

    expect(() => session.dropSurfaceEntry({ originEventId: "evt-never-existed", reason: "pruned" }))
      .toThrow(/evt-never-existed/);
    session.close({ reason: "completed" });
  });
});
