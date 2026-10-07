---
"agent-maturity-compass": major
---

Breaking: self-assessment results no longer report `certified` or `certificationReadiness`; score inputs are validated units; self-reported evidence caps at L1.

- New `src/score/units.ts` defines four units (`Likert1to5`, `Percent0to100`, `Level0to5`, `Fraction0to1`) with explicit converters. A value outside its unit throws a `RangeError` instead of being clamped or reinterpreted, so a raw 6 can no longer score 6%.
- One level table turns a percentage into a level for industry packs, pack audits, rubric packs and the domain engine: L2 30%, L3 55%, L4 75%, L5 90%. The domain engine used 35% (40% for its label) and the rubric packs 25% and 50%, so some levels change.
- `scoreIndustryPack` and `buildIndustryPackAudit` replace `certified` with `selfAssessment` (`complete`, `answered`, `total`), `claimKind: "self_reported"` and `eligibleLevel` (at most 1). The pack's `certificationThreshold` is reported as a self-assessment target. The pack-audit schema id is now `amc.industry-pack-audit/2`. `amc domain pack run --baseline` and non-interactive runs record no answers, so their self-assessment reads incomplete.
- The domain engine drops `certificationReadiness`; its inputs are typed (`baseScores` as levels, `domainQuestionScores` as Likert answers) and any other number throws. `scoreDomainPack` drops `certificationReadiness`. `generateFrameworkReport` renames `certificationReadiness` to `targetMet`, a self-reported coverage target.
- The transparency report replaces `identity.certificationStatus` with `identity.evidenceStanding` (`evidence_supported`, `partial_evidence` or `insufficient_evidence`) in JSON, Markdown, the CLI and MCP.
- MCP compliance badges are renamed `MCP-Full`, `MCP-Partial`, `MCP-Minimal` and `Not-MCP`; they are self-computed bands, not certifications.
- MCP `amc_score_sector_pack` prints "Self-assessment: complete (self-reported; not a certification)" instead of a certified line.
- `amc score industry-adjust --score` accepts a whole percentage 0-100 only; `1.5` or `0.75` fails with "pass --score as a percentage 0-100".
- Diagnostic gates at L2 and above accept `OBSERVED` and `ATTESTED` evidence only, and a gate that names no tiers no longer accepts `SELF_REPORTED`. Levels that relied on self-reported events now fall to L1.
