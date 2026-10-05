/** Native operator workflow; no provider, external harness or summarizer dependency. */
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { openHistoryReader } from "./sessionHistoryReader.js";
import { verifyLedgerIntegrity } from "../ledger/ledgerVerification.js";
import { describeMeasuredLiveEntries, prepareSurfaceCompaction } from "./surfaceCompaction.js";
import { compactionReceipt } from "./surfaceCompactionValidation.js";
import { resumeSession } from "./sessionResume.js";
import type { SessionService } from "./sessionService.js";

function snapshot(workspace: string, sessionId: string) {
  // Inspect the recorded backend, never a permissive fallback selected from a
  // malformed marker or environment. Keep verification and measurement inside
  // the same reader's change fence; this is still read-only, not writer admission.
  const reader = openHistoryReader(workspace);
  try {
    const integrity = verifyLedgerIntegrity(reader.workspace);
    if (!integrity.chain.ok) throw new Error(`Session compaction refuses invalid evidence: ${integrity.chain.errors.slice(0, 3).join("; ")}`);
    const store = reader.store;
    const record = store.readSessionRecord(sessionId);
    if (record === null) throw new Error(`No session ${sessionId} exists in this workspace`);
    const rows = store.readSessionEvents(sessionId), head = rows.at(-1);
    if (!head) throw new Error("Session has no native history to compact");
    const entries = describeMeasuredLiveEntries(reader.workspace, rows);
    let lastSeal = -1;
    rows.forEach((row, index) => { if (row.event_type === "turn/seal") lastSeal = index; });
    const interrupted = rows.slice(lastSeal + 1).some(row => row.event_type === "turn/start");
    reader.assertUnchanged();
    return { rows, head, record, entries, interrupted, backend: store.backendId, anchored: integrity.trustRoot.anchored };
  } finally { reader.store.close(); }
}

export function inspectSessionCompaction(workspace: string, sessionId: string) {
  const source = snapshot(workspace, sessionId);
  return { ok: true as const, sessionId, headEventId: source.head.id, headEventHash: source.head.event_hash,
    trustRootAnchored: source.anchored, backend: source.backend,
    closed: source.record.ended_ts !== null || source.record.session_seal_sig !== null,
    interrupted: source.interrupted, entries: source.entries,
    measurement: "payload-bytes-not-tokens" as const,
    note: "Entries contain addresses and byte sizes only. Null bytes mean retention-pruned content. Review source history before writing your summary." };
}

export interface SessionCompactionInput {
  readonly workspace: string; readonly sessionId: string; readonly expectedHeadHash: string;
  readonly originEventIds: readonly string[]; readonly reason: string;
  readonly mode: "summarize" | "replace" | "drop";
  readonly replacement?: string; readonly summaryRole?: "user" | "assistant";
}

/** Invalid edits refuse read-only; only a valid edit may acquire the existing writer. */
export function compactReleasedSession(input: SessionCompactionInput) {
  if (!/^[a-f0-9]{64}$/.test(input.expectedHeadHash)) throw new Error("--expect-head must be the hash returned by --list");
  if (!["summarize", "replace", "drop"].includes(input.mode)) throw new Error("Unsupported compaction mode");
  if (input.mode === "drop" && input.replacement !== undefined) throw new Error("Drop does not accept replacement text");
  if (input.mode !== "summarize" && input.summaryRole !== undefined) throw new Error("A summary role applies only to range summaries");
  const source = snapshot(input.workspace, input.sessionId);
  if (source.backend !== "sqlite") throw new Error("JSONL compaction through a resumed writer is unavailable; read-only inspection remains supported");
  if (source.record.ended_ts !== null || source.record.session_seal_sig !== null) throw new Error("Closed sessions are immutable; use compaction during an open native conversation");
  if (source.interrupted) throw new Error("This session has an unsealed turn; explicitly recover it before requesting compaction");
  if (source.head.event_hash !== input.expectedHeadHash) throw new Error("Session head changed; list and review its history before creating another summary");
  prepareSurfaceCompaction(input.workspace, source.rows, { origins: input.originEventIds, mode: input.mode,
    reason: input.reason, ...(input.replacement === undefined ? {} : { replacement: input.replacement }),
    ...(input.summaryRole === undefined ? {} : { summaryRole: input.summaryRole }) });
  const opened = source.rows.find(row => row.event_type === "session/open");
  if (!opened) throw new Error("Session has no supported native identity");
  const identity = JSON.parse(opened.meta_json) as Record<string, unknown>;
  const field = (name: string): string => {
    const value = identity[name];
    if (typeof value !== "string" || !value) throw new Error(`Native session identity is missing ${name}`);
    return value;
  };
  let service: SessionService | undefined;
  try {
    const resumed = resumeSession({ workspace: input.workspace, sessionId: input.sessionId,
      runtime: opened.runtime, agentId: field("agentId"), harnessVersion: field("harnessVersion"),
      compositionDigest: field("compositionDigest"), policyDigest: field("policyDigest"),
      claimant: { pid: process.pid, hostId: hostname(), bootId: randomUUID(), startedAt: Math.round(Date.now() - process.uptime() * 1000) } });
    service = resumed.service;
    if (resumed.report.observedHeadEventId !== source.head.id) throw new Error("Session changed during writer acquisition; no compaction applied, list it again");
    const ref = input.mode === "drop"
      ? service.dropSurfaceRange({ originEventIds: input.originEventIds, reason: input.reason })
      : input.mode === "replace"
        ? service.compactSurfaceEntry({ originEventId: input.originEventIds[0]!, replacement: input.replacement!, reason: input.reason })
        : service.compactSurfaceRange({ originEventIds: input.originEventIds, replacement: input.replacement!, reason: input.reason,
          ...(input.summaryRole === undefined ? {} : { summaryRole: input.summaryRole }) });
    const row = service.readEvents().find(event => event.id === ref.eventId);
    if (!row) throw new Error("Compaction append returned without its committed receipt");
    const receipt = compactionReceipt(row);
    return { ok: true as const, sessionId: input.sessionId, eventId: ref.eventId, eventHash: ref.eventHash, mode: input.mode,
      replacedBytes: receipt.replacedBytes, replacementBytes: receipt.replacementBytes, savedBytes: receipt.savedBytes,
      measurement: receipt.measurement, trustRootAnchored: source.anchored,
      evidenceRetained: true, writerReleased: true };
  } finally {
    if (service) {
      // A release failure overrides success; disposal never claims a signed release.
      try { service.releaseWithoutClosing(); }
      catch (releaseError) {
        try { service.disposeWithoutClosing(); }
        // oxlint-disable-next-line no-unsafe-finally -- A failed writer release must override a successful compaction result.
        catch (disposeError) { throw new AggregateError([releaseError, disposeError], "Compaction writer release and disposal failed"); }
        // oxlint-disable-next-line no-unsafe-finally -- Never report writerReleased when signed release failed.
        throw releaseError;
      }
    }
  }
}
