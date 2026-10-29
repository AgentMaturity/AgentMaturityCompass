# P1-53 receipt: retire overlapping scoring and mapping systems into the catalog

The spec requires no qualification receipt; this folder records provenance and the mutation checks.

- `copy-domain-rubrics.mjs` is the one-off script that copied the 61 rubric questions from the pre-change build into
  `catalog/questionnaires/domain-rubrics.yaml`. The rubric content digest is the same before and after
  (`a91b85c6…`), and `tests/catalog/consolidation/singleSource.test.ts` pins it.
- `receipt.json` lists the commands, exit codes, test totals, artifact hashes and the seven mutation checks.
- Pending human review: the AI-proposed `catalogControls` pairings and the policy-pack binding map
  (docs/catalog/CONSOLIDATION.md). Nothing here is reviewed or promoted; the output is evidence of conformity, never
  proof of compliance.
