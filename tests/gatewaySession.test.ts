import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { openGatewaySession, type GatewaySession } from "../src/gateway/gatewaySession.js";
import { startGateway } from "../src/gateway/server.js";
import { openLedger, type Ledger } from "../src/ledger/ledger.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { GATEWAY_RECOVER_AFTER_MS } from "../src/ledger/sessionLiveness.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";

/** LIVE-INTEGRITY-02: the gateway session's idle heartbeat, crash recovery, re-open on a foreign seal and failed-start seal. */
const START = { eventType: "gateway", payload: JSON.stringify({ stage: "start" }), meta: { stage: "start" } } as const;
const MIN = 60_000;
let root: string, clock: number;
const handles: Ledger[] = [], sessions: GatewaySession[] = [];
const logger = { log: vi.fn(), error: vi.fn() };

beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-gateway-session-vault");
  root = mkdtempSync(join(tmpdir(), "amc-gateway-session-"));
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  clock = Date.now();
});
afterEach(() => {
  for (const session of sessions.splice(0)) { try { session.close(); } catch { /* already closed or sealed */ } }
  for (const ledger of handles.splice(0)) ledger.close();
  lockVault(root); rmSync(root, { recursive: true, force: true }); vi.unstubAllEnvs(); vi.useRealTimers();
});

function handle(): Ledger { const ledger = openLedger(root); handles.push(ledger); return ledger; }
function open(options: { afterMs?: number; recoverAfterMs?: number; ledger?: Ledger } = {}): GatewaySession {
  const session = openGatewaySession(options.ledger ?? handle(), { workspace: root, logger, start: START, now: () => clock,
    heartbeat: { checkEveryMs: MIN, afterMs: options.afterMs ?? 5 * MIN }, recoverAfterMs: options.recoverAfterMs ?? GATEWAY_RECOVER_AFTER_MS });
  sessions.push(session);
  return session;
}
function rows(sessionId: string) {
  const ledger = openLedger(root, { readonly: true });
  try { return ledger.getAllEvents().filter((event) => event.session_id === sessionId).map((event) => ({ ...event, meta: JSON.parse(event.meta_json) as Record<string, unknown> })); }
  finally { ledger.close(); }
}
function row(sessionId: string) {
  const ledger = openLedger(root, { readonly: true });
  try { return ledger.getAllSessions().find((session) => session.session_id === sessionId)!; } finally { ledger.close(); }
}
/** A leftover gateway session of another process, started now (real clock); its one signed row is at `tailTs`, or none. */
function leftover(sessionId: string, tailTs: number | null): void {
  const ledger = handle();
  ledger.startSession({ sessionId, runtime: "gateway", binaryPath: "gateway", binarySha256: "fixture" });
  if (tailTs !== null) ledger.appendEvidence({ sessionId, runtime: "gateway", eventType: "gateway", payload: '{"stage":"start"}', inline: true, ts: tailTs });
}
/** Lets the real clock pass one millisecond, so session starts (real clock) order strictly around a process start. */
function tick(): number { const start = Date.now(); while (Date.now() <= start) { /* spin one ms */ } return Date.now(); }
const verdict = () => verifyLedgerIntegrity(root, { now: clock });
const live = () => verdict().sessions.liveLegacy.map((session) => session.sessionId);

describe("heartbeat", () => {
  test("(a) beat() writes one payload-less signed row when idle past afterMs, and nothing while fresh", () => {
    const eager = open({ afterMs: 0 });
    expect(eager.beat()).toBe(true);
    const beats = rows(eager.sessionId).filter((event) => event.meta.stage === "heartbeat");
    expect(beats).toHaveLength(1);
    expect(beats[0]).toMatchObject({ payload_path: null, payload_inline: null, event_type: "gateway", meta: { trustTier: "OBSERVED" } });

    const idle = open({ afterMs: MIN });
    const before = rows(idle.sessionId).length;
    expect(idle.beat()).toBe(false);
    clock += MIN;
    expect(idle.beat()).toBe(true);
    expect(idle.beat()).toBe(false);
    expect(rows(idle.sessionId)).toHaveLength(before + 1);
    expect(verdict()).toMatchObject({ ok: true, errors: [] });
    expect(live()).toEqual(expect.arrayContaining([eager.sessionId, idle.sessionId]));
  });

  test("the interval beats through the injected clock and keeps the session live across an idle hour", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const session = open();
    for (let minute = 0; minute < 60; minute += 1) {
      clock += MIN;
      vi.advanceTimersByTime(MIN);
      expect(live()).toContain(session.sessionId);
    }
    expect(rows(session.sessionId).filter((event) => event.meta.stage === "heartbeat")).toHaveLength(12); // minutes 5, 10, ..., 60
  });
});

describe("crash recovery", () => {
  test("(b) a stale leftover started before this process is sealed with the signed marker", () => {
    const tailTs = Date.now() - 2 * GATEWAY_RECOVER_AFTER_MS;
    leftover("gw-old", tailTs);
    clock = tick();
    const session = open();
    expect(session.sweep()).toEqual([]); // the construction sweep already sealed it
    expect(row("gw-old")).toMatchObject({ ended_ts: expect.any(Number), session_seal_sig: expect.any(String) });
    const last = rows("gw-old").at(-1)!;
    expect(last.meta).toMatchObject({ stage: "interrupted-sealed", recoveredBy: session.sessionId, lastEventTs: tailTs });
    expect(row("gw-old").session_final_event_hash).toBe(last.event_hash);
    expect(verdict()).toMatchObject({ ok: true, errors: [] });
    expect(live()).not.toContain("gw-old");
  });

  test("(c) a fresh tail, (d) a session started after this process and (e) an event-less session stay unsealed", () => {
    const freshTs = Date.now() - GATEWAY_RECOVER_AFTER_MS + 10_000;
    leftover("gw-fresh", freshTs);
    leftover("gw-empty", null);
    clock = tick();
    const session = open();
    tick();
    leftover("gw-after", Date.now() - 2 * GATEWAY_RECOVER_AFTER_MS); // stale, but started after this process started
    clock = freshTs + GATEWAY_RECOVER_AFTER_MS - 1; // gw-fresh is 1 ms short of the threshold
    expect(session.sweep()).toEqual([]);
    for (const id of ["gw-fresh", "gw-empty", "gw-after"]) expect(row(id)).toMatchObject({ ended_ts: null, session_seal_sig: null });
    clock += 1;
    expect(session.sweep()).toEqual(["gw-fresh"]);
    expect(row("gw-after").session_seal_sig).toBeNull();
    expect(row("gw-empty").session_seal_sig).toBeNull();
  });

  test("(f) a prompt restart: nothing at +1 min, sealed by the beat at +9 min, the ledger verifies at every step", () => {
    leftover("gw-crashed", Date.now() - MIN);
    clock = tick();
    const session = open();
    expect(verdict()).toMatchObject({ ok: true });
    clock += MIN;
    expect(session.sweep()).toEqual([]);
    expect(verdict()).toMatchObject({ ok: true });
    expect(live()).toContain("gw-crashed");
    clock += 8 * MIN;
    expect(verdict()).toMatchObject({ ok: true });
    session.beat();
    expect(row("gw-crashed").session_seal_sig).not.toBeNull();
    expect(verdict()).toMatchObject({ ok: true, errors: [] });
    expect(live()).toEqual([session.sessionId]);
  });

  test("(g) two sweepers on two handles: the marker lands inside the sealing transaction; one marker, one seal", () => {
    for (let round = 0; round < 5; round += 1) {
      const id = `gw-race-${round}`;
      leftover(id, Date.now());
      clock = tick();
      const ledgerA = handle(), ledgerB = handle();
      ledgerA.db.pragma("busy_timeout = 25");
      const a = open({ ledger: ledgerA }), b = open({ ledger: ledgerB });
      clock += 2 * GATEWAY_RECOVER_AFTER_MS;
      const original = ledgerB.appendEvidence.bind(ledgerB);
      let markerInTransaction: boolean | null = null, rival: string[] | null = null;
      ledgerB.appendEvidence = (input) => {
        if (input.meta?.stage === "interrupted-sealed" && markerInTransaction === null) {
          markerInTransaction = ledgerB.db.inTransaction;
          rival = a.sweep(); // the other gateway sweeps in the middle of this one's recovery
        }
        return original(input);
      };
      expect(b.sweep()).toEqual([id]);
      expect(markerInTransaction).toBe(true);
      expect(rival).toEqual([]);
      expect(rows(id).filter((event) => event.meta.stage === "interrupted-sealed")).toHaveLength(1);
      a.close(); b.close(); // their own sessions are 16 min idle by now: sealed, not stale
      const result = verdict();
      expect(result.errors.filter((error) => error.includes("final hash mismatch"))).toEqual([]);
      expect(result).toMatchObject({ ok: true, errors: [] });
    }
  });
});

test("(h) a foreign seal: beat() continues in a new session that names the old one; later rows land there", () => {
  const session = open();
  const first = session.sessionId;
  handle().sealSession(first);
  expect(session.beat()).toBe(true);
  expect(session.sessionId).not.toBe(first);
  expect(rows(session.sessionId)[0]!.meta).toMatchObject({ stage: "start", resumedFrom: first, sealedGatewaySessions: [{ sessionId: first }] });
  session.appendEvidence({ eventType: "gateway", payload: "{}", meta: { stage: "request_error" } });
  expect(rows(session.sessionId).at(-1)!.meta.stage).toBe("request_error");
  expect(rows(first).at(-1)!.meta.stage).toBe("start");
  expect(verdict()).toMatchObject({ ok: true, errors: [] });
});

test("close() seals once; later appends are dropped with a log line, never written after the seal", () => {
  const session = open();
  session.close();
  session.close();
  const sealedRows = rows(session.sessionId);
  expect(sealedRows.at(-1)!.meta.stage).toBe("stop");
  session.appendEvidence({ eventType: "gateway", payload: "{}", meta: { stage: "request_error", request_id: "late-1" } });
  expect(session.appendWithReceipt({ eventType: "llm_response", payload: "{}", meta: { request_id: "late-2" },
    receipt: { kind: "llm_response", agentId: "default", providerId: "test", model: null, bodySha256: "0".repeat(64) } })).toBeNull();
  expect(rows(session.sessionId)).toHaveLength(sealedRows.length);
  expect(logger.log).toHaveBeenCalledWith("gateway: dropped gateway after seal (request late-1)");
  expect(logger.log).toHaveBeenCalledWith("gateway: dropped llm_response after seal (request late-2)");
  expect(verdict()).toMatchObject({ ok: true, errors: [] });
});

test("(i) a failed start seals the session it opened, with a stop event", { timeout: 60_000 }, async () => {
  const blocker: Server = createServer();
  await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
  const port = (blocker.address() as { port: number }).port;
  try {
    await expect(startGateway({ workspace: root, listenHost: "127.0.0.1", listenPort: port, proxyPort: 0, logger: { log() {}, error() {} } }))
      .rejects.toThrow(/EADDRINUSE/);
  } finally {
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
  }
  const db = new Database(join(root, ".amc", "evidence.sqlite"), { readonly: true });
  try {
    const gateway = db.prepare("SELECT session_id, ended_ts, session_seal_sig FROM sessions WHERE runtime = 'gateway' ORDER BY rowid")
      .all() as Array<{ session_id: string; ended_ts: number | null; session_seal_sig: string | null }>;
    expect(gateway.length).toBeGreaterThan(0);
    for (const session of gateway) expect(session).toMatchObject({ ended_ts: expect.any(Number), session_seal_sig: expect.any(String) });
    expect(JSON.parse((db.prepare("SELECT meta_json FROM evidence_events WHERE session_id = ? ORDER BY rowid DESC LIMIT 1")
      .get(gateway.at(-1)!.session_id) as { meta_json: string }).meta_json)).toMatchObject({ stage: "stop" });
  } finally { db.close(); }
  expect(verifyLedgerIntegrity(root)).toMatchObject({ ok: true, errors: [] });
});
