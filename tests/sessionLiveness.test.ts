import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { startGateway, type GatewayHandle } from "../src/gateway/server.js";
import { openLedger } from "../src/ledger/ledger.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import {
  describeOpenSessions, GATEWAY_HEARTBEAT_AFTER_MS, GATEWAY_HEARTBEAT_CHECK_MS, GATEWAY_RECOVER_AFTER_MS,
  GATEWAY_SESSION_STALE_AFTER_MS, isLiveLegacySession, isLivenessRow, LEGACY_START_GRACE_MS
} from "../src/ledger/sessionLiveness.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";

/** LIVE-INTEGRITY-01 (D-INT-1): an unsealed legacy session is live only by a fresh signed tail, whatever its runtime. */
const NOW = 1_800_000_000_000;
const WINDOW = GATEWAY_SESSION_STALE_AFTER_MS;
const unsealed = { ended_ts: null, session_final_event_hash: null, session_seal_sig: null, started_ts: NOW - 30 * 60_000 };

describe("isLiveLegacySession", () => {
  test.each([
    ["a fresh signed tail", unsealed, NOW - 60_000, true],
    ["an ended session", { ...unsealed, ended_ts: NOW - 1 }, NOW - 60_000, false],
    ["a final hash alone", { ...unsealed, session_final_event_hash: "f".repeat(64) }, NOW - 60_000, false],
    ["a seal signature alone", { ...unsealed, session_seal_sig: "sig" }, NOW - 60_000, false],
    ["a tail exactly at the window", unsealed, NOW - WINDOW, true],
    ["a tail one ms past the window", unsealed, NOW - WINDOW - 1, false],
    ["no signed event: the recorded start decides (stale)", unsealed, null, false],
    ["no signed event: the recorded start decides (fresh)", { ...unsealed, started_ts: NOW - 1_000 }, null, true],
    ["no signed event: open only for the start grace", { ...unsealed, started_ts: NOW - LEGACY_START_GRACE_MS }, null, true],
    ["no signed event: 1 ms past the start grace", { ...unsealed, started_ts: NOW - LEGACY_START_GRACE_MS - 1 }, null, false],
    ["no signed event, recorded start 3 min ago (unsigned, so never 15 min of liveness)", { ...unsealed, started_ts: NOW - 3 * 60_000 }, null, false],
    ["a future tail", unsealed, NOW + 1, false],
    ["a future start with no event", { ...unsealed, started_ts: NOW + 1 }, null, false]
  ] as const)("%s", (_label, session, lastSignedTs, expected) => {
    expect(isLiveLegacySession(session, lastSignedTs, NOW, WINDOW)).toBe(expected);
  });

  test("the runtime is irrelevant: the same input gives the same answer for gateway, unknown and claude", () => {
    for (const runtime of ["gateway", "unknown", "claude"]) {
      const session = { ...unsealed, runtime };
      expect([isLiveLegacySession(session, NOW - 60_000, NOW, WINDOW), isLiveLegacySession(session, NOW - WINDOW - 1, NOW, WINDOW)])
        .toEqual([true, false]);
    }
  });

  test("the recovery threshold sits inside the window and past the heartbeat bound", () => {
    expect(GATEWAY_RECOVER_AFTER_MS).toBe(GATEWAY_HEARTBEAT_AFTER_MS + 3 * GATEWAY_HEARTBEAT_CHECK_MS);
    expect(GATEWAY_HEARTBEAT_AFTER_MS + GATEWAY_HEARTBEAT_CHECK_MS).toBeLessThan(GATEWAY_RECOVER_AFTER_MS);
    expect(GATEWAY_RECOVER_AFTER_MS + GATEWAY_HEARTBEAT_CHECK_MS).toBeLessThan(WINDOW);
  });
});

test("describeOpenSessions states observed facts only", () => {
  expect(describeOpenSessions([{ sessionId: "gw-1", runtime: "gateway", lastSignedTs: NOW - 3 * 60_000 - 5 }], NOW))
    .toBe("1 session open: gw-1 (gateway; last signed activity 3 min ago). An open session is the running writer's own; nothing is claimed about how it ends.");
  expect(describeOpenSessions([
    { sessionId: "gw-1", runtime: "gateway", lastSignedTs: NOW }, { sessionId: "tool-1", runtime: "unknown", lastSignedTs: NOW - 61_000 }
  ], NOW)).toMatch(/^2 sessions open: gw-1 \(gateway; last signed activity 0 min ago\), tool-1 \(unknown; last signed activity 1 min ago\)\. /);
  // A session with no signed row yet claims no signed activity: its recorded start is not signed.
  expect(describeOpenSessions([{ sessionId: "bridge-1", runtime: "gateway", lastSignedTs: null }], NOW))
    .toMatch(/^1 session open: bridge-1 \(gateway; no signed row yet\)\. /);
});

test("the start grace stays far inside the window", () => {
  expect(LEGACY_START_GRACE_MS).toBe(60_000);
  expect(LEGACY_START_GRACE_MS).toBeLessThan(GATEWAY_SESSION_STALE_AFTER_MS);
});

test("isLivenessRow matches only the gateway's heartbeat and recovery marker rows", () => {
  expect(isLivenessRow({ event_type: "gateway", meta_json: JSON.stringify({ stage: "heartbeat" }) })).toBe(true);
  expect(isLivenessRow({ event_type: "gateway", meta_json: JSON.stringify({ stage: "interrupted-sealed" }) })).toBe(true);
  expect(isLivenessRow({ event_type: "gateway", meta_json: JSON.stringify({ stage: "start" }) })).toBe(false);
  expect(isLivenessRow({ event_type: "audit", meta_json: JSON.stringify({ stage: "heartbeat" }) })).toBe(false);
  expect(isLivenessRow({ event_type: "gateway", meta_json: "not json" })).toBe(false);
});

describe("verifyLedgerIntegrity with a running gateway", { timeout: 60_000 }, () => {
  let root: string, gateway: GatewayHandle | undefined;
  beforeEach(async () => {
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-session-liveness-vault");
    root = mkdtempSync(join(tmpdir(), "amc-session-liveness-"));
    initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
    gateway = await startGateway({ workspace: root, listenPort: 0, proxyPort: 0, logger: { log() {}, error() {} } });
  });
  afterEach(async () => {
    await gateway?.close(); gateway = undefined;
    lockVault(root); rmSync(root, { recursive: true, force: true }); vi.unstubAllEnvs();
  });

  /** A sealed, closed legacy session whose one signed row is `ageMs` old. */
  function closedSession(sessionId: string, ageMs: number): void {
    const ledger = openLedger(root);
    try {
      ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "fixture", binarySha256: "fixture" });
      ledger.appendEvidence({ sessionId, runtime: "unknown", eventType: "stdout", payload: "fixture row", inline: true, ts: Date.now() - ageMs });
      ledger.sealSession(sessionId);
    } finally { ledger.close(); }
  }
  /** S1: a workspace writer drops the one trigger the UPDATE hits and NULLs the end and both seal columns. Nothing is deleted. */
  function eraseEndAndSeal(sessionId: string): void {
    const db = new Database(join(root, ".amc", "evidence.sqlite"));
    try {
      db.exec("DROP TRIGGER IF EXISTS protect_sessions_sealed_immutable");
      expect(db.prepare("UPDATE sessions SET ended_ts = NULL, session_final_event_hash = NULL, session_seal_sig = NULL WHERE session_id = ?")
        .run(sessionId).changes).toBe(1);
    } finally { db.close(); }
  }

  test("the gateway's own session is live: ok, named in liveLegacy, no errors", () => {
    const verdict = verifyLedgerIntegrity(root);
    expect(verdict).toMatchObject({ ok: true, errors: [] });
    expect(verdict.sessions.liveLegacy.map((open) => [open.sessionId, open.runtime])).toEqual([[gateway!.gatewaySessionId, "gateway"]]);
  });

  test("S1: a closed session whose end and seal were erased is a missing seal, not an open session", () => {
    closedSession("closed-1", 60 * 60_000);
    eraseEndAndSeal("closed-1");
    const verdict = verifyLedgerIntegrity(root, { now: Date.now() });
    expect(verdict.ok).toBe(false);
    expect(verdict.errors).toContain("Session closed-1 missing seal");
    expect(verdict.sessions.liveLegacy.map((open) => open.sessionId)).toEqual([gateway!.gatewaySessionId]);
  });

  test("documented limit: an erased session whose last row is 1 min old reads open until the window passes", () => {
    closedSession("recent-1", 60_000);
    eraseEndAndSeal("recent-1");
    const now = Date.now();
    const open = verifyLedgerIntegrity(root, { now });
    expect(open.ok).toBe(true);
    expect(open.sessions.liveLegacy.map((session) => session.sessionId)).toContain("recent-1");
    const later = verifyLedgerIntegrity(root, { now: now + GATEWAY_SESSION_STALE_AFTER_MS + 1 });
    expect(later.ok).toBe(false);
    expect(later.errors).toContain("Session recent-1 missing seal");
  });
});
