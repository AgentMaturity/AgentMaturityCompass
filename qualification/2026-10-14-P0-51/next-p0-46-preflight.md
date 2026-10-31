# P0-46 read-only preflight — 14 October 2026

P0-46 is eligible for bounded qualification after P0-51’s serial boundary. It is High, due 7 October and Agent-Doable, with no listed dependencies. Its original fix already exists on accepted main; do not recreate it or merge held source.

## Accepted implementation and recovered contract

Commit `e0fdc9c5a40187bf73056752bb53cd1bed67f333` is an ancestor of accepted main `5ea5e866a42acd5c8228a712e9b8c1d9f18c745c`, held reference `3b4a673c8f6fc11a947279054979e977f95b34d1` and measured qualification source `3b08f2285a9b276e3aa0fce8f36ed2f6198adb46`. The action, AMC PR Gate workflow and its patch changeset are byte-identical across those refs and the original fix. Held package and freeze bytes differ from accepted main and remain held.

The plan title (`Issues.md:56`), accepted commit and changeset define the bounded change: set up pnpm 10.33.0 only for `amc-version: local`, resolve the action repository from `GITHUB_ACTION_PATH/..`, perform `pnpm --dir "$ACTION_REPOSITORY" install --frozen-lockfile` and `pnpm --dir "$ACTION_REPOSITORY" run build`, and retain installation of that local build with `npm install -g "$ACTION_REPOSITORY"`. The release branch, unsupported-input refusal and scoring behavior remain outside this fix. No dedicated P0-46 specification or complete acceptance checklist, associated PR, tracked receipt or pnpm-specific regression test was recovered. The program contract still requires green CI, merged source and a closing receipt before Done.

## Actual failure and remaining proof

A fresh read-only hosted query returned three failures, all preceding the fix. The latest is run [37638657976](https://github.com/AgentMaturity/AgentMaturityCompass/actions/runs/37638657976), whose `amc-score` job failed at `Run ./amc-action`. Its actual log reports `npm error code EUSAGE` because `npm ci --prefix` requires `package-lock.json` or `npm-shrinkwrap.json`; neither file exists in the accepted repository. The fix landed at 15:19:39 UTC after that 14:40 run. No post-fix passing action run or current-main `amc-score` pass was recovered.

Existing publication tests check distribution wording and canonical launcher use; they do not execute the local install or enforce pnpm ordering. Root’s ordinary pnpm installs/builds from a measured source are useful component evidence, but do not prove the exact action block or installed prefix. Node 20 remains the action default and satisfies `engines: >=20`. It is unavailable locally; a Node 22 run must be labelled as qualification of the selected override, without claiming default Node 20 or hosted Ubuntu behavior.

## Smallest next qualification

After the P0-51 bounded receipt, use a new root-owned worktree from the final measured source. Execute the unchanged extracted local install block with a fixture caller directory and `GITHUB_ACTION_PATH`, plus an owned `npm_config_prefix`, cache, HOME and AMC_HOME. Verify the installed `amc --version` and `amc --help` through that prefix, and retain command outputs, resolved CLI hashes and unchanged package/lock/freeze hashes. A separate command observer can prove failure ordering and that non-local inputs do not run pnpm; such an observer is not real installation proof. Never execute the curl release branch merely to validate its registration.

The action’s initialization error suppression, Git-based base comparison, PR comments and uploads are unchanged separate behaviors. Do not run them against shared trees or external services, and do not infer whole-action success from installation alone. The contract’s full test, source-quality, release and CI obligations remain independent; this preflight runs none of them and transfers no older passing report.

## Ownership and preservation

No explicit P0-46 or action/workflow path reservation match was found. The generic session bucket at `RESERVATIONS.md:1496` remains ambiguous broad ownership wording, so missing path matches do not grant blanket production-edit authority. Existing-source owned qualification avoids competing implementation. Shared CLI, API, Studio, A4 and freeze paths remain protected. Neither action YAML is currently named by the plan-edits manifest; that is a lookup fact, not authorization to change restoration policy.

Graphify queried a private copy first and found the action README at L1. The graph is pinned to `4247e610`, is stale, and its traversals were truncated. The YAML requirements come from verified source bytes. Original graph and every checkout were preserved. Only private navigation/read-only hosted evidence and these two preflight files were written.

P0-22’s two unresolved failures, skipped P0-29 debt, broad release/coverage/source-quality/CI obligations and P0-51’s pin-precedence conflict remain open. No tests, builds, runtime imports, servers, source edits, pushes, trackers or Claude messages occurred. Exact hashes, commands and evidence paths are in the JSON companion.
