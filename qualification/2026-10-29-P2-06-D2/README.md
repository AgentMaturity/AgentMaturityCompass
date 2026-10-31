# P2-06-D2: a fresh workspace becomes Ready without `amc value init` (2026-10-29)

Defect D2 from `qualification/2026-10-29-P2-06/README.md`: every fresh workspace, including every Helm install, read `VALUE_POLICY_UNTRUSTED: file missing` until someone ran `amc value init`. The fix (commit `69b45298b` on `rtd/w7-d2-value-policy`, base `331f311d6`) signs the default value policy at workspace initialization and, for workspaces initialized earlier, at Studio start. Readiness stays read-only.

`receipt.md` is the lane's own receipt: root cause, fix, the other read-only loaders, evidence and what is pending. The files beside it are the check outputs it cites:

| File | What it shows |
|---|---|
| `typecheck.txt`, `typecheck-tests.txt` | Empty output: both type checks passed. |
| `lint.txt` | The lint contract and check-no-fabrication passed. |
| `check-gates.txt` | Every evaluated gate requirement has a registered emitter. |
| `check-dead-code.txt`, `check-duplicates.txt` | 0 new findings each. |
| `check-counts.txt`, `check-api-ref.txt`, `check-docs-drift.txt` | The counts, API reference and docs drift checks passed. |
| `tests-keys-initializers.txt` | `tests/keys` plus the initializer tests: 139 files passed, 1 skipped, 1505 of 1505 tests. |

To reproduce, check out `69b45298b`, run `npm run build`, then `npx vitest run tests/valuePolicyFreshReadiness.test.ts` and the checks listed in `receipt.json`.

The P2-06 kind qualification (INS-1) still needs a rerun on a cluster with this commit; that needs real cluster infrastructure and is not faked here.

## Receipt repaired 2026-10-31

The folder had no `README.md` and no `receipt.json`, which `npm run check:qualification` requires; `receipt.md` stays as the lane wrote it. `receipt.json` was written from `receipt.md`, the files beside it and the git history. Its commands are the three test runs and ten checks `receipt.md` lists. The test runs are written as vitest commands because their command lines were not recorded, and the checks are written as the npm scripts they name, all with exit 0 as `receipt.md` records. `commit` is `69b45298b`, which holds the fix and this folder. `tests` is null because the three selections may overlap. Every evidence file is listed as a hashed artifact. The Node, pnpm and OS versions and the command durations were never recorded; they are written as `not recorded` and `durationMs: 0`. `arch` is `arm64`, a same-host inference from the same wave's D5 receipt of that day, because the schema allows only `arm64` or `x64`.
