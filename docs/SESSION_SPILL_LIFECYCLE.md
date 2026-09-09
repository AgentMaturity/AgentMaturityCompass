# Retained spill lifecycle

AMC keeps an oversized tool result's model-visible preview separate from its retained full output. The lifecycle API inventories, erases, exports, and restores the retained object using authenticated references from session evidence. These operations do not use DSH or Pi components.

The functions are implemented in `src/session/spill/spillLifecycle.ts`. The storage and authentication helpers remain the authority for object framing, signed references, locator/session binding, and ciphertext integrity. This document describes source behavior; it is not an execution or release acceptance receipt.

## Inventory

`inventorySessionSpills({ workspace, events, options? })` accepts evidence rows and returns `ok`, `entries`, `errors`, and `contentVerification: "not-decrypted"`. Supply the complete applicable history, including both `tool/spill-commitment` and `tool/result` rows. Do not filter away references before asking about erasure.

Every declared reference must authenticate under the workspace's monitor trust root. The locator must identify the signed event's session and reference format. Inventory uses one lazy trust snapshot, deduplicates identical references to the same object, and refuses conflicting references or conflicting event identities. Signature/reference errors stop file inspection. Modified objects make the inventory unsuccessful.

Each entry includes its signed reference, locator, referring event/session IDs, and a status: `retained`, `missing`, `unretrievable`, `legacy-plaintext`, or `tampered`. A commitment whose materialization never finished remains visible as a gap. A completed materialization whose final result append failed remains visible through its earlier signed commitment.

Inventory checks encrypted framing and the signed ciphertext digest without decrypting. A locked vault therefore does not prevent ciphertext inventory or transport. This does not prove that a decryption key is available or that plaintext was decrypted successfully; use authenticated spill retrieval for that separate question. Inventory authenticates supplied rows individually. It does not prove that the caller supplied an exhaustive history or replace whole-session chain verification.

## Explicit local erasure

`eraseSessionSpills({ workspace, events, scope, reason, options? })` accepts exact `scope.eventIds` and/or `scope.sessionIds`. The selection is their union. An empty selection, unknown IDs, malformed references, modified objects, or an object still referenced outside that selection is refused. A result and its preceding commitment normally need to be selected together. Selecting the exact session handles that relationship naturally.

The operation writes `SESSION_SPILL_ERASURE_INTENDED` through the existing signed operations audit before unlinking anything. It then deletes only the selected referenced objects and writes `SESSION_SPILL_ERASURE_FINISHED` with exact per-object outcomes. An intention signing failure leaves objects untouched. An outcome signing failure throws, even if an unlink already succeeded, so callers must not report completed audited erasure from that attempt. Large selections that cannot fit their exact outcomes within the operations policy's event limit are refused before deletion; select a smaller batch of exact event IDs.

The return value contains `ok`, per-object outcomes, and the audit event IDs. Missing objects and references already recorded as unretrievable remain distinct from objects removed by this operation. Existing v1 plaintext may be explicitly purged; no automatic rewrite of historical signed references is required.

This API is a hook for an operator or a DSAR fulfillment handler with an independently established subject-to-session mapping. It never infers a person from tool output and does not complete a DSAR request by itself. Its scope is local referenced spill objects. It does not remove signed evidence commitments, unrelated workspace files, unreferenced orphan files, exported bundles, backups, or remote copies. Those copies require their own explicit disposition.

Retention callers must supply all relevant rows and select only eligible expired references. A surviving newer reference must prevent deletion of the shared object. Whether a session is closed and its payloads are old enough is the retention policy caller's responsibility.

## Encrypted export and restore

`exportSessionSpills({ workspace, events, destination, options? })` creates a new destination directory whose parent already exists. It writes `objects/<sha256(locator)>.blob` and publishes `index.json` last. It refuses to overwrite an existing destination. The index records authenticated references, their origins, ciphertext digests, copied object names, and explicit gaps. Legacy v1 plaintext is excluded with a reason. Keys and decrypted output are never included.

`restoreSessionSpills({ workspace, events, source, options? })` reads that directory and independently matches every index entry against the destination's authenticated evidence rows. Restore the relevant signed evidence history before invoking it. The index alone cannot authorize an object or repoint its origin. Each ciphertext is checked against its signed size, digest, framing, key version, plaintext commitment, and locator-derived associated data before publication. Restore uses exclusive creation and cannot overwrite an existing origin object, even with identical bytes.

Restoration reports each object as `restored`, `failed`, `missing`, `unretrievable`, `legacy-excluded`, or `not-in-export`. Its `ok` is true only when every expected reference was restored. A later publication failure can leave an explicitly reported partial restore; it is not a cross-file transaction. Transport keeps at most one object buffer at a time. The index is bounded to prevent unbounded JSON input.

The operator-selected source root or destination parent is canonicalized once. Ordinary filesystem aliases, including macOS temporary-directory aliases and an explicitly selected folder alias, are supported. Below that trusted selection, directories must remain real directories; planted links in `objects/`, symlinked files, hard-linked input files, and path traversal are refused. POSIX transport directories must be owned by the operator and disallow group/other write access. These checks assume the selected private parent is not concurrently replaced by an actor with the operator's own filesystem authority.

Default backups already include `.amc/spill` because their include root is `.amc`, and their archive payload is encrypted by default. This lifecycle work does not claim that backup copies are erased when a local spill is purged.

## Qualification boundary

The companion `tests/spillLifecycle.test.ts` contains authored regressions for signed-reference conflicts, explicit scope, signing-failure ordering, real unlink and persistence, legacy exclusion/purge, keyless ciphertext transport, hostile indices, modified ciphertext, overwrite refusal, selected aliases, and planted links. Those tests were not executed during implementation. Source qualification, installed-package behavior, platform behavior, and a deployed release remain separate acceptance work.
