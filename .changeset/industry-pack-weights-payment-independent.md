---
"agent-maturity-compass": major
---

`amc run --industry-pack-weights` and the score API field `applyIndustryPackWeights` are deprecated and have no effect. They applied fixed per-surface weights, not pack data, and only when an Industry Packs licence was present, so payment could change a score. `domainPackWeighting.entitlementActive` is removed.

Migration: a lifecycle run (`--question-set lifecycle`) that used the flag with a valid licence, including an allowlisted legacy key or a stored workspace entitlement, now gets the same unweighted layer scores as every other run with the same evidence. The flag and the API field are still accepted, so no client gets an error; `amc run` prints a deprecation warning on stderr, and the result reports `domainPackWeighting` as `requested: true, applied: false, modifiedQuestionCount: 0`. JSON consumers that read `domainPackWeighting.entitlementActive` must stop reading it. Both inputs will be removed in a later release.
