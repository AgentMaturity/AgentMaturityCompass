<!-- SPDX-License-Identifier: MIT -->
# 5. Control results

Status: normative. Record: `https://agentmaturity.co/spec/schemas/v1/control-result.schema.json`.

## The five status dimensions

Every control result MUST carry five status dimensions, each reported on its own:

| Dimension | Values |
| --- | --- |
| Applicability | `applicable`, `not_applicable` (with a rationale) or `unresolved` (with a reason) |
| Evidence | `sufficient`, `incomplete`, `stale`, `contradictory` or `untrusted` |
| Result | `pass`, `fail` or `not_evaluated` |
| Enforcement | `none`, `advisory`, `observed` or `enforced` at a named boundary |
| Review | `pending`, `approved`, `rejected` or `expired` |

These are the `StatusDimensions` of `src/claims/eligibility/types.ts`; the schema refuses any other value.

## Rules

1. Missing or unknown evidence MUST give result `not_evaluated`. It MUST NOT give `pass`, a partial result or a
   default score.
2. A `pass` MUST have applicability `applicable` and evidence `sufficient`. The schema refuses any other `pass`.
3. Unknown applicability, authority, legal hold or residency route MUST give `not_evaluated` or deny, never `pass`.
4. Evidence that is `stale`, `contradictory` or `untrusted` MUST turn a `pass` into `not_evaluated`. When several
   apply, the dimension shows the most serious, in the order untrusted, contradictory, stale, incomplete.
5. Every entry in `evidenceRefs` MUST resolve to a record the verifier holds; otherwise completeness fails.
6. Exceptions and paid entitlement are recorded beside the result and MUST NOT change it. An expired exception
   (`expiresAt` at or before the as-of time) covers nothing.
7. Enforcement `enforced` MUST name the boundary that held. It is the producer's statement, and a verifier checks it
   against the deployment's declared boundaries.
