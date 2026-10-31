# P1-46 receipt: F2 blueprints folded into the compiler, not landed

Environment: local macOS 26.6.2 arm64 (Darwin 25.6.0), Node v22.23.3, pnpm 10.33.0. Not CI. Branch
`rtd/p1-46-f2-blueprints`, run at `cb1ce3a1a` after `int` (`3b0e47607`) was merged in. `receipt.json` lists every
command with its exit code and duration.

## Decision

[ADR 015](../../docs/adr/015-f2-blueprints.md): fold. F2 (candidate `37c1466b`: `d35ccbb6`, `c25bc23a`, `91b434b8`,
merge `37948853`) does not land. No compiler template data is added: every F2 rule with an enforcement meaning already
comes out of the compile path, from the same shipped defaults F2 read. Station-specific values stay in F1 operating
profiles, which the plan pins by hash. The ADR holds the part-by-part comparison and the two departures: DEPLOY is
approval-gated rather than forbidden, and assurance packs are not copied into the evidence plan. The slice map's
`hidden` slice records "not landed: folded into the compiler", and F2's commits stay `record-only` and `skip-receipt`.

No `amc blueprint` command path exists. Freeze counts are unchanged: 1255 CLI paths, 41 packs, 632 questions. Nothing
on `int` was deleted, because F2 never reached `int`.

## Byte-stable plans

No file under `src/` or `catalog/` changed (`git diff int -- src catalog` is empty). `plan-digests.json` records, at
`asOf` 2026-10-12T00:00:00Z, the catalog digest, the finance-ops-us sample plan digest and one plan per station. The
finance-ops-us digest `sha256:1c37285d…c67072` equals the one computed from `int`'s build before any P1-46 edit. No
changeset or catalog-lock recompile note is needed.

## Tests

- `tests/compilerStationDefaults.test.ts` has 14 cases. Seven are golden cases, one per station, plus a station-list
  check. Each F2 refusal is named by its rule id. One case keeps a blueprint module, any import of it and any
  `blueprint` command path out.
- `tests/programLandingSliceMap.test.ts` checks the `hidden` slice's decision and that no F2 commit is picked.
- `focused-tests.json` covers the new and changed files and the existing tests that read the changed docs, counts and
  the CLI inventory: 239 tests, 238 passed, 1 failed. The failure is
  `tests/publicDocsGraph.test.ts` › "every local guide edge resolves to another promoted guide". It fails on `int`
  too: `docs/PRICING.md` on `int` links `TRUST_LIST.md`, which is not a promoted guide (P1-51, `c8dabe447`). P1-46
  touches neither file.
- `mutations.json` lists five mutations. Each was applied in the working tree, the new test file was run, and the
  source was restored with `git checkout` (M4 created a file and then removed it). Every mutation fails at least one
  case.

## Not done here

- The integrator's approval of ADR 015 in the PR, and Sid's `DECISION:` comment on the P1-46 heading of the plan
  document.
- Converting F1 operating-profile values into compiler parameters. Today the compiler pins F1 by hash only. This is
  follow-up work for the F1 and compiler owners.
- F1's Technology profile sets WRITE_HIGH to 1 approval without distinct users
  (`src/domains/operatingProfiles/stationProfilesB.ts:67`). That is looser than the shipped default. It is reported
  to the F1 owner and not changed here.
