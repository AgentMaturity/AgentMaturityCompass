---
"agent-maturity-compass": minor
---

Industry Packs explain their self-reported answers question by question. Answers stay self-reported: nothing here certifies anything, and an unanswered question is still not evaluated.

- Pack questions take optional detail through a trailing argument of `q()`: `l2`/`l4` level descriptors, `evidence`, `remediation`, `failureMode` and `keyRisk` (an index into the pack's key risks). Questions without it work as before; `validatePackQuestionDetail` checks it.
- `amc domain pack run` offers all five levels (L2/L4 show the question's descriptor or "between L1 and L3"/"between L3 and L5"), takes `--responses <file.json>` (unknown question ids are refused), and prints each question's level beside the pack percentage with a note on the scale: answering L3 everywhere scores 50%, in the L2 band.
- The score result (CLI, MCP `amc_score_industry_pack`, Studio and the console) adds `questionResults[].level`, `scaleNote`, `keyRisks`, `riskCoverage`, `weakestRisk` and `topGaps` (answered questions below L4, ranked by gap to L4 times weight, with each question's own failure mode, next step and evidence).
- `amc domain pack describe` shows the pack's key risks and labels its maturity path "Maturity path:" (it said "Certification path:"); `amc domain apply --responses` help no longer claims an L1 baseline default, and with answers domain apply proposes each pack's lowest-answered questions instead of its first three.
- The industry-pack audit moves to `amc.industry-pack-audit/6`: remediation targets the next level above the answer (L4 for an unanswered control), a question's own evidence/remediation/failure mode wins over the dimension templates, Compliance and Ethics dimensions get their own crosswalk anchors and evidence, the remediation `--compliance` flag comes from the pack's frameworks, controls list related deep questions (joined by catalogued instrument) with their evidence types and criteria, and the Markdown adds a Key risks section. Receipts at /1, /4 and /5 still verify.
