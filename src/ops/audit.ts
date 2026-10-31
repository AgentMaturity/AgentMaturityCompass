import { randomUUID } from "node:crypto";
import { openLedger } from "../ledger/ledger.js";
import { sha256Hex } from "../utils/hash.js";

export function appendOpsAuditEvent(params: {
  workspace: string;
  auditType: string;
  payload?: Record<string, unknown>;
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}): { eventId: string; eventHash: string } {
  const ledger = openLedger(params.workspace);
  // A random suffix: two audits of one type in the same millisecond must not collide on the session primary key.
  const sessionId = `ops-${params.auditType.toLowerCase()}-${Date.now()}-${randomUUID()}`;
  const json = JSON.stringify({
    auditType: params.auditType,
    ...(params.payload ?? {})
  });
  let failed = false, primary: unknown;
  try {
    ledger.startSession({
      sessionId,
      runtime: "unknown",
      binaryPath: "amc",
      binarySha256: sha256Hex(Buffer.from("amc", "utf8"))
    });
    const event = ledger.appendEvidenceWithReceipt({
      sessionId,
      runtime: "unknown",
      eventType: "audit",
      payload: json,
      payloadExt: "json",
      inline: true,
      meta: {
        auditType: params.auditType,
        severity: params.severity ?? "LOW",
        trustTier: "OBSERVED",
        source: "ops"
      },
      receipt: {
        kind: "guard_check",
        agentId: "system",
        providerId: "ops",
        model: null,
        bodySha256: sha256Hex(Buffer.from(json, "utf8"))
      }
    });
    ledger.sealSession(sessionId);
    return {
      eventId: event.id,
      eventHash: event.eventHash
    };
  } catch (cause) { failed = true; primary = cause; throw cause; }
  finally {
    try { ledger.close(); }
    // oxlint-disable-next-line no-unsafe-finally -- A cleanup failure must surface, with any primary failure, instead of reporting success.
    catch (cleanup) { if (failed) throw new AggregateError([primary, cleanup], "ops audit and ledger close failed", { cause: primary }); throw cleanup; }
  }
}

