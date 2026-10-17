# P0-49 final dependency qualification — 14 October 2026

The dependency component passed on Node `v24.21.0` / pnpm `10.33.0` in the clean owned fixture at `c4be164ea12d358ea30451391a6df29429fc6a7e`. Package, lockfile, workspace and both source-archive inputs match accepted main `5ea5e866a42acd5c8228a712e9b8c1d9f18c745c` and P0-47 `71ed73e5886bc957130f9712985281d1b1149fca`.

Fresh actual `pnpm audit --prod --audit-level=moderate --json`: exit0, zero advisories and all severity counts0, in0.839seconds. Audit metadata reports192production/192total dependencies. The separate installed pnpm-list tree exposes160unique(name,version,path) nodes and8direct production dependencies; these are distinct measures.

Actual installed route: SDK1.32.1 → express5.2.1 → proxy-addr2.0.8. The package override remains `^2.0.8`.

Every current accepted-main manifest test passed:15/15,success true,0failed/pending/todo,in3.506seconds. The original16-case instruction mistakenly included P0-47's added compiled-ancestry test. The parent corrected the expected count to the15existing accepted-main cases. No test was added or skipped and no waiver was granted. Original raw phase filenames retain the initial16label; their unchanged JSON contains the actual15-case result.

The P0-09package and P0-49lockfile archives both match their declared SHA-256 and original `b552b69cd220d7d73b63a58685f77bb2bbb26c8f` source bytes. The archive-introducing commits `b8417acb08250b169044139be072b1db671076ef` and `7c1afe4930db1b0d7997eb7860645e59433e8e42`, respectively, and the base commit are actual ancestors of current HEAD. No shallow skip was used.

The accepted-main compiled snapshot future/nonancestor guard gap remains. Passing current15cases and checking these two real source archives does not integrate P0-47's stronger guard. The D-15manifest/test differ from P0-47, so its old report was not reused.

Source hashes are unchanged and final Git status is clean. Commands, timings, actual cases, input/archive/base hashes and raw audit/graph/report hashes are retained in the JSON. No reinstall, dependency/source/test/archive edits, whole-suite/coverage claim, hosted CI, release or publication action occurred.
