# P0-04 baseline receipt: `main` before the landing slices

This is the baseline every landing slice is compared with ([`docs/program/landing/RUNBOOK.md`](../../docs/program/landing/RUNBOOK.md), section 2). A slice may not add a failure. A check that fails here must fail on the slice with the same lines, or pass.

- Commit: `786d8abb2a12b82d0986c3a286864d7966d21166` (`origin/main` after Sid landed the root patch in `aa087090`, `ed031ade` and `786d8abb`).
- Run: 2026-10-05, one fresh clone, clean tree, detached at that commit.
- Toolchain: Node v25.5.0, pnpm 10.33.0, macOS 26.6.2 (Darwin 25.6.0) arm64. The logs do not print the OS version. It comes from the host that ran both runs: the logs' temporary paths are this host's per-user temporary directory, the host has not rebooted since 2026-09-02, and its system version file is unchanged since 2026-08-13.
- Commands: the steps of the `build-test`, `e2e-smoke-local`, `clean-source` and `packed-install` jobs of `.github/workflows/ci.yml`, and `npm run release:gate`. `receipt.json` lists each command with its exit code and duration. `ci-summary.tsv` is the runner's own step table.
- Not run: the `docker-smoke` (`docker build` and `scripts/container-smoke.mjs`), `helm-lint-template` (`helm lint` and `helm template` of `deploy/helm/amc`) and `security-scan-lite` (`scripts/security-scan-lite.mjs` and the signed release-bundle scan) jobs, and the `changeset` job, which runs only on pull requests. This receipt is no baseline for those jobs; helm is not installed on the host. Slice C (P0-14) changes the files they check, so it runs them on `origin/main` and on the slice ([`RUNBOOK.md`](../../docs/program/landing/RUNBOOK.md), section 8).

## Results

27 commands ran: 24 exited 0 and 3 exited 1.

Tests: the full suite under coverage passed 21,409 of 21,409 tests in 1,522 of 1,522 files (`Test Files  1522 passed (1522)`, `Tests  21409 passed (21409)`). Per-file coverage floors passed. The full log is 5.7 MB, which is over the 1 MB receipt limit, so it is not committed; its SHA-256 is `554b426af4b15024442395bd19c3850bc310ec7cf913ab73d0990f58d2481fbd`.

### Failing checks and their lines

`npm run check:duplicates` exits 1 ([`check-duplicates.log`](check-duplicates.log)):

```
"status": "failed",
"tool": "jscpd",
"findingCount": 1253,
"duplicatedLines": 14759,
"newClones": 0,
```

`npm run check:dead-code` exits 1 ([`check-dead-code.log`](check-dead-code.log)):

```
"status": "failed",
"tool": "knip",
"findingCount": 2339,
```

`ci.yml` runs both steps as report-only until decision D-11, so CI stays green on them.

`npm run release:gate` exits 1 ([`release-gate.log`](release-gate.log)):

```
FAILED 17/19 executed checks passed; 2 failed; 1 skipped. Acceptance is incomplete: live-deploy-health.
- FAILED source-duplicates
- FAILED source-dead-code
- PASSED runtime-dependency-audit
- SKIPPED live-deploy-health
```

The two gate failures are the same source-quality findings. `live-deploy-health` is skipped because `AMC_RELEASE_GATE_LIVE_URL` was not set.

### Expected failures from the plan, checked

- `runtime-dependency-audit` was expected to fail on the `ip-address` advisory until P0-02's override merged. The override (`"ip-address": "^10.7.1"` in `package.json` `pnpm.overrides`) landed on `main` with the root patch, so the check passed on 2026-10-05. The planned second run "after P0-02's audit-override PR merges" does not apply: there was no separate PR.
- S3's receipt saw `gen-counts --check` fail at `8f57ce63` with "README.md: unknown count key". At `786d8abb`, `npm run check:counts` passes.

## Rerun on 2026-10-06: new critical advisory

`npm run audit:runtime` was rerun alone on 2026-10-06 in a temporary worktree of `origin/main` at the same commit, with the same toolchain. It exits 1 after 1 s ([`audit-runtime-2026-10-06.log`](audit-runtime-2026-10-06.log)):

```
│ critical            │ proxy-addr vulnerable to IP spoofing via IPv4-mapped   │
│ Vulnerable versions │ >=1.1.0 <2.0.8                                         │
│ Patched versions    │ >=2.0.8                                                │
│ Paths               │ .>@modelcontextprotocol/sdk>express>proxy-addr         │
│ More info           │ https://github.com/advisories/GHSA-jqcg-44mw-7w3h      │
1 vulnerabilities found
Severity: 1 critical
```

The advisory GHSA-jqcg-44mw-7w3h was published on 2026-10-06, after the full run. The `runtime-dependency-audit` step of `release:gate` runs the same command, so from 2026-10-06 it fails on `main` too. PR #42 (P0-49) fixes it. Until that PR merges, a slice may show this one audit failure with these lines. After it merges, the audit must pass.

## Reproduce

```
git clone <origin> amc && cd amc && git checkout --detach 786d8abb2a12b82d0986c3a286864d7966d21166
pnpm install --frozen-lockfile && pnpm run build
npm run lint && npm run typecheck && npm run typecheck:tests
npm run test:coverage && npm run check:coverage
npm run check:duplicates; npm run check:dead-code   # exit 1, report-only until D-11
npm run check:counts && npm run check:docs-drift && npm run check:architecture-boundaries
npm run check:clean-source && npm run check:packed-install
npm run release:gate                                 # exit 1: source-duplicates, source-dead-code
npm run audit:runtime                                # exit 1 from 2026-10-06 until PR #42
```
