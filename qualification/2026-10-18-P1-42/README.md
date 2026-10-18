# P1-42 receipt: S4 round-2 content and S10 guides landed as labelled questionnaires

Environment: local macOS arm64 (darwin 25.6.0), Node 22, pnpm 10.33.0, in the worktree `wt/p1-42` of clone `s7fccbbfa/clone`. Not CI, not a fresh clone.

Status of everything this receipt covers: experimental, AI-drafted, not reviewed by a qualified expert, not legal advice. Nothing here is a certification.

## What landed

- Slice `content` of `docs/program/landing/slice-map.json` (candidate `37c1466b`, D-13): 69 picks in map order (55 `cherry-pick`, 14 `cherry-pick-strip-receipts`), 14 `skip-receipt` and 10 `record-only` rows not picked. Every pick keeps its `(cherry picked from …)` line; conflict resolutions are explained in a `P1-42 landing:` paragraph of the picked commit. No landed commit carries an `AMC_OS/` path (`git log int..HEAD --name-only -- AMC_OS` prints nothing).
- The per-station split (`00d143ac`) was redone on int, not replayed: station files take each pack literal from int's monolith, the facade carries int's P0-21/P0-23 changes, and the snapshots taken just before the move compare byte-equal after it.
- The six catalogue resolutions were replayed with the union attribute (passed per command with `-c core.attributesFile`, never written to `.git/info/`). After each station's last pick, `git diff <merge> HEAD` over `catalogue{Eu,Us,Intl}.ts` differs only by int's P0-24 records (checked against `67d73223..int`). Two fix commits drop a duplicate import the union merge re-added.
- Assurance-scenario commits named in step 6 had already landed with slice B (P0-13); nothing to pick here.
- Root `37c1466b`'s `tests/fixtures/packFrameworkStrings.unresolved.json` hunk was dropped (runbook section 3): the file does not exist on int until P1-45 lands S6, which regenerates it.

## Counts (from `listIndustryPacks()` and `getAllDeepIndustryQuestions()`)

Measured at the code commit in `receipt.json` with `listIndustryPacks()` and `getAllDeepIndustryQuestions()` (`counts.json`):

| Station | Packs | Pack questions | Deep questions |
|---|---:|---:|---:|
| `environment` | 6 | 99 | 17 |
| `health` | 9 | 151 | 58 |
| `wealth` | 5 | 83 | 56 |
| `education` | 5 | 87 | 16 |
| `mobility` | 6 | 94 | 16 |
| `technology` | 5 | 83 | 16 |
| `governance` | 5 | 79 | 56 |
| **Total** | **41** | **676** | **235** |

Before P1-42 (int `b9866b0f`): 632 pack questions and 150 deep questions. The candidate's 646 plus the 30 restored questions gives 676. `content-diff.json` counts the pack changes against int: 357 rewritten, 109 added, 65 merged (18 with the target recorded in the candidate's committed apply logs, 47 recorded only in its uncommitted round-2 inputs), 30 restored, 180 unchanged; deep questions 87 added, 148 changed, 2 removed; 57 catalogue instruments added.

## F5 drops (P0-26)

All 30 decisions are `defer` (awaiting Sid). The round-2 apply commits removed all 30; every one is restored byte for byte from int (main plus P0-24 corrections). Restored ids: EDU-HE-3, EDU-SE-11, EDU-SE-13, EDU-SE-15, ENV-SS-5, ENV-SS-14, GOV-DCR-14, GOV-DD-15, GOV-PL-14, GOV-PPC-15, HLT-WM-17, HLT-PL-17, MOB-SC-14, MOB-RE-15, MOB-VI-14, MOB-F3W-8, TECH-OS-4, TECH-OS-15, TECH-INF-15, TECH-PP-7, TECH-PP-13, TECH-PP-14, WLT-FW-6, WLT-FW-14, WLT-NP-6, WLT-NP-11, WLT-NP-14, WLT-CE-14, WLT-CE-15, WLT-BC-15. 27 of them miss a round-2 content rule (weight, one instrument, unresolved citation, or the repealed Directive 2003/98/EC in GOV-PL-14); `restored-questions-round2-rule-gaps.txt` lists them for Sid's P0-26 decision. The candidate's station tests now skip round-2 rules for these questions until Sid decides (`tests/helpers/f5Deferred.ts`).

## Flagged for expert review

- Packs whose classification cites an Article 5 prohibited practice (domain reports print "Cites an Article 5 prohibited practice; check the deployment"): `differently-abled`, `infotainment`, `digital-citizens-rights`, `dance-of-democracy` (the four packs the monitor named).
- Mobility rows changed without the orchestrator's ratification (six floor-adds, five narrowed rows): flagged in `content-diff.json`.
- Packs with no deep question: `future-of-work`, `sustainable-real-estate` (the monitor counted eight before the apply round).
- `content-diff.json` (summary, deep questions, catalogue additions) and `content-diff-<station>.json` (pack questions: id, pack, action, before, after, citations) list every rewrite, merge, addition and restoration against int for the D-08 reviewers, split per station to stay under the receipt checker's 1 MiB limit (built by `content-diff.mts`).

## Monitor items

- `/1` audit receipt: `tests/fixtures/industry-pack-audit/v1-receipt.json`, built with main's code at `8f57ce63`; `tests/industryPackAuditV1Compat.test.ts`. S4's currency section takes `amc.industry-pack-audit/5`.
- EU amending act: the sourced register now records Regulation (EU) 2026/1744 (CELEX 32026R1744) as read on 2026-10-04; the sidecar's EU AI Act rows still say the OJ citation is unverified (S10 wording), left for the expert to reconcile.
- The calendar header still names no commit, so `--check` stays deterministic.

## Originals cited (read with `git show 37c1466b:<path>`)

- `AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/apply/{health,education,environment,mobility,governance,technology,wealth}/result.json`
- `AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/apply/split/snapshot.mts` (tracked as `scripts/snapshot-industry-packs.mts`)
- `AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/integration/I1/build-guides.mts` (tracked as `scripts/gen-industry-guides.mts`)
- `AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/apply/mobility/apply-log.json`, `apply/education/questions-applied.json` (dispositions in `content-diff.json`)
- The round-2 inputs (`round2/content/<station>/questions.json`, `review.json`) are in no commit; they exist only in Sid's root checkout.

## Not done here (needs a human)

- Sid: confirm in the PR that the round-2 rewrites and merges land as experimental content (step 5); decide the 30 F5 drops (P0-26).
- D-08 experts: review `content-diff.json` before any question leaves "experimental".
- The two new calendar rows take their dates from the register's recorded reads; nobody re-read leg.colorado.gov or the Official Journal for this receipt (no network). Re-verify before publishing.

## Checks

All run at the code commit in `receipt.json`, local macOS arm64 (`checks.json` has durations and output tails):

- `npm run -s build`: exit 0
- `npm run -s typecheck`: exit 0
- `npm run -s typecheck:tests`: exit 0
- `npm run -s lint`: exit 0
- `npm run -s check:counts`: exit 0
- `npm run -s check:docs-drift`: exit 0
- `npm run -s check:freeze -- --base-ref int`: exit 0
- `npm run -s check:architecture-boundaries`: exit 0
- `npm run -s check:gates`: exit 0
- `npm run -s check:schemas`: exit 0
- `npm run -s check:api-ref`: exit 0
- `npm run -s check:threat-model`: exit 0
- `npm run -s check:duplicates`: exit 0
- `npm run -s check:dead-code`: exit 0
- `npm run -s check:industry-guides`: exit 0
- `npm run -s check:regulatory-calendar`: exit 0
- `npm run -s release:notes -- --check`: exit 0
- `npm run -s build:pages`: exit 0

Focused tests (`focused-tests.json`): 47 files, 513 tests, 510 passed, 3 failed. The 3 failures also fail on int and are outside P1-42's change: `publicDocsGraph` (MCP_SERVER.md links MCP_INDUSTRY_PACKS.md, which is not promoted), `publicDocsArtifact` (typedoc's `/blob/<revision>/` source link) and `regulatoryClaimsHonesty` (the 30 s timeout importing `src/index.ts`); $SP/P0-36f-base-failed.txt and $SP/P1-08-int-tests.txt record them on int. The full `npm test` suite was not run.

## Mutations

- M1 tests/f5DropReconciliation.test.ts (restored F5 questions): delete restored TECH-PP-14 from src/domains/packs/stations/technology.ts -> 2 failed / 2; restored and green.
- M2 tests/f5DropReconciliation.test.ts (restored text equals main's): reword restored TECH-PP-14 ('program' -> 'programme') -> 1 failed / 2; restored and green.
- M3 tests/noAmcOsReads.test.ts: point industryPacksSplitEquality.test.ts SNAPSHOT_DIR back at ../AMC_OS/RESEARCH/.../apply/split/ -> 1 failed / 3; restored and green.
- M4 scripts/gen-industry-guides.mts --check: stale.length > 0 -> stale.length < 0 -> tests/industryGuidesGenerator.test.ts 1 failed / 2; restored and green.
- M5 calendar register key-date section: render only verified key dates -> tests/regulatoryCalendar.test.ts 3 failed / 27; restored and green.
- M6 no scheduled sidecar row past its date: RED on the original sidecar (Colorado SB24-205 row, 2026-06-30, scheduled) -> 1 failed before the sidecar fix; restored and green.
- M7 /1 audit receipts still verify: verifyIndustryPackAuditChecksum rejects any schemaVersion other than the current one -> tests/industryPackAuditV1Compat.test.ts 2 failed / 3; restored and green.
