import { randomUUID } from "node:crypto";
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { validateSchema, type SchemaDefinition, type SchemaValidation } from "../enforce/schemaGate.js";
import type { ActionClass } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export type ToolSchemaContractPhase = "beforeExecution" | "afterExecution";

export interface ToolSchemaContractSourceCitation {
  sourceId: string;
  title: string;
  url: string;
  retrievedAt: string;
}

export interface ToolSchemaSideEffectDeclaration {
  resources: string[];
  externalSystems: string[];
  dataClasses: string[];
  irreversible: boolean;
  approvalRequired: boolean;
}

export interface ToolSchemaObservedSideEffects {
  resources: string[];
  externalSystems: string[];
  dataClasses: string[];
  irreversible: boolean;
}

export interface SignedToolSchemaContract {
  schemaVersion: "2026-06-25";
  contractId: string;
  toolName: string;
  actionClass: ActionClass;
  inputSchema: SchemaDefinition;
  outputSchema: SchemaDefinition;
  sideEffectDeclaration: ToolSchemaSideEffectDeclaration;
  failureModes: string[];
  sourceCitations: ToolSchemaContractSourceCitation[];
  contractDigestSha256: string;
  contractSignature: string;
  signer: "auditor";
  signedTs: number;
}

export interface ToolSchemaSideEffectValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ToolSchemaContractReceipt {
  schemaVersion: "2026-06-25";
  receiptId: string;
  createdAt: string;
  phase: ToolSchemaContractPhase;
  contract: SignedToolSchemaContract;
  contractId: string;
  toolName: string;
  actionClass: ActionClass;
  contractDigestSha256: string;
  contractSignature: string;
  contractSignatureValid: boolean;
  inputValidation: SchemaValidation;
  outputValidation: SchemaValidation;
  sideEffectDeclaration: ToolSchemaSideEffectDeclaration;
  observedSideEffects: ToolSchemaObservedSideEffects;
  sideEffectValidation: ToolSchemaSideEffectValidation;
  approvalReceiptId: string | null;
  driftFindings: string[];
  allowed: boolean;
  blockBeforeExecution: boolean;
  metadataOnlyAccepted: false;
  surfaceBinding: ["Enforce", "Shield", "Vault", "Watch"];
  receiptHash: string;
}

export interface ToolSchemaContractReceiptVerification {
  valid: boolean;
  failClosedReasons: string[];
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function unsignedContractPayload(contract: {
  schemaVersion?: "2026-06-25";
  contractId: string;
  toolName: string;
  actionClass: ActionClass;
  inputSchema: SchemaDefinition;
  outputSchema: SchemaDefinition;
  sideEffectDeclaration: ToolSchemaSideEffectDeclaration;
  failureModes: string[];
  sourceCitations: ToolSchemaContractSourceCitation[];
}) {
  return {
    schemaVersion: contract.schemaVersion ?? "2026-06-25",
    contractId: contract.contractId,
    toolName: contract.toolName,
    actionClass: contract.actionClass,
    inputSchema: contract.inputSchema,
    outputSchema: contract.outputSchema,
    sideEffectDeclaration: {
      resources: unique(contract.sideEffectDeclaration.resources),
      externalSystems: unique(contract.sideEffectDeclaration.externalSystems),
      dataClasses: unique(contract.sideEffectDeclaration.dataClasses),
      irreversible: contract.sideEffectDeclaration.irreversible === true,
      approvalRequired: contract.sideEffectDeclaration.approvalRequired === true
    },
    failureModes: unique(contract.failureModes),
    sourceCitations: contract.sourceCitations
  };
}

function contractDigest(contract: SignedToolSchemaContract): string {
  return sha256Hex(canonicalize(unsignedContractPayload(contract)));
}

function receiptHashFor(receipt: ToolSchemaContractReceipt): string {
  return sha256Hex(canonicalize({ ...receipt, receiptHash: "" }));
}

function verifyContractSignature(workspace: string, contract: SignedToolSchemaContract): boolean {
  if (!contract.contractSignature || !contract.contractDigestSha256) {
    return false;
  }
  const digest = contractDigest(contract);
  if (digest !== contract.contractDigestSha256) {
    return false;
  }
  return verifyHexDigestAny(digest, contract.contractSignature, getPublicKeyHistory(workspace, "auditor"));
}

function validateSideEffects(input: {
  declaration: ToolSchemaSideEffectDeclaration;
  observed: ToolSchemaObservedSideEffects;
  approvalReceiptId?: string | null;
}): ToolSchemaSideEffectValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const declaredResources = new Set(input.declaration.resources);
  const declaredSystems = new Set(input.declaration.externalSystems);
  const declaredClasses = new Set(input.declaration.dataClasses);

  for (const resource of unique(input.observed.resources)) {
    if (!declaredResources.has(resource)) {
      errors.push(`resource not declared: ${resource}`);
    }
  }
  for (const system of unique(input.observed.externalSystems)) {
    if (!declaredSystems.has(system)) {
      errors.push(`external system not declared: ${system}`);
    }
  }
  for (const dataClass of unique(input.observed.dataClasses)) {
    if (!declaredClasses.has(dataClass)) {
      errors.push(`data class not declared: ${dataClass}`);
    }
  }
  if (input.observed.irreversible && !input.declaration.irreversible) {
    errors.push("irreversible side effect not declared");
  }
  if (input.declaration.approvalRequired && !input.approvalReceiptId) {
    errors.push("approval required but missing");
  }
  if (!input.observed.irreversible && input.declaration.irreversible) {
    warnings.push("irreversible side effect declared but not observed");
  }
  return { valid: errors.length === 0, errors, warnings };
}

function outputNotObservedValidation(phase: ToolSchemaContractPhase): SchemaValidation {
  if (phase === "afterExecution") {
    return {
      valid: false,
      errors: ["Output evidence is required after execution"],
      warnings: [],
      coercionAttempts: []
    };
  }
  return {
    valid: true,
    errors: [],
    warnings: ["Output evidence not observed before execution"],
    coercionAttempts: []
  };
}

export function createSignedToolSchemaContract(input: {
  workspace: string;
  contractId: string;
  toolName: string;
  actionClass: ActionClass;
  inputSchema: SchemaDefinition;
  outputSchema: SchemaDefinition;
  sideEffectDeclaration: ToolSchemaSideEffectDeclaration;
  failureModes: string[];
  sourceCitations?: ToolSchemaContractSourceCitation[];
}): SignedToolSchemaContract {
  const payload = unsignedContractPayload({
    schemaVersion: "2026-06-25",
    contractId: input.contractId,
    toolName: input.toolName,
    actionClass: input.actionClass,
    inputSchema: input.inputSchema,
    outputSchema: input.outputSchema,
    sideEffectDeclaration: input.sideEffectDeclaration,
    failureModes: input.failureModes,
    sourceCitations: input.sourceCitations ?? []
  });
  const digest = sha256Hex(canonicalize(payload));
  return {
    ...payload,
    contractDigestSha256: digest,
    contractSignature: signHexDigest(digest, getPrivateKeyPem(input.workspace, "auditor")),
    signer: "auditor",
    signedTs: Date.now()
  };
}

export function validateToolSchemaContractInvocation(input: {
  workspace: string;
  contract: SignedToolSchemaContract;
  phase: ToolSchemaContractPhase;
  input: unknown;
  output?: unknown;
  observedSideEffects: ToolSchemaObservedSideEffects;
  approvalReceiptId?: string | null;
}): ToolSchemaContractReceipt {
  const contractSignatureValid = verifyContractSignature(input.workspace, input.contract);
  const inputValidation = validateSchema(input.input, input.contract.inputSchema);
  const outputValidation =
    input.output === undefined ? outputNotObservedValidation(input.phase) : validateSchema(input.output, input.contract.outputSchema);
  const sideEffectValidation = validateSideEffects({
    declaration: input.contract.sideEffectDeclaration,
    observed: input.observedSideEffects,
    approvalReceiptId: input.approvalReceiptId ?? null
  });
  const driftFindings: string[] = [];
  if (!contractSignatureValid) {
    driftFindings.push("contract_signature_invalid");
  }
  if (!inputValidation.valid) {
    driftFindings.push("input_schema_violation");
  }
  if (!outputValidation.valid) {
    driftFindings.push("output_schema_violation");
  }
  if (!sideEffectValidation.valid) {
    driftFindings.push("side_effect_drift");
  }
  if (sideEffectValidation.errors.some((error) => error.includes("approval required"))) {
    driftFindings.push("approval_required");
  }

  const allowed = contractSignatureValid && inputValidation.valid && outputValidation.valid && sideEffectValidation.valid;
  const baseReceipt: ToolSchemaContractReceipt = {
    schemaVersion: "2026-06-25",
    receiptId: `toolcontract_${randomUUID().replace(/-/g, "")}`,
    createdAt: new Date().toISOString(),
    phase: input.phase,
    contract: input.contract,
    contractId: input.contract.contractId,
    toolName: input.contract.toolName,
    actionClass: input.contract.actionClass,
    contractDigestSha256: input.contract.contractDigestSha256,
    contractSignature: input.contract.contractSignature,
    contractSignatureValid,
    inputValidation,
    outputValidation,
    sideEffectDeclaration: input.contract.sideEffectDeclaration,
    observedSideEffects: input.observedSideEffects,
    sideEffectValidation,
    approvalReceiptId: input.approvalReceiptId ?? null,
    driftFindings: unique(driftFindings),
    allowed,
    blockBeforeExecution: input.phase === "beforeExecution" && !allowed,
    metadataOnlyAccepted: false,
    surfaceBinding: ["Enforce", "Shield", "Vault", "Watch"],
    receiptHash: ""
  };
  return {
    ...baseReceipt,
    receiptHash: receiptHashFor(baseReceipt)
  };
}

export function verifyToolSchemaContractReceipt(input: {
  workspace: string;
  receipt: ToolSchemaContractReceipt;
}): ToolSchemaContractReceiptVerification {
  const reasons: string[] = [];
  const receipt = input.receipt;
  if (receipt.metadataOnlyAccepted !== false) {
    reasons.push("tool-schema-contract:metadata-only:not-accepted");
  }
  if (receipt.receiptHash !== receiptHashFor(receipt)) {
    reasons.push("tool-schema-contract:receipt-hash:mismatch");
  }
  if (!verifyContractSignature(input.workspace, receipt.contract) || receipt.contractSignatureValid !== true) {
    reasons.push("tool-schema-contract:signature:invalid");
  }
  if (!receipt.inputValidation || !Array.isArray(receipt.inputValidation.errors)) {
    reasons.push("tool-schema-contract:input-validation:missing");
  }
  if (!receipt.outputValidation || !Array.isArray(receipt.outputValidation.errors)) {
    reasons.push("tool-schema-contract:output-validation:missing");
  }
  if (!receipt.sideEffectValidation || !Array.isArray(receipt.sideEffectValidation.errors)) {
    reasons.push("tool-schema-contract:side-effect-validation:missing");
  }
  if (!receipt.surfaceBinding.includes("Enforce") || !receipt.surfaceBinding.includes("Shield") || !receipt.surfaceBinding.includes("Vault")) {
    reasons.push("tool-schema-contract:surface-binding:missing");
  }
  const uniqueReasons = unique(reasons);
  return { valid: uniqueReasons.length === 0, failClosedReasons: uniqueReasons };
}
