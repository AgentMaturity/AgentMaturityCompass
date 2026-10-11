import { sign, verify, randomUUID } from "node:crypto";
import { getSigningKey, getPublicKeyHistory } from "../crypto/keys.js";
import { canonicalize } from "../utils/json.js";
import { execTicketPayloadSchema, type ExecTicketPayload } from "./execTicketSchema.js";
import { loadWorkOrder, workOrderDigest } from "../workorders/workorderEngine.js";
import type { ActionClass } from "../types.js";

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

export function issueExecTicket(params: {
  workspace: string;
  agentId: string;
  workOrderId: string;
  actionClass: ActionClass;
  ttlMs: number;
  toolName?: string;
}): { ticket: string; payload: ExecTicketPayload } {
  const workOrder = loadWorkOrder({
    workspace: params.workspace,
    agentId: params.agentId,
    workOrderId: params.workOrderId,
    requireValidSignature: true
  });
  const now = Date.now();
  const payload = execTicketPayloadSchema.parse({
    v: 1,
    agentId: params.agentId,
    workOrderId: params.workOrderId,
    workOrderSha256: workOrderDigest(workOrder),
    actionClass: params.actionClass,
    toolName: params.toolName,
    issuedTs: now,
    expiresTs: now + Math.max(60_000, params.ttlMs),
    nonce: randomUUID()
  });

  const payloadBytes = Buffer.from(canonicalize(payload), "utf8");
  const signature = sign(null, payloadBytes, getSigningKey(params.workspace, "config-signature"));
  const ticket = `${toBase64Url(payloadBytes)}.${toBase64Url(signature)}`;
  return {
    ticket,
    payload
  };
}

export function parseExecTicket(ticket: string): ExecTicketPayload {
  const [payloadB64, signatureB64, ...extra] = ticket.split(".");
  if (!payloadB64 || !signatureB64 || extra.length > 0) {
    throw new Error("invalid ticket format");
  }
  const payload = execTicketPayloadSchema.parse(JSON.parse(fromBase64Url(payloadB64).toString("utf8")) as unknown);
  return payload;
}

export function verifyExecTicket(params: {
  workspace: string;
  ticket: string;
  expectedAgentId?: string;
  expectedWorkOrderId?: string;
  expectedActionClass?: ActionClass;
  expectedToolName?: string;
}): { ok: boolean; payload: ExecTicketPayload | null; error?: string } {
  try {
    const [payloadB64, signatureB64, ...extra] = params.ticket.split(".");
    if (!payloadB64 || !signatureB64 || extra.length > 0) {
      return { ok: false, payload: null, error: "invalid ticket format" };
    }
    const payloadBytes = fromBase64Url(payloadB64);
    const payload = execTicketPayloadSchema.parse(JSON.parse(payloadBytes.toString("utf8")) as unknown);
    const signature = fromBase64Url(signatureB64);
    const publicKeys = getPublicKeyHistory(params.workspace, "auditor");
    const validSig = publicKeys.some((pub) => verify(null, payloadBytes, pub, signature));
    if (!validSig) {
      return { ok: false, payload, error: "signature verification failed" };
    }
    if (Date.now() > payload.expiresTs) {
      return { ok: false, payload, error: "ticket expired" };
    }
    if (params.expectedAgentId && params.expectedAgentId !== payload.agentId) {
      return { ok: false, payload, error: "agent mismatch" };
    }
    if (params.expectedWorkOrderId && params.expectedWorkOrderId !== payload.workOrderId) {
      return { ok: false, payload, error: "work order mismatch" };
    }
    if (params.expectedActionClass && params.expectedActionClass !== payload.actionClass) {
      return { ok: false, payload, error: "action class mismatch" };
    }
    if (params.expectedToolName && payload.toolName && params.expectedToolName !== payload.toolName) {
      return { ok: false, payload, error: "tool name mismatch" };
    }

    try {
      const workOrder = loadWorkOrder({
        workspace: params.workspace,
        agentId: payload.agentId,
        workOrderId: payload.workOrderId,
        requireValidSignature: true
      });
      const digest = workOrderDigest(workOrder);
      if (digest !== payload.workOrderSha256) {
        return { ok: false, payload, error: "work order digest mismatch" };
      }
    } catch (error) {
      return { ok: false, payload, error: `work order validation failed: ${String(error)}` };
    }

    return {
      ok: true,
      payload
    };
  } catch (error) {
    return {
      ok: false,
      payload: null,
      error: String(error)
    };
  }
}
