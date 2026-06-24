import { z } from "zod";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { correctnessProofStatusSchema, proofClassSchema, type CorrectnessProofStatus, type ProofClass } from "./domainProofSchema.js";

export const domainProofDomainIdSchema = z.enum([
  "health",
  "education",
  "environment",
  "mobility",
  "governance",
  "technology",
  "wealth",
]);

export const domainProofRuleRefSchema = z.object({
  sourceId: z.string().min(1),
  clauseId: z.string().min(1),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  url: z.string().min(1),
  hash: z.string().length(64),
});

export const domainProofCounterexampleSchema = z.object({
  brokenClauseId: z.string().min(1),
  inputFact: z.string().min(1),
  missingAssumption: z.string().min(1).optional(),
  remediationHint: z.string().min(1),
});

export const domainProofHumanReviewSchema = z.object({
  status: z.enum(["not_required", "pending", "reviewed", "rejected"]),
  reviewerRole: z.string().min(1).optional(),
  reviewedAt: z.string().min(1).optional(),
  notes: z.string().min(1).optional(),
});

export const domainProofBindingsSchema = z.object({
  canonicalSha256: z.string().length(64),
  signedEvidenceRefs: z.array(z.string().min(1)).default([]),
  signatureRef: z.string().min(1).optional(),
  transparencyEntryHash: z.string().length(64).optional(),
});

export const domainProofArtifactSchema = z.object({
  v: z.literal(1),
  proofId: z.string().regex(/^amcproof_[A-Za-z0-9_-]{3,}$/),
  generatedTs: z.number().int(),
  proofClass: proofClassSchema,
  domainId: domainProofDomainIdSchema.optional(),
  claimText: z.string().min(1),
  sourceManifestHash: z.string().length(64),
  formalSpecHash: z.string().length(64),
  ruleRefs: z.array(domainProofRuleRefSchema).min(1),
  assumptions: z.array(z.string().min(1)).default([]),
  constraintsChecked: z.array(z.string().min(1)).min(1),
  result: correctnessProofStatusSchema,
  counterexample: domainProofCounterexampleSchema.optional(),
  humanReview: domainProofHumanReviewSchema,
  evidenceRefs: z.array(z.string().min(1)).default([]),
  proofBindings: domainProofBindingsSchema,
});

export type DomainProofDomainId = z.infer<typeof domainProofDomainIdSchema>;
export type DomainProofRuleRef = z.infer<typeof domainProofRuleRefSchema>;
export type DomainProofCounterexample = z.infer<typeof domainProofCounterexampleSchema>;
export type DomainProofHumanReview = z.infer<typeof domainProofHumanReviewSchema>;
export type DomainProofArtifact = z.infer<typeof domainProofArtifactSchema>;

export interface BuildDomainProofArtifactInput {
  proofId: string;
  generatedTs?: number;
  proofClass: ProofClass;
  domainId?: DomainProofDomainId;
  claimText: string;
  sourceManifestHash: string;
  formalSpecHash: string;
  ruleRefs: DomainProofRuleRef[];
  assumptions?: string[];
  constraintsChecked: string[];
  result: CorrectnessProofStatus;
  counterexample?: DomainProofCounterexample;
  humanReview: DomainProofHumanReview;
  evidenceRefs?: string[];
  signedEvidenceRefs?: string[];
  signatureRef?: string;
  transparencyEntryHash?: string;
}

type DomainProofArtifactWithoutBindings = Omit<DomainProofArtifact, "proofBindings">;

function artifactWithoutBindings(artifact: DomainProofArtifact): DomainProofArtifactWithoutBindings {
  const { proofBindings: _proofBindings, ...rest } = artifact;
  return rest;
}

function canonicalArtifactHash(base: DomainProofArtifactWithoutBindings): string {
  return sha256Hex(Buffer.from(canonicalize(base), "utf8"));
}

export function buildDomainProofArtifact(input: BuildDomainProofArtifactInput): DomainProofArtifact {
  const base = {
    v: 1,
    proofId: input.proofId,
    generatedTs: input.generatedTs ?? Date.now(),
    proofClass: input.proofClass,
    domainId: input.domainId,
    claimText: input.claimText,
    sourceManifestHash: input.sourceManifestHash,
    formalSpecHash: input.formalSpecHash,
    ruleRefs: input.ruleRefs,
    assumptions: input.assumptions ?? [],
    constraintsChecked: input.constraintsChecked,
    result: input.result,
    counterexample: input.counterexample,
    humanReview: input.humanReview,
    evidenceRefs: input.evidenceRefs ?? [],
  } satisfies DomainProofArtifactWithoutBindings;

  return domainProofArtifactSchema.parse({
    ...base,
    proofBindings: {
      canonicalSha256: canonicalArtifactHash(base),
      signedEvidenceRefs: input.signedEvidenceRefs ?? [],
      signatureRef: input.signatureRef,
      transparencyEntryHash: input.transparencyEntryHash,
    },
  });
}

export function domainProofCanonicalSha256(artifact: DomainProofArtifact): string {
  return canonicalArtifactHash(artifactWithoutBindings(domainProofArtifactSchema.parse(artifact)));
}

export function verifyDomainProofArtifact(artifact: unknown): { ok: boolean; errors: string[] } {
  const parsed = domainProofArtifactSchema.safeParse(artifact);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    };
  }

  const actual = domainProofCanonicalSha256(parsed.data);
  const expected = parsed.data.proofBindings.canonicalSha256;
  if (actual !== expected) {
    return {
      ok: false,
      errors: [`canonicalSha256 mismatch: expected ${expected}, recomputed ${actual}`],
    };
  }

  return { ok: true, errors: [] };
}
