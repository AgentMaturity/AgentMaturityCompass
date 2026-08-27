import { randomUUID, sign, verify } from "node:crypto";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";

export type ReceiptKind =
  | "llm_request" | "llm_response" | "tool_action" | "tool_result" | "guard_check"
  /** A request accepted over a wire. Commits to the acceptance row, not to any work. */
  | "work_accepted";

export interface ReceiptPayloadV1 {
  v: 1;
  kind: ReceiptKind;
  receipt_id: string;
  ts: number;
  agentId: string;
  providerId: string;
  model: string | null;
  event_hash: string;
  body_sha256: string;
  session_id: string;
}

export interface MintReceiptInput {
  kind: ReceiptKind;
  ts: number;
  agentId: string;
  providerId: string;
  model: string | null;
  eventHash: string;
  bodySha256: string;
  sessionId: string;
  privateKeyPem: string;
  receiptId?: string;
}

function toBase64Url(bytes: Buffer): string {
  return bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(encoded: string): Buffer {
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${pad}`, "base64");
}

export function mintReceipt(input: MintReceiptInput): {
  payload: ReceiptPayloadV1;
  receipt: string;
  receiptSha256: string;
} {
  const payload: ReceiptPayloadV1 = {
    v: 1,
    kind: input.kind,
    receipt_id: input.receiptId ?? randomUUID(),
    ts: input.ts,
    agentId: input.agentId || "unknown",
    providerId: input.providerId || "unknown",
    model: input.model ?? null,
    event_hash: input.eventHash,
    body_sha256: input.bodySha256,
    session_id: input.sessionId
  };
  const payloadBytes = Buffer.from(canonicalize(payload), "utf8");
  const signatureBytes = sign(null, payloadBytes, input.privateKeyPem);
  const receipt = `${toBase64Url(payloadBytes)}.${toBase64Url(signatureBytes)}`;
  return {
    payload,
    receipt,
    receiptSha256: sha256Hex(Buffer.from(receipt, "utf8"))
  };
}

export function parseReceipt(receipt: string): {
  payload: ReceiptPayloadV1;
  payloadB64: string;
  signatureB64: string;
} {
  const [payloadB64, signatureB64, ...extra] = receipt.split(".");
  if (!payloadB64 || !signatureB64 || extra.length > 0) {
    throw new Error("invalid receipt format");
  }
  const payload = JSON.parse(fromBase64Url(payloadB64).toString("utf8")) as ReceiptPayloadV1;
  if (payload.v !== 1) {
    throw new Error(`unsupported receipt version: ${String((payload as { v?: unknown }).v)}`);
  }
  if (!payload.receipt_id || !payload.event_hash || !payload.body_sha256) {
    throw new Error("receipt payload missing required fields");
  }
  return {
    payload,
    payloadB64,
    signatureB64
  };
}

export function verifyReceipt(receipt: string, publicKeysPem: string[]): {
  ok: boolean;
  payload: ReceiptPayloadV1 | null;
  error?: string;
} {
  try {
    const parsed = parseReceipt(receipt);
    const payloadBytes = fromBase64Url(parsed.payloadB64);
    const signatureBytes = fromBase64Url(parsed.signatureB64);
    const ok = publicKeysPem.some((pub) => verify(null, payloadBytes, pub, signatureBytes));
    if (!ok) {
      return {
        ok: false,
        payload: parsed.payload,
        error: "signature verification failed"
      };
    }
    return {
      ok: true,
      payload: parsed.payload
    };
  } catch (error) {
    return {
      ok: false,
      payload: null,
      error: String(error)
    };
  }
}

export function monitorPublicKeyFingerprint(publicKeyPem: string): string {
  return sha256Hex(Buffer.from(publicKeyPem, "utf8")).slice(0, 16);
}
