import { z } from "zod";

export const proofClassSchema = z.enum([
  "evidence_integrity",
  "runtime_policy",
  "domain_correctness",
]);

export const correctnessProofStatusSchema = z.enum([
  "proven",
  "disproven",
  "unsupported",
  "not_applicable",
]);

export const domainProofClaimBoundarySchema = z.enum([
  "PROVEN",
  "DISPROVEN",
  "NOT_PROVEN",
  "NOT_APPLICABLE",
]);

export const domainProofSummarySchema = z.object({
  proofClass: proofClassSchema,
  correctnessProofStatus: correctnessProofStatusSchema,
  proofRefs: z.array(z.string().min(1)).default([]),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  explanation: z.string().min(1).optional(),
  claimBoundary: domainProofClaimBoundarySchema,
});

export type ProofClass = z.infer<typeof proofClassSchema>;
export type CorrectnessProofStatus = z.infer<typeof correctnessProofStatusSchema>;
export type DomainProofClaimBoundary = z.infer<typeof domainProofClaimBoundarySchema>;
export type DomainProofSummary = z.infer<typeof domainProofSummarySchema>;

const CLAIM_BOUNDARY_BY_STATUS: Record<CorrectnessProofStatus, DomainProofClaimBoundary> = {
  proven: "PROVEN",
  disproven: "DISPROVEN",
  unsupported: "NOT_PROVEN",
  not_applicable: "NOT_APPLICABLE",
};

export function buildDomainProofSummary(input: {
  proofClass: ProofClass;
  correctnessProofStatus: CorrectnessProofStatus;
  proofRefs?: string[];
  evidenceRefs?: string[];
  explanation?: string;
}): DomainProofSummary {
  return domainProofSummarySchema.parse({
    proofClass: input.proofClass,
    correctnessProofStatus: input.correctnessProofStatus,
    proofRefs: input.proofRefs ?? [],
    evidenceRefs: input.evidenceRefs ?? [],
    explanation: input.explanation,
    claimBoundary: CLAIM_BOUNDARY_BY_STATUS[input.correctnessProofStatus],
  });
}

const DOMAIN_CORRECTNESS_ASSERTION_RE =
  /\b(verif(?:y|ied|ies)|prov(?:e|ed|en|es)|validat(?:e|ed|es)|certif(?:y|ied|ies)|confirm(?:ed|s)?)\b[\s\S]{0,120}\b(correct|follows?|complies?|valid|eligible|meets?|satisfies?)\b/i;

const DOMAIN_CONTEXT_RE =
  /\b(domain|declared rule(?:s| set)?|rule(?:s| set)|source-to-rule|formal(?:ized)? rule|statutory|regulatory|legal|tax|clinical|medical|benefits?|eligibility|governance|policy|jurisdiction)\b/i;

const EVIDENCE_ONLY_CONTEXT_RE = /\b(evidence integrity|signed receipt|receipts?|merkle|ledger|tamper(?:-| )evident|runtime policy|policy invariant)\b/i;

export function requiresDomainCorrectnessProof(text: string): boolean {
  if (!DOMAIN_CORRECTNESS_ASSERTION_RE.test(text)) {
    return false;
  }
  if (!DOMAIN_CONTEXT_RE.test(text)) {
    return false;
  }
  if (EVIDENCE_ONLY_CONTEXT_RE.test(text) && !/\b(answer|domain|business|legal|tax|clinical|eligibility|benefits?)\b/i.test(text)) {
    return false;
  }
  return true;
}

export function hasSufficientDomainProofRef(input: {
  correctnessProofStatus?: CorrectnessProofStatus;
  domainProofRefs?: string[];
}): boolean {
  return input.correctnessProofStatus === "proven" && (input.domainProofRefs?.length ?? 0) > 0;
}
