/**
 * Catalog review cadence (P1-34): when a control's review falls due, from the date of a verified review (effectiveSupport
 * passes it; the control's own review fields are never read), its citations and the S5 register. Pure: no clock, no I/O.
 */
import { z } from "zod";
import type { RegulatoryRegister } from "../../compliance/regulatory/index.js";
import type { ControlRecord } from "../types.js";

type CadenceReason = "GOV_REVIEW_DATE_INVALID" | "GOV_REVIEW_POLICY_INVALID" | "GOV_REGISTER_ENTRY_UNRESOLVED" | "GOV_REGISTER_REVIEW_DATE_INVALID";

export type ReviewDueResult =
  | { status: "resolved"; nextReviewDue: string; cadenceDays: number }
  | { status: "unresolved"; reason: CadenceReason };

const MONTHLY = 30;
const QUARTERLY = 90;
const DAY_MS = 86_400_000;
const isoDate = z.iso.date();

/** Midnight UTC of a real YYYY-MM-DD calendar date, or null. */
export function utcDate(value: unknown): number | null {
  if (!isoDate.safeParse(value).success) return null;
  const ms = Date.parse(`${value as string}T00:00:00Z`);
  return new Date(ms).toISOString().slice(0, 10) === value ? ms : null;
}

const addDays = (ms: number, days: number): string => new Date(ms + days * DAY_MS).toISOString().slice(0, 10);
const unresolved = (reason: CadenceReason): ReviewDueResult => ({ status: "unresolved", reason });

/**
 * The next review after one verified on `reviewedAt`: monthly when a citation is a US state's (`US-` prefix), EU
 * guidance (its register entry is EU and voluntary; an unregistered EU citation cannot show it is not, so it counts) or
 * an Indian draft; otherwise quarterly. Never longer than the register's review window, and never later than any cited
 * entry's own next review (lastReviewed + window). Anything it cannot establish is unresolved, never a default.
 */
export function nextReviewDue(control: ControlRecord, register: RegulatoryRegister, reviewedAt: string): ReviewDueResult {
  const anchor = utcDate(reviewedAt);
  if (anchor === null) return unresolved("GOV_REVIEW_DATE_INVALID");
  const window = register.policy.reviewWindowDays;
  if (!Number.isSafeInteger(window) || window <= 0) return unresolved("GOV_REVIEW_POLICY_INVALID");
  const caps: string[] = [];
  let cadence = Math.min(QUARTERLY, window);
  for (const c of control.citations) {
    const matches = c.registerId === null ? [] : register.entries.filter((e) => e.id === c.registerId);
    if (c.registerId !== null && matches.length !== 1) return unresolved("GOV_REGISTER_ENTRY_UNRESOLVED");
    const entry = matches[0];
    const euGuidance = c.jurisdiction === "EU" && (entry === undefined || (entry.jurisdiction === "EU" && entry.bindingForce === "voluntary"));
    if (c.jurisdiction.startsWith("US-") || euGuidance || (c.jurisdiction === "IN" && c.statusType === "draft")) cadence = Math.min(cadence, MONTHLY);
    if (entry) {
      const lastReviewed = utcDate(entry.lastReviewed);
      if (lastReviewed === null) return unresolved("GOV_REGISTER_REVIEW_DATE_INVALID");
      caps.push(addDays(lastReviewed, window));
    }
  }
  const due = [addDays(anchor, cadence), ...caps].sort()[0] as string;
  return { status: "resolved", nextReviewDue: due, cadenceDays: cadence };
}
