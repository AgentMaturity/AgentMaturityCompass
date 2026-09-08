import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, test } from "vitest";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { verifySessionChains } from "../src/ledger/sessionVerification.js";
import { openLedger } from "../src/ledger/ledger.js";
import { deriveRecordedRequest } from "../src/llm/request/deriveRequest.js";
import { readAgentRunSummary, verifyAgentRun } from "../src/agent/runReport.js";
import { extractEnvelope } from "../src/session/sessionTypes.js";
import { initWorkspace } from "../src/workspace.js";
import { lockVault } from "../src/vault/vault.js";
import { sha256Hex } from "../src/utils/hash.js";
import { bodyFromChunks } from "../src/llm/adapter/transport.js";
import type { HttpResponse, HttpTransport } from "../src/llm/adapter/transport.js";
import type { EvidenceEvent } from "../src/types.js";
import {
  loopHarness,
  ok,
  recordingRetryRuntime,
  StubToolSeam,
  textStep,
  toolStep,
  type LoopHarness
} from "./helpers/agentLoopHarness.js";

/**
 * P3.2 VERIFY-4 — "the whole run is reconstructable and signed".
 *
 * The run under test is deliberately the messy one: a multi-step turn that calls
 * a tool, plus a step whose first request was rate-limited and retried. Those are
 * exactly the shapes that could break reconstruction — a retried step has two
 * headers, and a tool round-trip puts rows into the projected history that the
 * NEXT request is assembled from.
 *
 * Three claims, each checked against the evidence rather than against the driver:
 *
 *   1. nothing is unsigned — no row carries the literal "unsigned";
 *   2. the chains hold — `verifySessionChains` reports no errors, and the
 *      workspace-wide chain verdict is ok;
 *   3. every request derives BYTE-IDENTICALLY from the log alone.
 *
 * The last two tests are the negative half, and they matter more than the first
 * three: an integrity assertion that cannot fail is not an assertion. One runs
 * the same check over an UNSIGNED workspace and requires it to fail; the other
 * edits a payload byte in the database and requires derivation to notice.
 */
describe("P3.2 — the run reconstructs and is signed", () => {
  const open: LoopHarness[] = [];

  afterEach(() => {
    while (open.length > 0) {
      const harness = open.pop();
      if (harness === undefined) continue;
      try {
        harness.finish();
      } catch {
        // Already closed. Cleanup, not an assertion.
      }
      rmSync(harness.dir, { recursive: true, force: true });
    }
  });

  /** Answer the Nth dispatch with a 429; everything else succeeds. */
  function rateLimitOnce(dispatchToFail: number): HttpTransport {
    let seen = 0;
    return async (): Promise<HttpResponse> => {
      seen += 1;
      if (seen === dispatchToFail) {
        return {
          status: 429,
          headers: { "content-type": "application/json", "retry-after": "1" },
          body: bodyFromChunks(['{"error":{"type":"rate_limit_error","message":"slow down"}}'])
        };
      }
      return {
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: bodyFromChunks([])
      };
    };
  }

  /**
   * A turn that uses everything: a tool round-trip AND a retried request.
   *
   * Dispatch order: 1 → tool call, 2 → 429 (retried), 3 → final text. So step 2
   * holds two headers, and its second request was assembled from a history that
   * already contains the tool call and its result.
   */
  function messyRun(): LoopHarness {
    const harness = loopHarness({
      scripts: [toolStep("call-1", "echo", '{"text":"ping"}'), textStep("done")],
      transport: rateLimitOnce(2),
      tools: new StubToolSeam({ echo: async () => ok("pong") }),
      retryRuntime: recordingRetryRuntime()
    });
    open.push(harness);
    return harness;
  }

  const rowsOf = (events: readonly EvidenceEvent[], type: string): EvidenceEvent[] =>
    events.filter((event) => event.event_type === type);

  test("a multi-step, tool-calling, retried turn leaves no unsigned row and no chain error", async () => {
    const harness = messyRun();
    harness.driver.followup("say hello");
    await harness.driver.whenIdle();
    harness.finish();

    const summary = readAgentRunSummary(harness.dir, harness.sessionId, harness.driver.status);
    // The run really was the messy one: two steps, three requests, one tool call.
    expect(summary.steps).toBe(2);
    expect(summary.requests).toBe(3);
    expect(summary.retried).toBe(1);
    expect(summary.toolCalls).toBe(1);
    expect(summary.endings.map((ending) => ending.reason)).toEqual(["complete"]);

    // 1 — nothing unsigned.
    expect(summary.unsignedRows).toBe(0);
    for (const event of harness.events()) {
      expect(event.writer_sig, `row ${event.id} (${event.event_type}) is unsigned`).not.toBe("unsigned");
      expect(event.writer_sig.length).toBeGreaterThan(0);
    }

    // 2 — the chains hold.
    const chainErrors: string[] = [];
    const ledger = openLedger(harness.dir);
    try {
      verifySessionChains(ledger, chainErrors);
    } finally {
      ledger.close();
    }
    expect(chainErrors).toEqual([]);
    const verdict = await verifyLedgerIntegrity(harness.dir);
    expect(verdict.chain.errors).toEqual([]);
    expect(verdict.chain.ok).toBe(true);
  });

  test("every request derives byte-identically from the log alone", async () => {
    const harness = messyRun();
    harness.driver.followup("say hello");
    await harness.driver.whenIdle();
    harness.finish();

    const events = harness.events();
    const headers = rowsOf(events, "request/header");
    expect(headers).toHaveLength(3);

    for (const header of headers) {
      const derived = deriveRecordedRequest({
        workspace: harness.dir,
        events,
        headerEventId: header.id
      });
      expect(derived.status, `${header.id}: ${derived.detail ?? ""}`).toBe("reconstructed");
      expect(derived.inconsistencies).toEqual([]);
      expect(derived.bytes).not.toBeNull();
      // Byte-identical is the claim, so it is checked as bytes and not as a
      // status word: the recorded digest is a commitment to THESE bytes.
      expect(sha256Hex(derived.bytes!)).toBe(derived.recordedDigest);
    }

    // The two headers of the RETRIED step must reconstruct to the same bytes.
    // A retry is the same question asked again; if the second attempt encoded
    // something different, the log would be recording two questions in a place
    // that claims one.
    const retriedStep = headers.filter((header) => extractEnvelope(header.meta_json)?.step === 2);
    expect(retriedStep).toHaveLength(2);
    const [first, second] = retriedStep.map(
      (header) => deriveRecordedRequest({ workspace: harness.dir, events, headerEventId: header.id }).bytes
    );
    expect(first).not.toBeNull();
    expect(Buffer.compare(first!, second!)).toBe(0);
  });

  test("the operator's verify command reports the same verdict, request by request", async () => {
    const harness = messyRun();
    harness.driver.followup("say hello");
    await harness.driver.whenIdle();
    harness.finish();

    const report = await verifyAgentRun(harness.dir, harness.sessionId);
    expect(report.ledgerErrors).toEqual([]);
    expect(report.sessionChainErrors).toEqual([]);
    expect(report.unsignedRowIds).toEqual([]);
    expect(report.requests).toHaveLength(3);
    expect(report.requests.every((request) => request.status === "reconstructed")).toBe(true);
    expect(report.ok).toBe(true);
  });

  test.each(["summary", "verification"] as const)("public-only %s reads preserve the supplied keys without creating a vault", async (reader) => {
    const source = mkdtempSync(join(tmpdir(), "amc-run-report-source-"));
    const snapshot = mkdtempSync(join(tmpdir(), "amc-run-report-public-"));
    try {
      initWorkspace({ workspacePath: source, trustBoundaryMode: "isolated" });
      mkdirSync(join(snapshot, ".amc"));
      cpSync(join(source, ".amc", "keys"), join(snapshot, ".amc", "keys"), { recursive: true });
      const ledger = openLedger(source);
      try {
        ledger.startSession({ sessionId: "public-run", runtime: "unknown", binaryPath: "test", binarySha256: "fixture" });
        ledger.appendEvidence({ sessionId: "public-run", runtime: "unknown", eventType: "stdout", payload: "signed snapshot event", inline: true });
        ledger.sealSession("public-run");
        await ledger.db.backup(join(snapshot, ".amc", "evidence.sqlite"));
      } finally {
        ledger.close();
      }
      const keys = join(snapshot, ".amc", "keys");
      const keyBytes = () => Object.fromEntries(readdirSync(keys).sort().map((file) => [file, sha256Hex(readFileSync(join(keys, file)))]));
      const before = keyBytes();
      if (reader === "summary") {
        expect(readAgentRunSummary(snapshot, "public-run", "idle").events).toBe(1);
      } else {
        // This fixture checks reader side effects, not request reconstruction.
        expect((await verifyAgentRun(snapshot, "public-run")).ledgerOk).toBe(true);
      }
      expect(keyBytes()).toEqual(before);
      expect(existsSync(join(snapshot, ".amc", "vault.amcvault"))).toBe(false);
      expect(existsSync(join(snapshot, ".amc", "vault.amcvault.meta.json"))).toBe(false);
    } finally {
      lockVault(source);
      lockVault(snapshot);
      rmSync(source, { recursive: true, force: true });
      rmSync(snapshot, { recursive: true, force: true });
    }
  });

  test("NEGATIVE: an unsigned workspace does not pass, and says which rows are unsigned", async () => {
    // The point of this test is that the "no row is unsigned" assertion above is
    // capable of failing. Three false greens have been reported on evidence
    // whose integrity was never actually checked; an integrity claim that no
    // input can break is the fourth waiting to happen.
    const previous = process.env.AMC_NO_SIGN;
    process.env.AMC_NO_SIGN = "1";
    let harness: LoopHarness;
    try {
      harness = messyRun();
      harness.driver.followup("say hello");
      await harness.driver.whenIdle();
      harness.finish();
    } finally {
      if (previous === undefined) delete process.env.AMC_NO_SIGN;
      else process.env.AMC_NO_SIGN = previous;
    }

    const summary = readAgentRunSummary(harness.dir, harness.sessionId, harness.driver.status);
    expect(summary.unsignedRows).toBeGreaterThan(0);
    const report = await verifyAgentRun(harness.dir, harness.sessionId);
    expect(report.unsignedRowIds.length).toBeGreaterThan(0);
    expect(report.ok).toBe(false);
  });

  test("NEGATIVE: editing one payload byte makes the request stop reconstructing", async () => {
    const harness = messyRun();
    harness.driver.followup("say hello");
    await harness.driver.whenIdle();
    harness.finish();

    const before = harness.events();
    const prompt = rowsOf(before, "user/message")[0]!;
    // The request was assembled FROM this row. Editing it must break the byte
    // commitment the header signed — otherwise "derives byte-identically" is a
    // sentence that would pass over an altered log.
    const db = new Database(join(harness.dir, ".amc", "evidence.sqlite"));
    try {
      db.prepare("UPDATE evidence_events SET payload_inline=? WHERE id=?").run("say goodbye", prompt.id);
    } finally {
      db.close();
    }

    const after = openLedger(harness.dir);
    let events: EvidenceEvent[];
    try {
      events = after.getAllEvents().filter((event) => event.session_id === harness.sessionId);
    } finally {
      after.close();
    }
    const header = rowsOf(events, "request/header")[0]!;
    const derived = deriveRecordedRequest({ workspace: harness.dir, events, headerEventId: header.id });
    expect(derived.status).toBe("digest-mismatch");
    // The bytes came back — they are just not the bytes that were signed. Saying
    // so is what separates "the log was altered" from "the payload is gone".
    expect(derived.bytes).not.toBeNull();
    expect(derived.derivedDigest).not.toBe(derived.recordedDigest);

    const report = await verifyAgentRun(harness.dir, harness.sessionId);
    expect(report.ok).toBe(false);
  });
});
