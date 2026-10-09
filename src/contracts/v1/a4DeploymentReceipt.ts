import { z } from "zod";
import { nonEmpty, sha256HexSchema } from "./common.js";

/**
 * `amc.a4-deployment-receipt/v1`: the operator's statement (`recordedStatus`, self_reported) and AMC's own check
 * (`amcCheckStatus`) kept in two fields, never merged. "verified" is reserved for the independently_reviewed lane.
 */
export const a4DeploymentReceiptV1Schema = z.strictObject({
  schema: z.literal("amc.a4-deployment-receipt/v1"),
  deploymentId: nonEmpty,
  releaseId: nonEmpty,
  projectId: nonEmpty,
  kind: z.enum(["deploy", "verify", "monitor"]),
  environment: z.enum(["staging", "production"]),
  target: z.enum(["compose", "helm"]),
  receipt: z.strictObject({
    imageDigest: z.string().nullable(),
    overlayDigest: sha256HexSchema.nullable(),
    restartedAt: z.iso.datetime().nullable(),
    helmRevision: z.number().int().min(1).nullable(),
    destinationRef: z.string().nullable(),
    note: z.string().nullable()
  }),
  receiptSha256: sha256HexSchema,
  recordedStatus: z.enum(["succeeded", "failed", "partial"]),
  amcCheckStatus: z.enum(["not_evaluated", "reachable", "passed", "failed"]),
  amcCheck: z.record(z.string(), z.unknown()).nullable(),
  recordedByKey: nonEmpty,
  claimKind: z.literal("self_reported"),
  ts: z.number().int()
});
export type A4DeploymentReceiptV1 = z.infer<typeof a4DeploymentReceiptV1Schema>;
