# Retained-output operator commands

`amc spill` is an operator surface over the existing native spill lifecycle. It
does not introduce another storage format, crypto implementation, signer,
decryption path or recursive deletion tool.

**Qualification:** command implementation, regression source and this guide were
authored against base `249a2a812f2600c53564fa571761aa2cfb80a144` for AMC-1547.
No command, test, build, import, key operation, transport or erasure was executed
for this assignment. These examples describe the implementation contract; they are not a passing-test, installed-package,
platform, deployment or issue-Done receipt.

## Invocation

Every subcommand accepts `--workspace <path>`, `--json`, and
`--expect-monitor <sha256>`. Put these flags after the subcommand. Workspace
defaults to the current directory **when invoked**, not when registered. Help
and registration do not open a workspace. Non-JSON output presents the same
structured fields beneath a human-readable status heading.

Set the following placeholders to the intended existing workspace, an existing
private transport parent, and a monitor fingerprint obtained through a trusted
channel independent of that workspace:

```sh
WORKSPACE='/absolute/existing/workspace'
EXPORT='/private/existing-parent/new-spill-export'
MONITOR_SHA256='REPLACE_WITH_64_LOWERCASE_HEX_CHARACTERS_FROM_OUT_OF_BAND_REVIEW'

amc spill inventory --workspace "$WORKSPACE" --expect-monitor "$MONITOR_SHA256" --json
```

The pin is the existing verifier's SHA-256 fingerprint of the monitor public-key
PEM bytes. Reading a key and accepting its fingerprint from the same potentially
untrusted workspace is **not** independent pinning. The explicit flag overrides
`AMC_EXPECTED_MONITOR_FINGERPRINT`; either effective value must be exactly a
lowercase SHA-256 digest. Without either, the report says
`workspace-consistency-only`, not external authentication.

## Read-only inventory and its boundaries

The command selects the actual sticky backend, opens it with `readOnly: true`,
calls `readAllEvents()`, checks referenced session records, authenticates each
row through the existing keyless native validator, and closes the store in
`finally`. Native inventory then receives the **full** available history, never
a filtered selection. Authenticating even non-spill rows prevents removing a
spill key from unsigned metadata from silently hiding an object.

An explicit `AMC_SESSION_STORE` conflicting with the sticky marker is refused;
unset that override rather than switching stores. Malformed markers, unsupported
backend values, missing selected files, empty event histories, malformed rows,
missing session records and unauthentic rows are refused. A legacy SQLite ledger
can be read without creating a missing marker when there is no JSONL tree.
JSONL without its existing reviewed marker is ambiguous and is refused even if
an unrelated SQLite operations database exists. Restore the correct original
marker/history deliberately; this command never manufactures them.

The workspace root may be an explicitly selected alias; its `.amc`, backend
directories and history files must be real directories/files, not descendant
symlinks. No workspace, schema, marker or key is initialized. Native read-only
SQLite may create WAL coordination sidecars: immutable mode is not substituted,
because that could omit live WAL evidence. This is not a forensic zero-write
filesystem guarantee. JSONL readers acquire no writer lock.

`inspection.entries` groups an object with **all** signed origin event and
session IDs, including paired commitment/result references:

| Status | Meaning and command outcome |
| --- | --- |
| `retained` | Signed encrypted framing, size and ciphertext digest match. Key availability and plaintext are unknown. |
| `missing` | The referenced object is absent. This is a named gap, not a retained object. |
| `unretrievable` | The signed reference records unavailable bytes. No successful recovery is inferred. |
| `legacy-plaintext` | Legacy reference. Native inventory neither reads nor establishes existence of those plaintext bytes. |
| `tampered` | Object integrity or path safety failed. Mutation is refused. |

Missing, unavailable and legacy entries make inventory incomplete and nonzero.
Authentication/conflict errors can produce no entries at all; error records must
not be interpreted as a clean empty inventory. A nonempty authenticated history
with no spill references can legitimately have no inventory entries.

`inspection.contentVerification` is always `not-decrypted` and
`plaintextVerified` is always false. `chainVerification` is `not-performed`:
individual event authentication is not global chain continuity, session-envelope
or seal verification, external completeness attestation, answer quality, or a
claim that deleted rows could not be missing. Keyless inspection does not read
ordinary payload blobs or spill plaintext. All available history is processed
in memory; no bounded-memory or performance qualification is claimed.

Only allowlisted report fields are printed. Tool payloads, raw metadata,
retrieval hints, unavailable-reason text and arbitrary native exception messages
are not echoed. IDs and paths remain useful operational metadata; treat reports
as private. Error reports include a controlled error code and repair example.

## Export and restore

```sh
amc spill export --workspace "$WORKSPACE" --expect-monitor "$MONITOR_SHA256" \
  --out "$EXPORT" --json

amc spill restore --workspace "$WORKSPACE" --expect-monitor "$MONITOR_SHA256" \
  --from "$EXPORT" --json
```

Export calls `exportSessionSpills` with the full source history. `--out` must be
a **new** directory under an existing operator-owned private parent. Native
no-follow, ownership, integrity and exclusive-publication rules are unchanged.
There is no overwrite or plaintext-export flag. The transport contains encrypted
objects plus the native `index.json`; no private keys or decrypted spill bodies
are added. The index still contains signed reference metadata, including native
retrieval hints/unavailable reasons, so protect the bundle as sensitive metadata.

Native `legacy-excluded`, `missing` and `unretrievable` entries remain explicit
in `outcomes`. A completed export with such gaps returns `incomplete` and nonzero
**without deleting the useful transport**. A thrown export error can leave a
partial directory, possibly without an index. Do not assume it is complete or
overwrite it by retrying; inspect it and deliberately choose a new destination.

Restore calls `restoreSessionSpills` with the **destination's existing full
authenticated history**. The index is not an authority to invent events or
admit keys. Restore the appropriate signed history and public trust material
separately through their established procedures; this command cannot bootstrap
an empty destination. Native admission validates matching references, origin
IDs, ciphertext and transport paths before publication. Existing object files
are not overwritten, even if their ciphertext appears identical.

Restore reports exact `restored`, `legacy-excluded`, `missing`, `unretrievable`,
`not-in-export` and `failed` outcomes. Partial/failed restore is nonzero; already
restored objects are not rolled back. Native transport-index and object-size
bounds remain in force. No complete-workspace backup, implicit history import,
decryption, remote backup erasure, or automatic retention is added.

For mutations, `inspection.phase` is `before-operation`. Its inventory is the
earlier snapshot, not a claim about state after restoration/removal. Read
`outcomes` for the actual operation result.

## Deliberately reviewed exact-scope erasure

First quiesce writers, retention and other spill operators through your existing
operational controls. Run a read-only plan using an exact session ID or repeated
exact event IDs. The selectors form an explicit union; there is no implicit
all-workspace selector, wildcard expansion, `--all`, `--force`, or separate
`--dry-run` mode. Planning is the default.

```sh
amc spill erase --workspace "$WORKSPACE" --expect-monitor "$MONITOR_SHA256" \
  --session 'EXACT_SESSION_ID' --reason 'Reviewed local retention request' --json

# Alternatively include EVERY signed origin for the selected object:
amc spill erase --workspace "$WORKSPACE" --expect-monitor "$MONITOR_SHA256" \
  --event 'EXACT_COMMITMENT_EVENT_ID' --event 'EXACT_RESULT_EVENT_ID' \
  --reason 'Reviewed local retention request' --json
```

Unknown IDs, empty scope, scopes selecting no spill objects, and selectors
excluding another signed origin are refused. An event selector naming only the
result does not silently erase a commitment's retained object. Scope IDs must be
nonempty, exact and free of surrounding whitespace/control characters. Duplicate
IDs are deduplicated and sorted; they are never truncated.

`--reason` is mandatory, nonempty, NUL-free, and bounded by the native limit of
2048 JavaScript string code units. Preserve the exact reason between review and
apply. It is sent to native signed auditing, but only `reasonSha256` is printed;
use non-sensitive administrative text, not credentials or tool output.

Review `plan.selectedObjects`, including every origin, native status and the
metadata-only filesystem state, and copy `plan.planSha256` manually only after
that review. `planned-with-gaps` deliberately exits nonzero but still provides a
plan: missing/unavailable/legacy data has not been called complete. Legacy plan
state uses file metadata, never plaintext reads. The same exact scope may still
be deliberately applied after reviewing those gaps.

```sh
amc spill erase --workspace "$WORKSPACE" --expect-monitor "$MONITOR_SHA256" \
  --session 'EXACT_SESSION_ID' --reason 'Reviewed local retention request' \
  --apply --expect-plan 'EXACT_REVIEWED_PLAN_SHA256' --json
```

The apply command reloads full history and recomputes the digest over canonical
workspace/backend, available event/session history, monitor trust, normalized
scope, exact reason digest, native inventory and selected filesystem states.
History, new references, scope, reason, object identity/state or trust changes
can invalidate the review. A mismatch refuses **before** native erase is called.
No plan file, signed event or deletion is produced during planning.

**The digest is an optimistic review check, not a lock, authorization credential,
signature or transaction.** Concurrent changes after its fresh comparison remain
possible, including between object operations. Native lifecycle repeats its
own admission and signs intent/outcome, but does not make the history read and
filesystem mutations atomic. Never pipe a newly generated digest directly into
apply or automatically retry stale/failed mutations. A new review is a deliberate
operator decision, not a retry loop.

On apply, all read handles have closed before `eraseSessionSpills` is entered.
That existing function signs `SESSION_SPILL_ERASURE_INTENDED` before unlink and
`SESSION_SPILL_ERASURE_FINISHED` afterward. `AMC_NO_SIGN=1` is refused at the CLI;
the existing signed operator environment is required. The native audit store is
the workspace **SQLite operations ledger**, even for JSONL session history. The
CLI reports actual returned audit event IDs without inventing or shortening them.

Exact outcomes are `removed`, `missing`, `unretrievable` and `failed`; anything
other than all selected entries removed is reported incomplete/nonzero, even
when native absence is a legitimate outcome. If native intent signing fails,
no success is claimed. If outcome signing throws after unlink, removed files
may already be gone without a final receipt; the CLI reports
`unknown-possibly-partial`, does not invent audit IDs, and does not retry.
`mutationAttempted` means the native operation was entered, not proof that it
changed anything; native preflight can still refuse before writes.

The native prospective audit-payload bound uses
`opsPolicy.retention.maxPayloadBytesPerEvent`. An oversized selection retains the
existing **smaller batch of exact event IDs** remedy. Select fewer complete
locator-origin groups and review each independently; never omit a paired origin
or raise limits blindly. No batching, truncation or audit bypass is performed.

Scope is only the selected **local referenced spill objects**. Evidence rows,
keys, unrelated sessions, unreferenced/orphaned objects, other payload stores,
exports, backups and remote copies are not erased. A local removal is not a
complete DSAR or comprehensive data-erasure attestation.

## Authored regression source and integration handoff

`tests/cliSpillCommands.test.ts` authors real temporary signed SQLite and JSONL
histories, encrypted transport and lifecycle call-through, plus injected fault
paths. It covers read-only admission, keyless/no-plaintext reports, paired
origins, explicit gaps, stale plans and audit failures. Semantic cases use the
real lifecycle; faults/output observation use spied seams. Synthetic fixture
keys, file publication and unlink exist only inside test source and have not
been executed for this assignment.

For authenticated, bounded reads of the retained bytes, use
`amc session spill-read <locator>`; see
[the native lifecycle guide](SESSION_SPILL_LIFECYCLE.md). Inventory and transport
remain keyless and do not establish that plaintext can be recovered.
