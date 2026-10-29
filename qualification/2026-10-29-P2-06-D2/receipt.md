# P2-06-D2 receipt (2026-10-29)

Base 331f311d6, branch rtd/w7-d2-value-policy.

## Root cause
`6280ba4b7` (P2-08) switched Studio readiness to `loadValuePolicyReadOnly`. The old `loadValuePolicy` created and signed the
default value policy on first read, so readiness used to create it. Nothing else did: `initWorkspace` signs the CGX, forecast and
bench policies but never signed the value policy. `amc bootstrap` (the Helm entrypoint) and Studio's first start both go
through `initWorkspace`, and neither created it either. Every fresh workspace therefore read `VALUE_POLICY_UNTRUSTED: file missing`.

## Fix
- `src/workspace.ts` `initWorkspace`: signs the default value policy when it is missing, beside `initCgxPolicy`. Every fresh path
  routes through this: `amc init`, `amc bootstrap` (fresh volume), host-mode workspaces, and Studio's first start.
- `src/studio/studioSupervisor.ts` `ensureWorkspace`: on Studio start, when the file is missing, signs it through the P2-08 async
  path (`loadValuePolicyAsync` -> `publishOrgPairsAsync`). This covers workspaces initialized after 6280ba4b7 and mature
  workspaces, whose initializer skips `initWorkspace`. An existing file, tampered or unparseable, is never touched.
- Readiness is unchanged and still read-only.

## Other read-only loaders from 6280ba4b7
`loadCgxPolicyReadOnly` is the only other one. Readiness checks only the CGX signature, which it already did before 6280ba4b7, and
`initWorkspace` and bootstrap already create the CGX policy, so it has no gap. The value API, scheduler and report read-only
loaders all depend on the same file, which now exists.

## Evidence
- Red first: tests/valuePolicyFreshReadiness.test.ts failed 3/3 before the fix, because init never created the policy.
- Green: 6/6 (fresh init /readyz 200; tampered reads 503; readiness never creates a missing policy; Studio start signs a missing
  policy; Studio start neither rewrites nor trips on an unparseable policy, which stays 503; a fresh `runBootstrap` /readyz 200).
- Mutation checks (each guard removed in turn, then restored):
  - init creation removed: 4/4 failed, and the bootstrap test fails.
  - supervisor creation removed: the Studio-start test fails.
  - supervisor existence guard removed: the unparseable-policy test fails.
- Related suites: 30 files that touch value, Studio supervisor, readiness and init passed 338/338. tests/keys plus the
  initializer tests: 139 files passed with 1 skipped, 1505/1505 tests (tests-keys-initializers.txt).
- build, typecheck, typecheck:tests, lint, check:gates, check:dead-code (shrank 1 stale valueStore exports entry that is now
  used), check:duplicates (new 0), check:counts (after gen-counts --write), check:api-ref, check:docs-drift: all exit 0 (files beside this one).
- No new CLI command, audit type, deletion site or key scheme.

## Pending
- Re-run the P2-06 kind qualification (INS-1) on a cluster with this commit. That needs real cluster infrastructure; it is not faked here.
