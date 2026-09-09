# Installed public retained-output acceptance helper

## Preserved first execution and protocol correction — 2026-09-09

The initial helper at `b9a8f39e09c146c2a9adb869443bc273308ce121` was followed by
an explicitly authorized fresh local installed attempt. It is **unqualified**:
the scripted successful response omitted required usage, and neither backend's
capture reached a completed tool result. The directly inspected JSONL history
records `AMC_LLM_STREAM_USAGE_MISSING`. The first attempt's retained receipts
are under `attempt-01/`; later cases were not reached and are not passing results.

The narrow correction adds fixed usage values to the scripted wire response and
labels them `synthetic-protocol-fixture-input-not-measured` in worker receipts
and exchange transcripts. These numbers are programmed protocol inputs, not
measured model tokens, savings, spend or a real-provider result. AMC's mandatory
usage validation is not changed or bypassed. Any corrected execution needs new
helper pins and a fresh consumer, with the original failed attempt retained.

## Status and scope

This directory contains source preparation for AMC-1547, pinned to
`a5987643ef6c26b01f687226fbc6a6709fc182cb`. The helper was authored and text-reviewed;
the initial authoring checkpoint did not assert execution. A later execution must have its
own immutable configuration, command logs, process-closure receipts and final
disposition. Neither the existing source gate nor a previous private-package
smoke establishes this lane's result.

The initial assignment was author-only. The user's subsequent execution handoff
transferred program execution to Chat on Steroids, with Codex monitoring only.
The root ownership manifest records that transfer. It does not remove source
review, explicit execution opt-in, erasure review, cleanup or public-release
confirmation gates.

`run.py` installs a caller-pinned **local tarball into a new private consumer**.
Its native worker imports only `agent-maturity-compass/sdk/native` and the root
`agent-maturity-compass` public export. It drives a real installed ACP subprocess
and the governed native `fs.read` implementation against generated UTF-8 files.
A loopback HTTP server sends openly scripted provider-wire responses. It is not
a model inference, coding-quality, token-usage, spend or human-usability study.

There is no source `tsx`, unexported `dist` import, copied session store, raw SQL,
hand-authored signed event, full-suite launch, package publish or deployment.
Filesystem reads and reversible mutations observe only this run's generated
fixtures and retained ciphertext; the actual lifecycle/read operations remain
the installed public CLI/API's responsibility.

## Finite scenario groups

These are planned groups, not measured passing results. One install is shared by
the explicitly selected fresh backend fixtures; the groups below do not loop or
retry a completed case.

| Group | Exercised boundary | Required evidence / limitation |
|---|---|---|
| `installed-boundary` | Exact Node/npm, new local-tarball install and installed public export/CLI identity | Supplied hashes, actual versions, package metadata, new lockfile and supervised process receipts. Install exit zero alone is not retained-output acceptance. |
| `native-retention` | Generated A and B files read through separate real native sessions | SDK tool identity and completed tool-result updates, unchanged fixture digests, preview on the provider wire, then separate cold native CLI verification. SQLite also preserves actual commitment/result rows and completion metadata. |
| `inventory-and-origins` | Selected-backend full-history inventory | Explicit backend, authenticated references, paired origin IDs and retained ciphertext. Inventory deliberately reports no plaintext or whole-chain verification. |
| `bounded-public-reads` | Installed CLI head, interior, tail and EOF ranges; SQLite public API complete pagination and invalid bounds | Exact base64-decoded bytes, independently generated content digest, offsets/next offsets and origin IDs. JSONL public API is explicitly blocked as described below; its CLI ranges still execute. |
| `encrypted-export` | Native ciphertext export to a new directory | Actual ciphertext digests, native outcome fields, index and only the named encrypted object files. No keys or plaintext in this transport. |
| `refused-overwrite` | Restore when destination objects already exist | Nonzero structured refusal/failure outcomes and unchanged object digests; no overwrite or automatic retry. |
| `tamper-and-missing` | A single owned ciphertext-byte mutation, then absent owned objects | Native inventory and CLI read refusals, original/mutated hashes and quarantined bytes. Restoration is forbidden after unconfirmed closure. Missing content stays incomplete/nonzero. |
| `existing-history-restore` | Native restore of missing objects against the destination's unchanged authenticated history | Original ciphertext digests restored, unchanged pre-operation history binding, then exact CLI plaintext bytes. This does not bootstrap an empty destination or import history. |
| `reviewed-erasure` | Partial paired-origin refusal, reason-bound stale-plan refusal, separately reviewed exact-session apply and preservation of B | Structured no-mutation refusals; explicit external approval document; native audit IDs and actual audit rows; A becomes a visible missing-content gap, B remains readable. Exports and quarantined originals intentionally remain outside erasure scope. |

### Public JSONL API limitation

At the pinned source, `readSessionSpillRange` requires complete genuine
`EvidenceEvent[]` input. The inspected root export `openLedger(...,
{readonly: true}).getAllEvents()` supplies SQLite rows, not JSONL session
history. No public complete JSONL history loader was found in the inspected
package exports. Using the JSONL workspace's SQLite operations ledger as its
session history would manufacture completeness.

The worker therefore returns exit **3**, verdict `blocked`, code
`PUBLIC_JSONL_HISTORY_LOADER_UNAVAILABLE` for the JSONL API case. The native
backend-aware CLI remains usable for that fixture. Any requested run including
this API gap has aggregate `qualified: false` and exits nonzero, even when its
other individual groups pass. This is not a claim that the API cannot accept
genuine JSONL-origin rows supplied through some separately reviewed producer.
No internal loader or hand-built replacement is substituted here.

## Exact input contract

Use a reviewed Python 3 interpreter with only its standard library. The script
itself and all paths below are absolute and normalized. Symlink components and
multiply linked input files are refused. Paths on macOS must use their actual
canonical spelling (for example `/private/tmp`, not the `/tmp` alias).

The config file is a private, caller-owned regular file of at most 65,536 bytes.
Its top-level keys must exactly match this template. Placeholder strings are
intentionally invalid; obtain every digest/version from the real reviewed
inputs, not from this example.

```json
{
  "schemaVersion": 1,
  "allowExecution": true,
  "source": "a5987643ef6c26b01f687226fbc6a6709fc182cb",
  "sourceReceipt": {
    "path": "/absolute/source-receipt.json",
    "sha256": "<actual-64-lowercase-hex>"
  },
  "tarball": {
    "path": "/absolute/immutable-candidate.tgz",
    "sha256": "<actual-64-lowercase-hex>",
    "bytes": 0
  },
  "node": {
    "path": "/absolute/actual-node-binary",
    "sha256": "<actual-64-lowercase-hex>",
    "version": "<exact-v22.x.y>"
  },
  "npm": {
    "path": "/absolute/npm/bin/npm-cli.js",
    "sha256": "<actual-64-lowercase-hex>",
    "version": "<exact-x.y.z>"
  },
  "cliSha256": "<actual-installed-cli-64-lowercase-hex>",
  "supervisor": {
    "path": "/absolute/reviewed/attempt-3/runner.py",
    "sha256": "<actual-reviewed-supervisor-64-lowercase-hex>"
  },
  "native": {
    "path": "/absolute/reviewed/native-case.mjs",
    "sha256": "<actual-helper-64-lowercase-hex>"
  },
  "runnerSha256": "<actual-reviewed-run.py-64-lowercase-hex>",
  "root": "/absolute/private-parent/new-installed-spill-run",
  "backends": ["sqlite", "jsonl"],
  "nodePlatform": "darwin",
  "nodeArch": "arm64",
  "allowInstallScripts": true,
  "installTimeoutSeconds": 600,
  "commandTimeoutSeconds": 120,
  "reviewTimeoutSeconds": 300
}
```

The `root` must **not exist**. Its existing parent must be caller-owned, private
(no group/other permission bits), a real directory and free of symlink
components. All input files, including the config, must be outside `root`.
The runner creates the consumer, receipts, commands and input copies itself.
An old root, even a failed one, is never adopted or cleaned up for reuse.

`backends` is exactly `["sqlite"]`, `["jsonl"]`, or `["sqlite", "jsonl"]`.
`nodePlatform` is `darwin` or `linux`; `nodeArch` is `arm64` or `x64`. These are
declared execution inputs, not a claim that all combinations were qualified.
Node must have an exact `v22.x.y` version; npm must have an exact `x.y.z` version.
The worker checks the actual platform, architecture, binary path and digest.
The runner checks actual version-command output and retains it.

Timeout values are positive integers: install at most 900 seconds, each normal
command at most 180 seconds, and separate erasure review at most 600 seconds.
These are safety configuration limits, not measured completion durations.
Native dependency install scripts require `allowInstallScripts: true`; there
is no registry token or other inherited credential. Registry downloads and
install-script network effects remain possible within that explicit local
installation scope. The resulting lockfile is retained rather than pretending
the consumer's transitive resolution was a previously frozen source install.

The pinned source receipt must contain matching `source`, `finalHead`,
`artifact.sha256`, `artifact.bytes`, `artifact.cliSha256`, and
`allObservedCommandProcessesClosed: true`. The existing candidate receipt is
[installed-candidate-a598/source.json](../2026-09-09-phase-a-acceptance/installed-candidate-a598/source.json).
The supplied receipt's digest is caller-reviewed provenance; hashing it does
not independently attest a reproducible build or an external publisher.

Run only after source and pins have been reviewed:

```text
/absolute/reviewed/python3 /absolute/reviewed/run.py --config /absolute/private-config.json --execute
```

Without `--execute`, argument parsing refuses execution before creating files.
There is no implicit source-build, default Node/npm executable, source fallback,
resume-existing-consumer flag, retries, full gate, commit or publish command.

## Supervision and lifecycle

The caller supplies the hash-pinned
[attempt-3 supervisor](../2026-09-09-phase-a-acceptance/attempt-3/runner.py).
The runner copies it into its private input directory and imports it only
after execution opt-in and pin checks. It calls only `supervised`, sets its
receipt directory and uses its signal handler. It never calls that module's
`main`, metadata runner, full suite or release gate.

That reviewed supervisor creates an owned process group, samples process
identity/ancestry, reaps its direct child and records bounded cleanup. Its
`confirmedClosed` result describes observed processes, not kernel containment
or a proof against every unobserved reparenting/PID race. The worker separately
closes its real SDK child and owned loopback endpoint. Missing or unconfirmed
closure latches a stop: no new CLI, worker, mutation or fixture restoration.
Preserved bytes and raw failure receipts are preferable to a cleanup claim
without evidence.

Commands have time bounds, but the reused supervisor does not impose a live
log-byte quota. CLI JSON is parsed as one whole output document, with a bounded
post-exit read, rather than extracting a plausible final fragment from mixed
failure output. Unexpected diagnostics or malformed JSON therefore leave the
scenario unqualified, with the complete raw log retained.

Every spawned command receives an explicit clean environment: private HOME,
temporary/cache/config directories, empty user/global npm configs, a narrow
PATH and selected non-secret settings. It does not inherit `NODE_OPTIONS`,
`NODE_PATH`, provider credentials, registry tokens, or unsigned mode. The SDK
inherits only that already-clean worker environment. A generated disposable
vault passphrase is retained in the backend's mode-0600
`fixture-secret.private.json` for later local inspection. The capture worker
alone receives a visibly synthetic provider credential, accepted only by its
owned loopback endpoint. No production workspace or secret is used.

## Separate erasure review

The runner first proves partial-origin and stale-reason refusals. It then writes
`<root>/<backend>/erase-review-request.json`, containing the actual native plan,
its exact source/workspace/session/digest binding and the required approval
object. It prints that path and checks for a **new**, separately supplied
`erase-approval.json` during the configured finite review window.

The reviewer must inspect the named native plan, verify it selects only A's
owned local object with all paired origins, and verify B and retained exports
are outside scope. Only after that separate inspection may the reviewer write
the exact `requiredApproval` JSON object as a private, caller-owned regular
file at the supplied approval path. Do not pipe an unread plan into an apply
command or auto-create approval from within the runner. An authorized execution
agent may perform this separate review, but it must not describe it as a human
participant or an authenticated human approval.

The approval document is a local review assertion, not an authenticated identity
credential. It must match the nonce and all supplied fields exactly. Its
original bytes are preserved before apply. Missing approval means a blocked,
nonzero result and no erasure; it does not authorize a later reuse of the
consumer. The native apply recomputes the plan digest and still may refuse a
concurrent change. A matching digest is optimistic review, not a lock or a
transaction. Keep the owned fixture quiescent.

## Receipts and interpretation

`receipts/receipt.json` is the evolving disposition: exact config and pins,
source, named groups, actual check booleans, failures, unknown/unreached cases,
blockers, command references, recorded timestamps and observed cleanup. It is
updated in place; a killed write may leave it incomplete. Immutable per-command
logs and process receipts remain the primary recovery record. Initialization
failures after the receipt directory exists are explicitly recorded; preflight
refusals produce a nonzero error without adopting any existing directory.

`commands/*-process.json` and `commands/*.log` retain actual argv, exits, observed
process identities, timeout/signal/cleanup outcomes and output from the reviewed
supervisor. No zero exit alone makes a group pass. `qualified: true` requires
every requested group to have executed and passed, no failure/blocker, and
confirmed observed closure. Unknown, malformed, incomplete, blocked or failed
work stays unqualified/nonzero. Unsupported requested JSONL API input is not
turned into a pass by acknowledging that it is unsupported.

Worker receipt directories retain actual public module resolution and hashes,
SDK results, wire request/response files, SQLite event rows, native origin
observations, API pages and exact refused bounds where applicable. Ciphertext
snapshots, mutation/quarantine records, transport digests, native CLI JSON,
review requests and approval bytes are separate artifacts. These distinguish
signed row observation, native authentication, ciphertext integrity, plaintext
recovery and process closure instead of blending them into a single claim.

The actual erasure intention/finished rows are read through public `openLedger`
from the operations SQLite ledger, including in a JSONL fixture. Their presence,
order and non-unsigned signature bytes are checked. **Post-erasure independent
cryptographic audit verification is not performed by this helper.** The earlier
cold native verifier and later reference-authenticating CLI inventory are
separate evidence; neither is relabelled as a new complete post-erasure audit.

Keep generated secret files, vaults, raw private workspaces and key material
local; do not commit or publish the entire consumer. A durable public receipt
mirror must deliberately select safe logs/metadata and describe omitted private
inputs, rather than copying fixture secrets into the repository.

## Explicit non-claims and exclusions

The locally observed pre-run monitor fingerprint establishes same-workspace key
consistency. A native field named `anchored` does not make that pin independent
of the workspace or prove external authorship. Range verification authenticates
supplied references and the full object's bytes before slicing, not a whole
log or streaming-memory bound. Inventory/export do not decrypt plaintext.

This helper does not qualify empty-destination history bootstrap, full backup,
JSONL automatic retention, DSAR subject mapping, remote/export-copy deletion,
key rotation, production credentials, cross-platform portability, human first
use, real-provider quality, public release or live deployment. Legacy v1
plaintext, deliberately unavailable keys, malicious transport indexes,
filesystem-link attacks, concurrent writers and crash-at-every-boundary testing
are not installed scenarios here. Their source-only or historical tests remain
separate records and are not silently adopted. Existing completed mutation
lanes must not be rerun merely to accompany this helper.

## Source review anchors

The reviewed path is rooted in the actual package exports and
`src/sdk/nativeAgentClient.ts`, `src/cli-spill-commands.ts`,
`src/cli-session-spill-read-command.ts`, `src/session/spill/spillRead.ts`,
`src/session/spill/spillLifecycle.ts`, `src/session/spill/spillStore.ts`,
`src/session/sessionService.ts`, `src/agent/pipelineToolSeam.ts`,
`src/tools/builtin/fsTools.ts`, and `src/ops/audit.ts` at the named pin.
Operator semantics are documented in `docs/SESSION_SPILL_COMMANDS.md` and
`docs/SESSION_SPILL_LIFECYCLE.md`. The original finite assignment and current
ownership transfer are retained in the root task/manifest; the resumable local
state is `AMC_OS/INBOX/REV_QA_LEAD.md` in the authoring worktree.
