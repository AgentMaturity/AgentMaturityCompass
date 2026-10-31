# P0-46 action-shell observer qualification

The new action contract test passes all 13 cases on Node 22.23.3, with zero failed, pending or todo cases. The actual parsed YAML install block runs in an unrelated consumer cwd with source paths containing spaces. Its local commands target the action repository explicitly and preserve frozen pnpm install, build and local npm global-install order. Install/build/npm failures and release pipeline failures retain their exact exit codes. Unsupported inputs and a missing action path refuse before package commands.

All nine inputs, four outputs, local-only pnpm10.33.0 setup and declared Node20 default remain unchanged. The release path uses inert curl/sh observers; stdin is drained but installer text is never evaluated. These observations are command/control-flow evidence, not a real dependency installation, build, global-install, release download or hosted action run.

A separately retained private fixture executes the exact original e0fdc9c5 parent19da1edf YAML block. It records npm-ci/npm-build/npm-global and genuinely fails the required pnpm-order assertion; the current accepted YAML passes the same assertion in the same fixture. Both shells exit0 because inert commands succeed. The historical assertion RED does not reproduce npm-ci EUSAGE or imply historical whole-platform qualification. No current action or test source was mutated for this witness.

The first test run used HEAD d8e plus the new test whose exact hash is pinned. The two later private phases used the parent's finalized4c8 source with identical action/test bytes. Protected action, workflow, package/lock, archive, freeze and floor inputs match their recorded base bytes. The inherited manifest difference from accepted main remains explicit.

The companion JSON pins actual raw reports, effects, phase logs, source/test/runtime hashes and retained fixtures. No observer bug occurred in the first run. Parent-owned real install/build/private-prefix evidence and final source checks are separate. Node20/default, Node24, hosted CI, release installer, scoring/comment/artifact/drop execution, whole-suite and coverage acceptance remain open here.
