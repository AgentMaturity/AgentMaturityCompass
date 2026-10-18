/**
 * A control's support (P1-34). supportStanding is the only function that lets declared reviewed or qualified support
 * stand: it needs a promotion for exactly the control's current content whose next review has not passed. Promotions
 * come only from effectiveSupport, which verifies review records against the operator's trust at the server's clock.
 * compilePlan takes promotions as a pure input bound into the plan digest; activation and its policy receipts, the A4
 * views, the OSCAL export and check:catalog-currency read support and the shown review fields only through these
 * results (tests/catalog/governance/promotion.test.ts scans for other reads). Nothing raises support above what the
 * YAML declares or edits a record. A verified review shows who approved what, never that the content is right.
 *
 * effectiveSupport counts a record only when it parses, covers the control's current digest, is not dated after the
 * server's date, verifies under a key a signed trust-list entry pins for catalog-review (pinned roots, m-of-n,
 * anti-rollback; revoked, distrusted, expired and wrong-purpose keys refused), names that entry's subject, the reviewer
 * is on the D-08 roster and none of their identities (subject, roster git identities, declared name) is an author's,
 * every confirmed F5 verdict has a confirmation row, and the review is current. The quorum then needs two distinct people
 * (reviewers sharing any normalized identifier are one), one roster-credentialed for the control's domain, a credentialed
 * legal reviewer when it cites law, a confirmation naming the control when AI drafted it, no objection, and no open
 * re-verify item. packSignoffs (P1-33 admission) verifies a pack version's records by the same steps.
 */
import { lstatSync } from "node:fs";
import { join } from "node:path";
import type { RegulatoryRegister } from "../../compliance/regulatory/index.js";
import { resolveAmcHome } from "../../credentials/credentialsPaths.js";
import { verifyHexDigest } from "../../crypto/keys.js";
import { checkSignature } from "../../trust/signatureCheck.js";
import { loadTrustContext, type TrustContext } from "../../trust/trustContext.js";
import { controlDigest, digestOf } from "../digest.js";
import type { Citation, ControlRecord, SupportLevel } from "../types.js";
import { nextReviewDue } from "./currency.js";
import { reviewRecordDigest, reviewRecordSchema, type F5Confirmation, type ReviewRecord } from "./reviewRecord.js";
import { reverifyOpenItems, type ReverifyItem } from "./reverify.js";

/**
 * A D-08 roster entry, keyed by the reviewer's trust-list subject: credentialed domains ("legal" too) and the git
 * identities (names, emails) the person commits under. At least one identity, or the reviewer never counts.
 */
export interface RosterEntry { domains: readonly string[]; identities: readonly string[] }

/**
 * What effectiveSupport needs besides trust. Trust is never an input: it is the operator's AMC home (AMC_HOME, else
 * ~/.config/amc), its trust/trust-roots.json and its signed trust list, loaded by loadTrustContext. Only a list entry
 * pins a reviewer: no caller list or root, no --pubkey, no --allow-unpinned.
 */
export interface ReviewAuthority {
  /** YYYY-MM-DD to judge due dates at, to look ahead; never earlier than the server's date. Trust and signatures always use the server's clock. */
  asOf?: string;
  /** Raw review record files (catalog/reviews/**); each is verified here and trusted for nothing else. */
  records: readonly unknown[];
  /** The D-08 roster. A reviewer who is not on it never counts. */
  experts: ReadonlyMap<string, RosterEntry>;
  /** The git identities (names and emails) of a control's or pack's authors, who may not review it. */
  authorsOf: (subjectId: string) => readonly string[];
  f5Confirmations: readonly F5Confirmation[];
  reverify: readonly ReverifyItem[];
  register: RegulatoryRegister;
}

/**
 * What effectiveSupport decided for one control's current content; compilePlan binds it, with the digest of every review
 * record it counted, into the plan. Only effectiveSupport mints one (frozen); supportStanding refuses any other object.
 */
export interface Promotion {
  readonly controlId: string; readonly controlVersion: string; readonly controlDigest: string;
  readonly reviewers: readonly string[]; readonly recordIds: readonly string[];
  /** digestOf each counted record, signature included, in recordIds order. */
  readonly recordDigests: readonly string[];
  readonly reviewedAt: string; readonly nextReviewDue: string;
}
const minted = new WeakSet<Promotion>();
export interface SupportResult {
  support: SupportLevel;
  /** Why declared support did not stand; empty when it did or nothing stronger than experimental was declared. */
  reasons: string[];
  /** Set only when reviewed or qualified support stands. */
  promotion: Promotion | null;
  /** Records for this control that did not count, by index in `authority.records`, with the first failed check. */
  rejected: Array<{ index: number; reason: string }>;
}

type Verified = { record: ReviewRecord; reviewer: string; identities: Set<string>; nextReviewDue: string };
/** What a record must name: one control, or one pack version with its controls (P1-33 sign-offs), at its current digest. */
interface Subject { kind: "control" | "pack"; id: string; version: string; digest: string; controls: readonly ControlRecord[] }
/**
 * NFKC without default-ignorable code points (zero-width space, ZWJ, ZWNJ, soft hyphen, word joiner, BOM), every run of
 * whitespace (NBSP and other Unicode spaces too) as one space, trimmed, then case-folded. Confusables (UTS #39) are not
 * folded; GOVERNANCE.md states that limit.
 */
const norm = (value: string): string =>
  value.normalize("NFKC").replace(/\p{Default_Ignorable_Code_Point}/gu, "").replace(/\s+/gu, " ").trim().toUpperCase().toLowerCase();
/** An email without a +tag on its local part or trailing dots on its domain. */
const mailbox = (email: string): string => {
  const at = email.lastIndexOf("@");
  return `${email.slice(0, at).replace(/\+.*$/u, "")}@${email.slice(at + 1).replace(/\.+$/u, "")}`;
};
/**
 * A principal's identifiers: the whole string, its name part before "<", the name without spaces (so a zero-width or
 * missing space still matches; a false match only refuses a review), and any email in it.
 */
const ids = (principal: string): string[] => {
  const p = norm(principal);
  const name = norm(p.split("<")[0] ?? "");
  return [p, name, name.replace(/ /gu, ""), ...(p.match(/[^\s<>()]+@[^\s<>()]+/gu) ?? []).map(mailbox)].filter(Boolean);
};
const stronger = (support: SupportLevel): boolean => support === "reviewed" || support === "qualified";
const dateOf = (at: Date): string => at.toISOString().slice(0, 10);

/** The earliest next review over the subject's controls; any it cannot establish leaves the record uncounted. */
function dueOf(controls: readonly ControlRecord[], register: RegulatoryRegister, decidedAt: string): ReturnType<typeof nextReviewDue> {
  let earliest: ReturnType<typeof nextReviewDue> = { status: "unresolved", reason: "GOV_REVIEW_POLICY_INVALID" };
  for (const control of controls) {
    const due = nextReviewDue(control, register, decidedAt);
    if (due.status === "unresolved") return due;
    if (earliest.status === "unresolved" || due.nextReviewDue < earliest.nextReviewDue) earliest = due;
  }
  return earliest;
}

function verifyRecord(raw: unknown, subject: Subject, trust: TrustContext, authority: ReviewAuthority,
  dates: { today: string; dueAsOf: string }): Verified | string {
  const parsed = reviewRecordSchema.safeParse(raw);
  if (!parsed.success) return "GOV_REVIEW_RECORD_INVALID";
  const record = parsed.data;
  if (record.subject.kind !== subject.kind || record.subject.id !== subject.id || record.subject.version !== subject.version) return "GOV_REVIEW_OTHER_SUBJECT";
  if (record.subject.digest !== subject.digest) return "GOV_REVIEW_SUBJECT_CHANGED";
  if (record.decidedAt > dates.today) return "GOV_REVIEW_IN_FUTURE";
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
  const person = authority.experts.get(reviewer);
  if (!person) return "GOV_REVIEW_NOT_ON_ROSTER";
  if (!person.identities.some((identity) => ids(identity).length > 0)) return "GOV_REVIEW_ROSTER_NO_IDENTITY";
  // Git authors are unsigned claims, so independence is judged on every identity the reviewer has, the declared name included.
  const identities = new Set([reviewer, ...person.identities, record.reviewer.name].flatMap(ids));
  if (authority.authorsOf(subject.id).flatMap(ids).some((id) => identities.has(id))) return "GOV_REVIEW_SELF_REVIEW";
  if (record.aiInputs.some((a) => a.kind === "f5_verdict" && a.confirmed && !authority.f5Confirmations.some((row) =>
    row.reviewRecordId === record.id && a.ref === `${row.station}/${row.packId}/${row.questionId}`))) return "GOV_REVIEW_F5_UNCONFIRMED";
  const due = dueOf(subject.controls, authority.register, record.decidedAt);
  if (due.status === "unresolved") return due.reason;
  if (due.nextReviewDue < dates.dueAsOf) return "GOV_REVIEW_OVERDUE";
  return { record, reviewer, identities, nextReviewDue: due.nextReviewDue };
}

/** Distinct people among the approvers: reviewers sharing any normalized identifier are one person. */
function people(approvals: readonly Verified[]): number {
  const groups: Array<Set<string>> = [];
  for (const { identities } of approvals) {
    const joined = groups.filter((group) => [...identities].some((id) => group.has(id)));
    const merged = new Set([...identities, ...joined.flatMap((group) => [...group])]);
    for (const group of joined) groups.splice(groups.indexOf(group), 1);
    groups.push(merged);
  }
  return groups.length;
}

/** Whether the roster credentials `reviewer` for any of `domains` ("legal" for legal review). */
const credentialedIn = (experts: ReviewAuthority["experts"], reviewer: string, domains: readonly string[]): boolean =>
  (experts.get(reviewer)?.domains ?? []).some((d) => domains.includes(d));

function quorum(control: ControlRecord, digest: string, valid: readonly Verified[], experts: ReviewAuthority["experts"]): string[] {
  const approvals = valid.filter(({ record }) => record.decision === "approve");
  const credentialed = (reviewer: string, domains: readonly string[]) => credentialedIn(experts, reviewer, domains);
  const draft = [`${control.id}@${control.version}`, digest];
  const reasons: string[] = [];
  if (people(approvals) < 2) reasons.push("GOV_QUORUM_TWO_HUMANS");
  if (!approvals.some(({ reviewer }) => credentialed(reviewer, control.stations))) reasons.push("GOV_QUORUM_DOMAIN_EXPERT");
  if (control.citations.length > 0 && !approvals.some(({ record, reviewer }) => record.role === "legal_reviewer" && credentialed(reviewer, ["legal"]))) {
    reasons.push("GOV_QUORUM_LEGAL_REVIEWER");
  }
  if (control.provenance.draftedBy === "ai" && !approvals.some(({ record }) => record.aiInputs.some((a) => a.kind === "draft" && a.confirmed && draft.includes(a.ref)))) {
    reasons.push("GOV_QUORUM_AI_DRAFT");
  }
  if (valid.some(({ record }) => record.decision !== "approve")) reasons.push("GOV_QUORUM_OBJECTION");
  return reasons;
}

const stays = (reasons: string[], rejected: SupportResult["rejected"] = []): SupportResult =>
  ({ support: "experimental", reasons: ["GOV_REVIEW_UNVERIFIED", ...reasons], promotion: null, rejected });

/**
 * Pure (a date comparison, no clock): the support a control's declaration may have, given a promotion (or none) and
 * the date (YYYY-MM-DD) it is judged at. Reviewed or qualified support stands only with a promotion effectiveSupport
 * minted, naming reviewers and records, for this control's id, version and current digest, reviewed on or before
 * `asOf` and not yet due; experimental and retired declarations are returned as they are.
 */
export function supportStanding(control: ControlRecord, promotion: Promotion | undefined, asOf: string): SupportResult {
  if (!stronger(control.support)) return { support: control.support, reasons: [], promotion: null, rejected: [] };
  if (!promotion) return stays([]);
  if (promotion.reviewers.length === 0 || promotion.recordIds.length === 0 || promotion.recordDigests.length !== promotion.recordIds.length) {
    return stays(["GOV_REVIEW_PROMOTION_EMPTY"]);
  }
  if (!minted.has(promotion)) return stays(["GOV_REVIEW_PROMOTION_UNVERIFIED"]);
  if (promotion.controlId !== control.id || promotion.controlVersion !== control.version || promotion.controlDigest !== controlDigest(control)) {
    return stays(["GOV_REVIEW_SUBJECT_CHANGED"]);
  }
  if (promotion.reviewedAt > asOf) return stays(["GOV_REVIEW_IN_FUTURE"]);
  if (promotion.nextReviewDue < asOf) return stays(["GOV_REVIEW_OVERDUE"]);
  return { support: control.support, reasons: [], promotion, rejected: [] };
}

/** The server's clock (no caller can move it back) and the dates records are judged at; `asOf` only looks ahead. */
function clock(authority: ReviewAuthority): { now: Date; dates: { today: string; dueAsOf: string } } {
  const now = new Date();
  const today = dateOf(now);
  return { now, dates: { today, dueAsOf: authority.asOf !== undefined && authority.asOf > today ? authority.asOf : today } };
}

/** The operator's trust at `now`, or why none loads: without pinned trust roots no list can verify, so nothing counts. */
function operatorTrust(now: Date): TrustContext | string {
  if (lstatSync(join(resolveAmcHome(), "trust", "trust-roots.json"), { throwIfNoEntry: false }) === undefined) {
    return "GOV_REVIEW_TRUST_INVALID: trust roots not configured";
  }
  try {
    return loadTrustContext({ now });
  } catch (error) {
    return `GOV_REVIEW_TRUST_INVALID: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/** Verifies `authority.records` for `control` (the only source of promotions) and returns supportStanding's verdict. */
export function effectiveSupport(control: ControlRecord, authority?: ReviewAuthority): SupportResult {
  if (!stronger(control.support) || !authority) return supportStanding(control, undefined, "");
  const { now, dates } = clock(authority);
  const trust = operatorTrust(now);
  if (typeof trust === "string") return stays([trust]);
  if (reverifyOpenItems(control, authority.reverify).length > 0) return stays(["GOV_REVERIFY_OPEN"]);
  const digest = controlDigest(control);
  const subject: Subject = { kind: "control", id: control.id, version: control.version, digest, controls: [control] };
  const results = authority.records.map((raw) => verifyRecord(raw, subject, trust, authority, dates));
  const rejected = results.flatMap((r, index) => (typeof r === "string" && r !== "GOV_REVIEW_OTHER_SUBJECT" ? [{ index, reason: r }] : []));
  const valid = results.filter((r): r is Verified => typeof r !== "string");
  const missing = quorum(control, digest, valid, authority.experts);
  if (missing.length > 0) return stays(missing, rejected);
  const approvals = valid.filter(({ record }) => record.decision === "approve");
  const promotion: Promotion = Object.freeze({ controlId: control.id, controlVersion: control.version, controlDigest: digest,
    reviewers: Object.freeze([...new Set(approvals.map(({ reviewer }) => reviewer))].sort()),
    recordIds: Object.freeze(approvals.map(({ record }) => record.id)), recordDigests: Object.freeze(approvals.map(({ record }) => digestOf(record))),
    reviewedAt: approvals.map(({ record }) => record.decidedAt).sort()[0] as string, nextReviewDue: approvals.map((a) => a.nextReviewDue).sort()[0] as string });
  minted.add(promotion);
  return { ...supportStanding(control, promotion, dates.dueAsOf), rejected };
}

/** A pack version's sign-offs (P1-33 admission criterion 9). */
export interface PackSignoffs {
  /** Why the sign-offs do not stand; empty when they do. */
  reasons: string[];
  /** Records naming this pack that did not count, by index in `authority.records`, with the first failed check. */
  rejected: SupportResult["rejected"];
  /** The domain lead, legal reviewer and risk owner counted (set only when the sign-offs stand), with each record's digest. */
  signers: Array<{ role: ReviewRecord["role"]; reviewer: string; recordId: string; recordDigest: string }>;
}

const SIGNOFF_ROLES = ["GOV_SIGNOFF_DOMAIN_LEAD", "GOV_SIGNOFF_LEGAL_REVIEWER", "GOV_SIGNOFF_RISK_OWNER"] as const;

/**
 * P1-33 admission criterion 9: records for subject kind "pack" at this version and current pack digest, verified by the
 * same steps as a control's (trust at the server's clock, pinned catalog-review key, reviewer from the key, D-08 roster,
 * independence from the pack's authors, F5, currency at the earliest of its controls' cadences). The pack needs
 * approvals from a domain lead credentialed for one of its stations, a credentialed legal reviewer and a risk owner who
 * are three distinct people, no objection and no open re-verify item on any of its controls. When no record names the
 * pack, trust is not loaded and every role is missing. A sign-off shows who approved the pack, not that it is right.
 */
export function packSignoffs(pack: { id: string; version: string; digest: string; stations: readonly string[] },
  controls: readonly ControlRecord[], authority: ReviewAuthority): PackSignoffs {
  const none = (reasons: string[]): PackSignoffs => ({ reasons, rejected: [], signers: [] });
  const named = authority.records.some((raw) => {
    const subject = (raw as { subject?: { kind?: unknown; id?: unknown } } | null)?.subject;
    return subject?.kind === "pack" && subject.id === pack.id;
  });
  if (!named) return none([...SIGNOFF_ROLES]);
  const { now, dates } = clock(authority);
  const trust = operatorTrust(now);
  if (typeof trust === "string") return none([trust]);
  if (controls.some((control) => reverifyOpenItems(control, authority.reverify).length > 0)) return none(["GOV_REVERIFY_OPEN"]);
  const subject: Subject = { kind: "pack", id: pack.id, version: pack.version, digest: pack.digest, controls };
  const results = authority.records.map((raw) => verifyRecord(raw, subject, trust, authority, dates));
  const rejected = results.flatMap((r, index) => (typeof r === "string" && r !== "GOV_REVIEW_OTHER_SUBJECT" ? [{ index, reason: r }] : []));
  const valid = results.filter((r): r is Verified => typeof r !== "string");
  const approvals = valid.filter(({ record }) => record.decision === "approve");
  const holders = (role: ReviewRecord["role"], domains: readonly string[] | null) => approvals.filter(({ record, reviewer }) =>
    record.role === role && (domains === null || credentialedIn(authority.experts, reviewer, domains)));
  const roles = [holders("domain_lead", pack.stations), holders("legal_reviewer", ["legal"]), holders("risk_owner", null)] as const;
  const reasons: string[] = SIGNOFF_ROLES.filter((_, i) => roles[i]!.length === 0);
  const trio = roles[0].flatMap((d) => roles[1].flatMap((l) => roles[2].map((r) => [d, l, r]))).find((t) => people(t) === 3);
  if (reasons.length === 0 && !trio) reasons.push("GOV_SIGNOFF_THREE_HUMANS");
  if (valid.some(({ record }) => record.decision !== "approve")) reasons.push("GOV_QUORUM_OBJECTION");
  const signers = reasons.length > 0 || !trio ? [] : trio.map(({ record, reviewer }) => ({ role: record.role, reviewer, recordId: record.id, recordDigest: digestOf(record) }));
  return { reasons, rejected, signers };
}

/** The review status a view may show: "approved" only where support stood. */
export function shownReviewStatus(control: ControlRecord, effective: SupportLevel): ControlRecord["review"]["status"] {
  return control.review.status === "approved" && !stronger(effective) ? "pending" : control.review.status;
}

/**
 * A control's review and provenance blocks as an export may show them: where support did not stand, no named review
 * (expert, credential and dates null, status through shownReviewStatus) and no approver.
 */
export function shownReviewBlocks(control: ControlRecord, effective: SupportLevel): Pick<ControlRecord, "review" | "provenance"> {
  if (stronger(effective)) return { review: control.review, provenance: control.provenance };
  return { review: { status: shownReviewStatus(control, effective), expert: null, credential: null, reviewedAt: null, nextReview: null },
    provenance: { ...control.provenance, approvedBy: null } };
}

/** The only values a view shows for a citation's legal review; views render them as given. */
export type ShownLegalReview = "none" | "recorded" | "unverified";

/** A citation's declared legal review as a view may show it: "recorded" only where effectiveSupport let the control's support stand. */
export function shownLegalReview(citation: Citation, effective: SupportLevel): ShownLegalReview {
  return citation.legalReview === null ? "none" : stronger(effective) ? "recorded" : "unverified";
}
