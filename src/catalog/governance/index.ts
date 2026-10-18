/** Catalog content governance (P1-34; docs/catalog/GOVERNANCE.md): review records, currency, the changelog guard. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";
import type { RegulatoryRegister } from "../../compliance/regulatory/index.js";
import { parseWith, parseYaml, type LoadedCatalog } from "../loader.js";
import { statusReviewDue } from "../register.js";
import type { CatalogIssue } from "../schema.js";
import { evaluateReviewCurrency } from "./currency.js";
import { f5ConfirmationsFileSchema, type F5Confirmation } from "./reviewRecord.js";
import { reverifyChecklistSchema, reverifyOpenItems, type ReverifyItem } from "./reverify.js";

export * from "./reviewRecord.js";
export * from "./currency.js";
export * from "./changelogGuard.js";
export * from "./reverify.js";

/** The governance data files under a catalog root, read with the catalog's YAML rules; any failure is an issue. */
export function readGovernance(root: string): { reverify: ReverifyItem[]; f5Confirmations: F5Confirmation[]; issues: CatalogIssue[] } {
  const issues: CatalogIssue[] = [];
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
    issues
  };
}

export interface GovernanceFinding { code: string; severity: "error" | "warning"; controlId: string | null; message: string }

/**
 * What `check:catalog-currency` reports as of `asOf`: reviews due within 14 days (warning); overdue reviews (error for
 * reviewed and qualified content, warning otherwise); reviewed or qualified content whose review cannot be scheduled,
 * or that cites an instrument tied to an open re-verify item (errors); register entries whose status is due for review
 * (P1-18, warning). Retired content is skipped. Nothing is edited.
 */
export function catalogCurrencyFindings(cat: LoadedCatalog, register: RegulatoryRegister, reverify: readonly ReverifyItem[], asOf: string): GovernanceFinding[] {
  const out: GovernanceFinding[] = [];
  for (const control of cat.controls.values()) {
    if (control.support === "retired") continue;
    const stronger = control.support !== "experimental";
    const add = (code: string, severity: GovernanceFinding["severity"], message: string) => out.push({ code, severity, controlId: control.id, message });
    const currency = evaluateReviewCurrency(control, register, asOf);
    if (currency.status === "due_soon") add("GOV_REVIEW_DUE_SOON", "warning", `review due ${currency.nextReviewDue}`);
    if (currency.status === "overdue") add("GOV_REVIEW_OVERDUE", stronger ? "error" : "warning", `review was due ${currency.nextReviewDue}; new compilations treat it as experimental`);
    if (currency.status === "unresolved" && stronger) add("GOV_REVIEW_UNRESOLVED", "error", `${currency.reasons[1]}: the next review cannot be scheduled`);
    if (!stronger) continue;
    for (const m of reverifyOpenItems(control, reverify)) add("GOV_REVERIFY_OPEN", "error", `cites ${m.citationKeys.join(", ")}, tied to open re-verify item ${m.itemId}`);
  }
  for (const r of cat.registers?.values() ?? []) {
    for (const due of statusReviewDue(r.entries, asOf)) out.push({ code: "GOV_REGISTER_STATUS_REVIEW", severity: "warning", controlId: null, message: `${r.id}/${due.id}: ${due.reason}` });
  }
  return out;
}
