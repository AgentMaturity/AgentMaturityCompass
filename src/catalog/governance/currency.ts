/**
 * Catalog review currency (P1-34): when a control's review falls due, from its recorded review, its citations and the
 * S5 register. Pure: no clock (the caller passes the server's date), no I/O, no mutation. Currency only ever makes support
 * stricter: a due, overdue or stale review never raises it. It changes only what new compilations see, never YAML or past
 * results, and it never authenticates a review (reviewRecord.ts does).
 */
import { z } from "zod";
import type { RegulatoryRegister } from "../../compliance/regulatory/index.js";
import type { ControlRecord, SupportLevel } from "../types.js";

type CurrencyReason = "GOV_REVIEW_MISSING" | "GOV_NEXT_REVIEW_INVALID" | "GOV_REVIEW_POLICY_INVALID"
  | "GOV_REGISTER_ENTRY_UNRESOLVED" | "GOV_REGISTER_REVIEW_DATE_INVALID" | "GOV_REVIEW_IN_FUTURE"
  | "GOV_REVIEW_STALE" | "GOV_REVIEW_DUE_SOON" | "GOV_REVIEW_OVERDUE";

export type ReviewDueResult =
  | { status: "resolved"; nextReviewDue: string; cadenceDays: number }
  | { status: "unresolved"; reason: CurrencyReason };

export interface ControlCurrency {
  /** Scheduling only: even "current" is no proof of approval or legal correctness. A review whose date is missing,
   * unparsable or in the future, or that cannot be scheduled, is "stale": never current. */
  status: "current" | "due_soon" | "overdue" | "stale";
  nextReviewDue: string | null;
  reasons: CurrencyReason[];
  /** The support new compilations use: never stronger than the record's; overdue or stale reviewed content is experimental. */
  support: SupportLevel;
}

const MONTHLY = 30;
const QUARTERLY = 90;
const DUE_SOON_DAYS = 14;
const DAY_MS = 86_400_000;
const isoDate = z.iso.date();

/** Midnight UTC of a real YYYY-MM-DD calendar date, or null. */
function utcDate(value: unknown): number | null {
  if (!isoDate.safeParse(value).success) return null;
  const ms = Date.parse(`${value as string}T00:00:00Z`);
  return new Date(ms).toISOString().slice(0, 10) === value ? ms : null;
}

const addDays = (ms: number, days: number): string => new Date(ms + days * DAY_MS).toISOString().slice(0, 10);
const unresolved = (reason: CurrencyReason): ReviewDueResult => ({ status: "unresolved", reason });

/**
 * Monthly when a citation is a US state's (`US-` prefix), EU guidance (its register entry is EU and voluntary; an
 * unregistered EU citation cannot show it is not, so it counts) or an Indian draft; otherwise quarterly. Never longer
 * than the register's review window, and never later than any cited entry's own next review (lastReviewed + window)
 * or an earlier recorded `review.nextReview`.
 */
export function nextReviewDue(subject: ControlRecord, register: RegulatoryRegister): ReviewDueResult {
  const reviewedAt = utcDate(subject.review.reviewedAt);
  // "approved" is the recorded status, not proof of a human approval; review records carry that (reviewRecord.ts).
  if (subject.review.status !== "approved" || reviewedAt === null) return unresolved("GOV_REVIEW_MISSING");
  const window = register.policy.reviewWindowDays;
  if (!Number.isSafeInteger(window) || window <= 0) return unresolved("GOV_REVIEW_POLICY_INVALID");
  const caps: string[] = [];
  if (subject.review.nextReview !== null) {
    if (utcDate(subject.review.nextReview) === null) return unresolved("GOV_NEXT_REVIEW_INVALID");
    caps.push(subject.review.nextReview);
  }
  let cadence = Math.min(QUARTERLY, window);
  for (const c of subject.citations) {
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
  const due = [addDays(reviewedAt, cadence), ...caps].sort()[0] as string;
  return { status: "resolved", nextReviewDue: due, cadenceDays: cadence };
}

/** Currency as of `asOf` (YYYY-MM-DD, the server's date from the caller; never a record field). A verdict, never an edited record. */
export function evaluateReviewCurrency(subject: ControlRecord, register: RegulatoryRegister, asOf: string): ControlCurrency {
  const asOfMs = utcDate(asOf);
  if (asOfMs === null) throw new Error(`asOf ${asOf} is not a YYYY-MM-DD calendar date`);
  const stronger = subject.support === "reviewed" || subject.support === "qualified";
  const downgraded = stronger ? "experimental" : subject.support;
  const fail = (reason: CurrencyReason): ControlCurrency =>
    ({ status: "stale", nextReviewDue: null, reasons: ["GOV_REVIEW_STALE", reason], support: downgraded });
  const schedule = nextReviewDue(subject, register);
  if (schedule.status === "unresolved") return fail(schedule.reason);
  if (subject.review.reviewedAt! > asOf) return fail("GOV_REVIEW_IN_FUTURE");
  const due = schedule.nextReviewDue;
  if (due < asOf) return { status: "overdue", nextReviewDue: due, reasons: ["GOV_REVIEW_OVERDUE"], support: downgraded };
  const soon = (utcDate(due)! - asOfMs) / DAY_MS <= DUE_SOON_DAYS;
  return { status: soon ? "due_soon" : "current", nextReviewDue: due, reasons: soon ? ["GOV_REVIEW_DUE_SOON"] : [], support: subject.support };
}
