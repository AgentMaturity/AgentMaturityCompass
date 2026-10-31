<!-- SPDX-License-Identifier: MIT -->
# 3. Claim kinds and vocabulary

Status: normative.

## Claim kinds

Every result MUST carry exactly one claim kind. The kinds, generated from `CLAIM_KINDS`
(`src/claims/eligibility/types.ts`):

<!-- amc:spec:claim-kinds -->
- `synthetic_example`
- `self_reported`
- `observed`
- `independently_reviewed`
<!-- /amc:spec:claim-kinds -->

| Kind | Meaning |
| --- | --- |
| `synthetic_example` | Example values from a labelled example mode. Never evidence, never a level, never attested. |
| `self_reported` | Stated by the agent or its operator, or not backed by observed evidence. |
| `observed` | Seen at runtime or in an executed test, backed by `OBSERVED` or `OBSERVED_HARDENED` evidence. |
| `independently_reviewed` | Approved by a reviewer independent of the producer whose key is pinned. |

The rules that decide the kind are those of `evaluateClaimEligibility`, documented in
[docs/CLAIM_KINDS.md](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/CLAIM_KINDS.md). In
particular:

1. A `synthetic_example` result MUST have result `not_evaluated` and no level.
2. A `self_reported` result MUST NOT give a positive regulated status, except the one D-03 case the claim service
   names (records AMC's own signed flow captured, verified in the same read), which still never satisfies a total or a
   score. Numeric self-answers reach at most L1.
3. Keyword matches, unkeyed checksums, path-presence checks, empty streams and coincidental event types MUST NOT give
   a positive regulated status.
4. `independently_reviewed` MUST require an approved review by an independent reviewer whose key a pinned trust list
   admits.
5. Payment MUST NOT change a claim kind, a result, a trust tier or a verification outcome.

## Words a result may use

Implementations SHOULD describe results with these phrases: "evidence of conformity", "observed", "self-reported",
"independently reviewed", "not evaluated" and "enforced at" followed by the named boundary.

## Words a result must not use

Outside a registry-issued attestation, output MUST NOT describe an agent, a deployment or a result as "certified",
"compliant", "certification ready", "guaranteed", "exactly once" or "10× better". A registry-issued attestation does
not exist before Gate G3; until then the word "certified" has no conforming use. A negation ("is not compliant") or a
quotation of the banned word is allowed.

AMC enforces this list on its own published text with these patterns (`prohibitedTruthClaims` in
`scripts/docs-drift-check.mjs`):

<!-- amc:spec:banned-wording -->
- `/\bcertified\b/i`
- `/\bcertification[\s-]+read(?:y|iness)\b/i`
- `/\bcompliant\b/i`
- `/\bguaranteed\b/i`
- `/\b10\s?[×x]\s+better\b/i`
- `/\bexactly-once\b|\bexactly once\s+(?:delivery|semantics|execution|processing|guarantees?)\b/i`
<!-- /amc:spec:banned-wording -->
