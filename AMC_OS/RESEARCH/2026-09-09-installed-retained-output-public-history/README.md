# Installed retained output through public persisted history

Task: `installed-retained-output-public-history-batch`, AMC-1547 / AMC-1505.
This is a new helper and new run, not a modification or retry of a598 attempts.
Runtime pin: `130c2d0087cf574016411fdc7d91067d3eddd637`. The prior metadata-only
package smoke and 193-test source receipt keep their original scope.

## Implementation

The helper adapts the separately preserved installed-spill-acceptance runner.
It still executes real installed CLI/ACP/native `fs.read` operations on generated
private files through an openly scripted loopback Responses transport. Synthetic
usage inputs remain explicit; runtime accounting is neither disabled nor widened.

Both public package entrypoints load genuine complete selected-store history:
`agent-maturity-compass` and `agent-maturity-compass/sdk/native`. Their snapshots
must agree. The full workspace history, not a filtered subset, is passed to
public retained-output APIs. Native session identity, sealed head and history
digest are saved separately for later unchanged-history checks. No fabricated
rows, internal imports or operations-SQLite substitution supply JSONL history.

Independent per-session ACP lifetimes preserve JSONL's single-writer rule.
Cold reading does not grant JSONL writer resume. Metadata verification does not
read payloads or decrypt spills. A separate passphrase-free process must load
metadata and inspect ciphertext while refusing plaintext, wrong pins and identities.

Public CLI scenarios cover inventory, head/interior/tail/EOF ranges, encrypted
transport, refusal to overwrite, altered ciphertext, missing objects, restoration
against existing signed destination history, partial-scope/stale-plan refusals
and independently reviewed exact-session erasure. Public APIs additionally cover
complete pagination, invalid bounds, ciphertext inventory/export and post-erasure
native chain verification. After erasure both native sessions are cold-verified
again; the removed content must remain a visible gap, not a completeness claim.
Signed history must retain its pre-operation digest and head. Only operation
audits are read from operations SQLite, explicitly as audits, never JSONL history.

## Inputs and opt-in

`run.py --config /absolute/private-config.json --execute` is the only entrypoint.
No default execution, old-root resume, test loop, publish or deployment exists.
The config has exactly these keys (all digests must be measured from actual files):

```json
{
  "schemaVersion": 1,
  "allowExecution": true,
  "source": "130c2d0087cf574016411fdc7d91067d3eddd637",
  "sourceReceipt": {"path": "/absolute/source.json", "sha256": "REPLACE"},
  "tarball": {"path": "/absolute/candidate.tgz", "sha256": "REPLACE", "bytes": 0},
  "node": {"path": "/absolute/node", "sha256": "REPLACE", "version": "REPLACE"},
  "npm": {"path": "/absolute/npm-cli.js", "sha256": "REPLACE", "version": "REPLACE"},
  "cliSha256": "REPLACE",
  "supervisor": {"path": "/absolute/reviewed-supervisor.py", "sha256": "REPLACE"},
  "native": {"path": "/absolute/native-case.mjs", "sha256": "REPLACE"},
  "runnerSha256": "REPLACE",
  "root": "/absolute/private-parent/new-run",
  "backends": ["sqlite", "jsonl"],
  "nodePlatform": "darwin",
  "nodeArch": "arm64",
  "allowInstallScripts": true,
  "installTimeoutSeconds": 600,
  "commandTimeoutSeconds": 120,
  "reviewTimeoutSeconds": 600
}
```

Placeholders above deliberately fail validation. Exact reviewed Node versions in
majors 22, 24 or 25 are accepted, with actual binary digest/version/platform/arch
checked on every worker start; this is not qualification of all those runtimes.
The source receipt must bind `source`, `finalHead`, `artifact.sha256`,
`artifact.bytes`, `artifact.cliSha256`, and observed build-process closure.
Its provenance must name the fresh pinned clone and actual build/package commands.
Local `npm pack --ignore-scripts` is permitted for this scoped exercise only;
it skips prepack/release gates and must never be reported as passing either gate.

The new output root must not exist, and its parent must be private and owned.
Inputs are regular single-link files with canonical paths and reviewed hashes.
Each spawned process gets a clean environment, private HOME/cache and only
disposable fixture secrets. No inherited provider or registry credentials.
Consumer dependency resolution and lockfile are retained as actual package inputs.

## Separate erasure review

The runner writes `<root>/<backend>/erase-review-request.json` and waits within
the configured finite window. No approval is created by the runner. The execution
agent must independently read the exact proposal and native plan, inspect the
session, paired origin IDs, locator, reason and plan digest, confirm B and retained
transports remain outside scope, then write the exact required approval object
as a new private `erase-approval.json`. This is a separate agent review step,
not independent human approval or external cryptographic authorization.

The installed native CLI recomputes the plan before apply. A stale digest or
partial reference scope must refuse before mutation. Only A's local object is
removed. Exports, fixture text, signed history and quarantined originals remain.
No arbitrary cleanup command, other workspace or recursive data deletion exists.

## Evidence and supervision

The reviewed attempt-3 supervisor's `supervised` function is hash-pinned and
reused; its historical gate `main` is never called. Per-command logs/process
identities, endpoint/SDK closure, failed and unreached groups are retained.
Unconfirmed closure stops all later launches, mutations and fixture restoration.
The supervisor samples observed ancestry; it is not kernel containment.

`receipts/receipt.json` reports the actual result. Qualification requires every
requested group and check plus observed process closure. A zero install or a
passing source suite alone is insufficient. Ciphertext mutation/reset and
missing-object quarantine are explicit owned-fixture operations, not unreported
repair. Any failed new run must keep a distinct immutable identity.

Raw workspaces, secrets, vaults, key material, wire transcripts and plaintext
pages remain private. Commit only deliberately selected metadata, checks and
closure summaries. The pre-run monitor is a local fixture pin, not an externally
independent trust anchor. No real model, human, full-suite/release-gate, platform
breadth, backup/DSAR, remote-copy erasure, production-key, publish, deployment or
comparative-superiority claim follows from this exercise.
