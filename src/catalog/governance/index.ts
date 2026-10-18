/** Catalog content governance (P1-34; docs/catalog/GOVERNANCE.md): review records, effective support, currency, the changelog guard. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";
import { parseWith, parseYaml, type LoadedCatalog } from "../loader.js";
import { statusReviewDue } from "../register.js";
import type { CatalogIssue } from "../schema.js";
import { effectiveSupport, shownReviewStatus, type ReviewAuthority } from "./support.js";
import { f5ConfirmationsFileSchema, type F5Confirmation } from "./reviewRecord.js";
import { reverifyChecklistSchema, type ReverifyItem } from "./reverify.js";

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
 * What `check:catalog-currency` reports, all through effectiveSupport at `authority.now` (the server's clock): reviewed or
 * qualified content whose support does not stand (error: GOV_REVERIFY_OPEN, GOV_REVIEW_TRUST_INVALID, GOV_REVIEW_OVERDUE
 * when a review lapsed, otherwise GOV_REVIEW_UNVERIFIED); a review falling due within 14 days (warning); an approved
 * review the YAML declares but no verified record supports (warning); register entries due a status review (P1-18,
 * warning). Retired content is skipped. Nothing is edited.
 */
export function catalogCurrencyFindings(cat: LoadedCatalog, authority: ReviewAuthority): GovernanceFinding[] {
  const out: GovernanceFinding[] = [];
  const today = authority.now.toISOString().slice(0, 10);
  for (const control of cat.controls.values()) {
    if (control.support === "retired") continue;
    const add = (code: string, severity: GovernanceFinding["severity"], message: string) => out.push({ code, severity, controlId: control.id, message });
    const result = effectiveSupport(control, authority);
    if (result.support !== control.support) {
      const lapsed = result.rejected.some((r) => r.reason === "GOV_REVIEW_OVERDUE");
      const code = result.reasons.find((r) => /^GOV_(REVERIFY_OPEN|REVIEW_TRUST_INVALID)/.test(r))?.split(":")[0] ?? (lapsed ? "GOV_REVIEW_OVERDUE" : "GOV_REVIEW_UNVERIFIED");
      add(code, "error", `declared ${control.support} does not stand (${result.reasons.join("; ")}${result.rejected.length ? `; records not counted: ${result.rejected.map((r) => `#${r.index} ${r.reason}`).join(", ")}` : ""}); compiles as experimental`);
    } else if (result.promotion && (Date.parse(`${result.promotion.nextReviewDue}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000 <= 14) {
      add("GOV_REVIEW_DUE_SOON", "warning", `review due ${result.promotion.nextReviewDue}`);
    }
    if (shownReviewStatus(control, result.support) !== control.review.status) {
      add("GOV_REVIEW_UNVERIFIED", "warning", "declares an approved review that no verified review record supports");
    }
  }
  for (const r of cat.registers?.values() ?? []) {
    for (const due of statusReviewDue(r.entries, today)) out.push({ code: "GOV_REGISTER_STATUS_REVIEW", severity: "warning", controlId: null, message: `${r.id}/${due.id}: ${due.reason}` });
  }
  return out;
}
