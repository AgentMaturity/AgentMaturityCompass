# Session Export (offline-verifiable sessions)

`amc session export <id> --out <file>` writes one sealed native session as a self-contained signed bundle (`amc.session-export`, v1); `amc session verify-export <file> --expect-monitor <sha256>` verifies it on another machine with nothing but the file and a monitor-key fingerprint obtained out of band. Neither needs an anchor or a transparency log; `amc session proof` / `verify-proof` remain the anchored path, and `amc bundle export` the per-diagnostic-run bundle.

## What the bundle carries

- The session's rows exactly as stored (`event_hash`, `writer_sig`, the session envelope in `meta_json`, `payload_sha256`).
- The session lifecycle record with its seal (`session_final_event_hash`, `session_seal_sig`).
- The recomputed root descriptor (the same object `amc session anchor` anchors).
- The monitor public keys the rows were signed with. Keys travel only to locate a signer: the verifier admits one only when its sha256 equals the pinned fingerprint.

Spilled payloads are not embedded. A row's `payload_sha256` is inside its hash pre-image, so the bundle commits to them without carrying them; the verifier checks hashes, not payload bytes.

## What verify-export checks

1. `--expect-monitor` is required and must match one carried key; the carried keys never vouch for themselves (ADR-0007).
2. Every row's hash pre-image recomputes to its `event_hash`, its writer signature verifies against the pinned key, and the per-session envelope chain (sequence and previous hash) is intact. These are the rules of `src/transparency/sessionRootDescriptor.ts`, run against the carried key.
3. The seal names the last row and verifies against the pinned key.
4. The carried descriptor equals, field for field, the one derived from the signed rows alone (`describeSessionRows`): agent and runtime from the signed `session/open` row, the window from the open and close rows' own timestamps, the counts, seal leaves and merkle root recomputed, the session id the bundle's own, the monitor fingerprint the pin. The session begins with `session/open` and ends with `session/close`. The record's lifecycle columns other than the seal are not signed and feed nothing; `amc session anchor` derives its descriptor the same way, so an export carries the descriptor an anchor commits to.
5. `admitKey` applies the operator's trust and distrust lists to the pinned key, so a revoked monitor key fails even when its fingerprint matches.

## Limits

- Only closed (sealed) sessions export; an open or interrupted session is refused (`SESSION_NOT_SEALED`).
- The global `prev_event_hash` chain across sessions cannot be checked from one session's slice and is not claimed; `amc session verify` on the workspace remains the authority for that.
- The verifier runs inside the `amc` CLI; it reads no workspace, but it is not the dependency-free `packages/verifier` (a session-export record type there is deferred).
