/**
 * Catalog review records (P1-34), stored as catalog/reviews/<subject-id>/<version>/<record-id>.json. A record is a
 * declaration; it counts only through verifyReviewRecord, which binds it to a signed approval-engine decision by the
 * same user over the subject digest. Those signatures use the workspace's keys: a local audit trail, not portable trust.
 * A verified record proves who approved what and when, never that the content is right.
 */
import { z } from "zod";
import {
  approvalRequestBindingDigest, inspectApprovalChainIntegrity, listApprovalDecisions, loadApprovalRequestRecord
} from "../../approvals/approvalChainStore.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";

const nonblank = z.string().regex(/\S/, "must contain a non-whitespace character");
const isoDate = z.iso.date();

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
    // AI agents draft and refute; they never approve (truth rule 8).
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
  approvalRequestId: z.string()
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

const CATALOG_REVIEW_TOOL = "catalog.review.decide";

/** The approval intent a review decision is bound to: its hash covers the subject digest. */
export function catalogReviewIntent({ kind, id, version, digest }: ReviewRecord["subject"]) {
  const subject = { kind, id, version, digest };
  const intentPayload = { schema: "amc.catalog-review/v1", subject };
  return { intentId: `catalog-review-${sha256Hex(canonicalize(subject)).slice(0, 32)}`, toolName: CATALOG_REVIEW_TOOL,
    actionClass: "SECURITY" as const, intentPayload };
}

type ReviewReason = "GOV_REVIEW_RECORD_INVALID" | "GOV_REVIEW_SELF_REVIEW" | "GOV_REVIEW_F5_UNCONFIRMED"
  | "GOV_REVIEW_APPROVAL_UNVERIFIED" | "GOV_REVIEW_APPROVAL_UNBOUND" | "GOV_REVIEW_DECISION_MISSING"
  | "GOV_REVIEW_DECISION_UNBOUND" | "GOV_REVIEW_DECISION_MISMATCH" | "GOV_REVIEW_AGENT_IDENTITY" | "GOV_REVIEW_SUBJECT_CHANGED";

export interface ReviewContext {
  /** The workspace whose signed approval chain holds the decisions, and the agent id the requests were filed under. */
  workspace: string;
  agentId: string;
  /** The subject's digest now. A record bound to any other digest is expired. */
  currentDigest: string;
  /** Who authored the subject and the change under review (git authors, names or emails); none may review it. */
  authors: readonly string[];
  f5Confirmations: readonly F5Confirmation[];
}

export interface ReviewVerification {
  status: "valid" | "expired" | "refused";
  reason: ReviewReason | null;
  record: ReviewRecord | null;
}

const norm = (value: string): string => value.trim().toLowerCase();

/** The signed decision this record stands on, or the reason there is none. Errors reading the chain are integrity failures. */
function boundDecision(record: ReviewRecord, ctx: ReviewContext): ReviewReason | null {
  const { workspace, agentId } = ctx;
  const approvalRequestId = record.approvalRequestId;
  try {
    const request = loadApprovalRequestRecord({ workspace, agentId, approvalRequestId, requireValidSignature: true });
    if (!inspectApprovalChainIntegrity({ workspace, agentId, approvalRequestId }).valid) return "GOV_REVIEW_APPROVAL_UNVERIFIED";
    const intent = catalogReviewIntent(record.subject);
    if (request.intentId !== intent.intentId || request.toolName !== intent.toolName
      || request.boundHashes.intentHash !== sha256Hex(canonicalize(intent.intentPayload))) return "GOV_REVIEW_APPROVAL_UNBOUND";
    const mine = listApprovalDecisions({ workspace, agentId, approvalRequestId }).filter((d) => d.userId === record.reviewer.identity.userId);
    if (mine.length === 0) return "GOV_REVIEW_DECISION_MISSING";
    if (mine.some((d) => d.roles.includes("AGENT"))) return "GOV_REVIEW_AGENT_IDENTITY";
    if (mine.some((d) => d.requestDigestSha256 !== approvalRequestBindingDigest(request))) return "GOV_REVIEW_DECISION_UNBOUND";
    const approved = record.decision === "approve";
    if (mine.some((d) => (d.decision !== "DENY") !== approved)) return "GOV_REVIEW_DECISION_MISMATCH";
    return null;
  } catch {
    return "GOV_REVIEW_APPROVAL_UNVERIFIED";
  }
}

/**
 * Valid when the record parses (human identity, non-blank credential and conflicts), its reviewer authored neither the
 * subject nor the change, every confirmed F5 verdict has a confirmation row naming it, and the reviewer's own signed,
 * request-bound decision on a request whose intent hash covers the record's subject agrees with it. Expired when the
 * subject's digest has moved since. The first failure is the reason.
 */
export function verifyReviewRecord(raw: unknown, ctx: ReviewContext): ReviewVerification {
  const parsed = reviewRecordSchema.safeParse(raw);
  if (!parsed.success) return { status: "refused", reason: "GOV_REVIEW_RECORD_INVALID", record: null };
  const record = parsed.data;
  const refuse = (reason: ReviewReason): ReviewVerification => ({ status: "refused", reason, record });
  const authors = new Set(ctx.authors.map(norm));
  if (authors.has(norm(record.reviewer.identity.userId)) || authors.has(norm(record.reviewer.name))) return refuse("GOV_REVIEW_SELF_REVIEW");
  const confirmedF5 = record.aiInputs.filter((a) => a.kind === "f5_verdict" && a.confirmed);
  if (confirmedF5.some((a) => !ctx.f5Confirmations.some((row) => row.reviewRecordId === record.id
    && a.ref === `${row.station}/${row.packId}/${row.questionId}`))) return refuse("GOV_REVIEW_F5_UNCONFIRMED");
  const decision = boundDecision(record, ctx);
  if (decision) return refuse(decision);
  if (record.subject.digest !== ctx.currentDigest) return { status: "expired", reason: "GOV_REVIEW_SUBJECT_CHANGED", record };
  return { status: "valid", reason: null, record };
}

export interface ReviewSubject extends Readonly<ReviewRecord["subject"]> {
  /** The domains (stations) the subject belongs to; a quorum needs an expert credentialed for one of them. */
  domains: readonly string[];
  /** provenance.draftedBy === "ai". */
  aiDrafted: boolean;
}

export interface QuorumContext extends Omit<ReviewContext, "currentDigest"> {
  /**
   * The D-08 expert roster: user id to credentialed domains ("legal" for legal review). Empty until D-08 names the
   * experts, so no quorum can be met before then. A declared record field never stands in for it.
   */
  experts: ReadonlyMap<string, readonly string[]>;
}

export type QuorumReason = "GOV_QUORUM_TWO_HUMANS" | "GOV_QUORUM_DOMAIN_EXPERT" | "GOV_QUORUM_LEGAL_REVIEWER"
  | "GOV_QUORUM_AI_DRAFT" | "GOV_QUORUM_OBJECTION";

/**
 * Whether `reviewed` support has its quorum (P1-33 criteria 2 and 9 call this): verified approvals from at least two
 * distinct humans, one credentialed for the subject's domain; a citation also needs a credentialed legal reviewer;
 * AI-drafted content needs an approval confirming the draft; any verified objection blocks. Records are verified here.
 */
export function meetsReviewQuorum(subject: ReviewSubject, records: readonly unknown[], ctx: QuorumContext): { met: boolean; reasons: QuorumReason[]; approvers: string[] } {
  const verified = records.map((raw) => verifyReviewRecord(raw, { ...ctx, currentDigest: subject.digest }))
    .flatMap(({ status, record: r }) => (status === "valid" && r && r.subject.kind === subject.kind && r.subject.id === subject.id
      && r.subject.version === subject.version ? [r] : []));
  const approvals = verified.filter((r) => r.decision === "approve");
  const credentialed = (r: ReviewRecord, domains: readonly string[]) => (ctx.experts.get(r.reviewer.identity.userId) ?? []).some((d) => domains.includes(d));
  const approvers = [...new Set(approvals.map((r) => r.reviewer.identity.userId))];
  const reasons: QuorumReason[] = [];
  if (approvers.length < 2) reasons.push("GOV_QUORUM_TWO_HUMANS");
  if (!approvals.some((r) => credentialed(r, subject.domains))) reasons.push("GOV_QUORUM_DOMAIN_EXPERT");
  if (subject.kind === "citation" && !approvals.some((r) => r.role === "legal_reviewer" && credentialed(r, ["legal"]))) reasons.push("GOV_QUORUM_LEGAL_REVIEWER");
  if (subject.aiDrafted && !approvals.some((r) => r.aiInputs.some((a) => a.kind === "draft" && a.confirmed))) reasons.push("GOV_QUORUM_AI_DRAFT");
  if (verified.some((r) => r.decision !== "approve")) reasons.push("GOV_QUORUM_OBJECTION");
  return { met: reasons.length === 0, reasons, approvers };
}
