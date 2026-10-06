---
"agent-maturity-compass": minor
---

Adds a shared claim-eligibility service (claim kinds and five status dimensions). Output is unchanged until surfaces adopt it. The library now exports `evaluateClaimEligibility`, its adapters and `renderClaimLabel`; synthetic values, self-reported answers, keyword matches, unkeyed checksums, path checks and empty evidence streams are never eligible for a pass on a regulated control. See `docs/CLAIM_KINDS.md`.
