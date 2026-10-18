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

Measured at the code commit in `receipt.json` (`counts.json`):

| Station | Packs | Pack questions | Deep questions |
|---|---:|---:|---:|
| `environment` | 6 | 104 | 17 |
| `health` | 9 | 161 | 58 |
| `wealth` | 5 | 89 | 56 |
| `education` | 5 | 87 | 16 |
| `mobility` | 6 | 94 | 16 |
| `technology` | 5 | 97 | 16 |
| `governance` | 5 | 91 | 56 |
| **Total** | **41** | **723** | **235** |

Before P1-42 (int `b9866b0f`): 632 pack questions and 150 deep questions. The candidate's 646, plus the 30 F5 proposed drops and the 47 proposed merges kept pending Sid, gives 723. `content-diff.json` counts the pack changes against int: 339 rewritten under the same id, 18 rewritten with a `-v2` id, 109 added, 18 merged with a target in the candidate's committed apply logs, 47 proposed merges kept, 30 F5 drops restored, 180 unchanged; deep questions 87 added, 148 changed, 2 removed; 57 catalogue instruments added.

## Kept until Sid decides (P0-26 and the P1-42 review)

- **F5's 30 proposed drops.** All 30 P0-26 decisions are `defer`. The round-2 apply commits removed all 30; each is restored byte for byte from int (main plus P0-24's corrections): EDU-HE-3, EDU-SE-11, EDU-SE-13, EDU-SE-15, ENV-SS-5, ENV-SS-14, GOV-DCR-14, GOV-DD-15, GOV-PL-14, GOV-PPC-15, HLT-WM-17, HLT-PL-17, MOB-SC-14, MOB-RE-15, MOB-VI-14, MOB-F3W-8, TECH-OS-4, TECH-OS-15, TECH-INF-15, TECH-PP-7, TECH-PP-13, TECH-PP-14, WLT-FW-6, WLT-FW-14, WLT-NP-6, WLT-NP-11, WLT-NP-14, WLT-CE-14, WLT-CE-15, WLT-BC-15 (`tests/f5DropReconciliation.test.ts`).
- **Round 2's 47 proposed merges with no committed target.** Each stays as on int, and `docs/program/round2/merge-decisions.json` records its proposed target (read from the round-2 inputs, which are in no commit) with decision `defer`, pending Sid (`tests/roundTwoMergeDecisions.test.ts`): ENV-FF-2 → ENV-FF-10, ENV-STS-4 → ENV-STS-13, ENV-SS-15 → ENV-SS-1, ENV-UU-15 → ENV-UU-9, ENV-WW-13 → ENV-WW-2, GOV-CS-12 → GOV-CS-1, GOV-DD-2 → GOV-DD-11, GOV-DD-3 → GOV-DD-13, GOV-DD-5 → GOV-DD-12, GOV-DD-9 → GOV-DD-7, GOV-DCR-1 → GOV-DCR-10, GOV-DCR-13 → GOV-DCR-7, GOV-PL-2 → GOV-PL-13, GOV-PL-3 → GOV-PL-10, GOV-PPC-12 → WLT-DP-7, GOV-PPC-2 → GOV-PPC-11, GOV-PPC-5 → TECH-PP-3, HLT-DHR-13 → HLT-DHR-2, HLT-DHR-14 → HLT-DHR-5, HLT-DHR-18 → HLT-DHR-9, HLT-DD-15 → HLT-DD-1, HLT-DD-16 → HLT-DD-2, HLT-LT-12 → HLT-LT-2, HLT-PL-15 → HLT-LT-13, HLT-PP-11 → HLT-PP-4, HLT-PP-7 → HLT-PP-12, HLT-SM-11 → HLT-SM-1, TECH-CI-12 → TECH-CI-3, TECH-CI-13 → TECH-CI-1, TECH-CI-9 → TECH-CI-10, TECH-INF-4 → TECH-INF-12, TECH-NE-11 → TECH-NE-3, TECH-NE-12 → TECH-NE-2, TECH-NE-13 → TECH-NE-1, TECH-NE-8 → TECH-NE-9, TECH-OS-10 → TECH-OS-9, TECH-OS-12 → TECH-OS-5, TECH-OS-14 → TECH-OS-2, TECH-OS-7 → MOB-VI-13, TECH-PP-1 → TECH-PP-10, TECH-PP-9 → TECH-PP-6, WLT-BC-14 → WLT-BC-4, WLT-BC-9 → WLT-BC-12, WLT-CE-11 → WLT-CE-9, WLT-DP-12 → WLT-DP-4, WLT-DP-14 → WLT-DP-7, WLT-NP-12 → WLT-NP-1.
- `restored-questions-round2-rule-gaps.txt` lists the 50 of these 77 that miss a round-2 content rule (weight, one instrument, an unresolved citation, or the repealed Directive 2003/98/EC in GOV-PL-14). The candidate's station tests skip round-2 rules for them until Sid decides (`tests/helpers/f5Deferred.ts`).
- **18 versioned ids.** Rewrites that change a question's dimension take a `-v2` id (`docs/program/round2/question-id-versions.json`), so answers stored under the old id leave the new question not evaluated (`tests/questionIdVersions.test.ts`): ENV-MM-4 (Safety → Transparency), ENV-UU-9 (Security → Safety), GOV-CS-4 (Transparency → Governance), HLT-PL-16 (Safety → Compliance), HLT-PP-12 (Compliance → Traceability), HLT-SM-18 (Ethics → Transparency), MOB-PS-15 (Incident Reporting → Compliance), TECH-CI-15 (Governance → Transparency), TECH-INF-9 (Compliance → Transparency), TECH-NE-14 (Data Access by Design → Resilience), TECH-NE-15 (Supply Chain Security → Compliance), TECH-OS-9 (Compliance → Resilience), TECH-PP-15 (Fair Contracting → Transparency), WLT-DP-13 (Payee Verification → Safety), WLT-DP-15 (Resilience → Safety), WLT-NP-10 (Fair Lending → Ethics), WLT-NP-13 (Risk Management → Governance), WLT-NP-15 (Risk Management → Governance). The 18 merges whose targets the candidate's committed apply logs record (education, mobility) stay merged.

## Flagged for expert review

- Packs whose classification cites an Article 5 prohibited practice (domain reports print "Cites an Article 5 prohibited practice; check the deployment"): `differently-abled`, `infotainment`, `digital-citizens-rights`, `dance-of-democracy` (the four packs the monitor named).
- Mobility rows changed without the orchestrator's ratification (six floor-adds, five narrowed rows): flagged in `content-diff-mobility.json`.
- Packs with no deep question: `future-of-work`, `sustainable-real-estate` (the monitor counted eight before the apply round).
- `content-diff.json` (summary, deep questions, catalogue additions) and `content-diff-<station>.json` (pack questions: id, pack, action, before, after, citations) list every rewrite, merge, addition and restoration against int for the D-08 reviewers, split per station to stay under the receipt checker's 1 MiB limit (built by `content-diff.mts`).

## Monitor items

- `/1` and `/4` audit receipts: `tests/fixtures/industry-pack-audit/v1-receipt.json` (main's code at `8f57ce63`) and `v4-receipt.json` (int's code at `b9866b0f`); `tests/industryPackAuditV1Compat.test.ts` verifies both and renders `/4`. S4's currency section and the content status take `amc.industry-pack-audit/5`.
- EU amending act: the sourced register now records Regulation (EU) 2026/1744 (CELEX 32026R1744) as read on 2026-10-04; the sidecar's EU AI Act rows still say the OJ citation is unverified (S10 wording), left for the expert to reconcile.
- The calendar header still names no commit, so `--check` stays deterministic.

## Originals cited (git blob ids in candidate `37c1466b`; read with `git cat-file -p <blob>`)

- The seven station apply results of candidate `37c1466b` (blobs: health `d7b7d84381bc`, education `abd1efdb36f6`, environment `0688e4292564`, mobility `8e6efca95db9`, governance `f3c210ff288e`, technology `b3b7ce4e7792`, wealth `537fb3b384df`)
- The candidate's split snapshot script, blob `a708068a44af` (tracked as `scripts/snapshot-industry-packs.mts`)
- The candidate's guide builder, blob `d2b42c33e853` (tracked as `scripts/gen-industry-guides.mts`)
- The mobility apply log, blob `e7a3b33fd4aa`, and the education applied-questions list, blob `27f80dc8af30` (dispositions in `content-diff.json`)
- The round-2 inputs (`round2/content/<station>/questions.json`, `review.json`) are in no commit; they exist only in Sid's root checkout. P1-42 read the five stations' `questions.json` there (read only) for the 47 merge targets in `docs/program/round2/merge-decisions.json`.

## Not done here (needs a human)

- Sid: confirm in the PR that the round-2 rewrites land as experimental content (step 5); decide the 30 F5 drops (P0-26, `docs/program/f5/decisions.json`) and the 47 proposed merges (`docs/program/round2/merge-decisions.json`, listed above).
- D-08 experts: review `content-diff.json` and its per-station files before any question leaves "experimental".
- The two new calendar rows take their dates from the register's recorded reads; nobody re-read leg.colorado.gov or the Official Journal for this receipt (no network). Re-verify before publishing.

## Checks

All run at the code commit in `receipt.json`, after merging int (`c952585c5`), local macOS arm64 (`checks.json` has durations and output tails):

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
- `npm run -s check:citations`: exit 0
- `npm run -s check:catalog-currency`: exit 0
- `npm run -s check:catalog-changelog`: exit 0
- `npm run -s check:industry-guides`: exit 0
- `npm run -s check:regulatory-calendar`: exit 0
- `npm run -s release:notes -- --check`: exit 0
- `npm run -s build:pages`: exit 0
- `npm run -s check:qualification`: exit 0 (on this receipt)

`npm run release:gate` (run at `2d02681e6`, before the review fixes) exited 1: `citations` (fixed since), `full-test-suite` (killed at the gate's 900 s limit on this loaded machine; no result file) and `install-persona-qa` (10-minute timeout); 16 of 19 executed checks passed, `per-file-coverage` and `live-deploy-health` were skipped.

Focused tests (`focused-tests.json`): 64 files, 670 tests, 667 passed, 3 failed. All three failures also fail on int and lie outside P1-42 (`publicDocsGraph`: MCP_SERVER.md links MCP_INDUSTRY_PACKS.md, which is not promoted; `publicDocsArtifact`: typedoc's `/blob/<revision>/` link; `regulatoryClaimsHonesty`: the 30 s timeout importing `src/index.ts`), recorded on int in $SP/P0-36f-base-failed.txt and $SP/P1-08-int-tests.txt.

Full suite (`full-suite.json`, plain `npx vitest run` at `2d02681e6`, before the review fixes; not rerun since): 25092 tests, 25026 passed, 59 failed, 7 skipped, in 24 files: pi-ai tests (the devDependency int added is not installed in this worktree), the two docs tests above, two throughput floors, and timeouts in files that import no module P1-42 changes; the industry-pack and assurance files among them pass when run alone.

## Mutations

- M1 tests/f5DropReconciliation.test.ts (restored F5 questions): delete restored TECH-PP-14 from src/domains/packs/stations/technology.ts -> 2 failed / 2; restored and green.
- M2 tests/f5DropReconciliation.test.ts (restored text equals main's): reword restored TECH-PP-14 ('program' -> 'programme') -> 1 failed / 2; restored and green.
- M3 tests/noAmcOsReads.test.ts: point industryPacksSplitEquality.test.ts SNAPSHOT_DIR back at ../AMC_OS/RESEARCH/.../apply/split/ -> 1 failed / 3; restored and green.
- M4 scripts/gen-industry-guides.mts --check: stale.length > 0 -> stale.length < 0 -> tests/industryGuidesGenerator.test.ts 1 failed / 2; restored and green.
- M5 calendar register key-date section: render only verified key dates -> tests/regulatoryCalendar.test.ts 3 failed / 27; restored and green.
- M6 no scheduled sidecar row past its date: RED on the original sidecar (Colorado SB24-205 row, 2026-06-30, scheduled) -> 1 failed before the sidecar fix; restored and green.
- M7 /1 audit receipts still verify: verifyIndustryPackAuditChecksum rejects any schemaVersion other than the current one -> tests/industryPackAuditV1Compat.test.ts 2 failed / 3; restored and green.
- M8 /4 audits render: drop the currency guard in renderIndustryPackAuditMarkdown -> tests/industryPackAuditV1Compat.test.ts 1 failed / 4; restored and green.
- M9 calendar past-due check (data-derived as-of): the original sidecar (Colorado SB24-205, 2026-06-30, scheduled) -> 1 failed; restored and green.
- M10 kept merges: delete kept WLT-NP-12 -> tests/roundTwoMergeDecisions.test.ts 1 failed / 3; restored and green.
- M11 id versions: revert WLT-NP-10-v2 to WLT-NP-10 -> tests/questionIdVersions.test.ts 3 failed / 3; restored and green.
- M12 labels: catalog item without contentStatus -> tests/questionnaireLabelSurfaces.test.ts 2 failed / 9; restored and green.
- M13 labels: MCP sector-pack text without the Content line -> tests/questionnaireLabelSurfaces.test.ts 1 failed / 9; restored and green.
- M14 R4 phrase entries: ignore the phrase when matching -> tests/checkNoFabrication.test.ts 2 failed / 31; restored and green.
- M15 guide citations: skip the token check in the generator -> tests/industryGuidesGenerator.test.ts 1 failed / 4; restored and green.
- M16 guide citations: put line numbers back in the appendix -> the src/cli.ts shift test fails; restored and green.
- M17 labelled counts: hand-edit a station page count without the label -> check:counts exits 1 and tests/publicQuestionCountDrift.test.ts fails; restored and green.
