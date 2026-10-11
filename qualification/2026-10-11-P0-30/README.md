# P0-30: security mutation batch for the in-flight fixes

Branch `rtd/p0-30-security-mutations`, from `int` = `main` `cc063bdac`. The batch ran on 2026-10-11 at `91678253` (main plus the P0-30 commits listed below) in the item's own worktree, on macOS 26.6 arm64 with Node v25.5.0, pnpm 10.33.0 and vitest 4.1.11. Local run, not CI. `receipt.json` lists every command with its exit code.

## Files

- `mutations.batch.json`: the 71 entries the batch ran. 27 are new for P0-30, and 44 are S7's entries from candidate `37c1466b`, re-pointed at main's paths.
- `mutations.json`: the result written by `scripts/mutation-batch.mjs`. It holds the commit, one baseline per distinct test set (each set ran once with no mutation), and per entry the outcome, the mutated line, the exit code, the duration and up to 20 failing test names.
- `outcomes.json`: one line per old issue.
- `notary-rerun.txt`: the AMC-1529 container rerun (step 8).
- `installed-subset.json`: the AMC-1537 run from the packed tarball (step 9).
- `lease-consumers-fresh-clone.log`: the AMC-1542 consumer tamper reproduction, run in a fresh clone.

## How the batch works

`node scripts/mutation-batch.mjs --batch mutations.batch.json --out mutations.json`

1. Each distinct test set first runs with no mutation. If that run fails, its entries are recorded as `baseline-failed` and count as errors, never as kills.
2. For each entry, the runner first refuses unless `git status --porcelain` is empty. It requires `find` to occur exactly once in `file`, applies `replace`, runs `vitest run <tests> --reporter=json`, and puts the original bytes back. It restores on every exit path, including SIGINT and SIGTERM, then checks that the bytes match and the tree is clean.
3. The run exits 1 if any `killed` entry survives, any `equivalent` entry is killed, or any entry errors.

`tests/mutationBatch.test.ts` checks the runner against a throwaway git repository. It covers a killed entry being restored with a clean tree, a survivor and a killed equivalent failing the batch, the exactly-once rule, refusal on a dirty tree, a failing baseline, and restore on SIGTERM and SIGINT.

## Result

Batch run at `91678253`: 71 entries, 70 killed, 0 survived, 1 equivalent, 0 equivalent-killed and 0 errors. Exit 0, 1,291 s.

| Old issue | Entries | Killed | Survived | Equivalent |
|---|---|---|---|---|
| AMC-1525 | 5 | 5 | 0 | 0 |
| AMC-1542 | 8 | 8 | 0 | 0 |
| AMC-1546 | 2 | 2 | 0 | 0 |
| AMC-1508 | 1 | 1 | 0 | 0 |
| AMC-1534 | 2 | 2 | 0 | 0 |
| AMC-1529 | 2 | 2 | 0 | 0 |
| AMC-1537 | 1 | 1 | 0 | 0 |
| AMC-1547 | 6 | 6 | 0 | 0 |
| AMC-1513 | 10 | 10 | 0 | 0 |
| AMC-1516 | 10 | 10 | 0 | 0 |
| AMC-1517 | 4 | 3 | 0 | 1 |
| AMC-1518 | 2 | 2 | 0 | 0 |
| AMC-1519 | 4 | 4 | 0 | 0 |
| AMC-1520 | 4 | 4 | 0 | 0 |
| AMC-1523 | 6 | 6 | 0 | 0 |
| AMC-1521 | 4 | 4 | 0 | 0 |

The only survivor is S7-M23, which is equivalent by design. `close()` sets `closed` and ends every entry, so `entry.ended` already covers `this.closed`.

Every kill was checked against its failing test names in `mutations.json`, and each one names the guard's own test. Two entries (the bundle and certificate raw-history mutants) are killed only through the signature error (`Manifest signature verification failed.` and `cert signature invalid`). Issuer admission refuses the attacker key on its own, so `ok` stays false even when the guard is broken.

An earlier run at `910a63ba` produced 60 killed, 1 equivalent and 10 `baseline-failed`. The 10 failures were S7's M01 to M10. Their test set included `tests/nativeSandboxPolicyBinding.test.ts`, which fails 2 cases on main with no mutation: the cases have been stale since P1-02's authorization recheck. Commit `91678253` drops that file from those ten entries; S7 recorded every one of those kills in `bwrapBackendPure`. The batch above is the only full run at `91678253`.

## Re-pointed S7 entries

- S7-M38: the import JSON output moved into `emitClaimResult` (`src/cli/claimOutput.ts`, P0-22). The test now pins "receipt plus claim fields", so the mutation drops the claim fields.
- S7-M40: the release-gate step is now registered through `add(...)`.
- S7-M40 to M43: S7 mutated a copy (`AMC_RECONCILE_ROOT`). This batch mutates `scripts/release-gate.mjs` and the workflows in place and restores them.

## P0-30 commits

- `6da687f43` feat(scripts): add the security mutation batch runner (P0-30)
- `885bd72cb` fix(leases): publish revocation lists only as a verified pair (P0-30)
- `367fbdf5c` test(security): add the P0-30 guard tests for AMC-1525, 1542, 1546, 1508 and 1534
- `910a63bae` chore(qualification): add the P0-30 security mutation batch (71 entries)
- `634c25b0b` chore: regenerate published counts for the four P0-30 test files
- `91678253f` chore(qualification): run S7's bwrap entries without the file that fails on main (P0-30)

## Steps 7 to 9

- **Step 7, lease revocation publish.** This was fixed, not just documented (`885bd72c`).
    - One publish path signs the exact list bytes and verifies the signature against the auditor key history before writing anything. It writes both files under temporary names, renames the list and then the signature under the revocations lock, and verifies the published pair.
    - This also fixes the P0-14 finding. `amc lease issue` with a locked vault no longer leaves an unsigned `revocations.json`, and a revoke under `AMC_NO_SIGN=1` no longer publishes a pair that every consumer refuses.
    - `docs/LEASES.md` states the remaining crash window between the two renames and its fail-closed repair.
    - The stale comment at `src/wire/wireDispatcher.ts` is fixed.
- **Step 8, AMC-1529.** See `notary-rerun.txt`.
    - The Docker Compose plugin is not installed on this host, and P0-30 does not install tooling. So the `docker-compose.tls.yml` notary and Studio services were started with `docker run`, using the same image (`docker buildx build --target studio`), command, environment, read-only root, dropped capabilities, volumes and file secrets. Caddy was not started.
    - The notary reported READY. Studio bootstrapped through it and reported READY with trust mode NOTARY; the notary signing log then held 8 entries.
    - No synthetic secret value appears in either container log.
    - `tests/notaryComposeIntegration.test.ts` and `tests/notaryAuthReplay.test.ts` passed in the fresh clone: 16 tests.
- **Step 9, AMC-1537.** See `installed-subset.json`.
    - `npm pack` of this branch was installed with `npm install --prefix <temp>`, and the installed `amc` ran each scenario in a temporary workspace against a loopback model fixture.
    - The signed read subset advertised three tools and the read returned the fixture bytes. The model's call to an unadvertised write name ended the turn as a failed request: no tool call, no file. `amc agent-loop verify` returned ok.
    - The empty, digest-mismatch and MCP-identity subsets each refused with "the workspace toolset is not ready", before any provider request.

## Full suite and checks

- `npm test -- --maxWorkers=4` at `91678253`: 23,136 tests, 23,022 passed, 114 failed, 0 skipped. The tree was clean afterwards.
    - 113 of the failures are in the 20 files the int baseline triage already lists (session 7fccbbfa `baseline-triage.md`), with the same counts. None of those files is touched by P0-30.
    - The 114th is `tests/publicDocsArtifact.test.ts` (1 case, a typedoc source-link assertion). It fails only in this item's git worktree checkout. It passed at the same commit in a fresh clone, and at `cc063bdac`.
- build, typecheck, typecheck:tests, lint, check:counts, check:docs-drift, check:freeze, check:architecture-boundaries, check:gates, check:schemas, check:api-ref, check:threat-model and check:clean-source all exited 0 at `91678253`.

## Reproduce

```
pnpm install --frozen-lockfile && pnpm run build
npx vitest run tests/mutationBatch.test.ts tests/crypto/keyHistoryMutationGuards.test.ts tests/leaseRevocationConsumers.test.ts tests/studioCredentialBindingHttp.test.ts tests/portalAttribution.test.ts tests/nativeBudgets.test.ts
node scripts/mutation-batch.mjs --batch qualification/2026-10-11-P0-30/mutations.batch.json --out /tmp/mutations.json
```

Run the batch only in a clean clone. It rewrites tracked files while the tests run.
