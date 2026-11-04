# P1-40 receipt: TypeScript SDK contract, starter profiles and quickstart

Environment: local macOS arm64 (Darwin 25.6.0), Node 22, pnpm 10.33.0. Not CI. `receipt.json` lists every command with
its exit code and duration, the focused test totals and the artifact hashes.

## What ran

- `packed-install.log`: `node scripts/packed-install-check.mjs --no-build` with Node 22. It packs the publish file set,
  installs the tarball into a fresh directory with an empty HOME, then runs `amc init --coding` with the installed bin
  and `examples/sdk/quickstart.mjs` against the installed package. The quickstart's line "installed quickstart reached
  a verified synthetic action in N s" is the wall time from `amc init --coding` to the verified receipt. The stub
  provider runs no model: the action is synthetic, and the verification is of the recorded evidence's integrity and
  authorship against the monitor key pinned right after init, not of answer quality.
- Measured: 15.6 s from `amc init --coding` to the verified receipt through the installed package (Node 22, branch merged
  with int 06a22aef5; packed at 1246619b3). One local run, not a platform qualification.
- `focused-tests.json`: tests/starterProfiles.test.ts, tests/sdkPublicApi.test.ts and tests/sdkQuickstart.test.ts.
- `mutations.txt`: each guard broken once, the failing test named, then restored.

## Not done here

- The `--regulated` Layer 0 plan is compiled and signed but not activated. Its starter deployment profile states no
  fact, so the plan stays blocked until the operator states `useCases` and `jurisdictions`; activation also needs a
  plan review approved by two OWNER or AUDITOR users other than the requester. The Layer 0 controls are experimental
  and not independently reviewed (D-08 is open).
- Publishing: the first npm version that contains the documented SDK is set by the P1-41 release train (Sid's step).
- The SDK package name (subpath or its own package) is Sid's decision.
