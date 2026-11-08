import { getPurposeKeyHistory } from "../keys/signingKeys.js";
import { verifyReceipt, type ReceiptKind, type ReceiptPayload } from "../receipts/receipt.js";
import type { AgentResponse } from "./agentResponder.js";

/**
 * Gateway receipts on an assurance or red-team reply (fix3 S12, S12c). The agent under test controls its own response
 * headers (on the direct transport it IS the endpoint), so a receipt header proves nothing until it is bound to the
 * exchange AMC itself sent and received: it verifies against this workspace's receipt keys, is the right kind
 * (`llm_request` / `llm_response`), names the agent under test, commits to the exact bytes on the wire (`body_sha256`),
 * was minted while the exchange was in flight, and was not already bound to another exchange of the run; the response
 * receipt must come from the request receipt's gateway session. Anything else is a forgery or a replay: dropped,
 * recorded as one `ASSURANCE_RECEIPT_REJECTED` row, and never a reason to refuse the graded row, so the system under
 * test can neither suppress its own evidence nor dress a direct exchange up as gateway-captured.
 */

/** How far a receipt's mint time may fall outside this process's view of the exchange (the gateway runs locally). */
export const RECEIPT_CLOCK_SKEW_MS = 5_000;

/** This workspace's receipt public keys; none when the key set is unreadable, and then no receipt is admitted. */
export function workspaceReceiptKeys(workspace: string): string[] {
  try { return getPurposeKeyHistory(workspace, "receipt"); } catch { return []; }
}

export interface GatewayReceiptAdmission {
  /** The admitted request receipt and its verified id, or null when absent or refused. */
  request: { receipt: string; receiptId: string } | null;
  /** The admitted response receipt, or null when absent or refused. */
  response: string | null;
  /** Why each present receipt was refused. */
  rejected: string[];
}

type ReceiptAnswer = Pick<AgentResponse, "receiptId" | "responseReceipt" | "wire">;

export function admitGatewayReceipts(answer: ReceiptAnswer, keys: readonly string[], agentId: string, seen: Set<string>): GatewayReceiptAdmission {
  const rejected: string[] = [];
  const wire = answer.wire;
  const admit = (label: string, receipt: string, kind: ReceiptKind, digests: readonly string[], sessionId: string | null): ReceiptPayload | null => {
    const verified = verifyReceipt(receipt, [...keys]);
    const payload = verified.ok ? verified.payload : null;
    const problem = payload === null ? `does not verify (${verified.error ?? "no payload"})`
      : payload.kind !== kind ? `is a ${payload.kind} receipt`
      : payload.agentId !== agentId ? "names another agent"
      : !digests.includes(payload.body_sha256) ? "does not commit to the bytes of this exchange"
      : wire === undefined || payload.ts < wire.sentTs - RECEIPT_CLOCK_SKEW_MS || payload.ts > wire.receivedTs + RECEIPT_CLOCK_SKEW_MS
        ? "was not minted while this exchange was in flight"
      : sessionId !== null && payload.session_id !== sessionId ? "names another gateway session than its request receipt"
      : seen.has(payload.receipt_id) ? "is already bound to another exchange of this run"
      : null;
    if (problem !== null) { rejected.push(`gateway ${label} receipt ${problem}`); return null; }
    seen.add(payload!.receipt_id);
    return payload;
  };
  const request = answer.receiptId === undefined ? null : admit("request", answer.receiptId, "llm_request", wire === undefined ? [] : [wire.requestSha256], null);
  let response: string | null = null;
  if (answer.responseReceipt !== undefined) {
    if (request === null) rejected.push("gateway response receipt has no admitted request receipt");
    else if (admit("response", answer.responseReceipt, "llm_response", wire?.responseSha256 ?? [], request.session_id) !== null) response = answer.responseReceipt;
  }
  return { request: request === null ? null : { receipt: answer.receiptId!, receiptId: request.receipt_id }, response, rejected };
}

/** One run's admission: the workspace's receipt keys, read once, and the receipt ids already bound to an exchange of the run. */
export function gatewayReceiptAdmitter(workspace: string): (answer: ReceiptAnswer, agentId: string) => GatewayReceiptAdmission {
  let keys: string[] | null = null;
  const seen = new Set<string>();
  return (answer, agentId) => admitGatewayReceipts(answer, (keys ??= workspaceReceiptKeys(workspace)), agentId, seen);
}
