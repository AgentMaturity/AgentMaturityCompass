import { z } from "zod";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import type { AMCSurfaceName } from "../types.js";
import {
  buildDomainProofArtifact,
  domainProofCanonicalSha256,
  type DomainProofArtifact,
  type DomainProofCounterexample,
  type DomainProofDomainId,
  type DomainProofRuleRef,
} from "./domainProofArtifact.js";
import { sourceRuleManifestSchema, type SourceRuleManifest, verifySourceRuleManifest } from "./sourceRuleManifestSchema.js";
import {
  buildToyGovernanceSourceRuleManifest,
  TOY_GOVERNANCE_SOURCE_RULES,
} from "./toyGovernanceRules.js";

export const DOMAIN_PROOF_CHECK_SURFACES: AMCSurfaceName[] = ["Enforce", "Comply", "Score", "Vault", "Watch"];

export const domainProofCheckInputSchema = z.object({
  claimText: z.string().min(1),
  facts: z.object({
    age: z.number().int().optional(),
    residency: z.string().optional(),
  }).strict().default({}),
  evidenceRefs: z.array(z.string().min(1)).default([]),
}).strict();

export type DomainProofCheckInput = z.infer<typeof domainProofCheckInputSchema>;
export type DomainProofCheckResultStatus = "proven" | "disproven" | "unsupported";

export interface DomainProofCheckResult {
  result: DomainProofCheckResultStatus;
  domain: DomainProofDomainId;
  manifestId: string;
  proofId: string;
  sourceManifestHash: string;
  formalSpecHash: string;
  ruleRefs: DomainProofRuleRef[];
  assumptions: string[];
  constraintsChecked: string[];
  counterexample?: DomainProofCounterexample;
  artifact: DomainProofArtifact;
  artifactHash: string;
  nonClaim: string;
  surfaces: AMCSurfaceName[];
}

export const DOMAIN_PROOF_NON_CLAIM =
  "Toy governance proof checks are local AMC fixtures for proof plumbing only; they are not legal advice, policy advice, benefits advice, or real-world eligibility determinations.";

function sourceManifestCanonicalSha256(manifest: SourceRuleManifest): string {
  return sha256Hex(Buffer.from(canonicalize(manifest), "utf8"));
}

function formalSpecHash(constraints: string[]): string {
  return sha256Hex(Buffer.from(canonicalize({ engine: "amc-toy-governance-v1", constraints }), "utf8"));
}

function ruleRefsFromManifest(manifest: SourceRuleManifest): DomainProofRuleRef[] {
  return manifest.clauses.map((clause) => ({
    sourceId: manifest.manifestId,
    clauseId: clause.clauseId,
    effectiveDate: manifest.effectiveDate,
    url: manifest.sourceUrl,
    hash: clause.clauseHash,
  }));
}

function requireClause(manifest: SourceRuleManifest, clauseId: string) {
  const clause = manifest.clauses.find((candidate) => candidate.clauseId === clauseId);
  if (!clause) {
    throw new Error(`source manifest missing required clause ${clauseId}`);
  }
  return clause;
}

function evaluateToyGovernance(input: DomainProofCheckInput, manifest: SourceRuleManifest): {
  result: DomainProofCheckResultStatus;
  assumptions: string[];
  constraintsChecked: string[];
  counterexample?: DomainProofCounterexample;
} {
  requireClause(manifest, "TG-1");
  requireClause(manifest, "TG-2");
  requireClause(manifest, "TG-3");

  const constraintsChecked = [
    "TG-1 toy.age.minimum: age >= 18",
    "TG-2 toy.residency.local: residency == local",
    "TG-3 toy.review.required_for_missing_facts: missing facts => unsupported + human review",
  ];

  const missing: string[] = [];
  if (input.facts.age === undefined) missing.push("age");
  if (input.facts.residency === undefined || input.facts.residency.trim().length === 0) missing.push("residency");
  if (missing.length > 0) {
    return {
      result: "unsupported",
      assumptions: ["Applicant facts are incomplete for the toy rule set."],
      constraintsChecked,
      counterexample: {
        brokenClauseId: "TG-3",
        inputFact: `missing facts: ${missing.join(", ")}`,
        missingAssumption: `${missing.join(", ")} must be supplied before eligibility can be checked`,
        remediationHint: "Collect the missing toy fixture facts or route to human review.",
      },
    };
  }

  const age = input.facts.age;
  const residency = input.facts.residency;
  if (age === undefined || residency === undefined) {
    throw new Error("toy governance missing-fact branch failed to return unsupported status");
  }

  if (age < 18) {
    return {
      result: "disproven",
      assumptions: ["Applicant facts are complete for the toy rule set."],
      constraintsChecked,
      counterexample: {
        brokenClauseId: "TG-1",
        inputFact: `age=${age}`,
        remediationHint: "Toy eligibility requires age to be at least 18.",
      },
    };
  }

  if (residency.toLowerCase() !== "local") {
    return {
      result: "disproven",
      assumptions: ["Applicant facts are complete for the toy rule set."],
      constraintsChecked,
      counterexample: {
        brokenClauseId: "TG-2",
        inputFact: `residency=${residency}`,
        remediationHint: "Toy eligibility requires declared residency to be local.",
      },
    };
  }

  return {
    result: "proven",
    assumptions: ["Applicant facts are complete for the toy rule set."],
    constraintsChecked,
  };
}

export function checkDomainProof(params: {
  domain: DomainProofDomainId;
  manifest: unknown;
  input: unknown;
  generatedTs?: number;
}): DomainProofCheckResult {
  const manifest = sourceRuleManifestSchema.parse(params.manifest);
  const manifestVerification = verifySourceRuleManifest(manifest, {
    sourceText: TOY_GOVERNANCE_SOURCE_RULES,
  });
  if (!manifestVerification.ok) {
    throw new Error(`source manifest failed verification: ${manifestVerification.errors.join("; ")}`);
  }
  if (params.domain !== manifest.domainId) {
    throw new Error(`domain mismatch: requested ${params.domain}, manifest is ${manifest.domainId}`);
  }
  if (params.domain !== "governance" || manifest.manifestId !== "srcmanifest_toy_governance_001") {
    throw new Error("P0 Domain Proof Lane only supports the local toy governance manifest");
  }
  const canonicalManifest = buildToyGovernanceSourceRuleManifest({
    retrievedAt: manifest.retrievedAt,
  });
  if (canonicalize(manifest) !== canonicalize(canonicalManifest)) {
    throw new Error("source manifest does not match the canonical toy governance fixture");
  }

  const input = domainProofCheckInputSchema.parse(params.input);
  const evaluated = evaluateToyGovernance(input, manifest);
  const ruleRefs = ruleRefsFromManifest(manifest);
  const sourceManifestHash = sourceManifestCanonicalSha256(manifest);
  const formalHash = formalSpecHash(evaluated.constraintsChecked);
  const artifact = buildDomainProofArtifact({
    proofId: `amcproof_toy_governance_${evaluated.result}`,
    generatedTs: params.generatedTs,
    proofClass: "domain_correctness",
    domainId: params.domain,
    claimText: input.claimText,
    sourceManifestHash,
    formalSpecHash: formalHash,
    ruleRefs,
    assumptions: evaluated.assumptions,
    constraintsChecked: evaluated.constraintsChecked,
    result: evaluated.result,
    counterexample: evaluated.counterexample,
    humanReview: {
      status: evaluated.result === "unsupported" ? "pending" : "not_required",
      reviewerRole: evaluated.result === "unsupported" ? "toy-fixture-human-review" : "toy-fixture-deterministic-check",
      notes: DOMAIN_PROOF_NON_CLAIM,
    },
    evidenceRefs: input.evidenceRefs,
    signedEvidenceRefs: input.evidenceRefs,
  });

  return {
    result: evaluated.result,
    domain: params.domain,
    manifestId: manifest.manifestId,
    proofId: artifact.proofId,
    sourceManifestHash,
    formalSpecHash: formalHash,
    ruleRefs,
    assumptions: evaluated.assumptions,
    constraintsChecked: evaluated.constraintsChecked,
    counterexample: evaluated.counterexample,
    artifact,
    artifactHash: domainProofCanonicalSha256(artifact),
    nonClaim: DOMAIN_PROOF_NON_CLAIM,
    surfaces: [...DOMAIN_PROOF_CHECK_SURFACES],
  };
}
