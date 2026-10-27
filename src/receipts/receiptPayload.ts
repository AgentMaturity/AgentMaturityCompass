/** Shared exact legacy payload construction/parsing; no signing or provider selection. */
import { randomUUID } from "node:crypto";
import { receiptV1Schema, receiptV2Schema } from "../contracts/v1/receipt.js";
import type { MintReceiptInput, ReceiptKind, ReceiptPayload } from "./receipt.js";

/** The kinds a v2 receipt carries; every other kind is v1 only. Minting and parsing both use this one list. */
const V2_RECEIPT_KINDS: ReadonlySet<ReceiptKind> = new Set(["action_state"]);

/** Why `kind` may not be minted or accepted as a v`version` receipt, or null when it may. */
function receiptVersionRefusal(version: 1 | 2, kind: ReceiptKind): string | null {
  if (version === 2) return V2_RECEIPT_KINDS.has(kind) ? null : "a v2 receipt must be an action_state receipt";
  return V2_RECEIPT_KINDS.has(kind) ? "an action_state receipt needs its v2 members" : null;
}

export function buildReceiptPayload(input: Omit<MintReceiptInput, "privateKeyPem">): ReceiptPayload {
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
  // Refused here exactly when parseReceipt would refuse it, so AMC never signs a receipt its own verifier rejects.
  const refusal = receiptVersionRefusal(input.action === undefined ? 1 : 2, input.kind);
  if (refusal) throw new Error(refusal);
  // An action state is signed only in the shape the contract accepts; a v1 payload stays exactly as minted before.
  const payload: ReceiptPayload = input.action === undefined ? { v: 1, ...base } : receiptV2Schema.parse({ v: 2, ...base, ...input.action });
  return payload;
}

export function parseReceiptPayload(bytes: Buffer): ReceiptPayload {
  const decoded = JSON.parse(bytes.toString("utf8")) as { v?: unknown };
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
  const refusal = receiptVersionRefusal(payload.v, payload.kind);
  if (refusal) throw new Error(refusal);
  return payload;
}
