import { join } from "node:path";
import type { z } from "zod";
import { budgetMeta, readBudgetEvents } from "../../../budgets/nativeBudgetUsage.js";
import { defineTool } from "../../toolRegistry.js";
import type { ToolDefinition } from "../../toolTypes.js";
import { receiptedBody, type NativeReceiptRecorder } from "./nativeReceipt.js";
import { NativeToolRefusal } from "./originPolicy.js";
import {
  persistSignedRecord,
  readSignedRecord,
  sessionIdResolver,
  sessionRecordDir,
  signRecord,
  type SessionIdSource,
  type SignedRecordFile
} from "./signedSessionRecords.js";

/**
 * The shared shape of `todo` and `plan` (AMC-1549, P1-43): a whole-list
 * replace, signed, bound to one session and one agent, chained by revision and
 * the previous record's digest, and bound to the session ledger.
 *
 * LEDGER BINDING. A signature alone cannot stop an older, validly signed
 * record being put back in place. Each write therefore records an `allow`
 * receipt carrying the new record's digest BEFORE the file is written, and
 * every read compares the file's verified digest with the latest such receipt
 * for the session, read from the whole verified evidence chain. A mismatch,
 * or a file with no receipt, is refused. A failed receipt write leaves the
 * file untouched; a failed file write after its receipt fails closed.
 *
 * READ_ONLY on purpose. Neither tool changes the workspace or anything outside
 * AMC's own signed session records — the same reason a ledger row written for
 * a `grep` call does not make `grep` a write. The composed allowlist guard
 * still requires each name in the signed tools policy.
 */

export interface SessionListHeader {
  readonly schemaVersion: "2026-10-03";
  readonly kind: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly revision: number;
  readonly previousSha256: string | null;
  readonly callId: string;
  readonly updatedAt: number;
}

/** Where a list lives and how its receipts are named. */
export interface SessionListStore {
  readonly name: string;
  readonly kind: string;
  readonly fileName: string;
  readonly auditType: string;
}

export interface SessionListSpec<P extends object> extends SessionListStore {
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  readonly argsSchema: z.ZodType<P>;
  readonly render: (payload: P) => string;
}

export function sessionListPath(workspace: string, sessionId: string, fileName: string): string {
  return join(sessionRecordDir(workspace, sessionId), fileName);
}

/**
 * The record digest the session's latest `allow` receipt for this tool
 * committed to, or null. `readBudgetEvents` verifies every row's hash,
 * signature and session chain before returning any, and throws when it
 * cannot; the session comes from the verified row, not from its metadata.
 */
function ledgerRecordDigest(workspace: string, sessionId: string, auditType: string): string | null {
  let digest: string | null = null;
  for (const row of readBudgetEvents(workspace)) {
    if (row.session_id !== sessionId || row.event_type !== "audit") continue;
    const meta = budgetMeta(row);
    if (meta.auditType === auditType && meta.decision === "allow" && typeof meta.recordSha256 === "string") digest = meta.recordSha256;
  }
  return digest;
}

function readBoundList<P extends object>(workspace: string, sessionId: string, store: SessionListStore): SignedRecordFile<SessionListHeader & P> | null {
  const stored = readSignedRecord<SessionListHeader & P>(workspace, sessionListPath(workspace, sessionId, store.fileName), "monitor");
  if (stored && (stored.record.kind !== store.kind || stored.record.sessionId !== sessionId)) {
    throw new NativeToolRefusal(store.name, `the record is bound to ${stored.record.kind}/${stored.record.sessionId}, not ${store.kind}/${sessionId}`);
  }
  if ((stored?.digestSha256 ?? null) !== ledgerRecordDigest(workspace, sessionId, store.auditType)) {
    throw new NativeToolRefusal(store.name, "native tool record does not match the session ledger");
  }
  return stored;
}

/** The verified current record, or null. Throws when the file is not trustworthy or not the one the ledger names. */
export function readSessionList<P extends object>(workspace: string, sessionId: string, store: SessionListStore): (SessionListHeader & P) | null {
  return readBoundList<P>(workspace, sessionId, store)?.record ?? null;
}

export function sessionListTool<P extends object>(spec: SessionListSpec<P>, session: SessionIdSource, record: NativeReceiptRecorder): ToolDefinition {
  const currentSession = sessionIdResolver(session);
  return defineTool({
    name: spec.name,
    actionClass: "READ_ONLY",
    description: spec.description,
    parameters: spec.parameters,
    body: receiptedBody(spec.auditType, record, async (execution, allow) => {
      const payload = spec.argsSchema.parse(execution.arguments);
      const rendered = spec.render(payload);
      if (execution.effectiveMode === "SIMULATE") {
        return { output: `${rendered}\n[amc: SIMULATE ${spec.name}; not recorded]` };
      }
      const sessionId = currentSession();
      const previous = readBoundList<object>(execution.workspace, sessionId, spec);
      if (previous && previous.record.agentId !== execution.agentId) {
        throw new NativeToolRefusal(spec.name, `the existing record is bound to ${previous.record.agentId}@${sessionId}, not ${execution.agentId}@${sessionId}`);
      }
      const header: SessionListHeader = {
        schemaVersion: "2026-10-03",
        kind: spec.kind,
        sessionId,
        agentId: execution.agentId,
        revision: (previous?.record.revision ?? 0) + 1,
        previousSha256: previous?.digestSha256 ?? null,
        callId: execution.callId,
        updatedAt: Date.now()
      };
      const signed = signRecord(execution.workspace, { ...header, ...payload }, "monitor");
      allow({ recordSha256: signed.digestSha256, revision: header.revision });
      persistSignedRecord(sessionListPath(execution.workspace, sessionId, spec.fileName), signed);
      return { output: `${rendered}\n[amc: ${spec.name} revision ${header.revision}, sha256 ${signed.digestSha256}]` };
    })
  });
}
