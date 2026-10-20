import { sign, randomUUID } from "node:crypto";
import { getSigningKey } from "../crypto/keys.js";
import { verifyCurrentPurposeCredentialSignature } from "../keys/purposeCredentialSignature.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { assertOwnerMode } from "../mode/mode.js";
import { canonicalize } from "../utils/json.js";
import { execTicketPayloadSchema, type ExecTicketPayload } from "./execTicketSchema.js";
import { loadWorkOrder, workOrderDigest } from "../workorders/workorderEngine.js";
import type { ActionClass } from "../types.js";

function toBase64Url(bytes: Buffer): string {
  return bytes.toString("base64url");
}

function fromBase64Url(encoded: string): Buffer {
  if (typeof encoded !== "string") throw new TypeError("base64url input must be a string");
  return Buffer.from(encoded, "base64url");
}

export interface ExecTicketInput {
  workspace: string;
  agentId: string;
  workOrderId: string;
  actionClass: ActionClass;
  ttlMs: number;
  toolName?: string;
}

function prepareExecTicket(params: ExecTicketInput): { payload: ExecTicketPayload; payloadBytes: Buffer } {
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
  return { payload, payloadBytes };
}

export function issueExecTicket(params: ExecTicketInput): { ticket: string; payload: ExecTicketPayload } {
  assertOwnerMode(params.workspace, "ticket issue");
  const { payload, payloadBytes } = prepareExecTicket(params);
  const signature = sign(null, payloadBytes, getSigningKey(params.workspace, "config-signature"));
  const ticket = `${toBase64Url(payloadBytes)}.${toBase64Url(signature)}`;
  assertOwnerMode(params.workspace, "ticket issue");
  return {
    ticket,
    payload
  };
}

/** Additive runtime issuer. No token escapes until both committed key and the actual work order are checked again. */
export async function issueExecTicketAsync(params: ExecTicketInput): Promise<{ ticket: string; payload: ExecTicketPayload }> {
  assertOwnerMode(params.workspace, "ticket issue");
  const input = { ...params }, { payload, payloadBytes } = prepareExecTicket(input);
  const signed = await signWithPurposeKey(input.workspace, "config-signature", payloadBytes);
  const current = loadWorkOrder({ workspace: input.workspace, agentId: input.agentId, workOrderId: input.workOrderId, requireValidSignature: true });
  if (workOrderDigest(current) !== payload.workOrderSha256) throw new Error("the work order changed while the execution ticket was signed");
  if (Date.now() > payload.expiresTs) throw new Error("the execution ticket expired while it was signed");
  assertOwnerMode(input.workspace, "ticket issue");
  return { ticket: `${toBase64Url(payloadBytes)}.${toBase64Url(signed.signature)}`, payload };
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
    const validSig = verifyCurrentPurposeCredentialSignature(params.workspace, "config-signature", payloadBytes, signature);
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
