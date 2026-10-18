/**
 * effectiveSupport (P1-34) is the only function that lets a control's support stand above experimental. compilePlan,
 * activation and its policy receipts, the A4 views, the OSCAL export and check:catalog-currency read a control's support
 * and shown review status only through its result (tests/catalog/governance/promotion.test.ts scans for other reads).
 *
 * Reviewed or qualified support declared in YAML stands only when the operator's signed trust lists verify (pinned
 * roots, m-of-n, anti-rollback, at the server's clock) and review records for exactly the control's current content,
 * each signed by a key a list entry pins for catalog-review, unrevoked and undistrusted, reach the quorum: two distinct
 * reviewers (the entries' subjects, never a record field), none an author of the control, one credentialed for its
 * domain in the D-08 roster, a credentialed legal reviewer when it cites law, a confirmed draft when AI drafted it, no
 * objection, every review current and no open re-verify item. Anything else compiles experimental. Never raises support
 * above what the YAML declares; never edits a record. A verified review shows who approved what, not that it is right.
 */
import type { RegulatoryRegister } from "../../compliance/regulatory/index.js";
import { verifyHexDigest } from "../../crypto/keys.js";
import { checkSignature } from "../../trust/signatureCheck.js";
import { loadTrustContext, type TrustContext } from "../../trust/trustContext.js";
import { controlDigest } from "../digest.js";
import type { Citation, ControlRecord, SupportLevel } from "../types.js";
import { nextReviewDue } from "./currency.js";
import { reviewRecordDigest, reviewRecordSchema, type F5Confirmation, type ReviewRecord } from "./reviewRecord.js";
import { reverifyOpenItems, type ReverifyItem } from "./reverify.js";

export interface ReviewAuthority {
  /** Where the operator's signed trust lists and pinned roots live. Only a list entry pins a reviewer: no --pubkey, no --allow-unpinned. */
  trust: { amcHome?: string; trustLists?: readonly string[]; trustRoots?: readonly string[] };
  /** The server's clock: trust is loaded, record dates are bounded and currency is judged at it. */
  now: Date;
  /** Raw review record files (catalog/reviews/**); each is verified here and trusted for nothing else. */
  records: readonly unknown[];
  /** The D-08 expert roster: reviewer (trust-list subject) to credentialed domains ("legal" for legal review). */
  experts: ReadonlyMap<string, readonly string[]>;
  /** The authors of a control and of its changes (git names and emails), who may not review it. */
  authorsOf: (controlId: string) => readonly string[];
  f5Confirmations: readonly F5Confirmation[];
  reverify: readonly ReverifyItem[];
  register: RegulatoryRegister;
}

export interface Promotion { reviewers: string[]; recordIds: string[]; reviewedAt: string; nextReviewDue: string }
export interface SupportResult {
  support: SupportLevel;
  /** Why declared support did not stand; empty when it did or nothing stronger than experimental was declared. */
  reasons: string[];
  /** Set only when reviewed or qualified support stands. */
  promotion: Promotion | null;
  /** Records for this control that did not count, by index in `authority.records`, with the first failed check. */
  rejected: Array<{ index: number; reason: string }>;
}

type Verified = { record: ReviewRecord; reviewer: string; nextReviewDue: string };
const norm = (value: string): string => value.trim().toLowerCase();
/** A principal's identifiers: the whole string, its name part before "<", and any email in it. */
const ids = (principal: string): string[] =>
  [norm(principal), norm(principal.split("<")[0] ?? ""), ...(principal.match(/[^\s<>]+@[^\s<>]+/g) ?? []).map(norm)].filter(Boolean);

function verifyRecord(raw: unknown, control: ControlRecord, digest: string, trust: TrustContext, authority: ReviewAuthority): Verified | string {
  const parsed = reviewRecordSchema.safeParse(raw);
  if (!parsed.success) return "GOV_REVIEW_RECORD_INVALID";
  const record = parsed.data;
  if (record.subject.kind !== "control" || record.subject.id !== control.id || record.subject.version !== control.version) return "GOV_REVIEW_OTHER_SUBJECT";
  if (record.subject.digest !== digest) return "GOV_REVIEW_SUBJECT_CHANGED";
  if (record.decidedAt > authority.now.toISOString().slice(0, 10)) return "GOV_REVIEW_IN_FUTURE";
  const { signature, ...unsigned } = record;
  const signed = reviewRecordDigest(unsigned);
  const check = checkSignature({ signature: "catalog review record", purpose: "catalog-review", context: trust,
    verify: (pem) => verifyHexDigest(signed, signature.value, pem), candidates: [signature.publicKeyPem], claimedSignedAt: record.decidedAt });
  if (!check.verified) return "GOV_REVIEW_SIGNATURE_INVALID";
  // Admission refuses distrusted, revoked, wrong-purpose and not-yet-valid keys; a --pubkey or workspace pin has no entry.
  const { status, listId, keyId } = check.admission;
  const entry = status === "admitted" ? trust.lists.find((l) => l.listId === listId)?.entries.find((e) => e.keyId === keyId) : undefined;
  if (!entry) return "GOV_REVIEW_SIGNER_UNPINNED";
  const reviewer = entry.subject;
  if (record.reviewer.identity.userId !== reviewer) return "GOV_REVIEW_REVIEWER_UNKNOWN";
  const authors = new Set(authority.authorsOf(control.id).flatMap(ids));
  if (ids(reviewer).some((id) => authors.has(id))) return "GOV_REVIEW_SELF_REVIEW";
  if (record.aiInputs.some((a) => a.kind === "f5_verdict" && a.confirmed && !authority.f5Confirmations.some((row) =>
    row.reviewRecordId === record.id && a.ref === `${row.station}/${row.packId}/${row.questionId}`))) return "GOV_REVIEW_F5_UNCONFIRMED";
  const due = nextReviewDue(control, authority.register, record.decidedAt);
  if (due.status === "unresolved") return due.reason;
  if (due.nextReviewDue < authority.now.toISOString().slice(0, 10)) return "GOV_REVIEW_OVERDUE";
  return { record, reviewer, nextReviewDue: due.nextReviewDue };
}

function quorum(control: ControlRecord, valid: readonly Verified[], experts: ReviewAuthority["experts"]): string[] {
  const approvals = valid.filter(({ record }) => record.decision === "approve");
  const credentialed = (reviewer: string, domains: readonly string[]) => (experts.get(reviewer) ?? []).some((d) => domains.includes(d));
  const reasons: string[] = [];
  if (new Set(approvals.map(({ reviewer }) => reviewer)).size < 2) reasons.push("GOV_QUORUM_TWO_HUMANS");
  if (!approvals.some(({ reviewer }) => credentialed(reviewer, control.stations))) reasons.push("GOV_QUORUM_DOMAIN_EXPERT");
  if (control.citations.length > 0 && !approvals.some(({ record, reviewer }) => record.role === "legal_reviewer" && credentialed(reviewer, ["legal"]))) {
    reasons.push("GOV_QUORUM_LEGAL_REVIEWER");
  }
  if (control.provenance.draftedBy === "ai" && !approvals.some(({ record }) => record.aiInputs.some((a) => a.kind === "draft" && a.confirmed))) {
    reasons.push("GOV_QUORUM_AI_DRAFT");
  }
  if (valid.some(({ record }) => record.decision !== "approve")) reasons.push("GOV_QUORUM_OBJECTION");
  return reasons;
}

export function effectiveSupport(control: ControlRecord, authority?: ReviewAuthority): SupportResult {
  const declared = control.support;
  if (declared !== "reviewed" && declared !== "qualified") return { support: declared, reasons: [], promotion: null, rejected: [] };
  const stays = (reasons: string[], rejected: SupportResult["rejected"] = []): SupportResult =>
    ({ support: "experimental", reasons: ["GOV_REVIEW_UNVERIFIED", ...reasons], promotion: null, rejected });
  if (!authority) return stays([]);
  let trust: TrustContext;
  try {
    const { amcHome, trustLists, trustRoots } = authority.trust;
    trust = loadTrustContext({ amcHome, trustLists, trustRoots, now: authority.now });
  } catch (error) {
    return stays([`GOV_REVIEW_TRUST_INVALID: ${error instanceof Error ? error.message : String(error)}`]);
  }
  if (reverifyOpenItems(control, authority.reverify).length > 0) return stays(["GOV_REVERIFY_OPEN"]);
  const digest = controlDigest(control);
  const results = authority.records.map((raw) => verifyRecord(raw, control, digest, trust, authority));
  const rejected = results.flatMap((r, index) => (typeof r === "string" && r !== "GOV_REVIEW_OTHER_SUBJECT" ? [{ index, reason: r }] : []));
  const valid = results.filter((r): r is Verified => typeof r !== "string");
  const missing = quorum(control, valid, authority.experts);
  if (missing.length > 0) return stays(missing, rejected);
  const approvals = valid.filter(({ record }) => record.decision === "approve");
  const promotion: Promotion = {
    reviewers: [...new Set(approvals.map(({ reviewer }) => reviewer))].sort(), recordIds: approvals.map(({ record }) => record.id),
    reviewedAt: approvals.map(({ record }) => record.decidedAt).sort()[0] as string, nextReviewDue: approvals.map((a) => a.nextReviewDue).sort()[0] as string
  };
  return { support: declared, reasons: [], promotion, rejected };
}

const stood = (effective: SupportLevel): boolean => effective === "reviewed" || effective === "qualified";

/** The review status a view may show: "approved" only where effectiveSupport let reviewed or qualified support stand. */
export function shownReviewStatus(control: ControlRecord, effective: SupportLevel): ControlRecord["review"]["status"] {
  return control.review.status === "approved" && !stood(effective) ? "pending" : control.review.status;
}

/** A citation's declared legal review as a view may show it: "recorded" only where effectiveSupport let the control's support stand. */
export function shownLegalReview(citation: Citation, effective: SupportLevel): "none" | "recorded" | "unverified" {
  return citation.legalReview === null ? "none" : stood(effective) ? "recorded" : "unverified";
}
