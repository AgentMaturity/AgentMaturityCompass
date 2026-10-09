import { z } from "zod";
import { claimEnvelopeSchema, claimKindSchema } from "../../claims/eligibility/schemas.js";
import { signatureEnvelopeSchema } from "../../crypto/signing/signatureEnvelope.js";
import { nonEmpty, sha256HexSchema } from "./common.js";
import { a4IntegrationClaimV1Schema } from "./a4IntegrationClaim.js";
import { a4ApprovalRefSchema, a4QualitySpecSchema } from "./a4Package.js";
import { a4PrincipalSchema } from "./a4Project.js";
import { a4ResourceDigestsSchema } from "./a4Revision.js";

/** A `signDigestWithPolicy` result: proves who signed the bytes and that they are unchanged, never that they are true. */
export const a4SignedDigestSchema = z.strictObject({
  digestSha256: sha256HexSchema,
  signature: nonEmpty,
  signedTs: z.number().int(),
  signer: z.literal("auditor"),
  envelope: signatureEnvelopeSchema.optional()
});

const degradedSchema = z.enum(["SOD_DEGRADED_SINGLE_USER", "SOD_DEGRADED_SELF_PROVISIONED"]);
const nullableSha = sha256HexSchema.nullable();

/** `amc.a4-release/v1`: one signed agent package built from one revision, with its lineage and linkage (design §14.1). */
export const a4ReleaseV1Schema = z.strictObject({
  schema: z.literal("amc.a4-release/v1"),
  releaseId: nonEmpty,
  projectId: nonEmpty,
  revisionNo: z.number().int().min(1),
  revisionDigest: sha256HexSchema,
  version: nonEmpty,
  packageDigest: sha256HexSchema,
  packagePath: nonEmpty,
  signaturePath: nonEmpty,
  transparencyEntryId: z.string().nullable(),
  previousReleaseId: z.string().nullable(),
  baseReleaseId: z.string().nullable(),
  resources: a4ResourceDigestsSchema,
  approvals: z.array(a4ApprovalRefSchema),
  integration: a4IntegrationClaimV1Schema,
  quality: a4QualitySpecSchema,
  updatePolicySha256: sha256HexSchema,
  deploymentTarget: z.strictObject({
    kind: z.enum(["compose", "helm"]), sameHost: z.literal(true), imageDigest: z.string().nullable(),
    chartOrComposeDigest: nullableSha, valuesDigest: nullableSha, hostHint: z.string().nullable()
  }),
  rollback: z.strictObject({ releaseId: z.string().nullable(), enforceManifestId: z.string().nullable(), leaseIds: z.array(nonEmpty), preparedCommands: z.array(nonEmpty) }),
  /** Lease ids and status only; a token is never part of a release record. */
  leases: z.array(z.strictObject({
    leaseId: nonEmpty, scope: z.enum(["staging", "production"]), scopes: z.array(nonEmpty), expiresAt: z.iso.datetime(), status: z.enum(["active", "revoked"])
  })),
  lifecycle: z.strictObject({
    from: nonEmpty, to: nonEmpty,
    controls: z.array(z.strictObject({
      controlId: nonEmpty, status: z.enum(["satisfied", "not_evaluated"]), evidenceRef: z.string().nullable(),
      claimKind: claimKindSchema.nullable(), satisfiedBy: z.literal("a4_bridge").nullable(), reason: z.string().nullable()
    }))
  }),
  approvalsLineage: z.strictObject({
    selfApprovedGates: z.array(nonEmpty),
    degraded: z.array(degradedSchema),
    acknowledgement: z.strictObject({ itemId: nonEmpty, by: nonEmpty, ts: z.number().int(), expiresTs: z.number().int(), reason: nonEmpty }).nullable()
  }),
  surfaces: z.strictObject({
    score: z.strictObject({ contextGraphSha256: nullableSha, latestSealedRunId: z.string().nullable() }),
    shield: z.strictObject({ assuranceRunIds: z.array(nonEmpty), firewallPolicyDigest: nullableSha }),
    enforce: z.strictObject({ manifestId: z.string().nullable(), applyReceiptSha256: nullableSha, restoreReceiptSha256: nullableSha }),
    vault: z.strictObject({ signingRoute: z.enum(["vault", "notary"]), vaultStatusAtRelease: z.enum(["unlocked", "locked"]) }),
    watch: z.strictObject({ deploymentReceiptRef: z.string().nullable(), runtimeRunIds: z.array(nonEmpty), sloReportSha256: nullableSha }),
    comply: z.strictObject({ planDigest: nullableSha, controlResultsSha256: nullableSha, conformanceStatementSha256: sha256HexSchema }),
    fleet: z.strictObject({ agentConfigSha256: nullableSha, typedGraphDigest: nullableSha, lifecycleTransitionId: z.string().nullable() }),
    passport: z.strictObject({
      artifactSha256: nullableSha, attestationSha256: nullableSha, claim: claimEnvelopeSchema,
      /** The signature verdict, never a claim about the agent. */
      rawStatus: z.enum(["not_evaluated", "VERIFIED", "INFORMATIONAL", "UNTRUSTED"]),
      claimBoundary: z.literal("signature verified; statements not evaluated")
    })
  }),
  enforcementBoundaries: z.array(z.strictObject({ boundary: nonEmpty, status: z.enum(["enforced", "observed", "none"]), note: z.string() })),
  claim: claimEnvelopeSchema,
  createdBy: a4PrincipalSchema,
  createdAt: z.iso.datetime(),
  envelope: a4SignedDigestSchema
});
export type A4ReleaseV1 = z.infer<typeof a4ReleaseV1Schema>;
