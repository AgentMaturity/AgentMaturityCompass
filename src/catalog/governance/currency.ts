/** Pure P1-34 scheduling subset. Recorded metadata is not authenticated review or admission evidence. */
import { z } from "zod";
import type { RegulatoryRegister, RegulatoryRegisterEntry } from "../../compliance/regulatory/index.js";
import type { Citation, ControlRecord, SupportLevel } from "../types.js";

export type CurrencyReason =
  | "GOV_REVIEW_NOT_APPROVED" | "GOV_REVIEW_MISSING" | "GOV_REVIEW_DATE_INVALID"
  | "GOV_NEXT_REVIEW_INVALID" | "GOV_REVIEW_POLICY_INVALID" | "GOV_REGISTER_INVALID"
  | "GOV_CITATION_INVALID" | "GOV_REGISTER_ENTRY_MISSING" | "GOV_REGISTER_ENTRY_AMBIGUOUS"
  | "GOV_REGISTER_JURISDICTION_MISMATCH" | "GOV_REGISTER_ENTRY_INVALID"
  | "GOV_REGISTER_REVIEW_DATE_INVALID" | "GOV_EU_GUIDANCE_UNRESOLVED" | "GOV_REVIEW_DATE_RANGE"
  | "GOV_AS_OF_INVALID" | "GOV_SUPPORT_INVALID" | "GOV_REVIEW_IN_FUTURE"
  | "GOV_REGISTER_REVIEW_IN_FUTURE" | "GOV_REVIEW_UNRESOLVED"
  | "GOV_REVIEW_DUE_SOON" | "GOV_REVIEW_OVERDUE";

export type ReviewDueResult =
  | { status: "resolved"; nextReviewDue: string; cadenceDays: number }
  | { status: "unresolved"; reasons: CurrencyReason[] };

export interface ControlCurrencyResult {
  /** Currency only; even current is not proof of approval or legal correctness. */
  status: "current" | "due_soon" | "overdue" | "unresolved";
  nextReviewDue: string | null;
  reasons: CurrencyReason[];
  control: ControlRecord;
}

const DAY_MS = 86_400_000;
const isoDate = z.iso.date();
const term = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const citationStatuses: readonly Citation["statusType"][] = [
  "binding-now", "binding-future", "draft", "supervisory-guidance",
  "voluntary-standard", "contractual", "conformity-scheme"
];
const registerStatuses: readonly RegulatoryRegisterEntry["status"][] = [
  "in-force", "partially-applicable", "enacted-not-yet-applicable", "published", "proposed", "superseded"
];
const supportLevels: readonly SupportLevel[] = ["experimental", "reviewed", "qualified", "retired"];

/** Full calendar dates only; the round trip also refuses UTC date rollover. */
function utcDate(value: unknown): number | null {
  const parsed = isoDate.safeParse(value);
  if (!parsed.success) return null;
  const ms = Date.parse(`${parsed.data}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === parsed.data ? ms : null;
}

function afterDays(anchor: number, days: number): string | null {
  const date = new Date(anchor + days * DAY_MS);
  if (!Number.isFinite(date.getTime())) return null;
  const due = date.toISOString().slice(0, 10);
  return utcDate(due) === null ? null : due;
}

const unresolvedDue = (reason: CurrencyReason): ReviewDueResult => ({ status: "unresolved", reasons: [reason] });

/** No clock, I/O, register singleton, review authentication or mutation. */
export function nextReviewDue(subject: ControlRecord, register: RegulatoryRegister): ReviewDueResult {
  // "approved" is required recorded status, not proof of a human approval.
  if (subject.review?.status !== "approved") return unresolvedDue("GOV_REVIEW_NOT_APPROVED");
  if (subject.review.reviewedAt == null) return unresolvedDue("GOV_REVIEW_MISSING");
  const reviewedAt = utcDate(subject.review.reviewedAt);
  if (reviewedAt === null) return unresolvedDue("GOV_REVIEW_DATE_INVALID");
  if (subject.review.nextReview !== null && utcDate(subject.review.nextReview) === null) {
    return unresolvedDue("GOV_NEXT_REVIEW_INVALID");
  }
  if (register?.schemaVersion !== 1 || !Array.isArray(register.entries)) return unresolvedDue("GOV_REGISTER_INVALID");
  const windowDays = register.policy?.reviewWindowDays;
  if (!Number.isSafeInteger(windowDays) || windowDays <= 0) return unresolvedDue("GOV_REVIEW_POLICY_INVALID");
  if (!Array.isArray(subject.citations)) return unresolvedDue("GOV_CITATION_INVALID");

  let cadence = 90;
  let registerDue: string | null = null;
  for (const citation of subject.citations) {
    if (!citation || typeof citation.jurisdiction !== "string" || !term.test(citation.jurisdiction)
      || !citationStatuses.includes(citation.statusType)
      || (citation.registerId !== null && (typeof citation.registerId !== "string" || citation.registerId.length === 0))) {
      return unresolvedDue("GOV_CITATION_INVALID");
    }
    if (citation.jurisdiction.startsWith("US-") || (citation.jurisdiction === "IN" && citation.statusType === "draft")) {
      cadence = 30;
    }
    if (citation.registerId === null) {
      // An unregistered EU citation cannot establish the required register bindingForce.
      if (citation.jurisdiction === "EU") return unresolvedDue("GOV_EU_GUIDANCE_UNRESOLVED");
      continue;
    }
    const matches = register.entries.filter((entry) => entry?.id === citation.registerId);
    if (matches.length === 0) return unresolvedDue("GOV_REGISTER_ENTRY_MISSING");
    if (matches.length !== 1) return unresolvedDue("GOV_REGISTER_ENTRY_AMBIGUOUS");
    const entry = matches[0]!; // Only after exact, unique resolution.
    if (entry.jurisdiction !== citation.jurisdiction) return unresolvedDue("GOV_REGISTER_JURISDICTION_MISMATCH");
    if (!registerStatuses.includes(entry.status) || (entry.bindingForce !== "binding" && entry.bindingForce !== "voluntary")) {
      return unresolvedDue("GOV_REGISTER_ENTRY_INVALID");
    }
    const lastReviewed = utcDate(entry.lastReviewed);
    if (lastReviewed === null) return unresolvedDue("GOV_REGISTER_REVIEW_DATE_INVALID");
    const entryDue = afterDays(lastReviewed, windowDays);
    if (entryDue === null) return unresolvedDue("GOV_REVIEW_DATE_RANGE");
    if (registerDue === null || entryDue < registerDue) registerDue = entryDue;
    if (entry.jurisdiction === "EU" && entry.bindingForce === "voluntary") cadence = 30;
  }

  const cadenceDays = Math.min(cadence, windowDays);
  let due = afterDays(reviewedAt, cadenceDays);
  if (due === null) return unresolvedDue("GOV_REVIEW_DATE_RANGE");
  if (registerDue !== null && registerDue < due) due = registerDue;
  if (subject.review.nextReview !== null && subject.review.nextReview < due) due = subject.review.nextReview;
  return { status: "resolved", nextReviewDue: due, cadenceDays };
}

/** Returns a shallow control copy for future compilation use; existing loaders and results are untouched. */
export function evaluateReviewCurrency(subject: ControlRecord, register: RegulatoryRegister, asOf: string): ControlCurrencyResult {
  const unresolved = (reasons: CurrencyReason[]): ControlCurrencyResult => ({
    status: "unresolved", nextReviewDue: null, reasons: ["GOV_REVIEW_UNRESOLVED", ...reasons],
    control: { ...subject, support: subject.support === "retired" ? "retired" : "experimental" }
  });
  if (!supportLevels.includes(subject.support)) return unresolved(["GOV_SUPPORT_INVALID"]);
  const asOfMs = utcDate(asOf);
  if (asOfMs === null) return unresolved(["GOV_AS_OF_INVALID"]);
  const schedule = nextReviewDue(subject, register);
  if (schedule.status === "unresolved") return unresolved(schedule.reasons);
  if (subject.review.reviewedAt !== null && subject.review.reviewedAt > asOf) return unresolved(["GOV_REVIEW_IN_FUTURE"]);
  if (register.entries.some((entry) => subject.citations.some((citation) => citation.registerId !== null && citation.registerId === entry?.id)
    && entry.lastReviewed > asOf)) return unresolved(["GOV_REGISTER_REVIEW_IN_FUTURE"]);

  const due = schedule.nextReviewDue;
  const status = due < asOf ? "overdue" : (Date.parse(`${due}T00:00:00Z`) - asOfMs) / DAY_MS <= 14 ? "due_soon" : "current";
  const control = { ...subject };
  if (status === "overdue" && (control.support === "reviewed" || control.support === "qualified")) control.support = "experimental";
  return {
    status, nextReviewDue: due,
    reasons: status === "overdue" ? ["GOV_REVIEW_OVERDUE"] : status === "due_soon" ? ["GOV_REVIEW_DUE_SOON"] : [],
    control
  };
}
