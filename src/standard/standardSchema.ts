import { z } from "zod";
import { assuranceCertSchema } from "../assurance/assuranceSchema.js";
import { binderJsonSchema } from "../audit/binderSchema.js";
import { benchArtifactSchema } from "../bench/benchSchema.js";
import { benchRegistryIndexSchema } from "../bench/benchRegistrySchema.js";
import { domainProofArtifactSchema } from "../domainProof/domainProofArtifact.js";
import { passportJsonSchema } from "../passport/passportSchema.js";
import { promptPackSchema } from "../prompt/promptPackSchema.js";

export const STANDARD_SCHEMA_NAMES = [
  "external-evidence.schema.json",
  "amcbench.schema.json",
  "amcprompt.schema.json",
  "amccert.schema.json",
  "amcaudit.schema.json",
  "amcpass.schema.json",
  "amcproof.schema.json",
  "registry.bench.schema.json",
  "registry.passport.schema.json"
] as const;

export const standardSchemaNameSchema = z.enum(STANDARD_SCHEMA_NAMES);

/** No passport registry format exists yet: AMC checks only these keys and ignores the rest. */
export const passportRegistryIndexSchema = z.object({
  v: z.literal(1),
  registry: z.object({}),
  passports: z.array(z.unknown())
});

/**
 * The zod schema `amc standard validate` parses each artifact with, and the title its published JSON Schema carries.
 * The published schema is generated from it (src/contracts/index.ts), so it states exactly what AMC enforces: these
 * schemas ignore unknown keys, and so do the published ones.
 */
export const STANDARD_ARTIFACT_SCHEMAS = {
  "amcbench.schema.json": { title: "AMC Bench Artifact", schema: benchArtifactSchema },
  "amcprompt.schema.json": { title: "AMC Prompt Pack", schema: promptPackSchema },
  "amccert.schema.json": { title: "AMC Assurance Certificate", schema: assuranceCertSchema },
  "amcaudit.schema.json": { title: "AMC Audit Binder", schema: binderJsonSchema },
  "amcpass.schema.json": { title: "AMC Passport", schema: passportJsonSchema },
  "amcproof.schema.json": { title: "AMC Domain Proof Artifact", schema: domainProofArtifactSchema },
  "registry.bench.schema.json": { title: "AMC Bench Registry Index", schema: benchRegistryIndexSchema },
  "registry.passport.schema.json": { title: "AMC Passport Registry Index", schema: passportRegistryIndexSchema }
} as const satisfies Record<Exclude<(typeof STANDARD_SCHEMA_NAMES)[number], "external-evidence.schema.json">, { title: string; schema: z.ZodType }>;

export const standardMetaSchema = z.object({
  v: z.literal(1),
  generatedTs: z.number().int(),
  schemas: z.array(
    z.object({
      name: standardSchemaNameSchema,
      sha256: z.string().length(64)
    })
  ).min(1)
});

export type StandardMeta = z.infer<typeof standardMetaSchema>;

export const standardBundleSignatureSchema = z.object({
  digestSha256: z.string().length(64),
  signature: z.string().min(1),
  signedTs: z.number().int(),
  signer: z.literal("auditor"),
  envelope: z
    .object({
      v: z.literal(1),
      alg: z.literal("ed25519"),
      pubkeyB64: z.string().min(1),
      fingerprint: z.string().length(64),
      sigB64: z.string().min(1),
      signedTs: z.number().int(),
      signer: z.object({
        type: z.enum(["VAULT", "NOTARY"]),
        attestationLevel: z.enum(["SOFTWARE", "HARDWARE"]),
        notaryFingerprint: z.string().length(64).optional()
      })
    })
    .optional()
});

export type StandardBundleSignature = z.infer<typeof standardBundleSignatureSchema>;
