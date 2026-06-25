import { passportJsonSchema } from "./passportSchema.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";

export const PASSPORT_SCHEMA_COMPATIBILITY_VERSION = "amc.passport.compatibility.v1";
export const PASSPORT_SCHEMA_ID = "amcpass";
export const CURRENT_PASSPORT_SCHEMA_VERSION = "1";

export const passportSchemaCompatibilityDirections = ["import", "export", "round_trip"] as const;
export type PassportSchemaCompatibilityDirection = typeof passportSchemaCompatibilityDirections[number];
export type PassportSchemaCompatibilityStatus = "compatible" | "incompatible" | "fail_closed";

export interface PassportSchemaCompatibilitySourceCitation {
  sourceId: string;
  title: string;
  url: string;
  retrievedAt: string;
}

export interface PassportSchemaCompatibilityFixture {
  fixtureId: string;
  partnerSystem: string;
  schemaVersion: string;
  direction: PassportSchemaCompatibilityDirection;
  payload: unknown;
  evidenceRefs: string[];
}

export interface PassportSchemaImportExportResult {
  fixtureId: string;
  partnerSystem: string;
  schemaVersion: string;
  direction: PassportSchemaCompatibilityDirection;
  status: PassportSchemaCompatibilityStatus;
  compatible: boolean;
  reasons: string[];
  payloadHash: string | null;
  evidenceRefs: string[];
  resultHash: string;
}

export interface PassportSchemaCompatibilityMatrixRow {
  schemaId: typeof PASSPORT_SCHEMA_ID;
  schemaVersion: string;
  partnerSystem: string;
  importCompatible: boolean | null;
  exportCompatible: boolean | null;
  roundTripCompatible: boolean | null;
  status: PassportSchemaCompatibilityStatus;
  fixtureIds: string[];
  evidenceRefs: string[];
  reasons: string[];
  rowHash: string;
}

export interface BuildPassportSchemaCompatibilityReportInput {
  generatedAt?: string;
  fixtureCorpusId: string;
  sourceCitations: PassportSchemaCompatibilitySourceCitation[];
  fixtures: PassportSchemaCompatibilityFixture[];
}

export interface PassportSchemaCompatibilityReport {
  reportVersion: typeof PASSPORT_SCHEMA_COMPATIBILITY_VERSION;
  schemaId: typeof PASSPORT_SCHEMA_ID;
  currentSchemaVersion: typeof CURRENT_PASSPORT_SCHEMA_VERSION;
  generatedAt: string;
  fixtureCorpusId: string;
  sourceCitations: PassportSchemaCompatibilitySourceCitation[];
  importExportResults: PassportSchemaImportExportResult[];
  compatibilityMatrix: PassportSchemaCompatibilityMatrixRow[];
  reportHash: string;
}

export interface PassportSchemaCompatibilityVerification {
  status: "pass" | "fail_closed";
  reasons: string[];
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function stableHash(value: unknown): string {
  return sha256Hex(Buffer.from(canonicalize(value), "utf8"));
}

function resultHash(result: Omit<PassportSchemaImportExportResult, "resultHash">): string {
  return stableHash(result);
}

function rowHash(row: Omit<PassportSchemaCompatibilityMatrixRow, "rowHash">): string {
  return stableHash(row);
}

function reportHash(report: Omit<PassportSchemaCompatibilityReport, "reportHash">): string {
  return stableHash(report);
}

function validateFixture(fixture: PassportSchemaCompatibilityFixture): PassportSchemaImportExportResult {
  const reasons: string[] = [];
  if (!nonEmpty(fixture.fixtureId)) reasons.push("fixtureId:missing");
  if (!nonEmpty(fixture.partnerSystem)) reasons.push("partnerSystem:missing");
  if (fixture.schemaVersion !== CURRENT_PASSPORT_SCHEMA_VERSION) reasons.push("schemaVersion:unsupported");
  if (!passportSchemaCompatibilityDirections.includes(fixture.direction)) reasons.push("direction:unsupported");
  if (!Array.isArray(fixture.evidenceRefs) || fixture.evidenceRefs.length === 0 || fixture.evidenceRefs.some((ref) => !nonEmpty(ref))) {
    reasons.push("evidenceRefs:missing");
  }
  if (!fixture.payload || typeof fixture.payload !== "object") {
    reasons.push("payload:missing");
  }

  let payloadHash: string | null = null;
  if (fixture.payload && typeof fixture.payload === "object") {
    payloadHash = stableHash(fixture.payload);
    const parsed = passportJsonSchema.safeParse(fixture.payload);
    if (!parsed.success) {
      reasons.push("payload:passport-schema-invalid");
    } else if (fixture.direction === "round_trip") {
      const serialized = JSON.stringify(parsed.data);
      const reparsed = passportJsonSchema.safeParse(JSON.parse(serialized) as unknown);
      if (!reparsed.success || canonicalize(reparsed.data) !== canonicalize(parsed.data)) {
        reasons.push("roundTrip:lossy");
      }
    }
  }

  const status: PassportSchemaCompatibilityStatus = reasons.some((reason) => reason.endsWith(":missing"))
    ? "fail_closed"
    : reasons.length > 0
      ? "incompatible"
      : "compatible";
  const withoutHash: Omit<PassportSchemaImportExportResult, "resultHash"> = {
    fixtureId: fixture.fixtureId,
    partnerSystem: fixture.partnerSystem,
    schemaVersion: fixture.schemaVersion,
    direction: fixture.direction,
    status,
    compatible: status === "compatible",
    reasons,
    payloadHash,
    evidenceRefs: Array.isArray(fixture.evidenceRefs) ? [...fixture.evidenceRefs] : []
  };
  return {
    ...withoutHash,
    resultHash: resultHash(withoutHash)
  };
}

function aggregateMatrix(results: PassportSchemaImportExportResult[]): PassportSchemaCompatibilityMatrixRow[] {
  const groups = new Map<string, PassportSchemaImportExportResult[]>();
  for (const result of results) {
    const key = `${result.partnerSystem}\u0000${result.schemaVersion}`;
    groups.set(key, [...(groups.get(key) ?? []), result]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, rows]) => {
      const first = rows[0]!;
      const byDirection = (direction: PassportSchemaCompatibilityDirection): boolean | null => {
        const directionRows = rows.filter((row) => row.direction === direction);
        if (directionRows.length === 0) return null;
        return directionRows.every((row) => row.compatible);
      };
      const importCompatible = byDirection("import");
      const exportCompatible = byDirection("export");
      const roundTripCompatible = byDirection("round_trip");
      const reasons = rows.flatMap((row) => row.reasons);
      if (importCompatible === null) reasons.push("import:missing");
      if (exportCompatible === null) reasons.push("export:missing");
      if (roundTripCompatible === null) reasons.push("roundTrip:missing");
      const allPresent = importCompatible !== null && exportCompatible !== null && roundTripCompatible !== null;
      const allCompatible = importCompatible === true && exportCompatible === true && roundTripCompatible === true;
      const status: PassportSchemaCompatibilityStatus = !allPresent || rows.some((row) => row.status === "fail_closed")
        ? "fail_closed"
        : allCompatible
          ? "compatible"
          : "incompatible";
      const withoutHash: Omit<PassportSchemaCompatibilityMatrixRow, "rowHash"> = {
        schemaId: PASSPORT_SCHEMA_ID,
        schemaVersion: first.schemaVersion,
        partnerSystem: first.partnerSystem,
        importCompatible,
        exportCompatible,
        roundTripCompatible,
        status,
        fixtureIds: rows.map((row) => row.fixtureId).sort((a, b) => a.localeCompare(b)),
        evidenceRefs: [...new Set(rows.flatMap((row) => row.evidenceRefs))].sort((a, b) => a.localeCompare(b)),
        reasons: [...new Set(reasons)].sort((a, b) => a.localeCompare(b))
      };
      return {
        ...withoutHash,
        rowHash: rowHash(withoutHash)
      };
    });
}

export function buildPassportSchemaCompatibilityReport(
  input: BuildPassportSchemaCompatibilityReportInput
): PassportSchemaCompatibilityReport {
  const importExportResults = input.fixtures.map(validateFixture);
  const compatibilityMatrix = aggregateMatrix(importExportResults);
  const withoutHash: Omit<PassportSchemaCompatibilityReport, "reportHash"> = {
    reportVersion: PASSPORT_SCHEMA_COMPATIBILITY_VERSION,
    schemaId: PASSPORT_SCHEMA_ID,
    currentSchemaVersion: CURRENT_PASSPORT_SCHEMA_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    fixtureCorpusId: input.fixtureCorpusId,
    sourceCitations: input.sourceCitations,
    importExportResults,
    compatibilityMatrix
  };
  return {
    ...withoutHash,
    reportHash: reportHash(withoutHash)
  };
}

export function verifyPassportSchemaCompatibilityReport(report: unknown): PassportSchemaCompatibilityVerification {
  const reasons: string[] = [];
  const candidate = report as Partial<PassportSchemaCompatibilityReport> | null;

  if (!candidate || typeof candidate !== "object") {
    return {
      status: "fail_closed",
      reasons: ["report:missing"]
    };
  }
  if (candidate.reportVersion !== PASSPORT_SCHEMA_COMPATIBILITY_VERSION) reasons.push("reportVersion:unsupported");
  if (candidate.schemaId !== PASSPORT_SCHEMA_ID) reasons.push("schemaId:unsupported");
  if (candidate.currentSchemaVersion !== CURRENT_PASSPORT_SCHEMA_VERSION) reasons.push("currentSchemaVersion:unsupported");
  if (!nonEmpty(candidate.generatedAt) || Number.isNaN(Date.parse(candidate.generatedAt))) reasons.push("generatedAt:invalid");
  if (!nonEmpty(candidate.fixtureCorpusId)) reasons.push("fixtureCorpusId:missing");

  const sourceCitations = Array.isArray(candidate.sourceCitations) ? candidate.sourceCitations : [];
  if (sourceCitations.length === 0) {
    reasons.push("sourceCitations:missing");
  } else {
    for (const citation of sourceCitations) {
      if (!nonEmpty(citation.sourceId) || !nonEmpty(citation.title) || !nonEmpty(citation.url) || !nonEmpty(citation.retrievedAt)) {
        reasons.push("sourceCitation:invalid");
      }
    }
  }

  const results = Array.isArray(candidate.importExportResults) ? candidate.importExportResults : [];
  if (results.length === 0) {
    reasons.push("importExportResults:missing");
  }
  for (const result of results) {
    if (!nonEmpty(result.fixtureId)) reasons.push("importExportResult:fixtureId:missing");
    if (!nonEmpty(result.partnerSystem)) reasons.push("importExportResult:partnerSystem:missing");
    if (result.schemaVersion !== CURRENT_PASSPORT_SCHEMA_VERSION) reasons.push(`importExportResult:${result.fixtureId ?? "unknown"}:schemaVersion:unsupported`);
    if (!passportSchemaCompatibilityDirections.includes(result.direction)) reasons.push(`importExportResult:${result.fixtureId ?? "unknown"}:direction:unsupported`);
    if (result.status !== "compatible") reasons.push(`importExportResult:${result.fixtureId ?? "unknown"}:${result.status ?? "invalid"}`);
    if (!isSha256(result.payloadHash)) reasons.push(`importExportResult:${result.fixtureId ?? "unknown"}:payloadHash:invalid`);
    if (!Array.isArray(result.evidenceRefs) || result.evidenceRefs.length === 0 || result.evidenceRefs.some((ref) => !nonEmpty(ref))) {
      reasons.push(`importExportResult:${result.fixtureId ?? "unknown"}:evidenceRefs:missing`);
    }
    if (!isSha256(result.resultHash)) {
      reasons.push(`importExportResult:${result.fixtureId ?? "unknown"}:resultHash:invalid`);
    } else {
      const { resultHash: _resultHash, ...withoutHash } = result;
      if (result.resultHash !== resultHash(withoutHash)) {
        reasons.push(`importExportResult:${result.fixtureId ?? "unknown"}:resultHash:mismatch`);
      }
    }
  }

  const matrix = Array.isArray(candidate.compatibilityMatrix) ? candidate.compatibilityMatrix : [];
  if (matrix.length === 0) {
    reasons.push("compatibilityMatrix:missing");
  }
  const fullCoverage = matrix.some((row) => row.status === "compatible"
    && row.importCompatible === true
    && row.exportCompatible === true
    && row.roundTripCompatible === true
    && row.schemaId === PASSPORT_SCHEMA_ID
    && row.schemaVersion === CURRENT_PASSPORT_SCHEMA_VERSION);
  if (!fullCoverage) {
    reasons.push("compatibilityMatrix:full-coverage-missing");
  }
  for (const row of matrix) {
    if (row.schemaId !== PASSPORT_SCHEMA_ID) reasons.push(`compatibilityMatrix:${row.partnerSystem ?? "unknown"}:schemaId:unsupported`);
    if (row.schemaVersion !== CURRENT_PASSPORT_SCHEMA_VERSION) reasons.push(`compatibilityMatrix:${row.partnerSystem ?? "unknown"}:schemaVersion:unsupported`);
    if (!nonEmpty(row.partnerSystem)) reasons.push("compatibilityMatrix:partnerSystem:missing");
    if (row.status !== "compatible") reasons.push(`compatibilityMatrix:${row.partnerSystem ?? "unknown"}:${row.status ?? "invalid"}`);
    if (!Array.isArray(row.fixtureIds) || row.fixtureIds.length === 0) reasons.push(`compatibilityMatrix:${row.partnerSystem ?? "unknown"}:fixtureIds:missing`);
    if (!Array.isArray(row.evidenceRefs) || row.evidenceRefs.length === 0) reasons.push(`compatibilityMatrix:${row.partnerSystem ?? "unknown"}:evidenceRefs:missing`);
    if (!isSha256(row.rowHash)) {
      reasons.push(`compatibilityMatrix:${row.partnerSystem ?? "unknown"}:rowHash:invalid`);
    } else {
      const { rowHash: _rowHash, ...withoutHash } = row;
      if (row.rowHash !== rowHash(withoutHash)) {
        reasons.push(`compatibilityMatrix:${row.partnerSystem ?? "unknown"}:rowHash:mismatch`);
      }
    }
  }

  if (!isSha256(candidate.reportHash)) {
    reasons.push("reportHash:missing");
  } else {
    const { reportHash: _reportHash, ...withoutHash } = candidate as PassportSchemaCompatibilityReport;
    if (candidate.reportHash !== reportHash(withoutHash)) {
      reasons.push("reportHash:mismatch");
    }
  }

  return {
    status: reasons.length === 0 ? "pass" : "fail_closed",
    reasons: [...new Set(reasons)]
  };
}
