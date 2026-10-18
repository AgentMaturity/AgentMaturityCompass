# Synthetic compiler golden

This golden records the complete experimental finance planning output for the adjacent synthetic profile and catalog. It is not evidence of runtime execution, legal review, approval or compliance. Profile reviewer labels are synthetic; the catalog remains experimental with pending reviews and an unverified citation.

The literal semantic assertions in golden.test.ts were authored before a compiler output candidate was generated. The candidate was then reviewed independently against the fixture, current source and all proposed configuration defaults; its complete lock and 17 digests were independently recomputed. The six fixture compilerCompat fields were corrected from ^0.1.0 to ^1.2.0 for the actual compiler version 1.2.0 before accepting these bytes. No product compatibility enforcement was established.

This is a reviewed generated regression golden, not an independently implemented compiler oracle. The literal assertions provide separate expectations for applicability, provenance, conflicts, guard parameters, approvals, egress, deletion and evidence duties. The test has no automatic update path. Review any future golden change against the intended contract and all changed source inputs.

The AMC version appears as `<amcVersion>` in `compiler.version` and `lock.generatedBy.version`, and the top-level `digest` is computed over that placeholder body, so a release version bump alone does not change these bytes; golden.test.ts asserts the real values equal `amcVersion` separately. On the integration line the golden was regenerated once to add `profile.deployment` (P1-78's deployment identity in the compiled profile); that block and the plan digest were the only other changes, reviewed against the compiler source.
