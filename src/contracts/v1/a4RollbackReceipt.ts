import { z } from "zod";
import { nonEmpty, sha256HexSchema } from "./common.js";

/**
 * `amc.a4-rollback-receipt/v1`: AMC's side of a rollback, written once AMC's own steps ran: the release rolled back to,
 * the Enforce restore receipt and freeze (`amcSteps`) and the lease ids revoked; "rolled back" is derived. The two status
 * columns stay apart (C-35): `recordedStatus` is the operator's statement of what they then ran, which their rollback row
 * (a deployment receipt of kind `rollback`) records, so it is null here, never AMC's own step outcome.
 */
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
  recordedStatus: z.enum(["succeeded", "failed", "partial"]).nullable(),
  amcSteps: z.strictObject({ restoreReceiptPath: z.string().nullable(), freezeIncidentId: z.string().nullable() }),
  amcCheckStatus: z.enum(["not_evaluated", "reachable", "passed", "failed"]),
  recordedByKey: nonEmpty,
  claimKind: z.literal("self_reported"),
  ts: z.number().int()
});
export type A4RollbackReceiptV1 = z.infer<typeof a4RollbackReceiptV1Schema>;
