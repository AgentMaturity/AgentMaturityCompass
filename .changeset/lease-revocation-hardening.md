---
"agent-maturity-compass": major
---

Breaking: `amc lease resign-revocations` now requires `--expect-digest <sha256>`, the SHA-256 of the `revocations.json` bytes the operator reviewed. Under the revocations lock it hashes the list it is about to sign and refuses, signing nothing, when the digest differs or the list is missing; before, it signed whatever the file held at that moment, and signed a new empty list when the file was missing. `resignLeaseRevocationsForCli(workspace, digest)` and `signLeaseRevocations(workspace, digest)` take the digest too, and `signLeaseRevocations` returns the signed bytes. The count it reports comes from those bytes.

- Security: the first-store bootstrap (`amc lease issue`, managed hooks, the demo) publishes only the built-in empty list, and only while neither `revocations.json` nor its signature exists when checked under the lock (new `bootstrapLeaseRevocations`). Before, a list dropped after its unlocked absence check was signed with the auditor key; it is now left unsigned and reported invalid.

- Security: every reader of `revocations.json` and its `.sig` opens them without following a symbolic link and without blocking, and requires a regular file of at most 64 MiB (list) or 64 KiB (signature). A FIFO or a symlink to `/dev/zero` in their place used to block every lease consumer's event loop; any such file, or an oversized one, is now an unverifiable store, so every lease is refused with the reason (for example `revocations.json is not a regular file`).
