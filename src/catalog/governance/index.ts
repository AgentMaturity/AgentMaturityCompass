/** Catalog content governance (P1-34; docs/catalog/GOVERNANCE.md): review records, currency, the changelog guard. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";
import type { RegulatoryRegister } from "../../compliance/regulatory/index.js";
import { parseWith, parseYaml, type LoadedCatalog } from "../loader.js";
import { statusReviewDue } from "../register.js";
import type { CatalogIssue } from "../schema.js";
import { evaluateReviewCurrency } from "./currency.js";
import { effectiveSupport, type ReviewAuthority } from "./support.js";
import { f5ConfirmationsFileSchema, type F5Confirmation } from "./reviewRecord.js";
import { reverifyChecklistSchema, reverifyOpenItems, type ReverifyItem } from "./reverify.js";

export * from "./reviewRecord.js";
export * from "./currency.js";
export * from "./changelogGuard.js";
export * from "./reverify.js";
export * from "./support.js";

/**
 * The governance files under a catalog root: the YAML lists (read with the catalog's YAML rules) and the raw review
 * records (reviews/<subject>/<version>/<record>.json, verified later, trusted for nothing here). Any failure is an issue.
 */
export function readGovernance(root: string): { reverify: ReverifyItem[]; f5Confirmations: F5Confirmation[]; reviews: unknown[]; issues: CatalogIssue[] } {
  const issues: CatalogIssue[] = [];
  const reviews: unknown[] = [];
  const dir = join(root, "reviews");
  // The loader already refuses symlinks and stray files in the tree; a missing folder means no records yet.
  const files = existsSync(dir) ? readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith(".json")) : [];
  for (const entry of files) {
    const rel = join(entry.parentPath, entry.name).slice(root.length + 1);
    try {
      reviews.push(JSON.parse(readFileSync(join(root, rel), "utf8")));
    } catch (err) {
      issues.push({ code: "CAT_SCHEMA", severity: "error", file: rel, controlId: null, path: "", message: `not JSON: ${(err as Error).message}` });
    }
  }
  const read = <S extends z.ZodType>(rel: string, schema: S): z.output<S> | null => {
    try {
      return parseWith(schema, parseYaml(readFileSync(join(root, rel), "utf8"), rel, issues), rel, issues);
    } catch (err) {
      issues.push({ code: "CAT_SCHEMA", severity: "error", file: rel, controlId: null, path: "", message: `cannot be read: ${(err as Error).message}` });
      return null;
    }
  };
  return {
    reverify: read("governance/reverify-before-publishing.yaml", reverifyChecklistSchema)?.items ?? [],
    f5Confirmations: read("governance/f5-confirmations.yaml", f5ConfirmationsFileSchema)?.confirmations ?? [],
    reviews, issues
  };
}

export interface GovernanceFinding { code: string; severity: "error" | "warning"; controlId: string | null; message: string }

/**
 * What `check:catalog-currency` reports as of `asOf` (the server's date): reviews due within 14 days (warning); overdue
 * or stale reviews (error for reviewed and qualified content, warning for any other recorded review); reviewed or
 * qualified content without a valid quorum of pinned reviewers (GOV_REVIEW_UNVERIFIED), or citing an instrument tied to
 * an open re-verify item (GOV_REVERIFY_OPEN), as errors; register entries whose status is due for review (P1-18,
 * warning). Retired content is skipped. Nothing is edited.
 */
export function catalogCurrencyFindings(cat: LoadedCatalog, register: RegulatoryRegister, reverify: readonly ReverifyItem[], asOf: string,
  authority?: ReviewAuthority): GovernanceFinding[] {
  const out: GovernanceFinding[] = [];
  for (const control of cat.controls.values()) {
    if (control.support === "retired") continue;
    const stronger = control.support !== "experimental";
    const add = (code: string, severity: GovernanceFinding["severity"], message: string) => out.push({ code, severity, controlId: control.id, message });
    const currency = evaluateReviewCurrency(control, register, asOf);
    if (currency.status === "due_soon") add("GOV_REVIEW_DUE_SOON", "warning", `review due ${currency.nextReviewDue}`);
    if (currency.status === "overdue") add("GOV_REVIEW_OVERDUE", stronger ? "error" : "warning", `review was due ${currency.nextReviewDue}; new compilations treat it as experimental`);
    // A stale review is reported whenever one is recorded; only content that never had a review has nothing to go stale.
    if (currency.status === "stale" && (stronger || control.review.status !== "pending" || control.review.reviewedAt !== null)) {
      add("GOV_REVIEW_STALE", stronger ? "error" : "warning", `${currency.reasons[1]}: the review date is missing, unparsable, in the future or unschedulable`);
    }
    if (!stronger) continue;
    const effective = effectiveSupport(control, register, asOf, authority);
    if (effective.reasons.includes("GOV_REVIEW_UNVERIFIED")) add("GOV_REVIEW_UNVERIFIED", "error", `${control.support} without a valid quorum of pinned reviewers (${effective.reasons.join(", ")}); compiles as experimental`);
    for (const m of reverifyOpenItems(control, reverify)) add("GOV_REVERIFY_OPEN", "error", `cites ${m.citationKeys.join(", ")}, tied to open re-verify item ${m.itemId}`);
  }
  for (const r of cat.registers?.values() ?? []) {
    for (const due of statusReviewDue(r.entries, asOf)) out.push({ code: "GOV_REGISTER_STATUS_REVIEW", severity: "warning", controlId: null, message: `${r.id}/${due.id}: ${due.reason}` });
  }
  return out;
}
