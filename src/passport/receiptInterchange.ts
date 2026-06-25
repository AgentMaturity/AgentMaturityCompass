import { sign, verify } from "node:crypto";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";

export const INTEROPERABLE_RECEIPT_SCHEMA_VERSION = "amc.receipt.interchange.v1";
export const interoperableReceiptKinds = ["score", "policy", "tool", "audit", "lifecycle"] as const;

export type InteroperableReceiptKind = typeof interoperableReceiptKinds[number];

export interface InteroperableReceiptSourceCitation {
  sourceId: string;
  title: string;
  url: string;
  retrievedAt: string;
}

export interface InteroperableReceiptIssuer {
  platform: string;
  workspaceId: string;
  keyFingerprint: string;
}

export interface InteroperableReceiptSubject {
  agentId: string;
  passportId?: string;
}

export interface InteroperableReceiptEventRef {
  eventId: string;
  eventHash: string;
  sourceReceiptRef: string;
}

export interface InteroperableReceiptSignature {
  algorithm: "ed25519";
  publicKeyFingerprint: string;
  value: string;
}

export interface InteroperableReceipt {
  schemaVersion: typeof INTEROPERABLE_RECEIPT_SCHEMA_VERSION;
  receiptId: string;
  kind: InteroperableReceiptKind;
  issuedAt: string;
  issuer: InteroperableReceiptIssuer;
  subject: InteroperableReceiptSubject;
  eventRef: InteroperableReceiptEventRef;
  payload: Record<string, unknown>;
  payloadHash: string;
  evidenceRefs: string[];
  sourceCitations: InteroperableReceiptSourceCitation[];
  signature: InteroperableReceiptSignature;
}

export interface BuildInteroperableReceiptInput {
  receiptId: string;
  kind: InteroperableReceiptKind;
  issuedAt?: string;
  issuer: InteroperableReceiptIssuer;
  subject: InteroperableReceiptSubject;
  eventRef: InteroperableReceiptEventRef;
  payload: Record<string, unknown>;
  evidenceRefs: string[];
  sourceCitations: InteroperableReceiptSourceCitation[];
  privateKeyPem: string;
  publicKeyPem: string;
}

export interface InteroperableReceiptVerification {
  valid: boolean;
  reasons: string[];
}

export const interoperableReceiptJsonSchema = {
  $id: INTEROPERABLE_RECEIPT_SCHEMA_VERSION,
  type: "object",
  required: [
    "schemaVersion",
    "receiptId",
    "kind",
    "issuedAt",
    "issuer",
    "subject",
    "eventRef",
    "payload",
    "payloadHash",
    "evidenceRefs",
    "sourceCitations",
    "signature"
  ],
  properties: {
    schemaVersion: { const: INTEROPERABLE_RECEIPT_SCHEMA_VERSION },
    receiptId: { type: "string" },
    kind: { enum: [...interoperableReceiptKinds] },
    issuedAt: { type: "string", format: "date-time" },
    issuer: {
      type: "object",
      required: ["platform", "workspaceId", "keyFingerprint"],
      properties: {
        platform: { type: "string" },
        workspaceId: { type: "string" },
        keyFingerprint: { type: "string" }
      }
    },
    subject: {
      type: "object",
      required: ["agentId"],
      properties: {
        agentId: { type: "string" },
        passportId: { type: "string" }
      }
    },
    eventRef: {
      type: "object",
      required: ["eventId", "eventHash", "sourceReceiptRef"],
      properties: {
        eventId: { type: "string" },
        eventHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
        sourceReceiptRef: { type: "string" }
      }
    },
    payload: { type: "object" },
    payloadHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
    evidenceRefs: {
      type: "array",
      items: { type: "string" }
    },
    sourceCitations: {
      type: "array",
      items: { type: "object" }
    },
    signature: {
      type: "object",
      required: ["algorithm", "publicKeyFingerprint", "value"],
      properties: {
        algorithm: { const: "ed25519" },
        publicKeyFingerprint: { type: "string" },
        value: { type: "string" }
      }
    }
  }
} as const;

function nonEmpty(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isSha256(value: string | undefined): boolean {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function payloadHash(payload: Record<string, unknown>): string {
  return sha256Hex(Buffer.from(canonicalize(payload), "utf8"));
}

function publicKeyFingerprint(publicKeyPem: string): string {
  return sha256Hex(Buffer.from(publicKeyPem, "utf8")).slice(0, 16);
}

function signingBytes(receipt: Omit<InteroperableReceipt, "signature">): Buffer {
  return Buffer.from(canonicalize(receipt), "utf8");
}

function signatureBytesFromBase64(value: string): Buffer {
  return Buffer.from(value, "base64");
}

function requiredPayloadReasons(kind: InteroperableReceiptKind, payload: Record<string, unknown>): string[] {
  const reasons: string[] = [];
  const has = (key: string) => Object.prototype.hasOwnProperty.call(payload, key)
    && payload[key] !== null
    && payload[key] !== "";

  if (kind === "score") {
    if (!has("claimId")) reasons.push("payload:score:missing");
    if (!has("questionId")) reasons.push("payload:score:questionId:missing");
    if (typeof payload.score !== "number") reasons.push("payload:score:score:missing");
    if (!has("level")) reasons.push("payload:score:level:missing");
  }
  if (kind === "policy") {
    if (!has("policyId")) reasons.push("payload:policy:missing");
    if (!has("decision")) reasons.push("payload:policy:decision:missing");
  }
  if (kind === "tool") {
    if (!has("toolId") || !has("callId")) reasons.push("payload:tool:missing");
  }
  if (kind === "audit") {
    if (!has("auditId") || !has("severity")) reasons.push("payload:audit:missing");
  }
  if (kind === "lifecycle") {
    if (!has("lifecycleId") || !has("stage")) reasons.push("payload:lifecycle:missing");
  }
  return reasons;
}

export function buildInteroperableReceipt(input: BuildInteroperableReceiptInput): InteroperableReceipt {
  const withoutSignature: Omit<InteroperableReceipt, "signature"> = {
    schemaVersion: INTEROPERABLE_RECEIPT_SCHEMA_VERSION,
    receiptId: input.receiptId,
    kind: input.kind,
    issuedAt: input.issuedAt ?? new Date().toISOString(),
    issuer: input.issuer,
    subject: input.subject,
    eventRef: input.eventRef,
    payload: input.payload,
    payloadHash: payloadHash(input.payload),
    evidenceRefs: input.evidenceRefs,
    sourceCitations: input.sourceCitations
  };
  const signature = sign(null, signingBytes(withoutSignature), input.privateKeyPem).toString("base64");
  return {
    ...withoutSignature,
    signature: {
      algorithm: "ed25519",
      publicKeyFingerprint: publicKeyFingerprint(input.publicKeyPem),
      value: signature
    }
  };
}

export function serializeInteroperableReceipt(receipt: InteroperableReceipt): string {
  return JSON.stringify(receipt, null, 2);
}

export function parseInteroperableReceipt(serialized: string): InteroperableReceipt {
  return JSON.parse(serialized) as InteroperableReceipt;
}

export function verifyInteroperableReceipt(
  receipt: InteroperableReceipt,
  publicKeysPem: string[]
): InteroperableReceiptVerification {
  const reasons: string[] = [];
  if (receipt.schemaVersion !== INTEROPERABLE_RECEIPT_SCHEMA_VERSION) {
    reasons.push("schemaVersion:unsupported");
  }
  if (!interoperableReceiptKinds.includes(receipt.kind)) {
    reasons.push("kind:unsupported");
  }
  if (!nonEmpty(receipt.receiptId)) reasons.push("receiptId:missing");
  if (!nonEmpty(receipt.issuedAt) || Number.isNaN(Date.parse(receipt.issuedAt))) reasons.push("issuedAt:invalid");
  if (!nonEmpty(receipt.issuer?.platform)) reasons.push("issuer.platform:missing");
  if (!nonEmpty(receipt.issuer?.workspaceId)) reasons.push("issuer.workspaceId:missing");
  if (!nonEmpty(receipt.issuer?.keyFingerprint)) reasons.push("issuer.keyFingerprint:missing");
  if (!nonEmpty(receipt.subject?.agentId)) reasons.push("subject.agentId:missing");
  if (!nonEmpty(receipt.eventRef?.eventId)) reasons.push("eventRef.eventId:missing");
  if (!isSha256(receipt.eventRef?.eventHash)) reasons.push("eventRef.eventHash:invalid");
  if (!nonEmpty(receipt.eventRef?.sourceReceiptRef)) reasons.push("eventRef.sourceReceiptRef:missing");
  if (!receipt.evidenceRefs || receipt.evidenceRefs.length === 0 || receipt.evidenceRefs.some((ref) => !nonEmpty(ref))) {
    reasons.push("evidenceRefs:missing");
  }
  if (!receipt.sourceCitations || receipt.sourceCitations.length === 0) {
    reasons.push("sourceCitations:missing");
  } else {
    for (const citation of receipt.sourceCitations) {
      if (!nonEmpty(citation.sourceId) || !nonEmpty(citation.title) || !nonEmpty(citation.url) || !nonEmpty(citation.retrievedAt)) {
        reasons.push(`sourceCitation:${citation.sourceId || "unknown"}:invalid`);
      }
    }
  }
  reasons.push(...requiredPayloadReasons(receipt.kind, receipt.payload ?? {}));
  if (!isSha256(receipt.payloadHash)) {
    reasons.push("payloadHash:invalid");
  } else if (receipt.payloadHash !== payloadHash(receipt.payload ?? {})) {
    reasons.push("payloadHash:mismatch");
  }
  if (receipt.signature?.algorithm !== "ed25519") {
    reasons.push("signature.algorithm:unsupported");
  }
  if (!nonEmpty(receipt.signature?.publicKeyFingerprint)) {
    reasons.push("signature.publicKeyFingerprint:missing");
  }
  if (!nonEmpty(receipt.signature?.value)) {
    reasons.push("signature:missing");
  }

  if (reasons.length === 0) {
    const { signature: _signature, ...withoutSignature } = receipt;
    const bytes = signingBytes(withoutSignature);
    const signatureBytes = signatureBytesFromBase64(receipt.signature.value);
    const ok = publicKeysPem.some((publicKeyPem) => verify(null, bytes, publicKeyPem, signatureBytes));
    if (!ok) {
      reasons.push("signature:invalid");
    }
  }

  return {
    valid: reasons.length === 0,
    reasons: [...new Set(reasons)]
  };
}
