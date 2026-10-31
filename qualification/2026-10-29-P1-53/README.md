# P1-53 receipt: retire overlapping scoring and mapping systems into the catalog

The spec requires no qualification receipt; this folder records provenance and the mutation checks.

- `copy-domain-rubrics.mjs` is the one-off script that copied the 61 rubric questions from the pre-change build into
  `catalog/questionnaires/domain-rubrics.yaml`. The rubric content digest is the same before and after
  (`a91b85c6…`), and `tests/catalog/consolidation/singleSource.test.ts` pins it.
- `receipt.json` lists the commands, exit codes, test totals, artifact hashes and the seven mutation checks.
- Pending human review: the AI-proposed `catalogControls` pairings and the policy-pack binding map
  (docs/catalog/CONSOLIDATION.md). Nothing here is reviewed or promoted; the output is evidence of conformity, never
  proof of compliance.

## Receipt repaired 2026-10-31

`receipt.json` did not follow `qualification/receipt.schema.json` (86 problems in `npm run check:qualification`). Its commands used `command` instead of `cmd` and had no `durationMs`, `commit` described the commit instead of naming it, `artifacts` was an object, the environment was nested, and several fields were not in the schema (`title`, `base`, `environment`, `mutations`, `regression`, `rubricContentSha256`, `pendingHumanReview`). The receipt now names the commit the old text pointed to, `1cd3f2fc9` (written in full), copies every command and exit code, takes `node`, `pnpm` and `os` from the recorded environment, and lists `copy-domain-rubrics.mjs` as its artifact with the recorded hash. The two catalog files it hashed lie outside this folder, so their recorded hashes move to `notes`, together with the per-command counts, the seven mutation checks, the regression note, the rubric digests and the pending review items. `tests` is null because the three vitest selections overlap. `date` is the folder's 2026-10-29, the day of that commit. `arch` was never recorded; it is `arm64`, a same-host inference from that day's other receipts, because the schema allows only `arm64` or `x64`. The command durations were never recorded; they are written as `durationMs: 0`. The original receipt is in git at `58a328ea8:qualification/2026-10-29-P1-53/receipt.json`.
