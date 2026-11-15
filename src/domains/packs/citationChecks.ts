/**
 * One check record per Industry Pack citation.
 *
 * A pack citation is a regulatoryBasis entry or the euAIActClassification text (questionId "pack"), or one
 * ";"-separated part of a question's regulatoryRef (questionId = the question id). Every citation starts as
 * "not checked". A record in src/domains/packs/citationChecks/<station>.json says who checked it, when, against
 * which source and with what verdict. A record counts only while its citation text still matches the pack and
 * for CITATION_CHECK_MAX_AGE_DAYS after checkedOn; after that the citation reads "not checked" again.
 * citationCheckProblems() lists what CI refuses: a malformed or duplicate record, a record whose citation is no
 * longer in the pack, a "verified" or "corrected" record without an https source, and any verdict "wrong".
 * An AI agent's check is not an expert review, and no record says a pack is verified, approved or legally reviewed.
 */
import { z } from "zod";
import type { IndustryPack } from "../industryPacks.js";
import health from "./citationChecks/health.json" with { type: "json" };
import education from "./citationChecks/education.json" with { type: "json" };
import environment from "./citationChecks/environment.json" with { type: "json" };
import mobility from "./citationChecks/mobility.json" with { type: "json" };
import governance from "./citationChecks/governance.json" with { type: "json" };
import technology from "./citationChecks/technology.json" with { type: "json" };
import wealth from "./citationChecks/wealth.json" with { type: "json" };

const CITATION_VERDICTS = ["verified", "corrected", "wrong", "unverifiable", "superseded"] as const;
export const CITATION_CHECK_MAX_AGE_DAYS = 365;
/** checkedBy value for a check made by an AI agent. */
const AI_AGENT_CHECKER = "ai-agent";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO date (YYYY-MM-DD)");
const text = z.string().trim().min(1);

const citationCheckSchema = z.object({
  packId: text,
  questionId: text,
  citation: text,
  instrument: text,
  clause: text,
  verdict: z.enum(CITATION_VERDICTS),
  was: z.string().nullable(),
  now: z.string().nullable(),
  sourceTitle: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  checkedOn: isoDate,
  checkedBy: text,
  note: z.string(),
}).strict();
export type CitationCheck = z.infer<typeof citationCheckSchema>;

export const CITATION_CHECK_FILES: Readonly<Record<string, unknown>> = { health, education, environment, mobility, governance, technology, wealth };

export interface PackCitation { packId: string; questionId: string; citation: string }

type CitationState = "checked" | "not-checked" | "expired" | "wrong" | "unverifiable" | "superseded";

const key = (c: PackCitation) => `${c.packId}\u0000${c.questionId}\u0000${c.citation}`;
const DAY_MS = 86_400_000;

/** Every citation of a pack, in reading order, without repeats. */
export function packCitations(pack: Pick<IndustryPack, "id" | "regulatoryBasis" | "euAIActClassification" | "questions">): PackCitation[] {
  const out = new Map<string, PackCitation>();
  const add = (questionId: string, citation: string) => {
    const c = { packId: pack.id, questionId, citation: citation.trim() };
    if (c.citation) out.set(key(c), c);
  };
  for (const basis of pack.regulatoryBasis) add("pack", basis);
  if (pack.euAIActClassification) add("pack", pack.euAIActClassification);
  for (const q of pack.questions) for (const part of q.regulatoryRef.split(";")) add(q.id, part);
  return [...out.values()];
}

/** All records of every station file, with the file each came from; rows that fail the schema are reported, not returned. */
function loadCitationChecks(files: Readonly<Record<string, unknown>> = CITATION_CHECK_FILES): { records: Array<CitationCheck & { file: string }>; problems: string[] } {
  const records: Array<CitationCheck & { file: string }> = [];
  const problems: string[] = [];
  for (const [file, rows] of Object.entries(files)) {
    if (!Array.isArray(rows)) { problems.push(`${file}.json: must be a JSON array`); continue; }
    rows.forEach((row, i) => {
      const parsed = citationCheckSchema.safeParse(row);
      if (parsed.success) records.push({ ...parsed.data, file });
      else problems.push(`${file}.json row ${i}: ${parsed.error.issues.map((x) => `${x.path.join(".")} ${x.message}`).join("; ")}`);
    });
  }
  return { records, problems };
}

const { records: RECORDS } = loadCitationChecks();
const RECORD_BY_KEY = new Map(RECORDS.map((r) => [key(r), r]));

function stateOf(record: CitationCheck | undefined, asOf: Date): CitationState {
  if (!record) return "not-checked";
  if ((asOf.getTime() - Date.parse(record.checkedOn)) / DAY_MS > CITATION_CHECK_MAX_AGE_DAYS) return "expired";
  if (record.verdict === "verified" || record.verdict === "corrected") return "checked";
  return record.verdict;
}

export interface CitationCheckSummary {
  total: number;
  checked: number;
  /** Checked citations whose checkedBy is AI_AGENT_CHECKER. */
  checkedByAiAgent: number;
  counts: Record<CitationState, number>;
  citations: Array<PackCitation & { state: CitationState; record?: CitationCheck }>;
}

export function citationCheckSummary(pack: Parameters<typeof packCitations>[0], asOf: Date = new Date()): CitationCheckSummary {
  const counts: Record<CitationState, number> = { checked: 0, "not-checked": 0, expired: 0, wrong: 0, unverifiable: 0, superseded: 0 };
  let checkedByAiAgent = 0;
  const citations = packCitations(pack).map((c) => {
    const record = RECORD_BY_KEY.get(key(c));
    const state = stateOf(record, asOf);
    counts[state] += 1;
    if (state === "checked" && record?.checkedBy === AI_AGENT_CHECKER) checkedByAiAgent += 1;
    return { ...c, state, ...(record ? { record } : {}) };
  });
  return { total: citations.length, checked: counts.checked, checkedByAiAgent, counts, citations };
}

/** One plain line for `amc domain pack describe`. */
export function citationCheckLine(summary: Omit<CitationCheckSummary, "citations">): string {
  const parts = [`${summary.checked} of ${summary.total} citations checked`];
  if (summary.checkedByAiAgent > 0) parts.push(`${summary.checkedByAiAgent} of them by an AI agent, not an expert review`);
  for (const [state, label] of [["expired", "check expired"], ["unverifiable", "source could not be opened"], ["superseded", "instrument replaced"], ["wrong", "marked wrong"]] as const) {
    if (summary.counts[state] > 0) parts.push(`${summary.counts[state]} ${label}`);
  }
  return parts.join("; ");
}

/** What CI refuses. `packs` is the registry; `asOf` only rejects dates in the future (an expired check is not an error). */
export function citationCheckProblems(packs: ReadonlyArray<Parameters<typeof packCitations>[0] & { stationId: string }>, files: Readonly<Record<string, unknown>> = CITATION_CHECK_FILES, asOf: Date = new Date()): string[] {
  const { records, problems } = loadCitationChecks(files);
  const known = new Map<string, string>();
  for (const pack of packs) for (const c of packCitations(pack)) known.set(key(c), pack.stationId);
  const seen = new Set<string>();
  for (const r of records) {
    const at = `${r.file}.json ${r.packId} ${r.questionId} "${r.citation}"`;
    const k = key(r);
    if (seen.has(k)) problems.push(`${at}: duplicate record`);
    seen.add(k);
    const station = known.get(k);
    if (!station) problems.push(`${at}: no such citation in the pack (stale record: update or remove it)`);
    else if (station !== r.file) problems.push(`${at}: belongs in ${station}.json`);
    if (r.verdict === "wrong") problems.push(`${at}: marked wrong; correct the pack text (verdict "corrected"), or cut the citation back to what the source supports`);
    if ((r.verdict === "verified" || r.verdict === "corrected") && !/^https:\/\/\S+$/.test(r.sourceUrl ?? "")) problems.push(`${at}: verdict ${r.verdict} needs an https sourceUrl`);
    if (r.verdict === "corrected" && (!r.was || r.now !== r.citation)) problems.push(`${at}: verdict corrected needs "was" and "now" equal to the citation`);
    if (r.verdict === "unverifiable" && !r.note.trim()) problems.push(`${at}: verdict unverifiable needs a note naming the hosts tried`);
    if (r.verdict === "superseded" && !r.note.trim()) problems.push(`${at}: verdict superseded needs a note naming the replacement and its date`);
    if (Date.parse(r.checkedOn) - asOf.getTime() > DAY_MS) problems.push(`${at}: checkedOn ${r.checkedOn} is in the future`);
  }
  return problems;
}
