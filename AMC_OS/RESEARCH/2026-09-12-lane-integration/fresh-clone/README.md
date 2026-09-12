# Fresh-clone acceptance — candidate C `09d353f566ec0ed6ea5d655937179194744d95e0`

Reproduced per the brief's receipt rule: `git clone /Users/sid/AgentMaturityCompass` into the session scratchpad
(`clone-c`), `git checkout 09d353f5`, `pnpm install --frozen-lockfile --prefer-offline` from the local pnpm store,
then every step below by `fresh-clone-validate.sh` (in this directory). Environment: Darwin 25.6.0 arm64, Node
v25.5.0, pnpm 10.33.0 (`candidate-c/environment.txt`). Tracked tree clean after checkout
(`status-after-checkout.txt` is empty).

| Step | Result | Seconds | Log |
|---|---|---:|---|
| install | passed | 2 | candidate-c/install.log |
| build (`pnpm build`) | passed | 28 | candidate-c/build.log |
| typecheck src | passed, 0 errors | 23 | candidate-c/typecheck-src.log |
| typecheck tests | passed, 0 errors | 32 | candidate-c/typecheck-tests.log |
| OpenAPI contract check | passed | 1 | candidate-c/openapi-check.log |
| full suite (`vitest run`) | **1,477/1,477 files, 14,043/14,043 tests, 0 failed, 0 skipped** | 329 | candidate-c/full-suite.log |
| Python suite (`sdk/python`, `AMC_BIN=dist/cli.js`, python3.14) | 290 passed, 21 failed, 1 skipped — all 21 are `test_validation_installed.py`, which imports the installed wheel under `python -I`; not installed here | 73 | candidate-c/python-lanes.log |
| release gate (`pnpm release:gate`) | **14/14 executed checks passed, 0 failed, 1 skipped** (live-deploy-health: no `AMC_RELEASE_GATE_LIVE_URL`) | 572 | candidate-c/release-gate.log, candidate-c/release-gate-latest.json |

Gate steps passed: console-js-syntax, openapi-parse, typecheck, typecheck-tests, build, packed-install,
gap-0626-adversarial-regression, full-test-suite (JSON report sha256 `52bae56d8739c36e5f04297e3b2c302c5cc25ad03784a027e9f56e2b09f2e096`, counts
14,043/14,043/0 failed/0 pending/0 todo, 1,477 files), command-inventory, architecture-boundaries,
docs-drift-public-naming, runtime-dependency-audit, cli-and-domain-smoke, install-persona-qa.

After the run the clone's tracked `.amc/keys/*` and `.amc/release-gate/latest.json` differ
(`candidate-c/status-after-run.txt`, 13 paths): the suite and gate rotate the test signing keys, as
earlier receipts recorded. The clone is not claimed clean after execution.

Exercised: source build, both typechecks, the OpenAPI contract, the complete Vitest suite, the Python suite
except installed-wheel cases, and the full release gate on this machine. Not exercised: live deployment
health, the installed-wheel Python cases, the opt-in browser scenarios (no Chromium download), any other
platform, any real provider. This is source and local package qualification on Darwin arm64 / Node v25.5.0;
it is not platform, published-package or deployed-release qualification.

Earlier candidates: `candidate-a/` (`c1b5cf9c`: install, build, typechecks, then the two generators run
there) and `candidate-b/` (`40f80de1`: full suite 14,042/14,057 with 15 skipped and 0 failed; gate 12/14 with
the two failures candidate C repaired).
