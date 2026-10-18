# P1-44 receipt: O17–O20 landed (pack MCP tools, scenario corpus, Python wrappers, regulated examples)

Environment: local macOS arm64 (Darwin 25.6.0), Node 22.23.3, pnpm 10.33.0, Python 3.10.19 / 3.11.14 / 3.12.14 /
3.14.7. Not CI. Branch `rtd/p1-44-pack-mcp-scenarios`, built on `int` at `67d0eef0a` (P1-51 landed) and merged with
`int` at `3b0e47607` as `536984caa`, the commit `receipt.json` names. `receipt.json` lists every command with its exit
code and duration; the test totals are the focused vitest run in `focused-tests.json`. Nothing was published (D-12
holds PyPI) and no network was used: the Python lanes installed pytest and setuptools from wheels re-zipped out of the
local uv cache.

The candidate's program records are cited as `37c1466b:<path>` below, where `<program>` is
`AMC_OS/RESEARCH/2026-10-03-regulated-platform-program`.

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
`d507ef450` (counts), `aa78b051c`.

## Per track

- **O17 (MCP tools).** Every result goes through `withClaim`: `amc_score_industry_pack` uses the regulated
  self-assessment envelope (`self_reported`), the listing, pack and station summary are unbound catalog data (not
  evaluated). No result has a `certified` key. An unanswered question is listed in `notEvaluatedQuestionIds` and
  `result` is `null` until every question is answered, so no default level reaches a client; `scoreIndustryPack`
  itself still counts an unanswered answer as 1 (P0-21, not changed here). D-06 = B: listing and station summary are
  the same with and without a licence; pack content and scoring refuse with the entitlement's own paywall text, which
  now names the two locked tools. Lookup reuses `getPackById`.
- **Listing.** `MCP_TOOL_METADATA` and `amc mcp list-tools`: 15 tools (was 11), 20 with `AMC_A4_PREVIEW=1` (was 16);
  `mcp-list-tools.txt` holds the built CLI's output in both modes. The spec's "14" predates P1-17's
  `amc_incident_clocks`.
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

`git clone --no-local` of this branch at `536984caa` into a scratch directory, `pnpm install --frozen-lockfile
--offline`, `pnpm run build`, then each track's focused tests there:

| Track | Command | Tests | Result |
|---|---|---|---|
| O17 | `npx vitest run tests/industryPackMcpClaims.test.ts tests/industryPackMcpTools.test.ts tests/industryPackMcpToolsWiring.test.ts tests/mcpServer.test.ts tests/mcpTools.test.ts` | 51 | 51 passed (`fresh-clone/O17-vitest.json`) |
| O18 | `npx vitest run tests/industryAssuranceFixtures.test.ts` | 28 | 28 passed (`fresh-clone/O18-vitest.json`) |
| O19 | the installed-wheel lane below, on 3.10, 3.11, 3.12 and 3.14 | 42 each, plus 1 licensed | all passed (`python-lanes.txt`) |
| O20 | `npx vitest run tests/regulatedExamples.test.ts tests/exampleCommandsResolve.test.ts` | 9 | 9 passed (`fresh-clone/O20-vitest.json`) |

The same files and the existing tests covering the changed modules, run in the worktree at `536984caa`:
227 passed of 227 (`focused-tests.json`).

## Python lanes (installed wheel, offline)

`python-lanes.txt`: for each interpreter a new venv, `pip wheel --no-index` of a copy of `sdk/python`, the wheel and
pytest installed with `--no-index`, then `python -I -m pytest sdk/python/tests/test_industry.py` from the fresh clone;
the test imports `amc_sdk` from the venv's site-packages (printed). Locked: 42 passed on 3.10.19, 3.11.14, 3.12.14 and
3.14.7, including the real built CLI's refusals. Licensed (a test licence signed by a key pinned in a temp `AMC_HOME`
trust list, generated in the process): the real-CLI test checks the unlocked describe, score and dry-run apply shapes,
1 passed on each interpreter.

## Mutations

`mutations.json`: M1–M9, each killed and restored (raw score result, `Object.hasOwn`, licence-dependent summary,
restated station, missing P1-13 tags, Python claim fields, unpinned monitor, unresolvable citation, banned truth claim).

## Full suite

Not run. A full-suite run in the fresh clone was stopped after about 50 minutes: other sessions were running full
suites and type checks on the same 18 GB machine (load average above 30), and the brief's check list does not include
it. Every check in `receipt.json` passed at `536984caa`. One existing test needed a change: the MCP server mock in
`tests/noCertificationFromSelfAssessment.test.ts` implemented only the deprecated `tool()`, and the industry pack tools
register through `registerTool`; the mock now records both (`aa78b051c`). The other existing tests covering the changed
modules passed unchanged, apart from the intended count changes in `tests/mcpServer.test.ts` and `tests/mcpTools.test.ts`.

## Not done here, and follow-ups

- P0-21: `scoreIndustryPack` (`src/domains/industryPacks.ts`) and `selfAssessPack` (`src/domains/packSelfAssessment.ts`)
  still count an unanswered question as level 1, so `amc_score_sector_pack` and `amc domain pack run --baseline` show a
  percentage and level for answers nobody gave (labelled incomplete, not evaluated). P1-44 does not change that
  function (spec touch scope); the O17 tools withhold the score instead. Raised against P0-21.
- `docs/releases/2.0.0.md` generated blocks were already stale on `int` (`npm run release:notes -- --check` fails on
  four breaking changesets missing from the Migration section); they still say the core MCP listing keeps eleven tools.
  P0-34's release preparation regenerates them.
- CI for the Python lanes: no workflow job runs `sdk/python/tests/test_industry.py` on 3.10 and 3.12 (coordinate with
  P0-33).
- `amc_score_sector_pack` and the CLI keep their own paths; only the O17 tools carry `notEvaluatedQuestionIds`.
- With `AMC_A4_PREVIEW=1`, `tests/mcpServer.test.ts` and `tests/mcpTools.test.ts` fail "all tool descriptions include
  (read-only)" because `amc_a4_comment` writes (`src/mcp/a4Tools.ts:49`); the count assertions pass (20). Read from
  source as pre-existing on `int`, not run there.
