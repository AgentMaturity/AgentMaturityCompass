import { z } from "zod";
import { CLAIM_KINDS, type ClaimEnvelope, type ClaimKind, type StatusDimensions } from "./types.js";

export const claimKindSchema = z.enum(CLAIM_KINDS);

const applicabilitySchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("applicable") }).strict(),
  z.object({ state: z.literal("not_applicable"), rationale: z.string() }).strict(),
  z.object({ state: z.literal("unresolved"), reason: z.string() }).strict()
]);

const enforcementSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("none") }).strict(),
  z.object({ state: z.literal("advisory") }).strict(),
  z.object({ state: z.literal("observed") }).strict(),
  z.object({ state: z.literal("enforced"), boundary: z.string() }).strict()
]);

export const statusDimensionsSchema = z.object({
  applicability: applicabilitySchema,
  evidence: z.enum(["sufficient", "incomplete", "stale", "contradictory", "untrusted"]),
  result: z.enum(["pass", "fail", "not_evaluated"]),
  enforcement: enforcementSchema,
  review: z.enum(["pending", "approved", "rejected", "expired"])
}).strict();

export const claimEnvelopeSchema = z.object({
  claimKind: claimKindSchema,
  statusDimensions: statusDimensionsSchema,
  provenance: z.object({
    producer: z.string(),
    method: z.enum(["synthetic", "numeric_self_answer", "keyword_match", "unkeyed_checksum",
      "path_presence", "runtime_observation", "executed_test", "human_review"]),
    evidenceRefs: z.array(z.string()),
    legacy: z.object({ version: z.string(), originalTier: z.string().optional() }).strict().optional()
  }).strict(),
  eligibleLevel: z.number().nullable(),
  reasons: z.array(z.enum(["SYNTHETIC_VALUES", "SELF_REPORTED_NO_POSITIVE_STATUS", "SELF_REPORTED_LEVEL_CAP",
    "WEAK_METHOD", "EMPTY_EVIDENCE", "UNBOUND_EVIDENCE", "STALE_EVIDENCE", "CONTRADICTORY_EVIDENCE",
    "CROSS_SCOPE_EVIDENCE", "SIGNATURE_INVALID", "ISSUER_NOT_PINNED", "REVIEW_NOT_INDEPENDENT",
    "LEGACY_1X_UNVERIFIED", "NOT_APPLICABLE", "APPLICABILITY_UNRESOLVED",
    "EVIDENCE_NOT_CLAIM_READY", "RESULT_NOT_BOUND"])),
  entitlement: z.object({ active: z.boolean() }).strict().optional()
}).strict();

// Compile-time drift guard: each schema must infer exactly its hand-written type.
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
true satisfies Equals<z.infer<typeof claimKindSchema>, ClaimKind>;
true satisfies Equals<z.infer<typeof statusDimensionsSchema>, StatusDimensions>;
true satisfies Equals<z.infer<typeof claimEnvelopeSchema>, ClaimEnvelope>;
