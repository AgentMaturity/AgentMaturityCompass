import { z } from "zod";

/**
 * Claimed time and attested time, kept apart (P1-25). A claimed time is whatever the writer said and is never
 * overwritten. An attested time comes from an RFC 3161 token that verified against an operator-pinned TSA anchor; it
 * proves only that a hash existed by genTime, not that the content is true or was written when it claims.
 */
const sha256Hex = z.string().regex(/^[0-9a-f]{64}$/);

export const attestedTimeSchema = z.strictObject({
  kind: z.literal("rfc3161"),
  /** anchorId names the configured TSA anchor the signer chained to. */
  tsa: z.strictObject({ subject: z.string(), certSha256: sha256Hex, anchorId: z.string() }),
  /** TSTInfo.genTime as RFC 3339. */
  genTime: z.iso.datetime(),
  accuracyMs: z.number().nonnegative().nullable(),
  policyOid: z.string(),
  serialNumber: z.string().regex(/^[0-9a-f]+$/),
  messageImprint: z.strictObject({ hashAlgorithm: z.literal("sha256"), digest: sha256Hex }),
  /** The TimeStampToken (CMS ContentInfo), DER, base64. */
  tokenDerB64: z.string(),
  /** True only when CRLs were supplied and checked; AMC checks none today. */
  revocationChecked: z.literal(false)
});
export type AttestedTime = z.infer<typeof attestedTimeSchema>;

export const timeEvidenceSchema = z.strictObject({
  claimedAt: z.string(),
  attested: attestedTimeSchema.nullable(),
  basis: z.enum(["claimed", "attested-upper-bound", "attested-window"]),
  window: z.strictObject({ notBefore: z.iso.datetime().nullable(), notAfter: z.iso.datetime() }).optional()
});
export type TimeEvidence = z.infer<typeof timeEvidenceSchema>;

export type TimeFinding = "BACKDATED_CLAIM" | "POSTDATED_CLAIM";

export const DEFAULT_TOLERANCE_MINUTES = 5;

/**
 * `upper`: a token over something that contains the artifact, so the artifact existed by its genTime.
 * `lower`: a token the artifact chains through, so the artifact was written after its genTime.
 * Each bound is widened by its token's accuracy (absent accuracy counts as zero) plus the tolerance before a claim is
 * called backdated or postdated: TSA and host clocks drift, so the comparison is never exact.
 */
export function evaluateTime(input: {
  claimedAt: string | number | Date;
  upper: AttestedTime | null;
  lower?: AttestedTime | null;
  toleranceMinutes?: number;
}): { time: TimeEvidence; findings: TimeFinding[] } {
  const claimed = new Date(input.claimedAt);
  const claimedAt = Number.isNaN(claimed.getTime()) ? String(input.claimedAt) : claimed.toISOString();
  const lower = input.lower ?? null;
  const slack = (bound: AttestedTime) => (bound.accuracyMs ?? 0) + (input.toleranceMinutes ?? DEFAULT_TOLERANCE_MINUTES) * 60_000;
  const findings: TimeFinding[] = [];
  if (lower && !(claimed.getTime() >= Date.parse(lower.genTime) - slack(lower))) findings.push("BACKDATED_CLAIM");
  if (input.upper && !(claimed.getTime() <= Date.parse(input.upper.genTime) + slack(input.upper))) findings.push("POSTDATED_CLAIM");
  if (!input.upper) return { time: { claimedAt, attested: null, basis: "claimed" }, findings };
  return {
    time: {
      claimedAt, attested: input.upper, basis: lower ? "attested-window" : "attested-upper-bound",
      window: { notBefore: lower?.genTime ?? null, notAfter: input.upper.genTime }
    },
    findings
  };
}
