/**
 * The re-verify checklist (P1-34), catalog/governance/reverify-before-publishing.yaml: facts the strategy says to check
 * against the primary source before publishing packs. A reviewed or qualified control citing an instrument an open
 * item affects is an error (GOV_REVERIFY_OPEN). A declared status, date or review id is a claim; P1-33 verifies the
 * review record an item names.
 */
import { z } from "zod";
import type { ControlRecord } from "../types.js";

const text = z.string().regex(/\S/, "must contain a non-whitespace character");

export const reverifyChecklistSchema = z.strictObject({
  checklistVersion: z.literal(1),
  items: z.array(z.strictObject({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "must be a kebab-case id"),
    fact: text,
    sourceToCheck: text,
    owner: text.nullable(),
    status: z.enum(["open", "confirmed", "changed"]),
    checkedAt: z.iso.date().nullable(),
    reviewRecordId: text.nullable(),
    /** S5 register ids, or instrument names where no entry exists; matched exactly. */
    affects: z.array(text).min(1)
  }).refine((i) => i.status === "open" || (i.checkedAt !== null && i.reviewRecordId !== null),
    "a confirmed or changed item names its checkedAt and reviewRecordId"))
}).refine((f) => new Set(f.items.map((i) => i.id)).size === f.items.length, "item ids must be unique");
export type ReverifyItem = z.infer<typeof reverifyChecklistSchema>["items"][number];

/** Open items naming one of the control's citations exactly, by S5 register id or instrument; no fuzzy matching. */
export function reverifyOpenItems(control: ControlRecord, items: readonly ReverifyItem[]): Array<{ itemId: string; citationKeys: string[] }> {
  return items.flatMap((item) => {
    if (item.status !== "open") return [];
    const keys = control.citations.filter((c) => item.affects.some((a) => a === c.registerId || a === c.instrument)).map((c) => c.key);
    return keys.length > 0 ? [{ itemId: item.id, citationKeys: keys }] : [];
  });
}
