import { readSessionEventPage, type SessionEventPage } from "../session/sessionEventPage.js";
import { projectSessionUpdates, type AcpProjectedUpdate } from "./acpProjection.js";
import { ACP_MAX_UPDATE_PARAMS_BYTES } from "./acpRuntimeContracts.js";
import { ACP_ERROR, AcpFailure } from "./acpErrors.js";
import { validateAcpOrderedHistory } from "./acpHistoryContinuity.js";
import { projectAcpSessionPageState, type AcpSessionPageState } from "./acpSessionPageState.js";

/** Reuse the committed-update bound within the SDKs' one-MiB response frame. */
const MAX_RENDERED_PAGE_BYTES = ACP_MAX_UPDATE_PARAMS_BYTES;

/** One typed projection of the same authenticated session snapshot used by Studio and SDKs. */
export interface AcpSessionUpdatePage extends Omit<SessionEventPage, "events"> {
  readonly state: AcpSessionPageState;
  readonly updates: readonly AcpProjectedUpdate[];
}

export function readAcpSessionUpdatePage(options: Parameters<typeof readSessionEventPage>[0]): AcpSessionUpdatePage {
  let limit = options.limit, expectedHead: string | undefined;
  // ponytail: at most nine verified reads; separate verification from slicing if large histories make size retries costly.
  for (let attempt = 0; attempt < 9; attempt++) {
    const { page, history } = readSessionEventPage({ ...options, limit });
    if (expectedHead !== undefined && expectedHead !== page.headEventHash) {
      throw new AcpFailure(ACP_ERROR.internal, "Committed session head changed during page sizing; retry a fresh snapshot.", { reason: "history-changed" });
    }
    expectedHead = page.headEventHash;
    const snapshot = history.events.slice(0, page.headSeq + 1);
    validateAcpOrderedHistory(options.workspace, snapshot);
    let projected: ReturnType<typeof projectSessionUpdates>;
    try {
      projected = projectSessionUpdates(options.workspace, snapshot, page.firstSeq,
        { to: page.nextSeq, includeUser: true, includeEventIdentity: true });
    } catch (error) {
      // Only the projector's explicit rendered-size refusal is retryable here.
      // Chain, signature, missing payload and tamper failures propagate unchanged.
      if (!(error instanceof AcpFailure) || (error.acpData as { reason?: unknown } | undefined)?.reason !== "history-output-limit") throw error;
      limit = smallerPage(page); continue;
    }
    if (projected.unsigned > 0 || !projected.entries) {
      throw new AcpFailure(ACP_ERROR.internal, "Committed session page contains unprojectable evidence; no prefix was delivered.");
    }
    const { events: _events, ...metadata } = page;
    const result = { ...metadata, updates: projected.entries, state: projectAcpSessionPageState(options.workspace, options.sessionId, snapshot) };
    if (Buffer.byteLength(JSON.stringify(result), "utf8") <= MAX_RENDERED_PAGE_BYTES) return result;
    limit = smallerPage(page);
  }
  return pageTooLarge();
}
function smallerPage(page: SessionEventPage): number {
  const rows = page.nextSeq - page.firstSeq;
  if (rows <= 1) return pageTooLarge();
  return Math.max(1, Math.floor(rows / 2));
}
function pageTooLarge(): never {
  throw new AcpFailure(ACP_ERROR.invalidParams, "A committed session row exceeds its transport bound; no row was skipped.", { reason: "page-output-limit" });
}
