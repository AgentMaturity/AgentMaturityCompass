# P1-44 receipt: O17–O20 landed (pack MCP tools, scenario corpus, Python wrappers, regulated examples)

Environment: local macOS arm64 (Darwin 25.6.0), Node 22.23.3, pnpm 10.33.0, Python 3.10.19 / 3.11.14 / 3.12.14 /
3.14.7. Not CI. Branch `rtd/p1-44-pack-mcp-scenarios`, built on `int` at `67d0eef0a` (P1-51 landed), with `int` merged up to
`d03e63daf`. Every run below is at `b237fda5f`, the commit `receipt.json` names (the final head; nothing after it but
this receipt). `receipt.json` lists every command with its exit
code and duration; the test totals are the focused vitest run in `focused-tests.json`. Nothing was published (D-12
holds PyPI) and no network was used: the Python lanes installed pytest and setuptools from wheels re-zipped out of the
local uv cache.

The candidate's program records are cited as `37c1466b:<path>` below, where `<program>` is
`AMC_OS/RESEARCH/2026-10-03-regulated-platform-program`.

This receipt was refreshed after the coordinator's second round: the P0-21 default (an unanswered pack question
counted as level 1) is fixed at its root in the shared scorer, and the MCP tool-count tests assert the core count plus
the A4 preview tools.

## Commit map

Picked with `git cherry-pick -x` in slice-map order (`docs/program/landing/slice-map.json`, issue P1-44). The four
receipt commits touch only `<program>` paths (`skip-receipt`); their files are copied unchanged into `candidate/`
(byte-identical to the receipt commits and to `37c1466b`). The merges `c56c84c7d`, `3713fbf9d`, `38616fa33` and
`78ee6f456` are `record-only`.

| Original | New | Track | Subject |
|---|---|---|---|
| `c4901407` | `db1ebc4e9` | O17 | feat: expose industry packs as read-only MCP tools |
| `04dae3c7` | `dc2498098` | O18 | test: add sourced industry assurance scenario corpus |
| `5ebc5b69` | `b94af8eb4` | O19 | feat: add typed Python wrappers for industry pack and domain commands |
| `43fdbcf1` | `9a64fec33` | O20 | feat: add keyless regulated-industry CLI examples for health, wealth, governance |
| `580b1876`, `84a422ad`, `9b1de17a`, `3b243feb` | none | O17–O20 | receipts, copied to `candidate/` |

Only `c4901407` stopped on a conflict: the import block of `src/mcp/amcMcpServer.ts`, resolved by keeping `int`'s
imports and adding the one import the pick adds. `equivalence.txt`: every picked path equals its original except
`src/mcp/amcMcpServer.ts`, whose O17 hunk is identical to the original's (the rest of the file is `int`'s). No
`AMC_OS/` path and no deletion against `int`. The picks are red against `int` until the P1-44 commits that follow
them: O17's tests used an HMAC licence that P1-51 no longer accepts, and O20's verify step met P0-09's pinned-key rule.

Commits written for this issue: `f34ec2d43`, `1eb7f1ea1`, `051c22ccc`, `73a98a5d7`, `58a8e7d79`, `a6ed5071c`,
`d507ef450` (counts), `aa78b051c`; second round `fec554a69` (root fix), `34d78a0f7` (Python), `77add47a9` (docs,
changeset, release notes), `cd3ad85a6` (counts), `b237fda5f` (count tests).

## Per track

- **O17 (MCP tools).** Every result goes through `withClaim`: `amc_score_industry_pack` uses the regulated
  self-assessment envelope (`self_reported`), the listing, pack and station summary are unbound catalog data (not
  evaluated). No result has a `certified` key. `amc_score_industry_pack` returns the shared `scoreIndustryPack`
  result unchanged (see "Unanswered questions" below; the first round's MCP-only workaround is gone). D-06 = B: listing and station summary are
  the same with and without a licence; pack content and scoring refuse with the entitlement's own paywall text, which
  now names the two locked tools. Lookup reuses `getPackById`.
- **Listing.** `MCP_TOOL_METADATA` and `amc mcp list-tools`: 15 tools (was 11), 20 with `AMC_A4_PREVIEW=1` (was 16);
  `mcp-list-tools.txt` holds the built CLI's output in both modes. The spec's "14" predates P1-17's
  `amc_incident_clocks`. `tests/mcpServer.test.ts` and `tests/mcpTools.test.ts` assert `15 + a4ToolMetadata().length`
  and pass in both modes; under `AMC_A4_PREVIEW=1` their "(read-only)" description checks still fail on
  `amc_a4_comment`, which another session's held commit changes.
- **Unanswered questions (P0-21 root fix).** `selfAssessPack` (`src/domains/packSelfAssessment.ts`) gives an unanswered
  question no level: `notEvaluatedQuestionIds` lists it, `percentage`, `level` and `eligibleLevel` are `null` until
  every question is answered, and `scoreIndustryPack` gives it no question result and no gap. `amc domain pack run`
  (claim from the same `packSelfAssessmentEnvelope`), `amc_score_sector_pack`, `amc_score_industry_pack` and the pack
  audit (`NOT_EVALUATED` controls, schema `amc.industry-pack-audit/4`) all report that one result. No API route scores
  packs. RED first: `red-not-evaluated.log` (7 of 7 failing before the fix). Breaking changeset
  `pack-unanswered-not-evaluated`, a 2.0.0 migration note, and `npm run release:notes` regenerated both blocks.
- **O18 (corpus).** The test imports `INDUSTRY_PACK_MANIFEST` instead of restating 17 ids, files and stations; the five
  `cross-framework` packs map to P1-13's tags (`listIndustryAssurancePackStations`), at least two of the seven
  stations each. The doc labels the corpus experimental (agent-drafted, not expert-reviewed).
- **O19 (Python).** TypedDicts follow today's CLI JSON: score results require `claimKind`, `statusDimensions`,
  `claimLabel`, `selfAssessment` and `eligibleLevel`, and drop `certified`; the entitlement has
  `licenseVerificationConfigured` and a nullable `checkoutUrl`; `DomainApplyResult` follows the current apply output.
  The candidate wrapper failed its own real-CLI test against `int` (`red-python.log`).
- **O20 (examples).** `agent-loop verify` and `audit binder verify` pin the monitor fingerprint and auditor key the
  runner records right after `init`, outside the workspace (trust on first use, stated in the README); without the pin
  `agent-verify` exits 1 since P0-09. Citations now resolve by file and quoted text, not line number; the test also runs
  the P0-28 truth and command checks on the README. Every input is labelled synthetic.

## Fresh clone

`git clone --no-local` of this branch at `cd3ad85a6` into a new scratch directory, `pnpm install --frozen-lockfile
--offline`, `pnpm run build`, fast-forwarded to `b237fda5f` (two test files only), then each track's focused tests there:

| Track | Command | Tests | Result |
|---|---|---|---|
| O17 | `npx vitest run tests/industryPackNotEvaluated.test.ts tests/industryPackMcpClaims.test.ts tests/industryPackMcpTools.test.ts tests/industryPackMcpToolsWiring.test.ts tests/mcpServer.test.ts tests/mcpTools.test.ts` | 58 | 58 passed (`fresh-clone/O17-vitest.json`) |
| O18 | `npx vitest run tests/industryAssuranceFixtures.test.ts` | 28 | 28 passed (`fresh-clone/O18-vitest.json`) |
| O19 | the installed-wheel lane below, on 3.10, 3.11, 3.12 and 3.14 | 44 each, plus 1 licensed | all passed (`python-lanes.txt`) |
| O20 | `npx vitest run tests/regulatedExamples.test.ts tests/exampleCommandsResolve.test.ts` | 9 | 9 passed (`fresh-clone/O20-vitest.json`) |

The same files and the existing tests covering the changed modules (31 files, including the pack audit, domain apply,
paywall surfaces and trust-verify tests), run in the worktree at `b237fda5f`: 404 passed of 404 (`focused-tests.json`).

## Python lanes (installed wheel, offline)

`python-lanes.txt`: for each interpreter a new venv, `pip wheel --no-index` of a copy of `sdk/python`, the wheel and
pytest installed with `--no-index`, then `python -I -m pytest sdk/python/tests/test_industry.py` from the fresh clone;
the test imports `amc_sdk` from the venv's site-packages (printed). Locked: 44 passed on 3.10.19, 3.11.14, 3.12.14 and
3.14.7, including the real built CLI's refusals. Licensed (a test licence signed by a key pinned in a temp `AMC_HOME`
trust list, generated in the process): the real-CLI test checks the unlocked describe, score and dry-run apply shapes,
1 passed on each interpreter.

## Mutations

`mutations.json`: M1–M9, each killed and restored (the L1 default restored in the shared scorer, `Object.hasOwn`,
licence-dependent summary, restated station, missing P1-13 tags, Python claim fields, unpinned monitor, unresolvable
citation, banned truth claim).

## Full suite

Not run. A first-round full-suite run in the fresh clone was stopped after about 50 minutes: other sessions were running
full suites and type checks on the same 18 GB machine (load average above 30), and the brief's check list does not
include it. Every check in `receipt.json` passed at `b237fda5f`. Existing tests changed, each with its reason: the MCP
server mock in `tests/noCertificationFromSelfAssessment.test.ts` now also records `registerTool` (the industry pack
tools use it), and its audit schema id is `/4`; `tests/logisticsIndustryPack.test.ts` expected an unanswered baseline
at L1 with a gap per question and now expects no level, no gap and every question not evaluated (an all-1 answer set
still gives a gap per question); `tests/industryPackAudit.test.ts` asserts the percentage of two complete audits as
non-null; `tests/mcpServer.test.ts` and `tests/mcpTools.test.ts` count `15 + a4ToolMetadata().length`.

## Not done here, and follow-ups

- `npm run release:notes -- --check` still fails, as on `int`, on four other breaking changesets missing from the
  2.0.0 Migration section (`claude-code-hooks`, `issuer-admission-at-verification-time`, `key-lifecycle-p1-08`,
  `layer0-enforcement-gaps`); `pack-unanswered-not-evaluated` is cited there.
- CI for the Python lanes: no workflow job runs `sdk/python/tests/test_industry.py` on 3.10 and 3.12 (coordinate with
  P0-33).
- With `AMC_A4_PREVIEW=1`, the "(read-only)" description checks in `tests/mcpServer.test.ts` and `tests/mcpTools.test.ts`
  fail on `amc_a4_comment` (`src/mcp/a4Tools.ts:49`), which writes; another session's held commit changes those checks.
