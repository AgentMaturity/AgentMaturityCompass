import {
  uniqueAuditReasons as unique,
  auditSignedRefValid as signedRefValid,
  auditEvidenceRefsValid as evidenceRefsValid,
  hashAuditEvidence,
  collectAuditSourceIds,
  finalizeAuditEvidenceReceipt,
  beginAuditReceiptVerification,
  finalizeAuditEvidenceExport
} from "../audit/auditEvidenceAccounting.js";

export type ThirdPartyProviderType = "agent" | "model" | "tool" | "data" | "infrastructure" | "other";
export type ThirdPartyProviderDataPosture =
  | "no_customer_data"
  | "restricted_customer_data"
  | "customer_data"
  | "sensitive_data";
export type ThirdPartyContractControlStatus = "active" | "pending" | "expired" | "waived";
export type ThirdPartyProviderExceptionState = "pending" | "approved" | "rejected" | "expired";

export interface ThirdPartyProviderRiskSourceCitation {
  sourceId: string;
  title: string;
  url: string;
  retrievedAt: string;
}

export interface ThirdPartyProviderRiskEvidenceLink {
  eventId: string;
  eventHash: string;
  eventType: string;
  signedEvidenceRef: string;
}

export interface ThirdPartyProviderAttestation {
  attestationId: string;
  attestationType: "soc2" | "iso42001" | "security-questionnaire" | "ai-safety" | "custom";
  issuedAt: string;
  expiresAt: string;
  signedEvidenceRef: string;
  signatureSha256: string;
}

export interface ThirdPartyProviderDataBoundary {
  boundaryId: string;
  dataClasses: string[];
  allowedRegions: string[];
  subprocessors: string[];
  retentionDays: number;
  transferMechanism: string;
  signedEvidenceRef: string;
  signatureSha256: string;
}

export interface ThirdPartyProviderContractualControl {
  controlId: string;
  obligation: string;
  status: ThirdPartyContractControlStatus;
  owner: string;
  reviewDate: string;
  signedEvidenceRef: string;
  signatureSha256: string;
}

export interface ThirdPartyProviderRiskException {
  exceptionId: string;
  state: ThirdPartyProviderExceptionState;
  owner: string;
  reason: string;
  signedEvidenceRef?: string;
  signatureSha256?: string;
}

export interface ThirdPartyProviderRiskRecord {
  providerId: string;
  providerName: string;
  providerType: ThirdPartyProviderType;
  owner: string;
  reviewDate: string;
  nextReviewDate?: string;
  dataProcessingPosture: ThirdPartyProviderDataPosture;
  allowedUseCases: string[];
  modelRestrictions: string[];
  attestations: ThirdPartyProviderAttestation[];
  dataBoundary: ThirdPartyProviderDataBoundary;
  contractualControls: ThirdPartyProviderContractualControl[];
  exceptions?: ThirdPartyProviderRiskException[];
  evidenceRefs: ThirdPartyProviderRiskEvidenceLink[];
  sourceCitationIds?: string[];
}

export interface ThirdPartyProviderRiskRow {
  providerId: string;
  providerName: string;
  providerType: ThirdPartyProviderType;
  owner: string;
  reviewDate: string;
  nextReviewDate: string | null;
  dataProcessingPosture: ThirdPartyProviderDataPosture;
  allowedUseCaseCount: number;
  modelRestrictionCount: number;
  attestationIds: string[];
  attestationCount: number;
  contractualControlIds: string[];
  contractualControlCount: number;
  exceptionStates: ThirdPartyProviderExceptionState[];
  sourceCitationIds: string[];
  dataBoundaryHash: string;
  contractualControlsHash: string;
  attestationsHash: string;
  evidenceRefs: ThirdPartyProviderRiskEvidenceLink[];
  evidenceChainHash: string;
  rowHash: string;
}

export interface ThirdPartyProviderRiskReceipt {
  receiptId: string;
  generatedAt: string;
  sourceCitations: ThirdPartyProviderRiskSourceCitation[];
  rows: ThirdPartyProviderRiskRow[];
  failClosed: boolean;
  failClosedReasons: string[];
  receiptHash: string;
}

export interface ThirdPartyProviderRiskVerification {
  valid: boolean;
  reasons: string[];
}

function rowHash(row: Omit<ThirdPartyProviderRiskRow, "rowHash">): string {
  return hashAuditEvidence(row);
}

function receiptHash(receipt: Omit<ThirdPartyProviderRiskReceipt, "receiptHash">): string {
  return hashAuditEvidence(receipt);
}

function attestationValid(attestation: ThirdPartyProviderAttestation): boolean {
  return Boolean(
    attestation.attestationId
    && attestation.attestationType
    && attestation.issuedAt
    && attestation.expiresAt
    && signedRefValid(attestation)
  );
}

function dataBoundaryValid(boundary: ThirdPartyProviderDataBoundary): boolean {
  return Boolean(
    boundary.boundaryId
    && boundary.dataClasses.length > 0
    && boundary.allowedRegions.length > 0
    && boundary.retentionDays > 0
    && boundary.transferMechanism
    && signedRefValid(boundary)
  );
}

function contractualControlValid(control: ThirdPartyProviderContractualControl): boolean {
  return Boolean(
    control.controlId
    && control.obligation
    && control.status
    && control.owner
    && control.reviewDate
    && signedRefValid(control)
  );
}

function exceptionValid(exception: ThirdPartyProviderRiskException): boolean {
  return Boolean(
    exception.exceptionId
    && exception.state
    && exception.owner
    && exception.reason
    && signedRefValid(exception)
  );
}

export function buildThirdPartyProviderRiskReceipt(input: {
  receiptId: string;
  sourceCitations: ThirdPartyProviderRiskSourceCitation[];
  providers: ThirdPartyProviderRiskRecord[];
  generatedAt?: string;
}): ThirdPartyProviderRiskReceipt {
  const failClosedReasons: string[] = [];
  const sourceIds = collectAuditSourceIds(input.sourceCitations, failClosedReasons);

  const rows = input.providers.map((provider): ThirdPartyProviderRiskRow => {
    const sourceCitationIds = provider.sourceCitationIds ?? [...sourceIds];
    if (sourceCitationIds.length === 0) {
      failClosedReasons.push(`${provider.providerId}:sourceCitation:missing`);
    }
    if (sourceCitationIds.some((sourceId) => !sourceIds.has(sourceId))) {
      failClosedReasons.push(`${provider.providerId}:sourceCitation:unknown`);
    }
    if (!provider.providerId || !provider.providerName || !provider.providerType) {
      failClosedReasons.push(`${provider.providerId}:providerRecord:missing`);
    }
    if (!provider.owner) {
      failClosedReasons.push(`${provider.providerId}:owner:missing`);
    }
    if (!provider.reviewDate) {
      failClosedReasons.push(`${provider.providerId}:reviewDate:missing`);
    }
    if (provider.allowedUseCases.length === 0) {
      failClosedReasons.push(`${provider.providerId}:allowedUseCases:missing`);
    }
    if (provider.attestations.length === 0 || provider.attestations.some((attestation) => !attestationValid(attestation))) {
      failClosedReasons.push(`${provider.providerId}:attestation:invalid`);
    }
    if (!dataBoundaryValid(provider.dataBoundary)) {
      failClosedReasons.push(`${provider.providerId}:dataBoundary:invalid`);
    }
    if (
      provider.contractualControls.length === 0
      || provider.contractualControls.some((control) => !contractualControlValid(control))
    ) {
      failClosedReasons.push(`${provider.providerId}:contractualControl:invalid`);
    }
    for (const exception of provider.exceptions ?? []) {
      if (!exceptionValid(exception)) {
        failClosedReasons.push(`${provider.providerId}:signedException:missing`);
        break;
      }
    }
    if (!evidenceRefsValid(provider.evidenceRefs)) {
      failClosedReasons.push(`${provider.providerId}:evidenceChain:invalid`);
    }

    const baseRow: Omit<ThirdPartyProviderRiskRow, "rowHash"> = {
      providerId: provider.providerId,
      providerName: provider.providerName,
      providerType: provider.providerType,
      owner: provider.owner,
      reviewDate: provider.reviewDate,
      nextReviewDate: provider.nextReviewDate ?? null,
      dataProcessingPosture: provider.dataProcessingPosture,
      allowedUseCaseCount: provider.allowedUseCases.length,
      modelRestrictionCount: provider.modelRestrictions.length,
      attestationIds: provider.attestations.map((attestation) => attestation.attestationId),
      attestationCount: provider.attestations.length,
      contractualControlIds: provider.contractualControls.map((control) => control.controlId),
      contractualControlCount: provider.contractualControls.length,
      exceptionStates: (provider.exceptions ?? []).map((exception) => exception.state),
      sourceCitationIds,
      dataBoundaryHash: hashAuditEvidence(provider.dataBoundary),
      contractualControlsHash: hashAuditEvidence(provider.contractualControls),
      attestationsHash: hashAuditEvidence(provider.attestations),
      evidenceRefs: provider.evidenceRefs,
      evidenceChainHash: hashAuditEvidence(provider.evidenceRefs),
    };
    return {
      ...baseRow,
      rowHash: rowHash(baseRow),
    };
  });

  if (rows.length === 0) {
    failClosedReasons.push("providers:missing");
  }

  return finalizeAuditEvidenceReceipt(input, rows, failClosedReasons);
}

export function verifyThirdPartyProviderRiskReceipt(
  receipt: ThirdPartyProviderRiskReceipt
): ThirdPartyProviderRiskVerification {
  const reasons = beginAuditReceiptVerification(receipt, "providers:missing");
  for (const row of receipt.rows) {
    const { rowHash: actualRowHash, ...withoutRowHash } = row;
    if (rowHash(withoutRowHash) !== actualRowHash) {
      reasons.push(`${row.providerId}:rowHash:mismatch`);
    }
    if (!row.providerId || !row.providerName) {
      reasons.push(`${row.providerId}:providerRecord:missing`);
    }
    if (!row.owner) {
      reasons.push(`${row.providerId}:owner:missing`);
    }
    if (!row.reviewDate) {
      reasons.push(`${row.providerId}:reviewDate:missing`);
    }
    if (row.attestationCount === 0) {
      reasons.push(`${row.providerId}:attestation:invalid`);
    }
    if (row.contractualControlCount === 0) {
      reasons.push(`${row.providerId}:contractualControl:invalid`);
    }
    if (!evidenceRefsValid(row.evidenceRefs)) {
      reasons.push(`${row.providerId}:evidenceChain:invalid`);
    }
  }
  const { receiptHash: actualReceiptHash, ...withoutReceiptHash } = receipt;
  if (receiptHash(withoutReceiptHash) !== actualReceiptHash) {
    reasons.push("receiptHash:mismatch");
  }
  return {
    valid: reasons.length === 0,
    reasons: unique(reasons),
  };
}

export function renderThirdPartyProviderRiskAuditExport(receipt: ThirdPartyProviderRiskReceipt): string {
  const lines: string[] = [];
  lines.push("# AMC Third-Party Provider Risk Audit Export");
  lines.push("");
  lines.push(`- Receipt: \`${receipt.receiptId}\``);
  lines.push(`- Generated: \`${receipt.generatedAt}\``);
  lines.push(`- Status: ${receipt.failClosed ? "FAIL-CLOSED" : "VALID"}`);
  lines.push(`- Receipt hash: \`${receipt.receiptHash}\``);
  lines.push("");
  lines.push("## Source Citations");
  for (const citation of receipt.sourceCitations) {
    lines.push(`- ${citation.sourceId}: ${citation.title} (${citation.url})`);
  }
  lines.push("");
  lines.push("## Provider Rows");
  lines.push("");
  lines.push("| Provider | Type | Owner | Review date | Data posture | Attestations | Contract controls | Exceptions | Evidence chain |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of receipt.rows) {
    const values = [
      row.providerId,
      row.providerType,
      row.owner || "MISSING",
      row.reviewDate || "MISSING",
      row.dataProcessingPosture,
      row.attestationIds.join(", ") || String(row.attestationCount),
      row.contractualControlIds.join(", ") || String(row.contractualControlCount),
      row.exceptionStates.join(", ") || "none",
      `Evidence chain ${row.evidenceChainHash}`,
    ];
    lines.push(`| ${values.map((value) => value.replace(/\|/g, "\\|")).join(" | ")} |`);
  }
  return finalizeAuditEvidenceExport(lines, receipt);
}
