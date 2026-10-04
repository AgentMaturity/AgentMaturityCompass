# I4 receipt: public count literals (candidate 726be0ca)

Base: 726be0ca11e31224b2c93ae13a439f8cb2393e64 (ff-only from amc/regulated-platform-20261003).
Measured: testFiles 1,528 (gen-counts --json); sector-pack questions 632 across 41 packs (dist listIndustryPacks()).

## Generator-driven (node scripts/gen-counts.mjs --write), committed
- README.md:17 badge `test%20source%20files-1%2C489` -> `test%20source%20files-1%2C528`
- README.md:893 `<!-- amc:count:testFiles -->1,489` -> `1,528`
- website/index.html:90 stat-value `1,489` -> `1,528` (test source files)
- website/lite.html:74 `<b>1,489</b>` -> `<b>1,528</b>` (Test source files)
- whitepaper/AMC_WHITEPAPER_v1.md:22 `1,489 Vitest test source files` -> `1,528 ...`
- whitepaper/AMC_WHITEPAPER_v1.md:415 `1,489 Vitest test source files` -> `1,528 ...`
- whitepaper/AMC_WHITEPAPER_v1.md:423 `1,489 Vitest test source files` -> `1,528 ...`
- whitepaper/AMC_WHITEPAPER_v1.md:873 `1,489 Vitest test source files` -> `1,528 ...`

## Hand edits (generator has no sector-question count), committed
- whitepaper/AMC_WHITEPAPER_v1.md:22 `244 default diagnostic questions plus 600 sector-specific questions` -> `... plus 632 ...`
- whitepaper/AMC_WHITEPAPER_v1.md:22 `844 questions (244 default + 600 sector-specific)` -> `876 questions (244 default + 632 sector-specific)`
- whitepaper/AMC_WHITEPAPER_v1.md:248 `containing 600 sector-specific diagnostic questions` -> `containing 632 ...`
- whitepaper/AMC_WHITEPAPER_v1.md:262 `844 questions (244 default + 600 sector-specific)` -> `876 questions (244 default + 632 sector-specific)`
- whitepaper/AMC_WHITEPAPER_v1.md:853 `containing 600 sector-specific diagnostic questions` -> `containing 632 ...`
- whitepaper/AMC_WHITEPAPER_v1.md:1157 `600 sector-specific diagnostic questions across 41 industry packs` -> `632 ...`
Lines 248/262/853/1157 restate the same sector-count literal the test checks on line 22; left alone they would contradict line 22.

## Not committed (outside I4 write scope; all in the root dirty list)
The generator also rewrote 1,489 -> 1,528 in CONTRIBUTING.md:52, website/i18n.js:17,
docs/content/reddit-launch-drafts.md:25,49, docs/content/show-hn-draft.md:33,
docs/internal/competitive-landscape.md:57, docs/internal/mirofish-simulation-council.md:6.
Exact diff: out-of-scope-generator-refresh.patch (git apply / patch -p1). Reverted in the candidate.
Until applied, in the candidate: gen-counts --check exits 1 (those six files) and
publicStatsDrift "current-facing public surfaces" fails on CONTRIBUTING.md.
Verified in a scratch copy of this worktree with the patch applied: gen-counts --check exit 0; both drift files 7/7 pass.

## Results in candidate (this commit)
- vitest tests/publicQuestionCountDrift.test.ts: pass (whitepaper sector-count test fixed)
- vitest tests/publicStatsDrift.test.ts: README badge test pass; surfaces test fails on CONTRIBUTING.md only (out of scope)
- pnpm typecheck:tests: exit 0
