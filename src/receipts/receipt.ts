import { randomUUID, sign, verify } from "node:crypto";
import { receiptV1Schema, receiptV2Schema, type ReceiptV2 } from "../contracts/v1/receipt.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";

export type ReceiptKind =
  | "llm_request" | "llm_response" | "tool_action" | "tool_result" | "guard_check"
  /** A request accepted over a wire. Commits to the acceptance row, not to any work. */
  | "work_accepted"
  /** One state of one consequential action (P1-03): always a `v: 2` receipt. */
  | "action_state";

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
  /** The `v: 2` members (P1-01 `receipt` contract). Present, the receipt is minted as v2 and checked before signing. */
  action?: ActionReceiptMembers;
}

type WithoutV1Members<T> = T extends unknown ? Omit<T, keyof ReceiptPayloadV1> : never;
/** What a `v: 2` receipt adds to the v1 members: one state of one execution. */
export type ActionReceiptMembers = WithoutV1Members<ReceiptV2>;

/** A receipt payload as AMC's contracts accept it: legacy v1, or one action state (v2). */
export type ReceiptPayload = ReceiptPayloadV1 | ReceiptV2;

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
  payload: ReceiptPayload;
  receipt: string;
  receiptSha256: string;
} {
  const base = {
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
  // An action state is signed only in the shape the contract accepts; a v1 payload stays exactly as minted before.
  const payload: ReceiptPayload = input.action === undefined ? { v: 1, ...base } : receiptV2Schema.parse({ v: 2, ...base, ...input.action });
  if (payload.v === 1 && input.kind === "action_state") throw new Error("an action_state receipt needs its v2 members");
  const payloadBytes = Buffer.from(canonicalize(payload), "utf8");
  const signatureBytes = sign(null, payloadBytes, input.privateKeyPem);
  const receipt = `${toBase64Url(payloadBytes)}.${toBase64Url(signatureBytes)}`;
  return {
    payload,
    receipt,
    receiptSha256: sha256Hex(Buffer.from(receipt, "utf8"))
  };
}

/**
 * Split and decode a receipt, then check its payload against the contract for its version (P1-01): `legacy-receipt`
 * for v1, `receipt` for v2. Returns the payload as the contract parsed it. The signature is not checked here.
 */
export function parseReceipt(receipt: string): {
  payload: ReceiptPayload;
  payloadB64: string;
  signatureB64: string;
} {
  const [payloadB64, signatureB64, ...extra] = receipt.split(".");
  if (!payloadB64 || !signatureB64 || extra.length > 0) {
    throw new Error("invalid receipt format");
  }
  const decoded = JSON.parse(fromBase64Url(payloadB64).toString("utf8")) as { v?: unknown };
  const schema = decoded.v === 1 ? receiptV1Schema : decoded.v === 2 ? receiptV2Schema : null;
  if (schema === null) {
    throw new Error(`unsupported receipt version: ${String(decoded.v)}`);
  }
  const parsed = schema.safeParse(decoded);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`receipt payload violates the v${String(decoded.v)} contract: ${issue ? `${issue.path.join(".") || "(root)"} ${issue.message}` : "invalid"}`);
  }
  const payload: ReceiptPayload = parsed.data;
  if (payload.v === 2 && payload.kind !== "action_state") throw new Error("a v2 receipt must be an action_state receipt");
  return {
    payload,
    payloadB64,
    signatureB64
  };
}

export function verifyReceipt(receipt: string, publicKeysPem: string[]): {
  ok: boolean;
  payload: ReceiptPayload | null;
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
