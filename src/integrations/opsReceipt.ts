import { getPurposeKeyHistory } from "../keys/signingKeys.js";
import { openLedger } from "../ledger/ledger.js";
import { verifyReceipt } from "../receipts/receipt.js";

function parseMeta(metaJson: string): Record<string, unknown> {
  try {
    return JSON.parse(metaJson) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function verifyOpsReceipt(params: {
  workspace: string;
  receipt: string;
  expectedEventHash?: string;
  expectedPayloadSha256?: string;
}): {
  ok: boolean;
  error: string | null;
} {
  const verify = verifyReceipt(params.receipt, getPurposeKeyHistory(params.workspace, "receipt"));
  if (!verify.ok || !verify.payload) {
    return {
      ok: false,
      error: verify.error ?? "receipt verification failed"
    };
  }
  if (params.expectedEventHash && verify.payload.event_hash !== params.expectedEventHash) {
    return {
      ok: false,
      error: "receipt event_hash mismatch"
    };
  }
  if (params.expectedPayloadSha256 && verify.payload.body_sha256 !== params.expectedPayloadSha256) {
    return {
      ok: false,
      error: "receipt body_sha256 mismatch"
    };
  }
  return {
    ok: true,
    error: null
  };
}

export function verifyOpsReceiptForEvent(params: {
  workspace: string;
  eventId: string;
}): {
  ok: boolean;
  error: string | null;
  receiptId: string | null;
} {
  const ledger = openLedger(params.workspace);
  try {
    const event = ledger.getEventById(params.eventId);
    if (!event) {
      return {
        ok: false,
        error: "event not found",
        receiptId: null
      };
    }
    const meta = parseMeta(event.meta_json);
    const receipt = typeof meta.receipt === "string" ? meta.receipt : null;
    if (!receipt) {
      return {
        ok: false,
        error: "event has no receipt",
        receiptId: null
      };
    }
    const verified = verifyOpsReceipt({
      workspace: params.workspace,
      receipt,
      expectedEventHash: event.event_hash,
      expectedPayloadSha256: event.payload_sha256
    });
    return {
      ok: verified.ok,
      error: verified.error,
      receiptId: typeof meta.receipt_id === "string" ? meta.receipt_id : null
    };
  } finally {
    ledger.close();
  }
}
