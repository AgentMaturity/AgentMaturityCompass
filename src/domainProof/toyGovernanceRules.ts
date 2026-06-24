import { buildSourceRuleManifest, type SourceRuleManifest } from "./sourceRuleManifestSchema.js";

export const TOY_GOVERNANCE_SOURCE_RULES = `# Toy Governance Eligibility Rules

This local fixture is for AMC Domain Proof Lane plumbing only. It is not law, policy advice, benefits advice, or a real entitlement rule set.

## TG-1 Minimum Age
An applicant is eligible only if their age is at least 18.

## TG-2 Local Residency
An applicant is eligible only if their declared residency is local.

## TG-3 Missing Facts Require Review
If age or residency facts are missing, the answer must be marked unsupported and routed to human review.
`;

export function buildToyGovernanceSourceRuleManifest(params: { retrievedAt: string }): SourceRuleManifest {
  return buildSourceRuleManifest({
    manifestId: "srcmanifest_toy_governance_001",
    domainId: "governance",
    jurisdiction: "LOCAL_TOY",
    sourceTitle: "Toy Governance Eligibility Rules",
    sourceUrl: "file://fixtures/domain-proof/toy-governance/source-rules.md",
    sourceText: TOY_GOVERNANCE_SOURCE_RULES,
    effectiveDate: "2026-06-21",
    retrievedAt: params.retrievedAt,
    clauses: [
      {
        clauseId: "TG-1",
        sourceSpan: "## TG-1 Minimum Age\nAn applicant is eligible only if their age is at least 18.",
        formalClauseId: "toy.age.minimum",
        owner: "AMC Domain Proof Lane fixture",
        reviewer: "AMC fixture reviewer",
        ambiguityFlags: [],
        staleAfter: "2027-06-21",
        dependencies: [],
        exceptions: [],
      },
      {
        clauseId: "TG-2",
        sourceSpan: "## TG-2 Local Residency\nAn applicant is eligible only if their declared residency is local.",
        formalClauseId: "toy.residency.local",
        owner: "AMC Domain Proof Lane fixture",
        reviewer: "AMC fixture reviewer",
        ambiguityFlags: [],
        staleAfter: "2027-06-21",
        dependencies: [],
        exceptions: [],
      },
      {
        clauseId: "TG-3",
        sourceSpan: "## TG-3 Missing Facts Require Review\nIf age or residency facts are missing, the answer must be marked unsupported and routed to human review.",
        formalClauseId: "toy.review.required_for_missing_facts",
        owner: "AMC Domain Proof Lane fixture",
        reviewer: "AMC fixture reviewer",
        ambiguityFlags: ["fixture-only", "not-real-policy"],
        staleAfter: "2027-06-21",
        dependencies: ["TG-1", "TG-2"],
        exceptions: [],
      },
    ],
    review: {
      status: "reviewed",
      reviewerRole: "AMC fixture maintainer",
      reviewedAt: params.retrievedAt,
      notes: "Reviewed only for deterministic source-to-rule plumbing coverage.",
      nonLegalDisclaimer: "Toy Governance Eligibility Rules are a local AMC fixture and must not be used as legal, policy, benefits, or eligibility advice.",
    },
  });
}
