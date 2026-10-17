# P1-79 receipt: CLI, SDK and ACP runs obtain a principal-bound lease under identity-binding plans

Environment: local macOS arm64 (Darwin 25.6.0), Node 22, pnpm 10.33.0. Not CI. `receipt.json` lists every command with
its exit code and duration, the focused test totals and the artifact hashes.

## What ran

- `red.txt`: tests/runPrincipalLease.test.ts against int 257283711 with no source change: the four plan cases fail
  (no lease is minted; the session opens), and the no-plan case passes.
- `mutations.json`: each guard broken once (runLease's composer-lease passthrough, its workspace-tools scope, its plan
  gate and its OS-username match; ACP's coded refusal; each call site removed), the failing tests named, then restored.
- `packed-install.log`: `node scripts/packed-install-check.mjs --no-build --keep`. The P1-40 quickstart still reaches a
  verified synthetic action through the installed tarball, with no plan.
- `installed-plan-variant.log` (script `installed-plan-variant.mjs`): against that installed package, `amc init --coding`,
  then the L0-IDN-01 fixture plan compiled, approved by two test approvers and activated non-interactively through the
  package's own modules, with the signed residency destination registry an active plan's sessions need (P2-01).
  - Owner username = the OS account: the unmodified quickstart's `fs.write` runs under a lease naming the owner and is
    refused `approval_missing` by the fixture plan's compiled approval rule, which the quickstart does not satisfy (the
    plan, not P1-79). The variant changes the one call to `fs.read` of hello.txt (READ_ONLY, no approval rule); it
    completes and verifies, and its authorization record names the owner via the lease. The quickstart's printed line
    still says "fs.write" because that label is fixed text in the script.
  - Owner username is not the OS account: `newSession()` rejects with `AMCNativeRefusedError` PRINCIPAL_UNRESOLVED
    (`data.reason`), and the ledger holds no session.
- Every run uses the stub provider: no model ran, and every result is a synthetic example. Verification checks the
  integrity and authorship of the recorded evidence against the pinned monitor key, not answer quality. The Layer 0
  controls are experimental and not independently reviewed (D-08 is open).

## Not done here

- Registering P1-79 in the plan document (the orchestrator's step).
- Delegated children (src/agent/subagentRunner.ts, reserved for another session's slice 2) and an in-process
  `openAgentSession` caller that passes no lease still mint nothing; see the report's follow-ups.
- ACP `session/fork` (added after the first receipt run): its lease is minted before the operator's fork factory runs
  and handed to it as `leaseToken`, or the fork is refused PRINCIPAL_UNRESOLVED. Covered by two tests in
  tests/runPrincipalLease.test.ts and mutation M8 in `mutations.json`; the installed-package runs above predate it.
