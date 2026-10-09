import { z } from "zod";
import { nonEmpty, sha256HexSchema } from "./common.js";

/** `amc.a4-rollback-receipt/v1`: what the operator rolled back to and which lease ids were revoked; "rolled back" is derived. */
export const a4RollbackReceiptV1Schema = z.strictObject({
  schema: z.literal("amc.a4-rollback-receipt/v1"),
  rollbackId: nonEmpty,
  releaseId: nonEmpty,
  toReleaseId: z.string().nullable(),
  projectId: nonEmpty,
  environment: z.enum(["staging", "production"]),
  target: z.enum(["compose", "helm"]),
  enforceManifestId: z.string().nullable(),
  preparedCommands: z.array(nonEmpty),
  leaseIdsRevoked: z.array(nonEmpty),
  receiptSha256: sha256HexSchema,
  recordedStatus: z.enum(["succeeded", "failed", "partial"]),
  amcCheckStatus: z.enum(["not_evaluated", "reachable", "passed", "failed"]),
  recordedByKey: nonEmpty,
  claimKind: z.literal("self_reported"),
  ts: z.number().int()
});
export type A4RollbackReceiptV1 = z.infer<typeof a4RollbackReceiptV1Schema>;
