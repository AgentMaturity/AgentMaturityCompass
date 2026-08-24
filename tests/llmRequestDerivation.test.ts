import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { SessionService } from "../src/session/sessionService.js";
import type { PreparedRequest } from "../src/session/sessionService.js";
import { parseRequestHeaderMeta } from "../src/session/requestHeaderMeta.js";
import { loadBlobPlaintext } from "../src/storage/blobs/blobStore.js";
import { sha256Hex } from "../src/utils/hash.js";
import {
  ANTHROPIC_MESSAGES_ENCODER_ID,
  RequestEncoderRegistry,
  canonicalToolSchemaBytes,
  deriveSessionRequests,
  prepareRequest,
  type ToolSchema
} from "../src/llm/index.js";
import type { EvidenceEvent } from "../src/types.js";

// P3.1 VERIFY-3 — "a recorded request reconstructs BYTE-IDENTICALLY from the
// session log". The claim under test is deliberately narrow and total: given a
// workspace, a session id and one event id, and NOTHING the sending process kept
// in memory, the exact transmitted bytes come back and hash to the digest that
// was signed before they were released.
//
// Two things these tests exist to prevent, both of which would let the clause be
// faked. First, a derivation that is handed the bytes it is meant to rebuild —
// hence the round trip reads through a fresh read-only store after the session is
// closed. Second, a derivation that reports every impossibility the same way —
// hence separate tests pinning that a retention prune, a vanished blob and an
// altered row produce three DIFFERENT verdicts.

const TOOLS: readonly ToolSchema[] = [
  {
    name: "shell",
    description: "Run one shell command in the workspace",
    parameters: {
      type: "object",
      properties: { command: { type: "string", description: "the command" } },
      required: ["command"]
    }
  }
];

interface RecordedSession {
  readonly sessionId: string;
  readonly prepared: readonly PreparedRequest[];
  readonly systemA: string;
  readonly systemB: string;
  readonly userMessageId: string;
}

describe("P3.1 — a recorded request reconstructs byte-identically from the session log", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "amc-llm-derive-"));
    initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /**
   * A realistic two-step turn: a tool-using request, then a follow-up request
   * whose history contains the tool call and its result.
   *
   * Two details are load-bearing rather than decorative. A SECOND system prompt
   * is recorded so the tamper test can repoint the header at a different but
   * structurally valid row. And both assistant blocks use `blockIndex: 0`, so the
   * slot `assistant:0` recurs — the surface fold appends a new position for each
   * (slot identity only governs replace/retract), and derivation must therefore
   * see both, in order, not one collapsed entry.
   */
  function runSession(): RecordedSession {
    const service = new SessionService(dir);
    service.open({
      agentId: "default",
      harnessVersion: "3.1.0",
      compositionDigest: sha256Hex("composition"),
      policyDigest: sha256Hex("policy")
    });
    const sessionId = service.sessionId;
    const systemA = service.recordSystemPrompt("You are a careful assistant.");
    const systemB = service.recordSystemPrompt("You are a reckless assistant.");

    service.startTurn({ trigger: "user" });
    const userMessage = service.recordUserMessage("List the files, then read the first one.");

    service.startStep();
    const first = prepareRequest(service, {
      model: "claude-opus-4-8",
      providerId: "anthropic",
      encoderId: ANTHROPIC_MESSAGES_ENCODER_ID,
      encoderVersion: 1,
      params: { max_tokens: 1024, temperature: 0 },
      systemPromptEventId: systemA.eventId,
      tools: TOOLS
    });
    service.recordAssistantBlock({
      blockIndex: 0,
      blockKind: "text",
      stopReason: null,
      content: "I'll list the directory first."
    });
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

    service.startStep();
    const second = prepareRequest(service, {
      model: "claude-opus-4-8",
      providerId: "anthropic",
      encoderId: ANTHROPIC_MESSAGES_ENCODER_ID,
      encoderVersion: 1,
      params: { max_tokens: 1024, temperature: 0 },
      systemPromptEventId: systemA.eventId,
      tools: TOOLS
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

    service.endTurn({ reason: "complete" });
    service.sealTurn();
    service.close({ reason: "completed" });

    return {
      sessionId,
      prepared: [first, second],
      systemA: systemA.eventId,
      systemB: systemB.eventId,
      userMessageId: userMessage.eventId
    };
  }

  function sessionEvents(sessionId: string): EvidenceEvent[] {
    const ledger = openLedger(dir);
    try {
      return ledger.getAllEvents().filter((event) => event.session_id === sessionId);
    } finally {
      ledger.close();
    }
  }

  /** A raw handle with the append-only triggers removed — a tamperer's view. */
  function openRaw(): Database.Database {
    const db = new Database(join(dir, ".amc", "evidence.sqlite"));
    for (const trigger of ["protect_evidence_immutable", "no_delete_evidence", "no_update_evidence"]) {
      db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
    }
    return db;
  }

  test("both recorded requests rebuild byte-identically from the closed log", () => {
    const recorded = runSession();

    // Derivation opens its OWN read-only store: nothing from the sending
    // SessionService is in scope, and the service has already been closed.
    const derivations = deriveSessionRequests({ workspace: dir, sessionId: recorded.sessionId });
    expect(derivations).toHaveLength(2);

    derivations.forEach((derivation, index) => {
      const prepared = recorded.prepared[index]!;
      expect(derivation.status, derivation.detail ?? "").toBe("reconstructed");
      expect(derivation.inconsistencies).toEqual([]);
      expect(derivation.bytes).not.toBeNull();
      // THE CLAUSE: byte-identical, not merely equivalent.
      expect(Buffer.compare(derivation.bytes!, prepared.toBytes())).toBe(0);
      // And the rebuilt bytes hash to the digest committed BEFORE they were sent.
      expect(derivation.derivedDigest).toBe(prepared.requestDigest);
      expect(derivation.recordedDigest).toBe(prepared.requestDigest);
    });

    // The bytes are a real request, not an empty envelope that trivially matches.
    const body = JSON.parse(derivations[1]!.bytes!.toString("utf8")) as Record<string, unknown>;
    expect(body.model).toBe("claude-opus-4-8");
    expect(body.system).toBe("You are a careful assistant.");
    expect(Array.isArray(body.tools)).toBe(true);
    const messages = body.messages as Array<{ role: string; content: Array<{ type: string }> }>;
    // user question · assistant(text + tool_use) · user(tool_result): the second
    // request's history really does carry the first step's tool exchange.
    expect(messages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
    expect(messages[1]!.content.map((block) => block.type)).toEqual(["text", "tool_use"]);
    expect(messages[2]!.content.map((block) => block.type)).toEqual(["tool_result"]);
  });

  test("the tool-schema digest names a durable row whose payload is the exact schema bytes", () => {
    const recorded = runSession();
    const events = sessionEvents(recorded.sessionId);

    const toolRows = events.filter((event) => event.event_type === "request/tools");
    expect(toolRows.length).toBe(2);

    const headers = events.filter((event) => event.event_type === "request/header");
    for (const header of headers) {
      const meta = parseRequestHeaderMeta(header.meta_json);
      expect(meta).not.toBeNull();
      const referenced = toolRows.find((row) => row.id === meta!.toolSchemaEventId);
      expect(referenced, "the header's toolSchemaEventId names a request/tools row").toBeDefined();
      // The digest that used to name nothing now names this row's payload...
      expect(meta!.toolSchemaSha256).toBe(referenced!.payload_sha256);
      // ...and those bytes are the schema, retrievable from the blob store.
      const bytes = loadBlobPlaintext(dir, referenced!.payload_path!).bytes;
      expect(Buffer.compare(bytes, canonicalToolSchemaBytes(TOOLS))).toBe(0);
      // Content-bearing, but out of the conversation surface: a tool schema is
      // part of the request envelope, and appending it to the surface would make
      // the encoder emit it twice.
      expect(header.payload_path).toBeNull();
      expect(JSON.parse(referenced!.meta_json).amcSession.surface.op).toBe("none");
    }
  });

  // NEGATIVE — delete `assertToolSchemaCommitted` from recordRequestHeader and all
  // three of these stop throwing, which is precisely the state the field was in
  // before: a digest with no durable referent, checkable by nobody.
  describe("a tool-schema commitment that no logged row backs is refused", () => {
    function openSession(): { service: SessionService; systemPromptId: string; userMessageId: string } {
      const service = new SessionService(dir);
      service.open({
        agentId: "default",
        harnessVersion: "3.1.0",
        compositionDigest: sha256Hex("composition"),
        policyDigest: sha256Hex("policy")
      });
      const systemPrompt = service.recordSystemPrompt("You are a careful assistant.");
      service.startTurn({ trigger: "user" });
      const userMessage = service.recordUserMessage("hello");
      service.startStep();
      return { service, systemPromptId: systemPrompt.eventId, userMessageId: userMessage.eventId };
    }

    function header(service: SessionService, systemPromptId: string, toolSchema: { eventId: string; payloadSha256: string }) {
      return () =>
        service.recordRequestHeader({
          model: "m",
          providerId: "anthropic",
          params: {},
          encoderId: ANTHROPIC_MESSAGES_ENCODER_ID,
          encoderVersion: 1,
          systemPromptEventId: systemPromptId,
          toolSchema,
          projectionCutoffEventId: systemPromptId,
          projectionDigest: sha256Hex("p"),
          sourceEventIds: [systemPromptId],
          requestBytes: "{}"
        });
    }

    test("an event id that is not in this session", () => {
      const { service, systemPromptId } = openSession();
      expect(
        header(service, systemPromptId, { eventId: "not-an-event", payloadSha256: sha256Hex("x") })
      ).toThrow(/not an event of session/);
    });

    test("a row of the wrong type", () => {
      const { service, systemPromptId, userMessageId } = openSession();
      expect(
        header(service, systemPromptId, { eventId: userMessageId, payloadSha256: sha256Hex("x") })
      ).toThrow(/not request\/tools/);
    });

    test("a digest that is not the named row's payload", () => {
      const { service, systemPromptId } = openSession();
      const tools = service.recordToolSchema(canonicalToolSchemaBytes(TOOLS));
      expect(
        header(service, systemPromptId, { eventId: tools.eventId, payloadSha256: sha256Hex("something else") })
      ).toThrow(/commits tool schema digest/);
    });
  });

  test("a lawfully pruned payload reports PRUNED, never a digest mismatch", () => {
    const recorded = runSession();
    const events = sessionEvents(recorded.sessionId);
    const userRow = events.find((event) => event.id === recorded.userMessageId)!;

    // What retention does: mark the row pruned and unlink the blob.
    const db = openRaw();
    try {
      db.prepare("UPDATE evidence_events SET payload_pruned = 1, payload_pruned_ts = ? WHERE id = ?").run(
        Date.now(),
        userRow.id
      );
    } finally {
      db.close();
    }
    rmSync(join(dir, userRow.payload_path!), { force: true });

    const derivations = deriveSessionRequests({ workspace: dir, sessionId: recorded.sessionId });
    for (const derivation of derivations) {
      expect(derivation.status).toBe("payload-pruned");
      // The distinction this test exists for: a deletion someone was entitled to
      // perform must not read as evidence of tampering.
      expect(derivation.status).not.toBe("digest-mismatch");
      expect(derivation.detail).toContain(userRow.id);
      expect(derivation.bytes).toBeNull();
    }
  });

  test("a payload that vanished WITHOUT a prune record reports MISSING, not pruned", () => {
    const recorded = runSession();
    const events = sessionEvents(recorded.sessionId);
    const userRow = events.find((event) => event.id === recorded.userMessageId)!;

    rmSync(join(dir, userRow.payload_path!), { force: true });

    const derivations = deriveSessionRequests({ workspace: dir, sessionId: recorded.sessionId });
    for (const derivation of derivations) {
      expect(derivation.status).toBe("payload-missing");
      expect(derivation.detail).toContain("no prune record");
    }
  });

  test("a log repointed at different content fails derivation with a digest mismatch", () => {
    const recorded = runSession();
    const events = sessionEvents(recorded.sessionId);
    const headerRow = events.find((event) => event.event_type === "request/header")!;

    // Substitute the content: the header now names the OTHER system prompt. The
    // row stays structurally valid — it still points at a real `system/prompt`
    // event — so nothing but rebuilding the bytes can catch it.
    const db = openRaw();
    try {
      db.prepare("UPDATE evidence_events SET meta_json = ? WHERE id = ?").run(
        headerRow.meta_json.split(recorded.systemA).join(recorded.systemB),
        headerRow.id
      );
    } finally {
      db.close();
    }

    const derivation = deriveSessionRequests({ workspace: dir, sessionId: recorded.sessionId })[0]!;
    expect(derivation.status).toBe("digest-mismatch");
    expect(derivation.derivedDigest).not.toBe(derivation.recordedDigest);
    expect(derivation.recordedDigest).toBe(recorded.prepared[0]!.requestDigest);
    // The bytes are still returned so an operator can diff them against a copy.
    expect(derivation.bytes).not.toBeNull();
  });

  test("a header naming a non-system/prompt row as its system text is unreconstructable, not a mismatch", () => {
    const recorded = runSession();
    const events = sessionEvents(recorded.sessionId);
    const headerRow = events.find((event) => event.event_type === "request/header")!;

    const db = openRaw();
    try {
      db.prepare("UPDATE evidence_events SET meta_json = ? WHERE id = ?").run(
        headerRow.meta_json.split(recorded.systemA).join(recorded.userMessageId),
        headerRow.id
      );
    } finally {
      db.close();
    }

    const derivation = deriveSessionRequests({ workspace: dir, sessionId: recorded.sessionId })[0]!;
    expect(derivation.status).toBe("unreconstructable");
    expect(derivation.detail).toContain("user/message");
  });

  // The `projectionDigest` and `sourceEventIds` fields describe WHICH rows
  // composed the request. They can break while the bytes still reconstruct — a
  // header whose byte digest is right but whose source list is wrong would
  // mislead the next reader — so that case gets its own verdict rather than
  // being rounded up to a pass or down to a tamper alarm.
  test("a header whose projection commitment is wrong reconstructs but reports evidence-inconsistent", () => {
    const recorded = runSession();
    const events = sessionEvents(recorded.sessionId);
    const headerRow = events.find((event) => event.event_type === "request/header")!;
    const meta = parseRequestHeaderMeta(headerRow.meta_json)!;

    const db = openRaw();
    try {
      db.prepare("UPDATE evidence_events SET meta_json = ? WHERE id = ?").run(
        headerRow.meta_json.split(meta.projectionDigest).join(sha256Hex("a different history")),
        headerRow.id
      );
    } finally {
      db.close();
    }

    const derivation = deriveSessionRequests({ workspace: dir, sessionId: recorded.sessionId })[0]!;
    expect(derivation.status).toBe("evidence-inconsistent");
    // The bytes are still exactly right — the digest check passes.
    expect(derivation.derivedDigest).toBe(recorded.prepared[0]!.requestDigest);
    expect(Buffer.compare(derivation.bytes!, recorded.prepared[0]!.toBytes())).toBe(0);
    expect(derivation.inconsistencies.join(" ")).toContain("projectionDigest");
  });

  // NEGATIVE for the encoder-identity rule. Drop `encoderId`/`encoderVersion`
  // from the header and derivation has to guess which function produced the
  // bytes; pinning the pair is what makes "run the same encoder" checkable.
  test("a request recorded under an encoder the verifier does not have is unreconstructable", () => {
    const recorded = runSession();
    const derivations = deriveSessionRequests({
      workspace: dir,
      sessionId: recorded.sessionId,
      encoders: new RequestEncoderRegistry()
    });
    for (const derivation of derivations) {
      expect(derivation.status).toBe("unreconstructable");
      expect(derivation.detail).toContain(`${ANTHROPIC_MESSAGES_ENCODER_ID}@1`);
      // Not silently reported as a mismatch: the bytes were never rebuilt, so
      // there is nothing to say about whether they agree with the digest.
      expect(derivation.derivedDigest).toBeNull();
    }
  });
});
