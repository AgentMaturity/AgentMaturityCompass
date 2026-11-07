/**
 * SourceObservation v1 (SH-INTEG-01): one record per revision of one message on an external source (today: a GitHub
 * issue, pull request or issue comment). It is an observation, never an instruction: nothing in it grants authority.
 * Admission (sourceAdmission.ts) decides against the signed source policy, and a human decides the proposal it makes.
 *
 * `observationId` is deterministic (source, native event, revision), so the same delivery recorded twice is one row and
 * an edit is a second row with the same thread key. The retained body is redacted before it is stored, capped at
 * MAX_RETAINED_BODY_BYTES (past that the row is `oversized`: digest only, no body, and admission refuses it).
 */
import { z } from "zod";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";

export const SOURCE_OBSERVATION_VERSION = 1;
export const SOURCE_OBSERVATION_ADAPTER_VERSION = "github-event/1";
export const MAX_RETAINED_BODY_BYTES = 65_536;
/** A body carrying this marker was written by AMC's own reply path and is never an explicit request. */
export const SOURCE_REPLY_MARKER = "<!-- amc-reply";

const hex64 = z.string().regex(/^[0-9a-f]{64}$/);
/** A GitHub login: 1-39 alphanumerics or hyphens, as GitHub constrains it; bot logins end in `[bot]`. */
export const githubLoginSchema = z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?(?:\[bot\])?$/);

export const sourceRepositorySchema = z.strictObject({
  id: z.number().int().positive(),
  owner: z.string().min(1).max(100),
  name: z.string().min(1).max(100)
});

export const sourceObservationSchema = z.strictObject({
  version: z.literal(SOURCE_OBSERVATION_VERSION),
  observationId: hex64,
  sourceId: z.string().min(1).max(128),
  sourceKind: z.literal("github"),
  repository: sourceRepositorySchema,
  /** `issue_comment:<comment id>` or `issue:<issue id>`: GitHub's own ids, never the sequential number alone. */
  nativeEventId: z.string().regex(/^(issue_comment|issue):[0-9]+$/),
  /** SHA-256 of the normalized content (body, plus the title for an issue); a label or reaction change makes none. */
  revisionDigest: hex64,
  actor: z.strictObject({ id: z.number().int().positive(), login: githubLoginSchema, class: z.enum(["human", "bot", "unknown"]) }),
  /** Lower-cased handles mentioned outside code, quotes and HTML comments, without the `@`. */
  mentions: z.array(z.string().min(1).max(40)).max(64),
  primaryThreadKey: z.string().regex(/^github:[0-9]+:issue:[0-9]+$/),
  correlatedThreadKeys: z.array(z.string().min(1)).max(8),
  sourceAt: z.number().int().nonnegative(),
  receivedAt: z.number().int().nonnegative(),
  /** SHA-256 and byte length of the original (unredacted) body. */
  contentSha256: hex64,
  contentBytes: z.number().int().nonnegative(),
  disposition: z.enum(["recorded", "oversized"]),
  /** The redacted body, or null when oversized. */
  body: z.string().nullable(),
  adapterVersion: z.string().min(1)
}).superRefine((value, ctx) => {
  if (value.disposition === "oversized" && value.body !== null) ctx.addIssue({ code: "custom", path: ["body"], message: "an oversized observation retains no body" });
  if (value.disposition === "recorded" && value.body === null) ctx.addIssue({ code: "custom", path: ["body"], message: "a recorded observation retains its body" });
  if (value.observationId !== sourceObservationId(value)) ctx.addIssue({ code: "custom", path: ["observationId"], message: "observationId is not the digest of (sourceId, nativeEventId, revisionDigest)" });
});

export type SourceObservation = z.infer<typeof sourceObservationSchema>;
export type SourceRepository = z.infer<typeof sourceRepositorySchema>;

export function sourceObservationId(value: Pick<SourceObservation, "sourceId" | "nativeEventId" | "revisionDigest">): string {
  return sha256Hex(canonicalize({ sourceId: value.sourceId, nativeEventId: value.nativeEventId, revisionDigest: value.revisionDigest }));
}

export function issueThreadKey(repositoryId: number, issueNumber: number): string {
  return `github:${repositoryId}:issue:${issueNumber}`;
}
