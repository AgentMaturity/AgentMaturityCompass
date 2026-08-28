import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openAgentSession, type AgentSession } from "../src/agent/agentSession.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { credentialRef } from "../src/credentials/credentialRef.js";
import { openLedger } from "../src/ledger/ledger.js";
import { initWorkspace } from "../src/workspace.js";
import type { EvidenceEvent } from "../src/types.js";
import {
  SESSION_ENVELOPE_META_KEY,
  SESSION_GENESIS,
  type SessionEnvelope
} from "../src/session/sessionTypes.js";
import {
  FixedCredentials,
  LOOP_MODEL,
  LOOP_PROVIDER,
  scriptedAdapter,
  silentTransport,
  textStep
} from "./helpers/agentLoopHarness.js";

/**
 * One session, several prompts.
 *
 * `runComposedTurn` opens and closes a session per call, so a protocol server
 * calling it per incoming prompt would mint a fresh chain each time and turn two
 * would not see turn one. The assertions that matter here are therefore about
 * the LOG: one session id, one `session/open`, one `session/close`, three turns
 * inside it. A test that only checked the returned strings would pass on an
 * implementation that started over every time.
 */

const dirs: string[] = [];
const sessions: AgentSession[] = [];

function workspace(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-agentsession-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  return dir;
}

/** A session whose model answers with the given scripted replies, in order. */
function sessionWith(dir: string, replies: readonly string[]): AgentSession {
  const registry = new AdapterRegistry();
  registry.register({
    providerId: LOOP_PROVIDER,
    adapter: scriptedAdapter(replies.map((reply) => textStep(reply))),
    baseUrl: "https://api.anthropic.invalid",
    credentialRef: credentialRef("AMC_LOOP_TEST_KEY"),
    models: [LOOP_MODEL]
  });
  let clock = 1_000;
  const opened = openAgentSession({
    workspace: dir,
    agentId: "default",
    makeLlm: (session) => new LlmRuntime({
      session,
      credentials: new FixedCredentials(),
      registry,
      transport: silentTransport,
      now: () => (clock += 5)
    }),
    route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: {} },
    systemPrompt: "You are a careful assistant.",
    harnessVersion: "3.2.0",
    compositionDigest: "composition-digest",
    policyDigest: "policy-digest"
  });
  sessions.push(opened);
  return opened;
}

function eventsFor(dir: string, sessionId: string): EvidenceEvent[] {
  return openLedger(dir).db
    .prepare("SELECT * FROM evidence_events WHERE session_id = ? ORDER BY rowid ASC")
    .all(sessionId) as EvidenceEvent[];
}

const typesOf = (events: readonly EvidenceEvent[]) => events.map((e) => e.event_type);

const envelopeOf = (event: EvidenceEvent): SessionEnvelope =>
  (JSON.parse(event.meta_json) as Record<string, SessionEnvelope>)[SESSION_ENVELOPE_META_KEY]!;

afterEach(() => {
  for (const session of sessions.splice(0)) {
    try { session.close(); } catch { /* already closed */ }
  }
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("a session that outlives one prompt", () => {
  it("runs three prompts into one session and one chain", async () => {
    const dir = workspace();
    const session = sessionWith(dir, ["first", "second", "third"]);

    const answers = [
      await session.prompt("one"),
      await session.prompt("two"),
      await session.prompt("three")
    ];
    expect(answers.map((a) => a.ok)).toEqual([true, true, true]);
    session.close();

    const events = eventsFor(dir, session.sessionId);
    const types = typesOf(events);
    // One opening and one closing for the whole conversation, not three of each.
    expect(types.filter((t) => t === "session/open")).toHaveLength(1);
    expect(types.filter((t) => t === "session/close")).toHaveLength(1);
    // Three turns inside that one session.
    expect(types.filter((t) => t === "turn/start")).toHaveLength(3);
    expect(types.filter((t) => t === "turn/end")).toHaveLength(3);
    // And every row belongs to the same session, which is what "one chain" means
    // for a reader: no second sessionId appeared halfway through.
    expect(new Set(events.map((e) => e.session_id)).size).toBe(1);
  });

  it("returns only what each prompt produced", async () => {
    const dir = workspace();
    const session = sessionWith(dir, ["alpha", "beta"]);

    const first = await session.prompt("one");
    const second = await session.prompt("two");
    expect(first.ok && first.text).toBe("alpha");
    // Without the cursor this would be "alpha\nbeta": the summary folds the
    // whole session, so the caller would get the first answer quoted back as
    // though it were the new one.
    expect(second.ok && second.text).toBe("beta");
  });

  it("numbers the turns in order within the one session", async () => {
    const dir = workspace();
    const session = sessionWith(dir, ["a", "b", "c"]);
    for (const text of ["one", "two", "three"]) await session.prompt(text);

    const turns = eventsFor(dir, session.sessionId)
      .filter((e) => e.event_type === "turn/start")
      .map((e) => envelopeOf(e).turn);
    // Numbered by the session, not by the prompt: a per-prompt session would
    // restart at 1 each time.
    expect(turns).toEqual([1, 2, 3]);
  });

  it("chains every row of every prompt into one unbroken session chain", async () => {
    const dir = workspace();
    const session = sessionWith(dir, ["a", "b", "c"]);
    for (const text of ["one", "two", "three"]) await session.prompt(text);
    session.close();

    // The literal claim, rather than a proxy for it: `seq` is per-session and
    // strictly monotone, and each row names the previous row IN THIS SESSION.
    // A fresh session per prompt would reset both.
    const envelopes = eventsFor(dir, session.sessionId).map(envelopeOf);
    expect(envelopes.map((e) => e.seq)).toEqual(envelopes.map((_, index) => index));
    expect(envelopes[0]!.prevSessionEventHash).toBe(SESSION_GENESIS);

    const rows = eventsFor(dir, session.sessionId);
    for (const [index, envelope] of envelopes.entries()) {
      if (index === 0) continue;
      expect(envelope.prevSessionEventHash).toBe(rows[index - 1]!.event_hash);
    }
  });
});

describe("what a session refuses", () => {
  it("refuses a second prompt while one is running", async () => {
    const dir = workspace();
    const session = sessionWith(dir, ["a", "b"]);

    // Not awaited: the second call must be refused while the first is in flight.
    // The driver is serial, and `whenIdle()` resolves on the driver being idle
    // rather than on a particular prompt, so two overlapping callers would each
    // be handed the other's work.
    const first = session.prompt("one");
    const second = await session.prompt("two");
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toContain("already running");
    expect((await first).ok).toBe(true);
  });

  it("accepts a prompt again once the first has finished", async () => {
    const dir = workspace();
    const session = sessionWith(dir, ["a", "b"]);
    expect((await session.prompt("one")).ok).toBe(true);
    // The slot is released in a `finally`, so a refusal is about overlap and
    // never about having been used.
    expect((await session.prompt("two")).ok).toBe(true);
  });

  it("refuses a prompt after close, rather than failing opaquely", async () => {
    const dir = workspace();
    const session = sessionWith(dir, ["a"]);
    session.close();
    const after = await session.prompt("one");
    expect(after.ok).toBe(false);
    if (after.ok) return;
    // A closed SessionService throws "used after close()", which tells a caller
    // nothing it can act on.
    expect(after.reason).toContain("closed");
  });

  it("closes once even when asked twice", async () => {
    const dir = workspace();
    const session = sessionWith(dir, ["a"]);
    await session.prompt("one");
    session.close();
    session.close();
    const closes = typesOf(eventsFor(dir, session.sessionId)).filter((t) => t === "session/close");
    expect(closes).toHaveLength(1);
  });
});

describe("the session it leaves behind", () => {
  it("seals a conversation the ledger can verify", async () => {
    const dir = workspace();
    const session = sessionWith(dir, ["a", "b"]);
    await session.prompt("one");
    await session.prompt("two");
    session.close();

    const { verifyLedgerIntegrity } = await import("../src/ledger/ledger.js");
    const verdict = await verifyLedgerIntegrity(dir);
    expect(verdict.errors).toEqual([]);
    expect(verdict.ok).toBe(true);
  });
});
