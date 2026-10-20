import { z } from "zod";
import { signatureEnvelopeSchema } from "../crypto/signing/signatureEnvelope.js";
import { MERKLE_ALGORITHMS } from "./merkle.js";

export const merkleLeafRowSchema = z.object({
  v: z.literal(1), index: z.number().int().min(0), entryHash: z.string().length(64), leafHash: z.string().length(64)
});
export const merkleRootRowSchema = z.object({
  v: z.literal(1), ts: z.number().int(), leafCount: z.number().int().min(0), root: z.string().length(64),
  lastEntryHash: z.string().default(""), algorithm: z.enum(MERKLE_ALGORITHMS).optional()
});
export const merkleMigrationSchema = z.strictObject({
  v: z.literal(1), ts: z.number().int(), legacyRoot: z.string().length(64), rfc9162Root: z.string().length(64),
  leafCount: z.number().int().min(0), lastEntryHash: z.string()
});
export type MerkleMigrationRecord = z.infer<typeof merkleMigrationSchema>;
export const rootSignatureSchema = z.object({
  digestSha256: z.string().length(64), signature: z.string().min(1), signedTs: z.number().int(),
  signer: z.literal("auditor"), envelope: signatureEnvelopeSchema.optional()
});
