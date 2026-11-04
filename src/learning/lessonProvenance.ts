import { z } from "zod";
import type { CorrectionEvent } from "../corrections/correctionTypes.js";
import { computeCorrectionHash } from "../corrections/correctionTracker.js";
import { verifyHexDigestAny } from "../crypto/keys.js";
import { getPurposeKeyHistory } from "../keys/signingKeys.js";

const lessonId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);

/** Owner-supplied transfer scope, bound into the signed content of the existing lesson. */
export const lessonTransferMetadataSchema = z.strictObject({
  cue: z.string().trim().min(1).max(500),
  scope: z.enum(["workspace", "transferable"]),
  domain: lessonId,
  libraryVersion: lessonId,
  experimentalMode: lessonId,
  sourceTaskIndex: z.number().int().nonnegative().safe(),
  partition: z.enum(["train", "public", "heldout"]),
  sourceFixtureIds: z.array(lessonId).max(32).optional(),
  candidateSha256: digest.optional(),
  resourceSha256: digest.optional(),
});
export type LessonTransferMetadata = z.infer<typeof lessonTransferMetadataSchema>;

export const lessonProvenanceSchema = lessonTransferMetadataSchema.extend({
  workspaceScope: z.string().regex(/^[a-f0-9]{16}$/),
  outcome: z.literal("VERIFIED_EFFECTIVE"),
  verifiedTs: z.number().int().nonnegative().safe(),
  baselineRunId: lessonId,
  verificationRunId: lessonId,
  recheckRequired: z.literal(true),
  priorLessonId: lessonId.optional(),
  priorLessonHash: digest.optional(),
});
export type LessonProvenance = z.infer<typeof lessonProvenanceSchema>;

/** A request freezes the run's start and the strict earlier-task prefix. */
export const lessonTransferRequestSchema = z.strictObject({
  runId: lessonId,
  runStartTs: z.number().int().nonnegative().safe(),
  taskIndex: z.number().int().nonnegative().safe(),
  domain: lessonId,
  libraryVersion: lessonId,
  experimentalMode: lessonId,
  sourceAgentIds: z.array(lessonId).min(1).max(16).optional(),
  maxLessons: z.number().int().min(1).max(10).default(10),
});
export type LessonTransferRequest = z.input<typeof lessonTransferRequestSchema>;

/** A workspace-editable source status is never enough to mint or admit a verified lesson claim. */
export function lessonSourceVerifies(correction: CorrectionEvent, workspace: string): boolean {
  try {
    return computeCorrectionHash(correction) === correction.correction_hash
      && verifyHexDigestAny(correction.correction_hash, correction.signature, getPurposeKeyHistory(workspace, "ledger-row"));
  } catch { return false; }
}
