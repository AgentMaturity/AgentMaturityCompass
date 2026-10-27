/**
 * Review records (P2-24, backlog A08): a human review counts only for the exact digest it reviewed. A record is signed
 * and approval-bound like a scoped exception (src/governor/boundRecords.ts), and `reviewStatusFor` is the one place a
 * Review dimension is read from: `approved` only for an unexpired approval of exactly the current digest with no
 * rejection of that digest. A reviewer is never the requester. A review is a recorded human judgement, never a
 * certification.
 */
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import { reviewRecordV1Schema, type ReviewableKind, type ReviewRecordV1 } from "../contracts/v1/governanceRecords.js";
import {
  approvalMatches, assertRecordApproved, BoundRecordError, draftDigest, publishSignedRecord, raiseRecordApproval,
  readSignedRecords, type BoundApproval
} from "../governor/boundRecords.js";

export type { ReviewableKind, ReviewRecordV1 };
/** The P0-08 Review dimension. */
export type ReviewStatus = "pending" | "approved" | "rejected" | "expired";

const draftSchema = reviewRecordV1Schema.omit({ approval: true }).refine((draft) => draft.reviewer.userId !== draft.requesterId,
  { message: "reviewer_is_requester: a reviewer cannot review their own request" });
export type ReviewRecordDraft = z.infer<typeof draftSchema>;

const reviewsDir = (workspace: string): string => join(workspace, ".amc", "governor", "reviews");

function parseDraft(raw: unknown): ReviewRecordDraft {
  const parsed = draftSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const self = parsed.error.issues.find((issue) => issue.message.startsWith("reviewer_is_requester"));
  throw self ? new BoundRecordError("reviewer_is_requester", "a reviewer cannot review their own request") : parsed.error;
}

/**
 * Step 1: validate the review and raise its approval (the signed policy's quorum; the reviewer's own decision never
 * counts). `agentId` names the approval store the request lives in.
 */
export async function requestReviewRecord(workspace: string, agentId: string,
  input: Omit<ReviewRecordDraft, "schema" | "reviewId" | "reviewedAt">): Promise<{ draft: ReviewRecordDraft; approval: BoundApproval }> {
  const draft = parseDraft({ ...input, schema: "amc.review-record/v1", reviewId: `rev_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
    reviewedAt: new Date().toISOString() });
  const approval = await raiseRecordApproval(workspace, { kind: "review-record", recordId: draft.reviewId, digest: draftDigest(draft),
    agentId });
  return { draft, approval };
}

/** Step 2: with the quorum's bound decisions in place, sign and publish exactly the reviewed draft. */
export async function fileReviewRecord(workspace: string, draft: ReviewRecordDraft, approval: BoundApproval): Promise<ReviewRecordV1> {
  const parsed = parseDraft(draft);
  assertRecordApproved(workspace, approval, { kind: "review-record", recordId: parsed.reviewId, digest: draftDigest(parsed),
    initiator: parsed.reviewer.userId, mode: "quorum" });
  const record = reviewRecordV1Schema.parse({ ...parsed, approval });
  await publishSignedRecord(workspace, reviewsDir(workspace), record.reviewId, record, "review-record");
  return record;
}

/** Review records whose signature, shape, self-review rule and approval binding all verify. Others are never counted. */
export function verifiedReviewRecords(workspace: string): ReviewRecordV1[] {
  return readSignedRecords(workspace, reviewsDir(workspace), "review-record", (raw) => reviewRecordV1Schema.parse(raw)).records
    .filter(({ record, file }) => file === `${record.reviewId}.json` && record.reviewer.userId !== record.requesterId
      && approvalMatches(workspace, record.approval, "review-record", draftDigest(record)))
    .map(({ record }) => record);
}

/**
 * The Review dimension for one subject at its current digest. Any rejection of that digest gives `rejected`, even
 * beside an approval (contradictory reviews never pass); an unexpired approval gives `approved`; an approval whose
 * `expiresAt` lapsed gives `expired`; anything else, including reviews of an earlier digest, gives `pending`.
 */
export function reviewStatusFor(workspace: string, subject: { kind: ReviewableKind; id: string; currentSha256: string },
  now: number = Date.now()): ReviewStatus {
  const reviews = verifiedReviewRecords(workspace).filter((review) => review.subject.kind === subject.kind
    && review.subject.id === subject.id && review.subject.sha256 === subject.currentSha256);
  if (reviews.some((review) => review.decision === "rejected")) return "rejected";
  const approvals = reviews.filter((review) => review.decision === "approved");
  if (approvals.some((review) => review.expiresAt === null || Date.parse(review.expiresAt) > now)) return "approved";
  return approvals.length > 0 ? "expired" : "pending";
}
