import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { SessionService } from "../src/session/sessionService.js";
import { SESSION_ENVELOPE_META_KEY } from "../src/session/sessionTypes.js";

/**
 * Negative coverage for the P2.2 session verifier.
 *
 * The workflow that built the spine asserted only that verification PASSES on a
 * well-formed session. A verifier rule with no failing case is not a rule —
 * deleting it would leave the suite green, which is exactly how three dead
 * checks survived into P2.0. Each test here breaks ONE property and asserts the
 * specific error, so removing the corresponding check turns this file red.
 *
 * These tests reach under the immutability triggers deliberately: they are
 * simulating an attacker with raw database write access, which is the only
 * threat model under which these verifier checks matter.
 */
const PASS = "session-verifier-negative-passphrase";

function buildSession(build: (svc: SessionService) => void): {
  workspace: string;
  cleanup: () => void;
} {
  const prior = process.env["AMC_VAULT_PASSPHRASE"];
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const workspace = mkdtempSync(join(tmpdir(), "amc-sv-neg-"));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  const svc = new SessionService(workspace);
  build(svc);
  return {
    workspace,
    cleanup: () => {
      rmSync(workspace, { recursive: true, force: true });
      if (prior === undefined) delete process.env["AMC_VAULT_PASSPHRASE"];
      else process.env["AMC_VAULT_PASSPHRASE"] = prior;
    }
  };
}

function openRaw(workspace: string): Database.Database {
  const db = new Database(join(workspace, ".amc", "evidence.sqlite"));
  for (const t of ["protect_evidence_immutable", "no_delete_evidence", "no_update_evidence"]) {
    db.exec(`DROP TRIGGER IF EXISTS ${t}`);
  }
  return db;
}

/** A complete, cleanly-closed one-turn session. */
function cleanSession(svc: SessionService): void {
  svc.open({
    sessionId: "s",
    agentId: "a",
    harnessVersion: "1",
    compositionDigest: "0".repeat(64),
    policyDigest: "0".repeat(64)
  });
  svc.startTurn({ trigger: "user" });
  svc.startStep();
  svc.recordUserMessage("hello");
  svc.recordAssistantBlock({ blockIndex: 0, blockKind: "text", stopReason: "end_turn", content: "hi" });
  svc.endStep({ stopReason: "end_turn", usage: { inputTokens: 1, outputTokens: 1, cacheRead: 0, cacheWrite: 0 } });
  svc.endTurn({ reason: "complete" });
  svc.sealTurn();
  svc.close({ reason: "done" });
}

/** A one-turn session the operator cancelled mid-flight. */
function cancelledSession(svc: SessionService): void {
  svc.open({
    sessionId: "s",
    agentId: "a",
    harnessVersion: "1",
    compositionDigest: "0".repeat(64),
    policyDigest: "0".repeat(64)
  });
  svc.startTurn({ trigger: "user" });
  svc.startStep();
  svc.recordUserMessage("hello");
  svc.endStep({ stopReason: null, usage: null });
  svc.endTurn({ reason: "cancelled", cause: { kind: "hook", reason: "egress-guard" } });
  svc.sealTurn();
  svc.close({ reason: "cancelled" });
}

describe("session verifier — each check has a failing case", () => {
  it("baseline: an untampered session verifies", async () => {
    const { workspace, cleanup } = buildSession(cleanSession);
    try {
      const v = await verifyLedgerIntegrity(workspace);
      expect(v.chain.ok, v.chain.errors.join("; ")).toBe(true);
      expect(v.sessions.closed).toContain("s");
    } finally {
      cleanup();
    }
  });

  it("catches a session sequence number that skips", async () => {
    const { workspace, cleanup } = buildSession(cleanSession);
    try {
      const db = openRaw(workspace);
      // Bump the seq inside one event's envelope, leaving everything else. This
      // is what re-ordering or dropping a session event would look like to the
      // per-session chain, and the writer_sig no longer matches either.
      const row = db
        .prepare("SELECT rowid rid, meta_json FROM evidence_events WHERE meta_json LIKE ? ORDER BY rowid ASC LIMIT 1 OFFSET 2")
        .get(`%${SESSION_ENVELOPE_META_KEY}%`) as { rid: number; meta_json: string };
      const meta = JSON.parse(row.meta_json) as Record<string, { seq: number }>;
      meta[SESSION_ENVELOPE_META_KEY]!.seq += 5;
      db.prepare("UPDATE evidence_events SET meta_json=? WHERE rowid=?").run(JSON.stringify(meta), row.rid);
      db.close();

      const v = await verifyLedgerIntegrity(workspace);
      expect(v.chain.ok).toBe(false);
      expect(v.chain.errors.join(" ")).toMatch(/session sequence mismatch/);
    } finally {
      cleanup();
    }
  });

  it("catches a broken per-session prevSessionEventHash link", async () => {
    const { workspace, cleanup } = buildSession(cleanSession);
    try {
      const db = openRaw(workspace);
      const row = db
        .prepare("SELECT rowid rid, meta_json FROM evidence_events WHERE meta_json LIKE ? ORDER BY rowid ASC LIMIT 1 OFFSET 2")
        .get(`%${SESSION_ENVELOPE_META_KEY}%`) as { rid: number; meta_json: string };
      const meta = JSON.parse(row.meta_json) as Record<string, { prevSessionEventHash: string }>;
      // Point at a plausible-but-wrong prior hash; keep seq correct so ONLY the
      // linkage check can catch it.
      meta[SESSION_ENVELOPE_META_KEY]!.prevSessionEventHash = "a".repeat(64);
      db.prepare("UPDATE evidence_events SET meta_json=? WHERE rowid=?").run(JSON.stringify(meta), row.rid);
      db.close();

      const v = await verifyLedgerIntegrity(workspace);
      expect(v.chain.ok).toBe(false);
      expect(v.chain.errors.join(" ")).toMatch(/session chain mismatch|session sequence|event_hash mismatch/);
    } finally {
      cleanup();
    }
  });

  it("catches an edited cancel cause — WHO stopped the agent is signed, not annotated", async () => {
    const { workspace, cleanup } = buildSession(cancelledSession);
    try {
      const db = openRaw(workspace);
      // The cause must be IN the row's hashed meta. If a future refactor moved it
      // to a side channel — a column, a sibling file, an unhashed key — this
      // lookup finds nothing and the test fails before it ever tampers.
      const row = db
        .prepare("SELECT rowid rid, meta_json FROM evidence_events WHERE event_type='turn/end'")
        .get() as { rid: number; meta_json: string } | undefined;
      expect(row, "the cancelled turn/end row exists").toBeDefined();
      const meta = JSON.parse(row!.meta_json) as Record<string, unknown>;
      expect(meta.cancelCause, "the cause rides inside the hashed meta").toEqual({
        kind: "hook",
        reason: "egress-guard"
      });

      // Re-attribute the cancellation: the hook becomes the user. Nothing else
      // about the row changes — this is precisely the edit an operator covering
      // for a guard trip would make.
      meta.cancelCause = { kind: "user" };
      db.prepare("UPDATE evidence_events SET meta_json=? WHERE rowid=?").run(JSON.stringify(meta), row!.rid);
      db.close();

      const v = await verifyLedgerIntegrity(workspace);
      expect(v.chain.ok).toBe(false);
      expect(v.chain.errors.join(" ")).toMatch(/event_hash mismatch|writer signature invalid/);
    } finally {
      cleanup();
    }
  });

  it("catches an envelope sessionId that disagrees with the row", async () => {
    const { workspace, cleanup } = buildSession(cleanSession);
    try {
      const db = openRaw(workspace);
      const row = db
        .prepare("SELECT rowid rid, meta_json FROM evidence_events WHERE meta_json LIKE ? ORDER BY rowid ASC LIMIT 1 OFFSET 2")
        .get(`%${SESSION_ENVELOPE_META_KEY}%`) as { rid: number; meta_json: string };
      const meta = JSON.parse(row.meta_json) as Record<string, { sessionId: string }>;
      meta[SESSION_ENVELOPE_META_KEY]!.sessionId = "some-other-session";
      db.prepare("UPDATE evidence_events SET meta_json=? WHERE rowid=?").run(JSON.stringify(meta), row.rid);
      db.close();

      const v = await verifyLedgerIntegrity(workspace);
      expect(v.chain.ok).toBe(false);
      expect(v.chain.errors.join(" ")).toMatch(/session envelope sessionId mismatch|event_hash mismatch/);
    } finally {
      cleanup();
    }
  });
});

describe("session lifecycle — the three-way verdict is real in both directions", () => {
  it("reports a fresh unclosed agent session as OPEN, and it does not fail the chain", async () => {
    const { workspace, cleanup } = buildSession((svc) => {
      svc.open({
        sessionId: "live",
        agentId: "a",
        harnessVersion: "1",
        compositionDigest: "0".repeat(64),
        policyDigest: "0".repeat(64)
      });
      svc.startTurn({ trigger: "user" });
      svc.startStep();
      svc.recordUserMessage("working...");
      // No endStep / endTurn / close: this is a live, in-progress session.
    });
    try {
      const v = await verifyLedgerIntegrity(workspace, { sessionStaleAfterMs: 60_000 });
      expect(v.sessions.open, JSON.stringify(v.sessions)).toContain("live");
      expect(v.sessions.interrupted).not.toContain("live");
      // The whole point of decision #1: a running agent must not poison its own
      // workspace's verification.
      expect(v.chain.ok, v.chain.errors.join("; ")).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("reports the SAME session as INTERRUPTED once stale — never as OPEN or CLOSED", async () => {
    const { workspace, cleanup } = buildSession((svc) => {
      svc.open({
        sessionId: "crashed",
        agentId: "a",
        harnessVersion: "1",
        compositionDigest: "0".repeat(64),
        policyDigest: "0".repeat(64)
      });
      svc.startTurn({ trigger: "user" });
      svc.startStep();
      svc.recordUserMessage("about to crash");
    });
    try {
      // Any positive staleness threshold with a negative window forces stale.
      const v = await verifyLedgerIntegrity(workspace, { sessionStaleAfterMs: -1 });
      expect(v.sessions.interrupted, JSON.stringify(v.sessions)).toContain("crashed");
      expect(v.sessions.open).not.toContain("crashed");
      expect(v.sessions.closed).not.toContain("crashed");
      // A crash must not be laundered into a clean seal, but must also not make
      // the workspace fail verification.
      expect(v.chain.ok).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("a legacy (non-agent) unsealed session keeps the strict must-be-sealed rule", async () => {
    const prior = process.env["AMC_VAULT_PASSPHRASE"];
    process.env["AMC_VAULT_PASSPHRASE"] = PASS;
    const workspace = mkdtempSync(join(tmpdir(), "amc-sv-legacy-"));
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
    try {
      // A raw session with no session/open and no SessionEnvelope — the legacy
      // audit shape. It must still fail if left unsealed, unchanged from before.
      const ledger = openLedger(workspace);
      ledger.startSession({ sessionId: "legacy", runtime: "generic", binaryPath: "b", binarySha256: "0".repeat(64) });
      ledger.appendEvidence({ sessionId: "legacy", runtime: "generic", eventType: "stdout", payload: "x", inline: true });
      ledger.close();

      const v = await verifyLedgerIntegrity(workspace);
      expect(v.chain.ok).toBe(false);
      expect(v.chain.errors.join(" ")).toMatch(/Session legacy missing seal/);
      // And it is NOT quietly bucketed as open/interrupted — those are for agent
      // sessions only.
      expect(v.sessions.open).not.toContain("legacy");
      expect(v.sessions.interrupted).not.toContain("legacy");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
      if (prior === undefined) delete process.env["AMC_VAULT_PASSPHRASE"];
      else process.env["AMC_VAULT_PASSPHRASE"] = prior;
    }
  });
});

describe("the per-session chain earns its place against a re-signed forgery", () => {
  it("catches a session sequence break even when event_hash and the global chain are valid", async () => {
    // This is the case ONLY verifySessionChains can catch, and the reason the
    // per-session chain exists: an attacker (or a corrupted export) with the
    // monitor key re-signs a tampered event so its event_hash is valid and the
    // global chain still links — but the session's internal seq no longer
    // increments by one. Standalone session verification (Passport export) has
    // no global chain to fall back on, so this check is the whole guarantee.
    const { getPrivateKeyPem, signHexDigest } = await import("../src/crypto/keys.js");
    const { canonicalMetadataForHash } = await import("../src/ledger/ledger.js");
    const { sha256Hex } = await import("../src/utils/hash.js");

    const { workspace, cleanup } = buildSession(cleanSession);
    try {
      const db = openRaw(workspace);
      db.exec("DROP TRIGGER IF EXISTS protect_sessions_sealed_immutable");
      const monitorPem = getPrivateKeyPem(workspace, "monitor");

      // The session/close event is the LAST row, so nothing chains after it
      // except the session seal — we can re-sign it in place without re-chaining
      // the whole ledger.
      const last = db
        .prepare("SELECT rowid rid, * FROM evidence_events ORDER BY rowid DESC LIMIT 1")
        .get() as Record<string, string | number> & { rid: number };
      const meta = JSON.parse(last.meta_json as string) as Record<string, { seq: number }>;
      meta[SESSION_ENVELOPE_META_KEY]!.seq += 5; // break the sequence
      const newMetaJson = JSON.stringify(meta);

      const canonical = canonicalMetadataForHash({
        id: last.id as string,
        ts: last.ts as number,
        sessionId: last.session_id as string,
        runtime: last.runtime as never,
        eventType: last.event_type as never,
        payloadPath: (last.canonical_payload_path ?? last.payload_path) as string | null,
        payloadInline: (last.canonical_payload_inline ?? last.payload_inline) as string | null,
        metaJson: newMetaJson
      });
      const newHash = sha256Hex(`${last.prev_event_hash}${canonical}${last.payload_sha256}`);
      const newSig = signHexDigest(newHash, monitorPem); // a VALID signature

      db.prepare("UPDATE evidence_events SET meta_json=?, event_hash=?, writer_sig=? WHERE rowid=?").run(
        newMetaJson,
        newHash,
        newSig,
        last.rid
      );
      // Re-point and re-sign the session seal so the SEAL check also passes.
      db.prepare("UPDATE sessions SET session_final_event_hash=?, session_seal_sig=? WHERE session_id=?").run(
        newHash,
        signHexDigest(newHash, monitorPem),
        last.session_id
      );
      db.close();

      const v = await verifyLedgerIntegrity(workspace);
      // event_hash is valid, the global chain links, the seal verifies — the
      // ONLY thing wrong is the session sequence. If verifySessionChains were
      // removed, this would PASS, which is exactly the hole it closes.
      expect(v.chain.ok, "a re-signed session-chain break must still be caught").toBe(false);
      expect(v.chain.errors.join(" ")).toMatch(/session sequence mismatch/);
      expect(v.chain.errors.join(" "), "and NOT via the event_hash backstop").not.toMatch(/event_hash mismatch/);
    } finally {
      cleanup();
    }
  });
});

describe("a native session is labelled honestly", () => {
  it("defaults its runtime to 'amc', not 'unknown' or a provider name", async () => {
    // The runtime field records HOW evidence was produced. A session AMC ran
    // through its own loop is "amc"; calling it "unknown" (or "claude" because
    // the model happens to be Claude) misreports provenance the trust plane
    // exists to keep honest.
    const { workspace, cleanup } = buildSession((svc) => {
      svc.open({
        sessionId: "native",
        agentId: "a",
        harnessVersion: "1",
        compositionDigest: "0".repeat(64),
        policyDigest: "0".repeat(64)
      });
      svc.close({ reason: "done" });
    });
    try {
      const ledger = openLedger(workspace);
      const events = ledger.getAllEvents().filter((e) => e.session_id === "native");
      ledger.close();
      expect(events.length).toBeGreaterThan(0);
      expect(events.every((e) => e.runtime === "amc"), "every native session event is runtime=amc").toBe(true);
    } finally {
      cleanup();
    }
  });
});
