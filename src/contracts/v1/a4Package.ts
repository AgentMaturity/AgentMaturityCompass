import { z } from "zod";
import { nonEmpty, sha256HexSchema } from "./common.js";
import { a4IntegrationClaimV1Schema } from "./a4IntegrationClaim.js";

/** The user-approved quality specification. `evidenceMethod`, never "verifiedBy": human_review resolves to self_reported. */
export const a4QualitySpecSchema = z.strictObject({
  targets: z.array(z.strictObject({
    dimension: z.enum(["capability", "reliability", "security", "privacy", "latency", "cost", "maintainability", "impact"]),
    statement: nonEmpty,
    /** May be the literal "not instrumented". */
    measure: nonEmpty,
    target: nonEmpty,
    evidenceSource: z.string().nullable(),
    evidenceMethod: z.enum(["runtime_observation", "executed_test", "human_review", "not_yet_decided"]),
    source: nonEmpty
  })).min(1)
});
export type A4QualitySpec = z.infer<typeof a4QualitySpecSchema>;

export const a4ApprovalRefSchema = z.strictObject({
  gateId: nonEmpty, decisionId: nonEmpty, approverKey: nonEmpty, bindingDigest: sha256HexSchema, stage: nonEmpty, gate: nonEmpty
});

/**
 * `amc.a4-package/v1`: the signed provenance record of what one workspace holds at a release digest. No absolute
 * workspace path appears in the signed bytes.
 */
export const a4PackageV1Schema = z.strictObject({
  schema: z.literal("amc.a4-package/v1"),
  kind: z.literal("a4-agent-package"),
  package: z.strictObject({
    name: nonEmpty, version: nonEmpty, projectId: nonEmpty, revisionNo: z.number().int().min(1),
    revisionDigest: sha256HexSchema, amcVersion: nonEmpty, node: nonEmpty
  }),
  files: z.array(z.strictObject({ path: nonEmpty.refine((path) => !path.startsWith("/") && !path.split(/[\\/]/).includes("..")), sha256: sha256HexSchema, size: z.number().int().min(0), kind: nonEmpty })),
  artifacts: z.strictObject({
    enforceSnapshotSha256: sha256HexSchema, compiledPlanSha256: sha256HexSchema.nullable(), signedConfigsSha256: sha256HexSchema,
    presetSha256: sha256HexSchema.nullable(), contextPluginSha256: sha256HexSchema.nullable(), memoryPolicySha256: sha256HexSchema.nullable(),
    updatePolicySha256: sha256HexSchema, secretScanSha256: sha256HexSchema, sbomSha256: sha256HexSchema.nullable(), aibomSha256: z.null()
  }),
  approvals: z.array(a4ApprovalRefSchema),
  integration: a4IntegrationClaimV1Schema,
  quality: a4QualitySpecSchema,
  provenance: z.strictObject({ note: z.literal("AMC provenance record (not a formal SLSA claim)"), builtFrom: z.record(z.string(), z.string()) }),
  signing: z.strictObject({ algorithm: z.literal("ed25519"), kind: z.literal("A4_PACKAGE"), pubkeyFingerprint: nonEmpty }),
  generatedTs: z.number().int(),
  claimBoundary: nonEmpty
});
export type A4PackageV1 = z.infer<typeof a4PackageV1Schema>;
