# P0-34: release surface for 2.0.0 (2026-10-11)

Prepared the 2.0.0 release surface without consuming the changesets: hidden and excluded surfaces (D-12, D-20), notes generated from the changesets, the single gated publish path in `release.yml`, the check scripts, the publishing docs and the one-command `npm run release:prepare -- 2.0.0`. Nothing was published, tagged or pushed.

## Environment (local, not CI)

macOS 26.6.2 (Darwin 25.6.0, arm64), Node v25.5.0, pnpm 10.33.0, npm 11.10.1. Other agents kept the load average between 10 and 24 during the gate runs. No workflow ran in GitHub Actions; the contract test and its mutations check them.

## Results

| Check | Commit | Result | Artifact |
|---|---|---|---|
| build, typecheck, typecheck:tests, lint, counts, docs-drift, freeze, architecture, gates, schemas, api-ref, threat-model, duplicates (new 0), dead-code (new 0), qualification | `0fa75227c` | all passed | none |
| Focused tests: 35 changed and related files, plus 14 files importing the package root | `0fa75227c` | 673 passed of 673 | none |
| `check:packed-install` on the branch | `ea131c134` | passed; A4 gate closed in the installed package | `packed-install-branch.txt` |
| `check:clean-source` | `ea131c134` | passed | none |
| `release:gate` on the branch (fresh clone) | `ea131c134` | **failed**: 18 of 19 executed passed; `full-test-suite` stopped at the gate's 900 s cap; coverage and live health skipped | `release-gate-branch.json` |
| `release:prepare -- 2.0.0`, run 1 | `ea131c134` | **failed** at the version step: the changesets CLI cannot see the root package. Fixed in `a16d17706` | none |
| `release:prepare -- 2.0.0`, run 2 | `a16d17706` | **failed** at the gate: docs-drift on the generated changelog page, and the suite cap. Fixed in `0fa75227c` | none |
| `release:prepare -- 2.0.0`, run 3 | `0fa75227c` | versioned 2.0.0 (164 changesets, one `## 2.0.0` heading, 1.2.0 folded); **failed** at the gate only on the suite cap | `release-gate-prepare.json` |
| Run 3's remaining steps by hand, on the same tarball | `0fa75227c` | `check-pack-contents` passed (4,548 files, 7,983,838 bytes, no forbidden path, secret scan PASS); `packed-install --tarball` passed; `npm publish <tarball> --dry-run` passed; tarball unchanged | `pack-contents.json`, `packed-install-tarball.txt`, `publish-dry-run.txt` |
| Idempotence: `release-prepare.mjs --version-only 2.0.0` rerun | `0fa75227c` | nothing pending, tracked diff byte-identical | none |
| SBOM of the 2.0.0 candidate | `0fa75227c` | 526 components | `sbom.cdx.json` |
| Mutations | several | every guard's test failed when the guard was broken | `mutations.txt` |

The tarball's SHA-256 is `3c9b49883c001f18efe96286915c486fd45d87e38c95f9485d97043aba469b06`; the SBOM's is `b0eceb9fd6fd06f205b4dcbd5d89070fedea2b2528a7842bcb4a58a1655356e4`. Both belong to a throwaway 2.0.0 candidate, not to a published release.

## What is not shown

The full test suite did not complete inside the gate on this machine. Its 900 s step cap was reached twice under load, so `per-file-coverage` never ran. Whether the suite fits the cap on a CI runner is not evaluated. Real-provider and live-deployment checks were not run.

## Reproduce

```sh
git clone <repo> amc-p0-34 && cd amc-p0-34 && git checkout 0fa75227caca5df1a6e6977e65b4d261217f577f
pnpm install --frozen-lockfile
npm run release:prepare -- 2.0.0   # in a throwaway clone: it consumes the changesets
```
