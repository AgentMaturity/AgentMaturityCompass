import { hasNonBlankEvidenceRef } from "./evidenceRefs.js";

function isPresent(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined;
}

/** Count caller-supplied proof fields; this does not authenticate their contents. */
export function collectLiveDriftProofStats<P extends object, R extends {
  traceId: string;
  evidenceRefs?: readonly unknown[] | null;
  signedEvidenceRefs?: readonly unknown[] | null;
}>(
  proof: P,
  rows: R[],
  metadataFields: ReadonlyArray<keyof P & string>,
  rowFields: ReadonlyArray<keyof R>,
  metadataMismatchReasons: (proof: P) => string[],
): { present: number; total: number; missingReasons: string[] } {
  let present = 0;
  let total = 0;
  const missingReasons: string[] = [];

  for (const field of metadataFields) {
    total += 1;
    if (isPresent(proof[field])) {
      present += 1;
    } else {
      missingReasons.push(field);
    }
  }

  const mismatches = metadataMismatchReasons(proof);
  total += mismatches.length;
  missingReasons.push(...mismatches);

  for (const row of rows) {
    for (const field of rowFields) {
      total += 1;
      if (isPresent(row[field])) {
        present += 1;
      } else {
        missingReasons.push(`${row.traceId}.${String(field)}`);
      }
    }
    total += 2;
    if (hasNonBlankEvidenceRef(row.evidenceRefs)) {
      present += 1;
    } else {
      missingReasons.push(`${row.traceId}.evidenceRefs`);
    }
    if (hasNonBlankEvidenceRef(row.signedEvidenceRefs)) {
      present += 1;
    } else {
      missingReasons.push(`${row.traceId}.signedEvidenceRefs`);
    }
  }

  return { present, total, missingReasons };
}
