/**
 * What a run actually recorded — read back out of the log, never remembered.
 *
 * THE RULE THIS MODULE EXISTS TO KEEP. `amc agent-loop run` must not report from
 * counters it incremented while driving. A driver that failed to write a
 * `step/end` would still count the step, and the command would print a tidy
 * summary of a log that does not contain it. So every number below is a fold
 * over the committed rows, and the summary is a statement about the EVIDENCE
 * rather than about the process that produced it. When the two disagree, the log
 * wins and the operator sees the disagreement.
 *
 * WHY THE SUMMARY CARRIES `unsignedRows`. Because the answer must not be assumed.
 * `AMC_NO_SIGN=1` makes the ledger write the literal `"unsigned"` in place of a
 * signature, and a run summary that stayed silent about it would report a clean
 * agent turn over evidence nothing attests to. It is counted here and printed
 * even when it is zero, so its absence is an observation rather than a gap.
 *
 * WHY VERIFICATION IS A SEPARATE FUNCTION. Summarising is cheap and happens on
 * every run; verifying re-derives every model request from the log and re-walks
 * the chains, which is the expensive, load-bearing check. Keeping them apart
 * means the summary can never be mistaken for the verdict — `run` says what
 * happened, `verify` says whether the log can prove it.
 */
import { openLedger } from "../ledger/ledger.js";
import { verifyLedgerIntegrity } from "../ledger/ledgerVerification.js";
import { verifySessionChains } from "../ledger/sessionVerification.js";
import { openSessionEventStore, readSessionStoreMarker } from "../persistence/openSessionEventStore.js";
import { deriveSessionRequests } from "../llm/request/deriveRequest.js";
import type { RequestDerivationStatus } from "../llm/request/deriveRequest.js";
import { readEventPayload } from "../session/eventPayload.js";
import { readLoopRetryMeta } from "../session/loopEventMeta.js";
import { readTurnEndMeta } from "../session/turnLifecycleMeta.js";
import type { EvidenceEvent } from "../types.js";
import type { AgentStatus } from "./loopTypes.js";
import type { NativeValidationResult } from "./nativeValidation.js";
import { projectNativeValidation } from "./nativeValidationProjection.js";

/** The literal a ledger writes in place of a signature under `AMC_NO_SIGN=1`. */
/** The marker a row carries instead of a signature when signing is off. */
export const UNSIGNED = "unsigned";

/** How one turn ended, as the signed closer says. */
export interface TurnEndingRow {
  readonly turn: number;
  readonly reason: string;
  /** `{kind}` of the cancel cause, or null. Present exactly when reason is `cancelled`. */
  readonly cancelCause: string | null;
  /**
   * True only when a CRASH REPAIR wrote this closer. A live cancel is
   * `reason: "cancelled"`; `interrupted` means the process died. The two are
   * different facts and this report keeps them apart.
   */
  readonly interrupted: boolean;
}

export interface AgentRunSummary {
  readonly sessionId: string;
  /** What the driver reported. Shown BESIDE the log's own counts, never instead of them. */
  readonly driverStatus: AgentStatus;
  readonly events: number;
  readonly turns: number;
  readonly steps: number;
  /** `request/header` rows. Exceeds `steps` exactly when a step was retried. */
  readonly requests: number;
  readonly retried: number;
  readonly retriesAbandoned: number;
  readonly toolCalls: number;
  readonly endings: readonly TurnEndingRow[];
  /** Assistant text, in commit order, exactly as the signed rows carry it. */
  readonly assistantText: readonly string[];
  /** Rows whose `writer_sig` is the literal "unsigned". Zero is the only acceptable value. */
  readonly unsignedRows: number;
  /** Public operator checks for the latest turn, independent of model completion. */
  readonly validation: NativeValidationResult;
}

/** Read one session's committed rows in commit order. */
function sessionEvents(workspace: string, sessionId: string): EvidenceEvent[] {
  const ledger = openLedger(workspace, { readonly: true });
  try {
    return ledger.getAllEvents().filter((event) => event.session_id === sessionId);
  } finally {
    ledger.close();
  }
}

/** Assistant text blocks, read from their payloads. Pruned or missing bytes are named, not skipped. */
function assistantTextOf(workspace: string, events: readonly EvidenceEvent[]): string[] {
  const out: string[] = [];
  for (const event of events) {
    if (event.event_type !== "assistant/block") continue;
    const meta = JSON.parse(event.meta_json) as { blockKind?: unknown };
    if (meta.blockKind !== "text") continue;
    const payload = readEventPayload(workspace, event);
    out.push(
      payload.status === "ok"
        ? payload.bytes.toString("utf8")
        : `[amc:payload ${payload.status}] ${event.id}`
    );
  }
  return out;
}

/** Fold one session's rows into what the run actually recorded. */
export function readAgentRunSummary(
  workspace: string,
  sessionId: string,
  driverStatus: AgentStatus
): AgentRunSummary {
  const events = sessionEvents(workspace, sessionId);
  const endings: TurnEndingRow[] = [];
  let retried = 0;
  let retriesAbandoned = 0;
  for (const event of events) {
    if (event.event_type === "turn/end") {
      const meta = readTurnEndMeta(event.meta_json);
      if (meta !== null) {
        endings.push({
          turn: meta.turn,
          reason: meta.reason,
          cancelCause: meta.cancelCause?.kind ?? null,
          interrupted: meta.interrupted
        });
      }
      continue;
    }
    if (event.event_type === "loop/retry") {
      const meta = readLoopRetryMeta(event.meta_json);
      if (meta === null) continue;
      if (meta.decision === "retry") retried += 1;
      else retriesAbandoned += 1;
    }
  }
  const count = (type: string): number => events.filter((event) => event.event_type === type).length;
  return {
    sessionId,
    driverStatus,
    events: events.length,
    turns: count("turn/start"),
    steps: count("step/start"),
    requests: count("request/header"),
    retried,
    retriesAbandoned,
    toolCalls: count("tool/call"),
    endings,
    assistantText: assistantTextOf(workspace, events),
    unsignedRows: events.filter((event) => event.writer_sig === UNSIGNED).length,
    validation: projectNativeValidation(workspace, events)
  };
}

/** One model request, and whether the log can still produce its exact bytes. */
export interface RequestDerivationRow {
  readonly headerEventId: string;
  readonly status: RequestDerivationStatus;
  readonly detail: string | null;
}

export interface AgentRunVerification {
  readonly sessionId: string;
  /** Every check below, conjoined. */
  readonly ok: boolean;
  /** The workspace-wide chain verdict, which a session cannot be sound without. */
  readonly ledgerOk: boolean;
  readonly ledgerErrors: readonly string[];
  /** Session presence and SQLite linkage checks; selected JSONL chains are also enforced by ledgerErrors. */
  readonly sessionChainErrors: readonly string[];
  /** Rows whose signature is the literal "unsigned". */
  readonly unsignedRowIds: readonly string[];
  readonly requests: readonly RequestDerivationRow[];
  /**
   * What the verdict above rests on.
   *
   * `anchored` is false when no expected monitor fingerprint was supplied,
   * which means this run proved internal consistency and NOTHING about
   * authorship: the key every signature was checked against lives inside the
   * workspace being checked. Reporting a bare "VERIFIED" for that case is the
   * overstatement this project has now had to correct four times, so the flag
   * is part of the result rather than a detail of the renderer.
   */
  readonly trustRoot: {
    readonly anchored: boolean;
    readonly monitorFingerprint: string | null;
    readonly expectedFingerprint: string | null;
  };
}

/**
 * Re-derive every request in a session and re-walk its chains.
 *
 * `reconstructed` is the ONLY status that counts as sound here.
 * `payload-pruned` is deliberately not treated as a pass: retention deleting a
 * source is lawful, and it is still true that this session can no longer prove
 * what it sent. An operator asking "can this run be reconstructed" deserves
 * "no, lawfully" rather than a green tick.
 */
export async function verifyAgentRun(workspace: string, sessionId: string): Promise<AgentRunVerification> {
  const result = await verifyLedgerIntegrity(workspace);
  const sessionChainErrors: string[] = [];
  let unsignedRowIds: string[];
  if (readSessionStoreMarker(workspace) === "jsonl") {
    // The operations SQLite ledger is not the JSONL session lifecycle.
    // Read the selected backend without taking a writer lock or initializing
    // anything. verifyLedgerIntegrity above still authenticates the complete
    // JSONL global/session chains, lifecycle seals, payloads and monitor pin.
    const store = openSessionEventStore(workspace, "jsonl", { readOnly: true });
    try {
      if (store.readSessionRecord(sessionId) === null) {
        sessionChainErrors.push(`Session ${sessionId} not found`);
      }
      unsignedRowIds = store.readSessionEvents(sessionId)
        .filter((event) => event.writer_sig === UNSIGNED).map((event) => event.id);
    } finally {
      store.close();
    }
  } else {
    const ledger = openLedger(workspace, { readonly: true });
    try {
      // No requests is valid for a recorded empty session, but cannot prove
      // that an unrecorded session ever existed.
      if (!ledger.getAllSessions().some((session) => session.session_id === sessionId)) {
        sessionChainErrors.push(`Session ${sessionId} not found`);
      }
      verifySessionChains(ledger, sessionChainErrors);
      unsignedRowIds = ledger
        .getAllEvents()
        .filter((event) => event.session_id === sessionId && event.writer_sig === UNSIGNED)
        .map((event) => event.id);
    } finally {
      ledger.close();
    }
  }
  const requests = deriveSessionRequests({ workspace, sessionId }).map((derivation) => ({
    headerEventId: derivation.headerEventId,
    status: derivation.status,
    detail: derivation.detail
  }));
  return {
    sessionId,
    ok:
      result.chain.ok &&
      sessionChainErrors.length === 0 &&
      unsignedRowIds.length === 0 &&
      requests.every((request) => request.status === "reconstructed"),
    ledgerOk: result.chain.ok,
    ledgerErrors: result.chain.errors,
    sessionChainErrors,
    unsignedRowIds,
    requests,
    trustRoot: result.trustRoot
  };
}

/** Render a summary for a terminal. Numbers first; the model's words last. */
export function renderRunSummary(summary: AgentRunSummary): string {
  const lines = [
    `session ${summary.sessionId}`,
    `  driver     ${summary.driverStatus}`,
    `  turns      ${summary.turns}`,
    `  steps      ${summary.steps}`,
    `  requests   ${summary.requests}${summary.requests > summary.steps ? " (a step was retried)" : ""}`,
    `  retries    ${summary.retried} taken, ${summary.retriesAbandoned} abandoned`,
    `  tool calls ${summary.toolCalls}`,
    `  events     ${summary.events}`,
    `  unsigned   ${summary.unsignedRows}`
  ];
  for (const ending of summary.endings) {
    const cause = ending.cancelCause === null ? "" : ` (cause: ${ending.cancelCause})`;
    // `interrupted` can only come from crash repair, so saying so here keeps the
    // two facts apart at the surface an operator actually reads.
    const origin = ending.interrupted ? " [written by crash repair]" : "";
    lines.push(`  turn ${ending.turn} → ${ending.reason}${cause}${origin}`);
  }
  for (const text of summary.assistantText) {
    lines.push(`  assistant: ${text}`);
  }
  lines.push(`  validation ${summary.validation.status}${summary.validation.turn === null ? "" : ` (turn ${summary.validation.turn})`}`);
  for (const check of summary.validation.checks) lines.push(`    ${check.id}: ${check.status}${check.exitCode === null ? "" : ` (exit ${check.exitCode})`}${check.reason === null ? "" : ` — ${check.reason}`}`);
  if (summary.unsignedRows > 0) {
    lines.push(
      `  WARNING: ${summary.unsignedRows} row(s) carry the literal "unsigned" signature; ` +
        "this run's evidence attests to nothing (AMC_NO_SIGN=1?)."
    );
  }
  return lines.join("\n");
}

/** Render a verification report for a terminal. */
export function renderVerifyReport(report: AgentRunVerification): string {
  const lines = [
    `session ${report.sessionId}: ${report.ok ? "VERIFIED" : "NOT VERIFIED"}`,
    `  ledger chain        ${report.ledgerOk ? "ok" : `${report.ledgerErrors.length} error(s)`}`,
    `  session chain       ${report.sessionChainErrors.length === 0 ? "ok" : `${report.sessionChainErrors.length} error(s)`}`,
    `  unsigned rows       ${report.unsignedRowIds.length}`,
    `  requests derived    ${report.requests.filter((request) => request.status === "reconstructed").length}/${report.requests.length}`,
    // Say what the verdict rests on. VERIFIED over an unanchored run means the
    // rows are internally consistent, not that this workspace wrote them: the
    // key they were checked against lives inside the workspace being checked.
    `  trust root          ${
      report.trustRoot.anchored
        ? `anchored to ${report.trustRoot.monitorFingerprint?.slice(0, 16)}…`
        : "UNANCHORED — internal consistency only, not authorship"
    }`
  ];
  if (!report.trustRoot.anchored) {
    lines.push(
      "  To make this adversarial, pin the expected key out of band:",
      "    AMC_EXPECTED_MONITOR_FINGERPRINT=<sha256 of the monitor .pub>"
    );
  }
  for (const error of [...report.ledgerErrors, ...report.sessionChainErrors]) {
    lines.push(`  ! ${error}`);
  }
  for (const request of report.requests) {
    if (request.status === "reconstructed") continue;
    lines.push(`  ! ${request.headerEventId}: ${request.status}${request.detail === null ? "" : ` — ${request.detail}`}`);
  }
  return lines.join("\n");
}
