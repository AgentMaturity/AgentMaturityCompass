<!-- SPDX-License-Identifier: MIT -->
# 9. Verification

Status: normative. Record: `https://agentmaturity.co/spec/schemas/v1/verifier-report.schema.json`.

## Separate results

A verifier MUST report these results separately and MUST NOT merge them into one verdict:

| Result | Question it answers |
| --- | --- |
| Integrity | Do the bytes parse, hash and verify as the record says? |
| Issuer admission | Is the signing key pinned for this purpose in a trust list the verifier pinned itself? |
| Scope | Is the record about the deployment, subject and window being checked? |
| Freshness | Is it still valid at the verifier's as-of time? |
| Completeness | Is every record the claim depends on present? |
| Satisfaction | Does the stated result follow from its evidence under chapters 5 to 8? |

Each result is `pass`, `fail` or `not_evaluated`, with reason codes. A result whose input an earlier failure made
untrustworthy MUST be reported as `not_evaluated`.

## Acceptance rules

The acceptance rules are [`spec/ACCEPTANCE_RULES.md`](../ACCEPTANCE_RULES.md). They are normative by reference.

1. A verifier MUST run the nine checks in the order listed there: strict parse, canonical form, hash recomputation,
   signature, issuer admission, scope, freshness, completeness, satisfaction.
2. A verifier MUST apply the per-record rules there for every record type it accepts, and MUST refuse a record type
   it does not implement rather than pass it.
3. A signature proves who wrote a record and that it is unchanged. A verifier MUST NOT read it as proof that the
   record's statement is true.
4. A verifier MUST take the as-of time as an input and MUST NOT read the clock to decide freshness implicitly.

## Exit status

A command-line verifier SHOULD exit 0 when every result passes, 1 when any fails, and 3 when none fails and at least
one is not evaluated, as the normative fixtures in [`spec/fixtures/v1/`](../fixtures/v1/README.md) expect.
