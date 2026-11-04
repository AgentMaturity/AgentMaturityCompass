<!-- SPDX-License-Identifier: MIT -->
# Annex B. Reading AMC 1.x results

Status: informative.

AMC 1.x stored results without a claim kind, scored them on scales this spec drops (chapter 1), and in places computed
them from values it generated itself. This annex says how those results read under the Core Spec. The authoritative
rules and the notice text are in
[docs/migration/LEGACY_RESULTS.md](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/migration/LEGACY_RESULTS.md)
(P1-35), under notice `AMC-LEGACY-2026-001` version 1.

| A stored 1.x result | Claim kind under this spec | Result | Level |
| --- | --- | --- | --- |
| Computed from values AMC generated itself (canned replies, seeded evidence) | `synthetic_example` | Not evaluated | None |
| Anything else AMC 1.x stored | `self_reported` | Not evaluated | Capped at L1; the original level stays in the file |

Notes:

- Readers apply the legacy label when they read a stored result, before any relabel run, and also for 1.x files
  outside a workspace. The label names the notice and its version, for example "Legacy (1.x), self-reported (notice
  AMC-LEGACY-2026-001 v1)".
- A result that already carries a claim kind and status dimensions decided its own claim and is never relabelled.
- The 0–1 internal score, its decay and its bands from `docs/AMC_STANDARD_RFC.md` have no meaning under this spec. A
  1.x level is read only as stated above, never converted into a new level.
- Nothing in a 1.x result becomes `observed` or `independently_reviewed` by being read again. New evidence produces
  new results.
