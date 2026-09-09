# Retained spill lifecycle

AMC keeps an oversized tool result's model-visible preview separate from its retained full output. The lifecycle API inventories, erases, exports, and restores the retained object using authenticated references from session evidence. These operations do not use DSH or Pi components.

The functions are implemented in `src/session/spill/spillLifecycle.ts`. The storage and authentication helpers remain the authority for object framing, signed references, locator/session binding, and ciphertext integrity. This document describes source behavior; it is not an execution or release acceptance receipt.

## Native session writes and keys

`SessionService.recordToolResult` prepares an encrypted v2 object in memory, then synchronously appends a signed `tool/spill-commitment` event before allowing the object to be created. The commitment has no model-visible surface operation. Its signed metadata binds the full-output digest, ciphertext digest and size, key version, and session locator. Only after this event succeeds does storage publish the object; the normal `tool/result` records the preview and actual retention outcome.

A commitment append failure creates no spill object. If the append committed but its caller lost the result, the signed reference can remain as an explicit missing object. If object publication succeeds but the later result append fails, the earlier commitment still identifies the retained object. These are visible failure states, not a transaction across the ledger and filesystem.

New retained output uses the existing AMC blob envelope and versioned workspace key, authenticated by the signed current-key metadata and signed operations policy. Spill does not provision or rotate a key, accept the legacy unvaulted key, use `AMC_NO_SIGN`, or fall back to plaintext. A key or policy preparation failure can produce an explicitly unretrievable preview when the ordinary signed result path remains available. If the vault or signing path is unavailable too, the result write itself can fail; a preview is not guaranteed in that state. Ordinary ledger blob key provisioning is unchanged.

Objects use exclusive private-file creation and full-write/fsync handling. Retrieval authenticates the signed reference before reading, verifies the encrypted envelope, and decrypts with the exact historical key version and locator-bound associated data. A missing historical key is reported as `key-unavailable` without replacement key creation. Historical v1 plaintext objects remain explicitly readable; no new v1 objects or automatic migration are introduced.

## Inventory

To read an omitted section, copy its complete locator from the preview or inventory:

```text
amc session spill-read <locator> --offset 0 --limit 4096
amc session spill-read <locator> --offset 4096 --limit 4096 --json
```

Use `--workspace <path>` for the originating workspace and `--expect-monitor <sha256>` to pin a fingerprint obtained independently. The command opens the selected SQLite or JSONL session store read-only, authenticates the supplied history's spill references, and verifies and decrypts the complete selected object before returning a bounded byte range. Missing history, missing objects, tampering and unavailable keys refuse the read. A conflicting backend environment or malformed backend marker is refused. It never initializes a workspace, provisions a key, or writes a plaintext copy.

The public `readSessionSpillRange` API returns exact range bytes as base64, the signed full-content digest, origin IDs, total/returned byte counts and the next offset. One read returns at most 16,384 bytes; the default is 4,096. These are configured limits, not performance measurements. Offsets are bytes, so a range may split a UTF-8 character. The human display decodes text with escaped terminal controls; JSON base64 preserves exact bytes. The implementation decrypts the full object in memory; it is not streaming decryption. Reading through this operator command does not add an automatic model retrieval tool or replace whole-session verification. Locally consistent, unpinned monitor identity remains explicitly unanchored.

`inventorySessionSpills({ workspace, events, options? })` accepts evidence rows and returns `ok`, `entries`, `errors`, and `contentVerification: "not-decrypted"`. Supply the complete applicable history, including both `tool/spill-commitment` and `tool/result` rows. Do not filter away references before asking about erasure.

Every declared reference must authenticate under the workspace's monitor trust root. The locator must identify the signed event's session and reference format. Inventory uses one lazy trust snapshot, deduplicates identical references to the same object, and refuses conflicting references or conflicting event identities. Signature/reference errors stop file inspection. Modified objects make the inventory unsuccessful.

`inventorySessionSpillReferences` exposes that same authentication and conflict collection without opening any retained object. The bounded reader uses it to authenticate all supplied references, then reads only the selected object. A corrupt unrelated object does not cause an unrelated page read to scan or fail on its ciphertext; an unauthentic supplied reference still refuses the operation. Full lifecycle inventory continues to inspect all its referenced objects.

Each entry includes its signed reference, locator, referring event/session IDs, and a status: `retained`, `missing`, `unretrievable`, `legacy-plaintext`, or `tampered`. A commitment whose materialization never finished remains visible as a gap. A completed materialization whose final result append failed remains visible through its earlier signed commitment.

Inventory checks encrypted framing and the signed ciphertext digest without decrypting. A locked vault therefore does not prevent ciphertext inventory or transport. This does not prove that a decryption key is available or that plaintext was decrypted successfully; use authenticated spill retrieval for that separate question. Inventory authenticates supplied rows individually. It does not prove that the caller supplied an exhaustive history or replace whole-session chain verification.

## Explicit local erasure

`eraseSessionSpills({ workspace, events, scope, reason, options? })` accepts exact `scope.eventIds` and/or `scope.sessionIds`. The selection is their union. An empty selection, unknown IDs, malformed references, modified objects, or an object still referenced outside that selection is refused. A result and its preceding commitment normally need to be selected together. Selecting the exact session handles that relationship naturally.

The operation writes `SESSION_SPILL_ERASURE_INTENDED` through the existing signed operations audit before unlinking anything. It then deletes only the selected referenced objects and writes `SESSION_SPILL_ERASURE_FINISHED` with exact per-object outcomes. An intention signing failure leaves objects untouched. An outcome signing failure throws, even if an unlink already succeeded, so callers must not report completed audited erasure from that attempt. Large selections that cannot fit their exact outcomes within the operations policy's event limit are refused before deletion; select a smaller batch of exact event IDs.

The return value contains `ok`, per-object outcomes, and the audit event IDs. Missing objects and references already recorded as unretrievable remain distinct from objects removed by this operation. Existing v1 plaintext may be explicitly purged; no automatic rewrite of historical signed references is required.

This API is a hook for an operator or a DSAR fulfillment handler with an independently established subject-to-session mapping. It never infers a person from tool output and does not complete a DSAR request by itself. Its scope is local referenced spill objects. It does not remove signed evidence commitments, unrelated workspace files, unreferenced orphan files, exported bundles, backups, or remote copies. Those copies require their own explicit disposition.

Retention callers must supply all relevant rows and select only eligible expired references. A surviving newer reference must prevent deletion of the shared object. Whether a session is closed and its payloads are old enough is the retention policy caller's responsibility.

The existing SQLite operations-retention path now inventories all ledger spill references. It removes an object only when every referring event is older than the pruning cutoff and has a pruned payload (or is the payload-free precommitment), and every referring session's final row is an authentic, expired `session/close`. Active sessions, recent closes, and surviving newer references keep their objects. Erasure processes one locator and all its reference IDs per signed audit operation, so a growing backlog does not become one oversized outcome payload. `prunedSpillCount` counts actual removals. Dry runs do not erase objects. Existing ordinary payload pruning runs separately before spill handling; a spill failure does not roll those earlier operations back. This integration does not add automatic retention for the JSONL session backend.

## Encrypted export and restore

`exportSessionSpills({ workspace, events, destination, options? })` creates a new destination directory whose parent already exists. It writes `objects/<sha256(locator)>.blob` and publishes `index.json` last. It refuses to overwrite an existing destination. The index records authenticated references, their origins, ciphertext digests, copied object names, and explicit gaps. Legacy v1 plaintext is excluded with a reason. Keys and decrypted output are never included.

`restoreSessionSpills({ workspace, events, source, options? })` reads that directory and independently matches every index entry against the destination's authenticated evidence rows. Restore the relevant signed evidence history before invoking it. The index alone cannot authorize an object or repoint its origin. Each ciphertext is checked against its signed size, digest, framing, key version, plaintext commitment, and locator-derived associated data before publication. Restore uses exclusive creation and cannot overwrite an existing origin object, even with identical bytes.

Restoration reports each object as `restored`, `failed`, `missing`, `unretrievable`, `legacy-excluded`, or `not-in-export`. Its `ok` is true only when every expected reference was restored. A later publication failure can leave an explicitly reported partial restore; it is not a cross-file transaction. Transport keeps at most one object buffer at a time. The index is bounded to prevent unbounded JSON input.

The operator-selected source root or destination parent is canonicalized once. Ordinary filesystem aliases, including macOS temporary-directory aliases and an explicitly selected folder alias, are supported. Below that trusted selection, directories must remain real directories; planted links in `objects/`, symlinked files, hard-linked input files, and path traversal are refused. POSIX transport directories must be owned by the operator and disallow group/other write access. These checks assume the selected private parent is not concurrently replaced by an actor with the operator's own filesystem authority.

Default backups already include `.amc/spill` because their include root is `.amc`, and their archive payload is encrypted by default. This lifecycle work does not claim that backup copies are erased when a local spill is purged.

Evidence bundles now include the authenticated ciphertext transport under `evidence/spill`, covered by the bundle manifest. Verification restores it into the temporary verification workspace after restoring its signed rows and public trust history. Malformed or modified objects fail verification; named missing, unretrievable, legacy-excluded, or absent-transport cases remain explicit gaps. `retainedSpills.objectsComplete` reports ciphertext completeness separately from the bundle's other verification results, while `retainedSpills.plaintextVerified` is always `false` for this keyless transport path. A valid bundle with a missing retained object therefore does not claim complete retained output. Old bundles without a spill index report their affected references as gaps.

## Qualification boundary

The companion `tests/spillLifecycle.test.ts` contains authored regressions for signed-reference conflicts, explicit scope, signing-failure ordering, real unlink and persistence, legacy exclusion/purge, keyless ciphertext transport, hostile indices, modified ciphertext, overwrite refusal, selected aliases, and planted links. Those tests were not executed during implementation. Source qualification, installed-package behavior, platform behavior, and a deployed release remain separate acceptance work.
