/**
 * Catalog crosswalks as information (P1-53): the controls whose `crosswalk[]` names a framework, and the index from audit
 * binder controls (amc-audit-map-v1) to them. A crosswalk link never passes anything: passing one framework's control
 * never passes its crosswalk targets (docs/catalog/CONSOLIDATION.md).
 */
import type { LoadedCatalog } from "./loader.js";
import type { ControlRecord } from "./types.js";

export interface CatalogCrosswalkEntry {
  control: ControlRecord;
  clause: string;
  relation: ControlRecord["crosswalk"][number]["relation"];
  rationale: string;
}

/** Every crosswalk entry naming `framework` (a catalog vocabulary term), in control id order. */
export function catalogCrosswalkEntries(cat: LoadedCatalog, framework: string): CatalogCrosswalkEntry[] {
  return [...cat.controls.values()].sort((a, b) => a.id.localeCompare(b.id)).flatMap((control) => control.crosswalk
    .filter((x) => x.framework === framework)
    .map((x) => ({ control, clause: x.clause, relation: x.relation, rationale: x.rationale })));
}

/** Audit binder control id to the catalog controls that crosswalk to it; binder controls nobody crosswalks map to []. */
export function binderCrosswalkIndex(cat: LoadedCatalog, binderControlIds: readonly string[]): Array<{ binderControl: string; catalogControls: string[] }> {
  const entries = catalogCrosswalkEntries(cat, "amc-audit-map-v1");
  return binderControlIds.map((binderControl) => ({
    binderControl,
    catalogControls: [...new Set(entries.filter((e) => e.clause === binderControl).map((e) => e.control.id))]
  }));
}

/** The binder index as the markdown table docs/catalog/CONSOLIDATION.md carries between its generated-index markers. */
export function renderBinderCrosswalkIndex(rows: ReadonlyArray<{ binderControl: string; catalogControls: string[] }>): string {
  return ["| Binder control | Catalog controls that crosswalk to it |", "| --- | --- |",
    ...rows.map((r) => `| ${r.binderControl} | ${r.catalogControls.join(", ") || "none"} |`)].join("\n");
}
