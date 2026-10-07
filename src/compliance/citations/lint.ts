/**
 * Citation linter. Pure: scripts/check-citations.mjs collects the input from
 * the built package and compares the ratcheted findings with
 * scripts/citations-baseline.json; tests pass fixtures directly.
 *
 * CIT001 superseded-as-live  ratcheted (P0-24 flips it to zero tolerance)
 * CIT002 framework-id        malformed id: zero tolerance; not in a filled table or a broken pair: ratcheted
 * CIT003 pack-reference      zero tolerance
 * CIT004 record-incomplete   ratcheted (P1-09 fills the records)
 * CIT005 status-type         zero tolerance
 */
import { resolveRegulatoryInstrument, type RegulatoryInstrument } from "../../domains/packs/regulatorySchema.js";
import { CITATION_STATUS_TYPES, citationRecordSchema } from "./citationRecord.js";
import { FRAMEWORK_ID_FORMATS, frameworkPairViolation, type CitationFramework } from "./frameworkIds.js";
import { isSharedOfficialUrl } from "./officialHosts.js";
import { SUPERSEDED_INSTRUMENTS } from "./supersededInstruments.js";

export type CitationRuleId = "CIT001" | "CIT002" | "CIT003" | "CIT004" | "CIT005";

export const CITATION_RULES: Readonly<Record<CitationRuleId, { name: string; zeroTolerance: boolean; burnDownIssue: string }>> = {
  CIT001: { name: "superseded-as-live", zeroTolerance: false, burnDownIssue: "P0-24" },
  CIT002: { name: "framework-id", zeroTolerance: false, burnDownIssue: "P0-24" },
  CIT003: { name: "pack-reference", zeroTolerance: true, burnDownIssue: "P0-25" },
  CIT004: { name: "record-incomplete", zeroTolerance: false, burnDownIssue: "P1-09" },
  CIT005: { name: "status-type", zeroTolerance: true, burnDownIssue: "P0-25" },
};

export interface CitationFinding {
  rule: CitationRuleId;
  file: string;
  location: string;
  message: string;
  zeroTolerance: boolean;
}

/** Free text that cites instruments; `mustResolve` parts (split on ";") must match a catalogue record. */
export interface CitationTextRef { file: string; location: string; text: string; mustResolve: boolean }
export interface CitationRecordRef { file: string; record: RegulatoryInstrument }
export interface FrameworkIdRef { file: string; location: string; framework: CitationFramework; id: string; label: string }
/** `exact` must equal a registered id; `normalized` may differ in case, "-" and "_". */
export interface PackIdRef { file: string; location: string; id: string; match: "exact" | "normalized" }

export interface CitationLintInput {
  records: readonly CitationRecordRef[];
  textRefs: readonly CitationTextRef[];
  frameworkIds: readonly FrameworkIdRef[];
  packRefs: readonly PackIdRef[];
  knownPackIds: readonly string[];
  /** Ids per framework; an empty list means the table is not filled and membership is not checked. */
  referenceTables: { atlas: readonly string[]; nistAiRmf: readonly string[]; iso42001AnnexA: readonly string[] };
}

const finding = (rule: CitationRuleId, file: string, location: string, message: string, zeroTolerance = CITATION_RULES[rule].zeroTolerance): CitationFinding =>
  ({ rule, file, location, message, zeroTolerance });

const looseId = (id: string) => id.toLowerCase().replace(/[-_]/g, "");

/** The CIT003 resolver: exact match, or case/"-"/"_"-insensitive for `normalized` refs. */
export function resolvesPackId(ref: PackIdRef, knownPackIds: readonly string[]): boolean {
  return ref.match === "exact" ? knownPackIds.includes(ref.id) : knownPackIds.some((id) => looseId(id) === looseId(ref.id));
}

function lintTextRef(ref: CitationTextRef, catalogue: readonly RegulatoryInstrument[]): CitationFinding[] {
  const out: CitationFinding[] = [];
  for (const part of ref.text.split(";").map((p) => p.trim()).filter(Boolean)) {
    const record = resolveRegulatoryInstrument(part, catalogue);
    for (const superseded of SUPERSEDED_INSTRUMENTS) {
      if (!superseded.pattern.test(part)) continue;
      if (record?.status === "repealed" && record.supersededBy) continue;
      const state = record?.status === "repealed" ? `record ${record.id} is repealed without supersededBy`
        : `no repealed catalogue record covers it${record ? ` (the text resolves to ${record.id}, "${record.status}")` : ""}`;
      out.push(finding("CIT001", ref.file, ref.location, `"${part}" cites ${superseded.id}, superseded by ${superseded.replacement}; ${state}`));
    }
    if (ref.mustResolve && !record) out.push(finding("CIT004", ref.file, ref.location, `"${part}" does not resolve to a catalogue record`));
  }
  return out;
}

function lintRecord({ file, record }: CitationRecordRef): CitationFinding[] {
  const out: CitationFinding[] = [];
  const at = `record ${record.id}`;
  const statusType: unknown = record.statusType;
  const badStatusType = statusType !== undefined && !(CITATION_STATUS_TYPES as readonly unknown[]).includes(statusType);
  if (badStatusType) out.push(finding("CIT005", file, at, `statusType ${JSON.stringify(statusType)} is not one of ${CITATION_STATUS_TYPES.join(", ")}`));
  if (record.status === "repealed" && !record.supersededBy) out.push(finding("CIT005", file, at, `status "repealed" requires supersededBy`));

  const candidate: Record<string, unknown> = {
    instrument: record.instrument, clause: record.clause, edition: record.edition, jurisdiction: record.jurisdiction,
    statusType, effectiveDate: record.effectiveDate ?? null, complianceDueDate: record.complianceDueDate ?? null,
    dateNote: record.dateNote, url: record.url, retrievedAt: record.retrievedAt, contentSha256: record.contentSha256,
  };
  const parsed = citationRecordSchema.safeParse(candidate);
  const problems = parsed.success ? [] : parsed.error.issues
    .filter((issue) => !(badStatusType && issue.path[0] === "statusType"))
    .map((issue) => {
      const key = String(issue.path[0] ?? "record");
      return issue.code !== "custom" && candidate[key] === undefined ? `${key} missing` : `${key}: ${issue.message}`;
    });
  if (problems.length) out.push(finding("CIT004", file, at, `incomplete citation record (${problems.join("; ")})`));
  if (record.url && !isSharedOfficialUrl(record.url)) out.push(finding("CIT004", file, at, `url ${record.url} is not an https url on the shared official host list`));
  return out;
}

function lintFrameworkId(ref: FrameworkIdRef, tables: CitationLintInput["referenceTables"]): CitationFinding[] {
  const at = `${ref.location} ${ref.id}`;
  if (!FRAMEWORK_ID_FORMATS[ref.framework].test(ref.id)) {
    return [finding("CIT002", ref.file, at, `${ref.framework} id "${ref.id}" is malformed (expected ${FRAMEWORK_ID_FORMATS[ref.framework].source})`, true)];
  }
  const out: CitationFinding[] = [];
  const table = { atlas: tables.atlas, "nist-ai-rmf": tables.nistAiRmf, "iso-42001": tables.iso42001AnnexA }[ref.framework];
  if (table.length > 0 && !table.includes(ref.id)) out.push(finding("CIT002", ref.file, at, `${ref.framework} id "${ref.id}" is not in the reference table`));
  const pair = frameworkPairViolation(ref.framework, ref.id, ref.label);
  if (pair) out.push(finding("CIT002", ref.file, at, `${pair} (label "${ref.label}")`));
  return out;
}

function lintPackRef(ref: PackIdRef, knownPackIds: readonly string[]): CitationFinding[] {
  if (resolvesPackId(ref, knownPackIds)) return [];
  const near = knownPackIds.find((id) => looseId(id) === looseId(ref.id));
  const hint = near ? ` (did you mean "${near}"?)` : "";
  return [finding("CIT003", ref.file, ref.location, `pack id "${ref.id}" is not a registered pack${hint}`)];
}

export function lintCitations(input: CitationLintInput): CitationFinding[] {
  const catalogue = input.records.map((r) => r.record);
  return [
    ...input.textRefs.flatMap((ref) => lintTextRef(ref, catalogue)),
    ...input.records.flatMap(lintRecord),
    ...input.frameworkIds.flatMap((ref) => lintFrameworkId(ref, input.referenceTables)),
    ...input.packRefs.flatMap((ref) => lintPackRef(ref, input.knownPackIds)),
  ];
}
