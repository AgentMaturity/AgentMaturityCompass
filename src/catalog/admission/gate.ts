/**
 * The admission gate (P1-33; docs/catalog/ADMISSION.md): the one catalog load that `amc catalog compile`, plan
 * activation, the OSCAL export and A4 Adapt read. A pack declaring reviewed or qualified support keeps it only when its
 * admission, recomputed here at the server's clock against this machine's operator trust and the catalog's review
 * records, admits it; otherwise it is experimental in memory, with warning ADM_SUPPORT_DOWNGRADED, and its lock row and
 * digests say so. A committed report under admission/ decides nothing: its digest is an unkeyed hash, so a report that
 * differs from the recomputation is ignored and flagged (ADM_REPORT_MISMATCH). The YAML is never edited.
 */
import { lstatSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ReviewAuthority } from "../governance/support.js";
import { loadCatalog, type LoadedCatalog } from "../loader.js";
import type { CatalogIssue } from "../schema.js";
import type { PackManifest } from "../types.js";
import { admissionOf, catalogReviewAuthority } from "./index.js";
import { parseAdmissionReport, verdictDiffers } from "./report.js";
import type { AdmissionReport } from "./types.js";

const claims = (manifest: PackManifest): boolean => manifest.support === "reviewed" || manifest.support === "qualified";
const warning = (code: string, file: string, message: string): CatalogIssue =>
  ({ code, severity: "warning", file, controlId: null, path: code === "ADM_SUPPORT_DOWNGRADED" ? "support" : "", message });

/** The committed report for a pack version, if a regular file holds one; a malformed one is returned as its error. */
function committedReport(root: string, manifest: PackManifest): { report: AdmissionReport } | { error: string } | null {
  const rel = `admission/${manifest.id}-${manifest.version}.json`;
  const stat = lstatSync(join(root, rel), { throwIfNoEntry: false });
  if (!stat) return null;
  return stat.isFile() ? parseAdmissionReport(readFileSync(join(root, rel), "utf8"), rel) : { error: "not a regular file" };
}

/**
 * `cat` with each reviewed or qualified claim judged by its recomputed admission (`second` is an independent load for
 * criterion 1). A recomputation that throws downgrades, with the error as the reason. Returns `cat` itself when no pack
 * claims more than experimental.
 */
export function admitCatalog(cat: LoadedCatalog, second: LoadedCatalog, authority: ReviewAuthority): LoadedCatalog {
  const claimed = [...cat.packs].filter(([, entry]) => claims(entry.manifest));
  if (claimed.length === 0) return cat;
  const packs = new Map(cat.packs);
  const issues = [...cat.issues];
  for (const [id, entry] of claimed) {
    let report: AdmissionReport | null = null;
    let refusal: string | null;
    try {
      report = admissionOf({ cat, second, packId: id, authority, repoRoot: dirname(cat.root) });
      refusal = report.decision === "admit" ? null : report.reasons.slice(0, 3).join("; ");
    } catch (error) {
      refusal = `admission could not be recomputed: ${error instanceof Error ? error.message : String(error)}`;
    }
    if (refusal !== null) {
      packs.set(id, { ...entry, manifest: { ...entry.manifest, support: "experimental" } });
      issues.push(warning("ADM_SUPPORT_DOWNGRADED", entry.file, `declares ${entry.manifest.support}, which the recomputed admission refuses (${refusal}); loaded as experimental`));
    }
    const committed = committedReport(cat.root, entry.manifest);
    if (committed !== null && ("error" in committed || report === null || verdictDiffers(committed.report, report))) {
      issues.push(warning("ADM_REPORT_MISMATCH", `admission/${entry.manifest.id}-${entry.manifest.version}.json`,
        `ignored: ${"error" in committed ? committed.error : "it differs from the recomputed admission"}; run amc catalog check`));
    }
  }
  return { ...cat, packs, issues };
}

/** loadCatalog, then the gate: what compile, activation, the OSCAL export and A4 load. */
export function loadAdmittedCatalog(opts: { root?: string } = {}): LoadedCatalog {
  const cat = loadCatalog(opts);
  if (![...cat.packs.values()].some((entry) => claims(entry.manifest))) return cat;
  return admitCatalog(cat, loadCatalog(opts), catalogReviewAuthority(cat, dirname(cat.root)));
}
