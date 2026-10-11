# P1-52 receipt: source-quality ratchet (D-11 option A)

Environment: local macOS arm64 (Darwin 25.6.0, macOS 26.6.2), Node v25.5.0, pnpm 10.33.0. Not CI. The repository's `.nvmrc` names Node 22, and CI runs Node 22 and 24. No Linux run was evaluated.

## What was checked

`npm run check:duplicates` (jscpd over `src/`) and `npm run check:dead-code` (Knip over the `knip.json` workspaces) now compare their findings with `scripts/quality/source-quality-baseline.json`. They fail on new findings, on stale baseline entries, and on drift in `.jscpd.json`, `knip.json` or a tool version. `npm run quality:baseline -- <scan> --shrink | --accept <id> --reason "…" | --rebaseline --reason "…"` maintains the baseline. `node scripts/source-quality.mjs trend` prints the weekly row.

## Baseline

- Generated with `node scripts/source-quality.mjs <scan> --rebaseline --reason "initial baseline (D-11)"` for both scans on a clean tree at `35c193fdc550f9786424d18fd447902db19572de`. That commit is `int` at `a1aef9d69` (P0-14 landed) merged with this branch's code. The baseline was committed in `0a3fbad7c`. Later commits change only `CONTRIBUTING.md`, `.github/workflows/ci.yml`, `scripts/source-quality.mjs` (the base check), `tests/sourceQualityRatchet.test.ts` and this folder. Both checks still report 0 new and 0 stale at `13828fbdf` (`checks.json`).
- Counts: 1,254 duplicate findings and 2,787 dead-code findings (types 1,552, exports 1,177, files 51, binaries 5, devDependencies 1, duplicate exports 1), with 0 accepted. The file is 586,489 bytes. Tools: jscpd 5.4.0 and knip 6.39.0. Config SHA-256 values: `.jscpd.json` `b0b0290e…e209`, `knip.json` `43edb97d…82c1`.
- P0-14: dead-code was 2,781 at `e1e1a1bb5` and is 2,787 after the merge of `int` `a1aef9d69`. P0-14's six findings are therefore in the generated baseline, with no hand edit.
- Duplicate ids: jscpd reports 108 repeats of an identical identity (the same normalised fragment twice in one file pair). The k-th repeat's id is the SHA-256 of `<identity>#k`, so a further copy is still new.

## How a branch adds an accepted finding

Run the check. Copy the printed id. Then run `npm run quality:baseline -- <scan> --accept <id> --reason "<at least 20 characters>"` once per finding, and commit the baseline change in the same PR. The command records `git config user.name` and today's date. An accepted entry whose finding later disappears is stale, and `--shrink` removes it.

## Fixture PR (`fixture-pr.log`)

Lines 69–200 of `src/a4/a4Router.ts` were copied into an untracked `src/p152FixtureDuplicate.ts`, which was never committed.

- `check:duplicates` exited 1 and named `a4/a4Router.ts <-> p152FixtureDuplicate.ts`. It also reported 1 stale entry: jscpd re-paired the existing `a4/a4Router.ts <-> a4/a4RouterStages.ts` clone into the larger copy. CONTRIBUTING.md documents this.
- `check:dead-code` exited 1 and named the unreachable file.
- `--accept` with a short reason was refused. With a 20+ character reason it passed.
- After the file was removed, the accepted entry was stale and the check exited 1. `--shrink` brought it back to 0, and the baseline was byte-identical to `HEAD`.
- A first attempt with a 22-line copy found no clone. That is jscpd's detection, and thresholds are out of scope (D-11 follow-up).

## Other evidence

- Mutations: see `mutations.txt`. Both spec mutations, plus the reason, drift, committed-baseline and base-check guards, each failed at least one test.
- Release gate: `releaseGate()` from `scripts/release-gate.mjs` ran with an executor that executed only `source-duplicates` and `source-dead-code`, and both passed (`release-gate-source-steps.json`). The other 19 registered steps were not run, and the full `npm run release:gate` was not evaluated.
- First trend row (header in CONTRIBUTING.md): `| 2026-10-11 | 13828fbdff6f | 1254 / 2787 | 1254 / 2787 | 0 / 0 | 0 / 0 | 0 / 0 |`

## Base-branch subset check (added after review)

A branch could hand-add its own new findings to the `duplicates` or `deadCode` arrays and pass the ratchet. Every check run now also requires every entry outside `accepted` to exist in the baseline at the merge-base of `HEAD` and `--base <ref>` (default `origin/main`, else `int`; CI passes the PR's target branch).

- Removals always pass. A new finding enters only through `--accept` with a reason.
- A base with no baseline file is the one-time bootstrap. This branch runs on that path: neither `origin/main` (`cc063bdac`) nor `int` (`a1aef9d69`) has a baseline.
- Any other unreadable base fails closed unless `--allow-missing-base` is passed.
- A scan whose tool version or config hash changed since the base may add entries. That is the reviewed `--rebaseline` path; without it, a tool upgrade could never land.
- Real-repo demonstration (`base-check-hand-add.log`): a dead file's entry, hand-added with `--base HEAD`, passes the ratchet (0 new) but fails the base check, exit 1.
- The gate's `source-duplicates` and `source-dead-code` steps already run these npm scripts, so they include the check with the default base.

## Top candidates (listed only; nothing was deleted)

Verify reachability before removing anything. Several of these are work in progress or public entry points, not dead code.

- Unused files (Knip `files`, 45 under `src/`):
    - A4 Forge stubs in progress (P1-58): `src/console/assets/a4*.js` (7) and `src/a4/a4Binder.ts`.
    - Barrels that may be public entry points: `src/{agent,catalog,corrections,domainProof,lab,lint,lint/rules,marketplace,steer/research,values,vault}/index.ts`.
    - Others: `src/kernel/services/{exec,job,terminal,tool}Services.ts`, `src/lighthouse/finance/payment{Adapter,Args,ServiceClient}.ts`, `src/claims/{claimFactory,claimVerify,contradictions}.ts`, `src/value/connectors/*` (3), `src/score/{behavioralTransparency,capabilityElicitation}.ts`.
- Dependencies: the unused devDependency `date-fns`. Binaries Knip cannot see declared: `graphify` (package.json `graph:update`), and `helm` and `kubeconform` (P0-14 deploy scripts and tests). These are expected system tools.
- Unused exports and types by file: `src/benchmarks/replayBenchmarkCorpus.ts` 301, `src/product/index.ts` 279, `src/redteam/index.ts` 85, `src/steer/index.ts` 83, `src/runtime/index.ts` 79, `src/incidents/index.ts` 72.
- Duplicate pairs by clone count:
    - Clones within one file: `studio/studioServer.ts` 143, `score/metricValidity.ts` 58, `diagnostic/questionScoreExplainability.ts` 33, `workspaces/workspaceRouter.ts` 19, `bridge/bridgeServer.ts` 11.
    - Across files: `diagnostic/evidenceDrilldown.ts <-> types.ts` 13, and the provider-drift family `benchmarks/{helm,patronus,humanloop}ProviderDrift.ts` (7–8 pairs each).

## Not evaluated

- A Linux CI run of the ratchet against this macOS-generated baseline.
- Knip's runtime on CI. Locally it took 5–15 s against the 120 s limit.
- The CI step stays `continue-on-error` until P0-33 makes it required.

## Reproduce

```
pnpm install --frozen-lockfile && npm run build
npx vitest run tests/sourceQualityRatchet.test.ts tests/sourceQuality.test.ts tests/releaseGateExecution.test.ts
npm run check:duplicates && npm run check:dead-code
node scripts/source-quality.mjs trend
```
