/**
 * The gateway's own ledger session (LIVE-INTEGRITY-02, D-INT-2/6/7). It opens with a signed start event that witnesses
 * the gateway sessions sealed since the last start (-07), stays live through a payload-less signed heartbeat written only
 * when it has been idle for `afterMs`, and seals on close(). Every check also sweeps for interrupted gateway sessions
 * (interruptedSessions.ts) that cannot belong to a live gateway (tail >= recoverAfterMs) nor to this process (started
 * before it). Every append goes through one guard: after close() nothing is written, so a late request handler drops its
 * row with a log line instead of landing after the seal.
 * ponytail: the request path does not re-check the seal; a foreign seal needs an >= 8-min-silent session, and the next
 * beat() opens a new session within one check interval. Re-check per append if that window ever matters.
 */
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { hashBinaryOrPath, type AppendEvidenceWithReceiptInput, type Ledger } from "../ledger/ledger.js";
import { runImmediateTransaction } from "../ledger/ledgerSessionTransactions.js";
import { sealedGatewaySessionsToWitness, sealInterruptedSession, witnessedGatewaySeals } from "../ledger/interruptedSessions.js";
import {
  GATEWAY_HEARTBEAT_AFTER_MS, GATEWAY_HEARTBEAT_CHECK_MS, GATEWAY_RECOVER_AFTER_MS, HEARTBEAT_STAGE
} from "../ledger/sessionLiveness.js";
import type { SessionRecord } from "../types.js";

export interface GatewayEvent { eventType: "gateway" | "audit"; payload: string; meta: Record<string, unknown> }
export interface GatewaySession {
  /** The current session: a new id after beat() found this one sealed by someone else. */
  readonly sessionId: string;
  appendEvidence(input: GatewayEvent): void;
  /** null after close(): no receipt, and nothing written. */
  appendWithReceipt(input: Omit<AppendEvidenceWithReceiptInput, "sessionId" | "runtime">): ReturnType<Ledger["appendEvidenceWithReceipt"]> | null;
  beat(): boolean;
  sweep(): string[];
  close(): void;
}

export function openGatewaySession(ledger: Ledger, input: {
  workspace: string;
  logger: { log(message: string): void; error(message: string): void };
  /** The start event the gateway writes today; the session adds the -07 witness list (and `resumedFrom` on a re-open). */
  start: GatewayEvent;
  now?: () => number;
  heartbeat?: { checkEveryMs?: number; afterMs?: number };
  recoverAfterMs?: number;
}): GatewaySession {
  const now = input.now ?? Date.now;
  const afterMs = input.heartbeat?.afterMs ?? GATEWAY_HEARTBEAT_AFTER_MS;
  const recoverAfterMs = input.recoverAfterMs ?? GATEWAY_RECOVER_AFTER_MS;
  const processStartTs = now();
  let closed = false;
  let failing = false;

  // One clock for every row the session writes and every age it computes (`now` is Date.now outside tests).
  const write = (sessionId: string, event: GatewayEvent): void => {
    ledger.appendEvidence({ sessionId, runtime: "gateway", eventType: event.eventType, payload: event.payload, payloadExt: "json",
      inline: event.eventType === "audit", ts: now(), meta: { ...event.meta, trustTier: "OBSERVED" } });
  };
  const writeLiveness = (sessionId: string, meta: Record<string, unknown>): void => {
    ledger.appendEvidence({ sessionId, runtime: "gateway", eventType: "gateway", ts: now(), meta: { ...meta, trustTier: "OBSERVED" } });
  };
  // The session row and its signed start event commit together: a failed start leaves no event-less session behind.
  const open = (resumedFrom?: string): string => runImmediateTransaction(ledger.db, () => {
    const sessionId = randomUUID();
    ledger.startSession({ sessionId, runtime: "gateway", binaryPath: join(input.workspace, "dist", "cli.js"),
      binarySha256: hashBinaryOrPath("amc-gateway", "1") });
    write(sessionId, { ...input.start, meta: { ...input.start.meta, ...(resumedFrom ? { stage: "start", resumedFrom } : {}),
      sealedGatewaySessions: sealedGatewaySessionsToWitness(ledger) } });
    return sessionId;
  });
  let current = open();

  const dropped = (eventType: string, meta: Record<string, unknown> | undefined): void => {
    input.logger.log(`gateway: dropped ${eventType} after seal (request ${String(meta?.request_id ?? "none")})`);
  };
  const sweep = (): string[] => {
    const candidates = ledger.db.prepare(`SELECT session_id FROM sessions WHERE runtime = 'gateway' AND ended_ts IS NULL
      AND session_final_event_hash IS NULL AND session_seal_sig IS NULL AND session_id != ? AND started_ts < ?`)
      .all(current, processStartTs) as Array<{ session_id: string }>;
    if (candidates.length === 0) return [];
    const witnessed = witnessedGatewaySeals(ledger);
    const sealed: string[] = [];
    for (const { session_id: sessionId } of candidates) {
      try {
        if (sealInterruptedSession(ledger, sessionId, { now: now(), minAgeMs: recoverAfterMs, recoveredBy: current, witnessed })) {
          sealed.push(sessionId);
          input.logger.log(`gateway: sealed interrupted gateway session ${sessionId}`);
        }
      } catch (error) {
        input.logger.error(`gateway: could not seal interrupted session ${sessionId}: ${String(error)}`);
      }
    }
    return sealed;
  };
  const beat = (): boolean => {
    if (closed) return false;
    const wrote = runImmediateTransaction(ledger.db, () => {
      const row = ledger.db.prepare("SELECT ended_ts, session_final_event_hash, session_seal_sig FROM sessions WHERE session_id = ?")
        .get(current) as Pick<SessionRecord, "ended_ts" | "session_final_event_hash" | "session_seal_sig"> | undefined;
      if (!row || row.ended_ts !== null || row.session_final_event_hash !== null || row.session_seal_sig !== null) {
        const previous = current;
        current = open(previous);
        input.logger.log(`gateway: session ${previous} was sealed by another writer; continuing in session ${current}`);
        return true;
      }
      const tail = ledger.db.prepare("SELECT ts FROM evidence_events WHERE session_id = ? ORDER BY rowid DESC LIMIT 1")
        .get(current) as { ts: number } | undefined;
      if (tail && now() - tail.ts < afterMs) return false;
      writeLiveness(current, { stage: HEARTBEAT_STAGE });
      return true;
    });
    sweep();
    return wrote;
  };

  sweep();
  const timer = setInterval(() => {
    try {
      beat();
      failing = false;
    } catch (error) {
      if (!failing) input.logger.error(`gateway: session heartbeat failed: ${String(error)}`);
      failing = true;
    }
  }, input.heartbeat?.checkEveryMs ?? GATEWAY_HEARTBEAT_CHECK_MS);
  timer.unref();

  return {
    get sessionId() { return current; },
    appendEvidence(event) {
      if (closed) dropped(event.eventType, event.meta);
      else write(current, event);
    },
    appendWithReceipt(event) {
      if (closed) {
        dropped(event.eventType, event.meta);
        return null;
      }
      return ledger.appendEvidenceWithReceipt({ ...event, sessionId: current, runtime: "gateway" });
    },
    beat,
    sweep,
    close() {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      write(current, { eventType: "gateway", payload: JSON.stringify({ stage: "stop" }), meta: { stage: "stop" } });
      ledger.sealSession(current);
    }
  };
}
