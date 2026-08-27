import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { getPublicKeyHistory } from "../src/crypto/keys.js";
import { sha256Hex } from "../src/utils/hash.js";
import { SessionService } from "../src/session/sessionService.js";
import { acceptWork, describeAcceptedWork, WORK_ACCEPTED_EVENT } from "../src/wire/workAcceptance.js";

/**
 * An acceptance must mean "this row exists and says a request was accepted" —
 * never "someone signed something acceptance-shaped".
 *
 * ON THE NEW `work_accepted` RECEIPT KIND. Widening `ReceiptKind` is only safe
 * because every consumer that gates on a kind compares against a LITERAL and
 * fails closed on anything else: hookControl.ts:1122 requires `guard_check`,
 * hookIngress.ts:595 compares against a kind it computes from the event itself,
 * and receiptChain.ts:246 only carries the kind through. There is no `switch`
 * with a permissive `default`, so a new kind cannot inherit an existing gate's
 * trust. The check at this module's own boundary is asserted below.
 */

const PASS = "test-passphrase-workacceptance";
const dirs: string[] = [];

function makeWorkspace() {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-work-accept-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  const ledger = openLedger(dir);
  ledger.startSession({
    sessionId: "intake", runtime: "amc", binaryPath: "test", binarySha256: "abc"
  });
  return { dir, ledger, monitorPublicKeys: getPublicKeyHistory(dir, "monitor") };
}

const REQUEST = {
  prompt: "summarise the changelog",
  agentId: "default",
  providerId: "anthropic",
  model: "claude-test"
} as const;

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("work acceptance", () => {
  it("commits to a real row, and reports work that has not started", () => {
    const { ledger, monitorPublicKeys } = makeWorkspace();
    const accepted = acceptWork({ ledger, intakeSessionId: "intake", request: REQUEST });

    // The receipt names a row that exists and is an acceptance.
    const row = ledger.db.prepare(
      "SELECT event_type, payload_sha256 FROM evidence_events WHERE id = ?"
    ).get(accepted.eventId) as { event_type: string; payload_sha256: string };
    expect(row.event_type).toBe(WORK_ACCEPTED_EVENT);
    // body_sha256 is the row's payload digest by construction, not a second claim.
    expect(row.payload_sha256).toBe(accepted.requestSha256);

    const described = describeAcceptedWork({ ledger, receipt: accepted.receipt, monitorPublicKeys });
    expect(described.ok).toBe(true);
    if (!described.ok) return;
    expect(described.workSessionId).toBe(accepted.workSessionId);
    expect(described.request.prompt).toBe(REQUEST.prompt);
    // Accepted is not started. This is the state the whole design exists to show.
    expect(described.state).toBe("not-started");
  });

  it("refuses to accept work against an intake session that was never started", () => {
    const { ledger } = makeWorkspace();
    // Without this guard the append succeeds and returns a valid signed receipt;
    // the damage only surfaces later as a whole-ledger verification failure.
    expect(() => acceptWork({ ledger, intakeSessionId: "never-opened", request: REQUEST }))
      .toThrow(/never started/);
    const orphans = ledger.db.prepare(
      "SELECT COUNT(*) AS n FROM evidence_events WHERE session_id = ?"
    ).get("never-opened") as { n: number };
    expect(orphans.n).toBe(0);
  });

  it("refuses a receipt minted for a different kind of event", () => {
    const { ledger, monitorPublicKeys } = makeWorkspace();
    const body = JSON.stringify({ body: "ok" });
    const llm = ledger.appendEvidenceWithReceipt({
      sessionId: "intake", runtime: "gateway", eventType: "llm_response",
      payload: body, payloadExt: "json", inline: true,
      meta: { agentId: "default", trustTier: "OBSERVED" },
      receipt: {
        kind: "llm_response", agentId: "default", providerId: "anthropic",
        model: "claude-test", bodySha256: sha256Hex(Buffer.from(body, "utf8"))
      }
    });

    // Signed by the same monitor, anchored to a real row — and still not an
    // acceptance. Without the kind check this would read as one.
    const described = describeAcceptedWork({ ledger, receipt: llm.receipt, monitorPublicKeys });
    expect(described.ok).toBe(false);
    if (described.ok) return;
    expect(described.reason).toContain("not an acceptance");
  });

  it("refuses an acceptance whose row was edited underneath the chain", () => {
    const { ledger, monitorPublicKeys } = makeWorkspace();
    const accepted = acceptWork({ ledger, intakeSessionId: "intake", request: REQUEST });

    // An attacker with raw database access, which is the threat the hash chain
    // exists for. The append-only trigger is dropped exactly as they would.
    ledger.db.exec("DROP TRIGGER protect_evidence_immutable");
    const forged = JSON.stringify({
      v: 1, workSessionId: "a-session-the-monitor-never-signed", request: REQUEST
    });
    ledger.db.prepare("UPDATE evidence_events SET payload_inline = ? WHERE id = ?")
      .run(forged, accepted.eventId);

    // The signature still verifies and the row is still found by event_hash:
    // only recomputing the chain catches that the row no longer hashes to it.
    const described = describeAcceptedWork({ ledger, receipt: accepted.receipt, monitorPublicKeys });
    expect(described.ok).toBe(false);
    if (described.ok) return;
    expect(described.reason).toContain("not anchored");
  });

  // The receipt's kind and the row's event type are independently supplied to
  // `appendEvidenceWithReceipt`, so they can disagree. Each direction is its own
  // miswiring and each is refused by a different check; a single test that trips
  // both at once would let either check be deleted without going red.
  it("refuses a work_accepted receipt minted over a row that is not an acceptance", () => {
    const { ledger, monitorPublicKeys } = makeWorkspace();
    const body = JSON.stringify({ body: "ok" });
    const miswired = ledger.appendEvidenceWithReceipt({
      sessionId: "intake", runtime: "gateway", eventType: "llm_response",
      payload: body, payloadExt: "json", inline: true,
      meta: { agentId: "default", trustTier: "OBSERVED" },
      receipt: {
        kind: "work_accepted", agentId: "default", providerId: "anthropic",
        model: "claude-test", bodySha256: sha256Hex(Buffer.from(body, "utf8"))
      }
    });

    const described = describeAcceptedWork({ ledger, receipt: miswired.receipt, monitorPublicKeys });
    expect(described.ok).toBe(false);
    if (described.ok) return;
    expect(described.reason).toContain("names a llm_response event");
  });

  it("refuses an acceptance row whose receipt was minted under another kind", () => {
    const { ledger, monitorPublicKeys } = makeWorkspace();
    const body = JSON.stringify({ v: 1, workSessionId: "some-session", request: REQUEST });
    const miswired = ledger.appendEvidenceWithReceipt({
      sessionId: "intake", runtime: "amc", eventType: WORK_ACCEPTED_EVENT,
      payload: body, payloadExt: "json", inline: true,
      meta: { agentId: "default", trustTier: "OBSERVED" },
      receipt: {
        kind: "llm_response", agentId: "default", providerId: "anthropic",
        model: "claude-test", bodySha256: sha256Hex(Buffer.from(body, "utf8"))
      }
    });

    // The row really is an acceptance, but nothing signed it AS one.
    const described = describeAcceptedWork({ ledger, receipt: miswired.receipt, monitorPublicKeys });
    expect(described.ok).toBe(false);
    if (described.ok) return;
    expect(described.reason).toContain("is a llm_response receipt");
  });

  it("refuses an acceptance that is not in this ledger at all", () => {
    const a = makeWorkspace();
    const b = makeWorkspace();
    const accepted = acceptWork({ ledger: a.ledger, intakeSessionId: "intake", request: REQUEST });

    const described = describeAcceptedWork({
      ledger: b.ledger, receipt: accepted.receipt, monitorPublicKeys: a.monitorPublicKeys
    });
    expect(described.ok).toBe(false);
    if (described.ok) return;
    expect(described.reason).toContain("not in this ledger");
  });

  it("tracks the promised session through running and finished", () => {
    const { dir, ledger, monitorPublicKeys } = makeWorkspace();
    const accepted = acceptWork({ ledger, intakeSessionId: "intake", request: REQUEST });

    // The acceptance promised this session id; the work opens exactly it.
    const session = new SessionService(dir);
    session.open({
      sessionId: accepted.workSessionId, agentId: "default", harnessVersion: "3.2.0",
      compositionDigest: "composition-digest", policyDigest: "policy-digest"
    });

    const running = describeAcceptedWork({ ledger, receipt: accepted.receipt, monitorPublicKeys });
    expect(running.ok && running.state).toBe("running");

    session.close({ reason: "completed" });
    const finished = describeAcceptedWork({ ledger, receipt: accepted.receipt, monitorPublicKeys });
    expect(finished.ok && finished.state).toBe("finished");
  });

  it("still reads finished after the seal columns are wiped", () => {
    const { dir, ledger, monitorPublicKeys } = makeWorkspace();
    const accepted = acceptWork({ ledger, intakeSessionId: "intake", request: REQUEST });

    const session = new SessionService(dir);
    session.open({
      sessionId: accepted.workSessionId, agentId: "default", harnessVersion: "3.2.0",
      compositionDigest: "composition-digest", policyDigest: "policy-digest"
    });
    session.close({ reason: "completed" });

    // This is why the state is read from `session/close` rows and not from
    // `sessions.session_seal_sig`: the column can be cleared, the row cannot.
    // A reader that trusted the column would report this sealed session as
    // never-closed — losing a completed run rather than reporting a tampered one.
    ledger.db.exec("DROP TRIGGER IF EXISTS protect_sessions_sealed_immutable");
    ledger.db.exec("DROP TRIGGER IF EXISTS protect_sessions_seal_consistency");
    ledger.db.exec("DROP TRIGGER IF EXISTS protect_sessions_core_immutable");
    ledger.db.prepare(
      "UPDATE sessions SET session_final_event_hash = NULL, session_seal_sig = NULL WHERE session_id = ?"
    ).run(accepted.workSessionId);
    const wiped = ledger.db.prepare(
      "SELECT session_seal_sig FROM sessions WHERE session_id = ?"
    ).get(accepted.workSessionId) as { session_seal_sig: string | null };
    expect(wiped.session_seal_sig).toBeNull();

    const described = describeAcceptedWork({ ledger, receipt: accepted.receipt, monitorPublicKeys });
    expect(described.ok && described.state).toBe("finished");
  });

  it("reads an unsealed, stale session as abandoned rather than running", () => {
    const { dir, ledger, monitorPublicKeys } = makeWorkspace();
    const accepted = acceptWork({ ledger, intakeSessionId: "intake", request: REQUEST });

    const session = new SessionService(dir);
    session.open({
      sessionId: accepted.workSessionId, agentId: "default", harnessVersion: "3.2.0",
      compositionDigest: "composition-digest", policyDigest: "policy-digest"
    });

    // Opened and never closed: a crashed run, read from a clock far enough ahead
    // that its last event is stale.
    const described = describeAcceptedWork({
      ledger, receipt: accepted.receipt, monitorPublicKeys,
      now: Date.now() + 3_600_000, staleAfterMs: 60_000
    });
    expect(described.ok && described.state).toBe("abandoned");
  });
});
