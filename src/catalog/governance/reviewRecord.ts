/**
 * P1-34 step 2 only: an untrusted declaration schema, never an authenticated review.
 * Human kind, names/credentials/roles/conflicts, approve, confirmed, request IDs and dates are declarations.
 * Parsing proves no identity, expertise, AI confirmation, signed approval, digest binding, author independence,
 * legal review or currency. Authentication, quorum, storage, wiring and support promotion are not implemented.
 */
import { z } from "zod";

const nonblank = z.string().regex(/\S/, "must contain a non-whitespace character");
const isoDate = z.iso.date();

export const reviewRecordSchema = z.strictObject({
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

/** Shape of an untrusted declaration; this type carries no authentication or approval guarantee. */
export type ReviewRecord = z.infer<typeof reviewRecordSchema>;
