import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import type { ComplianceMapping } from "./mappingSchema.js";

export type ControlCrosswalkExceptionState = "none" | "pending" | "approved" | "rejected" | "expired";

export interface ControlCrosswalkSourceCitation {
  sourceId: string;
  title: string;
  url: string;
  retrievedAt: string;
}

export interface ControlCrosswalkEvidenceLink {
  eventId: string;
  eventHash: string;
  evidenceType: string;
  signedEvidenceRef: string;
}

export interface ControlCrosswalkException {
  mappingId: string;
  exceptionId: string;
  state: Exclude<ControlCrosswalkExceptionState, "none">;
  owner: string;
  reason: string;
  signedEvidenceRef?: string;
  signatureSha256?: string;
}

export interface ControlCrosswalkRow {
  mappingId: string;
  framework: string;
  frameworkClause: string;
  amcQuestionIds: string[];
  evidenceTypes: string[];
  owner: string;
  exceptionState: ControlCrosswalkExceptionState;
  exceptionId: string | null;
  sourceCitationIds: string[];
  evidenceRefs: ControlCrosswalkEvidenceLink[];
  evidenceChainHash: string;
  rowHash: string;
}

export interface ControlCrosswalkReceipt {
  receiptId: string;
  generatedAt: string;
  sourceCitations: ControlCrosswalkSourceCitation[];
  rows: ControlCrosswalkRow[];
  exceptions: ControlCrosswalkException[];
  failClosed: boolean;
  failClosedReasons: string[];
  receiptHash: string;
}

export interface ControlCrosswalkVerification {
  valid: boolean;
  reasons: string[];
}

function evidenceTypesFor(mapping: ComplianceMapping): string[] {
  const values = new Set<string>();
  for (const requirement of mapping.evidenceRequirements) {
    if (requirement.type === "requires_evidence_event") {
      for (const eventType of requirement.eventTypes) {
        values.add(eventType);
      }
    } else if (requirement.type === "requires_assurance_pack") {
      values.add(`assurance_pack:${requirement.packId}`);
    } else {
      values.add("audit_absence");
    }
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}

function isSha256(value: string | undefined): boolean {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function hashRow(row: Omit<ControlCrosswalkRow, "rowHash">): string {
  return sha256Hex(canonicalize(row));
}

function receiptHash(receipt: Omit<ControlCrosswalkReceipt, "receiptHash">): string {
  return sha256Hex(canonicalize(receipt));
}

export function buildControlCrosswalkReceipt(input: {
  receiptId: string;
  mappings: ComplianceMapping[];
  sourceCitations: ControlCrosswalkSourceCitation[];
  ownersByMappingId: Record<string, string | undefined>;
  evidenceByMappingId: Record<string, ControlCrosswalkEvidenceLink[] | undefined>;
  exceptions?: ControlCrosswalkException[];
  generatedAt?: string;
}): ControlCrosswalkReceipt {
  const failClosedReasons: string[] = [];
  const sourceCitationIds = input.sourceCitations.map((citation) => citation.sourceId).filter(Boolean);
  if (sourceCitationIds.length === 0) {
    failClosedReasons.push("sourceCitations:missing");
  }

  const exceptions = input.exceptions ?? [];
  const exceptionByMappingId = new Map(exceptions.map((exception) => [exception.mappingId, exception]));
  const rows: ControlCrosswalkRow[] = input.mappings.map((mapping) => {
    const owner = input.ownersByMappingId[mapping.id] ?? "";
    const evidenceRefs = input.evidenceByMappingId[mapping.id] ?? [];
    const exception = exceptionByMappingId.get(mapping.id);
    const evidenceTypes = evidenceTypesFor(mapping);
    const baseRow: Omit<ControlCrosswalkRow, "rowHash"> = {
      mappingId: mapping.id,
      framework: mapping.framework,
      frameworkClause: mapping.category,
      amcQuestionIds: [...mapping.related.questions],
      evidenceTypes,
      owner,
      exceptionState: exception?.state ?? "none",
      exceptionId: exception?.exceptionId ?? null,
      sourceCitationIds,
      evidenceRefs,
      evidenceChainHash: sha256Hex(canonicalize(evidenceRefs)),
    };

    if (!mapping.category) {
      failClosedReasons.push(`${mapping.id}:frameworkClause:missing`);
    }
    if (mapping.related.questions.length === 0) {
      failClosedReasons.push(`${mapping.id}:amcQuestionIds:missing`);
    }
    if (evidenceTypes.length === 0) {
      failClosedReasons.push(`${mapping.id}:evidenceTypes:missing`);
    }
    if (!owner) {
      failClosedReasons.push(`${mapping.id}:owner:missing`);
    }
    if (evidenceRefs.length === 0) {
      failClosedReasons.push(`${mapping.id}:evidenceChain:missing`);
    }
    for (const evidence of evidenceRefs) {
      if (!isSha256(evidence.eventHash) || !evidence.signedEvidenceRef) {
        failClosedReasons.push(`${mapping.id}:evidenceChain:invalid`);
        break;
      }
    }
    if (exception && (!exception.signedEvidenceRef || !isSha256(exception.signatureSha256))) {
      failClosedReasons.push(`${mapping.id}:signedException:missing`);
    }

    return {
      ...baseRow,
      rowHash: hashRow(baseRow),
    };
  });

  const withoutHash: Omit<ControlCrosswalkReceipt, "receiptHash"> = {
    receiptId: input.receiptId,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sourceCitations: input.sourceCitations,
    rows,
    exceptions,
    failClosed: failClosedReasons.length > 0,
    failClosedReasons: [...new Set(failClosedReasons)],
  };
  return {
    ...withoutHash,
    receiptHash: receiptHash(withoutHash),
  };
}

export function verifyControlCrosswalkReceipt(receipt: ControlCrosswalkReceipt): ControlCrosswalkVerification {
  const reasons: string[] = [];
  if (receipt.failClosed) {
    reasons.push(...receipt.failClosedReasons);
  }
  if (receipt.rows.length === 0) {
    reasons.push("rows:missing");
  }
  if (receipt.sourceCitations.length === 0) {
    reasons.push("sourceCitations:missing");
  }
  for (const row of receipt.rows) {
    const { rowHash: actual, ...baseRow } = row;
    if (hashRow(baseRow) !== actual) {
      reasons.push(`${row.mappingId}:rowHash:mismatch`);
    }
    if (!row.owner) {
      reasons.push(`${row.mappingId}:owner:missing`);
    }
    if (row.evidenceRefs.length === 0) {
      reasons.push(`${row.mappingId}:evidenceChain:missing`);
    }
  }
  const { receiptHash: actualReceiptHash, ...withoutHash } = receipt;
  if (receiptHash(withoutHash) !== actualReceiptHash) {
    reasons.push("receiptHash:mismatch");
  }
  return {
    valid: reasons.length === 0,
    reasons: [...new Set(reasons)],
  };
}

export function renderControlCrosswalkAuditExport(receipt: ControlCrosswalkReceipt): string {
  const lines: string[] = [];
  lines.push("# AMC Control Crosswalk Audit Export");
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
  lines.push("## Control Rows");
  lines.push("");
  lines.push("| Framework | Clause | AMC Questions | Evidence Types | Owner | Exception | Evidence chain |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const row of receipt.rows) {
    lines.push([
      row.framework,
      row.frameworkClause,
      row.amcQuestionIds.join(", "),
      row.evidenceTypes.join(", "),
      row.owner || "MISSING",
      `Exception: ${row.exceptionState}`,
      `Evidence chain ${row.evidenceChainHash}`,
    ].map((value) => value.replace(/\|/g, "\\|")).join(" | ").replace(/^/, "| ").concat(" |"));
  }
  if (receipt.failClosedReasons.length > 0) {
    lines.push("");
    lines.push("## Fail-Closed Reasons");
    for (const reason of receipt.failClosedReasons) {
      lines.push(`- ${reason}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}
