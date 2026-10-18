/**
 * Catalog review records (P1-34), stored as catalog/reviews/<subject-id>/<version>/<record-id>.json. A record counts
 * only when its reviewer signed it with a key a signed trust list pins for `catalog-review` (m-of-n roots where the
 * operator configured them). The reviewer is that trust-list entry's subject, never a field of the record; a record that
 * names anyone else, an unpinned or forged signature, or a self-review moves nothing. A verified record proves who
 * approved what and when, never that the content is right.
 */
import { z } from "zod";
import { signHexDigest, verifyHexDigest } from "../../crypto/keys.js";
import { checkSignature } from "../../trust/signatureCheck.js";
import type { TrustContext } from "../../trust/trustContext.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";

const nonblank = z.string().regex(/\S/, "must contain a non-whitespace character");
const isoDate = z.iso.date();
const DOMAIN = "amc.catalog-review/v1";

const reviewRecordSchema = z.strictObject({
  recordVersion: z.literal(1),
  id: z.string(),
  subject: z.strictObject({
    kind: z.enum(["control", "pack", "crosswalk", "citation"]),
    id: z.string(),
    version: z.string(),
    digest: z.string()
  }),
  role: z.enum(["domain_lead", "legal_reviewer", "risk_owner", "second_reviewer"]),
  reviewer: z.strictObject({
    name: z.string(),
    credential: nonblank,
    affiliation: z.string(),
    conflictsDeclared: nonblank,
    // AI agents draft and refute; they never approve (truth rule 8). userId must equal the signing key's trust-list subject.
    identity: z.strictObject({ userId: z.string(), kind: z.literal("human") })
  }),
  decision: z.enum(["approve", "reject", "request_changes"]),
  scope: z.array(z.enum(["statement", "applicability", "citations", "tests", "evidence", "crosswalk"])),
  aiInputs: z.array(z.strictObject({
    kind: z.enum(["draft", "refutation", "f5_verdict"]),
    ref: z.string(),
    confirmed: z.boolean()
  })),
  notes: z.string(),
  decidedAt: isoDate,
  nextReviewDue: isoDate,
  /** Ed25519 over sha256(DOMAIN, 0x00, canonical record without `signature`). The key only names a candidate signer. */
  signature: z.strictObject({ publicKeyPem: z.string().min(1), value: z.string().min(1) })
});
export type ReviewRecord = z.infer<typeof reviewRecordSchema>;

/** catalog/governance/f5-confirmations.yaml: the F5 verdicts a review record adopted. Unconfirmed verdicts change nothing. */
export const f5ConfirmationsFileSchema = z.strictObject({
  confirmationsVersion: z.literal(1),
  confirmations: z.array(z.strictObject({
    station: z.string().min(1), packId: z.string().min(1), questionId: z.string().min(1),
    verdict: z.enum(["keep", "rewrite", "merge", "drop"]), reviewRecordId: z.string().min(1)
  }))
});
export type F5Confirmation = z.infer<typeof f5ConfirmationsFileSchema>["confirmations"][number];

const recordDigest = (unsigned: Omit<ReviewRecord, "signature">): string =>
  sha256Hex(Buffer.concat([Buffer.from(DOMAIN, "ascii"), Buffer.from([0]), Buffer.from(canonicalize(unsigned), "utf8")]));

/** What a reviewer runs with their own key; AMC never holds it (getSigningKey refuses `catalog-review`). */
export function signReviewRecord(unsigned: Omit<ReviewRecord, "signature">, key: { privateKeyPem: string; publicKeyPem: string }): ReviewRecord {
  return { ...unsigned, signature: { publicKeyPem: key.publicKeyPem, value: signHexDigest(recordDigest(unsigned), key.privateKeyPem) } };
}

type ReviewReason = "GOV_REVIEW_RECORD_INVALID" | "GOV_REVIEW_SIGNATURE_INVALID" | "GOV_REVIEW_SIGNER_UNPINNED"
  | "GOV_REVIEW_REVIEWER_UNKNOWN" | "GOV_REVIEW_SELF_REVIEW" | "GOV_REVIEW_F5_UNCONFIRMED" | "GOV_REVIEW_SUBJECT_CHANGED";

export interface ReviewContext {
  /** The operator's trust (loadTrustContext, server clock): only its signed lists can pin a reviewer key. */
  trust: TrustContext;
  /** The subject's digest now. A record over any other digest is expired. */
  currentDigest: string;
  /** Who authored the subject and the change under review (git authors, names or emails); none may review it. */
  authors: readonly string[];
  f5Confirmations: readonly F5Confirmation[];
}

export interface ReviewVerification {
  /** Only "valid" counts; "unverified" and "expired" records move nothing. */
  status: "valid" | "expired" | "unverified";
  reason: ReviewReason | null;
  record: ReviewRecord | null;
  /** The signing key's trust-list subject: the reviewer, when the signature is pinned. */
  reviewer: string | null;
}

const norm = (value: string): string => value.trim().toLowerCase();

/** The trust-list subject of the key that signed `record`, or the reason no pinned reviewer signed it. */
function signer(record: ReviewRecord, trust: TrustContext): { reviewer: string } | { reason: ReviewReason } {
  const { signature, ...unsigned } = record;
  const digest = recordDigest(unsigned);
  const check = checkSignature({ signature: "catalog review record", purpose: "catalog-review", context: trust,
    verify: (pem) => verifyHexDigest(digest, signature.value, pem), candidates: [signature.publicKeyPem], claimedSignedAt: record.decidedAt });
  if (!check.verified) return { reason: "GOV_REVIEW_SIGNATURE_INVALID" };
  // Only a signed trust list's entry pins reviewer authority: an admission through --pubkey, workspace-self keys or
  // --allow-unpinned has no entry, and a wrong-purpose, revoked or not-yet-valid entry is not admitted.
  const { status, listId, keyId } = check.admission;
  const entry = status === "admitted" ? trust.lists.find((l) => l.listId === listId)?.entries.find((e) => e.keyId === keyId) : undefined;
  return entry ? { reviewer: entry.subject } : { reason: "GOV_REVIEW_SIGNER_UNPINNED" };
}

/**
 * Valid when the record parses (human identity, non-blank credential and conflicts), a key pinned for catalog-review
 * signed exactly these bytes, the record names that key's trust-list subject as its reviewer, the reviewer authored
 * neither the subject nor the change, and every confirmed F5 verdict has a confirmation row naming the record. Expired
 * when the subject's digest has moved since. The first failure is the reason.
 */
export function verifyReviewRecord(raw: unknown, ctx: ReviewContext): ReviewVerification {
  const parsed = reviewRecordSchema.safeParse(raw);
  if (!parsed.success) return { status: "unverified", reason: "GOV_REVIEW_RECORD_INVALID", record: null, reviewer: null };
  const record = parsed.data;
  const signed = signer(record, ctx.trust);
  if ("reason" in signed) return { status: "unverified", reason: signed.reason, record, reviewer: null };
  const { reviewer } = signed;
  const refuse = (reason: ReviewReason): ReviewVerification => ({ status: "unverified", reason, record, reviewer });
  if (record.reviewer.identity.userId !== reviewer) return refuse("GOV_REVIEW_REVIEWER_UNKNOWN");
  const authors = new Set(ctx.authors.map(norm));
  if (authors.has(norm(reviewer)) || authors.has(norm(record.reviewer.name))) return refuse("GOV_REVIEW_SELF_REVIEW");
  const confirmedF5 = record.aiInputs.filter((a) => a.kind === "f5_verdict" && a.confirmed);
  if (confirmedF5.some((a) => !ctx.f5Confirmations.some((row) => row.reviewRecordId === record.id
    && a.ref === `${row.station}/${row.packId}/${row.questionId}`))) return refuse("GOV_REVIEW_F5_UNCONFIRMED");
  if (record.subject.digest !== ctx.currentDigest) return { status: "expired", reason: "GOV_REVIEW_SUBJECT_CHANGED", record, reviewer };
  return { status: "valid", reason: null, record, reviewer };
}

export interface ReviewSubject extends Readonly<ReviewRecord["subject"]> {
  /** The domains (stations) the subject belongs to; a quorum needs an expert credentialed for one of them. */
  domains: readonly string[];
  /** provenance.draftedBy === "ai". */
  aiDrafted: boolean;
}

export interface QuorumContext extends Omit<ReviewContext, "currentDigest"> {
  /**
   * The D-08 expert roster: reviewer (trust-list subject) to credentialed domains ("legal" for legal review). Empty
   * until D-08 names the experts, so no quorum can be met before then. A record field never stands in for it.
   */
  experts: ReadonlyMap<string, readonly string[]>;
}

export type QuorumReason = "GOV_QUORUM_TWO_HUMANS" | "GOV_QUORUM_DOMAIN_EXPERT" | "GOV_QUORUM_LEGAL_REVIEWER"
  | "GOV_QUORUM_AI_DRAFT" | "GOV_QUORUM_OBJECTION";

/**
 * Whether `reviewed` support has its quorum (P1-33 criteria 2 and 9 call this): valid approvals from at least two
 * distinct pinned reviewers, one credentialed for the subject's domain; a citation also needs a credentialed legal
 * reviewer; AI-drafted content needs an approval confirming the draft; any valid objection blocks. Records are verified
 * here, so unverified or expired ones never count.
 */
export function meetsReviewQuorum(subject: ReviewSubject, records: readonly unknown[], ctx: QuorumContext): { met: boolean; reasons: QuorumReason[]; approvers: string[] } {
  const valid = records.map((raw) => verifyReviewRecord(raw, { ...ctx, currentDigest: subject.digest }))
    .flatMap(({ status, record: r, reviewer }) => (status === "valid" && r && reviewer && r.subject.kind === subject.kind && r.subject.id === subject.id
      && r.subject.version === subject.version ? [{ r, reviewer }] : []));
  const approvals = valid.filter(({ r }) => r.decision === "approve");
  const credentialed = (reviewer: string, domains: readonly string[]) => (ctx.experts.get(reviewer) ?? []).some((d) => domains.includes(d));
  const approvers = [...new Set(approvals.map(({ reviewer }) => reviewer))];
  const reasons: QuorumReason[] = [];
  if (approvers.length < 2) reasons.push("GOV_QUORUM_TWO_HUMANS");
  if (!approvals.some(({ reviewer }) => credentialed(reviewer, subject.domains))) reasons.push("GOV_QUORUM_DOMAIN_EXPERT");
  if (subject.kind === "citation" && !approvals.some(({ r, reviewer }) => r.role === "legal_reviewer" && credentialed(reviewer, ["legal"]))) reasons.push("GOV_QUORUM_LEGAL_REVIEWER");
  if (subject.aiDrafted && !approvals.some(({ r }) => r.aiInputs.some((a) => a.kind === "draft" && a.confirmed))) reasons.push("GOV_QUORUM_AI_DRAFT");
  if (valid.some(({ r }) => r.decision !== "approve")) reasons.push("GOV_QUORUM_OBJECTION");
  return { met: reasons.length === 0, reasons, approvers };
}
