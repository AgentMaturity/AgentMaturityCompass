# Landing runbook for candidate `37c1466b`

Candidate `amc/regulated-platform-20261003` (head `37c1466b32ed878ed89877fdcae2e3145d82d546`) is 229 commits ahead of `origin/main`. It holds 31 merges of worker branches, 8 root commits on its first-parent line and 190 worker commits: 123 code, 19 mixed and 48 receipt-only (they touch only `AMC_OS/`). It is never merged in one piece. Plan issues land it in slices, and each slice follows this runbook.

| File | Role |
|---|---|
| [`slice-rules.json`](slice-rules.json) | Hand-written rules: the slices, one rule per merged branch and per root commit, ten per-commit overrides and the named overlaps. |
| [`slice-map.json`](slice-map.json) | Generated map: every commit with its track, kind, slice, issue, action and paths. Never edit it by hand. |
| [`scripts/program/landing-slice-map.mjs`](../../../scripts/program/landing-slice-map.mjs) | Builds the map from git and the rules. `--check` exits 1 on any difference. |
| [`tests/programLandingSliceMap.test.ts`](../../../tests/programLandingSliceMap.test.ts) | Validates the committed map. It reads only the JSON, so it runs in any clone. |
| [`qualification/2026-10-05-P0-04/`](../../../qualification/2026-10-05-P0-04/README.md) | Baseline receipt for `main` at `786d8abb`. |

Rebuild or check the map (it needs the candidate fetched, see section 1):

```
node scripts/program/landing-slice-map.mjs --candidate candidate/head --base origin/main \
  --rules docs/program/landing/slice-rules.json --out docs/program/landing/slice-map.json --check
```

## The map

The generator walks `git log --topo-order --reverse origin/main..candidate/head`. For each merge `M` it gives the commits in `M^1..M^2` to the merged track. It classifies every other commit by `git diff-tree --no-commit-id --name-only -r`: `receipt-only` when every path is under `AMC_OS/`, `mixed` when some are, `code` when none are. A commit on the first-parent line that no merge brought in is `root`. For a merge, `paths` lists only the paths its resolution changed (`--cc`). `candidate.base` is the merge base with `origin/main` (`8f57ce63`), so the map stays stable while slices land on `main`.

```
type Action = "cherry-pick" | "cherry-pick-strip-receipts" | "skip-receipt" | "regenerate" | "record-only";
interface SliceMap {
  schemaVersion: 1;
  candidate: { ref: string; head: string; base: string; commitsAhead: number; merges: number };
  slices: { id: string; issue: string; phase: 0 | 1 | "hidden"; tracks: string[]; buildOrder: number }[];
  tracks: { track: string; branch: string; head: string; acceptedHead: string | null; mergeCommit: string; base: string; verdict: string; verdictFile: string; slice: string }[];
  commits: { sha: string; subject: string; track: string | null; kind: "code" | "mixed" | "receipt-only" | "merge" | "root"; slice: string; issue: string; action: Action; paths: string[] }[];
  overlaps: { path: string; candidateSlices: string[]; issues: string[]; rule: string }[];
}
```

- `cherry-pick`: `git cherry-pick -x <sha>`.
- `cherry-pick-strip-receipts`: cherry-pick, then remove every `AMC_OS/` path (section 3). The generator gives this action to every picked commit that touches `AMC_OS/`.
- `skip-receipt`: never picked. Every `receipt-only` commit gets it.
- `regenerate`: never picked. Rerun the generator that produced it, or, where section 7 says no generator exists, redo the edit by hand as section 7 describes.
- `record-only`: never picked. Every merge gets it, and so does F2 until P1-46 decides.

`acceptedHead` is the head a monitor accepted, or `null` when no acceptance is recorded. `verdictFile` starts with `37c1466b:` when the file is in the candidate (read it with `git show`), or with `root-checkout:` when it exists only in Sid's root checkout and in no commit.

| Order | Slice | Issue | Phase | Commits | cherry-pick | strip | skip-receipt | regenerate | record-only | Tracks |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | regen | ALL | 0 | 7 | 0 | 0 | 1 | 5 | 1 | I4 |
| 1 | A | P0-12 | 0 | 21 | 12 | 0 | 7 | 0 | 2 | S3, S5 |
| 2 | B | P0-13 | 0 | 33 | 24 | 2 | 4 | 0 | 3 | I3, S7, S9, and 10 assurance-grading commits from seven apply-round branches |
| 3 | C | P0-14 | 0 | 21 | 12 | 0 | 7 | 0 | 2 | S1, S2 |
| 4 | A-register | P0-12 | 0 | 3 | 0 | 2 | 0 | 0 | 1 | apply-register |
| 5 | F4 | P1-17 | 1 | 3 | 1 | 0 | 1 | 0 | 1 | F4 |
| 6 | F1 | P1-15 | 1 | 3 | 1 | 0 | 1 | 0 | 1 | F1 |
| 7 | F3 | P1-16 | 1 | 3 | 1 | 0 | 1 | 0 | 1 | F3 |
| 8 | S8 | P1-43 | 1 | 12 | 7 | 1 | 3 | 0 | 1 | S8 |
| 9 | S6 | P1-45 | 1 | 14 | 6 | 0 | 4 | 1 | 3 | I2, S6, apply-frameworks |
| 10 | content | P1-42 | 1 | 93 | 55 | 14 | 14 | 0 | 10 | I1, S10, S4, the split and seven apply-round stations |
| 11 | O | P1-44 | 1 | 12 | 4 | 0 | 4 | 0 | 4 | O17, O18, O19, O20 |
| 12 | hidden | P1-46 | hidden | 4 | 0 | 0 | 1 | 0 | 3 | F2 |

`regen` (order 0) is never built on its own: every slice reruns the generators as its last commit. The two split commits `00d143acd` and `67d732238` (branch `worktree-wf_b05b1ca6-169-1`, never merged on its own) arrived through the health apply merge, so the map lists them on track `apply-health`, in slice `content`.

List a slice's commits in map order:

```
node -e 'const m=require("./docs/program/landing/slice-map.json");for(const c of m.commits)if(c.slice===process.argv[1])console.log(c.action,c.sha,c.subject)' A
```

## 1. Preconditions

- P0-01 is merged: `docs/program/` and `qualification/` with `npm run check:qualification` and `npm run check:freeze` exist on `main`. While PR #34 is open, base the slice on its branch `rtd/p0-01-contract-receipts-freeze`.
- P0-02 is satisfied. Sid landed the whole root patch directly on `main` (`8f57ce63` to `786d8abb`: commits `aa087090`, `ed031ade` and `786d8abb`) instead of concern branches. `main` already has the root patch's `src/` refactor, oxlint `npm run lint`, the count literals at 1,522 test files and the `unused-code/` restoration files. Slices cherry-pick onto `786d8abb` or later. The candidate's merge base with `main` is still `8f57ce63`, and `git rev-list --count origin/main..candidate/head` is still 229, of which 31 are merges.
- The candidate is fetched by the route D-13 records. Sid decided D-13 on 2026-10-05: public `origin`, as it is. The candidate and all worker branches are on `origin`:

  ```
  git fetch origin amc/regulated-platform-20261003:refs/remotes/candidate/head
  git rev-parse candidate/head        # 37c1466b32ed878ed89877fdcae2e3145d82d546
  git fetch origin 'refs/heads/worktree-wf_*:refs/remotes/origin/worktree-wf_*'
  ```

  The program records under `AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/` are therefore public in the candidate's history. Slices still carry none of them (section 3).
- The baseline receipt [`qualification/2026-10-05-P0-04/`](../../../qualification/2026-10-05-P0-04/README.md) is on the base branch.
- Before a slice edits a file that a restoration parity test freezes, decision D-15's snapshot mechanism (PR #38, `scripts/snapshot-plan-edit.mjs`) is merged.
- The map check above exits 0.

## 2. Baseline

The baseline is the steps of the `build-test`, `e2e-smoke-local`, `clean-source` and `packed-install` jobs of `.github/workflows/ci.yml` plus `npm run release:gate`, run in a fresh clone of `origin/main` and committed as `qualification/<date>-P0-04/` in P0-01's receipt format. The `docker-smoke`, `helm-lint-template` and `security-scan-lite` jobs were not run, so the baseline has no result for them (section 8 says who runs them); the `changeset` job runs only on pull requests. The current baseline ran at `786d8abb` on 2026-10-05:

```
pnpm install --frozen-lockfile && pnpm run build
npm run typecheck && npm run typecheck:tests && npm run lint
npm run test:coverage && npm run check:coverage
npm run check:duplicates; npm run check:dead-code
npm run check:counts; npm run check:docs-drift; npm run check:architecture-boundaries
npm run check:clean-source; npm run check:packed-install; npm run release:gate
```

Rule: a slice may not add a failure. A check that fails on the baseline must fail on the slice with the same lines, or pass. On the baseline, `check:duplicates` (1,253 clones), `check:dead-code` (2,339 findings) and `release:gate` (`source-duplicates` and `source-dead-code` failed, `live-deploy-health` skipped) exit 1. Since 2026-10-06, `npm run audit:runtime` and the gate's `runtime-dependency-audit` also fail, on critical advisory GHSA-jqcg-44mw-7w3h (`proxy-addr`). PR #42 (P0-49) fixes that. After it merges, the audit must pass on every slice.

## 3. Build

1. Branch from `main`: `git checkout -b rtd/<key>-slice-<id> origin/main`.
2. Before the first commit that edits a frozen file, snapshot the file (D-15). Find frozen files by running the parity tests after the pick (`npx vitest run $(git grep -l 'unused-code/' -- tests)`), then run `node scripts/snapshot-plan-edit.mjs --issue <KEY> --base <base-commit> <path>...` before rebuilding `dist/`. `unused-code/plan-edits/README.md` (from PR #38, branch `rtd/p0-47-parity-snapshot-on-edit`) describes the mechanism. As a first estimate, `git grep -F` finds 43 product paths that the candidate changes named under `unused-code/` or `tests/` on `main`: 16 in slice C (Helm, Pulumi, Terraform and `docker/docker-compose.yml`), 11 in `regen` (count-literal files), 11 in A or A-register, 2 in B, 2 in S6 and 1 in content.
3. Take the slice's commits in map order. Never cherry-pick a merge: worker commits are linear.
   - `cherry-pick`: `git cherry-pick -x <sha>`.
   - `cherry-pick-strip-receipts`: strip every `AMC_OS/` path, because the candidate commits its program records there. A mixed commit that edits a record an earlier skipped commit created stops with modify/delete conflicts, so remove the records with `git rm`, which works whether or not the pick stopped:

     ```
     git cherry-pick -x <sha>    # may stop on AMC_OS/ conflicts only
     git rm -r -q -f --ignore-unmatch -- AMC_OS/RESEARCH/2026-10-03-regulated-platform-program
     if git rev-parse -q --verify CHERRY_PICK_HEAD >/dev/null; then git cherry-pick --continue; else git commit --amend --no-edit; fi
     ```

     `main` has no file under that folder, so the `git rm` removes only what the pick brought in.
   - Root `37c1466b3` (`content`, `cherry-pick-strip-receipts`) also changes `tests/fixtures/packFrameworkStrings.unresolved.json`. That hunk is regenerated, never picked (section 7), so drop it in the same pick:

     ```
     PRE=$(git rev-parse HEAD)
     git cherry-pick -x 37c1466b3    # may stop on AMC_OS/ or the fixture only
     git rm -r -q -f --ignore-unmatch -- AMC_OS/RESEARCH/2026-10-03-regulated-platform-program
     git checkout "$PRE" -- tests/fixtures/packFrameworkStrings.unresolved.json
     if git rev-parse -q --verify CHERRY_PICK_HEAD >/dev/null; then git cherry-pick --continue; else git commit --amend --no-edit; fi
     git diff --quiet "$PRE" HEAD -- tests/fixtures/packFrameworkStrings.unresolved.json && echo fixture-unchanged
     ```

     Then regenerate the fixture in `content` (section 7).
   - `skip-receipt`, `regenerate`, `record-only`: do not pick.
4. Slice `content` only: the six apply-round merges `9b6e17dda`, `6d5f2dae1`, `5c6fa7dcc`, `e3b56449b`, `fd2848bfa` and `3f18e43e4` resolved `src/domains/packs/catalogue{Eu,Us,Intl}.ts` with a union merge, and root `7d4bbecee` repairs the seams it left. Picked one by one, the stations' commits conflict in those files, starting at `c65b7bd24`. Before the slice's first pick, tell git to take the same union. The setting lives in `.git/info/`, so it is never committed; keep it while you build or rebase the slice:

   ```
   printf '%s merge=union\n' src/domains/packs/catalogueEu.ts src/domains/packs/catalogueUs.ts src/domains/packs/catalogueIntl.ts >> .git/info/attributes
   ```

   At each of those six `record-only` merge rows, check the replay against the merge's resolution:

   ```
   git diff <merge> HEAD -- src/domains/packs/catalogueEu.ts src/domains/packs/catalogueUs.ts src/domains/packs/catalogueIntl.ts
   ```

   It prints nothing, or only lines that `main` changed in those files after `8f57ce63`. If it prints any other line, edit the files to match the merge and commit `fix: replay catalogue resolution of <merge>` before the next pick. Checked on 2026-10-06 in a fresh clone: slices A, B, C, A-register, F4, F1, F3, S8, S6 and `content` replayed in map order onto `786d8abb` with these steps, all 138 picks applied, each of the six checks printed nothing, and after `7d4bbecee` the three files equal `candidate/head`.
5. Check after every commit: `git diff --name-only origin/main HEAD -- AMC_OS` prints nothing. `main` already tracks 559 older `AMC_OS/` files; slices never add or change one.

## 4. Tree equivalence per track

Before any follow-up edit, each track's product files must equal its accepted head (or `head` when `acceptedHead` is `null`). Compare from the track's own `base` in the map, not from `main`, because `main` moved past `8f57ce63`:

```
git diff --name-only -z <base> <acceptedHead> -- . ':(exclude)AMC_OS' | xargs -0 git diff --stat <acceptedHead> HEAD --
```

It prints nothing, except paths that `8f57ce63..786d8abb` also changed (`git diff --name-only 8f57ce63 786d8abb -- <path>`) and paths a later track in the same slice changed. Name each exception in the receipt. Slice B takes single commits out of apply-round tracks, so compare each of those with its original instead: `git range-diff <sha>^..<sha> <picked>^..<picked>` shows no change outside `AMC_OS/`.

## 5. Receipts

Never land program records. Each slice writes `qualification/<date>-<KEY>/` in P0-01's format: `receipt.json` keeps its fixed fields, and the commit map, the baseline delta and the mutation table go in `README.md` or in hashed files listed in `artifacts`. Cite the originals as `37c1466b:<path>`, for example `37c1466b:AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S3/result.json`.

24 product files cite the program folder, 190 times in `src/compliance/regulatory/register.json` alone. Re-point every citation the slice brings in to the slice's receipt or to a `37c1466b:` path:

```
git grep -n "2026-10-03-regulated-platform-program" -- . ':(exclude)AMC_OS'
```

## 6. Ready-to-wire diffs

Some tracks left changes as diffs instead of commits. They live only in the candidate:

| Diff | Track |
|---|---|
| `tracks/S3/ready-to-wire.diff` | S3, public question-count surfaces |
| `tracks/S7/dsh-runner-ready-to-wire.diff`, `tracks/S7/mcp-ready-to-wire.diff` | S7 |
| `tracks/S8/wiring.diff` | S8, tool registration |
| `apply/*/out-of-scope-*.patch`, `apply/split/out-of-scope-*.patch`, `integration/I4/out-of-scope-generator-refresh.patch` | apply round, split, I4 |

All paths are under `AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/`. Apply one in its own commit that names the source path:

```
git show candidate/head:AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/<path> > /tmp/<name>.diff
git apply --3way /tmp/<name>.diff
git commit -m "<type>: <what> (ready-to-wire diff 37c1466b:AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/<path>)"
```

Count-literal parts of these diffs are regenerated instead (section 7).

## 7. Regeneration

Generated lines are never cherry-picked or hand-merged. The `regenerate` commits are root `48e8b6849`, `019e32b55`, `1f811e091` and `ab808047a`, I4 `a99fefd9d` (its receipt `daf2633cb` is skipped) and I2 `96e04e7b6`. Root `37c1466b3` is picked into `content` with its station strings, but its fixture hunk is dropped (section 3) and regenerated.

- `npm run gen-counts` is each slice's last commit. After a rebase, drop that commit and rerun it.
- No generator produces root `ab808047a`. It hand-edited the station question totals: the station table in `docs/DOMAIN_PACKS.md`, the "N packs · M questions" strings in `website/station-{education,environment,health,technology}.html` and the sector totals in `whitepaper/AMC_WHITEPAPER_v1.md`. `gen-counts` covers none of these lines. Every slice that changes a station's question count (A with S3's question floor, `content` with the apply round) rewrites them by hand from the compiled packs, in the same commit as `gen-counts`, and updates the strings `tests/publicQuestionCountDrift.test.ts` pins. Use `ab808047a` only to find the lines. After `npm run build`, this prints packs and questions per station:

  ```
  node --input-type=module -e 'import {listIndustryPacks} from "./dist/domains/industryPacks.js"; const t={}; for (const p of listIndustryPacks()) { t[p.stationId] ??= [0, 0]; t[p.stationId][0]++; t[p.stationId][1] += p.questions.length; } console.log(t)'
  ```
- `docs/REGULATORY_CALENDAR.md` comes from `scripts/gen-regulatory-calendar.mjs`, which S10 adds in `content`; rerun it there after the register changes. I1 derived the station guides under `docs/industries/` with `build-guides.mts`, which exists only as a program record (`37c1466b:AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/integration/I1/build-guides.mts`). P1-42 decides whether to land it as a script; until then, run it from a `git show` copy outside the repository.
- `tests/fixtures/packFrameworkStrings.unresolved.json` is regenerated in P1-45 from the packs on its base; I2 cannot precede P1-45. No script writes it either: it is the sorted list of pack `complianceFrameworks` strings that `classifyFrameworkString` leaves unresolved, which the S6 test `tests/packFrameworkAliases.test.ts` asserts. `content` regenerates it again after `37c1466b3`, which changes five station strings.

## 8. Acceptance

Run the baseline commands, the slice issue's own checks, `npm run check:freeze` and `npm run check:qualification`. A slice that raises a frozen count (CLI paths or station-pack questions; slice A raises questions with S3's 15-question floor) adds `freeze-exception: <KEY> — <reason>` to its changeset and rewrites the baseline with `node scripts/check-freeze.mjs --write-baseline`. Every slice key is already in `allowedExceptionKeys`.

The baseline has no result for the `docker-smoke`, `helm-lint-template` and `security-scan-lite` jobs (section 2). Slice C (P0-14) changes the Helm chart, the `deploy/k8s/` manifests, the Pulumi and Terraform files and `docker/docker-compose.yml`, so it runs the steps of those three jobs from `.github/workflows/ci.yml` (`docker build` of the `studio` and `runner` targets with `node scripts/container-smoke.mjs`, `helm lint` and `helm template` of `deploy/helm/amc` with the job's `grep` checks, and `node scripts/security-scan-lite.mjs` with the release-bundle scan) on `origin/main` and on the slice, and records both runs in its receipt. Any other slice that changes files under `deploy/`, `docker/` or the `Dockerfile` does the same.

Merge with `--no-ff`, which keeps the `cherry picked from` lines. Then rerun the commands on the merge commit in a fresh clone and put the result in the closing note.

## 9. Order

1. P0-02: done (section 1).
2. Slices A, B and C. Their files are disjoint, so build them in parallel, then merge in the order A, B, C. After each merge, rebase the remaining slices and rerun their acceptance.
3. Slice A's register PR (`A-register`: `9d2636531` and `1962e06cf`, receipts stripped). Its test imports S9's manifest, so it waits for B.
4. Phase 1 by blockers. The map's build order is a default: F4 (P1-17), F1 (P1-15), F3 (P1-16), S8 (P1-43), S6 (P1-45), content (P1-42), O (P1-44), hidden (P1-46). A slice whose blockers are all done may go earlier if it rebases and reruns.

## 10. Overlap map

The generator lists every product path that more than one slice touches, plus the paths the rules name. `regen` overlaps mean the path is regenerated, not merged.

Frozen files (D-15) overlap with `main` itself: restoration parity tests byte-freeze about 190 files, and a slice that edits one without a snapshot fails them. Section 3 step 2 estimates 16 such paths in C, 11 in `regen` (count-literal and station-total files that each slice rewrites, section 7), 11 in A or A-register, 2 in B, 2 in S6 and 1 in `content`. Run `node scripts/snapshot-plan-edit.mjs` as section 3 step 2 says before the first commit that edits one.

| Path | Slices in the candidate | Issues | Rule |
|---|---|---|---|
| `docs/COMPLIANCE_FRAMEWORKS.md` | A, A-register | P0-12 | merge in buildOrder; rebase the later slice onto the merged one and rerun its acceptance |
| `docs/DOMAIN_PACKS.md` | regen, A | P0-12 | regenerate: the generator run is each slice's last commit; never hand-merge generated lines |
| `docs/EU_AI_ACT_COMPLIANCE.md` | A, A-register | P0-12 | merge in buildOrder; rebase the later slice onto the merged one and rerun its acceptance |
| `docs/industries/{README,education,environment,governance,health,mobility,technology,wealth}.md` | regen, content | P1-42 | regenerate: the generator run is each slice's last commit; never hand-merge generated lines |
| `src/assurance/packs/euAiActArticlePack.ts`, `healthcarePHIPack.ts` | B | P0-13, P0-19 | slice B first, then P0-19 |
| `src/assurance/validators.ts`, `src/compliance/complianceEngine.ts` | none | P0-02, P0-19, P0-17 | root patch (P0-02, landed on main at 786d8abb), then P0-19 and P0-17 |
| `src/compliance/coverageScorer.ts`, `mappingSchema.ts` | S6 | P0-17, P1-45 | S6 and the apply-round frameworks land in P1-45 after P0-17 |
| `src/compliance/euAiActClassifier.ts`, `src/compliance/regulatory/index.ts`, `src/compliance/regulatory/register.json`, `tests/regulatoryCurrency.test.ts` | A, A-register | P0-12 | merge in buildOrder; rebase the later slice onto the merged one and rerun its acceptance |
| `src/domains/domainAssessmentEngine.ts`, `domainReportBuilder.ts`, `industryPackAudit.ts` | content | P0-15, P0-20, P0-21, P0-24, P1-42 | S4 changes them; P0-15, P0-20, P0-21 and P0-24 go first; P1-42 rebases S4 |
| `src/domains/domainCliIntegration.ts` | B | P0-13, P0-15 | I3 lands in slice B; P0-15 edits it after B merges |
| `src/domains/industryPacks.ts`, `tests/logisticsIndustryPack.test.ts` | A, content | P0-12, P0-21, P0-23, P0-24, P1-42 | slice A grows the monolith to 2,612 lines; P0-21, P0-23 and P0-24 edit it next; P1-42 redoes the split on top |
| `src/domains/packs/catalogue{Eu,Intl,Us}.ts` | A, content | P0-12, P1-42 | merge in buildOrder; rebase the later slice onto the merged one and rerun its acceptance |
| `src/mcp/amcMcpServer.ts` | O | P0-23, P1-44 | O17 lands in P1-44 after P0-23 |
| `tests/fixtures/packFrameworkStrings.unresolved.json` | S6, content | P1-45, P1-42 | regenerate in the landing slice; never cherry-pick the I2 or 37c1466b3 fixture hunks; I2 cannot precede P1-45 |
| `website/station-{education,environment,technology}.html` | regen, A | P0-12 | regenerate: the generator run is each slice's last commit; never hand-merge generated lines |

Merge resolutions: only six merges resolved conflicts, all in the apply round (`9b6e17dda`, `6d5f2dae1`, `5c6fa7dcc`, `e3b56449b`, `fd2848bfa`, `3f18e43e4`). Each resolved `src/domains/packs/catalogue{Eu,Us,Intl}.ts` and the split snapshot under `AMC_OS/`; root `7d4bbecee` repairs the seams. All of that is in `content`, which replays the six resolutions with section 3 step 4. Count literals in `README.md`, `CONTRIBUTING.md`, the whitepaper, `website/` and `docs/content/` are touched only by `regen` and are regenerated (section 7).

## 11. Monitors' open items per slice

The slice issue's own list wins. This list adds what the map and the candidate show.

- **A (P0-12):** S3's HOLD commit `20b69fb47` leaves `tests/publicQuestionCountDrift.test.ts` red until the slice's `gen-counts` commit; root `13ea36191` derives the whitepaper totals. The question raise needs `freeze-exception: P0-12`. S5's `scripts/check-regulatory-currency.mjs` has no `package.json` entry in the candidate; P0-12 adds it. Re-point the register's 190 program citations (section 5). Up to 11 of A's and A-register's files may be frozen: snapshot them first (D-15, section 3 step 2).
- **A-register (P0-12):** waits for B. Both commits are mixed; strip them. Check its files for frozen ones with A's (D-15, section 3 step 2).
- **B (P0-13):** S7 `80d35a875` records the MCP discarded-result and simulate-before-validate defects as expected failures; they stay open. S7's two ready-to-wire diffs are not applied. I3 changes `tests/domain-registry.test.ts` so that a canned response is "not evaluated", not passing. The 10 assurance-grading commits come from apply-round branches whose refuter reviews exist only in the root checkout. 2 of its files may be frozen (D-15, section 3 step 2).
- **C (P0-14):** S1 has no recorded acceptance: its round-3 re-verification of `7180bd0c4` (`root-checkout:…/verify/reverify-S1-r3.json`) must be read before landing. S2's `scripts/deploy-verify.mjs` and `scripts/credentials-presence-check.mjs` have no `package.json` entries in the candidate; P0-14 adds them. D-03 and Sid's B3/B4 owner confirmations gate it. 16 of its files may be frozen (D-15, section 3 step 2). It runs the `docker-smoke`, `helm-lint-template` and `security-scan-lite` jobs on `origin/main` and on the slice, because the baseline has none (section 8).
- **F1, F3, F4 (P1-15, P1-16, P1-17):** one code commit each. F3 and F4 have follow-up work named in their issue titles.
- **S8 (P1-43):** the tools ship unregistered; `tracks/S8/wiring.diff` wires them.
- **S6 (P1-45):** BLOCKED at `8fc76bd45` and merged at `653e3eeeb` only by root ruling (`root-checkout:…/map/root-decisions.md`, 4 Oct 05:43Z). It needs a fresh independent review. Regenerate I2's fixture. 2 of its files may be frozen (D-15, section 3 step 2).
- **content (P1-42):** needs an expert. It lands after the G0 edits to the files in section 10 and replays the six catalogue resolutions with section 3 step 4. It drops `37c1466b3`'s fixture hunk (section 3) and regenerates the fixture and the station totals by hand (section 7). 1 of its files may be frozen (D-15, section 3 step 2).
- **O (P1-44):** the verdicts are in `root-checkout:…/verify/verify-round2-O17-O20.json`, which no commit holds.
- **hidden (P1-46):** F2 is record-only until P1-46 decides.
- **Not in the candidate:** `worktree-wf_5210e2f4-3ea-20` (`fefc204a8`, one receipt-only commit on `8f57ce63` adding `reconcile/AMC-15xx.json`) was never merged and is not in the map.

The verdict files under `root-checkout:` are in no commit, so the map records the verdict the plan states and the file path only. Read them from Sid's root checkout, or ask Sid, before relying on a verdict.

## 12. Rollback

Revert the slice's merge commit and rerun the acceptance commands (section 8) on the result:

```
git revert -m 1 <merge>
```

Record the revert and the rerun in a new receipt folder for the slice's key.
