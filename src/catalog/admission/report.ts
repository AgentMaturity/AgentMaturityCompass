/**
 * Admission reports on disk (P1-33): catalog/admission/<pack-id>-<version>.json, deterministic (sorted findings and
 * evidence; the digest covers everything but `checkedAt`), outside every catalog digest. A committed report is the
 * checker's last verdict, not a trust anchor: the loader's gate (admissionGate) only ever lowers a pack's declared
 * support, and a reviewed row in a plan still needs promotions from verified review records (P1-34).
 */
import { join } from "node:path";
import { writeFileAtomic } from "../../utils/fs.js";
import { digestOf, packDigest } from "../digest.js";
import type { LoadedCatalog } from "../loader.js";
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

/**
 * Why a pack's declared reviewed or qualified support may not stand under `loadCatalog({ enforceAdmission: true })`,
 * or null when it may (or when it declares nothing stronger than experimental). The committed report must parse, verify
 * its digest, cover this pack version at its current digest (recomputed here) and admit the declared support.
 */
export function admissionGate(cat: LoadedCatalog, manifest: PackManifest, read: (rel: string) => string | null): string | null {
  if (manifest.support !== "reviewed" && manifest.support !== "qualified") return null;
  const rel = reportPath(manifest);
  const text = read(rel);
  if (text === null) return `declares ${manifest.support} but ${rel} does not exist`;
  const parsed = parseAdmissionReport(text, rel);
  if ("error" in parsed) return `${rel} is malformed: ${parsed.error}`;
  const { report } = parsed;
  const digest = packDigest(cat, manifest);
  if (report.pack.digest !== digest) return `${rel} is stale: it covers ${report.pack.digest}, the pack is now ${digest}`;
  if (report.decision !== "admit" || report.pack.declaredSupport !== manifest.support) {
    return `${rel} does not admit ${manifest.support} (${report.reasons.slice(0, 3).join("; ") || report.decision})`;
  }
  return null;
}
