/**
 * Admission reports on disk (P1-33): catalog/admission/<pack-id>-<version>.json, deterministic (sorted findings and
 * evidence; the digest covers everything but `checkedAt`), outside every catalog digest. A committed report is an
 * audit record of an earlier run and its digest an unkeyed hash, so nothing decides support from it: the gate
 * (gate.ts) recomputes admission and only compares, and check:catalog-admission fails a report that claims more.
 */
import { join } from "node:path";
import { writeFileAtomic } from "../../utils/fs.js";
import { canonicalize } from "../../utils/json.js";
import { digestOf } from "../digest.js";
import type { PackManifest } from "../types.js";
import { admissionReportSchema, type AdmissionFinding, type AdmissionReport, type CriterionResult } from "./types.js";

/** The report's digest: sha256 of the canonical report without `checkedAt` and `digest`. */
export function reportDigest(report: Omit<AdmissionReport, "digest"> & { digest?: string }): string {
  const { checkedAt: _checkedAt, digest: _digest, ...rest } = report;
  return digestOf(rest);
}

const key = (f: AdmissionFinding): string => JSON.stringify([f.controlId ?? "", f.path ?? "", f.code, f.message]);
const byString = <T>(of: (row: T) => string) => (a: T, b: T): number => (of(a) < of(b) ? -1 : of(a) > of(b) ? 1 : 0);

/** A criterion with its findings and evidence in a stable order (evidence de-duplicated). */
export function sortedCriterion(result: CriterionResult): CriterionResult {
  const evidence = [...new Map(result.evidence.map((e) => [`${e.kind}\u0000${e.ref}\u0000${e.sha256}`, e])).values()];
  return { ...result, findings: [...result.findings].sort(byString(key)), evidence: evidence.sort(byString((e) => `${e.kind}\u0000${e.ref}`)) };
}

/** Catalog-relative path of a pack version's report. */
const reportPath = (manifest: Pick<PackManifest, "id" | "version">): string => `admission/${manifest.id}-${manifest.version}.json`;

export function writeAdmissionReport(catalogRoot: string, report: AdmissionReport): string {
  const rel = reportPath(report.pack);
  writeFileAtomic(join(catalogRoot, rel), `${JSON.stringify(report, null, 2)}\n`, 0o644);
  return rel;
}

/** A committed report parsed from its text, with its digest verified; anything else is malformed, with the reason. */
export function parseAdmissionReport(text: string, rel: string): { report: AdmissionReport } | { error: string } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { error: `not JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  const parsed = admissionReportSchema.safeParse(value);
  if (!parsed.success) return { error: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "(root)"} ${i.message}`).join("; ") };
  const report = parsed.data as AdmissionReport;
  if (reportDigest(report) !== report.digest) return { error: "its digest does not match its content" };
  if (rel !== reportPath(report.pack)) return { error: `it covers ${report.pack.id} ${report.pack.version}, so its path must be ${reportPath(report.pack)}` };
  return { report };
}

const RANK: Readonly<Record<AdmissionReport["support"], number>> = { retired: 0, experimental: 1, reviewed: 2 };
const verdictOf = (r: AdmissionReport) => canonicalize({ pack: r.pack, decision: r.decision, support: r.support,
  maxAdmissibleSupport: r.maxAdmissibleSupport, criteria: r.criteria.map((c) => c.status) });

/** Whether two reports reach a different verdict on the same pack (pack digest, decision, support or any criterion's status). */
export const verdictDiffers = (a: AdmissionReport, b: AdmissionReport): boolean => verdictOf(a) !== verdictOf(b);

/** Whether a committed report claims more than the recomputation: a stronger support or a reviewed ceiling it no longer has. */
export const claimsMore = (committed: AdmissionReport, computed: AdmissionReport): boolean =>
  RANK[committed.support] > RANK[computed.support] || (committed.maxAdmissibleSupport === "reviewed" && computed.maxAdmissibleSupport !== "reviewed");
