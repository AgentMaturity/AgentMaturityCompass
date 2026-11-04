import { z } from "zod";
const catalogDigest = z.string().regex(/^(?:sha256:)?[a-f0-9]{64}$/);
/** Native plan/profile projection, authenticated with each synthetic capture. */
export const executedEvaluationSnapshotSchema = z.object({ v: z.literal(1), planDigest: catalogDigest,
  profileSha256: z.string().regex(/^[a-f0-9]{64}$/), policyDigest: catalogDigest,
  applicability: z.enum(["applicable", "not_applicable", "unresolved"]) }).strict();
export type ExecutedEvaluationSnapshot = z.infer<typeof executedEvaluationSnapshotSchema>;
